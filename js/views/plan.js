import { getAll, put, remove, newId, getSetting, setSetting } from '../db.js';
import { icon } from '../icons.js';
import { formatCurrency, formatRupees, ordinal, formatDateNice, formatMonthYear } from '../format.js';
import { detectRecurring } from '../recurring.js';
import { categoryStyle } from '../category-style.js';
import { getBudgets, setBudget, budgetStatusForMonth } from '../budgets.js';
import { DEFAULT_KEEP_IN_BANK } from '../free-to-spend.js';
import { currentMonthKey } from '../spending-month.js';
import { FREQUENCIES, DEFAULT_FREQUENCY, monthlyAmountOf, frequencyOf, frequencyShort, hasDueDate, toMonthly, toYearly, isoLocal } from '../frequency.js';
import { isFixed, isFinished, isLiveCommitment, coveredByFixed, commitmentFromSuggestion, byYourOrder, isSetAside } from '../commitments.js';
import { appearance } from '../appearance.js';
import { isLoanAccount, loanCommitment } from '../loans.js';
import { redraw } from '../redraw.js';
import { COMMON_COSTS } from '../calendar.js';
import { getGoals, saveGoals, goalProgress, GOAL_IDEAS } from '../goals.js';
import { committedBar, goalRing, radialMeter } from '../charts.js';
import { bankBalance } from '../account-metrics.js';
import { incomeType, incomeWords, businessPlan, isBusinessCategory, businesses, activeSpace, commitmentInSpace, accountInSpace } from '../business.js';
import { escapeHtml, emptyState, sectionHead, hero } from '../ui.js';

let adding = false;
let editingId = null;
let addingBudget = false;
// A common cost tapped below the Add button, waiting in the form.
let draft = null;
let addingGoal = false;
let reordering = false;

// Fixed commitments live in the `recurring` store alongside auto-detected
// bills; `source` tells them apart so detection never clobbers what you
// entered by hand.

