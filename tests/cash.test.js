// Cash as a pocket (5.44): what counts, what does not, and that nothing is counted twice. Made-up data only.
import { test, equal, ok, paise } from './harness.js';
import { seedBasics, putAll, txn, commitment, rupees, day } from './fixtures.js';
import { computeFreeToSpend } from '../js/free-to-spend.js';
import { setSetting, put } from '../js/db.js';
import { cashPocket, CASH_GRACE_DAYS } from '../js/cash.js';

const lot = (date, amount) => ({ id: 'L' + date + amount, date, amount: rupees(amount) });
const spend = (date, amount) => ({ id: 'S' + date + amount, date, amount: rupees(amount) });

/* --- the pocket on its own --------------------------------------------------------------------------------- */
test('cash pocket: what is written down comes off the oldest cash, the rest stays in the pocket', () => {
  const p = cashPocket({ takenOut: [lot('2026-10-01', 5000)], spends: [spend('2026-10-03', 1300)], today: '2026-10-11' });
  equal([p.inPocket, p.expired, p.beyond], [rupees(3700), [], 0]);
});

test('cash pocket: cash never written down is counted as spent when its 30 days are over, once', () => {
  const p = cashPocket({ takenOut: [lot('2026-10-01', 5000)], spends: [spend('2026-10-03', 1300)], today: '2026-11-05' });
  equal(p.expired, [{ date: '2026-10-31', amount: rupees(3700), lotDate: '2026-10-01' }]);
  equal(p.inPocket, 0);
  equal(CASH_GRACE_DAYS, 30);
  // the day before it runs out it is still in the pocket
  equal(cashPocket({ takenOut: [lot('2026-10-01', 5000)], spends: [], today: '2026-10-30' }).inPocket, rupees(5000));
});

test('cash pocket: a spend bigger than what was taken out is still a spend, and cash taken out later cannot pay for an earlier one', () => {
  const big = cashPocket({ takenOut: [lot('2026-10-01', 5000)], spends: [spend('2026-10-03', 6000)], today: '2026-10-11' });
  equal([big.inPocket, big.beyond], [0, rupees(1000)]);
  const early = cashPocket({ takenOut: [lot('2026-10-05', 5000)], spends: [spend('2026-10-03', 400)], today: '2026-10-11' });
  equal([early.inPocket, early.beyond], [rupees(5000), rupees(400)]);
});

test('cash pocket: oldest cash first, and cash that has run out of days cannot be spent again', () => {
  const two = cashPocket({ takenOut: [lot('2026-10-01', 2000), lot('2026-10-05', 3000)], spends: [spend('2026-10-06', 2500)], today: '2026-10-11' });
  equal(two.lots.map((l) => l.left), [0, rupees(2500)]);
  const late = cashPocket({ takenOut: [lot('2026-10-01', 1000)], spends: [spend('2026-11-02', 300)], today: '2026-11-10' });
  equal([late.expired.map((e) => e.amount), late.beyond], [[rupees(1000)], rupees(300)], 'already counted as spent, so not used up a second time');
});

/* --- in the calculation ----------------------------------------------------------------------------------- */
async function world({ atmPlan = true, from = null } = {}) {
  await seedBasics();
  await put('accounts', { id: 'acct-cash', label: 'Cash', type: 'cash' });
  await putAll('recurring', [
    commitment({ label: 'House Rent', amount: 20000 }),
    ...(atmPlan ? [commitment({ label: 'ATM cash', amount: 10000, spread: true, cash: true })] : []),
  ]);
  if (from) await setSetting('cashRuleFrom', from);
}
const atm = (date, amount, n = 30) => txn({ accountId: 'bank', date, amount, rawDescription: `ATW-400000XXXXXX1111-S1AWMI${n}` });
const cashSpend = (date, amount, over = {}) => txn({ accountId: 'acct-cash', date, amount, rawDescription: 'CHAI', ...over });

test('cash rule off: ATM money is a plan in the budget and cash spending changes nothing, as it always did', async () => {
  await world();
  await putAll('transactions', [atm('2026-09-05', 4000), cashSpend('2026-09-10', 500)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.limit, rupees(100000 - 20000 - 10000 - 5000));
  paise(f.spentThisCycle, 0);
  equal(f.cash.on, false);
});

test('cash rule on: the ATM plan is no longer set aside, a withdrawal is not spending, a chai is', async () => {
  await world({ from: '2026-09-01' });
  await putAll('transactions', [atm('2026-09-05', 4000), cashSpend('2026-09-10', 500)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.limit, rupees(100000 - 20000 - 5000), 'the ATM plan is not taken out of the budget');
  paise(f.spentThisCycle, rupees(500));
  paise(f.free, f.limit - rupees(500));
  equal([f.cash.on, f.cash.takenOut, f.cash.spent, f.cash.inPocket], [true, rupees(4000), rupees(500), rupees(3500)]);
  ok(!f.budgetItems.some((b) => /ATM/.test(b.label)), 'and it is not among the set-aside costs');
});

test('cash rule on, no ATM plan: the same, so nothing is counted twice', async () => {
  await world({ atmPlan: false, from: '2026-09-01' });
  await putAll('transactions', [atm('2026-09-05', 5000), cashSpend('2026-09-06', 300), cashSpend('2026-09-07', 200)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(500), 'only what was spent in cash, not the 5,000 taken out');
});

test('cash rule: a withdrawal before the day it began counts as it always did, one after does not', async () => {
  await world({ atmPlan: false, from: '2026-09-10' });
  await putAll('transactions', [atm('2026-09-05', 5000, 31), atm('2026-09-12', 3000, 32)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(5000));
});

test('cash rule: a month already worked out gives the same answer it did before the rule began', async () => {
  await world({ from: '2026-10-01' });
  await putAll('transactions', [atm('2026-09-05', 4000), cashSpend('2026-09-10', 500)]);
  const withRule = await computeFreeToSpend(day('2026-09-16'));
  await world();
  await putAll('transactions', [atm('2026-09-05', 4000), cashSpend('2026-09-10', 500)]);
  const without = await computeFreeToSpend(day('2026-09-16'));
  equal([withRule.limit, withRule.free, withRule.spentThisCycle], [without.limit, without.free, without.spentThisCycle]);
});

test('cash rule: cash taken out and never written down is counted after 30 days, only what was not written down', async () => {
  await world({ atmPlan: false, from: '2026-08-01' });
  await putAll('transactions', [atm('2026-08-20', 3000), cashSpend('2026-08-25', 1000)]);
  const early = await computeFreeToSpend(day('2026-09-10'));
  paise(early.spentThisCycle, 0, 'still inside its 30 days, and August is not September');
  equal(early.cash.inPocket, rupees(2000));
  const f = await computeFreeToSpend(day('2026-09-25'));
  paise(f.spentThisCycle, rupees(2000), 'the 2,000 not written down, counted on 19 September');
  equal([f.cash.inPocket, f.cash.unloggedCounted], [0, rupees(2000)]);
});

test('cash rule: a cash work cost is not spending, and friends paying back in cash still takes it off', async () => {
  await world({ atmPlan: false, from: '2026-09-01' });
  await putAll('transactions', [
    cashSpend('2026-09-06', 800, { isReimbursable: true, rawDescription: 'CLIENT LUNCH' }),
    cashSpend('2026-09-07', 1000, { rawDescription: 'DINNER' }),
    txn({ accountId: 'acct-cash', date: '2026-09-08', amount: 600, direction: 'credit', rawDescription: 'FRIENDS PAID BACK', isShareBack: true }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(1000 - 600));
});
