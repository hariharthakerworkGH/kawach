import { isoLocal } from './frequency.js';

// Loan accounts: a home loan, a car loan, anything paid off by a fixed EMI.
//
// A loan is set up once, on the account itself (amount borrowed, interest
// rate, EMI, the day it goes out and the account it leaves from). From that:
//   - its EMI becomes a commitment by itself, so it comes off the budget
//     without also being typed in on Plan - which would count it twice;
//   - what's still owed, how many EMIs are left and when it ends are worked
//     out from the payments the app can see.
//
// Money you move into the account the EMI leaves from is a transfer between
// your own accounts (see transfers.js), never spending.

export const isLoanAccount = (a) => a.type === 'loan';

// The commitment a loan makes for itself. `accountId` is where the money
// actually leaves from, so it's matched against that account only.
export function loanCommitment(account) {
  const loan = account.loan || {};
  if (!loan.emi) return null;
  // Some EMIs are already covered by a commitment on Plan - money moved to
  // the account the EMI leaves from, which can be more than the EMI itself.
  // Then the loan is still tracked, but it doesn't touch the budget again.
  if (loan.inBudget === false) return null;
  return {
    id: `loan-${account.id}`,
    label: account.label,
    amount: loan.emi,
    frequency: 'monthly',
    dayOfMonth: loan.day || 1,
    accountId: loan.paidFromId || null,
    categoryId: loan.categoryId || null,
    active: true,
    source: 'loan',
    loanAccountId: account.id,
  };
}

// Is this transaction one of the loan's EMIs? Either it's on the loan account
// itself (a repayment arriving there), you tagged it, or it's a debit of about
// the EMI from the account the loan is paid from.
function isLoanPayment(account, t, { anyAccount = false } = {}) {
  const loan = account.loan || {};
  if (t.paysLoanId) return t.paysLoanId === account.id;
  if (t.accountId === account.id) return t.direction === 'credit';
  if (!looksLikeEmiAmount(loan, t)) return false;
  if (!anyAccount && loan.paidFromId && t.accountId !== loan.paidFromId) return false;
  return true;
}

// Is this payment the EMI? Only if it is the EMI's own amount, give or take
// a rounding of 2%.
//
// A wider window was tried - anything up to half as much again, near the due
// day, to catch a round ₹23,000 paid against a bank EMI of ₹22,256 - and it
// was wrong: an ordinary ₹30,000 transfer six days before the due day got
// swallowed as an EMI and the loan then reported interest and principal that
// were never paid. A payment missed is a payment you can tag by hand; a
// payment invented is a wrong figure you have no way to spot. When the amount
// you actually pay differs from the bank's EMI, correct the EMI on the
// account (statement imports already do this) or tag the payment to the loan.
function looksLikeEmiAmount(loan, t) {
  if (!loan.emi || t.direction !== 'debit') return false;
  return Math.abs(t.amount - loan.emi) <= loan.emi * 0.02;
}

// "Paid from" is a hint, not a rule. If nothing of the right size has ever
// left the account named there - it was guessed at import, or the EMI moved
// to another account - the payments are looked for everywhere instead. A loan
// showing no payments at all is far more confusing than one that found them
// somewhere unexpected.
function looksAnywhere(account, transactions) {
  const loan = account.loan || {};
  if (!loan.paidFromId) return true;
  return !transactions.some((t) => t.accountId === loan.paidFromId && looksLikeEmiAmount(loan, t));
}

// Two loans can take the same EMI on the same day from the same account -
// two home loans of ₹23,000 each on the 15th. Matching them one by one would
// count every payment against both, halving each balance twice as fast, so
// the payments are shared out: one payment belongs to one loan. A payment you
// tagged to a loan yourself always goes to that one.
export function assignLoanPayments(loanAccounts, transactions, today = isoLocal(new Date())) {
  const byLoan = new Map(loanAccounts.map((a) => [a.id, []]));
  const wide = new Map(loanAccounts.map((a) => [a.id, { anyAccount: looksAnywhere(a, transactions) }]));
  const rows = transactions.filter((t) => t.date <= today).sort((a, b) => (a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date < b.date ? -1 : 1));
  for (const t of rows) {
    const tagged = loanAccounts.find((a) => t.paysLoanId === a.id);
    const matches = tagged ? [tagged] : loanAccounts.filter((a) => isLoanPayment(a, t, wide.get(a.id)));
    if (!matches.length) continue;
    // The loan that has been given the fewest so far, so equal EMIs alternate.
    const target = matches.sort((a, b) => byLoan.get(a.id).length - byLoan.get(b.id).length || String(a.id).localeCompare(String(b.id)))[0];
    byLoan.get(target.id).push(t);
  }
  return byLoan;
}

