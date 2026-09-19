import { getAll, put, remove, getSetting, setSetting, newId } from '../db.js';
import { icon } from '../icons.js';
import { isFixed, isLiveCommitment, coveredByFixed, commitmentFromSuggestion } from '../commitments.js';
import { isoLocal, hasDueDate, frequencyOf } from '../frequency.js';
import { formatCurrency, formatDateNice, formatRupees } from '../format.js';
import { cardBillDue } from '../account-metrics.js';
import { computeFreeToSpend } from '../free-to-spend.js';
import { detectRecurring, nextDueDate } from '../recurring.js';
import { detectAnomalies } from '../anomalies.js';
import { categoryStyle } from '../category-style.js';
import { categorySlices, needsCategory } from '../splits.js';
import { getBudgets, budgetStatusForMonth, cycleAwareEnabled } from '../budgets.js';
import { spendingMonthOf, accountMap, currentMonthKey, previousMonthKey } from '../spending-month.js';
import { APP_VERSION, versionStatus, checkForUpdate } from '../version.js';
import { getSyncConfig, getSyncPassphrase } from '../sync.js';
import { dataSafety } from './settings.js';
import { pendingCount } from '../alert-inbox.js';
import { applyLearnedCategories } from '../merchant-rules.js';
import { showToast } from '../toast.js';
import { askConfirm } from '../dialog.js';
import { redraw } from '../redraw.js';
import { installCard, wireInstallCard } from '../install.js';
import { backupStatus } from '../drive.js';
import { incomeWords } from '../business.js';

let currentRange = 'this-month';

export async function render(container) {
  container.innerHTML = `
    <div id="dashboard"></div>
    <div class="segmented">
      <button type="button" class="seg-btn ${currentRange === 'this-month' ? 'active' : ''}" data-range="this-month">This month</button>
      <button type="button" class="seg-btn ${currentRange === 'last-month' ? 'active' : ''}" data-range="last-month">Last month</button>
      <button type="button" class="seg-btn ${currentRange === 'custom' ? 'active' : ''}" data-range="custom">Custom</button>
    </div>
    <div id="custom-range" class="custom-range" ${currentRange === 'custom' ? '' : 'hidden'}>
      <label>From <input type="date" id="range-from"></label>
      <label>To <input type="date" id="range-to"></label>
      <button type="button" id="range-apply" class="btn-secondary">Apply</button>
    </div>
    <div id="summary-content">Loading…</div>
  `;

  container.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentRange = btn.dataset.range;
      redraw(container, () => render(container));
    });
  });

  if (currentRange === 'custom') {
    container.querySelector('#range-apply').addEventListener('click', () => redraw(container, () => renderContent(container)));
  }

  await Promise.all([renderDashboard(container), renderContent(container)]);
}

// --- Dashboard: net position, things needing attention, upcoming bills ---

async function renderDashboard(container) {
  const dashboardEl = container.querySelector('#dashboard');
  const [transactions, fts, install] = await Promise.all([getAll('transactions'), computeFreeToSpend(), installCard()]);

  dashboardEl.innerHTML = [install, renderSpendingLimit(fts), renderBusiness(fts), renderCommitmentTracker(fts), renderLoansSavings(fts), '<div id="attention-section"></div>', '<div id="upcoming-section"></div>'].join('');

  // The business card opens that account's History.
  const businessBtn = dashboardEl.querySelector('#business-open');
  if (businessBtn) {
    businessBtn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', accountId: businessBtn.dataset.account } }));
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
    await put('recurring', { ...item, [field]: [...cycles].sort().slice(-12) });
    showToast(message(item.label));
    redraw(container, () => renderDashboard(container));
  };
  wireInstallCard(dashboardEl, () => redraw(container, () => renderDashboard(container)));
  const on = (selector, handler) => dashboardEl.querySelectorAll(selector).forEach((btn) => btn.addEventListener('click', () => handler(btn)));
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
  await renderUpcoming(container);
  notifySpendingLevel(fts);
}

