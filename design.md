# Design: Kawach

A locked design system for this app. Every screen follows this file; nothing
is decided per screen. When the system needs to grow, amend this file first,
then the screen. The values live in `css/tokens.css`; this file says what
they are for.

This is the single visual reference. Before drawing a screen: pick its shape
(2), take the parts it needs from the catalogue (11), and only invent
something when nothing here fits - and when that happens, add it here first.

Built with the Hallmark design discipline (multi-page / designed-as-app).

## Contents

1. Who it is for, and the tone
2. Screen shapes
3. Colour
4. Typography, and how money looks
5. Spacing, rhythm and radius
6. The three cards
7. Buttons, controls and microinteractions
8. Icons
9. Charts
10. Motion
11. The block catalogue
12. Empty, loading and error
13. Accessibility
14. What every screen shares
15. Each screen's one question

---

## 1. Who it is for, and the tone

- **Audience:** one person keeping on top of their own money, not a finance
  expert. Reads on a phone, often in a hurry.
- **Job:** each screen answers one question at a glance - how much can I
  spend, where is my money, what do I owe, what changed.
- **Tone:** utilitarian. Figures first, one short line each, details behind a
  tap. No explanatory paragraphs under headings.
- **Genre:** modern-minimal - confident figures, one family of type,
  restrained colour, plain surfaces. Dark-first (the phone's light setting
  gets the same system, inverted).

## 2. Screen shapes

- **Stat-Led** - Summary, Plan, Coach. One big number leads; everything below
  supports or qualifies it.
- **Index-First** - Accounts, History, Categories. The screen is the list: one
  full-width row or card per item, never two side by side.
- **Guided steps** - Import, first-time Setup. A job with a start and an end:
  Choose, Check, Done, moving on by itself, ending by saying what changed.

A screen belongs to one shape. There is no fourth shape and no per-screen
enrichment: function carries the screen.

## 3. Colour

Dark (default) · light values in `tokens.css`.

- `--bg`          oklch(14% 0.014 265)    - the paper, a deep blue-black
- `--surface`     oklch(19.6% 0.017 265)  - a surface
- `--surface-hi`  oklch(27.2% 0.019 265)  - a raised strip
- `--text`        oklch(96.6% 0.004 255)  - ink
- `--text-muted`  oklch(68% 0.016 258)    - second ink
- `--border`      oklch(30% 0.017 265)    - hairlines, visible in both themes
- `--edge-lum`    oklch(100% 0 0 / 0.07)  - the light on a raised top edge
- `--accent`      oklch(80% 0.128 222)    - cyan: interaction, focus, data
- `--violet`      oklch(68% 0.148 295)    - the second voice in a comparison
- `--emerald`     oklch(72% 0.13 162)     - money in good standing
- `--in`          oklch(83.2% 0.156 158)  - money in
- `--out`         oklch(73.2% 0.165 28)   - money out
- `--warn`        oklch(83.7% 0.164 84)   - careful

A deep blue-black ground, and light used as punctuation. Green used to be the
whole interface - every border, tab, link and chart - which made the app read
as one colour rather than as information. The foundation is now neutral, so a
colour means something wherever it appears.

Each colour has one job:

| Colour | Says |
| --- | --- |
| Cyan (`--accent`) | this responds: the main action, where you are, focus, the line a chart draws |
| Violet | the second thing in a comparison - the flexible half of a budget, the second bar |
| Green (`--emerald`, `--in`) | money in good standing: what is free, what is saved, a goal on track |
| Amber (`--warn`) | this needs you |
| Red (`--out`) | money gone, or a figure below zero |
| Neutral | everything else, which is most of the screen |

Green is Kawach's own colour and stays in the logo, but it is never chrome:
not a border, not a heading, not a tab. Category chips keep their own colours
(`--cat-*`), used only on the chip.

Colour never carries a meaning on its own: over budget is red **and** says
"Over budget"; due is amber **and** says "Due". See 13.

What the money colours do and do not mean:

- **Money out is not automatically bad.** Rent is red because it left, not
  because it was wrong.
