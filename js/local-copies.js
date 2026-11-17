// The daily backup's copy on this phone (js/auto-backup.js).
//
// Kept in the app's own storage, a small database of its own: no permission asked and it works on every phone.
// It is not a folder you can see in Files, and it goes if the app is uninstalled or its data cleared - that is
// what the Drive copy is for. What this copy covers is the day something in the app goes wrong: a mistaken
// import, a bad restore, a phone that has lost its data but not its app.
// Each copy is the same locked file as any backup (backup.js), so nothing readable is ever stored here.

const KEEP_COPIES = 7;
let dbName = 'kawach-copies';

// Tests use a database of their own, as everywhere else.
export function useCopiesDatabase(name) {
  dbName = name;
}

const NAME_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Which days to remove: all but the newest `keep`. `days` are 'YYYY-MM-DD' in any order; anything else is left alone. */
export function copiesToDelete(days, keep = KEEP_COPIES) {
  return days
    .filter((d) => NAME_RE.test(d))
    .sort()
    .reverse()
    .slice(keep);
}

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No storage'));
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('copies', { keyPath: 'day' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// One transaction, one request: resolves with the request's result once the transaction is complete.
async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('copies', mode);
      const req = fn(tx.objectStore('copies'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Storage refused'));
    });
  } finally {
    db.close();
  }
}

/* Keeps today's copy (replacing one made earlier the same day) and drops the oldest beyond a week.
 * Returns false, never throws, when the phone will not store it (private window, storage full). */
export async function saveLocalCopy({ day, text, transactions }) {
  try {
    await run('readwrite', (s) => s.put({ day, text, transactions, at: Date.now() }));
    const days = (await run('readonly', (s) => s.getAllKeys())) || [];
    for (const old of copiesToDelete(days)) await run('readwrite', (s) => s.delete(old));
    return true;
  } catch {
    return false;
  }
}

// What is kept, newest first, without the files themselves.
export async function listLocalCopies() {
  try {
    const rows = (await run('readonly', (s) => s.getAll())) || [];
    return rows.map(({ day, at, transactions }) => ({ day, at, transactions })).sort((a, b) => (a.day < b.day ? 1 : -1));
  } catch {
    return [];
  }
}

export async function readLocalCopy(day) {
  const row = await run('readonly', (s) => s.get(day));
  if (!row) throw new Error('That copy is no longer on this phone.');
  return row.text;
}
