// Redrawing a screen in place: after a tap on "This month", "Mark paid",
// "Edit" and the like, or when a sync brings in the other device's changes.
//
// A screen redraws by emptying itself and filling in again once its figures
// are worked out. Done in plain sight that is a flicker - the screen goes
// blank, then arrives in pieces - and while it is short the browser pulls the
// scroll position up, landing you at the top, far from the button you
// pressed. So while it redraws, a still copy of the screen as it was stays in
// its place; the real one is rebuilt out of sight and swapped in whole, with
// your scroll position and any section you had opened put back.
export async function redraw(container, draw) {
  const y = window.scrollY;
  const open = openSections(container);
  const still = container.cloneNode(true);
  // A copy for looking at only: no ids to clash with the real screen's, and
  // nothing in it can be tapped.
  still.removeAttribute('id');
  still.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  still.setAttribute('aria-hidden', 'true');
  still.inert = true;
  // Two redraws can overlap; the second copy is made while the screen is
  // hidden by the first, and must still show.
  still.hidden = false;
  container.before(still);
  container.hidden = true;
  try {
    await draw();
  } finally {
    reopen(container, open);
    container.hidden = false;
    still.remove();
    window.scrollTo(0, y);
  }
}

// A folded section is known by its kind and its heading, less any figures in
// it: "7 paid · 2 skipped" is still the same section once it reads "8 paid".
// Two sections with the same heading are told apart by their order.
function sectionKeys(container) {
  const seen = new Map();
  return [...container.querySelectorAll('details')].map((d) => {
    const heading = (d.querySelector(':scope > summary')?.textContent || '').replace(/[\d,.₹−-]+/g, '').replace(/\s+/g, ' ').trim();
    const base = `${d.className}|${heading}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return { d, key: `${base}|${n}` };
  });
}

function openSections(container) {
  return new Set(sectionKeys(container).filter((s) => s.d.open).map((s) => s.key));
}

function reopen(container, open) {
  if (!open.size) return;
  for (const { d, key } of sectionKeys(container)) if (open.has(key)) d.open = true;
}
