import { getAll, getSetting, put } from './db.js';
import { isoLocal } from './frequency.js';

// Everyone who doesn't live on a salary.
//
// How money comes in is one setting, `incomeType`:
//   salary     a fixed amount on a set day (the app's first and default kind)
//   pension    the same shape as a salary, in its own words
//   household  money given for the house each month, the same shape again
//   business   what an owner takes home from the business, which varies
//
// A business owner runs the business from its own account (usually a
// current account) and moves money into a personal savings account as the
// house needs it. So:
//   - an account can be marked `business`. What a business account pays out
//     (stock, staff, shop rent) is never household spending, and it gets its
//     own categories (scope 'business'), including ones the owner makes up;
//   - money reaching the home accounts is what was taken home: moved over from
//     a business account, or paid in from outside (a customer paying the
//     owner's savings account directly is money that came home too). Money
//     moved between two home accounts, or a payment that came back, is not;
//   - with no fixed amount to plan on, the month's budget starts from the
//     lowest of the last three months taken home, so a slow month doesn't
//     catch the house out. Until there are three months to go on, it starts
//     from the owner's own estimate of what the house needs.

const INCOME_TYPES = ['salary', 'business', 'pension', 'household'];

export async function incomeType() {
  const type = await getSetting('incomeType', 'salary');
  return INCOME_TYPES.includes(type) ? type : 'salary';
}

// Who this is, for what the app shows: how money mainly comes in, and
// whether there is a business - as the main income, or on the side
// (`sideBusiness`: a salaried person opening a shop, a homemaker's tiffin
// service, a pensioner's small trade).
export async function moneyProfile() {
  const [main, side] = await Promise.all([incomeType(), getSetting('sideBusiness', false)]);
  return { main, business: main === 'business' || side === true, side: main !== 'business' && side === true };
}

// The words each kind of income is spoken of in.
export function incomeWords(type) {
  return (
    {
      business: { label: 'Taken home', noun: 'what you take home', afterBank: 'After bills', paid: 'Taken home' },
      pension: { label: 'Monthly pension', noun: 'pension', afterBank: 'After pension and bills', paid: 'Pension' },
      household: { label: 'Household money', noun: 'household money', afterBank: 'After household money and bills', paid: 'Household money' },
    }[type] || { label: 'Monthly salary', noun: 'salary', afterBank: 'After salary and bills', paid: 'Salary' }
  );
}

export const isBusinessAccount = (a) => Boolean(a && a.business);
export const isBusinessCategory = (c) => Boolean(c && c.scope === 'business');

// The categories that fit where the money moved: business ones for a
// business account, home ones for everything else.
export function categoriesFor(categories, account) {
  const business = isBusinessAccount(account);
  return categories.filter((c) => isBusinessCategory(c) === business);
}

// What most small businesses spend on. Owners add their own beside these.
const BUSINESS_CATEGORIES = [
  { id: 'cat-biz-stock', name: 'Stock and purchases' },
  { id: 'cat-biz-staff', name: 'Staff wages' },
  { id: 'cat-biz-rent', name: 'Shop rent' },
  { id: 'cat-biz-transport', name: 'Transport and delivery' },
  { id: 'cat-biz-bills', name: 'Shop bills' },
  { id: 'cat-biz-tax', name: 'Taxes and GST' },
  { id: 'cat-biz-bank', name: 'Bank charges' },
];

// Adds the starting business categories the first time they're needed. One
// the owner deleted stays deleted: only a store with none of them is filled.
export async function ensureBusinessCategories() {
  const categories = await getAll('categories');
  if (categories.some(isBusinessCategory)) return;
  for (const c of BUSINESS_CATEGORIES) await put('categories', { ...c, parentId: null, scope: 'business' });
}

const monthOf = (iso) => iso.slice(0, 7);
const upiIdOf = (t) => {
  const m = /([a-z0-9._]+@[a-z]{2,})/i.exec(t.rawDescription || '');
  return m ? m[1].toLowerCase() : null;
};

