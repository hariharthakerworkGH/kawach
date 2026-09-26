import { getAll, put, remove, newId } from '../db.js';
import { formatCurrency, formatDateNice, formatMonthYear, formatRupees, ordinal } from '../format.js';
import { bankBalance, cardCycleSpend, cardBillDue, cardPosition, statementDay, isPutAway } from '../account-metrics.js';
import { loanPosition, loanPayments, paymentsFor, payFasterPlan, loanHistory, isLoanAccount } from '../loans.js';
import { askConfirm } from '../dialog.js';
import { pfPosition, pfContribution, DEFAULT_PF_RATE } from '../pf.js';
import { isoLocal } from '../frequency.js';
import { findDuplicates } from '../duplicates.js';
import { byYourOrder } from '../commitments.js';
import { redraw } from '../redraw.js';
import { ensureBusinessCategories, moneyProfile, activeSpace, accountInSpace } from '../business.js';
import { detectTransfers } from '../transfers.js';
import { icon } from '../icons.js';
import { brandMark } from '../brand.js';
import { allocationRing } from '../charts.js';
import { displayName } from './transactions.js';
import { escapeHtml, escapeAttr, emptyState, hero, moneyTone } from '../ui.js';

// null = form closed, 'new' = adding, otherwise the id being edited
let editing = null;
// The extra monthly payment picked in a loan's planner, per loan, while the
// app is open, so a redraw keeps your choice.
const loanExtra = {};
// Arrows for putting the accounts in the order you want them.
let reordering = false;
// Account names by id, so a loan can say which account it watches by name.
let accountLabels = new Map();
// Fixed deposits by the savings account they were opened from, shown inside
// that account's card rather than as cards of their own.
let depositsOf = new Map();

let shownIn = null;
// Who is using the app (js/business.js): the form offers what fits them.
// The savings Indian households actually keep.
const SAVINGS_KINDS = ['FD', 'RD', 'PPF', 'NPS', 'Sukanya Samriddhi', 'LIC or insurance', 'Gold', 'Mutual fund or SIP', 'Chit fund', 'Other'];

let profile = { main: 'salary', business: false, businesses: [] };
// The lane on screen: Home or a business. Only its accounts are listed, and
// a new account belongs to it.
let space = 'home';
// Accounts opened to show their latest payments, kept while the app is open
// so a redraw (Edit, Reorder, a sync) doesn't fold them shut.
const opened = new Set();

// The phone's back button closes an open form (or reordering) first, before
// it leaves the screen.
export function onBack() {
  if (!shownIn || !shownIn.isConnected || (editing === null && !reordering)) return false;
  editing = null;
  reordering = false;
  redraw(shownIn, () => render(shownIn));
  return true;
}

