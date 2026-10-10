// Reads bank and card alert messages - an SMS, or the text of an alert email
// shared into the app - and turns each one into a draft transaction.
//
// The known formats below were written against real alerts from HDFC Bank and
// ICICI Bank, not guessed from the internet. Banks change their wording often,
// so anything that matches none of them still gets a best-effort read (amount,
// card or account digits, date) marked as partial, and nothing is ever saved
// without being shown to you first.

const AMOUNT = String.raw`([\d,]+(?:\.\d{1,2})?)`;

// Banks hide the front of a card or account number as "XX6671", "x6671" or
// "*6671", and some leave it off. Four digits are always the ones that count.
const MASK = String.raw`[xX*•]*`;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const FORMATS = [
  {
    id: 'hdfc-card-spend',
    re: new RegExp(String.raw`Spent\s+Rs\.?\s*${AMOUNT}\s+On\s+HDFC\s+Bank\s+Card\s+${MASK}(\d{4})\s+At\s+(.+?)\s+On\s+(\d{4})-(\d{2})-(\d{2}):(\d{2}:\d{2})(?::\d{2})?`, 'i'),
    build: (m) => ({
      kind: 'card-spend',
      bank: 'HDFC',
      instrument: 'card',
      direction: 'debit',
      amount: m[1],
      last4: m[2],
      party: m[3],
      date: isoDate(m[4], m[5], m[6]),
      time: m[7],
    }),
  },
  {
    id: 'hdfc-debit-card-atm',
    re: new RegExp(String.raw`Withdrawn\s+Rs\.?\s*${AMOUNT}\s+From\s+HDFC\s+Bank\s+Card\s+x(\d{4})\s+At\s+(.+?)\s+On\s+(\d{4})-(\d{2})-(\d{2}):(\d{2}:\d{2})(?::\d{2})?`, 'i'),
    build: (m) => ({
      kind: 'atm-withdrawal',
      bank: 'HDFC',
      instrument: 'debit-card',
      direction: 'debit',
      amount: m[1],
      last4: m[2],
      party: m[3].replace(/^\+/, ''),
      date: isoDate(m[4], m[5], m[6]),
      time: m[7],
    }),
  },
  {
    id: 'hdfc-upi-sent',
    re: new RegExp(String.raw`Sent\s+Rs\.?\s*${AMOUNT}\s+From\s+HDFC\s+Bank\s+A\/C\s+${MASK}(\d{4})\s+To\s+(.+?)\s+On\s+(\d{2})\/(\d{2})\/(\d{2})\s+Ref\s+(\d+)`, 'i'),
    build: (m) => ({
      kind: 'upi-sent',
      bank: 'HDFC',
      instrument: 'account',
      direction: 'debit',
      amount: m[1],
      last4: m[2],
      party: m[3],
      date: isoDate(`20${m[6]}`, m[5], m[4]),
      ref: m[7],
    }),
  },
  {
    id: 'hdfc-upi-credit',
    re: new RegExp(String.raw`Rs\.?\s*${AMOUNT}\s+credited\s+to\s+HDFC\s+Bank\s+A\/c\s+${MASK}(\d{4})\s+on\s+(\d{2})-(\d{2})-(\d{2})\s+from\s+VPA\s+(\S+)\s+\(UPI\s+(\d+)\)`, 'i'),
    build: (m) => ({
      kind: 'upi-credit',
      bank: 'HDFC',
      instrument: 'account',
      direction: 'credit',
      amount: m[1],
      last4: m[2],
      party: m[6],
      date: isoDate(`20${m[5]}`, m[4], m[3]),
      ref: m[7],
    }),
  },
  {
    // "Rs. 620 refunded by RSP*SWIGGY PVT LTD FO  BENGALURU     KAR on 08/OCT/2026 & adjusted against HDFC Bank
    // Credit Card 6671": money back on a card. Named after the merchant so it can be matched to the purchase.
    id: 'hdfc-card-refund',
    re: new RegExp(String.raw`Rs\.?\s*${AMOUNT}\s+refunded\s+by\s+(.+?)\s+on\s+(\d{2})\/([A-Za-z]{3})\/(\d{4})\s+&(?:amp;)?\s+adjusted\s+against\s+HDFC\s+Bank\s+Credit\s+Card\s+${MASK}(\d{4})`, 'i'),
    build: (m) => ({
      kind: 'card-refund',
      bank: 'HDFC',
      instrument: 'card',
      direction: 'credit',
      amount: m[1],
      last4: m[6],
      party: m[2].replace(/\s+/g, ' ').trim(),
      date: isoDate(m[5], MONTHS[m[4].toLowerCase()], m[3]),
    }),
  },
  {
    id: 'icici-card-spend',
    re: new RegExp(String.raw`INR\s+${AMOUNT}\s+spent\s+using\s+ICICI\s+Bank\s+Card\s+${MASK}(\d{4})\s+on\s+(\d{2})-([A-Za-z]{3})-(\d{2})\s+on\s+(.+?)\.\s+Avl\s+Limit`, 'i'),
    build: (m) => ({
      kind: 'card-spend',
      bank: 'ICICI',
      instrument: 'card',
      direction: 'debit',
      amount: m[1],
      last4: m[2],
      party: m[6],
      date: isoDate(`20${m[5]}`, MONTHS[m[4].toLowerCase()], m[3]),
    }),
  },
];

