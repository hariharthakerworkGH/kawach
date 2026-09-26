# KAWACH MASTER PLAN
## Single Source of Truth for Product Improvement

**Last updated:** 2026-09-26  
**Current production:** 4.0.10 / BUILD 90  
**Current cache:** expense-tracker-v90  
**Latest production commit:** 4672053ab9c88d8afc795843acd16843b4bb65fe  
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
**Status: ACTIVE**

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
- Verified: existing suite passes 132/132, including salary timing and imported statement-day cases. Remaining: check the live page at responsive widths, light/dark mode and Budget Burn before closing Stage 1.

Do not start the Brand Library until this checkpoint is visually acceptable.

---

# 5. STAGE 2 — BRAND LIBRARY
**Status: NEXT**

Build the reusable brand architecture and curated legitimate SVG assets for:
- food / delivery
- groceries
- shopping
- transport
- entertainment
- payments
- banks
- telecom

Rules:
- legitimate/local SVG assets only
- no fabricated trademark logos
- fallback remains real SVG → category icon → monogram
- brand resolver stays reusable and centralized

The Design Lab should include representative brand-row examples and document fallback behaviour.

---

# 6. STAGE 3 — PONYTAIL AUDIT
**Status: AFTER BRAND LIBRARY**

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

---

# 7. STAGE 4 — APPROVED COMPONENTS → PRODUCTION
**Status: AFTER PONYTAIL**

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
**Status: DEFERRED / HIGH PRIORITY FINANCIAL VALIDATION**

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
- 4.0.7
- BUILD 87
- cache v87
- snapshot versions/0.0.7

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

**Finish live responsive, light/dark and Budget Burn QA for Summary 4.0.10, then proceed to Stage 2 — Brand Library.**

Do not begin another broad redesign before this checkpoint is closed.
