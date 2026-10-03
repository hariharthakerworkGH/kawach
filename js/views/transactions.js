import { getAll, put, remove, getSetting, setSetting } from '../db.js';
import { countsFor, nextMonthKey, salaryLike } from '../spending-month.js';
import { isLoanAccount, loanCommitment } from '../loans.js';
import { personNamed } from '../people.js';
import { learnFromAssignment } from '../merchant-rules.js';
import { formatCurrency, formatRupees, formatMonthYear, formatDateNice } from '../format.js';
import { categoryStyle } from '../category-style.js';
import { categoryIcon } from '../category-icons.js';
import { isSplit, categorySlices, needsCategory, splitTotal } from '../splits.js';
import { showToast } from '../toast.js';
import { askConfirm } from '../dialog.js';
import { isLiveCommitment, byYourOrder, salaryDayPayments } from '../commitments.js';
import { commitmentField, cardPaymentField, isMonthEnd } from './add.js';
import { looksLikeCardPayment, cashSide } from '../transfers.js';
import { isoLocal } from '../frequency.js';
import { icon } from '../icons.js';
import { categoriesFor, activeSpace, accountInSpace, isBusinessAccount } from '../business.js';
import { tidyFlags } from '../reimbursable.js';
import { inOutBars, cashRiver } from '../charts.js';
import { appearance } from '../appearance.js';
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
let cache = { transactions: [], categories: [], accounts: [], commitments: [], quick: [], people: [] };
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
  const [allTransactions, categories, allAccounts, recurring, space, people] = await Promise.all([getAll('transactions'), getAll('categories'), getAll('accounts'), getAll('recurring'), activeSpace(), getSetting('people', [])]);
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
    people,
  };
  selected = new Set();
  selecting = false;
  expanded = null;
  splitDraft = null;
  await fileSalaries(allAccounts);

  // Opening the screen always starts from a clean slate - a filter left over
  // from last time silently hides transactions with no obvious reason why.
  filters.search = params.search || '';
  filters.accountId = params.accountId || '';
  filters.categoryId = params.filter === 'uncategorized' ? 'uncategorized' : params.categoryId || '';
  // A month asked for by another screen (Summary's "See September's payments")
  // opens on that month, if it is a real one and not in the future.
  filters.month = /^\d{4}-\d{2}$/.test(params.month || '') && params.month <= thisMonth() ? params.month : thisMonth();
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
    <div id="hist-salary"></div>
    <section class="hero" id="hist-hero">
      <div class="hero-top"><span class="hero-label">Net this month</span><span class="hero-label" id="hist-period"></span></div>
      <p class="hero-amount" id="hist-net">&nbsp;</p>
      <p class="hero-status" id="txn-count"></p>
      ${sixMonthCharts(lastSixMonths(transactions, accounts), appearance('history'))}
    </section>
    <div class="hero-under" id="hist-stats"></div>
    <div id="hist-days"></div>
    <div class="hist-top">
      <input type="search" id="txn-search" class="hist-search" placeholder="Name or amount" value="${escapeAttr(filters.search)}" aria-label="Search all months">
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
  // NEW (5.15): in Tactile, Peaks and Mindora, In and Out sit on the net's
  // own card, as their mockups have them, and the day chart gets a card of
  // its own. The elements move with their ids, so filling them in later is
  // unchanged.
  if (['tactile', 'peaks', 'mindora'].includes(document.documentElement.dataset.style)) {
    container.querySelector('#hist-net').after(container.querySelector('#hist-stats'));
    container.querySelector('#hist-days').classList.add('hist-days-card');
  }
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
      await save(t);
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
      await save(t);
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

  // A day on the chart takes you to that day in the list.
  container.querySelector('#hist-days').addEventListener('click', (e) => {
    const bar = e.target.closest('[data-day]');
    const day = bar && container.querySelector(`.hist-day[data-day="${bar.dataset.day}"]`);
    if (!day) return;
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    day.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    day.classList.remove('is-picked');
    void day.offsetWidth;
    day.classList.add('is-picked');
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

// What a search matches. Words on the line, and - when a number is typed -
// the amount itself, because a bank line rarely says what it cost: "30000"
// has to find a 30,000 payment whose line reads "IMPS-900000000014-01".
// That is what makes two costs of the same size comparable by eye.
export function searchHit(t, needle) {
  if (String(t.rawDescription || '').toLowerCase().includes(needle)) return true;
  return /^[0-9]+$/.test(needle) && String(Math.round(t.amount / 100)) === needle;
}

// Every edit saves through here. put() stamps updatedAt, and for a payment
// saved before 4.16 (no createdAt) that stamp was the only record of when it
// was recorded - so one tap on a category would send it to the top of its day.
// The earlier stamp is kept as createdAt first, once, before it is overwritten.
function save(t) {
  if (!t.createdAt && t.updatedAt) t.createdAt = t.updatedAt;
  return put('transactions', t);
}
function matching() {
  const needle = filters.search.trim().toLowerCase();
  const month = acrossMonths() ? null : filters.month;
  return cache.transactions
    .filter((t) => {
      if (month && countsFor(t) !== month) return false;
      if (filters.accountId && t.accountId !== filters.accountId) return false;
      if (filters.categoryId === 'uncategorized' && !needsCategory(t)) return false;
      if (filters.categoryId && filters.categoryId !== 'uncategorized') {
        if (!categorySlices(t).some((s) => s.categoryId === filters.categoryId)) return false;
      }
      if (needle && !searchHit(t, needle)) return false;
      return true;
    })
    .sort(newestFirst);
}

// FIXED: this used to compare dates only, so payments sharing a day kept
// whatever order the database handed them back in (random ids), and a payment
// added a minute ago could sit below one from the morning.
//
// Within a day, latest first, by the time of day it happened:
//   - the bank's own time, where an alert carried one (`time`, "23:23");
//   - otherwise the moment it was recorded (`createdAt`), counted only when
//     that was the same day - a payment typed in later for an earlier day has
//     no time of day to speak of;
//   - rows with neither (statement imports, anything from before this change)
//     sit at the bottom of their day, then by when they were recorded, then by
//     id, so the order is the same every time the screen is drawn.
// Every step compares one fixed value, so this is a proper ordering and never
// shuffles. Exported so it can be tested.
export function newestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ta = secondOfDay(a);
  const tb = secondOfDay(b);
  if (ta !== tb) return tb - ta;
  const ca = a.createdAt || 0;
  const cb = b.createdAt || 0;
  if (ca !== cb) return cb - ca;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// The time of day a payment happened, as best it is known:
//   1. a time set on it - the bank's own on an alert, or one you typed in Edit;
//   2. the moment it was recorded (createdAt);
//   3. for a payment saved before createdAt existed, the moment it was last
//      saved (updatedAt). Right for one never edited, which is nearly all of
//      the alerts saved the day they arrived; a payment edited since has lost
//      its first time, and the Time box in Edit is how to give it back.
// 2 and 3 count only when that was the day of the payment itself: one typed in
// later for an earlier day has no time of day to speak of.
function secondOfDay(t) {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t.time || '');
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
  for (const when of [t.createdAt, t.updatedAt]) {
    if (!when) continue;
    const d = new Date(when);
    if (isoLocal(d) === t.date) return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    // A createdAt on another day is a firm "no time of day": do not fall
    // through to a later updatedAt that only says when it was last touched.
    if (t.createdAt) break;
  }
  return -1;
}

// Money in and out, leaving out money moved between your own accounts.
// In or out for this screen: what left or reached the bank (cashSide). With
// one card picked in the account filter, that card's own purchases and
// refunds instead, or a card would always read nothing.
function sideOf(t) {
  const byId = (id) => cache.accounts.find((a) => a.id === id);
  const picked = byId(filters.accountId);
  if (picked && picked.type === 'card') return t.isTransfer ? null : t.direction === 'credit' ? 'in' : 'out';
  return cashSide(t, byId(t.accountId));
}

function totals(rows) {
  const sum = (side) => rows.filter((t) => sideOf(t) === side).reduce((s, t) => s + t.amount, 0);
  return { out: sum('out'), in: sum('in') };
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
  container.querySelector('#hist-days').innerHTML = across ? '' : dayChart(rows, filters.month);
  salaryQuestion(container, across);
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
    // The day's figure by the same rule as the month's (sideOf).
    const net = list.reduce((s, t) => s + (sideOf(t) === 'in' ? t.amount : sideOf(t) === 'out' ? -t.amount : 0), 0);
    html += `
      <div class="hist-day" data-day="${day}">
        <div class="hist-day-head"><span>${dayLabel(day)}</span>${net ? `<span class="${net > 0 ? 'in' : 'out'}">${net > 0 ? '+' : '−'}${formatRupees(Math.abs(net))}</span>` : ''}</div>
        <div class="hist-day-card">${list.map(rowTemplate).join('')}</div>
      </div>`;
  }
  return html;
}

