# 0.0.2

| | |
|---|---|
| Phase | 11 - financial truth + charts |
| Date | 2026-09-26 |
| App version | 4.0.2 |
| Build | 82 |
| Cache | expense-tracker-v82 |
| Base | 4.0.1 / BUILD 81 (phase 10, never published) |

## What this phase found

A date-boundary sweep (24, 25, 26, 27, 29, 30 Sep, 1, 2, 25, 26 Oct on one
fixed dataset) showed phase 10's fixes holding: one salary and one funded
month on every day, a constant budget, and card money moving from "owed this
cycle" to "billed" without being lost. Two new faults appeared.

**1. A balance counted money that had not arrived.** `bankBalance` applied
every transaction dated after the last known balance, with no upper bound. A
salary dated the 30th was in "In bank" on the 24th. Measured on the sweep:
the bank showed 2,84,474 on 24 September instead of 51,474, and the bank
check - the very figure phase 10 taught the headline to obey - read 2,58,174
instead of 25,174. The safety net was reading about 2.3 lakh too high.

Reachable in the product: the Add screen's date field has no maximum, and a
provident-fund month is written on the last day of its month.

**2. The chart disagreed with the headline.** Phase 10 let the headline say
"short after salary and bills". `burnLine` knew only about the cycle budget,
so it went on printing "You are X under the even pace" underneath it.

## 3. A month in progress had two rules (resolved in 11.1)

A spread commitment charged the month in progress **in full** when its
payments could be matched, and **pro rata for the days still to come** when
they could not - two rules for the same month. On 30 September that billed
September's whole 30,000 against its one remaining day and then added 29/31
of October on top: 58,065 of a 30,000 commitment inside a single 30-day pay
period.

The documented rule is the pro-rata one (unit test: "spread commitment: the
rest of this month pro rata, next month in full"). The matched branch now
follows it too, taking whichever is smaller - what is left of the month, or
the share the remaining days can use. Later months are untouched, so "next
month in full" still holds.

    30 Sep  1/30 of September (1,000) + 29/31 of October (28,064.52) = 29,064.52
    1 Oct   29/31 of October                                         = 28,064.52
    10 Oct  20/31 of October                                         = 19,354.84

Never more than one month per month, asserted directly in the test.

## 4. Future-dated spends

The Add screen's date field is capped at today. A spend is something that
happened. The provident-fund form still writes a month-end date on purpose -
that is a contribution for a month, not a spend - and goal dates on Coach are
targets, so both are left alone.

## Tests

126 pass (120 before phase 11, 6 added).

## Known issues

- `.account-card` dead CSS in compound selectors.
