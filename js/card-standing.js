// Where every card stands: what is owed, what is billed and unpaid. ONE calculation, read by Summary
// (js/free-to-spend.js) and by Accounts, so the two can never show different figures for the same card.
import { cardBillDue, cardOwedThisCycle, cardPosition, statementDay, isEverydayBank } from './account-metrics.js';
import { looksLikeCardPayment } from './transfers.js';
import { DAY_MS, addDays, dateOf } from './free-to-spend-parts.js';

// A bank debit and a card credit this many days apart, for the same amount, are one payment seen from both sides.
const PAIR_DAYS = 7;

// A card bill paid from the bank leaves the bank at once, but the card's "payment received" only reaches the app
// with the next list or statement. Until then the bank-side payment has to count as paying the card, or the bill is
// taken off twice: once from the bank balance, once as unpaid. A payment already linked to its card side
// (`settledWith`) is never one of these; otherwise each card credit pairs with one bank payment only.
export function bankOnlyCardPayments(transactions, bankIds, cardIds) {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  // The links you made come first, so a guess by amount and date can never take a card credit that is already someone's other half.
  const paired = new Set(transactions.filter((t) => t.settledWith && byId.has(t.settledWith)).map((t) => t.settledWith));
  return transactions.filter((t) => {
    // Naming the card is the decision: such a payment counts even when the move flag was later switched off.
    if (!bankIds.has(t.accountId) || t.direction !== 'debit' || !(t.paysCardId || (t.isTransfer && looksLikeCardPayment(t, 'bank')))) return false;
    if (t.settledWith && byId.has(t.settledWith)) return false;
    const twin = transactions.find(
      (c) =>
        cardIds.has(c.accountId) &&
        (!t.paysCardId || c.accountId === t.paysCardId) &&
        c.direction === 'credit' &&
        c.isTransfer &&
        c.amount === t.amount &&
        !paired.has(c.id) &&
        Math.abs(dateOf(c.date) - dateOf(t.date)) <= PAIR_DAYS * DAY_MS
    );
    if (twin) paired.add(twin.id);
    return !twin;
  });
}

/* { cards, unassigned }: one entry per card account, in the order of `accounts`.
 * Each: account, cycleStart, since, bill, owed (spent this cycle, net), unpaid (billed and not yet paid, in total),
 * billedNotImported, refunds, statementMissing, listImportedAt, positioned.
 * `unassigned` are bank-side card payments that name no card and fit none: Summary asks which card they paid. */
export function cardStandings(accounts, transactions, importBatches, today) {
  const bankIds = new Set(accounts.filter(isEverydayBank).map((a) => a.id));
  const cardAccounts = accounts.filter((a) => a.type === 'card');
  const cardIds = new Set(cardAccounts.map((a) => a.id));
  const bankOnly = bankOnlyCardPayments(transactions, bankIds, cardIds);

  const cards = cardAccounts.map((account) => {
    const { owed: owedNet, cycleStart, since } = cardOwedThisCycle(account, transactions, importBatches, today);
    const bill = cardBillDue(account);
    const credits = transactions
      .filter((t) => t.accountId === account.id && t.isTransfer && t.direction === 'credit' && (!since || t.date > since))
      .reduce((s, t) => s + t.amount, 0);
    return { account, owedNet, cycleStart, since, bill, credits, extraPayments: [] };
  });

  // Hand each bank-only payment to the card it paid: the card you picked for it, then the card's digits in the bank's
  // description, otherwise the one card whose bill it equals. A payment through CRED names no card at all, so one that
  // fits none of these is listed for you to say which card it paid.
  const unassigned = [];
  for (const p of bankOnly) {
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
      unassigned.push(p);
    }
  }

  for (const c of cards) {
    if (statementDay(c.account, importBatches)) {
      // Worked out cycle by cycle, which matches each payment to the bill it paid.
      const p = cardPosition(c.account, transactions, importBatches, today, c.extraPayments);
      c.owed = p.owed;
      c.unpaid = p.unpaid + p.billedNotImported;
      c.billedNotImported = p.billedNotImported;
      c.refunds = p.refunds;
      c.statementMissing = p.statementMissing;
      c.lastClose = p.lastClose;
      c.cycleClose = p.cycleClose;
      c.positioned = true;
      c.bills = p.bills;
    } else {
      // No statement day yet: everything since the last imported statement. Payments since it first settle that
      // statement's bill, and anything beyond it comes off what's owed since. Once the bill is marked paid, the first
      // payments are taken to be the ones that paid it.
      const billed = c.bill && !c.bill.paid ? c.bill.amount : 0;
      const payments = c.bill && c.bill.paid ? Math.max(0, c.credits - c.bill.amount) : c.credits;
      const total = Math.max(0, billed + c.owedNet - payments);
      c.unpaid = Math.min(total, Math.max(0, billed - payments));
      c.owed = total - c.unpaid;
      c.billedNotImported = 0;
      c.statementMissing = false;
      c.positioned = false;
    }
    const latestList = importBatches
      .filter((b) => b.accountId === c.account.id && b.provisional)
      .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))[0];
    c.listImportedAt = latestList ? latestList.importedAt : null;
    delete c.credits;
    delete c.owedNet;
    delete c.extraPayments;
  }
  return { cards, unassigned };
}

// A card payment pays either a bill the statement already made, or the spending since it (paying ahead): the best guess from
// what the card owes, to start the question from. 'bill' unless nothing is billed and the cycle's spending covers it.
export function whatItPaid(standing, amount) {
  if (!standing) return 'bill';
  if (standing.unpaid >= amount * 0.99) return 'bill';
  return standing.owed >= amount * 0.95 ? 'current' : 'bill';
}
