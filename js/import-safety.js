import { getAll, put, remove } from './db.js';

// Two things that keep a wrongly read statement from hurting: what to double-check before saving, and a way to take a saved import back.
// (Kawach has no server, so nobody can see a bad import for you - the screen has to say so, and an undo has to be one tap.)

// Days an import can be taken back. After that its undo copy is dropped (it holds whole rows, and nobody undoes last month).
const UNDO_DAYS = 7;
const DAY = 864e5;

// Why this reading may be wrong, one plain line each. Empty when nothing looks off.
export function importConcerns({ parser, meta, account, accountUncertain, pickAccount, provisional }) {
  const out = [];
  if (accountUncertain && !account) out.push(`This adds a new ${parser.accountType === 'card' ? 'card' : 'account'}. If you already have it, pick it above.`);
  if (parser.general && !pickAccount && !provisional) out.push("Kawach doesn't know this bank's layout yet, so it guessed. Check the amounts, and money out against money in.");
  if (meta.reconciled === false) out.push("The rows don't add up to the statement's own totals.");
  return out;
}

// What an import has to remember to be taken back: the accounts as they were, the rows it removed or re-tagged, and what it created.
export const newUndo = () => ({ accountsBefore: [], addedAccounts: [], removed: [], retagged: [], emis: [] });

const recent = (b) => b.undo && Date.now() - Date.parse(b.importedAt) < UNDO_DAYS * DAY;

// The imports that can still be taken back, newest first, with the account's name.
export async function recentImports() {
  const [batches, accounts] = await Promise.all([getAll('importBatches'), getAll('accounts')]);
  const name = new Map(accounts.map((a) => [a.id, a.label]));
  return batches
    .filter(recent)
    .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))
    .map((b) => ({ id: b.id, label: name.get(b.accountId) || 'An account', importedAt: b.importedAt, count: b.txCount }));
}

// Takes one import back: its rows go, the rows it replaced return, the accounts are as they were. Limits: a category you chose on one of its
// rows goes with it, and money-moved flags it set on rows in OTHER accounts stay until the app next checks them.
export async function undoImport(id) {
  const batch = (await getAll('importBatches')).find((b) => b.id === id);
  if (!batch || !batch.undo) throw new Error('This import can no longer be taken back.');
  const u = batch.undo;
  const kept = new Set(u.retagged.map((r) => r.id));
  const rows = await getAll('transactions');
  for (const t of rows) if (t.importBatchId === id && !kept.has(t.id)) await remove('transactions', t.id);
  for (const r of u.retagged) {
    const t = rows.find((x) => x.id === r.id);
    if (t) await put('transactions', { ...t, importBatchId: r.importBatchId });
  }
  for (const t of u.removed) await put('transactions', t);
  for (const a of u.accountsBefore) await put('accounts', a);
  // An account this import started goes only if nothing else was saved on it since.
  const left = await getAll('transactions');
  for (const accountId of u.addedAccounts) if (!left.some((t) => t.accountId === accountId)) await remove('accounts', accountId);
  for (const e of u.emis) {
    if (e.before) await put('recurring', e.before);
    else await remove('recurring', e.id);
  }
  await remove('importBatches', id);
}

// Opening the app: the undo copy of an import older than a week is dropped.
export async function forgetOldUndo() {
  for (const b of await getAll('importBatches')) {
    if (b.undo && !recent(b)) {
      const { undo, ...rest } = b;
      await put('importBatches', rest, { stamp: false });
    }
  }
}
