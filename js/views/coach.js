import { formatDateNice, formatRupees } from '../format.js';
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
  const style = document.documentElement.dataset.style;
  if (['tactile', 'peaks', 'mindora', 'instrument'].includes(style)) {
    return coachTop(style, {
      left: pace === 0 ? '-' : formatRupees(leftAtEnd),
      over,
      by: formatDateNice(c.cycleKey || c.windowEnd),
      pace: `${formatRupees(pace)}/day`,
      safe: `${formatRupees(Math.max(0, c.perDay))}/day`,
      days: `${c.daysToClose}`,
      share: c.free > 0 ? Math.min(1, projected / c.free) : 1,
      uses: `${formatRupees(projected)} of ${formatRupees(Math.max(0, c.free))}`,
    });
  }
  return hero({
    label: 'Left at this pace',
    // FIXED (5.5): the pace runs to the end of the spending month (cycleKey,
    // the calendar month), not a card's statement day, which said 'by 25 Oct'
    // beside 30 days left on the 2nd.
    period: `by ${formatDateNice(c.cycleKey || c.windowEnd)}`,
    amount: pace === 0 ? '-' : formatRupees(leftAtEnd),
    negative: over,
    level: over ? 'over' : 'ok',
    meter: { pct, tone: over ? 'over' : '' },
    figures: [
      { label: 'Pace', value: `${formatRupees(pace)}/day` },
      { label: 'Safe', value: `${formatRupees(Math.max(0, c.perDay))}/day` },
    ],
    // CHANGED (5.5, the Charts style): the same figures as a tracking card,
    // one ring for how much of what is left this pace would use. Over the
    // whole of it, it turns red like Summary's budget ring.
    tracking: {
      stats: [
        { k: 'Your pace', v: `${formatRupees(pace)}/day` },
        { k: 'Safe', v: `${formatRupees(Math.max(0, c.perDay))}/day` },
        { k: 'Days left', v: `${c.daysToClose}` },
      ],
      rings: [{ value: c.free > 0 ? projected / c.free : 1, grad: 'spent', big: formatRupees(projected), label: `of ${formatRupees(Math.max(0, c.free))} at this pace` }],
    },
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
        <div class="totals-row"><span>Left to spend${until}</span><span data-count>${formatRupees(s.leftToSpend)}</span></div>
        <div class="totals-row"><span>This purchase</span><span class="out" data-count>-${formatRupees(a.amount)}</span></div>
        <div class="totals-row net"><span>Left after it</span><span class="${a.after < 0 ? 'out' : 'in'}" data-count>${formatRupees(a.after)}</span></div>
      </div>
      <p class="recap-line">${
        !a.canAfford
          ? `That's ${formatRupees(-a.after)} more than is left${until}. ${
              s.daysLeft > 0 ? `You'd need to find it by cutting back elsewhere - see "Where's it going wrong?".` : ''
            }`
          : a.newPerDay != null && s.daysLeft > 0
            ? `You'd have ${formatRupees(a.newPerDay)} a day for the remaining ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}${
                a.tight ? `, down from ${formatRupees(s.perDayAllowance)} - that's a real squeeze on your usual ${formatRupees(s.runRate)} a day.` : '.'
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
        <p class="coach-verdict">${formatRupees(plan.requiredPerMonth)} a month</p>
        <p class="recap-line">Over ${plan.monthsLeft} month${plan.monthsLeft === 1 ? '' : 's'}. Set your income on the Plan screen and I can tell you whether that's realistic.</p>
      </div>`;
  }

  return `
    <div class="coach-answer">
      <p class="coach-verdict ${plan.feasible ? 'good' : 'warn'}">${formatRupees(plan.requiredPerMonth)} a month</p>
      <p class="recap-line">To have ${formatRupees(plan.target)} in ${plan.monthsLeft} month${plan.monthsLeft === 1 ? '' : 's'}.</p>
      <div class="totals-card">
        <div class="totals-row"><span>Budget each cycle</span><span>${formatRupees(s.free)}</span></div>
        <div class="totals-row"><span>You typically spend</span><span class="out">-${formatRupees(plan.typicalVariable)}</span></div>
        <div class="totals-row net"><span>Usually spare</span><span class="${plan.typicalSpare < 0 ? 'out' : 'in'}">${formatRupees(plan.typicalSpare)}</span></div>
      </div>
      ${
        plan.feasible
          ? `<p class="recap-line">That works without changing anything - you usually have ${formatRupees(plan.typicalSpare)} spare, which covers it.</p>`
          : (() => {
              const found = plan.cuts.reduce((t, c) => t + c.cut, 0);
              const covers = found >= plan.shortfall;
              return `
                <p class="recap-line">You're ${formatRupees(plan.shortfall)} a month short.${
                  plan.cuts.length ? ' Here\'s where that could come from:' : ''
                }</p>
                ${plan.cuts.length ? cutList(plan.cuts) : ''}
                ${
                  covers
                    ? ''
                    : `<p class="recap-line">That only finds ${formatRupees(found)} of it. For the remaining ${formatRupees(
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
        <p class="recap-line">${formatRupees(s.categoryAverages.uncategorized)} a month - ${Math.round(
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
        needed > 0 ? `Find ${formatRupees(needed)} a month` : 'Your biggest levers'
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
            <span>${escapeHtml(c.name)}<br><span class="muted-note">${formatRupees(c.average)} a month → aim for ${formatRupees(c.newTarget)}</span></span>
          </span>
          <span class="fixed-row-right"><span class="out">-${formatRupees(c.cut)}</span></span>
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


/* NEW (5.16): Coach's top in Tactile, Peaks and Mindora, after their mockups:
 * the same figures as the Charts card - left at this pace and by when, your
 * pace and the safe amount a day, the days left, and how much of what is
 * left this pace would use - in each style's own drawing. */
function coachTop(style, f) {
  const pct = `${Math.round(f.share * 100)}%`;
  const neg = f.over ? ' is-negative' : '';
  if (style === 'tactile' || style === 'instrument') {
    return `<section class="tl-hero ct-top${neg}">
        <div class="tl-top"><span class="tl-k">Left at this pace</span><span class="tl-period">by ${f.by}</span></div>
        <div class="tl-big">${f.left}</div>
        <div class="tl-stats"><div><span class="tl-k">Your pace</span><b>${f.pace}</b></div><div><span class="tl-k">Safe</span><b>${f.safe}</b></div><div><span class="tl-k">Days left</span><b>${f.days}</b></div></div>
        <div class="tl-prog"><i class="${f.over ? 'bad' : ''}" style="width:${pct}"></i><span><span>At this pace</span><span>${f.uses}</span></span></div>
      </section>`;
  }
  if (style === 'peaks') {
    // The reference's gauge: an arc three quarters round, from a teal dot.
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const at = (a, r = 44) => [60 + r * Math.cos(a), 56 + r * Math.sin(a)];
    const arc = (s0, e0) => {
      const [x0, y0] = at(s0);
      const [x1, y1] = at(e0);
      return `M${x0.toFixed(2)} ${y0.toFixed(2)} A44 44 0 ${e0 - s0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
    };
    const [tx, ty] = at(a0);
    return `<section class="pk-panel ct-top ct-top--peaks${neg}">
        <div class="pk-top"><span class="pk-lab">Left at this pace</span><span class="pk-tiny">by ${f.by}</span></div>
        <svg class="ct-gauge" viewBox="0 0 120 110" role="img" aria-label="At this pace you use ${f.uses}">
          <path class="ct-gauge__trk" d="${arc(a0, a1)}"/>
          ${f.share > 0.005 ? `<path class="ct-gauge__arc" d="${arc(a0, a0 + (a1 - a0) * f.share)}"/>` : ''}
          <circle class="ct-gauge__dot" cx="${tx.toFixed(2)}" cy="${ty.toFixed(2)}" r="4.5"/>
          <text class="ct-gauge__v" x="60" y="60" text-anchor="middle">${f.left}</text>
          <text class="ct-gauge__k" x="60" y="76" text-anchor="middle">uses ${f.uses}</text>
        </svg>
        <div class="pk-figs">
          <div><div class="pk-n pk-n--m">${f.pace}</div><div class="pk-tiny">your pace</div></div>
          <div><div class="pk-n pk-n--m ct-safe">${f.safe}</div><div class="pk-tiny">safe</div></div>
          <div><div class="pk-n pk-n--s">${f.days}</div><div class="pk-tiny">days left</div></div>
        </div>
      </section>`;
  }
  return `<section class="md-glass md-hero ct-top${neg}">
      <div class="md-top"><span class="md-kick">Left at this pace</span><span class="md-period">by ${f.by}</span></div>
      <div class="md-big">${f.left}</div>
      <div class="md-stats"><div><span class="md-kick">Your pace</span><b>${f.pace}</b></div><div><span class="md-kick">Safe</span><b>${f.safe}</b></div><div><span class="md-kick">Days left</span><b>${f.days}</b></div></div>
      <div class="md-spent"><span>At this pace</span><span>${f.uses}</span></div>
      <div class="md-prog"><i class="${f.over ? 'bad' : ''}" style="width:${pct}"></i></div>
    </section>`;
}
