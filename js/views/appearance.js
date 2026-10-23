/* How it looks: the few things a person may choose that help them read, save battery or say where they are. Choosing one saves and repaints
 * the whole app at once, which is a better look at it than a preview panel (the layout previews went with the layouts in 5.90, their code
 * in 5.92). Five things in one card, 5.93: where you are, text size, motion, the screen Kawach opens on, and the order of lists folded away.
 * The colours are chosen with the half-moon button at the top of Summary (Follow the sun, Always day, Always night), so they are not here.
 */
import { CHOICES, appearance, setAppearance } from '../appearance.js';
import { showToast } from '../toast.js';
import { CITIES, getPlace, setCity, useMyLocation, sunTimes, moonAt } from '../sun-moon.js';

// One short line under Motion for the choice made; the long notes in js/appearance.js are not shown here.
const MOTION_NOTE = { alive: 'The water breathes and the sky follows the hour.', calm: 'Only what answers a touch moves.', still: 'Nothing moves.' };
// The three orders are pick-lists: their option names ("The order you arranged") are too long for a row of three buttons.
const ORDERS = [['plan', 'Fixed costs on Plan'], ['accountOrder', 'Accounts'], ['categoryOrder', 'Categories']];

export async function render(container) {
  container.innerHTML = '<div id="look-cards"></div>';
  draw(container);
  wire(container);
}

/* Where you are: only so the sun and moon can be put where they really are. A city from the list, or one tap on the phone's own location;
 * either is kept on this device and nothing is sent. */
const clock = (ms) => (ms == null ? 'not today' : new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
function whereLine() {
  const now = Date.now(), p = getPlace(), s = sunTimes(now - 3 * 3600e3, p), m = moonAt(now, p.lat, p.lon);
  return `Sunrise ${clock(s.rise)} · sunset ${clock(s.set)} · moon ${Math.round(m.fraction * 100)}% lit`;
}
function whereGroup() {
  const p = getPlace();
  return `
    <div class="hl-group" id="where-card">
      <div class="hl-label">Where you are</div>
      <div class="hl-where">
        <select id="where-city" class="k-select" aria-label="City">
          ${p.device ? '<option value="" selected>My location</option>' : ''}
          ${Object.keys(CITIES).map((c) => `<option value="${c}"${!p.device && c === p.name ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
        <button type="button" class="hl-btn" id="where-device">Use my location</button>
      </div>
      <p class="hl-note" id="where-line" role="status">${whereLine()}</p>
    </div>`;
}

// A row of buttons, one lit: a radio group underneath, so the keyboard and the screen reader get the real thing.
function segGroup(name) {
  const spec = CHOICES[name], current = appearance(name);
  return `
    <div class="hl-group" role="radiogroup" aria-label="${spec.label}">
      <div class="hl-label">${spec.label}</div>
      <div class="hl-seg">${spec.options.map((o) => `<label class="hl-opt"><input type="radio" name="look-${name}" value="${o.value}"${o.value === current ? ' checked' : ''}><span>${o.label}</span></label>`).join('')}</div>
      ${name === 'motion' ? `<p class="hl-note" id="motion-note">${MOTION_NOTE[current] || ''}</p>` : ''}
    </div>`;
}

function orderGroup([name, label]) {
  const current = appearance(name);
  return `
    <label class="hl-group hl-order">
      <span class="hl-label">${label}</span>
      <select class="k-select hl-pick" data-look="${name}">${CHOICES[name].options.map((o) => `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${o.label}</option>`).join('')}</select>
    </label>`;
}

function draw(container) {
  container.querySelector('#look-cards').innerHTML = `
    <div class="hl-card">${whereGroup()}${segGroup('text')}${segGroup('motion')}${segGroup('opening')}</div>
    <details class="hl-fold"><summary>Order of lists</summary><div class="hl-card hl-card--in">${ORDERS.map(orderGroup).join('')}</div></details>`;
}

function wire(container) {
  const line = () => container.querySelector('#where-line');
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
    const t = e.target;
    if (t.id === 'where-city') {
      if (!t.value) return;
      setCity(t.value);
      line().textContent = whereLine();
      return;
    }
    // A radio of the rows of buttons, or one of the three order lists: saved at once, and the screen is not redrawn (that would scroll the
    // person away from the choice they just made).
    const name = t.matches('input[type="radio"]') ? t.name.replace(/^look-/, '') : t.dataset.look;
    if (!name) return;
    if (!setAppearance(name, t.value)) {
      showToast('Could not save that on this device');
      return;
    }
    if (name === 'motion') container.querySelector('#motion-note').textContent = MOTION_NOTE[t.value] || '';
  });
}
