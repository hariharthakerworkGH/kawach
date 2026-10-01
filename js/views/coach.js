import { formatCurrency, formatDateNice, formatRupees } from '../format.js';
import { icon } from '../icons.js';
import { isoLocal } from '../frequency.js';
import { categoryStyle } from '../category-style.js';
import { financialSnapshot, affordability, savingsPlan, whereToCut, observations } from '../planner.js';
import { redraw } from '../redraw.js';
import { escapeHtml, hero, sectionHead, emptyState, shapeLike } from '../ui.js';

// The planning screen: you pick a question, it answers with your own numbers.
//
// It is not a chatbot and does not pretend to be one. Every answer is
// computed on this device from your transactions - which is why it works
// offline, costs nothing, and never sends your spending anywhere.

let openQuestion = null;
let lastAnswer = null;

export async function render(container) {
  // The snapshot's "left to spend" is the same month figure the Summary leads
  // with, so the app never gives two different answers to the same question.
  const snapshot = await financialSnapshot();
  // The pace forecast is the headline above, so it isn't repeated as a note.
  const notes = observations(snapshot).filter((n) => !/^(Heading for|On track)/.test(n.title));
  // "Can I afford this?" spreads what's left over the days until the statement.
  const cash = { ...snapshot, daysLeft: snapshot.cycle.free != null ? snapshot.cycle.daysToClose : snapshot.daysLeft };

  container.classList.add('k', 'k-coach');
  container.innerHTML = `
    ${heroTemplate(snapshot)}

    ${sectionHead('Ask about your money')}
    ${hub()}
    <div class="coach-questions">
      ${questionBtn('afford', icon('wallet'), 'Can I afford this?')}
      ${questionBtn('goal', icon('flag'), 'Help me save for something')}
      ${questionBtn('cut', icon('down'), "Where's it going wrong?")}
    </div>
    <div id="coach-panel">${panelTemplate(snapshot)}</div>

    ${
      notes.length
        ? `${sectionHead('Noticed')}
           ${noteTemplate(notes[0])}
           ${
             notes.length > 1
               ? `<details class="section-fold"><summary>More noticed <span class="muted">${notes.length - 1}</span></summary>${notes
                   .slice(1)
                   .map((n) => noteTemplate(n))
                   .join('')}</details>`
               : ''
           }`
        : ''
    }

  `;

  container.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: btn.dataset.go } }));
    });
  });

  container.querySelectorAll('.coach-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      openQuestion = openQuestion === btn.dataset.q ? null : btn.dataset.q;
      lastAnswer = null;
      redraw(container, () => render(container));
    });
  });

  wirePanel(container, snapshot, cash);
}

// The forecast: at the pace your cards have been used this cycle, where does
// what's left end up by the statement day?
function heroTemplate(snapshot) {
  const c = snapshot.cycle;
  if (c.free == null || !c.salary.setUp) {
    return emptyState({
      what: 'Nothing to work from yet.',
      why: 'With your income and what goes out each month, Kawach can tell you whether this month fits.',
      action: { label: 'Set it up on Plan', go: 'plan' },
    });
  }

  const pace = c.pace;
  const projected = pace * c.daysToClose;
  const leftAtEnd = c.free - projected;
  const over = leftAtEnd < 0;
  const pct = c.free > 0 ? Math.min(100, Math.round((projected / c.free) * 100)) : 100;
  return hero({
    label: 'Left at this pace',
    period: `by ${formatDateNice(c.cycleClose || c.windowEnd)}`,
    amount: pace === 0 ? '-' : formatRupees(leftAtEnd),
    negative: over,
    level: over ? 'over' : 'ok',
    meter: { pct, tone: over ? 'over' : '' },
    figures: [
      { label: 'Pace', value: `${formatRupees(pace)}/day` },
      { label: 'Safe', value: `${formatRupees(Math.max(0, c.perDay))}/day` },
    ],
  });
}

function questionBtn(id, icon, label) {
  const open = openQuestion === id;
  return `<button type="button" class="k-row coach-q ${open ? 'active' : ''}" data-q="${id}" aria-expanded="${open}">
      <span class="k-icon coach-q-icon" style="--k-tint:var(--k-accent)">${icon}</span>
      <span class="k-row__body"><span class="k-row__title">${label}</span></span>
      <span class="coach-q__chev" aria-hidden="true"></span>
    </button>`;
}

