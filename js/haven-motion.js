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

/* ---- small facts the Summary carries on its vault (summary-looks.js havenTop) ---------------------------------------- */

/* A number that counts from one value to another (what the figure does when the month starts over). */
function countFigure(vault, from, ms) {
  const el = vault.querySelector('[data-roll-kind="left"]');
  if (!el) return;
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue)) || el;
  const final = node === el ? el.textContent : node.nodeValue;
  const to = Math.round((Number(el.dataset.roll) || 0) / 100);
  const t0 = performance.now();
  const write = (t) => (node === el ? (el.textContent = t) : (node.nodeValue = t));
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - p, 3);
    write(p >= 1 ? final : Math.round(from + (Math.abs(to) - from) * e).toLocaleString('en-IN'));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function sparks(host, n, ms, colour, top = 55) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.className = 'hv-spark';
    if (colour) s.style.background = colour;
    s.style.left = `${20 + Math.random() * 60}%`;
    s.style.top = `${top + Math.random() * 25}%`;
    host.append(s);
    s.animate([{ transform: 'translateY(0) scale(.4)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: `translateY(-${30 + Math.random() * 50}px) translateX(${Math.random() * 40 - 20}px) scale(1)`, opacity: 0 }], { duration: ms, delay: i * 70, easing: 'ease-out' }).onfinish = () => s.remove();
  }
}

/* The Plan tab's dot: something is due within two days (or late). It pulses; the icon wiggles once as it arrives. */
export function setDueDot(n) {
  const tab = document.querySelector('#tabs .nav-btn[data-view="plan"]');
  if (!tab) return;
  let dot = tab.querySelector('.hv-dot');
  if (!n || !isHaven()) { dot?.remove(); return; }
  if (dot) return;
  dot = document.createElement('i');
  dot.className = 'hv-dot';
  dot.setAttribute('aria-hidden', 'true');
  tab.append(dot);
  if (live()) {
    dot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'ease-out' });
    tab.querySelector('.nav-icon svg')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(11deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(0)' }], { duration: 700 });
  }
}

/* After eight in the evening, one quiet line under the figure: what today kept. */
function eveLine(vault) {
  const line = vault?.querySelector('[data-eve-line]');
  const text = vault?.dataset.eve;
  if (!line || !text) return;
  if (new Date().getHours() >= 20) {
    if (line.textContent === text) return;
    line.textContent = text;
    if (live()) line.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
  } else line.textContent = '';
}

/* A line that says something for a moment (hidden / shown) and then gives the place back. */
function flash(vault, text) {
  const line = vault?.querySelector('[data-eve-line]');
  if (!line) return;
  line.textContent = text;
  line.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1400 });
  setTimeout(() => {
    line.textContent = '';
    eveLine(vault);
  }, 1400);
}

