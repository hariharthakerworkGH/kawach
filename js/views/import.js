import { getAll, put, remove, newId, setSetting } from '../db.js';
import { icon } from '../icons.js';
import { extractPdfText, PdfPasswordError, PdfNoTextError } from '../pdf-text.js';
import { detectParser, parsers } from '../parsers/registry.js';
import { matchCategoryForDescription, learnFromAssignment } from '../merchant-rules.js';
import { detectTransfers } from '../transfers.js';
import { matchAgainstManualEntries } from '../reconciliation.js';
import { formatCurrency, formatDateNice, formatRupees, ordinal } from '../format.js';
import { computeFreeToSpend } from '../free-to-spend.js';
import { loanPosition } from '../loans.js';
import { listTakenOn } from '../account-metrics.js';
import { detectEmis, emiCommitment, emiCommitmentId } from '../commitments.js';
import { isoLocal } from '../frequency.js';
import { sameTransaction } from '../duplicates.js';
import * as csvParser from '../parsers/csv.js';
import { readerFor, BANKS } from '../parsers/any-bank.js';
import { enhancePasswords } from '../password-field.js';
import { categoriesFor } from '../business.js';
import { isPfAccount, pfContribution, pfPosition, DEFAULT_PF_RATE } from '../pf.js';

// Two kinds of import share this screen:
//   - statements (PDF): a closed, billed period. Authoritative.
//   - current transactions (a pasted HDFC list, an ICICI "current statement"
//     PDF): a snapshot of the cycle that is still open. "Provisional" - each
//     new snapshot replaces the last, and the monthly statement replaces them
//     all. These never touch a card's bill, statement day or bank balance.

let state = null;
let categoriesCache = [];

// The screen walks through three steps - Choose, Check, Done - and moves
// itself on, so a statement that has been read is never left sitting
// unnoticed below the fold. Everything that reads and saves rows is the same
// as before; this is only the path through it.
let stage = 'choose';
let screen = null;
// A locked PDF, held only until its password is typed, then dropped.
let lockedFile = null;
// Where the money stood when the review opened, so Done can say what the
// import changed. Kept across a queue of pasted cards.
let before = null;
let savedRows = [];

export async function render(container) {
  state = null;
  stage = 'choose';
  screen = container;
  lockedFile = null;
  before = null;
  savedRows = [];
  categoriesCache = await getAll('categories');

  container.innerHTML = `
    <ol class="import-steps" aria-label="Steps">
      <li data-step="choose" class="current">Choose</li>
      <li data-step="check">Check</li>
      <li data-step="done">Done</li>
    </ol>

    <section class="import-stage" data-stage="choose">
      <label class="import-drop" id="import-drop">
        <input type="file" id="import-file" accept=".pdf,.csv,.txt,application/pdf,text/csv" hidden>
        <span class="import-drop-icon">${icon('file')}</span>
        <strong>Choose a statement</strong>
        <span class="muted-note">Bank, card, loan, payslip or PF passbook. PDF or spreadsheet.</span>
      </label>
      <div id="import-password-box" class="totals-card" hidden>
        <label class="field">
          <span>This file is locked. Its password</span>
          <input type="password" id="import-password" autocomplete="off" placeholder="Used once to open it, never saved">
        </label>
        <button type="button" id="import-open-btn" class="btn-primary btn-block">Open</button>
      </div>
      <p id="import-status" class="status" hidden></p>

      <button type="button" id="import-paste-toggle" class="btn-secondary btn-block">Paste card transactions</button>
      <div id="import-paste-box" hidden>
        <label class="field" style="margin-top:var(--space-xs)">
          <span>Copy the unbilled list from NetBanking, with the card name and last 4 digits above each card</span>
          <textarea id="import-paste" rows="6" spellcheck="false" autocomplete="off" placeholder="Swiggy Credit Card 4321&#10;14 Sept 2026&#10;10% Swiggy Cashback&#10;₹49.00  credit icon"></textarea>
        </label>
        <button type="button" id="import-paste-btn" class="btn-primary btn-block">Read pasted list</button>
      </div>
      <p class="muted-note import-privacy">${icon('lock')} Read on this phone. The file is never saved.</p>
    </section>

    <section class="import-stage" data-stage="check" hidden>
      <button type="button" class="link-btn import-back">← Choose another file</button>
      <div id="import-results"></div>
    </section>

    <section class="import-stage" data-stage="done" hidden>
      <div id="import-done"></div>
    </section>
  `;

  enhancePasswords(container);
  const fileInput = container.querySelector('#import-file');
  // Picking the file is the whole of step one: it is read straight away.
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) readChosenFile(file);
  });

  // A computer can drop a file on the box instead.
  const drop = container.querySelector('#import-drop');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) readChosenFile(file);
  });

  container.querySelector('#import-open-btn').addEventListener('click', () => {
    if (lockedFile) readPdf(lockedFile, container.querySelector('#import-password').value || undefined);
  });
  container.querySelector('#import-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && lockedFile) readPdf(lockedFile, e.target.value || undefined);
  });

  container.querySelector('#import-paste-toggle').addEventListener('click', (e) => {
    const box = container.querySelector('#import-paste-box');
    box.hidden = !box.hidden;
    e.target.hidden = true;
    if (!box.hidden) container.querySelector('#import-paste').focus();
  });
  container.querySelector('#import-paste-btn').addEventListener('click', () => parsePasted(container));
  container.querySelector('.import-back').addEventListener('click', () => backToChoose());

  const resultsEl = container.querySelector('#import-results');
  resultsEl.addEventListener('input', (e) => handleFieldChange(e, resultsEl));
  resultsEl.addEventListener('change', (e) => handleFieldChange(e, resultsEl));
  resultsEl.addEventListener('click', (e) => handleClick(e, resultsEl, container));
}

// The phone's back button steps back through the import before it leaves the
// screen: from Check or Done to Choose. Returns true when it did (app.js).
export function onBack() {
  if (!screen || stage === 'choose') return false;
  backToChoose();
  return true;
}

function showStage(name) {
  stage = name;
  screen.querySelectorAll('.import-stage').forEach((s) => (s.hidden = s.dataset.stage !== name));
  const order = ['choose', 'check', 'done'];
  screen.querySelectorAll('.import-steps li').forEach((li) => {
    li.classList.toggle('current', li.dataset.step === name);
    li.classList.toggle('past', order.indexOf(li.dataset.step) < order.indexOf(name));
  });
  window.scrollTo(0, 0);
}

function backToChoose() {
  state = null;
  before = null;
  savedRows = [];
  lockedFile = null;
  screen.querySelector('#import-results').innerHTML = '';
  screen.querySelector('#import-password-box').hidden = true;
  screen.querySelector('#import-status').hidden = true;
  showStage('choose');
}

// Step two begins the moment something has been read. Where the money stood
// is noted first, so Done can compare against it.
async function enterCheck() {
  if (!before) {
    try {
      before = await computeFreeToSpend();
    } catch {
      before = null;
    }
  }
  showStage('check');
}

// What kind of file this is decides how it is read - you never have to say.
function readChosenFile(file) {
  const status = screen.querySelector('#import-status');
  if (/\.xlsx?$/i.test(file.name)) {
    showStatus(status, 'This is an Excel file. Open it in Excel or Google Sheets, save it as CSV, and choose that file.', true);
    return;
  }
  if (/\.(csv|txt)$/i.test(file.name) || /csv|text\/plain/i.test(file.type)) {
    parseCsvFile(file);
    return;
  }
  readPdf(file);
}

async function readPdf(file, password) {
  const status = screen.querySelector('#import-status');
  const resultsEl = screen.querySelector('#import-results');
  const passwordBox = screen.querySelector('#import-password-box');
  const passwordInput = screen.querySelector('#import-password');

  showStatus(status, 'Reading…', false);
  resultsEl.innerHTML = '';

  try {
    const text = await extractPdfText(file, password);
    // Done with the file and its password - drop both now.
    lockedFile = null;
    passwordInput.value = '';
    passwordBox.hidden = true;

    let parser = detectParser(text);
    // A bank's own reader that finds nothing (the bank changed its layout)
    // hands over to the general one, as does any bank without a reader.
    if (parser && (parser.accountType === 'bank' || parser.accountType === 'card') && !parser.provisional && !parser.parse(text).rows.length) parser = null;
    if (!parser) parser = readerFor(text);
    if (!parser) {
      showStatus(status, "Couldn't find any transactions in this PDF. Download the statement from your bank as a spreadsheet (CSV) instead and choose that.", true);
      return;
    }
    status.hidden = true;
    await startReview({ parser, text, queue: [] }, status, resultsEl);
  } catch (err) {
    if (err instanceof PdfPasswordError) {
      // Only now is a password asked for, and only for this file.
      lockedFile = file;
      passwordBox.hidden = false;
      passwordInput.value = '';
      passwordInput.focus();
      if (err.kind === 'required') status.hidden = true;
      else showStatus(status, "That password didn't open it. Try again.", true);
    } else if (err instanceof PdfNoTextError) {
      showStatus(status, err.message, true);
    } else {
      showStatus(status, `Couldn't read this file: ${err.message}`, true);
    }
  }
}

