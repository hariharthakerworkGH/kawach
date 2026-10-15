/* "Try the motion" (Settings, How it looks): every motion the owner chose, where it lives, how to see it, and a Play button for
 * the ones that wait for a particular day or event (a salary, a new month, a Sunday). The list is js/motion-inventory.js.
 * Play goes to the screen the moment needs, waits for it to be drawn, and plays it once. */
import { INVENTORY, LAB_NAMES } from './motion-inventory.js';
import { demo } from './haven-motion.js';
import { demoLife } from './haven-life.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ui.js';

const PLAYERS = {
  drop: (v) => demo.drop(v), closed: (v) => demo.closed(v), salary: (v) => demo.salary(v), refill: (v) => demo.refill(v),
  festival: (v) => demo.festival(v, 'Diwali'), evening: (v) => demo.evening(v), dot: () => demo.dot(), streak: (v) => demo.streak(v),
  tilt: () => demo.tilt(), peek: () => demo.peek(), undo: async () => { if ((await demo.undo()) === false) showToast('Nothing typed in within the last hour to undo'); },
  recap: (v) => demoLife.recap(v), story: (v) => demoLife.story(v), badge: (v) => demoLife.badge(v), weather: (v) => demoLife.weather(v),
  sleep: (v) => demoLife.sleep(v), rewind: (v) => demoLife.rewind(v), tremble: () => demoLife.tremble(),
};
const STATE = { in: ['In the app', 'in'], soon: ['Chosen, not built yet', 'soon'], skipped: ['You skipped it', 'skipped'], removed: ['Taken out', 'skipped'] };

export function motionGuideHtml() {
  const labs = [1, 2, 3, 4];
  return `<h3>Try the motion</h3>
    <div class="totals-card look-card hv-guide">
      <p class="group-subtitle look-q">Every motion you chose in the labs, where to find it, and a Play for the ones that wait for a day.</p>
      ${labs.map((lab) => {
        const items = INVENTORY.filter((i) => i.lab === lab);
        const built = items.filter((i) => i.state === 'in').length;
        return `<details class="hv-guide__lab"${lab === 3 ? ' open' : ''}><summary><b>${escapeHtml(LAB_NAMES[lab])}</b> <span class="muted-note">${built} in the app</span></summary>
          ${items.map((i) => {
            const [label, cls] = STATE[i.state];
            return `<div class="hv-guide__row hv-guide__row--${cls}"><div><b>${escapeHtml(i.name)}</b> <span class="hv-guide__tag">${label}</span>${i.where ? `<div class="muted-note">Where: ${escapeHtml(i.where)}</div><div class="muted-note">${escapeHtml(i.how)}</div>` : i.how ? `<div class="muted-note">${escapeHtml(i.how)}</div>` : ''}</div>${i.demo ? `<button type="button" class="k-btn k-btn--secondary" data-play="${i.demo}" data-view="${i.view}">Play</button>` : ''}</div>`;
          }).join('')}
        </details>`;
      }).join('')}
    </div>`;
}

const waitFor = (test, ms = 5000) => new Promise((resolve) => {
  const t0 = performance.now();
  const tick = () => { const r = test(); if (r) resolve(r); else if (performance.now() - t0 > ms) resolve(null); else setTimeout(tick, 120); };
  tick();
});

export function wireMotionGuide(container) {
  container.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-play]');
    if (!b) return;
    const player = PLAYERS[b.dataset.play];
    if (!player) return;
    b.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: b.dataset.view || 'summary' } }));
    // Plan's moments need a Plan row; the rest need the shield. Either way the screen has to be drawn first.
    const vault = await waitFor(() => document.querySelector('[data-hv-summary] .hv-vault'));
    if (b.dataset.view === 'plan') { await new Promise((r) => setTimeout(r, 1400)); player(); return; }
    if (!vault) { showToast('That needs the Summary screen to be set up first'); return; }
    await new Promise((r) => setTimeout(r, 900));
    player(vault);
  });
}
