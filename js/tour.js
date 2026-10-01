// The tour: a minute of what the app is for, played over the app. It is a
// page of the app itself (tour.html, js/tour-film.js), drawn live from the
// app's own stylesheets with made-up figures, so it is kept for offline use
// like every other screen and asks nothing of the network.
import { icon } from './icons.js';
import { showToast } from './toast.js';

const TOUR_PAGE = './tour.html';
const SHARE_URL = 'https://getkawach.com/welcome.html';

export function playTour() {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop tour-backdrop';
  backdrop.innerHTML = `
    <div class="tour-box" role="dialog" aria-modal="true" aria-label="Kawach in one minute">
      <button type="button" class="icon-btn tour-close" aria-label="Close">${icon('close')}</button>
      <iframe class="tour-video" src="${TOUR_PAGE}" title="Kawach in one minute"></iframe>
    </div>
  `;
  const frame = backdrop.querySelector('iframe');
  const close = () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('message', onMessage);
    backdrop.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  // Escape pressed inside the tour reaches the tour, not this page; it says so.
  const onMessage = (e) => {
    if (e.origin === location.origin && e.source === frame.contentWindow && e.data === 'kawach-tour-close') close();
  };
  // Focus inside the tour, so Space plays and pauses straight away.
  frame.addEventListener('load', () => frame.contentWindow.focus());
  backdrop.querySelector('.tour-close').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('message', onMessage);
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
