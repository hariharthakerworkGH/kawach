// The tour: one minute of Kawach, made like a launch film and drawn live in
// the page rather than played from a video file. It is built from the app's
// own stylesheets, icons and number formatting, so it weighs a few kilobytes,
// works offline like everything else, and its screens are the app's parts.
//
// Every figure is made up, and the film says so on screen. The arithmetic
// still adds up, because a sum that doesn't work is the first thing a viewer
// would notice.
//
// How it moves: every moving part is one Web Animation that runs the whole
// sixty seconds, held paused, and one clock sets them all to the same moment.
// Numbers, typing and the particles on the canvas are worked out from that
// moment too. So the film is a function of time: scrubbing to 0:31 shows
// exactly what playing to 0:31 shows, and nothing drifts.
//
// Two stages: 1600 x 900 when the space is wide, 900 x 1600 when it is tall
// (a phone, the app's own tour box), each with its own layout. Things lifted
// out of the phone are measured from the phone at the moment they leave it,
// so they always start exactly where they were.
import { icon } from './icons.js';
import { brandMark } from './brand.js';
import { categoryStyle } from './category-style.js';
import { formatRupees } from './format.js';

const LENGTH = 60000;
// The frame shown when the film does not start by itself: the sum, done.
const POSTER = 18600;

// Motion. Expo out for anything arriving, a slow in-out for the camera, a
// hard in for anything leaving, a small overshoot for things that land.
const EX = 'cubic-bezier(0.16, 1, 0.3, 1)';
const IO = 'cubic-bezier(0.65, 0, 0.35, 1)';
const IN = 'cubic-bezier(0.7, 0, 0.84, 0)';
const SP = 'cubic-bezier(0.34, 1.5, 0.64, 1)';
const LIN = 'linear';

const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?t=31000 opens on that moment and waits, for a still to share or check.
const startAt = Number(params.get('t')) || 0;
// ?capture=1: the film alone, filling the window, nothing moving by the
// wall clock. This is how media/kawach-tour.mp4 is rendered, a frame at a
// time, so the video phones play is exactly this film.
const capture = params.has('capture');
if (capture) document.body.classList.add('is-capture');
const autoplay = params.get('autoplay') !== '0' && !startAt && !reduceMotion && !capture;

const stage = document.getElementById('stage');
const playBtn = document.getElementById('tf-play');
const scrub = document.getElementById('tf-scrub');
const timeText = document.getElementById('tf-time');

const rupees = (r) => formatRupees(Math.round(r) * 100);
const MINUS = '−';

// ---- the two stages ------------------------------------------------------

const LAND = {
  W: 1600, H: 900, land: true,
  home: { x: 1090, y: 465, s: 0.9 },
  away: { x: 1210, y: 500, s: 0.8, ry: -26, rx: 6, z: -160 },
  act3: { x: 1170, y: 465, s: 0.9 },
  center: { x: 800, y: 455, s: 0.9 },
  zoom: { x: 800, y: 440, s: 2.0 },
  heroF: { x: 470, y: 290, s: 1.3 },
  tiles: { x: 470, y0: 480, dy: 76, w: 440 },
  chips: [{ x: 860, y: 250, s: 1.55 }, { x: 1320, y: 300, s: 1.55 }],
  card: { x: 780, y: 505, ry: 24, rx: 4, rz: -5 },
  bankT: { x: 780, y: 205, s: 1.2 },
  giant: { x: 800, y: 760, size: 330 },
  pocket: { x: 760, y: 250 }, lock: { x: 760, y: 445 }, tileW: 330,
  fan: (i) => ({ x: 740, y: 215 + i * 122, s: 1.15, ry: 20, rz: 0, z: 30 - i * 10 }),
  shield: { x: 800, y: 400 }, shieldUp: { x: 800, y: 235, s: 0.72 }, shieldEnd: { x: 800, y: 270 },
  hl: {
    h1: { x: 0, y: 392, w: 1600, align: 'center', size: 96 },
    prom: { x: 0, y: 410, w: 1600, align: 'center', size: 62 },
    intro: { x: 120, y: 260, w: 760, align: 'left', size: 96 },
    h3: { x: 120, y: 545, w: 720, align: 'left', size: 78 },
    h4: { x: 120, y: 360, w: 560, align: 'left', size: 80 },
    h5: { x: 120, y: 320, w: 440, align: 'left', size: 80 },
    h6: { x: 120, y: 320, w: 440, align: 'left', size: 80 },
    h7: { x: 120, y: 300, w: 640, align: 'left', size: 88 },
    h8: { x: 120, y: 580, w: 800, align: 'left', size: 64 },
    h9: { x: 120, y: 320, w: 420, align: 'left', size: 78 },
    end: { x: 0, y: 425, w: 1600, align: 'center', size: 80 },
  },
  word: { y: 620, size: 104 }, rule: { y: 760, w: 420 }, url: { y: 785 },
  chapter: 'left:64px;top:54px', bug: 'right:64px;top:48px', note: 'left:64px;bottom:42px',
};

const PORT = {
  W: 900, H: 1600, land: false,
  home: { x: 450, y: 1040, s: 1 },
  away: { x: 450, y: 1250, s: 0.8, rx: 14, z: -120 },
  act3: { x: 450, y: 1130, s: 0.88 },
  center: { x: 450, y: 860, s: 1 },
  zoom: { x: 450, y: 820, s: 2.0 },
  heroF: { x: 450, y: 470, s: 1.18 },
  tiles: { x: 450, y0: 665, dy: 74, w: 440 },
  chips: [{ x: 250, y: 560, s: 1.4 }, { x: 650, y: 620, s: 1.4 }],
  card: { x: 450, y: 585, ry: 0, rx: 14, rz: -4 },
  bankT: { x: 450, y: 385, s: 1.15 },
  giant: { x: 450, y: 520, size: 250 },
  pocket: { x: 255, y: 470 }, lock: { x: 645, y: 470 }, tileW: 330,
  fan: (i) => ({ x: 450, y: 400 + i * 104, s: 1.12, ry: 0, rz: i % 2 ? 1.5 : -1.5, z: 30 }),
  shield: { x: 450, y: 720 }, shieldUp: { x: 450, y: 520, s: 0.72 }, shieldEnd: { x: 450, y: 540 },
  hl: {
    h1: { x: 60, y: 690, w: 780, align: 'center', size: 86, lines: 2 },
    prom: { x: 0, y: 690, w: 900, align: 'center', size: 58 },
    intro: { x: 60, y: 165, w: 780, align: 'center', size: 92 },
    h3: { x: 60, y: 150, w: 780, align: 'center', size: 72 },
    h4: { x: 60, y: 170, w: 780, align: 'center', size: 76 },
    h5: { x: 60, y: 120, w: 780, align: 'center', size: 72 },
    h6: { x: 60, y: 120, w: 780, align: 'center', size: 72 },
    h7: { x: 60, y: 160, w: 780, align: 'center', size: 80 },
    h8: { x: 60, y: 130, w: 780, align: 'center', size: 62 },
    h9: { x: 60, y: 160, w: 780, align: 'center', size: 76 },
    end: { x: 0, y: 740, w: 900, align: 'center', size: 76 },
  },
  word: { y: 930, size: 92 }, rule: { y: 1050, w: 360 }, url: { y: 1075 },
  chapter: 'left:48px;top:60px', bug: 'right:48px;top:54px', note: 'left:48px;bottom:48px',
};

let F = PORT;

// ---- small pieces of markup -----------------------------------------------

function chip(category) {
  const style = categoryStyle(category);
  return `<span class="cat-chip hist-cat" style="--chip-color:${style.color}">${style.icon}</span>`;
}

function histRow(name, category, sub, amount, extra = '') {
  return `<div class="hist-row${extra}" data-m="row">${chip(category)}<span class="hist-text"><span class="hist-name">${name}</span><span class="hist-sub">${sub}</span></span><span class="txn-amount out">${amount}</span></div>`;
}

const wrapWords = (text) => text.split(' ').map((w) => `<span class="w"><span class="wi">${w}</span></span>`).join(' ');
const wrapLetters = (text) => [...text].map((c) => `<span class="w"><span class="wi">${c}</span></span>`).join('');

