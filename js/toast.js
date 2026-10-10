// Brief confirmation messages. Its own module rather than part of app.js so
// views can use it without importing the router that imports them.
export function showToast(message, { action = null, ms = 2000 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    // Said out loud as well as shown. Without this a screen reader gets
    // nothing at all for "Backed up 42 payments to Drive" - the message
    // appears and goes again with no announcement. `polite` waits for a gap
    // rather than cutting across whatever is being read.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  // The hairline is a new element each time, so it counts down afresh for every message.
  const bar = document.createElement('i');
  bar.className = 'toast__bar';
  bar.style.animationDuration = `${ms}ms`;
  el.replaceChildren(document.createTextNode(message), bar);
  // A toast with an action (Undo) can be tapped and stays longer; the hairline shows how long.
  el.classList.toggle('toast--action', Boolean(action));
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast__action';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      el.classList.remove('visible');
      action.run();
    });
    el.insertBefore(b, bar);
  }
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), ms);
}
