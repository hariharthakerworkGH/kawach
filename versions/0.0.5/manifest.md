# 0.0.5

| | |
|---|---|
| Phase | 14 - import repair and alignment |
| Date | 2026-09-26 |
| App version | 4.0.4 / BUILD 84 |
| Cache | expense-tracker-v84 |

## Two faults stopped statements importing

**1. The PDF worker never loaded.** workerSrc was the bare string
"./pdf.worker.min.js", which the browser resolved against the *page*, so the
app asked for /pdf.worker.min.js and got a 404. pdf.js then fell back to
reading on the main thread, which opens a small file and stalls on a real
statement. Now resolved against the module with import.meta.url.

**2. A regression shipped in 4.0.3.** The phase 12 reconciliation change
referenced statementEnd inside renderResults(), but that variable is local to
analyse(). Every PDF import died with "statementEnd is not defined" and left
the check page empty. It travels on state now.

Verified end to end against a real HDFC Millennia statement: 9 rows parsed,
"Save 9 new" on the review.

## A wrong password now says so

passwordErrorKind() is split out and tested. pdf.js reports these as a
PasswordException, but the name does not survive every minified build, so the
codes (1 needs one, 2 was wrong) and the message are checked too. A wrong
password is recognised rather than falling through to "couldn't read this
file", which told the person nothing.

## Alignment

- Anything under an account row now starts where the account name starts.
  Detail and Edit were sitting at the card edge, 50px left of everything else.
- The line under an account name may wrap instead of truncating, so
  "same as your passbook" is no longer cut to "same as your pass...".
- The in/out legend had a gap with no display:flex, so it rendered as
  "inoutSept keeps...". Fixed, and the sentence is a block again so the
  spaces around the bold figure survive.

## Lab 2.1 visuals now in the app

- KAWACH-CHART-CASH-RIVER-V1 on History, folded under the six-month bars.
- Kawach artwork on empty states, through emptyState({ art }).

Both move from TESTING toward LIVE; the catalogue is updated next phase once
they have been used in anger.

## Tests

132 pass (131 before, 1 added for password classification).

## Known issues

- No credit limit in the data model.
- .account-card dead CSS in compound selectors.
