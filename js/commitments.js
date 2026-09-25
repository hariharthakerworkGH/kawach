import { nextOccurrence, isoLocal, frequencyOf, toMonthly } from './frequency.js';

// Fixed commitments: rent, EMIs, money sent home, cash you take out - anything
// owed every period however careful you are. They live in the `recurring`
// store with source 'fixed', next to the bills the app detects on its own.
//
// Extra fields a commitment can carry:
//   accountId   what pays it; null means the bank
//   spread      true when it goes out bit by bit through the month (ATM cash)
//                rather than as one payment on a set day
//   matchText   words its bank entry contains ("Home Loan EMI"), so the app
//                can see it has already gone out
//   endDate     the last payment (YYYY-MM-DD); after it the commitment is over
//   emi         { current, total, asOf } when read from a card statement

export const isFixed = (r) => r.source === 'fixed';

/* Money set aside, as opposed to money that must be paid.
 *
 * Two different things were being asked on Plan as two separate questions -
 * "I can change this one" and "goes out bit by bit" - and it was the second
 * that actually decided the behaviour. Someone entering an Amazon Pay
 * allowance naturally gave it a day of the month, so Kawach filed it as a
 * dated bill and then reported it overdue when the day passed. It was never
 * a bill: it is money kept back, and it may be spent in full, in part, or
 * not at all.
 *
 * `spread` stays the field that carries it, so every record already in
 * someone's phone keeps behaving exactly as it does today, and Plan now asks
 * the question once.
 */
export const isSetAside = (r) => Boolean(r && r.spread);

export function isFinished(r, today = isoLocal(new Date())) {
  return Boolean(r.endDate) && r.endDate < today;
}

// The order you arranged commitments in on Plan; ones never moved keep their
// place after the rest.
export function byYourOrder(a, b) {
  const rank = (r) => (Number.isFinite(r.sortOrder) ? r.sortOrder : Number.MAX_SAFE_INTEGER);
  return rank(a) - rank(b);
}

// Counted in budgets and free-to-spend: fixed, not switched off, not over.
export function isLiveCommitment(r, today = isoLocal(new Date())) {
  return isFixed(r) && r.active !== false && !isFinished(r, today);
}

// Cash withdrawals are recognisable without being told: HDFC writes them as
// "NWD-<card>-<ATM id>", other banks as "ATM" or "CASH WDL".
const CASH_LABEL_RE = /\b(atm|cash)\b/i;
export const CASH_ENTRY_RE =/\bNWD-|\bATM\b|\bCASH\s*(WDL|WITHDRAWAL)|\bATW-/i;

// Letters and digits only, lower case. Statements break a narration across
// lines and pad it oddly ("NWD-400000XXXXXX1234-12041HHR-MU MBAI", "SBI
// SAVINGS AC-SBIN -XXXX"), so words are compared without spaces or
// punctuation getting in the way.
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The words you gave a commitment, several allowed: "NWD, ATW".
export function matchWords(item) {
  return String(item.matchText || '')
    .split(/[,;|]/)
    .map(squash)
    .filter((w) => w.length >= 3);
}

// Words every UPI/NEFT line carries, which say nothing about who was paid.
const NOISE_WORDS = new Set(
  'upi neft imps rtgs nwd atw pos ach nach ecs ref refno value txn transfer trf payment paid pay sent received from the and for bill dt date '
    .concat('ybl ibl axl okaxis oksbi okicici okhdfcbank paytm apl bank hdfc icici sbi axis kotak yesb utib hdfcbank')
    .split(/\s+/)
);

// The distinctive words of one phrase: no reference numbers or dates (they
// change every month), no IFSC codes, no generic banking words.
function phraseTokens(phrase) {
  return String(phrase || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/\d{4,}/.test(w) && !/^[a-z]{4}0[a-z0-9]{6}$/.test(w) && !NOISE_WORDS.has(w));
}

// A whole line copied from a statement ("UPI-somename-name@okicici-
// UTIB0000001-600000000001-Tiffin Bill Value Dt 03/08/2026 Ref ...") carries
// that month's reference and date, so it would never match next month's
// entry. The phrase counts when it's found as typed, or when every one of its
// distinctive words is in the entry.
function phraseMatchers(item) {
  return String(item.matchText || '')
    .split(/[,;|]/)
    .map((phrase) => ({ whole: squash(phrase), tokens: phraseTokens(phrase) }))
    .filter((p) => p.whole.length >= 3)
    .map((p) => (text) => text.includes(p.whole) || (p.tokens.length > 0 && p.tokens.every((w) => text.includes(w))));
}

