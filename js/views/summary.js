import { getAll, put, remove, getSetting, setSetting, newId } from '../db.js';
import { havenTop, keptBack, chartsComing, chartsCards, tideSvg, monthStory, syncTodo } from './summary-looks.js';
import { isDemo } from '../demo-flag.js';
import { displayName } from './transactions.js';
import { wireHaven } from '../haven-ui.js';
import { scrubTick } from '../haven-motion.js';
import { icon } from '../icons.js';
import { isFixed, isLiveCommitment, coveredByFixed, commitmentFromSuggestion, clearSkip } from '../commitments.js';
import { isoLocal, hasDueDate, frequencyOf } from '../frequency.js';
import { formatCurrency, formatDateNice, formatRupees, formatMonthYear } from '../format.js';
import { cardBillDue, bankBalance } from '../account-metrics.js';
import { getGoals, goalProgress } from '../goals.js';
import { computeFreeToSpend } from '../free-to-spend.js';
import { burnLine, runwayBar, radialMeter, allocationRing } from '../charts.js';
import { detectRecurring, nextDueDate } from '../recurring.js';
import { detectAnomalies } from '../anomalies.js';
import { categoryStyle } from '../category-style.js';
import { categorySlices, needsCategory } from '../splits.js';
import { getBudgets, budgetStatusForMonth, cycleAwareEnabled, spendByCategoryForMonth } from '../budgets.js';
import { spendingMonthOf, accountMap, currentMonthKey, previousMonthKey } from '../spending-month.js';
import { appearance } from '../appearance.js';
import { playTour } from '../tour.js';
import { getSyncConfig, getSyncPassphrase } from '../sync.js';
import { dataSafety } from './settings.js';
import { pendingCount } from '../alert-inbox.js';
import { applyLearnedCategories, incomeSpendCount, fixIncomeSpends } from '../merchant-rules.js';
import { showToast } from '../toast.js';
import { askConfirm } from '../dialog.js';
import { redraw } from '../redraw.js';
import { installCard, wireInstallCard } from '../install.js';
import { backupStatus } from '../drive.js';
import { incomeWords, businesses, activeSpace, setCurrentSpace, accountInSpace, businessSpace, businessRunway } from '../business.js';
import { taxDates, renews, renewalsAhead, renewalAfter } from '../calendar.js';
import { isPolicy, markPaid } from '../policies.js';
import { settleBills } from '../bills.js';
import { escapeHtml, escapeAttr, sectionHead, pill, hero, panel, arrivalNow, monthSwap } from '../ui.js';
import { lateBack, reminderText, shareReminder } from '../people.js';
import { cashSide, spendMoves, isCardBill } from '../transfers.js';

let currentRange = 'this-month';

// The space on screen: 'home' or a business's id (js/business.js).
let space = 'home';

// NEW: the month the top of Summary is showing. null is this month; otherwise
// the 'YYYY-MM' of a month already over, opened with the arrows in the month
// bar so what you spent on the 30th is still there to look at on the 1st.
//
// The calendar month stays the unit (nothing about the rules changes): a past
// month is simply worked out again as of its last day, which is exactly what
// the screen read when that month ended. Leaving Summary forgets it, so the
// screen always opens on this month. (app.js builds a new container for every
// arrival and reuses it for a redraw, so a different container means arriving.)
let viewMonth = null;
let shownIn = null;

// The months that can be opened: the first month with any payment in it,
// through this one. Always at least this month.
export function monthsWithData(transactions, todayIso) {
  const thisKey = todayIso.slice(0, 7);
  const first = transactions.reduce((m, t) => (t.date && t.date.slice(0, 7) < m ? t.date.slice(0, 7) : m), thisKey);
  const out = [];
  let [y, m] = first.split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= thisKey) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// Noon on the last day of a month: "today", for working a finished month out
// as it stood when it ended. Noon, so no time zone can move the date.
export function endOfMonthNoon(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0, 12);
}

// "< October 2026 >": the same bar History uses, so it is already familiar.
// The arrows stop at the first month with data and at this month.
function monthNav(key, months) {
  const at = months.indexOf(key);
  const [y, m] = key.split('-').map(Number);
  return `<nav class="lg-stepper summary-month" aria-label="Month on screen">
      <button type="button" id="sum-month-prev" aria-label="Month before" ${at <= 0 ? 'disabled' : ''}>${icon('back')}</button>
      <span class="hist-month-name" aria-live="polite">${MONTH_NAMES[m - 1]} ${y}</span>
      <button type="button" id="sum-month-next" aria-label="Month after" ${at >= months.length - 1 ? 'disabled' : ''}>${icon('forward')}</button>
    </nav>`;
}

export async function render(container) {
  // NEW: arriving on Summary always starts on this month; only a redraw of
  // the screen already showing keeps the month you stepped back to.
  if (container !== shownIn) {
    viewMonth = null;
    shownIn = container;
  }
  // A one-time bill whose payment has been recorded ends here, so it is not held out of next month as well (js/bills.js). Off the
  // critical path: the screen is drawn at once, and redrawn only on the rare day a bill was just settled.
  settleBills().then((n) => { if (n && container.isConnected) redraw(container, () => render(container)); }).catch(() => {});
  const list = await businesses();
  space = await activeSpace();
  // Summary is the first screen on the new visual system, the design notes kept on the laptop.
  // The shell follows it through `body:has(#dashboard)` in css/dna.css, so
  // nothing has to be cleaned up on the way out. Nothing about what is
  // calculated or shown changes here: only how it looks.
  container.classList.add('k');
  // NEW (5.18): the short version (the default for someone new) - the answer,
  // what needs you, the month, and everything else behind one tap.
  // Haven lays Summary out the short way always: the answer, then one fold for the rest.
  const short = space === 'home' && !viewMonth && (shortMode() || document.documentElement.dataset.style === 'haven');
  container.classList.toggle('sum-short', short);
  if (short) currentRange = 'this-month';
  container.innerHTML = `
    ${list.length ? spaceToggle(list, space) : ''}
    <div id="dashboard"></div>
    ${
      // A finished month shows only its own figures; the This month / Last
      // month breakdown below belongs to the month that is running.
      space !== 'home' || viewMonth || short
        ? ''
        : `<div class="segmented">
      <button type="button" class="seg-btn ${currentRange === 'this-month' ? 'active' : ''}" data-range="this-month">This month</button>
      <button type="button" class="seg-btn ${currentRange === 'last-month' ? 'active' : ''}" data-range="last-month">Last month</button>
      <button type="button" class="seg-btn ${currentRange === 'custom' ? 'active' : ''}" data-range="custom">Custom</button>
    </div>
    <div id="custom-range" class="custom-range" ${currentRange === 'custom' ? '' : 'hidden'}>
      <label>From <input type="date" id="range-from"></label>
      <label>To <input type="date" id="range-to"></label>
      <button type="button" id="range-apply" class="btn-secondary">Apply</button>
    </div>
    <div id="summary-content"></div>`
    }
  `;

  container.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentRange = btn.dataset.range;
      redraw(container, () => render(container));
    });
  });

  // Home and each business, each in its own lane.
  container.querySelectorAll('.space-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.space === space) return;
      setCurrentSpace(btn.dataset.space);
      document.dispatchEvent(new CustomEvent('space-changed'));
      redraw(container, () => render(container));
    });
  });

  if (currentRange === 'custom' && container.querySelector('#range-apply')) {
    container.querySelector('#range-apply').addEventListener('click', () => redraw(container, () => renderContent(container)));
  }

  // The short version puts the breakdown inside its fold, so the fold is
  // drawn first.
  if (short) {
    await renderDashboard(container);
    await renderContent(container);
  } else await Promise.all([renderDashboard(container), renderContent(container)]);
}

const shortMode = () => appearance('summary') === 'short';

/* NEW (5.18): the first day. Until what comes in and what goes out are set
 * there is no budget to show, so the short Summary is three steps instead of
 * empty cards; once both are set, a slim strip asks for the payments. */
function setupCard(s) {
  const done = [s.income, s.commitments, s.payments].filter(Boolean).length;
  const next = !s.income ? 1 : !s.commitments ? 2 : 3;
  const step = (n, ok, title, sub, go, label) =>
    `<li class="setup-step ${ok ? 'is-done' : n === next ? 'is-next' : 'is-later'}"><span class="setup-step__n">${ok ? icon('check') : n}</span><span class="setup-step__body"><b>${title}</b><small>${sub}</small></span><button type="button" class="k-btn ${!ok && n === next ? 'k-btn--primary' : 'k-btn--secondary'}" data-go="${go}">${ok ? 'Change' : label}</button></li>`;
  // Haven: the shield fills as each step is done (the bar under it is for the other looks).
  const shield = document.documentElement.dataset.style === 'haven' ? `<div class="tide hv-setup__tide" data-mood="calm" style="--lvl:${(done / 3).toFixed(3)}" role="img" aria-label="${done} of 3 steps done">${tideSvg(done / 3, 0)}</div>` : '';
  return `<section class="setup-card">
      <div class="setup-card__top"><div><h2>Set up Kawach</h2><p class="setup-card__sub">Three steps, about five minutes. Then this screen shows what you can spend each day.</p></div>${shield}</div>
      <div class="setup-progress" role="progressbar" aria-label="Set up" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${done}"><i style="width:${Math.max(4, Math.round((done / 3) * 100))}%"></i></div>
      <ol class="setup-steps">
        ${step(1, s.income, 'What comes in', 'Salary, pension, business or what the house needs', 'plan', 'Add')}
        ${step(2, s.commitments, 'What goes out each month', 'Rent, EMIs, bills, groceries', 'plan', 'Add')}
        ${step(3, s.payments, 'Your payments', 'Import a bank or card statement', 'import', 'Import')}
      </ol>
      <button type="button" class="k-btn k-btn--ghost setup-tour" id="setup-tour-btn">${icon('play')} Watch the tour, 82 seconds</button>
    </section>`;
}

function setupStrip() {
  return `<div class="setup-strip">
      <div class="setup-strip__row"><span><b>2 of 3 set up.</b> Import a statement to see your spending.</span><button type="button" class="k-btn k-btn--primary" data-go="import">Import</button></div>
      <div class="setup-progress"><i style="width:67%"></i></div>
    </div>`;
}

function wireSetup(el, container) {
  el.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: b.dataset.go } }))),
  );
  el.querySelector('#setup-tour-btn')?.addEventListener('click', playTour);
}

/* The answer straight under the figure, not at the foot of the card. */
function answerFirst(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const status = t.content.querySelector('.hero-status, .tl-line');
  const figure = t.content.querySelector('.hero-amount, .tl-big');
  if (status && figure) {
    status.classList.add('sum-answer');
    // Red only when over the budget: the bank running short, which also
    // raises the level, is said in Needs you.
    if (!/^Over budget/.test(status.textContent.trim())) status.classList.remove('bad', 'caution', 'level-critical', 'level-warning');
    figure.after(status);
  }
  return t.innerHTML;
}

/* The sentence under the figure in the short version. The bank running
 * short is said once, in Needs you, so it is not also said here. */
export function shortStatus(f) {
  if (f.level === 'critical' && f.used < 0.9) return `About ${formatRupees(f.perDay)} a day until ${formatDateNice(f.cycleKey)}`;
  return spendingStatus(f);
}

// --- Dashboard: net position, things needing attention, upcoming bills ---

function spaceToggle(list, current) {
  const spaces = [{ id: 'home', name: 'Home' }, ...list];
  return `<div class="space-toggle" role="tablist" aria-label="Home or business">
    ${spaces
      .map(
        (sp) =>
          `<button type="button" role="tab" class="space-btn ${sp.id === current ? 'on' : ''}" aria-selected="${sp.id === current}" data-space="${escapeHtml(sp.id)}">${sp.id === 'home' ? icon('home') : icon('store')}<span>${escapeHtml(sp.name)}</span></button>`
      )
      .join('')}
  </div>`;
}

