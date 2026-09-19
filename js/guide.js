// A short walk-through on the real screens: each step opens a screen, lights
// up one thing on it, and says in one line what it is for. "Next" moves on,
// "Skip" ends it. Used by "Show me" in What's new (js/whats-new.js).
//
// A step is { view, target, text }: the screen to open (as app.js names
// them), a CSS selector for the thing to point at (the first that exists of
// a comma-separated list), and the tip. A step whose thing isn't on screen
// is passed over rather than pointing at nothing.

let active = null;

export async function runGuide(steps) {
  if (active) active.end();
  let i = 0;

  const layer = document.createElement('div');
  layer.className = 'guide-layer';
  layer.innerHTML = `
    <div class="guide-ring" aria-hidden="true"></div>
    <div class="guide-tip" role="dialog" aria-live="polite">
      <p class="guide-text"></p>
      <div class="guide-foot">
        <span class="guide-count"></span>
        <span class="guide-buttons">
          <button type="button" class="btn-tiny guide-skip">Skip</button>
          <button type="button" class="btn-tiny primary guide-next">Next</button>
        </span>
      </div>
    </div>`;
  const ring = layer.querySelector('.guide-ring');
  const tip = layer.querySelector('.guide-tip');
  let target = null;

  // The ring sits over the thing, and the tip below it - or above it when
  // there's no room below.
  const place = () => {
    if (!target || !target.isConnected) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(ring.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const tipHeight = tip.offsetHeight;
    const below = r.bottom + pad + 12;
    const nav = document.querySelector('.bottom-nav');
    const floor = (nav ? nav.getBoundingClientRect().top : window.innerHeight) - 8;
    tip.style.top = `${below + tipHeight < floor ? below : Math.max(8, r.top - pad - 12 - tipHeight)}px`;
  };

  const end = () => {
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey);
    layer.remove();
    active = null;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') end();
  };

  const show = async () => {
    while (i < steps.length) {
      const step = steps[i];
      target = await open(step);
      if (target) break;
      i++;
    }
    if (i >= steps.length) return end();
    const step = steps[i];
    layer.querySelector('.guide-text').textContent = step.text;
    layer.querySelector('.guide-count').textContent = steps.length > 1 ? `${i + 1} of ${steps.length}` : '';
    layer.querySelector('.guide-next').textContent = i === steps.length - 1 ? 'Done' : 'Next';
    target.scrollIntoView({ block: 'center' });
    // After the scroll has settled.
    requestAnimationFrame(() => requestAnimationFrame(place));
    layer.querySelector('.guide-next').focus();
  };

  layer.querySelector('.guide-skip').addEventListener('click', end);
  layer.querySelector('.guide-next').addEventListener('click', () => {
    i++;
    show();
  });
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(layer);
  active = { end };
  show();
}

// Opens the step's screen (unless it is already showing) and waits for the
// thing to appear: screens are drawn out of sight and swapped in.
async function open(step) {
  if (location.hash !== `#${step.view}`) document.dispatchEvent(new CustomEvent('navigate', { detail: { view: step.view } }));
  for (let tries = 0; tries < 40; tries++) {
    const found = step.target
      .split(',')
      .map((q) => document.querySelector(`#view-container ${q.trim()}`))
      .find((el) => el && el.offsetParent !== null);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 75));
  }
  return null;
}
