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
  if (style === 'tactile' || style === 'instrument') {
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
  if (style === 'instrument') style = 'tactile';
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
