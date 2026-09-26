// Settings — profile, appearance, focus timer, notifications, sync and data.
// This view does not auto-refresh on every store change so inputs are never
// replaced while the user is editing; it re-renders explicitly when needed.

import { store, COLLECTIONS } from '../core/store.js';
import { bus } from '../core/events.js';
import { router } from '../core/router.js';
import { esc, downloadFile, plural, initials } from '../core/utils.js';
import { todayKey, timeAgo, formatDate, isoToKey } from '../core/dates.js';
import { loadSampleData } from '../data/sample.js';
import { CONFIG } from '../config.js';
import { currentUser, isSignedIn, setLocalMode, storageSuffix } from '../core/session.js';
import { testConnection, syncNow, fullResync, getStatus, APP_VERSION } from '../services/sync.js';
import { apiUrl } from '../services/api.js';
import { signOut, changePassword, updateProfile, passwordProblem } from '../services/auth.js';
import { TIMER_KEY } from '../services/timer.js';
import { requestNotificationPermission, notificationsSupported, notify, playChime, unlockAudio } from '../services/notify.js';
import { canInstall, promptInstall, isStandalone } from '../services/pwa.js';
import { registerActions } from '../ui/actions.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { showShortcuts } from '../ui/shortcuts.js';

const rerender = () => router.refresh({ force: true });

function section(id, title, description, content) {
  return `
    <section id="section-${id}" class="card scroll-mt-20 p-5 sm:p-6" aria-labelledby="h-${id}">
      <div class="mb-5">
        <h2 id="h-${id}" class="text-base font-semibold text-slate-900 dark:text-white">${title}</h2>
        ${description ? `<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${description}</p>` : ''}
      </div>
      ${content}
    </section>`;
}

function toggle(name, label, hint = '') {
  const on = Boolean(store.settings[name]);
  return `
    <label class="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span><span class="block text-sm font-medium text-slate-800 dark:text-slate-100">${label}</span>${hint ? `<span class="block text-xs text-slate-500 dark:text-slate-400">${hint}</span>` : ''}</span>
      <input type="checkbox" name="${name}" class="peer sr-only" data-change="settings:set" ${on ? 'checked' : ''} />
      <span class="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 dark:bg-slate-700" aria-hidden="true"></span>
    </label>`;
}

function numberField(name, label, min, max, suffix = 'min') {
  return `
    <div>
      <label class="label" for="set-${name}">${label}</label>
      <div class="relative">
        <input id="set-${name}" type="number" name="${name}" min="${min}" max="${max}" value="${esc(store.settings[name])}" class="input pr-12" data-change="settings:set" />
        <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">${suffix}</span>
      </div>
    </div>`;
}

function syncStatusHtml() {
  const s = getStatus();
  if (s.state === 'disabled') return `<span class="text-slate-500 dark:text-slate-400">Not connected — data lives only in this browser.</span>`;
  const map = {
    idle: `<span class="text-emerald-600 dark:text-emerald-400">Connected · last sync ${timeAgo(s.lastSyncAt)}</span>`,
    syncing: `<span class="text-indigo-600 dark:text-indigo-400">Syncing…</span>`,
    error: `<span class="text-rose-600 dark:text-rose-400">Error: ${esc(s.lastError || 'unknown')}</span>`,
    offline: `<span class="text-amber-600 dark:text-amber-400">Offline — changes will sync when you're back online.</span>`,
  };
  return `${map[s.state] || map.idle}${s.pending ? `<span class="text-slate-500 dark:text-slate-400"> · ${plural(s.pending, 'change')} pending</span>` : ''}`;
}

function notificationStatus() {
  if (!notificationsSupported()) return 'Not supported in this browser.';
  if (Notification.permission === 'denied') return 'Blocked in browser settings. Allow notifications for this site to enable them.';
  if (store.settings.notificationsEnabled && Notification.permission === 'granted') return 'Enabled.';
  return 'Off. Reminders still show inside the app while it is open.';
}

function passwordInput(name, label, autocomplete) {
  return `
    <div>
      <label class="label" for="acc-${name}">${label}</label>
      <input id="acc-${name}" name="${name}" type="password" autocomplete="${autocomplete}" class="input" required />
    </div>`;
}

