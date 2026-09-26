# The financial model, as it actually stands

One source of truth: `js/free-to-spend.js`. Every screen reads it. No view
recomputes money.

## Salary

Set as a monthly amount and a day. `salary.dates` holds **one** date: the next
payday not yet received. A payday is treated as received when a credit of at
least half the monthly amount lands in a spending account within 7 days before
or 5 days after it, and on or before today.

The plan looks **one payday ahead**, on every day of the month. Before phase 10
it ran to the first payday on or after the card statement closed, which from
the 26th pulled in a second salary and a second month of commitments.

A salary is never spending power before it arrives: it is future income until
its date, and only then part of the balance.

## Spending cycle

The card cycle: the day after the statement day to the next statement day
(26th to 25th where statements cut on the 25th). The statement day comes from
imported statements, never from what was typed in. With no card, the calendar
month.

Bank and cash spending runs by the calendar month, with one exception: a
commitment with a set day paid on salary day at the end of a month belongs to
the month after.

## Budget and left to spend

    Budget = monthly income - live commitments (bank and card) - saved each month
    Spent  = card spends this cycle + bank spends this month - commitment payments
    Left   = Budget - Spent

The bank balance never raises the budget. Each cycle lives on its own salary,
so a new cycle starts with a fresh budget even after an expensive one. That is
deliberate, and it is why the bank check exists.

## The bank check, and why the headline obeys it

    before cards = bank - commitments due before the next payday - bills due before it
    after bills  = before cards + (next salary - that month's commitments)
                   - card bills - card amount owed - commitments still to be charged

`bankShortfall` is what is left uncovered. When it is above zero the headline
can no longer read as calm: it states the shortfall instead of offering a daily
allowance, and the chart's note says the same. A cycle reset never makes owed
money invisible - it moves from "spent this cycle" to "a bill", and the bank
check counts it.

## The card chain

    card spend -> inside the open cycle, counted in Spent
              -> statement day: leaves Spent, becomes an unpaid bill
              -> bill counted against the bank in the bank check
              -> the payment from the bank is a transfer, never spending

Nothing is counted twice: a bill payment is excluded from spending by
`looksLikeCardPayment`.

## Balances

`bankBalance(account, transactions, asOf = today)` is the known balance plus
every transaction after it **up to asOf**. A date in the future is not money.

## Charts, and what feeds them

| Chart | Question | Source |
|---|---|---|
| `burnLine` (Summary) | Am I ahead of an even pace, and is anything uncovered? | `spendDays`, `limit`, `bankShortfall` |
| `committedBar` (Plan) | How much of the month is already spoken for? | `mustTotal`, `flexTotal`, `budget` |
| `goalRing` (Plan) | How close is this goal? | `goalProgress` |
| `inOutBars` (History) | Money in against money out, by month | transactions |
| `categoryBars` (Recap) | Where did it go, biggest first? | transactions |
| `runwayBar` (Summary, business) | How long would the shop last? | `businessRunway` |

Charts never compute money. They are handed figures from the module above.

## Spread (set-aside) commitments

Held back whole by the **budget** (income minus commitments), per CLAUDE.md.

In the **bank check**, which asks what must leave the account before the next
payday, the month in progress is charged for the days of it still to come,
less whatever has already gone on it; later whole months in the window are
charged in full. One rule for the month in progress, whether or not its
payments can be matched. A monthly commitment therefore never costs more than
a month in a month.

## Rollover rules

- Crossing the statement day closes a card cycle. It resets Spent and the
  budget window; it does not reset an obligation.
- Crossing a salary day moves the next payday on by one month; the horizon
  stays one payday long.
- A monthly commitment stays monthly across both. It is satisfied by a payment
  that matches it, or by "mark paid" for that period - never by a boundary.
- "Skip this month" applies to one period and expires with it.
