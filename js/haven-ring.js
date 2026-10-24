import { escapeHtml as esc } from './ui.js';
// History's ring (the Ledger mockup): the month's spending as a small ring with its legend beside it, one row per category, and what came in
// under them. Tap a slice or a legend row and the middle reads it; tap again to clear.
const R = 42;
const CIRC = 2 * Math.PI * R;
const GAP = 2;
const TONES = ['#4B7BE5', '#3FD8C6', '#F4B541', '#62E3A5', '#FF8080'];
const OTHER = '#8392AD';
const inr = (paise) => `₹${Math.round(Math.abs(paise) / 100).toLocaleString('en-IN')}`;
// The middle of the ring: the amount, shrunk until it fits the hole (about 62px) whatever its length: ₹2,73,170 is wider than ₹66,197.
const mid = (paise, label) => {
  const text = inr(paise);
  const em = [...text].reduce((w, c) => w + (c === ',' ? 0.3 : 0.62), 0);
  return `<b style="font-size:${Math.max(10, Math.min(16, 62 / em)).toFixed(1)}px">${text}</b><span>${label}</span>`;
};
const colourOf = (s, i) => (s.other ? OTHER : TONES[Math.min(i, TONES.length - 1)]);

// slices: [{ name, amount (paise), icon (svg markup) }], biggest first; at most five, the rest gathered as "Other".
export function ringSlices(entries) {
  const sorted = [...entries].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= 6) return sorted;
  const head = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  return [...head, { name: 'Other', amount: rest.reduce((s, x) => s + x.amount, 0), icon: rest[0].icon, other: true }];
}

export function ringHtml(slices, income = 0) {
  const total = slices.reduce((s, x) => s + x.amount, 0);
  const track = `<circle cx="52" cy="52" r="${R}" fill="none" stroke="var(--lg-s2)" stroke-width="12"/>`;
  if (!total) {
    return `<div class="hv-ring__wrap"><svg class="hv-ring__svg" viewBox="0 0 104 104" width="104" height="104" aria-hidden="true">${track}</svg><div class="hv-ring__mid"><b>Nothing</b><span>spent</span></div></div>`;
  }
  let off = 0;
  let arcs = '';
  let rows = '';
  slices.forEach((s, i) => {
    const len = (s.amount / total) * CIRC;
    const colour = colourOf(s, i);
    arcs += `<circle class="hv-ring__arc" data-i="${i}" cx="52" cy="52" r="${R}" fill="none" stroke="${colour}" stroke-width="12" transform="rotate(-90 52 52)" stroke-dasharray="${Math.max(0, len - GAP).toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"><title>${esc(s.name)}</title></circle>`;
    rows += `<button type="button" class="hv-ring__badge" data-i="${i}" aria-label="${esc(s.name)} ${inr(s.amount)}"><i style="background:${colour}"></i><span>${esc(s.name)}</span><b>${inr(s.amount)}</b></button>`;
    off += len;
  });
  const money = income > 0 ? `<div class="lg-lin"><span>In</span><b>+${inr(income)}</b></div>` : '';
  return `<div class="hv-ring__wrap" data-total="${total}"><svg class="hv-ring__svg" viewBox="0 0 104 104" width="104" height="104" role="img" aria-label="Where this month's spending went">${track}${arcs}</svg><div class="hv-ring__mid" aria-live="polite">${mid(total, 'spent')}</div></div><div class="lg-legend">${rows}${money}</div>`;
}

export function wireRing(root, slices) {
  const wrap = root.querySelector('.hv-ring__wrap');
  if (!wrap || !slices.length || wrap.dataset.wired) return;
  wrap.dataset.wired = '1';
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (!total) return;
  const middle = wrap.querySelector('.hv-ring__mid');
  let pick = -1;
  const paint = () => {
    root.querySelectorAll('.hv-ring__arc, .hv-ring__badge').forEach((a) => { a.classList.toggle('dim', pick >= 0 && +a.dataset.i !== pick); a.classList.toggle('on', +a.dataset.i === pick); });
    middle.innerHTML = pick < 0 ? mid(total, 'spent') : mid(slices[pick].amount, esc(slices[pick].name));
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-i]');
    if (!t) return;
    pick = pick === +t.dataset.i ? -1 : +t.dataset.i;
    paint();
  });
}
