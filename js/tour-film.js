// The tour: one minute of Kawach, drawn live in the page rather than played
// from a video file. It is built from the app's own stylesheets, icons and
// number formatting, so it looks like the app because it is made of the app,
// it weighs a few kilobytes instead of a megabyte and a half, and it works
// offline like everything else.
//
// Every figure is made up. The arithmetic still adds up, because a tour that
// shows a sum that doesn't work would be the first thing someone notices.
//
// How it moves: every moving part is one Web Animation that runs the whole
// sixty seconds, held paused, and the clock below sets them all to the same
// moment. Numbers and typed text are worked out from that moment too. So the
// film is a function of time: scrubbing to 0:31 shows exactly what playing
// to 0:31 shows, and nothing drifts.
import { icon } from './icons.js';
import { brandMark } from './brand.js';
import { categoryStyle } from './category-style.js';
import { formatRupees } from './format.js';

const LENGTH = 60000;
// The frame shown when the tour does not start by itself: the sum done.
const POSTER = 17200;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SOFT = 'cubic-bezier(0.4, 0, 0.2, 1)';

const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?t=31000 opens on that moment and waits, for a still to share or check.
const startAt = Number(params.get('t')) || 0;
const autoplay = params.get('autoplay') !== '0' && !startAt && !reduceMotion;

const stage = document.getElementById('stage');
const playBtn = document.getElementById('tf-play');
const scrub = document.getElementById('tf-scrub');
const timeText = document.getElementById('tf-time');

const rupees = (r) => formatRupees(Math.round(r) * 100);

function chip(category) {
  const style = categoryStyle(category);
  return `<span class="cat-chip hist-cat" style="--chip-color:${style.color}">${style.icon}</span>`;
}

function histRow(name, category, sub, amount, extra = '') {
  return `<div class="hist-row${extra}">${chip(category)}<span class="hist-text"><span class="hist-name">${name}</span><span class="hist-sub">${sub}</span></span><span class="txn-amount out">${amount}</span></div>`;
}

const NAV = [
  ['summary', 'Summary'],
  ['add', 'Add'],
  ['accounts', 'Accounts'],
  ['plan', 'Plan'],
  ['history', 'History'],
  ['coach', 'Coach'],
];

