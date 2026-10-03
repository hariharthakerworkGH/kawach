import { isoLocal, frequencyOf } from './frequency.js';

// The Indian money calendar: the costs most homes and shops pay, ready to
// tick rather than type, and the tax dates worth knowing about. Amounts are
// never guessed - you type what yours is.

export const COMMON_COSTS = {
  home: [
    { label: 'Electricity', frequency: 'monthly' },
    { label: 'Gas cylinder', frequency: 'monthly' },
    { label: 'Mobile recharge', frequency: 'monthly' },
    { label: 'Broadband', frequency: 'monthly' },
    { label: 'Society maintenance', frequency: 'monthly' },
    { label: 'Milk', frequency: 'monthly' },
    { label: 'Domestic help', frequency: 'monthly' },
    { label: 'School fees', frequency: 'quarterly' },
    { label: 'Health insurance', frequency: 'yearly' },
    { label: 'Life insurance (LIC)', frequency: 'yearly' },
    { label: 'Vehicle insurance', frequency: 'yearly' },
    { label: 'Property tax', frequency: 'yearly' },
    { label: 'Yearly subscriptions', frequency: 'yearly' },
    { label: 'Festivals and gifts', frequency: 'yearly' },
    { label: 'Weddings and functions', frequency: 'yearly' },
  ],
  business: [
    { label: 'Shop rent', frequency: 'monthly' },
    { label: 'Staff wages', frequency: 'monthly' },
    { label: 'Shop electricity', frequency: 'monthly' },
    { label: 'Transport and delivery', frequency: 'monthly' },
    { label: 'Accountant', frequency: 'monthly' },
    { label: 'GST payment', frequency: 'monthly' },
    { label: 'Shop insurance', frequency: 'yearly' },
    { label: 'Trade licence', frequency: 'yearly' },
  ],
};

const iso = (year, month, day) => isoLocal(new Date(year, month - 1, day));

// Tax dates from today onwards, soonest first: advance tax and the return
// for anyone with business income, and GST for a registered business.
// Dates only - Kawach never files anything and never works out what is owed.
export function taxDates(today, { business = false, gst = false } = {}) {
  const year = Number(today.slice(0, 4));
  const dates = [];
  if (business) {
    for (const [month, share] of [[6, '15%'], [9, '45%'], [12, '75%'], [3, '100%']]) {
      // March's instalment belongs to the year the others run into.
      dates.push({ label: 'Advance tax', date: iso(month === 3 ? year + 1 : year, month, 15), note: `${share} of the year's tax` });
      dates.push({ label: 'Advance tax', date: iso(month === 3 ? year : year - 1, month, 15), note: `${share} of the year's tax` });
    }
    dates.push({ label: 'Income tax return', date: iso(year, 7, 31), note: 'for last financial year' });
    dates.push({ label: 'Income tax return', date: iso(year + 1, 7, 31), note: 'for last financial year' });
  }
  if (gst) {
    // This month's and next month's, so one is always ahead.
    for (const add of [0, 1]) {
      const d = new Date(year, Number(today.slice(5, 7)) - 1 + add, 1);
      dates.push({ label: 'GSTR-1', date: isoLocal(new Date(d.getFullYear(), d.getMonth(), 11)), note: 'sales return' });
      dates.push({ label: 'GSTR-3B', date: isoLocal(new Date(d.getFullYear(), d.getMonth(), 20)), note: 'summary return and payment' });
    }
  }
  return dates.filter((d) => d.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* Renewals (5.21): what is paid every three, six or twelve months - insurance,
 * a vehicle's papers, a yearly subscription. A monthly "day" says nothing about
 * which month, so these carry the date itself (`renewsOn`), and the next one
 * is found by stepping on from it a whole period at a time. The budget is
 * unchanged by any of this: it still sets a slice aside every month, which is
 * what keeps "Left to spend" steady through the month a big renewal lands. */
export const RENEWAL_MONTHS = { quarterly: 3, halfYearly: 6, yearly: 12 };
export const renews = (item) => Boolean(RENEWAL_MONTHS[frequencyOf(item)]);
// A renewal stays "due" for a few days after its date, then moves on: the
// app cannot always see it was paid, and must not nag about it for a year.
export const RENEWAL_GRACE_DAYS = 3;

// The same day of the month `months` later, the 31st held to a short month's
// last day without losing it for the months after.
function monthsOn(fromIso, months) {
  const [y, m, d] = fromIso.split('-').map(Number);
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  return isoLocal(new Date(y, m - 1 + months, Math.min(d, last)));
}

const daysBefore = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoLocal(new Date(y, m - 1, d - n));
};

/* The renewal still to come (or just gone, within the grace days), or null
 * when the date is not known. */
export function nextRenewal(item, today) {
  const step = RENEWAL_MONTHS[frequencyOf(item)];
  if (!step || !item.renewsOn) return null;
  const from = daysBefore(today, RENEWAL_GRACE_DAYS);
  let k = 0;
  while (monthsOn(item.renewsOn, k * step) < from) k += 1;
  return monthsOn(item.renewsOn, k * step);
}

/* The one after it: what "Renewed" moves the date on to. */
export function renewalAfter(item, today) {
  const due = nextRenewal(item, today);
  return due ? monthsOn(due, RENEWAL_MONTHS[frequencyOf(item)]) : null;
}

/* Every renewal with a date, soonest first, with how many days away it is
 * (below nothing: days since). */
export function renewalsAhead(items, today) {
  const dayMs = 86400000;
  const at = (iso) => new Date(`${iso}T12:00:00`).getTime();
  return items
    .map((item) => ({ item, due: nextRenewal(item, today) }))
    .filter((r) => r.due)
    .map((r) => ({ ...r, days: Math.round((at(r.due) - at(today)) / dayMs) }))
    .sort((a, b) => (a.due < b.due ? -1 : 1));
}
