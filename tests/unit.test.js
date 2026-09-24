// Rules that need no database: dates, duplicates, commitments, EMIs, card
// cycles and the parsers.
import { test, equal, ok, paise } from './harness.js';
import { txn, commitment, rupees } from './fixtures.js';
import { nextOccurrence } from '../js/frequency.js';
import { sameTransaction, findDuplicates } from '../js/duplicates.js';
import { coveredByFixed, detectEmis, commitmentDueInWindow, commitmentMatcher } from '../js/commitments.js';
import { cardPosition, bankBalance, statementDayFixes } from '../js/account-metrics.js';
import { looksLikeCardPayment } from '../js/transfers.js';
import { spendingMonthOf } from '../js/spending-month.js';
import { parseAlert, splitAlerts } from '../js/alerts.js';
import * as hdfcList from '../js/parsers/hdfc-card-current-text.js';
import * as csvParser from '../js/parsers/csv.js';
import { dataSafety } from '../js/views/settings.js';
import { loanPayments, payFasterPlan, loanPosition, assignLoanPayments, loanHistory } from '../js/loans.js';
import * as sbiLoan from '../js/parsers/sbi-loan.js';
import * as sbiSavings from '../js/parsers/sbi-savings.js';
import { formatRupees, formatCurrency } from '../js/format.js';
import { displayName } from '../js/views/transactions.js';
import { assignStyles } from '../js/category-style.js';
import { searchWords, findCandidates } from '../js/category-match.js';
import { acceptSignIn, hasGooglePass } from '../js/drive.js';

test('a statement day typed in by hand is corrected by the card\'s own statements', () => {
  const typed = { id: 'c1', type: 'card', billingCycleDay: 26 };
  const right = { id: 'c2', type: 'card', billingCycleDay: 25 };
  const noStatement = { id: 'c3', type: 'card', billingCycleDay: 26 };
  const batches = [
    { accountId: 'c1', periodEnd: '2026-08-25', provisional: false },
    { accountId: 'c2', periodEnd: '2026-08-25', provisional: false },
    // A current-transactions list is not a statement and proves nothing.
    { accountId: 'c3', periodEnd: '2026-09-15', provisional: true },
  ];
  const fixes = statementDayFixes([typed, right, noStatement], batches);
  equal(fixes.map((a) => [a.id, a.billingCycleDay]), [['c1', 25]]);
  // Month in review files a spend on the 26th by the corrected day.
  equal(spendingMonthOf({ date: '2026-08-26' }, fixes[0]), '2026-09');
});

test('Google Drive sign-in is accepted only when it answers this visit, with the Drive folder, and a yes', () => {
  const pending = (state, silent = false) => sessionStorage.setItem('kawach-drive-pending', JSON.stringify({ purpose: 'backup', state, silent }));
  const fails = (hash) => {
    try {
      acceptSignIn(hash);
      return false;
    } catch {
      return true;
    }
  };
  localStorage.removeItem('kawach-google-pass');
  // An answer to a sign-in this visit never asked for.
  pending('abc');
  ok(fails('#access_token=t&state=xyz&scope=https://www.googleapis.com/auth/drive.appdata'), 'wrong state refused');
  ok(!hasGooglePass(), 'no pass kept');
  // A "no" from the user.
  pending('abc');
  ok(fails('#error=access_denied&state=abc'), 'refusal reported');
  // Signed in, but the Drive folder left unticked.
  pending('abc');
  ok(fails('#access_token=t&state=abc&scope=email'), 'missing permission refused');
  // A quiet renewal Google couldn't give without asking: marked silent, so
  // nobody is shown an error for it.
  pending('abc', true);
  let quiet = null;
  try {
    acceptSignIn('#error=interaction_required&state=abc');
  } catch (err) {
    quiet = err;
  }
  ok(quiet && quiet.silent, 'silent failure marked');
  // The real thing: kept until it runs out, and it says what to carry on with.
  pending('abc');
  equal(acceptSignIn('#access_token=t&state=abc&expires_in=3599&scope=https://www.googleapis.com/auth/drive.appdata'), 'backup');
  ok(hasGooglePass(), 'pass kept');
  localStorage.removeItem('kawach-google-pass');
});

test('a new category is offered only uncategorised payments that name it as a whole word', () => {
  equal(searchWords('To Papa'), ['papa']);
  equal(searchWords('House Rent', 'dabba, mess'), ['house', 'rent', 'dabba', 'mess']);
  const rows = [
    txn({ id: 'a', date: '2026-09-05', amount: 40000, rawDescription: 'UPI-HOUSE RENT-owner@okaxis' }),
    txn({ id: 'b', date: '2026-09-06', amount: 500, rawDescription: 'CURRENT ACCOUNT CHARGES' }),
    txn({ id: 'c', date: '2026-09-07', amount: 800, rawDescription: 'PARENT TEACHER MEET' }),
    { ...txn({ id: 'd', date: '2026-09-08', amount: 40000, rawDescription: 'RENT SEPT' }), categoryId: 'mine' },
    { ...txn({ id: 'e', date: '2026-09-09', amount: 40000, rawDescription: 'RENT TO SELF' }), isTransfer: true },
    { ...txn({ id: 'f', date: '2026-09-10', amount: 40000, rawDescription: 'RENT SPLIT' }), splits: [{ categoryId: 'x', amount: 40000 }] },
    txn({ id: 'g', date: '2026-09-11', amount: 300, rawDescription: 'rent-parking' }),
  ];
  // Whole words only; a category you set, moved money and splits are left alone. Newest first.
  equal(findCandidates(rows, searchWords('Rent')).map((t) => t.id), ['g', 'a']);
  equal(findCandidates(rows, []), []);
});

test('no two categories share an icon or a colour, and your own choice is kept', () => {
  const names = ['Home Loan EMI', 'Bank Charges', 'House Rent', 'PF Transfer', 'Digital Wallet', 'To Papa', 'Bills & Utilities', 'Entertainment', 'Food & Dining',
    'Groceries', 'Health', 'Income', 'Other', 'Shopping', 'Transfer', 'Transport', 'ATM Withdrawal'];
  const styles = assignStyles(names.map((name, i) => ({ id: `c${i}`, name })));
  const icons = names.map((n) => styles.get(n.toLowerCase()).iconKey);
  const colors = names.map((n) => styles.get(n.toLowerCase()).color);
  equal(new Set(icons).size, names.length);
  equal(new Set(colors).size, names.length);
  // The ones that used to share a price tag, a house and an arrow.
  equal(['Bank Charges', 'Digital Wallet', 'To Papa', 'ATM Withdrawal', 'Home Loan EMI', 'House Rent', 'PF Transfer', 'Transfer'].map((n) => styles.get(n.toLowerCase()).iconKey),
    ['fee', 'wallet', 'family', 'atm', 'loan', 'rent', 'piggy', 'transfer']);
  // Picking the loan's icon for Rent: Rent keeps it, the loan moves on.
  const picked = assignStyles([{ id: 'a', name: 'Home Loan EMI' }, { id: 'b', name: 'House Rent', icon: 'i:loan', color: 'var(--cat-1)' }]);
  equal(picked.get('house rent').iconKey, 'loan');
  equal(picked.get('house rent').color, 'var(--cat-1)');
  ok(picked.get('home loan emi').iconKey !== 'loan', 'the loan moves to another icon');
  // A picture you chose shows as that picture; anything else is refused.
  ok(assignStyles([{ id: 'p', name: 'Pet', image: 'data:image/webp;base64,AAAA' }]).get('pet').icon.startsWith('<img'), 'picture');
  ok(!assignStyles([{ id: 'x', name: 'X', image: 'javascript:alert(1)' }]).get('x').icon.includes('javascript'), 'not a picture');
});

