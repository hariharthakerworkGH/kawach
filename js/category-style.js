import { categoryIcon } from './category-icons.js';
import { escapeHtml } from './ui.js';

// Every category gets an icon and a colour so a list of spending reads as
// shapes and colour before you've read a single word. Matching is by name, not
// id, so categories you create yourself still get sensible treatment.
//
// Two of your categories never wear the same icon or the same colour: with
// only a few rules to go on, "Bank Charges", "Digital Wallet", "To Papa" and
// "ATM Withdrawal" once all got the same price tag, which made the icons
// useless for telling them apart. When a second category would land on an
// icon already taken, it gets the rule's next choice, then any unused one.
//
// What you pick yourself on Categories (an icon, a colour, your own picture)
// always wins, and is never handed to another category.

// Most specific first: "Home Loan EMI" is a loan before it is a home, "PF
// Transfer" is savings before it is a transfer.
const RULES = [
  { match: /^uncategori[sz]ed$/i, icons: ['question'], color: 'var(--cat-uncategorized)' },
  // A business's own spending (js/business.js), before the rules below
  // read "stock" as investing or "shop" as shopping.
  { match: /stock|purchase|inventory|raw material|wholesale|supplier/i, icons: ['tag', 'bag'], color: 'var(--cat-1)' },
  { match: /loan|emi\b|mortgage/i, icons: ['loan', 'bank'], color: 'var(--cat-home)' },
  { match: /rent|house|flat|\bpg\b|hostel/i, icons: ['rent', 'home'], color: 'var(--cat-2)' },
  { match: /atm|withdraw|cash/i, icons: ['atm', 'cash'], color: 'var(--cat-1)' },
  { match: /charge|fee|penalt|fine\b/i, icons: ['fee', 'bill'], color: 'var(--cat-6)' },
  { match: /wallet|paytm|phonepe|gpay|amazon pay/i, icons: ['wallet', 'card'], color: 'var(--cat-learning)' },
  { match: /\bpf\b|provident|epf|ppf|nps|pension|saving/i, icons: ['piggy', 'coins'], color: 'var(--cat-7)' },
  { match: /papa|mummy|\bmom\b|\bdad\b|mother|father|parent|family|brother|sister|wife|husband/i, icons: ['family', 'heart'], color: 'var(--cat-4)' },
  { match: /grocer|supermarket|vegetab|kirana|blinkit|zepto|instamart|bigbasket/i, icons: ['groceries', 'leaf'], color: 'var(--cat-groceries)' },
  { match: /coffee|cafe|\btea\b|chai/i, icons: ['coffee'], color: 'var(--cat-1)' },
  { match: /food|dining|restaurant|\beat|swiggy|zomato|meal|lunch|dinner|tiffin/i, icons: ['food', 'coffee'], color: 'var(--cat-food)' },
  { match: /\bbar\b|beer|drink|alcohol|liquor|wine/i, icons: ['drink'], color: 'var(--cat-8)' },
  { match: /fuel|petrol|diesel/i, icons: ['fuel'], color: 'var(--cat-6)' },
  { match: /train|metro|rail|irctc|\bbus\b/i, icons: ['train'], color: 'var(--cat-3)' },
  { match: /flight|airline|travel|trip|holiday|hotel|vacation/i, icons: ['plane', 'globe'], color: 'var(--cat-invest)' },
  { match: /bike|rapido|scooter/i, icons: ['bike'], color: 'var(--cat-transport)' },
  { match: /cab|taxi|uber|\bola\b|auto\b|transport|commute/i, icons: ['taxi', 'car'], color: 'var(--cat-transport)' },
  { match: /\bcar\b|vehicle/i, icons: ['car'], color: 'var(--cat-3)' },
  { match: /electric|power|bescom|bolt/i, icons: ['bolt'], color: 'var(--cat-bills)' },
  { match: /water/i, icons: ['water'], color: 'var(--cat-3)' },
  { match: /mobile|phone|recharge/i, icons: ['phone'], color: 'var(--cat-learning)' },
  { match: /internet|broadband|wifi|fiber|fibre/i, icons: ['wifi'], color: 'var(--cat-invest)' },
  { match: /bill|utilit/i, icons: ['bolt', 'bill'], color: 'var(--cat-bills)' },
  { match: /cloth|fashion|myntra|apparel|shoe/i, icons: ['shirt'], color: 'var(--cat-shopping)' },
  { match: /shop|amazon|flipkart|\bmall\b/i, icons: ['bag', 'shirt'], color: 'var(--cat-shopping)' },
  { match: /netflix|prime video|hotstar|\bott\b|\btv\b|stream/i, icons: ['tv'], color: 'var(--cat-fun)' },
  { match: /spotify|music/i, icons: ['music'], color: 'var(--cat-fun)' },
  { match: /game|gaming/i, icons: ['game'], color: 'var(--cat-8)' },
  { match: /movie|cinema|film|entertain|\bfun\b|outing|event|ticket/i, icons: ['film', 'ticket'], color: 'var(--cat-fun)' },
  { match: /software|cloud|subscription|claude|gemini|chatgpt|\bai\b/i, icons: ['cloud', 'tv'], color: 'var(--cat-2)' },
  { match: /gym|fitness|sport|yoga/i, icons: ['dumbbell'], color: 'var(--cat-health)' },
  { match: /doctor|hospital|clinic|dental/i, icons: ['cross', 'pill'], color: 'var(--cat-health)' },
  { match: /health|medic|pharma|pill/i, icons: ['pill', 'cross'], color: 'var(--cat-health)' },
  { match: /insur|policy|\blic\b/i, icons: ['shield'], color: 'var(--cat-7)' },
  { match: /tuition|school|college|course|educat/i, icons: ['cap', 'book'], color: 'var(--cat-learning)' },
  { match: /book|learn/i, icons: ['book', 'cap'], color: 'var(--cat-learning)' },
  { match: /gift/i, icons: ['gift'], color: 'var(--cat-gifts)' },
  { match: /donat|charit|temple|church|mosque|gurudwara/i, icons: ['heart', 'gift'], color: 'var(--cat-gifts)' },
  { match: /\bpets?\b|\bdog\b|\bcat\b/i, icons: ['paw'], color: 'var(--cat-1)' },
  { match: /salary|payroll|wage/i, icons: ['coins', 'income'], color: 'var(--cat-income)' },
  { match: /income|credit|refund|cashback/i, icons: ['income', 'coins'], color: 'var(--cat-income)' },
  { match: /invest|mutual|stock|\bsip\b|share|\bmf\b/i, icons: ['chart'], color: 'var(--cat-invest)' },
  { match: /transfer|self|moved/i, icons: ['transfer'], color: 'var(--cat-transfer)' },
  { match: /repair|service|maint/i, icons: ['wrench'], color: 'var(--cat-transfer)' },
  { match: /salon|beauty|groom|haircut|\bspa\b/i, icons: ['scissors'], color: 'var(--cat-4)' },
  { match: /clean|household|maid|laundry/i, icons: ['broom'], color: 'var(--cat-7)' },
  { match: /\btax\b|gst|govt|government/i, icons: ['rupee', 'fee'], color: 'var(--cat-6)' },
  { match: /other|misc/i, icons: ['dots', 'tag'], color: 'var(--cat-transfer)' },
];

