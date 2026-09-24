import { getSetting, setSetting } from './db.js';

// What you are saving towards: a child's education, a wedding, a house, an
// emergency fund. A goal names an amount, the month you want it by, and the
// savings it is counted in (PPF, FDs, gold, a fund - js/views/accounts.js).
// Nothing is moved or reserved; it only says how much a month gets you there.

export const GOAL_IDEAS = ["Child's education", 'Wedding', 'House', 'Emergency fund', 'Retirement'];

export async function getGoals() {
  const list = await getSetting('goals', []);
  return Array.isArray(list) ? list : [];
}

export async function saveGoals(list) {
  await setSetting('goals', list);
}

// Months from this month to the goal's month, at least one: a goal due this
// month still needs the rest of it now, not divided by zero.
export function monthsLeft(byMonth, today) {
  const [y, m] = byMonth.split('-').map(Number);
  const [ty, tm] = today.split('-').map(Number);
  return Math.max(1, (y - ty) * 12 + (m - tm));
}

// What to put away each month to get there, and how far along it is.
export function goalProgress(goal, saved, today) {
  const left = Math.max(0, goal.target - saved);
  return { saved, left, monthly: Math.ceil(left / monthsLeft(goal.by, today)), done: left === 0 };
}
