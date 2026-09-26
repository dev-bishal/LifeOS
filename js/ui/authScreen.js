// Full-page sign in / create account / reset password screen.
// Shown by ui/publicSite.js at #/login, #/signup and #/forgot when nobody is
// signed in. Modes map to URLs so links and the back button work.

import { CONFIG } from '../config.js';
import { store } from '../core/store.js';
import { esc } from '../core/utils.js';
import { lastEmail, setLocalMode } from '../core/session.js';
import { apiUrl } from '../services/api.js';
import { testConnection } from '../services/sync.js';
import {
  signIn, signUp, requestPasswordReset, resetPassword, passwordProblem, passwordStrength, isValidEmail, MIN_PASSWORD_LENGTH,
} from '../services/auth.js';
import { icon } from './icons.js';

const state = {
  mode: 'signin', // signin | signup | forgot | reset
  email: lastEmail(),
  error: '',
  info: '',
  busy: false,
  server: null, // { ok, signupOpen, error }
  showServer: false,
};

let root;
let listening = false;
let serverChecked = false;

/** URL of each mode (reset is a follow-up step of forgot, so it has none). */
export const AUTH_ROUTES = { signin: '/login', signup: '/signup', forgot: '/forgot' };

function goToMode(mode) {
  const route = AUTH_ROUTES[mode];
  if (route && location.hash !== `#${route}`) location.hash = route; // publicSite re-renders
  else update({ mode, error: '', info: '' });
}

const TITLES = {
  signin: ['Welcome back', 'Sign in to continue to LifeOS.'],
  signup: ['Create your account', 'Your goals, tasks and focus — synced to every device.'],
  forgot: ['Reset your password', 'Enter your email and we will send you a 6-digit code.'],
  reset: ['Choose a new password', ''],
};

function field({ id, label, type = 'text', value = '', autocomplete, placeholder = '', extra = '', hint = '' }) {
  const isPassword = type === 'password';
  return `
    <div>
      <label for="${id}" class="label">${label}</label>
      <div class="relative">
        <input id="${id}" name="${id}" type="${type}" value="${esc(value)}" autocomplete="${autocomplete}" placeholder="${esc(placeholder)}"
          class="input py-2.5 text-base sm:text-sm ${isPassword ? 'pr-11' : ''}" ${extra} ${state.busy ? 'disabled' : ''} />
        ${
          isPassword
            ? `<button type="button" data-auth="toggle-password" data-for="${id}" class="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Show password" aria-pressed="false">${icon('eye', 'size-4')}</button>`
            : ''
        }
      </div>
      ${hint}
    </div>`;
}

