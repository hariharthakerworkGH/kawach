import { getAll, remove, setSetting, getSetting } from '../db.js';
import { icon } from '../icons.js';
import { exportEncrypted, decryptBackup, restoreBackup } from '../backup.js';
import { formatDateNice } from '../format.js';
import { remindersEnabled, reminderDaysBefore, permissionState, enableReminders, disableReminders, refreshSchedule } from '../reminders.js';
import { buildDiagnosticReport } from '../diagnostics.js';
import { isoLocal } from '../frequency.js';
import { showToast } from '../toast.js';
import { askConfirm } from '../dialog.js';
import { getSyncConfig, saveSyncConfig, clearSyncConfig, syncNow, testToken, getSyncPassphrase, setSyncPassphrase } from '../sync.js';
import { cycleAwareEnabled } from '../budgets.js';
import { CYCLE_SETTING_KEY } from '../spending-month.js';
import { redraw } from '../redraw.js';
import { dataIsKept } from '../install.js';
import { driveStatus, setDrivePassphrase, forgetDrive, signIn, backUpToDrive, listBackups, openDriveBackup, hasDrivePass } from '../drive.js';

// Drive backups found after signing in to restore, kept while this screen is
// open so a redraw doesn't lose the list.
let driveList = null;

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
  const drive = await driveStatus();

  container.innerHTML = `
    <div class="totals-card data-safety ${safety.ok ? '' : 'warn-card'}">
      <div class="totals-row"><span><strong>${safety.ok ? `${icon('check')} Your data is safe` : `${icon('alert')} Your data is only on this phone`}</strong></span></div>
      <div class="totals-row"><span class="muted">Sync</span><span>${safety.syncText}</span></div>
      <div class="totals-row"><span class="muted">Last backup</span><span>${safety.backupText}</span></div>
      <div class="totals-row"><span class="muted">Kept safe on this phone</span><span>${kept ? 'Yes' : 'Not yet'}</span></div>
      ${kept ? '' : '<p class="muted-note">Installing Kawach on your home screen lets the phone keep its data even when storage runs low.</p>'}
    </div>

    <h3>Google Drive backup</h3>
    <p class="group-subtitle">Encrypted backups in your own Google Drive, to get everything back on a new phone.</p>
    <div class="totals-card" id="drive-card">
      ${
        drive.setUp
          ? `<div class="totals-row"><span class="muted">Last Drive backup</span><span>${drive.lastAt ? timeAgo(drive.lastAt) : 'Not yet'}</span></div>
             <button type="button" id="drive-backup-btn" class="btn-primary">Back up to Drive now</button>`
          : `<label class="field">
               <span>Passphrase for Drive backups</span>
               <input type="password" id="drive-pass" placeholder="At least 8 characters" autocomplete="new-password">
             </label>
             <label class="field">
               <span>Type it again</span>
               <input type="password" id="drive-pass-again" autocomplete="new-password">
             </label>
             <p class="muted-note">Needed to restore on a new phone, and it can't be recovered: write it down. Kept on this phone so you aren't asked every time.</p>
             <button type="button" id="drive-connect-btn" class="btn-primary">Connect Google Drive and back up</button>`
      }
      <button type="button" id="drive-restore-btn" class="btn-secondary btn-block">Restore from Google Drive</button>
      ${driveList ? driveRestorePanel(driveList) : ''}
      ${drive.setUp ? '<button type="button" id="drive-stop-btn" class="link-btn">Stop Drive backups on this phone</button>' : ''}
      <p id="drive-status" class="status" hidden></p>
      <p class="muted-note">Kawach can only use its own hidden folder in your Drive, never your other files. Google shows its sign-in page for a moment when needed.</p>
    </div>

    <h3>Sync across your devices</h3>
    <p class="group-subtitle">Keeps phone and laptop in step through a secret GitHub Gist, encrypted on this phone first.</p>
    <div class="totals-card">
      ${
        sync.configured
          ? `<div class="attention-row">
              <span>Connected${sync.login ? ` as ${escapeHtml(sync.login)}` : ''}<br><span class="muted-note" id="sync-last">${
                sync.lastSync ? `Last synced ${timeAgo(sync.lastSync)}` : 'Not synced yet'
              }</span></span>
              <button type="button" class="btn-tiny primary" id="sync-now">Sync now</button>
            </div>
            <p id="sync-status" class="status" hidden></p>
            ${
              sync.gistId
                ? `<p class="muted-note">Gist <code>${escapeHtml(sync.gistId.slice(0, 8))}…</code> · unreadable without your passphrase</p>`
                : ''
            }
            <button type="button" class="btn-tiny danger" id="sync-disconnect">Disconnect sync</button>`
          : `<details class="setup-help"><summary>How to get a GitHub token</summary><ol class="setup-steps">
              <li>Open <strong>github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens</strong>.</li>
              <li>Click <strong>Generate new token</strong>. Give it any name and an expiry you're happy with.</li>
              <li>Under <strong>Account permissions</strong>, set <strong>Gists</strong> to <strong>Read and write</strong>. Nothing else is needed.</li>
              <li>Generate it, copy the token, and paste it below.</li>
            </ol></details>
            <label class="field">
              <span>GitHub token</span>
              <input type="password" id="sync-token" placeholder="github_pat_…" autocomplete="off">
            </label>
            <label class="field">
              <span>Passphrase to encrypt with</span>
              <input type="password" id="sync-pass" placeholder="Use the same one on every device" autocomplete="new-password">
            </label>
            <p class="muted-note">Same passphrase on every device. It can't be recovered.</p>
            <button type="button" class="btn-primary" id="sync-connect">Connect</button>
            <p id="sync-connect-status" class="status" hidden></p>`
      }
    </div>
    ${
      sync.configured && !syncPass
        ? `<div class="totals-card warn-card">
            <label class="field">
              <span>Passphrase needed on this device</span>
              <input type="password" id="sync-pass-again" placeholder="The passphrase you set up sync with" autocomplete="off">
            </label>
            <button type="button" class="btn-secondary btn-block" id="sync-pass-save">Save and sync</button>
          </div>`
        : ''
    }

    <h3>How months are counted</h3>
    <div class="totals-card">
      <div class="attention-row">
        <span>Count card spending by billing cycle<br><span class="muted-note">${
          cycleAware
            ? 'On - a card purchase after its statement day counts towards next month, matching when you actually get billed.'
            : 'Off - everything is counted by calendar date, even if the bill lands next month.'
        }</span></span>
        <button type="button" class="btn-tiny ${cycleAware ? '' : 'primary'}" id="cycle-toggle">${cycleAware ? 'Turn off' : 'Turn on'}</button>
      </div>
    </div>

    <h3>Bill reminders</h3>
    <p class="group-subtitle">A notification before a card bill or commitment is due.</p>
    <div class="totals-card">
      ${
        permission === 'unsupported'
          ? '<p class="muted-note">This browser doesn\'t support notifications.</p>'
          : permission === 'denied'
            ? '<p class="muted-note">Notifications are blocked for this app in your browser settings. You\'ll need to allow them there first.</p>'
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
        </label>
        <p class="muted-note">Works best with the app installed to your home screen.</p>`
      }
    </div>

    <h3>Backup file</h3>
    <p class="group-subtitle">An encrypted file you keep yourself - in Drive, email or anywhere.</p>
    <div class="totals-card">
      <label class="field">
        <span>Passphrase for this backup</span>
        <input type="password" id="backup-pass" placeholder="At least 8 characters" autocomplete="new-password">
      </label>
      <label class="field">
        <span>Type it again</span>
        <input type="password" id="backup-pass-again" autocomplete="new-password">
      </label>
      <p class="muted-note">Needed to restore, and it can't be recovered: write it down.${syncPass ? ' Your sync passphrase works too.' : ''}</p>
      <button type="button" id="backup-export-btn" class="btn-secondary btn-block">Save backup</button>
      <button type="button" id="backup-share-btn" class="btn-secondary btn-block" hidden>Choose where to save it</button>
      <button type="button" id="backup-download-btn" class="link-btn">Or download to this phone</button>
      <p id="backup-status" class="status" hidden></p>
    </div>

    <h3>Restore</h3>
    <p class="group-subtitle">Replaces everything in the app with a backup file.</p>
    <div class="totals-card">
      <label class="field">
        <span>Backup file</span>
        <input type="file" id="restore-file" accept=".json,.txt,application/json,text/plain">
      </label>
      <label class="field">
        <span>Passphrase</span>
        <input type="password" id="restore-pass" placeholder="The passphrase for that file" autocomplete="current-password">
      </label>
      <button type="button" id="restore-btn" class="btn-secondary btn-block">Restore from backup</button>
      <p id="restore-status" class="status" hidden></p>
    </div>

    <h3>Privacy</h3>
    <div class="totals-card">
      <ul class="setup-points">
        <li>${icon('lock')} Your data stays on this phone. Nothing is sent anywhere except your own encrypted sync file.</li>
        <li>${icon('file')} Statement PDFs are read on the phone and never saved.</li>
        <li>${icon('key')} Passphrases never leave the phone. Lose one and the file can't be opened - by anyone.</li>
        <li>${icon('ban')} No ads, no analytics, no bank logins.</li>
      </ul>
      <p class="muted-note">This app tracks and estimates. It isn't financial advice - check big decisions against your bank.</p>
    </div>

    <h3>Report a problem</h3>
    <p class="group-subtitle">Send this file with a screenshot. Names, UPI ids and card digits are replaced.</p>
    <div class="totals-card">
      <button type="button" id="diagnostic-btn" class="btn-secondary btn-block">Save diagnostic report</button>
      <p id="diagnostic-status" class="status" hidden></p>
    </div>

    <h3>Setup</h3>
    <button type="button" id="run-setup" class="btn-secondary btn-block">Run setup again</button>

    <h3>Categories</h3>
    <button type="button" id="go-categories" class="btn-secondary btn-block">Manage categories</button>

    <h3>Import history</h3>
    <p class="group-subtitle">Undo a wrong or repeated import.</p>
    <div id="import-history"></div>
  `;

  wireSync(container);

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

  const passEl = container.querySelector('#backup-pass');
  const againEl = container.querySelector('#backup-pass-again');
  const statusEl = container.querySelector('#backup-status');
  const shareBtn = container.querySelector('#backup-share-btn');
  // The encrypted file, once made, until it has been saved somewhere.
  let ready = null;

  // Every backup asks for its passphrase, typed twice. It used to take the
  // sync passphrase without a word, so you never knew which one a file
  // needed - and a file nobody can open is no backup.
  const makeFile = async () => {
    const passphrase = passEl.value;
    if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
    if (passphrase !== againEl.value) throw new Error("The two passphrases don't match.");
    showStatus(statusEl, 'Encrypting…', false);
    const { envelope, counts } = await exportEncrypted(passphrase);
    return { text: JSON.stringify(envelope), counts, date: isoLocal(new Date()) };
  };

  const saved = async (made, where) => {
    passEl.value = '';
    againEl.value = '';
    ready = null;
    await setSetting('lastBackupAt', Date.now());
    showToast(`Backed up ${made.counts.transactions} transactions${where}`);
    redraw(container, () => render(container));
  };

  // You choose where it goes. On a phone that is the share sheet - Drive,
  // Files, email to yourself; on a computer, a "Save as" box. Chrome only
  // shares a few kinds of file and a .json isn't one, so a shared backup is
  // a .txt: the same file, and Restore takes either.
  const saveWhereYouChoose = async (made) => {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: `kawach-backup-${made.date}.json`,
        types: [{ description: 'Kawach backup', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(made.text);
      await writable.close();
      return saved(made, '');
    }
    const file = new File([made.text], `kawach-backup-${made.date}.txt`, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Kawach backup' });
      return saved(made, '');
    }
    downloadFile(made);
    return saved(made, ' to Downloads');
  };

  const downloadFile = (made) => {
    const url = URL.createObjectURL(new Blob([made.text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kawach-backup-${made.date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const failed = (err) => {
    // Closing the share sheet or the Save box is a choice, not a failure.
    if (err && err.name === 'AbortError') return showStatus(statusEl, 'Not saved. Tap Save backup to try again.', false);
    // Making the file took long enough that the phone no longer counts the
    // tap as yours, and won't open the share sheet: one more tap will.
    if (err && err.name === 'NotAllowedError' && ready) {
      shareBtn.hidden = false;
      return showStatus(statusEl, 'Ready. Tap "Choose where to save it".', false);
    }
    showStatus(statusEl, err && err.message ? err.message : 'Backup failed.', true);
  };

  container.querySelector('#backup-export-btn').addEventListener('click', async () => {
    try {
      ready = ready || (await makeFile());
      await saveWhereYouChoose(ready);
    } catch (err) {
      failed(err);
    }
  });
  shareBtn.addEventListener('click', async () => {
    try {
      if (ready) await saveWhereYouChoose(ready);
    } catch (err) {
      failed(err);
    }
  });
  container.querySelector('#backup-download-btn').addEventListener('click', async () => {
    try {
      const made = ready || (await makeFile());
      downloadFile(made);
      await saved(made, ' to Downloads');
    } catch (err) {
      failed(err);
    }
  });
  // A different passphrase typed means a different file.
  [passEl, againEl].forEach((el) => el.addEventListener('input', () => {
    ready = null;
    shareBtn.hidden = true;
  }));

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

  const restoreStatus = container.querySelector('#restore-status');
  container.querySelector('#restore-btn').addEventListener('click', async () => {
    const file = container.querySelector('#restore-file').files[0];
    const passphrase = container.querySelector('#restore-pass').value;
    if (!file) return showStatus(restoreStatus, 'Choose a backup file first.', true);
    if (!passphrase) return showStatus(restoreStatus, 'Enter the passphrase for that file.', true);

    try {
      showStatus(restoreStatus, 'Decrypting…', false);
      const { data, createdAt, counts } = await decryptBackup(await file.text(), passphrase);
      const ok = await askConfirm({
        title: 'Replace everything with this backup?',
        message: `From ${formatDateNice(createdAt)}, ${counts.transactions} transactions. Everything in the app now is replaced. This cannot be undone.`,
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return showStatus(restoreStatus, 'Restore cancelled.', false);

      await restoreBackup(data);
      container.querySelector('#restore-pass').value = '';
      container.querySelector('#restore-file').value = '';
      showStatus(restoreStatus, `Restored ${counts.transactions} transactions. Reopen the app to see them.`, false);
    } catch (err) {
      showStatus(restoreStatus, err.message, true);
    }
  });

  wireDrive(container, params);

  container.querySelector('#run-setup').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'setup', restart: true } }));
  });

  container.querySelector('#go-categories').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'categories' } }));
  });

  await renderImportHistory(container);
}

function wireSync(container) {
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
      const statusEl = container.querySelector('#sync-status');
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

// The Drive backups to pick from, newest first, and the passphrase to open one.
function driveRestorePanel(list) {
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
      <label class="field">
        <span>Passphrase for Drive backups</span>
        <input type="password" id="drive-restore-pass" autocomplete="current-password">
      </label>
      <button type="button" id="drive-restore-go" class="btn-primary">Restore this backup</button>
    </div>`;
}

