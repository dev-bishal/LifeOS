// "Plan my day": pick which tasks to work on today.

import { store } from '../../core/store.js';
import { esc } from '../../core/utils.js';
import { todayKey, addDays, relativeDay, formatDuration } from '../../core/dates.js';
import { priorityOf, colorHex } from '../../data/models.js';
import { openTasks, sortTasks, isOverdue, activeGoals, nextTaskOfGoal, inboxTasks, taskDate } from '../../data/selectors.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { icon } from '../icons.js';

function buildSections() {
  const today = todayKey();
  const seen = new Set();
  const take = (list) => list.filter((t) => !seen.has(t.id) && seen.add(t.id));
  const open = openTasks();

  return [
    { title: 'Overdue', tone: 'text-rose-600 dark:text-rose-400', tasks: take(sortTasks(open.filter((t) => isOverdue(t, today)))) },
    {
      title: 'Due or planned today',
      tone: 'text-indigo-600 dark:text-indigo-400',
      tasks: take(sortTasks(open.filter((t) => t.dueDate === today || (t.scheduledDate && t.scheduledDate <= today)))),
    },
    {
      title: 'Next steps for your goals',
      tone: 'text-emerald-600 dark:text-emerald-400',
      tasks: take(activeGoals().map((g) => nextTaskOfGoal(g.id)).filter(Boolean)),
    },
    {
      title: 'Coming up this week',
      tone: 'text-slate-600 dark:text-slate-300',
      tasks: take(sortTasks(open.filter((t) => taskDate(t) && taskDate(t) > today && taskDate(t) <= addDays(today, 7)))),
    },
    { title: 'High priority', tone: 'text-rose-600 dark:text-rose-400', tasks: take(sortTasks(open.filter((t) => t.priority === 'high'))).slice(0, 8) },
    { title: 'From your inbox', tone: 'text-slate-600 dark:text-slate-300', tasks: take(inboxTasks()).slice(0, 8) },
  ].filter((s) => s.tasks.length);
}

function row(task, today) {
  const dueToday = task.dueDate && task.dueDate <= today;
  const checked = dueToday || (task.scheduledDate && task.scheduledDate <= today);
  const p = priorityOf(task.priority);
  const goal = task.goalId ? store.get('goals', task.goalId) : null;
  const meta = [
    task.dueDate ? `Due ${relativeDay(task.dueDate)}` : '',
    task.estimate ? `est. ${task.estimate} pomodoro${task.estimate === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `
    <li>
      <label class="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <input type="checkbox" class="mt-0.5 size-4 rounded accent-indigo-600" data-id="${task.id}" data-estimate="${Number(task.estimate) || 0}"
          ${checked ? 'checked' : ''} ${dueToday ? 'disabled title="Due today — change the due date to unplan"' : ''} />
        <span class="min-w-0 flex-1">
          <span class="block text-sm text-slate-800 dark:text-slate-100">${esc(task.title)}</span>
          <span class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            ${task.priority !== 'none' ? `<span class="${p.text} inline-flex items-center gap-0.5">${icon('flag', 'size-3')}${p.label}</span>` : ''}
            ${goal ? `<span class="inline-flex items-center gap-1"><span class="size-1.5 rounded-full" style="background:${colorHex(goal.color)}"></span>${esc(goal.title)}</span>` : ''}
            ${meta.map(esc).join(' · ')}
          </span>
        </span>
      </label>
    </li>`;
}

export function openPlanDay() {
  const today = todayKey();
  const sections = buildSections();
  const focusMinutes = Number(store.settings.focusMinutes) || 25;

  const body = sections.length
    ? `
      <p class="mb-4 text-sm text-slate-500 dark:text-slate-400">Pick what you will work on today. Be realistic — 3 to 5 meaningful tasks beat a list of 20.</p>
      <div class="space-y-5">
        ${sections
          .map(
            (s) => `
          <section>
            <h3 class="mb-1 px-2 text-xs font-semibold tracking-wide uppercase ${s.tone}">${s.title}</h3>
            <ul>${s.tasks.map((t) => row(t, today)).join('')}</ul>
          </section>`
          )
          .join('')}
      </div>`
    : `<p class="py-8 text-center text-sm text-slate-500">You have no open tasks. Add some tasks first, then plan your day.</p>`;

  openModal({
    title: 'Plan my day',
    size: 'lg',
    body,
    footer: `
      <p class="mr-auto text-xs text-slate-500 dark:text-slate-400" data-summary></p>
      <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
      <button type="button" class="btn btn-primary" data-save>${icon('star', 'size-4')} Save plan</button>`,
    onMount(el, api) {
      const boxes = [...el.querySelectorAll('input[type="checkbox"][data-id]')];
      const summary = el.querySelector('[data-summary]');
      const update = () => {
        const chosen = boxes.filter((b) => b.checked);
        const pomodoros = chosen.reduce((n, b) => n + Number(b.dataset.estimate), 0);
        summary.textContent = `${chosen.length} task${chosen.length === 1 ? '' : 's'}${pomodoros ? ` · ~${pomodoros} pomodoros (${formatDuration(pomodoros * focusMinutes)})` : ''}`;
      };
      el.addEventListener('change', update);
      update();

      el.querySelector('[data-save]').addEventListener('click', () => {
        let added = 0;
        let removed = 0;
        boxes.forEach((b) => {
          if (b.disabled) return;
          const task = store.get('tasks', b.dataset.id);
          if (!task) return;
          const planned = task.scheduledDate && task.scheduledDate <= today;
          if (b.checked && !planned) {
            store.update('tasks', task.id, { scheduledDate: today });
            added++;
          } else if (!b.checked && planned) {
            store.update('tasks', task.id, { scheduledDate: null });
            removed++;
          }
        });
        api.close();
        if (added || removed) toast(`Plan updated${added ? ` · ${added} added` : ''}${removed ? ` · ${removed} removed` : ''}`, { type: 'success' });
      });
    },
  });
}
