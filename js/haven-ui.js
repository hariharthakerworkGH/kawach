/* Haven's small behaviours (5.52): the header's extra buttons, the shortcuts, and the line you can drag across.
 * Nothing here draws a screen; the screens draw themselves (js/views/summary-looks.js ...) and this wires what they
 * ask for: [data-hv-go="view"] goes to that screen; .hv-chartwrap reads a day when dragged across. */
import { appearance, setAppearance, applyTheme } from './appearance.js';
import { icon } from './icons.js';
import { pendingAlerts } from './alert-inbox.js';
import { categoryIcon } from './category-icons.js';
import { afterDraw, paidOut, buzzFor, sweepTheme } from './haven-motion.js';
import { lifeDraw } from './haven-life.js';
import { tideSvg } from './views/summary-looks.js';
import { shortRupees } from './format.js';

const inr = (paise) => Math.round(Math.abs(paise) / 100).toLocaleString('en-IN');
const isHaven = () => document.documentElement.dataset.style === 'haven';

/* Shortcuts and cards: one handler for everything marked data-hv-go. */
export function wireHaven(root) {
  if (!root) return;
  root.querySelectorAll('[data-hv-go]').forEach((el) => {
    if (el.dataset.hvWired) return;
    el.dataset.hvWired = '1';
    el.addEventListener('click', () => el.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: el.dataset.hvGo } })));
  });
  root.querySelectorAll('.hv-chartwrap').forEach(scrub);
  lifeDraw(root);
  afterDraw(root);
  // the little bars grow in when they arrive
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('.hv-meter').forEach((m) => m.classList.add('go'))));
  // "Paid or skipped (n)": opens and closes the fold under it.
  root.querySelectorAll('[data-hv-fold]').forEach((b) => {
    if (b.dataset.hvWired) return;
    b.dataset.hvWired = '1';
    b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      b.nextElementSibling?.classList.toggle('open', open);
    });
  });
  // The month's box: tap a figure and the list shows only those rows (tap it again for all).
  root.querySelectorAll('.hv-sum').forEach((box) => {
    if (box.dataset.hvWired) return;
    box.dataset.hvWired = '1';
    const scope = box.closest('.k, #view-container') || document;
    box.querySelectorAll('[data-f]').forEach((k) => k.addEventListener('click', () => {
      const f = box.dataset.filter === k.dataset.f ? '' : k.dataset.f;
      box.dataset.filter = f;
      box.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x.dataset.f === f));
      scope.querySelectorAll('.hv-clist [data-kind]').forEach((row) => { row.hidden = Boolean(f) && row.dataset.kind !== f; });
      scope.querySelectorAll('.hv-clist [data-g]').forEach((label) => { label.hidden = Boolean(f) && (label.dataset.g === 'bills' ? f === 'aside' : f !== 'aside'); });
    }));
  });
  // "Mark paid" on a card: the button says it worked, the card leaves, then the screen is told (it saves and redraws).
  root.querySelectorAll('[data-pay-step]').forEach((b) => {
    if (b.dataset.hvWired) return;
    b.dataset.hvWired = '1';
    b.addEventListener('click', () => {
      paidOut(b.closest('.hv-clist')?.parentElement || document, b.dataset.payStep);
      saveMorph(b, () => {
        setTimeout(() => b.dispatchEvent(new CustomEvent('hv-pay', { bubbles: true, detail: { id: b.dataset.payStep } })), reduced() ? 20 : 640);
      }, 420);
    });
  });
}

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The button that says it worked: a ring turns, the label slides to "Saved", the tick draws, then it settles back. */
export function saveMorph(btn, after, hold = 560) {
  if (btn.classList.contains('saving') || btn.classList.contains('saved')) return;
  const lbl = btn.querySelector('.lbl');
  if (lbl && !lbl.querySelector('.done')) lbl.insertAdjacentHTML('beforeend', '<span class="done">Saved</span>');
  const nest = btn.querySelector('.nest');
  if (!nest.querySelector(".spin")) nest.insertAdjacentHTML('afterbegin', '<i class="spin"></i>');
  nest.querySelector('svg')?.classList.add('tick');
  btn.classList.add('saving');
  // a bill marked paid is two quick taps; a payment saved is one
  buzzFor(btn.matches('[data-pay-step]') ? 'paid' : 'saved');
  setTimeout(() => { btn.classList.remove('saving'); btn.classList.add('saved'); }, reduced() ? 10 : hold);
  setTimeout(() => { if (after) after(); setTimeout(() => btn.classList.remove('saved'), 900); }, reduced() ? 20 : hold + 640);
}

