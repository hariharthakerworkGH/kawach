import { getAll, put, remove, newId } from '../db.js';
import { computeFreeToSpend } from '../free-to-spend.js';
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
import { reminderText, updatePerson, shareReminder } from '../people.js';
import { allocationRing, tickGauge } from '../charts.js';
import { appearance } from '../appearance.js';
import { displayName } from './transactions.js';
import { cushion } from '../goals.js';
import { escapeHtml, escapeAttr, emptyState, hero, moneyTone, shapeLike } from '../ui.js';
// NEW for the bill-payment panel: reading a pasted bank SMS or email, and
// saying what happened.
import { parseAlert, alertFingerprint } from '../alerts.js';
import { showToast } from '../toast.js';

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

// NEW: the card whose "Mark bill paid" panel is open (one at a time), and the
// accounts a bill can be paid from: banks, cash and savings of this lane.
let payingBill = null;
let payFrom = [];

// The phone's back button closes an open form (or reordering, or the bill
// panel) first, before it leaves the screen.
export function onBack() {
  if (!shownIn || !shownIn.isConnected || (editing === null && !reordering && !payingBill)) return false;
  editing = null;
  reordering = false;
  payingBill = null;
  redraw(shownIn, () => render(shownIn));
  return true;
}

export async function render(container) {
  shownIn = container;
  const [accounts, allTransactions, importBatches, who] = await Promise.all([getAll('accounts'), getAll('transactions'), getAll('importBatches'), moneyProfile()]);
  profile = { ...who, hasPf: accounts.some((a) => a.type === 'pf') };
  space = await activeSpace();
  // NEW (5.13): what is owed on cards and on loans, beside the money in the
  // banks. The same figures Summary shows, from the same calculation, so the
  // two screens can never disagree; Home's only, as that calculation is.
  const homeFigures = space === 'home' ? await computeFreeToSpend() : null;
  // What part of each card is work, owed back by the employer (5.23).
  workByCard = new Map(((homeFigures && homeFigures.cards) || []).map((c) => [c.account.id, { cycle: c.workCycle || 0, owed: c.workOwed || 0, coming: c.comingFixed || 0, items: c.comingItems || [] }]));
  // Copies saved by overlapping statement imports are left out of every
  // balance here, the same as on the Summary.
  const duplicateIds = new Set(findDuplicates(allTransactions).map((t) => t.id));
  const transactions = duplicateIds.size ? allTransactions.filter((t) => !duplicateIds.has(t.id)) : allTransactions;

  accountLabels = new Map(accounts.map((a) => [a.id, a.label]));
  // NEW: where a card bill can be paid from. Not a fixed deposit inside a
  // savings account, and only this lane's accounts.
  payFrom = accounts.filter((a) => ['bank', 'cash', 'savings'].includes(a.type) && !a.depositOf && accountInSpace(space)(a));
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
      ${appearance('accounts') === 'private' ? `<button type="button" id="accounts-reveal" class="k-btn k-btn--ghost">${balancesShown ? 'Hide' : 'Show'} balances</button>` : ''}
      ${accounts.length > 1 ? `<button type="button" id="accounts-reorder" class="k-btn k-btn--ghost">${reordering ? 'Done' : 'Reorder'}</button>` : ''}
    </div>
    ${accountsTotal(groups, transactions, homeFigures)}
    ${cushionCard(homeFigures)}
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
    ${homeFigures ? peopleGroup(homeFigures.people || [], accounts) : ''}

  `;

  wirePeople(container);

  const openAdd = () => {
    editing = editing === 'new' ? null : 'new';
    redraw(container, () => render(container));
  };
  const emptyAdd = container.querySelector('#empty-add-account');
  if (emptyAdd) emptyAdd.addEventListener('click', openAdd);
  const reveal = container.querySelector('#accounts-reveal');
  if (reveal) {
    reveal.addEventListener('click', () => {
      balancesShown = !balancesShown;
      // Redrawn in place, so the screen does not jump to the top when the
      // amounts appear.
      redraw(container, () => render(container));
    });
  }

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

  // CHANGED: "Mark bill paid" no longer just flips a flag. It opens a small
  // panel asking where the money came from, because a bill paid is also money
  // gone from an account - flipping the flag alone left that account's balance
  // and the card's bill telling two different stories.
  container.querySelectorAll('.bill-pay-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      payingBill = payingBill === btn.dataset.id ? null : btn.dataset.id;
      redraw(container, () => render(container));
    });
  });

  // Confirm: one exact-amount payment out of the account you picked, and the
  // card's bill marked paid. The card's own "payment received" is not written
  // here: it arrives with the card's next list or statement, and the app
  // already pairs the two (js/free-to-spend.js, bank-only payments), so
  // writing both sides would count the payment twice when the card's side
  // turns up.
  container.querySelectorAll('.bill-pay').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const card = accounts.find((a) => a.id === form.dataset.id);
      const bill = card && cardBillDue(card);
      const note = form.querySelector('.bill-pay-note');
      if (!bill || bill.paid) return;
      const sourceId = form.querySelector('.bill-pay-source').value;
      if (!sourceId) {
        note.textContent = 'Choose the account it was paid from.';
        return;
      }
      const today = isoLocal(new Date());
      let date = today;
      let fromMessage = {};
      // The pasted message is optional. When there is one it has to agree with
      // the bill to the paisa - otherwise it is shown, never silently used or
      // silently dropped.
      const text = form.querySelector('.bill-pay-text').value.trim();
      if (text) {
        const read = parseAlert(text);
        if (!read.ok) {
          note.textContent = `${read.reason} Clear it to carry on without it.`;
          return;
        }
        if (read.direction === 'credit' || read.amount !== bill.amount) {
          note.textContent = `That message says ${formatCurrency(read.amount)}${read.direction === 'credit' ? ' coming in' : ''}, and the bill is ${formatCurrency(bill.amount)}. Clear it, or paste the right one.`;
          return;
        }
        if (read.date && read.date <= today) date = read.date;
        // Kept so the bank's statement can recognise this exact payment later.
        fromMessage = { alertKey: alertFingerprint(read), alertRef: read.ref || null, ...(read.time && read.date === date ? { time: read.time } : {}) };
      }
      // Tapping Confirm twice (or on two devices) must not pay a bill twice.
      const key = statementKey(card);
      if (!transactions.some((t) => t.paysStatement === key)) {
        await put('transactions', {
          id: newId(),
          accountId: sourceId,
          date,
          rawDescription: `Card bill · ${cardName(card)}`,
          // The statement's own figure, to the paisa: never rounded.
          amount: bill.amount,
          direction: 'debit',
          categoryId: null,
          source: 'manual',
          importBatchId: null,
          // Money moved to pay a card is not spending, and that is a decision
          // made here, so nothing automatic undoes it.
          isTransfer: true,
          transferManual: true,
          paysCardId: card.id,
          paysStatement: key,
          notes: null,
          createdAt: Date.now(),
          ...fromMessage,
        });
      }
      const fresh = (await getAll('accounts')).find((a) => a.id === card.id) || card;
      await put('accounts', { ...fresh, statementDuePaid: true });
      payingBill = null;
      showToast(`${cardName(card)} bill paid`);
      const before = balanceOf(container, sourceId);
      await redraw(container, () => render(container));
      showPaid(container, card.id, sourceId, before);
    });
  });

  // Mark unpaid takes back what Mark paid did. If the payment was recorded
  // here, it goes too, or the account would stay short of money that never
  // left it.
  container.querySelectorAll('.bill-toggle-paid').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const account = accounts.find((a) => a.id === btn.dataset.id);
      const recorded = transactions.filter((t) => t.paysStatement === statementKey(account));
      if (recorded.length) {
        const sure = await askConfirm({
          title: 'Mark this bill unpaid?',
          message: `The ${formatRupees(recorded.reduce((s, t) => s + t.amount, 0))} payment recorded for it is removed too.`,
          confirmLabel: 'Mark unpaid',
          danger: true,
        });
        if (!sure) return;
        for (const t of recorded) await remove('transactions', t.id);
      }
      account.statementDuePaid = false;
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
          ? `<button type="button" class="btn-tiny danger account-delete" data-id="${account.id}">Delete this account${txnCount ? ` and its ${txnCount} payment${txnCount === 1 ? '' : 's'}` : ''}</button>`
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

/* NEW (5.20): lent and borrowed. One row per person who owes you or whom
 * you owe, after the accounts: who, which way and when, and the amount.
 * Tapping a row opens what passed between you and what can be done next.
 * The figures come from the same calculation as Summary (js/people.js). */
const openPeople = new Set();

// Work costs on each card, from the same figures as Summary (set in render).
let workByCard = new Map();

/* On a card: what you spent yourself, what was for work (your employer pays it
 * back), and the fixed costs you set on Plan that this card has still to be
 * charged before its statement day (5.27). The three together are the bill to
 * expect, said once as "Bill about". A bar of the three, then their amounts. */
export function cardWorkSplit(account, cycleSpend, w = workByCard.get(account.id)) {
  if (!w || (!w.cycle && !w.owed && !w.coming)) return '';
  const work = Math.min(Math.max(0, cycleSpend), w.cycle);
  const own = Math.max(0, cycleSpend - work);
  const coming = Math.max(0, w.coming || 0);
  if (!work && !coming) {
    return `<p class="card-split__note">${formatRupees(w.owed)} of work costs on this card still owed back by your employer</p>`;
  }
  const total = Math.max(1, own + work + coming);
  const seg = (cls, v) => (v > 0 ? `<i class="${cls}" style="width:${((v / total) * 100).toFixed(1)}%"></i>` : '');
  const key = (cls, label, v) => (v > 0 ? `<span class="${cls}">${label} <b>${formatRupees(v)}</b></span>` : '');
  const names = (w.items || []).slice(0, 3).map((i) => `${escapeHtml(i.label)} ${formatRupees(i.amount)}`).join(' · ');
  return `<div class="card-split" role="img" aria-label="${formatRupees(own)} yours${work ? `, ${formatRupees(work)} owed back by the company` : ''}${coming ? `, ${formatRupees(coming)} planned, your fixed costs still to be charged` : ''}. The bill to expect is about ${formatRupees(own + work + coming)}.">
      <div class="card-split__bar">${seg('own', own)}${seg('work', work)}${seg('coming', coming)}</div>
      <div class="card-split__key">${key('own', 'Yours', own)}${key('work', 'Owed by company', work)}${key('coming', 'Planned', coming)}</div>
      ${coming ? `<p class="card-split__coming">${names}${(w.items || []).length > 3 ? ` · +${w.items.length - 3} more` : ''}</p>` : ''}
      <p class="card-split__bill"><span>Bill about</span><b>${formatRupees(own + work + coming)}</b></p>
    </div>`;
}

function peopleGroup(standing, accounts) {
  const open = standing.filter((s) => s.owed !== 0);
  if (!open.length) return '';
  const today = isoLocal(new Date());
  const late = (s) => s.owed > 0 && s.person.backBy && s.person.backBy < today;
  const order = (s) => (late(s) ? 0 : s.owed > 0 ? 1 : 2);
  const toYou = open.filter((s) => s.owed > 0).reduce((t, s) => t + s.owed, 0);
  const youOwe = open.filter((s) => s.owed < 0).reduce((t, s) => t - s.owed, 0);
  const accountName = (id) => accounts.find((a) => a.id === id)?.label || 'Cash';
  const rows = [...open].sort((a, b) => order(a) - order(b) || (a.since < b.since ? -1 : 1)).map((s) => {
    const { person } = s;
    const isOpen = openPeople.has(person.id);
    const days = late(s) ? Math.round((new Date(today) - new Date(person.backBy)) / 86400000) : 0;
    const meta =
      s.owed > 0
        ? days
          ? `<span class="people-late">Owes you · ${days === 1 ? '1 day' : `${days} days`} late</span>`
          : `Owes you · ${person.backBy ? `back by ${formatDateNice(person.backBy)}` : `since ${formatDateNice(s.since)}`}`
        : `You owe · since ${formatDateNice(s.since)}`;
    const detail = isOpen
      ? `<div class="account-detail account-recent person-detail">
          <div class="k-rows account-recent-rows">${s.entries
            .slice(0, 6)
            .map(
              (t) => `<div class="k-row account-recent-row">
                <span class="k-row__body">
                  <span class="k-row__title">${t.direction === 'debit' ? 'Gave' : 'Got'}, ${escapeHtml(accountName(t.accountId))}</span>
                  <span class="k-row__meta">${formatDateNice(t.date)}</span>
                </span>
                <span class="k-row__value ${t.direction === 'credit' ? 'in' : 'out'}">${t.direction === 'credit' ? '+' : '−'}${formatRupees(t.amount)}</span>
              </div>`
            )
            .join('')}</div>
          ${
            s.owed > 0
              ? `<label class="field person-backby"><span>Back by</span><input type="date" class="k-input" data-person="${person.id}" value="${person.backBy || ''}"></label>`
              : ''
          }
          <div class="account-actions-inline">
            <button type="button" class="k-btn k-btn--primary person-settle" data-person="${person.id}" data-way="${s.owed > 0 ? 'got' : 'gave'}" data-amount="${Math.abs(s.owed)}">${s.owed > 0 ? 'Got it back' : 'Paid it back'}</button>
            ${s.owed > 0 ? `<button type="button" class="k-btn k-btn--secondary person-remind" data-text="${escapeAttr(reminderText(person.name, s.owed, formatDateNice(s.since)))}">Remind</button>` : ''}
          </div>
        </div>`
      : '';
    return `<div class="account-block">
        <button type="button" class="k-row account-row person-open" data-person="${person.id}" aria-expanded="${isOpen}">
          ${brandMark(person.name, { size: 'md' })}
          <span class="k-row__body">
            <span class="k-row__title">${escapeHtml(person.name)}</span>
            <span class="k-row__meta">${meta}</span>
          </span>
          <span class="k-row__value account-balance${s.owed > 0 ? ' k-row__value--pos' : ''}">${cover(formatRupees(Math.abs(s.owed)))}</span>
          <span class="account-row__chev" aria-hidden="true"></span>
        </button>
        ${detail}
      </div>`;
  });
  return `
    <section class="account-group-sec people-sec">
      <h3 class="account-group-label">Lent and borrowed</h3>
      <div class="people-sums">
        ${toYou ? `<div><span>Owed to you</span><b class="pos">${cover(formatRupees(toYou))}</b></div>` : ''}
        ${youOwe ? `<div><span>You owe</span><b>${cover(formatRupees(youOwe))}</b></div>` : ''}
      </div>
      <div class="account-group k-pane k-pane--quiet">${rows.join('')}</div>
    </section>`;
}

function wirePeople(container) {
  container.querySelectorAll('.person-open').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.person;
      if (openPeople.has(id)) openPeople.delete(id);
      else openPeople.add(id);
      redraw(container, () => render(container));
    })
  );
  container.querySelectorAll('.person-backby input').forEach((input) =>
    input.addEventListener('change', async () => {
      await updatePerson(input.dataset.person, { backBy: input.value || null });
      redraw(container, () => render(container));
    })
  );
  // Settling opens Add with everything filled in, so the account and the
  // day can still be changed before it is saved.
  container.querySelectorAll('.person-settle').forEach((btn) =>
    btn.addEventListener('click', () => {
      container.dispatchEvent(
        new CustomEvent('navigate', { bubbles: true, detail: { view: 'add', personId: btn.dataset.person, way: btn.dataset.way, amount: Number(btn.dataset.amount) } })
      );
    })
  );
  container.querySelectorAll('.person-remind').forEach((btn) => btn.addEventListener('click', () => shareReminder(btn.dataset.text)));
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
/* Is this screen keeping amounts covered, and has the person asked to see
 * them this visit? The answer is deliberately not remembered: covering them
 * again the next time the screen opens is the whole point of the setting.
 */
let balancesShown = false;
const covering = () => appearance('accounts') === 'private' && !balancesShown;
const cover = (text) => (covering() && text ? '<span class="amount-covered" aria-label="Balance hidden">••••</span>' : text);

function accountRow(account, { meta = '', value = '', tone = '', canOpen = false, place = {} }) {
  value = cover(value);
  const open = opened.has(account.id);
  // The bank's own name if we know it, otherwise what the account is called.
  // brandMark() is the resolver from phase 9C: a licensed file, a category
  // icon, or a monogram. Nothing here draws a bank's logo.
  const mark = brandMark(account.issuer || account.label, { size: 'md' });
  const body = `
      ${mark}
      <span class="k-row__body">
        <span class="k-row__title" title="${escapeAttr(shownName(account))}">${escapeHtml(shownName(account))}</span>
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
  if (!canOpen) return `<div class="k-row account-row account-row--${account.type}">${body}${figure}</div>`;
  return `
    <button type="button" class="k-row account-row account-open account-row--${account.type}" data-id="${account.id}" aria-expanded="${open}">
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
      paidOff != null ? `${formatRupees(paidBack)} paid back` : '',
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
          // CHANGED (5.2): the Charts style's tick gauge in place of the bar.
          position.outstanding != null && paidOff != null ? tickGauge(paidOff, `of ${formatRupees(lent)} paid back`, formatRupees(paidBack)) : ''
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
            }${
              // CHANGED: "bills on the 25th" is dropped. The cycle's end date
              // is already on the line, so it said the same thing twice.
              day ? '' : ' · import a statement to set its cycle'
            }`,
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
        ${cardWorkSplit(account, cycleSpend)}
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
               ${
                 // Said once, on the account it is true of: a savings pot is
                 // never money you can spend (js/free-to-spend.js).
                 account.type === 'savings' ? `<p class="acc-state acc-state--saved"><i class="bill-dot" aria-hidden="true"></i>Never counted as spendable</p>` : ''
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
// NEW: a card's name without the "CC " the label is saved with. Only what is
// shown changes; the saved label (and so everything that finds a card by it)
// stays as it was.
const cardName = (account) => String(account.label || '').replace(/^CC\s+/i, '').trim() || String(account.label || '');
const shownName = (account) => (account.type === 'card' ? cardName(account) : account.label);

// Which statement a recorded payment belongs to, so Mark unpaid can find it
// and Confirm cannot record it twice.
const statementKey = (account) => `${account.id}|${account.statementPeriodEnd || account.statementDueDate || ''}`;

// CHANGED: the bill is one line - when it is due and the minimum on the left,
// the exact amount on the right (paise kept: ₹37,262.13, never ₹37,262) - and
// "Mark bill paid" a quiet link under it, right-aligned, instead of a button.
function renderBill(bill, account) {
  if (!bill) return '';
  if (bill.paid) {
    return `
      <div class="bill-line">
        <span class="bill-when bill-paid"><i class="bill-dot" aria-hidden="true"></i>Paid${account.statementPeriodEnd ? ` · bill of ${formatDateNice(account.statementPeriodEnd)}` : ''}</span>
        <span class="bill-amount in">${formatRupees(bill.amount)}</span>
      </div>
      <div class="bill-actions"><button type="button" class="link-btn bill-toggle-paid" data-id="${account.id}">Mark unpaid</button></div>
    `;
  }
  const overdue = bill.daysLeft != null && bill.daysLeft < 0;
  const urgency = overdue ? 'overdue' : bill.daysLeft != null && bill.daysLeft <= 3 ? 'urgent' : '';
  // "Due 15 Oct · Min ₹820". Past its date it says Overdue instead, in red,
  // once, rather than counting the days.
  const when = `${bill.dueDate ? `${overdue ? 'Overdue' : 'Due'} ${formatDateNice(bill.dueDate)}` : 'Due date unknown'}${
    bill.minimum != null ? ` · Min ${formatRupees(bill.minimum)}` : ''
  }`;
  const open = payingBill === account.id;
  return `
    <div class="bill-line">
      <span class="bill-when ${urgency ? 'bill-' + urgency : ''}"><i class="bill-dot" aria-hidden="true"></i>${when}</span>
      <span class="bill-amount out">${formatRupees(bill.amount)}</span>
    </div>
    <div class="bill-actions"><button type="button" class="link-btn bill-pay-open" data-id="${account.id}" aria-expanded="${open}">Mark bill paid</button></div>
    ${open ? billPanel(account) : ''}
  `;
}

// The bank row's figure as it reads on screen, so that after a bill is paid
// it can count from there to the new one.
function balanceOf(container, id) {
  const el = container.querySelector(`.account-open[data-id="${id}"] .account-balance`);
  return el ? el.textContent.trim() : '';
}

// A bill just paid: its card glows green for a moment and the bank's balance
// counts down to what is left, so both sides of the one payment are seen to
// move. Only figures already on screen; nothing for reduced motion.
function showPaid(container, cardId, sourceId, before) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const block = container.querySelector(`.account-open[data-id="${cardId}"]`)?.closest('.account-block');
  if (block) {
    block.classList.add('just-paid');
    setTimeout(() => block.classList.remove('just-paid'), 1800);
  }
  const el = container.querySelector(`.account-open[data-id="${sourceId}"] .account-balance`);
  const final = el ? el.textContent.trim() : '';
  const from = Number(before.replace(/[^\d]/g, ''));
  const to = Number(final.replace(/[^\d]/g, ''));
  if (!el || !from || !to || from === to || /[^\d,₹−-]/.test(final)) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 900);
    el.textContent = t >= 1 ? final : shapeLike(final, Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => { el.textContent = final; }, 1400);
}