async function parseCsvFile(file) {
  const status = screen.querySelector('#import-status');
  const resultsEl = screen.querySelector('#import-results');
  resultsEl.innerHTML = '';
  try {
    const text = await file.text();
    if (!csvParser.detect(text)) {
      showStatus(status, "Couldn't find the columns in this file. It needs a header row with a date, a description, and either withdrawal and deposit columns or an amount column.", true);
      return;
    }
    await startReview({ parser: csvParser, text, queue: [] }, status, resultsEl);
  } catch (err) {
    showStatus(status, `Couldn't read this file: ${err.message}`, true);
  }
}

async function parsePasted(container) {
  const status = container.querySelector('#import-status');
  const resultsEl = container.querySelector('#import-results');
  const textarea = container.querySelector('#import-paste');
  const text = textarea.value;
  resultsEl.innerHTML = '';

  if (!text.trim()) {
    showStatus(status, 'Paste the transactions first.', true);
    return;
  }
  // Only pasted-list parsers are asked: a whole copied page can also contain a
  // statement's wording ("Total Amount Due"), which isn't a reason to refuse it.
  const parser = parsers.find((p) => p.provisional && typeof p.splitSections === 'function' && p.detect(text));
  if (!parser) {
    showStatus(status, "That doesn't look like HDFC's current transactions list. Each transaction should have a date line, a description, and an amount line ending in \"credit icon\" or \"debit icon\".", true);
    return;
  }
  const sections = parser.splitSections(text);
  if (sections.length === 0) {
    showStatus(status, 'Found no complete transactions in that text.', true);
    return;
  }
  textarea.value = '';
  await startReview({ parser, text: sections[0].text, last4: sections[0].last4, queue: sections.slice(1) }, status, resultsEl);
}

// Parses one card's worth of text and builds the review.
async function startReview({ parser, text, last4 = null, queue }, status, resultsEl) {
  const { rows, meta } = parser.parse(text);
  if (last4 && !meta.accountLast4) meta.accountLast4 = last4;

  // An EPFO passbook: the fund's own record, which beats anything the app
  // could work out from a payslip.
  if (parser.accountType === 'pf') {
    const accounts = await getAll('accounts');
    state = { parser, meta, passbook: true, accounts, account: accounts.find(isPfAccount) || null, rows: [] };
    await enterCheck();
    renderPassbookReview(resultsEl);
    return;
  }
  // A payslip: the salary that funds everything, and the PF put away from it.
  if (parser.accountType === 'payslip') {
    const accounts = await getAll('accounts');
    state = { parser, meta, payslip: true, accounts, account: accounts.find(isPfAccount) || null, rows: [] };
    await enterCheck();
    renderPayslipReview(resultsEl);
    return;
  }
  // A loan statement is a summary, not transactions: check it and save it as
  // a loan account, whose EMI then counts in the monthly budget by itself.
  if (parser.accountType === 'loan') {
    const accounts = await getAll('accounts');
    const existing = accounts.find((a) => a.type === 'loan' && (a.loanAccountNo === meta.accountNo || (meta.accountLast4 && a.last4 === meta.accountLast4)));
    state = { parser, meta, loan: true, accounts, account: existing || null, rows: [] };
    await enterCheck();
    renderLoanReview(resultsEl);
    return;
  }
  if (rows.length === 0) {
    showStatus(status, 'Recognised the format but found no transaction rows in it.', true);
    return;
  }
  for (const row of rows) {
    row.categoryId = await matchCategoryForDescription(row.description);
    // What the row's category is before matching borrows one from an entry
    // on some card - restored if a different card is picked.
    row._ownCategoryId = row.categoryId;
  }

  const accounts = await getAll('accounts');
  const provisional = Boolean(parser.provisional);
  // A spreadsheet doesn't say whose it is: you always pick the account.
  const pickAccount = Boolean(parser.pickAccount);
  let account = pickAccount
    ? null
    : provisional
      ? findCardAccount(accounts, parser, meta.accountLast4)
      : findStatementAccount(accounts, parser, meta.accountLast4);
  // A statement the app can't place for certain: you say whose it is, with
  // the likeliest account already picked.
  const accountUncertain = !pickAccount && !provisional && !account && accounts.some((a) => a.type === parser.accountType);
  if (accountUncertain) account = likelyStatementAccount(accounts, parser);

  state = {
    parser,
    rows,
    meta,
    provisional,
    pickAccount,
    accountUncertain,
    account,
    accounts,
    queue,
    skipDuplicates: false,
    // EMI instalments on the statement ("<5/12>"), offered as fixed commitments.
    emis: parser.accountType === 'card' ? detectEmis(rows).map((emi) => ({ ...emi, keep: true })) : [],
  };
  await analyse();
  await enterCheck();
  renderResults(resultsEl);
}

