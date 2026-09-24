import { getAll, put, remove, setSetting, getSetting } from '../db.js';
import { icon } from '../icons.js';
import { exportEncrypted, decryptBackup, restoreBackup } from '../backup.js';
import { formatDateNice } from '../format.js';
import { remindersEnabled, reminderDaysBefore, permissionState, enableReminders, disableReminders, refreshSchedule } from '../reminders.js';
import { buildDiagnosticReport } from '../diagnostics.js';
import { isoLocal } from '../frequency.js';
import { showToast } from '../toast.js';
import { askConfirm } from '../dialog.js';
import { getSyncConfig, saveSyncConfig, clearSyncConfig, syncNow, testToken, getSyncPassphrase, setSyncPassphrase, turnOnGoogleSync } from '../sync.js';
import { cycleAwareEnabled } from '../budgets.js';
import { CYCLE_SETTING_KEY } from '../spending-month.js';
import { redraw } from '../redraw.js';
import { dataIsKept } from '../install.js';
import { playTour, shareKawach } from '../tour.js';
import { enhancePasswords, checkPair, MIN_PASSPHRASE } from '../password-field.js';
import { moneyProfile, addBusiness, renameBusiness, removeBusiness, setBusinessGst, setCurrentSpace } from '../business.js';
import { notesFor, openNotes } from '../whats-new.js';
import { backupStatus, backupPassphrase, setBackupPassphrase, markFileBackup, signIn, hasGooglePass, backUpToDrive, listBackups, openDriveBackup } from '../drive.js';

// Kept while this screen is open, so a redraw doesn't lose them: the Drive
// backups found for a restore, whether Restore is open, and whether the
// passphrase is being changed.
let driveList = null;
let restoreOpen = false;
let changingPass = false;

