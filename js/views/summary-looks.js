/* The top of Summary in each style (5.9, made identical in what it says in
 * 5.10).
 *
 * The styles began (5.6 to 5.8) as paint over the Charts layout, and on a
 * phone they all read as one design, so each now lays out Summary's top half
 * the way its mockup does (mockups/5.0): Tactile a raised instrument and
 * plain rows, Peaks a pale panel with a donut and the month as mountains,
 * Mindora glass with a face for how the month is going.
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
const plain = (v) => formatRupees(v).replace('₹', '');
// The week as columns, today lit: the same in every style, drawn by its CSS.
const weekCols = (x, cls) => {
  const top = Math.max(1, ...x.week.map((d) => d.amount || 0));
  // Each day says what it was (5.23): a bar with no figure told you the shape
  // of a week and nothing else.
  return `<div class="${cls}" role="img" aria-label="Spent each day of this week, ${formatRupees(x.weekTotal)} in all: ${x.week.map((d) => `${dow(d.date)} ${formatRupees(d.amount || 0)}`).join(', ')}">${x.week
    .map((d, i) => `<span><i class="${i === x.week.length - 1 ? 'lit' : ''}" style="height:${Math.max(6, ((d.amount || 0) / top) * 100).toFixed(0)}%"></i><small>${dow(d.date)}</small><em>${d.amount ? formatRupees(d.amount) : '-'}</em></span>`)
    .join('')}</div>`;
};

/* --- Tactile: a raised instrument, then plain rows ----------------------- */
export function tactileTop(f, status, month, heroHtml = '') {
  const x = topFigures(f);
  const row = (ic, t, s, v, cls = '', id = '') =>
    `<${id ? `button type="button" id="${id}"` : 'div'} class="tl-item"><span class="tl-ibox">${ic}</span><span class="tl-grow"><span class="tl-t">${t}</span>${s ? `<span class="tl-s">${s}</span>` : ''}</span><span class="tl-v ${cls}">${v}</span>${id ? `<span class="tl-chev">${icon('forward')}</span>` : ''}</${id ? 'button' : 'div'}>`;
  const hero = `<div class="tl-hero ${f.free < 0 ? 'is-negative' : ''}">
      <div class="tl-top"><span class="tl-k">Left to spend</span><span class="tl-period">${x.period}</span></div>
      <div class="tl-big">${formatRupees(x.left)}</div>
      <div class="tl-stats">
        <div><span class="tl-k">Spent</span><b>${formatRupees(x.spent)}</b></div>
        <div><span class="tl-k">Budget</span><b>${formatRupees(x.limit)}</b></div>
        <div><span class="tl-k">${x.finished ? 'Days' : 'A day'}</span><b>${x.finished ? x.monthDays : x.perDay > 0 ? formatRupees(x.perDay) : '-'}</b></div>
      </div>
      <div class="tl-prog"><i class="${tone(f)}" style="width:${pct(x.used)}"></i><span><span>Spent</span><span>${ofLimit(x)}</span></span></div>
      ${x.asideUsed != null ? `<div class="tl-prog tl-prog--aside"><i style="width:${pct(x.asideUsed)}"></i><span><span>Set aside used</span><span>${formatRupees(x.asideSpent)} of ${formatRupees(x.asideTotal)}</span></span></div>` : ''}
      <div class="tl-slider" role="img" aria-label="Day ${x.day} of ${x.monthDays}">
        <div class="tl-trk"></div><div class="tl-fill" style="width:${pct(x.gone)}"></div><div class="tl-thumb" style="left:${pct(x.gone)}"></div>
        <div class="tl-tip" style="left:${pct(Math.min(0.84, Math.max(0.16, x.gone)))}">Day ${x.day} of ${x.monthDays}</div>
      </div>
      <div class="tl-ticks">${'<i></i>'.repeat(11)}</div>
      <p class="tl-line ${tone(f)}">${escapeHtml(status)}</p>
    </div>`;
  return `${heroHtml || hero}<!--k:answer-->
    ${month || ''}<!--k:month-->
    ${x.week.length && !x.finished ? `<div class="tl-card"><div class="tl-top"><span class="tl-k">This week</span><b class="tl-mid">${formatRupees(x.weekTotal)}</b></div>${weekCols(x, 'tl-cols')}</div>` : ''}
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
// mark is where you are, a small flag is where an even spread would be. A
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
    marks += `<line class="in-dial__m in-dial__m--${lit}${major ? ' is-major' : ''}" x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}"/>`;
  }
  const [nx1, ny1] = pt(ang(fs), R + 5);
  const [nx2, ny2] = pt(ang(fs), R - 26);
  const [z0x, z0y] = pt(ang(0), R - 36);
  const [z1x, z1y] = pt(ang(1), R - 36);
  // The flag has no words on the dial (they ran into the marks when the pace was near
  // the start); instrumentTop says what it is in one line under the dial.
  const flag = x.finished || !(x.limit > 0) ? '' : (() => {
    const [fx, fy] = pt(ang(fp), R + 9);
    return `<path class="in-dial__flag" d="M${n1(fx)} ${n1(fy)} l-4 -6 l8 0z" transform="rotate(${n1(ang(fp))} ${n1(fx)} ${n1(fy)})"/>`;
  })();
  const total = x.limit > 0 ? formatRupees(x.limit) : '';
  return `<svg class="in-dial" viewBox="0 0 326 236" role="img" aria-label="${formatRupees(x.spent)} spent${x.limit > 0 ? ` of ${total}` : ''}${flag ? `, an even pace would be ${formatRupees(x.pace)} by now` : ''}">
      ${marks}
      <line class="in-dial__needle" x1="${n1(nx1)}" y1="${n1(ny1)}" x2="${n1(nx2)}" y2="${n1(ny2)}"/>
      ${flag}
      <text class="in-dial__end" x="${n1(z0x)}" y="${n1(z0y + 22)}" text-anchor="middle">₹0</text>
      ${total ? `<text class="in-dial__end" x="${n1(z1x)}" y="${n1(z1y + 22)}" text-anchor="middle">${total}</text>` : ''}
      <text class="in-dial__cap" x="${cx}" y="${cy - 46}" text-anchor="middle">LEFT TO SPEND</text>
      <text class="in-dial__fig${negative ? ' is-negative' : ''}" x="${cx}" y="${cy + 8}" text-anchor="middle">${formatRupees(x.left)}</text>
      <text class="in-dial__sub" x="${cx}" y="${cy + 32}" text-anchor="middle">${x.limit > 0 ? `${formatRupees(x.spent)} spent of ${total}` : `${formatRupees(x.spent)} spent`}</text>
    </svg>`;
}