// The passbook, before anything is saved.
function renderPassbookReview(resultsEl) {
  const { meta, account } = state;
  const both = (x) => (x ? x.employee + x.employer : 0);
  const line = (label, value, note = '') =>
    `<div class="totals-row"><span>${label}${note ? `<br><span class="muted-note">${note}</span>` : ''}</span><span>${value}</span></div>`;

  resultsEl.innerHTML = `
    <div class="totals-card">
      <div class="totals-row"><span><strong>EPF passbook ${escapeHtml(meta.financialYear || '')}</strong></span><span class="muted-note">${escapeHtml(meta.employer || '')}</span></div>
      ${meta.opening ? line('Already in the fund', formatCurrency(both(meta.opening)), `as of ${formatDateNice(meta.opening.asOf)}`) : ''}
      ${line(`${meta.months.length} month${meta.months.length === 1 ? '' : 's'} of contributions`, formatCurrency(meta.totals.employee + meta.totals.employer), 'your share and your employer\'s')}
      ${meta.totals.pension ? line('To the pension scheme', formatCurrency(meta.totals.pension), 'kept apart from the fund') : ''}
      ${meta.interestCredited && both(meta.interestCredited) ? line('Interest credited', formatCurrency(both(meta.interestCredited)), 'by EPFO for this year') : ''}
      ${meta.closing ? line('Passbook closing balance', formatCurrency(both(meta.closing)), `as on ${formatDateNice(meta.closing.asOf)}`) : ''}
      ${
        meta.totals.pension === 0 && meta.months.length
          ? "<p class=\"muted-note\">Your employer's whole share goes to EPF, none to pension.</p>"
          : ''
      }
    </div>
    <button type="button" id="passbook-save-btn" class="btn-primary">${account ? 'Update my PF' : 'Start tracking my PF'}</button>
    <p id="import-commit-status" class="status" hidden></p>
  `;

  resultsEl.querySelector('#passbook-save-btn').addEventListener('click', async () => {
    const accounts = await getAll('accounts');
    let pfAccount = accounts.find(isPfAccount) || null;
    const last = meta.months[meta.months.length - 1] || null;
    const newest = !pfAccount || !pfAccount.pf?.lastMonth || !last || last.date >= pfAccount.pf.lastMonth;

    // The opening balance already contains every contribution and every rupee
    // of interest before its date, so it is the anchor: nothing dated on or
    // before it is counted again. A passbook for an older year never moves
    // that anchor backwards.
    const anchor = meta.opening || null;
    const keepAnchor = pfAccount && pfAccount.knownBalanceDate && anchor && pfAccount.knownBalanceDate > anchor.asOf;
    pfAccount = {
      ...(pfAccount || { id: newId(), label: 'Provident fund', type: 'pf', last4: null }),
      type: 'pf',
      issuer: meta.employer || (pfAccount && pfAccount.issuer) || null,
      knownBalance: keepAnchor ? pfAccount.knownBalance : anchor ? anchor.employee + anchor.employer : 0,
      knownBalanceDate: keepAnchor ? pfAccount.knownBalanceDate : anchor ? anchor.asOf : null,
      pf: {
        ...((pfAccount && pfAccount.pf) || {}),
        uan: meta.uan || (pfAccount && pfAccount.pf?.uan) || null,
        memberId: meta.memberId || null,
        ratePct: (pfAccount && pfAccount.pf?.ratePct) ?? DEFAULT_PF_RATE,
        // A passbook for an older year must not put last year's pay back:
        // what "every month from now on" looks like comes from the newest
        // passbook seen.
        ...(newest
          ? {
              basic: meta.lastWages ?? null,
              monthlyIntoFund: last ? last.employee + last.employer : 0,
              lastMonth: last ? last.date : null,
              // The passbook says what the employer actually does, so the
              // rules aren't guessed at for months not imported yet.
              noEps: meta.totals.pension === 0,
            }
          : {}),
        pensionPaid: ((pfAccount && pfAccount.pf?.pensionPaid) || 0) + meta.totals.pension,
      },
    };
    await put('accounts', pfAccount);

    const cutoff = pfAccount.knownBalanceDate;
    const existing = (await getAll('transactions')).filter((t) => t.accountId === pfAccount.id);
    let removed = 0;
    for (const t of existing) {
      if (cutoff && t.date <= cutoff) {
        await remove('transactions', t.id);
        removed++;
      }
    }

    let saved = 0;
    for (const month of meta.months) {
      if (cutoff && month.date <= cutoff) continue;
      const already = existing.find((t) => t.date.slice(0, 7) === month.date.slice(0, 7) && t.date > cutoff);
      await put('transactions', {
        id: already ? already.id : newId(),
        accountId: pfAccount.id,
        date: month.date,
        rawDescription: `PF · ${month.wageMonth}`,
        amount: month.employee + month.employer,
        direction: 'credit',
        categoryId: null,
        source: 'epfo',
        importBatchId: null,
        isTransfer: true,
        notes: null,
      });
      saved++;
    }

    const fund = pfPosition(pfAccount, await getAll('transactions'));
    const lines = [['In your PF now', formatRupees(fund.balance), 'in']];
    if (fund.pendingInterest) lines.push(['Interest due on 31 March', `+${formatRupees(fund.pendingInterest)}`, 'in']);
    if (anchor && !keepAnchor) lines.push([`Starting balance, ${formatDateNice(anchor.asOf)}`, formatRupees(anchor.employee + anchor.employer)]);
    if (removed) lines.push(['Already inside that balance, removed', String(removed)]);
    await showDone({ title: `${saved} month${saved === 1 ? '' : 's'} of PF saved`, lines });
  });
}
// A payslip, before anything is saved: the month's pay, and the provident
// fund it puts away.
function renderPayslipReview(resultsEl) {
  const { meta, account } = state;
  const settings = (account && account.pf) || {};
  const share = meta.basic ? pfContribution(meta.basic, settings) : null;
  const line = (label, value, note = '') =>
    `<div class="totals-row"><span>${label}${note ? `<br><span class="muted-note">${note}</span>` : ''}</span><span>${value}</span></div>`;

  resultsEl.innerHTML = `
    <div class="totals-card">
      <div class="totals-row"><span><strong>${escapeHtml(meta.monthLabel || 'Payslip')}</strong></span><span class="muted-note">${escapeHtml(meta.employer || '')}</span></div>
      ${meta.net != null ? line('Paid into your bank', formatCurrency(meta.net)) : ''}
      ${meta.basic != null ? line('Basic pay', formatCurrency(meta.basic)) : ''}
      ${meta.pfEmployee != null ? line('PF from your pay', formatCurrency(meta.pfEmployee), meta.pfYearToDate ? `${formatCurrency(meta.pfYearToDate)} this financial year` : '') : ''}
      ${share ? line('Your employer adds', formatCurrency(share.employerEpf), `plus ${formatCurrency(share.eps)} to your pension`) : ''}
      ${share ? `<div class="totals-row net"><span>Into the fund this month</span><span class="in">${formatCurrency((meta.pfEmployee ?? share.employee) + share.employerEpf)}</span></div>` : ''}
      ${meta.incomeTax != null ? line('Income tax', formatCurrency(meta.incomeTax)) : ''}
      ${
        meta.net != null
          ? `<label class="checkbox-row"><input type="checkbox" id="payslip-set-income" checked><span>Use ${formatCurrency(meta.net)} as your monthly salary</span></label>`
          : ''
      }
      <p class="muted-note">Employer's share worked out by EPF rules: 12% of basic, less ₹1,250 pension.</p>
    </div>
    <button type="button" id="payslip-save-btn" class="btn-primary">${account ? 'Add this month' : 'Start tracking my PF'}</button>
    <p id="import-commit-status" class="status" hidden></p>
  `;

  resultsEl.querySelector('#payslip-save-btn').addEventListener('click', async () => {
    const statusEl = resultsEl.querySelector('#import-commit-status');
    if (!meta.month) return showStatus(statusEl, "Couldn't tell which month this payslip is for.", true);
    const accounts = await getAll('accounts');
    let pfAccount = accounts.find(isPfAccount) || null;
    if (!pfAccount) {
      pfAccount = {
        id: newId(),
        label: 'Provident fund',
        type: 'pf',
        issuer: meta.employer || null,
        last4: null,
        knownBalance: 0,
        knownBalanceDate: `${meta.month}-01`,
        pf: { uan: meta.uan || null, ratePct: DEFAULT_PF_RATE, employeePct: 12, employerPct: 12 },
      };
    }
    const basic = meta.basic || 0;
    const contribution = pfContribution(basic, pfAccount.pf || {});
    const employee = meta.pfEmployee ?? contribution.employee;
    const intoFund = employee + contribution.employerEpf;
    pfAccount = {
      ...pfAccount,
      pf: {
        ...(pfAccount.pf || {}),
        uan: pfAccount.pf?.uan || meta.uan || null,
        basic,
        monthlyIntoFund: intoFund,
        pensionPaid: (pfAccount.pf?.pensionPaid || 0) + contribution.eps,
      },
    };
    await put('accounts', pfAccount);

    // One credit per month, so the same payslip twice doesn't count twice.
    const existing = (await getAll('transactions')).find((t) => t.accountId === pfAccount.id && t.date.slice(0, 7) === meta.month);
    const lastDay = new Date(Number(meta.month.slice(0, 4)), Number(meta.month.slice(5, 7)), 0).getDate();
    await put('transactions', {
      id: existing ? existing.id : newId(),
      accountId: pfAccount.id,
      date: `${meta.month}-${lastDay}`,
      rawDescription: `PF · ${meta.monthLabel || meta.month}`,
      amount: intoFund,
      direction: 'credit',
      categoryId: null,
      source: 'payslip',
      importBatchId: null,
      isTransfer: true,
      notes: null,
    });

    const setIncome = resultsEl.querySelector('#payslip-set-income')?.checked && meta.net != null;
    if (setIncome) await setSetting('monthlyIncome', meta.net);
    const lines = [['Into your PF this month', formatRupees(intoFund), 'in']];
    if (setIncome) lines.push(['Your monthly salary is now', formatRupees(meta.net)]);
    if (existing) lines.push(['Replaced', 'the same month saved before']);
    await showDone({ title: `${meta.monthLabel || meta.month} payslip saved`, lines });
  });
}
// The loan summary, to check before it becomes an account.
function renderLoanReview(resultsEl) {
  const { meta, accounts, account } = state;
  const loan = meta.loan;
  const payers = accounts.filter((a) => ['bank', 'savings'].includes(a.type));
  const line = (label, value, note = '') =>
    `<div class="totals-row"><span>${label}${note ? `<br><span class="muted-note">${note}</span>` : ''}</span><span>${value}</span></div>`;

  resultsEl.innerHTML = `
    <div class="totals-card">
      <div class="totals-row"><span><strong>${escapeHtml(loan.product)}</strong>${meta.accountLast4 ? ` ••${escapeHtml(meta.accountLast4)}` : ''}</span><span class="muted-note">${account ? 'already added' : 'new'}</span></div>
      ${loan.outstanding != null ? line('Still owed', formatCurrency(loan.outstanding), loan.outstandingAsOf ? `as of ${formatDateNice(loan.outstandingAsOf)}` : '') : ''}
      ${
        loan.released != null && loan.principal && loan.released < loan.principal * 0.995
          ? line('Released so far', formatCurrency(loan.released), `of ${formatCurrency(loan.principal)} sanctioned · the rest comes as the building goes up`)
          : loan.principal != null
          ? line('Borrowed', formatCurrency(loan.principal))
          : ''
      }
      ${loan.ledger ? line('History read', `${loan.ledger.filter((e) => e.kind === 'payment').length} payments`, `every interest charge and payment since ${formatDateNice(loan.ledger[0].date)}`) : ''}
      ${loan.emi ? line('Goes out each month', formatCurrency(loan.emi), `${loan.day ? `on the ${ordinal(loan.day)}` : ''}${loan.printedEmi && loan.printedEmi !== loan.emi ? ` · EMI is ${formatCurrency(loan.printedEmi)}, you pay more` : ''}`) : ''}
      ${loan.ratePct ? line('Interest', `${loan.ratePct}% a year`) : ''}
      ${loan.monthsLeft ? line('Months left', String(loan.monthsLeft), loan.totalEmis ? `of ${loan.totalEmis}` : '') : ''}
      <label class="field" style="margin-top:var(--space-xs)">
        <span>Paid from</span>
        <select id="loan-paid-from">
          <option value="">Pick the account it leaves from</option>
          ${payers.map((a) => `<option value="${a.id}" ${account && account.loan && account.loan.paidFromId === a.id ? 'selected' : ''}>${escapeHtml(a.label)}</option>`).join('')}
        </select>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="loan-in-budget" ${account && account.loan && account.loan.inBudget === false ? '' : 'checked'}>
        <span>Count this EMI in my monthly budget<br><span class="muted-note">Turn off if a commitment on Plan already covers it.</span></span>
      </label>
    </div>
    <button type="button" id="loan-save-btn" class="btn-primary">${account ? 'Update this loan' : 'Add this loan'}</button>
    <p id="import-commit-status" class="status" hidden></p>
  `;

  resultsEl.querySelector('#loan-save-btn').addEventListener('click', async () => {
    const paidFromId = resultsEl.querySelector('#loan-paid-from').value || null;
    const previous = state.account ? (await getAll('accounts')).find((a) => a.id === state.account.id) : null;
    const saved = {
      ...(previous || {}),
      id: previous ? previous.id : newId(),
      label: previous ? previous.label : `${loan.product} ••${meta.accountLast4 || ''}`.trim(),
      type: 'loan',
      issuer: previous ? previous.issuer : state.parser.issuerLabel,
      last4: meta.accountLast4 || null,
      loanAccountNo: meta.accountNo || null,
      // What you set by hand is kept; the statement only moves the figures it
      // actually prints.
      loan: {
        ...(previous && previous.loan ? previous.loan : {}),
        ...loan,
        paidFromId: paidFromId || (previous && previous.loan ? previous.loan.paidFromId : null),
        inBudget: resultsEl.querySelector('#loan-in-budget').checked,
      },
    };
    await put('accounts', saved);
    const position = loanPosition(saved, await getAll('transactions'));
    const lines = [];
    if (position.outstanding != null) lines.push(['Still owed', formatRupees(position.outstanding), 'out']);
    if (position.underConstruction) lines.push(['Still to be released', formatRupees(position.stillToRelease)]);
    if (position.paidBack != null) lines.push(['Paid back so far', formatRupees(position.paidBack), 'in']);
    lines.push(['In your monthly budget', saved.loan.inBudget === false ? 'no, a commitment on Plan covers it' : `${formatRupees(loan.emi || 0)} a month`]);
    await showDone({ title: `${saved.label} ${previous ? 'updated' : 'added'}`, lines });
  });
}
// A card from the list's last four digits: first the same bank, then any card
// with those digits, then a card these digits were linked to before.
function findCardAccount(accounts, parser, last4) {
  if (!last4) return null;
  const cards = accounts.filter((a) => a.type === 'card');
  return (
    cards.find((a) => a.issuer === parser.issuerLabel && a.last4 === last4) ||
    cards.find((a) => a.last4 === last4) ||
    cards.find((a) => Array.isArray(a.linkedLast4s) && a.linkedLast4s.includes(last4)) ||
    null
  );
}

