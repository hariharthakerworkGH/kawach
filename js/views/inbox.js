import { getAll } from '../db.js';
import { formatCurrency, formatDateNice } from '../format.js';
import { isDemo } from '../demo-flag.js';
import { matchCategoryForDescription, isIncomeCategory, fitsDirection } from '../merchant-rules.js';
import { flyWordsToFields } from '../haven-life.js';
import { parseAlert, resolveAccount, findExisting, alertFingerprint, dateMatch } from '../alerts.js';
import { pendingAlerts, addToInbox, dismissAlert, saveAlert } from '../alert-inbox.js';
import { loadLearned } from '../alert-learning.js';
import { showToast } from '../toast.js';
import { commitmentField, cardPaymentField } from './add.js';
import { isLiveCommitment, byYourOrder } from '../commitments.js';
import { sortAccounts, sortCategories } from '../list-order.js';
import { cardStandings, whatItPaid } from '../card-standing.js';
import { isoLocal } from '../frequency.js';
import { looksLikeCardPayment } from '../transfers.js';
import { redraw } from '../redraw.js';
import { escapeHtml, escapeAttr, sectionHead, invalidField, slidingPill } from '../ui.js';

// Bank alerts you've shared or pasted, each shown as a draft to check and
// save. Nothing here counts towards any total until you tap Save.

const KIND_LABEL = {
  'card-spend': 'Card spend',
  'atm-withdrawal': 'Cash withdrawal',
  'card-refund': 'Card refund',
  'upi-sent': 'UPI payment',
  'upi-credit': 'Money received',
  unknown: 'Bank alert · partly read',
};

let drafts = [];
let context = { accounts: [], categories: [], commitments: [] };
// Each render gets a number; only the newest may paint. Renders can overlap -
// a background sync refreshing the screen while a paste is being read - and
// without this two of them would fill the same list and show a card twice.
let generation = 0;

export async function render(container) {
  const mine = ++generation;
  await loadLearned(); // wordings taught earlier are read silently; nothing about them is shown
  const [items, accounts, transactions, categories, recurring, importBatches] = await Promise.all([
    pendingAlerts(),
    getAll('accounts'),
    getAll('transactions'),
    getAll('categories'),
    getAll('recurring'),
    getAll('importBatches'),
  ]);

  const built = [];
  const seenKeys = new Map();
  for (const item of items) {
    const parsed = parseAlert(item.rawText);
    if (!parsed.ok) {
      built.push({ item, parsed });
      continue;
    }
    const account = resolveAccount(parsed, accounts, transactions);
    let existing = findExisting(parsed, account ? account.id : null, transactions);
    // The same alert can reach the inbox twice by different routes (shared as
    // an SMS, then pasted from the email). The later copy is marked, so it is
    // never "ready" and can't be swept up by Save-all alongside the first.
    const key = alertFingerprint(parsed);
    if (!existing && seenKeys.has(key)) existing = { kind: 'in-inbox', transaction: seenKeys.get(key) };
    if (!seenKeys.has(key)) seenKeys.set(key, { date: parsed.date, rawDescription: parsed.description, source: 'inbox' });
    built.push({
      item,
      parsed,
      account,
      existing,
      categoryId: await matchCategoryForDescription(parsed.description, parsed.direction),
    });
  }

  // A newer render started while this one was reading; it will paint instead.
  if (mine !== generation) return;
  drafts = built;
  context = { accounts, categories, transactions, importBatches, commitments: recurring.filter((r) => isLiveCommitment(r)).sort(byYourOrder) };

  const ready = drafts.filter(isReady);

  // Everything sits inside a root that is rebuilt on each render. Listeners go
  // on that root, not on the shared view container - otherwise every re-render
  // would stack another handler (saving an alert twice) and the handlers would
  // keep firing on whatever screen is shown next.
  container.innerHTML = `<div class="inbox-root">
    ${
      drafts.length
        ? `<div class="inbox-head">
            <span>${drafts.length} alert${drafts.length === 1 ? '' : 's'} to check</span>
            ${ready.length > 1 ? `<button type="button" class="btn-tiny primary" id="inbox-save-all">Save ${ready.length} ready</button>` : ''}
          </div>
          ${drafts.map(draftTemplate).join('')}`
        : `<p class="import-intro">No alerts waiting. Nothing counts until you tap Save.</p>`
    }

    ${sectionHead('Paste an alert')}
    <div class="totals-card">
      <button type="button" class="btn-secondary btn-block" id="inbox-paste">${isDemo() ? 'Try an example message' : 'Paste from clipboard'}</button>
      <label class="field" style="margin-top:var(--space-sm)">
        <span>Or paste it here</span>
        <textarea id="inbox-text" rows="4" spellcheck="false" autocomplete="off" placeholder="Spent Rs.329 On HDFC Bank Card 4321 At SWIGGY…"></textarea>
      </label>
      <button type="button" class="btn-tiny" id="inbox-read">Read it</button>
    </div>

    <details class="section-fold">
    <summary>Share straight from Messages</summary>
    <div class="totals-card">
    <ol class="setup-steps">
      <li>In Messages, long-press the bank SMS.</li>
      <li>Tap <strong>Share</strong> - if you don't see it, it's in the <strong>⋮</strong> menu.</li>
      <li>Pick <strong>Kawach</strong>. The app opens here with the alert ready to check.</li>
    </ol>
    <p class="muted-note">Emails: select the text in Gmail, Share, Kawach. Not in the list? Reinstall the app from Chrome's menu.</p>
    </div>
    </details>
  </div>`;

  container.querySelectorAll('.al-direction').forEach(slidingPill);
  wire(container.querySelector('.inbox-root'), container);
}

