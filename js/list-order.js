/* The order of every list a person picks from or reads down (5.51).
 *
 * One rule, everywhere: A to Z unless the person chose another way, and the way is theirs to choose
 * (Settings, How it looks, and a small control on the screen itself). Commitments can also go by the day they are
 * due, biggest first, or the order the person arranged with Reorder; accounts by size or their own order; categories
 * by how often they are used. A list that is only ever read in one order (a month's days) is not here. */
import { appearance } from './appearance.js';
import { byYourOrder } from './commitments.js';
import { monthlyAmountOf } from './frequency.js';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
export const compareText = (a, b) => collator.compare(String(a || ''), String(b || ''));

/* What each way is called on the little control; the longer words are in Settings. */
export const ORDER_WORDS = {
  plan: { name: 'A to Z', day: 'Due day', size: 'Biggest', yours: 'My order' },
  accountOrder: { name: 'A to Z', size: 'Biggest', yours: 'My order' },
  categoryOrder: { name: 'A to Z', used: 'Most used' },
};

export function sortCommitments(list, mode = appearance('plan')) {
  const name = (a, b) => compareText(a.label, b.label);
  const by =
    mode === 'day' ? (a, b) => (a.dayOfMonth || 32) - (b.dayOfMonth || 32) || name(a, b)
    : mode === 'size' ? (a, b) => monthlyAmountOf(b) - monthlyAmountOf(a) || name(a, b)
    : mode === 'yours' ? byYourOrder
    : name;
  return [...list].sort(by);
}

/* `sizeOf(account)` says how big an account is, for the biggest-first way; without it that way reads as A to Z. */
export function sortAccounts(list, mode = appearance('accountOrder'), sizeOf = null) {
  const name = (a, b) => compareText(a.label, b.label);
  const by = mode === 'yours' ? byYourOrder : mode === 'size' && sizeOf ? (a, b) => sizeOf(b) - sizeOf(a) || name(a, b) : name;
  return [...list].sort(by);
}

/* `usedOf(category)` says how many times it was used, for the most-used way; without it that way reads as A to Z. */
export function sortCategories(list, mode = appearance('categoryOrder'), usedOf = null) {
  const name = (a, b) => compareText(a.name, b.name);
  const by = mode === 'used' && usedOf ? (a, b) => usedOf(b) - usedOf(a) || name(a, b) : name;
  return [...list].sort(by);
}

/* How many payments each category has, from a list of payments. */
export function usageCounts(transactions) {
  const counts = new Map();
  for (const t of transactions) if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
  return (c) => counts.get(c.id) || 0;
}

/* The little control: <select> with the ways on offer, the chosen one picked. */
export function sortPicker(id, name, label) {
  const now = appearance(name);
  return `<select id="${id}" class="sort-pick" data-order="${name}" aria-label="${label}">${Object.entries(ORDER_WORDS[name])
    .map(([value, words]) => `<option value="${value}" ${value === now ? 'selected' : ''}>${words}</option>`)
    .join('')}</select>`;
}
