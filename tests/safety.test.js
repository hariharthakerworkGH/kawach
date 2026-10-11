// The safety net (5.43.1): a damaged record cannot blank the app, a restore is all or nothing and can be undone,
// sync keeps what two devices each added, and the readers are not handed absurd text. Made-up data only.
import { test, equal, ok } from './harness.js';
import { seedBasics, txn, rupees, day, resetDB } from './fixtures.js';
import { problemWith, tidyRecord, screenRecords, validDate, BadRecordError, MAX_PAISE } from '../js/records.js';
import { put, getAll, getAllRaw, damagedRecords, removeDamaged, getSetting, setSetting, forgetCachedReads, replaceAll } from '../js/db.js';
import { computeFreeToSpend } from '../js/free-to-spend.js';
import { mergeSnapshots, mergeLists } from '../js/sync.js';
import { restoreBackup, screenBackup, undoInfo, undoRestore } from '../js/backup.js';
import { backupsToDelete } from '../js/drive.js';
import { cleanStatementText, sizeProblem, MAX_PDF_BYTES } from '../js/statement-text.js';

// Writes straight to the test database, the way a restore from another version or an old sync could.
async function rawPut(store, record) {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open(globalThis.EXPENSE_TRACKER_DB_NAME);
    r.onsuccess = () => res(r.result);
    r.onerror = rej;
  });
  await new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(record);
    tx.oncomplete = res;
    tx.onerror = rej;
  });
  db.close();
  forgetCachedReads();
}

const good = (id, over = {}) => ({ id, accountId: 'bank', date: '2026-09-05', rawDescription: 'CAFE', merchant: 'CAFE', amount: rupees(100), direction: 'debit', ...over });

/* --- what a record has to look like --------------------------------------------------------------- */
test('safety: a real day, and nothing else, is a date', () => {
  ok(validDate('2026-09-30') && validDate('2028-02-29'));
  ok(!validDate('2026-02-30') && !validDate('31/10/2026') && !validDate('') && !validDate(null) && !validDate(undefined) && !validDate('2026-9-5'));
});

test('safety: a payment needs a day, a number for the amount and a direction; a missing description is tidied', () => {
  equal(problemWith('transactions', good('a')), null);
  ok(problemWith('transactions', good('a', { date: undefined })));
  ok(problemWith('transactions', good('a', { date: null })));
  ok(problemWith('transactions', good('a', { amount: '12.5' })));
  ok(problemWith('transactions', good('a', { amount: undefined })));
  ok(problemWith('transactions', good('a', { amount: NaN })));
  ok(problemWith('transactions', good('a', { amount: -5 })), 'a negative amount would add room');
  ok(problemWith('transactions', good('a', { amount: MAX_PAISE * 10 })), 'a thousand crore and more is a misread');
  ok(problemWith('transactions', good('a', { direction: undefined })));
  ok(problemWith('transactions', { ...good('a'), id: '' }));
  const r = { id: 'a', date: '2026-09-05', amount: 100, direction: 'debit' };
  tidyRecord('transactions', r);
  equal([r.rawDescription, r.merchant], ['', '']);
  equal(problemWith('transactions', r), null);
  equal(problemWith('recurring', { id: 'r', amount: null }), null);
  ok(problemWith('recurring', { id: 'r', amount: 'abc' }));
});

test('safety: screenRecords keeps the usable and names the rest', () => {
  const { good: ok1, bad } = screenRecords('transactions', [good('a'), good('b', { date: null }), good('c')]);
  equal([ok1.length, bad.length, bad[0].id], [2, 1, 'b']);
});

/* --- one bad record no longer blanks the app ---------------------------------------------------- */
test('safety: put refuses a record that would break the screens, and stores nothing', async () => {
  await resetDB();
  let err = null;
  try {
    await put('transactions', good('bad', { date: null }));
  } catch (e) {
    err = e;
  }
  ok(err instanceof BadRecordError, 'refused with a plain error');
  equal((await getAllRaw('transactions')).length, 0);
});

