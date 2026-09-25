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
 */
export function hero({ label, period = '', amount, negative = false, level = 'ok', meter = null, figures = [], status = '', chart = '', extra = '' }) {
  const top = period
    ? `<div class="hero-top"><span class="hero-label">${label}</span><span class="hero-label">${period}</span></div>`
    : `<p class="hero-label">${label}</p>`;
  // The figure is announced as its final value from the first frame: the
  // count-up is only what the eye sees (role="img" with the label means a
  // screen reader reads the label and skips the digits underneath). If the
  // animation never runs, the same digits are already there to read.
  return `<div class="hero level-${level}">
      ${top}
      <p class="hero-amount ${negative ? 'negative' : ''}" role="img" aria-label="${escapeAttr(`${label}: ${amount}`)}"><span aria-hidden="true" data-count="${escapeAttr(amount)}">${amount}</span></p>
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
export function emptyState({ what, why = '', action = null, className = '' }) {
  const button = action
    ? `<button type="button" class="btn-secondary empty-state-btn"${action.id ? ` id="${action.id}"` : ''}${action.go ? ` data-go="${action.go}"` : ''}${
        action.attrs ? ` ${action.attrs}` : ''
      }>${action.label}</button>`
    : '';
  return `<div class="empty-state ${className}">
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

// Keeps the final figure's shape - "₹16,600", "−₹2,15,000" - and puts the
// value of the moment inside it, grouped the Indian way. Exported so a test
// can hold it to that: a figure that loses its minus or its ₹ while it counts
// would be saying something untrue, however briefly.
export function shapeLike(final, value) {
  const grouped = value.toLocaleString('en-IN');
  return final.replace(/[\d,]+/, grouped);
}
