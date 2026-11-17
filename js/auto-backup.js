import { exportEncrypted } from './backup.js';
import { backUpToDrive, backupPassphrase, hasGooglePass, readDriveMeta, writeDriveMeta, renewPassOnce } from './drive.js';
import { saveLocalCopy } from './local-copies.js';
import { setSetting } from './db.js';
import { isDemo } from './demo-flag.js';
import { isoLocal } from './frequency.js';

// A backup every day without being asked: one on this phone (js/local-copies.js) and, for anyone who has
// connected Google Drive, one in their Drive. Both are the same locked file the Back up button makes.
//
// "Every night" is really "the first time the app is opened each day": a web app that is closed cannot wake up
// at night to do anything, on any phone. The first open of the day is when it runs, a few seconds after the
// screen is up so opening is never slower. The Google pass lasts an hour, so Drive's turn may need a quick,
// silent trip to Google's page (renewPassOnce); the daily run carries on when it returns.

/* True when the last backup was before today began (local time), or there has never been one. */
export function dueToday(lastAt, now = new Date()) {
  if (!lastAt) return true;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return lastAt < startOfToday;
}

// On unless the person switched it off on this phone (never synced: each phone keeps its own).
export async function autoBackupOn() {
  return (await readDriveMeta('autoBackup')) !== 'off';
}
export const setAutoBackup = (on) => writeDriveMeta('autoBackup', on ? null : 'off');

let running = false;

/* Does today's backups that are due. Never throws and never shows anything: the answer says what happened,
 * for the tests and for Settings. 'signing-in' means the page is leaving for Google and the run resumes on return. */
export async function runAutoBackup({ now = new Date() } = {}) {
  if (running || isDemo()) return 'skipped';
  running = true;
  try {
    if (!(await autoBackupOn())) return 'off';
    const passphrase = await backupPassphrase();
    if (!passphrase) return 'no-passphrase';
    const [localAt, driveAt, email] = await Promise.all([readDriveMeta('localLastBackupAt'), readDriveMeta('driveLastBackupAt'), readDriveMeta('googleEmail')]);
    const localDue = dueToday(localAt, now);
    // Drive only for someone who has connected it once: nothing is ever uploaded to an account they never chose.
    const driveDue = Boolean(email) && dueToday(driveAt, now);
    if (!localDue && !driveDue) return 'up-to-date';
    // Only Drive is due and the pass has run out: go and renew it before spending time locking a file.
    if (!localDue && !hasGooglePass()) return renewPassOnce('auto-backup') ? 'signing-in' : 'needs-sign-in';

    const made = await exportEncrypted(passphrase);
    // A phone that has lost its data must never overwrite the good copies with an empty one.
    if (!made.counts.transactions) return 'empty';
    const done = [];
    if (localDue && (await saveLocalCopy({ day: isoLocal(now), text: JSON.stringify(made.envelope), transactions: made.counts.transactions }))) {
      await writeDriveMeta('localLastBackupAt', Date.now());
      done.push('phone');
    }
    if (driveDue) {
      if (hasGooglePass()) {
        try {
          await backUpToDrive(made);
          // Settings and Summary tell people how safe their data is from this date (dataSafety).
          await setSetting('lastBackupAt', Date.now());
          done.push('drive');
        } catch (err) {
          if (err && err.needsSignIn && renewPassOnce('auto-backup')) return 'signing-in';
        }
      } else if (renewPassOnce('auto-backup')) {
        return 'signing-in';
      }
    }
    return done.join('+') || 'nothing';
  } catch {
    return 'failed';
  } finally {
    running = false;
  }
}
