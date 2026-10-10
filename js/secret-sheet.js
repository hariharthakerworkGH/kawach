/* Three small boxes for the things you must not lose (5.39): a secret shown with ways to keep it,
 * a choice between ways forward, and one line of text asked for. They are the app's own dialog
 * (css .dialog) so they sit above everything, the lock screen included.
 *
 * Nothing here leaves the phone on its own. Copy, Save and Share are things the person presses, and
 * where the text goes after that is their choice. */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function frame(inner, label) {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';
  backdrop.innerHTML = `<div class="dialog secret-dialog" role="dialog" aria-modal="true" aria-label="${esc(label)}">${inner}</div>`;
  document.body.appendChild(backdrop);
  return backdrop;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}

function saveFile(name, body) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Shows a secret in large type with Copy, Share and Save. `required` means it can only be closed by
 * saying it has been kept (and can be cancelled when `cancelLabel` is given): used for a recovery key,
 * which is shown once and never again. Resolves true when it was kept or closed, false when cancelled. */
export function showSecret({ title, intro = '', secret, fileName = 'kawach-secret.txt', fileBody = null, doneLabel = 'Done', cancelLabel = '' }) {
  return new Promise((resolve) => {
    const body = fileBody || secret;
    const box = frame(
      `<p class="dialog-title">${esc(title)}</p>
       ${intro ? `<p class="dialog-message">${esc(intro)}</p>` : ''}
       <p class="secret-text" id="secret-text" tabindex="0">${esc(secret)}</p>
       <div class="secret-tools">
         <button type="button" class="btn-tiny" data-do="copy">Copy</button>
         ${navigator.share ? '<button type="button" class="btn-tiny" data-do="share">Share</button>' : ''}
         <button type="button" class="btn-tiny" data-do="save">Save as file</button>
       </div>
       <p class="secret-said" role="status" aria-live="polite"></p>
       <div class="dialog-actions">
         ${cancelLabel ? `<button type="button" class="btn-tiny dialog-cancel">${esc(cancelLabel)}</button>` : ''}
         <button type="button" class="btn-primary dialog-ok">${esc(doneLabel)}</button>
       </div>`,
      title
    );
    const said = box.querySelector('.secret-said');
    const close = (answer) => {
      document.removeEventListener('keydown', onKey, true);
      box.remove();
      resolve(answer);
    };
    // Escape only closes what can be cancelled; a key that must be kept is not lost to a stray key press.
    const onKey = (e) => {
      if (e.key === 'Escape' && cancelLabel) {
        e.stopPropagation();
        close(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    box.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-do]')?.dataset.do;
      if (act === 'copy') said.textContent = (await copyText(secret)) ? 'Copied. Paste it somewhere safe, then clear your clipboard.' : 'Could not copy. Press and hold the text to select it.';
      else if (act === 'save') {
        saveFile(fileName, body);
        said.textContent = 'Saved as a file on this phone. Move it somewhere safe.';
      } else if (act === 'share') {
        try {
          await navigator.share({ title, text: body });
        } catch {
          // closed without choosing: nothing to say
        }
      }
    });
    box.querySelector('.dialog-ok').addEventListener('click', () => close(true));
    box.querySelector('.dialog-cancel')?.addEventListener('click', () => close(false));
    box.querySelector('.dialog-ok').focus();
  });
}

/* A choice between ways forward. options: [{ label, value, kind: 'primary' | 'danger' | '' }]. Resolves with
 * the chosen value, or null when it is closed. */
export function choose({ title, message = '', options, backLabel = 'Back' }) {
  return new Promise((resolve) => {
    const box = frame(
      `<p class="dialog-title">${esc(title)}</p>
       ${message ? `<p class="dialog-message">${esc(message)}</p>` : ''}
       <div class="secret-choices">${options.map((o, i) => `<button type="button" class="${o.kind === 'primary' ? 'btn-primary' : o.kind === 'danger' ? 'btn-secondary danger' : 'btn-secondary'}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>
       <div class="dialog-actions"><button type="button" class="btn-tiny dialog-cancel">${esc(backLabel)}</button></div>`,
      title
    );
    const close = (v) => {
      document.removeEventListener('keydown', onKey, true);
      box.remove();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) close(options[Number(b.dataset.i)].value);
      else if (e.target.closest('.dialog-cancel') || e.target === box) close(null);
    });
    box.querySelector('[data-i]')?.focus();
  });
}

/* Asks for a line of text. `check(text)` resolves null when it is right, else the words to show; the box
 * stays until it is right or closed. `format` tidies what is typed as it goes (a key's dashes).
 * Resolves with the text, or null when closed. */
export function askText({ title, message = '', placeholder = '', submitLabel = 'OK', cancelLabel = 'Back', check = async () => null, format = (s) => s }) {
  return new Promise((resolve) => {
    const box = frame(
      `<p class="dialog-title">${esc(title)}</p>
       ${message ? `<p class="dialog-message">${esc(message)}</p>` : ''}
       <input type="text" class="secret-input" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="${esc(placeholder)}" aria-label="${esc(title)}">
       <p class="secret-said is-error" role="status" aria-live="polite"></p>
       <div class="dialog-actions">
         <button type="button" class="btn-tiny dialog-cancel">${esc(cancelLabel)}</button>
         <button type="button" class="btn-primary dialog-ok">${esc(submitLabel)}</button>
       </div>`,
      title
    );
    const input = box.querySelector('.secret-input');
    const said = box.querySelector('.secret-said');
    const ok = box.querySelector('.dialog-ok');
    const close = (v) => {
      document.removeEventListener('keydown', onKey, true);
      box.remove();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    input.addEventListener('input', () => {
      input.value = format(input.value);
      said.textContent = '';
    });
    const submit = async () => {
      if (ok.disabled) return;
      ok.disabled = true;
      const words = await check(input.value);
      ok.disabled = false;
      if (words === null) return close(input.value);
      said.textContent = words;
      input.focus();
    };
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    box.querySelector('.dialog-cancel').addEventListener('click', () => close(null));
    input.focus();
  });
}