// A business's own month: what is left, in and out, its fixed costs, and
// where the money went. Nothing from Home is on it.
async function renderBusinessDashboard(container) {
  const dashboardEl = container.querySelector('#dashboard');
  const [transactions, accounts, recurring, categories, list] = await Promise.all([getAll('transactions'), getAll('accounts'), getAll('recurring'), getAll('categories'), businesses()]);
  const today = isoLocal(new Date());
  const b = businessSpace(transactions, accounts, recurring, categories, space, today);
  // A shop's income is uneven, so it gets the question a salary never asks:
  // if nothing came in, how long would it last?
  const runway = businessRunway(transactions, accounts, space, today);
  const line = breakdownLine;
  const month = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const go = (view, extra = '') => `data-go="${view}" ${extra}`;
  const hasAccounts = b.accountIds.length > 0;
  dashboardEl.innerHTML = `
    ${
      hasAccounts
        ? hero({
            label: 'Left this month',
            period: month,
            amount: formatRupees(b.left),
            negative: b.left < 0,
            level: b.left < 0 ? 'over' : 'ok',
            figures: [
              { label: 'In', value: formatRupees(b.moneyIn) },
              { label: 'Out', value: formatRupees(b.moneyOut) },
            ],
            // The one drawing this screen gets: how long the shop would last.
            chart: runway ? runwayBar(runway) : '',
            status: b.fixedDue ? `${formatRupees(b.fixedDue)} of fixed costs still to pay` : '',
            extra: `<details class="fts-breakdown">
              <summary>How it's worked out</summary>
              ${panel(`
                ${line('Money in', b.moneyIn, '+')}
                ${line('Money out', b.moneyOut, '-')}
                ${b.sentHome ? line('Sent home', b.sentHome, '-') : ''}
                ${b.fixedDue ? line('Fixed costs still to pay', b.fixedDue, '-') : ''}
                <div class="totals-row net"><span>Left this month</span><span>${formatRupees(b.left)}</span></div>`)}
            </details>`,
          })
        : panel(
            `<p class="muted-note">Add ${escapeHtml(list.find((x) => x.id === space)?.name || 'the business')}'s bank account to see its month.</p><button type="button" class="btn-primary" ${go('accounts')}>Add its account</button>`
          )
    }
    ${sectionHead('Fixed costs')}
    ${
      b.fixed.length
        ? `<div class="totals-card">${b.fixed
            .map(
              (f) => `<div class="totals-row"><span>${escapeHtml(f.label)}</span><span class="biz-fixed">${formatRupees(f.paid)} / ${formatRupees(f.amount)} ${pill(f.due ? 'Due' : 'Paid', f.due ? 'warn' : 'ok')}</span></div>`
            )
            .join('')}</div>`
        : `<div class="totals-card"><p class="muted-note">Shop rent, staff wages and other costs each month.</p><button type="button" class="btn-secondary btn-block" ${go('plan')}>Add fixed costs</button></div>`
    }
    ${
      b.top.length
        ? `${sectionHead('Where it went')}<div class="totals-card">${b.top
            .map((c) => `<div class="totals-row"><span>${escapeHtml(c.name)}</span><span class="out">${formatRupees(c.amount)}</span></div>`)
            .join('')}</div>`
        : ''
    }
    ${
      b.needsCategory
        ? `<div class="totals-card"><div class="todo-row"><span class="todo-icon" aria-hidden="true">${icon('tag')}</span><span class="todo-text"><span>${b.needsCategory} need a category</span></span><span class="attention-actions"><button type="button" class="btn-tiny" ${go('transactions')}>Open</button></span></div></div>`
        : ''
    }
    ${taxCard(taxDates(today, { business: true, gst: (list.find((x) => x.id === space) || {}).gst }))}
  `;
  dashboardEl.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: btn.dataset.go, ...(btn.dataset.go === 'transactions' ? { filter: 'uncategorized' } : {}) } }));
    });
  });
}

// Dates only: Kawach never files anything and never says what is owed.
function taxCard(dates) {
  const soon = dates.filter((d) => d.date <= addDaysIso(isoLocal(new Date()), 45)).slice(0, 3);
  if (!soon.length) return '';
  return `${sectionHead('Coming up')}
    <div class="totals-card">${soon
      .map((d) => `<div class="totals-row"><span>${escapeHtml(d.label)}<br><span class="muted-note">${escapeHtml(d.note)}</span></span><span>${formatDateNice(d.date)}</span></div>`)
      .join('')}</div>`;
}

const addDaysIso = (from, days) => {
  const [y, m, d] = from.split('-').map(Number);
  return isoLocal(new Date(y, m - 1, d + days));
};

// The four latest payments for Haven's Summary: what they were, their category and when.
function havenLatest(transactions, categories, accounts = []) {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.label || a.name]));
  const today = isoLocal(new Date());
  const yest = isoLocal(new Date(Date.now() - 86400000));
  const day = (iso) => (iso === today ? 'Today' : iso === yest ? 'Yesterday' : formatDateNice(iso));
  return transactions
    .filter((t) => !t.isTransfer && t.amount > 0)
    .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1))
    .slice(0, 4)
    .map((t) => {
      const when = new Date(t.createdAt || 0);
      // A time only for what was typed in on the day it happened; a statement line has a date and no time.
      const time = t.source === 'manual' && t.createdAt && isoLocal(when) === t.date ? when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : '';
      const category = names.get(t.categoryId) || 'Uncategorised';
      return { title: displayName(t.rawDescription), category, account: accountName.get(t.accountId) || '', meta: `${category} · ${day(t.date)}${time ? `, ${time}` : ''}`, amount: t.amount, credit: t.direction === 'credit' };
    });
}

/* What Haven's Summary shows beyond the month itself (5.58): the goals, a salary that has just landed, and last month's
 * line for the chart to hold up beside this month's. Each is left out when there is nothing to say. */
async function havenMore(fts, transactions, months, thisKey, categories = []) {
  const out = { goals: [], salary: null, layers: [], tanks: [] };
  try {
    const accounts = await getAll('accounts');
    const today = isoLocal(new Date());
    out.goals = (await getGoals()).map((g) => {
      const saved = (g.accountIds || []).reduce((sum, id) => sum + (bankBalance(accounts.find((a) => a.id === id) || {}, transactions) || 0), 0);
      const p = goalProgress(g, saved, today);
      return { label: g.name, saved, target: g.target, monthly: p.monthly, done: p.done, byName: formatMonthYear(`${g.by}-01`) };
    });
    // A salary is money in to a bank account of at least half the usual, in the last three days, not yet celebrated.
    const income = fts.monthlyIncome || 0;
    const since = isoLocal(new Date(Date.now() - 3 * 86400000));
    const seen = (() => { try { return localStorage.getItem('kawach-salary-seen'); } catch { return null; } })();
    const hit = income > 0 && transactions
      .filter((t) => t.direction === 'credit' && !t.isTransfer && !t.personId && !t.isSettlement && t.date >= since && t.amount >= income / 2 && (accounts.find((a) => a.id === t.accountId) || {}).type === 'bank')
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (hit && hit.id !== seen) out.salary = { id: hit.id, amount: hit.amount };
    // Last month, by the same days: the running total, for the faint line on the chart.
    const prev = months[months.indexOf(thisKey) - 1];
    let was = null;
    if (prev) {
      was = await computeFreeToSpend(endOfMonthNoon(prev));
      fts.ghost = (was.spendDays || []).slice();
      // Last month as it stood on the same day: what was left of its budget by then.
      const n = (fts.spendDays || []).length;
      if (n > 0 && was.spendDays && was.spendDays.length && was.limit > 0) out.cmp = { spent: was.spendDays[Math.min(n, was.spendDays.length) - 1] || 0, limit: was.limit };
    }
    out.cap = Number(await getSetting('dailyCap', 0)) || 0;
    // Where this month's money went (the five biggest categories, the way budgets count it), and each budget as a tank.
    const monthKey = thisKey;
    const spentBy = spendByCategoryForMonth(transactions, accounts, monthKey, await cycleAwareEnabled());
    out.layers = [...spentBy.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, amount]) => {
      const name = (categories.find((c) => c.id === id) || {}).name || 'Other';
      return { name, amount, color: categoryStyle(name).color };
    });
    out.tanks = (await budgetStatusForMonth(await getBudgets(), categories, transactions, monthKey)).slice(0, 6).map((b) => ({ name: b.name, left: Math.max(0, 1 - b.pct), over: b.state === 'over' }));
    // The month has just turned (the first time this one is drawn): the last one told back in a few cards, and the badges it earned.
    const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const fresh = Boolean(ls('kawach-cycle') && fts.cycleKey && ls('kawach-cycle') !== fts.cycleKey);
    const earned = (() => { try { return JSON.parse(ls('kawach-badges')) || []; } catch { return []; } })();
    const BADGES = { 'first-under': 'The first month closed under budget', 'three-under': 'Three months in a row under budget' };
    if (fresh && was && was.limit > 0) {
      const name = MONTH_NAMES[Number(prev.slice(5, 7)) - 1];
      if (ls('kawach-story') !== prev) {
        out.story = monthStory(was, fts.limit, name);
        out.storyKey = prev;
      }
      const under = (w) => w && w.limit > 0 && (w.spentThisCycle || 0) <= w.limit;
      const fresh_ids = [];
      if (under(was) && !earned.some((b) => b.id === 'first-under')) fresh_ids.push('first-under');
      const p2 = months[months.indexOf(thisKey) - 2];
      const p3 = months[months.indexOf(thisKey) - 3];
      if (under(was) && p2 && p3 && !earned.some((b) => b.id === 'three-under')) {
        const [w2, w3] = await Promise.all([computeFreeToSpend(endOfMonthNoon(p2)), computeFreeToSpend(endOfMonthNoon(p3))]);
        if (under(w2) && under(w3)) fresh_ids.push('three-under');
      }
      for (const id of fresh_ids) earned.push({ id, key: prev, isNew: true });
      if (fresh_ids.length) { try { localStorage.setItem('kawach-badges', JSON.stringify(earned.map((b) => ({ id: b.id, key: b.key })))); } catch { /* it simply forgets */ } }
    }
    out.badges = earned.slice(-3).map((b) => ({ id: b.id, label: BADGES[b.id] || 'A milestone', isNew: Boolean(b.isNew) }));
  } catch {
    /* these are extras: the screen is complete without them */
  }
  return out;
}

let quiet = false;
async function renderDashboard(container) {
  if (space !== 'home') return renderBusinessDashboard(container);
  const dashboardEl = container.querySelector('#dashboard');

  // NEW: the month bar, and a finished month on screen.
  const todayIso = isoLocal(new Date());
  // The figures are for the next month once a month-end salary has landed (computeFreeToSpend), so the month bar follows them.
  const fts = await computeFreeToSpend();
  const thisKey = fts.monthKey;
  const months = monthsWithData(await getAll('transactions'), `${thisKey}-01`);
  // A month that has gone from the data (payments deleted) or is no longer in
  // the past falls back to this month.
  if (viewMonth && (!months.includes(viewMonth) || viewMonth >= thisKey)) {
    viewMonth = null;
    return redraw(container, () => render(container));
  }
  const wireMonthNav = () => {
    const step = (delta) => {
      const next = months[months.indexOf(viewMonth || thisKey) + delta];
      if (!next) return;
      viewMonth = next === thisKey ? null : next;
      // The month slides; the blocks inside it do not also rise one by one.
      quiet = true;
      monthSwap(delta, () => [container.querySelector('#dashboard')], () => redraw(container, () => render(container))).finally(() => { quiet = false; });
    };
    dashboardEl.querySelector('#sum-month-prev').addEventListener('click', () => step(-1));
    dashboardEl.querySelector('#sum-month-next').addEventListener('click', () => step(1));
  };

  if (viewMonth) {
    // As the month stood on its last day: the Spent and Left to spend that
    // were true when it closed, payments of the 30th and 31st included.
    const past = { key: viewMonth, name: MONTH_NAMES[Number(viewMonth.slice(5, 7)) - 1] };
    const done = await computeFreeToSpend(endOfMonthNoon(viewMonth));
    dashboardEl.innerHTML = `${renderSpendingLimit(done, { past, nav: monthNav(viewMonth, months) })}
      <button type="button" class="btn-secondary btn-block" id="sum-month-payments">See ${past.name}'s payments</button>`;
    wireMonthNav();
    wireCharts(dashboardEl);
    dashboardEl.querySelector('#sum-month-payments').addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', month: past.key } }));
    });
    return;
  }

  const [transactions, install, list, categoryList, accountList] = await Promise.all([getAll('transactions'), installCard(), businesses(), getAll('categories'), getAll('accounts')]);
  const latest = havenLatest(transactions, categoryList, accountList);
  const more = document.documentElement.dataset.style === 'haven' ? await havenMore(fts, transactions, months, thisKey, categoryList) : null;
  // Anyone with business income has tax dates to keep.
  const tax = taxCard(taxDates(isoLocal(new Date()), { business: list.length > 0 || fts.incomeKind === 'business' }));

  // In the order the questions are asked: where do I stand, how much of the
  // month is spoken for, what have I actually got, what needs me - and only
  // then the detail (design.md section 15).
  const commitments = renderCommitmentTracker(fts);
  // Haven always lays Summary out the short way: the answer first, then a fold for the rest (nothing is shown that has no use).
  const haven = document.documentElement.dataset.style === 'haven';
  if (shortMode() || haven) {
    const setup = { income: Boolean(fts.monthlyIncome && fts.salary.setUp), commitments: !fts.noCommitments, payments: transactions.length > 0 };
    if (!setup.income || !setup.commitments) {
      dashboardEl.innerHTML = setupCard(setup) + install;
      wireSetup(dashboardEl, container);
      wireInstallCard(dashboardEl, () => redraw(container, () => renderDashboard(container)));
      wireHaven(dashboardEl);
      return;
    }
    // The figure and its answer; what needs you; the month; then the rest,
    // folded. The parts are marked where the top is drawn.
    const [answer, afterAnswer = ''] = renderSpendingLimit(fts, { short: !haven, latest, more, nav: monthNav(thisKey, months) }).split('<!--k:answer-->');
    const [month, rest = ''] = afterAnswer.split('<!--k:month-->');
    dashboardEl.innerHTML = [
      setup.payments ? '' : setupStrip(),
      answerFirst(answer),
      month,
      `<details class="sum-more" id="sum-more">
        <summary><span class="sum-more__t">More about this month</span><span class="lg-plus" aria-hidden="true">${icon('add')}</span></summary>
        <div class="sum-more__body">
          ${haven ? `<div id="hv-ins" class="hv-cal-host" data-extra='${more ? escapeAttr(JSON.stringify({ layers: more.layers, tanks: more.tanks })) : ''}'></div><div id="hv-cal" class="hv-cal-host"></div>` : ''}
          ${rest}
          ${renderBankCard(fts)}
          ${fold('Commitments', fts.tracker ? `${fts.tracker.length}` : '', commitments, false, 'commitments-fold')}
          ${fold('Loans and savings', '', renderLoansSavings(fts))}
          <div id="upcoming-section"></div>
          ${tax}
          <div id="summary-content"></div>
        </div>
      </details>`,
      install,
    ].join('');
    wireSetup(dashboardEl, container);
  } else {
    dashboardEl.innerHTML = [
      monthNav(thisKey, months),
      renderSpendingLimit(fts, { latest }),
      renderBankCard(fts),
      renderDueSoon(fts),
      '<div id="attention-section"></div>',
      fold('Commitments', fts.tracker ? `${fts.tracker.length}` : '', commitments, false, 'commitments-fold'),
      fold('Loans and savings', '', renderLoansSavings(fts)),
      '<div id="upcoming-section"></div>',
      tax,
      // The invitation to install comes last: it is not part of the answer.
      install,
    ].join('');
  }

  wireMonthNav();
  wireCharts(dashboardEl);
  wireHaven(dashboardEl);

  // The set-aside figure opens the list that explains it, rather than being
  // a number with nowhere to go.
  const asideBtn = dashboardEl.querySelector('#set-aside-stat');
  if (asideBtn) {
    asideBtn.addEventListener('click', () => {
      const f = dashboardEl.querySelector('#commitments-fold');
      if (!f) return;
      const more = f.closest('details.sum-more');
      if (more) more.open = true;
      f.open = true;
      f.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  // Mark paid / Skip this month, and their Undo: a per-cycle choice stored on
  // the commitment. Only recent cycles are kept, so the record can't grow forever.
  const toggleCycle = async (id, key, field, on, message) => {
    const item = (await getAll('recurring')).find((r) => r.id === id);
    if (!item) return;
    const cycles = new Set(item[field] || []);
    if (on) cycles.add(key);
    else cycles.delete(key);
    const kept = !on && field === 'skippedCycles' ? clearSkip([...cycles], key) : [...cycles];
    await put('recurring', { ...item, [field]: kept.sort().slice(-12) });
    showToast(message(item.label));
    redraw(container, () => renderDashboard(container));
  };
  wireInstallCard(dashboardEl, () => redraw(container, () => renderDashboard(container)));
  // Delegated, so a button drawn after this runs (Needs you's Mark paid)
  // is answered too.
  const on = (selector, handler) =>
    dashboardEl.addEventListener('click', (e) => {
      const btn = e.target.closest(selector);
      if (btn && dashboardEl.contains(btn)) handler(btn);
    });
  // Owed back opens the work costs behind it: what each was, how much of it
  // is still owed, and the refunds that have come in (5.23).
  const showOwed = (open) => {
    const btn = dashboardEl.querySelector('#owed-back-stat');
    const anchor = btn && btn.closest('[data-owed-anchor]');
    if (!btn || !anchor) return;
    owedOpen = open;
    btn.setAttribute('aria-expanded', String(open));
    dashboardEl.querySelector('#owed-back-list')?.remove();
    if (open) anchor.insertAdjacentHTML('afterend', owedListHtml(fts));
  };
  on('#owed-back-stat', (btn) => showOwed(btn.getAttribute('aria-expanded') !== 'true'));
  // The list stays open when the screen draws itself again (a sync, a tap on Mark paid).
  if (owedOpen) showOwed(true);
  on('.owed-row[data-search]', (b) => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', month: b.dataset.month, search: b.dataset.search } }));
  });
  on('.commitment-mark-paid', (b) => toggleCycle(b.dataset.id, b.dataset.key, 'paidCycles', true, (l) => `${l} marked paid for this cycle`));
  on('.commitment-unmark', (b) => toggleCycle(b.dataset.id, b.dataset.key, 'paidCycles', false, (l) => `${l}: back to unpaid`));
  on('.commitment-skip', (b) => toggleCycle(b.dataset.id, b.dataset.key, 'skippedCycles', true, (l) => `${l} skipped this cycle`));
  on('.commitment-unskip', (b) => toggleCycle(b.dataset.id, b.dataset.key, 'skippedCycles', false, (l) => `${l} is back for this cycle`));

  // A matched payment that belongs to something else: it stays as ordinary
  // spending, and this commitment no longer claims it.
  on('.match-not-this', async (btn) => {
    const txn = (await getAll('transactions')).find((t) => t.id === btn.dataset.txn);
    if (!txn) return;
    const ids = new Set(txn.notCommitmentIds || []);
    ids.add(btn.dataset.id);
    const next = { ...txn, notCommitmentIds: [...ids] };
    // A payment you tagged to this commitment loses the tag too.
    if (next.commitmentId === btn.dataset.id) delete next.commitmentId;
    await put('transactions', next);
    showToast('No longer counted towards that commitment');
    redraw(container, () => renderDashboard(container));
  });
  // Undo "Not this".
  on('.match-count-again', async (btn) => {
    const txn = (await getAll('transactions')).find((t) => t.id === btn.dataset.txn);
    if (!txn) return;
    await put('transactions', { ...txn, notCommitmentIds: (txn.notCommitmentIds || []).filter((id) => id !== btn.dataset.id) });
    showToast('Counted towards that commitment again');
    redraw(container, () => renderDashboard(container));
  });
  // A payment saved twice: delete this copy (the first-saved one is usually kept).
  on('.match-remove', async (btn) => {
    const txn = (await getAll('transactions')).find((t) => t.id === btn.dataset.txn);
    if (!txn) return;
    const sure = await askConfirm({
      title: 'Remove this copy?',
      message: `${formatCurrency(txn.amount)} on ${formatDateNice(txn.date)}. Only do this if the same payment is listed twice.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!sure) return;
    await remove('transactions', txn.id);
    showToast('Copy removed');
    redraw(container, () => render(container));
  });

  await renderAttention(container, transactions, fts);
  syncTodo(dashboardEl);
  await renderUpcoming(container, fts);
  notifySpendingLevel(fts);
}

// What the card level means in words, used by the hero and the attention list.
export function spendingWarning(f) {
  const until = formatDateNice(f.cycleKey);
  if (f.level === 'over')
    return `You're ${formatRupees(-f.free)} over this cycle's budget. Stop spending until ${until}, on cards and by UPI - anything more comes out of next month.`;
  if (f.level === 'critical') return `Critical: only ${formatRupees(f.free)} left of this cycle's budget${f.crossesOn ? ` - at your pace it runs out on ${formatDateNice(f.crossesOn)}` : ''}.`;
  if (f.level === 'warning')
    return f.crossesOn
      ? `Careful: at ${formatRupees(f.pace)} a day the budget runs out on ${formatDateNice(f.crossesOn)}, before the cycle ends on ${until}.`
      : `Careful: ${formatRupees(f.spentThisCycle || 0)} of this cycle's ${formatRupees(f.limit)} is gone.`;
  return null;
}

const breakdownLine = (label, amount, sign, note = '') =>
  `<div class="totals-row"><span>${label}${note ? `<br><span class="muted-note">${note}</span>` : ''}</span><span class="${sign === '+' ? 'in' : 'out'}">${sign === '+' ? '+' : '−'}${formatRupees(Math.abs(amount))}</span></div>`;

/* The headline itself, so that "How it looks" can show the real thing rather
 * than a drawing of it. Exported for js/views/appearance.js, which hands it
 * the same figures this screen uses and a look to try; nothing about the money
 * is worked out here.
 *
 * Which parts appear is the person's choice. The figures below the hero, the
 * warnings and the breakdown are never part of that choice: those are how the
 * money is explained, not decoration, and a quieter screen must not be a less
 * honest one.
 */
/* The two figures under the headline: what has gone, and what it is measured
 * against.
 *
 * "A of B" says A is part of B. That stops being true the moment the spending
 * passes the budget, and it read as nonsense on the one screen a person is
 * most likely to be staring at. Past the budget it says "against" instead,
 * which stays true however far past it goes.
 */
export function spentLine(spent, limit, spark = '') {
  const over = spent > limit;
  return `<div class="summary-row">
        <span class="summary-row__k">Spent<small>${over ? `against ${formatRupees(limit)}` : `of ${formatRupees(limit)}`}</small></span>
        ${spark}
        <span class="summary-row__v">${formatRupees(spent)}</span>
      </div>`;
}

// The month so far, day by day, as one small line beside what was spent:
// the shape of it, not the figures, which are in the row already.
function spendSpark(days) {
  const v = (days || []).map((d) => d.amount || 0);
  if (v.length < 3 || !v.some((x) => x > 0)) return '';
  const top = Math.max(...v);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 64).toFixed(1)},${(22 - (x / top) * 20).toFixed(1)}`).join(' ');
  return `<svg class="summary-spark" viewBox="0 0 64 24" aria-hidden="true" focusable="false"><polyline points="${pts}"/></svg>`;
}

// NEW (4.18): a work cost you will be refunded for is inside "owed on cards",
// which the bank check subtracts in full, because money that has not arrived is
// never counted. This is the other half of the picture: how much of it is
// coming back, and what the bank check would read once it has. Shown beside the
// cautious figure, never in place of it. Null when there is nothing to show -
// no shortfall, or nothing coming back.
export function ifRefunded(f) {
  const refund = f.refundInBankCheck || 0;
  if (f.bankAfterBills == null || !(f.bankAfterBills < 0) || refund <= 0) return null;
  return { refund, after: f.bankAfterBills + refund };
}
// NEW: what is owed, in two plain figures. Card debt is every card's bill not
// yet paid plus what has been spent since the last statement - the same two
// numbers the bank check already subtracts, added up, and nothing else. It
// does not touch "Left to spend". Money the employer still owes back is shown
// only while there is some: at nothing it disappears rather than saying "0".
function renderOwed(f, { cards = true } = {}) {
  const onCards = Math.max(0, ((f.totals && f.totals.owedCards) || 0) + ((f.totals && f.totals.unpaidBills) || 0));
  const employer = (f.reimbursable && f.reimbursable.owed) || 0;
  if ((!cards || !f.cards.length) && !employer) return '';
  return `<div class="summary-owed" data-owed-anchor>
      ${
        cards && f.cards.length
          ? `<div class="summary-row"><span class="summary-row__k">Owed on cards<small>unpaid bills and new spending</small></span><span class="summary-row__v summary-row__v--cards">${formatRupees(onCards)}</span></div>`
          : ''
      }
      ${
        employer
          ? `<button type="button" class="summary-row summary-row--tap" id="owed-back-stat"><span class="summary-row__k">Owed back<small>by your employer</small>${f.refundOverdue ? `<small class="summary-row__late">${formatRupees(f.refundOverdue.amount)} late, since ${formatDateNice(f.refundOverdue.since)}</small>` : ''}</span><span class="summary-row__v summary-row__v--back">${formatRupees(employer)}</span></button>`
          : ''
      }
    </div>`;
}

// CHANGED: an optional `statusText` replaces the pace line. A finished month
// has no pace to speak of: "About ₹2,724 a day until 30 Sep" is meaningless on
// 1 Oct, so it says "Final for September" instead.
export function spendingHero(f, look = 'full', statusText = null, said = null) {
  const until = formatDateNice(f.cycleKey);
  const pct = f.limit > 0 ? Math.min(100, Math.round(f.used * 100)) : 100;
  // The pace picture. When it can draw, it says everything the meter said and
  // more, so the meter goes: the same fact three ways is noise (design.md
  // section 9). Too early in the month, or nothing spent yet, and the meter
  // is the picture instead.
  // A finished month has no pace to project ("heading for ₹30,000 ... under
  // today's pace" is about a month still running), so it gets the plain
  // used-up bar below instead of the pace drawing.
  // CHANGED (4.22): the full look is a ring - a thick arc for the budget
  // spent, a thin one for the month gone - which says what the bar and the
  // pace drawing said, in one picture: an arc running ahead of the ring is
  // spending running ahead of the month. A finished month's ring is full.
  const monthDays = (f.daysIntoCycle || 0) + (f.daysToClose || 1) - 1;
  // CHANGED (5.0, the Charts style): the full look is the tracking card -
  // the figure, then Spent, Budget and A day in a row, then rings for the
  // budget spent, the month gone and, where there are any, the set-asides
  // used. Each ring is one share, said in its middle.
  const tracking = look === 'full' && f.limit > 0
    ? {
        roll: { left: f.free, key: `${f.cycleKey || ''}|${f.limit}`, limit: f.limit },
        stats: [
          { k: 'Spent', v: formatRupees(f.spentThisCycle || 0) },
          { k: 'Budget', v: formatRupees(f.limit) },
          { k: statusText != null ? 'Days' : 'A day', v: statusText != null ? `${monthDays}` : f.perDay > 0 ? formatRupees(f.perDay) : '-' },
        ],
        // CHANGED (5.18): each ring says an amount or a day in its middle;
        // a bare percentage told a newcomer nothing.
        rings: [
          {
            value: Math.max(0, f.used || 0),
            grad: 'spent',
            big: formatRupees(f.spentThisCycle || 0),
            label: (f.spentThisCycle || 0) > f.limit ? `${formatRupees((f.spentThisCycle || 0) - f.limit)} over` : `of ${formatRupees(f.limit)}`,
          },
          statusText != null
            ? { value: 1, grad: 'month', big: `${monthDays} days`, label: 'month done' }
            : { value: monthDays > 0 ? f.daysIntoCycle / monthDays : 0, grad: 'month', big: `Day ${f.daysIntoCycle}`, label: `of ${monthDays}` },
          ...asideRing(f),
        ],
      }
    : null;
  const closedUnder = Boolean(tracking && (f.finished || statusText != null) && f.limit > 0 && (f.spentThisCycle || 0) <= f.limit);
  const burn = tracking || statusText != null ? null : burnLine({ totals: f.spendDays, budget: f.limit, days: f.daysIntoCycle + f.daysToClose - 1, shortfall: f.bankShortfall });
  const meter = tracking || burn || !(f.spentThisCycle > 0) ? null : { pct, tone: f.level === 'ok' ? '' : f.level === 'warning' ? 'warn' : 'over' };
  return hero({
    label: 'Left to spend',
    period: `${formatDateNice(f.cycleStart)} to ${until}`,
    amount: formatRupees(f.free),
    negative: f.free < 0,
    level: f.level,
    meter: look === 'full' ? meter : null,
    // `burn` is null for a finished month; an empty string, never "null".
    chart: look === 'full' ? burn || '' : '',
    status: look === 'plain' ? '' : escapeHtml(statusText != null ? statusText : said || spendingStatus(f)),
    tracking,
    // A month that closed within budget says so and takes one soft glow (the other looks do the same).
    cls: closedUnder ? ' is-closed-under' : '',
    extra: closedUnder ? `<p class="closed-note">Closed <b>${formatRupees(f.limit - (f.spentThisCycle || 0))}</b> under budget</p>` : '',
  });
}

// The third ring: how much of the money set aside this month has been used,
// across every set-aside Kawach can follow. None followed, no ring.
function asideRing(f) {
  const rows = (f.tracker || []).filter((t) => t.setAside && !t.skipped && t.status !== 'untracked' && t.amount > 0);
  const amount = rows.reduce((s, t) => s + t.amount, 0);
  if (!amount) return [];
  const used = rows.reduce((s, t) => s + Math.max(0, t.used || 0), 0);
  return [{ value: used / amount, grad: 'aside', big: formatRupees(used), label: `of ${formatRupees(amount)} set aside` }];
}

/* NEW (5.0, the Charts style): the month as layered waves. Three things on
 * one drawing, each already worked out: what has gone so far (the running
 * total), where an even pace through the budget would be by now, and what
 * each day took on its own along the bottom, the biggest day marked. From
 * the 1st to today; the days to come are not drawn. Exported for a test. */
// Each hatched drawing gets its own pattern id, so two on one page never share one.
let hatches = 0;
export function monthWaves(f) {
  const totals = f.spendDays || [];
  const daily = (f.spendByDay || []).map((d) => d.amount || 0);
  const n = totals.length;
  if (n < 2 || !(f.limit > 0) || !totals.some((v) => v > 0)) return '';
  const monthDays = (f.daysIntoCycle || n) + (f.daysToClose || 1) - 1;
  const pace = totals.map((_, i) => (f.limit * (i + 1)) / monthDays);
  const top = Math.max(...totals, ...pace) * 1.08;
  const W = 340, H = 156, base = 132;
  // A little room at each end, so the first and last day's marks are whole.
  const x = (i) => 10 + (i / (n - 1)) * (W - 20);
  const y = (v) => base - (v / top) * (base - 24);
  const bigDay = daily.indexOf(Math.max(...daily));
  const dmax = Math.max(...daily) || 1;
  const smooth = (pts) => pts.reduce((d, [px, py], i) => {
    if (!i) return `M${px.toFixed(1)} ${py.toFixed(1)}`;
    const [qx, qy] = pts[i - 1];
    const m = (px - qx) / 2;
    return `${d} C${(qx + m).toFixed(1)} ${qy.toFixed(1)} ${(px - m).toFixed(1)} ${py.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)}`;
  }, '');
  const layer = (vals, fy, cls) => {
    const d = smooth(vals.map((v, i) => [x(i), fy(v)]));
    return `<path class="waves__fill ${cls}" d="${d} L${x(vals.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z"/><path class="waves__line ${cls}" pathLength="100" d="${d}"/>`;
  };
  // Each day is a bar, so the picture says what a day cost; the line adds them
  // up against the budget's own line. (Before 5.23 the days were a third wave,
  // and a tag stuck on the biggest day made every month read as one number.)
  const bw = Math.max(2, Math.min(9, ((W - 20) / (n - 1)) * 0.55));
  const bars = daily
    .map((v, i) => (v > 0 ? `<rect class="waves__bar" data-bar="${i}" style="--d:${Math.max(0, Math.round(160 + ((x(i) - x(0)) / Math.max(1, x(n - 1) - x(0))) * 700 - 60))}ms" x="${(x(i) - bw / 2).toFixed(1)}" y="${(base - (v / dmax) * 44).toFixed(1)}" width="${bw.toFixed(1)}" height="${((v / dmax) * 44).toFixed(1)}" rx="2"/>` : ''))
    .join('');
  // What was spent outside the budget (5.38, the same as on Instrument): hatched, stacked on the
  // day's bar on the bars' own scale; a day that would leave the drawing is cut with a zigzag top.
  const hatchId = `hatch${(hatches += 1)}`;
  const other = (f.spendByDay || []).map((d) => d.other || 0);
  const CAP = 88;
  let waveCut = 0;
  const stacks = daily
    .map((v, i) => {
      if (!(other[i] > 0)) return '';
      const h1 = (v / dmax) * 44;
      const want = (other[i] / dmax) * 44;
      const h2 = Math.min(want, CAP - h1);
      if (h2 < 1.5) return '';
      const isCut = want > CAP - h1;
      if (isCut) waveCut += 1;
      return `<path class="waves__other" data-bar="${i}" fill="url(#${hatchId})" d="${stackPath(x(i) - bw / 2, x(i) + bw / 2, base - h1, base - h1 - h2, isCut)}"/>`;
    })
    .join('');
  const waveOther = other.some((v) => v > 0);
  const ticks = [...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])]
    .map((k) => `<text class="waves__tick" x="${x(k).toFixed(1)}" y="${H - 3}" text-anchor="middle">${Number(f.spendByDay[k].date.slice(8))}</text>`)
    .join('');
  const days = daily.map((v, i) => [f.spendByDay[i].date, v, totals[i], Math.round(pace[i]), +x(i).toFixed(1), +y(totals[i]).toFixed(1), f.spendByDay[i].other || 0]);
  const last = n - 1;
  return `<div class="totals-card waves-card" data-draw-key="${f.cycleKey || ''}" ${chartData(days, 10, W - 10, W, f)}>
      ${chartHead(f)}
      <svg class="waves no-swipe" viewBox="0 0 ${W} ${H}" role="img" aria-label="${f.finished ? 'The month' : 'This month so far'}: ${formatRupees(totals[n - 1])} spent against ${formatRupees(Math.round(pace[n - 1]))} of budget so far. Most in one day: ${formatRupees(daily[bigDay])} on ${formatDateNice(f.spendByDay[bigDay].date)}.">
        <defs><pattern id="${hatchId}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="waves__hatch" x1="0" y1="0" x2="0" y2="4"/></pattern></defs>
        ${bars}${stacks}
        ${ghostLine(f, n, x, y, smooth)}
        ${layer(pace, y, 'waves--pace')}
        ${layer(totals, y, 'waves--spent')}
        <line class="waves__guide" data-guide x1="${x(last).toFixed(1)}" x2="${x(last).toFixed(1)}" y1="8" y2="${base}"/>
        <circle class="waves__dot" data-dot cx="${x(last).toFixed(1)}" cy="${y(totals[last]).toFixed(1)}" r="4.5"/>
        ${ticks}
      </svg>
      <p class="chart-readout" data-readout aria-live="polite">${chartReadout(days[last], dayWord(days[last][0]), f.finished)}</p>
      <div class="waves__key">
        <span class="waves__k waves--spent"><b>${formatRupees(totals[n - 1])}</b><span class="waves__lab">${f.finished ? 'You spent' : "You've spent"}</span></span>
        <span class="waves__k waves--pace"><b>${formatRupees(Math.round(pace[n - 1]))}</b><span class="waves__lab">Budget so far</span></span>
        <button type="button" class="waves__k waves--day" data-pick-day="${bigDay}"><b>${formatRupees(daily[bigDay])} · ${formatDateNice(f.spendByDay[bigDay].date)}</b><span class="waves__lab">Most in one day</span></button>
      </div>
      ${waveOther ? `<p class="waves__note"><i></i>Hatched: spent, but not from your budget (set-aside costs, work costs owed back).${waveCut ? ' A zigzag top: a bigger day, cut short.' : ''}</p>` : ''}
    </div>`;
}

// Last month, by the same days, as a faint dashed line that appears while the chart is pressed (5.58).
function ghostLine(f, n, x, y, smooth) {
  if (typeof document === 'undefined' || document.documentElement.dataset.style !== 'haven') return '';
  const g = (f.ghost || []).slice(0, n);
  if (g.length < 3 || !g.some((v) => v > 0)) return '';
  const pts = g.map((v, i) => [x(i), y(v)]);
  return `<path class="waves__ghost" d="${smooth(pts)}"/><text class="waves__ghost-t" x="${(x(g.length - 1) - 4).toFixed(1)}" y="${Math.max(14, y(g[g.length - 1]) - 8).toFixed(1)}" text-anchor="end">Last month</text>`;
}

// One day's stack on a bar: a block from `from` up to `to`, its top flat or, for a day too big to fit, a zigzag.
function stackPath(l, r, from, to, isCut) {
  const m = (l + r) / 2;
  const z = 2.5;
  const top = isCut ? `M${l.toFixed(1)} ${(to + z).toFixed(1)} L${((l + m) / 2).toFixed(1)} ${to.toFixed(1)} L${m.toFixed(1)} ${(to + z).toFixed(1)} L${((m + r) / 2).toFixed(1)} ${to.toFixed(1)} L${r.toFixed(1)} ${(to + z).toFixed(1)}` : `M${l.toFixed(1)} ${to.toFixed(1)} L${r.toFixed(1)} ${to.toFixed(1)}`;
  return `${top} L${r.toFixed(1)} ${from.toFixed(1)} L${l.toFixed(1)} ${from.toFixed(1)} Z`;
}

/* The words every month chart shares (5.23): what it is, what to tap, and the
 * line that says what the day under your finger was. */
// Haven's chart title says the one thing the chart is for: how far ahead of an even pace the month is.
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function havenChartHead(f) {
  const n = (f.spendDays || []).length;
  const days = Math.max(n, (f.daysIntoCycle || n) + (f.daysToClose || 1) - 1);
  const ahead = f.finished || !(f.limit > 0) || !n ? null : Math.round((f.limit * (f.daysIntoCycle || n)) / days) - (f.spendDays[n - 1] || 0);
  const name = MONTH_LONG[Number(String(f.cycleKey || '').slice(5, 7)) - 1] || 'this month';
  return `<div class="chart-head"><b>${f.finished ? `How ${name} went` : `How ${name} is going`}</b>${ahead === null ? '' : `<span class="hv-muted hv-amt">${formatRupees(Math.abs(ahead))} ${ahead >= 0 ? 'under' : 'over'} pace</span>`}</div>`;
}
const chartHead = (f) => (document.documentElement.dataset.style === 'haven' ? havenChartHead(f) :
  `<div class="chart-head"><b>${f.finished ? 'How the month went' : 'How this month is going'}</b><small>Each bar is a day. The line adds them up, against your budget. Drag across to read a day.</small></div>`);
const chartData = (days, x0, x1, w, f) => `data-chart-days='${JSON.stringify(days)}' data-x0="${x0}" data-x1="${x1}" data-w="${w}" ${f.finished ? 'data-finished="1"' : ''}`;
const dayWord = (iso) => (iso === isoLocal(new Date()) ? 'Today' : new Date(`${iso}T12:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
export const chartReadout = (d, label, finished = false) =>
  `${label}: spent ${formatRupees(d[1])} that day${d[6] ? ` and ${formatRupees(d[6])} more that is not from your budget` : ''} · ${formatRupees(d[2])} ${finished ? 'by then' : 'so far'} · budget so far ${formatRupees(d[3])}`;

/* Drag across a month chart to read any day: a guide line and a dot follow the
 * finger, and the line under the chart says what that day was. */
// The month chart draws itself once per arrival on a screen, when it scrolls into view (css "chart
// draw"): the bars rise as the line reaches them and the dot lands as the line ends. A redraw of the
// same screen leaves it as drawn; with no motion wanted it is simply there.
const drawn = new Map();
function drawOnce(card) {
  const key = card.dataset.drawKey;
  if (key == null || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (drawn.get(key) === arrivalNow()) return;
  card.classList.add('is-armed');
  const watch = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      watch.disconnect();
      drawn.set(key, arrivalNow());
      card.classList.remove('is-armed');
      card.classList.add('is-drawing');
    },
    { threshold: 0.5 }
  );
  watch.observe(card);
}

// A small flag on the dot says how the month stands on that day ("₹7,218 under pace"); it follows the dot as you drag (Haven).
function flagFor(card, svg, days) {
  if (typeof document === 'undefined' || document.documentElement.dataset.style !== 'haven') return () => {};
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'waves__flag');
  svg.append(g);
  return (i) => {
    const d = days[i];
    const under = d[3] - d[2];
    const text = under >= 0 ? `${formatRupees(under)} under pace` : `${formatRupees(-under)} over pace`;
    const w = text.length * 5.4 + 14;
    const left = d[4] + w > 336;
    const x = left ? d[4] - w : d[4];
    const y = Math.max(16, d[5] - 8);
    g.innerHTML = `<line x1="${d[4]}" y1="${d[5] - 5}" x2="${d[4]}" y2="${y - 22}" class="waves__pole"/><path class="waves__pennant" d="M${x} ${y - 22} h${w} l-7 9 l7 9 h-${w} z"/><text class="waves__pt" x="${x + (left ? 6 : 6)}" y="${y - 9.5}">${text}</text>`;
  };
}

function wireCharts(root) {
  root.querySelectorAll('[data-chart-days]').forEach((card) => {
    if (card.dataset.wired) return;
    card.dataset.wired = '1';
    const days = JSON.parse(card.dataset.chartDays);
    const svg = card.querySelector('svg');
    const readout = card.querySelector('[data-readout]');
    const guide = card.querySelector('[data-guide]');
    const dot = card.querySelector('[data-dot]');
    const [x0, x1, w] = [Number(card.dataset.x0), Number(card.dataset.x1), Number(card.dataset.w)];
    const finished = Boolean(card.dataset.finished);
    let at = days.length - 1;
    // The guide and the dot are moved by a transform, so they glide to the day under the finger in step
    // with the bar that lifts and the reading that changes, all within 120 ms.
    const gx = Number(guide.getAttribute('x1'));
    const dx = Number(dot.getAttribute('cx'));
    const dy = Number(dot.getAttribute('cy'));
    const ring = card.querySelector('.waves__ring');
    const show = (i, quiet = false) => {
      if (i !== at && !quiet) scrubTick(card, i);
      at = i;
      const d = days[i];
      guide.style.transform = `translateX(${d[4] - gx}px)`;
      dot.style.transform = `translate(${d[4] - dx}px, ${d[5] - dy}px)`;
      if (ring) ring.style.transform = `translate(${d[4] - dx}px, ${d[5] - dy}px)`;
      card.querySelectorAll('[data-bar]').forEach((b) => b.classList.toggle('is-picked', Number(b.dataset.bar) === i));
      readout.textContent = chartReadout(d, dayWord(d[0]), finished);
      flagAt(i);
      if (!quiet && readout.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) readout.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 120 });
    };
    drawOnce(card);
    const flagAt = flagFor(card, svg, days);
    flagAt(days.length - 1);
    const dayAt = (clientX) => {
      const r = svg.getBoundingClientRect();
      const vx = ((clientX - r.left) / r.width) * w;
      return Math.max(0, Math.min(days.length - 1, Math.round(((vx - x0) / (x1 - x0)) * (days.length - 1))));
    };
    let dragging = false;
    svg.addEventListener('pointerdown', (e) => {
      dragging = true;
      try {
        svg.setPointerCapture?.(e.pointerId);
      } catch {
        /* a pointer that is already gone: the reading still follows the events it gets */
      }
      show(dayAt(e.clientX));
    });
    svg.addEventListener('pointermove', (e) => dragging && show(dayAt(e.clientX)));
    // The same reading from the keyboard: focus the chart, then the arrow keys step through the days.
    svg.setAttribute('tabindex', '0');
    // A tap or a drag must not draw a frame round the chart; the keyboard still gets one (css .waves:focus).
    svg.addEventListener('pointerdown', () => svg.classList.add('by-pointer'));
    svg.addEventListener('blur', () => svg.classList.remove('by-pointer'));
    svg.addEventListener('keydown', (e) => {
      const to = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: days.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      show(Math.max(0, Math.min(days.length - 1, to)));
    });
    ['pointerup', 'pointercancel'].forEach((t) => svg.addEventListener(t, () => (dragging = false)));
    card.querySelector('[data-pick-day]')?.addEventListener('click', (e) => show(Number(e.currentTarget.dataset.pickDay)));
  });
}

