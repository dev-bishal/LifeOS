// Tasks — every task, with views (Today / Upcoming / All / Completed),
// filters and grouping.

import { store } from '../core/store.js';
import { router } from '../core/router.js';
import { esc, groupBy } from '../core/utils.js';
import { todayKey, addDays, relativeDay, formatDate, isoToKey } from '../core/dates.js';
import { PRIORITIES, colorHex } from '../data/models.js';
import { todayView, upcomingTasks, openTasks, sortTasks, isDone, taskDate, goalsByStatus } from '../data/selectors.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { taskList, inlineAdd } from '../ui/components/taskItem.js';
import { pageHeader, tabs, emptyState } from '../ui/components/common.js';

const state = { tab: 'today', q: '', goal: '', priority: '', group: 'date', limit: 50 };

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'all', label: 'All open' },
  { id: 'completed', label: 'Completed' },
];

function applyFilters(list) {
  const q = state.q.trim().toLowerCase();
  return list.filter((t) => {
    if (state.goal === 'inbox' ? t.goalId : state.goal && t.goalId !== state.goal) return false;
    if (state.priority && t.priority !== state.priority) return false;
    if (q && !`${t.title} ${t.notes || ''} ${(t.tags || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function section(title, tasks, { tone = 'text-slate-500 dark:text-slate-400', dot = '' } = {}) {
  if (!tasks.length) return '';
  return `
    <section class="mt-2 first:mt-0">
      <h3 class="flex items-center gap-2 px-2.5 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase ${tone}">
        ${dot}${esc(title)} <span class="font-medium text-slate-400 tabular">${tasks.length}</span>
      </h3>
      ${taskList(tasks)}
    </section>`;
}

function dateBucket(t, today) {
  const d = taskDate(t);
  if (!d) return 'No date';
  if (t.dueDate && t.dueDate < today) return 'Overdue';
  if (d <= today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  if (d <= addDays(today, 7)) return 'Next 7 days';
  return 'Later';
}

function renderGroups(list) {
  const today = todayKey();
  if (state.group === 'goal') {
    const byGoal = groupBy(list, (t) => t.goalId || '');
    const goals = [...goalsByStatus('active'), ...goalsByStatus('paused'), ...goalsByStatus('completed'), ...goalsByStatus('archived')];
    return (
      goals
        .filter((g) => byGoal.has(g.id))
        .map((g) => section(g.title, byGoal.get(g.id), { dot: `<span class="size-2 rounded-full" style="background:${colorHex(g.color)}"></span>` }))
        .join('') + section('Inbox', byGoal.get('') || [])
    );
  }
  if (state.group === 'priority') {
    const byP = groupBy(list, (t) => t.priority || 'none');
    return PRIORITIES.map((p) => section(`${p.label} priority`, byP.get(p.id) || [], { tone: p.text })).join('');
  }
  if (state.group === 'date') {
    const order = ['Overdue', 'Today', 'Tomorrow', 'Next 7 days', 'Later', 'No date'];
    const byDate = groupBy(list, (t) => dateBucket(t, today));
    const tones = { Overdue: 'text-rose-600 dark:text-rose-400', Today: 'text-indigo-600 dark:text-indigo-400' };
    return order.map((k) => section(k, byDate.get(k) || [], { tone: tones[k] })).join('');
  }
  return taskList(list);
}

function body() {
  const today = todayKey();
  if (state.tab === 'today') {
    const tv = todayView();
    const overdue = applyFilters(tv.overdue);
    const planned = applyFilters(tv.planned);
    const done = applyFilters(tv.completed);
    if (!overdue.length && !planned.length && !done.length) {
      return emptyState({
        iconName: 'star',
        title: 'Nothing planned for today',
        text: 'Plan your day from your goals, deadlines and inbox.',
        action: `<button type="button" class="btn btn-primary" data-action="plan:open">${icon('star', 'size-4')} Plan my day</button>`,
      });
    }
    return (
      section('Overdue', overdue, { tone: 'text-rose-600 dark:text-rose-400' }) +
      section('Today', planned, { tone: 'text-indigo-600 dark:text-indigo-400' }) +
      section('Completed today', done, { tone: 'text-emerald-600 dark:text-emerald-400' })
    );
  }
  if (state.tab === 'upcoming') {
    const list = applyFilters(upcomingTasks());
    if (!list.length) return emptyState({ iconName: 'calendar', title: 'Nothing scheduled ahead', text: 'Tasks with a future due or planned date show up here.' });
    const byDay = groupBy(list, (t) => taskDate(t));
    return [...byDay.entries()]
      .map(([key, tasks]) => {
        const rel = relativeDay(key);
        const label = rel === formatDate(key) ? formatDate(key, { weekday: 'short', month: 'short', day: 'numeric' }) : `${rel} · ${formatDate(key)}`;
        return section(label, tasks);
      })
      .join('');
  }
  if (state.tab === 'completed') {
    const list = applyFilters(store.all('tasks').filter(isDone)).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    if (!list.length) return emptyState({ iconName: 'check', title: 'No completed tasks yet', text: 'Finished tasks are kept here as a record of your progress.' });
    const shown = list.slice(0, state.limit);
    const byDay = groupBy(shown, (t) => isoToKey(t.completedAt) || today);
    return (
      [...byDay.entries()].map(([key, tasks]) => section(relativeDay(key), tasks)).join('') +
      (list.length > shown.length
        ? `<div class="p-3 text-center"><button type="button" class="btn btn-secondary btn-sm" data-action="tasks:more">Show more (${list.length - shown.length})</button></div>`
        : '')
    );
  }
  const list = applyFilters(sortTasks(openTasks()));
  if (!list.length) return emptyState({ iconName: 'tasks', title: 'No open tasks', text: 'Add a task above or press N anywhere.' });
  return renderGroups(list);
}

registerActions({
  'tasks:tab': (el) => {
    state.tab = el.dataset.value;
    state.limit = 50;
    router.refresh();
  },
  'tasks:q': (el) => {
    state.q = el.value;
    router.refresh();
  },
  'tasks:filter': (el) => {
    state[el.name] = el.value;
    router.refresh();
  },
  'tasks:clear': () => {
    Object.assign(state, { q: '', goal: '', priority: '' });
    router.refresh();
  },
  'tasks:more': () => {
    state.limit += 100;
    router.refresh();
  },
});

export default {
  title: 'Tasks',
  render(params) {
    const tab = params.query.get('tab');
    if (tab && TABS.some((t) => t.id === tab)) state.tab = tab;
    const tv = todayView();
    const counts = {
      today: tv.overdue.length + tv.planned.length,
      upcoming: upcomingTasks().length,
      all: openTasks().length,
    };
    const goals = [...goalsByStatus('active'), ...goalsByStatus('paused')];
    const filtered = state.q || state.goal || state.priority;

    return `
      ${pageHeader({
        title: 'Tasks',
        subtitle: `${counts.all} open · ${counts.today} for today`,
        actions: `<button type="button" class="btn btn-primary" data-action="task:new" ${state.tab === 'today' ? 'data-today="1"' : ''}>${icon('plus', 'size-4')} New task</button>`,
      })}
      <div class="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        ${tabs(TABS.map((t) => ({ ...t, count: counts[t.id] })), state.tab, 'tasks:tab', 'Task views')}
        <div class="flex flex-wrap items-center gap-2">
          <div class="relative min-w-40 flex-1 sm:flex-none">
            <span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400">${icon('search', 'size-4')}</span>
            <label for="tasks-q" class="sr-only">Filter tasks</label>
            <input id="tasks-q" type="search" class="input py-1.5 pl-8 sm:w-48" placeholder="Filter…" value="${esc(state.q)}" data-input="tasks:q" autocomplete="off" />
          </div>
          <label class="sr-only" for="tasks-goal">Goal</label>
          <select id="tasks-goal" name="goal" class="input w-auto py-1.5" data-change="tasks:filter">
            <option value="">All goals</option>
            <option value="inbox" ${state.goal === 'inbox' ? 'selected' : ''}>Inbox only</option>
            ${goals.map((g) => `<option value="${g.id}" ${state.goal === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
          </select>
          <label class="sr-only" for="tasks-priority">Priority</label>
          <select id="tasks-priority" name="priority" class="input w-auto py-1.5" data-change="tasks:filter">
            <option value="">Any priority</option>
            ${PRIORITIES.map((p) => `<option value="${p.id}" ${state.priority === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
          ${
            state.tab === 'all'
              ? `<label class="sr-only" for="tasks-group">Group by</label>
                 <select id="tasks-group" name="group" class="input w-auto py-1.5" data-change="tasks:filter">
                   ${[['date', 'Group: Date'], ['goal', 'Group: Goal'], ['priority', 'Group: Priority'], ['none', 'No grouping']]
                     .map(([v, l]) => `<option value="${v}" ${state.group === v ? 'selected' : ''}>${l}</option>`)
                     .join('')}
                 </select>`
              : ''
          }
          ${filtered ? `<button type="button" class="btn-ghost px-2 py-1.5 text-xs" data-action="tasks:clear">${icon('x', 'size-3.5')} Clear</button>` : ''}
        </div>
      </div>
      <div class="card p-2 sm:p-3">
        ${state.tab !== 'completed' ? inlineAdd({ id: 'tasks-add', placeholder: state.tab === 'today' ? 'Add a task for today…' : 'Add a task… (e.g. "Email Sam fri 10am !high")', today: state.tab === 'today', goalId: state.goal && state.goal !== 'inbox' ? state.goal : '' }) : ''}
        ${body()}
      </div>`;
  },
};

