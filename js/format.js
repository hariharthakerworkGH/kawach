import { CURRENCY_SYMBOL } from './config.js';

// en-IN groups digits the Indian way (lakh/crore: 12,34,567.89) instead of
// the Western 1,234,567.89 - without this, large amounts are hard to read
// at a glance.
const withPaise = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeRupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

// Paise are shown only when there are some: ₹68,000 but ₹3,759.56. A column
// of ".00"s is noise.
function formatAmount(minorUnits) {
  return minorUnits % 100 === 0 ? wholeRupees.format(minorUnits / 100) : withPaise.format(minorUnits / 100);
}

// A negative amount always shows its minus, in front of the ₹ ("−₹73,630").
// Hiding it was the default once, with each screen meant to ask for it, and
// screens that forgot showed a shortfall as if it were money in hand.
export function formatCurrency(minorUnits) {
  const sign = minorUnits < 0 ? '−' : '';
  return `${sign}${CURRENCY_SYMBOL}${formatAmount(Math.abs(minorUnits))}`;
}

// Rounded to the rupee, for headline figures where paise only get in the way.
export function formatRupees(minorUnits) {
  const rupees = Math.round(minorUnits / 100);
  const sign = rupees < 0 ? '−' : '';
  return `${sign}${CURRENCY_SYMBOL}${wholeRupees.format(Math.abs(rupees))}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "25 Sep", with the year only when it isn't this year ("25 Sep 2025").
// A plain YYYY-MM-DD is read as that calendar day, never shifted by time zone.
export function formatDateNice(isoDate) {
  if (!isoDate) return '';
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const d = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// "Aug 2026": a month on its own, always with its year.
export function formatMonthYear(isoDate) {
  const m = /^(\d{4})-(\d{2})/.exec(isoDate || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
