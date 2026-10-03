/* For your CA (5.21): a month or a financial year, as a spreadsheet of every
 * payment and as a short report to save as a PDF.
 *
 * A chartered accountant asks the same things every year: what came in, what
 * went out and on what, which of it was the business's, and what was paid on a
 * home loan as interest and as principal (the two are claimed differently).
 * Everything here is what the app already knows; nothing is worked out for
 * tax and nothing is filed. The files are not locked with the backup
 * passphrase: the screen that makes them says so, as they are meant to be
 * handed over.
 *
 * Money moved between your own accounts is listed but kept out of the totals,
 * the same rule as everywhere else. A payment saved twice is counted once.
 */
import { getAll, getSetting } from './db.js';
import { isoLocal } from './frequency.js';
import { findDuplicates } from './duplicates.js';
import { categorySlices } from './splits.js';
import { isLoanAccount, loanPayments, assignLoanPayments } from './loans.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* The periods offered: this financial year so far, the last one, and each
 * of the last twelve months. India's financial year runs 1 April to 31 March. */
export function caPeriods(today) {
  const [y, m] = today.split('-').map(Number);
  const fy = m >= 4 ? y : y - 1;
  const short = (n) => String(n).slice(2);
  const periods = [
    { id: `fy-${fy}`, label: `Financial year ${fy}-${short(fy + 1)} so far`, from: `${fy}-04-01`, to: today },
    { id: `fy-${fy - 1}`, label: `Financial year ${fy - 1}-${short(fy)}`, from: `${fy - 1}-04-01`, to: `${fy}-03-31` },
  ];
  for (let back = 0; back < 12; back += 1) {
    const d = new Date(y, m - 1 - back, 1);
    const last = isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    periods.push({ id: `m-${isoLocal(d).slice(0, 7)}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}${back === 0 ? ' so far' : ''}`, from: isoLocal(d), to: last < today ? last : today });
  }
  return periods;
}