export async function render(container) {
  const [categories, recurring, transactions, income, budgets] = await Promise.all([
    getAll('categories'),
    getAll('recurring'),
    getAll('transactions'),
    getSetting('monthlyIncome', null),
    getBudgets(),
  ]);
  const salaryDay = await getSetting('salaryDay', null);
  const kind = await incomeType();
  // In a business's lane, Plan is that business's fixed costs; Home keeps the
  // income, the household commitments and the budgets.
  const space = await activeSpace();
  const inBusiness = space !== 'home';
  const sideBusiness = kind !== 'business' && (await businesses()).length > 0;
  const words = incomeWords(kind);

  const accounts = await getAll('accounts');
  const todayIso = isoLocal(new Date());
  // In the order you arranged them (new ones at the end).
  const inLane = commitmentInSpace(space);
  // The order is the person's choice (js/appearance.js). By day puts what is
  // coming next at the top; biggest first shows what dominates the month.
  // Either way it is only the order - nothing is added, hidden or recounted.
  const planOrder = appearance('plan');
  const ordering =
    planOrder === 'day'
      ? (a, b) => (a.dayOfMonth || 32) - (b.dayOfMonth || 32) || byYourOrder(a, b)
      : planOrder === 'size'
        ? (a, b) => monthlyAmountOf(b) - monthlyAmountOf(a) || byYourOrder(a, b)
        : byYourOrder;
  const fixed = recurring.filter((r) => inLane(r) && isLiveCommitment(r, todayIso)).sort(ordering);
  const finished = recurring.filter((r) => inLane(r) && isFixed(r) && r.active !== false && isFinished(r, todayIso));
  const laneAccounts = accounts.filter(accountInSpace(space));
  const laneCategories = categories.filter((c) => isBusinessCategory(c) === inBusiness);
  // Each commitment is stored the way you entered it ("₹120 a day"); what the
  // budget needs is its monthly equivalent.
  // A loan's EMI is set up on the loan account and counted here too, so the
  // plan matches the Summary without it being typed in twice.
  const loanItems = inBusiness ? [] : accounts.filter(isLoanAccount).map(loanCommitment).filter(Boolean);
  const fixedTotal = [...fixed, ...loanItems].reduce((s, r) => s + monthlyAmountOf(r), 0);

  const now = new Date();
  const monthKey = currentMonthKey(now);

  const suggestedIncome = suggestIncome(transactions, categories);
  // A business owner's month is planned on what came home (js/business.js);
  // what they typed is only the estimate it starts from.
  const plan = kind === 'business' ? businessPlan(transactions, accounts, todayIso, income) : null;
  // A business on the side adds the lowest of its last three months, the
  // same as Summary; nothing until there are three.
  const sidePlan = sideBusiness ? businessPlan(transactions, accounts, todayIso, null, { outside: false }) : null;
  const sideExtra = sidePlan && sidePlan.basis === 'lowest' ? sidePlan.amount : 0;
  const incomeValue = plan ? plan.amount : income != null ? income : suggestedIncome;
  const incomeLabel = !plan
    ? words.label
    : plan.basis === 'lowest'
      ? `Taken home, lowest month (${formatMonthYear(plan.lowestMonth).split(' ')[0]})`
      : 'What the house needs';
  const disposable = incomeValue != null ? incomeValue - fixedTotal : null;

  const keepInBank = await getSetting('keepInBank', DEFAULT_KEEP_IN_BANK);
  const cashTotal = fixed
    .filter((r) => r.accountId === 'cash' || accounts.find((a) => a.id === r.accountId)?.type === 'cash')
    .reduce((s, r) => s + monthlyAmountOf(r), 0);
  // Rent and EMIs are sacrosanct; food and fun can move.
  const flexTotal = fixed.filter((r) => r.flexible).reduce((s, r) => s + monthlyAmountOf(r), 0);
  const mustTotal = fixedTotal - cashTotal - flexTotal;

  // Hide suggestions already covered by something fixed. Category match only
  // counts when both actually have one - otherwise a single uncategorised fixed
  // expense would silently hide every suggestion.
  const detected = (await detectRecurring()).filter((d) => !coveredByFixed(d, [...fixed, ...finished]));
  const accountName = (id) => {
    const a = accounts.find((x) => x.id === id);
    return a ? a.label : null;
  };

  const budgetRows = await budgetStatusForMonth(budgets, categories, transactions, monthKey);
  // What each goal is counted in: the savings pots picked for it.
  const goals = inBusiness ? [] : await getGoals();
  const savingsAccounts = accounts.filter((a) => a.type === 'savings' || a.type === 'pf');
  const savedIn = (ids) => (ids || []).reduce((sum, id) => sum + (bankBalance(accounts.find((a) => a.id === id) || {}, transactions) || 0), 0);
  const budgetable = categories.filter((c) => !budgets[c.id] && !isBusinessCategory(c) && !/income|transfer/i.test(c.name));

  const keep = Math.max(0, Number(keepInBank) || 0);
  const budget = disposable != null ? disposable + sideExtra + cashTotal - keep : null;

  // `k-plan` scopes the rules for classes this screen shares with Summary,
  // so styling a commitment row here cannot reach across and restyle one
  // there.
  container.classList.add('k', 'k-plan');
  container.innerHTML = `
    ${
      inBusiness
        ? ''
        : // Plan is a stat-led screen: the budget each month is what it
          // answers, and the sums behind it sit under it, not above it.
          hero({
            label: '<span class="seg-dot seg-free"></span>Budget each month',
            amount: budget != null ? formatCurrency(budget) : '-',
            level: budget != null && budget < 0 ? 'over' : 'ok',
            negative: budget != null && budget < 0,
            chart: budget != null ? committedBar({ must: mustTotal, flex: flexTotal, free: budget, legend: false }) : '',
            // One sentence saying what the figure is, in the screen's own
            // terms. Nothing here is calculated: it reads the same values.
            status:
              budget == null
                ? 'Add what comes in each month to see your budget.'
                : `After ${formatCurrency(fixedTotal)} of commitments and ${formatCurrency(keep)} saved.`,
          }) +
          `<section class="plan-sums k-pane k-pane--quiet">
      <h3 class="plan-sums__head">Where it comes from</h3>
      <div class="totals-row"><span>${incomeLabel}</span><span class="in">${incomeValue != null ? formatCurrency(incomeValue) : '-'}</span></div>
      ${
        sidePlan
          ? `<div class="totals-row"><span>From the business${sideExtra ? `, lowest month (${formatMonthYear(sidePlan.lowestMonth).split(' ')[0]})` : '<br><span class="muted-note">counted after 3 months</span>'}</span><span class="in">${sideExtra ? formatCurrency(sideExtra) : '-'}</span></div>`
          : ''
      }
      <div class="totals-row"><span><span class="seg-dot seg-must"></span>Must go out</span><span class="out">−${formatCurrency(mustTotal)}</span></div>
      ${flexTotal ? `<div class="totals-row"><span><span class="seg-dot seg-flex"></span>Can flex</span><span class="out">−${formatCurrency(flexTotal)}</span></div>` : ''}
      <div class="totals-row"><span>Saved each month</span><span class="saved-row">−${formatCurrency(keep)}</span></div>
      ${cashTotal > 0 ? `<p class="muted-note">${formatCurrency(cashTotal)} paid in cash comes out of your ATM money.</p>` : ''}
      <details class="fts-breakdown plan-amounts" ${income == null || (kind !== 'business' && !salaryDay) ? 'open' : ''}>
        <summary>Change amounts</summary>
        <label class="field">
          <span>${kind === 'business' ? 'What the house needs a month' : words.label}</span>
          <input type="number" id="plan-income" inputmode="decimal" step="1" placeholder="${suggestedIncome != null ? (suggestedIncome / 100).toFixed(0) : '60000'}" value="${income != null ? (income / 100).toFixed(0) : ''}">
        </label>
        ${
          kind === 'business'
            ? ''
            : `<label class="field">
          <span>Day it arrives <span class="muted">(31 = last day)</span></span>
          <input type="number" id="plan-salary-day" inputmode="numeric" min="1" max="31" step="1" placeholder="31" value="${salaryDay || ''}">
        </label>`
        }
        <label class="field">
          <span>Save each month</span>
          <input type="number" id="plan-keep" inputmode="decimal" step="1" min="0" placeholder="10000" value="${(keep / 100).toFixed(0)}">
        </label>
      </details>
    </section>`
    }

    ${
      // How much of the month is spoken for, from the same figures the hero
      // above is made of. No second calculation.
      !inBusiness && incomeValue
        ? `<section class="plan-meter k-pane k-pane--quiet">${radialMeter({ committed: fixedTotal + keep, income: incomeValue + sideExtra })}</section>`
        : ''
    }
    ${sectionHead(
      inBusiness ? 'Fixed costs' : 'Commitments',
      fixed.length > 1 && planOrder === 'yours'
        ? `<button type="button" class="icon-btn" id="plan-reorder">${reordering ? 'Done' : 'Reorder'}</button>`
        : ''
    )}
    ${
      fixed.length
        ? `<div class="totals-card ${reordering ? 'reordering' : ''}">${fixed
            .map((f, i) => (editingId === f.id ? fixedForm(laneCategories, laneAccounts, f) : fixedRow(f, categories, accountName(f.accountId), i, fixed.length)))
            .join('')}${loanItems.map((l) => loanRow(l, accountName(l.accountId))).join('')}</div>`
        : loanItems.length
          ? `<div class="totals-card">${loanItems.map((l) => loanRow(l, accountName(l.accountId))).join('')}</div>`
          : // The "Add a commitment" button is right underneath, so this says
            // what and why and leaves the doing to it: one action, never two.
            emptyState({
              what: 'Nothing fixed yet.',
              why: inBusiness
                ? 'Shop rent, staff wages and electricity come out whatever the month brings.'
                : 'Without rent, EMIs and bills, your whole income looks free to spend.',
            })
    }
    ${
      adding
        ? fixedForm(laneCategories, laneAccounts, draft)
        : `<button type="button" id="plan-add-btn" class="btn-secondary btn-block">${inBusiness ? 'Add a fixed cost' : 'Add a commitment'}</button>
           <details class="k-disclose plan-common"><summary>Common costs</summary>
           <div class="common-costs">${COMMON_COSTS[inBusiness ? 'business' : 'home']
             .filter((c) => !fixed.some((f) => f.label.toLowerCase() === c.label.toLowerCase()))
             .map((c) => `<button type="button" class="plan-chip common-cost" data-label="${escapeHtml(c.label)}" data-frequency="${c.frequency}">+ ${escapeHtml(c.label)}</button>`)
             .join('')}</div></details>`
    }
    ${
      finished.length
        ? `<details class="fts-breakdown"><summary>Finished (${finished.length})</summary><div class="totals-card">${finished
            .map((f) => `<div class="attention-row"><span>${escapeHtml(f.label)}<br><span class="muted-note">Last payment ${formatDateNice(f.endDate)}</span></span><button type="button" class="icon-btn fixed-delete" data-id="${f.id}" aria-label="Remove">${icon('close')}</button></div>`)
            .join('')}</div></details>`
        : ''
    }

    ${
      inBusiness
        ? ''
        : `${sectionHead('Goals')}
    ${goals.length ? '<div class="totals-card goals-list">' : ''}
    ${goals
      .map((g) => {
        const p = goalProgress(g, savedIn(g.accountIds), todayIso);
        return `<div class="goal-card">
          ${goalRing({ saved: p.saved, target: g.target, monthly: p.monthly, by: formatMonthYear(`${g.by}-01`) })}
          <div class="goal-text">
            <span class="goal-name">${escapeHtml(g.name)}</span>
            <span class="muted-note">${formatRupees(p.saved)} of ${formatRupees(g.target)} · by ${formatMonthYear(`${g.by}-01`)}</span>
            <span class="muted-note">${p.done ? 'There already.' : `${formatRupees(p.monthly)} a month gets you there.`}</span>
          </div>
          <button type="button" class="icon-btn goal-delete" data-id="${g.id}" aria-label="Remove">${icon('close')}</button>
        </div>`;
      })
      .join('')}
    ${goals.length ? '</div>' : ''}
    ${
      addingGoal
        ? `<form class="totals-card" id="goal-form">
            <label class="field">
              <span>What for</span>
              <input type="text" class="gf-name" placeholder="Child's education" required>
            </label>
            <div class="common-costs">${GOAL_IDEAS.map((g) => `<button type="button" class="plan-chip goal-idea">${g}</button>`).join('')}</div>
            <label class="field">
              <span>How much</span>
              <input type="number" class="gf-target" inputmode="decimal" min="1" step="1" placeholder="1000000" required>
            </label>
            <label class="field">
              <span>By when</span>
              <input type="month" class="gf-by" value="${todayIso.slice(0, 7)}" required>
            </label>
            ${
              savingsAccounts.length
                ? `<div class="field"><span>Counted in</span>${savingsAccounts
                    .map((a) => `<label class="checkbox-row"><input type="checkbox" class="gf-account" value="${a.id}" checked><span>${escapeHtml(a.label)}</span></label>`)
                    .join('')}</div>`
                : '<p class="muted-note">Add your PPF, FD or gold on Accounts to count what is already saved.</p>'
            }
            <button type="submit" class="btn-primary">Save goal</button>
            <button type="button" class="btn-tiny btn-block goal-cancel">Cancel</button>
          </form>`
        : '<button type="button" id="goal-add-btn" class="btn-secondary btn-block">Add a goal</button>'
    }

    ${sectionHead('Category budgets')}
    ${budgetRows.length ? budgetRows.map((b) => budgetCard(b)).join('') : '<p class="empty">No budgets set.</p>'}
    ${
      addingBudget
        ? budgetForm(budgetable)
        : budgetable.length
          ? '<button type="button" id="budget-add-btn" class="btn-secondary btn-block">Set a budget</button>'
          : ''
    }

    ${
      detected.length
        ? `${sectionHead('Looks recurring')}
           <div class="totals-card">
             ${detected
               .map(
                 (d) => `<div class="attention-row">
                   <span>${escapeHtml(d.label)}<br><span class="muted-note">${formatCurrency(d.amount)} · ${d.spread ? 'a month, taken out bit by bit' : `around the ${ordinal(d.dayOfMonth)}`}${
                     accountName(d.accountId) ? ` · ${escapeHtml(accountName(d.accountId))}` : ''
                   }</span></span>
                   <span class="attention-actions">
                     <button type="button" class="btn-tiny primary promote-detected" data-id="${d.id}">Add</button>
                     <button type="button" class="btn-tiny dismiss-detected" data-id="${d.id}">Dismiss</button>
                   </span>
                 </div>`
               )
               .join('')}
           </div>`
        : ''
    }`
    }
  `;

  const incomeEl = container.querySelector('#plan-income');
  incomeEl?.addEventListener('change', async () => {
    const raw = parseFloat(incomeEl.value);
    await setSetting('monthlyIncome', Number.isFinite(raw) ? Math.round(raw * 100) : null);
    redraw(container, () => render(container));
  });

  const keepEl = container.querySelector('#plan-keep');
  keepEl?.addEventListener('change', async () => {
    const raw = parseFloat(keepEl.value);
    await setSetting('keepInBank', Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 100) : DEFAULT_KEEP_IN_BANK);
    redraw(container, () => render(container));
  });

  const salaryDayEl = container.querySelector('#plan-salary-day');
  if (salaryDayEl) {
    salaryDayEl.addEventListener('change', async () => {
      const day = parseInt(salaryDayEl.value, 10);
      await setSetting('salaryDay', Number.isInteger(day) && day >= 1 && day <= 31 ? day : null);
      redraw(container, () => render(container));
    });
  }

  container.querySelectorAll('.common-cost').forEach((chip) => {
    chip.addEventListener('click', () => {
      draft = { label: chip.dataset.label, frequency: chip.dataset.frequency };
      adding = true;
      editingId = null;
      redraw(container, () => render(container));
    });
  });

  const goalAddBtn = container.querySelector('#goal-add-btn');
  if (goalAddBtn) {
    goalAddBtn.addEventListener('click', () => {
      addingGoal = true;
      redraw(container, () => render(container));
    });
  }
  container.querySelectorAll('.goal-idea').forEach((chip) => {
    chip.addEventListener('click', () => {
      container.querySelector('.gf-name').value = chip.textContent;
    });
  });
  container.querySelector('.goal-cancel')?.addEventListener('click', () => {
    addingGoal = false;
    redraw(container, () => render(container));
  });
  container.querySelector('#goal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = container.querySelector('.gf-name').value.trim();
    const target = Math.round(parseFloat(container.querySelector('.gf-target').value) * 100);
    if (!name || !Number.isFinite(target) || target <= 0) return;
    await saveGoals([
      ...(await getGoals()),
      {
        id: `goal-${newId()}`,
        name,
        target,
        by: container.querySelector('.gf-by').value,
        accountIds: [...container.querySelectorAll('.gf-account:checked')].map((c) => c.value),
      },
    ]);
    addingGoal = false;
    redraw(container, () => render(container));
  });
  container.querySelectorAll('.goal-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await saveGoals((await getGoals()).filter((g) => g.id !== btn.dataset.id));
      redraw(container, () => render(container));
    });
  });

  const addBtn = container.querySelector('#plan-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      draft = null;
      adding = true;
      editingId = null;
      redraw(container, () => render(container));
    });
  }

  container.querySelectorAll('.fixed-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingId = btn.dataset.id;
      adding = false;
      redraw(container, () => render(container));
    });
  });

  const form = container.querySelector('#fixed-form');
  if (form) {
    // Show what the entered figure works out to per month as it's typed - the
    // whole point of asking for a frequency is that you see the real cost.
    const amountEl = form.querySelector('.ff-amount');
    const freqEl = form.querySelector('.ff-frequency');
    const previewEl = form.querySelector('#ff-preview');
    const dayField = form.querySelector('.ff-day-field');
    const kindEls = [...form.querySelectorAll('.ff-kind')];
    const setAside = () => form.querySelector('.ff-kind:checked')?.value === 'aside';

    const updatePreview = () => {
      const raw = parseFloat(amountEl.value);
      const freq = freqEl.value;
      // Money set aside has no day to be late on, so there is no day to ask
      // for. A thing that must be paid keeps its day.
      dayField.hidden = !hasDueDate(freq) || (freq === 'monthly' && setAside());
      if (!Number.isFinite(raw) || raw <= 0 || freq === 'monthly') {
        previewEl.hidden = true;
        return;
      }
      const minor = Math.round(raw * 100);
      const monthly = toMonthly(minor, freq);
      const yearly = toYearly(minor, freq);
      previewEl.hidden = false;
      previewEl.innerHTML = `That's <strong>${formatCurrency(monthly)} a month</strong> - ${formatCurrency(yearly)} a year.`;
    };
    amountEl.addEventListener('input', updatePreview);
    freqEl.addEventListener('change', updatePreview);
    for (const el of kindEls) el.addEventListener('change', updatePreview);
    updatePreview();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const existing = editingId ? recurring.find((r) => r.id === editingId) : null;
      const aside = setAside();
      const label = form.querySelector('.ff-label').value.trim();
      const amount = Math.round(parseFloat(amountEl.value) * 100);
      const day = parseInt(form.querySelector('.ff-day').value, 10);
      if (!label || !Number.isFinite(amount) || amount <= 0) return;
      const endMonth = form.querySelector('.ff-end').value; // YYYY-MM or ''
      const dayOfMonth = Number.isInteger(day) && day >= 1 && day <= 31 ? day : existing ? existing.dayOfMonth : 1;
      await put('recurring', {
        ...(existing || {}),
        id: existing ? existing.id : `fixed-${newId()}`,
        label,
        amount,
        frequency: freqEl.value,
        dayOfMonth,
        // One question on screen, the two fields the app has always used.
        // `spread` is what actually stops a thing being called late (it has
        // no due date), and `flexible` is what puts it in the "can flex"
        // half of the budget. Asking twice is what let a set-aside be
        // entered as a dated bill and then be reported overdue.
        spread: freqEl.value === 'monthly' && aside,
        flexible: aside,
        categoryId: form.querySelector('.ff-category').value || null,
        accountId: form.querySelector('.ff-account').value || null,
        matchText: form.querySelector('.ff-match').value.trim() || null,
        endDate: endMonth ? lastPaymentInMonth(endMonth, dayOfMonth) : null,
        active: true,
        source: 'fixed',
        // A business's fixed cost belongs to its lane.
        ...(existing ? {} : inBusiness ? { space } : {}),
        // A statement re-import leaves figures you changed by hand alone.
        amountEdited: existing ? existing.amountEdited || amount !== existing.amount : undefined,
        dayEdited: existing ? existing.dayEdited || dayOfMonth !== existing.dayOfMonth : undefined,
      });
      adding = false;
      editingId = null;
      draft = null;
      redraw(container, () => render(container));
    });
    form.querySelector('.ff-cancel').addEventListener('click', () => {
      adding = false;
      editingId = null;
      redraw(container, () => render(container));
    });
  }

  const budgetAddBtn = container.querySelector('#budget-add-btn');
  if (budgetAddBtn) {
    budgetAddBtn.addEventListener('click', () => {
      addingBudget = true;
      redraw(container, () => render(container));
    });
  }

  const budgetFormEl = container.querySelector('#budget-form');
  if (budgetFormEl) {
    budgetFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const categoryId = budgetFormEl.querySelector('.bf-category').value;
      const amount = Math.round(parseFloat(budgetFormEl.querySelector('.bf-amount').value) * 100);
      if (!categoryId || !Number.isFinite(amount) || amount <= 0) return;
      await setBudget(categoryId, amount);
      addingBudget = false;
      redraw(container, () => render(container));
    });
    budgetFormEl.querySelector('.bf-cancel').addEventListener('click', () => {
      addingBudget = false;
      redraw(container, () => render(container));
    });
  }

  container.querySelectorAll('.budget-remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await setBudget(btn.dataset.id, null);
      redraw(container, () => render(container));
    });
  });

  // Move a commitment up or down the list. Every commitment gets its place
  // number; only the ones whose number changed are saved.
  const reorderBtn = container.querySelector('#plan-reorder');
  if (reorderBtn) {
    reorderBtn.addEventListener('click', () => {
      reordering = !reordering;
      redraw(container, () => render(container));
    });
  }

  container.querySelectorAll('.fixed-move').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const order = fixed.map((f) => f.id);
      const from = order.indexOf(btn.dataset.id);
      const to = from + Number(btn.dataset.step);
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      for (const [index, id] of order.entries()) {
        const item = fixed.find((f) => f.id === id);
        if (item.sortOrder !== index) await put('recurring', { ...item, sortOrder: index });
      }
      redraw(container, () => render(container));
    });
  });

  container.querySelectorAll('.fixed-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await remove('recurring', btn.dataset.id);
      redraw(container, () => render(container));
    });
  });

  container.querySelectorAll('.go-loan').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'accounts' } }));
    });
  });

  // Dismissing keeps it out of the suggestions for good, without touching
  // the payments themselves.
  container.querySelectorAll('.dismiss-detected').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const d = detected.find((x) => x.id === btn.dataset.id);
      if (!d) return;
      await put('recurring', { ...d, active: false });
      redraw(container, () => render(container));
    });
  });

  container.querySelectorAll('.promote-detected').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const d = detected.find((x) => x.id === btn.dataset.id);
      await put('recurring', commitmentFromSuggestion(d, `fixed-${newId()}`));
      redraw(container, () => render(container));
    });
  });
}

