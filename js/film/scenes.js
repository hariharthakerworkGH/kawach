// The film's timeline: ninety-six seconds, eight scenes, each drawn from the
// time and nothing else. drawFrame(ctx, t) is the whole film.
//
//   0-8    the opening, as the app opens, then a zoom through the mark
//   8-22   Summary: what's safe to spend, and how to read green and red
//   22-35  Add: a payment from a pasted bank SMS, a work cost, saved
//   35-48  Accounts: every account at a glance, a bill paid once
//   48-62  Plan: what must go out, what can flex, what is saved
//   62-76  History: every payment, newest first, and the month's spikes
//   76-90  Coach: three questions, answered from your own numbers
//   90-96  the mark again, and the line it stands for
//
// Every figure is made up (the film says so on screen) and they agree with
// each other: 1,20,000 in, 60,500 must go out, 18,000 can flex, 10,000 saved,
// 31,500 to spend, 16,350 spent, 15,150 left.
import {
  W, H, C, MONO, alpha, mix, clamp, lerp, seg, ease, spring, hash, rupees, text, measure, scramble, typed, words,
  rr, glass, pill, brackets, ringAt, callout, arc, drawIcon, appIcon, catIcon, loadIcons, drawMark, drawWord, markState,
} from './kit.js';

export const LENGTH = 96;

// The icons the film uses, from the app's own sets.
export function loadAssets() {
  return loadIcons([
    appIcon('add', '#06121a'),
    appIcon('check', '#06121a'),
    appIcon('check', C.emerald),
    appIcon('accounts', C.cyan),
    appIcon('card', C.cyan),
    appIcon('cash', C.cyan),
    appIcon('lock', C.violet),
    appIcon('home', C.cyan),
    appIcon('forward', C.cyan),
    appIcon('clock', C.amber),
    catIcon('Food', C.food),
    catIcon('Travel', C.cyan),
    catIcon('Shopping', C.violet),
    catIcon('Fuel', C.amber),
    catIcon('Metro', C.cyan),
    catIcon('Groceries', C.emerald),
    catIcon('Books', C.violet),
  ]);
}

const PAGES = [
  ['01', 'SUMMARY', 7.6, 22],
  ['02', 'ADD', 22, 34.6],
  ['03', 'ACCOUNTS', 34.6, 47.6],
  ['04', 'PLAN', 47.6, 61.8],
  ['05', 'HISTORY', 61.8, 75.6],
  ['06', 'COACH', 75.6, 89.6],
];

export function drawFrame(ctx, t) {
  ctx.save();
  backdrop(ctx, t);
  summary(ctx, t);
  add(ctx, t);
  accounts(ctx, t);
  plan(ctx, t);
  history(ctx, t);
  coach(ctx, t);
  intro(ctx, t);
  outro(ctx, t);
  hud(ctx, t);
  // In from black, out to black.
  const black = Math.max(1 - seg(t, 0, 0.35), seg(t, 95.1, 96));
  if (black > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${black})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---- the room: obsidian, two slow lights, a strict grid --------------------------

function backdrop(ctx, t) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const lights = [
    [C.cyan, 0.16, 540 + Math.sin(t * 0.21) * 380, 520 + Math.cos(t * 0.17) * 260],
    [C.violet, 0.15, 540 + Math.cos(t * 0.19 + 2) * 420, 1380 + Math.sin(t * 0.23) * 300],
    [C.emerald, 0.06 + 0.1 * Math.max(seg(t, 43.8, 44.4) * (1 - seg(t, 45.4, 46.6)), seg(t, 30, 30.4) * (1 - seg(t, 31.2, 32))), 540, 760],
  ];
  for (const [c, a, x, y] of lights) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 950);
    g.addColorStop(0, alpha(c, a));
    g.addColorStop(1, alpha(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // The grid moves with the camera: right for Accounts, down for History.
  const ga = seg(t, 7.0, 7.8) * (1 - seg(t, 89.6, 90.6));
  if (ga > 0) {
    const ox = -1080 * ease.inOut(seg(t, 33.9, 34.8)) - 300 * seg(t, 7, 96);
    const oy = 1920 * ease.inOut(seg(t, 61.3, 62.3));
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = ((ox % 72) + 72) % 72; x < W; x += 72) {
      const major = Math.round((x - ox) / 72) % 5 === 0;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(major ? 0.05 : 0.025) * ga})`;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = ((oy % 72) + 72) % 72; y < H; y += 72) {
      const major = Math.round((y - oy) / 72) % 5 === 0;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(major ? 0.05 : 0.025) * ga})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  const v = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.3, W / 2, H * 0.46, H * 0.75);
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ---- the frame round the pages ---------------------------------------------------

function hud(ctx, t) {
  const a = seg(t, 7.6, 8.2) * (1 - seg(t, 89.3, 89.8));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const page = PAGES.find(([, , s, e]) => t >= s && t < e) || PAGES[PAGES.length - 1];
  const [num, name, s] = page;
  drawMark(ctx, 84, 88, 54, { icon: 0, trace: 1, glow: 0.6 });
  text(ctx, 'KAWACH', 120, 99, { size: 26, weight: 600, color: '#e6f6fb', spacing: 6 });
  const label = `${num}  ${name}`;
  text(ctx, scramble(label, seg(t, s, s + 0.35), +num, t), 1020, 99, { size: 26, weight: 700, family: MONO, color: C.cyan, align: 'right', spacing: 3 });
  // Six segments, one a page, filling as the film goes.
  const x0 = 60;
  const gw = (960 - 5 * 10) / 6;
  PAGES.forEach(([, , ps, pe], i) => {
    const x = x0 + i * (gw + 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(x, 134, gw, 4);
    const f = seg(t, ps, pe);
    if (f > 0) {
      ctx.fillStyle = C.cyan;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 10;
      ctx.fillRect(x, 134, gw * f, 4);
      ctx.shadowBlur = 0;
    }
  });
  const tc = `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  text(ctx, tc, 1020, 1880, { size: 22, family: MONO, weight: 500, color: C.text3, align: 'right', spacing: 2 });
  text(ctx, 'EXAMPLE FIGURES', 60, 1880, { size: 22, family: MONO, weight: 500, color: C.text3, spacing: 3 });
  ctx.restore();
}

// A page's caption: a numbered kicker and two lines that spring in word by
// word, replaced by the next pair when the page moves on.
function caption(ctx, t, kicker, from, to, sets) {
  if (t < from || t > to + 0.4) return;
  const out = 1 - seg(t, to, to + 0.3);
  ctx.save();
  ctx.globalAlpha *= out;
  text(ctx, scramble(kicker, seg(t, from, from + 0.4), 7, t), 60, 1590, { size: 26, weight: 700, family: MONO, color: C.cyan, spacing: 4 });
  for (const [a, b, l1, l2, acc = 1] of sets) {
    if (t < a || t > b + 0.4) continue;
    words(ctx, l1, 60, 1672, t, a, { size: 68, out: b, accent: acc === 0 ? [0, 1, 2, 3, 4] : null });
    words(ctx, l2, 60, 1752, t, a + 0.12, { size: 68, out: b + 0.04, color: C.cyan });
  }
  ctx.restore();
}

// ---- 0-8: the opening, then through the mark -----------------------------------

const MARK = { x: 540, y: 820, s: 440 };

