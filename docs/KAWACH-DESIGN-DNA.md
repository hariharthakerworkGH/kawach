# Kawach Visual DNA

The foundation for the redesign. Every value here is in `css/dna.css` and shown
in `/lab/`.

**Nothing in this document is live.** The app still runs on `css/tokens.css` and
`css/style.css`, and production is still 3.3.1 / BUILD 79. `dna.css` is loaded by
the design lab and by nothing else.

---

## 1 · Philosophy

Kawach tells someone how much of their own money they can safely spend. It is
read in thirty seconds, standing in a shop, usually when the answer matters.
Three things follow from that, and everything else in this document is a
consequence of one of them.

**One answer per screen.** A screen that gives two answers has given none. The
hero is the answer; everything else is the working.

**Depth instead of borders.** A thing is separated from what is behind it by
being made of different material and catching different light, not by having a
line drawn around it. The old system reached for an outline every time it wanted
to group something, and a screen became a stack of boxes. Lines are what we use
when material cannot do the job.

**Light is rationed.** Light is the loudest thing in this system, so it is spent
on the few things that lead: the figure that answers the screen, the line that
explains the figure, the thing you have chosen, the one action. **At most three
glowing objects on a screen.** The moment everything glows, nothing is being
pointed at, and the product reads as a game.

The feeling to aim at is a private bank's statement, not a trading terminal:
expensive, quiet, and completely unbothered. If a change makes Kawach more
exciting, it is probably wrong.

---

## 2 · Principles

| | |
|---|---|
| **Depth over borders** | Surface, sheen, shadow. An outline only where material cannot separate. |
| **Light guides attention** | Strong on the answer, the lead chart, the active state, the one action. Quiet everywhere else. |
| **Glass has hierarchy** | Four levels, each differing measurably in fill, blur, highlight, shadow and line. |
| **Colour means something** | Three accents on one hue sweep, four money colours. No decorative colour. |
| **Type is expensive** | Four weights, not eight. Figures track tighter as they grow. |
| **Charts are the brand** | Luminous strokes, no axes, no grid. A drawing answers what a number cannot. |
| **Controls are one family** | One geometry, three voices. One filled control per screen. |

---

## 3 · Colour

### Ground and surface

| Token | Value | Use |
|---|---|---|
| `--k-bg` | `oklch(12% 0.016 268)` | the page. Not `#000`: black kills the sense of a lit room and makes every edge a hard cut on OLED |
| `--k-bg-elev` | `oklch(15.5% 0.018 268)` | nav, sheets |
| `--k-surface` | `oklch(19% 0.019 268)` | L1 |
| `--k-surface-elev` | `oklch(22.5% 0.021 268)` | L2, L3 |
| `--k-surface-hero` | `oklch(26% 0.024 268)` | L4 |
| `--k-surface-press` | `oklch(24% 0.022 268)` | a row under a finger |

Each surface step is about 3.5% lightness, the smallest difference that still
reads as "in front of".

### Ink

| Token | Value | Worst measured |
|---|---|---|
| `--k-text` | `oklch(97% 0.004 260)` | **14.3:1** |
| `--k-text-2` | `oklch(73% 0.014 262)` | **6.5:1** |
| `--k-text-3` | `oklch(65% 0.016 262)` | **4.8:1** |

Three levels and no more. A fourth is always someone hiding something they
should have deleted.

`--k-text-3` started at 60% and measured **3.93:1** against the hardest
background the system can produce, which is a hero pane standing in the
strongest part of the atmosphere. That is below the 4.5 floor. It is 65% because
that is the first step that clears it everywhere. **Measure against the
composite, never against a flat swatch.**

### Lines

Expressed as white at an opacity, so one value works over every surface level.

| Token | Value |
|---|---|
| `--k-hairline` | `oklch(100% 0 0 / 0.06)` |
| `--k-border-subtle` | `oklch(100% 0 0 / 0.10)` |
| `--k-border` | `oklch(100% 0 0 / 0.14)` |
| `--k-border-emphasis` | `oklch(100% 0 0 / 0.22)` |

### Accents

| Token | Value | Meaning |
|---|---|---|
| `--k-cyan` | `oklch(82% 0.13 206)` | **interaction.** The one thing you can press, where you are, focus, the line a chart draws |
| `--k-violet` | `oklch(66% 0.17 292)` | the second voice in a comparison. Never an action |
| `--k-magenta` | `oklch(72% 0.19 330)` | the far end of the sweep. Mostly inside a drawing |
| `--k-accent-ink` | `oklch(17% 0.04 220)` | text on a filled accent |

