// The tour: a minute of what the app is for, played over the app as a video.
// media/kawach-tour.mp4 is made with the Hyperframes tools (tools/tour-showreel):
// motion graphics and a 3D phone showing the app's own screens, rendered ahead
// of time because every phone plays a video smoothly with its own decoder. It is
// served from the app's own address, never a video site, so watching it tells
// nobody anything, and it is not kept for offline use: a video is too big to
// store on every phone for one viewing.
import { icon } from './icons.js';
import { holdFocus } from './overlay.js';
import { showToast } from './toast.js';

const TOUR_VIDEO = './media/kawach-tour.mp4';
const TOUR_POSTER = './media/kawach-tour.jpg';
const SHARE_URL = 'https://getkawach.com/welcome.html';

export function playTour() {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop tour-backdrop';
  backdrop.innerHTML = `
    <div class="tour-box" role="dialog" aria-modal="true" aria-label="Kawach in one minute">
      <button type="button" class="icon-btn tour-close" aria-label="Close">${icon('close')}</button>
      <video class="tour-video" src="${TOUR_VIDEO}" poster="${TOUR_POSTER}" controls autoplay playsinline preload="auto"></video>
      <p class="muted-note tour-offline" hidden>The tour needs an internet connection.</p>
      <!-- The film shows Haven, day and night; the screens come in several styles (5.0), and
           the film is not re-made for each (owner, 2 Oct 2026). -->
      <p class="muted-note tour-look">Your screens may look different. Pick a style you like in Settings.</p>
    </div>
  `;
  const video = backdrop.querySelector('video');
  let release = () => {};
  const close = () => {
    video.pause();
    document.removeEventListener('keydown', onKey);
    release();
    backdrop.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  video.addEventListener('error', () => {
    backdrop.querySelector('.tour-offline').hidden = false;
  });
  backdrop.querySelector('.tour-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  release = holdFocus(backdrop, { initial: '.tour-close' });
}

// Passing Kawach on: the phone's own share menu with the welcome page, or
// the link copied where there is no share menu.
export async function shareKawach() {
  const text = 'Kawach shows what you can safely spend this month. Free, and your data stays on your phone.';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Kawach', text, url: SHARE_URL });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
    showToast('Link copied. Paste it in a message.');
  } catch (err) {
    // Closing the share menu is not a problem worth mentioning.
    if (err && err.name === 'AbortError') return;
    showToast(`Share it with this link: ${SHARE_URL}`);
  }
}
