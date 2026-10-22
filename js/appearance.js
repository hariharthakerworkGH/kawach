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

import { COLOURINGS, STYLES, applyColouring } from './looks.js';
import { isDemo } from './demo-flag.js';

// The demo copies your look when it starts and keeps its own from then on (js/demo.js).
const KEY = isDemo() ? 'kawach-demo-appearance' : 'kawach-appearance';

/* Peaks and Mindora were retired in 5.41 and Tactile and Charts in 5.57. Whoever had chosen one (as the style or as the
 * colouring) is moved off it once, to Haven following the phone, and told. True when something was changed. */
export function retireOldLooks() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY)) || {};
    const old = (v) => v === 'peaks' || v === 'mindora';
    const newer = (v) => v === 'tactile' || v === 'charts' || v === 'instrument';
    const styleGone = old(stored.style) || newer(stored.style);
    const colourGone = old(stored.colour) || stored.colour === 'tactile' || String(stored.colour || '').startsWith('instrument');
    if (!styleGone && !colourGone) return false;
    if (styleGone) delete stored.style;
    if (colourGone) delete stored.colour;
    localStorage.setItem(KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/* 5.89.2: the header's day/night button used to store a fixed Haven day or night, so everyone who ever tapped it was stuck on one look,
 * and "Follow the sun" never reached them (a phone showing 7 am in the dark). Those two fixed choices move to Follow the sun once;
 * a colouring picked on purpose in Settings (Ember dusk, Atelier ...) is left alone, and so is anyone who chooses again afterwards. */
export function moveFixedHavenToSun() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY)) || {};
    if (stored.sunMigrated) return false;
    stored.sunMigrated = true;
    const moved = stored.colour === 'haven-day' || stored.colour === 'haven-night';
    if (moved) stored.colour = 'sun';
    localStorage.setItem(KEY, JSON.stringify(stored));
    return moved;
  } catch {
    return false;
  }
}

