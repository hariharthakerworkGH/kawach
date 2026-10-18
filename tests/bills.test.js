// One-time bills (5.85): a payment due once. The rules that matter: it takes its whole amount out of ONE month's budget (the month it
// is due, this month while it is overdue, the month it was paid in), nothing out of the others, shows in the months ahead in its own
// month, and ends when a payment for it is found, so next month does not hold it again.
import { test, equal, ok, paise } from './harness.js';
import { seedBasics, putAll, txn, commitment, rupees, day } from './fixtures.js';
import { computeFreeToSpend } from '../js/free-to-spend.js';
import { commitmentDueInWindow } from '../js/commitments.js';
import { monthlyAmountOf } from '../js/frequency.js';
import { forecast, costInMonth } from '../js/forecast.js';
import { getAll } from '../js/db.js';
import { isOneTime, buildBill, markBillPaid, billState, paymentFound, settleBills } from '../js/bills.js';

const bill = (fields = {}, over = {}) =>
  buildBill({ id: 'fixed-b1', fields: { label: 'School admission', amount: '12000', dueOn: '2026-09-25', matchText: 'SCHOOL', ...fields }, ...over });

test('bill: a form without a name, an amount or a date makes nothing', () => {
  equal(buildBill({ id: 'x', fields: { label: '', amount: '100', dueOn: '2026-09-25' } }), null);
  equal(buildBill({ id: 'x', fields: { label: 'Fee', amount: '', dueOn: '2026-09-25' } }), null);
  equal(buildBill({ id: 'x', fields: { label: 'Fee', amount: '100', dueOn: '' } }), null);
});

test('bill: it is a fixed cost with its date, the amount in paise, never set aside and never repeating', () => {
  const b = bill();
  ok(isOneTime(b));
  equal(b.source, 'fixed');
  equal(b.amount, rupees(12000));
  equal(b.frequency, 'monthly');
  equal(b.dayOfMonth, 25);
  equal(b.spread, false);
  equal(b.once, { dueOn: '2026-09-25', paidOn: null });
  equal(b.endDate, null);
});

test('bill: it takes its whole amount out of one month: before its month nothing, its month all, overdue all, never twice', () => {
  const b = bill();
  equal(monthlyAmountOf(b, '2026-08-20'), 0);
  equal(monthlyAmountOf(b, '2026-09-01'), rupees(12000));
  equal(monthlyAmountOf(b, '2026-09-30'), rupees(12000));
  equal(monthlyAmountOf(b, '2026-10-16'), rupees(12000), 'overdue and unpaid: still held');
  const paid = markBillPaid(b, '2026-09-24');
  equal(monthlyAmountOf(paid, '2026-09-24'), rupees(12000));
  equal(monthlyAmountOf(paid, '2026-10-16'), 0);
});

test('bill: paid early, it is held in the month it was paid, so the payment is always set against a month that held it', () => {
  const paid = markBillPaid(bill({ dueOn: '2026-11-10' }), '2026-09-12');
  equal(monthlyAmountOf(paid, '2026-09-12'), rupees(12000));
  equal(monthlyAmountOf(paid, '2026-11-10'), 0);
  equal(paid.endDate, '2026-09-30');
});

test('bill: marking it paid ends it at the close of that month, and a second time changes nothing', () => {
  const b = bill();
  const paid = markBillPaid(b, '2026-09-24');
  equal(paid.once.paidOn, '2026-09-24');
  equal(paid.endDate, '2026-09-30');
  equal(markBillPaid(paid, '2026-10-05'), paid);
});

test('bill: editing keeps when it was paid', () => {
  const paid = { ...markBillPaid(bill(), '2026-09-24'), sortOrder: 2 };
  const edited = buildBill({ existing: paid, fields: { label: 'School admission fee', amount: '12500', dueOn: '2026-09-25' } });
  equal(edited.once.paidOn, '2026-09-24');
  equal(edited.endDate, '2026-09-30');
  equal(edited.amount, rupees(12500));
  equal(edited.sortOrder, 2);
  equal(edited.id, 'fixed-b1');
});

test('bill: a business bill belongs to its lane, a home one to none', () => {
  equal(bill({}, { space: 'biz-1' }).space, 'biz-1');
  equal('space' in bill({}, { space: 'home' }), false);
});

test('bill: its row says where it stands in a few words', () => {
  const b = bill();
  equal(billState(b, '2026-09-20').status, 'soon');
  ok(/^Due .* · in 5 days$/.test(billState(b, '2026-09-20').text), billState(b, '2026-09-20').text);
  equal(billState(b, '2026-09-10').status, 'later');
  equal(billState(b, '2026-09-25').text, 'Due today');
  equal(billState(b, '2026-09-28').text, 'Overdue · 3 days');
  equal(billState(b, '2026-09-28').tone, 'bad');
  equal(billState(b, '2026-06-01').status, 'later');
  equal(billState(markBillPaid(b, '2026-09-24'), '2026-09-28').status, 'paid');
});

