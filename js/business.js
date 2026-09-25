import { getAll, getSetting, setSetting, put } from './db.js';
import { isoLocal, monthlyAmountOf } from './frequency.js';
import { isLiveCommitment, commitmentMatcher } from './commitments.js';
import { bankBalance } from './account-metrics.js';

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

// Who this is, for what the app shows: what pays for Home, and the
// businesses they run - as what pays for Home, or on the side (a salaried
// person opening a shop, a homemaker's tiffin service, a pensioner's trade).
export async function moneyProfile() {
  const [main, list] = await Promise.all([incomeType(), businesses()]);
  return { main, business: main === 'business' || list.length > 0, side: main !== 'business' && list.length > 0, businesses: list };
}

// --- Spaces: Home, and one for each business ------------------------------
// Each business is a space of its own: its accounts (account.space), its
// fixed costs (commitment.space) and its month. Home is everything else, and
// is paid for by the salary, pension, household money or the business. The
// space on screen is this device's choice, not data.

export async function businesses() {
  const list = await getSetting('businesses', []);
  return Array.isArray(list) ? list : [];
}

export async function addBusiness(name) {
  const list = await businesses();
  const id = `biz-${Date.now().toString(36)}`;
  await setSetting('businesses', [...list, { id, name: name.trim() || 'My business' }]);
  await ensureBusinessCategories();
  return id;
}

// GST registered: its return dates show in that business's Summary.
export async function setBusinessGst(id, gst) {
  const list = await businesses();
  await setSetting('businesses', list.map((b) => (b.id === id ? { ...b, gst } : b)));
}

export async function renameBusiness(id, name) {
  const list = await businesses();
  await setSetting('businesses', list.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)));
}

// A business closed: its accounts and costs come home, where they count.
export async function removeBusiness(id) {
  const [list, accounts, recurring] = await Promise.all([businesses(), getAll('accounts'), getAll('recurring')]);
  for (const a of accounts.filter((x) => x.space === id)) {
    const { business, space, ...rest } = a;
    await put('accounts', rest);
  }
  for (const r of recurring.filter((x) => x.space === id)) {
    const { space, ...rest } = r;
    await put('recurring', rest);
  }
  const left = list.filter((b) => b.id !== id);
  await setSetting('businesses', left);
  if (currentSpace() === id) setCurrentSpace('home');
}

const SPACE_KEY = 'kawach-space';
function currentSpace() {
  try {
    return localStorage.getItem(SPACE_KEY) || 'home';
  } catch {
    return 'home';
  }
}
export function setCurrentSpace(id) {
  try {
    localStorage.setItem(SPACE_KEY, id);
  } catch {
    // Without storage the app simply opens at Home each time.
  }
}
// The space on screen, falling back to Home if its business is gone.
export async function activeSpace() {
  const id = currentSpace();
  if (id === 'home') return 'home';
  return (await businesses()).some((b) => b.id === id) ? id : 'home';
}

export const accountInSpace = (space) => (a) => (space === 'home' ? !isBusinessAccount(a) : isBusinessAccount(a) && a.space === space);
export const commitmentInSpace = (space) => (r) => (space === 'home' ? !r.space || r.space === 'home' : r.space === space);

