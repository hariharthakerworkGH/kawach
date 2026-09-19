import { getAll, put, remove, newId, getSetting, setSetting } from '../db.js';
import { icon } from '../icons.js';
import { formatCurrency } from '../format.js';
import { isFixed } from '../commitments.js';
import { DEFAULT_KEEP_IN_BANK } from '../free-to-spend.js';
import { tellUser } from '../dialog.js';
import { redraw } from '../redraw.js';
import { BANKS as INDIAN_BANKS } from '../parsers/any-bank.js';
import { playTour } from '../tour.js';

// First-run setup: a few short steps so a new user isn't left facing empty
// screens. Everything it saves is the same data the Plan and Cards screens
// edit, so it can be run again (Settings) or skipped entirely.
//
// Opens by itself only for someone with nothing set up yet - see needsSetup.

const STEPS = ['welcome', 'salary', 'bank', 'cards', 'commitments', 'done'];
// Bank names as the statement readers write them, so an import recognises
// the account without asking.
const BANKS = [...INDIAN_BANKS.map(([label]) => label), 'Other'];

let step = 0;
let shownIn = null;

// The phone's back button goes back a step, the same as the Back button.
export function onBack() {
  if (!shownIn || !shownIn.isConnected || step === 0 || STEPS[step] === 'done') return false;
  step -= 1;
  render(shownIn).then(() => window.scrollTo(0, 0));
  return true;
}

export async function needsSetup() {
  const [done, income, accounts, transactions] = await Promise.all([
    getSetting('setupDone', false),
    getSetting('monthlyIncome', null),
    getAll('accounts'),
    getAll('transactions'),
  ]);
  return !done && income == null && transactions.length === 0 && !accounts.some((a) => a.type !== 'cash');
}

export async function render(container, params = {}) {
  if (params.restart) step = 0;
  shownIn = container;
  const [accounts, recurring, income, salaryDay, keep] = await Promise.all([
    getAll('accounts'),
    getAll('recurring'),
    getSetting('monthlyIncome', null),
    getSetting('salaryDay', null),
    getSetting('keepInBank', DEFAULT_KEEP_IN_BANK),
  ]);
  const banks = accounts.filter((a) => a.type === 'bank');
  const cards = accounts.filter((a) => a.type === 'card');
  const commitments = recurring.filter(isFixed);
  const name = STEPS[step];

  container.innerHTML = `
    <div class="setup">
      ${name === 'welcome' || name === 'done' ? '' : `<p class="setup-progress">Step ${step} of ${STEPS.length - 2}</p>`}
      ${
        {
          welcome: welcomeStep,
          salary: () => salaryStep(income, salaryDay, keep),
          bank: () => accountStep('bank', banks),
          cards: () => accountStep('card', cards),
          commitments: () => commitmentsStep(commitments, [...banks, ...cards]),
          done: doneStep,
        }[name]()
      }
    </div>
  `;
  wire(container, name, { accounts, commitments });
}

function welcomeStep() {
  return `
    <h2 class="setup-title">Know what you can spend</h2>
    <p class="setup-lead">Your salary, minus your fixed commitments, minus what you save - tracked against every card and UPI spend.</p>
    <ul class="setup-points">
      <li>${icon('lock')} Everything stays on this phone.</li>
      <li>${icon('key')} Sync is optional, and encrypted with a passphrase only you know.</li>
      <li>${icon('ban')} No ads, no tracking, no bank logins.</li>
    </ul>
    <p class="setup-note">A tracking tool, not financial advice.</p>
    <button type="button" class="btn-primary" data-go="next">Get started</button>
    <button type="button" class="btn-secondary btn-block" id="setup-tour">Watch the 1-minute tour</button>
    <button type="button" class="btn-tiny btn-block setup-skip" data-go="finish">Skip - I'll set it up myself</button>
  `;
}

