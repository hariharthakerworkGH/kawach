import { appearance } from '../appearance.js';
import { put, getAll, newId } from '../db.js';
import { icon } from '../icons.js';
import { CASH_ACCOUNT_ID } from '../config.js';
import { categoryStyle } from '../category-style.js';
import { showToast } from '../toast.js';
import { FREQUENCIES, DEFAULT_FREQUENCY, toMonthly, toYearly, isoLocal } from '../frequency.js';
import { formatCurrency } from '../format.js';
import { isLiveCommitment, byYourOrder } from '../commitments.js';
import { isBusinessCategory, isBusinessAccount, activeSpace, accountInSpace } from '../business.js';
import { escapeHtml } from '../ui.js';
import { brandMark } from '../brand.js';

export async function render(container, params = {}) {
  const [categories, allAccounts, recurring, space, transactions] = await Promise.all([
    getAll('categories'),
    getAll('accounts'),
    getAll('recurring'),
    activeSpace(),
    getAll('transactions'),
  ]);
  // The accounts of the lane on screen: Home's, or one business's.
  const accounts = allAccounts.filter(accountInSpace(space));
  const commitments = recurring.filter((r) => isLiveCommitment(r)).sort(byYourOrder);
  // The phone's own date. toISOString() is UTC, which in India is still
  // yesterday until 5:30am - so late-night spends were being dated the day
  // before, and on the 1st of the month, filed under the previous month.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const initialAccountId = params.accountId && accounts.some((a) => a.id === params.accountId) ? params.accountId : CASH_ACCOUNT_ID;

  // The categories live in a sheet now rather than in a wall of twenty
  // chips. The list itself is unchanged, and so is the order it arrives in.
  const catList = byRecentUse(categories, transactions);

  container.classList.add('k');
  // What the person nearly always leaves alone. On the quick form these
  // sit behind one tap; on the full form they stay where they were. The
  // inputs exist either way, so everything that finds them by id still does.
  const rest = `
      <label class="k-field field">
        <span class="k-label">Account</span>
        <div class="k-picker k-picker--select">
          <span class="k-picker__mark" id="add-account-mark"></span>
          <select id="add-account" class="k-select">
            ${accounts
              // A loan or the provident fund is not somewhere you spend from.
              .filter((a) => ['bank', 'card', 'cash', 'savings'].includes(a.type))
              .map((a) => `<option value="${a.id}" ${a.id === initialAccountId ? 'selected' : ''}>${escapeHtml(a.label)}</option>`)
              .join('')}
          </select>
        </div>
      </label>

      <label class="k-field field field-date">
        <span class="k-label">Date</span>
        <input id="add-date" class="k-input" type="date" value="${today}" max="${today}">
      </label>

      <div class="k-switch-row">
        <span class="k-switch-row__text" id="add-repeats-label">Repeats every month
          <span class="k-switch-row__sub">Counts it in your plan, not just today</span>
        </span>
        <input type="checkbox" id="add-repeats" class="k-vis-hidden">
        <button type="button" class="k-toggle" id="add-repeats-toggle" role="switch"
                aria-checked="false" aria-labelledby="add-repeats-label"></button>
      </div>

      <div id="add-repeat-options" hidden>
        <label class="k-field field">
          <span class="k-label">How often</span>
          <select id="add-frequency" class="k-select">
            ${Object.entries(FREQUENCIES)
              .map(([key, f]) => `<option value="${key}" ${key === DEFAULT_FREQUENCY ? 'selected' : ''}>${f.label}</option>`)
              .join('')}
          </select>
        </label>
        <p class="freq-preview" id="add-freq-preview" hidden></p>
      </div>
  `;
  const detailFields =
    appearance('add') === 'quick'
      ? `<details class="k-disclose k-add-more"><summary>Date, account and repeats</summary>
         <div class="k-add-more__body">${rest}</div></details>`
      : rest;
  container.innerHTML = `
    <!-- The fastest way in, so it goes first. Pasting the bank's own message
         fills in everything below, which beats typing any of it by hand. -->
    <button type="button" class="k-insight k-add-sms" id="add-from-alert">
      <span class="k-icon" style="--k-tint:var(--k-accent)">${icon('inbox')}</span>
      <span class="k-add-sms__body">
        <span class="k-insight__title">Got a bank SMS?</span>
        <span class="k-insight__body">Paste it and Kawach fills this in for you.</span>
      </span>
      <span class="k-add-sms__go" aria-hidden="true">→</span>
    </button>

    <form id="add-form" class="add-form">
      <section class="hero amount-hero">
        <label class="field amount-field">
          <span class="hero-label">Amount</span>
          <div class="amount-input-wrap">
            <span class="amount-prefix">₹</span>
            <input id="add-amount" class="amount-input" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0" required>
          </div>
        </label>
        <div class="k-seg direction-toggle" role="tablist" aria-label="Which way the money went">
          <button type="button" class="k-seg__btn dir-btn active" role="tab" aria-selected="true" data-dir="debit">Spent</button>
          <button type="button" class="k-seg__btn dir-btn" role="tab" aria-selected="false" data-dir="credit">Received</button>
        </div>
      </section>

      <label class="k-field field">
        <span class="k-label">Merchant</span>
        <input id="add-desc" class="k-input" type="text" placeholder="e.g. Swiggy, Netflix, Uber" required>
      </label>

      <!-- One row saying what is chosen. The twenty were the whole problem. -->
      <div class="k-field">
        <span class="k-label" id="add-cat-label">Category</span>
        <button type="button" class="k-picker" id="add-cat-open" aria-haspopup="dialog" aria-labelledby="add-cat-label add-cat-name">
          <span class="k-picker__mark" id="add-cat-mark"></span>
          <span class="k-picker__name" id="add-cat-name">Uncategorized</span>
        </button>
      </div>

      ${detailFields}

      <!-- Quiet, because the app works this out on its own nearly always. -->
      <details class="k-disclose k-add-more">
        <summary>More</summary>
        <div class="k-add-more__body">
          ${commitmentField(commitments)}
          <!-- NEW: work costs. One row for money out, one for money in; only
               the one that fits the Spent/Received choice is shown. -->
          ${reimbursableSwitch('add-reimb', 'Reimbursable (Work)', 'Your employer will pay this back')}
          ${reimbursableSwitch('add-settle', 'Settles a reimbursement', 'Money your employer paid back', true)}
          <!-- NEW: a bill paid in the last two days of a month for the next
               one. Shown only then, and works only once a commitment is
               chosen above, because it has to say which one it pays. -->
          ${reimbursableSwitch('add-nextmonth', "Apply to next month's commitments", 'Choose the commitment above first', true)}
        </div>
      </details>

      <button type="submit" class="k-btn k-btn--primary btn-primary">Save</button>
    </form>

    <!-- The category list, kept out of the way until it is asked for. -->
    <div id="add-cat-sheet" hidden>
      <div class="k-scrim" id="add-cat-scrim"></div>
      <div class="k-sheet" role="dialog" aria-modal="true" aria-label="Choose a category">
        <div class="k-sheet__grip"></div>
        <div class="k-sheet__head">
          <span class="k-sheet__title">Category</span>
          <button type="button" class="k-btn k-btn--ghost k-sheet__close" id="add-cat-close">Done</button>
        </div>
        <div class="k-sheet__scroll">
          <div class="k-rows" id="add-categories">
            <button type="button" class="k-row k-cat-row chip active" data-cat="">
              <span class="k-icon" style="--k-tint:var(--k-text-3)">${categoryStyle('Uncategorized').icon}</span>
              <span class="k-row__body"><span class="k-row__title">Uncategorized</span></span>
              <span class="k-cat-row__tick" aria-hidden="true"></span>
            </button>
            ${catList
              .map(
                (c) => `<button type="button" class="k-row k-cat-row chip" data-cat="${c.id}" data-business="${isBusinessCategory(c) ? '1' : ''}">
                  <span class="k-icon" style="--k-tint:${categoryStyle(c.name).color}">${categoryStyle(c.name).icon}</span>
                  <span class="k-row__body"><span class="k-row__title">${escapeHtml(c.name)}</span></span>
                  <span class="k-cat-row__tick" aria-hidden="true"></span>
                </button>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#add-from-alert').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'inbox' } }));
  });

  let direction = 'debit';
  let categoryId = null;

  // The two work-cost switches. The checkbox is what the form reads; the
  // button is what you see (the same pattern as "Repeats every month").
  const reimbEl = container.querySelector('#add-reimb');
  const settleEl = container.querySelector('#add-settle');
  [reimbEl, settleEl].forEach((box) => {
    const toggle = container.querySelector(`#${box.id}-toggle`);
    toggle.addEventListener('click', () => {
      box.checked = !box.checked;
      toggle.setAttribute('aria-checked', String(box.checked));
    });
  });
  // Shows the row that fits the way the money went, and clears the other: a
  // payment switched from Spent to Received must not carry "Reimbursable" with it.
  const showWorkRows = () => {
    const business = isBusinessAccount(accounts.find((a) => a.id === container.querySelector('#add-account').value));
    reimbEl.closest('.k-switch-row').hidden = business || direction !== 'debit';
    settleEl.closest('.k-switch-row').hidden = business || direction !== 'credit';
    for (const [box, show] of [[reimbEl, direction === 'debit'], [settleEl, direction === 'credit']]) {
      if (!show || business) {
        box.checked = false;
        container.querySelector(`#${box.id}-toggle`).setAttribute('aria-checked', 'false');
      }
    }
  };

  // NEW: "Apply to next month's commitments". Offered for a bank payment on
  // the last two days of a month, when rent or an EMI goes out early for the
  // month about to begin. It is switched off the moment any of that stops
  // being true, so it can never be saved on a payment it does not fit.
  const nextEl = container.querySelector('#add-nextmonth');
  const nextToggle = container.querySelector('#add-nextmonth-toggle');
  const nextSub = container.querySelector('#add-nextmonth-sub');
  nextToggle.addEventListener('click', () => {
    if (nextToggle.disabled) return;
    nextEl.checked = !nextEl.checked;
    nextToggle.setAttribute('aria-checked', String(nextEl.checked));
  });
  const showNextMonthRow = () => {
    const account = accounts.find((a) => a.id === container.querySelector('#add-account').value);
    const commitmentEl = container.querySelector('#add-commitment');
    const chosen = Boolean(commitmentEl && commitmentEl.value);
    const fits = direction === 'debit' && account && account.type !== 'card' && !isBusinessAccount(account) && isMonthEnd(dateInput.value || today);
    nextEl.closest('.k-switch-row').hidden = !fits;
    nextToggle.disabled = !fits || !chosen;
    nextSub.textContent = chosen ? 'Counts for next month, not this one' : 'Choose the commitment above first';
    if (!fits || !chosen) {
      nextEl.checked = false;
      nextToggle.setAttribute('aria-checked', 'false');
    }
  };

  container.querySelectorAll('.dir-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      direction = btn.dataset.dir;
      container.querySelectorAll('.dir-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      showWorkRows();
      showNextMonthRow();
    });
  });

  // The category is chosen in a sheet, so the screen behind it stays one
  // row rather than twenty chips. Selection state is unchanged: the same
  // `.chip` elements with the same `data-cat`, only laid out as rows, so
  // everything that reads them still works.
  const sheet = container.querySelector('#add-cat-sheet');
  const catName = container.querySelector('#add-cat-name');
  const catMark = container.querySelector('#add-cat-mark');
  const openBtn = container.querySelector('#add-cat-open');

  const paintCategory = () => {
    const chosen = container.querySelector('#add-categories .chip.active');
    const name = chosen ? chosen.querySelector('.k-row__title').textContent : 'Uncategorized';
    catName.textContent = name;
    catMark.innerHTML = brandMark(name, { category: name, size: 'sm' });
  };

  let lastFocus = null;
  const openSheet = () => {
    lastFocus = document.activeElement;
    sheet.hidden = false;
    const first = sheet.querySelector('.k-cat-row.active') || sheet.querySelector('.k-cat-row');
    if (first) first.focus({ preventScroll: true });
  };
  const closeSheet = () => {
    sheet.hidden = true;
    const back = lastFocus && lastFocus !== document.body ? lastFocus : openBtn;
    back.focus({ preventScroll: true });
  };
  openBtn.addEventListener('click', openSheet);
  container.querySelector('#add-cat-close').addEventListener('click', closeSheet);
  container.querySelector('#add-cat-scrim').addEventListener('click', closeSheet);
  // Escape closes it, the way every other sheet on a phone does.
  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSheet(); }
  });

  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      categoryId = chip.dataset.cat || null;
      container.querySelectorAll('.chip').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      paintCategory();
      closeSheet();
    });
  });

  const amountInput = container.querySelector('#add-amount');
  const dateInput = container.querySelector('#add-date');
  const accountSelect = container.querySelector('#add-account');
  const form = container.querySelector('#add-form');

  // Only the categories that fit the account: business ones for a business
  // account, home ones otherwise. A choice that no longer fits is cleared.
  const fitCategories = () => {
    const business = isBusinessAccount(accounts.find((a) => a.id === accountSelect.value));
    // Commitments are the house's; a business payment never counts towards one.
    const commitmentEl = container.querySelector('#add-commitment');
    if (commitmentEl) {
      commitmentEl.closest('.field').hidden = business;
      if (business) commitmentEl.value = '';
    }
    container.querySelectorAll('#add-categories .chip[data-cat]:not([data-cat=""])').forEach((chip) => {
      chip.hidden = (chip.dataset.business === '1') !== business;
      if (chip.hidden && chip.dataset.cat === categoryId) {
        categoryId = null;
        container.querySelectorAll('#add-categories .chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === ''));
        paintCategory();
      }
    });
  };
  // The mark beside the account name: a real logo if one has been dropped
  // into icons/brands/, otherwise the monogram. Recognition, not decoration.
  const accountMark = container.querySelector('#add-account-mark');
  const paintAccount = () => {
    const chosen = accountSelect.options[accountSelect.selectedIndex];
    accountMark.innerHTML = brandMark(chosen ? chosen.textContent : '', { size: 'sm' });
  };
  accountSelect.addEventListener('change', paintAccount);
  paintAccount();
  paintCategory();

  accountSelect.addEventListener('change', fitCategories);
  fitCategories();
  // A business account's payments are the business's, never the house's, so
  // there is nothing to claim back from an employer on them.
  accountSelect.addEventListener('change', showWorkRows);
  showWorkRows();
  // The next-month row follows the date, the account and the commitment.
  accountSelect.addEventListener('change', showNextMonthRow);
  dateInput.addEventListener('input', showNextMonthRow);
  dateInput.addEventListener('change', showNextMonthRow);
  const commitmentPick = container.querySelector('#add-commitment');
  if (commitmentPick) commitmentPick.addEventListener('change', showNextMonthRow);
  showNextMonthRow();

  // "This repeats" turns a one-off entry into a standing commitment as well,
  // so ₹120 of chai logged once becomes ₹3,650 a month in the plan without
  // you having to work that out or enter it twice.
  // The switch is what you see; the checkbox behind it is what everything
  // else reads, so nothing downstream had to change.
  const repeatsEl = container.querySelector('#add-repeats');
  const repeatsToggle = container.querySelector('#add-repeats-toggle');
  repeatsToggle.addEventListener('click', () => {
    repeatsEl.checked = !repeatsEl.checked;
    repeatsToggle.setAttribute('aria-checked', String(repeatsEl.checked));
    repeatsEl.dispatchEvent(new Event('change'));
  });
  const repeatOptions = container.querySelector('#add-repeat-options');
  const frequencyEl = container.querySelector('#add-frequency');
  const freqPreview = container.querySelector('#add-freq-preview');

  const updateRepeatPreview = () => {
    repeatOptions.hidden = !repeatsEl.checked;
    const raw = parseFloat(amountInput.value);
    if (!repeatsEl.checked || !Number.isFinite(raw) || raw <= 0) {
      freqPreview.hidden = true;
      return;
    }
    const minor = Math.round(raw * 100);
    const monthly = toMonthly(minor, frequencyEl.value);
    const yearly = toYearly(minor, frequencyEl.value);
    freqPreview.hidden = false;
    freqPreview.innerHTML = `That's <strong>${formatCurrency(monthly)} a month</strong> - ${formatCurrency(yearly)} a year.`;
  };
  repeatsEl.addEventListener('change', updateRepeatPreview);
  frequencyEl.addEventListener('change', updateRepeatPreview);
  amountInput.addEventListener('input', updateRepeatPreview);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Math.round(parseFloat(amountInput.value) * 100);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const transaction = {
      id: newId(),
      accountId: accountSelect.value,
      date: dateInput.value || today,
      rawDescription: container.querySelector('#add-desc').value.trim(),
      amount,
      direction,
      categoryId,
      commitmentId: container.querySelector('#add-commitment').value || null,
      source: 'manual',
      importBatchId: null,
      isTransfer: false,
      notes: null,
      // NEW: when it was recorded. History puts same-day payments latest
      // first by this (and by the bank's own time on alerts).
      createdAt: Date.now(),
    };
    if (!transaction.commitmentId) delete transaction.commitmentId;
    // NEW: only the flag that fits the direction is ever written.
    if (direction === 'debit' && reimbEl.checked) transaction.isReimbursable = true;
    if (direction === 'credit' && settleEl.checked) transaction.isSettlement = true;
    // NEW: only with a commitment to apply it to (the switch is disabled
    // without one, and this is the second lock).
    if (direction === 'debit' && nextEl.checked && transaction.commitmentId) transaction.forNextMonth = true;
    await put('transactions', transaction);

    if (repeatsEl.checked) {
      const frequency = frequencyEl.value;
      await put('recurring', {
        id: `fixed-${newId()}`,
        label: transaction.rawDescription || 'Repeating expense',
        amount,
        frequency,
        dayOfMonth: new Date(transaction.date).getDate(),
        categoryId,
        accountId: transaction.accountId,
        active: true,
        source: 'fixed',
      });
      showToast(`Saved · ${formatCurrency(toMonthly(amount, frequency))} a month in your plan`);
    } else {
      showToast(`Saved ${direction === 'debit' ? '-' : '+'}₹${(amount / 100).toLocaleString('en-IN')}`);
    }

    form.reset();
    repeatOptions.hidden = true;
    freqPreview.hidden = true;
    direction = 'debit';
    categoryId = null;
    container.querySelectorAll('.dir-btn').forEach((b) => b.classList.toggle('active', b.dataset.dir === 'debit'));
    container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', !c.dataset.cat));
    dateInput.value = today;
    accountSelect.value = initialAccountId;
    container.querySelector('#add-commitment').value = '';
    showWorkRows();
    showNextMonthRow();
    amountInput.focus();
  });

  amountInput.focus();
}

