/* The demo's guide (5.41): a strip above the tab bar says one thing at a time, and a ring marks what to
 * touch. It opens each screen for you, waits when it has asked you to do something, and can be left at
 * any point. Where it is, is kept for the session, so Start over and a reload do not lose the place.
 * What it says is in js/demo-script.js. */
import { onLocalChange } from './db.js';
import { isDemo } from './demo-flag.js';
import { STEPS } from './demo-script.js';
import { showToast } from './toast.js';

const KEY = 'kawach-demo-step'; // the step number, or 'off' once it is finished or skipped

const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v) => {
  try {
    sessionStorage.setItem(KEY, String(v));
  } catch {
    // no storage: the guide simply starts again
  }
};

let active = null;

const currentView = () => location.hash.replace('#', '') || 'summary';
const goTo = (view) => document.dispatchEvent(new CustomEvent('navigate', { detail: { view } }));
const firstThat = (selector) => {
  for (const sel of selector.split(',')) {
    const el = document.querySelector(sel.trim());
    if (el && el.getClientRects().length) return el;
  }
  return null;
};

/* Opens the guide at a step (or where it was left). `hooks.leave` is what "Leave demo" does. */
export function startGuide(hooks = {}, from = null) {
  if (!isDemo()) return;
  if (active) active.stop();
  const saved = read();
  let i = from != null ? from : saved === 'off' ? null : Number(saved) || 0;
  if (i == null) return;
  const state = { saved: false, asked: false };

  const strip = document.createElement('section');
  strip.className = 'demo-coach';
  strip.setAttribute('aria-live', 'polite');
  const ring = document.createElement('div');
  ring.className = 'demo-ring';
  ring.hidden = true;
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(ring, strip);
  document.body.classList.add('has-coach');

  let done = false;
  let target = null;
  let timer = 0;
  let movedFor = -1;

  // Any payment saved while a step waits for one counts, whichever way it was made.
  onLocalChange((store) => {
    if (store === 'transactions') state.saved = true;
  });
  const onClick = (e) => {
    if (e.target.closest && e.target.closest('.coach-q')) state.asked = true;
  };
  document.addEventListener('click', onClick, true);

  const spaceForStrip = () => document.documentElement.style.setProperty('--coach-h', `${strip.offsetHeight}px`);

  const place = () => {
    const step = STEPS[i];
    const view = done && step.doneView ? step.doneView : step.view;
    const sel = done && step.doneTarget ? step.doneTarget : step.target;
    target = currentView() === view ? firstThat(sel) : null;
    if (!target) {
      ring.hidden = true;
      return;
    }
    // The target is kept clear of the strip: scrolled up when it would sit behind it.
    const r = target.getBoundingClientRect();
    const floor = strip.getBoundingClientRect().top - 10;
    if (movedFor !== i + (done ? 100 : 0) && (r.bottom > floor || r.top < 70)) {
      movedFor = i + (done ? 100 : 0);
      window.scrollBy({ top: r.top - Math.max(90, Math.min(160, floor / 4)), behavior: 'smooth' });
    } else movedFor = i + (done ? 100 : 0);
    const pad = 7;
    Object.assign(ring.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    ring.hidden = false;
  };

  const render = () => {
    const step = STEPS[i];
    const here = currentView() === (done && step.doneView ? step.doneView : step.view);
    const say = done && step.doneSay ? step.doneSay : step.say;
    const sub = done && step.doneSub ? step.doneSub : step.sub;
    const waiting = step.ask && !done;
    strip.className = 'demo-coach';
    strip.innerHTML = `
      <div class="demo-coach__top"><span>Step ${i + 1} of ${STEPS.length}</span><button type="button" class="demo-coach__skip">Skip tour</button></div>
      <p class="demo-coach__say"></p>
      <div class="demo-coach__bar"><i style="--p:${((i + (done || !step.ask ? 1 : 0.5)) / STEPS.length) * 100}%"></i></div>
      <div class="demo-coach__actions">
        ${i > 0 ? '<button type="button" class="demo-coach__back">Back</button>' : '<span></span>'}
        ${
          !here
            ? '<button type="button" class="demo-coach__next demo-coach__go">Take me there</button>'
            : waiting
              ? '<span class="demo-coach__wait">Do it, and I will go on</span>'
              : `<button type="button" class="demo-coach__next">${i === STEPS.length - 1 ? 'Finish' : 'Next'}</button>`
        }
      </div>`;
    const sayEl = strip.querySelector('.demo-coach__say');
    sayEl.textContent = say;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      sayEl.append(small);
    }
    strip.querySelector('.demo-coach__skip').addEventListener('click', skip);
    strip.querySelector('.demo-coach__back')?.addEventListener('click', () => go(i - 1));
    strip.querySelector('.demo-coach__go')?.addEventListener('click', () => goTo(done && step.doneView ? step.doneView : step.view));
    strip.querySelector('.demo-coach__next:not(.demo-coach__go)')?.addEventListener('click', () => (i === STEPS.length - 1 ? finish() : go(i + 1)));
    spaceForStrip();
  };

  const go = (n) => {
    i = Math.max(0, n);
    done = false;
    state.saved = false;
    state.asked = false;
    write(i);
    const step = STEPS[i];
    if (currentView() !== step.view) goTo(step.view);
    render();
  };

  const tick = () => {
    const step = STEPS[i];
    if (!done && step.ask && step.done && step.done(state)) {
      done = true;
      if (step.doneView && currentView() !== step.doneView) goTo(step.doneView);
      render();
    }
    place();
    // Moved to another screen by hand: the button says so.
    const here = currentView() === (done && step.doneView ? step.doneView : step.view);
    const goBtn = strip.querySelector('.demo-coach__go');
    if (here === Boolean(goBtn)) render();
  };

  const close = () => {
    clearInterval(timer);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    ring.remove();
    strip.remove();
    document.body.classList.remove('has-coach');
    document.documentElement.style.removeProperty('--coach-h');
    active = null;
  };
  const skip = () => {
    write('off');
    close();
    showToast('The tour is in Settings if you want it again');
  };
  const finish = () => {
    write('off');
    clearInterval(timer);
    ring.hidden = true;
    strip.className = 'demo-coach demo-end';
    strip.innerHTML = `
      <div class="demo-coach__top"><span>All done</span></div>
      <p class="demo-coach__say">That is Kawach.<small>Your money stays on your phone. No account, nothing sent anywhere.</small></p>
      <div class="demo-end__row">
        <button type="button" class="primary" data-end="install">Show me how to install it</button>
        <button type="button" data-end="explore">Keep exploring</button>
      </div>
      <button type="button" class="demo-end__leave" data-end="leave">Leave demo</button>`;
    spaceForStrip();
    strip.addEventListener('click', (e) => {
      const what = e.target.closest('[data-end]')?.dataset.end;
      if (what === 'install') window.open('./welcome.html', '_blank', 'noopener');
      else if (what === 'explore') close();
      else if (what === 'leave') hooks.leave?.();
    });
  };

  active = { stop: close };
  go(i);
  timer = setInterval(tick, 300);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
}

export const stopGuide = () => active && active.stop();

/* Back to the first step the next time it opens (Start over). */
export const resetGuide = () => write(0);

/* Settings: "Show the tour again". */
export function restartGuide(hooks) {
  write(0);
  startGuide(hooks, 0);
}

/* Where the demo opens: the guide, unless it was skipped or finished earlier in this session. */
export function resumeGuide(hooks) {
  if (read() === 'off') return;
  startGuide(hooks);
}
