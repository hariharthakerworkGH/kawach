import { getAllRaw, replaceAll } from './db.js';
import { tidyRecord, problemWith } from './records.js';

// `settings` carries your income, budgets and reminder preferences - a restore
// that dropped them would look like the app had forgotten how you set it up.
const STORES = ['accounts', 'transactions', 'categories', 'merchantRules', 'recurring', 'importBatches', 'settings'];
const FORMAT = 'expense-tracker-backup';
// 2 = the data is compressed (gzip) before it is locked; 1 is what every older backup says. An older app that
// meets a 2 says it was made by a newer version, instead of trying to read compressed bytes as text.
const FORMAT_VERSION = 2;
// 600,000: the current advice for this method. A file says its own count, so every older backup (210,000) still opens.
const PBKDF2_ITERATIONS = 600000;

// Everything lives in one browser's IndexedDB, so a backup is the only thing
// standing between you and total loss if the phone dies or site data gets
// cleared. The file is encrypted with a passphrase-derived key before it
// ever leaves the device, so it's safe to put in cloud storage or email.
export async function exportEncrypted(passphrase) {
  const data = {};
  for (const store of STORES) {
    // As stored, damaged records included: a backup must carry everything, so nothing is lost for good.
    data[store] = await getAllRaw(store);
  }

  return {
    envelope: JSON.parse(await encryptPayload(data, passphrase)),
    counts: Object.fromEntries(STORES.map((s) => [s, data[s].length])),
  };
}

// The encryption on its own, so sync can reuse exactly the same envelope
// format as a downloaded backup file - one thing to get right, not two.
// Returns the envelope as a JSON string, ready to be a file or a gist.
export async function encryptPayload(payload, passphrase, { compress = true } = {}) {
  let plaintext = new TextEncoder().encode(JSON.stringify(payload));
  // Squeezed before it is locked (a locked file cannot be squeezed afterwards): five to eight times smaller,
  // which is how long a sync or a backup takes on a phone's connection.
  let compressed = false;
  if (compress && typeof CompressionStream === 'function') {
    try {
      plaintext = await pipeThrough(plaintext, new CompressionStream('gzip'));
      compressed = true;
    } catch {
      compressed = false; // a browser that cannot: it is simply sent whole, as before
    }
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return JSON.stringify({
    format: FORMAT,
    formatVersion: compressed ? FORMAT_VERSION : 1,
    ...(compressed ? { compression: 'gzip' } : {}),
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher)),
  });
}

export async function decryptPayload(envelopeText, passphrase) {
  return parseEnvelope(envelopeText, passphrase);
}

export async function decryptBackup(fileText, passphrase) {
  const { payload, createdAt } = await parseEnvelopeRaw(fileText, passphrase);
  // A backup file holds the stores directly; a synced payload wraps them in
  // `data` alongside its tombstones. Accept either, so a gist payload saved to
  // disk can still be restored.
  const data = payload.data && payload.deletions ? payload.data : payload;
  return {
    data,
    createdAt,
    counts: Object.fromEntries(STORES.map((s) => [s, (data[s] || []).length])),
  };
}

async function parseEnvelope(envelopeText, passphrase) {
  const { payload } = await parseEnvelopeRaw(envelopeText, passphrase);
  return payload;
}

