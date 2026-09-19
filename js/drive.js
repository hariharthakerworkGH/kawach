import { get, put, remove } from './db.js';
import { exportEncrypted, decryptBackup } from './backup.js';

// Backups, and sync, through the user's own Google Drive.
//
// What it can reach: only Kawach's own hidden folder in the user's Drive
// (the "appDataFolder", scope drive.appdata). It cannot see, open or list any
// other file, and the user can remove it at any time from their Google
// account. What goes there: backups (the same encrypted file as a saved
// backup) and one sync file, all locked with the user's backup passphrase -
// Google sees only scrambled data.
//
// How it signs in: no Google code is loaded into the app. Kawach sends the
// user to Google's own sign-in page, and Google sends them back to
// oauth.html with a short-lived pass (about an hour). The pass is kept on
// this phone until it runs out, so reopening the app within the hour needs
// no sign-in; after that, Google's page shows for a moment again. Google gives
// a long-lived pass only to apps with a server of their own, which Kawach
// deliberately doesn't have.
//
// The backup passphrase and the dates of the last backups stay on this phone
// (syncMeta, which is never synced or put in a backup file), so backing up
// doesn't ask for the passphrase every time.

const CLIENT_ID = '319741505837-p59f9beph0rt2m8ke1o7mcgi068mdl8j.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com';
// A few recent backups are kept, so one saved over a mistake isn't the only
// copy; older ones are removed.
const KEEP = 5;
const BACKUP_PREFIX = 'kawach-backup-';
export const SYNC_FILE = 'kawach-sync.json';

const PASS_KEY = 'kawach-google-pass';
const PENDING_KEY = 'kawach-drive-pending';

async function meta(key) {
  const row = await get('syncMeta', key);
  return row ? row.value : null;
}
async function setMeta(key, value) {
  if (value == null) await remove('syncMeta', key, { tombstone: false });
  else await put('syncMeta', { id: key, value }, { stamp: false });
}

// --- The backup passphrase ---------------------------------------------
// One passphrase locks every backup (Drive or file) and Google sync. Phones
// set up before there was one had a Drive-only passphrase; that one carries
// on as the backup passphrase.

export async function backupPassphrase() {
  return (await meta('backupPassphrase')) || (await meta('drivePassphrase'));
}

export async function setBackupPassphrase(passphrase) {
  await setMeta('backupPassphrase', passphrase);
  await setMeta('drivePassphrase', null);
}

export async function backupStatus() {
  const [passphrase, driveLastAt, fileLastAt, email] = await Promise.all([
    backupPassphrase(),
    meta('driveLastBackupAt'),
    meta('fileLastBackupAt'),
    meta('googleEmail'),
  ]);
  return { passphraseSet: Boolean(passphrase), driveLastAt: driveLastAt || null, fileLastAt: fileLastAt || null, email: email || null };
}

export async function markFileBackup() {
  await setMeta('fileLastBackupAt', Date.now());
}

// --- Signing in to Google ----------------------------------------------

function currentPass() {
  try {
    const saved = JSON.parse(localStorage.getItem(PASS_KEY) || 'null');
    // A minute's margin, so a pass doesn't run out halfway through an upload.
    return saved && saved.expiresAt > Date.now() + 60000 ? saved.token : null;
  } catch {
    return null;
  }
}

function dropPass() {
  try {
    localStorage.removeItem(PASS_KEY);
  } catch {
    // Nothing kept, nothing to drop.
  }
}

export const hasGooglePass = () => Boolean(currentPass());

// Off to Google's sign-in page. `purpose` is what to do on return (see
// oauth.html and app.js). `silent` asks Google not to show anything if the
// user is already signed in and has said yes before - used to renew the pass
// for sync when the app opens - and to come straight back if it can't.
// The random `state` proves the answer that comes back is the one this visit
// asked for.
export async function signIn(purpose, { silent = false } = {}) {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ purpose, state, silent }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: new URL('./oauth.html', location.href).href,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    prompt: silent ? 'none' : 'select_account',
    state,
  });
  // The same account as last time, so a phone signed in to several doesn't
  // stop to ask which.
  const email = await meta('googleEmail');
  if (email) params.set('login_hint', email);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

