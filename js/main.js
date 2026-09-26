// LifeOS bootstrap.

import { store } from './core/store.js';
import { bus } from './core/events.js';
import { router, defineRoute } from './core/router.js';
import { getAuth, isLocalMode } from './core/session.js';
import { initTheme } from './ui/theme.js';
import { initShell } from './ui/shell.js';
import './ui/globalActions.js';
import { initShortcuts } from './ui/shortcuts.js';
import { toast } from './ui/toast.js';
import { confirmDialog } from './ui/modal.js';
import { startPublicSite } from './ui/publicSite.js';
import { openQuickAdd } from './ui/components/quickAdd.js';
import { timer } from './services/timer.js';
import { initReminders } from './services/reminders.js';
import { initSync, syncNow } from './services/sync.js';
import { initPWA } from './services/pwa.js';
import { shouldOfferImport, clearOfferImport, importLocalData, localRecordCount, dropSession } from './services/auth.js';

import dashboard from './views/dashboard.js';
import goals from './views/goals.js';
import goalDetail from './views/goalDetail.js';
import tasks from './views/tasks.js';
import inbox from './views/inbox.js';
import calendar from './views/calendar.js';
import focus from './views/focus.js';
import stats from './views/stats.js';
import review from './views/review.js';
import settings from './views/settings.js';

function startApp() {
  // Signed-in users who open #/login or #/signup belong on the dashboard.
  if (/^#\/(login|signup|forgot)\b/.test(location.hash)) history.replaceState(null, '', '#/');

  defineRoute('/', dashboard);
  defineRoute('/goals', goals);
  defineRoute('/goals/:id', goalDetail);
  defineRoute('/tasks', tasks);
  defineRoute('/inbox', inbox);
  defineRoute('/calendar', calendar);
  defineRoute('/focus', focus);
  defineRoute('/stats', stats);
  defineRoute('/review', review);
  defineRoute('/settings', settings);

  initShell();
  timer.init();

  store.subscribe(() => router.refresh());
  bus.on('timer:change', () => router.refresh());
  bus.on('store:error', (message) => toast(message, { type: 'error', duration: 0 }));
  bus.on('timer:complete', ({ mode, away }) => {
    if (mode === 'focus') {
      toast(away ? 'A focus session finished while you were away — logged.' : 'Focus session complete. Take a break!', { type: 'success', duration: 8000 });
    } else if (!away) {
      toast('Break over — ready to focus?', { type: 'info', duration: 8000 });
    }
  });

  // The server rejected our session (expired, password changed elsewhere…).
  // Local data stays on this device and syncs again after signing back in.
  let expiredShown = false;
  bus.on('auth:expired', () => {
    if (expiredShown) return;
    expiredShown = true;
    toast('Your session has expired. Sign in again to keep syncing.', {
      type: 'error',
      duration: 0,
      actionLabel: 'Sign in',
      onAction: () => {
        dropSession();
        location.reload();
      },
    });
  });

  router.start();
  initShortcuts();
  initReminders();
  initSync();

  // Reveal the app once the first view is rendered.
  requestAnimationFrame(() => document.body.classList.add('ready'));

  // Manifest shortcut: ?action=quickadd
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'quickadd') setTimeout(() => openQuickAdd(), 300);

  // First sign-in on a device that already has local-only data.
  if (getAuth() && shouldOfferImport()) {
    setTimeout(async () => {
      const count = localRecordCount();
      const ok = await confirmDialog({
        title: 'Bring your local data?',
        message: `This browser has ${count} items you created without an account. Copy them into your account so they sync to your other devices?`,
        confirmText: 'Copy to my account',
        cancelText: 'Not now',
      });
      if (!ok) return clearOfferImport();
      importLocalData();
      toast(`Copied ${count} items to your account`, { type: 'success' });
      syncNow().catch(() => {});
    }, 800);
  }
}

// The skip link moves focus instead of changing the URL hash (hashes are routes).
document.querySelector('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  const target = ['main', 'landing-main', 'auth-main'].map((id) => document.getElementById(id)).find((el) => el && el.offsetParent !== null);
  target?.focus();
});

initTheme();
initPWA();

if (getAuth() || isLocalMode()) startApp();
else {
  startPublicSite();
  document.body.classList.add('ready');
}
