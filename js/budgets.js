import { getSetting, setSetting, getAll } from './db.js';
import { categorySlices } from './splits.js';
import { isPutAway } from './account-metrics.js';
import { isCardBill } from './transfers.js';
import { isPersonMoney } from './people.js';
import { CASH_ENTRY_RE } from './commitments.js';
import { refundPairs } from './card-refunds.js';
import { looksLikeCardPayment } from './transfers.js';
import { isoLocal } from './frequency.js';
import { spendingMonthOf, accountMap, CYCLE_SETTING_KEY } from './spending-month.js';

// Budgets are a plain map of categoryId -> monthly limit in paise, kept in the
// settings store rather than their own table: there are only ever a handful,
// and they're always read all at once.

export async function getBudgets() {
  return (await getSetting('budgets', null)) || {};
}

export async function setBudget(categoryId, amount) {
  const budgets = await getBudgets();
  if (amount == null || amount <= 0) delete budgets[categoryId];
  else budgets[categoryId] = amount;
  await setSetting('budgets', budgets);
  return budgets;
}

export function monthStartISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

// Spend per category for a billing-cycle month, split-aware: a card purchase
// after its statement day counts towards the next month. Credits and
// transfers never count against a budget - a refund shouldn't quietly buy you
// more headroom.
export function spendByCategoryForMonth(transactions, accounts, monthKey, cycleAware = true, cashFrom = null) {
  const byId = accountMap(accounts);
  const cancelled = cancelledByRefund(transactions, accounts);
  return tally(transactions.filter((t) => spendingMonthOf(t, byId.get(t.accountId), cycleAware) === monthKey), byId, cashFrom, cancelled);
}

// A card refund that undoes exactly one purchase cancels it (js/card-refunds.js). Left to spend leaves both rows out,
// so every category screen must too, or a bought-and-returned item shows as spending there and not on Summary.
export function cancelledByRefund(transactions, accounts) {
  const cardIds = new Set(accounts.filter((a) => a.type === 'card').map((a) => a.id));
  return new Set(refundPairs(transactions, cardIds, isoLocal(new Date())).flatMap((p) => [p.purchase.id, p.refund.id]));
}

// Money that came back on a card and cancels no purchase. Summary takes it off Spent; the category screens count
// spending only, so they say it on a line of its own instead of hiding the gap. Same exclusions as the card
// window in free-to-spend.js (a payment received, a transfer, a work refund, money from a person).
export function isCardRefund(t, account, cancelled) {
  return t.direction === 'credit' && account?.type === 'card' && !t.isTransfer && !t.isSettlement && !t.isShareBack && !t.isReimbursable &&
    !isPersonMoney(t) && !looksLikeCardPayment(t, 'card') && !cancelled.has(t.id);
}

// A debit that Left to spend (js/free-to-spend.js) does not count either, or the
// category screens read differently from it for the same month: a cost the
// office pays back, money lent to a person, and, once the cash rule is on
// (`cashFrom`, the day it began), a bank cash withdrawal, which is money moved to
// the pocket and counted when it is spent.
export function isNotSpending(t, account, cashFrom = null, cancelled = null) {
  if (t.direction !== 'debit') return false;
  if (t.isReimbursable === true || isPersonMoney(t) || cancelled?.has(t.id)) return true;
  return Boolean(cashFrom) && t.date >= cashFrom && account?.type === 'bank' && CASH_ENTRY_RE.test(t.rawDescription || '');
}

// An account you do not spend from (a savings pot, a bank kept for EMIs and
// FDs) is never spending, so its payments out stay out of every category: two
// home-loan EMIs from it once read as ₹46,000 of "Transport" a month.
function tally(rows, byId, cashFrom = null, cancelled = null) {
  const totals = new Map();
  for (const t of rows) {
    // A card bill is the card's purchases again (they are counted on the card).
    if (t.isTransfer || t.direction !== 'debit' || isPutAway(byId.get(t.accountId) || {}) || isCardBill(t, byId.get(t.accountId))) continue;
    if (isNotSpending(t, byId.get(t.accountId), cashFrom, cancelled)) continue;
    for (const slice of categorySlices(t)) {
      const key = slice.categoryId || 'uncategorized';
      totals.set(key, (totals.get(key) || 0) + slice.amount);
    }
  }
  return totals;
}

export async function cycleAwareEnabled() {
  return (await getSetting(CYCLE_SETTING_KEY, true)) !== false;
}

// Budget progress for a spending month, which is what the rest of the app now
// means by "this month".
export async function budgetStatusForMonth(budgets, categories, transactions, monthKey) {
  const accounts = await getAll('accounts');
  const spentMap = spendByCategoryForMonth(transactions, accounts, monthKey, await cycleAwareEnabled(), await getSetting('cashRuleFrom', null));
  return statusFrom(budgets, categories, spentMap);
}

// `state` drives the colour: fine under 80%, warn up to the limit, over past it.
function statusFrom(budgets, categories, spentMap) {
  return Object.entries(budgets)
    .map(([categoryId, limit]) => {
      const spent = spentMap.get(categoryId) || 0;
      const pct = limit > 0 ? spent / limit : 0;
      return {
        categoryId,
        name: categories.find((c) => c.id === categoryId)?.name || 'Deleted category',
        limit,
        spent,
        left: limit - spent,
        pct,
        state: pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok',
      };
    })
    .sort((a, b) => b.pct - a.pct);
}