- **Savings are not a loss.** Money set aside leaves the budget and keeps its
  minus sign, but never the red (`.saved-row`).
- **Zero is neither direction** (`moneyTone`).
- **Amber is for something that needs the person**, not for emphasis.

### Surfaces, states and depth

Five surfaces, in this order: `--bg` (the paper), `--surface` (a card),
`--surface-alt`, `--surface-hi` (a raised strip inside a card), and
`--bg-elevated` (a field, which is sunk rather than raised). Three states:
`--surface-press` when you are touching something, `--surface-selected` for
the one that is chosen, `--text-disabled` for what is not available. All of
them exist in both themes, so a pressed row looks pressed either way.

Depth is three steps and nothing more:

| Token | What gets it |
| --- | --- |
| `--shadow-card` | a card sitting on the paper |
| `--shadow` | the hero, and a fold that leads a section |
| `--shadow-lift` | a sheet or a dialog, which floats |

Every raised surface also carries `inset 0 1px 0 0 var(--edge)`: a single
pixel of light along its top edge. A card is a surface, an edge and a soft
shadow. Never a thick border, a gradient or a glow.

**Glow is for one thing only:** the main action's lift. No card glows, no
field glows, nothing glows because it exists.

The palette is settled. Changing it is a `tokens.css` change plus this
section, never a screen-by-screen change.

## 4. Typography, and how money looks

- Display and body: **Geist** (variable, 100-900), shipped inside the app in
  `fonts/` under the SIL Open Font License. No font is ever fetched from
  anywhere: the app makes no third-party calls.
- Headings are upright (never italic) and sentence case. **No uppercase
  labels above sections** - a quiet sentence-case heading instead.
- Figures: `font-variant-numeric: tabular-nums` wherever money is listed, so
  columns line up.

### The scale

Eleven steps, every one a token in `css/tokens.css`. **A screen never writes a
raw font size.** Before 3.3 the stylesheet held 38 different sizes and no two
screens agreed, which is most of what made Kawach read as six screens rather
than one product.

| Token | Size | Used for |
| --- | --- | --- |
| `--text-hero` | clamp(3.4rem, 14vw, 4.2rem) | the one figure a screen exists to answer |
| `--text-fig-xl` | 2.1rem | the figure a review card is about |
| `--text-display` | 1.55rem | the screen's name in the header |
| `--text-head` | 1.25rem | a heading inside a screen |
| `--text-fig-lg` | 1.45rem | the largest figure inside a panel |
| `--text-fig` | 1.15rem | an ordinary money figure |
| `--text-fig-sm` | 1.05rem | a figure in a stat pair, a dialog title |
| `--text-body` | 0.95rem | sentences, names |
| `--text-label` | 0.86rem | the name of a thing |
| `--text-meta` | 0.8rem | the line under it |
| `--text-micro` | 0.72rem | the smallest label that still has to be read |

Weight carries meaning, not loudness, so the same kind of information is the
same weight everywhere: `--weight-fig` 650 for a figure, `--weight-strong` 700
for a name that must be found, `--weight-label` 500 for a label,
`--weight-body` 400 for a sentence. Figures track tighter as they grow
(`--tracking-fig`, `--tracking-hero`).

Icons have three sizes and never set their own: `--icon-lg` for the one icon a
screen is about, `--icon-md` for navigation and an icon standing alone,
`--icon-sm` for an icon beside text.

### Money

- **Three money sizes on a screen** - the hero, one panel size, one row size.
  A fourth means the screen is doing too much.
- **A supporting figure looks like support.** The stats under a hero are
  `--text-fig-sm` with a `--text-micro` label above them, stacked, so the
  label is plainly metadata and the value carries the weight. Two figures the
  same size on one card is two answers to one question.
- **One hero figure per screen.** Never two big numbers competing.
- **Whole rupees** everywhere (`formatRupees`). Paise appear only in the
  import review table, where they came from the statement.
