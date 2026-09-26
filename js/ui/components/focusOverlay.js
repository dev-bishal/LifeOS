// Full-screen, distraction-free Focus Mode.

import { store } from '../../core/store.js';
import { bus } from '../../core/events.js';
import { esc } from '../../core/utils.js';
import { colorHex } from '../../data/models.js';
import { subtasksOf } from '../../data/selectors.js';
import { toggleSubtask, toggleTask } from '../../data/actions.js';
import { timer } from '../../services/timer.js';
import { icon } from '../icons.js';
import { h } from '../dom.js';
import { toast } from '../toast.js';

const SIZE = 300;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function taskBlock(t) {
  const task = t.taskId ? store.get('tasks', t.taskId) : null;
  if (!task) {
    return `<p class="text-sm text-slate-400">No task selected — just focus.</p>`;
  }
  const goal = task.goalId ? store.get('goals', task.goalId) : null;
  const subs = subtasksOf(task.id);
  return `
    ${goal ? `<p class="mb-1 inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-slate-400 uppercase"><span class="size-2 rounded-full" style="background:${colorHex(goal.color)}"></span>${esc(goal.title)}</p>` : ''}
    <p class="text-xl font-semibold sm:text-2xl">${esc(task.title)}</p>
    ${
      subs.length
        ? `<ul class="mx-auto mt-5 max-w-sm space-y-1 text-left">
            ${subs
              .map(
                (s) => `
              <li>
                <button type="button" data-fm="subtask" data-id="${s.id}" class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5">
                  <span class="task-check size-[18px] ${s.done ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-500 text-slate-400'}" aria-hidden="true">${icon('check', 'size-3', { strokeWidth: 3.5 })}</span>
                  <span class="${s.done ? 'text-slate-500 line-through' : 'text-slate-200'}">${esc(s.title)}</span>
                </button>
              </li>`
              )
              .join('')}
          </ul>`
        : ''
    }
    ${task.status !== 'done' ? `<button type="button" data-fm="complete" class="mt-5 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-400/10">${icon('check', 'size-4')} Mark task complete</button>` : `<p class="mt-5 text-sm text-emerald-300">Task completed</p>`}`;
}

function render(t) {
  const color = t.mode === 'focus' ? '#818cf8' : '#34d399';
  const running = t.status === 'running';
  return `
    <div class="flex items-center justify-between px-5 py-4">
      <span class="inline-flex items-center gap-2 text-sm font-medium text-slate-300">${icon(t.mode === 'focus' ? 'zap' : 'coffee', 'size-4')} ${t.label}</span>
      <div class="flex items-center gap-1">
        <button type="button" data-fm="fullscreen" class="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Toggle full screen">${icon('maximize')}</button>
        <button type="button" data-fm="exit" class="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Exit focus mode">${icon('x')}</button>
      </div>
    </div>
    <div class="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-10 text-center">
      <div class="relative grid place-items-center" style="width:min(${SIZE}px,75vw);aspect-ratio:1">
        <svg viewBox="0 0 ${SIZE} ${SIZE}" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
          <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${STROKE}"/>
          <circle data-fm-ring cx="${SIZE / 2}" cy="${SIZE / 2}" r="${R}" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round"
            stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - t.progress)).toFixed(2)}" class="ring-progress"/>
        </svg>
        <div>
          <p data-fm-clock class="text-6xl font-light tracking-tight tabular sm:text-7xl" role="timer" aria-live="off">${t.clock}</p>
          <p class="mt-1 text-sm text-slate-400">${t.status === 'paused' ? 'Paused' : running ? 'Stay with it' : 'Ready'}</p>
        </div>
      </div>
      <div class="mt-8 flex items-center gap-4">
        <button type="button" data-fm="reset" class="rounded-full p-3 text-slate-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-white" aria-label="Stop and reset">${icon('stop')}</button>
        <button type="button" data-fm="toggle" class="grid size-16 place-items-center rounded-full bg-white text-slate-900 shadow-lg hover:scale-105 active:scale-95 transition" aria-label="${running ? 'Pause' : 'Start'}">${icon(running ? 'pause' : 'play', 'size-7', { filled: true, strokeWidth: 0 })}</button>
        <button type="button" data-fm="skip" class="rounded-full p-3 text-slate-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-white" aria-label="Skip to next phase">${icon('skip')}</button>
      </div>
      <div class="mt-10 w-full max-w-lg" data-fm-task>${taskBlock(t)}</div>
    </div>`;
}

export function openFocusMode() {
  const root = document.getElementById('focus-root');
  if (root.firstElementChild) return;
  const previousFocus = document.activeElement;
  const el = h(`<div class="fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label="Focus mode"></div>`);
  el.innerHTML = render(timer.state);
  root.appendChild(el);
  document.body.classList.add('overflow-hidden');
  el.querySelector('[data-fm="toggle"]').focus();

  const offTick = bus.on('timer:tick', (t) => {
    const clock = el.querySelector('[data-fm-clock]');
    const ring = el.querySelector('[data-fm-ring]');
    if (clock) clock.textContent = t.clock;
    if (ring) ring.setAttribute('stroke-dashoffset', (C * (1 - t.progress)).toFixed(2));
  });
  const offChange = bus.on('timer:change', (t) => {
    el.innerHTML = render(t);
    el.querySelector('[data-fm="toggle"]')?.focus();
  });
  const offStore = store.subscribe(() => {
    const block = el.querySelector('[data-fm-task]');
    if (block) block.innerHTML = taskBlock(timer.state);
  });

  const close = () => {
    offTick();
    offChange();
    offStore();
    document.removeEventListener('keydown', onKey, true);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    el.remove();
    document.body.classList.remove('overflow-hidden');
    previousFocus?.focus?.({ preventScroll: true });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      timer.toggle();
    }
  };
  document.addEventListener('keydown', onKey, true);

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fm]');
    if (!btn) return;
    switch (btn.dataset.fm) {
      case 'toggle':
        timer.toggle();
        break;
      case 'reset':
        timer.reset();
        break;
      case 'skip':
        timer.skip();
        break;
      case 'exit':
        close();
        break;
      case 'fullscreen':
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else el.requestFullscreen?.().catch(() => toast('Full screen is not available here.'));
        break;
      case 'subtask': {
        const res = toggleSubtask(btn.dataset.id);
        if (res?.allDone) toast('All subtasks done!', { type: 'success', actionLabel: 'Complete task', onAction: () => toggleTask(res.taskId) });
        break;
      }
      case 'complete': {
        const res = toggleTask(timer.state.taskId);
        if (res?.completed) toast('Task completed — great work!', { type: 'success', actionLabel: 'Undo', onAction: res.undo });
        break;
      }
    }
  });
  return close;
}
