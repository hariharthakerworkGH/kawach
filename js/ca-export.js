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
import { isLoanAccount, loanPayments, assignLoanPayments, loanHistory } from './loans.js';
import { isCardBill } from './transfers.js';
import { xlsxBook } from './xlsx.js';
import { buildTaxPack, STILL_TO_GET } from './tax-pack.js';
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
export function buildCaReport({ transactions, accounts, categories, people = [], businesses = [], recurring = [], period, today }) {
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
        accountType: account ? account.type : t.accountId === 'cash' ? 'cash' : '',
        categoryName: catName(t.categoryId),
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
      return { name: a.label, paid: paid.reduce((s, p) => s + p.amount, 0), interest: paid.reduce((s, p) => s + p.interest, 0), principal: paid.reduce((s, p) => s + p.principal, 0), count: paid.length, fromStatement: paid.some((p) => p.fromStatement), underConstruction: Boolean(loanHistory(a) && loanHistory(a).underConstruction) };
    })
    .filter((l) => l.count > 0);

  const pack = buildTaxPack({ rows, accounts, transactions, recurring, period, today, loans });
  return { period, made: today, rows, lanes: laneList, loans, pack, moved: rows.filter((r) => r.t.isTransfer).reduce((s, r) => s + r.moneyIn + r.moneyOut, 0) };
}

export async function caReport(period) {
  const [transactions, accounts, categories, people, businesses, recurring] = await Promise.all([
    getAll('transactions'),
    getAll('accounts'),
    getAll('categories'),
    getSetting('people', []),
    getSetting('businesses', []),
    getAll('recurring'),
  ]);
  return buildCaReport({ transactions, accounts, categories, people, businesses: Array.isArray(businesses) ? businesses : [], recurring, period, today: isoLocal(new Date()) });
}

const heading = (period) => `Money for ${period.label.replace(/ so far$/, '').replace(/^Financial year/, 'the financial year')}`;
const NOTE = 'Money moved between your own accounts, and card bill payments (the purchases are counted on the card), are listed but left out of the totals.';
const counted = (r) => !r.t.isTransfer && !r.bill;

/* A table of the tax pack as sheet rows: a section bar, its note, the headings, the rows and a total. A cell that is
 * { paise } is money, { date } a real date, anything else text or a count. */
const sheetCell = (c, style) => (c && typeof c === 'object' ? ('paise' in c ? { v: c.paise / 100, s: style || 'money' } : { v: c.date, date: true }) : typeof c === 'string' ? { v: c, s: 'wrap' } : c);
function tableRows(t, width) {
  const bar = [{ v: t.title, s: 'section' }, ...Array.from({ length: width - 1 }, () => ({ v: '', s: 'section' }))];
  const out = [bar, [{ v: t.note, s: 'note' }], t.head.map((v) => ({ v, s: 'head' })), ...t.rows.map((r) => r.map((c) => sheetCell(c)))];
  if (t.total && t.rows.length) out.push(t.total.map((c, i) => (i === 0 ? { v: c, s: 'bold' } : sheetCell(c, 'moneyBold'))));
  if (!t.rows.length) out.push([{ v: 'Nothing found for this period.', s: 'note' }]);
  out.push([]);
  return out;
}

