// LifeOS service worker.
// - Precaches the app shell so LifeOS works offline.
// - Same-origin files: network first (fresh after deploys), cache fallback.
// - CDN files (Tailwind): stale-while-revalidate.
// - Google Apps Script sync requests are never cached.
// Bump CACHE_VERSION whenever you deploy changes.

const CACHE_VERSION = 'lifeos-v1.2.0';
const TAILWIND_CDN = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './js/config.js',
  './js/core/dates.js',
  './js/core/events.js',
  './js/core/router.js',
  './js/core/session.js',
  './js/core/store.js',
  './js/core/utils.js',
  './js/data/actions.js',
  './js/data/models.js',
  './js/data/parser.js',
  './js/data/sample.js',
  './js/data/selectors.js',
  './js/main.js',
  './js/services/api.js',
  './js/services/auth.js',
  './js/services/notify.js',
  './js/services/pwa.js',
  './js/services/reminders.js',
  './js/services/sync.js',
  './js/services/timer.js',
  './js/ui/actions.js',
  './js/ui/authScreen.js',
  './js/ui/components/charts.js',
  './js/ui/components/common.js',
  './js/ui/components/focusOverlay.js',
  './js/ui/components/goalEditor.js',
  './js/ui/components/planDay.js',
  './js/ui/components/quickAdd.js',
  './js/ui/components/reminderEditor.js',
  './js/ui/components/search.js',
  './js/ui/components/taskEditor.js',
  './js/ui/components/taskItem.js',
  './js/ui/dom.js',
  './js/ui/globalActions.js',
  './js/ui/icons.js',
  './js/ui/landing.js',
  './js/ui/modal.js',
  './js/ui/publicSite.js',
  './js/ui/shell.js',
  './js/ui/shortcuts.js',
  './js/ui/theme.js',
  './js/ui/toast.js',
  './js/views/calendar.js',
  './js/views/dashboard.js',
  './js/views/focus.js',
  './js/views/goalDetail.js',
  './js/views/goals.js',
  './js/views/inbox.js',
  './js/views/review.js',
  './js/views/settings.js',
  './js/views/stats.js',
  './js/views/tasks.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(APP_SHELL);
      try {
        await cache.add(new Request(TAILWIND_CDN, { mode: 'cors' }));
      } catch {
        /* cached on first successful fetch instead */
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all.find((c) => 'focus' in c);
      if (client) return client.focus();
      return self.clients.openWindow('./');
    })()
  );
});
