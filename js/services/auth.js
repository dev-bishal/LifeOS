// Email + password accounts.
// The password never leaves the browser: it is stretched with PBKDF2-SHA256
// (600k iterations, salted with the normalised email) and only the derived
// key is sent. The server hashes that key again with a per-user salt + pepper.

import { store, LOCAL_DATA_KEY, COLLECTIONS } from '../core/store.js';
import { getAuth, setAuth, clearAuth, setLocalMode, storageSuffix } from '../core/session.js';
import { call } from './api.js';
import { TIMER_KEY } from './timer.js';

const PBKDF2_ITERATIONS = 600000;
const OFFER_IMPORT_KEY = 'lifeos:offerImport';
const HANDLED_PREFIX = 'lifeos:importHandled:'; // asked once per account on this device

export const MIN_PASSWORD_LENGTH = 8;
export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

export function passwordProblem(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 128) return 'Use at most 128 characters.';
  if (/^(.)\1+$/.test(password) || /^(password|12345678|qwerty)/i.test(password)) return 'That password is too easy to guess.';
  return null;
}

/** 0–4 rough strength score for the meter. */
export function passwordStrength(password) {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return passwordProblem(password) ? Math.min(score, 1) : score;
}

export async function deriveKey(email, password) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure sign-in needs HTTPS (or localhost).');
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`lifeos:v1:${normalizeEmail(email)}`), iterations: PBKDF2_ITERATIONS },
    material,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function localRecordCount() {
  try {
    const data = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || '{}');
    return COLLECTIONS.reduce((n, c) => n + (Array.isArray(data[c]) ? data[c].filter((r) => !r.deletedAt).length : 0), 0);
  } catch {
    return 0;
  }
}

function completeSignIn(res) {
  setAuth({ session: res.session, user: res.user, signedInAt: new Date().toISOString() });
  setLocalMode(false);
  // Offer to copy this device's local-only data into the account once.
  const handled = localStorage.getItem(HANDLED_PREFIX + res.user.id);
  if (localRecordCount() > 0 && !handled) localStorage.setItem(OFFER_IMPORT_KEY, '1');
  return res.user;
}

export async function signUp({ name, email, password }) {
  const passwordKey = await deriveKey(email, password);
  return completeSignIn(await call('signup', { name: name.trim(), email: normalizeEmail(email), passwordKey }, { auth: false }));
}

export async function signIn({ email, password }) {
  const passwordKey = await deriveKey(email, password);
  return completeSignIn(await call('login', { email: normalizeEmail(email), passwordKey }, { auth: false }));
}

export function requestPasswordReset(email) {
  return call('requestReset', { email: normalizeEmail(email) }, { auth: false });
}

export async function resetPassword({ email, code, password }) {
  const passwordKey = await deriveKey(email, password);
  return completeSignIn(await call('resetPassword', { email: normalizeEmail(email), code: String(code).trim(), passwordKey }, { auth: false }));
}

export async function changePassword(currentPassword, newPassword) {
  const email = getAuth().user.email;
  const [currentKey, newKey] = [await deriveKey(email, currentPassword), await deriveKey(email, newPassword)];
  return call('changePassword', { currentKey, newKey });
}

export async function updateProfile(name) {
  const res = await call('updateProfile', { name });
  setAuth({ ...getAuth(), user: res.user });
  return res.user;
}

/**
 * Sign out. The account's local copy is removed from this browser (it lives in
 * the sheet); callers should sync first and warn about unsynced changes.
 */
export async function signOut({ everywhere = false } = {}) {
  try {
    await call(everywhere ? 'logoutAll' : 'logout', {}, { timeout: 8000 });
  } catch {
    /* offline or already expired: still sign out locally */
  }
  const suffix = storageSuffix();
  if (suffix) {
    localStorage.removeItem(LOCAL_DATA_KEY + suffix);
    localStorage.removeItem(TIMER_KEY + suffix);
  }
  clearAuth();
}

/** Forget an expired session but keep the account's local data for the next sign-in. */
export function dropSession() {
  clearAuth();
}

export const shouldOfferImport = () => localStorage.getItem(OFFER_IMPORT_KEY) === '1';
export function clearOfferImport() {
  localStorage.removeItem(OFFER_IMPORT_KEY);
  const id = getAuth()?.user?.id;
  if (id) localStorage.setItem(HANDLED_PREFIX + id, '1');
}

/** Copy local-only data into the signed-in account (merged, then synced). */
export function importLocalData() {
  const data = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || '{}');
  store.importData(data, { mode: 'merge' });
  clearOfferImport();
  return localRecordCount();
}

export { localRecordCount };
