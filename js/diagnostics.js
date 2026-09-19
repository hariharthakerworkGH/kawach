import { getAll } from './db.js';
import { APP_VERSION, BUILD } from './version.js';
import { computeFreeToSpend } from './free-to-spend.js';
import { isFixed } from './commitments.js';

// A diagnostic report: everything needed to reproduce a wrong number on
// another computer, with what identifies you taken out.
//
// Kept: amounts, dates, directions, categories, account types and statement
// days, commitments and their settings, how the app worked the figures out.
// Replaced: every word that isn't banking vocabulary becomes W1, W2... and
// every number inside a description becomes a different number of the same
// length. The same word or number always gets the same stand-in within one
// report, so matching still behaves exactly the same - "Home Loan EMI" is
// "W7 LOAN EMI" in both the payment and the commitment - but merchant
// names, people's names, UPI ids and reference numbers can't be read.
// Removed: card and account digits, notes, merchant rules, the alert inbox,
// sync settings and every password or token.

// Words that describe how money moved, not who it went to.
const BANKING_WORDS = new Set(
  (
    'UPI IMPS NEFT RTGS ATW NWD ATM EMI BBPS BPPY CC CRED CLUB PAYMENT PAYMENTS RECEIVED REFUND CASHBACK REVERSAL INTEREST PRINCIPAL ' +
    'AMOUNT AMORTIZATION AUTOPAY NACH ACH SI SALARY TRANSFER CHARGES GST SGST CGST IGST FEE FEES DCC FUEL SURCHARGE LOAN RENT ' +
    'WALLET THANK YOU DR CR POS ECOM NETBANKING BILL CARD CREDIT DEBIT CASH WITHDRAWAL WDL VALUE DT REF TO FROM BY FOR THE OF'
  ).split(' ')
);

