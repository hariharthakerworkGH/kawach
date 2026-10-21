// SBI alerts (5.86.1): "Your A/C XXXXX890385 Debited INR 23,000.00 on 15/10/26 -Transferred to Mr. NAME. Avl Balance ..." is the wording SBI
// sends for a loan EMI. It was not read at all: the account number has six visible digits after the mask, and the full stop in "Mr." ended the
// name at "Mr". So the account stayed unknown, and the draft's account list (which then offered every account, including the MOD deposit under
// the savings account) let the payment be saved against the deposit instead of the bank account.
import { test, equal, ok } from './harness.js';
import { parseAlert, resolveAccount, findDigits, splitAlerts, alertFingerprint, findExisting } from '../js/alerts.js';
import { seedBasics, putAll, txn, rupees, day } from './fixtures.js';
import { computeFreeToSpend } from '../js/free-to-spend.js';
import { isSweepDeposit } from '../js/account-metrics.js';
import { paise } from './harness.js';

const sbi = (bal = '2,11,748.50') => `Greetings from SBI !\n\nYour A/C XXXXX890385 Debited INR 23,000.00 on 15/10/26 -Transferred to Mr. HARIHAR MANOJKUM. Avl Balance INR ${bal}-SBI`;

test('SBI alert: the account is the last four digits after the mask, the person is the name without the title', () => {
  const p = parseAlert(sbi());
  equal(p.last4, '0385');
  equal(p.instrument, 'account');
  equal(p.bank, 'SBI');
  equal(p.direction, 'debit');
  equal(p.amount, 2300000);
  equal(p.date, '2026-10-15');
  equal(p.party, 'HARIHAR MANOJKUM');
});

test('SBI alert: the same alert twice (two EMIs) reads the same each time and only the balance differs', () => {
  const a = parseAlert(sbi('2,11,748.50'));
  const b = parseAlert(sbi('1,88,772.50'));
  equal([a.last4, a.amount, a.date, a.party], [b.last4, b.amount, b.date, b.party]);
});

test('alert digits: the usual ways a bank masks an account still read the last four', () => {
  equal(findDigits('A/c XX1234 debited').last4, '1234');
  equal(findDigits('your A/c no. ending 5678 is debited').last4, '5678');
  equal(findDigits('Card XX4417 used').last4, '4417');
  equal(findDigits('A/c 4000XXXXXXXX9999 debited').last4, '9999');
  equal(findDigits('A/c XXXXX890385 debited').last4, '0385');
  equal(findDigits('A/c XXXXXXXX1234 debited').last4, '1234');
});

test('alert party: a title is not the name, but a name that merely starts with those letters is kept', () => {
  equal(parseAlert('Your A/C XXXXX890385 Debited INR 500.00 on 15/10/26 -Transferred to Mrunal Shah. Avl Balance INR 1,000.00-SBI').party, 'Mrunal Shah');
  equal(parseAlert('Your A/C XXXXX890385 Debited INR 500.00 on 15/10/26 -Transferred to Dr. Asha Rao. Avl Balance INR 1,000.00-SBI').party, 'Asha Rao');
});

const bank = { id: 'a4', type: 'bank', label: 'SBI Savings', issuer: 'State Bank Of India', last4: '0385' };
const mod = { id: 'a5', type: 'savings', label: 'SBI MOD', issuer: 'State Bank Of India', last4: '0385', depositOf: 'a4', deposit: { kind: 'MOD' } };

test('SBI alert: it goes to the bank account, never to the MOD deposit that shares its number', () => {
  const p = parseAlert(sbi());
  equal(resolveAccount(p, [mod, bank], []).id, 'a4');
  equal(resolveAccount(p, [bank, mod], []).id, 'a4');
});

test('alert account: with no word saying what the digits are, a bank account still wins over a deposit with the same digits', () => {
  const p = { ...parseAlert(sbi()), instrument: null };
  equal(resolveAccount(p, [mod, bank], []).id, 'a4');
});