// A statement's account: the same bank and digits, otherwise - for a card -
// the one card with those digits, recorded or linked from a pasted list. A
// card set up by hand with a differently written bank name would otherwise get
// a second account beside it, and its list rows would never be replaced.
function findStatementAccount(accounts, parser, last4) {
  const exact = accounts.find((a) => a.type === parser.accountType && sameBank(a.issuer, parser.issuerLabel) && a.last4 === last4);
  // Bank accounts too: one added by hand as "HDFC" rather than "HDFC Bank"
  // used to get a second account created beside it on every import.
  if (exact || !last4) return exact || null;
  const byDigits = accounts.filter(
    (a) => a.type === parser.accountType && (a.last4 === last4 || (Array.isArray(a.linkedLast4s) && a.linkedLast4s.includes(last4)))
  );
  return byDigits.length === 1 ? byDigits[0] : null;
}

// The same bank under the names it goes by: "SBI" on a statement is "State
// Bank Of India" on an account set up by hand.
// Two names for one bank ("SBI" and "State Bank of India") are the same bank.
const BANK_NAMES = BANKS.map(([, re]) => re);
function sameBank(a, b) {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return BANK_NAMES.some((re) => re.test(a) && re.test(b));
}

// No sure match: the likeliest account for a statement - the only one of its
// kind at the same bank - offered on the Check step for you to confirm, never
// assumed. Guessing silently was how a second "SBI" account could appear
// beside the one you already had, with the statement saved on the wrong one.
function likelyStatementAccount(accounts, parser) {
  const sameKind = accounts.filter((a) => a.type === parser.accountType && sameBank(a.issuer, parser.issuerLabel));
  return sameKind.length === 1 ? sameKind[0] : null;
}

// Works out what this import will match, replace and remove on the chosen
// account. Re-run when the card is picked, since all of it depends on which
// account the rows land on.
async function analyse() {
  const { rows, meta, provisional, account } = state;
  // A business account's rows take business categories, and a home one's
  // home categories: a category learned from the other kind is dropped.
  const fits = new Set(categoriesFor(categoriesCache, account).map((c) => c.id));
  for (const row of rows) {
    if (!row) continue;
    if ('_ownCategoryId' in row) row.categoryId = row._ownCategoryId;
    if (row.categoryId && !fits.has(row.categoryId)) row.categoryId = null;
    delete row._matchedManualId;
    delete row._matchedSource;
    delete row._carry;
    delete row._keepExisting;
    delete row._duplicate;
  }
  state.unmatchedLogged = [];
  state.superseded = [];
  state.duplicateCount = 0;
  state.priorImport = null;
  if (!account) return;

  const allTxns = await getAll('transactions');
  const dates = rows.filter(Boolean).map((r) => r.date).sort();
  // A current list can hold a refund dated before its cycle (ICICI lists an
  // 11 Aug refund in the cycle from 26 Aug), so its span is the rows' own
  // dates. A statement's span is its printed period.
  const rangeStart = provisional ? dates[0] : meta.periodStart || dates[0];
  const rangeEnd = provisional ? dates[dates.length - 1] : meta.periodEnd || dates[dates.length - 1];

  // Rows from current-transactions lists taken during the cycle this import
  // covers. They're chosen by WHEN THE LIST WAS TAKEN, not by each row's own
  // date: a list can carry a refund dated weeks before its cycle (ICICI's
  // 11 Aug Pepe Jeans refund sits in the cycle from 26 Aug). Picking by row
  // date would leave that row behind when the statement arrives, and the
  // refund would then be counted twice.
  //
  // A list is dated by the day it was taken. The pool for a new list is every
  // list taken since the last imported statement - including ones from a
  // cycle that has closed but whose statement isn't in yet. The pool for a
  // statement is every list taken since the previous statement, including
  // lists taken just after it closed that still show its last few days; of
  // those, only rows dated inside the statement can be on it.
  const batches = await getAll('importBatches');
  const lastStatementEnd = [account.statementPeriodEnd, ...batches.filter((b) => b.accountId === account.id && !b.provisional).map((b) => b.periodEnd)]
    .filter(Boolean)
    .sort()
    .pop();
  const statementStart = meta.periodStart || rangeStart;
  const statementEnd = meta.periodEnd || rangeEnd;
  const listBatches = batches.filter(
    (b) =>
      b.accountId === account.id &&
      b.provisional &&
      (provisional ? !lastStatementEnd || listTakenOn(b) > lastStatementEnd : listTakenOn(b) >= statementStart && (b.periodStart || '') <= statementEnd)
  );
  const listBatchIds = new Set(listBatches.map((b) => b.id));
  const takenOnById = new Map(listBatches.map((b) => [b.id, listTakenOn(b)]));
  const listRows = allTxns.filter(
    (t) => t.accountId === account.id && t.source === 'unbilled' && listBatchIds.has(t.importBatchId) && (provisional || t.date <= statementEnd)
  );

  // Everything already on this card that this import should confirm rather
  // than duplicate: those list rows, plus entries you logged and bank alerts
  // you saved within a few days of the period (a spend alerted on the 24th can
  // post on the 26th).
  const logged = allTxns.filter(
    (t) =>
      t.accountId === account.id &&
      (t.source === 'manual' || t.source === 'alert') &&
      t.date >= shiftDays(rangeStart, -3) &&
      t.date <= shiftDays(rangeEnd, 3)
  );
  const pool = [...listRows, ...logged];
  const { unmatchedManual } = matchAgainstManualEntries(rows.filter(Boolean), pool);
  const byId = new Map(pool.map((t) => [t.id, t]));

  // Re-pasting a list you already imported: a row identical to the one it
  // matched is left exactly as it is, so nothing is rewritten or re-synced.
  // Only for lists - a statement must always take the row over, turning it
  // from "unbilled" into a billed statement row, even when nothing else changed.
  for (const row of rows) {
    if (!provisional || !row || !row._matchedManualId) continue;
    const existing = byId.get(row._matchedManualId);
    if (
      existing &&
      existing.source === 'unbilled' &&
      existing.date === row.date &&
      existing.rawDescription === row.description &&
      (existing.categoryId || null) === (row.categoryId || null)
    ) {
      row._keepExisting = true;
    }
  }

  const inRange = (t) => t.date >= rangeStart && t.date <= rangeEnd;
  // Rows from an earlier list that this import doesn't contain - a dropped
  // pre-authorisation, a reversed charge. The newer source is right, so they go.
  //   - A statement is the final word on its cycle: every unmatched list row
  //     from that cycle goes.
  //   - A newer list only speaks for the dates it shows. If you copied just
  //     the latest screenful, older rows it doesn't show aren't "gone".
  //   - Except rows from a list taken after the statement closed: a row there
  //     dated inside the period but missing from the statement is most likely
  //     a refund that posted after the statement, so it stays.
  state.superseded = unmatchedManual.filter(
    (t) => t.source === 'unbilled' && (provisional ? inRange(t) : (takenOnById.get(t.importBatchId) || '') <= statementEnd)
  );
  // A spreadsheet may be any slice of an account's history - a card's
  // unbilled export as much as a closed statement - so it never removes rows.
  if (state.pickAccount) state.superseded = [];
  // Entries you logged yourself that aren't on the list: kept, but pointed out.
  state.unmatchedLogged = unmatchedManual.filter((t) => t.source !== 'unbilled' && inRange(t));

  if (!provisional) {
    // Re-importing an overlapping statement would silently double every row -
    // including one downloaded in a different format that words the same
    // payment differently (see duplicates.js). Each saved row can only be the
    // twin of one new row, so two genuine identical payments stay two.
    const alreadyImported = allTxns.filter((t) => t.accountId === account.id && t.source === 'statement');
    const taken = new Set();
    for (const row of rows) {
      if (!row) continue;
      const candidate = { accountId: account.id, date: row.date, amount: row.amount, direction: row.direction, rawDescription: row.description, bankRef: row.ref || null };
      const twin = alreadyImported.find((t) => !taken.has(t.id) && sameTransaction(t, candidate));
      if (twin) {
        taken.add(twin.id);
        row._duplicate = true;
        state.duplicateCount++;
      }
    }
    // A spreadsheet and a PDF of the same account can word every payment
    // differently ("TRANSFER TO 51112222001" against "DIRECT DR 0051112222001
    // OF ..."), and print different reference numbers too, so neither can
    // find them. What can: on one account, one day, one amount, as many
    // payments as are already saved are the same payments. Two real ₹23,000
    // EMIs on the 15th stay two, because each saved row answers for one new
    // row only; a third on that day, missing from the earlier download, is new.
    for (const row of rows) {
      if (!row || row._duplicate) continue;
      const twin = alreadyImported.find((t) => !taken.has(t.id) && t.date === row.date && t.amount === row.amount && t.direction === row.direction);
      if (twin) {
        taken.add(twin.id);
        row._duplicate = true;
        state.duplicateCount++;
      }
    }
    state.skipDuplicates = state.duplicateCount > 0;
    state.priorImport =
      batches
        .filter((b) => b.accountId === account.id && !b.provisional && b.periodStart <= rangeEnd && b.periodEnd >= rangeStart)
        .sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))[0] || null;
  }
}

