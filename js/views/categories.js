import { getAll, put, remove, newId } from '../db.js';
import { categoryStyle, setCustomStyles, categoryIconKey, COLOR_CHOICES } from '../category-style.js';
import { categoryIcon, PICKABLE_ICONS } from '../category-icons.js';
import { icon } from '../icons.js';
import { askConfirm } from '../dialog.js';
import { redraw } from '../redraw.js';
import { searchWords, findCandidates } from '../category-match.js';
import { learnFromAssignment } from '../merchant-rules.js';
import { formatRupees, formatDateNice } from '../format.js';
import { showToast } from '../toast.js';
import { displayName } from './transactions.js';

// Your categories: rename them, pick their icon, and say which sits under
// which. Everything happens on this screen rather than in browser prompt
// boxes, which can't show an icon and read as if another site is asking.

// null = nothing open, 'new' = adding, otherwise the id being edited
let editing = null;
// After adding a category: the payments that look like they belong in it,
// waiting for you to check. Nothing is changed until you save.
let review = null;
// The last batch you saved from a review, until you undo it or add another
// it: which payments, and the learned rules as they were before.
let undo = null;
let shownIn = null;

// The phone's back button closes a review or an open form first.
export function onBack() {
  if (!shownIn || !shownIn.isConnected || (!review && editing === null)) return false;
  review = null;
  editing = null;
  redraw(shownIn, () => render(shownIn));
  return true;
}

