/* What the demo's guide says, step by step (5.41). Plain words, one thing at a time: a sentence of at
 * most fourteen words, and under it one line of why. The words belong to the owner; change them here.
 *
 * A step: { view, target, say, sub, ask, done, doneSay, doneView, doneTarget }
 *   view      the screen it is about (app.js names), opened for you
 *   target    what to light up: the first selector that exists on that screen
 *   ask       true when the person is asked to do something; the step then waits for it (`done`)
 *   done      (state) => true once they have, state: { saved, asked }
 *   doneSay / doneView / doneTarget   what is said and shown once they have */

const FIGURE = '[data-roll-kind="left"], .hero-amount';

export const STEPS = [
  {
    view: 'summary',
    target: FIGURE,
    say: 'This is what you can still spend this month.',
    sub: 'It is worked out after rent, bills and money you keep aside.',
  },
  {
    view: 'add',
    target: '.amount-field',
    ask: true,
    say: 'Put in a coffee for 120 rupees, then press Save.',
    sub: 'Then you will see what it did.',
    done: (s) => s.saved,
    doneView: 'summary',
    doneTarget: FIGURE,
    doneSay: 'There it is. Your coffee is already counted.',
    doneSub: 'The number came down by what it cost.',
  },
  {
    view: 'transactions',
    target: '.hist-row .hist-main',
    ask: true,
    say: 'Every payment is here. Tap one to open it.',
    sub: 'Pick what it was for, and Kawach remembers.',
    done: () => Boolean(document.querySelector('.hist-row.open')),
    doneSay: 'That is how you sort a payment.',
    doneSub: 'Next time the same shop is sorted for you.',
  },
  {
    view: 'plan',
    target: '#view-container .totals-card',
    say: 'Rent and bills go here, and money kept aside for food or fuel.',
    sub: 'Nothing is counted twice.',
  },
  {
    view: 'accounts',
    target: '.account-block, .account-group, #view-container .totals-card',
    say: 'Your bank and your cards, in one place.',
    sub: 'Each card shows what is due.',
  },
  {
    view: 'inbox',
    target: '#inbox-paste',
    ask: true,
    say: 'Banks send messages. Press "Try an example message".',
    sub: 'Watch Kawach read it and fill in the payment.',
    done: () => Boolean(document.querySelector('.alert-card')),
    doneSay: 'It read the amount, the shop and the day.',
    doneSub: 'You only check it and press Save.',
  },
  {
    view: 'coach',
    target: '.coach-q',
    ask: true,
    say: 'Ask a question. Try "Can I afford this?"',
    sub: 'Kawach answers from the money you have left.',
    done: (s) => s.asked,
    doneSay: 'It works from your own numbers.',
    doneSub: 'No guessing and no advice from strangers.',
  },
  {
    view: 'settings',
    target: '.demo-card',
    say: 'Your money stays on this phone.',
    sub: 'No account, and nothing is sent anywhere.',
  },
];
