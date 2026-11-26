/* Split a payment with friends (7.25): the sheet opened from a payment in History.
 *
 * Pick who was with you, split it equally or type each one's part, and the parts are kept on the payment as `friendShares`
 * (js/people.js says what that does to the month: nothing today, each part goes back on as that friend pays). The sheet only
 * collects the parts; `apply(shares)` saves them, and `apply(null)` takes the split off again, so it is never a one-way door. */

import { escapeHtml, escapeAttr } from './ui.js';
import { formatRupees, formatDateNice } from './format.js';
import { holdFocus } from './overlay.js';
import { dragToClose } from './sheet-drag.js';
import { paiseFrom } from './records.js';
import { isoLocal } from './frequency.js';
import { personNamed, equalShares } from './people.js';

const rupeesText = (paise) => (paise / 100).toFixed(2).replace(/\.00$/, '');

/* `t` is the payment, `title` its tidy name, `people` the household's people list (a person added here is pushed onto it). */
export function openSplitSheet({ t, title, people, apply }) {
  document.querySelector('.fs-wrap')?.remove();
  const before = Array.isArray(t.friendShares) ? t.friendShares.filter((s) => people.some((p) => p.id === s.personId)) : [];
  const picked = new Set(before.map((s) => s.personId));
  const equalNow = (ids) => equalShares(t.amount, ids).map((s) => s.amount);
  const startedEqual = before.length > 0 && before.every((s) => s.amount === equalShares(t.amount, before.map((x) => x.personId))[0].amount);
  let mode = before.length && !startedEqual ? 'own' : 'equal';
  const typed = new Map(before.map((s) => [s.personId, rupeesText(s.amount)]));
  const day = t.date === isoLocal(new Date()) ? 'today' : formatDateNice(t.date);

  const wrap = document.createElement('div');
  wrap.className = 'fs-wrap';
  wrap.innerHTML = `<div class="fs-back" data-close></div>
    <div class="fs-sheet" role="dialog" aria-modal="true" aria-label="Split ${escapeAttr(title)}">
      <div class="fs-grip k-sheet__grip"></div>
      <h3 class="k-sheet__head">Split ${escapeHtml(title)}<small>${formatRupees(t.amount)} · ${day} · you paid it</small></h3>
      <p class="fs-lab">With whom</p>
      <div class="fs-chips"></div>
      <form class="fs-addrow" hidden><input type="text" class="k-input" maxlength="40" placeholder="Their name" aria-label="Name of the person" autocomplete="off"><button type="submit" class="fs-addgo">Add</button></form>
      <div class="fs-seg" role="group" aria-label="How to split"><button type="button" data-mode="equal">Equal</button><button type="button" data-mode="own">Own amounts</button></div>
      <div class="fs-list"></div>
      <p class="fs-note"></p>
      <p class="fs-said" role="status" aria-live="polite"></p>
      <button type="button" class="fs-go"></button>
      ${before.length ? '<button type="button" class="fs-remove">Remove this split</button>' : ''}
    </div>`;
  document.body.append(wrap);
  const chipsEl = wrap.querySelector('.fs-chips');
  const listEl = wrap.querySelector('.fs-list');
  const noteEl = wrap.querySelector('.fs-note');
  const saidEl = wrap.querySelector('.fs-said');
  const goEl = wrap.querySelector('.fs-go');
  const addRow = wrap.querySelector('.fs-addrow');
  const ids = () => people.filter((p) => picked.has(p.id)).map((p) => p.id);
  const nameOf = (id) => people.find((p) => p.id === id)?.name || '';

  // What the sheet would save right now: the parts, or why it cannot yet.
  const current = () => {
    const chosen = ids();
    if (!chosen.length) return { shares: null, why: 'Pick who was with you' };
    let shares;
    if (mode === 'equal') shares = equalShares(t.amount, chosen);
    else {
      shares = [];
      for (const id of chosen) {
        const amount = paiseFrom(typed.get(id));
        if (amount === null) return { shares: null, why: `Enter ${nameOf(id).split(' ')[0]}'s part` };
        shares.push({ personId: id, amount });
      }
    }
    const total = shares.reduce((s, x) => s + x.amount, 0);
    if (total > t.amount) return { shares: null, why: `More than ${formatRupees(t.amount)}` };
    return { shares, you: t.amount - total };
  };

  const drawChips = () => {
    chipsEl.innerHTML =
      people.map((p) => `<button type="button" class="fs-chip${picked.has(p.id) ? ' on' : ''}" data-id="${escapeAttr(p.id)}" aria-pressed="${picked.has(p.id)}"><i>${escapeHtml(p.name.trim().charAt(0).toUpperCase())}</i>${escapeHtml(p.name.split(' ')[0])}</button>`).join('') +
      '<button type="button" class="fs-chip add" data-add>+ Add</button>';
  };
  const drawList = () => {
    const chosen = ids();
    const parts = mode === 'equal' ? equalNow(chosen) : [];
    listEl.innerHTML =
      '<div class="fs-row you"><b>You</b><em class="fs-you"></em></div>' +
      chosen
        .map((id, i) =>
          mode === 'equal'
            ? `<div class="fs-row"><b>${escapeHtml(nameOf(id))}</b><span>owes you</span><em>${formatRupees(parts[i])}</em></div>`
            : `<div class="fs-row"><b>${escapeHtml(nameOf(id))}</b><span>owes you ₹</span><input type="number" step="0.01" min="0" inputmode="decimal" class="fs-amt" data-id="${escapeAttr(id)}" value="${escapeAttr(typed.get(id) ?? '')}" aria-label="${escapeAttr(nameOf(id))}'s part"></div>`
        )
        .join('');
  };
  // Numbers, note and button, kept in step with every tap and every key without redrawing a box being typed in.
  const refresh = () => {
    wrap.querySelectorAll('.fs-seg button').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const { shares, why, you } = current();
    const youEl = listEl.querySelector('.fs-you');
    if (youEl) youEl.textContent = shares ? formatRupees(you) : mode === 'equal' ? formatRupees(t.amount) : '–';
    saidEl.textContent = '';
    noteEl.hidden = !ids().length;
    noteEl.innerHTML =
      mode === 'equal' && shares
        ? `<b>Left to spend does not change today.</b> It goes up by ${formatRupees(shares[0].amount)} each time ${shares.length === 1 ? 'they pay' : 'one of them pays'} you back.`
        : '<b>Left to spend does not change today.</b> It goes up as each of them pays you back.';
    goEl.disabled = !shares;
    goEl.textContent = shares ? (before.length ? 'Save split' : `Split ${shares.length + 1} ways`) : why;
  };
  const redraw = () => {
    drawChips();
    drawList();
    refresh();
  };
  redraw();

  const close = () => {
    window.removeEventListener('hashchange', close);
    document.removeEventListener('keydown', onKey, true);
    release();
    wrap.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  wrap.querySelector('.fs-back').addEventListener('click', close);
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.fs-chip');
    if (!b) return;
    if (b.dataset.add !== undefined) {
      addRow.hidden = !addRow.hidden;
      if (!addRow.hidden) addRow.querySelector('input').focus();
      return;
    }
    if (picked.has(b.dataset.id)) picked.delete(b.dataset.id);
    else {
      picked.add(b.dataset.id);
      if (mode === 'own' && !typed.has(b.dataset.id)) typed.set(b.dataset.id, rupeesText(equalNow(ids())[0]));
    }
    redraw();
  });
  addRow.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = addRow.querySelector('input');
    const person = await personNamed(input.value);
    if (!person) return;
    if (!people.some((p) => p.id === person.id)) people.push(person);
    picked.add(person.id);
    if (mode === 'own' && !typed.has(person.id)) typed.set(person.id, rupeesText(equalNow(ids())[0]));
    input.value = '';
    addRow.hidden = true;
    redraw();
  });
  wrap.querySelector('.fs-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    // Own amounts start from the equal parts, so changing one is a small edit, not typing from nothing.
    if (mode === 'own') equalShares(t.amount, ids()).forEach((s) => typed.has(s.personId) || typed.set(s.personId, rupeesText(s.amount)));
    drawList();
    refresh();
  });
  listEl.addEventListener('input', (e) => {
    const box = e.target.closest('.fs-amt');
    if (!box) return;
    typed.set(box.dataset.id, box.value);
    refresh();
  });
  goEl.addEventListener('click', async () => {
    const { shares } = current();
    if (!shares) return;
    try {
      await apply(shares);
      close();
    } catch {
      saidEl.textContent = 'Could not save the split. Try again.';
    }
  });
  wrap.querySelector('.fs-remove')?.addEventListener('click', async () => {
    try {
      await apply(null);
      close();
    } catch {
      saidEl.textContent = 'Could not remove the split. Try again.';
    }
  });
  dragToClose(wrap.querySelector('.fs-sheet'), close, wrap.querySelector('.fs-back'));
  const release = holdFocus(wrap, { initial: '.fs-chip' });
  return close;
}
