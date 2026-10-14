/* Haven's small behaviours (5.52): the header's extra buttons, the shortcuts, and the line you can drag across.
 * Nothing here draws a screen; the screens draw themselves (js/views/summary-looks.js ...) and this wires what they
 * ask for: [data-hv-go="view"] goes to that screen; .hv-chartwrap reads a day when dragged across. */
import { appearance, setAppearance, applyTheme } from './appearance.js';
import { icon } from './icons.js';
import { pendingAlerts } from './alert-inbox.js';
import { categoryIcon } from './category-icons.js';

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
  // "Mark paid" on a card: the button says it worked, the card leaves, then the screen is told (it saves and redraws).
  root.querySelectorAll('[data-pay-step]').forEach((b) => {
    if (b.dataset.hvWired) return;
    b.dataset.hvWired = '1';
    b.addEventListener('click', () => {
      const card = b.closest('.hv-step');
      saveMorph(b, () => {
        card?.classList.add('gone');
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
  if (!lbl.querySelector('.done')) lbl.insertAdjacentHTML('beforeend', '<span class="done">Saved</span>');
  const nest = btn.querySelector('.nest');
  if (!nest.querySelector(".spin")) nest.insertAdjacentHTML('afterbegin', '<i class="spin"></i>');
  nest.querySelector('svg')?.classList.add('tick');
  btn.classList.add('saving');
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
    holder.innerHTML = round('Cover the amounts', icon('eye'), ` data-hv-act="cover" aria-pressed="${document.documentElement.classList.contains('hv-covered')}"`)
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
    if (act === 'cover') { b.setAttribute('aria-pressed', String(document.documentElement.classList.toggle('hv-covered'))); }
    else if (act === 'theme') {
      setAppearance('colour', document.documentElement.dataset.theme === 'dark' ? 'haven-day' : 'haven-night');
      applyTheme();
      b.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
    } else if (act === 'bell') document.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'inbox' } }));
    else if (act === 'coach') document.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'coach' } }));
  });
  // How many bank messages are waiting to be checked, on the bell.
  const bell = holder.querySelector('[data-hv-act="bell"] .hv-badge');
  if (bell) Promise.resolve(pendingAlerts()).then((list) => { const n = Array.isArray(list) ? list.length : 0; if (n) { bell.textContent = n; bell.hidden = false; } }).catch(() => {});
}

/* Accounts, as the prototype draws it: the accounts as cards you slide through (the middle one forward), "All accounts"
 * with its order control, then the groups, each account on a gem of its kind. Built from the rows the screen has
 * already drawn, so every figure and every button is the screen's own. */
const GEM_OF_TYPE = { bank: [1, 'accounts'], card: [4, 'card'], cash: [3, 'cash'], savings: [6, 'piggy'], loan: [5, 'loan'] };
export function havenAccounts(container) {
  if (!isHaven() || container.querySelector('.hv-cards')) return;
  const rows = [...container.querySelectorAll('.account-row')].filter((r) => !r.classList.contains('account-row--move'));
  const typeOf = (r) => ([...r.classList].find((c) => c.startsWith('account-row--')) || '').replace('account-row--', '');
  // each account on a gem of its kind
  for (const r of rows) {
    const [g, ic] = GEM_OF_TYPE[typeOf(r)] || [1, 'accounts'];
    const mark = r.querySelector('.k-brand');
    if (mark) mark.outerHTML = `<span class="hv-gem hv-g${g}"><span class="hv-ic">${ic === 'piggy' || ic === 'loan' ? categoryIcon(ic) : icon(ic)}</span></span>`;
  }
  const cardOf = (r, i) => {
    const title = r.querySelector('.k-row__title')?.textContent.trim() || '';
    const meta = r.querySelector('.k-row__meta')?.textContent.trim() || '';
    const bal = r.querySelector('.account-balance')?.textContent.trim() || '';
    const [, ic] = GEM_OF_TYPE[typeOf(r)] || [1, 'accounts'];
    return `<div class="hv-card card--${(i % 3) + 1}"><div class="hv-card__top"><span>${escapeText(title)}</span><span class="hv-ic">${ic === 'piggy' || ic === 'loan' ? categoryIcon(ic) : icon(ic)}</span></div><div><div class="hv-card__fig hv-fig hv-amt">${escapeText(bal)}</div><div class="hv-card__sub">${escapeText(meta)}</div></div><div class="hv-card__num"></div></div>`;
  };
  const withBalance = rows.filter((r) => r.querySelector('.account-balance')?.textContent.trim());
  if (!withBalance.length) return;
  const deck = document.createElement('div');
  deck.className = 'hv-accounts-deck';
  deck.innerHTML = `<div class="hv-cards" id="hv-cards">${withBalance.map(cardOf).join('')}</div><div class="hv-dots" id="hv-dots">${withBalance.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>`;
  const sort = container.querySelector('#accounts-sort');
  const sec = document.createElement('div');
  sec.className = 'hv-sec';
  sec.innerHTML = '<h2>All accounts</h2>';
  if (sort) sec.append(sort);
  const chips = document.createElement('div');
  chips.className = 'hv-chips';
  for (const id of ['add-account-btn', 'go-import-btn', 'accounts-reveal', 'accounts-reorder']) {
    const b = container.querySelector(`#${id}`);
    if (b) { b.classList.add('hv-chip'); b.classList.remove('k-btn', 'k-btn--secondary', 'k-btn--ghost'); chips.append(b); }
  }
  container.querySelector('.accounts-actions')?.remove();
  const groups = [...container.querySelectorAll('.account-group-sec')];
  container.prepend(deck, sec, ...groups, chips);
  const cards = deck.querySelector('.hv-cards'), dots = [...deck.querySelectorAll('.hv-dots i')];
  const upd = () => {
    const c = cards.getBoundingClientRect(), mid = c.left + c.width / 2;
    let best = 0, bd = 1e9;
    [...cards.children].forEach((k, i) => {
      const r = k.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid) / r.width;
      k.style.setProperty('--sc', (1 - 0.08 * Math.min(d, 1)).toFixed(3));
      k.style.setProperty('--op', (1 - 0.4 * Math.min(d, 1)).toFixed(3));
      if (d < bd) { bd = d; best = i; }
    });
    dots.forEach((x, i) => x.classList.toggle('on', i === best));
  };
  cards.addEventListener('scroll', upd, { passive: true });
  requestAnimationFrame(upd);
}
const escapeText = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
