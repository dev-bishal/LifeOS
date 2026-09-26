// Goal detail: the Goal → Activity → Task → Subtask hierarchy in one place.

import { store } from '../core/store.js';
import { router } from '../core/router.js';
import { esc, plural, sum } from '../core/utils.js';
import { formatDuration } from '../core/dates.js';
import { colorHex, GOAL_STATUSES } from '../data/models.js';
import {
  activitiesOf, tasksOfGoal, tasksOfActivity, goalProgress, activityProgress,
  sortTasks, isDone, subtasksOf, goalFocusMinutes,
} from '../data/selectors.js';
import { setGoalStatus } from '../data/actions.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { taskList, inlineAdd } from '../ui/components/taskItem.js';
import { progressBar, progressRing, emptyState } from '../ui/components/common.js';
import { targetLabel } from './goals.js';

const collapsed = new Set();
const showDone = new Set();

function taskGroup(key, tasks, addOpts) {
  const open = sortTasks(tasks.filter((t) => !isDone(t)));
  const done = sortTasks(tasks.filter(isDone));
  return `
    ${taskList(open, { showGoal: false })}
    ${inlineAdd(addOpts)}
    ${
      done.length
        ? `<button type="button" class="mt-1 ml-2.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white" data-action="goal:toggle-done" data-key="${key}">
            ${icon(showDone.has(key) ? 'chevron-down' : 'chevron-right', 'size-3.5')} ${showDone.has(key) ? 'Hide' : 'Show'} ${plural(done.length, 'completed task')}
          </button>
          ${showDone.has(key) ? taskList(done, { showGoal: false }) : ''}`
        : ''
    }`;
}

