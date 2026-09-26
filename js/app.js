import { openDB, getAll, put, onLocalChange, forgetCachedReads } from './db.js';
import { getSyncConfig, getSyncPassphrase, syncNow } from './sync.js';
import { CASH_ACCOUNT_ID } from './config.js';
import { detectTransfers } from './transfers.js';
import { statementDayFixes } from './account-metrics.js';
import { showToast } from './toast.js';
import { setCustomStyles } from './category-style.js';
import { versionStatus, APP_VERSION } from './version.js';
import { fillIcons, icon } from './icons.js';
import { redraw } from './redraw.js';
import { keepDataSafe, isInstalled } from './install.js';
import { signIn, rememberGoogleAccount } from './drive.js';
import { showIfUpdated } from './whats-new.js';
import { moneyProfile, businesses, activeSpace, setCurrentSpace, settleSpaces } from './business.js';
import * as addView from './views/add.js';
import * as categoriesView from './views/categories.js';
import * as summaryView from './views/summary.js';
import * as transactionsView from './views/transactions.js';
import * as accountsView from './views/accounts.js';
import * as importView from './views/import.js';
import * as settingsView from './views/settings.js';
import * as planView from './views/plan.js';
import * as recapView from './views/recap.js';
import * as coachView from './views/coach.js';
import * as inboxView from './views/inbox.js';
import * as setupView from './views/setup.js';
import { collectSharedAlerts } from './alert-inbox.js';
import { refreshSchedule, runDueReminders } from './reminders.js';
import { countUpHeroes } from './ui.js';

const SEED_CATEGORIES = [
  { id: 'cat-food', name: 'Food & Dining', parentId: null },
  { id: 'cat-groceries', name: 'Groceries', parentId: null },
  { id: 'cat-transport', name: 'Transport', parentId: null },
  { id: 'cat-bills', name: 'Bills & Utilities', parentId: null },
  { id: 'cat-rent', name: 'Rent', parentId: null },
  { id: 'cat-shopping', name: 'Shopping', parentId: null },
  { id: 'cat-entertainment', name: 'Entertainment', parentId: null },
  { id: 'cat-health', name: 'Health', parentId: null },
  { id: 'cat-income', name: 'Income', parentId: null },
  { id: 'cat-transfer', name: 'Transfer', parentId: null },
  { id: 'cat-other', name: 'Other', parentId: null },
];

const SEED_ACCOUNT = { id: CASH_ACCOUNT_ID, label: 'Cash', type: 'cash', issuer: null, last4: null };

const views = {
  summary: { title: 'Summary', module: summaryView },
  add: { title: 'Add', module: addView },
  transactions: { title: 'History', module: transactionsView },
  accounts: { title: 'Accounts', module: accountsView },
  plan: { title: 'Plan', module: planView },
  coach: { title: 'Coach', module: coachView },
  inbox: { title: 'Bank alerts', module: inboxView },
  recap: { title: 'Month in review', module: recapView },
  categories: { title: 'Categories', module: categoriesView },
  import: { title: 'Import Statement', module: importView },
  settings: { title: 'Backup & Settings', module: settingsView },
  setup: { title: 'Set up', module: setupView },
};

async function seedIfNeeded() {
  const [categories, accounts] = await Promise.all([getAll('categories'), getAll('accounts')]);
  if (categories.length === 0) {
    for (const c of SEED_CATEGORIES) await put('categories', c);
  }
  if (accounts.length === 0) {
    await put('accounts', SEED_ACCOUNT);
  }
}

let currentView = 'summary';
let currentParams = {};
let enterTimer = null;
// Each screen shown gets a number; only the newest may appear. Tapping two
// tabs quickly starts two screens, and the slower one must not land on top.
let drawing = 0;

// The screens you came through, most recent last, so back can retrace them -
// kept here in the app rather than as browser history. Browser history
// outlives the app: leave with the home button, come back, and it still held
// every screen from before, so back walked you through all of them again.
const trail = [];
const TRAIL_MAX = 30;