// Safe to save in one tap: fully read, account known, not already in the app.
function isReady(d) {
  return d.parsed.ok && (d.parsed.confidence === 'exact' || d.parsed.confidence === 'learned') && d.account && !d.existing && d.parsed.direction && !needsOtherEnd(d.parsed);
}

// Money that moved (a card bill paid, a transfer) leaves one account and reaches another: it is never saved in one tap without
// saying where the other end is. A bank's debit for a card bill names the card instead; a cash withdrawal's other end is the pocket.
function needsOtherEnd(parsed) {
  return Boolean(parsed.suggestTransfer) && parsed.kind !== 'atm-withdrawal' && !(parsed.direction === 'debit' && billPaymentLike(parsed));
}

// The accounts a move can come from or go to, and the best guess: the account that already shows the other half, else where this
// card's bills were paid from last time.
const OTHER_TYPES = new Set(['bank', 'savings', 'cash']);
function guessOther(d) {
  const mine = d.account;
  const amount = d.parsed.amount;
  const wantDirection = d.parsed.direction === 'credit' ? 'debit' : 'credit';
  const near = (t) => !t.settledWith && d.parsed.date && Math.abs((new Date(t.date) - new Date(d.parsed.date)) / 86400000) <= 3;
  const twin = (context.transactions || []).find((t) => t.amount === amount && t.direction === wantDirection && near(t) && OTHER_TYPES.has((context.accounts.find((a) => a.id === t.accountId) || {}).type) && (!mine || t.accountId !== mine.id));
  if (twin) return twin.accountId;
  if (mine && mine.type === 'card') {
    const last = (context.transactions || []).filter((t) => t.paysCardId === mine.id && t.direction === 'debit').sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (last) return last.accountId;
  }
  return '';
}

// What a card payment most likely paid (js/card-standing.js), on this phone's own date.
// The standings are worked out once for the screen (every card alert asks), not once per alert.
let standingMemo = { for: null, cards: [] };
function guessWhat(d) {
  const mine = d.account;
  if (!mine || mine.type !== 'card') return 'bill';
  try {
    if (standingMemo.for !== context) standingMemo = { for: context, cards: cardStandings(context.accounts, context.transactions, context.importBatches || [], localDay()).cards };
    return whatItPaid(standingMemo.cards.find((c) => c.account.id === mine.id), d.parsed.amount);
  } catch {
    return 'bill';
  }
}

