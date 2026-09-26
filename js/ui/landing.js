// Public homepage shown to signed-out visitors at #/.
// Links to #/signup and #/login (ui/authScreen.js).

import { CONFIG } from '../config.js';
import { setLocalMode } from '../core/session.js';
import { icon } from './icons.js';
import { progressRing, progressBar } from './components/common.js';

let listening = false;

const FEATURES = [
  ['target', 'Goals that measure themselves', 'Progress comes from the tasks and subtasks underneath — no guessing, no manual sliders.'],
  ['sparkle', 'Plain-language quick add', 'Type “Call mom tomorrow 6pm !high #family” and LifeOS fills in the date, time, priority and tag.'],
  ['star', 'Plan my day', 'Pick today’s tasks from deadlines, goal next-steps and your inbox. Missed tasks roll over.'],
  ['timer', 'Pomodoro & Focus Mode', 'A timer linked to the task you’re on, with a full-screen, distraction-free mode.'],
  ['calendar', 'Calendar', 'See deadlines and plans by month. Drag a task to another day to reschedule it.'],
  ['bell', 'Reminders', 'One-off or repeating reminders with in-app and system notifications.'],
  ['chart', 'Statistics', 'Tasks completed, focus hours, streaks, on-time rate and focus per goal.'],
  ['review', 'Daily & weekly reviews', 'Two-minute reflections with automatic summaries of what you got done.'],
];

const CHAIN = [
  ['target', 'Goal', 'The outcome you want'],
  ['layers', 'Activity', 'A project or area of work'],
  ['tasks', 'Task', 'A concrete piece of work'],
  ['list', 'Subtask', 'The small steps'],
  ['timer', 'Focus', 'Do it, one session at a time'],
  ['review', 'Review', 'Learn and plan what’s next'],
];

const FAQ = [
  ['Is LifeOS free?', 'Yes. LifeOS is a static web app and your data is stored in a Google Sheet, so there is nothing to pay for.'],
  ['Where is my data stored?', 'On your device first, so everything is instant and works offline. When you sign in, it also syncs to the Google Sheet that runs this LifeOS server. Each account only ever sees its own data.'],
  ['Is my password safe?', 'Your password never leaves your device. The app turns it into a hardened key (PBKDF2, 600,000 rounds) before sending, and the server stores only a salted hash of that key.'],
  ['Does it work offline and on my phone?', 'Yes. LifeOS works offline and can be installed on your phone or computer like an app. Changes sync when you are back online.'],
  ['Can I try it without an account?', CONFIG.allowLocalMode ? 'Yes. Choose “Try it without an account” and your data stays in this browser. You can create an account later and copy your data into it.' : 'You need an account on this server. Creating one takes a few seconds.'],
  ['Can I export my data?', 'Any time, from Settings → Your data → Export JSON. You can import it again later.'],
];