stage.innerHTML = `
  <div class="tf-words tf-tenets">
    <div class="tf-tenet" data-a="t1">Zero tracking.</div>
    <div class="tf-tenet" data-a="t2">Zero sign-ups.</div>
    <div class="tf-tenet" data-a="t3">Works <b>offline</b>.</div>
    <div class="tf-tenet-sub" data-a="t4">Your money stays on your phone.</div>
  </div>

  <div class="tf-words tf-caption">
    <span data-a="c1">Left to spend, worked out for you</span>
    <span data-a="c2">And what you owe, at a glance</span>
    <span data-a="c3">Pay a card bill from Accounts</span>
    <span data-a="c4">Both accounts update. Once.</span>
    <span data-a="c5">Mark what your employer pays back</span>
    <span data-a="c6">Work costs never touch what you can spend</span>
  </div>

  <div class="tf-phone" data-a="phone">
    <div class="tf-screen">
      <div class="tf-notch"></div>
      <div class="tf-head">
        <div class="tf-head-title">
          <span data-a="h-summary">Summary</span>
          <span data-a="h-accounts">Accounts</span>
          <span data-a="h-add">Add</span>
          <span data-a="h-history">History</span>
        </div>
        ${icon('settings')}
      </div>

      <section class="tf-view k" data-a="v-summary">
        <div class="hero">
          <div class="hero-top"><span class="hero-label">Left to spend</span><span class="hero-label">October</span></div>
          <p class="hero-amount" data-n="left"></p>
          <div class="hero-meter"><div class="hero-meter-fill" data-a="meter"></div></div>
          <p class="hero-status">On track for the month</p>
          <i class="tf-glow" data-a="g0"></i>
        </div>
        <div class="hero-under">
          <div class="stat"><span class="stat-v" data-n="spent"></span><span class="stat-k">Spent this month</span></div>
          <div class="stat"><span class="stat-v">${rupees(31500)}</span><span class="stat-k">Budget</span></div>
        </div>
        <div class="hero-under summary-owed" data-a="owed">
          <div class="stat"><span class="stat-v" data-n="owedCards"></span><span class="stat-k">Owed on cards</span><i class="tf-glow" data-a="g1"></i></div>
          <div class="stat"><span class="stat-v" data-n="owedBack"></span><span class="stat-k">Owed back by employer</span><i class="tf-glow" data-a="g2"></i></div>
        </div>
        <div class="tf-sum" data-a="sum">
          <div class="tf-sum-row" data-a="r1"><span>Monthly income</span><b>${rupees(120000)}</b></div>
          <div class="tf-sum-row" data-a="r2"><span>Fixed commitments</span><b>&minus;${rupees(78500)}</b></div>
          <div class="tf-sum-row" data-a="r3"><span>Saved each month</span><b>&minus;${rupees(10000)}</b></div>
          <div class="tf-sum-row" data-a="r4"><span>Spent so far</span><b>&minus;${rupees(16350)}</b></div>
          <div class="tf-sum-row tf-sum-total" data-a="r5"><span>Left to spend</span><b>${rupees(15150)}</b></div>
        </div>
      </section>

      <section class="tf-view k" data-a="v-accounts">
        <div class="tf-list">
          <div class="k-row account-row">${brandMark('Salary account')}<span class="k-row__body"><span class="k-row__title">Salary account</span><span class="k-row__meta">Bank</span></span><span class="k-row__value" data-n="bank"></span></div>
          <div class="k-row account-row">${brandMark('Travel card')}<span class="k-row__body"><span class="k-row__title">Travel card</span><span class="k-row__meta">Card &middot; 7421</span></span><span class="k-row__value out" data-n="travel"></span></div>
          <div class="tf-bill">
            <div class="tf-bill-line">
              <span data-a="due">Due 14 Oct &middot; Min ${rupees(1422)}</span>
              <span class="tf-paid" data-a="paid">${icon('check')} Paid</span>
              <b>${rupees(28437)}</b>
            </div>
            <span class="tf-link" data-tap="mark" data-a="markLink">Mark bill paid</span>
            <div class="tf-panel" data-a="panel">
              <div class="tf-panel-inner">
                <span class="k-label">Paid from</span>
                <div class="tf-picker">${brandMark('Salary account', { size: 'sm' })}Salary account</div>
                <div class="tf-sms">Paste the bank's message (optional)</div>
                <span class="k-btn k-btn--primary" data-tap="confirm">Confirm</span>
              </div>
            </div>
          </div>
          <div class="k-row account-row">${brandMark('Shopping card')}<span class="k-row__body"><span class="k-row__title">Shopping card</span><span class="k-row__meta">Card &middot; 3308</span></span><span class="k-row__value out">${rupees(3120)}</span></div>
        </div>
      </section>

      <section class="tf-view k" data-a="v-add">
        <div class="hero amount-hero">
          <span class="hero-label">Amount</span>
          <div class="tf-amount"><span data-n="amount"></span><i class="tf-caret" data-a="caret1"></i></div>
        </div>
        <div class="tf-add-field"><span class="k-label">What for</span><div class="k-input"><span data-n="note"></span><i class="tf-caret" data-a="caret2"></i></div></div>
        <div class="tf-chips">
          <span class="tf-chip" data-tap="food">${categoryStyle('Food').icon}Food<i class="tf-chip-on" data-a="chipOn"></i></span>
          <span class="tf-chip">${categoryStyle('Travel').icon}Travel</span>
          <span class="tf-chip">${categoryStyle('Shopping').icon}Shopping</span>
        </div>
        <div class="k-switch-row">
          <span class="k-switch-row__text">Reimbursable (Work)<span class="k-switch-row__sub">Your employer will pay this back</span></span>
          <span class="k-toggle" role="presentation" data-n="toggle" data-tap="toggle"></span>
          <i class="tf-glow" data-a="g3"></i>
        </div>
        <span class="k-btn k-btn--primary tf-save" data-tap="save">Save</span>
      </section>

      <section class="tf-view k" data-a="v-history">
        <div class="tf-day"><span>Today</span><span class="out" data-n="today"></span></div>
        <div class="tf-hist">
          <div class="tf-new" data-a="newRow">${histRow('Client lunch', 'Food', `2:45 pm <span class="hist-tag">Owed back</span>`, rupees(2450), ' tf-new-row')}</div>
          ${histRow('Annapurna Tiffins', 'Food', '1:10 pm', rupees(180))}
          ${histRow('Metro card top-up', 'Metro', '9:02 am', rupees(500))}
        </div>
        <div class="tf-day" style="margin-top:14px"><span>Yesterday</span><span class="out">${rupees(1240)}</span></div>
        <div class="tf-hist">
          ${histRow('Fresh Basket', 'Groceries', '7:30 pm', rupees(1240))}
        </div>
      </section>

      <div class="tf-toast" data-a="toast">${icon('check')}Saved</div>
      <nav class="tf-nav">
        ${NAV.map(([key, label]) => `
          <span class="tf-nav-btn" data-tap="nav-${key}">${icon(key)}<span>${label}</span>
            <span class="tf-nav-on" data-a="on-${key}">${icon(key)}<span>${label}</span></span>
          </span>`).join('')}
      </nav>
      <div class="tf-boot" data-a="boot"><img src="./icons/kawach.svg" alt=""></div>
      <div class="tf-finger" data-a="finger"></div>
    </div>
  </div>

  <div class="tf-words tf-outro" data-a="outro">
    <img class="tf-outro-mark" src="./icons/kawach.svg" alt="" data-a="o1">
    <div class="tf-outro-line" data-a="o2">Your wealth.<br>Your device.</div>
    <div class="tf-outro-name" data-a="o3">Kawach</div>
  </div>
  <div class="tf-black" data-a="black"></div>
`;

