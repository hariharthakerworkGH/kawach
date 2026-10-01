// The film's toolkit: time, springs, colour and the drawing every scene is
// built from. Everything here is a pure function of its arguments, so a frame
// drawn at 31.4 s is the same frame however it was reached (played, scrubbed
// or rendered to video one frame at a time).
import { icon } from '../icons.js';
import { categoryStyle } from '../category-style.js';
import { formatRupees } from '../format.js';

export const W = 1080;
export const H = 1920;

// The app's dark tokens (css/dna.css), plus the splash screen's own two
// colours (index.html .boot), which the mark is always drawn in.
export const C = {
  bg: 'oklch(10% 0.014 268)',
  bgElev: 'oklch(15.5% 0.018 268)',
  surface: 'oklch(19% 0.019 268)',
  surfaceElev: 'oklch(22.5% 0.021 268)',
  hero: 'oklch(26% 0.024 268)',
  text: 'oklch(97% 0.004 260)',
  text2: 'oklch(73% 0.014 262)',
  text3: 'oklch(65% 0.016 262)',
  cyan: 'oklch(82% 0.13 206)',
  violet: 'oklch(66% 0.17 292)',
  magenta: 'oklch(72% 0.19 330)',
  emerald: 'oklch(80% 0.16 158)',
  red: 'oklch(70% 0.18 22)',
  amber: 'oklch(83% 0.15 78)',
  ink: '#47d0f8',
  mark: '#e8fbff',
  food: 'oklch(78% 0.15 55)',
};

export const SANS = 'Geist, system-ui, sans-serif';
export const MONO = '"Cascadia Mono", Consolas, ui-monospace, monospace';

// A colour at an opacity, for oklch() and #rrggbb alike.
export function alpha(c, a) {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return c.replace(/\)$/, ` / ${a})`);
}

// Mixing two oklch colours, for a status that shifts from green to red.
export function mix(c1, c2, p) {
  const a = c1.match(/[\d.]+/g).map(Number);
  const b = c2.match(/[\d.]+/g).map(Number);
  let h1 = a[2];
  let h2 = b[2];
  if (Math.abs(h2 - h1) > 180) h2 += h2 < h1 ? 360 : -360;
  return `oklch(${lerp(a[0], b[0], p)}% ${lerp(a[1], b[1], p)} ${(lerp(h1, h2, p) + 360) % 360})`;
}

// ---- time --------------------------------------------------------------------

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, p) => a + (b - a) * p;
// How far t has got from a to b, 0 to 1.
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const ease = {
  out: (p) => 1 - (1 - p) ** 3,
  quint: (p) => 1 - (1 - p) ** 5,
  expo: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  in: (p) => p * p * p,
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
};
// The opening's own curves (index.html): drawing, arriving, leaving.
export const bez = {
  draw: (p) => cubic(0.65, 0, 0.35, 1, p),
  rise: (p) => cubic(0.22, 1, 0.36, 1, p),
  fade: (p) => cubic(0.4, 0, 0.2, 1, p),
};
function cubic(x1, y1, x2, y2, p) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let u = p;
  for (let i = 0; i < 8; i++) {
    const x = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3 - p;
    const dx = 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    u = clamp(u - x / dx);
  }
  return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3;
}

