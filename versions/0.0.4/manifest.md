# 0.0.4

| | |
|---|---|
| Phase | 13 - visual library / Design Lab 2.1 |
| Date | 2026-09-26 |
| App version | 4.0.3 / BUILD 83 (unchanged) |
| Published | no |

## What this phase produced

A named catalogue, so a future instruction can say "use
KAWACH-CHART-CASH-RIVER-V1 on History" and mean exactly one thing.

- `lab/catalogue.js` - the register: 26 components, each with an id,
  status, the question it answers, the screens it is on, its dependencies,
  its data contract and its do-not rule.
- `lab/index.html` - Lab 2.1. The catalogue section renders each entry by
  calling the real component, so the catalogue cannot drift from the app.
- `icons/brands/manifest.js` - 40 merchants across 8 categories, each
  marked for whether a licensed asset exists. None does.
- `icons/art/` - 4 original Kawach SVGs.

## Status of the register

22 LIVE, 4 TESTING, 0 PROPOSED, 0 DEPRECATED.

TESTING means built and covered by tests but not placed on a screen:
CASH-RIVER-V1, STATE-SUCCESS-V1, STATE-ERROR-V1, STATE-LOADING-V1.
Nothing was promoted to LIVE for looking good.

## Rules the register carries

- A LIVE component is never edited in place. It gets a V2 and V1 stays.
- Charts receive figures; they never calculate money.
- The number comes first, the drawing explains it.
- No third-party mark is drawn or approximated.

## Not changed

No financial module, no parser, no view behaviour, no service worker, no
version. `js/brand.js` and its fallback are untouched.
