import { isoLocal } from './frequency.js';

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
