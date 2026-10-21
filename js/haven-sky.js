// Haven's living sky: the real sun and the real moon behind the top of every screen (the shown mockup: mockups/7.15-dawn-to-dusk-pro).
// js/sun-moon.js works out where they are for the date, the time and the person's place; this draws it.
//   - the sun rises from behind the far hills in the east, peaks in the south, sets behind them in the west
//   - the moon has its true shape (which way it leans, how much is lit) and rises and sets at its own times
//   - the sky's colour follows the sun's height; stars come out as it goes down
//   - one hard step a day, at sunrise and at sunset, when the page's colours swap (js/looks.js, "Follow the sun")
// It is one layer behind the page, so it covers no text and no button. Nothing here loops: it is set again once a minute.
//   alive and calm: drawn   still: no sky at all (the colours still follow the sun).
import { getPlace, skyState, moonPathD, isDay } from './sun-moon.js';
import { appearance } from './appearance.js';

const root = document.documentElement;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const rgb = (c) => c.map(Math.round).join(',');
let layer = null;
let stars = [];

// The layer is 190px tall: the header and the first rows sit over its upper part, the hills over its lower part, and the screen's
// first card overlaps the hills (css/haven-motion.css gives every screen the room).
const HORIZON = 130;
const SPAN = 60; // pixels from the horizon to a sun 70 degrees up
// Kept between 58% and 86% across: clear of the title and the month chip on the left and the round buttons on the right.
const spot = (b) => {
  const y = HORIZON - (clamp(b.alt, -6, 80) / 70) * SPAN;
  let x = 58 + ((clamp(b.az, -100, 100) + 100) / 200) * 28;
  if (y < 86) x = Math.min(x, 66);
  return { x, y };
};

function build() {
  const el = document.createElement('div');
  el.className = 'hv-sky';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<i class="hv-sky__scrim"></i><div class="hv-sky__stars"></div><i class="hv-sky__sun"></i>
    <svg class="hv-sky__moon" viewBox="-22 -22 44 44"><defs>
      <radialGradient id="hvmg" cx=".38" cy=".34" r=".8"><stop offset="0" stop-color="#fbfcff"/><stop offset=".6" stop-color="#dfe6fa"/><stop offset="1" stop-color="#aab6df"/></radialGradient>
      <clipPath id="hvmc"><circle r="20"/></clipPath>
      <filter id="hvmb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".7"/></filter>
      <mask id="hvmm"><path class="hv-sky__lit" fill="#fff" filter="url(#hvmb)"/></mask></defs>
      <circle r="20" fill="#27305a" class="hv-sky__earth"/>
      <g mask="url(#hvmm)"><circle r="20" fill="url(#hvmg)"/><g clip-path="url(#hvmc)" fill="#8f9bc4" opacity=".28"><ellipse cx="-6" cy="-5" rx="6" ry="4.4"/><ellipse cx="5" cy="-8" rx="4" ry="3"/><ellipse cx="3" cy="6" rx="7" ry="4.8"/><ellipse cx="-9" cy="8" rx="3" ry="2.4"/></g></g>
      <circle r="20" fill="none" stroke="#fff" stroke-opacity=".18"/></svg>
    <svg class="hv-sky__ridge" viewBox="0 0 390 80" preserveAspectRatio="none"><path class="hv-sky__far" d="M0 34C30 22 62 32 98 24S170 6 214 20 304 42 370 22L390 26V80H0Z"/><path class="hv-sky__near" d="M0 54C40 44 80 58 130 50S224 32 268 44 340 58 390 46V80H0Z"/></svg>`;
  // fixed stars: positions, sizes and brightness never change, and none of them twinkles
  const box = el.querySelector('.hv-sky__stars');
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  stars = [];
  for (let i = 0; i < 48; i++) {
    const d = document.createElement('i');
    const big = rnd() < 0.12, sz = big ? 2.6 : rnd() < 0.5 ? 1.6 : 1.1;
    d.className = 'hv-sky__star';
    d.style.cssText = `left:${(rnd() * 100).toFixed(1)}%;top:${(rnd() * 96).toFixed(0)}px;width:${sz}px;height:${sz}px${big ? ';box-shadow:0 0 6px 1px rgba(255,255,255,.6)' : ''}`;
    d.dataset.o = (0.35 + rnd() * 0.65).toFixed(2);
    box.append(d);
    stars.push(d);
  }
  return el;
}

export function paintSkyLayer() {
  const want = root.dataset.style === 'haven' && root.dataset.motion !== 'still' && !!document.body;
  if (!want) {
    layer?.remove();
    layer = null;
    root.removeAttribute('data-sky-real');
    return;
  }
  if (!layer || !layer.isConnected) { layer = build(); document.body.prepend(layer); }
  root.setAttribute('data-sky-real', '');
  // Someone who follows the sun sees the real sky. Someone whose colours are fixed (Haven day, Haven night, "follow my phone") sees a sky that
  // agrees with them, not a night sky behind a light page.
  const force = appearance('colour') === 'sun' ? null : root.dataset.theme === 'dark' ? 'night' : 'day';
  const st = skyState(Date.now(), getPlace(), force);
  const q = (sel) => layer.querySelector(sel);
  const set = (k, v) => layer.style.setProperty(k, v);
  set('--sky-top', `rgb(${rgb(st.sky.top)})`);
  set('--sky-mid', `rgb(${rgb(st.sky.mid)})`);
  set('--sky-hz', `rgb(${rgb(st.sky.hz)})`);
  set('--sky-veil', st.veil.toFixed(2));
  set('--ridge-far', st.night ? 'rgb(8,14,36)' : 'rgb(96,128,188)');
  const sp = spot(st.sun), mp = spot(st.moon);
  const place = (el, p, o) => { el.style.left = `${p.x.toFixed(1)}%`; el.style.top = `${p.y.toFixed(1)}px`; el.style.opacity = clamp(o).toFixed(2); };
  const sunEl = q('.hv-sky__sun'), moonEl = q('.hv-sky__moon');
  const sunCol = [255, 244, 214].map((v, i) => v + ([255, 112, 48][i] - v) * st.warm);
  set('--sun', `rgb(${rgb(sunCol)})`);
  set('--sun-r', `${(22 + st.warm * 30).toFixed(0)}px`);
  set('--sun-glow', `rgba(${rgb(sunCol)},${(0.45 + st.warm * 0.2).toFixed(2)})`);
  place(sunEl, sp, st.sunShown);
  place(moonEl, mp, st.moonShown);
  const shape = moonPathD(st.moon.phase);
  q('.hv-sky__lit').setAttribute('d', shape.d);
  moonEl.style.transform = shape.flip ? 'scaleX(-1)' : 'none';
  moonEl.style.filter = `drop-shadow(0 0 ${5 + st.moon.fraction * 12}px rgba(188,204,255,${(0.12 + st.moon.fraction * 0.42).toFixed(2)}))`;
  q('.hv-sky__earth').setAttribute('opacity', (0.4 + 0.2 * (1 - st.moon.fraction)).toFixed(2));
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

export function startSky() {
  // Whatever happens, the page never sits scrolled sideways: put it back the moment it is.
  addEventListener('scroll', () => { if (window.scrollX !== 0) window.scrollTo(0, window.scrollY); }, { passive: true });
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
  new MutationObserver(paintSkyLayer).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'data-style'] });
}