/* NEW (5.0): this week in pill columns, today lit, and what is owed on each
 * card the same way, the card with most on it lit. Exported for a test. */
export function weekPills(f) {
  const days = (f.spendByDay || []).slice(-7);
  if (!days.length) return '';
  const week = days.reduce((s, d) => s + (d.amount || 0), 0);
  const top = Math.max(...days.map((d) => d.amount || 0)) || 1;
  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  // Above a day's pill, hatched: what was spent that day outside the budget (5.38).
  const col = (h, lit, label, o) => `<span class="pill-col${lit ? ' pill-col--lit' : ''}">${o > 0 ? `<i class="pill-other${(o / top) * 100 > 35 ? ' is-cut' : ''}" style="height:${Math.max(6, Math.min(35, (o / top) * 100)).toFixed(0)}%"></i>` : ''}<i style="height:${Math.max(8, h * 100).toFixed(0)}%"></i><small>${label}</small></span>`;
  const weekCols = days.map((d, i) => col((d.amount || 0) / top, i === days.length - 1, DOW[new Date(`${d.date}T12:00`).getDay()], d.other || 0)).join('');
  const note = days.some((d) => d.other > 0) ? '<p class="waves__note pills-note"><i></i>Hatched: spent, but not from your budget.</p>' : '';
  return `<div class="totals-card pills-card">
      <div class="pills-row"><div><small>This week</small><b>${formatRupees(week)}</b></div><div class="pill-cols">${weekCols}</div></div>
      ${note}
    </div>`;
}

