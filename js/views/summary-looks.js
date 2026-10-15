/* The top of Summary in each style (5.9, made identical in what it says in
 * 5.10).
 *
 * The styles began (5.6 to 5.8) as paint over the Charts layout, and on a
 * phone they all read as one design, so each lays out Summary's top half
 * the way its mockup does (mockups/5.0): Tactile a raised instrument and
 * plain rows, Instrument a dial. (Peaks and Mindora were retired in 5.41.)
 *
 * What a style may change is how things look, never what is said: every
 * style shows the same figures, in the same order -
 *   left to spend and its period; spent, budget and a day; the share spent,
 *   the day of the month and the share of set-asides used; the month so far
 *   (spent, an even pace, the biggest day); this week by day; what is owed
 *   on each card, named; kept back and owed back; what is coming up, each
 *   with its name, day and amount; and the one-line status.
 * Every figure is one free-to-spend.js already worked out; nothing is
 * calculated again. Charts draws its own in summary.js from the same
 * topFigures().
 */

import { formatRupees, formatDateNice, shortRupees } from '../format.js';
import { escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { categoryStyle } from '../category-style.js';
import { categoryIcon } from '../category-icons.js';
import { isoLocal } from '../frequency.js';

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

/* A card as a bar can name it: the first word of its name and, when known,
 * its last four digits (typed in on Accounts, or at the end of its name). */
export function cardTag(account = {}) {
  const label = String(account.label || '').trim();
  const digits = account.last4 || (label.match(/(\d{4})\s*$/) || [])[1] || '';
  const name = label.replace(/[\s·•x*-]*\d{4}\s*$/i, '').split(/\s+/)[0] || 'Card';
  return { name: name.slice(0, 8), digits };
}

export const tagHtml = (c) => `<span class="card-tag"><span class="card-tag__name">${escapeHtml(c.name)}</span>${c.digits ? `<span class="card-tag__digits">••${escapeHtml(c.digits)}</span>` : ''}</span>`;

// The figures every style's top is drawn from. Exported for a test.
export function topFigures(f) {
  const onCard = (c) => Math.max(0, (c.owed || 0) + (c.unpaid || 0));
  const week = (f.spendByDay || []).slice(-7);
  const daily = (f.spendByDay || []).map((d) => d.amount || 0);
  const big = daily.length ? daily.indexOf(Math.max(...daily)) : -1;
  const monthDays = (f.daysIntoCycle || 0) + (f.daysToClose || 1) - 1;
  const aside = (f.tracker || []).filter((t) => t.setAside && !t.skipped && t.status !== 'untracked' && t.amount > 0);
  const asideTotal = aside.reduce((s, t) => s + t.amount, 0);
  // `work` is the part of a card's amount that is a work cost, owed back by the
  // employer (5.23), so what you spent yourself and what is the company's show apart.
  const cards = (f.cards || []).filter((c) => onCard(c) > 0 || (c.comingFixed || 0) > 0).map((c) => ({ ...cardTag(c.account), amount: onCard(c), work: Math.min(onCard(c), c.workCycle || 0), coming: c.comingFixed || 0 }));
  const cardTop = Math.max(1, ...cards.map((c) => c.amount + c.coming));
  return {
    left: f.free,
    limit: f.limit,
    spent: Math.max(0, f.spentThisCycle || 0),
    used: Math.max(0, f.used || 0),
    // A finished month (5.22.2): the whole month has gone, and everything about
    // now - this week, what is owed, what is coming - is left out of it.
    finished: Boolean(f.finished),
    day: f.finished ? monthDays : f.daysIntoCycle || 0,
    monthDays,
    gone: f.finished ? 1 : monthDays > 0 ? Math.min(1, (f.daysIntoCycle || 0) / monthDays) : 0,
    daysLeft: f.finished ? 0 : f.daysToClose || 0,
    perDay: f.perDay,
    period: `${formatDateNice(f.cycleStart)} to ${formatDateNice(f.cycleKey)}`,
    asideUsed: asideTotal ? aside.reduce((s, t) => s + Math.max(0, t.used || 0), 0) / asideTotal : null,
    asideSpent: aside.reduce((s, t) => s + Math.max(0, t.used || 0), 0),
    asideTotal,
    pace: monthDays > 0 ? Math.round((f.limit * (f.daysIntoCycle || 0)) / monthDays) : 0,
    bigDay: big >= 0 && daily[big] > 0 ? f.spendByDay[big].date : null,
    week,
    weekTotal: week.reduce((s, d) => s + (d.amount || 0), 0),
    // What the figure is a figure of, so it rolls from its last value in this month and no other.
    rollKey: `${f.cycleKey || ''}|${f.limit}`,
    level: f.level,
    // A month that has closed with money to spare: its dial takes one slow glow (css) and says so.
    closedUnder: Boolean(f.finished && f.limit > 0 && (f.spentThisCycle || 0) <= f.limit),
    leftOver: Math.max(0, (f.limit || 0) - (f.spentThisCycle || 0)),
    owedCards: Math.max(0, ((f.totals && f.totals.owedCards) || 0) + ((f.totals && f.totals.unpaidBills) || 0)),
    cards: cards.map((c) => ({ ...c, share: (c.amount + c.coming) / cardTop })),
    bills: (f.cardBills || []).length,
    employer: (f.reimbursable && f.reimbursable.owed) || 0,
    kept: keptBack(f),
    coming: comingUp(f).slice(0, 4),
    stillToPay: comingUp(f).reduce((t, c) => t + c.amount, 0),
  };
}

// "₹63,128 of ₹9,733": once the commitments are more than the income there is no
// budget to be "of" (a finished month can be like that), so only what was spent.
const ofLimit = (x) => (x.limit > 0 ? `${formatRupees(x.spent)} of ${formatRupees(x.limit)}` : formatRupees(x.spent));
// A card's bar: the share it is of the biggest, with the work part of it, which
// the employer pays back, marked inside it.
// A card's bar and the three things it is made of (5.27.2), the same three on every
// screen: what you spent yourself, what is a work cost the company owes back, and the
// fixed costs you set on Plan that the card is still to be charged this cycle. The first
// two add up to the amount on the card; the third is on top, drawn hatched, because it
// is coming but has not arrived. The bar is as long as all three, against the biggest card.
const cardParts = (c) => {
  const own = Math.max(0, c.amount - c.work);
  return [['own', 'Yours', own], ['work', 'Owed by company', c.work], ['plan', 'Planned', c.coming]].filter(([, , v]) => v > 0);
};
const cardBar = (c) => {
  const total = Math.max(1, c.amount + c.coming);
  return `<span class="cb" style="width:${pct(c.share)}">${cardParts(c).map(([k, , v]) => `<u class="${k}" style="width:${pct(v / total)}"></u>`).join('')}</span>`;
};
const cardKey = (c, fmt = formatRupees) => `<span class="card-key">${cardParts(c).map(([k, label, v]) => `<span class="${k}">${label} <b>${fmt(v)}</b></span>`).join('')}</span>`;
const cardLegend = (cards) => (cards.some((c) => c.coming) ? '<p class="card-legend">Planned: fixed costs you set on Plan, still to be charged before the statement day.</p>' : '');
const pct = (v) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dow = (iso) => DOW[new Date(`${iso}T12:00`).getDay()];
const bills = (n) => (n ? `${n} bill${n === 1 ? '' : 's'} due` : '');
export const tone = (f) => (f.level === 'over' || f.level === 'critical' ? 'bad' : f.level === 'warning' ? 'caution' : '');
// The week as columns, today lit: the same in every style, drawn by its CSS.
const weekCols = (x, cls) => {
  const top = Math.max(1, ...x.week.map((d) => d.amount || 0));
  // Each day says what it was (5.23): a bar with no figure told you the shape
  // of a week and nothing else.
  return `<div class="${cls}" role="img" aria-label="Spent each day of this week, ${formatRupees(x.weekTotal)} in all: ${x.week.map((d) => `${dow(d.date)} ${formatRupees(d.amount || 0)}`).join(', ')}">${x.week
    .map((d, i) => `<span>${cls === 'tl-cols' || cls === 'md-cols' ? outsideBar(d, top) : ''}<i class="${i === x.week.length - 1 ? 'lit' : ''}" style="height:${Math.max(6, ((d.amount || 0) / top) * 100).toFixed(0)}%"></i><small>${dow(d.date)}</small><em>${d.amount ? formatRupees(d.amount) : '-'}</em></span>`)
    .join('')}</div>`;
};
// Above a day's bar, hatched: what was spent that day outside the budget (5.33), as on the
// month chart. Tall ones are cut with a zigzag. Instrument draws it; Tactile hides it for now.
const outsideBar = (d, top) => {
  if (!(d.other > 0)) return '';
  const h = (d.other / top) * 100;
  return `<i class="tl-other${h > 35 ? ' is-cut' : ''}" style="height:${Math.max(4, Math.min(35, h)).toFixed(0)}%" title="${formatRupees(d.other)} not from your budget"></i>`;
};
const closedNote = (x) => (x.closedUnder ? `<p class="closed-note">Closed <b>${formatRupees(x.leftOver)}</b> under budget</p>` : '');
const weekNote = (x) => (x.week.some((d) => d.other > 0) ? '<p class="tl-hatch-note"><i></i>Hatched: spent, but not from your budget.</p>' : '');

/* --- Tactile: a raised instrument, then plain rows ----------------------- */
export function tactileTop(f, status, month, heroHtml = '', opts = {}) {
  const x = topFigures(f);
  // `tint` is the colour of the row's tile: Haven draws the tile as a gem of that colour, the other looks as a plain well.
  const row = (ic, t, s, v, cls = '', id = '', tint = '') =>
    `<${id ? `button type="button" id="${id}"` : 'div'} class="tl-item"><span class="tl-ibox"${tint ? ` style="--k-tint:${tint}"` : ''}>${ic}</span><span class="tl-grow"><span class="tl-t">${t}</span>${s ? `<span class="tl-s">${s}</span>` : ''}</span><span class="tl-v ${cls}">${v}</span>${id ? `<span class="tl-chev">${icon('forward')}</span>` : ''}</${id ? 'button' : 'div'}>`;
  const hero = `<div class="tl-hero ${f.free < 0 ? 'is-negative' : ''}${x.closedUnder ? ' is-closed-under' : ''}" data-roll-scope data-limit="${x.limit}" data-level="${f.level || ''}" data-level-key="${f.cycleKey || ''}|${f.limit}">
      <div class="tl-top"><span class="tl-k">Left to spend</span><span class="tl-period">${x.period}</span></div>
      <div class="tl-big" data-roll-kind="left" data-roll="${x.left}" data-roll-key="${x.rollKey}:left">${formatRupees(x.left)}</div>
      <div class="tl-stats">
        <div><span class="tl-k">Spent</span><b data-roll="${x.spent}" data-roll-key="${x.rollKey}:spent">${formatRupees(x.spent)}</b></div>
        <div><span class="tl-k">Budget</span><b>${formatRupees(x.limit)}</b></div>
        <div><span class="tl-k">${x.finished ? 'Days' : 'A day'}</span><b>${x.finished ? x.monthDays : x.perDay > 0 ? formatRupees(x.perDay) : '-'}</b></div>
      </div>
      <div class="tl-prog"><i class="${tone(f)}" data-follow="bar" style="width:${pct(x.used)}"></i><span><span>Spent</span><span>${ofLimit(x)}</span></span></div>
      ${x.asideUsed != null ? `<div class="tl-prog tl-prog--aside"><i style="width:${pct(x.asideUsed)}"></i><span><span>Set aside used</span><span data-fillcount>${formatRupees(x.asideSpent)} of ${formatRupees(x.asideTotal)}</span></span></div>` : ''}
      <div class="tl-slider" role="img" aria-label="Day ${x.day} of ${x.monthDays}">
        <div class="tl-trk"></div><div class="tl-fill" style="width:${pct(x.gone)}"></div><div class="tl-thumb" style="left:${pct(x.gone)}"></div>
        <div class="tl-tip" style="left:${pct(Math.min(0.84, Math.max(0.16, x.gone)))}">Day ${x.day} of ${x.monthDays}</div>
      </div>
      <div class="tl-ticks">${'<i></i>'.repeat(11)}</div>
      <p class="tl-line ${tone(f)}" data-status>${escapeHtml(status)}</p>
      ${closedNote(x)}
    </div>`;
  return `${heroHtml || hero}<!--k:answer-->
    ${month || ''}<!--k:month-->
    ${x.week.length && !x.finished && !opts.noWeek ? `<div class="tl-card"><div class="tl-top"><span class="tl-k">This week</span><b class="tl-mid">${formatRupees(x.weekTotal)}</b></div>${weekCols(x, 'tl-cols')}${weekNote(x)}</div>` : ''}
    ${x.finished ? '' : `<div class="tl-list" data-owed-anchor>
      ${x.cards.length ? `<div class="tl-item tl-item--cards"><span class="tl-ibox" style="--k-tint:var(--cat-learning)">${icon('card')}</span><span class="tl-grow"><span class="tl-t">Owed on cards</span>${x.bills ? `<span class="tl-badge">${bills(x.bills)}</span>` : ''}</span><span class="tl-v">${formatRupees(x.owedCards)}</span>
        <div class="tl-cards">${x.cards.map((c) => `<div class="tl-cardrow">${tagHtml(c)}<span class="tl-thin">${cardBar(c)}</span><span class="tl-cardamt">${formatRupees(c.amount)}</span>${cardKey(c)}</div>`).join('')}</div>${cardLegend(x.cards)}</div>` : ''}
      ${x.kept ? row(categoryIcon('piggy'), 'Kept back', 'set aside, not spent yet', formatRupees(x.kept), '', 'set-aside-stat', 'var(--cat-7)') : ''}
      ${x.employer ? row(categoryIcon('income'), 'Owed back', 'by your employer', formatRupees(x.employer), 'tl-ok', 'owed-back-stat', 'var(--cat-groceries)') : ''}
    </div>`}
    ${x.coming.length && !x.finished && !opts.noComing ? `<div class="tl-label"><span>Coming up</span><span class="tl-still">${formatRupees(x.stillToPay)} still to pay</span></div><div class="tl-list">${x.coming.map((c) => row(categoryStyle(c.label).icon, escapeHtml(c.label), `${formatDateNice(c.due)}${c.late ? ' · late' : ''}`, formatRupees(c.amount), c.late ? 'tl-bad' : '', '', categoryStyle(c.label).color)).join('')}</div>` : ''}`;
}

/* --- Instrument: a dial, then Tactile's rows (5.25) ---------------------- */
// The budget as 240 degrees of scale, sixty marks. Marks up to the even pace
// are lit in the accent; the marks past it up to what is spent are lit red, so
// "ahead of pace" is something you see, not something you work out. A white
// mark is where you are; the red marks show how far past an even spread you are. A
// finished month has no pace: its marks are all one colour. Exported for a test.
export function instrumentDial(x, negative) {
  const cx = 163, cy = 148, R = 124, N = 60, sweep = 240;
  const fs = x.limit > 0 ? Math.min(1, Math.max(0, x.spent / x.limit)) : 1;
  const fp = x.finished || !(x.limit > 0) ? 1 : Math.min(1, Math.max(0, x.pace / x.limit));
  const ang = (f) => -sweep / 2 + f * sweep;
  const pt = (a, r) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const n1 = (v) => v.toFixed(1);
  let marks = '';
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const major = i % 5 === 0;
    const [x1, y1] = pt(ang(f), R);
    const [x2, y2] = pt(ang(f), R - (major ? 18 : 11));
    const lit = f <= fs + 1e-9 ? (f <= fp + 1e-9 ? 'on' : 'ahead') : 'off';
    marks += `<line class="in-dial__m in-dial__m--${lit}${major ? ' is-major' : ''}" style="--i:${i}" x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}"/>`;
  }
  const [nx1, ny1] = pt(ang(fs), R + 5);
  const [nx2, ny2] = pt(ang(fs), R - 26);
  const [z0x, z0y] = pt(ang(0), R - 36);
  const [z1x, z1y] = pt(ang(1), R - 36);
  const paced = !(x.finished || !(x.limit > 0));
  const total = x.limit > 0 ? formatRupees(x.limit) : '';
  return `<svg class="in-dial${x.closedUnder ? ' in-dial--closed' : ''}" data-limit="${x.limit > 0 ? x.limit : ''}" data-pace="${paced ? x.pace : ''}" data-spent="${x.spent}" style="--lit:${Math.round(fs * N)}" viewBox="0 0 326 236" role="img" aria-label="${formatRupees(x.spent)} spent${x.limit > 0 ? ` of ${total}` : ''}${paced ? `, an even pace would be ${formatRupees(x.pace)} by now` : ''}">
      ${marks}
      <line class="in-dial__needle" x1="${n1(nx1)}" y1="${n1(ny1)}" x2="${n1(nx2)}" y2="${n1(ny2)}"/>
      <text class="in-dial__end" x="${n1(z0x)}" y="${n1(z0y + 22)}" text-anchor="middle">₹0</text>
      ${total ? `<text class="in-dial__end" x="${n1(z1x)}" y="${n1(z1y + 22)}" text-anchor="middle">${total}</text>` : ''}
      <text class="in-dial__cap" x="${cx}" y="${cy - 46}" text-anchor="middle">LEFT TO SPEND</text>
      <text class="in-dial__fig${negative ? ' is-negative' : ''}" data-roll-kind="left" data-roll="${x.left}" data-roll-key="${x.rollKey}" x="${cx}" y="${cy + 8}" text-anchor="middle">${formatRupees(x.left)}</text>
      <text class="in-dial__sub" x="${cx}" y="${cy + 32}" text-anchor="middle">${x.limit > 0 ? `${formatRupees(x.spent)} spent of ${total}` : `${formatRupees(x.spent)} spent`}</text>
    </svg>`;
}