export function instrumentTop(f, status, month) {
  const x = topFigures(f);
  const hero = `<div class="tl-hero in-hero ${f.free < 0 ? 'is-negative' : ''}">
      <div class="tl-top"><span class="tl-k">Budget dial</span><span class="tl-period">${x.period}</span></div>
      ${instrumentDial(x, f.free < 0)}
      ${x.finished || !(x.limit > 0) ? '' : `<p class="in-legend"><i class="in-legend__flag"></i>Even pace by today <b>${formatRupees(x.pace)}</b></p>`}
      <p class="in-status ${tone(f)}"><span class="in-led"></span><span>${escapeHtml(status)}</span></p>
      <div class="tl-stats">
        <div><span class="tl-k">Spent</span><b>${formatRupees(x.spent)}</b></div>
        <div><span class="tl-k">Budget</span><b>${formatRupees(x.limit)}</b></div>
        <div><span class="tl-k">${x.finished ? 'Days' : 'A day'}</span><b>${x.finished ? x.monthDays : x.perDay > 0 ? formatRupees(x.perDay) : '-'}</b></div>
      </div>
      ${x.asideUsed != null ? `<div class="tl-prog tl-prog--aside"><i style="width:${pct(x.asideUsed)}"></i><span><span>Set aside used</span><span>${formatRupees(x.asideSpent)} of ${formatRupees(x.asideTotal)}</span></span></div>` : ''}
    </div>`;
  return tactileTop(f, status, month, hero);
}

/* --- Peaks: the pale panel with a donut, the mountains, slate cards ------ */
// The week as the reference's smooth orange line, today's point in teal.
function weekLine(x) {
  const n = x.week.length;
  if (n < 2) return weekCols(x, 'pk-cols');
  const W = 300, H = 72;
  const top = Math.max(1, ...x.week.map((d) => d.amount || 0));
  const px = (i) => 10 + (i * (W - 20)) / (n - 1);
  const py = (v) => H - 10 - (v / top) * (H - 26);
  const pts = x.week.map((d, i) => [px(i), py(d.amount || 0)]);
  const line = pts.reduce((d, [a, b], i) => {
    if (!i) return `M${a.toFixed(1)} ${b.toFixed(1)}`;
    const [qa, qb] = pts[i - 1];
    const m = (a - qa) / 2;
    return `${d} C${(qa + m).toFixed(1)} ${qb.toFixed(1)} ${(a - m).toFixed(1)} ${b.toFixed(1)} ${a.toFixed(1)} ${b.toFixed(1)}`;
  }, '');
  const [lx, ly] = pts[n - 1];
  return `<svg class="pk-wline" viewBox="0 0 ${W} ${H}" role="img" aria-label="This week ${formatRupees(x.weekTotal)}">
      <path class="pk-wline__area" d="${line} L${lx.toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z"/>
      <path class="pk-wline__l" d="${line}"/>
      ${pts.slice(0, -1).map(([a, b]) => `<circle class="pk-wline__dot" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="2.5"/>`).join('')}
      <circle class="pk-wline__now" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4"/>
    </svg>
    <div class="pk-wdays">${x.week.map((d) => `<small>${dow(d.date)}</small>`).join('')}</div>`;
}