// The headline: what's left to spend, then the bank. Numbers first; the sums
// behind them are one tap away.
// `opts.past` is set for a month that is over ({ key, name }): the same
// figures, worked out as of its last day, without anything that is about now.
function renderSpendingLimit(f, opts = {}) {
  const owed = opts.past ? '' : renderOwed(f);
  if (!f.monthlyIncome || !f.salary.setUp) {
    const ask = f.incomeKind === 'business' ? 'what the house needs a month' : `your ${incomeWords(f.incomeKind).noun} and the day it arrives`;
    return `<div class="totals-card"><p class="muted-note">Add ${ask} on Plan to see what you can spend.</p></div>${owed ? `<div class="summary-rows">${owed}</div>` : ''}`;
  }
  if (f.noCommitments) {
    return `<div class="hero level-warning">
        <p class="hero-label">Left to spend</p>
        <p class="hero-amount">-</p>
        <p class="hero-sub">Add your fixed commitments on Plan first - without them your whole income looks free.</p>
      </div>${owed ? `<div class="summary-rows">${owed}</div>` : ''}`;
  }
  return renderCardsHero(f, opts);
}

// One short line under the headline number.
/* What the app noticed, from what it already worked out. Nothing here is
 * invented: each line is a figure free-to-spend.js already returned, and
 * when none of them is true the card is not drawn at all.
 */
// CHANGED: billed card bills worth a warning. A "bill" under ₹10 is a rounding
// leftover between a card's spends and the payment that settled them (₹0.81 on
// one card in the owner's own report), and free-to-spend.js already ignores it
// in the bank check. The card here did not, and turned it into a red "Card
// bill is still unpaid: ₹1". One rule, in one place, for this and the chart.
export function billedOnCards(f) {
  const billed = (f.totals && f.totals.unpaidBills) || 0;
  return billed >= 1000 ? billed : 0;
}

function insightCard(f) {
  const days = f.daysToClose;
  const billed = billedOnCards(f);
  const payday = f.salary && (f.salary.dates[0] || f.salary.nextUnreceived);
  const salaryPending = Boolean(
    payday &&
      !f.salary.alreadyIn &&
      (f.salary.late || payday >= f.today)
  );
  let tone = '';
  let title = '';
  let body = '';

  if (f.bankShortfall > 0) {
    tone = 'k-context--alert';
    title = billed > 0 ? 'Card bill is still unpaid' : 'Money owed is more than the bank can cover';
    body = (billed > 0
      ? `${formatRupees(billed)} is still unpaid on cards. ${salaryPending ? `After salary on ${formatDateNice(payday)}` : 'After salary'} and other bills, your bank is projected ${formatRupees(f.bankShortfall)} short.`
      : `${salaryPending ? `After salary on ${formatDateNice(payday)}` : 'After salary'} and other bills, your bank is projected ${formatRupees(f.bankShortfall)} short.`);
  } else if (salaryPending && billed > 0) {
    tone = 'k-context--attention';
    title = 'Card bill is still unpaid';
    body = `${formatRupees(billed)} is billed and unpaid. Salary is expected ${formatDateNice(payday)}.`;
  } else if (f.free != null && f.free < 0) {
    tone = 'k-context--alert';
    title = 'Over budget for this cycle';
    body = `You are ${formatRupees(-f.free)} past the ${formatRupees(f.limit)} this cycle had.`;
  } else if (f.level === 'critical' || f.level === 'warning') {
    tone = 'k-context--attention';
    title = days <= 7 ? 'The cycle is nearly over' : 'Spending is ahead of pace';
    body = f.crossesOn
      ? `At this pace the budget runs out on ${formatDateNice(f.crossesOn)}. ${formatRupees(f.perDay)} a day keeps it to ${formatDateNice(f.cycleKey)}.`
      : `${formatRupees(f.spentThisCycle || 0)} of ${formatRupees(f.limit)} is gone with ${days} day${days === 1 ? '' : 's'} to go.`;
  } else if (f.free != null && f.free > 0) {
    tone = 'k-context--calm';
    title = 'On track for this cycle';
    body = `${formatRupees(f.free)} left, about ${formatRupees(f.perDay)} a day until ${formatDateNice(f.cycleKey)}.`;
  } else {
    return '';
  }

  return `<div class="k-context summary-insight ${tone}">
      <span class="k-context__mark">${icon(tone === 'k-context--calm' ? 'check' : tone === 'k-context--attention' ? 'clock' : 'alert')}</span>
      <span class="k-context__body">
        <span class="k-context__k">${escapeHtml(title)}</span>
        <p class="k-context__note">${escapeHtml(body)}</p>
      </span>
    </div>`;
}

/* The shape of the money: what is committed before anything is decided,
 * when it actually goes, and where what you hold is sitting. Each drawing
 * is handed figures the model already produced.
 */
