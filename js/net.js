// Every call out to Google Drive or GitHub goes through here, so a slow or dropped connection can never leave the app
// "syncing" for ever, and a hiccup on the way does not turn into an error screen.
//   - a call that gets no answer in `timeout` ms is given up and counted as a failed try
//   - a try that fails by network, timeout, 429 or a 5xx is tried again (up to `tries` in all), waiting 0.7 s, 1.4 s ...
//     with a little jitter, or as long as the server's Retry-After says (at most 8 s)
//   - only calls that are safe to repeat are retried: GET, PUT, PATCH, DELETE. A POST that creates something is tried once, so
//     a repeat can never create a second copy.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const SAFE = new Set(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchRetry(url, options = {}, { tries = 3, timeout = 25000, base = 700 } = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const attempts = SAFE.has(method) ? tries : 1;
  let last;
  for (let i = 0; i < attempts; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    let delay = base * 2 ** i * (0.8 + Math.random() * 0.4);
    try {
      const res = await fetch(url, { ...options, signal: ctl.signal });
      clearTimeout(timer);
      if (!RETRY_STATUS.has(res.status) || i === attempts - 1) return res;
      const after = Number(res.headers?.get?.('Retry-After'));
      if (Number.isFinite(after) && after > 0) delay = Math.min(after * 1000, 8000);
      last = res;
    } catch (err) {
      clearTimeout(timer);
      if (i === attempts - 1) {
        throw ctl.signal.aborted ? Object.assign(new Error('The connection took too long. Nothing was lost - try again in a moment.'), { timedOut: true }) : err;
      }
    }
    await wait(delay);
  }
  return last;
}