function salaryStep(income, salaryDay, keep) {
  return `
    <h2 class="setup-title">Your salary</h2>
    <label class="field">
      <span>Monthly salary (in hand)</span>
      <input type="number" id="setup-income" inputmode="decimal" min="0" step="1" value="${income != null ? Math.round(income / 100) : ''}" placeholder="85000">
    </label>
    <label class="field">
      <span>Day it arrives</span>
      <select id="setup-salary-day">
        ${Array.from({ length: 31 }, (_, i) => i + 1)
          .map((d) => `<option value="${d}" ${d === (salaryDay || 31) ? 'selected' : ''}>${d === 31 ? 'Last day of the month' : d}</option>`)
          .join('')}
      </select>
    </label>
    <label class="field">
      <span>Save each month</span>
      <input type="number" id="setup-keep" inputmode="decimal" min="0" step="1" value="${Math.round((keep ?? DEFAULT_KEEP_IN_BANK) / 100)}">
    </label>
    ${nav()}
  `;
}

function accountStep(type, list) {
  const isCard = type === 'card';
  return `
    <h2 class="setup-title">${isCard ? 'Your credit cards' : 'Your bank account'}</h2>
    ${isCard ? '<p class="setup-lead">Each card\'s billing cycle is read from its first statement.</p>' : ''}
    ${
      list.length
        ? `<div class="totals-card">${list
            .map(
              (a) => `<div class="attention-row"><span>${escapeHtml(a.label)}<br><span class="muted-note">${escapeHtml(a.issuer || '')}${a.last4 ? ` ••${escapeHtml(a.last4)}` : ''}</span></span><button type="button" class="icon-btn setup-remove-account" data-id="${a.id}" aria-label="Remove">${icon('close')}</button></div>`
            )
            .join('')}</div>`
        : ''
    }
    <form class="totals-card" id="setup-account-form">
      <label class="field">
        <span>Name</span>
        <input type="text" id="setup-account-name" placeholder="${isCard ? 'e.g. Rewards card' : 'e.g. Salary account'}" required>
      </label>
      <label class="field">
        <span>Bank</span>
        <select id="setup-account-bank">${BANKS.map((b) => `<option>${b}</option>`).join('')}</select>
      </label>
      <label class="field">
        <span>Last 4 digits</span>
        <input type="text" id="setup-account-last4" inputmode="numeric" maxlength="4" pattern="\\d{4}" placeholder="1234">
      </label>
      <button type="submit" class="btn-secondary btn-block">Add ${isCard ? 'card' : 'account'}</button>
    </form>
    ${nav(list.length ? 'Next' : 'Skip')}
  `;
}

function commitmentsStep(commitments, payers) {
  return `
    <h2 class="setup-title">Fixed monthly commitments</h2>
    <p class="setup-lead">EMIs, rent, money home, ATM cash, subscriptions. Add the big ones now; the rest any time on Plan.</p>
    ${
      commitments.length
        ? `<div class="totals-card">${commitments
            .map((c) => `<div class="totals-row"><span>${escapeHtml(c.label)}</span><span class="out">${formatCurrency(c.amount)}</span></div>`)
            .join('')}</div>`
        : ''
    }
    <form class="totals-card" id="setup-commitment-form">
      <label class="field">
        <span>Name</span>
        <input type="text" id="setup-commitment-name" placeholder="e.g. Home loan EMI" required>
      </label>
      <label class="field">
        <span>Amount each month</span>
        <input type="number" id="setup-commitment-amount" inputmode="decimal" min="1" step="1" required>
      </label>
      <label class="field">
        <span>Paid from</span>
        <select id="setup-commitment-payer">
          <option value="">Bank account</option>
          ${payers.filter((a) => a.type === 'card').map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('')}
          <option value="cash">Cash</option>
        </select>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="setup-commitment-spread">
        <span>Goes out bit by bit (ATM cash, tiffin)</span>
      </label>
      <button type="submit" class="btn-secondary btn-block">Add commitment</button>
    </form>
    ${nav(commitments.length ? 'Next' : 'Skip')}
  `;
}

