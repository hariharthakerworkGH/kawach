// Passphrase boxes. Each gets an eye to show what was typed, so you can check
// it (or take a screenshot to keep). A passphrase typed twice turns the second
// box red as soon as the two stop matching, instead of saying so only after
// you tap Save.
import { icon } from './icons.js';

export const MIN_PASSPHRASE = 8;

export function enhancePasswords(root) {
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.parentElement.classList.contains('pass-wrap')) return;
    const wrap = document.createElement('span');
    wrap.className = 'pass-wrap';
    input.replaceWith(wrap);
    wrap.append(input);
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'pass-eye';
    const paint = (shown) => {
      eye.innerHTML = icon(shown ? 'eye-off' : 'eye');
      eye.setAttribute('aria-label', shown ? 'Hide' : 'Show');
      eye.setAttribute('aria-pressed', String(shown));
    };
    paint(false);
    eye.addEventListener('click', (e) => {
      e.preventDefault();
      const shown = input.type === 'password';
      input.type = shown ? 'text' : 'password';
      paint(shown);
    });
    wrap.append(eye);
  });
}

// The two boxes of a new passphrase. `onChange` runs on every keystroke, so a
// message left from an earlier tap can be cleared.
export function checkPair(first, again, onChange = () => {}) {
  const note = document.createElement('p');
  note.className = 'field-error-text';
  note.hidden = true;
  (again.closest('.field') || again).after(note);

  const show = (el, message) => {
    el.classList.toggle('invalid', Boolean(message));
    return message;
  };
  const update = (finished) => {
    const a = first.value;
    const b = again.value;
    // Too short only once you've moved on, not while you're still typing it.
    const short = show(first, (finished || b) && a && a.length < MIN_PASSPHRASE ? `At least ${MIN_PASSPHRASE} characters` : '');
    // Red once the second can no longer become the first.
    const differs = show(again, b && (finished ? a !== b : !a.startsWith(b)) ? "Doesn't match" : '');
    note.textContent = differs || short;
    note.hidden = !note.textContent;
    onChange();
  };
  first.addEventListener('input', () => update(false));
  again.addEventListener('input', () => update(false));
  first.addEventListener('blur', () => update(Boolean(again.value)));
  again.addEventListener('blur', () => update(true));
}
