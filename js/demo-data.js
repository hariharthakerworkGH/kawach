/* The made-up household the demo shows (5.40). Everyone in it, every shop and every figure is invented:
 * no name, number or place is anyone's. It is built from today's date, so there is always a month in
 * progress, with the dial part-way round and the charts drawn, whenever it is opened. The same day gives
 * the same household (the random choices are seeded by the month), which is what the tests hold it to.
 *
 * Its shape is one Kawach is meant for: a salary of 92,000 a month, a savings bank, two cards, a fixed
 * deposit and a car loan; rent, bills and an EMI that must be paid; groceries and fuel kept aside;
 * three months of ordinary spending, a card refund that undid a purchase, a work cost still owed back
 * and a few payments waiting for a category. */
import { isoLocal } from './frequency.js';

const rupees = (n) => Math.round(n * 100);

// A small seeded generator (mulberry32): the same month always draws the same household.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_ACCOUNTS = { bank: 'demo-bank', card1: 'demo-card1', card2: 'demo-card2', fd: 'demo-fd', loan: 'demo-loan' };
const LAST4 = { bank: '1234', card1: '5678', card2: '9012', fd: '3456', loan: '7890' };

export function buildDemo(today = new Date()) {
  const rnd = seeded(today.getFullYear() * 12 + today.getMonth() + 7);
  const between = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) / 10) * 10;
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const todayIso = isoLocal(today);
  const dateOf = (back, dom) => {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    first.setDate(Math.min(dom, last));
    return isoLocal(first);
  };
  const daysAgo = (n) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
    return isoLocal(d);
  };

  const A = DEMO_ACCOUNTS;
  const accounts = [
    { id: A.bank, label: 'City Bank Savings', type: 'bank', issuer: 'City Bank', last4: LAST4.bank },
    { id: A.card1, label: 'City Bank Blue Card', type: 'card', issuer: 'City Bank', last4: LAST4.card1 },
    { id: A.card2, label: 'Metro Rewards Card', type: 'card', issuer: 'Metro Bank', last4: LAST4.card2 },
    { id: A.fd, label: 'Fixed deposit', type: 'savings', issuer: 'City Bank', last4: LAST4.fd, savingsKind: 'Fixed deposit', knownBalance: rupees(300000), knownBalanceDate: todayIso },
    {
      id: A.loan,
      label: 'Car loan',
      type: 'loan',
      issuer: 'City Bank',
      last4: LAST4.loan,
      loan: { principal: rupees(650000), ratePct: 9.2, emi: rupees(14500), day: 5, paidFromId: A.bank, totalEmis: 60, startMonth: isoLocal(new Date(today.getFullYear(), today.getMonth() - 14, 1)).slice(0, 7) },
    },
  ];

  const must = (id, label, amount, dayOfMonth) => ({ id, label, amount: rupees(amount), frequency: 'monthly', dayOfMonth, accountId: null, categoryId: null, active: true, source: 'fixed' });
  const aside = (id, label, amount, dayOfMonth) => ({ ...must(id, label, amount, dayOfMonth), spread: true });
  const recurring = [
    must('demo-rent', 'Rent', 22000, 5),
    must('demo-power', 'Electricity', 1800, 12),
    must('demo-net', 'Internet', 999, 10),
    must('demo-phone', 'Phone', 599, 14),
    must('demo-sip', 'Monthly savings', 5000, 7),
    aside('demo-groc', 'Groceries', 9000, 1),
    aside('demo-fuel', 'Fuel', 3000, 1),
  ];

  const transactions = [];
  let n = 0;
  const add = (f) => {
    if (f.date > todayIso) return;
    n += 1;
    transactions.push({
      id: `demo-t${String(n).padStart(3, '0')}`,
      categoryId: null,
      source: 'manual',
      importBatchId: null,
      isTransfer: false,
      notes: null,
      direction: 'debit',
      createdAt: new Date(`${f.date}T12:00:00`).getTime(),
      ...f,
      merchant: f.merchant || f.rawDescription,
      amount: rupees(f.amount),
    });
  };

  const cardSpend = [0, 0, 0];
  const onCard = (back, f) => {
    cardSpend[back] += f.amount;
    add(f);
  };
  const jitter = (dom) => Math.max(1, Math.min(28, dom + Math.floor(rnd() * 3) - 1));

  for (const back of [2, 1, 0]) {
    const d = (dom) => dateOf(back, dom);
    // The month in progress is a calmer one: a demo that opens on "careful" would tell the wrong story first.
    const amt = (lo, hi) => Math.round((between(lo, hi) * (back === 0 ? 0.65 : 1)) / 10) * 10;
    add({ accountId: A.bank, date: d(1), rawDescription: 'NEFT SALARY NORTHWIND PVT LTD', amount: 92000, direction: 'credit', categoryId: 'cat-income' });
    add({ accountId: A.bank, date: d(5), rawDescription: 'UPI RENT SUNRISE APARTMENTS', amount: 22000, categoryId: 'cat-rent', commitmentId: 'demo-rent' });
    add({ accountId: A.bank, date: d(5), rawDescription: 'CAR LOAN EMI', amount: 14500, categoryId: 'cat-bills', paysLoanId: A.loan });
    add({ accountId: A.bank, date: d(7), rawDescription: 'SIP MUTUAL FUND', amount: 5000, commitmentId: 'demo-sip' });
    add({ accountId: A.bank, date: d(10), rawDescription: 'BROADBAND BILL', amount: 999, categoryId: 'cat-bills', commitmentId: 'demo-net' });
    add({ accountId: A.bank, date: d(12), rawDescription: 'ELECTRICITY BILL', amount: between(1500, 2100), categoryId: 'cat-bills', commitmentId: 'demo-power' });
    add({ accountId: A.bank, date: d(14), rawDescription: 'MOBILE RECHARGE', amount: 599, categoryId: 'cat-bills', commitmentId: 'demo-phone' });
    add({ accountId: A.bank, date: d(10), rawDescription: 'ATM CASH WITHDRAWAL', amount: 3000 });
    // Groceries and fuel come out of what was kept aside for them.
    for (const dom of [3, 8, 11, 16, 20, 24, 27]) {
      add({ accountId: A.bank, date: d(jitter(dom)), rawDescription: pick(['UPI FRESH BASKET', 'UPI DAILY NEEDS STORE']), amount: between(450, 1900), categoryId: 'cat-groceries', commitmentId: 'demo-groc' });
    }
    for (const dom of [9, 23]) {
      onCard(back, { accountId: A.card1, date: d(jitter(dom)), rawDescription: 'PETROL PUMP FUEL', amount: between(1100, 1500), categoryId: 'cat-transport', commitmentId: 'demo-fuel' });
    }
    // Everything else: eating out, cabs, shopping, a film, the chemist.
    for (let i = 0; i < 5; i += 1) {
      onCard(back, { accountId: A.card1, date: d(2 + Math.floor(rnd() * 26)), rawDescription: pick(['CAFE BEANS', 'SPICE GARDEN RESTAURANT', 'PIZZA CORNER', 'TEA POINT', 'BAKERY HOUSE']), amount: amt(120, 1400), categoryId: 'cat-food' });
    }
    for (let i = 0; i < 4; i += 1) {
      onCard(back, { accountId: A.card1, date: d(2 + Math.floor(rnd() * 26)), rawDescription: 'CAB RIDE', amount: amt(150, 480), categoryId: 'cat-transport' });
    }
    for (let i = 0; i < 2; i += 1) {
      onCard(back, { accountId: A.card2, date: d(3 + Math.floor(rnd() * 24)), rawDescription: 'ONLINE STORE ORDER', amount: amt(700, 2600), categoryId: 'cat-shopping' });
    }
    onCard(back, { accountId: A.card2, date: d(20), rawDescription: 'STREAMING SUBSCRIPTION', amount: 499, categoryId: 'cat-entertainment' });
    onCard(back, { accountId: A.card1, date: d(2 + Math.floor(rnd() * 26)), rawDescription: 'MOVIE TICKETS', amount: amt(600, 900), categoryId: 'cat-entertainment' });
    add({ accountId: A.bank, date: d(2 + Math.floor(rnd() * 26)), rawDescription: 'PHARMACY', amount: amt(250, 950), categoryId: 'cat-health' });
  }

  // The card bills of the two months before this one, paid from the bank.
  for (const back of [2, 1]) {
    add({ accountId: A.bank, date: dateOf(back - 1, 8), rawDescription: 'CREDIT CARD BILL PAYMENT', amount: Math.round(cardSpend[back]), isTransfer: true, categoryId: 'cat-transfer' });
  }
  // Money moved to the fixed deposit: not spending.
  add({ accountId: A.bank, date: dateOf(1, 15), rawDescription: 'TRANSFER TO FIXED DEPOSIT', amount: 10000, isTransfer: true, categoryId: 'cat-transfer' });

  // A card refund that undid a purchase: both are struck through in History.
  add({ accountId: A.card1, date: daysAgo(9), rawDescription: 'ONLINE ORDER GADGET STORE', amount: 1299, categoryId: 'cat-shopping' });
  add({ accountId: A.card1, date: daysAgo(6), rawDescription: 'REFUND GADGET STORE', amount: 1299, direction: 'credit', categoryId: 'cat-shopping' });
  // A work cost still owed back by the employer, and an older one that has been.
  add({ accountId: A.card2, date: daysAgo(12), rawDescription: 'HOTEL BUSINESS TRIP', amount: 6400, isReimbursable: true });
  add({ accountId: A.card2, date: daysAgo(52), rawDescription: 'TAXI AIRPORT TRANSFER', amount: 1100, isReimbursable: true });
  add({ accountId: A.bank, date: daysAgo(36), rawDescription: 'NEFT EXPENSE REIMBURSEMENT NORTHWIND', amount: 1100, direction: 'credit', isSettlement: true });
  // A bigger spend than usual, and a few payments waiting for a category.
  add({ accountId: A.card2, date: daysAgo(3), rawDescription: 'ELECTRONICS MART', amount: 2400, categoryId: 'cat-shopping' });
  add({ accountId: A.bank, date: daysAgo(2), rawDescription: 'UPI JAYA STORES', amount: 240 });
  add({ accountId: A.card1, date: daysAgo(1), rawDescription: 'CORNER KIOSK', amount: 180 });
  add({ accountId: A.bank, date: daysAgo(4), rawDescription: 'UPI RAJAN AND SONS', amount: 650 });

  // The bank starts from a balance on the day before its first payment, so it adds up from there.
  const first = transactions.reduce((m, t) => (t.date < m ? t.date : m), todayIso);
  const [fy, fm, fd] = first.split('-').map(Number);
  accounts[0].knownBalance = rupees(350000);
  accounts[0].knownBalanceDate = isoLocal(new Date(fy, fm - 1, fd - 1));

  const goalMonth = isoLocal(new Date(today.getFullYear(), today.getMonth() + 11, 1)).slice(0, 7);
  const settings = {
    monthlyIncome: rupees(92000),
    salaryDay: 1,
    keepInBank: rupees(3000),
    incomeType: 'salary',
    goals: [{ id: 'demo-goal', name: 'Family trip', target: rupees(500000), by: goalMonth, accountIds: [A.fd] }],
  };
  return { accounts, recurring, transactions, settings };
}

