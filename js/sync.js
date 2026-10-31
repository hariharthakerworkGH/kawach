import { fetchRetry } from './net.js';
import { getAllRaw, put, remove, get, DIRTY_KEY } from './db.js';
import { tidyRecord, problemWith } from './records.js';
import { encryptPayload, decryptPayload } from './backup.js';
import { backupPassphrase, readSyncFile, writeSyncFile, noteServerTime, clockSkew } from './drive.js';

// Sync between your own devices through one encrypted file, kept either in
// Kawach's hidden folder in your own Google Drive (the usual way: same Google
// account and backup passphrase on each device, nothing else to set up) or in
// a secret GitHub Gist (for those who already sync that way).
//
// Either place holds the same AES-GCM encrypted blob the backup feature
// produces. Google and GitHub never see anything but ciphertext. Nothing is
// sent anywhere until you turn sync on.
//
// Merging is per record, not whole-file. Whole-file "last device wins" is what
// loses an afternoon of entries from your phone because the laptop synced
// after it. Instead every record carries `updatedAt`, every delete leaves a
// tombstone, and the newer of the two always wins.

const GIST_FILENAME = 'expense-tracker-data.json';
const SYNCED_STORES = ['accounts', 'transactions', 'categories', 'merchantRules', 'recurring', 'importBatches', 'settings'];
const API = 'https://api.github.com';

export async function getSyncConfig() {
  const [provider, token, gistId, lastSync, deviceName, clockSkewMs] = await Promise.all([
    getMeta('provider'),
    getMeta('token'),
    getMeta('gistId'),
    getMeta('lastSync'),
    getMeta('deviceName'),
    getMeta('clockSkewMs'),
  ]);
  // Phones that synced through GitHub before Google was an option have a
  // token and no provider saved.
  const via = provider || (token ? 'github' : null);
  return { provider: via, token, gistId, lastSync, deviceName, clockSkewMs, configured: via === 'google' || Boolean(token) };
}

export async function turnOnGoogleSync() {
  await setMeta('provider', 'google');
}

export async function saveSyncConfig({ token, gistId, deviceName }) {
  if (token !== undefined) await setMeta('token', token);
  if (gistId !== undefined) await setMeta('gistId', gistId);
  if (deviceName !== undefined) await setMeta('deviceName', deviceName);
}

export async function clearSyncConfig() {
  await remove('syncMeta', 'provider', { tombstone: false });
  await remove('syncMeta', 'token', { tombstone: false });
  await remove('syncMeta', 'gistId', { tombstone: false });
  await remove('syncMeta', 'lastSync', { tombstone: false });
}

// The passphrase is kept on the device so sync can run without prompting every
// time. That costs nothing in safety: the transactions themselves are already
// sitting unencrypted in this browser's storage, so anyone who can read the
// passphrase could read the data directly anyway. What it protects is the
// gist - the copy that lives somewhere you don't control - and that stays
// protected. It is stored in `syncMeta`, which is never itself synced.
export async function getSyncPassphrase() {
  const { provider } = await getSyncConfig();
  // Google sync is locked with the backup passphrase: one passphrase for
  // everything. GitHub sync keeps the one it was set up with.
  return provider === 'google' ? backupPassphrase() : getMeta('passphrase');
}

export async function setSyncPassphrase(value) {
  if (value == null) {
    await remove('syncMeta', 'passphrase', { tombstone: false });
    return;
  }
  await setMeta('passphrase', value);
}

async function getMeta(key) {
  const row = await get('syncMeta', key);
  return row ? row.value : null;
}

async function setMeta(key, value) {
  await put('syncMeta', { id: key, value }, { stamp: false });
}

// --- The main entry point -------------------------------------------------

