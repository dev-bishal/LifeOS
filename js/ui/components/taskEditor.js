// Full task editor. Existing tasks save automatically when the dialog closes;
// new tasks are created with the "Add task" button.

import { store } from '../../core/store.js';
import { esc, parseTags } from '../../core/utils.js';
import { todayKey, addDays, toLocalInput, fromLocalInput, formatDate, isoToKey, formatDuration, relativeDay } from '../../core/dates.js';
import { PRIORITIES, RECURRENCE } from '../../data/models.js';
import { subtasksOf, activitiesOf, goalsByStatus, reminderForTask, focusMinutesOfTask } from '../../data/selectors.js';
import { createTask, updateTask, deleteTask, setTaskReminder, toggleTask } from '../../data/actions.js';
import { openModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { icon } from '../icons.js';
import { formData } from '../dom.js';

function goalOptions(selected) {
  const goals = [...goalsByStatus('active'), ...goalsByStatus('paused')];
  // keep an archived/completed goal selectable if the task already belongs to it
  const current = selected && !goals.some((g) => g.id === selected) ? store.get('goals', selected) : null;
  return [
    `<option value="">Inbox (no goal)</option>`,
    ...[...goals, ...(current ? [current] : [])].map(
      (g) => `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${esc(g.title)}</option>`
    ),
  ].join('');
}

function activityOptions(goalId, selected) {
  const acts = goalId ? activitiesOf(goalId) : [];
  return [
    `<option value="">${goalId ? 'No activity' : 'Choose a goal first'}</option>`,
    ...acts.map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.title)}</option>`),
  ].join('');
}

function subtaskRow(s, i) {
  return `
    <li class="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50" data-index="${i}">
      <button type="button" class="task-check size-[18px] ${s.done ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-400 dark:border-slate-600'}"
        role="checkbox" aria-checked="${!!s.done}" aria-label="Toggle subtask" data-sub="toggle">${icon('check', 'size-3', { strokeWidth: 3.5 })}</button>
      <input class="min-w-0 flex-1 bg-transparent text-sm outline-none ${s.done ? 'text-slate-400 line-through' : ''}" value="${esc(s.title)}" data-sub="title" aria-label="Subtask title" />
      <button type="button" class="btn-ghost p-1 opacity-60 hover:opacity-100" data-sub="delete" aria-label="Delete subtask">${icon('x', 'size-3.5')}</button>
    </li>`;
}

/**
 * Open the editor.
 * @param {string|null} taskId existing task id, or null for a new task
 * @param {object} defaults initial fields for a new task
 */
export function openTaskEditor(taskId = null, defaults = {}) {
  const existing = taskId ? store.get('tasks', taskId) : null;
  if (taskId && !existing) return toast('That task no longer exists.', { type: 'error' });
  const isNew = !existing;
  const task = existing || { title: '', notes: '', priority: 'none', recurrence: 'none', estimate: 0, tags: [], ...defaults };
  const reminder = existing ? reminderForTask(existing.id) : null;
  const today = todayKey();

  // Draft subtasks; applied on save.
  let subs = isNew ? (defaults.subtasks || []).map((s) => ({ ...s })) : subtasksOf(task.id).map((s) => ({ id: s.id, title: s.title, done: s.done }));
  let deleted = false;
  let committed = false;

  const minutes = existing ? focusMinutesOfTask(existing.id) : 0;
  const meta = existing
    ? `<p class="text-xs text-slate-400">Created ${formatDate(isoToKey(existing.createdAt), { month: 'short', day: 'numeric', year: 'numeric' })}${
        existing.completedAt ? ` · Completed ${formatDate(isoToKey(existing.completedAt))}` : ''
      }${minutes ? ` · ${formatDuration(minutes)} focused` : ''}</p>`
    : '';

  const body = `
    <form id="task-form" class="space-y-4" novalidate>
      <div>
        <label for="tf-title" class="sr-only">Task name</label>
        <input id="tf-title" name="title" value="${esc(task.title)}" placeholder="What needs to be done?" autocomplete="off" required autofocus
          class="w-full bg-transparent text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300 dark:text-white dark:placeholder:text-slate-600" />
        <label for="tf-notes" class="sr-only">Notes</label>
        <textarea id="tf-notes" name="notes" rows="2" placeholder="Notes, links, context…"
          class="mt-1 w-full resize-y bg-transparent text-sm text-slate-600 outline-none placeholder:text-slate-400 dark:text-slate-300">${esc(task.notes || '')}</textarea>
      </div>

      <fieldset>
        <legend class="label">Priority</legend>
        <div class="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          ${PRIORITIES.map(
            (p) => `
            <label class="cursor-pointer">
              <input type="radio" name="priority" value="${p.id}" class="peer sr-only" ${task.priority === p.id ? 'checked' : ''} />
              <span class="flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-slate-500 transition peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 dark:peer-checked:bg-slate-700 dark:peer-checked:text-white">
                <span class="${p.text}">${icon('flag', 'size-3')}</span>${p.label}
              </span>
            </label>`
          ).join('')}
        </div>
      </fieldset>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="tf-goal">Goal</label>
          <select id="tf-goal" name="goalId" class="input">${goalOptions(task.goalId)}</select>
        </div>
        <div>
          <label class="label" for="tf-activity">Activity</label>
          <select id="tf-activity" name="activityId" class="input" ${task.goalId ? '' : 'disabled'}>${activityOptions(task.goalId, task.activityId)}</select>
        </div>
        <div>
          <label class="label" for="tf-due">Due date</label>
          <div class="flex gap-2">
            <input id="tf-due" type="date" name="dueDate" value="${task.dueDate || ''}" class="input" />
            <input type="time" name="dueTime" value="${task.dueTime || ''}" class="input w-32" aria-label="Due time" />
          </div>
        </div>
        <div>
          <label class="label" for="tf-scheduled">Planned for <span class="font-normal text-slate-400">(when you'll work on it)</span></label>
          <div class="flex gap-2">
            <input id="tf-scheduled" type="date" name="scheduledDate" value="${task.scheduledDate || ''}" class="input" />
            <button type="button" class="btn btn-secondary btn-sm" data-set-scheduled="${today}">Today</button>
            <button type="button" class="btn btn-secondary btn-sm hidden sm:inline-flex" data-set-scheduled="${addDays(today, 1)}">Tmrw</button>
          </div>
        </div>
        <div>
          <label class="label" for="tf-recurrence">Repeat</label>
          <select id="tf-recurrence" name="recurrence" class="input">
            ${RECURRENCE.map((r) => `<option value="${r.id}" ${task.recurrence === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label" for="tf-estimate">Estimate (pomodoros)</label>
          <input id="tf-estimate" type="number" name="estimate" min="0" max="99" value="${Number(task.estimate) || 0}" class="input" />
        </div>
        <div>
          <label class="label" for="tf-reminder">Reminder</label>
          <input id="tf-reminder" type="datetime-local" name="reminderAt" value="${toLocalInput(reminder?.remindAt || defaults.reminderAt)}" class="input" />
        </div>
        <div>
          <label class="label" for="tf-tags">Tags</label>
          <input id="tf-tags" name="tags" value="${esc((task.tags || []).join(', '))}" placeholder="e.g. study, deep-work" class="input" autocomplete="off" />
        </div>
      </div>

      <section aria-labelledby="tf-subtasks-label">
        <div class="mb-1.5 flex items-center justify-between">
          <span id="tf-subtasks-label" class="label mb-0">Subtasks</span>
          <span class="text-xs text-slate-400 tabular" data-sub-count></span>
        </div>
        <ul class="space-y-0.5" data-sub-list></ul>
        <div class="mt-1 flex items-center gap-2 px-1">
          <span class="text-indigo-500">${icon('plus', 'size-4')}</span>
          <input id="tf-subtask-new" class="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-slate-400" placeholder="Add a subtask and press Enter" autocomplete="off" />
        </div>
      </section>
      ${meta}
    </form>`;

  const footer = isNew
    ? `<button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
       <button type="button" class="btn btn-primary" data-save>${icon('plus', 'size-4')} Add task</button>`
    : `<button type="button" class="btn-ghost mr-auto px-3 py-2 text-sm text-rose-600 dark:text-rose-400" data-delete>${icon('trash', 'size-4')} Delete</button>
       <button type="button" class="btn btn-secondary" data-complete>${icon('check', 'size-4')} ${task.status === 'done' ? 'Reopen' : 'Complete'}</button>
       <button type="button" class="btn btn-primary" data-save>Done</button>`;

  const collect = (form) => {
    const f = formData(form);
    const title = f.title.trim();
    return {
      fields: {
        title: title || task.title || 'Untitled task',
        notes: f.notes.trim(),
        goalId: f.goalId || null,
        activityId: f.activityId || null,
        priority: f.priority || 'none',
        dueDate: f.dueDate || null,
        dueTime: f.dueDate && f.dueTime ? f.dueTime : null,
        scheduledDate: f.scheduledDate || null,
        recurrence: f.recurrence || 'none',
        estimate: Math.max(0, Math.min(99, parseInt(f.estimate, 10) || 0)),
        tags: parseTags(f.tags),
      },
      reminderAt: fromLocalInput(f.reminderAt),
      hasTitle: Boolean(title),
    };
  };

  const saveSubtasks = (id) => {
    const original = new Map(subtasksOf(id).map((s) => [s.id, s]));
    subs.forEach((s, i) => {
      const title = s.title.trim();
      if (s.id && original.has(s.id)) {
        const o = original.get(s.id);
        if (!title) store.remove('subtasks', s.id);
        else if (o.title !== title || o.done !== s.done || o.order !== i) store.update('subtasks', s.id, { title, done: !!s.done, order: i });
        original.delete(s.id);
      } else if (title) {
        store.insert('subtasks', { taskId: id, title, done: !!s.done, order: i });
      }
    });
    original.forEach((s) => store.remove('subtasks', s.id)); // removed in the editor
  };

  const commitExisting = (form) => {
    if (committed || deleted || isNew) return;
    committed = true;
    const { fields, reminderAt } = collect(form);
    const changed = Object.entries(fields).some(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(existing[k] ?? null));
    if (changed) updateTask(existing.id, fields);
    saveSubtasks(existing.id);
    if ((reminder?.remindAt || null) !== reminderAt) setTaskReminder(existing.id, reminderAt);
  };

  let formEl;
  const modal = openModal({
    title: isNew ? 'New task' : 'Edit task',
    size: 'lg',
    body,
    footer,
    onClose: () => formEl && commitExisting(formEl),
    onMount(el, api) {
      const form = (formEl = el.querySelector('#task-form'));
      const list = el.querySelector('[data-sub-list]');
      const count = el.querySelector('[data-sub-count]');
      const goalSel = form.elements.goalId;
      const actSel = form.elements.activityId;

      form.addEventListener('submit', (e) => e.preventDefault());

      const renderSubs = () => {
        list.innerHTML = subs.map(subtaskRow).join('');
        const done = subs.filter((s) => s.done).length;
        count.textContent = subs.length ? `${done}/${subs.length}` : '';
      };
      renderSubs();

      goalSel.addEventListener('change', () => {
        actSel.innerHTML = activityOptions(goalSel.value, null);
        actSel.disabled = !goalSel.value;
      });

      el.querySelectorAll('[data-set-scheduled]').forEach((btn) =>
        btn.addEventListener('click', () => (form.elements.scheduledDate.value = btn.dataset.setScheduled))
      );

      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-sub]');
        if (!btn || btn.tagName === 'INPUT') return;
        const i = Number(btn.closest('li').dataset.index);
        if (btn.dataset.sub === 'toggle') subs[i].done = !subs[i].done;
        if (btn.dataset.sub === 'delete') subs.splice(i, 1);
        renderSubs();
      });
      list.addEventListener('input', (e) => {
        if (e.target.dataset.sub !== 'title') return;
        subs[Number(e.target.closest('li').dataset.index)].title = e.target.value;
      });

      const newSub = el.querySelector('#tf-subtask-new');
      newSub.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const title = newSub.value.trim();
        if (!title) return;
        subs.push({ title, done: false });
        newSub.value = '';
        renderSubs();
      });

      // Enter in the title field saves.
      form.elements.title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          el.querySelector('[data-save]').click();
        }
      });

      el.querySelector('[data-save]').addEventListener('click', () => {
        if (isNew) {
          const { fields, reminderAt, hasTitle } = collect(form);
          if (!hasTitle) {
            form.elements.title.focus();
            form.elements.title.classList.add('placeholder:text-rose-400');
            return;
          }
          const pending = newSub.value.trim();
          if (pending) subs.push({ title: pending, done: false });
          const created = createTask(fields, { subtasks: subs, reminderAt });
          toast('Task added', { type: 'success', actionLabel: 'Open', onAction: () => openTaskEditor(created.id) });
        }
        api.close();
      });

      el.querySelector('[data-complete]')?.addEventListener('click', () => {
        commitExisting(form);
        const res = toggleTask(existing.id);
        api.close();
        if (res?.completed) {
          toast(res.next ? `Completed · next: ${relativeDay(res.next.dueDate || res.next.scheduledDate)}` : 'Task completed', { type: 'success', actionLabel: 'Undo', onAction: res.undo });
        }
      });

      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete task?', message: `"${existing.title}" and its subtasks will be deleted.`, confirmText: 'Delete', danger: true });
        if (!ok) return;
        deleted = true;
        const undo = deleteTask(existing.id);
        api.close();
        toast('Task deleted', { actionLabel: 'Undo', onAction: undo });
      });
    },
  });
  return modal;
}
