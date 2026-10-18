import { frequencyOf, addDays, yearlyAmountOf } from './frequency.js';
import { RENEWAL_MONTHS, monthsOn } from './calendar.js';
import { formatRupees, formatDateNice } from './format.js';

// Insurance policies (5.84). A policy is a yearly (or quarterly, half-yearly, monthly) fixed cost with its
// details kept beside it, so it is typed in once: the cost keeps working exactly as every renewal does
// (js/calendar.js: a slice set aside each month, the whole premium in the month it is due), and what you
// need at a hospital or after a death - policy number, who is covered, the nominee, the helpline - is on
// the same record. It lives on the commitment as `policy`, in the `recurring` store, so backups, sync and
// the app lock carry it without anything new. Nothing here is sent anywhere and nothing is checked with
// the insurer: Kawach only knows what you typed.
//
//   policy: { kind, insurer, number, covered, sum, helpline, nominee, agent, graceDays, note,
//             dueOn,            the premium date it is waiting for; moves on only when you mark it paid
//             lastPaid, payments: [{ date, amount }],
//             maturityOn, maturityAmount }          money coming back (an endowment, a money-back plan)

export const KINDS = {
  health: { label: 'Health', grace: 30 },
  life: { label: 'Life (LIC)', grace: 30 },
  term: { label: 'Term life', grace: 30 },
  vehicle: { label: 'Vehicle', grace: 0 },
  other: { label: 'Other', grace: 15 },
};

// How often a premium can be paid, and the months between two of them.
export const PREMIUM_EVERY = { monthly: 1, quarterly: 3, halfYearly: 6, yearly: 12 };

export const isPolicy = (r) => Boolean(r && r.source === 'fixed' && r.policy && typeof r.policy === 'object');
export const kindOf = (r) => (KINDS[r.policy && r.policy.kind] ? r.policy.kind : 'other');
export const kindLabel = (r) => KINDS[kindOf(r)].label;

const at = (iso) => new Date(`${iso}T12:00:00`).getTime();
const daysBetween = (a, b) => Math.round((at(a) - at(b)) / 86400000);

// The date its premium is waiting for. Monthly policies have no renewal date of their own, so it is kept here.
export const policyDue = (r) => (r.policy && r.policy.dueOn) || r.renewsOn || null;

export function graceDays(r) {
  const g = r.policy && r.policy.graceDays;
  return Number.isFinite(g) && g >= 0 ? g : KINDS[kindOf(r)].grace;
}

/* Where a policy stands today.
 *   ok      more than 30 days to its date
 *   soon    within 30 days
 *   grace   the date has passed but the grace period has not: still in force, pay now
 *   lapsed  the grace period is over (a vehicle policy has none): it may have lapsed
 *   undated no date was given */
export function policyState(r, today) {
  const due = policyDue(r);
  if (!due) return { status: 'undated', due: null };
  const days = daysBetween(due, today);
  const graceEnd = addDays(due, graceDays(r));
  const graceLeft = daysBetween(graceEnd, today);
  const status = days > 30 ? 'ok' : days >= 0 ? 'soon' : graceLeft >= 0 ? 'grace' : 'lapsed';
  return { status, due, days, graceEnd, graceLeft };
}

// One short line for a row, and how serious it is (for its colour).
export function stateLine(s, r) {
  if (s.status === 'undated') return { text: 'Add the date its premium is due', tone: 'quiet' };
  if (s.status === 'ok') return { text: `Due ${formatDateNice(s.due)}${s.days > 60 ? ` · in ${Math.round(s.days / 30)} months` : ` · in ${s.days} days`}`, tone: 'ok' };
  if (s.status === 'soon') return { text: s.days === 0 ? 'Due today' : s.days === 1 ? 'Due tomorrow' : `Due ${formatDateNice(s.due)} · in ${s.days} days`, tone: 'soon' };
  if (s.status === 'grace') return { text: `Overdue · pay by ${formatDateNice(s.graceEnd)}`, tone: 'warn' };
  return { text: graceDays(r) === 0 ? `Ran out ${formatDateNice(s.due)}` : `Grace ended ${formatDateNice(s.graceEnd)}`, tone: 'bad' };
}

// What the short line means, said once on the policy's own page.
export function stateNote(s, r) {
  if (s.status === 'grace') return `The premium date has passed. The policy usually stays in force until ${formatDateNice(s.graceEnd)} if it is paid by then (the grace period: check your policy for the exact days).`;
  if (s.status === 'lapsed') return graceDays(r) === 0 ? 'A vehicle policy runs out on its date. Renew it before the vehicle is used.' : 'The grace period is over. Ask the insurer whether the policy can still be revived.';
  return '';
}

/* The premium has been paid: record it and move the date on one whole period from the date it was due (not from
 * today), so paying late or early never shifts the calendar. */
export function markPaid(r, paidOn, amount = r.amount) {
  const p = r.policy;
  const freq = frequencyOf(r);
  const step = PREMIUM_EVERY[freq];
  const due = policyDue(r) || paidOn;
  // From the day it was first due, so a 31st held to a short month's end comes back to the 31st.
  const base = p.day ? `${due.slice(0, 8)}${String(p.day).padStart(2, '0')}` : due;
  const next = step ? monthsOn(base, step) : due;
  return {
    ...r,
    policy: { ...p, dueOn: next, lastPaid: paidOn, payments: [...(p.payments || []), { date: paidOn, amount }].slice(-40) },
    renewsOn: RENEWAL_MONTHS[freq] ? next : r.renewsOn || null,
    dayOfMonth: Number(next.slice(8, 10)),
  };
}

// The Indian financial year a date is in: 1 April to 31 March.
export function fyOf(today) {
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `${start}-${String(start + 1).slice(2)}` };
}

