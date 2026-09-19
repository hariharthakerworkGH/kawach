import { get, put, remove } from './db.js';
import { exportEncrypted, decryptBackup } from './backup.js';

// Backups to the user's own Google Drive.
//
// What it can reach: only Kawach's own hidden folder in the user's Drive
// (the "appDataFolder", scope drive.appdata). It cannot see, open or list any
// other file, and the user can remove it at any time from their Google
// account. What goes there: the same encrypted file as a downloaded backup,
// locked with a passphrase the user chooses - Google sees only scrambled
// data.
//
// How it signs in: no Google code is loaded into the app. Kawach sends the
// user to Google's own sign-in page, and Google sends them back to
// oauth.html with a short-lived pass (about an hour) that is kept only for
// this visit (sessionStorage), never saved. Google gives a long-lived pass
// only to apps with a server of their own, which Kawach deliberately
// doesn't have - so a backup is one tap, not silent, and after an hour the
// sign-in page appears again for a moment.
//
// The passphrase and the date of the last backup stay on this phone
// (syncMeta, which is never synced or put in a backup file), so a backup
// doesn't ask for the passphrase every time.

export const CLIENT_ID = '319741505837-p59f9beph0rt2m8ke1o7mcgi068mdl8j.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const API = 'https://www.googleapis.com';
// A few recent backups are kept, so one saved over a mistake isn't the only
// copy; older ones are removed.
const KEEP = 5;

const TOKEN_KEY = 'kawach-drive-token';
const PENDING_KEY = 'kawach-drive-pending';

async function meta(key) {
  const row = await get('syncMeta', key);
  return row ? row.value : null;
}
async function setMeta(key, value) {
  if (value == null) await remove('syncMeta', key, { tombstone: false });
  else await put('syncMeta', { id: key, value }, { stamp: false });
}

// Whether Drive backups are set up on this phone, and when the last one was.
export async function driveStatus() {
  const [passphrase, lastAt] = await Promise.all([meta('drivePassphrase'), meta('driveLastBackupAt')]);
  return { setUp: Boolean(passphrase), lastAt: lastAt || null };
}

export async function setDrivePassphrase(passphrase) {
  await setMeta('drivePassphrase', passphrase);
}

// Stop backing up to Drive from this phone. The backups already in Drive
// stay there for a restore; the user removes the app's access in their
// Google account if they want those gone too.
export async function forgetDrive() {
  await setMeta('drivePassphrase', null);
  await setMeta('driveLastBackupAt', null);
  sessionStorage.removeItem(TOKEN_KEY);
}

function currentToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    // A minute's margin, so a pass doesn't run out halfway through an upload.
    return saved && saved.expiresAt > Date.now() + 60000 ? saved.token : null;
  } catch {
    return null;
  }
}

// Off to Google's sign-in page. `purpose` is what to do on return:
// 'backup' or 'restore'. The random `state` proves the answer that comes
// back is the one this visit asked for.
export function signIn(purpose) {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ purpose, state }));
  const redirect = new URL('./oauth.html', location.href).href;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

// Called by oauth.html with what Google sent back. Returns the purpose to
// carry on with, or throws when the answer can't be trusted or was a "no".
export function acceptSignIn(hash) {
  const answer = new URLSearchParams(hash.replace(/^#/, ''));
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
  sessionStorage.removeItem(PENDING_KEY);
  if (!pending || answer.get('state') !== pending.state) throw new Error('That sign-in did not come from this app. Try again.');
  if (answer.get('error')) throw new Error(answer.get('error') === 'access_denied' ? 'Google Drive was not allowed.' : `Google said: ${answer.get('error')}`);
  const token = answer.get('access_token');
  if (!token) throw new Error('Google did not send a sign-in. Try again.');
  if (!(answer.get('scope') || '').includes('drive.appdata')) throw new Error('Kawach needs its Drive folder ticked to back up.');
  const seconds = Number(answer.get('expires_in')) || 3600;
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + seconds * 1000 }));
  return pending.purpose;
}

async function call(path, options = {}) {
  const token = currentToken();
  if (!token) throw Object.assign(new Error('Sign in to Google Drive again.'), { needsSignIn: true });
  const res = await fetch(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    throw Object.assign(new Error('Sign in to Google Drive again.'), { needsSignIn: true });
  }
  if (!res.ok) throw new Error(`Google Drive answered ${res.status}. Try again in a moment.`);
  return res;
}

export async function listBackups() {
  const params = new URLSearchParams({ spaces: 'appDataFolder', fields: 'files(id,name,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '20' });
  const res = await call(`/drive/v3/files?${params}`);
  return (await res.json()).files || [];
}

// One backup: encrypted on the phone, then uploaded. Needs a pass from
// Google (signIn first) and the passphrase set on this phone.
export async function backUpToDrive() {
  const passphrase = await meta('drivePassphrase');
  if (!passphrase) throw new Error('Set a Drive backup passphrase first.');
  if (!currentToken()) throw Object.assign(new Error('Sign in to Google Drive first.'), { needsSignIn: true });
  const { envelope, counts } = await exportEncrypted(passphrase);
  const now = new Date();
  const name = `kawach-backup-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  const boundary = `kawach-${now.getTime()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/json' }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(envelope),
    `--${boundary}--`,
  ].join('\r\n');
  await call('/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
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
  const res = await call(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`);
  return decryptBackup(await res.text(), passphrase);
}

export const hasDrivePass = () => Boolean(currentToken());
