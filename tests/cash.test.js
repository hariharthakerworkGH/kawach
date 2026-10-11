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

test('cash pocket: cash that was already counted when it was taken out is not counted again, spent or not', () => {
  const counted = { ...lot('2026-09-25', 3000), counted: true };
  const p = cashPocket({ takenOut: [counted, lot('2026-10-05', 2000)], spends: [spend('2026-10-06', 1000), spend('2026-10-07', 2500)], today: '2026-10-20' });
  equal(p.spends.map((x) => x.counts), [0, rupees(500)], 'the first came wholly out of counted cash; the second took 2,000 of counted cash and 500 of new');
  equal(p.inPocket, rupees(1500), 'what is left is new cash only: counted cash that was spent is gone');
  const gone = cashPocket({ takenOut: [counted], spends: [], today: '2026-11-01' });
  equal([gone.expired, gone.inPocket], [[], 0], 'counted cash whose days are over is never counted a second time');
});

test('cash pocket: oldest cash first, and cash that has run out of days cannot be spent again', () => {
  const two = cashPocket({ takenOut: [lot('2026-10-01', 2000), lot('2026-10-05', 3000)], spends: [spend('2026-10-06', 2500)], today: '2026-10-11' });
  equal(two.lots.map((l) => l.left), [0, rupees(2500)]);
  const late = cashPocket({ takenOut: [lot('2026-10-01', 1000)], spends: [spend('2026-11-02', 300)], today: '2026-11-10' });
  equal([late.expired.map((e) => e.amount), late.beyond], [[rupees(1000)], rupees(300)], 'already counted as spent, so not used up a second time');
});

/* --- in the calculation ----------------------------------------------------------------------------------- */
async function world({ plan = true, planLabel = 'ATM cash', from = null } = {}) {
  await seedBasics();
  await put('accounts', { id: 'acct-cash', label: 'Cash', type: 'cash' });
  await putAll('recurring', [
    commitment({ label: 'House Rent', amount: 20000 }),
    ...(plan ? [commitment({ label: planLabel, amount: planLabel === 'Cash Withdrawal' ? 31000 : 10000, spread: true, ...(planLabel === 'ATM cash' ? { cash: true } : {}) })] : []),
  ]);
  if (from) await setSetting('cashRuleFrom', from);
}
const atm = (date, amount, n = 30) => txn({ accountId: 'bank', date, amount, rawDescription: `ATW-400000XXXXXX1111-S1AWMI${n}` });
const cashSpend = (date, amount, over = {}) => txn({ accountId: 'acct-cash', date, amount, rawDescription: 'CHAI', ...over });
const planOf = (f) => f.tracker.find((t) => /ATM|Cash/.test(t.label));

