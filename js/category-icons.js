// Category icons: line drawings in the same style as the app's own icons
// (icons.js) - one stroke weight, one 24-point grid, the colour of the text
// around them. Emoji were used before; they look different on every phone,
// and a handful of them ended up standing for everything (four categories
// wore the same price tag). Each kind of spending now has a drawing of its
// own, and category-style.js makes sure no two of your categories share one.

export const CATEGORY_ICONS = {
  // Food and drink
  food: '<path d="M7 3v8"/><path d="M4.5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M7 11v10"/><path d="M17 21V3c-2.2 1.2-3.5 3.6-3.5 7v3H17"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3.5c0 1.2 1 1.3 1 2.5"/><path d="M12 3.5c0 1.2 1 1.3 1 2.5"/>',
  groceries: '<path d="M3 9h18l-2 11H5z"/><path d="M8 9l4-6 4 6"/><path d="M9.5 13v4"/><path d="M14.5 13v4"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l7-7"/>',
  drink: '<path d="M6 4h10v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M16 8h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M9.5 9v8"/><path d="M12.5 9v8"/>',

  // Getting around
  car: '<path d="M4 16v-4l2.2-5.2A2 2 0 0 1 8 5.5h8a2 2 0 0 1 1.8 1.3L20 12v4"/><rect x="3" y="12" width="18" height="5" rx="1.5"/><path d="M6 17v2"/><path d="M18 17v2"/><path d="M7 14.5h.01"/><path d="M17 14.5h.01"/>',
  taxi: '<path d="M10 5.5V3.5h4v2"/><path d="M4 16v-4l2.2-5.2A2 2 0 0 1 8 5.5h8a2 2 0 0 1 1.8 1.3L20 12v4"/><rect x="3" y="12" width="18" height="5" rx="1.5"/><path d="M6 17v2"/><path d="M18 17v2"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5L9 9h5l4.5 7.5"/><path d="M9 9L7.5 6H5"/><path d="M14 9l1-3h2.5"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14"/><path d="M9 14h.01"/><path d="M15 14h.01"/><path d="M8 17l-2 4"/><path d="M16 17l2 4"/>',
  plane: '<path d="M2.5 12.5l19-8-7 16-3-5.5z"/><path d="M11.5 15L21.5 4.5"/>',

  // Home and bills
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  rent: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h.01"/><path d="M15 7h.01"/><path d="M9 11h.01"/><path d="M15 11h.01"/><path d="M9 15h.01"/><path d="M15 15h.01"/><path d="M10.5 21v-3h3v3"/>',
  loan: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 16.5l5-5"/><path d="M9.8 11.8h.01"/><path d="M14.2 16.2h.01"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>',
  bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  wrench: '<path d="M15 4a5 5 0 0 0-4.6 6.9L3.5 17.8a2 2 0 0 0 2.7 2.7l6.9-6.9A5 5 0 0 0 20 9l-3 1-2-2 1-3z"/>',
  broom: '<path d="M20 4l-7.5 7.5"/><path d="M10.5 9.5l4 4-2 5.5c-3 .3-6.5-1.4-8.5-3.5l.5-2.5z"/><path d="M8 18l2.5-2.5"/>',

  // Shopping and fun
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  shirt: '<path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  scissors: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5L20 19"/><path d="M8.5 15.5L20 5"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16"/><path d="M17 4v16"/><path d="M3 9h4"/><path d="M3 15h4"/><path d="M17 9h4"/><path d="M17 15h4"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  game: '<path d="M7 8h10a4 4 0 0 1 4 4v1.5a3 3 0 0 1-5.5 1.6L14.5 14h-5l-1 1.1A3 3 0 0 1 3 13.5V12a4 4 0 0 1 4-4z"/><path d="M7.5 10.5v3"/><path d="M6 12h3"/><path d="M16 11.5h.01"/><path d="M17.5 13h.01"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v2"/><path d="M14 11v2"/><path d="M14 15v2"/>',

  // Health and growth
  pill: '<path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
  cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  dumbbell: '<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 10v4"/><path d="M21 10v4"/><path d="M6 12h12"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/><path d="M22 9v6"/>',

  // People
  family: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8.5" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><path d="M14.5 14.2A4 4 0 0 1 21 17.5V20"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8c-2-4-5-4-5-2s3 2 5 2c2 0 5 0 5-2s-3-2-5 2"/>',
  heart: '<path d="M12 20s-8-4.5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20z"/>',
  paw: '<circle cx="5.5" cy="11" r="1.8"/><circle cx="9" cy="6.5" r="1.8"/><circle cx="15" cy="6.5" r="1.8"/><circle cx="18.5" cy="11" r="1.8"/><path d="M12 12c-3 0-5.5 3.5-5.5 6a2.5 2.5 0 0 0 3 2.4c1.6-.4 3.4-.4 5 0a2.5 2.5 0 0 0 3-2.4c0-2.5-2.5-6-5.5-6z"/>',

  // Money itself
  income: '<path d="M12 3v11"/><path d="M7.5 9.5L12 14l4.5-4.5"/><path d="M3 14v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v4c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 10v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/><path d="M5 14v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>',
  atm: '<rect x="3" y="3" width="18" height="8" rx="2"/><path d="M7 7h10"/><path d="M7 11v9h10v-9"/><circle cx="12" cy="15.5" r="2"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9h.01"/><path d="M17.5 15h.01"/>',
  wallet: '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6"/><path d="M16.5 14h.01"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/>',
  bank: '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M19 21V10"/><path d="M9.5 21V10"/><path d="M14.5 21V10"/><path d="M2 10h20L12 3z"/>',
  transfer: '<path d="M4 8h15"/><path d="M15 4l4 4-4 4"/><path d="M20 16H5"/><path d="M9 12l-4 4 4 4"/>',
  piggy: '<path d="M19 11c0-3.3-3.1-6-7-6S5 7.7 5 11c0 1.9 1 3.5 2.5 4.6V19h3v-2h3v2h3v-3.4c1-.7 1.8-1.6 2.2-2.6H21v-3h-1.8"/><path d="M15.5 9.5h.01"/><path d="M3 9.5c.5 1 1.2 1.5 2 1.5"/>',
  chart: '<path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/><path d="M15 6h4v4"/>',
  fee: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9.5 13.5l5-5"/><path d="M9.8 8.8h.01"/><path d="M14.2 13.2h.01"/>',
  rupee: '<path d="M6 4h12"/><path d="M6 9h12"/><path d="M9 4c6 0 6 10 0 10H6l8 7"/>',

  // Anything else
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 7.5h.01"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>',
  dots: '<circle cx="5.5" cy="12" r="1.25"/><circle cx="12" cy="12" r="1.25"/><circle cx="18.5" cy="12" r="1.25"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
  split: '<path d="M12 21v-7"/><path d="M12 14L5 7"/><path d="M12 14l7-7"/><path d="M5 11V7h4"/><path d="M19 11V7h-4"/>',
};

// The order the picker shows them in: grouped as above, the two that only
// the app uses (a missing category, a split payment) left out.
export const PICKABLE_ICONS = Object.keys(CATEGORY_ICONS).filter((k) => k !== 'question' && k !== 'split');

export function categoryIcon(key) {
  const paths = CATEGORY_ICONS[key] || CATEGORY_ICONS.tag;
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}