test('bill: the months ahead show it in its own month and no other', () => {
  const months = forecast({ items: [bill({ dueOn: '2026-11-10' })], income: rupees(100000), today: '2026-09-16', months: 3 });
  equal(months.map((m) => m.key), ['2026-10', '2026-11', '2026-12']);
  equal(months.map((m) => m.costs), [0, rupees(12000), 0]);
  equal(months[1].renewals.map((r) => r.label), ['School admission']);
  equal(costInMonth(bill(), '2026-10'), { amount: 0, dated: false });
});

test('bill: what is still owed in a window is counted once, until a payment for it is seen', () => {
  const b = bill();
  const win = { today: '2026-09-01', windowEnd: '2026-09-30', bankEntries: [], wholeMonths: true };
  equal(commitmentDueInWindow(b, win).amount, rupees(12000));
  equal(commitmentDueInWindow(b, { ...win, windowEnd: '2026-08-31' }).amount, 0);
  const paidEntry = txn({ accountId: 'bank', date: '2026-09-20', amount: 12000, rawDescription: 'NEFT SCHOOL FEES' });
  equal(commitmentDueInWindow(b, { ...win, bankEntries: [paidEntry] }).amount, 0);
  equal(commitmentDueInWindow(markBillPaid(b, '2026-09-20'), win).amount, 0);
});

async function seedRent() {
  await seedBasics();
  await putAll('recurring', [commitment({ label: 'House Rent', amount: 20000 })]);
}

test('bill: Left to spend is held back in its month only, then steady again', async () => {
  await seedRent();
  const base = (await computeFreeToSpend(day('2026-09-16'))).limit;
  await putAll('recurring', [bill()]);
  paise((await computeFreeToSpend(day('2026-08-20'))).limit, base, 'before its month');
  paise((await computeFreeToSpend(day('2026-09-16'))).limit, base - rupees(12000), 'in its month');
  paise((await computeFreeToSpend(day('2026-10-16'))).limit, base - rupees(12000), 'overdue and unpaid, still held');
});

test('bill: once paid and its month is over, nothing is held and the payment was never counted as spending', async () => {
  await seedRent();
  const base = (await computeFreeToSpend(day('2026-09-16'))).limit;
  await putAll('recurring', [markBillPaid(bill(), '2026-09-20')]);
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-20', amount: 12000, rawDescription: 'NEFT SCHOOL FEES' })]);
  const sept = await computeFreeToSpend(day('2026-09-25'));
  paise(sept.limit, base - rupees(12000), 'its month still holds it');
  paise(sept.spentThisCycle, 0, 'the payment is the bill, not spending');
  paise((await computeFreeToSpend(day('2026-10-16'))).limit, base, 'next month holds nothing');
});

test('bill: on Summary it reads late after its date, with its own date', async () => {
  await seedRent();
  await putAll('recurring', [bill()]);
  const row = (await computeFreeToSpend(day('2026-10-16'))).tracker.find((t) => t.label === 'School admission');
  equal(row.status, 'late');
  equal(row.due, '2026-09-25');
  const paidRow = await (async () => {
    await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-22', amount: 12000, rawDescription: 'NEFT SCHOOL FEES' })]);
    return (await computeFreeToSpend(day('2026-09-25'))).tracker.find((t) => t.label === 'School admission');
  })();
  equal(paidRow.status, 'paid');
});

test('bill: a payment found for it ends it, once, and an unrelated payment does not', async () => {
  await seedRent();
  await putAll('recurring', [bill()]);
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-10', amount: 500, rawDescription: 'UPI CAFE' })]);
  equal(await settleBills('2026-09-30'), 0);
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-24', amount: 12000, rawDescription: 'NEFT SCHOOL FEES' })]);
  equal(await settleBills('2026-09-30'), 1);
  const saved = (await getAll('recurring')).find((r) => r.id === 'fixed-b1');
  equal(saved.once.paidOn, '2026-09-24');
  equal(saved.endDate, '2026-09-30');
  equal(await settleBills('2026-09-30'), 0, 'already settled');
});

test('bill: a payment tagged to it counts whatever its words, and one tagged elsewhere does not', () => {
  const b = bill({ matchText: '' });
  const tagged = txn({ accountId: 'bank', date: '2026-09-24', amount: 11000, rawDescription: 'ANYTHING', commitmentId: 'fixed-b1' });
  const other = txn({ accountId: 'bank', date: '2026-09-24', amount: 12000, rawDescription: 'ANYTHING', commitmentId: 'something-else' });
  equal(paymentFound(b, [tagged], '2026-09-30'), '2026-09-24');
  equal(paymentFound(b, [other], '2026-09-30'), null);
});
