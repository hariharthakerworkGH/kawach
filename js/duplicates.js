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
  if (a.accountId !== b.accountId || a.date !== b.date || a.amount !== b.amount || a.direction !== b.direction) return false;
  const shared = shareReference(a, b);
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
  return extra;
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
