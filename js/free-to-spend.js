import { getAll, getSetting } from './db.js';
import { bankBalance, cardBillDue, cardOwedThisCycle, cardPosition, statementDay, afterKnownBalance, isEverydayBank, isPutAway } from './account-metrics.js';
import { nextOccurrence, isoLocal, frequencyOf, monthlyAmountOf } from './frequency.js';
import { isLiveCommitment, commitmentDueInWindow, paidAround, commitmentMatcher, matchWords } from './commitments.js';
import { looksLikeCardPayment } from './transfers.js';
import { findDuplicates } from './duplicates.js';
import { isLoanAccount, loanCommitment, loanPosition, assignLoanPayments } from './loans.js';
import { isPfAccount, pfPosition } from './pf.js';
import { businessPlan, businessMonth } from './business.js';

// THE RULE - how much you can spend this cycle (26th to 25th, the cards'
// statement day).
//
//   Budget this cycle = monthly income: the salary (or pension, or household
//                       money); for a business owner, the lowest of the last
//                       three months taken home from the business (js/business.js)
//                     − every fixed commitment paid from the bank or a card
//                     − what you save each month
//   Spent this cycle  = card spends since the last statement day (refunds and
//                       cashback taken off) + bank spends (UPI and the rest)
//                     − payments that are one of the fixed commitments
//   Left to spend     = budget − spent
//
// The money in the bank never adds to the budget: each cycle lives on its
// salary, so spending the budget still leaves next month's salary for next
// month. Cash commitments come out of the ATM withdrawal and aren't counted
// twice; card bill payments, transfers and the salary are never "spending".
//
// Not spending, ever: a loan EMI (debt coming down), money sent that came
// back (same UPI ID, same amount, within 45 days), and anything leaving an
// account you keep for savings or a loan rather than for spending
// (isPutAway in account-metrics.js) - opening an FD from it, say.
//
// Separately, a bank check that never raises the budget: what the bank still
// has to pay before payday, and the balance after the next salary once the
// card bills and next month's commitments are paid. It is worked out on the
// accounts you spend from; money put away is shown beside it, never in it.
//
// A business's own accounts stand apart from all of this: what they pay out
// is the business's, never the house's, and the business is shown on its own.
//
// Every line is returned so the screen can show the sum, not just its answer.

const DAY_MS = 86400000;
const SALARY_EARLY_DAYS = 7;
const SALARY_LATE_DAYS = 5;
// Saved each month (stored as "keepInBank"), unless changed on Plan: ₹10,000.
export const DEFAULT_KEEP_IN_BANK = 1000000;

function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoLocal(new Date(y, m - 1, d + delta));
}

function dateOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// The latest payday on or before `iso`, with the day clamped to short months.
function paydayOnOrBefore(dayOfMonth, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const clamp = (year, monthIndex) => Math.min(dayOfMonth, new Date(year, monthIndex + 1, 0).getDate());
  if (clamp(y, m - 1) <= d) return isoLocal(new Date(y, m - 1, clamp(y, m - 1)));
  return isoLocal(new Date(y, m - 2, clamp(y, m - 2)));
}

// The UPI ID in a bank narration ("UPI-NAME-name@okaxis-..."), which is the
// same on money you send someone and money they send back. HDFC separates the
// narration's fields with "-", so the ID stops at one; otherwise the name in
// front of it, which the bank may word differently each way, would be read
// as part of the ID and the two would never match.
function upiIdOf(t) {
  const m = /([a-z0-9._]+@[a-z]{2,})/i.exec(t.rawDescription || '');
  return m ? m[1].toLowerCase() : null;
}

// Payments that came back. ₹20,000 sent to someone on the 1st and ₹20,000
// from them on the 9th is money lent and returned, not spent, so the payment
// drops out of spending once the money is back.
//
// Deliberately narrow, because cancelling a real payment would hide spending:
// the same account, the same amount to the paisa, the same UPI ID, and back
// within 45 days. Each credit cancels one payment only. A refund that doesn't
// fit - a different amount, a bank transfer with no UPI ID - still counts as
// spent, and can be marked as a transfer in History.
function paidBack(debits, transactions, today) {
  const credits = transactions.filter((t) => t.direction === 'credit' && !t.isTransfer && t.date <= today && upiIdOf(t));
  const usedCredits = new Set();
  const pairs = [];
  for (const d of [...debits].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const id = upiIdOf(d);
    if (!id) continue;
    const back = credits.find(
      (c) =>
        !usedCredits.has(c.id) &&
        c.accountId === d.accountId &&
        c.amount === d.amount &&
        c.date >= d.date &&
        daysBetweenInclusive(d.date, c.date) <= 46 &&
        upiIdOf(c) === id
    );
    if (!back) continue;
    usedCredits.add(back.id);
    pairs.push({ sent: d, back });
  }
  return pairs;
}

function daysBetweenInclusive(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / DAY_MS) + 1;
}