// This loan's payments as they left your bank: shared out when there are
// other loans to share with.
export function paymentsFor(account, transactions, today, allLoans) {
  if (Array.isArray(allLoans) && allLoans.length > 1) return assignLoanPayments(allLoans, transactions, today).get(account.id) || [];
  const opts = { anyAccount: looksAnywhere(account, transactions) };
  return transactions.filter((t) => isLoanPayment(account, t, opts) && t.date <= today);
}
// Where the loan stands. A statement prints what is still owed on the day it
// was made, which is the most exact starting point there is: from there the
// balance grows by a month's interest and falls by each EMI seen since. With
// no statement figure it is worked forward from the amount borrowed instead.
export function loanPosition(account, transactions, today = isoLocal(new Date()), allLoans = null) {
  const loan = account.loan || {};
  const emi = loan.emi || 0;
  const monthlyRate = (loan.ratePct || 0) / 1200;
  const from = loan.startMonth ? `${loan.startMonth}-01` : null;
  const payments = paymentsFor(account, transactions, today, allLoans)
    .filter((t) => !from || t.date >= from)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  let outstanding = null;
  if (loan.outstanding != null) {
    outstanding = loan.outstanding;
    for (const p of payments.filter((t) => !loan.outstandingAsOf || t.date > loan.outstandingAsOf)) {
      outstanding = Math.max(0, Math.round(outstanding * (1 + monthlyRate) - p.amount));
    }
  } else if (loan.principal && emi) {
    const grown = (1 + monthlyRate) ** payments.length;
    outstanding =
      monthlyRate > 0
        ? Math.max(0, Math.round(loan.principal * grown - emi * ((grown - 1) / monthlyRate)))
        : Math.max(0, loan.principal - emi * payments.length);
  }

  // How many EMIs are left at this balance and this payment - the figure
  // that actually moves when you pay more than the EMI. Worked out from what is owed and what you actually pay, which is the
  // honest figure when you pay more than the EMI. The bank's own number is
  // used only when there isn't enough to work it out from.
  const history = loanHistory(account);
  // While the rest of the loan is still to be released, how long it takes to
  // clear is not knowable: the bank resets the EMI once everything is paid
  // out. A date worked from today's balance and today's EMI would be a
  // made-up figure, so none is given.
  const left = history && history.underConstruction ? null : termFromRate(outstanding, emi, monthlyRate) ?? loan.monthsLeft ?? null;
  const totalEmis = loan.totalEmis || null;
  // Paid back: from the bank's own balance when there is a statement table,
  // and on top of that whatever has come off since the statement's date.
  const paidBack = history && history.paidBack != null && outstanding != null ? history.released - outstanding : null;
  return {
    emi,
    principal: loan.principal || null,
    released: history ? history.released : null,
    stillToRelease: history ? history.stillToRelease : null,
    underConstruction: Boolean(history && history.underConstruction),
    paidBack,
    paid: payments.length,
    lastPaid: payments.length ? payments[payments.length - 1].date : null,
    totalEmis,
    left,
    outstanding,
    endDate: left ? addMonths(today, left) : null,
  };
}