/* ---- festivals: a small touch on the day itself, once ------------------------------------------------------------ */
const DIWALI = ['2026-11-08', '2027-10-29', '2028-10-17', '2029-11-05', '2030-10-26'];
const HOLI = ['2027-03-22', '2028-03-11', '2029-03-01', '2030-03-20'];
export function festivalOn(iso) {
  if (DIWALI.includes(iso)) return 'Diwali';
  if (HOLI.includes(iso)) return 'Holi';
  if (iso.slice(5) === '01-01') return 'New Year';
  return null;
}
function festival(vault) {
  const day = today();
  const which = festivalOn(day);
  if (!which || appearance('festivals') !== 'on' || store.get('kawach-fest') === day) return;
  store.set('kawach-fest', day);
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit';
  vault.append(host);
  setTimeout(() => host.remove(), 6000);
  if (which === 'Diwali') {
    for (const [x, y] of [[8, 22], [90, 22], [14, 78], [86, 78]]) {
      const d = document.createElement('i');
      d.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:16px;height:22px;margin:-8px;border-radius:50% 50% 45% 45%/70% 70% 30% 30%;background:radial-gradient(circle at 50% 70%,#fff6c4,#ffb030 55%,rgba(255,120,30,0));opacity:0`;
      host.append(d);
      d.animate([{ opacity: 0, transform: 'scale(.2)' }, { opacity: 0.5, transform: 'scale(1)', offset: 0.15 }, { opacity: 0.3, transform: 'scale(.92)', offset: 0.35 }, { opacity: 0.5, transform: 'scale(1.05)', offset: 0.55 }, { opacity: 0.35, offset: 0.8 }, { opacity: 0, transform: 'scale(.4)' }], { duration: 4200 });
    }
  } else if (which === 'Holi') {
    ['#ff4f9a', '#ffd23f', '#3ec7ff', '#7be07b', '#b06bff', '#ff4f9a', '#ffd23f', '#3ec7ff'].forEach((c, i) => {
      const d = document.createElement('i');
      d.style.cssText = `position:absolute;left:${10 + Math.random() * 80}%;top:${10 + Math.random() * 70}%;width:46px;height:46px;margin:-23px;border-radius:50%;background:radial-gradient(circle,${c},transparent 70%);opacity:0`;
      host.append(d);
      d.animate([{ opacity: 0, transform: 'scale(.2)' }, { opacity: 0.35, transform: 'scale(1.3)', offset: 0.25 }, { opacity: 0, transform: 'scale(1.8)' }], { duration: 1800, delay: i * 120 });
    });
  } else sparks(host, 20, 2000, '#ffe7a8', 20);
}

/* A salary has just landed: the water climbs, warm for a moment, and a chip says what came. */
function salaryRise(vault, tide) {
  const [id, text] = (vault.dataset.salary || '').split('|');
  if (!id) return;
  store.set('kawach-salary-seen', id);
  vault.animate([{ boxShadow: '0 0 0 0 rgba(255,190,90,0)' }, { boxShadow: '0 0 37px 6px rgba(255,196,96,.6)', offset: 0.45 }, { boxShadow: '0 0 0 0 rgba(255,190,90,0)' }], { duration: 1800 });
  const chip = document.createElement('div');
  chip.className = 'hv-chip-up';
  chip.textContent = `+${text} salary`;
  vault.append(chip);
  chip.animate([{ opacity: 0, transform: 'translate(-50%,16px) scale(.9)' }, { opacity: 1, transform: 'translate(-50%,-6px) scale(1)', offset: 0.25 }, { opacity: 1, transform: 'translate(-50%,-26px)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%,-34px)' }], { duration: 2600, easing: 'ease-out' }).onfinish = () => chip.remove();
  sparks(tide, 6, 1700, '#ffe7a8');
}

/* The streak chip pops when it grows; a week ahead sparkles once. */
function streakChip(vault) {
  const n = Number(vault.dataset.streak) || 0;
  const chip = vault.querySelector('.hv-streak');
  if (!chip) { store.set('kawach-streak', '0'); return; }
  if (Number(store.get('kawach-streak')) !== n && live()) chip.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
  store.set('kawach-streak', String(n));
  if (n >= 7 && store.get('kawach-streak7') !== vault.dataset.cycle) {
    store.set('kawach-streak7', vault.dataset.cycle);
    if (live()) sparks(vault, 12, 1300, '#ffe7a8', 20);
  }
}

/* Setting up fills the shield (the setup card draws one); when the last step is done, a little sparkle, once. */
function setupSparkle(scope, vault) {
  if (scope.querySelector('.setup-card')) { store.set('kawach-setup-seen', '1'); return; }
  if (vault && store.get('kawach-setup-seen') === '1' && store.get('kawach-setup-done') !== '1') {
    store.set('kawach-setup-done', '1');
    if (live()) sparks(vault.querySelector('.tide') || vault, 10, 1500);
  }
}

/* Called each time a Haven screen has been drawn (wireHaven). */
export function afterDraw(scope) {
  if (!isHaven()) return;
  const tide = scope.querySelector?.('.tide');
  const vault = scope.querySelector?.('.hv-vault');
  tilts = $$('.tide .tilt');
  // Yesterday's strip waits above the whole screen (not above the vault), so it sits in the gap a pull opens.
  const strip = scope.querySelector?.('.hv-peek');
  const page = scope.closest?.('.view-container') || document.getElementById('view-container');
  if (page) page.querySelectorAll(':scope > .hv-peek').forEach((old) => old.remove());
  if (strip && page) page.prepend(strip);
  if (tide && vault && live()) {
    const water = tide.querySelector('.water');
    const to = Number(tide.style.getPropertyValue('--lvl')) || 0;
    let prev = null;
    try { prev = JSON.parse(store.get(TIDE_KEY)); } catch { prev = null; }
    const dropped = Number(sessionStorage.getItem('kawach-drop') || 0) > Date.now() - 8000;
    // A new month: the old water is gone and the new month rises from below.
    const cyc = vault.dataset.cycle || '';
    const lastCyc = store.get('kawach-cycle');
    const fresh = Boolean(lastCyc && cyc && lastCyc !== cyc);
    if (cyc) store.set('kawach-cycle', cyc);
    const from = fresh ? 0 : prev ? prev.lvl : 0;
    if (water && Math.abs(from - to) > 0.002) {
      // Starts where the water was last seen, then moves on (the stylesheet's spring does the moving).
      water.style.transition = 'none';
      water.style.setProperty('--lvl', from.toFixed(3));
      void water.getBoundingClientRect();
      water.style.transition = fresh ? 'transform 1800ms var(--hv-spring-soft)' : '';
      if (fresh) countFigure(vault, 0, 1800);
      if (dropped) dropIn(tide, to, from);
      else requestAnimationFrame(() => requestAnimationFrame(() => settle(tide, to)));
    } else if (dropped && water) dropIn(tide, to, to);
    sessionStorage.removeItem('kawach-drop');
    store.set(TIDE_KEY, JSON.stringify({ key: vault.dataset.levelKey || '', lvl: to }));
    closedGlow(tide);
    if (vault.dataset.salary) salaryRise(vault, tide);
    streakChip(vault);
    festival(vault);
  }
  if (vault) {
    eveLine(vault);
    setDueDot(Number(vault.dataset.soon2) || 0);
  }
  setupSparkle(scope, vault);
  // Goals: each small shield fills from empty as the screen arrives.
  if (live()) {
    $$('.hv-goal__tide .water, .hv-setup__tide .water', scope).forEach((w) => {
      const to = w.style.getPropertyValue('--lvl');
      w.style.transition = 'none';
      w.style.setProperty('--lvl', '0');
      void w.getBoundingClientRect();
      w.style.transition = 'transform 1200ms var(--hv-spring-soft)';
      requestAnimationFrame(() => requestAnimationFrame(() => w.style.setProperty('--lvl', to)));
    });
  }
  // The chart: last month's faint line shows only while it is pressed.
  $$('.waves-card', scope).forEach((card) => {
    if (card.dataset.ghost) return;
    card.dataset.ghost = '1';
    const svg = card.querySelector('svg');
    const on = () => card.classList.add('hv-ghost-on');
    const off = () => card.classList.remove('hv-ghost-on');
    svg?.addEventListener('pointerdown', on);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) svg?.addEventListener(t, off);
  });
  watchVault();
}