export const CHOICES = {
  // The style screens are built in (js/looks.js): only those that are ready.
  // Haven is the default since 5.52 (the owner's choice; Instrument was from 5.27, Tactile
  // from 5.17): new features are built in it first and spread to the others together.
  style: {
    label: 'Style',
    question: 'Which style?',
    fallback: 'haven',
    where: '',
    options: STYLES.filter((s) => s.ready).map((s) => ({ value: s.id, label: s.name, note: s.note })),
  },
  // The colours the app is painted in (js/looks.js, css/looks.css). It
  // replaced "Light or dark" in 4.29: each colouring is light or dark by
  // nature, and "Follow my phone" picks Charts or burning flame light.
  colour: {
    label: 'Colours',
    question: 'Which colours?',
    fallback: 'sun',
    where: '',
    options: [
      { value: 'sun', label: 'Follow the sun', note: 'Light by day, dark after sunset, wherever you are. The sky behind each screen is the real sun and moon.' },
      { value: 'haven-day', label: 'Always day', note: 'Light, whatever the hour.' },
      { value: 'haven-night', label: 'Always night', note: 'Dark, whatever the hour.' },
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
  // 5.56: how alive Haven feels (js/haven-motion.js). The phone's own "reduce motion" always wins over this.
  motion: {
    label: 'Motion',
    question: 'How alive should Haven feel?',
    fallback: 'alive',
    where: '',
    options: [
      { value: 'alive', label: 'Alive', note: 'The water breathes, icons catch the light, the sky follows the hour, the shield leans as you tilt the phone.' },
      { value: 'calm', label: 'Calm', note: 'Only what answers a touch: presses, saves, the figure counting. Nothing moves on its own.' },
      { value: 'still', label: 'Still', note: 'No animation at all.' },
    ],
  },
  // 5.58: what fills the shield. Haven's tide; low money still turns warm whatever it is.
  liquid: {
    label: 'What fills the shield',
    question: 'What should the shield hold?',
    fallback: 'water',
    where: 'Summary',
    options: [
      { value: 'water', label: 'Water', note: 'Blue, the way Haven began.' },
      { value: 'chai', label: 'Chai', note: 'Warm brown.' },
      { value: 'gold', label: 'Gold', note: 'A rich yellow.' },
      { value: 'sunset', label: 'Sunset', note: 'Red into orange.' },
      { value: 'mint', label: 'Mint', note: 'Cool green.' },
    ],
  },
  // 5.58: a little seasonal touch on the day itself. Optional.
  festivals: {
    label: 'Festival touches',
    question: 'Should the shield celebrate Diwali, Holi and New Year?',
    fallback: 'on',
    where: 'Summary',
    options: [
      { value: 'on', label: 'Yes', note: 'A small touch on the day itself, once.' },
      { value: 'off', label: 'No', note: 'Nothing seasonal.' },
    ],
  },
  // NEW (5.18): the short version is where a new person starts - the
  // answer, what needs them, the month, and the rest behind one tap. Anyone
  // who already had data when it arrived keeps the full one (app.js).
  summary: {
    label: 'The Summary screen',
    question: 'How much goes under the big number?',
    fallback: 'short',
    where: 'Summary',
    options: [
      {
        value: 'short',
        label: 'The short version',
        note: 'The answer, what needs you and this month. Everything else one tap away.',
      },
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
    fallback: 'name',
    where: 'Plan',
    options: [
      { value: 'name', label: 'A to Z', note: 'By name, so any one is easy to find.' },
      { value: 'yours', label: 'The order you arranged', note: 'However you put them with Reorder. Kawach leaves them alone.' },
      { value: 'day', label: 'By the day they are due', note: 'Earliest in the month first, so what is coming next is at the top.' },
      { value: 'size', label: 'Biggest first', note: 'The largest amounts at the top, to see what dominates the month.' },
    ],
  },
  accountOrder: {
    label: 'Your accounts',
    question: 'In what order should your accounts sit?',
    fallback: 'name',
    where: 'Accounts',
    options: [
      { value: 'name', label: 'A to Z', note: 'By name, within each kind of account.' },
      { value: 'size', label: 'Biggest first', note: 'The largest balance or bill at the top of each kind.' },
      { value: 'yours', label: 'The order you arranged', note: 'However you put them with Reorder.' },
    ],
  },
  categoryOrder: {
    label: 'Your categories',
    question: 'In what order should categories be listed?',
    fallback: 'name',
    where: 'History',
    options: [
      { value: 'name', label: 'A to Z', note: 'By name, in every list of categories.' },
      { value: 'used', label: 'Most used first', note: 'The ones you give to most payments at the top.' },
    ],
  },
  add: {
    label: 'The Add screen',
    question: 'How much of the form do you want to see?',
    fallback: 'full',
    where: 'Add',
    options: [
      { value: 'full', label: 'Everything at once', note: 'Amount, what it was for, category, account, date and repeats, all on the screen.' },
      { value: 'quick', label: 'Just the essentials', note: 'Amount, what it was for, date, account and category. Repeats fold behind one tap.' },
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

/* Whether a look has been chosen on this device at all. */
export function chosen(name) {
  return read()[name] !== undefined;
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
  if (name === 'colour' || name === 'style') { applyTheme(); window.dispatchEvent(new Event('hv-where')); }
  if (name === 'text' || name === 'density' || name === 'motion' || name === 'liquid') applyDisplay();
  if (name === 'motion') window.dispatchEvent(new Event('hv-motion'));
  return true;
}

/* The chosen colouring, put on <html> where the stylesheets can see it, with
 * its light or dark (js/looks.js). index.html does the same inline before the
 * first paint, so the app never opens in the wrong colours and then corrects
 * itself. 'auto' follows the phone, and keeps following it while open.
 */
let following = false;
export function applyTheme() {
  applyColouring(appearance('colour'), appearance('style'));
  if (!following && window.matchMedia) {
    following = true;
    window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => {
      if (appearance('colour') === 'auto') applyColouring('auto', appearance('style'));
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
  root.setAttribute('data-motion', appearance('motion'));
  root.setAttribute('data-liquid', appearance('liquid'));
  if (text === 'normal') root.removeAttribute('data-text');
  else root.setAttribute('data-text', text);
  if (density === 'comfortable') root.removeAttribute('data-density');
  else root.setAttribute('data-density', density);
}
