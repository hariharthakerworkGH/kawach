import { getSetting, setSetting } from './db.js';

// Installing Kawach, and keeping its data safe on the phone.
//
// Everything a user has lives in this browser's storage on their phone.
// Browsers treat that storage as disposable: when a phone runs low on space,
// Chrome may clear a site's data to make room. Asking for it to be kept
// ("persistent storage") stops that. Chrome decides without asking the user,
// and grants it readily to an app that has been installed, so the request is
// made on every start until it is granted.
export async function keepDataSafe() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function dataIsKept() {
  try {
    return Boolean(navigator.storage && navigator.storage.persisted && (await navigator.storage.persisted()));
  } catch {
    return false;
  }
}

// Chrome offers installation through an event it fires once the app
// qualifies. It is kept so an Install button can use it later; without it the
// only way in is Chrome's own menu, which few people find.
let offer = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  offer = e;
  document.dispatchEvent(new CustomEvent('install-available'));
});
window.addEventListener('appinstalled', () => {
  offer = null;
  keepDataSafe();
  document.dispatchEvent(new CustomEvent('install-done'));
});

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

const isIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// Returns true once the user has said yes.
export async function install() {
  if (!offer) return false;
  offer.prompt();
  const { outcome } = await offer.userChoice;
  offer = null;
  return outcome === 'accepted';
}

const SNOOZE_DAYS = 14;

// A card for the top of Summary while the app runs in a browser tab: an
// Install button where Chrome offers one, the steps where it doesn't
// (iPhone, or Chrome before it has decided). "Not now" hides it for two weeks.
export async function installCard() {
  if (isInstalled()) return '';
  const snoozed = await getSetting('installSnoozedUntil', 0);
  if (snoozed && Date.now() < snoozed) return '';
  const how = offer
    ? '<button type="button" class="btn-primary install-now">Install Kawach</button>'
    : isIPhone()
      ? '<p class="muted-note install-steps">In Safari, tap Share, then <strong>Add to Home Screen</strong>.</p>'
      : '<p class="muted-note install-steps">In Chrome, tap the three dots at the top right, then <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>';
  return `
    <div class="totals-card install-card">
      <div class="install-head">
        <img class="install-logo" src="./icons/kawach.svg" alt="" width="40" height="40">
        <div>
          <p class="install-title">Put Kawach on your home screen</p>
          <p class="muted-note">Opens like an app, works offline, and your data is kept safe on this phone.</p>
        </div>
      </div>
      ${how}
      <button type="button" class="link-btn install-later">Not now</button>
    </div>`;
}

export function wireInstallCard(root, onChange) {
  const now = root.querySelector('.install-now');
  if (now) now.addEventListener('click', async () => onChange(await install()));
  const later = root.querySelector('.install-later');
  if (later) {
    later.addEventListener('click', async () => {
      await setSetting('installSnoozedUntil', Date.now() + SNOOZE_DAYS * 86400000);
      onChange(false);
    });
  }
}

