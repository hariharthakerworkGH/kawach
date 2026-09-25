import { getAll, put, remove } from '../db.js';
import { learnFromAssignment } from '../merchant-rules.js';
import { formatCurrency, formatRupees, formatMonthYear } from '../format.js';
import { categoryStyle } from '../category-style.js';
import { categoryIcon } from '../category-icons.js';
import { isSplit, categorySlices, needsCategory, splitTotal } from '../splits.js';
import { showToast } from '../toast.js';
import { askConfirm } from '../dialog.js';
import { isLiveCommitment, byYourOrder } from '../commitments.js';
import { commitmentField, cardPaymentField } from './add.js';
import { looksLikeCardPayment } from '../transfers.js';
import { isoLocal } from '../frequency.js';
import { icon } from '../icons.js';
import { categoriesFor, activeSpace, accountInSpace } from '../business.js';
import { inOutBars } from '../charts.js';
import { escapeHtml, escapeAttr, emptyState } from '../ui.js';

// History: one month at a time, newest first, grouped by day, one line per
// payment. It used to be every transaction ever in one list, with a category
// box under each row, fifty more at a time - an endless scroll where finding
// last month meant scrolling past this one.
//
// A search, or "need a category", looks across every month instead: those
// are questions about all your payments, not one month's.
//
// Tapping a payment opens it: its category, what it is, and what can be done
// with it. Tick boxes appear only after tapping Select.

// A search across years shows this many and then offers more.
const PAGE_SIZE = 150;

const filters = { search: '', accountId: '', categoryId: '', month: '', shown: PAGE_SIZE };
let cache = { transactions: [], categories: [], accounts: [], commitments: [], quick: [] };
let selected = new Set();
let selecting = false;
let expanded = null;
// Draft splits for the row being split, kept out of the database until saved
// so a half-finished split never affects any total.
let splitDraft = null;
let shownIn = null;

// The phone's back button closes what is open here first: a payment, then
// Select. Filters stay: arriving from Summary with one set, back should
// return to Summary.
export function onBack() {
  if (!shownIn || !shownIn.isConnected) return false;
  if (expanded || splitDraft) {
    expanded = null;
    splitDraft = null;
  } else if (selecting) {
    selecting = false;
    selected.clear();
  } else {
    return false;
  }
  renderList(shownIn);
  return true;
}

