/* The top of Summary in each style other than Charts (5.9).
 *
 * The styles began (5.6 to 5.8) as paint over the Charts layout, and on a
 * phone they all read as one design. Each now builds Summary's top half the
 * way its mockup does (mockups/5.0): Tactile a raised dial of a card and plain
 * rows, Peaks a pale panel with a donut and the month as mountains, Mindora
 * glass with the week's columns and a face for how the month is going. Every
 * figure is one free-to-spend.js already worked out; nothing is calculated
 * again, only laid out differently. Charts keeps its own (summary.js).
 */

import { formatRupees, formatDateNice } from '../format.js';
import { escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { categoryStyle } from '../category-style.js';
import { categoryIcon } from '../category-icons.js';

/* What is left of the money set aside that Kawach can follow: the same rows
 * free-to-spend.js uses when it works out what is safe to keep spending. */
export function keptBack(f) {
  return (f.tracker || [])
    .filter((t) => t.setAside && !t.skipped && t.left > 0 && ['ok', 'heading-over', 'part'].includes(t.status))
    .reduce((s, t) => s + t.left, 0);
}

/* Dated commitments still to pay this month, soonest first. */
export function comingUp(f) {
  return (f.tracker || [])
    .filter((t) => t.due && !t.setAside && !t.skipped && ['due', 'late', 'part'].includes(t.status))
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .map((t) => ({ label: t.label, due: t.due, late: t.status === 'late', amount: t.status === 'part' && t.left > 0 ? t.left : t.amount }));
}

// The figures every style's top is drawn from. Exported for a test.
export function topFigures(f) {
  const onCard = (c) => Math.max(0, (c.owed || 0) + (c.unpaid || 0));
  const week = (f.spendByDay || []).slice(-7);
  const monthDays = (f.daysIntoCycle || 0) + (f.daysToClose || 1) - 1;
  return {
    left: f.free,
    limit: f.limit,
    spent: Math.max(0, f.spentThisCycle || 0),
    used: Math.max(0, f.used || 0),
    day: f.daysIntoCycle || 0,
    monthDays,
    daysLeft: f.daysToClose || 0,
    perDay: f.perDay,
    until: formatDateNice(f.cycleKey),
    period: `${formatDateNice(f.cycleStart)} to ${formatDateNice(f.cycleKey)}`,
    week,
    weekTotal: week.reduce((s, d) => s + (d.amount || 0), 0),
    owedCards: Math.max(0, ((f.totals && f.totals.owedCards) || 0) + ((f.totals && f.totals.unpaidBills) || 0)),
    cards: (f.cards || []).filter((c) => onCard(c) > 0).map((c) => ({ label: c.account.label || '', amount: onCard(c) })),
    bills: (f.cardBills || []).length,
    employer: (f.reimbursable && f.reimbursable.owed) || 0,
    kept: keptBack(f),
    coming: comingUp(f),
  };
}

const pct = (v) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const dow = (iso) => DOW[new Date(`${iso}T12:00`).getDay()];
const bills = (n) => (n ? `${n} bill${n === 1 ? '' : 's'} due` : '');
const tone = (f) => (f.level === 'over' || f.level === 'critical' ? 'bad' : f.level === 'warning' ? 'caution' : '');

/* --- Tactile: a raised card read like an instrument, then plain rows ----- */
export function tactileTop(f, status) {
  const x = topFigures(f);
  const dayAt = x.monthDays > 0 ? Math.min(1, x.day / x.monthDays) : 0;
  const row = (ic, t, s, v, cls = '', id = '') =>
    `<${id ? `button type="button" id="${id}"` : 'div'} class="tl-item"><span class="tl-ibox">${ic}</span><span class="tl-grow"><span class="tl-t">${t}</span>${s ? `<span class="tl-s">${s}</span>` : ''}</span><span class="tl-v ${cls}">${v}</span>${id ? `<span class="tl-chev">${icon('forward')}</span>` : ''}</${id ? 'button' : 'div'}>`;
  const money = [
    x.kept ? row(categoryIcon('piggy'), 'Kept back', 'set aside, not spent yet', formatRupees(x.kept), '', 'set-aside-stat') : '',
    x.cards.length ? row(icon('card'), 'Owed on cards', x.bills ? `<span class="tl-badge">${bills(x.bills)}</span>` : 'unpaid bills and new spending', formatRupees(x.owedCards)) : '',
    x.employer ? row(categoryIcon('income'), 'Owed back', 'by your employer', formatRupees(x.employer), 'tl-ok') : '',
  ].join('');
  const soon = x.coming.slice(0, 3);
  return `<div class="tl-hero ${f.free < 0 ? 'is-negative' : ''}">
      <div class="tl-k">Left to spend</div>
      <div class="tl-big">${formatRupees(x.left)}</div>
      <div class="tl-sub">of ${formatRupees(x.limit)} · ${x.period}</div>
      <div class="tl-prog"><i class="${tone(f)}" style="width:${pct(x.used)}"></i><span><span>Spent ${formatRupees(x.spent)}</span><span>${pct(x.used)}</span></span></div>
      <div class="tl-slider" role="img" aria-label="Day ${x.day} of ${x.monthDays}">
        <div class="tl-trk"></div><div class="tl-fill" style="width:${pct(dayAt)}"></div><div class="tl-thumb" style="left:${pct(dayAt)}"></div>
        <div class="tl-tip" style="left:${pct(Math.min(0.86, Math.max(0.14, dayAt)))}">Day ${x.day} of ${x.monthDays}</div>
      </div>
      <div class="tl-ticks">${'<i></i>'.repeat(11)}</div>
      <p class="tl-line ${tone(f)}">${escapeHtml(status)}</p>
    </div>
    ${money ? `<div class="tl-list">${money}</div>` : ''}
    ${soon.length ? `<div class="tl-label">Coming up</div><div class="tl-list">${soon.map((c) => row(categoryStyle(c.label).icon, escapeHtml(c.label), `${formatDateNice(c.due)}${c.late ? ' · late' : ''}`, formatRupees(c.amount), c.late ? 'tl-bad' : '')).join('')}</div>` : ''}`;
}

/* --- Peaks: the pale panel with a donut, the mountains, slate cards ------ */
const arc = (r, a0, a1) => {
  const T = (v) => -Math.PI / 2 + v * 2 * Math.PI;
  const p = (a) => [75 + r * Math.cos(T(a)), 75 + r * Math.sin(T(a))];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export function peaksTop(f, status, mountains) {
  const x = topFigures(f);
  // The donut: spent before this week dark, this week in the accent.
  const all = Math.min(0.999, x.used);
  const before = x.limit > 0 ? Math.min(all, Math.max(0, (x.spent - x.weekTotal) / x.limit)) : 0;
  const donut = `<svg class="pk-donut" viewBox="0 0 150 150" aria-hidden="true">
      <circle class="pk-donut__trk" cx="75" cy="75" r="62"/>
      ${before > 0.005 ? `<path class="pk-donut__before" d="${arc(62, 0, before)}"/>` : ''}
      ${all - before > 0.005 ? `<path class="pk-donut__week" d="${arc(62, before + (before > 0.005 ? 0.006 : 0), all)}"/>` : ''}
    </svg>`;
  const sup = (n, unit = '₹') => `${n}<sup>${unit}</sup>`;
  const num = (v) => formatRupees(v).replace('₹', '');
  const cardBars = x.cards.length
    ? `<div class="pk-minibars">${x.cards.map((c) => `<i style="height:${Math.max(10, (c.amount / Math.max(...x.cards.map((k) => k.amount))) * 100).toFixed(0)}%"></i>`).join('')}</div>`
    : '';
  const asideTotal = (f.tracker || []).filter((t) => t.setAside && !t.skipped && t.amount > 0 && t.status !== 'untracked').reduce((s, t) => s + t.amount, 0);
  const keptBar = asideTotal ? `<div class="pk-thin"><i style="width:${pct(x.kept / asideTotal)}"></i></div>` : '';
  const today = f.today || '';
  const monthPos = (iso) => {
    const d = Number(iso.slice(8, 10));
    const last = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0).getDate();
    return pct((d - 1) / Math.max(1, last - 1));
  };
  const soon = x.coming.slice(0, 4);
  return `<div class="pk-panel ${f.free < 0 ? 'is-negative' : ''}">
      <div class="pk-ring">${donut}<div class="pk-ring__mid"><b>${formatRupees(x.left)}</b><small>left</small></div></div>
      <div class="pk-figs">
        <div><div class="pk-n pk-n--l">${sup(Math.round(x.used * 100), '%')}</div><div class="pk-tiny">spent · <span class="pk-hot">${formatRupees(x.weekTotal)} this week</span></div></div>
        <div class="pk-pair">
          <div><div class="pk-n pk-n--m">${x.daysLeft}</div><div class="pk-tiny">days left</div></div>
          <div><div class="pk-n pk-n--m">${x.perDay > 0 ? sup(num(x.perDay)) : '-'}</div><div class="pk-tiny">a day</div></div>
        </div>
      </div>
      <p class="pk-status ${tone(f)}">${escapeHtml(status)}</p>
    </div>
    ${mountains || ''}
    ${x.cards.length || x.kept ? `<div class="pk-two">
      ${x.cards.length ? `<div class="pk-card"><div class="pk-lab">Owed on cards</div><div class="pk-n pk-n--m">${sup(num(x.owedCards))}</div>${cardBars}</div>` : ''}
      ${x.kept ? `<button type="button" class="pk-card" id="set-aside-stat"><div class="pk-lab">Kept back</div><div class="pk-n pk-n--m">${sup(num(x.kept))}</div>${keptBar}</button>` : ''}
    </div>` : ''}
    ${x.employer ? `<div class="pk-card pk-row"><span class="pk-lab">Owed back by your employer</span><span class="pk-n pk-n--s pk-good">${sup(num(x.employer))}</span></div>` : ''}
    ${soon.length ? `<div class="pk-card pk-coming">
      <div class="pk-lab">Coming up</div>
      <div class="pk-dashes">${soon
        .map((c) => `<div class="pk-dash"><span>${escapeHtml(c.label)}</span><span class="pk-ln"><i class="${c.late ? 'late' : ''}" style="left:${monthPos(c.due)}"></i>${today ? `<u style="left:${monthPos(today)}"></u>` : ''}</span><b>${num(c.amount)}</b></div>`)
        .join('')}</div>
      <div class="pk-n pk-n--s pk-still">${sup(num(x.coming.reduce((s, c) => s + c.amount, 0)))}</div><div class="pk-tiny">still to pay</div>
      ${pines()}
    </div>` : ''}`;
}

// Three dark pines with a warm glow behind them, out of the corner of a card.
function pines() {
  const tree = (cx, h, w) => {
    let d = `M${cx} ${150 - h}`;
    const tiers = 6;
    for (let i = 1; i <= tiers; i++) d += ` L${cx + (w * i) / tiers / 2} ${150 - h + (h * i) / tiers} L${cx + ((w * i) / tiers / 2) * 0.45} ${150 - h + (h * i) / tiers}`;
    d += ` L${cx + 2} 150 L${cx - 2} 150`;
    for (let i = tiers; i >= 1; i--) d += ` L${cx - ((w * i) / tiers / 2) * 0.45} ${150 - h + (h * i) / tiers} L${cx - (w * i) / tiers / 2} ${150 - h + (h * i) / tiers}`;
    return `${d} Z`;
  };
  return `<svg class="pk-pines" viewBox="0 0 150 150" aria-hidden="true">
      <circle class="pk-pines__glow" cx="90" cy="88" r="70"/>
      <path class="pk-pines__tree" d="${tree(112, 130, 54)}"/><path class="pk-pines__tree" d="${tree(70, 96, 40)}"/><path class="pk-pines__tree" d="${tree(138, 84, 34)}"/>
    </svg>`;
}

/* --- Mindora: glass, the week's columns, a face for the month ------------ */
// How the month is going, in one of four words: easy (spending well behind
// the month), steady, tight (a warning) or over. Exported for a test.
export function mood(f) {
  if (f.level === 'over' || (f.free != null && f.free < 0)) return 'over';
  if (f.level === 'warning' || f.level === 'critical') return 'tight';
  const monthDays = (f.daysIntoCycle || 0) + (f.daysToClose || 1) - 1;
  const gone = monthDays > 0 ? f.daysIntoCycle / monthDays : 0;
  return (f.used || 0) < gone - 0.1 ? 'easy' : 'steady';
}

const MOODS = [
  ['easy', 'Easy', 2],
  ['steady', 'Steady', 1],
  ['tight', 'Tight', 0],
  ['over', 'Over', -1],
];

const face = (smile) => {
  const y = 20 - smile * 2.4;
  return `<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><path d="M10 ${y} Q15 ${y + smile * 3.4} 20 ${y}"/></svg>`;
};

export function mindoraTop(f, status) {
  const x = topFigures(f);
  const top = Math.max(1, ...x.week.map((d) => d.amount || 0));
  const cols = x.week
    .map((d, i) => `<span><i class="${i === x.week.length - 1 ? 'lit' : ''}" style="height:${Math.max(6, ((d.amount || 0) / top) * 100).toFixed(0)}%"></i><small>${dow(d.date)}</small></span>`)
    .join('');
  const now = mood(f);
  const soon = x.coming.slice(0, 4);
  return `<div class="md-glass md-hero ${f.free < 0 ? 'is-negative' : ''}">
      <div class="md-kick">Left to spend</div>
      <div class="md-big">${formatRupees(x.left)}</div>
      <div class="md-sub">of ${formatRupees(x.limit)} · ${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} left</div>
      ${x.week.length ? `<div class="md-cols" role="img" aria-label="This week ${formatRupees(x.weekTotal)}">${cols}</div>` : ''}
      <div class="md-spent"><span>Spent ${formatRupees(x.spent)}</span><span>${pct(x.used)}</span></div>
      <div class="md-prog"><i class="${tone(f)}" style="width:${pct(x.used)}"></i></div>
    </div>
    <div class="md-glass">
      <div class="md-kick">The month so far</div>
      <div class="md-moods">${MOODS.map(([id, word, smile]) => `<span class="md-mood md-mood--${id}${id === now ? ' on' : ''}"><b>${face(smile)}</b>${word}</span>`).join('')}</div>
      <p class="md-line ${tone(f)}">${escapeHtml(status)}</p>
    </div>
    ${x.kept || x.cards.length || x.employer ? `<div class="md-split">
      ${x.kept ? `<button type="button" class="md-glass md-lake" id="set-aside-stat">${lake()}<span class="md-lake__text"><span class="md-kick">Kept back</span><span class="md-mid">${formatRupees(x.kept)}</span><small>set aside, not spent</small></span></button>` : ''}
      <div class="md-stack">
        ${x.cards.length ? `<div class="md-glass md-small"><div class="md-kick">Owed on cards</div><div class="md-mid">${formatRupees(x.owedCards)}</div>${x.bills ? `<span class="md-badge">${bills(x.bills)}</span>` : ''}</div>` : ''}
        ${x.employer ? `<div class="md-glass md-small"><div class="md-kick">Owed back</div><div class="md-mid md-good">${formatRupees(x.employer)}</div></div>` : ''}
      </div>
    </div>` : ''}
    ${soon.length ? `<div class="md-glass">
      <div class="md-kick">Coming up</div>
      <div class="md-steps">${soon.map((c) => `<div class="md-step${c.late ? ' late' : ''}"><b>${categoryStyle(c.label).icon}</b><small>${formatRupees(c.amount)}<span>${formatDateNice(c.due)}</span></small></div>`).join('')}</div>
    </div>` : ''}`;
}

// A misty lake under hills, in the colouring's own colours.
function lake() {
  return `<svg class="md-lake__art" viewBox="0 0 180 210" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect class="md-lake__sky" width="180" height="210"/>
      <path class="md-lake__far" d="M0 120 L40 88 L70 104 L110 70 L150 98 L180 84 L180 140 L0 140Z"/>
      <path class="md-lake__near" d="M0 140 L30 122 L60 132 L100 112 L140 130 L180 118 L180 150 L0 150Z"/>
      <rect class="md-lake__water" y="150" width="180" height="60"/>
      <rect class="md-lake__mist" y="100" width="180" height="40"/>
    </svg>`;
}
