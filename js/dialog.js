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
// accident.

let open = null;

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
  okBtn.textContent = confirmLabel;
  okBtn.classList.toggle('danger', Boolean(danger));
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
    okBtn.addEventListener('click', () => close(true));
    if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
  });
}
