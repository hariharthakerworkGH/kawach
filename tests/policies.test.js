// Insurance policies (5.84): a policy is a commitment with its details beside it. These check the rules that
// matter: where a policy stands against its date and grace period, that "paid" moves the date on one whole period
// from the date it was due (never from today), the financial year's total, and that the cost still behaves as every
// renewal does in the budget and the months ahead.
import { test, equal, ok } from './harness.js';
import { rupees } from './fixtures.js';
import { isPolicy, policyState, stateLine, stateNote, markPaid, fyOf, paidInYear, buildPolicy, maturitiesAhead, familySummary, redactPolicy, graceDays } from '../js/policies.js';
import { monthlyAmountOf } from '../js/frequency.js';
import { forecast, costInMonth } from '../js/forecast.js';

const health = (over = {}, fields = {}) =>
  buildPolicy({
    id: 'fixed-h1',
    fields: { kind: 'health', name: 'Family health cover', insurer: 'Test Insurer', number: 'POL-1234', covered: 'Self, spouse, two children', sum: '1000000', amount: '24000', frequency: 'yearly', dueOn: '2026-08-12', helpline: '1800 000 000', nominee: '', ...fields },
    ...over,
  });

test('policy: a form without a name or a premium makes nothing', () => {
  equal(buildPolicy({ id: 'x', fields: { kind: 'health', name: '', insurer: '', amount: '24000', frequency: 'yearly', dueOn: '2026-08-12' } }), null);
  equal(buildPolicy({ id: 'x', fields: { kind: 'health', name: 'Cover', amount: '', frequency: 'yearly', dueOn: '2026-08-12' } }), null);
});

test('policy: a yearly policy is a renewal with its date, the premium in paise, set apart from "set aside"', () => {
  const r = health();
  ok(isPolicy(r));
  equal(r.amount, rupees(24000));
  equal(r.frequency, 'yearly');
  equal(r.renewsOn, '2026-08-12');
  equal(r.dayOfMonth, 12);
  equal(r.spread, false);
  equal(r.policy.sum, rupees(1000000));
  equal(r.policy.nominee, null);
});

test('policy: a monthly premium keeps its date inside the policy, with no renewal date for the budget', () => {
  const r = health({}, { frequency: 'monthly', amount: '2000', dueOn: '2026-10-05' });
  equal(r.renewsOn, null);
  equal(r.policy.dueOn, '2026-10-05');
  equal(r.dayOfMonth, 5);
});

test('policy: the budget sets a twelfth aside each month and the whole premium lands in the month it is due', () => {
  const r = health();
  equal(monthlyAmountOf(r), rupees(2000));
  equal(costInMonth(r, '2026-08').amount, rupees(24000));
  equal(costInMonth(r, '2026-08').dated, true);
  equal(costInMonth(r, '2026-09').amount, 0);
  equal(costInMonth(r, '2027-08').amount, rupees(24000));
});

test('policy: the whole year ahead is twelve months, with the premium in its month only', () => {
  const months = forecast({ items: [health()], income: rupees(80000), today: '2026-10-18', months: 12 });
  equal(months.length, 12);
  const heavy = months.filter((m) => m.renewals.length);
  equal(heavy.length, 1);
  equal(heavy[0].key, '2027-08');
});

test('policy: states against the date and the grace period', () => {
  const r = health({}, { kind: 'life', dueOn: '2026-10-20' });
  equal(graceDays(r), 30);
  equal(policyState(r, '2026-08-01').status, 'ok');
  equal(policyState(r, '2026-10-05').status, 'soon');
  equal(policyState(r, '2026-10-20').days, 0);
  equal(policyState(r, '2026-10-25').status, 'grace');
  equal(policyState(r, '2026-10-25').graceEnd, '2026-11-19');
  equal(policyState(r, '2026-11-20').status, 'lapsed');
  const car = health({}, { kind: 'vehicle', dueOn: '2026-10-20' });
  equal(graceDays(car), 0);
  equal(policyState(car, '2026-10-21').status, 'lapsed');
  equal(policyState(health({}, { dueOn: '' }), '2026-10-21').status, 'undated');
});

test('policy: its row says plainly what to do when it is overdue', () => {
  const r = health({}, { kind: 'life', dueOn: '2026-10-20' });
  ok(/pay by 19 Nov/.test(stateLine(policyState(r, '2026-10-25'), r).text), stateLine(policyState(r, '2026-10-25'), r).text);
  equal(stateLine(policyState(r, '2026-10-25'), r).tone, 'warn');
  equal(stateLine(policyState(r, '2026-12-25'), r).tone, 'bad');
});