export async function render(container) {
  shownIn = container;
  const [accounts, allTransactions, importBatches, who] = await Promise.all([getAll('accounts'), getAll('transactions'), getAll('importBatches'), moneyProfile()]);
  profile = { ...who, hasPf: accounts.some((a) => a.type === 'pf') };
  space = await activeSpace();
  // Copies saved by overlapping statement imports are left out of every
  // balance here, the same as on the Summary.
  const duplicateIds = new Set(findDuplicates(allTransactions).map((t) => t.id));
  const transactions = duplicateIds.size ? allTransactions.filter((t) => !duplicateIds.has(t.id)) : allTransactions;

  accountLabels = new Map(accounts.map((a) => [a.id, a.label]));
  const ids = new Set(accounts.map((a) => a.id));
  const isInsideParent = (a) => a.depositOf && ids.has(a.depositOf);
  depositsOf = new Map();
  for (const a of accounts.filter(isInsideParent)) depositsOf.set(a.depositOf, [...(depositsOf.get(a.depositOf) || []), a]);
  const groups = { cash: [], bank: [], card: [], savings: [], loan: [], pf: [] };
  // In the order you arranged them, new ones last.
  for (const a of [...accounts].sort(byYourOrder)) {
    if (isInsideParent(a) || !accountInSpace(space)(a)) continue;
    (groups[groupOf(a)] || (groups[groupOf(a)] = [])).push(a);
  }

  const editingAccount = editing && editing !== 'new' ? accounts.find((a) => a.id === editing) : null;
  // Nothing set up yet, and not in the middle of adding the first one.
  const showEmpty = accounts.length === 0 && editing !== 'new';

  container.classList.add('k');
  container.innerHTML = `
    <div class="accounts-actions accounts-actions--top">
      ${
        showEmpty
          ? ''
          : `<button type="button" id="add-account-btn" class="k-btn k-btn--secondary">${editing === 'new' ? 'Cancel' : 'Add an account'}</button>`
      }
      <button type="button" id="go-import-btn" class="k-btn k-btn--ghost">Import a statement</button>
      ${accounts.length > 1 ? `<button type="button" id="accounts-reorder" class="k-btn k-btn--ghost">${reordering ? 'Done' : 'Reorder'}</button>` : ''}
    </div>
    ${accountsTotal(groups, transactions)}
    ${editing === 'new' ? accountForm(null, transactions, accounts) : ''}
    ${
      showEmpty
        ? emptyState({
            what: 'No accounts yet.',
            why: 'Add the account your salary lands in first: balances, budgets and everything else follow from it.',
            action: { label: 'Add an account', id: 'empty-add-account' },
          })
        : ''
    }
    ${renderGroup('Cards', groups.card, transactions, importBatches, editingAccount, accounts)}
    ${renderGroup('Cash', groups.cash, transactions, importBatches, editingAccount, accounts)}
    ${renderGroup('Bank', groups.bank, transactions, importBatches, editingAccount, accounts)}
    ${renderGroup('Loans', groups.loan, transactions, importBatches, editingAccount, accounts)}
    ${renderGroup('Savings and FDs', groups.savings, transactions, importBatches, editingAccount, accounts)}
    ${renderGroup('Provident fund', groups.pf, transactions, importBatches, editingAccount, accounts)}

  `;

  const openAdd = () => {
    editing = editing === 'new' ? null : 'new';
    redraw(container, () => render(container));
  };
  const emptyAdd = container.querySelector('#empty-add-account');
  if (emptyAdd) emptyAdd.addEventListener('click', openAdd);
  container.querySelectorAll('#go-import-btn, .account-go-import').forEach((btn) =>
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'import' } }));
    })
  );

  container.querySelectorAll('.account-open').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (opened.has(btn.dataset.id)) opened.delete(btn.dataset.id);
      else opened.add(btn.dataset.id);
      redraw(container, () => render(container));
    })
  );
  container.querySelectorAll('.account-see-all').forEach((btn) =>
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', accountId: btn.dataset.id } }));
    })
  );

  // Absent while the empty state is showing, which is the one time it would
  // be saying the same thing twice.
  const addBtn = container.querySelector('#add-account-btn');
  if (addBtn) addBtn.addEventListener('click', openAdd);

  const reorderBtn = container.querySelector('#accounts-reorder');
  if (reorderBtn) {
    reorderBtn.addEventListener('click', () => {
      reordering = !reordering;
      // Rearranging and editing at once would be two forms of the same card
      // open together, so opening one closes the other.
      if (reordering) editing = null;
      redraw(container, () => render(container));
    });
  }

  // Up and down inside one group. Only accounts of the same kind swap places:
  // moving a card above a bank account would just break the grouping.
  container.querySelectorAll('.account-shift').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const me = accounts.find((a) => a.id === btn.dataset.id);
      const group = (groups[groupOf(me)] || []).slice();
      const at = group.findIndex((a) => a.id === me.id);
      const to = at + Number(btn.dataset.step);
      if (at < 0 || to < 0 || to >= group.length) return;
      group.splice(to, 0, group.splice(at, 1)[0]);
      // The whole group is renumbered, so accounts that never had an order
      // (everything until the first time this is used) get one now.
      for (let i = 0; i < group.length; i++) {
        if (group[i].sortOrder !== i) await put('accounts', { ...group[i], sortOrder: i });
      }
      redraw(container, () => render(container));
    });
  });

  container.querySelectorAll('.account-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      editing = editing === btn.dataset.id ? null : btn.dataset.id;
      redraw(container, () => render(container));
    });
  });

  container.querySelectorAll('.account-form').forEach((form) => wireForm(form, container, accounts, transactions));

  container.querySelectorAll('.bill-toggle-paid').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const account = accounts.find((a) => a.id === btn.dataset.id);
      account.statementDuePaid = !account.statementDuePaid;
      await put('accounts', account);
      redraw(container, () => render(container));
    });
  });

  // Adding a month's pay to a provident fund by hand.
  container.querySelectorAll('.pf-month-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const month = form.querySelector('.pf-month').value;
      const rupees = parseFloat(form.querySelector('.pf-basic').value);
      if (!month || !Number.isFinite(rupees) || rupees <= 0) return;
      const basic = Math.round(rupees * 100);
      const account = (await getAll('accounts')).find((a) => a.id === form.dataset.id);
      const share = pfContribution(basic, account.pf || {});
      await put('accounts', { ...account, pf: { ...(account.pf || {}), basic, monthlyIntoFund: share.intoFund } });
      const existing = (await getAll('transactions')).find((t) => t.accountId === account.id && t.date.slice(0, 7) === month);
      const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
      await put('transactions', {
        id: existing ? existing.id : newId(),
        accountId: account.id,
        date: `${month}-${lastDay}`,
        rawDescription: `PF · ${month}`,
        amount: share.intoFund,
        direction: 'credit',
        categoryId: null,
        source: 'manual',
        importBatchId: null,
        isTransfer: true,
        notes: null,
      });
      redraw(container, () => render(container));
    });
  });
  // Pay it off faster: a tap or a typed amount changes only the planner's own
  // figures, so the keyboard stays open and nothing else on the screen moves.
  container.querySelectorAll('.loan-planner').forEach((planner) => {
    const account = accounts.find((a) => a.id === planner.dataset.id);
    const position = loanPosition(account, transactions, isoLocal(new Date()), accounts.filter(isLoanAccount));
    const other = planner.querySelector('.plan-other-input');
    const show = (extra) => {
      loanExtra[account.id] = extra;
      planner.querySelector('.plan-result').innerHTML = planResult(account, position, extra);
    };
    planner.querySelectorAll('.plan-chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        // Tapping the amount already picked lets it go again, back to the
        // loan as it is.
        if (chip.classList.contains('on')) {
          chip.classList.remove('on');
          chip.setAttribute('aria-pressed', 'false');
          other.hidden = true;
          show(0);
          return;
        }
        planner.querySelectorAll('.plan-chip').forEach((c) => {
          c.classList.toggle('on', c === chip);
          c.setAttribute('aria-pressed', String(c === chip));
        });
        if (chip.dataset.amount === 'other') {
          other.hidden = false;
          other.focus();
          const rupees = parseFloat(other.value);
          show(Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0);
        } else {
          other.hidden = true;
          show(Number(chip.dataset.amount));
        }
      })
    );
    other.addEventListener('input', () => {
      const rupees = parseFloat(other.value);
      show(Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0);
    });
  });

  container.querySelectorAll('.account-add-expense').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'add', accountId: btn.dataset.id } }));
    });
  });
}

// A card's cycle is never typed in: a day typed wrong (26 for a cycle that
// closes on the 25th) put every spend in the wrong month. It is read from
// the card's statements, and a card with none yet gets one from the first.
// A day typed in by an older version is still used until then.
function cycleNote(account, importBatches) {
  const fromStatement = account && importBatches.some((b) => b.accountId === account.id && !b.provisional && b.periodEnd);
  const day = account ? statementDay(account, importBatches) : null;
  if (fromStatement && day) return `Statement on the ${ordinal(day)}, read from its statements.`;
  if (day) return `Statement on the ${ordinal(day)} for now. Its first statement will confirm it.`;
  return 'Read from its first statement when you import it.';
}