export async function render(container, params = {}) {
  shownIn = container;
  const [allTransactions, categories, allAccounts, recurring, space] = await Promise.all([getAll('transactions'), getAll('categories'), getAll('accounts'), getAll('recurring'), activeSpace()]);
  // Only the lane on screen: Home's payments, or one business's.
  const accounts = allAccounts.filter(accountInSpace(space));
  const inLane = new Set(accounts.map((a) => a.id));
  const transactions = allTransactions.filter((t) => inLane.has(t.accountId));
  cache = {
    transactions,
    categories,
    accounts,
    commitments: recurring.filter((r) => isLiveCommitment(r)).sort(byYourOrder),
    quick: quickCategories(transactions),
  };
  selected = new Set();
  selecting = false;
  expanded = null;
  splitDraft = null;

  // Opening the screen always starts from a clean slate - a filter left over
  // from last time silently hides transactions with no obvious reason why.
  filters.search = params.search || '';
  filters.accountId = params.accountId || '';
  filters.categoryId = params.filter === 'uncategorized' ? 'uncategorized' : params.categoryId || '';
  filters.month = thisMonth();
  // Opened for one account (from Accounts): its latest month, so an account
  // with nothing yet this month doesn't open on an empty page.
  if (filters.accountId) {
    const latest = transactions.filter((t) => t.accountId === filters.accountId).reduce((m, t) => (t.date > m ? t.date : m), '');
    if (latest && latest.slice(0, 7) < filters.month) filters.month = latest.slice(0, 7);
  }
  filters.shown = PAGE_SIZE;

  container.classList.add('k');
  container.innerHTML = `
    <div class="hist-month" id="hist-month">
      <button type="button" class="icon-btn hist-step" id="month-prev" aria-label="Month before">${icon('back')}</button>
      <span class="hist-month-name" id="month-name"></span>
      <button type="button" class="icon-btn hist-step" id="month-next" aria-label="Month after">${icon('forward')}</button>
    </div>
    <section class="hero" id="hist-hero">
      <div class="hero-top"><span class="hero-label">Net this month</span><span class="hero-label" id="hist-period"></span></div>
      <p class="hero-amount" id="hist-net">&nbsp;</p>
      <p class="hero-status" id="txn-count"></p>
      ${inOutBars({ months: lastSixMonths(transactions) })}
    </section>
    <div class="hero-under" id="hist-stats"></div>
    <div class="hist-top">
      <input type="search" id="txn-search" class="hist-search" placeholder="Search all months" value="${escapeAttr(filters.search)}" aria-label="Search all months">
      <button type="button" id="txn-select" class="btn-secondary hist-select-btn">Change many</button>
    </div>
    <div class="hist-chips">
      <select id="txn-account" class="hist-chip" aria-label="Account">
        <option value="">All accounts</option>
        ${accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('')}
      </select>
      <select id="txn-category" class="hist-chip" aria-label="Category">
        <option value="">All categories</option>
        <option value="uncategorized">Need a category</option>
        ${categoryOptions(null)}
      </select>
      <button type="button" id="txn-needs" class="hist-chip hist-needs" hidden></button>
    </div>
    <div class="txn-summary-row" id="select-row" hidden>
      <span id="select-note"></span>
      <button type="button" id="txn-select-all" class="btn-tiny">Select all</button>
    </div>
    <div id="txn-list" class="hist-list"></div>
    <button type="button" id="txn-more" class="btn-secondary btn-block" hidden></button>
    <button type="button" id="month-older" class="link-btn hist-older" hidden></button>
    <div id="bulk-bar" class="bulk-bar" hidden>
      <span id="bulk-count"></span>
      <select id="bulk-category">
        <option value="">Set category…</option>
        ${categoryOptions(null)}
      </select>
      <button type="button" id="bulk-transfer" class="btn-tiny">Moved</button>
      <button type="button" id="bulk-delete" class="btn-tiny danger">Delete</button>
    </div>
  `;
  syncControls(container);

  const searchEl = container.querySelector('#txn-search');
  searchEl.addEventListener('input', () => {
    filters.search = searchEl.value;
    resetPage(container);
  });
  container.querySelector('#txn-account').addEventListener('change', (e) => {
    filters.accountId = e.target.value;
    resetPage(container);
  });
  container.querySelector('#txn-category').addEventListener('change', (e) => {
    filters.categoryId = e.target.value;
    resetPage(container);
  });
  container.querySelector('#txn-needs').addEventListener('click', () => {
    filters.categoryId = filters.categoryId === 'uncategorized' ? '' : 'uncategorized';
    syncControls(container);
    resetPage(container);
  });

  const step = (delta) => {
    filters.month = shiftMonth(filters.month, delta);
    expanded = null;
    splitDraft = null;
    resetPage(container);
    // A new month is a new page: start at its top.
    const top = container.querySelector('#hist-month').getBoundingClientRect().top + window.scrollY - 80;
    if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
  };
  container.querySelector('#month-prev').addEventListener('click', () => step(-1));
  container.querySelector('#month-next').addEventListener('click', () => step(1));
  container.querySelector('#month-older').addEventListener('click', () => step(-1));

  container.querySelector('#txn-select').addEventListener('click', () => {
    selecting = !selecting;
    if (!selecting) selected.clear();
    expanded = null;
    splitDraft = null;
    renderList(container);
  });

  container.querySelector('#txn-more').addEventListener('click', () => {
    filters.shown += PAGE_SIZE;
    renderList(container);
  });
  container.querySelector('#txn-select-all').addEventListener('click', () => {
    const rows = matching();
    if (selected.size === rows.length) selected.clear();
    else rows.forEach((t) => selected.add(t.id));
    renderList(container);
  });

  container.querySelector('#bulk-category').addEventListener('change', async (e) => {
    const categoryId = e.target.value;
    if (!categoryId) return;
    for (const id of selected) {
      const t = cache.transactions.find((x) => x.id === id);
      if (!t) continue;
      // A split was set up deliberately; a bulk assign shouldn't flatten it.
      if (isSplit(t)) continue;
      t.categoryId = categoryId;
      await put('transactions', t);
      await learnFromAssignment(t.rawDescription, categoryId);
    }
    selected.clear();
    e.target.value = '';
    renderList(container);
  });

  // Moving money to your own investment or savings account isn't spending, and
  // there are usually several at once to clean up - hence a bulk action.
  container.querySelector('#bulk-transfer').addEventListener('click', async () => {
    let n = 0;
    for (const id of selected) {
      const t = cache.transactions.find((x) => x.id === id);
      if (!t || t.isTransfer) continue;
      t.isTransfer = true;
      t.transferManual = true;
      await put('transactions', t);
      n++;
    }
    selected.clear();
    showToast(`${n} marked as moved, not spent`);
    renderList(container);
  });

  container.querySelector('#bulk-delete').addEventListener('click', async () => {
    const sure = await askConfirm({ title: `Delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}?`, message: "This can't be undone.", confirmLabel: 'Delete', danger: true });
    if (!sure) return;
    for (const id of selected) {
      await remove('transactions', id);
      cache.transactions = cache.transactions.filter((x) => x.id !== id);
    }
    selected.clear();
    renderList(container);
  });

  const listEl = container.querySelector('#txn-list');
  // The empty state's one button is the only thing on this screen that leaves it.
  listEl.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: go.dataset.go } }));
  });
  listEl.addEventListener('click', (e) => handleClick(e, container));
  listEl.addEventListener('change', (e) => handleChange(e, container));
  listEl.addEventListener('input', (e) => handleChange(e, container));

  renderList(container);
}

