// Reminder scheduler. Checks due reminders while the app is open and fires
// missed ones as soon as it is opened again (see DEVELOPMENT.md D8).

import { store } from '../core/store.js';
import { nowISO } from '../core/utils.js';
import { toKey, parseKey } from '../core/dates.js';
import { nextOccurrence } from '../data/actions.js';
import { notify, playChime } from './notify.js';
import { toast } from '../ui/toast.js';
import { openTaskEditor } from '../ui/components/taskEditor.js';

const CHECK_EVERY_MS = 15000;

/** Next future ISO time for a repeating reminder, keeping the clock time. */
function nextRemindAt(iso, repeat) {
  const original = new Date(iso);
  let key = toKey(original);
  const now = Date.now();
  let next;
  do {
    key = nextOccurrence(key, repeat);
    if (!key) return null;
    next = parseKey(key);
    next.setHours(original.getHours(), original.getMinutes(), 0, 0);
  } while (next.getTime() <= now);
  return next.toISOString();
}

function fire(reminder) {
  const task = reminder.taskId ? store.get('tasks', reminder.taskId) : null;
  const title = task ? task.title : reminder.title;
  playChime();
  notify('Reminder', { body: title, tag: `lifeos-reminder-${reminder.id}`, force: true });
  toast(title, {
    type: 'reminder',
    duration: 0,
    actionLabel: task ? 'Open task' : '',
    onAction: task ? () => openTaskEditor(task.id) : null,
  });

  if (reminder.repeat && reminder.repeat !== 'none') {
    const next = nextRemindAt(reminder.remindAt, reminder.repeat);
    store.update('reminders', reminder.id, next ? { remindAt: next, firedAt: null } : { firedAt: nowISO() });
  } else {
    store.update('reminders', reminder.id, { firedAt: nowISO() });
  }
}

export function checkReminders() {
  const now = nowISO();
  store
    .all('reminders')
    .filter((r) => !r.firedAt && r.remindAt && r.remindAt <= now)
    .filter((r) => !r.taskId || store.get('tasks', r.taskId)?.status !== 'done')
    .forEach(fire);
}

export function initReminders() {
  setTimeout(checkReminders, 2000);
  setInterval(checkReminders, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkReminders());
}