function headline(name, pos, lines) {
  const body = lines.map(([text, cls = '']) => `<div class="${cls}">${wrapWords(text)}</div>`).join('');
  return `<div class="tf-hl${pos.align === 'center' ? ' is-center' : ''}" data-a="${name}" style="left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;text-align:${pos.align};font-size:${pos.size}px">${body}</div>`;
}

const NAV = [['summary', 'Summary'], ['add', 'Add'], ['accounts', 'Accounts'], ['plan', 'Plan'], ['history', 'History'], ['coach', 'Coach']];
const CHAPTERS = [['01', 'Left to spend', 12.2], ['02', 'Card bills', 23.5], ['03', 'Work costs', 35.5], ['04', 'History', 47.5]];
const TILES = [['Monthly income', rupees(120000)], ['Fixed commitments', MINUS + rupees(78500)], ['Saved each month', MINUS + rupees(10000)], ['Spent so far', MINUS + rupees(16350)]];
const SHIELD = 'M50 12L80 22V48C80 68 67 82 50 89C33 82 20 68 20 48V22Z';

function phoneMarkup() {
  return `
    <div class="tf-phone" data-a="phone">
      <div class="tf-device" data-a="device">
        <div class="tf-screen">
          <div class="tf-island"></div>
          <div class="tf-status"><span>9:41</span><span class="tf-batt"></span></div>
          <div class="tf-head">
            <div class="tf-head-title">
              <span data-a="h-summary">Summary</span>
              <span data-a="h-accounts">Accounts</span>
              <span data-a="h-add">Add</span>
              <span data-a="h-history">History</span>
            </div>
            ${icon('settings')}
          </div>

          <section class="tf-view tf-ui k" data-a="v-summary">
            <div class="hero" data-m="hero">
              <div class="hero-top"><span class="hero-label">Left to spend</span><span class="hero-label">October</span></div>
              <p class="hero-amount" data-n="left">${rupees(15150)}</p>
              <div class="hero-meter"><div class="hero-meter-fill" data-a="meter" style="width:52%"></div></div>
              <p class="hero-status">On track for the month</p>
            </div>
            <div class="hero-under">
              <div class="stat"><span class="stat-v">${rupees(16350)}</span><span class="stat-k">Spent this month</span></div>
              <div class="stat"><span class="stat-v">${rupees(31500)}</span><span class="stat-k">Budget</span></div>
            </div>
            <div class="hero-under summary-owed">
              <div class="stat" data-m="statCards"><span class="stat-v" data-n="owedCards"></span><span class="stat-k">Owed on cards</span></div>
              <div class="stat" data-m="statBack"><span class="stat-v" data-n="owedBack"></span><span class="stat-k">Owed back by employer</span></div>
            </div>
          </section>

          <section class="tf-view tf-ui k" data-a="v-accounts">
            <div class="tf-list">
              <div class="k-row account-row" data-m="bankRow">${brandMark('Salary account')}<span class="k-row__body"><span class="k-row__title">Salary account</span><span class="k-row__meta">Bank</span></span><span class="k-row__value" data-n="bank"></span></div>
              <div class="k-row account-row">${brandMark('Travel card')}<span class="k-row__body"><span class="k-row__title">Travel card</span><span class="k-row__meta">Card &middot; 7421</span></span><span class="k-row__value out" data-n="travel"></span></div>
              <div class="tf-bill">
                <div class="tf-bill-line">
                  <span data-a="due">Due 14 Oct &middot; Min ${rupees(1422)}</span>
                  <span class="tf-paid" data-a="paid">${icon('check')} Paid</span>
                  <b>${rupees(28437)}</b>
                </div>
                <span class="tf-link" data-tap="mark" data-a="markLink">Mark bill paid</span>
                <div class="tf-panel">
                  <div class="tf-panel-inner" data-a="panelIn">
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

          <section class="tf-view tf-ui k" data-a="v-add">
            <div class="hero amount-hero">
              <span class="hero-label">Amount</span>
              <div class="tf-amount"><span data-n="amount"></span><i class="tf-caret" data-n="caret1"></i></div>
            </div>
            <div class="tf-add-field"><span class="k-label">What for</span><div class="k-input"><span data-n="note"></span><i class="tf-caret" data-n="caret2"></i></div></div>
            <div class="tf-chips">
              <span class="tf-chip" data-tap="food">${categoryStyle('Food').icon}Food<i class="tf-chip-on" data-a="chipOn"></i></span>
              <span class="tf-chip">${categoryStyle('Travel').icon}Travel</span>
              <span class="tf-chip">${categoryStyle('Shopping').icon}Shopping</span>
            </div>
            <div class="k-switch-row" data-m="switch">
              <span class="k-switch-row__text">Reimbursable (Work)<span class="k-switch-row__sub">Your employer will pay this back</span></span>
              <span class="k-toggle" data-n="toggle" data-tap="toggle"></span>
              <i class="tf-glow" data-a="g3"></i>
            </div>
            <span class="k-btn k-btn--primary tf-save" data-tap="save">Save</span>
          </section>

          <section class="tf-view tf-ui k" data-a="v-history">
            <div class="tf-day"><span>Today</span><span class="out" data-n="today"></span></div>
            <div class="tf-hist-clip" data-a="hist1"><div class="tf-hist" data-a="histIn">
              ${histRow('Client lunch', 'Food', `2:45 pm <span class="hist-tag">Owed back</span>`, rupees(2450), ' tf-new-row')}
              ${histRow('Annapurna Tiffins', 'Food', '1:10 pm', rupees(180))}
              ${histRow('Metro card top-up', 'Metro', '9:02 am', rupees(500))}
            </div></div>
            <div class="tf-day" style="margin-top:16px"><span>Yesterday</span><span class="out">${rupees(1240)}</span></div>
            <div class="tf-hist" data-a="hist2">${histRow('Fresh Basket', 'Groceries', '7:30 pm', rupees(1240))}</div>
          </section>

          <div class="tf-toast" data-a="toast">${icon('check')}Saved</div>
          <nav class="tf-nav">
            ${NAV.map(([key, label]) => `
              <span class="tf-nav-btn" data-tap="nav-${key}">${icon(key)}<span>${label}</span>
                <span class="tf-nav-on" data-a="on-${key}">${icon(key)}<span>${label}</span></span>
              </span>`).join('')}
          </nav>
          <div class="tf-boot" data-a="boot"><img src="./icons/kawach.svg" alt=""></div>
          <div class="tf-glare" data-a="glare"></div>
          <div class="tf-finger" data-a="finger"></div>
        </div>
      </div>
    </div>`;
}