function otherField(d) {
  const guess = guessOther(d);
  const what = guessWhat(d);
  const options = sortAccounts(context.accounts.filter((a) => OTHER_TYPES.has(a.type)), undefined, null)
    .map((a) => `<option value="${a.id}" ${a.id === guess ? 'selected' : ''}>${escapeHtml(a.label)}</option>`)
    .join('');
  return `<label class="field al-other-wrap" hidden>
        <span class="al-other-label">Paid from</span>
        <select class="al-other"><option value="">Choose the account</option>${options}<option value="__none">Somewhere I don't track here</option></select>
      </label>
      <label class="field al-what-wrap" hidden>
        <span>What did it pay?</span>
        <select class="al-what"><option value="bill" ${what === 'bill' ? 'selected' : ''}>The last statement's bill</option><option value="current" ${what === 'current' ? 'selected' : ''}>Paying ahead (spending since)</option></select>
      </label>`;
}

// Shows the "other end" question when the alert is a move of money, and says which way it ran.
function syncOther(card) {
  const wrap = card.querySelector('.al-other-wrap');
  if (!wrap) return;
  const draft = drafts.find((x) => x.item.id === card.dataset.id);
  const account = context.accounts.find((a) => a.id === card.querySelector('.al-account').value);
  const direction = card.querySelector('.al-direction .dir-btn.active')?.dataset.dir || draft?.parsed.direction;
  const paysCard = card.querySelector('.al-pays-card')?.value;
  const atm = draft?.parsed.kind === 'atm-withdrawal';
  const show = Boolean(card.querySelector('.al-transfer').checked && account && !(direction === 'debit' && paysCard) && !atm);
  wrap.hidden = !show;
  const what = card.querySelector('.al-what-wrap');
  if (!show) { if (what) what.hidden = true; return; }
  wrap.querySelector('.al-other-label').textContent = direction === 'credit' ? (account.type === 'card' ? 'Paid from' : 'Came from') : 'Moved to';
  const select = wrap.querySelector('.al-other');
  select.querySelectorAll('option').forEach((o) => { o.hidden = o.value === account.id; });
  card.querySelector('.al-what-wrap').hidden = !(direction === 'credit' && account.type === 'card');
  if (select.value === account.id) select.value = '';
}

