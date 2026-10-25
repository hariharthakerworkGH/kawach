/* What a stored record has to look like before the rest of the app may touch it (5.43.1).
 *
 * One payment with no date used to leave Summary, History, Plan and Coach blank, with nothing said, because
 * every screen assumed the records were whole. A record can be damaged by a restore from another version, a
 * sync from a device running older code, or a spreadsheet with a blank cell, so the check lives where
 * records enter and leave storage (js/db.js), not on each screen:
 *   - tidyRecord() fills harmless gaps (a missing description is "", not a crash);
 *   - problemWith() names what cannot be tidied (no valid date, an amount that is not a number).
 * A record that fails is refused on the way in, and left out (not deleted) on the way out, and Settings
 * says how many there are and offers to remove them. */

/* The most one payment can be, in paise: 1,000 crore rupees. Anything above is a misread, not money. */
export const MAX_PAISE = 1e12;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validDate(s) {
  if (typeof s !== 'string' || !DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d;
}

export const isMoney = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_PAISE;

/* Stores whose records are checked. The rest (settings, sync bookkeeping) hold anything. */
export const CHECKED = new Set(['transactions', 'accounts', 'recurring', 'categories']);

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/* Fills the gaps that are harmless, in place. */
export function tidyRecord(store, r) {
  if (!r || typeof r !== 'object') return r;
  if (store === 'transactions') {
    r.rawDescription = text(r.rawDescription);
  } else if (store === 'accounts' || store === 'recurring') {
    r.label = text(r.label);
  } else if (store === 'categories') {
    r.name = text(r.name);
  }
  return r;
}

/* Why a record cannot be used, or null when it can. */
export function problemWith(store, r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'it is not a record';
  if (typeof r.id !== 'string' || !r.id) return 'it has no id';
  if (store === 'transactions') {
    if (!validDate(r.date)) return 'its date is missing or not a real day';
    if (!isMoney(r.amount) || r.amount < 0) return 'its amount is not a number';
    if (r.direction !== 'debit' && r.direction !== 'credit') return 'it is neither money out nor money in';
  } else if (store === 'recurring') {
    if (r.amount != null && !isMoney(r.amount)) return 'its amount is not a number';
  }
  return null;
}

export class BadRecordError extends Error {
  constructor(store, id, why) {
    super(`A record in ${store} cannot be saved: ${why}.`);
    this.name = 'BadRecordError';
    this.store = store;
    this.recordId = id;
  }
}

/* Splits a list into what can be used and what cannot (and why). Tidies the usable ones. */
export function screenRecords(store, rows) {
  if (!CHECKED.has(store)) return { good: rows, bad: [] };
  const good = [];
  const bad = [];
  for (const r of rows) {
    tidyRecord(store, r);
    const why = problemWith(store, r);
    if (why) bad.push({ store, id: r && r.id, why });
    else good.push(r);
  }
  return { good, bad };
}