test('History names a payment by its merchant, not its bank narration', () => {
  equal(displayName('UPI-SWIGGY-swiggy@icici-123456789012-PAYMENT'), 'Swiggy');
  // Channel, bank code and reference go; the payee stays.
  equal(displayName('NEFT DR-HDFC0000001-RAVI KUMAR-NETBANK, MUM-N123456789'), 'Ravi Kumar Netbank');
  equal(displayName('Amazon Pay India'), 'Amazon Pay');
  // Nothing recognisable left: the narration itself, shortened.
  equal(displayName('123456789'), '123456789');
  equal(displayName(''), 'Payment');
});

test('a negative amount always shows its minus, in front of the ₹', () => {
  equal(formatRupees(-7363000), '−₹73,630');
  equal(formatRupees(7363000), '₹73,630');
  equal(formatCurrency(-123456), '−₹1,234.56');
  equal(formatCurrency(6800000), '₹68,000');
  // Less than half a rupee short rounds to nothing, and nothing has no sign.
  equal(formatRupees(-40), '₹0');
});
import { pfContribution, pfPosition } from '../js/pf.js';
import * as passbook from '../js/parsers/epfo-passbook.js';

// --- Dates ------------------------------------------------------------------

test('a day the month lacks is its last day (31st in September = 30 Sep)', () => {
  equal(nextOccurrence(31, new Date(2026, 8, 16)), '2026-09-30');
  equal(nextOccurrence(31, new Date(2026, 9, 1)), '2026-10-31');
});

test('something due today is due today, not next month', () => {
  equal(nextOccurrence(16, new Date(2026, 8, 16, 23, 59)), '2026-09-16');
});

test('card spends after the statement day count in the next month', () => {
  const card = { type: 'card', billingCycleDay: 25 };
  equal(spendingMonthOf({ date: '2026-09-25' }, card), '2026-09');
  equal(spendingMonthOf({ date: '2026-09-26' }, card), '2026-10');
  equal(spendingMonthOf({ date: '2026-09-26' }, { type: 'bank' }), '2026-09');
});

// --- Duplicates ---------------------------------------------------------------

const base = { accountId: 'bank', date: '2026-08-31', amount: rupees(68000), direction: 'debit' };

test('duplicates: same reference in two statement formats is one payment', () => {
  ok(sameTransaction({ ...base, rawDescription: 'IMPS-600000000002-01 SBI Savings-Home Loan EMI' }, { ...base, rawDescription: 'IMPS/600000000002/SBI Savings/Home Loan EMI' }));
});

test('duplicates: different references are different payments', () => {
  ok(!sameTransaction({ ...base, rawDescription: 'UPI-A-600000000002' }, { ...base, rawDescription: 'UPI-A-600000000003' }));
});

test('duplicates: two ATM withdrawals differing only in machine code are both real', () => {
  ok(!sameTransaction({ ...base, rawDescription: 'ATW-400000XXXXXX1234-S1AWMI30-MUMBAI' }, { ...base, rawDescription: 'ATW-400000XXXXXX1234-S1AWMI31-MUMBAI' }));
});

test('duplicates: identical rows inside one statement are two real payments; a copy from another import is not', () => {
  const a = txn({ ...base, amount: 413, rawDescription: 'UPI-SWIGGY-111111111', importBatchId: 's1', updatedAt: 1 });
  const b = txn({ ...base, amount: 413, rawDescription: 'UPI-SWIGGY-111111111', importBatchId: 's1', updatedAt: 2 });
  const c = txn({ ...base, amount: 413, rawDescription: 'UPI/SWIGGY/111111111', importBatchId: 's2', updatedAt: 3 });
  equal(findDuplicates([a, b, c]).map((t) => t.id), [c.id]);
});

// --- Commitments ------------------------------------------------------------

test('adding one detected item hides only that item, not others in its category', () => {
  const detected = [
    { id: 'r1', label: 'GOOGLE PLAY CONTENT', amount: 48900, dayOfMonth: 14, categoryId: 'bills', accountId: 'card' },
    { id: 'r2', label: 'GOOGLE PLAY APP', amount: 199900, dayOfMonth: 5, categoryId: 'bills', accountId: 'card' },
  ];
  const fixed = [{ label: 'GOOGLE PLAY CONTENT', amount: 48900, dayOfMonth: 14, categoryId: 'bills', accountId: 'card', fromRecurringId: 'r1' }];
  equal(detected.filter((d) => !coveredByFixed(d, fixed)).map((d) => d.id), ['r2']);
});

test('EMI principal and interest rows merge, even when a statement wraps the merchant name', () => {
  const emis = detectEmis([
    { date: '2026-08-08', description: 'Interest Amount Amortization - <4/12>WWW', amount: rupees(469.4), direction: 'debit' },
    { date: '2026-08-08', description: 'Principal Amount Amortization - <4/12>WWW DYSON IN', amount: rupees(3710.13), direction: 'debit' },
  ]);
  equal(emis.length, 1);
  paise(emis[0].amount, rupees(4179.53));
  equal([emis[0].current, emis[0].total, emis[0].endDate], [4, 12, '2027-04-08']);
});

test('spread commitment: the rest of this month pro rata, next month in full', () => {
  const tiffin = commitment({ label: 'Tiffin', amount: 13950, spread: true });
  const r = commitmentDueInWindow(tiffin, { today: '2026-09-16', windowEnd: '2026-10-30', bankEntries: [], wholeMonths: true });
  paise(r.amount, rupees(6975 + 13950));
});

test('dated commitment already paid early is not taken off again', () => {
  const loan = commitment({ label: 'Home Loan EMI', amount: 68000, dayOfMonth: 30, matchText: 'Home Loan EMI' });
  const paid = [txn({ accountId: 'bank', date: '2026-09-28', amount: 68000, rawDescription: 'IMPS-SBI-Home Loan EMI' })];
  equal(commitmentDueInWindow(loan, { today: '2026-09-29', windowEnd: '2026-10-29', bankEntries: paid }).amount, 0);
});

