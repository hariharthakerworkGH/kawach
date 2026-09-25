/* The six drawings the app is allowed (design.md section 9). Each one answers
 * a question a number cannot; a seventh gets written into design.md first.
 *
 * Rules kept here, not left to the screen:
 *   - the figure comes first and the drawing explains it, so every drawing
 *     returns its own short sentence underneath;
 *   - no axes, no gridlines, no legend unless two things are compared;
 *   - nothing is drawn under three points of data - the caller gets '' back
 *     and shows its sentence instead;
 *   - never a pie;
 *   - colours come from css/tokens.css by name, never a raw value;
 *   - every drawing carries a plain-English aria-label, because a drawing a
 *     screen reader cannot read is a drawing that isn't there.
 *
 * Plain SVG strings. No library, nothing fetched, nothing to install.
 */
import { formatRupees } from './format.js';

// Three points is the smallest honest line or set of bars.
const MIN_POINTS = 3;

function esc(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function note(text) {
  return `<p class="chart-note">${text}</p>`;
}

// One shape for every drawing: it fills the width it is given and keeps its
// proportions, so nothing inside it is stretched.
function frame(inner, { label, viewBox = '0 0 300 84', className = '' }) {
  return `<svg class="chart ${className}" viewBox="${viewBox}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
}

/* --- 05 Budget burn ---------------------------------------------------
 * Answers: am I ahead or behind for this point in the period?
 *   totals   cumulative spending, one figure per day gone by (paise)
 *   budget   the budget for the whole period (paise)
 *   days     how many days the period has
 * The dashed line is an even pace; the solid line is you.
 */
export function burnLine({ totals = [], budget = 0, days = 0 }) {
  // Not in the first three days of a period, and not when nothing has been
  // spent: a flat line along the bottom answers nothing the figure hasn't.
  if (totals.length < MIN_POINTS || !budget || days < MIN_POINTS) return '';
  if (!(totals[totals.length - 1] > 0)) return '';
  const W = 300;
  const H = 84;
  const pad = 6;
  const spent = totals[totals.length - 1];
  const top = Math.max(budget, spent) || 1;
  const x = (i) => (days <= 1 ? 0 : (i / (days - 1)) * W);
  const y = (v) => H - pad - (v / top) * (H - pad * 2);
  const path = smoothPath(totals.map((t, i) => [x(i), y(t)]));
  const last = { x: x(totals.length - 1), y: y(spent) };
  const area = `${path} L${last.x.toFixed(1)} ${H} L0 ${H} Z`;
  // Where an even pace would have you by today, and by how much you are off.
  const evenSoFar = Math.round((budget * totals.length) / days);
  const diff = evenSoFar - spent;
  const sentence =
    diff >= 0
      ? `You are <b>${formatRupees(diff)} under</b> the even pace for today.`
      : `You are <b>${formatRupees(-diff)} over</b> the even pace for today.`;
  const drawing = frame(
    `<defs><linearGradient id="burn-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.2"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient></defs>
      <line x1="0" y1="${H - pad}" x2="${W}" y2="${y(budget).toFixed(1)}" stroke="var(--text-dim)" stroke-width="2" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/>
      <path d="${area}" fill="url(#burn-fade)"/>
      <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5.5" fill="var(--accent)" opacity="0.18" vector-effect="non-scaling-stroke"/>
      <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3" fill="var(--accent)" vector-effect="non-scaling-stroke"/>`,
    {
      label: `Spending so far is ${formatRupees(spent)} of a ${formatRupees(budget)} budget, ${diff >= 0 ? 'under' : 'over'} an even pace by ${formatRupees(Math.abs(diff))}.`,
    }
  );
  return `<div class="chart-block">${drawing}${note(sentence)}</div>`;
}

/* --- 04 Where the budget is committed ---------------------------------
 * Answers: how much of this month is already spoken for?
 * One bar, three parts, always in this order: must go out, can flex, free.
 *
 * `legend` names the three figures underneath. A screen that lists those same
 * figures as rows turns it off: a bar and a row list must never print the same
 * number twice (design.md section 9).
 */