export async function render(container) {
  shownIn = container;
  const [categories, accounts] = await Promise.all([getAll('categories'), getAll('accounts')]);
  setCustomStyles(categories);
  const topLevel = categories.filter((c) => !c.parentId);
  const childrenOf = (id) => categories.filter((c) => c.parentId === id);
  const editingCat = editing && editing !== 'new' ? categories.find((c) => c.id === editing) : null;

  container.innerHTML = `
    ${review ? reviewPanel(review, accounts) : ''}
    ${undo && !review ? `<div class="totals-card cat-undo"><span>${undo.ids.length} payment${undo.ids.length === 1 ? '' : 's'} now in ${escapeHtml(undo.name)}</span><button type="button" class="link-btn cr-undo">Undo</button></div>` : ''}
    <ul class="cat-list">
      ${topLevel.map((c) => (editingCat && editingCat.id === c.id ? categoryForm(c, topLevel) : renderCatRow(c, childrenOf(c.id), editingCat, topLevel))).join('')}
    </ul>
    ${editing === 'new' ? categoryForm(null, topLevel) : '<button type="button" id="add-cat-btn" class="btn-secondary btn-block">+ Add category</button>'}
  `;

  const addBtn = container.querySelector('#add-cat-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      editing = 'new';
      redraw(container, () => render(container));
    });
  }

  container.querySelectorAll('.cat-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      editing = editing === btn.dataset.id ? null : btn.dataset.id;
      redraw(container, () => render(container));
    });
  });

  // Picking an icon or a colour shows at once in the preview at the top of
  // the form, before anything is saved.
  container.querySelectorAll('.cat-form').forEach((form) => wirePicker(form));

  container.querySelectorAll('.cat-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = form.querySelector('.cf-name').value.trim();
      if (!name) return;
      const id = form.dataset.id;
      const existing = id ? categories.find((c) => c.id === id) : null;
      const saved = {
        ...(existing || {}),
        id: existing ? existing.id : newId(),
        name,
        icon: form.querySelector('.cf-icon').value || null,
        image: form.querySelector('.cf-image').value || null,
        color: form.querySelector('.cf-color').value || null,
        parentId: form.querySelector('.cf-parent').value || null,
      };
      await put('categories', saved);
      setCustomStyles([...categories.filter((c) => c.id !== saved.id), saved]);
      editing = null;
      // A new category: look for the payments it is for, to check before
      // anything is put in it.
      if (!existing) await startReview(saved, '');
      redraw(container, () => render(container));
    });
    const cancel = form.querySelector('.cf-cancel');
    if (cancel) {
      cancel.addEventListener('click', () => {
        editing = null;
        redraw(container, () => render(container));
      });
    }
  });
  wireReview(container);

  container.querySelectorAll('.cat-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const [transactions, rules] = await Promise.all([getAll('transactions'), getAll('merchantRules')]);
      const affected = transactions.filter((t) => t.categoryId === id);
      const children = categories.filter((c) => c.parentId === id);
      const message = [
        affected.length ? `${affected.length} transaction${affected.length === 1 ? '' : 's'} go back to uncategorized.` : '',
        children.length ? `${children.length} sub-categor${children.length === 1 ? 'y' : 'ies'} move up to the top level.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (!(await askConfirm({ title: 'Delete this category?', message, confirmLabel: 'Delete', danger: true }))) return;

      // Clear the dangling reference everywhere, otherwise those transactions
      // read as "Uncategorized" in summaries but never show up in the
      // needs-review list, so they become invisible and unfixable.
      for (const t of affected) {
        t.categoryId = null;
        await put('transactions', t);
      }
      for (const c of children) {
        c.parentId = null;
        await put('categories', c);
      }
      for (const rule of rules.filter((r) => r.categoryId === id)) {
        await remove('merchantRules', rule.id);
      }
      await remove('categories', id);
      editing = null;
      redraw(container, () => render(container));
    });
  });
}

// The form's icon choices: every drawn icon, the colours, and your own
// picture. What is picked sits in three hidden fields until Save.
function categoryForm(cat, topLevel) {
  const style = categoryStyle(cat ? cat.name : '');
  const currentKey = cat ? (cat.icon && cat.icon.startsWith('i:') ? cat.icon.slice(2) : cat.image ? null : categoryIconKey(cat.name)) : 'tag';
  const color = (cat && cat.color) || (cat ? style.color : COLOR_CHOICES[0]);
  const preview = cat ? style.icon : categoryIcon('tag');
  return `
    <form class="totals-card cat-form" ${cat ? `data-id="${cat.id}"` : ''}>
      <div class="cat-preview">
        <span class="cat-chip cat-chip-lg cf-preview" style="--chip-color:${color}">${preview}</span>
        <span class="muted-note">How it looks everywhere</span>
      </div>
      <label class="field">
        <span>Name</span>
        <input type="text" class="cf-name" value="${escapeAttr(cat ? cat.name : '')}" placeholder="e.g. Tiffin" required>
      </label>
      <div class="field">
        <span>Icon</span>
        <div class="icon-grid">
          ${PICKABLE_ICONS.map(
            (k) => `<button type="button" class="icon-choice ${k === currentKey && !(cat && cat.image) ? 'active' : ''}" data-icon="${k}" aria-label="${k}" aria-pressed="${k === currentKey}">${categoryIcon(k)}</button>`
          ).join('')}
        </div>
      </div>
      <div class="field">
        <span>Colour</span>
        <div class="color-row">
          ${COLOR_CHOICES.map(
            (c) => `<button type="button" class="color-choice ${c === color ? 'active' : ''}" data-color="${c}" style="--chip-color:${c}" aria-label="Colour" aria-pressed="${c === color}"></button>`
          ).join('')}
        </div>
      </div>
      <div class="own-picture">
        <label class="own-picture-pick">
          <span class="cat-chip">${icon('image')}</span>
          <span><span class="own-picture-title">${cat && cat.image ? 'Change your picture' : 'Use your own picture'}</span><br><span class="muted-note">A photo or logo from your phone, kept small and round.</span></span>
          <input type="file" class="cf-file" accept="image/*" hidden>
        </label>
        ${cat && cat.image ? '<button type="button" class="link-btn cf-no-image">Use an icon instead</button>' : ''}
        <p class="muted-note cf-file-error out" hidden></p>
      </div>
      <input type="hidden" class="cf-icon" value="${cat && cat.icon ? escapeAttr(cat.icon) : ''}">
      <input type="hidden" class="cf-image" value="${cat && cat.image ? escapeAttr(cat.image) : ''}">
      <input type="hidden" class="cf-color" value="${cat && cat.color ? escapeAttr(cat.color) : ''}">
      <label class="field">
        <span>Sits under <span class="muted">(optional)</span></span>
        <select class="cf-parent">
          <option value="">Nothing, it is a main category</option>
          ${topLevel
            .filter((c) => !cat || c.id !== cat.id)
            .map((c) => `<option value="${c.id}" ${cat && cat.parentId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
            .join('')}
        </select>
      </label>
      <button type="submit" class="btn-primary">${cat ? 'Save' : 'Add category'}</button>
      <button type="button" class="btn-tiny btn-block cf-cancel" style="margin-top:var(--space-xs)">Cancel</button>
    </form>
  `;
}

function wirePicker(form) {
  const preview = form.querySelector('.cf-preview');
  const iconField = form.querySelector('.cf-icon');
  const imageField = form.querySelector('.cf-image');
  const colorField = form.querySelector('.cf-color');
  const error = form.querySelector('.cf-file-error');
  const mark = (selector, chosen) =>
    form.querySelectorAll(selector).forEach((b) => {
      b.classList.toggle('active', b === chosen);
      b.setAttribute('aria-pressed', String(b === chosen));
    });

  form.querySelectorAll('.icon-choice').forEach((btn) =>
    btn.addEventListener('click', () => {
      mark('.icon-choice', btn);
      iconField.value = `i:${btn.dataset.icon}`;
      // An icon picked replaces a picture.
      imageField.value = '';
      preview.innerHTML = categoryIcon(btn.dataset.icon);
    })
  );
  form.querySelectorAll('.color-choice').forEach((btn) =>
    btn.addEventListener('click', () => {
      mark('.color-choice', btn);
      colorField.value = btn.dataset.color;
      preview.style.setProperty('--chip-color', btn.dataset.color);
    })
  );
  const noImage = form.querySelector('.cf-no-image');
  if (noImage) {
    noImage.addEventListener('click', () => {
      imageField.value = '';
      const first = form.querySelector('.icon-choice.active') || form.querySelector('.icon-choice');
      first.click();
      noImage.remove();
    });
  }
  form.querySelector('.cf-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    error.hidden = true;
    if (!file) return;
    try {
      const url = await shrinkPicture(file);
      imageField.value = url;
      iconField.value = '';
      mark('.icon-choice', null);
      preview.innerHTML = `<img class="cat-img" src="${url}" alt="">`;
    } catch {
      error.textContent = "That picture couldn't be read. Try a JPG or PNG.";
      error.hidden = false;
    }
    e.target.value = '';
  });
}

// Your picture, cut to a square from its middle and made small (96 pixels
// across), so it costs almost nothing to store, back up or sync. It is kept
// on this phone with the rest of your data and never sent anywhere else.
async function shrinkPicture(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 96, 96);
  bitmap.close?.();
  let url = canvas.toDataURL('image/webp', 0.85);
  // Older Safari can't write WebP and silently writes PNG instead.
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85);
  return url;
}
function renderCatRow(cat, children, editingCat, topLevel) {
  const { icon: mark, color } = categoryStyle(cat.name);
  return `
    <li class="cat-row">
      <div class="cat-row-main">
        <span class="cat-name"><span class="cat-chip" style="--chip-color:${color}">${mark}</span>${escapeHtml(cat.name)}</span>
        <span class="cat-actions">
          <button type="button" class="icon-btn cat-edit" data-id="${cat.id}">Edit</button>
          <button type="button" class="icon-btn cat-delete" data-id="${cat.id}">Delete</button>
        </span>
      </div>
      ${
        children.length
          ? `<ul class="cat-children">${children
              .map((ch) => (editingCat && editingCat.id === ch.id ? categoryForm(ch, topLevel) : renderCatRow(ch, [], editingCat, topLevel)))
              .join('')}</ul>`
          : ''
      }
    </li>
  `;
}

