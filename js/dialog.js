// Asking before something that can't be undone.
//
// The browser's own confirm() box puts the website's address at the top
// ("yourname.github.io says"), which looks like a warning from
// somewhere else rather than a question from the app. This is the same
// question in the app's own voice: a title, the detail underneath, and two
// buttons.
//
// Returns a promise: true for the confirming button, false for cancel. Escape
// and a tap outside both count as cancel, so nothing destructive happens by
// accident. A dangerous question (delete, erase) asks for more than a tap: the
// confirming button is held down for under a second while it fills, and letting
// go early cancels. A keyboard or a screen reader presses it as a button, once.

let open = null;
const HOLD_MS = 800;

export function askConfirm({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false } = {}) {
  return show({ title, message, confirmLabel, cancelLabel, danger, ask: true });
}

export function tellUser({ title, message = '', okLabel = 'OK' } = {}) {
  return show({ title, message, confirmLabel: okLabel, ask: false });
}

function show({ title, message, confirmLabel, cancelLabel, danger, ask }) {
  // A second question while one is open would leave the first unanswered.
  if (open) open.cancel();

  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';
  backdrop.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <p class="dialog-title" id="dialog-title"></p>
      <p class="dialog-message"></p>
      <div class="dialog-actions">
        ${ask ? `<button type="button" class="btn-tiny dialog-cancel"></button>` : ''}
        <button type="button" class="btn-primary dialog-ok"></button>
      </div>
    </div>
  `;
  // Set as text, never as HTML: these messages carry descriptions from your
  // own statements.
  backdrop.querySelector('.dialog-title').textContent = title || '';
  const messageEl = backdrop.querySelector('.dialog-message');
  messageEl.textContent = message || '';
  messageEl.hidden = !message;
  const okBtn = backdrop.querySelector('.dialog-ok');
  const hold = Boolean(danger && ask);
  okBtn.textContent = hold ? `Hold to ${String(confirmLabel).toLowerCase()}` : confirmLabel;
  okBtn.classList.toggle('danger', Boolean(danger));
  okBtn.classList.toggle('is-hold', hold);
  const cancelBtn = backdrop.querySelector('.dialog-cancel');
  if (cancelBtn) cancelBtn.textContent = cancelLabel;

  document.body.appendChild(backdrop);
  okBtn.focus();

  return new Promise((resolve) => {
    const close = (answer) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      open = null;
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter' && document.activeElement === okBtn) close(true);
    };
    open = { cancel: () => close(false) };
    document.addEventListener('keydown', onKey);
    if (hold) {
      let from = 0;
      let frame = 0;
      const stop = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        okBtn.style.setProperty('--hold', '0');
      };
      const tick = () => {
        const done = Math.min(1, (performance.now() - from) / HOLD_MS);
        okBtn.style.setProperty('--hold', String(done));
        if (done >= 1) {
          frame = 0;
          navigator.vibrate?.(18);
          close(true);
        } else frame = requestAnimationFrame(tick);
      };
      okBtn.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || frame) return;
        from = performance.now();
        frame = requestAnimationFrame(tick);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => okBtn.addEventListener(t, stop));
      okBtn.addEventListener('contextmenu', (e) => e.preventDefault());
      // A press from a keyboard or a screen reader has no hold in it (detail 0): that is a choice made on purpose.
      okBtn.addEventListener('click', (e) => e.detail === 0 && close(true));
    } else okBtn.addEventListener('click', () => close(true));
    if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
}
