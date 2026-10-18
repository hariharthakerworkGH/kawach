import { getAll, put, remove, newId } from '../db.js';
import { formatRupees, formatDateNice } from '../format.js';
import { isoLocal, FREQUENCIES, frequencyShort } from '../frequency.js';
import { isLiveCommitment } from '../commitments.js';
import { activeSpace, commitmentInSpace } from '../business.js';
import { categoryStyle } from '../category-style.js';
import { sortAccounts } from '../list-order.js';
import { redraw } from '../redraw.js';
import { askConfirm } from '../dialog.js';
import { showToast } from '../toast.js';
import { escapeHtml, escapeAttr, sectionHead } from '../ui.js';
import { KINDS, PREMIUM_EVERY, isPolicy, kindOf, kindLabel, policyDue, policyState, stateLine, stateNote, markPaid, fyOf, paidInYear, yearlyPremium, maturitiesAhead, buildPolicy, familySummary, graceDays } from '../policies.js';

// Policies (5.84): health, life, term and vehicle insurance, typed in once. Each is a fixed cost on Plan (so the
// budget, the months ahead and the reminders already know it) with the details you need at a hospital or after a
// death kept beside it. See js/policies.js. Everything stays on the phone; nothing is checked with the insurer.

// What is open on this screen: the list, one policy, or its form. Back steps from the last two to the list.
let mode = 'list';
let openId = null;
let returnTo = 'list';
let presetKind = 'health';
let host = null;

const todayIso = () => isoLocal(new Date());

// A policy's details, one line each, only the ones that were typed.
function facts(r, today) {
  const p = r.policy;
  const s = policyState(r, today);
  const fy = fyOf(today);
  const freq = r.frequency;
  const call = p.helpline ? `<a href="tel:${escapeAttr(p.helpline.replace(/[^\d+]/g, ''))}">${escapeHtml(p.helpline)}</a>` : '';
  const rows = [
    ['Where it stands', escapeHtml(stateLine(s, r).text), stateLine(s, r).tone],
    ['Kind', escapeHtml(kindLabel(r))],
    p.insurer && ['Insurer', escapeHtml(p.insurer)],
    p.number && ['Policy number', escapeHtml(p.number)],
    p.covered && ['Covers', escapeHtml(p.covered)],
    p.sum && [p.kind === 'health' || p.kind === 'vehicle' ? 'Sum insured' : 'Sum assured', formatRupees(p.sum)],
    ['Premium', `${formatRupees(r.amount)} ${frequencyShort(freq)}`],
    freq !== 'yearly' && ['A year', formatRupees(yearlyPremium(r))],
    policyDue(r) && ['Next due', formatDateNice(policyDue(r))],
    ['Grace period', graceDays(r) ? `${graceDays(r)} days` : 'none: it runs out on the date'],
    p.lastPaid && ['Last paid', formatDateNice(p.lastPaid)],
    [`Paid in ${fy.label}`, formatRupees(paidInYear(r, fy))],
    p.maturityOn && ['Pays back', `${formatDateNice(p.maturityOn)}${p.maturityAmount ? ` · about ${formatRupees(p.maturityAmount)}` : ''}`],
    p.nominee && ['Nominee', escapeHtml(p.nominee)],
    call && ['Helpline', call],
    p.agent && ['Agent', escapeHtml(p.agent)],
    p.note && ['Note', escapeHtml(p.note)],
  ].filter(Boolean);
  return rows.map(([k, v, tone]) => `<div class="totals-row pol-fact"><span>${k}</span><span class="${tone ? `pol-tone is-${tone}` : ''}">${v}</span></div>`).join('');
}

function rowHtml(r, today) {
  const { icon: mark, color } = categoryStyle('insurance');
  const line = stateLine(policyState(r, today), r);
  return `<button type="button" class="k-row pol-row" data-id="${r.id}">
    <span class="k-icon" style="--k-tint:${color}">${mark}</span>
    <span class="k-row__body"><span class="k-row__title">${escapeHtml(r.label)}</span><span class="k-row__meta pol-meta is-${line.tone}">${escapeHtml(kindLabel(r))} · ${escapeHtml(line.text)}</span></span>
    <span class="k-row__value">${formatRupees(r.amount)}<span class="muted freq-per-month">${frequencyShort(r.frequency)}</span></span>
  </button>`;
}