/* Drag across the month's line to read a day: what was spent by then, and what an even pace would have been. */
function scrub(wrap) {
  if (wrap.dataset.hvWired) return;
  wrap.dataset.hvWired = '1';
  const W = Number(wrap.dataset.w), limit = Number(wrap.dataset.limit), days = Number(wrap.dataset.days), first = Number(wrap.dataset.first) || 1;
  const cum = wrap.dataset.cum.split(',').map(Number), month = wrap.dataset.month;
  const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.hv-tip'), line = wrap.querySelector('.cur-line'), dot = wrap.querySelector('.cur-dot');
  const x = (d) => 14 + ((d - 1) / Math.max(1, days - 1)) * (W - 28);
  const yMax = limit * 0.7;
  const y = (v) => 104 - (Math.min(v, yMax) / yMax) * 92;
  const at = (e) => {
    const r = svg.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const d = Math.max(1, Math.min(cum.length, Math.round(((f * W - 14) / (W - 28)) * (days - 1)) + 1));
    const v = cum[d - 1], px = x(d);
    line.setAttribute('x1', px); line.setAttribute('x2', px); dot.setAttribute('cx', px); dot.setAttribute('cy', y(v));
    line.classList.add('on'); dot.classList.add('on'); tip.classList.add('show');
    tip.innerHTML = `<b>${first + d - 1 > 31 ? d : first + d - 1} ${month}</b> · ₹${inr(v)} spent<br><span>an even pace would be ₹${inr((limit * d) / days)}</span>`;
    tip.style.left = `${Math.max(18, Math.min(82, (px / W) * 100))}%`;
    if (navigator.vibrate) navigator.vibrate(4);
  };
  const off = () => { line.classList.remove('on'); dot.classList.remove('on'); tip.classList.remove('show'); };
  svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); at(e); });
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') at(e); });
  svg.addEventListener('pointerup', off);
  svg.addEventListener('pointerleave', off);
  svg.addEventListener('pointercancel', off);
}

/* The header, as the prototype draws it: Summary says good morning/afternoon/evening above its name and carries
 * three round buttons (cover the amounts, day or night, bank messages); Plan carries the Coach button; every other
 * screen is its title and the round settings button. */
// The eye is remembered: someone who hides their amounts in public wants them hidden next time too.
try { if (localStorage.getItem('kawach-covered')) document.documentElement.classList.add('hv-covered'); } catch { /* private window */ }

