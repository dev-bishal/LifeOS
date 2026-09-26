// Business operations. Every mutation that involves more than one record (or a
// rule such as recurrence and cascades) lives here, never in the views.
// Destructive operations return an `undo` function used by toasts.

import { store } from '../core/store.js';
import { nowISO } from '../core/utils.js';
import { todayKey, addDays, addMonths, parseKey, diffDays, isoToKey } from '../core/dates.js';
import { newTask, newGoal, newActivity, newSubtask, newReminder, newReview, newSession } from './models.js';
import { subtasksOf, tasksOfGoal, tasksOfActivity, activitiesOf, reminderForTask } from './selectors.js';

// ---- tasks ---------------------------------------------------------------------

/** Keep goalId consistent with activityId. */
function linkFields(fields, existing = null) {
  const out = { ...fields };
  if ('activityId' in out && out.activityId) {
    const act = store.get('activities', out.activityId);
    if (act) out.goalId = act.goalId;
    else out.activityId = null;
  } else if ('goalId' in out && existing?.activityId && !('activityId' in out)) {
    const act = store.get('activities', existing.activityId);
    if (!act || act.goalId !== out.goalId) out.activityId = null;
  }
  if ('goalId' in out && !out.goalId) out.activityId = null;
  return out;
}

export function createTask(fields, { subtasks = [], reminderAt = null } = {}) {
  const data = newTask(linkFields(fields));
  data.title = String(data.title || '').trim() || 'Untitled task';
  const task = store.insert('tasks', data);
  subtasks
    .filter((s) => s.title?.trim())
    .forEach((s, i) => store.insert('subtasks', newSubtask({ taskId: task.id, title: s.title.trim(), done: !!s.done, order: i })));
  if (reminderAt) setTaskReminder(task.id, reminderAt);
  return task;
}

export function updateTask(id, patch) {
  const existing = store.get('tasks', id);
  if (!existing) return null;
  return store.update('tasks', id, linkFields(patch, existing));
}

export function nextOccurrence(key, rule) {
  switch (rule) {
    case 'daily':
      return addDays(key, 1);
    case 'weekdays': {
      let k = addDays(key, 1);
      while ([0, 6].includes(parseKey(k).getDay())) k = addDays(k, 1);
      return k;
    }
    case 'weekly':
      return addDays(key, 7);
    case 'monthly':
      return addMonths(key, 1);
    case 'yearly':
      return addMonths(key, 12);
    default:
      return null;
  }
}

function spawnNextOccurrence(task) {
  const today = todayKey();
  const base = task.dueDate || task.scheduledDate || today;
  let nextKey = nextOccurrence(base, task.recurrence);
  if (!nextKey) return { next: null, undo: () => {} };
  while (nextKey <= today) nextKey = nextOccurrence(nextKey, task.recurrence);
  const shift = diffDays(base, nextKey);
  const hasDate = task.dueDate || task.scheduledDate;

  const next = store.insert(
    'tasks',
    newTask({
      title: task.title,
      notes: task.notes,
      goalId: task.goalId,
      activityId: task.activityId,
      priority: task.priority,
      dueTime: task.dueTime,
      estimate: task.estimate,
      tags: [...(task.tags || [])],
      recurrence: task.recurrence,
      dueDate: hasDate ? (task.dueDate ? addDays(task.dueDate, shift) : null) : nextKey,
      scheduledDate: task.scheduledDate ? addDays(task.scheduledDate, shift) : null,
      order: task.order,
    })
  );
  subtasksOf(task.id).forEach((s) =>
    store.insert('subtasks', newSubtask({ taskId: next.id, title: s.title, order: s.order }))
  );

  const reminder = reminderForTask(task.id);
  const previousRemindAt = reminder?.remindAt;
  if (reminder) {
    const moved = new Date(new Date(reminder.remindAt).getTime() + shift * 86400000).toISOString();
    store.update('reminders', reminder.id, { taskId: next.id, remindAt: moved });
  }

  const undo = () => {
    if (reminder) store.update('reminders', reminder.id, { taskId: task.id, remindAt: previousRemindAt });
    subtasksOf(next.id).forEach((s) => store.remove('subtasks', s.id));
    store.remove('tasks', next.id);
  };
  return { next, undo };
}

/** Toggle done/undone. Returns { completed, next, undo }. */
export function toggleTask(id) {
  const task = store.get('tasks', id);
  if (!task) return null;
  if (task.status === 'done') {
    const completedAt = task.completedAt;
    store.update('tasks', id, { status: 'todo', completedAt: null });
    return { completed: false, next: null, undo: () => store.update('tasks', id, { status: 'done', completedAt }) };
  }
  store.update('tasks', id, { status: 'done', completedAt: nowISO() });
  const spawned = task.recurrence && task.recurrence !== 'none' ? spawnNextOccurrence(task) : null;
  return {
    completed: true,
    next: spawned?.next || null,
    undo: () => {
      spawned?.undo();
      store.update('tasks', id, { status: 'todo', completedAt: null });
    },
  };
}

export function deleteTask(id) {
  const subIds = subtasksOf(id).map((s) => s.id);
  const remIds = store.all('reminders').filter((r) => r.taskId === id).map((r) => r.id);
  store.remove('tasks', id);
  subIds.forEach((s) => store.remove('subtasks', s));
  remIds.forEach((r) => store.remove('reminders', r));
  return () => {
    store.restore('tasks', id);
    subIds.forEach((s) => store.restore('subtasks', s));
    remIds.forEach((r) => store.restore('reminders', r));
  };
}