// What the card level means in words, used by the hero and the attention list.
export function spendingWarning(f) {
  const until = formatDateNice(f.cycleKey);
  if (f.level === 'over')
    return `You're ${formatCurrency(-f.free)} over this cycle's budget. Stop spending until ${until}, on cards and by UPI - anything more comes out of next month.`;
  if (f.level === 'critical') return `Critical: only ${formatCurrency(f.free)} left of this cycle's budget${f.crossesOn ? ` - at your pace it runs out on ${formatDateNice(f.crossesOn)}` : ''}.`;
  if (f.level === 'warning')
    return f.crossesOn
      ? `Careful: at ${formatCurrency(f.pace)} a day the budget runs out on ${formatDateNice(f.crossesOn)}, before the cycle ends on ${until}.`
      : `Careful: you've used ${Math.round(f.used * 100)}% of this cycle's budget.`;
  return null;
}

export function bankWarning(f) {
  if (f.bankAfterBills == null) return null;
  // A business owner has no payday to count on: the bank has to cover the
  // bills from what is in it.
  const payday = f.incomeKind === 'business' ? null : f.salary.dates[0] || f.salary.nextUnreceived;
  const next = payday ? `After your next ${incomeWords(f.incomeKind).noun}, the` : 'After the';
  if (f.bankBeforeCards < 0)
    return payday
      ? `Your bank is ${formatCurrency(-f.bankBeforeCards)} short of what it has to pay before your ${incomeWords(f.incomeKind).noun} on ${formatDateNice(payday)}.`
      : `Your bank is ${formatCurrency(-f.bankBeforeCards)} short of what it has to pay this month.`;
  if (f.bankAfterBills < 0) return `${next} card bills and next month's commitments, your bank would be ${formatCurrency(-f.bankAfterBills)} short.`;
  if (f.bankLevel === 'warning')
    return `${next} bills, only ${formatCurrency(f.bankAfterBills)} would be left in your bank - less than the ${formatCurrency(f.keep)} you save each month.`;
  return null;
}

// The business on its own: money in and out of its accounts this month, what
// came home from it, and where most of it went. Only for those with one.
function renderBusiness(f) {
  const b = f.business;
  if (!b) return '';
  const above = f.plan && f.plan.basis === 'lowest' && f.plan.thisMonth > f.plan.amount ? f.plan.thisMonth - f.plan.amount : 0;
  const lean = f.plan && f.plan.amount && f.plan.thisMonth < f.plan.amount && f.monthsCovered != null;
  return `
    <div class="totals-card business-card">
      <button type="button" class="business-head" id="business-open" data-account="${escapeHtml(b.accountIds[0] || '')}">
        <span class="hero-label">Business this month</span>${icon('forward')}
      </button>
      <div class="totals-row"><span>Money in</span><span class="in">${formatRupees(b.moneyIn)}</span></div>
      <div class="totals-row"><span>Money out</span><span class="out">${formatRupees(b.moneyOut)}</span></div>
      <div class="totals-row"><span>Taken home</span><span>${formatRupees(b.takenHome)}</span></div>
      ${
        b.top.length
          ? `<details class="fts-breakdown"><summary>Where it went</summary><div class="totals-card">${b.top
              .map((c) => `<div class="totals-row"><span>${escapeHtml(c.name)}</span><span class="out">${formatRupees(c.amount)}</span></div>`)
              .join('')}</div></details>`
          : ''
      }
      ${above ? `<p class="business-note in">${formatRupees(above)} more than your plan came home. Put it away?</p>` : ''}
      ${!above && lean ? `<p class="business-note">Your savings cover about ${f.monthsCovered} month${f.monthsCovered === 1 ? '' : 's'} of the house.</p>` : ''}
    </div>`;
}

const breakdownLine = (label, amount, sign, note = '') =>
  `<div class="totals-row"><span>${label}${note ? `<br><span class="muted-note">${note}</span>` : ''}</span><span class="${sign === '+' ? 'in' : 'out'}">${sign === '+' ? '+' : '−'}${formatRupees(Math.abs(amount))}</span></div>`;

// The headline: what's left to spend, then the bank. Numbers first; the sums
// behind them are one tap away.
function renderSpendingLimit(f) {
  if (!f.monthlyIncome || !f.salary.setUp) {
    const ask = f.incomeKind === 'business' ? 'what the house needs a month' : `your ${incomeWords(f.incomeKind).noun} and the day it arrives`;
    return `<div class="totals-card"><p class="muted-note">Add ${ask} on Plan to see what you can spend.</p></div>${renderBankCard(f)}`;
  }
  if (f.noCommitments) {
    return `<div class="hero level-warning">
        <p class="hero-label">Left to spend</p>
        <p class="hero-amount">-</p>
        <p class="hero-sub">Add your fixed commitments on Plan first - without them your whole income looks free.</p>
      </div>${renderBankCard(f)}`;
  }
  return renderCardsHero(f) + renderBankCard(f);
}

