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
const pct = (v) => `${Math.round(v * 100)}%`;

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
  if (style === 'tactile') {
    return `<section class="pl-top pl-top--tactile">
        <div class="tl-top"><span class="tl-k">Budget each month</span><span class="tl-period">comes in ${formatRupees(f.income)}</span></div>
        <div class="tl-big">${amount}</div>
        ${bar('pl-seg')}
        <div class="pl-legend">${parts.map((p) => `<span><i class="is-${p.id}"></i>${p.label}<em><b>${formatRupees(p.amount)}</b></em></span>`).join('')}</div>
        <p class="tl-line">${escapeHtml(f.status)}</p>
      </section>`;
  }
  if (style === 'peaks') {
    // The donut: each part an arc in its own colour, round the budget.
    let at = 0;
    const T = (v) => -Math.PI / 2 + v * 2 * Math.PI;
    const p = (a) => [75 + 62 * Math.cos(T(a)), 75 + 62 * Math.sin(T(a))];
    const arcs = parts
      .filter((x) => x.share > 0.004)
      .map((x) => {
        const a0 = at;
        const a1 = Math.min(0.999, at + x.share);
        at = a1 + 0.006;
        const [x0, y0] = p(a0);
        const [x1, y1] = p(Math.max(a0, a1 - 0.006));
        return `<path class="pl-donut__${x.id}" d="M${x0.toFixed(2)} ${y0.toFixed(2)} A62 62 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}"/>`;
      })
      .join('');
    const sup = (v) => `${formatRupees(v).replace('₹', '')}<sup>₹</sup>`;
    return `<section class="pk-panel pl-top pl-top--peaks">
        <div class="pk-top"><span class="pk-lab">Budget each month</span><span class="pk-tiny">comes in ${formatRupees(f.income)}</span></div>
        <div class="pk-ring"><svg class="pk-donut" viewBox="0 0 150 150" aria-hidden="true"><circle class="pk-donut__trk" cx="75" cy="75" r="62"/>${arcs}</svg>
          <div class="pk-ring__mid"><b>${amount}</b><small>budget</small></div></div>
        <div class="pk-figs pl-figs">${parts.map((x) => `<div><div class="pk-n pk-n--s">${sup(x.amount)}</div><div class="pk-tiny"><i class="pl-key is-${x.id}"></i>${x.label.toLowerCase()}</div></div>`).join('')}</div>
        <p class="pk-status">${escapeHtml(f.status)}</p>
      </section>`;
  }
  return `<section class="md-glass md-hero pl-top pl-top--mindora">
      <div class="md-top"><span class="md-kick">Budget each month</span><span class="md-period">comes in ${formatRupees(f.income)}</span></div>
      <div class="md-big">${amount}</div>
      ${bar('pl-line')}
      <div class="pl-badges">${parts.map((x) => `<span class="is-${x.id}">${x.label} ${formatRupees(x.amount)}</span>`).join('')}</div>
      <p class="md-line">${escapeHtml(f.status)}</p>
    </section>`;
}

/* The month's must-go-outs, as the style draws them. `rows` are plan.js's
 * own: { label, day, amount, state: 'paid' | 'due' | 'late' }. */
export function planMonth(style, rows, now = new Date()) {
  if (!rows.length) return '';
  const today = now.getDate();
  const said = (r) => `${r.label}, ${formatRupees(r.amount)} on the ${ordinal(r.day)}: ${r.state === 'paid' ? 'paid' : r.state === 'late' ? 'late' : 'still to pay'}`;
  if (style === 'peaks') {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const at = (d) => pct((Math.min(d, days) - 1) / Math.max(1, days - 1));
    return `<div class="pk-card pl-month"><div class="pk-dashes">${rows
      .map((r) => `<div class="pk-dash" title="${escapeHtml(said(r))}"><span class="pk-dash__t">${escapeHtml(r.label)}<small>${ordinal(r.day)}</small></span><span class="pk-ln"><i class="${r.state === 'late' ? 'late' : r.state === 'paid' ? 'paid' : ''}" style="left:${at(r.day)}"></i><u style="left:${at(today)}"></u></span><b class="${r.state === 'late' ? 'pl-late' : ''}">${r.state === 'late' ? 'late' : formatRupees(r.amount).replace('₹', '')}</b></div>`)
      .join('')}</div></div>`;
  }
  // Steps on a line: done ticked, late marked, still to pay showing its
  // icon (Tactile) or its day (Mindora). Many of them scroll sideways.
  const done = rows.filter((r) => r.state === 'paid').length;
  const step = (r) => {
    const mark = r.state === 'paid' ? icon('check') : r.state === 'late' ? icon('alert') : style === 'tactile' ? categoryStyle(r.label).icon : `${r.day}`;
    return `<div class="pl-step is-${r.state}" title="${escapeHtml(said(r))}"><b>${mark}</b><small><strong>${escapeHtml(r.label)}</strong>${ordinal(r.day)}<span>${formatRupees(r.amount)}</span></small></div>`;
  };
  return `<div class="pl-month pl-month--${style}">
      <div class="pl-steps no-swipe" style="--pl-n:${rows.length}; --pl-done:${done}">${rows.map(step).join('')}</div>
      <p class="pl-today">Today is the ${ordinal(today)} · ${done} of ${rows.length} paid</p>
    </div>`;
}
