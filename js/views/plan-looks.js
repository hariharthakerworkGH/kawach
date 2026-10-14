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
  if (style === 'tactile' || style === 'instrument' || style === 'haven') {
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

/* --- Haven (5.52): "Still to pay this month", as the prototype draws it ----------------------------------------
 * Each cost still to pay is a small card of its own: its gem, its name, its day and whether it is late, its amount and
 * a "Mark paid" button (only for what Kawach can mark: a cost you added yourself). Tapping the rest of the card opens
 * what can be done with it (skip, see its payments, edit). What is paid or skipped folds under one line.
 * `rows` are plan.js's own: { id, label, day, amount, state }. Exported for a test. */
export function havenMonth(rows, { canMark = () => false } = {}) {
  const open = rows.filter((r) => r.state === 'due' || r.state === 'late');
  const finished = rows.filter((r) => r.state === 'paid' || r.state === 'skipped').sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
  const gem = (label) => `<span class="hv-gem hv-g${gemNo(label)}"><span class="hv-ic">${categoryStyle(label).icon}</span></span>`;
  const money = (p) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
  const said = (r) => `${r.label}, ${formatRupees(r.amount)} on the ${ordinal(r.day)}: ${r.state === 'late' ? 'late' : 'still to pay'}. Tap for more.`;
  // One line each: what, when, how much, and a tick to say it is paid (only for a cost you added yourself; the rest
  // open what can be done with them).
  const step = (r) => `<div class="hv-bill${r.state === 'late' ? ' late' : ''}" data-step="${escapeHtml(r.id)}">
      <button type="button" class="hv-bill__open" data-month-item="${escapeHtml(r.id)}" aria-label="${escapeHtml(said(r))}">${gem(r.label)}<span class="hv-bill__name"><b>${escapeHtml(r.label)}</b><span class="hv-row__m">${ordinal(r.day)} · ${r.state === 'late' ? 'Late' : 'Due'}</span></span><span class="hv-bill__amt hv-amt">${money(r.amount)}</span></button>
      ${canMark(r.id) ? `<button type="button" class="hv-paycheck" data-pay-step="${escapeHtml(r.id)}" aria-label="Mark ${escapeHtml(r.label)} paid" title="Mark paid"><span class="nest"><span class="hv-ic">${icon('tick')}</span></span></button>` : '<span class="hv-paycheck-gap"></span>'}
    </div>`;
  const done = (r) => `<button type="button" class="hv-row" data-month-item="${escapeHtml(r.id)}">${gem(r.label)}<div><div class="hv-row__t">${escapeHtml(r.label)}</div><div class="hv-row__m">${r.state === 'skipped' ? 'Skipped this month' : `Paid · ${ordinal(r.day)}`}</div></div><div class="hv-row__v hv-amt">${money(r.amount)}</div></button>`;
  const head = `<div class="hv-sec"><h2>Still to pay this month</h2><span class="hv-muted" id="hv-left-count">${open.length ? `${open.length} left` : 'all paid'}</span></div>`;
  const body = `<div class="hv-shell"><div class="hv-core flush"><div class="hv-bills no-swipe" id="hv-steps">${open.length ? open.map(step).join('') : '<p class="hv-muted" style="padding:14px 16px">Everything is paid for this month.</p>'}</div>${
    finished.length
      ? `<button type="button" class="hv-chev-row" data-hv-fold aria-expanded="false"><span>Paid or skipped (${finished.length})</span><span class="hv-chev"><span class="hv-ic">${icon('chevdown')}</span></span></button><div class="hv-fold"><div>${finished.map(done).join('')}</div></div>`
      : ''
  }</div></div>`;
  return `<div class="hv-screen hv-plan-month" data-hv-plan-month>${head}${body}</div>`;
}
