/* Haven's life (5.56): what the owner chose in the motion lab (mockups/7.4-motion-lab), built once here so the
 * screens stay plain. css/haven-motion.css holds what needs no script (the tide's breathing, the pulses, the cascade);
 * this holds what does: the sky by the hour, dozing, icons catching the light, pressing and holding, the tab pill's
 * stretch, swiping a bill, a payment landing, the month closing, the slim bar, the pull-down tide and the tilt.
 *
 * Three levels (Settings -> How it looks -> Motion): alive (everything), calm (only what answers a touch) and still
 * (nothing). A phone set to "reduce motion" is always still. Everything asks level() when it runs, so changing the
 * choice takes effect at once. Haven only. */
import { appearance } from './appearance.js';

const root = document.documentElement;
const quiet = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const isHaven = () => root.dataset.style === 'haven';
export const level = () => (!isHaven() || quiet.matches ? 'still' : appearance('motion'));
const live = () => level() !== 'still';
const alive = () => level() === 'alive';
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const SOFT = 'cubic-bezier(.22,1,.36,1)';
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window: it simply forgets */ } },
};

/* A tiny tap you can feel: saves and ticks only (10 ms). */
export function buzz(ms = 10) {
  if (live()) navigator.vibrate?.(ms);
}

/* ---- the sky follows the hour ------------------------------------------------------------------------------- */
const SKY = [[0, [10, 14, 38]], [5, [40, 40, 90]], [7, [244, 170, 130]], [9, [170, 215, 245]], [14, [150, 205, 245]], [17, [250, 190, 120]], [19, [120, 80, 150]], [21, [20, 28, 70]], [24, [10, 14, 38]]];
function skyAt(h) {
  for (let i = 1; i < SKY.length; i++) {
    if (h <= SKY[i][0]) {
      const [h0, c0] = SKY[i - 1], [h1, c1] = SKY[i], f = (h - h0) / (h1 - h0);
      return c0.map((x, j) => Math.round(x + (c1[j] - x) * f));
    }
  }
  return SKY[0][1];
}
function paintSky() {
  if (!alive()) { root.removeAttribute('data-sky-live'); return; }
  const d = new Date();
  const c = skyAt(d.getHours() + d.getMinutes() / 60);
  // Mixed into Haven's own sky, so the header's writing keeps its contrast: a little less in daylight colours, a little more at night.
  const share = root.dataset.theme === 'light' ? 42 : 40;
  root.style.setProperty('--hv-sky-live', `color-mix(in oklab, rgb(${c.join(' ')}) ${share}%, var(--hv-sky))`);
  root.setAttribute('data-sky-live', '');
}

/* ---- it dozes when left alone ------------------------------------------------------------------------------- */
let idleTimer = 0;
let dim;
function awake() {
  clearTimeout(idleTimer);
  if (root.hasAttribute('data-dozing')) {
    root.removeAttribute('data-dozing');
    if (alive()) {
      const v = document.querySelector('.hv-vault');
      if (v) { v.classList.remove('hv-wake'); void v.offsetWidth; v.classList.add('hv-wake'); setTimeout(() => v.classList.remove('hv-wake'), 600); }
    }
  }
  if (alive() && !document.hidden) idleTimer = setTimeout(() => root.setAttribute('data-dozing', ''), 30000);
}

/* ---- icons catch the light, one at a time ------------------------------------------------------------------- */
function sheen() {
  if (!alive() || document.hidden || root.hasAttribute('data-dozing')) return;
  const seen = $$('.hv-gem').filter((g) => { const r = g.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && !g.closest('[hidden]'); });
  if (!seen.length) return;
  const g = seen[Math.floor(Math.random() * seen.length)];
  g.style.setProperty('--s', '0.3');
  g.classList.remove('shine'); void g.offsetWidth; g.classList.add('shine');
  setTimeout(() => g.classList.remove('shine'), 1000);
}

/* ---- pressing, holding, swiping ----------------------------------------------------------------------------- */
const PRESS = '.hv-chip, button.hv-row, .hv-row[data-hv-go], .hv-bill__open, .hv-cardbtn, button.hv-note, .hv-sum__keys button';
const LIFT = '.hv-bill, .hv-row';