function stageMarkup() {
  const hl = F.hl;
  return `
    <div class="tf-layer">
      <div class="tf-blob tf-blob-a" data-a="blobA"></div>
      <div class="tf-blob tf-blob-b" data-a="blobB"></div>
      <div class="tf-blob tf-blob-c" data-a="blobC"></div>
    </div>

    <div class="tf-world" data-a="world">
      <div class="tf-giant" data-a="giant" style="font-size:${F.giant.size}px"><span data-n="amount"></span></div>
      <div class="tf-card" data-a="card">
        <div class="tf-card-top"><span>Travel card</span><span class="tf-chipm"></span></div>
        <div class="tf-card-num">&bull;&bull;&bull;&bull;&nbsp;&nbsp;&bull;&bull;&bull;&bull;&nbsp;&nbsp;&bull;&bull;&bull;&bull;&nbsp;&nbsp;7421</div>
        <div class="tf-card-due"><small><span data-a="cardDue">Bill due 14 Oct</span><span data-a="cardPaid">Paid in full</span></small><b data-n="travel"></b></div>
        <div class="tf-card-sheen" data-a="cardSheen"></div>
        <div class="tf-stamp" data-a="stamp">${icon('check')}PAID</div>
      </div>
      ${phoneMarkup()}
      ${TILES.map(([label, value], i) => `<div class="tf-tile" data-a="tile${i}" style="width:${F.tiles.w}px"><span>${label}</span><b>${value}</b></div>`).join('')}
      <div class="tf-pocket" data-a="pocket" style="width:${F.tileW}px"><span>Owed back by employer</span><b data-n="owedBack"></b><em>${icon('clock')}Coming back to you</em></div>
      <div class="tf-pocket" data-a="lock" style="width:${F.tileW}px"><span>Left to spend</span><b>${rupees(15150)}</b><em>${icon('check')}Not touched</em></div>
      <div class="tf-receipt k" data-a="receipt">${chip('Food')}<span>Client lunch</span><b>${rupees(2450)}</b><span class="hist-tag">Owed back</span></div>
      <div class="tf-ring" data-a="ring1"></div>
      <div class="tf-ring is-green" data-a="ring2"></div>
      <div class="tf-ring" data-a="ring3"></div>
      <div class="tf-ring" data-a="ring4"></div>
    </div>

    <canvas class="tf-canvas" data-a="canvas" width="${F.W / 2}" height="${F.H / 2}"></canvas>

    <div class="tf-layer">
      <div class="tf-horizon" data-a="horizon" style="top:${hl.h1.y + hl.h1.size * (1.02 * (hl.h1.lines || 1) + 0.6)}px"></div>
      ${headline('h1', hl.h1, [['Your money is personal.']])}
      <div class="tf-hl${hl.prom.align === 'center' ? ' is-center' : ''}" data-a="prom" style="left:${hl.prom.x}px;top:${hl.prom.y}px;width:${hl.prom.w}px;font-size:${hl.prom.size}px">
        ${[['ban', 'Zero tracking.'], ['lock', 'Zero sign-ups.'], ['phone', 'Works offline.']].map(([ic, text], i) => `
          <div class="tf-prom" data-a="prom${i}"><span class="tf-prom-ic" data-a="promIc${i}">${icon(ic)}</span><span>${wrapWords(text)}</span></div>`).join('')}
      </div>
      <div class="tf-hl${hl.intro.align === 'center' ? ' is-center' : ''}" data-a="intro" style="left:${hl.intro.x}px;top:${hl.intro.y}px;width:${hl.intro.w}px;text-align:${hl.intro.align};font-size:${hl.intro.size}px">
        <div class="tf-eyebrow"><i data-a="introRule"></i><span data-a="introEy">Introducing</span></div>
        <div class="tf-title" data-a="introTitle">${wrapLetters('Kawach')}</div>
        <div class="tf-sub" data-a="introSub">Know what you can safely spend,<br>every day of the month.</div>
      </div>
      ${headline('h3', hl.h3, [['One number.', 'acc'], ['Worked out for you.']])}
      ${headline('h4', hl.h4, [['What you owe,'], ['at a glance.', 'acc']])}
      ${headline('h5', hl.h5, [['Card bills,'], ['handled.', 'acc']])}
      ${headline('h6', hl.h6, [['Paid once.'], ['Both sides know.', 'acc']])}
      ${headline('h7', hl.h7, [['Paid for work?'], ['Mark it.', 'acc']])}
      ${headline('h8', hl.h8, [['Work costs never touch'], ['what you can spend.', 'acc']])}
      ${headline('h9', hl.h9, [['Every payment.'], ['Newest first.', 'acc']])}
      ${headline('end', hl.end, [['Your wealth.'], ['Your device.', 'acc']])}
      <div class="tf-word" data-a="word" style="top:${F.word.y}px;font-size:${F.word.size}px">${[...'KAWACH'].map((c, i) => `<span data-a="wl${i}">${c}</span>`).join('')}</div>
      <div class="tf-rule" data-a="rule" style="top:${F.rule.y}px;left:${(F.W - F.rule.w) / 2}px;width:${F.rule.w}px"></div>
      <div class="tf-url" data-a="url" style="top:${F.url.y}px">getkawach.com</div>

      <div class="tf-chapter" data-a="chapter" style="${F.chapter}">
        <div class="tf-ch-num">${CHAPTERS.map(([n], i) => `<span data-a="cn${i}">${n}</span>`).join('')}</div>
        <div class="tf-ch-text">${CHAPTERS.map(([, label], i) => `<span data-a="cl${i}">${label}</span>`).join('')}</div>
        <div class="tf-ch-track"><i data-a="chFill"></i></div>
      </div>
      <div class="tf-bug" data-a="bug" style="${F.bug}"><img src="./icons/kawach.svg" alt="">KAWACH</div>
      <div class="tf-note" data-a="note" style="${F.note}">Example figures</div>
    </div>

    <div class="tf-layer">
      <div class="tf-rays" data-a="rays"></div>
      <div class="tf-shield" data-a="shield">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="tfBody" x1="0.1" y1="0" x2="0.7" y2="1">
              <stop offset="0" stop-color="#47d0f8" stop-opacity="0.5"/>
              <stop offset="0.5" stop-color="#2b7fb8" stop-opacity="0.3"/>
              <stop offset="1" stop-color="#7c5cf0" stop-opacity="0.24"/>
            </linearGradient>
            <linearGradient id="tfEdge" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stop-color="#cdf5ff"/>
              <stop offset="0.4" stop-color="#47d0f8" stop-opacity="0.9"/>
              <stop offset="1" stop-color="#47d0f8" stop-opacity="0.45"/>
            </linearGradient>
          </defs>
          <path data-a="sBody" d="${SHIELD}" fill="url(#tfBody)"/>
          <path data-a="sEdge" d="${SHIELD}" fill="none" stroke="url(#tfEdge)" stroke-width="2.9" stroke-linejoin="round" pathLength="1" stroke-dasharray="1"/>
          <g fill="none" stroke="#e8fbff" stroke-width="6.6" stroke-linecap="round" stroke-linejoin="round">
            <path data-a="sR0" d="M38 34h24" pathLength="1" stroke-dasharray="1"/>
            <path data-a="sR1" d="M38 45h24" pathLength="1" stroke-dasharray="1"/>
            <path data-a="sR2" d="M44 34c11 0 11 20 0 20h-5l17 17" pathLength="1" stroke-dasharray="1"/>
          </g>
        </svg>
      </div>
      <div class="tf-flash" data-a="flash"></div>
      <div class="tf-grain" data-a="grain"></div>
      <div class="tf-vignette"></div>
      <div class="tf-black" data-a="black"></div>
    </div>`;
}

// ---- the timeline -----------------------------------------------------------

let animations = [];
const squeezed = [];

// One element, one animation for the whole film. Frames are [seconds, props,
// easing into the next frame]. A property a frame leaves out keeps the value
// it had, so each frame only says what changes.
function track(el, frames) {
  if (!el) return;
  const keys = [];
  let carried = {};
  for (const [, props] of frames) for (const p of Object.keys(props)) if (!(p in carried)) carried[p] = props[p];
  for (const [s, props, easing] of frames) {
    carried = { ...carried, ...props };
    // Never earlier than the frame before: a crowded moment is squeezed, not an error.
    const prev = keys.length ? keys[keys.length - 1].offset : 0;
    if ((s * 1000) / LENGTH < prev - 1e-9) squeezed.push(s);
    keys.push({ ...carried, offset: Math.min(1, Math.max(prev, (s * 1000) / LENGTH)), easing: easing || EX });
  }
  if (keys[0].offset > 0) keys.unshift({ ...keys[0], offset: 0, easing: LIN });
  if (keys[keys.length - 1].offset < 1) keys.push({ ...keys[keys.length - 1], offset: 1 });
  const a = el.animate(keys, { duration: LENGTH, fill: 'both' });
  a.pause();
  animations.push(a);
}

const $ = (name) => stage.querySelector(`[data-a="${name}"]`);
const $m = (name) => stage.querySelector(`[data-m="${name}"]`);

