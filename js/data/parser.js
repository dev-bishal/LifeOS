// Quick-add natural language parser.
//   "Call mom tomorrow at 6pm !high #family +health"
//   -> title "Call mom", due tomorrow 18:00, high priority, tag family, goal matching "health".
// Supported:
//   dates     today, tonight, tomorrow/tmr, monday…sunday (next occurrence), next week,
//             next month, in 3 days/weeks/months, 2026-10-01, oct 5 / 5 oct
//             (optionally prefixed with due/by/on)
//   times     3pm, 3:30pm, at 15:30, @9
//   priority  !high !medium !low, !1 !2 !3, p1 p2 p3
//   tags      #tag
//   goal      +goalword (matches the first goal whose title contains it)

import { todayKey, addDays, addMonths, parseKey, toKey, startOfWeek, relativeDay, formatTime } from '../core/dates.js';

const WEEKDAYS = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10,
  november: 10, dec: 11, december: 11,
};
const PRIORITY_WORDS = {
  high: 'high', hi: 'high', h: 'high', 1: 'high', p1: 'high',
  medium: 'medium', med: 'medium', m: 'medium', 2: 'medium', p2: 'medium',
  low: 'low', lo: 'low', l: 'low', 3: 'low', p3: 'low',
};

const pad = (n) => String(n).padStart(2, '0');
const PREFIX = '(?:(?:due|by|on)\\s+)?';
const WEEKDAY_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const simplify = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function nextWeekday(target) {
  const today = todayKey();
  const current = parseKey(today).getDay();
  const delta = ((target - current + 7) % 7) || 7;
  return addDays(today, delta);
}

function monthDay(month, day) {
  const now = new Date();
  let d = new Date(now.getFullYear(), month, day);
  if (d.getMonth() !== month) return null; // e.g. feb 31
  if (toKey(d) < todayKey()) d = new Date(now.getFullYear() + 1, month, day);
  return toKey(d);
}

function to24h(hour, minute, meridiem) {
  let h = Number(hour);
  const m = Number(minute || 0);
  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

export function parseQuickAdd(input, { goals = [] } = {}) {
  const result = { title: '', dueDate: null, dueTime: null, priority: null, tags: [], goalId: null, tokens: [] };
  let text = ` ${String(input || '')} `;

  /** Replace matches of regex; the callback returns false to leave a match untouched. */
  const take = (regex, fn) => {
    text = text.replace(regex, (...m) => (fn(...m) === false ? m[0] : ' '));
  };

  // priority
  take(/\s(?:!(high|hi|h|1|medium|med|m|2|low|lo|l|3)|(p[123]))(?=\s)/gi, (_, bang, p) => {
    if (result.priority) return false;
    result.priority = PRIORITY_WORDS[(bang || p).toLowerCase()];
  });

  // tags
  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/gu, (_, tag) => {
    if (!result.tags.includes(tag)) result.tags.push(tag);
  });

  // goal
  take(/\s\+([\p{L}\p{N}_.-]+)(?=\s)/gu, (_, q) => {
    if (result.goalId) return false;
    const needle = simplify(q);
    const goal = goals.find((g) => simplify(g.title).includes(needle));
    if (!goal) return false;
    result.goalId = goal.id;
  });

  // time
  const setTime = (value) => {
    if (result.dueTime || !value) return false;
    result.dueTime = value;
  };
  take(/\s(?:at\s+|@)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/gi, (_, h, m, mer) => setTime(to24h(h, m, mer)));
  take(/\s(?:at\s+|@)(\d{1,2})(?::(\d{2}))?(?=\s)/gi, (_, h, m) => setTime(to24h(h, m)));
  take(/\s(\d{1,2}):(\d{2})(?=\s)/g, (_, h, m) => setTime(to24h(h, m)));

  // date (first match wins)
  const setDate = (key) => {
    if (result.dueDate || !key) return false;
    result.dueDate = key;
  };
  const today = todayKey();
  take(new RegExp(`\\s${PREFIX}(today|tod|tonight)(?=\\s)`, 'gi'), (_, word) => {
    if (setDate(today) === false) return false;
    if (word.toLowerCase() === 'tonight' && !result.dueTime) result.dueTime = '20:00';
  });
  take(new RegExp(`\\s${PREFIX}(tomorrow|tmrw|tmr|tom)(?=\\s)`, 'gi'), () => setDate(addDays(today, 1)));
  take(/\snext\s+week(?=\s)/gi, () => setDate(addDays(startOfWeek(today, 1), 7)));
  take(/\snext\s+month(?=\s)/gi, () => setDate(addMonths(today, 1)));
  take(/\sin\s+(\d{1,3})\s+(days?|weeks?|months?)(?=\s)/gi, (_, n, unit) => {
    const count = Number(n);
    const u = unit.toLowerCase();
    return setDate(u.startsWith('day') ? addDays(today, count) : u.startsWith('week') ? addDays(today, count * 7) : addMonths(today, count));
  });
  take(new RegExp(`\\s${PREFIX}(?:next\\s+)?(${WEEKDAY_RE})(?=\\s)`, 'gi'), (_, day) => setDate(nextWeekday(WEEKDAYS[day.toLowerCase()])));
  take(new RegExp(`\\s${PREFIX}(\\d{4})-(\\d{2})-(\\d{2})(?=\\s)`, 'g'), (_, y, m, d) => setDate(`${y}-${m}-${d}`));
  take(new RegExp(`\\s${PREFIX}(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'gi'), (_, mon, day) =>
    setDate(monthDay(MONTHS[mon.toLowerCase()], Number(day)))
  );
  take(new RegExp(`\\s${PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})(?=\\s)`, 'gi'), (_, day, mon) =>
    setDate(monthDay(MONTHS[mon.toLowerCase()], Number(day)))
  );

  // A time without a date means the next time that clock time occurs.
  if (result.dueTime && !result.dueDate) {
    const now = new Date();
    result.dueDate = result.dueTime > `${pad(now.getHours())}:${pad(now.getMinutes())}` ? today : addDays(today, 1);
  }

  result.title = text.replace(/\s+/g, ' ').trim() || String(input || '').trim();

  if (result.dueDate) result.tokens.push({ type: 'date', label: relativeDay(result.dueDate) + (result.dueTime ? ` ${formatTime(result.dueTime)}` : '') });
  if (result.priority) result.tokens.push({ type: 'priority', label: `${result.priority[0].toUpperCase()}${result.priority.slice(1)} priority` });
  result.tags.forEach((t) => result.tokens.push({ type: 'tag', label: `#${t}` }));
  if (result.goalId) {
    const goal = goals.find((g) => g.id === result.goalId);
    result.tokens.push({ type: 'goal', label: goal?.title || 'Goal' });
  }
  return result;
}