const $ = (name) => stage.querySelector(`[data-a="${name}"]`);
const $n = (name) => stage.querySelector(`[data-n="${name}"]`);
const $tap = (name) => stage.querySelector(`[data-tap="${name}"]`);

// ---- the timeline ------------------------------------------------------

const animations = [];

// One element, one animation for the whole film. Frames are [seconds, props,
// easing into the next frame]. A property a frame leaves out keeps the value
// it had, so each frame only says what changes.
function track(el, frames) {
  const keys = [];
  let carried = {};
  for (const [, props] of frames) for (const p of Object.keys(props)) if (!(p in carried)) carried[p] = props[p];
  for (const [s, props, easing] of frames) {
    carried = { ...carried, ...props };
    keys.push({ ...carried, offset: Math.min(1, (s * 1000) / LENGTH), easing: easing || EASE });
  }
  if (keys[0].offset > 0) keys.unshift({ ...keys[0], offset: 0, easing: 'linear' });
  if (keys[keys.length - 1].offset < 1) keys.push({ ...keys[keys.length - 1], offset: 1 });
  const a = el.animate(keys, { duration: LENGTH, fill: 'both' });
  a.pause();
  animations.push(a);
}

// Something that appears, stays, and goes: words, glows, captions.
function showFor(el, from, to, { rise = 10, fade = 0.45 } = {}) {
  track(el, [
    [from, { opacity: 0, transform: `translateY(${rise}px)` }],
    [from + fade, { opacity: 1, transform: 'translateY(0)' }],
    [to - fade, { opacity: 1, transform: 'translateY(0)' }, SOFT],
    [to, { opacity: 0, transform: `translateY(${-rise / 2}px)` }],
  ]);
}

// A glow round something worth looking at, once or more: [from, to], ...
function pulse(el, ...spans) {
  track(el, spans.flatMap(([from, to]) => [
    [from, { opacity: 0 }],
    [from + 0.4, { opacity: 1 }],
    [to - 0.5, { opacity: 0.8 }, SOFT],
    [to, { opacity: 0 }],
  ]));
}

// A screen's comings and goings, the way the app swaps screens: a short
// fade with a small rise.
function screen(name, spans) {
  for (const el of [$(`v-${name}`), $(`h-${name}`)]) {
    const frames = [[0, { opacity: 0, transform: 'translateY(8px)', visibility: 'hidden' }]];
    for (const [from, to] of spans) {
      frames.push([from, { opacity: 0, transform: 'translateY(8px)', visibility: 'visible' }]);
      frames.push([from + 0.35, { opacity: 1, transform: 'translateY(0)' }]);
      frames.push([to, { opacity: 1, transform: 'translateY(0)' }, SOFT]);
      frames.push([to + 0.2, { opacity: 0, transform: 'translateY(0)', visibility: 'visible' }]);
      frames.push([to + 0.21, { visibility: 'hidden' }]);
    }
    track(el, frames);
  }
  const on = $(`on-${name === 'history' ? 'history' : name}`);
  const navFrames = [[0, { opacity: 0 }]];
  for (const [from, to] of spans) navFrames.push([from, { opacity: 0 }], [from + 0.2, { opacity: 1 }], [to, { opacity: 1 }], [to + 0.15, { opacity: 0 }]);
  track(on, navFrames);
}