function renderResults(resultsEl) {
  const { rows, meta, parser, provisional, pickAccount, account, accounts } = state;
  const live = rows.filter(Boolean);
  const matchedCount = live.filter((r) => r._matchedManualId && !r._keepExisting).length;
  const unchangedCount = live.filter((r) => r._keepExisting).length;
  // Spreadsheets go on bank accounts only: a card's rows are read against its
  // statement dates, which a spreadsheet can't give.
  const choices = accounts.filter((a) => a.type === (pickAccount ? 'bank' : 'card'));
  const noun = pickAccount ? 'bank account' : 'card';

  const period = meta.periodStart && meta.periodEnd ? ` · ${formatDateNice(meta.periodStart)} to ${formatDateNice(meta.periodEnd)}` : '';
  const alreadyIn = matchedCount + unchangedCount + (state.skipDuplicates ? state.duplicateCount || 0 : 0);
  // A row needs you only when the app couldn't settle it: money out with no
  // category yet. Those come first; everything else waits folded below.
  const needsYou = (row) => row && row.direction === 'debit' && !row.categoryId && !row._matchedManualId && !row._keepExisting;
  const attention = rows.map((row, idx) => (needsYou(row) ? idx : -1)).filter((i) => i >= 0);
  const others = rows.map((row, idx) => (row && !needsYou(row) ? idx : -1)).filter((i) => i >= 0);
  const queueNote = state.queue && state.queue.length ? ` · ${state.queue.length} more card${state.queue.length === 1 ? '' : 's'} after this` : '';

  resultsEl.innerHTML = `
    <div class="totals-card import-headline">
      <div class="muted-note">${provisional ? 'Current transactions' : 'Statement'} · ${escapeHtml(parser.issuerLabel)}${meta.accountLast4 ? ` ••${meta.accountLast4}` : ''}${period}${queueNote}</div>
      <div class="import-big"><span id="import-row-count"></span> new</div>
      ${alreadyIn ? `<div class="muted-note">${alreadyIn} already in the app</div>` : ''}
      <div class="totals-row"><span>Money out</span><span class="out" id="import-out"></span></div>
      <div class="totals-row"><span>Money in</span><span class="in" id="import-in"></span></div>
      ${
        meta.deposit
          ? `<div class="totals-row"><span>${meta.deposit.kind === 'MOD' ? 'MOD deposits' : 'Fixed deposits'}<br><span class="muted-note">kept apart as put away${
              meta.deposit.atMaturity ? `, ${formatRupees(meta.deposit.atMaturity)} at maturity` : ''
            }</span></span><span>${formatRupees(meta.deposit.balance)}</span></div>`
          : ''
      }
      ${
        state.accountUncertain
          ? // Not sure whose statement this is: you say, rather than the app
            // quietly starting a second account for it.
            `<label class="field" style="margin:var(--space-xs) 0 var(--space-3xs)">
              <span>Which account is this?</span>
              <select id="import-card">
                ${accounts
                  .filter((a) => a.type === parser.accountType)
                  .map((a) => `<option value="${a.id}" ${account && account.id === a.id ? 'selected' : ''}>${escapeHtml(a.label)}</option>`)
                  .join('')}
                <option value="" ${account ? '' : 'selected'}>A new account</option>
              </select>
            </label>
            <p class="muted-note">The statement's bank and last four digits${meta.accountLast4 ? ` (••${meta.accountLast4})` : ''} don't match an account. Pick one once; next time it's automatic.</p>`
          : ''
      }
      ${
        provisional || pickAccount
          ? `<label class="field" style="margin:var(--space-xs) 0 var(--space-3xs)">
              <span>${pickAccount ? 'Account' : 'Card'}</span>
              <select id="import-card">
                <option value="">Pick the ${noun} these belong to</option>
                ${choices.map((a) => `<option value="${a.id}" ${account && account.id === a.id ? 'selected' : ''}>${escapeHtml(a.label)}</option>`).join('')}
              </select>
            </label>
            ${!account ? `<p class="muted-note">Pick the ${noun} first.${pickAccount && !choices.length ? ' Add the bank account on Accounts.' : ''}</p>` : ''}`
          : ''
      }
      ${
        parser.general && !pickAccount
          ? `<p class="muted-note">New bank for Kawach: check a few rows against the statement.</p>`
          : ''
      }
      ${
        pickAccount
          ? `<p class="muted-note">Check a few rows below against the file: dates, and money out vs money in.${
              meta.skippedRows ? ` ${meta.skippedRows} line${meta.skippedRows === 1 ? '' : 's'} without a date or amount (totals, notes) left out.` : ''
            }</p>`
          : ''
      }
      ${renderReconciliation(meta)}
      ${provisional ? '<details class="import-more"><summary>Check it against the bank</summary><div id="import-live-totals"></div></details>' : ''}
    </div>
    ${provisional ? '' : renderDuplicateWarning(state)}
    ${renderSuperseded(state.superseded, provisional)}
    ${renderUnmatchedLogged(state.unmatchedLogged, provisional)}
    ${renderEmis(state.emis)}
    ${
      attention.length
        ? `<h3>Pick a category · ${attention.length}</h3>
           <div id="import-row-attention" class="import-row-list"></div>`
        : ''
    }
    ${
      others.length
        ? `<details class="import-all" ${attention.length ? '' : 'open'}>
             <summary>${attention.length ? `The other ${others.length}` : `All ${others.length}`}</summary>
             <div id="import-row-list" class="import-row-list"></div>
           </details>`
        : ''
    }
    <div class="import-save-bar">
      <button type="button" id="import-commit-btn" class="btn-primary btn-block">Save</button>
      ${state.queue && state.queue.length ? '<button type="button" id="import-skip-btn" class="btn-tiny btn-block">Skip this card</button>' : ''}
      <p id="import-commit-status" class="status" hidden></p>
      <div id="import-next"></div>
    </div>
  `;

  const fill = (selector, indexes) => {
    const el = resultsEl.querySelector(selector);
    if (el) el.innerHTML = indexes.map((idx) => rowTemplate(rows[idx], idx, categoriesFor(categoriesCache, state.account))).join('');
  };
  fill('#import-row-attention', attention);
  fill('#import-row-list', others);
  resultsEl.querySelector('#import-commit-btn').addEventListener('click', () => commit(resultsEl));

  const skipBox = resultsEl.querySelector('#skip-duplicates');
  if (skipBox) {
    skipBox.addEventListener('change', () => {
      state.skipDuplicates = skipBox.checked;
      updateTotals(resultsEl);
    });
  }

  const cardSelect = resultsEl.querySelector('#import-card');
  if (cardSelect) {
    cardSelect.addEventListener('change', async () => {
      state.account = state.accounts.find((a) => a.id === cardSelect.value) || null;
      await analyse();
      renderResults(resultsEl);
    });
  }

  updateTotals(resultsEl);
}

function renderSuperseded(list, provisional) {
  if (!list || !list.length) return '';
  return `
    <div class="totals-card warn-card">
      <div class="totals-row"><span>${list.length} earlier row${list.length === 1 ? '' : 's'} ${provisional ? "aren't on this list any more" : "didn't make it onto the statement"} and will be removed</span></div>
      <ul class="breakdown-list">
        ${list.map((t) => `<li class="breakdown-row"><span>${escapeHtml(t.rawDescription)} (${formatDateNice(t.date)})</span><span class="${t.direction === 'credit' ? 'in' : 'out'}">${t.direction === 'credit' ? '+' : '-'}${formatCurrency(t.amount)}</span></li>`).join('')}
      </ul>
      <p class="muted-note">${provisional ? 'Usually a dropped hold or a reversed charge.' : 'The statement is the final word.'}</p>
    </div>
  `;
}

function renderEmis(emis) {
  if (!emis || emis.length === 0) return '';
  return `
    <div class="totals-card">
      <div class="totals-row"><span><strong>EMI${emis.length === 1 ? '' : 's'} on this card</strong></span></div>
      ${emis
        .map(
          (emi, idx) => `
        <label class="checkbox-row">
          <input type="checkbox" class="import-emi-keep" data-idx="${idx}" ${emi.keep ? 'checked' : ''}>
          <span>${escapeHtml(emi.merchant)} · ${formatCurrency(emi.amount)} a month<br><span class="muted-note">instalment ${emi.current} of ${emi.total} · ${
            emi.left ? `${emi.left} more, last one ${formatDateNice(emi.endDate)}` : 'this is the last one'
          } · due around the ${ordinal(Number(emi.date.slice(8, 10)))}</span></span>
        </label>`
        )
        .join('')}
      <p class="muted-note">Ticked EMIs go on Plan and end after the last instalment.</p>
    </div>
  `;
}

function renderUnmatchedLogged(list, provisional) {
  if (!list || list.length === 0) return '';
  return `
    <div class="totals-card warn-card">
      <div class="totals-row"><span>${icon('alert')} ${list.length} entr${list.length === 1 ? 'y' : 'ies'} you logged ${provisional ? "aren't on this list" : "in this period didn't show up in the statement"}</span></div>
      <ul class="breakdown-list">
        ${list.map((m) => `<li class="breakdown-row"><span>${escapeHtml(m.rawDescription)} (${formatDateNice(m.date)})</span><span class="${m.direction === 'credit' ? 'in' : 'out'}">${m.direction === 'credit' ? '+' : '-'}${formatCurrency(m.amount)}</span></li>`).join('')}
      </ul>
      <p class="muted-note">${provisional ? "They stay. New spends take a day or two to appear." : "They stay. Check they weren't cancelled."}</p>
    </div>
  `;
}

function renderDuplicateWarning({ duplicateCount, priorImport }) {
  if (!duplicateCount && !priorImport) return '';
  const priorNote = priorImport
    ? `<div class="muted-note">You already imported ${formatDateNice(priorImport.periodStart)} to ${formatDateNice(priorImport.periodEnd)} for this account on ${formatDateNice(priorImport.importedAt)}.</div>`
    : '';
  if (!duplicateCount) {
    return `<div class="totals-card warn-card"><div class="totals-row"><span>${icon('alert')} Overlapping statement</span></div>${priorNote}</div>`;
  }
  return `
    <div class="totals-card warn-card">
      <div class="totals-row"><span>${icon('alert')} ${duplicateCount} of these rows look already imported</span></div>
      ${priorNote}
      <label class="checkbox-row">
        <input type="checkbox" id="skip-duplicates" checked>
        <span>Skip the ${duplicateCount} duplicate row${duplicateCount === 1 ? '' : 's'} (recommended)</span>
      </label>
    </div>
  `;
}

function renderReconciliation(meta) {
  if (meta.printedCharges != null) {
    return meta.reconciled
      ? `<div class="totals-row"><span class="in">Matches ICICI's printed totals ✓</span></div>`
      : `<div class="totals-row"><span class="out">${icon('alert')} Read ${formatCurrency(meta.parsedDebitTotal)} charges / ${formatCurrency(meta.parsedCreditTotal)} credits, but ICICI prints ${formatCurrency(meta.printedCharges)} / ${formatCurrency(meta.printedCredits)} - some rows may be off</span></div>`;
  }
  if (meta.reconciled === true) {
    return `<div class="totals-row"><span class="in">Reconciles with the statement's own balance ✓</span></div>`;
  }
  if (meta.reconciled === false && meta.statedClosingBalance != null) {
    return `<div class="totals-row"><span class="out">${icon('alert')} Computed closing ₹${meta.computedClosingBalance.toFixed(2)} vs statement's ₹${meta.statedClosingBalance.toFixed(2)} - some rows may be off</span></div>`;
  }
  if (meta.reconciled === false && meta.statementPurchasesTotal != null) {
    return `<div class="totals-row"><span class="out">${icon('alert')} Parsed debit total ${formatCurrency(meta.parsedDebitTotal)} vs statement's purchase total ${formatCurrency(meta.statementPurchasesTotal)}</span></div>`;
  }
  if (meta.reconciled === true && meta.statementPurchasesTotal != null) {
    return `<div class="totals-row"><span class="in">Matches statement's purchase total ✓</span></div>`;
  }
  return '';
}

