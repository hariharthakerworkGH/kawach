/* How the app looks, chosen by the person using it.
 *
 * These are this device's choices, not the account's. A phone and a desktop
 * can reasonably want different things, and none of it is worth syncing or
 * putting in a backup. It lives in localStorage beside the space toggle,
 * which works the same way.
 *
 * Every choice here has to be one a person can feel the difference of. A
 * setting whose effect nobody can see is a setting nobody should be asked
 * about, so nothing goes in this list until there are two finished ways of
 * doing the thing and a real reason to prefer either.
 */

import { COLOURINGS, applyColouring } from './looks.js';

const KEY = 'kawach-appearance';

export const CHOICES = {
  // The colours the app is painted in (js/looks.js, css/looks.css). It
  // replaced "Light or dark" in 4.29: each colouring is light or dark by
  // nature, and "Follow my phone" picks Charts or burning flame light.
  colour: {
    label: 'Colours',
    question: 'Which colours?',
    fallback: 'auto',
    where: '',
    options: [
      { value: 'auto', label: 'Follow my phone', note: 'Charts when your phone is dark, burning flame when it is light.' },
      ...COLOURINGS.map((c) => ({ value: c.id, label: c.name, note: c.mode === 'light' ? 'Light' : 'Dark' })),
    ],
  },
  text: {
    label: 'Text size',
    question: 'How big should the writing be?',
    fallback: 'normal',
    where: '',
    options: [
      { value: 'normal', label: 'Normal', note: 'The size Kawach is drawn at.' },
      { value: 'large', label: 'Larger', note: 'About an eighth bigger, everywhere in the app.' },
      { value: 'largest', label: 'Largest', note: 'A quarter bigger. Easiest to read; fewer rows fit on a screen.' },
    ],
  },
  density: {
    label: 'Spacing',
    question: 'How much room between things?',
    fallback: 'comfortable',
    where: '',
    options: [
      { value: 'comfortable', label: 'Comfortable', note: 'Room to breathe, the way Kawach is laid out.' },
      { value: 'compact', label: 'Compact', note: 'Tighter gaps, so more fits on the screen at once. Buttons stay the same size to tap.' },
    ],
  },
  summary: {
    label: 'The Summary screen',
    question: 'How much goes under the big number?',
    fallback: 'full',
    where: 'Summary',
    options: [
      {
        value: 'full',
        label: 'The number, the picture and the verdict',
        note: 'Your spending drawn against an even pace, and a line saying where you stand.',
      },
      {
        value: 'figures',
        label: 'The number, with budget and spent',
        note: 'No drawing. Just the two figures that explain the number.',
      },
      {
        value: 'plain',
        label: 'Only the number',
        note: 'The answer on its own. Everything else is still further down the screen.',
      },
    ],
  },
  accounts: {
    label: 'The Accounts screen',
    question: 'What should Accounts show?',
    fallback: 'ring',
    where: 'Accounts',
    options: [
      { value: 'ring', label: 'The ring above the list', note: 'How what you hold is divided, drawn above your accounts.' },
      { value: 'list', label: 'Just the list', note: 'Your accounts and their balances, nothing drawn.' },
      { value: 'private', label: 'Keep balances covered', note: 'Amounts stay hidden behind a tap, for checking your phone where others can see it.' },
    ],
  },
  plan: {
    label: 'The Plan screen',
    question: 'In what order should your fixed costs sit?',
    fallback: 'yours',
    where: 'Plan',
    options: [
      { value: 'yours', label: 'The order you arranged', note: 'However you put them with Reorder. Kawach leaves them alone.' },
      { value: 'day', label: 'By the day they are due', note: 'Earliest in the month first, so what is coming next is at the top.' },
      { value: 'size', label: 'Biggest first', note: 'The largest amounts at the top, to see what dominates the month.' },
    ],
  },
  add: {
    label: 'The Add screen',
    question: 'How much of the form do you want to see?',
    fallback: 'full',
    where: 'Add',
    options: [
      { value: 'full', label: 'Everything at once', note: 'Amount, what it was for, category, account, date and repeats, all on the screen.' },
      { value: 'quick', label: 'Just the essentials', note: 'Amount, what it was for and category. Date, account and repeats fold behind one tap.' },
    ],
  },
  opening: {
    label: 'When Kawach opens',
    question: 'Which screen should it start on?',
    fallback: 'summary',
    where: '',
    options: [
      { value: 'summary', label: 'Summary', note: 'What you have left to spend. The usual first question.' },
      { value: 'add', label: 'Add', note: 'Straight to entering a payment, for logging as you go.' },
      { value: 'accounts', label: 'Accounts', note: 'What is in each account first.' },
    ],
  },
  history: {
    label: 'The History screen',
    question: 'How should six months be drawn?',
    fallback: 'both',
    where: 'History',
    options: [
      { value: 'both', label: 'Bars, with the river underneath', note: 'Both drawings, the river folded away until you open it.' },
      { value: 'bars', label: 'Bars only', note: 'Money in against money out, month by month.' },
      { value: 'river', label: 'The river only', note: 'Two lines with the gap shaded: what you kept each month.' },
    ],
  },
};

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    // A private window, or storage turned off. Everyone gets the defaults.
    return {};
  }
}

/* The chosen value, or the default. A value that is not one of the offered
 * options - an older build's name, a hand-edited entry - falls back rather
 * than reaching a screen that cannot draw it.
 */
export function appearance(name) {
  const spec = CHOICES[name];
  if (!spec) return null;
  const all = read();
  let saved = all[name];
  // Before 4.29 the choice was light or dark; it carries over to the
  // colouring that is the same thing now.
  if (name === 'colour' && saved === undefined) saved = { light: 'flame-light', dark: 'charts' }[all.theme];
  return spec.options.some((o) => o.value === saved) ? saved : spec.fallback;
}

export function setAppearance(name, value) {
  const spec = CHOICES[name];
  if (!spec || !spec.options.some((o) => o.value === value)) return false;
  const all = read();
  all[name] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    return false;
  }
  if (name === 'colour') applyTheme();
  if (name === 'text' || name === 'density') applyDisplay();
  return true;
}

/* The chosen colouring, put on <html> where the stylesheets can see it, with
 * its light or dark (js/looks.js). index.html does the same inline before the
 * first paint, so the app never opens in the wrong colours and then corrects
 * itself. 'auto' follows the phone, and keeps following it while open.
 */
let following = false;
export function applyTheme() {
  applyColouring(appearance('colour'));
  if (!following && window.matchMedia) {
    following = true;
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => {
      if (appearance('colour') === 'auto') applyColouring('auto');
    });
  }
}

/* Text size and spacing, put on <html> beside the daylight. The default of
 * each is left off entirely rather than written out, so the stylesheet's own
 * values are what apply and there is only one place they are stated.
 */
export function applyDisplay() {
  const root = document.documentElement;
  const text = appearance('text');
  const density = appearance('density');
  if (text === 'normal') root.removeAttribute('data-text');
  else root.setAttribute('data-text', text);
  if (density === 'comfortable') root.removeAttribute('data-density');
  else root.setAttribute('data-density', density);
}
