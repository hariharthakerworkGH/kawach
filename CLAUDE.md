# Kawach - project brief

Kawach ("shield") is a personal finance app that protects its user's future: a static PWA, vanilla JS ES modules, no build step, no
framework, no server. Hosted on GitHub Pages. All data lives in the browser
(IndexedDB); the only thing that ever leaves the device is a backup or sync file
the user has encrypted with their own passphrase.

Nothing personal belongs in this file - it is published with the app.

Live at https://getkawach.com (GitHub Pages, the `kawach` repository; the
`CNAME` file holds the address). Each user's data belongs to that address:
changing it would leave every installed app empty, so it never changes.
`welcome.html` is the page shared to invite people; `privacy.html` is the
privacy policy (Google and the Play Store require one); `oauth.html` is where
Google's sign-in returns for Drive backups.

## Hard rules

- No analytics, no third-party calls, no external services except, if the
  user turns them on, their own Google Drive (only the hidden appDataFolder,
  scope drive.appdata, via Google's sign-in page - no Google code is loaded;
  js/drive.js) and, for advanced sync, their own secret GitHub Gist. No LLM in
  the app.
- Statement PDFs are parsed in memory and never stored. PDF passwords are used
  once and never saved.
- Sync and backup files are encrypted client side (AES-GCM) with a passphrase the
  user sets: one backup passphrase for Drive backups, backup files and Google
  sync (GitHub sync keeps its own). It is kept in `syncMeta` on the device,
  never synced or put in a backup.
- Never auto-commit parsed rows: always show a review table first.
- If a PDF has no text layer, say so plainly instead of returning empty rows.
- Never silently overwrite a category, amount or day the user set by hand.
- Written for someone who is not a programmer: no jargon on screen, no setup.

## How the money is worked out

`js/free-to-spend.js` is the one calculation every screen reads. Its header
comment is the specification; keep it true.

```
Budget   = monthly income − live fixed commitments (bank + card) − saved each month
Spent    = card spends this month + bank spends this month − commitment payments
Left     = budget − spent
```

Monthly income depends on how money comes in (`incomeType`, js/business.js):
a salary, pension or household money is the amount set on Plan; for a
business owner it is the lowest of the last three months taken home (money
reaching the home accounts from the business, or from outside), and the
owner's estimate of what the house needs until there are three months.
Anyone else can have a business on the side: a salary, pension or household
money plus the lowest of the business's last three months (only money moved
over from its accounts, so a salary landing in the same account is never
counted twice), and nothing from it before then.

