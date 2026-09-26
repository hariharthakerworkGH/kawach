// A card's billing cycle closes on the same day-of-month every statement
// (the "billingCycleDay"). Given that, and no more recent real statement,
// we can still tell which transactions belong to the currently-open cycle
// (not yet billed) so manual entries logged before any statement exists
// still land in the right bucket.
function computeCycleBoundary(billingCycleDay, today = new Date()) {
  if (!billingCycleDay) return null;
  // The statement day, clamped to the length of the month it falls in: a card
  // that bills on the 31st bills on the 30th in April and the 28th in
  // February. Asking for new Date(y, m, 31) in a 30-day month instead rolls
  // into the next one, which pushed the boundary past today and hid the whole
  // open cycle - every spend looked like it belonged to a cycle that had not
  // started yet.
  const closeIn = (y, m) => new Date(y, m, Math.min(billingCycleDay, new Date(y, m + 1, 0).getDate()));
  // The last close strictly before today. A spend on the statement day itself
  // belongs to the cycle closing that day, and that cycle is still the open
  // one, so the boundary has to sit before it. This is the same answer
  // closeOnOrBefore() gives in js/account-metrics.js; the two are pinned
  // together by a test.
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  let boundary = closeIn(cutoff.getFullYear(), cutoff.getMonth());
  if (boundary > cutoff) boundary = closeIn(cutoff.getFullYear(), cutoff.getMonth() - 1);
  return toISODate(boundary);
}

// The open cycle's start date is whichever is later: the last real
// statement's period end, or the computed boundary from billingCycleDay.
// Transactions dated AFTER this value belong to the currently-open cycle.
export function currentCycleStart(account, importBatches, today = new Date()) {
  // Only real statements close a cycle. A "current transactions" list is a
  // snapshot of the cycle that's still open; counting its end date here would
  // move the cycle start to the day you pasted it and hide everything before.
  const batches = importBatches
    .filter((b) => b.accountId === account.id && !b.provisional)
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1));
  const lastImportBoundary = batches[0]?.periodEnd || null;
  const computedBoundary = computeCycleBoundary(account.billingCycleDay, today);

  if (lastImportBoundary && computedBoundary) {
    return lastImportBoundary > computedBoundary ? lastImportBoundary : computedBoundary;
  }
  return lastImportBoundary || computedBoundary;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