/* The chart's day changes under a finger: a tiny tick and the day's bar bounces up. */
export function scrubTick(card, i) {
  if (!live()) return;
  navigator.vibrate?.(3);
  const bar = card.querySelector(`.waves__bar[data-bar="${i}"]`);
  if (!bar?.animate) return;
  bar.style.transformBox = 'fill-box';
  bar.style.transformOrigin = 'bottom';
  bar.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.13)', offset: 0.4 }, { transform: 'scaleY(1)' }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}

/* A short pull from the top shows yesterday for two seconds (the strip sits above the screen; js/pull-refresh.js holds the screen down). */
let peekTimer = 0;
const setPeek = (p) => {
  const el = document.querySelector('.hv-peek');
  if (!el) return;
  el.style.setProperty('--peek', String(clamp(p, 0, 1)));
  el.classList.toggle('on', p > 0);
};
export function peekHold(done) {
  if (!live() || !document.querySelector('.hv-peek')) return false;
  clearTimeout(peekTimer);
  setPeek(1);
  peekTimer = setTimeout(() => {
    peekTimer = 0;
    setPeek(0);
    done();
  }, 2000);
  return true;
}

/* Double-tap the big figure: it blurs (and again to bring it back). */
let lastTap = 0;
function onFigureTap(e) {
  const fig = e.target.closest?.('.hv-vault__fig');
  if (!fig) return;
  const now = performance.now();
  if (now - lastTap < 320) {
    const hidden = root.toggleAttribute('data-hide-fig');
    try { sessionStorage.setItem('kawach-hide-fig', hidden ? '1' : ''); } catch { /* it simply forgets */ }
    flash(fig.closest('.hv-vault'), hidden ? 'Hidden' : 'Shown');
    lastTap = 0;
  } else lastTap = now;
}

/* Shake the phone (three gentle jolts) and it offers to take back the last payment you typed in. */
let asking = false;
async function offerUndo() {
  if (asking || document.body.classList.contains('sheet-open')) return;
  const { getAll, remove, put } = await import('./db.js');
  const last = (await getAll('transactions')).filter((t) => t.source === 'manual' && t.createdAt && Date.now() - t.createdAt < 3600000).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!last) return;
  asking = true;
  navigator.vibrate?.([10, 30, 10]);
  const name = String(last.merchant || last.rawDescription || 'payment');
  const box = document.createElement('div');
  box.className = 'hv-ask';
  box.setAttribute('role', 'alertdialog');
  const label = document.createElement('span');
  label.textContent = `Undo ${name}?`;
  box.append(label);
  for (const [key, text] of [['y', 'Yes'], ['n', 'No']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset[key] = '';
    b.textContent = text;
    box.append(b);
  }
  document.body.append(box);
  requestAnimationFrame(() => box.classList.add('on'));
  const close = () => {
    box.classList.remove('on');
    setTimeout(() => { box.remove(); asking = false; }, 400);
  };
  box.querySelector('[data-n]').addEventListener('click', close);
  setTimeout(() => box.isConnected && close(), 8000);
  box.querySelector('[data-y]').addEventListener('click', async () => {
    close();
    await remove('transactions', last.id);
    const { showToast } = await import('./toast.js');
    window.dispatchEvent(new Event('hv-refresh'));
    showToast(`${name} undone`, {
      ms: 5000,
      action: {
        label: 'Put it back',
        run: async () => {
          await remove('deletions', `transactions:${last.id}`, { tombstone: false });
          await put('transactions', last);
          window.dispatchEvent(new Event('hv-refresh'));
        },
      },
    });
  });
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
  setPeek(state === 'pull' ? p : state === 'busy' ? 1 : peekTimer ? 1 : 0);
  const vh = innerHeight / 100;
  if (state === 'pull') { tideWave.style.transition = 'none'; tideWave.style.height = `${clamp(p, 0, 1) * 14 * vh}px`; }
  else if (state === 'busy') { tideWave.style.transition = `height 700ms ${SOFT}`; tideWave.style.height = `${22 * vh}px`; }
  else { tideWave.style.transition = `height 700ms ${SOFT}`; tideWave.style.height = '0px'; }
}

