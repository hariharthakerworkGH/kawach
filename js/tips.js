/* Feature tips (7.18): one quiet row at the foot of Summary's To do tab, shown when what the person is doing makes a feature useful.
 *
 * Each tip has a key, a test on facts the screen already has, the words, and the screen it opens. Only the first tip that is true
 * and not yet dismissed is shown, so there is never more than one. "Got it" hides it (js/todo-seen.js, which brings it back after
 * 30 days if it is still true); a tip never counts in the To do badge. Every `go` must be a screen in js/app.js, and every tip must be
 * reachable: Summary shows the setup screen, not the To do tab, until fixed costs are set, so no tip can wait on "no fixed costs". */

export const TIPS = [
  {
    key: 'tip:coach',
    when: (f) => f.free < 0,
    ico: 'coach',
    title: 'Over for this month',
    sub: 'Coach shows where the spending can be trimmed.',
    go: 'coach',
    label: 'Open Coach',
  },
  {
    key: 'tip:bulk',
    when: (f) => f.uncategorized >= 5,
    ico: 'tick',
    title: 'Change many at once',
    sub: 'In History, tap the tick to pick several payments and give them one category.',
    go: 'transactions',
    label: 'Open History',
  },
  {
    key: 'tip:goals',
    when: (f) => f.hasSavings && f.goals === 0,
    ico: 'tag',
    title: 'Saving for something?',
    sub: 'Add a goal on Plan to see what each month needs to put away.',
    go: 'plan',
    label: 'Open Plan',
  },
];

/* The first tip that applies and has not been dismissed, or null. `hidden` is a Set of keys the person has said Got it to. */
export function pickTip(facts, hidden = new Set()) {
  return TIPS.find((t) => !hidden.has(t.key) && t.when(facts)) || null;
}
