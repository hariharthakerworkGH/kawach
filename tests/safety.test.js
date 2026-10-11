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