function serverForm() {
  // A deployment with a fixed server URL in js/config.js hides this unless overridden.
  if (CONFIG.apiUrl && !store.settings.syncUrl) return '';
  return `
    <details class="group mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
      <summary class="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">${icon('settings', 'size-4')} Server<span class="chev ml-auto transition">${icon('chevron-down', 'size-4')}</span></summary>
      <form class="mt-3 space-y-2" data-submit="account:server" autocomplete="off">
        <label class="label" for="acc-server">Apps Script Web App URL</label>
        <div class="flex gap-2">
          <input id="acc-server" name="serverUrl" type="url" class="input font-mono text-xs" value="${esc(apiUrl())}" placeholder="https://script.google.com/macros/s/…/exec" spellcheck="false" />
          <button type="submit" class="btn btn-secondary btn-sm">Test &amp; save</button>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">See <a class="font-medium text-indigo-600 hover:underline dark:text-indigo-400" href="apps-script/SETUP.md" target="_blank" rel="noopener">the setup guide</a>. Changing servers requires signing in again on that server.</p>
      </form>
    </details>`;
}

function accountSection(user) {
  if (!user) {
    return `
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
        <div class="flex items-center gap-3">
          <span class="grid size-10 place-items-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300">${icon('cloud-off', 'size-5')}</span>
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-white">Using LifeOS without an account</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Data stays in this browser. You can copy it into your account after signing in.</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary" data-action="account:signin">${icon('user', 'size-4')} Sign in or create account</button>
      </div>
      ${serverForm()}`;
  }
  const s = store.settings;
  return `
    <div class="flex flex-wrap items-center gap-4">
      <span class="grid size-12 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-base font-semibold text-white">${esc(initials(user.name))}</span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold text-slate-900 dark:text-white">${esc(user.name)}</p>
        <p class="truncate text-sm text-slate-500 dark:text-slate-400">${esc(user.email)}${user.createdAt ? ` · member since ${formatDate(isoToKey(user.createdAt), { month: 'short', year: 'numeric' })}` : ''}</p>
      </div>
      <button type="button" class="btn btn-secondary" data-action="account:signout">${icon('log-out', 'size-4')} Sign out</button>
    </div>

    <div class="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
      <p class="text-sm" data-sync-status>${syncStatusHtml()}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn btn-secondary btn-sm" data-action="settings:sync-now">${icon('sync', 'size-3.5')} Sync now</button>
        <button type="button" class="btn btn-secondary btn-sm" data-action="settings:sync-full">Full resync</button>
      </div>
    </div>
    <div class="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
      ${toggle('autoSync', 'Automatic sync', 'Sync a few seconds after changes, on an interval and when you come back online.')}
      <div class="flex items-center justify-between gap-4 py-2">
        <label for="set-syncIntervalMin" class="text-sm font-medium text-slate-800 dark:text-slate-100">Background sync interval</label>
        <select id="set-syncIntervalMin" name="syncIntervalMin" class="input w-auto" data-change="settings:set">
          ${[1, 5, 15, 30, 60].map((m) => `<option value="${m}" ${Number(s.syncIntervalMin) === m ? 'selected' : ''}>Every ${m} min</option>`).join('')}
        </select>
      </div>
    </div>

    <details class="group mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
      <summary class="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">${icon('lock', 'size-4')} Change password<span class="chev ml-auto transition">${icon('chevron-down', 'size-4')}</span></summary>
      <form class="mt-3 grid gap-3 sm:grid-cols-3" data-submit="account:password" autocomplete="on">
        <input type="email" name="username" autocomplete="username" value="${esc(user.email)}" hidden />
        ${passwordInput('currentPassword', 'Current password', 'current-password')}
        ${passwordInput('newPassword', 'New password', 'new-password')}
        ${passwordInput('confirmPassword', 'Confirm new password', 'new-password')}
        <div class="sm:col-span-3"><button type="submit" class="btn btn-primary">Change password</button></div>
      </form>
    </details>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
      <p class="text-xs text-slate-500 dark:text-slate-400">Lost a device? Sign out everywhere to revoke all sessions.</p>
      <button type="button" class="btn-ghost px-3 py-2 text-sm text-rose-600 dark:text-rose-400" data-action="account:signout" data-everywhere="1">Sign out of all devices</button>
    </div>
    ${serverForm()}`;
}