// The loan's own history, when its statement's table was read (see
// parsers/sbi-loan.js). Everything here is the bank's figure, not an
// estimate:
//   - released: what has actually been paid out of the loan so far. On a
//     flat still being built this is less than the amount sanctioned, and it
//     is what the balance must be measured against - measured against the
//     full sanction, a loan that has barely been paid down looked a third
//     paid off.
//   - paidBack: released less what is owed now, straight from the bank's
//     balance. Every rupee paid above the interest shows up here, whether or
//     not the bank calls it an EMI yet.
//   - interestCharged: every month's interest, added up.
// Null for a loan typed in by hand, which is worked out from payments instead.
export function loanHistory(account) {
  const loan = account.loan || {};
  const ledger = Array.isArray(loan.ledger) ? loan.ledger : [];
  if (!ledger.length) return null;
  const sumOf = (kind) => ledger.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  const released = loan.released ?? sumOf('release');
  const sanctioned = loan.principal || null;
  return {
    released,
    sanctioned,
    stillToRelease: sanctioned ? Math.max(0, sanctioned - released) : null,
    // A rupee or two of rounding between the parts released and the
    // sanction must not make a finished loan look unfinished.
    underConstruction: Boolean(sanctioned && released < sanctioned * 0.995),
    paidBack: loan.outstanding != null ? released - loan.outstanding : null,
    interestCharged: sumOf('interest'),
    since: ledger[0].date,
    asOf: loan.outstandingAsOf || null,
  };
}

// Each payment on the statement, split the way the bank splits it: whatever
// interest has been charged and not yet paid comes out of it first, and the
// rest comes off what you owe. The interest is the amount the bank charged,
// month by month, so the split is exact rather than worked out from a rate.
function statementPayments(ledger) {
  const rows = [];
  let interestDue = 0;
  for (const e of ledger) {
    if (e.kind === 'interest' || e.kind === 'charge') interestDue += e.amount;
    if (e.kind !== 'payment') continue;
    const interest = Math.min(e.amount, interestDue);
    interestDue -= interest;
    rows.push({ id: `ledger-${e.date}-${rows.length}`, date: e.date, amount: e.amount, interest, principal: e.amount - interest, fromStatement: true });
  }
  return rows;
}

// Every payment the app can see, split into interest and principal the way
// the bank does it: interest first, on the balance standing at the time, and
// whatever is left comes off what you owe. Newest first.
export function loanPayments(account, transactions, today = isoLocal(new Date()), allLoans = null) {
  const loan = account.loan || {};
  const monthlyRate = (loan.ratePct || 0) / 1200;
  const seen = paymentsFor(account, transactions, today, allLoans).sort((a, b) => (a.date < b.date ? -1 : 1));
  // The statement's outstanding figure belongs to its own date, so payments
  // before it are read backwards from there and payments after it forwards.
  const asOf = loan.outstandingAsOf || null;
  const rows = [];
  let balance = loan.outstanding != null ? loan.outstanding : loan.principal || 0;

  // With the statement's own table, everything up to its date is the bank's
  // record. Only payments since then - seen in your bank, not yet on a loan
  // statement - have to be worked out, and they are, from the rate below.
  const history = loanHistory(account);
  if (history && asOf) {
    for (const t of seen.filter((t) => t.date > asOf)) {
      const interest = Math.round(balance * monthlyRate);
      const principal = Math.max(0, t.amount - interest);
      balance = Math.max(0, balance - principal);
      rows.push({ id: t.id, date: t.date, amount: t.amount, interest: Math.min(interest, t.amount), principal, balance });
    }
    return [...statementPayments(loan.ledger), ...rows].reverse();
  }

  for (const t of seen.filter((t) => !asOf || t.date > asOf)) {
    const interest = Math.round(balance * monthlyRate);
    const principal = Math.max(0, t.amount - interest);
    balance = Math.max(0, balance - principal);
    rows.push({ id: t.id, date: t.date, amount: t.amount, interest: Math.min(interest, t.amount), principal, balance });
  }
  let before = loan.outstanding != null ? loan.outstanding : loan.principal || 0;
  for (const t of seen.filter((t) => asOf && t.date <= asOf).reverse()) {
    // Going back a month: the balance then was bigger by the principal repaid.
    // What was owed before the payment is (what is owed after it, plus the
    // payment) undone by a month's interest. The payment has to be added
    // back in - leaving it out quietly understated the interest on every
    // payment made before the statement date, which for a loan anchored on
    // this month's statement is every payment there is.
    const interest = Math.round(((before + t.amount) / (1 + monthlyRate)) * monthlyRate);
    const principal = Math.max(0, t.amount - interest);
    before += principal;
    rows.unshift({ id: t.id, date: t.date, amount: t.amount, interest: Math.min(interest, t.amount), principal, balance: before - principal });
  }
  return rows.reverse();
}