export function instrumentTop(f, status, month) {
  const x = topFigures(f);
  const hero = `<div class="tl-hero in-hero ${f.free < 0 ? 'is-negative' : ''}" data-level="${f.level || ''}" data-level-key="${f.cycleKey || ''}|${f.limit}">
      <div class="tl-top"><span class="tl-k">Budget dial</span><span class="tl-period">${x.period}</span></div>
      ${instrumentDial(x, f.free < 0)}
      ${x.finished || !(x.limit > 0) ? (x.closedUnder ? `<p class="in-legend in-legend--closed">Closed <b>${formatRupees(x.leftOver)}</b> under budget</p>` : '') : `<p class="in-legend">Even pace by today <b>${formatRupees(x.pace)}</b></p>`}
      <p class="in-status ${tone(f)}"><span class="in-led"></span><span data-status>${escapeHtml(status)}</span></p>
      <div class="tl-stats">
        <div><span class="tl-k">Spent</span><b>${formatRupees(x.spent)}</b></div>
        <div><span class="tl-k">Budget</span><b>${formatRupees(x.limit)}</b></div>
        <div><span class="tl-k">${x.finished ? 'Days' : 'A day'}</span><b>${x.finished ? x.monthDays : x.perDay > 0 ? formatRupees(x.perDay) : '-'}</b></div>
      </div>
      ${x.asideUsed != null ? `<div class="tl-prog tl-prog--aside"><i style="width:${pct(x.asideUsed)}"></i><span><span>Set aside used</span><span data-fillcount>${formatRupees(x.asideSpent)} of ${formatRupees(x.asideTotal)}</span></span></div>` : ''}
    </div>`;
  return tactileTop(f, status, month, hero);
}

