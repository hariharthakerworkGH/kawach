# KAWACH MASTER PLAN
## Single Source of Truth for Product Improvement

**Last updated:** 2026-09-26  
**Current production:** 4.5 / BUILD 98  
**Current cache:** expense-tracker-v98  
**Latest production commit:** 9c143a2e9cdd386d672227803d7555fcd88d9aa6  
**Architecture:** vanilla JS, static/offline-first, SVG/CSS, no build framework

> This document is the authoritative roadmap for Kawach improvement work.
> The current codebase and live production state take precedence over old phase reports.
> When a new task is inserted, deferred, completed, or reordered, update this document before or with the code change.

---

# 1. PRODUCT NORTH STAR

Kawach should feel like a **quiet-luxury editorial fintech product**:
- calm, useful, spatial, restrained
- strong information hierarchy
- purposeful motion
- sophisticated but understandable financial visualisations
- no excessive neon, glass, bento, fake 3D, or AI gimmicks

The product must remain financially trustworthy. **Financial correctness has priority over visual polish.**

---

# 2. ARCHITECTURE / NON-NEGOTIABLES

- Vanilla JS static/offline-first application.
- SVG/CSS visual system.
- No build framework.
- Design Lab is a reusable visual component library, not a production screen.
- Reuse approved components instead of inventing unrelated UI patterns.
- Do not fabricate trademarked brand logos.
- Brand fallback: **real SVG → category icon → monogram**.
- Preserve physical version snapshots. Never overwrite old snapshots.
- Do not change financial logic, data model, reconciliation, billing-cycle logic, parsers, or commitments during visual work unless the plan explicitly calls for it.

---

# 3. COMPLETED FOUNDATION

## Financial foundation — COMPLETE
Phases 10/11 addressed:
- salary horizon
- rollover
- bank-shortfall behaviour
- related financial correctness issues

## Main-screen DNA migration — COMPLETE
All six primary screens migrated to the DNA system:
- Summary
- History
- Add
- Accounts
- Plan
- Coach

## Design Lab 2.0 — COMPLETE
Established the visual language and reusable chart direction.

## Design Lab 2.1 repair / component catalogue — COMPLETE
Current catalogue:
- 26 components
- 26 demos
- 23 LIVE
- 3 TESTING
- 0 PROPOSED
- 0 DEPRECATED

Testing components:
- KAWACH-STATE-SUCCESS-V1
- KAWACH-STATE-ERROR-V1
- KAWACH-STATE-LOADING-V1

Existing reusable chart functions include:
- allocationRing
- radialMeter
- spendingPulse
- burnLine / Budget Burn
- cashRiver
- commitment radial

## Shared brand alignment — COMPLETE
Monogram rendering now uses fixed per-letter cells to improve optical alignment for marks such as IB/HB/SB.

## Summary projection improvement — COMPLETE in 4.0.7
The Summary hero Budget Burn now communicates:
- actual cumulative spending
- current position
- even-pace reference
- forward projection to cycle end
- projected end-of-cycle spend
- whether the trajectory crosses the budget

This is the intended 'where am I / where am I heading?' financial view.

---

# 4. CURRENT STAGE

## STAGE 1 — VISUAL QA / SUMMARY REFINEMENT
**Status: COMPLETE**

Design Lab 2.1 has been source-audited and approved.

Next work:
1. Visual QA of the live Summary screen.
2. Verify Budget Burn projection at realistic data points.
3. Verify 320 / 360 / 390 / desktop layouts.
4. Verify light and dark mode.
5. Check chart readability, labels, spacing, optical hierarchy and copy.
6. Confirm the top Summary area communicates the user's position immediately.
7. Fix only issues found by QA.
8. Release with the normal version/update process.

### Active Summary follow-up from 4.0.9 screenshots
- Complete: card-cycle and bank-month spending now share a compact line; the unpaid-card warning explains the liability once; the duplicate headline warning was removed.
- Complete: breakdown rows have clear internal padding, a consistent label/amount gap and safe label wrapping.
- Preserve the current financial calculation. Change it only if source inspection and made-up-data tests prove a calculation defect.
- Verified: the current suite passes 133/133, including salary timing and imported statement-day cases.
- Complete: Summary checked with made-up salary, rent, bank and card data at 320 / 360 / 390 / desktop widths in dark and light themes; no horizontal overflow or console errors. The Budget Burn chart and accessible label render at every width.
- Complete: realistic 4-day card-spend pace reports ₹13,250 spent against a ₹65,000 budget, with the expected ₹4,583 over-pace message. No financial logic changed.