// fromHistory: shown because of the back button (or on start-up), so it is
// not added to the trail. scrollY: where to put you on it.
async function showView(name, params = {}, fromHistory = false, scrollY = 0) {
  const view = views[name];
  if (!fromHistory && name !== currentView) {
    trail.push({ view: currentView, params: currentParams, scrollY: window.scrollY });
    if (trail.length > TRAIL_MAX) trail.shift();
  }
  currentView = name;
  currentParams = params;
  history.replaceState(TOP, '', urlFor(name));

  // The new screen is built out of sight and swapped in whole. Building it in
  // place meant emptying the old screen first and then filling the new one in
  // pieces - Summary arrives in four - which is the flicker you saw on every
  // tab: blank, part, part, whole.
  const mine = ++drawing;
  const old = document.getElementById('view-container');
  const next = document.createElement('main');
  next.className = 'view-container';
  next.hidden = true;
  old.after(next);
  try {
    await view.module.render(next, params);
  } catch (err) {
    next.remove();
    throw err;
  }
  if (mine !== drawing) {
    next.remove();
    return;
  }
  old.remove();
  next.id = 'view-container';
  next.hidden = false;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('view-title').textContent = view.title;
  showSpaceChip();
  window.scrollTo(0, scrollY);

  // Bars fill to their value as a screen arrives (css "Motion"); the class
  // comes off again so a screen redrawing itself doesn't replay them. The
  // figure counts first and the bars fill under it (design.md section 10).
  next.classList.add('view-enter');
  countUpHeroes(next);
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => next.classList.remove('view-enter'), 1400);
}

// Something folded away opens with a short unfold, but only when you tap it:
// a screen redrawn with a section already open shouldn't animate it again.
document.addEventListener('click', (e) => {
  const summary = e.target.closest('summary');
  const details = summary && summary.parentElement;
  if (!details || details.tagName !== 'DETAILS' || details.open) return;
  details.classList.add('unfolding');
  setTimeout(() => details.classList.remove('unfolding'), 450);
});

// Builds the address for a screen from the path alone. A bare '#summary' would
// keep whatever query string the page was opened with - after a share that is
// '?shared=1', which would reopen the alert inbox on every reload.
function urlFor(view) {
  return `${location.pathname}#${view}`;
}

// Back goes back one step at a time: whatever is open on the screen first (a
// step of Import or Setup, a form on Accounts, a payment on History), then the
// screen before, where you were on it. From Summary with nothing left, back
// arms an exit: a second press within two seconds leaves the app.
//
// The browser's history is kept two deep whatever you do - a root marker with
// the app on top - so the back button always lands on the root, and the app
// decides what that press means. Coming back to the app after half a minute
// or more away starts a fresh trail: leaving with the home button is leaving.
const TOP = { kawach: 'top' };
const FRESH_AFTER_MS = 30000;
let exitArmed = false;
let leaving = false;
let hiddenAt = 0;

function wireBackButton() {
  // Reopened on the app's own top entry (a reload, an update): the root marker
  // is already underneath it, so nothing is added.
  if (!(history.state && history.state.kawach === 'top')) {
    history.replaceState({ kawach: 'root' }, '', urlFor('summary'));
    history.pushState(TOP, '', urlFor('summary'));
  }

  window.addEventListener('popstate', async (e) => {
    if (e.state && e.state.kawach === 'top') return;
    // On the way out. An older version kept every screen as history, and on
    // a phone that still has those entries each one is stepped past here.
    if (leaving) {
      history.back();
      return;
    }
    const stepBack = views[currentView]?.module.onBack;
    if (typeof stepBack === 'function' && stepBack()) {
      history.pushState(TOP, '', urlFor(currentView));
      return;
    }
    if (trail.length) {
      const prev = trail.pop();
      history.pushState(TOP, '', urlFor(prev.view));
      await showView(prev.view, prev.params, true, prev.scrollY);
      return;
    }
    if (currentView !== 'summary') {
      history.pushState(TOP, '', urlFor('summary'));
      showView('summary', {}, true);
      return;
    }
    if (exitArmed) {
      leaving = true;
      history.back();
      return;
    }
    exitArmed = true;
    showToast('Press back again to exit');
    history.pushState(TOP, '', urlFor('summary'));
    setTimeout(() => {
      exitArmed = false;
    }, 2000);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= FRESH_AFTER_MS) {
      trail.length = 0;
      exitArmed = false;
      leaving = false;
    }
  });
}