function entryMatcher(item) {
  const phrases = phraseMatchers(item);
  const cash = CASH_LABEL_RE.test(item.label || '');
  if (!phrases.length && !cash) return null;
  return (t) => {
    const text = squash(t.rawDescription);
    if (phrases.some((matches) => matches(text))) return true;
    // A cash commitment always recognises the bank's own ATM wording, even
    // when you've added words of your own.
    return cash && CASH_ENTRY_RE.test(t.rawDescription || '');
  };
}

// A detected bill is already covered only when a commitment is that very
// bill: made from it, the same name, its bank wording in the bill's
// description, the same EMI, or the same card or account charging about the
// same amount around the same day. Sharing a category is not enough - four
// different "Bills & Utilities" items used to vanish when one was added.
export function coveredByFixed(detected, fixed) {
  const label = (detected.label || '').toLowerCase();
  // Detected labels are cut at 48 characters, which can clip an EMI's
  // merchant ("<5/12>WWW DYSON" for "WWW DYSON IN").
  const marker = emiMarker(detected.label || '');
  // The bank's own entry wording, when the suggestion carries one.
  const entry = { rawDescription: detected.sampleDescription || detected.label || '' };
  return fixed.some((f) => {
    const match = matchWords(f)[0] ? (f.matchText || '').split(/[,;|]/)[0].trim().toLowerCase() : '';
    const dayGap = Math.abs((f.dayOfMonth || 0) - (detected.dayOfMonth || 0));
    // Only a card's own charges are compared by amount and day: bank
    // commitments have no account, and several bank payments of similar size
    // around salary day (rent, money home) aren't one another.
    const samePayer = Boolean(f.accountId) && f.accountId === detected.accountId;
    const matcher = matchWords(f).length ? entryMatcher(f) : null;
    return (
      (f.label || '').toLowerCase() === label ||
      f.fromRecurringId === detected.id ||
      (match && label.includes(match)) ||
      Boolean(matcher && matcher(entry)) ||
      // Monthly ATM cash is covered by any cash commitment of yours.
      Boolean(detected.cash && f.accountId !== 'cash' && CASH_LABEL_RE.test(f.label || '')) ||
      Boolean(marker && f.emi && match && match.startsWith(marker.merchant.toLowerCase())) ||
      (samePayer && Math.abs(f.amount - detected.amount) <= detected.amount * 0.05 && Math.min(dayGap, 31 - dayGap) <= 3)
    );
  });
}

// A fixed commitment made from something the app spotted: its wording is
// filled in so its payments are recognised from the first month, and money
// from the bank is saved the way Plan saves it (no account).
export function commitmentFromSuggestion(d, id) {
  return {
    id,
    label: d.label,
    amount: d.amount,
    frequency: 'monthly',
    dayOfMonth: d.dayOfMonth,
    categoryId: d.categoryId || null,
    accountId: d.paidFromBank ? null : d.accountId,
    active: true,
    source: 'fixed',
    fromRecurringId: d.id,
    matchText: d.suggestMatch || '',
    ...(d.spread ? { spread: true } : {}),
  };
}

// Whether a transaction is a payment towards a commitment: its bank wording
// or ATM cash, otherwise about its amount for a dated one, otherwise (spread
// through the month) its category.
export function commitmentMatcher(item) {
  const words = entryMatcher(item);
  if (words) return words;
  if (!item.spread) return (t) => Math.abs(t.amount - item.amount) <= item.amount * 0.02;
  if (item.categoryId) return (t) => t.categoryId === item.categoryId;
  return null;
}

function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoLocal(new Date(y, m - 1, d + delta));
}

