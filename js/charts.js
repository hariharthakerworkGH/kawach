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
export function burnLine({ totals = [], budget = 0, days = 0, shortfall = 0 }) {
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
  // The pace is the pace: being under it is true and the line says so. But a
  // cycle can be comfortably under pace while the bank still cannot cover
  // what is already owed, and a drawing that stops at the happy half of that
  // is the screen contradicting its own headline. The figure is handed in,
  // never worked out here - free-to-spend.js is the only place that decides
  // what is owed.
  const pace =
    diff >= 0
      ? `You are <b>${formatRupees(diff)} under</b> the even pace for today.`
      : `You are <b>${formatRupees(-diff)} over</b> the even pace for today.`;
  const sentence = shortfall > 0 ? `${pace} Even so, <b>${formatRupees(shortfall)}</b> of what you owe is not covered.` : pace;
  const drawing = frame(
    `<defs><linearGradient id="burn-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--k-accent)" stop-opacity="0.26"/>
        <stop offset="1" stop-color="var(--k-accent)" stop-opacity="0"/>
      </linearGradient></defs>
      <line x1="0" y1="${H - pad}" x2="${W}" y2="${y(budget).toFixed(1)}" class="chart-pace" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/>
      <path d="${area}" fill="url(#burn-fade)"/>
      <path d="${path}" fill="none" class="chart-line" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle class="chart-dot-halo" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="6" vector-effect="non-scaling-stroke"/>
      <circle class="chart-dot" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.6" vector-effect="non-scaling-stroke"/>`,
    {
      label: `Spending so far is ${formatRupees(spent)} of a ${formatRupees(budget)} budget, ${diff >= 0 ? 'under' : 'over'} an even pace by ${formatRupees(Math.abs(diff))}.${
        shortfall > 0 ? ` ${formatRupees(shortfall)} of what is owed is not covered.` : ''
      }`,
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
 *   items  [{ name, amount, colour }] colour being a token, e.g. var(--k-cyan)
 *   compact  true on a list screen, where the bar supports the row and
 *            never overpowers it (design.md section 9, Categories).
 */
export function categoryBars({ items = [], compact = false, top = 5 }) {
  const real = items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
  if (!real.length) return '';
  const shown = real.slice(0, top);
  const rest = real.slice(top);
  const restTotal = rest.reduce((s, i) => s + i.amount, 0);
  const rows = [...shown, ...(restTotal ? [{ name: 'Everything else', amount: restTotal, colour: 'var(--k-text-3)' }] : [])];
  const biggest = rows[0].amount || 1;
  const total = real.reduce((s, i) => s + i.amount, 0);
  const label = `Spending by category. ${rows.map((r) => `${r.name} ${formatRupees(r.amount)}`).join(', ')}.`;
  return `<div class="chart-block cat-bars ${compact ? 'cat-bars-compact' : ''}" role="img" aria-label="${esc(label)}">
      ${rows
        .map(
          (r) => `<div class="cat-bar-row">
          <span class="cat-bar-name">${esc(r.name)}</span>
          <span class="cat-bar-track"><i style="width:${((r.amount / biggest) * 100).toFixed(1)}%;background:${r.colour || 'var(--k-positive)'}"></i></span>
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
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="chart-ring-track"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="chart-ring-fill" stroke-linecap="round"
        stroke-dasharray="${(circumference * share).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="${size / 2}" y="${size / 2 + 5}" text-anchor="middle" fill="var(--k-text)" font-size="${Math.round(size / 4.6)}" font-weight="700">${Math.round(share * 100)}%</text>
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
  // A gutter each side, or the first and last month are drawn on the frame
  // and their labels get cut off.
  const pad = 12;
  const slot = (W - pad * 2) / real.length;
  const barW = Math.min(7, slot / 5);
  const h = (v) => Math.max(barW, (v / top) * (base - 6));
  const bars = real
    .map((m, i) => {
      const cx = pad + i * slot + slot / 2;
      const inH = h(m.in);
      const outH = h(m.out);
      const gap = barW * 0.62;
      const full = base - 6;
      const track = (x) => `<rect class="bar-track" x="${x}" y="${(base - full).toFixed(1)}" width="${barW.toFixed(1)}" height="${full.toFixed(1)}" rx="${(barW / 2).toFixed(1)}"/>`;
      const xi = (cx - barW - gap).toFixed(1);
      const xo = (cx + gap).toFixed(1);
      return `${track(xi)}${track(xo)}
        <rect class="bar-in" x="${xi}" y="${(base - inH).toFixed(1)}" width="${barW.toFixed(1)}" height="${inH.toFixed(1)}" rx="${(barW / 2).toFixed(1)}"/>
        <rect class="bar-out" x="${xo}" y="${(base - outH).toFixed(1)}" width="${barW.toFixed(1)}" height="${outH.toFixed(1)}" rx="${(barW / 2).toFixed(1)}"/>
        <text class="chart-tick" x="${cx.toFixed(1)}" y="${H - 2}" text-anchor="middle">${esc(m.label)}</text>`;
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
/* ======================================================================
   Design Lab 2.0 drawings (phase 12)

   Four more, each answering a question the figure beside it cannot. They
   take figures already worked out by js/free-to-spend.js and the account
   modules; not one of them does arithmetic on money beyond turning a pair of
   paise figures into a share of a circle.

   The "never a pie" rule above stands for comparing quantities. A ring is
   allowed here for one job only - showing how a total splits - and always
   with the figures listed beside it, so nothing has to be judged by the
   angle of a slice.
   ====================================================================== */

const HUES = ['var(--k-cyan)', 'var(--k-violet)', 'var(--k-magenta)', 'var(--k-positive)', 'var(--k-warning)', 'var(--k-cyan-deep)'];

/* --- 07 Where the money sits ------------------------------------------
 * Answers: how is what I have split across my accounts?
 *   slices  [{ label, amount }] paise, any order; zero and negative dropped
 *   centre  what to write in the hole (already formatted)
 *   caption the line under the ring
 * The ring is the shape; the legend carries the figures, and the legend's
 * figures are the ones that must add up.
 */
export function allocationRing({ slices = [], centre = '', caption = '', size = 132 }) {
  const parts = slices.filter((s) => Number.isFinite(s.amount) && s.amount > 0);
  if (parts.length < 2) return '';
  const total = parts.reduce((sum, s) => sum + s.amount, 0);
  if (!(total > 0)) return '';

  const r = size / 2 - 11;
  const circ = 2 * Math.PI * r;
  let at = 0;
  const ring = parts
    .map((part, i) => {
      const share = part.amount / total;
      const len = circ * share;
      // A hair of a gap so two slices never look like one.
      const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
        stroke="${HUES[i % HUES.length]}" stroke-width="11"
        stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(circ - len + 1.5).toFixed(2)}"
        stroke-dashoffset="${(-at).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      at += len;
      return seg;
    })
    .join('');

  const legend = parts
    .map(
      (part, i) =>
        `<span class="alloc-item"><i class="alloc-dot" style="background:${HUES[i % HUES.length]}"></i>
          <span class="alloc-name">${esc(part.label)}</span>
          <span class="alloc-val">${formatRupees(part.amount)}</span></span>`
    )
    .join('');

  const label = `Split across ${parts.length} accounts: ${parts.map((x) => `${x.label} ${formatRupees(x.amount)}`).join(', ')}.`;
  return `<div class="alloc">
      <svg class="alloc-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="chart-ring-track" stroke-width="11"/>
        ${ring}
      </svg>
      ${centre ? `<div class="alloc-centre"><span class="alloc-centre-v">${centre}</span></div>` : ''}
      <div class="alloc-legend">${legend}</div>
    </div>${caption ? note(caption) : ''}`;
}

/* --- 08 How much of the month is spoken for ---------------------------
 * Answers: before I decide anything, how much is already committed?
 *   committed  paise already promised
 *   income     paise the month has to work with
 * Guards: no income, nothing committed, and more committed than there is.
 */
export function radialMeter({ committed = 0, income = 0, size = 150 }) {
  if (!Number.isFinite(committed) || !Number.isFinite(income) || income <= 0) return '';
  const raw = committed / income;
  const share = Math.max(0, Math.min(1, raw));
  const over = raw > 1;
  const pct = Math.round(raw * 100);
  const left = income - committed;

  const r = size / 2 - 12;
  const circ = 2 * Math.PI * r;
  const label = `${pct} per cent of the month is committed: ${formatRupees(committed)} of ${formatRupees(income)}.`;
  return `<div class="meter-radial">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="chart-ring-track" stroke-width="12"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="12" stroke-linecap="round"
          stroke="${over ? 'var(--k-negative)' : 'url(#kMeterGrad)'}"
          stroke-dasharray="${(circ * share).toFixed(1)} ${circ.toFixed(1)}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
        <defs><linearGradient id="kMeterGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--k-cyan)"/><stop offset="100%" stop-color="var(--k-violet)"/>
        </linearGradient></defs>
      </svg>
      <div class="meter-radial-mid">
        <span class="meter-radial-v${over ? ' over' : ''}">${pct}%</span>
        <span class="meter-radial-k">committed</span>
      </div>
    </div>
    <div class="meter-radial-legend">
      <span><span class="muted">Committed</span> ${formatRupees(committed)}</span>
      <span><span class="muted">${left < 0 ? 'Over by' : 'Left to plan'}</span> ${formatRupees(Math.abs(left))}</span>
    </div>`;
}

/* --- 09 When the money goes -------------------------------------------
 * Answers: where in this period does my spending actually happen?
 *   days   [{ date, amount }] one entry a day, oldest first (paise)
 *   today  the date to light up
 * A quiet day keeps a stub so it reads as "almost nothing", never as a gap
 * in the data.
 */
export function spendingPulse({ days = [], today = '' }) {
  const usable = days.filter((d) => d && Number.isFinite(d.amount));
  if (usable.length < MIN_POINTS) return '';
  const peak = usable.reduce((m, d) => Math.max(m, d.amount), 0);
  if (!(peak > 0)) return '';
  const biggest = usable.reduce((a, b) => (b.amount > a.amount ? b : a), usable[0]);

  const bars = usable
    .map((d) => {
      const h = Math.round((d.amount / peak) * 100);
      const cls = d.date === biggest.date ? ' pulse-bar--peak' : d.amount <= peak * 0.06 ? ' pulse-bar--quiet' : '';
      const mark = d.date === today ? ' pulse-bar--today' : '';
      return `<i class="pulse-bar${cls}${mark}" style="--h:${Math.max(3, h)}%"></i>`;
    })
    .join('');

  const when = new Date(biggest.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const label = `Daily spending across the period. The biggest day is ${when}, ${formatRupees(biggest.amount)}.`;
  return `<div class="pulse" role="img" aria-label="${esc(label)}">${bars}</div>
    ${note(`Biggest day: <b>${esc(when)}, ${formatRupees(biggest.amount)}</b>`)}`;
}

/* --- 10 Money in against money out ------------------------------------
 * Answers: is more coming in than going out, and how has that changed?
 *   months  [{ label, in, out }] oldest first (paise)
 * Two lines on a scale zoomed to the data, with the gap between them
 * shaded: the gap is what was kept, so the answer is the subject of the
 * picture. Only the gap is filled - shading to a baseline the axis does not
 * start at is the lie this kind of chart usually tells.
 */
export function cashRiver({ months = [] }) {
  const pts = months.filter((m) => m && Number.isFinite(m.in) && Number.isFinite(m.out));
  if (pts.length < MIN_POINTS) return '';
  const values = pts.flatMap((m) => [m.in, m.out]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, hi || 1);
  const W = 300;
  const H = 110;
  const x = (i) => 12 + (i / (pts.length - 1)) * (W - 24);
  const y = (v) => 96 - ((v - lo) / span) * 74;

  const line = (key) => pts.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`).join(' ');
  const band =
    pts.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m.in).toFixed(1)}`).join(' ') +
    ' ' +
    pts
      .slice()
      .reverse()
      .map((m, i) => `L${x(pts.length - 1 - i).toFixed(1)},${y(m.out).toFixed(1)}`)
      .join(' ') +
    ' Z';

  const last = pts[pts.length - 1];
  const kept = last.in - last.out;
  const label = `Money in against money out over ${pts.length} months. Latest: ${formatRupees(last.in)} in, ${formatRupees(last.out)} out.`;
  const inner = `<path d="${band}" fill="${kept >= 0 ? 'color-mix(in oklch, var(--k-positive) 16%, transparent)' : 'color-mix(in oklch, var(--k-negative) 16%, transparent)'}"/>
      <path d="${line('in')}" fill="none" stroke="var(--k-positive)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <path d="${line('out')}" fill="none" stroke="var(--k-negative)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.in).toFixed(1)}" r="3" fill="var(--k-positive)"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(last.out).toFixed(1)}" r="3" fill="var(--k-negative)"/>
      ${pts.map((m, i) => `<text class="chart-tick" x="${x(i).toFixed(1)}" y="108" text-anchor="middle">${esc(m.label)}</text>`).join('')}`;

  return `${frame(inner, { label, viewBox: `0 0 ${W} ${H}` })}
    <div class="river-legend">
      <span><i class="river-dot" style="background:var(--k-positive)"></i>In</span>
      <span><i class="river-dot" style="background:var(--k-negative)"></i>Out</span>
      <span><i class="river-band" ></i>${kept >= 0 ? 'Kept' : 'Short'} ${formatRupees(Math.abs(kept))}</span>
    </div>`;
}
