// A wrongly read statement must be seen before it is saved and be one tap to take back (5.88).
import { test, equal, ok } from './harness.js';
import { resetDB, putAll, txn } from './fixtures.js';
import { getAll } from '../js/db.js';
import { importConcerns, undoImport, recentImports, forgetOldUndo, newUndo } from '../js/import-safety.js';

const reading = (over = {}) => ({ parser: { accountType: 'bank', general: false }, meta: {}, account: { id: 'a' }, accountUncertain: false, pickAccount: false, provisional: false, ...over });

test('before saving: a file read by guesswork, a new account beside existing ones, or totals that do not add up are each said once', () => {
  equal(importConcerns(reading()), []);
  equal(importConcerns(reading({ meta: { reconciled: true } })), []);
  equal(importConcerns(reading({ parser: { accountType: 'card', general: true }, account: null, accountUncertain: true, meta: { reconciled: false } })).length, 3);
  equal(importConcerns(reading({ parser: { accountType: 'bank', general: true }, provisional: true })), [], 'a pasted current list is not a statement');
  equal(importConcerns(reading({ account: null, accountUncertain: false })), [], 'the first account of a new user is expected, not a warning');
});

const week = (n) => new Date(Date.now() - n * 864e5).toISOString();

async function savedImport({ importedAt = week(0) } = {}) {
  await resetDB();
  const before = { id: 'bank', type: 'bank', label: 'Bank', issuer: 'SBI', last4: '1234', knownBalance: 100000, knownBalanceDate: '2026-09-01' };
  const after = { ...before, knownBalance: 555500, knownBalanceDate: '2026-09-30' };
  const undo = newUndo();
  undo.accountsBefore.push(before);
  undo.addedAccounts.push('card');
  // a typed entry the statement replaced, and a row that was already there and now sits under this import
  const typed = txn({ id: 'typed', accountId: 'bank', date: '2026-09-05', amount: 100, importBatchId: undefined });
  undo.removed.push(typed);
  undo.retagged.push({ id: 'old', importBatchId: 'earlier' });
  await putAll('accounts', [after, { id: 'card', type: 'card', label: 'Card 3', issuer: 'SBI' }]);
  await putAll('importBatches', [{ id: 'b1', accountId: 'bank', importedAt, txCount: 2, undo }]);
  await putAll('transactions', [
    txn({ id: 'n1', accountId: 'bank', date: '2026-09-06', amount: 50, importBatchId: 'b1' }),
    txn({ id: 'n2', accountId: 'bank', date: '2026-09-07', amount: 60, importBatchId: 'b1' }),
    txn({ id: 'old', accountId: 'bank', date: '2026-09-02', amount: 70, importBatchId: 'b1' }),
  ]);
}

test('undo: the new rows go, the replaced entry returns, the account is as it was, the account the import started is removed', async () => {
  await savedImport();
  equal((await recentImports()).map((i) => i.id), ['b1']);
  await undoImport('b1');
  const rows = await getAll('transactions');
  equal(rows.map((t) => t.id).sort(), ['old', 'typed']);
  equal(rows.find((t) => t.id === 'old').importBatchId, 'earlier', 'a row that was already there goes back to the import it belonged to');
  const accounts = await getAll('accounts');
  equal(accounts.map((a) => a.id), ['bank']);
  equal(accounts[0].knownBalance, 100000);
  equal((await getAll('importBatches')).length, 0);
});

test('undo: an account the import started stays when something else was saved on it since', async () => {
  await savedImport();
  await putAll('transactions', [txn({ id: 'later', accountId: 'card', date: '2026-10-02', amount: 10 })]);
  await undoImport('b1');
  ok((await getAll('accounts')).some((a) => a.id === 'card'));
});

test('undo lasts a week: older imports are not offered and lose their copy when the app opens', async () => {
  await savedImport({ importedAt: week(8) });
  equal(await recentImports(), []);
  await forgetOldUndo();
  equal((await getAll('importBatches'))[0].undo, undefined);
  let failed = false;
  try { await undoImport('b1'); } catch { failed = true; }
  ok(failed, 'it says so instead of half-undoing');
});

/* --- found by the first-time-user sweep (5.89.1) ------------------------------------------------------------------------------------ */
import { formatRupees, formatCurrency } from '../js/format.js';
test('a figure that cannot be worked out is a dash, never "NaN" or "undefined" on a screen', () => {
  equal([formatRupees(NaN), formatRupees(undefined), formatCurrency(NaN), formatCurrency(Infinity)], ['—', '—', '—', '—']);
  equal([formatRupees(250000), formatCurrency(-123456)], ['₹2,500', '−₹1,234.56']);
});