function intro(ctx, t) {
  if (t > 8.2) return;
  const t0 = 0.45;
  const zp = ease.in(seg(t, 6.0, 7.15));
  const zoom = Math.pow(70, zp);
  const gone = seg(t, 7.0, 7.2);

  // Everything round the mark leaves just before the dive.
  const around = seg(t, 2.0, 2.4) * (1 - ease.in(seg(t, 5.55, 5.95)));
  if (around > 0) {
    ctx.save();
    ctx.globalAlpha *= around;
    // A ring of ticks, swept in, turning slowly.
    const sweep = ease.out(seg(t, 2.0, 2.7));
    const rot = t * 0.22;
    for (let i = 0; i < 120; i++) {
      if (i / 120 > sweep) break;
      const a = rot + (i / 120) * Math.PI * 2;
      const major = i % 10 === 0;
      const r0 = 318;
      const r1 = major ? 346 : 332;
      ctx.strokeStyle = alpha(C.ink, major ? 0.8 : 0.35);
      ctx.lineWidth = major ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(MARK.x + Math.cos(a) * r0, MARK.y + Math.sin(a) * r0);
      ctx.lineTo(MARK.x + Math.cos(a) * r1, MARK.y + Math.sin(a) * r1);
      ctx.stroke();
    }
    arc(ctx, MARK.x, MARK.y, 372, 0.02 + rot / 6.283, 0.02 + rot / 6.283 + 0.18 * sweep, 3, alpha(C.cyan, 0.7), 12);
    arc(ctx, MARK.x, MARK.y, 372, 0.52 + rot / 6.283, 0.52 + rot / 6.283 + 0.18 * sweep, 3, alpha(C.cyan, 0.7), 12);
    // What the shield stands for, read off the ring.
    const tags = [['ON YOUR PHONE', 84, 480, 'left'], ['ENCRYPTED BACKUPS', 996, 480, 'right'], ['NO TRACKERS', 84, 1170, 'left'], ['WORKS OFFLINE', 996, 1170, 'right']];
    tags.forEach(([label, x, y, align], i) => {
      const s = 2.5 + i * 0.12;
      const p = seg(t, s, s + 0.45);
      if (p <= 0) return;
      const dot = align === 'right' ? x + 14 : x - 14;
      ctx.fillStyle = C.cyan;
      ctx.beginPath();
      ctx.arc(dot, y - 8, 5, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, scramble(label, p, i + 3, t), x, y, { size: 24, weight: 700, family: MONO, color: C.text2, align, spacing: 3 });
    });
    ctx.restore();
  }

  // The promise above, said once.
  const head = 1 - ease.in(seg(t, 5.5, 5.85));
  if (t > 2.3 && head > 0) {
    ctx.save();
    ctx.globalAlpha *= head;
    text(ctx, scramble('PERSONAL FINANCE, PRIVATE BY DESIGN', seg(t, 2.3, 2.9), 5, t), 540, 246, { size: 24, weight: 700, family: MONO, color: C.cyan, align: 'center', spacing: 4 });
    words(ctx, 'Your money is personal.', 540, 352, t, 2.55, { size: 80, align: 'center', accent: [3] });
    ctx.restore();
  }

  // Three promises under the name.
  [['ZERO TRACKING', 1290], ['ZERO SIGN-UPS', 1380], ['WORKS OFFLINE', 1470]].forEach(([label, y], i) => {
    const s = spring(t - 3.05 - i * 0.14, 16);
    const a = clamp(s * 1.3) * (1 - ease.in(seg(t, 5.55 + i * 0.04, 5.85 + i * 0.04)));
    if (a <= 0) return;
    ctx.save();
    ctx.translate(540, y);
    ctx.scale(0.7 + 0.3 * s, 0.7 + 0.3 * s);
    pill(ctx, label, 0, 0, { size: 28, color: C.emerald, a, align: 'center', dot: true, padX: 28 });
    ctx.restore();
  });

  // The mark, exactly as the app opens, and then the dive into it.
  ctx.save();
  const fx = MARK.x;
  const fy = MARK.y + MARK.s * 0.02;
  ctx.translate(fx, fy);
  ctx.scale(zoom, zoom);
  ctx.translate(-fx, -fy);
  drawMark(ctx, MARK.x, MARK.y, MARK.s, markState(t - t0), { a: ease.out(seg(t, 0, 0.45)) * (1 - gone) });
  ctx.restore();
  drawWord(ctx, MARK.x, MARK.y + MARK.s / 2 + 33, 47, t - (t0 + 0.3), 1 - ease.in(seg(t, 5.6, 6.0)));

  // Speed lines rushing out of the centre.
  if (t > 6.0 && t < 7.3) {
    const p = seg(t, 6.0, 7.2);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const a = hash(i) * Math.PI * 2;
      const r = ((hash(i + 40) + p * (1.2 + hash(i + 80) * 2)) % 1) * 1300 + 60;
      const len = 40 + p * p * 520 * hash(i + 120);
      ctx.strokeStyle = alpha(i % 3 ? C.ink : C.emerald, 0.15 + 0.6 * p);
      ctx.lineWidth = 2 + hash(i + 7) * 3;
      ctx.beginPath();
      ctx.moveTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r);
      ctx.lineTo(fx + Math.cos(a) * (r + len), fy + Math.sin(a) * (r + len));
      ctx.stroke();
    }
    ctx.restore();
  }

  // The flash, and the mark shattering into the app.
  const flash = seg(t, 6.95, 7.12) * (1 - seg(t, 7.12, 7.6));
  if (flash > 0) {
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 1300);
    g.addColorStop(0, `rgba(235, 252, 255, ${flash})`);
    g.addColorStop(0.35, `rgba(71, 208, 248, ${flash * 0.6})`);
    g.addColorStop(1, 'rgba(71, 208, 248, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (t > 7.08 && t < 8.2) {
    const p = ease.out(seg(t, 7.08, 8.0));
    const fade = 1 - seg(t, 7.5, 8.15);
    for (let i = 0; i < 80; i++) {
      const a = hash(i + 3) * Math.PI * 2;
      const d = p * (300 + hash(i + 11) * 900);
      const x = fx + Math.cos(a) * d;
      const y = fy + Math.sin(a) * d;
      const s = 18 + hash(i + 23) * 70;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(hash(i + 31) * 6 + p * (hash(i + 37) - 0.5) * 8);
      ctx.globalAlpha = fade * (0.4 + hash(i + 41) * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.8, s * 0.6);
      ctx.lineTo(-s * 0.7, s * 0.5);
      ctx.closePath();
      ctx.fillStyle = alpha(i % 4 === 0 ? C.emerald : C.ink, 0.22);
      ctx.fill();
      ctx.strokeStyle = alpha(i % 4 === 0 ? C.emerald : C.ink, 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---- 8-22: Summary -----------------------------------------------------------------

const RING = { x: 540, y: 640, r: 250 };
const BUDGET = 31500;
const SPENT = 16350;

// How much has gone this month, at time t: rising in as the ring assembles,
// then the overspend demonstration, then back.
function spentAt(t) {
  const base = SPENT * spring(t - 7.7, 9);
  const up = ease.inOut(seg(t, 14.4, 16.2));
  const back = spring(t - 17.6, 11);
  return base + (33000 - SPENT) * up * (1 - (t > 17.6 ? back : 0));
}

// Green while there is room, amber from 75%, red past 90%: the app's levels.
function levelColour(f) {
  if (f < 0.7) return C.emerald;
  if (f < 0.85) return mix(C.emerald, C.amber, seg(f, 0.7, 0.85));
  return mix(C.amber, C.red, seg(f, 0.85, 0.98));
}

const CARDS = [
  ['SPENT THIS MONTH', null, 'cards and UPI', C.text],
  ['BUDGET', BUDGET, 'income − fixed − saved', C.text],
  ['OWED ON CARDS', 31557, '2 cards, bills to come', C.cyan],
  ['OWED BACK', 4350, 'by your employer', C.emerald],
];
const cardRect = (i) => [i % 2 ? 555 : 60, i < 2 ? 1010 : 1200, 465, 165];

function summary(ctx, t) {
  if (t < 7.0 || t > 22.2) return;
  // At the end it folds into the Add button.
  const fold = ease.in(seg(t, 21.0, 21.6));
  ctx.save();
  if (fold > 0) {
    ctx.translate(540, 1700);
    ctx.scale(1 - 0.88 * fold, 1 - 0.88 * fold);
    ctx.translate(-540, -1700);
    ctx.globalAlpha *= 1 - fold;
  }
  const spent = spentAt(t);
  const f = spent / BUDGET;
  const col = levelColour(f);
  const left = BUDGET - spent;

  // The telemetry ring: ticks, the month's track, the budget used, the days gone.
  const sweep = ease.out(seg(t, 7.1, 7.7));
  const rot = t * 0.12;
  for (let i = 0; i < 180; i++) {
    if (i / 180 > sweep) break;
    const a = rot + (i / 180) * Math.PI * 2;
    const major = i % 15 === 0;
    ctx.strokeStyle = major ? alpha(C.cyan, 0.7) : 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = major ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(RING.x + Math.cos(a) * (RING.r + 46), RING.y + Math.sin(a) * (RING.r + 46));
    ctx.lineTo(RING.x + Math.cos(a) * (RING.r + (major ? 70 : 58)), RING.y + Math.sin(a) * (RING.r + (major ? 70 : 58)));
    ctx.stroke();
  }
  arc(ctx, RING.x, RING.y, RING.r, 0, ease.out(seg(t, 7.3, 7.9)), 30, alpha(C.surfaceElev, 0.9));
  const fv = Math.min(f, 1);
  if (fv > 0.002) {
    arc(ctx, RING.x, RING.y, RING.r, 0, fv, 30, col, 28);
    const ea = -Math.PI / 2 + fv * Math.PI * 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = col;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(RING.x + Math.cos(ea) * RING.r, RING.y + Math.sin(ea) * RING.r, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  if (f > 1) arc(ctx, RING.x, RING.y, RING.r + 28, 0, f - 1, 10, C.red, 22);
  const days = 14 / 31;
  arc(ctx, RING.x, RING.y, RING.r - 48, 0, 1, 8, 'rgba(255, 255, 255, 0.06)');
  arc(ctx, RING.x, RING.y, RING.r - 48, 0, days * ease.out(seg(t, 8.0, 8.7)), 8, C.violet, 14);

  // The readout in the middle.
  const rp = seg(t, 8.0, 8.4);
  text(ctx, scramble('LEFT TO SPEND', rp, 2, t), RING.x, RING.y - 74, { size: 26, weight: 700, family: MONO, color: C.text3, align: 'center', spacing: 6 });
  if (t > 8.0) {
    const v = left < 0 ? C.red : C.text;
    text(ctx, rupees(left), RING.x, RING.y + 30, { size: 104, weight: 700, color: v, align: 'center', spacing: -3, a: clamp((t - 8.0) * 4) });
    text(ctx, 'of ₹31,500  ·  17 days left', RING.x, RING.y + 90, { size: 30, weight: 500, color: C.text2, align: 'center', a: seg(t, 8.5, 8.9) });
  }

  // The status under it, which shifts with the level.
  const status = f < 0.75 ? ['ON TRACK', C.emerald] : f < 0.95 ? ['CAREFUL', C.amber] : ['OVER BUDGET', C.red];
  const sp = spring(t - 9.1, 16);
  if (t > 9.1) {
    ctx.save();
    ctx.translate(540, RING.y + RING.r + 108);
    ctx.scale(0.8 + 0.2 * sp, 0.8 + 0.2 * sp);
    pill(ctx, status[0], 0, 0, { size: 30, color: status[1], a: clamp(sp * 1.4), align: 'center', dot: true, padX: 30 });
    ctx.restore();
  }

  // Four cards, sliding in from the sides, their figures generated.
  CARDS.forEach(([label, value, sub, accent], i) => {
    const st = 8.6 + i * 0.12;
    const k = spring(t - st, 13);
    if (k <= 0) return;
    const [x, y, w, h] = cardRect(i);
    ctx.save();
    ctx.translate((1 - k) * (i % 2 ? 260 : -260), 0);
    glass(ctx, x, y, w, h, { r: 28, a: clamp(k * 1.5), tint: accent === C.text ? null : accent });
    text(ctx, scramble(label, seg(t, st + 0.05, st + 0.4), i + 9, t), x + 30, y + 46, { size: 22, weight: 700, family: MONO, color: C.text3, spacing: 3 });
    const val = value == null ? rupees(spent) : rupees(value);
    text(ctx, scramble(val, seg(t, st + 0.15, st + 0.6), i + 19, t), x + 30, y + 112, { size: 54, weight: 700, color: accent, spacing: -1 });
    text(ctx, sub, x + 30, y + 148, { size: 24, weight: 500, color: C.text2, a: seg(t, st + 0.4, st + 0.7) });
    if (i === 0) {
      // A small line of the month so far.
      const pts = [0.2, 0.35, 0.9, 0.15, 0.3, 0.5, 0.6, 0.2, 0.3, 0.4, 0.55, 0.25, 0.45, 0.3];
      const lp = ease.out(seg(t, st + 0.3, st + 0.9));
      ctx.strokeStyle = C.emerald;
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach((v, j) => {
        if (j / (pts.length - 1) > lp) return;
        const px = x + 300 + j * 10.5;
        const py = y + 120 - v * 60;
        if (j) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
    ctx.restore();
  });

  // How to read it.
  const ang = (v) => -Math.PI / 2 + v * Math.PI * 2;
  const fb = SPENT / BUDGET;
  callout(ctx, t, 10.6, { tx: RING.x + Math.cos(ang(fb)) * RING.r, ty: RING.y + Math.sin(ang(fb)) * RING.r, lx: 66, ly: 250, align: 'left', title: 'SPENT SO FAR', sub: 'the thick arc', color: C.emerald, end: 13.9 });
  callout(ctx, t, 11.5, { tx: RING.x + Math.cos(ang(days)) * (RING.r - 48), ty: RING.y + Math.sin(ang(days)) * (RING.r - 48), lx: 1014, ly: 250, align: 'right', title: 'DAYS GONE', sub: 'the thin ring', color: C.violet, end: 13.9 });
  callout(ctx, t, 12.4, { tx: RING.x, ty: RING.y - 112, r: 0, lx: 540, ly: 250, align: 'center', title: 'SAFE TO SPEND', sub: 'until 31 October', color: C.cyan, end: 13.9, ring: false });
  if (t > 14.1 && t < 17.5) {
    const a = seg(t, 14.1, 14.3) * (1 - seg(t, 17.2, 17.5));
    pill(ctx, 'WHAT IF YOU OVERSPEND?', 540, 200, { size: 28, color: C.amber, a, align: 'center' });
  }
  callout(ctx, t, 16.0, { tx: 540, ty: RING.y - 112, r: 0, lx: 540, ly: 284, align: 'center', title: 'RED: MORE THAN THE MONTH ALLOWS', color: C.red, end: 17.5, ring: false });
  if (t > 17.9 && t < 19.0) pill(ctx, 'BACK ON TRACK', 540, 200, { size: 28, color: C.emerald, a: seg(t, 17.9, 18.1) * (1 - seg(t, 18.7, 19)), align: 'center', dot: true });
  [2, 3].forEach((i, n) => {
    const [x, y, w, h] = cardRect(i);
    brackets(ctx, x, y, w, h, t - (18.8 + n * 0.5) > 0 && t < 21 ? t - (18.8 + n * 0.5) : 0, i === 2 ? C.cyan : C.emerald);
  });
  callout(ctx, t, 19.0, { tx: 292, ty: 1365, r: 0, lx: 292, ly: 1440, align: 'center', title: 'BILLS STILL TO COME', color: C.cyan, end: 20.9, ring: false });
  callout(ctx, t, 19.5, { tx: 787, ty: 1365, r: 0, lx: 787, ly: 1440, align: 'center', title: 'WORK COSTS, NOT SPENDING', color: C.emerald, end: 20.9, ring: false });
  ctx.restore();

  caption(ctx, t, '01 / SUMMARY', 9.3, 21.0, [
    [9.4, 13.9, 'One number:', "what's safe to spend."],
    [14.2, 18.5, 'Green: inside the month.', 'Red: past it.'],
    [18.7, 21.0, 'What you owe,', "and what's owed back."],
  ]);
}

// ---- 22-35: Add ----------------------------------------------------------------------

const BTN = { x: 540, y: 1700, r: 72 };
const PANEL = { x: 60, y: 210, w: 960, h: 1260 };
const FIELDS = [
  [90, 240, 900, 250],
  [90, 520, 900, 110],
  [90, 680, 900, 70],
  [90, 790, 440, 120],
  [550, 790, 440, 120],
  [90, 950, 900, 130],
  [90, 1200, 900, 120],
];
const SMS = { x: 80, y: 1560, w: 920, h: 190 };
const SMS_L1 = 'Rs 2,450.00 spent on card xx7421';
const SMS_L2 = 'at CLIENT CAFE on 02-Oct 14:45';

function add(ctx, t) {
  if (t < 21.2 || t > 35.0) return;
  ctx.save();
  const pan = ease.inOut(seg(t, 33.9, 34.8));
  ctx.translate(-1080 * pan, 0);

  // The Add button the Summary folded into, pulsing, then bursting open.
  if (t < 22.3) {
    const k = spring(t - 21.3, 15);
    const press = t > 21.85 ? 1 - 0.12 * Math.sin(seg(t, 21.85, 22.05) * Math.PI) : 1;
    const pulse = 1 + 0.06 * Math.sin(t * 14);
    ctx.save();
    ctx.translate(BTN.x, BTN.y);
    ctx.scale(k * press * pulse, k * press * pulse);
    ctx.beginPath();
    ctx.arc(0, 0, BTN.r, 0, Math.PI * 2);
    ctx.fillStyle = C.cyan;
    ctx.shadowColor = C.cyan;
    ctx.shadowBlur = 50;
    ctx.fill();
    ctx.restore();
    drawIcon(ctx, 'add|#06121a', BTN.x, BTN.y, 64 * k, k);
  }
  const burst = ease.expo(seg(t, 22.0, 22.45));
  if (t > 22.0) {
    // A shockwave and sparks from the button.
    const sw = seg(t, 22.0, 22.7);
    if (sw < 1) {
      ctx.save();
      ctx.strokeStyle = alpha(C.cyan, 1 - sw);
      ctx.lineWidth = 6 * (1 - sw) + 1;
      ctx.beginPath();
      ctx.arc(BTN.x, BTN.y, 60 + sw * 1300, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 70; i++) {
        const a = -Math.PI * hash(i + 5);
        const d = ease.out(sw) * (200 + hash(i + 9) * 900);
        ctx.fillStyle = alpha(i % 3 ? C.cyan : C.emerald, 1 - sw);
        ctx.beginPath();
        ctx.arc(BTN.x + Math.cos(a) * d, BTN.y + Math.sin(a) * d, 3 + hash(i) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // The button grows into the workspace.
    const x = lerp(BTN.x - BTN.r, PANEL.x, burst);
    const y = lerp(BTN.y - BTN.r, PANEL.y, burst);
    const w = lerp(BTN.r * 2, PANEL.w, burst);
    const h = lerp(BTN.r * 2, PANEL.h, burst);
    glass(ctx, x, y, w, h, { r: lerp(BTN.r, 44, burst), glow: C.cyan, glowA: 1 - seg(t, 22.3, 22.9) });
  }

  // The fields fly in from everywhere and snap onto the grid.
  const amountText = t < 24.75 ? '₹0' : t < 24.95 ? scramble('₹2,450', seg(t, 24.75, 24.95), 4, t) : '₹2,450';
  const filled = (at) => t >= at;
  FIELDS.forEach(([fx, fy, fw, fh], i) => {
    const st = 22.35 + i * 0.07;
    const k = spring(t - st, 14);
    if (k <= 0) return;
    const ox = (hash(i + 50) - 0.5) * 700;
    const oy = (hash(i + 60) - 0.3) * 700;
    const rot = (hash(i + 70) - 0.5) * 0.5;
    ctx.save();
    ctx.translate(fx + fw / 2 + ox * (1 - k), fy + fh / 2 + oy * (1 - k));
    ctx.rotate(rot * (1 - k));
    ctx.translate(-fw / 2, -fh / 2);
    ctx.globalAlpha *= clamp(k * 1.6);
    drawField(ctx, i, fw, fh, t, { amountText, filled });
    ctx.restore();
    // An alignment guide flashes as each one lands.
    const g = seg(t, st + 0.22, st + 0.6);
    if (g > 0 && g < 1) {
      ctx.strokeStyle = alpha(C.cyan, 0.6 * (1 - g));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, fy);
      ctx.lineTo(W, fy);
      ctx.stroke();
    }
  });

  // A bank SMS, pasted: read, and its parts flown into the fields.
  const smsIn = spring(t - 23.4, 13);
  const smsOut = ease.in(seg(t, 26.0, 26.35));
  if (t > 23.4 && smsOut < 1) {
    ctx.save();
    ctx.translate(0, (1 - smsIn) * 300 + smsOut * 300);
    ctx.globalAlpha *= clamp(smsIn * 1.5) * (1 - smsOut);
    glass(ctx, SMS.x, SMS.y, SMS.w, SMS.h, { r: 30, glow: C.amber, glowA: 0.5 });
    text(ctx, 'BANK  ·  SMS  ·  14:45', SMS.x + 34, SMS.y + 48, { size: 22, weight: 700, family: MONO, color: C.amber, spacing: 3 });
    text(ctx, SMS_L1, SMS.x + 34, SMS.y + 104, { size: 32, weight: 500, family: MONO, color: C.text });
    text(ctx, SMS_L2, SMS.x + 34, SMS.y + 154, { size: 32, weight: 500, family: MONO, color: C.text });
    // The scan line.
    const sc = seg(t, 23.9, 24.45);
    if (sc > 0 && sc < 1) {
      const sx = SMS.x + sc * SMS.w;
      const g = ctx.createLinearGradient(sx - 80, 0, sx, 0);
      g.addColorStop(0, alpha(C.cyan, 0));
      g.addColorStop(1, alpha(C.cyan, 0.45));
      ctx.fillStyle = g;
      ctx.fillRect(sx - 80, SMS.y + 8, 80, SMS.h - 16);
    }
    ctx.restore();
  }
  // Each piece of the message, boxed, then flying to its field.
  const tokens = [
    ['2,450.00', SMS_L1, 1, C.amber, 24.5, [540, 380]],
    ['xx7421', SMS_L1, 1, C.cyan, 24.7, [310, 865]],
    ['CLIENT CAFE', SMS_L2, 2, C.violet, 24.9, [540, 590]],
    ['02-Oct 14:45', SMS_L2, 2, C.emerald, 25.1, [770, 865]],
  ];
  tokens.forEach(([tok, line, row, col, at, [tx, ty]]) => {
    const i0 = line.indexOf(tok);
    const bx = SMS.x + 34 + measure(ctx, line.slice(0, i0), 32, 500, MONO);
    const bw = measure(ctx, tok, 32, 500, MONO);
    const by = SMS.y + (row === 1 ? 104 : 154) - 30;
    const box = seg(t, 24.3, 24.45) * (1 - seg(t, 25.9, 26.1));
    if (box > 0) {
      ctx.save();
      ctx.globalAlpha *= box;
      rr(ctx, bx - 6, by - 4, bw + 12, 42, 8);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
    const fp = seg(t, at, at + 0.4);
    if (fp > 0 && fp < 1) {
      const e = ease.inOut(fp);
      const sx = bx + bw / 2;
      const sy = by + 20;
      const cx = (sx + tx) / 2 + 160;
      const cy = Math.min(sy, ty) - 80;
      const u = 1 - e;
      const px = u * u * sx + 2 * u * e * cx + e * e * tx;
      const py = u * u * sy + 2 * u * e * cy + e * e * ty;
      pill(ctx, tok, px, py, { size: 24, color: col, align: 'center', fill: 0.3 });
    }
  });

  // The category, guessed from the shop's name; the work-cost switch; save.
  callout(ctx, t, 26.3, { tx: 190, ty: 715, r: 0, lx: 990, ly: 655, align: 'right', title: 'GUESSED FROM THE SHOP', color: C.food, end: 28.4, ring: false });
  brackets(ctx, 90, 680, 190, 70, t > 26.15 && t < 28.4 ? t - 26.15 : 0, C.food, 18);
  brackets(ctx, 90, 950, 900, 130, t > 27.6 && t < 30 ? t - 27.6 : 0, C.emerald);
  callout(ctx, t, 28.0, { tx: 540, ty: 1080, r: 0, lx: 540, ly: 1140, align: 'center', title: 'WORK COST: KEPT OUT OF LEFT TO SPEND', color: C.emerald, end: 29.9, ring: false });
  if (t > 29.9) {
    // The ripple confirming it.
    const rp = seg(t, 29.95, 30.9);
    if (rp < 1) {
      ctx.save();
      for (let k = 0; k < 3; k++) {
        const q = clamp(rp * 1.3 - k * 0.15);
        ctx.strokeStyle = alpha(C.emerald, (1 - q) * 0.9);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(540, 1260, 40 + q * 600, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 90; i++) {
        const a = hash(i + 200) * Math.PI * 2;
        const d = ease.out(rp) * (120 + hash(i + 210) * 520);
        ctx.fillStyle = alpha(i % 2 ? C.emerald : C.cyan, 1 - rp);
        ctx.beginPath();
        ctx.arc(540 + Math.cos(a) * d, 1260 + Math.sin(a) * d * 0.6, 2 + hash(i + 220) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    const cp = spring(t - 30.4, 12);
    if (t > 30.4) {
      ctx.save();
      ctx.translate(0, (1 - cp) * 60 - seg(t, 30.4, 33.5) * 30);
      pill(ctx, 'LEFT TO SPEND ₹15,150 · UNCHANGED', 540, 1400, { size: 28, color: C.emerald, a: clamp(cp * 1.5), align: 'center', dot: true, padX: 30 });
      ctx.restore();
    }
  }
  ctx.restore();

  caption(ctx, t, '02 / ADD', 26.35, 33.7, [
    [26.45, 29.7, 'Paste the bank SMS.', 'Kawach fills it in.'],
    [29.9, 33.7, 'Work costs stay out', 'of what you can spend.'],
  ]);
}

function drawField(ctx, i, w, h, t, { amountText, filled }) {
  const label = (s, x = 26, y = 42) => text(ctx, s, x, y, { size: 22, weight: 700, family: MONO, color: C.text3, spacing: 3 });
  if (i === 0) {
    glass(ctx, 0, 0, w, h, { r: 30 });
    label('AMOUNT');
    text(ctx, amountText, 26, 190, { size: 150, weight: 700, color: amountText === '₹0' ? C.text3 : C.text, spacing: -5 });
    pill(ctx, 'MONEY OUT', w - 26, 40, { size: 22, color: C.cyan, align: 'right', fill: 0.2 });
  } else if (i === 1) {
    glass(ctx, 0, 0, w, h, { r: 24 });
    label('WHAT FOR');
    text(ctx, filled(25.25) ? typed('Client Cafe', seg(t, 25.25, 25.6)) : 'Add a note', 26, 88, { size: 36, weight: 600, color: filled(25.25) ? C.text : C.text3 });
  } else if (i === 2) {
    let x = 0;
    [['Food', C.food], ['Travel', C.cyan], ['Shopping', C.violet], ['Fuel', C.amber]].forEach(([name, col]) => {
      const cw = measure(ctx, name, 28, 600) + 100;
      const on = name === 'Food' && t > 26.15;
      rr(ctx, x, 0, cw, h, h / 2);
      ctx.fillStyle = on ? alpha(col, 0.22) : alpha(C.surface, 0.9);
      ctx.fill();
      ctx.strokeStyle = on ? col : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = on ? 3 : 2;
      ctx.stroke();
      drawIcon(ctx, `cat:${name}|${col}`, x + 38, h / 2, 34);
      text(ctx, name, x + 64, h / 2 + 10, { size: 28, weight: 600, color: on ? C.text : C.text2 });
      x += cw + 14;
    });
  } else if (i === 3) {
    glass(ctx, 0, 0, w, h, { r: 24 });
    label('PAID FROM');
    text(ctx, filled(25.05) ? 'Travel card · 7421' : 'Choose', 26, 92, { size: 32, weight: 600, color: filled(25.05) ? C.text : C.text3 });
  } else if (i === 4) {
    glass(ctx, 0, 0, w, h, { r: 24 });
    label('WHEN');
    text(ctx, filled(25.45) ? '2 Oct · 2:45 pm' : 'Today', 26, 92, { size: 32, weight: 600, color: filled(25.45) ? C.text : C.text3 });
  } else if (i === 5) {
    const on = spring(t - 27.7, 16);
    glass(ctx, 0, 0, w, h, { r: 26, glow: C.emerald, glowA: t > 27.7 ? 0.7 : 0 });
    text(ctx, 'Reimbursable (Work)', 26, 58, { size: 32, weight: 600 });
    text(ctx, 'Your employer will pay this back', 26, 100, { size: 26, weight: 500, color: C.text2 });
    const tx = w - 150;
    rr(ctx, tx, 38, 110, 56, 28);
    ctx.fillStyle = t > 27.7 ? alpha(C.emerald, 0.45) : C.surfaceElev;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tx + 28 + 54 * (t > 27.7 ? on : 0), 66, 22, 0, Math.PI * 2);
    ctx.fillStyle = t > 27.7 ? C.emerald : C.text2;
    ctx.shadowColor = C.emerald;
    ctx.shadowBlur = t > 27.7 ? 20 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (i === 6) {
    const press = t > 29.8 ? 1 - 0.05 * Math.sin(seg(t, 29.8, 30.05) * Math.PI) : 1;
    ctx.translate(w / 2, h / 2);
    ctx.scale(press, press);
    ctx.translate(-w / 2, -h / 2);
    rr(ctx, 0, 0, w, h, h / 2);
    ctx.fillStyle = t > 30.0 ? C.emerald : C.cyan;
    ctx.shadowColor = t > 30.0 ? C.emerald : C.cyan;
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (t > 30.0) {
      drawIcon(ctx, 'check|#06121a', w / 2 - 70, h / 2, 50, seg(t, 30.0, 30.2));
      text(ctx, 'Saved', w / 2 - 34, h / 2 + 14, { size: 40, weight: 700, color: '#06121a' });
    } else {
      text(ctx, 'Save', w / 2, h / 2 + 14, { size: 40, weight: 700, color: '#06121a', align: 'center' });
    }
  }
}

// ---- 35-48: Accounts --------------------------------------------------------------------

const ACC = [
  ['Salary account', 'BANK', 'accounts', 124610, 'UPDATED FROM SMS', C.emerald],
  ['Travel card', 'CARD · 7421', 'card', 28437, 'BILL DUE IN 4 DAYS', C.amber],
  ['Shopping card', 'CARD · 3308', 'card', 3120, 'NO BILL YET', C.emerald],
  ['Cash', 'CASH', 'cash', 2300, 'IN HAND', C.text3],
  ['Fixed deposit', 'SAVINGS', 'lock', 200000, 'NEVER SPENDABLE', C.violet],
  ['Home loan', 'LOAN', 'home', 1842000, 'EMI ₹21,800 ON THE 5TH', C.cyan],
];
const accRect = (i) => [i % 2 ? 555 : 60, 300 + Math.floor(i / 2) * 280, 465, 250];

// Plan's month: where each payment sits, so Accounts can fold into it.
const DUE = [
  ['Rent', 1, 25000, true],
  ['Home loan EMI', 5, 21800, true],
  ['Electricity', 12, 2700, true],
  ['Phone', 20, 1000, false],
  ['Insurance', 25, 4000, false],
  ['School fees', 28, 6000, false],
];
const AXIS = 800;
const SHORT = ['RENT', 'EMI', 'POWER', 'PHONE', 'INSURE', 'SCHOOL'];
const dayX = (d) => 90 + ((d - 1) / 30) * 900;
const barH = (amt) => 40 + (amt / 25000) * 150;

function accounts(ctx, t) {
  if (t < 33.9 || t > 47.6) return;
  ctx.save();
  ctx.translate(1080 * (1 - ease.inOut(seg(t, 33.9, 34.8))), 0);
  const fold = ease.inOut(seg(t, 46.5, 47.4));

  ACC.forEach(([name, kind, ic, bal, tag, col], i) => {
    const [x, y, w, h] = accRect(i);
    const st = 34.7 + i * 0.1;
    const k = spring(t - st, 13);
    if (k <= 0) return;
    // Flipped up from flat, about its top edge.
    const theta = (1 - k) * (Math.PI / 2);
    // At the end each block shrinks into its day on Plan's month.
    const [dname, day, amt] = DUE[i];
    const tx = dayX(day) - 14;
    const th = barH(amt);
    const bx = lerp(x, tx, fold);
    const by = lerp(y, AXIS - th, fold);
    const bw = lerp(w, 28, fold);
    const bh = lerp(h, th, fold);
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1, Math.max(0.02, Math.cos(theta)));
    let balance = bal;
    let tagText = tag;
    let tagCol = col;
    if (i === 0) balance = lerp(124610, 96173, ease.out(seg(t, 43.2, 44.2)));
    if (i === 1) {
      balance = lerp(28437, 0, ease.out(seg(t, 43.2, 44.2)));
      if (t > 40.6 && t < 44.2) { tagText = 'OVERDUE · 1 DAY'; tagCol = C.red; }
      if (t >= 44.2) { tagText = 'PAID · BOTH SIDES UPDATED'; tagCol = C.emerald; }
    }
    const glowCol = i === 1 && t > 40.6 && t < 44.2 ? C.red : i === 1 && t >= 44.2 && t < 46.3 ? C.emerald : null;
    const shake = i === 1 && t > 40.6 && t < 41.0 ? Math.sin(t * 90) * 8 * (1 - seg(t, 40.6, 41)) : 0;
    ctx.translate(shake, 0);
    glass(ctx, 0, 0, bw, bh, { r: lerp(28, 8, fold), glow: glowCol, glowA: 0.9, tint: fold > 0 ? C.cyan : null });
    const ca = 1 - seg(fold, 0, 0.4);
    if (ca > 0) {
      ctx.save();
      ctx.globalAlpha *= ca;
      rr(ctx, 26, 26, 64, 64, 18);
      ctx.fillStyle = alpha(ic === 'lock' ? C.violet : C.cyan, 0.14);
      ctx.fill();
      drawIcon(ctx, `${ic}|${ic === 'lock' ? C.violet : C.cyan}`, 58, 58, 38);
      text(ctx, name, 108, 54, { size: 32, weight: 650 });
      text(ctx, kind, 108, 86, { size: 20, weight: 700, family: MONO, color: C.text3, spacing: 3 });
      text(ctx, scramble(rupees(balance), seg(t, st + 0.2, st + 0.6), i + 40, t), 26, 168, { size: 52, weight: 700, color: i === 1 && balance > 0 ? C.red : C.text, spacing: -1 });
      // The indicator: a pulsing dot and what it means.
      const ip = seg(t, 35.8 + i * 0.08, 36.1 + i * 0.08);
      if (ip > 0) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 6 + i);
        ctx.fillStyle = tagCol;
        ctx.shadowColor = tagCol;
        ctx.shadowBlur = 12 * pulse;
        ctx.globalAlpha *= ip;
        ctx.beginPath();
        ctx.arc(34, 214, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        text(ctx, scramble(tagText, ip, i + 60, t), 54, 222, { size: 21, weight: 700, family: MONO, color: tagCol, spacing: 2 });
      }
      if (i === 1 && t > 42.1 && t < 44.0) {
        const bp = spring(t - 42.1, 16);
        pill(ctx, 'MARK BILL PAID', w - 26, 54, { size: 22, color: C.cyan, align: 'right', fill: 0.25, a: clamp(bp * 1.5) });
      }
      ctx.restore();
    }
    // The shading of a panel still turning up.
    if (theta > 0.02) {
      rr(ctx, 0, 0, bw, bh, 28);
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.sin(theta) * 0.6})`;
      ctx.fill();
    }
    ctx.restore();
  });

  // Teaching the indicators.
  callout(ctx, t, 36.6, { tx: 589, ty: 514, r: 18, lx: 600, ly: 1240, align: 'center', title: 'AMBER: A BILL IS DUE SOON', sub: 'pay it before the date', color: C.amber, end: 38.8 });
  callout(ctx, t, 37.8, { tx: 94, ty: 1074, r: 18, lx: 300, ly: 1380, align: 'center', title: 'SAVINGS NEVER COUNT', sub: 'as money you can spend', color: C.violet, end: 40.0 });
  callout(ctx, t, 39.0, { tx: 94, ty: 514, r: 18, lx: 300, ly: 1240, align: 'center', title: 'GREEN: UP TO DATE', sub: "from the bank's SMS", color: C.emerald, end: 40.6 });
  callout(ctx, t, 40.8, { tx: 589, ty: 514, r: 18, lx: 700, ly: 1240, align: 'center', title: 'RED: PAST ITS DUE DATE', sub: 'pay it from here', color: C.red, end: 42.4 });

  // Paying it: one payment from the bank, both accounts updated.
  if (t > 42.6 && t < 44.0) {
    const tp = seg(t, 42.6, 43.0);
    ringAt(ctx, 900, 354, 34, t - 42.6, C.cyan);
    const bp = seg(t, 42.9, 43.9);
    const sx = 292;
    const sy = 425;
    const ex = 787;
    const ey = 425;
    const cx = 540;
    const cy = 200;
    ctx.save();
    ctx.globalAlpha *= tp;
    ctx.strokeStyle = alpha(C.cyan, 0.5);
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -t * 120;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 26; i++) {
      const u = (bp * 1.6 + i / 26) % 1;
      const e = 1 - u;
      const px = e * e * sx + 2 * e * u * cx + u * u * ex;
      const py = e * e * sy + 2 * e * u * cy + u * u * ey;
      ctx.fillStyle = alpha(C.cyan, Math.sin(u * Math.PI));
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (t > 44.2 && t < 45.2) ringAt(ctx, 787, 425, 140, t - 44.2, C.emerald);
  callout(ctx, t, 44.3, { tx: 787, ty: 550, r: 0, lx: 540, ly: 1240, align: 'center', title: 'ONE PAYMENT, TWO ACCOUNTS', sub: 'the bank and the card, recorded once', color: C.emerald, end: 46.3, ring: false });
  ctx.restore();

  caption(ctx, t, '03 / ACCOUNTS', 35.0, 46.4, [
    [35.2, 41.8, 'Every account,', 'read at a glance.'],
    [42.0, 46.4, 'Pay a bill once.', 'Both sides know.'],
  ]);
}

// ---- 48-62: Plan ---------------------------------------------------------------------------

const BAR = { x: 60, y: 300, w: 960, h: 64 };

function plan(ctx, t) {
  if (t < 47.2 || t > 62.3) return;
  ctx.save();
  ctx.translate(0, 1920 * ease.in(seg(t, 61.3, 62.2)));

  // Moving a set-aside changes the budget at once.
  const fun = Math.round(lerp(5000, 3000, spring(t - 52.6, 10) * (t > 52.6 ? 1 : 0)) / 50) * 50;
  const flex = 9000 + 4000 + fun;
  const budget = 120000 - 60500 - flex - 10000;

  // Where the money goes: one bar, assembling from the left.
  const segs = [['MUST GO OUT', 60500, C.cyan], ['CAN FLEX', flex, C.violet], ['SAVED', 10000, C.emerald], ['TO SPEND', budget, C.text]];
  text(ctx, scramble('₹1,20,000 COMES IN EACH MONTH', seg(t, 47.4, 47.9), 70, t), BAR.x, BAR.y - 26, { size: 24, weight: 700, family: MONO, color: C.text2, spacing: 3 });
  let x = BAR.x;
  segs.forEach(([label, amt, col], i) => {
    const k = spring(t - (47.6 + i * 0.12), 12);
    const w = (amt / 120000) * BAR.w * clamp(k, 0, 1.08);
    if (w <= 0) return;
    rr(ctx, x + 3, BAR.y, Math.max(0, w - 6), BAR.h, 12);
    ctx.fillStyle = i === 3 ? 'rgba(255, 255, 255, 0.85)' : alpha(col, 0.8);
    ctx.shadowColor = col;
    ctx.shadowBlur = i === 3 ? 0 : 16;
    ctx.fill();
    ctx.shadowBlur = 0;
    const lp = seg(t, 47.9 + i * 0.12, 48.3 + i * 0.12);
    const lcol = col === C.text ? C.text2 : col;
    if (i < 2) {
      text(ctx, scramble(label, lp, i + 80, t), x + 6, BAR.y + BAR.h + 38, { size: 20, weight: 700, family: MONO, color: lcol, spacing: 2 });
      text(ctx, scramble(rupees(amt), lp, i + 90, t), x + 6, BAR.y + BAR.h + 72, { size: 26, weight: 600, family: MONO, color: C.text, a: lp });
    } else if (i === 2) {
      // Too narrow to hold its label: it goes above the bar.
      text(ctx, scramble(`${label} ${rupees(amt)}`, lp, i + 80, t), x + 6, BAR.y - 26, { size: 20, weight: 700, family: MONO, color: lcol, spacing: 2 });
    } else {
      text(ctx, scramble(label, lp, i + 80, t), BAR.x + BAR.w, BAR.y + BAR.h + 38, { size: 20, weight: 700, family: MONO, color: lcol, spacing: 2, align: 'right' });
      text(ctx, scramble(rupees(amt), lp, i + 90, t), BAR.x + BAR.w, BAR.y + BAR.h + 72, { size: 26, weight: 600, family: MONO, color: C.text, a: lp, align: 'right' });
    }
    x += (amt / 120000) * BAR.w;
  });

  // The budget, big, recalculating as anything moves.
  text(ctx, scramble('YOUR BUDGET', seg(t, 48.3, 48.7), 99, t), 1020, 540, { size: 24, weight: 700, family: MONO, color: C.text3, spacing: 4, align: 'right' });
  text(ctx, rupees(budget), 1020, 630, { size: 92, weight: 700, spacing: -3, a: seg(t, 48.4, 48.6), color: t > 52.6 && t < 55 ? C.emerald : C.text, align: 'right' });

  // The month: what must go out, on its day. Bright still to pay, dim paid.
  const ax = ease.out(seg(t, 47.3, 47.9));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dayX(1), AXIS);
  ctx.lineTo(dayX(1) + 900 * ax, AXIS);
  ctx.stroke();
  for (let d = 1; d <= 31; d++) {
    if (dayX(d) > dayX(1) + 900 * ax) break;
    ctx.fillStyle = d === 14 ? C.cyan : 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(dayX(d) - 1, AXIS + 6, 2, d % 7 === 1 ? 16 : 8);
    if (d === 1 || d === 7 || d === 14 || d === 21 || d === 28) text(ctx, String(d), dayX(d), AXIS + 50, { size: 22, family: MONO, weight: 600, color: C.text3, align: 'center' });
  }
  // Today.
  const tp = seg(t, 48.0, 48.4);
  if (tp > 0) {
    ctx.strokeStyle = alpha(C.cyan, 0.8 * tp);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(dayX(14), AXIS + 30);
    ctx.lineTo(dayX(14), 660);
    ctx.stroke();
    ctx.setLineDash([]);
    pill(ctx, 'TODAY', dayX(14), 660, { size: 20, color: C.cyan, align: 'center', a: tp, fill: 0.3 });
  }
  if (t > 47.35) {
    DUE.forEach(([name, day, amt, paid], i) => {
      const h = barH(amt);
      const x = dayX(day) - 14;
      const col = paid ? 'rgba(255, 255, 255, 0.22)' : C.cyan;
      const glow = paid ? 0 : 22 * (0.7 + 0.3 * Math.sin(t * 5 + i));
      rr(ctx, x, AXIS - h, 28, h, 8);
      ctx.fillStyle = col;
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = glow;
      ctx.fill();
      ctx.shadowBlur = 0;
      const lp = seg(t, 48.2 + i * 0.08, 48.5 + i * 0.08);
      if (lp > 0) {
        text(ctx, scramble(SHORT[i], lp, i + 110, t), x + 14, AXIS - h - 44, { size: 18, weight: 700, family: MONO, color: paid ? C.text3 : C.cyan, align: 'center', spacing: 1 });
        text(ctx, scramble(rupees(amt), lp, i + 120, t), x + 14, AXIS - h - 18, { size: 18, weight: 600, family: MONO, color: paid ? C.text3 : C.text, align: 'center' });
      }
    });
  }
  callout(ctx, t, 50.0, { tx: dayX(20), ty: AXIS - barH(1000) / 2, r: 30, lx: 640, ly: 930, align: 'center', title: 'BRIGHT: STILL TO PAY', color: C.cyan, end: 52.4 });
  callout(ctx, t, 50.8, { tx: dayX(1), ty: AXIS - barH(25000) / 2, r: 30, lx: 300, ly: 960, align: 'center', title: 'DIM: ALREADY PAID', color: C.text2, end: 52.4 });

  // What can flex, as sliders: the part left of each set-aside.
  const FLEX = [['Groceries', 9000, 5400, C.emerald, 'Groceries'], ['Fuel', 4000, 2800, C.amber, 'Fuel'], ['Fun', fun, 900, C.violet, 'Shopping']];
  FLEX.forEach(([name, amt, used, col, icon], i) => {
    const cx = 230 + i * 310;
    const top = 1070;
    const bot = 1370;
    const k = spring(t - (49.2 + i * 0.1), 13);
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha *= clamp(k * 1.4);
    ctx.translate(0, (1 - k) * 120);
    rr(ctx, cx - 10, top, 20, bot - top, 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fill();
    const level = (amt / 10000) * (bot - top) * clamp(k, 0, 1.1);
    const usedH = (used / 10000) * (bot - top) * clamp(k, 0, 1.1);
    rr(ctx, cx - 10, bot - level, 20, level, 10);
    ctx.fillStyle = alpha(col, 0.85);
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    rr(ctx, cx - 10, bot - Math.min(usedH, level), 20, Math.min(usedH, level), 10);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, bot - level, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = col;
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    drawIcon(ctx, `cat:${icon}|${col}`, cx - 70, bot + 50, 36);
    text(ctx, name, cx - 44, bot + 62, { size: 30, weight: 650, color: C.text });
    text(ctx, rupees(amt), cx + 40, bot - level + 10, { size: 28, weight: 700, family: MONO, color: col });
    text(ctx, `${rupees(Math.max(0, amt - used))} left`, cx, bot + 104, { size: 22, weight: 600, family: MONO, color: C.text2, align: 'center' });
    ctx.restore();
  });
  if (t > 52.4 && t < 54.4) ringAt(ctx, 850, 1370 - (fun / 10000) * 300, 34, t - 52.4, C.violet);
  callout(ctx, t, 53.0, { tx: 850, ty: 1370 - (fun / 10000) * 300, r: 0, lx: 540, ly: 1020, align: 'center', title: 'MOVE A SET-ASIDE: BUDGET UPDATES', color: C.violet, end: 55.6, ring: false });

  // Saved first, and a goal it is counted in.
  const gp = seg(t, 55.8, 56.3);
  if (gp > 0) {
    ctx.save();
    ctx.globalAlpha *= gp;
    glass(ctx, 60, 1450, 960, 110, { r: 26, tint: C.emerald });
    text(ctx, 'GOA TRIP · ₹60,000 BY MARCH', 90, 1494, { size: 22, weight: 700, family: MONO, color: C.emerald, spacing: 2 });
    text(ctx, '₹8,500 a month gets you there', 90, 1536, { size: 28, weight: 500, color: C.text2 });
    const fill = 0.34 * ease.out(seg(t, 56.0, 57.0));
    rr(ctx, 620, 1490, 370, 22, 11);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    rr(ctx, 620, 1490, 370 * fill, 22, 11);
    ctx.fillStyle = C.emerald;
    ctx.shadowColor = C.emerald;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.restore();
    text(ctx, `${Math.round(fill * 100)}%`, 990, 1546, { size: 26, weight: 700, family: MONO, color: C.emerald, align: 'right', a: gp });
  }
  callout(ctx, t, 57.4, { tx: BAR.x + ((60500 + flex + 5000) / 120000) * BAR.w, ty: BAR.y + BAR.h / 2, r: 36, lx: 330, ly: 500, align: 'center', title: 'SAVED FIRST', sub: 'never part of your budget', color: C.emerald, end: 60.2 });
  ctx.restore();

  caption(ctx, t, '04 / PLAN', 48.4, 61.2, [
    [48.6, 52.3, 'Plan the month once.', 'Kawach does the sums.'],
    [52.5, 56.6, 'Move a set-aside.', 'The budget follows.'],
    [56.8, 61.2, 'Saved first.', 'Then what you can spend.'],
  ]);
}

// ---- 62-76: History --------------------------------------------------------------------------

const DAILY = [820, 1240, 3900, 310, 560, 1450, 2100, 380, 640, 980, 1600, 520, 1170, 680];
const CHART = { x: 60, y: 230, w: 960, h: 560 };
const PLOT = { x: 130, y: 330, w: 850, h: 380, max: 4000 };
const STREAM = [
  ['TODAY · 14 OCT', '₹680'],
  ['Client Cafe', 'Food', '14:45', 2450, 'OWED BACK'],
  ['Annapurna Tiffins', 'Food', '13:10', 180],
  ['Metro card top-up', 'Metro', '09:02', 500],
  ['13 OCT', '₹1,170'],
  ['Fresh Basket', 'Groceries', '19:30', 740],
  ['Fuel', 'Fuel', '08:15', 430],
  ['12 OCT', '₹520'],
  ['Book shop', 'Books', '18:05', 520],
];
const ptX = (i) => PLOT.x + (i / (DAILY.length - 1)) * PLOT.w;
const ptY = (v) => PLOT.y + PLOT.h - (v / PLOT.max) * PLOT.h;

function history(ctx, t) {
  if (t < 61.5 || t > 76.3) return;
  ctx.save();
  ctx.translate(0, -1920 * (1 - ease.out(seg(t, 61.5, 62.4))));
  // At the end the chart folds into Coach's hub.
  const fold = ease.inOut(seg(t, 74.8, 75.7));

  ctx.save();
  if (fold > 0) {
    ctx.translate(540, 470);
    ctx.scale(1 - 0.75 * fold, 1 - 0.75 * fold);
    ctx.translate(-540, -470);
    ctx.globalAlpha *= 1 - fold;
  }
  glass(ctx, CHART.x, CHART.y, CHART.w, CHART.h, { r: lerp(36, 280, fold) });
  text(ctx, scramble('THIS MONTH, DAY BY DAY', seg(t, 62.2, 62.6), 130, t), CHART.x + 34, CHART.y + 56, { size: 24, weight: 700, family: MONO, color: C.text3, spacing: 3 });
  text(ctx, scramble('₹16,350', seg(t, 62.3, 62.7), 131, t), CHART.x + CHART.w - 34, CHART.y + 60, { size: 40, weight: 700, color: C.text, align: 'right' });
  for (let v = 1000; v <= 4000; v += 1000) {
    const y = ptY(v);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PLOT.x, y);
    ctx.lineTo(PLOT.x + PLOT.w, y);
    ctx.stroke();
    text(ctx, `${v / 1000}K`, PLOT.x - 16, y + 8, { size: 20, family: MONO, weight: 600, color: C.text3, align: 'right' });
  }
  [[0, '1'], [6, '7'], [13, '14 OCT']].forEach(([i, l]) => text(ctx, l, ptX(i), PLOT.y + PLOT.h + 40, { size: 20, family: MONO, weight: 600, color: C.text3, align: 'center' }));
  // The line, drawing itself left to right.
  const lp = ease.inOut(seg(t, 62.4, 64.2));
  const headX = PLOT.x + lp * PLOT.w;
  ctx.save();
  ctx.beginPath();
  ctx.rect(PLOT.x - 10, PLOT.y - 40, headX - PLOT.x + 10, PLOT.h + 50);
  ctx.clip();
  const area = ctx.createLinearGradient(0, PLOT.y, 0, PLOT.y + PLOT.h);
  area.addColorStop(0, alpha(C.emerald, 0.35));
  area.addColorStop(1, alpha(C.emerald, 0));
  ctx.beginPath();
  DAILY.forEach((v, i) => (i ? ctx.lineTo(ptX(i), ptY(v)) : ctx.moveTo(ptX(i), ptY(v))));
  ctx.lineTo(ptX(DAILY.length - 1), PLOT.y + PLOT.h);
  ctx.lineTo(ptX(0), PLOT.y + PLOT.h);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();
  ctx.beginPath();
  DAILY.forEach((v, i) => (i ? ctx.lineTo(ptX(i), ptY(v)) : ctx.moveTo(ptX(i), ptY(v))));
  ctx.strokeStyle = C.emerald;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.shadowColor = C.emerald;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();
  if (lp > 0 && lp < 1) {
    // The pen.
    const f = lp * (DAILY.length - 1);
    const i0 = Math.floor(f);
    const v = lerp(DAILY[i0], DAILY[Math.min(i0 + 1, DAILY.length - 1)], f - i0);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = C.emerald;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(headX, ptY(v), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  callout(ctx, t, 64.4, { tx: ptX(2), ty: ptY(3900), r: 18, lx: ptX(2) + 260, ly: ptY(3900) + 40, align: 'left', title: 'PEAK · 3 OCT · ₹3,900', sub: 'the month’s groceries', color: C.amber, end: 67.8 });
  callout(ctx, t, 65.2, { tx: ptX(6), ty: ptY(2100), r: 18, lx: ptX(6) + 160, ly: ptY(2100) + 120, align: 'left', title: '7 OCT · ₹2,100', sub: 'a weekend out', color: C.violet, end: 67.8 });
  ctx.restore();

  // The stream: payments popping in, newest first, still flowing.
  const flow = ease.inOut(seg(t, 68.4, 74.6)) * 120;
  const out = 1 - seg(t, 74.6, 75.2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 840, W, 700);
  ctx.clip();
  ctx.globalAlpha *= out;
  let y = 860 - flow;
  STREAM.forEach((row, i) => {
    const st = 65.9 + i * 0.16;
    const k = spring(t - st, 15);
    if (k <= 0) {
      y += row.length === 2 ? 64 : 104;
      return;
    }
    ctx.save();
    ctx.translate((1 - k) * 400, 0);
    ctx.globalAlpha *= clamp(k * 1.5);
    if (row.length === 2) {
      text(ctx, row[0], 70, y + 40, { size: 22, weight: 700, family: MONO, color: C.text3, spacing: 3 });
      text(ctx, row[1], 1010, y + 40, { size: 22, weight: 700, family: MONO, color: C.red, align: 'right' });
      y += 64;
    } else {
      const [name, cat, time, amt, tag] = row;
      glass(ctx, 60, y, 960, 92, { r: 22, tint: tag ? C.emerald : null });
      const col = cat === 'Food' ? C.food : cat === 'Groceries' ? C.emerald : cat === 'Fuel' ? C.amber : cat === 'Books' ? C.violet : C.cyan;
      rr(ctx, 84, y + 18, 56, 56, 14);
      ctx.fillStyle = alpha(col, 0.16);
      ctx.fill();
      drawIcon(ctx, `cat:${cat}|${col}`, 112, y + 46, 34);
      text(ctx, name, 164, y + 44, { size: 30, weight: 650 });
      text(ctx, time, 164, y + 76, { size: 22, weight: 600, family: MONO, color: C.text3, spacing: 1 });
      if (tag) pill(ctx, tag, 252, y + 69, { size: 18, color: C.emerald, h: 30, padX: 12 });
      text(ctx, rupees(amt), 990, y + 58, { size: 32, weight: 700, color: tag ? C.text2 : C.red, align: 'right' });
      y += 104;
    }
    ctx.restore();
  });
  ctx.restore();
  callout(ctx, t, 68.6, { tx: 190, ty: 929 - flow, r: 0, lx: 540, ly: 815, align: 'center', title: 'NEWEST FIRST, TO THE MINUTE', color: C.cyan, end: 71.3, ring: false });
  callout(ctx, t, 71.6, { tx: 330, ty: 935 - flow, r: 0, lx: 540, ly: 815, align: 'center', title: 'OWED BACK: NOT SPENDING', color: C.emerald, end: 74.4, ring: false });
  ctx.restore();

  caption(ctx, t, '05 / HISTORY', 62.6, 74.6, [
    [62.8, 68.2, 'Every payment,', 'newest first.'],
    [68.4, 74.6, 'See the spikes.', 'Know what made them.'],
  ]);
}

// ---- 76-90: Coach -------------------------------------------------------------------------

const HUB = { x: 540, y: 470, r: 120 };
const QUESTIONS = ['Can I afford this?', 'Help me save for something', "Where's it going wrong?"];
const CARD = { x: 60, y: 1010, w: 960, h: 470 };

function coach(ctx, t) {
  if (t < 75.3 || t > 90.0) return;
  const out = 1 - ease.in(seg(t, 89.3, 89.7));
  ctx.save();
  ctx.globalAlpha *= out;
  // The hub: the mark in a turning, breathing ring.
  const k = spring(t - 75.4, 11);
  const pulse = 1 + 0.04 * Math.sin(t * 5);
  ctx.save();
  ctx.translate(HUB.x, HUB.y);
  ctx.scale(k * pulse, k * pulse);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 220);
  g.addColorStop(0, alpha(C.cyan, 0.35));
  g.addColorStop(1, alpha(C.cyan, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 220, 0, Math.PI * 2);
  ctx.fill();
  [[150, 0.22, 0.6], [178, -0.15, 0.35], [206, 0.09, 0.2]].forEach(([r, sp, len], i) => {
    arc(ctx, 0, 0, r, (t * sp) % 1, ((t * sp) % 1) + len, 4 - i, alpha(i === 1 ? C.violet : C.cyan, 0.8), 14);
    arc(ctx, 0, 0, r, ((t * sp) % 1) + 0.5, ((t * sp) % 1) + 0.5 + len * 0.5, 4 - i, alpha(i === 1 ? C.violet : C.cyan, 0.5), 10);
  });
  ctx.restore();
  drawMark(ctx, HUB.x, HUB.y, 190 * k, { icon: 0, trace: 1, glow: 0.8 });
  text(ctx, scramble('COACH · WORKED OUT ON YOUR PHONE', seg(t, 75.9, 76.5), 140, t), 540, 740, { size: 24, weight: 700, family: MONO, color: C.cyan, align: 'center', spacing: 3 });

  // The three questions.
  const active = t < 81.6 ? 0 : t < 85.6 ? 1 : 2;
  QUESTIONS.forEach((q, i) => {
    const qk = spring(t - (76.3 + i * 0.1), 14);
    if (qk <= 0) return;
    const y = 790 + i * 70;
    const on = i === active && t > 76.9;
    ctx.save();
    ctx.translate((1 - qk) * -300, 0);
    ctx.globalAlpha *= clamp(qk * 1.5);
    rr(ctx, 60, y, 960, 58, 29);
    ctx.fillStyle = on ? alpha(C.cyan, 0.18) : alpha(C.surface, 0.85);
    ctx.fill();
    ctx.strokeStyle = on ? C.cyan : 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = on ? 3 : 2;
    if (on) {
      ctx.shadowColor = C.cyan;
      ctx.shadowBlur = 20;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    text(ctx, q, 96, y + 39, { size: 28, weight: 600, color: on ? C.text : C.text2 });
    drawIcon(ctx, `forward|${C.cyan}`, 984, y + 29, 28, on ? 1 : 0.5);
    ctx.restore();
  });
  // A fingertip glow on each question as it is asked.
  [[77.0, 0], [81.8, 1], [85.8, 2]].forEach(([at, i]) => {
    if (t > at && t < at + 0.9) ringAt(ctx, 900, 819 + i * 70, 26, t - at, C.cyan);
  });

  // The answer card, its contents generated for each question.
  const ck = spring(t - 77.3, 13);
  if (ck > 0) {
    ctx.save();
    ctx.translate(0, (1 - ck) * 200);
    ctx.globalAlpha *= clamp(ck * 1.5);
    const swap = (at) => (t > at - 0.15 && t < at + 0.15 ? 1 - Math.abs(t - at) / 0.15 : 0);
    const flip = Math.max(swap(81.9), swap(85.9));
    ctx.translate(540, CARD.y + CARD.h / 2);
    ctx.scale(1, 1 - flip * 0.9);
    ctx.translate(-540, -(CARD.y + CARD.h / 2));
    const tone = active === 0 ? C.amber : active === 1 ? C.emerald : C.cyan;
    glass(ctx, CARD.x, CARD.y, CARD.w, CARD.h, { r: 36, glow: tone, glowA: 0.5 });
    const X = CARD.x + 40;
    const Y = CARD.y;
    if (active === 0) {
      text(ctx, 'HOW MUCH IS IT?', X, Y + 60, { size: 22, weight: 700, family: MONO, color: C.text3, spacing: 3 });
      text(ctx, typed('₹8,000', seg(t, 77.6, 77.9)), X, Y + 136, { size: 70, weight: 700 });
      text(ctx, typed('Headphones', seg(t, 77.9, 78.2)), CARD.x + CARD.w - 40, Y + 132, { size: 34, weight: 500, color: C.text2, align: 'right' });
      if (t > 78.3) {
        const vk = spring(t - 78.3, 15);
        ctx.save();
        ctx.translate(X, Y + 200);
        ctx.scale(0.8 + 0.2 * vk, 0.8 + 0.2 * vk);
        pill(ctx, 'IT FITS, BUT ONLY JUST', 0, 0, { size: 26, color: C.amber, a: clamp(vk * 1.5), dot: true });
        ctx.restore();
      }
      [['Left to spend', '₹15,150', C.text], ['This purchase', '−₹8,000', C.red], ['Left after it', '₹7,150', C.amber]].forEach(([l, v, c], i) => {
        const rp = seg(t, 78.6 + i * 0.18, 79.0 + i * 0.18);
        if (rp <= 0) return;
        const y = Y + 290 + i * 54;
        text(ctx, l, X, y, { size: 30, weight: i === 2 ? 700 : 500, color: i === 2 ? C.text : C.text2, a: rp });
        text(ctx, scramble(v, rp, i + 150, t), CARD.x + CARD.w - 40, y, { size: 32, weight: 700, color: c, align: 'right' });
      });
      text(ctx, typed('About ₹420 a day for the 17 days left', seg(t, 79.6, 80.4)), X, Y + 440, { size: 26, weight: 500, color: C.text3 });
    } else if (active === 1) {
      text(ctx, 'SAVE FOR', X, Y + 60, { size: 22, weight: 700, family: MONO, color: C.text3, spacing: 3 });
      text(ctx, typed('Goa trip · ₹60,000 · by March', seg(t, 82.1, 82.7)), X, Y + 120, { size: 40, weight: 650 });
      if (t > 82.9) {
        const vk = spring(t - 82.9, 15);
        pill(ctx, 'YES, COMFORTABLY', X, Y + 190, { size: 26, color: C.emerald, a: clamp(vk * 1.5), dot: true });
      }
      text(ctx, scramble('₹8,500', seg(t, 83.2, 83.6), 160, t), X, Y + 330, { size: 110, weight: 700, color: C.emerald, spacing: -4 });
      text(ctx, 'a month gets you there', X, Y + 390, { size: 32, weight: 500, color: C.text2, a: seg(t, 83.5, 83.9) });
      const rp = 0.34 * ease.out(seg(t, 83.4, 84.4));
      arc(ctx, CARD.x + CARD.w - 150, Y + 300, 90, 0, 1, 16, 'rgba(255, 255, 255, 0.07)');
      arc(ctx, CARD.x + CARD.w - 150, Y + 300, 90, 0, rp, 16, C.emerald, 18);
      text(ctx, `${Math.round(rp * 100)}%`, CARD.x + CARD.w - 150, Y + 312, { size: 36, weight: 700, color: C.text, align: 'center' });
      text(ctx, 'ALREADY SAVED', CARD.x + CARD.w - 150, Y + 430, { size: 18, weight: 700, family: MONO, color: C.text3, align: 'center', spacing: 2 });
    } else {
      text(ctx, 'YOUR BIGGEST LEVERS', X, Y + 60, { size: 22, weight: 700, family: MONO, color: C.text3, spacing: 3 });
      [['Food', 6850, C.food, '+38% on usual'], ['Shopping', 3900, C.violet, 'on track'], ['Fuel', 2800, C.amber, 'on track']].forEach(([name, amt, col, note], i) => {
        const bk = spring(t - (86.1 + i * 0.12), 12);
        if (bk <= 0) return;
        const y = Y + 110 + i * 92;
        text(ctx, name, X, y + 24, { size: 30, weight: 650, a: clamp(bk * 1.5) });
        rr(ctx, X + 190, y, (amt / 7000) * 440 * clamp(bk, 0, 1.05), 30, 15);
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        text(ctx, rupees(amt), CARD.x + CARD.w - 40, y + 26, { size: 30, weight: 700, align: 'right', a: clamp(bk * 1.5) });
        text(ctx, note, X + 190, y + 62, { size: 22, weight: 600, family: MONO, color: i === 0 ? C.amber : C.text3, a: clamp(bk * 1.5) });
      });
      // What to do about it, each with a pointer that draws the eye.
      [['Set a Food budget', 87.3], ['See Food payments', 87.5]].forEach(([label, at], i) => {
        const ak = spring(t - at, 14);
        if (ak <= 0) return;
        const x = i ? X + 470 : X;
        const y = Y + 400;
        rr(ctx, x, y, 420, 56, 28);
        ctx.fillStyle = i ? alpha(C.surfaceElev, 0.9) : C.cyan;
        ctx.globalAlpha *= clamp(ak * 1.5);
        ctx.fill();
        text(ctx, label, x + 210, y + 38, { size: 26, weight: 700, color: i ? C.cyan : '#06121a', align: 'center' });
        ctx.globalAlpha = out;
        if (i === 0 && t > 87.9) {
          const bob = Math.sin(t * 9) * 10;
          ctx.save();
          ctx.translate(x + 210, y - 34 + bob);
          ctx.strokeStyle = C.cyan;
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.shadowColor = C.cyan;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.moveTo(-16, -14);
          ctx.lineTo(0, 0);
          ctx.lineTo(16, -14);
          ctx.stroke();
          ctx.restore();
        }
      });
    }
    ctx.restore();
  }
  callout(ctx, t, 88.2, { tx: 270, ty: 1438, r: 0, lx: 540, ly: 1540, align: 'center', title: 'ONE TAP: A LIMIT ON PLAN', color: C.cyan, end: 89.3, ring: false });
  ctx.restore();

  caption(ctx, t, '06 / COACH', 76.2, 89.2, [
    [76.4, 81.4, 'Ask before', 'you spend.'],
    [81.6, 85.4, 'Set a goal.', 'Get the monthly number.'],
    [85.6, 89.2, 'No AI. No guesswork.', 'Just your own numbers.'],
  ]);
}

// ---- 90-96: the mark, and the line it stands for -----------------------------------------------

const END = { x: 540, y: 760, s: 420 };

function outro(ctx, t) {
  if (t < 89.3) return;
  // The interface breaks into fragments that fall back out of focus.
  const bp = seg(t, 89.3, 90.9);
  if (bp < 1) {
    for (let i = 0; i < 110; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4) % 28;
      const x0 = 60 + col * 240 + hash(i) * 40;
      const y0 = 200 + row * 50 + hash(i + 5) * 30;
      const dx = x0 - 540;
      const dy = y0 - 860;
      const e = ease.out(bp);
      const depth = 1 - e * (0.6 + hash(i + 9) * 0.35);
      const x = 540 + dx * (1 + e * (0.6 + hash(i + 3))) * depth;
      const y = 860 + dy * (1 + e * (0.6 + hash(i + 4))) * depth;
      const w = 60 + hash(i + 7) * 160;
      const h = 24 + hash(i + 8) * 60;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((hash(i + 11) - 0.5) * e * 2);
      ctx.scale(depth, depth);
      ctx.globalAlpha = (1 - bp) * 0.9;
      ctx.filter = `blur(${e * 10}px)`;
      rr(ctx, -w / 2, -h / 2, w, h, 10);
      ctx.fillStyle = alpha(i % 5 === 0 ? C.cyan : i % 7 === 0 ? C.emerald : C.surfaceElev, i % 5 && i % 7 ? 0.85 : 0.5);
      ctx.fill();
      ctx.strokeStyle = alpha(C.cyan, 0.4);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
  // Points of light gathering where the mark will form.
  const gp = seg(t, 90.0, 90.9);
  if (gp > 0 && gp < 1) {
    for (let i = 0; i < 80; i++) {
      const a = hash(i + 300) * Math.PI * 2;
      const d = (1 - ease.in(gp)) * (300 + hash(i + 310) * 700);
      ctx.fillStyle = alpha(C.ink, gp);
      ctx.beginPath();
      ctx.arc(END.x + Math.cos(a) * d, END.y + Math.sin(a) * d, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The mark, drawn as the app opens with it, then a band of light over its metal.
  const mp = t - 90.6;
  if (mp > -0.2) {
    drawMark(ctx, END.x, END.y, END.s, markState(mp), { a: ease.out(seg(t, 90.4, 90.8)), sheen: lerp(-0.4, 1.4, seg(t, 92.0, 93.1)) });
    drawWord(ctx, END.x, END.y + END.s / 2 + 31, 44, t - 90.9);
  }
  // A lens flare off the shield's top point.
  const fp = seg(t, 91.5, 92.0) * (1 - seg(t, 92.3, 93.6));
  if (fp > 0) {
    const fx = END.x;
    const fy = END.y - END.s / 2 + END.s * 0.12;
    const core = ctx.createRadialGradient(fx, fy, 0, fx, fy, 160);
    core.addColorStop(0, `rgba(255, 255, 255, ${fp})`);
    core.addColorStop(0.2, `rgba(180, 240, 255, ${fp * 0.5})`);
    core.addColorStop(1, 'rgba(71, 208, 248, 0)');
    ctx.fillStyle = core;
    ctx.fillRect(fx - 160, fy - 160, 320, 320);
    const streak = ctx.createLinearGradient(0, 0, W, 0);
    streak.addColorStop(0, 'rgba(71, 208, 248, 0)');
    streak.addColorStop(0.5, `rgba(220, 250, 255, ${fp * 0.9})`);
    streak.addColorStop(1, 'rgba(71, 208, 248, 0)');
    ctx.fillStyle = streak;
    ctx.fillRect(0, fy - 2, W, 4);
    ctx.fillStyle = `rgba(71, 208, 248, ${fp * 0.12})`;
    ctx.fillRect(0, fy - 14, W, 28);
  }
  // The line it stands for.
  words(ctx, 'Every rupee, shielded.', 540, 1180, t, 92.3, { size: 84, align: 'center', accent: [2] });
  text(ctx, scramble('PRIVATE · OFFLINE · YOURS', seg(t, 92.9, 93.4), 170, t), 540, 1268, { size: 28, weight: 700, family: MONO, color: C.cyan, align: 'center', spacing: 6 });
  text(ctx, 'getkawach.com', 540, 1360, { size: 30, weight: 500, color: C.text2, align: 'center', a: seg(t, 93.5, 94.0) });
}
