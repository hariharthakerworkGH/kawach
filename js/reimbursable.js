// Work costs you pay first and the company pays back.
//
// Two flags on a payment, nothing else:
//   isReimbursable  a payment out (a hotel, a taxi) the employer will refund
//   isSettlement    a payment in that is that refund arriving
//
// What is owed back is every flagged payment out, ever, less the flagged
// payments in that arrived after it (unsettledCosts). It is deliberately not a month's figure: a hotel swiped on
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
  // What is still owed is what the unsettled costs add up to, so this figure and the list under it can never differ.
  return { out, back, owed: unsettledCosts(transactions).reduce((s, u) => s + u.amount, 0) };
}

// The work costs still waiting to be paid back, oldest first.
//
// A refund is nearly always for the earliest claim, so each refund is taken off
// the oldest costs first, and a cost that was only part refunded keeps its
// remainder. A refund only pays costs from before it arrived (a cost swiped
// after the money came in is a new claim, not that refund's); rows with no date
// are treated as always eligible. Each entry is { transaction, amount }: the
// cost, and how much of it is still owed. This is what lets the app say a refund
// is LATE - which needs a cost, not just a total.
export function unsettledCosts(transactions) {
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id) < String(b.id) ? -1 : 1);
  const waiting = transactions
    .filter((t) => !t.isTransfer && t.direction === 'debit' && t.isReimbursable)
    .sort(byDate)
    .map((transaction) => ({ transaction, amount: transaction.amount }));
  const refunds = transactions.filter((t) => !t.isTransfer && t.direction === 'credit' && t.isSettlement).sort(byDate);
  for (const r of refunds) {
    let back = r.amount;
    for (const w of waiting) {
      if (back <= 0) break;
      if (w.amount <= 0 || (r.date && w.transaction.date && w.transaction.date > r.date)) continue;
      const take = Math.min(back, w.amount);
      w.amount -= take;
      back -= take;
    }
  }
  return waiting.filter((w) => w.amount > 0);
}

// Credits that look like the employer paying back, for the owner to confirm with one tap: money into a bank account from
// the same sender as the salary (same first 40 letters of the narration), smaller than half a salary, after the oldest
// cost still waiting. The app never marks one itself - it only knows what it has been told.
export function repaymentCandidates(transactions, { income = 0, bankIds, today }) {
  const oldest = unsettledCosts(transactions)[0]?.transaction.date;
  if (!oldest || income <= 0) return [];
  const credit = (t) => t.direction === 'credit' && !t.isTransfer && !t.isSettlement && !t.personId && bankIds.has(t.accountId) && t.date <= today;
  const sender = (t) => String(t.rawDescription || '').toUpperCase().slice(0, 40);
  const paid = new Set(transactions.filter((t) => credit(t) && t.amount >= income / 2).map(sender));
  return transactions
    .filter((t) => credit(t) && t.date >= oldest && t.amount < income / 2 && t.amount >= 50000 && paid.has(sender(t)))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 4)
    .map((t) => ({ id: t.id, date: t.date, amount: t.amount }));
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
    delete t.isShareBack;
  }
  return t;
}
