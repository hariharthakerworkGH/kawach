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

// The month a single transaction counts towards.
export function spendingMonthOf(txn, account, cycleAware = true) {
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