function ripple(el, e) {
  const r = el.getBoundingClientRect();
  const dot = document.createElement('i');
  dot.className = 'hv-rip';
  dot.style.left = `${e.clientX - r.left}px`;
  dot.style.top = `${e.clientY - r.top}px`;
  el.append(dot);
  setTimeout(() => dot.remove(), 720);
}

let pressed = null;
let liftTimer = 0;
let lifted = null;
let swipe = null;

function release() {
  clearTimeout(liftTimer);
  pressed?.classList.remove('hv-down');
  pressed = null;
  if (lifted) { lifted.classList.remove('hv-lifted'); lifted = null; }
}

function onDown(e) {
  if (!live() || e.button > 0) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const el = target.closest(PRESS);
  if (el && !el.disabled) {
    pressed = el;
    el.classList.add('hv-down');
    ripple(el, e);
  }
  const row = target.closest(LIFT);
  if (row && !target.closest('.hv-paycheck, input, select, textarea, form')) {
    row.classList.add('hv-lifts');
    clearTimeout(liftTimer);
    liftTimer = setTimeout(() => {
      if (swipe?.on) return;
      lifted = row;
      pressed?.classList.remove('hv-down');
      row.classList.add('hv-lifted');
      buzz(6);
    }, 325);
  }
  const bill = target.closest('.hv-bill[data-kind="topay"]');
  if (bill && !target.closest('.hv-paycheck, form') && e.pointerType !== 'mouse') swipe = { bill, x0: e.clientX, y0: e.clientY, dx: 0, on: false, id: e.pointerId };
}

function onMove(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x0;
  const dy = e.clientY - swipe.y0;
  if (!swipe.on) {
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipe.on = true;
      release();
      const { bill } = swipe;
      const list = bill.parentElement;
      swipe.bg = document.createElement('div');
      swipe.bg.className = 'hv-swbg';
      swipe.bg.style.top = `${bill.offsetTop}px`;
      swipe.bg.style.height = `${bill.offsetHeight}px`;
      list.append(swipe.bg);
      bill.classList.add('hv-swiping');
      bill.style.transition = 'none';
      try { bill.setPointerCapture?.(e.pointerId); } catch { /* a pointer that is already gone */ }
    } else if (Math.abs(dy) > 10) swipe = null;
    if (!swipe?.on) return;
  }
  // Right is "paid" (only when it can be marked), left is "skip"; past 75 px it stretches like elastic (60%).
  const canPay = swipe.bill.dataset.canPay === '1';
  const raw = canPay ? dx : Math.min(0, dx);
  const th = 75;
  const d = Math.abs(raw);
  const eased = Math.sign(raw) * (d > th ? th + (d - th) * (1 - 0.6) * 0.5 : d);
  swipe.dx = raw;
  swipe.bill.style.transform = `translateX(${eased}px)`;
  const pay = raw > 0;
  swipe.bg.className = `hv-swbg ${pay ? 'pay' : 'skip'}`;
  swipe.bg.textContent = d < 4 ? '' : pay ? 'Paid' : 'Skip this month';
  e.preventDefault?.();
}

function onUp() {
  release();
  if (!swipe) return;
  const s = swipe;
  swipe = null;
  if (!s.on) return;
  const done = Math.abs(s.dx) > 75;
  const { bill } = s;
  bill.style.transition = 'transform 560ms var(--hv-spring-snap)';
  bill.style.transform = done ? `translateX(${Math.sign(s.dx) * 22}px)` : '';
  setTimeout(() => { bill.classList.remove('hv-swiping'); bill.style.transition = ''; bill.style.transform = ''; s.bg.remove(); }, done ? 700 : 600);
  if (done) {
    buzz(10);
    bill.dispatchEvent(new CustomEvent(s.dx > 0 ? 'hv-pay' : 'hv-skip', { bubbles: true, detail: { id: bill.dataset.step } }));
  }
  // A swipe is not a tap: the click that follows the lift of the finger must not open the bill.
  const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  bill.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => bill.removeEventListener('click', stop, true), 400);
}