// The inline panel behind "Mark bill paid": where it was paid from, the bank's
// message if there is one, and Confirm. Nothing is saved until Confirm.
function billPanel(account) {
  if (!payFrom.length) {
    return `<div class="bill-pay"><p class="muted-note">Add the account it is paid from first.</p></div>`;
  }
  return `
    <form class="bill-pay" data-id="${account.id}" novalidate>
      <label class="k-field field">
        <span class="k-label">Paid from</span>
        <select class="k-select bill-pay-source">
          <option value="">Choose an account</option>
          ${payFrom.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('')}
        </select>
      </label>
      <label class="k-field field">
        <span class="k-label">Bank SMS or email text (optional)</span>
        <textarea class="k-input bill-pay-text" rows="3" spellcheck="false" autocomplete="off"></textarea>
      </label>
      <p class="bill-pay-note" role="status" aria-live="polite"></p>
      <button type="submit" class="k-btn k-btn--primary">Confirm</button>
    </form>`;
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
/* NEW (5.30): the safety cushion, a card under the total: months of fixed costs the
 * savings would cover, six cells for the six months many people aim for, and one line
 * with the two figures it is made from. Home only, and only when both figures exist. */
export function cushionCard(fts) {
  if (!fts) return '';
  const c = cushion((fts.savings || []).map((s) => s.balance), (fts.budgetItems || []).reduce((t, b) => t + b.amount, 0));
  if (!c) return '';
  const cells = Array.from({ length: c.target }, (_, i) => `<i><u style="width:${Math.round(Math.min(1, Math.max(0, c.months - i)) * 100)}%"></u></i>`).join('');
  const said = `${c.months} month${c.months === 1 ? '' : 's'}`;
  return `<div class="totals-card cushion">
      <div class="cushion__top"><span class="cushion__k">Safety cushion</span><b>${said}</b><em>${c.word}</em></div>
      <div class="cushion__bar" role="img" aria-label="${said} of fixed costs covered; many people aim for ${c.target}">${cells}</div>
      <p class="cushion__line">Savings ${formatRupees(c.savings)} · costs ${formatRupees(c.costs)} a month · many aim for ${c.target}</p>
    </div>`;
}

function accountsTotal(groups, transactions, fts = null) {
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
  return `<div class="acct-total">${hero({
    label: 'In your accounts',
    amount: covering() ? '••••' : formatRupees(total),
    negative: total < 0,
    figures: covering()
      ? []
      : [
          ...(fts && (fts.cards || []).length
            ? [{ label: 'Owed on cards', value: formatRupees(Math.max(0, ((fts.totals && fts.totals.owedCards) || 0) + ((fts.totals && fts.totals.unpaidBills) || 0))) }]
            : []),
          ...(putAway.length ? [{ label: 'Put away', value: formatRupees(putAway.reduce((s, v) => s + v, 0)) }] : []),
          ...(fts && (fts.loans || []).some((l) => l.outstanding != null)
            ? [{ label: 'Loans', value: formatRupees(fts.loans.reduce((s, l) => s + (l.outstanding || 0), 0)) }]
            : []),
        ],
    status: covering() ? 'Tap Show to see your balances' : across,
    // Only when there is a split worth seeing; the ring's slices are the
    // rows above, so they add to the figure above them exactly. Whether it is
    // drawn at all is the person's choice (js/appearance.js).
    extra:
      appearance('accounts') === 'ring'
        ? allocationRing({
            slices: spendableRows.filter((x) => x.amount > 0),
            centre: '',
            caption: 'Every slice is an account you can spend from. Money put away is counted apart.',
          })
        : '',
  })}</div>`;
}