function draftTemplate(d) {
  const { item, parsed } = d;
  if (!parsed.ok) {
    return `
      <div class="alert-card alert-unreadable" data-id="${item.id}">
        <p class="alert-kind">Couldn't read this one</p>
        <p class="muted-note">${escapeHtml(parsed.reason)}</p>
        <pre class="alert-raw-text">${escapeHtml(item.rawText)}</pre>
        <div class="alert-actions">
          <button type="button" class="btn-tiny alert-skip">Remove</button>
          <button type="button" class="btn-tiny primary alert-manual">Log it by hand</button>
        </div>
      </div>`;
  }

  const sign = parsed.direction === 'credit' ? '+' : parsed.direction === 'debit' ? '-' : '';
  const tone = parsed.direction === 'credit' ? 'in' : 'out';
  const partial = parsed.confidence === 'partial';
  const recommendSkip = Boolean(d.existing);

  return `
    <div class="alert-card" data-id="${item.id}">
      <div class="alert-top">
        <span class="alert-kind">${KIND_LABEL[parsed.kind] || 'Bank alert'}${d.account ? ` · ${escapeHtml(d.account.label)}` : ''}</span>
        <span class="alert-amount ${tone}">${sign}${formatCurrency(parsed.amount)}</span>
      </div>
      ${existingNote(d.existing)}
      ${partial ? partialNote(parsed) : ''}
      ${!d.account ? `<p class="alert-note">${parsed.last4 ? `Which account is ••${parsed.last4}? It'll be remembered.` : 'Pick the account.'}</p>` : ''}

      <label class="field">
        <span>What</span>
        <input type="text" class="al-desc" spellcheck="false" autocomplete="off" value="${escapeAttr(parsed.description)}">
      </label>

      <div class="alert-grid">
        <label class="field">
          <span>Date${parsed.time ? ` · ${parsed.time}` : ''}</span>
          <input type="date" class="al-date" value="${parsed.date || localDay(item.receivedAt)}">
        </label>
        ${
          partial
            ? `<label class="field">
                <span>Amount</span>
                <input type="number" class="al-amount" step="0.01" min="0.01" value="${(parsed.amount / 100).toFixed(2)}">
              </label>`
            : ''
        }
      </div>

      <label class="field">
        <span>Account</span>
        <select class="al-account">
          <option value="">Pick the account</option>
          ${sortAccounts(context.accounts)
            // A deposit (savings, such as SBI's MOD), a provident fund or a loan is not where a spend or a receipt happens; the one the alert
            // was already matched to stays on the list so nothing is taken away from a choice already made.
            .filter((a) => !['savings', 'pf', 'loan'].includes(a.type) || (d.account && d.account.id === a.id))
            .map((a) => `<option value="${a.id}" ${d.account && d.account.id === a.id ? 'selected' : ''}>${escapeHtml(a.label)}</option>`)
            .join('')}
        </select>
      </label>

      ${
        partial || !parsed.direction
          ? `<div class="direction-toggle small al-direction">
              <button type="button" class="dir-btn ${parsed.direction === 'debit' ? 'active' : ''}" data-dir="debit">Spent</button>
              <button type="button" class="dir-btn ${parsed.direction === 'credit' ? 'active' : ''}" data-dir="credit">Received</button>
            </div>`
          : ''
      }

      <label class="field">
        <span>Category</span>
        <select class="al-category">
          <option value="">Needs a category</option>
          ${sortCategories(context.categories)
            // Income is not offered for money going out.
            .filter((c) => fitsDirection(c, parsed.direction))
            .map((c) => `<option value="${c.id}" ${isIncomeCategory(c) ? 'data-income="1"' : ''} ${c.id === d.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
            .join('')}
        </select>
      </label>

      ${
        parsed.direction === 'credit'
          ? ''
          : billPaymentLike(parsed)
            ? cardPaymentField(context.accounts.filter((a) => a.type === 'card'), null, `al-pays-${item.id}`, 'class="al-pays-card"')
            : commitmentField(context.commitments, null, `al-commitment-${item.id}`, 'class="al-commitment"')
      }

      <label class="checkbox-row al-reimb-out" ${parsed.direction === 'credit' ? 'hidden' : ''}>
        <input type="checkbox">
        <span>Work cost: my employer pays this back</span>
      </label>
      <label class="checkbox-row al-reimb-in" ${parsed.direction === 'credit' ? '' : 'hidden'}>
        <input type="checkbox">
        <span>This pays back a work cost</span>
      </label>

      <label class="checkbox-row">
        <input type="checkbox" class="al-transfer" ${parsed.suggestTransfer ? 'checked' : ''}>
        <span>Not spending - money moved (cash withdrawal, card bill payment)</span>
      </label>
      ${otherField(d)}

      <details class="alert-original">
        <summary>Original message</summary>
        <pre class="alert-raw-text">${escapeHtml(item.rawText)}</pre>
      </details>

      <div class="alert-actions">
        <button type="button" class="btn-tiny ${recommendSkip ? 'primary' : ''} alert-skip">${recommendSkip ? 'Already there - skip' : 'Skip'}</button>
        <button type="button" class="btn-tiny ${recommendSkip ? '' : 'primary'} alert-save">${saveLabel(d.existing)}</button>
      </div>
    </div>`;
}

// A wording nothing here knew: say what could not be read, so the fields to fix are plain, and
// that fixing them once is all it takes (js/alert-learning.js).
function partialNote(parsed) {
  const gaps = [
    !parsed.direction ? 'whether it was spent or received' : '',
    !parsed.party ? 'who it was' : '',
    !parsed.date ? 'the date' : '',
    !parsed.last4 ? 'the account' : '',
  ].filter(Boolean);
  return `<p class="alert-note">${gaps.length ? `I could not read ${gaps.join(', ')}: fill ${gaps.length === 1 ? 'it' : 'them'} in.` : 'Check what I read.'}</p>`;
}

function existingNote(existing) {
  if (!existing) return '';
  const t = existing.transaction;
  const when = formatDateNice(t.date);
  if (existing.kind === 'same-alert') {
    return `<p class="alert-note warn">You've already added this exact alert (${when}).</p>`;
  }
  if (existing.kind === 'in-inbox') {
    return `<p class="alert-note warn">This alert is already in the list above - probably the SMS and the email for the same spend.</p>`;
  }
  if (existing.kind === 'reference') {
    return `<p class="alert-note warn">Already in the app${t.source === 'statement' ? ' from your statement' : ''} - the reference number matches (${when}).</p>`;
  }
  return `<p class="alert-note warn">Probably already in the app: “${escapeHtml((t.rawDescription || '').slice(0, 40))}” on ${when}, same amount and account${
    t.source === 'statement' ? ', from your statement' : ''
  }.</p>`;
}

