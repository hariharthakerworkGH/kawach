/* Share your month as a picture (7.24): the last card of Month in review gets a button that draws the month onto a canvas
 * and hands it to the phone's share sheet. Everything is drawn here on the device; nothing is uploaded.
 *
 * The picture says what the review already says, in words and counts. Amounts are OFF each time the sheet opens, because a
 * picture can be passed on by anyone who gets it: switching them on is a choice made for that one picture. */

import { formatRupees } from './format.js';
import { holdFocus } from './overlay.js';
import { dragToClose } from './sheet-drag.js';

const W = 1080;
const H = 1350;
const FONT = '"Geist", system-ui, -apple-system, "Segoe UI", sans-serif';

/* The lines under the big word, as [label, value] pairs. A line whose fact the month does not have is left out, never
 * filled with a guess. `facts` comes from recap.js (buildCards). */
export function monthRows(facts, amounts) {
  const rows = [['Quiet days', facts.quiet]];
  if (facts.category) rows.push(['Biggest category', amounts ? `${facts.category.name} ${formatRupees(facts.category.amount)}` : facts.category.name]);
  if (facts.regular) rows.push(['A regular', `${facts.regular.name}, ${facts.regular.count} times`]);
  return rows;
}

/* The big word and the line under it. */
export function monthHeadline(facts, amounts) {
  if (amounts) return [`${facts.ahead ? '+' : '−'}${formatRupees(facts.net)}`, facts.ahead ? 'came in more than went out' : 'went out more than came in'];
  return [facts.ahead ? 'Ahead' : 'Behind', facts.ahead ? 'more came in than went out' : 'more went out than came in'];
}

// A value too long for its line is cut with an ellipsis rather than run into the label.
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

let logo = null;
function loadLogo() {
  if (!logo) {
    logo = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // the picture is still right without the mark
      img.src = './icons/kawach-192.png';
    });
  }
  return logo;
}

/* Draws the picture onto `canvas` (1080 x 1350). It has its own fixed navy and mint, so it reads the same in anyone's feed
 * whatever look the phone is in. */
export async function drawMonthPicture(canvas, facts, amounts) {
  try {
    await Promise.all([document.fonts.load(`700 100px ${FONT}`), document.fonts.load(`500 50px ${FONT}`)]);
  } catch {
    // the system font is used instead
  }
  const mark = await loadLogo();
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const PAD = 86;

  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#14306b');
  base.addColorStop(1, '#0a1a45');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, 0, 0, W * 0.8, 0, W * 0.75);
  glow.addColorStop(0, 'rgba(42, 92, 196, 1)');
  glow.addColorStop(1, 'rgba(42, 92, 196, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H * 0.6);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#b8c6ea';
  ctx.font = `500 47px ${FONT}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.fillText('MY MONTH', PAD, 140);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  if (mark) {
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W - PAD - 94, 94, 94, 94, 22);
    else ctx.rect(W - PAD - 94, 94, 94, 94);
    ctx.clip();
    ctx.drawImage(mark, W - PAD - 94, 94, 94, 94);
    ctx.restore();
  }

  ctx.fillStyle = '#b8c6ea';
  ctx.font = `500 54px ${FONT}`;
  ctx.fillText(facts.month, PAD, 285);

  const [big, sub] = monthHeadline(facts, amounts);
  ctx.fillStyle = '#7ee6d0';
  ctx.font = `700 144px ${FONT}`;
  ctx.fillText(fit(ctx, big, W - PAD * 2), PAD, 430);
  ctx.fillStyle = '#dbe5ff';
  ctx.font = `500 50px ${FONT}`;
  ctx.fillText(sub, PAD, 510);

  let y = 600;
  for (const [label, value] of monthRows(facts, amounts)) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fillRect(PAD, y, W - PAD * 2, 3);
    ctx.fillStyle = '#b8c6ea';
    ctx.font = `500 50px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, PAD, y + 92);
    const room = W - PAD * 2 - ctx.measureText(label).width - 40;
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 50px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(fit(ctx, value, room), W - PAD, y + 92);
    y += 146;
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#8ea2d6';
  ctx.font = `500 43px ${FONT}`;
  ctx.fillText('Money that stays on my phone', PAD, H - 78);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 47px ${FONT}`;
  ctx.fillText('Kawach', W - PAD, H - 78);
  ctx.textAlign = 'left';
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

/* The sheet: the picture as it will be sent, one switch for amounts (off), and Share. Where the phone cannot share a file the
 * button saves the picture instead. Closing it leaves nothing behind. */
export function openShareSheet(facts) {
  const wrap = document.createElement('div');
  wrap.className = 'share-month';
  wrap.innerHTML = `
    <div class="sm-back" data-close></div>
    <div class="sm-sheet" role="dialog" aria-modal="true" aria-label="Share this month">
      <div class="sm-grip k-sheet__grip"></div>
      <div class="sm-head"><h3>Share this month</h3><button type="button" class="sm-close" data-close>Close</button></div>
      <canvas class="sm-pic" role="img" aria-label="The picture that will be shared"></canvas>
      <button type="button" class="sm-switch" id="share-amounts" role="switch" aria-checked="false"><span><b>Show amounts</b><small id="share-amounts-sub"></small></span><span class="sm-tog" aria-hidden="true"></span></button>
      <p class="sm-said" role="status" aria-live="polite"></p>
      <button type="button" class="sm-go" id="share-go">Share</button>
    </div>`;
  document.body.append(wrap); // on the page itself, above the bottom bar, like the other sheets
  const release = holdFocus(wrap.querySelector('.sm-sheet'));
  const canvas = wrap.querySelector('canvas');
  const toggle = wrap.querySelector('#share-amounts');
  const sub = wrap.querySelector('#share-amounts-sub');
  const said = wrap.querySelector('.sm-said');
  let amounts = false;
  let drawing = Promise.resolve();
  const paint = () => {
    sub.textContent = amounts ? 'Anyone who sees it can read them' : 'Off: only words and counts';
    toggle.setAttribute('aria-checked', String(amounts));
    // One after the other, so a quick second tap on the switch can never leave the first picture painted last.
    drawing = drawing.then(() => drawMonthPicture(canvas, facts, amounts));
    return drawing;
  };
  paint();
  toggle.addEventListener('click', () => {
    amounts = !amounts;
    said.textContent = '';
    paint();
  });

  const close = () => {
    window.removeEventListener('hashchange', close);
    document.removeEventListener('keydown', onKey, true);
    release();
    wrap.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  dragToClose(wrap.querySelector('.sm-sheet'), close, wrap.querySelector('.sm-back'));
  wrap.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return close();
    if (!e.target.closest('#share-go')) return;
    await drawing;
    const blob = await toBlob(canvas);
    if (!blob) {
      said.textContent = 'Could not make the picture. Try again.';
      return;
    }
    const name = `kawach-${facts.month.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My month with Kawach' });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // closed the share sheet without choosing: nothing to say
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    said.textContent = 'Saved as a picture on this phone.';
  });
  toggle.focus?.({ preventScroll: true });
  return close;
}
