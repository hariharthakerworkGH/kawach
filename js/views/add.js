import { put, getAll, newId } from '../db.js';
import { icon } from '../icons.js';
import { CASH_ACCOUNT_ID } from '../config.js';
import { categoryStyle } from '../category-style.js';
import { showToast } from '../toast.js';
import { FREQUENCIES, DEFAULT_FREQUENCY, toMonthly, toYearly } from '../frequency.js';
import { formatCurrency } from '../format.js';
import { isLiveCommitment, byYourOrder } from '../commitments.js';
import { isBusinessCategory, isBusinessAccount, activeSpace, accountInSpace } from '../business.js';

export async function render(container, params = {}) {
  const [categories, allAccounts, recurring, space] = await Promise.all([getAll('categories'), getAll('accounts'), getAll('recurring'), activeSpace()]);
  // The accounts of the lane on screen: Home's, or one business's.
  const accounts = allAccounts.filter(accountInSpace(space));
  const commitments = recurring.filter((r) => isLiveCommitment(r)).sort(byYourOrder);
  // The phone's own date. toISOString() is UTC, which in India is still
  // yesterday until 5:30am - so late-night spends were being dated the day
  // before, and on the 1st of the month, filed under the previous month.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const initialAccountId = params.accountId && accounts.some((a) => a.id === params.accountId) ? params.accountId : CASH_ACCOUNT_ID;

  container.innerHTML = `
    <button type="button" class="alert-shortcut" id="add-from-alert">
      <span>${icon('inbox')} Have a bank SMS for this?</span>
      <span class="alert-shortcut-go">Paste it instead →</span>
    </button>
    <form id="add-form" class="add-form">
      <label class="field amount-field">
        <span>Amount</span>
        <div class="amount-input-wrap">
          <span class="amount-prefix">₹</span>
          <input id="add-amount" class="amount-input" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0" required>
        </div>
      </label>
      <div class="direction-toggle">
        <button type="button" class="dir-btn active" data-dir="debit">Spent</button>
        <button type="button" class="dir-btn" data-dir="credit">Received</button>
      </div>
      <label class="field">
        <span>What</span>
        <input id="add-desc" type="text" placeholder="e.g. coffee" required>
      </label>
      <div class="chip-row" id="add-categories">
        <button type="button" class="chip active" data-cat="">Uncategorized</button>
        ${categories.map((c) => `<button type="button" class="chip" data-cat="${c.id}" data-business="${isBusinessCategory(c) ? '1' : ''}">${categoryStyle(c.name).icon} ${escapeHtml(c.name)}</button>`).join('')}
      </div>
      ${commitmentField(commitments)}
      <label class="field">
        <span>Account</span>
        <select id="add-account">
          ${accounts
            // A loan or the provident fund is not somewhere you spend from.
            .filter((a) => ['bank', 'card', 'cash', 'savings'].includes(a.type))
            .map((a) => `<option value="${a.id}" ${a.id === initialAccountId ? 'selected' : ''}>${escapeHtml(a.label)}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field field-date">
        <span>Date</span>
        <input id="add-date" type="date" value="${today}">
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="add-repeats">
        <span>This repeats - count it in my monthly plan</span>
      </label>
      <div id="add-repeat-options" hidden>
        <label class="field">
          <span>How often</span>
          <select id="add-frequency">
            ${Object.entries(FREQUENCIES)
              .map(([key, f]) => `<option value="${key}" ${key === DEFAULT_FREQUENCY ? 'selected' : ''}>${f.label}</option>`)
              .join('')}
          </select>
        </label>
        <p class="freq-preview" id="add-freq-preview" hidden></p>
      </div>
      <button type="submit" class="btn-primary">Save</button>
    </form>
  `;

  container.querySelector('#add-from-alert').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'inbox' } }));
  });

  let direction = 'debit';
  let categoryId = null;

  container.querySelectorAll('.dir-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      direction = btn.dataset.dir;
      container.querySelectorAll('.dir-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  container.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      categoryId = chip.dataset.cat || null;
      container.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
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
      }
    });
  };
  accountSelect.addEventListener('change', fitCategories);
  fitCategories();

  // "This repeats" turns a one-off entry into a standing commitment as well,
  // so ₹120 of chai logged once becomes ₹3,650 a month in the plan without
  // you having to work that out or enter it twice.
  const repeatsEl = container.querySelector('#add-repeats');
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
    };
    if (!transaction.commitmentId) delete transaction.commitmentId;
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
    amountInput.focus();
  });

  amountInput.focus();
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
