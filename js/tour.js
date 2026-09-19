// The one-minute tour: a short video of setting up, played over the app.
// It is served from the app's own address (media/), never a video site, so
// watching it tells nobody anything. It isn't kept for offline use - a video
// is too big to store on every phone for one viewing.
import { icon } from './icons.js';
import { showToast } from './toast.js';

const TOUR_VIDEO = './media/kawach-tour.mp4';
const SHARE_URL = 'https://getkawach.com/welcome.html';

export function playTour() {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop tour-backdrop';
  backdrop.innerHTML = `
    <div class="tour-box" role="dialog" aria-modal="true" aria-label="How to set up Kawach">
      <button type="button" class="icon-btn tour-close" aria-label="Close">${icon('close')}</button>
      <video class="tour-video" src="${TOUR_VIDEO}" poster="./media/kawach-tour.jpg" controls autoplay playsinline></video>
      <p class="muted-note tour-offline" hidden>The tour needs an internet connection.</p>
    </div>
  `;
  const video = backdrop.querySelector('video');
  const close = () => {
    video.pause();
    document.removeEventListener('keydown', onKey);
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
