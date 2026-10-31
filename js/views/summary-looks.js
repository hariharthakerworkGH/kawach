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
import { spareInBank } from '../free-to-spend.js';
import { getPlace, moonAt, moonPathD } from '../sun-moon.js';

/* What is left of the money set aside that Kawach can follow: the same rows
 * free-to-spend.js uses when it works out what is safe to keep spending. */
export function keptBack(f) {
  return keptItems(f).left.reduce((s, t) => s + t.left, 0);
}

/* The set-asides Kawach can follow, split in two: what still has something left (most left first), and what is used up or
 * over. The first list adds up to keptBack(); the second is folded away. */
export function keptItems(f) {
  const rows = (f.tracker || []).filter((t) => t.setAside && !t.skipped && t.status !== 'untracked' && t.amount > 0);
  const left = rows.filter((t) => t.left > 0 && ['ok', 'heading-over', 'part'].includes(t.status)).sort((a, b) => b.left - a.left);
  return { left, usedUp: rows.filter((t) => !left.includes(t)) };
}

const CHEV = '<svg class="hv-kept__chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/* "Kept back" on Haven's Summary, under the Left to spend card: one slim line with the total, opening in place (js/haven-life.js)
 * to one line for each set-aside with what is left of it and a thin bar of how much is used. Said only while something is left. */
export function keptBlock(f) {
  const { left, usedUp } = keptItems(f);
  const total = left.reduce((s, t) => s + t.left, 0);
  if (!total) return '';
  const item = (t) => {
    const over = t.left < 0;
    const pct = Math.round(Math.max(0, Math.min(1, t.used / t.amount)) * 100);
    const tone = over ? ' is-over' : t.status === 'heading-over' ? ' is-warn' : '';
    const words = over ? `<b class="hv-amt">${formatRupees(-t.left)}</b> over ${formatRupees(t.amount)}` : `<b class="hv-amt">${formatRupees(t.left)}</b> left of ${formatRupees(t.amount)}`;
    return `<div class="hv-kept__item${tone}"><div class="hv-kept__top"><span class="hv-kept__name">${escapeHtml(t.label)}</span><span class="hv-kept__left">${words}</span></div><div class="hv-kept__track"><i style="width:${pct}%"></i></div></div>`;
  };
  const used = usedUp.length ? `<details class="hv-kept__used"><summary>Used up this month (${usedUp.length})</summary>${usedUp.map(item).join('')}</details>` : '';
  return `<div class="hv-kept"><button type="button" class="hv-kept__head" aria-expanded="false" aria-controls="hv-kept-list"><span class="hv-kept__ic">${categoryIcon('piggy')}</span><span class="hv-kept__t">Kept back</span><span class="hv-kept__v hv-amt">${formatRupees(total)}</span>${CHEV}</button><div class="hv-kept__list" id="hv-kept-list" inert><div class="hv-kept__in">${left.map(item).join('')}${used}</div></div></div>`;
}

/* Kept back, for the Ledger hero: the third figure in its row (a button that opens the list) and the list itself, which opens in place under
 * the row (js/haven-life.js). Null while nothing is left. */