export async function render(container, params = {}) {
  const sync = await getSyncConfig();
  const syncPass = await getSyncPassphrase();
  const cycleAware = await cycleAwareEnabled();
  const enabled = await remindersEnabled();
  const permission = permissionState();
  const daysBefore = await reminderDaysBefore();
  const lastBackupAt = await getSetting('lastBackupAt', null);
  const safety = dataSafety(sync, syncPass, lastBackupAt);
  const kept = await dataIsKept();
  const backup = await backupStatus();
  const profile = await moneyProfile();

  container.innerHTML = `
    ${moneyCard(profile)}
    <div class="totals-card data-safety ${safety.ok ? '' : 'warn-card'}">
      <div class="totals-row"><span><strong>${safety.ok ? `${icon('check')} Your data is safe` : `${icon('alert')} Your data is only on this phone`}</strong></span></div>
      <div class="totals-row"><span class="muted">Sync</span><span>${safety.syncText}</span></div>
      <div class="totals-row"><span class="muted">Last backup</span><span>${safety.backupText}</span></div>
      <div class="totals-row"><span class="muted">Kept safe on this phone</span><span>${kept ? 'Yes' : 'Not yet'}</span></div>
    </div>

    ${backupSection(backup)}
    ${syncSection(sync, syncPass, backup)}

    <h3>How months are counted</h3>
    <div class="totals-card">
      <div class="attention-row">
        <span>Count card spending by billing cycle<br><span class="muted-note">${
          cycleAware
            ? 'On: spends after the statement day count next month'
            : 'Off: counted by date'
        }</span></span>
        <button type="button" class="btn-tiny ${cycleAware ? '' : 'primary'}" id="cycle-toggle">${cycleAware ? 'Turn off' : 'Turn on'}</button>
      </div>
    </div>

    <h3>Bill reminders</h3>
    <div class="totals-card">
      ${
        permission === 'unsupported'
          ? '<p class="muted-note">This browser doesn\'t support notifications.</p>'
          : permission === 'denied'
            ? '<p class="muted-note">Notifications are blocked. Allow them in your browser settings first.</p>'
            : `
        <div class="attention-row">
          <span>Remind me about bills<br><span class="muted-note" id="reminder-state">${enabled ? 'On' : 'Off'}</span></span>
          <button type="button" class="btn-tiny ${enabled ? '' : 'primary'}" id="reminder-toggle">${enabled ? 'Turn off' : 'Turn on'}</button>
        </div>
        <label class="field" style="margin-top:var(--space-sm)">
          <span>How many days before</span>
          <select id="reminder-days">
            ${[1, 2, 3, 5, 7].map((d) => `<option value="${d}" ${d === daysBefore ? 'selected' : ''}>${d} day${d === 1 ? '' : 's'} before</option>`).join('')}
          </select>
        </label>`
      }
    </div>

    <h3>Privacy</h3>
    <div class="totals-card">
      <ul class="setup-points">
        <li>${icon('lock')} Your data stays on this phone.</li>
        <li>${icon('file')} Statements are read, never saved.</li>
        <li>${icon('key')} Backups are locked with your passphrase.</li>
        <li>${icon('ban')} No ads, no tracking, no bank logins.</li>
      </ul>
      <p class="muted-note">Not financial advice.</p>
    </div>

    <h3>Report a problem</h3>
    <p class="group-subtitle">Names, UPI ids and card digits are hidden.</p>
    <div class="totals-card">
      <button type="button" id="diagnostic-btn" class="btn-secondary btn-block">Save diagnostic report</button>
      <p id="diagnostic-status" class="status" hidden></p>
    </div>

    <h3>More</h3>
    <div class="button-stack">
      <button type="button" id="go-categories" class="btn-secondary btn-block">Manage categories</button>
      <button type="button" id="watch-tour" class="btn-secondary btn-block">Watch the 1-minute tour</button>
      <button type="button" id="run-setup" class="btn-secondary btn-block">Run setup again</button>
      <button type="button" id="whats-new-btn" class="btn-secondary btn-block">What's new</button>
      <button type="button" id="share-app-btn" class="btn-secondary btn-block">Share Kawach with a friend</button>
    </div>

    <h3>Import history</h3>
    <p class="group-subtitle">Undo a wrong import.</p>
    <div id="import-history"></div>
  `;

  enhancePasswords(container);
  wireBackup(container, params);
  wireSync(container, params);

  container.querySelector('#cycle-toggle').addEventListener('click', async () => {
    await setSetting(CYCLE_SETTING_KEY, !cycleAware);
    showToast(cycleAware ? 'Counting by calendar date' : 'Counting by billing cycle');
    redraw(container, () => render(container));
  });

  const reminderToggle = container.querySelector('#reminder-toggle');
  if (reminderToggle) {
    reminderToggle.addEventListener('click', async () => {
      if (await remindersEnabled()) {
        await disableReminders();
        showToast('Bill reminders off');
      } else {
        const result = await enableReminders(Number(container.querySelector('#reminder-days').value));
        if (!result.ok) {
          showToast(result.reason === 'denied' ? 'Your browser blocked notifications' : "Couldn't turn on reminders");
        } else {
          showToast(result.background ? 'Reminders on, in the background' : 'Reminders on');
        }
      }
      redraw(container, () => render(container));
    });

    container.querySelector('#reminder-days').addEventListener('change', async (e) => {
      await setSetting('reminderDaysBefore', Number(e.target.value));
      await refreshSchedule();
    });
  }

  const diagnosticStatus = container.querySelector('#diagnostic-status');
  container.querySelector('#diagnostic-btn').addEventListener('click', async () => {
    try {
      showStatus(diagnosticStatus, 'Preparing…', false);
      const report = await buildDiagnosticReport();
      const blob = new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kawach-diagnostic-v${report.appVersion}-${isoLocal(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showStatus(diagnosticStatus, `Saved: ${report.counts.transactions} transactions, ${report.counts.commitments} commitments (plus ${report.counts.suggestions} the app spotted), no names or reference numbers.`, false);
    } catch (err) {
      showStatus(diagnosticStatus, `Couldn't make the report: ${err.message}`, true);
    }
  });

  container.querySelector('#share-app-btn').addEventListener('click', shareKawach);
  container.querySelector('#whats-new-btn').addEventListener('click', async () => {
    openNotes(notesFor(await moneyProfile()), { title: "What's new" });
  });
  wireMoneyCard(container, profile);
  container.querySelector('#watch-tour').addEventListener('click', playTour);

  container.querySelector('#run-setup').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'setup', restart: true } }));
  });

  container.querySelector('#go-categories').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'categories' } }));
  });

  await renderImportHistory(container);
}