Cyan, violet and magenta are one continuous hue sweep (**206 → 292 → 330**),
which is why a gradient between any two never muddies. This is the evolution
from the 3.3 palette: magenta is the new third point and it earns its place in
charts, where two colours were not enough to tell six months apart.

### Money

| Token | Value | Meaning |
|---|---|---|
| `--k-positive` | `oklch(80% 0.16 158)` | money in, paid, on track |
| `--k-negative` | `oklch(70% 0.18 22)` | money gone, over, overdue |
| `--k-warning` | `oklch(83% 0.15 78)` | needs you |
| `--k-info` | = cyan | informational |

These four never decorate anything. **Red is not a chart colour**: it is kept for
money that has actually gone, so a drawing never reaches for it to look lively.

Measured on glass L2 in the worst room: positive **9.51**, negative **5.76**,
warning **9.73**, accent **10.03**.

---

## 4 · Glass

Four levels. Each differs in **all five** of fill, blur, highlight, shadow and
line, so they can be told apart at a glance and nobody has to guess.

| Level | Token | Fill | Blur | Shadow | Line | For |
|---|---|---|---|---|---|---|
| **0** | — | none | — | — | — | atmosphere. Most things live here |
| **1** | `--k-glass-1` | 58% | 10px | none | hairline | a quiet panel, a list, a row group |
| **2** | `--k-glass-2` | 64% | 16px | soft | hairline | a data card. **The default** |
| **3** | `--k-glass-3` | 74% | 22px | elevated | subtle | focused: opened, chosen, pointed at |
| **4** | `--k-glass-4` | 70% | 30px | hero | subtle | the hero. **One per screen** |
| sheet | `--k-glass-sheet` | 92% | 40px | hero | subtle | over everything; the page must not read through |

Supporting values: `--k-sheen` and `--k-sheen-hero` (the light along the top
edge, and the difference between a physical surface and a swatch),
`--k-inner-top` `inset 0 1px 0 0 oklch(100% 0 0 / 0.09)`, hero `/ 0.14`.

**Only heroes, the nav and sheets blur.** A dozen blurred panes in a scrolling
list costs real frames on a mid-range Android, and the translucent fill alone
carries the light through.

---

## 5 · Typography

One family: **Geist**, shipped in `fonts/`. Nothing is ever fetched.

| Token | Value | Use |
|---|---|---|
| `--k-hero` | `clamp(3.1rem, 13.5vw, 4.25rem)` | the one answer |
| `--k-display` | `2.25rem` | a figure a card is about |
| `--k-title` | `1.5rem` | the screen's name |
| `--k-heading` | `1.125rem` | a heading inside a screen |
| `--k-value` | `1.25rem` | an ordinary money figure |
| `--k-value-sm` | `1rem` | a figure in a row |
| `--k-body` | `0.9375rem` | sentences, names |
| `--k-label` | `0.8125rem` | the name of a thing |
| `--k-caption` | `0.6875rem` | the line under it |

**Four weights and no others.** `--k-w-fig` 640 · `--k-w-strong` 700 ·
`--k-w-label` 500 · `--k-w-body` 400. Weight says what a thing is, not how loud
it is, so the same kind of information is the same weight everywhere.

Tracking: `--k-track-hero` −0.045em, `--k-track-display` −0.03em,
`--k-track-title` −0.02em, `--k-track-caption` +0.04em. **Figures are tracked
tighter as they grow** — a large number at normal tracking reads as a
scoreboard, which is the single most common way a finance UI looks cheap.

Every money figure uses `font-variant-numeric: tabular-nums` so columns line up.

Form fields are **16px exactly**. Below that iOS zooms the page on focus and the
person loses their place. It is the one place a raw size is correct.

---

## 6 · Spacing

A 4-point scale, named by size: `--k-1` 4 · `--k-2` 8 · `--k-3` 12 · `--k-4` 16 ·
`--k-5` 20 · `--k-6` 24 · `--k-8` 32 · `--k-10` 40 · `--k-12` 48 · `--k-16` 64.

Nothing writes a raw value. Spacing communicates grouping: things that belong
together are `--k-2` or `--k-3` apart, separate ideas `--k-8` or more.

---

## 7 · Radius