/* ---- the tab pill stretches towards the next tab like a drop of water ----------------------------------------- */
export function stretchMark(mark, from, to) {
  if (!live() || !from || !to || from.x === to.x || !mark.animate) return;
  const dist = Math.abs(to.x - from.x);
  const unit = Math.max(1, to.w);
  const wide = to.w * (1 + 0.8 * Math.min(dist / unit, 3) * 0.6);
  const midX = (from.x + to.x) / 2 + to.w / 2 - wide / 2;
  mark.animate(
    [{ transform: `translateX(${from.x}px)`, width: `${from.w}px` }, { transform: `translateX(${midX}px)`, width: `${wide}px`, offset: 0.45 }, { transform: `translateX(${to.x}px)`, width: `${to.w}px` }],
    { duration: 400, easing: SOFT }
  );
  const svg = document.querySelector('#tabs .nav-btn.active .nav-icon svg');
  svg?.animate?.([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px) scale(1.1)' }, { transform: 'translateY(-1px) scale(1.08)' }], { duration: 400, easing: 'ease-out' });
}

/* ---- marking a bill paid: the row fades away and the bar above slides across ------------------------------------- */
export function paidOut(container, id) {
  if (!live()) return Promise.resolve();
  const row = container.querySelector(`.hv-bill[data-step="${CSS.escape(id)}"]`);
  // Already fading (the tick's own button started it): nothing more to wait for.
  if (!row || row.classList.contains('hv-fading')) return Promise.resolve();
  const amt = Number(row.dataset.amt) || 0;
  const bar = container.querySelector('.hv-sum__bar');
  if (bar && amt) {
    let a = bar.querySelector('i.a');
    const b = bar.querySelector('i.b');
    if (!a) { a = document.createElement('i'); a.className = 'a'; a.style.flex = '0.0001'; bar.prepend(a); void a.offsetWidth; }
    const was = (el) => parseFloat(el.style.flexGrow || el.style.flex) || 0;
    a.style.flex = String(was(a) + amt);
    if (b) b.style.flex = String(Math.max(0.0001, was(b) - amt));
  }
  row.classList.add('hv-fading');
  return new Promise((r) => setTimeout(r, 700));
}

/* ---- the tide: where it was, where it is now, and what lands in it -------------------------------------------- */
let tilts = [];
const TIDE_KEY = 'kawach-tide';
const surfaceOf = (lvl) => 12 + (1 - lvl) * 77;

function dropIn(tide, lvl, lvlFrom) {
  const px = ((surfaceOf(lvlFrom) - 8) / 86) * tide.clientHeight;
  const coin = document.createElement('i');
  coin.className = 'hv-coin';
  coin.textContent = '₹';
  tide.append(coin);
  coin.animate(
    [{ transform: 'translateY(-30px)', opacity: 1 }, { transform: `translateY(${px + 4}px)`, opacity: 1, offset: 0.92 }, { transform: `translateY(${px + 18}px) scale(.4)`, opacity: 0 }],
    { duration: 405, easing: 'cubic-bezier(.5,0,.9,.6)' }
  ).onfinish = () => {
    coin.remove();
    const ring = document.createElement('i');
    ring.className = 'hv-ring';
    ring.style.top = `${px}px`;
    tide.append(ring);
    ring.animate([{ transform: 'scale(.3)', opacity: 0.9 }, { transform: `scale(${2 + 50 / 30})`, opacity: 0 }], { duration: 810, easing: 'ease-out' }).onfinish = () => ring.remove();
    // The level drops to its new place a beat after the coin lands.
    settle(tide, lvl);
  };
}

function settle(tide, lvl) {
  const water = tide.querySelector('.water');
  if (!water) return;
  water.style.setProperty('--lvl', lvl.toFixed(3));
  const t = tide.querySelector('.tilt');
  if (t) t.dataset.sy = surfaceOf(lvl).toFixed(1);
}

function closedGlow(tide) {
  const key = tide.dataset.closed;
  if (!key || store.get('kawach-closed') === key) return;
  store.set('kawach-closed', key);
  tide.closest('.hv-vault')?.classList.add('hv-glowing');
  setTimeout(() => tide.closest('.hv-vault')?.classList.remove('hv-glowing'), 2500);
  for (let i = 0; i < 9; i++) {
    const s = document.createElement('i');
    s.className = 'hv-spark';
    s.style.left = `${30 + Math.random() * 40}%`;
    s.style.top = `${60 + Math.random() * 20}%`;
    tide.append(s);
    s.animate([{ transform: 'translateY(0) scale(.4)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: `translateY(-${30 + Math.random() * 40}px) scale(1)`, opacity: 0 }], { duration: 1700, delay: i * 90, easing: 'ease-out' }).onfinish = () => s.remove();
  }
}

/* Called each time a Haven screen has been drawn (wireHaven). */
export function afterDraw(scope) {
  if (!isHaven()) return;
  const tide = scope.querySelector?.('.tide');
  tilts = $$('.tide .tilt');
  if (tide && live()) {
    const water = tide.querySelector('.water');
    const to = Number(tide.style.getPropertyValue('--lvl')) || 0;
    let prev = null;
    try { prev = JSON.parse(store.get(TIDE_KEY)); } catch { prev = null; }
    const dropped = Number(sessionStorage.getItem('kawach-drop') || 0) > Date.now() - 8000;
    const from = prev ? prev.lvl : 0;
    if (water && Math.abs(from - to) > 0.002) {
      // Starts where the water was last seen, then moves on (the stylesheet's spring does the moving).
      water.style.transition = 'none';
      water.style.setProperty('--lvl', from.toFixed(3));
      void water.getBoundingClientRect();
      water.style.transition = '';
      if (dropped) dropIn(tide, to, from);
      else requestAnimationFrame(() => requestAnimationFrame(() => settle(tide, to)));
    } else if (dropped && water) dropIn(tide, to, to);
    sessionStorage.removeItem('kawach-drop');
    store.set(TIDE_KEY, JSON.stringify({ key: tide.closest('.hv-vault')?.dataset.levelKey || '', lvl: to }));
    closedGlow(tide);
  }
  watchVault();
}

/* ---- the slim bar under the header once the vault has scrolled away ----------------------------------------- */
let mini = null;
let vaultEl = null;
function watchVault() {
  vaultEl = document.querySelector('[data-hv-summary] .hv-vault');
  if (!vaultEl && mini) mini.classList.remove('on');
}
function onScroll() {
  if (!vaultEl || !vaultEl.isConnected) { mini?.classList.remove('on'); return; }
  const show = scrollY > 160 && isHaven();
  if (!mini) {
    mini = document.createElement('div');
    mini.className = 'hv-mini';
    mini.setAttribute('aria-hidden', 'true');
    document.body.append(mini);
  }
  if (show) {
    const hdr = document.querySelector('.app-header');
    mini.style.top = `${(hdr ? hdr.getBoundingClientRect().bottom : 0) + 6}px`;
    const fig = vaultEl.querySelector('.hv-vault__fig')?.textContent.trim() || '';
    const budget = Number(vaultEl.dataset.limit) || 0;
    const left = Number(vaultEl.querySelector('[data-roll-kind="left"]')?.dataset.roll) || 0;
    mini.innerHTML = `<span>Left to spend</span><b>${fig}</b><i style="--p:${budget > 0 ? clamp(left / budget, 0, 1).toFixed(3) : 0}"></i>`;
  }
  mini.classList.toggle('on', show);
}

/* ---- pull to refresh: a rising tide ------------------------------------------------------------------------- */
let tideWave = null;
function onPtr(e) {
  if (!live()) return;
  const { p, state } = e.detail;
  if (!tideWave) {
    tideWave = document.createElement('div');
    tideWave.className = 'hv-ptr';
    tideWave.setAttribute('aria-hidden', 'true');
    tideWave.innerHTML = '<svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M0 12 q12.5 -9 25 0 t25 0 t25 0 t25 0 V40 H0Z"/></svg>';
    document.body.append(tideWave);
  }
  const vh = innerHeight / 100;
  if (state === 'pull') { tideWave.style.transition = 'none'; tideWave.style.height = `${clamp(p, 0, 1) * 14 * vh}px`; }
  else if (state === 'busy') { tideWave.style.transition = `height 700ms ${SOFT}`; tideWave.style.height = `${22 * vh}px`; }
  else { tideWave.style.transition = `height 700ms ${SOFT}`; tideWave.style.height = '0px'; }
}

/* ---- tilt: the water leans and sloshes as the phone tilts (alive) --------------------------------------------- */
const MAX_TILT = 28;
let angle = 0;
let vel = 0;
let target = 0;
let ticking = false;
function tiltStep() {
  vel = (vel + (target - angle) * 0.12) * 0.82;
  angle += vel;
  for (const g of tilts) if (g.isConnected) g.setAttribute('transform', `rotate(${angle.toFixed(2)} 50 ${g.dataset.sy || 50})`);
  if (Math.abs(vel) > 0.02 || Math.abs(target - angle) > 0.05) requestAnimationFrame(tiltStep);
  else ticking = false;
}
function kick() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(tiltStep);
}
function onOrient(e) {
  if (!alive() || e.gamma == null) return;
  // Phone rolled right (gamma > 0): the water stays level, which is a turn to the left on the screen.
  target = clamp(-e.gamma * 1.3, -MAX_TILT, MAX_TILT);
  kick();
}
let lastX = null;
function onMotion(e) {
  const x = e.accelerationIncludingGravity?.x;
  if (!alive() || x == null) return;
  // A shake slops the water about.
  if (lastX != null && Math.abs(x - lastX) > 6) { vel += clamp((x - lastX) * -0.9, -9, 9); kick(); }
  lastX = x;
}
let orientOn = false;
function listenTilt() {
  if (orientOn) return;
  orientOn = true;
  addEventListener('deviceorientation', onOrient);
  addEventListener('devicemotion', onMotion);
}
function askTilt() {
  // Android just starts. iPhones ask once, from a tap, and the answer is remembered.
  const D = window.DeviceOrientationEvent;
  if (!D) return;
  if (typeof D.requestPermission !== 'function') { listenTilt(); return; }
  if (store.get('kawach-tilt') === 'yes') { listenTilt(); return; }
  if (store.get('kawach-tilt') === 'no') return;
  const first = () => {
    removeEventListener('pointerdown', first, true);
    if (!alive()) return;
    D.requestPermission().then((r) => { store.set('kawach-tilt', r === 'granted' ? 'yes' : 'no'); if (r === 'granted') listenTilt(); }).catch(() => {});
  };
  addEventListener('pointerdown', first, true);
}

/* ---- start ---------------------------------------------------------------------------------------------------- */
let started = false;
export function initMotion() {
  if (started) return;
  started = true;
  dim = document.createElement('div');
  dim.className = 'hv-doze';
  dim.setAttribute('aria-hidden', 'true');
  document.body.append(dim);

  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointermove', onMove, { passive: false });
  for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, onUp, { passive: true });
  document.addEventListener('contextmenu', (e) => { if (lifted || e.target.closest?.('.hv-lifts')) e.preventDefault(); });
  document.addEventListener('scroll', () => { clearTimeout(liftTimer); onScroll(); }, { passive: true });
  document.addEventListener('ptr', onPtr);

  // Anything touched wakes it and starts the thirty seconds again.
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, awake, { passive: true });
  document.addEventListener('visibilitychange', () => { awake(); paintSky(); });
  awake();

  // A payment was just saved: remember it for the Summary that opens (the coin), note the day (the Add button stops nudging), tap.
  addEventListener('hv-saved', () => {
    sessionStorage.setItem('kawach-drop', String(Date.now()));
    store.set('kawach-added', today());
    root.setAttribute('data-added-today', '');
    buzz(10);
  });
  if (store.get('kawach-added') === today()) root.setAttribute('data-added-today', '');

  paintSky();
  setInterval(paintSky, 5 * 60 * 1000);
  setInterval(sheen, 3000);
  addEventListener('hv-motion', () => { paintSky(); awake(); if (!alive()) { target = 0; root.removeAttribute('data-dozing'); kick(); } });
  askTilt();
  // On a computer there is no tilt to read: the pointer over the shield stands in for it.
  if (window.matchMedia?.('(pointer: fine)').matches) {
    let overShield = false;
    document.addEventListener('pointermove', (e) => {
      const t = alive() ? e.target.closest?.('.tide') : null;
      if (!t) {
        if (overShield) { overShield = false; target = 0; kick(); }
        return;
      }
      overShield = true;
      const r = t.getBoundingClientRect();
      target = clamp(((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * MAX_TILT, -MAX_TILT, MAX_TILT);
      kick();
    }, { passive: true });
  }
}
