import { openDB, getAll, put, onLocalChange, forgetCachedReads, damagedRecords, getSetting, setSetting } from './db.js';
import { wireExplain } from './explain.js';
import { havenHeader } from './haven-ui.js';
import { initMotion, stretchMark } from './haven-motion.js';
import { openAddSheet, closeAddSheet } from './haven-sheet.js';
import { guardApp } from './lock.js';
import { isDemo } from './demo-flag.js';
import { getSyncConfig, getSyncPassphrase, syncNow } from './sync.js';
import { CASH_ACCOUNT_ID } from './config.js';
import { detectTransfers } from './transfers.js';
import { statementDayFixes } from './account-metrics.js';
import { showToast } from './toast.js';
import { setCustomStyles } from './category-style.js';
import { versionStatus, APP_VERSION } from './version.js';
import { fillIcons, icon } from './icons.js';
import { redraw } from './redraw.js';
import { isoLocal } from './frequency.js';
import { keepDataSafe, isInstalled } from './install.js';
import { signIn, rememberGoogleAccount } from './drive.js';
import { showIfUpdated } from './whats-new.js';
import { moneyProfile, businesses, activeSpace, setCurrentSpace, settleSpaces } from './business.js';
import { applyTheme, applyDisplay, appearance, chosen, setAppearance, retireOldLooks } from './appearance.js';
import { collectSharedAlerts } from './alert-inbox.js';
import { refreshSchedule, runDueReminders } from './reminders.js';
import { countUpHeroes, rollFigures, fillBars, levelWatch, beginArrival, emptyState } from './ui.js';
import { wirePullRefresh } from './pull-refresh.js';

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