// Pull what's in the sync file, merge it with what's here, write the result
// back. Safe to run on every app open: with nothing to change it is one read
// and one write.
//
// `previous`: the passphrase before a change on this device. The synced copy
// may still be locked with it (or already with the new one, changed on the
// other device first); either opens it, and it is written back with the new.
export async function syncNow(passphrase, { onProgress = () => {}, previous = null } = {}) {
  const config = await getSyncConfig();
  if (!config.configured) throw new SyncError("Sync isn't set up yet.");
  if (!passphrase) throw new SyncError('Enter your passphrase to sync.');
  const place = config.provider === 'google' ? googlePlace() : await gistPlace(config, onProgress);

  onProgress('Fetching…');
  const found = await place.read();
  let remote = null;
  if (found) {
    onProgress('Decrypting…');
    remote = await openWithEither(found, passphrase, previous);
  }

  onProgress('Merging…');
  const local = await readLocal();
  const base = await readBases();
  const merged = remote ? mergeSnapshots(local, remote, { base }) : { data: local.data, deletions: local.deletions, changed: false };

  // Only rewrite local storage when the remote actually contributed something.
  let skipped = 0;
  if (remote) {
    skipped = await applyMerged(merged, local);
  }

  // Sent only when there is something to send: this phone changed since the last sync, there is no synced copy
  // yet, or the passphrase changed. Opening the app and coming back to it used to upload everything every time.
  const dirty = readDirty();
  if (dirty || !found || previous || (merged.stats && merged.stats.ahead > 0)) {
    onProgress('Uploading…');
    const payload = { data: merged.data, deletions: merged.deletions, syncedAt: Date.now() };
    await place.write(await encryptPayload(payload, passphrase));
    clearDirty(dirty);
  }

  await writeBases(merged.data.settings);
  const skew = clockSkew();
  if (skew != null) await setMeta('clockSkewMs', skew);
  await setMeta('lastSync', Date.now());
  return {
    pulled: { ...(merged.stats || { added: 0, updated: 0, deleted: 0 }), skipped },
    counts: Object.fromEntries(SYNCED_STORES.map((s) => [s, merged.data[s].length])),
  };
}

function readDirty() {
  try {
    return localStorage.getItem(DIRTY_KEY);
  } catch {
    return '1'; // cannot tell: send
  }
}

// Cleared only if nothing changed while the sync ran, or that change would never be sent.
function clearDirty(seen) {
  try {
    if (localStorage.getItem(DIRTY_KEY) === seen) localStorage.removeItem(DIRTY_KEY);
  } catch {
    // nothing kept, nothing to clear
  }
}

async function openWithEither(content, passphrase, previous) {
  try {
    return await decryptPayload(content, passphrase);
  } catch (err) {
    if (previous) {
      try {
        return await decryptPayload(content, previous);
      } catch {
        // Neither opens it: say so below.
      }
    }
    throw new SyncError("Your passphrase doesn't open the synced copy. If you changed it on another device, change it here too.");
  }
}

// Where the sync file lives: read() gives its text or null; write() saves.
function googlePlace() {
  let id = null;
  return {
    read: async () => {
      const file = await readSyncFile();
      id = file ? file.id : null;
      return file ? file.text : null;
    },
    write: async (text) => {
      id = await writeSyncFile(id, text);
    },
  };
}

async function gistPlace({ token, gistId }, onProgress) {
  let id = gistId;
  // The second device you set up has a token but no gist id yet. Without this
  // it would create its own gist and the two devices would sync happily to
  // different files forever, each convinced it was working.
  if (!id) {
    onProgress('Looking for your existing gist…');
    id = await findExistingGist(token);
    if (id) await setMeta('gistId', id);
  }
  return {
    read: async () => {
      if (!id) return null;
      const found = await fetchGist(token, id);
      if (!found) throw new SyncError('That gist no longer exists. Disconnect and set sync up again.');
      return found.content || null;
    },
    write: async (text) => {
      if (id) await updateGist(token, id, text);
      else {
        id = await createGist(token, text);
        await setMeta('gistId', id);
      }
    },
  };
}

