// Lightweight HTML charts (no library). Single-series bars: thin marks, 4px
// rounded data ends, recessive grid, hover tooltip per bar and a table view.

import { esc } from '../../core/utils.js';

/**
 * Vertical bar chart.
 * data: [{ label, value, tip }]   label = x-axis text, tip = tooltip text
 */
export function barChart(data, { color = '#6366f1', height = 160, format = (v) => v, title = 'Chart', labelEvery = 1 } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const peakIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  const bars = data
    .map((d, i) => {
      const h = d.value ? Math.max(2, (d.value / nice) * 100) : 0;
      const showLabel = i % labelEvery === 0 || i === data.length - 1;
      return `
        <div class="group relative flex h-full min-w-0 flex-1 flex-col justify-end" role="listitem" aria-label="${esc(d.tip || `${d.label}: ${format(d.value)}`)}" tabindex="0">
          <div class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow group-hover:block group-focus:block dark:bg-slate-700">${esc(d.tip || `${d.label}: ${format(d.value)}`)}</div>
          ${i === peakIndex && d.value ? `<span class="mb-0.5 text-center text-[10px] text-slate-500 tabular dark:text-slate-400">${esc(format(d.value))}</span>` : ''}
          <div class="mx-auto w-full max-w-7 rounded-t-[4px] transition-opacity group-hover:opacity-80" style="height:${h}%;background:${color}"></div>
          <span class="absolute top-full mt-1 w-full truncate text-center text-[10px] text-slate-400">${showLabel ? esc(d.label) : ''}</span>
        </div>`;
    })
    .join('');

  return `
    <figure>
      <div class="relative" style="height:${height}px">
        <div class="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
          ${[nice, nice / 2, 0].map((v) => `<div class="flex items-center gap-2 border-t border-dashed border-slate-100 dark:border-slate-800"><span class="-mt-3 text-[10px] text-slate-400 tabular">${esc(format(v))}</span></div>`).join('')}
        </div>
        <div class="absolute inset-0 top-3 ml-8 flex items-end gap-[2px]" role="list" aria-label="${esc(title)}">${bars}</div>
      </div>
      <div class="h-6"></div>
      <details class="mt-1 text-xs">
        <summary class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Show as table</summary>
        <table class="mt-2 w-full text-left">
          <thead><tr class="text-slate-500"><th class="py-1 font-medium">Day</th><th class="py-1 text-right font-medium">Value</th></tr></thead>
          <tbody>${data.map((d) => `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-1">${esc(d.tip ? d.tip.split(':')[0] : d.label)}</td><td class="py-1 text-right tabular">${esc(format(d.value))}</td></tr>`).join('')}</tbody>
        </table>
      </details>
    </figure>`;
}

/** Horizontal labelled bars (e.g. focus time per goal). rows: [{ label, value, color, display }] */
export function hBars(rows, { format = (v) => v, max: fixedMax = null } = {}) {
  const max = fixedMax || Math.max(1, ...rows.map((r) => r.value));
  return `
    <ul class="space-y-3">
      ${rows
        .map(
          (r) => `
        <li>
          <div class="mb-1 flex items-center justify-between gap-3 text-sm">
            <span class="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200"><span class="size-2.5 shrink-0 rounded-full" style="background:${r.color}"></span><span class="truncate">${esc(r.label)}</span></span>
            <span class="shrink-0 text-xs text-slate-500 tabular dark:text-slate-400">${esc(r.display ?? format(r.value))}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" title="${esc(`${r.label}: ${r.display ?? format(r.value)}`)}">
            <div class="h-full rounded-full" style="width:${(r.value / max) * 100}%;background:${r.color}"></div>
          </div>
        </li>`
        )
        .join('')}
    </ul>`;
}

function niceMax(v) {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
