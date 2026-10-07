/* For your CA (5.21; the files made properly in 5.27): a month or a financial
 * year, as an Excel workbook (a summary sheet and every payment) and as a PDF
 * report, both real files written here (js/xlsx.js, js/pdf-write.js).
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
import { isCardBill } from './transfers.js';
import { xlsxBook } from './xlsx.js';
import { createPdf, A4, wrap, fit } from './pdf-write.js';

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
      const bill = isCardBill(t, account);
      const note = bill
        ? 'Card bill payment: the purchases it pays are counted on the card'
        : t.isTransfer
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
        category: t.isTransfer || bill ? '' : emiOf.has(t.id) ? emiOf.get(t.id) : person ? 'Lent and borrowed' : slices.length > 1 ? slices.map((s) => `${catName(s.categoryId)} ${rupees(s.amount)}`).join('; ') : catName(t.categoryId),
        moneyIn: t.direction === 'credit' ? t.amount : 0,
        moneyOut: t.direction === 'debit' ? t.amount : 0,
        note,
        slices,
        bill,
      };
    });

  // Totals by lane, then by category, money moved between your own accounts
  // left out. A person's money is a line of its own, never a category.
  const lanes = new Map();
  for (const r of rows) {
    if (r.t.isTransfer || r.bill) continue;
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

const heading = (period) => `Money for ${period.label.replace(/ so far$/, '').replace(/^Financial year/, 'the financial year')}`;
const NOTE = 'Money moved between your own accounts, and card bill payments (the purchases are counted on the card), are listed but left out of the totals.';
const LOAN_NOTE = "Interest is the bank's own figure where its loan statement was imported, and otherwise worked out from the rate. Check it against the bank's interest certificate.";
const counted = (r) => !r.t.isTransfer && !r.bill;

/* The workbook: a Summary sheet (what came in and went out, by category, and the loans),
 * then every payment on its own sheet with real dates and numbers, a Counted column
 * and totals that add only what counts. */
export function toXlsx(report) {
  const { period } = report;
  const m = (v) => ({ v: v / 100, s: 'money' });
  const sum = [[{ v: heading(period), s: 'title' }], [{ v: `${fullDate(period.from)} to ${fullDate(period.to)}, made with Kawach on ${fullDate(report.made)}`, s: 'note' }], [{ v: NOTE, s: 'note' }], []];
  for (const l of report.lanes) {
    sum.push([{ v: l.name, s: 'section' }, { v: '', s: 'section' }]);
    sum.push(['Money in', m(l.moneyIn)], ['Money out', m(l.moneyOut)], [{ v: 'Kept (in less out)', s: 'bold' }, { v: (l.moneyIn - l.moneyOut) / 100, s: 'moneyBold' }], []);
    sum.push([{ v: 'Money in, by category', s: 'head' }, { v: 'Amount', s: 'head' }], ...l.inBy.map((r) => [r.name, m(r.amount)]), []);
    sum.push([{ v: 'Money out, by category', s: 'head' }, { v: 'Amount', s: 'head' }], ...l.outBy.map((r) => [r.name, m(r.amount)]), []);
  }
  if (report.loans.length) {
    sum.push([{ v: 'Loans', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }, { v: '', s: 'section' }]);
    sum.push(['Loan', 'Paid', 'Interest', 'Principal'].map((v) => ({ v, s: 'head' })));
    for (const l of report.loans) sum.push([l.name, m(l.paid), m(l.interest), m(l.principal)]);
    sum.push([{ v: LOAN_NOTE, s: 'note' }]);
  }
  const head = ['Date', 'Account', 'For', 'Description', 'Category', 'Money in', 'Money out', 'Counted in totals', 'Note'].map((v) => ({ v, s: 'head' }));
  const rows = report.rows.map((r) => [
    { v: r.date, date: true },
    { v: r.account, s: 'wrap' },
    r.lane,
    { v: r.description, s: 'wrap' },
    { v: r.category, s: 'wrap' },
    r.moneyIn ? m(r.moneyIn) : '',
    r.moneyOut ? m(r.moneyOut) : '',
    counted(r) ? 'Yes' : 'No',
    { v: r.note, s: 'wrap' },
  ]);
  const last = rows.length + 1;
  const total = (pick) => report.rows.filter(counted).reduce((t, r) => t + pick(r), 0) / 100;
  const totals = [
    { v: 'Total', s: 'section' },
    { v: '', s: 'section' },
    { v: '', s: 'section' },
    { v: '', s: 'section' },
    { v: 'Counted rows only', s: 'section' },
    { v: total((r) => r.moneyIn), s: 'moneyBold', f: `SUMIF(H2:H${last},"Yes",F2:F${last})` },
    { v: total((r) => r.moneyOut), s: 'moneyBold', f: `SUMIF(H2:H${last},"Yes",G2:G${last})` },
  ];
  return xlsxBook([
    { name: 'Summary', rows: sum, widths: [44, 18, 18, 18], grid: false },
    { name: 'Payments', rows: [head, ...rows, totals], widths: [13, 22, 12, 40, 24, 16, 16, 12, 44], freeze: 1, filter: `A1:I${last}`, landscape: true },
  ]);
}

