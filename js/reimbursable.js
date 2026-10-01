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
