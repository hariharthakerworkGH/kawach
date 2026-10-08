/* App lock (5.31): a PIN, and the phone's fingerprint if it has one, asked for when
 * Kawach opens and when you come back after being away.
 *
 * It keeps out whoever picks up the phone, not someone with technical tools: the
 * data stays on the phone as it always has, and a short PIN can be guessed by a
 * program that can read the phone's storage. Settings says so.
 *
 * Everything lives on this phone, beside the other choices that are about the
 * device (js/appearance.js): never synced, never put in a backup, never in a
 * diagnostic report. The PIN is stored only as a salted PBKDF2 hash.
 *
 * Five wrong PINs in a row make it wait, longer each time. A forgotten PIN cannot
 * be recovered - nothing leaves the phone to recover it from - so the way out is to
 * erase Kawach on this phone and restore the encrypted backup.
 */
import { icon } from './icons.js';
import { askConfirm } from './dialog.js';

const KEY = 'kawach-lock';
const FAILS = 'kawach-lock-fails';
const SEEN = 'kawach-lock-seen';
const ITERATIONS = 150000;
const MIN = 4;
const MAX = 6;

/* How long away before it asks again, in seconds. */
export const AWAY = { 0: 'As soon as I leave', 60: 'After 1 minute', 300: 'After 5 minutes' };

/* --- the pure parts (tested) ---------------------------------------------- */
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));

async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function makeRecord(pin, extra = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { v: 1, salt: hex(salt), iters: ITERATIONS, hash: hex(await derive(pin, salt, ITERATIONS)), len: pin.length, bio: null, away: 60, ...extra };
}

export async function checkPin(pin, record) {
  const got = await derive(String(pin), unhex(record.salt), record.iters);
  const want = unhex(record.hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i += 1) diff |= got[i] ^ want[i];
  return diff === 0;
}

/* Seconds to wait after this many wrong PINs in a row: none for four, then 30, 60, 120... up to 15 minutes. */
export const waitFor = (fails) => (fails < 5 ? 0 : Math.min(900, 30 * 2 ** (fails - 5)));

/* Must the lock ask? Yes when it is on and the phone was last used longer ago than the
 * person chose, or never in this session, or the clock has gone backwards. */
export const mustLock = (record, seen, now) => Boolean(record) && (seen == null || seen > now || now - seen >= record.away * 1000);

/* --- what is stored ------------------------------------------------------ */
export function getRecord() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY));
    return r && r.hash && r.salt ? r : null;
  } catch {
    return null;
  }
}
const putRecord = (r) => (r ? localStorage.setItem(KEY, JSON.stringify(r)) : localStorage.removeItem(KEY));
const failState = () => {
  try {
    return JSON.parse(localStorage.getItem(FAILS)) || { n: 0, until: 0 };
  } catch {
    return { n: 0, until: 0 };
  }
};
const mark = () => {
  try {
    sessionStorage.setItem(SEEN, String(Date.now()));
  } catch {
    // no session storage: it will simply ask each time
  }
};
const lastSeen = () => {
  try {
    const v = sessionStorage.getItem(SEEN);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
};

/* One PIN try, with the waiting. Returns null when right, else what to say. */
async function tryPin(pin, record) {
  const f = failState();
  const left = Math.ceil((f.until - Date.now()) / 1000);
  if (left > 0) return `Too many tries. Wait ${left} second${left === 1 ? '' : 's'}.`;
  if (await checkPin(pin, record)) {
    localStorage.removeItem(FAILS);
    return null;
  }
  const n = f.n + 1;
  const wait = waitFor(n);
  localStorage.setItem(FAILS, JSON.stringify({ n, until: wait ? Date.now() + wait * 1000 : 0 }));
  return wait ? `Wrong PIN. Wait ${wait} seconds.` : `Wrong PIN. ${5 - n} ${5 - n === 1 ? 'try' : 'tries'} left before a wait.`;
}

/* --- the phone's fingerprint (WebAuthn, on this phone only) ---------------- */
export async function bioAvailable() {
  try {
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    return false;
  }
}
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// ponytail: nothing is checked against a server (there is none): it shows the phone's own
// fingerprint check passed, which is all a lock on the phone needs. Upgrade only if Kawach
// ever gets accounts.
async function enrollBio() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Kawach' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'kawach', displayName: 'Kawach' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  });
  return b64(cred.rawId);
}
async function bioCheck(record) {
  await navigator.credentials.get({
    publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(record.bio), transports: ['internal'] }], userVerification: 'required', timeout: 60000 },
  });
}

