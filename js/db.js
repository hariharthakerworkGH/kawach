// The test page (tests/index.html) sets its own database name before loading
// any module, so tests can never read or overwrite your real data.
import { tidyRecord, problemWith, screenRecords, BadRecordError } from './records.js';

const DB_NAME = globalThis.EXPENSE_TRACKER_DB_NAME || 'expense-tracker';
const DB_VERSION = 4;

let dbPromise = null;

// Whole-store reads, kept until the next write to that store. One Summary
// render used to read every transaction five or six times over (headline,
// attention list, upcoming bills, range breakdown); with a few years of
// statements that is tens of thousands of records per tap.
const readCache = new Map();
// The same lists with damaged records taken out (js/records.js), worked out once per change instead of once per read.
const screenCache = new Map();

// Lets go of the connection, so a database can be deleted (the demo's, when it ends or starts over).
export async function closeDB() {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    // it never opened: nothing to close
  }
  dbPromise = null;
  readCache.clear();
  screenCache.clear();
}

// Called after any write, so sync knows there is something to push.
// Several things may listen (the sync trigger, the demo's guide). The old single slot let whichever came last
// silently replace the others. Returns the way to stop listening.
const changeListeners = new Set();
export function onLocalChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
// Something on this phone changed since the last sync: the next sync must send it. Kept where a reload keeps it.
export const DIRTY_KEY = 'kawach-sync-dirty';
function markDirty() {
  try {
    localStorage.setItem(DIRTY_KEY, String(Date.now()));
  } catch {
    // no storage: the next sync simply sends everything, as it always did
  }
}

// `fromSync`: this write is sync bringing in another device's data. It is not something to send back, and
// it is not a change for the sync trigger or anything else watching for the person's own changes.
function notifyChanged(storeName, fromSync = false) {
  readCache.delete(storeName);
  screenCache.delete(storeName);
  if (fromSync) return;
  if (storeName !== 'syncMeta' && storeName !== 'alertInbox') markDirty();
  // Stores that never leave the device must not trigger an upload: sync
  // bookkeeping, and alerts that haven't been confirmed yet.
  if (storeName === 'syncMeta' || storeName === 'alertInbox') return;
  for (const fn of [...changeListeners]) fn(storeName);
}