function budgetCard(b) {
  const { icon: mark, color } = categoryStyle(b.name);
  const width = Math.min(100, Math.round(b.pct * 100));
  return `
    <div class="budget-card">
      <div class="k-row budget-row">
        <span class="k-icon" style="--k-tint:${color}">${mark}</span>
        <span class="k-row__body">
          <span class="k-row__title">${escapeHtml(b.name)}</span>
          <span class="k-row__meta">${
            b.state === 'over' ? `Over by ${formatCurrency(-b.left)}` : `${formatCurrency(b.left)} left this month`
          }</span>
        </span>
        <span class="k-row__value budget-nums">${formatCurrency(b.spent)}<span class="muted"> / ${formatCurrency(b.limit)}</span></span>
        <span class="plan-row__actions">
          <button type="button" class="icon-btn budget-remove" data-id="${b.categoryId}" aria-label="Remove the budget for ${escapeHtml(b.name)}">${icon('close')}</button>
        </span>
      </div>
      <div class="k-meter budget-meter"><div class="k-meter__fill budget-fill ${b.state === 'ok' ? '' : b.state}" style="width:${width}%"></div></div>
    </div>
  `;
}

function budgetForm(categories) {
  return `
    <form class="totals-card" id="budget-form">
      <label class="field">
        <span>Category</span>
        <select class="bf-category" required>
          ${categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>Monthly limit</span>
        <input type="number" class="bf-amount" inputmode="decimal" step="0.01" min="0.01" placeholder="8000" required>
      </label>
      <button type="submit" class="btn-primary">Set budget</button>
      <button type="button" class="btn-tiny bf-cancel btn-block" style="margin-top:var(--space-xs)">Cancel</button>
    </form>
  `;
}