function strengthMeter(id) {
  return `
    <div class="mt-2" aria-live="polite">
      <div class="flex gap-1" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<span data-strength-bar="${id}" data-i="${i}" class="h-1 flex-1 rounded-full bg-slate-200 dark:bg-slate-700"></span>`).join('')}</div>
      <p class="mt-1 text-xs text-slate-500 dark:text-slate-400" data-strength-text="${id}">At least ${MIN_PASSWORD_LENGTH} characters. Longer is stronger.</p>
    </div>`;
}

function formBody() {
  const email = field({ id: 'auth-email', label: 'Email', type: 'email', value: state.email, autocomplete: 'email', placeholder: 'you@example.com', extra: 'required inputmode="email" autocapitalize="off" spellcheck="false"' });
  switch (state.mode) {
    case 'signin':
      return `
        ${email}
        ${field({ id: 'auth-password', label: 'Password', type: 'password', autocomplete: 'current-password', extra: 'required' })}
        <div class="flex justify-end">
          <button type="button" data-auth="mode" data-mode="forgot" class="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">Forgot password?</button>
        </div>`;
    case 'signup':
      return `
        ${field({ id: 'auth-name', label: 'Your name', autocomplete: 'name', placeholder: 'e.g. Alex', extra: 'required maxlength="80"' })}
        ${email}
        ${field({ id: 'auth-password', label: 'Password', type: 'password', autocomplete: 'new-password', extra: 'required', hint: strengthMeter('auth-password') })}
        ${field({ id: 'auth-confirm', label: 'Confirm password', type: 'password', autocomplete: 'new-password', extra: 'required' })}`;
    case 'forgot':
      return email;
    case 'reset':
      return `
        <p class="text-sm text-slate-600 dark:text-slate-300">We sent a code to <b>${esc(state.email)}</b>. It expires in 15 minutes.</p>
        ${field({ id: 'auth-code', label: '6-digit code', autocomplete: 'one-time-code', placeholder: '123456', extra: 'required inputmode="numeric" maxlength="6" pattern="[0-9]{6}"' })}
        ${field({ id: 'auth-password', label: 'New password', type: 'password', autocomplete: 'new-password', extra: 'required', hint: strengthMeter('auth-password') })}
        ${field({ id: 'auth-confirm', label: 'Confirm new password', type: 'password', autocomplete: 'new-password', extra: 'required' })}`;
  }
  return '';
}

function submitLabel() {
  if (state.busy) {
    return { signin: 'Signing in…', signup: 'Creating account…', forgot: 'Sending code…', reset: 'Saving…' }[state.mode];
  }
  return { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset code', reset: 'Set new password' }[state.mode];
}

function serverPanel() {
  const needsServer = !apiUrl();
  if (CONFIG.apiUrl && !store.settings.syncUrl) return ''; // server fixed by the deployment
  if (!needsServer && !state.showServer) {
    return `<button type="button" data-auth="server-toggle" class="mt-6 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">${icon('settings', 'size-3.5')} Server settings</button>`;
  }
  return `
    <form data-auth-form="server" class="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <label for="auth-server" class="label">LifeOS server URL</label>
      <p class="mb-2 text-xs text-slate-500 dark:text-slate-400">The Google Apps Script Web App URL from <a href="apps-script/SETUP.md" target="_blank" rel="noopener" class="font-medium text-indigo-600 hover:underline dark:text-indigo-400">the setup guide</a>.</p>
      <div class="flex gap-2">
        <input id="auth-server" type="url" value="${esc(apiUrl())}" placeholder="https://script.google.com/macros/s/…/exec" class="input font-mono text-xs" spellcheck="false" autocomplete="off" />
        <button type="submit" class="btn btn-secondary btn-sm">Save</button>
      </div>
    </form>`;
}

function serverNotice() {
  if (!apiUrl()) {
    return `<div class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No server is configured yet. Add your server URL below, or continue without an account.</div>`;
  }
  if (state.server && !state.server.ok) {
    return `<div class="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">${icon('cloud-off', 'size-4 mt-0.5')}<span>Can't reach the server right now (${esc(state.server.error)}). <button type="button" data-auth="retry" class="font-semibold underline">Retry</button></span></div>`;
  }
  if (state.mode === 'signup' && state.server?.signupOpen === false) {
    return `<div class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">New sign-ups are closed on this server. Ask the owner for access.</div>`;
  }
  return '';
}

function messages() {
  return `
    ${serverNotice()}
    ${state.error ? `<div role="alert" class="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">${icon('alert', 'size-4 mt-0.5')}<span>${esc(state.error)}</span></div>` : ''}
    ${state.info ? `<div role="status" class="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">${icon('check', 'size-4 mt-0.5')}<span>${esc(state.info)}</span></div>` : ''}`.trim();
}

function submitInner() {
  return `${state.busy ? '<span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true"></span>' : ''}${submitLabel()}`;
}

/** Update messages / busy state in place so typed values are kept. */
function refreshStatus({ focusError = false } = {}) {
  const box = root.querySelector('[data-auth-messages]');
  if (box) box.innerHTML = messages();
  const submit = root.querySelector('[data-auth-submit]');
  if (submit) {
    submit.innerHTML = submitInner();
    submit.disabled = !apiUrl() || state.busy;
  }
  root.querySelectorAll('form[data-auth-form="main"] input').forEach((i) => (i.disabled = state.busy));
  if (focusError && state.error) {
    const pw = root.querySelector('#auth-password');
    if (state.mode === 'signin' && pw) {
      pw.value = '';
      pw.focus();
    } else root.querySelector('form[data-auth-form="main"] input')?.focus();
  }
}

