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
export const APP_VERSION = '4.14.4';

// A counter one higher with every release, never shown. The offline copy is
// named after it (CACHE_NAME in sw.js), so a newer download can be told from
// the one running. IMPORTANT: bump BUILD and CACHE_NAME together.
export const BUILD = 123;

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
  return versionStatus();
}