async function startReview(category, extra) {
  const words = searchWords(category.name, extra);
  const found = findCandidates(await getAll('transactions'), words);
  review = { categoryId: category.id, name: category.name, extra, words, found, ticked: new Set(found.map((t) => t.id)) };
  undo = null;
}

// Most months have a few hundred payments; a list longer than this is a sign
// the words are too loose, and is cut short with a note.
const REVIEW_LIMIT = 300;

function reviewPanel(r, accounts) {
  const label = (id) => accounts.find((a) => a.id === id)?.label || '';
  const shown = r.found.slice(0, REVIEW_LIMIT);
  const ticked = r.found.filter((t) => r.ticked.has(t.id)).length;
  return `
    <div class="totals-card cat-review">
      <p class="cat-review-title">${
        r.found.length
          ? `Found ${r.found.length} payment${r.found.length === 1 ? ' that looks' : 's that look'} like <strong>${escapeHtml(r.name)}</strong>`
          : `No payments mention <strong>${escapeHtml(r.name)}</strong> yet`
      }</p>
      <p class="muted-note">Only payments with no category. Untick any that don't belong.</p>
      <div class="cat-review-find">
        <input type="text" class="cr-words" value="${escapeAttr(r.extra)}" placeholder="Also look for: a name, a shop" aria-label="Also look for">
        <button type="button" class="btn-secondary cr-find">Find</button>
      </div>
      ${
        shown.length
          ? `<div class="cat-review-list">${shown
              .map(
                (t) => `<label class="cat-review-row">
                  <input type="checkbox" class="txn-check cr-tick" data-id="${t.id}" ${r.ticked.has(t.id) ? 'checked' : ''}>
                  <span class="cat-review-text"><span class="hist-name">${escapeHtml(displayName(t.rawDescription))}</span><span class="hist-sub">${formatDateNice(t.date)} · ${escapeHtml(label(t.accountId))}</span></span>
                  <span class="${t.direction === 'credit' ? 'in' : 'out'}">${t.direction === 'credit' ? '+' : '−'}${formatRupees(t.amount)}</span>
                </label>`
              )
              .join('')}</div>`
          : ''
      }
      ${r.found.length > REVIEW_LIMIT ? `<p class="muted-note">Showing the latest ${REVIEW_LIMIT}. Add a more exact word to narrow it down.</p>` : ''}
      ${r.found.length ? `<button type="button" class="btn-primary cr-save" ${ticked ? '' : 'disabled'}>Put ${ticked} in ${escapeHtml(r.name)}</button>` : ''}
      <button type="button" class="btn-tiny btn-block cr-skip">${r.found.length ? 'Not now' : 'Done'}</button>
    </div>`;
}

