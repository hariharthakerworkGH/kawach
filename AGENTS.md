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
Plan, never with a guessed amount), renewals (a quarterly, half-yearly or
yearly cost carries `renewsOn`, its date; the budget still sets a slice aside
each month) and the tax dates worth knowing (advance
tax and the return for business income, GST when the business is marked
registered) - dates only, Kawach never files or computes tax. `js/goals.js`
holds goals: an amount, a month, and the savings pots it is counted in, with
`goalProgress()` saying what a month gets there. Savings pots carry a
`savingsKind` (PPF, gold, chit fund and the rest) and a value typed in,
because those have no statement to read.

**Policies** (5.84, `js/policies.js`, `js/views/policies.js`, one quiet line on Plan).
Health, life (LIC), term and vehicle insurance are typed in once. A policy is a
fixed cost (yearly, half-yearly, quarterly or monthly) with its details on the
same record as `policy`: number, who is covered, sum, nominee, helpline, grace
days, the premium date it is waiting for (`dueOn`), the payments marked paid, and
what it pays back and when. So the budget (a twelfth set aside each month, the
whole premium in the month it is due), the months ahead (the whole year, behind
one line on Plan, with money a policy pays back shown and never counted until
it arrives), reminders, backup, sync and the app lock already cover it.
"Premium paid" records a payment and moves the date one period on from the
date it was due, never from today. A policy past its date says how long its
grace period still runs (a vehicle policy has none). The family summary is plain
text the person sends from their own phone. Kawach never checks a policy with
the insurer and never works out tax: it shows what was recorded as paid in an
Indian financial year (April to March) for the person's own papers. A
diagnostic report keeps dates and amounts only, never the number, nominee or
contacts. Planned next, not built: a switch-ready planner (what to ask for in
hand, what to have saved before changing jobs), which reads the payslip's own
deductions rather than doing tax sums.

