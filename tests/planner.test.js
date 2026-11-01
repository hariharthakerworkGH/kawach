// Coach reads the planner. In the first days of a month one day's spending must not be stretched across the whole month
// (1 Nov 2026: Coach told the owner he would finish Rs 2,85,332 over, from one day), and rent, loan and transfer
// categories are plan money, never "running hot".
import { test, equal, ok } from './harness.js';
import { seedBasics, putAll, txn, day } from './fixtures.js';
import { put } from '../js/db.js';
import { financialSnapshot, observations } from '../js/planner.js';

const titles = (s) => observations(s).map((n) => n.title);

async function household() {
  await seedBasics();
  await put('categories', { id: 'transfer', name: 'Transfer' });
  const rows = [];
  // Three earlier months of ordinary food and a Rs 5,000 monthly transfer, so there is a "normal" to compare with.
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    rows.push(txn({ accountId: 'bank', date: `${m}-10`, amount: 3000, categoryId: 'food', rawDescription: 'Cafe' }));
    rows.push(txn({ accountId: 'bank', date: `${m}-12`, amount: 5000, categoryId: 'transfer', rawDescription: 'Sent to family' }));
  }
  await putAll('transactions', rows);
}

test('planner: one day of spending is not a pace (day 2 of the month)', async () => {
  await household();
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-10-01', amount: 9654, categoryId: 'food', rawDescription: 'Big shop' })]);
  const s = await financialSnapshot(day('2026-10-02'));
  equal(s.paceKnown, false, 'too few days to judge a pace');
  equal(s.runRate, 0);
  equal(s.projectedOver, null, 'no forecast from one day');
  equal(titles(s).filter((t) => /Heading for|running hot/.test(t)), [], 'no forecast or spike note this early');
});

test('planner: a pace is judged once five days have passed', async () => {
  await household();
  await putAll('transactions', [txn({ accountId: 'bank', date: '2026-10-02', amount: 6000, categoryId: 'food', rawDescription: 'Big shop' })]);
  const s = await financialSnapshot(day('2026-10-10'));
  equal(s.paceKnown, true);
  ok(s.runRate > 0, 'a pace exists');
  ok(s.projectedOver != null, 'a forecast exists');
});

test('planner: a transfer category is never "running hot", real spending still is', async () => {
  await household();
  await putAll('transactions', [
    txn({ accountId: 'bank', date: '2026-10-04', amount: 70000, categoryId: 'transfer', rawDescription: 'Sent to family' }),
    txn({ accountId: 'bank', date: '2026-10-05', amount: 40000, categoryId: 'food', rawDescription: 'Party' }),
  ]);
  const t = titles(await financialSnapshot(day('2026-10-12')));
  ok(!t.some((x) => /Transfer is running hot/.test(x)), 'transfer is plan money: ' + t.join(' / '));
  ok(t.some((x) => /Food & Dining is running hot/.test(x)), 'food still flagged: ' + t.join(' / '));
});