export function keptParts(f) {
  const { left, usedUp } = keptItems(f);
  const total = left.reduce((s, t) => s + t.left, 0);
  if (!total) return null;
  const item = (t) => {
    const over = t.left < 0;
    const pct = Math.round(Math.max(0, Math.min(1, t.used / t.amount)) * 100);
    const tone = over ? ' is-over' : t.status === 'heading-over' ? ' is-warn' : '';
    const words = over ? `<b class="hv-amt">${formatRupees(-t.left)}</b> over ${formatRupees(t.amount)}` : `<b class="hv-amt">${formatRupees(t.left)}</b> left of ${formatRupees(t.amount)}`;
    return `<div class="hv-kept__item${tone}"><div class="hv-kept__top"><span class="hv-kept__name">${escapeHtml(t.label)}</span><span class="hv-kept__left">${words}</span></div><div class="hv-kept__track"><i style="width:${pct}%"></i></div></div>`;
  };
  const used = usedUp.length ? `<details class="hv-kept__used"><summary>Used up this month (${usedUp.length})</summary>${usedUp.map(item).join('')}</details>` : '';
  return {
    total,
    head: `<button type="button" class="hv-kept__head" aria-expanded="false" aria-controls="hv-kept-list"><span>Kept back ${CHEV}</span><b class="hv-amt">${formatRupees(total)}</b></button>`,
    list: `<div class="hv-kept__list" id="hv-kept-list" inert><div class="hv-kept__in">${left.map(item).join('')}${used}</div></div>`,
  };
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

/* The month as a chart inside the hero (mockups/7.0-ledger/summary-chart.html, A): a bar for each day (the hatched part is money out that is not
 * from the budget), what was spent so far as a line that fills, the even pace as a dashed line, and today as the sun by day or the moon, in its
 * real phase, by night. It carries almost no words: the first and last day, and the day you tap, read under your finger. Pure: it is drawn
 * from figures free-to-spend.js already worked out. Exported for a test. */
let heroHatches = 0;
export function heroChart(f, dark = document.documentElement.dataset.theme === 'dark') {
  const tot = f.spendDays || [];
  const days = monthLen(f);
  if (!(f.limit > 0) || !tot.length || !(days > 0)) return '';
  const by = f.spendByDay || [];
  const W = 334, H = 128, L = 6, R = 6, T = 8, B = 16;
  const iw = W - L - R, ih = H - T - B, base = T + ih;
  const x = (i) => L + (i / Math.max(1, days - 1)) * iw;
  const top = Math.max(f.limit, ...tot) * 1.04;
  const y = (v) => base - (Math.max(0, v) / top) * ih;
  // The bars stand on the line and share one ceiling (the cap, a little above what most days reach): a day that goes past it is cut, with a
  // zigzag top and a slanted gap across the bar, so one EMI or a big bill cannot flatten every other day. Drag across the chart for the true amount.
  const zone = ih * 0.6;
  const sums = by.map((d) => (d.amount || 0) + (d.other || 0)).filter((v) => v > 0).sort((p, q) => p - q);
  const cap = sums.length >= 4 ? Math.max(1, sums[Math.floor(sums.length * 0.8)] * 1.5) : Math.max(1, ...sums);
  const bw = Math.max(3, Math.min(8, (iw / days) * 0.6));
  const hid = `hh${(heroHatches += 1)}`;
  const ZZ = 6.5; // the zigzag's depth: deep enough to read as a break at a glance
  const MINT = 'rgba(127,235,221,.55)';
  const HATCH = `url(#${hid})`;
  // One block of a bar: from `bottom` up `h`; its top a zigzag when it is cut. A break (the slanted gap) is drawn across a cut block.
  const block = (cx, bottom, h, fill, edge, cut) => {
    const l = cx - bw / 2;
    const q = bw / 6; // three teeth across the top
    const t = bottom - h;
    const teeth = `l${q.toFixed(1)} ${-ZZ} l${q.toFixed(1)} ${ZZ} `.repeat(3);
    const shape = cut
      ? `<path d="M${l.toFixed(1)} ${bottom.toFixed(1)} V${(t + ZZ).toFixed(1)} ${teeth}V${bottom.toFixed(1)} Z" fill="${fill}"${edge || ' stroke="rgba(255,255,255,.55)" stroke-width=".6" stroke-linejoin="round"'}/>`
      : `<rect x="${l.toFixed(1)}" y="${t.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${fill}"${edge}/>`;
    // the break: a slanted gap across the bar, in the card's own colour, a little below the teeth
    const gap = cut ? `<line x1="${(l - 1.4).toFixed(1)}" y1="${(t + ZZ + 7).toFixed(1)}" x2="${(l + bw + 1.4).toFixed(1)}" y2="${(t + ZZ + 3).toFixed(1)}" stroke="rgba(10,24,60,.95)" stroke-width="2.2"/>` : '';
    return shape + gap;
  };
  const day = (iso) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(`${iso}T12:00:00`)).map((q) => [q.type, q.value]));
    return `${p.weekday} ${p.day} ${p.month}`;
  };
  const bars = by.map((d, i) => {
    const a = d.amount || 0;
    const o = d.other || 0;
    const cx = x(i);
    // a small amount is drawn at least 1.5px (2px hatched) high; the top comes from the height drawn, so every bar stands on the line
    const hA = a > 0 ? Math.max(1.5, (Math.min(a, cap) / cap) * zone) : 0;
    const cutA = a > cap;
    let drawn = a > 0 ? block(cx, base, cutA ? zone : hA, MINT, '', cutA) : '';
    if (o > 0 && !cutA) {
      const room = zone - hA;
      const want = Math.max(2, (o / cap) * zone);
      const cutO = want > room;
      drawn += block(cx, base - hA, cutO ? Math.max(2, room) : want, HATCH, ' stroke="#F4B541" stroke-width=".7"', cutO);
    }
    const say = `${day(d.date)} · ${money(a)}${o > 0 ? ` and ${money(o)} not from the budget` : ''}`;
    return `<g class="b" data-x="${cx.toFixed(1)}" data-y="${y(tot[Math.min(i, tot.length - 1)]).toFixed(1)}" data-t="${escapeHtml(say)}">${drawn}</g>`;
  }).join('');
  const pts = tot.map((v, i) => [x(i), y(v)]);
  // a curve, not a polyline: each stretch leaves and arrives level (as in "More about this month"), so it never overshoots a day's value
  const line = pts.reduce((d, [px, py], i) => {
    if (!i) return `M${px.toFixed(1)} ${py.toFixed(1)}`;
    const [qx, qy] = pts[i - 1];
    const m = (px - qx) / 2;
    return `${d} C${(qx + m).toFixed(1)} ${qy.toFixed(1)} ${(px - m).toFixed(1)} ${py.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }, '');
  const [tx, ty] = pts[pts.length - 1];
  const area = `${line} L${tx.toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z`;
  let dot;
  if (!dark) {
    dot = `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="10" fill="rgba(255,210,94,.22)"/><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="5.2" fill="#FFD25E" stroke="#fff" stroke-opacity=".7" stroke-width="1"/>`;
  } else {
    const place = getPlace();
    const sh = moonPathD(moonAt(Date.now(), place.lat, place.lon).phase);
    dot = `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(.3)${sh.flip ? ' scale(-1 1)' : ''}"><circle r="22" fill="rgba(188,204,255,.18)"/><circle r="20" fill="#27305a"/><path d="${sh.d}" fill="#EEF2FF"/></g>`;
  }
  // The ends of the line are day numbers; if a window ever runs into the next month they are dates ("30 Nov"), never "32".
  const startDate = new Date(`${by.length ? by[0].date : isoLocal(new Date())}T12:00:00`);
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + days - 1, 12);
  const crosses = endDate.getMonth() !== startDate.getMonth();
  const endName = (d) => (crosses ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : String(d.getDate()));
  const first = endName(startDate);
  const lastLabel = endName(endDate);
  return `<div class="lg-chartbox"><svg class="lg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(`This month so far: ${money(tot[tot.length - 1])} spent, against an even pace of ${money(Math.round((f.limit * tot.length) / days))}. Press and slide along it to read each day.`)}">
    <defs><pattern id="${hid}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="rgba(244,181,65,.14)"/><rect width="1.6" height="4" fill="#F4B541"/></pattern></defs>
    <line x1="${L}" y1="${base}" x2="${W - R}" y2="${base}" stroke="rgba(255,255,255,.25)"/>
    ${bars}
    <line x1="${x(0).toFixed(1)}" y1="${y(0).toFixed(1)}" x2="${x(days - 1).toFixed(1)}" y2="${y(f.limit).toFixed(1)}" stroke="rgba(255,255,255,.7)" stroke-width="1.3" stroke-dasharray="4 4"/>
    <path d="${area}" fill="rgba(63,216,198,.2)"/><path d="${line}" fill="none" stroke="#7FEBDD" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${base}" stroke="rgba(255,255,255,.35)" stroke-dasharray="2 3"/>${dot}
    <text x="${L}" y="${H - 3}" font-size="10" fill="rgba(255,255,255,.6)">${first}</text><text x="${W - R}" y="${H - 3}" font-size="10" text-anchor="end" fill="rgba(255,255,255,.6)">${lastLabel}</text>
    <line class="lg-guide" y1="${T}" y2="${base}" stroke="#fff" stroke-width="1" opacity="0"/><circle class="lg-pickdot" r="4" fill="#fff" opacity="0"/></svg><p class="lg-chartread" hidden aria-live="polite"></p></div>`;
}