/* --- the screen ------------------------------------------------------------ */
const SHELL = ['.app-header', '#view-container', '#tabs', '#update-banner'];
const shell = (on) => SHELL.forEach((q) => document.querySelector(q)?.toggleAttribute('inert', on));

/* Asks for a PIN on a full screen and resolves with it, or with null when cancelled.
 *   exact     the PIN's length when it is known (it is entered by tapping the last digit)
 *   check     null when the PIN is accepted, else the words to show
 *   bio       called when the fingerprint button is tapped; resolves true when it passed
 *   forgot    show "Forgot PIN?" */
function ask({ title, sub = '', exact = 0, check = async () => null, cancelable = false, bio = null, forgot = false, autoBio = false }) {
  return new Promise((resolve) => {
    document.getElementById('lock')?.remove();
    const size = exact || MAX;
    const el = document.createElement('div');
    el.id = 'lock';
    el.className = 'lock k';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lock-title');
    const key = (d) => `<button type="button" class="lock__key" data-d="${d}">${d}</button>`;
    el.innerHTML = `<div class="lock__box">
        ${cancelable ? `<button type="button" class="lock__cancel" aria-label="Cancel">${icon('close')}</button>` : ''}
        <span class="lock__mark">${icon('lock')}</span>
        <h2 class="lock__title" id="lock-title"></h2>
        <p class="lock__sub" role="status" aria-live="polite"></p>
        <div class="lock__dots" aria-hidden="true">${'<i></i>'.repeat(size)}</div>
        <div class="lock__pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('')}<span></span>${key(0)}<button type="button" class="lock__key lock__back" aria-label="Delete the last digit">${icon('back')}</button></div>
        <button type="button" class="btn-primary lock__next" hidden>Next</button>
        ${bio ? '<button type="button" class="lock__link lock__bio">Use fingerprint</button>' : ''}
        ${forgot ? '<button type="button" class="lock__link lock__forgot">Forgot PIN?</button>' : ''}
      </div>`;
    el.querySelector('.lock__title').textContent = title;
    const subEl = el.querySelector('.lock__sub');
    subEl.textContent = sub;
    document.body.append(el);
    shell(true);
    let pin = '';
    let busy = false;
    const dots = [...el.querySelectorAll('.lock__dots i')];
    const next = el.querySelector('.lock__next');
    const draw = () => {
      dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
      next.hidden = Boolean(exact) || pin.length < MIN;
    };
    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      shell(false);
      resolve(value);
    };
    const submit = async () => {
      if (busy) return;
      busy = true;
      const said = await check(pin);
      if (said === null) return finish(pin);
      subEl.textContent = said;
      subEl.classList.add('is-error');
      el.querySelector('.lock__dots').classList.add('shake');
      setTimeout(() => el.querySelector('.lock__dots')?.classList.remove('shake'), 400);
      pin = '';
      busy = false;
      draw();
    };
    const press = (d) => {
      if (busy || pin.length >= size) return;
      pin += d;
      subEl.classList.remove('is-error');
      draw();
      if (exact ? pin.length === exact : pin.length === MAX) submit();
    };
    const back = () => {
      if (!busy) pin = pin.slice(0, -1);
      draw();
    };
    function onKey(e) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter' && !exact && pin.length >= MIN) submit();
      else if (e.key === 'Escape' && cancelable) finish(null);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    document.addEventListener('keydown', onKey, true);
    el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => press(b.dataset.d)));
    el.querySelector('.lock__back').addEventListener('click', back);
    next.addEventListener('click', submit);
    el.querySelector('.lock__cancel')?.addEventListener('click', () => finish(null));
    const tryBio = async () => {
      try {
        if (await bio()) finish('bio');
      } catch {
        // cancelled or refused: the PIN is still there
      }
    };
    el.querySelector('.lock__bio')?.addEventListener('click', tryBio);
    el.querySelector('.lock__forgot')?.addEventListener('click', async () => {
      const yes = await askConfirm({
        title: 'Erase Kawach on this phone?',
        message: 'A lost PIN cannot be recovered, because nothing leaves your phone. You can erase everything here and restore your encrypted backup, which needs your backup passphrase. Without a backup, the data is gone.',
        confirmLabel: 'Erase everything',
        danger: true,
      });
      if (yes) await eraseThisPhone();
    });
    draw();
    if (autoBio && bio) tryBio();
  });
}

