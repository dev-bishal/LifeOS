// Standalone reminders (task reminders are edited inside the task editor).

import { store } from '../../core/store.js';
import { esc } from '../../core/utils.js';
import { toLocalInput, fromLocalInput } from '../../core/dates.js';
import { createReminder, updateReminder, deleteReminder } from '../../data/actions.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { icon } from '../icons.js';
import { formData } from '../dom.js';
import { requestNotificationPermission, notificationsSupported } from '../../services/notify.js';

export const REMINDER_REPEAT = [
  { id: 'none', label: 'Once' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Every weekday' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
];

export function openReminderEditor(reminderId = null, defaults = {}) {
  const existing = reminderId ? store.get('reminders', reminderId) : null;
  const inOneHour = new Date(Date.now() + 3600000);
  inOneHour.setMinutes(0, 0, 0);
  const rem = existing || { title: '', remindAt: inOneHour.toISOString(), repeat: 'none', ...defaults };
  const askPermission =
    notificationsSupported() && (!store.settings.notificationsEnabled || Notification.permission !== 'granted');

  const body = `
    <form id="reminder-form" class="space-y-4" novalidate>
      <div>
        <label class="label" for="rf-title">Remind me to…</label>
        <input id="rf-title" name="title" class="input" value="${esc(rem.title)}" placeholder="e.g. Drink water, call mom" autofocus autocomplete="off" />
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="rf-at">When</label>
          <input id="rf-at" type="datetime-local" name="remindAt" class="input" value="${toLocalInput(rem.remindAt)}" required />
        </div>
        <div>
          <label class="label" for="rf-repeat">Repeat</label>
          <select id="rf-repeat" name="repeat" class="input">
            ${REMINDER_REPEAT.map((r) => `<option value="${r.id}" ${rem.repeat === r.id ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
      </div>
      ${
        askPermission
          ? `<div class="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              ${icon('bell', 'size-4 mt-0.5')}
              <div class="flex-1">System notifications are off. Reminders will still appear inside LifeOS while it is open.
                <button type="button" class="mt-1 block font-semibold underline" data-enable>Enable notifications</button></div>
            </div>`
          : ''
      }
    </form>`;

  const footer = `
    ${existing ? `<button type="button" class="btn-ghost mr-auto px-3 py-2 text-sm text-rose-600 dark:text-rose-400" data-delete>${icon('trash', 'size-4')} Delete</button>` : ''}
    <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
    <button type="button" class="btn btn-primary" data-save>${existing ? 'Save' : 'Add reminder'}</button>`;

  openModal({
    title: existing ? 'Edit reminder' : 'New reminder',
    body,
    footer,
    onMount(el, api) {
      const form = el.querySelector('#reminder-form');
      form.addEventListener('submit', (e) => e.preventDefault());
      el.querySelector('[data-enable]')?.addEventListener('click', async (e) => {
        const result = await requestNotificationPermission();
        if (result === 'granted') {
          store.setSettings({ notificationsEnabled: true });
          e.target.closest('div.flex').remove();
          toast('Notifications enabled', { type: 'success' });
        } else toast('Notifications were blocked by the browser.', { type: 'error' });
      });
      el.querySelector('[data-save]').addEventListener('click', () => {
        const f = formData(form);
        const remindAt = fromLocalInput(f.remindAt);
        if (!f.title.trim()) return form.elements.title.focus();
        if (!remindAt) return form.elements.remindAt.focus();
        const fields = { title: f.title.trim(), remindAt, repeat: f.repeat, firedAt: null };
        if (existing) updateReminder(existing.id, fields);
        else createReminder(fields);
        toast('Reminder saved', { type: 'success' });
        api.close();
      });
      el.querySelector('[data-delete]')?.addEventListener('click', () => {
        deleteReminder(existing.id);
        api.close();
        toast('Reminder deleted', { actionLabel: 'Undo', onAction: () => store.restore('reminders', existing.id) });
      });
    },
  });
}
