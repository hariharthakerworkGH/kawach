/* A card refund undoes one purchase (5.35). Money back on a card for exactly what was
 * charged, by the same merchant, is not new room to spend: it only cancels that purchase.
 * Paired like this, the purchase and the refund both drop out of the month's sums, so the
 * budget, a set-aside cost and what is owed back each read as if neither had happened.
 * Deliberately narrow, because cancelling a real purchase would hide spending: the same
 * card, the same amount to the paisa, a merchant word in common, back within 90 days. A
 * refund that does not fit stays as it was: it comes off the month's card spending. */
import { significantTokens } from './merchant-rules.js';

const DAY = 86400000;
const gap = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / DAY);

/* The pairs worth cancelling: the purchase is a work cost (any month, so the owed-back
 * figure comes down), or both fall in one calendar month. A purchase from an earlier
 * month that was counted then keeps its old rule: the refund is room in the month it lands. */
export function refundPairs(transactions, cardIds, today) {
  const spends = transactions.filter((t) => cardIds.has(t.accountId) && t.direction === 'debit' && !t.isTransfer && t.date <= today);
  const taken = new Set();
  const pairs = [];
  const credits = transactions
    .filter((t) => cardIds.has(t.accountId) && t.direction === 'credit' && !t.isTransfer && !t.isSettlement && !t.personId && t.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const refund of credits) {
    const words = new Set(significantTokens(refund.rawDescription || ''));
    if (!words.size) continue;
    const purchase = spends
      .filter(
        (p) =>
          !taken.has(p.id) &&
          p.accountId === refund.accountId &&
          p.amount === refund.amount &&
          p.date <= refund.date &&
          gap(p.date, refund.date) <= 90 &&
          significantTokens(p.rawDescription || '').some((w) => words.has(w))
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!purchase || !(purchase.isReimbursable === true || purchase.date.slice(0, 7) === refund.date.slice(0, 7))) continue;
    taken.add(purchase.id);
    pairs.push({ purchase, refund });
  }
  return pairs;
}
