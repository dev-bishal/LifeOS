// Light / dark / system theme.

import { store } from '../core/store.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme(theme = store.settings.theme) {
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f172a' : '#f8fafc');
}

export function initTheme() {
  applyTheme();
  media.addEventListener('change', () => applyTheme());
  store.subscribe((changes) => {
    if (changes.some((c) => c.col === 'settings')) applyTheme();
  });
}

export function cycleTheme() {
  const order = ['light', 'dark', 'system'];
  const next = order[(order.indexOf(store.settings.theme) + 1) % order.length];
  store.setSettings({ theme: next });
  return next;
}
