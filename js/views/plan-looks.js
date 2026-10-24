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
import { lgIco } from './summary-looks.js';

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

export function planTop(f) {
  const parts = planParts(f);
  const bar = (cls) => `<div class="${cls}" role="img" aria-label="${parts.map((p) => `${p.label} ${formatRupees(p.amount)}`).join(', ')}">${parts
    .filter((p) => p.amount > 0)
    .map((p) => `<i class="is-${p.id}" style="flex:${p.amount}"></i>`)
    .join('')}</div>`;
  const amount = `<span class="${f.budget != null && f.budget < 0 ? 'is-negative' : ''}">${f.budget != null ? formatRupees(f.budget) : '-'}</span>`;
  return `<section class="pl-top pl-top--tactile">
      <div class="tl-top"><span class="tl-k">Budget each month</span><span class="tl-period">comes in ${formatRupees(f.income)}</span></div>
      <div class="tl-big">${amount}</div>
      ${bar('pl-seg')}
      <div class="pl-legend">${parts.filter((p) => p.amount > 0).map((p) => `<span><i class="is-${p.id}"></i>${p.label}<em><b>${formatRupees(p.amount)}</b></em></span>`).join('')}</div>
      <p class="tl-line">${escapeHtml(f.status)}</p>
    </section>`;
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
  const day = (t) => (dayOf(t.id) ? ordinal(dayOf(t.id)) : '');
  const word = (t) => {
    const d = day(t);
    if (t.status === 'paid') return `${d ? `${d} · ` : ''}Paid`;
    if (t.status === 'late') return `${d ? `${d} · ` : ''}Late`;
    if (t.status === 'due') return d ? `Due ${d}` : 'Due';
    if (t.status === 'part') return `${d ? `${d} · ` : ''}${money(t.left)} to go`;
    if (t.skipped || t.status === 'skipped') return 'Skipped this month';
    return d;
  };
  // The state of a bill is one tag in one word, never colour alone (the Ledger's tags).
  const tag = (t) => {
    const d = day(t);
    if (t.status === 'paid') return `<span class="lg-tag ok"><span class="lg-tick">${icon('tick')}</span>${d || 'Paid'}</span>`;
    if (t.status === 'late') return `<span class="lg-tag bad">${d ? `Late · ${d}` : 'Late'}</span>`;
    if (t.status === 'due') return `<span class="lg-tag warn">${d ? `Due ${d}` : 'Due'}</span>`;
    if (t.status === 'part') return `<span class="lg-tag warn">${money(t.left)} to go</span>`;
    if (t.skipped || t.status === 'skipped') return '<span class="lg-tag">Skipped</span>';
    return d ? `<span class="lg-tag">${d}</span>` : '<span></span>';
  };
  const said = (t, w) => `${t.label}, ${formatRupees(t.amount)}${w ? `: ${w}` : ''}. Tap for more.`;
  const bill = (t) => {
    if (editingId === t.id) return form(t.id);
    const w = word(t);
    const kind = UNPAID.has(t.status) ? 'topay' : 'paid';
    const check = UNPAID.has(t.status) && markable(t.id)
      ? `<button type="button" class="hv-paycheck" data-pay-step="${escapeHtml(t.id)}" aria-label="Mark ${escapeHtml(t.label)} paid" title="Mark paid"><span class="nest"><span class="hv-ic">${icon('tick')}</span></span></button>`
      : '<span class="hv-paycheck-gap"></span>';
    return `<div class="hv-bill${t.status === 'late' ? ' late' : ''}${kind === 'topay' ? ' no-swipe' : ''}" data-kind="${kind}" data-step="${escapeHtml(t.id)}" data-amt="${t.status === 'part' ? Math.max(0, t.left) : t.amount}" data-can-pay="${check.includes('data-pay-step') ? 1 : 0}">
      <button type="button" class="hv-bill__open lg-row" data-month-item="${escapeHtml(t.id)}" aria-label="${escapeHtml(said(t, w))}">${lgIco(t.label)}<span class="n">${escapeHtml(t.label)}</span>${tag(t)}<span class="amt hv-amt">${money(t.amount)}</span></button>${check}</div>`;
  };
  const aside = (t) => {
    if (editingId === t.id) return form(t.id);
    const used = t.amount > 0 ? Math.max(0, Math.min(1, t.used / t.amount)) : 0;
    const over = t.left < 0;
    const extra = note(t.id);
    const text = (over ? `${money(t.left)} over` : t.left > 0 ? `${money(t.left)} left` : 'Used up') + (extra ? ` · ${extra}` : '');
    return `<div class="hv-bill hv-bill--aside" data-kind="aside" data-step="${escapeHtml(t.id)}"${t.left > 0 && used >= 0.9 ? ' data-near' : ''}>
      <button type="button" class="hv-bill__open lg-row two" data-month-item="${escapeHtml(t.id)}" aria-label="${escapeHtml(`${t.label}, ${money(t.amount)} set aside, ${text}. Tap for more.`)}">${lgIco(t.label)}<span class="nm"><span class="n">${escapeHtml(t.label)}</span><span class="m${over ? ' bad' : ''}">${text}</span></span><span class="amt hv-amt">${money(t.amount)}</span></button><span class="hv-paycheck-gap"></span>
      <div class="lg-edge hv-usedline${t.left <= 0 ? ' full' : ''}${over ? ' warn' : ''}" aria-hidden="true"><i style="width:${(used * 100).toFixed(0)}%"></i></div></div>`;
  };
  const paid = done.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
  const toPay = unpaid.reduce((s, t) => s + (t.status === 'part' ? Math.max(0, t.left) : t.amount), 0);
  const kept = progress.reduce((s, t) => s + Math.max(0, t.left), 0);
  const key = (f, cls, label, v) => `<button type="button" data-f="${f}"><span><i class="${cls}"></i>${label}</span><b class="hv-amt">${money(v)}</b></button>`;
  const seg = (v, cls) => (v > 0 ? `<i class="${cls}" style="flex:${v}"></i>` : '');
  const box = paid + toPay + kept > 0
    ? `<div class="hv-screen lg-monthbox" data-hv-box><div class="lg-card hv-sum"><div class="lg-month__h"><h2>This month</h2><span>tap a figure to filter</span></div><div class="hv-sum__bar" role="img" aria-label="Paid ${money(paid)}, to pay ${money(toPay)}, kept aside ${money(kept)}">${seg(paid, 'a')}${seg(toPay, 'b')}${seg(kept, 'c')}</div><div class="hv-sum__keys">${key('paid', 'a', 'Paid', paid)}${key('topay', 'b', 'To pay', toPay)}${key('aside', 'c', 'Kept aside', kept)}</div></div></div>`
    : '';
  // What is still to do comes first (bills not yet paid, then what is set aside and being used), what is finished comes last.
  const list = `<div class="lg-card lg-clist hv-clist">${unpaid.map(bill).join('')}${progress.length ? `<div class="hv-clabel" data-g="aside">Set aside this month</div>${progress.map(aside).join('')}` : ''}${done.length ? `<div class="hv-clabel" data-g="paid">Paid and skipped</div>${done.map(bill).join('')}` : ''}</div>`;
  return { box, list };
}