function rowTemplate(row, idx, categories) {
  const badge = row._keepExisting
    ? '<div class="import-row-badge">Unchanged</div>'
    : row._matchedManualId
      ? `<div class="import-row-badge">${row._matchedSource === 'alert' ? 'Matches a bank alert you saved' : row._matchedSource === 'unbilled' ? 'Updates your earlier list' : 'Already logged'}</div>`
      : '';
  return `
    <div class="import-row ${row._matchedManualId ? 'import-row-matched' : ''} ${row._duplicate ? 'import-row-duplicate' : ''}" data-idx="${idx}">
      ${row._duplicate ? '<div class="import-row-badge badge-warn">Already imported</div>' : ''}
      ${badge}
      <div class="import-row-top">
        <input type="date" class="ir-field ir-date" data-field="date" value="${row.date}">
        <input type="text" class="ir-field ir-desc" data-field="description" value="${escapeAttr(row.description)}">
        <button type="button" class="icon-btn ir-delete" title="Delete row" aria-label="Delete row">${icon('close')}</button>
      </div>
      <div class="import-row-bottom">
        <div class="direction-toggle small">
          <button type="button" class="dir-btn ir-dir ${row.direction === 'debit' ? 'active' : ''}" data-dir="debit">Spent</button>
          <button type="button" class="dir-btn ir-dir ${row.direction === 'credit' ? 'active' : ''}" data-dir="credit">Received</button>
        </div>
        <input type="number" step="0.01" class="ir-field ir-amount" data-field="amount" value="${(row.amount / 100).toFixed(2)}">
        <select class="ir-field ir-category" data-field="categoryId">
          <option value="">Uncategorized</option>
          ${categories.map((c) => `<option value="${c.id}" ${c.id === row.categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
    </div>
  `;
}

function handleFieldChange(e, resultsEl) {
  // After a save, the saved rows stay on screen but no longer belong to
  // anything that can change.
  if (!state || !state.rows) return;
  if (e.target.id === 'import-check-figure') {
    updateTotals(resultsEl);
    return;
  }
  const field = e.target.dataset.field;
  if (!field) return;
  const rowEl = e.target.closest('.import-row');
  if (!rowEl) return;
  const row = state.rows[Number(rowEl.dataset.idx)];
  if (!row) return;

  if (field === 'amount') {
    row.amount = Math.round(parseFloat(e.target.value || '0') * 100);
  } else if (field === 'categoryId') {
    row.categoryId = e.target.value || null;
    row._ownCategoryId = row.categoryId;
  } else {
    row[field] = e.target.value;
  }
  // An edited row is no longer identical to the saved one; save it for real.
  delete row._keepExisting;
  updateTotals(resultsEl);
}

function handleClick(e, resultsEl, container) {
  // Next card, or skipping this one. The queue is taken once and the buttons
  // cleared at the tap, so a double tap can't jump over a card.
  const nextBtn = e.target.closest('#import-next-btn, #import-skip-btn');
  if (nextBtn && state && state.queue && state.queue.length && !committing) {
    const [next, ...rest] = state.queue;
    state.queue = [];
    nextBtn.disabled = true;
    const status = container.querySelector('#import-status');
    startReview({ parser: state.parser, text: next.text, last4: next.last4, queue: rest }, status, resultsEl);
    return;
  }
  if (!state || !state.rows) return;

  const emiBox = e.target.closest('.import-emi-keep');
  if (emiBox && state.emis) {
    const emi = state.emis[Number(emiBox.dataset.idx)];
    if (emi) emi.keep = emiBox.checked;
    return;
  }

  const deleteBtn = e.target.closest('.ir-delete');
  if (deleteBtn) {
    const rowEl = deleteBtn.closest('.import-row');
    state.rows[Number(rowEl.dataset.idx)] = null;
    rowEl.remove();
    updateTotals(resultsEl);
    return;
  }

  const dirBtn = e.target.closest('.ir-dir');
  if (dirBtn) {
    const rowEl = dirBtn.closest('.import-row');
    const row = state.rows[Number(rowEl.dataset.idx)];
    row.direction = dirBtn.dataset.dir;
    delete row._keepExisting;
    rowEl.querySelectorAll('.ir-dir').forEach((b) => b.classList.toggle('active', b === dirBtn));
    updateTotals(resultsEl);
  }
}

function committableRows() {
  return state.rows.filter((r) => r && !(state.skipDuplicates && r._duplicate));
}

const isBillPayment = (r) => r.direction === 'credit' && /\b(Bppy|BBPS)\s*Cc\s*Payment|Payment\s+received|BBPS/i.test(r.description);

function updateTotals(resultsEl) {
  if (!state) return;
  const remaining = committableRows();
  // New means the app has never seen it: not a match for something you typed
  // in, not unchanged since the last paste. Those still get saved (they bring
  // the entry up to date) but they aren't news.
  const fresh = remaining.filter((r) => !r._matchedManualId && !r._keepExisting);
  const countEl = resultsEl.querySelector('#import-row-count');
  if (countEl) countEl.textContent = String(fresh.length);
  const total = (list) => list.reduce((s, r) => s + r.amount, 0);
  const outEl = resultsEl.querySelector('#import-out');
  if (outEl) outEl.textContent = formatRupees(total(fresh.filter((r) => r.direction === 'debit')));
  const inEl = resultsEl.querySelector('#import-in');
  if (inEl) inEl.textContent = formatRupees(total(fresh.filter((r) => r.direction === 'credit')));
  const commitBtn = resultsEl.querySelector('#import-commit-btn');
  if (commitBtn) commitBtn.textContent = fresh.length ? `Save ${fresh.length} new` : remaining.length ? 'Save' : 'Nothing to save';

  // For a current list, show what the rows add up to - so a paste can be
  // checked against the unbilled figure the bank's own site shows.
  const totalsEl = resultsEl.querySelector('#import-live-totals');
  if (totalsEl) {
    const sum = (list) => list.reduce((s, r) => s + r.amount, 0);
    const spends = sum(remaining.filter((r) => r.direction === 'debit'));
    const payments = sum(remaining.filter(isBillPayment));
    const refunds = sum(remaining.filter((r) => r.direction === 'credit' && !isBillPayment(r)));
    const owed = spends - refunds;
    const existingInput = totalsEl.querySelector('#import-check-figure');
    const typed = existingInput ? existingInput.value : '';
    const check = parseFloat(typed);
    const matches = Number.isFinite(check) && Math.abs(Math.round(check * 100) - owed) <= 100;
    totalsEl.innerHTML = `
      <div class="totals-row"><span>Spends</span><span class="out">-${formatCurrency(spends)}</span></div>
      <div class="totals-row"><span>Refunds and cashback</span><span class="in">+${formatCurrency(refunds)}</span></div>
      ${payments ? `<div class="totals-row"><span>Bill payments <span class="muted">(not spending)</span></span><span class="muted">${formatCurrency(payments)}</span></div>` : ''}
      <div class="totals-row net"><span>Owed this cycle</span><span>${formatCurrency(owed)}</span></div>
      ${
        state.meta.printedCharges == null
          ? `<label class="field" style="margin-top:var(--space-xs)">
              <span>Check it: the unbilled amount the bank shows ${typed ? (matches ? '<span class="in">✓ matches</span>' : '<span class="out">doesn\'t match</span>') : ''}</span>
              <input type="number" id="import-check-figure" step="0.01" inputmode="decimal" placeholder="Optional" value="${escapeAttr(typed)}">
            </label>`
          : ''
      }
    `;
    // Keep typing in the box uninterrupted after the redraw.
    const input = totalsEl.querySelector('#import-check-figure');
    if (input && document.activeElement && document.activeElement.id === 'import-check-figure') input.focus();
  }
}

let committing = false;

async function commit(resultsEl) {
  // A second tap while the first save is still writing would save every row twice.
  if (committing || !state || !state.rows) return;
  const statusEl = resultsEl.querySelector('#import-commit-status');
  const commitBtn = resultsEl.querySelector('#import-commit-btn');
  const rows = committableRows();
  if (rows.length === 0) {
    showStatus(statusEl, 'No rows left to save.', true);
    return;
  }
  if ((state.provisional || state.pickAccount) && !state.account) {
    showStatus(statusEl, `Pick the ${state.pickAccount ? 'bank account' : 'card'} these belong to first.`, true);
    return;
  }
  committing = true;
  if (commitBtn) commitBtn.disabled = true;
  try {
    await commitRows(resultsEl, rows, statusEl);
  } catch (err) {
    showStatus(statusEl, `Couldn't save: ${err.message}`, true);
    if (commitBtn) commitBtn.disabled = false;
  } finally {
    committing = false;
  }
}

