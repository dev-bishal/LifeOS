// Statistics — completion, focus and goal progress over a time range.

import { store } from '../core/store.js';
import { router } from '../core/router.js';
import { esc, groupBy, sum, plural } from '../core/utils.js';
import { todayKey, addDays, parseKey, formatDate, formatDuration, isoToKey, weekdayNames } from '../core/dates.js';
import { colorHex } from '../data/models.js';
import { completedBetween, sessionsBetween, streak, activeGoals, goalProgress } from '../data/selectors.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { pageHeader, tabs, statTile, emptyState } from '../ui/components/common.js';
import { barChart, hBars } from '../ui/components/charts.js';

let range = 7;

registerActions({
  'stats:range': (el) => {
    range = Number(el.dataset.value);
    router.refresh();
  },
});

function dayLabel(key) {
  if (range === 7) return parseKey(key).toLocaleDateString(undefined, { weekday: 'short' });
  return formatDate(key, { month: 'numeric', day: 'numeric' });
}

export default {
  title: 'Statistics',
  render() {
    const today = todayKey();
    const start = addDays(today, -(range - 1));
    const days = Array.from({ length: range }, (_, i) => addDays(start, i));
    const completed = completedBetween(start, today);
    const sessions = sessionsBetween(start, today);
    const completedByDay = groupBy(completed, (t) => isoToKey(t.completedAt));
    const minutesByDay = groupBy(sessions, (s) => s.date);
    const focusMinutes = sum(sessions, (s) => s.minutes);
    const pomodoros = sessions.filter((s) => s.completed).length;
    const withDue = completed.filter((t) => t.dueDate);
    const onTime = withDue.filter((t) => isoToKey(t.completedAt) <= t.dueDate).length;
    const labelEvery = range === 7 ? 1 : range === 30 ? 5 : 15;

    // Best weekday by completed tasks
    const weekdayCounts = Array(7).fill(0);
    completed.forEach((t) => weekdayCounts[new Date(t.completedAt).getDay()]++);
    const best = weekdayCounts.indexOf(Math.max(...weekdayCounts));
    const bestName = weekdayNames(0, 'long')[best];

    // Focus per goal
    const byGoal = groupBy(sessions, (s) => s.goalId || '');
    const goalRows = [...byGoal.entries()]
      .map(([id, list]) => {
        const goal = id ? store.get('goals', id) : null;
        const value = sum(list, (s) => s.minutes);
        return { label: goal ? goal.title : 'No goal', value, color: goal ? colorHex(goal.color) : '#94a3b8', display: formatDuration(value) };
      })
      .sort((a, b) => b.value - a.value);

    const goals = activeGoals();
    const reviews = store
      .all('reviews')
      .sort((a, b) => (b.period || '').localeCompare(a.period || ''))
      .slice(0, 5);
    const moods = ['', 'Rough', 'Meh', 'Okay', 'Good', 'Great'];
    const empty = !completed.length && !sessions.length;

    return `
      ${pageHeader({
        title: 'Statistics',
        subtitle: `${formatDate(start)} – ${formatDate(today)}`,
        actions: tabs(
          [
            { id: '7', label: '7 days' },
            { id: '30', label: '30 days' },
            { id: '90', label: '90 days' },
          ],
          String(range),
          'stats:range',
          'Time range'
        ),
      })}

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${statTile({ label: 'Tasks completed', value: completed.length, sub: `${(completed.length / range).toFixed(1)} per day`, iconName: 'check', tone: 'emerald' })}
        ${statTile({ label: 'Focus time', value: formatDuration(focusMinutes), sub: `${formatDuration(focusMinutes / range)} per day`, iconName: 'clock', tone: 'sky' })}
        ${statTile({ label: 'Pomodoros', value: pomodoros, sub: plural(sessions.length, 'session'), iconName: 'timer', tone: 'rose' })}
        ${statTile({ label: 'On-time rate', value: withDue.length ? `${Math.round((onTime / withDue.length) * 100)}%` : '—', sub: withDue.length ? `${onTime}/${withDue.length} before deadline` : 'No deadlines in range', iconName: 'flag', tone: 'amber' })}
      </div>

      ${
        empty
          ? `<div class="card mt-6">${emptyState({ iconName: 'chart', title: 'No activity in this period yet', text: 'Complete tasks and run focus sessions — your statistics will appear here.' })}</div>`
          : `
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="card p-5">
          <h2 class="section-title">Tasks completed per day</h2>
          <p class="mb-4 text-xs text-slate-500 dark:text-slate-400">${completed.length ? `Most productive weekday: <b>${esc(bestName)}</b>` : 'No tasks completed yet'}</p>
          ${barChart(
            days.map((k) => ({ label: dayLabel(k), value: (completedByDay.get(k) || []).length, tip: `${formatDate(k, { weekday: 'short', month: 'short', day: 'numeric' })}: ${plural((completedByDay.get(k) || []).length, 'task')}` })),
            { color: '#10b981', title: 'Tasks completed per day', labelEvery }
          )}
        </section>
        <section class="card p-5">
          <h2 class="section-title">Focus time per day</h2>
          <p class="mb-4 text-xs text-slate-500 dark:text-slate-400">Daily goal ${formatDuration(store.settings.dailyFocusGoalMinutes)} · current streak ${plural(streak(), 'day')}</p>
          ${barChart(
            days.map((k) => {
              const m = sum(minutesByDay.get(k) || [], (s) => s.minutes);
              return { label: dayLabel(k), value: m, tip: `${formatDate(k, { weekday: 'short', month: 'short', day: 'numeric' })}: ${formatDuration(m)}` };
            }),
            { color: '#6366f1', title: 'Focus minutes per day', format: (v) => formatDuration(v), labelEvery }
          )}
        </section>
      </div>`
      }

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="card p-5">
          <h2 class="section-title mb-4">Goal progress</h2>
          ${
            goals.length
              ? hBars(
                  goals.map((g) => {
                    const p = goalProgress(g.id);
                    return { label: g.title, value: p.pct, color: colorHex(g.color), display: `${p.pct}% · ${p.done}/${p.total}` };
                  }),
                  { max: 100 }
                )
              : '<p class="text-sm text-slate-500 dark:text-slate-400">No active goals.</p>'
          }
        </section>
        <section class="card p-5">
          <h2 class="section-title mb-4">Focus by goal</h2>
          ${goalRows.length ? hBars(goalRows) : '<p class="text-sm text-slate-500 dark:text-slate-400">No focus sessions in this period.</p>'}
        </section>
      </div>

      <section class="card mt-6 p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="section-title">Recent reviews</h2>
          <a href="#/review" class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">Write a review</a>
        </div>
        ${
          reviews.length
            ? `<ul class="divide-y divide-slate-100 dark:divide-slate-800">${reviews
                .map(
                  (r) => `<li class="flex items-center gap-3 py-2 text-sm">
                    <span class="text-violet-500">${icon('review', 'size-4')}</span>
                    <span class="font-medium text-slate-800 dark:text-slate-100">${r.type === 'weekly' ? `Week of ${formatDate(r.period)}` : formatDate(r.period, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span class="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">${esc(r.wins || r.lessons || '')}</span>
                    ${r.mood ? `<span class="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">${moods[r.mood]}</span>` : ''}
                  </li>`
                )
                .join('')}</ul>`
            : '<p class="text-sm text-slate-500 dark:text-slate-400">No reviews yet. Reflecting for 2 minutes a day compounds quickly.</p>'
        }
      </section>`;
  },
};
