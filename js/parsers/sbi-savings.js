// An SBI savings account statement (the PDF from YONO or OnlineSBI).
//
// Besides the transactions it carries something no spreadsheet download
// has: the fixed deposits linked to the account. SBI's MOD (multi option
// deposit) moves spare money out of savings into deposits on its own and
// breaks them again when an EMI needs paying, so the savings balance alone
// badly understates what is actually there. The statement prints it twice:
// "+MOD Bal : 1,65,000.00CR" under the account, and a "Fixed Deposits" line
// in the relationship summary with a second figure beside it (read here as
// what the deposits come to at maturity - for loans the same column holds
// the sanctioned amount, i.e. the "full" figure).
//
// The table: each transaction is a dated line (post date, value date, then
// Debit, Credit and Balance at the end), with one line of description above
// it and the rest below, until the next transaction's line above. A summary
// at the end gives the opening and closing balance and how many debits and
// credits there were, which is how the reading is checked.
export const id = 'sbi-savings';
export const accountType = 'bank';
export const issuerLabel = 'SBI';

const ROW_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}\/\d{2}\/\d{4}\s*(.*?)\s*(-|[\d,]+\.\d{2})\s+(-|[\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*(?:CR|DR)?\s*$/;
// The end of a description: the branch it was done at ("60070 RAJKOT,
// GYMKHANA", or "... AT 60070 RAJKOT"). When it sits on its own line just
// above the next row it still belongs to the row before, not the next one.
const TAIL_RE = /^(?:.*\bAT\s+)?\d{5}\s+[A-Z][A-Z .,]*$/i;
// Money into or out of a deposit linked to this account. A sweep is SBI's own
// wording for its MOD deposits; "FIRDFTFRREF" is how SBI prints a transfer
// made by hand from the account into a new deposit, which the owner of a MOD
// account does every month. Exported so the same reading can be applied to
// lines saved before this rule existed (js/transfers.js).
export const DEPOSIT_MOVE_RE = /\bSWEEP\s+(?:TFR|TRF)\b|FIRDFTFRREF/i;
// Page furniture that turns up between rows and belongs to no transaction.
const NOISE_RE = /^(Page no\.?\s*\d+|Balance|Post Date|Value Date|Details|Ref No\/?Cheque|Debit|Credit)$|Post Date\s+Value Date/i;

export function detect(text) {
  return /SBIN\d{7}/.test(text) && /Clear Balance/i.test(text) && /Statement Summary/i.test(text) && !/Loan Term/i.test(text);
}

const amount = (s) => (s === '-' ? 0 : Math.round(Number(String(s).replace(/,/g, '')) * 100));

export function parse(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const end = lines.findIndex((l) => /Statement Summary/i.test(l));
  const table = end >= 0 ? lines.slice(0, end) : lines;
  const dated = [];
  table.forEach((line, i) => {
    if (ROW_RE.test(line)) dated.push(i);
  });

  // One line above a row belongs to it, unless that line is the end of the
  // row before (its branch).
  const ownsAbove = (at) => at > 0 && !ROW_RE.test(table[at - 1]) && !TAIL_RE.test(table[at - 1]);
  const rows = dated.map((at, k) => {
    const m = ROW_RE.exec(table[at]);
    // The line above (when it is this row's) and everything below up to the
    // next row's own line above.
    const above = ownsAbove(at) ? [table[at - 1]] : [];
    const stop = k + 1 < dated.length ? dated[k + 1] - (ownsAbove(dated[k + 1]) ? 1 : 0) : table.length;
    const below = table.slice(at + 1, stop);
    const description = [...above, m[4], ...below]
      .filter((l) => l && l !== '-' && !NOISE_RE.test(l))
      .join(' ')
      // The empty Ref column prints as a lone "-" in the middle of the text.
      .replace(/(^|\s)-(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const debit = amount(m[5]);
    const credit = amount(m[6]);
    const row = {
      date: `${m[3]}-${m[2]}-${m[1]}`,
      description,
      amount: credit || debit,
      direction: credit ? 'credit' : 'debit',
      ref: null,
      _balance: amount(m[7]),
    };
    // Money put into a deposit and swept back is moving between your own
    // accounts at the same bank, never spending or income.
    if (DEPOSIT_MOVE_RE.test(description)) row.isTransfer = true;
    return row;
  });
  // Money sent to a deposit this statement also sweeps money back from (by
  // its 13-digit number) was put into that deposit, whatever the wording.
  const numbers = (row) => row.description.match(/\b\d{13}\b/g) || [];
  const deposits = new Set(rows.filter((r) => /SWEEP\s+(?:TFR|TRF)/i.test(r.description)).flatMap(numbers));
  for (const row of rows) {
    if (row.direction === 'debit' && numbers(row).some((n) => deposits.has(n))) row.isTransfer = true;
  }

  const meta = { accountLast4: null, reconciled: null };
  const accountNo = (text.match(/Account Number\s*:\s*(\d{9,})/i) || [])[1];
  if (accountNo) meta.accountLast4 = accountNo.slice(-4);

  const period = /Statement Summary\s*:?\s*(\d{2})-(\d{2})-(\d{4})\s*To\s*(\d{2})-(\d{2})-(\d{4})/i.exec(text);
  if (period) {
    meta.periodStart = `${period[3]}-${period[2]}-${period[1]}`;
    meta.periodEnd = `${period[6]}-${period[5]}-${period[4]}`;
  }

  // The summary's figures: opening, debit count, credit count, total debit,
  // total credit, closing.
  const summary = /([\d,]+\.\d{2})(?:CR|DR)?\s+(\d+)\s+(\d+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})(CR|DR)?/.exec(lines.slice(end >= 0 ? end : 0).join('\n'));
  const closingPrinted = /Clear Balance\s*:\s*([\d,]+\.\d{2})/i.exec(text);
  if (summary) {
    const opening = amount(summary[1]);
    const debits = amount(summary[4]);
    const credits = amount(summary[5]);
    const closing = amount(summary[6]);
    const sum = (dir) => rows.filter((r) => r.direction === dir).reduce((s, r) => s + r.amount, 0);
    const counted = {
      debits: rows.filter((r) => r.direction === 'debit').length,
      credits: rows.filter((r) => r.direction === 'credit').length,
    };
    meta.reconciled =
      counted.debits === Number(summary[2]) && counted.credits === Number(summary[3]) && sum('debit') === debits && sum('credit') === credits && opening + credits - debits === closing;
    meta.impliedOpeningBalance = opening / 100;
    meta.statedClosingBalance = closing / 100;
    meta.computedClosingBalance = (opening + sum('credit') - sum('debit')) / 100;
    meta.rowCount = rows.length;
  } else if (closingPrinted) {
    meta.statedClosingBalance = amount(closingPrinted[1]) / 100;
  }

  // The deposits linked to this account.
  const mod = /\+?MOD Bal\s*:\s*([\d,]+\.\d{2})/i.exec(text);
  const fd = /Fixed Deposits\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i.exec(text);
  const principal = mod ? amount(mod[1]) : fd ? amount(fd[1]) : 0;
  if (principal > 0) {
    meta.deposit = {
      kind: mod ? 'MOD' : 'FD',
      balance: principal,
      atMaturity: fd && amount(fd[1]) === principal ? amount(fd[2]) : null,
      asOf: meta.periodEnd || null,
    };
  }

  return { rows: rows.map(({ _balance, ...rest }) => rest), meta };
}