function wireSync(container, params) {
  const again = () => redraw(container, () => render(container));
  const statusEl = container.querySelector('#sync-status');

  // Google sync: on, now, or after coming back from Google's sign-in page.
  const googleOn = async () => {
    const passphrase = await backupPassphrase();
    if (!passphrase) return showStatus(statusEl, 'Set a backup passphrase first.', true);
    if (!hasGooglePass()) return signIn('sync-on');
    await turnOnGoogleSync();
    try {
      showStatus(statusEl, 'Syncing…', false);
      const result = await syncNow(passphrase, { onProgress: (m) => showStatus(statusEl, m, false) });
      showToast(`Synced ${result.counts.transactions} transactions`);
      again();
    } catch (err) {
      if (err.needsSignIn) return signIn('sync-on');
      showStatus(statusEl, err.message, true);
    }
  };
  const onBtn = container.querySelector('#sync-google-on');
  if (onBtn) onBtn.addEventListener('click', googleOn);
  if (params.drive === 'sync-on' && !params.syncDone) {
    params.syncDone = true;
    googleOn();
  }
  const offBtn = container.querySelector('#sync-off');
  if (offBtn) {
    offBtn.addEventListener('click', async () => {
      const stop = await askConfirm({
        title: 'Turn off sync on this device?',
        message: 'Your data stays here, and the synced copy stays in your Google Drive for your other devices.',
        confirmLabel: 'Turn off',
      });
      if (!stop) return;
      await clearSyncConfig();
      again();
    });
  }

  const connectBtn = container.querySelector('#sync-connect');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const token = container.querySelector('#sync-token').value.trim();
      const passphrase = container.querySelector('#sync-pass').value;
      const statusEl = container.querySelector('#sync-connect-status');
      if (!token) return showStatus(statusEl, 'Paste your GitHub token first.', true);
      if (passphrase.length < 8) return showStatus(statusEl, 'Use a passphrase of at least 8 characters.', true);

      showStatus(statusEl, 'Checking the token…', false);
      const check = await testToken(token);
      if (!check.ok) return showStatus(statusEl, check.reason, true);

      await saveSyncConfig({ token });
      await setSyncPassphrase(passphrase);
      try {
        showStatus(statusEl, `Connected as ${check.login}. Syncing…`, false);
        const result = await syncNow(passphrase, { onProgress: (m) => showStatus(statusEl, m, false) });
        showToast(`Synced ${result.counts.transactions} transactions`);
        redraw(container, () => render(container));
      } catch (err) {
        showStatus(statusEl, err.message, true);
      }
    });
  }

  const nowBtn = container.querySelector('#sync-now');
  if (nowBtn) {
    nowBtn.addEventListener('click', async () => {
      const passphrase = await getSyncPassphrase();
      if (!passphrase) return showStatus(statusEl, 'Enter your passphrase below first.', true);
      nowBtn.disabled = true;
      try {
        const result = await syncNow(passphrase, { onProgress: (m) => showStatus(statusEl, m, false) });
        const { added, updated, deleted } = result.pulled;
        showStatus(
          statusEl,
          added || updated || deleted
            ? `Brought in ${added} new, ${updated} updated, ${deleted} removed.`
            : 'Already up to date.',
          false
        );
        redraw(container, () => render(container));
      } catch (err) {
        if (err.needsSignIn) return signIn('sync-on');
        showStatus(statusEl, err.message, true);
      } finally {
        nowBtn.disabled = false;
      }
    });
  }

  const passSave = container.querySelector('#sync-pass-save');
  if (passSave) {
    passSave.addEventListener('click', async () => {
      const value = container.querySelector('#sync-pass-again').value;
      if (value.length < 8) return;
      await setSyncPassphrase(value);
      redraw(container, () => render(container));
    });
  }

  const disconnectBtn = container.querySelector('#sync-disconnect');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      const stop = await askConfirm({
        title: 'Stop syncing on this device?',
        message: 'Your data stays here and the gist stays on GitHub. This only forgets the token and passphrase.',
        confirmLabel: 'Disconnect',
        danger: true,
      });
      if (!stop) return;
      await clearSyncConfig();
      await setSyncPassphrase(null);
      redraw(container, () => render(container));
    });
  }
}