function render() {
  const [title, subtitle] = TITLES[state.mode];
  const canSubmit = Boolean(apiUrl()) && !state.busy;

  root.innerHTML = `
    <div class="flex min-h-dvh">
      <aside class="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-12 text-white lg:flex">
        <a href="#/" class="flex w-fit items-center gap-2.5 text-lg font-bold">
          <span class="grid size-9 place-items-center rounded-xl bg-white/15">${icon('logo', 'size-5', { strokeWidth: 2.5 })}</span> LifeOS
        </a>
        <div>
          <h2 class="text-3xl leading-tight font-bold">Turn big goals into<br />today's actions.</h2>
          <ol class="mt-8 space-y-3 text-indigo-100">
            ${[
              ['target', 'Goal', 'Get a .NET Developer Job'],
              ['layers', 'Activity', 'Learn ASP.NET Core'],
              ['tasks', 'Task', 'Build a Web API project'],
              ['timer', 'Focus', '25 minutes, one thing at a time'],
              ['review', 'Review', 'What worked? What is next?'],
            ]
              .map(
                ([i, k, v]) => `<li class="flex items-center gap-3"><span class="grid size-8 place-items-center rounded-lg bg-white/10">${icon(i, 'size-4')}</span><span><span class="font-semibold text-white">${k}</span> · ${v}</span></li>`
              )
              .join('')}
          </ol>
        </div>
        <p class="text-sm text-indigo-200">Your data is stored in your own Google Sheet.</p>
        <div class="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-white/10"></div>
      </aside>

      <main id="auth-main" tabindex="-1" class="relative flex flex-1 items-center justify-center px-4 py-16 outline-none sm:px-8">
        <a href="#/" class="absolute top-5 left-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:left-8 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">${icon('arrow-left', 'size-4')} Home</a>
        <div class="w-full max-w-sm">
          <a href="#/" class="mb-8 flex w-fit items-center gap-2.5 lg:hidden">
            <span class="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white">${icon('logo', 'size-5', { strokeWidth: 2.5 })}</span>
            <span class="text-lg font-bold text-slate-900 dark:text-white">LifeOS</span>
          </a>

          ${state.mode === 'forgot' || state.mode === 'reset' ? `<button type="button" data-auth="mode" data-mode="signin" class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">${icon('arrow-left', 'size-4')} Back to sign in</button>` : ''}
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">${title}</h1>
          ${subtitle ? `<p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">${subtitle}</p>` : ''}

          ${
            state.mode === 'signin' || state.mode === 'signup'
              ? `<div class="tabs mt-6 grid w-full grid-cols-2" role="tablist" aria-label="Account">
                  <button type="button" role="tab" class="tab" aria-selected="${state.mode === 'signin'}" data-auth="mode" data-mode="signin">Sign in</button>
                  <button type="button" role="tab" class="tab" aria-selected="${state.mode === 'signup'}" data-auth="mode" data-mode="signup">Create account</button>
                </div>`
              : ''
          }

          <form data-auth-form="main" class="mt-6 space-y-4" novalidate>
            <div data-auth-messages class="space-y-3 empty:hidden">${messages()}</div>
            ${formBody()}
            <button type="submit" data-auth-submit class="btn btn-primary w-full py-2.5" ${canSubmit ? '' : 'disabled'}>${submitInner()}</button>
            ${state.mode === 'reset' ? `<p class="text-center text-sm text-slate-500 dark:text-slate-400">Didn't get it? <button type="button" data-auth="resend" class="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Send a new code</button></p>` : ''}
          </form>

          ${
            CONFIG.allowLocalMode
              ? `<div class="mt-8 border-t border-slate-200 pt-6 text-center dark:border-slate-800">
                  <button type="button" data-auth="local" class="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">Continue without an account →</button>
                  <p class="mt-1 text-xs text-slate-400">Your data stays in this browser only.</p>
                </div>`
              : ''
          }
          ${serverPanel()}
        </div>
      </main>
    </div>`;
}

function focusFirst() {
  const target =
    root.querySelector('[role="alert"]') && root.querySelector('input:not([disabled])')
      ? root.querySelector('input[type="password"]:not([disabled])') || root.querySelector('input:not([disabled])')
      : [...root.querySelectorAll('form[data-auth-form="main"] input')].find((i) => !i.value) || root.querySelector('form[data-auth-form="main"] input');
  target?.focus();
}

function update(patch, { focus = true } = {}) {
  Object.assign(state, patch);
  render();
  if (focus) focusFirst();
}

async function checkServer() {
  if (!apiUrl()) return;
  try {
    const res = await testConnection(apiUrl());
    state.server = { ok: true, signupOpen: res.signupOpen !== false };
  } catch (err) {
    state.server = { ok: false, error: err.message };
  }
  refreshStatus();
}

async function onSubmit(form) {
  const v = (id) => form.querySelector(`#${id}`)?.value ?? '';
  const email = v('auth-email').trim() || state.email;
  state.email = email;
  const fail = (error) => {
    Object.assign(state, { error, info: '' });
    refreshStatus({ focusError: true });
  };

  if (state.mode !== 'reset' && !isValidEmail(email)) return fail('Please enter a valid email address.');
  if (state.mode === 'signin' && !v('auth-password')) return fail('Please enter your password.');
  if (state.mode === 'signup' && !v('auth-name').trim()) return fail('Please enter your name.');
  if (state.mode === 'reset' && !/^\d{6}$/.test(v('auth-code').trim())) return fail('Enter the 6-digit code from the email.');
  if (state.mode === 'signup' || state.mode === 'reset') {
    const problem = passwordProblem(v('auth-password'));
    if (problem) return fail(problem);
    if (v('auth-password') !== v('auth-confirm')) return fail('The passwords do not match.');
  }

  const values = { name: v('auth-name'), password: v('auth-password'), code: v('auth-code') };
  Object.assign(state, { busy: true, error: '', info: '' });
  refreshStatus();
  try {
    if (state.mode === 'signin') await signIn({ email, password: values.password });
    else if (state.mode === 'signup') await signUp({ name: values.name, email, password: values.password });
    else if (state.mode === 'forgot') {
      const res = await requestPasswordReset(email);
      return update({ busy: false, mode: 'reset', info: res.message });
    } else await resetPassword({ email, code: values.code, password: values.password });
    // Signed in: start the app for this account.
    location.hash = '#/';
    location.reload();
  } catch (err) {
    state.busy = false;
    fail(err.message || 'Something went wrong.');
  }
}

