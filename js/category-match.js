// Finding the payments a new category is for.
//
// When you add a category, the payments that mention its name are offered to
// you to check - never put in it by themselves. The rules are deliberately
// narrow, because a wrong match here quietly changes what you spent on what,
// what counts towards a commitment, and last month's picture:
//   - whole words only: "Rent" finds "HOUSE RENT", never "CURRENT" or
//     "PARENT";
//   - only payments with no category yet. Payments don't record whether you
//     set their category or the app guessed it, so any payment with one is
//     left alone - your choices are never overwritten;
//   - never money moved between your own accounts, and never a split
//     payment, whose parts you set by hand.

// Words in a category name that say nothing about which payments it is for,
// or that appear in almost every bank narration.
const NOISE = new Set([
  'and', 'the', 'for', 'from', 'to', 'my', 'our', 'of', 'at', 'in', 'on', 'other', 'misc', 'miscellaneous',
  'bank', 'upi', 'neft', 'imps', 'rtgs', 'card', 'payment', 'payments', 'paid', 'pay', 'transfer', 'india', 'ltd', 'pvt',
]);

// The words to look for: from the name, plus any you type yourself.
export function searchWords(...texts) {
  const words = texts
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !NOISE.has(w));
  return [...new Set(words)];
}

// Payments that could belong to the category, newest first.
export function findCandidates(transactions, words) {
  if (!words.length) return [];
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // A "word" in a narration is anything between non-letters, so "UPI-SWIGGY-
  // swiggy@icici" holds SWIGGY twice and "SwiggyBENGALURU" holds none.
  const pattern = new RegExp(`(^|[^a-z0-9])(${escaped.join('|')})(?=$|[^a-z0-9])`, 'i');
  return transactions
    .filter((t) => !t.categoryId && !t.isTransfer && !(Array.isArray(t.splits) && t.splits.length) && pattern.test(t.rawDescription || ''))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
