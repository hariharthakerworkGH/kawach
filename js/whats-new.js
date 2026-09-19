import { get, put } from './db.js';
import { icon } from './icons.js';
import { runGuide } from './guide.js';

// What each version brought, told once after the update, and kept in
// Settings. Every item is one line; one with a `guide` has a "Show me" that
// walks through it on the real screen (js/guide.js). `for` keeps an item to
// the people it concerns - a pensioner isn't told about GST.
//
// Add a version at the top with every release that changes something a
// user would notice. Plain words, no version jargon.

const NOTES = [
  {
    version: '02.01.00',
    items: [
      {
        icon: 'settings',
        title: 'How money comes in',
        text: 'Salary, business, pension or household money. You see only what fits.',
        guide: [
          { view: 'settings', target: '#money-card', text: 'Pick how money mainly comes in. Everything else in the app follows it.' },
        ],
      },
      {
        icon: 'store',
        title: 'A business on the side',
        text: 'A shop, tiffin or tuition? Keep its money apart.',
        for: (p) => p.main !== 'business',
        guide: [
          { view: 'settings', target: '#side-business-row', text: 'Turn this on if you also run a business.' },
          { view: 'accounts', target: '#add-account-btn', text: 'Then add the business account here, and tick "For the business".' },
        ],
      },
    ],
  },
  {
    version: '02.00.00',
    items: [
      {
        icon: 'store',
        title: 'Your business on its own',
        text: 'Money in, out and taken home, apart from the house.',
        for: (p) => p.business,
        guide: [{ view: 'summary', target: '.business-card', text: 'This month in the business. Tap it to see its payments.' }],
      },
      {
        icon: 'tag',
        title: 'Business categories',
        text: 'Seven to start, and add your own.',
        for: (p) => p.business,
        guide: [
          { view: 'categories', target: '#cat-scope-business', text: 'Business categories live here, apart from the home ones.' },
          { view: 'categories', target: '#add-cat-btn', text: 'Add your own, for how your work runs.' },
        ],
      },
    ],
  },
];

// "02.01.00" > "02.00.00": the parts compare as numbers.
const newer = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

// The notes for someone, from versions after the one they last saw.
export function notesFor(profile, since = null) {
  return NOTES.filter((n) => !since || newer(n.version, since))
    .map((n) => ({ ...n, items: n.items.filter((item) => !item.for || item.for(profile)) }))
    .filter((n) => n.items.length);
}

// The last version this device showed notes for. Kept on the device, like
// the other things only this phone needs to remember.
async function lastSeen() {
  const row = await get('syncMeta', 'notesSeen');
  return row ? row.value : null;
}
async function markSeen(version) {
  await put('syncMeta', { id: 'notesSeen', value: version }, { stamp: false });
}

// Once after an update: the new notes, if there are any for this person.
// Someone brand new has nothing to catch up on, so their first version is
// simply noted as seen. Phones from before notes existed last saw 01.10.00.
export async function showIfUpdated(current, profile, { isNew }) {
  const seen = await lastSeen();
  if (isNew && !seen) return markSeen(current);
  const notes = notesFor(profile, seen || '01.10.00');
  await markSeen(current);
  if (notes.length) openNotes(notes, { title: "What's new" });
}

// The sheet itself: one line per item, a "Show me" where there's a guide.
export function openNotes(notes, { title }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop notes-backdrop';
  backdrop.innerHTML = `
    <div class="notes-sheet" role="dialog" aria-modal="true" aria-labelledby="notes-title">
      <p class="notes-title" id="notes-title">${title}</p>
      ${notes
        .map(
          (n) => `
        <p class="notes-version">Version ${n.version}</p>
        ${n.items
          .map(
            (item, i) => `
          <div class="notes-item">
            <span class="notes-icon">${icon(item.icon || 'info')}</span>
            <span class="notes-text"><strong>${item.title}</strong><span>${item.text}</span></span>
            ${item.guide ? `<button type="button" class="btn-tiny notes-show" data-version="${n.version}" data-index="${i}">Show me</button>` : ''}
          </div>`
          )
          .join('')}`
        )
        .join('')}
      <button type="button" class="btn-primary notes-close">Got it</button>
    </div>
  `;
  const close = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  backdrop.querySelector('.notes-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelectorAll('.notes-show').forEach((btn) => {
    btn.addEventListener('click', () => {
      const note = notes.find((n) => n.version === btn.dataset.version);
      close();
      runGuide(note.items[Number(btn.dataset.index)].guide);
    });
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  backdrop.querySelector('.notes-close').focus();
}
