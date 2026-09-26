// Who is using this browser: a signed-in account or local-only mode.
// Kept dependency-free because the store reads it at startup to pick the
// storage namespace (each account's data is stored under its own keys).

const AUTH_KEY = 'lifeos:auth:v1';
const MODE_KEY = 'lifeos:mode';
const LAST_EMAIL_KEY = 'lifeos:lastEmail';

export function getAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY));
    return auth && typeof auth.session === 'string' && auth.user?.id ? auth : null;
  } catch {
    return null;
  }
}

export function setAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  if (auth?.user?.email) localStorage.setItem(LAST_EMAIL_KEY, auth.user.email);
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export const isSignedIn = () => Boolean(getAuth());
export const currentUser = () => getAuth()?.user || null;
export const lastEmail = () => localStorage.getItem(LAST_EMAIL_KEY) || '';

export const isLocalMode = () => localStorage.getItem(MODE_KEY) === 'local';
export function setLocalMode(on) {
  if (on) localStorage.setItem(MODE_KEY, 'local');
  else localStorage.removeItem(MODE_KEY);
}

/** Suffix for per-account storage keys ('' in local mode). */
export function storageSuffix() {
  const auth = getAuth();
  return auth ? `:u:${auth.user.id}` : '';
}
