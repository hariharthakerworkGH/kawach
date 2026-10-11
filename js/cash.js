/* Cash as a pocket (5.44).
 *
 * Until now a bank withdrawal at an ATM counted as spending the day it left the bank, and cash you spent and wrote
 * down counted for nothing (so it was not counted twice). Writing down a 500 rupee chai changed nothing, and the
 * Add screen opens on Cash. Now:
 *
 *   - a withdrawal is money moved into your cash pocket, not spending;
 *   - cash you spend counts the day you write it down;
 *   - cash taken out that is never written down is counted as spent after GRACE days (30), so someone who does
 *     not write cash down is never shown a rosier figure than the truth. What was written down is taken from the
 *     oldest cash first, so only the remainder is ever counted that way, and nothing is counted twice.
 *
 * It starts on the day it first ran on this phone (the `cashRuleFrom` setting), so no month that has already been
 * worked out changes: withdrawals before that day count as they always did.
 *
 * Pure: it is given lists and a day, and returns what counts and what is left in the pocket. */
import { isoLocal } from './frequency.js';

export const CASH_GRACE_DAYS = 30;

export const addDaysIso = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoLocal(new Date(y, m - 1, d + days));
};

/* takenOut and spends: [{ id, date, amount }]. Returns:
 *   expired   [{ date, amount, lotDate }]  cash taken out and never written down, counted as spent on its last day
 *   inPocket  what is left of cash taken out and not yet written down, still inside its days
 *   lots      each withdrawal with what was written against it and what remains (for the Accounts line)
 *   beyond    what was written down as spent beyond everything taken out (cash from elsewhere): it still counts */
export function cashPocket({ takenOut = [], spends = [], today, graceDays = CASH_GRACE_DAYS }) {
  const lots = takenOut
    .map((t) => ({ id: t.id, date: t.date, amount: t.amount, left: t.amount, expires: addDaysIso(t.date, graceDays) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let beyond = 0;
  for (const s of [...spends].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    let need = s.amount;
    // The oldest cash that was already out on the day, and has not run out of days.
    for (const lot of lots) {
      if (need <= 0) break;
      if (lot.left <= 0 || lot.date > s.date || lot.expires <= s.date) continue;
      const take = Math.min(lot.left, need);
      lot.left -= take;
      need -= take;
    }
    beyond += need;
  }
  const expired = [];
  let inPocket = 0;
  for (const lot of lots) {
    if (lot.left <= 0) continue;
    if (lot.expires <= today) expired.push({ date: lot.expires, amount: lot.left, lotDate: lot.date });
    else inPocket += lot.left;
  }
  return { expired, inPocket, lots, beyond };
}