// The month day by day: a bar for what went out each day (money moved between
// your own accounts left out, as in the totals), the biggest day named under
// it. A bar is a button that takes you to that day in the list. Nothing went
// out, no chart. Exported so it can be tested.
export function dayChart(rows, month) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = new Array(days).fill(0);
  for (const t of rows) {
    if (sideOf(t) !== 'out' || t.date.slice(0, 7) !== month) continue;
    out[Number(t.date.slice(8, 10)) - 1] += t.amount;
  }
  const top = Math.max(...out);
  if (top <= 0) return '';
  const big = out.indexOf(top);
  const iso = (i) => `${month}-${String(i + 1).padStart(2, '0')}`;
  const bars = out
    .map((v, i) =>
      v > 0
        ? `<button type="button" class="hist-days__bar${i === big ? ' is-top' : ''}" data-day="${iso(i)}" style="--h:${Math.max(6, (v / top) * 100).toFixed(1)}%;--i:${i}" aria-label="${formatDateNice(iso(i))}: ${formatRupees(v)} out"></button>`
        : '<i class="hist-days__none"></i>',
    )
    .join('');
  return `<div class="hist-days">
      <div class="hist-days__bars">${bars}</div>
      <p class="hist-days__top">Biggest day <strong>${formatRupees(top)}</strong> on ${formatDateNice(iso(big))}</p>
    </div>`;
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
  const sub = subHtml(t);
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

