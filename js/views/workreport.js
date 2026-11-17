import { getAll, put } from '../db.js';
import { formatRupees, formatDateNice } from '../format.js';
import { isoLocal } from '../frequency.js';
import { redraw } from '../redraw.js';
import { showToast } from '../toast.js';
import { escapeHtml, sectionHead } from '../ui.js';
import { saveFile } from '../ca-export.js';
import { workReport, oldestWaiting, reportCsv } from '../work-report.js';

// Work costs by kind for a stretch of dates, each with a tick for "handed in to the company" (js/work-report.js).
// The dates are kept while the app is open so going into a payment and back does not lose them.

let range = null;

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

const again = (container) => redraw(container, () => render(container));

function groupHtml(g) {
  return `<div class="lg-card lg-clist wr-group">
      <div class="hv-clabel"><span>${escapeHtml(g.name)}${g.guessed ? ' <i class="wr-guess">some placed by name</i>' : ''}</span><b>${formatRupees(g.total)}</b></div>
      ${g.rows
        .map(
          (r) => `<label class="lg-row wr-row">
            <input type="checkbox" class="wr-tick" data-id="${escapeHtml(r.id)}" ${r.submitted ? 'checked' : ''} aria-label="Handed in: ${escapeHtml(r.label)}">
            <span class="n">${escapeHtml(r.label)}<i>${formatDateNice(r.date)}${r.account ? ` · ${escapeHtml(r.account)}` : ''}</i></span>
            <span class="amt">${formatRupees(r.amount)}</span>
          </label>`
        )
        .join('')}
    </div>`;
}

export async function render(container) {
  const [transactions, categories, accounts] = await Promise.all([getAll('transactions'), getAll('categories'), getAll('accounts')]);
  const today = isoLocal(new Date());
  // Opens on what still needs checking: from the oldest cost not handed in, to today.
  if (!range) range = { from: oldestWaiting(transactions) || addDays(today, -30), to: today };
  if (range.from > range.to) range = { from: range.to, to: range.from };
  const report = workReport(transactions, categories, accounts, range);
  const chip = (id, label) => `<button type="button" class="btn-tiny wr-chip" data-range="${id}">${label}</button>`;
  container.innerHTML = `<div class="wr">
    ${sectionHead('Work costs')}
    <div class="wr-dates">
      <label class="field"><span>From</span><input type="date" id="wr-from" value="${range.from}" max="${today}"></label>
      <label class="field"><span>To</span><input type="date" id="wr-to" value="${range.to}"></label>
    </div>
    <div class="wr-chips">${chip('waiting', 'Not handed in')}${chip('30', 'Last 30 days')}${chip('month', 'This month')}${chip('all', 'All')}</div>
    ${
      report.count
        ? `<div class="lg-card wr-total">
        <div class="lg-row"><span class="n">${report.count} work cost${report.count === 1 ? '' : 's'}<i>${formatDateNice(range.from)} to ${formatDateNice(range.to)}</i></span><span class="amt">${formatRupees(report.total)}</span></div>
        <div class="lg-row"><span class="n">Handed in<i>${report.handedInCount} of ${report.count}</i></span><span class="amt">${formatRupees(report.handedIn)}</span></div>
        <div class="lg-row"><span class="n">Not handed in yet<i>${report.waitingCount} bill${report.waitingCount === 1 ? '' : 's'} to check</i></span><span class="amt">${formatRupees(report.waiting)}</span></div>
      </div>
      ${report.groups.map(groupHtml).join('')}
      <div class="wr-actions">
        ${report.waitingCount ? '<button type="button" class="btn-secondary" id="wr-all">Mark all handed in</button>' : ''}
        <button type="button" class="btn-secondary" id="wr-csv">Save as a sheet</button>
      </div>`
        : `<p class="muted-note">No work costs between these dates. Switch on "Work cost" when you add a payment your employer will pay back, and it shows up here by kind.</p>`
    }
  </div>`;

  const setRange = (next) => {
    range = next;
    again(container);
  };
  container.querySelector('#wr-from').addEventListener('change', (e) => e.target.value && setRange({ ...range, from: e.target.value }));
  container.querySelector('#wr-to').addEventListener('change', (e) => e.target.value && setRange({ ...range, to: e.target.value }));
  container.querySelectorAll('.wr-chip').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.range;
      if (id === 'waiting') setRange({ from: oldestWaiting(transactions) || addDays(today, -30), to: today });
      else if (id === '30') setRange({ from: addDays(today, -30), to: today });
      else if (id === 'month') setRange({ from: `${today.slice(0, 7)}-01`, to: today });
      else setRange({ from: transactions.filter((t) => t.isReimbursable && t.date).reduce((m, t) => (t.date < m ? t.date : m), today), to: today });
    })
  );

  // One payment ticked or unticked. The payment is saved as it is, with one more fact.
  const mark = async (ids, on) => {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    for (const id of ids) {
      const t = byId.get(id);
      if (!t) continue;
      const next = { ...t, updatedAt: Date.now() };
      if (on) next.claimSubmitted = true;
      else delete next.claimSubmitted;
      await put('transactions', next);
    }
  };
  container.querySelectorAll('.wr-tick').forEach((box) =>
    box.addEventListener('change', async () => {
      await mark([box.dataset.id], box.checked);
      again(container);
    })
  );
  container.querySelector('#wr-all')?.addEventListener('click', async () => {
    const ids = report.groups.flatMap((g) => g.rows.filter((r) => !r.submitted).map((r) => r.id));
    await mark(ids, true);
    showToast(`${ids.length} marked as handed in`);
    again(container);
  });
  container.querySelector('#wr-csv')?.addEventListener('click', () => {
    saveFile(new TextEncoder().encode(`﻿${reportCsv(report)}`), `work-costs-${range.from}-to-${range.to}.csv`, 'text/csv');
    showToast('Saved');
  });
}

// A fresh visit starts on what is still waiting again; the dates are only kept while this screen redraws.
export function onBack() {
  range = null;
  return false;
}