export function committedBar({ must = 0, flex = 0, free = 0, legend = true }) {
  const total = must + flex + Math.max(0, free);
  if (total <= 0) return '';
  const pct = (v) => `${((Math.max(0, v) / total) * 100).toFixed(1)}%`;
  return `<div class="chart-block">
      <div class="committed-bar" role="img" aria-label="Of ${formatRupees(total)}, ${formatRupees(must)} must go out, ${formatRupees(flex)} can flex and ${formatRupees(Math.max(0, free))} is free.">
        <i class="committed-must" style="width:${pct(must)}"></i>
        <i class="committed-flex" style="width:${pct(flex)}"></i>
        <i class="committed-free" style="width:${pct(free)}"></i>
      </div>
      ${!legend ? '' : `<p class="chart-note committed-legend">
        ${[
          must > 0 ? `<span><i class="key key-must"></i>${formatRupees(must)} must</span>` : '',
          flex > 0 ? `<span><i class="key key-flex"></i>${formatRupees(flex)} flex</span>` : '',
          free > 0 ? `<span><i class="key key-free"></i>${formatRupees(free)} free</span>` : '',
        ].join('')}
      </p>`}
    </div>`;
}

/* --- 06 Where it went -------------------------------------------------
 * Answers: which categories took the money?
 * Top five, longest first, then everything else. Never a pie.
 *   items  [{ name, amount, colour }] colour being a token, e.g. var(--cat-food)
 *   compact  true on a list screen, where the bar supports the row and
 *            never overpowers it (design.md section 9, Categories).
 */
export function categoryBars({ items = [], compact = false, top = 5 }) {
  const real = items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
  if (!real.length) return '';
  const shown = real.slice(0, top);
  const rest = real.slice(top);
  const restTotal = rest.reduce((s, i) => s + i.amount, 0);
  const rows = [...shown, ...(restTotal ? [{ name: 'Everything else', amount: restTotal, colour: 'var(--text-dim)' }] : [])];
  const biggest = rows[0].amount || 1;
  const total = real.reduce((s, i) => s + i.amount, 0);
  const label = `Spending by category. ${rows.map((r) => `${r.name} ${formatRupees(r.amount)}`).join(', ')}.`;
  return `<div class="chart-block cat-bars ${compact ? 'cat-bars-compact' : ''}" role="img" aria-label="${esc(label)}">
      ${rows
        .map(
          (r) => `<div class="cat-bar-row">
          <span class="cat-bar-name">${esc(r.name)}</span>
          <span class="cat-bar-track"><i style="width:${((r.amount / biggest) * 100).toFixed(1)}%;background:${r.colour || 'var(--emerald)'}"></i></span>
          <span class="cat-bar-value">${formatRupees(r.amount)}</span>
        </div>`
        )
        .join('')}
      ${compact ? '' : note(`${formatRupees(total)} in all, biggest first.`)}
    </div>`;
}

/* --- 11 Goal progress -------------------------------------------------
 * Answers: how far along is this goal, and what does it cost a month?
 * The only ring in the app, and never used to compare two things.
 */
export function goalRing({ saved = 0, target = 0, size = 76, monthly = null, by = '' }) {
  if (!target) return '';
  const share = Math.max(0, Math.min(1, saved / target));
  const r = size / 2 - 6;
  const circumference = 2 * Math.PI * r;
  const label = `${Math.round(share * 100)} per cent saved: ${formatRupees(saved)} of ${formatRupees(target)}${by ? ` by ${by}` : ''}.`;
  return `<svg class="goal-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-hi)" stroke-width="7"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${(circumference * share).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="${size / 2}" y="${size / 2 + 5}" text-anchor="middle" fill="var(--text)" font-size="${Math.round(size / 4.6)}" font-weight="700">${Math.round(share * 100)}%</text>
      ${monthly ? `<title>${esc(`${formatRupees(monthly)} a month gets there`)}</title>` : ''}
    </svg>`;
}