// The small line under a payment's name. Pulled out of rowTemplate so the Edit
// panel can refresh it in place when a work flag is ticked.
//
// NEW: a quiet tag for a work cost still to be claimed, and for the money that
// settled one. Not shown on money moved between your own accounts, which the
// totals ignore too.
function subHtml(t) {
  const account = cache.accounts.find((a) => a.id === t.accountId);
  const person = t.personId && !t.isTransfer ? cache.people.find((p) => p.id === t.personId) : null;
  const elsewhere = countsFor(t) !== t.date.slice(0, 7);
  const workTag = t.isTransfer
    ? ''
    : elsewhere
      ? `<span class="hist-tag hist-tag--in">For ${formatMonthYear(`${countsFor(t)}-01`).split(' ')[0]}</span>`
    : person
      ? `<span class="hist-tag${t.direction === 'credit' ? ' hist-tag--in' : ''}">${escapeHtml(person.name)}</span>`
    : t.direction === 'debit' && t.isReimbursable
      ? '<span class="hist-tag">Owed back</span>'
      : t.direction === 'credit' && t.isSettlement
        ? '<span class="hist-tag hist-tag--in">Paid back</span>'
        : '';
  const bill = cardBill(t);
  const text = [account ? escapeHtml(account.label) : '', bill ? 'card bill' : t.isTransfer ? 'moved' : '', isSplit(t) ? 'split' : ''].filter(Boolean).join(' · ');
  // With a tag, the words go in their own box so that on a narrow screen it is
  // the account name that is cut short, never the tag.
  return workTag ? `<span class="hist-sub-text">${text}</span>${workTag}` : text;
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
          : t.personId
            ? '' // a person's money is under them, not in a category
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
      ${t.direction === 'debit' && !paysCardLike(t) && !t.personId ? commitmentField(cache.commitments, t.commitmentId, `commitment-${t.id}`, 'class="rv-field" data-field="commitmentId"') : ''}
      <details class="loan-detail hist-edit">
        <summary>Edit</summary>
        <div class="txn-edit-row">
          <input type="date" class="rv-field" data-field="date" value="${t.date}" aria-label="Date">
          <div class="direction-toggle small">
            <button type="button" class="dir-btn rv-dir ${t.direction === 'debit' ? 'active' : ''}" data-dir="debit">Spent</button>
            <button type="button" class="dir-btn rv-dir ${t.direction === 'credit' ? 'active' : ''}" data-dir="credit">Received</button>
          </div>
        </div>
        <label class="hist-flag hist-time">
          <span>Time</span>
          <input type="time" class="rv-field" data-field="time" value="${/^\d{2}:\d{2}/.test(t.time || '') ? t.time.slice(0, 5) : ''}" aria-label="Time of day">
        </label>
        <input type="text" class="rv-field rv-desc" data-field="rawDescription" value="${escapeAttr(t.rawDescription)}" aria-label="Description">
        <input type="number" step="0.01" class="rv-field rv-amount-input" data-field="amount" value="${(t.amount / 100).toFixed(2)}" aria-label="Amount">
        ${workFlagField(t)}
        ${nextMonthField(t)}
        ${salaryMonthField(t)}
      </details>
      ${personField(t)}
      <div class="hist-actions">
        <button type="button" class="link-btn txn-split-btn">${split ? 'Edit split' : 'Split'}</button>
        ${cardBill(t) ? '' : `<button type="button" class="link-btn review-transfer-toggle">${t.isTransfer ? 'Counts as spending' : 'Moved, not spent'}</button>`}
        <button type="button" class="link-btn danger txn-delete">Delete</button>
      </div>
    </div>
  `;
}

// NEW: the work-cost checkbox in a payment's Edit panel. It reads the saved
// flag, so what was ticked when the payment was added is ticked here, and
// saving writes the same field back. Money out can be Reimbursable; money in
// can settle one. Neither is offered on money moved between your own accounts
// or on a business account, where the app would ignore the flag anyway.
function workFlagField(t) {
  const account = cache.accounts.find((a) => a.id === t.accountId);
  if (t.isTransfer || (account && isBusinessAccount(account))) return '';
  const debit = t.direction === 'debit';
  const field = debit ? 'isReimbursable' : 'isSettlement';
  return `<label class="hist-flag">
      <input type="checkbox" class="rv-field" data-field="${field}" ${t[field] ? 'checked' : ''}>
      <span>${debit ? 'Reimbursable (Work)' : 'Settles a reimbursement'}</span>
    </label>`;
}

// A card bill paid from the bank: out the day it is paid (cashSide), so
// "Moved, not spent" has nothing to change on it.
function cardBill(t) {
  const account = cache.accounts.find((a) => a.id === t.accountId);
  return Boolean(account && account.type !== 'card' && t.direction === 'debit' && (t.paysCardId || looksLikeCardPayment(t, 'bank')));
}

// NEW (5.22): salary at the end of a month. History asks once, the first time
// it sees one; after a yes every salary is filed under the month it pays for
// as it arrives, and after a no none is. Either way any one payment can be
// switched in its Edit panel.
let salaryAsk = null;
async function fileSalaries(accounts) {
  const [income, kind, choice] = await Promise.all([getSetting('monthlyIncome', null), getSetting('incomeType', 'salary'), getSetting('salaryNextMonth', null)]);
  salaryAsk = null;
  if (kind === 'business' || choice === false) return;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const found = cache.transactions.filter((t) => salaryLike(t, byId.get(t.accountId), income)).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (choice !== true) {
    salaryAsk = found[0] || null;
    return;
  }
  for (const t of found) {
    t.countsFor = nextMonthKey(t.date.slice(0, 7));
    await save(t);
  }
  // And what that salary paid for the month after, on the day it landed:
  // rent, EMIs and the other commitments with a set day, from the salary's
  // date to the month's end. Only for a salary filed ahead, never one you
  // left in its own month.
  const homeBanks = new Set(accounts.filter((a) => (a.type === 'bank' || a.type === 'savings') && !a.business).map((a) => a.id));
  const commitments = [...cache.commitments.filter((c) => !c.space || c.space === 'home'), ...accounts.filter(isLoanAccount).map(loanCommitment).filter(Boolean)];
  const filed = cache.transactions.filter((t) => t.direction === 'credit' && t.countsFor && t.countsFor === nextMonthKey(t.date.slice(0, 7)) && homeBanks.has(t.accountId));
  for (const s of filed) {
    const [y, m] = s.date.split('-').map(Number);
    const monthEnd = `${s.date.slice(0, 8)}${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    for (const t of salaryDayPayments(cache.transactions, commitments, s.date, monthEnd, homeBanks)) {
      t.countsFor = s.countsFor;
      await save(t);
    }
  }
}