| Token | Value | What gets it |
|---|---|---|
| `--k-r-xs` | 8px | a tag, a swatch |
| `--k-r-sm` | 12px | an icon tile, a small control |
| `--k-r-md` | 16px | an input, a raised strip |
| `--k-r-lg` | 22px | a data card |
| `--k-r-xl` | 28px | a hero, a sheet |
| `--k-r-2xl` | 36px | a full-bleed feature panel |
| `--k-r-pill` | 999px | buttons, chips, meters |

**Nothing is ever rounder than its parent.**

---

## 8 · Shadow and glow

Shadow, three depths: `--k-shadow-soft`, `--k-shadow-elev`, `--k-shadow-hero`.

Glow, one per meaning: `--k-glow-cyan` / `-violet` / `-magenta` / `-positive` /
`-negative` / `-warning`, all `0 0 22–26px` at 24–30% mix. Plus `--k-glow-text`
`0 0 34px` at 18%, which is light thrown by a figure itself rather than by a box
behind it.

**The budget is three glowing objects per screen.** Typically: the hero figure,
the lead chart's stroke, and the active nav item.

---

## 9 · Atmosphere

Two fixed layers behind everything. The near field at the top, where the light
comes from, and the far field, which keeps the room lit below the fold instead
of stopping at the header.

| Token | Value | Placement |
|---|---|---|
| `--k-atm-cyan` | **10%** | 14% 0%, upper left |
| `--k-atm-violet` | **9%** | 92% 3%, upper right |
| `--k-atm-magenta` | **6%** | 118% 58%, right edge |
| `--k-atm-warm` | **4%** | 110% 100%, lower right |
| `--k-atm-warm-hue` | `oklch(74% 0.12 52)` | — |

**These numbers are a ceiling set by measurement, not by taste.** Above roughly
a tenth of a wash at any one pixel, `--k-text-3` stops clearing 4.5:1 against its
own background, and text does sit bare on the atmosphere. Wider and weaker reads
as more room, not less, so the atmosphere survives the cap.

The warm field is 4% and sits in the far corner, where no text goes. It is light
on a far wall, not the amber that means "this needs you" — that one is a colour
on a figure or a word. **Do not raise it** to make the corner more visible.

---

## 10 · Chart language

| Class | Treatment |
|---|---|
| `.k-chart__line` | cyan, 2.5px, round caps, `drop-shadow(0 0 6px cyan/55%)` |
| `.k-chart__ref` | `--k-text-3`, 2px, dashed 4 6, opacity 0.7, **never lit** |
| `.k-chart__area` | a gradient of the line's colour, 26% → 0% |
| `.k-chart__dot` | the current day. Lit, with a 20% halo behind it |
| `.k-chart__track` | the empty part of a bar, `--k-surface-elev` at 55% |
| `.k-chart__bar` | a gradient, rounded caps, `drop-shadow(0 0 5px 32%)` |
| `.k-chart__ring-*` | 9px stroke, the cyan → violet → magenta gradient |
| `.k-chart__tick` | 10px, `--k-text-3` |
| `.k-chart__note` | `--k-label`, `--k-text-2`: the sentence that replaces a legend |

**No axes. No grid. No legend longer than the sentence it replaces.** The thing a
line is measured against is never lit — that is its whole job. A drawing is
allowed only when it answers a question a number cannot.

---

## 11 · Controls

Three heights: `--k-ctl-lg` 52px (full-width primary), `--k-ctl-md` 44px (row,
select, segmented), `--k-ctl-sm` 34px (chip).

**A glyph may be small. Its target may not.** Every small control carries an
invisible `--k-tap` (44px) strip centred on it via `::before`. Nothing moves in
the layout and everything can be hit. Growing the pills instead would change the
density of every screen.

| Component | Voice |
|---|---|
| `.k-btn--primary` | filled cyan, 52px, inner highlight + cyan glow. **One per screen** |
| `.k-btn--secondary` | glass, subtle line |
| `.k-btn--ghost` | text only |
| `.k-chip` | 34px pill. Chosen = 14% accent tint + 42% ring + glow |
| `.k-seg` | one track, one lit cell |
| `.k-input`, `.k-select` | glass, 16px text, cyan ring on focus |
| `.k-toggle` | 52 × 30px, knob slides 22px |

**Chosen is a tint plus a ring, never a second filled block.** A filled control
means "this is the action", and a screen has one.

`.k-select` keeps the native element entirely — all its keyboard and screen
reader behaviour — and only its skin changes. The browser's own arrow is
replaced because it is the one control that never matches.

