/* How it looks: the person choosing their own app, and seeing it first.
 *
 * The previews are the real components, not drawings of them: the Summary
 * preview is the same spendingHero() that Summary itself renders, handed the
 * same figures, and the History preview is the same six-month charts. So what
 * you look at here cannot drift from what you get, and a preview can never
 * flatter a screen it does not match.
 *
 * They are drawn with your own money where there is any, and with invented
 * figures before there is - clearly said so, because a made-up number that
 * looked like yours would be worse than no preview at all.
 */
import { CHOICES, appearance, setAppearance } from '../appearance.js';
import { computeFreeToSpend } from '../free-to-spend.js';
import { getAll } from '../db.js';
import { spendingHero } from './summary.js';
import { allocationRing } from '../charts.js';
import { sixMonthCharts, lastSixMonths } from './transactions.js';
import { showToast } from '../toast.js';
import { STYLES, COLOURINGS, AUTO, ownColouring } from '../looks.js';
import { CITIES, getPlace, setCity, useMyLocation, sunTimes, moonAt, phaseName } from '../sun-moon.js';

// Enough invented money to draw every option honestly, for someone who has
// not added anything yet. Paise, like everywhere else.
const SAMPLE_MONTHS = [
  { label: 'Apr', in: 5200000, out: 4440000 },
  { label: 'May', in: 5200000, out: 4695000 },
  { label: 'Jun', in: 5200000, out: 4910000 },
  { label: 'Jul', in: 5640000, out: 4520000 },
  { label: 'Aug', in: 5200000, out: 4659000 },
  { label: 'Sep', in: 5200000, out: 4376000 },
];

const SAMPLE_F = {
  free: 824000,
  limit: 2820000,
  perDay: 91500,
  used: 0.708,
  level: 'ok',
  spentThisCycle: 1996000,
  // Three weeks in, spending at a pace that lands just inside the budget:
  // the example a person meets first should look like an ordinary month, not
  // a disaster, or the preview reads as a warning about money that is not
  // theirs.
  spendDays: [95000, 190000, 286000, 380000, 475000, 571000, 666000, 761000, 856000, 951000,
              1046000, 1141000, 1236000, 1331000, 1426000, 1521000, 1616000, 1711000, 1806000,
              1901000, 1996000],
  daysIntoCycle: 21,
  daysToClose: 9,
  bankShortfall: 0,
  cycleStart: '2026-09-01',
  cycleKey: '2026-09-30',
};

let state = { real: null, months: null, sample: false };

export async function render(container) {
  container.innerHTML = `
    <p class="group-subtitle">Your choices, kept on this device. None of this changes your money, and none of it leaves the phone.</p>
    <div id="look-cards"></div>`;
  await loadData();
  draw(container);
  wire(container);
}

/* The same figures the real screens use. If the money is not set up yet there
 * is nothing to draw, so the previews fall back to invented figures and say
 * so on screen.
 */
async function loadData() {
  try {
    const [f, transactions, accounts] = await Promise.all([computeFreeToSpend(), getAll('transactions'), getAll('accounts')]);
    const months = lastSixMonths(transactions, accounts);
    const usable = f && f.monthlyIncome && f.salary && f.salary.setUp && f.limit > 0;
    state = {
      real: usable ? f : null,
      months: months && months.some((m) => m.in || m.out) ? months : null,
      sample: !usable,
    };
  } catch {
    state = { real: null, months: null, sample: true };
  }
}