test('ATM cash is recognised without being told; a dated item without words matches by amount', () => {
  const atm = commitment({ label: 'ATM Withdrawal', amount: 26000 });
  ok(commitmentMatcher(atm)({ rawDescription: 'NWD-400000XXXXXX1234-12041HHR', amount: rupees(10000) }));
  const papa = commitment({ label: 'Sent to Papa', amount: 30000 });
  ok(commitmentMatcher(papa)({ rawDescription: 'UPI-SOMEONE', amount: rupees(30000) }));
  ok(!commitmentMatcher(papa)({ rawDescription: 'UPI-SOMEONE', amount: rupees(20000) }));
});

// --- Cards ------------------------------------------------------------------

test('card: a payment for last month\'s bill never reduces this cycle\'s spending', () => {
  const card = { id: 'card', type: 'card', billingCycleDay: 25 };
  const rows = [
    txn({ accountId: 'card', date: '2026-09-03', amount: 17400, direction: 'credit', rawDescription: 'Bppy Cc Payment', isTransfer: true }),
    txn({ accountId: 'card', date: '2026-09-10', amount: 5000, rawDescription: 'Swiggy' }),
    txn({ accountId: 'card', date: '2026-09-12', amount: 500, direction: 'credit', rawDescription: 'Cashback' }),
  ];
  const p = cardPosition(card, rows, [], '2026-09-16');
  paise(p.owed, rupees(4500));
  paise(p.billedNotImported, 0);
});

test('card: after the statement day this cycle becomes a bill, and the payment clears it', () => {
  const card = { id: 'card', type: 'card', billingCycleDay: 25 };
  const spend = txn({ accountId: 'card', date: '2026-09-10', amount: 5000, rawDescription: 'Swiggy' });
  const after = cardPosition(card, [spend], [], '2026-09-27');
  paise(after.owed, 0);
  paise(after.billedNotImported, rupees(5000));
  const payment = txn({ accountId: 'card', date: '2026-10-02', amount: 5000, direction: 'credit', rawDescription: 'Payment received', isTransfer: true });
  paise(cardPosition(card, [spend, payment], [], '2026-10-03').billedNotImported, 0);
});

test('card bill payments are recognised on both sides; a refund is not', () => {
  ok(looksLikeCardPayment({ direction: 'credit', rawDescription: 'BBPS Payment received' }, 'card'));
  ok(looksLikeCardPayment({ direction: 'debit', rawDescription: 'UPI-CRED Club-cred.club@axisb' }, 'bank'));
  ok(!looksLikeCardPayment({ direction: 'credit', rawDescription: 'PEPE JEANS REFUND' }, 'card'));
});

// --- Parsers ----------------------------------------------------------------

const LIST = `Test Credit Card 1234
© HDFC Bank 2026
14 Sept 2026
10% Cashback
₹49.00\tcredit icon
13 Sept 2026
Food Delivery Bengaluru
ELIGIBLE FOR SMARTEMI
₹413.00\tdebit icon
03 Sept 2026
Bppy Cc Payment Dp21
₹17,400.00\tcredit icon

Other Credit Card 5678
12 Sept 2026
Upi-grocer
₹506.00\tdebit icon`;

test('HDFC pasted list: two cards, page text ignored, bill payment kept apart from cashback', () => {
  const sections = hdfcList.splitSections(LIST);
  equal(sections.map((s) => [s.last4, s.rowCount]), [['1234', 3], ['5678', 1]]);
  const { rows, meta } = hdfcList.parse(sections[0].text);
  equal(rows[1].description, 'Food Delivery Bengaluru');
  paise(meta.totals.owed, rupees(413 - 49));
  paise(meta.totals.billPayments, rupees(17400));
});

test('bank alerts: an SMS is read and two pasted together are split', () => {
  const sms = 'Spent Rs.413.00 On HDFC Bank Card 4321 At SWIGGY On 2026-09-12:20:15:01. Not You? Call 18002586161';
  const p = parseAlert(sms);
  ok(p.ok, 'alert read');
  equal([p.direction, p.last4, p.date], ['debit', '4321', '2026-09-12']);
  equal(splitAlerts(`${sms}\n\n${sms.replace('413.00', '99.00')}`).length, 2);
});

test('SBI, Axis and Kotak alerts are read by the general reader', () => {
  const sbi = parseAlert('Dear UPI user A/C X1234 debited by 250.0 on date 12Sep26 trf to SWIGGY Refno 425612345678. If not u? call 1800111109. -SBI');
  ok(sbi.ok, 'SBI read');
  equal([sbi.bank, sbi.direction, sbi.amount, sbi.last4, sbi.date, sbi.ref], ['SBI', 'debit', 25000, '1234', '2026-09-12', '425612345678']);
  const axis = parseAlert('INR 250.00 debited\nA/c no. XX1234\n12-09-26, 20:15:01\nUPI/P2M/425612345678/SWIGGY\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank');
  ok(axis.ok, 'Axis read');
  equal([axis.bank, axis.direction, axis.amount, axis.last4, axis.date, axis.ref], ['Axis', 'debit', 25000, '1234', '2026-09-12', '425612345678']);
  const kotak = parseAlert('Sent Rs.250.00 from Kotak Bank AC X1234 to swiggy@icici on 12-09-26.UPI Ref 425612345678. Not you, https://kotak.com/KBANKT/Fraud');
  ok(kotak.ok, 'Kotak read');
  equal([kotak.bank, kotak.direction, kotak.amount, kotak.last4, kotak.ref], ['Kotak', 'debit', 25000, '1234', '425612345678']);
  const received = parseAlert('Received Rs.1500.00 in your Kotak Bank AC X1234 from friend@okaxis on 12-09-26.UPI Ref:425612345679.');
  equal([received.ok, received.direction, received.amount], [true, 'credit', 150000]);
});

// --- Spreadsheets ---------------------------------------------------------------

test('CSV: letterhead skipped, withdrawal and deposit columns, day-first dates, reference kept', () => {
  const csv = [
    'Some Bank Ltd,,,,,',
    'Account No: XXXXXXXX1234,,,,,',
    ',,,,,',
    'Txn Date,Value Date,Description,Ref No./Cheque No.,Withdrawal Amt,Deposit Amt,Balance',
    '01/09/2026,01/09/2026,"UPI/SWIGGY/Food, delivery",425612345678,"1,250.50",,"48,749.50"',
    '05/09/2026,05/09/2026,NEFT SALARY,,,"1,00,000.00","1,48,749.50"',
    ',,Total,,"1,250.50","1,00,000.00",',
  ].join('\n');
  const { rows, meta } = csvParser.parse(csv);
  equal(rows.map((r) => [r.date, r.direction, r.amount, r.ref]), [
    ['2026-09-01', 'debit', 125050, '425612345678'],
    ['2026-09-05', 'credit', 10000000, null],
  ]);
  equal(rows[0].description, 'UPI/SWIGGY/Food, delivery');
  equal([meta.periodStart, meta.periodEnd, meta.statedClosingBalance, meta.skippedRows], ['2026-09-01', '2026-09-05', 148749.5, 1]);
});

