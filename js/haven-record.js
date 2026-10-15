// "Record a run" (5.69): for finding what feels rough on a real phone. It listens while the app is used and writes a small
// report - how smooth each screen was, what was tapped, any jump, blank screen or error - that the owner shares with whoever
// is fixing it. It holds NO money, names or text from the screen: only the kind of thing tapped ("button.account-open"),
// timings and counts. Nothing is sent anywhere; the report is copied, shared or saved by the person holding the phone.
import { APP_VERSION } from './version.js';
import { showToast } from './toast.js';

let run = null;
const root = document.documentElement;

const view = () => (document.querySelector('.hv-sheet') ? 'add sheet' : document.querySelector('.nav-btn.active')?.dataset.view || 'screen');
// what was tapped, in words that carry no content: tag and the first two class names, and the parent's
function describe(el) {
  const one = (e) => `${e.tagName.toLowerCase()}${[...(e.classList || [])].slice(0, 2).map((c) => `.${c}`).join('')}`;
  if (!el || !el.tagName) return 'unknown';
  const up = el.closest('button, a, [role=button], .account-row, .hv-row, .hv-chip, .hist-row, .hv-key') || el;
  return one(up) + (up.parentElement ? ` in ${one(up.parentElement)}` : '');
}
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r1 = (n) => Math.round(n * 10) / 10;

export const isRecording = () => !!run;

export function startRecording() {
  if (run) return;
  const t0 = performance.now();
  run = {
    t0, started: new Date().toISOString(), frames: [], slow: [], taps: [], marks: [], shifts: [], tasks: [], jumps: [], blanks: [], errors: [], anims: 0, last: t0,
    lastH: document.scrollingElement.scrollHeight, lastY: scrollY, view: null, viewAt: 0, down: false, raf: 0, timers: [], obs: [], heap0: performance.memory?.usedJSHeapSize || 0,
  };
  const now = () => performance.now() - t0;
  const tick = (ts) => {
    if (!run) return;
    const dt = ts - run.last; run.last = ts;
    if (dt > 0 && dt < 5000) {
      run.frames.push(dt);
      if (dt > 34) {
        const tap = run.taps.length ? run.taps[run.taps.length - 1] : null;
        const afterTap = tap && now() - tap.t < 1500 ? tap : null;
        run.slow.push({ t: r1(now() / 1000), ms: Math.round(dt), view: view(), after: afterTap ? afterTap.what : null });
        if (afterTap) { afterTap.slow += 1; afterTap.worst = Math.max(afterTap.worst, Math.round(dt)); }
      }
    }
    // a page that suddenly grows or shrinks, or scrolls by itself: the jumps that feel like glitches
    const h = document.scrollingElement.scrollHeight, y = scrollY;
    // changing screen changes the page's height on purpose; only a jump on a screen that stayed the same is a glitch
    const v = view();
    if (v !== run.view) { run.view = v; run.viewAt = now(); }
    const settling = now() - (run.viewAt || 0) < 1000;
    if (!settling && Math.abs(h - run.lastH) > 120) run.jumps.push({ t: r1(now() / 1000), kind: 'height', from: run.lastH, to: h, view: view(), after: run.taps.length ? run.taps[run.taps.length - 1].what : null });
    if (!settling && !run.down && Math.abs(y - run.lastY) > 160) run.jumps.push({ t: r1(now() / 1000), kind: 'scroll', from: Math.round(run.lastY), to: Math.round(y), view: view() });
    run.lastH = h; run.lastY = y;
    run.raf = requestAnimationFrame(tick);
  };
  run.raf = requestAnimationFrame((ts) => { run.last = ts; run.raf = requestAnimationFrame(tick); });

  const onDown = (e) => {
    run.down = true;
    if (e.target.closest?.('.hv-rec')) return;
    run.taps.push({ t: now(), at: r1(now() / 1000), view: view(), what: describe(e.target), slow: 0, worst: 0, shift: 0 });
  };
  const onUp = () => { if (run) run.down = false; };
  const onErr = (e) => run?.errors.push(`${String(e.message || e.reason?.message || e.reason).slice(0, 120)} @${String(e.filename || '').split('/').slice(-2).join('/')}:${e.lineno || ''}`);
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointerup', onUp, true);
  addEventListener('pointercancel', onUp, true);
  addEventListener('error', onErr);
  addEventListener('unhandledrejection', onErr);
  run.off = () => { for (const [n, f, c] of [['pointerdown', onDown, true], ['pointerup', onUp, true], ['pointercancel', onUp, true], ['error', onErr], ['unhandledrejection', onErr]]) removeEventListener(n, f, c); };

  try {
    const ls = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput || e.value < 0.02) continue;
        const tap = run.taps.length ? run.taps[run.taps.length - 1] : null;
        if (tap && now() - tap.t < 1500) tap.shift = r1(tap.shift + e.value);
        run.shifts.push({ t: r1(now() / 1000), value: r1(e.value * 100) / 100, view: view() });
      }
    });
    ls.observe({ type: 'layout-shift', buffered: false }); run.obs.push(ls);
  } catch { /* this phone does not report it */ }
  try {
    const lt = new PerformanceObserver((list) => { for (const e of list.getEntries()) run.tasks.push({ t: r1(now() / 1000), ms: Math.round(e.duration) }); });
    lt.observe({ type: 'longtask', buffered: false }); run.obs.push(lt);
  } catch { /* this phone does not report it */ }
  // every quarter second: something blank where a screen should be, and how many animations are running
  run.timers.push(setInterval(() => {
    const box = document.querySelector('.view-container:not([aria-hidden="true"]):not([hidden])');
    if (box && !document.querySelector('.hv-sheet') && box.getBoundingClientRect().height < 80 && !box.querySelector('canvas')) run.blanks.push({ t: r1(now() / 1000), view: view() });
    run.anims = Math.max(run.anims, document.getAnimations().length);
  }, 250));
  showPill();
}

