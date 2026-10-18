/* Pieces of the money calculation that stand on their own (5.43.3), moved out of js/free-to-spend.js so each can be
 * read and tested by itself: the day arithmetic, the status of each commitment this cycle, and the by-day series
 * behind the burn drawing. The code is as it was; computeFreeToSpend() calls these. */
import { isoLocal, frequencyOf, nextOccurrence, addDays, dateOf } from './frequency.js';

export { addDays, dateOf };
import { isSetAside } from './commitments.js';

export const DAY_MS = 86400000;
// Fewer days than this into a period and a pace says nothing yet.
export const MIN_DAYS_FOR_PACE = 5;

export function daysBetweenInclusive(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / DAY_MS) + 1;
}

// Each commitment this cycle ----------------------------------------------------------------------------------
// Paid in one go (EMI, rent): paid or still due. Spread through the cycle (Tiffin, Rapido, ATM cash): how much of it
// is used, and whether the pace so far takes it over the planned amount by the statement day.
export function trackCommitments(budgetItems, { periodOf, today, markedPaid }) {
  return budgetItems.map((b) => {
    const variable = Boolean(b.item.spread) || frequencyOf(b.item) !== 'monthly';
    const p = periodOf(b.item);
    const daysInto = Math.max(1, daysBetweenInclusive(p.start, today));
    const length = Math.max(daysInto, daysBetweenInclusive(p.start, p.end));
    const row = {
      id: b.item.id,
      label: b.label,
      amount: b.amount,
      paidBy: b.paidBy,
      used: b.used,
      matches: b.matches || [],
      // Payments you took off it with "Not this", so they can be put back.
      notThis: b.notThis || [],
      // Where you placed it in the list on Plan.
      order: b.item.sortOrder ?? null,
      tracked: b.tracked,
      variable,
      // Money kept back rather than owed. It has no day, so it is never
      // late, and whatever is not spent of it is still there.
      setAside: isSetAside(b.item),
      left: b.amount - b.used,
      marked: markedPaid(b.item),
      // A loan's EMI is set up on the loan account, not on Plan.
      kind: b.item.source === 'loan' ? 'loan' : 'fixed',
      // Mark paid and Skip are saved against this key.
      cycleKey: p.key,
      periodStart: p.start,
      period: p.kind === 'card' ? 'cycle' : 'month',
    };
    if (b.used > b.amount * 1.02) return { ...row, status: 'over', over: b.used - b.amount };
    if (row.marked) return { ...row, status: 'paid' };
    if (!b.tracked) return { ...row, status: 'untracked' };
    if (!variable) {
      if (b.used >= b.amount * 0.9) return { ...row, status: 'paid' };
      // A one-time bill has its own date, so one still unpaid after it reads late, not due again next month.
      const due = b.item.once && b.item.once.dueOn ? b.item.once.dueOn : nextOccurrence(b.item.dayOfMonth, dateOf(p.start));
      if (b.used > 0) return { ...row, status: 'part', due };
      return { ...row, status: due < today ? 'late' : 'due', due };
    }
    const projected = Math.round((b.used / daysInto) * length);
    if (daysInto >= MIN_DAYS_FOR_PACE && projected > b.amount * 1.02) return { ...row, status: 'heading-over', projected };
    return { ...row, status: 'ok', projected };
  });
}

// The same spending, laid out by day, for the burn drawing on Summary (js/charts.js).
export function spendSeries({ undated, perDay, otherDay, windowStart, today }) {
  const spendDays = [];
  const spendByDay = [];
  let running = undated;
  for (let i = 0; i < daysBetweenInclusive(windowStart, today); i += 1) {
    const on = addDays(windowStart, i);
    running += perDay.get(on) || 0;
    spendDays.push(running);
    spendByDay.push({ date: on, amount: Math.max(0, perDay.get(on) || 0), other: otherDay.get(on) || 0 });
  }
  return { spendDays, spendByDay };
}
