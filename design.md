# Design: Kawach

A locked design system for this app. Every screen follows this file; nothing
is decided per screen. When the system needs to grow, amend this file first,
then the screen. The values live in `css/tokens.css`; this file says what
they are for.

Built with the Hallmark design discipline (multi-page / designed-as-app).

## Audience, job, tone

- **Audience:** one person keeping on top of their own money, not a finance
  expert. Reads on a phone, often in a hurry.
- **Job:** each screen answers one question at a glance - how much can I
  spend, where is my money, what do I owe, what changed.
- **Tone:** utilitarian. Figures first, one short line each, details behind a
  tap. No explanatory paragraphs under headings.

## Genre

modern-minimal - confident figures, one family of type, restrained colour,
plain surfaces. Kept dark-first (the phone's light setting gets the same
system, inverted).

## Screen shapes

- **Stat-Led** - Summary, Plan, Coach. One big number leads; everything below
  supports or qualifies it.
- **Index-First** - Accounts, History, Categories. The screen is the list: one
  full-width row or card per item, never two side by side.
- **Guided steps** - Import, first-time Setup. A job with a start and an end:
  Choose, Check, Done, moving on by itself, ending by saying what changed.

## Theme

Dark (default) · light values in `tokens.css`.

- `--bg`          oklch(15.4% 0.005 264)  - the paper
- `--surface`     oklch(20.9% 0.010 268)  - cards
- `--text`        oklch(96.9% 0.005 258)  - ink
- `--text-muted`  oklch(66.8% 0.023 262)  - second ink
- `--border`      oklch(27.6% 0.014 262)  - hairlines
- `--accent`      oklch(90.2% 0.191 122)  - lime, the one accent
- `--in`          oklch(83.2% 0.156 158)  - money in
- `--out`         oklch(73.2% 0.165 28)   - money out
- `--warn`        oklch(83.7% 0.164 84)   - careful

Colour carries meaning, never decoration. Lime marks the main action on a
screen and where you are - never a background flood. Category chips have
their own colours (`--cat-*`), used only on the chip.

## Typography

- Display and body: **Geist** (variable, 100-900), shipped inside the app in
  `fonts/` under the SIL Open Font License. No font is ever fetched from
  anywhere: the app makes no third-party calls.
- Figures: tabular numbers wherever money is listed, so columns line up.
- Display tracking: -0.025em on big figures.
- Headings are upright (never italic) and sentence case. **No uppercase
  labels above sections** - a quiet sentence-case heading instead.

## Spacing

A 4-point named scale, `--space-4xs` (2px) to `--space-2xl` (48px). Every
padding, margin and gap uses a token by name; no screen writes a raw value.

## Icons

One set of line icons, all the same stroke, drawn in `js/icons.js` and
coloured like the text around them. Emoji and text characters (✕, ↑, ▾)
are never interface icons.

Category icons are drawn the same way, in `js/category-icons.js`, and shown
in their category's colour on a tint of it. No two of your categories share
an icon or a colour (`js/category-style.js`). On Categories you can pick any
drawn icon, any colour, or your own picture (cut to a small round image and
kept on the phone). An emoji picked before the drawn set existed is kept.

## Motion

- Easings: `--ease-out` cubic-bezier(0.16, 1, 0.3, 1), `--ease-in`,
  `--ease-in-out`. Never the browser's default, never a spring or bounce on a
  control.
- What moves: a pressed button gives; a bar fills to its
  value when a screen arrives; a folded section unfolds when tapped; a
  question box settles in. Nothing rises piece by piece. A screen never
  fades in or builds up in front of you: it is made out of sight and appears
  whole, and a screen redrawing itself keeps its old picture until the new
  one is ready.
- Reduced motion (the phone's setting): all of it off.

## Microinteractions

- Silent success. A toast says what happened in a few words; nothing
  celebrates.
- Questions only for what can't be undone (deleting). The app's own question
  box, never the browser's.
- A focus ring appears at once, never animated.

## Buttons

- **Main action:** one lime filled pill per screen, full width.
- **Secondary:** outlined pill.
- **Small actions:** text links ("+ Spend", "Edit", "History ›").
- Labels fit on one line.
- Every button has all its states: normal, hover, focus, pressed, disabled,
  busy, failed, done (`data-state`).

## What every screen must share

- The palette and its meanings, the one accent, Geist.
- The button voice above.
- Headings: sentence case, no eyebrow labels.
- Cards are one level deep: nothing nested sits in a card of its own - it
  sits flat on its parent under a hairline.

## What screens may differ on

- Shape, within the family above (Stat-Led, Index-First, Guided steps).
- Nothing else. There is no per-screen enrichment: function carries the
  screen.

## Exports

The tokens as they stand, for re-use elsewhere. `css/tokens.css` is the
source; these mirror its main values.

### tokens.css

See `css/tokens.css` (colour, category colours, font, space, radius, motion).

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(15.4% 0.005 264);
  --color-surface: oklch(20.9% 0.01 268);
  --color-ink: oklch(96.9% 0.005 258);
  --color-ink-2: oklch(66.8% 0.023 262);
  --color-rule: oklch(27.6% 0.014 262);
  --color-accent: oklch(90.2% 0.191 122);
  --color-in: oklch(83.2% 0.156 158);
  --color-out: oklch(73.2% 0.165 28);
  --font-display: "Geist", sans-serif;
  --font-body: "Geist", sans-serif;
  --spacing-xs: 0.75rem;
  --spacing-sm: 1rem;
  --spacing-lg: 1.5rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "color": {
    "paper": { "$value": "oklch(15.4% 0.005 264)", "$type": "color" },
    "ink": { "$value": "oklch(96.9% 0.005 258)", "$type": "color" },
    "accent": { "$value": "oklch(90.2% 0.191 122)", "$type": "color" },
    "in": { "$value": "oklch(83.2% 0.156 158)", "$type": "color" },
    "out": { "$value": "oklch(73.2% 0.165 28)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Geist", "$type": "fontFamily" },
    "body": { "$value": "Geist", "$type": "fontFamily" }
  },
  "space": {
    "xs": { "$value": "0.75rem", "$type": "dimension" },
    "sm": { "$value": "1rem", "$type": "dimension" },
    "lg": { "$value": "1.5rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 15.4% 0.005 264;
  --foreground: 96.9% 0.005 258;
  --primary: 90.2% 0.191 122;
  --primary-foreground: 17.6% 0.024 116;
  --muted: 24.3% 0.012 264;
  --muted-foreground: 66.8% 0.023 262;
  --border: 27.6% 0.014 262;
  --input: 27.6% 0.014 262;
  --ring: 90.2% 0.191 122;
  --radius: 14px;
}
```