// What was recorded as paid in that year. Only payments marked here count: this is a record for your own papers (and
// your accountant), never a tax figure.
export function paidInYear(r, fy) {
  return ((r.policy && r.policy.payments) || []).filter((p) => p.date >= fy.from && p.date <= fy.to).reduce((t, p) => t + p.amount, 0);
}

export const yearlyPremium = (r) => yearlyAmountOf(r);

// Money a policy pays back, still to come, soonest first. Never counted in any figure until it arrives.
export function maturitiesAhead(items, today, months = 12) {
  const end = addDays(today, Math.round(months * 30.5));
  return items
    .filter((r) => isPolicy(r) && r.policy.maturityOn && r.policy.maturityOn >= today && r.policy.maturityOn <= end)
    .map((r) => ({ item: r, on: r.policy.maturityOn, amount: r.policy.maturityAmount || 0 }))
    .sort((a, b) => (a.on < b.on ? -1 : 1));
}

const rupeesToPaise = (v) => {
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/* The commitment a form describes. `fields` are the form's values as typed (amounts in rupees), `existing` the record
 * being edited, so what the form does not show (its payments, its order on Plan) is kept. Null when the name, the
 * premium or the date is missing. */
export function buildPolicy({ existing = null, fields, id, space }) {
  const amount = rupeesToPaise(fields.amount);
  const kind = KINDS[fields.kind] ? fields.kind : 'other';
  const name = clean(fields.name) || clean(fields.insurer);
  const freq = PREMIUM_EVERY[fields.frequency] ? fields.frequency : 'yearly';
  const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(fields.dueOn || '') ? fields.dueOn : null;
  if (!name || !amount) return null;
  const grace = fields.graceDays === '' || fields.graceDays == null ? null : Number(fields.graceDays);
  const prev = (existing && existing.policy) || {};
  const policy = {
    ...prev,
    kind,
    insurer: clean(fields.insurer),
    number: clean(fields.number),
    covered: clean(fields.covered),
    sum: rupeesToPaise(fields.sum),
    helpline: clean(fields.helpline),
    nominee: clean(fields.nominee),
    agent: clean(fields.agent),
    note: clean(fields.note),
    graceDays: Number.isFinite(grace) && grace >= 0 ? Math.round(grace) : null,
    dueOn,
    day: dueOn ? Number(dueOn.slice(8, 10)) : null,
    maturityOn: /^\d{4}-\d{2}-\d{2}$/.test(fields.maturityOn || '') ? fields.maturityOn : null,
    maturityAmount: rupeesToPaise(fields.maturityAmount),
  };
  return {
    ...(existing || {}),
    id: existing ? existing.id : id,
    label: name,
    amount,
    frequency: freq,
    dayOfMonth: dueOn ? Number(dueOn.slice(8, 10)) : (existing && existing.dayOfMonth) || 1,
    renewsOn: RENEWAL_MONTHS[freq] ? dueOn : null,
    spread: false,
    flexible: false,
    categoryId: existing ? existing.categoryId || null : null,
    accountId: fields.accountId || null,
    matchText: clean(fields.matchText),
    active: true,
    source: 'fixed',
    ...(existing || !space || space === 'home' ? {} : { space }),
    policy,
  };
}

const fullDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return `${Number(m[3])} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]} ${m[1]}`;
};

/* A plain page for the family: every policy, what it covers and who to call. Text, so it can be sent from any
 * app or printed. It says plainly that it is only what was typed in. */
export function familySummary(items, today) {
  const list = items.filter(isPolicy);
  if (!list.length) return '';
  const lines = [`Insurance summary, made with Kawach on ${fullDate(today)}`, 'This is only what was typed in. Check the policy papers before relying on any detail.', ''];
  for (const r of list) {
    const p = r.policy;
    const freq = frequencyOf(r);
    lines.push(`${kindLabel(r).toUpperCase()}: ${r.label}`);
    if (p.insurer) lines.push(`Insurer: ${p.insurer}`);
    if (p.number) lines.push(`Policy number: ${p.number}`);
    if (p.covered) lines.push(`Covers: ${p.covered}`);
    if (p.sum) lines.push(`${p.kind === 'health' || p.kind === 'vehicle' ? 'Sum insured' : 'Sum assured'}: ${formatRupees(p.sum)}`);
    lines.push(`Premium: ${formatRupees(r.amount)} ${freq === 'monthly' ? 'every month' : freq === 'quarterly' ? 'every 3 months' : freq === 'halfYearly' ? 'every 6 months' : 'every year'}${policyDue(r) ? `, next due ${fullDate(policyDue(r))}` : ''}`);
    if (p.lastPaid) lines.push(`Last paid: ${fullDate(p.lastPaid)}`);
    if (p.maturityOn) lines.push(`Matures: ${fullDate(p.maturityOn)}${p.maturityAmount ? `, about ${formatRupees(p.maturityAmount)}` : ''}`);
    if (p.nominee) lines.push(`Nominee: ${p.nominee}`);
    if (p.helpline) lines.push(`Helpline: ${p.helpline}`);
    if (p.agent) lines.push(`Agent: ${p.agent}`);
    if (p.note) lines.push(`Note: ${p.note}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

// What a diagnostic report keeps of a policy: dates and amounts, never who, which policy or the numbers to call.
export function redactPolicy(p) {
  if (!p) return undefined;
  return {
    kind: p.kind,
    graceDays: p.graceDays,
    dueOn: p.dueOn,
    lastPaid: p.lastPaid,
    payments: (p.payments || []).map((x) => ({ date: x.date, amount: x.amount })),
    maturityOn: p.maturityOn,
    maturityAmount: p.maturityAmount,
  };
}
