// Google Sheets sync client (talks to apps-script/Code.gs as the signed-in user).
// Protocol: see DEVELOPMENT.md §3.4.

import { store } from '../core/store.js';
import { bus } from '../core/events.js';
import { debounce } from '../core/utils.js';
import { isSignedIn } from '../core/session.js';
import { call, apiUrl } from './api.js';

export const APP_VERSION = '1.2.0';

let status = { state: 'disabled', lastError: null };
let inFlight = null;
let queued = false;
let intervalId = null;

/** Sync runs for signed-in users with a reachable server configured. */
export const isConfigured = () => Boolean(apiUrl() && isSignedIn());

function setStatus(patch) {
  status = { ...status, ...patch };
  bus.emit('sync:status', getStatus());
}

export function getStatus() {
  const state = !isConfigured() ? 'disabled' : status.state === 'disabled' ? 'idle' : status.state;
  return { ...status, state, lastSyncAt: store.meta.lastSyncAt, pending: store.dirtyCount() };
}

/** Check that a server URL answers (used by the sign-in screen and settings). */
export function testConnection(url) {
  return call('ping', {}, { auth: false, url: url.trim(), timeout: 20000 });
}

export function syncNow() {
  if (!isConfigured()) {
    setStatus({ state: 'disabled' });
    return Promise.resolve({ skipped: true });
  }
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return Promise.resolve({ skipped: true });
  }
  if (inFlight) {
    queued = true;
    return inFlight;
  }
  inFlight = (async () => {
    setStatus({ state: 'syncing' });
    try {
      const { changes, stamps } = store.dirtySnapshot();
      const pushed = Object.values(changes).reduce((n, list) => n + list.length, 0);
      const res = await call('sync', { since: store.meta.lastSyncAt || '', changes });
      store.clearDirty(stamps);
      const pulled = store.applyRemote(res.changes || {});
      store.setMeta({ lastSyncAt: res.serverTime });
      setStatus({ state: 'idle', lastError: null });
      return { pushed, pulled };
    } catch (err) {
      setStatus({ state: err.code === 'NETWORK' && !navigator.onLine ? 'offline' : 'error', lastError: err.message });
      throw err;
    } finally {
      inFlight = null;
      if (queued) {
        queued = false;
        scheduleSync();
      }
    }
  })();
  return inFlight;
}

/** Push every local record and pull everything from the sheet. */
export function fullResync() {
  store.markAllDirty();
  store.setMeta({ lastSyncAt: null });
  return syncNow();
}

const scheduleSync = debounce(() => syncNow().catch(() => {}), 4000);

function restartInterval() {
  clearInterval(intervalId);
  intervalId = null;
  const minutes = Number(store.settings.syncIntervalMin) || 0;
  if (isConfigured() && store.settings.autoSync && minutes > 0) {
    intervalId = setInterval(() => syncNow().catch(() => {}), minutes * 60000);
  }
}

export function initSync() {
  setStatus({ state: isConfigured() ? 'idle' : 'disabled' });
  restartInterval();

  const configKey = () => `${apiUrl()}|${store.settings.autoSync}|${store.settings.syncIntervalMin}`;
  let lastConfig = configKey();
  store.subscribe((changes) => {
    if (changes.some((c) => c.col === 'settings') && configKey() !== lastConfig) {
      lastConfig = configKey();
      restartInterval();
      setStatus({ state: isConfigured() ? 'idle' : 'disabled', lastError: null });
    }
    const localEdit = changes.some((c) => c.col !== 'settings' && c.type !== 'remote');
    if (localEdit) {
      bus.emit('sync:status', getStatus()); // pending count changed
      if (isConfigured() && store.settings.autoSync) scheduleSync();
    }
  });

  window.addEventListener('online', () => {
    setStatus({ state: 'idle' });
    if (isConfigured() && store.settings.autoSync) syncNow().catch(() => {});
  });
  window.addEventListener('offline', () => isConfigured() && setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !isConfigured() || !store.settings.autoSync) return;
    const last = store.meta.lastSyncAt ? new Date(store.meta.lastSyncAt).getTime() : 0;
    if (Date.now() - last > 60000) syncNow().catch(() => {});
  });

  // Signed-in users always pull on start (a new device has no local data yet).
  if (isConfigured()) setTimeout(() => syncNow().catch(() => {}), store.meta.lastSyncAt ? 1500 : 200);
}