export async function computeFreeToSpend(now = new Date()) {
  const [allAccounts, allTransactions, importBatches, allRecurring, incomeSetting, salaryDay, keepInBank, incomeKind, categories, sideSetting] = await Promise.all([
    getAll('accounts'),
    getAll('transactions'),
    getAll('importBatches'),
    getAll('recurring'),
    getSetting('monthlyIncome', null),
    getSetting('salaryDay', null),
    getSetting('keepInBank', DEFAULT_KEEP_IN_BANK),
    getSetting('incomeType', 'salary'),
    getAll('categories'),
    getSetting('businesses', []),
  ]);
  // The house's accounts. The business's are left to its own card.
  const accounts = allAccounts.filter((a) => !a.business);
  // And the house's commitments: a business's shop rent and wages are its own.
  const recurring = allRecurring.filter((r) => !r.space || r.space === 'home');
  const hasBusiness = accounts.length !== allAccounts.length;
  const isBusiness = incomeKind === 'business';

  // A payment saved twice by overlapping statement imports is counted once
  // until you remove the copy (Summary offers to).
  const duplicates = findDuplicates(allTransactions);
  const duplicateIds = new Set(duplicates.map((t) => t.id));
  const transactions = duplicateIds.size ? allTransactions.filter((t) => !duplicateIds.has(t.id)) : allTransactions;

  const today = isoLocal(now);
  // What the month is planned on. For a business owner that is worked out
  // from what came home; for everyone else it is the amount set on Plan.
  // A business on the side adds what it brings home (moved over from its
  // account, never the salary that also lands there), once there are three
  // months to go on; until then it adds nothing rather than a guess.
  const side = !isBusiness && Array.isArray(sideSetting) && sideSetting.length > 0;
  const plan = isBusiness
    ? businessPlan(transactions, allAccounts, today, incomeSetting)
    : side
      ? businessPlan(transactions, allAccounts, today, null, { outside: false })
      : null;
  const monthlyIncome = isBusiness ? plan.amount : incomeSetting;
  const businessExtra = side && plan.basis === 'lowest' ? plan.amount : 0;
  // The accounts you spend from. A bank account you keep only for savings or
  // to pay a loan from (see isPutAway) is not among them.
  const bankAccounts = accounts.filter(isEverydayBank);
  // Savings pots, fixed deposits and bank accounts kept for saving: money of
  // yours, but not money to spend. A payment out of one can still settle a
  // commitment (an EMI leaving the loan account), but it is never spending.
  const savingsAccounts = accounts.filter(isPutAway);
  const pfAccounts = accounts.filter(isPfAccount);
  const loanAccounts = accounts.filter(isLoanAccount);
  const cardAccounts = accounts.filter((a) => a.type === 'card');
  const cardIds = new Set(cardAccounts.map((a) => a.id));
  const notes = [];

  // --- The card cycle -------------------------------------------------------
  // It closes on the statement day. With cards on different days, the last to
  // close sets the date, so every card's current spends are inside it.
  const statementDays = [...new Set(cardAccounts.map((a) => statementDay(a, importBatches)).filter(Boolean))];
  const cycleClose = statementDays.length ? statementDays.map((d) => nextOccurrence(d, now)).sort().pop() : null;
  const cycleStart = cycleClose ? addDays(paydayOnOrBefore(Math.max(...statementDays), addDays(cycleClose, -1)), 1) : null;

  // --- Bank ---------------------------------------------------------------
  const bankLines = bankAccounts
    .map((a) => {
      const balance = bankBalance(a, transactions);
      if (balance == null) return null;
      const since = transactions.filter((t) => t.accountId === a.id && afterKnownBalance(a, t)).length;
      return { account: a, balance, asOf: a.knownBalanceDate, entriesSince: since };
    })
    .filter(Boolean);
  const bank = bankLines.length ? bankLines.reduce((s, l) => s + l.balance, 0) : null;
  if (bank == null) notes.push('Import a bank statement so the app knows your balance.');

  // --- Salary and the window ----------------------------------------------
  const bankIds = new Set(bankAccounts.map((a) => a.id));
  let salary = { amount: 0, date: null, counted: false, alreadyIn: false, late: false, setUp: false, dates: [], billsPayday: null };
  let windowEnd;
  if (!isBusiness && salaryDay && monthlyIncome) {
    salary.setUp = true;
    // Salaries land a few days early (payday on a weekend or holiday) or a
    // day or two late. A big enough credit near a payday is that payday's
    // salary, and it's already in the bank balance.
    const landedFor = (payday) =>
      transactions.some(
        (t) =>
          bankIds.has(t.accountId) &&
          t.direction === 'credit' &&
          !t.isTransfer &&
          t.amount >= monthlyIncome / 2 &&
          t.date >= addDays(payday, -SALARY_EARLY_DAYS) &&
          t.date <= addDays(payday, SALARY_LATE_DAYS) &&
          t.date <= today
      );
    const dayAfter = (iso) => nextOccurrence(salaryDay, dateOf(addDays(iso, 1)));
    const previous = paydayOnOrBefore(salaryDay, today);
    const next = dayAfter(today);

    // The first salary not yet in the bank. One that came early, on the day
    // or a little late is already in the balance; one a few days late that
    // hasn't arrived is still to come, not missing.
    let first;
    if (next <= addDays(today, SALARY_EARLY_DAYS) && landedFor(next)) {
      first = dayAfter(next);
      salary.alreadyIn = true;
    } else if (landedFor(previous)) {
      first = next;
    } else if (today <= addDays(previous, SALARY_LATE_DAYS)) {
      first = previous;
      salary.late = true;
    } else {
      first = next;
    }

    // The salary that pays this cycle's card bills: the first payday on or
    // after the statement day. Every salary up to it is counted, and the
    // plan runs to the end of the month that salary pays for.
    const billsPayday = cycleClose ? nextOccurrence(salaryDay, dateOf(cycleClose)) : first;
    for (let d = first; d <= billsPayday; d = dayAfter(d)) salary.dates.push(d);
    salary.billsPayday = billsPayday;
    salary.nextUnreceived = first;
    salary.dayAfter = dayAfter;
    salary.amount = monthlyIncome * salary.dates.length;
    salary.counted = salary.dates.length > 0;
    salary.date = salary.dates[0] || null;
    windowEnd = addDays(dayAfter(billsPayday), -1);
  } else {
    // Without a salary day there's no pay period to plan to, so plan to the
    // end of this month and count no future income.
    windowEnd = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    // A business owner has no payday: the month runs by the calendar, and
    // no money is counted before it has come home.
    if (isBusiness) salary.setUp = monthlyIncome != null;
    else notes.push('Set your income and the day it arrives on Plan.');
  }

  // Salary day at the end of a month: EMIs, rent and the rest with a set day
  // are paid that day for the month that follows. The window runs from the day
  // the salary landed (or the payday, if it hasn't) to the month's last day -
  // only when payday is in the month's last week. Null otherwise.
  const salaryDayWindow = (monthEnd) => {
    if (!salary.setUp || !salaryDay || isBusiness) return null;
    const [y, m, last] = monthEnd.split('-').map(Number);
    const payday = isoLocal(new Date(y, m - 1, Math.min(salaryDay, last)));
    if (Math.min(salaryDay, last) < last - 6) return null;
    const landed = transactions
      .filter(
        (t) =>
          bankIds.has(t.accountId) &&
          t.direction === 'credit' &&
          !t.isTransfer &&
          t.amount >= monthlyIncome / 2 &&
          t.date >= addDays(payday, -SALARY_EARLY_DAYS) &&
          t.date <= payday
      )
      .map((t) => t.date)
      .sort()[0];
    return { from: landed && landed < payday ? landed : payday, to: monthEnd };
  };
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const previousMonthEnd = addDays(monthStart, -1);
  const daysLeft = Math.max(1, daysBetweenInclusive(today, windowEnd));

  // --- Cards --------------------------------------------------------------
  // A card bill paid from the bank leaves the bank at once, but the card's
  // "payment received" only reaches the app with the next list or statement.
  // Until then the bank-side payment has to count as paying the card, or the
  // bill is taken off twice: once from the bank balance, once as unpaid.
  const cardCreditsPaired = new Set();
  const bankOnlyPayments = transactions.filter((t) => {
    if (!bankIds.has(t.accountId) || t.direction !== 'debit' || !t.isTransfer || !(t.paysCardId || looksLikeCardPayment(t, 'bank'))) return false;
    const twin = transactions.find(
      (c) => cardIds.has(c.accountId) && (!t.paysCardId || c.accountId === t.paysCardId) && c.direction === 'credit' && c.isTransfer && c.amount === t.amount && !cardCreditsPaired.has(c.id) && Math.abs(dateOf(c.date) - dateOf(t.date)) <= 7 * DAY_MS
    );
    if (twin) cardCreditsPaired.add(twin.id);
    return !twin;
  });

  const cards = cardAccounts.map((account) => {
    const { owed: owedNet, cycleStart, since } = cardOwedThisCycle(account, transactions, importBatches);
    const bill = cardBillDue(account);
    const credits = transactions
      .filter((t) => t.accountId === account.id && t.isTransfer && t.direction === 'credit' && (!since || t.date > since))
      .reduce((s, t) => s + t.amount, 0);
    return { account, owedNet, cycleStart, since, bill, credits, extraPayments: [] };
  });

  // Hand each bank-only payment to the card it paid: the card you picked for
  // it, then the card's digits in the bank's description, otherwise the one
  // card whose bill it equals. A payment through CRED names no card at all, so
  // one that fits none of these is listed for you to say which card it paid.
  const unassignedCardPayments = [];
  for (const p of bankOnlyPayments) {
    const desc = p.rawDescription || '';
    const candidates = cards.filter((c) => !c.since || p.date > c.since);
    let target = p.paysCardId ? cards.find((c) => c.account.id === p.paysCardId) : null;
    if (!target) target = candidates.find((c) => [c.account.last4, ...(c.account.linkedLast4s || [])].filter(Boolean).some((d) => desc.includes(d)));
    if (!target) {
      const byAmount = candidates.filter((c) => c.bill && !c.bill.paid && c.bill.amount === p.amount);
      if (byAmount.length === 1) target = byAmount[0];
    }
    if (target) {
      target.credits += p.amount;
      target.extraPayments.push(p);
    } else if (candidates.length && p.date >= addDays(today, -45)) {
      unassignedCardPayments.push(p);
    }
  }

  // Cards with a statement day are worked out cycle by cycle, which matches
  // each payment to the bill it paid. The rest fall back to "everything since
  // the last imported statement".
  for (const c of cards) {
    if (!statementDay(c.account, importBatches)) continue;
    const p = cardPosition(c.account, transactions, importBatches, today, c.extraPayments);
    c.owed = p.owed;
    c.unpaid = p.unpaid + p.billedNotImported;
    c.billedNotImported = p.billedNotImported;
    c.refunds = p.refunds;
    c.statementMissing = p.statementMissing;
    c.positioned = true;
  }

  for (const c of cards) {
    if (!c.positioned) {
      // Payments since the last statement first settle that statement's bill,
      // and anything beyond it comes off what's owed since. Once the bill is
      // marked paid, the first payments are taken to be the ones that paid it.
      const billed = c.bill && !c.bill.paid ? c.bill.amount : 0;
      const payments = c.bill && c.bill.paid ? Math.max(0, c.credits - c.bill.amount) : c.credits;
      const total = Math.max(0, billed + c.owedNet - payments);
      c.unpaid = Math.min(total, Math.max(0, billed - payments));
      c.owed = total - c.unpaid;
      c.billedNotImported = 0;
      c.statementMissing = false;
    }
    const latestList = importBatches
      .filter((b) => b.accountId === c.account.id && b.provisional)
      .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))[0];
    c.listImportedAt = latestList ? latestList.importedAt : null;
    delete c.credits;
    delete c.owedNet;
    delete c.extraPayments;
    delete c.positioned;
  }

  for (const c of cards) {
    if (c.owed === 0 && c.unpaid === 0) continue;
    if (!c.listImportedAt) {
      notes.push(`${c.account.label}: no current transactions list yet - only entries and alerts you've saved are counted.`);
    }
    if (c.billedNotImported > 0) {
      notes.push(`${c.account.label}: the bill from its last statement day is estimated from your entries. Import that statement so the amount is exact.`);
    }
  }

  // --- Commitments, by what pays them -------------------------------------
  // Bank-paid ones come out of the bank (before salary) or out of a salary
  // (the month it pays for). Card-paid ones are card spending, so they're
  // reserved inside this card cycle until they show up on the card. Cash ones
  // come out of the ATM money, which is its own commitment.
  const cashIds = new Set(accounts.filter((a) => a.type === 'cash').map((a) => a.id));
  const paidBy = (item) => {
    if (item.accountId === 'cash' || cashIds.has(item.accountId)) return 'cash';
    if (item.accountId && cardIds.has(item.accountId)) return 'card';
    return 'bank';
  };
  // Your commitments, plus one for each loan's EMI (set up on the loan itself).
  const live = [...recurring.filter((item) => isLiveCommitment(item, today)), ...loanAccounts.map(loanCommitment).filter(Boolean)];
  const bankEntries = transactions.filter((t) => bankIds.has(t.accountId) && t.direction === 'debit');
  const keep = Math.max(0, Number(keepInBank) || 0);
  const firstSalary = salary.setUp ? salary.dates[0] || salary.nextUnreceived : null;
  // No card with a statement day yet (a new user, or cash and bank only):
  // spending runs by the calendar month, like the bank's. The salary window
  // can reach a month further, which would spread this month's budget thin.
  const spendEnd = cycleClose || monthEnd;
  const windowStart = cycleStart || `${today.slice(0, 7)}-01`;
  // The period each commitment is tracked over. Cards: the card cycle (the day
  // after the statement day to the next statement day). The bank and cash:
  // the calendar month, 1st to last day - except that a payment with a set day
  // (EMI, rent) made on salary day belongs to the month after.
  const cardPeriod = { kind: 'card', start: windowStart, end: spendEnd, key: spendEnd };
  const bankPeriod = {
    kind: 'bank',
    start: monthStart,
    end: monthEnd,
    key: monthEnd,
    carriedIn: salaryDayWindow(previousMonthEnd),
    carriedOut: salaryDayWindow(monthEnd),
  };
  const periodOf = (item) => (paidBy(item) === 'card' ? cardPeriod : bankPeriod);
  // A choice for this period, recorded on the commitment by the period's key.
  // A bank commitment accepts any date inside its month: earlier versions
  // keyed choices by the card statement day.
  const choseFor = (list, item) => {
    if (!Array.isArray(list)) return false;
    const p = periodOf(item);
    return list.some((k) => k === p.key || (p.kind === 'bank' && k >= p.start && k <= p.end));
  };
  // "Mark paid" on the Summary - for payments the app can't see, like cash or
  // another bank.
  const markedPaid = (item) => choseFor(item.paidCycles, item);
  // "Skip this month": you've chosen not to have this expense this period. It
  // comes out of the budget, isn't held back from the bank, and anything you
  // do spend on it anyway counts as ordinary spending.
  const skipped = (item) => choseFor(item.skippedCycles, item);

  // Before the next salary lands, from the bank.
  const beforeSalaryEnd = firstSalary ? addDays(firstSalary, -1) : windowEnd;
  const bankBeforeSalary = [];
  for (const item of live.filter((i) => paidBy(i) === 'bank' && !markedPaid(i) && !skipped(i))) {
    if (beforeSalaryEnd < today) break;
    const { amount, detail } = commitmentDueInWindow(item, { today, windowEnd: beforeSalaryEnd, bankEntries });
    if (amount > 0) bankBeforeSalary.push({ label: item.label, amount, detail });
  }

  // Each salary still to come, and the month of commitments it pays for.
  const fundedMonths = salary.dates.map((payday) => {
    const end = addDays(salary.dayAfter(payday), -1);
    const items = [];
    for (const item of live.filter((i) => paidBy(i) === 'bank')) {
      const { amount, detail } = commitmentForMonth(item, payday, end, bankEntries, today);
      if (amount > 0) items.push({ label: item.label, amount, detail });
    }
    return { payday, end, amount: monthlyIncome, commitments: items, total: items.reduce((s, c) => s + c.amount, 0) };
  });

  // Card-paid commitments not yet charged in this cycle.
  const cardUpcoming = [];
  for (const item of live.filter((i) => paidBy(i) === 'card' && !markedPaid(i) && !skipped(i))) {
    const entries = transactions.filter((t) => t.accountId === item.accountId && t.direction === 'debit');
    const { amount, detail } = commitmentDueInWindow(item, { today, windowEnd: spendEnd, bankEntries: entries });
    const card = cardAccounts.find((a) => a.id === item.accountId);
    if (amount > 0) cardUpcoming.push({ label: item.label, amount, detail: `${card ? card.label : 'card'} · ${detail}` });
  }

  // Card bills: a billed statement due before the salary has to be paid from
  // the bank; everything else on the cards is paid from the salary.
  const billsBeforeSalary = [];
  const cardBills = [];
  for (const c of cards) {
    const statementPart = c.unpaid - (c.billedNotImported || 0);
    const due = c.account.statementDueDate;
    if (statementPart > 0 && firstSalary && due && due < firstSalary) {
      billsBeforeSalary.push({ label: `${c.account.label} bill`, amount: statementPart, detail: `due ${formatShort(due)}` });
      if (c.billedNotImported >= MIN_ESTIMATED_BILL) cardBills.push({ label: `${c.account.label} bill`, amount: c.billedNotImported, detail: 'billed, statement not imported yet' });
    } else if (c.unpaid >= (c.billedNotImported ? MIN_ESTIMATED_BILL : 1)) {
      // An estimated bill of a few paise is a rounding leftover between the
      // spends and the payment that settled them, not a bill.
      cardBills.push({ label: `${c.account.label} bill`, amount: c.unpaid, detail: c.billedNotImported ? 'billed, statement not imported yet' : 'billed, not paid yet' });
    }
  }

  const sum = (list) => list.reduce((s, x) => s + x.amount, 0);
  const owedCards = cards.reduce((s, c) => s + c.owed, 0);
  const unpaidBills = cards.reduce((s, c) => s + c.unpaid, 0);
  const upcomingTotal = sum(cardUpcoming);

  // --- The budget for this cycle ------------------------------------------
  // Only the salary pays for a cycle. The money already in the bank is a
  // cushion, never extra spending - counting it (or a salary with no
  // commitments taken off) is how the app once said nearly ₹2 lakh was free.
  const budgetItems = live
    .filter((item) => paidBy(item) !== 'cash') // cash comes out of the ATM commitment
    .filter((item) => !skipped(item))
    .map((item) => ({ item, label: item.label, amount: monthlyAmountOf(item), paidBy: paidBy(item) }));
  const skippedItems = live.filter((item) => paidBy(item) !== 'cash' && skipped(item));
  const noCommitments = budgetItems.length === 0 && skippedItems.length === 0;
  const limit = monthlyIncome ? monthlyIncome + businessExtra - sum(budgetItems) - keep : null;

  // --- Spent this period -----------------------------------------------------
  // Card spending since the last statement day, and bank spending since the
  // 1st of the month, except payments that ARE a fixed commitment - those are
  // inside the budget already. Card bill payments, transfers and salary are
  // not spending.
  //
  // Commitments are matched against every payment out in their period,
  // transfers included: an ATM withdrawal shared as an alert is saved as money
  // moved to cash, and an EMI sent to another bank can be flagged the same way
  // - but both ARE the commitment. Only card bill payments are never one.
  //
  // Nothing is looked for before the period began, with one exception you
  // chose: a commitment with a set day (EMI, rent) paid on salary day at the
  // end of last month is this month's, and one paid on this month's salary day
  // is next month's.
  const inRange = (from, to) => (t) => t.date >= from && t.date <= to && t.date <= today && t.direction === 'debit';
  const within = (w) => (t) => Boolean(w) && t.date >= w.from && t.date <= w.to;
  const claimed = new Set();
  const claimedBy = new Map();
  // Payments towards one commitment. A payment you tagged with a commitment
  // when you logged it belongs to that one and no other, whatever it says.
  // Otherwise the commitment's words, amount or category decide. Up to its
  // amount a payment is the commitment (already in the budget); anything
  // beyond it is ordinary spending, but still shows in `used`.
  const matchedTo = (b, accountPool) => {
    const item = b.item;
    const p = periodOf(item);
    const matcher = commitmentMatcher(item);
    const tagged = transactions.filter((t) => t.commitmentId === item.id && t.direction === 'debit');
    // A commitment paid from one named bank account only looks at that one.
    const onItsAccount = holdingIds.has(item.accountId) ? accountPool.filter((t) => t.accountId === item.accountId) : accountPool;
    const pool = [...onItsAccount.filter((t) => !t.commitmentId || t.commitmentId === item.id), ...tagged.filter((t) => !onItsAccount.includes(t))];
    b.tracked = Boolean(matcher) || tagged.length > 0;
    b.used = 0;
    b.matches = [];
    b.notThis = [];
    b.charges = { card: 0, bank: 0, bankBeyond: 0 };
    if (!b.tracked) return;
    const mine = (t) => t.commitmentId === item.id || Boolean(matcher && matcher(t));
    const dated = p.kind === 'bank' && !item.spread && frequencyOf(item) === 'monthly';
    let entries = pool.filter(inRange(p.start, p.end));
    if (dated && p.carriedOut) {
      // Paid on this month's salary day: next month's. Not this month's
      // commitment, and not spending either.
      for (const t of entries.filter(within(p.carriedOut))) {
        if (claimed.has(t.id) || !mine(t) || (t.notCommitmentIds || []).includes(item.id)) continue;
        claimed.add(t.id);
        claimedBy.set(t.id, `${b.label} (next month)`);
      }
      entries = entries.filter((t) => !within(p.carriedOut)(t));
    }
    if (dated && p.carriedIn) entries = [...pool.filter(inRange(p.carriedIn.from, p.carriedIn.to)), ...entries];
    let counted = 0;
    for (const t of entries.sort((x, y) => (x.date < y.date ? -1 : 1))) {
      if (claimed.has(t.id) || !mine(t)) continue;
      // You said this payment isn't this commitment ("Not this" on Summary).
      if ((t.notCommitmentIds || []).includes(item.id)) {
        b.notThis.push({ id: t.id, date: t.date, description: t.rawDescription, amount: t.amount });
        continue;
      }
      const onSalaryDay = t.date < p.start;
      b.used += t.amount;
      b.matches.push({ id: t.id, date: t.date, description: t.rawDescription, amount: t.amount, onSalaryDay, tagged: t.commitmentId === item.id });
      if (counted >= item.amount) continue;
      const portion = Math.min(t.amount, item.amount - counted);
      counted += portion;
      claimed.add(t.id);
      claimedBy.set(t.id, b.label);
      if (onSalaryDay) continue; // last month's money, never this period's spending
      if (cardIds.has(t.accountId)) {
        // Only the planned part comes off the card's spending; the rest stays.
        b.charges.card += portion;
      } else {
        // A bank payment is taken out whole, and the part beyond the plan put
        // back as spending (₹20,000 of ATM cash on top of ₹10,000 against
        // ₹26,000 planned).
        b.charges.bank += portion;
        b.charges.bankBeyond += t.amount - portion;
      }
    }
  };
  // Commitments are matched against money leaving any account you hold -
  // an EMI can leave a savings account. What counts as this month's SPENDING
  // is still only the bank accounts (bankWindow below).
  const holdingIds = new Set([...bankIds, ...savingsAccounts.map((a) => a.id)]);
  const bankPool = transactions.filter((t) => holdingIds.has(t.accountId) && !looksLikeCardPayment(t, 'bank'));
  for (const b of budgetItems) {
    matchedTo(b, b.paidBy === 'card' ? transactions.filter((t) => t.accountId === b.item.accountId && !t.isTransfer) : bankPool);
  }
  const cardCommitmentCharges = budgetItems.filter((b) => b.charges.card > 0).map((b) => ({ label: b.label, amount: b.charges.card }));
  const bankCommitmentPayments = budgetItems.filter((b) => b.charges.bank > 0).map((b) => ({ label: b.label, amount: b.charges.bank }));
  const bankWindow = bankPool.filter((t) => bankIds.has(t.accountId)).filter(inRange(bankPeriod.start, bankPeriod.end));
  // An EMI leaving a bank account is repaying a debt, not spending, and it
  // must never land in "spent":
  //   - when the loan is in the budget, its EMI is a commitment and the
  //     payment is already claimed above;
  //   - when it isn't (loan.inBudget === false), what funds it is a
  //     commitment instead - the money you move to the account it leaves
  //     from - so counting the EMI as well would charge you twice for it.
  // Two ₹23,000 home loan EMIs were adding ₹46,000 of spending that was
  // never spending.
  const loanEmiIds = new Set(
    loanAccounts.length ? [...assignLoanPayments(loanAccounts, transactions, today).values()].flat().map((t) => t.id) : []
  );
  // Ordinary spending: whatever no commitment claimed - transfers, being money
  // moved rather than spent, excepted, and anything that has since come back.
  const unclaimed = bankWindow.filter((t) => !claimed.has(t.id) && !t.isTransfer && !loanEmiIds.has(t.id));
  const returned = paidBack(unclaimed.filter((t) => t.direction === 'debit'), transactions, today);
  const returnedIds = new Set(returned.map((p) => p.sent.id));
  const bankSpends = unclaimed.filter((t) => !returnedIds.has(t.id));
  const bankBeyondPlan = budgetItems.reduce((s, x) => s + x.charges.bankBeyond, 0);
  const bankSpent = bankSpends.reduce((s, t) => s + t.amount, 0) + bankBeyondPlan;
  const cardSpent = owedCards - sum(cardCommitmentCharges);
  const spentThisCycle = cardSpent + bankSpent;
  const free = limit == null || noCommitments ? null : limit - spentThisCycle;
  if (monthlyIncome && noCommitments) notes.push('Add your fixed commitments on Plan - without them your whole income looks free.');

  // --- The bank check -----------------------------------------------------
  // Never adds to the budget. Before payday: what the bank still has to pay.
  // After the next salary: the balance once that salary is in and the card
  // bills and next month's commitments are paid, if nothing more is spent.
  const setUp = bank != null && salary.setUp;
  const bankBeforeCards = setUp ? bank - sum(bankBeforeSalary) - sum(billsBeforeSalary) : null;
  const bankAfterBills = setUp
    ? bankBeforeCards + fundedMonths.reduce((s, m) => s + m.amount - m.total, 0) - sum(cardBills) - owedCards - upcomingTotal
    : null;
  const bankLevel =
    bankAfterBills == null ? 'unknown' : bankBeforeCards < 0 || bankAfterBills < 0 ? 'over' : bankAfterBills < keep ? 'warning' : 'ok';

  // --- How fresh the data is ----------------------------------------------
  // Every figure here is only as current as the last statement, list, alert
  // or entry on each account. After a week of silence it says so, rather
  // than letting an old balance pass for today's.
  const lastData = new Map();
  const note = (accountId, date) => {
    if (date && date <= today && (!lastData.has(accountId) || date > lastData.get(accountId))) lastData.set(accountId, date);
  };
  for (const t of transactions) note(t.accountId, t.date);
  for (const b of importBatches) note(b.accountId, b.provisional ? b.takenOn || (b.importedAt || '').slice(0, 10) : b.periodEnd);
  for (const a of bankAccounts) note(a.id, a.knownBalanceDate);
  // Two accounts for the same bank account or card (an import that didn't
  // recognise the one you had) would count its money twice.
  const sameAccountGroups = new Map();
  for (const a of [...bankAccounts, ...cardAccounts]) {
    if (!a.last4) continue;
    const key = `${a.type}|${a.last4}`;
    sameAccountGroups.set(key, [...(sameAccountGroups.get(key) || []), a]);
  }
  const duplicateAccounts = [...sameAccountGroups.values()].filter((g) => g.length > 1);
  // --- How close to the budget --------------------------------------------
  const daysToClose = Math.max(1, daysBetweenInclusive(today, spendEnd));
  const daysToSalary = Math.max(1, daysBetweenInclusive(today, beforeSalaryEnd));
  const daysIntoCycle = Math.max(1, daysBetweenInclusive(windowStart, today));

  // --- Each commitment this cycle -----------------------------------------
  // Paid in one go (EMI, rent): paid or still due. Spread through the cycle
  // (Tiffin, Rapido, ATM cash): how much of it is used, and whether the pace
  // so far takes it over the planned amount by the statement day.
  const tracker = budgetItems.map((b) => {
    const variable = Boolean(b.item.spread) || frequencyOf(b.item) !== 'monthly';
    const p = periodOf(b.item);
    const daysInto = Math.max(1, daysBetweenInclusive(p.start, today));
    const length = Math.max(daysInto, daysBetweenInclusive(p.start, p.end));
    const row = {
      id: b.item.id,
      label: b.label,
      amount: b.amount,
      paidBy: b.paidBy,
      used: b.used,
      matches: b.matches || [],
      // Payments you took off it with "Not this", so they can be put back.
      notThis: b.notThis || [],
      // Where you placed it in the list on Plan.
      order: b.item.sortOrder ?? null,
      tracked: b.tracked,
      variable,
      left: b.amount - b.used,
      marked: markedPaid(b.item),
      // A loan's EMI is set up on the loan account, not on Plan.
      kind: b.item.source === 'loan' ? 'loan' : 'fixed',
      // Mark paid and Skip are saved against this key.
      cycleKey: p.key,
      periodStart: p.start,
      period: p.kind === 'card' ? 'cycle' : 'month',
    };
    if (b.used > b.amount * 1.02) return { ...row, status: 'over', over: b.used - b.amount };
    if (row.marked) return { ...row, status: 'paid' };
    if (!b.tracked) return { ...row, status: 'untracked' };
    if (!variable) {
      if (b.used >= b.amount * 0.9) return { ...row, status: 'paid' };
      const due = nextOccurrence(b.item.dayOfMonth, dateOf(p.start));
      if (b.used > 0) return { ...row, status: 'part', due };
      return { ...row, status: due < today ? 'late' : 'due', due };
    }
    const projected = Math.round((b.used / daysInto) * length);
    if (daysInto >= MIN_DAYS_FOR_PACE && projected > b.amount * 1.02) return { ...row, status: 'heading-over', projected };
    return { ...row, status: 'ok', projected };
  });
  // --- Why a commitment found nothing ------------------------------------
  // "₹0 used" on its own leaves you guessing. Look for the words (or amount)
  // everywhere, and say what stood in the way.
  const labelOf = (id) => accounts.find((a) => a.id === id)?.label || 'another account';
  for (const row of tracker) {
    const b = budgetItems.find((x) => x.item.id === row.id);
    if (!b || row.used > 0 || row.marked || !row.tracked) continue;
    const matcher = commitmentMatcher(b.item) || (() => false);
    const words = matchWords(b.item);
    const payer = b.paidBy === 'card' ? (t) => t.accountId === b.item.accountId : (t) => bankIds.has(t.accountId);
    const everywhere = transactions.filter((t) => t.direction === 'debit' && matcher(t)).sort((x, y) => (x.date < y.date ? 1 : -1));
    const thisCycle = everywhere.filter((t) => t.date >= row.periodStart && t.date <= today);
    const text = (b.item.matchText || '').trim();
    const described = words.length ? `"${text.length > 40 ? `${text.slice(0, 40)}…` : text}"` : b.item.spread ? 'its category' : `about ${formatRupees(b.amount)}`;
    if (!everywhere.length) {
      row.hint = words.length
        ? `No entry in the app contains ${described}. Use just the name or UPI ID from the statement line, not the whole line.`
        : b.item.spread
          ? 'No spending in its category yet - give it statement words on Plan if its payments aren\'t categorised.'
          : `No payment of ${described} yet. If its amount varies, give it statement words on Plan.`;
    } else if (thisCycle.length && thisCycle.every((t) => claimedBy.has(t.id))) {
      row.hint = `The matching payment is already counted towards ${claimedBy.get(thisCycle[0].id)}.`;
    } else if (row.notThis.length) {
      row.hint = `You marked ${row.notThis.length === 1 ? 'its payment' : `its ${row.notThis.length} payments`} "Not this". If ${row.notThis.length === 1 ? 'it belongs' : 'they belong'} here, tap "Count it again" below.`;
    } else if (thisCycle.length && !thisCycle.some(payer)) {
      row.hint = `Found on ${labelOf(thisCycle[0].accountId)}, but this commitment is set to be paid from ${b.paidBy === 'card' ? labelOf(b.item.accountId) : 'your bank'}. Change "Paid from" on Plan.`;
    } else if (!thisCycle.length) {
      row.hint = `Last matched ${formatShort(everywhere[0].date)} - nothing since this ${row.period} started on ${formatShort(row.periodStart)}.`;
    }
  }

  // --- Stop spending where the money isn't there --------------------------
  // Once the cycle is over budget, the part of a commitment you haven't used
  // yet (the last ₹2,000 of an Amazon Pay top-up, the rest of the Rapido
  // allowance) is money that has already gone elsewhere. Whatever you add on a
  // card now is paid from next month's salary. The overspend is taken from
  // those unused amounts in proportion to their size; if it's larger than all
  // of them together, none of it is safe.
  const overBy = free != null && free < 0 ? -free : 0;
  const unusedRows = tracker.filter((t) => ['ok', 'heading-over', 'part'].includes(t.status) && t.left > 0);
  const unused = unusedRows.reduce((s, t) => s + t.left, 0);
  if (overBy > 0 && unused > 0) {
    for (const t of unusedRows) {
      const safe = overBy >= unused ? 0 : Math.floor(t.left * (1 - overBy / unused));
      t.stop = { safe, holdBack: t.left - safe, overBy };
    }
  }

  // Skipped this cycle: listed so they can be brought back, never counted.
  for (const item of skippedItems) {
    tracker.push({
      id: item.id,
      label: item.label,
      amount: monthlyAmountOf(item),
      paidBy: paidBy(item),
      used: 0,
      matches: [],
      notThis: [],
      order: item.sortOrder ?? null,
      tracked: true,
      variable: Boolean(item.spread),
      left: 0,
      marked: false,
      skipped: true,
      cycleKey: periodOf(item).key,
      period: periodOf(item).kind === 'card' ? 'cycle' : 'month',
      status: 'skipped',
    });
  }
  // What to look at first: anything over or heading over; and when the whole
  // budget is gone, the flexible commitments you control, biggest first.
  const cutBack = tracker.filter((t) => t.status === 'over' || t.status === 'heading-over');
  // Anything not yet paid can be skipped this cycle - every expense is a
  // choice - so all of them are suggestions, the flexible ones first.
  const flexible = tracker
    .filter((t) => !t.skipped && t.status !== 'paid' && t.status !== 'over')
    .sort((a, b) => Number(b.variable) - Number(a.variable) || b.amount - a.amount);
  const pace = daysIntoCycle ? Math.round(Math.max(0, spentThisCycle) / daysIntoCycle) : 0;
  // At the pace of this cycle so far, the day the budget would run out. The
  // first few days of a cycle are too few to judge a pace by.
  const crossesOn = free != null && free > 0 && pace > 0 && daysIntoCycle >= MIN_DAYS_FOR_PACE ? addDays(today, Math.floor(free / pace)) : null;
  const used = limit > 0 ? spentThisCycle / limit : 1;
  let level = 'ok';
  if (free == null) level = 'unknown';
  else if (free < 0) level = 'over';
  else if (used >= CRITICAL_SHARE || (crossesOn && crossesOn <= addDays(today, 3))) level = 'critical';
  else if (used >= WARNING_SHARE || (crossesOn && crossesOn <= spendEnd)) level = 'warning';

  return {
    today,
    windowEnd,
    daysLeft,
    cycleStart: windowStart,
    cycleClose,
    cycleKey: spendEnd,
    unassignedCardPayments,
    // Bank spending and bank commitments run by the salary month.
    savings: savingsAccounts.map((a) => ({ account: a, balance: bankBalance(a, transactions) })),
    pf: pfAccounts.map((a) => ({ account: a, balance: pfPosition(a, transactions, today).balance })),
    loans: loanAccounts.map((a) => ({ account: a, ...loanPosition(a, transactions, today, loanAccounts) })),
    bankMonthStart: bankPeriod.start,
    bankMonthEnd: bankPeriod.end,
    daysToClose,
    daysIntoCycle,
    bank,
    bankLines,
    salary,
    cards,
    keep,
    // the budget
    incomeKind: isBusiness ? 'business' : incomeKind,
    monthlyIncome,
    sideBusiness: side,
    businessExtra,
    // A business owner's plan: what it rests on, and what came home so far.
    plan,
    // How many months of the house's costs the money in the bank and put
    // away would cover, for a month when little comes home.
    monthsCovered:
      bank != null && monthlyIncome && monthlyIncome - keep > 0
        ? Math.floor((bank + savingsAccounts.reduce((s, a) => s + Math.max(0, bankBalance(a, transactions) || 0), 0)) / (monthlyIncome - keep))
        : null,
    business: hasBusiness ? businessMonth(transactions, allAccounts, categories, today.slice(0, 7)) : null,
    budgetItems,
    skippedItems,
    noCommitments,
    limit,
    // spent this cycle
    cardSpent,
    cardCommitmentCharges,
    bankSpent,
    bankSpends,
    returned,
    bankBeyondPlan,
    bankCommitmentPayments,
    spentThisCycle,
    tracker,
    cutBack,
    flexible,
    free,
    perDay: free != null && free > 0 ? Math.floor(free / daysToClose) : 0,
    pace,
    crossesOn: crossesOn && crossesOn <= spendEnd ? crossesOn : null,
    used,
    level,
    // bank check
    beforeSalaryEnd,
    daysToSalary,
    bankBeforeSalary,
    billsBeforeSalary,
    bankBeforeCards,
    fundedMonths,
    cardBills,
    cardUpcoming,
    bankAfterBills,
    bankLevel,
    totals: { owedCards, unpaidBills, upcoming: upcomingTotal },
    duplicates,
    duplicateAccounts,
    notes,
  };
}