/** Sync first, warn about anything that could not be synced, then sign out. */
async function signOutFlow({ everywhere = false } = {}) {
  try {
    await syncNow();
  } catch {
    /* offline: handled by the pending count below */
  }
  const pending = store.dirtyCount();
  const ok = await confirmDialog({
    title: everywhere ? 'Sign out of all devices?' : 'Sign out?',
    message: pending
      ? `${plural(pending, 'change')} on this device could not be synced yet and will be lost if you sign out now. Connect to the internet and sync first to keep them.`
      : `Your data is safe in your account.${everywhere ? ' Every device will need to sign in again.' : ''} This device's copy will be removed.`,
    confirmText: pending ? 'Sign out anyway' : 'Sign out',
    danger: pending > 0,
  });
  if (!ok) return;
  await signOut({ everywhere });
  location.hash = '#/';
  location.reload();
}

// ---- actions ------------------------------------------------------------------

registerActions({
  'settings:set': (el) => {
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') {
      const n = Number(el.value);
      const min = Number(el.min || 0);
      const max = Number(el.max || 9999);
      if (!Number.isFinite(n)) return;
      value = Math.round(Math.min(max, Math.max(min, n)));
      el.value = value;
    } else if (el.name === 'weekStartsOn') value = Number(el.value);
    else value = el.value;
    store.setSettings({ [el.name]: value });
    if (el.name === 'theme') rerender();
  },
  'settings:sound-test': () => {
    unlockAudio();
    const was = store.settings.soundEnabled;
    if (!was) store.setSettings({ soundEnabled: true });
    playChime();
    if (!was) store.setSettings({ soundEnabled: false });
  },
  'settings:notify-enable': async () => {
    const result = await requestNotificationPermission();
    if (result === 'granted') {
      store.setSettings({ notificationsEnabled: true });
      toast('Notifications enabled', { type: 'success' });
    } else toast(result === 'unsupported' ? 'Notifications are not supported here.' : 'Permission was not granted.', { type: 'error' });
    rerender();
  },
  'settings:notify-disable': () => {
    store.setSettings({ notificationsEnabled: false });
    rerender();
  },
  'settings:notify-test': async () => {
    const shown = await notify('LifeOS', { body: 'Notifications are working.', force: true });
    if (!shown) toast('Could not show a notification. Check browser permissions.', { type: 'error' });
  },
  'settings:sync-now': async () => {
    try {
      const res = await syncNow();
      if (!res.skipped) toast(`Synced · ${res.pushed} sent, ${res.pulled} received`, { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error', duration: 8000 });
    }
  },
  'settings:sync-full': async () => {
    const ok = await confirmDialog({ title: 'Full resync?', message: 'Every local record is uploaded and everything in your account is downloaded again. Newer versions win.', confirmText: 'Resync' });
    if (!ok) return;
    try {
      const res = await fullResync();
      toast(`Full resync done · ${res.pushed} sent, ${res.pulled} received`, { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error', duration: 8000 });
    }
  },
  'account:name': async (el) => {
    const name = el.value.trim();
    if (!name) {
      el.value = currentUser()?.name || '';
      return toast('Your name cannot be empty.', { type: 'error' });
    }
    try {
      await updateProfile(name);
      toast('Name updated', { type: 'success' });
      store.setSettings({ name }); // refresh greeting / avatar
    } catch (err) {
      el.value = currentUser()?.name || '';
      toast(err.message, { type: 'error' });
    }
  },
  'account:password': async (form) => {
    const current = form.elements.currentPassword.value;
    const next = form.elements.newPassword.value;
    const confirm = form.elements.confirmPassword.value;
    if (!current) return toast('Enter your current password.', { type: 'error' });
    const problem = passwordProblem(next);
    if (problem) return toast(problem, { type: 'error' });
    if (next !== confirm) return toast('The new passwords do not match.', { type: 'error' });
    if (next === current) return toast('Choose a password different from the current one.', { type: 'error' });
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      await changePassword(current, next);
      form.reset();
      toast('Password changed. Your other devices were signed out.', { type: 'success', duration: 6000 });
    } catch (err) {
      toast(err.message, { type: 'error', duration: 6000 });
    } finally {
      button.disabled = false;
      button.textContent = 'Change password';
    }
  },
  'account:signout': (el) => signOutFlow({ everywhere: el.dataset.everywhere === '1' }),
  'account:signin': () => {
    setLocalMode(false);
    location.hash = '#/login';
    location.reload();
  },
  'account:server': async (form) => {
    const url = form.elements.serverUrl.value.trim();
    if (url) {
      try {
        const res = await testConnection(url);
        toast(`Server reachable (backend v${res.version})`, { type: 'success' });
      } catch (err) {
        const ok = await confirmDialog({ title: 'Server not reachable', message: `${err.message} Save this URL anyway?`, confirmText: 'Save anyway' });
        if (!ok) return;
      }
    }
    store.setSettings({ syncUrl: url });
    rerender();
  },
  'settings:export': () => {
    const data = store.exportData();
    downloadFile(`lifeos-backup-${todayKey()}.json`, JSON.stringify(data, null, 2));
    toast('Backup downloaded', { type: 'success' });
  },
  'settings:import': () => document.getElementById('import-file').click(),
  'settings:import-file': async (el) => {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!COLLECTIONS.some((c) => Array.isArray(data[c]))) throw new Error('This file is not a LifeOS backup.');
      const count = COLLECTIONS.reduce((n, c) => n + (data[c]?.length || 0), 0);
      const replace = await confirmDialog({
        title: 'Import backup',
        message: `Found ${count} records. Replace all current data with this backup? (Choose Cancel to merge instead.)`,
        confirmText: 'Replace',
        cancelText: 'Merge',
        danger: true,
      });
      store.importData(data, { mode: replace ? 'replace' : 'merge' });
      toast(`Imported ${count} records`, { type: 'success' });
    } catch (err) {
      toast(`Import failed: ${err.message}`, { type: 'error', duration: 8000 });
    }
  },
  'settings:sample': () => {
    loadSampleData();
    toast('Example data added', { type: 'success' });
    router.navigate('/');
  },
  'settings:clear': async () => {
    const ok = await confirmDialog({
      title: 'Delete all local data?',
      message: isSignedIn()
        ? 'All goals, tasks, sessions and reviews on this device will be deleted. Your account copy is not deleted and downloads again on the next sync.'
        : 'All goals, tasks, sessions and reviews in this browser will be deleted. Export a backup first if unsure.',
      confirmText: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    store.clearAll();
    localStorage.removeItem(TIMER_KEY + storageSuffix());
    toast('All local data deleted');
    router.navigate('/');
  },
  'settings:install': async () => {
    await promptInstall();
    rerender();
  },
  'settings:shortcuts': () => showShortcuts(),
});

// ---- view ------------------------------------------------------------------------

export default {
  title: 'Settings',
  autoRefresh: false,
  render() {
    const s = store.settings;
    const user = currentUser();
    const counts = COLLECTIONS.map((c) => [c, store.all(c).length]);
    const notifOn = s.notificationsEnabled && notificationsSupported() && Notification.permission === 'granted';

    return `
      <div class="mb-6">
        <h1 class="page-title">Settings</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Changes are saved automatically.</p>
      </div>
      <div class="mx-auto max-w-3xl space-y-6">
        ${section(
          'profile',
          'Profile',
          '',
          `<div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="set-name">Your name</label>
              <input id="set-name" name="name" class="input" value="${esc(user ? user.name : s.name)}" placeholder="Used in the greeting" autocomplete="name" data-change="${user ? 'account:name' : 'settings:set'}" />
            </div>
            <div>
              <label class="label" for="set-weekStartsOn">Week starts on</label>
              <select id="set-weekStartsOn" name="weekStartsOn" class="input" data-change="settings:set">
                <option value="1" ${s.weekStartsOn === 1 ? 'selected' : ''}>Monday</option>
                <option value="0" ${s.weekStartsOn === 0 ? 'selected' : ''}>Sunday</option>
                <option value="6" ${s.weekStartsOn === 6 ? 'selected' : ''}>Saturday</option>
              </select>
            </div>
          </div>`
        )}

        ${section(
          'appearance',
          'Appearance',
          '',
          `<fieldset>
            <legend class="sr-only">Theme</legend>
            <div class="grid grid-cols-3 gap-2">
              ${[
                ['light', 'Light', 'sun'],
                ['dark', 'Dark', 'moon'],
                ['system', 'System', 'monitor'],
              ]
                .map(
                  ([v, l, i]) => `
                <label class="cursor-pointer">
                  <input type="radio" name="theme" value="${v}" class="peer sr-only" data-change="settings:set" ${s.theme === v ? 'checked' : ''} />
                  <span class="flex flex-col items-center gap-1.5 rounded-xl p-3 text-sm ring-1 ring-slate-200 transition peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-checked:ring-2 peer-checked:ring-indigo-500 peer-focus-visible:ring-2 hover:bg-slate-50 dark:ring-slate-700 dark:peer-checked:bg-indigo-500/10 dark:peer-checked:text-indigo-300 dark:hover:bg-slate-800">${icon(i, 'size-5')}${l}</span>
                </label>`
                )
                .join('')}
            </div>
          </fieldset>`
        )}

        ${section(
          'focus',
          'Focus timer',
          'Pomodoro durations and behaviour.',
          `<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            ${numberField('focusMinutes', 'Focus', 1, 180)}
            ${numberField('shortBreakMinutes', 'Short break', 1, 60)}
            ${numberField('longBreakMinutes', 'Long break', 1, 90)}
            ${numberField('longBreakEvery', 'Long break every', 1, 12, 'sessions')}
            ${numberField('dailyFocusGoalMinutes', 'Daily focus goal', 10, 960)}
          </div>
          <div class="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            ${toggle('autoStartBreaks', 'Auto-start breaks', 'Start the break as soon as a focus session ends.')}
            ${toggle('autoStartFocus', 'Auto-start focus', 'Start the next focus session when a break ends.')}
            <div class="flex items-center justify-between gap-4">
              <div class="flex-1">${toggle('soundEnabled', 'Sound', 'Play a chime when a session or reminder ends.')}</div>
              <button type="button" class="btn btn-secondary btn-sm" data-action="settings:sound-test">Test</button>
            </div>
          </div>`
        )}

        ${section(
          'notifications',
          'Notifications',
          'System notifications for reminders and timer events (while LifeOS is open or installed).',
          `<div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-slate-600 dark:text-slate-300">${notificationStatus()}</p>
            <div class="flex gap-2">
              ${
                notifOn
                  ? `<button type="button" class="btn btn-secondary btn-sm" data-action="settings:notify-test">Send test</button>
                     <button type="button" class="btn btn-secondary btn-sm" data-action="settings:notify-disable">Turn off</button>`
                  : notificationsSupported() && Notification.permission !== 'denied'
                    ? `<button type="button" class="btn btn-primary btn-sm" data-action="settings:notify-enable">${icon('bell', 'size-3.5')} Enable</button>`
                    : ''
              }
            </div>
          </div>`
        )}

        ${section('account', 'Account & sync', user ? '' : 'Create an account to back up your data to Google Sheets and use LifeOS on all your devices.', accountSection(user))}

        ${section(
          'data',
          'Your data',
          user ? 'Stored on this device and synced to your account.' : 'Everything is stored in this browser only. Export regularly.',
          `<dl class="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            ${counts.map(([c, n]) => `<div class="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50"><dt class="text-xs text-slate-500 capitalize dark:text-slate-400">${c}</dt><dd class="font-semibold text-slate-900 tabular dark:text-white">${n}</dd></div>`).join('')}
          </dl>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-secondary" data-action="settings:export">${icon('download', 'size-4')} Export JSON</button>
            <button type="button" class="btn btn-secondary" data-action="settings:import">${icon('upload', 'size-4')} Import JSON</button>
            <input id="import-file" type="file" accept="application/json,.json" class="hidden" data-change="settings:import-file" />
            <button type="button" class="btn btn-secondary" data-action="settings:sample">${icon('sparkle', 'size-4')} Add example data</button>
            <button type="button" class="btn btn-danger ml-auto" data-action="settings:clear">${icon('trash', 'size-4')} Delete all data</button>
          </div>`
        )}

        ${section(
          'app',
          'App',
          '',
          `<div class="flex flex-wrap items-center gap-2">
            ${canInstall() ? `<button type="button" class="btn btn-primary" data-action="settings:install">${icon('download', 'size-4')} Install LifeOS</button>` : isStandalone() ? '<span class="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Installed</span>' : '<span class="text-sm text-slate-500 dark:text-slate-400">To install, use your browser menu → “Install app” / “Add to Home Screen”.</span>'}
            <button type="button" class="btn btn-secondary" data-action="settings:shortcuts">${icon('keyboard', 'size-4')} Keyboard shortcuts</button>
          </div>
          <p class="mt-4 text-xs text-slate-400">LifeOS v${APP_VERSION} · HTML, Tailwind CSS & vanilla JavaScript · data stays yours.</p>`
        )}
      </div>`;
  },
  mount(root, params) {
    const sectionId = params.query.get('section');
    if (sectionId) requestAnimationFrame(() => document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth' }));
    const offSync = bus.on('sync:status', () => {
      const el = root.querySelector('[data-sync-status]');
      if (el) el.innerHTML = syncStatusHtml();
    });
    const offInstall = bus.on('pwa:installable', rerender);
    return () => {
      offSync();
      offInstall();
    };
  },
};
