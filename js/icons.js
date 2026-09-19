// The app's icons: one set of plain line drawings, all the same weight, drawn
// here rather than borrowed from emoji. Emoji look different on every phone
// and read as decoration; these read as part of the interface. They take the
// colour of the text around them (currentColor), so a warning icon is simply
// an icon inside warning-coloured text.
//
// Category icons are drawn the same way, in category-icons.js; which one a
// category wears is category-style.js.

const PATHS = {
  summary: '<path d="M5 20v-7"/><path d="M12 20V5"/><path d="M19 20v-11"/><path d="M3 20h18"/>',
  plan: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  add: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  coach: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  accounts: '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M19 21V10"/><path d="M9.5 21V10"/><path d="M14.5 21V10"/><path d="M2 10h20L12 3z"/>',
  history: '<path d="M8.5 6H21"/><path d="M8.5 12H21"/><path d="M8.5 18H21"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/>',
  settings:
    '<path d="M4 6h9"/><path d="M17 6h3"/><circle cx="15" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="17" cy="18" r="2"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 17v-6"/><path d="M9.5 13.5L12 11l2.5 2.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13L20 3"/><path d="M17 6l3 3"/><path d="M14.5 8.5l2 2"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  alert: '<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16.5 14.5h.01"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  down: '<path d="M3 7l6 6 4-4 8 8"/><path d="M21 11v6h-6"/>',
  backup: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 20h14"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9h.01"/><path d="M17.5 15h.01"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  inbox: '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5.5 5h13L21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z"/>',
  bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6"/><path d="M9 12h6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 7.5h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
};

export function icon(name, extraClass = '') {
  const paths = PATHS[name];
  if (!paths) return '';
  return `<svg class="icon${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// For markup written in index.html: <span data-icon="summary"></span>.
export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}