function wireDrive(container, params) {
  const statusEl = container.querySelector('#drive-status');
  const again = () => redraw(container, () => render(container));
  // Anything that needs Google first goes to its sign-in page and comes back
  // here with `purpose` to carry on (see oauth.html).
  const orSignIn = (err, purpose) => {
    if (err && err.needsSignIn) return signIn(purpose);
    showStatus(statusEl, err && err.message ? err.message : 'Something went wrong.', true);
  };

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

  const loadList = async () => {
    try {
      showStatus(statusEl, 'Looking in your Google Drive…', false);
      driveList = await listBackups();
      again();
    } catch (err) {
      orSignIn(err, 'restore');
    }
  };

  const connect = container.querySelector('#drive-connect-btn');
  if (connect) {
    connect.addEventListener('click', async () => {
      const pass = container.querySelector('#drive-pass').value;
      if (pass.length < 8) return showStatus(statusEl, 'Use a passphrase of at least 8 characters.', true);
      if (pass !== container.querySelector('#drive-pass-again').value) return showStatus(statusEl, "The two passphrases don't match.", true);
      await setDrivePassphrase(pass);
      if (hasDrivePass()) backUp();
      else signIn('backup');
    });
  }
  const backupBtn = container.querySelector('#drive-backup-btn');
  if (backupBtn) backupBtn.addEventListener('click', backUp);

  container.querySelector('#drive-restore-btn').addEventListener('click', () => {
    if (hasDrivePass()) loadList();
    else signIn('restore');
  });

  const stop = container.querySelector('#drive-stop-btn');
  if (stop) {
    stop.addEventListener('click', async () => {
      const ok = await askConfirm({
        title: 'Stop Drive backups on this phone?',
        message: 'Backups already in your Drive stay there for a restore. To remove them too: Google Drive, Settings, Manage apps, Kawach, Delete hidden app data.',
        confirmLabel: 'Stop',
      });
      if (!ok) return;
      await forgetDrive();
      again();
    });
  }

  const go = container.querySelector('#drive-restore-go');
  if (go) {
    go.addEventListener('click', async () => {
      const id = container.querySelector('input[name="drive-file"]:checked')?.value;
      const pass = container.querySelector('#drive-restore-pass').value;
      if (!pass) return showStatus(statusEl, 'Enter the passphrase for Drive backups.', true);
      try {
        showStatus(statusEl, 'Opening the backup…', false);
        const { data, createdAt, counts } = await openDriveBackup(id, pass);
        const ok = await askConfirm({
          title: 'Replace everything with this backup?',
          message: `From ${formatDateNice(createdAt)}, ${counts.transactions} transactions. Everything in the app now is replaced. This cannot be undone.`,
          confirmLabel: 'Restore',
          danger: true,
        });
        if (!ok) return showStatus(statusEl, 'Restore cancelled.', false);
        await restoreBackup(data);
        // The passphrase that opened it is the one for future backups too.
        await setDrivePassphrase(pass);
        driveList = null;
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
