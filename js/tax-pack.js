/* What a chartered accountant in India needs, sorted the way a return is filled (7.1).
 *
 * A return is filed on the income tax portal from the department's own utility, never from a spreadsheet,
 * and the department already holds a copy of much of the year: the employer's TDS (Form 16, Form 26AS), the
 * interest and dividends banks report, the purchases and sales of shares (the Annual Information Statement).
 * So a CA asks a client for three things: the income by kind, so it can be set beside that statement; the
 * payments that may count as deductions, with proof; and the tax already paid. This file sorts what Kawach
 * knows into those, by plain words in the bank's own narration and by what the person recorded. It is a
 * first sort for a person to check, never a tax figure: nothing is added up into tax, and every line that is
 * only a guess says "looks like". What it cannot know (Form 16, AIS, interest certificates, share sales)
 * the workbook lists as still to be got from elsewhere.
 */
import { isPolicy, kindOf, kindLabel, paidInYear } from './policies.js';
import { balanceAt } from './account-metrics.js';
import { loanPosition, isLoanAccount } from './loans.js';
import { pfPosition, isPfAccount } from './pf.js';

/* --- money in, by kind ---------------------------------------------------------------------------------------- */
// The order a return follows, with the line a CA reads beside each.
export const INCOME_HEADS = [
  { name: 'Salary or pension', hint: 'Set beside Form 16 and the employer lines in the Annual Information Statement (AIS)' },
  { name: 'Interest: savings account', hint: 'Set beside the interest in AIS. Up to Rs 10,000 of it is deductible under 80TTA' },
  { name: 'Interest: deposits', hint: 'Set beside the deposit interest in AIS and the banks\' interest certificates' },
  { name: 'Dividends', hint: 'Set beside the dividend lines in AIS' },
  { name: 'Rent received', hint: 'Income from house property' },
  { name: 'Business receipts', hint: 'Business or profession: see the Business sheet' },
  { name: 'Income tax refund', hint: 'The interest part of a refund is taxed' },
  { name: 'From people', hint: 'Loans are not income. Gifts from relatives are not taxed; from others, above Rs 50,000 in the year, they can be' },
  { name: 'Refunds and cashbacks', hint: 'Not income: they give back part of what was spent' },
  { name: 'Maybe moved between your accounts', hint: 'Same amount left another of your accounts within 3 days: not income if it is your own money' },
  { name: 'Other money in', hint: 'Not sorted: ask your CA' },
];

const RE = {
  interest: /\b(int(erest)?\.?\s*(pd|paid|cr|credit|payment)|credit\s+interest|sb\s+int|int\s*\.?\s*on\s+(sb|savings|fd|td)|interest\s+on\s+(savings|fd|deposit))\b/i,
  dividend: /\bdividend\b|\bdiv\s*(cr|credit|payout)\b|\bpayout\b.*\b(div|dividend)\b/i,
  taxRefund: /(income\s*tax|itd|cbdt|it\s*dept).*refund|refund.*(income\s*tax|itd|cbdt)|\bitr\s*refund\b/i,
  refund: /cash\s*back|cashback|refund|reversal|reversed|chargeback|returned|\bcb\s*cr\b/i,
  salary: /\b(salary|sal\s*cr|payroll|stipend|pension)\b/i,
  rent: /\brent\b/i,
  cashIn: /\b(cash\s*(dep|deposit)|cdm|by\s*cash|cash\s*in)\b/i,
};

/* The kind of a payment that came in. `r` is a report row (js/ca-export.js). First match wins; the order is the
 * one a mistake costs least in: a word the bank itself writes (interest, dividend) beats what the person filed it as. */
export function incomeHead(r) {
  const d = r.description || '';
  if (r.t.personId) return 'From people';
  if (RE.taxRefund.test(d)) return 'Income tax refund';
  if (RE.interest.test(d)) return r.accountType === 'savings' || /\b(fd|td|rd|mod|deposit)\b/i.test(d) ? 'Interest: deposits' : 'Interest: savings account';
  if (RE.dividend.test(d)) return 'Dividends';
  if (RE.refund.test(d) || r.accountType === 'card') return 'Refunds and cashbacks';
  if (r.lane !== 'Home') return 'Business receipts';
  if (RE.salary.test(d) || /^(income|salary|pay)/i.test(r.categoryName || '')) return 'Salary or pension';
  if (RE.rent.test(d)) return 'Rent received';
  return 'Other money in';
}

/* Credits that match a debit of the same amount on another of your accounts within three days and were never
 * marked as moves: very likely your own money going round (an EMI sent to a loan account is the usual one). */