function build() {
  // 0-5s: what Kawach promises, before anything of it is shown.
  [['t1', 0.4], ['t2', 1.3], ['t3', 2.2], ['t4', 3.2]].forEach(([name, at]) => {
    track($(name), [
      [at, { opacity: 0, transform: 'translateY(24px)', filter: 'blur(8px)' }],
      [at + 0.7, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }],
      [4.9, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0px)' }, SOFT],
      [5.4, { opacity: 0, transform: 'translateY(-18px)', filter: 'blur(6px)' }],
    ]);
  });

  // The phone arrives, opens on the shield, and the shield gives way to
  // Summary. Then it leans in on the figure that matters, pulls back for
  // the rest, leans in on the bill, and at the end turns and goes.
  const exit = reduceMotion
    ? [[55.2, { transform: 'perspective(1400px) rotateY(0deg) scale(1)', opacity: 1 }, SOFT], [56.6, { transform: 'perspective(1400px) rotateY(0deg) scale(0.9)', opacity: 0 }]]
    : [[55.2, { transform: 'perspective(1400px) rotateY(0deg) scale(1)', opacity: 1 }, 'cubic-bezier(0.55, 0, 0.75, 0.3)'], [56.8, { transform: 'perspective(1400px) rotateY(160deg) scale(0.35)', opacity: 0 }]];
  track($('phone'), [
    [5.2, { transform: 'perspective(1400px) rotateY(0deg) scale(0.86) translateY(40px)', opacity: 0, filter: 'blur(14px)', transformOrigin: '50% 40%' }],
    [6.4, { transform: 'perspective(1400px) rotateY(0deg) scale(1) translateY(0)', opacity: 1, filter: 'blur(0px)' }],
    [9.6, { transform: 'perspective(1400px) rotateY(0deg) scale(1) translateY(0)', transformOrigin: '50% 22%' }, SOFT],
    [10.6, { transform: 'perspective(1400px) rotateY(0deg) scale(1.1) translateY(0)' }],
    [17.8, { transform: 'perspective(1400px) rotateY(0deg) scale(1.1) translateY(0)' }, SOFT],
    [18.7, { transform: 'perspective(1400px) rotateY(0deg) scale(1) translateY(0)' }],
    [27.0, { transform: 'perspective(1400px) rotateY(0deg) scale(1) translateY(0)', transformOrigin: '50% 34%' }, SOFT],
    [27.9, { transform: 'perspective(1400px) rotateY(0deg) scale(1.1) translateY(0)' }],
    [38.4, { transform: 'perspective(1400px) rotateY(0deg) scale(1.1) translateY(0)' }, SOFT],
    [39.3, { transform: 'perspective(1400px) rotateY(0deg) scale(1) translateY(0)', transformOrigin: '50% 50%' }],
    ...exit,
  ]);
  track($('boot'), [[6.0, { opacity: 1 }], [7.9, { opacity: 1 }, SOFT], [8.5, { opacity: 0, visibility: 'visible' }], [8.51, { visibility: 'hidden' }]]);
  track($('boot').firstElementChild, [
    [5.6, { transform: 'scale(0.7)', opacity: 0, filter: 'drop-shadow(0 0 0 transparent)' }],
    [6.6, { transform: 'scale(1)', opacity: 1, filter: 'drop-shadow(0 0 24px oklch(80% 0.14 220 / 0.6))' }],
    [7.9, { transform: 'scale(1.04)', opacity: 1 }],
    [8.5, { transform: 'scale(1.3)', opacity: 0 }],
  ]);

  // Which screen is on, and when. The finger's taps below line up with these.
  screen('summary', [[0, 24.7], [51.1, 60]]);
  screen('accounts', [[24.9, 40.1]]);
  screen('add', [[40.3, 47.9]]);
  screen('history', [[48.1, 50.9]]);

  // Captions, one short line each.
  showFor($('c1'), 9.0, 18.5);
  showFor($('c2'), 18.8, 24.6);
  showFor($('c3'), 25.2, 32.9);
  showFor($('c4'), 33.1, 39.9);
  showFor($('c5'), 40.3, 47.6);
  showFor($('c6'), 47.9, 55.0);

  // The sum, line by line, while the figure above counts down with it.
  [['r1', 10.6], ['r2', 12.0], ['r3', 13.6], ['r4', 15.0], ['r5', 16.6]].forEach(([name, at]) => {
    track($(name), [[at, { opacity: 0, transform: 'translateX(-10px)' }], [at + 0.5, { opacity: 1, transform: 'translateX(0)' }]]);
  });
  track($('sum'), [[10.4, { opacity: 1 }], [17.9, { opacity: 1 }, SOFT], [18.5, { opacity: 0 }]]);
  track($('owed'), [[8.0, { opacity: 0 }], [18.3, { opacity: 0 }], [18.9, { opacity: 1 }]]);
  track($('meter'), [[15.0, { width: '0%' }], [16.0, { width: '52%' }]]);
  pulse($('g1'), [19.4, 22.0]);
  pulse($('g2'), [21.6, 24.4], [51.8, 54.8]);
  pulse($('g0'), [53.0, 55.0]);

  // The bill: open the panel, confirm, and the bill turns to paid.
  const panelHeight = $('panel').firstElementChild.offsetHeight;
  track($('panel'), [[28.7, { height: '0px' }], [29.3, { height: `${panelHeight}px` }], [32.6, { height: `${panelHeight}px` }, SOFT], [33.1, { height: '0px' }]]);
  track($('markLink'), [[32.6, { opacity: 1 }], [32.9, { opacity: 0 }]]);
  track($('due'), [[32.8, { opacity: 1 }], [33.1, { opacity: 0 }]]);
  track($('paid'), [[33.0, { opacity: 0, transform: 'scale(0.9)' }], [33.4, { opacity: 1, transform: 'scale(1)' }]]);

  // Adding a work cost.
  track($('caret1'), [[40.3, { opacity: 1 }], [42.2, { opacity: 1 }], [42.21, { opacity: 0 }]]);
  track($('caret2'), [[42.2, { opacity: 0 }], [42.21, { opacity: 1 }], [43.9, { opacity: 1 }], [43.91, { opacity: 0 }]]);
  track($('chipOn'), [[44.2, { opacity: 0 }], [44.4, { opacity: 1 }]]);
  pulse($('g3'), [45.3, 47.6]);
  track($('toast'), [
    [46.7, { opacity: 0, transform: 'translate(-50%, 10px)' }],
    [47.0, { opacity: 1, transform: 'translate(-50%, 0)' }],
    [48.4, { opacity: 1, transform: 'translate(-50%, 0)' }, SOFT],
    [48.8, { opacity: 0, transform: 'translate(-50%, 0)' }],
  ]);
  track($('newRow'), [[48.5, { height: '0px', opacity: 0 }], [49.1, { height: '58px', opacity: 1 }]]);

  // The close: the phone goes, and the promise is said once more.
  track($('outro'), [[0, { opacity: 0 }], [56.2, { opacity: 0 }], [56.21, { opacity: 1 }]]);
  track($('o1'), [[56.3, { opacity: 0, transform: 'scale(0.6)' }], [57.1, { opacity: 1, transform: 'scale(1)' }]]);
  track($('o2'), [[56.8, { opacity: 0, transform: 'translateY(14px)' }], [57.5, { opacity: 1, transform: 'translateY(0)' }]]);
  track($('o3'), [[57.4, { opacity: 0, letterSpacing: '0.5em' }], [58.3, { opacity: 1, letterSpacing: '0.18em' }]]);
  track($('black'), [[0, { opacity: 0 }], [58.9, { opacity: 0 }, SOFT], [60, { opacity: 1 }]]);
}

