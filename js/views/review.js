// Daily & weekly reviews: reflect on what happened and decide what's next.

import { store } from '../core/store.js';
import { router } from '../core/router.js';
import { esc, plural, sum, groupBy } from '../core/utils.js';
import { todayKey, addDays, startOfWeek, formatDate, relativeDay, formatDuration } from '../core/dates.js';
import { colorHex } from '../data/models.js';
import { completedBetween, sessionsBetween, reviewFor, activeGoals, goalProgress, openTasks, isOverdue } from '../data/selectors.js';
import { saveReview } from '../data/actions.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { tabs, progressBar } from '../ui/components/common.js';

const state = { type: 'daily', day: todayKey(), week: null };
const drafts = new Map(); // "type:period" -> unsaved field values

const MOODS = [
  { v: 1, label: 'Rough' },
  { v: 2, label: 'Meh' },
  { v: 3, label: 'Okay' },
  { v: 4, label: 'Good' },
  { v: 5, label: 'Great' },
];

const FIELDS = {
  daily: [
    ['wins', 'What went well today?', 'Small wins count.'],
    ['challenges', 'What was hard or got in the way?', 'Distractions, blockers, energy…'],
    ['lessons', 'What did I learn?', 'Anything to do differently?'],
    ['nextFocus', "Tomorrow's top priorities", '1–3 things that would make tomorrow a success.'],
  ],
  weekly: [
    ['wins', 'Wins of the week', 'What moved your goals forward?'],
    ['challenges', 'What didn’t go as planned?', 'Be honest, not harsh.'],
    ['lessons', 'Lessons & adjustments', 'What will you change next week?'],
    ['nextFocus', "Next week's focus", 'The few outcomes that matter most.'],
  ],
};

const weekStart = () => Number(store.settings.weekStartsOn) || 0;
const period = () => (state.type === 'daily' ? state.day : state.week || startOfWeek(todayKey(), weekStart()));
const draftKey = () => `${state.type}:${period()}`;

function values() {
  const saved = reviewFor(state.type, period()) || {};
  return { ...saved, ...(drafts.get(draftKey()) || {}) };
}

function scale(name, label, current) {
  return `
    <fieldset>
      <legend class="label">${label}</legend>
      <div class="flex flex-wrap gap-1.5">
        ${MOODS.map(
          (m) => `
          <label class="cursor-pointer">
            <input type="radio" name="${name}" value="${m.v}" class="peer sr-only" data-change="review:draft" ${Number(current) === m.v ? 'checked' : ''} />
            <span class="block rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 transition peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:ring-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800">${m.v} · ${m.label}</span>
          </label>`
        ).join('')}
      </div>
    </fieldset>`;
}

function summary(start, end) {
  const done = completedBetween(start, end);
  const sessions = sessionsBetween(start, end);
  const minutes = sum(sessions, (s) => s.minutes);
  const overdue = openTasks().filter((t) => isOverdue(t)).length;
  const byGoal = groupBy(done, (t) => t.goalId || '');
  return `
    <section class="card p-5">
      <h2 class="section-title">${state.type === 'daily' ? 'The day in numbers' : 'The week in numbers'}</h2>
      <dl class="mt-3 grid grid-cols-3 gap-3 text-center">
        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt class="text-xs text-slate-500 dark:text-slate-400">Completed</dt><dd class="text-xl font-bold text-slate-900 tabular dark:text-white">${done.length}</dd></div>
        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt class="text-xs text-slate-500 dark:text-slate-400">Focus</dt><dd class="text-xl font-bold text-slate-900 tabular dark:text-white">${formatDuration(minutes)}</dd></div>
        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt class="text-xs text-slate-500 dark:text-slate-400">Pomodoros</dt><dd class="text-xl font-bold text-slate-900 tabular dark:text-white">${sessions.filter((s) => s.completed).length}</dd></div>
      </dl>
      ${
        done.length
          ? `<h3 class="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Done</h3>
             <ul class="max-h-64 space-y-1 overflow-y-auto text-sm">
               ${done
                 .slice(0, 30)
                 .map((t) => {
                   const g = t.goalId ? store.get('goals', t.goalId) : null;
                   return `<li class="flex items-center gap-2"><span class="text-emerald-500">${icon('check', 'size-3.5')}</span><span class="min-w-0 flex-1 truncate">${esc(t.title)}</span>${g ? `<span class="size-2 shrink-0 rounded-full" style="background:${colorHex(g.color)}" title="${esc(g.title)}"></span>` : ''}</li>`;
                 })
                 .join('')}
             </ul>`
          : '<p class="mt-3 text-sm text-slate-500 dark:text-slate-400">No tasks completed in this period.</p>'
      }
      ${
        state.type === 'weekly'
          ? `<h3 class="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Goals</h3>
             <ul class="space-y-2.5">${activeGoals()
               .map((g) => {
                 const p = goalProgress(g.id);
                 const n = (byGoal.get(g.id) || []).length;
                 return `<li class="text-sm"><div class="mb-1 flex justify-between gap-2"><span class="truncate">${esc(g.title)}</span><span class="shrink-0 text-xs text-slate-500">${p.pct}% · +${n} this week</span></div>${progressBar(p.pct, { color: colorHex(g.color), label: g.title })}</li>`;
               })
               .join('')}</ul>`
          : ''
      }
      ${overdue ? `<p class="mt-4 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">${icon('alert', 'size-4')} ${plural(overdue, 'overdue task')} — reschedule or drop them.</p>` : ''}
    </section>`;
}

