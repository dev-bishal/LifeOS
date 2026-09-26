// Dashboard — "What should I do today?"

import { store } from '../core/store.js';
import { bus } from '../core/events.js';
import { esc, plural } from '../core/utils.js';
import { todayKey, greeting, formatLongDate, formatDuration, formatDateTime } from '../core/dates.js';
import { colorHex } from '../data/models.js';
import {
  todayView, focusMinutesOn, pomodorosOn, streak, activeGoals, goalProgress, nextTaskOfGoal,
  upcomingReminders, reviewFor, inboxTasks,
} from '../data/selectors.js';
import { loadSampleData } from '../data/sample.js';
import { currentUser } from '../core/session.js';
import { timer } from '../services/timer.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { taskList, inlineAdd } from '../ui/components/taskItem.js';
import { progressBar, progressRing, statTile, emptyState } from '../ui/components/common.js';

let completedOpen = false;

function subtitle(tv) {
  const left = tv.overdue.length + tv.planned.length;
  if (!tv.total) return 'Nothing planned yet — pick a few meaningful tasks for today.';
  if (!left) return 'Everything planned for today is done. Great work!';
  return `${plural(left, 'task')} left today${tv.overdue.length ? ` · <span class="text-rose-600 dark:text-rose-400">${tv.overdue.length} overdue</span>` : ''}`;
}

function welcome() {
  return `
    <section class="card overflow-hidden">
      <div class="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white sm:p-8">
        <p class="text-sm font-medium text-indigo-100">Welcome to LifeOS</p>
        <h2 class="mt-1 text-2xl font-bold">Turn big goals into today's actions.</h2>
        <p class="mt-2 max-w-xl text-sm text-indigo-100">Goal → Activity → Task → Subtask → Focus → Review. Start with one goal that matters, break it down, and let the dashboard tell you what to do next.</p>
        <div class="mt-5 flex flex-wrap gap-2">
          <button type="button" class="btn bg-white text-indigo-700 hover:bg-indigo-50" data-action="goal:new">${icon('target', 'size-4')} Create your first goal</button>
          <button type="button" class="btn bg-white/15 text-white hover:bg-white/25" data-action="quick-add">${icon('plus', 'size-4')} Add a task</button>
          <button type="button" class="btn bg-white/15 text-white hover:bg-white/25" data-action="dash:sample">${icon('sparkle', 'size-4')} Load example data</button>
        </div>
      </div>
      <ol class="grid gap-px bg-slate-100 text-sm sm:grid-cols-3 dark:bg-slate-800">
        ${[
          ['target', 'Set a goal', 'Describe the outcome and why it matters.'],
          ['layers', 'Break it down', 'Add activities, tasks and subtasks.'],
          ['timer', 'Execute & focus', 'Plan your day and work in focused sessions.'],
        ]
          .map(
            ([i, t, d], n) => `
          <li class="flex gap-3 bg-white p-4 dark:bg-slate-900">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">${icon(i, 'size-4')}</span>
            <div><p class="font-medium text-slate-900 dark:text-white">${n + 1}. ${t}</p><p class="text-slate-500 dark:text-slate-400">${d}</p></div>
          </li>`
          )
          .join('')}
      </ol>
    </section>`;
}