// One short line under the headline number.
function spendingStatus(f) {
  const until = formatDateNice(f.cycleKey);
  if (f.level === 'over') return `Over budget - stop spending until ${until}`;
  if (f.level === 'critical') return f.crossesOn ? `Critical - runs out ${formatDateNice(f.crossesOn)} at this pace` : 'Critical - almost all used';
  if (f.level === 'warning') return f.crossesOn ? `Careful - runs out ${formatDateNice(f.crossesOn)} at this pace` : `Careful - ${Math.round(f.used * 100)}% used`;
  return `About ${formatRupees(f.perDay)} a day until ${until}`;
}

// What the budget starts from, in the words of the kind of income.
function incomeLine(f) {
  if (f.incomeKind !== 'business') return incomeWords(f.incomeKind).label;
  if (f.plan.basis !== 'lowest') return 'What the house needs';
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(f.plan.lowestMonth.slice(5, 7)) - 1];
  return `Taken home, lowest month (${month})`;
}

function renderCardsHero(f) {
  const until = formatDateNice(f.cycleKey);
  const pct = f.limit > 0 ? Math.min(100, Math.round(f.used * 100)) : 100;
  const line = breakdownLine;
  const bankItems = f.budgetItems.filter((b) => b.paidBy === 'bank');
  const cardItems = f.budgetItems.filter((b) => b.paidBy === 'card');
  const group = (title, items) =>
    items.length
      ? `<div class="totals-row"><span class="muted-note">${title}</span></div>${items.map((b) => line(escapeHtml(b.label), b.amount, '-')).join('')}`
      : '';

  return `
    <div class="hero level-${f.level}">
      <div class="hero-top">
        <span class="hero-label">Left to spend</span>
        <span class="hero-label">${formatDateNice(f.cycleStart)} to ${until}</span>
      </div>
      <p class="hero-amount ${f.free < 0 ? 'negative' : ''}">${formatRupees(f.free)}</p>
      <div class="hero-meter"><div class="hero-meter-fill ${f.level === 'ok' ? '' : f.level === 'warning' ? 'warn' : 'over'}" style="width:${pct}%"></div></div>
      <div class="hero-figures">
        <span><span class="muted">Spent</span> ${formatRupees(f.spentThisCycle)}</span>
        <span><span class="muted">Budget</span> ${formatRupees(f.limit)}</span>
      </div>
      <p class="hero-status level-${f.level}">${escapeHtml(spendingStatus(f))}</p>
      <details class="fts-breakdown">
        <summary>How it's worked out</summary>
        <div class="totals-card">
          ${line(incomeLine(f), f.monthlyIncome, '+')}
          ${group('Commitments from the bank', bankItems)}
          ${group('Commitments on cards', cardItems)}
          ${f.keep ? line('Saved each month', f.keep, '-') : ''}
          <div class="totals-row net"><span>Budget</span><span>${formatRupees(f.limit)}</span></div>
          ${f.cards
            .filter((c) => c.owed !== 0)
            .map((c) => line(escapeHtml(c.account.label), c.owed, c.owed < 0 ? '+' : '-', `this cycle${c.refunds ? ` · after ${formatRupees(c.refunds)} refunds` : ''}`))
            .join('')}
          ${f.cardCommitmentCharges.map((c) => line(escapeHtml(c.label), c.amount, '+', 'commitment, already in the budget')).join('')}
          ${line('Bank spending', f.bankSpent, '-', `UPI and more, ${formatDateNice(f.bankMonthStart)} to ${formatDateNice(f.bankMonthEnd)}`)}
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
        ${f.notes.map((n) => `<p class="muted-note">${escapeHtml(n)}</p>`).join('')}
      </details>
    </div>
  `;
}

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
      ${perAccount}
      <details class="fts-breakdown">
        <summary>How it's worked out</summary>
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

  return `
    <div class="section-head">
      <h3>Commitments</h3>
      <span class="section-note">Bank: ${MONTH_NAMES[Number(f.bankMonthStart.slice(5, 7)) - 1]} · Cards: ${formatDateNice(f.cycleStart)} to ${formatDateNice(f.cycleKey)}</span>
    </div>
    <div class="totals-card commitment-list">
      ${open.map((t) => commitmentRow(t)).join('')}
      ${
        done.length
          ? `<details class="commitment-done" ${open.length ? '' : 'open'}>
              <summary>${doneLabel}</summary>
              ${done.map((t) => commitmentRow(t)).join('')}
            </details>`
          : ''
      }
    </div>`;
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
  const pill = commitmentPill(t);
  const shown = t.marked ? Math.max(t.used, t.amount) : t.used;
  const pct = t.amount > 0 ? Math.min(100, Math.round((shown / t.amount) * 100)) : 0;
  const barTone = pill.tone === 'over' ? 'over' : pill.tone === 'warn' ? 'warn' : '';
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
          ${t.kind === 'loan' ? '<span class="pill">Loan</span>' : ''}
          <span class="pill ${pill.tone}">${pill.text}</span>
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
      icon: './icons/icon-192.png',
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

  const [accounts, categories, budgets, alertsWaiting, syncConfig, syncPass, lastBackupAt] = await Promise.all([
    getAll('accounts'),
    getAll('categories'),
    getBudgets(),
    pendingCount(),
    getSyncConfig(),
    getSyncPassphrase(),
    getSetting('lastBackupAt', null),
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

  const dueCards = accounts
    .map((a) => ({ account: a, bill: cardBillDue(a) }))
    .filter((x) => x.bill && !x.bill.paid && x.bill.daysLeft != null && x.bill.daysLeft <= 5);

  const budgetAlerts = (await budgetStatusForMonth(budgets, categories, transactions, currentMonthKey())).filter((b) => b.state !== 'ok');

  // Spending, the bank and each commitment already speak for themselves
  // above; this list is only things to do.
  const duplicates = fts ? fts.duplicates : [];
  const stale = fts ? fts.stale : [];
  const sameAccounts = fts ? fts.duplicateAccounts : [];
  const cardPayments = fts ? fts.unassignedCardPayments || [] : [];
  const cards = accounts.filter((a) => a.type === 'card');

  const todo = (icon, title, sub, action = '', tone = '') =>
    `<div class="todo-row"><span class="todo-icon" aria-hidden="true">${icon}</span><span class="todo-text"><span>${title}</span>${sub ? `<span class="muted-note ${tone}">${sub}</span>` : ''}</span>${action ? `<span class="attention-actions">${action}</span>` : ''}</div>`;

  const rows = [
    driveDays != null
      ? driveDays >= 7
        ? todo(icon('backup'), 'Back up to Google Drive', `Last one ${driveDays} days ago`, '<button type="button" class="btn-tiny primary" id="go-drive-btn">Back up</button>')
        : ''
      : safety.ok
        ? ''
        : todo(icon('backup'), safety.daysUnprotected == null ? 'No backup yet' : `No backup for ${safety.daysUnprotected} days`, '', '<button type="button" class="btn-tiny primary" id="go-backup-btn">Back up</button>'),
    ...cardPayments.map((p) =>
      todo(
        icon('card'),
        `${formatCurrency(p.amount)} card bill paid ${formatDateNice(p.date)}`,
        'Which card did it pay?',
        `<select class="assign-card" data-txn="${p.id}" aria-label="Card this payment paid"><option value="">Pick card</option>${cards.map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('')}</select>`
      )
    ),
    ...sameAccounts.map((group) => todo(icon('copy'), `${group.length} accounts for ••${escapeHtml(group[0].last4)}`, 'Delete one on Cards so it isn\'t counted twice', '', 'bill-overdue')),
    ...stale.map((s) => todo(icon('clock'), `${escapeHtml(s.account.label)}: nothing for ${s.days} days`, s.account.type === 'card' ? 'Paste its transactions or import a statement' : 'Share its alerts or import a statement', '', 'bill-urgent')),
    duplicates.length ? todo(icon('copy'), `${duplicates.length} payment${duplicates.length === 1 ? '' : 's'} saved twice`, 'Already left out of every figure', '<button type="button" class="btn-tiny primary" id="remove-duplicates-btn">Remove</button>') : '',
    alertsWaiting > 0 ? todo(icon('inbox'), `${alertsWaiting} bank alert${alertsWaiting === 1 ? '' : 's'} to check`, '', '<button type="button" class="btn-tiny primary" id="go-inbox-btn">Check</button>') : '',
    ...dueCards.map(({ account, bill }) =>
      todo(icon('bill'), `${escapeHtml(account.label)} - ${formatCurrency(bill.amount)}`, bill.daysLeft < 0 ? `Overdue by ${Math.abs(bill.daysLeft)}d` : bill.daysLeft === 0 ? 'Due today' : `Due in ${bill.daysLeft}d`, `<button type="button" class="btn-tiny mark-paid" data-id="${account.id}">Mark paid</button>`, bill.daysLeft <= 0 ? 'bill-overdue' : 'bill-urgent')
    ),
    ...budgetAlerts.map((b) =>
      todo(categoryStyle(b.name).icon, `${escapeHtml(b.name)} budget`, b.state === 'over' ? `Over by ${formatCurrency(-b.left)}` : `${formatCurrency(b.left)} left`, `<button type="button" class="btn-tiny budget-open" data-id="${b.categoryId}">See</button>`, b.state === 'over' ? 'bill-overdue' : 'bill-urgent')
    ),
    uncategorized.length
      ? todo(
          icon('tag'),
          `${uncategorized.length} need${uncategorized.length === 1 ? 's' : ''} a category`,
          '',
          `${autoSortable > 0 ? `<button type="button" class="btn-tiny primary" id="auto-sort-btn">Sort ${autoSortable}</button>` : ''}<button type="button" class="btn-tiny" id="go-transactions-btn">Open</button>`
        )
      : '',
  ].filter(Boolean);

  const unusual = anomalies.slice(0, 5);
  if (!rows.length && !unusual.length) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <h3>To do</h3>
    <div class="totals-card todo-list">
      ${rows.join('')}
      ${
        unusual.length
          ? `<details class="todo-more">
              <summary>${unusual.length} unusual spend${unusual.length === 1 ? '' : 's'}</summary>
              ${unusual
                .map(
                  (a) => `<div class="todo-row">
                    <span class="todo-text"><span>${escapeHtml(a.transaction.rawDescription.slice(0, 36))} · ${formatCurrency(a.transaction.amount)}</span><span class="muted-note">${a.reason === 'new-merchant' ? 'First time here' : `Usually ${formatCurrency(a.averageAmount)}`}</span></span>
                    <span class="attention-actions">
                      <button type="button" class="btn-tiny anomaly-open" data-desc="${escapeAttr(a.transaction.rawDescription.slice(0, 24))}">Open</button>
                      <button type="button" class="icon-btn anomaly-dismiss" data-id="${a.transaction.id}" aria-label="Dismiss">${icon('close')}</button>
                    </span>
                  </div>`
                )
                .join('')}
            </details>`
          : ''
      }
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

async function renderUpcoming(container) {
  const el = container.querySelector('#upcoming-section');
  if (!el) return;

  const [found, categories, recurring, accounts] = await Promise.all([detectRecurring(), getAll('categories'), getAll('recurring'), getAll('accounts')]);
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
    ...fixed.map((r) => ({ ...r, isFixedItem: true, due: nextDueDate(r.dayOfMonth) })).filter((r) => !r.endDate || r.due <= r.endDate),
    ...detected.filter((r) => !r.spread).map((r) => ({ ...r, due: nextDueDate(r.dayOfMonth) })),
  ].sort((a, b) => (a.due < b.due ? -1 : 1));

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
              <span>${escapeHtml(r.label)}<br><span class="muted-note">${formatDateNice(r.due)}${
                r.isFixedItem ? (r.emi ? ` · ${r.emi.current} of ${r.emi.total}` : '') : ` · spotted${accountName(r.accountId) ? ` on ${escapeHtml(accountName(r.accountId))}` : ''}`
              }</span></span>
              <span>${formatCurrency(r.amount)}</span>
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
      renderUpcoming(container);
    });
  });

  el.querySelectorAll('.recurring-dismiss').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rec = detected.find((r) => r.id === btn.dataset.id);
      rec.active = false;
      await put('recurring', rec);
      renderUpcoming(container);
    });
  });
}