- **Negative money keeps its minus sign** as well as its colour: −₹2,15,000.
- **Zero is neither direction** (`moneyTone`, js/ui.js). A loan paid off, a
  card not used this cycle and a month with nothing spent are written in the
  ordinary ink. Painting their nought red says they are bad news.
- **Never centre a figure in a list.** Name left, figure right.
- Dates read "25 Sep". A year is added only when it is not this year.

## 5. Spacing, rhythm and radius

A 4-point named scale, `--space-4xs` (2px) to `--space-2xl` (48px). Every
padding, margin and gap uses a token by name; no screen writes a raw value.

| Gap | Token | Used for |
| --- | --- | --- |
| 2px | `--space-4xs` | hairline gaps only |
| 4px | `--space-3xs` | an icon and its label |
| 8px | `--space-2xs` | rows inside a card |
| 12px | `--space-xs` | a card's inner padding, top and bottom |
| 16px | `--space-sm` | a card's inner padding at the sides; the screen gutter |
| 20px | `--space-md` | between cards |
| 24px | `--space-lg` | inside a hero |
| 32px | `--space-xl` | before a new section heading |
| 48px | `--space-2xl` | the gap above the bottom bar |

### Radius means something

| Token | Size | What gets it |
| --- | --- | --- |
| `--radius-xl` | 24px | the hero, and only the hero |
| `--radius-lg` | 20px | a card: panel or row group |
| `--radius-md` | 14px | something inside a card: an input, a raised strip |
| `--radius-sm` | 11px | a small control, a status strip, a tag |
| `--radius-pill` | 999px | buttons, chips, meters |

A hero and a row group never share a radius. Nothing rounder than its parent.

## 6. Four surfaces, and a rule about boxes

**Surfaces are used where grouping helps, not everywhere.** The stylesheet had
grown 45 card-like rules, every one drawing a full border, so a screen read as
a stack of outlined boxes rather than as information with some of it grouped.
Depth now comes from tone, one pixel of light on the top edge and a soft
shadow; the outline is a hairline at 60% of `--border` and is almost invisible
by design.

| Level | What it is | Treatment |
| --- | --- | --- |
| 1 | flush on the background | no surface at all |
| 2 | a soft panel | `--surface`, hairline, light edge, `--shadow-card` |
| 3 | the hero | translucent, blurred, ambient pool, `--shadow` |
| 4 | a dialog | `--border-hi`, `--shadow-lift` |

**There is one hero rule, and every screen that has a hero uses it.** Summary,
Plan, Accounts and Coach share `.hero`. Through 3.2 the refined version was
fenced inside `#dashboard` and only Summary had it, which is the single
biggest reason the other screens looked like an older app.

### The card types

Every card on every screen is one of these three. There is no fourth. The
hero and the panel are written once in `js/ui.js` (`hero`, `panel`) and a
screen takes them from there. A row group is a panel with rows inside it, and
each screen keeps its own row markup: a commitment row opens, an account row
has two buttons, an import row has a category picker, so a shared row helper
would have to grow all of that back to be useful.

The hero owns the screen's answer. The cards under it are ranked on purpose -
the bank is the second voice, a warning is louder than a list, an invitation
to install comes last - and never all the same weight.

### The three levels (Summary is the reference)

1. **Flush** - most information sits directly on the paper, grouped by space
   and a quiet heading (`.flush`). No container at all.
2. **Subtle surface** - used only where grouping genuinely helps: the bank
   position, what is due, the install invitation. Flat, no shadow.
3. **Primary object** - the hero alone. Translucent, one pixel of light along
   its top edge, one soft pool of light behind the figure, a real shadow.

Detail past "what needs me" waits behind a disclosure row (`.disclose`): a
row with a chevron, 52px tall, that turns cyan when open. Nothing is removed;
it is closed.

### Hero card

- One per screen, at the top. Holds the single number the screen exists to
  answer, its meter, and one line of status.
- On Summary the figure is `clamp(3.2rem, 13vw, 3.9rem)` - four times the
  supporting figures under it, which is what makes it the answer rather than
  the largest of several numbers.