**Spaces.** Home is one lane; each business (`businesses` setting) is another.
An account (`account.space`) and a fixed cost (`commitment.space`) belong to
one of them, and Summary, Plan, Accounts, History and Add all follow the
space on screen (the toggle on Summary, the chip beside the title; the choice
is this device's, in localStorage). A business's month is
`businessSpace()`: money in − money out − sent home − fixed costs still due.
Business accounts get business categories (`scope: 'business'`, including the
owner's own). `moneyProfile()` says who someone is, and screens show only
what fits: PF for salaried people, business things for those with a business.

`js/calendar.js` holds the costs Indian homes and shops usually pay (tapped on
Plan, never with a guessed amount) and the tax dates worth knowing (advance
tax and the return for business income, GST when the business is marked
registered) - dates only, Kawach never files or computes tax. `js/goals.js`
holds goals: an amount, a month, and the savings pots it is counted in, with
`goalProgress()` saying what a month gets there. Savings pots carry a
`savingsKind` (PPF, gold, chit fund and the rest) and a value typed in,
because those have no statement to read.

Periods:
- **Spending is the calendar month**, 1st to last day, for cards and bank alike.
  Nothing before the 1st counts, with one exception: a commitment with a set day
  (EMI, rent) paid on salary day at the end of a month belongs to the month
  after. Card spending ran on the card cycle until 4.6, which meant a headline
  reading "26 Sep to 25 Oct" while bank money from the 5th was counted and card
  money from the 10th was not: one month's budget against two windows. The
  statement day is a fact about a bank's paperwork, not about the person - it
  differs per card, and with several cards the latest one decided.
- **The card cycle still decides bills**, because a bill is one cycle's worth:
  `cardPosition` in js/account-metrics.js works that way, and `cycleClose` is
  still when the next statement falls. The statement day comes from imported
  statements when there are any (`statementDay`), not from what was typed in.
- The bank balance never raises the budget. It is a separate check that only warns.
- A commitment is one of two things, asked once on Plan: **must be paid** (rent,
  an EMI, a bill: it has a day and can be late) or **set aside** (groceries,
  fuel, Amazon Pay: money kept back, spent in full, in part or not at all, and
  never late). It is stored in the field the app has always used, `spread`
  (`isSetAside`, js/commitments.js), so every existing record keeps behaving
  as it does. The budget still takes the whole amount out at the start of the
  month either way, which is what keeps "Left to spend" steady; what is left
  of a set-aside is shown on Summary as "Still set aside" rather than
  disappearing.
- Account types: bank, card, cash, savings (FDs - a balance, never spendable) and
  loan. A loan is set up on its own account (amount, rate, EMI, day, the account
  it leaves from) and its EMI becomes a commitment by itself, so it is never also
  typed in on Plan. Money moved between two of your own accounts is a transfer,
  never spending (js/transfers.js), and js/loans.js works out what is still owed.
- js/loans.js also splits each EMI into interest and principal and answers
  "what if I pay more"; js/pf.js holds the EPF rules (12% employee, 12%
  employer less the ₹1,250 pension share, interest on the running balance at
  the rate EPFO declares). A loan whose EMI is already covered by a commitment
  on Plan sets loan.inBudget = false so it is never counted twice.
- An EPFO passbook (js/parsers/epfo-passbook.js) is the truth for a provident
  fund: its opening balance is the anchor, months after it are real
  contributions, and nothing dated on or before the anchor is counted again. It
  also says whether the employer pays into the pension scheme at all, which the
  general rule gets wrong for members who joined after 2014 above the wage cap.

Money is integer paise everywhere. Dates are local `YYYY-MM-DD` strings built with
`isoLocal` - never `toISOString()`, which is a day behind in India.

## Layout

- `js/db.js` IndexedDB, settings, read cache, tombstones for sync.
- `js/free-to-spend.js` the calculation above. `js/account-metrics.js` balances,
  card cycles and bills. `js/commitments.js` commitments and how payments match
  them. `js/duplicates.js` the same payment saved twice.
- `js/parsers/*` statement readers (HDFC, ICICI, SBI savings and loan, payslip,
  EPFO passbook, CSV) + `registry.js`. The SBI savings reader also picks up the
  fixed deposits (MOD) linked to the account; they become a savings account of
  their own. Any other bank's or card's PDF goes to `any-bank.js`, the general
  reader: dated lines with amounts at the end, money in or out settled by the
  running balance (or "Cr" on a card). It also takes over when a bank's own
  reader finds no rows, and its `BANKS` list names every Indian bank for
  setup and for matching accounts. Its review says it was read this way.
  `js/alerts.js` reads bank SMS. `js/sync.js`, `js/backup.js` encrypted transfer.
  Sync goes through a file in the user's Google Drive (`kawach-sync.json`) or
  a GitHub gist; the Google pass lasts an hour, and when it has run out as the
  app opens, app.js renews it once, silently (prompt=none).
- `js/views/*` one file per screen. `js/app.js` routes between them; back
  retraces the screens you opened, and a screen's `onBack()` closes what is
  open on it first. A screen redrawing itself goes through `js/redraw.js`,
  which keeps the scroll position and any open sections.
- Every passphrase box gets a show button, and a passphrase typed twice goes
  red as soon as the two differ (`js/password-field.js`).
- A card's statement day is never typed in: it comes from its statements
  (`statementDayFixes` corrects a saved day that disagrees).
- The spending period is the calendar month for everyone, whether or not a
  card has a statement day yet, and never the month the next salary pays for.
- The tour (`media/kawach-tour.mp4`, 82s) is drawn from the app's own tokens with
  made-up data, and plays from Setup, Settings (`js/tour.js`) and the welcome
  page. It has no voice: nine scenes, micro-copy, a synthesised score and a
  little UI sound, and it has to make sense with the sound off. The service
  worker never caches `media/`. Re-render it when a screen it shows changes. A first visit in a browser (not installed, nothing set up)
  goes to `welcome.html` once. The scripts that record it are kept outside
  the repository, in `expense-tracker-versions/tools/tour`.
- `sw.js` service worker: `CACHE_NAME` must match `APP_VERSION` in
  `js/version.js`, and `APP_SHELL` must list every js file, both stylesheets
  and the font, or the app breaks offline.

## Design

The design system is locked in `design.md` (read it before touching a screen);
its values are tokens in `css/tokens.css`, which `css/style.css` uses by name
and never overrides with raw colours, fonts or spacing. Icons come from
`js/icons.js`; category icons from `js/category-icons.js`, assigned in
`js/category-style.js` so no two categories share one. No emoji or text
characters as icons. The typeface, Geist, ships in `fonts/` so nothing is fetched.

Numbers first, one short line, details behind a tap. Whole rupees
(`formatRupees`), dates as "25 Sep". A warning is said once, never repeated per
row. Lists are one line per item; `<details>` holds the rest. No explanatory
paragraphs under headings.

Comments explain why, in plain English, especially where a rule looks odd.

## Working on it

There is no Node and no git on the owner's machine; Python is `py`.

1. Serve the folder and open `/tests/index.html`. Results land in
   `window.testResults`; every money-rule change gets a test. Tests use a
   separate database and made-up data only.
2. Unregister the service worker and clear caches before re-testing, or stale
   modules are served.
3. Every release a user would notice gets its lines in `NOTES` in
   `js/whats-new.js` (shown once after the update, filtered to who they
   concern), and every new feature a `guide`: the screen, the thing to point
   at, one line of tip (`js/guide.js`).
4. Versions on screen read like an app's: `3.0`, `3.1` for features, `3.1.1`
   for a fix, `4.0` for a rebuild (`APP_VERSION` in `js/version.js`). No
   leading zeros, and no third number until there is a fix. Every release also
   raises the hidden `BUILD` counter by one, with `CACHE_NAME` in `sw.js`.
5. Copy the whole app to `expense-tracker-versions/<version>` (e.g. `3.1.1`)
   so any version can be restored, and verify the copy.
6. To debug the owner's figures, ask for Settings → "Save diagnostic report"
   (redacted) and load it with `/tests/load-report.html` on localhost. Never ask
   for his GitHub token or passphrase.
