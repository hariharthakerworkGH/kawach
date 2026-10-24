import { get, put } from './db.js';
import { icon } from './icons.js';
import { runGuide } from './guide.js';
import { holdFocus } from './overlay.js';

// What each version brought, told once after the update, and kept in
// Settings. Every item is one line; one with a `guide` has a "Show me" that
// walks through it on the real screen (js/guide.js). `for` keeps an item to
// the people it concerns - a pensioner isn't told about GST.
//
// Add a version at the top with every release that changes something a
// user would notice. Plain words, no version jargon.

const NOTES = [
  {
    version: '7.3',
    items: [
      {
        icon: 'check',
        title: "Summary fills the screen",
        text: "Latest payments now show as many rows as fit your screen (three at least, up to eight), instead of leaving an empty space. The sun and moon no longer sit on the title.",
        guide: [{ view: 'summary', target: '.lg-act', text: "Latest shows more rows on a taller phone. Tap one to see where it was paid from." }],
      },
    ],
  },
  {
    version: '7.2.1',
    items: [
      {
        icon: 'check',
        title: "Shield water fixed",
        text: "The water in the shield no longer shows as a block while a screen refreshes (pull to refresh, Mark paid and the like).",
      },
    ],
  },
  {
    version: '7.2',
    items: [
      {
        icon: 'check',
        title: "Every rupee counted",
        text: "A payment dated later this month now comes off Left to spend as soon as you record it. A payment opened in History can be moved to another account. The ring's amount fits its circle, the opened payment is laid out properly, the CA file now follows the business books (taken home, expenses, interest split), and the water in the shield no longer spills while you pull to refresh.",
        guide: [{ view: 'transactions', target: '.hist-row', text: "Open a payment to change its amount, account, category or day." }],
      },
    ],
  },
  {
    version: '7.1',
    items: [
      {
        icon: 'file',
        title: "A file your CA can use",
        text: "For your CA now follows how a return is filled: money in by kind (salary, interest, dividends, rent), payments that may be deductions with the proof to ask for, loan interest, tax you paid, rent, a business month by month, balances on the last day, and a ledger ready for accounting software. Pulling down to refresh also looks for a new version.",
        guide: [{ view: 'settings', target: '#ca-xlsx', text: "Pick the year, tap Excel, and hand the file over with your Form 16 and the AIS from the tax portal." }],
      },
    ],
  },
  {
    version: '7.0',
    items: [
      {
        icon: 'sunmoon',
        title: "A new look: Ledger",
        major: true,
        text: "Every screen redrawn: a living sky with a real sun and moon behind the title, one calm card per job, a flat dock with Add in the middle, and a single-step Add sheet.",
        guide: [{ view: 'summary', target: '.lg-hero', text: "The sky follows your real time of day; tap a row below to see what is left, due or done." }],
      },
    ],
  },
  {
    version: '5.93',
    items: [
      {
        icon: 'palette',
        title: "How it looks fits one screen",
        text: "Where you are, text size, motion, which screen Kawach opens on, and the order of lists, in one card. The colours are chosen with the half-moon button at the top of Summary.",
      },
    ],
  },
  {
    version: '5.92',
    items: [
      {
        icon: 'check',
        title: "Imports can always be taken back",
        text: "A statement import that stops half way (the app closed, the phone slept) can now still be taken back, and taking an import back is much quicker for a big statement. Inside, about 1,900 lines of unused code from retired looks are gone; nothing you see changes.",
      },
    ],
  },
  {
    version: '5.91',
    items: [
      {
        icon: 'check',
        title: "Smoother screens, and the right greeting",
        text: "Changing month or screen no longer shows an empty screen for a moment, and Summary no longer replays its arrival when it redraws. At night Kawach now says Good night, not Good morning.",
      },
    ],
  },
  {
    version: '5.90',
    items: [
      {
        icon: 'palette',
        title: "One look, three colour choices",
        text: "Kawach now has one look, Haven. How it looks is down to Colours (Follow the sun, Always day, Always night), Where you are, Text size, Motion and When Kawach opens; the old looks, other colour schemes and layout options are gone, and anyone who used them moves to Haven once.",
      },
    ],
  },
  {
    version: '5.89.3',
    items: [
      {
        icon: 'file',
        title: "Statements from any bank read better",
        text: "A bank statement Kawach has no special reader for is now read more reliably: credit, debit and balance columns are told apart even when an empty column prints as a 0 or a dash, and a statement with a balance column is never mistaken for a credit card.",
      },
    ],
  },
  {
    version: '5.89.2',
    items: [
      {
        icon: 'sun',
        title: "A colour button, and bills paid on a card",
        text: "The colour button is back at the top of Summary: follow the sun, always day or always night. Anyone stuck on one look by the old button now follows the sun. A planned bill paid on a credit card, like Netflix, is the plan's money and no longer comes off Left to spend a second time. Also: a broken figure shows a dash, a too-big amount says so, and a file that is not a statement says so plainly.",
      },
    ],
  },
  {
    version: '5.89',
    items: [
      {
        icon: 'sun',
        title: "The sky is the real sun and moon",
        text: "Every screen now has the real sun and moon behind its top: the sun rises and sets where you are, the moon has its true shape, and Kawach turns light at sunrise and dark at sunset by itself. Pick your city or use your location in Settings, How it looks.",
        guide: [{ view: 'appearance', target: '#where-city', text: "Pick your city, or use your location, so the sun and moon sit where they really are." }],
      },
    ],
  },
  {
    version: '5.88.1',
    items: [
      {
        icon: 'edit',
        title: "Easier to find: edit an account",
        text: "Every account card has an Edit pencil that takes you to its form, with Delete in red at the bottom. The bell on Summary is gone: a red dot on + shows when a bank message is waiting, and its number sits on Paste SMS.",
      },
    ],
  },
  {
    version: '5.88',
    items: [
      {
        icon: 'shield',
        title: "Check an import, take it back",
        text: "Before you save a statement, Kawach says if it may have read it wrong and shows a Download a report button. After saving you can undo the import for a week, from the Done screen or Settings.",
        guide: [{ view: 'import', target: '#import-file', text: "Saved a statement that looks wrong? Undo it on the Done screen, or in Settings, for a week." }],
      },
    ],
  },
  {
    version: '5.87.1',
    items: [
      {
        icon: 'accounts',
        title: "SBI statements read right",
        text: "SBI's all-accounts statement is read properly now: your savings account's payments, with money in and out the right way round, and no extra card made. A payment that two downloads date a day apart is counted once.",
      },
    ],
  },
  {
    version: '5.87',
    items: [
      {
        icon: 'accounts',
        title: "SBI alerts, and your MOD",
        text: "SBI's EMI alerts are read now: the account, the amount, the name and the balance, and they go to your SBI account instead of asking you. A MOD counts with the account it sits under, as one balance you can use as needed.",
      },
    ],
  },
  {
    version: '5.86',
    items: [
      {
        icon: 'bill',
        title: "Bills that are due once",
        text: "Add a payment that does not repeat, like a school fee, a repair or a supplier's invoice, with its date. It is held out of Left to spend in the month it is due, shows in the months ahead, and ends by itself when you record the payment.",
        guide: [{ view: 'plan', target: '#plan-bills', text: "Add a bill that is due once. It is held out of Left to spend in its month, and a reminder comes before it is due." }],
      },
    ],
  },
  {
    version: '5.85',
    items: [
      {
        icon: 'summary',
        title: "Spending shows in the shield",
        text: "When you save an expense, the amount now rides the water down the shield, so even a small one is seen leaving. The dotted line on the shield is gone: whether you are ahead is already said in words and in the month chart.",
        guide: [{ view: 'summary', target: '.hv-vault .tide', text: "The water is what is left of your month. Save an expense and its amount rides the water down." }],
      },
    ],
  },
  {
    version: '5.84',
    items: [
      {
        icon: 'file',
        title: "Your insurance, in one place",
        text: "Add your health, life or vehicle policy once: its number, who is covered, the nominee, the helpline, and a warning before a premium is due. Plan now shows the whole year ahead, and you can send your family a one-page summary.",
        guide: [{ view: 'plan', target: '#plan-policies', text: "Add a policy once. It keeps its details, tells you when a premium is due, and can make a one-page summary for your family." }],
      },
    ],
  },
  {
    version: '5.83',
    items: [
      {
        icon: 'play',
        title: "A tour that tells the story",
        text: "The tour is a story now: from a balance that is not yours to spend to the one number that is, then each part of the app in order, and what stays private.",
      },
    ],
  },
  {
    version: '5.82',
    items: [
      {
        icon: 'play',
        title: "A new tour",
        text: "The tour is new: a minute, with sound, from your safe-to-spend number to keeping everything on your phone.",
      },
    ],
  },
  {
    version: '5.80',
    items: [
      {
        icon: 'piggy',
        title: "Card spending counts against what you set aside",
        text: "A set-aside with no account chosen is now used by card purchases too, as well as bank and cash. Kept back and Left to spend now agree, and the same groceries are no longer taken out twice.",
      },
    ],
  },
  {
    version: '5.78',
    items: [
      {
        icon: 'piggy',
        title: "Kept back, on Summary",
        text: "Summary now says how much of what you set aside is still there, in one slim line under Left to spend. Tap it to see what is left of each.",
        guide: [{ view: 'summary', target: '.hv-kept', text: "Tap Kept back to see what is left of each thing you set aside." }],
      },
    ],
  },
  {
    version: '5.77.1',
    items: [
      {
        icon: 'check',
        title: "Back works as it should",
        text: "The round back arrow on Coach no longer bounces you between two screens, and the inbox opens faster after you paste many alerts.",
      },
    ],
  },
  {
    version: '5.77',
    items: [
      {
        icon: 'card',
        title: "Cards that react to every payment",
        text: "A card payment now lowers the card at once, even after its bill was marked paid. Tap a card to see its own payments, and back brings you to the same card. Tapping a payment lands on it. Summary and Accounts always agree.",
        guide: [{ view: 'accounts', target: '.hv-dk', text: "Tap the front card to see its payments." }],
      },
    ],
  },
  {
    version: '5.76',
    items: [
      {
        icon: 'check',
        title: "Card payments you can trust",
        text: "A card payment can now say whether it paid the last bill or the spending since, so the card's figure drops at once. Every payment on Accounts is in time order, says what it was (card bill paid, payment received), and opens to edit.",
      },
    ],
  },
  {
    version: '5.75',
    items: [
      {
        icon: 'bank',
        title: "Money that moves shows at both ends",
        major: true,
        text: "Saving a card payment alert now asks which account it was paid from and takes it out of that account. Cards on Accounts show what you owe now and drop when you pay. Save only saves once, and slow connections no longer hang.",
      },
    ],
  },
  {
    version: '5.74.1',
    items: [
      {
        icon: 'palette',
        title: "One palette everywhere",
        text: "Coach, Settings, Categories and the in/out chart now use the same calm teal as the rest, and the chart legend matches its bars.",
      },
    ],
  },
  {
    version: '5.74',
    items: [
      {
        icon: 'accounts',
        title: "Swipeable cards, a ring for the month, no zoom",
        major: true,
        text: "Accounts are a stack of cards: swipe one to see the next, with its details below. History shows the month as a ring with an icon on each slice. The app no longer zooms when you pinch, and titles no longer overlap when you change screen.",
        guide: [{ view: 'accounts', target: '.hv-dk', text: "Swipe the front card sideways to bring the next account forward" }],
      },
    ],
  },
  {
    version: '5.73',
    items: [
      {
        icon: 'plus',
        title: "Add is one design, pages are locked",
        text: "The + sheet has two small chips on top, Paste SMS and Import. Pages no longer slide or swipe: use the tab bar.",
      },
    ],
  },
  {
    version: '5.72.3',
    items: [
      {
        icon: 'sun',
        title: "A steadier sky",
        text: "The sky is quieter (no clouds), and the page can no longer slide sideways.",
      },
    ],
  },
  {
    version: '5.72.2',
    items: [
      {
        icon: 'accounts',
        title: "Headings stay steady",
        text: "Section titles like Cards and Bank no longer shrink and grow back when you open an account.",
      },
    ],
  },
  {
    version: '5.72.1',
    items: [
      {
        icon: 'bell',
        title: "Repeat spends are no longer flagged",
        text: "Pasting a bank message warns about a repeat only when the same spend is on the same day, not the day before.",
      },
    ],
  },
  {
    version: '5.72',
    items: [
      {
        icon: 'palette',
        title: "Calmer colours",
        text: "One teal for the charts, quiet icon tiles, amber only for warnings, and little shields for each budget.",
      },
    ],
  },
  {
    version: '5.71',
    items: [
      {
        icon: 'accounts',
        title: "Accounts open calmly",
        text: "An account's name no longer shrinks when you open it, nothing jumps, and several accounts can stay open. Back closes them all.",
      },
    ],
  },
  {
    version: '5.70',
    items: [
      {
        icon: 'shield',
        title: "Back goes home, sky everywhere, water stays in",
        text: "Back closes what is open, then goes to Summary. The sky shows on every page. The shield's water stays inside. The look-back line is gone. Record a run sits under the version in Settings.",
      },
    ],
  },
  {
    version: '5.69',
    items: [
      {
        icon: 'sun',
        title: "A sky that follows the day",
        text: "A small sun and soft glow cross the top of every page by day, with slow clouds; at night a moon, stars and fireflies. It follows the real time.",
      },
    ],
  },
  {
    version: '5.68',
    items: [
      {
        icon: 'list',
        title: "Shorter pages",
        text: "Plan and History take much less scrolling: repeated-cost lists fold away and History rows sit closer.",
      },
    ],
  },
  {
    version: '5.67',
    items: [
      {
        icon: 'accounts',
        title: "Accounts open smoothly",
        text: "Opening and closing an account now glides: no flash, no jumps.",
      },
    ],
  },
  {
    version: '5.66.2',
    items: [
      {
        icon: 'bell',
        title: "Pasted alerts fill in front of you",
        text: "A pasted bank message now fills its fields one by one as each word lands. The list of learned wordings is gone.",
      },
    ],
  },
  {
    version: '5.66.1',
    items: [
      {
        icon: 'shield',
        title: "Accounts tidied",
        text: "Cards open without blank screens, text and bars keep their space, and the top bar stays clear when you scroll.",
      },
    ],
  },
  {
    version: '5.66',
    items: [
      {
        icon: 'check',
        title: "Accounts, fixed",
        text: "Accounts is now what it should have been: each account is one short card, and its bill, facts, loan plan and buttons wait behind a tap. Loans, savings and cash open on a tap too.",
      },
    ],
  },
  {
    version: '5.65',
    items: [
      {
        icon: 'check',
        title: "Cleaner Add, lighter app",
        text: "The + sheet is quieter: the amount first, and one small line under Next to paste a bank message or import a statement. The app is lighter too: unused styles and code were removed.",
      },
    ],
  },
  {
    version: '5.64',
    items: [
      {
        icon: 'sparkle',
        title: "Accounts, rebuilt, and more life",
        major: true,
        text: "Accounts now shows what you hold and what you owe, filter chips (All, Cards, Money, Loans) and one card for each account: a shield that fills for a card's use, a line for a bank balance. Tap a card and it opens in place. Also: budgets as little tanks and where your money went as layers (under More), the figure rolls digit by digit, a pasted bank message flies into its fields, a statement fills a shield while it is read, and duplicate rows merge.",
        guide: [{ view: 'accounts', target: '.hv-hold', text: "What you hold, what you owe, then one card for each account." }],
      },
    ],
  },
  {
    version: '5.63',
    items: [
      {
        icon: 'check',
        title: "Tidier Settings, easier Add",
        text: "The version and Check for updates are now at the top of Settings, in a few words. Your data's safety is a small shield. Settings is much more compact. The + button now offers Paste a bank message and Import a statement at once. The sun and weather behind the header are gone, and tapping the chart no longer draws a box.",
      },
    ],
  },
  {
    version: '5.62',
    items: [
      {
        icon: 'sparkle',
        title: "Today, the way to salary, and night",
        text: "Under More: today as one ring, an arc towards your next salary, and this month beside last month. The chart's dot carries a flag that says how you stand. Day turns to night with a sweep, with fireflies at night, and buzzes now mean different things.",
        guide: [{ view: 'summary', target: '#hv-ins', text: "Today as a ring, the way to salary, this month beside last." }],
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
export const filterNotes = (notes, profile, since = null) => notes.filter((n) => !since || newer(n.version, since))
  .map((n) => ({ ...n, items: n.items.filter((item) => !item.for || item.for(profile)) }))
  .filter((n) => n.items.length);
export const notesFor = (profile, since = null) => filterNotes(NOTES, profile, since);

// What the card shown after an update says: only the major overhauls (an item marked `major`), newest first and never more than
// three, so it is a short card with its button in view. Everything else is still in Settings, in the full list.
export const POPUP_MAX = 3;
export function popupNotes(notes) {
  const items = notes.flatMap((n) => n.items.filter((i) => i.major).map((i) => ({ item: i, version: n.version })));
  items.sort((a, b) => (newer(a.version, b.version) ? -1 : newer(b.version, a.version) ? 1 : 0));
  return items.length ? [{ version: '', items: items.slice(0, POPUP_MAX).map((x) => x.item) }] : [];
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
  const notes = popupNotes(notesFor(profile, seen || '1.10'));
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
      <div class="notes-body">${notes
        .map(
          (n) => `
        ${n.version ? `<p class="notes-version">Version ${n.version}</p>` : ''}
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
        .join('')}</div>
      <button type="button" class="btn-primary notes-close">Got it</button>
    </div>
  `;
  let release = () => {};
  const close = () => {
    document.removeEventListener('keydown', onKey);
    release();
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
  release = holdFocus(backdrop, { initial: '.notes-close' });
}