function previewFor(name, value) {
  if (name === 'summary') {
    const f = state.real || SAMPLE_F;
    return `<div class="look-preview-inner">${spendingHero(f, value)}</div>`;
  }
  if (name === 'history') {
    const months = state.months || SAMPLE_MONTHS;
    return `<div class="look-preview-inner">${sixMonthCharts(months, value)}</div>`;
  }
  if (name === 'accounts') {
    // Two invented accounts, because the real ones are a scroll away on their
    // own screen and the question here is only how they are presented.
    const slices = [
      { label: 'Salary account', amount: 11884000 },
      { label: 'Cash', amount: 1500000 },
    ];
    const covered = value === 'private';
    const rows = slices
      .map(
        (s) => `<div class="k-row"><span class="k-row__body"><span class="k-row__title">${s.label}</span></span>
          <span class="k-row__value">${covered ? '<span class="amount-covered">••••</span>' : '₹' + (s.amount / 100).toLocaleString('en-IN')}</span></div>`
      )
      .join('');
    const ring = value === 'ring' ? allocationRing({ slices, centre: '', caption: '' }) : '';
    return `<div class="look-preview-inner">${ring}${rows}</div>`;
  }
  if (name === 'plan') {
    // Three invented fixed costs, chosen so that all three orders come out
    // different: the biggest is the latest, the earliest is the smallest, and
    // the arranged order matches neither. An example where two options looked
    // identical would say nothing about the difference between them.
    const items = [
      { label: 'Car EMI', amount: 890000, day: 12, arranged: 1 },
      { label: 'Rent', amount: 1200000, day: 25, arranged: 2 },
      { label: 'Phone bill', amount: 49900, day: 2, arranged: 3 },
    ];
    const order =
      value === 'name'
        ? (a, b) => a.label.localeCompare(b.label)
        : value === 'day'
        ? (a, b) => a.day - b.day
        : value === 'size'
          ? (a, b) => b.amount - a.amount
          : (a, b) => a.arranged - b.arranged;
    const rows = [...items].sort(order).map(
      (i) => `<div class="k-row"><span class="k-row__body"><span class="k-row__title">${i.label}</span>
        <span class="k-row__meta">Due ${i.day}${i.day === 1 ? 'st' : i.day === 2 ? 'nd' : i.day === 3 ? 'rd' : 'th'}</span></span>
        <span class="k-row__value">₹${(i.amount / 100).toLocaleString('en-IN')}</span></div>`
    ).join('');
    return `<div class="look-preview-inner">${rows}</div>`;
  }
  // Daylight and the opening screen need no preview pane. Choosing a daylight
  // changes the whole app at once, which is a better look at it than a panel,
  // and the opening screen is a screen the person already knows.
  return '';
}

function usingSample(name) {
  if (name === 'summary') return !state.real;
  if (name === 'history') return !state.months;
  if (name === 'accounts' || name === 'plan') return true;
  return false;
}

/* Style and colours, the first card: the styles as a row (Charts now, the
 * others as they are built), the colourings as swatches. Each swatch is still
 * a radio, so choosing one saves and repaints like every other choice here. */
function lookCard(spec) {
  const current = appearance('colour');
  const style = appearance('style');
  const dots = (c) => c.dots.map((d) => `<i style="background:${d}"></i>`).join('');
  const auto = COLOURINGS.find((c) => c.id === ownColouring(style));
  // Haven follows the phone into its own day, the others into burning flame light.
  const autoLight = COLOURINGS.find((c) => c.id === (style === 'haven' ? 'haven-day' : AUTO.light));
  const tile = (value, name, sub, swatch) => `
        <label class="look-option look-swatch${value === current ? ' chosen' : ''}">
          <input type="radio" name="look-colour" value="${value}"${value === current ? ' checked' : ''}>
          <span class="look-dots">${swatch}</span>
          <span class="look-label">${name}</span>
          <span class="muted-note">${sub}</span>
        </label>`;
  return `
    <h3>Style</h3>
    <div class="totals-card look-card look-styles">
      ${STYLES.map((s) =>
        s.ready
          ? `<label class="look-option look-style${s.id === style ? ' chosen' : ''}"><input type="radio" name="look-style" value="${s.id}"${s.id === style ? ' checked' : ''}>${s.name}</label>`
          : `<span class="look-style soon">${s.name}<small>coming</small></span>`
      ).join('')}
    </div>
    <h3>${spec.label}</h3>
    <div class="totals-card look-card">
      <div class="look-swatches">
        ${tile('sun', 'Follow the sun', 'Day by day, night by night', ['#f5f8fc', '#070c19', '#ffb547', '#38c9dc'].map((d) => `<i style="background:${d}"></i>`).join(''))}
        ${tile('auto', 'Follow my phone', style === 'haven' ? 'Haven day or night' : 'Style colours or flame', [auto.bg, auto.dots[1], autoLight.bg, autoLight.dots[1]].map((d) => `<i style="background:${d}"></i>`).join(''))}
        ${COLOURINGS.map((c) => tile(c.id, c.name, c.mode === 'light' ? 'Light' : 'Dark', dots(c))).join('')}
      </div>
      <p class="muted-note look-live">Tap one to see the whole app change.</p>
    </div>`;
}

/* Where you are: only so the sun and moon can be put where they really are. A city from the list, or one tap on the phone's own location;
 * either is kept on this device and nothing is sent. */