- Nothing else goes inside the hero. A drawing that explains the month rather
  than the figure - "This month is spoken for" - sits flush underneath it, not
  in a band bolted to the bottom of the card.
- `--radius-xl`, `--space-lg` padding, `--border-hi` hairline, `--shadow`.
- Today: `.hero`, `.hero-label`, `.hero-amount`, `.hero-meter`,
  `.hero-figures`, `.hero-status`.
- A screen with no single answer has no hero. It does not get a decorative
  one.

### Panel

- A named group of related figures: the bank check, a business month, what is
  coming.
- `--radius-lg`, `--space-sm` sides, hairline border, heading outside it in
  `.section-head`.
- Today: `.totals-card`, used on ten screens.

### Row group

- A list of same-shaped rows: accounts, payments, commitments, categories.
- Same box as a panel; rows divided by hairlines, never by gaps, never by
  nested cards.
- Today: `.commitment-list`, `.cat-list`, `.hist-day-card`, `.todo-list`,
  `.import-row-list`. Each screen writes its own rows.

**Cards are one level deep.** Nothing inside a card sits in a card of its
own: it sits flat on its parent under a hairline, or on `--surface-hi`.

## 7. Buttons, controls and microinteractions

- **Main action:** one filled cyan pill per screen, full width, with a
  one-pixel highlight along its top edge and a soft shadow under it. Pressed,
  it loses the shadow: it goes down, it does not glow.
- **Cyan is for actions.** A way in - "How it's worked out", "Change amounts"
  - is not an action: those read in `--text-muted` and keep their chevron.

### Control heights, and touching them

Three heights, all tokens: `--control-lg` 48px for a full-width button,
`--control-md` 44px for a row, a select or a segmented control, `--control-sm`
36px for a chip.

**A glyph may be small. Its target may not.** Every small control
(`.btn-tiny`, `.icon-btn`, `.link-btn`, `.chip`, `.plan-chip`, `.hist-chip`,
`.seg-btn`, `.recap-dot`) keeps the size it looks and gains an invisible strip
`--tap` (44px) tall, centred on it. Nothing moves and everything can be hit.
Growing the pills instead would have changed the density of every screen.

### One disclosure, everywhere

There is **one** turning arrow in Kawach and it is written once. Four had
grown up: one floated right with a top-margin nudge, two sat inline against
the last word, one pushed itself to the row end - which is why the arrow
looked jammed against one heading and well placed on another on the same
screen.

The rule: the summary row is a flex line with the arrow last, so the arrow is
always at the trailing edge whatever the row holds; the whole row is the
target and is at least `--tap` tall; closed the arrow is `--text-muted`, open
it turns up and takes `--accent`. **A screen never nudges a chevron.**
- **Secondary:** outlined pill.
- **Small actions:** text links ("+ Spend", "Edit", "History ›").
- Labels fit on one line, and say what happens ("Change many", not "Select").
- Every button has all its states: normal, hover, focus, pressed, disabled,
  busy, failed, done (`data-state`).
- Silent success. A toast says what happened in a few words; nothing
  celebrates.
- Questions only for what cannot be undone (deleting). The app's own question
  box, never the browser's.
- A focus ring appears at once, never animated.

## 8. Icons

One set of line icons, all the same stroke, drawn in `js/icons.js` and
coloured like the text around them. Emoji and text characters (✕, ↑, ▾)
are never interface icons.

Category icons are drawn the same way, in `js/category-icons.js`, and shown
in their category's colour on a tint of it. No two of your categories share
an icon or a colour (`js/category-style.js`). On Categories you can pick any
drawn icon, any colour, or your own picture (cut to a small round image and
kept on the phone). An emoji picked before the drawn set existed is kept.

## 9. Charts

A drawing is allowed only when it answers a question a number cannot. The six
below are the whole vocabulary; a seventh gets added here first.