// --- Range breakdown ---

function getRangeDates() {
  const now = new Date();
  if (currentRange === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [toISODate(start), toISODate(end)];
  }
  if (currentRange === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return [toISODate(start), toISODate(end)];
  }
  return null;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    return { from: toISODate(prevStart), to: toISODate(prevEnd), label: 'vs the same days last month' };
  }
  if (currentRange === 'last-month') {
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
    return { from: toISODate(prevStart), to: toISODate(prevEnd), label: 'vs the month before' };
  }
  return null;
}

async function renderContent(container) {
  const content = container.querySelector('#summary-content');
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
  ).filter((t) => !t.isTransfer && !byAccountId.get(t.accountId)?.business);

  let totalIn = 0;
  let totalOut = 0;
  const byCategory = new Map();
  const byAccount = new Map();

  for (const t of inRange) {
    if (t.direction === 'credit') totalIn += t.amount;
    else totalOut += t.amount;

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
        if (t.isTransfer || t.direction !== 'debit') return false;
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
      comparisonHtml = `<p class="muted-note compare-note">${arrow} ${Math.abs(pctChange)}% ${comparison.label}</p>`;
    }
  }

  const catName = (id) => (id === 'uncategorized' ? 'Uncategorized' : categories.find((c) => c.id === id)?.name || 'Uncategorized');

  content.innerHTML = `
    <div class="totals-card in-out">
      <div><span class="hero-label">In</span><p class="in">+${formatRupees(totalIn)}</p></div>
      <div><span class="hero-label">Out</span><p class="out">−${formatRupees(totalOut)}</p></div>
      <div><span class="hero-label">Net</span><p>${formatRupees(totalIn - totalOut)}</p></div>
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
    <div class="version-line" id="version-line">
      <span id="version-text">Version ${APP_VERSION}</span>
      <button type="button" class="icon-btn" id="version-check">Check for update</button>
    </div>
  `;

  content.querySelector('#recap-link').addEventListener('click', () => {
    container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'recap' } }));
  });

  renderVersionLine(content);
}

