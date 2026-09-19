import { getAll, put } from './db.js';
import { significantTokens } from './merchant-rules.js';
import { nextOccurrence } from './frequency.js';
import { CASH_ENTRY_RE } from './commitments.js';
import { looksLikeCardPayment } from './transfers.js';
import { findDuplicates } from './duplicates.js';

const MIN_OCCURRENCES = 2;
const MIN_INTERVAL_DAYS = 25;
const MAX_INTERVAL_DAYS = 36;
const AMOUNT_TOLERANCE = 0.15; // same "merchant" charging within 15% counts as the same bill

// Scans debit history for the same merchant recurring roughly monthly at a
// roughly stable amount. Detected bills are upserted into the `recurring`
// store so a dismissal ("not recurring") persists across re-runs - this
// function is safe to call every time the dashboard loads.
export async function detectRecurring(now = new Date()) {
  const [transactions, existingRecurring, accounts] = await Promise.all([getAll('transactions'), getAll('recurring'), getAll('accounts')]);
  const bankIds = new Set(accounts.filter((a) => a.type === 'bank').map((a) => a.id));
  // Money sent to people (rent, home) is often marked as moved rather than
  // spent, but it's still a monthly commitment. Card bills aren't: the card's
  // own spending is what they pay for.
  const debits = findDuplicatesFree(transactions).filter(
    (t) => t.direction === 'debit' && (!t.isTransfer || (bankIds.has(t.accountId) && !looksLikeCardPayment(t, 'bank')))
  );

  const detected = [];
  const save = async (existing, record) => {
    // Saved only when something changed. This runs on every Summary and Plan
    // render, and each save used to count as an edit - uploading to your sync
    // gist on nearly every screen you opened.
    const unchanged = existing && Object.keys(record).every((k) => (existing[k] ?? null) === (record[k] ?? null));
    if (!unchanged) await put('recurring', { ...(existing || {}), ...record });
    detected.push(unchanged ? existing : { ...(existing || {}), ...record });
  };

  // ATM cash: never the same amount twice, so it's judged by the month. Taken
  // out in at least two of the last three whole months -> a spread commitment
  // of about the usual monthly total.
  const monthNow = isoMonth(now);
  const cashByAccount = new Map();
  for (const t of debits) {
    if (!bankIds.has(t.accountId) || !CASH_ENTRY_RE.test(t.rawDescription || '')) continue;
    const month = t.date.slice(0, 7);
    if (month >= monthNow) continue;
    if (!cashByAccount.has(t.accountId)) cashByAccount.set(t.accountId, new Map());
    const months = cashByAccount.get(t.accountId);
    months.set(month, (months.get(month) || 0) + t.amount);
  }
  for (const [accountId, months] of cashByAccount) {
    const recent = [...months.keys()].sort().slice(-3).filter((m) => m >= isoMonth(new Date(now.getFullYear(), now.getMonth() - 3, 1)));
    if (recent.length < 2) continue;
    const average = recent.reduce((s, m) => s + months.get(m), 0) / recent.length;
    const id = recurringIdFor(`${accountId}::atm-cash`);
    const existing = existingRecurring.find((r) => r.id === id);
    if (existing && existing.active === false) continue;
    await save(existing, {
      id,
      label: existing?.label || 'ATM cash',
      amount: Math.max(50000, Math.round(average / 50000) * 50000), // nearest ₹500
      dayOfMonth: 1,
      categoryId: existing?.categoryId || null,
      accountId,
      active: true,
      spread: true,
      cash: true,
      paidFromBank: true,
      suggestMatch: '',
    });
  }

  const groups = new Map();
  for (const t of debits) {
    if (CASH_ENTRY_RE.test(t.rawDescription || '')) continue;
    const key = merchantKeyFor(t.rawDescription);
    if (!key) continue;
    const groupKey = `${t.accountId}::${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(t);
  }

  for (const [groupKey, txns] of groups) {
    if (txns.length < MIN_OCCURRENCES) continue;
    txns.sort((a, b) => (a.date < b.date ? -1 : 1));

    const hasMonthlyGap = txns.slice(1).some((t, i) => {
      const days = daysBetween(txns[i].date, t.date);
      return days >= MIN_INTERVAL_DAYS && days <= MAX_INTERVAL_DAYS;
    });
    if (!hasMonthlyGap) continue;

    const amounts = txns.map((t) => t.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const stable = amounts.every((a) => Math.abs(a - avg) / avg <= AMOUNT_TOLERANCE);
    if (!stable) continue;

    const last = txns[txns.length - 1];
    const id = recurringIdFor(groupKey);
    const existing = existingRecurring.find((r) => r.id === id);
    if (existing && existing.active === false) continue; // user dismissed this one

    await save(existing, {
      id,
      label: existing?.label || last.rawDescription.slice(0, 48),
      amount: last.amount,
      dayOfMonth: Number(last.date.slice(8, 10)),
      categoryId: last.categoryId || existing?.categoryId || null,
      accountId: last.accountId,
      active: true,
      paidFromBank: bankIds.has(last.accountId),
      // The words every one of these entries shares - who was paid, without
      // that month's reference number - so the commitment recognises its
      // payments as soon as it's added.
      suggestMatch: groupKey.split('::')[1],
      sampleDescription: last.rawDescription,
    });
  }

  return detected;
}

// One of each transaction: a statement imported twice in two formats would
// otherwise look like a payment made twice a month.
function findDuplicatesFree(transactions) {
  const extra = new Set(findDuplicates(transactions).map((t) => t.id));
  return transactions.filter((t) => !extra.has(t.id));
}

function isoMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Delegates to the shared helper: the version that lived here let a day the
// month doesn't have roll into the next month, and treated something due
// today as already past because it compared against the current time.
export function nextDueDate(dayOfMonth, today = new Date()) {
  return nextOccurrence(dayOfMonth, today);
}

// Reference numbers change with every payment ("IMPS-600000000002-LANDLORD"),
// so they'd put each month's rent in a group of its own.
function merchantKeyFor(desc) {
  return significantTokens(desc)
    .filter((w) => !/\d{5,}/.test(w))
    .slice(0, 3)
    .join(' ');
}

function recurringIdFor(groupKey) {
  return `rec-${groupKey}`.replace(/[^a-z0-9_:-]/gi, '_');
}

function daysBetween(a, b) {
  return Math.abs((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}
