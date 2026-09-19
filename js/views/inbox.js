import { getAll } from '../db.js';
import { formatCurrency, formatDateNice } from '../format.js';
import { matchCategoryForDescription } from '../merchant-rules.js';
import { parseAlert, resolveAccount, findExisting, alertFingerprint } from '../alerts.js';
import { pendingAlerts, addToInbox, dismissAlert, saveAlert } from '../alert-inbox.js';
import { showToast } from '../toast.js';
import { commitmentField, cardPaymentField } from './add.js';
import { isLiveCommitment, byYourOrder } from '../commitments.js';
import { looksLikeCardPayment } from '../transfers.js';
import { redraw } from '../redraw.js';

// Bank alerts you've shared or pasted, each shown as a draft to check and
// save. Nothing here counts towards any total until you tap Save.

const KIND_LABEL = {
  'card-spend': 'Card spend',
  'atm-withdrawal': 'Cash withdrawal',
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
  const [items, accounts, transactions, categories, recurring] = await Promise.all([
    pendingAlerts(),
    getAll('accounts'),
    getAll('transactions'),
    getAll('categories'),
    getAll('recurring'),
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
      categoryId: await matchCategoryForDescription(parsed.description),
    });
  }

  // A newer render started while this one was reading; it will paint instead.
  if (mine !== generation) return;
  drafts = built;
  context = { accounts, categories, commitments: recurring.filter((r) => isLiveCommitment(r)).sort(byYourOrder) };

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

    <h3>Paste an alert</h3>
    <div class="totals-card">
      <button type="button" class="btn-secondary btn-block" id="inbox-paste">Paste from clipboard</button>
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

  wire(container.querySelector('.inbox-root'), container);
}

// Safe to save in one tap: fully read, account known, not already in the app.
function isReady(d) {
  return d.parsed.ok && d.parsed.confidence === 'exact' && d.account && !d.existing && d.parsed.direction;
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
  const partial = parsed.confidence !== 'exact';
  const recommendSkip = Boolean(d.existing);

  return `
    <div class="alert-card" data-id="${item.id}">
      <div class="alert-top">
        <span class="alert-kind">${KIND_LABEL[parsed.kind] || 'Bank alert'}${d.account ? ` · ${escapeHtml(d.account.label)}` : ''}</span>
        <span class="alert-amount ${tone}">${sign}${formatCurrency(parsed.amount)}</span>
      </div>
      ${existingNote(d.existing)}
      ${partial ? `<p class="alert-note">New wording - check amount, account and direction.</p>` : ''}
      ${!d.account ? `<p class="alert-note">${parsed.last4 ? `Which account is ••${parsed.last4}? It'll be remembered.` : 'Pick the account.'}</p>` : ''}

      <label class="field">
        <span>What</span>
        <input type="text" class="al-desc" spellcheck="false" autocomplete="off" value="${escapeAttr(parsed.description)}">
      </label>

      <div class="alert-grid">
        <label class="field">
          <span>Date${parsed.time ? ` · ${parsed.time}` : ''}</span>
          <input type="date" class="al-date" value="${parsed.date || localToday()}">
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
          ${context.accounts
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
          ${context.categories
            .map((c) => `<option value="${c.id}" ${c.id === d.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
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

      <label class="checkbox-row">
        <input type="checkbox" class="al-transfer" ${parsed.suggestTransfer ? 'checked' : ''}>
        <span>Not spending - money moved (cash withdrawal, card bill payment)</span>
      </label>

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
// the wrong day - and on the 1st, the wrong month.
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function wire(root, container) {
  // Guards against a double tap saving the same alert twice while the first
  // save is still writing.
  let busy = false;
  root.addEventListener('click', async (e) => {
    if (busy) return;
    const card = e.target.closest('.alert-card');

    const dirBtn = e.target.closest('.al-direction .dir-btn');
    if (dirBtn && card) {
      card.querySelectorAll('.al-direction .dir-btn').forEach((b) => b.classList.toggle('active', b === dirBtn));
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
        const edits = readEdits(card, draft);
        if (edits.error) {
          showToast(edits.error);
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
  const n = await addToInbox(text, 'paste');
  showToast(n ? `${n} alert${n === 1 ? '' : 's'} added to check` : 'Already in the list');
  await refresh();
}

function readEdits(card, draft) {
  const { parsed } = draft;
  const accountId = card.querySelector('.al-account').value;
  const account = context.accounts.find((a) => a.id === accountId);
  if (!account) return { error: 'Pick the account first' };

  const activeDir = card.querySelector('.al-direction .dir-btn.active');
  const direction = activeDir ? activeDir.dataset.dir : parsed.direction;
  if (!direction) return { error: 'Choose Spent or Received' };

  const amountInput = card.querySelector('.al-amount');
  const amount = amountInput ? Math.round(parseFloat(amountInput.value) * 100) : parsed.amount;
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Check the amount' };

  const date = card.querySelector('.al-date').value;
  if (!date) return { error: 'Pick a date' };

  const paysCardId = card.querySelector('.al-pays-card') ? card.querySelector('.al-pays-card').value || null : null;
  // A card bill payment is money moved, not spending.
  const isTransfer = card.querySelector('.al-transfer').checked || Boolean(paysCardId);
  return {
    accountId,
    direction,
    amount,
    date,
    description: card.querySelector('.al-desc').value.trim() || parsed.description,
    categoryId: card.querySelector('.al-category').value || null,
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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}
