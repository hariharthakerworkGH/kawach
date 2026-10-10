/* Pull a screen down to refresh it (5.37). The screen follows the finger with growing resistance and the
 * sync icon turns as far as you have pulled (anticlockwise, the way its arrows point). Let go past the
 * line and it spins while the work is done, ticks, and the screen settles back. Short of the line it
 * simply settles back. It only starts from the very top of a screen, with a mostly vertical pull, and
 * never over a sheet, a question or the lock. `refresh` does the work and resolves when it is done. */
import { icon } from './icons.js';

const LINE = 64; // px of finger travel that counts
const MAX = 96;
const reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const resist = (dy) => Math.min(MAX, dy * 0.5);

export function wirePullRefresh({ canPull, refresh }) {
  let ind = null;
  let startY = 0;
  let startX = 0;
  let pulling = false;
  let busy = false;
  let dyNow = 0;

  const screen = () => document.getElementById('view-container');
  const make = () => {
    ind = document.createElement('div');
    ind.className = 'ptr';
    ind.setAttribute('aria-hidden', 'true');
    ind.innerHTML = `<span class="ptr__arrows">${icon('sync')}</span><span class="ptr__tick">${icon('check')}</span>`;
    document.body.append(ind);
  };
  const place = (dy) => {
    const s = screen();
    if (s && !reduced()) s.style.transform = dy ? `translateY(${dy}px)` : '';
    if (ind) {
      const p = Math.min(1, dy / (LINE * 0.5));
      ind.style.opacity = String(Math.min(1, p));
      ind.style.transform = `translate(-50%, ${dy * 0.5}px)`;
      const arrows = ind.querySelector('.ptr__arrows');
      if (!busy) arrows.style.transform = `rotate(${-p * 200}deg)`;
    }
  };

  document.addEventListener(
    'touchstart',
    (e) => {
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || !canPull()) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pulling = false;
      dyNow = 0;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (busy || !startY) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (!pulling) {
        // Mostly down, from the top: a pull. Sideways or up is something else (a swipe, a scroll).
        if (dy > 10 && dy > Math.abs(dx) * 1.5 && window.scrollY <= 0) {
          pulling = true;
          if (!ind) make();
        } else {
          if (dy < -4 || Math.abs(dx) > 14) startY = 0;
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      dyNow = resist(dy);
      place(dyNow);
    },
    { passive: false }
  );

  const end = async () => {
    if (!pulling) {
      startY = 0;
      return;
    }
    const reached = dyNow >= resist(LINE);
    pulling = false;
    startY = 0;
    const s = screen();
    const settle = (ms = 280) => {
      if (s && !reduced()) {
        s.style.transition = `transform ${ms}ms ${OUT}`;
        s.style.transform = '';
        setTimeout(() => (s.style.transition = ''), ms + 40);
      }
      if (ind) {
        ind.style.transition = `opacity ${ms}ms ${OUT}, transform ${ms}ms ${OUT}`;
        ind.style.opacity = '0';
        ind.style.transform = 'translate(-50%, 0)';
        setTimeout(() => ind && ind.classList.remove('is-busy', 'is-done'), ms + 40);
      }
    };
    if (!reached) return settle();
    busy = true;
    ind.classList.add('is-busy');
    ind.style.transition = '';
    if (s && !reduced()) {
      s.style.transition = `transform 200ms ${OUT}`;
      s.style.transform = 'translateY(40px)';
    }
    ind.style.transform = 'translate(-50%, 20px)';
    ind.style.opacity = '1';
    navigator.vibrate?.(12);
    try {
      await Promise.all([refresh(), new Promise((r) => setTimeout(r, 900))]);
    } catch {
      /* the screen is as it was */
    }
    ind.classList.remove('is-busy');
    ind.classList.add('is-done');
    await new Promise((r) => setTimeout(r, 520));
    busy = false;
    settle();
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
}