function moneyShape(f, { meter: withMeter = true } = {}) {
  const income = (f.monthlyIncome || 0) + (f.businessExtra || 0);
  const committed = income && f.limit != null ? income - f.limit : 0;

  // The short version leaves "committed" to Plan, where it is worked out.
  const meter = withMeter ? radialMeter({ committed, income }) : '';
  // (5.23) The days are drawn once, in the month chart; "When it goes" was the
  // same bars again.
  const pulse = '';

  // Your bank cash, and how much of it a card bill will take.
  //
  // This was meant to be "money you hold against room left on your cards",
  // but a card's credit limit is not in the data model anywhere - the app
  // never asks for it and no statement reader takes it - so that half would
  // have had to be invented. It is not drawn.
  //
  // The honest version of the same question: of the cash actually in the
  // bank, how much is already spoken for by card bills that have been
  // raised? Both figures are real, and together they are one total split in
  // two, which is what a ring can show without lying. Cash is never mixed
  // with card debt: debt a bank balance cannot cover is said apart, below.
  const cash = cashSplit(f);
  const sources = allocationRing({
    slices: [
      { label: 'Available bank cash', amount: cash.available },
      { label: 'Reserved for card bills', amount: cash.reserved },
    ],
    caption: cash.beyond > 0 ? `Card bills are ${formatRupees(cash.beyond)} more than your bank cash.` : '',
  });
  // With no cash to split but bills it cannot pay, the sentence still stands.
  const shortOnly = !sources && cash.beyond > 0 ? `<p class="muted-note">Card bills are ${formatRupees(cash.beyond)} more than your bank cash.</p>` : '';

  if (!meter && !pulse && !sources && !shortOnly) return '';
  return `
    ${meter ? `<section class="summary-viz"><h3 class="summary-viz__head">Before you decide anything</h3>${meter}</section>` : ''}
    ${pulse ? `<section class="summary-viz"><h3 class="summary-viz__head">When it goes</h3>${pulse}</section>` : ''}
    ${sources || shortOnly ? `<section class="summary-viz"><h3 class="summary-viz__head">Your bank cash</h3>${sources || shortOnly}</section>` : ''}`;
}

// CHANGED: the old labels - "Not yet claimed", "Claimed by card bills" -
// asked you to work out who was claiming what. These say what the money is.
//
//   available  cash in the bank that no card bill needs
//   reserved   cash a billed, unpaid card bill will take
//   beyond     billed card bills the bank cash cannot cover
//
// A "bill" under ₹10 is a rounding leftover between spends and the payment
// that settled them, not something owed (the same rule free-to-spend.js
// applies to estimated bills), and used to show as "Claimed by card bills ₹1".
// Exported so it can be tested.
export function cashSplit(f) {
  const held = Math.max(0, f.bank || 0);
  const owed = billedOnCards(f);
  const reserved = Math.min(held, owed);
  return { available: held - reserved, reserved, beyond: owed - reserved };
}

export function spendingStatus(f) {
  const until = formatDateNice(f.cycleKey);
  // The insight below names any bank shortfall and unpaid card bill. Repeating
  // it under the headline made two warnings compete for the same attention.
  if (f.level === 'over') return `Over budget - stop spending until ${until}`;
  if (f.level === 'critical') {
    if (f.crossesOn) return `Critical - runs out ${formatDateNice(f.crossesOn)} at this pace`;
    // CHANGED: free-to-spend.js lifts the headline to critical whenever the
    // bank cannot cover what is owed, however little of the budget is spent.
    // "Almost all used" was then simply false - ₹2,067 of ₹9,733, 21% - under
    // a red headline. Say what is true; the card below says how much, once.
    if (f.used < 0.9) return `About ${formatRupees(f.perDay)} a day until ${until}. Bank is short: see below.`;
    return 'Critical - almost all used';
  }
  if (f.level === 'warning') return f.crossesOn ? `Careful - runs out ${formatDateNice(f.crossesOn)} at this pace` : `Careful - ${formatRupees(f.spentThisCycle || 0)} of ${formatRupees(f.limit)} used`;
  return `About ${formatRupees(f.perDay)} a day until ${until}`;
}

// What the budget starts from, in the words of the kind of income.
function incomeLine(f) {
  if (f.incomeKind !== 'business') return incomeWords(f.incomeKind).label;
  if (f.plan.basis !== 'lowest') return 'What the house needs';
  return `Taken home, lowest month (${monthShort(f.plan.lowestMonth)})`;
}

const monthShort = (month) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month.slice(5, 7)) - 1];

const LOOK_TOPS = { haven: havenTop };

function renderCardsHero(f, opts = {}) {
  const past = opts.past || null;
  const line = breakdownLine;
  // A month that is over reads its own figures and nothing about the present:
  // no pace, no warnings, no bank check - those are about what happens next,
  // and for a closed month nothing does.
  const shown = past ? { ...f, level: f.free < 0 ? 'over' : 'ok', bankShortfall: 0, crossesOn: null } : f;
  // What must go out (rent, EMIs) and what can move (food, fun): the wiggle
  // room in the month, marked on each commitment on Plan.
  const mustItems = f.budgetItems.filter((b) => !b.item.flexible);
  const flexItems = f.budgetItems.filter((b) => b.item.flexible);
  const group = (title, items) =>
    items.length
      ? `<div class="totals-row"><span class="muted-note">${title} ${formatRupees(items.reduce((s, b) => s + b.amount, 0))}</span></div>${items
          .map((b) => line(escapeHtml(b.label), b.amount, '-'))
          .join('')}`
      : '';

  // CHANGED (4.22): the figures under the headline are one card of rows,
  // one figure a row, rather than figures side by side.
  // NEW (5.9): Tactile and Instrument draw this month's top half their
  // own way (summary-looks.js); a finished month and the plain look keep the
  // Charts one.
  const style = typeof document !== 'undefined' ? document.documentElement.dataset.style : '';
  const short = Boolean(opts.short);
  // CHANGED (5.22.2): a finished month is drawn in the same top as the month
  // running, so going back a month never changes the look. It says "Final for
  // September" where the pace was, shows the whole month, and leaves out what
  // is about now (this week, what is owed, what is coming).
  const lookTop = ['full', 'short'].includes(appearance('summary')) && f.limit != null && LOOK_TOPS[style];
  const drawn = past ? { ...shown, finished: true } : f;
  const top = lookTop
    ? lookTop(drawn, past ? `Final for ${past.name}` : short ? shortStatus(f) : spendingStatus(f), '', { latest: opts.latest, more: opts.more, still: Boolean(past) || quiet, chart: monthWaves(drawn), nav: opts.nav })
    : spendingHero(shown, short ? 'full' : appearance('summary'), past ? `Final for ${past.name}` : null, short ? shortStatus(f) : null) + `<!--k:answer-->
    ${past ? '' : monthWaves(f)}<!--k:month-->
    ${past ? '' : weekPills(f)}
    ${past ? '' : chartsCards(f)}
    ${past && ['full', 'short'].includes(appearance('summary')) ? '' : `<div class="summary-rows summary-strip">
      ${['full', 'short'].includes(appearance('summary')) ? '' : spentLine(f.spentThisCycle, f.limit, spendSpark(f.spendByDay))}
      ${past ? '' : stillSetAside(f)}
      ${
        // Owed on cards, and owed back by the employer while any is -
        // straight under the spent figure, where the other numbers are.
        // In the full look the cards' figure is in the columns above.
        past ? '' : renderOwed(f, { cards: !['full', 'short'].includes(appearance('summary')) })
      }
    </div>`}
    ${past ? '' : chartsComing(f)}`;
  return top + `
    ${(() => {
      const card = Math.max(0, f.cardSpent || 0);
      const bank = Math.max(0, f.bankSpent || 0);
      const total = card + bank;
      // Nothing spent yet: a bar of nothing is a shape with no meaning.
      const bar = total > 0
        ? `<div class="split-bar" role="img" aria-label="${formatRupees(card)} on cards, ${formatRupees(bank)} from the bank">
             <span class="split-bar__card" style="width:${((card / total) * 100).toFixed(1)}%"></span>
           </div>`
        : '';
      return `<div class="summary-spending-split" aria-label="Spending by where it was paid from">
        ${bar}
        <span class="split-k"><span class="split-dot split-dot--card"></span>On cards <strong>${formatRupees(card)}</strong></span>
        <span class="split-k"><span class="split-dot split-dot--bank"></span>From the bank <strong>${formatRupees(bank)}</strong></span>
      </div>`;
    })()}
    ${past || short ? '' : insightCard(f)}
    ${past ? '' : moneyShape(f, { meter: !short })}
      <details class="fts-breakdown hero-work">
        <summary>Budget breakdown</summary>
        <div class="totals-card">
          ${line(incomeLine(f), f.monthlyIncome, '+')}
          ${f.sideBusiness && f.businessExtra ? line(`From the business, lowest month (${monthShort(f.plan.lowestMonth)})`, f.businessExtra, '+') : ''}
          ${group('Must go out', mustItems)}
          ${group('Can flex', flexItems)}
          ${f.keep ? line('Saved each month', f.keep, '-') : ''}
          <div class="totals-row net"><span>Budget</span><span>${formatRupees(f.limit)}</span></div>
          ${f.cards
            .filter((c) => c.owed !== 0)
            .map((c) => line(escapeHtml(c.account.label), c.owed, c.owed < 0 ? '+' : '-', `this cycle${c.refunds ? ` · after ${formatRupees(c.refunds)} refunds` : ''}`))
            .join('')}
          ${f.cardCommitmentCharges.map((c) => line(escapeHtml(c.label), c.amount, '+', 'commitment, already in the budget')).join('')}
          ${line('Bank spending', f.bankSpent, '-', `UPI and more, ${formatDateNice(f.bankMonthStart)} to ${formatDateNice(f.bankMonthEnd)}`)}
          ${
            // Shown so you can see they were left out, never counted: money you
            // will be paid back is not money you spent.
            f.workCostsThisMonth
              ? `<div class="totals-row sub"><span class="muted-note">Work costs this month, owed back by your employer · not counted</span><span class="muted-note">${formatRupees(f.workCostsThisMonth)}</span></div>`
              : ''
          }
          ${biggestSpends(f)}
          ${(f.returned || [])
            .map(
              (p) =>
                `<div class="totals-row sub"><span class="muted-note">${formatDateNice(p.sent.date)} · ${escapeHtml(shortDescription(p.sent.rawDescription))}, came back ${formatDateNice(
                  p.back.date
                )} · not counted</span><span class="muted-note">${formatRupees(p.sent.amount)}</span></div>`
            )
            .join('')}
          <div class="totals-row net"><span>Left to spend</span><span>${formatRupees(f.free)}</span></div>
        </div>
        ${past ? '' : f.notes.map((n) => `<p class="muted-note">${escapeHtml(n)}</p>`).join('')}
      </details>`;
}

// How much of the month is already spoken for: the one question the hero
// cannot answer, so it gets its own picture rather than a line in a list
// (design.md block 04). The figures are the ones Plan is built from; nothing
// is worked out again here.
// Everything past "what needs me" waits behind a tap. <details> needs no
// wiring, and the buttons inside keep working because the markup is
// unchanged - it is only closed.
function fold(title, count, body, open = false, id = '') {
  if (!body) return '';
  return `<details class="disclose"${id ? ` id="${id}"` : ''}${open ? ' open' : ''}>
      <summary><span class="disclose-t">${title}</span>${count ? `<span class="disclose-c">${count}</span>` : ''}</summary>
      <div class="disclose-body">${body}</div>
    </details>`;
}

/* What is left of the money you set aside, said once.
 *
 * A set-aside is not a bill: ₹2,000 kept for Amazon Pay may be spent in
 * full, in part, or not at all. The budget takes the whole amount out at the
 * start of the month whatever happens, which keeps "Left to spend" a steady
 * number you can trust all month - but it also meant the ₹800 you did not
 * spend simply disappeared from the screen. It is still your money. This
 * says so, beside the two figures it belongs with, and opens into the
 * commitments where each amount is listed.
 *
 * The figure is `left` on the tracker row, which free-to-spend has always
 * worked out. Nothing about the calculation changes.
 */
function stillSetAside(f) {
  if (!f.tracker) return '';
  // Only what Kawach can actually follow. An untracked set-aside has no
  // payments matched to it, so claiming the whole amount is still there
  // would be a guess dressed up as a figure. Same rows free-to-spend uses
  // when it works out what is safe to keep spending.
  const left = keptBack(f);
  if (!left) return '';
  return `<button type="button" class="summary-row summary-row--tap" id="set-aside-stat">
      <span class="summary-row__k">Kept back<small>set aside, not spent yet</small></span>
      <span class="summary-row__v">${formatRupees(left)}</span>
    </button>`;
}

