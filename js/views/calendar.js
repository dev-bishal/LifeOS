// Calendar — month grid + agenda for the selected day. Drag tasks between days to reschedule.

import { store } from '../core/store.js';
import { router } from '../core/router.js';
import { esc, plural } from '../core/utils.js';
import { todayKey, parseKey, monthGrid, weekdayNames, relativeDay, formatDate, isoToKey, formatDuration } from '../core/dates.js';
import { colorHex } from '../data/models.js';
import { isDone, sortTasks, sessionsOn } from '../data/selectors.js';
import { rescheduleTask } from '../data/actions.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { taskList, inlineAdd } from '../ui/components/taskItem.js';

const now = new Date();
const state = { year: now.getFullYear(), month: now.getMonth(), selected: todayKey() };

/** date key -> tasks shown on that day (open by due/planned date, done by completion date) */
function tasksByDay() {
  const map = new Map();
  const add = (key, t) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  };
  for (const t of store.all('tasks')) {
    if (isDone(t)) add(isoToKey(t.completedAt), t);
    else {
      add(t.dueDate, t);
      if (t.scheduledDate && t.scheduledDate !== t.dueDate) add(t.scheduledDate, t);
    }
  }
  for (const [k, list] of map) map.set(k, sortTasks(list));
  return map;
}

function pill(t) {
  const goal = t.goalId ? store.get('goals', t.goalId) : null;
  const hex = goal ? colorHex(goal.color) : '#94a3b8';
  const done = isDone(t);
  return `
    <button type="button" data-action="task:open" data-id="${t.id}" ${done ? '' : `draggable="true" data-drag-id="${t.id}"`}
      class="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-4 ${done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'} hover:bg-slate-100 dark:hover:bg-slate-800"
      title="${esc(t.title)}">
      <span class="size-1.5 shrink-0 rounded-full" style="background:${done ? '#cbd5e1' : hex}"></span><span class="truncate">${esc(t.title)}</span>
    </button>`;
}

function cell(key, byDay, month) {
  const d = parseKey(key);
  const inMonth = d.getMonth() === month;
  const today = todayKey();
  const tasks = byDay.get(key) || [];
  const open = tasks.filter((t) => !isDone(t));
  const overdue = open.some((t) => t.dueDate && t.dueDate < today);
  const selected = key === state.selected;
  const isToday = key === today;
  return `
    <div role="gridcell" aria-selected="${selected}" data-action="cal:select" data-date="${key}" data-drop="${key}"
      class="cal-cell min-h-14 cursor-pointer border-t border-l border-slate-100 p-1 transition sm:min-h-24 dark:border-slate-800 ${inMonth ? '' : 'bg-slate-50/60 dark:bg-slate-900/40'} ${selected ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}">
      <div class="flex items-center justify-between">
        <span class="grid size-6 place-items-center rounded-full text-xs font-medium tabular ${isToday ? 'bg-indigo-600 text-white' : inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600'}">${d.getDate()}</span>
        ${overdue ? '<span class="size-1.5 rounded-full bg-rose-500" title="Overdue"></span>' : ''}
      </div>
      <div class="mt-0.5 hidden space-y-0.5 sm:block">
        ${tasks.slice(0, 3).map(pill).join('')}
        ${tasks.length > 3 ? `<span class="block px-1 text-[11px] text-slate-400">+${tasks.length - 3} more</span>` : ''}
      </div>
      ${tasks.length ? `<div class="mt-1 flex justify-center gap-0.5 sm:hidden">${tasks.slice(0, 4).map((t) => `<span class="size-1.5 rounded-full ${isDone(t) ? 'bg-slate-300 dark:bg-slate-600' : 'bg-indigo-500'}"></span>`).join('')}</div>` : ''}
    </div>`;
}

