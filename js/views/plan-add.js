/* 7.14: "Add a commitment" as three short questions, one at a time, in a sheet.
 *
 * Why: the owner called the old form "so confusing and so much chaos" (18 Nov 2026). It asked eleven things at once. This asks what it is,
 * how much and how often, and whether it must be paid on a day, and keeps everything else behind "More details". Nothing is saved until
 * the last step, and it is saved by the same function the edit form uses (saveFixed in plan.js), so the two can never disagree about a
 * record. Drawn first as mockups/7.18-plan-steps. */
import { formatRupees } from '../format.js';
import { FREQUENCIES, DEFAULT_FREQUENCY, hasDueDate, toMonthly, toYearly } from '../frequency.js';
import { COMMON_COSTS, RENEWAL_MONTHS } from '../calendar.js';
import { sortAccounts, sortCategories } from '../list-order.js';
import { escapeHtml } from '../ui.js';
import { holdFocus } from '../overlay.js';
import { dragToClose } from '../sheet-drag.js';
import { paiseFrom } from '../records.js';

const QUICK = ['monthly', 'quarterly', 'yearly'];
const FIRST_PICKS = 8;

/* Paid from, last payment, the words on the statement, category: the fields most people never touch. One copy, used by the edit form and by
 * the Add sheet (the classes are the edit form's own, which the save reads). */