**One disclosure in the whole product.** The row is a flex line with the arrow
last, so the arrow sits at the trailing edge whatever the row holds; the whole
row is the target and is at least 44px; closed the arrow is `--k-text-2`, open it
turns up and takes the accent. **A screen never nudges a chevron.**

---

## 12 · Iconography

Consistent weight and three sizes: `--k-icon-lg` 1.5rem, `--k-icon-md` 1.25rem,
`--k-icon-sm` 1rem. No glyph sets its own scale.

A category's colour lives on its icon, in a `.k-icon` tile: 13% tint fill, 26%
border, full-strength glyph. Not a saturated filled block — that is a lot of
colour for a thing whose job is to be recognised at a glance in a list.

No emoji, no text characters as icons, no mixture of outlined and filled.

---

## 13 · Motion

| Token | Value | For |
|---|---|---|
| `--k-t-instant` | 0ms | — |
| `--k-t-fast` | 140ms | a press |
| `--k-t-normal` | 240ms | a state change |
| `--k-t-slow` | 420ms | something arriving |
| `--k-t-draw` | 900ms | a chart drawing itself |
| `--k-ease` | `cubic-bezier(0.16, 1, 0.3, 1)` | almost everything |
| `--k-spring` | `cubic-bezier(0.34, 1.26, 0.64, 1)` | a sheet only. Overshoot is tiny on purpose |

Defined behaviours: page transition (fade + 14px rise, staggered 60ms),
hero entrance, number count-up (900ms, cubic ease-out), chart draw
(`stroke-dashoffset`), glass illumination (border + glow over `--k-t-normal`),
button press (1px down, shadow off), sheet (spring from 100%).

**Nothing loops, nothing bounces, nothing moves that is not answering
something.** Reduced motion is one rule for the whole system: every animation
and transition drops to 0.01ms. The state still changes; it stops sliding into
it. The count-up is additionally guarded in JS, and the final value is in the DOM
from the first frame so a screen reader never sees the count.

---

## 14 · Accessibility

- **4.5:1 for text, measured against the composite** — the surface over the
  atmosphere over the page, not a flat swatch. Worst in the system: **4.80**.
- **3:1 for a large figure or a bar.**
- **44px effective target** for everything tappable, via the strip if the glyph
  is smaller.
- **`:focus-visible`, 2px accent, 2px offset**, one ring everywhere.
- **Never colour alone.** Every state carries a word: "has a date", "never late",
  "Overdue", "IN / OUT / NET".
- **Zero is neither direction.** A loan paid off and a card unused this cycle are
  written in ordinary ink. Painting their nought red says they are bad news.
- Reduced motion honoured in CSS globally and in JS where a script animates.

---

## 15 · Do / Don't

| Do | Don't |
|---|---|
| Let most content sit flush on the atmosphere | Put every section in a card |
| Separate with surface, sheen and shadow | Draw an outline around everything |
| Glow the answer, the lead chart, the active tab | Glow every card, every border, every icon |
| Use one filled control per screen | Fill every chosen chip with solid accent |
| Say the state in words as well as colour | Rely on red and green alone |
| Keep red for money that has gone | Use red because a chart needs a second colour |
| Track big figures tighter | Set a hero at normal tracking |
| Blur heroes, the nav and sheets | Blur every pane in a scrolling list |
| Raise ink to fix contrast | Dim the atmosphere until it is invisible |
| Cap the atmosphere at the measured ceiling | Raise it because the corner looks flat |

---

## 16 · Component grammar

Every component in `css/dna.css`, each defined by purpose, dimensions, spacing,
radius, surface, border, type, colour, shadow, glow, states and motion:

`.k-atmosphere` · `.k-hero` · `.k-pane` (+ `--quiet`, `--focus`) · `.k-metric` ·
`.k-btn` (+ `--primary`, `--secondary`, `--ghost`) · `.k-chip` · `.k-tag` ·
`.k-seg` · `.k-input` · `.k-select` · `.k-field` · `.k-toggle` · `.k-icon` ·
`.k-rows` / `.k-row` · `.k-disclose` · `.k-insight` · `.k-chart` (+ line, ref,
area, dot, halo, track, bar, ring, tick, note) · `.k-meter` · `.k-nav` ·
`.k-sheet` / `.k-scrim` · `.k-empty` · `.k-skeleton`

---

## 17 · Design lab 2.0

**`/lab/index.html`** — open it at `/lab/` on any static server.

