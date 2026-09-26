/* How it looks: the person choosing their own app.
 *
 * One card per choice, the options as plain radio buttons with a line saying
 * what each actually does. No preview panes: two of the three choices are
 * about other screens, and a postage-stamp preview of a screen is a worse
 * answer than the sentence describing it plus going and looking.
 */
import { CHOICES, appearance, setAppearance } from '../appearance.js';
import { showToast } from '../toast.js';

export async function render(container) {
  container.innerHTML = `
    <p class="group-subtitle">Your choices, kept on this device. None of this changes your money, and none of it leaves the phone.</p>
    ${Object.entries(CHOICES).map(([name, spec]) => card(name, spec)).join('')}
  `;
  wire(container);
}

function card(name, spec) {
  const current = appearance(name);
  return `
    <h3>${spec.label}</h3>
    <div class="totals-card look-card">
      <p class="group-subtitle look-q">${spec.question}</p>
      ${spec.options
        .map(
          (o) => `
        <label class="look-option${o.value === current ? ' chosen' : ''}">
          <input type="radio" name="look-${name}" value="${o.value}"${o.value === current ? ' checked' : ''}>
          <span class="look-body">
            <span class="look-label">${o.label}</span>
            <span class="muted-note">${o.note}</span>
          </span>
        </label>`
        )
        .join('')}
    </div>`;
}

function wire(container) {
  container.addEventListener('change', (e) => {
    const input = e.target.closest('input[type="radio"]');
    if (!input) return;
    const name = input.name.replace(/^look-/, '');
    if (!setAppearance(name, input.value)) {
      showToast('Could not save that on this device');
      return;
    }
    // Mark the chosen row without redrawing the screen: a redraw here would
    // scroll the person away from the choice they just made.
    container.querySelectorAll(`input[name="${input.name}"]`).forEach((other) => {
      other.closest('.look-option').classList.toggle('chosen', other === input);
    });
    const where = CHOICES[name].where;
    showToast(where ? `Saved. Open ${where} to see it.` : 'Saved');
  });
}