// Messages that mention an amount and a card but are not transactions.
const NOT_A_TRANSACTION = [
  { re: /\b(OTP|one[\s-]?time\s+password|verification\s+code)\b/i, reason: "That's a one-time password message, not a payment." },
  { re: /\b(declined|was\s+not\s+successful|unsuccessful|failed)\b/i, reason: "That payment didn't go through, so there's nothing to log." },
];

// --- Wordings the user has taught (js/alert-learning.js) -------------------
// A message no built-in format reads is shown for checking; when it is saved, the wording is
// remembered here as a pattern with holes for the amount, the date, the shop and the card digits,
// so the next one like it is read exactly, for this user's bank, whatever bank it is.
let learned = [];
export function useLearned(list) {
  learned = Array.isArray(list) ? list.filter((f) => f && typeof f.re === 'string') : [];
}

function readLearned(raw) {
  // A real alert is a few hundred characters; a huge paste is never matched against taught patterns.
  if (raw.length > 1500) return null;
  for (const f of learned) {
    let m;
    try {
      m = raw.match(new RegExp(f.re, 'i'));
    } catch {
      continue;
    }
    if (!m) continue;
    const g = Object.fromEntries(f.groups.map((name, i) => [name, m[i + 1]]));
    const amount = toPaise(g.amount);
    const date = g.date ? findDate(g.date) : null;
    if (!amount || (f.groups.includes('date') && !date)) continue;
    return finish({
      kind: f.kind || 'unknown',
      bank: bankName(raw),
      instrument: f.instrument,
      direction: f.direction,
      amount,
      last4: g.last4 || null,
      party: g.party || null,
      date,
      time: findTime(raw),
      format: 'learned',
      confidence: 'learned',
      billPayment: Boolean(f.billPayment),
    });
  }
  return null;
}

// --- Splitting -----------------------------------------------------------

// Sharing several messages at once arrives as one block of text. Each known
// alert found in it becomes its own draft; with none found, the whole text is
// treated as a single alert.
export function splitAlerts(text) {
  const clean = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];

  // A blank line always separates two messages. Bank alerts themselves never
  // contain one - the UPI alerts span several lines, but with no gap - so this
  // can't cut an alert in half. It also keeps a message we can't read (an OTP,
  // say) as its own item instead of letting it vanish into its neighbour.
  return clean.split(/\n[ \t]*\n+/).flatMap(splitBlock);
}

// Within one block, several known alerts run together with no blank line
// between them; each becomes its own piece.
function splitBlock(block) {
  const text = block.trim();
  if (!text) return [];

  const starts = [];
  const sources = [...FORMATS.map((f) => f.re.source), ...learned.map((f) => f.re)];
  for (const source of sources) {
    let global;
    try {
      global = new RegExp(source, 'gi');
    } catch {
      continue;
    }
    let m;
    while ((m = global.exec(text))) {
      starts.push(m.index);
      if (m.index === global.lastIndex) global.lastIndex++;
    }
  }
  if (starts.length <= 1) return [text];

  // Each alert runs from its own start to the next one's.
  const sorted = [...new Set(starts)].sort((a, b) => a - b);
  // Anything before the first match (a "Credit Alert!" heading, say) belongs
  // to the first alert rather than becoming a stray fragment.
  sorted[0] = 0;
  return sorted.map((start, i) => text.slice(start, sorted[i + 1] ?? text.length).trim()).filter(Boolean);
}