function doneStep() {
  return `
    <h2 class="setup-title">All set</h2>
    <p class="setup-lead">Now bring in what you've spent - the more the app sees, the more exact it gets.</p>
    <div class="setup-actions">
      <button type="button" class="btn-primary" data-open="import">Import a statement</button>
      <button type="button" class="btn-secondary btn-block" data-open="inbox">Paste a bank SMS</button>
      <button type="button" class="btn-secondary btn-block" data-open="settings">Set up sync or backup</button>
      <button type="button" class="btn-tiny btn-block" data-open="summary">Go to Summary</button>
    </div>
  `;
}

function nav(nextLabel = 'Next') {
  return `
    <div class="setup-nav">
      <button type="button" class="btn-tiny" data-go="back">Back</button>
      <button type="button" class="btn-primary" data-go="next">${nextLabel}</button>
    </div>
  `;
}

function wire(container, name, { accounts }) {
  const again = () => redraw(container, () => render(container));
  const open = (view) => container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view } }));

  container.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.go === 'finish') {
        await setSetting('setupDone', true);
        open('summary');
        return;
      }
      if (btn.dataset.go === 'next' && name === 'salary') await saveSalary(container);
      step = Math.max(0, Math.min(STEPS.length - 1, step + (btn.dataset.go === 'back' ? -1 : 1)));
      if (STEPS[step] === 'done') await setSetting('setupDone', true);
      // A new step starts at its top, unlike a redraw of the same step.
      await render(container);
      window.scrollTo(0, 0);
    });
  });

  container.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => open(btn.dataset.open)));
  container.querySelector('#setup-tour')?.addEventListener('click', playTour);

  const accountForm = container.querySelector('#setup-account-form');
  if (accountForm) {
    accountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = name === 'cards' ? 'card' : 'bank';
      const bank = container.querySelector('#setup-account-bank').value;
      const last4 = container.querySelector('#setup-account-last4').value.trim();
      await put('accounts', {
        id: newId(),
        label: container.querySelector('#setup-account-name').value.trim(),
        type,
        issuer: bank === 'Other' ? null : bank,
        last4: /^\d{4}$/.test(last4) ? last4 : null,
        billingCycleDay: null,
      });
      again();
    });
  }

  container.querySelectorAll('.setup-remove-account').forEach((btn) => {
    btn.addEventListener('click', async () => {
      // Only accounts with nothing on them can be removed here; anything with
      // transactions is deleted from Cards, which warns what goes with it.
      const account = accounts.find((a) => a.id === btn.dataset.id);
      const used = (await getAll('transactions')).some((t) => t.accountId === btn.dataset.id);
      if (used) {
        await tellUser({ title: 'It has transactions', message: `${account.label} already has transactions. Delete it from the Accounts screen instead.` });
        return;
      }
      await remove('accounts', btn.dataset.id);
      again();
    });
  });

  const commitmentForm = container.querySelector('#setup-commitment-form');
  if (commitmentForm) {
    commitmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Math.round(parseFloat(container.querySelector('#setup-commitment-amount').value) * 100);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const spread = container.querySelector('#setup-commitment-spread').checked;
      await put('recurring', {
        id: `fixed-${newId()}`,
        label: container.querySelector('#setup-commitment-name').value.trim(),
        amount,
        frequency: 'monthly',
        dayOfMonth: 1,
        categoryId: null,
        accountId: container.querySelector('#setup-commitment-payer').value || null,
        active: true,
        source: 'fixed',
        ...(spread ? { spread: true } : {}),
      });
      again();
    });
  }
}

async function saveSalary(container) {
  const income = parseFloat(container.querySelector('#setup-income').value);
  const keep = parseFloat(container.querySelector('#setup-keep').value);
  if (Number.isFinite(income) && income > 0) await setSetting('monthlyIncome', Math.round(income * 100));
  await setSetting('salaryDay', parseInt(container.querySelector('#setup-salary-day').value, 10));
  if (Number.isFinite(keep) && keep >= 0) await setSetting('keepInBank', Math.round(keep * 100));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