export function havenHeader(view) {
  const header = document.querySelector('.app-header');
  if (!header) return;
  header.querySelectorAll('.hv-hdr-extra').forEach((n) => n.remove());
  header.dataset.hvView = view;
  const title = header.querySelector('#view-title');
  let who = header.querySelector('.hv-hdr__who');
  if (!isHaven()) {
    who?.querySelector('.hv-hdr__hi')?.remove();
    return;
  }
  if (!who && title) {
    who = document.createElement('div');
    who.className = 'hv-hdr__who';
    title.before(who);
    who.append(title);
  }
  let hi = who.querySelector('.hv-hdr__hi');
  if (view === 'summary') {
    const h = new Date().getHours();
    if (!hi) { hi = document.createElement('span'); hi.className = 'hv-hdr__hi'; who.prepend(hi); }
    hi.textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  } else hi?.remove();
  const settings = header.querySelector('#settings-btn');
  settings?.classList.add('hv-round');
  const holder = document.createElement('span');
  holder.className = 'hv-hdr-extra';
  const round = (label, inner, extra = '') => `<button type="button" class="hv-round" aria-label="${label}"${extra}>${inner}</button>`;
  if (view === 'summary') {
    const night = document.documentElement.dataset.theme === 'dark';
    holder.innerHTML = round('Hide the amounts', icon('eye'), ` data-hv-act="cover" aria-pressed="${document.documentElement.classList.contains('hv-covered')}"`)
      + round('Switch between day and night', icon(night ? 'sun' : 'moon'), ' data-hv-act="theme"')
      + round('Bank messages', `${icon('bell')}<i class="hv-badge" hidden></i>`, ' data-hv-act="bell"');
  } else if (view === 'plan') {
    holder.innerHTML = `<button type="button" class="hv-pillbtn" data-hv-act="coach"><span class="hv-ic">${icon('coach')}</span>Coach</button>`;
  }
  if (holder.innerHTML) settings.before(holder);
  // Coach and the month in review open from another screen: a round back button before the title, as the prototype draws it.
  header.querySelector('.hv-back')?.remove();
  const BACK = { coach: 'plan', recap: 'summary' };
  if (BACK[view]) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'hv-round hv-back';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML = icon('back');
    back.addEventListener('click', () => document.dispatchEvent(new CustomEvent('navigate', { detail: { view: BACK[view] } })));
    header.prepend(back);
  }
  holder.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hv-act]');
    if (!b) return;
    const act = b.dataset.hvAct;
    if (act === 'cover') {
      const on = document.documentElement.classList.toggle('hv-covered');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Show the amounts' : 'Hide the amounts');
      try { localStorage.setItem('kawach-covered', on ? '1' : ''); } catch { /* private window */ }
    }
    else if (act === 'theme') {
      const swap = () => {
        setAppearance('colour', document.documentElement.dataset.theme === 'dark' ? 'haven-day' : 'haven-night');
        applyTheme();
        b.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
      };
      sweepTheme(swap);
    } else if (act === 'bell') document.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'inbox' } }));
    else if (act === 'coach') document.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'coach' } }));
  });
  // How many bank messages are waiting to be checked, on the bell.
  const bell = holder.querySelector('[data-hv-act="bell"] .hv-badge');
  if (bell) Promise.resolve(pendingAlerts()).then((list) => { const n = Array.isArray(list) ? list.length : 0; if (n) { bell.textContent = n; bell.hidden = false; } }).catch(() => {});
}

/* Accounts (5.64): what you hold and what you owe on top, a few filter chips, and one card for each account. Every account
 * is shown once. A card is a picture of the account (a shield that fills with a card's use, a line for a bank balance), its name
 * and its figure; tap it and it opens, in place, into the account's own details and buttons (the screen's own, unchanged).
 * Built from the rows the screen has already drawn, so every figure and every button is the screen's. */
