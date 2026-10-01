// The tour film's player, and the way it is turned into the video the app
// plays (media/kawach-tour.mp4).
//
// The film is js/film/scenes.js: one canvas, every frame drawn from the time
// and nothing else. That is what makes it exact. Playing reads the clock and
// draws the frame for that moment; scrubbing draws the moment asked for; the
// renderer draws every 60th of a second in turn and hands each frame straight
// to the browser's own H.264 encoder. No layers to fall out of step, no
// screenshots, and the video is the film pixel for pixel.
import { W, H } from './film/kit.js';
import { LENGTH, drawFrame, loadAssets } from './film/scenes.js';
import { icon } from './icons.js';

const params = new URLSearchParams(location.search);
const embedded = window.parent !== window;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?capture=1: for the renderer, nothing starts by itself.
const capture = params.has('capture');
// ?t=31.4 opens on that moment and waits, for a still to check or share.
const startAt = Number(params.get('t')) || 0;
const autoplay = params.get('autoplay') !== '0' && !startAt && !reduceMotion && !capture;
// The frame shown when it does not start by itself: the month, read at a glance.
const POSTER = 13.2;

const canvas = document.getElementById('stage');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d', { alpha: false });
const playBtn = document.getElementById('tf-play');
const scrub = document.getElementById('tf-scrub');
const timeText = document.getElementById('tf-time');
scrub.max = String(LENGTH * 1000);

let now = 0;
let playing = false;
let startedAt = 0;
let resumeOnReturn = false;

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function fit() {
  const frame = canvas.parentElement;
  const k = Math.min(frame.clientWidth / W, frame.clientHeight / H);
  canvas.style.width = `${Math.floor(W * k)}px`;
  canvas.style.height = `${Math.floor(H * k)}px`;
}

function show(s) {
  now = Math.max(0, Math.min(LENGTH, s));
  drawFrame(ctx, now);
  scrub.value = String(Math.round(now * 1000));
  timeText.textContent = `${clock(now)} / ${clock(LENGTH)}`;
}

function setPlaying(on) {
  playing = on;
  playBtn.innerHTML = icon(on ? 'pause' : 'play');
  playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  if (on) {
    if (now >= LENGTH) now = 0;
    startedAt = performance.now() - now * 1000;
    requestAnimationFrame(tick);
  }
}

function tick() {
  if (!playing) return;
  const s = (performance.now() - startedAt) / 1000;
  show(s);
  if (s >= LENGTH) setPlaying(false);
  else requestAnimationFrame(tick);
}

playBtn.addEventListener('click', () => setPlaying(!playing));
scrub.addEventListener('input', () => {
  if (playing) setPlaying(false);
  show(Number(scrub.value) / 1000);
});
new ResizeObserver(fit).observe(canvas.parentElement);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) {
    resumeOnReturn = true;
    setPlaying(false);
  } else if (!document.hidden && resumeOnReturn) {
    resumeOnReturn = false;
    setPlaying(true);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && e.target === document.body) {
    e.preventDefault();
    setPlaying(!playing);
  } else if (e.key === 'Escape' && embedded) {
    window.parent.postMessage('kawach-tour-close', location.origin);
  }
});

// Rendering the video, a frame at a time, with the browser's own encoder.
// Called by the renderer (expense-tracker-versions/tools/tour-video); the
// encoded pieces are read back with take() and written into an MP4 there.
const chunks = [];
let description = null;
let encodeError = null;
async function render({ fps = 60, bitrate = 2600000, from = 0, to = LENGTH } = {}) {
  chunks.length = 0;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ ts: chunk.timestamp, key: chunk.type === 'key', data });
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d && !description) description = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
    },
    error: (e) => { encodeError = String((e && e.message) || e); },
  });
  enc.configure({ codec: 'avc1.64002a', width: W, height: H, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality', bitrateMode: 'variable' });
  const first = Math.round(from * fps);
  const last = Math.round(to * fps);
  for (let i = first; i < last; i++) {
    drawFrame(ctx, i / fps);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(((i - first) * 1e6) / fps), duration: Math.round(1e6 / fps) });
    enc.encode(frame, { keyFrame: (i - first) % (fps * 2) === 0 });
    frame.close();
    while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 2));
    if (encodeError) throw new Error(encodeError);
    window.tourFilm.progress = (i - first + 1) / (last - first);
  }
  await enc.flush();
  enc.close();
  return chunks.length;
}
const b64 = (u) => {
  let s = '';
  for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
  return btoa(s);
};

window.tourFilm = {
  show,
  length: LENGTH,
  progress: 0,
  render,
  take: (from, n) => JSON.stringify(chunks.slice(from, from + n).map((c) => ({ ts: c.ts, key: c.key, d: b64(c.data) }))),
  description: () => (description ? b64(description) : null),
  still: (s, quality = 0.86) => {
    show(s);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  },
};

// Everything is measured and drawn in the real typeface, so wait for it.
Promise.all([
  document.fonts.load('700 64px Geist'),
  document.fonts.load('600 64px Geist'),
  document.fonts.load('500 64px Geist'),
  loadAssets(),
]).then(() => {
  fit();
  show(autoplay ? 0 : startAt || POSTER);
  setPlaying(autoplay);
  window.tourFilm.ready = true;
});
