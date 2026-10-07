import { getAll, put, newId } from './db.js';
import { SEED_MERCHANTS } from './merchant-seed.js';

// Words that show up constantly in narrations but never identify a merchant
// (payment-gateway prefixes, corporate suffixes, generic connectors).
const STOPWORDS = new Set([
  'pay', 'ptm', 'rsp', 'bppy', 'upi', 'value', 'dt', 'ref', 'pvt', 'ltd',
  'private', 'limited', 'com', 'www', 'the', 'and', 'for', 'from', 'india',
  'llc', 'llp', 'inc', 'services', 'service', 'payment', 'transaction',
]);

// The same merchant often shows up under different payment-gateway prefixes
// across statements ("PAY*SWIGGY...", "PTM*SWIGGY...", "RSP*SWIGGY...") or
// with the city glued onto the end with no space ("SwiggyBENGALURU"). Exact
// or single-key matching misses all of that, so instead of one key we keep
// a handful of "significant" words per description and match on overlap.
export function significantTokens(rawDescription) {
  const cleaned = rawDescription
    .replace(/Value Dt.*$/i, '')
    .replace(/\(?Ref#?\s*\d+.*$/i, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()))
    .map((w) => w.toLowerCase());
}

export function extractMerchantKey(rawDescription) {
  return significantTokens(rawDescription).slice(0, 4).join(' ');
}

/* Money coming in is filed under Income, Salary or Sales; money going out never
 * is. The merchant matcher below used to know nothing about which way a payment
 * went, so a Swiggy cashback once filed as Income taught it that "Swiggy" means
 * Income, and the next Swiggy SPEND was filed there too (5.23). Two rules now:
 * a payment out is never matched to an income category, and a rule learned
 * from money in only applies to money in. */
export const isIncomeCategory = (c) => Boolean(c) && (c.id === 'cat-income' || /\b(income|salary|sales|revenue)\b/i.test(c.name || ''));

// Whether a category can be given to a payment going this way.
export const fitsDirection = (category, direction) => !(direction === 'debit' && isIncomeCategory(category));

async function incomeCategoryIds() {
  return new Set((await getAll('categories')).filter(isIncomeCategory).map((c) => c.id));
}

export async function matchCategoryForDescription(rawDescription, direction = null) {
  return matchWithRules(rawDescription, await knownRules(), direction, await incomeCategoryIds());
}

// What you have taught it, plus the merchants it ships knowing. The seeds
// carry hitCount 0 and go last, so where a seed and a rule you taught fit a
// line equally well, matchWithRules breaks the tie on hitCount and yours
// wins. Before this, someone importing their first statement had no rules at
// all and every row came back blank.
async function knownRules() {
  return [...(await getAll('merchantRules')), ...SEED_MERCHANTS];
}

// Takes the rules as an argument so a bulk pass over hundreds of transactions
// reads the rule table once instead of once per transaction.
function matchWithRules(rawDescription, rules, direction = null, incomeIds = new Set()) {
  const tokens = new Set(significantTokens(rawDescription));
  if (tokens.size === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const rule of rules) {
    // A payment out is never income, and a rule taught by money in is not
    // applied to money out (or the other way round).
    if (direction === 'debit' && incomeIds.has(rule.categoryId)) continue;
    if (direction && rule.direction && rule.direction !== direction) continue;
    const ruleTokens = rule.matchPattern.split(' ').filter(Boolean);
    let score = 0;
    const hit = new Set();
    for (const t of tokens) {
      for (const rt of ruleTokens) {
        if (t === rt) {
          score += 2;
          hit.add(rt);
        } else if (t.length >= 4 && rt.length >= 4 && (t.includes(rt) || rt.includes(t))) {
          score += 1;
          hit.add(rt);
        }
      }
    }
    // How much of the rule the line fits. A rule taught from "SWIGGY HDFC BANK
    // CREDIT CARD CASHBACK" fits a plain "SWIGGY" line by one word in four, and
    // used to score the same as the built-in rule that is just "swiggy" - and,
    // being yours, won the tie.
    score *= ruleTokens.length ? hit.size / ruleTokens.length : 0;
    if (score > bestScore || (score === bestScore && score > 0 && rule.hitCount > (best?.hitCount || 0))) {
      bestScore = score;
      best = rule;
    }
  }

  return bestScore > 0 ? best.categoryId : null;
}

// Applies everything learned so far to transactions that still have no
// category - typically statements imported before you'd taught the app
// anything. Only ever fills a blank: a category set by hand, or a split, is
// never touched. Pass `dryRun` to count what it would do without doing it.
export async function applyLearnedCategories({ dryRun = false } = {}) {
  const [transactions, rules] = await Promise.all([getAll('transactions'), knownRules()]);
  if (rules.length === 0) return 0;

  const incomeIds = await incomeCategoryIds();
  let changed = 0;
  for (const t of transactions) {
    if (t.categoryId || t.isTransfer || t.personId || (Array.isArray(t.splits) && t.splits.length)) continue;
    const categoryId = matchWithRules(t.rawDescription, rules, t.direction, incomeIds);
    if (!categoryId) continue;
    changed++;
    if (dryRun) continue;
    t.categoryId = categoryId;
    await put('transactions', t);
  }
  return changed;
}

// `direction` ('debit' or 'credit') is remembered with the rule, so what is
// learned from a payment in is not applied to a payment out.
export async function learnFromAssignment(rawDescription, categoryId, direction = null) {
  const key = extractMerchantKey(rawDescription);
  if (!key) return;
  // A payment out filed under Income is a mistake, not something to learn.
  if (direction === 'debit' && isIncomeCategory((await getAll('categories')).find((c) => c.id === categoryId))) return;
  const rules = await getAll('merchantRules');
  const existing = rules.find((r) => r.matchPattern === key && (!r.direction || !direction || r.direction === direction));
  if (existing) {
    existing.categoryId = categoryId;
    existing.hitCount = (existing.hitCount || 0) + 1;
    if (direction && !existing.direction) existing.direction = direction;
    await put('merchantRules', existing);
  } else {
    await put('merchantRules', { id: newId(), matchPattern: key, categoryId, hitCount: 1, ...(direction ? { direction } : {}) });
  }
}

/* Spends that were filed under Income before this was a rule: cleared, and
 * given a category again from what the app knows (never Income). Returns how
 * many were cleared and how many of those found a category. */
export async function fixIncomeSpends() {
  const [transactions, categories] = await Promise.all([getAll('transactions'), getAll('categories')]);
  const income = new Set(categories.filter(isIncomeCategory).map((c) => c.id));
  const wrong = transactions.filter((t) => t.direction === 'debit' && !t.isTransfer && income.has(t.categoryId));
  for (const t of wrong) await put('transactions', { ...t, categoryId: null });
  if (wrong.length) await applyLearnedCategories();
  const after = new Map((await getAll('transactions')).map((t) => [t.id, t]));
  return { cleared: wrong.length, sorted: wrong.filter((t) => after.get(t.id)?.categoryId).length };
}

// How many spends are filed under Income right now.
export async function incomeSpendCount() {
  const [transactions, categories] = await Promise.all([getAll('transactions'), getAll('categories')]);
  const income = new Set(categories.filter(isIncomeCategory).map((c) => c.id));
  return transactions.filter((t) => t.direction === 'debit' && !t.isTransfer && income.has(t.categoryId)).length;
}