// What a payment's tile is tinted: the gem number of its category, in the Ledger's five tones.
const TONE_OF_GEM = { 1: 't3', 2: 't1', 3: 't2', 4: 't4', 5: 't3', 6: 't5' };
// Bills and categories are tinted by what they are, so the same thing is the same colour on every screen; anything else takes its category's gem.
const TONES = [
  ['t4', /health|medic|insur|doctor|pharm|hospital/i],
  ['t2', /electric|power|fuel|petrol|diesel|transport|travel|loan|emi|\bgas\b|cab|taxi|metro|bus/i],
  ['t3', /internet|wifi|broadband|phone|mobile|recharge|shop|bag|subscri|netflix|stream|online/i],
  ['t5', /saving|invest|sip|income|salary|\bfd\b|deposit|interest/i],
  ['t1', /rent|house|home|grocer|food|dining|restaurant|vegetable|milk/i],
];
export const lgTone = (label) => (TONES.find(([, re]) => re.test(String(label))) || [])[0] || TONE_OF_GEM[gemNo(label)] || 't1';
export const lgIco = (label, svg = categoryStyle(label).icon) => `<span class="lg-ico ${lgTone(label)}">${svg}</span>`;
const money = (paise) => `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;

/* A row of the "To do" list that this file draws itself (the bank running short, payments due): the same look as the rows renderAttention draws. */
const todoLine = ({ ico, tone = '', title, sub = '', go = '', right = '' }) =>
  `<${go ? 'button type="button"' : 'div'} class="todo-row lg-todo-pre ${tone}"${go ? ` data-hv-go="${go}"` : ''}><span class="todo-icon" aria-hidden="true">${ico}</span><span class="todo-text"><span>${title}</span>${sub ? `<span class="muted-note ${tone}">${sub}</span>` : ''}</span>${right ? `<span class="attention-actions">${right}</span>` : ''}${go ? `<span class="lg-todo-go">${icon('forward')}</span>` : ''}</${go ? 'button' : 'div'}>`;

/* The Latest / To do card's tabs: one handler for every card on the page. Called when a screen is drawn (js/haven-ui.js wireHaven). */
export function wireTabs(root) {
  root.querySelectorAll('.lg-act:not([data-wired])').forEach((card) => {
    card.dataset.wired = '1';
    const open = (name) => {
      card.dataset.tab = name;
      card.querySelectorAll('[data-lg-tab]').forEach((t) => { const on = t.dataset.lgTab === name; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      card.querySelectorAll('[data-lg-panel]').forEach((p) => { p.hidden = p.dataset.lgPanel !== name; });
    };
    card.querySelectorAll('[data-lg-tab]').forEach((t) => t.addEventListener('click', () => open(t.dataset.lgTab)));
    card.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || !e.target.matches('[data-lg-tab]')) return;
      e.preventDefault();
      const tabs = [...card.querySelectorAll('[data-lg-tab]')];
      const next = tabs[(tabs.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      open(next.dataset.lgTab);
      next.focus();
    });
  });
}

/* The To do tab says how many things wait, and says so plainly when none does. Called once the list under it has been drawn. */
export function syncTodo(root) {
  const card = root.querySelector?.('.lg-act');
  if (!card) return;
  const panel = card.querySelector('[data-lg-panel="todo"]');
  const n = panel.querySelectorAll('.todo-row, .need-row').length;
  const badge = card.querySelector('[data-lg-count]');
  if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
  let calm = panel.querySelector('.lg-calm');
  if (!n && !calm) { calm = document.createElement('p'); calm.className = 'lg-calm'; calm.textContent = 'Nothing needs you today.'; panel.append(calm); }
  else if (n && calm) calm.remove();
  // A large payment nobody has said the purpose of moves the headline figure: open on the question instead of hiding it behind a tab.
  if (panel.querySelector('.assign-lump') && card.dataset.tab !== 'todo') {
    card.dataset.tab = 'todo';
    card.querySelectorAll('[data-lg-tab]').forEach((t) => { const on = t.dataset.lgTab === 'todo'; t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on)); });
    card.querySelectorAll('[data-lg-panel]').forEach((p) => { p.hidden = p.dataset.lgPanel !== 'todo'; });
  }
}

export function havenTop(f, status, month, extra = {}) {
  const x = topFigures(f);
  const [mood, word] = tideMood(x, f.free < 0);
  const lvl = x.limit > 0 ? Math.max(0, Math.min(1, x.left / x.limit)) : 0;
  // One line under the figure: what a day can take. (Anything else the status says is on the screen where it belongs.)
  const days = `${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} left`;
  const sub = !x.finished && x.perDay > 0 && f.free >= 0 ? `<b class="hv-amt">${money(x.perDay)}</b> a day · ${days}` : escapeHtml(status);
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
  // One tag says how the month stands, in words (never colour alone).
  const tag = x.finished
    ? `<span class="lg-tag ${x.closedUnder ? 'ok' : 'bad'}">${icon(x.closedUnder ? 'tick' : 'alert')} ${escapeHtml(word)}</span>`
    : streak >= 3
      ? `<span class="lg-tag ok hv-streak" title="Days in a row at or under an even pace">${icon('tick')} ${streak} days ahead</span>`
      : `<span class="lg-tag ${mood === 'calm' ? 'ok' : mood === 'watch' ? 'warn' : 'bad'}">${icon(mood === 'calm' ? 'tick' : 'alert')} ${escapeHtml(word)}</span>`;
  const peek = yest ? `<div class="hv-peek" aria-hidden="true"><span>Yesterday you spent <b>${escapeHtml(formatRupees(yest.spent))}</b></span><span>${yest.under >= 0 ? `${escapeHtml(formatRupees(yest.under))} under pace` : `${escapeHtml(formatRupees(-yest.under))} over pace`}</span></div>` : '';
  // The third figure is Kept back (opening the list in place) while something is kept back; otherwise what a day can take.
  const kp = x.finished ? null : keptParts(f);
  const third = x.finished
    ? `<div><span>Result</span><b>${x.closedUnder ? 'Under' : 'Over'}</b></div>`
    : kp
      ? `<div class="hv-kept__cell">${kp.head}</div>`
      : x.perDay > 0
        ? `<div><span>A day</span><b class="hv-amt">${formatRupees(x.perDay)}</b></div>`
        : `<div><span>Days left</span><b>${x.daysLeft}</b></div>`;
  // Over the plan, the bank can still have money in it. It is said once, and kept apart from the budget (which comes from
  // Plan): the money is there, spending it is the choice of the person, and next month's budget does not grow by it.
  const spare = spareInBank(f);
  const overNote = !x.finished && f.free < 0 && spare > 0 ? `<div class="hv-vault__bank" data-bank-spare>${escapeHtml(formatRupees(spare))} in the bank after bills, not budget</div>` : '';
  // The pay landed before the month ended and has already paid out for the next: said, so the figures are not a puzzle.
  const aheadNote = !x.finished && f.paidAhead ? `<div class="hv-vault__bank" data-paid-ahead>${escapeHtml(formatRupees(f.paidAhead.amount))} already paid for ${escapeHtml(MONTHS_LONG[Number(f.paidAhead.monthKey.slice(5, 7)) - 1])}</div>` : '';
  const hero = `<div class="lg-hero hv-vault ${f.free < 0 ? 'is-negative' : ''}"${x.finished ? ' data-finished' : ''}${vaultData} data-roll-scope data-limit="${x.limit}" data-left="${x.left}" data-level="${f.level || ''}" data-level-key="${f.cycleKey || ''}|${f.limit}">
      <div class="r1"><span class="lab hv-vault__lab">Left to spend${badges}</span>${extra.nav || ''}</div>
      <div class="figrow"><div class="hv-vault__fig hv-amt">${num}</div><div class="tide" data-mood="${mood}"${x.finished && x.closedUnder ? ` data-closed="${escapeHtml(String(f.cycleKey || ''))}"` : ''} style="--lvl:${lvl.toFixed(3)}" role="img" aria-label="${word}: ${formatRupees(x.left)} left of ${formatRupees(x.limit)}">${tideSvg(lvl, 0)}</div></div>
      <div class="sub"><span data-status>${sub}</span>${tag}</div>
      ${overNote}${aheadNote}${more.cap ? `<div class="hv-vault__cap" data-cap>Your own limit: <b>${escapeHtml(formatRupees(more.cap))}</b> a day</div>` : ''}${asleep ? '<div class="hv-vault__sleep">A quiet month so far.</div>' : ''}<div class="hv-vault__eve" data-eve-line aria-live="polite"></div>
      ${heroChart(f)}
      <div class="hv-kept"><div class="stats"><div><span>Spent</span><b class="hv-amt" data-roll="${x.spent}" data-roll-key="${x.rollKey}:spent">${formatRupees(x.spent)}</b></div><div><span>Budget</span><b class="hv-amt">${formatRupees(x.limit)}</b></div>${third}</div>${kp ? kp.list : ''}</div>
      ${closedNote(x)}
    </div>`;

  // The month's chart and the way into "where it went" wait in the fold at the foot of the screen (the app's own chart, drawn in summary.js).
  const chartBlock = `${x.spent > 0 && !x.finished ? `<button type="button" class="lg-link" data-hv-go="recap"><span class="n">Where it went<i>by category</i></span>${icon('forward')}</button>` : ''}${extra.chart || ''}`;

  // Said once, and only when it matters: the bank will not cover the card bills and fixed costs before money comes in. It is the first thing on the To do list.
  const short = f.bankAfterBills != null && f.bankAfterBills < 0 && !x.finished;
  const pre = [];
  if (short) pre.push(todoLine({ ico: icon('alert'), tone: 'is-alert', title: `Your bank is <b>${formatRupees(-f.bankAfterBills)}</b> short`, sub: 'for card bills and fixed costs before money comes in', go: 'accounts' }));
  // Only what is late: a bill due next week is already on Plan, and a reminder you can do nothing about is not a thing to do.
  const soon = x.finished ? [] : x.coming.filter((c) => c.late);
  if (soon.length) {
    pre.push(todoLine({
      ico: categoryStyle(soon[0].label).icon,
      tone: soon.some((c) => c.late) ? 'is-alert' : 'is-soon',
      title: soon.length === 1 ? escapeHtml(soon[0].label) : `${soon.length} payments due`,
      sub: soon.length === 1 ? `${soon[0].late ? 'Late · was due' : 'Due'} ${formatDateNice(soon[0].due)}` : escapeHtml(soon.slice(0, 2).map((c) => c.label).join(', ')) + (soon.length > 2 ? ` and ${soon.length - 2} more` : ''),
      go: 'plan',
      right: `<b class="hv-amt">${formatRupees(soon.reduce((s, c) => s + c.amount, 0))}</b>`,
    }));
  }

  // Four, so "More about this month" is whole on the screen below them (with the bigger chart there is less room than there was).
  const latest = (extra.latest || []).slice(0, 4);
  // A row opens in place into its details (js/haven-life.js); "See in History" is the way on.
  const payRow = (p) => `<div class="hv-lp"><button type="button" class="lg-row" data-morph aria-expanded="false">${lgIco(p.category || p.title)}<span class="n">${escapeHtml(p.title)}<i>${escapeHtml(p.category)}</i></span><span class="amt hv-amt${p.credit ? ' in' : ''}">${p.credit ? '+' : '−'}${money(p.amount)}</span></button><div class="hv-lp__d"><div class="hv-lp__in"><span>${p.credit ? 'Paid into' : 'Paid from'} <b>${escapeHtml(p.account || 'an account')}</b> · ${escapeHtml(p.meta.replace(/^[^·]*· /, ''))}</span><button type="button" class="lg-btn sm s" data-open-hist="${escapeHtml(p.title)}">See in History</button></div></div></div>`;
  const tabOn = short ? 'todo' : 'latest';
  const activity = x.finished ? '' : `<div class="lg-card lg-act" data-tab="${tabOn}">
      <div class="lg-pad"><div class="lg-seg" role="tablist" aria-label="Payments or things to do"><button type="button" role="tab" class="${tabOn === 'latest' ? 'on' : ''}" aria-selected="${tabOn === 'latest'}" data-lg-tab="latest">Latest</button><button type="button" role="tab" class="${tabOn === 'todo' ? 'on' : ''}" aria-selected="${tabOn === 'todo'}" data-lg-tab="todo">To do <span class="lg-count" data-lg-count${pre.length ? '' : ' hidden'}>${pre.length}</span></button></div></div>
      <div role="tabpanel" data-lg-panel="latest"${tabOn === 'latest' ? '' : ' hidden'}>${latest.length ? latest.map(payRow).join('') : '<p class="lg-calm">No payments yet. Add one with the + button.</p>'}<button type="button" class="lg-more lg-more--link" data-hv-go="transactions"><span>See all payments</span>${icon('forward')}</button></div>
      <div role="tabpanel" class="lg-todo" data-lg-panel="todo"${tabOn === 'todo' ? '' : ' hidden'}>${pre.join('')}<div id="attention-section"></div></div>
    </div>`;
  // Saving for something: a strip for each goal (up to two), filled as far as what is set aside has got.
  const goals = !x.finished && extra.more && extra.more.goals ? extra.more.goals.slice(0, 2) : [];
  const goalCards = goals.map((g) => {
    const share = g.target > 0 ? Math.max(0, Math.min(1, g.saved / g.target)) : 0;
    return `<button type="button" class="lg-card lg-goal hv-goal" data-hv-go="plan" aria-label="${escapeHtml(`${g.label}: ${formatRupees(g.saved)} of ${formatRupees(g.target)}`)}"><span class="lg-ico t1">${categoryIcon('shield')}</span><span class="lg-goal__body"><span class="lg-goal__top"><b>${escapeHtml(g.label)} <span>${Math.round(share * 100)}%</span></b><span>${g.done ? 'Reached' : `<b class="hv-amt">${formatRupees(g.monthly)}</b> a month`}</span></span><span class="lg-goal__bar"><span class="lg-pbar"><i style="width:${(share * 100).toFixed(0)}%"></i></span><span>${escapeHtml(g.byName)}</span></span></span></button>`;
  });
  const blocks = [hero, ...goalCards, activity].filter(Boolean);
  const protoHtml = `<div class="hv-screen lg-screen ${extra.still ? 'still' : 'enter'} on-screen" data-hv-summary>${peek}${blocks.map((b, i) => rise(i + 1, b)).join('')}</div>`;
  return tactileTop(f, status, '', protoHtml, { noComing: true, noWeek: true }).replace('<!--k:month-->', `<!--k:month-->${chartBlock}`);
}
