// Work costs you pay first and the company pays back.
//
// Two flags on a payment, nothing else:
//   isReimbursable  a payment out (a hotel, a taxi) the employer will refund
//   isSettlement    a payment in that is that refund arriving
//
// What is owed back is every flagged payment out, ever, less every flagged
// payment in, ever. It is deliberately not a month's figure: a hotel swiped on
// the 26th is still owed on the 1st, and it only goes away when the money
// does. Months are for the budget (js/free-to-spend.js); this is a debt.
//
// A payment moved between your own accounts is neither (the same rule as
// everywhere else), and the answer never goes below nothing: being paid more
// than was claimed is not a debt the other way round.

export function reimbursableTally(transactions) {
  let out = 0;
  let back = 0;
  for (const t of transactions) {
    if (t.isTransfer) continue;
    if (t.direction === 'debit' && t.isReimbursable) out += t.amount;
    else if (t.direction === 'credit' && t.isSettlement) back += t.amount;
  }
  return { out, back, owed: Math.max(0, out - back) };
}

// The work costs still waiting to be paid back, oldest first.
//
// A refund is nearly always for the earliest claim, so what has come back is
// taken off the oldest costs first, and a cost that was only part refunded
// keeps its remainder. Each entry is { transaction, amount }: the cost, and how
// much of it is still owed. This is what lets the app say a refund is LATE -
// which needs a cost, not just a total - and it always adds up to the same
// owed figure as reimbursableTally().
export function unsettledCosts(transactions) {
  const costs = transactions
    .filter((t) => !t.isTransfer && t.direction === 'debit' && t.isReimbursable)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id) < String(b.id) ? -1 : 1));
  let back = transactions.filter((t) => !t.isTransfer && t.direction === 'credit' && t.isSettlement).reduce((s, t) => s + t.amount, 0);
  const waiting = [];
  for (const t of costs) {
    const covered = Math.min(back, t.amount);
    back -= covered;
    if (covered < t.amount) waiting.push({ transaction: t, amount: t.amount - covered });
  }
  return waiting;
}

// The flag that fits the way the money went. Switching a payment from Spent
// to Received (or back) must not leave the other flag behind, or a credit
// would quietly count as something it is not.
export function tidyFlags(t) {
  if (t.direction === 'credit') {
    delete t.isReimbursable;
    // "Apply to next month's commitments" is for a payment out as well.
    delete t.forNextMonth;
  } else {
    delete t.isSettlement;
  }
  return t;
}
