// Actions available on every screen (task rows, quick add, editors, search…).

import { store } from '../core/store.js';
import { router } from '../core/router.js';
import { todayKey } from '../core/dates.js';
import { toggleTask, toggleToday, createTask, toggleSubtask } from '../data/actions.js';
import { timer } from '../services/timer.js';
import { registerActions } from './actions.js';
import { toast } from './toast.js';
import { openTaskEditor } from './components/taskEditor.js';
import { openQuickAdd, fieldsFromText } from './components/quickAdd.js';
import { openGoalEditor, openActivityEditor } from './components/goalEditor.js';
import { openReminderEditor } from './components/reminderEditor.js';
import { openSearch } from './components/search.js';
import { openPlanDay } from './components/planDay.js';
import { openFocusMode } from './components/focusOverlay.js';

/** Read defaults such as data-goal-id / data-activity-id / data-due-date from an element. */
function defaultsFrom(el) {
  const d = el.dataset;
  return {
    goalId: d.goalId || null,
    activityId: d.activityId || null,
    dueDate: d.dueDate || null,
    scheduledDate: d.today ? todayKey() : d.scheduledDate || null,
  };
}

function completeWithFeedback(id, row) {
  const task = store.get('tasks', id);
  if (!task) return;
  const finishing = task.status !== 'done';
  if (finishing && row) {
    row.classList.add('completing');
    row.querySelector('[role="checkbox"]')?.setAttribute('aria-checked', 'true');
  }
  setTimeout(
    () => {
      const res = toggleTask(id);
      if (res?.completed) {
        const msg = res.next ? 'Completed — next occurrence scheduled' : 'Task completed';
        toast(msg, { type: 'success', actionLabel: 'Undo', onAction: res.undo });
      }
    },
    finishing ? 220 : 0
  );
}

registerActions({
  'task:toggle': (el) => completeWithFeedback(el.dataset.id, el.closest('.task-row')),
  'task:open': (el) => openTaskEditor(el.dataset.id),
  'task:new': (el) => openTaskEditor(null, defaultsFrom(el)),
  'task:today': (el) => {
    const planned = toggleToday(el.dataset.id);
    toast(planned ? 'Planned for today' : 'Removed from today', { duration: 1800 });
  },
  'task:focus': (el) => {
    timer.startForTask(el.dataset.id);
    router.navigate('/focus');
  },
  'task:quick': (form) => {
    const input = form.elements.title;
    const text = input.value.trim();
    if (!text) return;
    const { fields } = fieldsFromText(text, defaultsFrom(form));
    const task = createTask(fields);
    input.value = '';
    toast(`Added "${task.title}"`, { type: 'success', duration: 2500, actionLabel: 'Edit', onAction: () => openTaskEditor(task.id) });
  },
  'subtask:toggle': (el) => {
    const res = toggleSubtask(el.dataset.id);
    if (res?.allDone) {
      toast('All subtasks done!', { type: 'success', actionLabel: 'Complete task', onAction: () => completeWithFeedback(res.taskId) });
    }
  },
  'quick-add': (el) => openQuickAdd(defaultsFrom(el)),
  'goal:new': () => openGoalEditor(),
  'goal:edit': (el) => openGoalEditor(el.dataset.id),
  'activity:new': (el) => openActivityEditor(null, { goalId: el.dataset.goalId }),
  'activity:edit': (el) => openActivityEditor(el.dataset.id),
  'reminder:new': () => openReminderEditor(),
  'reminder:edit': (el) => openReminderEditor(el.dataset.id),
  'search:open': () => openSearch(),
  'plan:open': () => openPlanDay(),
  'focus:mode': () => openFocusMode(),
  nav: (el) => router.navigate(el.dataset.to),
});