test('alert account: two bank accounts with the same digits and no way to tell are still asked, not guessed', () => {
  const other = { ...bank, id: 'a9', label: 'SBI Salary' };
  const p = { ...parseAlert(sbi()), instrument: null };
  equal(resolveAccount(p, [bank, other], []), null);
});

test('alert account: SBI in the alert is State Bank Of India on the account, so it picks the SBI one among banks that share the digits', () => {
  const hdfc = { id: 'h1', type: 'bank', label: 'HDFC Salary', issuer: 'HDFC Bank', last4: '0385' };
  const p = { ...parseAlert(sbi()), instrument: null };
  equal(resolveAccount(p, [hdfc, bank], []).id, 'a4');
});

// SBI's MOD is broken in blocks to pay whatever the account has to pay, so the owner counts it with the account (18 Oct 2026).
test('MOD: only a MOD under an account counts with it; a plain fixed deposit and a lone savings account do not', () => {
  equal(isSweepDeposit(mod), true);
  equal(isSweepDeposit({ ...mod, deposit: { kind: 'FD' } }), false);
  equal(isSweepDeposit({ ...mod, depositOf: undefined }), false);
  equal(isSweepDeposit(bank), false);
});

async function seedPool() {
  await seedBasics({ bankBalance: 5000, balanceDate: '2026-09-15' });
  const before = await computeFreeToSpend(day('2026-09-16'));
  await putAll('accounts', [
    { id: 'mod', label: 'SBI MOD', type: 'savings', issuer: 'Test Bank', last4: '1111', depositOf: 'bank', deposit: { kind: 'MOD' }, knownBalance: rupees(230000), knownBalanceDate: '2026-09-15' },
    { id: 'fd', label: 'Fixed deposit', type: 'savings', issuer: 'Test Bank', last4: '1111', depositOf: 'bank', deposit: { kind: 'FD' }, knownBalance: rupees(100000), knownBalanceDate: '2026-09-15' },
  ]);
  return before;
}

test('MOD pool: the bank figure counts the MOD with its account, and a plain fixed deposit stays money put away', async () => {
  const before = await seedPool();
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.bank, before.bank + rupees(230000));
  ok(!f.savings.some((s) => s.account.id === 'mod'), 'the MOD is not also listed as savings');
  ok(f.savings.some((s) => s.account.id === 'fd'), 'the plain FD is');
});

test('MOD pool: a payment out of the MOD lowers the pool and is not spending (it is the account paying, as its own rows say)', async () => {
  const before = await seedPool();
  await putAll('transactions', [txn({ accountId: 'mod', date: '2026-09-16', amount: 23000, rawDescription: 'EMI' })]);
  const f = await computeFreeToSpend(day('2026-09-20'));
  paise(f.bank, before.bank + rupees(230000) - rupees(23000));
  paise(f.spentThisCycle, 0);
});

test('pasting two SBI alerts gives two items, each with its greeting, not a third item that is only the greeting', () => {
  const two = `${sbi('2,11,748.50')}\n\n${sbi('1,88,772.50')}`;
  const pieces = splitAlerts(two);
  equal(pieces.length, 2);
  ok(pieces.every((x) => /^Greetings from SBI !\nYour A\/C/.test(x)), pieces.join(' | '));
  equal(pieces.map((x) => parseAlert(x).ok), [true, true]);
});

test('a greeting with nothing after it stays as it is, and an ordinary message is never joined to the one before it', () => {
  equal(splitAlerts('Greetings from SBI !').length, 1);
  equal(splitAlerts('Spent Rs.30.00 On HDFC Bank Card 4321 At METRO On 2026-09-10:08:15:01\n\nSpent Rs.40.00 On HDFC Bank Card 4321 At CAFE On 2026-09-10:09:15:01').length, 2);
});