// For a category no rule knows, and for a second one that would repeat an
// icon or a colour already taken.
const SPARE_ICONS = ['tag', 'star', 'globe', 'ticket', 'rupee', 'heart', 'leaf', 'cloud', 'bag', 'book', 'coins', 'card', 'cash', 'bank', 'chart', 'gift'];

// The colours offered on Categories, and handed out when a rule's own colour
// is already taken.
export const COLOR_CHOICES = [
  'var(--cat-food)',
  'var(--cat-bills)',
  'var(--cat-groceries)',
  'var(--cat-health)',
  'var(--cat-transport)',
  'var(--cat-learning)',
  'var(--cat-home)',
  'var(--cat-fun)',
  'var(--cat-shopping)',
  'var(--cat-gifts)',
  'var(--cat-invest)',
  'var(--cat-income)',
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
  'var(--cat-7)',
  'var(--cat-8)',
  'var(--cat-transfer)',
];

// Every category's look, worked out once per change to the categories, by
// lower-case name.
let assigned = new Map();

export function setCustomStyles(categories = []) {
  assigned = assignStyles(categories);
}

// Exported for the tests: given every category, the icon and colour each one
// shows. Your own choices first, so nothing automatic can take them.
export function assignStyles(categories) {
  const out = new Map();
  const usedIcons = new Set();
  const usedColors = new Set();
  const list = categories.filter((c) => c && c.name);
  for (const c of list) {
    const own = ownIcon(c);
    if (own) {
      out.set(key(c.name), { icon: own.html, iconKey: own.key, color: c.color || null, own: true });
      if (own.key) usedIcons.add(own.key);
    }
    if (c.color) usedColors.add(c.color);
  }
  for (const c of list) {
    const rule = RULES.find((r) => r.match.test(c.name));
    const existing = out.get(key(c.name));
    let iconKey = existing ? existing.iconKey : null;
    if (!existing) {
      iconKey = [...(rule ? rule.icons : []), ...SPARE_ICONS].find((k) => !usedIcons.has(k)) || (rule ? rule.icons[0] : 'tag');
      usedIcons.add(iconKey);
    }
    let color = c.color || (existing && existing.color);
    if (!color) {
      const first = rule ? rule.color : null;
      color = first && !usedColors.has(first) ? first : COLOR_CHOICES.find((x) => !usedColors.has(x)) || first || fallbackColor(c.name);
      usedColors.add(color);
    }
    out.set(key(c.name), { icon: existing ? existing.icon : categoryIcon(iconKey), iconKey, color });
  }
  return out;
}

// An icon you chose: one of the drawn ones ("i:food"), your own picture, or
// an emoji picked before the drawn set existed - kept, never replaced.
function ownIcon(c) {
  if (c.image && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.image)) {
    return { html: `<img class="cat-img" src="${c.image}" alt="">`, key: null };
  }
  if (typeof c.icon === 'string' && c.icon.startsWith('i:')) return { html: categoryIcon(c.icon.slice(2)), key: c.icon.slice(2) };
  if (typeof c.icon === 'string' && c.icon.trim()) return { html: `<span class="cat-emoji">${escapeHtml(c.icon.trim())}</span>`, key: null };
  return null;
}

export function categoryStyle(name) {
  if (!name) return { icon: categoryIcon('question'), color: 'var(--cat-none)' };
  const known = assigned.get(key(name));
  if (known) return { icon: known.icon, color: known.color };
  // A name that isn't one of your categories (a commitment's label, a
  // budget): the rule's first choice, with no one to clash with.
  const rule = RULES.find((r) => r.match.test(name));
  return rule ? { icon: categoryIcon(rule.icons[0]), color: rule.color } : { icon: categoryIcon('tag'), color: fallbackColor(name) };
}

// Just the key of the drawn icon a category shows, for the picker to mark.
export function categoryIconKey(name) {
  const known = assigned.get(key(name));
  return known ? known.iconKey : null;
}

const key = (name) => String(name).toLowerCase();

const FALLBACK = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)'];

function fallbackColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}

