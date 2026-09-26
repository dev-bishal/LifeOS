// Focus — Pomodoro timer, task selection and today's sessions.

import { store } from '../core/store.js';
import { bus } from '../core/events.js';
import { esc } from '../core/utils.js';
import { todayKey, formatDuration } from '../core/dates.js';
import { colorHex } from '../data/models.js';
import { todayView, openTasks, sortTasks, sessionsOn, focusMinutesOn, pomodorosOn, subtasksOf, pomodorosOfTask } from '../data/selectors.js';
import { timer, MODES } from '../services/timer.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { progressBar } from '../ui/components/common.js';

const SIZE = 260;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function taskOptions(selected) {
  const tv = todayView();
  const today = [...tv.overdue, ...tv.planned];
  const todayIds = new Set(today.map((t) => t.id));
  const others = sortTasks(openTasks().filter((t) => !todayIds.has(t.id))).slice(0, 80);
  const opt = (t) => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.title)}</option>`;
  const current = selected && !todayIds.has(selected) && !others.some((t) => t.id === selected) ? store.get('tasks', selected) : null;
  return `
    <option value="">No specific task</option>
    ${today.length ? `<optgroup label="Today">${today.map(opt).join('')}</optgroup>` : ''}
    ${others.length ? `<optgroup label="Other open tasks">${others.map(opt).join('')}</optgroup>` : ''}
    ${current ? `<optgroup label="Selected">${opt(current)}</optgroup>` : ''}`;
}

function currentTask(t) {
  const task = t.taskId ? store.get('tasks', t.taskId) : null;
  if (!task) {
    return `<p class="text-sm text-slate-500 dark:text-slate-400">Pick a task so your focus time is tracked against it and its goal.</p>`;
  }
  const goal = task.goalId ? store.get('goals', task.goalId) : null;
  const subs = subtasksOf(task.id);
  const done = task.status === 'done';
  return `
    <div class="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
      <div class="flex items-start gap-3">
        <button type="button" class="task-check mt-0.5 ${done ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-400 dark:border-slate-600'}" role="checkbox" aria-checked="${done}" aria-label="Complete ${esc(task.title)}" data-action="task:toggle" data-id="${task.id}">${icon('check', 'size-3', { strokeWidth: 3.5 })}</button>
        <div class="min-w-0 flex-1">
          <button type="button" class="text-left font-medium text-slate-900 hover:underline dark:text-white ${done ? 'line-through opacity-60' : ''}" data-action="task:open" data-id="${task.id}">${esc(task.title)}</button>
          <p class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            ${goal ? `<span class="inline-flex items-center gap-1"><span class="size-1.5 rounded-full" style="background:${colorHex(goal.color)}"></span>${esc(goal.title)}</span>` : ''}
            <span>${pomodorosOfTask(task.id)}${task.estimate ? `/${task.estimate}` : ''} pomodoros</span>
          </p>
        </div>
      </div>
      ${
        subs.length
          ? `<ul class="mt-3 space-y-0.5 border-t border-slate-200 pt-2 dark:border-slate-700">
              ${subs
                .map(
                  (s) => `
                <li>
                  <button type="button" class="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-sm hover:bg-white dark:hover:bg-slate-800" data-action="subtask:toggle" data-id="${s.id}" role="checkbox" aria-checked="${s.done}">
                    <span class="task-check size-4 ${s.done ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-400 dark:border-slate-600'}" aria-hidden="true">${icon('check', 'size-2.5', { strokeWidth: 4 })}</span>
                    <span class="${s.done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}">${esc(s.title)}</span>
                  </button>
                </li>`
                )
                .join('')}
            </ul>`
          : ''
      }
    </div>`;
}

function sessionsList(key) {
  const list = sessionsOn(key).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  if (!list.length) return `<p class="text-sm text-slate-500 dark:text-slate-400">No sessions yet today.</p>`;
  const time = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
  return `
    <ul class="space-y-1">
      ${list
        .map((s) => {
          const task = s.taskId ? store.get('tasks', s.taskId) : null;
          return `
          <li class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
            <span class="${s.completed ? 'text-rose-500' : 'text-slate-400'}" title="${s.completed ? 'Completed pomodoro' : 'Interrupted session'}">${icon(s.completed ? 'timer' : 'pause_circle', 'size-4')}</span>
            <span class="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">${task ? esc(task.title) : 'Focus session'}</span>
            <span class="text-xs text-slate-400 tabular">${time(s.startedAt)} · ${formatDuration(s.minutes)}</span>
          </li>`;
        })
        .join('')}
    </ul>`;
}

registerActions({
  'focus:toggle': () => timer.toggle(),
  'focus:reset': () => timer.reset(),
  'focus:skip': () => timer.skip(),
  'focus:set-mode': (el) => timer.setMode(el.dataset.value),
  'focus:task': (el) => timer.setTask(el.value),
});

export default {
  title: 'Focus',
  render() {
    const t = timer.state;
    const s = store.settings;
    const today = todayKey();
    const minutes = focusMinutesOn(today);
    const goal = Number(s.dailyFocusGoalMinutes) || 120;
    const every = Math.max(1, Number(s.longBreakEvery) || 4);
    const inCycle = t.cycle % every;
    const running = t.status === 'running';
    const color = t.mode === 'focus' ? '#6366f1' : '#10b981';

    return `
      <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="page-title">Focus</h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">One task. One timer. No distractions.</p>
        </div>
        <button type="button" class="btn btn-secondary" data-action="focus:mode">${icon('maximize', 'size-4')} Enter Focus Mode <kbd class="ml-1 hidden rounded bg-slate-100 px-1.5 text-[11px] sm:inline dark:bg-slate-700">M</kbd></button>
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section class="card p-5 sm:p-8" aria-label="Pomodoro timer">
          <div class="flex justify-center">
            <div class="tabs" role="tablist" aria-label="Timer mode">
              ${Object.entries(MODES)
                .map(([id, m]) => `<button type="button" role="tab" class="tab" aria-selected="${t.mode === id}" data-action="focus:set-mode" data-value="${id}">${m.label}</button>`)
                .join('')}
            </div>
          </div>

          <div class="relative mx-auto mt-8 grid place-items-center" style="width:min(${SIZE}px,70vw);aspect-ratio:1">
            <svg viewBox="0 0 ${SIZE} ${SIZE}" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke-width="${STROKE}" class="stroke-slate-100 dark:stroke-slate-800"/>
              <circle data-focus-ring cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round"
                stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - t.progress)).toFixed(2)}" class="ring-progress"/>
            </svg>
            <div class="text-center">
              <p data-focus-clock class="text-5xl font-light tracking-tight text-slate-900 tabular sm:text-6xl dark:text-white" role="timer">${t.clock}</p>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${t.status === 'paused' ? 'Paused' : running ? (t.mode === 'focus' ? 'Focusing…' : 'Recharging…') : t.label}</p>
            </div>
          </div>

          <div class="mt-8 flex items-center justify-center gap-4">
            <button type="button" class="btn btn-secondary rounded-full p-3" data-action="focus:reset" aria-label="Stop and reset" title="Stop & reset">${icon('stop', 'size-5')}</button>
            <button type="button" class="grid size-16 place-items-center rounded-full text-white shadow-lg transition hover:scale-105 active:scale-95" style="background:${color}" data-action="focus:toggle" aria-label="${running ? 'Pause' : t.status === 'paused' ? 'Resume' : 'Start'}">
              ${icon(running ? 'pause' : 'play', 'size-7', { filled: true, strokeWidth: 0 })}
            </button>
            <button type="button" class="btn btn-secondary rounded-full p-3" data-action="focus:skip" aria-label="Skip to next phase" title="Skip">${icon('skip', 'size-5')}</button>
          </div>

          <div class="mt-5 flex items-center justify-center gap-1.5" aria-label="${inCycle} of ${every} sessions before a long break">
            ${Array.from({ length: every }, (_, i) => `<span class="size-2 rounded-full ${i < inCycle ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}"></span>`).join('')}
            <span class="ml-2 text-xs text-slate-400">long break after ${every}</span>
          </div>

          <div class="mx-auto mt-8 max-w-xl">
            <label for="focus-task" class="label">Working on</label>
            <select id="focus-task" class="input" data-change="focus:task">${taskOptions(t.taskId)}</select>
            <div class="mt-3">${currentTask(t)}</div>
          </div>
        </section>

        <div class="space-y-4">
          <section class="card p-5">
            <h2 class="section-title">Today</h2>
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div><p class="text-xs text-slate-500 dark:text-slate-400">Focus time</p><p class="text-2xl font-bold text-slate-900 tabular dark:text-white">${formatDuration(minutes)}</p></div>
              <div><p class="text-xs text-slate-500 dark:text-slate-400">Pomodoros</p><p class="text-2xl font-bold text-slate-900 tabular dark:text-white">${pomodorosOn(today)}</p></div>
            </div>
            <div class="mt-3">${progressBar((minutes / goal) * 100, { color: '#6366f1', label: 'Daily focus goal' })}</div>
            <p class="mt-1 text-xs text-slate-400">${minutes >= goal ? 'Daily focus goal reached!' : `${formatDuration(goal - minutes)} to your daily goal`}</p>
          </section>
          <section class="card p-5">
            <h2 class="section-title mb-2">Sessions</h2>
            ${sessionsList(today)}
          </section>
          <section class="card p-5 text-sm text-slate-500 dark:text-slate-400">
            <p>${s.focusMinutes} min focus · ${s.shortBreakMinutes} min short break · ${s.longBreakMinutes} min long break</p>
            <a href="#/settings" class="mt-2 inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400">${icon('settings', 'size-3.5')} Timer settings</a>
          </section>
        </div>
      </div>`;
  },
  mount(root) {
    return bus.on('timer:tick', (t) => {
      const clock = root.querySelector('[data-focus-clock]');
      const ring = root.querySelector('[data-focus-ring]');
      if (clock) clock.textContent = t.clock;
      if (ring) ring.setAttribute('stroke-dashoffset', (C * (1 - t.progress)).toFixed(2));
    });
  },
};