test('two EMIs of the same amount on the same day are two alerts, told apart by the balance printed after each', () => {
  const a = parseAlert(sbi('2,11,748.50'));
  const b = parseAlert(sbi('1,88,772.50'));
  equal(a.balanceAfter, 21174850);
  equal(b.balanceAfter, 18877250);
  ok(alertFingerprint(a) !== alertFingerprint(b), 'different alerts');
  equal(alertFingerprint(a), alertFingerprint(parseAlert(sbi('2,11,748.50'))), 'the same alert pasted twice is still one');
});

test('an alert without a balance fingerprints as before', () => {
  const p = parseAlert('Spent Rs.30.00 On HDFC Bank Card 4321 At METRO On 2026-09-10:08:15:01');
  equal(p.balanceAfter, null);
});

test('a second alert of the same amount on the same day is not "a repeat" when the balance printed after it is different', () => {
  const first = parseAlert(sbi('2,11,748.50'));
  const second = parseAlert(sbi('1,88,772.50'));
  const saved = [{ id: 't1', accountId: 'a4', direction: 'debit', amount: 2300000, date: '2026-10-15', alertKey: alertFingerprint(first), alertBalance: first.balanceAfter }];
  equal(findExisting(second, 'a4', saved), null);
  equal(findExisting(first, 'a4', saved).kind, 'same-alert');
  // An older saved row with no balance on it is still asked about, as before.
  const old = [{ id: 't2', accountId: 'a4', direction: 'debit', amount: 2300000, date: '2026-10-15' }];
  equal(findExisting(second, 'a4', old).kind, 'likely');
});

test('a wording taught from an SBI alert still reads the account and the balance the next time', async () => {
  const { useLearned } = await import('../js/alerts.js');
  // What teaching leaves behind for this wording: holes for the amount, the date and who, none for the digits it could not mark.
  useLearned([{ re: String.raw`Your\s+A\/C\s+XXXXX[\d,.]+\s+Debited\s+INR\s+([\d,.]+)\s+on\s+(\d+\/\d+\/\d+)\s+-Transferred\s+to\s+Mr\.\s+(.+?)\.\s+Avl`, groups: ['amount', 'date', 'party'], kind: 'unknown', direction: 'debit', instrument: 'account' }]);
  try {
    const p = parseAlert(sbi('1,88,772.50'));
    equal(p.format, 'learned');
    equal(p.last4, '0385');
    equal(p.instrument, 'account');
    equal(p.balanceAfter, 18877250);
    equal(resolveAccount(p, [mod, bank], []).id, 'a4');
  } finally {
    useLearned([]);
  }
});

/* --- SBI's all-accounts statement (5.88) ---------------------------------------------------------------------------------------------
   The owner's Sept 2026 file was read by the general reader: the balance became the amount, there was no balance column to find, "credit card"
   appears in the bank's warning line, so a new CARD was made and the loan pages' rows were saved on it. */
import { detectParser } from '../js/parsers/registry.js';
import * as sbiStatement from '../js/parsers/sbi-statement.js';
import { sameTransaction, findDuplicates } from '../js/duplicates.js';

