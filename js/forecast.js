/* The next three months (5.32): what leaves for fixed costs in each coming month, and
 * what is left of the money coming in. A month with a yearly insurance in it shows it,
 * so a short month is seen weeks ahead rather than on the day.
 *
 * It is the plan's own arithmetic, nothing guessed: the monthly income and the fixed
 * costs on Plan. A quarterly or yearly cost lands in full in the month it renews (its
 * date, when set; spread evenly when not); costs that have ended stop. Everyday
 * spending is not in it - what is left is what the month can spend. */
import { frequencyOf, monthlyAmountOf } from './frequency.js';
import { RENEWAL_MONTHS } from './calendar.js';

const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

/* What this cost takes out of month `key` (YYYY-MM): { amount, dated } where `dated` says it
 * is a whole renewal landing then, not a monthly slice. */
export function costInMonth(item, key) {
  if (item.endDate && item.endDate.slice(0, 7) < key) return { amount: 0, dated: false };
  const step = RENEWAL_MONTHS[frequencyOf(item)];
  if (step && item.renewsOn) {
    const [ry, rm] = item.renewsOn.split('-').map(Number);
    const [y, m] = key.split('-').map(Number);
    const diff = (y - ry) * 12 + (m - rm);
    return diff % step === 0 ? { amount: item.amount, dated: true } : { amount: 0, dated: false };
  }
  return { amount: monthlyAmountOf(item), dated: false };
}

/* What is in the bank at the start of each coming month, once that month's salary is in and its fixed costs
 * are out (5.50). It starts from the bank check on Summary (`bankAfter`: the bank after this month's bills, the
 * next salary and the next month's commitments, if nothing more is spent), so it follows what has been spent so far.
 *   stop  - the first month only: if you spend nothing more this month.
 *   spend - if you spend what is left of this month's budget (`freeNow`), and each coming month's "to spend" in full.
 * A month that comes up short has no "to spend", so nothing is taken off for it. Null when the bank check is not set up. */
export function bankAhead({ bankAfter, freeNow = 0, months, keep = 0 }) {
  if (bankAfter == null || !months.length) return null;
  const spend = [];
  let level = bankAfter - Math.max(0, freeNow || 0);
  spend.push(level);
  for (let n = 1; n < months.length; n++) {
    const income = months[n].free + months[n].costs + keep;
    level = level - Math.max(0, months[n - 1].free) + income - months[n].costs;
    spend.push(level);
  }
  return { stop: bankAfter, spend };
}

/* The coming months, from the one after today's. `income` is what comes in a month, `keep`
 * what is saved. Each: { key, costs, free, short, renewals: [{ label, amount }], extra } where
 * `extra` is how much more than an ordinary month the fixed costs are. */
export function forecast({ items, income, keep = 0, today, months = 3 }) {
  if (!(income > 0) || !items.length) return [];
  const [ty, tm] = today.split('-').map(Number);
  const usual = items.reduce((t, i) => t + monthlyAmountOf(i), 0);
  return Array.from({ length: months }, (_, n) => {
    const d = new Date(ty, tm + n, 1);
    const key = ym(d.getFullYear(), d.getMonth() + 1);
    const parts = items.map((item) => ({ item, ...costInMonth(item, key) }));
    const costs = parts.reduce((t, p) => t + p.amount, 0);
    const free = income - costs - keep;
    return {
      key,
      costs,
      free,
      short: free < 0,
      extra: costs - usual,
      renewals: parts.filter((p) => p.dated && p.amount > 0).map((p) => ({ label: p.item.label, amount: p.amount })).sort((a, b) => b.amount - a.amount),
    };
  });
}