function appPreview() {
  const task = (title, meta, done = false, tone = 'border-slate-300 dark:border-slate-600') => `
    <li class="flex items-start gap-3 rounded-lg px-2 py-2">
      <span class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${done ? 'border-indigo-600 bg-indigo-600 text-white' : tone}">${done ? icon('check', 'size-2.5', { strokeWidth: 4 }) : ''}</span>
      <span class="min-w-0">
        <span class="block truncate text-[13px] ${done ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}">${title}</span>
        <span class="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">${meta}</span>
      </span>
    </li>`;
  return `
    <div class="relative" aria-hidden="true">
      <div class="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-transparent blur-2xl"></div>
      <div class="relative overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div class="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <span class="size-2.5 rounded-full bg-rose-400"></span><span class="size-2.5 rounded-full bg-amber-400"></span><span class="size-2.5 rounded-full bg-emerald-400"></span>
          <span class="ml-3 text-[11px] text-slate-400">LifeOS · Dashboard</span>
        </div>
        <div class="grid gap-4 p-4 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Monday</p>
            <p class="text-base font-bold text-slate-900 dark:text-white">Good morning, Alex</p>
            <p class="mt-3 px-2 text-[10px] font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">Today · 3</p>
            <ul>
              ${task('Learn Dependency Injection', '★ Today · High · 1/3 subtasks', false, 'border-rose-500')}
              ${task('Update CV with new skills', 'Today 5:00 PM · Medium', false, 'border-amber-500')}
              ${task('Easy 5 km run', '★ Today · repeats weekdays')}
              ${task('Read EF Core docs', 'Done 9:40 AM', true)}
            </ul>
          </div>
          <div class="space-y-3">
            <div class="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-3 text-white">
              <p class="text-[10px] font-semibold tracking-wide text-white/70 uppercase">Focus</p>
              <p class="text-3xl font-light tabular">18:42</p>
              <p class="truncate text-[11px] text-white/80">Learn Dependency Injection</p>
            </div>
            <div class="rounded-xl p-3 ring-1 ring-slate-100 dark:ring-slate-800">
              <div class="flex items-center gap-3">
                ${progressRing(42, { size: 44, stroke: 5, color: '#6366f1', textCls: 'text-[10px] font-semibold' })}
                <div class="min-w-0">
                  <p class="truncate text-[12px] font-medium text-slate-800 dark:text-slate-100">.NET Developer Job</p>
                  <p class="text-[10px] text-slate-500 dark:text-slate-400">12/28 tasks</p>
                </div>
              </div>
              <div class="mt-3 space-y-2">
                <div><p class="mb-1 text-[10px] text-slate-500 dark:text-slate-400">Half marathon</p>${progressBar(65, { color: '#10b981' })}</div>
                <div><p class="mb-1 text-[10px] text-slate-500 dark:text-slate-400">Read 12 books</p>${progressBar(30, { color: '#f59e0b' })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function breakdown() {
  const row = (depth, iconName, title, pct, color, note = '') => `
    <li class="flex items-center gap-3 py-2" style="padding-left:${depth * 1.25}rem">
      <span class="grid size-7 shrink-0 place-items-center rounded-lg" style="background:${color}1f;color:${color}">${icon(iconName, 'size-3.5')}</span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center justify-between gap-2 text-sm"><span class="truncate font-medium text-slate-800 dark:text-slate-100">${title}</span><span class="shrink-0 text-xs text-slate-500 tabular dark:text-slate-400">${pct}%</span></span>
        <span class="mt-1 block">${progressBar(pct, { color, height: 'h-1' })}</span>
        ${note ? `<span class="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">${note}</span>` : ''}
      </span>
    </li>`;
  return `
    <ul class="card p-5" aria-label="Example: a goal broken down into activities, tasks and subtasks">
      ${row(0, 'target', 'Get a .NET Developer Job', 42, '#6366f1', 'Goal · 120 days left')}
      ${row(1, 'layers', 'Learn ASP.NET Core', 58, '#6366f1', 'Activity')}
      ${row(2, 'tasks', 'Learn Dependency Injection', 33, '#8b5cf6', 'Task · 1 of 3 subtasks done')}
      ${row(2, 'tasks', 'Build a Web API project', 33, '#8b5cf6', 'Task · 2 of 6 subtasks done')}
      ${row(1, 'layers', 'Prepare job applications', 20, '#6366f1', 'Activity')}
    </ul>`;
}

function render(root) {
  const year = new Date().getFullYear();
  const cta = (label = 'Get started — it’s free', cls = '') =>
    `<a href="#/signup" class="btn btn-primary px-5 py-3 text-base ${cls}">${label} ${icon('chevron-right', 'size-4')}</a>`;
  const tryLocal = CONFIG.allowLocalMode
    ? `<button type="button" data-site="local" class="text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline dark:text-slate-300 dark:hover:text-white">or try it without an account →</button>`
    : '';

  root.innerHTML = `
    <header class="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/80">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="#/" class="flex items-center gap-2.5" aria-label="LifeOS home">
          <span class="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">${icon('logo', 'size-5', { strokeWidth: 2.5 })}</span>
          <span class="text-lg font-bold tracking-tight text-slate-900 dark:text-white">LifeOS</span>
        </a>
        <nav class="hidden items-center gap-1 md:flex" aria-label="Page sections">
          ${[['how', 'How it works'], ['features', 'Features'], ['privacy', 'Privacy'], ['faq', 'FAQ']]
            .map(([id, label]) => `<button type="button" data-site="scroll" data-target="${id}" class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">${label}</button>`)
            .join('')}
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <a href="#/login" class="btn btn-ghost px-3 py-2 text-sm font-medium">Sign in</a>
          <a href="#/signup" class="btn btn-primary">Get started</a>
        </div>
      </div>
    </header>

    <main id="landing-main" tabindex="-1" class="outline-none">
      <!-- Hero -->
      <section class="relative overflow-hidden">
        <div class="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[36rem] bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_60%)]"></div>
        <div class="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-24">
          <div>
            <p class="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20">
              ${icon('sparkle', 'size-3.5')} Free · Works offline · Your data, your Google Sheet
            </p>
            <h1 class="mt-5 text-4xl leading-[1.1] font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white">
              Turn big goals into <span class="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-400 dark:to-violet-400">today’s actions.</span>
            </h1>
            <p class="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              LifeOS connects what you want in life to what you do today: goals, tasks, a focus timer, reminders and reviews — in one calm, fast app.
            </p>
            <div class="mt-8 flex flex-wrap items-center gap-3">
              ${cta()}
              <a href="#/login" class="btn btn-secondary px-5 py-3 text-base">Sign in</a>
            </div>
            <div class="mt-4">${tryLocal}</div>
          </div>
          ${appPreview()}
        </div>
      </section>

      <!-- How it works -->
      <section id="how" class="scroll-mt-20 border-y border-slate-200/70 bg-white py-20 dark:border-slate-800/70 dark:bg-slate-900/40">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">How it works</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">From “someday” to done, one layer at a time.</h2>
            <p class="mt-3 text-slate-600 dark:text-slate-300">Most to-do apps stop at the list. LifeOS keeps the whole chain connected, so every task you tick moves a goal forward.</p>
          </div>
          <ol class="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            ${CHAIN.map(
              ([i, title, text], n) => `
              <li class="relative rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/70 sm:p-5 dark:bg-slate-900 dark:ring-slate-800">
                <span class="text-xs font-semibold text-slate-400 tabular">0${n + 1}</span>
                <span class="mt-3 grid size-10 place-items-center rounded-xl bg-indigo-600 text-white">${icon(i, 'size-5')}</span>
                <h3 class="mt-4 font-semibold text-slate-900 dark:text-white">${title}</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${text}</p>
              </li>`
            ).join('')}
          </ol>
          <div class="mt-16 grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h3 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Progress you can trust</h3>
              <p class="mt-3 text-slate-600 dark:text-slate-300">A goal’s progress is calculated from the work underneath it. Tick a subtask and you’ll see the task, the activity and the goal move — so you always know how close you really are.</p>
              <ul class="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                ${['Break any goal into activities, tasks and subtasks', 'Plan today from deadlines and each goal’s next step', 'Track focus time per task and per goal']
                  .map((t) => `<li class="flex items-start gap-3"><span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">${icon('check', 'size-3', { strokeWidth: 3 })}</span>${t}</li>`)
                  .join('')}
              </ul>
            </div>
            ${breakdown()}
          </div>
        </div>
      </section>

      <!-- Features -->
      <section id="features" class="scroll-mt-20 py-20">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Features</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Everything you need to plan, focus and follow through.</h2>
          </div>
          <div class="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            ${FEATURES.map(
              ([i, title, text]) => `
              <article class="card p-6 transition hover:-translate-y-0.5 hover:shadow-md">
                <span class="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">${icon(i, 'size-5')}</span>
                <h3 class="mt-4 font-semibold text-slate-900 dark:text-white">${title}</h3>
                <p class="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">${text}</p>
              </article>`
            ).join('')}
          </div>
        </div>
      </section>

      <!-- Privacy -->
      <section id="privacy" class="scroll-mt-20 bg-slate-900 py-20 text-white dark:bg-slate-900/60">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <div class="max-w-2xl">
            <p class="text-sm font-semibold text-indigo-300">Privacy & ownership</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight">Your life’s plan belongs to you.</h2>
          </div>
          <div class="mt-12 grid gap-6 md:grid-cols-3">
            ${[
              ['archive', 'Stored in a Google Sheet', 'Data lives in the spreadsheet behind this LifeOS server — readable, exportable, never sold.'],
              ['lock', 'Password never leaves your device', 'It’s turned into a hardened key in your browser; the server keeps only a salted hash.'],
              ['cloud-off', 'Offline first', 'Everything is saved on your device instantly and syncs when you’re online. Install it like an app.'],
            ]
              .map(
                ([i, title, text]) => `
                <div class="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                  <span class="grid size-10 place-items-center rounded-xl bg-white/10 text-indigo-300">${icon(i, 'size-5')}</span>
                  <h3 class="mt-4 font-semibold">${title}</h3>
                  <p class="mt-1.5 text-sm leading-relaxed text-slate-300">${text}</p>
                </div>`
              )
              .join('')}
          </div>
        </div>
      </section>

      <!-- FAQ -->
      <section id="faq" class="scroll-mt-20 py-20">
        <div class="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 class="text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Questions & answers</h2>
          <div class="mt-10 divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-200 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            ${FAQ.map(
              ([q, a]) => `
              <details class="group px-5 py-4">
                <summary class="flex cursor-pointer items-center justify-between gap-4 font-medium text-slate-900 dark:text-white">${q}<span class="chev text-slate-400 transition">${icon('chevron-down', 'size-5')}</span></summary>
                <p class="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">${a}</p>
              </details>`
            ).join('')}
          </div>
        </div>
      </section>

      <!-- Final CTA -->
      <section class="px-4 pb-20 sm:px-6">
        <div class="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 px-6 py-14 text-center text-white sm:px-12">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">Start with one goal that matters.</h2>
          <p class="mx-auto mt-3 max-w-xl text-indigo-100">Create your account in seconds. LifeOS will tell you what to do today.</p>
          <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="#/signup" class="btn bg-white px-5 py-3 text-base text-indigo-700 hover:bg-indigo-50">Create free account ${icon('chevron-right', 'size-4')}</a>
            <a href="#/login" class="btn bg-white/15 px-5 py-3 text-base text-white hover:bg-white/25">Sign in</a>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-slate-200 py-8 dark:border-slate-800">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-slate-500 sm:px-6 dark:text-slate-400">
        <p class="flex items-center gap-2"><span class="grid size-6 place-items-center rounded-md bg-indigo-600 text-white">${icon('logo', 'size-3.5', { strokeWidth: 2.5 })}</span> © ${year} LifeOS</p>
        <nav class="flex gap-4" aria-label="Footer">
          <a href="#/login" class="hover:text-slate-900 dark:hover:text-white">Sign in</a>
          <a href="#/signup" class="hover:text-slate-900 dark:hover:text-white">Create account</a>
          ${CONFIG.allowLocalMode ? '<button type="button" data-site="local" class="hover:text-slate-900 dark:hover:text-white">Use without account</button>' : ''}
        </nav>
      </div>
    </footer>`;
}

export function showLanding() {
  const root = document.getElementById('landing-root');
  document.title = 'LifeOS — Turn big goals into today’s actions';
  render(root);
  if (listening) return;
  listening = true;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-site]');
    if (!btn) return;
    if (btn.dataset.site === 'scroll') {
      const target = document.getElementById(btn.dataset.target);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (btn.dataset.site === 'local') {
      setLocalMode(true);
      location.hash = '#/';
      location.reload();
    }
  });
}