### Production CSS regression — inserted before closing Stage 1
- Root cause confirmed from GitHub: production `css/dna.css` is corrupted encoded data, while the 4.0.10 local snapshot has valid CSS. Summary and Accounts therefore lose DNA card, spacing and chart styling.
- Complete: restored `css/dna.css` from the verified 4.0.10 snapshot; the live release displays DNA cards and the Summary Budget Burn chart again.
- Complete: published release 4.0.11 / BUILD 91 / cache v91 and captured snapshot `expense-tracker-versions/4.0.11`.
- Verified live in the browser: release reports 4.0.11; Summary Budget Burn and Accounts cards render with the Design Lab styling.
- Complete: checked the restored production styles against Design Lab 2.1 and completed the responsive, theme and Budget Burn checks above.
- Do not change financial calculations or user data.

Stage 1, Stage 2 and the Stage 3 audit are closed. Stage 4 preflight is active; component promotion is waiting at the APPROVED-status gate.

---

# 5. STAGE 2 — BRAND LIBRARY
**Status: COMPLETE**

The reusable brand architecture and shortlist are in place. The implementation covers:
- food / delivery
- groceries
- shopping
- transport
- entertainment
- payments
- banks
- telecom

Rules:
- Simple Icons marks only when their individual entry explicitly identifies a CC0 license; keep the source and license evidence beside each bundled SVG
- Confirm each candidate against Simple Icons' individual metadata; the collection-wide CC0 license is not sufficient evidence for a brand mark.
- legitimate/local SVG assets only
- no fabricated trademark logos
- fallback remains real SVG → category icon → monogram
- brand resolver stays reusable and centralized

The Design Lab includes representative brand-row examples and documents the fallback behaviour.

Completion evidence:
- `js/brand.js` provides the centralized resolver and deterministic fallback.
- `icons/brands/manifest.js` lists the 40-brand shortlist across all eight categories; all entries correctly remain `asset: false`.
- `icons/brands/SOURCES.md` records the individual Simple Icons metadata review at pinned commit `d0b3c2d7153794b912913746fc0498a5d3211727`: zero candidates meet the explicit `CC0-1.0` inclusion rule.
- No third-party SVGs were added. Category icons and monograms remain the honest fallback until a specific mark’s metadata explicitly qualifies.
- `lab/index.html` renders the shortlist with the actual resolver and explains the live fallback state.

Stage 2 is complete under the stated license rule; its intended outcome is a working, traceable brand library without bundling marks that do not qualify. Proceed to Stage 3.

---

# 6. STAGE 3 — PONYTAIL AUDIT
**Status: COMPLETE — audit only; no fixes applied**

Ponytail is **audit-only first**.

It may identify:
- visual inconsistencies
- dead CSS
- layout problems
- accessibility issues
- unnecessary duplication
- performance concerns

It must NOT modify, without explicit approval:
- financial logic
- parsers
- data model
- reconciliation
- billing-cycle logic
- commitments
- brand system
- Design Lab

Use compact reports only:

**STATUS  
CHANGES  
TESTS  
VERSION  
BLOCKERS  
NEXT**

Do not repeat audits that have already been verified unless a new change touches that area.

### Audit result — 26 September 2026
- Reviewed current GitHub source at commit `4da36816a8a87d026964cf2cb59b8bfdf3db170d`: 76 non-vendored JS/CSS app-shell files, plus the app entrypoints, Design Lab and test index.
- Checked module references and CSS selectors for clear dead code or repeated blocks; found no safe complexity cut and no dependency to remove. Ponytail result: **Lean already. Ship.** `net: -0 lines, -0 deps possible.`
- Visual consistency follow-up for the next Design Lab edit: `lab/index.html` navigation sample order differs from production `index.html`, and the section numbering repeats 17 and skips 18. No production screen or user data was changed.
- Stage 3 is closed as an audit. This follow-up is recorded under deferred visual work.

---

# 7. STAGE 4 — APPROVED COMPONENTS → PRODUCTION
**Status: ACTIVE — waiting for an APPROVED component**

### Stage 4 entry check — 26 September 2026
- Current GitHub catalogue: 23 `LIVE`, 3 `TESTING`, 0 `APPROVED`.
- The three testing entries are `KAWACH-STATE-SUCCESS-V1`, `KAWACH-STATE-ERROR-V1` and `KAWACH-STATE-LOADING-V1`; none has a production screen assigned.
- The Stage 4 rule is to move only components already marked `APPROVED`. No component currently meets that condition, so no production component can be selected or released yet.
- Next: choose one testing component for an explicit readiness review, or provide an already-approved component. Do not bypass the catalogue status.

