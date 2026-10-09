/* Teaching the alert reader a new wording (5.35). Banks word their messages differently, and
 * nobody can list them all in advance. When a message no built-in format reads is checked and
 * saved by the user, this turns that one example into a pattern with holes for the parts that
 * change - the amount, the date, who it was, the card digits - and keeps the words around them.
 * The next message with the same wording is then read exactly, with no setup and no bank list.
 *
 * Careful by design, because a loose pattern would misread real money:
 *  - only a message read as "partial" teaches, and only from what the user confirmed;
 *  - the pattern keeps a few words either side (never a name from a greeting or a footer's phone
 *    number) and must re-read the very message it came from, to the same amount, date and shop;
 *  - at least two real words stay fixed, so it cannot match everything;
 *  - it only reads; the user still sees and saves every alert.
 * The patterns live in a setting (so they follow the user across their devices, encrypted with
 * the rest) and can be forgotten one by one from the alert screen. */
import { findDigits, dateMatch, toPaise, useLearned } from './alerts.js';
import { getSetting, setSetting } from './db.js';

const KEY = 'learnedAlertFormats';
const MAX = 60;
const URL_MARK = '';
const NUM_MARK = '';

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

// The words around a hole, turned into a pattern: spaces may be any run of spaces, a web link is
// any link, and any number (a reference, a balance, a time) is any number.
function literal(text) {
  const marked = text.replace(/https?:\/\/\S+/g, URL_MARK).replace(/\d[\d,.]*/g, NUM_MARK);
  return escapeRe(marked)
    .replace(/\s+/g, '\\s+')
    .replace(new RegExp(URL_MARK, 'g'), '\\S+')
    .replace(new RegExp(NUM_MARK, 'g'), '[\\d,.]+');
}

// A date as the bank wrote it ("08/OCT/2026", "12 Sep 2026", "12Sep26"): numbers stay numbers, month
// names stay letters, and the dashes, slashes and spaces between them stay as they were.
const dateHole = (text) =>
  text
    .split(/(\d+|[A-Za-z]+)/)
    .map((part) => (/^\d+$/.test(part) ? '\\d+' : /^[A-Za-z]+$/.test(part) ? '[A-Za-z]+' : part ? escapeRe(part).replace(/\s+/g, '\\s+') : ''))
    .join('');

// A few words of what comes before the first hole or after the last one, cut on a word.
const tail = (text, n) => {
  if (text.length <= n) return text;
  const cut = text.slice(text.length - n);
  const at = cut.search(/\s/);
  return at < 0 ? '' : cut.slice(at);
};
const head = (text, n) => {
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  const at = cut.search(/\s\S*$/);
  return at < 0 ? '' : cut.slice(0, at);
};

function spanOf(raw, phrase) {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const m = raw.match(new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('\\s+'), 'i'));
  if (!m) return null;
  // Out to the whole word on each side: "SWIGGY" typed for "RSP*SWIGGY" still captures the word.
  let start = m.index;
  let end = m.index + m[0].length;
  while (start > 0 && /\S/.test(raw[start - 1])) start -= 1;
  while (end < raw.length && /\S/.test(raw[end])) end += 1;
  return { start, end };
}