test('safety: a damaged record written behind the app is left out, counted, and Summary still works', async () => {
  await seedBasics();
  await rawPut('transactions', { id: 'orphan', accountId: 'bank', rawDescription: 'X', amount: 100, direction: 'debit' }); // no date
  await rawPut('transactions', { id: 'nulls', accountId: null, date: null, rawDescription: null, merchant: null, amount: null, direction: null });
  await put('transactions', txn({ accountId: 'bank', date: '2026-09-05', amount: 450, rawDescription: 'UPI-CAFE-777777777777' }));
  const shown = await getAll('transactions');
  equal(shown.length, 1, 'only the whole one is used');
  equal(damagedRecords().map((d) => d.id).sort(), ['nulls', 'orphan']);
  equal((await getAllRaw('transactions')).length, 3, 'nothing was deleted by looking');
  const f = await computeFreeToSpend(day('2026-09-16'));
  ok(f && typeof f.today === 'string', 'the calculation still runs');
  equal(await removeDamaged(), 2);
  equal((await getAllRaw('transactions')).length, 1);
  equal(damagedRecords().length, 0);
});

test('safety: a setting stored as null, or as the wrong kind, reads as the fallback', async () => {
  await resetDB();
  await setSetting('people', null);
  equal(await getSetting('people', []), []);
  await setSetting('goals', { oops: 1 });
  equal(await getSetting('goals', []), []);
  await setSetting('keepInBank', 0);
  equal(await getSetting('keepInBank', 99), 0, 'zero is a value, not nothing');
});

/* --- restore: all or nothing, and a way back --------------------------------------------------- */
test('safety: replaceAll that fails half way changes nothing', async () => {
  await resetDB();
  await put('transactions', good('keep1'));
  await put('transactions', good('keep2'));
  let failed = false;
  try {
    await replaceAll({ transactions: [good('new1'), { ...good('new2'), poison: () => 1 }] }, ['transactions']);
  } catch {
    failed = true;
  }
  ok(failed, 'the damaged copy stopped it');
  equal((await getAllRaw('transactions')).map((r) => r.id).sort(), ['keep1', 'keep2'], 'what was there is still there');
});

test('safety: a backup with a damaged record restores the rest, says what it skipped, and can be undone', async () => {
  await resetDB();
  await put('transactions', good('mine1'));
  await put('transactions', good('mine2'));
  await put('accounts', { id: 'bank', label: 'Bank', type: 'bank' });
  const backup = { accounts: [{ id: 'b2', label: 'Other', type: 'bank' }], transactions: [good('n1'), good('n2', { date: null }), good('n3')], categories: [], merchantRules: [], recurring: [], importBatches: [], settings: [] };
  equal(screenBackup(backup).skipped.length, 1);
  const { skipped } = await restoreBackup(backup);
  equal(skipped.length, 1);
  equal((await getAllRaw('transactions')).map((r) => r.id).sort(), ['n1', 'n3']);
  equal((await getAllRaw('accounts')).map((r) => r.id), ['b2']);
  const info = await undoInfo();
  ok(info && info.counts.transactions === 2, 'a copy of what was there is kept');
  await undoRestore();
  equal((await getAllRaw('transactions')).map((r) => r.id).sort(), ['mine1', 'mine2']);
  equal((await getAllRaw('accounts')).map((r) => r.id), ['bank']);
  equal(await undoInfo(), null, 'used once');
});

test('safety: the copy kept before a restore goes after two weeks', async () => {
  await resetDB();
  await put('transactions', good('a'));
  await restoreBackup({ accounts: [], transactions: [good('b')], categories: [], merchantRules: [], recurring: [], importBatches: [], settings: [] });
  ok(await undoInfo());
  equal(await undoInfo(Date.now() + 15 * 86400000), null);
});

