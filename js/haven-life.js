/* Haven's life, second part (5.60): what the owner chose in motion lab 3. Looking back (rewind the month, the Sunday card,
 * the month as a patch of colour, the month told in cards, small badges), doing things more easily (the amount in words,
 * keys that feel good, a limit to try by dragging the water, a payment that stamps in, a category that trembles) and the
 * world around the shield (a row that opens into itself, a shield that sleeps when there is nothing yet).
 * The pieces of data come on the Summary's own markup (data-life, data-recap, data-story, data-weather, ...), drawn in
 * js/views/summary-looks.js; nothing here reads the database except the daily limit it saves.
 * Same three levels as js/haven-motion.js (alive, calm, still); a phone set to reduce motion is always still. */
import { live, alive, sparks, store, clamp } from './haven-motion.js';
import { setSetting } from './db.js';
import { matchCategoryForDescription } from './merchant-rules.js';
import { tideSvg } from './views/summary-looks.js';

const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const SOFT = 'cubic-bezier(.22,1,.36,1)';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rs = (paise) => `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const surfaceOf = (lvl) => 12 + (1 - lvl) * 77;
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = (iso) => DAYS[new Date(`${iso}T12:00`).getDay()];
const niceDate = (iso) => `${Number(iso.slice(8, 10))} ${MONTH[Number(iso.slice(5, 7)) - 1]}`;

/* The amount in words, the Indian way: "Four lakh fifty thousand". Exported for a test. */
export function rupeeWords(n) {
  if (!(n > 0)) return '';
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const t = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (x) => (x < 20 ? a[x] : t[Math.floor(x / 10)] + (x % 10 ? ` ${a[x % 10]}` : ''));
  const cr = Math.floor(n / 10000000);
  const lk = Math.floor((n % 10000000) / 100000);
  const th = Math.floor((n % 100000) / 1000);
  const hu = Math.floor((n % 1000) / 100);
  const re = n % 100;
  const parts = [];
  if (cr) parts.push(`${two(cr)} crore`);
  if (lk) parts.push(`${two(lk)} lakh`);
  if (th) parts.push(`${two(th)} thousand`);
  if (hu) parts.push(`${a[hu]} hundred`);
  if (re) parts.push(`${hu || th || lk || cr ? 'and ' : ''}${two(re)}`);
  const s = parts.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---- the vault's own level and figure, set from outside ------------------------------------------------------ */
function setLevel(vault, lvl, ms) {
  const tide = vault.querySelector('.tide');
  const water = tide?.querySelector('.water');
  if (!water) return;
  water.style.transition = ms ? `transform ${ms}ms var(--hv-spring-soft)` : 'none';
  water.style.setProperty('--lvl', clamp(lvl, 0, 1).toFixed(3));
  const t = tide.querySelector('.tilt');
  if (t) t.dataset.sy = surfaceOf(clamp(lvl, 0, 1)).toFixed(1);
}

/* ---- a limit to try, by dragging the water -------------------------------------------------------------------- */
function whatIf(vault) {
  const tide = vault.querySelector('.tide');
  const L = parse(vault.dataset.life);
  const status = vault.querySelector('[data-status]');
  if (!tide || !L || !(L.perDay > 0) || tide.dataset.wired) return;
  tide.dataset.wired = '1';
  tide.style.touchAction = 'none';
  tide.classList.add('no-swipe');
  const base = L.perDay;
  const lvl0 = Number(tide.style.getPropertyValue('--lvl')) || 0.5;
  const original = status.innerHTML;
  const STEP = 10000; // ₹100
  let y0 = null;
  let timer = 0;
  let cur = base;
  let keep = vault.querySelector('.hv-keepcap');
  const days = Math.max(1, L.daysLeft || 1);
  const draw = (val) => {
    cur = val;
    setLevel(vault, clamp(lvl0 * (val / base), 0.05, 0.95), 40);
    status.innerHTML = val === base ? original : `<b>${rs(val)}</b> a day instead of ${rs(base)} · ${val < base ? `${rs((base - val) * days)} kept by the end of the month` : `${rs((val - base) * days)} more in all`}`;
    if (!keep) {
      keep = document.createElement('button');
      keep.type = 'button';
      keep.className = 'hv-keepcap';
      keep.textContent = 'Keep this limit';
      status.after(keep);
      keep.addEventListener('click', async () => {
        await setSetting('dailyCap', cur);
        keep.remove();
        keep = null;
        sparks(vault.querySelector('.tide'), 4, 900);
        window.dispatchEvent(new Event('hv-refresh'));
      });
    }
    keep.hidden = val === base;
  };
  tide.addEventListener('pointerdown', (e) => { y0 = e.clientY; clearTimeout(timer); try { tide.setPointerCapture(e.pointerId); } catch { /* none */ } });
  tide.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    const d = (y0 - e.clientY) / 130;
    if (Math.abs(d) < 0.04) return;
    draw(Math.max(STEP, Math.round((base * (1 + d * 1.2)) / STEP) * STEP));
  });
  const up = () => {
    if (y0 == null) return;
    y0 = null;
    if (cur !== base) timer = setTimeout(() => { draw(base); setLevel(vault, lvl0, 700); if (keep) keep.hidden = true; }, 900);
  };
  tide.addEventListener('pointerup', up);
  tide.addEventListener('pointercancel', up);
  // A limit kept earlier can be let go of.
  vault.querySelector('[data-cap]')?.addEventListener('click', async (e) => {
    if (!e.target.closest('b')) return;
    await setSetting('dailyCap', 0);
    window.dispatchEvent(new Event('hv-refresh'));
  });
}

/* ---- the Sunday card ---------------------------------------------------------------------------------------- */
function sundayCard(vault, force) {
  const w = parse(vault.dataset.recap);
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (!w || !live()) return;
  if (!force && (now.getDay() !== 0 || now.getHours() < 18 || store.get('kawach-recap') === dayKey)) return;
  if (!force) store.set('kawach-recap', dayKey);
  const card = document.createElement('div');
  card.className = 'hv-recap';
  card.setAttribute('role', 'status');
  const max = Math.max(1, ...w.days);
  const big = w.days.indexOf(Math.max(...w.days));
  card.innerHTML = `<div class="hv-recap__h"><b>Your week</b><span>${niceDate(w.from)} to ${niceDate(w.to)}</span></div>
    <div class="hv-recap__fig">${rs(w.total)} <small>spent, ${rs(w.under)} ${w.under >= 0 ? 'under' : 'over'} an even pace</small></div>
    <div class="hv-recap__bars">${w.days.map((d, i) => `<i class="${i === big ? 'big' : ''}" style="height:${Math.max(6, (d / max) * 100)}%"></i>`).join('')}</div>
    <div class="hv-recap__f">Biggest day: ${dayName(w.big.date)}, ${rs(w.big.amount)}</div>`;
  document.body.append(card);
  const hide = () => {
    clearTimeout(timer);
    card.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(20px)' }], { duration: 300, fill: 'forwards' }).onfinish = () => card.remove();
  };
  const timer = setTimeout(hide, 15000);
  card.addEventListener('click', hide);
  card.animate([{ opacity: 0, transform: 'translateY(70px)' }, { opacity: 1, transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
  $$('.hv-recap__bars i', card).forEach((b, i) => b.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 600, delay: 300 + i * 70, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' }));
}

/* ---- the month told in cards ----------------------------------------------------------------------------------- */
function story(vault, force) {
  const s = force || parse(vault.dataset.story);
  if (!s || !s.cards.length || !live()) return;
  if (!force) {
    if (store.get('kawach-story') === s.key) return;
    store.set('kawach-story', s.key);
  }
  const wrap = document.createElement('div');
  wrap.className = 'hv-story';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'The month, told back');
  wrap.innerHTML = '<div class="hv-story__card" tabindex="0"><div class="hv-story__a"></div><div class="hv-story__b"></div><div class="hv-story__d"></div></div><div class="hv-story__dots"></div>';
  document.body.append(wrap);
  const card = wrap.querySelector('.hv-story__card');
  const dots = wrap.querySelector('.hv-story__dots');
  let i = 0;
  let timer = 0;
  const close = () => { clearTimeout(timer); wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => wrap.remove(); };
  const show = (first) => {
    const [a, b, d] = s.cards[i];
    card.querySelector('.hv-story__a').textContent = a;
    card.querySelector('.hv-story__b').textContent = b;
    card.querySelector('.hv-story__d').textContent = d;
    dots.innerHTML = s.cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    if (!first) card.animate([{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' });
    if (i === 0) sparks(card, 7, 1200);
    clearTimeout(timer);
    timer = setTimeout(next, 2000);
  };
  const next = () => { if (i >= s.cards.length - 1) { close(); return; } i += 1; show(false); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); else next(); });
  wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  show(true);
}

/* ---- the month as a patch of colour ------------------------------------------------------------------------------ */
function calendar(scope, vault) {
  const host = scope.querySelector('#hv-cal');
  const L = vault && parse(vault.dataset.life);
  if (!host || !L || L.days.length < 3 || host.dataset.done) return;
  host.dataset.done = '1';
  const now = new Date();
  const year = (mmdd) => (Number(mmdd.slice(0, 2)) > now.getMonth() + 2 ? now.getFullYear() - 1 : now.getFullYear());
  const dates = L.days.map(([md, amt]) => ({ iso: `${year(md)}-${md}`, amt }));
  const first = new Date(`${dates[0].iso}T12:00`);
  const lead = (first.getDay() + 6) % 7;
  const max = Math.max(1, ...dates.map((d) => d.amt));
  const cells = [...Array(lead).fill('<i class="blank"></i>'), ...dates.map((d, i) => `<span class="hv-cal__d" role="img" data-i="${i}" style="--k:${(d.amt / max).toFixed(2)}" aria-label="${niceDate(d.iso)}, ${d.amt ? rs(d.amt) : 'nothing'} spent">${Number(d.iso.slice(8))}</span>`)];
  host.innerHTML = `<div class="hv-sec"><h2>The month, day by day</h2></div><div class="hv-shell"><div class="hv-core"><div class="hv-cal"><div class="hv-cal__w">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}</div><div class="hv-cal__g no-swipe">${cells.join('')}</div><div class="hv-cal__t" aria-live="polite">Press a day</div></div></div></div>`;
  const tip = host.querySelector('.hv-cal__t');
  const grid = host.querySelector('.hv-cal__g');
  const on = (b) => { b.classList.add('lift'); tip.textContent = `${dayName(dates[Number(b.dataset.i)].iso)} ${niceDate(dates[Number(b.dataset.i)].iso)} · ${dates[Number(b.dataset.i)].amt ? rs(dates[Number(b.dataset.i)].amt) : 'nothing spent'}`; };
  const off = (b) => b.classList.remove('lift');
  grid.addEventListener('pointerdown', (e) => { const b = e.target.closest('.hv-cal__d'); if (b) on(b); });
  grid.addEventListener('pointerover', (e) => { const b = e.target.closest('.hv-cal__d'); if (b && e.buttons) on(b); });
  for (const t of ['pointerup', 'pointercancel']) grid.addEventListener(t, () => $$('.lift', grid).forEach(off));
  grid.addEventListener('pointerout', (e) => { const b = e.target.closest('.hv-cal__d'); if (b) off(b); });
  // The squares ripple in the first time the fold is opened.
  const fold = host.closest('details');
  const play = () => { if (!live()) return; $$('.hv-cal__d', grid).forEach((b, i) => b.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, delay: ((i + lead) % 7) * 40 + Math.floor((i + lead) / 7) * 60, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' })); };
  if (fold && !fold.open) fold.addEventListener('toggle', () => fold.open && play(), { once: true });
  else play();
}

/* Where it went: the water in a shield, layered by category, biggest at the bottom; touch a layer and the rest dim. */
const SHIELD_PATH = 'M50 12L80 22V48C80 68 67 82 50 89C33 82 20 68 20 48V22Z';
// One little shield per budget, filled as far as the budget has left; nearly empty turns amber. (mockups/7.11-colours)
let tankId = 0;
function tankShield(t, i) {
  const id = `hvtk${++tankId}`;
  const level = clamp(t.left, 0, 1);
  const warm = t.left < 0.15;
  return `<div class="hv-tank${warm ? ' warm' : ''}" data-i="${i}"><svg viewBox="16 8 68 86" role="img" aria-label="${esc(t.name)}: ${Math.round(level * 100)}% of the budget left"><defs><clipPath id="${id}"><path d="${SHIELD_PATH}"/></clipPath></defs><path class="hv-tank__bg" d="${SHIELD_PATH}"/><g clip-path="url(#${id})"><rect data-f x="14" y="${(12 + (1 - level) * 77).toFixed(1)}" width="72" height="90"/></g><path class="hv-tank__rim" d="${SHIELD_PATH}"/></svg><span>${esc(t.name)}</span></div>`;
}

function shieldLayers(layers) {
  const total = layers.reduce((s, c) => s + c.amount, 0) || 1;
  let y = 89;
  const tone = (c, i) => `var(--hv-L${c.name === 'Other' ? 6 : Math.min(i, 4) + 1})`;
  const bands = layers.map((c, i) => { const h = (c.amount / total) * 77 * 0.78; const top = y - h; y = top; return `<rect data-layer="${i}" x="10" y="${top.toFixed(1)}" width="80" height="${h.toFixed(1)}" style="fill:${tone(c, i)};transform-box:fill-box;transform-origin:bottom;transition:opacity .3s"/>`; }).join('');
  const key = layers.map((c, i) => `<button type="button" class="hv-lkey" data-key="${i}"><i style="background:${tone(c, i)}"></i><span>${esc(c.name)}</span><b>${rs(c.amount)}</b></button>`).join('');
  return `<div class="hv-ins__layers"><svg viewBox="16 8 68 86" width="116" height="144" role="img" aria-label="Where this month's money went, by category"><defs><clipPath id="hvL"><path d="${SHIELD_PATH}"/></clipPath></defs><path d="${SHIELD_PATH}" fill="rgba(120,140,170,.12)"/><g clip-path="url(#hvL)">${bands}</g><path d="${SHIELD_PATH}" fill="none" stroke="var(--hv-ink-3)" stroke-width="1.6"/></svg><div class="hv-lkeys">${key}</div></div>`;
}

/* ---- today as a ring, the way to the next salary, this month beside last ----------------------------------------------------- */
function insights(scope, vault) {
  const host = scope.querySelector('#hv-ins');
  const L = vault && parse(vault.dataset.life);
  if (!host || !L || host.dataset.done || !(L.limit > 0)) return;
  host.dataset.done = '1';
  const D = Math.max(1, L.D);
  const share = Math.round(L.limit / D);
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const last = L.days[L.days.length - 1];
  const spentToday = last && last[0] === md ? last[1] : 0;
  const left = share - spentToday;
  const p = clamp(left / share, 0, 1);
  const over = left < 0;
  const salary = L.toSalary > 0 ? new Date(Date.now() + L.toSalary * 86400000) : null;
  const cmp = L.cmp;
  const extra = parse(host.dataset.extra) || {};
  const layers = extra.layers || [];
  const tanks = extra.tanks || [];
  const mineSpent = L.cum[L.cum.length - 1] || 0;
  const mineLvl = clamp(1 - mineSpent / L.limit, 0, 1);
  const sh = (lvl) => `<div class="tide hv-ins__shield" data-mood="calm" style="--lvl:${lvl.toFixed(3)}">${tideSvg(lvl, 0)}</div>`;
  host.innerHTML = `<div class="hv-sec"><h2>Today and the way ahead</h2></div><div class="hv-shell"><div class="hv-core"><div class="hv-ins">
    <div class="hv-ins__ring"><svg viewBox="0 0 120 120" width="120" height="120" style="transform:rotate(-90deg)" role="img" aria-label="${over ? rs(-left) + ' over today' : rs(left) + ' left today'}"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--hv-well)" stroke-width="12"/><circle data-ring cx="60" cy="60" r="50" fill="none" stroke="${over ? 'oklch(70% .15 55)' : 'var(--hv-tide-b)'}" stroke-width="12" stroke-linecap="round" stroke-dasharray="314" stroke-dashoffset="314"/></svg><div class="hv-ins__t"><b>${over ? '−' : ''}${rs(Math.abs(left))}</b><span>${over ? 'over today' : 'left today'}</span></div></div>
    ${salary ? `<div class="hv-ins__arc"><svg viewBox="0 0 280 110" width="100%" height="110" aria-hidden="true"><path d="M20 100 Q140 -40 260 100" fill="none" stroke="var(--hv-hair-strong)" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/><path data-arc d="M20 100 Q140 -40 260 100" fill="none" stroke="var(--hv-tide-b)" stroke-width="3" stroke-linecap="round"/><g data-sun><circle r="11" fill="#ffd36a"/><circle r="19" fill="#ffd36a" opacity=".3"/></g><circle cx="260" cy="100" r="6" fill="var(--hv-good)"/></svg><div class="hv-ins__s">${L.toSalary} day${L.toSalary === 1 ? '' : 's'} to salary · ${salary.getDate()} ${MONTH[salary.getMonth()]}</div></div>` : ''}
    ${layers.length ? shieldLayers(layers) : ''}
    ${tanks.length ? `<div class="hv-ins__tanks" role="group" aria-label="Budgets left">${tanks.map((t, i) => tankShield(t, i)).join('')}</div>` : ''}
    ${cmp ? `<div class="hv-ins__cmp"><div>${sh(mineLvl)}<b>This month</b><span>${rs(mineSpent)} spent so far</span></div><div>${sh(clamp(1 - cmp.spent / cmp.limit, 0, 1))}<b>Last month</b><span>${rs(cmp.spent)} by this day</span></div><p>${mineSpent <= cmp.spent ? `${rs(cmp.spent - mineSpent)} less than last month so far` : `${rs(mineSpent - cmp.spent)} more than last month so far`}</p></div>` : ''}
  </div></div></div>`;
  const ring = host.querySelector('[data-ring]');
  const arc = host.querySelector('[data-arc]');
  const sun = host.querySelector('[data-sun]');
  const play = () => {
    host.querySelectorAll('[data-layer]').forEach((r, i) => r.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: live() ? 700 : 1, delay: live() ? i * 140 : 0, easing: 'cubic-bezier(.34,1.3,.64,1)', fill: 'backwards' }));
    if (live()) host.querySelectorAll('.hv-tank [data-f]').forEach((f) => f.animate([{ transform: 'translateY(76px)' }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' }));
    ring.style.transition = live() ? 'stroke-dashoffset 900ms var(--hv-spring-soft)' : 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = String(314 * (1 - p)); }));
    if (arc) {
      const len = arc.getTotalLength();
      const frac = clamp(1 - L.toSalary / 30, 0.03, 1);
      arc.style.strokeDasharray = String(len);
      const put = (v) => { arc.style.strokeDashoffset = String(len - v); const pt = arc.getPointAtLength(v); sun.setAttribute('transform', `translate(${pt.x},${pt.y})`); };
      if (!live()) { put(len * frac); return; }
      const t0 = performance.now();
      const step = (n) => { const q = Math.min(1, (n - t0) / 900); put(len * frac * (1 - Math.pow(1 - q, 3))); if (q < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    if (cmp) host.querySelectorAll('.hv-ins__shield .water').forEach((w) => { const to = w.style.getPropertyValue('--lvl'); w.style.transition = 'none'; w.style.setProperty('--lvl', '0'); void w.getBoundingClientRect(); w.style.transition = live() ? 'transform 1200ms var(--hv-spring-soft)' : 'none'; requestAnimationFrame(() => requestAnimationFrame(() => w.style.setProperty('--lvl', to))); });
  };
  let sel = -1;
  const pick = (i) => {
    sel = sel === i ? -1 : i;
    host.querySelectorAll('[data-layer]').forEach((r) => { r.style.opacity = sel < 0 || Number(r.dataset.layer) === sel ? '1' : '0.5'; });
    host.querySelectorAll('.hv-lkey').forEach((k) => { k.style.opacity = sel < 0 || Number(k.dataset.key) === sel ? '1' : '0.5'; });
  };
  host.addEventListener('click', (e) => { const t = e.target.closest('[data-layer], .hv-lkey'); if (t) pick(Number(t.dataset.layer ?? t.dataset.key)); });
  const fold = host.closest('details');
  if (fold && !fold.open) fold.addEventListener('toggle', () => fold.open && play(), { once: true });
  else play();
}

/* ---- a payment that has just been saved stamps into the list -------------------------------------------------------- */
function stamp(scope) {
  let fresh = false;
  try { fresh = Number(sessionStorage.getItem('kawach-drop') || 0) > Date.now() - 8000; } catch { fresh = false; }
  if (!fresh || !live()) return;
  const rows = $$('.hv-lp', scope);
  if (!rows.length) return;
  const first = rows[0];
  first.animate([{ transform: 'translateY(-30px) scale(1.06)', opacity: 0 }, { transform: 'translateY(2px) scale(.99)', opacity: 1, offset: 0.55 }, { transform: 'none' }], { duration: 560, delay: 500, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' });
  rows.slice(1).forEach((r) => r.animate([{ transform: 'translateY(-2px)' }, { transform: 'translateY(2px)', offset: 0.5 }, { transform: 'none' }], { duration: 520, delay: 620 }));
  first.querySelector('.hv-gem')?.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(.9)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 560, delay: 640, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' });
  first.animate([{ background: 'color-mix(in oklab, var(--hv-glow) 28%, var(--hv-core))' }, { background: 'transparent' }], { duration: 1600, delay: 600, fill: 'backwards' });
}

/* ---- a row opens into its details ---------------------------------------------------------------------------------- */
function morph(scope) {
  scope.querySelectorAll('.hv-lp').forEach((lp) => {
    if (lp.dataset.wired) return;
    lp.dataset.wired = '1';
    const row = lp.querySelector('[data-morph]');
    const d = lp.querySelector('.hv-lp__d');
    row.addEventListener('click', () => {
      const open = row.getAttribute('aria-expanded') !== 'true';
      row.setAttribute('aria-expanded', String(open));
      const to = open ? d.firstElementChild.scrollHeight : 0;
      if (!live()) { d.style.height = `${to}px`; return; }
      d.animate([{ height: `${open ? 0 : d.offsetHeight}px` }, { height: `${to}px` }], { duration: 520, easing: 'cubic-bezier(.34,1.3,.64,1)', fill: 'forwards' }).onfinish = () => { d.style.height = `${to}px`; };
      lp.querySelector('.hv-gem')?.animate([{ transform: 'scale(1)' }, { transform: `scale(${open ? 1.12 : 1})` }], { duration: 520, fill: 'forwards', easing: 'cubic-bezier(.34,1.3,.64,1)' });
    });
    lp.querySelector('[data-open-hist]')?.addEventListener('click', (e) => {
      lp.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', search: e.currentTarget.dataset.openHist } }));
    });
  });
}

/* ---- Kept back opens in place into what is left of each set-aside ------------------------------------------------------------ */
function kept(scope) {
  scope.querySelectorAll('.hv-kept').forEach((k) => {
    if (k.dataset.wired) return;
    k.dataset.wired = '1';
    const head = k.querySelector('.hv-kept__head');
    const list = k.querySelector('.hv-kept__list');
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(open));
      k.classList.toggle('open', open);
      list.inert = !open;
      const to = open ? list.firstElementChild.scrollHeight : 0;
      const rest = () => { list.style.height = open ? 'auto' : '0px'; };
      if (!live()) return rest();
      const a = list.animate([{ height: `${open ? 0 : list.offsetHeight}px` }, { height: `${to}px` }], { duration: 420, easing: 'cubic-bezier(.34,1.3,.64,1)' });
      a.onfinish = () => { a.cancel(); rest(); };
    });
  });
}

/* ---- a category near its limit trembles (alive) ---------------------------------------------------------------------- */
let tremor = 0;
function trembleLoop() {
  if (tremor) return;
  tremor = setInterval(() => {
    if (!alive() || document.hidden) return;
    $$('.hv-bill[data-near] .hv-gem').forEach((g) => {
      const k = 0.45;
      g.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${-9 * k}deg) translateX(${-2 * k}px)` }, { transform: `rotate(${8 * k}deg) translateX(${2 * k}px)` }, { transform: `rotate(${-5 * k}deg)` }, { transform: `rotate(${3 * k}deg)` }, { transform: 'rotate(0)' }], { duration: 640, easing: 'ease-out' });
      const ring = document.createElement('i');
      ring.className = 'hv-ringout';
      g.append(ring);
      ring.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(1.35)', opacity: 0 }], { duration: 900 }).onfinish = () => ring.remove();
    });
  }, 20000);
}