// All six stores from the data model are created now, even though Phase 1
// only touches three, so later phases don't need a version-bump migration.
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        const store = db.createObjectStore('transactions', { keyPath: 'id' });
        store.createIndex('date', 'date');
        store.createIndex('accountId', 'accountId');
        store.createIndex('categoryId', 'categoryId');
      }
      if (!db.objectStoreNames.contains('categories')) {
        const store = db.createObjectStore('categories', { keyPath: 'id' });
        store.createIndex('parentId', 'parentId');
      }
      if (!db.objectStoreNames.contains('merchantRules')) {
        db.createObjectStore('merchantRules', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('recurring')) {
        db.createObjectStore('recurring', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('importBatches')) {
        db.createObjectStore('importBatches', { keyPath: 'id' });
      }
      // v2: simple key/value for things like expected monthly income.
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      // v3: sync support. `deletions` holds tombstones - without them a merge
      // from another device would resurrect everything you'd deleted here.
      // `syncMeta` holds the gist id, token and last-sync marker; it is
      // deliberately never itself synced.
      if (!db.objectStoreNames.contains('deletions')) {
        db.createObjectStore('deletions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'id' });
      }
      // v4: bank alerts shared into the app, waiting to be confirmed. Kept
      // apart from transactions so an unconfirmed alert never affects a total.
      if (!db.objectStoreNames.contains('alertInbox')) {
        db.createObjectStore('alertInbox', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of the app opening in another tab or window needs this
      // connection closed before it can upgrade the database. Holding it open
      // would leave that window stuck on a blank screen.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        document.dispatchEvent(new CustomEvent('db-superseded'));
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // The reverse: this window has the newer version, and an older window that
    // doesn't know to let go is still open. Say so instead of hanging silently.
    req.onblocked = () => document.dispatchEvent(new CustomEvent('db-blocked'));
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Resolves when the browser has really committed the transaction (or says why it could not).
const committed = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('The database could not save that.'));
    tx.onerror = () => reject(tx.error);
  });

async function store(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

// Every write is stamped so a merge between two devices can tell which copy of
// a record is the newer one. `stamp: false` is for restore and sync, which are
// writing records that already carry their own timestamp - re-stamping them
// would make incoming data always look newest and defeat the merge.
export async function put(storeName, value, { stamp = true, fromSync = false } = {}) {
  // A record that would break the screens is refused here, with a plain reason (js/records.js).
  tidyRecord(storeName, value);
  const why = problemWith(storeName, value);
  if (why) throw new BadRecordError(storeName, value && value.id, why);
  if (stamp) value.updatedAt = Date.now();
  const s = await store(storeName, 'readwrite');
  const saved = committed(s.transaction);
  s.put(value);
  await saved;
  notifyChanged(storeName, fromSync);
  return value;
}

export async function get(storeName, id) {
  const s = await store(storeName, 'readonly');
  return reqToPromise(s.get(id));
}

/* The list as stored, held once and shared: nobody may change what this returns. */
function rawShared(storeName) {
  if (!readCache.has(storeName)) {
    readCache.set(
      storeName,
      store(storeName, 'readonly').then((s) => reqToPromise(s.getAll()))
    );
  }
  return readCache.get(storeName).catch((err) => {
    readCache.delete(storeName);
    throw err;
  });
}

// Each caller gets its own copy: screens attach working fields to records (and sometimes change them before
// saving), which must never leak into what the next screen reads. A record is flat apart from a few lists, so
// it is copied flat and only what is nested is cloned: about ten times quicker than cloning every record whole,
// which was the biggest cost of opening Summary with tens of thousands of payments.
function copyRows(rows) {
  const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const copy = { ...rows[i] };
    for (const key in copy) {
      const value = copy[key];
      if (value !== null && typeof value === 'object') copy[key] = structuredClone(value);
    }
    out[i] = copy;
  }
  return out;
}

/* Every record as stored, damaged ones included: for backups and sync, which must carry everything. */
export async function getAllRaw(storeName) {
  return copyRows(await rawShared(storeName));
}

/* Records the screens may use. A damaged one is left out (never deleted here) and counted, so a single bad
 * record cannot blank Summary, History and Plan; Settings lists them and offers to remove them. */
const damaged = new Map(); // store -> Map(id -> why)
export async function getAll(storeName) {
  if (!screenCache.has(storeName)) screenCache.set(storeName, rawShared(storeName).then((rows) => screenRecords(storeName, rows)));
  const { good, bad } = await screenCache.get(storeName);
  const before = damagedRecords().length;
  if (bad.length) damaged.set(storeName, new Map(bad.map((b) => [b.id, b.why])));
  else damaged.delete(storeName);
  if (damagedRecords().length !== before && typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('records-damaged'));
  return copyRows(good);
}

export function damagedRecords() {
  return [...damaged].flatMap(([storeName, ids]) => [...ids].map(([id, why]) => ({ store: storeName, id, why })));
}

/* Removes the damaged records. Tombstoned, so a synced device lets go of them too. */
export async function removeDamaged() {
  const list = damagedRecords();
  for (const d of list) await remove(d.store, d.id);
  damaged.clear();
  return list.length;
}

// For writes that bypass put/remove (the service worker, another tab).
export function forgetCachedReads() {
  readCache.clear();
  screenCache.clear();
}

export async function remove(storeName, id, { tombstone = true, fromSync = false } = {}) {
  const db = await openDB();
  // Record that this was deleted here and when, so the next sync removes it on your other device instead of
  // sending it back. Written in the same transaction as the delete: if the app is closed in between, either both
  // happened or neither did (before, the record could be deleted here and come back from the other device).
  const leaves = tombstone && storeName !== 'deletions' && storeName !== 'syncMeta';
  const tx = db.transaction(leaves ? [storeName, 'deletions'] : [storeName], 'readwrite');
  const saved = committed(tx);
  tx.objectStore(storeName).delete(id);
  if (leaves) tx.objectStore('deletions').put({ id: `${storeName}:${id}`, store: storeName, recordId: id, deletedAt: Date.now() });
  await saved;
  if (leaves) {
    readCache.delete('deletions');
    screenCache.delete('deletions');
  }
  notifyChanged(storeName, fromSync);
}

export function newId() {
  return crypto.randomUUID();
}

export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  // A stored null, or a list that is no longer a list, is the same as nothing stored: the screens
  // ask for a list and use it as one.
  if (!row || row.value == null) return fallback;
  if (Array.isArray(fallback) && !Array.isArray(row.value)) return fallback;
  return row.value;
}

export async function setSetting(key, value) {
  await put('settings', { id: key, value });
}

/* Swaps whole stores for the given records in ONE transaction: it all happens or none of it does. A restore
 * used to clear and refill record by record, so a failure half way left a half-restored phone. Records not in
 * `incoming` leave a tombstone (so a synced device lets go of them); the incoming ones are stamped now, because
 * restoring is you saying this is the truth. */
export async function replaceAll(incoming, stores) {
  const db = await openDB();
  const now = Date.now();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([...stores, 'deletions'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Nothing was changed.'));
    tx.onerror = () => reject(tx.error);
    const deletions = tx.objectStore('deletions');
    for (const name of stores) {
      const os = tx.objectStore(name);
      const rows = incoming[name] || [];
      const keep = new Set(rows.map((r) => r.id));
      const keys = os.getAllKeys();
      keys.onsuccess = () => {
        for (const id of keys.result) if (!keep.has(id)) deletions.put({ id: `${name}:${id}`, store: name, recordId: id, deletedAt: now });
        os.clear();
        for (const r of rows) os.put({ ...r, updatedAt: now });
      };
    }
  });
  readCache.clear();
  screenCache.clear();
  damaged.clear();
  for (const name of stores) notifyChanged(name);
}
