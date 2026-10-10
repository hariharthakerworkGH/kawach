/* Drag to reorder (5.37): grab a row by its grip; it lifts, the rows it passes slide aside by exactly
 * its own height, and letting go settles it into the gap. The up and down buttons stay, for a
 * keyboard and for anyone who prefers them. The list is only moved in the picture while dragging:
 * the new order is handed to `done` as a list of ids, which saves it and redraws. */
const reduced = () => Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function dragRows(rows, grip, done) {
  let state = null;

  const down = (e) => {
    if (e.button != null && e.button > 0) return;
    const row = e.currentTarget.closest('[data-id]');
    const at = rows.indexOf(row);
    if (at < 0) return;
    e.preventDefault();
    const rects = rows.map((r) => r.getBoundingClientRect());
    state = { row, at, rects, startY: e.clientY, dy: 0, to: at, h: rects[at].height };
    row.style.zIndex = '5';
    row.style.transition = 'none';
    row.style.position = 'relative';
    if (!reduced()) row.style.boxShadow = '0 10px 24px rgb(0 0 0 / 0.45)';
    rows.forEach((r) => {
      if (r !== row) r.style.transition = reduced() ? 'none' : `transform 220ms ${OUT}`;
    });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the drag follows the events it gets */
    }
  };

  const move = (e) => {
    if (!state) return;
    const { at, rects, h } = state;
    const lo = rects[0].top - rects[at].top;
    const hi = rects[rects.length - 1].bottom - rects[at].bottom;
    state.dy = Math.max(lo, Math.min(hi, e.clientY - state.startY));
    const centre = rects[at].top + h / 2 + state.dy;
    let to = at;
    rows.forEach((r, j) => {
      if (j === at) return;
      const mid = rects[j].top + rects[j].height / 2;
      let shift = 0;
      if (j < at && centre < mid) {
        shift = h;
        to = Math.min(to, j);
      } else if (j > at && centre > mid) {
        shift = -h;
        to = Math.max(to, j);
      }
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
    state.to = to;
    state.row.style.transform = `translateY(${state.dy}px) scale(${reduced() ? 1 : 1.03})`;
  };

  const up = async () => {
    if (!state) return;
    const { row, at, to, rects } = state;
    state = null;
    // Where the row ends up: the top of the slot it is dropped into, less where it started.
    const target = rects[to].top - rects[at].top + (to > at ? rects[to].height - rects[at].height : 0);
    row.style.transition = reduced() ? 'none' : `transform 240ms ${OUT}, box-shadow 240ms ${OUT}`;
    row.style.transform = `translateY(${target}px) scale(1)`;
    row.style.boxShadow = 'none';
    await new Promise((r) => setTimeout(r, reduced() ? 0 : 250));
    const ids = rows.map((r) => r.dataset.id);
    ids.splice(at, 1);
    ids.splice(to, 0, row.dataset.id);
    done(ids, at !== to);
  };

  grip.forEach((g) => {
    g.addEventListener('pointerdown', down);
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
  });
}
