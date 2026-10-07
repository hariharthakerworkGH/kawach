import { getAll, put } from './db.js';
import { DEPOSIT_MOVE_RE } from './parsers/sbi-savings.js';

const MAX_DAYS_APART = 5;

// A credit card bill payment shows up twice: once as a debit on the paying
// account (bank/cash), once as a "payment received" credit on the card
// itself. Counting both inflates spend, so we auto-flag same-amount,
// close-in-time pairs across account types and exclude them from totals.
export async function detectTransfers() {
  const [transactions, accounts] = await Promise.all([getAll('transactions'), getAll('accounts')]);
  const accountType = new Map(accounts.map((a) => [a.id, a.type]));

  // `transferManual` means you decided this one yourself - detection leaves it alone.
  const auto = transactions.filter((t) => !t.transferManual);
  const payingDebits = auto.filter((t) => !t.isTransfer && t.direction === 'debit' && accountType.get(t.accountId) !== 'card');
  const cardCredits = auto.filter((t) => !t.isTransfer && t.direction === 'credit' && accountType.get(t.accountId) === 'card');
  const ownMoved = detectOwnAccountTransfers(auto, accounts, accountType);

  const updates = [];
  const cardDigits = new Map(accounts.map((a) => [a.id, [a.last4, ...(a.linkedLast4s || [])].filter(Boolean)]));
  for (const debit of payingDebits) {
    // Same amount a few days apart isn't enough on its own: a ₹1,299 refund on
    // the card and a ₹1,299 UPI payment to a friend would pair up and both
    // vanish from spending. One side has to read like a card payment, or the
    // bank's line has to name the card.
    const match = cardCredits.find(
      (credit) =>
        credit.amount === debit.amount &&
        // A payment you said was for one card never pairs with another.
        (!debit.paysCardId || credit.accountId === debit.paysCardId) &&
        !credit._claimed &&
        daysApart(debit.date, credit.date) <= MAX_DAYS_APART &&
        (looksLikeCardPayment(credit, 'card') ||
          looksLikeCardPayment(debit, 'bank') ||
          (cardDigits.get(credit.accountId) || []).some((d) => (debit.rawDescription || '').includes(d)))
    );
    if (match) {
      match._claimed = true;
      debit.isTransfer = true;
      match.isTransfer = true;
      updates.push(debit, match);
    }
  }

  // Pairing only works when both halves have been imported. In practice they
  // often haven't: you pay the August card bill in September, so the bank
  // statement has the debit while the card's matching "payment received" is in
  // a cycle you haven't imported yet. Left alone, that bill payment counts as
  // ordinary spending and gets flagged as a suspicious new merchant. So also
  // recognise an unmatched half by how the bank itself describes it.
  const updated = new Set(updates);
  for (const t of auto) {
    if (t.isTransfer || updated.has(t)) continue;
    if (!looksLikeCardPayment(t, accountType.get(t.accountId))) continue;
    t.isTransfer = true;
    updates.push(t);
  }

  // Money put into a fixed deposit at the same bank, or swept back out of it:
  // the bank's own wording says so (js/parsers/sbi-savings.js). New statements
  // are read that way; this catches the lines saved before the reader knew,
  // which counted ₹65,000 into an FD as a ₹65,000 spend.
  for (const t of auto) {
    if (t.isTransfer || updated.has(t) || accountType.get(t.accountId) === 'card') continue;
    if (!DEPOSIT_MOVE_RE.test(t.rawDescription || '')) continue;
    t.isTransfer = true;
    updates.push(t);
  }

  for (const t of [...updates, ...ownMoved]) {
    delete t._claimed;
    await put('transactions', t);
  }
  return updates.length + ownMoved.length;
}

// Money moved between two of your own accounts - salary account to the one an
// EMI leaves from, or into an FD. It leaves one balance and arrives in
// another, so it is never spending, but the two halves have to be recognised
// as one movement or the debit looks like a ₹68,000 spend.
//
// Same amount, within a few days, and the debit has to name the other account
// (its bank or its last four digits) or read as a transfer. Without that, a
// ₹5,000 UPI payment to a friend and a ₹5,000 refund arriving the same week
// would pair up and both vanish.
const MOVED_RE = /\b(IMPS|NEFT|RTGS|TPT|FT|SELF|TRANSFER|TRF|FD|RD|TERM\s*DEPOSIT|SWEEP)\b/i;

