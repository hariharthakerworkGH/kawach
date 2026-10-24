/* Haven's small behaviours (5.52): the header's extra buttons, the shortcuts, and the line you can drag across.
 * Nothing here draws a screen; the screens draw themselves (js/views/summary-looks.js ...) and this wires what they
 * ask for: [data-hv-go="view"] goes to that screen; .hv-chartwrap reads a day when dragged across. */
import { icon } from './icons.js';
import { pendingAlerts } from './alert-inbox.js';
import { categoryIcon } from './category-icons.js';
import { afterDraw, paidOut, buzzFor, sweepTheme } from './haven-motion.js';
import { appearance, setAppearance, applyTheme } from './appearance.js';
import { showToast } from './toast.js';
import { lifeDraw } from './haven-life.js';
import { wireTabs, fitLatest } from './views/summary-looks.js';
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
  wireTabs(root);
  // after the screen has settled into its place, so the page height is the real one
  requestAnimationFrame(() => requestAnimationFrame(() => fitLatest(root)));
  if (!window.__fitLatest) {
    window.__fitLatest = true;
    window.addEventListener('resize', () => fitLatest(document.getElementById('view-container') || document));
  }
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
      (b.dataset.hvFold ? document.getElementById(b.dataset.hvFold) : b.nextElementSibling)?.classList.toggle('open', open);
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

/* The header (the Ledger mockups): a greeting above the title on Summary, and on the right one group of small buttons. Summary's group is
 * cover the amounts, day or night, settings; Plan carries a Coach button beside its group; every other screen's group is settings. The sky
 * (js/haven-sky.js) sits behind all of it. */
// The eye is remembered: someone who hides their amounts in public wants them hidden next time too.
try { if (localStorage.getItem('kawach-covered')) document.documentElement.classList.add('hv-covered'); } catch { /* private window */ }

// What the colour button says for each choice: the toast, and the label. Its icon shows what the screen is wearing now (sun by day, moon by night).
const LOOKS = {
  sun: ['Following the sun', 'Colours: following the sun. Tap to change'],
  'haven-day': ['Always day', 'Colours: always day. Tap to change'],
  'haven-night': ['Always night', 'Colours: always night. Tap to change'],
};
const lookNow = () => (LOOKS[appearance('colour')] ? appearance('colour') : 'sun');
const lookIcon = () => icon(document.documentElement.dataset.theme === 'dark' ? 'moon' : 'sun');

export function havenHeader(view) {
  const header = document.querySelector('.app-header');
  if (!header) return;
  // The settings button lives in the tools group while a screen is shown; take it out before the group is rebuilt.
  const settings = header.querySelector('#settings-btn');
  if (settings && settings.parentElement !== header) header.append(settings);
  header.querySelectorAll('.hv-hdr-extra, .lg-hdr-moved').forEach((n) => n.remove());
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
    hi.textContent = h < 5 || h >= 21 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  } else hi?.remove();
  settings?.classList.add('lg-tool');
  const right = document.createElement('span');
  right.className = 'hv-hdr-extra lg-right';
  const tools = document.createElement('span');
  tools.className = 'lg-tools';
  const tool = (label, inner, extra = '') => `<button type="button" class="lg-tool" aria-label="${label}"${extra}>${inner}</button>`;
  if (view === 'summary') {
    tools.innerHTML = tool('Hide the amounts', icon('eye'), ` data-hv-act="cover" aria-pressed="${document.documentElement.classList.contains('hv-covered')}"`)
      + tool(LOOKS[lookNow()][1], lookIcon(), ' data-hv-act="look"');
  } else if (view === 'plan') {
    right.innerHTML = `<button type="button" class="lg-coach" data-hv-act="coach"><span class="hv-ic">${icon('coach')}</span>Coach</button>`;
  }
  // History's month stepper sits in the header, beside the buttons (the screen draws it, this puts it there)
  if (view === 'transactions') { const nav = document.querySelector('#view-container #hist-month'); if (nav) right.append(nav); }
  if (settings) tools.append(settings);
  right.append(tools);
  header.append(right);
  // Coach and the month in review open from another screen: a back button before the title.
  header.querySelector('.hv-back')?.remove();
  const BACK = { coach: 'plan', recap: 'summary' };
  if (BACK[view]) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'lg-tool lg-back hv-back';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML = icon('back');
    back.addEventListener('click', () => document.dispatchEvent(new CustomEvent('navigate', { detail: { view: BACK[view], back: true } })));
    header.prepend(back);
  }
  right.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hv-act]');
    if (!b) return;
    const act = b.dataset.hvAct;
    if (act === 'cover') {
      const on = document.documentElement.classList.toggle('hv-covered');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Show the amounts' : 'Hide the amounts');
      try { localStorage.setItem('kawach-covered', on ? '1' : ''); } catch { /* private window */ }
    }
    else if (act === 'look') {
      // follow the sun -> always day -> always night -> follow the sun. Anything else (a colouring chosen in Settings) goes to follow the sun.
      const next = { sun: 'haven-day', 'haven-day': 'haven-night' }[lookNow()] || 'sun';
      sweepTheme(() => {
        setAppearance('colour', next);
        applyTheme();
        b.innerHTML = lookIcon();
        b.setAttribute('aria-label', LOOKS[next][1]);
      });
      showToast(LOOKS[next][0]);
    } else if (act === 'coach') document.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'coach' } }));
  });
  markWaiting();
  // the sun and the moon keep to the lane this screen's header leaves clear
  import('./haven-sky.js').then((m) => m.paintSkyLayer()).catch(() => {});
}

