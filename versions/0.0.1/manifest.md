# 0.0.1

| | |
|---|---|
| Phase | 10 - financial logic stabilisation + period rollover |
| Date | 2026-09-26 |
| App version | 4.0.1 |
| Build | 81 |
| Cache | expense-tracker-v81 |

## Why this phase happened

On the owner's phone, crossing from 25 to 26 September turned "Left to spend"
from **-64,223** into **+9,845** overnight, with no new money and nothing
spent. Underneath it, the bank check said he would be **25,165 short** after
salary and bills. The screen was giving two answers at once and the
reassuring one was on top.

## What was actually wrong

1. **The horizon doubled at the statement day.** `salary.dates` ran from the
   next payday up to the first payday on or after the cycle close. Before the
   25th that is one salary; from the 26th the cycle close jumps a month, so a
   second salary and a second month of commitments came with it. Measured: the
   bank check improved by a net month (16,357 -> 52,261) for no reason. The
   module's own header and its existing test both say one salary, so this was
   the post-statement window disobeying the documented contract.

2. **The headline never read the check underneath it.** `level` was computed
   from `free`, `used` and `crossesOn` only. It could say "About 328 a day"
   while `bankLevel` said "over".

## What was deliberately NOT changed

The budget rule in CLAUDE.md stands: a cycle lives on its own salary, and the
bank balance never raises the budget. So a new cycle still starts with a
fresh budget after an expensive month. The owner chose this over carrying the
overspend forward, which would have made one bad month depress every later
one. The money owed is not hidden - it is counted in the bank check, and the
headline now defers to it.

## Changed files

See `changed-files.txt`.

## Tests

120 pass (117 before, 3 added):

- the plan looks one payday ahead, on both sides of the statement day
- a new cycle does not go quiet about money the bank cannot cover
- a healthy month is still allowed to look healthy

## Known issues

- `.account-card` is dead CSS inside compound selectors in style.css.
- Whether style.css retires now that all six screens are on dna.css is undecided.
- The 4,000 - 7,025 "before salary" rows on the owner's phone come from spread
  commitments being pro-rated; not investigated this phase, not suspected wrong.