// A screen is loaded the first time it is opened, not all thirteen when the app starts: the first visit (the one that
// has to feel quick) reads about a third of the code. `module` is null until then.
const views = {
  summary: { title: 'Summary', module: null, load: () => import('./views/summary.js') },
  add: { title: 'Add', module: null, load: () => import('./views/add.js') },
  transactions: { title: 'History', module: null, load: () => import('./views/transactions.js') },
  accounts: { title: 'Accounts', module: null, load: () => import('./views/accounts.js') },
  plan: { title: 'Plan', module: null, load: () => import('./views/plan.js') },
  coach: { title: 'Coach', module: null, load: () => import('./views/coach.js') },
  inbox: { title: 'Bank alerts', module: null, load: () => import('./views/inbox.js') },
  recap: { title: 'Month in review', module: null, load: () => import('./views/recap.js') },
  categories: { title: 'Categories', module: null, load: () => import('./views/categories.js') },
  import: { title: 'Import Statement', module: null, load: () => import('./views/import.js') },
  settings: { title: 'Backup & Settings', module: null, load: () => import('./views/settings.js') },
  setup: { title: 'Set up', module: null, load: () => import('./views/setup.js') },
  appearance: { title: 'How it looks', module: null, load: () => import('./views/appearance.js') },
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
// Screens left by tapping something inside them (a card on Accounts, a budget on Summary): back returns to that screen, exactly as
// it was left, before it goes home. Choosing a screen from the tab bar starts afresh.
const drillBack = [];

// The lit mark above the active tab (Instrument): one shared mark that glides to the tab you chose in
// 280 ms, instead of a mark that disappears from one tab and appears on the next (css "nav-ind").
// Placed without gliding the first time and when the phone turns.
function moveTabMark() {
  const nav = document.getElementById('tabs');
  const active = nav && nav.querySelector('.nav-btn.active');
  if (!active) return;
  let mark = nav.querySelector('.nav-ind');
  if (!mark) {
    mark = document.createElement('i');
    mark.className = 'nav-ind';
    mark.setAttribute('aria-hidden', 'true');
    nav.append(mark);
  }
  const before = mark.classList.contains('is-ready') ? { x: parseFloat(mark.style.getPropertyValue('--bx')), w: parseFloat(mark.style.getPropertyValue('--bw')) } : null;
  mark.style.setProperty('--x', `${active.offsetLeft + active.offsetWidth * 0.22}px`);
  mark.style.setProperty('--w', `${active.offsetWidth * 0.56}px`);
  // The whole of the lit tab, for the looks whose mark is a pill behind it rather than a line above it.
  mark.style.setProperty('--bx', `${active.offsetLeft}px`);
  mark.style.setProperty('--by', `${active.offsetTop}px`);
  mark.style.setProperty('--bw', `${active.offsetWidth}px`);
  mark.style.setProperty('--bh', `${active.offsetHeight}px`);
  // Haven: the pill stretches towards the new tab like a drop of water (js/haven-motion.js).
  if (before && document.documentElement.dataset.style === 'haven') stretchMark(mark, before, { x: active.offsetLeft, w: active.offsetWidth });
  requestAnimationFrame(() => mark.classList.add('is-ready'));
}
window.addEventListener('resize', () => {
  const mark = document.querySelector('#tabs .nav-ind');
  if (!mark) return;
  mark.classList.remove('is-ready');
  moveTabMark();
});

// fromHistory: shown because of the back button (or on start-up), so it is
// not added to the trail. scrollY: where to put you on it. (Screens do not slide: you change screen by the tab bar only.)
async function showView(name, params = {}, fromHistory = false, scrollY = 0) {
  closeAddSheet();
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
  beginArrival();
  const old = document.getElementById('view-container');
  const next = document.createElement('main');
  next.className = 'view-container';
  next.hidden = true;
  old.after(next);
  // A screen that is slow to work out shows grey shapes where its figures will be (css "skeleton"):
  // at once when there is nothing on screen yet (the app opening), after 700 ms over a screen that is
  // still there. A quick screen never shows them.
  const slow = setTimeout(() => {
    if (mine !== drawing || !old.isConnected) return;
    const sk = document.createElement('div');
    sk.className = 'view-skeleton';
    sk.setAttribute('aria-hidden', 'true');
    sk.innerHTML = '<i class="sk sk--cap"></i><i class="sk sk--fig"></i><i class="sk sk--line"></i><i class="sk sk--card"></i><i class="sk sk--card"></i>';
    old.append(sk);
  }, old.childElementCount ? 700 : 120);
  try {
    if (!view.module) view.module = await view.load();
    await view.module.render(next, params);
  } catch (err) {
    // A screen that fails is replaced by a plain card with a way on, never left blank or half drawn:
    // the tabs still work, and the report says what broke without saying whose money it was.
    console.error(`The ${name} screen could not be drawn`, err);
    next.innerHTML = brokenScreen();
    wireBrokenScreen(next, name, params);
  }
  clearTimeout(slow);
  if (mine !== drawing) {
    next.remove();
    return;
  }
  const swap = () => {
    old.remove();
    next.id = 'view-container';
    next.hidden = false;
    // Coach is reached from Plan, so Plan stays lit while it is open.
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === (name === 'coach' ? 'plan' : name)));
    moveTabMark();
    document.getElementById('view-title').textContent = view.title;
    havenHeader(name);
    showSpaceChip();
    window.scrollTo(0, scrollY);
  };
  // The browser's own cross-fade between the two screens (5.36): the header and the tab bar stay
  // put (css "view transitions"), only the screen fades. Not when
  // the phone asks for less motion, nor in a browser without it: those swap at once, as before.
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition === 'function' && !reduced && !document.hidden) {
    try {
      const fade = document.startViewTransition(swap);
      // A tap on another tab while one is fading skips the first fade: that is not an error to report.
      fade.ready.catch(() => {});
      fade.finished.catch(() => {});
      await fade.updateCallbackDone;
    } catch {
      if (document.getElementById('view-container') === old) swap();
    }
  } else swap();

  // Bars fill to their value as a screen arrives (css "Motion"); the class
  // comes off again so a screen redrawing itself doesn't replay them. The
  // figure counts first and the bars fill under it (design.md section 10).
  next.classList.add('view-enter');
  countUpHeroes(next);
  rollFigures(next);
  fillBars(next);
  levelWatch(next);
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => next.classList.remove('view-enter'), 1400);
  // A screen opened to show one thing (a payment on History) puts you on it, once the screen is really on show: scrolling any
  // earlier happens on a page that is not drawn yet, and the swap above then puts you back at the top.
  if (!fromHistory && typeof view.module.arrive === 'function') requestAnimationFrame(() => requestAnimationFrame(() => mine === drawing && view.module.arrive(next, params)));
}