// How many bank messages are waiting to be checked: a dot on the + button on every screen, and the number on any Paste SMS chip.
export async function markWaiting(root = document) {
  let n = 0;
  try { n = (await pendingAlerts()).length; } catch { n = 0; }
  const add = document.querySelector('#tabs .nav-btn[data-view="add"]');
  if (add) {
    add.toggleAttribute('data-waiting', n > 0);
    add.title = n ? `${n} bank message${n === 1 ? '' : 's'} waiting` : '';
  }
  root.querySelectorAll('[data-hv-go="inbox"]').forEach((chip) => {
    chip.querySelector('.hv-count')?.remove();
    if (n) chip.insertAdjacentHTML('beforeend', `<i class="hv-count">${n}</i>`);
  });
}

/* Accounts (the Ledger mockup): what you hold and what you owe in one card on top, one control to filter, and every account as a row in one list.
 * A row is the account's icon, its name and what it says about itself, and its figure, with a thin bar along its foot for a card's use or a
 * loan's repayment. Tap a row and it opens, in place, into the account's own details and buttons (the screen's own, unchanged).
 * Built from the rows the screen has already drawn, so every figure and every button is the screen's. */
const TYPE_LOOK = { bank: ['bank', 't5'], card: ['card', 't3'], cash: ['cash', 't5'], savings: ['coins', 't5'], loan: ['loan', 't2'], pf: ['coins', 't5'] };
const localOpen = new Set();
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

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
    if (cards.length && (!container.querySelector('.lg-hold') || cards.some((c) => Number(getComputedStyle(c).opacity) < 0.5))) {
      container.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      container.querySelectorAll('.account-group-sec[hidden]').forEach((s) => { s.hidden = false; });
    }
  }, 900);
}
function dressAccounts(container, justOpened) {
  if (!isHaven() || container.querySelector('.lg-hold')) return;
  const groups = [...container.querySelectorAll('.account-group-sec')];
  const holdBox = container.querySelector('#hv-hold');
  // the old total and ring give way to the two figures
  container.querySelector('.acct-total')?.remove();
  // the two buttons that matter, and one quiet line for the rest
  const btns = el('div', 'lg-accbtns');
  for (const [id, ic] of [['add-account-btn', 'add'], ['go-import-btn', 'upload']]) {
    const b = container.querySelector(`#${id}`);
    if (!b) continue;
    b.className = 'lg-btn s';
    if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', icon(ic));
    btns.append(b);
  }
  const quiet = el('div', 'lg-accquiet');
  const sort = container.querySelector('#accounts-sort');
  for (const id of ['accounts-reveal', 'accounts-reorder']) {
    const b = container.querySelector(`#${id}`);
    if (b) { b.className = 'lg-btn q sm'; quiet.append(b); }
  }
  if (sort) { sort.classList.add('hv-sortsel'); quiet.prepend(sort); }
  container.querySelector('.accounts-actions')?.remove();

  // the icon of each account and the bar along its foot
  for (const block of container.querySelectorAll('.account-block')) {
    const row = block.querySelector('.account-row');
    if (!row || row.classList.contains('account-row--move')) continue;
    const lead = (() => { try { return JSON.parse(row.dataset.lead || 'null'); } catch { return null; } })();
    const mark = row.querySelector('.k-brand');
    const type = ([...row.classList].find((c) => c.startsWith('account-row--')) || '').replace('account-row--', '');
    const [ic, tone] = TYPE_LOOK[type] || ['bank', 't5'];
    if (mark) mark.outerHTML = `<span class="lg-ico ${tone}">${categoryIcon(ic)}</span>`;
    if (lead && lead.t === 'tank') row.insertAdjacentHTML('beforeend', `<span class="lg-edge${type === 'loan' ? ' warn' : ''}" aria-hidden="true"><i style="width:${Math.round(lead.v * 100)}%"></i></span>`);
    // Everything but the row waits behind a tap: a card's bill and its facts, a loan's plan, the buttons. A row that opens by
    // redrawing (a card, a bank) says so itself; the others (a loan, savings, cash) open here, on the spot.
    const opensItself = row.classList.contains('account-open');
    if (!opensItself) { row.setAttribute('role', 'button'); row.setAttribute('tabindex', '0'); }
    const open = opensItself ? row.getAttribute('aria-expanded') === 'true' : localOpen.has(row.dataset.id);
    row.setAttribute('aria-expanded', String(open));
    block.classList.toggle('is-open', open);
    // a long figure keeps its whole value on the row's label
    const fig = row.querySelector('.account-balance');
    if (fig) fig.setAttribute('title', fig.textContent.trim());
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
      if (!isLive()) return;
      const to = block.getBoundingClientRect().height;
      if (open) {
        glide(block, from, to);
        watchGrowth(block, to);
        [...block.children].filter((c) => c !== row && getComputedStyle(c).display !== 'none').forEach((c, i) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 80 + i * 30, easing: 'ease-out', fill: 'backwards' }));
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
  const top = el('div', 'lg-card lg-hold');
  top.innerHTML = `<div class="lg-hold__row"><div><small>You hold</small><b class="hv-amt" data-count="${hold}">${lakh(hold)}</b></div><div class="r"><small>You owe</small><b class="hv-amt" data-count="${owe}">${lakh(owe)}</b></div></div>${hold + owe > 0 ? `<div class="lg-mbar" aria-hidden="true">${hold > 0 ? `<i style="flex:${hold}"></i>` : ''}${owe > 0 ? `<i class="owe" style="flex:${owe}"></i>` : ''}</div>` : ''}`;

  const bar = el('div', 'hv-filter lg-seg');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Which accounts to show');
  bar.innerHTML = Object.keys(FILTERS).map((k) => `<button type="button" data-f="${k}">${k}</button>`).join('');
  let filt = 'All';
  try { filt = sessionStorage.getItem('kawach-acct-filter') || 'All'; } catch { filt = 'All'; }
  // every kind of account is one list; the lent and borrowed list, if there is one, keeps its own heading under it
  const list = el('div', 'lg-card lg-acclist');
  const apply = () => {
    bar.querySelectorAll('[data-f]').forEach((b) => { const on = b.dataset.f === filt; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    for (const sec of groups) {
      const title = sec.querySelector('.account-group-label')?.textContent.trim();
      sec.hidden = Boolean(FILTERS[filt]) && !FILTERS[filt].includes(title);
    }
    // the first row on show has no line above it
    const first = [...list.querySelectorAll('.account-block')].find((b) => !b.closest('[hidden]'));
    list.querySelectorAll('.account-block').forEach((b) => b.classList.toggle('lg-first', b === first));
  };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filt = b.dataset.f;
    try { sessionStorage.setItem('kawach-acct-filter', filt); } catch { /* none */ }
    apply();
    groups.filter((g) => !g.hidden).forEach((g, i) => g.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: i * 50, easing: 'cubic-bezier(.16,1,.3,1)' }));
  });
  const head = el('div', 'hv-hold-wrap lg-hold-wrap');
  head.append(top, bar);
  list.append(...groups.filter((g) => !g.classList.contains('people-sec')));
  apply();
  container.prepend(head, list, ...groups.filter((g) => g.classList.contains('people-sec')), btns, quiet);
  // arrival: the figures count up, the rows rise
  const soft = container._hvSoft;
  if (isLive() && !soft) {
    top.querySelectorAll('[data-count]').forEach((n) => { const to = Number(n.dataset.count); const t0 = performance.now(); const step = (t) => { const p = Math.min(1, (t - t0) / 900); n.textContent = lakh(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
    container.querySelectorAll('.account-block').forEach((b) => b.animate([{ transform: 'translateY(14px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }));
  }
  // the account you just opened: its details unfold
  if (isLive() && justOpened) {
    const row = container.querySelector(`.account-open[data-id="${CSS.escape(justOpened)}"]`);
    const det = row?.closest('.account-block')?.querySelector('.account-detail');
    if (det) det.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 80, easing: 'ease-out', fill: 'backwards' });
  }
}
const isLive = () => document.documentElement.dataset.motion !== 'still' && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
/* a balance as a line drawing itself (eight points) */
function sparkline(pts) {
  const mx = Math.max(...pts), mn = Math.min(...pts);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 68 + 1).toFixed(1)} ${(24 - ((v - mn) / (mx - mn || 1)) * 22).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 70 26" width="70" height="26" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--hv-link)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"><animate attributeName="stroke-dashoffset" from="100" to="0" dur="1.1s" fill="freeze" calcMode="spline" keySplines=".16 1 .3 1" keyTimes="0;1"/></path></svg>`;
}
