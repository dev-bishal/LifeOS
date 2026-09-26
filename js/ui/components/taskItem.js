// Task row + inline quick-add form used by every list of tasks.

import { store } from '../../core/store.js';
import { esc } from '../../core/utils.js';
import { todayKey, relativeDay, formatTime } from '../../core/dates.js';
import { priorityOf, colorHex } from '../../data/models.js';
import { isDone, subtasksOf, reminderForTask, pomodorosOfTask } from '../../data/selectors.js';
import { icon } from '../icons.js';

function dateChip(task, today) {
  const time = task.dueTime ? ` ${formatTime(task.dueTime)}` : '';
  if (task.dueDate) {
    let tone = 'text-slate-500 dark:text-slate-400';
    if (!isDone(task) && task.dueDate < today) tone = 'text-rose-600 dark:text-rose-400';
    else if (task.dueDate === today) tone = 'text-indigo-600 dark:text-indigo-400';
    return `<span class="chip px-0 ${tone}">${icon('calendar', 'size-3')}${esc(relativeDay(task.dueDate))}${time}</span>`;
  }
  if (task.scheduledDate && !isDone(task)) {
    const label = task.scheduledDate === today ? 'Today' : task.scheduledDate < today ? `Planned ${relativeDay(task.scheduledDate)}` : relativeDay(task.scheduledDate);
    return `<span class="chip px-0 text-amber-600 dark:text-amber-400">${icon('star', 'size-3')}${esc(label)}</span>`;
  }
  return '';
}

/**
 * Render one task as an <li>.
 * opts: showGoal (default true), showActivity, draggable
 */
export function taskItem(task, { showGoal = true, showActivity = false, draggable = false } = {}) {
  const today = todayKey();
  const done = isDone(task);
  const p = priorityOf(task.priority);
  const subs = subtasksOf(task.id);
  const subsDone = subs.filter((s) => s.done).length;
  const goal = showGoal && task.goalId ? store.get('goals', task.goalId) : null;
  const activity = showActivity && task.activityId ? store.get('activities', task.activityId) : null;
  const planned = task.scheduledDate && task.scheduledDate <= today;

  const chips = [];
  const date = dateChip(task, today);
  if (date) chips.push(date);
  if (task.priority !== 'none' && !done) chips.push(`<span class="chip px-0 ${p.text}">${icon('flag', 'size-3')}${p.label}</span>`);
  if (subs.length) chips.push(`<span class="chip px-0 text-slate-500 dark:text-slate-400">${icon('list', 'size-3')}${subsDone}/${subs.length}</span>`);
  if (task.estimate > 0 || pomodorosOfTask(task.id) > 0)
    chips.push(`<span class="chip px-0 text-slate-500 dark:text-slate-400" title="Pomodoros done / estimated">${icon('timer', 'size-3')}${pomodorosOfTask(task.id)}${task.estimate ? `/${task.estimate}` : ''}</span>`);
  if (task.recurrence && task.recurrence !== 'none') chips.push(`<span class="text-slate-400" title="Repeats">${icon('repeat', 'size-3')}</span>`);
  if (reminderForTask(task.id)) chips.push(`<span class="text-slate-400" title="Reminder set">${icon('bell', 'size-3')}</span>`);
  (task.tags || []).slice(0, 3).forEach((t) => chips.push(`<span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">#${esc(t)}</span>`));
  if (goal) {
    chips.push(`<span class="chip max-w-48 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><span class="size-1.5 shrink-0 rounded-full" style="background:${colorHex(goal.color)}"></span><span class="truncate">${esc(goal.title)}</span></span>`);
  }
  if (activity) chips.push(`<span class="chip max-w-40 px-0 text-slate-500 dark:text-slate-400">${icon('layers', 'size-3')}<span class="truncate">${esc(activity.title)}</span></span>`);

  const hoverOnly = '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100';

  return `
    <li class="task-row group relative flex items-start gap-3 rounded-xl px-2.5 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/40" data-task-id="${task.id}" ${draggable ? 'draggable="true"' : ''}>
      <button type="button" class="task-check mt-0.5 ${done ? 'border-indigo-600 bg-indigo-600 text-white' : `${p.ring} text-slate-400`}"
        role="checkbox" aria-checked="${done}" aria-label="${done ? 'Mark as not done' : 'Complete'}: ${esc(task.title)}"
        data-action="task:toggle" data-id="${task.id}">${icon('check', 'size-3', { strokeWidth: 3.5 })}</button>
      <button type="button" class="min-w-0 flex-1 cursor-pointer text-left" data-action="task:open" data-id="${task.id}">
        <span class="task-title block text-sm leading-5 ${done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}">${esc(task.title)}</span>
        ${chips.length ? `<span class="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">${chips.join('')}</span>` : ''}
      </button>
      ${
        done
          ? ''
          : `<div class="flex items-center transition ${hoverOnly}">
              <button type="button" class="btn-ghost p-1.5 ${planned ? 'text-amber-500 dark:text-amber-400' : ''}" data-action="task:today" data-id="${task.id}" aria-pressed="${!!planned}" aria-label="${planned ? 'Remove from today' : 'Plan for today'}" title="${planned ? 'Remove from today' : 'Plan for today'}">${icon('star', 'size-4', { filled: !!planned })}</button>
              <button type="button" class="btn-ghost p-1.5" data-action="task:focus" data-id="${task.id}" aria-label="Focus on ${esc(task.title)}" title="Start focus session">${icon('timer', 'size-4')}</button>
            </div>`
      }
    </li>`;
}

export function taskList(tasks, opts = {}) {
  if (!tasks.length) return '';
  return `<ul class="space-y-0.5" role="list">${tasks.map((t) => taskItem(t, opts)).join('')}</ul>`;
}

/**
 * Inline "add a task" input. Defaults are passed as data attributes and
 * applied by the `task:quick` handler. `id` must be stable across renders.
 */
export function inlineAdd({ id, placeholder = 'Add a task…', goalId = '', activityId = '', dueDate = '', today = false }) {
  return `
    <form data-submit="task:quick" data-goal-id="${goalId}" data-activity-id="${activityId}" data-due-date="${dueDate}" data-today="${today ? '1' : ''}"
      class="group flex items-center gap-3 rounded-xl px-2.5 py-2 text-slate-400 transition focus-within:bg-slate-50 hover:bg-slate-50 dark:focus-within:bg-slate-800/40 dark:hover:bg-slate-800/40">
      <span class="grid size-5 place-items-center text-indigo-500">${icon('plus', 'size-4')}</span>
      <label for="${id}" class="sr-only">${esc(placeholder)}</label>
      <input id="${id}" name="title" autocomplete="off" enterkeyhint="done" placeholder="${esc(placeholder)}"
        class="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100" />
    </form>`;
}
