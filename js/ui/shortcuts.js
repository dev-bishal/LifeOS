// Keyboard shortcuts.

import { router } from '../core/router.js';
import { isTypingTarget } from './dom.js';
import { hasOpenModal, openModal } from './modal.js';
import { openQuickAdd } from './components/quickAdd.js';
import { openSearch } from './components/search.js';
import { openFocusMode } from './components/focusOverlay.js';
import { timer } from '../services/timer.js';

const GO = { d: '/', g: '/goals', t: '/tasks', i: '/inbox', c: '/calendar', f: '/focus', s: '/stats', r: '/review', ',': '/settings' };

export const SHORTCUTS = [
  ['N or Q', 'Quick add task'],
  ['/ or Ctrl K', 'Search'],
  ['P', 'Start / pause the focus timer'],
  ['M', 'Enter Focus Mode'],
  ['G then D', 'Go to Dashboard'],
  ['G then G', 'Go to Goals'],
  ['G then T', 'Go to Tasks'],
  ['G then I', 'Go to Inbox'],
  ['G then C', 'Go to Calendar'],
  ['G then F', 'Go to Focus'],
  ['G then S', 'Go to Statistics'],
  ['G then R', 'Go to Reviews'],
  ['?', 'Show this help'],
  ['Esc', 'Close dialog'],
];

export function showShortcuts() {
  openModal({
    title: 'Keyboard shortcuts',
    size: 'sm',
    body: `<dl class="divide-y divide-slate-100 text-sm dark:divide-slate-800">
      ${SHORTCUTS.map(
        ([keys, label]) => `<div class="flex items-center justify-between py-2"><dt class="text-slate-600 dark:text-slate-300">${label}</dt>
          <dd><kbd class="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">${keys}</kbd></dd></div>`
      ).join('')}
    </dl>`,
  });
}

export function initShortcuts() {
  let pendingG = false;
  let gTimer = null;

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!hasOpenModal()) openSearch();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || hasOpenModal()) return;
    if (document.getElementById('focus-root').firstElementChild) return;
    const key = e.key.toLowerCase();

    if (pendingG) {
      pendingG = false;
      clearTimeout(gTimer);
      if (GO[key]) {
        e.preventDefault();
        router.navigate(GO[key]);
      }
      return;
    }

    switch (key) {
      case 'n':
      case 'q':
        e.preventDefault();
        openQuickAdd();
        break;
      case '/':
        e.preventDefault();
        openSearch();
        break;
      case 'p':
        e.preventDefault();
        timer.toggle();
        break;
      case 'm':
        e.preventDefault();
        openFocusMode();
        break;
      case '?':
        e.preventDefault();
        showShortcuts();
        break;
      case 'g':
        pendingG = true;
        gTimer = setTimeout(() => (pendingG = false), 1200);
        break;
    }
  });
}
