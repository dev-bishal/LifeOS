// Goals overview.

import { router } from '../core/router.js';
import { esc, plural } from '../core/utils.js';
import { todayKey, diffDays, formatDate, formatDuration } from '../core/dates.js';
import { colorHex, GOAL_STATUSES } from '../data/models.js';
import { goalsByStatus, goalProgress, activitiesOf, nextTaskOfGoal, goalFocusMinutes } from '../data/selectors.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { pageHeader, tabs, emptyState, progressRing } from '../ui/components/common.js';

let tab = 'active';

export function targetLabel(goal) {
  if (!goal.targetDate) return '';
  const days = diffDays(todayKey(), goal.targetDate);
  const date = formatDate(goal.targetDate, { month: 'short', day: 'numeric', year: 'numeric' });
  if (goal.status === 'completed') return `Target ${date}`;
  if (days < 0) return `<span class="text-rose-600 dark:text-rose-400">${date} · ${plural(-days, 'day')} past target</span>`;
  if (days === 0) return `<span class="text-amber-600 dark:text-amber-400">Target is today</span>`;
  return `${date} · ${plural(days, 'day')} left`;
}

function goalCard(g) {
  const p = goalProgress(g.id);
  const hex = colorHex(g.color);
  const next = nextTaskOfGoal(g.id);
  const acts = activitiesOf(g.id).length;
  const minutes = goalFocusMinutes(g.id);
  return `
    <article class="card group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <div class="h-1.5" style="background:${hex}"></div>
      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            ${g.category ? `<span class="chip" style="background:${hex}1a;color:${hex}">${esc(g.category)}</span>` : ''}
            <h2 class="mt-1.5 text-base leading-snug font-semibold text-slate-900 dark:text-white">
              <a href="#/goals/${g.id}" class="after:absolute after:inset-0 focus-visible:outline-none">${esc(g.title)}</a>
            </h2>
          </div>
          ${progressRing(p.pct, { size: 52, stroke: 5, color: hex, textCls: 'text-xs font-semibold' })}
        </div>
        ${g.why ? `<p class="line-clamp-2 mt-2 text-sm text-slate-500 dark:text-slate-400">${esc(g.why)}</p>` : ''}
        <dl class="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center dark:bg-slate-800/50">
          <div><dt class="text-[11px] text-slate-500 dark:text-slate-400">Activities</dt><dd class="text-sm font-semibold text-slate-900 tabular dark:text-white">${acts}</dd></div>
          <div><dt class="text-[11px] text-slate-500 dark:text-slate-400">Tasks</dt><dd class="text-sm font-semibold text-slate-900 tabular dark:text-white">${p.done}/${p.total}</dd></div>
          <div><dt class="text-[11px] text-slate-500 dark:text-slate-400">Focus</dt><dd class="text-sm font-semibold text-slate-900 tabular dark:text-white">${formatDuration(minutes)}</dd></div>
        </dl>
        <div class="mt-auto space-y-1 pt-4 text-xs text-slate-500 dark:text-slate-400">
          ${next ? `<p class="flex items-center gap-1.5 truncate">${icon('chevron-right', 'size-3.5 text-indigo-500')}<span class="truncate">Next: ${esc(next.title)}</span></p>` : p.total ? '' : '<p>No tasks yet — break it down.</p>'}
          ${g.targetDate ? `<p class="flex items-center gap-1.5">${icon('flag', 'size-3.5')}${targetLabel(g)}</p>` : ''}
        </div>
      </div>
    </article>`;
}

registerActions({
  'goals:tab': (el) => {
    tab = el.dataset.value;
    router.refresh();
  },
});

export default {
  title: 'Goals',
  render() {
    const counts = Object.fromEntries(GOAL_STATUSES.map((s) => [s.id, goalsByStatus(s.id).length]));
    const goals = goalsByStatus(tab);
    const allEmpty = !Object.values(counts).some(Boolean);

    return `
      ${pageHeader({
        title: 'Goals',
        subtitle: 'Progress is calculated from the tasks and subtasks underneath each goal.',
        actions: `<button type="button" class="btn btn-primary" data-action="goal:new">${icon('plus', 'size-4')} New goal</button>`,
      })}
      ${allEmpty ? '' : `<div class="mb-5">${tabs(GOAL_STATUSES.map((s) => ({ id: s.id, label: s.label, count: counts[s.id] })), tab, 'goals:tab', 'Goal status')}</div>`}
      ${
        goals.length
          ? `<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">${goals.map(goalCard).join('')}</div>`
          : `<div class="card">${
              allEmpty
                ? emptyState({
                    iconName: 'target',
                    title: 'Set your first goal',
                    text: 'A goal is an outcome you want, like "Get a .NET Developer Job". You will break it into activities, tasks and subtasks, and LifeOS tracks progress automatically.',
                    action: `<button type="button" class="btn btn-primary" data-action="goal:new">${icon('plus', 'size-4')} Create a goal</button>`,
                  })
                : emptyState({ iconName: 'target', title: `No ${tab} goals` })
            }</div>`
      }`;
  },
};