// Whether the data would survive losing this phone: synced in the last week,
// or a backup file from the last month.
export function dataSafety(sync, syncPass, lastBackupAt, now = Date.now()) {
  const DAY = 86400000;
  const synced = sync.configured && syncPass && sync.lastSync && now - sync.lastSync < 7 * DAY;
  const backedUp = lastBackupAt && now - lastBackupAt < 30 * DAY;
  return {
    ok: Boolean(synced || backedUp),
    syncText: !sync.configured ? 'Off' : !syncPass ? 'Needs passphrase' : sync.lastSync ? timeAgo(sync.lastSync) : 'Not yet',
    backupText: lastBackupAt ? timeAgo(lastBackupAt) : 'Never',
    daysUnprotected: lastBackupAt || sync.lastSync ? Math.floor((now - Math.max(lastBackupAt || 0, sync.lastSync || 0)) / DAY) : null,
  };
}

// --- Your money ---------------------------------------------------------------
// What pays for Home, and the businesses, each a space of its own
// (js/business.js). The toggle at the top of Summary moves between them.

const KINDS = [
  ['salary', 'Salary'],
  ['household', 'Household money'],
  ['business', 'My business'],
  ['pension', 'Pension'],
];

function moneyCard(profile) {
  return `
    <div class="totals-card" id="money-card">
      <p class="money-label">Home is paid for by</p>
      <div class="money-kinds" role="radiogroup" aria-label="Home is paid for by">
        ${KINDS.map(
          ([id, label]) =>
            `<button type="button" class="money-kind ${profile.main === id ? 'on' : ''}" role="radio" aria-checked="${profile.main === id}" data-kind="${id}">${label}</button>`
        ).join('')}
      </div>
      <p class="money-label money-label-gap">Businesses</p>
      ${profile.businesses
        .map(
          (b) => `<div class="biz-row">
            ${icon('store')}
            <input type="text" class="biz-name" data-id="${escapeHtml(b.id)}" value="${escapeHtml(b.name)}" aria-label="Business name">
            <label class="biz-gst"><input type="checkbox" class="biz-gst-box" data-id="${escapeHtml(b.id)}" ${b.gst ? 'checked' : ''}> GST</label>
            <button type="button" class="icon-btn biz-remove" data-id="${escapeHtml(b.id)}" aria-label="Remove ${escapeHtml(b.name)}">${icon('close')}</button>
          </div>`
        )
        .join('')}
      <div class="biz-add" id="add-business-row">
        <input type="text" id="biz-new-name" placeholder="${profile.businesses.length ? 'Another business' : 'Shop, tiffin, tuition'}" aria-label="New business name">
        <button type="button" class="btn-tiny primary" id="add-business-btn">Add</button>
      </div>
    </div>`;
}

function wireMoneyCard(container, profile) {
  const again = () => redraw(container, () => render(container));

  container.querySelectorAll('.money-kind').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kind = btn.dataset.kind;
      if (kind === profile.main) return;
      await setSetting('incomeType', kind);
      // Home paid for by a business needs a business to be paid by.
      if (kind === 'business' && !profile.businesses.length) await addBusiness('My business');
      showToast(`Home is paid for by ${btn.textContent.toLowerCase()}`);
      again();
    });
  });

  const nameEl = container.querySelector('#biz-new-name');
  const add = async () => {
    const name = nameEl.value.trim();
    if (!name) return nameEl.focus();
    const id = await addBusiness(name);
    setCurrentSpace(id);
    showToast(`${name} added. Its switch is at the top of Summary.`);
    again();
  };
  container.querySelector('#add-business-btn').addEventListener('click', add);
  nameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') add();
  });

  // GST registered: its return dates then show in that business's Summary.
  container.querySelectorAll('.biz-gst-box').forEach((box) => {
    box.addEventListener('change', async () => {
      await setBusinessGst(box.dataset.id, box.checked);
    });
  });

  container.querySelectorAll('.biz-name').forEach((input) => {
    input.addEventListener('change', async () => {
      await renameBusiness(input.dataset.id, input.value);
      showToast('Renamed');
    });
  });

  container.querySelectorAll('.biz-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const b = profile.businesses.find((x) => x.id === btn.dataset.id);
      if (profile.main === 'business' && profile.businesses.length === 1) {
        return showToast('Home is paid for by this business. Change that above first.');
      }
      const ok = await askConfirm({
        title: `Remove ${b.name}?`,
        message: 'Its accounts and fixed costs move to Home, where they count.',
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
      await removeBusiness(b.id);
      again();
    });
  });
}

