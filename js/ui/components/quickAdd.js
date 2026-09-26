// Quick add dialog with natural-language parsing and a live preview.

import { store } from '../../core/store.js';
import { esc } from '../../core/utils.js';
import { todayKey } from '../../core/dates.js';
import { goalsByStatus, activitiesOf } from '../../data/selectors.js';
import { parseQuickAdd } from '../../data/parser.js';
import { createTask } from '../../data/actions.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { icon } from '../icons.js';
import { openTaskEditor } from './taskEditor.js';

const TOKEN_STYLE = {
  date: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
  priority: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  tag: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  goal: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
};
const TOKEN_ICON = { date: 'calendar', priority: 'flag', tag: 'tag', goal: 'target' };

/** Build task fields from parsed text + dialog/context defaults. */
export function fieldsFromText(text, defaults = {}) {
  const goals = goalsByStatus('active');
  const parsed = parseQuickAdd(text, { goals });
  const fields = {
    title: parsed.title,
    goalId: parsed.goalId || defaults.goalId || null,
    activityId: parsed.goalId && parsed.goalId !== defaults.goalId ? null : defaults.activityId || null,
    dueDate: parsed.dueDate || defaults.dueDate || null,
    dueTime: parsed.dueTime || null,
    priority: parsed.priority || defaults.priority || 'none',
    tags: parsed.tags,
    scheduledDate: defaults.scheduledDate || null,
  };
  return { fields, parsed };
}

export function openQuickAdd(defaults = {}) {
  const goals = goalsByStatus('active');
  const body = `
    <form id="qa-form" autocomplete="off">
      <label for="qa-input" class="sr-only">Task</label>
      <input id="qa-input" name="text" autofocus enterkeyhint="done" placeholder="e.g. Learn EF Core tomorrow 7pm !high #study"
        class="w-full rounded-xl bg-slate-50 px-4 py-3 text-base text-slate-900 ring-1 ring-slate-200 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-white dark:ring-slate-700" />
      <div class="mt-2 flex min-h-6 flex-wrap gap-1.5" data-preview aria-live="polite"></div>
      <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label for="qa-goal" class="label">Goal</label>
          <select id="qa-goal" class="input">
            <option value="">Inbox (no goal)</option>
            ${goals.map((g) => `<option value="${g.id}" ${g.id === defaults.goalId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
          </select>
        </div>
        <div class="flex items-end">
          <label class="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-2 text-sm">
            <input id="qa-today" type="checkbox" class="size-4 rounded accent-indigo-600" ${defaults.scheduledDate === todayKey() ? 'checked' : ''} />
            Plan for today
          </label>
        </div>
      </div>
      <p class="mt-4 text-xs leading-5 text-slate-400">
        Understands <b>today</b>, <b>tomorrow</b>, <b>fri</b>, <b>next week</b>, <b>in 3 days</b>, <b>oct 5</b>, <b>7pm</b>,
        <b>!high</b>/<b>!med</b>/<b>!low</b>, <b>#tag</b> and <b>+goal</b>. Press <kbd>Enter</kbd> to add, <kbd>Shift</kbd>+<kbd>Enter</kbd> to add another.
      </p>
    </form>`;

  const footer = `
    <button type="button" class="btn btn-ghost mr-auto px-3 py-2 text-sm" data-more>${icon('edit', 'size-4')} More options</button>
    <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
    <button type="button" class="btn btn-primary" data-add>${icon('plus', 'size-4')} Add task</button>`;

  return openModal({
    title: 'Quick add',
    body,
    footer,
    onMount(el, api) {
      const input = el.querySelector('#qa-input');
      const preview = el.querySelector('[data-preview]');
      const goalSel = el.querySelector('#qa-goal');
      const todayBox = el.querySelector('#qa-today');

      const current = () => {
        const goalId = goalSel.value || null;
        const keepActivity = goalId && defaults.activityId && activitiesOf(goalId).some((a) => a.id === defaults.activityId);
        return fieldsFromText(input.value, {
          ...defaults,
          goalId,
          activityId: keepActivity ? defaults.activityId : null,
          scheduledDate: todayBox.checked ? todayKey() : defaults.scheduledDate === todayKey() ? null : defaults.scheduledDate,
        });
      };

      const renderPreview = () => {
        const { parsed } = current();
        preview.innerHTML = input.value.trim()
          ? parsed.tokens.map((t) => `<span class="chip ${TOKEN_STYLE[t.type]}">${icon(TOKEN_ICON[t.type], 'size-3')}${esc(t.label)}</span>`).join('')
          : '';
      };

      const add = (keepOpen) => {
        if (!input.value.trim()) {
          input.focus();
          return;
        }
        const { fields } = current();
        const task = createTask(fields);
        if (keepOpen) {
          input.value = '';
          renderPreview();
          input.focus();
          toast(`Added "${task.title}"`, { type: 'success', duration: 2000 });
        } else {
          api.close();
          const where = task.goalId ? store.get('goals', task.goalId)?.title : 'Inbox';
          toast(`Added to ${where}`, { type: 'success', actionLabel: 'Open', onAction: () => openTaskEditor(task.id) });
        }
      };

      input.addEventListener('input', renderPreview);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          add(e.shiftKey);
        }
      });
      el.querySelector('#qa-form').addEventListener('submit', (e) => e.preventDefault());
      el.querySelector('[data-add]').addEventListener('click', () => add(false));
      el.querySelector('[data-more]').addEventListener('click', () => {
        const { fields } = current();
        api.close();
        openTaskEditor(null, input.value.trim() ? fields : { ...fields, title: '' });
      });
    },
  });
}
