// Derived data. Pure functions over the store; expensive groupings are memoised
// per store version so views can call them freely while rendering.

import { store } from '../core/store.js';
import { todayKey, isoToKey, addDays } from '../core/dates.js';
import { groupBy, sum } from '../core/utils.js';
import { priorityRank } from './models.js';

function memo(fn) {
  let version = -1;
  let cache;
  return () => {
    if (version !== store.version) {
      version = store.version;
      cache = fn();
    }
    return cache;
  };
}

// ---- basic lookups ----------------------------------------------------------

export const isDone = (t) => t.status === 'done';

const subtaskMap = memo(() => groupBy([...store.all('subtasks')].sort((a, b) => a.order - b.order), (s) => s.taskId));
const tasksByGoalMap = memo(() => groupBy(store.all('tasks'), (t) => t.goalId || null));
const tasksByActivityMap = memo(() => groupBy(store.all('tasks'), (t) => t.activityId || null));
const activitiesByGoalMap = memo(() => groupBy([...store.all('activities')].sort((a, b) => a.order - b.order), (a) => a.goalId));

export const subtasksOf = (taskId) => subtaskMap().get(taskId) || [];
export const tasksOfGoal = (goalId) => tasksByGoalMap().get(goalId) || [];
export const tasksOfActivity = (activityId) => tasksByActivityMap().get(activityId) || [];
export const activitiesOf = (goalId) => activitiesByGoalMap().get(goalId) || [];

export const openTasks = () => store.all('tasks').filter((t) => !isDone(t));

