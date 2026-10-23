/* The moon, drawn pixel by pixel on a small canvas: the real near side (the dark seas where they are on the sky), craters lit from the
 * side, the sun's direction from the real phase (js/sun-moon.js gives it), and a little earthshine on the dark part. It is the moon of
 * mockups/7.0-ledger/orbs.html option A. Nothing is fetched: the ground is worked out on the phone once, a little at a time so no frame
 * waits for it, and until it is ready the moon is drawn plainly (same phase, no seas or craters). */

const N = 160;
const hash = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
const vnoise = (x, y, s) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x, y, s, o = 4) => { let t = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i); a *= 0.5; f *= 2; } return t; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the seas: x right, y up, as seen from the northern half of the earth (centre, radius, how long across, how dark)
const MARIA = [
  [-0.30, 0.40, 0.22, 1.0, 1.0], [0.10, 0.46, 0.13, 1.0, 0.95], [0.30, 0.17, 0.17, 1.15, 0.95], [0.57, -0.07, 0.12, 1.2, 0.85],
  [0.66, 0.31, 0.085, 1.0, 1.0], [0.36, -0.16, 0.07, 1.0, 0.8], [-0.64, 0.08, 0.30, 1.1, 0.8], [-0.46, -0.38, 0.085, 1.0, 0.9],
  [-0.17, -0.37, 0.14, 1.0, 0.75], [-0.27, -0.10, 0.07, 1.0, 0.8], [0.03, 0.22, 0.08, 1.0, 0.7], [-0.05, 0.80, 0.14, 2.6, 0.6],
];
const BRIGHT = [[-0.10, -0.74, 0.05, 1.0], [-0.34, 0.14, 0.03, 0.8], [-0.54, 0.20, 0.025, 0.6], [-0.60, -0.04, 0.02, 0.5]]; // Tycho, Copernicus, Kepler, Aristarchus

let alb = null, rise = null; // the ground's brightness and height, once worked out
let building = false;
const seen = new Set(); // canvases to draw again when the ground is ready

function craters() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const list = [];
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.97, r = 0.007 + Math.pow(rnd(), 4.5) * 0.06;
    list.push([Math.cos(a) * d, Math.sin(a) * d, r, 0.4 + rnd() * 0.6]);
  }
  return list;
}

// Eight slices of rows, one per timer tick, so the page never stops for it.
function buildGround() {
  if (alb || building) return;
  building = true;
  const A = new Float32Array(N * N), H = new Float32Array(N * N), list = craters(), c = N / 2, R = N / 2 - 1.5;
  let row = 0;
  const slice = () => {
    for (const end = Math.min(N, row + 20); row < end; row++) {
      for (let px = 0; px < N; px++) {
        const x = (px - c) / R, y = -(row - c) / R, i = row * N + px;
        if (x * x + y * y > 1.05) continue;
        let a = 0.80 + 0.14 * (fbm(x * 9, y * 9, 3) - 0.5) + 0.08 * (fbm(x * 31, y * 31, 8, 3) - 0.5), sea = 0;
        for (const [mx, my, mr, el, dk] of MARIA) {
          const dx = (x - mx) / (mr * el * 1.3), dy = (y - my) / (mr * 1.3), d2 = dx * dx + dy * dy;
          if (d2 > 4) continue; // far from this sea: nothing to add
          const rag = (fbm(x * 6 + mx, y * 6 + my, 5) - 0.5) * 1.6;
          sea = Math.min(1, sea + dk * smooth(0.0, 0.9, 1.05 - Math.sqrt(d2) + rag * 0.5) * 0.9);
        }
        a *= 1 - 0.5 * sea * (0.85 + 0.3 * fbm(x * 14, y * 14, 9));
        for (const [bx, by, br, bs] of BRIGHT) { const d = Math.hypot(x - bx, y - by); if (d < br * 4) a += bs * 0.32 * Math.exp(-((d / br) ** 2)); }
        A[i] = a;
        let h = 0;
        for (const [cx, cy, cr, cs] of list) {
          const d = Math.hypot(x - cx, y - cy) / cr;
          if (d < 1.35) h += cs * cr * (d < 1 ? -0.55 * (1 - d * d) + 0.1 * d ** 6 : 0.12 * Math.exp(-(((d - 1) / 0.2) ** 2)));
        }
        H[i] = h;
      }
    }
    if (row < N) setTimeout(slice, 0);
    else { alb = A; rise = H; building = false; seen.forEach((cv) => cv.isConnected && cv._phase != null && paint(cv, cv._phase)); }
  };
  setTimeout(slice, 60);
}

// Light the ground for a phase (0 new, 0.5 full, back to 1) and put it on the canvas.
function paint(cv, phase) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const R = N / 2 - 1.5, c = N / 2, img = ctx.createImageData(N, N), d = img.data;
  const ang = phase * Math.PI * 2, L = [Math.sin(ang), 0, -Math.cos(ang)], frac = (1 - Math.cos(ang)) / 2, K = 70;
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const x = (px - c) / R, y = -(py - c) / R, r2 = x * x + y * y, edge = Math.min(1, Math.max(0, (1 - Math.sqrt(r2)) * R));
      if (edge <= 0) continue;
      const z = Math.sqrt(Math.max(0, 1 - r2)), i = py * N + px;
      let nx = x, ny = y, nz = z;
      if (rise) {
        const hx = (rise[py * N + Math.min(N - 1, px + 1)] - rise[py * N + Math.max(0, px - 1)]) / 2;
        const hy = -(rise[Math.min(N - 1, py + 1) * N + px] - rise[Math.max(0, py - 1) * N + px]) / 2;
        nx = x - K * hx; ny = y - K * hy;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      }
      const mu0 = nx * L[0] + ny * L[1] + nz * L[2], base = x * L[0] + z * L[2];
      const lit = (Math.max(0, mu0) / (Math.max(0, mu0) + z + 0.03)) * 1.9 * smooth(-0.015, 0.09, base);
      const earth = 0.25 * (1 - frac) * (0.6 + 0.4 * z), v = (alb ? alb[i] : 0.8) * (lit + earth * 0.55), cold = earth * 0.35;
      const g = (t) => Math.min(255, Math.max(0, 255 * Math.pow(Math.min(1.2, Math.max(0, t)), 0.82)));
      const o = i * 4;
      d[o] = g(v + cold * 0.4); d[o + 1] = g(v * 0.985 + cold * 0.7); d[o + 2] = g(v * 0.955 + cold * 1.1); d[o + 3] = Math.round(edge * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* Draw the moon at `phase` on `canvas` (160 x 160). Cheap to call again: it only lights the ground. */
export function drawMoon(canvas, phase) {
  if (!canvas._ready) { canvas.width = N; canvas.height = N; canvas._ready = true; }
  if (canvas._phase != null && Math.abs(canvas._phase - phase) < 0.002) return;
  canvas._phase = phase;
  seen.add(canvas);
  paint(canvas, phase);
  buildGround();
}
