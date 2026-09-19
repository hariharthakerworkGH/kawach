// Any Indian bank's or card's statement PDF, read without knowing its layout.
//
// The readers beside this one each know one bank's statement exactly. This
// one is the fallback for every other bank, so it relies only on what all
// statements share:
// - each transaction is a line starting with its date,
// - its amounts sit at the end of that line (and for a bank account, the last
//   of them is the balance after it),
// - anything after it up to the next date is more of its description.
// Money out or in is worked out from the balance: if the balance went down by
// the amount, the money went out. That needs no column positions, so it holds
// for any bank. When there is no balance (card statements), "Cr" beside an
// amount means money in, as every Indian card statement prints it.
//
// Nothing is saved without the review, and the review says it was read this
// way, so a row read wrongly is caught there.
export const id = 'any-bank';
export const general = true;

// Indian banks and card issuers, for the account's name. The most specific
// names come first where one contains another.
export const BANKS = [
  ['SBI Card', /\bsbi\s*card\b/i],
  ['SBI', /state bank of india|\bsbi\b/i],
  ['HDFC Bank', /\bhdfc\b/i],
  ['ICICI Bank', /\bicici\b/i],
  ['Axis Bank', /\baxis\s*bank\b/i],
  ['Kotak Mahindra Bank', /\bkotak\b/i],
  ['IDFC FIRST Bank', /\bidfc\b/i],
  ['IndusInd Bank', /\bindusind\b/i],
  ['Yes Bank', /\byes\s*bank\b/i],
  ['Bank of Baroda', /bank of baroda/i],
  ['Punjab National Bank', /punjab national bank|\bpnb\b/i],
  ['Punjab & Sind Bank', /punjab\s*(&|and)\s*sind/i],
  ['Canara Bank', /\bcanara\b/i],
  ['Union Bank of India', /union bank of india/i],
  ['Central Bank of India', /central bank of india/i],
  ['Indian Overseas Bank', /indian overseas bank/i],
  ['Bank of India', /(?<!(state|union|central|reserve) )bank of india/i],
  ['Bank of Maharashtra', /bank of maharashtra/i],
  ['Indian Bank', /\bindian bank\b/i],
  ['UCO Bank', /\buco\s*bank\b/i],
  ['IDBI Bank', /\bidbi\b/i],
  ['Federal Bank', /\bfederal\s*bank\b/i],
  ['South Indian Bank', /south indian bank/i],
  ['Karnataka Bank', /karnataka bank/i],
  ['Karur Vysya Bank', /karur vysya/i],
  ['City Union Bank', /city union bank/i],
  ['Tamilnad Mercantile Bank', /tamilnad mercantile/i],
  ['RBL Bank', /\brbl\s*bank\b|ratnakar bank/i],
  ['DCB Bank', /\bdcb\s*bank\b/i],
  ['Bandhan Bank', /\bbandhan\b/i],
  ['CSB Bank', /\bcsb\s*bank\b|catholic syrian/i],
  ['Dhanlaxmi Bank', /dhanlaxmi/i],
  ['Jammu & Kashmir Bank', /j\s*&\s*k\s*bank|jammu\s*(&|and)\s*kashmir bank/i],
  ['AU Small Finance Bank', /\bau small finance|\bau\s*bank\b/i],
  ['Equitas Bank', /\bequitas\b/i],
  ['Ujjivan Bank', /\bujjivan\b/i],
  ['Jana Bank', /jana small finance/i],
  ['Suryoday Bank', /\bsuryoday\b/i],
  ['ESAF Bank', /\besaf\b/i],
  ['Airtel Payments Bank', /airtel payments bank/i],
  ['Paytm Payments Bank', /paytm payments bank/i],
  ['India Post Payments Bank', /india post payments bank|\bippb\b/i],
  ['Fino Payments Bank', /\bfino\b/i],
  ['Standard Chartered', /standard chartered/i],
  ['HSBC', /\bhsbc\b/i],
  ['Citibank', /\bciti\s*bank\b/i],
  ['DBS Bank', /\bdbs\b/i],
  ['Deutsche Bank', /deutsche bank/i],
  ['American Express', /american express|\bamex\b/i],
  ['OneCard', /\bonecard\b/i],
];