test('cash rule off: ATM money is a plan in the budget and cash spending changes nothing, as it always did', async () => {
  await world();
  await putAll('transactions', [atm('2026-09-05', 4000), cashSpend('2026-09-10', 500)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.limit, rupees(100000 - 20000 - 10000 - 5000));
  paise(f.spentThisCycle, 0);
  equal(f.cash.on, false);
});

test('cash rule on, with an ATM plan: the plan stays set aside, a withdrawal does not draw it, written cash does', async () => {
  await world({ from: '2026-09-01' });
  await putAll('transactions', [atm('2026-09-05', 4000), cashSpend('2026-09-10', 500)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.limit, rupees(100000 - 20000 - 10000 - 5000), 'still set aside: the budget does not change');
  paise(f.spentThisCycle, 0, 'and inside the plan, so Left to spend does not move');
  paise(planOf(f).used, rupees(500), 'the plan is used by the cash written down, not by the 4,000 taken out');
  equal([f.cash.on, f.cash.takenOut, f.cash.spent, f.cash.inPocket], [true, rupees(4000), rupees(500), rupees(3500)]);
  equal([f.cash.plan.amount, f.cash.plan.left], [rupees(10000), rupees(9500)]);
});

test('cash rule on, with an ATM plan: what is written down beyond the plan is spending, and only that', async () => {
  await world({ from: '2026-09-01' });
  await putAll('transactions', [atm('2026-09-02', 12000, 31), cashSpend('2026-09-05', 6000), cashSpend('2026-09-08', 5000)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(1000));
  paise(f.free, f.limit - rupees(1000));
  equal(planOf(f).status, 'over');
});

test('cash rule on, with an ATM plan: cash never written down uses the plan up after 30 days', async () => {
  await world({ from: '2026-08-01' });
  await putAll('transactions', [atm('2026-08-20', 3000), cashSpend('2026-08-25', 1000)]);
  const early = await computeFreeToSpend(day('2026-09-10'));
  paise(planOf(early).used, 0);
  const f = await computeFreeToSpend(day('2026-09-25'));
  paise(planOf(f).used, rupees(2000), 'the 2,000 not written down, on 19 September');
  paise(f.spentThisCycle, 0, 'still inside the plan');
});

test('cash rule on, with the plan the owner named "Cash Withdrawal": cash he already took out is not counted a second time', async () => {
  await world({ planLabel: 'Cash Withdrawal' });
  await putAll('transactions', [atm('2026-10-01', 10000, 41), atm('2026-10-01', 10000, 42), atm('2026-10-01', 10000, 43)]);
  const before = await computeFreeToSpend(day('2026-10-11'));
  await setSetting('cashRuleFrom', '2026-10-11');
  await putAll('transactions', [cashSpend('2026-10-11', 500), cashSpend('2026-10-11', 500)]);
  const after = await computeFreeToSpend(day('2026-10-11'));
  equal([after.limit, after.free, after.spentThisCycle], [before.limit, before.free, before.spentThisCycle], 'the 1,000 came out of the 30,000 already counted: nothing moves');
  paise(planOf(after).used, rupees(30000));
  paise(after.cash.inPocket, rupees(29000));
  // spend past what was taken out and counted: 29,000 is left of it, so 29,500 + 1,200 leaves 1,700 of new cash
  await putAll('transactions', [cashSpend('2026-10-12', 29500), cashSpend('2026-10-12', 1200)]);
  const later = await computeFreeToSpend(day('2026-10-12'));
  paise(planOf(later).used, rupees(30000 + 1700), 'only what was past the cash that was already counted draws the plan');
  paise(later.spentThisCycle, rupees(700), 'and what is past the 31,000 plan is spending');
});

test('cash rule: a dated cost with the word cash in its name is not the ATM plan, and stays set aside', async () => {
  await world({ plan: false, from: '2026-09-01' });
  await putAll('recurring', [commitment({ label: 'Cash gift to cousin', amount: 2000, dayOfMonth: 12 })]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  ok(f.budgetItems.some((b) => /Cash gift/.test(b.label)));
  equal(f.cash.plan, null);
});

test('cash rule on, no ATM plan: every written cash spend counts, a withdrawal does not, nothing is counted twice', async () => {
  await world({ plan: false, from: '2026-09-01' });
  await putAll('transactions', [atm('2026-09-05', 5000), cashSpend('2026-09-06', 300), cashSpend('2026-09-07', 200)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(500), 'only what was spent in cash, not the 5,000 taken out');
  paise(f.free, f.limit - rupees(500));
});

test('cash rule, no ATM plan: a withdrawal before the day it began counts as it always did, one after does not', async () => {
  await world({ plan: false, from: '2026-09-10' });
  await putAll('transactions', [atm('2026-09-05', 5000, 31), atm('2026-09-12', 3000, 32)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(5000));
});

test('cash rule, no ATM plan: cash spent out of what was taken out before the rule began is not counted again', async () => {
  await world({ plan: false, from: '2026-09-10' });
  await putAll('transactions', [atm('2026-09-05', 5000, 31), cashSpend('2026-09-12', 400), cashSpend('2026-09-13', 4700)]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(5000 + 100), 'the 5,000 counted when taken out, and only the 100 beyond it is new');
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

test('cash rule, no ATM plan: cash taken out and never written down is counted after 30 days, only what was not written down', async () => {
  await world({ plan: false, from: '2026-08-01' });
  await putAll('transactions', [atm('2026-08-20', 3000), cashSpend('2026-08-25', 1000)]);
  const early = await computeFreeToSpend(day('2026-09-10'));
  paise(early.spentThisCycle, 0, 'still inside its 30 days, and August is not September');
  equal(early.cash.inPocket, rupees(2000));
  const f = await computeFreeToSpend(day('2026-09-25'));
  paise(f.spentThisCycle, rupees(2000), 'the 2,000 not written down, counted on 19 September');
  equal([f.cash.inPocket, f.cash.unloggedCounted], [0, rupees(2000)]);
});

test('cash rule: a cash work cost is not spending, and friends paying back in cash still takes it off', async () => {
  await world({ plan: false, from: '2026-09-01' });
  await putAll('transactions', [
    cashSpend('2026-09-06', 800, { isReimbursable: true, rawDescription: 'CLIENT LUNCH' }),
    cashSpend('2026-09-07', 1000, { rawDescription: 'DINNER' }),
    txn({ accountId: 'acct-cash', date: '2026-09-08', amount: 600, direction: 'credit', rawDescription: 'FRIENDS PAID BACK', isShareBack: true }),
  ]);
  const f = await computeFreeToSpend(day('2026-09-16'));
  paise(f.spentThisCycle, rupees(1000 - 600));
});