// The home accounts money is taken home to: bank accounts you spend from
// that aren't the business's.
const homeBankIds = (accounts) => new Set(accounts.filter((a) => a.type === 'bank' && a.spending !== false && !a.business).map((a) => a.id));
const businessIds = (accounts) => new Set(accounts.filter(isBusinessAccount).map((a) => a.id));

// A move between your own accounts that arrived from the business. Moves
// found before the app noted their direction are matched to a business
// payment of the same amount a few days either side.
function fromBusiness(t, transactions, business) {
  if (!t.isTransfer) return false;
  if (t.movedFrom) return business.has(t.movedFrom);
  return transactions.some(
    (d) => d.direction === 'debit' && d.isTransfer && business.has(d.accountId) && d.amount === t.amount && Math.abs(new Date(t.date) - new Date(d.date)) <= 3 * 86400000
  );
}

// Money that reached the home accounts in a month ('2026-09'). With
// `outside` false, only what was moved over from the business counts: for
// someone whose salary also lands there, that is the business's share.
export function takenHome(transactions, accounts, month, { outside = true } = {}) {
  const home = homeBankIds(accounts);
  const business = businessIds(accounts);
  // A payment that came back (same account, amount and UPI ID) isn't income.
  const sentBefore = (credit) =>
    transactions.some(
      (d) =>
        d.direction === 'debit' &&
        d.accountId === credit.accountId &&
        d.amount === credit.amount &&
        d.date <= credit.date &&
        upiIdOf(d) &&
        upiIdOf(d) === upiIdOf(credit) &&
        (new Date(credit.date) - new Date(d.date)) / 86400000 <= 45
    );
  return transactions
    .filter((t) => t.direction === 'credit' && home.has(t.accountId) && monthOf(t.date) === month)
    .filter((t) => (t.isTransfer ? fromBusiness(t, transactions, business) : outside && !sentBefore(t)))
    .reduce((s, t) => s + t.amount, 0);
}

const monthsBefore = (today, n) => {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => isoLocal(new Date(y, m - 2 - i, 1)).slice(0, 7));
};

// The amount a business owner's month is planned on: the lowest of the last
// three whole months taken home, once each of them has something on a home
// account to go by; the owner's estimate until then.
export function businessPlan(transactions, accounts, today, estimate = null, { outside = true } = {}) {
  const home = homeBankIds(accounts);
  const months = monthsBefore(today, 3).map((month) => ({ month, amount: takenHome(transactions, accounts, month, { outside }) }));
  const known = months.every(({ month }) => transactions.some((t) => home.has(t.accountId) && monthOf(t.date) === month));
  const thisMonth = takenHome(transactions, accounts, monthOf(today), { outside });
  if (known) {
    const lowest = months.reduce((a, b) => (b.amount < a.amount ? b : a));
    return { amount: lowest.amount, basis: 'lowest', lowestMonth: lowest.month, months, thisMonth };
  }
  return { amount: estimate, basis: estimate != null ? 'estimate' : null, lowestMonth: null, months, thisMonth };
}

// The business in one month: money in and out of its accounts (moving money
// between your own accounts is neither), what came home from it, and where
// most of the money went.
export function businessMonth(transactions, accounts, categories, month) {
  const business = businessIds(accounts);
  const home = homeBankIds(accounts);
  const inMonth = transactions.filter((t) => business.has(t.accountId) && monthOf(t.date) === month && !t.isTransfer);
  const moneyIn = inMonth.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0);
  const spends = inMonth.filter((t) => t.direction === 'debit');
  const moneyOut = spends.reduce((s, t) => s + t.amount, 0);
  const cameHome = transactions
    .filter((t) => t.direction === 'credit' && home.has(t.accountId) && monthOf(t.date) === month && fromBusiness(t, transactions, business))
    .reduce((s, t) => s + t.amount, 0);
  const byCategory = new Map();
  for (const t of spends) byCategory.set(t.categoryId || null, (byCategory.get(t.categoryId || null) || 0) + t.amount);
  const name = (id) => (id ? categories.find((c) => c.id === id)?.name || 'Other' : 'No category yet');
  const top = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => ({ name: name(id), amount }));
  return { moneyIn, moneyOut, takenHome: cameHome, top, accountIds: [...business] };
}
