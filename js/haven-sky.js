// Haven's living sky (5.69): a small sun or moon crosses the top edge of every page, a soft glow follows it, and the time of day
// sets the rest - clouds and drifting specks by day, stars by night (the fireflies are in haven-motion.js). It is one layer
// behind the page, so it adds no height, covers no text and no button. The page's own colour wash (--hv-sky-live,
// haven-motion.js) already follows the hour; this adds the things in it.
//   alive: all of it moves   calm: it is there and still   still: no sky at all.
// Shown from the shown mockup: mockups/7.10-day-cycle.
const root = document.documentElement;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
let layer = null;

function build() {
  const el = document.createElement('div');
  el.className = 'hv-sky';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i class="hv-sky__glow"></i><i class="hv-sky__sun"></i><i class="hv-sky__moon"></i>';
  for (let i = 0; i < 20; i++) {
    const s = document.createElement('i');
    s.className = 'hv-sky__star';
    s.style.cssText = `left:${rnd(3, 97).toFixed(1)}%;top:${rnd(6, 62).toFixed(1)}%;${i % 3 === 0 ? `animation-delay:${rnd(0, 3).toFixed(1)}s` : 'animation:none'}`;
    el.append(s);
  }
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('i');
    c.className = 'hv-sky__cloud';
    c.style.cssText = `width:${Math.round(rnd(70, 110))}px;top:${58 + i * 52}px;animation-duration:${70 + i * 35}s;animation-delay:-${Math.round(rnd(0, 70))}s`;
    el.append(c);
  }
  for (let i = 0; i < 6; i++) {
    const m = document.createElement('i');
    m.className = 'hv-sky__mote';
    m.style.cssText = `left:${rnd(5, 92).toFixed(1)}%;top:${rnd(12, 70).toFixed(1)}%;animation-delay:-${rnd(0, 8).toFixed(1)}s`;
    el.append(m);
  }
  return el;
}

export function paintSkyLayer() {
  const want = root.dataset.style === 'haven' && root.dataset.motion !== 'still' && !!document.body;
  if (!want) { layer?.remove(); layer = null; return; }
  if (!layer || !layer.isConnected) { layer = build(); document.body.prepend(layer); }
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  const night = root.dataset.theme === 'dark';
  const sunUp = h >= 6 && h <= 18.7;
  const t = clamp((h - 6) / 12.7);
  // after dusk and before dawn: where the moon is on its way across (h counted from dusk)
  const nt = clamp((h >= 18.7 ? h - 18.7 : h + 5.3) / 11.3);
  // 1 from dusk until the small hours, fading out towards dawn
  const dusk = (a, b) => (h >= 12 ? smooth(a, b, h) : 1 - smooth(a - 14.2, b - 14.2, h));
  const isNight = h >= 18.7 || h < 6;
  const warm = Math.max(smooth(5.4, 6.4, h) * (1 - smooth(7, 8.2, h)), smooth(17, 18.2, h) * (1 - smooth(19, 19.7, h)));
  const s = layer.style;
  const arc = (x) => ({ left: `${(8 + x * 84).toFixed(1)}%`, top: `${(19 - Math.sin(Math.PI * x) * 8).toFixed(1)}px` });
  const sun = arc(t);
  const moon = arc(nt);
  const sunEl = layer.querySelector('.hv-sky__sun');
  const moonEl = layer.querySelector('.hv-sky__moon');
  const glow = layer.querySelector('.hv-sky__glow');
  Object.assign(sunEl.style, sun);
  Object.assign(moonEl.style, moon);
  glow.style.left = isNight ? moon.left : sun.left;
  s.setProperty('--sun-o', sunUp ? (smooth(5.7, 6.6, h) * (1 - smooth(18.2, 18.8, h))).toFixed(2) : '0');
  s.setProperty('--moon-o', isNight ? dusk(18.7, 19.6).toFixed(2) : '0');
  s.setProperty('--star-o', (dusk(19, 20.3) * (night ? 1 : 0.55)).toFixed(2));
  s.setProperty('--glow-c', isNight ? 'rgba(190,205,255,.7)' : warm > 0.15 ? 'rgba(255,150,70,.85)' : 'rgba(255,225,150,.8)');
  s.setProperty('--glow-o', (isNight ? dusk(18.7, 19.6) * 0.35 : sunUp ? clamp(0.3 + warm * 0.5, 0, 0.85) * (night ? 0.8 : 1) : 0).toFixed(2));
  s.setProperty('--cloud', night ? 'rgba(200,215,255,.5)' : 'rgba(255,255,255,.85)');
  s.setProperty('--cloud-o', (sunUp ? smooth(6.5, 8, h) * (1 - smooth(17.5, 18.6, h)) * (night ? 0.5 : 0.85) : 0).toFixed(2));
  s.setProperty('--mote-o', (sunUp ? smooth(7, 9, h) * (1 - smooth(17, 18.6, h)) * 0.8 : 0).toFixed(2));
}

export function startSky() {
  paintSkyLayer();
  setInterval(paintSkyLayer, 60 * 1000);
  document.addEventListener('visibilitychange', paintSkyLayer);
  addEventListener('hv-motion', paintSkyLayer);
  new MutationObserver(paintSkyLayer).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'data-style'] });
}