function saveLabel(existing) {
  if (!existing) return 'Save';
  return existing.kind === 'likely' ? "It's a different one - save" : 'Save anyway';
}

// The date on this phone, not in UTC. toISOString() would give yesterday for
// anything shared between midnight and 5:30am in India, filing the spend in
// the wrong day - and on the 1st, the wrong month. A message with no date in it is
// filed on the day it reached the app, not the day it is checked: alerts shared
// at night and checked next morning belong to the night before.
function localDay(ms) {
  return isoLocal(ms ? new Date(ms) : new Date());
}

function wire(root, container) {
  // Guards against a double tap saving the same alert twice while the first
  // save is still writing.
  let busy = false;
  root.addEventListener('change', (e) => { const c = e.target.closest('.alert-card'); if (c) syncOther(c); });
  root.querySelectorAll('.alert-card').forEach(syncOther);
  root.addEventListener('click', async (e) => {
    if (busy) return;
    const card = e.target.closest('.alert-card');

    const dirBtn = e.target.closest('.al-direction .dir-btn');
    if (dirBtn && card) {
      card.querySelectorAll('.al-direction .dir-btn').forEach((b) => b.classList.toggle('active', b === dirBtn));
      syncOther(card);
      // Switched to Spent: Income is no longer a choice, and is cleared if it was picked.
      const spent = dirBtn.dataset.dir === 'debit';
      const pick = card.querySelector('.al-category');
      pick.querySelectorAll('option[data-income]').forEach((o) => {
        o.disabled = spent;
        o.hidden = spent;
      });
      if (spent && pick.selectedOptions[0] && pick.selectedOptions[0].dataset.income) pick.value = '';
      card.querySelectorAll('.al-reimb-out').forEach((el) => (el.hidden = !spent));
      card.querySelectorAll('.al-reimb-in').forEach((el) => (el.hidden = spent));
      return;
    }

    if (e.target.closest('.alert-manual')) {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'add' } }));
      return;
    }

    // Redraw the list afterwards - but only if it's still what's on screen. If
    // you tapped another tab while a save was writing, redrawing here would
    // paint the alert list over the screen you moved to.
    const refresh = async () => {
      if (root.isConnected) await redraw(container, () => render(container));
    };

    busy = true;
    try {
      if (e.target.closest('.alert-skip') && card) {
        await dismissAlert(card.dataset.id);
        showToast('Removed from the list');
        await refresh();
        return;
      }

      if (e.target.closest('.alert-save') && card) {
        const draft = drafts.find((d) => d.item.id === card.dataset.id);
        if (!draft) return;
        const edits = readEdits(card, draft, true);
        if (edits.error) {
          if (!edits.inline) showToast(edits.error);
          return;
        }
        // Tapping Save on a card that warned it's a duplicate is a deliberate
        // choice; Save-all never makes that choice for you.
        const saved = await saveAlert(draft.item, { ...edits, allowDuplicate: Boolean(draft.existing) });
        showToast(saved ? `Saved ${edits.direction === 'credit' ? '+' : '-'}${formatCurrency(edits.amount)}` : 'Already saved - nothing added');
        await refresh();
        return;
      }

      if (e.target.closest('#inbox-save-all')) {
        let saved = 0;
        const keysThisPass = new Set();
        for (const d of drafts.filter(isReady)) {
          const key = alertFingerprint(d.parsed);
          if (keysThisPass.has(key)) continue;
          const cardEl = root.querySelector(`.alert-card[data-id="${d.item.id}"]`);
          const edits = cardEl ? readEdits(cardEl, d) : null;
          if (!edits || edits.error) continue;
          // saveAlert re-checks the database itself, so even an alert saved on
          // another device a moment ago is caught.
          if (await saveAlert(d.item, edits)) {
            saved++;
            keysThisPass.add(key);
          }
        }
        showToast(`Saved ${saved} alert${saved === 1 ? '' : 's'}`);
        await refresh();
        return;
      }

      if (e.target.closest('#inbox-paste')) {
        let text = null;
        // The demo never reads the clipboard: it offers a made-up bank message.
        if (isDemo()) {
          await ingest((await import('../demo-data.js')).nextExampleMessage(), refresh);
          return;
        }
        try {
          text = await navigator.clipboard.readText();
        } catch {
          showToast("Couldn't read the clipboard - paste into the box below");
          root.querySelector('#inbox-text').focus();
          return;
        }
        await ingest(text, refresh);
        return;
      }

      if (e.target.closest('#inbox-read')) {
        await ingest(root.querySelector('#inbox-text').value, refresh);
      }
    } finally {
      busy = false;
    }
  });
}