// Sync runs on open so the other device's changes are already here before you
// start reading numbers, and again a few seconds after you change anything.
// The delay batches a burst of edits - categorising thirty rows is one upload,
// not thirty.
const PUSH_DELAY_MS = 4000;
const SAFE_TO_REFRESH = new Set(['summary', 'accounts', 'coach', 'recap', 'categories']);
let pushTimer = null;
let syncing = false;

function typingInView() {
  const view = document.getElementById('view-container');
  if (!view) return false;
  if (view.contains(document.activeElement) && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return true;
  return [...view.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea')].some((el) => el.value !== el.defaultValue);
}

// Google's sign-in pass lasts about an hour. When it has run out as the app
// opens, Google's page is shown for a moment to renew it - silently, and only
// once per visit, so being offline or signed out can never send you round in
// a loop. Syncs later in the visit just wait for the next open.
const RENEW_TRIED = 'kawach-sync-renew-tried';
function renewGooglePassOnce() {
  try {
    if (!navigator.onLine || sessionStorage.getItem(RENEW_TRIED)) return false;
    sessionStorage.setItem(RENEW_TRIED, '1');
  } catch {
    return false;
  }
  signIn('sync', { silent: true });
  return true;
}

async function runSync({ silent = true, opening = false } = {}) {
  if (syncing) return;
  const [{ configured }, passphrase] = await Promise.all([getSyncConfig(), getSyncPassphrase()]);
  if (!configured || !passphrase) return;
  syncing = true;
  setSyncIndicator('syncing');
  try {
    const result = await syncNow(passphrase);
    setSyncIndicator('ok');
    const { added, updated, deleted } = result.pulled;
    if (!silent && (added || updated || deleted)) {
      showToast(`Synced: ${added} new, ${updated} updated`);
    }
    // Bringing in another device's changes makes what's on screen stale - but
    // redrawing a screen you're filling in would throw away what you typed:
    // an amount on Add, an account picked for an alert, a whole statement
    // waiting for review on Import. Only screens with nothing to lose are
    // refreshed; the rest pick the changes up the next time they open.
    // Cards and Coach have small forms too (a statement day, "can I afford
    // this?"), so they're skipped while something on them has been typed into.
    if ((added || updated || deleted) && SAFE_TO_REFRESH.has(currentView) && !typingInView()) {
      // In place, keeping where you are on the screen and what you opened.
      const container = document.getElementById('view-container');
      const view = views[currentView];
      await redraw(container, () => view.module.render(container, currentParams));
    }
  } catch (err) {
    if (err.needsSignIn && opening && renewGooglePassOnce()) return;
    setSyncIndicator('error', err.needsSignIn ? 'Sync needs Google sign-in: Settings, Sync now' : err.message);
  } finally {
    syncing = false;
  }
}

function setSyncIndicator(state, title = '') {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.hidden = state === 'ok';
  el.innerHTML = state === 'syncing' ? icon('sync') : icon('alert');
  el.className = `sync-indicator ${state}`;
  el.title = state === 'error' ? title : 'Syncing…';
}

function wireSync() {
  // The warning beside the title is where sync says it needs you: tapping it
  // opens Settings, where Sync now signs in again.
  const indicator = document.getElementById('sync-indicator');
  if (indicator) indicator.addEventListener('click', () => {
    if (indicator.classList.contains('error')) showView('settings');
  });

  onLocalChange(() => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => runSync(), PUSH_DELAY_MS);
  });

  runSync({ silent: false, opening: true });

  // Coming back to the app after it's been in the background is exactly when
  // the other device is most likely to have moved on.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runSync({ silent: false });
  });
}

