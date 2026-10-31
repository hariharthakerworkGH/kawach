/* What the To do tab has already shown: read and unread, and "Got it".
 *
 * A person does not remember what they already dealt with, so a thing they have seen must not come back looking new.
 * Each row has a key and a size (an amount, a count, days). Opening the To do tab marks what it shows as read, and the
 * badge counts only what is unread. "Got it" on a notice (nothing to tap but the fact) hides it. Either way the row
 * is unread again only when it has got clearly worse (more than a tenth and more than `tol` above what was seen), or
 * after 30 days if it is still true. Stored as a map in the `todoSeen` setting, which syncs between devices. */

import { getSetting, setSetting } from './db.js';

const KEEP_DAYS = 30;
const DAY = 86400000;

const worse = (entry, val, tol = 0) => val > entry.val + Math.max(tol, entry.val * 0.1);
const stale = (entry, now) => now - (entry.at || 0) > KEEP_DAYS * DAY;

/* 'new' (never seen, or worse, or old), 'read' (seen, row stays) or 'hidden' (got it). */
export function seenState(map, key, val, tol = 0, now = Date.now()) {
  const entry = map && map[key];
  if (!entry || stale(entry, now) || worse(entry, val, tol)) return 'new';
  return entry.hide ? 'hidden' : 'read';
}

export const getSeen = async () => (await getSetting('todoSeen', {})) || {};

/* rows: [{key, val}]. Writes them as seen; an old entry (past its 30 days) is dropped on the way. */
export async function markSeen(rows, hide = false, now = Date.now()) {
  if (!rows.length) return;
  const map = await getSeen();
  for (const k of Object.keys(map)) if (stale(map[k], now)) delete map[k];
  for (const { key, val } of rows) map[key] = { val, hide, at: now };
  await setSetting('todoSeen', map);
}

/* The data-* a row carries so the tab can find what to mark: see the rows in views/summary.js and summary-looks.js. */
export const rowMeta = (m, state) => (m && m.key ? ` data-todo-key="${m.key}" data-todo-val="${Math.round(m.val)}"${state === 'new' ? ' data-todo-new="1"' : ''}` : '');

export const rowsIn = (panel, onlyNew = false) =>
  [...panel.querySelectorAll(onlyNew ? '[data-todo-new]' : '[data-todo-key]')].map((el) => ({ key: el.dataset.todoKey, val: Number(el.dataset.todoVal) }));