It loads `css/dna.css` for the system and two of the app's own modules,
`js/icons.js` and `js/brand.js`, so the icon set and the brand resolver are the
real ones rather than a drawing of them. Nothing else: no database, no router,
no service worker, no network. **Deleting the folder would leave Kawach exactly
as it is.**

Every figure in it is invented, and every figure in it adds up:

```
income                52,000
fixed commitments   - 18,800
saved each month    -  5,000
------------------------------
budget                28,200
spent so far        - 19,960
------------------------------
left to spend          8,240
```

A system that lies about arithmetic cannot be made to look right there.

Sixteen sections: 01 brand and identity · 02 atmosphere · 03 material hierarchy ·
04 editorial typography · 05 metrics and hero composition · 06 controls ·
07 transaction rows · 08 insight and context · 09 charts · 10 commitment and
planning · 11 bottom sheets · 12 states · 13 navigation · 14 motion ·
15 brand marks · 16 responsive.

Each section demonstrates the system rather than describing it, and every chart
carries the question it answers in the markup above it.

---

## 18 · Material hierarchy

Five levels. Depth communicates hierarchy — which is **not** the same as
everything being glass.

| Level | Class | Blur | Used for |
|---|---|---|---|
| L0 | `.k-pane--flat` | none | structure, low-priority containers |
| L1 | `.k-pane--quiet` | 10px | a list, a row group, supporting information |
| L2 | `.k-pane` | 16px | a figure with something to say — the default |
| L3 | `.k-pane--focus` | 22px | what you opened, chose, or are pointed at |
| L4 | `.k-hero` | 30px | one per screen — the answer |

L0 was added in 2.0 and is the important one. Blur is the most expensive thing
a phone does here, and a mid-range Android pays for every layer of it on every
frame. A container holding low-priority structure gains nothing from sampling
what is behind it, so it does not. Having an opaque bottom to the scale is what
stops the hierarchy decaying into uniform frosted glass.

---

## 19 · Editorial typography

A figure on its own is a readout. A figure with a sentence built around it is a
statement, and a person remembers a statement.

```
You are spending less.        .k-editorial__lede
₹19,960                       .k-editorial__figure
this month  ↓12.4% vs August  .k-editorial__tail + .k-delta
```

Three rules keep it from turning ornamental:

- the lede is short enough to read in one go, and is set at heading size in a
  **lighter** weight than the figure, so it introduces without competing
- the figure stays the largest thing on the surface
- the tail carries the comparison rather than repeating the figure

`.k-editorial__em` marks the one emphasised clause in a lede. One per sentence,
never two.

`.k-delta` is a change against a previous period. **The direction is set by the
caller, never inferred from the sign**: down is not automatically good, because
a fall in income is not a win. In daylight its lightness is pulled down to 38%
while its hue and chroma are left alone — mixing toward the ink dragged the hue
with it and turned a green delta cyan.

---

## 20 · Contextual UI

The same truth, emphasised for the moment it is in.

```
₹42,500 available                  calm
₹8,240 left for 6 days             attention
₹4,200 above your usual dining     alert
```

`.k-context` with `--calm`, `--attention`, `--alert`. Tone sets one custom
property (`--k-tint`) and everything else follows, so no tone can drift into
having a layout of its own.

**Emphasis is presentation. It never reaches back into the figure.** The
arithmetic is identical across all three; only the way it is said changes.

Tone must come from a state the app can actually know — days remaining, a share
of budget used, a category outside its own measured range. Never invent an
insight to make a screen livelier.

---

## 21 · Chart principles

Every chart must answer a question that can be written down. If it cannot, it is
decoration and is not built. The question lives in the markup above the drawing.

| Chart | Question |
|---|---|
| Cash-flow river | Is more coming in than going out, and how has that changed? |
| Radial commitment meter | How much of the month is already spoken for? |
| Spending pulse | When in the month do I actually spend? |
| Share | Where did it go, biggest first? |

Two rules learned by building them:

**Do not fill to a baseline the axis does not start at.** The river began as two
areas from zero. A salary that never moves and an outflow that swings by five
thousand both became near-full slabs, because the variation that matters is a
tenth of the distance to zero. It was honest and told you nothing. Two lines on
a zoomed scale with only the *gap* filled fixes it, and the gap is the answer.

**A bubble chart of category shares is not a chart.** It is a way to make a
person squint at one small disc to work out whether it is bigger than another
small disc. At 320px with fourteen categories it stops working entirely. The
category constellation was dropped in 2.0 and replaced by `.k-share`, a ranked
bar that answers the same question at a glance and keeps answering it as the
list grows.