// While the app was in the background another tab, or the service worker's
// bill reminders, may have written to the database without going through
// this page - so nothing read before then can be trusted to still be current.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  forgetCachedReads();
  if (!SAFE_TO_REFRESH.has(currentView) || typingInView()) return;
  const container = document.getElementById('view-container');
  const view = views[currentView];
  if (container && view) void redraw(container, () => view.module.render(container, currentParams));
});

// Reuses the update banner for anything that needs you to act before the app
// can carry on. With no button label, the button is hidden.
function showNotice(message, buttonLabel = null) {
  const banner = document.getElementById('update-banner');
  const text = document.getElementById('update-banner-text');
  const btn = document.getElementById('update-banner-btn');
  if (!banner || !text || !btn) return;
  text.textContent = message;
  btn.hidden = !buttonLabel;
  if (buttonLabel) btn.textContent = buttonLabel;
  banner.hidden = false;
}

// Tells you, rather than leaving you to wonder, when the copy you are looking
// at has been superseded by one already downloaded in the background.
async function showUpdateBannerIfStale() {
  const status = await versionStatus();
  if (!status.stale) return;
  showNotice(`A new version of Kawach is ready - you're still seeing ${status.running}.`, 'Reload');
}

function wireUpdateBanner() {
  showUpdateBannerIfStale();

  if ('serviceWorker' in navigator) {
    // A new worker taking over mid-session means newer files are now cached.
    // Only meaningful if something was already controlling this page - on a
    // first-ever install there is no older version to be stale against.
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showUpdateBannerIfStale();
    });
  }

  // Returning to the app is a natural moment to have picked up a new version.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') showUpdateBannerIfStale();
  });
}

// The nav's real height depends on the device's font scaling and safe-area
// inset, so measure it instead of guessing - otherwise it sits on top of the
// last rows of content.
function syncNavHeight() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  document.documentElement.style.setProperty('--nav-height', `${nav.offsetHeight}px`);
}

// Which lane you're in, beside the title on the screens that follow it: Home
// or a business. Tapping it moves to the next one. Summary has its own
// switch; Settings, Setup and Coach are for everything, or for Home.
const FOLLOWS_SPACE = new Set(['accounts', 'transactions', 'plan', 'add', 'categories']);
async function showSpaceChip() {
  const chip = document.getElementById('space-chip');
  const list = await businesses();
  if (!list.length || !FOLLOWS_SPACE.has(currentView)) {
    chip.hidden = true;
    return;
  }
  const spaces = [{ id: 'home', name: 'Home' }, ...list];
  const now = await activeSpace();
  const at = spaces.findIndex((sp) => sp.id === now);
  chip.innerHTML = `${icon(now === 'home' ? 'home' : 'store')}<span>${spaces[at].name.replace(/</g, '&lt;')}</span>`;
  chip.setAttribute('aria-label', `Showing ${spaces[at].name}. Switch`);
  chip.hidden = false;
  chip.onclick = () => {
    setCurrentSpace(spaces[(at + 1) % spaces.length].id);
    showView(currentView, currentParams, true, 0);
  };
}
document.addEventListener('space-changed', () => showSpaceChip());

// True the first time this browser opens the app, and never again. Marked
// before the welcome page is shown, so it can't send anyone round in a loop;
// with no storage at all, it is never the first visit.
function firstVisit() {
  try {
    if (localStorage.getItem('kawach-welcomed')) return false;
    localStorage.setItem('kawach-welcomed', '1');
    return true;
  } catch {
    return false;
  }
}