### Stage 4 approval panel - 26 September 2026
The gate could not be opened because there was no way to approve anything.
The Design Lab now opens with "Waiting for your decision": the components
still marked TESTING, each with the question it answers, where it would go,
what it must never do, the real choice it presents, a preview that redraws as
the choice changes, and Confirm / Change. Choices are kept in the browser they
are made in; confirming records a decision for implementation and does not
change the app, which the panel states on screen.

Components already LIVE are deliberately not offered as options. Swapping one
is a redesign, not a pick, and maintaining parallel designs of a screen would
mean making every future change several times.

Also closed the two deferred Design Lab items: the sample navigation now
matches the running app's order, and the section numbering no longer has a
"00" or a missing 18.

### Caching defect found while publishing that panel - fixed in 4.0.13
The Lab published correctly and a phone that had opened it before still showed
the old page. Cause: the service worker cached every same-origin file it saw,
not only the ones the version ships, and served them without rechecking. The
welcome page, the privacy policy and the Lab were therefore frozen at whatever
copy a person first loaded, and could not be updated without a new app
version. Only APP_SHELL paths are cached or served from the cache now.

Verified on a fresh install: the cache holds exactly its 91 shell entries where
it held 94, visiting the Lab no longer adds to it, and with the server stopped
the shell is still served and the app reports its version, so offline is
intact. Released as 4.0.13 / BUILD 93 / cache v93, commit `0835f2dd57`, snapshot
`expense-tracker-versions/4.0.13`, verified live.

Note for future releases: a change to any page outside APP_SHELL could not
reach existing users before this fix. It can now.

### Direction changed - 26 September 2026: customisation, not approval
The owner's intent for the Design Lab panel was never an approval gate. He
wants the people using Kawach to be able to shape it: "an app that can be
customised as per their choosing and how they feel comfortable", reached from
the app itself rather than a separate page.

That reverses the earlier objection recorded above. Alternatives are not dead
weight to be maintained for nothing; they are the feature, and maintaining
them is the product decision. Stage 4 as written - promote one APPROVED
component into a screen - is therefore no longer the work. It is closed.

Shipped in 4.1: Settings now opens "How it looks", with light or dark
independent of the phone, how much sits under the big number on Summary, and
how six months are drawn on History. Choices are this device's, in
localStorage, beside the space toggle. Nothing there touches the money: the
figures under the hero, the warnings and the breakdown are never part of a
look, because a quieter screen must not be a less honest one.

Both stylesheets gained a forced theme generated from the light rules they
already had. css/tokens.css matters as much as css/dna.css here: the app's
frame still reads the older --bg family, so a theme that reached only the DNA
changed the screens and left the frame dark.

Also in 4.1: a new version is now taken automatically when there is nothing on
screen to lose, reusing the test sync already applies before redrawing; and the
app icons have new filenames, because Android and Windows copy the icon at
install and never look again while the URL is unchanged, which is why a phone
installed in the green-logo era kept showing it.

Next for customisation: more choices, added only where two finished designs
genuinely exist or are worth designing. The honest way to add more is one
screen at a time - three complete versions of a screen, one chosen - rather
than inventing alternatives for all 26 components at once and having to keep
every one of them working for ever.

Released as 4.1 / BUILD 94 / cache v94, commit `fc0d41d9bb`, snapshot
`expense-tracker-versions/4.1`, verified live. 141 tests pass.

### Customisation, by phases - agreed 26 September 2026
The owner has asked for the whole app to become customisable, in phases of my
choosing. A choice is only added where two finished ways of doing the thing
exist, or are worth designing, and where a person can feel the difference.
Nothing that explains the money is ever part of a look.

**Phase 1 - done (4.1, 4.2).** The mechanism, plus daylight, the Summary
headline and the History drawings. 4.2 added previews: each option is drawn
from the person's own money using the real component, because the screens and
the preview now call one shared function (spendingHero, sixMonthCharts). A
preview that could drift from the screen would be worse than none.

**Phase 2 - next.** Accounts, and which screen the app opens on.
- Accounts: the ring above the list, the list alone, or balances hidden until
  tapped. The last is a real need rather than a taste - a person checking
  their phone on a bus should be able to keep the numbers off the glass.
- Opening screen: Summary today for everyone; some people want Add.

**Phase 2 - done (4.3).** Accounts (the ring, the list alone, or balances
covered until Show is tapped) and the screen Kawach opens on. Also fixed the
manifest being served from the cache: it is read by the operating system, not
the app, so a stale copy kept telling Android about icons that had been
replaced. That was a real cause of home screens keeping the old mark.