async function commitRows(resultsEl, rows, statusEl) {
  const { meta, parser, provisional, superseded } = state;
  // Read the account again: a sync while the review was open may have
  // changed it (a bill marked paid on the other device), and saving the copy
  // from when the review opened would undo that.
  let account = state.account ? (await getAll('accounts')).find((a) => a.id === state.account.id) || state.account : null;

  if (provisional) {
    // Digits that belong to this card but aren't its recorded number (a
    // renewed card, say) are remembered, so the next list finds it on its own.
    if (meta.accountLast4 && account.last4 !== meta.accountLast4) {
      const links = new Set(account.linkedLast4s || []);
      if (!links.has(meta.accountLast4)) {
        links.add(meta.accountLast4);
        account = { ...account, linkedLast4s: [...links] };
        await put('accounts', account);
      }
    }
    // Deliberately nothing else on the account changes: a current list is
    // not a bill. ICICI's prints "Total Amount Due INR 0", which would
    // otherwise wipe out the real amount due.
  } else {
    if (!account) {
      account = {
        id: newId(),
        label: `${parser.issuerLabel}${meta.accountLast4 ? ` ••${meta.accountLast4}` : ''}`,
        type: parser.accountType,
        issuer: parser.issuerLabel,
        last4: meta.accountLast4 || null,
        billingCycleDay: null,
      };
    }
    // An account you confirmed for a statement it didn't match remembers the
    // statement's digits, so the next one from the same account needs no
    // asking.
    if (meta.accountLast4 && !state.pickAccount && account.last4 !== meta.accountLast4) {
      if (!account.last4) account.last4 = meta.accountLast4;
      else account.linkedLast4s = [...new Set([...(account.linkedLast4s || []), meta.accountLast4])];
    }
    const dates = rows.map((r) => r.date).sort();
    const periodEnd = meta.periodEnd || dates[dates.length - 1];
    // A card statement prints the day its cycle closes, and that beats any
    // day typed in before: a wrong one put every spend in the wrong month.
    // A spreadsheet's last row isn't a statement day, so it only fills in a
    // day that is missing.
    if (account.type === 'card' && meta.periodEnd && !state.pickAccount) {
      account.billingCycleDay = Number(meta.periodEnd.slice(8, 10));
    } else if (account.type === 'card' && !account.billingCycleDay && !state.pickAccount) {
      account.billingCycleDay = Number(periodEnd.slice(8, 10));
    }
    // Only a statement at least as recent as the balance already known moves
    // it: importing last year's statement mustn't put last year's balance back.
    if (
      account.type === 'bank' &&
      meta.statedClosingBalance != null &&
      (!account.knownBalanceDate || periodEnd >= account.knownBalanceDate)
    ) {
      account.knownBalance = Math.round(meta.statedClosingBalance * 100);
      account.knownBalanceDate = periodEnd;
    }
    if (account.type === 'card' && meta.totalAmountDue != null) {
      // A newer statement supersedes the last one, so the "paid" flag resets.
      const isNewerStatement = !account.statementPeriodEnd || periodEnd > account.statementPeriodEnd;
      if (isNewerStatement) {
        account.statementDue = meta.totalAmountDue;
        account.statementMinDue = meta.minimumDue ?? null;
        account.statementDueDate = meta.paymentDueDate ?? null;
        account.statementPeriodEnd = periodEnd;
        account.statementDuePaid = false;
      }
    }
    await put('accounts', account);
    if (meta.deposit) state.depositSaved = await saveDeposit(account, meta.deposit, periodEnd);
  }

  const dates = rows.map((r) => r.date).sort();
  const importBatch = {
    id: newId(),
    accountId: account.id,
    periodStart: provisional ? dates[0] : meta.periodStart || dates[0],
    periodEnd: provisional ? meta.periodEnd || dates[dates.length - 1] : meta.periodEnd || dates[dates.length - 1],
    importedAt: new Date().toISOString(),
    txCount: rows.length,
    provisional,
  };
  // The day a list was taken; see listTakenOn.
  if (provisional) importBatch.takenOn = isoLocal(new Date());
  await put('importBatches', importBatch);

  const existingById = new Map((await getAll('transactions')).map((t) => [t.id, t]));
  let matchedCount = 0;
  let unchanged = 0;
  const newIds = new Set();
  for (const row of rows) {
    if (row._keepExisting) {
      unchanged++;
      // The row now belongs to this list, so undoing an older paste can't take
      // it away, and this list's rows are all in one place.
      const existing = existingById.get(row._matchedManualId);
      if (existing && existing.importBatchId !== importBatch.id) await put('transactions', { ...existing, importBatchId: importBatch.id });
      continue;
    }
    if (row._matchedManualId) {
      await remove('transactions', row._matchedManualId);
      matchedCount++;
    }
    // Carry over what you decided on the entry this row replaces: a category
    // (already applied to the row), a split, money-moved, the alert it came from.
    const carry = row._carry || {};
    const transaction = {
      id: newId(),
      accountId: account.id,
      date: row.date,
      rawDescription: row.description,
      amount: row.amount,
      direction: row.direction,
      categoryId: row.categoryId || null,
      source: provisional ? 'unbilled' : 'statement',
      importBatchId: importBatch.id,
      // A sweep into or out of a deposit at the same bank is marked by the
      // reader as money moving between your own accounts.
      isTransfer: carry.isTransfer === true || row.isTransfer === true,
      notes: carry.notes || null,
      bankRef: row.ref || null,
    };
    if (carry.transferManual) transaction.transferManual = true;
    if (carry.alertKey) transaction.alertKey = carry.alertKey;
    if (carry.alertRef) transaction.alertRef = carry.alertRef;
    if (Array.isArray(carry.splits) && carry.splits.length) {
      transaction.splits = carry.splits;
      transaction.categoryId = null;
    }
    await put('transactions', transaction);
    if (!row._matchedManualId) newIds.add(transaction.id);
    if (row.categoryId) await learnFromAssignment(row.description, row.categoryId);
  }

  for (const t of superseded || []) {
    await remove('transactions', t.id);
  }

  const transferCount = await detectTransfers();

  // EMIs on the card: each becomes (or moves forward) a fixed commitment with
  // its end date, if left ticked in the review.
  let emiCount = 0;
  if (account.type === 'card') {
    const recurring = await getAll('recurring');
    for (const emi of state.emis || []) {
      if (!emi.keep) continue;
      const existing = recurring.find((r) => r.id === emiCommitmentId(account.id, emi));
      await put('recurring', emiCommitment(account.id, emi, existing));
      emiCount++;
    }
  }

  const saved = rows.length - unchanged;
  const parts = [`Saved ${saved} row${saved === 1 ? '' : 's'}`];
  if (unchanged) parts.push(`${unchanged} unchanged`);
  if (matchedCount) parts.push(`${matchedCount} matched entries already in the app`);
  if (superseded && superseded.length) parts.push(`removed ${superseded.length} no longer listed`);
  if (transferCount) parts.push(`flagged ${transferCount} as transfers`);
  if (emiCount) parts.push(`${emiCount} EMI${emiCount === 1 ? '' : 's'} kept in your fixed commitments`);
  // What was saved, as saved: read back after the transfer check, so a card
  // bill or money moved between your own accounts is known for what it is
  // and never called the "biggest new" spend on the Done step.
  savedRows.push(
    ...(await getAll('transactions'))
      .filter((t) => newIds.has(t.id))
      .map((t) => ({ date: t.date, description: t.rawDescription, amount: t.amount, direction: t.direction, isTransfer: t.isTransfer === true }))
  );

  const nextEl = resultsEl.querySelector('#import-next');
  const skipBtn = resultsEl.querySelector('#import-skip-btn');
  if (skipBtn) skipBtn.remove();
  if (state.queue && state.queue.length) {
    // More cards pasted in one go: stay on Check and move to the next one.
    showStatus(statusEl, `${parts.join(' · ')}.`, false);
    showNextButton(nextEl, state.queue);
    state = { parser: state.parser, queue: state.queue };
    return;
  }
  const lines = [];
  if (unchanged) lines.push(['Already up to date', String(unchanged)]);
  if (superseded && superseded.length) lines.push(['No longer listed, removed', String(superseded.length)]);
  if (transferCount) lines.push(['Moved between your accounts', `${transferCount}, not spending`]);
  if (emiCount) lines.push(['EMIs added to your commitments', String(emiCount)]);
  if (state.depositSaved) {
    const d = state.depositSaved;
    lines.push([`${d.label}, put away`, formatRupees(d.knownBalance), 'in']);
    if (d.deposit && d.deposit.atMaturity) lines.push(['At maturity', formatRupees(d.deposit.atMaturity)]);
  }
  const count = savedRows.length;
  await showDone({ title: count ? `${count} new ${count === 1 ? 'entry' : 'entries'} saved` : 'All up to date', lines });
}