// What paying more each month does over the whole loan: how much interest
// never gets paid, and how much sooner it is over. Nothing is recommended;
// these are the figures the arithmetic gives for whatever extra you try.
//
// The whole loan is what is owed today plus, while a flat is still being
// built, what the bank has yet to release - you will repay all of it. The
// time allowed is what is left of the term the statement prints ("Remaining
// Tenure", or the loan term less the months since the first EMI). Once
// everything is released the bank sets the EMI to clear the whole amount in
// that time, so that is the EMI the loan is run down at, and never less than
// what you already pay.
export function payFasterPlan(account, extraPerMonth = 0, { outstanding = null, today = isoLocal(new Date()) } = {}) {
  const loan = account.loan || {};
  const monthlyRate = (loan.ratePct || 0) / 1200;
  const owed = outstanding != null ? outstanding : loan.outstanding;
  if (owed == null || !loan.emi) return null;
  const history = loanHistory(account);
  const stillToRelease = history && history.underConstruction ? history.stillToRelease || 0 : 0;
  const balance = owed + stillToRelease;
  const monthsLeftInTerm = termLeft(loan, today);
  const emi = stillToRelease && monthsLeftInTerm ? Math.max(loan.emi, emiToClear(balance, monthlyRate, monthsLeftInTerm)) : loan.emi;
  const asIs = runOff(balance, emi, monthlyRate);
  const faster = runOff(balance, emi + extraPerMonth, monthlyRate);
  if (!asIs || !faster) return null;
  return {
    balance,
    stillToRelease,
    monthsLeftInTerm,
    emi,
    months: asIs.months,
    fasterMonths: faster.months,
    monthsSaved: asIs.months - faster.months,
    endsOn: addMonths(today, asIs.months),
    fasterEndsOn: addMonths(today, faster.months),
    interest: asIs.interest,
    fasterInterest: faster.interest,
    interestSaved: asIs.interest - faster.interest,
  };
}

// Months left of the loan's term. The statement's "Remaining Tenure" is
// counted from its own date, so the months since then come off it.
function termLeft(loan, today) {
  const monthsBetween = (from, to) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  if (loan.monthsLeft) return Math.max(1, loan.monthsLeft - (loan.outstandingAsOf ? Math.max(0, monthsBetween(loan.outstandingAsOf, today)) : 0));
  if (loan.totalEmis && loan.startMonth) return Math.max(1, loan.totalEmis - Math.max(0, monthsBetween(`${loan.startMonth}-01`, today)));
  return null;
}

// The EMI that clears this balance in this many months at this rate.
function emiToClear(balance, monthlyRate, months) {
  if (monthlyRate <= 0) return Math.ceil(balance / months);
  const grown = (1 + monthlyRate) ** months;
  return Math.ceil((balance * monthlyRate * grown) / (grown - 1));
}
// Runs a balance down at this payment and rate: how many months it takes and
// the interest paid on the way. Null when the payment never clears the
// interest, because then it never ends.
function runOff(balance, payment, monthlyRate) {
  if (payment <= balance * monthlyRate) return null;
  let months = 0;
  let interest = 0;
  let owed = balance;
  while (owed > 0 && months < 1200) {
    const month = Math.round(owed * monthlyRate);
    interest += Math.min(month, payment);
    owed = Math.max(0, owed + month - payment);
    months++;
  }
  return { months, interest: Math.round(interest) };
}

// How many EMIs a loan of this size takes at this rate. Without a rate it's
// the amount divided by the EMI; an EMI too small to cover the interest never
// ends, so nothing is claimed.
function termFromRate(principal, emi, monthlyRate) {
  if (!principal || !emi) return null;
  if (monthlyRate <= 0) return Math.ceil(principal / emi);
  const interestOnly = principal * monthlyRate;
  if (emi <= interestOnly) return null;
  return Math.ceil(Math.log(emi / (emi - interestOnly)) / Math.log(1 + monthlyRate));
}

function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return isoLocal(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}
