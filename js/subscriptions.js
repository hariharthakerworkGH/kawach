/* Subscriptions (5.30): the repeating payments you could actually cancel, with what
 * each costs over a year. Those are the fixed costs paid from a card (a streaming
 * plan, an app, a gym on autopay) that are not an EMI and not money set aside: rent,
 * loans and bills come out of the bank and are not things you stop. Each says when
 * it was last charged, so one that has quietly stopped billing, or still bills for
 * something unused, stands out. Only what Plan already holds is used. */
import { isFixed, isSetAside, commitmentMatcher } from './commitments.js';
import { yearlyAmountOf, monthlyAmountOf } from './frequency.js';

const DAY = 86400000;
const days = (a, b) => Math.round((new Date(`${a}T12:00`) - new Date(`${b}T12:00`)) / DAY);

export const isSubscription = (item, cardIds) =>
  isFixed(item) && !isSetAside(item) && !item.emi && !String(item.id || '').startsWith('emi-') && !/\bEMI\b/i.test(item.label || '') && cardIds.has(item.accountId);

/* { list, yearly }: biggest yearly cost first. `stale` is true for a monthly one not
 * charged for over 45 days. */
export function subscriptionsOf(fixed, cardIds, transactions, today) {
  const list = fixed
    .filter((i) => isSubscription(i, cardIds))
    .map((item) => {
      const match = commitmentMatcher(item);
      const last = match
        ? transactions.filter((t) => t.accountId === item.accountId && t.direction === 'debit' && !t.isTransfer && t.date <= today && match(t)).map((t) => t.date).sort().pop() || null
        : null;
      const monthly = (item.frequency || 'monthly') === 'monthly';
      return { item, monthly: monthlyAmountOf(item), yearly: yearlyAmountOf(item), last, stale: Boolean(monthly && last && days(today, last) > 45) };
    })
    .sort((a, b) => b.yearly - a.yearly);
  return { list, yearly: list.reduce((t, s) => t + s.yearly, 0) };
}
