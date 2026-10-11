/* What every box that sits over the app has to do (5.43.2).
 *
 * A dialog or a sheet that says it is modal has to behave like one for someone who uses a keyboard or a screen
 * reader, not only for someone who taps: Tab stays inside it, the page behind it can neither be reached nor read
 * out, Escape is theirs, and when it closes focus goes back to what opened it. Before this, one press of Tab left a
 * dialog for the page behind it, and a danger question opened with its destructive button already focused.
 *
 * holdFocus(box) does the keeping and returns the function that lets go. It makes everything outside the box
 * `inert` (the browser then neither focuses it nor exposes it), except the toast that may be holding an Undo. */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const KEEP_LIVE = '.toast, #toast, [data-keep-live]';

const visible = (el) => !el.closest('[hidden], [inert]') && el.getClientRects().length > 0;
export const focusables = (box) => [...box.querySelectorAll(FOCUSABLE)].filter(visible);

/* Everything that is not the box or one of its parents, at each level. Returns what it changed. */
function inertAround(box) {
  const made = [];
  for (let node = box; node.parentElement && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || sibling.hasAttribute('inert') || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(sibling.tagName) || sibling.matches(KEEP_LIVE)) continue;
      sibling.setAttribute('inert', '');
      made.push(sibling);
    }
  }
  return made;
}

/* `initial`: what to focus first (a node, or a selector inside the box); the first control otherwise. */
export function holdFocus(box, { initial = null } = {}) {
  const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const made = inertAround(box);
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const list = focusables(box);
    if (!list.length) {
      e.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const here = document.activeElement;
    if (!box.contains(here)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && here === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && here === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  const start = typeof initial === 'string' ? box.querySelector(initial) : initial;
  (start || focusables(box)[0] || box).focus?.({ preventScroll: true });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey, true);
    for (const el of made) el.removeAttribute('inert');
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  };
}
