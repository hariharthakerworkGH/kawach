// Made-up data for the tests. Modelled on real situations (a salary on the
// last day of the month, statements on the 25th, an EMI paid on salary day,
// ATM cash) but no real statement, name or account number.
import { openDB, put, forgetCachedReads } from '../js/db.js';

const STORES = ['accounts', 'transactions', 'categories', 'merchantRules', 'recurring', 'importBatches', 'settings', 'deletions', 'alertInbox'];

// Empties the TEST database. Refuses to run against any other.
export async function resetDB() {
  if (globalThis.EXPENSE_TRACKER_DB_NAME !== 'expense-tracker-tests') throw new Error('Refusing to clear a database that is not the test database');
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  forgetCachedReads();
}

export const rupees = (n) => Math.round(n * 100);

let seq = 0;
export function txn(fields) {
  seq += 1;
  return {
    id: `t${seq}`,
    categoryId: null,
    source: 'statement',
    importBatchId: null,
    isTransfer: false,
    notes: null,
    direction: 'debit',
    ...fields,
    amount: rupees(fields.amount),
  };
}

export function commitment(fields) {
  seq += 1;
  return {
    id: `c${seq}`,
    frequency: 'monthly',
    dayOfMonth: 1,
    accountId: null,
    categoryId: null,
    active: true,
    source: 'fixed',
    ...fields,
    amount: rupees(fields.amount),
  };
}

// One bank account, one card (statement day 25), salary ₹1,00,000 on the 31st,
// ₹5,000 saved a month. Bank balance ₹50,000 on 15 Sep.
export async function seedBasics({ income = 100000, keep = 5000, bankBalance = 50000, balanceDate = '2026-09-15' } = {}) {
  await resetDB();
  await put('accounts', { id: 'bank', label: 'Test Bank', type: 'bank', issuer: 'Test Bank', last4: '1111', knownBalance: rupees(bankBalance), knownBalanceDate: balanceDate });
  await put('accounts', { id: 'card', label: 'Test Card', type: 'card', issuer: 'Test Bank', last4: '2222', billingCycleDay: 25 });
  await put('categories', { id: 'food', name: 'Food & Dining' });
  await put('categories', { id: 'transport', name: 'Transport' });
  await put('settings', { id: 'monthlyIncome', value: rupees(income) });
  await put('settings', { id: 'salaryDay', value: 31 });
  await put('settings', { id: 'keepInBank', value: rupees(keep) });
}

export async function putAll(store, records) {
  for (const r of records) await put(store, r);
}

// Local noon, so no time zone can move the date.
export const day = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