async function init() {
  // Registered before anything else. The service worker is what catches a
  // shared bank alert on the phone; until it's running, a share would go
  // straight to GitHub. Waiting on the database and first render first only
  // widens that gap (for instance after clearing Chrome's site data).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW registration failed', err));
  }

  // The tab bar's and header's icons, before anything is drawn below them.
  fillIcons();

  // Wired first thing, so the banner's Reload works even if startup stalls
  // below - which is exactly when it's needed.
  const bannerBtn = document.getElementById('update-banner-btn');
  if (bannerBtn) bannerBtn.addEventListener('click', () => window.location.reload());

  // Both cases involve two copies of the app open at once during an update.
  document.addEventListener('db-blocked', () => {
    showNotice('Kawach is open in another tab or window with the older version. Close it and this one will continue.');
  });
  document.addEventListener('db-superseded', () => {
    showNotice('Kawach was updated in another window.', 'Reload');
  });

  await openDB();
  // Ask the phone not to clear Kawach's data when it runs low on space.
  keepDataSafe();
  await seedIfNeeded();
  // Business accounts from before there were spaces get a business to live in.
  await settleSpaces();
  // Icons you picked for your own categories, so every list shows them.
  setCustomStyles(await getAll('categories'));
  // Catches card-bill payments in statements imported before detection could
  // recognise them. Skips anything you've marked by hand, and does nothing
  // once everything is already classified.
  await detectTransfers();
  // A card's cycle comes from its statements, never from a day typed in.
  const [allAccounts, importBatches] = await Promise.all([getAll('accounts'), getAll('importBatches')]);
  for (const fixed of statementDayFixes(allAccounts, importBatches)) await put('accounts', fixed);

  syncNavHeight();
  window.addEventListener('resize', syncNavHeight);
  window.addEventListener('orientationchange', syncNavHeight);

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.getElementById('settings-btn').addEventListener('click', () => showView('settings'));

  document.addEventListener('navigate', (e) => {
    const { view, ...params } = e.detail;
    showView(view, params);
  });

  // A bank alert shared from the phone's share sheet reopens the app at
  // ?shared=1 with the text parked by the service worker. Pick it up before
  // anything renders and go straight to it.
  const openedFromShare = new URLSearchParams(location.search).has('shared');
  const sharedCount = await collectSharedAlerts();

  wireBackButton();
  // Back from Google's sign-in page for a Drive backup or restore
  // (oauth.html): Settings carries on with it. This comes before Setup, so a
  // brand-new phone can restore straight away.
  const driveReturn = new URLSearchParams(location.search).get('drive');
  if (driveReturn) rememberGoogleAccount();
  if (driveReturn === 'backup' || driveReturn === 'restore' || driveReturn === 'sync-on') {
    await showView('settings', { drive: driveReturn });
  } else if (openedFromShare || sharedCount > 0) {
    await showView('inbox');
  } else if (await setupView.needsSetup()) {
    // Someone opening the link in a browser for the first time sees what
    // Kawach is and how to install it before any setup. Once only.
    if (!isInstalled() && firstVisit()) {
      location.replace('./welcome.html');
      return;
    }
    // Brand new: a few steps instead of empty screens.
    await showView('setup', {}, true);
    // Nothing to catch up on: this version's notes are simply seen.
    showIfUpdated(APP_VERSION, await moneyProfile(), { isNew: true });
  } else {
    await showView('summary', {}, true);
    // After an update, once: what changed, for this person.
    setTimeout(async () => showIfUpdated(APP_VERSION, await moneyProfile(), { isNew: false }), 600);
  }

  if ('serviceWorker' in navigator) {
    // Tapping a bill reminder should land on the screen it's about.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'navigate' && views[e.data.view]) showView(e.data.view);
    });
  }

  // Reminders are recomputed on open (bills change when statements land) and
  // anything that came due while the app was closed is shown now.
  refreshSchedule()
    .then(() => runDueReminders())
    .catch(() => {});

  wireSync();

  // Chrome decides a little after start-up that the app can be installed;
  // Summary is redrawn then so its Install card has a working button, and
  // again once installed so the card goes away.
  for (const name of ['install-available', 'install-done']) {
    document.addEventListener(name, () => {
      if (currentView !== 'summary') return;
      const container = document.getElementById('view-container');
      redraw(container, () => views.summary.module.render(container, currentParams));
    });
  }
  wireUpdateBanner();
}

init();