// A loan's EMI, shown with the rest so the list adds up. It's changed on the
// loan account itself, not here.
function loanRow(item, paidFrom) {
  return `
    <div class="plan-row-wrap">
      <button type="button" class="k-row plan-row plan-row__main go-loan" aria-label="Edit ${escapeHtml(item.label)} on Accounts">
        <span class="k-icon" style="--k-tint:var(--k-violet)">${icon('accounts')}</span>
        <span class="k-row__body">
          <span class="k-row__title">${escapeHtml(item.label)}</span>
          <span class="k-row__meta">${ordinal(item.dayOfMonth)} · ${paidFrom ? escapeHtml(paidFrom) : 'bank'} · loan</span>
        </span>
        <span class="k-row__value plan-row__amount out">${formatCurrency(item.amount)}</span>
      </button>
    </div>`;
}

function fixedRow(f, categories, paidFrom, index, count) {
  const cat = categories.find((c) => c.id === f.categoryId);
  const { icon: mark, color } = categoryStyle(cat?.name || f.label);
  const freq = frequencyOf(f);
  const monthly = monthlyAmountOf(f);
  const isMonthly = freq === 'monthly';

  // For anything that isn't already monthly, show both figures: what you
  // actually pay, and what it costs you per month. The second number is the
  // one people never work out for themselves.
  const when = isMonthly
    ? f.spread
      ? 'bit by bit'
      : ordinal(f.dayOfMonth)
    : `${formatCurrency(f.amount)} ${frequencyShort(freq)}${hasDueDate(freq) ? ` · around the ${ordinal(f.dayOfMonth)}` : ''}`;
  const parts = [when];
  if (f.emi) parts.push(`EMI ${f.emi.current}/${f.emi.total}`);
  parts.push(f.accountId === 'cash' ? 'cash' : paidFrom ? escapeHtml(paidFrom) : 'bank');

  const inner = `
      <span class="k-icon" style="--k-tint:${color}">${mark}</span>
      <span class="k-row__body">
        <span class="k-row__title">${escapeHtml(f.label)}</span>
        <span class="k-row__meta">${parts.join(' · ')}</span>
      </span>
      <span class="k-row__value plan-row__amount out">${formatCurrency(monthly)}${isMonthly ? '' : '<span class="muted freq-per-month">/mo</span>'}</span>`;

  if (reordering) {
    return `
      <div class="k-row plan-row">
        ${inner}
        <span class="plan-row__actions">
          <button type="button" class="icon-btn fixed-move" data-id="${f.id}" data-step="-1" aria-label="Move ${escapeHtml(f.label)} up" ${index === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button type="button" class="icon-btn fixed-move" data-id="${f.id}" data-step="1" aria-label="Move ${escapeHtml(f.label)} down" ${index === count - 1 ? 'disabled' : ''}>${icon('arrow-down')}</button>
        </span>
      </div>`;
  }

  return `
    <div class="plan-row-wrap">
      <button type="button" class="k-row plan-row plan-row__main fixed-edit" data-id="${f.id}" aria-label="Edit ${escapeHtml(f.label)}">
        ${inner}
      </button>
      <button type="button" class="icon-btn plan-row__remove fixed-delete" data-id="${f.id}" aria-label="Remove ${escapeHtml(f.label)}">${icon('close')}</button>
    </div>
  `;
}

