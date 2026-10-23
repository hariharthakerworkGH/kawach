// SBI's newer all-accounts statement (the PDF from OnlineSBI with "Welcome Mr. ..." on top): a summary of every account the person holds, then
// one "Transaction Details" page per account - savings, current, each loan. Only the savings account's page is a list of payments, so only
// that is read here. The deposits, the current account and the loans on the other pages are left to their own readers and screens.
//
// Its table has the columns Date, Transaction Reference, Ref.No./Chq.No., Credit, Debit, Balance, in that order (credit BEFORE debit, which
// the older SBI statement does not do), and an empty column prints as a lone "0" or "-". The general reader took the balance for the amount
// here and, finding no balance column, called the account a credit card.
export const id = 'sbi-statement';
export const accountType = 'bank';
export const issuerLabel = 'SBI';

import { DEPOSIT_MOVE_RE } from './sbi-savings.js';
import { matchedPaise as paise } from '../format.js';

// "08-09-26 SWEEP TRF CREDT - 30015.00 0 32442.50": date, narration, an optional "-" for the empty Ref column, credit, debit, balance.
const ROW_RE = /^(\d{2})-(\d{2})-(\d{2})\s+(.*?)\s+(?:-\s+)?(\d[\d,]*(?:\.\d{2})?)\s+(\d[\d,]*(?:\.\d{2})?)\s+(\d[\d,]*\.\d{2})$/;
const OPENING_RE = /Your Opening Balance on (\d{2})-(\d{2})-(\d{2})\s*:\s*(?:null\s+null\s+)?([\d,]+\.\d{2})/i;
const CLOSING_RE = /Your Closing Balance on (\d{2})-(\d{2})-(\d{2})\s*:\s*([\d,]+\.\d{2})/i;

export function detect(text) {
  return /TRANSACTION OVERVIEW/.test(text) && /Your Opening Balance on/i.test(text) && /Multi-Option Deposit Balance/i.test(text) && /SBIN\d{7}/.test(text);
}

const iso = (d, m, y) => `20${y}-${m}-${d}`;

export function parse(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // The savings page: from the line "SAVING ACCOUNT" to the next account's page.
  const start = lines.findIndex((l, i) => /^SAVING ACCOUNT$/i.test(l) && /^X+\d{4}$/i.test(lines[i + 1] || ''));
  const meta = { accountLast4: null, reconciled: null };
  if (start < 0) return { rows: [], meta };
  meta.accountLast4 = lines[start + 1].slice(-4);
  let stop = lines.findIndex((l, i) => i > start && /^TRANSACTION DETAILS$/i.test(l));
  if (stop < 0) stop = lines.length;
  const page = lines.slice(start, stop);

  const rows = [];
  for (const line of page) {
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const credit = paise(m[5]);
    const debit = paise(m[6]);
    const description = m[4].replace(/(^|\s)-(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    const row = {
      date: iso(m[1], m[2], m[3]),
      description,
      amount: credit || debit,
      direction: credit ? 'credit' : 'debit',
      ref: null,
    };
    // Money into or out of the account's own deposits is moving between your own money, never spending or income.
    if (DEPOSIT_MOVE_RE.test(description)) row.isTransfer = true;
    rows.push(row);
  }

  const opening = OPENING_RE.exec(page.join('\n'));
  const closing = CLOSING_RE.exec(page.join('\n'));
  if (opening) meta.periodStart = iso(opening[1], opening[2], opening[3]);
  if (closing) meta.periodEnd = iso(closing[1], closing[2], closing[3]);
  if (opening && closing) {
    const sum = (dir) => rows.filter((r) => r.direction === dir).reduce((s, r) => s + r.amount, 0);
    meta.impliedOpeningBalance = paise(opening[4]) / 100;
    meta.statedClosingBalance = paise(closing[4]) / 100;
    meta.computedClosingBalance = (paise(opening[4]) + sum('credit') - sum('debit')) / 100;
    meta.reconciled = meta.computedClosingBalance === meta.statedClosingBalance;
    meta.rowCount = rows.length;
  }
  return { rows, meta };
}