// Where things sit. The phone is centred on its point by its margins; the
// rest are centred on theirs by translate(-50%, -50%).
const PT = (p) => `translate3d(${p.x}px, ${p.y}px, ${p.z || 0}px) rotateX(${p.rx || 0}deg) rotateY(${p.ry || 0}deg) rotateZ(${p.rz || 0}deg) scale(${p.s})`;
const T = (p, o = {}) => {
  const q = { ...p, ...o };
  return `translate3d(${q.x}px, ${q.y}px, ${q.z || 0}px) translate(-50%, -50%) rotateX(${q.rx || 0}deg) rotateY(${q.ry || 0}deg) rotateZ(${q.rz || 0}deg) scale(${q.s ?? 1})`;
};
const AT = (p, s = 1, r = 0) => `translate(${p.x}px, ${p.y}px) rotate(${r}deg) scale(${s})`;

// Words that rise into place and leave upwards, one after another.
function reveal(el, at, out, { stagger = 0.07, dur = 0.95 } = {}) {
  if (!el) return;
  el.querySelectorAll('.wi').forEach((w, i) => {
    const a = at + i * stagger;
    const o = out - 0.5 + i * 0.025;
    track(w, [
      [a, { transform: 'translateY(118%)' }, EX],
      [a + dur, { transform: 'translateY(0%)' }],
      [o, { transform: 'translateY(0%)' }, IN],
      [o + 0.45, { transform: 'translateY(-118%)' }],
    ]);
  });
}

function fadeFor(el, from, to, rise = 14) {
  track(el, [
    [from, { opacity: 0, transform: `translateY(${rise}px)` }, EX],
    [from + 0.7, { opacity: 1, transform: 'translateY(0px)' }],
    [to - 0.4, { opacity: 1, transform: 'translateY(0px)' }, IN],
    [to, { opacity: 0, transform: `translateY(${-rise / 2}px)` }],
  ]);
}

function ring(el, at, p) {
  track(el, [
    [0, { opacity: 0, transform: AT(p, 0.3) }],
    [at, { opacity: 0, transform: AT(p, 0.3) }, LIN],
    [at + 0.05, { opacity: 1, transform: AT(p, 0.4) }, EX],
    [at + 0.9, { opacity: 0, transform: AT(p, 2.6) }],
  ]);
}

// A screen's comings and goings, the way the app swaps them.
function screen(name, spans) {
  for (const el of [$(`v-${name}`), $(`h-${name}`)]) {
    const frames = [[0, { opacity: 0, transform: 'translateX(28px)' }]];
    for (const [from, to] of spans) {
      frames.push([from, { opacity: 0, transform: 'translateX(28px)' }, EX]);
      frames.push([from + 0.45, { opacity: 1, transform: 'translateX(0px)' }]);
      frames.push([to, { opacity: 1, transform: 'translateX(0px)' }, IN]);
      frames.push([to + 0.2, { opacity: 0, transform: 'translateX(-18px)' }]);
    }
    track(el, frames);
  }
  const navFrames = [[0, { opacity: 0 }]];
  for (const [from, to] of spans) navFrames.push([from, { opacity: 0 }], [from + 0.2, { opacity: 1 }], [to, { opacity: 1 }], [to + 0.15, { opacity: 0 }]);
  track($(`on-${name}`), navFrames);
}

function seekAll(ms) {
  for (const a of animations) a.currentTime = ms;
}

// Where an element inside the phone is on the stage at a given moment, in
// stage units. Read with the stage unscaled so a hidden frame still measures.
function measure(el, s) {
  seekAll(s * 1000);
  const saved = stage.style.transform;
  stage.style.transform = 'none';
  const S = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  stage.style.transform = saved;
  return { x: r.left + r.width / 2 - S.left, y: r.top + r.height / 2 - S.top, w: r.width, h: r.height, s: r.width / el.offsetWidth };
}

// A copy of a piece of the app, lifted out of the phone.
function lift(src, cls) {
  const copy = src.cloneNode(true);
  for (const n of [copy, ...copy.querySelectorAll('[data-a],[data-tap],[data-m]')]) {
    n.removeAttribute('data-a');
    n.removeAttribute('data-tap');
    n.removeAttribute('data-m');
  }
  const wrap = document.createElement('div');
  wrap.className = `tf-float tf-ui k ${cls}`;
  wrap.style.width = `${src.offsetWidth}px`;
  wrap.style.opacity = '0';
  wrap.appendChild(copy);
  $('world').appendChild(wrap);
  return wrap;
}

function dim(el, from, to, low = 0.18) {
  track(el, [[from, { opacity: 1 }, LIN], [from + 0.05, { opacity: low }], [to, { opacity: low }, LIN], [to + 0.15, { opacity: 1 }]]);
}