function panelTemplate(s) {
  if (openQuestion === 'afford') {
    return `
      <div class="coach-panel">
        <label class="field">
          <span>How much is it?</span>
          <div class="amount-input-wrap">
            <span class="amount-prefix">₹</span>
            <input type="number" class="amount-input" id="afford-amount" inputmode="decimal" placeholder="0">
          </div>
        </label>
        <button type="button" class="btn-primary" id="afford-go">Work it out</button>
        <div id="afford-answer">${lastAnswer === 'afford' ? '' : ''}</div>
      </div>`;
  }

  if (openQuestion === 'goal') {
    const defaultDate = new Date(s.now.getFullYear(), s.now.getMonth() + 6, s.now.getDate());
    return `
      <div class="coach-panel">
        <label class="field">
          <span>How much do you want to save?</span>
          <div class="amount-input-wrap">
            <span class="amount-prefix">₹</span>
            <input type="number" class="amount-input" id="goal-amount" inputmode="decimal" placeholder="50000">
          </div>
        </label>
        <label class="field">
          <span>By when?</span>
          <input type="date" id="goal-date" value="${isoLocal(defaultDate)}">
        </label>
        <button type="button" class="btn-primary" id="goal-go">Make a plan</button>
        <div id="goal-answer"></div>
      </div>`;
  }

  if (openQuestion === 'cut') {
    return `<div class="coach-panel" id="cut-answer">${cutAnswer(s)}</div>`;
  }

  return '';
}

function wirePanel(container, s, cash) {
  const affordGo = container.querySelector('#afford-go');
  if (affordGo) {
    const run = () => {
      const raw = parseFloat(container.querySelector('#afford-amount').value);
      const target = container.querySelector('#afford-answer');
      if (!Number.isFinite(raw) || raw <= 0) {
        target.innerHTML = '';
        return;
      }
      target.innerHTML = affordAnswer(cash, affordability(cash, Math.round(raw * 100)));
      countIn(target);
    };
    affordGo.addEventListener('click', run);
    container.querySelector('#afford-amount').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') run();
    });
  }

  const sortBtn = container.querySelector('#coach-go-sort');
  if (sortBtn) {
    sortBtn.addEventListener('click', () => {
      container.dispatchEvent(new CustomEvent('navigate', { bubbles: true, detail: { view: 'transactions', filter: 'uncategorized' } }));
    });
  }

  const goalGo = container.querySelector('#goal-go');
  if (goalGo) {
    goalGo.addEventListener('click', () => {
      const raw = parseFloat(container.querySelector('#goal-amount').value);
      const date = container.querySelector('#goal-date').value;
      const target = container.querySelector('#goal-answer');
      if (!Number.isFinite(raw) || raw <= 0 || !date) {
        target.innerHTML = '';
        return;
      }
      target.innerHTML = goalAnswer(s, savingsPlan(s, Math.round(raw * 100), date));
    });
  }
}

function affordAnswer(s, a) {
  if (!a.known) {
    return `<div class="coach-answer"><p class="coach-verdict">I need your income first</p><p class="recap-line">Add your income on Plan and I can tell you whether this fits.</p></div>`;
  }

  const verdict = !a.canAfford ? 'Not right now' : a.tight ? 'It fits, but only just' : 'Yes, comfortably';
  const tone = !a.canAfford ? 'bad' : a.tight ? 'warn' : 'good';
  const until = ` until ${formatDateNice(s.cycle.cycleKey)}`;

  return `
    <div class="coach-answer">
      <p class="coach-verdict coach-pill ${tone}">${verdict}</p>
      ${shareBar(a.amount, s.leftToSpend, tone)}
      <div class="totals-card">
        <div class="totals-row"><span>Left to spend${until}</span><span data-count>${formatCurrency(s.leftToSpend)}</span></div>
        <div class="totals-row"><span>This purchase</span><span class="out" data-count>-${formatCurrency(a.amount)}</span></div>
        <div class="totals-row net"><span>Left after it</span><span class="${a.after < 0 ? 'out' : 'in'}" data-count>${formatCurrency(a.after)}</span></div>
      </div>
      <p class="recap-line">${
        !a.canAfford
          ? `That's ${formatCurrency(-a.after)} more than is left${until}. ${
              s.daysLeft > 0 ? `You'd need to find it by cutting back elsewhere - see "Where's it going wrong?".` : ''
            }`
          : a.newPerDay != null && s.daysLeft > 0
            ? `You'd have ${formatCurrency(a.newPerDay)} a day for the remaining ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}${
                a.tight ? `, down from ${formatCurrency(s.perDayAllowance)} - that's a real squeeze on your usual ${formatCurrency(s.runRate)} a day.` : '.'
              }`
            : 'The month is nearly done, so this mostly comes out of next month.'
      }</p>
    </div>
  `;
}