function wireReview(container) {
  const again = () => redraw(container, () => render(container));
  container.querySelectorAll('.cr-tick').forEach((box) =>
    box.addEventListener('change', () => {
      if (box.checked) review.ticked.add(box.dataset.id);
      else review.ticked.delete(box.dataset.id);
      const n = review.found.filter((t) => review.ticked.has(t.id)).length;
      const save = container.querySelector('.cr-save');
      save.textContent = `Put ${n} in ${review.name}`;
      save.disabled = n === 0;
    })
  );
  const find = container.querySelector('.cr-find');
  if (find) {
    const words = container.querySelector('.cr-words');
    const run = async () => {
      const categories = await getAll('categories');
      const cat = categories.find((c) => c.id === review.categoryId);
      if (cat) await startReview(cat, words.value.trim());
      again();
    };
    find.addEventListener('click', run);
    words.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    });
  }
  const skip = container.querySelector('.cr-skip');
  if (skip) {
    skip.addEventListener('click', () => {
      review = null;
      again();
    });
  }
  const save = container.querySelector('.cr-save');
  if (save) {
    save.addEventListener('click', async () => {
      const r = review;
      const rulesBefore = await getAll('merchantRules');
      const all = await getAll('transactions');
      const ids = [];
      for (const t of all) {
        // Checked again at the moment of saving: a sync may have given one a
        // category since the list was made, and that one is left alone.
        if (!r.ticked.has(t.id) || t.categoryId || t.isTransfer) continue;
        await put('transactions', { ...t, categoryId: r.categoryId });
        await learnFromAssignment(t.rawDescription, r.categoryId);
        ids.push(t.id);
      }
      undo = { ids, categoryId: r.categoryId, name: r.name, rulesBefore };
      review = null;
      showToast(`${ids.length} put in ${r.name}`);
      again();
    });
  }
  const undoBtn = container.querySelector('.cr-undo');
  if (undoBtn) {
    undoBtn.addEventListener('click', async () => {
      const u = undo;
      const all = await getAll('transactions');
      let n = 0;
      for (const t of all) {
        // Only what that save did: a payment you have since moved elsewhere
        // keeps its new category.
        if (!u.ids.includes(t.id) || t.categoryId !== u.categoryId) continue;
        await put('transactions', { ...t, categoryId: null });
        n++;
      }
      // What the app learned from the save goes too, so future imports aren't
      // sorted by a batch you took back.
      const before = new Map(u.rulesBefore.map((rule) => [rule.id, rule]));
      for (const rule of await getAll('merchantRules')) {
        const old = before.get(rule.id);
        if (!old) await remove('merchantRules', rule.id);
        else if (old.categoryId !== rule.categoryId || old.hitCount !== rule.hitCount) await put('merchantRules', old);
      }
      undo = null;
      showToast(`${n} taken back out of ${u.name}`);
      again();
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}