**One family of lines.** Every drawing is made of the same four strokes, and
they are set in `style.css` rather than in the markup so they cannot drift
apart: `.chart-line` (`--chart-line`, cyan, the line that carries the answer),
`.chart-pace` (`--chart-pace`, dim, the comparison it is measured against),
`.chart-axis` (`--chart-hair`, a baseline), `.chart-ring-track` and
`.chart-ring-fill` (`--chart-ring`). A drawing sits in a `.chart-block` with
`--space-sm` above it, and its sentence is a `.chart-note`, set like every
other piece of metadata in the app.

**Red is not a chart colour.** Cyan and violet carry information; red is kept
for money that has actually gone, so a drawing never reaches for it to look
lively.

| Drawing | Answers | Lives on |
| --- | --- | --- |
| Budget burn | am I ahead or behind for this point in the month? | Summary |
| Committed bar | how much of this month is already spoken for? | Plan |
| Category bars | which categories took the money? | Recap, and quietly on Categories |
| Goal ring | how far along is this goal, and what does it cost a month? | Plan, on the goal itself |
| In and out bars | is this month normal for me? | History |
| Runway bar | if money stopped coming in, how long would I last? | a business's Summary only |

One drawing per screen means one that leads the screen. A ring on a goal and
a bar on a category row belong to the row they sit in, not to the screen, so
they do not count against it. All six live in `js/charts.js`.

### Rules

- **The figure comes first, the drawing explains it.** Never a drawing with
  the number hidden behind a tap. A drawing and its figure are one answer, not
  two things that happen to sit together.
- **A drawing must say what the words beside it cannot.** If a sentence says it
  more clearly, write the sentence.
- **Never print the same figure twice** because two parts are both able to
  show it. Summary's committed bar names its three figures because nothing
  below repeats them; Plan's does not, because the rows underneath are the
  figures (`legend: false`).
- **No empty tracks.** A meter with nothing to show is removed, not left grey
  to hold the layout. The hero's meter appears only when there is no burn line
  and something has actually been spent.
- **One drawing per screen**, at most.
- **No axes, no gridlines, no legends** unless two things are being compared.
  A short sentence underneath does the legend's job.
- **Nothing is drawn under three points of data**, and nothing is drawn when
  the figure is zero. Say "Not enough months yet" instead. Each drawing
  refuses on its own and hands back nothing, so no screen has to remember.
- **Never a pie.** Five slices are unreadable on a phone; use bars, longest
  first, top five and then "everything else".
- **The ring is for one part of one whole**, never for comparing things.
- Hand-drawn SVG in the app's own code. No charting library, no dependency,
  no fetched script. Colours by token only, and every drawing carries a
  plain-English `aria-label` saying what it shows.

## 10. Motion

- Easings: `--ease-out` cubic-bezier(0.16, 1, 0.3, 1), `--ease-in`,
  `--ease-in-out`. Never the browser's default, never a spring or bounce on a
  control.
- Durations: `--dur-fast` 140ms, `--dur` 220ms, `--dur-slow` 480ms.
- A screen never fades in or builds up in front of you: it is made out of
  sight and appears whole, and a screen redrawing itself keeps its old
  picture until the new one is ready. Nothing rises piece by piece.
- Two things at once never animate. The number lands, then its meter fills.

| What | Trigger | Movement | Reduced motion |
| --- | --- | --- | --- |
| Screen change | the bottom bar | none; swapped in whole | same |
| Hero figure | the screen arrives | counts up once over 600ms, ease-out, no bounce (`countUpHeroes`, js/ui.js) | the final figure at once |
| Meters, bars, rings | the screen arrives, 600ms after the figure starts | fill to value, `--dur-slow`, `--ease-out` | drawn at value |
| A drawn line or ring | with the bars | fades in, `--dur-slow` | drawn at value |
| A folded section | tap | unfolds, `--dur`, `--ease-out` | opens at once |
| A question box | it is needed | settles in, `--dur` | appears |
| A button | press | gives slightly, `--dur-fast` | no give |
| A row or chip | press | its surface goes to `--surface-press` | the same, instantly |
| A saved payment | save | the row appears, tinted for a second | the row appears, no tint |
| Status turns bad | the budget is crossed | the colour crossfades, `--dur` | the colour changes |
| Success | backup, import | a toast for three seconds | same |
| Loading | only a file or Google | words, "Reading…" | same |