/* --- Drive keeps one backup a month, not only the newest few ------------------------------------ */
test('safety: Drive keeps the newest five and the newest of each of the last six months', () => {
  const f = (id, d) => ({ id, name: `kawach-backup-${d}-10-00-00.json`, modifiedTime: `${d}T10:00:00Z` });
  const files = [f('a1', '2026-10-11'), f('a2', '2026-10-10'), f('a3', '2026-10-09'), f('a4', '2026-10-08'), f('a5', '2026-10-07'), f('a6', '2026-10-06'), f('s1', '2026-09-28'), f('s2', '2026-09-14'), f('au', '2026-08-30'), f('ju', '2026-07-30'), f('jn', '2026-06-30'), f('my', '2026-05-30'), f('ap', '2026-04-30')];
  const gone = backupsToDelete(files).map((x) => x.id);
  equal(gone, ['a6', 's2', 'ap'], 'one older October copy, the second September copy and the seventh month go; a month with only one copy keeps it');
  equal(backupsToDelete(files.slice(0, 5)), [], 'few backups: nothing goes');
});

test('sync: a copy that only carries a newer stamp is taken but not counted as an update', () => {
  const t = (stamp, amount = 500) => ({ id: 't1', date: '2026-10-01', amount, direction: 'debit', accountId: 'a', updatedAt: stamp });
  const quiet = mergeSnapshots(snap([], [t(100)]), snap([], [t(900)]), { now: 1000 });
  equal([quiet.stats.updated, quiet.data.transactions[0].updatedAt], [0, 900], 'same payment, newer stamp: kept, not shown as news');
  const real = mergeSnapshots(snap([], [t(100)]), snap([], [t(900, 700)]), { now: 1000 });
  equal([real.stats.updated, real.data.transactions[0].amount], [1, 700], 'a changed amount is a real update');
});

/* --- sync keeps what both devices added ---------------------------------------------------------- */
const snap = (settings = [], transactions = [], deletions = []) => ({ data: { accounts: [], transactions, categories: [], merchantRules: [], recurring: [], importBatches: [], settings }, deletions });
const people = (list, at) => ({ id: 'people', value: list, updatedAt: at });

test('safety sync: two people added on two devices are both kept', () => {
  const m = mergeSnapshots(snap([people([{ id: 'p1', name: 'Meera' }], 100)]), snap([people([{ id: 'p2', name: 'Ravi' }], 200)]), { now: 1000 });
  equal(m.data.settings[0].value.map((p) => p.name).sort(), ['Meera', 'Ravi']);
  ok(m.data.settings[0].updatedAt > 200, 'the merged list is newer than both, so both devices take it');
});

test('safety sync: someone removed on one device stays removed, someone added on the other stays', () => {
  const base = { people: [{ id: 'p1', name: 'Meera' }, { id: 'p2', name: 'Ravi' }] };
  // this device removed Meera and added Asha; the other device is unchanged
  const mine = snap([people([{ id: 'p2', name: 'Ravi' }, { id: 'p3', name: 'Asha' }], 300)]);
  const theirs = snap([people([{ id: 'p1', name: 'Meera' }, { id: 'p2', name: 'Ravi' }], 200)]);
  equal(mergeSnapshots(mine, theirs, { base, now: 1000 }).data.settings[0].value.map((p) => p.name).sort(), ['Asha', 'Ravi']);
  // and the other way round: the other device removed Ravi
  const theirs2 = snap([people([{ id: 'p1', name: 'Meera' }], 400)]);
  equal(mergeSnapshots(mine, theirs2, { base, now: 1000 }).data.settings[0].value.map((p) => p.name).sort(), ['Asha']);
});

test('safety sync: an item on both devices takes the newer copy', () => {
  equal(mergeLists([], [{ id: 'g', name: 'old' }], [{ id: 'g', name: 'new' }], false), [{ id: 'g', name: 'new' }]);
  equal(mergeLists([], [{ id: 'g', name: 'mine' }], [{ id: 'g', name: 'theirs' }], true), [{ id: 'g', name: 'mine' }]);
  equal(mergeLists(null, ['a'], ['b'], true).sort(), ['a', 'b'], 'plain text lists join');
});

