// UPI payments to people (7.13). A ride, a helper or a vendor paid straight to a person leaves a line with a name and a phone-number id and
// nothing a shop-name rule can match, so they pile up with no category (17 Nov 2026: Rapido took only cash, then riders were paid by UPI).
// Two helpers, both read-only, neither files anything:
//   isUpiToPerson(raw)   does this line look like a UPI payment to a person (not a shop)?
//   upiShape(list)       a guess for one such payment, from how the same kind of payment of about the same size was filed before.
// The guess is worked out from the payments already in History, so there is nothing extra to store, keep in step or sync.
import { needsCategory } from './splits.js';

// Words in a UPI line that are not part of anyone's name: the rail, the apps, and the banks' four-letter codes.
const NOT_NAMES = new Set(['UPI', 'DR', 'CR', 'PAYMENT', 'PAYMENTS', 'FROM', 'TO', 'SENT', 'PAID', 'PHONEPE', 'PAYTM', 'GPAY', 'GOOGLE', 'PAY', 'BANK', 'REF', 'TRANSFER', 'NEFT', 'IMPS',
  'TXN', 'DEBIT', 'CREDIT', 'TPAP', 'LIMITED', 'LTD', 'PVT', 'PRIVATE', 'INDIA', 'ONLINE',
  'YESB', 'SBIN', 'HDFC', 'ICIC', 'UTIB', 'KKBK', 'PUNB', 'BARB', 'CNRB', 'IDIB', 'INDB', 'FDRL', 'UBIN', 'BKID', 'MAHB', 'IOBA', 'CBIN', 'ESFB', 'AIRP', 'IBKL', 'RATN', 'SIBL', 'KARB']);
// A name with one of these in it is a business, not a person.
const BUSINESS = /^(store|stores|mart|shop|enterprise|enterprises|traders|trading|medical|pharma|restaurant|cafe|foods|food|services|bazar|bazaar|super|hotel|agency|agencies|corporation|corp|solutions|technologies|retail|supermarket|dairy|bakery|sweets|general|centre|center)$/i;
// No hyphen in the id part: narrations join the fields with hyphens ("...KUMAR-9876543210@YBL"), and the name must not be swallowed with the id.
const VPA = /[a-z0-9._]+@[a-z]+/gi;

// What to teach the merchant rules when a payment to a person is filed: the person's own id (the part before the @), never the whole line. Whole-line
// rules shared the bank's code and common surnames, so filing one rider as Transport also pre-filled the next stranger's payment (the same cause 7.13
// would have multiplied). merchant-rules.js calls this for every way a payment is filed.
export function learnText(raw) {
  if (!isUpiToPerson(raw)) return raw;
  return (String(raw).match(VPA) || [])[0]?.split('@')[0] || null; // null: no id to key on, so nothing is learned
}

// shortcut: a person whose id is all letters ("rameshk@okaxis") or a one-word name is not recognised, and a shop with a two-word name and a number in its
// id (a QR code's) is; the first only misses the group card (the payment still shows in History as before), the second can be unticked in the sheet.
// Upgrade by reading the bank's own payee-type marker where a bank gives one (P2P/P2A/P2M below do).
export function isUpiToPerson(raw) {
  const text = String(raw || '');
  if (!/\bUPI\b/i.test(text) && !/@[a-z]{2,}/i.test(text)) return false;
  if (/\bP2M\b/i.test(text)) return false; // the bank itself says: a merchant
  if (/\bP2[AP]\b/i.test(text)) return true;
  const ids = text.match(VPA) || [];
  if (ids.some((v) => /^\d{10}@/.test(v))) return true; // a phone number as the id is a person's
  if (ids.length && !ids.some((v) => /\d/.test(v.split('@')[0]))) return false; // an id with no digit in it is a shop's or an app's ("swiggy@icici")
  const words = text.replace(VPA, ' ').split(/[^A-Za-z0-9']+/).filter((w) => /^[A-Za-z']+$/.test(w) && !NOT_NAMES.has(w.toUpperCase()));
  return words.length >= 2 && words.length <= 3 && words.some((w) => w.length >= 3) && !words.some((w) => BUSINESS.test(w));
}

// The size bands a rider, a helper or a vendor is usually paid in. Above ₹2,000 a payment to a person is not routine, so there is no band and no guess.
export function bandOf(paise) {
  const r = paise / 100;
  return r < 50 ? 0 : r < 100 ? 1 : r < 200 ? 2 : r < 500 ? 3 : r < 1000 ? 4 : r < 2000 ? 5 : -1;
}

const outgoing = (t) => t.direction === 'debit' && !t.isTransfer && !t.personId && !(Array.isArray(t.splits) && t.splits.length);

// The payments to people in this list that still have no category.
export function upiPeopleRows(list) {
  return list.filter((t) => outgoing(t) && needsCategory(t) && isUpiToPerson(t.rawDescription));
}

// A function that guesses a category for one payment: the category most of the earlier payments of this kind and size were filed under, when
// there are at least 3 of them and at least 70% agree. Otherwise null: a guess that is often wrong is worse than none.
export function upiShape(all) {
  const seen = new Map(); // band -> Map(categoryId -> how many)
  for (const t of all) {
    if (!t.categoryId || !outgoing(t) || !isUpiToPerson(t.rawDescription)) continue;
    const b = bandOf(t.amount);
    if (b < 0) continue;
    const m = seen.get(b) || new Map();
    m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
    seen.set(b, m);
  }
  return (t) => {
    if (!outgoing(t) || !needsCategory(t) || !isUpiToPerson(t.rawDescription)) return null;
    const m = seen.get(bandOf(t.amount));
    if (!m) return null;
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    const [id, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return total >= 3 && n / total >= 0.7 ? id : null;
  };
}

// The category the card may file in ONE tap: the group's guess, but only when every payment is in the routine size range (a ₹3,000 payment to a person is
// not a ride) and none of them points to a different category. Otherwise the card opens the sheet, where each payment can be looked at.
export function oneTap(rows, shape) {
  const g = groupGuess(rows, shape);
  return g && rows.every((t) => bandOf(t.amount) >= 0 && [null, g].includes(shape(t))) ? g : null;
}

// The one category to offer for a whole group: the most common guess among them (null when none of them has one).
export function groupGuess(rows, guess) {
  const n = new Map();
  for (const t of rows) {
    const id = guess(t);
    if (id) n.set(id, (n.get(id) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}