/* ---- a shield that sleeps when there is nothing yet ------------------------------------------------------------------- */
let zzz = 0;
function sleeping(vault) {
  clearInterval(zzz);
  const tide = vault?.querySelector('.tide');
  if (!tide) return;
  const asleep = vault.hasAttribute('data-sleeping');
  if (!asleep) {
    if (store.get('kawach-slept') === '1') {
      store.set('kawach-slept', '0');
      if (live()) tide.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-4deg)', offset: 0.4 }, { transform: 'scale(.97) rotate(2deg)', offset: 0.7 }, { transform: 'none' }], { duration: 700, delay: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    return;
  }
  store.set('kawach-slept', '1');
  if (!alive()) return;
  zzz = setInterval(() => {
    if (!tide.isConnected || document.hidden) { clearInterval(zzz); return; }
    const z = document.createElement('i');
    z.className = 'hv-z';
    z.textContent = 'z';
    tide.append(z);
    z.animate([{ transform: 'translate(0,0) scale(.6)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translate(26px,-34px) scale(1.2)', opacity: 0 }], { duration: 2400 }).onfinish = () => z.remove();
  }, 1100);
}

/* ---- the Add keypad: the amount in words, and keys that feel good ------------------------------------------------------- */
export function keypadLife(pad, input, wrap) {
  const words = document.createElement('div');
  words.className = 'hv-words';
  words.setAttribute('aria-live', 'polite');
  wrap.after(words);
  let last = '';
  const draw = () => {
    const v = parseFloat(input.value);
    const n = Math.floor(v) || 0;
    const base = rupeeWords(n);
    const paise = Math.round((v - n) * 100);
    const text = base ? `${base} rupees${paise ? ` and ${rupeeWords(paise).toLowerCase()} paise` : ''}${n >= 1000000 ? ' · is that right?' : ''}` : '';
    words.classList.toggle('warn', n >= 1000000);
    if (text !== last) { words.textContent = text; if (live() && text) words.animate([{ opacity: 0.2 }, { opacity: 1 }], 220); last = text; }
    // A long amount shrinks to fit its place.
    const len = input.value.length;
    wrap.style.setProperty('--fit', String(clamp(1 - Math.max(0, len - 6) * 0.07, 0.62, 1)));
  };
  input.addEventListener('input', draw);
  draw();
  const down = (b) => {
    if (!live()) return;
    b.style.transition = 'transform 90ms ease-out';
    b.style.transform = 'scale(.89)';
    navigator.vibrate?.(2);
  };
  const release = (b) => { b.style.transition = 'transform 420ms var(--hv-spring-snap)'; b.style.transform = ''; };
  pad.addEventListener('pointerdown', (e) => { const b = e.target.closest('.hv-key'); if (b) down(b); });
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) pad.addEventListener(t, (e) => { const b = e.target.closest?.('.hv-key'); if (b) release(b); });
  pad.addEventListener('click', (e) => {
    const b = e.target.closest('.hv-key');
    if (!b || !live() || b.dataset.key === 'back' || b.dataset.key === '.') return;
    const r = b.getBoundingClientRect();
    const r2 = input.getBoundingClientRect();
    const d = document.createElement('i');
    d.className = 'hv-fly';
    d.textContent = b.dataset.key;
    d.style.left = `${r.left + r.width / 2}px`;
    d.style.top = `${r.top + 6}px`;
    document.body.append(d);
    d.animate([{ transform: 'translate(-50%,0)', opacity: 1 }, { transform: `translate(${r2.left + r2.width / 2 - r.left - r.width / 2}px,${r2.top - r.top}px) scale(1.5)`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.5,0,.9,.6)' }).onfinish = () => d.remove();
  });
}

/* ---- History: a payment that needs a category comes with a guess; swipe right to accept it --------------------------------- */
const guessed = new Map();
export function filingSwipe(container, { find, needs, nameOf, apply }) {
  if (document.documentElement.dataset.style !== 'haven') return;
  container.querySelectorAll('.hist-row:not(.open)').forEach(async (rowEl) => {
    const t = find(rowEl.dataset.id);
    if (!t || !needs(t) || t.personId || rowEl.dataset.filing) return;
    rowEl.dataset.filing = '1';
    const key = `${t.direction}|${t.rawDescription}`;
    if (!guessed.has(key)) guessed.set(key, matchCategoryForDescription(t.rawDescription, t.direction).catch(() => null));
    const categoryId = await guessed.get(key);
    const name = categoryId && nameOf(categoryId);
    if (!name || !rowEl.isConnected) return;
    const sub = rowEl.querySelector('.hist-sub');
    if (sub) sub.insertAdjacentHTML('beforeend', ` <span class="hist-guess">Looks like <b>${esc(name)}</b></span>`);
    const line = rowEl.querySelector('.hist-line');
    // A swipe along this row is for filing a payment.
    line.classList.add('no-swipe');
    let x0 = null;
    let y0 = 0;
    let dx = 0;
    let on = false;
    line.style.touchAction = 'pan-y';
    line.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; x0 = e.clientX; y0 = e.clientY; dx = 0; on = false; });
    line.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      const mx = e.clientX - x0;
      if (!on) {
        if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(e.clientY - y0) * 1.5) { on = true; line.style.transition = 'none'; try { line.setPointerCapture(e.pointerId); } catch { /* none */ } } else return;
      }
      dx = Math.max(0, mx);
      line.style.transform = `translateX(${dx * 0.9}px)`;
      rowEl.dataset.swipe = dx > 70 ? 'ready' : 'pulling';
    });
    const end = () => {
      if (x0 == null) return;
      const go = on && dx > 70;
      x0 = null;
      line.style.transition = 'transform 560ms var(--hv-spring-snap)';
      line.style.transform = '';
      delete rowEl.dataset.swipe;
      if (on) line.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
      on = false;
      if (!go) return;
      navigator.vibrate?.(10);
      if (live()) sparks(rowEl, 3, 700, '#fff', 20);
      setTimeout(() => apply(t, categoryId, rowEl), live() ? 420 : 0);
    };
    line.addEventListener('pointerup', end);
    line.addEventListener('pointercancel', end);
  });
}