function agenda(byDay) {
  const key = state.selected;
  const tasks = byDay.get(key) || [];
  const open = tasks.filter((t) => !isDone(t));
  const done = tasks.filter(isDone);
  const sessions = sessionsOn(key);
  const minutes = sessions.reduce((n, s) => n + (s.minutes || 0), 0);
  const reminders = store
    .all('reminders')
    .filter((r) => r.remindAt && isoToKey(r.remindAt) === key)
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  const rel = relativeDay(key);

  return `
    <aside class="card p-3 lg:sticky lg:top-20" aria-label="Agenda">
      <div class="px-2.5 pt-1 pb-2">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">${esc(formatDate(key, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white">${esc(rel)}</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">${plural(open.length, 'open task')} · ${done.length} done${minutes ? ` · ${formatDuration(minutes)} focus` : ''}</p>
      </div>
      ${taskList(open)}
      ${inlineAdd({ id: `cal-add-${key}`, placeholder: `Add a task for ${rel}…`, dueDate: key })}
      ${done.length ? `<h3 class="px-2.5 pt-3 pb-1 text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">Completed</h3>${taskList(done)}` : ''}
      ${
        reminders.length
          ? `<h3 class="px-2.5 pt-3 pb-1 text-xs font-semibold tracking-wide text-amber-600 uppercase dark:text-amber-400">Reminders</h3>
             <ul>${reminders
               .map(
                 (r) => `<li><button type="button" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50" data-action="${r.taskId ? 'task:open' : 'reminder:edit'}" data-id="${r.taskId || r.id}">
                   <span class="text-amber-500">${icon('bell', 'size-4')}</span>
                   <span class="min-w-0 flex-1 truncate ${r.firedAt ? 'text-slate-400' : ''}">${esc(r.taskId ? store.get('tasks', r.taskId)?.title || r.title : r.title)}</span>
                   <span class="text-xs text-slate-400">${new Date(r.remindAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                 </button></li>`
               )
               .join('')}</ul>`
          : ''
      }
    </aside>`;
}

registerActions({
  'cal:prev': () => {
    state.month -= 1;
    if (state.month < 0) (state.month = 11), (state.year -= 1);
    router.refresh();
  },
  'cal:next': () => {
    state.month += 1;
    if (state.month > 11) (state.month = 0), (state.year += 1);
    router.refresh();
  },
  'cal:today': () => {
    const d = new Date();
    Object.assign(state, { year: d.getFullYear(), month: d.getMonth(), selected: todayKey() });
    router.refresh();
  },
  'cal:select': (el) => {
    state.selected = el.dataset.date;
    const d = parseKey(state.selected);
    if (d.getMonth() !== state.month) Object.assign(state, { year: d.getFullYear(), month: d.getMonth() });
    router.refresh();
  },
});

export default {
  title: 'Calendar',
  render() {
    const weekStart = Number(store.settings.weekStartsOn) || 0;
    const days = monthGrid(state.year, state.month, weekStart);
    const byDay = tasksByDay();
    const title = new Date(state.year, state.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return `
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 class="page-title">${esc(title)}</h1>
        <div class="flex items-center gap-1">
          <button type="button" class="btn btn-secondary btn-icon" data-action="cal:prev" aria-label="Previous month">${icon('chevron-left', 'size-4')}</button>
          <button type="button" class="btn btn-secondary" data-action="cal:today">Today</button>
          <button type="button" class="btn btn-secondary btn-icon" data-action="cal:next" aria-label="Next month">${icon('chevron-right', 'size-4')}</button>
        </div>
      </div>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="card overflow-hidden">
          <div class="grid grid-cols-7 bg-slate-50 text-center text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:bg-slate-900 dark:text-slate-400" role="row">
            ${weekdayNames(weekStart).map((n) => `<div class="py-2" role="columnheader">${esc(n)}</div>`).join('')}
          </div>
          <div class="grid grid-cols-7 border-r border-b border-slate-100 dark:border-slate-800" role="grid" aria-label="${esc(title)}">
            ${days.map((k) => cell(k, byDay, state.month)).join('')}
          </div>
          <p class="hidden px-4 py-2 text-xs text-slate-400 sm:block">Tip: drag a task onto another day to reschedule it.</p>
        </div>
        ${agenda(byDay)}
      </div>`;
  },
  mount(root) {
    let dragId = null;
    const onDragStart = (e) => {
      const el = e.target.closest('[data-drag-id]');
      if (!el) return;
      dragId = el.dataset.dragId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    };
    const onDragOver = (e) => {
      const cellEl = e.target.closest('[data-drop]');
      if (!cellEl || !dragId) return;
      e.preventDefault();
      root.querySelectorAll('.drag-over').forEach((c) => c !== cellEl && c.classList.remove('drag-over'));
      cellEl.classList.add('drag-over');
    };
    const onDragLeave = (e) => e.target.closest?.('[data-drop]')?.classList.remove('drag-over');
    const onDrop = (e) => {
      const cellEl = e.target.closest('[data-drop]');
      if (!cellEl || !dragId) return;
      e.preventDefault();
      const task = store.get('tasks', dragId);
      const previous = { dueDate: task?.dueDate, scheduledDate: task?.scheduledDate };
      rescheduleTask(dragId, cellEl.dataset.drop);
      const id = dragId;
      dragId = null;
      toast(`Moved to ${relativeDay(cellEl.dataset.drop)}`, { actionLabel: 'Undo', onAction: () => store.update('tasks', id, previous) });
    };
    const onDragEnd = () => {
      dragId = null;
      root.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
    };
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', onDragLeave);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onDragEnd);
    return () => {
      root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('dragleave', onDragLeave);
      root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd);
    };
  },
};
