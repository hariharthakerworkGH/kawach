/* Card smarts (5.32): three plain facts about a card, worked out from what is already
 * known about it - how much of its limit is used, when to pay to avoid interest, and
 * which day to use it to get the longest time to pay. Nothing is advice: each is the
 * card's own arithmetic. The limit is typed on the card (statements do not all carry it). */

const DAY = 86400000;
const days = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / DAY);

/* What is owed against the limit, and what is free. Null with no limit set. */
export function limitUse(limit, owed) {
  if (!(limit > 0)) return null;
  const used = Math.max(0, owed || 0);
  return { limit, used, free: Math.max(0, limit - used), over: Math.max(0, used - limit) };
}

/* The day after the statement day is the best day to use a card: the purchase falls in
 * the cycle that has only just begun, so the whole cycle plus the time the bank allows
 * after the statement (the statement date to its due date, from the last statement) is
 * there to pay. Null without a statement day and a last statement with both dates. */
export function bestDay(statementDayOfMonth, periodEnd, dueDate) {
  if (!statementDayOfMonth || !periodEnd || !dueDate) return null;
  const grace = days(periodEnd, dueDate);
  if (!(grace > 0 && grace < 60)) return null;
  const day = statementDayOfMonth >= 28 ? 1 : statementDayOfMonth + 1;
  return { day, toPay: 30 + grace };
}

/* The words for an unpaid bill: pay it all by the due date to avoid interest. Null when
 * there is nothing to say (paid, or no date). */
export function payBy(bill) {
  if (!bill || bill.paid || !bill.dueDate) return null;
  return bill.daysLeft != null && bill.daysLeft < 0 ? 'Overdue: pay it all now, interest and a late fee may apply' : 'Pay it all by then to avoid interest';
}