// The fixed deposits a savings statement lists (SBI's MOD) become an account
// of their own, beside the savings account they belong to: money that is
// yours and put away, never money to spend. One per savings account, moved
// only by a statement at least as recent as the figure it already has.
async function saveDeposit(savingsAccount, deposit, asOf) {
  const accounts = await getAll('accounts');
  const existing = accounts.find((a) => a.type === 'savings' && a.depositOf === savingsAccount.id);
  if (existing && existing.knownBalanceDate && asOf && existing.knownBalanceDate > asOf) return existing;
  const saved = {
    ...(existing || {
      id: newId(),
      label: `${savingsAccount.issuer === 'SBI' || /state bank/i.test(savingsAccount.issuer || '') ? 'SBI' : savingsAccount.issuer || 'Bank'} ${deposit.kind === 'MOD' ? 'MOD deposits' : 'fixed deposits'}`,
      type: 'savings',
      issuer: savingsAccount.issuer || null,
      last4: savingsAccount.last4 || null,
      depositOf: savingsAccount.id,
    }),
    knownBalance: deposit.balance,
    knownBalanceDate: asOf || deposit.asOf || null,
    deposit: { kind: deposit.kind, atMaturity: deposit.atMaturity ?? null },
  };
  await put('accounts', saved);
  return saved;
}

// Step three. "Saved" alone tells you nothing about your money, so this says
// what the import changed: what is left to spend before and after, how much
// new spending it turned up, the biggest one, and anything particular to the
// kind of file (what a loan still owes, what went into the PF).
async function showDone({ title, lines = [] }) {
  let after = null;
  try {
    after = await computeFreeToSpend();
  } catch {
    after = null;
  }
  const row = (label, value, tone = '') => `<div class="totals-row"><span>${label}</span><span class="${tone}">${value}</span></div>`;
  const changes = [];
  // Signed: left to spend can be below zero, and dropping the minus would make
  // a worse position read as a better one.
  const signed = (v) => formatRupees(v);
  if (before && after && before.free != null && after.free != null && before.free !== after.free) {
    changes.push(row('Left to spend', `${signed(before.free)} → <strong class="${after.free < 0 ? 'out' : ''}">${signed(after.free)}</strong>`));
  } else if (after && after.free != null) {
    changes.push(row('Left to spend', signed(after.free), after.free < 0 ? 'out' : ''));
  }
  const newSpending = before && after ? after.spentThisCycle - before.spentThisCycle : 0;
  if (newSpending > 0) changes.push(row('New spending found', formatRupees(newSpending), 'out'));
  if (newSpending < 0) changes.push(row('Spending came down by', formatRupees(-newSpending), 'in'));
  if (after && after.bank != null && before && before.bank !== after.bank) changes.push(row('In the bank now', signed(after.bank)));

  const biggest = savedRows.filter((r) => r.direction === 'debit' && !r.isTransfer).sort((a, b) => b.amount - a.amount)[0];

  screen.querySelector('#import-done').innerHTML = `
    <div class="import-done-head">
      <span class="import-done-icon" aria-hidden="true">✓</span>
      <h2>${escapeHtml(title)}</h2>
    </div>
    ${
      changes.length || lines.length
        ? `<div class="totals-card">
             <p class="hero-label" style="margin:0 0 var(--space-2xs)">What this changed</p>
             ${changes.join('')}
             ${lines.map(([label, value, tone]) => row(label, value, tone)).join('')}
           </div>`
        : ''
    }
    ${biggest ? `<p class="muted-note import-done-note">Biggest new one: ${formatRupees(biggest.amount)}, ${escapeHtml(shortName(biggest.description))}, ${formatDateNice(biggest.date)}</p>` : ''}
    <button type="button" id="import-see-summary" class="btn-primary btn-block">See summary</button>
    <button type="button" id="import-another" class="btn-secondary btn-block">Import another</button>
  `;
  screen.querySelector('#import-see-summary').addEventListener('click', () => {
    screen.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'summary' } }));
  });
  screen.querySelector('#import-another').addEventListener('click', () => backToChoose());
  state = null;
  showStage('done');
}

// Enough of a bank narration to recognise, without its reference numbers.
function shortName(text) {
  const words = String(text || '')
    .replace(/\d{5,}/g, ' ')
    .split(/[^A-Za-z0-9&.]+/)
    // Not numbers, and not reference codes like "HDFCD30F751E6BF1".
    .filter((w) => w.length > 1 && !/^\d+$/.test(w) && !(w.length >= 8 && /\d/.test(w) && /[A-Za-z]/.test(w)));
  return words.slice(0, 3).join(' ').slice(0, 30) || 'a payment';
}

function showNextButton(nextEl, queue) {
  const next = queue[0];
  nextEl.innerHTML = `<button type="button" id="import-next-btn" class="btn-primary">Next card${next.last4 ? `: ••${next.last4}` : ''} (${next.rowCount} rows) →</button>`;
}

function shiftDays(isoDate, delta) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function showStatus(el, message, isError) {
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle('out', !!isError);
  el.classList.toggle('in', !isError);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}