// A bank-paid commitment in the month a salary pays for (payday to the day
// before the next one). A spread one counts in full. A dated one counts on
// each due date in the month, unless it has already been paid early.
function commitmentForMonth(item, from, to, bankEntries, today) {
  if (frequencyOf(item) !== 'monthly') return commitmentDueInWindow(item, { today: from, windowEnd: to, bankEntries, wholeMonths: true });
  if (item.spread) return { amount: item.amount, detail: 'through the month' };
  let amount = 0;
  const dues = [];
  for (let due = nextOccurrence(item.dayOfMonth, dateOf(from)); due && due <= to; due = nextOccurrence(item.dayOfMonth, dateOf(addDays(due, 1)))) {
    if (item.endDate && due > item.endDate) break;
    if (paidAround(item, due, bankEntries, today)) continue;
    amount += item.amount;
    dues.push(formatShort(due));
  }
  return { amount, detail: dues.length ? `due ${dues.join(', ')}` : '' };
}

function formatRupees(minor) {
  return `₹${Math.round(minor / 100).toLocaleString('en-IN')}`;
}

function formatShort(iso) {
  return dateOf(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Warn at three quarters of the limit, and call it critical at 90%.
const WARNING_SHARE = 0.75;
const CRITICAL_SHARE = 0.9;
const MIN_DAYS_FOR_PACE = 5;
// An account with nothing new for more than a week gets a "data is old" warning.
// Estimated (not imported) bills below ₹10 are ignored.
const MIN_ESTIMATED_BILL = 1000;