test('CSV: one amount column with Dr/Cr, newest first, month-first dates when the file proves it', () => {
  const csv = 'Date;Narration;Amount;Dr/Cr;Balance\n09/13/2026;ATM CASH WDL;2000.00;DR;1000.00\n09/02/2026;REFUND;150;CR;3000.00\n';
  const { rows, meta } = csvParser.parse(csv);
  equal(rows.map((r) => [r.date, r.direction, r.amount]), [
    ['2026-09-13', 'debit', 200000],
    ['2026-09-02', 'credit', 15000],
  ]);
  equal(meta.statedClosingBalance, 1000);
  ok(!csvParser.detect('Name,Phone\nA,1'), 'a file without the columns is refused');
});

// --- Matching words and references -------------------------------------------

test('a whole statement line as match words still recognises next month\'s payment', () => {
  const tiffin = commitment({
    label: 'Tiffin Bill',
    amount: 5400,
    spread: true,
    matchText: 'UPI-cookname-cook.name@okicici-UTIB0000001-600000000001-Tiffin Bill Value Dt 03/08/2026 Ref 600000000001',
  });
  const matches = commitmentMatcher(tiffin);
  ok(matches(txn({ amount: 2700, rawDescription: 'UPI-cookname-cook.nam e@ okicici-UTIB0000001-661234567890-Tiffin Bill Value Dt 02/09/2026 Ref 661234567890' })));
  ok(!matches(txn({ amount: 2700, rawDescription: 'UPI-grocer-grocer@okicici-UTIB0000001-661234567891-Groceries Value Dt 02/09/2026 Ref 661234567891' })));
  const cash = commitmentMatcher(commitment({ label: 'ATM', amount: 10000, spread: true, matchText: 'my atm words' }));
  ok(cash(txn({ amount: 2000, rawDescription: 'NWD-400000XXXXXX1111-12041HHR-MUMBAI Value Dt 12/09/2026 Ref 000000621812' })), 'cash withdrawal recognised');
});

test('references: a shared phone number in a UPI id is not a copy; a NetBanking row with an extra number is', () => {
  const park = (ref) => txn({ accountId: 'bank', date: '2026-09-15', amount: 60, importBatchId: 'year', rawDescription: `UPI-Aarey parking-q617982219@ybl-YESB0YBLUPI-${ref}-UPI` });
  equal(findDuplicates([park('128254755901'), park('128412066681')]).length, 0);
  const pdf = txn({ accountId: 'bank', date: '2026-09-11', amount: 100, importBatchId: 'pdf', updatedAt: 1, rawDescription: 'UPI-SHOP-shop@okaxis-UTIB000100-625412345237-3' });
  const netbanking = txn({ accountId: 'bank', date: '2026-09-11', amount: 100, importBatchId: 'year', updatedAt: 2, bankRef: '0000625412345239', rawDescription: 'UPI-SHOP NAME-shop@okaxis-625412345237-3 625412345238 NOTE' });
  ok(sameTransaction(pdf, netbanking));
  equal(findDuplicates([pdf, netbanking]).map((t) => t.id), [netbanking.id]);
});

test('an all-zero reference does not make two withdrawals one', () => {
  const a = txn({ accountId: 'bank', date: '2026-09-12', amount: 2000, rawDescription: 'NWD-400000XXXXXX1111-S1AWMI30', bankRef: '000000000000', importBatchId: 'x' });
  const b = txn({ accountId: 'bank', date: '2026-09-12', amount: 2000, rawDescription: 'NWD-400000XXXXXX1111-S1AWMI31', bankRef: '000000000000', importBatchId: 'x' });
  ok(!sameTransaction(a, b));
  equal(findDuplicates([a, b]).length, 0);
});

// --- Backup ---------------------------------------------------------------

test('data is safe with a sync in the last week or a backup file in the last month', () => {
  const now = new Date(2026, 8, 17).getTime();
  const DAY = 86400000;
  const off = { configured: false };
  equal(dataSafety(off, null, null, now).ok, false);
  equal(dataSafety(off, null, now - 20 * DAY, now).ok, true);
  equal(dataSafety(off, null, now - 40 * DAY, now).daysUnprotected, 40);
  equal(dataSafety({ configured: true, lastSync: now - 2 * DAY }, 'secret', null, now).ok, true);
  equal(dataSafety({ configured: true, lastSync: now - 2 * DAY }, null, null, now).ok, false, 'no passphrase on this device');
});

// --- Bank balance ---------------------------------------------------------

test("a spend logged on the statement's own date still comes off the balance", () => {
  const account = { id: 'bank', type: 'bank', knownBalance: rupees(60315), knownBalanceDate: '2026-09-16' };
  const rows = [
    // Already inside the statement's closing balance
    txn({ accountId: 'bank', date: '2026-09-16', amount: 500, source: 'statement', importBatchId: 'i5' }),
    // Saved from a bank alert that same day, after the statement was cut
    txn({ accountId: 'bank', date: '2026-09-16', amount: 600, source: 'alert' }),
    txn({ accountId: 'bank', date: '2026-09-17', amount: 50, source: 'alert' }),
    txn({ accountId: 'bank', date: '2026-09-15', amount: 900, source: 'manual' }),
  ];
  paise(bankBalance(account, rows), rupees(60315 - 600 - 50));
});

// --- Loans and provident fund ---------------------------------------------

const homeLoan = {
  id: 'loan',
  type: 'loan',
  label: 'Home Loan',
  loan: { principal: rupees(4500000), outstanding: rupees(3100000), outstandingAsOf: '2026-08-31', ratePct: 7.75, emi: rupees(23000), day: 15, paidFromId: 'sbi' },
};