function listHtml(policies, today) {
  if (!policies.length) {
    return `<p class="muted-note">Add your health, life or vehicle insurance once. Kawach keeps the details in one place and tells you before a premium is due.</p>
      <button type="button" class="btn-primary" id="pol-add">Add a policy</button>`;
  }
  const yearly = policies.reduce((t, r) => t + yearlyPremium(r), 0);
  const coming = maturitiesAhead(policies, today, 60);
  return `<div class="totals-card pol-list">
      <div class="k-row pol-total"><span class="k-row__body"><span class="k-row__title">${policies.length} ${policies.length === 1 ? 'policy' : 'policies'}</span></span><span class="k-row__value">${formatRupees(yearly)} a year</span></div>
      ${policies.map((r) => rowHtml(r, today)).join('')}
    </div>
    <button type="button" class="btn-primary" id="pol-add">Add a policy</button>
    <button type="button" class="btn-tiny btn-block" id="pol-share" style="margin-top:var(--space-xs)">Share a summary for your family</button>
    ${
      coming.length
        ? `${sectionHead('Money coming')}<div class="totals-card">${coming
            .map((m) => `<div class="k-row"><span class="k-row__body"><span class="k-row__title">${escapeHtml(m.item.label)} pays back</span><span class="k-row__meta">${formatDateNice(m.on)} · counted only when it arrives</span></span><span class="k-row__value">${m.amount ? formatRupees(m.amount) : ''}</span></div>`)
            .join('')}</div>`
        : ''
    }`;
}

function detailHtml(r, today) {
  return `${sectionHead(escapeHtml(r.label))}
    <div class="totals-card pol-card">${facts(r, today)}</div>
    ${stateNote(policyState(r, today), r) ? `<p class="muted-note pol-note">${escapeHtml(stateNote(policyState(r, today), r))}</p>` : ''}
    <button type="button" class="btn-primary" id="pol-paid">Premium paid</button>
    <button type="button" class="btn-tiny btn-block" id="pol-edit" style="margin-top:var(--space-xs)">Edit</button>`;
}

const selected = (a, b) => (a === b ? 'selected' : '');
const rupeesText = (paise) => (paise ? (paise / 100).toFixed(2).replace(/\.00$/, '') : '');

