// Accessible modal dialogs: focus trap, Escape to close, focus restore,
// stacked modals, and bottom-sheet presentation on small screens.

import { esc, uid } from '../core/utils.js';
import { h, FOCUSABLE } from './dom.js';
import { icon } from './icons.js';

const stack = [];
const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };

export const hasOpenModal = () => stack.length > 0;
export const closeTopModal = () => stack[stack.length - 1]?.close();

/**
 * openModal({ title, body, footer, size, onMount(el, api), onClose(result), beforeClose(result) })
 * `body`/`footer` are HTML strings. Returns { el, close(result) }.
 */
export function openModal({ title = '', body = '', footer = '', size = 'md', onMount, onClose, beforeClose, hideHeader = false }) {
  const id = `m-${uid()}`;
  const previousFocus = document.activeElement;
  const el = h(`
    <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="modal-backdrop absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" data-modal-close></div>
      <div class="modal-panel relative flex max-h-[92dvh] w-full ${SIZES[size] || SIZES.md} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-2xl dark:bg-slate-900 dark:ring-slate-800">
        ${
          hideHeader
            ? `<h2 id="${id}-title" class="sr-only">${esc(title)}</h2>`
            : `<header class="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                 <h2 id="${id}-title" class="text-base font-semibold text-slate-900 dark:text-white">${esc(title)}</h2>
                 <button type="button" class="btn-ghost btn-icon -mr-2" data-modal-close aria-label="Close dialog">${icon('x')}</button>
               </header>`
        }
        <div class="modal-body flex-1 overflow-y-auto px-5 py-4">${body}</div>
        ${footer ? `<footer class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">${footer}</footer>` : ''}
      </div>
    </div>`);

  let closed = false;
  const api = {
    el,
    close(result) {
      if (closed) return;
      if (beforeClose && beforeClose(result) === false) return;
      closed = true;
      stack.splice(stack.indexOf(api), 1);
      el.classList.add('modal-leaving');
      setTimeout(() => el.remove(), 150);
      if (!stack.length) document.body.classList.remove('overflow-hidden');
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
      onClose?.(result);
    },
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-close]')) api.close();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      api.close();
    } else if (e.key === 'Tab') {
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.getElementById('modal-root').appendChild(el);
  document.body.classList.add('overflow-hidden');
  stack.push(api);
  onMount?.(el, api);

  const autofocus = el.querySelector('[autofocus]') || el.querySelector('.modal-body ' + FOCUSABLE) || el.querySelector(FOCUSABLE);
  requestAnimationFrame(() => autofocus?.focus());
  return api;
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      size: 'sm',
      body: `<p class="text-sm text-slate-600 dark:text-slate-300">${esc(message)}</p>`,
      footer: `
        <button type="button" class="btn btn-secondary" data-modal-close>${esc(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm autofocus>${esc(confirmText)}</button>`,
      onMount(el, api) {
        el.querySelector('[data-confirm]').addEventListener('click', () => api.close(true));
      },
      onClose: (result) => resolve(result === true),
    });
  });
}