// Called by oauth.html with what Google sent back. Returns the purpose to
// carry on with, or throws when the answer can't be trusted or was a "no"
// (marked `silent` when nobody was shown anything, so nobody is told).
export function acceptSignIn(hash) {
  const answer = new URLSearchParams(hash.replace(/^#/, ''));
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
  sessionStorage.removeItem(PENDING_KEY);
  const fail = (message) => Object.assign(new Error(message), { silent: Boolean(pending && pending.silent), purpose: pending && pending.purpose });
  if (!pending || answer.get('state') !== pending.state) throw fail('That sign-in did not come from this app. Try again.');
  if (answer.get('error')) throw fail(answer.get('error') === 'access_denied' ? 'Google Drive was not allowed.' : `Google said: ${answer.get('error')}`);
  const token = answer.get('access_token');
  if (!token) throw fail('Google did not send a sign-in. Try again.');
  if (!(answer.get('scope') || '').includes('drive.appdata')) throw fail('Kawach needs its Drive folder ticked to back up.');
  const seconds = Number(answer.get('expires_in')) || 3600;
  localStorage.setItem(PASS_KEY, JSON.stringify({ token, expiresAt: Date.now() + seconds * 1000 }));
  return pending.purpose;
}

// Which Google account this is, shown beside sync so both devices can be
// checked to use the same one. Best effort: nothing breaks without it.
export async function rememberGoogleAccount() {
  try {
    const res = await call('/drive/v3/about?fields=user(emailAddress)');
    const email = (await res.json()).user?.emailAddress;
    if (email) await setMeta('googleEmail', email);
  } catch {
    // Not important enough to bother anyone with.
  }
}

async function call(path, options = {}) {
  const token = currentPass();
  if (!token) throw Object.assign(new Error('Sign in to Google again.'), { needsSignIn: true });
  const res = await fetch(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (res.status === 401) {
    dropPass();
    throw Object.assign(new Error('Sign in to Google again.'), { needsSignIn: true });
  }
  if (!res.ok) throw new Error(`Google Drive answered ${res.status}. Try again in a moment.`);
  return res;
}

// Files in Kawach's folder by name. `name` is matched exactly, `prefix` as
// the start of the name.
async function findFiles({ name, prefix }) {
  const q = name ? `name = '${name}'` : `name contains '${prefix}'`;
  const params = new URLSearchParams({ spaces: 'appDataFolder', q, fields: 'files(id,name,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '20' });
  const res = await call(`/drive/v3/files?${params}`);
  return (await res.json()).files || [];
}

async function createFile(name, text) {
  const boundary = `kawach-${Date.now()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    text,
    `--${boundary}--`,
  ].join('\r\n');
  const res = await call('/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()).id;
}

async function readFile(id) {
  const res = await call(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
  return res.text();
}

// --- Backups -------------------------------------------------------------

// Backups only, never the sync file, newest first.
export async function listBackups() {
  return (await findFiles({ prefix: BACKUP_PREFIX })).filter((f) => f.name.startsWith(BACKUP_PREFIX));
}

// One backup: encrypted on the phone, then uploaded. Needs a pass from
// Google (signIn first) and the backup passphrase set on this phone.
export async function backUpToDrive() {
  const passphrase = await backupPassphrase();
  if (!passphrase) throw new Error('Set a backup passphrase first.');
  if (!currentPass()) throw Object.assign(new Error('Sign in to Google first.'), { needsSignIn: true });
  const { envelope, counts } = await exportEncrypted(passphrase);
  const name = `${BACKUP_PREFIX}${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  await createFile(name, JSON.stringify(envelope));
  // Tidy up: only the newest few are kept.
  const all = await listBackups();
  for (const old of all.slice(KEEP)) {
    await call(`/drive/v3/files/${old.id}`, { method: 'DELETE' }).catch(() => {});
  }
  await setMeta('driveLastBackupAt', Date.now());
  return counts;
}

// A backup's contents, opened with the passphrase it was made with.
export async function openDriveBackup(id, passphrase) {
  return decryptBackup(await readFile(id), passphrase);
}

// --- The sync file --------------------------------------------------------
// One encrypted file every device reads, merges with its own data, and
// writes back (js/sync.js does the merging).

export async function readSyncFile() {
  const [file] = await findFiles({ name: SYNC_FILE });
  return file ? { id: file.id, text: await readFile(file.id) } : null;
}

export async function writeSyncFile(id, text) {
  if (!id) return createFile(SYNC_FILE, text);
  await call(`/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: text,
  });
  return id;
}
