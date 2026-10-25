// The living sky (the shown mockups: mockups/7.0-ledger/sky.html and orbs.html, sun C and moon A): the real sun and the real moon in a band behind
// the header of every screen.
// js/sun-moon.js works out where they are for the date, the time and the person's place; this draws it.
//   - the sun rises from behind the far hills in the east, peaks in the south, sets behind them in the west, with a bloom of light round it
//   - the moon has its true phase and surface (js/moon-texture.js) and rises and sets at its own times
//   - the sky's colour follows the sun's height; stars come out as it goes down
//   - one hard step a day, at sunrise and at sunset, when the page's colours swap (js/looks.js, "Follow the sun")
//   - scroll the page and the band folds up to a slim bar, so lists get the room
// The band lives inside the header, behind its buttons and title, and covers no text. Nothing here loops: it is set again once a minute.
//   alive and calm: drawn   still: no sky at all (the colours still follow the sun).
import { getPlace, skyState, isDay } from './sun-moon.js';
import { appearance } from './appearance.js';
import { drawMoon } from './moon-texture.js';

const root = document.documentElement;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rgb = (c) => c.map(Math.round).join(',');
let layer = null;
let stars = [];

// The band is drawn on a canvas 120px tall (the header is 62px of it; the hills reach 42px under the header and the first card sits on them).
const HORIZON = 82;
const SPAN = 58; // pixels from the horizon to a sun 70 degrees up
// The sun and the moon keep to one narrow lane of the sky, the same on every screen: clear of the longest title ("Coach", "Accounts") on the left
// and of the month stepper on History on the right. It must not change from screen to screen, or the moon jumps as you move about.
// They rise and set along it (the height is the time of day); only a title longer than the lane allows (a rare screen) moves it.
const LANE = [44.5, 46];
const TOP = 30; // the lowest the middle of a disc may be high up: the moon is never cut by the top edge
const spot = (b, lane) => ({ x: lane[0] + ((clamp(b.az, -100, 100) + 100) / 200) * (lane[1] - lane[0]), y: Math.max(TOP, HORIZON - (clamp(b.alt, -6, 80) / 70) * SPAN) });