function showPill() {
  const pill = document.createElement('div');
  pill.className = 'hv-rec';
  pill.setAttribute('role', 'status');
  pill.innerHTML = '<i class="hv-rec__dot"></i><span class="hv-rec__t">0:00</span><button type="button" class="hv-rec__mark">Looks wrong</button><button type="button" class="hv-rec__stop">Stop</button>';
  document.body.append(pill);
  const clock = pill.querySelector('.hv-rec__t');
  run.timers.push(setInterval(() => { const s = Math.floor((performance.now() - run.t0) / 1000); clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500));
  pill.querySelector('.hv-rec__mark').addEventListener('click', () => {
    run.marks.push({ t: r1((performance.now() - run.t0) / 1000), view: view(), after: run.taps.length ? run.taps[run.taps.length - 1].what : null });
    showToast('Marked');
  });
  pill.querySelector('.hv-rec__stop').addEventListener('click', () => { pill.remove(); finish(); });
  run.pill = pill;
}

function finish() {
  const r = run; run = null;
  cancelAnimationFrame(r.raf); r.timers.forEach(clearInterval); r.obs.forEach((o) => o.disconnect()); r.off();
  const secs = (performance.now() - r.t0) / 1000;
  const worstTaps = [...r.taps].filter((t) => t.slow || t.shift > 0.05).sort((a, b) => b.worst - a.worst || b.shift - a.shift).slice(0, 8);
  const report = {
    kawach: APP_VERSION,
    note: 'Speed and taps only. No money, names or text from the screen.',
    when: r.started,
    seconds: Math.round(secs),
    phone: { screen: `${screen.width}x${screen.height}`, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency || null, memoryGB: navigator.deviceMemory || null, agent: navigator.userAgent.replace(/\s+/g, ' ').slice(0, 140), standalone: matchMedia('(display-mode: standalone)').matches, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches },
    look: { style: root.dataset.style, colour: root.dataset.theme, motion: root.dataset.motion, liquid: root.dataset.liquid || null },
    smoothness: { frames: r.frames.length, medianMs: r1(pct(r.frames, 0.5)), p95Ms: r1(pct(r.frames, 0.95)), slowOver34ms: r.slow.length, over100ms: r.slow.filter((s) => s.ms > 100).length, longTasks: r.tasks.length, maxAnimationsAtOnce: r.anims },
    marks: r.marks,
    worstAfterTaps: worstTaps.map((t) => ({ at: t.at, view: t.view, tapped: t.what, slowFrames: t.slow, worstMs: t.worst, shift: t.shift })),
    jumps: r.jumps.slice(0, 20),
    blankScreens: r.blanks.slice(0, 10),
    layoutShifts: r.shifts.slice(0, 20),
    errors: r.errors.slice(0, 10),
    slowMoments: r.slow.sort((a, b) => b.ms - a.ms).slice(0, 15),
    taps: r.taps.slice(0, 80).map((t) => `${t.at}s ${t.view}: ${t.what}`),
    heapMB: r.heap0 ? [Math.round(r.heap0 / 1e6), Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6)] : null,
  };
  showResult(report);
}

function showResult(report) {
  const text = JSON.stringify(report, null, 1);
  const s = report.smoothness;
  const dlg = document.createElement('div');
  dlg.className = 'hv-recdlg';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-label', 'Run recorded');
  dlg.innerHTML = `<div class="hv-recdlg__box"><h2>Run recorded</h2>
    <p>${report.seconds} seconds · ${s.slowOver34ms} slow moments · ${report.jumps.length} jumps · ${report.blankScreens.length} blank · ${report.errors.length} errors${report.marks.length ? ` · ${report.marks.length} marked` : ''}</p>
    <div class="hv-recdlg__acts"><button type="button" data-a="copy">Copy report</button><button type="button" data-a="share">Share</button><button type="button" data-a="save">Save file</button><button type="button" data-a="close" class="quiet">Close</button></div></div>`;
  document.body.append(dlg);
  const file = () => new File([text], `kawach-run-${APP_VERSION}.json`, { type: 'application/json' });
  dlg.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'close') dlg.remove();
    if (a === 'copy') { try { await navigator.clipboard.writeText(text); showToast('Report copied: paste it in the chat'); } catch { showToast('Could not copy: use Save file'); } }
    if (a === 'share') { try { if (navigator.canShare?.({ files: [file()] })) await navigator.share({ files: [file()], title: 'Kawach run' }); else await navigator.share({ text, title: 'Kawach run' }); } catch { /* cancelled */ } }
    if (a === 'save') { const url = URL.createObjectURL(file()); const l = document.createElement('a'); l.href = url; l.download = file().name; l.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
  });
}

// Hidden on purpose: tap the version in Settings five times and the row appears (it is for fixing, not for everyone).
export function wireRecordRow(container) {
  const vt = container.querySelector('#version-text');
  if (!vt) return;
  let n = 0; let timer = 0;
  const reveal = () => {
    if (container.querySelector('.hv-recrow')) return;
    const row = document.createElement('div');
    row.className = 'hv-recrow';
    row.innerHTML = '<span>Record a run <small>for fixing: speed and taps only, no money</small></span><button type="button" class="hv-recrow__go">Start</button>';
    container.querySelector('#version-line')?.after(row);
    row.querySelector('button').addEventListener('click', () => { startRecording(); document.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'summary' } })); });
  };
  vt.addEventListener('click', () => { n += 1; clearTimeout(timer); timer = setTimeout(() => { n = 0; }, 2500); if (n >= 5) { n = 0; reveal(); } });
}