// One thing, promoted, and only when it genuinely needs the person: a dated
// commitment that is late or lands within three days. Everything settled
// stays in the list below (design.md block 23).
function renderDueSoon(f) {
  if (!f.tracker) return '';
  const today = isoLocal(new Date());
  const soon = addDaysIso(today, 3);
  const items = f.tracker
    .filter((t) => t.due && !t.setAside && !t.skipped && ['due', 'late', 'part'].includes(t.status) && t.due <= soon)
    .sort((a, b) => (a.due < b.due ? -1 : 1));
  if (!items.length) return '';
  const t = items[0];
  const days = daysBetween(today, t.due);
  const when = t.due < today ? 'overdue' : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`;
  const owed = t.left > 0 ? t.left : t.amount;
  // One thing needing you is a warning. Three or four is just the month, and
  // dressing it up in red teaches you to ignore red (design.md block 23), so
  // it is said plainly and the list below has the rest.
  if (items.length > 2) {
    const total = items.reduce((s, x) => s + (x.left > 0 ? x.left : x.amount), 0);
    return `<div class="totals-card due-soon">
      <div class="totals-row">
        <span><strong>${items.length} commitments</strong> due in the next few days<br><span class="muted-note">${escapeHtml(t.label)} first, ${when}</span></span>
        <span>${formatRupees(total)}</span>
      </div>
    </div>`;
  }
  const more = items.length > 1 ? `<span class="muted-note">and one more soon</span>` : '';
  return `<div class="totals-card warn-card due-soon">
      <div class="totals-row">
        <span><strong>${escapeHtml(t.label)}</strong> ${when}${more ? `<br>${more}` : ''}</span>
        <span class="out">${formatRupees(owed)}</span>
      </div>
    </div>`;
}

const daysBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);

// The handful of payments that make up most of the bank spending. A single
// total invites "that can't be right" with nothing to check it against; four
// lines naming the big ones either explain the figure or show what to fix.
function biggestSpends(f) {
  const big = [...f.bankSpends].sort((a, b) => b.amount - a.amount).slice(0, 4).filter((t) => t.amount >= 100000);
  if (big.length < 2) return '';
  const rest = f.bankSpends.length - big.length;
  return `
    ${big
      .map(
        (t) =>
          `<div class="totals-row sub"><span class="muted-note">${formatDateNice(t.date)}${
            t.rawDescription ? ` · ${escapeHtml(shortDescription(t.rawDescription))}` : ''
          }</span><span class="muted-note">${formatRupees(t.amount)}</span></div>`
      )
      .join('')}
    ${rest > 0 ? `<div class="totals-row sub"><span class="muted-note">and ${rest} smaller</span><span class="muted-note">${formatRupees(f.bankSpent - big.reduce((s, t) => s + t.amount, 0))}</span></div>` : ''}
  `;
}

// Enough of a bank narration to recognise the payment, without the reference
// numbers that make up most of its length.
/* The work costs behind "Owed back": oldest first, each with what is still owed
 * of it, then the refunds that have come in. Tapping one opens it in History. */
let owedOpen = false;
function owedListHtml(f) {
  const r = f.reimbursable || {};
  const items = r.items || [];
  const refunds = r.refunds || [];
  const late = f.refundOverdue ? f.refundOverdue.since : null;
  const row = (i) => `<button type="button" class="owed-row" data-month="${i.date.slice(0, 7)}" data-search="${escapeAttr(shortDescription(i.description).slice(0, 18))}">
      <span class="owed-row__d">${formatDateNice(i.date)}</span>
      <span class="owed-row__t">${escapeHtml(shortDescription(i.description))}<small>${escapeHtml(i.account)}${i.amount < i.cost ? ` · ${formatRupees(i.cost - i.amount)} of ${formatRupees(i.cost)} paid back` : ''}</small></span>
      <span class="owed-row__v">${formatRupees(i.amount)}</span>
    </button>`;
  return `<div class="owed-list" id="owed-back-list">
      <div class="owed-list__head"><span>Work costs not paid back yet</span><b>${formatRupees(r.owed || 0)}</b></div>
      ${items.length ? items.map(row).join('') : '<p class="owed-list__none">Nothing is waiting.</p>'}
      ${late ? `<p class="owed-list__late">Some of this is late, since ${formatDateNice(late)}.</p>` : ''}
      ${
        refunds.length
          ? `<div class="owed-list__head owed-list__head--sub"><span>Paid back so far</span></div>
             ${refunds.map((x) => `<div class="owed-row owed-row--in"><span class="owed-row__d">${formatDateNice(x.date)}</span><span class="owed-row__t">Your employer<small>${escapeHtml(x.account)}</small></span><span class="owed-row__v">+${formatRupees(x.amount)}</span></div>`).join('')}`
          : ''
      }
      <p class="owed-list__tip">Got paid back? Open the payment in History or when adding it, and tick "This pays back a work cost".</p>
    </div>`;
}

function shortDescription(text) {
  const words = String(text)
    .replace(/\d{5,}/g, ' ')
    .split(/[^A-Za-z0-9&.]+/)
    // Not numbers, and not reference codes like "HDFCD30F751E6BF1".
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !(w.length >= 8 && /\d/.test(w) && /[A-Za-z]/.test(w)));
  return words.slice(0, 3).join(' ').slice(0, 30) || 'payment';
}

// The bank check: what's in the account now, and where it ends up after the
// next salary and the bills. It never adds to the budget above.
function renderBankCard(f) {
  if (f.bank == null) {
    return `<div class="totals-card"><p class="muted-note">Import a bank statement to see your balance.</p></div>`;
  }
  const line = breakdownLine;

  // With more than one account the total alone doesn't say where the money
  // is, and ₹60,000 spread as ₹1,000 and ₹59,000 is a different situation
  // from ₹31,000 in each. One line per account, only when there are two or
  // more, so a single-account user sees no extra text.
  //
  // Accounts kept for savings or a loan are listed after them as "put away":
  // yours, but not in the figure above, because that figure is what you can
  // spend without touching your savings.
  const putAway = withDeposits(f.savings || []).filter((s) => s.balance != null);
  const spendLines =
    f.bankLines.length > 1 || putAway.length
      ? f.bankLines.map((l) => `<span class="bank-account"><span class="muted-note">${escapeHtml(l.account.label)}</span><span>${formatRupees(l.balance)}</span></span>`).join('')
      : '';
  const awayLines = putAway
    .map(
      (s) =>
        `<span class="bank-account put-away"><span class="muted-note">${escapeHtml(s.account.label)}${s.deposits ? ' + FD' : ''} · put away</span><span>${formatRupees(s.balance)}</span></span>`
    )
    .join('');
  const perAccount = spendLines || awayLines ? `<div class="bank-accounts">${spendLines}${awayLines}</div>` : '';

  if (f.bankAfterBills == null) {
    return `
      <div class="totals-card bank-card">
        <div><span class="hero-label">In bank</span><p class="bank-amount">${formatRupees(f.bank)}</p></div>
        ${perAccount}
      </div>`;
  }

  const tone = f.bankLevel === 'over' ? 'out' : f.bankLevel === 'warning' ? 'warn' : '';
  // What the bank pays before money next comes in: before payday, or for a
  // business owner, this month.
  const before = f.incomeKind === 'business' ? 'this month' : `before ${incomeWords(f.incomeKind).noun}`;
  return `
    <div class="totals-card bank-card level-${f.bankLevel}">
      <div class="bank-figures">
        <div><span class="hero-label">In bank</span><p class="bank-amount">${formatRupees(f.bank)}</p></div>
        <div class="bank-after"><span class="hero-label">${incomeWords(f.incomeKind).afterBank}</span><p class="bank-amount small ${tone}">${formatRupees(f.bankAfterBills)}</p></div>
      </div>
      ${
        // The cautious figure above is what is in hand. This is the same check
        // if what is owed back for work arrives, and says so when it is late.
        (() => {
          const w = ifRefunded(f);
          const late = f.refundOverdue;
          return `${
            w
              ? `<div class="bank-refund"><span class="muted-note">If your employer pays back ${formatRupees(w.refund)}</span><span class="${w.after < 0 ? 'out' : 'in'}">${formatRupees(w.after)}</span></div>`
              : ''
          }${late ? `<p class="bank-late muted-note">${formatRupees(late.amount)} from your employer is late: it was due back by the ${formatDateNice(late.since)} statement.</p>` : ''}`;
        })()
      }
      <details class="fts-breakdown">
        <summary>Bank breakdown</summary>
        ${perAccount}
        <div class="totals-card">
          ${f.bankLines.map((l) => line(escapeHtml(l.account.label), l.balance, '+', `as of ${formatDateNice(l.asOf)}${l.entriesSince ? ` + ${l.entriesSince} since` : ''}`)).join('')}
          ${f.bankLines.length > 1 ? `<div class="totals-row net"><span>In bank now</span><span>${formatRupees(f.bank)}</span></div>` : ''}
          ${f.bankBeforeSalary.map((c) => line(escapeHtml(c.label), c.amount, '-', `${before} · ${c.detail}`)).join('')}
          ${f.billsBeforeSalary.map((b) => line(escapeHtml(b.label), b.amount, '-', `${before} · ${b.detail}`)).join('')}
          <div class="totals-row net"><span>${before[0].toUpperCase() + before.slice(1)}</span><span>${formatRupees(f.bankBeforeCards)}</span></div>
          ${f.fundedMonths
            .map(
              (m) =>
                line(incomeWords(f.incomeKind).paid, m.amount, '+', `${formatDateNice(m.payday)}${f.salary.late && m.payday === f.salary.dates[0] ? ' · not in yet' : ''}`) +
                m.commitments.map((c) => line(escapeHtml(c.label), c.amount, '-', c.detail)).join('')
            )
            .join('')}
          ${f.cardBills.map((b) => line(escapeHtml(b.label), b.amount, '-', b.detail)).join('')}
          ${f.cards.filter((c) => c.owed > 0).map((c) => line(`${escapeHtml(c.account.label)} bill`, c.owed, '-', 'this cycle')).join('')}
          ${f.cardUpcoming.map((c) => line(escapeHtml(c.label), c.amount, '-', `still to come · ${escapeHtml(c.detail)}`)).join('')}
          <div class="totals-row net"><span>${incomeWords(f.incomeKind).afterBank}</span><span>${formatRupees(f.bankAfterBills)}</span></div>
        </div>
      </details>
    </div>`;
}

// Each commitment on one line: name, a status pill, used of planned and a
// bar. Tapping a row opens its payments and buttons. Paid and skipped ones
// fold away at the bottom.
function renderCommitmentTracker(f) {
  if (!f.tracker || f.tracker.length === 0 || f.free == null) return '';
  const order = { over: 0, 'heading-over': 1, late: 2, part: 3, due: 4, ok: 5, untracked: 6, paid: 7, skipped: 8 };
  const rank = (t) => (t.order == null ? Number.MAX_SAFE_INTEGER : t.order);
  const sorted = [...f.tracker].sort((a, b) => order[a.status] - order[b.status] || rank(a) - rank(b) || b.amount - a.amount);
  const open = sorted.filter((t) => t.status !== 'paid' && t.status !== 'skipped');
  const done = sorted.filter((t) => t.status === 'paid' || t.status === 'skipped');
  const doneLabel = [
    done.filter((t) => t.status === 'paid').length && `${done.filter((t) => t.status === 'paid').length} paid`,
    done.filter((t) => t.status === 'skipped').length && `${done.filter((t) => t.status === 'skipped').length} skipped`,
  ]
    .filter(Boolean)
    .join(' · ');

  // Bank and card commitments do not run over the same days, so they are no
  // longer shown as though they do. A card one belongs to its card cycle,
  // which after the statement day is next month's bill - and that is exactly
  // when one undivided list could talk someone into spending an allowance
  // their next salary has to cover.
  const onMonth = open.filter((t) => t.period !== 'cycle');
  const onCycle = open.filter((t) => t.period === 'cycle');
  const monthName = MONTH_NAMES[Number(f.monthKey.slice(5, 7)) - 1];
  // The dates the card group covers, taken from the rows themselves rather
  // than worked out again here.
  const cycleRow = onCycle[0];
  const cycleNote = cycleRow
    ? `${formatDateNice(cycleRow.periodStart)} to ${formatDateNice(cycleRow.cycleKey)} \u00b7 billed next month`
    : '';

  const group = (rows, title, note) =>
    rows.length
      ? `<div class="section-head"><h3>${title}</h3><span class="section-note">${note}</span></div>
         <div class="totals-card commitment-list">${rows.map((t) => commitmentRow(t)).join('')}</div>`
      : '';

  // Paid and skipped go together at the end: which period they belonged to
  // stops mattering once they are done with.
  const settled = done.length
    ? `<div class="totals-card commitment-list">
         <details class="commitment-done" ${open.length ? '' : 'open'}>
           <summary>${doneLabel}</summary>
           ${done.map((t) => commitmentRow(t)).join('')}
         </details>
       </div>`
    : '';

  return `
    ${group(onMonth, 'From your bank', monthName)}
    ${group(onCycle, 'On your cards', cycleNote)}
    ${settled}`;
}

// Loans and savings: what you still owe and what is put away. Neither is
// money to spend, so both sit behind a tap.
// A fixed deposit belongs to the savings account it was opened from, so it is
// shown as part of that account ("SBI Savings + FD") rather than as an
// account of its own. One with no parent here stays as it is.
function withDeposits(list) {
  const parents = new Set(list.map((s) => s.account.id));
  const deposits = list.filter((s) => s.account.depositOf && parents.has(s.account.depositOf));
  return list
    .filter((s) => !deposits.includes(s))
    .map((s) => {
      const own = deposits.filter((d) => d.account.depositOf === s.account.id);
      return own.length ? { ...s, deposits: own, balance: (s.balance || 0) + own.reduce((t, d) => t + (d.balance || 0), 0) } : s;
    });
}

function renderLoansSavings(f) {
  const loans = f.loans || [];
  const savings = [...withDeposits(f.savings || []), ...(f.pf || [])];
  if (!loans.length && !savings.length) return '';
  const owed = loans.reduce((s, l) => s + (l.outstanding || 0), 0);
  const put = savings.reduce((s, x) => s + (x.balance || 0), 0);
  const summary = [owed ? `${formatRupees(owed)} owed` : '', put ? `${formatRupees(put)} put away` : ''].filter(Boolean).join(' · ');
  return `
    <details class="section-fold">
      <summary>Loans and savings<span class="summary-sub">${summary}</span></summary>
      <div class="totals-card">
        ${loans
          .map(
            (l) => `<div class="totals-row"><span>${escapeHtml(l.account.label)}${
              l.emi ? `<br><span class="muted-note">${formatRupees(l.emi)} a month</span>` : ''
            }</span><span class="out">${l.outstanding != null ? formatRupees(l.outstanding) : '-'}</span></div>`
          )
          .join('')}
        ${savings
          .map(
            (s) => `<div class="totals-row"><span>${escapeHtml(s.account.label)}${s.deposits ? ' + FD' : ''}</span><span class="in">${
              s.balance != null ? formatRupees(s.balance) : '-'
            }</span></div>`
          )
          .join('')}
        <p class="muted-note">Put away is yours, but not counted as money to spend.</p>
      </div>
    </details>`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The pill: the one word or figure that says where a commitment stands.
function commitmentPill(t) {
  if (t.status === 'over') return { text: `Over by ${formatRupees(t.over)}`, tone: 'over' };
  if (t.stop) return t.stop.safe === 0 ? { text: 'Stop', tone: 'over' } : { text: `${formatRupees(t.stop.safe)} safe`, tone: 'warn' };
  if (t.status === 'heading-over') return { text: 'Heading over', tone: 'warn' };
  if (t.status === 'late') return { text: 'Not seen', tone: 'warn' };
  if (t.status === 'due') return { text: `Due ${formatDateNice(t.due)}`, tone: '' };
  if (t.status === 'part') return { text: `${formatRupees(t.left)} to go`, tone: '' };
  if (t.status === 'untracked') return { text: 'Not tracked', tone: '' };
  if (t.status === 'paid') return { text: t.marked && !t.used ? 'Marked paid' : 'Paid', tone: 'ok' };
  if (t.status === 'skipped') return { text: 'Skipped', tone: '' };
  return { text: `${formatRupees(Math.max(0, t.left))} left`, tone: '' };
}

function commitmentRow(t) {
  const state = commitmentPill(t);
  const shown = t.marked ? Math.max(t.used, t.amount) : t.used;
  const pct = t.amount > 0 ? Math.min(100, Math.round((shown / t.amount) * 100)) : 0;
  const barTone = state.tone === 'over' ? 'over' : state.tone === 'warn' ? 'warn' : '';
  const unpaid = !['paid', 'over', 'skipped'].includes(t.status) && t.kind !== 'loan';
  const buttons = t.skipped
    ? `<button type="button" class="btn-tiny commitment-unskip" data-id="${t.id}" data-key="${t.cycleKey}">Undo skip</button>`
    : t.marked
      ? `<button type="button" class="btn-tiny commitment-unmark" data-id="${t.id}" data-key="${t.cycleKey}">Undo mark paid</button>`
      : unpaid
        ? `<button type="button" class="btn-tiny commitment-mark-paid" data-id="${t.id}" data-key="${t.cycleKey}">Mark paid</button>
           <button type="button" class="btn-tiny commitment-skip" data-id="${t.id}" data-key="${t.cycleKey}">Skip this month</button>`
        : '';
  const detail = t.stop
    ? t.stop.safe === 0
      ? `The remaining ${formatRupees(t.left)} isn't there - you're over budget.`
      : `Only ${formatRupees(t.stop.safe)} of the remaining ${formatRupees(t.left)} is safe while you're over budget.`
    : t.status === 'heading-over'
      ? `At this pace ${formatRupees(t.projected)} by the end - ${formatRupees(t.projected - t.amount)} over.`
      : t.status === 'untracked'
        ? 'Add its statement words on Plan, or mark it paid.'
        : '';

  return `
    <details class="commitment-row ${t.skipped ? 'is-skipped' : ''}">
      <summary>
        <span class="commitment-name">${escapeHtml(t.label)}</span>
        <span class="commitment-side">
          <span class="commitment-amount">${t.used && !t.skipped ? `${formatRupees(t.used)} / ` : ''}${formatRupees(t.amount)}</span>
          ${t.kind === 'loan' ? pill('Loan') : ''}
          ${pill(state.text, state.tone)}
        </span>
        ${t.skipped ? '' : `<span class="commitment-bar"><span class="${barTone}" style="width:${pct}%"></span></span>`}
      </summary>
      <div class="commitment-detail">
        ${detail ? `<p class="muted-note">${detail}</p>` : ''}
        ${t.hint ? `<p class="muted-note">${escapeHtml(t.hint)}</p>` : ''}
        ${t.matches
          .map(
            (m) => `<div class="tracker-match">
              <div class="totals-row"><span class="muted-note">${formatDateNice(m.date)} · ${escapeHtml((m.description || '').slice(0, 48))}${m.tagged ? ' · tagged' : m.onSalaryDay ? ' · salary day' : ''}</span><span>${formatCurrency(m.amount)}</span></div>
              <div class="tracker-actions">
                <button type="button" class="icon-btn match-not-this" data-txn="${m.id}" data-id="${t.id}">Not this</button>
                <button type="button" class="icon-btn match-remove" data-txn="${m.id}">Remove copy</button>
              </div>
            </div>`
          )
          .join('')}
        ${(t.notThis || [])
          .map(
            (e) => `<div class="tracker-match">
              <div class="totals-row"><span class="muted-note">${formatDateNice(e.date)} · ${escapeHtml((e.description || '').slice(0, 48))} · "Not this"</span><span>${formatCurrency(e.amount)}</span></div>
              <div class="tracker-actions"><button type="button" class="btn-tiny match-count-again" data-txn="${e.id}" data-id="${t.id}">Count it again</button></div>
            </div>`
          )
          .join('')}
        ${buttons ? `<div class="tracker-actions">${buttons}</div>` : ''}
      </div>
    </details>`;
}