export function lookLikeMoves(rows) {
  const day = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  const outs = rows.filter((r) => r.moneyOut && !r.t.isTransfer);
  const used = new Set();
  const found = new Set();
  for (const c of rows) {
    if (!c.moneyIn || c.t.isTransfer || c.bill) continue;
    const match = outs.find((o) => !used.has(o) && o.t.accountId !== c.t.accountId && o.moneyOut === c.moneyIn && Math.abs(day(o.date) - day(c.date)) <= 3);
    if (match) {
      used.add(match);
      found.add(c);
    }
  }
  return found;
}

/* --- payments that may be deductions, and tax already paid --------------------------------------------------------- */
const PROOFS = [
  { re: /\b(ppf|public\s*provident|sukanya|\bssy\b|\bnsc\b|elss|tax\s*saver|\blic\b|life\s*insurance|tuition|school\s*fee)/i, section: '80C', what: 'Savings, life insurance or school fees' },
  { re: /\b(nps|national\s*pension|pran)\b/i, section: '80CCD(1B)', what: 'National Pension System' },
  { re: /(health\s*insurance|mediclaim|star\s*health|care\s*health|niva\s*bupa|max\s*bupa|ergo.*health|acko.*health|preventive\s*health)/i, section: '80D', what: 'Health insurance' },
  { re: /\b(donation|pm\s*cares|relief\s*fund|charit)/i, section: '80G', what: 'Donation' },
  { re: /\b(education\s*loan|edu\s*loan)\b/i, section: '80E', what: 'Education loan' },
];
const TAX_RE = /\b(income\s*tax|itns\s*28\d|cbdt|oltas|tin[\s-]*nsdl|advance\s*tax|self\s*assessment|e-?pay\s*tax)\b/i;
const GST_RE = /\b(gstn|gst\s*(pmt|payment|paid|challan)|cbic|gst\s*cash|gst\s*cr)\b/i;

const INVEST_RE = /\b(zerodha|groww|upstox|angel\s*(one|broking)|kuvera|coin\s*by|indmoney|et\s*money|5\s*paisa|icici\s*(direct|securities)|hdfc\s*securities|kotak\s*securities|mutual\s*fund|\bsip\b|\bbse\s*star|nse\s*clearing|ccil|smallcase)\b/i;
const RENT_CATEGORY = /^(house\s*)?rent$/i;

/* The kind of a payment that went out, when it is one a CA wants set apart; '' for the rest. */
export function outHead(r) {
  const d = r.description || '';
  if (TAX_RE.test(d)) return 'Income tax paid';
  if (GST_RE.test(d)) return 'GST paid';
  const p = PROOFS.find((x) => x.re.test(d));
  if (p) return `Looks like ${p.section}: ${p.what}`;
  if (INVEST_RE.test(d)) return 'Sent to shares or mutual funds';
  return RENT_CATEGORY.test(r.categoryName || '') ? 'Rent paid' : '';
}