const arc = (r, a0, a1) => {
  const T = (v) => -Math.PI / 2 + v * 2 * Math.PI;
  const p = (a) => [75 + r * Math.cos(T(a)), 75 + r * Math.sin(T(a))];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export function peaksTop(f, status, month) {
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
  return `<div class="pk-panel ${f.free < 0 ? 'is-negative' : ''}">
      <div class="pk-top"><span class="pk-lab">Left to spend</span><span class="pk-tiny">${x.period}</span></div>
      <div class="pk-ring">${donut}<div class="pk-ring__mid"><b>${formatRupees(x.left)}</b><small>left</small></div></div>
      <div class="pk-figs">
        <div><div class="pk-n pk-n--l">${sup(plain(x.spent))}</div><div class="pk-tiny">spent${x.limit > 0 ? ` of ${formatRupees(x.limit)}` : ''}${x.finished ? '' : ` · <span class="pk-hot">${formatRupees(x.weekTotal)} this week</span>`}</div></div>
        <div class="pk-pair">
          ${x.finished ? '' : `<div><div class="pk-n pk-n--m">${x.perDay > 0 ? sup(plain(x.perDay)) : '-'}</div><div class="pk-tiny">a day</div></div>`}
          ${x.asideUsed != null ? `<div><div class="pk-n pk-n--m">${sup(plain(x.asideSpent))}</div><div class="pk-tiny">of ${formatRupees(x.asideTotal)} set aside</div></div>` : ''}
        </div>
      </div>
      <div class="pk-foot">
        <div><span class="pk-tiny">Budget</span><b>${formatRupees(x.limit)}</b></div>
        ${x.finished ? `<div><span class="pk-tiny">Days</span><b>${x.monthDays}</b></div>` : `<div><span class="pk-tiny">Days left</span><b>${x.daysLeft}</b></div>
        <div><span class="pk-tiny">Day</span><b>${x.day} of ${x.monthDays}</b></div>`}
      </div>
      <p class="pk-status ${tone(f)}">${escapeHtml(status)}</p>
    </div><!--k:answer-->
    ${month || ''}<!--k:month-->
    ${x.week.length && !x.finished ? `<div class="pk-card pk-week"><div class="pk-row"><span class="pk-lab">This week</span><span class="pk-n pk-n--s">${sup(plain(x.weekTotal))}</span></div>${weekLine(x)}</div>` : ''}
    ${x.cards.length && !x.finished ? `<div class="pk-card"><div class="pk-row"><span class="pk-lab">Owed on cards${x.bills ? ` · <span class="pk-hot">${bills(x.bills)}</span>` : ''}</span><span class="pk-n pk-n--m">${sup(plain(x.owedCards))}</span></div>
      <div class="pk-bars">${x.cards.map((c) => `<div class="pk-bar">${tagHtml(c)}<span class="pk-trk">${cardBar(c)}</span><b>${plain(c.amount)}</b>${cardKey(c, plain)}</div>`).join('')}</div>${cardLegend(x.cards)}</div>` : ''}
    ${(x.kept || x.employer) && !x.finished ? `<div class="pk-two" data-owed-anchor>
      ${x.kept ? `<button type="button" class="pk-card" id="set-aside-stat"><span class="pk-lab">Kept back</span><span class="pk-n pk-n--m">${sup(plain(x.kept))}</span><span class="pk-tiny">set aside, not spent yet</span></button>` : ''}
      ${x.employer ? `<button type="button" class="pk-card" id="owed-back-stat"><span class="pk-lab">Owed back</span><span class="pk-n pk-n--m pk-good">${sup(plain(x.employer))}</span><span class="pk-tiny">by your employer</span></button>` : ''}
    </div>` : ''}
    ${x.coming.length && !x.finished ? `<div class="pk-card pk-coming">
      <div class="pk-lab">Coming up</div>
      <div class="pk-dashes">${x.coming
        .map((c) => `<div class="pk-dash"><span class="pk-dash__t">${escapeHtml(c.label)}<small>${formatDateNice(c.due)}${c.late ? ' · late' : ''}</small></span><span class="pk-ln"><i class="${c.late ? 'late' : ''}" style="left:${monthPos(c.due)}"></i>${f.today ? `<u style="left:${monthPos(f.today)}"></u>` : ''}</span><b>${plain(c.amount)}</b></div>`)
        .join('')}</div>
      <div class="pk-still"><span class="pk-n pk-n--s">${sup(plain(x.stillToPay))}</span><span class="pk-tiny">still to pay</span></div>
      ${pines()}
    </div>` : ''}`;
}

const monthPos = (iso) => {
  const d = Number(iso.slice(8, 10));
  const last = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0).getDate();
  return pct((d - 1) / Math.max(1, last - 1));
};

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

