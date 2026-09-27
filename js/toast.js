// Brief confirmation messages. Its own module rather than part of app.js so
// views can use it without importing the router that imports them.
export function showToast(message) {
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
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), 2000);
}
