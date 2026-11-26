// The same bank transaction saved twice.
//
// Importing statements that overlap - last month's PDF, then a whole financial
// year from NetBanking - brings in the same payments again. HDFC words them
// differently in each format ("IMPS-600000000002-01 SBI Savings ..." against
// "IMPS/600000000002/SBI Savings..."), so an exact description match misses
// them, and a ₹68,000 EMI would then count twice: in spending, in the
// commitment tracker and in the bank balance.
//
// Two transactions are the same one when they are on the same account, the
// same date, the same amount and direction, came from DIFFERENT imports (two
// identical rows inside one statement are two real payments), and either
// share the bank's reference number or read the same once punctuation and
// spacing are ignored. When the wording differs too much even for that, the
// number of such rows in each import settles it (see copiesAcrossImports).

// The bank's reference numbers on a transaction: HDFC's UPI/IMPS/NEFT number
// in the narration, and the Chq./Ref. No. column. A NetBanking download keeps
// its own Chq./Ref. No. beside the narration's number while the PDF has only
// the narration's, so two copies of one payment share a number, not all.
//   - Only runs of 12 or more digits count (UPI, IMPS and NEFT numbers are
//     12+): a phone number inside a UPI id ("q617982219@ybl") is shared by
//     every payment to that person and must never make two of them one.
//   - Leading zeros are dropped, and a number of only zeros - printed on some
//     cash and branch entries - is no reference at all, so it can't make two
//     different withdrawals look like one.
function referencesOf(t) {
  return (`${t.bankRef || ''} ${t.rawDescription || ''}`.match(/\d{12,}/g) || []).map((r) => r.replace(/^0+/, '')).filter(Boolean);
}

// true: a number in common. false: both have numbers, none in common. null:
// one of them has none, so the numbers can't tell.
function shareReference(a, b) {
  const refsA = referencesOf(a);
  const refsB = referencesOf(b);
  if (!refsA.length || !refsB.length) return null;
  return refsA.some((r) => refsB.includes(r));
}

// The whole description with punctuation, spacing and reference numbers
// removed. Compared in full: two ATM withdrawals of the same amount on the
// same day differ only in the machine code ("S1AWMI30" / "S1AWMI31"), and
// wrongly removing a real payment is far worse than keeping a copy.
function wordsOf(t) {
  return (t.rawDescription || '').toUpperCase().replace(/\d{9,}/g, '').replace(/[^A-Z0-9]/g, '');
}

export function sameTransaction(a, b) {
  if (a.accountId !== b.accountId || a.amount !== b.amount || a.direction !== b.direction) return false;
  const shared = shareReference(a, b);
  // A late-night payment is dated the day it was made in one download and the next day in another (HDFC's NetBanking
  // against its PDF, 30 Sep vs 1 Oct). Only a reference number the bank printed on both settles it, never the wording.
  if (a.date !== b.date) return shared === true && Math.abs(Date.parse(a.date) - Date.parse(b.date)) <= 864e5;
  if (shared != null) return shared;
  return wordsOf(a).length >= 6 && wordsOf(a) === wordsOf(b);
}

