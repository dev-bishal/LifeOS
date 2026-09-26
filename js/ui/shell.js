// Application chrome: desktop sidebar, top bar, mobile bottom nav + drawer,
// running-timer pill and sync indicator.

import { store } from '../core/store.js';
import { bus } from '../core/events.js';
import { router } from '../core/router.js';
import { esc, initials } from '../core/utils.js';
import { timeAgo } from '../core/dates.js';
import { currentUser } from '../core/session.js';
import { colorHex } from '../data/models.js';
import { activeGoals, inboxTasks, todayView, goalProgress } from '../data/selectors.js';
import { timer } from '../services/timer.js';
import { getStatus, syncNow, isConfigured } from '../services/sync.js';
import { registerActions } from './actions.js';
import { icon } from './icons.js';
import { cycleTheme } from './theme.js';
import { toast } from './toast.js';

export const NAV = [
  { id: 'dashboard', path: '/', label: 'Dashboard', short: 'Today', icon: 'home', bottom: true },
  { id: 'goals', path: '/goals', label: 'Goals', icon: 'target', bottom: true },
  { id: 'tasks', path: '/tasks', label: 'Tasks', icon: 'tasks', bottom: true },
  { id: 'inbox', path: '/inbox', label: 'Inbox', icon: 'inbox', bottom: true },
  { id: 'calendar', path: '/calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'focus', path: '/focus', label: 'Focus', icon: 'timer', bottom: true },
  { id: 'stats', path: '/stats', label: 'Statistics', icon: 'chart' },
  { id: 'review', path: '/review', label: 'Reviews', icon: 'review' },
  { id: 'settings', path: '/settings', label: 'Settings', icon: 'settings' },
];

const isActive = (item, path) => (item.path === '/' ? path === '/' : path === item.path || path.startsWith(`${item.path}/`));
const lastHtml = new WeakMap();

/** Only touch the DOM when markup actually changed (keeps focus + hover state). */
function patch(el, html) {
  if (!el || lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

function counts() {
  const today = todayView();
  return { inbox: inboxTasks().length, tasks: today.overdue.length + today.planned.length };
}

function badge(n, tone = 'slate') {
  if (!n) return '';
  const tones = {
    slate: 'bg-slate-200/70 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300',
    indigo: 'bg-indigo-600 text-white',
  };
  return `<span class="ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold ${tones[tone]}">${n > 99 ? '99+' : n}</span>`;
}

function navLinks(path, c) {
  return NAV.map(
    (item) => `
      <a href="#${item.path}" class="nav-link" ${isActive(item, path) ? 'aria-current="page"' : ''}>
        ${icon(item.icon, 'size-[18px]')}
        <span>${item.label}</span>
        ${item.id === 'inbox' ? badge(c.inbox) : item.id === 'tasks' ? badge(c.tasks) : ''}
      </a>`
  ).join('');
}

function goalLinks(path) {
  const goals = activeGoals().slice(0, 8);
  if (!goals.length) return '';
  return `
    <div class="mt-6 mb-1 flex items-center justify-between px-3">
      <span class="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Goals</span>
      <button type="button" class="btn-ghost rounded p-0.5" data-action="goal:new" aria-label="New goal">${icon('plus', 'size-3.5')}</button>
    </div>
    ${goals
      .map((g) => {
        const pct = goalProgress(g.id).pct;
        const current = path === `/goals/${g.id}`;
        return `
        <a href="#/goals/${g.id}" class="nav-link py-1.5" ${current ? 'aria-current="page"' : ''}>
          <span class="size-2.5 rounded-full" style="background:${colorHex(g.color)}"></span>
          <span class="truncate">${esc(g.title)}</span>
          <span class="ml-auto text-[11px] text-slate-400 tabular">${pct}%</span>
        </a>`;
      })
      .join('')}`;
}

function syncBadge() {
  const s = getStatus();
  if (s.state === 'disabled') {
    return `<a href="#/settings?section=account" class="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" title="Data is stored on this device only">${icon('cloud-off', 'size-4')}<span>Local only</span></a>`;
  }
  const map = {
    idle: { i: 'cloud', t: `Synced ${timeAgo(s.lastSyncAt)}`, c: 'text-emerald-600 dark:text-emerald-400' },
    syncing: { i: 'sync', t: 'Syncing…', c: 'text-indigo-500 [&_svg]:animate-spin' },
    error: { i: 'alert', t: 'Sync error', c: 'text-rose-500' },
    offline: { i: 'cloud-off', t: 'Offline', c: 'text-amber-500' },
  };
  const m = map[s.state] || map.idle;
  const pending = s.pending && s.state !== 'syncing' ? ` · ${s.pending} pending` : '';
  return `<button type="button" data-action="sync:now" class="flex items-center gap-2 text-xs ${m.c}" title="${esc(s.lastError || 'Sync now')}">${icon(m.i, 'size-4')}<span>${m.t}${pending}</span></button>`;
}

function themeIcon() {
  return { light: 'sun', dark: 'moon', system: 'monitor' }[store.settings.theme] || 'monitor';
}

function renderSidebar(path) {
  const c = counts();
  return `
    <div class="flex h-16 items-center gap-2.5 px-5">
      <span class="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">${icon('logo', 'size-5', { strokeWidth: 2.5 })}</span>
      <span class="text-lg font-bold tracking-tight text-slate-900 dark:text-white">LifeOS</span>
    </div>
    <div class="px-3">
      <button type="button" class="btn btn-primary w-full justify-start" data-action="quick-add">
        ${icon('plus', 'size-4')} Add task <kbd class="ml-auto rounded bg-white/20 px-1.5 text-[11px] font-medium">N</kbd>
      </button>
    </div>
    <nav class="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
      ${navLinks(path, c)}
      ${goalLinks(path)}
    </nav>
    <div class="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
      <div data-sync-badge>${syncBadge()}</div>
      <button type="button" class="btn-ghost btn-icon" data-action="theme:cycle" aria-label="Theme: ${store.settings.theme}" title="Theme: ${store.settings.theme}">${icon(themeIcon(), 'size-4')}</button>
    </div>`;
}

function timerPill() {
  const t = timer.state;
  if (t.status === 'idle') return '';
  const running = t.status === 'running';
  const tone = t.mode === 'focus' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white';
  return `
    <a href="#/focus" class="flex items-center gap-1.5 rounded-full ${running ? tone : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'} py-1 pr-3 pl-2 text-xs font-semibold shadow-sm" aria-label="${t.label} timer ${t.clock}${running ? '' : ' (paused)'}">
      ${icon(running ? (t.mode === 'focus' ? 'timer' : 'coffee') : 'pause', 'size-3.5')}
      <span class="tabular" data-timer-clock>${t.clock}</span>
    </a>`;
}

function renderTopbar(title) {
  const name = currentUser()?.name || store.settings.name;
  return `
    <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
      <button type="button" class="btn-ghost btn-icon -ml-2 lg:hidden" data-action="shell:drawer" aria-label="Open menu">${icon('menu')}</button>
      <span id="topbar-title" class="truncate text-base font-semibold text-slate-900 lg:hidden dark:text-white">${esc(title)}</span>
      <button type="button" data-action="search:open" class="hidden w-72 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-400 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 lg:flex dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-slate-700">
        ${icon('search', 'size-4')} <span>Search goals &amp; tasks…</span>
        <kbd class="ml-auto rounded bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800">Ctrl K</kbd>
      </button>
      <div class="flex-1"></div>
      <div id="timer-pill">${timerPill()}</div>
      <button type="button" class="btn-ghost btn-icon lg:hidden" data-action="search:open" aria-label="Search">${icon('search')}</button>
      <button type="button" class="btn btn-primary btn-sm hidden sm:inline-flex lg:hidden xl:inline-flex" data-action="quick-add">${icon('plus', 'size-4')} Quick add</button>
      <a href="#/settings" class="grid size-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white ring-2 ring-white dark:ring-slate-900" aria-label="Profile and settings" title="Profile & settings">${esc(initials(name))}</a>
    </div>`;
}

function renderBottomNav(path) {
  const c = counts();
  return `
    <div class="grid grid-cols-5">
      ${NAV.filter((n) => n.bottom)
        .map((item) => {
          const active = isActive(item, path);
          const count = item.id === 'inbox' ? c.inbox : 0;
          return `
          <a href="#${item.path}" class="relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}" ${active ? 'aria-current="page"' : ''}>
            ${icon(item.icon, 'size-[22px]', { strokeWidth: active ? 2.3 : 1.8 })}
            <span>${item.short || item.label}</span>
            ${count ? `<span class="absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-indigo-600 px-1 text-[10px] leading-4 text-white">${count}</span>` : ''}
          </a>`;
        })
        .join('')}
    </div>`;
}

function renderDrawer(path) {
  const c = counts();
  return `
    <div class="fixed inset-0 z-40">
      <div class="modal-backdrop absolute inset-0 bg-slate-950/50" data-action="shell:drawer-close"></div>
      <div class="drawer-panel absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="flex h-14 items-center justify-between px-4">
          <span class="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <span class="grid size-7 place-items-center rounded-lg bg-indigo-600 text-white">${icon('logo', 'size-4', { strokeWidth: 2.5 })}</span> LifeOS
          </span>
          <button type="button" class="btn-ghost btn-icon" data-action="shell:drawer-close" aria-label="Close menu">${icon('x')}</button>
        </div>
        <nav class="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">${navLinks(path, c)}${goalLinks(path)}</nav>
        <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800" style="padding-bottom:calc(0.75rem + var(--safe-bottom))">
          <div data-sync-badge>${syncBadge()}</div>
          <button type="button" class="btn-ghost btn-icon" data-action="theme:cycle" aria-label="Change theme">${icon(themeIcon(), 'size-4')}</button>
        </div>
      </div>
    </div>`;
}

let currentTitle = '';

export function updateShell() {
  const path = router.path;
  patch(document.getElementById('sidebar'), renderSidebar(path));
  patch(document.getElementById('topbar'), renderTopbar(currentTitle));
  patch(document.getElementById('bottom-nav'), renderBottomNav(path));
  const drawer = document.getElementById('drawer');
  if (!drawer.hidden) patch(drawer, renderDrawer(path));
}

function openDrawer() {
  const drawer = document.getElementById('drawer');
  drawer.hidden = false;
  patch(drawer, renderDrawer(router.path));
  drawer.querySelector('a, button')?.focus();
}

function closeDrawer() {
  const drawer = document.getElementById('drawer');
  drawer.hidden = true;
  lastHtml.delete(drawer);
  drawer.innerHTML = '';
}

export function initShell() {
  router.onNavigate(({ title }) => {
    currentTitle = title || 'LifeOS';
    closeDrawer();
    updateShell();
  });
  store.subscribe(() => updateShell());

  bus.on('timer:change', (t) => {
    patch(document.getElementById('timer-pill'), timerPill());
    if (t.status !== 'running') document.title = currentTitle ? `${currentTitle} · LifeOS` : 'LifeOS';
  });
  bus.on('timer:tick', (t) => {
    const clock = document.querySelector('[data-timer-clock]');
    if (clock) clock.textContent = t.clock;
    else patch(document.getElementById('timer-pill'), timerPill());
    if (t.status === 'running') document.title = `${t.clock} · ${t.label} — LifeOS`;
  });
  bus.on('sync:status', () => document.querySelectorAll('[data-sync-badge]').forEach((el) => patch(el, syncBadge())));
  setInterval(() => document.querySelectorAll('[data-sync-badge]').forEach((el) => patch(el, syncBadge())), 30000);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('drawer').hidden) closeDrawer();
  });

  registerActions({
    'shell:drawer': openDrawer,
    'shell:drawer-close': closeDrawer,
    'theme:cycle': () => {
      const theme = cycleTheme();
      toast(`Theme: ${theme}`, { duration: 1500 });
    },
    'sync:now': async () => {
      if (!isConfigured()) return router.navigate('/settings');
      try {
        const res = await syncNow();
        if (!res.skipped) toast(`Synced · ${res.pushed} sent, ${res.pulled} received`, { type: 'success' });
      } catch (err) {
        toast(err.message, { type: 'error', duration: 7000 });
      }
    },
  });

  updateShell();
}
