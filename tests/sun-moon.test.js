// The real sun and moon behind every screen, and "Follow the sun" (5.89). Made-up moments only; the sun and moon are the real ones for the dates.
import { test, equal, ok } from './harness.js';
import { sunAt, moonAt, sunTimes, isDay, nextChange, skyState, moonPathD, phaseName, getPlace, setCity, setPlace, DEFAULT_PLACE, CITIES } from '../js/sun-moon.js';
import { colouringFor } from '../js/looks.js';
import { moveFixedHavenToSun, appearance } from '../js/appearance.js';

const RAJKOT = { name: 'Rajkot', lat: 22.3, lon: 70.8 };
const IST = 5.5 * 3600e3;
const at = (ymd, h) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d) - IST + h * 3600e3; };
const hoursOf = (ms, ymd) => (ms - at(ymd, 0)) / 3600e3;

test('sun: Rajkot on 22 Oct 2026 rises about 6:50 am, sets about 6:15 pm and stands about 57 degrees up at noon', () => {
  const t = sunTimes(at('2026-10-22', 0), RAJKOT);
  const rise = hoursOf(t.rise, '2026-10-22'), set = hoursOf(t.set, '2026-10-22');
  ok(rise > 6.55 && rise < 7.05, `rise ${rise}`);
  ok(set > 18.05 && set < 18.5, `set ${set}`);
  const noon = sunAt(at('2026-10-22', (rise + set) / 2), RAJKOT.lat, RAJKOT.lon).alt;
  ok(noon > 55 && noon < 59, `noon ${noon}`);
});

test('sun: the west of India has a later sunrise than the east, and summer days are longer than winter days', () => {
  const rise = (p, ymd) => hoursOf(sunTimes(at(ymd, 0), p).rise, ymd);
  ok(rise({ lat: 22, lon: 70.8 }, '2026-10-22') - rise({ lat: 22, lon: 88.4 }, '2026-10-22') > 1, 'Rajkot is more than an hour after Kolkata');
  const len = (ymd) => { const t = sunTimes(at(ymd, 0), RAJKOT); return t.set - t.rise; };
  ok(len('2026-06-21') - len('2026-12-21') > 2.5 * 3600e3, 'June days are over 2.5 h longer');
});

test('moon: new on 10 Oct 2026, a waxing gibbous on the 22nd, full on the 26th', () => {
  const frac = (ms) => moonAt(ms, RAJKOT.lat, RAJKOT.lon).fraction;
  ok(frac(Date.UTC(2026, 9, 10, 16, 0)) < 0.03, 'new moon');
  const m = moonAt(at('2026-10-22', 19), RAJKOT.lat, RAJKOT.lon);
  equal(phaseName(m.phase), 'Waxing gibbous');
  ok(m.fraction > 0.78 && m.fraction < 0.92, `lit ${m.fraction}`);
  ok(frac(Date.UTC(2026, 9, 26, 12, 0)) > 0.97, 'full moon');
});

test('moon shape: a quarter is a straight edge, a crescent and a gibbous curve opposite ways, and it leans after full', () => {
  ok(/A0 20 /.test(moonPathD(0.25).d), 'a straight terminator');
  ok(/ 0 0 0 0 -20Z$/.test(moonPathD(0.1).d) && / 0 0 1 0 -20Z$/.test(moonPathD(0.4).d), 'crescent and gibbous curve opposite ways');
  equal([moonPathD(0.3).flip, moonPathD(0.7).flip], [false, true]);
});

test('follow the sun: the day flips exactly once at sunrise and once at sunset, and nextChange names the minute', () => {
  const dawn = at('2026-10-22', 5), c1 = nextChange(dawn, RAJKOT);
  ok(!isDay(c1 - 60000, RAJKOT) && isDay(c1 + 60000, RAJKOT), 'night then day at sunrise');
  ok(hoursOf(c1, '2026-10-22') > 6.5 && hoursOf(c1, '2026-10-22') < 7.1);
  const c2 = nextChange(c1 + 60000, RAJKOT);
  ok(isDay(c2 - 60000, RAJKOT) && !isDay(c2 + 60000, RAJKOT), 'day then night at sunset');
  ok(hoursOf(c2, '2026-10-22') > 18 && hoursOf(c2, '2026-10-22') < 18.6);
});

