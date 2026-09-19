// Whole situations run through the same calculation the Summary uses,
// against a separate test database.
import { test, equal, ok, paise } from './harness.js';
import { seedBasics, putAll, txn, commitment, rupees, day } from './fixtures.js';
import { computeFreeToSpend } from '../js/free-to-spend.js';
import { getAll, put } from '../js/db.js';
import { detectRecurring } from '../js/recurring.js';
import { detectTransfers } from '../js/transfers.js';
import { syncNow, getSyncConfig, getSyncPassphrase, turnOnGoogleSync } from '../js/sync.js';
import { setBackupPassphrase, backUpToDrive, listBackups, SYNC_FILE } from '../js/drive.js';
import { encryptPayload, decryptPayload, exportEncrypted, decryptBackup, restoreBackup } from '../js/backup.js';
import { takenHome, categoriesFor } from '../js/business.js';

// Salary ₹1,00,000; commitments: EMI ₹40,000 (bank), rent ₹20,000 (bank),
// ATM ₹10,000 (bank), Netflix ₹649 (card), Metro ₹1,000 (cash); ₹5,000 saved.
async function seedMonth() {
  await seedBasics();
  const items = {
    emi: commitment({ label: 'Home Loan EMI', amount: 40000, matchText: 'Home Loan EMI' }),
    rent: commitment({ label: 'House Rent', amount: 20000 }),
    atm: commitment({ label: 'ATM Withdrawal', amount: 10000 }),
    netflix: commitment({ label: 'Netflix', amount: 649, dayOfMonth: 5, accountId: 'card', matchText: 'NETFLIX' }),
    metro: commitment({ label: 'Metro', amount: 1000, accountId: 'cash' }),
  };
  await putAll('recurring', Object.values(items));
  return items;
}

test('budget = salary − bank and card commitments − saving (cash comes out of ATM money)', async () => {
  await seedMonth();
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.limit, rupees(100000 - 40000 - 20000 - 10000 - 649 - 5000));
});

test('with no commitments there is no budget figure, only the reminder to add them', async () => {
  await seedBasics();
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.free, null);
  ok(f.noCommitments);
});

