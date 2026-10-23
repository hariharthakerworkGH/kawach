/* How it looks: the few things a person may choose that help them read, save battery or say where they are. Choosing one saves and repaints
 * the whole app at once, which is a better look at it than a preview panel (the layout previews went with the layouts in 5.90, and
 * their code in 5.92). */
import { CHOICES, appearance, setAppearance } from '../appearance.js';
import { showToast } from '../toast.js';
import { CITIES, getPlace, setCity, useMyLocation, sunTimes, moonAt, phaseName } from '../sun-moon.js';

export async function render(container) {
  container.innerHTML = `
    <p class="group-subtitle">Your choices, kept on this device. None of this changes your money, and none of it leaves the phone.</p>
    <div id="look-cards"></div>`;
  draw(container);
  wire(container);
}

/* Colours, the first card: Follow the sun, Always day, Always night. Each is a radio, so choosing one saves and repaints the whole app. */
function lookCard(spec) {
  const current = appearance('colour');
  const tile = (value, name, sub, dots) => `
        <label class="look-option look-swatch${value === current ? ' chosen' : ''}">
          <input type="radio" name="look-colour" value="${value}"${value === current ? ' checked' : ''}>
          <span class="look-dots">${dots.map((d) => `<i style="background:${d}"></i>`).join('')}</span>
          <span class="look-label">${name}</span>
          <span class="muted-note">${sub}</span>
        </label>`;
  return `
    <h3>${spec.label}</h3>
    <div class="totals-card look-card">
      <div class="look-swatches">
        ${tile('sun', 'Follow the sun', 'Day by day, night by night', ['#f5f8fc', '#070c19', '#ffb547', '#38c9dc'])}
        ${tile('haven-day', 'Always day', 'Light', ['#ffffff', '#11234f', '#145ec1', '#0c7a52'])}
        ${tile('haven-night', 'Always night', 'Dark', ['#10192d', '#1161bb', '#38c9dc', '#5ed99e'])}
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
  const current = appearance(name);
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
      <p class="muted-note look-live">${
        name === 'colour' || name === 'text' || name === 'density' || name === 'motion' || name === 'liquid'
          ? 'Tap one to see the whole app change. Tap another to put it back.'
          : spec.where
            ? `Open ${spec.where} to see it.`
            : 'Takes effect the next time Kawach opens.'
      }</p>
    </div>`;
}

// What is left to choose (5.90): colours, where you are, text size, motion, the opening screen, and the order of lists folded away. The layouts and
// the other looks are gone: everyone gets the one the app was designed around.
const SHOWN = ['colour', 'text', 'motion', 'opening'];
const ORDERS = ['plan', 'accountOrder', 'categoryOrder'];
function draw(container) {
  const cards = SHOWN.map((name) => card(name, CHOICES[name]) + (name === 'colour' ? whereCard() : '')).join('');
  const orders = ORDERS.map((name) => card(name, CHOICES[name])).join('');
  container.querySelector('#look-cards').innerHTML = `${cards}<details class="section-fold look-fold"><summary>Order of lists</summary>${orders}</details>`;
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
  });
}