async function ingest(text, refresh) {
  if (!text || !text.trim()) {
    showToast('Nothing to read yet');
    return;
  }
  const before = new Set([...document.querySelectorAll('.alert-card[data-id]')].map((c) => c.dataset.id));
  const n = await addToInbox(text, 'paste');
  showToast(n ? `${n} alert${n === 1 ? '' : 's'} added to check` : 'Already in the list');
  await refresh();
  // The message just read fills its card in front of you: each field lights
  // in turn, so you see what was taken from where. Only the new card, once.
  if (!n || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  for (const card of document.querySelectorAll('.alert-card[data-id]')) {
    if (before.has(card.dataset.id)) continue;
    card.querySelectorAll('.field, .alert-amount').forEach((f, i) => f.style.setProperty('--i', i));
    card.classList.add('is-fresh');
    setTimeout(() => card.classList.remove('is-fresh'), 2600);
    showReading(card);
  }
}

// The message itself, for a second and a half, with the words it was read from lit in turn - the
// amount, who it was, the date - while the fields below take their values in the same order and the
// same beat (css "fresh-field"). Then it folds away. The words are found by what was read, so a
// message read badly shows exactly what was misread.
function showReading(card) {
  const draft = drafts.find((d) => d.item.id === card.dataset.id);
  if (!draft || !draft.parsed.ok) return;
  const raw = draft.item.rawText;
  const p = draft.parsed;
  const marks = [];
  const money = [...raw.matchAll(/(?:Rs\.?|INR|₹|Rupees|Amt\.?:?|Amount:?)\s*([\d,]+(?:\.\d{1,2})?)/gi)].find((m) => Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) === p.amount);
  if (money) marks.push({ at: money.index, len: money[0].length, kind: 'money' });
  const who = p.party ? raw.toLowerCase().indexOf(p.party.toLowerCase()) : -1;
  if (who >= 0) marks.push({ at: who, len: p.party.length, kind: 'who' });
  const day = dateMatch(raw);
  if (day) marks.push({ at: day.index, len: day.text.length, kind: 'day' });
  marks.sort((a, b) => a.at - b.at);
  let html = '';
  let from = 0;
  let k = 0;
  for (const m of marks) {
    if (m.at < from) continue;
    html += `${escapeHtml(raw.slice(from, m.at))}<mark data-kind="${m.kind}" style="--k:${k}">${escapeHtml(raw.slice(m.at, m.at + m.len))}</mark>`;
    from = m.at + m.len;
    k += 1;
  }
  html += escapeHtml(raw.slice(from));
  const box = document.createElement('p');
  box.className = 'alert-sms';
  box.innerHTML = html;
  card.querySelector('.alert-top').after(box);
  // Haven: each underlined word flies into the field it filled, one after another.
  flyWordsToFields(box, card, ['money', 'who', 'day']);
  setTimeout(async () => {
    if (box.animate) await box.animate([{ height: `${box.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px' }], { duration: 200, easing: 'cubic-bezier(0.7, 0, 0.84, 0)' }).finished.catch(() => {});
    box.remove();
  }, 2600);
}

// `inline`: a field that will not do shakes and says why under itself (one card, one tap), rather
// than a toast. Save-all passes nothing: it skips a card that cannot be saved and says nothing.
function readEdits(card, draft, inline = false) {
  const { parsed } = draft;
  const refuse = (selector, message) => {
    if (inline) invalidField(card.querySelector(selector), message);
    return { error: message, inline };
  };
  const accountId = card.querySelector('.al-account').value;
  const account = context.accounts.find((a) => a.id === accountId);
  if (!account) return refuse('.al-account', 'Pick the account first');

  const activeDir = card.querySelector('.al-direction .dir-btn.active');
  const direction = activeDir ? activeDir.dataset.dir : parsed.direction;
  if (!direction) return { error: 'Choose Spent or Received' };

  const amountInput = card.querySelector('.al-amount');
  const amount = amountInput ? Math.round(parseFloat(amountInput.value) * 100) : parsed.amount;
  if (!Number.isFinite(amount) || amount <= 0) return refuse('.al-amount', 'Check the amount');

  const date = card.querySelector('.al-date').value;
  if (!date) return refuse('.al-date', 'Pick a date');

  const category = context.categories.find((c) => c.id === card.querySelector('.al-category').value);
  const paysCardId = card.querySelector('.al-pays-card') ? card.querySelector('.al-pays-card').value || null : null;
  // A card bill payment is money moved, not spending.
  const isTransfer = card.querySelector('.al-transfer').checked || Boolean(paysCardId);
  // Where the other end of a move is: asked, never assumed.
  const otherWrap = card.querySelector('.al-other-wrap');
  let otherId = null;
  if (isTransfer && otherWrap && !otherWrap.hidden) {
    const v = otherWrap.querySelector('.al-other').value;
    if (!v) return refuse('.al-other', direction === 'credit' ? 'Say which account it came from' : 'Say which account it went to');
    otherId = v === '__none' ? null : v;
  }
  const whatWrap = card.querySelector('.al-what-wrap');
  const said = isTransfer && whatWrap && !whatWrap.hidden ? whatWrap.querySelector('.al-what').value : null;
  const paysCurrent = said === 'current';
  const paysBill = said === 'bill';
  return {
    otherId,
    paysCurrent,
    paysBill,
    accountId,
    direction,
    amount,
    date,
    description: card.querySelector('.al-desc').value.trim() || parsed.description,
    // Never Income for money going out, whatever was picked or filled in.
    categoryId: category && fitsDirection(category, direction) ? category.id : null,
    // A work cost to be paid back, or a payment that is one being paid back.
    isReimbursable: direction === 'debit' && Boolean(card.querySelector('.al-reimb-out input')?.checked),
    isSettlement: direction === 'credit' && Boolean(card.querySelector('.al-reimb-in input')?.checked),
    isTransfer,
    paysCardId,
    commitmentId: card.querySelector('.al-commitment') ? card.querySelector('.al-commitment').value || null : null,
    // Only a decision you actually made should block automatic detection later.
    transferDecided: isTransfer || isTransfer !== parsed.suggestTransfer,
  };
}

// A card bill payment: said so by the alert, or worded like one (CRED, CC
// payment).
function billPaymentLike(parsed) {
  return Boolean(parsed.billPayment) || looksLikeCardPayment({ direction: 'debit', rawDescription: `${parsed.description || ''} ${parsed.party || ''}` }, 'bank');
}

