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
    version: '5.1',
    items: [
      {
        icon: 'add',
        title: "Add in the Charts style",
        text: "Add now matches: the amount on a gradient card with Spent or Received beside it, the category you pick lit up, and a gradient Save.",
        guide: [{ view: 'add', target: '.amount-hero', text: "Type the amount here." }],
      },
    ],
  },
  {
    version: '5.0',
    items: [
      {
        icon: 'summary',
        title: "Summary in the new Charts style",
        text: "Summary is the first screen in the Charts style: what is left, with spent, budget and a day beside it and three rings; the month as waves against an even pace, your biggest day marked; this week and each card's dues as columns. The other screens follow.",
        guide: [{ view: 'summary', target: '.waves-card', text: "Spent so far against an even pace, your biggest day marked." }],
      },
    ],
  },
  {
    version: '4.29',
    items: [
      {
        icon: 'eye',
        title: "Pick your colours",
        text: "Kawach now wears the Charts colours: black, pink, violet and mint. In Settings, How it looks, choose from seven colourings, or let it follow your phone's light or dark. The Charts style for every screen, and three more styles, are on the way.",
        guide: [{ view: 'appearance', target: '.look-swatches', text: "Tap a colouring to see the whole app change." }],
      },
    ],
  },
  {
    version: '4.28',
    items: [
      {
        icon: 'settings',
        title: "A shorter Settings, and a simpler back button",
        text: "Settings is now one line per setting, with import history folded away and What's new, Share and Terms on one line. Back takes you to the top of a screen first, then to Summary, then out of the app.",
        guide: [{ view: 'settings', target: '#import-fold', text: "Tap to see and undo imports." }],
      },
    ],
  },
  {
    version: '4.27.1',
    items: [
      {
        icon: 'accounts',
        title: "FD moves are no longer spending",
        text: "Money you move from SBI into your MOD fixed deposit, and back, now counts as moved between your own accounts, not spent. Lines already saved are fixed when the app opens. Payments out of an account you don't spend from, like loan EMIs, no longer show in your category totals or Coach.",
      },
    ],
  },
  {
    version: '4.27',
    items: [
      {
        icon: 'coach',
        title: "Clearer answers on Coach",
        text: "Ask Coach whether you can afford something and the answer now shows how much of what is left it would take, as a bar, with the sums counting in.",
        guide: [{ view: 'coach', target: '.coach-questions', text: "Try: Can I afford this?" }],
      },
    ],
  },
  {
    version: '4.26',
    items: [
      {
        icon: 'history',
        title: "Your month, day by day",
        text: "History now shows a bar for what went out each day, with the biggest day named. Tap a day to jump to it in the list.",
        guide: [{ view: 'transactions', target: '.hist-days', text: "Tap a day to jump to it." }],
      },
    ],
  },
  {
    version: '4.25',
    items: [
      {
        icon: 'plan',
        title: "This month on Plan",
        text: "Plan now shows this month at a glance: each payment that must go out on its day, bright while still to pay, dim once paid, red if late, with today marked. Under it, how much is left of each amount you set aside.",
        guide: [{ view: 'plan', target: '.plan-month', text: "Bright: still to pay. Dim: paid. Red: late." }],
      },
    ],
  },
  {
    version: '4.24',
    items: [
      {
        icon: 'accounts',
        title: "Accounts at a glance",
        text: "Each card's bill line now has a coloured dot: amber when it is due within three days, red when it is overdue, green once paid. Savings say they never count as money to spend. Paying a bill shows your bank balance counting down.",
        guide: [{ view: 'accounts', target: '.bill-when', text: "Amber: due soon. Red: overdue. Green: paid." }],
      },
    ],
  },
  {
    version: '4.23',
    items: [
      {
        icon: 'add',
        title: "Adding a payment, with feedback",
        text: "A pasted bank SMS now lights up each part as it is read. A work cost switched on glows green, and saving one tells you your Left to spend is unchanged. Save shows a tick when it is done.",
      },
    ],
  },
  {
    version: '4.22',
    items: [
      {
        icon: 'summary',
        title: "Summary, as a ring",
        text: "Left to spend now sits inside a ring. The thick arc is how much of your budget is spent, the thin one how much of the month has gone: if the thick arc runs ahead, you are spending faster than the month. The figures under it are one per row.",
        guide: [{ view: 'summary', target: '.hero-ring', text: "Thick arc: budget spent. Thin ring: the month gone." }],
      },
    ],
  },
  {
    version: '4.21',
    items: [
      {
        icon: 'play',
        title: 'A new tour, screen by screen',
        text: 'A faster, fuller tour: Summary, Add, Accounts, Plan, History and Coach in a minute and a half, each showing how to read what is on it.',
        guide: [{ view: 'settings', target: '#watch-tour', text: 'The new tour is here.' }],
      },
    ],
  },
  {
    version: '4.20.3',
    items: [
      {
        icon: 'play',
        title: 'The tour opens like the app',
        text: 'The Kawach logo in the tour now draws itself exactly as it does when you open the app.',
      },
    ],
  },
  {
    version: '4.20.2',
    items: [
      {
        icon: 'play',
        title: 'The tour is a video now',
        text: 'The tour plays as a sharp, smooth video on every phone, instead of being drawn while you watch. It needs an internet connection to play.',
      },
    ],
  },
  {
    version: '4.20.1',
    items: [
      {
        icon: 'play',
        title: 'The tour plays smoothly',
        text: 'The one-minute tour no longer stutters: your phone now moves it with its graphics chip instead of redrawing every frame.',
      },
    ],
  },
  {
    version: '4.20',
    items: [
      {
        icon: 'play',
        title: 'The tour, remade',
        text: 'A new one-minute film of Kawach: what is left to spend worked out in front of you, a card bill paid from your bank, and a work cost set aside until your employer pays it back. It plays without internet, wide on a computer and tall on a phone.',
        guide: [{ view: 'settings', target: '#watch-tour', text: 'Watch the new tour here.' }],
      },
    ],
  },
  {
    version: '4.19',
    items: [
      {
        icon: 'play',
        title: 'A new one-minute tour',
        text: 'The tour now shows the app as it is today: what is left to spend, paying a card bill, and marking a work cost your employer pays back. It is drawn by the app itself, so it plays without internet and you can pause it or drag to any moment.',
        guide: [{ view: 'settings', target: '#watch-tour', text: 'The tour is here whenever you want to watch it again.' }],
      },
    ],
  },
  {
    version: '4.18.1',
    items: [
      {
        icon: 'check',
        title: 'Upcoming clears as you pay',
        text: 'The Upcoming list on Summary now drops what is already paid or skipped this month, shows only what is left of a part payment, and marks anything past its date as late. When everything for the month is done, it goes.',
        guide: [{ view: 'summary', target: '#upcoming-section', text: 'Upcoming now shows only what is still to pay this month.' }],
      },
    ],
  },
  {
    version: '4.18',
    items: [
      {
        icon: 'tag',
        title: 'Money you will be paid back is not money you spent',
        text: 'A work cost you mark as Reimbursable no longer comes off what you can spend. It is shown as owed back by your employer, and when the refund arrives you mark it and the owed amount comes down. It adds no spending room, because the cost never took any.',
        guide: [{ view: 'summary', target: '.summary-owed', text: 'Owed back by employer: what you are still waiting to be paid back for work.' }],
      },
      {
        icon: 'alert',
        title: 'Two figures when the bank looks short',
        text: 'Under “after salary and bills” the bank card now also says what it would read if your employer pays back what is owed. The cautious figure stays on top. If a refund is still not back after its card’s statement date, it says so.',
      },
      {
        icon: 'summary',
        title: 'This month’s card spending was too low',
        text: 'A card payment towards a commitment made at the end of last month was being taken off this month’s card spending, though it was never in it. That made this month look cheaper than it was, and on the first days of a month it could even go below nothing. Fixed.',
      },
    ],
  },
  {
    version: '4.17.3',
    items: [
      {
        icon: 'file',
        title: 'A fuller diagnostic report',
        text: 'The report you can save from Settings now shows how the bank check was worked out, the work-cost and next-month flags, and what is left of each flexible commitment. Names and numbers are still hidden.',
      },
    ],
  },
  {
    version: '4.17.2',
    items: [
      {
        icon: 'summary',
        title: 'The opening lines up with Android’s',
        text: 'The shield on the opening now sits exactly where Android’s icon was, at the same size, so the hand-over no longer shows two shields one above the other.',
      },
    ],
  },
  {
    version: '4.17.1',
    items: [
      {
        icon: 'summary',
        title: 'One opening, not two',
        text: 'Android shows Kawach’s icon while the app starts. The opening now begins as that same icon, in the same place, and becomes the glowing shield from there, instead of going dark and drawing a different one.',
      },
      {
        icon: 'alert',
        title: 'Updates arrive on their own',
        text: 'Kawach now checks for a new version every time you come back to it, not only when it restarts. When one is waiting as you open the app, the opening stays a moment while it downloads and you land straight in the new version.',
      },
    ],
  },
  {
    version: '4.17',
    items: [
      {
        icon: 'summary',
        title: 'A smoother opening',
        text: 'The shield now draws itself in, the rupee is written onto it, and the name settles in underneath before everything fades into the app. The old one cut out instead of fading, and showed three stray dots before the rupee appeared.',
      },
    ],
  },
  {
    version: '4.16.1',
    items: [
      {
        icon: 'alert',
        title: 'A paid bill is no longer counted again',
        text: 'If you tied a payment to a commitment, the bank check still listed that commitment as unpaid, so the same rent came off your bank twice and the shortfall looked far bigger than it was. The check now follows what you told it, including “Not this”.',
      },
      {
        icon: 'summary',
        title: 'Summary says what is true when the bank is short',
        text: 'A red headline over a barely touched budget used to read “almost all used”. It now says the bank is short. A card bill of a few paise no longer shows as an unpaid bill either.',
      },
      {
        icon: 'file',
        title: 'Payments in the order they happened',
        text: 'Older payments are ordered by when they were saved, an alert keeps the time it arrived, and changing a payment no longer moves it to the top of its day. Open a payment, then Edit, to set its Time.',
        guide: [{ view: 'transactions', target: '.hist-main', text: 'Tap a payment, open Edit, and use Time to put it where it belongs in the day.' }],
      },
    ],
  },
  {
    version: '4.16',
    items: [
      {
        icon: 'summary',
        title: 'Go back to last month from Summary',
        text: 'The arrows at the top of Summary step back through the months, so what you spent on the 30th is still there on the 1st. A finished month shows its Spent and Left to spend as they stood when it closed. Summary always opens on this month.',
        guide: [{ view: 'summary', target: '.summary-month', text: 'Tap the arrow to see a finished month. This month always opens first.' }],
      },
      {
        icon: 'card',
        title: 'Paying a card bill takes it from an account',
        text: 'Mark bill paid now asks which account the money came from and takes the exact amount out of it, paise included, so your balance and the bill agree. Mark unpaid puts it back. Pasting the bank’s message is optional.',
        guide: [{ view: 'accounts', target: '.bill-pay-open', text: 'Tap Mark bill paid, choose the account it came from, and Confirm.' }],
      },
      {
        icon: 'tag',
        title: 'Work costs you get paid back',
        text: 'Mark a payment Reimbursable (Work) when you add or edit it, and mark the money coming back as settling it. Summary shows what your employer still owes you until it is paid. The money back counts in the month it arrives, and past months stay as they were.',
        guide: [{ view: 'add', target: '.k-add-more > summary', text: 'Under More: Reimbursable (Work) for a cost, or Settles a reimbursement for the money coming back.' }],
      },
      {
        icon: 'alert',
        title: 'Rent paid early for next month',
        text: 'Paid rent or an EMI on the 30th for next month? Choose its commitment and switch on Apply to next month’s commitments. It is not counted against the month ending, and the new month already knows it is paid.',
        guide: [{ view: 'add', target: '.k-add-more > summary', text: 'On the last two days of a month, More offers Apply to next month’s commitments once you choose the commitment.' }],
      },
      {
        icon: 'summary',
        title: 'Plainer words for your bank cash',
        text: 'The chart on Summary now says Available bank cash and Reserved for card bills. Card bills your bank cash cannot cover are said on a line of their own, and a bill of a few paise no longer shows up at all.',
      },
      {
        icon: 'card',
        title: 'Bank alerts land on the right card',
        text: 'An alert now goes to the account whose last four digits it names, even if you once chose a different one for those digits. Messages that say CC, or show a long masked number, are read too, and an amount is never mistaken for card digits.',
      },
      {
        icon: 'file',
        title: 'Latest payment first, within a day',
        text: 'On History, payments on the same day now run latest first. Older ones from before this version keep a steady order but have no time to sort by.',
      },
    ],
  },
  {
    version: '4.15.1',
    items: [
      {
        icon: 'alert',
        title: 'Which month each commitment belongs to',
        text: 'Your commitments are now in two groups: what runs by the calendar month from your bank, and what runs by the card cycle. The card group says the dates it covers and that it is billed next month - so the days after your statement day cannot read like spare room when the bill has not arrived yet.',
        guide: [{ view: 'summary', target: '#commitments-fold', text: 'From your bank runs 1st to month end. On your cards runs from the day after your statement day.' }],
      },
    ],
  },
  {
    version: '4.15',
    items: [
      {
        icon: 'card',
        title: 'A card allowance follows the card, not the calendar',
        text: 'Spend on entertainment after your statement day and it goes on next month’s bill - so it now comes out of next month’s entertainment, not what is left of this month’s. What you can spend overall still counts every payment the day you make it.',
        guide: [{ view: 'plan', target: '.tracker-row, .commitment-row', text: 'A set-aside on a card now runs from the day after your statement day to the next one.' }],
      },
      {
        icon: 'tag',
        title: 'Any card spends the allowance',
        text: 'An allowance set against one card only counted spending on that card, so paying with a different one left it sitting there untouched. Entertainment is entertainment whichever card you used.',
      },
    ],
  },
  {
    version: '4.14.4',
    items: [
      {
        icon: 'summary',
        title: 'The bank breakdown is one card again',
        text: 'Opening it drew a second card inside the first, darker than the one holding it and with its own edge down the side. It is a plain list now, inside the one card it belongs to.',
      },
    ],
  },
  {
    version: '4.14.2',
    items: [
      {
        icon: 'file',
        title: 'Terms of use',
        text: 'Plain words on what Kawach is and is not: a tool and not financial advice, figures that can be wrong and are worth checking against your bank, and the fact that nobody can recover your data if you lose the phone or forget the passphrase. In Settings, beside the privacy policy.',
      },
    ],
  },
  {
    version: '4.14.1',
    items: [
      {
        icon: 'file',
        title: 'The privacy policy is in the app now',
        text: 'It was only ever linked from the invite page, which you never see again once Kawach is installed. It sits in Settings under More, and its own link brings you back to the app rather than to the invite page.',
      },
    ],
  },
  {
    version: '4.14',
    items: [
      {
        icon: 'lock',
        title: 'The browser now enforces the promise',
        text: 'Kawach has always kept your money on your phone by being careful. It now tells the browser to allow it only four places to reach - GitHub and Google, for the backups you switch on, and itself - so nothing could send your statements anywhere else even if it tried.',
      },
      {
        icon: 'key',
        title: 'A backup file cannot tie the app in knots',
        text: 'A backup says how much work opening it should take, and that was believed without question. A made-up file could have named a number big enough to freeze the app before it had even checked the passphrase.',
      },
    ],
  },
  {
    version: '4.13.1',
    items: [
      {
        icon: 'eye',
        title: 'Nothing grabs at your text now',
        text: 'Pressing on a figure or a line of writing used to select it and throw up Copy, Web search and a dictionary card over the screen. Only the boxes you type into do that now.',
      },
      {
        icon: 'summary',
        title: 'Two things on Summary that sat on top of each other',
        text: 'A note about an estimated card bill was half hidden under the card below it, and anything scrolling past could be read straight through the title at the top.',
      },
    ],
  },
  {
    version: '4.13',
    items: [
      {
        icon: 'tag',
        title: 'See what it guessed, on the row',
        text: 'The category it picked for each imported payment now shows beside the description instead of only inside a dropdown. Tap it to change it, and anything it did not recognise carries a question mark rather than a wrong guess.',
        guide: [{ view: 'accounts', target: '.import-row .ir-cat-mark, #import-paste-toggle', text: 'Every row on an import shows its category here. Tapping the mark opens the list for that row.' }],
      },
      {
        icon: 'file',
        title: 'Import rows fit a small phone',
        text: 'On a narrow screen the date field was taking so much of the row that the description was squeezed to a sliver. It now has a line of its own.',
      },
    ],
  },
  {
    version: '4.12',
    items: [
      {
        icon: 'tag',
        title: 'It knows the shops before you teach it',
        text: 'Kawach already learned a shop from what you filed it under, but only after you had filed something. It now arrives knowing nearly eighty of them - Swiggy, Blinkit, Amazon, Uber, Airtel and the rest - so the very first statement you bring in is mostly sorted. Anything you change still wins, for good.',
        guide: [{ view: 'transactions', target: '#txn-needs, .txn-row', text: 'Anything it did not recognise is left blank on purpose, waiting for you rather than guessed at.' }],
      },
    ],
  },
  {
    version: '4.11.1',
    items: [
      {
        icon: 'phone',
        title: 'Reads properly on a small phone',
        text: 'On a narrow screen at the largest text, the bottom bar cut "Coach" in half and this very screen pushed its own button off the side. Both fit now, and the app says "payment" everywhere it used to say "transaction".',
      },
    ],
  },
  {
    version: '4.11',
    items: [
      {
        icon: 'image',
        title: 'A new tour, twenty seconds and silent',
        text: 'The old one was eighty-two seconds of setup with a soundtrack. The new one shows where a salary actually goes, and what Kawach says when a month goes wrong. No sound at all, and a quarter the size to load.',
      },
    ],
  },
  {
    version: '4.10',
    items: [
      {
        icon: 'lock',
        title: 'Kawach opens with its shield',
        text: 'The app used to sit blank for a moment while it started. Now the shield draws itself and the rupee is written on it, carrying straight on from the icon you tapped.',
      },
    ],
  },
  {
    version: '4.9.1',
    items: [
      {
        icon: 'sync',
        title: 'The update banner that would not go away',
        text: 'If a download was interrupted, Kawach kept saying a new version was ready and Reload did nothing about it, because the version it meant had never finished arriving. It now waits until the new version is really there.',
      },
    ],
  },
  {
    version: '4.9',
    items: [
      {
        icon: 'plan',
        title: 'See the payments behind a duplicate',
        text: 'A pair on Plan now offers to show every payment of that amount, across every month. One a month means the cost is on your list twice; two a month means they are two real costs.',
        guide: [
          { view: 'plan', target: '.dupe-see', text: 'Only you can tell two costs of the same size apart, so this takes you to the payments themselves.' },
          { view: 'transactions', target: '#txn-search', text: 'Searching here now finds an amount as well as words, because a bank line rarely says what it cost.' },
        ],
      },
    ],
  },
  {
    version: '4.8.1',
    items: [
      {
        icon: 'plan',
        title: 'Removing a duplicate now sticks',
        text: 'Removing one Kawach had spotted appeared to do nothing, because it was found again the moment the screen redrew. It stays gone now.',
      },
    ],
  },
  {
    version: '4.8',
    items: [
      {
        icon: 'plan',
        title: 'The same cost, on your list twice',
        text: 'Plan now points out two fixed costs that look like one payment written down twice, and lets you drop one. A cost counted twice makes what you can spend look smaller than it is.',
        guide: [{ view: 'plan', target: '.dupe-note', text: 'Each pair is shown with both wordings, so you can tell which to keep.' }],
      },
    ],
  },
  {
    version: '4.7.3',
    items: [
      {
        icon: 'sync',
        title: 'Updates arrive without the flicker',
        text: 'Taking a new version could load the app several times over before it settled. It takes it once now.',
      },
    ],
  },
  {
    version: '4.7.2',
    items: [
      {
        icon: 'file',
        title: 'Saving a diagnostic report works again',
        text: 'Settings, "Save diagnostic report" was failing with an error instead of saving the file. It works now.',
      },
    ],
  },
  {
    version: '4.7',
    items: [
      {
        icon: 'summary',
        title: 'Summary says it in fewer words',
        text: 'Spent and budget are one line now, and the note under the drawing is shorter.',
        guide: [{ view: 'summary', target: '.summary-rows', text: 'One line, so the two figures explain each other.' }],
      },
      {
        icon: 'card',
        title: 'Card and bank spending at a glance',
        text: 'A single bar under the figures shows how much of the month went on cards and how much left the bank.',
      },
    ],
  },
  {
    version: '4.6',
    items: [
      {
        icon: 'summary',
        title: 'Summary now runs the whole month',
        text: 'It used to run from your card statement day, so it showed something like 26 Sep to 25 Oct. It now runs the 1st to the last day, and counts card spending and bank spending over that same month.',
        guide: [{ view: 'summary', target: '.hero', text: 'The period is now the month, so this is what you can spend before the month ends.' }],
      },
      {
        icon: 'card',
        title: 'Card spending counts when you spend it',
        text: 'A card spend made earlier in the month no longer disappears from "spent" when the card is billed. Your card is still billed on its own day, and that day still decides the bill.',
      },
    ],
  },
  {
    version: '4.5',
    items: [
      {
        icon: 'eye',
        title: 'Bigger writing, if you want it',
        text: 'Text size and spacing are now yours to set. Larger text applies everywhere in the app, and buttons stay just as easy to tap.',
        guide: [{ view: 'settings', target: '#go-appearance', text: 'Text size and spacing are at the top. Tap one and the whole app changes.' }],
      },
    ],
  },
  {
    version: '4.4',
    items: [
      {
        icon: 'add',
        title: 'A shorter Add screen, if you want one',
        text: 'Keep the whole form, or just the amount, what it was for and the category, with the date, account and repeats behind one tap.',
        guide: [{ view: 'settings', target: '#go-appearance', text: 'The Add screen is here, with your other choices.' }],
      },
      {
        icon: 'plan',
        title: 'Your fixed costs, in your order',
        text: 'Keep the order you arranged, or put them by the day they are due, or biggest first.',
      },
    ],
  },
  {
    version: '4.3',
    items: [
      {
        icon: 'accounts',
        title: 'Accounts, your way',
        text: 'Show the ring above your accounts, just the list, or keep balances covered until you tap Show - for checking your phone where other people can see it.',
        guide: [{ view: 'settings', target: '#go-appearance', text: 'The Accounts screen is here, with the rest of your choices.' }],
      },
      {
        icon: 'home',
        title: 'Start where you like',
        text: 'Kawach can open on Summary, on Add, or on Accounts.',
      },
      {
        icon: 'wallet',
        title: 'The app icon should catch up',
        text: 'Your phone was being told about the old icon even after it changed. If your home screen still shows the old green shield, removing Kawach and adding it again will fix it for good.',
      },
    ],
  },
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
        guide: [{ view: 'summary', target: '.bank-card, .summary-rows', text: 'In bank is what is there today. Money still to come is counted separately, after salary and bills.' }],
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
        guide: [{ view: 'summary', target: '#set-aside-stat, .summary-rows', text: 'When money you set aside is still unspent, it shows here. Tap it for the list.' }],
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