// A bank's reference number (a UPI or NEFT one) is the thing a CA matches a payment to the bank's own book by.
const refOf = (text) => ((text || '').match(/\b(\d{12})\b/) || (text || '').match(/\b(?:UTR|REF|CHQ|CHEQUE)[#:\s.-]*([A-Z0-9]{6,})/i) || [, ''])[1];
// What the entry would be called in a set of books: money in is a receipt, money out a payment, and money moved between your own accounts a contra.
const voucherOf = (r) => (r.t.isTransfer ? 'Contra' : r.moneyIn ? 'Receipt' : 'Payment');

/* The workbook, in the order a CA works through it: where to start, the income by kind, the deductions and tax paid, the
 * business if there is one, where the accounts stood on the last day, spending, and then every payment with
 * real dates and numbers, a voucher type and reference for the accountant's books, and totals that add only what counts. */
export function toXlsx(report) {
  const { period, pack } = report;
  const m = (v) => ({ v: v / 100, s: 'money' });
  const fy = /^fy-(\d{4})$/.exec(period.id);
  const sheets = [];

  const start = [[{ v: heading(period), s: 'title' }], [{ v: `${fullDate(period.from)} to ${fullDate(period.to)}, made with Kawach on ${fullDate(report.made)}`, s: 'note' }]];
  if (fy) start.push([{ v: `Assessment year ${Number(fy[1]) + 1}-${String(Number(fy[1]) + 2).slice(2)}: the year this income is returned in`, s: 'note' }]);
  start.push([{ v: NOTE, s: 'note' }], [{ v: 'Kawach works out no tax and files nothing. This is a first sort of your own records, for you and your CA to check.', s: 'note' }], []);
  start.push([{ v: 'In this file', s: 'section' }, { v: '', s: 'section' }]);
  const index = [['Income', 'Money in, sorted by kind the way a return is: salary, interest, dividends, rent, business and the rest'], ['Deductions and tax', 'Payments that may be deductions, loan interest and principal, tax you paid yourself, rent paid, and money sent to shares or mutual funds']];
  if (pack.business.length) index.push(['Business', 'Each business month by month: money in by bank or UPI and by cash, money out, GST paid']);
  index.push(['Year end', 'Where each account stood on the last day'], ['Spending', 'Money in and out by Kawach category'], ['Ledger', 'Every payment, one row each, with a voucher type and bank reference. Filter it, or map its columns when importing to accounting software such as Tally']);
  for (const [a, b] of index) start.push([{ v: a, s: 'bold' }, { v: b, s: 'wrap' }]);
  start.push([], [{ v: 'Still to get from elsewhere', s: 'section' }, { v: '', s: 'section' }]);
  for (const [a, b] of STILL_TO_GET) start.push([{ v: a, s: 'bold' }, { v: b, s: 'wrap' }]);
  if (pack.moved) start.push([], [{ v: 'To look at', s: 'section' }, { v: '', s: 'section' }], [{ v: `${pack.moved} payment${pack.moved === 1 ? '' : 's'} in match${pack.moved === 1 ? 'es' : ''} an amount that left another of your accounts within 3 days. They look like your own money going round, and are shown apart from income. Filter the Ledger sheet for "Maybe moved".`, s: 'wrap' }]);
  sheets.push({ name: 'Start here', rows: start, widths: [38, 100], grid: false });

  sheets.push({ name: 'Income', rows: [...tableRows(pack.income, 4), ...report.lanes.flatMap((l) => [[{ v: `${l.name}: money in less money out`, s: 'bold' }, '', { v: (l.moneyIn - l.moneyOut) / 100, s: 'money' }]])], widths: [38, 10, 20, 90], grid: false });
  sheets.push({ name: 'Deductions and tax', rows: [...tableRows(pack.proofs, 5), ...tableRows(pack.loans, 5), ...tableRows(pack.paid, 5), ...tableRows(pack.rent, 5), ...tableRows(pack.invest, 5)], widths: [48, 16, 20, 20, 70], grid: false });
  if (pack.business.length) sheets.push({ name: 'Business', rows: pack.business.flatMap((b) => [...tableRows(b, 5), [{ v: `Cash was ${b.cashShare}% of the money in.`, s: 'bold' }], []]), widths: [16, 24, 20, 20, 16], grid: false });
  sheets.push({ name: 'Year end', rows: tableRows(pack.balances, 3), widths: [34, 60, 22], grid: false });

  const spend = [];
  for (const l of report.lanes) {
    spend.push([{ v: l.name, s: 'section' }, { v: '', s: 'section' }]);
    spend.push(['Money in', m(l.moneyIn)], ['Money out', m(l.moneyOut)], [{ v: 'Kept (in less out)', s: 'bold' }, { v: (l.moneyIn - l.moneyOut) / 100, s: 'moneyBold' }], []);
    spend.push([{ v: 'Money in, by category', s: 'head' }, { v: 'Amount', s: 'head' }], ...l.inBy.map((r) => [r.name, m(r.amount)]), []);
    spend.push([{ v: 'Money out, by category', s: 'head' }, { v: 'Amount', s: 'head' }], ...l.outBy.map((r) => [r.name, m(r.amount)]), []);
  }
  sheets.push({ name: 'Spending', rows: spend, widths: [44, 18], grid: false });

  const head = ['Date', 'Account', 'For', 'Voucher type', 'Narration', 'Reference', 'Withdrawal', 'Deposit', 'Kawach category', 'Kind', 'Counted in totals', 'Note'].map((v) => ({ v, s: 'head' }));
  const rows = report.rows.map((r) => [
    { v: r.date, date: true },
    { v: r.account, s: 'wrap' },
    r.lane,
    voucherOf(r),
    { v: r.description, s: 'wrap' },
    refOf(r.description),
    r.moneyOut ? m(r.moneyOut) : '',
    r.moneyIn ? m(r.moneyIn) : '',
    { v: r.category, s: 'wrap' },
    { v: r.head, s: 'wrap' },
    counted(r) ? 'Yes' : 'No',
    { v: r.note, s: 'wrap' },
  ]);
  const last = rows.length + 1;
  const total = (pick) => report.rows.filter(counted).reduce((t, r) => t + pick(r), 0) / 100;
  const blank = { v: '', s: 'section' };
  const totals = [{ v: 'Total', s: 'section' }, blank, blank, blank, { v: 'Counted rows only', s: 'section' }, blank,
    { v: total((r) => r.moneyOut), s: 'moneyBold', f: `SUMIF(K2:K${last},"Yes",G2:G${last})` },
    { v: total((r) => r.moneyIn), s: 'moneyBold', f: `SUMIF(K2:K${last},"Yes",H2:H${last})` },
  ];
  sheets.push({ name: 'Ledger', rows: [head, ...rows, totals], widths: [13, 22, 12, 12, 44, 16, 16, 16, 24, 34, 12, 44], freeze: 1, filter: `A1:L${last}`, landscape: true });
  return xlsxBook(sheets);
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
  // The tax pack, a table at a time: the first column is text, the others are counts, money or short text.
  const tables = [report.pack.income, report.pack.proofs, report.pack.loans, report.pack.paid, report.pack.rent, report.pack.invest, ...report.pack.business, report.pack.balances];
  for (const t of tables) {
    need(60);
    y += 8;
    doc.text(L, y, t.title, { size: 13, bold: true });
    y += 4;
    doc.rule(L, y, R, { gray: 0.5 });
    y += 12;
    for (const line of wrap(t.note, W, 8, 3)) {
      doc.text(L, y, line, { size: 8, gray: 0.35 });
      y += 10;
    }
    y += 4;
    if (!t.rows.length) {
      doc.text(L, y, 'Nothing found for this period.', { size: 8, gray: 0.35 });
      y += 14;
      continue;
    }
    // Text columns share what the numbers do not need: counts and money get 70 points, a date 52.
    const kind = (c) => (c && typeof c === 'object' ? ('paise' in c ? 'money' : 'date') : typeof c === 'number' ? 'count' : 'text');
    // A column is what its first filled cell is: a policy row leaves the count empty, a balance may say "ask the bank" instead of money.
    const colKind = t.head.map((_, k) => kind(k ? t.rows.map((r) => r[k]).find((c) => typeof c === 'number' || (c && typeof c === 'object')) ?? '' : ''));
    const widths = colKind.map((kd) => ({ money: 70, count: 38, date: 52, text: 0 })[kd]);
    const free = (W - widths.reduce((s, w) => s + w, 0)) / Math.max(1, widths.filter((w) => !w).length);
    const w = widths.map((x) => (x || free) - 6);
    const at = [];
    widths.reduce((x, wd, k) => ((at[k] = x), x + (wd || free)), L);
    const rightCol = (k) => colKind[k] === 'money' || colKind[k] === 'count';
    const draw = (cells, bold) => {
      const lines = cells.map((c, k) => {
        const txt = c && typeof c === 'object' ? ('paise' in c ? money(c.paise) : fullDate(c.date)) : String(c);
        return rightCol(k) ? [txt] : wrap(txt, w[k], 8, 4);
      });
      const h = Math.max(...lines.map((l) => l.length)) * 9.6 + 3;
      need(h + 4);
      lines.forEach((ls, k) => ls.forEach((txt, j) => doc.text(rightCol(k) ? at[k] + w[k] : at[k], y + j * 9.6, txt, { size: 8, bold, align: rightCol(k) ? 'right' : 'left' })));
      y += h;
    };
    doc.fill(L, y - 9, W, 13, 0.12);
    t.head.forEach((h, k) => doc.text(at[k] + (rightCol(k) ? w[k] : 2), y + 1, h, { size: 7.5, bold: true, gray: 1, align: rightCol(k) ? 'right' : 'left' }));
    y += 14;
    for (const row of t.rows) draw(row, false);
    if (t.total && t.rows.length) draw(t.total, true);
    if (typeof t.cashShare === 'number') {
      doc.text(L, y, `Cash was ${t.cashShare}% of the money in.`, { size: 8.5, bold: true });
      y += 12;
    }
  }
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