// Kawach's mark in two rings that draw once as the screen arrives, and then
// sit still: the answers below are worked out here, on the phone.
function hub() {
  return `<div class="coach-hub" aria-hidden="true">
      <svg viewBox="0 0 150 150">
        <circle class="coach-hub__track" cx="75" cy="75" r="70"/>
        <circle class="coach-hub__arc coach-hub__arc--outer" cx="75" cy="75" r="70" pathLength="100" transform="rotate(-90 75 75)"/>
        <circle class="coach-hub__arc coach-hub__arc--inner" cx="75" cy="75" r="60" pathLength="100" transform="rotate(90 75 75)"/>
        <g transform="translate(40 37) scale(0.7)">
          <path class="coach-hub__shield" d="M50 12L80 22V48C80 68 67 82 50 89C33 82 20 68 20 48V22Z"/>
          <path class="coach-hub__rupee" d="M38 34h24M38 45h24M44 34c11 0 11 20 0 20h-5l17 17"/>
        </g>
      </svg>
    </div>
    <p class="coach-hub__note">Worked out on your phone</p>`;
}

// How much of what is left the purchase would take: amber when it is tight,
// red when it is more than there is (and then the bar is simply full).
function shareBar(amount, left, tone) {
  const share = left > 0 ? Math.min(1, amount / left) : 1;
  return `<div class="coach-share coach-share--${tone}" role="img" aria-label="Takes ${Math.round(share * 100)}% of what is left"><i style="width:${(share * 100).toFixed(1)}%"></i></div>`;
}

