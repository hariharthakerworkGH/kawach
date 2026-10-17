import { escapeHtml as esc } from './ui.js';
// History's ring (5.74, mockups/7.12-cards-and-ring): the month's spending as a ring, one slice per category with that
// category's icon sitting on its slice. Tap a slice or an icon and the middle reads it; tap again to clear.
const R = 105;
const CIRC = 2 * Math.PI * R;
const GAP = 3;
const inr = (paise) => `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;

// slices: [{ name, amount (paise), icon (svg markup) }], biggest first; at most five, the rest gathered as "Other".
export function ringSlices(entries) {
  const sorted = [...entries].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= 6) return sorted;
  const head = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  return [...head, { name: 'Other', amount: rest.reduce((s, x) => s + x.amount, 0), icon: rest[0].icon, other: true }];
}

export function ringHtml(slices) {
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (!total) {
    return `<div class="hv-ring__wrap"><svg class="hv-ring__svg" viewBox="0 0 300 300" aria-hidden="true"><circle cx="150" cy="150" r="${R}" fill="none" stroke="var(--hv-hair)" stroke-width="26"/></svg><div class="hv-ring__mid"><b>Nothing</b><span>spent this month</span></div></div>`;
  }
  let off = 0;
  let arcs = '';
  let badges = '';
  slices.forEach((s, i) => {
    const len = (s.amount / total) * CIRC;
    const tone = s.other ? 6 : Math.min(i, 4) + 1;
    arcs += `<circle class="hv-ring__arc" data-i="${i}" cx="150" cy="150" r="${R}" stroke="var(--hv-L${tone})" stroke-dasharray="${Math.max(0, len - GAP).toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(s.name)}</title></circle>`;
    const mid = ((off + len / 2) / CIRC) * 2 * Math.PI - Math.PI / 2;
    const x = 150 + Math.cos(mid) * R;
    const y = 150 + Math.sin(mid) * R;
    // the icon only where its slice is wide enough to carry it
    if (len > 24) badges += `<button type="button" class="hv-ring__badge" data-i="${i}" aria-label="${esc(s.name)} ${inr(s.amount)}" style="left:${(x / 3).toFixed(2)}%;top:${(y / 3).toFixed(2)}%"><span class="hv-ic">${s.icon}</span></button>`;
    off += len;
  });
  return `<div class="hv-ring__wrap" data-total="${total}"><svg class="hv-ring__svg" viewBox="0 0 300 300" role="img" aria-label="Where this month's spending went"><circle cx="150" cy="150" r="${R}" fill="none" stroke="var(--hv-hair)" stroke-width="26"/>${arcs}</svg>${badges}<div class="hv-ring__mid" aria-live="polite"><b>${inr(total)}</b><span>spent this month</span></div></div>`;
}

export function wireRing(root, slices) {
  const wrap = root.querySelector('.hv-ring__wrap');
  if (!wrap || !slices.length || wrap.dataset.wired) return;
  wrap.dataset.wired = '1';
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (!total) return;
  const mid = wrap.querySelector('.hv-ring__mid');
  let pick = -1;
  const paint = () => {
    wrap.querySelectorAll('.hv-ring__arc').forEach((a) => { a.classList.toggle('dim', pick >= 0 && +a.dataset.i !== pick); a.classList.toggle('on', +a.dataset.i === pick); });
    wrap.querySelectorAll('.hv-ring__badge').forEach((b) => { b.classList.toggle('dim', pick >= 0 && +b.dataset.i !== pick); b.classList.toggle('on', +b.dataset.i === pick); });
    if (pick < 0) mid.innerHTML = `<b>${inr(total)}</b><span>spent this month</span>`;
    else {
      const s = slices[pick];
      mid.innerHTML = `<b>${inr(s.amount)}</b><span>${esc(s.name)}</span><em>${Math.round((s.amount / total) * 100)}% of spending</em>`;
    }
  };
  wrap.addEventListener('click', (e) => {
    const t = e.target.closest('[data-i]');
    if (!t) return;
    pick = pick === +t.dataset.i ? -1 : +t.dataset.i;
    paint();
  });
}
