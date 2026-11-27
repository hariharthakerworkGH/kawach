import { getAll, put, remove } from './db.js';

// A card that was reissued or upgraded comes back with new digits (6671 -> 3076). Left alone, the new digits become a second card:
// the bill is paid to one and the other stays owing (26 Nov 2026). Switching says it is one card.
//
// The card you open KEEPS its history, statement day and fixed costs. With `intoId` (the new digits already made a card of their own)
// everything on that card moves over and it is removed; with only `last4` the same card just carries the new digits. Either way the old
// digits stay linked, so an old statement or an alert that still names them finds the card.
//
// Safe to run again if it was cut off: everything moves first, the card is saved next, the extra card is removed last.

// What the later statement says about the bill belongs together, so it comes from one card, never half from each.
const STATEMENT_FIELDS = ['billingCycleDay', 'statementDue', 'statementMinDue', 'statementDueDate', 'statementPeriodEnd', 'statementDuePaid', 'knownBalance', 'knownBalanceDate'];

export async function switchCard(oldId, { intoId = null, last4 = null } = {}) {
  const [accounts, transactions, batches, recurring, inbox] = await Promise.all(['accounts', 'transactions', 'importBatches', 'recurring', 'alertInbox'].map((s) => getAll(s)));
  const old = accounts.find((a) => a.id === oldId);
  const into = intoId ? accounts.find((a) => a.id === intoId) : null;
  if (!old || old.type !== 'card') throw new Error('Pick a card to switch.');
  if (intoId && (!into || into.type !== 'card' || into.id === old.id)) throw new Error('Pick the card these digits belong to.');
  const digits = into ? into.last4 : String(last4 || '').trim();
  if (!/^\d{4}$/.test(digits || '')) throw new Error('The new last 4 digits should be exactly four numbers.');

  const links = new Set([...(old.linkedLast4s || []), ...(into ? [into.last4, ...(into.linkedLast4s || [])] : [])].filter(Boolean));
  if (old.last4) links.add(old.last4);
  links.delete(digits);
  const card = { ...old, last4: digits, linkedLast4s: [...links] };
  // A name that carries the old digits ("HDFC ••6671") follows them.
  if (old.last4 && old.label.includes(old.last4)) card.label = old.label.split(old.last4).join(digits);

  const moved = { payments: 0, statements: 0 };
  if (into) {
    const newer = (into.statementPeriodEnd || '') > (old.statementPeriodEnd || '') ? into : old;
    for (const f of STATEMENT_FIELDS) { if (newer[f] === undefined) delete card[f]; else card[f] = newer[f]; }
    if (into.creditLimit) card.creditLimit = into.creditLimit; // a new or upgraded card usually has a new limit
    for (const t of transactions) {
      const edit = {};
      if (t.accountId === into.id) edit.accountId = old.id;
      if (t.paysCardId === into.id) edit.paysCardId = old.id;
      if (typeof t.paysStatement === 'string' && t.paysStatement.startsWith(`${into.id}|`)) edit.paysStatement = `${old.id}|${t.paysStatement.slice(into.id.length + 1)}`;
      if (!Object.keys(edit).length) continue;
      await put('transactions', { ...t, ...edit });
      if (edit.accountId) moved.payments++;
    }
    for (const b of batches.filter((x) => x.accountId === into.id)) { await put('importBatches', { ...b, accountId: old.id }); moved.statements++; }
    for (const r of recurring.filter((x) => x.accountId === into.id)) await put('recurring', { ...r, accountId: old.id });
    for (const m of inbox.filter((x) => x.accountId === into.id || x.paysCardId === into.id)) {
      await put('alertInbox', { ...m, accountId: m.accountId === into.id ? old.id : m.accountId, paysCardId: m.paysCardId === into.id ? old.id : m.paysCardId });
    }
  }
  await put('accounts', card);
  if (into) await remove('accounts', into.id);
  return { card, ...moved };
}
