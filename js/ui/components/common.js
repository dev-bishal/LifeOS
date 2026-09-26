// Small presentational building blocks shared by views.

import { esc } from '../../core/utils.js';
import { icon } from '../icons.js';

export function progressBar(pct, { color = '#6366f1', height = 'h-1.5', label = 'Progress' } = {}) {
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  return `
    <div class="w-full ${height} overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100">
      <div class="h-full rounded-full transition-[width] duration-500" style="width:${value}%;background:${color}"></div>
    </div>`;
}

export function progressRing(pct, { size = 56, stroke = 6, color = '#6366f1', text = null, textCls = 'text-sm font-semibold' } = {}) {
  const value = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return `
    <div class="relative inline-grid shrink-0 place-items-center" style="width:${size}px;height:${size}px" role="img" aria-label="${Math.round(value)}% complete">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="-rotate-90">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="stroke-slate-100 dark:stroke-slate-800"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" class="ring-progress"/>
      </svg>
      <span class="absolute ${textCls} tabular text-slate-900 dark:text-white">${text ?? `${Math.round(value)}%`}</span>
    </div>`;
}

export function emptyState({ iconName = 'sparkle', title, text = '', action = '' }) {
  return `
    <div class="flex flex-col items-center px-6 py-10 text-center">
      <span class="mb-3 grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-500 dark:bg-indigo-500/10 dark:text-indigo-400">${icon(iconName, 'size-6')}</span>
      <p class="font-semibold text-slate-900 dark:text-white">${esc(title)}</p>
      ${text ? `<p class="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">${text}</p>` : ''}
      ${action ? `<div class="mt-4">${action}</div>` : ''}
    </div>`;
}

export function pageHeader({ title, subtitle = '', actions = '' }) {
  return `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 class="page-title">${esc(title)}</h1>
        ${subtitle ? `<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">${subtitle}</p>` : ''}
      </div>
      ${actions ? `<div class="flex flex-wrap items-center gap-2">${actions}</div>` : ''}
    </div>`;
}

/** Tab strip; each tab is a button with data-action and data-value. */
export function tabs(items, active, action, label = 'Views') {
  return `
    <div class="tabs max-w-full" role="tablist" aria-label="${esc(label)}">
      ${items
        .map(
          (t) => `
        <button type="button" role="tab" class="tab" aria-selected="${t.id === active}" data-action="${action}" data-value="${t.id}">
          ${esc(t.label)}${t.count != null ? ` <span class="ml-1 text-xs text-slate-400 tabular">${t.count}</span>` : ''}
        </button>`
        )
        .join('')}
    </div>`;
}

export function statTile({ label, value, sub = '', iconName, tone = 'indigo', extra = '' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
  };
  return `
    <div class="card flex items-center gap-3 p-4">
      ${extra || `<span class="grid size-10 shrink-0 place-items-center rounded-xl ${tones[tone]}">${icon(iconName, 'size-5')}</span>`}
      <div class="min-w-0">
        <p class="text-xs font-medium text-slate-500 dark:text-slate-400">${esc(label)}</p>
        <p class="text-xl font-bold tracking-tight text-slate-900 tabular dark:text-white">${value}</p>
        ${sub ? `<p class="truncate text-xs text-slate-500 dark:text-slate-400">${sub}</p>` : ''}
      </div>
    </div>`;
}

export const goalDot = (hex, cls = 'size-2.5') => `<span class="${cls} inline-block shrink-0 rounded-full" style="background:${hex}"></span>`;