test('spent: commitment payments are not spending, anything beyond a commitment is', async () => {
  await seedMonth();
  await putAll('transactions', [
    // Paid on salary day (31 Aug) for September
    txn({ accountId: 'bank', date: '2026-08-31', amount: 40000, rawDescription: 'IMPS-555555555555-SBI-Home Loan EMI' }),
    txn({ accountId: 'bank', date: '2026-08-31', amount: 20000, rawDescription: 'IMPS-666666666666-LANDLORD' }),
    // ATM ₹12,000 against ₹10,000 planned: ₹2,000 is extra spending
    txn({ accountId: 'bank', date: '2026-09-02', amount: 4000, rawDescription: 'ATW-400000XXXXXX1111-S1AWMI30' }),
    txn({ accountId: 'bank', date: '2026-09-02', amount: 8000, rawDescription: 'ATW-400000XXXXXX1111-S1AWMI31' }),
    txn({ accountId: 'bank', date: '2026-09-05', amount: 450, rawDescription: 'UPI-CAFE-777777777777' }),
    txn({ accountId: 'card', date: '2026-09-05', amount: 649, rawDescription: 'NETFLIX.COM' }),
    txn({ accountId: 'card', date: '2026-09-10', amount: 3000, rawDescription: 'SHOES' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(2000 + 450 + 3000));
  paise(f.free, f.limit - rupees(5450));
  const atm = f.tracker.find((t) => t.label === 'ATM Withdrawal');
  equal([atm.status, atm.used], ['over', rupees(12000)]);
  equal(f.tracker.find((t) => t.label === 'Home Loan EMI').status, 'paid');
  equal(f.cutBack.map((t) => t.label), ['ATM Withdrawal']);
});

test('a loan EMI is repaying a debt, never spending, whichever way it is budgeted', async () => {
  await seedMonth();
  // Two home loans of ₹23,000 each, paid out of the bank on the 15th. The
  // ₹40,000 commitment above is what funds them, so the loans themselves are
  // kept out of the budget.
  const loan = (id, outstanding) => ({
    id,
    type: 'loan',
    label: `Home Loan ${id}`,
    loan: { principal: rupees(4500000), outstanding, outstandingAsOf: '2026-08-31', ratePct: 7.75, emi: rupees(23000), day: 15, paidFromId: 'bank', inBudget: false },
  });
  await putAll('accounts', [loan('l1', rupees(3100000)), loan('l2', rupees(3000000))]);
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO 51112222001' }),
    txn({ accountId: 'bank', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO 51112222002' }),
    txn({ accountId: 'bank', date: '2026-09-05', amount: 450, rawDescription: 'UPI-CAFE-777777777777' }),
  ]);
  const out = await computeFreeToSpend(day('2026-09-16'));
  // Only the coffee. The ₹46,000 of EMIs is debt coming down, not money gone.
  paise(out.spentThisCycle, rupees(450));
  paise(out.limit, rupees(100000 - 40000 - 20000 - 10000 - 649 - 5000));

  // Counted in the budget instead: each EMI becomes its own commitment, the
  // budget drops by ₹46,000, and the payments still are not spending.
  const accounts = await getAll('accounts');
  for (const a of accounts.filter((x) => x.type === 'loan')) await put('accounts', { ...a, loan: { ...a.loan, inBudget: true } });
  const inBudget = await computeFreeToSpend(day('2026-09-16'));
  paise(inBudget.spentThisCycle, rupees(450));
  paise(inBudget.limit, out.limit - rupees(46000));
});

test('an account kept for savings or a loan: nothing leaving it is spending, and its money is put away', async () => {
  await seedMonth();
  await putAll('accounts', [
    { id: 'savebank', label: 'Savings Bank', type: 'bank', spending: false, knownBalance: rupees(71450), knownBalanceDate: '2026-09-05' },
  ]);
  await putAll('transactions', [
    // Money into a fixed deposit at the same bank, and a withdrawal.
    txn({ accountId: 'savebank', date: '2026-09-08', amount: 40000, rawDescription: 'WDL TFR 00000000001 MOD DEPOSIT' }),
    txn({ accountId: 'savebank', date: '2026-09-08', amount: 30000, rawDescription: 'WDL TFR 00000000002 MOD DEPOSIT' }),
    txn({ accountId: 'bank', date: '2026-09-05', amount: 450, rawDescription: 'UPI-CAFE-777777777777' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(450));
  // The ₹50,000 in the account you spend from is what's in the bank; the
  // savings account is listed apart, with what is left in it.
  paise(f.bank, rupees(50000));
  equal(f.bankLines.map((l) => l.account.id), ['bank']);
  const saved = f.savings.find((s) => s.account.id === 'savebank');
  paise(saved.balance, rupees(71450 - 40000 - 30000));
});

test('money sent and sent back is not spending; a different payer is', async () => {
  await seedMonth();
  await putAll('transactions', [
    // (Not ₹20,000: the rent commitment here would claim that first.)
    txn({ accountId: 'bank', date: '2026-09-01', amount: 12345, rawDescription: 'UPI-A FRIEND-friend@okaxis-HDFC0000001-123456789012-UPI' }),
    // The bank words the name differently on money coming in; the UPI ID is
    // what has to match.
    txn({ accountId: 'bank', date: '2026-09-09', amount: 12345, direction: 'credit', rawDescription: 'UPI-FRIEND A-friend@okaxis-SBIN0000009-123456789013-UPI' }),
    // Same amount back, but from someone else: that is not this money.
    txn({ accountId: 'bank', date: '2026-09-02', amount: 5000, rawDescription: 'UPI-SHOP-shop@ybl-HDFC0000001-223456789012-UPI' }),
    txn({ accountId: 'bank', date: '2026-09-10', amount: 5000, direction: 'credit', rawDescription: 'UPI-OTHER-other@ybl-HDFC0000001-223456789013-UPI' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(5000));
  equal(f.returned.map((p) => [p.sent.date, p.back.date]), [['2026-09-01', '2026-09-09']]);
});

test('the same EMI imported twice (two statement formats) counts once', async () => {
  await seedMonth();
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-08-31', amount: 40000, rawDescription: 'IMPS-600000000002-01 SBI-Home Loan EMI', importBatchId: 'pdf', updatedAt: 1 }),
    txn({ accountId: 'bank', date: '2026-08-31', amount: 40000, rawDescription: 'IMPS/600000000002/SBI/Home Loan EMI', importBatchId: 'year', updatedAt: 2 }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.duplicates.length, 1);
  const emi = f.tracker.find((t) => t.label === 'Home Loan EMI');
  equal([emi.status, emi.used, emi.matches.length], ['paid', rupees(40000), 1]);
  paise(f.spentThisCycle, 0);
});

test('mark paid: a bank commitment the app cannot see counts as paid for this month only', async () => {
  const { rent } = await seedMonth();
  await put('recurring', { ...rent, paidCycles: ['2026-09-25'] });
  let f = await computeFreeToSpend(day('2026-09-16'));
  const row = f.tracker.find((t) => t.label === 'House Rent');
  equal([row.status, row.marked], ['paid', true]);
  f = await computeFreeToSpend(day('2026-09-27'));
  equal(f.tracker.find((t) => t.label === 'House Rent').marked, true, 'still September');
  f = await computeFreeToSpend(day('2026-10-01'));
  equal(f.tracker.find((t) => t.label === 'House Rent').marked, false);
});

test('skip this month: the commitment leaves the budget for this cycle only, and spending on it counts as spending', async () => {
  const { rent } = await seedMonth();
  await put('recurring', { ...rent, skippedCycles: ['2026-09-25'] });
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-05', amount: 20000, rawDescription: 'IMPS-666666666666-LANDLORD' })]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.limit, rupees(100000 - 40000 - 10000 - 649 - 5000));
  paise(f.spentThisCycle, rupees(20000));
  equal(f.tracker.find((t) => t.label === 'House Rent').status, 'skipped');
  const next = await computeFreeToSpend(day('2026-10-01'));
  paise(next.limit, rupees(100000 - 40000 - 20000 - 10000 - 649 - 5000));
});

test('"Not this": a payment removed from a commitment stops counting towards it', async () => {
  await seedMonth();
  const wrong = txn({ accountId: 'bank', date: '2026-09-03', amount: 20000, rawDescription: 'IMPS-999999999999-FRIEND' });
  await putAll('transactions', [wrong]);
  let f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.tracker.find((t) => t.label === 'House Rent').status, 'paid');
  const rentId = f.tracker.find((t) => t.label === 'House Rent').id;
  await put('transactions', { ...wrong, notCommitmentIds: [rentId] });
  f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.tracker.find((t) => t.label === 'House Rent').used, 0);
  paise(f.spentThisCycle, rupees(20000));
});

test('the same payment twice inside one import is a copy when it carries the same bank reference', async () => {
  await seedMonth();
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-08-31', amount: 40000, rawDescription: 'IMPS-600000000002-01 SBI Savings AC-SBIN-xxxxxxx0385-Home Loan EMI', importBatchId: 'year', updatedAt: 1 }),
    txn({ accountId: 'bank', date: '2026-08-31', amount: 40000, rawDescription: 'IMPS-600000000002-01 SBI SAVINGS AC-SBIN -XXXXXXX7788-HOME LOAN EMI', importBatchId: 'year', updatedAt: 2 }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.duplicates.length, 1);
  equal(f.tracker.find((t) => t.label === 'Home Loan EMI').status, 'paid');
});

test('two accounts for the same card are flagged', async () => {
  await seedMonth();
  await put('accounts', { id: 'card-copy', label: 'Test Card again', type: 'card', issuer: 'Other', last4: '2222', billingCycleDay: 25 });
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.duplicateAccounts.map((g) => g.map((a) => a.id).sort()), [['card', 'card-copy']]);
});

test('on the 26th a new cycle starts: spending resets and the card spends become a bill', async () => {
  await seedMonth();
  await putAll('transactions', [txn({ accountId: 'card', date: '2026-09-10', amount: 3000, rawDescription: 'SHOES' })]);
  const before = await computeFreeToSpend(day('2026-09-25'));
  paise(before.spentThisCycle, rupees(3000));
  const after = await computeFreeToSpend(day('2026-09-26'));
  paise(after.spentThisCycle, 0);
  paise(after.cardBills.reduce((s, b) => s + b.amount, 0), rupees(3000));
  equal(after.cycleClose, '2026-10-25');
});

test('bank check: after the next salary, bills and next month\'s commitments', async () => {
  await seedMonth();
  await putAll('transactions', [txn({ accountId: 'card', date: '2026-09-10', amount: 3000, rawDescription: 'SHOES' })]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  // ₹50,000 now + ₹1,00,000 salary − ₹70,000 bank commitments − ₹3,000 card
  // spends. Netflix (due the 5th) isn't held back: that date has passed this
  // cycle, and October's charge lands on the next bill.
  paise(f.bankAfterBills, rupees(50000 + 100000 - 70000 - 3000));
});

test('an early salary is not counted twice', async () => {
  await seedMonth();
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-28', amount: 100000, direction: 'credit', rawDescription: 'NEFT CR SALARY' })]);
  const f = await computeFreeToSpend(day('2026-09-29'));
  ok(f.salary.alreadyIn, 'salary seen as already in');
  ok(!f.salary.dates.includes('2026-09-30'), 'the 30 Sep salary is not added again');
});

test('an account with nothing new for over a week is flagged as stale', async () => {
  await seedMonth();
  const f = await computeFreeToSpend(day('2026-09-24'));
  equal(f.stale.map((s) => [s.account.id, s.days]), [['bank', 9]]);
  equal((await computeFreeToSpend(day('2026-09-20'))).stale.length, 0);
});

test('database reads are copies: changing one never leaks into the next read', async () => {
  await seedMonth();
  const first = await getAll('recurring');
  first[0].label = 'CHANGED';
  const second = await getAll('recurring');
  ok(second.every((r) => r.label !== 'CHANGED'));
  await put('recurring', { ...second[0], label: 'Saved' });
  ok((await getAll('recurring')).some((r) => r.label === 'Saved'), 'a write is seen by the next read');
});

test('detecting recurring bills does not re-save them when nothing changed', async () => {
  await seedBasics();
  await putAll('transactions', [
    txn({ accountId: 'card', date: '2026-07-14', amount: 489, rawDescription: 'GOOGLE PLAY CONTENT MUMBAI' }),
    txn({ accountId: 'card', date: '2026-08-14', amount: 489, rawDescription: 'GOOGLE PLAY CONTENT MUMBAI' }),
  ]);
  await detectRecurring();
  const stamp = (await getAll('recurring')).map((r) => r.updatedAt);
  await new Promise((r) => setTimeout(r, 5));
  await detectRecurring();
  equal((await getAll('recurring')).map((r) => r.updatedAt), stamp);
});

test('an ATM alert saved as money moved still counts towards the cash commitment', async () => {
  await seedMonth();
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-09-06', amount: 3000, source: 'alert', isTransfer: true, rawDescription: 'Cash withdrawal at ATM S1AWMI30' }),
    txn({ accountId: 'bank', date: '2026-09-08', amount: 2000, isTransfer: true, rawDescription: 'NWD-400000XXXXXX1111-12041HHR-MUMBAI Value Dt 08/09/2026 Ref 000000621812' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.tracker.find((t) => t.label === 'ATM Withdrawal').used, rupees(5000));
  paise(f.spentThisCycle, 0);
});

test('over budget: the unused part of a commitment is marked "stop", with a reason when nothing matched', async () => {
  await seedMonth();
  await putAll('recurring', [
    commitment({ label: 'Amazon Pay top-up', amount: 15000, spread: true, accountId: 'card', matchText: 'AMAZON PAY' }),
    commitment({ label: 'Gym', amount: 1500, dayOfMonth: 10, accountId: 'card', matchText: 'CULTFIT' }),
  ]);
  await putAll('transactions', [
    txn({ accountId: 'card', date: '2026-09-02', amount: 13000, rawDescription: 'AMAZON PAY WALLET LOAD' }),
    txn({ accountId: 'card', date: '2026-09-10', amount: 20000, rawDescription: 'SOFA' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  ok(f.free < 0, 'over budget');
  const amazon = f.tracker.find((t) => t.label === 'Amazon Pay top-up');
  equal([amazon.left, amazon.stop && amazon.stop.safe], [rupees(2000), 0]);
  ok(/No entry in the app contains "CULTFIT"/.test(f.tracker.find((t) => t.label === 'Gym').hint || ''), 'gym explains why nothing matched');
});

test('suggestions: rent sent by transfer and monthly ATM cash, added with their statement words', async () => {
  await seedBasics();
  const rent = (date, ref) => txn({ accountId: 'bank', date, amount: 20000, isTransfer: true, rawDescription: `IMPS-${ref}-LANDLORD NAME-HDFC-XXXX1234-House rent` });
  await putAll('transactions', [
    rent('2026-06-30', '611111111111'),
    rent('2026-07-31', '622222222222'),
    rent('2026-08-31', '633333333333'),
    txn({ accountId: 'bank', date: '2026-06-30', amount: 20000, isTransfer: true, rawDescription: 'CRED CLUB CC PAYMENT 644444444444' }),
    txn({ accountId: 'bank', date: '2026-07-31', amount: 20000, isTransfer: true, rawDescription: 'CRED CLUB CC PAYMENT 655555555555' }),
    txn({ accountId: 'bank', date: '2026-07-05', amount: 4000, rawDescription: 'NWD-400000XXXXXX1111-A1' }),
    txn({ accountId: 'bank', date: '2026-07-20', amount: 5000, rawDescription: 'NWD-400000XXXXXX1111-A2' }),
    txn({ accountId: 'bank', date: '2026-08-11', amount: 10000, rawDescription: 'ATW-400000XXXXXX1111-A3' }),
  ]);
  const found = await detectRecurring(day('2026-09-16'));
  const landlord = found.find((d) => /landlord/i.test(d.label));
  ok(landlord, 'rent suggested even though marked as money moved');
  ok(!found.some((d) => /cred/i.test(d.label)), 'card bill payments are not suggested');
  const cash = found.find((d) => d.cash);
  equal([cash && cash.amount, cash && cash.spread], [rupees(9500), true]);

  const { commitmentFromSuggestion } = await import('../js/commitments.js');
  const made = commitmentFromSuggestion(landlord, 'fixed-rent');
  equal([made.accountId, made.source, Boolean(made.matchText)], [null, 'fixed', true]);
  await put('recurring', made);
  await putAll('transactions', [rent('2026-09-30', '666666666666')]);
  const f = await computeFreeToSpend(day('2026-10-01'));
  equal(f.tracker.find((t) => t.id === 'fixed-rent').status, 'paid');
});

test('bank spending runs by the calendar month, card spending by the card cycle', async () => {
  await seedMonth();
  await putAll('transactions', [
    // 27 Aug: inside the card cycle (from 26 Aug) but not in September
    txn({ accountId: 'bank', date: '2026-08-27', amount: 700, rawDescription: 'UPI-GROCER-111111111111' }),
    txn({ accountId: 'card', date: '2026-08-27', amount: 900, rawDescription: 'BOOKS' }),
    txn({ accountId: 'bank', date: '2026-09-02', amount: 300, rawDescription: 'UPI-CAFE-222222222222' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal([f.bankMonthStart, f.bankMonthEnd, f.cycleStart], ['2026-09-01', '2026-09-30', '2026-08-26']);
  paise(f.bankSpent, rupees(300));
  paise(f.spentThisCycle, rupees(300 + 900));
});

test('no look-back: payments made in August never count for September, except EMI and rent paid on salary day', async () => {
  await seedMonth();
  const tiffin = commitment({ label: 'Tiffin Bill', amount: 14000, spread: true, matchText: 'COOKNAME' });
  const parking = commitment({ label: 'Parking', amount: 1100, spread: true, matchText: 'PARKING' });
  await putAll('recurring', [tiffin, parking]);
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-08-24', amount: 1357, rawDescription: 'UPI-COOKNAME-111111111111-Tiffin' }),
    txn({ accountId: 'bank', date: '2026-08-31', amount: 2000, rawDescription: 'UPI-COOKNAME-222222222222-Tiffin' }),
    txn({ accountId: 'bank', date: '2026-08-25', amount: 50, rawDescription: 'UPI-Aarey PARKING-333333333333' }),
    txn({ accountId: 'bank', date: '2026-09-03', amount: 900, rawDescription: 'UPI-COOKNAME-444444444444-Tiffin' }),
    txn({ accountId: 'bank', date: '2026-09-04', amount: 50, rawDescription: 'UPI-Aarey PARKING-555555555555' }),
    // Salary day (31 Aug): the EMI for September
    txn({ accountId: 'bank', date: '2026-08-31', amount: 40000, rawDescription: 'IMPS-666666666666-Home Loan EMI' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-17'));
  const row = (label) => f.tracker.find((t) => t.label === label);
  equal([row('Tiffin Bill').used, row('Parking').used, row('Home Loan EMI').status], [rupees(900), rupees(50), 'paid']);
  equal(row('Home Loan EMI').matches[0].onSalaryDay, true);
  paise(f.bankSpent, 0);
});

test('an EMI paid on this month\'s salary day is next month\'s: not this month\'s payment, and not spending', async () => {
  await seedMonth();
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-09-01', amount: 40000, rawDescription: 'IMPS-111111111111-Home Loan EMI' }),
    txn({ accountId: 'bank', date: '2026-09-30', amount: 40000, rawDescription: 'IMPS-222222222222-Home Loan EMI' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-30'));
  const emi = f.tracker.find((t) => t.label === 'Home Loan EMI');
  equal([emi.status, emi.used], ['paid', rupees(40000)]);
  paise(f.bankSpent, 0);
  const october = await computeFreeToSpend(day('2026-10-02'));
  equal(october.tracker.find((t) => t.label === 'Home Loan EMI').status, 'paid');
});

test('a spend tagged with a commitment when logged counts towards it, from any card, and no other commitment takes it', async () => {
  const { netflix } = await seedMonth();
  const wallet = commitment({ label: 'Amazon Pay Balance', amount: 15000, spread: true, accountId: 'card', matchText: 'AMAZON' });
  await putAll('recurring', [wallet]);
  await put('accounts', { id: 'card2', label: 'Other Card', type: 'card', issuer: 'Other', last4: '3333', billingCycleDay: 25 });
  await putAll('transactions', [
    txn({ accountId: 'card2', date: '2026-09-05', amount: 5000, source: 'manual', rawDescription: 'wallet top up', commitmentId: wallet.id }),
    // Says NETFLIX, but you tagged it to the wallet
    txn({ accountId: 'card', date: '2026-09-06', amount: 649, source: 'manual', rawDescription: 'NETFLIX gift card', commitmentId: wallet.id }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.tracker.find((t) => t.label === 'Amazon Pay Balance').used, rupees(5649));
  equal(f.tracker.find((t) => t.id === netflix.id).used, 0);
  paise(f.spentThisCycle, 0);
});

test('"Not this" payments are listed so they can be counted again', async () => {
  const { atm } = await seedMonth();
  const a = txn({ accountId: 'bank', date: '2026-09-02', amount: 16000, rawDescription: 'ATW-400000XXXXXX1111-S1AWMI30-MUMBAI', notCommitmentIds: [atm.id] });
  const b = txn({ accountId: 'bank', date: '2026-09-02', amount: 10000, rawDescription: 'ATW-400000XXXXXX1111-S1AWMI30-MUMBAI', notCommitmentIds: [atm.id] });
  await putAll('transactions', [a, b]);
  let f = await computeFreeToSpend(day('2026-09-17'));
  let row = f.tracker.find((t) => t.id === atm.id);
  equal([row.used, row.notThis.map((n) => n.id).sort()], [0, [a.id, b.id].sort()]);
  ok(/Count it again/.test(row.hint), 'hint says how to undo');
  await putAll('transactions', [{ ...a, notCommitmentIds: [] }, { ...b, notCommitmentIds: [] }]);
  f = await computeFreeToSpend(day('2026-09-17'));
  row = f.tracker.find((t) => t.id === atm.id);
  equal([row.used, row.status], [rupees(26000), 'over']);
});

test('the same payments in two downloads worded too differently to match are counted once', async () => {
  await seedMonth();
  const tiffin = commitment({ label: 'Tiffin Bill', amount: 14000, spread: true, matchText: 'COOKNAME' });
  await putAll('recurring', [tiffin]);
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-09-01', amount: 900, importBatchId: 'pdf', updatedAt: 1, rawDescription: 'UPI-COOKNAME-cook@okicici-111111111111-UPI' }),
    txn({ accountId: 'bank', date: '2026-09-01', amount: 900, importBatchId: 'year', updatedAt: 2, rawDescription: 'CHQ PAID DR. 66-67/3 UPI-COOKNAME' }),
    // Two real parking payments on one day, in both downloads
    txn({ accountId: 'bank', date: '2026-09-04', amount: 50, importBatchId: 'pdf', updatedAt: 3, rawDescription: 'UPI-PARK-a' }),
    txn({ accountId: 'bank', date: '2026-09-04', amount: 50, importBatchId: 'pdf', updatedAt: 4, rawDescription: 'UPI-PARK-b' }),
    txn({ accountId: 'bank', date: '2026-09-04', amount: 50, importBatchId: 'year', updatedAt: 5, rawDescription: 'PARKING X' }),
    txn({ accountId: 'bank', date: '2026-09-04', amount: 50, importBatchId: 'year', updatedAt: 6, rawDescription: 'PARKING Y' }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-17'));
  equal(f.duplicates.length, 3);
  equal(f.tracker.find((t) => t.label === 'Tiffin Bill').used, rupees(900));
});

test('a card\'s statement day comes from its imported statements, whatever was typed in', async () => {
  await seedMonth();
  await put('accounts', { id: 'card', label: 'Test Card', type: 'card', issuer: 'Test Bank', last4: '2222', billingCycleDay: 26 });
  await put('importBatches', { id: 'stmt', accountId: 'card', periodStart: '2026-07-26', periodEnd: '2026-08-25', provisional: false, importedAt: '2026-08-27T10:00:00Z' });
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal([f.cycleStart, f.cycleClose], ['2026-08-26', '2026-09-25']);
});

test('a CRED payment that could be either card is listed until you say which card it paid', async () => {
  await seedMonth();
  await put('accounts', { id: 'card2', label: 'Other Card', type: 'card', issuer: 'Other', last4: '3333', billingCycleDay: 25 });
  const cred = txn({ accountId: 'bank', date: '2026-09-05', amount: 3000, isTransfer: true, rawDescription: 'UPI-CRED Club-cred.club@axisb-111111111111-PAYMENT ON CRED' });
  await putAll('transactions', [
    txn({ accountId: 'card', date: '2026-08-10', amount: 3000, rawDescription: 'SHOES' }),
    txn({ accountId: 'card2', date: '2026-08-12', amount: 3000, rawDescription: 'BAG' }),
    cred,
  ]);
  let f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.unassignedCardPayments.map((t) => t.id), [cred.id]);
  await put('transactions', { ...cred, paysCardId: 'card2' });
  f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.unassignedCardPayments.length, 0);
  paise(f.cards.find((c) => c.account.id === 'card2').unpaid, 0);
  paise(f.cards.find((c) => c.account.id === 'card').unpaid, rupees(3000));
});

test('money moved to your own other account is a transfer, not spending', async () => {
  await seedMonth();
  await put('accounts', { id: 'sbi', label: 'SBI Savings', type: 'bank', issuer: 'SBI', last4: '7788' });
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-09-05', amount: 68000, rawDescription: 'IMPS-111111111111-01 SBI Savings AC-SBIN-xxxx0385' }),
    txn({ accountId: 'sbi', date: '2026-09-05', amount: 68000, direction: 'credit', rawDescription: 'DEP TFR NEFT HDFC' }),
  ]);
  const moved = await detectTransfers();
  ok(moved >= 2, 'both halves flagged');
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.bankSpent, 0);
});

test("a loan's EMI is a commitment by itself, matched on the account it leaves from", async () => {
  await seedMonth();
  await put('accounts', { id: 'sbi', label: 'SBI Savings', type: 'bank', issuer: 'SBI', last4: '7788' });
  await put('accounts', {
    id: 'loan1',
    label: 'Home Loan ••4401',
    type: 'loan',
    issuer: 'SBI',
    last4: '4401',
    loan: { principal: rupees(4500000), outstanding: rupees(3100000), outstandingAsOf: '2026-08-31', ratePct: 7.75, emi: rupees(23000), day: 15, paidFromId: 'sbi' },
  });
  await putAll('transactions', [txn({ accountId: 'sbi', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO 51112222001 EMI' })]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  const row = f.tracker.find((t) => t.label === 'Home Loan ••4401');
  equal([row.status, row.kind, row.used], ['paid', 'loan', rupees(23000)]);
  // In the budget once, and the payment itself is not spending.
  paise(f.limit, rupees(100000 - 40000 - 20000 - 10000 - 649 - 5000 - 23000));
  paise(f.bankSpent, 0);
  // One month of interest at 7.75% on ₹31,00,000 is about ₹20,021, so ₹23,000
  // takes roughly ₹2,980 off what is owed.
  const loan = f.loans[0];
  ok(loan.outstanding < rupees(3100000) && loan.outstanding > rupees(3095000), `outstanding ${loan.outstanding / 100}`);
  equal(loan.paid, 1);
});

test("a loan already covered by a commitment on Plan isn't counted in the budget twice", async () => {
  await seedMonth();
  await put('accounts', { id: 'sbi', label: 'SBI Savings', type: 'bank', issuer: 'SBI', last4: '7788' });
  await put('accounts', {
    id: 'loan1',
    label: 'Home Loan ••4401',
    type: 'loan',
    loan: { outstanding: rupees(3100000), outstandingAsOf: '2026-08-31', ratePct: 7.75, emi: rupees(23000), day: 15, paidFromId: 'sbi', inBudget: false },
  });
  const f = await computeFreeToSpend(day('2026-09-16'));
  // The ₹40,000 commitment stands; the loan adds nothing to the budget.
  paise(f.limit, rupees(100000 - 40000 - 20000 - 10000 - 649 - 5000));
  equal(f.tracker.some((t) => t.kind === 'loan'), false);
  // It is still tracked: what is owed is there to see.
  equal(f.loans.length, 1);
});

test('speed: three years of transactions work out in a fraction of a second', async () => {
  await seedMonth();
  const rows = [];
  for (let i = 0; i < 6000; i++) {
    const d = new Date(2023, 9, 1 + Math.floor(i / 5.5));
    rows.push(txn({ accountId: i % 3 ? 'card' : 'bank', date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, amount: 100 + (i % 900), rawDescription: `SHOP ${i % 40} ${100000000 + i}` }));
  }
  const { openDB } = await import('../js/db.js');
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    for (const r of rows) tx.objectStore('transactions').put(r);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  const { forgetCachedReads } = await import('../js/db.js');
  // One run to warm up after the bulk write, then time a fresh read and the
  // whole calculation, as happens when the app opens.
  forgetCachedReads();
  await computeFreeToSpend(day('2026-09-16'));
  forgetCachedReads();
  const started = performance.now();
  await computeFreeToSpend(day('2026-09-16'));
  const ms = performance.now() - started;
  ok(ms < 400, `took ${Math.round(ms)} ms`);
});

test('a new user whose card has no statement yet: this month is the period, not the month the next salary pays for', async () => {
  await seedBasics();
  await put('accounts', { id: 'card', label: 'Test Card', type: 'card', issuer: 'Test Bank', last4: '2222', billingCycleDay: null });
  await put('settings', { id: 'salaryDay', value: 1 });
  await putAll('recurring', [commitment({ label: 'House Rent', amount: 20000 })]);
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-01', amount: 100000, direction: 'credit', rawDescription: 'NEFT SALARY' })]);
  const f = await computeFreeToSpend(day('2026-09-19'));
  equal([f.cycleStart, f.cycleKey], ['2026-09-01', '2026-09-30']);
  // What's left is spread over the 12 days to the 30th.
  equal(f.perDay, Math.floor(f.free / 12));
});

// --- Google Drive sync, against a pretend Google Drive ---------------------
// Nothing here reaches Google: fetch is replaced for the length of each test
// by a small copy of the parts of the Drive API the app uses.

function fakeDrive() {
  const files = new Map();
  let n = 0;
  const original = window.fetch;
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method || 'GET';
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') || '';
      let list = [...files.values()];
      const exact = q.match(/name = '(.+)'/);
      if (exact) list = list.filter((f) => f.name === exact[1]);
      const part = q.match(/name contains '(.+)'/);
      if (part) list = list.filter((f) => f.name.includes(part[1]));
      return json({ files: list.map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime })) });
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const parts = options.body.split('\r\n');
      const id = `f${++n}`;
      files.set(id, { id, name: JSON.parse(parts[3]).name, text: parts.slice(7, -1).join('\r\n'), modifiedTime: new Date().toISOString() });
      return json({ id });
    }
    const upload = u.pathname.match(/^\/upload\/drive\/v3\/files\/(.+)$/);
    if (upload && method === 'PATCH') {
      files.get(decodeURIComponent(upload[1])).text = options.body;
      return json({ id: upload[1] });
    }
    const one = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (one && u.searchParams.get('alt') === 'media') return new Response(files.get(decodeURIComponent(one[1])).text);
    if (one && method === 'DELETE') {
      files.delete(decodeURIComponent(one[1]));
      return new Response(null, { status: 204 });
    }
    return new Response('not in the pretend Drive', { status: 404 });
  };
  localStorage.setItem('kawach-google-pass', JSON.stringify({ token: 'pretend', expiresAt: Date.now() + 3600000 }));
  return {
    files,
    syncFile: () => [...files.values()].find((f) => f.name === SYNC_FILE),
    done: () => {
      window.fetch = original;
      localStorage.removeItem('kawach-google-pass');
    },
  };
}

async function googleSyncOn(passphrase) {
  await setBackupPassphrase(passphrase);
  await turnOnGoogleSync();
}

// What another device would have put in the sync file.
async function otherDevice(transactions, passphrase) {
  const stores = ['accounts', 'transactions', 'categories', 'merchantRules', 'recurring', 'importBatches', 'settings'];
  const data = Object.fromEntries(stores.map((s) => [s, s === 'transactions' ? transactions : []]));
  return encryptPayload({ data, deletions: [], syncedAt: Date.now() }, passphrase);
}

test('Google sync: the first device writes the sync file, locked with the backup passphrase', async () => {
  await seedBasics();
  const drive = fakeDrive();
  try {
    await googleSyncOn('shield-phrase-1');
    ok((await getSyncConfig()).configured, 'sync counts as set up with Google alone');
    equal(await getSyncPassphrase(), 'shield-phrase-1');
    await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-10', amount: 450, rawDescription: 'CAFE', updatedAt: 1 })]);
    await syncNow(await getSyncPassphrase());
    const copy = await decryptPayload(drive.syncFile().text, 'shield-phrase-1');
    equal(copy.data.transactions.map((t) => t.rawDescription), ['CAFE']);
    ok((await getSyncConfig()).lastSync, 'time of the sync kept');
  } finally {
    drive.done();
  }
});

test('Google sync: what the other device added arrives, and backups never touch the sync file', async () => {
  await seedBasics();
  const drive = fakeDrive();
  try {
    await googleSyncOn('shield-phrase-1');
    drive.files.set('s1', { id: 's1', name: SYNC_FILE, modifiedTime: '2026-09-18T10:00:00Z', text: await otherDevice([txn({ accountId: 'bank', date: '2026-09-12', amount: 900, rawDescription: 'FROM LAPTOP', updatedAt: 5 })], 'shield-phrase-1') });
    const result = await syncNow(await getSyncPassphrase());
    equal(result.pulled.added, 1);
    ok((await getAll('transactions')).some((t) => t.rawDescription === 'FROM LAPTOP'), 'the laptop entry is on this phone');
    // Six backups: only the newest five are kept, and the sync file is not
    // counted as one or tidied away with them.
    for (let i = 0; i < 6; i++) await backUpToDrive();
    equal((await listBackups()).length, 5);
    ok(drive.files.has('s1'), 'sync file untouched');
  } finally {
    drive.done();
  }
});

test('Google sync: a passphrase changed on one device carries the synced copy with it', async () => {
  await seedBasics();
  const drive = fakeDrive();
  try {
    await googleSyncOn('old-phrase-1');
    drive.files.set('s1', { id: 's1', name: SYNC_FILE, modifiedTime: '2026-09-18T10:00:00Z', text: await otherDevice([], 'old-phrase-1') });
    await setBackupPassphrase('new-phrase-2');
    // Opened with the old one, written back with the new.
    await syncNow('new-phrase-2', { previous: 'old-phrase-1' });
    ok(await decryptPayload(drive.syncFile().text, 'new-phrase-2'), 'now locked with the new passphrase');
    // The other device, still on the old one, is told what to do.
    let message = '';
    try {
      await syncNow('old-phrase-1');
    } catch (err) {
      message = err.message;
    }
    ok(/change it here too/.test(message), message || 'no error');
  } finally {
    drive.done();
  }
});

// --- Business owners (js/business.js) ---------------------------------------
// A made-up shopkeeper: the shop's current account, a savings account at
// home, and money moved from one to the other as the house needs it.

async function seedShop({ months = [['2026-06-10', 70000], ['2026-07-10', 50000], ['2026-08-10', 65000]], estimate = 60000 } = {}) {
  await seedBasics();
  await put('accounts', { id: 'shop', label: 'Shop current account', type: 'bank', issuer: 'Test Bank', last4: '4411', business: true });
  await put('settings', { id: 'incomeType', value: 'business' });
  await put('settings', { id: 'monthlyIncome', value: rupees(estimate) });
  await putAll('recurring', [commitment({ label: 'House Rent', amount: 15000 })]);
  const moves = [];
  for (const [date, amount] of months) {
    moves.push(txn({ accountId: 'shop', date, amount, rawDescription: 'UPI-SELF-TRANSFER' }));
    moves.push(txn({ accountId: 'bank', date, amount, direction: 'credit', rawDescription: 'UPI-FROM-SHOP' }));
  }
  await putAll('transactions', moves);
}

test('business: the month is planned on the lowest of the last three months taken home', async () => {
  await seedShop();
  await detectTransfers();
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal([f.incomeKind, f.plan.basis, f.plan.lowestMonth], ['business', 'lowest', '2026-07']);
  paise(f.monthlyIncome, rupees(50000));
  // ₹50,000 − ₹15,000 rent − ₹5,000 saved.
  paise(f.limit, rupees(30000));
});

test('business: the shop spending on its own account never counts as the house spending', async () => {
  await seedShop();
  await putAll('transactions', [
    txn({ accountId: 'shop', date: '2026-09-05', amount: 200000, rawDescription: 'NEFT-WHOLESALE SUPPLIER', categoryId: 'cat-biz-stock' }),
    txn({ accountId: 'shop', date: '2026-09-06', amount: 350000, direction: 'credit', rawDescription: 'UPI-CUSTOMER PAYMENTS' }),
    txn({ accountId: 'shop', date: '2026-09-08', amount: 40000, rawDescription: 'UPI-SELF-TRANSFER' }),
    txn({ accountId: 'bank', date: '2026-09-08', amount: 40000, direction: 'credit', rawDescription: 'UPI-FROM-SHOP' }),
    txn({ accountId: 'bank', date: '2026-09-09', amount: 5000, rawDescription: 'UPI-GROCER-777777777777' }),
  ]);
  await put('categories', { id: 'cat-biz-stock', name: 'Stock and purchases', scope: 'business' });
  await detectTransfers();
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(5000));
  equal([f.business.moneyIn, f.business.moneyOut, f.business.takenHome], [rupees(350000), rupees(200000), rupees(40000)]);
  equal(f.business.top[0], { name: 'Stock and purchases', amount: rupees(200000) });
  paise(f.plan.thisMonth, rupees(40000));
});

test('business: the owner’s estimate until there are three months to go on', async () => {
  await seedShop({ months: [['2026-08-10', 65000]] });
  await detectTransfers();
  const f = await computeFreeToSpend(day('2026-09-16'));
  equal(f.plan.basis, 'estimate');
  paise(f.monthlyIncome, rupees(60000));
});

test('business: money moved between two home accounts, or paid back, is not taken home', async () => {
  const accounts = [
    { id: 'shop', type: 'bank', business: true },
    { id: 'home', type: 'bank' },
    { id: 'wife', type: 'bank' },
  ];
  const t = [
    { id: 'a', accountId: 'shop', direction: 'debit', isTransfer: true, movedTo: 'home', amount: 30000, date: '2026-09-02' },
    { id: 'b', accountId: 'home', direction: 'credit', isTransfer: true, movedFrom: 'shop', amount: 30000, date: '2026-09-02' },
    { id: 'c', accountId: 'home', direction: 'credit', isTransfer: true, movedFrom: 'wife', amount: 8000, date: '2026-09-03' },
    { id: 'd', accountId: 'home', direction: 'debit', amount: 2000, date: '2026-09-04', rawDescription: 'UPI-friend@okaxis-LOAN' },
    { id: 'e', accountId: 'home', direction: 'credit', amount: 2000, date: '2026-09-10', rawDescription: 'UPI-friend@okaxis-BACK' },
    { id: 'f', accountId: 'home', direction: 'credit', amount: 1500, date: '2026-09-11', rawDescription: 'UPI-customer@oksbi' },
  ];
  // The ₹30,000 from the shop and a customer's ₹1,500 came home.
  equal(takenHome(t, accounts, '2026-09'), 31500);
});

test('business categories are offered only for business accounts', () => {
  const categories = [{ id: 'food', name: 'Food' }, { id: 'stock', name: 'Stock', scope: 'business' }];
  equal(categoriesFor(categories, { id: 'shop', business: true }).map((c) => c.id), ['stock']);
  equal(categoriesFor(categories, { id: 'home' }).map((c) => c.id), ['food']);
});

test('a backup keeps business accounts, business categories and the kind of income', async () => {
  await seedShop();
  await put('categories', { id: 'cat-biz-own', name: 'Tailoring job work', scope: 'business' });
  const { envelope } = await exportEncrypted('backup-phrase-1');
  await seedBasics();
  const { data } = await decryptBackup(JSON.stringify(envelope), 'backup-phrase-1');
  await restoreBackup(data);
  ok((await getAll('accounts')).some((a) => a.id === 'shop' && a.business), 'business account kept');
  ok((await getAll('categories')).some((c) => c.id === 'cat-biz-own' && c.scope === 'business'), 'own business category kept');
  ok((await getAll('settings')).some((s) => s.id === 'incomeType' && s.value === 'business'), 'kind of income kept');
});