const GEM_OF_TYPE = { bank: [1, 'accounts'], card: [4, 'card'], cash: [3, 'cash'], savings: [6, 'piggy'], loan: [5, 'loan'], pf: [6, 'piggy'] };
const localOpen = new Set();
// The account in front of the stack, kept across redraws (an edit, a sync).
let deckId = null;
const WIFI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 10a10 10 0 0 1 14 0M8 13.5a6 6 0 0 1 8 0M11 17a2 2 0 0 1 2 0"/></svg>';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// The accounts as cards stacked like a wallet (mockups/7.12-cards-and-ring): swipe the front card sideways, or press the arrow keys,
// and the next one comes forward; the account's own details show below it. Reordering falls back to the plain list.
function buildDeck(container, head, groups) {
  if (container.querySelector('.account-row--move') || !container.querySelector('.account-block')) return null;
  container.classList.add('hv-deckmode');
  const wrap = el('div', 'hv-deckwrap');
  const stack = el('div', 'hv-dk');
  stack.tabIndex = 0;
  stack.setAttribute('role', 'group');
  stack.setAttribute('aria-roledescription', 'carousel');
  stack.setAttribute('aria-label', 'Your accounts: swipe sideways, or use the left and right arrow keys');
  const dots = el('div', 'hv-dk__dots');
  dots.setAttribute('aria-hidden', 'true');
  const live = el('p', 'hv-sr');
  live.setAttribute('aria-live', 'polite');
  wrap.append(stack, dots, live);
  head.after(wrap);
  const keyOf = (b) => b.querySelector('.account-row')?.dataset.id;
  let list = [];
  let idx = 0;
  const visibleBlocks = () => groups.filter((g) => g.querySelector('.account-block') && !g.hidden).flatMap((g) => [...g.querySelectorAll('.account-block')]).filter((b) => b.querySelector('.account-row'));
  const faceOf = (b) => {
    const row = b.querySelector('.account-row');
    const type = ([...row.classList].find((c) => c.startsWith('account-row--')) || '').replace('account-row--', '');
    const [, ic] = GEM_OF_TYPE[type] || [1, 'accounts'];
    const card = el('div', 'hv-dk__card');
    const top = el('div', 'hv-dk__top');
    const name = el('span', '');
    const chip = el('b', 'hv-dk__chip');
    chip.innerHTML = ic === 'piggy' || ic === 'loan' ? categoryIcon(ic) : icon(ic);
    name.append(chip, document.createTextNode(row.querySelector('.k-row__title')?.textContent.trim() || ''));
    const wifi = el('i', 'hv-dk__wifi');
    wifi.innerHTML = WIFI;
    top.append(name, wifi);
    const bal = el('div', 'hv-dk__bal', row.querySelector('.account-balance')?.textContent.trim() || '');
    const meta = el('div', 'hv-dk__meta');
    meta.append(el('span', '', (row.querySelector('.k-row__meta')?.textContent || '').replace(/\s+/g, ' ').trim()), el('b', '', row.dataset.last4 ? `•••• ${row.dataset.last4}` : ''));
    card.append(top, bal, meta);
    return card;
  };
  const paintStack = () => {
    const n = list.length;
    stack.querySelectorAll('.hv-dk__card').forEach((c, i) => {
      const rel = (i - idx + n) % n;
      c.style.zIndex = String(n - rel);
      c.style.transform = `translateX(${rel * 22}px) scale(${1 - rel * 0.055})`;
      c.style.opacity = rel > 2 ? '0' : String(1 - rel * 0.22);
      c.style.filter = rel ? `brightness(${1 - rel * 0.18})` : 'none';
      c.setAttribute('aria-hidden', rel ? 'true' : 'false');
    });
    dots.innerHTML = n <= 9 ? list.map((_, i) => `<i${i === idx ? ' class="on"' : ''}></i>`).join('') : `<span>${idx + 1} / ${n}</span>`;
  };
  const show = (i, animate) => {
    const n = list.length;
    if (!n) return;
    idx = ((i % n) + n) % n;
    const sel = list[idx];
    deckId = keyOf(sel);
    list.forEach((b) => { b.hidden = b !== sel; });
    groups.forEach((g) => { if (g.querySelector('.account-block')) g.classList.toggle('deck-off', !g.contains(sel)); });
    paintStack();
    live.textContent = `${sel.querySelector('.k-row__title')?.textContent.trim() || ''}, ${idx + 1} of ${n}`;
    if (animate && isLive()) sel.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
  };
  const refresh = () => {
    list = visibleBlocks();
    groups.forEach((g) => g.classList.remove('deck-off'));
    list.forEach((b) => { b.hidden = false; });
    stack.replaceChildren(...list.map(faceOf));
    wrap.hidden = !list.length;
    const keep = list.findIndex((b) => keyOf(b) === deckId);
    show(keep >= 0 ? keep : 0, false);
  };
  let startX = 0;
  let dx = 0;
  let drag = null;
  stack.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.hv-dk__card');
    if (!c || c.getAttribute('aria-hidden') === 'true') return;
    drag = c; startX = e.clientX; dx = 0;
    c.style.transition = 'none';
    try { c.setPointerCapture(e.pointerId); } catch { /* gone */ }
  });
  stack.addEventListener('pointermove', (e) => {
    if (!drag) return;
    dx = e.clientX - startX;
    drag.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
  });
  const end = () => {
    if (!drag) return;
    const c = drag;
    drag = null;
    c.style.transition = '';
    if (dx < -60) show(idx + 1, true);
    else if (dx > 60) show(idx - 1, true);
    else paintStack();
  };
  stack.addEventListener('pointerup', end);
  stack.addEventListener('pointercancel', end);
  stack.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1, true); }
  });
  refresh();
  return { refresh };
}