function formHtml(item, accounts) {
  const p = (item && item.policy) || {};
  const kind = item ? kindOf(item) : presetKind;
  const freqNow = item ? item.frequency : 'yearly';
  const due = item ? policyDue(item) || '' : '';
  return `${sectionHead(item ? 'Edit policy' : 'Add a policy')}
    <form class="pol-form" autocomplete="off">
      <label class="field"><span>Kind</span>
        <select class="pf-kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${selected(k, kind)}>${v.label}</option>`).join('')}</select>
      </label>
      <label class="field"><span>What you call it</span>
        <input type="text" class="pf-name" placeholder="Family health cover" value="${escapeAttr((item && item.label) || '')}" required>
      </label>
      <label class="field"><span>Insurer <span class="muted">(optional)</span></span>
        <input type="text" class="pf-insurer" value="${escapeAttr(p.insurer || '')}">
      </label>
      <label class="field"><span>Policy number <span class="muted">(optional)</span></span>
        <input type="text" class="pf-number" autocapitalize="characters" value="${escapeAttr(p.number || '')}">
      </label>
      <label class="field"><span>Premium each time</span>
        <input type="number" class="pf-amount" inputmode="decimal" step="0.01" min="0.01" placeholder="24000" value="${rupeesText(item && item.amount)}" required>
      </label>
      <label class="field"><span>How often</span>
        <select class="pf-frequency">${Object.keys(PREMIUM_EVERY).map((k) => `<option value="${k}" ${selected(k, freqNow)}>${FREQUENCIES[k].label}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Next premium due</span>
        <input type="date" class="pf-due" value="${escapeAttr(due)}">
      </label>
      <details class="section-fold pol-more" ${p.covered || p.sum || p.nominee || p.helpline || p.agent ? 'open' : ''}>
        <summary>Cover, nominee and who to call</summary>
        <label class="field"><span>Who it covers</span><input type="text" class="pf-covered" placeholder="Self, spouse, two children" value="${escapeAttr(p.covered || '')}"></label>
        <label class="field"><span>Sum insured or assured</span><input type="number" class="pf-sum" inputmode="decimal" min="0" placeholder="1000000" value="${rupeesText(p.sum)}"></label>
        <label class="field"><span>Nominee</span><input type="text" class="pf-nominee" value="${escapeAttr(p.nominee || '')}"></label>
        <label class="field"><span>Helpline</span><input type="text" inputmode="tel" class="pf-helpline" value="${escapeAttr(p.helpline || '')}"></label>
        <label class="field"><span>Agent</span><input type="text" class="pf-agent" value="${escapeAttr(p.agent || '')}"></label>
      </details>
      <details class="section-fold pol-more" ${p.maturityOn || p.graceDays != null || p.note || (item && (item.matchText || item.accountId)) ? 'open' : ''}>
        <summary>Pays back, grace period and more</summary>
        <label class="field"><span>Pays back on <span class="muted">(a plan that matures)</span></span><input type="date" class="pf-mat-on" value="${escapeAttr(p.maturityOn || '')}"></label>
        <label class="field"><span>Pays back about</span><input type="number" class="pf-mat-amt" inputmode="decimal" min="0" placeholder="500000" value="${rupeesText(p.maturityAmount)}"></label>
        <label class="field"><span>Grace period in days <span class="muted">(usually 30: check your policy)</span></span><input type="number" class="pf-grace" inputmode="numeric" min="0" max="120" placeholder="${KINDS[kind].grace}" value="${p.graceDays != null ? p.graceDays : ''}"></label>
        <label class="field"><span>Paid from</span>
          <select class="pf-account"><option value="">Any bank account</option>
            ${sortAccounts(accounts).filter((a) => a.type === 'bank' || a.type === 'card').map((a) => `<option value="${a.id}" ${selected(a.id, item && item.accountId)}>${escapeHtml(a.label)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Its line on the bank statement contains <span class="muted">(optional)</span></span><input type="text" class="pf-match" spellcheck="false" placeholder="LIC OF INDIA" value="${escapeAttr((item && item.matchText) || '')}"></label>
        <label class="field"><span>Note</span><input type="text" class="pf-note" value="${escapeAttr(p.note || '')}"></label>
      </details>
      <button type="submit" class="btn-primary">${item ? 'Save' : 'Add'}</button>
      <button type="button" class="btn-tiny pf-cancel btn-block" style="margin-top:var(--space-xs)">Cancel</button>
      ${item ? `<button type="button" class="btn-tiny pf-remove btn-block" style="margin-top:var(--space-xs);color:var(--out)">Remove this policy</button>` : ''}
    </form>`;
}

async function shareText(text) {
  if (!text) return;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Insurance summary', text });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied. Paste it into a message.');
  } catch (e) {
    showToast('Could not copy it from here');
  }
}

const again = (container) => redraw(container, () => render(container));

// `params` is an object when the screen is opened (a tap, the back arrow) and undefined when the screen redraws itself, which
// must keep what is open.
export async function render(container, params) {
  host = container;
  if (params) {
    openId = params.open || null;
    mode = params.open ? 'detail' : params.add ? 'form' : 'list';
    returnTo = 'list';
    if (params.add) presetKind = KINDS[params.add] ? params.add : 'health';
  }
  const [recurring, accounts, space] = await Promise.all([getAll('recurring'), getAll('accounts'), activeSpace()]);
  const today = todayIso();
  const inLane = commitmentInSpace(space);
  const all = recurring.filter((r) => isPolicy(r) && isLiveCommitment(r) && inLane(r));
  const policies = [...all].sort((a, b) => (policyDue(a) || '9999') < (policyDue(b) || '9999') ? -1 : 1);
  const item = openId ? recurring.find((r) => r.id === openId && isPolicy(r)) : null;
  if ((mode === 'detail' || (mode === 'form' && openId)) && !item) {
    mode = 'list';
    openId = null;
  }

  container.innerHTML = `<div class="pol">${mode === 'detail' ? detailHtml(item, today) : mode === 'form' ? formHtml(item, accounts) : listHtml(policies, today)}</div>`;

  container.querySelectorAll('.pol-row').forEach((btn) =>
    btn.addEventListener('click', () => {
      openId = btn.dataset.id;
      mode = 'detail';
      again(container);
    })
  );
  container.querySelector('#pol-add')?.addEventListener('click', () => {
    openId = null;
    mode = 'form';
    returnTo = 'list';
    again(container);
  });
  container.querySelector('#pol-share')?.addEventListener('click', () => shareText(familySummary(policies, today)));

  container.querySelector('#pol-edit')?.addEventListener('click', () => {
    mode = 'form';
    returnTo = 'detail';
    again(container);
  });
  container.querySelector('#pol-paid')?.addEventListener('click', async () => {
    const next = markPaid(item, today);
    const ok = await askConfirm({
      title: 'Premium paid?',
      message: `${item.label}: ${formatRupees(item.amount)} paid today. The next one is due ${formatDateNice(policyDue(next))}. This only updates the policy here; the payment itself is added from Add or a statement.`,
      confirmLabel: 'Yes, paid',
    });
    if (!ok) return;
    await put('recurring', next);
    showToast(`Next premium ${formatDateNice(policyDue(next))}`);
    again(container);
  });

  const form = container.querySelector('.pol-form');
  if (form) {
    const q = (s) => form.querySelector(s);
    const kindEl = q('.pf-kind');
    kindEl.addEventListener('change', () => {
      q('.pf-grace').placeholder = String(KINDS[kindEl.value].grace);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rec = buildPolicy({
        existing: item,
        id: `fixed-${newId()}`,
        space: space === 'home' ? null : space,
        fields: {
          kind: kindEl.value,
          name: q('.pf-name').value,
          insurer: q('.pf-insurer').value,
          number: q('.pf-number').value,
          amount: q('.pf-amount').value,
          frequency: q('.pf-frequency').value,
          dueOn: q('.pf-due').value,
          covered: q('.pf-covered').value,
          sum: q('.pf-sum').value,
          nominee: q('.pf-nominee').value,
          helpline: q('.pf-helpline').value,
          agent: q('.pf-agent').value,
          maturityOn: q('.pf-mat-on').value,
          maturityAmount: q('.pf-mat-amt').value,
          graceDays: q('.pf-grace').value,
          accountId: q('.pf-account').value,
          matchText: q('.pf-match').value,
          note: q('.pf-note').value,
        },
      });
      if (!rec) {
        showToast('Add a name and the premium');
        return;
      }
      await put('recurring', rec);
      openId = rec.id;
      mode = 'detail';
      again(container);
    });
    q('.pf-cancel').addEventListener('click', () => {
      mode = returnTo === 'detail' && openId ? 'detail' : 'list';
      if (mode === 'list') openId = null;
      again(container);
    });
    q('.pf-remove')?.addEventListener('click', async () => {
      const ok = await askConfirm({ title: 'Remove this policy?', message: `"${item.label}" comes off your plan and its details are deleted from this phone. Payments already saved are not touched.`, confirmLabel: 'Remove', danger: true });
      if (!ok) return;
      await remove('recurring', item.id);
      openId = null;
      mode = 'list';
      again(container);
    });
  }
}

// Back closes what is open on this screen before it leaves it (app.js asks).
export function onBack() {
  if (mode === 'list') return false;
  mode = returnTo === 'detail' && mode === 'form' && openId ? 'detail' : 'list';
  if (mode === 'list') openId = null;
  if (host) again(host);
  return true;
}