**One-time bills** (5.85, `js/bills.js`, `js/views/bills.js`, one quiet line on Plan). A
payment due on one date that does not repeat: a school fee, a repair, a trip
balance, a supplier's invoice. It is a commitment with `once: { dueOn, paidOn }`, so
the trackers, Summary's bills, the bank check, backup and sync already know it.
It takes its whole amount out of ONE month's budget (`monthlyAmountOf(item,
today)`): the month it is due, this month while it is overdue, or the month it
was paid in when that is another one, and nothing out of the others, so Left to
spend stays steady the rest of the time. The months ahead show it in its own
month. A payment found for it (tagged to it, its words, or about its amount, from
45 days before its date) ends it, as does "Mark as paid"; `settleBills()` runs
when Summary, Plan or the bills screen opens, so it is not held out of next
month as well. It never shows among the repeating commitments on Plan.

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
- **The card cycle also decides which month a card commitment belongs to**
  (`cardPeriod`), which is not the same thing as the spending window. Spend on
  entertainment on the 28th with the statement day on the 25th and it lands on
  next month's bill, so it draws down next month's entertainment allowance,
  not what is left of this month's. 4.6 lost this by accident - it changed
  `spendEnd`/`windowStart` to fix the spending window and `cardPeriod` was
  built from the same two variables - and 4.15 put it back. `inCardMonth` must
  keep reading the spending window and never `cardPeriod`, or an August card
  spend lands in September.
- **Work costs you front** (`isReimbursable` on a payment out, `isSettlement`
  on the payment in that settles it; js/reimbursable.js) are NOT spending:
  money you will be paid back is not money you spent. They are shown and
  followed (owed back, this month's work costs, the bank check) but never come
  off "Left to spend", and are never matched to a household commitment. The
  refund only clears what is owed back; it adds no room, because the cost took
  none (4.16 counted the cost and gave the room back on refund; changed in
  4.18 at the owner's request). What is owed back is an all-time tally, and
  the part of it sitting inside "owed on cards" is reported as
  `refundInBankCheck` so the bank check can say how much of what it subtracts
  is coming back - said, never silently added, since money not arrived is
  never counted. A settlement is never read as the salary landing. Paying a
  card bill from Accounts records one exact-amount debit (`paysCardId`,
  `paysStatement`) and marks the bill paid; Mark unpaid removes that debit.
- **A card commitment's payment only comes off a month's card spending if it
  was made in that month.** The commitment belongs to the card cycle, which can
  start before the 1st; the spending it comes off is the calendar month's.
- **The bank check and the tracker answer "was this paid?" the same way**
  (`isPaymentFor`, js/commitments.js): a payment tagged to a commitment is it,
  one tagged to another or marked "Not this" is not, otherwise its words or
  amount. They once disagreed, and a tagged rent came off the bank twice.
- **A set-aside on a card is drawn down by any card.** "Entertainment, 10,000
  a month" is an allowance, not a bill, so paying for a film with a different
  card still spends it (`isSetAside` decides). A **must be paid** item on a
  named card stays on that card, because that one really is one bill.
- Categories follow the way the money went (`js/merchant-rules.js`): a payment
  out is never matched to, offered or saved as Income (`isIncomeCategory`,
  `fitsDirection`); a rule learned from money in is not applied to money out
  (rules carry `direction`); a rule counts for how much of it a line fits. A
  card bill (`isCardBill`, js/transfers.js) is never a category's spending, since
  the purchases it pays are counted on the card.
- Work costs: the switch is on Add itself, on a pasted bank message and in
  History; "Owed back" on Summary opens the costs behind it (oldest first, with
  what is still owed) and the refunds that came in; each card says how much of
  it is work (`workCycle`, `workOwed` on `cards` in free-to-spend.js).
- Every month chart says what it is, reads any day by dragging, and uses plain
  names: "You've spent", "Budget so far", "Most in one day". The days are drawn
  once: "When it goes" is gone. History's day chart draws what you spent apart
  from bills and moves, and cuts a day far above a usual one short.
- Lent and borrowed (`js/people.js`): a payment carries `personId`, and
  gave or got decides the rest. Money lent from a bank account you spend
  from or a card comes off Left to spend; money back goes on again in the
  month it arrives; borrowing and paying back are neither. Cash and savings
  move only what is owed (the ATM already counted cash). People are the
  `people` setting; Home only.
- History and every month total (`spendingMonthOf`, `countsFor` in
  js/spending-month.js): salary landing in a month's last week can count in
  the month it pays for. History asks once; after a yes each salary is
  filed that way (`countsFor` on the payment), and Edit can switch any one.
  What that salary paid on salary day goes with it (`salaryDayPayments`,
  js/commitments.js).
- In and Out (History, its six months, Summary's In/Out/Net) are what
  reached or left the bank accounts you spend from (`cashSide`,
  js/transfers.js): a card bill counts the day it is paid, a purchase on the
  card is not added again, money moved to savings or the loan account is
  out, and only a move between two spending accounts is neither. History
  shows what each month brought forward and ends with, and the three add
  up (`balanceAt`, js/account-metrics.js). After the salary-month yes,
  everything paid from the salary between its landing and the month's end
  goes with it, except spread costs (tiffin, ATM), which stay on their date. Left to
  spend is not this: it counts a purchase the day it is swiped, and a card
  bill is never spending there.
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

Friends paying back what was paid up front (5.42): the whole bill counts when it is paid;
a payment in marked `isShareBack` ("Friends paying me back", on Add under Received, or on the
payment's edit panel in History) is taken off spending in the month it arrives, whatever account
it landed in, cash included (`shareBackSpends` in `free-to-spend.js`, `shareBackThisCycle` on the
result). It is not the lent-and-borrowed ledger: that needs the share logged as lent first, counts
only bank and card money, and treats an unexpected payment in as borrowing. Money in is an
employer paying back (`isSettlement`) or friends, never both.

A MOD (SBI's multi-option deposit) under a bank account (`depositOf`,
`deposit.kind === 'MOD'`) is one pool with that account (`isSweepDeposit`,
js/account-metrics.js): SBI breaks it in blocks to pay whatever the account pays
(an EMI, say), and the owner uses it as needed, so its balance counts with the
bank's: the bank check, "In your accounts" and the account card's headline. A
payment that lands on it is still never spending, and an ordinary fixed deposit
stays money put away. An SBI alert ("Your A/C XXXXX890385 Debited INR ...
-Transferred to Mr. NAME. Avl Balance ...") is read for its account (six digits
after the mask), its person (title dropped) and the balance printed after it,
which tells two EMIs of one size on one day apart. It resolves to the bank
account, never to the deposit that shares its number, the draft's account list
offers only accounts money is spent from, and a lone greeting line ("Greetings
from SBI !") joins the message under it instead of becoming an item.

SBI's newer all-accounts statement ("Welcome Mr. ..." on top, a page per account) has its own reader (js/parsers/sbi-statement.js): only the
savings page is read, credit column before debit; the current account, the deposits and the loans on the other pages are left alone. Before it
existed the general reader took the balance for each amount and, with no balance column in sight, made the account a credit card. The same
payment dated a day apart in two downloads (HDFC NetBanking 1 Oct, its PDF 30 Sep) is one payment when the bank's reference number is on both
(`sameTransaction`, `findDuplicates` in js/duplicates.js); wording alone never joins two rows of different days.

An import can be checked and taken back (js/import-safety.js). The review shows one "Check before saving" card when the file was read by the
general reader, would add a new account beside existing ones, or does not add up to the statement's own totals, and a quiet "Looks wrong?
Download a report" button that saves the usual redacted report plus what was read (`importReading`: reader, each row, redacted). Saving keeps an
`undo` copy on the import batch (accounts as they were, rows replaced or re-tagged, what was created): "Undo this import" on Done and in
Settings -> Backup for seven days, after which `forgetOldUndo` drops the copy when the app opens. Nothing is ever sent: the report is a file.

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
  their own. Money put into one of those deposits or swept back out of it
  (SBI's "SWEEP TFR/TRF", "FIRDFTFRREF" for a deposit made by hand, or a
  transfer to a number the statement sweeps from) is a transfer, never
  spending; js/transfers.js applies the same wording to lines saved earlier.
  Nothing leaving an account you do not spend from (`isPutAway`) is counted
  in category totals, Coach or the recap.
  Any other bank's or card's PDF goes to `any-bank.js`, the general
  reader: dated lines with amounts at the end, money in or out settled by the
  running balance (or "Cr" on a card). It also takes over when a bank's own
  reader finds no rows, and its `BANKS` list names every Indian bank for
  setup and for matching accounts. Its review says it was read this way.
  `js/alerts.js` reads bank SMS. `js/sync.js`, `js/backup.js` encrypted transfer.
  Sync goes through a file in the user's Google Drive (`kawach-sync.json`) or
  a GitHub gist; the Google pass lasts an hour, and when it has run out as the
  app opens, app.js renews it once, silently (prompt=none).
- `js/ca-export.js` "For your CA" in Settings: a month or a financial year
  (April to March) as a spreadsheet of every payment and a report printed to
  PDF (totals by space and category, loan interest and principal). Not
  encrypted, and the screen says so.
- `js/views/*` one file per screen. `js/app.js` routes between them. Back, one
  press at a time: a screen's `onBack()` closes what is open on it; then to the
  top of the screen; then a tab goes to Summary and a screen opened from
  another goes back to it; on Summary at the top it leaves the app. A screen redrawing itself goes through `js/redraw.js`,
  which keeps the scroll position and any open sections.
- A finished month on Summary is drawn in the same top as the month running
  (`finished: true`, `topFigures`): "Final for September", Days, the whole
  month, and nothing about now (this week, owed, coming up). Its budget is
  worked out from today's commitments, as of the month's last day.
- Every passphrase box gets a show button, and a passphrase typed twice goes
  red as soon as the two differ (`js/password-field.js`).
- A card's statement day is never typed in: it comes from its statements
  (`statementDayFixes` corrects a saved day that disagrees).
- The spending period is the calendar month for everyone, whether or not a
  card has a statement day yet, and never the month the next salary pays for.
- The tour is a 1:52 video, `media/kawach-tour.mp4` (720 x 1280, 30 fps,
  H.264 + AAC, music only), with `media/kawach-tour.jpg` as its poster, played
  over the app from Setup and Settings (`js/tour.js`) and on the welcome page.
  The service worker never caches `media/`, so it needs a connection. It is 720p (9 MB) on purpose: the push uploads each file in one request, and on a slow connection anything over about 10 MB fails with a misleading "Bad credentials"; the 1080p master is rendered by the recipe in `tools/tour-showreel`. It is
  the "story cut" (5.83), 1:52, made with the Hyperframes skills: midnight blue,
  gold and ivory, Geist (the app's own typeface), a real 3D phone whose screen
  is live HTML. It tells a story: a balance that is not what you can spend,
  salary and the bills, "can I afford it?", the shield and what Kawach is,
  then seven steps of a month (Plan, paste an SMS or import a statement, one
  number every day with money moving between your own accounts, History,
  Coach answering the same question, goals and dates, Home and shop), "And
  more" (loans, PF, gold, chit funds), a plain privacy scene (what other apps
  ask for is struck out, then what Kawach does not need), and the shield again
  with the address. Source, plan and the render recipe:
  `expense-tracker-versions/tools/tour-showreel` (README.md). It needs FFmpeg
  (winget Gyan.FFmpeg); the full render takes about an hour on this machine
  (software GL), a short tail takes a minute and can be spliced on. It shows
  what each screen really does, with example figures that agree with each
  other ("Example figures" is on screen); it makes no claim the app does not
  keep (Coach is arithmetic, never "AI"). The logo is the app's own
  shield (`icons/kawach.svg` without its black square). No brand logos: the
  app bundles none (js/brand.js), and the film uses plain names (Bank account,
  Credit card). Every line is one line and every line is held long enough to
  read: the owner rejected five cuts for tiny, broken, rushed or unclear type
  and story. Music is one bundled track played straight through, never looped
  (a loop with a crossfade sounded jumbled); scene changes land on its beats.
  When a screen the film shows changes, change its copy of the screen in
  the film and re-render. The old canvas film (`tour.html`, `js/tour-film.js`,
  `js/film/`) and the screen-recording pipeline (`tools/tour-video`) are
  superseded and kept only for reference; they are never published.
  A first visit in a browser (not installed, nothing set up) goes to
  `welcome.html` once.

- `sw.js` service worker: `CACHE_NAME` must match `APP_VERSION` in
  `js/version.js`, and `APP_SHELL` must list every js file, every stylesheet
  and the font, or the app breaks offline.

**Plans stay on the laptop (5.26.1).** `expense-tracker-versions/_private/` holds
the master plan, the design notes (`docs/`), the component lab (`lab/`) and the
old `versions/` stubs. The release tool publishes everything under `_work`, so
anything not meant for the public goes in `_private`, never in `_work`.

**App lock (5.31).** `js/lock.js`: a PIN (4 to 6 digits, stored only as a salted
PBKDF2 hash) and optionally the phone's fingerprint (WebAuthn, platform
authenticator, checked on the phone only). Asked in `app.js` before any data is
read; `index.html` puts `is-locked` on the page from the first paint so nothing
flashes. Device-only: in localStorage (`kawach-lock`), never synced, never in a
backup or diagnostic report. Asks again after the chosen time away (1 minute
default; `sessionStorage` keeps "last seen" fresh so an update reload does not
ask again). Five wrong PINs wait 30 s, doubling to 15 min. A forgotten PIN cannot
be read back, so a lock never exists without a way back (5.39): turning it on shows a
recovery key once (16 characters, `makeKeyText`, kept only as a salted hash in the lock
record beside the PIN; nothing is saved if the person cancels at that sheet). "Forgot
PIN?" offers the key (it opens Kawach and asks for a new PIN and a new key) and, last,
erasing Kawach on the phone to be restored from the encrypted backup. Settings: "New
key" (behind the PIN), "Show" beside the backup passphrase and the GitHub sync
passphrase (behind the PIN), the passphrase shown to keep after it is set, and a nudge
to back up when the lock is turned on with no backup. The three small boxes for this
are in `js/secret-sheet.js`. A fault inside the lock lets the person in rather
than locking them out of the app. It stops casual access, not someone with
technical tools; Settings says so. The fingerprint path is untested off a real
phone.

**Looking ahead (5.32).** `js/forecast.js`: the three months after this one on Plan
(income less fixed costs and saving; a yearly cost lands in its month; a short month
says so). `js/card-smarts.js`: credit limit free (limit typed on the card, paise in
`account.creditLimit`), best day to use a card, pay-by line. `js/flex-report.js`: what
each set-aside cost has left, shown in Month in review as "What you did not spend"
(nothing rolls over). All three read `computeFreeToSpend`; none invent their own sums.

**Alerts learn (5.35).** `js/alerts.js` reads a bank or card message with a built-in
format when it knows the wording, and otherwise with the general reader (direction from the
word nearest the amount, who it was from the label words, never the user's own account).
`js/alert-learning.js` turns one checked and saved message into a pattern with holes for the
amount, date, shop and card digits, kept in the `learnedAlertFormats` setting (so it syncs,
encrypted) and shown under "Wordings I have learned" on the alert screen, where each can be
forgotten. Only a partly read message teaches; the pattern must re-read its own message to the
same figures. `js/card-refunds.js` pairs a card refund with the purchase it undoes (same card,
same amount, a shop word in common) so a refund never adds room to spend.

**Motion (5.37, 5.38).** Every look moves the same way; each look only dresses it. A figure that changes rolls to its new value and the bar or ring that draws it follows frame by frame (`data-roll-scope`, `data-roll-kind`, `data-follow` on the figure's card, `rollFigures` in `js/ui.js`); charts draw once per arrival (`is-armed`, `is-drawing`); the lit tab (`.nav-ind`) and a toggle's lit choice (`.seg-pill`) glide. Times are 120/240/420 ms with the tokens' ease, only transform and opacity move, and reduced motion shows the end state. A new animation is added on every look or it is not added.

**Demo mode (5.40).** Settings, "Show Kawach to someone": a separate session of the same app for
showing it to others on the owner's phone. `js/demo-flag.js` (`isDemo()`, a flag in sessionStorage,
so closing the app ends it) is read by `index.html` before any module loads, which points the
database at `kawach-demo` (db.js already takes its name from `EXPENSE_TRACKER_DB_NAME`) and picks
the demo's own appearance and space keys. The owner's database is never opened. `js/demo-data.js`
builds an invented household from today's date (same day, same household; tests hold it to that).
`js/demo.js` starts it, mounts the yellow DEMO ribbon, closes the doors (files, clipboard,
notifications), leaves it (PIN when the lock is on) and wipes it. Off inside: sync, backups,
reminders, shared messages, the lock screen. Anything new that reads the phone or reaches out
must check `isDemo()`; any new device-level localStorage key must be copied or separated for the
demo in `demo.js`. The guide (5.43, `js/demo-guide.js`, words in `js/demo-script.js`, which are the
owner's to change): eight steps, a strip above the tab bar saying one thing at a time and a ring on
what to touch; it opens each screen, waits where it asks for something (a payment saved, a row
opened, an example message read, a question asked), and can be skipped or brought back from the
demo's Settings. Its place is kept in sessionStorage. Next: a shop-owner household and a Try it
link on `welcome.html`, then Hindi.

## Home screen and the install sheet (5.45)

`manifest.webmanifest` carries an `id` (the same address the app already had, so installed copies keep their
identity), two shortcuts (`./?open=add`, `./?open=summary`) and two screenshots in `icons/screenshots/`, made with
`tools/release/store_shots.mjs` from the made-up demo household (re-make them when Summary or Plan changes). The app
reads `?open=` before the back-button set-up tidies the address (js/app.js). The privacy page says where the files
come from (GitHub Pages sees the address of a visit), how the lock's PIN and key are kept, and what the demo does.
Not yet there, because they need the owner's own details: a contact address, the operator's name, a grievance route
and governing law on privacy.html and terms.html.

## Cash as a pocket (5.44, with a plan 5.46)

`js/cash.js` is pure; `js/free-to-spend.js` calls it when the `cashRuleFrom` setting is set (the app sets it to
today the first time it opens after the update, so no month already worked out changes; absent, every answer is
identical to before: `tools/release/diffrun.mjs`).

- A bank debit with ATM wording (`CASH_ENTRY_RE`) dated on or after that day is cash moved into the pocket: not
  spending, and not claimed by any commitment.
- Cash you spend (a debit on a cash account, not a transfer, work cost or lent money) counts the day you write it
  down.
- Cash taken out and never written down counts 30 days after it was taken out (on that day, in that month), and only
  the part not written down: written spends come off the oldest cash first (FIFO); a spend after a lot's 30 days
  cannot use it again; a spend with no cash to take from is still a spend.
- Cash taken out in the 30 days before the rule began is still in the pocket and marked `counted`: it was counted
  when it left the bank (as spending, or against the plan), so what is spent from it, and what is left of it, is not
  counted again.
- **The plan for ATM cash** (`isAtmPlan` in js/commitments.js: `cash: true`, or a set-aside-bit-by-bit plan with ATM
  or cash in its name, such as the owner's "Cash Withdrawal") stays set aside. What counts as above draws it down
  (`used`), and what goes past it is spending like any other plan's overspend: Left to spend only moves once the plan
  is used up. With no plan, what counts is spending of its own, each cash spend moving Left to spend. (5.44 dropped
  the plan from the budget; the owner chose to keep it set aside, 5.46.)
- `computeFreeToSpend().cash` = `{ on, from, takenOut, spent, inPocket, unloggedCounted, plan }` for the month, shown
  on Accounts (Cash row), as a note on Add when Cash is chosen (with what is left of the plan), and on the plan's row
  on Plan.
- Tests: `tests/cash.test.js`; whole flow: `tools/release/cashflow.mjs`; the owner's own redacted report can be
  replayed with `tools/release/report_probe.mjs` (it reads a report from where it is, never copies it into the
  project).

## Safety net (5.43.1)

Found by a hostile review of 5.43 and fixed together. Tests: `tests/safety.test.js`.

- **A damaged record cannot blank the app.** `js/records.js` says what a payment, account, commitment or category
  must look like (a real `YYYY-MM-DD` day, an amount that is a number between 0 and 1,000 crore rupees in paise, a
  direction). `db.put` refuses anything else with a `BadRecordError`; `db.getAll` leaves a damaged record out (never
  deletes it) and counts it; `getAllRaw` returns everything and is what backups and sync use, so nothing is lost for
  good. Settings shows "N records could not be read" with a Remove button. A setting stored as null, or as a list
  that is no longer a list, reads as its fallback (`getSetting`).
- **A screen that fails says so.** `showView` catches a failing render and draws a card (Try again, Save a report,
  Open Settings) instead of leaving it blank; uncaught errors give one calm toast; a start-up failure offers Reload.
- **Restore is all or nothing, and can be undone.** `db.replaceAll` swaps whole stores in ONE transaction. Before a
  restore, `backup.js` keeps a copy of what is on the phone in its own small database (`<db>-undo`, two weeks);
  Settings offers "Undo the last restore". Damaged records inside a backup are skipped and counted, not fatal.
- **Drive keeps the newest 5 backups and the newest of each of the last 6 months** (`backupsToDelete`), so a bad
  backup can never push out the good ones.
- **Sync merges lists item by item.** People, goals, businesses and the small "already told" lists
  (`LIST_SETTINGS` in `js/sync.js`) are merged against what both devices agreed at the last sync (`base:<key>` in
  `syncMeta`): an addition on either side stays, a removal on a side that had the item stays removed. A tie on the
  stamp is settled the same way on both devices; a record stamped more than five minutes in the future is taken in as
  "now"; Settings warns when the phone's clock is more than two minutes out (measured from Google's or GitHub's own
  time when sync writes). Whole-record newest-wins still applies to everything else (`budgets` is a map and still
  loses a concurrent edit: known).
- **Readers are not handed absurd text.** `js/statement-text.js` cuts lines to 1,200 characters and runs of digits
  to 40, refuses files over 25 MB (PDF) or 15 MB (CSV), and Import drops any row whose amount is not believable.
  pdf.js runs with `isEvalSupported: false`.
- **Releases are gated.** `tools/release/gate.py` (in the project, not a temp folder) runs the static check, the
  tests (and refuses if fewer ran than last time), the 66-check animation probe and a screen audit in a real browser;
  `release.py` will not push unless it passes. `tools/release/push.py` pushes with the GitHub CLI's own sign-in.
  The other scripts there (`kh.mjs` harness, `corrupt.mjs`, `fuzz2.mjs`, `perf.mjs`...) are the checks used for the
  review and are worth re-running after any change to storage, sync or the money rule.

## Design

**Styles and colourings (5.0).** Kawach comes in four styles (Haven,
Charts, Tactile, Instrument) and the colourings, chosen in How it looks
(`js/looks.js`). Peaks and Mindora were retired in 5.41 (the owner found them
useless); anyone who wore one is moved to the default once, with a toast
(`retireOldLooks` in `js/appearance.js`). Charts is the base every screen is built on; the other
two are layers over it, restyling what they have caught up with and
falling back to Charts elsewhere. **Haven is the default style (5.52; Instrument
was from 5.27, Tactile from 5.17), and every new feature gets its look in Haven first**; Charts and
Tactile are brought up to date together in a "mass update" (the last one was
5.24: the short Summary's cards, the explain bubble, Lent and borrowed and the
salary question in each look's own card language) - never ship anything that
breaks in them. **Instrument (5.25)** is dark and precise (a dial for the
budget, a ruled month chart, cells for bars, one lit colour: amber, ice or
lime). It is not a copy: it SHARES Tactile's markup and rules - every selector
in `css/style-tactile.css` is written `:root:is([data-style="tactile"],
[data-style="instrument"])` - and repaints them by redefining the `--t-*`
values in `css/style-instrument.css`, which loads after it. So a feature built for either
(Instrument first, since 5.27) arrives in the other for free, and its own file only holds what
Tactile has no equivalent of (radii, cell bars, the flush tab bar, the dial in
`summary-looks.js` `instrumentDial`, the chart `monthScale` in `summary.js`).
**Haven (5.52, rebuilt from its prototype in 5.53)** is the default and the fourth look: calm and light by day, deep
navy by night (`haven-day` / `haven-night`, always paired with the style; "Follow my phone" picks between them). **What
the owner is shown is what ships**: Haven is built from the prototype in `mockups/7.1-haven`, never reinterpreted. Its
stylesheet is the prototype's own, ported by `tools/haven_port.py` into `css/haven-proto.css` (generated, never edited;
every class is prefixed `hv-`, every property `--hv-`), and `css/style-haven.css` is only the glue for the app's own
blocks the prototype does not show. It is not a Tactile repaint. The prototype's screens are drawn with its own markup
and real figures: Summary (`summary-looks.js` `havenTop`: the vault with the tide and its moods in words, "How <month> is
going" you can drag across, the three shortcuts, Needs you, Latest payments, Where it went), Plan (`plan-looks.js`
`havenMonth` and `plan.js` `havenArrange`: still to pay as cards with Mark paid, then Commitments, then Next 3 months),
Accounts (`haven-ui.js` `havenAccounts`: cards you slide through), History (one net card with the days under it), Coach
(a vault on top). Add is a sheet that springs up from the raised middle button (`haven-sheet.js`), amount first on its own
keypad with everything else behind "Details" (`add.js` `havenArrangeAdd`); a guide or the demo uses the Add screen instead.
The tab bar is five tabs with Add raised in the middle; Coach is a button on Plan, and Plan stays lit while it is open.
Before shipping any change to Haven, `tools/release/vs.mjs <view> [colour]` takes the app and the prototype at the same
size, and `measure.mjs` gives the same parts' sizes in both; they must match.
Tactile and Charts retired in 5.57 (two looks are left, Haven and Instrument; whoever wore the others lands on Haven once, told by
a toast: `retireOldLooks`). Their stylesheets stayed because Instrument and Haven are built on them: `css/style-tactile.css` is
now Instrument's base, `tactileTop` and `.pl-top--tactile` are the Summary and Plan markup both share, and Charts is the base
every screen sits on, not a choice.
Haven's second layer of life (5.60) is `js/haven-life.js`: the Summary carries its data on `data-life`, `data-recap`, `data-story`, `data-weather` (summary-looks.js `havenTop`), and `havenMore` in summary.js adds goals, a salary just landed, last month's line, the story and the badges.
Haven's motion (5.56) is `js/haven-motion.js` + `css/haven-motion.css`, chosen in Settings (Alive, Calm, Still) and always off for a
phone set to reduce motion; see design.md section 16. A save from the Add sheet fires `hv-saved` (the coin, the Add ring) and
`hv-refresh` (app.js draws the screen underneath again).
`plan.js`, `coach.js`, `add.js` and `transactions.js` list it beside the others.
Its colourings come from `looks.py`; the contrast scan (text of every kind
against what is behind it) is clean in all three. **Readable text is made by
`looks.py` (5.26):** every colouring's secondary ink, money-in/out and warning
colours are nudged until they reach 4.7:1 on the page, a card, a raised card and
a pressed-in well, and `--k-accent-text` is the accent as writing or a line icon
(the real accent stays for fills, with an ink that reaches 4.5:1). Use
`color: var(--k-accent-text)`, never `var(--k-accent)`, for text. To check: load
the owner's report, step through every screen in every look and colouring, and
read the colour of each piece of text against what is behind it (gradients hide
the real background from such a scan: judge those by eye). Check a look with: every screen in every look on the owner's
loaded report, and contrast measured in all ten colourings (see the 5.23 and 5.24
notes in the commit messages). A colouring is a set of token values in `css/looks.css`, GENERATED by
`expense-tracker-versions/tools/looks.py` (never edit by hand); `data-colour`
on <html> picks it and `data-theme` follows its light or dark, so the light
and dark material in the stylesheets comes with it. The three Charts
gradients are `--k-grad-1a/1b`, `-2a/2b`, `-3a/3b`, with `--k-grad-N-ink` for
text on each. A style other than Charts is one stylesheet keyed on
`data-style` (`css/style-tactile.css` 5.6) that
changes material, never markup, and brings its own colouring (Tactile
copper) for "Follow my phone". The drawing that differs is
Summary's month: Instrument draws a ruled scale (`monthScale`), chosen in
`monthWaves` by the style worn. Paint alone made the styles look alike, so
since 5.9 each also lays out Summary's top half as its mockup does
(`js/views/summary-looks.js`, same figures, own markup) and has its own tab
bar and title. By 5.16 every tab is laid out per style after its mockup:
Add regroups the same form (`arrangeAdd` in add.js), Accounts and History
regroup and restyle theirs, Plan and Coach draw their top and month in
`plan-looks.js` / `coachTop` in coach.js. Charts' layout never changes.
**Every style says exactly the same things** (the owner's rule, 5.10): only
how they look may differ. The list is in summary-looks.js's header; a card
in a chart is always named (`cardTag`: first word and last four digits).
Settings and How it looks follow the style too. Summary has a short version (5.18, `appearance('summary') === 'short'`, the
default for someone new; app.js keeps anyone who already had data on the full
one): three set-up steps until income and commitments are in, then the
answer under the figure, "Needs you" (three at most: bank short, commitments
due in three days, then the To do rows; the rest behind "N more"), the month,
and everything else in one "More about this month" fold. The version line
lives in Settings. No bare percentages on screen anywhere: amounts or words. Tabs swipe left and right
round and round (`js/swipe.js`, nav order). "Follow my phone" gives a style its own
colouring only when that matches the phone's light or dark. dna.css's tab and shell rules carry an id (`:has(#view-
container.k)`): a style beats them with `#tabs` or `#view-container`. Mix
`color-mix(in oklch, x, transparent)` or white in srgb instead: in oklch the
hue is lost and drifts red. SVG gradient ids are numbered per drawing. The
in-app browser pane's screenshots can drop SVG gradients and fixed layers
under glass, so judge a look from `tests/look-probe.html?style=&colour=&theme=`
(made-up figures) rendered in headless Edge. The tour video is not re-made
per style.

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

The Summary shield's water is what is left of the month's budget. It has no
pace line: whether you are ahead is said in words ("8 days ahead", "On track:
Ahead") and drawn, with its own key, in the month chart below. A saved expense
shows its exact amount riding the water down (`changeTag`, js/haven-motion.js),
because a small expense is a thin slice of a big budget and a few pixels of
water alone are easy to miss.

Comments explain why, in plain English, especially where a rule looks odd.

Control sizes are set once, in `css/compact.css` (loaded last, 5.47): a field 36px, a full-width button 42, a
chip 28; buttons, chips, switches and toggles keep a 44px reach strip, and a text field or list keeps its 36px (the audit's floor for fields); every screen shares one rhythm (16px gutter, 14/16 inside a
card, 12px between cards, 24px before a heading). History's open payment shows the amount, a category list,
the day and a Save at once; Add shows account and date beside each other, never behind a fold.
Every list a person picks from or reads down is A to Z by default and ordered by `js/list-order.js` (5.51): commitments
(A to Z, due day, biggest, their own order), accounts (A to Z, biggest, their own order), categories (A to Z, most used). The
choice is on the screen (a small control on Plan and Accounts) and in Settings, How it looks; Reorder works in "their own
order" (`byYourOrder`). Plan shows what is still to pay; paid and used-up ones fold under a line, and only a set-aside that
has gone over its limit is flagged at the top. So is a coming month that is short (5.50:
`comingMonths` counts a cost skipped this month, because it returns). "Next 3 months" also says what the bank will hold
(`bankAhead`, from the Summary bank check, so it follows what has been spent). The title and tab bars are hidden while the opening is up (`html.booting`).

## Working on it

Node (v24) and Python (`py`) are installed; there is no git. The browser checks and release tools in
`tools/release` use Node.

1. Serve the folder and open `/tests/index.html`. Results land in
   `window.testResults`; every money-rule change gets a test. Tests use a
   separate database and made-up data only.
2. Unregister the service worker and clear caches before re-testing, or stale
   modules are served.
3. Every release a user would notice gets its lines in `NOTES` in
   `js/whats-new.js`, kept in Settings -> What's new, and every new feature a
   `guide`: the screen, the thing to point at, one line of tip (`js/guide.js`).
   Only a real overhaul is marked `major` (`ship.py --major`): that alone is
   shown on the card after an update, at most three items, newest first, so the
   card is short and its button is never scrolled away. A small change is in the
   list but never pops up.
4. Versions on screen read like an app's: `3.0`, `3.1` for features, `3.1.1`
   for a fix, `4.0` for a rebuild (`APP_VERSION` in `js/version.js`). No
   leading zeros, and no third number until there is a fix. Every release also
   raises the hidden `BUILD` counter by one, with `CACHE_NAME` in `sw.js`.
5. Copy the app to `expense-tracker-versions/<version>` (e.g. `3.1.1`) so any
   version can be restored, and verify the copy. Not `media/` (the tour video,
   kept in `_work` and online): a copy of it in every version fills the disk.
6. To debug the owner's figures, ask for Settings → "Save diagnostic report"
   (redacted) and load it with `/tests/load-report.html` on localhost. Never ask
   for his GitHub token or passphrase.