// A bigger change takes a little longer, so it never rushes.
const glideMs = (from, to) => Math.min(720, 380 + Math.abs(to - from) * 0.35);
// Grow or shrink a card from one height to another, so what sits below it glides instead of jumping.
function glide(block, from, to) {
  if (!isLive() || Math.abs(from - to) < 2) return;
  block.style.overflow = 'hidden';
  block.dataset.gliding = '1';
  const a = block.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: glideMs(from, to), easing: 'cubic-bezier(.3,.7,.2,1)' });
  const done = () => { block.style.overflow = ''; delete block.dataset.gliding; block._hvLast = block.getBoundingClientRect().height; };
  a.onfinish = done; a.oncancel = done;
}
const keyOf = (b) => b.querySelector('.account-row')?.dataset.id;

// Accounts redraws itself when a card or bank is opened or closed (its details are worked out then). Done in plain sight that
// replays the whole screen's arrival and jumps; this keeps the arrival for the first draw only and glides each card to its new size.
// A card can still grow a moment after it opened (something worked out late, a picture arriving): glide that too, so nothing
// below it ever jumps. Watches the card for a second and a half after a tap.
function watchGrowth(block, height) {
  if (typeof ResizeObserver !== 'function' || block._hvWatch) return;
  block._hvWatch = true;
  block._hvLast = height;
  const ro = new ResizeObserver(() => {
    const h = block.getBoundingClientRect().height;
    if (block.dataset.gliding) return;
    if (Math.abs(h - block._hvLast) > 6 && h > 0) glide(block, block._hvLast, h);
    block._hvLast = h;
  });
  ro.observe(block);
  setTimeout(() => { ro.disconnect(); block._hvWatch = false; }, 1600);
}
export async function softRedraw(container, run) {
  if (!isHaven() || !isLive()) return run();
  const before = new Map([...container.querySelectorAll('.account-block')].map((b) => [keyOf(b), b.getBoundingClientRect().height]));
  container._hvSoft = true;
  try { await run(); } finally { container._hvSoft = false; }
  for (const b of container.querySelectorAll('.account-block')) {
    const k = keyOf(b);
    if (before.has(k)) { const to = b.getBoundingClientRect().height; glide(b, before.get(k), to); if (b.classList.contains('is-open') || b.querySelector('.account-open[aria-expanded="true"]')) watchGrowth(b, to); }
  }
}
const FILTERS = { All: null, Cards: ['Cards'], Money: ['Cash', 'Bank', 'Savings and FDs', 'Provident fund'], Loans: ['Loans'] };
const lakh = (n) => shortRupees(n);
export function havenAccounts(container, justOpened = null) {
  // Whatever goes wrong while the cards are dressed, the screen as drawn stays on show (never a blank page).
  try { dressAccounts(container, justOpened); } catch (err) { console.error('Accounts could not be dressed', err); container.querySelectorAll('.account-group-sec[hidden]').forEach((s) => { s.hidden = false; }); }
  // And a last check once it has settled: if the cards are somehow invisible, show them as they are.
  setTimeout(() => {
    const cards = [...container.querySelectorAll('.account-block')];
    if (cards.length && (!container.querySelector('.hv-hold') || cards.some((c) => Number(getComputedStyle(c).opacity) < 0.5))) {
      container.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      container.querySelectorAll('.account-group-sec[hidden]').forEach((s) => { s.hidden = false; });
    }
  }, 900);
}
function dressAccounts(container, justOpened) {
  if (!isHaven() || container.querySelector('.hv-hold')) return;
  const groups = [...container.querySelectorAll('.account-group-sec')];
  const holdBox = container.querySelector('#hv-hold');
  // the old total and ring give way to the two figures
  container.querySelector('.acct-total')?.remove();
  const chips = document.createElement('div');
  chips.className = 'hv-chips hv-acctchips';
  for (const id of ['add-account-btn', 'go-import-btn', 'accounts-reveal', 'accounts-reorder']) {
    const b = container.querySelector(`#${id}`);
    if (b) { b.classList.add('hv-chip'); b.classList.remove('k-btn', 'k-btn--secondary', 'k-btn--ghost'); chips.append(b); }
  }
  container.querySelector('.accounts-actions')?.remove();
  const sort = container.querySelector('#accounts-sort');

  // the picture of each account
  const deckOn = !container.querySelector('.account-row--move');
  for (const block of container.querySelectorAll('.account-block')) {
    const row = block.querySelector('.account-row');
    if (!row || row.classList.contains('account-row--move')) continue;
    const lead = (() => { try { return JSON.parse(row.dataset.lead || 'null'); } catch { return null; } })();
    const mark = row.querySelector('.k-brand');
    const type = ([...row.classList].find((c) => c.startsWith('account-row--')) || '').replace('account-row--', '');
    const [g, ic] = GEM_OF_TYPE[type] || [1, 'accounts'];
    if (mark) mark.outerHTML = lead && lead.t === 'tank'
      ? `<span class="hv-lead hv-lead--tank tide" data-mood="calm" style="--lvl:${lead.v.toFixed(3)}">${tideSvg(lead.v, 0)}</span>`
      : lead && lead.t === 'line'
        ? `<span class="hv-lead hv-lead--line">${sparkline(lead.pts)}</span>`
        : `<span class="hv-gem hv-g${g}"><span class="hv-ic">${ic === 'piggy' || ic === 'loan' ? categoryIcon(ic) : icon(ic)}</span></span>`;
    // Everything but the row waits behind a tap: a card's bill and its facts, a loan's plan, the buttons. A row that opens by
    // redrawing (a card, a bank) says so itself; the others (a loan, savings, cash) open here, on the spot.
    const opensItself = row.classList.contains('account-open');
    if (!opensItself) { row.setAttribute('role', 'button'); row.setAttribute('tabindex', '0'); }
    const open = deckOn || (opensItself ? row.getAttribute('aria-expanded') === 'true' : localOpen.has(row.dataset.id));
    row.setAttribute('aria-expanded', String(open));
    block.classList.toggle('is-open', open);
    // a balance from a lakh up reads short; the whole figure is on the row's label
    const fig = row.querySelector('.account-balance');
    const m = fig && /^₹\s?([\d,]+)$/.exec(fig.textContent.trim());
    if (m) { const n = Number(m[1].replace(/,/g, '')) * 100; if (n >= 10000000) { fig.setAttribute('title', fig.textContent.trim()); fig.textContent = lakh(n); } }
    // the water inside a card that is open
    if (block.classList.contains('is-open') && !row.querySelector('.hv-rowwater')) row.insertAdjacentHTML('afterbegin', '<span class="hv-rowwater" aria-hidden="true"></span>');
  }

  if (!container._hvAcc) {
    container._hvAcc = true;
    const flip = (row) => {
      const block = row.closest('.account-block');
      const id = row.dataset.id;
      const open = !block.classList.contains('is-open');
      const from = block.getBoundingClientRect().height;
      const y = window.scrollY;
      if (open) localOpen.add(id); else localOpen.delete(id);
      block.classList.toggle('is-open', open);
      row.setAttribute('aria-expanded', String(open));
      row.querySelector('.hv-rowwater')?.remove();
      if (open) row.insertAdjacentHTML('afterbegin', '<span class="hv-rowwater" aria-hidden="true"></span>');
      if (!isLive()) return;
      const to = block.getBoundingClientRect().height;
      if (open) {
        glide(block, from, to);
        watchGrowth(block, to);
        [...block.children].filter((c) => c !== row && getComputedStyle(c).display !== 'none').forEach((c, i) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 80 + i * 30, easing: 'ease-out', fill: 'backwards' }));
        row.querySelector('.hv-rowwater')?.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 1100, easing: 'cubic-bezier(.22,1,.36,1)' });
      } else {
        // closing: keep what is inside on show while the card shrinks over it, then let it go
        block.classList.add('is-open');
        window.scrollTo(0, y);
        block.style.overflow = 'hidden';
        const a = block.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: glideMs(from, to), easing: 'cubic-bezier(.3,.7,.2,1)' });
        const done = () => { block.classList.toggle('is-open', localOpen.has(id)); block.style.overflow = ''; };
        a.onfinish = done; a.oncancel = done;
      }
    };
    container.addEventListener('click', (e) => {
      const row = e.target.closest('.account-row[role="button"]:not(.account-open)');
      if (row && !e.target.closest('button, a, input, select, summary')) flip(row);
    });
    container.addEventListener('keydown', (e) => {
      const row = e.target.closest?.('.account-row[role="button"]:not(.account-open)');
      if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); flip(row); }
    });
  }
  const hold = Number(holdBox?.dataset.hold) || 0;
  const owe = Number(holdBox?.dataset.owe) || 0;
  const top = document.createElement('div');
  top.className = 'hv-hold';
  top.innerHTML = `<div><small>You hold</small><b class="hv-amt" data-count="${hold}">${lakh(hold)}</b><i class="hv-hold__bar"><i style="transform:scaleX(${(hold / Math.max(1, hold + owe)).toFixed(3)})"></i></i></div><div><small>You owe</small><b class="hv-amt" data-count="${owe}">${lakh(owe)}</b><i class="hv-hold__bar owe"><i style="transform:scaleX(${(owe / Math.max(1, hold + owe)).toFixed(3)})"></i></i></div>`;

  const bar = document.createElement('div');
  bar.className = 'hv-filter';
  bar.innerHTML = Object.keys(FILTERS).map((k) => `<button type="button" data-f="${k}">${k}</button>`).join('');
  let filt = 'All';
  try { filt = sessionStorage.getItem('kawach-acct-filter') || 'All'; } catch { filt = 'All'; }
  let deck = null;
  const apply = () => {
    bar.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === filt));
    for (const sec of groups) {
      const title = sec.querySelector('.account-group-label')?.textContent.trim();
      sec.hidden = Boolean(FILTERS[filt]) && !FILTERS[filt].includes(title);
    }
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filt = b.dataset.f;
    try { sessionStorage.setItem('kawach-acct-filter', filt); } catch { /* none */ }
    apply();
    deck?.refresh();
    groups.filter((g) => !g.hidden).forEach((g, i) => g.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: i * 50, easing: 'cubic-bezier(.16,1,.3,1)' }));
  });
  apply();
  const head = document.createElement('div');
  head.className = 'hv-hold-wrap';
  head.append(top, bar);
  if (sort) { sort.classList.add('hv-sortsel'); bar.append(sort); }
  container.prepend(head, ...groups, chips);
  deck = buildDeck(container, head, groups);
  // arrival: the figures count up, the lines draw, the shields fill, the cards rise
  const soft = container._hvSoft;
  if (isLive() && !soft) {
    top.querySelectorAll('[data-count]').forEach((n) => { const to = Number(n.dataset.count); const t0 = performance.now(); const step = (t) => { const p = Math.min(1, (t - t0) / 900); n.textContent = lakh(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
    container.querySelectorAll('.hv-lead--tank .water').forEach((w) => { const to = w.style.getPropertyValue('--lvl'); w.style.transition = 'none'; w.style.setProperty('--lvl', '0'); void w.getBoundingClientRect(); w.style.transition = 'transform 1200ms var(--hv-spring-soft)'; requestAnimationFrame(() => requestAnimationFrame(() => w.style.setProperty('--lvl', to))); });
    container.querySelectorAll('.account-block').forEach((b) => b.animate([{ transform: 'translateY(14px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }));
  }
  // the account you just opened: its details unfold and its card turns navy with water rising
  if (isLive()) {
    if (justOpened) {
      const row = container.querySelector(`.account-open[data-id="${CSS.escape(justOpened)}"]`);
      const block = row?.closest('.account-block');
      const det = block?.querySelector('.account-detail');
      if (det) det.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 80, easing: 'ease-out', fill: 'backwards' });
      row?.querySelector('.hv-rowwater')?.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 1100, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }
}
const isLive = () => document.documentElement.dataset.motion !== 'still' && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
/* a balance as a line drawing itself (eight points) */
function sparkline(pts) {
  const mx = Math.max(...pts), mn = Math.min(...pts);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 68 + 1).toFixed(1)} ${(24 - ((v - mn) / (mx - mn || 1)) * 22).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 70 26" width="70" height="26" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--hv-link)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"><animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.1s" fill="freeze" calcMode="spline" keySplines=".16 1 .3 1" keyTimes="0;1"/></path></svg>`;
}
