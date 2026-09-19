import { getAll, put } from './db.js';

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