function addMonthsClamped(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return isoLocal(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// A payment can go out a little early or a little late. One made up to
// EARLY_DAYS before its due date counts for that date; a due date passed less
// than LATE_DAYS ago with nothing gone out yet is still owed.
const EARLY_DAYS = 10;
const LATE_DAYS = 5;

// How much of a bank-paid commitment is still to go out between today and
// windowEnd (both YYYY-MM-DD). `bankEntries` are debits on bank accounts;
// only ones already in the bank balance should be passed, since those are
// the payments the balance has already paid for.
// With `wholeMonths`, a spread commitment counts in full for every month the
// window reaches into: the window ends the day before a payday at the end of
// a month, and that month's cash still comes out of the salary before it.
export function commitmentDueInWindow(item, { today, windowEnd, bankEntries, wholeMonths = false }) {
  const freq = frequencyOf(item);
  const last = item.endDate && item.endDate < windowEnd ? item.endDate : windowEnd;
  const matcher = entryMatcher(item);

  if (freq === 'monthly' && item.spread) {
    // Month by month. For this month, take off what has already gone out;
    // months after it are counted for the days of them inside the window.
    let amount = 0;
    const parts = [];
    let cursor = today;
    while (cursor <= last) {
      const [y, m] = cursor.split('-').map(Number);
      const monthStart = isoLocal(new Date(y, m - 1, 1));
      const monthEnd = isoLocal(new Date(y, m, 0));
      const daysInMonth = new Date(y, m, 0).getDate();
      const to = monthEnd < last ? monthEnd : last;
      const days = Math.round((dateOf(to) - dateOf(cursor)) / 86400000) + 1;
      let part;
      if (cursor === today && matcher) {
        const spent = bankEntries.filter((t) => t.date >= monthStart && t.date <= today && matcher(t)).reduce((s, t) => s + t.amount, 0);
        part = Math.max(0, item.amount - spent);
        parts.push(spent > 0 ? `${formatShort(part)} left this month` : `${formatShort(part)} this month`);
      } else if (cursor === today) {
        // This month is under way and there's no way to see what has already
        // gone on it: count the share for the days still left.
        part = Math.round(item.amount * (days / daysInMonth));
        parts.push(`${formatShort(part)} for the rest of this month`);
      } else {
        part = wholeMonths ? item.amount : Math.round(item.amount * (days / daysInMonth));
        parts.push(`${formatShort(part)} in ${new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' })}`);
      }
      amount += part;
      cursor = isoLocal(new Date(y, m, 1));
    }
    return { amount, detail: parts.join(', ') };
  }

  if (freq === 'monthly') {
    let amount = 0;
    const dues = [];
    let due = nextOccurrence(item.dayOfMonth, dateOf(addDays(today, -LATE_DAYS)));
    while (due && due <= last) {
      const paid = paidTowards(item, matcher, due, bankEntries, today);
      const stillOwed = paid >= item.amount * 0.9 ? 0 : Math.max(0, item.amount - paid);
      // A date already past only counts while it's inside the grace period.
      if (stillOwed > 0 && (due >= today || due >= addDays(today, -LATE_DAYS))) {
        amount += stillOwed;
        dues.push(due < today ? `${shortDate(due)} (not seen yet)` : shortDate(due));
      }
      due = nextOccurrence(item.dayOfMonth, dateOf(addDays(due, 1)));
    }
    return { amount, detail: dues.length ? `due ${dues.join(', ')}` : '' };
  }

  const span = Math.max(1, Math.round((dateOf(last) - dateOf(today)) / 86400000) + 1);
  if (last < today) return { amount: 0, detail: '' };
  if (freq === 'daily') return { amount: item.amount * span, detail: `${span} days` };
  if (freq === 'weekly') return { amount: Math.round(item.amount * (span / 7)), detail: `about ${Math.round(span / 7)} weeks` };
  if (freq === 'fortnightly') return { amount: Math.round(item.amount * (span / 14)), detail: `about ${Math.round(span / 14)} fortnights` };
  // Quarterly, half-yearly, yearly: the month it falls in isn't known, so a
  // slice is set aside for every day in the window.
  return { amount: Math.round(toMonthly(item.amount, freq) * (span / (365 / 12))), detail: 'set aside, spread over the year' };
}

// What has gone out towards one due date: payments naming the commitment, or
// of about its amount, from EARLY_DAYS before it to LATE_DAYS after, up to today.
function paidTowards(item, matcher, due, entries, today) {
  return entries
    .filter((t) => t.date >= addDays(due, -EARLY_DAYS) && t.date <= addDays(due, LATE_DAYS) && t.date <= today)
    .filter((t) => (matcher ? matcher(t) : Math.abs(t.amount - item.amount) <= item.amount * 0.02))
    .reduce((s, t) => s + t.amount, 0);
}

// True when a due date has in effect already been paid.
export function paidAround(item, due, entries, today) {
  return paidTowards(item, entryMatcher(item), due, entries, today) >= item.amount * 0.9;
}

function dateOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatShort(minor) {
  return `₹${Math.round(minor / 100).toLocaleString('en-IN')}`;
}

// --- EMIs printed on card statements -----------------------------------------
//
// ICICI prints each month's instalment as two rows, e.g.
//   "Principal Amount Amortization - <5/12>WWW DYSON IN"
//   "Interest Amount Amortization - <5/12>WWW DYSON IN"
// Other banks write "EMI 5/12" or "EMI 5 of 12". The instalment number, the
// total and the row's date are enough to know when the EMI ends.
const BRACKET_RE = /<\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*>\s*(.*)$/;
const EMI_WORD_RE = /\bEMI\b\D{0,20}?(\d{1,3})\s*(?:\/|of)\s*(\d{1,3})(?![\d/])\s*(.*)$/i;

function emiMarker(description) {
  const m = BRACKET_RE.exec(description) || EMI_WORD_RE.exec(description);
  if (!m) return null;
  const current = Number(m[1]);
  const total = Number(m[2]);
  if (!(current >= 1 && total >= 2 && current <= total && total <= 120)) return null;
  const merchant = m[3].replace(/\s+/g, ' ').trim() || description.slice(0, m.index).replace(/\s+/g, ' ').trim();
  return { current, total, merchant };
}

// rows: [{ date, description, amount, direction }]. Returns one entry per EMI,
// with principal and interest for the same instalment added together.
export function detectEmis(rows) {
  const found = new Map();
  for (const row of rows) {
    if (row.direction !== 'debit') continue;
    const marker = emiMarker(row.description || '');
    if (!marker || !marker.merchant) continue;
    const key = `${marker.merchant.toLowerCase()}|${marker.total}`;
    const prev = found.get(key);
    if (prev && prev.current > marker.current) continue;
    if (prev && prev.current === marker.current) {
      prev.amount += row.amount;
      if (row.date > prev.date) prev.date = row.date;
      continue;
    }
    found.set(key, { key, merchant: marker.merchant, current: marker.current, total: marker.total, amount: row.amount, date: row.date });
  }
  // A statement can wrap the merchant onto the next line for one of the two
  // rows ("<4/12>WWW" beside "<4/12>WWW DYSON IN"). A cut-off name that starts
  // the full one, with the same instalment and date, is the same EMI.
  const entries = [...found.values()].sort((a, b) => b.merchant.length - a.merchant.length);
  const merged = [];
  for (const e of entries) {
    const whole = merged.find(
      (m) => m.total === e.total && m.current === e.current && m.date === e.date && m.merchant.toLowerCase().startsWith(e.merchant.toLowerCase())
    );
    if (whole) whole.amount += e.amount;
    else merged.push({ ...e });
  }
  return merged.map((e) => ({
    ...e,
    left: e.total - e.current,
    endDate: addMonthsClamped(e.date, e.total - e.current),
  }));
}

export function emiCommitmentId(accountId, emi) {
  return `emi-${accountId}-${emi.merchant}-${emi.total}`.replace(/[^a-z0-9_:-]/gi, '_').toLowerCase();
}

// The commitment for an EMI found on a statement. A commitment that already
// exists keeps whatever you changed by hand (its name, category, amount);
// only the instalment count and end date move forward.
export function emiCommitment(accountId, emi, existing) {
  if (existing && existing.emi && existing.emi.current > emi.current) return existing;
  return {
    ...(existing || {}),
    id: existing ? existing.id : emiCommitmentId(accountId, emi),
    label: existing ? existing.label : `EMI · ${prettyMerchant(emi.merchant)}`,
    amount: existing && existing.amountEdited ? existing.amount : emi.amount,
    frequency: 'monthly',
    dayOfMonth: existing && existing.dayEdited ? existing.dayOfMonth : Number(emi.date.slice(8, 10)),
    categoryId: existing ? existing.categoryId : null,
    accountId,
    active: existing ? existing.active : true,
    source: 'fixed',
    matchText: existing ? existing.matchText : emi.merchant,
    endDate: emi.endDate,
    emi: { current: emi.current, total: emi.total, asOf: emi.date },
  };
}

function prettyMerchant(merchant) {
  return merchant
    .replace(/^WWW\s+/i, '')
    .replace(/\s+IN$/i, '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