registerActions({
  'review:type': (el) => {
    state.type = el.dataset.value;
    router.refresh();
  },
  'review:prev': () => {
    if (state.type === 'daily') state.day = addDays(state.day, -1);
    else state.week = addDays(period(), -7);
    router.refresh();
  },
  'review:next': () => {
    if (state.type === 'daily') state.day = addDays(state.day, 1);
    else state.week = addDays(period(), 7);
    router.refresh();
  },
  'review:open': (el) => {
    state.type = el.dataset.type;
    if (state.type === 'daily') state.day = el.dataset.period;
    else state.week = el.dataset.period;
    router.refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  'review:draft': (el) => {
    const key = draftKey();
    const draft = drafts.get(key) || {};
    draft[el.name] = el.type === 'radio' ? Number(el.value) : el.value;
    drafts.set(key, draft);
  },
  'review:save': (form) => {
    const f = new FormData(form);
    const fields = {
      mood: Number(f.get('mood')) || null,
      energy: Number(f.get('energy')) || null,
    };
    FIELDS[state.type].forEach(([name]) => (fields[name] = String(f.get(name) || '').trim()));
    saveReview(state.type, period(), fields);
    drafts.delete(draftKey());
    toast('Review saved', { type: 'success' });
  },
});

export default {
  title: 'Reviews',
  render() {
    const today = todayKey();
    const p = period();
    const v = values();
    const saved = reviewFor(state.type, p);
    const isDaily = state.type === 'daily';
    const end = isDaily ? p : addDays(p, 6);
    const heading = isDaily
      ? `${relativeDay(p)}${relativeDay(p) === formatDate(p) ? '' : ` · ${formatDate(p, { weekday: 'long', month: 'long', day: 'numeric' })}`}`
      : `Week of ${formatDate(p, { month: 'long', day: 'numeric' })} – ${formatDate(end, { month: 'short', day: 'numeric' })}`;
    const atLatest = isDaily ? p >= today : addDays(p, 7) > today;
    const history = store
      .all('reviews')
      .filter((r) => r.type === state.type)
      .sort((a, b) => (b.period || '').localeCompare(a.period || ''))
      .slice(0, 12);

    return `
      <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="page-title">Reviews</h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Close the loop: execution → completion → <b>review</b> → better planning.</p>
        </div>
        ${tabs([{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }], state.type, 'review:type', 'Review type')}
      </div>

      <div class="mb-4 flex items-center gap-2">
        <button type="button" class="btn btn-secondary btn-icon" data-action="review:prev" aria-label="Previous">${icon('chevron-left', 'size-4')}</button>
        <h2 class="min-w-0 flex-1 truncate text-center text-base font-semibold text-slate-900 sm:flex-none sm:text-left dark:text-white">${esc(heading)}</h2>
        <button type="button" class="btn btn-secondary btn-icon" data-action="review:next" aria-label="Next" ${atLatest ? 'disabled' : ''}>${icon('chevron-right', 'size-4')}</button>
        ${saved ? `<span class="chip ml-auto bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">${icon('check', 'size-3')} Saved</span>` : ''}
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form class="card space-y-5 p-5" data-submit="review:save">
          ${scale('mood', isDaily ? 'How did today feel?' : 'How did this week feel?', v.mood)}
          ${scale('energy', 'Energy level', v.energy)}
          ${FIELDS[state.type]
            .map(
              ([name, label, hint]) => `
            <div>
              <label class="label" for="rv-${name}">${label}</label>
              <textarea id="rv-${name}" name="${name}" rows="3" class="input" placeholder="${esc(hint)}" data-input="review:draft">${esc(v[name] || '')}</textarea>
            </div>`
            )
            .join('')}
          <div class="flex justify-end">
            <button type="submit" class="btn btn-primary">${icon('check', 'size-4')} ${saved ? 'Update review' : 'Save review'}</button>
          </div>
        </form>

        <div class="space-y-4">
          ${summary(p, end)}
          <section class="card p-5">
            <h2 class="section-title mb-2">Past ${isDaily ? 'daily' : 'weekly'} reviews</h2>
            ${
              history.length
                ? `<ul class="space-y-0.5">${history
                    .map(
                      (r) => `<li><button type="button" class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 ${r.period === p ? 'bg-indigo-50 dark:bg-indigo-500/10' : ''}" data-action="review:open" data-type="${r.type}" data-period="${r.period}">
                        <span>${isDaily ? formatDate(r.period, { weekday: 'short', month: 'short', day: 'numeric' }) : `Week of ${formatDate(r.period)}`}</span>
                        <span class="text-xs text-slate-400">${r.mood ? MOODS[r.mood - 1].label : ''}</span>
                      </button></li>`
                    )
                    .join('')}</ul>`
                : '<p class="text-sm text-slate-500 dark:text-slate-400">None yet.</p>'
            }
          </section>
        </div>
      </div>`;
  },
};

