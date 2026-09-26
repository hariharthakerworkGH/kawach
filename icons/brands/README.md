# Brand marks

Drop a merchant's real logo in here and Kawach starts using it. Nothing in
`js/` or in any screen has to change.

**This folder ships empty on purpose.** Kawach makes no third-party calls and
has no network access at build time, so no logo is fetched or bundled
automatically. Trademarks belong to their owners, and nothing in this project
draws an approximation of one. A brand mark appears only when someone has put
a real, properly licensed asset here.

Until then every merchant gets its category icon or a monogram, which is a
deliberate part of the system rather than a gap in it.

## How a name becomes a filename

`js/brand.js` reduces whatever the bank wrote down to one key, reusing the
app's own merchant normalisation (`js/merchant-rules.js`). The key is the
filename.

| The bank wrote | Key | File |
|---|---|---|
| `PAY*SWIGGY BENGALURU` | `swiggy` | `swiggy.svg` |
| `UPI/ZOMATO LTD/8412` | `zomato` | `zomato.svg` |
| `NETFLIX.COM` | `netflix` | `netflix.svg` |
| `ICICI BANK LTD` | `icici` | `icici.svg` |
| `AMAZON PAY INDIA` | `amazon` | `amazon.svg` |

Gateway prefixes (`PAY*`, `PTM*`, `RSP*`, `UPI/`), corporate suffixes (`LTD`,
`PVT`, `LLP`), payment-channel words (`UPI`, `IMPS`, `NEFT`, `OKAXIS`, `YBL`)
and glued-on city names are all stripped before the key is taken, so one file
covers every spelling of the same merchant across every statement format.

To check what a given description resolves to:

```js
import { brandKey } from './js/brand.js';
brandKey('PAY*SWIGGY BENGALURU'); // 'swiggy'
```

## Adding one

1. Put the optimised SVG here as `<key>.svg`.
2. Add the key to `BRAND_ASSETS` in `js/brand.js`.
3. Add the path to `APP_SHELL` in `sw.js`, or it will not be there offline.

Step 2 exists because a static site has no directory listing at runtime, so
the app cannot discover a file it was never told about. It is one line, and it
is the only code change adding a brand ever needs.

## What the SVG has to be

| | |
|---|---|
| Size | `viewBox="0 0 24 24"`, square |
| Colour | the brand's own, baked in. Not `currentColor`: a logo in the wrong colour is worse than no logo |
| Weight | readable at **24px**. Anything with fine detail or text in it will not survive |
| Background | none. The tile behind it is drawn by the app |
| Budget | under **4 KB** each, minified, no metadata, no embedded raster |
| Total | keep the whole folder under **100 KB**. This is a phone app on an Indian data plan |

## Where the marks turn up

Beside a merchant where recognition helps and nowhere else: transaction rows,
the account selector, subscriptions and commitments. Not in chips, not in
filters, not in headings. A screen of logos is a collage, not an interface.

## The fallback order

```
1. icons/brands/<key>.svg    a real asset, if one is here
2. the category's icon       js/category-icons.js, in the category's colour
3. a monogram                the initials, on a tile coloured by the name
```

The monogram takes its hue from a hash of the key, so a merchant is the same
colour on every screen and every device, permanently. You come to recognise
the local shop as the violet one without anyone telling you. Hues are the
design system's own spectrum (cyan through violet to magenta, plus the two
money hues) at fixed lightness and chroma, so no tile outshouts another.

There is no state in which a broken image can appear: an asset is referenced
only when `BRAND_ASSETS` says it was bundled.

## Sourcing

Use the brand's own press or identity kit, or a reputable set such as
[Simple Icons](https://simpleicons.org). Its collection license does not
automatically cover every mark: check the individual icon's license entry in
its [brand data](https://github.com/simple-icons/simple-icons/blob/develop/data/simple-icons.json)
before bundling it. Kawach includes a Simple Icons mark only when that entry
explicitly says `CC0-1.0`; record the source in `SOURCES.md`. The mark remains
the brand owner's trademark, and an artwork license does not imply endorsement.
Do not take logos from image search, and never hotlink: the app has to work
with the aeroplane mode on.