/* --- Charts: each card as yours, owed by the company and planned (5.28) --- */
// Charts used to show the cards as columns of amounts only. It now says what the other looks
// say, in rows, with the same words.
export function chartsCards(f) {
  const x = topFigures(f);
  if (!x.cards.length || x.finished) return '';
  return `<div class="totals-card ch-cards"><div class="ch-cards__head"><span class="ch-cards__k">Owed on cards</span>${x.bills ? `<span class="tl-badge">${bills(x.bills)}</span>` : ''}<b>${formatRupees(x.owedCards)}</b></div>${x.cards
    .map((c) => `<div class="ch-cardrow">${tagHtml(c)}<span class="ch-track">${cardBar(c)}</span><b>${formatRupees(c.amount)}</b>${cardKey(c)}</div>`)
    .join('')}${cardLegend(x.cards)}</div>`;
}

/* --- Charts: what it lacked of the set - what is coming up --------------- */
export function chartsComing(f) {
  const x = topFigures(f);
  if (!x.coming.length) return '';
  return `<div class="totals-card ch-coming"><div class="ch-coming__head"><span class="ch-coming__k">Coming up</span><span class="ch-coming__still">${formatRupees(x.stillToPay)} still to pay</span></div>${x.coming
    .map((c) => `<div class="ch-coming__row"><span class="ch-coming__ic">${categoryStyle(c.label).icon}</span><span class="ch-coming__t">${escapeHtml(c.label)}<small>${formatDateNice(c.due)}${c.late ? ' · late' : ''}</small></span><b class="${c.late ? 'is-late' : ''}">${formatRupees(c.amount)}</b></div>`)
    .join('')}</div>`;
}