// --- Local snapshot -------------------------------------------------------

async function readLocal() {
  const data = {};
  for (const store of SYNCED_STORES) data[store] = await getAllRaw(store);
  const deletions = await getAllRaw('deletions');
  return { data, deletions };
}

// --- Merge ----------------------------------------------------------------

// Records missing `updatedAt` predate sync. Treating them as age zero would
// let any remote copy silently overwrite them, so they count as "old but
// present": kept unless the other side genuinely has a timestamp.
//
// A stamp more than five minutes ahead of this phone's clock belongs to a device whose clock runs fast. A record
// arriving with one is re-stamped "now" as it is taken in (and goes back out that way), so one wrong clock cannot
// keep winning every edit for as long as it is wrong.
const SKEW_ALLOWED_MS = 5 * 60 * 1000;
const stampOf = (record, now = Date.now()) => (typeof record.updatedAt === 'number' ? Math.min(record.updatedAt, now + SKEW_ALLOWED_MS) : 0);

/* Settings that hold a list of things (people, goals, businesses...). One whole-record winner loses what the
 * other device added, so these are merged item by item against what both sides agreed at the last sync
 * (`base`): an item added on either side stays, an item removed on a side that had it is removed, and an item
 * on both takes the newer side's version. With no base (the first sync) nothing is removed. */
export const LIST_SETTINGS = ['businesses', 'people', 'goals', 'dismissedAnomalies', 'dismissedLumps', 'remindersSent', 'spendingAlertsSent'];
/* Settings that hold a map (a budget for each category). Merged key by key the same way: a budget set on either
 * device stays, one removed on a device that had it stays removed, one set on both takes the newer side's. */
export const MAP_SETTINGS = ['budgets', 'todoSeen'];
const itemKey = (x) => (x && typeof x === 'object' ? x.id : x);
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function mergeMaps(base, mine, theirs, mineIsNewer) {
  const had = new Set(Object.keys(base || {}));
  const out = {};
  for (const [k, v] of Object.entries(mine)) {
    if (k in theirs) out[k] = mineIsNewer ? v : theirs[k];
    else if (!had.has(k)) out[k] = v;
  }
  for (const [k, v] of Object.entries(theirs)) if (!(k in mine) && !had.has(k)) out[k] = v;
  return out;
}

