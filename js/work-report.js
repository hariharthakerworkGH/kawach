// Work costs for one stretch of dates (a trip, a month), by kind, so what was spent on food, travel and a hotel can be
// checked against the bills handed in to the company.
//
// What counts is what is already marked "Work cost" (isReimbursable, js/reimbursable.js): a payment out the employer
// will pay back. Nothing here changes what is owed back or Left to spend. The one thing it adds is a tick per payment,
// `claimSubmitted`, for "I have handed this bill in" - the app cannot know that from a bank statement.
//
// Kinds are the payment's own category. A payment with no real category (none, or "Other") is sorted by its words
// (a hotel's name, a taxi app, a food app) so a trip still reads as Hotel and Travel and Food; that is a guess for
// this page only, the payment's category is never changed, and the guess is marked as one.

const LODGING = /\b(hotel|resort|lodge|lodging|inn|oyo|airbnb|hostel|guest ?house|homestay|treebo|fabhotels|marriott|hyatt|radisson|lemon ?tree|taj)\b/i;
const TRANSPORT = /\b(uber|ola|rapido|taxi|cab|irctc|railway|train|flight|indigo|vistara|air ?india|spicejet|akasa|metro|bus|redbus|fuel|petrol|diesel|toll|fastag|parking)\b/i;
const FOOD = /\b(swiggy|zomato|restaurant|cafe|dhaba|meal|lunch|dinner|breakfast|canteen|dominos|kfc|mcdonalds?|starbucks)\b/i;

export const LODGING_NAME = 'Hotel & stay';

// The kind a payment with no real category most likely is, or null.
export function guessKind(text) {
  const s = String(text || '');
  if (LODGING.test(s)) return LODGING_NAME;
  if (TRANSPORT.test(s)) return 'Transport';
  if (FOOD.test(s)) return 'Food & Dining';
  return null;
}

// A bank narration cut to something readable: no reference numbers, the first few words.
export function shortLabel(t) {
  const words = String(t.merchant || t.rawDescription || '')
    .replace(/\d{5,}/g, ' ')
    .split(/[^A-Za-z0-9&.]+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !(w.length >= 8 && /\d/.test(w) && /[A-Za-z]/.test(w)));
  return words.slice(0, 4).join(' ').slice(0, 36) || 'Payment';
}

// Work costs dated from `from` to `to`, both days included ('YYYY-MM-DD'), grouped by kind, biggest first.
// categories: [{id, name}]; accounts: [{id, label}].
export function workReport(transactions, categories, accounts, { from, to }) {
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const acctName = new Map(accounts.map((a) => [a.id, a.label]));
  const groups = new Map();
  let total = 0;
  let count = 0;
  let handedIn = 0;
  let handedInCount = 0;
  for (const t of transactions) {
    if (t.isTransfer || t.direction !== 'debit' || !t.isReimbursable || !t.date || t.date < from || t.date > to) continue;
    const own = catName.get(t.categoryId);
    const real = own && own !== 'Other';
    const guess = real ? null : guessKind(`${t.merchant || ''} ${t.rawDescription || ''}`);
    const kind = real ? own : guess || 'Other';
    if (!groups.has(kind)) groups.set(kind, { name: kind, total: 0, count: 0, handedIn: 0, guessed: false, rows: [] });
    const g = groups.get(kind);
    const submitted = t.claimSubmitted === true;
    g.rows.push({ id: t.id, date: t.date, label: shortLabel(t), account: acctName.get(t.accountId) || '', amount: t.amount, submitted });
    g.total += t.amount;
    g.count += 1;
    if (submitted) g.handedIn += t.amount;
    if (guess) g.guessed = true;
    total += t.amount;
    count += 1;
    if (submitted) {
      handedIn += t.amount;
      handedInCount += 1;
    }
  }
  const list = [...groups.values()].sort((a, b) => b.total - a.total || (a.name < b.name ? -1 : 1));
  for (const g of list) g.rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return { from, to, total, count, handedIn, handedInCount, waiting: total - handedIn, waitingCount: count - handedInCount, groups: list };
}

// The first day of the oldest work cost not yet handed in, or null: where the page starts, so it opens on what still needs checking.
export function oldestWaiting(transactions) {
  let oldest = null;
  for (const t of transactions) {
    if (t.isTransfer || t.direction !== 'debit' || !t.isReimbursable || t.claimSubmitted === true || !t.date) continue;
    if (!oldest || t.date < oldest) oldest = t.date;
  }
  return oldest;
}

// A sheet for a claim form or an email: one line per payment. Commas and quotes inside a value are kept safe.
export function reportCsv(report) {
  // A leading = + - @ would be run as a formula by a spreadsheet; a name typed by the person could start with one.
  const q = (v) => `"${String(v).replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;
  const rows = [['Date', 'Kind', 'What', 'Paid from', 'Amount (Rs)', 'Handed in'].map(q).join(',')];
  for (const g of report.groups) {
    for (const r of g.rows) rows.push([r.date, g.name, r.label, r.account, (r.amount / 100).toFixed(2), r.submitted ? 'Yes' : 'No'].map(q).join(','));
  }
  rows.push(['', '', '', 'Total', (report.total / 100).toFixed(2), `${(report.handedIn / 100).toFixed(2)} handed in`].map(q).join(','));
  return rows.join('\r\n');
}
