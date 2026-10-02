/* Swipe left and right between the tabs, round and round (5.10).
 *
 * The screen follows your finger; let go past a quarter of the width, or
 * with a quick flick, and the next tab slides in from that side. Past Coach
 * comes Summary again, and before Summary comes Coach. A swipe that starts
 * in a field, on something that scrolls sideways, in an open sheet or near
 * the screen's edge (where the phone's own back gesture lives) is left
 * alone, and so is any screen that is not one of the six tabs.
 */

export const TAB_ORDER = ['summary', 'add', 'accounts', 'plan', 'transactions', 'coach'];

/* The tab a swipe lands on: dir 1 is the next one, -1 the one before. */
export function neighbour(view, dir) {
  const i = TAB_ORDER.indexOf(view);
  if (i < 0) return null;
  return TAB_ORDER[(i + dir + TAB_ORDER.length) % TAB_ORDER.length];
}

const EDGE = 18;
const LOCK = 12;

function scrollsSideways(el, stop) {
  for (let n = el; n && n !== stop; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}

export function wireSwipe({ current, go }) {
  let start = null;
  let locked = false;
  const still = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const view = () => document.getElementById('view-container');

  document.addEventListener(
    'touchstart',
    (e) => {
      start = null;
      locked = false;
      if (e.touches.length !== 1 || !TAB_ORDER.includes(current())) return;
      const t = e.touches[0];
      const v = view();
      if (!v || !v.contains(e.target)) return;
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
      if (e.target.closest('input, textarea, select, [contenteditable], .no-swipe, dialog, [role="dialog"]')) return;
      if (document.querySelector('dialog[open]') || scrollsSideways(e.target, v)) return;
      start = { x: t.clientX, y: t.clientY, at: performance.now() };
    },
    { passive: true },
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!locked) {
        if (Math.abs(dy) > LOCK && Math.abs(dy) >= Math.abs(dx)) {
          start = null;
          return;
        }
        if (Math.abs(dx) < LOCK || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        locked = true;
      }
      e.preventDefault();
      const v = view();
      if (!v || still()) return;
      const w = window.innerWidth;
      v.style.transition = 'none';
      v.style.transform = `translateX(${dx * 0.92}px) scale(${1 - Math.min(0.04, Math.abs(dx) / w / 10)})`;
      v.style.opacity = String(1 - Math.min(0.45, Math.abs(dx) / w));
    },
    { passive: false },
  );

  const end = (e) => {
    if (!start || !locked) {
      start = null;
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - start.at);
    start = null;
    locked = false;
    const v = view();
    const w = window.innerWidth;
    const dir = dx < 0 ? 1 : -1;
    const commit = Math.abs(dx) > w * 0.25 || (speed > 0.5 && Math.abs(dx) > 40);
    if (!commit) {
      if (v) {
        v.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms';
        v.style.transform = '';
        v.style.opacity = '';
      }
      return;
    }
    if (v && !still()) {
      v.style.transition = 'transform 160ms ease-in, opacity 160ms ease-in';
      v.style.transform = `translateX(${-dir * w * 0.6}px) scale(.96)`;
      v.style.opacity = '0';
    }
    go(neighbour(current(), dir), dir);
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
}