export function mergeLists(base, mine, theirs, mineIsNewer) {
  const had = new Set((Array.isArray(base) ? base : []).map(itemKey));
  const here = new Map(mine.map((x) => [itemKey(x), x]));
  const there = new Map(theirs.map((x) => [itemKey(x), x]));
  const out = new Map();
  for (const [k, v] of here) {
    if (there.has(k)) out.set(k, mineIsNewer ? v : there.get(k));
    else if (!had.has(k)) out.set(k, v); // added here
    // otherwise it was removed on the other side
  }
  for (const [k, v] of there) if (!here.has(k) && !had.has(k)) out.set(k, v); // added there
  return [...out.values()];
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// A copy only re-stamped (another device tidied every row on opening) says nothing new: it is taken, not counted.
const sameApartFromStamp = (a, b) => same({ ...a, updatedAt: 0 }, { ...b, updatedAt: 0 });

export function mergeSnapshots(local, remote, { base = {}, now = Date.now() } = {}) {
  const stats = { added: 0, updated: 0, deleted: 0 };
  const stamp = (r) => stampOf(r, now);
  const taken = (r) => (typeof r.updatedAt === 'number' && r.updatedAt > now + SKEW_ALLOWED_MS ? { ...r, updatedAt: now } : r);

  // Tombstones from both sides, keyed "store:id", keeping the latest delete.
  const tombstones = new Map();
  for (const t of [...(local.deletions || []), ...(remote.deletions || [])]) {
    const existing = tombstones.get(t.id);
    if (!existing || t.deletedAt > existing.deletedAt) tombstones.set(t.id, t);
  }

  const data = {};
  for (const store of SYNCED_STORES) {
    const byId = new Map();
    for (const record of local.data[store] || []) byId.set(record.id, record);

    for (const incoming of remote.data?.[store] || []) {
      const mine = byId.get(incoming.id);
      if (!mine) {
        byId.set(incoming.id, taken(incoming));
        stats.added++;
      } else if (store === 'settings' && LIST_SETTINGS.includes(incoming.id) && Array.isArray(mine.value) && Array.isArray(incoming.value)) {
        const value = mergeLists(base[incoming.id], mine.value, incoming.value, stamp(mine) >= stamp(incoming));
        if (!same(value, mine.value) || !same(value, incoming.value)) {
          const updatedAt = Math.max(stamp(mine), stamp(incoming)) + 1;
          byId.set(incoming.id, { ...mine, value, updatedAt });
          if (!same(value, mine.value)) stats.updated++;
        }
      } else if (store === 'settings' && MAP_SETTINGS.includes(incoming.id) && isMap(mine.value) && isMap(incoming.value)) {
        const value = mergeMaps(base[incoming.id], mine.value, incoming.value, stamp(mine) >= stamp(incoming));
        if (!same(value, mine.value) || !same(value, incoming.value)) {
          const updatedAt = Math.max(stamp(mine), stamp(incoming)) + 1;
          byId.set(incoming.id, { ...mine, value, updatedAt });
          if (!same(value, mine.value)) stats.updated++;
        }
      } else if (stamp(incoming) > stamp(mine)) {
        byId.set(incoming.id, taken(incoming));
        if (!sameApartFromStamp(incoming, mine)) stats.updated++;
      } else if (stamp(incoming) === stamp(mine) && !same(incoming, mine) && JSON.stringify(incoming) > JSON.stringify(mine)) {
        // Same moment, different content: both devices pick the same one, so they cannot swap forever.
        byId.set(incoming.id, taken(incoming));
        stats.updated++;
      }
    }

    // A delete only wins if it happened after the surviving record was edited.
    // Edit something on your phone after deleting it on the laptop and the
    // edit is what you meant.
    for (const [id, record] of [...byId]) {
      const tomb = tombstones.get(`${store}:${id}`);
      if (tomb && tomb.deletedAt > stamp(record)) {
        byId.delete(id);
        stats.deleted++;
      }
    }

    data[store] = [...byId.values()];
  }

  // What this phone holds that the downloaded copy lacks (or holds an older version of): the shared file is behind, and the
  // next write must send it. Without this, two devices syncing at the same moment leave one device's edits out of the file
  // until it is edited again.
  stats.ahead = 0;
  for (const store of SYNCED_STORES) {
    const theirs = new Map((remote.data?.[store] || []).map((r) => [r.id, r]));
    for (const r of data[store]) {
      const t = theirs.get(r.id);
      if (!t || stamp(r) > stamp(t)) stats.ahead++;
    }
  }
  const theirDeletes = new Set((remote.deletions || []).map((t) => t.id));
  for (const t of tombstones.values()) if (!theirDeletes.has(t.id)) stats.ahead++;

  return { data, deletions: [...tombstones.values()], stats, changed: true };
}

// What both sides agreed each list setting held at the last sync, kept on this device only (syncMeta).
async function readBases() {
  const out = {};
  for (const key of [...LIST_SETTINGS, ...MAP_SETTINGS]) {
    const v = await getMeta(`base:${key}`);
    if (Array.isArray(v) || isMap(v)) out[key] = v;
  }
  return out;
}

async function writeBases(settings) {
  for (const key of [...LIST_SETTINGS, ...MAP_SETTINGS]) {
    const row = (settings || []).find((r) => r.id === key);
    if (row && (Array.isArray(row.value) || isMap(row.value))) await setMeta(`base:${key}`, row.value);
  }
}

// Write the merged result back, touching only what actually differs so a
// no-op sync doesn't rewrite every row (and re-stamp nothing).
async function applyMerged(merged, local) {
  let skipped = 0;
  for (const store of SYNCED_STORES) {
    const before = new Map((local.data[store] || []).map((r) => [r.id, r]));
    const after = new Map(merged.data[store].map((r) => [r.id, r]));

    for (const [id, record] of after) {
      const mine = before.get(id);
      if (!mine || stampOf(record) > stampOf(mine)) {
        // A record from another device that cannot be used is left out, not stored: the database would
        // refuse it half way through and stop everything after it.
        tidyRecord(store, record);
        if (problemWith(store, record)) {
          skipped++;
          continue;
        }
        await put(store, record, { stamp: false, fromSync: true });
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) await remove(store, id, { tombstone: false, fromSync: true });
    }
  }

  // Keep every tombstone we learned about, so the next device to sync sees it.
  const known = new Set((local.deletions || []).map((d) => d.id));
  for (const t of merged.deletions) {
    if (!known.has(t.id)) await put('deletions', t, { stamp: false, fromSync: true });
  }
  return skipped;
}

// --- GitHub Gist API ------------------------------------------------------

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function fetchGist(token, gistId) {
  const res = await fetchRetry(`${API}/gists/${gistId}`, { headers: headers(token) });
  if (res.status === 404) return null;
  await assertOk(res, 'read the gist');
  const body = await res.json();
  const file = body.files?.[GIST_FILENAME];
  if (!file) return { content: null };
  // The API truncates large files inline; fall back to the raw URL.
  if (file.truncated && file.raw_url) {
    const raw = await fetchRetry(file.raw_url);
    await assertOk(raw, 'download the gist contents');
    return { content: await raw.text() };
  }
  return { content: file.content };
}

// Looks through your own gists for the one this app already made, so a second
// device joins the existing sync instead of starting a rival one.
async function findExistingGist(token) {
  const res = await fetchRetry(`${API}/gists?per_page=100`, { headers: headers(token) });
  await assertOk(res, 'list your gists');
  const gists = await res.json();
  const match = gists.find((g) => g.files && g.files[GIST_FILENAME]);
  return match ? match.id : null;
}

async function createGist(token, content) {
  const res = await fetchRetry(`${API}/gists`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Kawach (encrypted) - do not edit by hand',
      public: false,
      files: { [GIST_FILENAME]: { content } },
    }),
  });
  await assertOk(res, 'create the gist');
  const body = await res.json();
  return body.id;
}

