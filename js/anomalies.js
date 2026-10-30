import { getAll } from './db.js';
import { significantTokens } from './merchant-rules.js';

const NEW_MERCHANT_THRESHOLD = 100000; // Rs. 1,000 in minor units - flag a first-ever big spend
const MIN_HISTORY_FOR_STATS = 2;

// Lightweight, explainable heuristics - not a hard guarantee. Flags recent
// debits that are unusually large for that specific merchant (based on their
// own history), or a meaningfully-sized spend at a merchant never seen before.
export async function detectAnomalies(sinceDate) {
  const [transactions, accounts] = await Promise.all([getAll('transactions'), getAll('accounts')]);
  // The house's spending only: a business's supplier payments aren't unusual
  // household spends.
  const business = new Set(accounts.filter((a) => a.business).map((a) => a.id));
  const debits = transactions.filter((t) => t.direction === 'debit' && !t.isTransfer && !business.has(t.accountId));

  // Each merchant's payments by date, with running totals, so "what did this shop usually cost before today" is
  // two lookups instead of a pass over its whole history for every recent payment (which took half a second a
  // screen with eighty thousand payments).
  const byMerchant = new Map();
  const keys = new Map();
  const keyOf = (t) => {
    if (!keys.has(t.rawDescription)) keys.set(t.rawDescription, merchantKeyFor(t.rawDescription));
    return keys.get(t.rawDescription);
  };
  for (const t of debits) {
    const key = keyOf(t);
    if (!key) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push(t);
  }
  const history = new Map();
  for (const [key, list] of byMerchant) {
    list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    const sum = [0];
    const sumSquares = [0];
    for (const h of list) {
      sum.push(sum[sum.length - 1] + h.amount);
      sumSquares.push(sumSquares[sumSquares.length - 1] + h.amount * h.amount);
    }
    history.set(key, { dates: list.map((h) => h.date), sum, sumSquares });
  }
  // How many of a merchant's payments come before this day.
  const before = (dates, day) => {
    let lo = 0;
    let hi = dates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] < day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // An alert words a shop shorter than its statement does ("AAURIS" against "AAURIS HOTELS MUMBAI"), so the exact key misses
  // last month's visit: the shop's first word counts too. A payment repeating in the same category at about the same amount
  // (a monthly EMI sent as "Transfer to ...") is not a new shop either.
  const firstWord = (t) => significantTokens(t.rawDescription)[0] || null;
  const seenWord = new Map(); // first word -> earliest date
  for (const t of debits) {
    const w = firstWord(t);
    if (w && (!seenWord.has(w) || t.date < seenWord.get(w))) seenWord.set(w, t.date);
  }
  const knownShop = (t) => {
    const w = firstWord(t);
    if (w && seenWord.get(w) < t.date) return true;
    return debits.some((o) => o.id !== t.id && o.date < t.date && o.categoryId && o.categoryId === t.categoryId && Math.abs(o.amount - t.amount) <= t.amount * 0.02);
  };

  const flagged = [];
  const recent = debits.filter((t) => t.date >= sinceDate);

  for (const t of recent) {
    const h = history.get(keyOf(t));
    const n = h ? before(h.dates, t.date) : 0;

    if (n >= MIN_HISTORY_FOR_STATS) {
      const avg = h.sum[n] / n;
      const variance = Math.max(0, h.sumSquares[n] / n - avg * avg);
      const stddev = Math.sqrt(variance);
      const threshold = Math.max(avg + 2 * stddev, avg * 1.5);
      if (t.amount > threshold) {
        flagged.push({ transaction: t, reason: 'unusual', averageAmount: avg });
      }
    } else if (n === 0 && t.amount >= NEW_MERCHANT_THRESHOLD && !knownShop(t)) {
      flagged.push({ transaction: t, reason: 'new-merchant', averageAmount: null });
    }
  }

  return flagged;
}

function merchantKeyFor(desc) {
  return significantTokens(desc).slice(0, 3).join(' ');
}
