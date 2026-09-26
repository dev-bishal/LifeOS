// Goal and activity editors.

import { store } from '../../core/store.js';
import { esc } from '../../core/utils.js';
import { GOAL_COLORS, GOAL_CATEGORIES, GOAL_STATUSES } from '../../data/models.js';
import { goalsByStatus } from '../../data/selectors.js';
import { createGoal, updateGoal, setGoalStatus, deleteGoal, createActivity, updateActivity, deleteActivity } from '../../data/actions.js';
import { router } from '../../core/router.js';
import { openModal, confirmDialog } from '../modal.js';
import { toast } from '../toast.js';
import { icon } from '../icons.js';
import { formData } from '../dom.js';

export function openGoalEditor(goalId = null) {
  const existing = goalId ? store.get('goals', goalId) : null;
  const goal = existing || { title: '', why: '', description: '', category: '', color: GOAL_COLORS[store.all('goals').length % GOAL_COLORS.length].id, targetDate: '', status: 'active' };

  const body = `
    <form id="goal-form" class="space-y-4" novalidate>
      <div>
        <label class="label" for="gf-title">Goal</label>
        <input id="gf-title" name="title" class="input text-base font-medium" value="${esc(goal.title)}" placeholder="e.g. Get a .NET Developer Job" required autofocus autocomplete="off" />
      </div>
      <div>
        <label class="label" for="gf-why">Why does this matter?</label>
        <textarea id="gf-why" name="why" rows="2" class="input" placeholder="Your motivation keeps you going on hard days.">${esc(goal.why || '')}</textarea>
      </div>
      <div>
        <label class="label" for="gf-description">Definition of done</label>
        <textarea id="gf-description" name="description" rows="2" class="input" placeholder="How will you know you achieved it?">${esc(goal.description || '')}</textarea>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="gf-category">Category</label>
          <input id="gf-category" name="category" list="gf-categories" class="input" value="${esc(goal.category || '')}" placeholder="Career, Health…" autocomplete="off" />
          <datalist id="gf-categories">${GOAL_CATEGORIES.map((c) => `<option value="${c}">`).join('')}</datalist>
        </div>
        <div>
          <label class="label" for="gf-target">Target date</label>
          <input id="gf-target" type="date" name="targetDate" class="input" value="${goal.targetDate || ''}" />
        </div>
        ${
          existing
            ? `<div>
                <label class="label" for="gf-status">Status</label>
                <select id="gf-status" name="status" class="input">
                  ${GOAL_STATUSES.map((s) => `<option value="${s.id}" ${goal.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
              </div>`
            : ''
        }
      </div>
      <fieldset>
        <legend class="label">Color</legend>
        <div class="flex flex-wrap gap-2">
          ${GOAL_COLORS.map(
            (c) => `
            <label class="cursor-pointer">
              <input type="radio" name="color" value="${c.id}" class="peer sr-only" ${goal.color === c.id ? 'checked' : ''} />
              <span class="block size-7 rounded-full ring-offset-2 ring-offset-white transition peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 dark:ring-offset-slate-900 dark:peer-checked:ring-white" style="background:${c.hex}" title="${c.id}"></span>
              <span class="sr-only">${c.id}</span>
            </label>`
          ).join('')}
        </div>
      </fieldset>
    </form>`;

  const footer = `
    ${existing ? `<button type="button" class="btn-ghost mr-auto px-3 py-2 text-sm text-rose-600 dark:text-rose-400" data-delete>${icon('trash', 'size-4')} Delete</button>` : ''}
    <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
    <button type="button" class="btn btn-primary" data-save>${existing ? 'Save' : 'Create goal'}</button>`;

  openModal({
    title: existing ? 'Edit goal' : 'New goal',
    size: 'lg',
    body,
    footer,
    onMount(el, api) {
      const form = el.querySelector('#goal-form');
      form.addEventListener('submit', (e) => e.preventDefault());
      const save = () => {
        const f = formData(form);
        if (!f.title.trim()) return form.elements.title.focus();
        const fields = {
          title: f.title.trim(),
          why: f.why.trim(),
          description: f.description.trim(),
          category: f.category.trim(),
          targetDate: f.targetDate || null,
          color: f.color || goal.color,
        };
        if (existing) {
          updateGoal(existing.id, fields);
          if (f.status && f.status !== existing.status) setGoalStatus(existing.id, f.status);
          toast('Goal saved', { type: 'success' });
        } else {
          const created = createGoal(fields);
          router.navigate(`/goals/${created.id}`);
          toast('Goal created — now break it into activities and tasks', { type: 'success', duration: 6000 });
        }
        api.close();
      };
      el.querySelector('[data-save]').addEventListener('click', save);
      form.elements.title.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), save()));

      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete goal?',
          message: `"${existing.title}" and its activities will be deleted. Its tasks are kept and moved to the Inbox.`,
          confirmText: 'Delete goal',
          danger: true,
        });
        if (!ok) return;
        const undo = deleteGoal(existing.id);
        api.close();
        router.navigate('/goals');
        toast('Goal deleted', { actionLabel: 'Undo', onAction: () => { undo(); router.navigate(`/goals/${existing.id}`); } });
      });
    },
  });
}

export function openActivityEditor(activityId = null, { goalId = null } = {}) {
  const existing = activityId ? store.get('activities', activityId) : null;
  const act = existing || { title: '', description: '', goalId };
  const goals = [...goalsByStatus('active'), ...goalsByStatus('paused')];
  if (act.goalId && !goals.some((g) => g.id === act.goalId)) {
    const g = store.get('goals', act.goalId);
    if (g) goals.push(g);
  }

  const body = `
    <form id="activity-form" class="space-y-4" novalidate>
      <p class="text-sm text-slate-500 dark:text-slate-400">Activities are the projects or areas of work that move a goal forward, e.g. "Learn ASP.NET Core".</p>
      <div>
        <label class="label" for="af-title">Activity</label>
        <input id="af-title" name="title" class="input" value="${esc(act.title)}" placeholder="e.g. Learn ASP.NET Core" autofocus required autocomplete="off" />
      </div>
      <div>
        <label class="label" for="af-description">Description</label>
        <textarea id="af-description" name="description" rows="2" class="input" placeholder="Optional">${esc(act.description || '')}</textarea>
      </div>
      <div>
        <label class="label" for="af-goal">Goal</label>
        <select id="af-goal" name="goalId" class="input">
          ${goals.map((g) => `<option value="${g.id}" ${g.id === act.goalId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}
        </select>
      </div>
    </form>`;

  const footer = `
    ${existing ? `<button type="button" class="btn-ghost mr-auto px-3 py-2 text-sm text-rose-600 dark:text-rose-400" data-delete>${icon('trash', 'size-4')} Delete</button>` : ''}
    <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
    <button type="button" class="btn btn-primary" data-save>${existing ? 'Save' : 'Add activity'}</button>`;

  openModal({
    title: existing ? 'Edit activity' : 'New activity',
    body,
    footer,
    onMount(el, api) {
      const form = el.querySelector('#activity-form');
      form.addEventListener('submit', (e) => e.preventDefault());
      const save = () => {
        const f = formData(form);
        if (!f.title.trim()) return form.elements.title.focus();
        if (!f.goalId) return toast('Create a goal first.', { type: 'error' });
        const fields = { title: f.title.trim(), description: f.description.trim(), goalId: f.goalId };
        if (existing) updateActivity(existing.id, fields);
        else createActivity({ ...fields, order: Date.now() });
        api.close();
      };
      el.querySelector('[data-save]').addEventListener('click', save);
      form.elements.title.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), save()));
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete activity?',
          message: `"${existing.title}" will be deleted. Its tasks stay in the goal.`,
          confirmText: 'Delete',
          danger: true,
        });
        if (!ok) return;
        const undo = deleteActivity(existing.id);
        api.close();
        toast('Activity deleted', { actionLabel: 'Undo', onAction: undo });
      });
    },
  });
}