async function parseEnvelopeRaw(fileText, passphrase) {
  let envelope;
  try {
    envelope = JSON.parse(fileText);
  } catch {
    throw new Error("That file isn't a backup file (it isn't valid JSON).");
  }
  if (envelope.format !== FORMAT) {
    throw new Error("That file isn't a Kawach backup.");
  }
  if (envelope.formatVersion > FORMAT_VERSION) {
    throw new Error('That backup was made by a newer version of the app than this one.');
  }

  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.iv);
  // The iteration count comes out of the file, and deriving the key happens
  // BEFORE anything is authenticated - so a made-up envelope claiming two
  // billion iterations would lock the tab up solid without even needing the
  // passphrase. Anything Kawach wrote says 210,000; this only bounds what a
  // file is allowed to ask for.
  const asked = Number(envelope.kdf.iterations);
  if (!Number.isFinite(asked) || asked < 1000 || asked > 1000000) {
    throw new Error('That backup asks for an unreasonable amount of work to open. It was not made by Kawach.');
  }
  const key = await deriveKey(passphrase, salt, asked);

  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromBase64(envelope.data));
  } catch {
    // AES-GCM authentication failing means either the wrong passphrase or a
    // corrupted file; there's no way to tell which, so say both.
    throw new Error('Could not decrypt - wrong passphrase, or the file is damaged.');
  }

  let bytes = new Uint8Array(plaintext);
  if (envelope.compression === 'gzip') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open a compressed backup. Update your browser and try again.');
    bytes = await pipeThrough(bytes, new DecompressionStream('gzip'));
  }
  return { payload: JSON.parse(new TextDecoder().decode(bytes)), createdAt: envelope.createdAt };
}

/* What a restore would do with this backup, before anything is touched: the usable records per store and
 * how many were skipped (damaged, with why). */
export function screenBackup(data) {
  const usable = {};
  const skipped = [];
  for (const store of STORES) {
    usable[store] = [];
    for (const record of Array.isArray(data[store]) ? data[store] : []) {
      tidyRecord(store, record);
      const why = problemWith(store, record);
      if (why) skipped.push({ store, id: record && record.id, why });
      else usable[store].push(record);
    }
  }
  return { usable, skipped };
}

// Replaces everything, all at once or not at all (one transaction, js/db.js), after keeping a copy of what
// is on the phone now so the restore can be undone (undoRestore). The caller confirms with the person first.
// Records in the backup that cannot be used are left out and counted in `skipped`.
export async function restoreBackup(data) {
  const { usable, skipped } = screenBackup(data);
  // The copy comes first. If it cannot be kept, nothing is changed.
  try {
    await saveUndoCopy();
  } catch {
    throw new Error("Couldn't keep a copy of what is on this phone now, so nothing was changed. Free some space and try again.");
  }
  await replaceAll(usable, STORES);
  return { skipped };
}

/* --- The way back (5.43.1) ----------------------------------------------------
 * The copy made just before a restore lives in a small database of its own on this phone, never synced and
 * never put in a backup, and goes after two weeks. Settings offers "Undo the last restore" while it exists. */
const UNDO_DB = `${globalThis.EXPENSE_TRACKER_DB_NAME || 'expense-tracker'}-undo`;
const UNDO_DAYS = 14;

function undoStore(mode) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(UNDO_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('copy', { keyPath: 'id' });
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('copy', mode);
      tx.oncomplete = () => db.close();
      resolve(tx.objectStore('copy'));
    };
  });
}
const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function saveUndoCopy() {
  const data = {};
  for (const store of STORES) data[store] = await getAllRaw(store);
  const os = await undoStore('readwrite');
  await done(os.put({ id: 'last', at: Date.now(), data, counts: Object.fromEntries(STORES.map((s) => [s, data[s].length])) }));
}

/* { at, counts } while a copy is kept, else null. */
export async function undoInfo(now = Date.now()) {
  try {
    const row = await done((await undoStore('readonly')).get('last'));
    if (!row) return null;
    if (now - row.at > UNDO_DAYS * 86400000) {
      await done((await undoStore('readwrite')).delete('last'));
      return null;
    }
    return { at: row.at, counts: row.counts };
  } catch {
    return null;
  }
}

export async function undoRestore() {
  const row = await done((await undoStore('readonly')).get('last'));
  if (!row) throw new Error('There is no restore to undo.');
  await replaceAll(row.data, STORES);
  await done((await undoStore('readwrite')).delete('last'));
}

async function pipeThrough(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