/* ---- the lot, for a screen that has just been drawn ---------------------------------------------------------------------- */
export function lifeDraw(scope) {
  if (document.documentElement.dataset.style !== 'haven') return;
  const vault = scope.querySelector?.('[data-hv-summary] .hv-vault') || scope.querySelector?.('.hv-vault');
  if (vault) {
    whatIf(vault);
    insights(scope, vault);
    calendar(scope, vault);
    setTimeout(() => { sundayCard(vault); story(vault); }, 2200);
    if (vault.querySelector('.hv-medal.is-new') && live()) {
      const b = vault.querySelector('.hv-medal.is-new');
      b.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: SOFT });
    }
    sleeping(vault);
  }
  stamp(scope);
  morph(scope);
  kept(scope);
  trembleLoop();
  // generic empty places rest a sleeping shield
  scope.querySelectorAll?.('.empty-state:not([data-slept])').forEach((el) => {
    el.dataset.slept = '1';
    const t = document.createElement('div');
    t.className = 'tide hv-sleep';
    t.dataset.mood = 'calm';
    t.style.setProperty('--lvl', '0.15');
    t.innerHTML = tideSvg(0.15, 0);
    el.prepend(t);
  });
}

/* ---- a pasted message is understood where you can see it: the words are underlined and fly into their fields ------------------ */
export function flyWordsToFields(box, card, kinds) {
  if (document.documentElement.dataset.style !== 'haven' || !live()) return;
  const target = { money: '.al-amount', who: '.al-desc', day: '.al-date' };
  // The fields start empty (their values stay put, only hidden) and each one is filled the moment its word lands on it.
  const jobs = [];
  kinds.forEach((kind) => {
    const mark = box.querySelector(`mark[data-kind="${kind}"]`);
    const field = card.querySelector(target[kind]) || (kind === 'money' ? card.querySelector('.alert-amount') : null);
    if (!mark || !field) return;
    field.style.opacity = '0';
    jobs.push({ mark, field });
  });
  const fill = (field) => {
    field.style.opacity = '';
    field.animate([{ opacity: 0, transform: 'translateY(6px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.34,1.4,.64,1)' });
  };
  jobs.forEach(({ mark, field }, i) => {
    setTimeout(() => {
      const a = mark.getBoundingClientRect();
      const b = field.getBoundingClientRect();
      const chip = document.createElement('i');
      chip.className = 'hv-flychip';
      chip.textContent = mark.textContent;
      chip.style.left = `${a.left}px`;
      chip.style.top = `${a.top}px`;
      document.body.append(chip);
      const fly = chip.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${b.left - a.left}px,${b.top - a.top}px) scale(.85)`, opacity: 0.9 }], { duration: 520, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
      fly.onfinish = () => { chip.remove(); fill(field); };
      mark.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], 360);
    }, 300 + i * 500);
  });
  // Whatever happens, every field is on show again once the show is over.
  setTimeout(() => jobs.forEach(({ field }) => { field.style.opacity = ''; }), 300 + jobs.length * 500 + 900);
}

/* ---- reading a statement: a shield fills while it is read, and never looks stuck ------------------------------------------------ */
export function readingShield(status) {
  const none = { finish() {} };
  if (document.documentElement.dataset.style !== 'haven' || !status) return none;
  status.hidden = false;
  status.className = 'status in';
  status.innerHTML = `<span class="hv-readshield"><span class="tide" data-mood="calm" style="--lvl:0.05">${tideSvg(0.05, 0)}</span><span>Reading…</span></span>`;
  const water = status.querySelector('.water');
  if (!water || !live()) return none;
  requestAnimationFrame(() => requestAnimationFrame(() => { water.style.transition = 'transform 7000ms cubic-bezier(.2,.8,.3,1)'; water.style.setProperty('--lvl', '0.86'); }));
  return {
    finish() {
      water.style.transition = 'transform 500ms var(--hv-spring-soft)';
      water.style.setProperty('--lvl', '1');
      sparks(status.querySelector('.tide'), 6, 900);
    },
  };
}

/* ---- two rows that are the same payment slide together and become one (with five seconds to take it back) ---------------------- */
export function mergeTwins(resultsEl, on, onUndo) {
  if (document.documentElement.dataset.style !== 'haven') return;
  const rows = [...resultsEl.querySelectorAll('.import-row-duplicate')];
  if (!rows.length) return;
  const move = (r, hide) => {
    if (!live()) { r.hidden = hide; return; }
    if (hide) {
      const h = r.offsetHeight;
      r.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(-${Math.min(h, 90)}px)`, opacity: 0 }], { duration: 520, delay: 250, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).onfinish = () => { r.hidden = true; r.getAnimations().forEach((a) => a.cancel()); };
    } else {
      r.hidden = false;
      r.animate([{ transform: 'translateY(-30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.34,1.3,.64,1)' });
    }
  };
  // The twins usually sit in a folded list: open it so the merge is seen, then fold it back (the toast brings them back with Undo).
  const fold = rows[0].closest('details');
  const wasShut = !!fold && !fold.open;
  if (wasShut && live()) { fold.open = true; rows[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  rows.forEach((r) => move(r, on));
  if (wasShut && live() && on) setTimeout(() => { fold.open = false; }, 1500);
  if (on) {
    import('./toast.js').then(({ showToast }) => showToast(`${rows.length} already-imported ${rows.length === 1 ? 'row' : 'rows'} merged`, { ms: 5000, action: { label: 'Undo', run: () => onUndo && onUndo() } }));
  }
}
