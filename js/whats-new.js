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
    version: '4.2',
    items: [
      {
        icon: 'eye',
        title: 'See it before you choose it',
        text: 'How it looks now shows each option drawn with your own money, so you can look at it before you decide.',
        guide: [{ view: 'settings', target: '#go-appearance', text: 'Pick an option and the picture underneath changes with it.' }],
      },
    ],
  },
  {
    version: '4.1',
    items: [
      {
        icon: 'settings',
        title: 'Make it look how you like',
        text: 'Settings now has "How it looks": light or dark whatever your phone does, how much sits under the big number on Summary, and how six months are drawn on History.',
        guide: [{ view: 'settings', target: '#go-appearance', text: 'Your choices live here. They stay on this phone.' }],
      },
      {
        icon: 'sync',
        title: 'Updates arrive on their own',
        text: 'Kawach now takes a new version as soon as it is ready, instead of asking. It waits if you are part way through adding something or checking a statement.',
      },
      {
        icon: 'wallet',
        title: 'The app icon',
        text: 'If your home screen still showed the old green shield, it should pick up the current one. On some phones you may need to remove Kawach from the home screen and add it again.',
      },
    ],
  },
  {
    version: '4.0.13',
    items: [
      {
        icon: 'sync',
        title: 'Shared pages stay up to date',
        text: 'The welcome page you send people and the privacy policy were being kept on the phone and never refreshed. They now load fresh every time.',
      },
    ],
  },
  {
    version: '4.0.12',
    items: [
      {
        icon: 'card',
        title: 'Cards that bill at the end of the month',
        text: 'If your card bills on the 29th, 30th or 31st, its spending is now placed in the right cycle, and the spending graph puts each payment on the day it happened.',
      },
    ],
  },
  {
    version: '4.0.11',
    items: [
      { icon: 'summary', title: 'The app’s full design is back', text: 'Summary and Accounts cards, charts and spacing now display correctly again.' },
    ],
  },
  {
    version: '4.0.10',
    items: [
      { icon: 'summary', title: 'Summary is easier to scan', text: 'Card-cycle and bank-month spending sit in one short line, card bills are explained once, and breakdown amounts have room beside their labels.', guide: [{ view: 'summary', target: '.summary-spending-split', text: 'Card spending follows the statement cycle; bank spending follows the calendar month.' }] },
    ],
  },
  {
    version: '4.0.9',
    items: [
      { icon: 'summary', title: 'See both spending periods', text: 'Summary separates card-cycle spending from bank spending this month, and calls out a card bill that is still unpaid.', guide: [{ view: 'summary', target: '.summary-spending-split', text: 'Card spending follows the statement cycle; bank spending follows the month.' }] },
    ],
  },
  {
    version: '4.0.8',
    items: [
      { icon: 'summary', title: 'Summary catches up when you return', text: 'Come back to the app and Summary rereads the latest entries saved on this phone.' },
    ],
  },
  {
    version: '4.0.7',
    items: [
      { icon: 'summary', title: 'See where your spending is heading', text: 'The Summary now projects your current spending pace through the end of the cycle, alongside the even-pace reference.' },
    ],
  },
  {
    version: '4.0.6',
    items: [
      { icon: 'accounts', title: 'Account marks align', text: 'Merchant initials now use consistent letter cells so marks sit evenly across the app.' },
    ],
  },
  {
    version: '4.0.5',
    items: [
      { icon: 'accounts', title: 'Account marks line up', text: 'Small account marks and initials now sit consistently in their tiles.' },
      { icon: 'summary', title: 'Design Lab drawings are back', text: 'The reusable charts and visual pieces now render correctly in the component catalogue.' },
    ],
  },
  {
    version: '4.0.4',
    items: [
      {
        icon: 'file',
        title: 'Statements open again',
        text: 'Importing a PDF was failing part way through and leaving the check page empty. Fixed.',
      },
      {
        icon: 'lock',
        title: 'A wrong password now says so',
        text: 'If the password does not open the statement, Kawach tells you instead of going quiet.',
      },
      {
        icon: 'accounts',
        title: 'Account rows line up',
        text: 'Everything under an account now starts where its name starts, and the line under the name is no longer cut off mid-word.',
      },
      {
        icon: 'history',
        title: 'The six-month chart reads properly',
        text: 'Bars, labels and the in and out keys are laid out correctly, and what you kept month by month opens underneath.',
      },
    ],
  },
  {
    version: '4.0.3',
    items: [
      {
        icon: 'summary',
        title: 'Summary shows the shape of your money',
        text: 'How much of the month is already committed, when your spending actually happens, and how much of what you hold is already owed on cards.',
        guide: [{ view: 'summary', target: '.summary-viz, .summary-insight', text: 'Each drawing is made from the same figures as the number above it.' }],
      },
      {
        icon: 'accounts',
        title: 'Accounts opens with what you can do',
        text: 'Import, add and reorder are at the top now, with a ring showing how your money is split across accounts.',
        guide: [{ view: 'accounts', target: '.accounts-actions--top, .alloc', text: 'Every slice is an account you can spend from. Money put away is counted apart.' }],
      },
      {
        icon: 'inbox',
        title: 'An entry the statement does not show can wait for the next bill',
        text: 'It stays where it is unless you move it, and moving it re-dates the entry you already have instead of making a second one.',
      },
      {
        icon: 'history',
        title: 'History fits more on the screen',
        text: 'Tighter rows, and the six-month chart no longer runs off the edge.',
      },
    ],
  },
  {
    version: '4.0.2',
    items: [
      {
        icon: 'wallet',
        title: 'Money arrives when it arrives',
        text: 'Anything dated ahead - a salary, a payment you logged for next week - no longer counts in your bank balance until the day comes.',
        guide: [{ view: 'summary', target: '.bank-card, .hero-under', text: 'In bank is what is there today. Money still to come is counted separately, after salary and bills.' }],
      },
      {
        icon: 'summary',
        title: 'The drawing says what the figure says',
        text: 'If your spending is under pace but the bank still cannot cover what is owed, the note under the chart now says so too.',
      },
    ],
  },
  {
    version: '4.0.1',
    items: [
      {
        icon: 'alert',
        title: 'It tells you when the money is not really there',
        text: 'A new month gives you a fresh budget, but if the bank cannot cover what is still owed, the top of Summary now says so instead of offering you a daily amount.',
        guide: [{ view: 'summary', target: '.hero-status, .bank-card', text: 'The line under the figure and the box below it now agree. If one says you are short, so does the other.' }],
      },
      {
        icon: 'clock',
        title: 'The bank check looks one payday ahead, always',
        text: 'It used to quietly look two months ahead once your card statement cut, which made things look better than they were.',
      },
    ],
  },
  {
    version: '4.0',
    items: [
      {
        icon: 'summary',
        title: 'One Kawach',
        text: 'All six screens are built the same way now: the answer first, big, then the detail under it.',
      },
      {
        icon: 'accounts',
        title: 'Accounts is a list, not a pile of cards',
        text: 'One line per account, with the bank beside it and the balance on the right.',
        guide: [{ view: 'accounts', target: '.account-group, .k-hero', text: 'Everything you have, added up at the top. Tap any account for its latest payments.' }],
      },
      {
        icon: 'plan',
        title: 'Tap a commitment to change it',
        text: 'The whole line opens it now, so there is no small pencil to aim at.',
        guide: [{ view: 'plan', target: '.plan-row__main, .plan-sums', text: 'Tap the line to edit. Where the budget comes from is its own panel, under the figure.' }],
      },
      {
        icon: 'coach',
        title: 'Coach reads like the rest',
        text: 'Same panes, same type. It still works everything out on this phone and sends nothing anywhere.',
      },
      {
        icon: 'check',
        title: 'Easier to tap, easier to read',
        text: 'Small buttons have a bigger reach than they look, and everything was checked on a narrow phone and in daylight.',
      },
    ],
  },
  {
    version: '3.3.1',
    items: [
      {
        icon: 'summary',
        title: 'A lit room, not a black screen',
        text: 'Every surface is a pane with a little light behind it, and the charts are drawn in light.',
      },
    ],
  },
  {
    version: '3.3',
    items: [
      {
        icon: 'flag',
        title: 'Must be paid, or set aside',
        text: 'Rent and an EMI have a day. Groceries and Amazon Pay are money you keep back, and are never late.',
        guide: [{ view: 'plan', target: '.type-field, #plan-add-btn', text: 'Every commitment is one or the other. Set aside is yours to spend, or not.' }],
      },
      {
        icon: 'wallet',
        title: 'What you kept back, still there',
        text: 'Summary shows what is left of the money you set aside, instead of it quietly disappearing.',
        guide: [{ view: 'summary', target: '#set-aside-stat, .hero-under', text: 'When money you set aside is still unspent, it shows here. Tap it for the list.' }],
      },
      {
        icon: 'history',
        title: 'History opens with the month',
        text: 'What you kept, big, with money in and money out under it.',
        guide: [{ view: 'transactions', target: '#hist-hero', text: 'In minus out. Red means the month ate into what you had.' }],
      },
      {
        icon: 'add',
        title: 'The amount you are adding is the big number',
        text: 'Add is one number, so it is written like one.',
      },
      {
        icon: 'summary',
        title: 'The same look on every screen',
        text: 'Plan, Accounts, History and Coach now read like Summary: one answer, then the detail.',
      },
    ],
  },
  {
    version: '3.2',
    items: [
      {
        icon: 'summary',
        title: 'A new look, all through',
        text: 'One big figure answers the screen, and everything else waits behind a tap.',
      },
      {
        icon: 'summary',
        title: 'Summary draws how the month has gone',
        text: 'The solid line is your spending day by day; the dotted one is an even pace.',
        guide: [{ view: 'summary', target: '.hero .chart-block', text: 'Above the dotted line means you are ahead of an even pace for today.' }],
      },
      {
        icon: 'plan',
        title: 'Your month as one bar',
        text: 'What must go out, what can flex, and what is left, in the colours the rows use.',
        guide: [{ view: 'plan', target: '.committed-bar', text: 'Blue must go out, purple can flex, green is your budget.' }],
      },
      {
        icon: 'history',
        title: 'Six months, in against out',
        text: 'History opens with the last six months, so a heavy one stands out.',
        guide: [{ view: 'transactions', target: '.chart-block', text: 'Money in and money out, month by month.' }],
      },
      {
        icon: 'flag',
        title: 'Month in review ranks where it went',
        text: 'The biggest fact first, with the categories underneath it in order.',
      },
      {
        icon: 'store',
        title: 'How long the money lasts',
        text: 'For a business, Summary shows what the accounts hold against a usual month.',
        for: (p) => p.business,
        guide: [{ view: 'summary', target: '.runway-bar', text: 'What is in the business accounts, measured in months of its own spending.' }],
      },
    ],
  },
  {
    version: '3.1',
    items: [
      {
        icon: 'loan',
        title: 'Loan statements bring their history',
        text: 'Every EMI the statement lists now shows in History.',
      },
      {
        icon: 'flag',
        title: 'What must go out, and what can flex',
        text: 'Mark a commitment you can change; Summary then shows your wiggle room.',
        guide: [{ view: 'plan', target: '#plan-add-btn, .fixed-edit', text: 'Open a commitment and tick "I can change this one" for food, fun and the like.' }],
      },
    ],
  },
  {
    version: '3.0',
    items: [
      {
        icon: 'store',
        title: 'Home and each business, apart',
        text: 'Switch at the top of Summary. Each keeps its own accounts, costs and month.',
        for: (p) => p.business,
        guide: [
          { view: 'summary', target: '.space-toggle', text: 'Home, and each business. What you see everywhere follows this.' },
          { view: 'plan', target: '.common-costs', text: "In a business, Plan is that business's fixed costs." },
        ],
      },
      {
        icon: 'bill',
        title: 'Tick the costs you pay',
        text: 'School fees, insurance, festivals, shop rent: tap one and type the amount.',
        guide: [{ view: 'plan', target: '.common-costs', text: 'Tap one, type your amount. Yearly ones are set aside month by month.' }],
      },
      {
        icon: 'piggy',
        title: 'Goals and your savings',
        text: 'PPF, gold, FDs and the rest, and what a month reaches your goal.',
        guide: [{ view: 'plan', target: '#goal-add-btn, .goal-delete', text: "A goal says what a month gets you there, counting the savings you've added." }],
      },
    ],
  },
  {
    version: '2.1',
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
        text: 'A shop, tiffin or tuition? It gets its own space.',
        guide: [
          { view: 'settings', target: '#add-business-row', text: 'Name the business here to give it its own space.' },
          { view: 'summary', target: '.space-toggle', text: 'Switch between Home and the business here. Each keeps its own accounts and money.' },
        ],
      },
    ],
  },
  {
    version: '2.0',
    items: [
      {
        icon: 'store',
        title: 'Your business on its own',
        text: 'Money in, out and taken home, apart from the house.',
        for: (p) => p.business,
        guide: [{ view: 'summary', target: '.space-toggle', text: 'The business has its own Summary: what came in, went out and is left.' }],
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

// "3.1" > "3.0.1" > "3.0": the parts compare as numbers, a missing one as 0.
const newer = (a, b) => {
  const part = (v, i) => Number(v.split('.')[i] || 0);
  for (let i = 0; i < 3; i++) if (part(a, i) !== part(b, i)) return part(a, i) > part(b, i);
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
// simply noted as seen. Phones from before notes existed last saw 1.10.
export async function showIfUpdated(current, profile, { isNew }) {
  const seen = await lastSeen();
  if (isNew && !seen) return markSeen(current);
  const notes = notesFor(profile, seen || '1.10');
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