/** Plan a task for today (or un-plan it). */
export function toggleToday(id) {
  const task = store.get('tasks', id);
  if (!task) return false;
  const today = todayKey();
  const planned = task.scheduledDate && task.scheduledDate <= today;
  store.update('tasks', id, { scheduledDate: planned ? null : today });
  return !planned;
}

export function scheduleTasks(ids, key = todayKey()) {
  ids.forEach((id) => store.update('tasks', id, { scheduledDate: key }));
}

export function rescheduleTask(id, key) {
  const task = store.get('tasks', id);
  if (!task) return;
  // Move whichever date put the task on the calendar.
  if (task.dueDate) store.update('tasks', id, { dueDate: key, ...(task.scheduledDate ? { scheduledDate: key } : {}) });
  else store.update('tasks', id, { scheduledDate: key });
}

export function setTaskReminder(taskId, remindAtISO) {
  const task = store.get('tasks', taskId);
  const existing = reminderForTask(taskId);
  if (!remindAtISO) {
    if (existing) store.remove('reminders', existing.id);
    return null;
  }
  if (existing) {
    return store.update('reminders', existing.id, { remindAt: remindAtISO, title: task?.title || existing.title, firedAt: null });
  }
  return store.insert('reminders', newReminder({ taskId, title: task?.title || 'Task reminder', remindAt: remindAtISO }));
}

// ---- subtasks ------------------------------------------------------------------

export function addSubtask(taskId, title) {
  const clean = String(title || '').trim();
  if (!clean) return null;
  const order = subtasksOf(taskId).reduce((max, s) => Math.max(max, s.order || 0), -1) + 1;
  return store.insert('subtasks', newSubtask({ taskId, title: clean, order }));
}

/** Returns { done, allDone } so the UI can offer to complete the parent task. */
export function toggleSubtask(id) {
  const sub = store.get('subtasks', id);
  if (!sub) return null;
  store.update('subtasks', id, { done: !sub.done });
  const siblings = subtasksOf(sub.taskId);
  return { done: !sub.done, allDone: siblings.length > 0 && siblings.every((s) => s.done), taskId: sub.taskId };
}

export const renameSubtask = (id, title) => store.update('subtasks', id, { title: String(title).trim() });
export const deleteSubtask = (id) => store.remove('subtasks', id);

// ---- goals & activities --------------------------------------------------------

export function createGoal(fields) {
  const data = newGoal(fields);
  data.title = String(data.title || '').trim() || 'Untitled goal';
  return store.insert('goals', data);
}

export const updateGoal = (id, patch) => store.update('goals', id, patch);

export function setGoalStatus(id, status) {
  return store.update('goals', id, { status, completedAt: status === 'completed' ? nowISO() : null });
}

/** Delete a goal: its activities are removed and its tasks move to the Inbox. */
export function deleteGoal(id) {
  const activityIds = activitiesOf(id).map((a) => a.id);
  const taskLinks = tasksOfGoal(id).map((t) => ({ id: t.id, goalId: t.goalId, activityId: t.activityId }));
  store.remove('goals', id);
  activityIds.forEach((a) => store.remove('activities', a));
  taskLinks.forEach((t) => store.update('tasks', t.id, { goalId: null, activityId: null }));
  return () => {
    store.restore('goals', id);
    activityIds.forEach((a) => store.restore('activities', a));
    taskLinks.forEach((t) => store.update('tasks', t.id, { goalId: t.goalId, activityId: t.activityId }));
  };
}

export function createActivity(fields) {
  const data = newActivity(fields);
  data.title = String(data.title || '').trim() || 'Untitled activity';
  return store.insert('activities', data);
}

/** Update an activity; moving it to another goal moves its tasks too. */
export function updateActivity(id, patch) {
  const previousGoal = store.get('activities', id)?.goalId;
  const rec = store.update('activities', id, patch);
  if (patch.goalId && patch.goalId !== previousGoal) {
    tasksOfActivity(id).forEach((t) => store.update('tasks', t.id, { goalId: patch.goalId }));
  }
  return rec;
}

/** Delete an activity: its tasks stay under the goal. */
export function deleteActivity(id) {
  const taskIds = tasksOfActivity(id).map((t) => t.id);
  store.remove('activities', id);
  taskIds.forEach((t) => store.update('tasks', t, { activityId: null }));
  return () => {
    store.restore('activities', id);
    taskIds.forEach((t) => store.update('tasks', t, { activityId: id }));
  };
}

// ---- focus sessions ------------------------------------------------------------

export function logSession({ taskId = null, startedAt, endedAt = nowISO(), minutes, completed = true }) {
  const task = taskId ? store.get('tasks', taskId) : null;
  return store.insert(
    'sessions',
    newSession({
      taskId: task ? taskId : null,
      goalId: task?.goalId || null,
      date: isoToKey(startedAt || endedAt),
      startedAt,
      endedAt,
      minutes: Math.max(1, Math.round(minutes)),
      completed,
    })
  );
}

// ---- reminders -----------------------------------------------------------------

export function createReminder(fields) {
  return store.insert('reminders', newReminder(fields));
}

export const updateReminder = (id, patch) => store.update('reminders', id, patch);
export const deleteReminder = (id) => store.remove('reminders', id);

// ---- reviews -------------------------------------------------------------------

export function saveReview(type, period, fields) {
  const existing = store.all('reviews').find((r) => r.type === type && r.period === period);
  if (existing) return store.update('reviews', existing.id, fields);
  return store.insert('reviews', newReview({ type, period, ...fields }));
}
