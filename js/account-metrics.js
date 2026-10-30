import { currentCycleStart } from './billing-cycle.js';
import { nextOccurrence, isoLocal, addDays, dateOf } from './frequency.js';

// Which of your accounts you spend from. A bank account is, unless you say
// otherwise: many people keep a second one only to park savings or pay a loan
// from (the EMI leaves it, an FD is opened from it), and money leaving an
// account like that is never spending - it is still yours, or it is paying
// off a debt. Everything about such an account is treated as savings: its
// balance is kept apart from what you can spend, and nothing leaving it
// counts against your budget.
export const isEverydayBank = (a) => a.type === 'bank' && a.spending !== false;
export const isPutAway = (a) => a.type === 'savings' || (a.type === 'bank' && a.spending === false);

// A MOD (SBI's multi-option deposit) sits under the savings account, shares its number, and is broken in blocks to cover whatever the
// account has to pay (an EMI, say). So for what you can use it is one pool with the account: its balance counts with the bank's.
// A payment that lands on it is still never spending - it is the account paying out, which the savings account's own rows say as well.
// An ordinary fixed deposit is not this: breaking it costs interest, so it stays money put away.
export const isSweepDeposit = (a) => Boolean(a && a.type === 'savings' && a.depositOf && a.deposit && a.deposit.kind === 'MOD');

// A bank account's balance is a snapshot (from the last imported statement)
// adjusted forward by anything dated after it - transfers included, since
// they're real money movement even though they're excluded from spend totals.
// What is in the account, as of a day - today unless asked otherwise.
//
// A date that has not happened yet is not money. Nothing stopped a payment
// being dated ahead: Add lets you pick any date, and a provident fund month
// is written on the last day of its month, which is in the future for most
// of that month. Those rows were being added to the balance the moment they
// were saved, so "In bank" could show a salary six days before it landed -
// money the screen then let you plan around. A balance counts what has
// happened.
export function bankBalance(account, transactions, asOf = isoLocal(new Date())) {
  if (account.knownBalance == null || !account.knownBalanceDate) return null;
  let balance = account.knownBalance;
  for (const t of transactions) {
    if (t.accountId !== account.id || !afterKnownBalance(account, t)) continue;
    if (asOf && t.date > asOf) continue;
    balance += t.direction === 'credit' ? t.amount : -t.amount;
  }
  return balance;
}

/* The balance at the end of any day, before the statement's date as well as
 * after it (5.21.5): before it, the payments between that day and the
 * statement are taken back out of the printed balance. Only as good as the
 * statements behind it, so History asks it only for months they cover. */
export function balanceAt(account, transactions, day) {
  if (account.knownBalance == null || !account.knownBalanceDate) return null;
  if (day >= account.knownBalanceDate) return bankBalance(account, transactions, day);
  let balance = account.knownBalance;
  for (const t of transactions) {
    if (t.accountId !== account.id || t.date <= day || afterKnownBalance(account, t)) continue;
    balance -= t.direction === 'credit' ? t.amount : -t.amount;
  }
  return balance;
}

// Whether a transaction happened after the balance the statement printed.
// Anything dated later obviously did. On the statement's own date, its own
// rows are already inside that balance - but a spend you logged, or a bank
// alert you saved, that day happened after the statement was cut, so it still
// has to come off. (An alert later found on a statement is replaced at
// import, so it can't be counted twice.)
export function afterKnownBalance(account, t) {
  if (!account.knownBalanceDate) return true;
  if (t.date > account.knownBalanceDate) return true;
  if (t.date < account.knownBalanceDate) return false;
  return !t.importBatchId && t.source !== 'statement' && t.source !== 'unbilled';
}

// What the last imported statement says is owed, and whether it's still
// outstanding. Returns null when no statement has been imported for the card
// yet - which is different from owing nothing.
export function cardBillDue(account) {
  if (account.type !== 'card' || account.statementDue == null) return null;
  return {
    amount: account.statementDue,
    minimum: account.statementMinDue ?? null,
    dueDate: account.statementDueDate ?? null,
    paid: account.statementDuePaid === true,
    daysLeft: account.statementDueDate ? daysUntil(account.statementDueDate) : null,
  };
}

