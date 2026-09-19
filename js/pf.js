import { isoLocal } from './frequency.js';

// Provident fund.
//
// The rules the arithmetic follows (EPF, as they stand for a salaried employee
// in India). Each one is a setting on the account, because they do change and
// an employer can be more generous than the minimum:
//   - You put in 12% of basic pay. Your employer puts in the same 12%, but
//     part of theirs can go to the pension scheme (EPS): 8.33% of the wage,
//     capped at a ₹15,000 wage, so ₹1,250. Many employers put the whole 12%
//     into EPF instead and pay no EPS at all, which the passbook shows.
//   - Interest is declared by EPFO each year. It is worked out on the running
//     monthly balance and CREDITED ONCE A YEAR, on 31 March. A contribution
//     earns nothing in the month it arrives: it starts earning the month
//     after, which is why this month's money never appears in the interest.
//   - The pension part is not a balance you can watch grow, so it is counted
//     and shown separately, never added to the fund.
//
// So the fund's balance always equals the passbook: opening balance, plus
// contributions, plus interest EPFO has actually credited. Interest earned
// since the last 31 March is kept beside it as "not credited yet".

const EPS_WAGE_CAP = 1500000; // ₹15,000 a month, in paise
export const DEFAULT_PF_RATE = 8.25;

export const isPfAccount = (a) => a.type === 'pf';

// What one month's pay adds, from the basic pay on the payslip.
export function pfContribution(basic, settings = {}) {
  const employeePct = settings.employeePct ?? 12;
  const employerPct = settings.employerPct ?? 12;
  const employee = Math.round((basic * employeePct) / 100);
  const employerTotal = Math.round((basic * employerPct) / 100);
  const pensionWage = settings.epsOnFullWage ? basic : Math.min(basic, EPS_WAGE_CAP);
  // Payroll rounds the pension share to the rupee: 8.33% of ₹15,000 is
  // ₹1,249.50, which everyone pays as ₹1,250.
  const eps = settings.noEps ? 0 : Math.min(employerTotal, Math.round((pensionWage * 8.33) / 10000) * 100);
  return { employee, employerEpf: Math.max(0, employerTotal - eps), eps, intoFund: employee + Math.max(0, employerTotal - eps) };
}

// Where the fund stands.
//
// `balance` is the passbook figure. `pendingInterest` is what this year has
// earned so far and EPFO will credit on 31 March. `withInterest` adds the two,
// for when you want to know what it is really worth today.
export function pfPosition(account, transactions, today = isoLocal(new Date())) {
  const pf = account.pf || {};
  const rate = (pf.ratePct ?? DEFAULT_PF_RATE) / 1200;
  const opening = account.knownBalance || 0;
  const anchor = account.knownBalanceDate || (pf.startMonth ? `${pf.startMonth}-01` : null);

  const paidIn = transactions
    .filter((t) => t.accountId === account.id && t.direction === 'credit' && t.date <= today && (!anchor || t.date > anchor))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const lastKnown = paidIn.length ? paidIn[paidIn.length - 1].amount : pf.monthlyIntoFund || 0;
  const withPayslip = new Set(paidIn.map((t) => t.date.slice(0, 7)));

  let balance = opening;
  let pendingInterest = 0;
  let creditedInterest = 0;
  let contributed = 0;
  let assumedMonths = 0;

  const anchorMonth = anchor ? anchor.slice(0, 7) : null;
  const lastPayslipMonth = paidIn.length ? paidIn[paidIn.length - 1].date.slice(0, 7) : null;

  let cursor = anchor ? monthStart(anchor) : paidIn.length ? monthStart(paidIn[0].date) : null;
  while (cursor && cursor <= today) {
    const month = cursor.slice(0, 7);
    // Interest for the month is earned on the balance standing at its start,
    // before this month's money arrives. The anchor's own month is skipped:
    // the passbook balance is dated inside it, so its interest is either
    // already in that figure or not yet due.
    if (month !== anchorMonth) pendingInterest += Math.round(balance * rate);

    if (withPayslip.has(month)) {
      for (const t of paidIn.filter((x) => x.date.slice(0, 7) === month)) {
        balance += t.amount;
        contributed += t.amount;
      }
    } else if (pf.assumeMonthly !== false && lastKnown && lastPayslipMonth && month > lastPayslipMonth) {
      // No payslip for this month yet: the last known contribution is counted
      // and flagged, so the balance does not silently stall between imports.
      // Only months after the last payslip are guessed at; a month before it
      // with nothing in it really had nothing in it.
      balance += lastKnown;
      contributed += lastKnown;
      assumedMonths++;
    }

    // EPFO credits the year's interest on 31 March; from April it is part of
    // the balance and earns interest itself.
    if (month.endsWith('-03')) {
      balance += pendingInterest;
      creditedInterest += pendingInterest;
      pendingInterest = 0;
    }
    cursor = nextMonth(cursor);
  }

  return {
    balance,
    opening,
    contributed,
    creditedInterest,
    pendingInterest,
    withInterest: balance + pendingInterest,
    monthly: lastKnown,
    months: paidIn.length,
    assumedMonths,
    lastMonth: paidIn.length ? paidIn[paidIn.length - 1].date.slice(0, 7) : null,
    ratePct: pf.ratePct ?? DEFAULT_PF_RATE,
    nextCredit: nextMarch(today),
    // Pension money is tracked but never counted as part of the fund.
    pension: pf.pensionPaid || 0,
    // What it grows to if pay and rate stay as they are.
    in: (years) => projectPf(balance + pendingInterest, lastKnown, rate, years * 12),
    // What it grows to on interest alone, if nothing more goes in - after
    // leaving a job, say.
    alone: (years) => projectPf(balance + pendingInterest, 0, rate, years * 12),
  };
}

// The balance after so many more months, with interest added once a year the
// way EPFO does it rather than every month.
function projectPf(balance, monthly, monthlyRate, months) {
  let value = balance;
  let earned = 0;
  for (let i = 1; i <= months; i++) {
    earned += Math.round(value * monthlyRate);
    value += monthly;
    if (i % 12 === 0) {
      value += earned;
      earned = 0;
    }
  }
  return Math.round(value + earned);
}

function monthStart(iso) {
  return `${iso.slice(0, 7)}-01`;
}

function nextMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
}

// The 31 March on or after this date: when the interest earned so far lands.
function nextMarch(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${m <= 3 ? y : y + 1}-03-31`;
}