// The last two days of the month a date is in - the 30th and 31st, or the
// 28th and 29th in February. Exported so History's Edit panel asks the same
// question.
export function isMonthEnd(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return false;
  return d >= new Date(y, m, 0).getDate() - 1;
}

// A switch for a work cost. Same look and same hidden-checkbox arrangement as
// "Repeats every month" above, so nothing new to learn or style. `hidden`
// starts the row out of sight; showWorkRows() decides which one is on show.
function reimbursableSwitch(id, label, sub, hidden = false) {
  return `<div class="k-switch-row" ${hidden ? 'hidden' : ''}>
      <span class="k-switch-row__text" id="${id}-label">${label}
        <span class="k-switch-row__sub" id="${id}-sub">${sub}</span>
      </span>
      <input type="checkbox" id="${id}" class="k-vis-hidden">
      <button type="button" class="k-toggle" id="${id}-toggle" role="switch"
              aria-checked="false" aria-labelledby="${id}-label"></button>
    </div>`;
}

// Which fixed commitment a spend is for. Left on the first choice, the app
// works it out from the commitment's statement words or amount; picking one
// counts the spend towards that commitment and no other - handy for card
// spends whose wording says nothing (a wallet top-up, a shop name).
export function commitmentField(commitments, selected = null, id = 'add-commitment', attributes = '') {
  return `<label class="field">
    <span>Counts towards commitment</span>
    <select id="${id}" ${attributes}>
      <option value="">Let the app work it out</option>
      ${commitments.map((r) => `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${escapeHtml(r.label)}</option>`).join('')}
    </select>
  </label>`;
}

// Which credit card a bill payment paid. A payment through CRED or UPI names
// no card, so without this the app can only guess from the amount.
export function cardPaymentField(cards, selected = null, id = 'add-pays-card', attributes = '') {
  return `<label class="field">
    <span>Which card did this pay?</span>
    <select id="${id}" ${attributes}>
      <option value="">Not a card bill / let the app work it out</option>
      ${cards.map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${escapeHtml(a.label)}</option>`).join('')}
    </select>
  </label>`;
}

// The categories you have actually used lately come first, so the usual spend
// is one tap away and the rest still follow in their own order.
function byRecentUse(categories, transactions) {
  const since = isoLocal(new Date(Date.now() - 90 * 86400000));
  const counts = new Map();
  for (const t of transactions) {
    if (!t.categoryId || t.date < since) continue;
    counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
  }
  if (!counts.size) return categories;
  return [...categories].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
}