// --- Backup -----------------------------------------------------------------
// One passphrase, set once, locks every backup. Then two places to keep one -
// Google Drive and this phone - side by side, and one way back from either.

function backupSection(backup) {
  const setUp = backup.passphraseSet && !changingPass;
  return `
    <h3>Backup</h3>
    ${setUp ? '' : '<p class="group-subtitle">One passphrase for all your backups.</p>'}
    <div class="totals-card" id="backup-card">
      ${
        setUp
          ? `<div class="backup-row">
               ${icon('cloud')}
               <span>Google Drive<br><span class="muted-note">${backup.driveLastAt ? timeAgo(backup.driveLastAt) : 'Not yet'}</span></span>
               <button type="button" class="btn-tiny primary" id="drive-backup-btn">Back up</button>
             </div>
             <div class="backup-row">
               ${icon('phone')}
               <span>This phone<br><span class="muted-note">${backup.fileLastAt ? timeAgo(backup.fileLastAt) : 'Not yet'}</span></span>
               <button type="button" class="btn-tiny" id="file-backup-btn">Save file</button>
             </div>
             <button type="button" class="btn-secondary btn-block" id="backup-share-btn" hidden>Choose where to save it</button>`
          : `<label class="field">
               <span>${changingPass ? 'New passphrase' : 'Backup passphrase'}</span>
               <input type="password" id="backup-pass" placeholder="At least 8 characters" autocomplete="new-password">
             </label>
             <label class="field">
               <span>Type it again</span>
               <input type="password" id="backup-pass-again" autocomplete="new-password">
             </label>
             <p class="muted-note">Write it down. It can't be recovered.${changingPass ? ' Older backups still open with the old one.' : ''}</p>
             <button type="button" class="btn-primary" id="backup-pass-save">Save passphrase</button>
             ${changingPass ? '<button type="button" class="link-btn" id="backup-pass-cancel">Cancel</button>' : ''}`
      }
      <button type="button" class="backup-row backup-row-btn" id="restore-toggle" aria-expanded="${restoreOpen}">
        ${icon('restore')}
        <span>Restore<br><span class="muted-note">From Drive or a file</span></span>
        ${icon(restoreOpen ? 'up' : 'forward')}
      </button>
      ${restoreOpen ? restorePanel() : ''}
      <p id="backup-status" class="status" hidden></p>
    </div>
    ${setUp ? '<p class="muted-note backup-foot">Passphrase set · <button type="button" class="link-btn" id="backup-pass-change">Change</button></p>' : ''}
  `;
}

// Both ways back. The passphrase box can be left empty to use the one set on
// this phone; a backup made with another passphrase needs that one typed.
function restorePanel() {
  return `
    <div class="restore-panel">
      <button type="button" id="drive-restore-btn" class="btn-secondary btn-block">From Google Drive</button>
      ${driveList ? driveChoices(driveList) : ''}
      <label class="field">
        <span>Or from a file</span>
        <input type="file" id="restore-file" accept=".json,.txt,application/json,text/plain">
      </label>
      <label class="field">
        <span>Passphrase</span>
        <input type="password" id="restore-pass" placeholder="Leave empty for this phone's" autocomplete="current-password">
      </label>
      <button type="button" id="restore-btn" class="btn-secondary btn-block">Restore</button>
    </div>`;
}

