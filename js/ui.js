/* The parts every screen is built from: design.md section 11, the block
 * catalogue. A screen takes what it needs from here instead of inventing a
 * layout of its own, and anything new gets added to design.md first.
 *
 * Every function returns a string of HTML, which is how the rest of the app
 * already draws. Nothing here touches the database or the page.
 */

/* Anything a person typed - an account name, a shop's name off a statement -
 * is escaped before it goes near HTML. This used to be copied into thirteen
 * files; it lives here now so there is one copy to be right.
 */
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

export function escapeAttr(str) {
  return escapeHtml(str);
}

/* --- 01 Money hero ----------------------------------------------------
 * The one number a screen exists to answer. One per screen.
 *   label   what the number is
 *   period  the span it covers, in words ("1 to 30 Sep")
 *   amount  the figure, already formatted
 *   level   ok | warning | critical | over | unknown - the colour and tone
 *   meter   { pct, tone } the bar under the figure
 *   figures [{ label, value }] the two supporting figures
 *   status  one line saying whether this is good or bad
 *   chart   one drawing from js/charts.js (design.md section 9)
 *   extra   anything the screen adds under the status (a fold, a note)
 *   ring    { spent, days, of } the Summary's ring, in place of a meter:
 *           a thick arc for the share of the budget spent, a thin one for
 *           the share of the month gone, the figure in the middle. When the
 *           thick arc runs ahead of the thin one, spending is ahead of the
 *           month. Both are fractions; spent may pass 1.
 */
let ringsDrawn = 0;
export function hero({ label, period = '', amount, negative = false, level = 'ok', meter = null, figures = [], status = '', chart = '', extra = '', ring = null, tracking = null }) {
  const top = period
    ? `<div class="hero-top"><span class="hero-label">${label}</span><span class="hero-label">${period}</span></div>`
    : `<p class="hero-label">${label}</p>`;
  // The figure is announced as its final value from the first frame: the
  // count-up is only what the eye sees (role="img" with the label means a
  // screen reader reads the label and skips the digits underneath). If the
  // animation never runs, the same digits are already there to read.
  const figure = `<p class="hero-amount ${negative ? 'negative' : ''}${ring && amount.length > 8 ? ' hero-amount--long' : ''}" role="img" aria-label="${escapeAttr(`${label}: ${amount}`)}"><span aria-hidden="true" data-count="${escapeAttr(amount)}">${amount}</span></p>`;
  // NEW (5.0, the Charts style): the tracking card. The figure, three figures
  // in a row under it, and up to three gradient rings - each a share of
  // something, said in its middle. The first ring's colour is about the
  // budget alone, amber from 75% and red from 90%, as the ring before it was.
  if (tracking) {
    // Each drawing numbers its gradients, so two cards on one page (or an old
    // and a new one mid-redraw) never share an id.
    const drawn = ++ringsDrawn;
    const clamp = (v) => Math.max(0, Math.min(1, v || 0));
    const rings = tracking.rings
      .map((r, i) => {
        const v = clamp(r.value);
        // Only Summary's budget ring warns; Plan's rings are shares, not limits.
        const tone = i === 0 && tracking.warn !== false ? (r.value >= 0.9 ? ' tracking-ring--over' : r.value >= 0.75 ? ' tracking-ring--warn' : '') : '';
        return `<figure class="tracking-ring tracking-ring--${r.grad}${tone}">
          <svg viewBox="0 0 110 110" aria-hidden="true" focusable="false">
            <defs><linearGradient id="tg-${r.grad}-${drawn}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--tg-a)"/><stop offset="1" style="stop-color:var(--tg-b)"/></linearGradient></defs>
            <circle class="tracking-ring__track" cx="55" cy="55" r="42"/>
            ${v > 0.004 ? `<circle class="tracking-ring__arc" style="stroke:url(#tg-${r.grad}-${drawn})" cx="55" cy="55" r="42" pathLength="100" stroke-dasharray="${(v * 100).toFixed(1)} 100" transform="rotate(-90 55 55)"/>` : ''}
          </svg>
          <figcaption><b${r.big != null ? ' class="is-amount"' : ''}>${r.big != null ? r.big : `${Math.round(Math.max(0, r.value || 0) * 100)}%`}</b><small>${r.label}</small></figcaption>
        </figure>`;
      })
      .join('');
    return `<div class="hero hero--tracking level-${level}">
      ${top}
      <div class="tracking-fig">${figure}${tracking.under ? `<span class="tracking-under">${tracking.under}</span>` : ''}</div>
      <div class="tracking-stats">${tracking.stats.map((st) => `<div><small>${st.k}</small><b>${st.v}</b></div>`).join('')}</div>
      <div class="tracking-rings">${rings}</div>
      ${status ? `<p class="hero-status level-${level}">${status}</p>` : ''}
      ${extra}
    </div>`;
  }
  if (ring) {
    const pct = (v) => (Math.max(0, Math.min(1, v || 0)) * 100).toFixed(1);
    // A zero-length dash with round ends is still drawn as a dot, so an arc
    // with nothing in it is left out rather than drawn empty.
    const arc = (cls, r, v) => (v > 0.004 ? `<circle class="${cls}" cx="100" cy="100" r="${r}" pathLength="100" stroke-dasharray="${pct(v)} 100" transform="rotate(-90 100 100)"/>` : '');
    // The arc's colour is about the budget alone: amber from 75% spent, red
    // from 90%. The level can be red for another reason (the bank short after
    // bills), which the status line says; the arc must not claim it.
    const tone = ring.spent >= 0.9 ? ' hero-ring--over' : ring.spent >= 0.75 ? ' hero-ring--warn' : '';
    return `<div class="hero hero--ring level-${level}${tone}">
      ${top}
      <div class="hero-ring">
        <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <circle class="hero-ring__track" cx="100" cy="100" r="88"/>
          ${arc('hero-ring__spent', 88, ring.spent)}
          <circle class="hero-ring__track hero-ring__track--days" cx="100" cy="100" r="70"/>
          ${arc('hero-ring__days', 70, ring.days)}
        </svg>
        <div class="hero-ring__mid">${figure}${ring.of ? `<p class="hero-ring__of">${ring.of}</p>` : ''}</div>
      </div>
      ${status ? `<p class="hero-status level-${level}">${status}</p>` : ''}
      <p class="hero-ring__key"><span class="hero-ring__key-spent">Spent</span><span class="hero-ring__key-days">Month gone</span></p>
      ${extra}
    </div>`;
  }
  return `<div class="hero level-${level}">
      ${top}
      ${figure}
      ${meter ? `<div class="hero-meter"><div class="hero-meter-fill ${meter.tone || ''}" style="width:${meter.pct}%"></div></div>` : ''}
      ${chart}
      ${figures.length ? `<div class="hero-figures">${figures.map((f) => `<span><span class="muted">${f.label}</span> ${f.value}</span>`).join('')}</div>` : ''}
      ${status ? `<p class="hero-status level-${level}">${status}</p>` : ''}
      ${extra}
    </div>`;
}

