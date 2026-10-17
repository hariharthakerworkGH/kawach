// Money that moves has two ends (5.75): saving one end with the other named settles both. Made-up data only.
import { test, equal, ok } from './harness.js';
import { seedBasics, txn, rupees, day } from './fixtures.js';
import { put, getAll } from '../js/db.js';
import { settleOtherSide, moveWord } from '../js/transfers.js';
import { bankBalance, cardPosition } from '../js/account-metrics.js';
import { cardStandings, bankOnlyCardPayments, whatItPaid } from '../js/card-standing.js';
import { computeFreeToSpend } from '../js/free-to-spend.js';

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

test('moveWord names a transfer for what it was, never just "moved" for a card bill', () => {
  const card = { id: 'card', type: 'card' };
  equal(moveWord({ isTransfer: true, direction: 'credit', rawDescription: 'Payment received' }, card), 'payment received');
  equal(moveWord({ isTransfer: true, direction: 'debit', paysCardId: 'card', rawDescription: 'x' }, { type: 'bank' }), 'card bill paid');
  equal(moveWord({ isTransfer: true, direction: 'debit', rawDescription: 'Sent to savings' }, { type: 'bank' }), 'moved');
  equal(moveWord({ isTransfer: false, direction: 'debit' }, card), '');
});


// --- One card, one figure (5.77): Summary and Accounts read the same calculation, and a payment always moves it. ---
const standingOf = async (id, today) => cardStandings(await getAll('accounts'), await getAll('transactions'), await getAll('importBatches'), today).cards.find((c) => c.account.id === id);
const summaryOf = async (id, today) => (await computeFreeToSpend(day(today))).cards.find((c) => c.account.id === id);

test('a card paid from the bank six days before its own "payment received" is counted once, on Summary and on Accounts', async () => {
  await seedBasics({});
  await put('transactions', txn({ accountId: 'card', date: '2026-09-10', amount: 4000, rawDescription: 'Big purchase' }));
  await put('transactions', txn({ accountId: 'card', date: '2026-10-05', amount: 1500, rawDescription: 'Cafe' }));
  await put('transactions', txn({ accountId: 'bank', date: '2026-10-04', amount: 4000, direction: 'debit', isTransfer: true, paysCardId: 'card', source: 'alert', rawDescription: 'CRED' }));
  await put('transactions', txn({ accountId: 'card', date: '2026-10-10', amount: 4000, direction: 'credit', isTransfer: true, source: 'alert', rawDescription: 'Payment received' }));
  const acc = await standingOf('card', '2026-10-12');
  const sum = await summaryOf('card', '2026-10-12');
  equal([acc.unpaid, acc.owed], [0, rupees(1500)], 'the bill is paid once, this cycle is untouched');
  equal([sum.unpaid, sum.owed], [acc.unpaid, acc.owed], 'Summary says the same as Accounts');
});

test('a bank payment you linked to its card side is never counted again, however far apart the dates', async () => {
  await seedBasics({});
  const credit = txn({ accountId: 'card', date: '2026-10-30', amount: 500, direction: 'credit', isTransfer: true, source: 'manual', rawDescription: 'Payment received' });
  const debit = txn({ accountId: 'bank', date: '2026-10-05', amount: 500, direction: 'debit', isTransfer: true, paysCardId: 'card', source: 'manual', rawDescription: 'CRED', settledWith: credit.id });
  const accounts = await getAll('accounts');
  const lone = bankOnlyCardPayments([debit, { ...credit, settledWith: debit.id }], new Set(['bank']), new Set(['card']));
  equal(lone.length, 0, 'linked: not a bank-only payment');
  equal(bankOnlyCardPayments([{ ...debit, settledWith: undefined }, credit], new Set(['bank']), new Set(['card'])).length, 1, 'not linked and 25 days apart: it is');
  ok(accounts.length > 0);
});

test('a card with no statement day: a refund lowers what is owed, the same on both screens', async () => {
  await seedBasics({});
  await put('accounts', { id: 'new', label: 'New Card', type: 'card', issuer: 'Test Bank', last4: '9999' });
  await put('transactions', txn({ accountId: 'new', date: '2026-10-03', amount: 5000, rawDescription: 'Shop', source: 'alert' }));
  await put('transactions', txn({ accountId: 'new', date: '2026-10-05', amount: 1000, direction: 'credit', rawDescription: 'Shop refund', source: 'alert' }));
  const acc = await standingOf('new', '2026-10-12');
  const sum = await summaryOf('new', '2026-10-12');
  equal(acc.owed + acc.unpaid, rupees(4000), 'spend less refund');
  equal([sum.owed, sum.unpaid], [acc.owed, acc.unpaid], 'Summary says the same');
});

test('a card bill marked paid does not swallow a payment made after it: that payment comes off this cycle', () => {
  const card = { id: 'c', type: 'card', billingCycleDay: 25, statementDue: rupees(4000), statementPeriodEnd: '2026-09-25', statementDueDate: '2026-10-15', statementDuePaid: true };
  const rows = [txn({ accountId: 'c', date: '2026-10-05', amount: 1500, rawDescription: 'Cafe' })];
  const pay = (date) => txn({ accountId: 'c', date, amount: 1500, direction: 'credit', isTransfer: true, source: 'alert', rawDescription: 'Payment received' });
  equal(cardPosition(card, [...rows, pay('2026-10-16')], [], '2026-10-17').owed, 0, 'paid after the due date: it is for this cycle');
  equal(cardPosition(card, [...rows, pay('2026-10-12')], [], '2026-10-17').owed, rupees(1500), 'paid before the due date: it was for the bill');
  equal(cardPosition(card, [...rows, { ...pay('2026-10-16'), paysBill: true }], [], '2026-10-17').owed, rupees(1500), 'said to be for the bill: it is');
});

test('what a card payment most likely paid: the bill when one is billed, else the spending since', () => {
  equal(whatItPaid({ unpaid: rupees(4000), owed: rupees(500) }, rupees(4000)), 'bill');
  equal(whatItPaid({ unpaid: 0, owed: rupees(13000) }, rupees(13000)), 'current');
  equal(whatItPaid({ unpaid: 0, owed: rupees(100) }, rupees(13000)), 'bill');
  equal(whatItPaid(undefined, rupees(5)), 'bill');
});

test('a house card paid from a business account is paid on Summary and on Accounts alike', async () => {
  await seedBasics({});
  await put('accounts', { id: 'bbank', label: 'Shop Bank', type: 'bank', issuer: 'Test Bank', last4: '7777', business: true, knownBalance: rupees(90000), knownBalanceDate: '2026-09-15' });
  await put('transactions', txn({ accountId: 'card', date: '2026-09-10', amount: 4000, rawDescription: 'Big purchase' }));
  await put('transactions', txn({ accountId: 'bbank', date: '2026-10-04', amount: 4000, direction: 'debit', isTransfer: true, paysCardId: 'card', source: 'alert', rawDescription: 'CRED' }));
  const acc = await standingOf('card', '2026-10-12');
  const sum = await summaryOf('card', '2026-10-12');
  equal(acc.unpaid, 0, 'Accounts: the bill is paid');
  equal([sum.unpaid, sum.owed], [acc.unpaid, acc.owed], 'Summary says the same');
});
