# Kawach — a brief for an AI collaborator

You are being asked to work on Kawach. This document tells you what it is, who
uses it, the rules it holds itself to, and the states any screen must survive.
It contains no source code. Everything here is product truth, not
implementation.

Read the "Hard rules" and "States that must work" sections twice. Most bad
suggestions for this app come from not knowing those.

---

## 1. What it is, in one paragraph

Kawach ("shield" in Hindi) is a personal finance app for Indian households. It
answers one question: **how much can I spend this month without causing a
problem later.** It runs entirely in the browser as an installable web app. It
has no server, no account, and no login. All money data lives on the person's
own phone. Nothing is uploaded anywhere unless they switch on their own
encrypted backup.

It is not a budgeting spreadsheet, not an investment app, and not a
bookkeeping tool. It is a single number, kept honest.

## 2. Who uses it

An Indian salaried person or small business owner, on an Android phone,
frequently a mid-range one on a slow connection. They are **not** a programmer
and never will be. They think in rupees, in months, and in "will my card bill
clear when my salary lands".

Design and copy consequences:
- No jargon on screen. Not "commitment recurrence interval" — "how often".
- No setup ritual. The app must be useful before it is fully configured.
- 320px wide is a real person with an older handset, not an edge case.
- Whole rupees, grouped the Indian way: ₹1,17,900 not ₹117,900.
- Dates read "25 Sep", never 2026-09-25.

## 3. The one calculation

Every screen reads the same calculation. No screen works the money out for
itself.

```
Budget this month = monthly income
                  − every fixed commitment (paid from bank or card)
                  − the amount saved each month

Spent this month  = card spends this month
                  + bank and cash spends this month
                  − payments that were themselves a fixed commitment

Left to spend     = Budget − Spent
```

**The spending period is the calendar month, the 1st to the last day, for cards
and bank alike.** This matters and was once wrong: spending used to run on the
credit-card statement day, so the screen said something like "26 Sep to 25 Oct"
while bank spending was counted over the calendar month. One month's budget was
being measured against two different windows. A statement day is a fact about a
bank's paperwork, not about the person — it differs per card, and with several
cards the latest one silently decided the whole app's period.

The card cycle still exists, but it decides **only when a card bill falls**, not
what counts as this month's spending.

**Money in the bank never raises the budget.** Each month lives on its own
income. What the bank holds is shown as a separate check that can only warn:
"after your salary and the bills due before it, your bank would be short". It
never makes the spendable number larger.

## 4. The vocabulary

Use these words. They are the product's terms of art and the user learns them.

| Term | Means |
|---|---|
| **Left to spend** | The headline number. Budget minus spent, for this month. |
| **Commitment** | A fixed monthly cost the person has told the app about. |
| **Must be paid** | A commitment with a due day that can be late: rent, an EMI, a bill. |
| **Set aside** | Money kept back rather than owed: groceries, fuel, a wallet top-up. It can be spent in full, in part, or not at all, and is never late. |
| **Kept back** | What remains unspent of a set-aside, shown so it does not look like it vanished. |
| **The bank check** | The separate warning about whether the bank can cover what is due. Never part of the budget. |
| **Card cycle** | The period one card statement covers. Decides bills only. |
| **Space** | A lane of money. "Home" is one; each business the person runs is another. Accounts and commitments belong to exactly one. |
| **Statement** | A PDF from a bank or card company, imported to fill in transactions. |

Avoid: "transaction" where "payment" works, "expense" where "spend" works,
"configure", "sync settings", "dashboard".

## 5. The six screens

The app has one bottom navigation bar, six places, always in this order:

1. **Summary** — the headline number and why it is that number. The first
   screen, and the one that must answer the question without scrolling.
2. **Add** — record a payment. Amount, what it was for, category; date, account
   and "repeats" can fold away for people who want a short form.
3. **Accounts** — what is in each account. Banks, cards, cash, savings, loans,
   provident fund. Card bills and what is still owed.
4. **Plan** — income, the fixed commitments, savings goals, category budgets.
   Where the budget is actually decided.
5. **History** — every payment, searchable, and six months of money in against
   money out.
6. **Coach** — "can I afford this?", and things worth noticing.

Settings sits behind a control in the header, not in the navigation.

## 6. Where the money comes from