export async function buildDiagnosticReport(now = new Date()) {
  const [accounts, transactions, categories, recurring, importBatches, settings] = await Promise.all([
    getAll('accounts'),
    getAll('transactions'),
    getAll('categories'),
    getAll('recurring'),
    getAll('importBatches'),
    getAll('settings'),
  ]);

  const wordMap = new Map();
  const numberMap = new Map();
  const numberFor = (digits) => {
    if (!numberMap.has(digits)) {
      // A fresh number of the same length, never starting with 0.
      const n = String(numberMap.size + 1);
      numberMap.set(digits, (('9' + '0'.repeat(digits.length)).slice(0, digits.length - n.length) + n).slice(-digits.length));
    }
    return numberMap.get(digits);
  };
  const redact = (text) =>
    text == null
      ? text
      : String(text).replace(/[A-Za-z]+|\d+/g, (token) => {
          if (/^\d+$/.test(token)) return token.length <= 2 ? token : numberFor(token);
          const upper = token.toUpperCase();
          if (BANKING_WORDS.has(upper)) return token;
          if (!wordMap.has(upper)) wordMap.set(upper, `W${wordMap.size + 1}`);
          return wordMap.get(upper);
        });

  const accountNames = new Map();
  const counters = {};
  for (const a of accounts) {
    counters[a.type] = (counters[a.type] || 0) + 1;
    // Every type gets its own plain name, so a loan or the provident fund
    // doesn't come out labelled "Cash 3" in a report.
    const kind = { card: 'Card', bank: 'Bank', cash: 'Cash', savings: 'Savings', loan: 'Loan', pf: 'PF' }[a.type] || 'Account';
    accountNames.set(a.id, `${kind} ${counters[a.type]}`);
  }

  // Record ids can carry private words: an EMI's id is built from its card
  // and merchant ("emi-…-www_dyson_in-12"), a detected bill's from the
  // merchant name. Every id is swapped for a neutral one, consistently, so
  // links between records still hold. 'cash' (paid in cash) stays as it is.
  const idMaps = { a: new Map(), t: new Map(), r: new Map(), i: new Map(), c: new Map() };
  const idFor = (kind, id) => {
    if (id == null || id === 'cash') return id ?? null;
    const map = idMaps[kind];
    if (!map.has(id)) map.set(id, `${kind}${map.size + 1}`);
    return map.get(id);
  };

  const settingKeys = new Set(['monthlyIncome', 'salaryDay', 'keepInBank', 'cycleAwareMonths', 'budgets']);
  const figures = await computeFreeToSpend(now);

  return {
    kind: 'expense-tracker-diagnostic-report',
    appVersion: APP_VERSION,
    build: BUILD,
    generatedAt: new Date().toISOString(),
    today: figures.today,
    // Your commitments, and apart from them the repeating payments the app
    // spotted on its own (suggestions, including ones you dismissed).
    counts: {
      accounts: accounts.length,
      transactions: transactions.length,
      commitments: recurring.filter(isFixed).length,
      suggestions: recurring.filter((r) => !isFixed(r)).length,
      imports: importBatches.length,
    },
    settings: settings
      .filter((s) => settingKeys.has(s.id))
      .map((s) => ({
        id: s.id,
        // Budgets are keyed by category id.
        value: s.id === 'budgets' && s.value ? Object.fromEntries(Object.entries(s.value).map(([k, v]) => [idFor('c', k), v])) : s.value,
      })),
    categories: categories.map((c) => ({ id: idFor('c', c.id), name: c.name, parentId: idFor('c', c.parentId) })),
    accounts: accounts.map((a) => ({
      id: idFor('a', a.id),
      label: accountNames.get(a.id),
      type: a.type,
      issuer: a.issuer || null,
      last4: a.last4 ? numberFor(a.last4) : null,
      linkedLast4s: (a.linkedLast4s || []).map(numberFor),
      billingCycleDay: a.billingCycleDay || null,
      knownBalance: a.knownBalance ?? null,
      knownBalanceDate: a.knownBalanceDate || null,
      statementDue: a.statementDue ?? null,
      statementMinDue: a.statementMinDue ?? null,
      statementDueDate: a.statementDueDate || null,
      statementPeriodEnd: a.statementPeriodEnd || null,
      statementDuePaid: a.statementDuePaid === true,
      spending: a.spending === false ? false : undefined,
      depositOf: a.depositOf ? idFor('a', a.depositOf) : undefined,
      deposit: a.deposit ? { ...a.deposit } : undefined,
      // A loan and a provident fund keep their figures on the account, so
      // without these two a report can't reproduce what those cards showed.
      // The account number is the only identifying thing in them.
      loan: a.loan ? { ...a.loan, accountNo: undefined, product: redact(a.loan.product), paidFromId: idFor('a', a.loan.paidFromId) } : undefined,
      pf: a.pf ? { ...a.pf, uan: undefined, memberId: undefined, establishment: undefined } : undefined,
    })),
    importBatches: importBatches.map((b) => ({
      id: idFor('i', b.id),
      accountId: idFor('a', b.accountId),
      periodStart: b.periodStart || null,
      periodEnd: b.periodEnd || null,
      importedAt: b.importedAt || null,
      takenOn: b.takenOn || null,
      txCount: b.txCount || 0,
      provisional: b.provisional === true,
    })),
    recurring: recurring.map((r) => ({
      ...r,
      id: idFor('r', r.id),
      accountId: idFor('a', r.accountId),
      categoryId: idFor('c', r.categoryId),
      fromRecurringId: r.fromRecurringId ? idFor('r', r.fromRecurringId) : undefined,
      label: redact(r.label),
      matchText: redact(r.matchText),
      notes: undefined,
      emi: r.emi ? { ...r.emi } : undefined,
    })),
    transactions: transactions.map((t) => ({
      id: idFor('t', t.id),
      accountId: idFor('a', t.accountId),
      date: t.date,
      amount: t.amount,
      direction: t.direction,
      rawDescription: redact(t.rawDescription),
      bankRef: t.bankRef ? numberFor(String(t.bankRef).replace(/\D/g, '') || '0') : null,
      categoryId: idFor('c', t.categoryId),
      splits: Array.isArray(t.splits) ? t.splits.map((s) => ({ categoryId: idFor('c', s.categoryId), amount: s.amount })) : undefined,
      source: t.source,
      importBatchId: idFor('i', t.importBatchId),
      isTransfer: t.isTransfer === true,
      transferManual: t.transferManual === true,
      commitmentId: t.commitmentId ? idFor('r', t.commitmentId) : undefined,
      paysCardId: t.paysCardId ? idFor('a', t.paysCardId) : undefined,
      notCommitmentIds: Array.isArray(t.notCommitmentIds) ? t.notCommitmentIds.map((id) => idFor('r', id)) : undefined,
      updatedAt: t.updatedAt || null,
    })),
    // What the app showed, so a report can be checked against the screenshot.
    figures: {
      cycleStart: figures.cycleStart,
      cycleClose: figures.cycleClose,
      budget: figures.limit,
      spent: figures.spentThisCycle,
      left: figures.free,
      bank: figures.bank,
      bankBeforeSalary: figures.bankBeforeCards,
      bankAfterBills: figures.bankAfterBills,
      level: figures.level,
      bankLevel: figures.bankLevel,
      duplicates: figures.duplicates.length,
      stale: figures.stale.map((s) => ({ account: accountNames.get(s.account.id), lastDate: s.lastDate, days: s.days })),
      tracker: figures.tracker.map((t) => ({ label: redact(t.label), status: t.status, amount: t.amount, used: t.used, matches: t.matches.length, notThis: (t.notThis || []).length })),
    },
  };
}
