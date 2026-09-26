// HTTP client for the Apps Script backend (apps-script/Code.gs).

import { CONFIG } from '../config.js';
import { store } from '../core/store.js';
import { bus } from '../core/events.js';
import { getAuth } from '../core/session.js';

export class ApiError extends Error {
  constructor(message, code = null) {
    super(message);
    this.code = code;
  }
}

/** Server URL: per-device override from Settings, else js/config.js. */
export const apiUrl = () => String(store.settings.syncUrl || CONFIG.apiUrl || '').trim();

/**
 * POST an action to the backend.
 * @param {string} action
 * @param {object} payload
 * @param {{ auth?: boolean, url?: string, timeout?: number }} opts
 */
export async function call(action, payload = {}, { auth = true, url = apiUrl(), timeout = 45000 } = {}) {
  if (!url) throw new ApiError('No server is configured yet.', 'CONFIG');
  const body = { action, ...payload, client: `LifeOS web · ${navigator.userAgent.slice(0, 80)}` };
  if (auth) {
    const session = getAuth()?.session;
    if (!session) throw new ApiError('Please sign in first.', 'AUTH');
    body.session = session;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    // text/plain keeps this a "simple" request: Apps Script cannot answer CORS preflights.
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('The server took too long to respond.', 'NETWORK');
    throw new ApiError(navigator.onLine ? 'Could not reach the server. Check the server URL.' : 'You are offline.', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new ApiError(`Server responded with HTTP ${res.status}.`, 'NETWORK');
  let json;
  try {
    json = JSON.parse(await res.text());
  } catch {
    throw new ApiError('Unexpected response. Check that the server URL ends in /exec and access is "Anyone".', 'CONFIG');
  }
  if (!json.ok) {
    if (json.code === 'AUTH' && auth) bus.emit('auth:expired');
    throw new ApiError(json.error || 'Request failed.', json.code);
  }
  return json;
}