async function updateGist(token, gistId, content) {
  const res = await fetchRetry(`${API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } }),
  });
  await assertOk(res, 'save to the gist');
  // GitHub says what time it thinks it is: used to tell when this phone's clock is off.
  try {
    noteServerTime((await res.json()).updated_at);
  } catch {
    // no time given: the check simply has nothing to go on
  }
}

// Turns GitHub's status codes into something that says what to do about it.
async function assertOk(res, action) {
  if (res.ok) return;
  if (res.status === 401) throw new SyncError('GitHub rejected your token. It may have expired - create a new one and paste it in again.');
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0') throw new SyncError('GitHub is rate limiting this token. Try again in a few minutes.');
    throw new SyncError(`Your token isn't allowed to ${action}. It needs Gist read and write permission.`);
  }
  if (res.status === 404) throw new SyncError('Not found. Check the token has Gist permission and the gist still exists.');
  throw new SyncError(`GitHub couldn't ${action} (error ${res.status}).`);
}

export class SyncError extends Error {}

export async function testToken(token) {
  const res = await fetchRetry(`${API}/user`, { headers: headers(token) });
  if (res.status === 401) return { ok: false, reason: 'That token was rejected by GitHub.' };
  if (!res.ok) return { ok: false, reason: `GitHub returned error ${res.status}.` };
  const body = await res.json();
  return { ok: true, login: body.login };
}
