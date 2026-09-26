// Domain constants and record factories. Factories define every field so the
// shape matches the Google Sheets schema in apps-script/Code.gs.

export const PRIORITIES = [
  { id: 'high', label: 'High', rank: 3, text: 'text-rose-600 dark:text-rose-400', ring: 'border-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10' },
  { id: 'medium', label: 'Medium', rank: 2, text: 'text-amber-600 dark:text-amber-400', ring: 'border-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  { id: 'low', label: 'Low', rank: 1, text: 'text-sky-600 dark:text-sky-400', ring: 'border-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10' },
  { id: 'none', label: 'None', rank: 0, text: 'text-slate-500 dark:text-slate-400', ring: 'border-slate-300 dark:border-slate-600', bg: 'bg-slate-100 dark:bg-slate-800' },
];

export const priorityOf = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[3];
export const priorityRank = (id) => priorityOf(id).rank;

export const GOAL_COLORS = [
  { id: 'indigo', hex: '#6366f1' },
  { id: 'violet', hex: '#8b5cf6' },
  { id: 'sky', hex: '#0ea5e9' },
  { id: 'teal', hex: '#14b8a6' },
  { id: 'emerald', hex: '#10b981' },
  { id: 'amber', hex: '#f59e0b' },
  { id: 'orange', hex: '#f97316' },
  { id: 'rose', hex: '#f43f5e' },
  { id: 'pink', hex: '#ec4899' },
  { id: 'slate', hex: '#64748b' },
];

export const colorHex = (id) => (GOAL_COLORS.find((c) => c.id === id) || GOAL_COLORS[0]).hex;

export const GOAL_STATUSES = [
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
];

export const GOAL_CATEGORIES = ['Career', 'Learning', 'Health', 'Finance', 'Personal', 'Relationships', 'Creative', 'Home'];

export const RECURRENCE = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Every weekday' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
  { id: 'yearly', label: 'Every year' },
];

export const recurrenceLabel = (id) => (RECURRENCE.find((r) => r.id === id) || RECURRENCE[0]).label;

export function newGoal(fields = {}) {
  return {
    title: '',
    description: '',
    why: '',
    category: '',
    color: 'indigo',
    status: 'active',
    targetDate: null,
    completedAt: null,
    order: Date.now(),
    ...fields,
  };
}

export function newActivity(fields = {}) {
  return { goalId: null, title: '', description: '', status: 'active', order: Date.now(), ...fields };
}

export function newTask(fields = {}) {
  return {
    title: '',
    notes: '',
    goalId: null,
    activityId: null,
    status: 'todo',
    priority: 'none',
    dueDate: null,
    dueTime: null,
    scheduledDate: null,
    estimate: 0,
    tags: [],
    recurrence: 'none',
    completedAt: null,
    order: Date.now(),
    ...fields,
  };
}

export function newSubtask(fields = {}) {
  return { taskId: null, title: '', done: false, order: Date.now(), ...fields };
}

export function newSession(fields = {}) {
  return { taskId: null, goalId: null, type: 'focus', date: null, startedAt: null, endedAt: null, minutes: 0, completed: true, ...fields };
}

export function newReminder(fields = {}) {
  return { title: '', taskId: null, remindAt: null, repeat: 'none', firedAt: null, ...fields };
}

export function newReview(fields = {}) {
  return { type: 'daily', period: null, mood: null, energy: null, wins: '', challenges: '', lessons: '', nextFocus: '', ...fields };
}
