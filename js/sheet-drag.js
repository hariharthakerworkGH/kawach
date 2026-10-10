/* Drag a bottom sheet down to close it (5.36). The sheet follows the finger; let go past about
 * a third of the way, or with a flick, and it slides away and closes; otherwise it settles back.
 * Pulling up resists, like the end of a list. The grip and the title row are the handle, so a
 * list inside the sheet still scrolls normally. Escape and the Done button keep working. */
const FAR = 90; // px past which letting go closes it
const FAST = 0.6; // px per ms: a flick

const reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function dragToClose(sheet, close, scrim) {
  const handles = [sheet.querySelector('.k-sheet__grip'), sheet.querySelector('.k-sheet__head')].filter(Boolean);
  let startY = 0;
  let dy = 0;
  let t0 = 0;
  let active = false;

  const place = (v) => {
    sheet.style.transform = `translateY(${v}px)`;
    if (scrim) scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, v) / (sheet.offsetHeight || 400)));
  };
  const reset = () => {
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (scrim) {
      scrim.style.transition = '';
      scrim.style.opacity = '';
    }
  };
  const ease = (ms) => (reduced() ? 'none' : `transform ${ms}ms var(--k-spring, cubic-bezier(0.16, 1, 0.3, 1))`);

  const down = (e) => {
    if ((e.button != null && e.button > 0) || e.target.closest('button')) return;
    active = true;
    startY = e.clientY;
    dy = 0;
    t0 = performance.now();
    sheet.style.transition = 'none';
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer that is already gone: the drag simply follows the events it gets */
    }
  };
  const move = (e) => {
    if (!active) return;
    const raw = e.clientY - startY;
    dy = raw < 0 ? -Math.sqrt(-raw) * 2 : raw;
    place(dy);
  };
  const up = () => {
    if (!active) return;
    active = false;
    const speed = dy / Math.max(1, performance.now() - t0);
    if (dy > FAR || speed > FAST) {
      sheet.style.transition = ease(200);
      if (scrim) scrim.style.transition = reduced() ? 'none' : 'opacity 200ms linear';
      place(sheet.offsetHeight || 400);
      setTimeout(() => {
        close();
        // A sheet that is only hidden, not removed, opens again at rest.
        requestAnimationFrame(reset);
      }, reduced() ? 0 : 190);
    } else {
      sheet.style.transition = ease(340);
      place(0);
      setTimeout(reset, reduced() ? 0 : 360);
    }
  };

  for (const h of handles) {
    h.classList.add('is-handle');
    h.addEventListener('pointerdown', down);
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  }
}
