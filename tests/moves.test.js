// Money that moves has two ends (5.75): saving one end with the other named settles both. Made-up data only.
import { test, equal, ok } from './harness.js';
import { seedBasics, txn, rupees } from './fixtures.js';
import { put, getAll } from '../js/db.js';
import { settleOtherSide } from '../js/transfers.js';
import { bankBalance } from '../js/account-metrics.js';

// A card alert "payment received" for 13,000, saved on the card and flagged as money moved.
const cardCredit = (over = {}) => txn({ accountId: 'card', date: '2026-10-16', amount: 13000, direction: 'credit', source: 'alert', isTransfer: true, transferManual: true, rawDescription: 'Payment received', ...over });

test('a card bill paid: saving the card end with the bank named takes the money out of that bank, once', async () => {
  await seedBasics({ bankBalance: 50000, balanceDate: '2026-09-15' });
  const credit = cardCredit();
  await put('transactions', credit);
  const before = bankBalance((await getAll('accounts')).find((a) => a.id === 'bank'), await getAll('transactions'));
  const r = await settleOtherSide(credit, 'bank');
  ok(r && r.created, 'the bank end was written');
  const all = await getAll('transactions');
  const leg = all.find((t) => t.accountId === 'bank');
  equal([leg.direction, leg.amount, leg.isTransfer, leg.paysCardId, leg.source], ['debit', rupees(13000), true, 'card', 'manual'], 'a bill payment out of the bank, not spending, tied to the card');
  const after = bankBalance((await getAll('accounts')).find((a) => a.id === 'bank'), all);
  equal(before - after, rupees(13000), 'the bank is lower by exactly what was paid');
  equal(all.find((t) => t.id === credit.id).settledWith, leg.id, 'the two ends know each other');
});

test('a card bill paid: if the bank already shows that payment, the two are joined and nothing is added', async () => {
  await seedBasics({});
  const credit = cardCredit();
  const debit = txn({ accountId: 'bank', date: '2026-10-15', amount: 13000, direction: 'debit', source: 'alert', rawDescription: 'UPI to CRED' });
  await put('transactions', credit);
  await put('transactions', debit);
  const r = await settleOtherSide(credit, 'bank');
  ok(r && r.linked && !r.created, 'joined, not duplicated');
  const all = await getAll('transactions');
  equal(all.length, 2, 'still two entries');
  const d = all.find((t) => t.id === debit.id);
  equal([d.isTransfer, d.paysCardId, d.settledWith], [true, 'card', credit.id], 'the bank entry is now known to be the card bill');
});

test('a card bill paid: one bank payment is only ever the other end of one card payment', async () => {
  await seedBasics({});
  await put('accounts', { id: 'card2', label: 'Second Card', type: 'card', issuer: 'Test Bank', last4: '3333', billingCycleDay: 25 });
  const a = cardCredit();
  const b = cardCredit({ accountId: 'card2' });
  const debit = txn({ accountId: 'bank', date: '2026-10-16', amount: 13000, direction: 'debit', source: 'alert', rawDescription: 'CRED' });
  for (const t of [a, b, debit]) await put('transactions', t);
  await settleOtherSide(a, 'bank');
  const second = await settleOtherSide(b, 'bank');
  ok(second && second.created, 'the second card payment gets its own bank end');
  equal((await getAll('transactions')).filter((t) => t.accountId === 'bank' && t.direction === 'debit').length, 2, 'two payments left the bank');
});

test('money moved between your own accounts shows on both: it leaves one and arrives in the other', async () => {
  await seedBasics({});
  await put('accounts', { id: 'sav', label: 'Savings', type: 'savings', issuer: 'Test Bank', last4: '4444' });
  const out = txn({ accountId: 'bank', date: '2026-10-16', amount: 5000, direction: 'debit', source: 'alert', isTransfer: true, transferManual: true, rawDescription: 'Transfer' });
  await put('transactions', out);
  const r = await settleOtherSide(out, 'sav');
  equal([r.created.accountId, r.created.direction, r.created.amount, r.created.isTransfer], ['sav', 'credit', rupees(5000), true], 'it arrived in savings');
});

test('nothing is invented when there is no other end to settle', async () => {
  await seedBasics({});
  const credit = cardCredit();
  await put('transactions', credit);
  equal(await settleOtherSide(credit, null), null, 'no account named');
  equal(await settleOtherSide(credit, 'card'), null, 'the same account is not the other end');
  equal(await settleOtherSide({ ...credit, isTransfer: false }, 'bank'), null, 'not a move');
  equal((await getAll('transactions')).length, 1, 'nothing was added');
});
