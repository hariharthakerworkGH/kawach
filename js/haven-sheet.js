/* Haven's Add sheet (5.52): the Add button does not take you to another screen, it springs a sheet up from itself over
 * the one you are on (as the prototype's "Add a payment"); the form inside is the app's own Add (js/views/add.js),
 * laid out amount first with a keypad. Dismiss: the close button, the scrim, Escape, or drag the grip down. After a save
 * the sheet closes by itself. */
import { icon } from './icons.js';
import { holdFocus } from './overlay.js';

let isOpen = false;
let closer = null;
const reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function sheetOpen() { return isOpen; }
/* Going to another screen (a link inside the sheet, the back button) puts the sheet away first. */
export function closeAddSheet() { if (closer) closer(); }

export async function openAddSheet(params = {}) {
  if (isOpen) return;
  isOpen = true;
  const scrim = document.createElement('div');
  scrim.className = 'hv-scrim';
  scrim.style.position = 'fixed';
  const sheet = document.createElement('div');
  sheet.className = 'hv-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Add a payment');
  sheet.innerHTML = `<div class="hv-shell"><div class="hv-core"><span class="hv-grip" id="hv-grip" aria-hidden="true"></span>
    <div class="hv-sheet__head" id="hv-sheet-head"><h2>Add a payment</h2><button type="button" class="hv-round" id="hv-close" aria-label="Close"><span style="display:grid;transform:rotate(45deg)">${icon('add')}</span></button></div>
    <div id="hv-add-body"></div></div></div>`;
  document.body.append(scrim, sheet);
  const body = sheet.querySelector('#hv-add-body');
  let release = () => {};
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    closer = null;
    document.body.classList.remove('sheet-open');
    sheet.style.removeProperty('--drag');
    sheet.classList.remove('dragging');
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', close);
    release();
    setTimeout(() => { scrim.remove(); sheet.remove(); }, reduced() ? 20 : 700);
  };
  closer = close;
  // Escape puts away what is on top: a list opened inside the sheet closes first, the sheet on the next press.
  const onKey = (e) => e.key === 'Escape' && !e.target.closest('.k-sheet, .dialog, dialog') && document.querySelector('#add-cat-sheet')?.hidden !== false && close();
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', close);
  scrim.addEventListener('click', close);
  sheet.querySelector('#hv-close').addEventListener('click', close);
  // drag the grip or the title row down: it follows the finger, and goes if let go far or fast enough
  let drag = false, y0 = 0, t0 = 0, dy = 0;
  const start = (e) => { if (e.target.closest('button')) return; drag = true; y0 = e.clientY; t0 = e.timeStamp; dy = 0; sheet.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drag) return; dy = Math.max(0, e.clientY - y0); sheet.style.setProperty('--drag', `${dy * (dy > 160 ? 0.9 : 1)}px`); };
  const end = (e) => { if (!drag) return; drag = false; sheet.classList.remove('dragging'); const v = dy / Math.max(1, e.timeStamp - t0); if (dy > 130 || v > 0.7) close(); else sheet.style.removeProperty('--drag'); };
  for (const el of [sheet.querySelector('#hv-grip'), sheet.querySelector('#hv-sheet-head')]) {
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  const add = await import('./views/add.js');
  await add.render(body, { ...params, onSaved: close });
  // the keyboard stays down: the amount is typed on the keypad (the form's own focus() on the amount is harmless, it has no keyboard)
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('sheet-open')));
  release = holdFocus(sheet, { initial: sheet.querySelector('#hv-close') });
}