test('safety sync: the first sync (nothing agreed yet) never removes anything', () => {
  const m = mergeSnapshots(snap([people([{ id: 'p1', name: 'Meera' }], 100)]), snap([people([], 200)]), { now: 1000 });
  equal(m.data.settings[0].value.map((p) => p.name), ['Meera']);
});

test('safety sync: both devices pick the same record when stamps tie, and a newer edit still wins', () => {
  const a = snap([], [{ ...good('t'), amount: 100, updatedAt: 500 }]);
  const b = snap([], [{ ...good('t'), amount: 200, updatedAt: 500 }]);
  const ab = mergeSnapshots(a, b, { now: 1000 }).data.transactions[0].amount;
  const ba = mergeSnapshots(b, a, { now: 1000 }).data.transactions[0].amount;
  equal(ab, ba, 'the same answer on both devices');
  const newer = snap([], [{ ...good('t'), amount: 300, updatedAt: 600 }]);
  equal(mergeSnapshots(a, newer, { now: 1000 }).data.transactions[0].amount, 300);
});

test('safety sync: a record stamped a day ahead (a fast clock) is taken in as now, so later edits beat it', () => {
  const NOW = 1_700_000_000_000;
  const fast = snap([], [{ ...good('t'), amount: 100, updatedAt: NOW + 86_400_000 }]);
  const m = mergeSnapshots(snap(), fast, { now: NOW });
  equal(m.data.transactions[0].updatedAt, NOW, 'brought back to this phone\'s now');
  const later = snap([], [{ ...good('t'), amount: 999, updatedAt: NOW + 60_000 }]);
  equal(mergeSnapshots(later, m, { now: NOW + 120_000 }).data.transactions[0].amount, 999, 'an edit made a minute later wins');
});

test('safety sync: a delete still beats an older edit and loses to a newer one', () => {
  const tomb = { id: 'transactions:t', store: 'transactions', recordId: 't', deletedAt: 500 };
  equal(mergeSnapshots(snap([], [{ ...good('t'), updatedAt: 400 }]), snap([], [], [tomb]), { now: 1000 }).data.transactions.length, 0);
  equal(mergeSnapshots(snap([], [{ ...good('t'), updatedAt: 600 }]), snap([], [], [tomb]), { now: 1000 }).data.transactions.length, 1);
});

/* --- what the readers are given -------------------------------------------------------------------- */
test('safety: long lines and long runs of digits are cut down before a reader sees them', () => {
  const long = 'a1,'.repeat(40000);
  ok(cleanStatementText(long).length <= 1200);
  equal(cleanStatementText('9'.repeat(200000)).length, 40);
  equal(cleanStatementText('01/10/2026 SHOP 1,00,000.00 Dr\n02/10/2026 X 5.00 Cr'), '01/10/2026 SHOP 1,00,000.00 Dr\n02/10/2026 X 5.00 Cr', 'a real statement is untouched');
  equal(cleanStatementText('100,200,300,400,500,600,700,800,900,1000,1100,1200,1300'), '100,200,300,400,500,600,700,800,900,1000,1100,1200,1300', 'a spreadsheet row of many numbers is untouched');
});

test('safety: a file that is too big is refused with a sentence', () => {
  equal(sizeProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 }), null);
  ok(/MB/.test(sizeProblem({ name: 'a.pdf', type: 'application/pdf', size: MAX_PDF_BYTES + 1 })));
  ok(sizeProblem({ name: 'a.csv', type: 'text/csv', size: 16 * 1024 * 1024 }));
});