// --- Parsing -------------------------------------------------------------

export function parseAlert(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, reason: 'Nothing to read.' };

  for (const f of FORMATS) {
    const m = raw.match(f.re);
    if (!m) continue;
    const built = f.build(m);
    const amount = toPaise(built.amount);
    if (amount == null || amount <= 0 || !built.date) continue;
    return finish({ ...built, amount, format: f.id, confidence: 'exact' });
  }

  const taught = readLearned(raw);
  if (taught) return taught;

  for (const n of NOT_A_TRANSACTION) {
    if (n.re.test(raw)) return { ok: false, reason: n.reason };
  }

  return parseGeneric(raw);
}

// A best-effort read of an alert in a wording we haven't seen. It never guesses
// the direction when the message is ambiguous; you pick it on the confirm card.
function parseGeneric(raw) {
  const amountMatch =
    raw.match(/(?:Rs\.?|INR|₹|Rupees|Amt\.?:?|Amount:?)\s*([\d,]+(?:\.\d{1,2})?)/i) ||
    // SBI leaves the currency out: "A/C X1234 debited by 250.0".
    raw.match(/\b(?:debited|credited)\s+(?:by|with|for)\s+([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? toPaise(amountMatch[1]) : null;
  if (amount == null || amount <= 0) {
    return { ok: false, reason: "Couldn't find an amount in that message." };
  }

  const direction = findDirection(raw, amountMatch.index);

  const digits = findDigits(raw);
  const isCard = /\bcard\b/i.test(raw);
  const isDebitCard = /\bdebit\s+card\b|\bDC\s+\d{4}\b/i.test(raw);

  const party = findParty(raw);
  const ref = (
    raw.match(/\b(?:Ref(?:erence)?(?:\s*No)?\.?|UPI(?:\s*Ref)?)\s*:?\s*(\d{9,})/i) ||
    // Axis: "UPI/P2M/425612345678/SWIGGY"
    raw.match(/\bUPI\/[A-Z0-9]+\/(\d{9,})/i) ||
    []
  )[1];

  const instrumentKind = isDebitCard ? 'debit-card' : digits ? digits.instrument || (isCard ? 'card' : 'account') : isCard ? 'card' : null;
  return finish({
    // Money back on a card is named so it can be matched to the purchase it undoes (js/card-refunds.js).
    kind: direction === 'credit' && instrumentKind === 'card' && /\b(?:refund(?:ed)?|reversed|reversal)\b/i.test(raw) ? 'card-refund' : 'unknown',
    bank: bankName(raw),
    // What the digits belong to is read from the word they follow, not from
    // any "card" elsewhere in the message: "debited from A/c 1150 ... Card
    // 6671" is a bank account at 1150, and calling it a card would send it
    // looking for a card ending 1150.
    instrument: isDebitCard ? 'debit-card' : digits ? digits.instrument || (isCard ? 'card' : 'account') : isCard ? 'card' : null,
    direction,
    amount,
    last4: digits ? digits.last4 : null,
    party: party || null,
    date: findDate(raw),
    time: findTime(raw),
    ref: ref || null,
    format: 'generic',
    confidence: 'partial',
    // A payment arriving on a card is the bill being paid, not income.
    billPayment: /received\s+towards|payment\s+(?:of\s+)?(?:Rs\.?|INR)?.*received|thank\s+you\s+for\s+(?:your\s+)?payment/i.test(raw),
  });
}

// Which way the money went. Banks word it a dozen ways ("debited", "Debit INR", "Dr.", "has been
// charged", "credited with", "refunded"), and "Credit Card" says nothing about direction. When a
// message has words for both ("debited ... a/c MYNTRA credited"), the one next to the amount is
// the user's own account; with none next to it, nothing is guessed and the card asks.
const CREDIT_WORD = /\b(?:credited|credit(?!\s+(?:card|limit))|received|refund(?:ed)?|reversed|reversal|cashback|deposited|Cr)\b/gi;
const DEBIT_WORD = /\b(?:debited|debit(?!\s+card)|spent|sent|withdrawn|withdrawal|paid|purchase|used\s+for|trf\s+to|charged|swiped|Dr)\b/gi;
function findDirection(raw, amountAt) {
  const near = (re) => {
    let best = null;
    for (const m of raw.matchAll(re)) {
      const d = Math.min(Math.abs(m.index - amountAt), Math.abs(m.index + m[0].length - amountAt));
      if (best == null || d < best) best = d;
    }
    return best;
  };
  const credit = near(CREDIT_WORD);
  const debit = near(DEBIT_WORD);
  if (credit == null && debit == null) return null;
  if (debit == null) return 'credit';
  if (credit == null) return 'debit';
  // Both: only when one is clearly the amount's own word.
  return Math.abs(credit - debit) >= 12 ? (credit < debit ? 'credit' : 'debit') : null;
}

// Who the money went to or came from. The label words banks use are tried in turn and a
// candidate that is really the user's own account, a phone number or an amount is skipped
// ("debited from your A/c XX1234 ... towards UPI/shop@ybl" is about the shop, not the account).
const PARTY_STOP = String.raw`(?=\s+(?:on|to|from|towards|Avl|Avail|Ref|Refno|SMS|If|Not|Call|has|is|was|using|dated|date)\b|\s*[&,]|\.\s|\.$|\n|$)`;
const PARTY_LABEL = new RegExp(String.raw`\b(?:refund(?:ed)?\s+by|reversed\s+by|credited\s+by|by|at|to|towards|trf\s+to|from|Info:)\s+([A-Za-z0-9&@.\-*'/ ]{2,60}?)` + PARTY_STOP, 'gi');
const UPI_NAMED = /\bUPI\/[A-Za-z0-9]+\/\d{6,}\/([A-Za-z0-9&._@' -]{2,40}?)(?=\s+(?:SMS|Not|If|Call|Avl)\b|\s*[,;]|\.\s|\.$|\n|$)/i;
const AFTER_CLOCK = /\b\d{2}:\d{2}(?::\d{2})?\s+([A-Za-z][A-Za-z0-9&.*' -]{2,40}?)\s+(?:Avl|Avail)\b/i;
const NOT_A_PARTY = /^(?:your|my|the|a|an)\b|\b(?:a\/c|ac|acct?|account|card|cc|bank)\b|^(?:Rs\.?|INR|₹)|^[\d\s.,/-]{4,}$|\bX{2,}\d|^\d|\b(?:BLOCK|call)\b/i;
function findParty(raw) {
  const upi = raw.match(UPI_NAMED);
  if (upi) return upi[1];
  for (const m of raw.matchAll(PARTY_LABEL)) {
    const who = m[1].trim();
    if (who && !NOT_A_PARTY.test(who)) return who;
  }
  const clock = raw.match(AFTER_CLOCK);
  return clock && !NOT_A_PARTY.test(clock[1]) ? clock[1] : null;
}

function findTime(raw) {
  const m = raw.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
  return m ? m[1] : null;
}

// The four digits that name a card or account in an alert.
//
// They must come straight after the word that says what they are - Card, CC,
// A/c and so on - allowing only the things banks really put there: "no.",
// "ending in", and a masked front ("XX", "X", "*", or "4000XXXXXXXX"). The
// old pattern let up to 24 characters of anything sit in between, which read
// the amount in "Credit Card Bill of Rs.1234 paid" as a card ending 1234.
//
// The first label in the message wins, and `instrument` says which kind it
// was. A bare "ending in 6671" with no label is accepted last.
const DIGIT_LABEL = String.raw`\b(credit\s+card|debit\s+card|card|cc|dc|a\/c|acct?|account|ac)\b`;
const DIGIT_TAIL = String.raw`[\s:.\-(#]*(?:(?:no|number|num)\.?[\s:.\-(#]*)?(?:ending(?:\s+(?:in|with))?[\s:.\-(#]*)?(?:\d{0,6}[xX*•]+|[xX*•]*)(\d{4})(?!\d)`;

export function findDigits(raw) {
  const text = String(raw || '');
  const labelled = text.match(new RegExp(DIGIT_LABEL + DIGIT_TAIL, 'i'));
  if (labelled) {
    const word = labelled[1].toLowerCase().replace(/\s+/g, ' ');
    const instrument = word === 'debit card' || word === 'dc' ? 'debit-card' : /card|cc/.test(word) ? 'card' : 'account';
    return { last4: labelled[2], instrument };
  }
  const bare = text.match(new RegExp(String.raw`\bending(?:\s+(?:in|with))?[\s:.\-(#]*` + String.raw`(?:\d{0,6}[xX*•]+|[xX*•]*)(\d{4})(?!\d)`, 'i'));
  return bare ? { last4: bare[1], instrument: null } : null;
}

function finish(p) {
  const party = p.party ? p.party.replace(/\s+/g, ' ').replace(/[.,;:\s]+$/, '').trim().slice(0, 60) : null;
  return {
    ok: true,
    kind: p.kind,
    format: p.format,
    confidence: p.confidence,
    bank: p.bank || null,
    instrument: p.instrument || null,
    direction: p.direction || null,
    amount: p.amount,
    last4: p.last4 || null,
    party,
    date: p.date || null,
    time: p.time || null,
    ref: p.ref || null,
    billPayment: Boolean(p.billPayment),
    description: describe(p.kind, party),
    // Moving money is not spending: cash out of an ATM, or paying a card bill.
    suggestTransfer: p.kind === 'atm-withdrawal' || Boolean(p.billPayment),
  };
}

function describe(kind, party) {
  if (kind === 'atm-withdrawal') return `Cash withdrawal${party ? ` · ${party}` : ''}`;
  if (kind === 'upi-sent') return `${party || 'UPI payment'} (UPI)`;
  if (kind === 'upi-credit') return `UPI from ${party || 'unknown'}`;
  if (kind === 'card-refund') return `${party || 'Card'} (refund)`;
  return party || 'Bank alert';
}

// --- Identity, accounts and duplicates -----------------------------------

// Two drafts with the same fingerprint are the same alert shared twice.
// Includes the time and reference where the bank gives them, so two genuine
// ₹50 chai payments on the same card still count as two.
export function alertFingerprint(p) {
  return [p.bank || '', p.instrument || '', p.last4 || '', p.direction || '', p.amount, p.date || '', p.time || '', p.ref || ''].join('|');
}

// Which account an alert belongs to. The order is the point:
//
//   1. The exact last four digits, on an account of the right kind.
//   2. A link you made once ("this number is that account") - only for digits
//      no account owns outright, such as a reissued card or a debit card.
//   3. A debit card's digits, found on the bank's own statement rows.
//
// The bank's name ("HDFC") is never used to choose, because a person's HDFC
// savings account and HDFC card share it. It only breaks a tie when two
// accounts end in the same four digits, and then only between those two.
export function resolveAccount(p, accounts, transactions) {
  if (!p.last4) return null;

  const wantType = p.instrument === 'card' ? 'card' : p.instrument === 'account' ? 'bank' : null;
  const byDigits = accounts.filter((a) => a.last4 === p.last4 && (!wantType || a.type === wantType));
  if (byDigits.length === 1) return byDigits[0];
  if (byDigits.length > 1 && p.bank) {
    const bank = p.bank.toLowerCase();
    const sameBank = byDigits.filter((a) => `${a.issuer || ''} ${a.label || ''}`.toLowerCase().includes(bank));
    if (sameBank.length === 1) return sameBank[0];
  }
  // Two accounts, same digits, no way to tell: ask rather than guess.
  if (byDigits.length > 1) return null;

  // A link made when you confirmed an alert by hand. It used to be checked
  // first, so one wrong pick (the bank account chosen for a card alert) was
  // remembered for good and then beat the card that really ends in those
  // digits. Now it only speaks for digits nothing owns, and only for the
  // kind of thing the alert is about.
  const linked = accounts.find(
    (a) => Array.isArray(a.linkedLast4s) && a.linkedLast4s.includes(p.last4) && (!wantType || a.type === wantType)
  );
  if (linked) return linked;

  // A debit card's number isn't the account's, but the bank's own statement
  // prints it on every ATM and card row ("ATW-400000XXXXXX1234-..."), which
  // is enough to work out which account it belongs to.
  if (p.instrument === 'debit-card' || p.instrument === null) {
    const pattern = new RegExp(`[xX*]{2,}${p.last4}(?!\\d)`);
    const bankIds = new Set(accounts.filter((a) => a.type === 'bank').map((a) => a.id));
    const owners = new Set(transactions.filter((t) => bankIds.has(t.accountId) && pattern.test(t.rawDescription || '')).map((t) => t.accountId));
    if (owners.size === 1) return accounts.find((a) => a.id === [...owners][0]) || null;
  }

  return null;
}

const daysApart = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

// Is this alert already in the app? Returns how sure, and what it matched.
//   same-alert : this exact alert was already added
//   reference  : the statement row carries the same UPI reference - certain
//   likely     : same account, amount and direction within 3 days - probably,
//                but two identical spends a day apart are possible, so ask
export function findExisting(p, accountId, transactions) {
  const key = alertFingerprint(p);
  const sameAlert = transactions.find((t) => t.alertKey === key);
  if (sameAlert) return { kind: 'same-alert', transaction: sameAlert };
  if (!accountId) return null;

  const onAccount = transactions.filter((t) => t.accountId === accountId && t.direction === p.direction && t.amount === p.amount);

  if (p.ref) {
    const byRef = onAccount.find((t) => t.alertRef === p.ref || t.bankRef === p.ref || (t.rawDescription || '').includes(p.ref));
    if (byRef) return { kind: 'reference', transaction: byRef };
  }

  if (!p.date) return null;
  const near = onAccount.filter((t) => daysApart(t.date, p.date) <= 3).sort((a, b) => daysApart(a.date, p.date) - daysApart(b.date, p.date));
  return near.length ? { kind: 'likely', transaction: near[0] } : null;
}

// --- Helpers -------------------------------------------------------------

export function toPaise(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

function isoDate(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day || month > 12 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Rejects impossible dates like 31 February instead of rolling them over.
  if (date.getMonth() !== month - 1) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// The date in a message, with the text it was written as and where it sat, so a wording the
// user teaches can capture the same stretch next time.
export function dateMatch(raw) {
  const hit = (m, iso) => (iso ? { iso, text: m[0], index: m.index } : null);
  const fix = (y) => (y.length === 2 ? `20${y}` : y);
  let m = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return hit(m, isoDate(m[1], m[2], m[3]));
  m = raw.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{2}|\d{4})\b/);
  if (m) return hit(m, isoDate(fix(m[3]), m[2], m[1]));
  m = raw.match(/\b(\d{1,2})[\s/.-]([A-Za-z]{3})[a-z]*[,\s/.-]+(\d{2}|\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return hit(m, isoDate(fix(m[3]), MONTHS[m[2].toLowerCase()], m[1]));
  // SBI writes the date run together: "12Sep26".
  m = raw.match(/\b(\d{1,2})([A-Za-z]{3})(\d{2}|\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return hit(m, isoDate(fix(m[3]), MONTHS[m[2].toLowerCase()], m[1]));
  return null;
}

function findDate(raw) {
  const d = dateMatch(raw);
  return d ? d.iso : null;
}

// Banks the general reader recognises by name. HDFC and ICICI also have
// exact formats above; the others are read here until real alerts from them
// have been checked and given formats of their own.
function bankName(text) {
  // A UPI id names the other person's bank ("swiggy@icici"), not yours - and
  // so can the front of it ("hdfc.shop@okaxis"). Both halves go, so a Kotak
  // account paying hdfc.shop@icici is still read as Kotak.
  const raw = text.replace(/\S+@\S+/g, ' ');
  if (/HDFC/i.test(raw)) return 'HDFC';
  if (/ICICI/i.test(raw)) return 'ICICI';
  if (/\bSBI\b|State\s+Bank/i.test(raw)) return 'SBI';
  if (/\bAxis\b/i.test(raw)) return 'Axis';
  if (/\bKotak\b/i.test(raw)) return 'Kotak';
  return null;
}