// Answers two questions at a glance: am I running the current code, and is my
// data current. Both have caused confusion, and both are cheap to state.
async function renderVersionLine(content) {
  const textEl = content.querySelector('#version-text');
  const btn = content.querySelector('#version-check');
  if (!textEl || !btn) return;

  const paint = async (status) => {
    const bits = [`Version ${status.running}`];
    // With no cached copy to compare against there is nothing to be stale
    // against either, so claim nothing rather than a reassuring "up to date".
    if (status.stale) bits.push('a new version is ready - reopen the app');
    else if (status.cached != null) bits.push('up to date');

    const { configured, lastSync } = await getSyncConfig();
    if (!configured) bits.push('sync off');
    else if (lastSync) bits.push(`synced ${relativeTime(lastSync)}`);
    else bits.push('not synced yet');

    textEl.textContent = bits.join(' · ');
    textEl.classList.toggle('stale', status.stale);
  };

  await paint(await versionStatus());

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const status = await checkForUpdate();
    await paint(status);
    btn.disabled = false;
    btn.textContent = status.stale ? 'Reload' : 'Check for update';
    if (status.stale) btn.onclick = () => window.location.reload();
  });
}

function relativeTime(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function addToBucket(map, key, direction, amount) {
  if (!map.has(key)) map.set(key, { in: 0, out: 0 });
  const bucket = map.get(key);
  if (direction === 'credit') bucket.in += amount;
  else bucket.out += amount;
}

function renderCategoryBreakdown(map, nameFn, totalOut) {
  const rows = [...map.entries()].sort((a, b) => b[1].out - b[1].in - (a[1].out - a[1].in));
  if (rows.length === 0) return '<li class="empty">No transactions.</li>';

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
          ${v.out ? `<span class="out">-${formatCurrency(v.out)}</span>` : ''}
          ${v.in ? `<span class="in">+${formatCurrency(v.in)}</span>` : ''}
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
          ${bucket.out ? `<span class="out">-${formatCurrency(bucket.out)}</span>` : ''}
          ${bucket.in ? `<span class="in">+${formatCurrency(bucket.in)}</span>` : ''}
          ${used ? '' : '<span class="muted">-</span>'}
        </span>
      </li>`;
    })
    .join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}