test('safety: the slow readers now finish quickly on the text that used to hold them for a minute', async () => {
  const slow = ['sbi-loan', 'hdfc-bank-savings-netbanking', 'sbi-savings'];
  const texts = ['9'.repeat(200000), 'a1,'.repeat(40000) + '!', Array.from({ length: 20000 }, () => '01/02/2026 ').join('')];
  const t0 = performance.now();
  for (const name of slow) {
    const m = await import(`../js/parsers/${name}.js`);
    for (const t of texts) {
      const clean = cleanStatementText(t);
      m.detect(clean);
      m.parse(clean);
    }
  }
  const ms = performance.now() - t0;
  ok(ms < 3000, `took ${Math.round(ms)} ms`);
});

/* --- lighter and faster (5.43.3) ------------------------------------------------------------------ */
import { encryptPayload, decryptPayload } from '../js/backup.js';
import { DIRTY_KEY } from '../js/db.js';
import { syncNow, getSyncPassphrase } from '../js/sync.js';
import { fakeDrive, googleSyncOn, otherDevice } from './scenarios.test.js';
import { putAll } from './fixtures.js';

test('lighter: a backup is squeezed before it is locked, opens again, and an older plain one still opens', async () => {
  const rows = Array.from({ length: 3000 }, (_, i) => ({ id: 't' + i, accountId: 'bank', date: '2026-09-05', rawDescription: 'GROCERY STORE ' + (i % 40), merchant: 'GROCERY STORE', amount: 100000 + i, direction: 'debit' }));
  const payload = { transactions: rows };
  const squeezed = JSON.parse(await encryptPayload(payload, 'phrase-123456'));
  const whole = JSON.parse(await encryptPayload(payload, 'phrase-123456', { compress: false }));
  equal([squeezed.compression, squeezed.formatVersion, whole.compression, whole.formatVersion], ['gzip', 2, undefined, 1]);
  ok(squeezed.data.length < whole.data.length * 0.4, `squeezed ${squeezed.data.length} against ${whole.data.length}`);
  equal((await decryptPayload(JSON.stringify(squeezed), 'phrase-123456')).transactions.length, 3000);
  equal((await decryptPayload(JSON.stringify(whole), 'phrase-123456')).transactions.length, 3000, 'a backup made before this version');
});

test('lighter: sync sends only when this phone has something new, and what it brings in is not sent back', async () => {
  await seedBasics();
  localStorage.removeItem(DIRTY_KEY);
  const drive = fakeDrive();
  try {
    await googleSyncOn('shield-phrase-1');
    const pass = await getSyncPassphrase();
    await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-10', amount: 450, rawDescription: 'CAFE', updatedAt: 1 })]);
    ok(localStorage.getItem(DIRTY_KEY), 'a change on this phone is marked');
    await syncNow(pass);
    const first = drive.syncFile().text;
    equal(localStorage.getItem(DIRTY_KEY), null, 'sent, so no longer waiting');
    await syncNow(pass);
    equal(drive.syncFile().text, first, 'nothing new on this phone: nothing was uploaded');
    // the other device adds a payment; this phone takes it in and does not send it back
    drive.syncFile().text = await otherDevice([txn({ accountId: 'bank', date: '2026-09-12', amount: 900, rawDescription: 'FROM LAPTOP', updatedAt: 9 })], 'shield-phrase-1');
    const before = drive.syncFile().text;
    await syncNow(pass);
    ok((await getAll('transactions')).some((t) => t.rawDescription === 'FROM LAPTOP'));
    equal(localStorage.getItem(DIRTY_KEY), null, 'what arrived is not this phone\'s own change');
    equal(drive.syncFile().text, before, 'and it was not sent back');
    // a change here makes the next sync send
    await putAll('transactions', [txn({ accountId: 'bank', date: '2026-09-13', amount: 100, rawDescription: 'NEW HERE', updatedAt: 20 })]);
    await syncNow(pass);
    ok((await decryptPayload(drive.syncFile().text, 'shield-phrase-1')).data.transactions.some((t) => t.rawDescription === 'NEW HERE'));
  } finally {
    drive.done();
  }
});

/* --- speed that must not change an answer (5.43.3) ------------------------------------------------- */
import { detectAnomalies } from '../js/anomalies.js';
import { significantTokens } from '../js/merchant-rules.js';