function brokenScreen() {
  return `${emptyState({
    what: "This screen couldn't be drawn",
    why: 'Nothing of yours is lost. Try again, or save a report so it can be fixed.',
    art: 'error',
    action: { id: 'broken-retry', label: 'Try again' },
  })}
    <div class="broken-more">
      <button type="button" class="btn-secondary" id="broken-report">Save a report</button>
      <button type="button" class="btn-secondary" id="broken-settings">Open Settings</button>
    </div>`;
}

function wireBrokenScreen(root, name, params) {
  root.querySelector('#broken-retry').addEventListener('click', () => showView(name, params, true, 0));
  root.querySelector('#broken-settings').addEventListener('click', () => showView('settings'));
  root.querySelector('#broken-report').addEventListener('click', async () => {
    try {
      const { buildDiagnosticReport } = await import('./diagnostics.js');
      const report = await buildDiagnosticReport();
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kawach-report-v${report.appVersion}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast('Report saved');
    } catch {
      showToast("Couldn't make the report");
    }
  });
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

// Back goes one step at a time (the owner's order, 4.28):
//   1. whatever is open on the screen closes first (a step of Import or Setup,
//      a form on Accounts, a payment on History);
//   2. scrolled down, it goes to the top of the screen;
//   3. on one of the tabs (Add, Accounts, Plan, History, Coach) it goes to
//      Summary; a screen opened from another (Settings, Categories, How it
//      looks, Import...) goes back to the one that opened it;
//   4. on Summary, at the top, it leaves the app.
//
// The browser's history is kept two deep whatever you do - a root marker with
// the app on top - so the back button always lands on the root, and the app
// decides what that press means. Coming back to the app after half a minute
// or more away starts a fresh trail: leaving with the home button is leaving.
const TOP = { kawach: 'top' };
const FRESH_AFTER_MS = 30000;
let leaving = false;
let hiddenAt = 0;

// The topmost thing open over the screen, closed the way its own close button would: true when something was closed.
const OVERLAYS = ['.hv-recdlg', '.hv-sheet', '.hv-story', '.hv-recap', '.hv-ask', '.dialog-backdrop', '.notes-sheet', '.tour-box', '.guide-tip', '#month-sheet', '#quick-sheet', '#add-cat-sheet:not([hidden])', '.secret-dialog', '.lock'];
function dismissOverlay() {
  const shown = (el) => el && el.getClientRects().length > 0;
  const el = OVERLAYS.map((s) => document.querySelector(s)).find(shown);
  if (!el) return false;
  if (el.matches('.hv-sheet')) { closeAddSheet(); return true; }
  if (el.matches('.lock')) return false; // the lock screen is never dismissed by back
  // its own Escape handling first (sheets and dialogs listen for it), whether on it or on the page
  for (const target of [el.querySelector('[role=dialog], .k-sheet, .dialog') || el, document]) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  // things that do not listen are taken away
  if (shown(el) && el.matches('.hv-recdlg, .hv-story, .hv-recap, .hv-ask')) el.remove();
  return true;
}

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
    // 1. Whatever is open over the screen closes first: a sheet, a dialog, the month's story, a recording box.
    if (dismissOverlay()) {
      history.pushState(TOP, '', urlFor(currentView));
      return;
    }
    // 2. Then what is open on the screen itself (an opened account, an unfolded section).
    const stepBack = views[currentView]?.module?.onBack;
    if (typeof stepBack === 'function' && stepBack()) {
      history.pushState(TOP, '', urlFor(currentView));
      return;
    }
    // 3. Summary is home: back from it leaves the app.
    if (currentView === 'summary') {
      leaving = true;
      history.back();
      return;
    }
    // 4. A screen opened by a tap inside another: back to that one, as it was left.
    const from = drillBack.pop();
    if (from) {
      history.pushState(TOP, '', urlFor(from.view));
      await showView(from.view, from.params, true, from.scrollY);
      return;
    }
    // 5. From any other screen, back goes home to Summary.
    trail.length = 0;
    history.pushState(TOP, '', urlFor('summary'));
    await showView('summary', {}, true, 0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= FRESH_AFTER_MS) {
      trail.length = 0;
      drillBack.length = 0;
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
  if (syncing || isDemo()) return;
  const [{ configured }, passphrase] = await Promise.all([getSyncConfig(), getSyncPassphrase()]);
  if (!configured || !passphrase) return;
  syncing = true;
  setSyncIndicator('syncing');
  try {
    const result = await syncNow(passphrase);
    setSyncIndicator('ok');
    const { added, updated, deleted } = result.pulled;
    if (!silent && (added || updated || deleted)) {
      const n = added + updated + deleted;
      showToast(`Synced · ${n} change${n === 1 ? '' : 's'}`);
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
      if (view.module) await redraw(container, () => view.module.render(container, currentParams));
    }
  } catch (err) {
    if (err.needsSignIn && opening && renewGooglePassOnce()) return;
    setSyncIndicator('error', err.needsSignIn ? 'Sync needs Google sign-in: Settings, Sync now' : err.message);
  } finally {
    syncing = false;
  }
}

let syncTickTimer = 0;
function setSyncIndicator(state, title = '') {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  clearTimeout(syncTickTimer);
  // A finished sync ticks for a second, then the icon goes (css "sync-ok"); it never stays.
  if (state === 'ok') {
    el.hidden = false;
    el.innerHTML = icon('check');
    el.className = 'sync-indicator ok';
    el.title = 'Synced';
    syncTickTimer = setTimeout(() => el.classList.contains('ok') && (el.hidden = true), 1100);
    return;
  }
  el.hidden = false;
  el.innerHTML = state === 'syncing' ? icon('sync') : icon('alert');
  el.className = `sync-indicator ${state}`;
  el.title = state === 'error' ? title : 'Syncing…';
}

// Pull a screen down to refresh it (js/pull-refresh.js): syncs when sync is set up, then draws the screen
// again. Only on a screen that can be drawn again safely, and never while something is open over it.
function wirePull() {
  wirePullRefresh({
    canPull: () =>
      SAFE_TO_REFRESH.has(currentView) &&
      !typingInView() &&
      !document.documentElement.classList.contains('is-locked') &&
      !document.querySelector('.dialog-backdrop, .lock, #month-sheet, #quick-sheet, #add-cat-sheet:not([hidden])'),
    refresh: async () => {
      await runSync({ silent: true });
      const container = document.getElementById('view-container');
      const view = views[currentView];
      if (container && view && view.module) await redraw(container, () => view.module.render(container, currentParams));
    },
  });
}

// The big title shrinks into the header as the screen scrolls, and the header gains a hairline.
function wireHeaderShrink() {
  const header = document.querySelector('.app-header');
  if (!header) return;
  // Where the pull-to-refresh icon sits: just under the header, whatever its height on this phone.
  document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  let queued = false;
  window.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        header.style.setProperty('--shrink', String(Math.min(1, Math.max(0, window.scrollY / 60))));
      });
    },
    { passive: true }
  );
}