/* --- the tables -------------------------------------------------------------------------------------------------- */
const sum = (rows, pick) => rows.reduce((s, r) => s + pick(r), 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/* Everything the workbook and the PDF need beyond the plain list of payments. `rows` are the report's rows (each
 * carries `head`, set here), `recurring` the commitments (policies live on them), `period` and `today` as elsewhere.
 * A table is { title, note, head: [..], rows: [[..]], total } whose cells are text, a count (number) or { paise }. */
export function buildTaxPack({ rows, accounts, transactions, recurring = [], period, today, loans = [], lanes = [] }) {
  const moves = lookLikeMoves(rows);
  for (const r of rows) {
    r.head = r.t.isTransfer || r.bill ? '' : r.moneyIn ? (moves.has(r) ? 'Maybe moved between your accounts' : incomeHead(r)) : outHead(r);
  }
  const counted = rows.filter((r) => !r.t.isTransfer && !r.bill);

  const heads = INCOME_HEADS.map((h) => {
    const mine = counted.filter((r) => r.moneyIn && r.head === h.name);
    return { ...h, count: mine.length, amount: sum(mine, (r) => r.moneyIn) };
  }).filter((h) => h.count);
  const income = {
    title: 'Money in, by kind',
    note: 'Sorted by what the bank wrote and what you filed it as. Check it against the AIS and Form 26AS from the income tax portal.',
    head: ['Kind', 'Entries', 'Amount', 'Where it goes'],
    rows: heads.map((h) => [h.name, h.count, { paise: h.amount }, h.hint]),
    total: ['Total money in', sum(heads, (h) => h.count), { paise: sum(heads, (h) => h.amount) }, ''],
  };

  // Payments that look like deductions, grouped by section, each with its rows in the ledger.
  const proofRows = counted.filter((r) => r.moneyOut && r.head.startsWith('Looks like'));
  const bySection = new Map();
  for (const r of proofRows) {
    const g = bySection.get(r.head) || { count: 0, amount: 0 };
    g.count += 1;
    g.amount += r.moneyOut;
    bySection.set(r.head, g);
  }
  const fy = { from: period.from, to: period.to };
  const policies = recurring.filter(isPolicy).map((r) => ({ r, paid: paidInYear(r, fy) })).filter((p) => p.paid > 0);
  const sectionOf = { health: '80D (health insurance)', life: '80C (life insurance)', term: '80C (life insurance)' };
  const proofs = {
    title: 'Payments that may be deductions',
    note: 'Only what your CA can claim with a receipt or certificate, and only under the regime they choose. The first block is read from bank narrations, so check each; the policies are what you recorded as paid.',
    head: ['What', 'Entries', 'Amount', '', 'Proof to ask for'],
    rows: [
      ...[...bySection.entries()].map(([name, g]) => [name, g.count, { paise: g.amount }, '', 'Receipt or certificate. Filter the Ledger sheet on this text to see each payment']),
      ...policies.map(({ r, paid }) => [`${r.label} (${kindLabel(r)})`, '', { paise: paid }, '', `Premium receipt${sectionOf[kindOf(r)] ? `: ${sectionOf[kindOf(r)]}` : ': not a deduction'}`]),
    ],
  };
  const loanTable = {
    title: 'Home and other loans',
    note: "The interest is the bank's own figure where its loan statement was read, and worked out from the rate otherwise. The bank's interest certificate is what is claimed from.",
    head: ['Loan', 'Paid', 'Interest', 'Principal', 'Note'],
    rows: loans.map((l) => [l.name, { paise: l.paid }, { paise: l.interest }, { paise: l.principal }, l.underConstruction ? 'Still being built: interest before possession is usually claimed in five equal parts from the year you get it. Your CA will say.' : 'A home loan: interest under 24(b), principal under 80C (old regime). A car or personal loan is no deduction; an education loan\'s interest is (80E).']),
  };

  const paidRows = counted.filter((r) => r.moneyOut && (r.head === 'Income tax paid' || r.head === 'GST paid'));
  const paid = {
    title: 'Tax already paid by you',
    note: 'Tax cut by an employer or bank (TDS) is not in your accounts: it is on Form 16, Form 26AS and the AIS. These are the payments you made yourself.',
    head: ['What', 'Date', 'Account', 'Amount'],
    rows: paidRows.map((r) => [`${r.head}: ${r.description}`, { date: r.date }, r.account, { paise: r.moneyOut }]),
    total: ['Total', '', '', { paise: sum(paidRows, (r) => r.moneyOut) }],
  };

  const grouped = (head, label) => {
    const mine = counted.filter((r) => r.moneyOut && r.head === head);
    return { mine, rows: mine.length ? [[label, mine.length, { paise: sum(mine, (r) => r.moneyOut) }]] : [] };
  };
  const investG = grouped('Sent to shares or mutual funds', 'Brokers and mutual fund platforms');
  const invest = {
    title: 'Money sent to shares or mutual funds',
    note: 'Kawach does not see what was bought or sold. For capital gains your CA needs the broker\'s or fund house\'s profit and loss statement.',
    head: ['Where', 'Entries', 'Amount'],
    rows: investG.rows,
  };
  const rentG = grouped('Rent paid', 'Rent');
  const rent = {
    title: 'Rent paid',
    note: 'For house rent allowance your CA needs the rent receipts and the landlord\'s details; the landlord\'s PAN is asked for when the rent is over Rs 1 lakh a year.',
    head: ['What', 'Entries', 'Amount'],
    rows: rentG.rows,
  };

  // A business, month by month: the figures that decide which return and whether the books need an audit.
  const laneNames = [...new Set(counted.map((r) => r.lane))].filter((l) => l !== 'Home');
  const business = laneNames.map((lane) => {
    const mine = counted.filter((r) => r.lane === lane);
    const sentHome = rows.filter((r) => r.lane === lane && r.t.isTransfer && r.moneyOut);
    const months = [...new Set([...mine, ...sentHome].map((r) => r.date.slice(0, 7)))].sort();
    const cashIn = (r) => r.moneyIn && (r.accountType === 'cash' || RE.cashIn.test(r.description || ''));
    const body = months.map((m) => {
      const x = mine.filter((r) => r.date.startsWith(m));
      const cash = sum(x.filter(cashIn), (r) => r.moneyIn);
      return [monthLabel(m), { paise: sum(x, (r) => r.moneyIn) - cash }, { paise: cash }, { paise: sum(x, (r) => r.moneyOut) }, { paise: sum(sentHome.filter((r) => r.date.startsWith(m)), (r) => r.moneyOut) }, { paise: sum(x.filter((r) => r.head === 'GST paid'), (r) => r.moneyOut) }];
    });
    const col = (k) => body.reduce((s, b) => s + b[k].paise, 0);
    const received = col(1) + col(2);
    const outBy = (lanes.find((l) => l.name === lane) || { outBy: [] }).outBy;
    return {
      title: `${lane}: month by month`,
      note: 'Money in is what reached the bank. Where a client cut tax at source (TDS) the full amount is on your invoice and in Form 26AS. It is split into bank or UPI and cash because a presumptive return treats the two differently and the share of cash decides audit limits. "Taken home" is money moved to your own accounts, which a CA books as drawings.',
      head: ['Month', 'Money in: bank or UPI', 'Money in: cash', 'Money out', 'Taken home', 'GST paid'],
      rows: body,
      total: ['Total', { paise: col(1) }, { paise: col(2) }, { paise: col(3) }, { paise: col(4) }, { paise: col(5) }],
      cashShare: received ? Math.round((col(2) / received) * 1000) / 10 : 0,
      expenses: {
        title: `${lane}: money out by category`,
        note: 'Your own categories: a CA groups them into the expense heads of the books (telephone, travel, stationery and so on).',
        head: ['Category', 'Amount'],
        rows: outBy.map((o) => [o.name, { paise: o.amount }]),
      },
    };
  });

  // Where each account stood on the last day: a return and a balance sheet both ask.
  const upTo = period.to < today ? period.to : today;
  const bal = [];
  for (const a of accounts) {
    if (isPfAccount(a)) {
      const p = pfPosition(a, transactions, upTo);
      bal.push([a.label, 'Provident fund (passbook, interest not yet credited left out)', { paise: p.balance }]);
    } else if (isLoanAccount(a)) {
      const asOf = a.loan && a.loan.outstandingAsOf;
      const owed = asOf && upTo < asOf ? null : loanPosition(a, transactions, upTo).outstanding;
      bal.push([a.label, 'Loan still owed', owed == null ? 'ask the bank for its certificate' : { paise: owed }]);
    } else if (a.type === 'card') {
      continue;
    } else {
      const b = balanceAt(a, transactions, upTo);
      bal.push([a.label, a.type === 'savings' ? 'Deposit' : a.type === 'cash' ? 'Cash' : 'Bank balance', b == null ? 'no statement covers this day' : { paise: b }]);
    }
  }
  const balances = {
    title: `Where each account stood on ${Number(upTo.slice(8, 10))} ${MONTHS[Number(upTo.slice(5, 7)) - 1]} ${upTo.slice(0, 4)}`,
    note: 'From the statements imported. Cards are left out: what a card owes is the bank\'s own figure.',
    head: ['Account', 'What it is', 'Amount'],
    rows: bal,
  };

  return { income, proofs, loans: loanTable, paid, invest, rent, business, balances, moved: moves.size, heads };
}

/* What Kawach cannot know, and where it comes from. */
export const STILL_TO_GET = [
  ['Form 16 and payslips', 'From the employer. The salary and the tax cut from it.'],
  ['AIS and Form 26AS', 'incometax.gov.in, after sign-in: Annual Information Statement (download the JSON or PDF) and Form 26AS. Your CA sets this file beside them.'],
  ['Interest certificates', 'From each bank: savings and deposit interest, and the interest on every loan.'],
  ['Share and mutual fund statements', 'The broker\'s or fund house\'s profit and loss statement: Kawach does not see what is bought or sold.'],
  ['Rent receipts and landlord details', 'For house rent allowance, when rent is paid.'],
  ['Insurance, donation and school fee receipts', 'For anything claimed as a deduction.'],
  ['Invoices, and Form 26AS for a business', 'Kawach has no invoices. The gross amount billed, the tax clients cut (TDS) and, for a GST-registered business, the GST returns come from them.'],
  ['What you own and owe', 'Property, gold, vehicles, furniture, money clients owe you, money you owe others: a CA needs them for a balance sheet. Kawach knows only bank, deposit, loan and provident fund balances.'],
];