function daysUntil(isoDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

// The date a current-transactions list stands for. A list is a snapshot of
// the day it was taken, not of its newest row: a list holding only a refund
// dated before the cycle closed still belongs to the cycle it was taken in.
export function listTakenOn(batch) {
  const taken = batch.takenOn || (batch.importedAt ? isoLocal(new Date(batch.importedAt)) : null);
  if (!taken) return batch.periodEnd || null;
  return batch.periodEnd && batch.periodEnd > taken ? batch.periodEnd : taken;
}

// Everything on a card that the imported statements haven't settled, as
// money: spends minus refunds and cashback since the last imported statement
// closed. Bill payments are transfers and don't count here. Unlike
// cardCycleSpend (a spending figure, where a refund shouldn't buy headroom),
// a ₹333 refund really does make what you owe ₹333 smaller.
//
// It runs from the last imported statement, not from today's cycle boundary.
// From the statement day until that statement is imported, the closed
// cycle's spends are still owed - they just haven't been billed in the app yet.
//
// A row from a current-transactions list taken after that statement counts
// even when its own date is earlier: ICICI lists a refund dated 11 Aug in the
// cycle that began on 26 Aug, because that's the bill it comes off.
//
// The same list pasted on two devices before they synced leaves two copies of
// every row; identical rows from different lists are counted once.
export function cardOwedThisCycle(account, transactions, importBatches, today = null) {
  const statements = importBatches
    .filter((b) => b.accountId === account.id && !b.provisional && b.periodEnd)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
  const since = [account.statementPeriodEnd, statements[0]?.periodEnd].filter(Boolean).sort().pop() || null;
  const listBatches = new Set(
    importBatches.filter((b) => b.accountId === account.id && b.provisional && (!since || listTakenOn(b) > since)).map((b) => b.id)
  );
  let owed = 0;
  let rows = 0;
  // key -> (list id -> how many identical rows that list holds)
  const listRows = new Map();
  for (const t of transactions) {
    if (t.accountId !== account.id || t.isTransfer) continue;
    const fromList = t.importBatchId && listBatches.has(t.importBatchId);
    if (since && t.date <= since && !fromList) continue;
    if (t.source === 'unbilled') {
      const key = `${t.date}|${t.amount}|${t.direction}|${t.rawDescription}`;
      const perList = listRows.get(key) || new Map();
      perList.set(t.importBatchId, (perList.get(t.importBatchId) || 0) + 1);
      listRows.set(key, perList);
      continue;
    }
    owed += t.direction === 'credit' ? -t.amount : t.amount;
    rows++;
  }
  // Twin rows inside one list are real (two ₹413 orders on one day); the same
  // row in two lists is one row pasted twice. So each row counts as many times
  // as the list holding the most copies of it.
  for (const [key, perList] of listRows) {
    const [, amount, direction] = key.split('|');
    const copies = Math.max(...perList.values());
    owed += (direction === 'credit' ? -1 : 1) * Number(amount) * copies;
    rows += copies;
  }
  // The day being worked out, not the real clock: a figure computed for another day (a replay, a test, the 26th seen
  // from the 25th) must start its cycle where that day's cycle started.
  const day = today ? new Date(...today.split('-').map((n, i) => (i === 1 ? n - 1 : Number(n)))) : undefined;
  return { cycleStart: currentCycleStart(account, importBatches, day), since, owed, rows };
}

// The day a card's statement closes. An imported statement says it for
// certain; the day typed in on Cards is only used until there is one. (A
// cycle starting on the 26th closes on the 25th - typing 26 used to move
// every cycle a day late.)
export function statementDay(account, importBatches = []) {
  const latest = importBatches
    .filter((b) => b.accountId === account.id && !b.provisional && b.periodEnd)
    .map((b) => b.periodEnd)
    .sort()
    .pop();
  return latest ? Number(latest.slice(8, 10)) : account.billingCycleDay || null;
}

// Cards whose saved statement day disagrees with their own statements, with
// the day corrected. A day typed in by hand (26 for a cycle that closes on
// the 25th) is wrong for good once a statement says otherwise, and parts of
// the app that read the saved day - Month in review, cycle-aware budgets -
// would otherwise keep filing a day's spends in the wrong month.
export function statementDayFixes(accounts, importBatches = []) {
  return accounts
    .filter((a) => a.type === 'card')
    .map((a) => {
      const fromStatement = importBatches.some((b) => b.accountId === a.id && !b.provisional && b.periodEnd);
      const day = fromStatement ? statementDay(a, importBatches) : null;
      return day && day !== a.billingCycleDay ? { ...a, billingCycleDay: day } : null;
    })
    .filter(Boolean);
}

// Where a card stands, cycle by cycle - for cards with a statement day.
//
// Every spend is placed in the cycle whose statement it lands on. Each
// closed cycle has a bill: the imported statement's amount when there is
// one, otherwise what was spent in that cycle. Payments are matched to the
// oldest bill cut before them. A payment with no bill in the app to settle
// (it paid a statement from before your data starts) is left out - it must
// never be taken off this cycle's spending, which is what used to make
// ₹1,00,000 of card spends look like ₹12,000.
//
// Returns:
//   unpaid              imported bills not yet paid
//   billedNotImported   bills cut on the statement day but not imported yet
//   owed                spent this cycle, refunds and cashback taken off
//   refunds             the refunds and cashback inside `owed`
//   cycleClose          this cycle's statement day; lastClose the previous one
//
// `extraPayments` are card payments seen only on the bank side.
export function cardPosition(account, transactions, importBatches, today, extraPayments = []) {
  const day = statementDay(account, importBatches);
  // Many transactions share a date; working out a statement day is the costly
  // part, so each date is worked out once.
  const closes = new Map();
  const closeOf = (iso) => {
    if (!closes.has(iso)) closes.set(iso, nextOccurrence(day, dateOf(iso)));
    return closes.get(iso);
  };
  const closeBefore = (iso) => closeOnOrBefore(day, addDays(iso, -1));
  const cycleClose = closeOf(today);
  const lastClose = closeBefore(today);
  // A bill that nobody paid stays a bill. Only the last two used to be kept, so a card forgotten for two cycles (or paid in part)
  // dropped out of the bank check while still owed. The older ones count only on a card where payments are written down at all,
  // else a card whose payments were never entered would show every old month as owed for ever.
  const closeList = [lastClose];
  while (closeList.length < BILL_CYCLES) closeList.unshift(closeBefore(closeList[0]));
  const prevClose = closeList[0];
  const batches = new Map(importBatches.map((b) => [b.id, b]));
  // A cycle whose own statement was imported is billed by that statement. The account keeps only its LATEST statement's amount, so
  // the older cycles used to look "not imported" and were estimated from every entry and alert in them - an alert for something the
  // NEXT statement then listed (dated on the statement day) was counted in the old bill, and the old bill swallowed the next payment.
  // The statement's own amount is kept on its batch (statementDue, from 7.6.6); an older batch without one is the sum of its rows.
  const statementOf = new Map(); // close -> the batch that is that cycle's statement
  for (const b of importBatches) {
    if (b.accountId === account.id && !b.provisional && b.periodEnd) statementOf.set(closeOf(b.periodEnd), b);
  }

  // Which cycle a transaction belongs to.
  const cycleOf = (t) => {
    const b = t.importBatchId ? batches.get(t.importBatchId) : null;
    if (b && !b.provisional && b.periodEnd) return closeOf(b.periodEnd);
    const close = closeOf(t.date);
    // A current list shows only what's unbilled. A row dated in a cycle that
    // closed well before the list was taken (ICICI's 11 Aug refund on the
    // 15 Sep list) is on the bill of the cycle the list was taken in.
    if (b && b.provisional) {
      const taken = listTakenOn(b);
      if (taken && close < addDays(taken, -3)) return closeOf(taken);
    }
    return close;
  };

  const spend = new Map(); // close -> net spend
  const refunds = new Map();
  const add = (close, t) => {
    const signed = t.direction === 'credit' ? -t.amount : t.amount;
    spend.set(close, (spend.get(close) || 0) + signed);
    if (t.direction === 'credit') refunds.set(close, (refunds.get(close) || 0) + t.amount);
  };
  // The same list pasted on two devices before they synced: identical rows
  // from different lists are counted as often as the list with most copies.
  const listRows = new Map();
  // Nothing dated more than two months before the cycle before last can land
  // in the cycles that matter - except a row from a current-transactions list,
  // which can carry an old refund.
  const tooOld = addDays(prevClose, -62);
  for (const t of transactions) {
    if (t.accountId !== account.id || t.isTransfer) continue;
    if (t.date < tooOld && !(t.importBatchId && batches.get(t.importBatchId)?.provisional)) continue;
    const close = cycleOf(t);
    if (close < prevClose) continue; // long since billed and paid
    const own = t.importBatchId ? batches.get(t.importBatchId) : null;
    if (statementOf.has(close) && !(own && !own.provisional)) continue; // that cycle has its statement: entries and alerts were drafts of it
    if (t.source === 'unbilled') {
      const key = `${close}|${t.date}|${t.amount}|${t.direction}|${t.rawDescription}`;
      const perList = listRows.get(key) || new Map();
      perList.set(t.importBatchId, [...(perList.get(t.importBatchId) || []), t]);
      listRows.set(key, perList);
      continue;
    }
    add(close, t);
  }
  for (const [key, perList] of listRows) {
    const close = key.split('|')[0];
    const copies = [...perList.values()].sort((a, b) => b.length - a.length)[0];
    for (const t of copies) add(close, t);
  }

  const paymentRows = [
    ...transactions.filter((t) => t.accountId === account.id && t.isTransfer && t.direction === 'credit'),
    ...extraPayments,
  ]
    .filter((p) => p.date > prevClose)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Bills for the cycles that have closed.
  const bills = closeList.map((close, i) => {
    const latest =
      account.statementDue != null && account.statementPeriodEnd && Math.abs(dateOf(account.statementPeriodEnd) - dateOf(close)) <= 3 * DAY_MS;
    const batch = statementOf.get(close);
    const fromStatement = latest || Boolean(batch);
    const recent = i >= closeList.length - 2;
    const stated = latest ? account.statementDue : batch && batch.statementDue != null ? batch.statementDue : null;
    return {
      close,
      fromStatement: Boolean(fromStatement),
      known: (Boolean(fromStatement) || spend.has(close)) && (recent || paymentRows.some((p) => p.date > close)),
      amount: stated != null ? stated : Math.max(0, spend.get(close) || 0),
      markedPaid: Boolean(latest && account.statementDuePaid),
      // The day after which a payment is no longer taken to be for this bill: its due date, or 20 days after the statement.
      paidBy: (latest && account.statementDueDate) || (batch && batch.statementDueDate) || addDays(close, 20),
      // A bill added up from its rows leaves out what the statement adds itself (interest, a fee): a payment a little above it is
      // that bill paid in full, not a payment ahead.
      summed: stated == null,
      left: 0,
    };
  });
  bills.forEach((b) => (b.left = b.amount));

  const payments = paymentRows;
  let advance = 0;
  for (const p of payments) {
    // Said to be paying ahead (the spending since the last statement, not a bill): it comes straight off this cycle.
    if (p.paysCurrent) { advance += p.amount; continue; }
    let amount = p.amount;
    const eligible = bills.filter((b) => b.known && b.close < p.date);
    // A bill marked paid is settled: a payment after its due date that was not said to be for it is new money, never swallowed
    // by that bill (which left a card payment made after the bill was marked paid changing nothing).
    const payable = eligible.filter((b) => !(b.markedPaid && p.date > b.paidBy && !p.paysStatement && !p.paysBill));
    for (const b of payable) {
      const take = Math.min(b.left, amount);
      b.left -= take;
      amount -= take;
      if (b.summed && take > 0 && b.left === 0 && amount > 0 && amount <= b.amount * 0.05 + 10000) amount = 0;
    }
    // Paid more than the bills in the app: the extra comes off this cycle - unless it was paid inside a cycle whose statement is
    // imported with its own total: that statement already took the payment off (ICICI printed Rs 7,899 paid on the 16th and a
    // bill of Rs 5,401), so taking it off the next cycle as well made Rs 9,292 of spending look like Rs 1,393.
    const ownBill = bills.find((b) => b.close === closeOf(p.date));
    const inStatement = Boolean(ownBill && ownBill.fromStatement && !ownBill.summed);
    if (amount > 0 && eligible.length && !inStatement) advance += amount;
  }
  for (const b of bills) if (b.markedPaid) b.left = 0;

  const unpaid = bills.filter((b) => b.fromStatement).reduce((s, b) => s + b.left, 0);
  const billedNotImported = bills.filter((b) => !b.fromStatement).reduce((s, b) => s + b.left, 0);
  const owed = Math.max((spend.get(cycleClose) || 0) - advance, -(unpaid + billedNotImported));
  return {
    unpaid,
    billedNotImported,
    owed,
    refunds: refunds.get(cycleClose) || 0,
    cycleClose,
    lastClose,
    statementMissing: bills[bills.length - 1].known && !bills[bills.length - 1].fromStatement,
    bills,
  };
}

const DAY_MS = 86400000;
const BILL_CYCLES = 4;

// The latest statement day on or before `iso`, clamped to short months.
function closeOnOrBefore(dayOfMonth, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const clamp = (year, monthIndex) => Math.min(dayOfMonth, new Date(year, monthIndex + 1, 0).getDate());
  if (clamp(y, m - 1) <= d) return isoLocal(new Date(y, m - 1, clamp(y, m - 1)));
  return isoLocal(new Date(y, m - 2, clamp(y, m - 2)));
}

export function cardCycleSpend(account, transactions, importBatches) {
  const cycleStart = currentCycleStart(account, importBatches);
  const spend = transactions
    .filter((t) => t.accountId === account.id && t.direction === 'debit' && !t.isTransfer && (!cycleStart || t.date > cycleStart))
    .reduce((s, t) => s + t.amount, 0);
  return { cycleStart, spend };
}