function wireSync() {
  // Nothing leaves the phone in the demo.
  if (isDemo()) return;
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
  if (container && view && view.module) void redraw(container, () => view.module.render(container, currentParams));
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
/* Has this tab already reloaded itself to reach this build?
 *
 * Reloading to pick up a new version is only safe once, per version. The
 * files are cached by the new worker before it takes control, so between
 * those two moments a reload serves the OLD files again, finds the same
 * newer cache sitting there, and reloads again: the app appeared to flicker
 * through several loads before settling. This remembers the build it
 * reloaded for, so it can never happen twice for the same one.
 */
function reloadedAlreadyFor(build) {
  const KEY = 'kawach-reloaded-for';
  try {
    if (sessionStorage.getItem(KEY) === String(build)) return true;
    sessionStorage.setItem(KEY, String(build));
  } catch {
    // No session storage (a private window): fall back to not reloading on
    // its own, which is the safe direction - the banner still offers it.
    return true;
  }
  return false;
}

async function showUpdateBannerIfStale({ mayReload = false } = {}) {
  const status = await versionStatus();
  if (!status.stale) return;
  // Taking it automatically is only right when the new worker is already in
  // control, which is what mayReload means. Asked at any other moment the
  // reload would fetch the same old files again. Mid-import, or with
  // something typed in, reloading would throw that away, so those screens are
  // told instead and pick it up when they move on.
  if (mayReload && SAFE_TO_REFRESH.has(currentView) && !typingInView() && !reloadedAlreadyFor(status.cached)) {
    location.reload();
    return;
  }
  showNotice('A new version is ready', 'Reload');
}

function wireUpdateBanner() {
  // At startup the new worker, if there is one, has not taken over yet, so
  // this only ever offers.
  showUpdateBannerIfStale();

  if ('serviceWorker' in navigator) {
    // The one moment a reload is certain to land on the new files: a new
    // worker has taken control of this page. Only meaningful if something was
    // already controlling it - on a first-ever install there is no older
    // version to be stale against.
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showUpdateBannerIfStale({ mayReload: true });
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

  // The chosen light or dark. index.html has already done this inline before
  // the first paint; this is the same decision made from the one module that
  // owns it, so there is only ever one answer.
  // Peaks and Mindora are gone (5.41): the person who wore one is on Instrument now, and told once.
  const retired = retireOldLooks();
  applyTheme();
  applyDisplay();
  initMotion();

  // The tab bar's and header's icons, before anything is drawn below them.
  fillIcons();
  if (retired) showToast('Tactile and Charts have retired. You are on Haven now; change it in How it looks.', { ms: 7000 });

  // Wired first thing, so the banner's Reload works even if startup stalls
  // below - which is exactly when it's needed.
  const bannerBtn = document.getElementById('update-banner-btn');
  if (bannerBtn) bannerBtn.addEventListener('click', () => window.location.reload());

  // A failure nothing caught (a button, a background step) is said once in a while, in plain words. It
  // used to be silent: the tap simply did nothing.
  let lastOops = 0;
  const oops = () => {
    if (Date.now() - lastOops < 15000) return;
    lastOops = Date.now();
    showToast('Something went wrong. Nothing was lost. Try again.', { ms: 5000 });
  };
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled', e.reason);
    oops();
  });
  window.addEventListener('error', (e) => {
    // The browser's own layout notice is not a fault.
    if (/ResizeObserver/.test(e.message || '')) return;
    console.error('Error', e.error || e.message);
    oops();
  });
  // Records that cannot be read are left out of every screen (js/db.js); it is said once, with where to look.
  let toldDamaged = false;
  document.addEventListener('records-damaged', () => {
    const n = damagedRecords().length;
    if (!n || toldDamaged) return;
    toldDamaged = true;
    showToast(`${n} ${n === 1 ? 'record' : 'records'} could not be read and ${n === 1 ? 'is' : 'are'} left out. See Settings.`, { ms: 8000 });
  });

  // Both cases involve two copies of the app open at once during an update.
  document.addEventListener('db-blocked', () => {
    showNotice('Kawach is open in another tab or window with the older version. Close it and this one will continue.');
  });
  document.addEventListener('db-superseded', () => {
    showNotice('Kawach was updated in another window.', 'Reload');
  });

  // The app lock, before any of the person's data is read (js/lock.js).
  await guardApp();

  await openDB();
  // Ask the phone not to clear Kawach's data when it runs low on space.
  if (!isDemo()) keepDataSafe();
  await seedIfNeeded();
  // Cash as a pocket starts today (js/cash.js): months already worked out stay as they were.
  if (!isDemo() && (await getSetting('cashRuleFrom', null)) === null) await setSetting('cashRuleFrom', isoLocal(new Date()));
  // The demo: a made-up household in its own database, and its ribbon (js/demo.js). Your own Kawach
  // opening normally clears out any demo left behind by an app that was closed in the middle of one.
  if (isDemo()) {
    const demo = await import('./demo.js');
    await demo.ensureDemoData();
    demo.mountDemo();
  } else {
    import('./demo.js').then((d) => d.sweepDemo()).catch(() => {});
  }
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
  // NEW (5.18): the short Summary is for people starting out. Someone who
  // already had payments or commitments when it arrived keeps the full one
  // they know, until they choose otherwise in How it looks.
  if (!chosen('summary')) {
    const [anyPayments, anyCommitments] = await Promise.all([getAll('transactions'), getAll('recurring')]);
    if (anyPayments.length || anyCommitments.length) setAppearance('summary', 'full');
  }

  syncNavHeight();
  window.addEventListener('resize', syncNavHeight);
  window.addEventListener('orientationchange', syncNavHeight);

  // Haven: Add springs up as a sheet over the screen you are on, instead of being a screen of its own.
  // (not while the demo or a guide is walking you through a screen: it points at the Add screen itself)
  const haven = () => document.documentElement.dataset.style === 'haven' && !document.body.classList.contains('has-demo') && !document.querySelector('.guide-layer');
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (haven() && btn.dataset.view === 'add') return openAddSheet();
      drillBack.length = 0;
      showView(btn.dataset.view);
    });
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    drillBack.length = 0;
    showView('settings');
  });
  // The Add sheet saved something: the screen under it is drawn again, as it was, with the new figures.
  window.addEventListener('hv-refresh', () => {
    if (['summary', 'accounts', 'plan', 'transactions'].includes(currentView)) showView(currentView, currentParams, true, window.scrollY);
  });
  wireExplain();
  // iPhone Safari ignores the page setting for a pinch; it announces the gesture first, and that is stopped here.
  for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, (e) => e.preventDefault());

  document.addEventListener('navigate', (e) => {
    const { view, back, ...params } = e.detail;
    if (view === 'add' && haven()) return openAddSheet(params);
    // The round back arrow undoes the tap that brought you here (it forgets the screen you are leaving instead of storing it, or
    // back would bounce between the two). A guided tour or the demo moving the screens leaves no trail either.
    const touring = document.body.classList.contains('has-demo') || Boolean(document.querySelector('.guide-layer'));
    if (back) drillBack.pop();
    else if (view !== currentView && !touring) {
      drillBack.push({ view: currentView, params: currentParams, scrollY: window.scrollY });
      if (drillBack.length > 8) drillBack.shift();
    }
    showView(view, params);
  });

  // A bank alert shared from the phone's share sheet reopens the app at
  // ?shared=1 with the text parked by the service worker. Pick it up before
  // anything renders and go straight to it.
  const openedFromShare = new URLSearchParams(location.search).has('shared');
  // A home-screen shortcut (manifest.webmanifest) names the screen it wants. Read here, before the back-button set-up
  // below tidies the address and the question is gone.
  const openedAt = new URLSearchParams(location.search).get('open');
  // (A bank alert shared to the phone belongs to the person, never to the demo.)
  const sharedCount = isDemo() ? 0 : await collectSharedAlerts();

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
  } else if (await (views.setup.module || (views.setup.module = await views.setup.load())).needsSetup()) {
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
    // Which screen to open on is the person's choice (js/appearance.js), and
    // only ever a screen that stands on its own: Add and Accounts are fine to
    // land on, the rest are somewhere you go from here.
    // In Haven "Add" is a sheet over a screen, never a screen of its own: the home-screen shortcut opens Summary with the sheet up.
    const sheetShortcut = openedAt === 'add' && haven();
    await showView(['summary', 'add', 'accounts', 'plan', 'transactions'].includes(openedAt) && !sheetShortcut ? openedAt : appearance('opening'), {}, true);
    if (sheetShortcut) openAddSheet();
    // After an update, once: what changed, for this person.
    if (!isDemo()) setTimeout(async () => showIfUpdated(APP_VERSION, await moneyProfile(), { isNew: false }), 600);
  }

  if ('serviceWorker' in navigator) {
    // Tapping a bill reminder should land on the screen it's about.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'navigate' && views[e.data.view]) showView(e.data.view);
    });
  }

  // Reminders are recomputed on open (bills change when statements land) and
  // anything that came due while the app was closed is shown now.
  if (!isDemo()) {
    refreshSchedule()
      .then(() => runDueReminders())
      .catch(() => {});
  }

  wireSync();
  wirePull();
  wireHeaderShrink();

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

init().catch((err) => {
  console.error('Kawach could not start', err);
  const box = document.getElementById('view-container');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `${emptyState({
    what: "Kawach couldn't start",
    why: 'Nothing of yours is lost. Reloading usually fixes it.',
    art: 'error',
    action: { id: 'start-reload', label: 'Reload' },
  })}`;
  box.querySelector('#start-reload').addEventListener('click', () => location.reload());
});