// Pattern, and what to show for it, from one confirmed example. Null when it cannot be made safely.
export function teach(raw, parsed, confirmed) {
  if (!parsed || !parsed.ok || parsed.confidence !== 'partial' || !confirmed || !confirmed.direction) return null;
  const spans = [];

  const money = [...raw.matchAll(/(?:Rs\.?|INR|₹|Rupees|Amt\.?:?|Amount:?)\s*([\d,]+(?:\.\d{1,2})?)/gi)].find((m) => toPaise(m[1]) === confirmed.amount);
  if (!money) return null;
  const at = money.index + money[0].length - money[1].length;
  spans.push({ start: at, end: at + money[1].length, name: 'amount', hole: '([\\d,]+(?:\\.\\d{1,2})?)', show: '{amount}' });

  const when = dateMatch(raw);
  if (when && when.iso === confirmed.date) spans.push({ start: when.index, end: when.index + when.text.length, name: 'date', hole: `(${dateHole(when.text)})`, show: '{date}' });

  const who = String(confirmed.description || '').replace(/\s*\((?:refund|UPI)\)\s*$/i, '').trim();
  const shop = who && who !== 'Bank alert' ? spanOf(raw, who) : null;
  if (shop) {
    const multi = /\s/.test(raw.slice(shop.start, shop.end).trim());
    spans.push({ ...shop, name: 'party', hole: multi ? '([^\\n]+?)' : '(\\S+)', show: '{who}' });
  }

  const digits = findDigits(raw);
  if (digits && digits.last4) {
    const label = raw.match(new RegExp(String.raw`\b(?:credit\s+card|debit\s+card|card|cc|dc|a\/c|acct?|account|ac)\b[\s:.\-(#]*(?:(?:no|number|num)\.?[\s:.\-(#]*)?(?:ending(?:\s+(?:in|with))?[\s:.\-(#]*)?(?:\d{0,6}[xX*•]+|[xX*•]*)(\d{4})(?!\d)`, 'i'));
    if (label) {
      const end = label.index + label[0].length;
      spans.push({ start: end - 4, end, name: 'last4', hole: '(\\d{4})', show: '{card}' });
    }
  }

  spans.sort((a, b) => a.start - b.start);
  for (let i = 1; i < spans.length; i++) if (spans[i].start < spans[i - 1].end) return null;

  let source = '';
  let shape = '';
  const groups = [];
  let cursor = 0;
  spans.forEach((sp, i) => {
    let between = raw.slice(cursor, sp.start);
    if (i === 0) between = tail(between, 24);
    source += literal(between) + sp.hole;
    shape += between + sp.show;
    groups.push(sp.name);
    cursor = sp.end;
  });
  const after = head(raw.slice(cursor), 24);
  // A shop name at the very end has no words after it to stop on, so it runs to the end of the line.
  if (!after.trim() && spans.length && spans[spans.length - 1].name === 'party') source = source.replace(/\(\[\^\\n\]\+\?\)$/, '([^\\n.]+)');
  source += literal(after);
  shape += after;

  // At least two real words stay fixed, or the pattern would fit anything.
  const fixedWords = (shape.replace(/\{\w+\}/g, ' ').match(/[A-Za-z]{3,}/g) || []).length;
  if (fixedWords < 2 || source.length > 700) return null;

  // It must read the very message it came from, to the same figures.
  let m;
  try {
    m = raw.match(new RegExp(source, 'i'));
  } catch {
    return null;
  }
  if (!m) return null;
  const got = Object.fromEntries(groups.map((g, i) => [g, m[i + 1]]));
  if (toPaise(got.amount) !== confirmed.amount) return null;
  if (got.date && dateMatch(got.date)?.iso !== confirmed.date) return null;

  return {
    id: hash(source),
    re: source,
    groups,
    direction: confirmed.direction,
    instrument: parsed.instrument || null,
    kind: parsed.kind === 'card-refund' ? 'card-refund' : 'unknown',
    billPayment: Boolean(parsed.billPayment),
    shape: shape.replace(/\s+/g, ' ').trim(),
    learnedAt: Date.now(),
  };
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `w${(h >>> 0).toString(36)}`;
}

export async function loadLearned() {
  const list = await getSetting(KEY, []);
  useLearned(list);
  return Array.isArray(list) ? list : [];
}

// Remembers what a checked message taught. Returns the pattern, or null when there was nothing to learn.
export async function learnFrom(raw, parsed, confirmed) {
  const format = teach(raw, parsed, confirmed);
  if (!format) return null;
  const list = (await loadLearned()).filter((f) => f.id !== format.id);
  list.unshift(format);
  await setSetting(KEY, list.slice(0, MAX));
  useLearned(list);
  return format;
}

export async function forgetLearned(id) {
  const list = (await loadLearned()).filter((f) => f.id !== id);
  await setSetting(KEY, list);
  useLearned(list);
}