// The ids of later copies. The first-saved copy of each transaction is kept,
// so a category you set on it survives.
export function findDuplicates(transactions) {
  const groups = new Map();
  for (const t of transactions) {
    if (t.source === 'unbilled') continue; // current card lists replace themselves on every paste
    const key = `${t.accountId}|${t.date}|${t.amount}|${t.direction}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const extra = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
    const kept = [];
    for (const t of group) {
      // Inside one import, identical rows are normally two real payments -
      // unless they share a bank reference, which a bank never gives two
      // different payments.
      const twin = kept.find((k) => sameTransaction(k, t) && (k.importBatchId !== t.importBatchId || shareReference(k, t) === true));
      if (twin) extra.push(t);
      else kept.push(t);
    }
    extra.push(...copiesAcrossImports(kept));
  }
  // The groups above are one day each, so a copy dated a day off needs its own look.
  const gone = new Set(extra.map((t) => t.id));
  extra.push(...nextDayCopies(transactions.filter((t) => t.source !== 'unbilled' && !gone.has(t.id))));
  const gone2 = new Set(extra.map((t) => t.id));
  extra.push(...twinAccountCopies(transactions.filter((t) => t.source !== 'unbilled' && !gone2.has(t.id))));
  return extra;
}

// Of `accounts`, the one that already holds most of the incoming statement rows (same date, amount, direction; one saved
// row answers for one new row), when that is at least 8 rows and 30% of the statement. null: no card is this statement's.
export function accountHoldingRows(accounts, saved, rows) {
  let best = null;
  for (const a of accounts) {
    const have = new Map();
    for (const t of saved) {
      if (t.accountId !== a.id || t.source === 'unbilled') continue;
      const k = `${t.date}|${t.amount}|${t.direction}`;
      have.set(k, (have.get(k) || 0) + 1);
    }
    let hits = 0;
    for (const r of rows) {
      const k = `${r.date}|${r.amount}|${r.direction}`;
      if (have.get(k)) {
        have.set(k, have.get(k) - 1);
        hits++;
      }
    }
    if (hits >= TWIN_MIN_ROWS && hits >= rows.length * 0.3 && (!best || hits > best.hits)) best = { account: a, hits };
  }
  return best ? best.account : null;
}

// One card saved as two accounts. A renewed card prints a new number, so its statement is not recognised as the
// card the alerts were saved on and its rows start an account of their own: every purchase is then on both, and
// counted twice (26 Nov 2026: ₹19,883 of a -₹83,614 "Left to spend"). Two accounts are one card when most of the
// smaller one's rows in their shared dates are the very same date, amount and direction in the other.
// shortcut: needs 8 such rows, so a card with fewer than 8 doubled rows is not caught; lower it only with a test
// that two real cards of one family never reach it.
const TWIN_MIN_ROWS = 8;
const TWIN_SHARE = 0.6;
function twinAccountCopies(rows) {
  const byAccount = new Map();
  for (const t of rows) byAccount.set(t.accountId, [...(byAccount.get(t.accountId) || []), t]);
  if (byAccount.size < 2) return [];
  const keyOf = (t) => `${t.date}|${t.amount}|${t.direction}`;
  const byKey = new Map();
  for (const [id, list] of byAccount) {
    const m = new Map();
    for (const t of list.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))) m.set(keyOf(t), [...(m.get(keyOf(t)) || []), t]);
    byKey.set(id, m);
  }
  const copies = [];
  const ids = [...byAccount.keys()].sort();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [byKey.get(ids[i]), byKey.get(ids[j])];
      const pairs = []; // [rowInA, rowInB], one row answering for one row
      for (const [key, listA] of a) {
        const listB = b.get(key);
        if (listB) for (let n = 0; n < Math.min(listA.length, listB.length); n++) pairs.push([listA[n], listB[n]]);
      }
      if (pairs.length < TWIN_MIN_ROWS) continue;
      const dates = (list) => list.map((t) => t.date).sort();
      const [da, db] = [dates(byAccount.get(ids[i])), dates(byAccount.get(ids[j]))];
      const [from, to] = [da[0] > db[0] ? da[0] : db[0], da[da.length - 1] < db[db.length - 1] ? da[da.length - 1] : db[db.length - 1]];
      const within = (list) => list.filter((t) => t.date >= from && t.date <= to).length;
      if (pairs.length < TWIN_SHARE * Math.min(within(byAccount.get(ids[i])), within(byAccount.get(ids[j])))) continue;
      // The account saved first is the card as it was known (its alerts carry the tags set on them); the other is the copy.
      const firstA = Math.min(...pairs.map(([x]) => x.updatedAt || 0));
      const firstB = Math.min(...pairs.map(([, y]) => y.updatedAt || 0));
      copies.push(...pairs.map(([x, y]) => (firstA <= firstB ? y : x)));
    }
  }
  return [...new Map(copies.map((t) => [t.id, t])).values()];
}

// The later-saved copy of a payment another import saved with the day before or after, on the bank's own reference.
function nextDayCopies(rows) {
  const kept = new Map();
  const copies = [];
  for (const t of [...rows].sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))) {
    const key = `${t.accountId}|${t.amount}|${t.direction}`;
    const list = kept.get(key) || [];
    if (list.some((k) => k.importBatchId !== t.importBatchId && k.date !== t.date && sameTransaction(k, t))) copies.push(t);
    else kept.set(key, [...list, t]);
  }
  return copies;
}

// Two statement downloads of the same account can word a payment so
// differently that nothing matches ("UPI-NAME-name@okicici-...-UPI" in one,
// "...DR. ...66-67/3 UPI-NAME" in the other), yet on the same account, day and
// amount they are the same payment. However many of them one import holds is
// how many real payments there were. The import with the most is kept whole
// (on a tie, the one saved first, so the categories you set survive), and the
// rows from other imports are copies - unless their bank reference proves
// them different from every row kept.
function copiesAcrossImports(rows) {
  const imported = rows.filter((t) => t.importBatchId);
  const byImport = new Map();
  for (const t of imported) byImport.set(t.importBatchId, [...(byImport.get(t.importBatchId) || []), t]);
  if (byImport.size < 2) return [];
  const base = [...byImport.values()].reduce((best, list) => (list.length > best.length ? list : best));
  const kept = [...base];
  const copies = [];
  for (const t of imported) {
    if (base.includes(t)) continue;
    if (kept.every((k) => shareReference(k, t) === false)) kept.push(t);
    else copies.push(t);
  }
  return copies;
}