test('speed: the unusual-spend check gives the same answers as the plain, slow way of working it out', async () => {
  await seedBasics();
  let seed = 99;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const shops = ['SWIGGY ORDER', 'AMAZON PAY INDIA', 'FUEL PUMP MUMBAI', 'GROCERY MART', 'PHARMACY HEALTH', 'CAFE COFFEE DAY', 'METRO CARD RECHARGE', 'ONLINE BOOKS STORE'];
  const rows = [];
  for (let i = 0; i < 500; i++) {
    const day = 1 + Math.floor(rnd() * 28);
    const amount = rnd() < 0.05 ? 400000 + Math.floor(rnd() * 900000) : 20000 + Math.floor(rnd() * 90000);
    rows.push(txn({ accountId: 'bank', date: `2026-0${1 + Math.floor(rnd() * 9)}-${String(day).padStart(2, '0')}`, amount: amount / 100, rawDescription: shops[Math.floor(rnd() * shops.length)] + ' ' + Math.floor(rnd() * 3), isTransfer: false }));
  }
  rows.push(txn({ accountId: 'bank', date: '2026-09-20', amount: 5000, rawDescription: 'BRAND NEW JEWELLER' }));
  await putAll('transactions', rows);
  const since = '2026-09-01';
  const key = (d) => significantTokens(d).slice(0, 3).join(' ');
  const debits = (await getAll('transactions')).filter((t) => t.direction === 'debit' && !t.isTransfer);
  const expected = [];
  for (const t of debits.filter((x) => x.date >= since)) {
    const history = debits.filter((h) => key(h.rawDescription) === key(t.rawDescription) && key(t.rawDescription) && h.id !== t.id && h.date < t.date);
    if (history.length >= 2) {
      const avg = history.reduce((s, h) => s + h.amount, 0) / history.length;
      const sd = Math.sqrt(history.reduce((s, h) => s + (h.amount - avg) ** 2, 0) / history.length);
      if (t.amount > Math.max(avg + 2 * sd, avg * 1.5)) expected.push(t.id + ':unusual');
    } else if (history.length === 0 && t.amount >= 100000) expected.push(t.id + ':new-merchant');
  }
  const got = (await detectAnomalies(since)).map((f) => f.transaction.id + ':' + f.reason);
  equal(got.sort(), expected.sort());
  ok(expected.length > 0, 'the test has something to find');
});

test('speed: opening Summary with twenty-five thousand payments takes under a second of work', async () => {
  await seedBasics();
  const rows = Array.from({ length: 25000 }, (_, i) => txn({ accountId: i % 2 ? 'bank' : 'card', date: `2026-0${1 + (i % 9)}-${String(1 + (i % 27)).padStart(2, '0')}`, amount: 50 + (i % 900), rawDescription: `SHOP ${i % 300} PAYMENT` }));
  await putAll('transactions', rows);
  const t0 = performance.now();
  await computeFreeToSpend(day('2026-09-16'));
  await detectAnomalies('2026-09-01');
  const ms = performance.now() - t0;
  ok(ms < 1500, `took ${Math.round(ms)} ms`);
});

/* --- the parts that had no test (5.43.3): the Coach's answers, the escaping, the account kinds ------------- */
import { affordability, savingsPlan, whereToCut } from '../js/planner.js';
import { escapeHtml, escapeAttr } from '../js/ui.js';
import { isEverydayBank, isPutAway } from '../js/account-metrics.js';

const snapshotOf = (over = {}) => ({
  now: new Date(2026, 9, 11),
  leftToSpend: 2000000,
  perDayAllowance: 100000,
  daysLeft: 10,
  runRate: 150000,
  free: 3000000,
  fixedCategoryIds: new Set(['rent']),
  spentMap: new Map(),
  daysInMonth: 31,
  categoryName: (id) => ({ food: 'Food', shop: 'Shopping', fun: 'Fun', rent: 'Rent', uncategorized: 'Uncategorized' }[id] || id),
  categoryAverages: { averages: new Map([['food', 1000000]]) },
  ...over,
});

