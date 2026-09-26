// Toast notifications with an optional action (e.g. Undo).

import { esc } from '../core/utils.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const TYPES = {
  info: { icon: 'info', cls: 'text-indigo-400' },
  success: { icon: 'check', cls: 'text-emerald-400' },
  error: { icon: 'alert', cls: 'text-rose-400' },
  reminder: { icon: 'bell', cls: 'text-amber-400' },
};

export function toast(message, { type = 'info', actionLabel = '', onAction = null, duration = 4500 } = {}) {
  const root = document.getElementById('toast-root');
  const t = TYPES[type] || TYPES.info;
  const el = h(`
    <div class="toast pointer-events-auto flex w-full items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10 sm:w-auto sm:min-w-80 dark:bg-slate-800" role="${type === 'error' ? 'alert' : 'status'}">
      <span class="${t.cls}">${icon(t.icon, 'size-4')}</span>
      <span class="flex-1">${esc(message)}</span>
      ${actionLabel ? `<button type="button" class="toast-action rounded-md px-2 py-1 font-semibold text-indigo-300 hover:bg-white/10">${esc(actionLabel)}</button>` : ''}
      <button type="button" class="toast-close -mr-1 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Dismiss">${icon('x', 'size-4')}</button>
    </div>`);

  let timer;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('toast-leaving');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('.toast-close').addEventListener('click', close);
  el.querySelector('.toast-action')?.addEventListener('click', () => {
    onAction?.();
    close();
  });
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => (timer = setTimeout(close, 2000)));

  root.appendChild(el);
  while (root.children.length > 4) root.firstElementChild.remove();
  if (duration) timer = setTimeout(close, duration);
  return close;
}
