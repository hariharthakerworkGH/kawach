// The test page (tests/index.html) sets its own database name before loading
// any module, so tests can never read or overwrite your real data.
const DB_NAME = globalThis.EXPENSE_TRACKER_DB_NAME || 'expense-tracker';
const DB_VERSION = 4;

let dbPromise = null;

// Whole-store reads, kept until the next write to that store. One Summary
// render used to read every transaction five or six times over (headline,
// attention list, upcoming bills, range breakdown); with a few years of
// statements that is tens of thousands of records per tap.
const readCache = new Map();

// Called after any write, so sync knows there is something to push.
let changeListener = null;
export function onLocalChange(fn) {
  changeListener = fn;
}
function notifyChanged(storeName) {
  readCache.delete(storeName);
  // Stores that never leave the device must not trigger an upload: sync
  // bookkeeping, and alerts that haven't been confirmed yet.
  if (storeName === 'syncMeta' || storeName === 'alertInbox') return;
  if (changeListener) changeListener(storeName);
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

async function store(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

// Every write is stamped so a merge between two devices can tell which copy of
// a record is the newer one. `stamp: false` is for restore and sync, which are
// writing records that already carry their own timestamp - re-stamping them
// would make incoming data always look newest and defeat the merge.
export async function put(storeName, value, { stamp = true } = {}) {
  if (stamp) value.updatedAt = Date.now();
  const s = await store(storeName, 'readwrite');
  await reqToPromise(s.put(value));
  notifyChanged(storeName);
  return value;
}

export async function get(storeName, id) {
  const s = await store(storeName, 'readonly');
  return reqToPromise(s.get(id));
}

export async function getAll(storeName) {
  if (!readCache.has(storeName)) {
    readCache.set(
      storeName,
      store(storeName, 'readonly').then((s) => reqToPromise(s.getAll()))
    );
  }
  try {
    // Each caller gets its own copy: screens attach working fields to records
    // (and sometimes change them before saving), which must never leak into
    // what the next screen reads.
    return structuredClone(await readCache.get(storeName));
  } catch (err) {
    readCache.delete(storeName);
    throw err;
  }
}

// For writes that bypass put/remove (the service worker, another tab).
export function forgetCachedReads() {
  readCache.clear();
}

export async function remove(storeName, id, { tombstone = true } = {}) {
  const s = await store(storeName, 'readwrite');
  await reqToPromise(s.delete(id));
  // Record that this was deleted here and when, so the next sync removes it on
  // your other device instead of sending it back.
  if (tombstone && storeName !== 'deletions' && storeName !== 'syncMeta') {
    const d = await store('deletions', 'readwrite');
    await reqToPromise(d.put({ id: `${storeName}:${id}`, store: storeName, recordId: id, deletedAt: Date.now() }));
    readCache.delete('deletions');
  }
  notifyChanged(storeName);
}

export function newId() {
  return crypto.randomUUID();
}

export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await put('settings', { id: key, value });
}