export function moreFields(categories, accounts, v = {}) {
  const selected = (a, b) => (a === b ? 'selected' : '');
  const list = sortAccounts(accounts);
  const options = (type) => list.filter((a) => a.type === type).map((a) => `<option value="${a.id}" ${selected(a.id, v.accountId)}>${escapeHtml(a.label)}</option>`).join('');
  return `<label class="field">
        <span>Paid from</span>
        <select class="ff-account">
          <option value="">Any bank account</option>
          <option value="cash" ${selected('cash', v.accountId)}>Cash (from your ATM money)</option>
          ${options('bank')}
          ${options('card')}
        </select>
      </label>
      <label class="field">
        <span>Last payment <span class="muted">(optional - for an EMI or loan that ends)</span></span>
        <input type="month" class="ff-end" value="${v.endDate ? v.endDate.slice(0, 7) : ''}">
      </label>
      <label class="field">
        <span>Its line on the bank or card statement contains <span class="muted">(optional, e.g. "Home Loan EMI", "DYSON")</span></span>
        <input type="text" class="ff-match" autocomplete="off" spellcheck="false" placeholder="Words from its statement line" value="${escapeHtml(v.matchText || '')}">
      </label>
      <p class="muted-note">Words in its payment, so it isn't counted twice. Leave empty to match by amount.</p>
      <label class="field">
        <span>Category <span class="muted">(so this spend isn't counted twice)</span></span>
        <select class="ff-category">
          <option value="">None</option>
          ${sortCategories(categories).map((c) => `<option value="${c.id}" ${selected(c.id, v.categoryId)}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </label>`;
}

/* `taken`: the names already on the list (a quick pick is not offered twice). `save(values)` writes the record and returns it;
 * `done(record)` is told once it is saved, and the sheet has closed. */
export function openAddSheet({ inBusiness, categories, accounts, taken, save, done }) {
  document.querySelector('#plan-add-sheet')?.remove();
  const title = inBusiness ? 'Add a fixed cost' : 'Add a commitment';
  const st = { step: 1, frequency: DEFAULT_FREQUENCY, aside: false, other: false, all: false, saving: false };
  const used = new Set(taken.map((l) => l.toLowerCase()));
  const picks = [...(inBusiness ? [] : [{ label: 'Rent', frequency: 'monthly' }]), { label: 'EMI', frequency: 'monthly' }, ...(inBusiness ? COMMON_COSTS.business : COMMON_COSTS.home)].filter((c) => !used.has(c.label.toLowerCase()));

  const wrap = document.createElement('div');
  wrap.id = 'plan-add-sheet';
  wrap.className = 'k';
  wrap.innerHTML = `<div class="ps-back" data-close></div>
    <form class="ps-sheet" role="dialog" aria-modal="true" aria-label="${title}" tabindex="-1" novalidate>
      <div class="k-sheet__grip ps-grip"></div>
      <div class="ps-top">
        <button type="button" class="ps-bk" data-back>Back</button>
        <div class="ps-mid"><span class="ps-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="ps-count" aria-live="polite"></span></div>
        <button type="button" class="ps-x" data-close>Close</button>
      </div>
      <section class="ps-step" data-step="1">
        <h3>What is it?<small>Pick one, or type your own.</small></h3>
        <label class="ps-field"><span class="vh">Name</span><input type="text" class="ps-label" maxlength="60" autocomplete="off" enterkeyhint="next" placeholder="e.g. School fee, House loan EMI"></label>
        <div class="ps-chips ps-picks"></div>
      </section>
      <section class="ps-step" data-step="2" hidden>
        <h3>How much, and how often?<small class="ps-name"></small></h3>
        <label class="ps-field big"><span class="cur" aria-hidden="true">₹</span><span class="vh">Amount each time</span><input type="number" class="ps-amount" inputmode="decimal" step="0.01" min="0.01" enterkeyhint="next" placeholder="0"></label>
        <div class="ps-chips ps-freq"></div>
        <select class="ps-freq-all" aria-label="How often" hidden>${Object.entries(FREQUENCIES).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('')}</select>
        <p class="ps-preview" hidden></p>
      </section>
      <section class="ps-step" data-step="3" hidden>
        <h3>Must it be paid on a day?<small class="ps-sum"></small></h3>
        <div class="ps-opt on" data-kind="must">
          <label><input type="radio" name="ps-kind" value="must" checked><span class="rd"></span><b>Yes, it has a day</b><span class="d">Rent, an EMI, a bill. Kawach tells you when it is late.</span></label>
          <div class="ps-day"><span>Day of the month</span><input type="number" class="ps-dayin" inputmode="numeric" min="1" max="31" step="1" placeholder="5" aria-label="Day of the month it goes out"></div>
        </div>
        <div class="ps-opt" data-kind="aside">
          <label><input type="radio" name="ps-kind" value="aside"><span class="rd"></span><b>No, I just keep it aside</b><span class="d">Groceries, fuel. Spend all, some or none. Never late.</span></label>
        </div>
        <label class="ps-when" hidden><span>Next due <small>(optional)</small></span><input type="date" class="ps-renewin"></label>
      </section>
      <p class="ps-err" role="alert" hidden></p>
      <button type="submit" class="ps-go">Next</button>
      <details class="ps-more" hidden>
        <summary>More details</summary>
        ${moreFields(categories, accounts)}
      </details>
    </form>`;
  document.body.append(wrap);

  const $ = (s) => wrap.querySelector(s);
  const form = $('.ps-sheet');
  const labelEl = $('.ps-label');
  const amountEl = $('.ps-amount');
  const dayEl = $('.ps-dayin');
  const goEl = $('.ps-go');
  const money = () => paiseFrom(amountEl.value);
  const name = () => labelEl.value.trim();
  const say = (msg, el) => {
    const p = $('.ps-err');
    p.textContent = msg;
    p.hidden = !msg;
    if (msg && el) el.focus();
  };
  // The day is asked only when it means something: a monthly cost that must be paid. A renewal has a date instead, and money set aside
  // has no day to be late on (the same rule the edit form has always followed).
  const dayApplies = () => hasDueDate(st.frequency) && !RENEWAL_MONTHS[st.frequency] && !(st.frequency === 'monthly' && st.aside);

  const drawPicks = () => {
    const now = name().toLowerCase();
    const list = st.all ? picks : picks.slice(0, FIRST_PICKS);
    $('.ps-picks').innerHTML =
      list.map((c) => `<button type="button" class="ps-chip${now === c.label.toLowerCase() ? ' on' : ''}" aria-pressed="${now === c.label.toLowerCase()}" data-label="${escapeHtml(c.label)}" data-frequency="${c.frequency}">${escapeHtml(c.label)}</button>`).join('') +
      (!st.all && picks.length > FIRST_PICKS ? '<button type="button" class="ps-chip" data-more>More…</button>' : '');
  };
  const drawFreq = () => {
    $('.ps-freq').innerHTML =
      QUICK.map((k) => `<button type="button" class="ps-chip${!st.other && st.frequency === k ? ' on' : ''}" aria-pressed="${!st.other && st.frequency === k}" data-f="${k}">${FREQUENCIES[k].label}</button>`).join('') +
      `<button type="button" class="ps-chip${st.other ? ' on' : ''}" aria-pressed="${st.other}" data-other>Other</button>`;
    const all = $('.ps-freq-all');
    all.hidden = !st.other;
    all.value = st.frequency;
  };
  const drawPreview = () => {
    const minor = money();
    const p = $('.ps-preview');
    p.hidden = minor == null || st.frequency === 'monthly';
    if (!p.hidden) p.innerHTML = `That's <strong>${formatRupees(toMonthly(minor, st.frequency))} a month</strong> - ${formatRupees(toYearly(minor, st.frequency))} a year.`;
  };
  const drawWhen = () => {
    $('.ps-day').hidden = !dayApplies();
    $('.ps-when').hidden = !RENEWAL_MONTHS[st.frequency];
    wrap.querySelectorAll('.ps-opt').forEach((o) => o.classList.toggle('on', (o.dataset.kind === 'aside') === st.aside));
  };
  const draw = () => {
    wrap.querySelectorAll('.ps-step').forEach((s) => (s.hidden = Number(s.dataset.step) !== st.step));
    wrap.querySelectorAll('.ps-dots i').forEach((d, i) => d.classList.toggle('on', i < st.step));
    $('.ps-count').textContent = `${st.step} of 3`;
    $('.ps-bk').style.visibility = st.step > 1 ? 'visible' : 'hidden';
    $('.ps-more').hidden = st.step !== 3;
    // A long name would wrap the button onto two lines; the name is already in the line above it.
    goEl.textContent = st.step < 3 ? 'Next' : name().length <= 22 ? `Add ${name()}` : inBusiness ? 'Add fixed cost' : 'Add commitment';
    $('.ps-name').textContent = name();
    const minor = money();
    $('.ps-sum').textContent = minor == null ? name() : `${name()} · ${formatRupees(minor)} ${FREQUENCIES[st.frequency].short}`;
    drawPicks();
    drawFreq();
    drawPreview();
    drawWhen();
  };

  // What must be right before the sheet moves on. Said once, in words, beside the field to fix.
  const check = (step) => {
    if (step === 1 && !name()) return say('Type a name, or pick one above.', labelEl), false;
    if (step === 2 && money() == null) return say('Enter how much each time, more than zero.', amountEl), false;
    if (step === 3 && dayApplies()) {
      const d = parseInt(dayEl.value, 10);
      if (!Number.isInteger(d) || d < 1 || d > 31) return say('Which day of the month does it go out? 1 to 31.', dayEl), false;
    }
    say('');
    return true;
  };

  let release = () => {};
  const vv = window.visualViewport;
  // The keyboard covers the bottom of the screen: lift the sheet above it and keep it no taller than what is left.
  const fit = () => {
    if (!vv) return;
    // A gap under about 120 px is a scrollbar or a browser bar, not a keyboard; lifting the sheet by it left a strip of page under the sheet.
    const gap = Math.round(window.innerHeight - vv.height - vv.offsetTop);
    const kb = gap > 120 ? gap : 0;
    wrap.style.setProperty('--ps-kb', `${kb}px`);
    wrap.style.setProperty('--ps-vh', kb ? `${Math.round(vv.height)}px` : '100dvh');
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();
  const close = () => {
    release();
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    window.removeEventListener('hashchange', close);
    document.removeEventListener('keydown', onKey);
    wrap.remove();
  };
  // On the document, not the sheet: focus can be on the page behind it after a tap on the dimmed area, and Escape must still close.
  const onKey = (e) => e.key === 'Escape' && close();
  window.addEventListener('hashchange', close);
  document.addEventListener('keydown', onKey);
  wrap.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', () => {
      // A tap beside the sheet while something is typed would throw it away; only the Close button does that.
      if (el.classList.contains('ps-back') && (name() || amountEl.value)) return;
      close();
    })
  );
  $('[data-back]').addEventListener('click', () => {
    if (st.step > 1) st.step--;
    say('');
    draw();
  });

  labelEl.addEventListener('input', () => {
    say('');
    drawPicks();
  });
  amountEl.addEventListener('input', () => {
    say('');
    drawPreview();
  });
  dayEl.addEventListener('input', () => say(''));
  $('.ps-picks').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.more !== undefined) {
      st.all = true;
      drawPicks();
      return;
    }
    labelEl.value = b.dataset.label;
    st.frequency = b.dataset.frequency;
    st.other = !QUICK.includes(st.frequency);
    say('');
    drawPicks();
  });
  $('.ps-freq').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.other !== undefined) st.other = true;
    else {
      st.frequency = b.dataset.f;
      st.other = false;
    }
    drawFreq();
    drawPreview();
    drawWhen();
  });
  $('.ps-freq-all').addEventListener('change', (e) => {
    st.frequency = e.target.value;
    st.other = !QUICK.includes(st.frequency);
    drawFreq();
    drawPreview();
    drawWhen();
  });
  wrap.querySelectorAll('input[name=ps-kind]').forEach((r) =>
    r.addEventListener('change', () => {
      st.aside = r.value === 'aside' && r.checked;
      say('');
      drawWhen();
    })
  );
  // The whole card is the choice, not only its first line.
  wrap.querySelectorAll('.ps-opt').forEach((o) =>
    o.addEventListener('click', (e) => {
      if (!e.target.closest('input, label')) o.querySelector('input[type=radio]').click();
    })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (st.saving || !check(st.step)) return;
    if (st.step < 3) {
      st.step++;
      draw();
      if (st.step === 2) amountEl.focus({ preventScroll: true });
      return;
    }
    if (!name() || money() == null) {
      st.step = !name() ? 1 : 2;
      draw();
      check(st.step);
      return;
    }
    st.saving = true;
    goEl.disabled = true;
    try {
      const record = await save({
        label: name(),
        amount: money(),
        frequency: st.frequency,
        aside: st.aside,
        day: dayApplies() ? parseInt(dayEl.value, 10) : NaN,
        renewsOn: RENEWAL_MONTHS[st.frequency] ? $('.ps-renewin').value || null : null,
        categoryId: $('.ff-category').value,
        accountId: $('.ff-account').value,
        matchText: $('.ff-match').value.trim(),
        endMonth: $('.ff-end').value,
      });
      close();
      done(record);
    } catch {
      st.saving = false;
      goEl.disabled = false;
      say('It could not be saved. Try again.');
    }
  });

  draw();
  dragToClose(form, close, $('.ps-back'));
  // A keyboard on a phone would hide the quick picks the moment the sheet opens, so only a mouse or keyboard starts in the name box.
  release = holdFocus(wrap, { initial: matchMedia('(pointer: fine)').matches ? labelEl : form });
}