function build() {
  animations.forEach((a) => a.cancel());
  animations = [];
  stage.style.width = `${F.W}px`;
  stage.style.height = `${F.H}px`;
  stage.innerHTML = stageMarkup();
  fit();
  grainImage();

  const H = F.home;
  const home34 = { ...H, ry: F.land ? -20 : -12, rx: 5 };
  const home34b = { ...H, ry: F.land ? -11 : -6, rx: 3 };
  const act3t = { ...F.act3, ry: F.land ? -16 : -8, rx: 4 };
  const act3t2 = { ...F.act3, ry: F.land ? -9 : -4, rx: 2 };
  const away2 = { ...F.away, ry: F.land ? -16 : 0, rx: F.land ? 4 : 10 };
  const fanPose = F.land ? { ...H, ry: -14, rx: 3 } : F.away;
  const fanPose2 = F.land ? { ...H, ry: -8, rx: 2 } : { ...F.away, rx: 8 };
  // Far, but not too far, and the push-in at 35s not too close: the browser
  // draws a moving layer at one size for its whole animation, and a huge
  // range of sizes left the phone's text soft at its normal size.
  const hidden = { ...H, y: H.y + (F.land ? 120 : 200), z: -700, s: H.s * 0.85, rx: 30, ry: -40, rz: 5 };
  // At the end the phone shrinks into the spot the shield is drawn on.
  const spin = { ...F.center, y: F.shieldEnd.y + 90, ry: -24, rx: 10, s: F.center.s * 0.5 };
  const gone = { x: F.shieldEnd.x, y: F.shieldEnd.y, ry: 0, rx: 0, s: 0.05 };
  // Transform and opacity only: those two the graphics chip moves by itself.
  const P = (p, o = 1) => ({ transform: PT(p), opacity: o });

  // ---- the camera, which is to say the phone -----------------------------
  track($('phone'), [
    [7.0, P(hidden, 0), EX],
    [8.9, P(home34)],
    [11.0, P(home34b), IO],
    [11.9, P(H)],
    [12.2, P(H), IO],
    [13.1, P(F.away)],
    [19.2, P(away2), IO],
    [20.0, P(H)],
    [23.2, P(H), IO],
    [24.2, P(act3t)],
    [26.3, P(act3t2), IO],
    [26.9, P(F.act3)],
    [34.8, P(F.act3), IN],
    [35.5, P(F.zoom, 0), LIN],
    [35.55, P({ ...H, s: H.s * 0.8 }, 0), EX],
    [36.5, P(home34)],
    [39.3, P(home34b), IO],
    [39.8, P(H)],
    [43.3, P(H), IO],
    [44.3, P(home34)],
    [47.0, P(home34b), IO],
    [47.5, P(H)],
    [48.95, P(H), IO],
    [49.9, P(fanPose)],
    [52.8, P(fanPose2), IO],
    [53.6, P(F.center), IO],
    [54.9, P(spin), IN],
    [55.3, P(gone, 0)],
  ]);
  // Light running across the glass at each new start.
  const glare = [[0, { transform: 'translateX(-110%)' }]];
  for (const t of [8.3, 12.0, 24.0, 36.4, 47.6, 53.8]) {
    glare.push([t, { transform: 'translateX(-110%)' }, IO], [t + 0.9, { transform: 'translateX(110%)' }, LIN], [t + 0.92, { transform: 'translateX(-110%)' }]);
  }
  track($('glare'), glare);

  screen('summary', [[0, 23.9], [53.3, 61]]);
  screen('accounts', [[23.9, 35.5]]);
  screen('add', [[35.5, 47.6]]);
  screen('history', [[47.6, 53.3]]);
  track($('boot'), [[9.0, { opacity: 1 }, IO], [9.6, { opacity: 0 }]]);
  track($('boot').firstElementChild, [
    [7.6, { transform: 'scale(0.6)', opacity: 0 }, EX],
    [8.6, { transform: 'scale(1)', opacity: 1 }, LIN],
    [9.0, { transform: 'scale(1.05)', opacity: 1 }, IN],
    [9.6, { transform: 'scale(1.4)', opacity: 0 }],
  ]);

  // ---- inside the phone ------------------------------------------------------
  // The panel and the new History row slide into place rather than grow:
  // growing makes the browser lay the page out again on every frame.
  track($('panelIn'), [[27.55, { transform: 'translateY(-101%)' }, EX], [28.2, { transform: 'translateY(0%)' }], [29.6, { transform: 'translateY(0%)' }, IO], [30.0, { transform: 'translateY(-101%)' }]]);
  track($('markLink'), [[29.6, { opacity: 1 }, LIN], [29.8, { opacity: 0 }]]);
  track($('due'), [[31.6, { opacity: 1 }, LIN], [31.8, { opacity: 0 }]]);
  track($('paid'), [[31.7, { opacity: 0, transform: 'scale(0.9)' }, SP], [32.1, { opacity: 1, transform: 'scale(1)' }]]);
  track($('chipOn'), [[40.15, { opacity: 0 }, LIN], [40.3, { opacity: 1 }]]);
  track($('g3'), [[40.95, { opacity: 0 }, LIN], [41.3, { opacity: 1 }], [42.8, { opacity: 0.8 }, IO], [43.3, { opacity: 0 }]]);
  track($('toast'), [
    [43.15, { opacity: 0, transform: 'translate(-50%, 12px)' }, EX],
    [43.5, { opacity: 1, transform: 'translate(-50%, 0px)' }],
    [44.6, { opacity: 1, transform: 'translate(-50%, 0px)' }, IN],
    [45.0, { opacity: 0, transform: 'translate(-50%, 0px)' }],
  ]);
  track($('histIn'), [[48.2, { transform: 'translateY(-64px)' }, EX], [48.8, { transform: 'translateY(0px)' }]]);

  // ---- act 0: the promise ----------------------------------------------------
  track($('horizon'), [[0.25, { transform: 'scaleX(0)', opacity: 1 }, EX], [1.3, { transform: 'scaleX(1)' }], [2.7, { transform: 'scaleX(1)', opacity: 1 }, IN], [3.3, { transform: 'scaleX(1.15)', opacity: 0 }]]);
  reveal($('h1'), 1.1, 3.3);
  [5.0, 5.35, 5.7].forEach((at, i) => {
    reveal($(`prom${i}`), at + 0.1, 7.4, { stagger: 0.06, dur: 0.8 });
    track($(`promIc${i}`), [
      [at, { transform: 'scale(0) rotate(-90deg)', opacity: 0 }, SP],
      [at + 0.55, { transform: 'scale(1) rotate(0deg)', opacity: 1 }],
      [6.95 + i * 0.05, { transform: 'scale(1) rotate(0deg)', opacity: 1 }, IN],
      [7.35 + i * 0.05, { transform: 'scale(0) rotate(0deg)', opacity: 0 }],
    ]);
  });
  track($('shield'), [
    [3.55, { transform: AT(F.shield, 0.55) }, EX],
    [4.8, { transform: AT(F.shield, 1) }, EX],
    [5.6, { transform: AT(F.shieldUp, F.shieldUp.s) }],
    [6.8, { transform: AT(F.shieldUp, F.shieldUp.s) }, IN],
    [7.25, { transform: AT(F.shieldUp, 0.3) }, LIN],
    [55.2, { transform: AT(F.shieldEnd, 0.6) }, EX],
    [56.3, { transform: AT(F.shieldEnd, 1) }, LIN],
    [60, { transform: AT(F.shieldEnd, 1.05) }],
  ]);
  // Opacity on the drawing, transform on its frame, so each has one animation.
  track($('shield').firstElementChild, [[3.55, { opacity: 0 }, LIN], [3.7, { opacity: 1 }], [6.8, { opacity: 1 }, IN], [7.25, { opacity: 0 }], [55.2, { opacity: 0 }, LIN], [55.35, { opacity: 1 }]]);
  track($('sEdge'), [[3.6, { strokeDashoffset: '1' }, EX], [4.7, { strokeDashoffset: '0' }], [54, { strokeDashoffset: '0' }, LIN], [54.01, { strokeDashoffset: '1' }], [55.3, { strokeDashoffset: '1' }, EX], [56.4, { strokeDashoffset: '0' }]]);
  track($('sBody'), [[4.2, { opacity: 0 }, EX], [4.9, { opacity: 1 }], [54, { opacity: 1 }, LIN], [54.01, { opacity: 0 }], [55.8, { opacity: 0 }, EX], [56.5, { opacity: 1 }]]);
  [0, 1, 2].forEach((i) => {
    track($(`sR${i}`), [
      [4.4 + i * 0.12, { strokeDashoffset: '1' }, EX], [5.0 + i * 0.12, { strokeDashoffset: '0' }],
      [54, { strokeDashoffset: '0' }, LIN], [54.01, { strokeDashoffset: '1' }],
      [56.0 + i * 0.12, { strokeDashoffset: '1' }, EX], [56.6 + i * 0.12, { strokeDashoffset: '0' }],
    ]);
  });
  track($('flash'), [
    [3.5, { opacity: 0, transform: AT(F.shield) }, LIN], [3.62, { opacity: 1 }, EX], [4.4, { opacity: 0 }],
    [30, { opacity: 0, transform: AT(F.shieldEnd) }, LIN],
    [55.15, { opacity: 0 }, LIN], [55.25, { opacity: 0.95 }, EX], [56.2, { opacity: 0 }],
  ]);

  // ---- act 1: Kawach -----------------------------------------------------------
  track($('introRule'), [[8.3, { transform: 'scaleX(0)' }, EX], [9.1, { transform: 'scaleX(1)' }], [11.2, { transform: 'scaleX(1)' }, IN], [11.6, { transform: 'scaleX(0)' }]]);
  fadeFor($('introEy'), 8.4, 11.6, 10);
  reveal($('introTitle'), 8.6, 11.6, { stagger: 0.05, dur: 1.0 });
  fadeFor($('introSub'), 9.2, 11.6);

  // ---- act 2: the number ---------------------------------------------------------
  const hero = $m('hero');
  const heroF = lift(hero, '');
  heroF.querySelector('[data-n="left"]').setAttribute('data-n', 'leftF');
  const meterF = heroF.querySelector('.hero-meter-fill');
  const a0 = measure(hero, 12.15);
  const a1 = measure(hero, 20.1);
  const hf = F.heroF;
  const mid1 = { x: (a0.x + hf.x) / 2, y: Math.min(a0.y, hf.y) - 60, s: (a0.s + hf.s) / 2, z: 260, rx: -10, ry: F.land ? 16 : 0 };
  const mid2 = { x: (a1.x + hf.x) / 2, y: Math.min(a1.y, hf.y) - 40, s: (a1.s + hf.s) / 2, z: 220, rx: 8, ry: F.land ? -12 : 0 };
  track(heroF, [
    [12.15, { opacity: 0, transform: T(a0) }, LIN],
    [12.2, { opacity: 1, transform: T(a0) }, IO],
    [12.7, { transform: T(mid1) }, IO],
    [13.2, { transform: T(hf, { z: 40 }) }, IO],
    [16.55, { transform: T(hf, { z: 40 }) }, SP],
    [16.75, { transform: T(hf, { z: 90, s: hf.s * 1.05 }) }, IO],
    [17.1, { transform: T(hf, { z: 40 }) }, IO],
    [19.3, { transform: T(hf, { z: 40 }) }, IO],
    [19.75, { transform: T(mid2) }, IO],
    [20.1, { opacity: 1, transform: T(a1) }, LIN],
    [20.2, { opacity: 0 }],
  ]);
  // The bar fills by stretching, not by changing width: a width animation
  // makes the browser lay the page out on every frame of the film.
  meterF.style.transformOrigin = 'left center';
  track(meterF, [[15.4, { transform: 'scaleX(0)' }, EX], [16.3, { transform: 'scaleX(1)' }]]);
  dim(hero, 12.15, 20.05, 0.08);
  [13.0, 13.8, 14.6, 15.4].forEach((at, i) => {
    const p = { x: F.tiles.x, y: F.tiles.y0 + i * F.tiles.dy };
    track($(`tile${i}`), [
      [at, { opacity: 0, transform: T(p, { z: -500, s: 0.8, rx: 35 }) }, EX],
      [at + 0.8, { opacity: 1, transform: T(p) }],
      [16.2 + i * 0.04, { opacity: 1, transform: T(p) }, IN],
      [16.6 + i * 0.04, { opacity: 0, transform: T(hf, { z: 40, s: 0.25 }) }],
    ]);
  });
  ring($('ring1'), 16.65, hf);
  reveal($('h3'), 16.8, 19.4);

  // The owed figures come off the phone too.
  [['statCards', 0], ['statBack', 1]].forEach(([name, i]) => {
    const src = $m(name);
    const copy = lift(src, 'is-chip');
    const m = measure(src, 20.55);
    const to = F.chips[i];
    track(copy, [
      [20.55, { opacity: 0, transform: T(m) }, LIN],
      [20.6, { opacity: 1, transform: T(m) }, EX],
      [21.5 + i * 0.1, { transform: T(to, { z: 160, rz: i ? 3 : -3 }) }, IO],
      [22.9, { opacity: 1, transform: T(to, { z: 160, rz: i ? 2 : -2, y: to.y - 10 }) }, IN],
      [23.35, { opacity: 0, transform: T(to, { z: 60, s: to.s * 0.9 }) }],
    ]);
    dim(src, 20.55, 23.3, 0.2);
  });
  reveal($('h4'), 20.9, 23.3);

  // ---- act 3: card bills ----------------------------------------------------------
  const cardStart = { ...F.act3, z: -300, s: 0.7 };
  const c1 = { ...F.card };
  const c2 = { ...F.card, rx: (F.card.rx || 0) * 0.5, ry: F.card.ry * 0.5, rz: F.card.rz * 0.5, z: 30 };
  const c3 = { ...c2, z: 90, s: 1.05 };
  track($('card'), [
    [24.3, { opacity: 0, transform: T(cardStart) }, EX],
    [25.5, { opacity: 1, transform: T(c1) }, IO],
    [31.65, { transform: T(c2) }, SP],
    [31.95, { transform: T(c3) }, IO],
    [32.4, { transform: T(c2) }, IO],
    [34.5, { opacity: 1, transform: T(c2) }, IN],
    [35.1, { opacity: 0, transform: T(cardStart) }],
  ]);
  track($('cardSheen'), [[25.3, { transform: 'translateX(-60%)' }, IO], [26.3, { transform: 'translateX(60%)' }, LIN], [31.7, { transform: 'translateX(-60%)' }, IO], [32.6, { transform: 'translateX(60%)' }]]);
  track($('stamp'), [[31.7, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.9) rotate(-18deg)' }, SP], [32.05, { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(-10deg)' }]]);
  track($('cardDue'), [[31.6, { opacity: 1 }, LIN], [31.75, { opacity: 0 }]]);
  track($('cardPaid'), [[31.7, { opacity: 0 }, LIN], [31.9, { opacity: 1 }]]);
  ring($('ring2'), 31.75, F.card);
  const bankRow = $m('bankRow');
  const bankF = lift(bankRow, 'is-row');
  const b0 = measure(bankRow, 29.55);
  track(bankF, [
    [29.55, { opacity: 0, transform: T(b0) }, LIN],
    [29.6, { opacity: 1, transform: T(b0) }, EX],
    [30.4, { transform: T(F.bankT, { z: 90 }) }],
    [34.5, { opacity: 1, transform: T(F.bankT, { z: 90 }) }, IN],
    [35.0, { opacity: 0, transform: T(F.bankT, { z: -200, s: 0.8 }) }],
  ]);
  dim(bankRow, 29.55, 34.8, 0.2);
  reveal($('h5'), 24.7, 29.4);
  reveal($('h6'), 31.9, 34.8);

  // ---- act 4: work costs ------------------------------------------------------------
  track($('giant'), [[36.4, { opacity: 0, transform: T(F.giant, { s: 0.92 }) }, EX], [37.2, { opacity: 0.55, transform: T(F.giant) }], [46.6, { opacity: 0.55, transform: T(F.giant, { s: 1.03 }) }, IN], [47.2, { opacity: 0, transform: T(F.giant, { s: 1.06 }) }]]);
  const sw = $m('switch');
  const r0 = measure(sw, 41.0);
  const receipt = $('receipt');
  const rs = r0.w / receipt.offsetWidth;
  track(receipt, [
    [41.0, { opacity: 0, transform: T(r0, { s: rs }) }, LIN],
    [41.1, { opacity: 1, transform: T(r0, { s: rs }) }, EX],
    [41.5, { opacity: 1, transform: T(r0, { x: r0.x + (F.land ? -70 : 0), y: r0.y - 110, z: 220, rz: -5, s: 1.1 }) }, IN],
    [41.9, { opacity: 1, transform: T(F.pocket, { s: 0.25 }) }, LIN],
    [41.95, { opacity: 0 }],
  ]);
  [['pocket', F.pocket, 41.1], ['lock', F.lock, 41.4]].forEach(([name, p, at]) => {
    track($(name), [
      [at, { opacity: 0, transform: T(p, { z: -400, s: 0.8, rx: 30 }) }, EX],
      [at + 0.75, { opacity: 1, transform: T(p) }],
      ...(name === 'pocket' ? [[41.95, { transform: T(p) }, SP], [42.2, { transform: T(p, { z: 50, s: 1.06 }) }, IO], [42.6, { transform: T(p) }]] : []),
      [46.6, { opacity: 1, transform: T(p) }, IN],
      [47.1, { opacity: 0, transform: T(p, { z: -300, s: 0.85 }) }],
    ]);
  });
  ring($('ring3'), 41.95, F.pocket);
  reveal($('h7'), 36.9, 40.9);
  reveal($('h8'), 41.6, 46.7);

  // ---- act 5: history -----------------------------------------------------------------
  const rows = [...stage.querySelectorAll('[data-a="v-history"] [data-m="row"]')];
  rows.forEach((row, i) => {
    const copy = lift(row, 'is-row tf-hist');
    const m = measure(row, 48.95);
    const to = F.fan(i);
    track(copy, [
      [48.95 + i * 0.08, { opacity: 0, transform: T(m) }, LIN],
      [49.0 + i * 0.08, { opacity: 1, transform: T(m) }, EX],
      [49.9 + i * 0.08, { transform: T(to) }, LIN],
      [52.6, { opacity: 1, transform: T(to, { y: to.y - 8 }) }, IN],
      [53.05 + i * 0.04, { opacity: 0, transform: T(to, { z: -300, s: 0.8 }) }],
    ]);
  });
  dim($('hist1'), 48.95, 53.0, 0.2);
  dim($('hist2'), 48.95, 53.0, 0.2);
  reveal($('h9'), 49.2, 52.9);

  // ---- act 6: the close -----------------------------------------------------------------
  ring($('ring4'), 55.25, F.shieldEnd);
  track($('rays'), [[55.3, { opacity: 0, transform: AT(F.shieldEnd, 0.6, 0) }, EX], [56.4, { opacity: 1, transform: AT(F.shieldEnd, 1, 20) }, LIN], [60, { opacity: 0.8, transform: AT(F.shieldEnd, 1.05, 52) }]]);
  reveal($('end'), 56.4, 61, { stagger: 0.09 });
  // The letters close in from wide apart, each one moved on its own.
  [...'KAWACH'].forEach((_, i) => {
    const dx = (i - 2.5) * 0.38 * F.word.size;
    track($(`wl${i}`), [[57.0 + i * 0.07, { opacity: 0, transform: `translate(${dx}px, 40px)` }, EX], [58.3, { opacity: 1, transform: 'translate(0px, 0px)' }]]);
  });
  track($('rule'), [[57.8, { transform: 'scaleX(0)' }, EX], [58.6, { transform: 'scaleX(1)' }]]);
  track($('url'), [[58.0, { opacity: 0, transform: 'translateY(10px)' }, EX], [58.7, { opacity: 1, transform: 'translateY(0px)' }]]);
  track($('black'), [[0, { opacity: 1 }, LIN], [0.2, { opacity: 0 }], [59.2, { opacity: 0 }, IO], [60, { opacity: 1 }]]);

  // ---- the frame around it all -------------------------------------------------------------
  track($('chapter'), [[11.8, { opacity: 0, transform: 'translateY(-10px)' }, EX], [12.5, { opacity: 1, transform: 'translateY(0px)' }], [53.0, { opacity: 1, transform: 'translateY(0px)' }, IN], [53.5, { opacity: 0, transform: 'translateY(-10px)' }]]);
  CHAPTERS.forEach(([, , at], i) => {
    const end = i < 3 ? CHAPTERS[i + 1][2] : 61;
    for (const el of [$(`cn${i}`), $(`cl${i}`)]) {
      track(el, [[at, { opacity: 0, transform: 'translateY(12px)' }, EX], [at + 0.5, { opacity: 1, transform: 'translateY(0px)' }], [end - 0.05, { opacity: 1, transform: 'translateY(0px)' }, IN], [end + 0.2, { opacity: 0, transform: 'translateY(-12px)' }]]);
    }
  });
  track($('chFill'), [[12.2, { transform: 'scaleX(0)' }, LIN], [53.3, { transform: 'scaleX(1)' }]]);
  for (const name of ['bug', 'note']) track($(name), [[11.8, { opacity: 0 }, EX], [12.6, { opacity: 1 }], [53.0, { opacity: 1 }, IN], [53.5, { opacity: 0 }]]);

  // Light: two colours that wander with the story, and green when a bill is paid.
  const at = (fx, fy) => `translate(${F.W * fx}px, ${F.H * fy}px)`;
  track($('blobA'), [[0, { opacity: 0, transform: at(0.5, 0.5) }, LIN], [3.6, { opacity: 0.7 }, IO], [8, { opacity: 0.55, transform: at(0.78, 0.3) }, IO], [13, { transform: at(0.28, 0.3) }, IO], [24, { transform: at(0.3, 0.7) }, IO], [36, { transform: at(0.75, 0.25) }, IO], [48, { transform: at(0.35, 0.6) }, IO], [55, { opacity: 0.8, transform: at(0.5, 0.42) }, IO], [59.5, { opacity: 0 }]]);
  track($('blobB'), [[0, { opacity: 0, transform: at(0.5, 0.5) }, LIN], [4.5, { opacity: 0.45, transform: at(0.3, 0.7) }, IO], [8, { transform: at(0.2, 0.75) }, IO], [13, { transform: at(0.8, 0.7) }, IO], [24, { transform: at(0.75, 0.2) }, IO], [36, { transform: at(0.25, 0.75) }, IO], [48, { transform: at(0.8, 0.3) }, IO], [55, { opacity: 0.6, transform: at(0.5, 0.55) }, IO], [59.5, { opacity: 0 }]]);
  track($('blobC'), [[31.6, { opacity: 0, transform: `translate(${F.card.x}px, ${F.card.y}px)` }, EX], [32.1, { opacity: 0.9 }], [33.8, { opacity: 0 }]]);

  nodes = {};
  for (const n of stage.querySelectorAll('[data-n]')) (nodes[n.dataset.n] ||= []).push(n);
  finger = $('finger');
  screenEl = stage.querySelector('.tf-screen');
  ctx = $('canvas').getContext('2d');
  // Drawn at half size and stretched: soft points of light look the same,
  // and a quarter of the pixels is a quarter of the work each frame.
  ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
  canvasEmpty = true;
  fingerStyle = '';
  shownSecond = -1;
  findTaps();
}

