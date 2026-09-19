// A salary slip.
//
// What the app takes from it: the month, what was actually paid into the bank
// (which is the salary the whole budget is built on), and the provident fund
// deducted. Payslips differ from company to company, so this reads the labels
// rather than fixed positions, and anything it can't find is simply left out
// for you to fill in.
export const id = 'payslip';
export const accountType = 'payslip';
export const issuerLabel = 'Payslip';

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

export function detect(text) {
  return /pay\s*slip|payslip|salary\s*slip/i.test(text) && /(NET\s*PAY|NET\s*SALARY)/i.test(text) && /(P\.?\s?F\.?|PROVIDENT)/i.test(text);
}

// "1,68,800" or "168800.00" -> paise. Indian grouping, so commas are dropped.
function toPaise(value) {
  if (value == null) return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// The first number on the line holding this label, or on the line after it.
function amountFor(text, label) {
  const re = new RegExp(`${label}[^\\n\\d]*([\\d,]+(?:\\.\\d{1,2})?)`, 'i');
  return toPaise((text.match(re) || [])[1]);
}

export function parse(text) {
  const monthLine = text.match(/month\s+of\s+([A-Z]+)\s*[,'\- ]*\s*(\d{4})/i);
  const monthName = monthLine ? monthLine[1].toUpperCase() : null;
  const monthIndex = monthName ? MONTHS.findIndex((m) => m.startsWith(monthName.slice(0, 3))) : -1;
  const year = monthLine ? Number(monthLine[2]) : null;
  const month = monthIndex >= 0 && year ? `${year}-${String(monthIndex + 1).padStart(2, '0')}` : null;

  // The P.F. line carries this month's figure first and the year to date
  // after it, so both are read from the same line. The label has to be
  // followed by the amount itself: nothing but spaces, a colon or a dot in
  // between. Without that, "Payslip for the month of AUGUST 2026" reads as
  // "P F" and the year becomes the deduction, and "PF UAN : 1023…" reads as a
  // ₹1,02,30,40,745 contribution.
  const pfLine = text.match(/\bP\s?\.?\s?F\s?\.?(?![A-Za-z])[ \t:.\-]{0,6}([\d,]+(?:\.\d{1,2})?)(?:[ \t]+([\d,]+(?:\.\d{1,2})?))?/i);

  return {
    rows: [],
    meta: {
      month,
      monthLabel: monthName && year ? `${monthName[0]}${monthName.slice(1).toLowerCase()} ${year}` : null,
      net: amountFor(text, 'NET\\s*PAY') ?? amountFor(text, 'NET\\s*SALARY'),
      gross: amountFor(text, 'GROSS\\s*EARNINGS') ?? amountFor(text, 'GROSS'),
      basic: amountFor(text, 'BASIC'),
      pfEmployee: pfLine ? toPaise(pfLine[1]) : null,
      pfYearToDate: pfLine && pfLine[2] ? toPaise(pfLine[2]) : null,
      incomeTax: amountFor(text, 'INCOME\\s*TAX'),
      uan: (text.match(/UAN\s*:?\s*(\d{8,})/i) || [])[1] || null,
      employer: (text.split('\n')[0] || '').trim().slice(0, 60) || null,
    },
  };
}