// The question, on the month it landed in and on the month it pays for.
function salaryQuestion(container, across) {
  const box = container.querySelector('#hist-salary');
  const t = salaryAsk;
  const own = t && t.date.slice(0, 7);
  if (!t || across || (filters.month !== own && filters.month !== nextMonthKey(own))) {
    box.innerHTML = '';
    return;
  }
  const next = monthName(nextMonthKey(own));
  box.innerHTML = `<div class="hist-salary">
      <p><b>${formatRupees(t.amount)}</b> came in on ${formatDateNice(t.date)}. Is it your salary for ${next}?</p>
      <div class="hist-salary__go">
        <button type="button" class="k-btn k-btn--primary" data-answer="yes">Yes, count it in ${next}</button>
        <button type="button" class="k-btn k-btn--ghost" data-answer="no">No</button>
      </div>
    </div>`;
  box.querySelectorAll('button').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const yes = btn.dataset.answer === 'yes';
      await setSetting('salaryNextMonth', yes);
      if (yes) await fileSalaries(cache.accounts);
      salaryAsk = null;
      showToast(yes ? `Salary now counts in the month it pays for` : 'Left in the month it came in');
      // Drawn again whole: the six months above move with it.
      render(container, { month: filters.month });
    })
  );
}

const monthName = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', { month: 'long' });

