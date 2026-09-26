// Inbox — capture first, organise later. Holds open tasks that have no goal.

import { store } from '../core/store.js';
import { esc } from '../core/utils.js';
import { todayKey } from '../core/dates.js';
import { inboxTasks, goalsByStatus } from '../data/selectors.js';
import { updateTask, toggleToday, deleteTask } from '../data/actions.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { taskItem } from '../ui/components/taskItem.js';
import { pageHeader, emptyState } from '../ui/components/common.js';

function processRow(task, goals) {
  return `
    <div class="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800/70">
      <ul>${taskItem(task, { showGoal: false })}</ul>
      <div class="flex flex-wrap items-center gap-2 pl-10 text-xs">
        <label class="sr-only" for="assign-${task.id}">Move to goal</label>
        <select id="assign-${task.id}" class="input w-auto max-w-56 py-1 text-xs" data-change="inbox:assign" data-id="${task.id}">
          <option value="">Move to goal…</option>
          ${goals.map((g) => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-secondary btn-sm" data-action="inbox:today" data-id="${task.id}">${icon('star', 'size-3.5')} Do today</button>
        <button type="button" class="btn-ghost px-2 py-1.5 text-xs text-rose-600 dark:text-rose-400" data-action="inbox:delete" data-id="${task.id}">${icon('trash', 'size-3.5')} Delete</button>
      </div>
    </div>`;
}

registerActions({
  'inbox:assign': (el) => {
    if (!el.value) return;
    const goal = store.get('goals', el.value);
    updateTask(el.dataset.id, { goalId: el.value });
    toast(`Moved to "${goal?.title}"`, { type: 'success', actionLabel: 'Undo', onAction: () => updateTask(el.dataset.id, { goalId: null }) });
  },
  'inbox:today': (el) => {
    const task = store.get('tasks', el.dataset.id);
    if (task && !(task.scheduledDate && task.scheduledDate <= todayKey())) toggleToday(el.dataset.id);
    toast('Planned for today', { duration: 1800 });
  },
  'inbox:delete': (el) => {
    const undo = deleteTask(el.dataset.id);
    toast('Task deleted', { actionLabel: 'Undo', onAction: undo });
  },
});

export default {
  title: 'Inbox',
  render() {
    const tasks = inboxTasks();
    const goals = goalsByStatus('active');
    return `
      ${pageHeader({
        title: 'Inbox',
        subtitle: 'Capture everything here, then process it: move it to a goal, plan it, or delete it.',
      })}
      <form data-submit="task:quick" class="card mb-4 flex items-center gap-3 p-2 pl-4">
        <span class="text-indigo-500">${icon('inbox', 'size-5')}</span>
        <label for="inbox-capture" class="sr-only">Capture a thought or task</label>
        <input id="inbox-capture" name="title" autocomplete="off" enterkeyhint="done" placeholder="Capture a thought, idea or task…"
          class="min-w-0 flex-1 bg-transparent py-2 text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" />
        <button type="submit" class="btn btn-primary">Capture</button>
      </form>
      <div class="card p-3">
        ${
          tasks.length
            ? `<p class="px-2.5 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">${tasks.length} to process</p>
               <div class="space-y-2">${tasks.map((t) => processRow(t, goals)).join('')}</div>`
            : emptyState({ iconName: 'inbox', title: 'Inbox zero', text: 'Everything is organised. Capture new ideas above whenever they pop up.' })
        }
      </div>`;
  },
};
