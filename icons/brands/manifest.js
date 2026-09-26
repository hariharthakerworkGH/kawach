/* The brand library: who Kawach would like a mark for, and whether it has one.
 *
 * This is a shopping list, not an implementation. The resolver in
 * js/brand.js is unchanged and still decides what actually gets drawn:
 *
 *     1. a licensed SVG in icons/brands/<key>.svg, declared in BRAND_ASSETS
 *     2. the category's own icon
 *     3. a deterministic monogram, hue hashed from the name
 *
 * `key` is what js/brand.js brandKey() reduces a statement line to, so
 * "PAY*SWIGGY BENGALURU" and "UPI/SWIGGY/8412" both land on `swiggy`. That
 * key is the filename.
 *
 * `asset: false` everywhere below is the honest current state: no
 * third-party mark is bundled, because none has been licensed. Nothing here
 * is drawn from memory and no logo is approximated - a wrong-looking logo is
 * worse than a monogram, and an unlicensed one is worse than both.
 *
 * To add one: drop `<key>.svg` here, flip `asset` to true, add the key to
 * BRAND_ASSETS in js/brand.js, and add the path to APP_SHELL in sw.js.
 * See README.md in this folder for the size and colour rules.
 *
 * Loaded by /lab/ only. The app does not import this file.
 */

export const BRANDS = [
  { category: 'Food and delivery', items: [
    { name: 'Swiggy', key: 'swiggy', asset: false },
    { name: 'Zomato', key: 'zomato', asset: false },
    { name: "McDonald's", key: 'mcdonalds', asset: false },
    { name: "Domino's", key: 'dominos', asset: false },
    { name: 'KFC', key: 'kfc', asset: false },
  ] },
  { category: 'Groceries', items: [
    { name: 'Blinkit', key: 'blinkit', asset: false },
    { name: 'Zepto', key: 'zepto', asset: false },
    { name: 'BigBasket', key: 'bigbasket', asset: false },
    { name: 'Instamart', key: 'instamart', asset: false },
  ] },
  { category: 'Shopping', items: [
    { name: 'Amazon', key: 'amazon', asset: false },
    { name: 'Flipkart', key: 'flipkart', asset: false },
    { name: 'Myntra', key: 'myntra', asset: false },
    { name: 'AJIO', key: 'ajio', asset: false },
    { name: 'Nykaa', key: 'nykaa', asset: false },
  ] },
  { category: 'Transport', items: [
    { name: 'Uber', key: 'uber', asset: false },
    { name: 'Ola', key: 'ola', asset: false },
    { name: 'Rapido', key: 'rapido', asset: false },
    { name: 'IRCTC', key: 'irctc', asset: false },
    { name: 'MakeMyTrip', key: 'makemytrip', asset: false },
  ] },
  { category: 'Entertainment', items: [
    { name: 'Netflix', key: 'netflix', asset: false },
    { name: 'Spotify', key: 'spotify', asset: false },
    { name: 'YouTube', key: 'youtube', asset: false },
    { name: 'Prime Video', key: 'prime', asset: false },
    { name: 'BookMyShow', key: 'bookmyshow', asset: false },
  ] },
  { category: 'Payments', items: [
    { name: 'PhonePe', key: 'phonepe', asset: false },
    { name: 'Google Pay', key: 'gpay', asset: false },
    { name: 'Paytm', key: 'paytm', asset: false },
    { name: 'CRED', key: 'cred', asset: false },
    { name: 'Amazon Pay', key: 'amazonpay', asset: false },
  ] },
  { category: 'Banks', items: [
    { name: 'HDFC Bank', key: 'hdfc', asset: false },
    { name: 'ICICI Bank', key: 'icici', asset: false },
    { name: 'State Bank of India', key: 'sbi', asset: false },
    { name: 'Axis Bank', key: 'axis', asset: false },
    { name: 'Kotak Mahindra', key: 'kotak', asset: false },
    { name: 'IDFC First', key: 'idfc', asset: false },
    { name: 'Yes Bank', key: 'yesbank', asset: false },
    { name: 'IndusInd', key: 'indusind', asset: false },
  ] },
  { category: 'Telecom', items: [
    { name: 'Jio', key: 'jio', asset: false },
    { name: 'Airtel', key: 'airtel', asset: false },
    { name: 'Vi', key: 'vi', asset: false },
  ] },
];

export const allBrands = () => BRANDS.flatMap((g) => g.items.map((b) => ({ ...b, category: g.category })));
export const missing = () => allBrands().filter((b) => !b.asset);
export const present = () => allBrands().filter((b) => b.asset);