// `item` is the commitment being edited, or null when adding a new one.
function fixedForm(categories, accounts, item) {
  const v = item || {};
  const freqNow = item ? frequencyOf(item) : DEFAULT_FREQUENCY;
  const selected = (a, b) => (a === b ? 'selected' : '');
  return `
    <form class="totals-card" id="fixed-form">
      <label class="field">
        <span>What is it</span>
        <input type="text" class="ff-label" placeholder="e.g. House loan EMI, Sent to Papa, ATM cash" value="${escapeHtml(v.label || '')}" required>
      </label>
      <label class="field">
        <span>Amount each time</span>
        <input type="number" class="ff-amount" inputmode="decimal" step="0.01" min="0.01" placeholder="68000" value="${v.amount ? (v.amount / 100).toFixed(2).replace(/\.00$/, '') : ''}" required>
      </label>
      <label class="field">
        <span>How often</span>
        <select class="ff-frequency">
          ${Object.entries(FREQUENCIES)
            .map(([key, f]) => `<option value="${key}" ${selected(key, freqNow)}>${f.label}</option>`)
            .join('')}
        </select>
      </label>
      <p class="freq-preview" id="ff-preview" hidden></p>
      <fieldset class="type-field">
        <legend>What kind of money is this</legend>
        <label class="type-choice">
          <input type="radio" name="ff-kind" value="must" class="ff-kind" ${isSetAside(v) ? '' : 'checked'}>
          <span><strong>Must be paid</strong><span class="muted-note">Rent, an EMI, a bill. It has a day, and Kawach tells you when it is late.</span></span>
        </label>
        <label class="type-choice">
          <input type="radio" name="ff-kind" value="aside" class="ff-kind" ${isSetAside(v) ? 'checked' : ''}>
          <span><strong>Set aside</strong><span class="muted-note">Money kept back for groceries, fuel, Amazon Pay and the like. Spend all of it, some of it or none of it. It is never late.</span></span>
        </label>
      </fieldset>
      <label class="field ff-day-field">
        <span>Day of month it goes out</span>
        <input type="number" class="ff-day" min="1" max="31" placeholder="1" value="${v.dayOfMonth || ''}">
      </label>
      <label class="field">
        <span>Paid from</span>
        <select class="ff-account">
          <option value="">Any bank account</option>
          <option value="cash" ${selected('cash', v.accountId)}>Cash (from your ATM money)</option>
          ${accounts
            .filter((a) => a.type === 'bank')
            .map((a) => `<option value="${a.id}" ${selected(a.id, v.accountId)}>${escapeHtml(a.label)}</option>`)
            .join('')}
          ${accounts
            .filter((a) => a.type === 'card')
            .map((a) => `<option value="${a.id}" ${selected(a.id, v.accountId)}>${escapeHtml(a.label)}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field">
        <span>Last payment <span class="muted">(optional - for an EMI or loan that ends)</span></span>
        <input type="month" class="ff-end" value="${v.endDate ? v.endDate.slice(0, 7) : ''}">
      </label>
      <label class="field">
        <span>Its line on the bank or card statement contains <span class="muted">(optional, e.g. "Home Loan EMI", "DYSON")</span></span>
        <input type="text" class="ff-match" autocomplete="off" spellcheck="false" placeholder="Words from its line on your statement" value="${escapeHtml(v.matchText || '')}">
      </label>
      <p class="muted-note">Words in its payment, so it isn't counted twice. Leave empty to match by amount.</p>
      <label class="field">
        <span>Category <span class="muted">(so this spend isn't counted twice)</span></span>
        <select class="ff-category">
          <option value="">None</option>
          ${categories.map((c) => `<option value="${c.id}" ${selected(c.id, v.categoryId)}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </label>
      <button type="submit" class="btn-primary">${item ? 'Save' : 'Add'}</button>
      <button type="button" class="btn-tiny ff-cancel btn-block" style="margin-top:var(--space-xs)">Cancel</button>
    </form>
  `;
}

// "2027-04" and due on the 8th -> 2027-04-08, clamped to the month's end.
function lastPaymentInMonth(yearMonth, dayOfMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return isoLocal(new Date(y, m - 1, Math.min(dayOfMonth || 1, lastDay)));
}

// A rough read on typical income: the average of whatever landed in the
// Income category over the last few months. Only a starting point.
function suggestIncome(transactions, categories) {
  const incomeCat = categories.find((c) => c.name.toLowerCase() === 'income');
  if (!incomeCat) return null;
  const now = new Date();
  const cutoff = isoLocal(new Date(now.getFullYear(), now.getMonth() - 3, 1));
  const credits = transactions.filter((t) => t.categoryId === incomeCat.id && t.direction === 'credit' && !t.isTransfer && t.date >= cutoff);
  if (credits.length === 0) return null;
  const months = new Set(credits.map((t) => t.date.slice(0, 7))).size || 1;
  return Math.round(credits.reduce((s, t) => s + t.amount, 0) / months);
}