// An underdamped spring's step response: damping ratio 0.65, so things snap
// into place with one small overshoot. Closed form, so it is a function of
// time and nothing else.
export function spring(t, omega = 15, zeta = 0.65) {
  if (t <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}

// A repeatable "random" number for an index, so the same shard flies the same
// way in every frame.
export const hash = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const rupees = (r) => formatRupees(Math.round(r) * 100);

// ---- text ----------------------------------------------------------------------

export function font(ctx, size, weight = 600, family = SANS) {
  ctx.font = `${weight} ${size}px ${family}`;
}

export function text(ctx, str, x, y, o = {}) {
  const { size = 40, weight = 600, family = SANS, color = C.text, align = 'left', base = 'alphabetic', spacing = 0, a = 1, glow = 0 } = o;
  if (a <= 0 || !str) return 0;
  ctx.save();
  ctx.globalAlpha *= a;
  font(ctx, size, weight, family);
  ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillStyle = color;
  if (glow) {
    ctx.shadowColor = alpha(color.startsWith('#') ? color : color, 0.7);
    ctx.shadowBlur = glow;
  }
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

export function measure(ctx, str, size, weight = 600, family = SANS, spacing = 0) {
  ctx.save();
  font(ctx, size, weight, family);
  ctx.letterSpacing = `${spacing}px`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

const GLYPHS = '0123456789ABCDEF#%+=<>/';
// Text being generated: the first part settled, a few characters still
// cycling ahead of it, the rest not there yet.
export function scramble(str, p, seed = 1, t = 0) {
  if (!(p > 0)) return '';
  const n = str.length;
  const k = Math.floor(clamp(p) * n);
  if (k >= n) return str;
  let out = '';
  for (let i = 0; i < n; i++) {
    const ch = str[i];
    if (i < k || ch === ' ') out += ch;
    else if (i < k + 5) out += GLYPHS[Math.floor(hash(seed * 31 + i * 7 + Math.floor(t * 40)) * GLYPHS.length)];
    else break;
  }
  return out;
}

// Typing, a character at a time.
export const typed = (str, p) => str.slice(0, Math.round(clamp(p) * str.length));

// Words springing up into place one after another.
export function words(ctx, str, x, y, t, start, o = {}) {
  const { size = 72, weight = 700, color = C.text, align = 'left', stagger = 0.05, spacing = -2, accent = null, out = 1e9 } = o;
  const parts = str.split(' ');
  font(ctx, size, weight);
  ctx.letterSpacing = `${spacing}px`;
  const space = ctx.measureText(' ').width;
  const widths = parts.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (parts.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  parts.forEach((w, i) => {
    const s = spring(t - start - i * stagger, 17);
    const leave = ease.in(seg(t, out + i * 0.02, out + 0.25 + i * 0.02));
    const a = clamp(s * 1.4) * (1 - leave);
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(cx, y + (1 - s) * size * 0.6 - leave * size * 0.5);
      text(ctx, w, 0, 0, { size, weight, color: accent && accent.includes(i) ? C.cyan : color, spacing });
      ctx.restore();
    }
    cx += widths[i] + space;
  });
}

// ---- shapes ----------------------------------------------------------------------

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// A glass panel: a slightly lighter, slightly see-through surface, lit along
// its top edge, with a soft shadow under it. Depth, not borders.
export function glass(ctx, x, y, w, h, o = {}) {
  const { r = 32, a = 1, glow = null, glowA = 1, tint = null } = o;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 22;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, alpha(C.surfaceElev, 0.86));
  g.addColorStop(1, alpha(C.surface, 0.78));
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (tint) {
    ctx.fillStyle = alpha(tint, 0.07);
    ctx.fill();
  }
  const sheen = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 160));
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.stroke();
  if (glow && glowA > 0) {
    ctx.globalAlpha *= glowA;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 36;
    ctx.strokeStyle = glow;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

// A rounded pill with a label: status, chips, tags.
export function pill(ctx, label, x, y, o = {}) {
  const { size = 26, color = C.cyan, a = 1, family = MONO, weight = 600, fill = 0.14, align = 'left', dot = false, padX = 22, h = size * 1.9 } = o;
  if (a <= 0) return 0;
  const tw = measure(ctx, label, size, weight, family, 1.5);
  const w = tw + padX * 2 + (dot ? size * 0.9 : 0);
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.save();
  ctx.globalAlpha *= a;
  rr(ctx, x0, y - h / 2, w, h, h / 2);
  ctx.fillStyle = alpha(color, fill);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = alpha(color, 0.5);
  ctx.stroke();
  let tx = x0 + padX;
  if (dot) {
    ctx.beginPath();
    ctx.arc(tx + size * 0.3, y, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    tx += size * 0.9;
  }
  text(ctx, label, tx, y + size * 0.36, { size, weight, family, color, spacing: 1.5 });
  ctx.restore();
  return w;
}

// Viewfinder corners round something worth looking at.
export function brackets(ctx, x, y, w, h, p, color = C.cyan, len = 26) {
  if (p <= 0) return;
  const k = spring(p, 18);
  const g = (1 - k) * 18;
  ctx.save();
  ctx.globalAlpha *= clamp(p * 4);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  const corners = [[x - g, y - g, 1, 1], [x + w + g, y - g, -1, 1], [x - g, y + h + g, 1, -1], [x + w + g, y + h + g, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * len);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * len, cy);
    ctx.stroke();
  }
  ctx.restore();
}

// A glowing ring round a point, with a pulse leaving it every second.
export function ringAt(ctx, x, y, r, p, color = C.cyan) {
  if (p <= 0) return;
  const k = spring(p, 17);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 3;
  ctx.globalAlpha *= clamp(p * 5);
  ctx.beginPath();
  ctx.arc(x, y, r * k, 0, Math.PI * 2);
  ctx.stroke();
  const ph = (p % 1.1) / 1.1;
  ctx.globalAlpha *= 1 - ph;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + ph * 0.9), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// A callout: a ring on the thing, a line out to a label, the label typed.
// It teaches how to read what it points at.
export function callout(ctx, t, start, o) {
  const p = t - start;
  const { tx, ty, r = 30, lx, ly, title, sub = '', color = C.cyan, align = 'left', end = Infinity, ring = true } = o;
  if (p <= 0 || t > end + 0.3) return;
  const leave = ease.in(seg(t, end, end + 0.3));
  ctx.save();
  ctx.globalAlpha *= 1 - leave;
  if (ring) ringAt(ctx, tx, ty, r, p, color);
  const lp = ease.out(seg(p, 0.08, 0.32));
  const ang = Math.atan2(ly - ty, lx - tx);
  const sx = tx + Math.cos(ang) * r;
  const sy = ty + Math.sin(ang) * r;
  ctx.strokeStyle = alpha(color, 0.85);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(lerp(sx, lx, lp), lerp(sy, ly, lp));
  ctx.stroke();
  if (lp >= 1) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tp = seg(p, 0.28, 0.75);
  if (tp > 0) {
    const tw = Math.max(measure(ctx, title, 26, 700, MONO, 2), sub ? measure(ctx, sub, 28, 500) : 0);
    const bw = tw + 44;
    const bh = sub ? 104 : 62;
    const bx = align === 'right' ? lx - bw - 14 : align === 'center' ? lx - bw / 2 : lx + 14;
    const by = ly - bh / 2;
    const k = spring(p - 0.28, 18);
    ctx.save();
    ctx.translate(bx + bw / 2, ly);
    ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
    ctx.translate(-(bx + bw / 2), -ly);
    ctx.globalAlpha *= clamp(k * 1.5);
    rr(ctx, bx, by, bw, bh, 16);
    ctx.fillStyle = alpha(C.bgElev, 0.92);
    ctx.fill();
    ctx.strokeStyle = alpha(color, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, scramble(title, tp * 1.3, title.length, t), bx + 22, by + 40, { size: 26, weight: 700, family: MONO, color, spacing: 2 });
    if (sub) text(ctx, typed(sub, seg(p, 0.45, 0.9)), bx + 22, by + 82, { size: 28, weight: 500, color: C.text2 });
    ctx.restore();
  }
  ctx.restore();
}

// An arc of a ring, 0 at the top, going clockwise.
export function arc(ctx, x, y, r, from, to, width, color, glow = 0) {
  if (to <= from) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  if (glow) {
    ctx.shadowColor = typeof color === 'string' ? color : C.cyan;
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2 + from * Math.PI * 2, -Math.PI / 2 + to * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---- icons ---------------------------------------------------------------------------

// The app's own icons (js/icons.js, js/category-style.js), turned into images
// once, so a frame only has to place them.
const images = new Map();
export async function loadIcons(list) {
  await Promise.all(list.map(async ([key, markup, color]) => {
    const svg = markup
      .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"')
      .replaceAll('currentColor', color);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    images.set(key, img);
  }));
}
export const appIcon = (name, color) => [`${name}|${color}`, icon(name), color];
export const catIcon = (name, color) => [`cat:${name}|${color}`, categoryStyle(name).icon, color];
export function drawIcon(ctx, key, x, y, size, a = 1) {
  const img = images.get(key);
  if (!img || a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

// ---- the mark ------------------------------------------------------------------------
//
// Kawach's mark exactly as the app opens with it (index.html, .boot): the
// glass icon, its blurred glow, and the line mark whose two edges trace down
// from the top and meet at the point. Same paths, colours and weights.

export const SHIELD = new Path2D('M50 12L80 22V48C80 68 67 82 50 89C33 82 20 68 20 48V22Z');
export const RUPEE = new Path2D('M38 34h24M38 45h24M44 34c11 0 11 20 0 20h-5l17 17');

function bezierPts(p0, p1, p2, p3, n = 32) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const a = (1 - u) ** 3;
    const b = 3 * (1 - u) ** 2 * u;
    const c = 3 * (1 - u) * u * u;
    const d = u ** 3;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}
const HALF_L = [[50, 12], [20, 22], [20, 48], ...bezierPts([20, 48], [20, 68], [33, 82], [50, 89])];
const HALF_R = HALF_L.map(([x, y]) => [100 - x, y]);
function partial(ctx, pts, frac) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total * clamp(frac);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l <= left) ctx.lineTo(x1, y1);
    else ctx.lineTo(x0 + ((x1 - x0) * left) / l, y0 + ((y1 - y0) * left) / l);
    left -= l;
  }
}

// The opening's sequence at time p after it starts (index.html: the edges
// trace 0.2-1.1 s, the glass fades 0.45-1.35 s, the glow rises 0.7-1.6 s).
export function markState(p) {
  return {
    icon: 1 - bez.fade(seg(p, 0.45, 1.35)),
    trace: bez.draw(seg(p, 0.2, 1.1)),
    glow: 0.8 * bez.rise(seg(p, 0.7, 1.6)),
  };
}

// size: the width of the mark's 100-unit box, in pixels.
export function drawMark(ctx, cx, cy, size, st, o = {}) {
  const { a = 1, sheen = -1 } = o;
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(cx - size / 2, cy - size / 2);
  const k = size / 100;
  ctx.scale(k, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (st.icon > 0) {
    ctx.save();
    ctx.globalAlpha *= st.icon;
    const body = ctx.createLinearGradient(30, 12, 64, 89);
    body.addColorStop(0, 'rgba(71, 208, 248, 0.42)');
    body.addColorStop(0.5, 'rgba(43, 127, 184, 0.26)');
    body.addColorStop(1, 'rgba(124, 92, 240, 0.18)');
    ctx.fillStyle = body;
    ctx.fill(SHIELD);
    ctx.save();
    ctx.clip(SHIELD);
    const sh = ctx.createLinearGradient(0, 0, 13, 49);
    sh.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    sh.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
    sh.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(33, 24, 33, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const edge = ctx.createLinearGradient(20, 12, 50, 89);
    edge.addColorStop(0, 'rgba(205, 245, 255, 0.98)');
    edge.addColorStop(0.4, 'rgba(71, 208, 248, 0.8)');
    edge.addColorStop(1, 'rgba(71, 208, 248, 0.34)');
    ctx.shadowColor = 'rgba(71, 208, 248, 0.52)';
    ctx.shadowBlur = 3.2 * 2 * k;
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2.9;
    ctx.stroke(SHIELD);
    ctx.strokeStyle = C.mark;
    ctx.lineWidth = 6.6;
    ctx.stroke(RUPEE);
    ctx.restore();
  }

  if (st.glow > 0) {
    ctx.save();
    ctx.globalAlpha *= st.glow;
    ctx.filter = `blur(${(9 * size) / 242}px)`;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.2;
    ctx.stroke(SHIELD);
    ctx.strokeStyle = '#d6f6ff';
    ctx.lineWidth = 7;
    ctx.stroke(RUPEE);
    ctx.restore();
  }

  if (st.trace > 0) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2.4;
    partial(ctx, HALF_L, st.trace);
    ctx.stroke();
    partial(ctx, HALF_R, st.trace);
    ctx.stroke();
  }
  ctx.strokeStyle = C.mark;
  ctx.lineWidth = 6.6;
  ctx.stroke(RUPEE);

  // A band of light passing over the metal of the line mark.
  if (sheen > -0.5 && sheen < 1.5) {
    const g = ctx.createLinearGradient(0 + sheen * 140 - 40, 0, 40 + sheen * 140 - 40, 100);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
    g.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.stroke(SHIELD);
    ctx.lineWidth = 7;
    ctx.stroke(RUPEE);
  }
  ctx.restore();
}

// The name under the mark, as the opening sets it: 600 weight, the letters
// 0.34em apart, each sliding out from the middle on one curve.
export function drawWord(ctx, cx, top, size, p, a = 1) {
  const e = bez.rise(clamp(p / 0.76));
  if (e <= 0 || a <= 0) return;
  const letters = [...'KAWACH'];
  font(ctx, size, 600);
  ctx.letterSpacing = '0px';
  const ws = letters.map((l) => ctx.measureText(l).width);
  const gap = size * 0.34;
  const total = ws.reduce((s, w) => s + w, 0) + gap * 5;
  let x = cx - total / 2;
  letters.forEach((l, i) => {
    const dx = (i - 2.5) * -0.42 * size * (1 - e);
    text(ctx, l, x + dx, top + size * 0.82, { size, weight: 600, color: '#e6f6fb', a: e * a });
    x += ws[i] + gap;
  });
}
