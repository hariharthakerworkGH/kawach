// UPI payments to people (7.13): which lines are a person, the guess from earlier payments, and what is taught when one is filed. Made-up data only.
import { test, equal, ok } from './harness.js';
import { txn, resetDB } from './fixtures.js';
import { put, getAll } from '../js/db.js';
import { matchCategoryForDescription, learnFromAssignment } from '../js/merchant-rules.js';
import { isUpiToPerson, bandOf, upiPeopleRows, upiShape, groupGuess, oneTap, learnText } from '../js/upi-people.js';

const line = (name, vpa) => `UPI-${name}-${vpa}-YESB0YBLUPI-412345678901-UPI`;
const person = (amount, categoryId = null, name = 'RAMESH KUMAR', vpa = '9876543210@YBL') => txn({ date: '2026-11-10', amount, categoryId, rawDescription: line(name, vpa) });

test('upi people: a name with a phone-number id is a person; a shop, an app and a bank marker say otherwise', () => {
  ok(isUpiToPerson(line('RAMESH KUMAR', '9876543210@YBL')), 'name + phone id');
  ok(isUpiToPerson('UPI/DR/412345678901/MOHD IRFAN/YESB/mohdirfan7@okaxis/UPI'), 'slash style, id with a digit');
  ok(isUpiToPerson('UPI-ANIL-P2P-412345678901'), 'the bank says person to person');
  ok(!isUpiToPerson(line('SWIGGY', 'swiggy@icici')), 'one-word shop');
  ok(!isUpiToPerson(line('AMAZON PAY GROCERY', 'amazonpay@apl')), 'two-word shop, id without a digit');
  ok(!isUpiToPerson(line('SHARMA GENERAL STORE', 'q123456789@ybl')), 'a business word in the name');
  ok(!isUpiToPerson('UPI-SOME SHOP-9812345678@PAYTM-P2M'), 'the bank says merchant, even with a phone-looking id');
  ok(!isUpiToPerson('ATM WDL 1234 MUMBAI'), 'not UPI at all');
  ok(!isUpiToPerson(''), 'empty');
});

test('upi people: bands stop at 2,000 rupees', () => {
  equal([4999, 5000, 9999, 19999, 49999, 99999, 199999, 200000].map(bandOf), [0, 1, 1, 2, 3, 4, 5, -1]);
});

test('upi people: only outgoing, uncategorised payments to people are collected', () => {
  const rows = upiPeopleRows([
    person(60),
    person(70, 'cat-transport'), // already filed
    txn({ date: '2026-11-10', amount: 80, direction: 'credit', rawDescription: line('RAMESH KUMAR', '9876543210@YBL') }), // money in
    { ...person(90), isTransfer: true },
    { ...person(95), personId: 'p1' }, // lent to someone: theirs, not a category's
    { ...person(99), splits: [{ categoryId: null, amount: 9900 }] },
    txn({ date: '2026-11-10', amount: 85, rawDescription: line('SWIGGY', 'swiggy@icici') }),
  ]);
  equal(rows.length, 1);
  equal(rows[0].amount, 6000);
});

test('upi people: a guess needs 3 earlier payments of the same size band and 70% in one category', () => {
  const history = [person(60, 'cat-transport'), person(70, 'cat-transport'), person(80, 'cat-transport'), person(90, 'cat-food')];
  const guess = upiShape(history);
  equal(guess(person(85)), 'cat-transport', '3 of 4 = 75%');
  equal(guess(person(300)), null, 'another band has no history');
  equal(guess(person(85, 'cat-food')), null, 'already filed: nothing to guess');
  equal(guess(txn({ date: '2026-11-10', amount: 85, rawDescription: line('SWIGGY', 'swiggy@icici') })), null, 'a shop is not guessed from people');
  equal(upiShape(history.slice(0, 2))(person(85)), null, 'two earlier payments are too few');
  equal(upiShape([person(60, 'cat-transport'), person(70, 'cat-transport'), person(80, 'cat-food')])(person(85)), null, '2 of 3 = 67%: not sure enough');
});

test('upi people: the guess ignores money in, transfers and payments lent to someone', () => {
  const history = [person(60, 'cat-transport'), person(70, 'cat-transport'), { ...person(80, 'cat-transport'), isTransfer: true }, { ...person(90, 'cat-transport'), personId: 'p1' }];
  equal(upiShape(history)(person(85)), null, 'only two count');
});

test('upi people: a group offers the category most of its guesses agree on', () => {
  const guess = (t) => ({ a: 'cat-x', b: 'cat-x', c: 'cat-y', d: null })[t.id];
  equal(groupGuess([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], guess), 'cat-x');
  equal(groupGuess([{ id: 'd' }], guess), null, 'no guess at all');
});

test('upi people: one tap files a group only when every payment is routine and none points elsewhere', () => {
  const shape = upiShape([person(60, 'cat-transport'), person(70, 'cat-transport'), person(80, 'cat-transport'), person(300, 'cat-food'), person(310, 'cat-food'), person(320, 'cat-food')]);
  equal(oneTap([person(65), person(75), person(150)], shape), 'cat-transport', 'a size with no history does not stop it');
  equal(oneTap([person(65), person(75), person(3000)], shape), null, 'a payment over 2,000 rupees is looked at first');
  equal(oneTap([person(65), person(75), person(330)], shape), null, 'one of them looks like Food: the sheet shows it');
  equal(oneTap([person(150), person(160)], shape), null, 'no guess at all');
});

test('upi people: filing a payment teaches the person\'s own id, never the whole line', () => {
  equal(learnText(line('RAMESH KUMAR', '9876543210@YBL')), '9876543210');
  equal(learnText('UPI-ANIL-P2P-412345678901'), null, 'no id to key on: nothing learned');
  equal(learnText('SWIGGY BENGALURU'), 'SWIGGY BENGALURU', 'a shop is taught as before');
});

test('upi people: a rule taught from a person fits only that person, and whole-line rules taught before no longer fit strangers', async () => {
  await resetDB();
  // Taught before 7.13: the whole line, so the bank's code and a surname were part of it.
  await put('merchantRules', { id: 'old', matchPattern: 'ramesh kumar 9876543210 yesb0yblupi', categoryId: 'cat-transport', hitCount: 1, direction: 'debit' });
  const match = (name, vpa) => matchCategoryForDescription(line(name, vpa), 'debit');
  equal(await match('SURESH KUMAR', '9123456780@OKAXIS'), null, 'a stranger paid through the same bank, sharing a surname');
  equal(await match('RAMESH KUMAR', '9876543210@YBL'), 'cat-transport', 'the same person still matches');
  await learnFromAssignment(line('MOHD IRFAN', '8765432109@PAYTM'), 'cat-food', 'debit');
  equal((await getAll('merchantRules')).map((r) => r.matchPattern).sort(), ['8765432109', 'ramesh kumar 9876543210 yesb0yblupi'], 'the new rule is the id alone');
  equal(await match('SUNIL PATIL', '9988776655@YBL'), null, 'another stranger through the same bank');
  equal(await match('MOHD IRFAN', '8765432109@PAYTM'), 'cat-food', 'the same person');
  await resetDB();
});
