/* What you did not spend of your flexible costs (5.32): for the month in review, each cost
 * you set aside money for (groceries, fuel, entertainment) with what was set aside, what
 * went on it and what was left, and the month's total left over. It is only a report: the
 * budget took the whole amount out at the start of the month and still does, so what is
 * left over is shown, never added to anything. Rows come from the one calculation every
 * screen reads (its per-commitment tracker). */
export function flexReport(tracker) {
  const rows = (tracker || [])
    .filter((t) => t.setAside && !t.skipped && t.status !== 'untracked' && t.amount > 0)
    .map((t) => ({ label: t.label, aside: t.amount, spent: t.used, left: t.amount - t.used }))
    .sort((a, b) => b.left - a.left);
  if (!rows.length) return null;
  return {
    rows,
    aside: rows.reduce((s, r) => s + r.aside, 0),
    saved: rows.reduce((s, r) => s + Math.max(0, r.left), 0),
    over: rows.reduce((s, r) => s + Math.max(0, -r.left), 0),
  };
}