function accountForm(account, transactions, allAccounts = [], importBatches = []) {
  const a = account || { label: '', type: 'card', issuer: '', last4: '', billingCycleDay: '' };
  const payFromOptions = allAccounts.filter((x) => ['bank', 'savings'].includes(x.type));
  const txnCount = account ? transactions.filter((t) => t.accountId === account.id).length : 0;
  return `
    <form class="totals-card account-form" data-id="${account ? account.id : ''}">
      <label class="field">
        <span>Name</span>
        <input type="text" class="af-label" value="${escapeAttr(a.label)}" placeholder="e.g. HDFC Swiggy Card" required>
      </label>
      <div class="field">
        <span>Type</span>
        <div class="segmented af-type-group">
          ${[
            ['bank', 'Bank'],
            ['card', 'Card'],
            ['cash', 'Cash'],
            ['savings', 'Savings / FD'],
            ['pf', 'Provident fund'],
            ['loan', 'Loan'],
          ]
            // A provident fund comes with a salary.
            .filter(([t]) => t !== 'pf' || profile.main === 'salary' || profile.hasPf)
            .map(
              ([t, labelText]) =>
                `<button type="button" class="seg-btn af-type ${a.type === t ? 'active' : ''}" data-type="${t}">${labelText}</button>`
            )
            .join('')}
        </div>
      </div>
      <label class="field">
        <span>Bank / issuer <span class="muted">(optional)</span></span>
        <input type="text" class="af-issuer" value="${escapeAttr(a.issuer || '')}" placeholder="e.g. HDFC Bank">
      </label>
      <label class="field">
        <span>Last 4 digits <span class="muted">(optional)</span></span>
        <input type="text" class="af-last4" value="${escapeAttr(a.last4 || '')}" inputmode="numeric" maxlength="4" placeholder="4321">
      </label>
      <p class="muted-note">Bank and last 4 digits match it to its statements.</p>
      <label class="checkbox-row af-spending-field" ${a.type === 'bank' ? '' : 'hidden'}>
        <input type="checkbox" class="af-spending" ${a.spending === false ? '' : 'checked'}>
        <span>I spend from this account<br><span class="muted-note">Off for savings or loan-only accounts: nothing from it counts as spending.</span></span>
      </label>
      ${
        profile.businesses.length
          ? `<label class="field af-business-field" ${['bank', 'card', 'cash'].includes(a.type) ? '' : 'hidden'}>
              <span>Belongs to</span>
              <select class="af-space">
                ${[{ id: 'home', name: 'Home' }, ...profile.businesses]
                  .map((sp) => {
                    const chosen = account ? (a.business ? a.space : 'home') : space;
                    return `<option value="${escapeAttr(sp.id)}" ${sp.id === chosen ? 'selected' : ''}>${escapeHtml(sp.name)}</option>`;
                  })
                  .join('')}
              </select>
            </label>`
          : ''
      }
      <div class="field af-cycle-field" ${a.type === 'card' ? '' : 'hidden'}>
        <span>Billing cycle</span>
        <span class="muted-note">${cycleNote(account, importBatches)}</span>
      </div>
      <div class="af-savings-fields" ${a.type === 'savings' ? '' : 'hidden'}>
        <label class="field">
          <span>Kind</span>
          <select class="af-savings-kind">
            ${SAVINGS_KINDS.map((k) => `<option ${a.savingsKind === k ? 'selected' : ''}>${k}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Value now <span class="muted">(PPF, gold and the rest have no statement)</span></span>
          <input type="number" class="af-savings-value" inputmode="decimal" min="0" step="1" value="${a.type === 'savings' && a.knownBalance ? Math.round(a.knownBalance / 100) : ''}" placeholder="250000">
        </label>
      </div>
      <div class="af-pf-fields" ${a.type === 'pf' ? '' : 'hidden'}>
        <label class="field">
          <span>Balance already in the fund <span class="muted">(from your EPFO passbook)</span></span>
          <input type="number" class="af-pf-opening" inputmode="decimal" min="0" step="1" value="${a.knownBalance ? Math.round(a.knownBalance / 100) : ''}" placeholder="450000">
        </label>
        <label class="field">
          <span>As of</span>
          <input type="month" class="af-pf-asof" value="${a.knownBalanceDate ? a.knownBalanceDate.slice(0, 7) : ''}">
        </label>
        <label class="field">
          <span>Interest rate <span class="muted">(% a year, set by EPFO)</span></span>
          <input type="number" class="af-pf-rate" inputmode="decimal" min="0" step="0.05" value="${a.pf?.ratePct ?? ''}" placeholder="8.25">
        </label>
        <label class="field">
          <span>UAN <span class="muted">(optional)</span></span>
          <input type="text" class="af-pf-uan" value="${escapeAttr(a.pf?.uan || '')}" inputmode="numeric">
        </label>
        <label class="checkbox-row">
          <input type="checkbox" class="af-pf-assume" ${a.pf?.assumeMonthly === false ? '' : 'checked'}>
          <span>Assume the same goes in each month<br><span class="muted-note">Until a payslip says otherwise. Turn off to count only the months you have added.</span></span>
        </label>
      </div>      <div class="af-loan-fields" ${a.type === 'loan' ? '' : 'hidden'}>
        <label class="field">
          <span>Amount borrowed</span>
          <input type="number" class="af-principal" inputmode="decimal" min="0" step="1" value="${a.loan?.principal ? Math.round(a.loan.principal / 100) : ''}" placeholder="5000000">
        </label>
        <label class="field">
          <span>Interest rate <span class="muted">(% a year)</span></span>
          <input type="number" class="af-rate" inputmode="decimal" min="0" step="0.01" value="${a.loan?.ratePct ?? ''}" placeholder="8.5">
        </label>
        <label class="field">
          <span>EMI</span>
          <input type="number" class="af-emi" inputmode="decimal" min="0" step="1" value="${a.loan?.emi ? Math.round(a.loan.emi / 100) : ''}" placeholder="68000">
        </label>
        <label class="field">
          <span>Day it goes out</span>
          <input type="number" class="af-emi-day" inputmode="numeric" min="1" max="31" value="${a.loan?.day || ''}" placeholder="15">
        </label>
        <label class="field">
          <span>Paid from</span>
          <select class="af-paid-from">
            <option value="">Pick the account</option>
            ${payFromOptions.map((p) => `<option value="${p.id}" ${a.loan?.paidFromId === p.id ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>First EMI <span class="muted">(optional)</span></span>
          <input type="month" class="af-start" value="${a.loan?.startMonth || ''}">
        </label>
        <label class="field">
          <span>Total EMIs <span class="muted">(optional)</span></span>
          <input type="number" class="af-total-emis" inputmode="numeric" min="1" step="1" value="${a.loan?.totalEmis || ''}" placeholder="240">
        </label>
        <label class="checkbox-row">
          <input type="checkbox" class="af-loan-in-budget" ${a.loan?.inBudget === false ? '' : 'checked'}>
          <span>Count this EMI in my monthly budget<br><span class="muted-note">Off if Plan already has it as a commitment.</span></span>
        </label>
      </div>
      <button type="submit" class="btn-primary">${account ? 'Save changes' : 'Add account'}</button>
      <p class="af-error status" hidden></p>
      ${
        account
          ? `<button type="button" class="btn-tiny danger account-delete" data-id="${account.id}">Delete this account${txnCount ? ` and its ${txnCount} transaction${txnCount === 1 ? '' : 's'}` : ''}</button>`
          : ''
      }
    </form>
  `;
}

function wireForm(form, container, accounts, transactions) {
  const cycleField = form.querySelector('.af-cycle-field');
  const spendingField = form.querySelector('.af-spending-field');
  const businessField = form.querySelector('.af-business-field');
  const loanFields = form.querySelector('.af-loan-fields');
  const pfFields = form.querySelector('.af-pf-fields');
  const savingsFields = form.querySelector('.af-savings-fields');
  let type = form.querySelector('.af-type.active')?.dataset.type || 'card';

  form.querySelectorAll('.af-type').forEach((btn) => {
    btn.addEventListener('click', () => {
      type = btn.dataset.type;
      form.querySelectorAll('.af-type').forEach((b) => b.classList.toggle('active', b === btn));
      cycleField.hidden = type !== 'card';
      spendingField.hidden = type !== 'bank';
      if (businessField) businessField.hidden = !['bank', 'card', 'cash'].includes(type);
      loanFields.hidden = type !== 'loan';
      pfFields.hidden = type !== 'pf';
      savingsFields.hidden = type !== 'savings';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = form.querySelector('.af-error');
    const label = form.querySelector('.af-label').value.trim();
    if (!label) {
      errorEl.hidden = false;
      errorEl.textContent = 'Give the account a name.';
      errorEl.classList.add('out');
      return;
    }

    const last4 = form.querySelector('.af-last4').value.trim();
    if (last4 && !/^\d{4}$/.test(last4)) {
      errorEl.hidden = false;
      errorEl.textContent = 'Last 4 digits should be exactly four numbers, or left blank.';
      errorEl.classList.add('out');
      return;
    }

    const id = form.dataset.id;
    const existing = id ? accounts.find((a) => a.id === id) : null;
    const account = {
      ...(existing || {}),
      id: existing ? existing.id : newId(),
      label,
      type,
      issuer: form.querySelector('.af-issuer').value.trim() || null,
      last4: last4 || null,
      // Kept as it was: the cycle comes from statements, not from this form.
      billingCycleDay: type === 'card' ? existing?.billingCycleDay ?? null : null,
      // Stored only when turned off, so every bank account from before this
      // setting existed stays an everyday account.
      spending: type === 'bank' && !form.querySelector('.af-spending').checked ? false : undefined,
      // Merged over what is already there, never swapped for it: the form
      // shows only what you can type, and the statement puts more on the loan
      // than that - what is owed and on which date, the bank's own EMI. Saving
      // the form used to replace the whole loan, which wiped what was owed and
      // left the app working it out from the full amount borrowed instead.
      loan: type === 'loan' ? { ...(existing?.loan || {}), ...readLoanFields(form) } : undefined,
      ...(type === 'pf' ? readPfFields(form, existing) : {}),
      ...(type === 'savings' ? readSavingsFields(form, existing) : {}),
    };
    // Home, or the business it belongs to.
    const belongs = ['bank', 'card', 'cash'].includes(type) ? form.querySelector('.af-space')?.value || (account.business ? account.space : 'home') : 'home';
    if (belongs === 'home') {
      delete account.business;
      delete account.space;
    } else {
      account.business = true;
      account.space = belongs;
    }
    await put('accounts', account);
    // A business account needs business categories, and the money already
    // moved between it and a home account needs recognising as moved.
    if (account.business) {
      await ensureBusinessCategories();
      if (!existing?.business) await detectTransfers();
    }
    editing = null;
    redraw(container, () => render(container));
  });

  const deleteBtn = form.querySelector('.account-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const id = deleteBtn.dataset.id;
      // Every record on the account, read fresh so duplicate copies (left out
      // of the balances on this screen) are deleted too.
      const affected = (await getAll('transactions')).filter((t) => t.accountId === id);
      const ok = await askConfirm({
        title: 'Delete this account?',
        message: `${affected.length} transaction${affected.length === 1 ? '' : 's'} on it are deleted too. This cannot be undone, so take a backup first if you are unsure.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;

      for (const t of affected) await remove('transactions', t.id);
      const batches = await getAll('importBatches');
      for (const b of batches.filter((b) => b.accountId === id)) await remove('importBatches', b.id);
      await remove('accounts', id);
      editing = null;
      redraw(container, () => render(container));
    });
  }
}

// One account per row, full width. Two side by side was tried and read as
// cramped: at half a phone's width every name and figure had to shrink or wrap.
// A group is a quiet label and a list of rows on one surface. It used to be
// a heading and a box per account, which made five accounts read as five
// separate things rather than as one list of where the money is.
function renderGroup(title, accounts, transactions, importBatches, editingAccount, allAccounts) {
  if (!accounts || accounts.length === 0) return '';
  return `
    <section class="account-group-sec">
      <h3 class="account-group-label">${title}</h3>
      <div class="account-group k-pane k-pane--quiet">
      ${accounts
        .map((a, i) =>
          editingAccount && editingAccount.id === a.id
            ? accountForm(a, transactions, allAccounts, importBatches)
            : accountCard(a, transactions, importBatches, allAccounts.filter(isLoanAccount), { index: i, count: accounts.length })
        )
        .join('')}
      </div>
    </section>
  `;
}

/* One account, as one row.
 *
 * Whoever it is on the left, what it is underneath, what is in it on the
 * right. The balance is the biggest thing in the row because it is the
 * reason a person opened this screen.
 *
 * `openable` rows are a button: tapping opens the latest payments and the
 * row's own actions. A row that is not openable carries its actions in the
 * detail below it, which those types show anyway.
 */
function accountRow(account, { meta = '', value = '', tone = '', canOpen = false, place = {} }) {
  const open = opened.has(account.id);
  // The bank's own name if we know it, otherwise what the account is called.
  // brandMark() is the resolver from phase 9C: a licensed file, a category
  // icon, or a monogram. Nothing here draws a bank's logo.
  const mark = brandMark(account.issuer || account.label, { size: 'md' });
  const body = `
      ${mark}
      <span class="k-row__body">
        <span class="k-row__title" title="${escapeAttr(account.label)}">${escapeHtml(account.label)}</span>
        ${meta ? `<span class="k-row__meta">${meta}</span>` : ''}
      </span>`;

  // Rearranging: the arrows take the place of the balance, because a row
  // cannot hold a button inside a button.
  if (reordering) {
    return `
      <div class="k-row account-row account-row--move">
        ${body}
        <span class="account-move">
          <button type="button" class="icon-btn account-shift" data-id="${account.id}" data-step="-1" aria-label="Move ${escapeAttr(account.label)} up" ${place.index === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button type="button" class="icon-btn account-shift" data-id="${account.id}" data-step="1" aria-label="Move ${escapeAttr(account.label)} down" ${place.index === place.count - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
        </span>
      </div>`;
  }

  const figure = `<span class="k-row__value account-balance ${tone}">${value}</span>`;
  if (!canOpen) return `<div class="k-row account-row">${body}${figure}</div>`;
  return `
    <button type="button" class="k-row account-row account-open" data-id="${account.id}" aria-expanded="${open}">
      ${body}${figure}
      <span class="account-row__chev" aria-hidden="true"></span>
    </button>`;
}

// What you can do to an account, kept out of the row so the row stays a
// name and a figure. Quiet by design: these never compete with a balance.
function rowActions(account, { spendable = false } = {}) {
  if (reordering) return '';
  return `
    <div class="account-actions-inline">
      ${spendable ? `<button type="button" class="k-btn k-btn--ghost account-add-expense" data-id="${account.id}" aria-label="Add a spend on ${escapeAttr(account.label)}">Add a spend</button>` : ''}
      <button type="button" class="k-btn k-btn--ghost account-edit" data-id="${account.id}">Edit</button>
    </div>`;
}

function accountCard(account, transactions, importBatches, allLoans = [], place = {}) {
  const acctTxns = transactions.filter((t) => t.accountId === account.id);
  // "+ Spend" sits beside Edit in the card's top line rather than on a row of
  // its own, which made every card a line taller for one small button. Not on
  // an account kept for savings: nothing leaving it is spending.
  const spendable = account.type === 'card' || account.type === 'cash' || (account.type === 'bank' && !isPutAway(account));

  if (account.type === 'pf') {
    const pf = pfPosition(account, transactions);
    return `
      <div class="account-block">
        ${accountRow(account, {
          meta: `in the fund, same as your passbook${pf.assumedMonths ? ` · ${pf.assumedMonths} month${pf.assumedMonths === 1 ? '' : 's'} assumed` : ''}`,
          value: formatRupees(pf.balance),
          place,
        })}
        <div class="account-detail">
        ${
          pf.pendingInterest
            ? `<div class="totals-row"><span>Interest this year<br><span class="muted-note">at ${pf.ratePct}%, added on ${formatDateNice(pf.nextCredit)}</span></span><span class="in">+${formatRupees(pf.pendingInterest)}</span></div>`
            : ''
        }
        ${pf.monthly ? `<div class="totals-row"><span>Going in each month</span><span class="in">${formatRupees(pf.monthly)}</span></div>` : ''}
        ${pf.pension ? `<div class="totals-row"><span>Pension (EPS)<br><span class="muted-note">kept apart from the fund</span></span><span>${formatRupees(pf.pension)}</span></div>` : ''}
        ${
          pf.monthly
            ? // Two different questions, answered apart: keep working and the
              // same keeps going in, or stop and the fund grows on interest
              // alone. Shown together as one list, they read as one figure.
              `<details class="loan-detail">
                <summary>What it grows to</summary>
                <p class="pf-case">If ${formatRupees(pf.monthly)} keeps going in each month</p>
                ${[5, 10, 20].map((y) => `<div class="totals-row"><span>In ${y} years</span><span class="in">${formatRupees(pf.in(y))}</span></div>`).join('')}
                <p class="pf-case">If nothing more goes in</p>
                ${[5, 10, 20].map((y) => `<div class="totals-row"><span>In ${y} years</span><span class="in">${formatRupees(pf.alone(y))}</span></div>`).join('')}
                <p class="muted-note">At ${pf.ratePct}% a year. Added every 31 March.</p>
              </details>`
            : '<p class="muted-note">Import a passbook or a payslip, or add a month below.</p>'
        }
        ${pfMonthForm(account, transactions)}
        ${rowActions(account)}
        </div>
      </div>
    `;
  }

  if (account.type === 'loan') {
    const today = isoLocal(new Date());
    const position = loanPosition(account, transactions, today, allLoans);
    // Paid off is measured against what has been lent so far. On a flat still
    // being built that is the amount released, not the amount sanctioned:
    // against the sanction, ₹31 lakh owed on ₹45 lakh looked 31% paid off
    // when barely 3% of the money actually lent had been paid back.
    const lent = position.released ?? position.principal;
    const paidBack = position.paidBack ?? (lent && position.outstanding != null ? lent - position.outstanding : null);
    const paidOff = lent && paidBack != null ? Math.max(0, Math.min(100, Math.round((paidBack / lent) * 100))) : null;
    const split = loanPayments(account, transactions, today, allLoans)[0] || null;
    // Which account the EMI really leaves from. What the payments say beats
    // what is set on the loan: if they disagree, the setting is the thing
    // that is wrong, and seeing the real one is how you notice.
    const seen = paymentsFor(account, transactions, today, allLoans);
    const paidFrom = seen.length ? seen.sort((a, b) => (a.date < b.date ? 1 : -1))[0].accountId : null;
    const fromName = accountLabels.get(paidFrom || account.loan?.paidFromId) || null;
    // Numbers first, one short line each; the history sits behind a tap and
    // the planner answers with two figures, not paragraphs.
    const status = [
      paidOff != null ? `${paidOff}% paid back` : '',
      position.underConstruction && position.stillToRelease ? `${formatRupees(position.stillToRelease)} still to come` : '',
      !position.underConstruction && position.left ? `free in ${months(position.left)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return `
      <div class="account-block">
        ${accountRow(account, {
          // What is still owed, which is the question a loan raises.
          meta: position.outstanding != null ? `${status}${account.loan?.inBudget === false ? ' · not in budget' : ''}` : 'Add the amount borrowed and the EMI',
          value: position.outstanding != null ? formatRupees(position.outstanding) : '',
          tone: position.outstanding != null ? moneyTone(position.outstanding) : '',
          place,
        })}
        <div class="account-detail">
        ${
          position.outstanding != null && paidOff != null
            ? `<div class="k-meter account-meter"><div class="k-meter__fill" style="width:${Math.max(paidOff, 1)}%"></div></div>`
            : ''
        }
        ${
          position.emi
            ? `<div class="loan-pay-row"><span>${formatRupees(position.emi)}${account.loan?.day ? ` on the ${ordinal(account.loan.day)}` : ''}${
                fromName ? ` <span class="muted-note">from ${escapeHtml(fromName)}</span>` : ''
              }</span>${account.loan?.ratePct ? `<span class="muted-note">${account.loan.ratePct}%</span>` : ''}</div>`
            : ''
        }
        ${
          split && split.interest < split.amount
            ? `<div class="loan-last" aria-label="Your last payment: ${formatRupees(split.interest)} interest, ${formatRupees(split.principal)} off the loan">
                <div class="split-bar"><span class="split-interest" style="width:${Math.round((split.interest / split.amount) * 100)}%"></span></div>
                <div class="split-legend"><span><i class="dot interest"></i>${formatRupees(split.interest)} interest</span><span><i class="dot principal"></i>${formatRupees(split.principal)} off</span></div>
              </div>`
            : ''
        }
        ${position.emi && position.outstanding != null ? loanPlanner(account, position) : ''}
        ${renderLoanHistory(account, transactions, position, allLoans, paidFrom)}
        ${rowActions(account)}
        </div>
      </div>
    `;
  }

  if (account.type === 'card') {
    // Same figure as the Summary: spends this cycle less refunds and cashback.
    const day = statementDay(account, importBatches);
    const position = day ? cardPosition(account, transactions, importBatches, isoLocal(new Date())) : null;
    const { cycleStart, spend: fallbackSpend } = cardCycleSpend(account, transactions, importBatches);
    const cycleSpend = position ? position.owed : fallbackSpend;
    const since = position ? position.lastClose : cycleStart;
    const bill = cardBillDue(account);

    return `
      <div class="account-block">
        ${openable(
          account,
          acctTxns,
          accountRow(account, {
            meta: `${
              position
                ? // The cycle opens the day after the last statement, the same
                  // dates the Summary shows for it.
                  `${formatDateNice(dayAfter(position.lastClose))} to ${formatDateNice(position.cycleClose)}`
                : `since ${since ? formatDateNice(since) : 'the cycle began'}`
            }${day ? ` · bills on the ${ordinal(day)}` : ' · import a statement to set its cycle'}`,
            value: formatRupees(cycleSpend),
            tone: moneyTone(cycleSpend),
            canOpen: true,
            place,
          }),
          // A real amount already billed that the app cannot see yet: a fact
          // the card computes, not a remark invented about it.
          position && position.billedNotImported >= 1000
            ? `${formatRupees(position.billedNotImported)} billed ${formatDateNice(position.lastClose)}, statement not imported`
            : '',
          { spendable: true }
        )}
        ${renderBill(bill, account)}
      </div>
    `;
  }

  if (account.type === 'bank' || account.type === 'savings') {
    const balance = bankBalance(account, acctTxns);
    // Its fixed deposits, if any, are part of it: the headline is the whole
    // of what sits at the bank, with the split underneath.
    const deposits = (depositsOf.get(account.id) || []).map((d) => ({ account: d, balance: bankBalance(d, transactions) || 0 }));
    const total = (balance || 0) + deposits.reduce((s, d) => s + d.balance, 0);
    const kindOf = (d) => (d.account.deposit && d.account.deposit.kind === 'MOD' ? 'MOD FD' : 'FD');
    const maturity = deposits.reduce((s, d) => s + ((d.account.deposit && d.account.deposit.atMaturity) || 0), 0);
    // SBI keeps its FDs on the savings statement; until that PDF is imported
    // there is nothing to show, so say where they come from.
    const fdHint = !deposits.length && isPutAway(account) && account.type === 'bank' && /\bsbi\b|state bank/i.test(account.issuer || account.label || '');
    return `
      <div class="account-block">
        ${
          balance != null
            ? `${openable(
                account.type === 'bank' ? account : null,
                acctTxns,
                accountRow(account, {
                  meta: `${account.business ? 'business · ' : isPutAway(account) ? 'put away · ' : ''}statement ${formatDateNice(account.knownBalanceDate)}`,
                  value: formatRupees(deposits.length ? total : balance),
                  canOpen: account.type === 'bank',
                  place,
                }),
                '',
                { spendable }
              )}
               ${
                 deposits.length
                   ? `<dl class="loan-lines">
                       ${fact('Savings', formatRupees(balance))}
                       ${deposits.map((d) => fact(kindOf(d), formatRupees(d.balance))).join('')}
                       ${maturity ? fact('At maturity', `<span class="in">${formatRupees(maturity)}</span>`) : ''}
                     </dl>`
                   : account.deposit && account.deposit.atMaturity
                   ? `<dl class="loan-lines">${fact('At maturity', `<span class="in">${formatRupees(account.deposit.atMaturity)}</span>`)}</dl>`
                   : ''
               }
               ${fdHint ? `<div class="account-detail"><button type="button" class="k-btn k-btn--ghost account-go-import">Import SBI's statement PDF to see your FDs</button></div>` : ''}
               ${account.type !== 'bank' ? `<div class="account-detail">${rowActions(account, { spendable })}</div>` : ''}`
            : `${accountRow(account, { meta: `${account.business ? 'business · ' : ''}import a statement to see the balance`, value: '', place })}
               <div class="account-detail">${rowActions(account, { spendable })}</div>`
        }
      </div>
    `;
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const thisMonth = acctTxns.filter((t) => t.date >= monthStart && !t.isTransfer);
  const inAmt = thisMonth.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0);
  const outAmt = thisMonth.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0);

  return `
    <div class="account-block">
      ${openable(
        account,
        acctTxns,
        accountRow(account, {
          meta: `spent this month${inAmt ? ` · <span class="in">+${formatRupees(inAmt)}</span> in` : ''}`,
          value: formatRupees(outAmt),
          tone: moneyTone(outAmt),
          canOpen: true,
          place,
        }),
        '',
        { spendable: true }
      )}
    </div>
  `;
}

/* A card, bank or cash account: the row itself is the button. Tapping it
 * opens the five latest payments on the account, newest first, with the rest
 * one tap away in History, and the account's own actions underneath.
 *
 * `account` null leaves the row as it is (an FD, which you cannot open).
 * `note` is an extra line the account already knows about itself; it is
 * shown whether or not the row is open, because a bill you cannot see yet is
 * not a detail.
 */
function openable(account, acctTxns, row, note = '', { spendable = false } = {}) {
  if (!account) return row;
  const open = opened.has(account.id);
  const recent = open
    ? [...acctTxns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5)
    : [];
  return `
    ${row}
    ${note ? `<p class="account-note">${note}</p>` : ''}
    ${
      open
        ? `<div class="account-detail account-recent">
            ${
              recent.length
                ? `<div class="k-rows account-recent-rows">${recent
                    .map(
                      (t) => `<div class="k-row account-recent-row">
                        <span class="k-row__body">
                          <span class="k-row__title">${escapeHtml(displayName(t.rawDescription))}</span>
                          <span class="k-row__meta">${formatDateNice(t.date)}${t.isTransfer ? ' · moved' : ''}</span>
                        </span>
                        <span class="k-row__value ${t.isTransfer ? 'muted' : t.direction === 'credit' ? 'in' : 'out'}">${t.direction === 'credit' ? '+' : '−'}${formatRupees(t.amount)}</span>
                      </div>`
                    )
                    .join('')}</div>`
                : '<p class="muted-note">Nothing on this account yet.</p>'
            }
            ${acctTxns.length > recent.length ? `<button type="button" class="k-btn k-btn--ghost account-see-all" data-id="${account.id}">All ${acctTxns.length} in History</button>` : ''}
            ${rowActions(account, { spendable })}
          </div>`
        : ''
    }`;
}

// Which heading an account sits under. A bank account you keep only for
// savings or a loan sits with the savings, where it is treated.
function groupOf(a) {
  return isPutAway(a) ? 'savings' : a.type;
}

// Why a loan shows no EMIs. "Nothing found" on its own leaves you with
// nowhere to go, so this says what was looked for and where.
function noPaymentsReason(account, transactions, position) {
  const emi = position.emi;
  const from = account.loan?.paidFromId;
  const where = from ? accountLabels.get(from) : null;
  if (from && where && !transactions.some((t) => t.accountId === from)) {
    return `Nothing has been imported for ${where} yet. Import that account's statement and every EMI shows here, split into interest and principal.`;
  }
  if (from && where) {
    return `No payment of about ${formatRupees(emi)} has left ${where}${account.loan?.day ? ` around the ${ordinal(account.loan.day)}` : ''}. If the EMI goes out of a different account, change "Paid from" with Edit.`;
  }
  return `No payment of about ${formatRupees(emi)} found on any account yet. Import the statement of the account the EMI leaves from, or open a payment in History and tag it to this loan.`;
}

// One line of a loan's small print: label left, value right.
function fact(label, value) {
  return `<div class="loan-line"><dt class="muted-note">${label}</dt><dd>${value}</dd></div>`;
}

// Adding a month without the payslip PDF: the basic pay is usually the same
// every month, so it is filled in from last time and only changes when pay
// changes.
function pfMonthForm(account, transactions) {
  const months = transactions
    .filter((t) => t.accountId === account.id && t.direction === 'credit')
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6);
  const basic = account.pf?.basic ? Math.round(account.pf.basic / 100) : '';
  return `
    <details class="loan-detail">
      <summary>Months added</summary>
      ${
        months.length
          ? months
              .map(
                (t) =>
                  `<div class="totals-row"><span class="muted-note">${formatMonthYear(t.date)}</span><span class="muted-note">${formatRupees(t.amount)}${
                    { epfo: ' · passbook', payslip: '', manual: ' · by hand' }[t.source] ?? ''
                  }</span></div>`
              )
              .join('')
          : '<p class="muted-note">None yet.</p>'
      }
      <form class="pf-month-form" data-id="${account.id}">
        <label class="field">
          <span>Month</span>
          <input type="month" class="pf-month" required>
        </label>
        <label class="field">
          <span>Basic pay that month</span>
          <input type="number" class="pf-basic" inputmode="decimal" min="0" step="1" value="${basic}" required>
        </label>
        <button type="submit" class="btn-secondary btn-block">Add this month</button>
      </form>
    </details>
  `;
}
// "Pay it off faster": tap an amount, see what it does over the whole loan.
// Choosing updates only the figures under the buttons - the old version redrew the whole screen
// on every keystroke, which on a phone closed the keyboard mid-number.
const PLAN_AMOUNTS = [200000, 500000, 1000000];

function loanPlanner(account, position) {
  const extra = loanExtra[account.id] || 0;
  const custom = extra && !PLAN_AMOUNTS.includes(extra);
  return `
    <div class="loan-planner" data-id="${account.id}">
      <div class="loan-planner-title">Pay it off faster</div>
      <div class="plan-chips" role="group" aria-label="Pay extra each month">
        ${PLAN_AMOUNTS.map((a) => `<button type="button" class="plan-chip ${extra === a ? 'on' : ''}" aria-pressed="${extra === a}" data-amount="${a}">+${formatRupees(a)}</button>`).join('')}
        <button type="button" class="plan-chip plan-other ${custom ? 'on' : ''}" aria-pressed="${Boolean(custom)}" data-amount="other">Other</button>
      </div>
      <input type="number" class="plan-other-input" inputmode="numeric" min="0" step="500" placeholder="Extra each month, ₹" value="${custom ? Math.round(extra / 100) : ''}" ${custom ? '' : 'hidden'}>
      <div class="plan-result">${planResult(account, position, extra)}</div>
    </div>`;
}

// What an extra payment does over the whole loan: the interest you never pay
// and how much sooner it is over. With nothing picked, the loan as it is, so
// there is something to compare against.
function planResult(account, position, extra) {
  const plan = payFasterPlan(account, extra, { outstanding: position.outstanding });
  if (!plan) return '';
  const row = (label, value, tone = '') => `<div class="totals-row"><span>${label}</span><span class="${tone}">${value}</span></div>`;
  const monthYear = formatMonthYear;
  const counted = plan.stillToRelease
    ? `The whole ${formatRupees(plan.balance)}, with the ${formatRupees(plan.stillToRelease)} still to be released${plan.monthsLeftInTerm ? `, over the ${months(plan.monthsLeftInTerm)} left of the term` : ''}.`
    : `The ${formatRupees(plan.balance)} still owed${plan.monthsLeftInTerm ? `, ${months(plan.monthsLeftInTerm)} left of the term` : ''}.`;
  if (!extra) {
    return `${row('Interest still to pay', formatRupees(plan.interest), 'out')}${row('Paid off by', monthYear(plan.endsOn))}<p class="muted-note">${counted}</p>`;
  }
  return `${row('Interest saved', `<strong>${formatRupees(plan.interestSaved)}</strong>`, 'in')}${row(
    'Paid off by',
    `${monthYear(plan.fasterEndsOn)}${plan.monthsSaved > 0 ? ` <span class="in">${months(plan.monthsSaved)} sooner</span>` : ''}`
  )}<p class="muted-note">${counted} Ask your bank if paying early has a fee.</p>`;
}
// What the EMIs have actually gone on, behind one tap: the totals since the
// loan began, what has been released, and the last few payments.
function renderLoanHistory(account, transactions, position, allLoans, paidFrom) {
  const paid = loanPayments(account, transactions, isoLocal(new Date()), allLoans);
  const history = loanHistory(account);
  const recent = paid.slice(0, 6);
  const totals = paid.reduce((s, p) => ({ interest: s.interest + p.interest, principal: s.principal + p.principal }), { interest: 0, principal: 0 });
  const row = (label, value, tone = '') => `<div class="totals-row"><span>${label}</span><span class="${tone}">${value}</span></div>`;
  return `
    <details class="loan-detail">
      <summary>History</summary>
      ${
        history
          ? // The bank's own totals since the loan began, with what has been
            // paid back taken from its balance rather than added up from
            // payments (SBI lists a few internal entries twice).
            `${row(`Interest since ${formatDateNice(history.since)}`, formatRupees(history.interestCharged), 'out')}
             ${position.paidBack != null ? row('Paid back', formatRupees(position.paidBack), 'in') : ''}
             ${position.underConstruction ? row('Released', `${formatRupees(history.released)} <span class="muted-note">of ${formatRupees(history.sanctioned)}</span>`) : ''}`
          : paid.length
          ? `${row('Interest', formatRupees(totals.interest), 'out')}${row('Paid back', formatRupees(totals.principal), 'in')}`
          : ''
      }
      ${
        recent.length
          ? `<div class="loan-recent">${recent
              .map(
                (p) =>
                  `<div class="totals-row"><span class="muted-note">${formatDateNice(p.date)}</span><span class="muted-note">${formatRupees(p.interest)} interest · ${formatRupees(
                    p.principal
                  )} off</span></div>`
              )
              .join('')}</div>`
          : `<p class="muted-note">${escapeHtml(noPaymentsReason(account, transactions, position))}</p>`
      }
      ${
        paidFrom && account.loan?.paidFromId && paidFrom !== account.loan.paidFromId
          ? `<p class="muted-note">These left ${escapeHtml(accountLabels.get(paidFrom) || 'another account')}, but the loan is set to ${escapeHtml(
              accountLabels.get(account.loan.paidFromId) || 'another account'
            )}. Fix it with Edit.</p>`
          : ''
      }
    </details>
  `;
}

function dayAfter(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoLocal(new Date(y, m - 1, d + 1));
}

function months(n) {
  if (n == null) return '-';
  const years = Math.floor(n / 12);
  const rest = n % 12;
  return [years ? `${years}y` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ') || '0m';
}
function renderBill(bill, account) {
  if (!bill) return '';
  if (bill.paid) {
    return `
      <div class="account-headline in">${formatCurrency(bill.amount)} <span class="bill-tag">paid</span></div>
      <div class="muted-note">bill from ${formatDateNice(account.statementPeriodEnd)}</div>
      <button type="button" class="btn-tiny bill-toggle-paid" data-id="${account.id}">Mark unpaid</button>
    `;
  }
  const urgency = bill.daysLeft == null ? '' : bill.daysLeft < 0 ? 'overdue' : bill.daysLeft <= 3 ? 'urgent' : '';
  const when =
    bill.daysLeft == null
      ? `due ${bill.dueDate ? formatDateNice(bill.dueDate) : 'date unknown'}`
      : bill.daysLeft < 0
        ? `overdue by ${Math.abs(bill.daysLeft)} day${Math.abs(bill.daysLeft) === 1 ? '' : 's'}`
        : bill.daysLeft === 0
          ? 'due today'
          : `due in ${bill.daysLeft} day${bill.daysLeft === 1 ? '' : 's'} (${formatDateNice(bill.dueDate)})`;
  return `
    <div class="totals-row"><span>Bill<br><span class="muted-note ${urgency ? 'bill-' + urgency : ''}">${when}${bill.minimum != null ? ` · min ${formatCurrency(bill.minimum)}` : ''}</span></span><span class="out">${formatCurrency(bill.amount)}</span></div>
    <button type="button" class="btn-tiny bill-toggle-paid" data-id="${account.id}">Mark bill paid</button>
  `;
}

// The provident fund's own settings. The opening balance is typed in because
// there is no statement to import it from - EPFO's passbook is a website.
function readPfFields(form, existing) {
  const opening = parseFloat(form.querySelector('.af-pf-opening').value);
  const rate = parseFloat(form.querySelector('.af-pf-rate').value);
  const asOf = form.querySelector('.af-pf-asof').value;
  return {
    knownBalance: Number.isFinite(opening) && opening >= 0 ? Math.round(opening * 100) : 0,
    knownBalanceDate: asOf ? `${asOf}-01` : existing?.knownBalanceDate || null,
    pf: {
      ...(existing?.pf || {}),
      ratePct: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_PF_RATE,
      uan: form.querySelector('.af-pf-uan').value.trim() || null,
      assumeMonthly: form.querySelector('.af-pf-assume').checked,
    },
  };
}
// The numbers typed into the loan fields, as paise where they are money.
// A savings pot: what kind it is, and what it is worth today. Typed in
// because PPF, gold, a chit fund and an insurance policy have no statement
// the app can read; an FD from a bank statement keeps the balance it read.
function readSavingsFields(form, existing) {
  const kind = form.querySelector('.af-savings-kind').value;
  const raw = parseFloat(form.querySelector('.af-savings-value').value);
  if (!Number.isFinite(raw) || raw < 0) return { savingsKind: kind };
  const value = Math.round(raw * 100);
  if (existing && existing.knownBalance === value) return { savingsKind: kind };
  return { savingsKind: kind, knownBalance: value, knownBalanceDate: isoLocal(new Date()) };
}

function readLoanFields(form) {
  const num = (sel) => {
    const raw = parseFloat(form.querySelector(sel).value);
    return Number.isFinite(raw) ? raw : null;
  };
  const principal = num('.af-principal');
  const emi = num('.af-emi');
  const day = num('.af-emi-day');
  const totalEmis = num('.af-total-emis');
  return {
    principal: principal != null ? Math.round(principal * 100) : null,
    ratePct: num('.af-rate'),
    emi: emi != null ? Math.round(emi * 100) : null,
    day: day != null && day >= 1 && day <= 31 ? Math.round(day) : null,
    paidFromId: form.querySelector('.af-paid-from').value || null,
    inBudget: form.querySelector('.af-loan-in-budget').checked,
    startMonth: form.querySelector('.af-start').value || null,
    totalEmis: totalEmis != null ? Math.round(totalEmis) : null,
  };
}

// The question this screen answers first: where does my money sit? Only
// balances a statement has proved are counted - Kawach never asks for one to
// be typed in - and money put away (savings, FDs) is named beside the total
// rather than folded into it, because it is not money to spend.
function accountsTotal(groups, transactions) {
  // Label and figure together, so the drawing and the total are made of the
  // same rows and cannot drift apart.
  const known = (list) =>
    (list || [])
      .map((a) => ({ label: a.label, amount: bankBalance(a, transactions) }))
      .filter((x) => x.amount != null);
  const spendableRows = [...known(groups.bank), ...known(groups.cash)];
  const spendable = spendableRows.map((x) => x.amount);
  if (!spendable.length) return '';
  const total = spendable.reduce((s, v) => s + v, 0);
  // Savings and the provident fund are yours but not spendable, so they are
  // named beside the total rather than folded into it - and named whenever
  // such an account exists, so the figure above is never read as everything.
  // Money put away is not part of the ring: it is not what "In your accounts"
  // counts, and drawing it beside the same total would show it twice.
  const putAway = [...known(groups.savings), ...known(groups.pf)].map((x) => x.amount);
  // The supporting line counts the very accounts just added up, not every
  // account on screen: an account whose balance is not known yet is not in
  // the figure, and saying otherwise would make the total look wrong.
  const across = `Counted from ${spendable.length} account${spendable.length === 1 ? '' : 's'} with a known balance`;
  return hero({
    label: 'In your accounts',
    amount: formatRupees(total),
    negative: total < 0,
    figures: putAway.length ? [{ label: 'Put away', value: formatRupees(putAway.reduce((s, v) => s + v, 0)) }] : [],
    status: across,
    // Only when there is a split worth seeing; the ring's slices are the
    // rows above, so they add to the figure above them exactly.
    extra: allocationRing({
      slices: spendableRows.filter((x) => x.amount > 0),
      centre: '',
      caption: 'Every slice is an account you can spend from. Money put away is counted apart.',
    }),
  });
}