// Business accounts from before there were spaces, and a business chosen as
// the main income with none named yet, get a business to belong to.
export async function settleSpaces() {
  const [list, accounts, main] = await Promise.all([businesses(), getAll('accounts'), incomeType()]);
  const orphans = accounts.filter((a) => a.business && !list.some((b) => b.id === a.space));
  if (!orphans.length && (list.length || main !== 'business')) return;
  const id = list[0]?.id || (await addBusiness('My business'));
  for (const a of orphans) await put('accounts', { ...a, space: id });
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

// A business's month, for its own Summary: money in and out of its
// accounts, what it sent home, its fixed costs (shop rent, staff wages) and
// how much of them is still to pay, and what is left:
//   left = money in − money out − sent home − fixed costs still due
export function businessSpace(transactions, accounts, recurring, categories, spaceId, today) {
  const month = monthOf(today);
  const own = new Set(accounts.filter(accountInSpace(spaceId)).map((a) => a.id));
  const home = homeBankIds(accounts);
  const inMonth = transactions.filter((t) => own.has(t.accountId) && monthOf(t.date) === month);
  const moneyIn = inMonth.filter((t) => t.direction === 'credit' && !t.isTransfer).reduce((s, t) => s + t.amount, 0);
  const spends = inMonth.filter((t) => t.direction === 'debit' && !t.isTransfer);
  const moneyOut = spends.reduce((s, t) => s + t.amount, 0);
  const sentHome = inMonth
    .filter((t) => t.direction === 'debit' && t.isTransfer && (home.has(t.movedTo) || (!t.movedTo && transactions.some((c) => c.direction === 'credit' && c.isTransfer && home.has(c.accountId) && c.amount === t.amount && Math.abs(new Date(c.date) - new Date(t.date)) <= 3 * 86400000))))
    .reduce((s, t) => s + t.amount, 0);
  const claimed = new Set();
  const fixed = recurring
    .filter((r) => r.space === spaceId && isLiveCommitment(r, today))
    .map((r) => {
      const amount = monthlyAmountOf(r);
      const matcher = commitmentMatcher(r);
      let paid = 0;
      for (const t of spends) {
        if (claimed.has(t.id) || paid >= amount) continue;
        if (t.commitmentId === r.id || (matcher && matcher(t))) {
          claimed.add(t.id);
          paid += t.amount;
        }
      }
      return { id: r.id, label: r.label, amount, paid: Math.min(paid, amount), due: Math.max(0, amount - paid) };
    });
  const fixedDue = fixed.reduce((s, f) => s + f.due, 0);
  const byCategory = new Map();
  for (const t of spends) byCategory.set(t.categoryId || null, (byCategory.get(t.categoryId || null) || 0) + t.amount);
  const name = (id) => (id ? categories.find((c) => c.id === id)?.name || 'Other' : 'No category yet');
  const top = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => ({ name: name(id), amount }));
  return {
    moneyIn,
    moneyOut,
    sentHome,
    fixed,
    fixedDue,
    left: moneyIn - moneyOut - sentHome - fixedDue,
    top,
    needsCategory: spends.filter((t) => !t.categoryId).length,
    accountIds: [...own],
  };
}

/* How long the business would last if nothing else came in: what its accounts
 * hold, against what a month usually costs it. The three months just gone are
 * the measure, because one quiet month is not a trend, and the month running
 * now is only part of a month. Money moved home is not a cost of running the
 * shop, so it is left out.
 *
 * This is the question a salary never asks, which is why Summary only draws
 * it for a business (design.md section 9, Runway).
 */
export function businessRunway(transactions, accounts, spaceId, today) {
  const own = accounts.filter(accountInSpace(spaceId));
  const ids = new Set(own.map((a) => a.id));
  // Only accounts whose balance is known from a statement count: treating an
  // unknown balance as zero would say the shop is closer to empty than it is.
  const balances = own
    .filter((a) => a.type === 'bank' || a.type === 'cash')
    .map((a) => bankBalance(a, transactions))
    .filter((v) => v != null);
  if (!balances.length) return null;
  const have = balances.reduce((s, v) => s + v, 0);
  const months = [];
  const [y, m] = today.split('-').map(Number);
  for (let back = 1; back <= 3; back += 1) {
    const d = new Date(y, m - 1 - back, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const spent = months.map((key) =>
    transactions
      .filter((t) => ids.has(t.accountId) && t.direction === 'debit' && !t.isTransfer && monthOf(t.date) === key)
      .reduce((s, t) => s + t.amount, 0)
  );
  const active = spent.filter((v) => v > 0);
  if (active.length < 2 || have <= 0) return null;
  const needPerMonth = Math.round(active.reduce((s, v) => s + v, 0) / active.length);
  return { have, needPerMonth, covered: have / needPerMonth };
}