// The switch in a payment's Edit panel: money in during a month's last week.
function salaryMonthField(t) {
  if (t.isTransfer || t.personId) return '';
  // Money out only once it has been moved ahead, so it can be put back.
  if (t.direction === 'debit' && !t.countsFor) return '';
  const [y, m, d] = t.date.split('-').map(Number);
  if (d <= new Date(y, m, 0).getDate() - 7) return '';
  const next = nextMonthKey(t.date.slice(0, 7));
  return `<label class="hist-flag">
      <input type="checkbox" class="rv-field" data-field="countsNext" ${t.countsFor === next ? 'checked' : ''}>
      <span>Count in ${monthName(next)}</span>
    </label>`;
}

// NEW (5.20): lent to or borrowed from a person. A name typed here, or one
// picked from the people already known, puts the payment under them
// (js/people.js); clearing it takes it back out. Not on money moved between
// your own accounts or a business's, which are never a person's.
function personField(t) {
  const account = cache.accounts.find((a) => a.id === t.accountId);
  if (t.isTransfer || (account && isBusinessAccount(account))) return '';
  const person = cache.people.find((p) => p.id === t.personId);
  return `<label class="field hist-person">
      <span>${t.direction === 'debit' ? 'Lent to or paid back to' : 'Borrowed from or paid back by'}</span>
      <input type="text" class="rv-field" data-field="personName" list="hist-people-${t.id}" value="${person ? escapeAttr(person.name) : ''}" placeholder="Nobody" autocomplete="off">
      <datalist id="hist-people-${t.id}">${cache.people.map((p) => `<option value="${escapeAttr(p.name)}"></option>`).join('')}</datalist>
    </label>`;
}