// The bank named first: the letterhead comes before any transaction that
// mentions another bank.
export function bankName(text) {
  let best = null;
  for (const [label, re] of BANKS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { label, at: m.index };
  }
  return best ? best.label : null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*';
// A date at the start of a line, in the ways Indian statements print them.
// An optional serial number may come before a numeric one.
const DATE_FORMS = [
  { re: new RegExp(`^(\\d{1,2})[\\s/-]${MON}[\\s/,-]+(\\d{4}|\\d{2})\\b`, 'i'), read: (m) => [m[3], MONTHS[m[2].toLowerCase().slice(0, 3)], m[1]] },
  { re: new RegExp(`^${MON}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i'), read: (m) => [m[3], MONTHS[m[1].toLowerCase().slice(0, 3)], m[2]] },
  { re: /^(\d{4})-(\d{2})-(\d{2})\b/, read: (m) => [m[1], m[2], m[3]] },
  { re: /^(?:\d{1,4}\s+)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/, read: (m) => [m[3], m[2], m[1]], numeric: true },
];

function leadingDate(line, monthFirst) {
  for (const form of DATE_FORMS) {
    const m = form.re.exec(line);
    if (!m) continue;
    let [y, mo, d] = form.read(m);
    if (form.numeric && monthFirst) [mo, d] = [d, mo];
    const date = iso(y, mo, d);
    if (date) return { date, rest: line.slice(m[0].length).trim(), numeric: form.numeric, m };
  }
  return null;
}

function iso(y, m, d) {
  let year = Number(y);
  if (String(y).length === 2) year += 2000;
  const month = Number(m);
  const day = Number(d);
  const date = new Date(year, month - 1, day);
  if (!year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// One amount at the very end of a line: "1,234.50", "-1,234.50", "(1,234.50)",
// "₹1,234.50", "1,234.50 Cr", or a lone "-" for an empty column.
const TAIL_RE = /(?:^|\s)(-|[-+]?(?:(?:₹|Rs\.?|INR)\s?)?\(?\d[\d,]*\.\d{2}\)?(?:\s?\(?(?:Cr|Dr|CR|DR|cr|dr)\)?\.?)?)$/;

// Takes the amounts off the end of a line, left to right.
function tailAmounts(text, stripped = false) {
  const found = [];
  let rest = text;
  while (found.length < 4) {
    const m = TAIL_RE.exec(rest);
    if (!m) break;
    found.unshift(m[1]);
    rest = rest.slice(0, m.index).trim();
  }
  // A lone "-" is an empty column only in a row of columns (an amount and a
  // balance beside it); otherwise it is a dash in the description.
  if (found.filter((t) => t !== '-').length < 2) {
    while (found.length && found[0] === '-') {
      found.shift();
      rest = `${rest} -`.trim();
    }
  }
  if (!found.some((t) => t !== '-')) {
    // Some banks print a branch code after the balance ("... 12,550.00 2345").
    const code = /\s\d{1,6}$/.exec(text);
    if (code && !stripped) return tailAmounts(text.slice(0, code.index), true);
    return { rest: text, amounts: [] };
  }
  return { rest, amounts: found.map(readAmount) };
}

function readAmount(token) {
  if (token === '-') return { paise: 0, empty: true };
  const mark = /cr\)?\.?$/i.test(token) ? 'cr' : /dr\)?\.?$/i.test(token) ? 'dr' : null;
  const negative = /^-|^\(|\(\s*[\d₹]/.test(token.trim()) && !/^\(?(cr|dr)/i.test(token.trim());
  const digits = token.match(/\d[\d,]*\.\d{2}/)[0].replace(/,/g, '');
  const [whole, frac] = digits.split('.');
  return { paise: Number(whole) * 100 + Number(frac), mark, negative };
}

// Lines that are the statement's own furniture, never part of a transaction.
const FURNITURE_RE = /^(page\s*\d|page no|date\b.*\b(narration|description|particulars|details)|txn date|transaction date|value date|sl\.?\s*no|s\.?\s*no|continued|contd|this is a (computer|system) generated|\*+|-+|generated on|statement of account)/i;
// Lines that close the table, or summarise rather than record a transaction.
const SUMMARY_RE = /^(opening balance|closing balance|balance (b\/f|c\/f|brought|carried)|brought forward|carried forward|b\/f|c\/f|total|grand total|statement summary|account summary)\b/i;
const OPENING_RE = /\b(opening balance|balance b\/f|brought forward|b\/f)\b/i;

// Words that mean money came in, for a line whose direction nothing else
// settles.
const CREDIT_WORDS = /\b(salary|sal cr|refund|reversal|reversed|cashback|cash back|interest (paid|credit)|int\.?\s*pd|credit interest|neft cr|imps cr|upi cr|by transfer|by clg|by cash|deposit|received|payment received|thank you|credited)\b/i;

function header(lines) {
  for (const line of lines.slice(0, 200)) {
    const out = line.search(/withdrawal|debit|\bdr\b/i);
    const inn = line.search(/deposit|credit|\bcr\b/i);
    if (out >= 0 && inn >= 0 && /balance/i.test(line) && /date/i.test(line)) return { debitFirst: out < inn };
  }
  return null;
}

export function parse(text) {
  const lines = String(text || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Numeric dates are day first, as Indian banks write them, unless a
  // statement proves otherwise with a "month" over 12 in the second place.
  const monthFirst = lines.some((l) => {
    const m = /^(?:\d{1,4}\s+)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(l);
    return m && Number(m[2]) > 12 && Number(m[1]) <= 12;
  });
  const cols = header(lines);

  let opening = null;
  const raw = [];
  let current = null;
  const close = () => {
    if (current) raw.push(current);
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dated = leadingDate(line, monthFirst);
    if (dated) {
      close();
      // A second date straight after the first is the value date.
      const again = leadingDate(dated.rest, monthFirst);
      let rest = again ? again.rest : dated.rest;
      let { rest: words, amounts } = tailAmounts(rest);
      // A row whose amounts wrapped onto the next line or two.
      let j = i;
      while (!amounts.length && j + 1 < lines.length && j < i + 3 && !leadingDate(lines[j + 1], monthFirst)) {
        j++;
        rest = `${rest} ${lines[j]}`;
        ({ rest: words, amounts } = tailAmounts(rest));
      }
      if (!amounts.length) continue;
      i = j;
      if (OPENING_RE.test(words)) {
        opening = signedBalance(amounts[amounts.length - 1]);
        continue;
      }
      if (SUMMARY_RE.test(words)) continue;
      current = { date: dated.date, words: [words], amounts };
      continue;
    }
    if (OPENING_RE.test(line) && opening == null && !raw.length) {
      const { amounts } = tailAmounts(line);
      if (amounts.length) opening = signedBalance(amounts[amounts.length - 1]);
    }
    if (!current) continue;
    if (SUMMARY_RE.test(line)) {
      close();
      continue;
    }
    // More of the description: a few short lines with no amounts of their own.
    if (current.words.length < 4 && !FURNITURE_RE.test(line) && !tailAmounts(line).amounts.length && line.length < 120) {
      current.words.push(line);
    } else {
      close();
    }
  }
  close();

  // A bank account's lines carry the balance after them as their last amount.
  const withTwo = raw.filter((r) => r.amounts.length >= 2).length;
  const hasBalance = raw.length > 0 && withTwo / raw.length >= 0.6;

  const rows = raw.map((r) => {
    const description = r.words.join(' ').replace(/(^|\s)-(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    let money = r.amounts;
    let balance = null;
    if (hasBalance && money.length >= 2) {
      balance = signedBalance(money[money.length - 1]);
      money = money.slice(0, -1);
    }
    const real = money.filter((a) => !a.empty && a.paise > 0);
    const pick = real[0] || money[0];
    // Where the column says it: Cr/Dr beside the amount, or which of the
    // withdrawal and deposit columns it sits in.
    let direction = null;
    if (pick.mark) direction = pick.mark === 'cr' ? 'credit' : 'debit';
    else if (cols && money.length === 2 && real.length === 1) {
      const first = money.indexOf(pick) === 0;
      direction = first === cols.debitFirst ? 'debit' : 'credit';
    } else if (!hasBalance && pick.negative) direction = 'credit';
    return { date: r.date, description, amount: pick.paise, direction, balance, guess: CREDIT_WORDS.test(description) ? 'credit' : 'debit' };
  });

  // The balance settles every line it can: in the order the money moved,
  // each line's balance is the one before it plus or minus its amount.
  const newestFirst = rows.length > 1 && rows[0].date > rows[rows.length - 1].date;
  const order = newestFirst ? [...rows].reverse() : rows;
  let previous = opening;
  let checked = 0;
  let broken = 0;
  for (const row of order) {
    if (row.balance == null) continue;
    if (previous != null) {
      const diff = row.balance - previous;
      if (Math.abs(diff) === row.amount && row.amount > 0) {
        row.direction = diff > 0 ? 'credit' : 'debit';
        checked++;
      } else broken++;
    }
    previous = row.balance;
  }
  for (const row of rows) if (!row.direction) row.direction = row.guess;

  const clean = rows.filter((r) => r.amount > 0 && r.description).map(({ date, description, amount, direction }) => ({ date, description, amount, direction, ref: null }));
  const dates = clean.map((r) => r.date).sort();
  const meta = {
    rowCount: clean.length,
    periodStart: dates[0] || null,
    periodEnd: dates[dates.length - 1] || null,
    reconciled: null,
    accountLast4: lastFour(text),
  };

  if (hasBalance) {
    const first = order.find((r) => r.balance != null);
    const last = [...order].reverse().find((r) => r.balance != null);
    if (first && last) {
      const start = opening != null ? opening : first.balance - (first.direction === 'credit' ? first.amount : -first.amount);
      const moved = order.reduce((s, r) => s + (r.direction === 'credit' ? r.amount : -r.amount), 0);
      meta.statedClosingBalance = last.balance / 100;
      meta.computedClosingBalance = (start + moved) / 100;
      meta.reconciled = broken === 0 && Math.abs(start + moved - last.balance) < 1;
      meta.checkedByBalance = checked;
    }
  } else {
    // A card's cycle ends on its statement date, never on its last spend:
    // the day is only set when the statement prints it.
    meta.periodEnd = null;
    Object.assign(meta, cardFigures(text, monthFirst));
  }
  return { rows: clean, meta, hasBalance };
}

function signedBalance(a) {
  return a.mark === 'dr' || a.negative ? -a.paise : a.paise;
}

// The account's or card's last four digits, from "Account No : XXXXXX1234"
// or "Card No: 4xxx xxxx xxxx 1234".
function lastFour(text) {
  const m =
    /(?:account|a\/c|acct)\s*(?:no|number|num)?\.?\s*[:-]?\s*([\dXx*][\dXx*\s-]{4,24}?(\d{4}))\b/i.exec(text) ||
    /card\s*(?:no|number)?\.?\s*[:-]?\s*([\dXx*][\dXx*\s-]{8,24}?(\d{4}))\b/i.exec(text);
  return m ? m[2] : null;
}

const AMOUNT_AFTER = (label) => new RegExp(`${label}[^\\d\\n]{0,40}?(?:₹|Rs\\.?|INR)?\\s?(\\d[\\d,]*\\.\\d{2})`, 'i');
const DATE_TEXT = `(\\d{1,2}[\\s/-](?:\\d{1,2}|[A-Za-z]{3,9})[\\s/,-]+\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})`;

// What a card statement asks you to pay, and by when.
function cardFigures(text, monthFirst) {
  const out = {};
  const paise = (s) => {
    const [whole, frac] = s.replace(/,/g, '').split('.');
    return Number(whole) * 100 + Number(frac);
  };
  const dateOf = (s) => (leadingDate(s.trim(), monthFirst) || {}).date || null;
  const total = AMOUNT_AFTER('total\\s*(?:amount\\s*)?(?:due|payable)').exec(text);
  if (total) out.totalAmountDue = paise(total[1]);
  const min = AMOUNT_AFTER('minimum\\s*(?:amount\\s*)?(?:due|payable)').exec(text);
  if (min) out.minimumDue = paise(min[1]);
  const due = new RegExp(`(?:payment\\s*)?due\\s*date[^\\dA-Za-z\\n]{0,10}${DATE_TEXT}`, 'i').exec(text);
  if (due) out.paymentDueDate = dateOf(due[1]);
  const stmt = new RegExp(`statement\\s*date[^\\dA-Za-z\\n]{0,10}${DATE_TEXT}`, 'i').exec(text);
  if (stmt && dateOf(stmt[1])) out.periodEnd = dateOf(stmt[1]);
  return out;
}

// The reader for this text, or null when it holds no transactions at all.
// A card statement has no balance column; a bank account's does.
export function readerFor(text) {
  const { rows, hasBalance } = parse(text);
  if (rows.length < 1) return null;
  const card = !hasBalance && /credit\s*card|card\s*statement/i.test(text);
  const bank = bankName(text);
  return {
    id,
    general,
    accountType: card ? 'card' : 'bank',
    issuerLabel: bank || (card ? 'Card' : 'Bank'),
    parse: (t) => {
      const { rows: r, meta } = parse(t);
      return { rows: r, meta };
    },
  };
}