test('follow the sun: Haven wears its day while the sun is up and its night after; another look reads the sun as its phone', () => {
  equal([colouringFor('sun', false, 'haven', true).id, colouringFor('sun', true, 'haven', false).id], ['haven-day', 'haven-night']);
  equal(colouringFor('haven-night', true, 'haven', true).id, 'haven-night', 'a fixed colour is never moved by the sun');
});

test('the sky: the header text is above 4.5 : 1 at every minute of the year in three very different cities, for every setting', () => {
  let worst = 99, samples = 0;
  for (const p of [RAJKOT, { lat: 26.1, lon: 91.7 }, { lat: 9.9, lon: 76.3 }]) {
    for (const ymd of ['2026-03-20', '2026-06-21', '2026-09-23', '2026-12-21']) {
      for (let m = 0; m < 1440; m += 5) {
        for (const force of [null, 'day', 'night']) { worst = Math.min(worst, skyState(at(ymd, m / 60), p, force).contrastTitle); samples++; }
      }
    }
  }
  ok(samples > 10000);
  ok(worst >= 4.5, `lowest ${worst.toFixed(2)}`);
});

test('the sky: the stars are out at night and gone by day, and the sun is hidden behind the hills at night', () => {
  const noon = skyState(at('2026-10-22', 12.5), RAJKOT), night = skyState(at('2026-10-22', 22), RAJKOT);
  equal([noon.stars, night.stars > 0.9, noon.sunShown, night.sunShown], [0, true, 1, 0]);
  equal([noon.night, night.night], [false, true]);
});

test('where you are: a city or a location is kept and read back, a bad one is ignored, and nothing is stored by default', () => {
  const had = localStorage.getItem('kawach-where');
  try {
    localStorage.removeItem('kawach-where');
    equal(getPlace(), DEFAULT_PLACE);
    ok(setCity('Rajkot'));
    equal([getPlace().name, getPlace().lat], ['Rajkot', CITIES.Rajkot[0]]);
    localStorage.setItem('kawach-where', JSON.stringify({ name: 'x', lat: 999, lon: 0 }));
    equal(getPlace(), DEFAULT_PLACE);
    ok(!setCity('Atlantis'));
    ok(setPlace({ name: 'My location', lat: 19.1, lon: 72.9, device: true }));
    equal(getPlace().device, true);
  } finally {
    if (had === null) localStorage.removeItem('kawach-where');
    else localStorage.setItem('kawach-where', had);
  }
});

test('5.89.2: whoever tapped the old day/night button (a fixed Haven day or night) moves to Follow the sun once; a colouring picked on purpose stays', () => {
  const key = 'kawach-appearance', had = localStorage.getItem(key);
  try {
    localStorage.setItem(key, JSON.stringify({ colour: 'haven-night' }));
    ok(moveFixedHavenToSun());
    equal(appearance('colour'), 'sun');
    ok(!moveFixedHavenToSun(), 'it only ever happens once');
    localStorage.setItem(key, JSON.stringify({ colour: 'haven-night', sunMigrated: true }));
    moveFixedHavenToSun();
    equal(appearance('colour'), 'haven-night', 'a choice made afterwards is kept');
    localStorage.setItem(key, JSON.stringify({ colour: 'ember-dusk' }));
    ok(!moveFixedHavenToSun(), 'a retired colouring is not "moved" here: it follows the sun by itself');
    equal(appearance('colour'), 'sun');
  } finally {
    if (had === null) localStorage.removeItem(key);
    else localStorage.setItem(key, had);
  }
});