/* --- 02 Panel ---------------------------------------------------------
 * A named group of figures or rows. The row group (design.md block 03) is the
 * same box with rows inside it, and the screens that have one - commitments,
 * accounts, the import check table - each carry their own row markup along
 * with its taps and its open state, so there is no shared row() helper: a
 * common one would have to grow every one of those behaviours back.
 */
export function panel(body, { className = '', id = '' } = {}) {
  return `<div class="totals-card ${className}"${id ? ` id="${id}"` : ''}>${body}</div>`;
}

/* --- Small parts ------------------------------------------------------ */

/* The colour a figure is written in. Money out is red, money in is green,
 * and zero is neither: a loan paid off, a card not used yet and a month with
 * no spending are not bad news, and painting their nought red says they are
 * (design.md section 3, colour carries meaning).
 */
export function moneyTone(amount) {
  if (amount > 0) return 'out';
  if (amount < 0) return 'in';
  return '';
}

/* A pill: a count, a state, a tag. `kind` is ok | warn | over, or nothing
 * for a plain one - the same three the app has always used.
 */
export function pill(text, kind = '') {
  return `<span class="pill ${kind}">${text}</span>`;
}

/* The heading above a group. Sentence case, no eyebrow labels, and an
 * optional link on the right ("History ›").
 */
export function sectionHead(title, action = '') {
  return `<div class="section-head"><h3>${title}</h3>${action}</div>`;
}

/* --- 20 Empty state ---------------------------------------------------
 * What happened, why it matters, what to do. One action, never two
 * (design.md section 12). For a list that is simply empty and needs no
 * action, the one muted line of `.empty` is still right.
 */
/* Kawach's own drawings, for the screens with nothing on them yet. Original
 * artwork in icons/art/, drawn in currentColor so each takes the ink of
 * whatever it sits in. `art: false` turns it off where a picture would be
 * noise rather than welcome.
 */
const ART = {
  empty: './icons/art/empty-wallet.svg',
  error: './icons/art/something-broke.svg',
  done: './icons/art/all-clear.svg',
};

export function emptyState({ what, why = '', action = null, className = '', art = 'empty' }) {
  const button = action
    ? `<button type="button" class="btn-secondary empty-state-btn"${action.id ? ` id="${action.id}"` : ''}${action.go ? ` data-go="${action.go}"` : ''}${
        action.attrs ? ` ${action.attrs}` : ''
      }>${action.label}</button>`
    : '';
  const picture = art && ART[art] ? `<img class="empty-state-art" src="${ART[art]}" alt="" width="76" height="76" loading="lazy">` : '';
  return `<div class="empty-state ${className}">
      ${picture}
      <p class="empty-state-what">${what}</p>
      ${why ? `<p class="empty-state-why">${why}</p>` : ''}
      ${button}
    </div>`;
}

/* --- The hero figure arriving (design.md section 10) ------------------
 * It counts up once, when a screen arrives, and nothing else moves until it
 * has landed. 600ms, the same ease-out curve the rest of the app uses, no
 * bounce, no repeat. Only the digits move: the rupee sign, the commas and the
 * minus stay where they are, so the figure never jumps about as it counts.
 *
 * Anyone whose phone asks for less motion gets the final figure at once.
 */