// NEW: "Apply to next month's commitments" for a bank payment made in the last
// two days of a month. It needs a commitment to apply to, so it is greyed out
// until one is chosen above (handleChange keeps that in step).
function nextMonthField(t) {
  const account = cache.accounts.find((a) => a.id === t.accountId);
  if (t.direction !== 'debit' || t.isTransfer || !account || account.type === 'card' || isBusinessAccount(account) || !isMonthEnd(t.date)) return '';
  return `<label class="hist-flag">
      <input type="checkbox" class="rv-field" data-field="forNextMonth" ${t.forNextMonth ? 'checked' : ''} ${t.commitmentId ? '' : 'disabled'}>
      <span>Apply to next month's commitments</span>
    </label>`;
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
        ${remainder === 0 ? 'Adds up exactly' : remainder > 0 ? `${formatCurrency(remainder)} still unassigned` : `${formatCurrency(-remainder)} over the payment amount`}
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
  await save(t);
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

  // NEW: a ticked box saves the flag; unticked removes it, so a payment that
  // was never flagged carries no field at all. Saved on 'change' only: a
  // checkbox also fires 'input', which would save twice.
  // NEW (5.22): money in near a month's end, counted in the next month or
  // in its own. Unticked is saved as its own month, so it is never filed
  // ahead again by itself.
  if (field === 'countsNext') {
    if (e.type !== 'change') return;
    const own = t.date.slice(0, 7);
    t.countsFor = e.target.checked ? nextMonthKey(own) : own;
    await save(t);
    render(container, { month: filters.month });
    return;
  }

  if (field === 'isReimbursable' || field === 'isSettlement' || field === 'forNextMonth') {
    if (e.type !== 'change') return;
    if (e.target.checked) t[field] = true;
    else delete t[field];
    await save(t);
    // Refreshed in place, so the Edit panel stays open under the finger.
    const subEl = rowEl.querySelector('.hist-sub');
    if (subEl) subEl.innerHTML = subHtml(t);
    return;
  }

  // NEW (5.20): the person. Saved when the box is left; a work flag goes, as
  // money between people is never also a work cost or its refund.
  if (field === 'personName') {
    if (e.type !== 'change') return;
    const person = await personNamed(e.target.value);
    if (person) {
      t.personId = person.id;
      delete t.isReimbursable;
      delete t.isSettlement;
      if (!cache.people.some((p) => p.id === person.id)) cache.people.push(person);
    } else delete t.personId;
    await save(t);
    // Drawn again: the category and commitment come and go with the person.
    renderList(container);
    showToast(person ? `Under ${person.name} in Accounts` : 'No longer lent or borrowed');
    return;
  }

  // NEW: a time of day, typed in Edit. It decides where the payment sits among
  // the others of its day. Saved when you finish ('change'), and the list is
  // drawn again so the payment moves to where it now belongs.
  if (field === 'time') {
    if (e.type !== 'change') return;
    if (/^\d{2}:\d{2}$/.test(e.target.value)) t.time = e.target.value;
    else delete t.time;
    await save(t);
    renderList(container);
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
    await save(t);
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
      // "Next month" has to say which commitment; without one it goes.
      delete t.forNextMonth;
    }
    await save(t);
    // The next-month box follows the choice, in place.
    const nextBox = rowEl.querySelector('input[data-field="forNextMonth"]');
    if (nextBox) {
      nextBox.disabled = !t.commitmentId;
      if (!t.commitmentId) nextBox.checked = false;
    }
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
    // Moved out of the month's last days, "next month" no longer fits.
    if (t.forNextMonth && !isMonthEnd(t.date)) {
      delete t.forNextMonth;
      const nextBox = rowEl.querySelector('input[data-field="forNextMonth"]');
      if (nextBox) nextBox.checked = false;
    }
  } else if (field === 'rawDescription') {
    t.rawDescription = e.target.value;
    const nameEl = rowEl.querySelector('.hist-name');
    if (nameEl) nameEl.textContent = displayName(t.rawDescription);
  }
  await save(t);
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
        : `${formatCurrency(-remainder)} over the payment amount`;
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
    await save(t);
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
    await save(t);
    for (const r of rows) {
      if (r.categoryId) await learnFromAssignment(t.rawDescription, r.categoryId);
    }
    splitDraft = null;
    renderList(container);
    return;
  }

  if (e.target.closest('.txn-delete')) {
    const sure = await askConfirm({ title: 'Delete this payment?', message: `${t.rawDescription.slice(0, 80)}. This can't be undone.`, confirmLabel: 'Delete', danger: true });
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
    await save(t);
    renderList(container);
    return;
  }

  const dirBtn = e.target.closest('.rv-dir');
  if (dirBtn) {
    t.direction = dirBtn.dataset.dir;
    // NEW: Spent to Received (or back) drops the flag that no longer fits, so
    // a refund never stays marked "Reimbursable".
    tidyFlags(t);
    await save(t);
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
/* The six-month drawings, so that "How it looks" can show the real ones.
 * Exported for js/views/appearance.js, which passes the same months this
 * screen passes and a look to try.
 *
 * Both answer a question about the same six months; which of them is worth
 * the room is the person's choice.
 */
export function sixMonthCharts(months, look = 'both') {
  const bars = look === 'river' ? '' : inOutBars({ months });
  const river = look === 'bars' ? '' : cashRiver({ months });
  if (!river) return bars;
  // On its own the river stands open; under the bars it stays folded, so the
  // bars remain the first thing and the two never compete.
  return bars
    ? `${bars}<details class="section-fold river-fold"><summary>What you kept, month by month</summary>${river}</details>`
    : river;
}

export function lastSixMonths(transactions, accounts = []) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const now = new Date();
  const months = [];
  for (let back = 5; back >= 0; back -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rows = transactions.filter((t) => countsFor(t) === key);
    const sum = (side) => rows.filter((t) => cashSide(t, byId.get(t.accountId)) === side).reduce((s, t) => s + t.amount, 0);
    months.push({ label: d.toLocaleDateString('en-IN', { month: 'short' }), in: sum('in'), out: sum('out') });
  }
  return months;
}
