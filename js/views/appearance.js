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
import { sixMonthCharts, lastSixMonths } from './transactions.js';
import { showToast } from '../toast.js';

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
    const [f, transactions] = await Promise.all([computeFreeToSpend(), getAll('transactions')]);
    const months = lastSixMonths(transactions);
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
  // Daylight needs no preview pane: choosing it changes the whole app at once,
  // which is a better look at it than any panel could be, and one tap undoes it.
  return '';
}

function usingSample(name) {
  if (name === 'summary') return !state.real;
  if (name === 'history') return !state.months;
  return false;
}

function card(name, spec) {
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
          : `<p class="muted-note look-live">Tap one to see the whole app change. Tap another to put it back.</p>`
      }
    </div>`;
}

function draw(container) {
  container.querySelector('#look-cards').innerHTML = Object.entries(CHOICES)
    .map(([name, spec]) => card(name, spec))
    .join('');
}

function wire(container) {
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