function detectOwnAccountTransfers(auto, accounts, accountType) {
  const holds = (id) => ['bank', 'cash', 'savings'].includes(accountType.get(id));
  const names = new Map(
    accounts.map((a) => [a.id, [a.last4, ...(a.linkedLast4s || []), a.issuer, a.label].filter(Boolean).map((s) => String(s).toLowerCase())])
  );
  const debits = auto.filter((t) => !t.isTransfer && t.direction === 'debit' && holds(t.accountId));
  const credits = auto.filter((t) => !t.isTransfer && t.direction === 'credit' && holds(t.accountId));
  // From the business's account to a home one (or back) is how an owner
  // takes money home, often by UPI with nothing in the wording to go on. Both
  // sides are yours, so the same amount within the days is enough.
  const business = new Set(accounts.filter((a) => a.business).map((a) => a.id));
  const acrossBusiness = (a, b) => business.has(a) !== business.has(b);
  const moved = [];
  for (const debit of debits) {
    const desc = (debit.rawDescription || '').toLowerCase();
    const twin = credits.find(
      (credit) =>
        credit.accountId !== debit.accountId &&
        credit.amount === debit.amount &&
        !credit._claimed &&
        daysApart(debit.date, credit.date) <= 3 &&
        ((names.get(credit.accountId) || []).some((n) => desc.includes(n)) || MOVED_RE.test(desc) || acrossBusiness(debit.accountId, credit.accountId))
    );
    if (!twin) continue;
    twin._claimed = true;
    debit.isTransfer = true;
    twin.isTransfer = true;
    // Which way it went, so money moved home from the business can be told
    // from money moved between two home accounts.
    debit.movedTo = twin.accountId;
    twin.movedFrom = debit.accountId;
    moved.push(debit, twin);
  }
  return moved;
}

// Deliberately narrow: these wordings are card-bill settlements, not ordinary
// bill payments. "BBPS" alone is not enough - electricity and gas go through
// BBPS too - so it only counts alongside an explicit card-payment phrase.
const PAYMENT_OUT_RE = /\b(CRED\b|CRED\.CLUB|CC\s*PAYMENT|CREDIT\s*CARD\s*(BILL\s*)?(PAYMENT|PMT)|PAYMENT\s*ON\s*CRED)/i;
// On the card side a credit sent by bank transfer can only be a payment -
// refunds come back from the merchant - so NEFT/IMPS/NetBanking count too.
const PAYMENT_IN_RE = /\b(PAYMENT\s*RECEIVED|CC\s*PAYMENT|BPPY\s*CC|CRED\b|AUTOPAY\s*RECEIVED|NET\s*BANKING\s*(TRANSFER|PAYMENT)|PAYMENT\s*-?\s*THANK\s*YOU|BBPS|NEFT|IMPS)/i;

/* In and Out for a month (5.21.3, the owner's rule): what came into or left
 * your bank and cash accounts. A card purchase is not out yet; the bill that
 * pays for it is, the day it leaves the bank, so the same money is never
 * counted twice. Money moved between your own accounts is neither, and a
 * card's own refunds and "payment received" are the card's business.
 * The budget is not this: Left to spend counts a purchase the day it is
 * swiped (js/free-to-spend.js). Returns 'in', 'out' or null. */
//
// Only the bank accounts you spend from (5.21.5, "whatever moves from the main
// account"): money that reached a savings account, a loan account or cash
// already left the main one, so its EMIs, FDs and cash spends are not out a
// second time.
//
// Money moved is out too when it leaves for an account you do not spend from
// (savings, the account the home loans are paid from): it has left the main
// account. Only a move between two accounts you spend from is neither, and
// that is what `between` holds (spendMoves below). With it, what a month
// brought forward plus In less Out is exactly what it ends with.
export const spendsFrom = (account) => Boolean(account && account.type === 'bank' && account.spending !== false);

export function cashSide(t, account, between = null) {
  if (!spendsFrom(account)) return null;
  if (t.direction === 'debit' && (t.paysCardId || looksLikeCardPayment(t, 'bank'))) return 'out';
  if (t.isTransfer && (!between || between.has(t.id))) return null;
  return t.direction === 'credit' ? 'in' : 'out';
}

/* The moves that stay among the accounts you spend from: both halves, by the
 * pair the import found (movedTo / movedFrom) or, failing that, the same
 * amount the other way within three days. */
export function spendMoves(transactions, accounts) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const spend = (id) => spendsFrom(byId.get(id));
  const moves = transactions.filter((t) => t.isTransfer && spend(t.accountId));
  const ids = new Set();
  for (const t of moves) {
    const other = t.direction === 'debit' ? t.movedTo : t.movedFrom;
    if (other) {
      if (spend(other)) ids.add(t.id);
      continue;
    }
    const twin = moves.find((c) => c.accountId !== t.accountId && c.direction !== t.direction && c.amount === t.amount && daysApart(c.date, t.date) <= 3);
    if (twin) ids.add(t.id);
  }
  return ids;
}

/* A payment out of a bank account that pays a card's bill. The purchases it pays
 * are already counted, by category, on the card, so a bill counted again as
 * spending is the same money twice: Coach once said "Bills & Utilities is
 * running hot, ₹84,347" because two card bills were filed under it (5.23). */
export function isCardBill(t, account) {
  if (t.direction !== 'debit' || (account && account.type === 'card')) return false;
  return Boolean(t.paysCardId || looksLikeCardPayment(t, 'bank'));
}

export function looksLikeCardPayment(t, type) {
  const desc = t.rawDescription || '';
  if (type === 'card') return t.direction === 'credit' && PAYMENT_IN_RE.test(desc);
  return t.direction === 'debit' && PAYMENT_OUT_RE.test(desc);
}

function daysApart(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs((a - b) / (1000 * 60 * 60 * 24));
}
