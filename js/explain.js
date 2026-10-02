/* Tap a figure's name to see what it means (5.19).
 *
 * Words like "kept back" or "at an even pace" mean little to someone new,
 * and a paragraph under every heading would bury the numbers. So each of
 * these names carries one plain sentence behind a tap, on every screen and
 * in every style. The names are found by their text, wherever a screen
 * writes them as a label, so nothing about how a screen is drawn has to
 * change; a name that is itself a button keeps doing what it did.
 */

// One plain sentence each. The key is the name as it appears, in lower case.
export const TERMS = {
  'left to spend': 'What you can still spend this month after your fixed costs and savings.',
  'budget': 'What comes in each month, less what must go out and what you save.',
  'spent': 'What you have spent this month on cards and from the bank, not counting fixed costs.',
  'a day': 'What is left to spend shared over the days left, so it lasts the month.',
  'set aside used': 'Money kept for things like groceries or fuel, and how much of it has gone.',
  'kept back': 'Money you set aside this month and have not spent yet. It is still yours.',
  'owed back': 'Work costs your employer has not paid back to you yet.',
  'owed on cards': 'Card bills not paid yet, plus what you have spent on cards since.',
  'spent so far': 'Everything spent from the 1st of the month to today.',
  'at an even pace': 'What you would have spent by today if the budget were spread evenly over the month.',
  'biggest day': 'The day you spent the most this month.',
  'this week': 'What you spent in the last seven days.',
  'this month': 'Each day of this month, from the 1st to today.',
  'coming up': 'Fixed costs still to pay this month, with their dates.',
  'still to pay': 'The fixed costs this month that are not paid yet, added up.',
  'must go out': 'Costs you cannot skip: rent, EMIs and bills.',
  'can flex': 'Costs you can cut down, like groceries or eating out.',
  'free': 'What is left of what comes in after everything planned.',
  'saved': 'What you put away each month before spending.',
  'saved each month': 'What you put away each month before spending.',
  'comes in': 'Your money in each month: salary, pension, business or household money.',
  'budget each month': 'What comes in each month, less what must go out and what you save.',
  'left at this pace': 'What would be left at the end of the month if you keep spending as you have so far.',
  'your pace': 'What you have spent a day so far this month.',
  'safe': 'What you can spend a day and still end the month within budget.',
  'days left': 'Days until this month ends.',
  'put away': 'Fixed deposits, savings and provident fund: yours, but not for spending.',
  'in your accounts': 'Money in your bank and cash accounts whose balance Kawach knows.',
  'loans': 'What you still owe on your loans.',
  'net this month': 'Money that came in, less money that went out, this month.',
  'in': 'All the money that came in this month.',
  'out': 'All the money that went out this month, not counting moves between your own accounts.',
  'owed to you': 'Money you lent that has not come back yet, from everyone together.',
  'you owe': 'Money you borrowed and have not paid back yet.',
  'lent and borrowed': 'Money between you and people you know. Lending comes off Left to spend until it comes back.',
  'needs you': 'Things to do: a bill due, the bank running short, payments without a category.',
};

// The labels a screen writes names in. Only these are looked at, so a word
// like "Out" elsewhere on a screen never turns into a link.
const LABELS = [
  '.hero-label', '.tl-k', '.md-kick', '.pk-lab', '.pk-tiny', '.stat-k', '.tracking-stats small',
  '.waves__k', '.summary-row__k', '.tl-t', '.tl-label > span', '.hero-figures .muted', '.pl-legend > span',
  '.sum-needs__head', '.people-sums span', '.people-sec .account-group-label', '.ch-coming__k', '.ch-coming__still', '.pk-coming .pk-tiny', '.plan-sums .totals-row > span:first-child',
].join(', ');

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/[:.]$/, '').toLowerCase();

/* The sentence for a name, or null. Exported for a test. */
export function termFor(text) {
  const key = norm(text);
  return Object.prototype.hasOwnProperty.call(TERMS, key) ? { key, line: TERMS[key] } : null;
}

// The words an element says itself, not those of what is inside it: "₹135
// spent so far" is a figure and its name, and only the name is looked up.
function ownText(el) {
  return [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
}

const inside = (el) => el.closest('button, a, summary, label, select, input, textarea');

/* Marks the names on a screen that have a sentence behind them. */
export function markExplainable(root) {
  if (!root) return;
  for (const el of root.querySelectorAll(LABELS)) {
    if (el.dataset.explain !== undefined) continue;
    const found = termFor(ownText(el));
    el.dataset.explain = found && !inside(el) ? found.key : '';
    if (!found || inside(el)) continue;
    el.classList.add('explainable');
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-haspopup', 'true');
  }
}

let pop = null;
let from = null;

function close() {
  if (!pop) return;
  pop.remove();
  pop = null;
  if (from) from.setAttribute('aria-expanded', 'false');
  from = null;
}

function open(el) {
  const found = termFor(ownText(el));
  if (!found) return;
  if (from === el) return close();
  close();
  from = el;
  el.setAttribute('aria-expanded', 'true');
  pop = document.createElement('div');
  pop.className = 'explain-pop';
  pop.setAttribute('role', 'status');
  const title = document.createElement('b');
  title.textContent = ownText(el).trim().replace(/[:.]$/, '');
  const line = document.createElement('span');
  line.textContent = found.line;
  pop.append(title, line);
  document.body.append(pop);
  // Under the name and its figure, so the bubble never covers the number it
  // explains; inside the screen; above it when there is no room below.
  const box = el.parentElement && el.parentElement.getBoundingClientRect().height < 120 ? el.parentElement : el;
  const r = box.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const left = Math.max(16, Math.min(window.innerWidth - 16 - w, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 8 + h < window.innerHeight - 90;
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - 8 - h)}px`;
}

/* Watches the screen for names, and answers taps on them. */
export function wireExplain() {
  let queued = false;
  const mark = () => {
    queued = false;
    // A new screen, or the name redrawn away: the bubble goes with it.
    if (from && !document.body.contains(from)) close();
    markExplainable(document.getElementById('view-container'));
  };
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    // A short timer, not an animation frame: a page in the background
    // gets no frames, and the names would wait until it came back.
    setTimeout(mark, 60);
  }).observe(document.body, { childList: true, subtree: true });
  mark();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.explainable');
    if (el && !inside(e.target)) open(el);
    else if (!e.target.closest('.explain-pop')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    const el = e.target.closest && e.target.closest('.explainable');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open(el);
    }
  });
  window.addEventListener('scroll', close, { passive: true });
}