// Writes it with whatever put and setSetting it is given (the app's own, or the tests').
export async function writeDemo({ put, setSetting }, today = new Date()) {
  const data = buildDemo(today);
  for (const a of data.accounts) await put('accounts', a);
  for (const r of data.recurring) await put('recurring', r);
  for (const t of data.transactions) await put('transactions', t);
  for (const [k, v] of Object.entries(data.settings)) await setSetting(k, v);
  return data;
}

/* Made-up bank messages the inbox can read, in the order they are offered; each uses the demo's own
 * account endings so they land on the right account. Dated today. */
let nextMessage = 0;
export function exampleMessages(today = new Date()) {
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yy = String(today.getFullYear()).slice(2);
  const yyyy = today.getFullYear();
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][today.getMonth()];
  return [
    `Rs.349.00 spent on your City Bank Credit Card XX${LAST4.card1} at CAFE BEANS on ${dd}-${mon}-${yyyy}. Avl limit Rs.1,05,000.`,
    `Debit INR 860.00 A/c no. XX${LAST4.bank} ${dd}-${mm}-${yy} 13:05:10 UPI/P2M/425612345678/FRESH BASKET SMS BLOCKUPI Cust ID to 18001035577 -City Bank`,
    `Dear UPI user A/C X${LAST4.bank} debited by 250.0 on date ${dd}${mon}${yy} trf to TEA POINT Refno 623456789012. If not u? call 1800111109. -City Bank`,
  ];
}
export function nextExampleMessage(today = new Date()) {
  const list = exampleMessages(today);
  const text = list[nextMessage % list.length];
  nextMessage += 1;
  return text;
}