function onStrengthInput(input) {
  const id = input.id;
  const score = passwordStrength(input.value);
  const colors = ['bg-rose-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-500'];
  root.querySelectorAll(`[data-strength-bar="${id}"]`).forEach((bar) => {
    const on = input.value && Number(bar.dataset.i) < Math.max(1, score);
    bar.className = `h-1 flex-1 rounded-full ${on ? colors[score] : 'bg-slate-200 dark:bg-slate-700'}`;
  });
  const text = root.querySelector(`[data-strength-text="${id}"]`);
  if (text) {
    const problem = input.value ? passwordProblem(input.value) : null;
    text.textContent = !input.value
      ? `At least ${MIN_PASSWORD_LENGTH} characters. Longer is stronger.`
      : problem || ['Weak', 'Weak', 'Okay', 'Strong', 'Very strong'][score];
  }
}

/** Render the sign-in page in the given mode (signin | signup | forgot). */
export function showAuthPage(mode = 'signin') {
  root = document.getElementById('auth-root');
  // Keep the reset step when the URL still says /forgot (e.g. after re-render).
  const nextMode = mode === 'forgot' && state.mode === 'reset' ? 'reset' : mode;
  if (nextMode !== state.mode) Object.assign(state, { error: '', info: '' });
  state.mode = nextMode;
  document.title = `${{ signin: 'Sign in', signup: 'Create account', forgot: 'Reset password', reset: 'Reset password' }[state.mode]} · LifeOS`;
  render();
  focusFirst();
  if (!serverChecked) {
    serverChecked = true;
    checkServer();
  }
  if (listening) return;
  listening = true;

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-auth]');
    if (!btn || state.busy) return;
    switch (btn.dataset.auth) {
      case 'mode':
        goToMode(btn.dataset.mode);
        break;
      case 'toggle-password': {
        const input = root.querySelector(`#${btn.dataset.for}`);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.innerHTML = icon(show ? 'eye-off' : 'eye', 'size-4');
        break;
      }
      case 'local':
        setLocalMode(true);
        location.hash = '#/';
        location.reload();
        break;
      case 'server-toggle':
        update({ showServer: true }, { focus: false });
        root.querySelector('#auth-server')?.focus();
        break;
      case 'retry':
        state.server = null;
        refreshStatus();
        checkServer();
        break;
      case 'resend':
        Object.assign(state, { busy: true, error: '', info: '' });
        refreshStatus();
        try {
          const res = await requestPasswordReset(state.email);
          Object.assign(state, { busy: false, info: res.message });
        } catch (err) {
          Object.assign(state, { busy: false, error: err.message });
        }
        refreshStatus();
        break;
    }
  });

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.dataset.authForm === 'server') {
      const url = form.querySelector('#auth-server').value.trim();
      store.setSettings({ syncUrl: url });
      update({ server: null, showServer: false, error: '', info: url ? 'Server saved.' : '' }, { focus: false });
      checkServer();
    } else if (!state.busy) onSubmit(form);
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'auth-password' && root.querySelector('[data-strength-bar="auth-password"]')) onStrengthInput(e.target);
    if (e.target.id === 'auth-email') state.email = e.target.value;
  });
}