// The sums count up to their figures once, as the answer arrives. The real
// figure is always what is left on screen; nothing moves for reduced motion.
function countIn(root) {
  if (document.hidden || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  for (const el of root.querySelectorAll('[data-count]')) {
    const final = el.textContent;
    const run = final.match(/[\d,]+/);
    const target = run ? Number(run[0].replace(/,/g, '')) : 0;
    if (!target) continue;
    const start = performance.now();
    const paint = (now) => {
      const t = Math.min(1, (now - start) / 700);
      el.textContent = t >= 1 ? final : shapeLike(final, Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(paint);
    };
    el.textContent = shapeLike(final, 0);
    requestAnimationFrame(paint);
    setTimeout(() => {
      el.textContent = final;
    }, 1100);
  }
}

function goalAnswer(s, plan) {
  if (!plan.valid) {
    return `<div class="coach-answer"><p class="coach-verdict bad">Pick a date in the future</p></div>`;
  }
  if (!plan.known) {
    return `
      <div class="coach-answer">
        <p class="coach-verdict">${formatCurrency(plan.requiredPerMonth)} a month</p>
        <p class="recap-line">Over ${plan.monthsLeft} month${plan.monthsLeft === 1 ? '' : 's'}. Set your income on the Plan screen and I can tell you whether that's realistic.</p>
      </div>`;
  }

  return `
    <div class="coach-answer">
      <p class="coach-verdict ${plan.feasible ? 'good' : 'warn'}">${formatCurrency(plan.requiredPerMonth)} a month</p>
      <p class="recap-line">To have ${formatCurrency(plan.target)} in ${plan.monthsLeft} month${plan.monthsLeft === 1 ? '' : 's'}.</p>
      <div class="totals-card">
        <div class="totals-row"><span>Budget each cycle</span><span>${formatCurrency(s.free)}</span></div>
        <div class="totals-row"><span>You typically spend</span><span class="out">-${formatCurrency(plan.typicalVariable)}</span></div>
        <div class="totals-row net"><span>Usually spare</span><span class="${plan.typicalSpare < 0 ? 'out' : 'in'}">${formatCurrency(plan.typicalSpare)}</span></div>
      </div>
      ${
        plan.feasible
          ? `<p class="recap-line">That works without changing anything - you usually have ${formatCurrency(plan.typicalSpare)} spare, which covers it.</p>`
          : (() => {
              const found = plan.cuts.reduce((t, c) => t + c.cut, 0);
              const covers = found >= plan.shortfall;
              return `
                <p class="recap-line">You're ${formatCurrency(plan.shortfall)} a month short.${
                  plan.cuts.length ? ' Here\'s where that could come from:' : ''
                }</p>
                ${plan.cuts.length ? cutList(plan.cuts) : ''}
                ${
                  covers
                    ? ''
                    : `<p class="recap-line">That only finds ${formatCurrency(found)} of it. For the remaining ${formatCurrency(
                        plan.shortfall - found
                      )} a month you'd need to move the date, lower the target, or earn more - I'd rather say that than pretend the sums work.</p>`
                }`;
            })()
      }
    </div>
  `;
}

function cutAnswer(s) {
  if (s.free == null) {
    return `<div class="coach-answer"><p class="coach-verdict">I need your income first</p><p class="recap-line">Set it on the Plan screen and I can show you what's out of line.</p></div>`;
  }
  if (s.categoryAverages.monthsCounted === 0) {
    return `<div class="coach-answer"><p class="coach-verdict">Not enough history yet</p><p class="recap-line">Once there's a full month or two behind you, I can compare this month against your normal and show what's drifted.</p></div>`;
  }

  const needed = Math.max(s.projectedOver || 0, 0);
  const cuts = whereToCut(s, needed > 0 ? needed : Math.round(s.variableSpent * 0.1));

  // Advice built on mostly-unsorted spending would be confidently wrong, so
  // say so and point at the fix instead of inventing a recommendation.
  if (s.categoryAverages.uncategorizedShare > 0.25) {
    return `
      <div class="coach-answer">
        <p class="coach-verdict warn">I can't see enough yet</p>
        <p class="recap-line">${formatCurrency(s.categoryAverages.uncategorized)} a month - ${Math.round(
          s.categoryAverages.uncategorizedShare * 100
        )}% of your spending - has no category on it, so I'd only be guessing about where it's going wrong.</p>
        <button type="button" class="btn-primary" id="coach-go-sort">Sort my transactions</button>
        ${cuts.length ? `<p class="muted-note">From what is categorised, these are the biggest:</p>${cutList(cuts)}` : ''}
      </div>`;
  }

  if (cuts.length === 0) {
    return `<div class="coach-answer"><p class="coach-verdict good">Nothing obvious to cut</p><p class="recap-line">Your discretionary spending is either small or evenly spread - there's no single category running away with the month.</p></div>`;
  }

  return `
    <div class="coach-answer">
      <p class="coach-verdict ${needed > 0 ? 'warn' : 'good'}">${
        needed > 0 ? `Find ${formatCurrency(needed)} a month` : 'Your biggest levers'
      }</p>
      <p class="recap-line">${
        needed > 0
          ? `That's what stops you overshooting. Trimming the categories you spend most on, none by more than a third:`
          : `You're not overspending. If you wanted to save more, these are where the money actually is:`
      }</p>
      ${cutList(cuts)}
      <p class="muted-note">Based on your average over the last ${s.categoryAverages.monthsCounted} month${s.categoryAverages.monthsCounted === 1 ? '' : 's'}.</p>
    </div>
  `;
}

function cutList(cuts) {
  return `
    <div class="totals-card">
      ${cuts
        .map((c) => {
          const { icon, color } = categoryStyle(c.name);
          return `
        <div class="attention-row">
          <span class="breakdown-label">
            <span class="cat-chip" style="--chip-color:${color}">${icon}</span>
            <span>${escapeHtml(c.name)}<br><span class="muted-note">${formatCurrency(c.average)} a month → aim for ${formatCurrency(c.newTarget)}</span></span>
          </span>
          <span class="fixed-row-right"><span class="out">-${formatCurrency(c.cut)}</span></span>
        </div>`;
        })
        .join('')}
    </div>`;
}

// The tone is the planner's own, not a judgement made here.
function noteTone(tone) {
  if (tone === 'warn') return 'k-context--attention';
  if (tone === 'good') return 'k-context--calm';
  return '';
}

function noteTemplate(n) {
  const mark = icon(n.tone === 'warn' ? 'alert' : n.tone === 'good' ? 'check' : 'info');
  return `
    <div class="k-context coach-note ${noteTone(n.tone)} coach-note-${n.tone}">
      <span class="k-context__mark coach-note-icon">${mark}</span>
      <span class="k-context__body">
        <span class="k-context__k">${escapeHtml(n.title)}</span>
        <p class="k-context__note">${escapeHtml(n.body)}</p>
      </span>
    </div>
  `;
}