const COUNT_MS = 600;

export function countUpHeroes(root = document) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // A screen built while the tab is in the background has no frames to count
  // in - the browser stops them - so the figure simply stands at its value.
  if (document.hidden) return;
  // Anything else that arrives with the screen (the Summary's ring, rows
  // rising into place) plays under this class, once, and then sits still.
  // A screen that only redraws itself never gets it, so nothing replays.
  if (root.classList) {
    root.classList.add('is-arriving');
    setTimeout(() => root.classList.remove('is-arriving'), 1600);
  }
  for (const el of root.querySelectorAll('.hero-amount [data-count]')) {
    const final = el.dataset.count;
    const digits = final.replace(/[^\d]/g, '');
    // Nothing to count: a dash, or a figure too long to be read as it moves.
    if (!digits || digits.length > 9) continue;
    const target = Number(digits);
    if (!target) continue;
    const start = performance.now();
    const paint = (now) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      // The same curve as --ease-out: fast, then settling.
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = t >= 1 ? final : shapeLike(final, Math.round(target * eased));
      if (t < 1) requestAnimationFrame(paint);
    };
    el.textContent = shapeLike(final, 0);
    requestAnimationFrame(paint);
    // Whatever happens to the frames - the phone sleeps, the tab is hidden
    // mid-count - the real figure is on screen a moment later. A number that
    // sticks at zero would be a lie about someone's money.
    setTimeout(() => {
      if (el.textContent !== final) el.textContent = final;
    }, COUNT_MS + 400);
  }
}

/* A figure that changes while you are away rolls from what it was to what it is (5.36): save a
 * payment, come back to Summary, and Left to spend runs down by what it cost. Only a figure that
 * was shown before in this session and has moved; the first sight of it stands still. A rolling
 * figure carries data-roll (the value in paise) and data-roll-key (what it is a figure of, so one
 * month never rolls into another). The real figure is always on screen a moment later. */
const ROLL_MS = 700;
const lastFigure = new Map();

export function rollFigures(root = document) {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const el of root.querySelectorAll('[data-roll]')) {
    const key = el.dataset.rollKey || 'figure';
    const to = Number(el.dataset.roll);
    const from = lastFigure.get(key);
    lastFigure.set(key, to);
    if (reduced || document.hidden || from == null || from === to || (from < 0) !== (to < 0)) continue;
    const final = el.textContent;
    const a = Math.abs(from) / 100;
    const b = Math.abs(to) / 100;
    const start = performance.now();
    // A dial draws the same money: its marks and needle follow the figure frame by frame, on the
    // same curve, so what is written and what is drawn never disagree while it moves.
    const dial = el.closest('svg.in-dial');
    const place = dial ? (left) => dialAt(dial, left) : () => {};
    dial?.classList.add('is-rolling');
    el.textContent = shapeLike(final, Math.round(a));
    place(from);
    const paint = (now) => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = t >= 1 ? final : shapeLike(final, Math.round(a + (b - a) * eased));
      place(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(paint);
      else dial?.classList.remove('is-rolling');
    };
    requestAnimationFrame(paint);
    setTimeout(() => {
      if (el.textContent !== final) el.textContent = final;
      place(to);
      dial?.classList.remove('is-rolling');
    }, ROLL_MS + 400);
  }
}

/* The Instrument dial for a given amount left (paise): marks lit up to what is spent, red past the
 * even pace, the needle turned to match. The needle is drawn at its final place; here it is
 * turned by how far the figure still is from it. Read from the dial's own data-limit, data-pace
 * and data-spent, so the picture is always the one drawn by instrumentDial. */
export function dialAt(dial, left) {
  const limit = Number(dial.dataset.limit);
  if (!(limit > 0)) return;
  const frac = (spent) => Math.min(1, Math.max(0, spent / limit));
  const fs = frac(limit - left);
  const fp = dial.dataset.pace === '' || dial.dataset.pace == null ? 1 : frac(Number(dial.dataset.pace));
  const marks = dial.querySelectorAll('.in-dial__m');
  const last = marks.length - 1;
  marks.forEach((m, i) => {
    const f = i / last;
    const state = f <= fs + 1e-9 ? (f <= fp + 1e-9 ? 'on' : 'ahead') : 'off';
    m.setAttribute('class', `in-dial__m in-dial__m--${state}${m.classList.contains('is-major') ? ' is-major' : ''}`);
  });
  const needle = dial.querySelector('.in-dial__needle');
  if (needle) {
    needle.style.transformOrigin = '163px 148px';
    needle.style.transform = `rotate(${(fs - frac(Number(dial.dataset.spent))) * 240}deg)`;
  }
}

// Keeps the final figure's shape - "₹16,600", "−₹2,15,000" - and puts the
// value of the moment inside it, grouped the Indian way. Exported so a test
// can hold it to that: a figure that loses its minus or its ₹ while it counts
// would be saying something untrue, however briefly.
export function shapeLike(final, value) {
  const grouped = value.toLocaleString('en-IN');
  return final.replace(/[\d,]+/, grouped);
}