// ---- numbers, typing and switches, worked out from the moment ----------------

const smooth = (a, b, s) => {
  const x = Math.max(0, Math.min(1, (s - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

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

const typed = (s, steps, empty = '') => steps.reduce((text, [at, value]) => (s >= at ? value : text), empty);
const NOTE = 'Client lunch';
const noteSteps = [...NOTE].map((_, i) => [38.6 + i * 0.085, NOTE.slice(0, i + 1)]);
const blink = (s) => Math.floor(s * 2.2) % 2 === 0;

const FIGURES = {
  leftF: (s) => rupees(along(s, [[12.9, 15150], [13.3, 120000], [13.8, 120000], [14.4, 41500], [14.6, 41500], [15.1, 31500], [15.4, 31500], [16.2, 15150]])),
  owedCards: (s) => rupees(s < 31.7 ? 31557 : 3120),
  owedBack: (s) => rupees(along(s, [[41.95, 4350], [42.7, 6800]])),
  bank: (s) => rupees(along(s, [[30.5, 124610], [31.7, 96174]])),
  travel: (s) => rupees(along(s, [[30.5, 28437], [31.7, 0]])),
  amount: (s) => `₹${typed(s, [[37.3, '2'], [37.6, '24'], [37.9, '245'], [38.2, '2,450']])}`,
  note: (s) => typed(s, noteSteps),
  today: (s) => rupees(s < 48.2 ? 680 : 3130),
};

let nodes = {};
let finger = null;
let screenEl = null;
let ctx = null;

function setFigures(s) {
  // Counting figures change at most thirty times a second: each change
  // redraws the card it sits on, and the eye cannot tell the difference.
  const counted = Math.floor(s * 30) / 30;
  for (const [key, value] of Object.entries(FIGURES)) {
    const text = value(counted);
    for (const el of nodes[key] || []) if (el.textContent !== text) el.textContent = text;
  }
  const on = String(s >= 40.95);
  for (const el of nodes.toggle || []) if (el.getAttribute('aria-checked') !== on) el.setAttribute('aria-checked', on);
  const c1 = s >= 35.5 && s < 38.5 && (s > 37.2 && s < 38.3 ? true : blink(s));
  const c2 = s >= 38.5 && s < 40.1 && (s < 39.7 ? true : blink(s));
  for (const el of nodes.caret1 || []) if (el.style.opacity !== (c1 ? '1' : '0')) el.style.opacity = c1 ? '1' : '0';
  for (const el of nodes.caret2 || []) if (el.style.opacity !== (c2 ? '1' : '0')) el.style.opacity = c2 ? '1' : '0';
}

// ---- the fingertip -----------------------------------------------------------------

const TAPS = [[23.7, 'nav-accounts'], [27.4, 'mark'], [29.35, 'confirm'], [40.2, 'food'], [40.95, 'toggle'], [43.0, 'save'], [47.45, 'nav-history']];
let tapAt = {};
let fingerStyle = '';

// Where an element sits inside the phone's screen, ignoring the camera, which
// moves the screen and the fingertip together.
function centre(el) {
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  for (let n = el; n && n !== screenEl; n = n.offsetParent) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return [x, y];
}

// Worked out once, when the film is built: reading positions while it plays
// would make the browser stop and lay the page out again every frame.
function findTaps() {
  tapAt = {};
  for (const [at, name] of TAPS) {
    seekAll(at * 1000);
    tapAt[name] = centre(stage.querySelector(`[data-tap="${name}"]`));
  }
}

function placeFinger(s) {
  const tap = TAPS.find(([at]) => s > at - 0.8 && s < at + 0.5);
  let style = 'opacity:0';
  if (tap) {
    const [at, name] = tap;
    const [x, y] = tapAt[name];
    const lead = Math.max(0, Math.min(1, (at - s) / 0.6));
    const ease = lead * lead;
    const opacity = s < at ? Math.min(1, (s - (at - 0.8)) / 0.2) : Math.max(0, 1 - (s - at) / 0.5);
    const pressed = Math.abs(s - at) < 0.12 ? 0.78 : 1;
    style = `opacity:${opacity.toFixed(3)};transform:translate(${(x + ease * 40).toFixed(1)}px, ${(y + ease * 64).toFixed(1)}px) scale(${pressed})`;
  }
  if (style !== fingerStyle) {
    fingerStyle = style;
    finger.style.cssText = style;
  }
}

// ---- particles, drawn from the moment ---------------------------------------------

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = seeded(7);
const STARS = Array.from({ length: 220 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() }));
const BURST = Array.from({ length: 150 }, () => ({ a: rnd() * 6.283, v: 0.3 + rnd() * 0.7, r: rnd() * 2 + 0.6 }));
const FLOW = Array.from({ length: 80 }, () => ({ d: rnd(), j: rnd() * 2 - 1, r: rnd() * 1.6 + 1 }));

// The canvas is only drawn while it has something on it; the rest of the
// time it is left alone, cleared once.
const PARTICLES = [[0.5, 3.85], [30.3, 32.1], [55.2, 57.6]];
let canvasEmpty = true;

function dot(x, y, r, a) {
  if (a <= 0.003) return;
  ctx.fillStyle = `rgba(110, 215, 250, ${a * 0.22})`;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = `rgba(230, 250, 255, ${a})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 6.283);
  ctx.fill();
}

function draw(s) {
  const { W, H } = F;
  if (!PARTICLES.some(([a, b]) => s > a && s < b)) {
    if (!canvasEmpty) ctx.clearRect(0, 0, W, H);
    canvasEmpty = true;
    return;
  }
  canvasEmpty = false;
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';

  // A field of points rushing past, which falls into one: the shield.
  if (s < 3.85) {
    const env = smooth(0.5, 1.4, s) * (1 - smooth(3.55, 3.85, s));
    const pull = smooth(2.85, 3.6, s);
    const k = Math.max(W, H) * 0.18;
    for (const st of STARS) {
      const z = ((((st.z - (s - 0.5) * 0.24) % 1) + 1) % 1) * 0.94 + 0.06;
      const px = W / 2 + (st.x / z) * k;
      const py = H / 2 + (st.y / z) * k;
      const x = px + (F.shield.x - px) * pull;
      const y = py + (F.shield.y - py) * pull;
      dot(x, y, (1.15 - z) * 2 * (1 - pull * 0.4), env * (1 - z) * 1.1);
    }
  }

  // Money on its way from the bank to the card.
  if (s > 30.3 && s < 32.1) {
    const env = smooth(30.3, 30.6, s) * (1 - smooth(31.6, 32.1, s));
    const A = F.bankT;
    const B = F.card;
    const C = { x: (A.x + B.x) / 2 - (F.land ? 230 : 300), y: (A.y + B.y) / 2 };
    for (const f of FLOW) {
      const local = s - 30.35 - f.d * 0.9;
      if (local < 0) continue;
      const p = (local * 1.15) % 1;
      const u = 1 - p;
      const x = u * u * A.x + 2 * u * p * C.x + p * p * B.x + f.j * 10;
      const y = u * u * A.y + 2 * u * p * C.y + p * p * B.y + f.j * 6;
      dot(x, y, f.r, env * Math.sin(p * Math.PI));
    }
  }

  // The phone goes, and everything flies out from where it was.
  if (s > 55.2) {
    const t = s - 55.2;
    const c = F.shieldEnd;
    const reach = Math.max(W, H) * 0.6;
    for (const b of BURST) {
      const r = b.v * (1 - Math.exp(-t * 2.4)) * reach;
      dot(c.x + Math.cos(b.a) * r, c.y + Math.sin(b.a) * r, b.r, Math.max(0, 1 - t / 2.3) * 0.9);
    }
  }
}

// Film grain: one tile of noise, which the stylesheet moves about.
let grainURL = '';
function grainImage() {
  if (!grainURL) {
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 180;
    const g = c.getContext('2d');
    const img = g.createImageData(180, 180);
    const r = seeded(11);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainURL = c.toDataURL();
  }
  $('grain').style.backgroundImage = `url(${grainURL})`;
}

// ---- the clock ----------------------------------------------------------------------
//
// Playing hands the film to the browser: every animation is started on the
// page's own timeline at the same instant, so the moving parts are drawn by
// the graphics chip and stay smooth however busy the page is. Only the
// numbers, the fingertip and the particles are worked out here, once a frame,
// from the moment the animations say it is. Pausing or scrubbing holds every
// animation at one moment again. (Setting each animation's time by hand on
// every frame, as 4.20 did, made the browser redraw the whole film each
// frame, and on a phone it stuttered.)

let now = 0;
let playing = false;
let resumeOnReturn = false;
let shownSecond = -1;

const clockText = (ms) => {
  const secs = Math.floor(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

const clamp = (ms) => Math.max(0, Math.min(LENGTH, ms));
const currentMs = () => clamp(animations.length && animations[0].currentTime != null ? animations[0].currentTime : now);

function pickFormat() {
  const frame = stage.parentElement;
  return frame.clientWidth / Math.max(1, frame.clientHeight) >= 1.1 ? LAND : PORT;
}

function fit() {
  const frame = stage.parentElement;
  const scale = Math.min(frame.clientWidth / F.W, frame.clientHeight / F.H);
  const transform = `translate(-50%, -50%) scale(${scale})`;
  if (stage.style.transform !== transform) stage.style.transform = transform;
}

// What the browser does not draw by itself, at time ms.
function paint(ms) {
  now = clamp(ms);
  const s = now / 1000;
  setFigures(s);
  placeFinger(s);
  draw(s);
  scrub.value = String(Math.round(now));
  const second = Math.floor(now / 1000);
  if (second !== shownSecond) {
    shownSecond = second;
    timeText.textContent = `${clockText(now)} / ${clockText(LENGTH)}`;
  }
}

// Hold everything at one moment.
function show(ms) {
  const t = clamp(ms);
  seekAll(t);
  paint(t);
}

function setPlaying(on) {
  if (on) {
    let from = currentMs();
    if (from >= LENGTH) from = 0;
    seekAll(from);
    const start = document.timeline.currentTime - from;
    for (const a of animations) a.startTime = start;
    playing = true;
    paint(from);
    requestAnimationFrame(tick);
  } else {
    const t = currentMs();
    playing = false;
    for (const a of animations) a.pause();
    show(t);
  }
  playBtn.innerHTML = icon(on ? 'pause' : 'play');
  playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
}

function tick() {
  if (!playing) return;
  const t = currentMs();
  paint(t);
  if (t >= LENGTH) setPlaying(false);
  else requestAnimationFrame(tick);
}

// The box changed shape (a phone turned, a window resized): fit it, or
// rebuild the film for the other stage at the same moment.
function reframe() {
  if (!animations.length) return;
  const format = pickFormat();
  if (format === F) {
    fit();
    return;
  }
  const wasPlaying = playing;
  const t = currentMs();
  if (wasPlaying) setPlaying(false);
  F = format;
  build();
  show(t);
  if (wasPlaying) setPlaying(true);
}

playBtn.addEventListener('click', () => setPlaying(!playing));
scrub.addEventListener('input', () => {
  if (playing) setPlaying(false);
  show(Number(scrub.value));
});
// Its own box, not the window: inside the welcome page or the app the frame
// settles after the page has loaded, and the window never says so.
new ResizeObserver(reframe).observe(stage.parentElement);
// Put away mid-film, it waits where it was rather than playing to nobody.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) {
    resumeOnReturn = true;
    setPlaying(false);
  } else if (!document.hidden && resumeOnReturn) {
    resumeOnReturn = false;
    setPlaying(true);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && e.target === document.body) {
    e.preventDefault();
    setPlaying(!playing);
  } else if (e.key === 'Escape' && embedded) {
    // Played over the app: the app closes the tour.
    window.parent.postMessage('kawach-tour-close', location.origin);
  }
});

// Built after the typeface is in, so everything is measured at its real size.
document.fonts.ready.then(() => {
  F = pickFormat();
  build();
  show(autoplay ? 0 : startAt || POSTER);
  setPlaying(autoplay);
});

// For checking frames by hand: tourFilm.show(31000).
window.tourFilm = { show, length: LENGTH, squeezed, play: () => setPlaying(true), pause: () => setPlaying(false), time: currentMs };