export function mindoraTop(f, status, month) {
  const x = topFigures(f);
  const now = mood(f);
  const line = (label, v, cls, said) => `<div class="md-spent"><span>${label}</span><span>${said}</span></div><div class="md-prog"><i class="${cls}" style="width:${pct(v)}"></i></div>`;
  return `<div class="md-glass md-hero ${f.free < 0 ? 'is-negative' : ''}">
      <div class="md-top"><span class="md-kick">Left to spend</span><span class="md-period">${x.period}</span></div>
      <div class="md-big">${formatRupees(x.left)}</div>
      <div class="md-stats">
        <div><span class="md-kick">Spent</span><b>${formatRupees(x.spent)}</b></div>
        <div><span class="md-kick">Budget</span><b>${formatRupees(x.limit)}</b></div>
        <div><span class="md-kick">${x.finished ? 'Days' : 'A day'}</span><b>${x.finished ? x.monthDays : x.perDay > 0 ? formatRupees(x.perDay) : '-'}</b></div>
      </div>
      ${line('Spent', x.used, tone(f), ofLimit(x))}
      ${line(`Day ${x.day} of ${x.monthDays}`, x.gone, 'sky', x.finished ? 'month done' : `${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} left`)}
      ${x.asideUsed != null ? line('Set aside used', x.asideUsed, 'blush', `${formatRupees(x.asideSpent)} of ${formatRupees(x.asideTotal)}`) : ''}
    </div>
    <div class="md-glass">
      <div class="md-kick">${x.finished ? 'The month' : 'The month so far'}</div>
      <div class="md-moods">${MOODS.map(([id, word, smile]) => `<span class="md-mood md-mood--${id}${id === now ? ' on' : ''}"><b>${face(smile)}</b>${word}</span>`).join('')}</div>
      <p class="md-line ${tone(f)}">${escapeHtml(status)}</p>
    </div><!--k:answer-->
    ${month || ''}<!--k:month-->
    ${x.week.length && !x.finished ? `<div class="md-glass"><div class="md-top"><span class="md-kick">This week</span><span class="md-mid">${formatRupees(x.weekTotal)}</span></div>${weekCols(x, 'md-cols')}</div>` : ''}
    ${x.cards.length && !x.finished ? `<div class="md-glass"><div class="md-top"><span class="md-kick">Owed on cards</span><span class="md-mid">${formatRupees(x.owedCards)}</span></div>${x.bills ? `<span class="md-badge">${bills(x.bills)}</span>` : ''}
      <div class="md-bars">${x.cards.map((c) => `<div class="md-bar">${tagHtml(c)}<span class="md-prog">${cardBar(c)}</span><b>${formatRupees(c.amount)}</b>${cardKey(c)}</div>`).join('')}</div>${cardLegend(x.cards)}</div>` : ''}
    ${(x.kept || x.employer) && !x.finished ? `<div class="md-split" data-owed-anchor>
      ${x.kept ? `<button type="button" class="md-glass md-lake" id="set-aside-stat">${lake()}<span class="md-lake__text"><span class="md-kick">Kept back</span><span class="md-mid">${formatRupees(x.kept)}</span><small>set aside, not spent yet</small></span></button>` : ''}
      ${x.employer ? `<button type="button" class="md-glass md-small" id="owed-back-stat"><span class="md-kick">Owed back</span><span class="md-mid md-good">${formatRupees(x.employer)}</span><small class="md-sub">by your employer</small></button>` : ''}
    </div>` : ''}
    ${x.coming.length && !x.finished ? `<div class="md-glass">
      <div class="md-top"><span class="md-kick">Coming up</span><span class="md-sub">${formatRupees(x.stillToPay)} still to pay</span></div>
      <div class="md-steps">${x.coming.map((c) => `<div class="md-step${c.late ? ' late' : ''}"><b>${categoryStyle(c.label).icon}</b><small><em>${escapeHtml(c.label)}</em>${formatRupees(c.amount)}<span>${formatDateNice(c.due)}${c.late ? ' · late' : ''}</span></small></div>`).join('')}</div>
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