Red is never a chart colour for decoration: it is kept for money that has
actually gone.

---

## 22 · Motion budget

Three durations for the whole product. Every animation is one of them.

| Band | Token | Value | Used for |
|---|---|---|---|
| Fast | `--k-t-fast` | 140ms | a press, a toggle |
| Standard | `--k-t-normal` | 240ms | a sheet, a transition |
| Expressive | `--k-t-slow` | 420ms | something arriving |
| Expressive ceiling | `--k-t-draw` | 600ms | a chart |

`--k-t-draw` was 900ms and nothing used it. 600ms is the top of the band a
person still reads as one motion rather than as waiting, so it was brought
inside the budget in 2.0.

**Anything needing longer is staggered, not stretched.**

Motion explains a change; it never performs. Fast, controlled, physical, quiet —
never bouncy, playful or gamified. The one spring in the system is for a sheet
arriving, and its overshoot is small enough to read as weight rather than bounce.

`.k-count` settles a figure that has changed, because two numbers of the same
size in the same place otherwise swap without being noticed. `.k-settle` brings
a row into a list from the direction it came from.

Reduced motion is handled once, globally: under
`@media (prefers-reduced-motion: reduce)` every animation and transition inside
`.k` is cut to 0.01ms. The state still changes; it stops sliding into it.

---

## 23 · Interaction states

`.k-state` covers success and failure in one shape, because they are the same
event with different news and a person should not have to learn two layouts to
find out which happened. **An error says what survived before it says what
broke.**

Also in the system: `.k-empty`, `.k-skeleton`, `.k-refresh`.

Every control, in both themes and down to 320px:

- effective target ≥44px — a glyph may be smaller, its target may not
- one focus ring, `.k :focus-visible`, 2px at 2px offset
- the ring is the only thing in the system allowed to draw a hard outline

---

## 24 · Brand-mark hierarchy

Three steps, in order, so there is never a hole where a logo was not found:

1. a licensed SVG in `icons/brands/`
2. the category's own icon, in the category's colour
3. a monogram, on a tile whose hue is hashed from the name

Then `.k-brand--none`, a quiet tile, when nothing at all is known.

**No trademarked logo is drawn, approximated, or stood in for with an emoji.** A
real mark appears only where a properly licensed file has been put in
`icons/brands/`, and `BRAND_ASSETS` declares it. None is bundled today.

The monogram is the one thing in the system that sets its own lightness, from a
hash rather than a token, so it does not follow the theme on its own. Daylight
values are given explicitly: on paper its letters measured 1.57:1 before that
was fixed. The hue still comes from the name in both themes, so a shop keeps its
identity — you come to know the local one as the violet one without being told.

---

## 25 · Responsive principles

Mobile is the product, not a breakpoint. 320px is not an edge case; it is a
person with an older handset.

- validated at 320×720, 360×800 and 390×844, dark and light
- no horizontal overflow at any width
- the hero figure is `clamp()`ed: 68px at 390, 50px at 320
- labels wrap, figures do not, and nothing on a row may push a money figure off
  the edge
- a full-bleed element inside a padded column is deliberate, not overflow

**Light is a different material, not an inversion.** Glass on paper is nearly
opaque, the sheen becomes a shadow from above, and glow all but vanishes,
because a lit edge on white reads as a smudge. Hierarchy in daylight is carried
by weight and space, the way paper has always done it.

---

## 26 · The one reset

`.k, .k *, .k *::before, .k *::after { box-sizing: border-box; }`

The system sized everything as if padding were inside the box but never said so:
it was borrowing the reset in `style.css`. That held while the DNA was only ever
loaded next to it, and broke the moment the lab loaded this file alone — a
full-width input came out 34px wider than its field. A design system that only
works when another stylesheet happens to be present is not a design system.

---

## 27 · Status

`css/dna.css` is loaded by the app and by `/lab/`. **Summary, History and Add**
are built on it (phases 9A, 9B, 9C). **Accounts, Plan and Coach are not** — they
still run on `style.css` and were not touched in 9D.

`tokens.css`, `style.css` and `version.js` are untouched. `sw.js` caches
`dna.css` and `brand.js` but not `/lab/`. Production is **3.3.1 / BUILD 79**.

Design Lab 2.0 is the canonical visual reference for the remaining migrations.
