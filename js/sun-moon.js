// Where the sun and the moon are, worked out on the phone from the date, the time and a place. Nothing is looked up and nothing is sent.
// The same low-precision almanac formulas every sun/moon table uses: about a degree, which is a few minutes of sunrise.
//
// It answers four things for the rest of the app:
//   - is it day (the sun's top edge is above the horizon)? -> Haven's "Follow the sun" colours (js/looks.js)
//   - where are the sun and the moon, and what shape is the moon? -> the sky behind every screen (js/haven-sky.js)
//   - what colour is the sky? -> skyState(), which also settles the one contrast problem the sky has (see the comment there)
//   - when does that next change? -> nextChange(), so the colours swap at the minute and the page can remember it before it paints
// The place is the device's own choice (a city from a short list, or "Use my location" once), kept in localStorage like the rest of how it looks.

const RAD = Math.PI / 180;
const E = RAD * 23.4397;
const DAY_MS = 864e5;
const days = (ms) => ms / DAY_MS - 0.5 + 2440588 - 2451545;
const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
const sidereal = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
const altOf = (H, phi, de) => Math.asin(Math.sin(phi) * Math.sin(de) + Math.cos(phi) * Math.cos(de) * Math.cos(H));
const aziOf = (H, phi, de) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(de) * Math.cos(phi)); // from south, west positive

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: dec(L, 0), ra: ra(L, 0) };
}
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

// The sun's height above the horizon in degrees (negative below) and its direction (degrees from south, west positive).
export function sunAt(ms, lat, lon) {
  const d = days(ms), c = sunCoords(d), H = sidereal(d, RAD * -lon) - c.ra;
  return { alt: altOf(H, RAD * lat, c.dec) / RAD, az: aziOf(H, RAD * lat, c.dec) / RAD };
}

// The moon's height and direction, how much of it is lit (0 to 1) and where it is in its month (0 new, .5 full, back to 1).
export function moonAt(ms, lat, lon) {
  const d = days(ms), c = moonCoords(d), H = sidereal(d, RAD * -lon) - c.ra;
  let h = altOf(H, RAD * lat, c.dec);
  h += RAD * 0.017 / Math.tan(h + RAD * 10.26 / (h + RAD * 5.1)); // the air bends moonlight up a little at the horizon
  const s = sunCoords(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(c.dec) + Math.cos(s.dec) * Math.cos(c.dec) * Math.cos(s.ra - c.ra));
  const inc = Math.atan2(sd * Math.sin(phi), c.dist - sd * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - c.ra), Math.sin(s.dec) * Math.cos(c.dec) - Math.cos(s.dec) * Math.sin(c.dec) * Math.cos(s.ra - c.ra));
  return { alt: h / RAD, az: aziOf(H, RAD * lat, c.dec) / RAD, fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
}

export const phaseName = (p) =>
  p < 0.03 || p > 0.97 ? 'New moon' : p < 0.22 ? 'Waxing crescent' : p < 0.28 ? 'First quarter' : p < 0.47 ? 'Waxing gibbous' : p < 0.53 ? 'Full moon' : p < 0.72 ? 'Waning gibbous' : p < 0.78 ? 'Last quarter' : 'Waning crescent';

// The sun's upper edge crosses the horizon at -0.83 degrees once the air's bending is counted; the app swaps colours at -0.5, close enough
// that a person sees it happen as the sun goes.
export const SUNRISE_ALT = -0.5;
export const isDay = (ms, place = getPlace()) => sunAt(ms, place.lat, place.lon).alt >= SUNRISE_ALT;

// The first rise and set of a body between ms and ms + a day, found a minute at a time (1,440 sums, about a millisecond).
function crossings(from, at, level, place) {
  let rise = null, set = null, prev = at(from, place.lat, place.lon).alt - level;
  for (let m = 1; m <= 1440; m++) {
    const t = from + m * 60000, cur = at(t, place.lat, place.lon).alt - level;
    if (prev < 0 && cur >= 0 && rise == null) rise = t;
    if (prev >= 0 && cur < 0 && set == null) set = t;
    prev = cur;
  }
  return { rise, set };
}
export const sunTimes = (fromMs, place = getPlace()) => crossings(fromMs, sunAt, -0.833, place);

// The next minute the app's day/night flips: the time to swap the colours, and what the page stores to paint the right ones before it loads.
export function nextChange(ms, place = getPlace()) {
  const up = isDay(ms, place);
  for (let m = 1; m <= 26 * 60; m++) if (isDay(ms + m * 60000, place) !== up) return ms + m * 60000;
  return ms + 26 * 3600e3; // polar day or night: look again tomorrow
}

/* ---------------------------------------------------------------- places */
export const CITIES = {
  'Middle of India': [22.0, 78.0],
  Ahmedabad: [23.02, 72.57], Bengaluru: [12.97, 77.59], Chennai: [13.08, 80.27], Delhi: [28.61, 77.21], Guwahati: [26.14, 91.74],
  Hyderabad: [17.39, 78.49], Jaipur: [26.91, 75.79], Kochi: [9.93, 76.27], Kolkata: [22.57, 88.36], Lucknow: [26.85, 80.95],
  Mumbai: [19.08, 72.88], Nagpur: [21.15, 79.09], Patna: [25.59, 85.14], Pune: [18.52, 73.86], Rajkot: [22.30, 70.80],
  Surat: [21.17, 72.83], Vadodara: [22.31, 73.18],
};
export const DEFAULT_PLACE = { name: 'Middle of India', lat: 22.0, lon: 78.0 };
const KEY = 'kawach-where';