// ---- numbers, text and switches, worked out from the moment ------------

// The value at time s along [[time, value], ...], eased between points.
function along(s, points) {
  if (s <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    const [t0, v0] = points[i - 1];
    if (s < t1) {
      const x = (s - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (1 - (1 - x) ** 3);
    }
  }
  return points[points.length - 1][1];
}

// Text typed one piece at a time: [[time, text], ...].
const typed = (s, steps) => steps.reduce((text, [at, value]) => (s >= at ? value : text), '');

const NOTE = 'Client lunch';
const noteSteps = [...NOTE].map((_, i) => [42.3 + i * 0.12, NOTE.slice(0, i + 1)]);

const figures = [
  [$n('left'), (s) => rupees(along(s, [[12.0, 120000], [13.0, 41500], [13.6, 41500], [14.3, 31500], [15.0, 31500], [16.0, 15150]]))],
  [$n('spent'), (s) => rupees(along(s, [[15.0, 0], [16.0, 16350]]))],
  [$n('owedCards'), (s) => rupees(s < 33 ? 31557 : 3120)],
  [$n('owedBack'), (s) => rupees(along(s, [[52.0, 4350], [52.8, 6800]]))],
  [$n('bank'), (s) => rupees(along(s, [[33.4, 124610], [34.6, 96174]]))],
  [$n('travel'), (s) => rupees(along(s, [[33.4, 28437], [34.6, 0]]))],
  [$n('amount'), (s) => `₹${typed(s, [[40.9, '2'], [41.25, '24'], [41.6, '245'], [41.95, '2,450']])}`],
  [$n('note'), (s) => typed(s, noteSteps)],
  [$n('today'), (s) => rupees(s < 48.5 ? 680 : 3130)],
];

const toggle = $n('toggle');

// ---- the fingertip -------------------------------------------------------

const TAPS = [
  [24.6, 'nav-accounts'],
  [28.6, 'mark'],
  [32.5, 'confirm'],
  [40.1, 'nav-add'],
  [44.2, 'food'],
  [45.3, 'toggle'],
  [46.6, 'save'],
  [47.9, 'nav-history'],
  [50.9, 'nav-summary'],
];
const finger = $('finger');
const screenEl = stage.querySelector('.tf-screen');

// Where an element sits inside the phone's screen, ignoring the film's own
// zooms, which move the screen and the fingertip together.
function centre(el) {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  for (let n = el; n && n !== screenEl; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return [x, y];
}

function placeFinger(s) {
  const tap = TAPS.find(([at]) => s > at - 0.8 && s < at + 0.5);
  if (!tap) {
    finger.style.opacity = '0';
    return;
  }
  const [at, name] = tap;
  const [x, y] = centre($tap(name));
  const lead = Math.max(0, Math.min(1, (at - s) / 0.6));
  const ease = lead * lead;
  const opacity = s < at ? Math.min(1, (s - (at - 0.8)) / 0.2) : Math.max(0, 1 - (s - at) / 0.5);
  const pressed = Math.abs(s - at) < 0.12 ? 0.78 : 1;
  finger.style.opacity = String(opacity);
  finger.style.transform = `translate(${x + ease * 34}px, ${y + ease * 56}px) scale(${pressed})`;
}

// ---- the clock -----------------------------------------------------------

let now = 0;
let playing = false;
let lastFrame = 0;

const clockText = (ms) => {
  const secs = Math.floor(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

function show(ms) {
  fit();
  now = Math.max(0, Math.min(LENGTH, ms));
  const s = now / 1000;
  for (const a of animations) a.currentTime = now;
  for (const [el, value] of figures) {
    const text = value(s);
    if (el.textContent !== text) el.textContent = text;
  }
  toggle.setAttribute('aria-checked', String(s >= 45.3));
  placeFinger(s);
  scrub.value = String(Math.round(now));
  timeText.textContent = `${clockText(now)} / ${clockText(LENGTH)}`;
}

function setPlaying(on) {
  playing = on;
  playBtn.innerHTML = icon(on ? 'pause' : 'play');
  playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  if (on) {
    if (now >= LENGTH) show(0);
    lastFrame = performance.now();
    requestAnimationFrame(tick);
  }
}

function tick(time) {
  if (!playing) return;
  // A tab put away and brought back skips no part of the film.
  const step = Math.min(100, time - lastFrame);
  lastFrame = time;
  show(now + step);
  if (now >= LENGTH) setPlaying(false);
  else requestAnimationFrame(tick);
}

function fit() {
  const frame = stage.parentElement;
  const scale = Math.min(frame.clientWidth / 400, frame.clientHeight / 820);
  const transform = `translate(-50%, -50%) scale(${scale})`;
  if (stage.style.transform !== transform) stage.style.transform = transform;
}

playBtn.addEventListener('click', () => setPlaying(!playing));
scrub.addEventListener('input', () => {
  setPlaying(false);
  show(Number(scrub.value));
});
// Its own box, not the window: inside the welcome page or the app the frame
// settles after the page has loaded, and the window never says so.
new ResizeObserver(fit).observe(stage.parentElement);
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && e.target === document.body) {
    e.preventDefault();
    setPlaying(!playing);
  } else if (e.key === 'Escape' && embedded) {
    // Played over the app: the app closes the tour.
    window.parent.postMessage('kawach-tour-close', location.origin);
  }
});

// Measured after the typeface is in, so the bill panel opens to its real height.
document.fonts.ready.then(() => {
  build();
  fit();
  show(autoplay ? 0 : startAt || POSTER);
  setPlaying(autoplay);
});

// For checking frames by hand: tourFilm.show(31000).
window.tourFilm = { show, length: LENGTH };
