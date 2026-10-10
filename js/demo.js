/* Demo mode (5.40): show Kawach to someone on your own phone, with made-up money.
 *
 * It is a separate session of the same app. It has its own database (kawach-demo) and its own look and
 * space choices, so your own data is never opened, never read and never changed while it runs: there is
 * nothing to leak, which is a stronger promise than "hidden". What reaches outside is switched off
 * (sync, backups, reminders, shared messages, the clipboard, file pickers), and the app lock is not asked
 * inside the demo but is asked again to leave it, so whoever is holding the phone cannot walk out into
 * your own Kawach.
 *
 * It lasts as long as the app stays open (sessionStorage): closing it ends it, and the next opening is
 * your own Kawach, locked as usual. What the demo wrote is wiped when it starts, when it is left, and
 * whenever your own Kawach opens. */
import { put, getAll, setSetting, closeDB } from './db.js';
import { isDemo, DEMO_DB, DEMO_FLAG } from './demo-flag.js';
import { writeDemo, DEMO_ACCOUNTS } from './demo-data.js';
import { getRecord, enableLock, confirmPin, markUnlocked } from './lock.js';
import { choose } from './secret-sheet.js';
import { askConfirm } from './dialog.js';
import { showToast } from './toast.js';
import { icon } from './icons.js';

const DEMO_KEYS = ['kawach-demo-appearance', 'kawach-demo-space'];

const remember = (fn) => {
  try {
    fn();
  } catch {
    // no storage: the demo simply has nothing to remember
  }
};

function deleteDb(name) {
  return new Promise((resolve) => {
    const done = () => resolve();
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = done;
    } catch {
      done();
    }
    // A connection held open elsewhere only delays the delete; the demo does not wait for it.
    setTimeout(done, 2500);
  });
}

/* Fills the demo database the first time the demo opens it (and again after "Start over"). */
export async function ensureDemoData() {
  const accounts = await getAll('accounts');
  if (accounts.some((a) => a.id === DEMO_ACCOUNTS.bank)) return;
  await writeDemo({ put, setSetting });
}

/* Your own Kawach opening: whatever an unfinished demo left behind goes, and so do its look and space. */
export function sweepDemo() {
  if (isDemo()) return;
  remember(() => DEMO_KEYS.forEach((k) => localStorage.removeItem(k)));
  indexedDB.databases?.().then((list) => list.some((d) => d.name === DEMO_DB) && deleteDb(DEMO_DB)).catch(() => {});
}

/* --- going in -------------------------------------------------------------- */
export async function startDemoFlow() {
  if (!getRecord()) {
    const way = await choose({
      title: 'Turn on the lock first?',
      message: 'Anyone holding your phone in the demo could leave it and open your own Kawach. The app lock stops that: leaving needs your PIN.',
      options: [
        { label: 'Turn on the lock', value: 'lock', kind: 'primary' },
        { label: 'Start without it', value: 'go' },
      ],
      backLabel: 'Not now',
    });
    if (way === null) return false;
    if (way === 'lock' && !(await enableLock())) return false;
  } else {
    const yes = await askConfirm({
      title: 'Show Kawach to someone?',
      message: 'They will see made-up people and money. Nothing of yours is shown, and nothing they do here is kept. To come back to your own Kawach, you will type your PIN.',
      confirmLabel: 'Start the demo',
      cancelLabel: 'Not now',
    });
    if (!yes) return false;
  }
  await beginDemo();
  return true;
}

async function beginDemo() {
  // The demo starts from your look, then keeps its own: changing it there never changes yours.
  remember(() => {
    const look = localStorage.getItem('kawach-appearance');
    if (look == null) localStorage.removeItem('kawach-demo-appearance');
    else localStorage.setItem('kawach-demo-appearance', look);
    localStorage.removeItem('kawach-demo-space');
  });
  await closeDB();
  await deleteDb(DEMO_DB);
  remember(() => sessionStorage.setItem(DEMO_FLAG, '1'));
  location.hash = '#summary';
  location.reload();
}

