// The app's version, and a way to notice when you're looking at an old one.
//
// Because the service worker serves from cache first, the load straight after
// a deploy shows you the PREVIOUS version - the new files are fetched in the
// background and only take effect on the next open. That has caused real
// confusion: a feature that was removed still appears, and it looks like the
// change never happened. So the app now compares the version it is actually
// running against the newest version sitting in the cache, and says so.
//
// The version people see, written the way apps are: 3.0, then 3.1 for
// features, then 3.1.1 for a fix. No leading zeros, no third number until
// there is a fix to number. Major (4.0) is the app rebuilt.
export const APP_VERSION = '8.0.1';

// A counter one higher with every release, never shown. The offline copy is
// named after it (CACHE_NAME in sw.js), so a newer download can be told from
// the one running. IMPORTANT: bump BUILD and CACHE_NAME together.
export const BUILD = 346;

// What's running versus what's downloaded and waiting.
//
// `store` is the Cache Storage to look in; the tests hand it a made-up one.
export async function versionStatus(store = typeof caches === 'undefined' ? null : caches) {
  let cached = null;
  try {
    const keys = await store.keys();
    const versions = keys
      .map((k) => ({ key: k, build: Number((k.match(/v(\d+)$/) || [])[1]) }))
      .filter((v) => Number.isFinite(v.build))
      .sort((a, b) => b.build - a.build);
    // A cache is NAMED the moment the download starts and filled only when
    // every file has arrived - cache.addAll() stores all of them or none. So
    // an empty one is a download that failed, or one still running, and the
    // worker it belongs to has not taken over. Reading the name alone made
    // the app announce a new version that could never load, with a Reload
    // button that did nothing because the old worker was still answering.
    for (const v of versions) {
      const cache = await store.open(v.key);
      if ((await cache.keys()).length) {
        cached = v.build;
        break;
      }
    }
  } catch {
    // Cache Storage can be unavailable (private windows, blocked site data).
    // Not knowing is fine - it just means no staleness claim either way.
  }
  return {
    running: APP_VERSION,
    cached,
    stale: cached != null && cached > BUILD,
  };
}

// The same look without waiting for the answer: a pull to refresh and coming back to the app use it, so a phone
// still showing the old version picks up the new one (app.js reloads itself when the new worker takes over).
export function pokeUpdate() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {});
}

// The newest build the server holds, asked for plainly. Every release writes latest.json, and the service worker never answers for it.
// The cache names above cannot say this: a phone whose browser has not noticed the new worker has nothing waiting to read.
// null when offline or unreadable, which is never taken to mean "behind".
export async function newestBuild() {
  try {
    const r = await fetch(`latest.json?t=${Date.now()}`, { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    return j && Number.isFinite(j.build) ? j.build : null;
  } catch {
    return null;
  }
}

// Throw away what this device holds of the app (the worker and its offline copy, nothing of the person's data) and load it again from
// the server. The way out when a new version is out but the browser's own hand-over has not happened.
export async function startFresh() {
  try {
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    // share-inbox holds bank alerts shared in and not yet read; it is not the app.
    for (const key of await caches.keys()) if (key !== 'share-inbox') await caches.delete(key);
  } catch {
    // Nothing to clear (no worker support): the reload below still fetches from the server.
  }
  location.reload();
}

// What the self-update did and why it waited, last 40 lines, kept on the device so a phone that did not update can say why (it goes into
// the diagnostic report). Writes only when the line differs from the last one, so a screen that keeps waiting does not fill it.
const UPDATE_LOG = 'kawach-update-log';
export function updateLog() {
  try {
    const log = JSON.parse(localStorage.getItem(UPDATE_LOG) || '[]');
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}
export function noteUpdate(what) {
  try {
    const log = updateLog();
    if (log.length && log[log.length - 1][2] === what && log[log.length - 1][1] === BUILD) return;
    log.push([new Date().toISOString(), BUILD, what]);
    localStorage.setItem(UPDATE_LOG, JSON.stringify(log.slice(-40)));
  } catch {
    // No storage: the update still works, it just leaves no trace.
  }
}

// Ask the browser to look for a new service worker right now, rather than
// waiting for it to check on its own schedule.
export async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) return { running: APP_VERSION, cached: null, stale: false };
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (reg) {
    try {
      await reg.update();
    } catch {
      // Offline, or the server is unreachable. The cached version is still
      // perfectly usable, so there is nothing to report.
    }
    // The new worker installs and caches its files asynchronously; give it a
    // moment before reading the cache list back.
    await new Promise((r) => setTimeout(r, 1500));
  }
  const status = await versionStatus();
  // A newer version is out but the browser has not fetched it: still "new version ready", and Reload then starts fresh.
  const newest = await newestBuild();
  if (!status.stale && newest != null && newest > BUILD) return { ...status, stale: true, behind: true };
  return status;
}

