// Dates are stored as local "date keys" (YYYY-MM-DD) for day-level fields
// and ISO timestamps for moments in time. These helpers convert between them.

const pad = (n) => String(n).padStart(2, '0');

export const toKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => toKey(new Date());

export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const isValidKey = (key) => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(key, n) {
  const d = parseKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toKey(d);
}

/** Whole days from a to b (b - a). */
export const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

export function startOfWeek(key, weekStartsOn = 1) {
  const diff = (parseKey(key).getDay() - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export const isoToKey = (iso) => (iso ? toKey(new Date(iso)) : null);

export function formatDate(key, opts = { month: 'short', day: 'numeric' }) {
  if (!key) return '';
  return parseKey(key).toLocaleDateString(undefined, opts);
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Today", "Tomorrow", "Yesterday", "Friday", "Oct 3", "Oct 3, 2027". */
export function relativeDay(key) {
  if (!key) return '';
  const diff = diffDays(todayKey(), key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return parseKey(key).toLocaleDateString(undefined, { weekday: 'long' });
  const sameYear = parseKey(key).getFullYear() === new Date().getFullYear();
  return formatDate(key, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "15:30" -> "3:30 PM" (locale aware). */
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${relativeDay(toKey(d))}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function formatDuration(minutes) {
  const total = Math.round(minutes || 0);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad(m)}:${pad(s)}`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** 42 date keys (6 weeks) covering the given month. */
export function monthGrid(year, month, weekStartsOn = 1) {
  const first = toKey(new Date(year, month, 1));
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekdayNames(weekStartsOn = 1, style = 'short') {
  const base = new Date(2024, 0, 7); // a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + ((i + weekStartsOn) % 7));
    return d.toLocaleDateString(undefined, { weekday: style });
  });
}

/** Combine a date key and "HH:MM" into a local Date. */
export function combine(key, hhmm = '09:00') {
  const d = parseKey(key);
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** ISO -> value for <input type="datetime-local">. */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${toKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);