// The Drive backups to pick from, newest first.
function driveChoices(list) {
  if (!list.length) return '<p class="muted-note">No Kawach backups in this Google Drive yet.</p>';
  return `
    <div class="drive-restore">
      ${list
        .map(
          (f, i) => `<label class="drive-file">
            <input type="radio" name="drive-file" value="${escapeHtml(f.id)}" ${i === 0 ? 'checked' : ''}>
            <span>${formatDateNice(f.modifiedTime.slice(0, 10))}, ${new Date(f.modifiedTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}${i === 0 ? ' <span class="muted">(latest)</span>' : ''}</span>
          </label>`
        )
        .join('')}
    </div>`;
}

function wireBackup(container, params) {
  const statusEl = container.querySelector('#backup-status');
  const again = () => redraw(container, () => render(container));
  // Anything that needs Google first goes to its sign-in page and comes back
  // here with `purpose` to carry on (see oauth.html).
  const orSignIn = (err, purpose) => {
    if (err && err.needsSignIn) return signIn(purpose);
    showStatus(statusEl, err && err.message ? err.message : 'Something went wrong.', true);
  };

  // Setting (or changing) the passphrase.
  const passEl = container.querySelector('#backup-pass');
  if (passEl) {
    const againEl = container.querySelector('#backup-pass-again');
    checkPair(passEl, againEl, () => {
      statusEl.hidden = true;
    });
    container.querySelector('#backup-pass-save').addEventListener('click', async () => {
      const pass = passEl.value;
      if (pass.length < MIN_PASSPHRASE) return showStatus(statusEl, `Use at least ${MIN_PASSPHRASE} characters.`, true);
      if (pass !== againEl.value) return showStatus(statusEl, "The two passphrases don't match.", true);
      const previous = await backupPassphrase();
      await setBackupPassphrase(pass);
      changingPass = false;
      // Google sync is locked with this passphrase too: the synced copy is
      // opened with the old one and written back with the new.
      const sync = await getSyncConfig();
      if (previous && sync.provider === 'google') {
        try {
          await syncNow(pass, { previous });
        } catch {
          // The next sync says what's wrong, in the place it's about.
        }
      }
      showToast('Passphrase saved');
      again();
    });
    const cancel = container.querySelector('#backup-pass-cancel');
    if (cancel) {
      cancel.addEventListener('click', () => {
        changingPass = false;
        again();
      });
    }
  }
  const change = container.querySelector('#backup-pass-change');
  if (change) {
    change.addEventListener('click', () => {
      changingPass = true;
      again();
    });
  }

  // Google Drive.
  const backUp = async () => {
    try {
      showStatus(statusEl, 'Backing up to Google Drive…', false);
      const counts = await backUpToDrive();
      await setSetting('lastBackupAt', Date.now());
      showToast(`Backed up ${counts.transactions} transactions to Drive`);
      again();
    } catch (err) {
      orSignIn(err, 'backup');
    }
  };
  const driveBtn = container.querySelector('#drive-backup-btn');
  if (driveBtn) driveBtn.addEventListener('click', backUp);

  // This phone: a locked file, saved where you choose.
  const fileBtn = container.querySelector('#file-backup-btn');
  const shareBtn = container.querySelector('#backup-share-btn');
  let ready = null;
  const save = async () => {
    try {
      if (!ready) {
        showStatus(statusEl, 'Locking the file…', false);
        const { envelope, counts } = await exportEncrypted(await backupPassphrase());
        ready = { text: JSON.stringify(envelope), counts, date: isoLocal(new Date()) };
      }
      const where = await saveWhereYouChoose(ready);
      await markFileBackup();
      await setSetting('lastBackupAt', Date.now());
      showToast(`Backed up ${ready.counts.transactions} transactions${where}`);
      again();
    } catch (err) {
      // Closing the share sheet or the Save box is a choice, not a failure.
      if (err && err.name === 'AbortError') return showStatus(statusEl, 'Not saved.', false);
      // Locking the file took long enough that the phone no longer counts
      // the tap as yours, and won't open the share sheet: one more tap will.
      if (err && err.name === 'NotAllowedError' && ready) {
        shareBtn.hidden = false;
        return showStatus(statusEl, 'Ready. Tap "Choose where to save it".', false);
      }
      showStatus(statusEl, err && err.message ? err.message : 'Backup failed.', true);
    }
  };
  if (fileBtn) fileBtn.addEventListener('click', save);
  if (shareBtn) shareBtn.addEventListener('click', save);

  // Restore.
  container.querySelector('#restore-toggle').addEventListener('click', () => {
    restoreOpen = !restoreOpen;
    again();
  });
  const loadList = async () => {
    try {
      showStatus(statusEl, 'Looking in your Google Drive…', false);
      driveList = await listBackups();
      restoreOpen = true;
      again();
    } catch (err) {
      orSignIn(err, 'restore');
    }
  };
  if (restoreOpen) {
    container.querySelector('#drive-restore-btn').addEventListener('click', loadList);
    container.querySelector('#restore-btn').addEventListener('click', async () => {
      const passphrase = container.querySelector('#restore-pass').value || (await backupPassphrase());
      if (!passphrase) return showStatus(statusEl, 'Enter the passphrase for that backup.', true);
      const chosen = container.querySelector('input[name="drive-file"]:checked');
      const file = container.querySelector('#restore-file').files[0];
      if (!file && !chosen) return showStatus(statusEl, 'Choose a backup file, or one from Google Drive.', true);
      try {
        showStatus(statusEl, 'Opening the backup…', false);
        const { data, createdAt, counts } = file ? await decryptBackup(await file.text(), passphrase) : await openDriveBackup(chosen.value, passphrase);
        const ok = await askConfirm({
          title: 'Replace everything with this backup?',
          message: `From ${formatDateNice(createdAt)}, ${counts.transactions} transactions. Everything in the app now is replaced. This cannot be undone.`,
          confirmLabel: 'Restore',
          danger: true,
        });
        if (!ok) return showStatus(statusEl, 'Restore cancelled.', false);
        await restoreBackup(data);
        // The passphrase that opened it is the one for future backups too.
        await setBackupPassphrase(passphrase);
        driveList = null;
        restoreOpen = false;
        showToast(`Restored ${counts.transactions} transactions`);
        setTimeout(() => location.replace(location.pathname), 800);
      } catch (err) {
        orSignIn(err, 'restore');
      }
    });
  }

  // Back from Google's sign-in page: carry on with what was asked, once.
  if (params.drive === 'backup' && !params.driveDone) {
    params.driveDone = true;
    backUp();
  } else if (params.drive === 'restore' && !params.driveDone) {
    params.driveDone = true;
    loadList();
  }
}

// You choose where it goes. On a phone that is the share sheet - Drive,
// Files, email to yourself; on a computer, a "Save as" box. Chrome only
// shares a few kinds of file and a .json isn't one, so a shared backup is a
// .txt: the same file, and Restore takes either. Says where it went.
async function saveWhereYouChoose(made) {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: `kawach-backup-${made.date}.json`,
      types: [{ description: 'Kawach backup', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(made.text);
    await writable.close();
    return '';
  }
  const file = new File([made.text], `kawach-backup-${made.date}.txt`, { type: 'text/plain' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Kawach backup' });
    return '';
  }
  const url = URL.createObjectURL(new Blob([made.text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `kawach-backup-${made.date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return ' to Downloads';
}

// --- Sync ----------------------------------------------------------------------
// The usual way is Google: same account and passphrase on each device.
// GitHub stays for those already syncing through it, folded away.

function syncSection(sync, syncPass, backup) {
  if (sync.provider === 'google') {
    return `
      <h3>Sync</h3>
      <div class="totals-card">
        <div class="backup-row solo">
          ${icon('sync')}
          <span>${sync.lastSync ? 'Synced' : 'Not synced yet'}<br><span class="muted-note">${[sync.lastSync ? timeAgo(sync.lastSync) : '', backup.email ? escapeHtml(backup.email) : ''].filter(Boolean).join(' · ') || 'Google Drive'}</span></span>
          <button type="button" class="btn-tiny primary" id="sync-now">Sync now</button>
        </div>
        <p id="sync-status" class="status" hidden></p>
      </div>
      <p class="muted-note backup-foot"><button type="button" class="link-btn" id="sync-off">Turn off sync</button></p>`;
  }
  if (sync.provider === 'github') {
    return `
      <h3>Sync</h3>
      <div class="totals-card">
        <div class="backup-row solo">
          ${icon('sync')}
          <span>GitHub<br><span class="muted-note">${sync.lastSync ? `Synced ${timeAgo(sync.lastSync)}` : 'Not synced yet'}</span></span>
          <button type="button" class="btn-tiny primary" id="sync-now">Sync now</button>
        </div>
        <p id="sync-status" class="status" hidden></p>
        ${
          syncPass
            ? ''
            : `<label class="field">
                <span>Passphrase needed on this device</span>
                <input type="password" id="sync-pass-again" placeholder="The one you set up sync with" autocomplete="off">
              </label>
              <button type="button" class="btn-secondary btn-block" id="sync-pass-save">Save and sync</button>`
        }
      </div>
      <p class="muted-note backup-foot"><button type="button" class="link-btn" id="sync-disconnect">Disconnect GitHub sync</button></p>`;
  }
  return `
    <h3>Sync</h3>
    <p class="group-subtitle">Phone and laptop, same Google account.</p>
    <div class="totals-card">
      <button type="button" class="btn-secondary btn-block" id="sync-google-on">Turn on sync</button>
      <p id="sync-status" class="status" hidden></p>
      ${backup.passphraseSet ? '' : '<p class="muted-note">Set a backup passphrase first. Sync uses it too.</p>'}
      <details class="setup-help">
        <summary>Advanced: sync through GitHub</summary>
        <ol class="setup-steps">
          <li>On <strong>github.com</strong>: Settings, Developer settings, Personal access tokens, Fine-grained tokens.</li>
          <li><strong>Generate new token</strong>, with <strong>Gists</strong> set to <strong>Read and write</strong>.</li>
          <li>Paste it below.</li>
        </ol>
        <label class="field">
          <span>GitHub token</span>
          <input type="password" id="sync-token" placeholder="github_pat_…" autocomplete="off">
        </label>
        <label class="field">
          <span>Passphrase to lock it with</span>
          <input type="password" id="sync-pass" placeholder="The same on every device" autocomplete="new-password">
        </label>
        <button type="button" class="btn-secondary btn-block" id="sync-connect">Connect GitHub</button>
        <p id="sync-connect-status" class="status" hidden></p>
      </details>
    </div>`;
}

function timeAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'} ago`;
}

async function renderImportHistory(container) {
  const el = container.querySelector('#import-history');
  const [batches, accounts, transactions] = await Promise.all([getAll('importBatches'), getAll('accounts'), getAll('transactions')]);

  if (batches.length === 0) {
    el.innerHTML = '<p class="empty">No statements imported yet.</p>';
    return;
  }

  const accountLabel = (id) => accounts.find((a) => a.id === id)?.label || 'Unknown account';
  const sorted = [...batches].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1));

  el.innerHTML = `
    <div class="totals-card">
      ${sorted
        .map((b) => {
          const stillThere = transactions.filter((t) => t.importBatchId === b.id).length;
          return `
          <div class="upcoming-row">
            <div class="attention-row">
              <span>${escapeHtml(accountLabel(b.accountId))}<br><span class="muted-note">${formatDateNice(b.periodStart)} to ${formatDateNice(b.periodEnd)} · ${stillThere} of ${b.txCount} still here</span></span>
              <button type="button" class="btn-tiny undo-import" data-id="${b.id}" ${stillThere === 0 ? 'disabled' : ''}>Undo</button>
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;

  el.querySelectorAll('.undo-import').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const batchId = btn.dataset.id;
      const affected = transactions.filter((t) => t.importBatchId === batchId);
      const ok = await askConfirm({
        title: `Undo this import?`,
        message: `${affected.length} transactions from it are removed. Anything you logged by hand that it replaced does not come back, and categories set on these are lost.`,
        confirmLabel: 'Undo import',
        danger: true,
      });
      if (!ok) return;

      for (const t of affected) await remove('transactions', t.id);
      await remove('importBatches', batchId);
      await renderImportHistory(container);
    });
  });
}

function showStatus(el, message, isError) {
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('out', !!isError);
  el.classList.toggle('in', !isError);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