const clock = (ms) => (ms == null ? 'not today' : new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
function whereLine() {
  const now = Date.now(), p = getPlace(), s = sunTimes(now - 3 * 3600e3, p), m = moonAt(now, p.lat, p.lon);
  return `Sunrise ${clock(s.rise)}, sunset ${clock(s.set)}. The moon is ${phaseName(m.phase).toLowerCase()}, ${Math.round(m.fraction * 100)}% lit.`;
}
function whereCard() {
  const p = getPlace();
  return `
    <h3>Where you are</h3>
    <div class="totals-card look-card" id="where-card">
      <p class="group-subtitle look-q">Puts the sun and moon where they really are. Stays on this phone.</p>
      <label class="field"><span>City</span>
        <select id="where-city" class="k-select">
          ${p.device ? '<option value="" selected>My location</option>' : ''}
          ${Object.keys(CITIES).map((c) => `<option value="${c}"${!p.device && c === p.name ? ' selected' : ''}>${c}</option>`).join('')}
        </select></label>
      <button type="button" class="btn-secondary btn-block" id="where-device">Use my location</button>
      <p class="muted-note look-live" id="where-line" role="status">${whereLine()}</p>
    </div>`;
}

function card(name, spec) {
  if (name === 'colour') return lookCard(spec);
  // The style is chosen in the same card as the colours, above them.
  if (name === 'style') return '';
  const current = appearance(name);
  const preview = previewFor(name, current);
  return `
    <h3>${spec.label}</h3>
    <div class="totals-card look-card">
      <p class="group-subtitle look-q">${spec.question}</p>
      ${spec.options
        .map(
          (o) => `
        <label class="look-option${o.value === current ? ' chosen' : ''}">
          <input type="radio" name="look-${name}" value="${o.value}"${o.value === current ? ' checked' : ''}>
          <span class="look-body">
            <span class="look-label">${o.label}</span>
            <span class="muted-note">${o.note}</span>
          </span>
        </label>`
        )
        .join('')}
      ${
        preview
          ? `<div class="look-preview" data-preview="${name}">
               <span class="look-preview-tag">${usingSample(name) ? 'Example figures' : 'Your money'}</span>
               ${preview}
             </div>`
          : `<p class="muted-note look-live">${
              name === 'colour' || name === 'text' || name === 'density' || name === 'motion' || name === 'liquid'
                ? 'Tap one to see the whole app change. Tap another to put it back.'
                : spec.where
                  ? `Open ${spec.where} to see it.`
                  : 'Takes effect the next time Kawach opens.'
            }</p>`
      }
    </div>`;
}

function draw(container) {
  // Motion is Haven's own (the other looks keep the motion they have).
  container.querySelector('#look-cards').innerHTML = Object.entries(CHOICES)
    .filter(([name]) => !['motion', 'liquid', 'festivals'].includes(name) || appearance('style') === 'haven')
    .map(([name, spec]) => card(name, spec) + (name === 'colour' && appearance('style') === 'haven' ? whereCard() : ''))
    .join('');
}

function wire(container) {
  const line = () => container.querySelector('#where-line');
  container.addEventListener('change', (e) => {
    if (e.target.id !== 'where-city' || !e.target.value) return;
    setCity(e.target.value);
    line().textContent = whereLine();
  });
  container.addEventListener('click', async (e) => {
    if (!e.target.closest('#where-device')) return;
    const l = line();
    l.textContent = 'Asking your phone…';
    try {
      await useMyLocation();
      const sel = container.querySelector('#where-city');
      if (sel && !sel.querySelector('option[value=""]')) sel.insertAdjacentHTML('afterbegin', '<option value="">My location</option>');
      if (sel) sel.value = '';
      l.textContent = whereLine();
    } catch (err) {
      l.textContent = err.message;
    }
  });
  container.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    const name = input.name.replace(/^look-/, '');
    if (!setAppearance(name, input.value)) {
      showToast('Could not save that on this device');
      return;
    }
    // Only this card is redrawn, never the screen: a full redraw would scroll
    // the person away from the choice they just made.
    container.querySelectorAll(`input[name="${input.name}"]`).forEach((other) => {
      other.closest('.look-option').classList.toggle('chosen', other === input);
    });
    const stage = container.querySelector(`[data-preview="${name}"]`);
    if (stage) {
      const tag = stage.querySelector('.look-preview-tag').outerHTML;
      stage.innerHTML = tag + previewFor(name, input.value);
    }
  });
}
