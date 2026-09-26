/* Who a payment was to, shown as a mark.
 *
 * A statement line says "PAY*SWIGGY BENGALURU" and a person reads "Swiggy".
 * Putting a recognisable mark beside it is the difference between a list you
 * scan and a list you decode - but Kawach makes no third-party calls and
 * works offline, so nothing here ever fetches anything.
 *
 * Three steps, in order:
 *
 *   1. a real SVG in icons/brands/   - dropped in, see the README there
 *   2. the category's own icon       - js/category-icons.js
 *   3. a monogram                    - the initials on a tile whose colour
 *                                      comes from the name itself
 *
 * The monogram is not a placeholder for a missing logo. It is the answer for
 * the long tail: the kirana shop, the local clinic, the tuition teacher.
 * Those will never be in any icon set, and a letter on a coloured tile is
 * how a person recognises them in a list anyway.
 *
 * Trademarks belong to their owners. Nothing in this file draws an
 * approximation of one: a brand mark appears only when a real asset has been
 * put in icons/brands/.
 */

import { significantTokens } from './merchant-rules.js';
import { categoryStyle } from './category-style.js';

/* Which brand assets exist. The build has no directory listing at runtime,
 * so a file that has been dropped in is declared here once and everything
 * else follows automatically. Adding a brand is one line in this list plus
 * the SVG; no view changes.
 */
export const BRAND_ASSETS = [
  // (empty: no licensed assets are bundled yet - see icons/brands/README.md)
];

const ASSETS = new Set(BRAND_ASSETS);

/* Words that identify a payment channel rather than a merchant. A UPI
 * handle's suffix is not who you paid.
 */
const CHANNEL = new Set([
  'upi', 'imps', 'neft', 'rtgs', 'atm', 'pos', 'nach', 'ach', 'ecs', 'emi',
  'okaxis', 'okhdfcbank', 'okicici', 'oksbi', 'ybl', 'paytm', 'apl', 'axl',
  'ibl', 'aubank', 'idfcbank', 'yesbank', 'kotak',
]);

/* The stable key for a merchant. Built from the app's own normalisation so
 * the same shop under three different gateway prefixes resolves once.
 */
export function brandKey(raw) {
  if (!raw) return '';
  const tokens = significantTokens(String(raw)).filter((t) => !CHANNEL.has(t));
  if (!tokens.length) {
    // Nothing survived: fall back to the first run of letters, which covers
    // short names the token filter drops ("OLA", "BSES").
    const m = String(raw).toUpperCase().match(/[A-Z]{2,}/);
    return m ? m[0].toLowerCase() : '';
  }
  return tokens[0];
}

/* What a person should see written, as opposed to what the bank wrote.
 * "PAY*SWIGGY BENGALURU" -> "Swiggy". Falls back to the raw text so a name
 * this cannot improve is still shown rather than lost.
 */
export function brandLabel(raw) {
  const key = brandKey(raw);
  if (!key) return String(raw || '').trim();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/* The initials. One letter for a single word, two for a name made of
 * several, because "SB" reads as State Bank and "S" reads as nothing.
 */
function initials(raw) {
  const words = String(raw || '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) {
    const w = words[0];
    return (w.length > 1 && /^\p{L}/u.test(w) ? w.slice(0, 2) : w.slice(0, 1)).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* The tile's colour. A hash of the key, so a merchant is the same colour on
 * every screen, on every device, forever - which is the whole point: you
 * come to know Swiggy as the teal one without ever being told.
 *
 * The hues are the DNA's own spectrum and nothing outside it: cyan through
 * violet to magenta, plus the two money hues. Lightness and chroma are
 * fixed, so every tile has the same weight and none of them shouts.
 */
const HUES = [206, 232, 262, 292, 318, 330, 158, 22];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function brandHue(raw) {
  const key = brandKey(raw) || String(raw || '');
  return HUES[hash(key) % HUES.length];
}

/* The mark itself.
 *
 *   name      what the bank wrote, or a bank's own name
 *   category  the category's name, if one is known, for step 2
 *   size      'sm' 30px | 'md' 38px | 'lg' 46px
 *
 * Always returns something drawable. There is no state in which this
 * produces a broken image: an asset is only referenced when it is known to
 * have been bundled.
 */
export function brandMark(name, { category = '', size = 'md' } = {}) {
  const label = String(name || '').trim();
  const key = brandKey(label);
  const cls = `k-brand k-brand--${size}`;

  // 1 · a real asset, if one has been dropped in for this merchant
  if (key && ASSETS.has(key)) {
    return `<span class="${cls}" data-brand="${escapeAttr(key)}" aria-hidden="true"
      ><img src="./icons/brands/${escapeAttr(key)}.svg" alt="" width="24" height="24" loading="lazy"></span>`;
  }

  // 2 · the category's own icon, which already has a colour of its own
  if (category) {
    const style = categoryStyle(category);
    if (style && style.icon) {
      return `<span class="${cls} k-brand--cat" style="--k-tint:${style.color}" aria-hidden="true">${style.icon}</span>`;
    }
  }

  // 3 · the monogram
  if (!label) {
    return `<span class="${cls} k-brand--none" aria-hidden="true"></span>`;
  }
  const mark = initials(label);
  const glyphs = [...mark].map((ch) => `<span class="k-brand__glyph">${escapeHtml(ch)}</span>`).join('');
  return `<span class="${cls} k-brand--mono" style="--k-hue:${brandHue(label)}" aria-hidden="true"
    ><span class="k-brand__text">${glyphs}</span></span>`;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeAttr = escapeHtml;