// A phone notification the first time this cycle's spending reaches warning,
// critical or over - once per level per cycle, only with reminders turned on.
async function notifySpendingLevel(f) {
  if (!['warning', 'critical', 'over'].includes(f.level) || !f.cycleClose) return;
  try {
    if (!(await getSetting('remindersEnabled', false)) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const key = `${f.cycleClose}:${f.level}`;
    const sent = await getSetting('spendingAlertsSent', []);
    if (sent.includes(key)) return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return;
    await reg.showNotification(f.level === 'warning' ? 'Spending: getting close' : f.level === 'critical' ? 'Spending: critical' : 'Spending budget crossed', {
      body: spendingWarning(f),
      tag: `spending-${f.cycleClose}`,
      icon: './icons/kawach-192.png',
      badge: './icons/badge-96.png',
      data: { view: 'summary' },
    });
    await setSetting('spendingAlertsSent', [...sent.filter((k) => k.split(':')[0] === f.cycleClose), key]);
  } catch (e) {
    // A notification that can't be shown still leaves the warning on screen.
  }
}

async function renderAttention(container, transactions, fts = null) {
  const el = container.querySelector('#attention-section');
  if (!el) return;

  const [accounts, categories, budgets, alertsWaiting, syncConfig, syncPass, lastBackupAt, recurring] = await Promise.all([
    getAll('accounts'),
    getAll('categories'),
    getBudgets(),
    pendingCount(),
    getSyncConfig(),
    getSyncPassphrase(),
    getSetting('lastBackupAt', null),
    getAll('recurring'),
  ]);
  // Only once there's something worth losing.
  const safety = transactions.length ? dataSafety(syncConfig, syncPass, lastBackupAt) : { ok: true };
  // Once you back up to Drive, the reminder is about that: one more after a
  // week, one tap away.
  const { driveLastAt } = await backupStatus();
  const driveDays = driveLastAt ? Math.floor((Date.now() - driveLastAt) / 86400000) : null;
  const uncategorized = transactions.filter((t) => needsCategory(t));
  const monthStart = `${currentMonthKey()}-01`;
  const dismissed = new Set(await getSetting('dismissedAnomalies', []));
  const anomalies = (await detectAnomalies(monthStart)).filter((a) => !dismissed.has(a.transaction.id));

  // How many of the uncategorised ones the app could sort on its own from what
  // it has already learned. Offering "sort 94 of these for me" is a far better
  // answer than "136 need a category".
  const autoSortable = uncategorized.length ? await applyLearnedCategories({ dryRun: true }) : 0;
  // Spends filed under Income (before 5.23 the matcher could do that).
  const incomeSpends = await incomeSpendCount();

  const dueCards = accounts
    .map((a) => ({ account: a, bill: cardBillDue(a) }))
    .filter((x) => x.bill && !x.bill.paid && x.bill.daysLeft != null && x.bill.daysLeft <= 5);

  // Only a category that is already over: "nearly there" is a number to read on Plan, not something to do.
  const budgetAlerts = (await budgetStatusForMonth(budgets, categories, transactions, (fts && fts.monthKey) || currentMonthKey())).filter((b) => b.state === 'over');

  // Spending, the bank and each commitment already speak for themselves
  // above; this list is only things to do.
  const duplicates = fts ? fts.duplicates : [];
  const sameAccounts = fts ? fts.duplicateAccounts : [];
  const cardPayments = fts ? fts.unassignedCardPayments || [] : [];
  const cards = accounts.filter((a) => a.type === 'card');

  const short = shortMode();
  const todo = (icon, title, sub, action = '', tone = '') =>
    short
      ? `<div class="need-row ${tone}"><span class="need-row__ic" aria-hidden="true">${icon}</span><span class="need-row__t"><span>${title}</span>${sub ? `<small>${sub}</small>` : ''}</span>${action ? `<span class="need-row__go">${action}</span>` : ''}</div>`
      : `<div class="todo-row"><span class="todo-icon" aria-hidden="true">${icon}</span><span class="todo-text"><span>${title}</span>${sub ? `<span class="muted-note ${tone}">${sub}</span>` : ''}</span>${action ? `<span class="attention-actions">${action}</span>` : ''}</div>`;
  // NEW (5.18): in the short version, the bank running short and the
  // commitments due in the next three days come first - said here and
  // nowhere else on the screen.
  const urgent = [];
  if (short && fts) {
    if (fts.bankShortfall > 0) {
      const payday = fts.salary && (fts.salary.dates[0] || fts.salary.nextUnreceived);
      urgent.push(todo(icon('alert'), `Bank will be <b>${formatRupees(fts.bankShortfall)} short</b>`, payday ? `after salary on ${formatDateNice(payday)} and bills` : 'after salary and bills', '<button type="button" class="btn-tiny" id="need-bank-why">See why</button>', 'is-alert'));
    }
    const today = isoLocal(new Date());
    const soon = addDaysIso(today, 3);
    for (const t of (fts.tracker || []).filter((x) => x.due && !x.setAside && !x.skipped && ['due', 'late', 'part'].includes(x.status) && x.due <= soon).sort((a, b) => (a.due < b.due ? -1 : 1))) {
      const days = daysBetween(today, t.due);
      const when = t.due < today ? 'late' : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`;
      urgent.push(todo(categoryStyle(t.label).icon, `<b>${escapeHtml(t.label)} ${formatRupees(t.left > 0 ? t.left : t.amount)}</b>`, when, `<button type="button" class="btn-tiny commitment-mark-paid" data-id="${t.id}" data-key="${t.cycleKey}">Mark paid</button>`, t.due < today ? 'is-alert' : 'is-soon'));
    }
  }

  // NEW (5.20): money lent and not back by the day you expected it. Said
  // with the amount and the day, and Remind one tap away.
  const lateLent = fts ? lateBack(fts.people || [], isoLocal(new Date())) : [];
  const lateRows = lateLent.map((x) =>
    todo(icon('clock'), `<b>${escapeHtml(x.person.name)} ${formatRupees(x.owed)}</b>`, `was due back ${formatDateNice(x.person.backBy)}`, `<button type="button" class="btn-tiny person-remind" data-text="${escapeAttr(reminderText(x.person.name, x.owed, formatDateNice(x.since)))}">Remind</button>`, 'is-soon')
  );
  // NEW (5.21): a renewal in the week ahead, or a few days gone. "Renewed"
  // moves it on to next time; left alone, it moves on by itself.
  const renewing = renewalsAhead(recurring.filter((r) => isLiveCommitment(r) && renews(r)), isoLocal(new Date())).filter((r) => r.days < 0); // only one that has gone by: next week's is a reminder, and Plan has it
  const renewRows = renewing.map(({ item, due, days }) =>
    todo(icon('clock'), `<b>${escapeHtml(item.label)} ${formatRupees(item.amount)}</b>`, days < 0 ? `renewal was due ${formatDateNice(due)}` : days === 0 ? 'renews today' : `renews ${formatDateNice(due)}`, `<button type="button" class="btn-tiny renewal-done" data-id="${item.id}">Renewed</button>`, days < 0 ? 'is-alert' : 'is-soon')
  );
  if (short) urgent.push(...lateRows, ...renewRows);

  const rows = [
    incomeSpends
      ? todo(icon('tag'), `${incomeSpends} spend${incomeSpends === 1 ? '' : 's'} filed as Income`, 'Money going out is never income', '<button type="button" class="btn-tiny primary" id="fix-income-btn">Fix</button>', 'is-alert')
      : '',
    driveDays != null
      ? driveDays >= 7
        ? todo(icon('backup'), 'Back up to Google Drive', `Last one ${driveDays} days ago`, '<button type="button" class="btn-tiny primary" id="go-drive-btn">Back up</button>')
        : ''
      : safety.ok || isDemo()
        ? ''
        : todo(icon('backup'), safety.daysUnprotected == null ? 'No backup yet' : `No backup for ${safety.daysUnprotected} days`, 'Your data lives only on this phone', '<button type="button" class="btn-tiny primary" id="go-backup-btn">Back up</button>'),
    ...cardPayments.map((p) =>
      todo(
        icon('card'),
        `${formatRupees(p.amount)} card bill paid ${formatDateNice(p.date)}`,
        'Which card did it pay?',
        `<select class="assign-card" data-txn="${p.id}" aria-label="Card this payment paid"><option value="">Pick card</option>${cards.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('')}</select>`
      )
    ),
    ...sameAccounts.map((group) => todo(icon('copy'), `${group.length} accounts for ••${escapeHtml(group[0].last4)}`, 'Delete one on Cards so it isn\'t counted twice', '', 'bill-overdue')),
    duplicates.length ? todo(icon('copy'), `${duplicates.length} payment${duplicates.length === 1 ? '' : 's'} saved twice`, 'Already left out of every figure', '<button type="button" class="btn-tiny primary" id="remove-duplicates-btn">Remove</button>') : '',
    alertsWaiting > 0 ? todo(icon('inbox'), `${alertsWaiting} bank alert${alertsWaiting === 1 ? '' : 's'} to check`, 'Bank messages waiting to be added as payments', '<button type="button" class="btn-tiny primary" id="go-inbox-btn">Check</button>') : '',
    ...dueCards.map(({ account, bill }) =>
      todo(icon('bill'), `${escapeHtml(account.label)} - ${formatRupees(bill.amount)}`, bill.daysLeft < 0 ? `Overdue by ${Math.abs(bill.daysLeft)}d` : bill.daysLeft === 0 ? 'Due today' : `Due in ${bill.daysLeft}d`, `<button type="button" class="btn-tiny mark-paid" data-id="${account.id}">Mark paid</button>`, bill.daysLeft <= 0 ? 'bill-overdue' : 'bill-urgent')
    ),
    ...(short ? [] : [...lateRows, ...renewRows]),
    ...budgetAlerts.map((b) =>
      todo(categoryStyle(b.name).icon, `${escapeHtml(b.name)} budget`, b.state === 'over' ? `Over by ${formatRupees(-b.left)}` : `${formatRupees(b.left)} left`, `<button type="button" class="btn-tiny budget-open" data-id="${b.categoryId}">See</button>`, b.state === 'over' ? 'bill-overdue' : 'bill-urgent')
    ),
    uncategorized.length
      ? todo(
          icon('tag'),
          `${uncategorized.length} need${uncategorized.length === 1 ? 's' : ''} a category`,
          'Pick one for each so your totals are right',
          `${autoSortable > 0 ? `<button type="button" class="btn-tiny primary" id="auto-sort-btn">Sort ${autoSortable}</button>` : ''}<button type="button" class="btn-tiny" id="go-transactions-btn">Open</button>`
        )
      : '',
  ].filter(Boolean);
  rows.unshift(...urgent);

  const unusual = anomalies.slice(0, 5);
  if (short) {
    // Three at most; the rest one tap away, with any unusual spends.
    const more = rows.length - 3 + (unusual.length ? 1 : 0);
    el.innerHTML = rows.length || unusual.length
      ? `<section class="sum-needs"><h3 class="sum-needs__head">Needs you</h3>
          ${rows.slice(0, 3).join('')}
          ${more > 0
            ? `<details class="need-more"><summary>${rows.length > 3 ? `${rows.length - 3} more` : 'Unusual spends'}</summary>${rows.slice(3).join('')}${unusual
                .map((a) => todo(icon('eye'), `${escapeHtml(a.transaction.rawDescription.slice(0, 36))} · ${formatRupees(a.transaction.amount)}`, a.reason === 'new-merchant' ? 'First time here' : `Usually ${formatRupees(a.averageAmount)}`, `<button type="button" class="btn-tiny anomaly-open" data-desc="${escapeAttr(a.transaction.rawDescription.slice(0, 24))}">Open</button><button type="button" class="icon-btn anomaly-dismiss" data-id="${a.transaction.id}" aria-label="Dismiss">${icon('close')}</button>`))
                .join('')}</details>`
            : ''}
        </section>`
      : `<p class="sum-calm">${icon('check')}<span>Nothing needs you today.</span></p>`;
    el.querySelector('#need-bank-why')?.addEventListener('click', () => {
      const fold = container.querySelector('#sum-more');
      if (fold) fold.open = true;
      container.querySelector('.bank-card')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  } else if (!rows.length && !unusual.length) {
    el.innerHTML = '';
    return;
  } else el.innerHTML = `
    <div class="todo-list">
      ${rows.join('')}
      ${unusual
        .map((a) =>
          todo(
            icon('eye'),
            `${escapeHtml(displayName(a.transaction.rawDescription))} · ${formatRupees(a.transaction.amount)}`,
            a.reason === 'new-merchant' ? `First time at this shop, on ${formatDateNice(a.transaction.date)}. Was it you?` : `More than usual: this shop is normally about ${formatRupees(a.averageAmount)}. Was it you?`,
            `<button type="button" class="btn-tiny anomaly-open" data-desc="${escapeAttr(a.transaction.rawDescription.slice(0, 24))}">See it</button><button type="button" class="icon-btn anomaly-dismiss" data-id="${a.transaction.id}" aria-label="It was me, stop asking about this one" title="It was me">${icon('close')}</button>`
          )
        )
        .join('')}
    </div>
  `;

  // Saying which card a bill payment paid: it's money moved, and yours to decide.
  el.querySelectorAll('.assign-card').forEach((select) => {
    select.addEventListener('change', async () => {
      if (!select.value) return;
      const txn = (await getAll('transactions')).find((t) => t.id === select.dataset.txn);
      if (!txn) return;
      await put('transactions', { ...txn, paysCardId: select.value, isTransfer: true, transferManual: true });
      showToast('Bill payment assigned');
      redraw(container, () => render(container));
    });
  });

  const dupBtn = el.querySelector('#remove-duplicates-btn');
  if (dupBtn) {
    dupBtn.addEventListener('click', async () => {
      const total = duplicates.reduce((s, t) => s + t.amount, 0);
      const sure = await askConfirm({
        title: `Remove ${duplicates.length} duplicate cop${duplicates.length === 1 ? 'y' : 'ies'}?`,
        message: `${formatCurrency(total)} in copies. The first copy of each payment stays, with its category.`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!sure) return;
      dupBtn.disabled = true;
      for (const t of duplicates) await remove('transactions', t.id);
      showToast(`Removed ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'}`);
      redraw(container, () => render(container));
    });
  }

  el.querySelectorAll('.renewal-done').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const item = recurring.find((r) => r.id === btn.dataset.id);
      if (!item) return;
      // A policy records the payment and moves on from the date it was due; any other renewal just moves on.
      const moved = isPolicy(item) ? markPaid(item, isoLocal(new Date())) : null;
      const next = moved ? moved.renewsOn || moved.policy.dueOn : renewalAfter(item, isoLocal(new Date()));
      await put('recurring', moved || { ...item, renewsOn: next, dayOfMonth: Number(next.slice(8, 10)) });
      showToast(`Next renewal ${formatDateNice(next)}`);
      btn.closest('.need-row, .todo-row')?.remove();
    })
  );
  el.querySelectorAll('.person-remind').forEach((btn) => btn.addEventListener('click', () => shareReminder(btn.dataset.text)));
  const backupBtn = el.querySelector('#go-backup-btn');
  if (backupBtn) {
    backupBtn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'settings' } }));
    });
  }

  const driveBtn = el.querySelector('#go-drive-btn');
  if (driveBtn) {
    driveBtn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'settings', drive: 'backup' } }));
    });
  }

  const inboxBtn = el.querySelector('#go-inbox-btn');
  if (inboxBtn) {
    inboxBtn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'inbox' } }));
    });
  }

  const goBtn = el.querySelector('#go-transactions-btn');
  if (goBtn) {
    goBtn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', filter: 'uncategorized' } }));
    });
  }

  const autoBtn = el.querySelector('#auto-sort-btn');
  if (autoBtn) {
    autoBtn.addEventListener('click', async () => {
      autoBtn.disabled = true;
      autoBtn.textContent = 'Sorting…';
      const n = await applyLearnedCategories();
      showToast(`Sorted ${n} transaction${n === 1 ? '' : 's'}`);
      redraw(container, () => render(container));
    });
  }

  const fixIncome = el.querySelector('#fix-income-btn');
  if (fixIncome) {
    fixIncome.addEventListener('click', async () => {
      fixIncome.disabled = true;
      const { cleared, sorted } = await fixIncomeSpends();
      showToast(`Fixed ${cleared}: ${sorted} sorted again, ${cleared - sorted} need a category`);
      redraw(container, () => render(container));
    });
  }

  el.querySelectorAll('.budget-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', categoryId: btn.dataset.id, range: 'this-month' } }));
    });
  });

  el.querySelectorAll('.mark-paid').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const account = accounts.find((a) => a.id === btn.dataset.id);
      account.statementDuePaid = true;
      await put('accounts', account);
      redraw(container, () => render(container));
    });
  });

  el.querySelectorAll('.anomaly-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', search: btn.dataset.desc } }));
    });
  });

  el.querySelectorAll('.anomaly-dismiss').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const list = await getSetting('dismissedAnomalies', []);
      await setSetting('dismissedAnomalies', [...new Set([...list, btn.dataset.id])]);
      redraw(container, () => render(container));
    });
  });
}

