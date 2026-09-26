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

const KEY = 'kawach-appearance';

export const CHOICES = {
  theme: {
    label: 'Daylight',
    question: 'Light or dark?',
    fallback: 'auto',
    where: '',
    options: [
      { value: 'auto', label: 'Follow my phone', note: 'Dark when your phone is dark, light when it is light.' },
      { value: 'dark', label: 'Always dark', note: 'The deep background, whatever the phone is set to.' },
      { value: 'light', label: 'Always light', note: 'Paper white, whatever the phone is set to.' },
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
  const saved = read()[name];
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
  if (name === 'theme') applyTheme();
  return true;
}

/* The chosen daylight, put on <html> where the stylesheet can see it.
 *
 * 'auto' removes the attribute rather than setting it to "auto", so the
 * stylesheet's own prefers-color-scheme rule is left to decide. index.html
 * does the same thing inline before the first paint, so the app never opens
 * in the wrong colour and then corrects itself.
 */
export function applyTheme() {
  const theme = appearance('theme');
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
