// An SBI loan account statement (home loan, car loan).
//
// Unlike the other readers this one isn't after transactions: what matters on
// a loan is the summary the bank prints at the top - what's still owed, the
// rate, the EMI, how many months are left - because that is what says when the
// loan ends and how much of the monthly budget it takes.
//
// The EMI actually leaving the account can be more than the EMI the bank
// prints (paying a round ₹23,000 against an EMI of ₹22,256 shortens the loan),
// so the payment rows are read too and the larger, most recent amount wins.
export const id = 'sbi-loan';
export const accountType = 'loan';
export const issuerLabel = 'SBI';

// SBI's summary is laid out in two columns, so a value can end up either
// after its label ("Outstanding Amount : 31,00,000.00") or on the line before
// it ("45,00,000.00 \n Sanctioned Amount :"). Both are tried.
const FIELD = (label) => new RegExp(`${label}\\s*:?\\s*([\\d,]+(?:\\.\\d{1,2})?)`, 'i');
const FIELD_ABOVE = (label) => new RegExp(`([\\d,]+(?:\\.\\d{1,2})?)\\s*\\n\\s*${label}`, 'i');
const ROW_RE = /(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.*?)\s+([\d,]+\.\d{2})\s*$/;
// One line of the statement's table: post date, value date, whatever of the
// description landed on this line, then the Debit and Credit columns ("-" when
// empty). Now and then the Balance column is glued on the end
// ("- 86,160.00 - 86,160.00DR"), so it is allowed and ignored - but only
// with its DR/CR stuck to it, or "- - 23,000.00" would read as two empty
// columns and a balance, and every payment would vanish.
const LEDGER_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}\/\d{2}\/\d{4}\s*(.*?)\s*(-|[\d,]+\.\d{2})\s+(-|[\d,]+\.\d{2})(?:\s*[\d,]+\.\d{2}(?:DR|CR))?\s*$/;

// The whole history of the loan, from the table.
//
// SBI puts every event on the loan in one list, and the Debit column is
// money added to what you owe while Credit is money paid off it:
//   - interest: "PART PERIOD INTEREST", charged at each month end. This is
//     the interest the bank really charged - no estimate is as good.
//   - release: money paid out of the loan to the builder ("ADVANCE: LOAN TO
//     GL AS PRINCIPAL NEFT ...", or "DEBIT TRANSFER" to the builder's
//     account). While a flat is being built the loan is released in parts,
//     and what is owed only makes sense against what has been released so
//     far, not the amount sanctioned.
//   - payment: any credit - your EMIs, pre-EMI interest, prepayments.
//   - rate: "RATE CHANGED FM 8.000% TO 7.750%", with no amount.
// The description is spread over the lines around the dated one, so a few
// lines either side are read to tell a release from anything else.
function readLedger(text) {
  const lines = text.split('\n').map((l) => l.trim());
  const amount = (s) => (s === '-' ? 0 : Math.round(Number(s.replace(/,/g, '')) * 100));
  const ledger = [];
  lines.forEach((line, i) => {
    const m = LEDGER_RE.exec(line);
    if (!m) return;
    const date = `${m[3]}-${m[2]}-${m[1]}`;
    const debit = amount(m[5]);
    const credit = amount(m[6]);
    const around = lines.slice(Math.max(0, i - 3), i + 2).join(' ');
    if (credit) {
      ledger.push({ date, kind: 'payment', amount: credit });
    } else if (debit) {
      // Interest is always named on its own line; checking that first stops
      // a release next to it from being read as interest, or the other way.
      if (/INTEREST/i.test(m[4])) ledger.push({ date, kind: 'interest', amount: debit });
      else ledger.push({ date, kind: /ADVANCE|DISB|PRINCIPAL NEFT|DEBIT TRANSFER/i.test(around) ? 'release' : 'charge', amount: debit });
    } else {
      // "RATE CHANGED FM 8.000% TO" sits on the line above the dates and the
      // new rate, "7.750%", on the line below them.
      const from = /RATE CHANGED FM\s*([\d.]+)%/i.exec(lines[i - 1] || '');
      if (from) {
        const to = /^([\d.]+)%/.exec(lines[i + 1] || '');
        ledger.push({ date, kind: 'rate', from: Number(from[1]), to: to ? Number(to[1]) : null });
      }
    }
  });
  return ledger.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function detect(text) {
  return /State Bank of India/i.test(text) && /Loan Term/i.test(text) && /Outstanding Amount/i.test(text);
}

export function parse(text) {
  const money = (label) => {
    const m = text.match(FIELD(label)) || text.match(FIELD_ABOVE(label));
    return m ? Math.round(Number(m[1].replace(/,/g, '')) * 100) : null;
  };
  const months = (label) => {
    const m = text.match(new RegExp(`${label}\\s*:?\\s*(\\d+)\\s*Months`, 'i'));
    return m ? Number(m[1]) : null;
  };

  const accountNo = (text.match(/Account No\s*:?\s*(\d{6,})/i) || [])[1] || null;
  const rate = (text.match(/Rate of Interest\s*:?\s*([\d.]+)\s*%/i) || [])[1];
  const product = (text.match(/Product\s*:?\s*([A-Za-z ]+?)(?:\s*\n|\s{2,}|$)/i) || [])[1];
  const opened = (text.match(/Account open Date\s*:?\s*(\d{2})-(\d{2})-(\d{4})/i) || []).slice(1);
  const statementDate = (text.match(/Date of Statement\s*:?\s*(\d{2})-(\d{2})-(\d{4})/i) || []).slice(1);

  // Payments: the money that left the funding account, newest first.
  const payments = [];
  for (const line of text.split('\n')) {
    const m = ROW_RE.exec(line.trim());
    if (!m || !/TRANSFER|EMI|INSTAL/i.test(m[4])) continue;
    payments.push({ date: `${m[3]}-${m[2]}-${m[1]}`, amount: Math.round(Number(m[5].replace(/,/g, '')) * 100) });
  }
  payments.sort((a, b) => (a.date < b.date ? 1 : -1));
  const printedEmi = money('EMI');
  const lastPayment = payments[0] ? payments[0].amount : null;
  const ledger = readLedger(text);
  const releases = ledger.filter((e) => e.kind === 'release');

  return {
    rows: [],
    meta: {
      accountLast4: accountNo ? accountNo.slice(-4) : null,
      accountNo,
      loan: {
        principal: money('Sanctioned Amount'),
        outstanding: money('Outstanding Amount'),
        outstandingAsOf: statementDate.length ? `${statementDate[2]}-${statementDate[1]}-${statementDate[0]}` : null,
        ratePct: rate ? Number(rate) : null,
        // What actually goes out each month, which is what the budget feels.
        emi: lastPayment && printedEmi && lastPayment >= printedEmi ? lastPayment : printedEmi || lastPayment,
        printedEmi,
        day: payments[0] ? Number(payments[0].date.slice(8, 10)) : null,
        totalEmis: months('Loan Term'),
        monthsLeft: months('Remaining Tenure'),
        startMonth: opened.length ? `${opened[2]}-${opened[1]}` : null,
        product: product ? product.trim() : 'Loan',
        paidFromId: null,
        // Only when the statement's own table was read. A loan with none of
        // these is worked out the old way, from the payments the app sees.
        ...(ledger.length
          ? {
              released: releases.reduce((s, e) => s + e.amount, 0),
              ledger,
            }
          : {}),
      },
      paymentsSeen: payments.length,
    },
  };
}