/* The report as a PDF: totals first (by lane, then by category), the loans, then every
 * payment as a table that carries its header onto each page. */
export function toPdf(report) {
  const { period } = report;
  const L = 36;
  const R = A4.w - 36;
  const W = R - L;
  const doc = createPdf({ title: heading(period) });
  let y = 0;
  const page = () => {
    doc.newPage();
    y = 44;
  };
  const need = (h) => {
    if (y + h > A4.h - 50) page();
  };
  const money = (p) => `Rs ${Math.round(p / 100).toLocaleString('en-IN')}`;
  page();
  doc.text(L, y, heading(period), { size: 18, bold: true });
  y += 16;
  doc.text(L, y, `${fullDate(period.from)} to ${fullDate(period.to)}  |  made with Kawach on ${fullDate(report.made)}`, { size: 8.5, gray: 0.35 });
  y += 12;
  for (const line of wrap(NOTE, W, 8.5, 2)) {
    doc.text(L, y, line, { size: 8.5, gray: 0.35 });
    y += 11;
  }
  y += 6;
  const colW = (W - 24) / 2;
  const list = (x, rows, title) => {
    let yy = y;
    doc.text(x, yy, title, { size: 9, bold: true, gray: 0.25 });
    yy += 4;
    doc.rule(x, yy, x + colW);
    yy += 11;
    for (const r of rows) {
      doc.text(x, yy, fit(r.name, colW - 70, 9), { size: 9 });
      doc.text(x + colW, yy, money(r.amount), { size: 9, align: 'right' });
      yy += 12.5;
    }
    return yy;
  };
  for (const l of report.lanes) {
    need(70);
    y += 8;
    doc.text(L, y, l.name, { size: 13, bold: true });
    y += 4;
    doc.rule(L, y, R, { gray: 0.5 });
    y += 14;
    doc.text(L, y, `Money in  ${money(l.moneyIn)}`, { size: 10, bold: true });
    doc.text(L + 190, y, `Money out  ${money(l.moneyOut)}`, { size: 10, bold: true });
    doc.text(L + 380, y, `Kept  ${money(l.moneyIn - l.moneyOut)}`, { size: 10, bold: true });
    y += 18;
    // The two lists side by side, a page at a time when they are long.
    let i = 0;
    let o = 0;
    while (i < l.inBy.length || o < l.outBy.length) {
      need(40);
      const room = Math.max(1, Math.floor((A4.h - 60 - y - 20) / 12.5));
      const a = l.inBy.slice(i, i + room);
      const b = l.outBy.slice(o, o + room);
      const ya = list(L, a, i ? 'Money in (continued)' : 'Money in');
      const yb = list(L + colW + 24, b, o ? 'Money out (continued)' : 'Money out');
      y = Math.max(ya, yb) + 4;
      i += a.length;
      o += b.length;
      if (i < l.inBy.length || o < l.outBy.length) page();
    }
  }
  if (report.loans.length) {
    need(70);
    y += 8;
    doc.text(L, y, 'Loans', { size: 13, bold: true });
    y += 4;
    doc.rule(L, y, R, { gray: 0.5 });
    y += 13;
    const right = [R - 180, R - 90, R];
    doc.text(L, y, 'Loan', { size: 9, bold: true, gray: 0.25 });
    ['Paid', 'Interest', 'Principal'].forEach((h, k) => doc.text(right[k], y, h, { size: 9, bold: true, gray: 0.25, align: 'right' }));
    y += 12;
    for (const loan of report.loans) {
      need(16);
      doc.text(L, y, fit(loan.name, 250, 9), { size: 9 });
      [loan.paid, loan.interest, loan.principal].forEach((v, k) => doc.text(right[k], y, money(v), { size: 9, align: 'right' }));
      y += 12.5;
    }
    for (const line of wrap(LOAN_NOTE, W, 8, 2)) {
      doc.text(L, y + 2, line, { size: 8, gray: 0.35 });
      y += 10;
    }
  }
  // Every payment.
  const cols = [
    { k: 'date', x: L, w: 50 },
    { k: 'account', x: L + 54, w: 82 },
    { k: 'desc', x: L + 140, w: 168 },
    { k: 'cat', x: L + 312, w: 82 },
    { k: 'in', x: R - 72, w: 66, right: true },
    { k: 'out', x: R, w: 66, right: true },
  ];
  const header = () => {
    doc.fill(L, y - 9, W, 14, 0.12);
    const labels = { date: 'Date', account: 'Account', desc: 'Description', cat: 'Category', in: 'In', out: 'Out' };
    for (const c of cols) doc.text(c.right ? c.x - 3 : c.x + 2, y + 1, labels[c.k], { size: 7.5, bold: true, gray: 1, align: c.right ? 'right' : 'left' });
    y += 14;
  };
  // On the same page when there is room for a heading and a few rows, else a fresh one.
  need(110);
  y += 14;
  doc.text(L, y, `Every payment (${report.rows.length})`, { size: 13, bold: true });
  y += 18;
  header();
  const size = 7.5;
  for (const r of report.rows) {
    const desc = wrap(r.description + (r.note ? `  (${r.note})` : ''), cols[2].w, size, 3);
    const acct = wrap(r.account + (r.lane !== 'Home' ? ` (${r.lane})` : ''), cols[1].w, size, 2);
    const cat = wrap(r.category, cols[3].w, size, 2);
    const lines = Math.max(desc.length, acct.length, cat.length);
    const h = lines * 9.2 + 3.5;
    if (y + h > A4.h - 50) {
      page();
      header();
    }
    const gray = counted(r) ? 0 : 0.5;
    const draw = (c, arr) => arr.forEach((t, k) => doc.text(c.x, y + k * 9.2, t, { size, gray }));
    doc.text(cols[0].x, y, r.date, { size, gray });
    draw(cols[1], acct);
    draw(cols[2], desc);
    draw(cols[3], cat);
    if (r.moneyIn) doc.text(cols[4].x, y, money(r.moneyIn), { size, gray, align: 'right' });
    if (r.moneyOut) doc.text(cols[5].x, y, money(r.moneyOut), { size, gray, align: 'right' });
    y += h;
    doc.rule(L, y - 7.5, R, { gray: 0.88, width: 0.4 });
  }
  doc.eachPage((n, of) => {
    doc.text(L, A4.h - 28, 'Kawach', { size: 8, gray: 0.5 });
    doc.text(R, A4.h - 28, `Page ${n} of ${of}`, { size: 8, gray: 0.5, align: 'right' });
  });
  return doc.finish();
}

/* Hands a file to the person: saved to the phone's downloads. */
export function saveFile(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
