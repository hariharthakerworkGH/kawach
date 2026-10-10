/* Demo mode's one switch (5.40). Kept tiny and free of imports, so any module can ask "is this the demo?"
 * without pulling the demo itself in.
 *
 * The demo is a separate session of the same app: its own database (kawach-demo), its own appearance and
 * space choices, and none of the things that reach outside (sync, backups, reminders, the lock). The flag
 * lives in sessionStorage, so closing the app ends it and the next opening is your own Kawach, locked as
 * usual. index.html reads the same flag before any module loads, to point the database at the demo's. */

export const DEMO_DB = 'kawach-demo';
export const DEMO_FLAG = 'kawach-demo';

export function isDemo() {
  try {
    return sessionStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}