/* --- Haven (5.52): the prototype's Summary, with real figures ----------------------------------------------
 * mockups/7.1-haven is the design; this draws the same blocks in the same order with its own markup (classes are the
 * prototype's, prefixed hv-, see css/haven-proto.css): the vault with the tide, "How <month> is going" as a line you can
 * drag across, three shortcuts, "Needs you", "Latest payments" and "Where it went". Everything the prototype does not
 * show is still on the screen below (the app's own blocks), so nothing is lost. */

// What is left rises in a shield; a mood is always said in words too (never colour alone). Exported for a test.
export function tideMood(x, negative) {
  if (x.finished) return x.closedUnder ? ['calm', 'Closed under budget'] : ['low', 'Closed over budget'];
  if (negative || !(x.limit > 0)) return ['low', negative ? 'Over budget' : 'No budget set'];
  const lvl = Math.max(0, Math.min(1, x.left / x.limit));
  const pace = 1 - x.gone;
  if (lvl >= pace - 0.03) return ['calm', 'Ahead'];
  return lvl > 0.18 ? ['watch', 'Behind pace'] : ['low', 'Almost out'];
}
const SHIELD = 'M50 12L80 22V48C80 68 67 82 50 89C33 82 20 68 20 48V22Z';
const wave = (cls, dy, fill) => `<path class="wave ${cls}" d="M-20 ${12 + dy} q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 L160 220 L-20 220Z" fill="${fill}"/>`;
let tideId = 0;
export function tideSvg(lvl, pace) {
  const u = ++tideId;
  const py = (12 + (1 - pace) * 77).toFixed(1);
  return `<svg viewBox="16 8 68 86" aria-hidden="true"><defs><clipPath id="hvc${u}"><path d="${SHIELD}"/></clipPath><linearGradient id="hvg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--hv-tide-b)"/><stop offset="1" style="stop-color:var(--hv-tide-a)"/></linearGradient></defs>
    <path class="sh-glow" d="${SHIELD}"/><path class="sh-line" d="${SHIELD}"/>
    <g clip-path="url(#hvc${u})"><g class="tilt" data-sy="${(12 + (1 - lvl) * 77).toFixed(1)}"><g class="water" style="--lvl:${lvl.toFixed(3)}"><g class="swell">${wave('b', 2.4, 'color-mix(in oklab, var(--hv-tide-b) 55%, transparent)')}${wave('a', 0, `url(#hvg${u})`)}</g></g></g>
    ${pace > 0 && pace < 1 ? `<line class="pace" x1="20" x2="80" y1="${py}" y2="${py}"/>` : ''}</g>
    <path d="${SHIELD}" fill="none" class="sh-rim"/></svg>`;
}

// A category's gem is one of six colours, tuned to hold a white glyph (the prototype's palette, day and night).
const GEM_OF = { 'var(--cat-bills)': 1, 'var(--cat-transport)': 2, 'var(--cat-fun)': 3, 'var(--cat-food)': 4, 'var(--cat-health)': 5, 'var(--cat-groceries)': 6 };
export function gemNo(label) {
  const colour = categoryStyle(label).color;
  if (GEM_OF[colour]) return GEM_OF[colour];
  let h = 0;
  for (const ch of String(colour)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 6) + 1;
}
export const gem = (label, svg = categoryStyle(label).icon) => `<span class="hv-gem hv-g${gemNo(label)}"><span class="hv-ic">${svg}</span></span>`;
export const rupee = (paise) => `<span class="hv-cur">₹</span>${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
const rise = (i, html) => `<div class="hv-rise" style="--i:${i}">${html}</div>`;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Lab 2 (5.58): small facts about the days, read from the month's own figures. Pure, so they can be tested. */
const monthLen = (f) => (f.daysIntoCycle || (f.spendDays || []).length) + (f.daysToClose || 1) - 1;
// Days in a row, ending today, that the running total stayed at or under an even pace.
export function aheadStreak(f) {
  const tot = f.spendDays || [];
  const D = monthLen(f);
  if (f.finished || !(f.limit > 0) || !(D > 0)) return 0;
  let n = 0;
  for (let i = tot.length - 1; i >= 0; i--) {
    if (tot[i] <= (f.limit * (i + 1)) / D) n += 1;
    else break;
  }
  return n;
}
// What today's even share of the budget leaves once today's spending is taken off (never below nothing).
export function keptToday(f, todayIso = isoLocal(new Date())) {
  const by = f.spendByDay || [];
  const D = monthLen(f);
  if (f.finished || !(f.limit > 0) || !(D > 0) || !by.length) return 0;
  const last = by[by.length - 1];
  const spent = last.date === todayIso ? last.amount || 0 : 0;
  return Math.max(0, Math.round(f.limit / D) - spent);
}
// Yesterday, as the pull-down peek says it: what was spent, and where that left the month against an even pace.
export function yesterdayFacts(f) {
  const by = f.spendByDay || [];
  const tot = f.spendDays || [];
  const D = monthLen(f);
  if (f.finished || by.length < 2 || !(f.limit > 0) || !(D > 0)) return null;
  const i = by.length - 2;
  return { spent: by[i].amount || 0, under: Math.round((f.limit * (i + 1)) / D) - (tot[i] || 0) };
}

const BADGE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2l8 3v7c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V5z" fill="#ffd36a" stroke="#c98a13" stroke-width="1.4"/><path d="M8 12.5l3 3 5-6" fill="none" stroke="#7a4a05" stroke-width="2" stroke-linecap="round"/></svg>';
const SHIELD_MINI = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 2.5V12c0 4.2-3 7.2-7 9-4-1.8-7-4.8-7-9V5.5z"/></svg>';

/* Lab 3 (5.60): the month told back, and the facts the motion needs. Pure, so they can be tested. */
// The longest run of days, in a finished or running month, at or under an even pace.
export function longestAhead(f) {
  const tot = f.spendDays || [];
  const D = monthLen(f);
  if (!(f.limit > 0) || !(D > 0)) return 0;
  let best = 0;
  let run = 0;
  tot.forEach((v, i) => {
    run = v <= (f.limit * (i + 1)) / D ? run + 1 : 0;
    best = Math.max(best, run);
  });
  return best;
}
// "October closed": up to five short cards about a month that has ended. `next` is what the new month's budget is.
export function monthStory(was, next, name) {
  const by = was.spendByDay || [];
  if (!(was.limit > 0) || !by.length) return [];
  const spent = was.spentThisCycle || 0;
  const cards = [];
  cards.push(spent <= was.limit ? [`${name} closed`, `You kept ${formatRupees(was.limit - spent)}`, 'under your budget'] : [`${name} closed`, `${formatRupees(spent - was.limit)} over`, 'your budget, this once']);
  const spendDays = by.filter((d) => (d.amount || 0) > 0);
  if (spendDays.length) {
    const big = spendDays.reduce((a, d) => (d.amount > a.amount ? d : a));
    cards.push(['Biggest day', formatRupees(big.amount), `the ${ordinalOf(big.date)}`]);
    if (spendDays.length > 2) {
      const small = spendDays.reduce((a, d) => (d.amount < a.amount ? d : a));
      cards.push(['Quietest day with a payment', formatRupees(small.amount), `the ${ordinalOf(small.date)}`]);
    }
  }
  const run = longestAhead(was);
  if (run >= 3) cards.push(['Your best stretch', `${run} days`, 'in a row at or under an even pace']);
  if (next > 0) cards.push(['The new month', formatRupees(next), 'is your budget, again']);
  return cards.slice(0, 5);
}
const ordinalOf = (iso) => {
  const n = Number(String(iso).slice(8, 10));
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
};
// What a week told in one card: its total, how that stood against an even pace, its seven days and its biggest.
export function weekRecap(f) {
  const by = (f.spendByDay || []).slice(-7);
  const D = monthLen(f);
  if (f.finished || by.length < 3 || !(f.limit > 0) || !(D > 0)) return null;
  const total = by.reduce((s, d) => s + (d.amount || 0), 0);
  const big = by.reduce((a, d) => ((d.amount || 0) > (a.amount || 0) ? d : a), by[0]);
  return { total, under: Math.round((f.limit * by.length) / D) - total, days: by.map((d) => d.amount || 0), big: { date: big.date, amount: big.amount || 0 }, from: by[0].date, to: by[by.length - 1].date };
}

export function havenTop(f, status, month, extra = {}) {
  const x = topFigures(f);
  const [mood, word] = tideMood(x, f.free < 0);
  const lvl = x.limit > 0 ? Math.max(0, Math.min(1, x.left / x.limit)) : 0;
  const pace = x.finished || !(x.limit > 0) ? 0 : 1 - x.gone;
  const mIcon = mood === 'calm' ? icon('tick') : icon('alert');
  const monthNo = Number(String(f.cycleKey || '').slice(5, 7)) || new Date().getMonth() + 1;
  const monthName = MONTHS_LONG[monthNo - 1];
  // One line under the figure: what a day can take. (Anything else the status says is on the screen where it belongs.)
  const sub = !x.finished && x.perDay > 0 && f.free >= 0 ? `<b class="hv-amt">${rupee(x.perDay)}</b> a day until ${formatDateNice(f.cycleKey)}` : escapeHtml(status);
  const num = `<span class="hv-fig"><span class="hv-cur">${f.free < 0 ? '−₹' : '₹'}</span><span class="hv-num" data-roll-kind="left" data-roll="${x.left}" data-roll-key="${x.rollKey}:left">${Math.round(Math.abs(x.left) / 100).toLocaleString('en-IN')}</span></span>`;
  // Facts the motion reads (js/haven-motion.js): the days ahead, today's evening note, what is due within two days, a salary just in.
  const streak = aheadStreak(f);
  const kept = keptToday(f);
  const soon2Iso = isoLocal(new Date(Date.now() + 2 * 86400000));
  const soon2 = x.finished ? 0 : x.coming.filter((c) => c.late || c.due <= soon2Iso).length;
  const yest = yesterdayFacts(f);
  const salary = extra.more && extra.more.salary;
  const more = extra.more || {};
  const week = weekRecap(f);
  const life = x.finished || !(f.limit > 0) ? '' : ` data-life='${escapeHtml(JSON.stringify({ limit: f.limit, free: f.free, days: (f.spendByDay || []).map((d) => [d.date.slice(5), d.amount || 0]), cum: f.spendDays || [], D: monthLen(f), cap: more.cap || 0, perDay: x.perDay > 0 && f.free >= 0 ? x.perDay : 0, daysLeft: x.daysLeft, toSalary: f.daysToSalary || 0, cmp: more.cmp || null }))}'`;
  const recap = week ? ` data-recap='${escapeHtml(JSON.stringify(week))}'` : '';
  const story = more.story && more.story.length ? ` data-story='${escapeHtml(JSON.stringify({ key: more.storyKey, cards: more.story }))}'` : '';
  const badges = (more.badges || []).map((b) => `<span class="hv-medal${b.isNew ? ' is-new' : ''}" role="img" aria-label="${escapeHtml(b.label)}" title="${escapeHtml(b.label)}">${BADGE}</span>`).join('');
  const asleep = !x.finished && x.spent === 0 && (f.spendDays || []).every((v) => !v);
  const sky = `${asleep ? ' data-sleeping' : ''}`;
  const vaultData = `${life}${recap}${story}${sky} data-cycle="${escapeHtml(String(f.cycleKey || ''))}" data-soon2="${soon2}"${streak >= 3 ? ` data-streak="${streak}"` : ''}${kept > 0 ? ` data-eve="Today you kept ${escapeHtml(formatRupees(kept))}"` : ''}${salary ? ` data-salary="${escapeHtml(String(salary.id))}|${escapeHtml(formatRupees(salary.amount))}"` : ''}`;
  const streakChip = streak >= 3 && !x.finished ? `<span class="hv-streak" title="Days in a row at or under an even pace">${SHIELD_MINI}${streak} days ahead</span>` : '';
  const peek = yest ? `<div class="hv-peek" aria-hidden="true"><span>Yesterday you spent <b>${escapeHtml(formatRupees(yest.spent))}</b></span><span>${yest.under >= 0 ? `${escapeHtml(formatRupees(yest.under))} under pace` : `${escapeHtml(formatRupees(-yest.under))} over pace`}</span></div>` : '';
  const vault = `<div class="hv-shell"><div class="hv-vault ${f.free < 0 ? 'is-negative' : ''}"${vaultData} data-roll-scope data-limit="${x.limit}" data-level="${f.level || ''}" data-level-key="${f.cycleKey || ''}|${f.limit}">
      <div class="hv-vault__top"><span class="hv-pill">${monthName}</span>${streakChip}${badges}<span>${x.finished ? 'Final' : `${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} left`}</span></div>
      <div class="hv-vault__main"><div><div class="hv-vault__lab">Left to spend</div><div class="hv-vault__fig hv-amt">${num}</div><div class="hv-vault__sub" data-status>${sub}</div>${more.cap ? `<div class="hv-vault__cap" data-cap>Your own limit: <b>${escapeHtml(formatRupees(more.cap))}</b> a day</div>` : ''}${asleep ? '<div class="hv-vault__sleep">A quiet month so far.</div>' : ''}<div class="hv-vault__eve" data-eve-line aria-live="polite"></div></div>
      <div class="tide" data-mood="${mood}"${x.finished && x.closedUnder ? ` data-closed="${escapeHtml(String(f.cycleKey || ''))}"` : ''} style="--lvl:${lvl.toFixed(3)}" role="img" aria-label="${word}: ${formatRupees(x.left)} left of ${formatRupees(x.limit)}">${tideSvg(lvl, pace)}</div></div>
      <div class="hv-vault__stats"><div><span>Spent</span><b class="hv-amt" data-roll="${x.spent}" data-roll-key="${x.rollKey}:spent">${formatRupees(x.spent)}</b></div><div><span>Budget</span><b class="hv-amt">${shortRupees(x.limit)}</b></div><div><span>${x.finished ? 'Result' : 'On track'}</span><b class="hv-mood" data-mood="${mood}"><span class="hv-ic" style="width:16px;height:16px;vertical-align:-3px">${mIcon}</span> ${x.finished ? (x.closedUnder ? 'Under' : 'Over') : word}</b></div></div>
      ${closedNote(x)}
    </div></div>`;

  // The month: the app's own chart (bars for each day, what was spent outside the budget hatched, the line against the
  // budget's pace, the three figures under it), drawn in summary.js and given a Haven card here.
  const chart = extra.chart || '';

  // Said once, and only when it matters: the bank will not cover the card bills and fixed costs before money comes in.
  const short = f.bankAfterBills != null && f.bankAfterBills < 0 && !x.finished;
  const bank = short
    ? `<button type="button" class="hv-note bad hv-notice" data-hv-go="accounts"><span class="hv-ic">${icon('alert')}</span><div><b>Your bank is ${formatRupees(-f.bankAfterBills)} short</b><span class="hv-muted">for card bills and fixed costs before money comes in</span></div></button>`
    : '';

  // Three ways in, in one row (a bank message, a statement, a cash spend).
  const chips = x.finished ? '' : `<div class="hv-addrow"><button type="button" class="hv-chip" data-hv-go="inbox"><span class="hv-ic">${icon('inbox')}</span>Paste SMS</button><button type="button" class="hv-chip" data-hv-go="import"><span class="hv-ic">${icon('upload')}</span>Import</button><button type="button" class="hv-chip" data-hv-go="add"><span class="hv-ic">${icon('cash')}</span>Cash spend</button></div>`;

  // Due soon: one line, only when something is late or due this week (so a payment is not missed), tap for Plan.
  const soonEnd = isoLocal(new Date(Date.now() + 7 * 86400000));
  const soon = x.finished ? [] : x.coming.filter((c) => c.late || c.due <= soonEnd);
  const dueRow = soon.length
    ? `<div class="hv-shell"><button type="button" class="hv-core flush hv-row hv-due" data-hv-go="plan">${gem(soon[0].label)}<div><div class="hv-row__t">${soon.length === 1 ? escapeHtml(soon[0].label) : `${soon.length} payments due`}</div><div class="hv-row__m">${soon.length === 1 ? `${soon[0].late ? 'Late · was due' : 'Due'} ${formatDateNice(soon[0].due)}` : escapeHtml(soon.slice(0, 2).map((c) => c.label).join(', ')) + (soon.length > 2 ? ` and ${soon.length - 2} more` : '')}${soon.some((c) => c.late) && soon.length > 1 ? ' · one is late' : ''}</div></div><div class="hv-row__v hv-amt">${formatRupees(soon.reduce((s, c) => s + c.amount, 0))}</div></button></div>`
    : '';

  const latest = (extra.latest || []).slice(0, 3);
  // A row opens in place into its details (js/haven-life.js); "See in History" is the way on.
  const payRow = (p) => `<div class="hv-lp"><button type="button" class="hv-row" data-morph aria-expanded="false">${gem(p.category || p.title)}<div><div class="hv-row__t">${escapeHtml(p.title)}</div><div class="hv-row__m">${escapeHtml(p.meta)}</div></div><div class="hv-row__v hv-amt">${p.credit ? '+' : '−'}₹${Math.round(p.amount / 100).toLocaleString('en-IN')}</div></button><div class="hv-lp__d"><div class="hv-lp__in"><span>${p.credit ? 'Paid into' : 'Paid from'} <b>${escapeHtml(p.account || 'an account')}</b></span><span>${escapeHtml(p.category)}</span><button type="button" class="hv-pillbtn" data-open-hist="${escapeHtml(p.title)}">See in History</button></div></div></div>`;
  const latestBlock = latest.length && !x.finished
    ? `<div class="hv-sec"><h2>Latest payments</h2><button type="button" class="hv-link" data-hv-go="transactions">See all</button></div><div class="hv-shell"><div class="hv-core flush">${latest.map(payRow).join('')}${x.spent > 0 ? `<button type="button" class="hv-row hv-row--link" data-hv-go="recap"><span class="hv-row__t">Where it went</span><span class="hv-muted">by category</span><span class="hv-ic">${icon('forward')}</span></button>` : ''}</div></div>`
    : '';
  // Saving for something: one small shield for each goal (up to two), filled as far as what is set aside has got.
  const goals = !x.finished && extra.more && extra.more.goals ? extra.more.goals.slice(0, 2) : [];
  const goalRows = goals.map((g) => {
    const lvl = g.target > 0 ? Math.max(0, Math.min(1, g.saved / g.target)) : 0;
    const line = g.done ? 'Reached' : `${formatRupees(g.monthly)} a month gets there by ${escapeHtml(g.byName)}`;
    return `<button type="button" class="hv-row hv-goal" data-hv-go="plan"><div class="tide hv-goal__tide" data-mood="calm" data-goal-lvl="${lvl.toFixed(3)}" style="--lvl:${lvl.toFixed(3)}">${tideSvg(lvl, 0)}</div><div><div class="hv-row__t">${escapeHtml(g.label)}</div><div class="hv-row__m">${formatRupees(g.saved)} of ${formatRupees(g.target)}</div><div class="hv-row__m hv-goal__when">${line}</div></div></button>`;
  });
  const goalBlock = goalRows.length ? `<div class="hv-sec"><h2>Saving for</h2><button type="button" class="hv-link" data-hv-go="plan">Plan</button></div><div class="hv-shell"><div class="hv-core flush">${goalRows.join('')}</div></div>` : '';
  const blocks = [vault, chart, bank, chips, dueRow, goalBlock, latestBlock].filter(Boolean);
  const protoHtml = `<div class="hv-screen ${extra.still ? 'still' : 'enter'} on-screen" data-hv-summary>${peek}${blocks.map((b, i) => rise(i + 1, b)).join('')}</div>`;
  return tactileTop(f, status, '', protoHtml, { noComing: true, noWeek: true });
}
