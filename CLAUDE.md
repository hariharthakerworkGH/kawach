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

- No analytics, no third-party calls, no external services except the user's own
  secret GitHub Gist and, if they connect it, their own Google Drive (only the
  hidden appDataFolder, scope drive.appdata, via Google's sign-in page - no
  Google code is loaded; js/drive.js). No LLM in the app.
- Statement PDFs are parsed in memory and never stored. PDF passwords are used
  once and never saved.
- Sync and backup files are encrypted client side (AES-GCM) with a passphrase the
  user sets. It is held in memory, never written next to the data.
- Never auto-commit parsed rows: always show a review table first.
- If a PDF has no text layer, say so plainly instead of returning empty rows.
- Never silently overwrite a category, amount or day the user set by hand.
- Written for someone who is not a programmer: no jargon on screen, no setup.

## How the money is worked out

`js/free-to-spend.js` is the one calculation every screen reads. Its header
comment is the specification; keep it true.

```
Budget   = monthly salary − live fixed commitments (bank + card) − saved each month
Spent    = card spends this card cycle + bank spends this month − commitment payments
Left     = budget − spent
```

Periods:
- **Cards:** the card cycle, the day after the statement day to the next statement
  day. The statement day comes from imported statements when there are any
  (`statementDay` in js/account-metrics.js), not from what was typed in.
- **Bank and cash:** the calendar month, 1st to last day. Nothing before the 1st
  counts, with one exception: a commitment with a set day (EMI, rent) paid on
  salary day at the end of a month belongs to the month after.
- The bank balance never raises the budget. It is a separate check that only warns.
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
- `js/views/*` one file per screen. `js/app.js` routes between them; back
  retraces the screens you opened, and a screen's `onBack()` closes what is
  open on it first. A screen redrawing itself goes through `js/redraw.js`,
  which keeps the scroll position and any open sections.
- A card's statement day is never typed in: it comes from its statements
  (`statementDayFixes` corrects a saved day that disagrees).
- No card with a statement day yet (every new user): the spending period is
  the calendar month, never the month the next salary pays for.
- The one-minute tour (`media/kawach-tour.mp4`) is made from the real app with
  made-up data, and plays from Setup, Settings (`js/tour.js`) and the welcome
  page. The service worker never caches `media/`. Re-record it when the setup
  screens change. A first visit in a browser (not installed, nothing set up)
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
3. Versions are `major.minor.fix`, two digits each (`APP_VERSION` in
   `js/version.js`, shown on screen): major for an app rebuilt with a new set
   of features, minor for features added or changed (fix goes back to 00),
   fix for bugs and glitches only. Every release also raises the hidden
   `BUILD` counter by one, together with `CACHE_NAME` in `sw.js`.
4. Copy the whole app to `expense-tracker-versions/<version>` (e.g. `01.08.00`)
   so any version can be restored, and verify the copy.
5. To debug the owner's figures, ask for Settings → "Save diagnostic report"
   (redacted) and load it with `/tests/load-report.html` on localhost. Never ask
   for his GitHub token or passphrase.
