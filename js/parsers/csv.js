// Any bank's statement saved as CSV (or Excel saved as CSV).
//
// Nearly every bank lets you download a statement as a spreadsheet, but no
// two lay it out alike - so instead of a format per bank, the columns are
// worked out from the header row: which one holds the date, the description,
// the money out, the money in (or a single amount with Dr/Cr), the reference
// and the balance. Rows above the header (the bank's letterhead) and below
// the table (totals, footnotes) are skipped.
//
// Not listed in the PDF registry: a CSV is chosen on the import screen, and
// the account it belongs to is always picked by you in the review, since a
// spreadsheet rarely says which account it's for.
export const id = 'csv';
export const issuerLabel = 'Spreadsheet';
export const pickAccount = true;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const HEADERS = {
  date: /^(txn\.?\s*|transaction\s*|tran\s*|posting\s*|value\s*)?date$|^date$/i,
  description: /narration|description|particulars|details|remarks|transaction\s*details/i,
  debit: /withdrawal|debit|^dr\.?$|money\s*out|paid\s*out/i,
  credit: /deposit|credit|^cr\.?$|money\s*in|paid\s*in/i,
  amount: /^(transaction\s*)?amount(\s*\(.*\))?$|^amt\.?$/i,
  type: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|debit\s*\/\s*credit)$/i,
  ref: /ref|chq|cheque/i,
  balance: /balance/i,
};

// Splits CSV text into rows of cells, honouring quotes. The delimiter is
// whichever of comma, semicolon or tab is most common in the first lines.
export function readCsv(text) {
  const clean = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const sample = clean.split('\n').slice(0, 20).join('\n');
  const delimiter = [',', ';', '\t'].map((d) => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

// The header row and which column plays which part.
export function findColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cols = {};
    rows[i].forEach((cell, index) => {
      const name = cell.replace(/\s+/g, ' ').trim();
      for (const [role, re] of Object.entries(HEADERS)) {
        if (cols[role] != null || !re.test(name)) continue;
        // "Value Date" only stands in for the date when there's no other.
        if (role === 'date' && /value/i.test(name) && rows[i].some((c) => /^(txn\.?\s*|transaction\s*)?date$/i.test(c.trim()))) continue;
        // A "Debit/Credit" type column is not a money column.
        if ((role === 'debit' || role === 'credit') && HEADERS.type.test(name)) continue;
        cols[role] = index;
        break;
      }
    });
    const hasMoney = (cols.debit != null && cols.credit != null) || cols.amount != null;
    if (cols.date != null && cols.description != null && hasMoney) return { headerRow: i, cols };
  }
  return null;
}

export function detect(text) {
  return findColumns(readCsv(text)) != null;
}

// "1,234.50", "-1234.5", "(1,234.50)", "1234.50 Dr", "₹1,234" -> paise, sign
// dropped (the direction is worked out separately).
function toPaise(value) {
  const s = String(value || '')
    .replace(/₹|INR|Rs\.?/gi, '')
    .replace(/,/g, '')
    .trim()
    .replace(/\s*(dr|cr)\.?$/i, '')
    .replace(/^\((.*)\)$/, '$1')
    .replace(/^[-+]/, '')
    .trim();
  const m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(((m[2] || '') + '00').slice(0, 2));
}

// dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, 12 Sep 2026, 12-Sep-26. Numeric dates are
// read day-first, as Indian banks write them, unless the file itself proves
// otherwise (a "day" over 12 in the second place).
export function parseDate(value, monthFirst = false) {
  const s = String(value || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return monthFirst ? iso(year, m[1], m[2]) : iso(year, m[2], m[1]);
  }
  m = s.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[a-z]*[\s/,-]+(\d{2}|\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(m[3].length === 2 ? `20${m[3]}` : m[3], MONTHS[m[2].toLowerCase()], m[1]);
  return null;
}

function iso(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  if (!year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parse(text) {
  const table = readCsv(text);
  const found = findColumns(table);
  if (!found) return { rows: [], meta: { reconciled: null } };
  const { headerRow, cols } = found;
  const body = table.slice(headerRow + 1);

  // Month-first only if some date's second number can't be a month.
  const monthFirst = body.some((r) => {
    const m = String(r[cols.date] || '').match(/^(\d{1,2})[/.-](\d{1,2})[/.-]/);
    return m && Number(m[2]) > 12;
  });

  const rows = [];
  let skipped = 0;
  const balances = [];
  for (const r of body) {
    const date = parseDate(r[cols.date], monthFirst);
    const description = String(r[cols.description] || '').replace(/\s+/g, ' ').trim();
    let amount = null;
    let direction = null;
    if (cols.debit != null && cols.credit != null) {
      const out = toPaise(r[cols.debit]);
      const inn = toPaise(r[cols.credit]);
      if (out) {
        amount = out;
        direction = 'debit';
      } else if (inn) {
        amount = inn;
        direction = 'credit';
      }
    } else if (cols.amount != null) {
      const raw = String(r[cols.amount] || '');
      amount = toPaise(raw);
      const type = cols.type != null ? String(r[cols.type] || '') : '';
      if (/^\s*(dr|debit|d)\b/i.test(type) || /dr\s*$/i.test(raw) || /^\s*-|^\s*\(/.test(raw)) direction = 'debit';
      else if (/^\s*(cr|credit|c)\b/i.test(type) || /cr\s*$/i.test(raw)) direction = 'credit';
      else direction = 'debit'; // a plain amount with no sign is money out, as on card exports
    }
    // Totals, blank lines and footnotes have no date or no amount.
    if (!date || !amount || !description) {
      if (r.some((c) => c)) skipped++;
      continue;
    }
    const refCell = cols.ref != null ? String(r[cols.ref] || '').replace(/\s+/g, '') : '';
    rows.push({ date, description, amount, direction, ref: /^\d{6,}$/.test(refCell) ? refCell : null });
    if (cols.balance != null) {
      const b = toPaise(r[cols.balance]);
      if (b != null) balances.push({ date, balance: b, negative: /^\s*-|dr\s*$/i.test(String(r[cols.balance] || '')) });
    }
  }

  const dates = rows.map((r) => r.date).sort();
  // The closing balance is the last row's when the file runs oldest to
  // newest, the first row's when it runs newest to oldest.
  let closing = null;
  if (balances.length) {
    const newestFirst = balances.length > 1 && balances[0].date > balances[balances.length - 1].date;
    const last = newestFirst ? balances[0] : balances[balances.length - 1];
    closing = (last.negative ? -last.balance : last.balance) / 100;
  }
  return {
    rows,
    meta: {
      periodStart: dates[0] || null,
      periodEnd: dates[dates.length - 1] || null,
      statedClosingBalance: closing,
      skippedRows: skipped,
      columns: Object.keys(cols),
      reconciled: null,
    },
  };
}