**Phase 3 - done (4.4).** Plan can keep the arranged order or sort by due day
or by size, with Reorder shown only where it means something. Add can fold the
date, account and repeats behind one tap; they are folded, never removed, so
every input still exists for the code that finds them by id. Verified by
saving a real entry on the short form.

**Phase 3.** Plan and Add.
- Plan: commitments grouped as must and flex, one list by day, or by size.
- Add: the full form, or a quick one with amount and category and the rest
  behind a tap.

**Phase 4 - done (4.5).** Text size (normal, larger, largest) and spacing
(comfortable or compact). Type is in rem in both stylesheets, so one font-size
on :root carries every size with it. The DNA's pixel spacing is restated for
compact, generated from the tokens already in the file so the two cannot
drift. --k-tap (44px) and --k-1 (4px) are identical at every setting: a
tighter screen must not be a harder one to hit. Checked at 320px across all
six screens in all six combinations with no overflow anywhere.

**Customisation is complete as planned. Nine choices.** Before adding a tenth,
find out which of these are actually used. A choice nobody makes is a screen
nobody needed, and it still has to be kept working for ever. There is no way
to measure that without watching people, and Kawach has no analytics by
design, so the honest method is to ask the people using it.

After each phase, look at what is actually being used before adding more. A
choice nobody makes is a screen nobody needed, and it still has to be kept
working for ever.

Released 4.2 as `25e3413c76`, snapshot `expense-tracker-versions/4.2`, verified live.
141 tests pass.

Move only approved Design Lab components into production screens.

Process:
1. Select component.
2. Confirm status APPROVED.
3. Define production placement and user question it answers.
4. Implement.
5. Test responsive/light/dark states.
6. Verify console and overflow.
7. Release.
8. Mark component LIVE.

Do not add visual components merely because they look attractive. Every visualization must answer a useful financial question.

---

# 8. STAGE 5 — REAL CREDIT-CARD VALIDATION
**Status: ACTIVE - validation under way**

### Validation run - 26 September 2026 (made-up data only)
Worked from a clean copy of GitHub `main` at `50a44b03`, hash-verified file by
file (131 of 131 identical). Baseline suite re-run before any change: 133 of 133
pass.

Validated against the real modules with invented figures:
- Statement date vs transaction date: a row dated 28 Aug printed on the 25 Sep
  statement is billed on the 25 Sep statement. The statement period wins over
  the row date. Correct.
- Unmatched manual expense: a hand-logged card spend inside a cycle that has
  closed with no statement imported becomes `billedNotImported` and raises
  `statementMissing`. Correct.
- Payments: a partial payment leaves the remainder billed; paying more than the
  bill moves the excess onto the open cycle; a payment with no bill in the app
  to settle is ignored rather than reducing this cycle. Correct, and the last of
  those is the guard that stops large card spends reading far too low.
- Reconciliation: a statement row two days from a logged entry of the same
  amount pairs with it and keeps the category chosen by hand. Correct.
- Rollover and bank shortfall: covered by the existing suite and re-verified in
  the 133-test baseline. No change.

**Defect found and fixed.** Two places worked out where a card's open cycle
begins, and they disagreed for cards billing on the 28th to the 31st.
`computeCycleBoundary()` in `js/billing-cycle.js` built the statement day with
`new Date(y, m, day)`, which rolls into the next month when the month is
shorter, so a card billing on the 31st produced a boundary of 1 May instead of
30 Apr, and after a short February could produce a boundary later than today.
Spending was then filed in neither the closed cycle nor the open one.
`closeOnOrBefore()` in `js/account-metrics.js` already clamped correctly; the
two now agree and a test pins them together at every awkward statement day.

Scope of that defect, checked before fixing: no money figure was wrong. The
headline budget, spent and left come through `cardPosition()`, which was always
correct. The stale boundary reached only the per-day series behind the Summary
Budget Burn drawing, where the affected spending fell into the undated opening
block instead of stepping on its own day; the line still ended on the right
total. It was a chart-fidelity fault with a latent financial trap, not a
miscalculation. The owner's own cards all bill on the 25th and were never
affected.

Changed: `js/billing-cycle.js` only. No protected module touched.
`currentCycleStart()` gained an optional third argument so a boundary can be
checked at a given date; existing callers pass two arguments and are unchanged.

Tests: 138 pass, 5 added. The two boundary tests were mutation-checked by
restoring the old maths, and both failed with the expected values before the fix
was put back.

Not yet done, and still required before credit-card capacity work:
1. Drive real credit-card statements through the import UI end to end. Static
   checks do not catch this class of fault; the 4.0.3 import regression proved
   that. This needs the owner, on his own device, with his own files.
