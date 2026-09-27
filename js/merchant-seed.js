// Merchants Kawach knows before you have taught it anything.
//
// js/merchant-rules.js learns from what you assign, which works well and gets
// better every time you correct it - but only after you have corrected
// something. A brand-new person importing their first statement had no rules
// at all, so every row came back blank. That is the worst possible first
// look at the feature, and this is the fix: a starting set so the first
// import is mostly sorted, and the learned rules take over from there.
//
// These are NOT a second matcher. They are rows in the same shape as a
// learned rule, handed to the same matchWithRules() in merchant-rules.js, so
// there is one place where matching happens and one place to fix it.
//
// `hitCount: 0` is what keeps them out of your way: when a seed and a rule
// you taught both fit a line equally well, matchWithRules breaks the tie on
// hitCount, so the one you taught wins. Correct a guess once and the
// correction sticks for good.
//
// Nothing here is fetched. No logos, no brand assets, no network - just
// words that appear in Indian bank narrations.

// A pattern is matched against significantTokens(), which drops anything
// under four letters. So "Ola" can never be matched on its own; the forms
// that actually appear glued together in narrations are used instead. Keep
// every pattern lower case and four letters or more, or it will silently
// never match.
export const SEED_MERCHANTS = [
  // --- Eating: delivery, restaurants, coffee -------------------------
  ['swiggy', 'cat-food'],
  ['zomato', 'cat-food'],
  ['dominos', 'cat-food'],
  ['mcdonalds', 'cat-food'],
  ['burgerking', 'cat-food'],
  ['starbucks', 'cat-food'],
  ['chaayos', 'cat-food'],
  ['faasos', 'cat-food'],
  ['behrouz', 'cat-food'],
  ['eatsure', 'cat-food'],
  ['barbeque', 'cat-food'],
  ['haldiram', 'cat-food'],

  // --- Groceries and the ten-minute shops ----------------------------
  // Swiggy Instamart arrives as its own word often enough to be worth
  // listing; where it arrives as plain "SWIGGY" it lands in food, which is
  // a reasonable guess and one tap to correct.
  ['instamart', 'cat-groceries'],
  ['blinkit', 'cat-groceries'],
  ['grofers', 'cat-groceries'],
  ['zepto', 'cat-groceries'],
  ['bigbasket', 'cat-groceries'],
  ['dmart', 'cat-groceries'],
  ['jiomart', 'cat-groceries'],
  ['licious', 'cat-groceries'],
  ['countrydelight', 'cat-groceries'],
  ['milkbasket', 'cat-groceries'],
  ['spencers', 'cat-groceries'],

  // --- Getting about, and fuel ---------------------------------------
  ['uber', 'cat-transport'],
  ['olacabs', 'cat-transport'],
  ['olamoney', 'cat-transport'],
  ['rapido', 'cat-transport'],
  ['irctc', 'cat-transport'],
  ['redbus', 'cat-transport'],
  // No bare 'metro': matching is partly on substrings, so it would also
  // catch Metropolis, the pathology chain, and file a lab test under
  // travel. The metro rail operators are named instead, and a line that
  // only says "DELHI METRO" is left blank for you rather than guessed at.
  ['dmrc', 'cat-transport'],
  ['bmrcl', 'cat-transport'],
  ['fastag', 'cat-transport'],
  ['indigo', 'cat-transport'],
  ['spicejet', 'cat-transport'],
  ['vistara', 'cat-transport'],
  ['indianoil', 'cat-transport'],
  ['bharatpetroleum', 'cat-transport'],
  ['hindustanpetroleum', 'cat-transport'],

  // --- Buying things -------------------------------------------------
  ['amazon', 'cat-shopping'],
  ['flipkart', 'cat-shopping'],
  ['myntra', 'cat-shopping'],
  ['ajio', 'cat-shopping'],
  ['nykaa', 'cat-shopping'],
  ['meesho', 'cat-shopping'],
  ['tatacliq', 'cat-shopping'],
  ['decathlon', 'cat-shopping'],
  ['croma', 'cat-shopping'],
  ['lenskart', 'cat-shopping'],
  ['pepperfry', 'cat-shopping'],
  ['urbanic', 'cat-shopping'],

  // --- Watching and listening ----------------------------------------
  ['netflix', 'cat-entertainment'],
  ['spotify', 'cat-entertainment'],
  ['hotstar', 'cat-entertainment'],
  ['sonyliv', 'cat-entertainment'],
  ['zee5', 'cat-entertainment'],
  ['bookmyshow', 'cat-entertainment'],
  ['pvrcinemas', 'cat-entertainment'],
  ['inoxleisure', 'cat-entertainment'],
  ['googleplay', 'cat-entertainment'],

  // --- Bills: phone, internet, power ----------------------------------
  ['airtel', 'cat-bills'],
  ['jiofiber', 'cat-bills'],
  ['vodafone', 'cat-bills'],
  ['bsnl', 'cat-bills'],
  ['tatapower', 'cat-bills'],
  ['adanielectricity', 'cat-bills'],
  ['bescom', 'cat-bills'],
  ['msedcl', 'cat-bills'],
  ['actfibernet', 'cat-bills'],
  ['hathway', 'cat-bills'],

  // --- Health ---------------------------------------------------------
  ['apollo', 'cat-health'],
  ['pharmeasy', 'cat-health'],
  ['netmeds', 'cat-health'],
  ['practo', 'cat-health'],
  ['cultfit', 'cat-health'],
  ['fortis', 'cat-health'],
  ['medplus', 'cat-health'],
  ['tata1mg', 'cat-health'],
].map(([matchPattern, categoryId]) => ({ matchPattern, categoryId, hitCount: 0, seeded: true }));

// Deliberately NOT here: bank names.
//
// "HDFC" is in nearly every line of an HDFC statement, "SBI" in every line of
// an SBI one. A rule on a bank's own name would not identify a merchant, it
// would quietly assign one category to the whole import - which is worse
// than leaving the rows blank, because a wrong answer looks like an answer.
// Money moving between accounts is not a spend at all, and js/transfers.js
// already handles that.
//
// Also deliberately absent: a catch-all. When nothing matches, the matcher
// returns null and the row stays blank, which is what puts it in "needs a
// category" for you to decide. Guessing "Other" would bury a rent payment in
// a category nobody ever looks at.