function kpis(tv, today) {
  const s = store.settings;
  const focusMin = focusMinutesOn(today);
  const goal = Number(s.dailyFocusGoalMinutes) || 120;
  const days = streak();
  return `
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      ${statTile({
        label: 'Tasks done',
        value: `${tv.completed.length}<span class="text-sm font-medium text-slate-400">/${tv.total}</span>`,
        sub: tv.total ? `${tv.pct}% of today` : 'No tasks planned',
        extra: progressRing(tv.pct, { size: 44, stroke: 5, text: '', color: '#6366f1' }),
      })}
      <div class="card p-4">
        <div class="flex items-center gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">${icon('clock', 'size-5')}</span>
          <div class="min-w-0">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">Focus time</p>
            <p class="text-xl font-bold tracking-tight text-slate-900 tabular dark:text-white">${formatDuration(focusMin)}</p>
          </div>
        </div>
        <div class="mt-3">${progressBar((focusMin / goal) * 100, { color: '#0ea5e9', label: 'Daily focus goal' })}</div>
        <p class="mt-1 text-[11px] text-slate-400">Goal ${formatDuration(goal)}</p>
      </div>
      ${statTile({ label: 'Pomodoros', value: pomodorosOn(today), sub: 'completed today', iconName: 'timer', tone: 'rose' })}
      ${statTile({ label: 'Streak', value: plural(days, 'day'), sub: days ? 'Keep it going!' : 'Complete a task to start', iconName: 'fire', tone: 'amber' })}
    </div>`;
}

function todayCard(tv) {
  const heading = (label, n, tone = 'text-slate-500 dark:text-slate-400') =>
    `<h3 class="mt-4 mb-1 flex items-center gap-2 px-2.5 text-xs font-semibold tracking-wide uppercase ${tone}">${label}<span class="font-medium text-slate-400 tabular">${n}</span></h3>`;

  const nothing = !tv.overdue.length && !tv.planned.length;
  return `
    <section class="card p-3 sm:p-4" aria-labelledby="today-title">
      <div class="flex items-center justify-between gap-2 px-2.5 pt-1">
        <h2 id="today-title" class="section-title text-base">Today's tasks</h2>
        <button type="button" class="btn btn-secondary btn-sm" data-action="plan:open">${icon('star', 'size-3.5')} Plan my day</button>
      </div>
      ${tv.overdue.length ? heading('Overdue', tv.overdue.length, 'text-rose-600 dark:text-rose-400') + taskList(tv.overdue, { showGoal: true }) : ''}
      ${heading('Today', tv.planned.length, 'text-indigo-600 dark:text-indigo-400')}
      ${taskList(tv.planned)}
      ${
        nothing
          ? `<p class="px-2.5 py-3 text-sm text-slate-500 dark:text-slate-400">No tasks planned for today. Use <button type="button" class="font-medium text-indigo-600 hover:underline dark:text-indigo-400" data-action="plan:open">Plan my day</button> or add one below.</p>`
          : ''
      }
      ${inlineAdd({ id: 'dash-add', placeholder: 'Add a task for today…', today: true })}
      ${tv.suggestions.length ? heading('Suggested · high priority', tv.suggestions.length, 'text-amber-600 dark:text-amber-400') + taskList(tv.suggestions) : ''}
      ${
        tv.completed.length
          ? `<details class="mt-3" ${completedOpen ? 'open' : ''} data-completed>
              <summary class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold tracking-wide text-emerald-600 uppercase hover:bg-slate-50 dark:text-emerald-400 dark:hover:bg-slate-800/40">
                ${icon('check', 'size-3.5')} Completed today <span class="font-medium text-slate-400">${tv.completed.length}</span>
                <span class="chev ml-auto transition">${icon('chevron-down', 'size-4')}</span>
              </summary>
              ${taskList(tv.completed)}
            </details>`
          : ''
      }
    </section>`;
}