export function getPlace() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) return p;
  } catch { /* private window, or nothing stored: the default */ }
  return DEFAULT_PLACE;
}
export function setPlace(place) {
  try { localStorage.setItem(KEY, JSON.stringify(place)); } catch { return false; }
  window.dispatchEvent(new Event('hv-where'));
  return true;
}
export const setCity = (name) => (CITIES[name] ? setPlace({ name, lat: CITIES[name][0], lon: CITIES[name][1] }) : false);
// One tap, one question to the phone, never sent anywhere. Rounded to a tenth of a degree (about 11 km): a sunrise needs no more.
export function useMyLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This phone cannot say where it is.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 10) / 10, lon = Math.round(pos.coords.longitude * 10) / 10;
        setPlace({ name: 'My location', lat, lon, device: true });
        resolve({ lat, lon });
      },
      (err) => reject(new Error(err && err.code === 1 ? 'Location is turned off for Kawach on this phone.' : "Couldn't get a location. Pick a city instead.")),
      { maximumAge: 30 * DAY_MS, timeout: 12000 }
    );
  });
}

/* ---------------------------------------------------------------- the look of the sky */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// [sun height in degrees, sky top, sky middle, horizon]. The day colours are light enough for the navy title at 4.5 : 1.
// The one hard step is at the sun's edge (-0.55 to -0.45): with it the title, the cards and the ground swap together.
const K = [
  [-18,   [9, 14, 36],     [18, 26, 62],     [34, 40, 86]],
  [-12,   [16, 22, 58],    [38, 40, 96],     [84, 60, 116]],
  [-6,    [30, 40, 98],    [78, 60, 118],    [190, 100, 100]],
  [-1.5,  [46, 58, 128],   [120, 74, 122],   [255, 160, 106]],
  [-0.55, [52, 66, 140],   [130, 80, 124],   [255, 176, 112]],
  [-0.45, [120, 156, 220], [252, 190, 140],  [255, 206, 150]],
  [4,     [128, 172, 232], [248, 212, 168],  [255, 226, 176]],
  [10,    [130, 184, 240], [176, 214, 248],  [226, 238, 252]],
  [25,    [122, 182, 242], [158, 206, 248],  [214, 234, 252]],
  [90,    [112, 176, 242], [148, 200, 248], [208, 232, 252]],
];
export function skyColours(alt) {
  if (alt <= K[0][0]) return { top: K[0][1], mid: K[0][2], hz: K[0][3] };
  let i = 0;
  while (i < K.length - 2 && alt > K[i + 1][0]) i++;
  const u = clamp((alt - K[i][0]) / (K[i + 1][0] - K[i][0]), 0, 1);
  return { top: mix(K[i][1], K[i + 1][1], u), mid: mix(K[i][2], K[i + 1][2], u), hz: mix(K[i][3], K[i + 1][3], u) };
}
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const INK_NIGHT = [255, 255, 255];
export const INK_DAY = [17, 35, 79];
const VEIL = [8, 14, 40];

/* Everything the sky layer needs for one moment.
 *   force: null follows the real sun; 'day' or 'night' is for someone whose colours are fixed (Haven day, Haven night, "follow my phone"):
 *          the sky then agrees with their colours instead of showing a night sky behind a light page.
 * The header's text sits on the sky: white while the sun is down, navy once it is up (the app's own night and day ink). In the twilight the
 * sky is brightest at the horizon and the month chip sits on the lower part of it, so a dark veil (as thin as it can be, never above .5) keeps
 * white above 5 : 1 on both the title and the chip. `contrastTitle` is the worst of the two, for tests. */
export function skyState(ms, place = getPlace(), force = null) {
  const real = sunAt(ms, place.lat, place.lon), moon = moonAt(ms, place.lat, place.lon);
  const sun = force === 'day' ? { alt: 42, az: 0 } : force === 'night' ? { alt: -40, az: 180 } : real;
  const night = sun.alt < SUNRISE_ALT;
  const sky = skyColours(sun.alt);
  const ink = night ? INK_NIGHT : INK_DAY;
  const under = (t, v) => mix(mix(sky.top, sky.mid, t), VEIL, v * 0.92);
  let veil = 0;
  if (night) while (veil < 0.5 && Math.min(contrast(ink, under(0.37, veil)), contrast(ink, under(0.85, veil))) < 5) veil += 0.05;
  const warm = clamp(1 - sun.alt / 14, 0, 1); // 1 at the horizon, 0 once the sun is well up
  const moonShown = force === 'day' ? 0 : clamp((moon.alt + 1.5) / 4, 0, 1) * (sun.alt < 2 ? 1 : clamp(1 - (sun.alt - 2) / 10, 0, 1) * 0.6);
  return {
    sun, moon, real, night, sky, veil, warm, moonShown,
    sunShown: force === 'night' ? 0 : clamp((sun.alt + 1.5) / 4, 0, 1),
    stars: clamp((-sun.alt - 2) / 12, 0, 1),
    contrastTitle: Math.min(contrast(ink, under(0.37, veil)), contrast(ink, under(0.85, veil))),
  };
}

// The lit part of the moon as an SVG path in a 40-wide box (radius 20): the right side while it grows, mirrored by the caller while it shrinks.
export function moonPathD(phase) {
  const r = 20, k = +(Math.abs(Math.cos(2 * Math.PI * phase)) * r).toFixed(2), crescent = phase < 0.25 || phase > 0.75;
  return { d: `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${k} ${r} 0 0 ${crescent ? 0 : 1} 0 ${-r}Z`, flip: phase >= 0.5 };
}
