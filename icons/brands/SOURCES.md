# Phase 2: brand asset license check

Checked 26 September 2026 against the [Simple Icons brand data at commit `d0b3c2d`](https://github.com/simple-icons/simple-icons/blob/d0b3c2d7153794b912913746fc0498a5d3211727/data/simple-icons.json) and its [license disclaimer at the same commit](https://github.com/simple-icons/simple-icons/blob/d0b3c2d7153794b912913746fc0498a5d3211727/DISCLAIMER.md).

## Result

Kawach's 40-brand shortlist has **no mark with an explicit `CC0-1.0` entry** in the source data checked. Simple Icons says its collection license does not automatically apply to every mark; it also says that a missing license entry is not evidence that a mark is unlicensed. Under Kawach's asset rule, neither a missing entry nor the collection-wide license is enough to bundle a mark.

No third-party SVGs were added, and `BRAND_ASSETS` stays empty. The app continues to use its category icon and monogram fallbacks.

## Source records found

These shortlist names have a matching entry in the checked data, but no explicit `CC0-1.0` license entry there:

| Brand | Upstream source recorded by Simple Icons |
|---|---|
| Airtel | <https://www.airtel.in/logo-tune> |
| Axis Bank | <https://www.axisbank.com/shareholders-corner/shareholders-information/annual-reports> |
| BigBasket | <https://www.bigbasket.com> |
| BookMyShow | <https://in.bookmyshow.com> |
| Google Pay | <https://pay.google.com/intl/en_us/about/> |
| HDFC Bank | <https://www.hdfcsales.com> |
| ICICI Bank | <https://www.icicibank.com/ms/aboutus/annual-reports/2022-23/icici/assets/images/home-page/logo.svg> |
| Jio | <https://commons.wikimedia.org/wiki/File:Reliance_Jio_Logo.svg> |
| KFC | <https://global.kfc.com/asset-library/> |
| McDonald's | <https://www.mcdonalds.com/gb/en-gb/newsroom.html> |
| Netflix | <https://brand.netflix.com/en/assets/logos> |
| Paytm | <https://paytm.com> |
| PhonePe | <https://www.phonepe.com/press/> |
| Spotify | <https://developer.spotify.com/documentation/general/design-and-branding/#using-our-logo> |
| Swiggy | <https://www.swiggy.com> |
| Uber | <https://assets.uber.com/d/k4nuxdZ8MC7E/logos/collection/151> |
| Uber Eats | <https://assets.uber.com/d/k4nuxdZ8MC7E/logos/collection/150> |
| YouTube | <https://www.youtube.com/howyoutubeworks/resources/brand-resources/#logos-icons-and-colors> |
| Zomato | <https://www.zomato.com/business/apps> |

The other shortlist names had no matching title or slug in that data check. Recheck before sourcing new marks; upstream license records can change.

## Adding an asset later

Add a mark only when its own upstream entry explicitly says `CC0-1.0`. Keep the source record here, save the SVG as `icons/brands/<brandKey>.svg`, register the key in `js/brand.js`, and add the file to `sw.js` so it works offline. Trademark ownership remains with each brand; the artwork license does not imply endorsement.