// On paper the year is always written, whatever year it is now.
const fullDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${iso.slice(0, 4)}`;
const rupees = (paise) => (paise / 100).toFixed(2);

/* Everything the two files show, worked out once. */
export function buildCaReport({ transactions, accounts, categories, people = [], businesses = [], period, today }) {
  const byAccount = new Map(accounts.map((a) => [a.id, a]));
  const catName = (id) => (id ? categories.find((c) => c.id === id)?.name || 'Other' : 'No category');
  const laneOf = (a) => (a && a.business ? businesses.find((b) => b.id === a.space)?.name || 'Business' : 'Home');
  const duplicateIds = new Set(findDuplicates(transactions).map((t) => t.id));
  // A loan's EMIs, by the payment they were: "No category" would hide them.
  const loanRows = accounts.filter(isLoanAccount).map((a) => ({ account: a, paid: loanPayments(a, transactions, today).filter((p) => p.date >= period.from && p.date <= period.to) }));
  // Matched the way the rest of the app matches them: the payments as they
  // left your bank, not the loan statement's own rows.
  const loanAccounts = accounts.filter(isLoanAccount);
  const emiOf = new Map(
    [...(loanAccounts.length ? assignLoanPayments(loanAccounts, transactions, today) : new Map()).entries()].flatMap(([id, paid]) =>
      paid.map((t) => [t.id, `Loan EMI, ${loanAccounts.find((a) => a.id === id).label}`])
    )
  );
  const rows = transactions
    .filter((t) => !duplicateIds.has(t.id) && t.date >= period.from && t.date <= period.to && byAccount.get(t.accountId)?.type !== 'pf')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => {
      const account = byAccount.get(t.accountId);
      const person = t.personId ? people.find((p) => p.id === t.personId) : null;
      const slices = categorySlices(t);
      const note = t.isTransfer
        ? 'Moved between your own accounts'
        : person
          ? `${t.direction === 'debit' ? 'Given to' : 'Got from'} ${person.name}`
          : t.isReimbursable
            ? 'Work cost, to be paid back'
            : t.isSettlement
              ? 'Work cost paid back'
              : '';
      return {
        t,
        date: t.date,
        account: account ? account.label : t.accountId === 'cash' ? 'Cash' : 'Unknown account',
        lane: laneOf(account),
        description: t.rawDescription || '',
        category: t.isTransfer ? '' : emiOf.has(t.id) ? emiOf.get(t.id) : person ? 'Lent and borrowed' : slices.length > 1 ? slices.map((s) => `${catName(s.categoryId)} ${rupees(s.amount)}`).join('; ') : catName(t.categoryId),
        moneyIn: t.direction === 'credit' ? t.amount : 0,
        moneyOut: t.direction === 'debit' ? t.amount : 0,
        note,
        slices,
      };
    });

  // Totals by lane, then by category, money moved between your own accounts
  // left out. A person's money is a line of its own, never a category.
  const lanes = new Map();
  for (const r of rows) {
    if (r.t.isTransfer) continue;
    const lane = lanes.get(r.lane) || { name: r.lane, moneyIn: 0, moneyOut: 0, inBy: new Map(), outBy: new Map() };
    lane.moneyIn += r.moneyIn;
    lane.moneyOut += r.moneyOut;
    const into = r.t.direction === 'credit' ? lane.inBy : lane.outBy;
    const parts = emiOf.has(r.t.id) ? [{ name: emiOf.get(r.t.id), amount: r.t.amount }] : r.t.personId ? [{ name: 'Lent and borrowed', amount: r.t.amount }] : r.slices.map((s) => ({ name: catName(s.categoryId), amount: s.amount }));
    for (const p of parts) into.set(p.name, (into.get(p.name) || 0) + p.amount);
    lanes.set(r.lane, lane);
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }));
  const laneList = [...lanes.values()]
    .sort((a, b) => (a.name === 'Home' ? -1 : b.name === 'Home' ? 1 : a.name.localeCompare(b.name)))
    .map((l) => ({ name: l.name, moneyIn: l.moneyIn, moneyOut: l.moneyOut, inBy: sorted(l.inBy), outBy: sorted(l.outBy) }));

  // Loans: what was paid in the period, and how much of it was interest.
  const loans = loanRows
    .map(({ account: a, paid }) => {
      return { name: a.label, paid: paid.reduce((s, p) => s + p.amount, 0), interest: paid.reduce((s, p) => s + p.interest, 0), principal: paid.reduce((s, p) => s + p.principal, 0), count: paid.length, fromStatement: paid.some((p) => p.fromStatement) };
    })
    .filter((l) => l.count > 0);

  return { period, made: today, rows, lanes: laneList, loans, moved: rows.filter((r) => r.t.isTransfer).reduce((s, r) => s + r.moneyIn + r.moneyOut, 0) };
}

export async function caReport(period) {
  const [transactions, accounts, categories, people, businesses] = await Promise.all([
    getAll('transactions'),
    getAll('accounts'),
    getAll('categories'),
    getSetting('people', []),
    getSetting('businesses', []),
  ]);
  return buildCaReport({ transactions, accounts, categories, people, businesses: Array.isArray(businesses) ? businesses : [], period, today: isoLocal(new Date()) });
}

// A field for a spreadsheet: quoted when it holds a comma, a quote or a line
// break, and never read as a formula (a description starting with "=" or "+"
// would otherwise run in Excel).
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* Every payment, one per line, for a spreadsheet. Starts with a byte-order
 * mark so Excel reads the ₹ and Indian names correctly. */
export function toCsv(report) {
  const head = ['Date', 'Account', 'For', 'Description', 'Category', 'Money in', 'Money out', 'Note'];
  const lines = report.rows.map((r) => [r.date, r.account, r.lane, r.description, r.category, r.moneyIn ? rupees(r.moneyIn) : '', r.moneyOut ? rupees(r.moneyOut) : '', r.note].map(cell).join(','));
  return `﻿${[head.join(','), ...lines].join('\r\n')}\r\n`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inr = (paise) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/* The report, as plain printable HTML: totals first, then every payment. */
export function reportHtml(report) {
  const { period } = report;
  const table = (rows) => `<table><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${inr(r.amount)}</td></tr>`).join('')}</tbody></table>`;
  return `
    <header><h1>Money for ${esc(period.label.replace(/ so far$/, '').replace(/^Financial year/, 'the financial year'))}</h1>
      <p>${fullDate(period.from)} to ${fullDate(period.to)} · made with Kawach on ${fullDate(report.made)} · money moved between your own accounts is left out of the totals</p></header>
    ${report.lanes
      .map(
        (l) => `<section><h2>${esc(l.name)}</h2>
          <p class="sums"><span>Money in <b>${inr(l.moneyIn)}</b></span><span>Money out <b>${inr(l.moneyOut)}</b></span></p>
          <div class="cols"><div><h3>Money in</h3>${table(l.inBy)}</div><div><h3>Money out</h3>${table(l.outBy)}</div></div>
        </section>`
      )
      .join('')}
    ${
      report.loans.length
        ? `<section><h2>Loans</h2><table><thead><tr><th>Loan</th><th class="n">Paid</th><th class="n">Interest</th><th class="n">Principal</th></tr></thead><tbody>${report.loans
            .map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${inr(l.paid)}</td><td class="n">${inr(l.interest)}</td><td class="n">${inr(l.principal)}</td></tr>`)
            .join('')}</tbody></table><p class="small">Interest is the bank's own figure where its loan statement was imported, and otherwise worked out from the rate. Check it against the bank's interest certificate.</p></section>`
        : ''
    }
    <section><h2>Every payment (${report.rows.length})</h2>
      <table class="all"><thead><tr><th>Date</th><th>Account</th><th>Description</th><th>Category</th><th class="n">In</th><th class="n">Out</th></tr></thead><tbody>${report.rows
        .map(
          (r) => `<tr${r.t.isTransfer ? ' class="moved"' : ''}><td>${r.date}</td><td>${esc(r.account)}${r.lane !== 'Home' ? ` (${esc(r.lane)})` : ''}</td><td>${esc(r.description)}${r.note ? `<br><i>${esc(r.note)}</i>` : ''}</td><td>${esc(r.category)}</td><td class="n">${r.moneyIn ? inr(r.moneyIn) : ''}</td><td class="n">${r.moneyOut ? inr(r.moneyOut) : ''}</td></tr>`
        )
        .join('')}</tbody></table></section>`;
}