export function goalsByStatus(status) {
  return store
    .all('goals')
    .filter((g) => (status ? g.status === status : true))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

export const activeGoals = () => goalsByStatus('active');

// ---- dates -----------------------------------------------------------------------

/** Earliest relevant date of a task (deadline or planned day). */
export function taskDate(t) {
  const dates = [t.dueDate, t.scheduledDate].filter(Boolean).sort();
  return dates[0] || null;
}

export const isOverdue = (t, today = todayKey()) => !isDone(t) && !!t.dueDate && t.dueDate < today;

export const isPlannedToday = (t, today = todayKey()) =>
  !isDone(t) && ((t.dueDate && t.dueDate <= today) || (t.scheduledDate && t.scheduledDate <= today));

export function compareTasks(a, b) {
  if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
  const da = taskDate(a);
  const db = taskDate(b);
  if (da !== db) {
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
  }
  if ((a.dueTime || '') !== (b.dueTime || '')) {
    if (!a.dueTime) return 1;
    if (!b.dueTime) return -1;
    return a.dueTime < b.dueTime ? -1 : 1;
  }
  const pr = priorityRank(b.priority) - priorityRank(a.priority);
  if (pr) return pr;
  return (a.order || 0) - (b.order || 0);
}

export const sortTasks = (list) => [...list].sort(compareTasks);

// ---- progress ------------------------------------------------------------------

export function taskProgress(task) {
  if (isDone(task)) return 1;
  const subs = subtasksOf(task.id);
  if (!subs.length) return 0;
  return subs.filter((s) => s.done).length / subs.length;
}

export function progressOf(tasks) {
  if (!tasks.length) return { pct: 0, done: 0, total: 0, open: 0 };
  const done = tasks.filter(isDone).length;
  const pct = Math.round((sum(tasks, taskProgress) / tasks.length) * 100);
  return { pct, done, total: tasks.length, open: tasks.length - done };
}

export const goalProgress = (goalId) => progressOf(tasksOfGoal(goalId));
export const activityProgress = (activityId) => progressOf(tasksOfActivity(activityId));

export function nextTaskOfGoal(goalId) {
  return sortTasks(tasksOfGoal(goalId).filter((t) => !isDone(t)))[0] || null;
}

export function goalFocusMinutes(goalId) {
  return sum(store.all('sessions').filter((s) => s.goalId === goalId), (s) => s.minutes);
}

// ---- today / inbox / upcoming --------------------------------------------------

export const todayView = memo(() => {
  const today = todayKey();
  const tasks = store.all('tasks');
  const open = tasks.filter((t) => !isDone(t));
  const overdue = sortTasks(open.filter((t) => isOverdue(t, today)));
  const overdueIds = new Set(overdue.map((t) => t.id));
  const planned = sortTasks(open.filter((t) => !overdueIds.has(t.id) && isPlannedToday(t, today)));
  const plannedIds = new Set(planned.map((t) => t.id));
  const suggestions = sortTasks(
    open.filter(
      (t) =>
        t.priority === 'high' &&
        !overdueIds.has(t.id) &&
        !plannedIds.has(t.id) &&
        (!taskDate(t) || taskDate(t) <= addDays(today, 7))
    )
  ).slice(0, 5);
  const completed = tasks
    .filter((t) => isDone(t) && isoToKey(t.completedAt) === today)
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const total = overdue.length + planned.length + completed.length;
  return {
    overdue,
    planned,
    suggestions,
    completed,
    total,
    pct: total ? Math.round((completed.length / total) * 100) : 0,
  };
});

export const inboxTasks = () => sortTasks(openTasks().filter((t) => !t.goalId));

export function upcomingTasks() {
  const today = todayKey();
  return sortTasks(openTasks().filter((t) => taskDate(t) && taskDate(t) > today));
}

/** Tasks that belong on a calendar day (due, scheduled or completed that day). */
export function tasksOnDate(key) {
  return sortTasks(
    store.all('tasks').filter((t) =>
      isDone(t) ? isoToKey(t.completedAt) === key : t.dueDate === key || (t.scheduledDate === key && t.dueDate !== key)
    )
  );
}

// ---- focus & stats -------------------------------------------------------------

const sessionsByTaskMap = memo(() => groupBy(store.all('sessions'), (s) => s.taskId || null));
export const sessionsOfTask = (taskId) => sessionsByTaskMap().get(taskId) || [];
export const pomodorosOfTask = (taskId) => sessionsOfTask(taskId).filter((s) => s.completed).length;
export const focusMinutesOfTask = (taskId) => sum(sessionsOfTask(taskId), (s) => s.minutes);

export const sessionsOn = (key) => store.all('sessions').filter((s) => s.date === key);
export const focusMinutesOn = (key) => sum(sessionsOn(key), (s) => s.minutes);
export const pomodorosOn = (key) => sessionsOn(key).filter((s) => s.completed).length;

export function completedBetween(startKey, endKey) {
  return store.all('tasks').filter((t) => {
    if (!isDone(t) || !t.completedAt) return false;
    const k = isoToKey(t.completedAt);
    return k >= startKey && k <= endKey;
  });
}

export function sessionsBetween(startKey, endKey) {
  return store.all('sessions').filter((s) => s.date >= startKey && s.date <= endKey);
}

/** Consecutive days (ending today, or yesterday if today is still empty) with any completed task or focus. */
export function streak() {
  const active = new Set();
  store.all('tasks').forEach((t) => isDone(t) && t.completedAt && active.add(isoToKey(t.completedAt)));
  store.all('sessions').forEach((s) => s.date && active.add(s.date));
  let day = todayKey();
  if (!active.has(day)) day = addDays(day, -1);
  let count = 0;
  while (active.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

// ---- reminders -----------------------------------------------------------------

export function upcomingReminders(limit = 5) {
  return store
    .all('reminders')
    .filter((r) => !r.firedAt && r.remindAt)
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt))
    .slice(0, limit);
}

export const reminderForTask = (taskId) =>
  store.all('reminders').find((r) => r.taskId === taskId && !r.firedAt) || null;

// ---- reviews -------------------------------------------------------------------

export const reviewFor = (type, period) =>
  store.all('reviews').find((r) => r.type === type && r.period === period) || null;

// ---- search --------------------------------------------------------------------

export function search(query, limit = 20) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const match = (...fields) => fields.some((f) => String(f || '').toLowerCase().includes(q));
  const results = [];
  store.all('goals').forEach((g) => match(g.title, g.description, g.why, g.category) && results.push({ type: 'goal', item: g }));
  store.all('activities').forEach((a) => match(a.title, a.description) && results.push({ type: 'activity', item: a }));
  sortTasks(store.all('tasks')).forEach(
    (t) => match(t.title, t.notes, (t.tags || []).join(' ')) && results.push({ type: 'task', item: t })
  );
  const starts = (r) => (String(r.item.title || '').toLowerCase().startsWith(q) ? 0 : 1);
  return results.sort((a, b) => starts(a) - starts(b)).slice(0, limit);
}