const ALL_ACCOUNTS = [
  'Welcome Mr. A PERSON', 'PLEASE DO NOT SHARE YOUR ATM, DEBIT/CREDIT CARD NUMBER, PIN AND OTP WITH ANYONE ELSE.',
  'TRANSACTION DETAILS', 'CURRENT ACCOUNT', 'XXXXXXX5555', 'IFSC Code SBIN0060070', 'Multi-Option Deposit Balance 0.00',
  'TRANSACTION DETAILS', 'SAVING ACCOUNT', 'XXXXXXX1234', 'IFSC Code SBIN0060070', 'Multi-Option Deposit Balance 90000.00',
  'TRANSACTION OVERVIEW', 'Date Transaction Reference Ref.No./Chq.No. Credit Debit Balance',
  'Your Opening Balance on 01-09-26:null null 50000.00 null null null null',
  '08-09-26 FIRDFTFRREF:111111111111111111K580035 - 0 30000.00 20000.00',
  '09-09-26 UPI/CR/111111111111/SOMEONE/utib/goog-payme/UPI - 1.00 0 20001.00',
  '15-09-26 SWEEP TRF CREDT - 15000.00 0 35001.00',
  '15-09-26 DIRECT DR - 0 20000.00 15001.00',
  '30-09-26 IMPS/222222222222/RE1-XX150-A PERSON /Home Loan - 40000.00 0 55001.00',
  'Your Closing Balance on 30-09-26: 55001.00',
  'TRANSACTION DETAILS', 'DL/TL ACCOUNT', 'XXXXXXX9999', 'TRANSACTION OVERVIEW',
  'Your Opening Balance on 01-09-26:null null 3000000.00 null null null null',
  '15-09-26 O.S. DEPOSIT TRANSFER - 20000.00 0 2980000.00',
  'Your Closing Balance on 30-09-26: 2980000.00',
].join('\n');

test('SBI all-accounts statement: its own reader takes it, from the savings page only, credit column before debit', () => {
  equal(detectParser(ALL_ACCOUNTS).id, 'sbi-statement');
  const { rows, meta } = sbiStatement.parse(ALL_ACCOUNTS);
  equal(rows.length, 5, 'the loan page and the current account add nothing');
  equal(rows.map((r) => [r.date, r.direction, r.amount]), [
    ['2026-09-08', 'debit', 3000000], ['2026-09-09', 'credit', 100], ['2026-09-15', 'credit', 1500000], ['2026-09-15', 'debit', 2000000], ['2026-09-30', 'credit', 4000000],
  ]);
  equal(meta.accountLast4, '1234');
  equal([meta.periodStart, meta.periodEnd, meta.reconciled], ['2026-09-01', '2026-09-30', true]);
  ok(rows[0].isTransfer && rows[2].isTransfer && !rows[3].isTransfer, 'money into and out of its own deposits is a move, an EMI is not');
});

test('SBI all-accounts statement: a file with no savings page gives no rows, so the import falls back instead of inventing an account', () => {
  const loanOnly = ALL_ACCOUNTS.split('\n').filter((l) => l !== 'SAVING ACCOUNT').join('\n');
  equal(sbiStatement.parse(loanOnly).rows.length, 0);
});

test('copies a day apart: the same bank reference is one payment, a different one is two', () => {
  const emi = { accountId: 'bank', amount: rupees(68000), direction: 'debit' };
  const pdf = txn({ ...emi, date: '2026-09-30', importBatchId: 'pdf', updatedAt: 2, rawDescription: 'IMPS-600000000002-01 SBI Savings Home Loan EmI Value Dt 30/09/2026 Ref 600000000002' });
  const netbanking = txn({ ...emi, date: '2026-10-01', importBatchId: 'nb', updatedAt: 1, rawDescription: 'IMPS-600000000002-01 SBI SAVINGS-HOME LOAN EMI' });
  ok(sameTransaction(pdf, netbanking));
  equal(findDuplicates([pdf, netbanking]).map((t) => t.id), [pdf.id], 'the one saved first is kept');
  const other = txn({ ...emi, date: '2026-10-01', importBatchId: 'nb', rawDescription: 'IMPS-600000000009-01 SBI SAVINGS-HOME LOAN EMI' });
  ok(!sameTransaction(pdf, other));
  equal(findDuplicates([pdf, other]).length, 0);
  const noRef = txn({ ...emi, date: '2026-10-01', importBatchId: 'nb', rawDescription: 'HOME LOAN EMI HOME LOAN EMI HOME LOAN EMI' });
  ok(!sameTransaction(pdf, noRef), 'without a number on both, a day apart is never enough');
});