// The controls show the filters as they are, so what you are looking at is
// never a mystery - including filters arrived at from another screen.
function syncControls(container) {
  container.querySelector('#txn-search').value = filters.search;
  container.querySelector('#txn-account').value = filters.accountId;
  container.querySelector('#txn-category').value = filters.categoryId;
}

function resetPage(container) {
  filters.shown = PAGE_SIZE;
  selected.clear();
  renderList(container);
}

// `list`: the categories to offer; a payment is offered the ones that fit
// its account (business or home), the filters every one.
function categoryOptions(selectedId, list = cache.categories) {
  return list
    .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
    .join('');
}

// The categories you use most lately, offered as one-tap choices when a
// payment is opened; everything else is in the list beside them.
function quickCategories(transactions) {
  const since = isoLocal(new Date(Date.now() - 90 * 86400000));
  const counts = new Map();
  for (const t of transactions) {
    if (t.date < since || !t.categoryId) continue;
    counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// Search and "need a category" look at every month; otherwise one month.
function acrossMonths() {
  return Boolean(filters.search.trim()) || filters.categoryId === 'uncategorized';
}

function matching() {
  const needle = filters.search.trim().toLowerCase();
  const month = acrossMonths() ? null : filters.month;
  return cache.transactions
    .filter((t) => {
      if (month && t.date.slice(0, 7) !== month) return false;
      if (filters.accountId && t.accountId !== filters.accountId) return false;
      if (filters.categoryId === 'uncategorized' && !needsCategory(t)) return false;
      if (filters.categoryId && filters.categoryId !== 'uncategorized') {
        if (!categorySlices(t).some((s) => s.categoryId === filters.categoryId)) return false;
      }
      if (needle && !String(t.rawDescription || '').toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Money in and out, leaving out money moved between your own accounts.
function totals(rows) {
  const out = rows.filter((t) => t.direction === 'debit' && !t.isTransfer).reduce((s, t) => s + t.amount, 0);
  const inAmt = rows.filter((t) => t.direction === 'credit' && !t.isTransfer).reduce((s, t) => s + t.amount, 0);
  return { out, in: inAmt };
}

function renderList(container) {
  const rows = matching();
  const across = acrossMonths();
  // A month is always shown whole; only a search across years is shown in
  // parts.
  const visible = across ? rows.slice(0, filters.shown) : rows;
  const earliest = cache.transactions.reduce((m, t) => (!m || t.date < m ? t.date : m), null);
  const hasOlder = Boolean(earliest && earliest.slice(0, 7) < filters.month);

  // The month bar steps between months; while searching it says what is shown.
  container.querySelector('#month-name').textContent = across ? 'All months' : formatMonthYear(`${filters.month}-01`);
  container.querySelector('#month-prev').disabled = across || !hasOlder;
  container.querySelector('#month-next').disabled = across || filters.month >= thisMonth();

  // What the month came to. Net is the one answer: in minus out. A month
  // that kept money reads in the ordinary ink, a month that ate into savings
  // reads red, and zero is neither. In and out sit under it as
  // the two figures that make it up, the same stacked pair Summary uses.
  const sum = totals(rows);
  const net = sum.in - sum.out;
  const netEl = container.querySelector('#hist-net');
  const statsEl = container.querySelector('#hist-stats');
  const periodEl = container.querySelector('#hist-period');
  const heroEl = container.querySelector('#hist-hero');
  periodEl.textContent = across
    ? `${rows.length} found`
    : `${rows.length} payment${rows.length === 1 ? '' : 's'}`;
  if (rows.length) {
    netEl.textContent = `${net < 0 ? '−' : net > 0 ? '+' : ''}${formatRupees(Math.abs(net))}`;
    netEl.className = `hero-amount${net < 0 ? ' negative' : ''}`;
    heroEl.className = `hero${net < 0 ? ' level-over' : ''}`;
    statsEl.innerHTML = `
      <div class="stat"><span class="stat-k">In</span><span class="stat-v in">+${formatRupees(sum.in)}</span></div>
      <div class="stat"><span class="stat-k">Out</span><span class="stat-v out">−${formatRupees(sum.out)}</span></div>`;
  } else {
    netEl.textContent = '-';
    netEl.className = 'hero-amount';
    heroEl.className = 'hero';
    statsEl.innerHTML = '';
  }
  container.querySelector('#txn-count').textContent = rows.length
    ? net > 0
      ? 'More came in than went out.'
      : net < 0
        ? 'More went out than came in.'
        : 'In and out came to the same.'
    : filters.categoryId === 'uncategorized'
      ? 'Every payment has a category'
      : across
        ? 'Nothing matches'
        : 'Nothing this month';

  // The "need a category" chip counts across everything, so it shows whether
  // or not this month has any.
  const needing = cache.transactions.filter(needsCategory).length;
  const needsChip = container.querySelector('#txn-needs');
  needsChip.hidden = needing === 0 && filters.categoryId !== 'uncategorized';
  needsChip.textContent = filters.categoryId === 'uncategorized' ? 'Showing: need a category' : `${needing} need a category`;
  needsChip.classList.toggle('on', filters.categoryId === 'uncategorized');

  container.querySelector('#txn-select').textContent = selecting ? 'Done' : 'Change many';
  container.querySelector('#select-row').hidden = !selecting || rows.length === 0;
  container.querySelector('#select-note').textContent = selected.size ? `${selected.size} ticked` : 'Tick payments to categorise or delete together';
  container.querySelector('#txn-select-all').textContent = selected.size === rows.length && rows.length ? 'Clear' : `Select all ${rows.length}`;

  container.querySelector('#txn-list').innerHTML = cache.transactions.length
    ? groupTemplate(visible, across)
    : emptyState({
        what: 'No payments yet.',
        why: 'Kawach is empty until it sees your spending. Import a statement and the budget, the categories and the months all fill in.',
        action: { label: 'Import a statement', go: 'import' },
      });

  const moreBtn = container.querySelector('#txn-more');
  moreBtn.hidden = rows.length <= visible.length;
  moreBtn.textContent = `Show ${Math.min(PAGE_SIZE, rows.length - visible.length)} more`;

  const older = container.querySelector('#month-older');
  older.hidden = across || !hasOlder;
  older.innerHTML = `${icon('back')} ${formatMonthYear(`${shiftMonth(filters.month, -1)}-01`)}`;

  const bar = container.querySelector('#bulk-bar');
  bar.hidden = selected.size === 0;
  container.querySelector('#bulk-count').textContent = `${selected.size} selected`;
}

// Day by day, each day's payments in one card under its date and total.
// Across months, each month is named above its days.
function groupTemplate(rows, across) {
  let html = '';
  let month = null;
  for (const [day, list] of groupBy(rows, (t) => t.date)) {
    if (across && day.slice(0, 7) !== month) {
      month = day.slice(0, 7);
      html += `<h3 class="hist-month-head">${formatMonthYear(day)}</h3>`;
    }
    const net = list.filter((t) => !t.isTransfer).reduce((s, t) => s + (t.direction === 'credit' ? t.amount : -t.amount), 0);
    html += `
      <div class="hist-day">
        <div class="hist-day-head"><span>${dayLabel(day)}</span>${net ? `<span class="${net > 0 ? 'in' : 'out'}">${net > 0 ? '+' : '−'}${formatRupees(Math.abs(net))}</span>` : ''}</div>
        <div class="hist-day-card">${list.map(rowTemplate).join('')}</div>
      </div>`;
  }
  return html;
}

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return groups;
}

function catName(id) {
  return cache.categories.find((c) => c.id === id)?.name || null;
}

function rowTemplate(t) {
  const isOpen = expanded === t.id;
  const split = isSplit(t);
  const account = cache.accounts.find((a) => a.id === t.accountId);
  const style = split ? { icon: categoryIcon('split'), color: 'var(--cat-none)' } : t.categoryId ? categoryStyle(catName(t.categoryId)) : { icon: categoryIcon('question'), color: 'var(--cat-uncategorized)' };
  const sign = t.direction === 'credit' ? '+' : '−';
  // Money moved between your own accounts is neither in nor out: grey.
  const tone = t.isTransfer ? 'muted' : t.direction === 'credit' ? 'in' : 'out';
  const sub = [account ? escapeHtml(account.label) : '', t.isTransfer ? 'moved' : '', split ? 'split' : ''].filter(Boolean).join(' · ');
  return `
    <div class="hist-row ${isOpen ? 'open' : ''} ${selected.has(t.id) ? 'selected' : ''}" data-id="${t.id}">
      <div class="hist-line">
        ${selecting ? `<input type="checkbox" class="txn-check" ${selected.has(t.id) ? 'checked' : ''} aria-label="Select">` : ''}
        <button type="button" class="txn-main hist-main" aria-expanded="${isOpen}">
          <span class="cat-chip hist-cat" style="--chip-color:${style.color}">${style.icon}</span>
          <span class="hist-text">
            <span class="hist-name">${escapeHtml(displayName(t.rawDescription))}</span>
            <span class="hist-sub">${sub}</span>
          </span>
          <span class="txn-amount ${tone}">${sign}${formatRupees(t.amount)}</span>
        </button>
      </div>
      ${isOpen ? expandedTemplate(t) : ''}
    </div>
  `;
}

// The categories that fit a payment's account: business or home.
function fitting(t) {
  return categoriesFor(cache.categories, cache.accounts.find((a) => a.id === t.accountId));
}

function expandedTemplate(t) {
  if (splitDraft && splitDraft.id === t.id) return splitTemplate(t);
  const split = isSplit(t);
  const fits = fitting(t);
  const quick = cache.quick.filter((id) => fits.some((c) => c.id === id)).slice(0, 4);
  const chip = (id) => {
    const name = catName(id);
    return `<button type="button" class="plan-chip hist-cat-pick ${t.categoryId === id ? 'on' : ''}" data-cat="${id}" aria-pressed="${t.categoryId === id}">${categoryStyle(name).icon} ${escapeHtml(name)}</button>`;
  };
  return `
    <div class="txn-expanded">
      <p class="muted-note hist-raw">${escapeHtml(t.rawDescription)} · ${formatFull(t.date)} · ${formatCurrency(t.amount)}</p>
      ${
        split
          ? `<p class="muted-note">${t.splits
              .map((s) => `${categoryStyle(catName(s.categoryId)).icon} ${escapeHtml(catName(s.categoryId) || 'Needs a category')} ${formatRupees(s.amount)}`)
              .join(' · ')}</p>`
          : `<div class="hist-cats">
              ${quick.map(chip).join('')}
              <select class="txn-cat hist-cat-more ${t.categoryId ? '' : 'needs-category'}" data-field="categoryId" aria-label="Category">
                <option value="">${t.categoryId ? 'Other…' : 'Needs a category'}</option>
                ${categoryOptions(quick.includes(t.categoryId) ? null : t.categoryId, fits)}
              </select>
            </div>`
      }
      ${
        paysCardLike(t)
          ? cardPaymentField(cache.accounts.filter((a) => a.type === 'card'), t.paysCardId, `pays-card-${t.id}`, 'class="rv-field" data-field="paysCardId"')
          : ''
      }
      ${t.direction === 'debit' && !paysCardLike(t) ? commitmentField(cache.commitments, t.commitmentId, `commitment-${t.id}`, 'class="rv-field" data-field="commitmentId"') : ''}
      <details class="loan-detail hist-edit">
        <summary>Edit</summary>
        <div class="txn-edit-row">
          <input type="date" class="rv-field" data-field="date" value="${t.date}" aria-label="Date">
          <div class="direction-toggle small">
            <button type="button" class="dir-btn rv-dir ${t.direction === 'debit' ? 'active' : ''}" data-dir="debit">Spent</button>
            <button type="button" class="dir-btn rv-dir ${t.direction === 'credit' ? 'active' : ''}" data-dir="credit">Received</button>
          </div>
        </div>
        <input type="text" class="rv-field rv-desc" data-field="rawDescription" value="${escapeAttr(t.rawDescription)}" aria-label="Description">
        <input type="number" step="0.01" class="rv-field rv-amount-input" data-field="amount" value="${(t.amount / 100).toFixed(2)}" aria-label="Amount">
      </details>
      <div class="hist-actions">
        <button type="button" class="link-btn txn-split-btn">${split ? 'Edit split' : 'Split'}</button>
        <button type="button" class="link-btn review-transfer-toggle">${t.isTransfer ? 'Counts as spending' : 'Moved, not spent'}</button>
        <button type="button" class="link-btn danger txn-delete">Delete</button>
      </div>
    </div>
  `;
}

// A bank payment that could be a credit card bill: worded like one (CRED, CC
// payment), already marked as money moved, or already assigned to a card.
function paysCardLike(t) {
  const account = cache.accounts.find((a) => a.id === t.accountId);
  if (!account || account.type !== 'bank' || t.direction !== 'debit') return false;
  return Boolean(t.paysCardId) || looksLikeCardPayment(t, 'bank') || (t.isTransfer && !/\b(ATW|NWD|ATM)\b/i.test(t.rawDescription || ''));
}

function splitTemplate(t) {
  const assigned = splitTotal(splitDraft.rows);
  const remainder = t.amount - assigned;
  return `
    <div class="txn-expanded">
      <span class="split-badge">Split ${formatCurrency(t.amount)}</span>
      <div class="split-list">
        ${splitDraft.rows
          .map(
            (row, i) => `
          <div class="split-row" data-index="${i}">
            <select class="split-cat">
              <option value="">Pick a category</option>
              ${categoryOptions(row.categoryId, fitting(t))}
            </select>
            <input type="number" step="0.01" class="split-amount" value="${row.amount ? (row.amount / 100).toFixed(2) : ''}" placeholder="0.00">
            <button type="button" class="icon-btn danger split-remove" aria-label="Remove">${icon('close')}</button>
          </div>`
          )
          .join('')}
      </div>
      <div class="split-remainder ${remainder === 0 ? 'good' : 'bad'}">
        ${remainder === 0 ? 'Adds up exactly' : remainder > 0 ? `${formatCurrency(remainder)} still unassigned` : `${formatCurrency(-remainder)} over the transaction amount`}
      </div>
      <div class="txn-edit-row">
        <button type="button" class="btn-tiny split-add">Add a part</button>
        <button type="button" class="btn-tiny primary split-save" ${remainder === 0 ? '' : 'disabled'}>Save split</button>
        <button type="button" class="icon-btn split-cancel">Cancel</button>
        ${isSplit(t) ? '<button type="button" class="icon-btn danger split-clear">Remove split</button>' : ''}
      </div>
    </div>
  `;
}

async function setCategory(t, categoryId, container, rowEl) {
  t.categoryId = categoryId;
  await put('transactions', t);
  if (categoryId) await learnFromAssignment(t.rawDescription, categoryId);
  // Working through "need a category": the row goes once it has one.
  if (filters.categoryId === 'uncategorized' && categoryId) {
    expanded = null;
    rowEl.remove();
    showToast(`${catName(categoryId)}`);
  }
  renderList(container);
}

async function handleChange(e, container) {
  const rowEl = e.target.closest('.hist-row');
  if (!rowEl) return;
  const t = cache.transactions.find((x) => x.id === rowEl.dataset.id);
  if (!t) return;

  if (e.target.classList.contains('txn-check')) {
    if (e.target.checked) selected.add(t.id);
    else selected.delete(t.id);
    rowEl.classList.toggle('selected', e.target.checked);
    container.querySelector('#bulk-bar').hidden = selected.size === 0;
    container.querySelector('#bulk-count').textContent = `${selected.size} selected`;
    container.querySelector('#select-note').textContent = selected.size ? `${selected.size} ticked` : 'Tick the ones to change';
    return;
  }

  // Split editor fields live only in the draft until saved.
  const splitRow = e.target.closest('.split-row');
  if (splitRow && splitDraft) {
    const i = Number(splitRow.dataset.index);
    if (e.target.classList.contains('split-cat')) splitDraft.rows[i].categoryId = e.target.value || null;
    if (e.target.classList.contains('split-amount')) {
      const parsed = parseFloat(e.target.value);
      splitDraft.rows[i].amount = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
      updateRemainder(container, t);
    }
    return;
  }

  const field = e.target.dataset.field;
  if (!field) return;

  if (field === 'categoryId') {
    if (e.type !== 'change') return;
    await setCategory(t, e.target.value || null, container, rowEl);
    return;
  }

  if (field === 'paysCardId') {
    const paysCardId = e.target.value || null;
    if (paysCardId) {
      t.paysCardId = paysCardId;
      // Paying a card bill is money moved, and that's your decision now.
      t.isTransfer = true;
      t.transferManual = true;
    } else {
      delete t.paysCardId;
    }
    await put('transactions', t);
    showToast(paysCardId ? "Counted as that card's bill payment" : 'Card cleared');
    return;
  }

  if (field === 'commitmentId') {
    const commitmentId = e.target.value || null;
    if (commitmentId) {
      t.commitmentId = commitmentId;
      // Picking it overrides an earlier "Not this" for the same commitment.
      if (t.notCommitmentIds) t.notCommitmentIds = t.notCommitmentIds.filter((id) => id !== commitmentId);
    } else {
      delete t.commitmentId;
    }
    await put('transactions', t);
    showToast(commitmentId ? 'Counts towards that commitment' : 'The app will work it out');
    return;
  }

  // Typed edits save as you go and update the row's line in place, without
  // redrawing it and closing the keyboard.
  if (field === 'amount') {
    const parsed = parseFloat(e.target.value);
    t.amount = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
    const amountEl = rowEl.querySelector('.txn-amount');
    if (amountEl) amountEl.textContent = `${t.direction === 'credit' ? '+' : '−'}${formatRupees(t.amount)}`;
  } else if (field === 'date') {
    if (!e.target.value) return;
    t.date = e.target.value;
  } else if (field === 'rawDescription') {
    t.rawDescription = e.target.value;
    const nameEl = rowEl.querySelector('.hist-name');
    if (nameEl) nameEl.textContent = displayName(t.rawDescription);
  }
  await put('transactions', t);
}

// Live feedback while typing split amounts, without re-rendering the row and
// stealing focus from the input being typed into.
function updateRemainder(container, t) {
  const el = container.querySelector('.split-remainder');
  if (!el) return;
  const remainder = t.amount - splitTotal(splitDraft.rows);
  el.classList.toggle('good', remainder === 0);
  el.classList.toggle('bad', remainder !== 0);
  el.textContent =
    remainder === 0
      ? 'Adds up exactly'
      : remainder > 0
        ? `${formatCurrency(remainder)} still unassigned`
        : `${formatCurrency(-remainder)} over the transaction amount`;
  const saveBtn = container.querySelector('.split-save');
  if (saveBtn) saveBtn.disabled = remainder !== 0;
}

async function handleClick(e, container) {
  const rowEl = e.target.closest('.hist-row');
  if (!rowEl) return;
  const t = cache.transactions.find((x) => x.id === rowEl.dataset.id);
  if (!t) return;

  if (e.target.closest('.hist-main')) {
    // In Select, a tap ticks the row rather than opening it.
    if (selecting) {
      if (selected.has(t.id)) selected.delete(t.id);
      else selected.add(t.id);
      renderList(container);
      return;
    }
    expanded = expanded === t.id ? null : t.id;
    splitDraft = null;
    renderList(container);
    return;
  }

  const pick = e.target.closest('.hist-cat-pick');
  if (pick) {
    // Tapping the category it already has takes it off again.
    await setCategory(t, t.categoryId === pick.dataset.cat ? null : pick.dataset.cat, container, rowEl);
    return;
  }

  if (e.target.closest('.txn-split-btn')) {
    splitDraft = {
      id: t.id,
      rows: isSplit(t)
        ? t.splits.map((s) => ({ ...s }))
        : [
            { categoryId: t.categoryId || null, amount: t.amount },
            { categoryId: null, amount: 0 },
          ],
    };
    renderList(container);
    return;
  }

  if (e.target.closest('.split-add')) {
    splitDraft.rows.push({ categoryId: null, amount: 0 });
    renderList(container);
    return;
  }

  const removeBtn = e.target.closest('.split-remove');
  if (removeBtn) {
    const i = Number(removeBtn.closest('.split-row').dataset.index);
    splitDraft.rows.splice(i, 1);
    if (splitDraft.rows.length === 0) splitDraft.rows.push({ categoryId: null, amount: 0 });
    renderList(container);
    return;
  }

  if (e.target.closest('.split-cancel')) {
    splitDraft = null;
    renderList(container);
    return;
  }

  if (e.target.closest('.split-clear')) {
    delete t.splits;
    await put('transactions', t);
    splitDraft = null;
    renderList(container);
    return;
  }

  if (e.target.closest('.split-save')) {
    const rows = splitDraft.rows.filter((r) => r.amount > 0);
    if (splitTotal(rows) !== t.amount) return;
    t.splits = rows;
    // The top-level category becomes meaningless once split, and leaving a
    // stale one there would double-count in anything that misses the splits.
    t.categoryId = null;
    await put('transactions', t);
    for (const r of rows) {
      if (r.categoryId) await learnFromAssignment(t.rawDescription, r.categoryId);
    }
    splitDraft = null;
    renderList(container);
    return;
  }

  if (e.target.closest('.txn-delete')) {
    const sure = await askConfirm({ title: 'Delete this transaction?', message: `${t.rawDescription.slice(0, 80)}. This can't be undone.`, confirmLabel: 'Delete', danger: true });
    if (!sure) return;
    await remove('transactions', t.id);
    cache.transactions = cache.transactions.filter((x) => x.id !== t.id);
    selected.delete(t.id);
    expanded = null;
    renderList(container);
    return;
  }

  if (e.target.closest('.review-transfer-toggle')) {
    t.isTransfer = !t.isTransfer;
    // Remember that this was a human decision so auto-detection never
    // overrules it on a later import or app start.
    t.transferManual = true;
    await put('transactions', t);
    renderList(container);
    return;
  }

  const dirBtn = e.target.closest('.rv-dir');
  if (dirBtn) {
    t.direction = dirBtn.dataset.dir;
    await put('transactions', t);
    renderList(container);
  }
}

// A name you can recognise from a bank narration: the merchant, without the
// channel, reference numbers and codes around it. "UPI-SWIGGY-swiggy@icici-
// 123456789012-PAYMENT" reads as "Swiggy". The whole narration is one tap away.
const NOISE = /^(upi|neft|imps|rtgs|pos|ach|ecs|nach|mb|ib|inb|ft|trf|tfr|to|by|from|dr|cr|txn|ref|payment|paid|via|p2m|p2a|debit|credit|card|purchase|the|of|and|for|in|at|on|ltd|limited|pvt|private|india|com|co|ok|oksbi|okaxis|okhdfcbank|okicici|ybl|ibl|axl|paytm)$/i;

export function displayName(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'Payment';
  const words = text
    // A UPI id ("swiggy@icici"), but not the words hyphenated before it.
    .replace(/[a-z0-9._]+@[a-z]+/gi, ' ')
    .split(/[^A-Za-z0-9&']+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !(w.length >= 7 && /\d/.test(w)) && !NOISE.test(w));
  const name = words.slice(0, 3).join(' ');
  if (!name) return text.slice(0, 32);
  // Statements shout; names read better in ordinary case.
  return name === name.toUpperCase() ? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : name;
}

function thisMonth() {
  return isoLocal(new Date()).slice(0, 7);
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  return isoLocal(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Thu 18 Sep", or "Today" and "Yesterday".
function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = isoLocal(new Date());
  if (iso === today) return 'Today';
  if (iso === isoLocal(new Date(Date.now() - 86400000))) return 'Yesterday';
  return `${DAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

function formatFull(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// Six months of money in and out, for the drawing above the list: is this
// month normal for me? Transfers between your own accounts are money moved,
// never money in or out.
function lastSixMonths(transactions) {
  const now = new Date();
  const months = [];
  for (let back = 5; back >= 0; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rows = transactions.filter((t) => !t.isTransfer && t.date.slice(0, 7) === key);
    months.push({
      label: d.toLocaleDateString('en-IN', { month: 'short' }),
      in: rows.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amount, 0),
      out: rows.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amount, 0),
    });
  }
  return months;
}
