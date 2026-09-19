// A tiny test runner for the browser - no build step, no Node needed.
// Open tests/index.html from the dev server; results show on the page and
// in window.testResults.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export class AssertionError extends Error {}

export function equal(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${message ? message + ': ' : ''}expected ${e}, got ${a}`);
}

export function ok(value, message = 'expected a true value') {
  if (!value) throw new AssertionError(message);
}

// Money in paise: equal within a paisa of rounding.
export function paise(actual, expected, message = '') {
  if (actual == null || Math.abs(actual - expected) > 1) {
    throw new AssertionError(`${message ? message + ': ' : ''}expected ₹${(expected / 100).toFixed(2)}, got ${actual == null ? actual : '₹' + (actual / 100).toFixed(2)}`);
  }
}

export async function run(onResult) {
  const results = [];
  for (const t of tests) {
    const started = performance.now();
    try {
      await t.fn();
      results.push({ name: t.name, ok: true, ms: Math.round(performance.now() - started) });
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err instanceof AssertionError ? err.message : `${err.name}: ${err.message}` });
    }
    onResult(results[results.length - 1]);
  }
  return results;
}
