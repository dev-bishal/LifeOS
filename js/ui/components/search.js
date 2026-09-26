// Global search (Ctrl/Cmd + K or "/").

import { store } from '../../core/store.js';
import { esc } from '../../core/utils.js';
import { relativeDay } from '../../core/dates.js';
import { colorHex } from '../../data/models.js';
import { search, isDone } from '../../data/selectors.js';
import { router } from '../../core/router.js';
import { openModal } from '../modal.js';
import { icon } from '../icons.js';
import { openTaskEditor } from './taskEditor.js';

function resultRow(r, i) {
  const { type, item } = r;
  let lead = '';
  let sub = '';
  if (type === 'goal') {
    lead = `<span class="grid size-7 place-items-center rounded-lg" style="background:${colorHex(item.color)}22;color:${colorHex(item.color)}">${icon('target', 'size-4')}</span>`;
    sub = `Goal${item.category ? ` · ${esc(item.category)}` : ''}`;
  } else if (type === 'activity') {
    const goal = store.get('goals', item.goalId);
    lead = `<span class="grid size-7 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">${icon('layers', 'size-4')}</span>`;
    sub = `Activity${goal ? ` · ${esc(goal.title)}` : ''}`;
  } else {
    const goal = item.goalId ? store.get('goals', item.goalId) : null;
    lead = `<span class="grid size-7 place-items-center rounded-lg ${isDone(item) ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10'}">${icon(isDone(item) ? 'check' : 'tasks', 'size-4')}</span>`;
    sub = [isDone(item) ? 'Completed' : 'Task', goal?.title, item.dueDate ? `due ${relativeDay(item.dueDate)}` : ''].filter(Boolean).map(esc).join(' · ');
  }
  return `
    <li role="option" id="sr-${i}" aria-selected="false" data-index="${i}"
      class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 aria-selected:bg-indigo-50 dark:aria-selected:bg-indigo-500/10">
      ${lead}
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-slate-900 ${type === 'task' && isDone(item) ? 'line-through opacity-60' : ''} dark:text-white">${esc(item.title)}</p>
        <p class="truncate text-xs text-slate-500 dark:text-slate-400">${sub}</p>
      </div>
    </li>`;
}

export function openSearch() {
  let results = [];
  let active = 0;

  openModal({
    title: 'Search',
    hideHeader: true,
    body: `
      <div class="-mx-5 -mt-4 flex items-center gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <span class="text-slate-400">${icon('search')}</span>
        <input id="search-input" type="search" autofocus autocomplete="off" placeholder="Search goals, activities and tasks…"
          role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list"
          class="flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" />
        <kbd class="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500 dark:bg-slate-800">Esc</kbd>
      </div>
      <ul id="search-results" role="listbox" class="-mx-2 mt-2 max-h-[55vh] space-y-0.5 overflow-y-auto"></ul>
      <p data-empty class="py-8 text-center text-sm text-slate-400">Type to search everything in LifeOS.</p>`,
    onMount(el, api) {
      const input = el.querySelector('#search-input');
      const list = el.querySelector('#search-results');
      const empty = el.querySelector('[data-empty]');

      const highlight = (i) => {
        active = Math.max(0, Math.min(results.length - 1, i));
        list.querySelectorAll('[role="option"]').forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.index) === active)));
        const current = list.querySelector(`#sr-${active}`);
        current?.scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', current ? current.id : '');
      };

      const open = (i) => {
        const r = results[i];
        if (!r) return;
        api.close();
        if (r.type === 'goal') router.navigate(`/goals/${r.item.id}`);
        else if (r.type === 'activity') router.navigate(`/goals/${r.item.goalId}`);
        else openTaskEditor(r.item.id);
      };

      input.addEventListener('input', () => {
        results = search(input.value);
        list.innerHTML = results.map(resultRow).join('');
        empty.hidden = results.length > 0;
        empty.textContent = input.value.trim() ? 'No matches.' : 'Type to search everything in LifeOS.';
        highlight(0);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') (e.preventDefault(), highlight(active + 1));
        else if (e.key === 'ArrowUp') (e.preventDefault(), highlight(active - 1));
        else if (e.key === 'Enter') (e.preventDefault(), open(active));
      });
      list.addEventListener('click', (e) => {
        const li = e.target.closest('[data-index]');
        if (li) open(Number(li.dataset.index));
      });
    },
  });
}
