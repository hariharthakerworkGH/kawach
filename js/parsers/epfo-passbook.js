// An EPFO member passbook (one financial year per file).
//
// This is the only true record of a provident fund: what was in it at the
// start of the year, every month's contribution split into your share, your
// employer's and the pension part, the interest EPFO actually credited, and
// the closing balance. Importing it means the app never has to guess the
// employer's share from the rules - which is wrong for anyone whose employer
// puts the whole 12% into EPF and nothing into the pension scheme.
//
// The PDF has Hindi and English side by side and the Hindi comes out of the
// text layer as gibberish, so every pattern here keys off the English.
export const id = 'epfo-passbook';
export const accountType = 'pf';
export const issuerLabel = 'EPFO';

// "Mar-2026 01-04-2026 CR Cont. for Due-Month 042026 1,68,800 0 20,256 20,256 0"
// wage month, date, CR/DR, particulars, EPF wages, EPS wages, employee,
// employer, pension.
const ROW_RE =
  /^([A-Za-z]{3}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+(CR|DR)\s+(.*?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function detect(text) {
  return /EPF\s*Passbook/i.test(text) && /Member\s*ID/i.test(text);
}

const toPaise = (value) => (value == null ? null : Math.round(Number(String(value).replace(/,/g, '')) * 100));
const toIso = (dmy) => {
  const [d, m, y] = dmy.split(/[-/]/);
  return `${y}-${m}-${d}`;
};

export function parse(text) {
  const lines = text.split('\n').map((l) => l.trim());

  const opening = text.match(/OB\s+Int\.\s+Updated\s+upto\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i);
  const closing = text.match(/Closing\s+Balance\s+as\s+on\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i);
  const interest = text.match(/Interest\s+details\s+(?:N\/A|[\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i);

  const rows = [];
  for (const line of lines) {
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const [, wageMonth, date, type, particulars, epfWages, , employee, employer, pension] = m;
    const [mon, year] = wageMonth.split('-');
    const monthNo = MONTHS[mon.toLowerCase()];
    if (!monthNo) continue;
    const sign = type === 'DR' ? -1 : 1;
    rows.push({
      wageMonth: `${year}-${String(monthNo).padStart(2, '0')}`,
      date: toIso(date),
      particulars: particulars.replace(/\s+/g, ' ').trim(),
      wages: toPaise(epfWages),
      employee: sign * toPaise(employee),
      employer: sign * toPaise(employer),
      pension: sign * toPaise(pension),
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : 1));

  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  return {
    rows: [],
    meta: {
      memberId: (text.match(/Member\s*ID\/Name\s*([A-Z0-9]+)/i) || [])[1] || null,
      uan: (text.match(/UAN\s*(\d{8,})/i) || [])[1] || null,
      employer: (text.match(/Establishment\s*ID\/Name\s*\S+\s*\/\s*(.+)/i) || [])[1]?.trim() || null,
      financialYear: (text.match(/Financial\s*Year\s*-\s*(\d{4}-\d{4})/i) || [])[1] || null,
      opening: opening
        ? { asOf: toIso(opening[1].replace(/\//g, '-')), employee: toPaise(opening[2]), employer: toPaise(opening[3]), pension: toPaise(opening[4]) }
        : null,
      closing: closing
        ? { asOf: toIso(closing[1].replace(/\//g, '-')), employee: toPaise(closing[2]), employer: toPaise(closing[3]), pension: toPaise(closing[4]) }
        : null,
      interestCredited: interest ? { employee: toPaise(interest[1]), employer: toPaise(interest[2]), pension: toPaise(interest[3]) } : null,
      months: rows,
      totals: { employee: sum('employee'), employer: sum('employer'), pension: sum('pension') },
      lastWages: rows.length ? rows[rows.length - 1].wages : null,
    },
  };
}