test('an EMI is split into interest and principal on the balance at the time', () => {
  const rows = loanPayments(homeLoan, [txn({ accountId: 'sbi', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO LOAN' })], '2026-09-30');
  equal(rows.length, 1);
  // 7.75% a year on ₹31,00,000 is about ₹20,021 for the month.
  ok(rows[0].interest > rupees(19500) && rows[0].interest < rupees(20200), `interest ${rows[0].interest / 100}`);
  paise(rows[0].principal, rupees(23000) - rows[0].interest);
});

test('two loans with the same EMI from the same account share the payments, one each', () => {
  const loanA = { ...homeLoan, id: 'a', label: 'Home Loan A' };
  const loanB = { ...homeLoan, id: 'b', label: 'Home Loan B', loan: { ...homeLoan.loan, outstanding: rupees(3000000) } };
  const both = [
    txn({ accountId: 'sbi', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO 51112222001' }),
    txn({ accountId: 'sbi', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO 51112222002' }),
  ];
  const assigned = assignLoanPayments([loanA, loanB], both, '2026-09-30');
  equal([assigned.get('a').length, assigned.get('b').length], [1, 1]);
  equal(loanPosition(loanA, both, '2026-09-30', [loanA, loanB]).paid, 1);
  // Tagging one to a loan by hand wins over sharing them out.
  const tagged = [{ ...both[0], paysLoanId: 'b' }, both[1]];
  equal(assignLoanPayments([loanA, loanB], tagged, '2026-09-30').get('b').length, 1);
});

test('"Paid from" is a hint: the EMI is found elsewhere when that account never pays it', () => {
  // The loan says it is paid from 'sbi', but the EMI actually leaves 'hdfc'.
  // Showing no payments at all would be worse than finding them.
  const elsewhere = [txn({ accountId: 'hdfc', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO LOAN' })];
  equal(loanPayments(homeLoan, elsewhere, '2026-09-30').length, 1);
  // As soon as the named account does pay it, only that account counts, so a
  // same-sized payment somewhere else is not claimed twice.
  const both = [...elsewhere, txn({ accountId: 'sbi', date: '2026-09-15', amount: 23000, rawDescription: 'TRANSFER TO LOAN' })];
  const rows = loanPayments(homeLoan, both, '2026-09-30');
  equal([rows.length, rows[0].id], [1, both[1].id]);
});

test('only the EMI amount counts, however close to the due day a payment lands', () => {
  // A ₹30,000 transfer near the 15th is not a ₹23,000 EMI. Counting it once
  // made a loan report interest and principal that were never paid.
  for (const date of ['2026-09-09', '2026-09-14', '2026-09-15']) {
    equal(loanPayments(homeLoan, [txn({ accountId: 'sbi', date, amount: 30000, rawDescription: 'TRANSFER' })], '2026-09-30').length, 0);
  }
  // Rounding to the rupee either way is still the same EMI.
  equal(loanPayments(homeLoan, [txn({ accountId: 'sbi', date: '2026-09-15', amount: 23100, rawDescription: 'EMI' })], '2026-09-30').length, 1);
  // Tagging it by hand is how a payment of any other size gets counted.
  const tagged = [{ ...txn({ accountId: 'sbi', date: '2026-09-15', amount: 30000, rawDescription: 'TRANSFER' }), paysLoanId: homeLoan.id }];
  equal(loanPayments(homeLoan, tagged, '2026-09-30').length, 1);
});

test('interest and principal add up across every payment in the statements', () => {
  const months = ['2026-06-15', '2026-07-15', '2026-08-15', '2026-09-15'];
  const rows = loanPayments(
    homeLoan,
    months.map((date) => txn({ accountId: 'sbi', date, amount: 23000, rawDescription: 'EMI' })),
    '2026-09-30'
  );
  equal(rows.length, 4);
  const total = rows.reduce((s, r) => s + r.interest + r.principal, 0);
  // Nothing invented and nothing lost: the split covers exactly what was paid.
  paise(total, rupees(23000 * 4));
  // Newest first, and the balance it was worked out on falls over time.
  equal(rows[0].date, '2026-09-15');
  ok(rows[0].interest < rows[3].interest, 'interest shrinks as the loan does');
});

// A made-up SBI loan statement in the bank's layout: ₹50 lakh sanctioned,
// ₹20,08,000 released so far (the second release has its balance glued on
// the end, as SBI sometimes prints it), then two months of ₹13,000 interest
// charged and ₹16,000 paid.
const SBI_LOAN = `State Bank of India
Date of Statement : 18-09-2026
50,00,000.00
Sanctioned Amount :
Outstanding Amount : 20,02,000.00
Account No : 11112222333
Rate of Interest : 8.00% Product : Home Loan
Loan Term : 360 Months Currency
Remaining Tenure : 340 Months
EMI : 15,000.00
Account open Date : 01-01-2026
Post Date Details Debit Credit Balance
O.S. DEPOSIT TRANSFER
20,02,000.00
15/09/2026 15/09/2026 TRANSFER FROM TFR TO - - 16,000.00
DR
20,18,000.00
31/08/2026 31/08/2026 PART PERIOD INTEREST - 13,000.00 -
DR
O.S. DEPOSIT TRANSFER
20,05,000.00
15/08/2026 15/08/2026 TRANSFER FROM TFR TO - - 16,000.00
DR
20,21,000.00
31/07/2026 31/07/2026 PART PERIOD INTEREST - 13,000.00 -
DR
RATE CHANGED FM 8.250% TO
15/07/2026 15/07/2026 - -
8.000%
ADVANCE:LOAN TO GL AS
20,08,000.00
10/07/2026 10/07/2026 - 8,000.00 - 20,08,000.00DR
PRINCIPAL NEFT
DR
SBIN000000000001 BUILDER PVT LTD
ADVANCE:LOAN TO GL AS
20,00,000.00
01/01/2026 01/01/2026 - 20,00,000.00 -
PRINCIPAL NEFT
DR`;

// A made-up SBI savings statement: ₹10,000 opening, a ₹50,000 transfer in,
// ₹40,000 swept into a deposit and ₹12,000 of it swept back, a ₹15,000 EMI.
// ₹37,000 of MOD deposits linked to it, ₹39,500 at maturity.
const SBI_SAVINGS = `Relationship Summary
Term Accounts Recurring - -
Fixed Deposits 37,000.00 39,500.00
Date of Statement : 18-09-2026
Clear Balance : 17,000.00CR
Account Number : 11122233344
+MOD Bal : 37,000.00CR
IFS Code : SBIN0000001
DEP TFR
01/09/2026 01/09/2026 - - 50,000.00 60,000.00
IMPS/111111111111/SALARY
SWEEP TFR DR 0000000000001
05/09/2026 05/09/2026 - 40,000.00 - 20,000.00
OF A PERSON AT 00001
Page no. 1
SWEEP TRF CREDT
15/09/2026 15/09/2026 - - 12,000.00 32,000.00
0000000000001 OF A PERSON
DIRECT DR 0022233344455 OF
15/09/2026 15/09/2026 A PERSON AT - 15,000.00 - 17,000.00
00001 BRANCH
Statement Summary : 01-09-2026 To 18-09-2026
Brought Forward Dr Count Cr Count Total Debit Total Credit Closing Balance
10,000.00CR 2 2 55,000.00 62,000.00 17,000.00CR`;

test('SBI savings statement: every row, checked against its own summary, and the deposits beside it', () => {
  ok(sbiSavings.detect(SBI_SAVINGS));
  equal(sbiLoan.detect(SBI_SAVINGS), false);
  equal(sbiSavings.detect(SBI_LOAN), false);
  const { rows, meta } = sbiSavings.parse(SBI_SAVINGS);
  equal(rows.map((r) => [r.date, r.direction, r.amount]), [
    ['2026-09-01', 'credit', rupees(50000)],
    ['2026-09-05', 'debit', rupees(40000)],
    ['2026-09-15', 'credit', rupees(12000)],
    ['2026-09-15', 'debit', rupees(15000)],
  ]);
  // Page furniture doesn't end up in a description; the empty Ref column's
  // "-" doesn't either.
  equal(rows[1].description, 'SWEEP TFR DR 0000000000001 OF A PERSON AT 00001');
  equal(rows[3].description, 'DIRECT DR 0022233344455 OF A PERSON AT 00001 BRANCH');
  // Sweeps are money between your own accounts; the EMI is not a sweep.
  equal(rows.map((r) => Boolean(r.isTransfer)), [false, true, true, false]);
  equal([meta.reconciled, meta.statedClosingBalance, meta.accountLast4, meta.periodStart, meta.periodEnd], [true, 17000, '3344', '2026-09-01', '2026-09-18']);
  equal(meta.deposit, { kind: 'MOD', balance: rupees(37000), atMaturity: rupees(39500), asOf: '2026-09-18' });
});

test('SBI savings statement: a row missed is caught by the summary', () => {
  const missing = SBI_SAVINGS.replace('15/09/2026 15/09/2026 - - 12,000.00 32,000.00', 'a line the reader could not read');
  equal(sbiSavings.parse(missing).meta.reconciled, false);
});

test('SBI loan statement: releases, the interest actually charged, payments and rate changes', () => {
  ok(sbiLoan.detect(SBI_LOAN));
  const loan = sbiLoan.parse(SBI_LOAN).meta.loan;
  equal([loan.principal, loan.outstanding, loan.outstandingAsOf], [rupees(5000000), rupees(2002000), '2026-09-18']);
  // Both releases, including the one with the balance stuck to it.
  paise(loan.released, rupees(2008000));
  const kinds = (k) => loan.ledger.filter((e) => e.kind === k);
  equal(kinds('payment').map((e) => e.amount), [rupees(16000), rupees(16000)]);
  equal(kinds('interest').map((e) => e.amount), [rupees(13000), rupees(13000)]);
  equal(kinds('rate').map((e) => [e.date, e.from, e.to]), [['2026-07-15', 8.25, 8]]);
  // What you pay beats the bank's EMI when it is more.
  equal([loan.emi, loan.printedEmi, loan.day], [rupees(16000), rupees(15000), 15]);
});

test('a loan still being released: paid back is measured against what was lent, not the sanction', () => {
  const loan = sbiLoan.parse(SBI_LOAN).meta.loan;
  const account = { id: 'hl', type: 'loan', label: 'Home Loan', loan };
  const history = loanHistory(account);
  ok(history.underConstruction, 'under construction');
  paise(history.stillToRelease, rupees(5000000 - 2008000));
  // ₹20,08,000 lent, ₹20,02,000 owed: ₹6,000 paid back - the ₹3,000 above
  // the interest in each of two months. Against the ₹50 lakh sanction the
  // same balance would have read as 60% paid off.
  paise(history.paidBack, rupees(6000));
  paise(history.interestCharged, rupees(26000));
  const position = loanPosition(account, [], '2026-09-18');
  equal([position.underConstruction, position.left, position.endDate], [true, null, null]);
  paise(position.paidBack, rupees(6000));
});

test('each payment splits into the interest the bank charged and the rest off the loan', () => {
  const account = { id: 'hl', type: 'loan', label: 'Home Loan', loan: sbiLoan.parse(SBI_LOAN).meta.loan };
  const rows = loanPayments(account, [], '2026-09-18');
  equal(rows.map((r) => [r.date, r.interest, r.principal]), [
    ['2026-09-15', rupees(13000), rupees(3000)],
    ['2026-08-15', rupees(13000), rupees(3000)],
  ]);
  // A payment seen in the bank after the statement's date is worked out from
  // the rate until the next statement arrives, and lowers what is owed.
  const later = [txn({ accountId: 'sbi', date: '2026-10-15', amount: 16000, rawDescription: 'TRANSFER TO LOAN' })];
  const next = loanPayments(account, later, '2026-10-20');
  equal([next.length, next[0].date], [3, '2026-10-15']);
  ok(next[0].interest > rupees(13000) && next[0].interest < rupees(13500), `interest ${next[0].interest / 100}`);
  ok(loanPosition(account, later, '2026-10-20').paidBack > rupees(6000), 'more paid back');
});

test('paying extra while a loan is being released: counted over the whole loan and what is left of its term', () => {
  const account = { id: 'hl', type: 'loan', label: 'Home Loan', loan: sbiLoan.parse(SBI_LOAN).meta.loan };
  const today = '2026-09-18';
  const asIs = payFasterPlan(account, 0, { today });
  // Owed now (₹20,02,000) plus the ₹29,92,000 still to be released.
  paise(asIs.balance, rupees(2002000 + 2992000));
  equal(asIs.monthsLeftInTerm, 340);
  // Once it is all out, the EMI clears the whole loan inside the term.
  ok(asIs.emi > rupees(16000) && asIs.months <= 340, `EMI ${asIs.emi / 100} over ${asIs.months} months`);
  const extra = payFasterPlan(account, rupees(5000), { today });
  ok(extra.interestSaved > rupees(5000) * 12, `saved ${extra.interestSaved / 100} over the loan`);
  ok(extra.monthsSaved > 12 && extra.fasterEndsOn < asIs.endsOn, `${extra.monthsSaved} months sooner`);
  // A month later there is a month less of the term left.
  equal(payFasterPlan(account, 0, { today: '2026-10-18' }).monthsLeftInTerm, 339);
});

test('paying more each month ends the loan sooner and saves interest', () => {
  const asIs = payFasterPlan(homeLoan, 0, { today: '2026-09-18' });
  const extra = payFasterPlan(homeLoan, rupees(5000), { today: '2026-09-18' });
  ok(asIs.months > extra.fasterMonths, 'ends sooner');
  ok(extra.interestSaved > 0, 'saves interest');
  // Nothing is claimed when the payment never covers the interest.
  equal(payFasterPlan({ ...homeLoan, loan: { ...homeLoan.loan, emi: rupees(5000) } }, 0), null);
});
test('PF: 12% of basic from you, 12% from your employer less ₹1,250 of pension', () => {
  const share = pfContribution(rupees(168800));
  equal([share.employee, share.eps, share.employerEpf], [rupees(20256), rupees(1250), rupees(19006)]);
  // On a small salary the pension share is 8.33% of the pay itself.
  equal(pfContribution(rupees(10000)).eps, rupees(833));
});

test('PF: months with no payslip yet keep the last known contribution, marked as assumed', () => {
  const account = { id: 'pf', type: 'pf', knownBalance: 0, knownBalanceDate: '2026-04-01', pf: { ratePct: 8.25 } };
  const april = [txn({ accountId: 'pf', date: '2026-04-30', amount: 39262, direction: 'credit', source: 'payslip' })];
  const pf = pfPosition(account, april, '2026-07-31');
  // April is real; May, June and July are assumed at the same amount.
  equal([pf.months, pf.assumedMonths], [1, 3]);
  paise(pf.contributed, rupees(39262 * 4));
  // Turned off, only the payslip counts.
  const strict = pfPosition({ ...account, pf: { ...account.pf, assumeMonthly: false } }, april, '2026-07-31');
  equal(strict.assumedMonths, 0);
  paise(strict.contributed, rupees(39262));
});

test('PF: interest waits for 31 March instead of being added to the balance', () => {
  const account = { id: 'pf', type: 'pf', knownBalance: rupees(100000), knownBalanceDate: '2026-04-01', pf: { ratePct: 8.25 } };
  const months = ['2026-04-30', '2026-05-31', '2026-06-30'].map((date) =>
    txn({ accountId: 'pf', date, amount: 39262, direction: 'credit', source: 'payslip' })
  );
  const pf = pfPosition(account, months, '2026-06-30');
  paise(pf.contributed, rupees(39262 * 3));
  // The balance reads exactly like the passbook: opening plus what went in.
  paise(pf.balance, rupees(100000) + pf.contributed);
  equal(pf.creditedInterest, 0);
  ok(pf.pendingInterest > 0 && pf.pendingInterest < rupees(3000), `pending ${pf.pendingInterest / 100}`);
  paise(pf.withInterest, pf.balance + pf.pendingInterest);
  equal(pf.nextCredit, '2027-03-31');
  ok(pf.in(10) > pf.balance, 'grows over ten years');
});

test('PF: a month earns nothing until the month after it arrives', () => {
  const account = { id: 'pf', type: 'pf', knownBalance: rupees(100000), knownBalanceDate: '2026-04-30', pf: { ratePct: 8.25, assumeMonthly: false } };
  const may = [txn({ accountId: 'pf', date: '2026-05-01', amount: 40000, direction: 'credit', source: 'epfo' })];
  // Through May: interest is on the ₹1,00,000 alone, May's money sits idle.
  const atMay = pfPosition(account, may, '2026-05-31');
  paise(atMay.pendingInterest, Math.round(rupees(100000) * (8.25 / 1200)));
  // Through June: now the bigger balance earns.
  const atJune = pfPosition(account, may, '2026-06-30');
  paise(atJune.pendingInterest, atMay.pendingInterest + Math.round(rupees(140000) * (8.25 / 1200)));
});

test('PF: on 31 March the interest for the year joins the balance', () => {
  const account = { id: 'pf', type: 'pf', knownBalance: rupees(100000), knownBalanceDate: '2026-04-30', pf: { ratePct: 8.25, assumeMonthly: false } };
  const pf = pfPosition(account, [], '2027-04-30');
  // Eleven months of interest on ₹1,00,000 (May to March), credited and gone
  // from pending, then April starts the next year's tally.
  ok(pf.creditedInterest > 0, 'credited');
  paise(pf.balance, rupees(100000) + pf.creditedInterest);
  paise(pf.pendingInterest, Math.round(pf.balance * (8.25 / 1200)));
  equal(pf.nextCredit, '2028-03-31');
});

test('PF: what it grows to with the same going in each month, and on interest alone', () => {
  const account = { id: 'pf', type: 'pf', knownBalance: rupees(100000), knownBalanceDate: '2026-04-30', pf: { ratePct: 8.25 } };
  const may = [txn({ accountId: 'pf', date: '2026-05-31', amount: 10000, direction: 'credit', source: 'payslip' })];
  const pf = pfPosition(account, may, '2026-05-31');
  const now = pf.balance + pf.pendingInterest;
  // Nothing more going in: a year of 8.25% interest, credited once.
  ok(Math.abs(pf.alone(1) - now * 1.0825) < rupees(10), `alone ${pf.alone(1) / 100}`);
  // ₹10,000 a month more: at least the twelve payments on top of that.
  ok(pf.in(1) > pf.alone(1) + rupees(120000), `with pay ${pf.in(1) / 100}`);
  ok(pf.alone(20) < pf.in(20), 'paying in always ends higher');
});

// --- EPFO passbook ----------------------------------------------------------

const PASSBOOK = `lnL; iklcqd / Member Passbook
LFkkiuk vkbZMh@uke | Establishment ID/Name MHBAN0040036000 / A COMPANY LIMITED
lnL; vkbZMh@uke | Member ID/Name MHBAN00400360000024326 / A Name
;w , u | UAN 102304074581
bZih,Q iklcqd [ foÙkh; o\"kZ - 2026-2027 ] / EPF Passbook [ Financial Year - 2026-2027 ]
OB Int. Updated upto 31/03/2026 14,469 14,469 0
Mar-2026 01-04-2026 CR Cont. for Due-Month 042026 1,68,800 0 20,256 20,256 0
Apr-2026 01-05-2026 CR Cont. for Due-Month 052026 1,68,800 0 20,256 20,256 0
Total Contributions for the year [ 2026 ] 40,512 40,512 0
Interest details N/A 0 0 0
Closing Balance as on 31/03/2027 55,-- 55,-- 0`;

test('EPFO passbook: opening balance, each month split, and the employer share as it really is', () => {
  ok(passbook.detect(PASSBOOK));
  const m = passbook.parse(PASSBOOK).meta;
  equal([m.financialYear, m.uan, m.memberId], ['2026-2027', '102304074581', 'MHBAN00400360000024326']);
  equal([m.opening.asOf, m.opening.employee, m.opening.employer], ['2026-03-31', rupees(14469), rupees(14469)]);
  equal(m.months.map((r) => [r.wageMonth, r.date, r.employee, r.employer, r.pension]), [
    ['2026-03', '2026-04-01', rupees(20256), rupees(20256), 0],
    ['2026-04', '2026-05-01', rupees(20256), rupees(20256), 0],
  ]);
  // Nothing goes to the pension scheme here, whatever the general rule says.
  equal(m.totals.pension, 0);
  equal(m.lastWages, rupees(168800));
});

test('PF: the passbook balance is the anchor, and only months after it are added', () => {
  const account = { id: 'pf', type: 'pf', knownBalance: rupees(28938), knownBalanceDate: '2026-03-31', pf: { ratePct: 8.25, assumeMonthly: false } };
  const months = ['2026-04-01', '2026-05-01'].map((date) => txn({ accountId: 'pf', date, amount: 40512, direction: 'credit', source: 'epfo' }));
  const pf = pfPosition(account, months, '2026-05-31');
  paise(pf.opening, rupees(28938));
  paise(pf.contributed, rupees(40512 * 2));
  // Exactly the passbook: nothing invented on top of it.
  paise(pf.balance, rupees(28938 + 40512 * 2));
  ok(pf.pendingInterest > 0, 'interest waiting for March');
});
// Made-up statements in the layouts other Indian banks use, read by the
// general reader (js/parsers/any-bank.js).
import * as anyBank from '../js/parsers/any-bank.js';

const AXIS_LIKE = `Axis Bank Ltd
Statement of Account No : 912010000001234 for the period 01-09-2026 to 30-09-2026
Tran Date Chq No Particulars Debit Credit Balance Init. Br
OPENING BALANCE 20,000.00
01-09-2026 UPI/P2M/600000000001/SWIGGY 450.00 19,550.00 2345
03-09-2026 NEFT/SALARY/MADE UP EMPLOYER LTD 50,000.00 69,550.00 2345
04-09-2026 ATM-CASH/MUMBAI 5,000.00 64,550.00 2345
TRANSACTION TOTAL 5,450.00 50,000.00
CLOSING BALANCE 64,550.00`;

const NEWEST_FIRST = `Kotak Mahindra Bank
Account No. XXXXXXXX5678
Date Narration Chq/Ref No Withdrawal (Dr) Deposit (Cr) Balance
12 Sep 2026 UPI/ZOMATO/ORDER 1,299.00(Dr) 45,000.00(Cr)
10 Sep 2026 IMPS/REFUND FROM SHOP 299.00(Cr) 46,299.00(Cr)
05 Sep 2026 BILL PAY ELECTRICITY 2,000.00(Dr) 46,000.00(Cr)
continues on the next line
Page 1 of 2`;

const COLUMNS = `IDFC FIRST Bank
Transaction Date Value Date Particulars Cheque No Debit Credit Balance
01/09/2026 01/09/2026 RENT TO LANDLORD 15,000.00 - 35,000.00
02/09/2026 02/09/2026 INTEREST CREDIT - 120.00 35,120.00`;

const CARD = `IndusInd Bank Credit Card Statement
Card Number 4xxx xxxx xxxx 4321
Statement Date 15/09/2026
Total Amount Due Rs. 3,650.00
Minimum Amount Due Rs. 200.00
Payment Due Date 05/10/2026
Date Transaction Details Amount
18/08/2026 AMAZON PAY INDIA 2,150.00
02/09/2026 PAYMENT RECEIVED - THANK YOU 10,000.00 Cr
09/09/2026 UBER INDIA TRIP 1,500.00`;

test('general reader: a bank with a branch code after the balance, oldest first', () => {
  const reader = anyBank.readerFor(AXIS_LIKE);
  equal([reader.issuerLabel, reader.accountType], ['Axis Bank', 'bank']);
  const { rows, meta } = reader.parse(AXIS_LIKE);
  equal(rows.map((r) => [r.date, r.amount, r.direction]), [
    ['2026-09-01', rupees(450), 'debit'],
    ['2026-09-03', rupees(50000), 'credit'],
    ['2026-09-04', rupees(5000), 'debit'],
  ]);
  equal(rows[0].description, 'UPI/P2M/600000000001/SWIGGY');
  equal([meta.accountLast4, meta.statedClosingBalance, meta.reconciled], ['1234', 64550, true]);
});

test('general reader: newest first with Dr and Cr beside the amounts', () => {
  const reader = anyBank.readerFor(NEWEST_FIRST);
  equal(reader.issuerLabel, 'Kotak Mahindra Bank');
  const { rows, meta } = reader.parse(NEWEST_FIRST);
  equal(rows.map((r) => [r.date, r.amount, r.direction]), [
    ['2026-09-12', rupees(1299), 'debit'],
    ['2026-09-10', rupees(299), 'credit'],
    ['2026-09-05', rupees(2000), 'debit'],
  ]);
  // The wrapped line is part of the description; the page number is not.
  equal(rows[2].description, 'BILL PAY ELECTRICITY continues on the next line');
  equal([meta.accountLast4, meta.statedClosingBalance, meta.reconciled], ['5678', 45000, true]);
});

test('general reader: separate withdrawal and deposit columns with a dash for the empty one', () => {
  const { rows, meta } = anyBank.readerFor(COLUMNS).parse(COLUMNS);
  equal(rows.map((r) => [r.date, r.description, r.amount, r.direction]), [
    ['2026-09-01', 'RENT TO LANDLORD', rupees(15000), 'debit'],
    ['2026-09-02', 'INTEREST CREDIT', rupees(120), 'credit'],
  ]);
  equal(meta.reconciled, true);
});

test('general reader: a card statement, its bill and due date', () => {
  const reader = anyBank.readerFor(CARD);
  equal([reader.issuerLabel, reader.accountType], ['IndusInd Bank', 'card']);
  const { rows, meta } = reader.parse(CARD);
  equal(rows.map((r) => [r.date, r.amount, r.direction]), [
    ['2026-08-18', rupees(2150), 'debit'],
    ['2026-09-02', rupees(10000), 'credit'],
    ['2026-09-09', rupees(1500), 'debit'],
  ]);
  equal([meta.accountLast4, meta.totalAmountDue, meta.minimumDue, meta.paymentDueDate, meta.periodEnd], ['4321', rupees(3650), rupees(200), '2026-10-05', '2026-09-15']);
});

test('general reader: text with no dated amounts is not taken for a statement', () => {
  equal(anyBank.readerFor('Some letter\nDear customer, 12 Sep 2026\nThank you'), null);
});

import { taxDates } from '../js/calendar.js';
import { goalProgress, monthsLeft } from '../js/goals.js';

test('tax dates: advance tax and the return for business income, GST only when registered', () => {
  const plain = taxDates('2026-09-20', { business: false });
  equal(plain, []);
  const owner = taxDates('2026-09-20', { business: true });
  equal(owner[0], { label: 'Advance tax', date: '2026-12-15', note: "75% of the year's tax" });
  ok(!owner.some((d) => d.label.startsWith('GST')), 'no GST dates until registered');
  ok(owner.every((d) => d.date >= '2026-09-20'), 'nothing already past');
  const gst = taxDates('2026-09-20', { business: true, gst: true });
  // Today's own date still counts as due; next month's follow.
  equal(gst.slice(0, 3).map((d) => [d.label, d.date]), [['GSTR-3B', '2026-09-20'], ['GSTR-1', '2026-10-11'], ['GSTR-3B', '2026-10-20']]);
});

test('a goal says what a month gets you there, and counts what is already saved', () => {
  const goal = { target: rupees(1000000), by: '2030-03' };
  const p = goalProgress(goal, rupees(400000), '2026-09-20');
  equal(monthsLeft('2030-03', '2026-09-20'), 42);
  paise(p.left, rupees(600000));
  paise(p.monthly, Math.ceil(rupees(600000) / 42));
  // Already there: nothing more a month.
  equal(goalProgress(goal, rupees(1200000), '2026-09-20').done, true);
  // Due this month: the rest is needed now, not divided by zero.
  paise(goalProgress({ target: rupees(50000), by: '2026-09' }, 0, '2026-09-20').monthly, rupees(50000));
});

test("a loan's own payment history never moves the balance its statement states", () => {
  const account = {
    id: 'loan1',
    type: 'loan',
    loan: { emi: rupees(23000), ratePct: 8.5, outstanding: rupees(3100000), outstandingAsOf: '2026-08-31', startMonth: '2020-04' },
  };
  // The EMIs the statement itself listed, saved so they show in History.
  const history = ['2026-06-05', '2026-07-05', '2026-08-05'].map((date) =>
    txn({ accountId: 'loan1', date, amount: 23000, direction: 'credit', isTransfer: true })
  );
  paise(loanPosition(account, history, '2026-09-24').outstanding, rupees(3100000));
  // One paid after the statement still counts.
  const after = [...history, txn({ accountId: 'loan1', date: '2026-09-05', amount: 23000, direction: 'credit', isTransfer: true })];
  const moved = loanPosition(account, after, '2026-09-24').outstanding;
  ok(moved < rupees(3100000) && moved > rupees(3050000), `one EMI off the balance, got ${moved}`);
});
