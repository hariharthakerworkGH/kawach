# 0.0.3

| | |
|---|---|
| Phase | 12 - Design Lab 2.0 drawings in production |
| Date | 2026-09-26 |
| App version | 4.0.3 |
| Build | 83 |
| Cache | expense-tracker-v83 |
| Base | 4.0.2 / BUILD 82 (live) |

## What was added

Four drawings from the Lab, each handed figures the model already produced.
None of them does arithmetic on money.

| Drawing | Question | Where |
|---|---|---|
| `allocationRing` | How is what I hold split? | Accounts, Summary |
| `radialMeter` | How much of the month is spoken for? | Summary, Plan |
| `spendingPulse` | When in the period does my spending happen? | Summary |
| `cashRiver` | Is more coming in than going out? | available, not yet placed |

Reconciliation checked by measurement, not by eye: the Accounts ring's legend
sums to the hero total exactly (1,18,840 + 15,000 = 1,33,840), and the meter's
committed plus budget equals income exactly (82,200 + 13,800 = 96,000).

## A drawing that was not built

The brief asked for a ring splitting "money you hold" against "room left on
your cards". **A credit limit does not exist anywhere in the data model** - no
screen asks for it and no statement reader takes it - so that half would have
had to be invented. Instead the ring splits the money actually held into what
card bills already claim and what is still free, which answers the same
worry with figures that exist.

## Statement reconciliation

An entry you logged that the statement does not show now carries one explicit
action, "Put on next bill". It re-dates the existing entry to the first day of
the next cycle. Nothing is created, so the money cannot be counted twice, and
re-importing the same statement later finds the entry outside the period and
leaves it alone. Doing nothing leaves it exactly where it is.

## The pie rule

`js/charts.js` says "never a pie". The rule stands for comparing quantities;
a ring is now allowed for one job, showing how a total splits, and always
with the figures listed beside it so nothing is judged by the angle of a
slice. The exception is written where the rule is.

## Tests

131 pass (126 before, 5 added).

## Known issues

- `cashRiver` is built and tested but not placed on a screen: History's
  existing six-month bars already answer its question, and two drawings of
  one question on one screen is worse than one.
- No credit limit in the data model, above.
- `.account-card` dead CSS in compound selectors.
