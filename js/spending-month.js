// Which month a spend actually belongs to.
//
// A calendar month is the wrong unit for a credit card. With a statement day
// of the 25th, something bought on the 26th of September never appears on the
// September statement - it lands on the one cut on 25 October and is paid in
// November. Filing it under September makes September look expensive and
// October look cheap, and neither figure matches what leaves your account.
//
// So card transactions are filed by billing cycle: anything after the
// statement day rolls into the next month. Bank and cash transactions are
// filed by calendar date, because that money has already gone.

export const CYCLE_SETTING_KEY = 'cycleAwareMonths';

export function monthKeyOf(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKeyOf(d);
}

// Salary paid at the end of a month is the next month's money (5.22): it
// lands on the 30th and is lived on through the month after, so counting it
// where it landed made one month look rich and the next look like a loss.
// A payment carries the month it counts for (`countsFor`) once you have said
// so; History asks the first time and, after a yes, files each salary that
// way by itself. Without it, a payment counts in the month of its date.
export const countsFor = (t) => t.countsFor || t.date.slice(0, 7);
export const nextMonthKey = (key) => shiftMonthKey(key, 1);

// A credit that looks like the salary arriving early for next month: into a
// home bank account you spend from, at least half the monthly income, in
// the last week of its month, and not yet given a month either way.
export function salaryLike(t, account, income) {
  if (!income || t.countsFor || t.direction !== 'credit' || t.isTransfer || t.personId || t.isSettlement) return false;
  if (!account || account.type !== 'bank' || account.business || account.spending === false) return false;
  if (t.amount < income / 2) return false;
  const [y, m, d] = t.date.split('-').map(Number);
  return d > new Date(y, m, 0).getDate() - 7;
}

// The month a single transaction counts towards.
export function spendingMonthOf(txn, account, cycleAware = true) {
  if (txn.countsFor) return txn.countsFor;
  const base = monthKeyOf(txn.date);
  if (!cycleAware) return base;
  if (!account || account.type !== 'card' || !account.billingCycleDay) return base;

  const day = new Date(txn.date).getDate();
  // On or before the statement day, it is still on the cycle that closes this
  // month. After it, it belongs to the next one.
  return day > account.billingCycleDay ? shiftMonthKey(base, 1) : base;
}

export function accountMap(accounts) {
  return new Map(accounts.map((a) => [a.id, a]));
}

export function currentMonthKey(now = new Date()) {
  return monthKeyOf(now);
}

export function previousMonthKey(monthKey) {
  return shiftMonthKey(monthKey, -1);
}