function activityCard(act, hex) {
  const tasks = tasksOfActivity(act.id);
  const p = activityProgress(act.id);
  const isCollapsed = collapsed.has(act.id);
  return `
    <section class="card overflow-hidden" aria-labelledby="act-${act.id}">
      <div class="flex items-center gap-3 p-4">
        <button type="button" class="btn-ghost p-1" data-action="goal:collapse" data-id="${act.id}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${esc(act.title)}">
          ${icon(isCollapsed ? 'chevron-right' : 'chevron-down', 'size-4')}
        </button>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <h3 id="act-${act.id}" class="truncate font-semibold text-slate-900 dark:text-white">${esc(act.title)}</h3>
            <span class="shrink-0 text-xs text-slate-500 tabular dark:text-slate-400">${p.done}/${p.total} · ${p.pct}%</span>
          </div>
          <div class="mt-2">${progressBar(p.pct, { color: hex, label: act.title })}</div>
          ${act.description ? `<p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">${esc(act.description)}</p>` : ''}
        </div>
        <button type="button" class="btn-ghost p-1.5" data-action="activity:edit" data-id="${act.id}" aria-label="Edit activity ${esc(act.title)}">${icon('edit', 'size-4')}</button>
      </div>
      ${
        isCollapsed
          ? ''
          : `<div class="border-t border-slate-100 p-2 dark:border-slate-800">
              ${taskGroup(act.id, tasks, { id: `add-${act.id}`, placeholder: `Add a task to ${act.title}…`, goalId: act.goalId, activityId: act.id })}
            </div>`
      }
    </section>`;
}

registerActions({
  'goal:collapse': (el) => {
    collapsed.has(el.dataset.id) ? collapsed.delete(el.dataset.id) : collapsed.add(el.dataset.id);
    router.refresh();
  },
  'goal:toggle-done': (el) => {
    showDone.has(el.dataset.key) ? showDone.delete(el.dataset.key) : showDone.add(el.dataset.key);
    router.refresh();
  },
  'goal:status': (el) => {
    const goal = store.get('goals', el.dataset.id);
    const previous = goal.status;
    setGoalStatus(el.dataset.id, el.dataset.status);
    const label = GOAL_STATUSES.find((s) => s.id === el.dataset.status)?.label.toLowerCase();
    toast(el.dataset.status === 'completed' ? 'Goal completed — congratulations!' : `Goal ${label}`, {
      type: 'success',
      actionLabel: 'Undo',
      onAction: () => setGoalStatus(goal.id, previous),
    });
  },
});

export default {
  title: (params) => store.get('goals', params.id)?.title || 'Goal',
  render(params) {
    const goal = store.get('goals', params.id);
    if (!goal) {
      return `<div class="card">${emptyState({
        iconName: 'target',
        title: 'Goal not found',
        text: 'It may have been deleted.',
        action: '<a href="#/goals" class="btn btn-secondary">Back to goals</a>',
      })}</div>`;
    }
    const hex = colorHex(goal.color);
    const p = goalProgress(goal.id);
    const acts = activitiesOf(goal.id);
    const allTasks = tasksOfGoal(goal.id);
    const loose = allTasks.filter((t) => !t.activityId || !store.get('activities', t.activityId));
    const subs = allTasks.flatMap((t) => subtasksOf(t.id));
    const minutes = goalFocusMinutes(goal.id);
    const statusChip = goal.status !== 'active' ? `<span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">${GOAL_STATUSES.find((s) => s.id === goal.status)?.label}</span>` : '';

    const statusButtons =
      goal.status === 'completed'
        ? `<button type="button" class="btn btn-secondary" data-action="goal:status" data-id="${goal.id}" data-status="active">${icon('reset', 'size-4')} Reopen</button>`
        : `<button type="button" class="btn btn-secondary" data-action="goal:status" data-id="${goal.id}" data-status="completed">${icon('check', 'size-4')} Complete</button>
           ${
             goal.status === 'paused'
               ? `<button type="button" class="btn btn-secondary" data-action="goal:status" data-id="${goal.id}" data-status="active">${icon('play', 'size-4')} Resume</button>`
               : `<button type="button" class="btn btn-secondary" data-action="goal:status" data-id="${goal.id}" data-status="paused">${icon('pause', 'size-4')} Pause</button>`
           }`;

    return `
      <a href="#/goals" class="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">${icon('arrow-left', 'size-4')} Goals</a>

      <section class="card relative mb-6 overflow-hidden">
        <div class="absolute inset-y-0 left-0 w-1.5" style="background:${hex}"></div>
        <div class="flex flex-col gap-5 p-5 pl-7 sm:flex-row sm:items-start">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              ${goal.category ? `<span class="chip" style="background:${hex}1a;color:${hex}">${esc(goal.category)}</span>` : ''}
              ${statusChip}
            </div>
            <h1 class="page-title mt-1.5">${esc(goal.title)}</h1>
            ${goal.why ? `<p class="mt-2 text-sm text-slate-600 dark:text-slate-300"><span class="font-medium text-slate-900 dark:text-white">Why:</span> ${esc(goal.why)}</p>` : ''}
            ${goal.description ? `<p class="mt-1 text-sm text-slate-600 dark:text-slate-300"><span class="font-medium text-slate-900 dark:text-white">Done when:</span> ${esc(goal.description)}</p>` : ''}
            ${goal.targetDate ? `<p class="mt-3 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">${icon('flag', 'size-4')} ${targetLabel(goal)}</p>` : ''}
            <div class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary" data-action="activity:new" data-goal-id="${goal.id}">${icon('layers', 'size-4')} Add activity</button>
              <button type="button" class="btn btn-secondary" data-action="goal:edit" data-id="${goal.id}">${icon('edit', 'size-4')} Edit</button>
              ${statusButtons}
            </div>
          </div>
          <div class="flex items-center gap-5 sm:flex-col sm:items-end">
            ${progressRing(p.pct, { size: 96, stroke: 8, color: hex, textCls: 'text-xl font-bold' })}
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
          ${[
            ['Tasks done', `${p.done}/${p.total}`],
            ['Subtasks done', `${subs.filter((s) => s.done).length}/${subs.length}`],
            ['Activities', acts.length],
            ['Focus time', formatDuration(minutes)],
          ]
            .map(([k, v]) => `<div class="bg-white px-5 py-3 dark:bg-slate-900"><dt class="text-xs text-slate-500 dark:text-slate-400">${k}</dt><dd class="text-lg font-semibold text-slate-900 tabular dark:text-white">${v}</dd></div>`)
            .join('')}
        </dl>
      </section>

      ${
        p.total && p.pct === 100 && goal.status === 'active'
          ? `<div class="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
              ${icon('award', 'size-5')} Every task is done. Did you reach this goal?
              <button type="button" class="btn btn-primary btn-sm ml-auto" data-action="goal:status" data-id="${goal.id}" data-status="completed">Mark goal complete</button>
            </div>`
          : ''
      }

      <div class="space-y-4">
        ${acts.map((a) => activityCard(a, hex)).join('')}
        <section class="card overflow-hidden">
          <div class="p-4 pb-2">
            <h3 class="font-semibold text-slate-900 dark:text-white">${acts.length ? 'Other tasks' : 'Tasks'}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">${acts.length ? 'Tasks for this goal that are not part of an activity.' : 'Add tasks directly, or group them into activities (e.g. "Learn ASP.NET Core").'}</p>
          </div>
          <div class="p-2 pt-0">${taskGroup(`loose-${goal.id}`, loose, { id: `add-loose-${goal.id}`, placeholder: 'Add a task to this goal…', goalId: goal.id })}</div>
        </section>
        ${
          !acts.length && !allTasks.length
            ? `<p class="text-center text-sm text-slate-500 dark:text-slate-400">Tip: a goal's progress is the average progress of its tasks — each subtask you tick moves it forward.</p>`
            : `<p class="text-center text-xs text-slate-400">Progress: ${p.pct}% across ${plural(p.total, 'task')}${sum(allTasks, (t) => subtasksOf(t.id).length) ? ' (subtasks count toward partial progress)' : ''}.</p>`
        }
      </div>`;
  },
};