test('policy: its own page explains the short line, and says nothing when all is well', () => {
  const r = health({}, { kind: 'life', dueOn: '2026-10-20' });
  ok(/grace period/.test(stateNote(policyState(r, '2026-10-25'), r)) && /19 Nov/.test(stateNote(policyState(r, '2026-10-25'), r)));
  ok(/revived/.test(stateNote(policyState(r, '2026-12-25'), r)));
  const car = health({}, { kind: 'vehicle', dueOn: '2026-10-20' });
  ok(/runs out on its date/.test(stateNote(policyState(car, '2026-10-21'), car)));
  equal(stateNote(policyState(r, '2026-10-05'), r), '');
});

test('policy: marking it paid moves the date on a whole period from the date it was due, and records the payment', () => {
  const r = health();
  const paid = markPaid(r, '2026-08-20');
  equal(paid.policy.dueOn, '2027-08-12');
  equal(paid.renewsOn, '2027-08-12');
  equal(paid.policy.lastPaid, '2026-08-20');
  equal(paid.policy.payments, [{ date: '2026-08-20', amount: rupees(24000) }]);
  // Paid early: still one year on from the date it was due.
  equal(markPaid(r, '2026-07-01').policy.dueOn, '2027-08-12');
});

test('policy: a monthly premium due on the 31st comes back to the 31st after a short month', () => {
  let r = health({}, { frequency: 'monthly', amount: '1000', dueOn: '2026-01-31' });
  r = markPaid(r, '2026-01-31');
  equal(r.policy.dueOn, '2026-02-28');
  r = markPaid(r, '2026-02-28');
  equal(r.policy.dueOn, '2026-03-31');
});

test('policy: editing keeps what was paid and the order on Plan', () => {
  const paid = { ...markPaid(health(), '2026-08-20'), sortOrder: 3 };
  const edited = buildPolicy({ existing: paid, fields: { kind: 'health', name: 'Family health cover', amount: '26000', frequency: 'yearly', dueOn: '2027-08-12' } });
  equal(edited.amount, rupees(26000));
  equal(edited.policy.payments.length, 1);
  equal(edited.sortOrder, 3);
  equal(edited.id, 'fixed-h1');
});

test('policy: a business policy belongs to its lane, a home one to none', () => {
  equal(health({ space: 'biz-1' }).space, 'biz-1');
  equal('space' in health({ space: 'home' }), false);
});

test('policy: the financial year is April to March, and only payments inside it are counted', () => {
  equal(fyOf('2026-10-18'), { from: '2026-04-01', to: '2027-03-31', label: '2026-27' });
  equal(fyOf('2027-03-31').label, '2026-27');
  equal(fyOf('2027-04-01').label, '2027-28');
  equal(fyOf('2026-03-31').label, '2025-26');
  let r = health({}, { dueOn: '2025-08-12' });
  r = markPaid(r, '2025-08-12'); // 2025-26
  r = markPaid(r, '2026-08-12'); // 2026-27
  equal(paidInYear(r, fyOf('2026-10-18')), rupees(24000));
  equal(paidInYear(r, fyOf('2025-06-01')), rupees(24000));
  equal(paidInYear(r, fyOf('2024-06-01')), 0);
});

test('policy: money a policy pays back is listed in order and only inside the window', () => {
  const a = health({ id: 'a' }, { kind: 'life', maturityOn: '2027-03-01', maturityAmount: '500000' });
  const b = health({ id: 'b' }, { kind: 'life', maturityOn: '2026-12-01', maturityAmount: '100000' });
  const far = health({ id: 'c' }, { kind: 'life', maturityOn: '2031-03-01', maturityAmount: '900000' });
  const past = health({ id: 'd' }, { kind: 'life', maturityOn: '2025-01-01', maturityAmount: '1' });
  const got = maturitiesAhead([a, b, far, past], '2026-10-18');
  equal(got.map((g) => g.item.id), ['b', 'a']);
  equal(got[0].amount, rupees(100000));
});

test('policy: the family summary has the details that were typed and nothing that was not', () => {
  const text = familySummary([health({}, { nominee: 'Asha' })], '2026-10-18');
  ok(text.includes('POL-1234') && text.includes('Self, spouse, two children') && text.includes('Nominee: Asha') && text.includes('1800 000 000'), text);
  ok(text.includes('Sum insured: ₹10,00,000'), text);
  ok(!/Agent:|Matures:|Last paid:/.test(text), 'a field left empty is not printed');
  equal(familySummary([], '2026-10-18'), '');
});

test('policy: a diagnostic report keeps dates and amounts, never the policy number, nominee or numbers to call', () => {
  const r = markPaid(health({}, { nominee: 'Asha', agent: 'Raj' }), '2026-08-20');
  const red = JSON.stringify(redactPolicy(r.policy));
  ok(!/POL-1234|Asha|Raj|1800|Test Insurer|Self, spouse/.test(red), red);
  ok(red.includes('2027-08-12') && red.includes('2026-08-20'), red);
});