function focusCard(tv) {
  const t = timer.state;
  if (t.status !== 'idle') {
    const task = t.taskId ? store.get('tasks', t.taskId) : null;
    return `
      <section class="card overflow-hidden">
        <div class="bg-gradient-to-br ${t.mode === 'focus' ? 'from-indigo-600 to-violet-600' : 'from-emerald-500 to-teal-600'} p-5 text-white">
          <p class="text-xs font-semibold tracking-wide text-white/70 uppercase">${t.label}${t.status === 'paused' ? ' · paused' : ''}</p>
          <p class="mt-1 text-4xl font-light tabular" data-dash-clock>${t.clock}</p>
          <p class="mt-1 truncate text-sm text-white/80">${task ? esc(task.title) : 'No task selected'}</p>
          <div class="mt-4 flex gap-2">
            <button type="button" class="btn bg-white/15 text-white hover:bg-white/25" data-action="dash:timer-toggle">${icon(t.status === 'running' ? 'pause' : 'play', 'size-4')} ${t.status === 'running' ? 'Pause' : 'Resume'}</button>
            <button type="button" class="btn bg-white text-slate-900 hover:bg-slate-100" data-action="focus:mode">${icon('maximize', 'size-4')} Focus mode</button>
          </div>
        </div>
      </section>`;
  }
  const next = [...tv.overdue, ...tv.planned][0] || tv.suggestions[0];
  return `
    <section class="card p-5">
      <div class="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">${icon('zap', 'size-4 text-indigo-500')} Focus</div>
      ${
        next
          ? `<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">Next up</p>
             <p class="mt-0.5 font-medium text-slate-900 dark:text-white">${esc(next.title)}</p>
             <button type="button" class="btn btn-primary mt-4 w-full" data-action="task:focus" data-id="${next.id}">${icon('play', 'size-4')} Start ${store.settings.focusMinutes}-min focus</button>`
          : `<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Start a focus session to track deep work.</p>
             <a href="#/focus" class="btn btn-primary mt-4 w-full">${icon('timer', 'size-4')} Open timer</a>`
      }
    </section>`;
}