// CHANGED: which fixed commitments are still upcoming. This used to be every
// one of them with its next due date, so rent paid this morning and an EMI paid
// on the 30th stayed on the list - and a skipped one too - until the date had
// passed. The commitments list below already works out, for each, whether this
// month's payment is paid, skipped, part paid or still to come; this reads that
// same answer, so the two never disagree:
//   - paid or skipped this period: gone;
//   - part paid: what is left, not the whole;
//   - still to come, or late: shown, late ones say so.
// A commitment that is not monthly (a yearly premium) or that the list does not
// follow (paid in cash) has no "this month" to be done, so it keeps showing with
// its next date: better listed once too often than hidden while still owed.
// Exported so it can be tested.
export function upcomingCommitments(fixed, tracker, today) {
  const byId = new Map((tracker || []).map((t) => [t.id, t]));
  return fixed
    .flatMap((r) => {
      const t = byId.get(r.id);
      if (!t || frequencyOf(r) !== 'monthly') {
        const due = nextDueDate(r.dayOfMonth);
        return !r.endDate || due <= r.endDate ? [{ ...r, isFixedItem: true, due }] : [];
      }
      if (!['due', 'late', 'part', 'untracked'].includes(t.status)) return [];
      const due = t.due || nextDueDate(r.dayOfMonth);
      return [{ ...r, isFixedItem: true, due, late: due < today && t.status !== 'untracked', amount: t.status === 'part' && t.left > 0 ? t.left : r.amount }];
    })
    .sort((a, b) => (a.due < b.due ? -1 : 1));
}

async function renderUpcoming(container, knownFigures = null) {
  const el = container.querySelector('#upcoming-section');
  if (!el) return;

  const [found, categories, recurring, accounts, figures] = await Promise.all([detectRecurring(), getAll('categories'), getAll('recurring'), getAll('accounts'), knownFigures || computeFreeToSpend()]);
  const today = isoLocal(new Date());
  // Your fixed commitments first, then what the app has spotted that isn't
  // one of them yet. Spotted items can be made fixed from here.
  const fixed = recurring.filter((r) => isLiveCommitment(r, today) && hasDueDate(frequencyOf(r)) && !r.spread);
  const detected = found.filter((d) => !coveredByFixed(d, recurring.filter(isFixed)));
  if (detected.length === 0 && fixed.length === 0) {
    el.innerHTML = '';
    return;
  }

  const rows = [
    ...upcomingCommitments(fixed, figures.tracker, today),
    ...detected.filter((r) => !r.spread).map((r) => ({ ...r, due: nextDueDate(r.dayOfMonth) })),
  ].sort((a, b) => (a.due < b.due ? -1 : 1));
  // Everything this month is done: nothing to list, and no empty fold.
  if (rows.length === 0) {
    el.innerHTML = '';
    return;
  }

  const accountName = (id) => accounts.find((a) => a.id === id)?.label;

  el.innerHTML = `
    <details class="section-fold">
      <summary>Upcoming <span class="muted">${rows.length}</span></summary>
      <div class="totals-card">
        ${rows
          .map(
            (r) => `
          <div class="upcoming-row">
            <div class="totals-row">
              <span>${escapeHtml(r.label)}<br><span class="muted-note">${formatDateNice(r.due)}${r.late ? ' · late' : ''}${
                r.isFixedItem ? (r.emi ? ` · ${r.emi.current} of ${r.emi.total}` : '') : ` · spotted${accountName(r.accountId) ? ` on ${escapeHtml(accountName(r.accountId))}` : ''}`
              }</span></span>
              <span>${formatRupees(r.amount)}</span>
            </div>
            ${
              r.isFixedItem
                ? ''
                : `<div class="tracker-actions">
                    <button type="button" class="btn-tiny primary recurring-make-fixed" data-id="${r.id}">Add to commitments</button>
                    <button type="button" class="icon-btn recurring-dismiss" data-id="${r.id}">Not recurring</button>
                  </div>`
            }
          </div>`
          )
          .join('')}
      </div>
    </details>
  `;
  el.querySelectorAll('.recurring-make-fixed').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const d = detected.find((r) => r.id === btn.dataset.id);
      await put('recurring', commitmentFromSuggestion(d, `fixed-${newId()}`));
      showToast('Added to your fixed commitments on Plan');
      renderUpcoming(container, figures);
    });
  });

  el.querySelectorAll('.recurring-dismiss').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rec = detected.find((r) => r.id === btn.dataset.id);
      rec.active = false;
      await put('recurring', rec);
      renderUpcoming(container, figures);
    });
  });
}

// --- Range breakdown ---

function getRangeDates() {
  const now = new Date();
  if (currentRange === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [isoLocal(start), isoLocal(end)];
  }
  if (currentRange === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return [isoLocal(start), isoLocal(end)];
  }
  return null;
}



// Comparing a month that's only 13 days old against a full previous month
// reads as a huge drop that isn't real, so compare like with like: this
// month-to-date against the same slice of last month.
function comparisonPeriod(now = new Date()) {
  if (currentRange === 'this-month') {
    const dayOfMonth = now.getDate();
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(dayOfMonth, prevMonthEnd));
    return { from: isoLocal(prevStart), to: isoLocal(prevEnd), label: 'than the same days last month' };
  }
  if (currentRange === 'last-month') {
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
    return { from: isoLocal(prevStart), to: isoLocal(prevEnd), label: 'than the month before' };
  }
  return null;
}

async function renderContent(container) {
  const content = container.querySelector('#summary-content');
  // A business's month is its own card; Home keeps the spending breakdown.
  if (!content) return;
  let from;
  let to;

  if (currentRange === 'custom') {
    from = container.querySelector('#range-from').value;
    to = container.querySelector('#range-to').value;
    if (!from || !to) {
      content.innerHTML = '<p class="empty">Pick both dates.</p>';
      return;
    }
  } else {
    [from, to] = getRangeDates();
  }

  const [transactions, categories, accounts] = await Promise.all([getAll('transactions'), getAll('categories'), getAll('accounts')]);
  const cycleAware = await cycleAwareEnabled();

  // For "this month" and "last month" the unit is a spending month, so card
  // purchases sit in the month they'll actually be billed in. A custom range
  // stays literal - if you asked for two dates, you meant those two dates.
  const monthKey = currentRange === 'this-month' ? currentMonthKey() : currentRange === 'last-month' ? previousMonthKey(currentMonthKey()) : null;
  const byAccountId = accountMap(accounts);
  const inRange = (
    monthKey
      ? transactions.filter((t) => spendingMonthOf(t, byAccountId.get(t.accountId), cycleAware) === monthKey)
      : transactions.filter((t) => t.date >= from && t.date <= to)
  ).filter((t) => !t.isTransfer && !isCardBill(t, byAccountId.get(t.accountId)) && accountInSpace(space)(byAccountId.get(t.accountId) || {}));

  // In, Out and Net are what reached or left the bank (cashSide): the card
  // bill counts when it is paid, a purchase on the card does not count again.
  // The categories below are the purchases themselves, which is where the
  // money went.
  let cashIn = 0;
  let cashOut = 0;
  const moves = spendMoves(transactions, accounts);
  for (const t of monthKey
    ? transactions.filter((t) => spendingMonthOf(t, byAccountId.get(t.accountId), false) === monthKey)
    : transactions.filter((t) => t.date >= from && t.date <= to)) {
    const account = byAccountId.get(t.accountId);
    if (!accountInSpace(space)(account || {})) continue;
    const side = cashSide(t, account, moves);
    if (side === 'in') cashIn += t.amount;
    else if (side === 'out') cashOut += t.amount;
  }

  let totalOut = 0;
  const byCategory = new Map();
  const byAccount = new Map();

  for (const t of inRange) {
    if (t.direction === 'debit') totalOut += t.amount;

    // Split-aware: one transaction can land in several categories.
    for (const slice of categorySlices(t)) {
      addToBucket(byCategory, slice.categoryId || 'uncategorized', t.direction, slice.amount);
    }
    addToBucket(byAccount, t.accountId, t.direction, t.amount);
  }

  let comparisonHtml = '';
  const comparison = comparisonPeriod();
  if (comparison) {
    const prevOut = transactions
      .filter((t) => {
        if (t.isTransfer || t.direction !== 'debit' || isCardBill(t, byAccountId.get(t.accountId))) return false;
        // Compare against the same slice of the previous spending month, so a
        // half-finished month isn't measured against a complete one.
        if (monthKey) {
          const m = spendingMonthOf(t, byAccountId.get(t.accountId), cycleAware);
          return m === previousMonthKey(monthKey) && t.date <= comparison.to;
        }
        return t.date >= comparison.from && t.date <= comparison.to;
      })
      .reduce((s, t) => s + t.amount, 0);
    if (prevOut > 0) {
      const pctChange = Math.round(((totalOut - prevOut) / prevOut) * 100);
      const arrow = pctChange > 0 ? icon('up') : pctChange < 0 ? icon('arrow-down') : icon('forward');
      // CHANGED (5.18): the difference in rupees, not a percentage.
      comparisonHtml = `<p class="muted-note compare-note">${arrow} ${formatRupees(Math.abs(totalOut - prevOut))} ${totalOut >= prevOut ? 'more' : 'less'} ${comparison.label}</p>`;
    }
  }

  const catName = (id) => (id === 'uncategorized' ? 'Uncategorized' : categories.find((c) => c.id === id)?.name || 'Uncategorized');

  if (shortMode()) {
    content.innerHTML = `
      <details class="section-fold">
        <summary>Where it went</summary>
        <ul class="breakdown-list">${renderCategoryBreakdown(byCategory, catName, totalOut)}</ul>
      </details>
      <details class="section-fold">
        <summary>Which account paid</summary>
        <ul class="breakdown-list">${renderAccountBreakdown(byAccount, accounts, transactions)}</ul>
      </details>
      <button type="button" id="recap-link" class="btn-secondary btn-block">Month in review</button>`;
    content.querySelector('#recap-link').addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'recap' } }));
    });
    return;
  }
  content.innerHTML = `
    <div class="totals-card in-out">
      <div><span class="hero-label">In</span><p class="in">+${formatRupees(cashIn)}</p></div>
      <div><span class="hero-label">Out</span><p class="out">−${formatRupees(cashOut)}</p></div>
      <div><span class="hero-label">Net</span><p>${formatRupees(cashIn - cashOut)}</p></div>
    </div>
    ${comparisonHtml}
    <details class="section-fold">
      <summary>Where it went</summary>
      <ul class="breakdown-list">${renderCategoryBreakdown(byCategory, catName, totalOut)}</ul>
    </details>
    <details class="section-fold">
      <summary>Which account paid</summary>
      <ul class="breakdown-list">${renderAccountBreakdown(byAccount, accounts, transactions)}</ul>
    </details>
    <button type="button" id="recap-link" class="btn-secondary btn-block">Month in review</button>
  `;

  content.querySelector('#recap-link').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'recap' } }));
  });

}

function addToBucket(map, key, direction, amount) {
  if (!map.has(key)) map.set(key, { in: 0, out: 0 });
  const bucket = map.get(key);
  if (direction === 'credit') bucket.in += amount;
  else bucket.out += amount;
}

function renderCategoryBreakdown(map, nameFn, totalOut) {
  const rows = [...map.entries()].sort((a, b) => b[1].out - b[1].in - (a[1].out - a[1].in));
  if (rows.length === 0) return '<li class="empty">No payments.</li>';

  return rows
    .map(([id, v]) => {
      const name = nameFn(id);
      const { icon, color } = categoryStyle(name);
      const share = totalOut > 0 ? Math.min(100, Math.round((v.out / totalOut) * 100)) : 0;
      return `
      <li class="breakdown-row" style="--chip-color:${color}">
        <span class="breakdown-label">
          <span class="cat-chip" style="--chip-color:${color}">${icon}</span>
          <span>
            ${escapeHtml(name)}
            ${v.out ? `<span class="breakdown-bar" style="width:${Math.max(6, share)}%"></span>` : ''}
          </span>
        </span>
        <span class="amounts">
          ${v.out ? `<span class="out">-${formatRupees(v.out)}</span>` : ''}
          ${v.in ? `<span class="in">+${formatRupees(v.in)}</span>` : ''}
        </span>
      </li>`;
    })
    .join('');
}

// Unlike the category breakdown, this lists accounts with no activity too.
// An account dropping off the list looks like a bug; "not used since 25 Aug"
// is the actual answer to "why isn't my card here?".
function renderAccountBreakdown(byAccount, accounts, transactions) {
  const lastUsed = new Map();
  for (const t of transactions) {
    const prev = lastUsed.get(t.accountId);
    if (!prev || t.date > prev) lastUsed.set(t.accountId, t.date);
  }

  // Accounts that spent money first, biggest first; then the idle ones by how
  // recently they were used, with never-used accounts at the very bottom.
  const rows = accounts
    .map((a) => ({ account: a, bucket: byAccount.get(a.id) || { in: 0, out: 0 }, last: lastUsed.get(a.id) }))
    .sort((x, y) => {
      const xu = x.bucket.out || x.bucket.in;
      const yu = y.bucket.out || y.bucket.in;
      if (xu && yu) return y.bucket.out - y.bucket.in - (x.bucket.out - x.bucket.in);
      if (xu !== yu) return xu ? -1 : 1;
      return (y.last || '').localeCompare(x.last || '');
    });

  return rows
    .map(({ account, bucket, last }) => {
      const used = bucket.out || bucket.in;
      const note = last ? `last used ${formatDateNice(last)}` : 'never used';
      const mark = icon(account.type === 'card' ? 'card' : account.type === 'cash' ? 'cash' : 'accounts');
      return `
      <li class="breakdown-row${used ? '' : ' breakdown-idle'}">
        <span class="breakdown-label">
          <span class="cat-chip" style="--chip-color:var(--violet)">${mark}</span>
          <span>${escapeHtml(account.label)}${used ? '' : `<br><span class="muted-note">${note}</span>`}</span>
        </span>
        <span class="amounts">
          ${bucket.out ? `<span class="out">-${formatRupees(bucket.out)}</span>` : ''}
          ${bucket.in ? `<span class="in">+${formatRupees(bucket.in)}</span>` : ''}
          ${used ? '' : '<span class="muted">-</span>'}
        </span>
      </li>`;
    })
    .join('');
}
