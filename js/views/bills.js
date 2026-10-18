import { getAll, put, remove, newId } from '../db.js';
import { formatRupees } from '../format.js';
import { isoLocal } from '../frequency.js';
import { isFixed } from '../commitments.js';
import { activeSpace, commitmentInSpace } from '../business.js';
import { categoryStyle } from '../category-style.js';
import { sortAccounts } from '../list-order.js';
import { redraw } from '../redraw.js';
import { askConfirm } from '../dialog.js';
import { showToast } from '../toast.js';
import { escapeHtml, escapeAttr, sectionHead } from '../ui.js';
import { isOneTime, buildBill, markBillPaid, billState, settleBills } from '../bills.js';

// One-time bills (5.85): a payment due on one date that does not repeat. See js/bills.js. A bill is held out of Left to spend in the
// month it is due and nothing is held in the others; a payment found for it ends it. Everything stays on the phone.

let mode = 'list';
let editId = null;
let host = null;

const todayIso = () => isoLocal(new Date());
const selected = (a, b) => (a === b ? 'selected' : '');
const rupeesText = (paise) => (paise ? (paise / 100).toFixed(2).replace(/\.00$/, '') : '');

function rowHtml(r, today) {
  const { icon: mark, color } = categoryStyle(r.label);
  const s = billState(r, today);
  return `<button type="button" class="k-row bill-row" data-id="${r.id}">
    <span class="k-icon" style="--k-tint:${color}">${mark}</span>
    <span class="k-row__body"><span class="k-row__title">${escapeHtml(r.label)}</span><span class="k-row__meta bill-meta is-${s.tone}">${escapeHtml(s.text)}</span></span>
    <span class="k-row__value">${formatRupees(r.amount)}</span>
  </button>`;
}

function listHtml(open, paid, today) {
  const intro = `<p class="muted-note">A payment that is due once: a school fee, a repair, a trip balance, a supplier's invoice. Add it with its date. It is held out of Left to spend in the month it is due, and you are reminded before.</p>`;
  if (!open.length && !paid.length) return `${intro}<button type="button" class="btn-primary" id="bill-add">Add a bill</button>`;
  const owed = open.reduce((t, r) => t + r.amount, 0);
  return `${
    open.length
      ? `<div class="totals-card bill-list">
      <div class="k-row bill-total"><span class="k-row__body"><span class="k-row__title">${open.length} to pay</span></span><span class="k-row__value">${formatRupees(owed)}</span></div>
      ${open.map((r) => rowHtml(r, today)).join('')}
    </div>`
      : intro
  }
    <button type="button" class="btn-primary" id="bill-add">Add a bill</button>
    ${
      paid.length
        ? `<details class="section-fold bill-paid"><summary>Paid (${paid.length})</summary><div class="totals-card">${paid.map((r) => rowHtml(r, today)).join('')}</div></details>`
        : ''
    }`;
}