function build() {
  const el = document.createElement('div');
  el.className = 'hv-sky';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<i class="hv-sky__scrim"></i><div class="hv-sky__art"><div class="hv-sky__stars"></div>
    <div class="hv-orb hv-sun"><i class="rays"></i><i class="bloom"></i><i class="streak"></i><i class="ghost g1"></i><i class="ghost g2"></i><i class="ghost g3"></i><i class="disc"></i><i class="core"></i></div>
    <div class="hv-orb hv-moon"><i class="moonglow"></i><canvas class="tex" width="160" height="160"></canvas></div></div>
    <svg class="hv-sky__ridge" viewBox="0 0 390 80" preserveAspectRatio="none"><path class="hv-sky__far" d="M0 34C30 22 62 32 98 24S170 6 214 20 304 42 370 22L390 26V80H0Z"/><path class="hv-sky__near" d="M0 54C40 44 80 58 130 50S224 32 268 44 340 58 390 46V80H0Z"/></svg>`;
  // fixed stars: positions, sizes and brightness never change, and none of them twinkles
  const box = el.querySelector('.hv-sky__stars');
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  stars = [];
  for (let i = 0; i < 48; i++) {
    const big = rnd() < 0.12, sz = big ? 2.6 : rnd() < 0.5 ? 1.6 : 1.1, left = rnd() * 100, top = rnd() * 86, o = 0.35 + rnd() * 0.65;
    const d = document.createElement('i');
    d.className = 'hv-sky__star';
    d.style.cssText = `left:${left.toFixed(1)}%;top:${top.toFixed(0)}px;width:${sz}px;height:${sz}px${big ? ';box-shadow:0 0 6px 1px rgba(255,255,255,.6)' : ''}`;
    d.dataset.o = o.toFixed(2);
    box.append(d);
    stars.push(d);
  }
  return el;
}

export function paintSkyLayer() {
  const header = document.querySelector('.app-header');
  const want = root.dataset.style === 'haven' && root.dataset.motion !== 'still' && !!header;
  if (!want) {
    layer?.remove();
    layer = null;
    root.removeAttribute('data-sky-real');
    return;
  }
  if (!layer || !layer.isConnected) { layer = build(); header.prepend(layer); }
  root.setAttribute('data-sky-real', '');
  // Someone who follows the sun sees the real sky. Someone whose colours are fixed (Haven day, Haven night, "follow my phone") sees a sky that
  // agrees with them, not a night sky behind a light page.
  const force = appearance('colour') === 'sun' ? null : root.dataset.theme === 'dark' ? 'night' : 'day';
  const st = skyState(Date.now(), getPlace(), force);
  const set = (k, v) => layer.style.setProperty(k, v);
  set('--sky-top', `rgb(${rgb(st.sky.top)})`);
  // The phone's own bar above the app takes the sky's top colour, so the sky runs up under it without a black strip.
  // What is really painted along the top edge: the sky's top colour under the night scrim (rgba(8,14,40,.92) at the veil's strength).
  const veil = 0.92 * st.veil;
  // After thirty quiet seconds the app dims by 14% (.hv-doze in css/haven-motion.css); the phone's bar does not, so it is dimmed with the page or a seam shows.
  const doze = root.hasAttribute('data-dozing') && root.dataset.motion === 'alive' ? 0.14 : 0;
  const edge = st.sky.top.map((v, i) => (v * (1 - veil) + [8, 14, 40][i] * veil) * (1 - doze));
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', `rgb(${rgb(edge)})`);
  set('--sky-mid', `rgb(${rgb(st.sky.mid)})`);
  set('--sky-hz', `rgb(${rgb(st.sky.hz)})`);
  set('--sky-veil', st.veil.toFixed(2));
  set('--ridge-far', st.night ? 'rgb(8,14,36)' : 'rgb(96,128,188)');
  // A title longer than the lane allows pushes the lane right, so a moon disc never sits on its letters; the usual titles never do.
  const title = header.querySelector('#view-title');
  const width = header.clientWidth || window.innerWidth;
  // the box of the title's own letters (the element can also hold a status mark or a button that is not part of the words)
  const words = document.createRange();
  const walker = title ? document.createTreeWalker(title, NodeFilter.SHOW_TEXT) : null;
  let first = null;
  let last = null;
  while (walker && walker.nextNode()) {
    if (!walker.currentNode.nodeValue.trim()) continue;
    first = first || walker.currentNode;
    last = walker.currentNode;
  }
  if (first) {
    words.setStart(first, 0);
    words.setEnd(last, last.nodeValue.length);
  }
  const titleEnd = title && title.textContent.trim() ? words.getBoundingClientRect().right - header.getBoundingClientRect().left : 0;
  const lane = LANE;
  const sp = spot(st.sun, lane), mp = spot(st.moon, lane);
  const sunCol = [255, 244, 214].map((v, i) => v + ([255, 112, 48][i] - v) * st.warm);
  set('--cr', rgb(sunCol));
  // A screen with a long title ("Backup & Settings") reaches the lane: the sun and moon tuck away there instead of sitting on its letters.
  const place = (el, p, o) => { el.style.left = `${p.x.toFixed(1)}%`; el.style.top = `${p.y.toFixed(1)}px`; el.style.opacity = clamp(titleEnd + 8 > (p.x / 100) * width - 20 ? 0 : o).toFixed(2); };
  const sunEl = layer.querySelector('.hv-sun'), moonEl = layer.querySelector('.hv-moon');
  place(sunEl, sp, st.sunShown);
  place(moonEl, mp, st.moonShown);
  sunEl.querySelector('.disc').style.opacity = clamp((st.warm - 0.4) / 0.5).toFixed(2);
  moonEl.querySelector('.moonglow').style.opacity = (0.3 + st.moon.fraction * 0.7).toFixed(2);
  moonEl.querySelector('.tex').style.filter = `drop-shadow(0 0 5px rgba(205,218,255,.35))`;
  drawMoon(moonEl.querySelector('.tex'), st.moon.phase);
  // a soft glow round the light that matters: the sun by day, the moon at night
  const sunLight = st.sun.alt > -8;
  const g = sunLight ? sp : mp;
  const strength = sunLight ? clamp((st.sun.alt + 4.5) / 4) * (0.3 + st.warm * 0.55) : st.moonShown * st.moon.fraction * 0.3;
  set('--gx', `${g.x.toFixed(1)}%`);
  set('--gy', `${g.y.toFixed(0)}px`);
  set('--glow', sunLight ? `rgba(${rgb([255, 214, 150].map((v, i) => v + ([255, 130, 70][i] - v) * st.warm))},${strength.toFixed(2)})` : `rgba(160,180,255,${strength.toFixed(2)})`);
  const fade = 1 - st.moonShown * st.moon.fraction * 0.45;
  for (const d of stars) d.style.opacity = clamp(st.stars * d.dataset.o * fade).toFixed(2);
}

let lastDay = null;
// Follow the sun: when the sun crosses the horizon the page swaps its colours, with the same sweep as the day/night button.
async function tick() {
  paintSkyLayer();
  if (appearance('colour') !== 'sun') { lastDay = null; return; }
  const day = isDay(Date.now());
  if (lastDay !== null && day !== lastDay) {
    try {
      const [{ applyTheme }, { sweepTheme }] = await Promise.all([import('./appearance.js'), import('./haven-motion.js')]);
      sweepTheme(() => { applyTheme(); paintSkyLayer(); });
    } catch { /* the colours swap at the next open */ }
  }
  lastDay = day;
}

// The band folds once the page has been scrolled a little, and opens again at the very top (two thresholds, so it never flutters at the edge).
let folded = false;
function fold() {
  const header = document.querySelector('.app-header');
  if (!header) return;
  const y = window.scrollY;
  if (!folded && y > 8) folded = true;
  else if (folded && y <= 2) folded = false;
  else return;
  header.classList.toggle('lg-fold', folded);
}

export function startSky() {
  // Whatever happens, the page never sits scrolled sideways: put it back the moment it is.
  addEventListener('scroll', () => { if (window.scrollX !== 0) window.scrollTo(0, window.scrollY); fold(); }, { passive: true });
  tick();
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', tick);
  addEventListener('hv-motion', paintSkyLayer);
  // a new place: the sun moves, and the colours may swap
  addEventListener('hv-where', async () => {
    paintSkyLayer();
    if (appearance('colour') === 'sun') {
      const { applyTheme } = await import('./appearance.js');
      applyTheme();
      lastDay = isDay(Date.now());
      paintSkyLayer();
    }
  });
  new MutationObserver(paintSkyLayer).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'data-style', 'data-dozing'] });
}