Payments reach the app three ways, in rising order of effort:

- **A bank SMS**, shared into the app from the phone's share sheet and read
  automatically.
- **A statement PDF**, imported. It is parsed in memory and never stored. If it
  is password-protected the password is used once and never saved. **Parsed rows
  are never saved on their own** — a review table always comes first, and a row
  that matches something already recorded is matched rather than duplicated.
- **Typed in by hand** on Add.

The app knows several Indian banks' statement formats by name, and falls back to
a general reader for anything else, which says so on the review screen.

## 7. Hard rules

These are not preferences. Breaking one is a bug, however good it looks.

1. **No analytics. No third-party calls. No fonts, scripts or images from
   anywhere else.** The typeface ships with the app. The only outbound traffic
   is to services the person switched on themselves: their own Google Drive
   folder, or their own secret GitHub gist.
2. **Backups and sync are encrypted on the device** with a passphrase the person
   sets. That passphrase never leaves the phone and is never in a backup.
3. **Statement PDFs are never stored. PDF passwords are never saved.**
4. **Never overwrite a category, amount or date the person set by hand.**
5. **Never commit parsed rows without a review.**
6. **If a PDF has no readable text, say so plainly** rather than returning an
   empty result that looks like "no payments found".
7. **Money is stored as whole paise**, never as a fractional rupee. Dates are
   local, never converted through UTC — that is a day behind in India.
8. **It must work with no network at all**, having been opened once.
9. **No large language model runs in the app.** Ever.

## 8. How it should look and read

- **Numbers first.** The figure is the content; the words explain it.
- **One short line per item.** Detail goes behind a tap, not into a paragraph.
- **A warning is said once**, not repeated on every row it applies to.
- **No explanatory paragraphs under headings.** If a heading needs a paragraph,
  the heading is wrong.
- **No emoji, and no text characters used as icons.**
- Both light and dark must work, and the person can force either.
- The person can also choose text size and spacing, what the Summary shows
  under its number, how Accounts and Plan are arranged, and which screen the app
  opens on. Any design must survive all of those being set differently.

It is a financial app before it is a beautiful one. If a treatment makes
**−₹31,500** harder to read at a glance, it is a regression no matter how good
it looks.

## 9. States that must work

A design that only handles the happy path is not finished. Every one of these is
a normal Tuesday for someone:

| State | What must happen |
|---|---|
| **Brand new, nothing set up** | The app is still useful and says what to do next. It must not show a big zero as if that were an answer. |
| **Income set, no commitments yet** | It must not present the whole salary as spendable. It says so instead. |
| **Over budget** | The headline goes negative, for example −₹31,500, and stays readable. Six digits plus a minus sign is a normal width, not an overflow case. |
| **No bank statement imported yet** | Balances are unknown. The app says "unknown", never "₹0". |
| **A card bill is unpaid** | Said once, clearly, with the amount and what it means for the bank after payday. |
| **Set-aside money unspent** | Shown as kept back, so it does not look like money that disappeared. |
| **A business space is active** | The screens follow that lane only, and business categories replace household ones. |
| **The same cost entered twice** | Flagged as a possible duplicate, never deleted automatically — two real costs can be the same size on the same day. |

## 10. What it deliberately does not do

Do not propose these; they have been considered and rejected.

- **No investment or tax advice**, and it never files or computes tax. It knows
  tax *dates* and nothing more.
- **No bank connection or account aggregation.** Statements and SMS only.
- **No shared or family accounts.** One person, one phone.
- **No ads, no subscription, no upsell.**
- **No streaks, badges or gamification.** The subject is someone's rent.
- **No AI assistant inside the app.**
- **A money rule is never a user preference.** Customisation covers how the app
  looks, never how a figure is calculated. If two people can get different
  answers for "left to spend" from identical data, the number stops being worth
  trusting.

## 11. If you are proposing a design

Answer these before you show anything:

1. What question does this screen answer, in the user's words?
2. What does it show when the data behind it does not exist yet?
3. What does it show when the number is negative?
4. Does it still read at 320px, in light and dark, at the largest text setting?
5. Does it say anything twice?
6. Could someone who is not a programmer explain what it means?

If a proposal answers all six, it is worth building.

---

*All figures in this document are invented for illustration. The app holds one
person's real money on their own phone, and none of it appears here.*