test('coach: can I afford this? fits, does not fit, and fits but leaves little', () => {
  const s = snapshotOf();
  const fits = affordability(s, 500000);
  equal([fits.known, fits.canAfford, fits.after, fits.daysOfAllowance, fits.newPerDay, fits.tight], [true, true, 1500000, 5, 150000, false]);
  const tight = affordability(s, 1800000);
  equal([tight.canAfford, tight.after, tight.newPerDay, tight.tight], [true, 200000, 20000, true]);
  const no = affordability(s, 2500000);
  equal([no.canAfford, no.after], [false, -500000]);
  equal(affordability(snapshotOf({ leftToSpend: null }), 100), { known: false, reason: 'no-income' });
});

test('coach: saving for something works out the monthly amount, says if it fits, and where to cut if not', () => {
  const s = snapshotOf();
  const easy = savingsPlan(s, 6000000, '2027-04-11');
  equal([easy.valid, easy.monthsLeft, easy.requiredPerMonth, easy.typicalSpare, easy.feasible, easy.shortfall, easy.cuts], [true, 6, 1000000, 2000000, true, 0, []]);
  const hard = savingsPlan(s, 24000000, '2027-04-11');
  equal([hard.requiredPerMonth, hard.feasible, hard.shortfall], [4000000, false, 2000000]);
  equal(hard.cuts.map((c) => [c.categoryId, c.cut]), [['food', 333333]], 'a third of a category at most');
  equal(savingsPlan(s, 1000, '2026-01-01'), { valid: false, reason: 'past' });
  equal(savingsPlan(snapshotOf({ free: null }), 6000000, '2027-04-11').known, false);
  // rounded up to a whole rupee a month: 10,000 rupees over 6 months is 1,666.67, so 1,667
  equal(savingsPlan(s, 1000000, '2027-04-11').requiredPerMonth, 166700);
});

test('coach: where to cut leaves rent, fixed costs and the unsorted alone, and never asks for more than a third', () => {
  const s = snapshotOf({
    fixedCategoryIds: new Set(['fixedcat']),
    categoryAverages: { averages: new Map([['food', 3000000], ['shop', 2000000], ['fun', 1000000], ['rent', 5000000], ['uncategorized', 4000000], ['fixedcat', 3500000]]) },
  });
  const cuts = whereToCut(s, 1500000);
  equal(cuts.map((c) => [c.categoryId, c.cut, c.newTarget, c.pct]), [['food', 750000, 2250000, 25], ['shop', 500000, 1500000, 25], ['fun', 250000, 750000, 25]]);
  const most = whereToCut(s, 6000000);
  equal(most.map((c) => c.cut), [1000000, 666667, 333333], 'each capped at a third of what it usually is');
  equal(whereToCut(snapshotOf({ categoryAverages: { averages: new Map([['rent', 100]]) } }), 1000), []);
});