7. Decide the credit-limit field. Confirmed absent from the data model: no
   `creditLimit` or equivalent appears anywhere in `js/`.

Released as 4.0.12 / BUILD 92 / cache v92, commit `b35f32655e`.
Snapshot `expense-tracker-versions/4.0.12` taken and verified file by file.
Verified live: getkawach.com reports 4.0.12, serves the clamped boundary, and
all 91 app-shell files fetch cleanly with no corrupted stylesheet.

Before further credit-card visualisation:
1. Test against real-world credit-card statement examples.
2. Validate statement date vs transaction date.
3. Validate billing-cycle boundaries.
4. Validate unmatched manual expense → next bill/cycle behaviour.
5. Validate payments and reconciliation.
6. Validate rollover and bank-shortfall interactions.
7. Decide/implement the underlying credit-limit data-model field.
8. Only then implement credit-card capacity visualization.

**Important:** credit-card capacity visualization is currently blocked because the required credit-limit field is not in the data model.

---

# 9. DEFERRED VISUAL WORK

## Design Lab consistency follow-up
- Before the next Design Lab edit, align the navigation sample with production order and correct the duplicate 17 / missing 18 section numbers.
- This is confined to the Design Lab and does not block an app release unless the lab itself is changed.

## Cash River
- Renderer exists and is tested.
- Catalogue status is reconciled with its History placement.
- Do not force it into additional production screens without a clear user question.

## Credit-card capacity visualization
Blocked by the missing credit-limit data model. Do not fake capacity from incomplete data.

---

# 10. DESIGN LAB COMPONENT NAMING

Use:

**KAWACH-[CATEGORY]-[NAME]-V[NUMBER]**

Examples:
- KAWACH-HERO-METRICS-V1
- KAWACH-CHART-CASH-RIVER-V1
- KAWACH-CHART-COMMITMENT-METER-V1
- KAWACH-CHART-SPENDING-PULSE-V1
- KAWACH-CHART-ALLOCATION-RING-V1
- KAWACH-INSIGHT-CALM-V1
- KAWACH-ROW-TRANSACTION-BRAND-V1

Lifecycle:
**PROPOSED → TESTING → APPROVED → LIVE → DEPRECATED**

---

# 11. RELEASE DISCIPLINE

Every release must follow:

**CODE → TESTS → VERSION → BUILD → SERVICE-WORKER CACHE → WHAT'S NEW → SNAPSHOT → GITHUB → LIVE VERIFICATION**

Current:
- 4.5
- BUILD 98
- cache v98
- snapshot expense-tracker-versions/4.5

Never declare a release complete until the installed PWA can actually detect it.

---

# 12. VERSION SNAPSHOTS

Existing snapshots must never be overwritten:
- versions/0.0.1
- versions/0.0.2
- versions/0.0.3
- versions/0.0.4
- versions/0.0.5
- versions/0.0.6
- versions/0.0.7
- expense-tracker-versions/4.0.10
- expense-tracker-versions/4.0.11
- expense-tracker-versions/4.0.12
- expense-tracker-versions/4.0.13
- expense-tracker-versions/4.1
- expense-tracker-versions/4.2
- expense-tracker-versions/4.3
- expense-tracker-versions/4.4
- expense-tracker-versions/4.5

Every meaningful phase/release gets a new snapshot.

---

# 13. INSERTING NEW WORK MID-PLAN

A new task is allowed at any point.

When adding one:
1. Give it a clear name.
2. Record why it was added.
3. State whether it blocks or depends on another stage.
4. Insert it into the correct position.
5. Update CURRENT STAGE.
6. Update affected stage statuses.
7. Update the release/version target if required.
8. Record completion when finished.

**Do not silently create a parallel roadmap in chat.**

If a new task changes the order, this document is updated first.

---

# 14. SESSION HANDOFF RULE

At the beginning of a new Claude/ChatGPT session, read this file first.

Then inspect the current codebase and live version.

Do not trust an old conversation, old report, or remembered phase over:
1. this document,
2. the current source,
3. the current live production state.

At the end of a meaningful work session, update this document with:
- what changed
- what was verified
- what remains
- current stage
- next exact step
- current version/build if released

---

# 15. CURRENT NEXT ACTION

**Next: Stage 5 - the owner drives real credit-card statements through the import UI, and decides the credit-limit field. Stage 4 stays open at the component approval gate (0 APPROVED entries) and needs one component chosen for a readiness review.**

Do not begin another broad redesign before this checkpoint is closed.