/* --- 07 Money in and out, six months ----------------------------------
 * Answers: is this month normal for me?
 * The one drawing with a legend, because two things are being compared.
 *   months  [{ label, in, out }] oldest first
 */
export function inOutBars({ months = [] }) {
  const real = months.filter((m) => m.in > 0 || m.out > 0);
  if (real.length < MIN_POINTS) return '';
  const W = 300;
  const H = 84;
  const base = H - 14;
  const top = Math.max(...real.map((m) => Math.max(m.in, m.out))) || 1;
  const slot = W / real.length;
  const barW = Math.min(12, slot / 3.2);
  const h = (v) => Math.max(2, (v / top) * (base - 6));
  const bars = real
    .map((m, i) => {
      const cx = i * slot + slot / 2;
      const inH = h(m.in);
      const outH = h(m.out);
      return `<rect x="${(cx - barW - 1).toFixed(1)}" y="${(base - inH).toFixed(1)}" width="${barW.toFixed(1)}" height="${inH.toFixed(1)}" rx="3" fill="var(--in)"/>
        <rect x="${(cx + 1).toFixed(1)}" y="${(base - outH).toFixed(1)}" width="${barW.toFixed(1)}" height="${outH.toFixed(1)}" rx="3" fill="var(--out)"/>
        <text x="${cx.toFixed(1)}" y="${H - 2}" text-anchor="middle" font-size="9" fill="var(--text-dim)">${esc(m.label)}</text>`;
    })
    .join('');
  const last = real[real.length - 1];
  const sentence =
    last.out > last.in
      ? `${esc(last.label)} spends <b>${formatRupees(last.out - last.in)} more</b> than it takes in.`
      : `${esc(last.label)} keeps <b>${formatRupees(last.in - last.out)}</b> of what came in.`;
  const label = `Money in and out over ${real.length} months. ${real.map((m) => `${m.label}: in ${formatRupees(m.in)}, out ${formatRupees(m.out)}`).join('. ')}.`;
  const drawing = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
      ${bars}
      <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--border)" stroke-width="1" vector-effect="non-scaling-stroke"/>
    </svg>`;
  return `<div class="chart-block">${drawing}
      <p class="chart-note in-out-legend"><span><i class="key key-in"></i>in</span><span><i class="key key-out"></i>out</span><span>${sentence}</span></p>
    </div>`;
}

/* --- 12 Runway --------------------------------------------------------
 * Answers: if money stopped coming in, how long would I last?
 * For uneven income - a business, a shop - not for a steady salary.
 */
export function runwayBar({ covered = 0, needPerMonth = 0, have = 0, max = 6 }) {
  if (!needPerMonth || covered <= 0) return '';
  const whole = Math.min(max, Math.floor(covered));
  const part = Math.min(1, covered - whole);
  const segments = [];
  for (let i = 0; i < whole; i += 1) segments.push(`<i style="opacity:${(1 - i * 0.14).toFixed(2)}"></i>`);
  if (part > 0.05 && whole < max) segments.push(`<i class="runway-part" style="flex:${part.toFixed(2)};opacity:${(1 - whole * 0.14).toFixed(2)}"></i>`);
  const months = covered >= max ? `${max}+ months` : covered < 1 ? 'under a month' : `${covered.toFixed(1).replace('.0', '')} months`;
  const label = `${months} of spending is covered by ${formatRupees(have)}, at ${formatRupees(needPerMonth)} a month.`;
  return `<div class="chart-block">
      <div class="runway-bar" role="img" aria-label="${esc(label)}">${segments.join('')}</div>
      ${note(`<b>${months}</b> covered by what you hold, at ${formatRupees(needPerMonth)} a month.`)}
    </div>`;
}

// A line through points, curved gently. Each control point is placed a fifth
// of the way towards its neighbour, which is enough to take the corners off
// without inventing peaks the data never had - a chart of someone's money
// must not draw a spike that is not there.
function smoothPath(points) {
  if (points.length < 3) return points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const dx = (x1 - x0) / 5;
    d += ` C${(x0 + dx).toFixed(1)} ${y0.toFixed(1)}, ${(x1 - dx).toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}