/* ---- tilt: the water leans and sloshes as the phone tilts (alive) --------------------------------------------- */
const MAX_TILT = 30;
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
  if (!alive() || e.beta == null || e.gamma == null) return;
  // Which way "up" points on the screen, from the phone's angles. Only turning the phone like a steering wheel moves it;
  // tipping it forward or back, or turning the screen towards you, leaves it where it was (gamma alone swings wildly
  // when the phone is upright, which is why the water used to answer to the wrong movement).
  const b = (e.beta * Math.PI) / 180;
  const g = (e.gamma * Math.PI) / 180;
  const ux = -Math.cos(b) * Math.sin(g);
  const uy = Math.sin(b);
  let deg = (Math.atan2(-ux, uy) * 180) / Math.PI;
  if (Math.abs(deg) < 2) deg = 0;
  // Lying flat or upside down: no lean at all (it fades out rather than jumping).
  const fade = uy > 0.2 ? clamp((Math.hypot(ux, uy) - 0.35) / 0.4, 0, 1) : 0;
  // The water stays level, which is a turn the other way on the screen.
  target = clamp(-deg * fade, -MAX_TILT, MAX_TILT);
  kick();
}
let lastX = null;
let jolts = [];
function onMotion(e) {
  const x = e.accelerationIncludingGravity?.x;
  if (x == null) return;
  if (lastX != null) {
    const d = Math.abs(x - lastX);
    // A shake slops the water about (alive only)...
    if (alive() && d > 6) { vel += clamp((x - lastX) * -0.5, -5, 5); kick(); }
    // ...and three gentle jolts within a second offer to undo the last payment.
    if (d > 9) {
      const now = Date.now();
      jolts = jolts.filter((t) => now - t < 1000).concat(now);
      if (jolts.length >= 3) { jolts = []; offerUndo(); }
    }
  }
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
    if (!live()) return;
    D.requestPermission().then((r) => { store.set('kawach-tilt', r === 'granted' ? 'yes' : 'no'); if (r === 'granted') listenTilt(); }).catch(() => {});
  };
  addEventListener('pointerdown', first, true);
}

/* Little bubbles rise in the water now and then (alive; one each beat, never when the screen is hidden or dozing). */
function bubble() {
  if (!alive() || document.hidden || root.hasAttribute('data-dozing')) return;
  const tide = document.querySelector('[data-hv-summary] .hv-vault .tide');
  if (!tide || (Number(tide.style.getPropertyValue('--lvl')) || 0) < 0.2) return;
  const b = document.createElement('i');
  b.className = 'hv-bub';
  b.style.left = `${30 + Math.random() * 40}%`;
  tide.append(b);
  b.animate([{ transform: 'translateY(0)', opacity: 0.8 }, { transform: `translateY(-${20 + Math.random() * 30}px)`, opacity: 0 }], { duration: 1400 }).onfinish = () => b.remove();
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
  document.addEventListener('pointerup', onFigureTap, { passive: true });
  try { if (sessionStorage.getItem('kawach-hide-fig')) root.setAttribute('data-hide-fig', ''); } catch { /* none */ }
  setInterval(() => eveLine(document.querySelector('.hv-vault')), 60000);
  setInterval(bubble, 450);

  // Anything touched wakes it and starts the thirty seconds again.
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(t, awake, { passive: true });
  document.addEventListener('visibilitychange', () => { awake(); paintSky(); });
  awake();

  // A payment was just saved: remember it for the Summary that opens (the coin), note the day (the Add button stops nudging), tap.
  addEventListener('hv-saved', () => {
    sessionStorage.setItem('kawach-drop', String(Date.now()));
      buzz(10);
  });

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
