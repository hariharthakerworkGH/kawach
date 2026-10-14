/* Plan's top and its month, in each style other than Charts (5.14).
 *
 * As on Summary (summary-looks.js), a style changes how Plan looks, never
 * what it says. The top always gives the budget each month, what comes in,
 * and how that splits - must go out, can flex, free and saved - each as an
 * amount and a share, with the same one-line status. The month always gives
 * each must-go-out on its day, with its name, amount and whether it is paid,
 * still to pay or late, and today. Every figure comes from plan.js, which
 * worked it out for the Charts drawing; nothing is calculated again.
 */

import { formatRupees, ordinal } from '../format.js';
import { escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { categoryStyle } from '../category-style.js';
import { gemNo } from './summary-looks.js';

const share = (v, of) => (of > 0 ? Math.max(0, Math.min(1, v / of)) : 0);

/* The four parts of what comes in, in the order every style shows them. */
export function planParts({ income, must, flex, budget, keep }) {
  return [
    { id: 'must', label: 'Must go out', amount: must },
    { id: 'flex', label: 'Can flex', amount: flex },
    { id: 'free', label: 'Free', amount: Math.max(0, budget || 0) },
    { id: 'saved', label: 'Saved', amount: keep || 0 },
  ].map((p) => ({ ...p, share: share(p.amount, income) }));
}

export function planTop(style, f) {
  const parts = planParts(f);
  const bar = (cls) => `<div class="${cls}" role="img" aria-label="${parts.map((p) => `${p.label} ${formatRupees(p.amount)}`).join(', ')}">${parts
    .filter((p) => p.amount > 0)
    .map((p) => `<i class="is-${p.id}" style="flex:${p.amount}"></i>`)
    .join('')}</div>`;
  const amount = `<span class="${f.budget != null && f.budget < 0 ? 'is-negative' : ''}">${f.budget != null ? formatRupees(f.budget) : '-'}</span>`;
  if (style === 'instrument' || style === 'haven') {
    return `<section class="pl-top pl-top--tactile">
        <div class="tl-top"><span class="tl-k">Budget each month</span><span class="tl-period">comes in ${formatRupees(f.income)}</span></div>
        <div class="tl-big">${amount}</div>
        ${bar('pl-seg')}
        <div class="pl-legend">${parts.map((p) => `<span><i class="is-${p.id}"></i>${p.label}<em><b>${formatRupees(p.amount)}</b></em></span>`).join('')}</div>
        <p class="tl-line">${escapeHtml(f.status)}</p>
      </section>`;
  }
}

/* The month's must-go-outs, as the style draws them. `rows` are plan.js's
 * own: { label, day, amount, state: 'paid' | 'due' | 'late' }. */
export function planMonth(style, rows, now = new Date()) {
  if (!rows.length) return '';
  // Instrument draws the month as Tactile's steps (its CSS repaints them).
  if (style === 'instrument' || style === 'haven') style = 'tactile';
  const today = now.getDate();
  const words = { paid: 'paid', late: 'late', skipped: 'skipped this month', due: 'still to pay' };
  const said = (r) => `${r.label}, ${formatRupees(r.amount)} on the ${ordinal(r.day)}: ${words[r.state] || words.due}. Tap to mark it paid, skip it or see its payments.`;
  // Every one can be tapped (5.23): it opens what can be done with it.
  const tap = (r) => `data-month-item="${escapeHtml(r.id || '')}"`;
  // Steps on a line: done ticked, late marked, still to pay showing its
  // icon. Many of them scroll sideways.
  const done = rows.filter((r) => r.state === 'paid').length;
  const byName = (a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' });
  const open = rows.filter((r) => r.state === 'due' || r.state === 'late');
  const finished = rows.filter((r) => r.state === 'paid' || r.state === 'skipped').sort(byName);
  const doneRow = (r) => `<button type="button" class="pl-done__row" ${tap(r)} aria-label="${escapeHtml(said(r))}"><strong>${escapeHtml(r.label)}</strong><small>${ordinal(r.day)}</small><span>${formatRupees(r.amount)}</span><em>${r.state === 'skipped' ? 'skipped' : 'paid'}</em></button>`;
  const step = (r) => {
    const mark = r.state === 'paid' ? icon('check') : r.state === 'late' ? icon('alert') : r.state === 'skipped' ? icon('ban') : style === 'tactile' ? categoryStyle(r.label).icon : `${r.day}`;
    return `<button type="button" class="pl-step is-${r.state}" ${tap(r)} aria-label="${escapeHtml(said(r))}"><b>${mark}</b><small><strong>${escapeHtml(r.label)}</strong>${ordinal(r.day)}<span>${r.state === 'skipped' ? 'skipped' : formatRupees(r.amount)}</span></small></button>`;
  };
  return `<div class="pl-month pl-month--${style}">
      ${open.length ? `<div class="pl-steps no-swipe" style="--pl-n:${open.length}; --pl-done:0">${open.map(step).join('')}</div>` : '<p class="pl-clear">Everything is paid for this month.</p>'}
      <p class="pl-today">${done} of ${rows.length} paid · today is the ${ordinal(today)}</p>
      ${open.length ? '<p class="pl-hint">Tap a step to mark paid or skip</p>' : ''}
      ${finished.length ? `<details class="pl-done"><summary>Paid or skipped (${finished.length})</summary><div class="pl-done__list">${finished.map(doneRow).join('')}</div></details>` : ''}
    </div>`;
}

/* --- Haven (5.55): Plan's two lists as one -------------------------------------------------------------------
 * "This month" (what is left of each set-aside) and "Commitments" were two lists of the same things. Here they are one:
 * a box that says how the month stands (paid, to pay, kept aside; tap a figure to see only those), and under it every
 * commitment once. A bill says Paid, Due 21st or Late, and has a tick when it can be marked paid from here. A set-aside
 * says what is left and has a thin line for how much is used. Bills not yet paid come first, then the rest; inside each
 * group the order is the one chosen on the sort control (A to Z unless changed). Tapping a row opens what can be done with
 * it (mark paid, skip, see its payments, edit). `tracker` is free-to-spend.js's own list; nothing is calculated again.
 * Exported for a test. */
const isProgress = (t) => t.setAside || ['ok', 'heading-over', 'over'].includes(t.status);
const UNPAID = new Set(['late', 'due', 'part']);

export function havenCommitments(tracker, { order = new Map(), dayOf = () => null, markable = () => false, note = () => '', editingId = null, form = () => '' } = {}) {
  const at = (t) => (order.has(t.id) ? order.get(t.id) : 1e9);
  const byOrder = (a, b) => at(a) - at(b) || String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' });
  const rows = tracker.filter((t) => t.amount > 0 || t.skipped);
  const progress = rows.filter(isProgress).sort(byOrder);
  const bills = rows.filter((t) => !isProgress(t));
  const unpaid = bills.filter((t) => UNPAID.has(t.status)).sort(byOrder);
  const done = bills.filter((t) => !UNPAID.has(t.status)).sort(byOrder);
  const money = (p) => `₹${Math.round(Math.abs(p) / 100).toLocaleString('en-IN')}`;
  const gem = (label) => `<span class="hv-gem hv-g${gemNo(label)}"><span class="hv-ic">${categoryStyle(label).icon}</span></span>`;
  const day = (t) => (dayOf(t.id) ? ordinal(dayOf(t.id)) : '');
  const word = (t) => {
    const d = day(t);
    if (t.status === 'paid') return { cls: 'paid', text: `${d ? `${d} · ` : ''}Paid`, tick: true };
    if (t.status === 'late') return { cls: 'late', text: `${d ? `${d} · ` : ''}Late` };
    if (t.status === 'due') return { cls: 'due', text: d ? `Due ${d}` : 'Due' };
    if (t.status === 'part') return { cls: 'due', text: `${d ? `${d} · ` : ''}${money(t.left)} to go` };
    if (t.skipped || t.status === 'skipped') return { cls: 'due', text: 'Skipped this month' };
    return { cls: 'due', text: d };
  };
  const said = (t, w) => `${t.label}, ${formatRupees(t.amount)}${w.text ? `: ${w.text}` : ''}. Tap for more.`;
  const bill = (t) => {
    if (editingId === t.id) return form(t.id);
    const w = word(t);
    const kind = UNPAID.has(t.status) ? 'topay' : 'paid';
    const check = UNPAID.has(t.status) && markable(t.id)
      ? `<button type="button" class="hv-paycheck" data-pay-step="${escapeHtml(t.id)}" aria-label="Mark ${escapeHtml(t.label)} paid" title="Mark paid"><span class="nest"><span class="hv-ic">${icon('tick')}</span></span></button>`
      : '<span class="hv-paycheck-gap"></span>';
    return `<div class="hv-bill${t.status === 'late' ? ' late' : ''}" data-kind="${kind}" data-step="${escapeHtml(t.id)}" data-amt="${t.status === 'part' ? Math.max(0, t.left) : t.amount}" data-can-pay="${check.includes('data-pay-step') ? 1 : 0}">
      <button type="button" class="hv-bill__open" data-month-item="${escapeHtml(t.id)}" aria-label="${escapeHtml(said(t, w))}">${gem(t.label)}<span class="hv-bill__name"><b>${escapeHtml(t.label)}</b><span class="hv-row__m hv-st-${w.cls}">${w.tick ? `<span class="hv-tick">${icon('tick')}</span>` : ''}${w.text}</span></span><span class="hv-bill__amt hv-amt">${money(t.amount)}</span></button>${check}</div>`;
  };
  const aside = (t) => {
    if (editingId === t.id) return form(t.id);
    const used = t.amount > 0 ? Math.max(0, Math.min(1, t.used / t.amount)) : 0;
    const over = t.left < 0;
    const extra = note(t.id);
    const text = (over ? `${money(t.left)} over` : t.left > 0 ? `${money(t.left)} left` : 'Used up') + (extra ? ` · ${extra}` : '');
    return `<div class="hv-bill hv-bill--aside" data-kind="aside" data-step="${escapeHtml(t.id)}">
      <button type="button" class="hv-bill__open" data-month-item="${escapeHtml(t.id)}" aria-label="${escapeHtml(`${t.label}, ${money(t.amount)} set aside, ${text}. Tap for more.`)}">${gem(t.label)}<span class="hv-bill__name"><b>${escapeHtml(t.label)}</b><span class="hv-row__m${over ? ' hv-st-late' : ''}">${text}</span></span><span class="hv-bill__amt hv-amt">${money(t.amount)}</span></button><span class="hv-paycheck-gap"></span>
      <div class="hv-usedline${t.left <= 0 ? ' full' : ''}" aria-hidden="true"><i style="width:${(used * 100).toFixed(0)}%"></i></div></div>`;
  };
  const paid = done.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
  const toPay = unpaid.reduce((s, t) => s + (t.status === 'part' ? Math.max(0, t.left) : t.amount), 0);
  const kept = progress.reduce((s, t) => s + Math.max(0, t.left), 0);
  const key = (f, cls, label, v) => `<button type="button" data-f="${f}"><span><i class="${cls}"></i>${label}</span><b class="hv-amt">${money(v)}</b></button>`;
  const seg = (v, cls) => (v > 0 ? `<i class="${cls}" style="flex:${v}"></i>` : '');
  const box = paid + toPay + kept > 0
    ? `<div class="hv-screen" data-hv-box><div class="hv-sec"><h2>This month</h2><span class="hv-muted">tap a figure to filter</span></div><div class="hv-shell"><div class="hv-core hv-sum"><div class="hv-sum__bar" role="img" aria-label="Paid ${money(paid)}, to pay ${money(toPay)}, kept aside ${money(kept)}">${seg(paid, 'a')}${seg(toPay, 'b')}${seg(kept, 'c')}</div><div class="hv-sum__keys">${key('paid', 'a', 'Paid', paid)}${key('topay', 'b', 'To pay', toPay)}${key('aside', 'c', 'Kept aside', kept)}</div></div></div></div>`
    : '';
  const bills_ = [...unpaid, ...done];
  const list = `<div class="hv-shell"><div class="hv-core flush hv-clist">${bills_.length ? `<div class="hv-clabel" data-g="bills">Bills</div>${bills_.map(bill).join('')}` : ''}${progress.length ? `<div class="hv-clabel" data-g="aside">Set aside this month</div>${progress.map(aside).join('')}` : ''}</div></div>`;
  return { box, list };
}
