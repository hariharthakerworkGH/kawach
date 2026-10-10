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
export function tactileTop(f, status, month, heroHtml = '') {
  const x = topFigures(f);
  const row = (ic, t, s, v, cls = '', id = '') =>
    `<${id ? `button type="button" id="${id}"` : 'div'} class="tl-item"><span class="tl-ibox">${ic}</span><span class="tl-grow"><span class="tl-t">${t}</span>${s ? `<span class="tl-s">${s}</span>` : ''}</span><span class="tl-v ${cls}">${v}</span>${id ? `<span class="tl-chev">${icon('forward')}</span>` : ''}</${id ? 'button' : 'div'}>`;
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
    ${x.week.length && !x.finished ? `<div class="tl-card"><div class="tl-top"><span class="tl-k">This week</span><b class="tl-mid">${formatRupees(x.weekTotal)}</b></div>${weekCols(x, 'tl-cols')}${weekNote(x)}</div>` : ''}
    ${x.finished ? '' : `<div class="tl-list" data-owed-anchor>
      ${x.cards.length ? `<div class="tl-item tl-item--cards"><span class="tl-ibox">${icon('card')}</span><span class="tl-grow"><span class="tl-t">Owed on cards</span>${x.bills ? `<span class="tl-badge">${bills(x.bills)}</span>` : ''}</span><span class="tl-v">${formatRupees(x.owedCards)}</span>
        <div class="tl-cards">${x.cards.map((c) => `<div class="tl-cardrow">${tagHtml(c)}<span class="tl-thin">${cardBar(c)}</span><span class="tl-cardamt">${formatRupees(c.amount)}</span>${cardKey(c)}</div>`).join('')}</div>${cardLegend(x.cards)}</div>` : ''}
      ${x.kept ? row(categoryIcon('piggy'), 'Kept back', 'set aside, not spent yet', formatRupees(x.kept), '', 'set-aside-stat') : ''}
      ${x.employer ? row(categoryIcon('income'), 'Owed back', 'by your employer', formatRupees(x.employer), 'tl-ok', 'owed-back-stat') : ''}
    </div>`}
    ${x.coming.length && !x.finished ? `<div class="tl-label"><span>Coming up</span><span class="tl-still">${formatRupees(x.stillToPay)} still to pay</span></div><div class="tl-list">${x.coming.map((c) => row(categoryStyle(c.label).icon, escapeHtml(c.label), `${formatDateNice(c.due)}${c.late ? ' · late' : ''}`, formatRupees(c.amount), c.late ? 'tl-bad' : '')).join('')}</div>` : ''}`;
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
