/* Lent and borrowed (5.20): money between you and a person.
 *
 * A payment to or from someone carries their id (t.personId), and the way the
 * money went says the rest: you gave or you got. There is no separate "lent"
 * and "paid back", because which one it was depends on where the two of you
 * stood, and that is worked out here rather than asked:
 *
 *   what they owe you = everything you gave them − everything you got from them
 *
 * Above nothing, they owe you; below, you owe them. The people themselves are
 * the `people` setting: { id, name, backBy } - backBy is the day you expect
 * your money back, set when you lend.
 *
 * How it counts for the month (js/free-to-spend.js), going through each
 * person's payments in date order:
 *   - money you lend comes off Left to spend: it is not in your hand;
 *   - money that comes back goes on again, in the month it arrives;
 *   - money you borrow never raises the budget, the same as the bank balance
 *     never does, and paying it back is not spending, because whatever it
 *     paid for was counted when you spent it.
 * Only a bank account you spend from or a card counts. Cash was counted as
 * spent when it left the ATM, and an account kept for saving is never
 * spending, so money given or got in either still moves what is owed but
 * never the month.
 */

import { getSetting, setSetting, newId } from './db.js';
import { showToast } from './toast.js';

// On one day a split goes first: a friend paying back the same day it was split is paying what they now owe.
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Boolean(a.isFriendShare) !== Boolean(b.isFriendShare) ? (a.isFriendShare ? -1 : 1) : String(a.id) < String(b.id) ? -1 : 1);

export const isPersonMoney = (t) => Boolean(t.personId) && !t.isTransfer;

/* Split with friends (7.25): a payment you made for several people carries `friendShares`, [{ personId, amount }], the part
 * each of them owes you. It is not a second payment, so no balance, category or total ever sees it: it only moves where each
 * person stands. It means something only on money you paid out, so a payment later turned into money received, a move, or
 * someone's own money, shows nothing. The whole bill stays what you spent; each part goes back on as that friend pays. */
export function friendShareEvents(transactions) {
  const out = [];
  for (const t of transactions) {
    if (t.direction !== 'debit' || t.isTransfer || t.personId || !Array.isArray(t.friendShares)) continue;
    for (const s of t.friendShares) {
      // A part that came in from a backup or a sync damaged is skipped, never counted as a guess.
      if (!s || typeof s.personId !== 'string' || !Number.isFinite(s.amount) || s.amount <= 0) continue;
      out.push({ id: `${t.id}#${s.personId}`, fromId: t.id, isFriendShare: true, personId: s.personId, direction: 'debit', amount: s.amount, date: t.date, accountId: t.accountId, merchant: t.merchant, rawDescription: t.rawDescription });
    }
  }
  return out;
}

/* Everyone's equal part of `amount` when you and `personIds.length` friends split it: whole paise, and the odd paisa is yours. */
export function equalShares(amount, personIds) {
  const each = Math.floor(amount / (personIds.length + 1));
  return personIds.map((personId) => ({ personId, amount: each }));
}

/* The one message for everyone who still owes: [{ name, amount }]. */
export function reminderAllText(owing) {
  const money = (n) => `₹${(n / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  return `Hi all, a gentle reminder for what is still due: ${owing.map((o) => `${first(o.name)} ${money(o.amount)}`).join(', ')}. Thank you!`;
}

/* Each person's standing: what they owe you (below nothing: what you owe
 * them), every payment between you, newest first, and the day the present
 * debt began, whichever way it runs. */
export function peopleStanding(transactions, people = []) {
  const out = new Map(people.map((p) => [p.id, { person: p, owed: 0, entries: [], since: null }]));
  for (const t of [...transactions.filter(isPersonMoney), ...friendShareEvents(transactions)].sort(byDate)) {
    if (!out.has(t.personId)) continue;
    const s = out.get(t.personId);
    const before = s.owed;
    s.owed += t.direction === 'debit' ? t.amount : -t.amount;
    if (s.owed === 0) s.since = null;
    else if (before === 0 || Math.sign(before) !== Math.sign(s.owed)) s.since = t.date;
    s.entries.unshift(t);
  }
  return [...out.values()];
}

/* What each payment to or from a person does to spending: a map from its id
 * to the amount it adds (lending) or takes off (money back). Borrowing and
 * paying back are absent: they do neither. `counts(t)` says whether the
 * account it was paid from is one whose money is spending (see above); a
 * payment that does not count still moves where the two of you stand. */
export function personSpendEffects(transactions, counts = () => true) {
  const owed = new Map();
  const effects = new Map();
  for (const t of [...transactions.filter(isPersonMoney), ...friendShareEvents(transactions)].sort(byDate)) {
    const b = owed.get(t.personId) || 0;
    let effect;
    if (t.isFriendShare) {
      // Their part of a bill you paid whole: they owe it now, and spending changes only as they pay (below).
      owed.set(t.personId, b + t.amount);
      continue;
    }
    if (t.direction === 'debit') {
      // What you owed them is paid back first; the rest is a loan.
      effect = t.amount - Math.min(t.amount, Math.max(0, -b));
      owed.set(t.personId, b + t.amount);
    } else {
      // What they owed you comes back first; the rest is borrowed.
      effect = -Math.min(t.amount, Math.max(0, b));
      owed.set(t.personId, b - t.amount);
    }
    if (effect && counts(t)) effects.set(t.id, effect);
  }
  return effects;
}

/* The people whose money is late: they owe you and the day you expected it
 * back has gone. Most overdue first. */
export function lateBack(standing, today) {
  return standing
    .filter((s) => s.owed > 0 && s.person.backBy && s.person.backBy < today)
    .sort((a, b) => (a.person.backBy < b.person.backBy ? -1 : 1));
}

/* The few words Remind puts in the share sheet, ready to send or change. */
export function reminderText(name, amount, sinceLabel) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return `Hi ${first}, a gentle reminder about the ₹${(amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}${sinceLabel ? ` from ${sinceLabel}` : ''}. Thank you!`;
}

/* The person with this name, added to the list if they are new. The same
 * name in other capitals or with extra spaces is the same person. */
export async function personNamed(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const people = await getSetting('people', []);
  const found = people.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (found) return found;
  const person = { id: `person-${newId()}`, name: clean };
  await setSetting('people', [...people, person]);
  return person;
}

/* Changes one person and saves the list. */
export async function updatePerson(id, change) {
  const people = await getSetting('people', []);
  await setSetting('people', people.map((p) => (p.id === id ? { ...p, ...change } : p)));
}

/* Remind: the phone's own share sheet with the message written, so the
 * person chooses the app and presses send; Kawach sends nothing. Without a
 * share sheet (most computers) the message is copied instead. */
export async function shareReminder(text) {
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      showToast('Reminder copied');
    }
  } catch (e) {
    // Closing the share sheet is not a problem worth a message.
  }
}