Reduced motion (the phone's setting): all of it off. No counting, no filling,
no unfolding. The CSS movement is inside a `prefers-reduced-motion:
no-preference` block, and the one piece of movement JavaScript drives - the
hero counting - checks the same setting before it starts. A figure also
stands still when its screen is built while the tab is in the background,
and whatever happens to the frames, the real figure is on screen within a
second: a number stuck at zero would be a lie about someone's money.

Local data never gets a spinner. If it is fast enough to read from the phone,
it is fast enough to appear.

## 11. The block catalogue

The parts a screen is built from. **Exists** means it is built and only needs
using; **new** means it is designed here and not built yet. Each block is one
job: if a screen needs something else, add the block here before drawing it.

### 01 Money hero - exists (`.hero`)

- **Purpose:** the one number the screen exists to answer.
- **Structure:** label and period, figure, meter, two figures under it, one
  line of status.
- **States:** fine, careful (amber), over (red), not set up yet (a notice
  instead of a number).
- **Do:** one per screen; say the period in words ("1 to 30 Sep").
- **Don't:** repeat the same fact in the meter, the figures and the status.

### 02 Balance card - exists (`.bank-card`)

- **Purpose:** what is actually in the bank, now and after the bills.
- **Structure:** two labelled figures side by side, a note if either is low.
- **States:** healthy, below the monthly saving (amber), below zero (red).
- **Do:** keep it separate from the budget.
- **Don't:** ever let it raise what is free to spend.

### 03 Budget figures - exists (`.hero-figures`)

- **Purpose:** spent against budget, and the pace per day.
- **Structure:** two figures under the hero meter, one line of pace.
- **Do:** the same two figures on Summary, Plan and Coach.
- **Don't:** show a pace line in the first three days of a period.

### 04 Committed bar - exists (`.committed-bar`)

- **Purpose:** how much of the month is already spoken for.
- **Structure:** one bar in three parts, always in this order - must go out,
  can flex, free - then one line naming the three figures.
- **Data:** live commitments split by `flexible`.
- **States:** nothing committed yet (a notice inviting commitments on Plan).
- **Do:** use the accent for "must", a dimmer accent for "flex", the plain
  surface for "free".
- **Don't:** add a fourth part.

### 05 Budget burn - exists (`charts.burnLine`)

- **Purpose:** am I ahead or behind for this point in the period?
- **Structure:** a dashed even-pace line, a solid line for you, a dot at
  today, and a sentence: "You are ₹7,600 under the even pace".
- **Data:** running total by day for the period.
- **Don't:** draw it before day three of the period.

### 06 Category bars - exists (`.cat-bars`, `.cat-share`)

- **Purpose:** which categories took the money.
- **Structure:** name, bar, figure - top five, longest first, then
  "everything else".
- **Do:** the category's own colour on its bar.
- **Don't:** a pie, and never more than six rows.

### 07 In and out bars - new

- **Purpose:** is this month normal for me?
- **Structure:** six months, a green bar in and a red bar out per month, one
  sentence naming what stands out.
- **Don't:** put it on Summary. It answers a looking-back question.

### 08 Account card - exists (`.account-card`)

- **Purpose:** where money sits, and how fresh the figure is.
- **Structure:** name and kind, balance, one line of context, tap opens its
  payments.
- **States:** fresh, nothing for a while, a card with a bill due, a loan.
- **Don't:** ask for a balance to be typed in. Balances come from statements
  and recorded payments.

### 09 Transaction row - exists (`.hist-row`)

- **Purpose:** one payment, readable in a glance.
- **Structure:** category icon, name, account and date, amount. Tap unfolds
  the rest.
- **States:** needs a category, matched to a commitment, a transfer, a
  possible duplicate, split.
- **Don't:** wrap to three lines. The raw bank text lives behind the tap.

### 10 Commitment row - exists (`.commitment-row`)

- **Purpose:** a fixed cost, and how much of it has gone.
- **Structure:** name, used of planned, a thin bar, a tag when due or done.
- **States:** due, part paid, paid, overdue, flexible.
- **Do:** group rows under "Must go out" and "Can flex", each with a total.

### 11 Goal ring - exists (`.goal-ring`)

- **Purpose:** how far along a goal is, and what it costs a month.
- **Structure:** a ring with the percentage inside, saved of target beside
  it, and the monthly figure that gets there.
- **States:** on track, behind, done, no date set.
- **Do:** the only ring in the app.
- **Don't:** use a ring to compare two things.

### 12 Runway bar - exists (`.runway-bar`)

- **Purpose:** if money stopped coming in, how long would I last?
- **Structure:** one segment per month covered, fading out, and the count in
  words.
- **Do:** show it for business owners and uneven income.
- **Don't:** show it to someone on a steady salary with a settled month.

### 13 Insight line - exists (`.coach-note`)

- **Purpose:** one thing worth doing, with a figure in it.
- **Structure:** icon, one sentence, an optional link to the screen that
  fixes it.
- **States:** good, careful, warning, nothing to say.
- **Don't:** stack more than three. A wall of advice is read as none.

### 14 Warning card - exists (`.warn-card`)

- **Purpose:** something is wrong and the person can fix it.
- **Structure:** what is wrong, what it means, one button.
- **Do:** say it once per screen, never once per row.

### 15 Explain fold - exists (`.fts-breakdown`, `.section-fold`)

- **Purpose:** "how is this worked out" - the sum behind a figure.
- **Structure:** a summary line, and inside, one line per part, adding up.
- **Do:** every hero figure has one.
- **Don't:** open it by default.

### 16 Month stepper - exists (`.hist-month-head`, `.recap-nav`)

- **Purpose:** move between periods.
- **Structure:** back, the period in words, forward.
- **States:** this period (forward off), an older one.

### 17 Filter chips - exists (`.chip-row`, `.hist-chips`)

- **Purpose:** narrow a list without leaving it.
- **Structure:** one line of pills that scrolls sideways, the chosen one lime.
- **Don't:** wrap to a second line, and never more than one line of chips.

### 18 Space toggle - exists (`.space-toggle`, `.space-chip`)

- **Purpose:** which lane you are in - Home, or a business.
- **Structure:** a segmented control at the top of Summary; a small chip
  beside the title on every screen that follows the space.
- **Do:** only when there is a business. One lane means no toggle.

### 19 Bottom navigation - exists (`.bottom-nav`)

- **Purpose:** the six places in the app.
- **Structure:** six icons with labels, fixed to the bottom, the current one
  lime.
- **Don't:** ever add a seventh. Settings stays in the top right, because it
  is visited rarely and must never sit under a thumb.

### 20 Empty state - exists (`.empty-state`; `.empty` is still the one muted line where no action fits)

- **Purpose:** a list with nothing in it yet.
- **Structure:** what happened, why it matters, one action. See 12.
- **Don't:** two buttons, or a cheerful line with no way forward.

### 21 Error state - exists (`.warn-card`, `.alert-unreadable`)

- **Purpose:** something did not work.
- **Structure:** the plain cause, then the way out.
- **Don't:** a code, a stack trace, or the word "error".

### 22 Import review row - exists (`.import-row`)

- **Purpose:** check a parsed payment before it is saved.
- **Structure:** date, name, amount, category, keep or drop.
- **States:** new, a duplicate, matched to a commitment, a transfer.
- **Do:** always show this table. Parsed rows are never saved on their own.

### 23 What is coming - part exists (`.upcoming-row`, `.todo-row`)

- **Purpose:** what is due, in date order.
- **Structure:** day, name, amount, one tag.
- **Do:** only what needs the person. Settled things collapse to a line.
- **Don't:** nag. Nothing to do means the section is not there.

### 24 Step header - exists (`.import-steps`, `.setup-steps`)

- **Purpose:** where you are in a job with an end.
- **Structure:** Choose, Check, Done, the current one marked.
- **Do:** move on by itself, and end by saying what changed.

## 12. Empty, loading and error

Every empty state says three things in this order: **what happened, why it
matters, what to do.** One button, never two.

| Where | Words |
| --- | --- |
| No transactions | Kawach is empty until it sees your spending. Import a statement and everything else fills in. → Import a statement |
| No accounts | Add the account your salary lands in first. Balances and budgets follow from it. → Add an account |
| No commitments | Without rent, EMIs and bills, your whole income looks free to spend. → Add what goes out monthly |
| A PDF with no text | It has no text in it, so it is probably a scan. Download the statement as a spreadsheet instead. → Choose another file |
| Google pass has run out | The sign-in pass lasts an hour. Nothing was lost. → Sync now |
| Coach with nothing to say | One month of spending is enough for the first suggestion. → See what is missing |

Loading: only a file, a PDF or Google gets a waiting state, and it is words,
not a spinner. Local data appears.

Errors: the plain cause and the way out, in the person's words. Never a code,
never "something went wrong".

## 13. Accessibility

- **Colour never carries a meaning alone.** Over budget is red and says
  "Over budget". Due is amber and says "Due".
- **Contrast:** text on any surface at 4.5:1 or better; figures at 2.65rem at
  3:1 or better. Checked when a colour changes, not after.
- **Targets:** anything tappable is at least 44 by 44px, including the small
  text links.
- **Reduced motion** removes all of it (10).
- **Figures are read properly** by a screen reader: "₹16,600 left to spend",
  not "16600". Drawings carry an `aria-label` sentence.
- **Focus rings** appear at once and are never animated.
- The app works at 390px wide, and still at 320px without sideways scrolling.

## 14. What every screen shares

- The palette and its meanings, the one accent, Geist.
- The three cards (6) and the blocks (11). Nothing invented on the screen.
- The button voice (7).
- Headings: sentence case, no eyebrow labels.
- Cards are one level deep.
- Screens may differ on shape (2) and nothing else.

## 15. Each screen's one question

A screen answers one question. The biggest thing on it is the answer;
everything else supports it or waits below. If a second card is louder than
the answer, it is wrong.

| Screen | Its one question | Leads with | Then |
| --- | --- | --- | --- |
| Summary | where do I stand this month? | the hero: left to spend, the burn line, one sentence | spoken for, bank, what needs me, then detail |
| Add | how fast can I record this? | the amount | what, category chips by recent use, account, date |
| Accounts | where does my money sit? | the total, from statements only | one card per account, by kind |
| Plan | what is fixed each month? | the hero: budget each month, with the committed bar | commitments (must, then flex), goals, budgets |
| History | how do I find a payment? | the month and its in and out | six months in and out, then the list |
| Coach | what should I do next? | the hero: left at this pace | one question at a time, one thing noticed |
| Categories | where is my spending going? | the list | a quiet share bar on each row that has one |
| Import | did it read my statement right? | Choose, Check, Done | the check table as one row group |
| Recap | how was the month? | the figure on each card | the category ranking behind the biggest one |
| Inbox | what did this bank message say? | the waiting messages | paste a new one |
| Settings | is my data safe? | your money, then backup | sync, privacy, the rest |
| Setup | how do I start? | one question per step | nothing else on the screen |

### Summary's shape

1. **The hero** - left to spend, the period, the burn line, and one sentence
   saying whether that is good. The meter only appears when the burn line
   cannot be drawn, so the same fact is never shown twice.
2. **This month is spoken for** - the committed bar: must, flex, free.
3. **The bank** - in bank now, and after the bills.
4. **What needs me** - a commitment late or due within three days, promoted
   on its own; then the to-do list.
5. **Below that** - commitments in full, loans and savings, what is coming,
   tax dates. All folded or quiet.

A business's Summary answers a different question (what did the shop make
this month, and how long would it last) and so carries the runway instead of
the burn line, but it is built from the same blocks.