function goalsCard() {
  const goals = activeGoals().slice(0, 4);
  return `
    <section class="card p-5">
      <div class="flex items-center justify-between">
        <h2 class="section-title">Goals</h2>
        <a href="#/goals" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">View all</a>
      </div>
      ${
        goals.length
          ? `<ul class="mt-3 space-y-4">
              ${goals
                .map((g) => {
                  const p = goalProgress(g.id);
                  const next = nextTaskOfGoal(g.id);
                  return `
                  <li>
                    <a href="#/goals/${g.id}" class="group block">
                      <div class="flex items-center justify-between gap-2 text-sm">
                        <span class="flex min-w-0 items-center gap-2 font-medium text-slate-800 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                          <span class="size-2.5 shrink-0 rounded-full" style="background:${colorHex(g.color)}"></span><span class="truncate">${esc(g.title)}</span>
                        </span>
                        <span class="text-xs text-slate-500 tabular">${p.pct}%</span>
                      </div>
                      <div class="mt-1.5">${progressBar(p.pct, { color: colorHex(g.color), label: g.title })}</div>
                      ${next ? `<p class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">Next: ${esc(next.title)}</p>` : ''}
                    </a>
                  </li>`;
                })
                .join('')}
            </ul>`
          : `<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">No active goals yet.</p>
             <button type="button" class="btn btn-secondary btn-sm mt-3" data-action="goal:new">${icon('plus', 'size-3.5')} New goal</button>`
      }
    </section>`;
}

function remindersCard() {
  const list = upcomingReminders(4);
  return `
    <section class="card p-5">
      <div class="flex items-center justify-between">
        <h2 class="section-title">Reminders</h2>
        <button type="button" class="btn-ghost p-1" data-action="reminder:new" aria-label="New reminder">${icon('plus', 'size-4')}</button>
      </div>
      ${
        list.length
          ? `<ul class="mt-2 space-y-1">${list
              .map((r) => {
                const task = r.taskId ? store.get('tasks', r.taskId) : null;
                return `
                <li>
                  <button type="button" class="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" data-action="${task ? 'task:open' : 'reminder:edit'}" data-id="${task ? task.id : r.id}">
                    <span class="mt-0.5 text-amber-500">${icon('bell', 'size-4')}</span>
                    <span class="min-w-0">
                      <span class="block truncate text-sm text-slate-800 dark:text-slate-100">${esc(task ? task.title : r.title)}</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400">${esc(formatDateTime(r.remindAt))}${r.repeat && r.repeat !== 'none' ? ` · repeats` : ''}</span>
                    </span>
                  </button>
                </li>`;
              })
              .join('')}</ul>`
          : `<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">No upcoming reminders.</p>`
      }
    </section>`;
}

function reviewCard(today) {
  const done = reviewFor('daily', today);
  const evening = new Date().getHours() >= 17;
  if (done) {
    return `
      <a href="#/review" class="card flex items-center gap-3 p-4 hover:ring-slate-300 dark:hover:ring-slate-700">
        <span class="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">${icon('check', 'size-4')}</span>
        <span class="text-sm"><span class="block font-medium text-slate-900 dark:text-white">Daily review done</span><span class="text-slate-500 dark:text-slate-400">Nice reflection. See you tomorrow.</span></span>
      </a>`;
  }
  return `
    <a href="#/review" class="card flex items-center gap-3 p-4 hover:ring-slate-300 dark:hover:ring-slate-700 ${evening ? 'ring-2 ring-indigo-200 dark:ring-indigo-500/30' : ''}">
      <span class="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">${icon('review', 'size-4')}</span>
      <span class="text-sm"><span class="block font-medium text-slate-900 dark:text-white">Review your day</span><span class="text-slate-500 dark:text-slate-400">2 minutes: wins, lessons, tomorrow's focus.</span></span>
      <span class="ml-auto text-slate-400">${icon('chevron-right', 'size-4')}</span>
    </a>`;
}

function inboxCard() {
  const n = inboxTasks().length;
  if (!n) return '';
  return `
    <a href="#/inbox" class="card flex items-center gap-3 p-4 hover:ring-slate-300 dark:hover:ring-slate-700">
      <span class="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">${icon('inbox', 'size-4')}</span>
      <span class="text-sm"><span class="block font-medium text-slate-900 dark:text-white">${plural(n, 'item')} in your inbox</span><span class="text-slate-500 dark:text-slate-400">Assign them to goals or schedule them.</span></span>
      <span class="ml-auto text-slate-400">${icon('chevron-right', 'size-4')}</span>
    </a>`;
}

registerActions({
  'dash:sample': () => {
    loadSampleData();
    toast('Example data loaded — explore the goal "Get a .NET Developer Job"', { type: 'success', duration: 6000 });
  },
  'dash:timer-toggle': () => timer.toggle(),
});

export default {
  title: 'Dashboard',
  render() {
    const today = todayKey();
    const tv = todayView();
    const name = (currentUser()?.name || store.settings.name || '').trim();
    const firstRun = !store.all('tasks').length && !store.all('goals').length;

    return `
      <div class="space-y-6">
        <header class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400">${esc(formatLongDate())}</p>
            <h1 class="page-title mt-0.5">${greeting()}${name ? `, ${esc(name.split(' ')[0])}` : ''}</h1>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${subtitle(tv)}</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn btn-secondary" data-action="search:open">${icon('search', 'size-4')}<span class="hidden sm:inline">Search</span></button>
            <button type="button" class="btn btn-primary" data-action="quick-add" data-today="1">${icon('plus', 'size-4')} Quick add</button>
          </div>
        </header>

        ${firstRun ? welcome() : kpis(tv, today)}

        ${
          firstRun
            ? ''
            : `<div class="grid gap-6 lg:grid-cols-3">
                <div class="space-y-6 lg:col-span-2">${todayCard(tv)}</div>
                <div class="space-y-4">
                  ${focusCard(tv)}
                  ${goalsCard()}
                  ${remindersCard()}
                  ${reviewCard(today)}
                  ${inboxCard()}
                </div>
              </div>`
        }
        ${firstRun ? `<div class="card">${emptyState({ iconName: 'tasks', title: 'Your day is a blank page', text: 'Press <kbd>N</kbd> anywhere to quickly add a task.' })}</div>` : ''}
      </div>`;
  },
  mount(root) {
    root.querySelector('[data-completed]')?.addEventListener('toggle', (e) => (completedOpen = e.target.open));
    const off = bus.on('timer:tick', (t) => {
      const clock = root.querySelector('[data-dash-clock]');
      if (clock) clock.textContent = t.clock;
    });
    return off;
  },
};