/* --- inside ------------------------------------------------------------------ */
export function mountDemo() {
  document.body.classList.add('has-demo');
  if (!document.querySelector('.demo-ribbon')) {
    const ribbon = document.createElement('div');
    ribbon.className = 'demo-ribbon';
    ribbon.setAttribute('role', 'status');
    ribbon.innerHTML = '<span><b>DEMO</b> &middot; made-up data</span><button type="button" class="demo-ribbon__leave">Leave demo</button>';
    ribbon.querySelector('button').addEventListener('click', leaveDemoFlow);
    document.body.prepend(ribbon);
  }
  closeDoors();
}

// Whatever a screen asks the browser for that would reach the phone itself is refused, whatever the screen does.
function closeDoors() {
  document.addEventListener(
    'click',
    (e) => {
      const file = e.target && e.target.closest && e.target.closest('input[type=file]');
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      showToast('Choosing files is off in the demo');
    },
    true
  );
  remember(() => {
    if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'readText', { configurable: true, value: async () => { throw new DOMException('Off in the demo', 'NotAllowedError'); } });
  });
  if (window.showOpenFilePicker) window.showOpenFilePicker = async () => { throw new DOMException('Off in the demo', 'NotAllowedError'); };
  if ('Notification' in window) Notification.requestPermission = async () => 'denied';
}

export async function startOver() {
  await closeDB();
  await deleteDb(DEMO_DB);
  location.reload();
}

/* --- coming out ---------------------------------------------------------------- */
export async function leaveDemoFlow() {
  const yes = await askConfirm({ title: 'Leave the demo?', message: 'Everything done in the demo is cleared.', confirmLabel: 'Leave', cancelLabel: 'Stay' });
  if (!yes) return false;
  // With the lock on, leaving asks the PIN: the way out into your own Kawach is yours alone.
  if (!(await confirmPin('Enter your PIN to leave'))) return false;
  await closeDB();
  await deleteDb(DEMO_DB);
  remember(() => {
    sessionStorage.removeItem(DEMO_FLAG);
    DEMO_KEYS.forEach((k) => localStorage.removeItem(k));
  });
  markUnlocked();
  location.hash = '#summary';
  location.reload();
  return true;
}

/* --- Settings, in the demo ---------------------------------------------------------- */
export async function renderDemoSettings(container) {
  container.innerHTML = `
    <div class="totals-card demo-card">
      <div class="totals-row"><span><strong>${icon('play')} You are in the demo</strong></span></div>
      <p class="muted-note">Everything here is made up, and none of it is kept. Switched off here: backups, sync, reminders, the app lock, choosing files and reading the clipboard.</p>
      <button type="button" class="btn-secondary btn-block" id="demo-over">Start over</button>
      <button type="button" class="btn-primary btn-block" id="demo-leave">Leave demo</button>
    </div>
    <div class="k settings-k">
      <h3>Settings</h3>
      <div class="totals-card settings-card">
        <button type="button" class="k-row settings-row" id="go-appearance">
          <span class="k-icon" style="--k-tint:var(--k-accent)">${icon('eye')}</span>
          <span class="k-row__body"><span class="k-row__title">How it looks</span></span>
          <span class="settings-chev">${icon('forward')}</span>
        </button>
        <button type="button" class="k-row settings-row" id="go-categories">
          <span class="k-icon" style="--k-tint:var(--k-accent)">${icon('tag')}</span>
          <span class="k-row__body"><span class="k-row__title">Categories</span></span>
          <span class="settings-chev">${icon('forward')}</span>
        </button>
        <button type="button" class="k-row settings-row" id="watch-tour">
          <span class="k-icon" style="--k-tint:var(--k-accent)">${icon('play')}</span>
          <span class="k-row__body"><span class="k-row__title">Watch the one-minute tour</span></span>
          <span class="settings-chev">${icon('forward')}</span>
        </button>
      </div>
    </div>`;
  const go = (view) => document.dispatchEvent(new CustomEvent('navigate', { detail: { view } }));
  container.querySelector('#demo-over').addEventListener('click', async () => {
    if (await askConfirm({ title: 'Start over?', message: 'The demo goes back to how it began.', confirmLabel: 'Start over' })) startOver();
  });
  container.querySelector('#demo-leave').addEventListener('click', leaveDemoFlow);
  container.querySelector('#go-appearance').addEventListener('click', () => go('appearance'));
  container.querySelector('#go-categories').addEventListener('click', () => go('categories'));
  container.querySelector('#watch-tour').addEventListener('click', async () => (await import('./tour.js')).playTour());
}
