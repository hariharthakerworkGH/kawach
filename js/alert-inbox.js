import { get, getAll, put, remove, newId } from './db.js';
import { splitAlerts, parseAlert, alertFingerprint } from './alerts.js';
import { learnFromAssignment } from './merchant-rules.js';
import { loadLearned, learnFrom } from './alert-learning.js';

// Alerts waiting for you to confirm them.
//
// They live in their own store, not among transactions, on purpose: every
// total in the app reads the transactions store directly, so a misread alert
// sitting there would already be skewing your spend before you'd seen it.
// Only once you tap Save does an alert become a real transaction.
//
// The inbox stays on the device it was shared to and is never synced. The
// transactions it produces are synced like any other.

const INBOX_STORE = 'alertInbox';

// Must match SHARE_CACHE in sw.js, which parks shared text here: the service
// worker can't reliably write to IndexedDB before the page has upgraded it.
const SHARE_CACHE = 'share-inbox';

export async function pendingAlerts() {
  const rows = await getAll(INBOX_STORE);
  return rows.sort((a, b) => a.receivedAt - b.receivedAt);
}

export async function pendingCount() {
  return (await getAll(INBOX_STORE)).length;
}

// Adds whatever text was shared or pasted, one inbox item per alert in it.
// Returns how many new alerts were added.
export async function addToInbox(text, via = 'paste', receivedAt = Date.now()) {
  await loadLearned();
  const pieces = splitAlerts(text);
  // Sharing the same SMS twice (the app was slow to open, so you shared again)
  // must not queue it twice. Identical text is safe to treat as the same
  // alert: HDFC card alerts carry the time to the second, UPI alerts carry a
  // reference, and ICICI's include the remaining limit, which changes with
  // every spend.
  const waiting = new Set((await getAll(INBOX_STORE)).map((row) => normalise(row.rawText)));
  let added = 0;
  for (let i = 0; i < pieces.length; i++) {
    const key = normalise(pieces[i]);
    if (waiting.has(key)) continue;
    waiting.add(key);
    // One millisecond apart, so alerts shared together are listed in the order
    // they arrived rather than in whatever order their random ids sort.
    await put(INBOX_STORE, { id: newId(), rawText: pieces[i], via, receivedAt: receivedAt + i }, { stamp: false });
    added++;
  }
  return added;
}

const normalise = (text) => String(text).replace(/\s+/g, ' ').trim();

// Moves anything the service worker received from the share sheet into the
// inbox. Called on every start; returns how many alerts arrived.
export async function collectSharedAlerts() {
  if (typeof caches === 'undefined') return 0;
  let added = 0;
  try {
    const cache = await caches.open(SHARE_CACHE);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      const payload = response ? await response.json().catch(() => null) : null;
      if (payload && payload.text) added += await addToInbox(payload.text, 'share', payload.receivedAt || Date.now());
      // Deleted whether or not it parsed, so a malformed share can't jam the queue.
      await cache.delete(request);
    }
  } catch {
    // Cache Storage unavailable (private window): shares can't be received,
    // but pasting still works.
  }
  return added;
}

export async function dismissAlert(id) {
  await remove(INBOX_STORE, id, { tombstone: false });
}

// Turns a confirmed draft into a transaction. `edits` are what you changed on
// the confirm card; the parsed alert supplies everything else.
//
// Returns null without saving if the alert has already been dealt with - the
// inbox item is gone (saved or skipped a moment ago, perhaps by an earlier tap
// or on a screen that has since refreshed), or a transaction from this exact
// alert already exists and you didn't explicitly choose "Save anyway". Checked
// here, against the database as it is now, because the screen's own picture
// of what's already saved can be out of date.
export async function saveAlert(item, edits) {
  const stillWaiting = await get(INBOX_STORE, item.id);
  if (!stillWaiting) return null;

  await loadLearned();
  const parsed = parseAlert(item.rawText);
  const alertKey = parsed.ok ? alertFingerprint(parsed) : null;
  if (alertKey && !edits.allowDuplicate) {
    const already = (await getAll('transactions')).some((t) => t.alertKey === alertKey);
    if (already) {
      await dismissAlert(item.id);
      return null;
    }
  }

  const transaction = {
    id: newId(),
    accountId: edits.accountId,
    date: edits.date,
    rawDescription: edits.description,
    amount: edits.amount,
    direction: edits.direction,
    categoryId: edits.categoryId || null,
    source: 'alert',
    importBatchId: null,
    isTransfer: Boolean(edits.isTransfer),
    notes: null,
    // Kept so the statement import can recognise this exact transaction later
    // (the UPI reference is printed on the statement too), and so the same
    // alert shared twice is caught.
    alertKey,
    alertRef: parsed.ok ? parsed.ref : null,
    // NEW, for History's same-day order: the bank's own time on the alert
    // ("23:23") where it gave one, and when it was saved.
    // (Dropped if you changed the date on the confirm card: the time belonged
    // to the bank's date, not yours.)
    time: parsed.ok && parsed.time && parsed.date === edits.date ? parsed.time : undefined,
    // When the alert reached the app, not when you got round to tapping Save:
    // a morning's alerts saved together at lunch still sit in the order they
    // came. (Never later than now.)
    createdAt: Math.min(item.receivedAt || Date.now(), Date.now()),
  };
  if (transaction.time === undefined) delete transaction.time;
  if (edits.commitmentId) transaction.commitmentId = edits.commitmentId;
  // Work costs and what pays them back (js/reimbursable.js): only the flag
  // that fits the way the money went.
  if (edits.direction === 'debit' && edits.isReimbursable) transaction.isReimbursable = true;
  if (edits.direction === 'credit' && edits.isSettlement) transaction.isSettlement = true;
  if (edits.paysCardId) transaction.paysCardId = edits.paysCardId;
  // Your call on transfer-or-not sticks, and automatic detection won't undo it.
  if (edits.transferDecided) transaction.transferManual = true;

  await put('transactions', transaction);
  if (transaction.categoryId) await learnFromAssignment(transaction.rawDescription, transaction.categoryId, transaction.direction);

  // Remember which account this card number belongs to, so the next alert
  // from it lands in the right place without asking.
  if (parsed.ok && parsed.last4 && edits.accountId) {
    // Read the account fresh rather than trusting the copy from when the
    // screen opened - a sync or statement import may have updated it since,
    // and writing the old copy back would undo that.
    const account = await get('accounts', edits.accountId);
    // Not when another account already ends in these digits: picking the bank
    // account for a card alert once is a correction for that alert, and
    // remembering it would send every later alert from that card there too.
    const owned = (await getAll('accounts')).some((a) => a.id !== edits.accountId && a.last4 === parsed.last4);
    if (account && account.last4 !== parsed.last4 && !owned) {
      const links = new Set(account.linkedLast4s || []);
      if (!links.has(parsed.last4)) {
        links.add(parsed.last4);
        await put('accounts', { ...account, linkedLast4s: [...links] });
      }
    }
  }

  // A wording nothing here knew, now checked and saved: remember it, so the next message like it is
  // read by itself (js/alert-learning.js). A fault in learning never stands in the way of saving.
  if (parsed.ok && parsed.confidence === 'partial') {
    try {
      await learnFrom(item.rawText, parsed, { amount: edits.amount, date: edits.date, description: edits.description, direction: edits.direction });
    } catch {
      /* the alert is saved either way */
    }
  }

  await dismissAlert(item.id);
  return transaction;
}
