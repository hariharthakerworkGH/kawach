import { getAll, put } from './db.js';
import { isoLocal, addDays } from './frequency.js';
import { commitmentMatcher } from './commitments.js';
import { formatDateNice } from './format.js';

// One-time bills (5.85): a payment due on one date that does not repeat - a school admission, a repair, a trip balance, a
// supplier's invoice. Plan only knew costs that repeat. A one-time bill is a commitment (so the trackers, the bills list on
// Summary, the bank check, backup and sync already know it) with `once: { dueOn, paidOn }` on the record:
//   - it takes its whole amount out of the budget in ONE month: the month it is due, or this month while it is overdue, or the
//     month it was paid when that is another one (so the payment, which is not spending, is always set against a month that held it);
//   - in every other month it takes nothing out, so Left to spend stays steady the rest of the time;
//   - a payment found for it (its words, or about its amount, from 45 days before the date) ends it, as does "Paid".
// The months ahead (Plan) show it in its month, so a short month is seen weeks before the bill falls due.

export const isOneTime = (r) => Boolean(r && r.once && typeof r.once === 'object' && r.once.dueOn);

const at = (iso) => new Date(`${iso}T12:00:00`).getTime();
const daysBetween = (a, b) => Math.round((at(a) - at(b)) / 86400000);
const monthEnd = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return isoLocal(new Date(y, m, 0));
};

// How far it is from today, said once for a row: "Due 25 Oct · in 7 days", "Overdue · 3 days", "Paid 20 Oct".
export function billState(item, today) {
  const o = item.once;
  if (o.paidOn) return { status: 'paid', tone: 'ok', text: `Paid ${formatDateNice(o.paidOn)}`, days: null };
  const days = daysBetween(o.dueOn, today);
  if (days < 0) return { status: 'overdue', tone: 'bad', text: `Overdue · ${-days} day${days === -1 ? '' : 's'}`, days };
  if (days === 0) return { status: 'today', tone: 'warn', text: 'Due today', days };
  if (days <= 7) return { status: 'soon', tone: 'warn', text: `Due ${formatDateNice(o.dueOn)} · in ${days} day${days === 1 ? '' : 's'}`, days };
  return { status: 'later', tone: 'ok', text: `Due ${formatDateNice(o.dueOn)}${days > 60 ? ` · in ${Math.round(days / 30)} months` : ` · in ${days} days`}`, days };
}

const rupeesToPaise = (v) => {
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* The commitment a form describes. `fields` are as typed (the amount in rupees); `existing` is the record being edited, so what the form
 * does not show (when it was paid, its place in the list) is kept. Null when the name, the amount or the date is missing. */
export function buildBill({ existing = null, fields, id, space }) {
  const amount = rupeesToPaise(fields.amount);
  const label = typeof fields.label === 'string' ? fields.label.trim() : '';
  const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(fields.dueOn || '') ? fields.dueOn : null;
  if (!label || !amount || !dueOn) return null;
  const prev = (existing && existing.once) || {};
  return {
    ...(existing || {}),
    id: existing ? existing.id : id,
    label,
    amount,
    frequency: 'monthly',
    dayOfMonth: Number(dueOn.slice(8, 10)),
    renewsOn: null,
    spread: false,
    flexible: false,
    categoryId: existing ? existing.categoryId || null : null,
    accountId: fields.accountId || null,
    matchText: typeof fields.matchText === 'string' && fields.matchText.trim() ? fields.matchText.trim() : null,
    active: true,
    source: 'fixed',
    once: { dueOn, paidOn: prev.paidOn || null },
    // A bill that is paid ends at the close of the month it was paid in.
    endDate: prev.paidOn ? monthEnd(prev.paidOn) : null,
    ...(existing || !space || space === 'home' ? {} : { space }),
  };
}

// "Paid": the bill is over at the close of that month. Never moves a bill that is already paid.
export function markBillPaid(item, paidOn) {
  if (item.once.paidOn) return item;
  return { ...item, once: { ...item.once, paidOn }, endDate: monthEnd(paidOn) };
}

// The payment a bill has been waiting for: a debit that is tagged to it, or carries its words, or is about its amount, from 45
// days before its date up to today. Returns the date of the last one, or null while the bill is still owed (nine tenths counts).
export function paymentFound(item, entries, today) {
  const o = item.once;
  if (o.paidOn) return o.paidOn;
  const matcher = commitmentMatcher(item);
  const from = addDays(o.dueOn, -45);
  const hits = entries.filter((t) => t.direction === 'debit' && !t.isTransfer && t.date >= from && t.date <= today).filter((t) => {
    if (t.commitmentId === item.id) return true;
    if (t.commitmentId || (t.notCommitmentIds || []).includes(item.id)) return false;
    return matcher ? matcher(t) : Math.abs(t.amount - item.amount) <= item.amount * 0.02;
  });
  const sum = hits.reduce((s, t) => s + t.amount, 0);
  return sum >= item.amount * 0.9 ? hits.map((t) => t.date).sort().pop() : null;
}

/* Ends every bill whose payment has been recorded, so next month does not hold it again. Saves only a bill that changed; safe to run
 * on every screen that shows the budget. */
export async function settleBills(today = isoLocal(new Date())) {
  const [recurring, transactions] = await Promise.all([getAll('recurring'), getAll('transactions')]);
  let changed = 0;
  for (const item of recurring.filter((r) => isOneTime(r) && !r.once.paidOn && r.active !== false)) {
    const found = paymentFound(item, transactions, today);
    if (found) {
      await put('recurring', markBillPaid(item, found));
      changed += 1;
    }
  }
  return changed;
}