test('escaping: what is typed cannot become part of a page', () => {
  equal(escapeHtml('<img src=x onerror="a()"> & \'q\''), '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;q&#39;');
  ok(!/[<>"]/.test(escapeAttr('"><script>')), 'an attribute value cannot close its quote');
  equal(escapeHtml(null), '');
});

test('accounts: only a bank you spend from counts as spending; a savings account or a bank turned off does not', () => {
  ok(isEverydayBank({ type: 'bank' }) && isEverydayBank({ type: 'bank', spending: true }));
  ok(!isEverydayBank({ type: 'bank', spending: false }) && !isEverydayBank({ type: 'card' }) && !isEverydayBank({ type: 'savings' }));
  ok(isPutAway({ type: 'savings' }) && isPutAway({ type: 'bank', spending: false }) && !isPutAway({ type: 'bank' }));
});

test('safety sync: a budget set for one category on each device is kept, and one removed stays removed', () => {
  const budgets = (value, at) => ({ id: 'budgets', value, updatedAt: at });
  const m = mergeSnapshots(snap([budgets({ food: 500000 }, 100)]), snap([budgets({ fuel: 300000 }, 200)]), { now: 1000 });
  equal(m.data.settings[0].value, { food: 500000, fuel: 300000 });
  const base = { budgets: { food: 500000, fuel: 300000 } };
  const removed = mergeSnapshots(snap([budgets({ food: 500000 }, 300)]), snap([budgets({ food: 500000, fuel: 300000 }, 200)]), { base, now: 1000 });
  equal(removed.data.settings[0].value, { food: 500000 }, 'fuel was removed here and stays removed');
  const both = mergeSnapshots(snap([budgets({ food: 100 }, 100)]), snap([budgets({ food: 900 }, 200)]), { now: 1000 });
  equal(both.data.settings[0].value, { food: 900 }, 'the newer side wins for the same category');
});

/* --- the pieces taken out of the money calculation (5.43.3) --------------------------------------------- */
import { trackCommitments, spendSeries, addDays, daysBetweenInclusive } from '../js/free-to-spend-parts.js';

test('money parts: day arithmetic crosses months, years and a leap day', () => {
  equal([addDays('2028-02-28', 1), addDays('2026-12-31', 1), addDays('2026-03-01', -1), addDays('2026-10-11', 0)], ['2028-02-29', '2027-01-01', '2026-02-28', '2026-10-11']);
  equal([daysBetweenInclusive('2026-10-01', '2026-10-01'), daysBetweenInclusive('2026-10-01', '2026-10-31'), daysBetweenInclusive('2028-02-01', '2028-03-01')], [1, 31, 30]);
});

test('money parts: a fixed cost reads due, late, part, paid or over; a spread one reads ok or heading over', () => {
  const period = { kind: 'bank', start: '2026-10-01', end: '2026-10-31', key: '2026-10-31' };
  const rent = (used, extra = {}) => ({ item: { id: 'rent', dayOfMonth: 5, frequency: 'monthly' }, label: 'Rent', amount: 2500000, paidBy: 'bank', used, tracked: true, matches: [], notThis: [], ...extra });
  const status = (b, today, marked = false) => trackCommitments([b], { periodOf: () => period, today, markedPaid: () => marked })[0].status;
  equal(status(rent(0), '2026-10-03'), 'due');
  equal(status(rent(0), '2026-10-11'), 'late');
  equal(status(rent(1000000), '2026-10-11'), 'part');
  equal(status(rent(2500000), '2026-10-11'), 'paid');
  equal(status(rent(0), '2026-10-11', true), 'paid', 'marked paid');
  equal(status(rent(3000000), '2026-10-11'), 'over');
  equal(status(rent(0, { tracked: false }), '2026-10-11'), 'untracked');
  const tiffin = (used) => ({ item: { id: 'tf', spread: true, frequency: 'monthly' }, label: 'Tiffin', amount: 2000000, paidBy: 'bank', used, tracked: true, matches: [], notThis: [] });
  equal(status(tiffin(1000000), '2026-10-11'), 'heading-over', 'half gone by the 11th will pass the plan');
  equal(status(tiffin(1000000), '2026-10-03'), 'ok', 'too early in the month to say');
  equal(status(tiffin(300000), '2026-10-11'), 'ok');
});

test('money parts: the by-day series starts from what has no day and adds each day\'s spending', () => {
  const { spendDays, spendByDay } = spendSeries({ undated: 500, perDay: new Map([['2026-10-02', 300]]), otherDay: new Map([['2026-10-03', 70]]), windowStart: '2026-10-01', today: '2026-10-03' });
  equal(spendDays, [500, 800, 800]);
  equal(spendByDay, [{ date: '2026-10-01', amount: 0, other: 0 }, { date: '2026-10-02', amount: 300, other: 0 }, { date: '2026-10-03', amount: 0, other: 70 }]);
});