/* Everything Kawach keeps on this phone, then a fresh start. */
async function eraseThisPhone() {
  try {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: 'expense-tracker' }];
    dbs.forEach((d) => d.name && indexedDB.deleteDatabase(d.name));
    localStorage.clear();
    sessionStorage.clear();
    const keys = 'caches' in window ? await caches.keys() : [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } finally {
    location.reload();
  }
}

/* --- the gate -------------------------------------------------------------- */
let gating = null;

function gate() {
  if (gating) return gating;
  const record = getRecord();
  if (!record) return Promise.resolve();
  const useBio = record.bio ? async () => (await bioCheck(record), true) : null;
  gating = ask({
    title: 'Kawach is locked',
    sub: 'Enter your PIN',
    exact: record.len,
    check: (pin) => tryPin(pin, record),
    bio: useBio,
    forgot: true,
    autoBio: true,
  }).then(() => {
    gating = null;
    mark();
    document.documentElement.classList.remove('is-locked');
  });
  return gating;
}

/* Called once as the app starts, before any of its data is read: asks if the lock is on
 * and the phone was away, then keeps asking whenever it has been left long enough. A
 * fault here must never leave the person locked out of the whole app, so it lets them in. */
export async function guardApp() {
  try {
    const record = getRecord();
    if (!record) {
      document.documentElement.classList.remove('is-locked');
      return;
    }
    if (mustLock(record, lastSeen(), Date.now())) await gate();
    else document.documentElement.classList.remove('is-locked');
    mark();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') return mark();
      const r = getRecord();
      if (r && mustLock(r, lastSeen(), Date.now())) {
        document.documentElement.classList.add('is-locked');
        gate();
      }
    });
    window.addEventListener('pagehide', mark);
    // While it is open and in use, "last seen" keeps up, so an update that reloads the page
    // does not ask again straight after you unlocked.
    setInterval(() => document.visibilityState === 'visible' && !gating && mark(), 15000);
  } catch (err) {
    console.error('App lock failed, letting you in', err);
    document.documentElement.classList.remove('is-locked');
  }
}

/* --- for Settings ---------------------------------------------------------- */
/* Turns the lock on: a new PIN, typed twice. Resolves true when it is set. */
export async function enableLock() {
  const first = await ask({ title: 'Choose a PIN', sub: `${MIN} to ${MAX} digits`, cancelable: true });
  if (first === null) return false;
  const again = await ask({ title: 'Type it again', sub: 'The same PIN', exact: first.length, check: async (p) => (p === first ? null : 'Those do not match'), cancelable: true });
  if (again === null) return false;
  putRecord(await makeRecord(first));
  localStorage.removeItem(FAILS);
  mark();
  return true;
}

/* Turns the lock off after the PIN is entered. Resolves true when it is off. */
export async function disableLock() {
  const record = getRecord();
  if (!record) return true;
  const ok = await ask({ title: 'Turn off the lock', sub: 'Enter your PIN', exact: record.len, check: (p) => tryPin(p, record), cancelable: true });
  if (ok === null) return false;
  putRecord(null);
  return true;
}

/* The fingerprint on or off. Resolves true when it changed. */
export async function setFingerprint(on) {
  const record = getRecord();
  if (!record) return false;
  try {
    putRecord({ ...record, bio: on ? await enrollBio() : null });
    return true;
  } catch {
    return false;
  }
}

export function setAway(seconds) {
  const record = getRecord();
  if (record && seconds in AWAY) putRecord({ ...record, away: Number(seconds) });
}