function formHtml(item, accounts) {
  const o = item && item.once;
  return `${sectionHead(item ? 'Edit bill' : 'Add a bill')}
    <form class="bill-form" autocomplete="off">
      <label class="field"><span>What it is for</span>
        <input type="text" class="bf-label" placeholder="School admission" value="${escapeAttr((item && item.label) || '')}" required>
      </label>
      <label class="field"><span>Amount</span>
        <input type="number" class="bf-amount" inputmode="decimal" step="0.01" min="0.01" placeholder="12000" value="${rupeesText(item && item.amount)}" required>
      </label>
      <label class="field"><span>Due on</span>
        <input type="date" class="bf-due" value="${escapeAttr((o && o.dueOn) || '')}" required>
      </label>
      <label class="field"><span>Paid from</span>
        <select class="bf-account"><option value="">Any bank account</option>
          <option value="cash" ${selected('cash', item && item.accountId)}>Cash (from your ATM money)</option>
          ${sortAccounts(accounts).filter((a) => a.type === 'bank' || a.type === 'card').map((a) => `<option value="${a.id}" ${selected(a.id, item && item.accountId)}>${escapeHtml(a.label)}</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Its line on the bank statement contains <span class="muted">(optional, so the payment is found by itself)</span></span>
        <input type="text" class="bf-match" spellcheck="false" placeholder="SCHOOL" value="${escapeAttr((item && item.matchText) || '')}">
      </label>
      <button type="submit" class="btn-primary">${item ? 'Save' : 'Add'}</button>
      ${item && !o.paidOn ? '<button type="button" class="btn-secondary btn-block bf-paid" style="margin-top:var(--space-xs)">Mark as paid</button>' : ''}
      <button type="button" class="btn-tiny bf-cancel btn-block" style="margin-top:var(--space-xs)">Cancel</button>
      ${item ? '<button type="button" class="btn-tiny bf-remove btn-block" style="margin-top:var(--space-xs);color:var(--out)">Remove this bill</button>' : ''}
    </form>`;
}

const again = (container) => redraw(container, () => render(container));

// `params` is an object when the screen is opened (a tap, the back arrow) and undefined when it redraws itself, which must keep what is open.
export async function render(container, params) {
  host = container;
  if (params) {
    editId = params.open || null;
    mode = params.open || params.add ? 'form' : 'list';
  }
  await settleBills();
  const [recurring, accounts, space] = await Promise.all([getAll('recurring'), getAll('accounts'), activeSpace()]);
  const today = todayIso();
  const inLane = commitmentInSpace(space);
  const all = recurring.filter((r) => isOneTime(r) && isFixed(r) && r.active !== false && inLane(r));
  const open = all.filter((r) => !r.once.paidOn).sort((a, b) => (a.once.dueOn < b.once.dueOn ? -1 : 1));
  const paid = all.filter((r) => r.once.paidOn).sort((a, b) => (a.once.paidOn < b.once.paidOn ? 1 : -1)).slice(0, 12);
  const item = editId ? all.find((r) => r.id === editId) : null;
  if (mode === 'form' && editId && !item) {
    mode = 'list';
    editId = null;
  }
  container.innerHTML = `<div class="bills">${mode === 'form' ? formHtml(item, accounts) : listHtml(open, paid, today)}</div>`;

  container.querySelector('#bill-add')?.addEventListener('click', () => {
    editId = null;
    mode = 'form';
    again(container);
  });
  container.querySelectorAll('.bill-row').forEach((btn) =>
    btn.addEventListener('click', () => {
      editId = btn.dataset.id;
      mode = 'form';
      again(container);
    })
  );
  const form = container.querySelector('.bill-form');
  if (!form) return;
  const q = (s) => form.querySelector(s);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rec = buildBill({
      existing: item,
      id: `fixed-${newId()}`,
      space: space === 'home' ? null : space,
      fields: { label: q('.bf-label').value, amount: q('.bf-amount').value, dueOn: q('.bf-due').value, accountId: q('.bf-account').value, matchText: q('.bf-match').value },
    });
    if (!rec) {
      showToast('Add what it is for, the amount and the date');
      return;
    }
    await put('recurring', rec);
    editId = null;
    mode = 'list';
    again(container);
  });
  q('.bf-cancel').addEventListener('click', () => {
    editId = null;
    mode = 'list';
    again(container);
  });
  q('.bf-paid')?.addEventListener('click', async () => {
    const ok = await askConfirm({
      title: 'Paid?',
      message: `${item.label}: ${formatRupees(item.amount)}. It stops being held out of Left to spend after this month. If the payment is not in Kawach yet, add it from Add so your balance moves.`,
      confirmLabel: 'Yes, paid',
    });
    if (!ok) return;
    await put('recurring', markBillPaid(item, todayIso()));
    showToast('Marked as paid');
    editId = null;
    mode = 'list';
    again(container);
  });
  q('.bf-remove')?.addEventListener('click', async () => {
    const ok = await askConfirm({ title: 'Remove this bill?', message: `"${item.label}" is taken off your plan. A payment already saved is not touched.`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    await remove('recurring', item.id);
    editId = null;
    mode = 'list';
    again(container);
  });
}

// Back closes the form before it leaves the screen (app.js asks).
export function onBack() {
  if (mode === 'list') return false;
  mode = 'list';
  editId = null;
  if (host) again(host);
  return true;
}
