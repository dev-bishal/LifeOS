// Central data store.
// - Collections of records persisted to localStorage.
// - Soft deletes (tombstones) so deletions can be synced.
// - Dirty tracking for the Google Sheets sync.
// - Change notifications batched per microtask.

import { uid, nowISO, debounce } from './utils.js';
import { bus } from './events.js';
import { storageSuffix } from './session.js';

export const COLLECTIONS = ['goals', 'activities', 'tasks', 'subtasks', 'sessions', 'reminders', 'reviews'];

/** Data of local-only mode; accounts use `${LOCAL_DATA_KEY}:u:<userId>`. */
export const LOCAL_DATA_KEY = 'lifeos:data:v1';
const DATA_KEY = LOCAL_DATA_KEY + storageSuffix();
const SETTINGS_KEY = 'lifeos:settings:v1';
const TOMBSTONE_TTL_DAYS = 60;

export const DEFAULT_SETTINGS = {
  name: '',
  theme: 'system', // light | dark | system
  weekStartsOn: 1, // 0 = Sunday, 1 = Monday
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
  notificationsEnabled: false,
  dailyFocusGoalMinutes: 120,
  syncUrl: '', // server URL override (see js/config.js)
  autoSync: true,
  syncIntervalMin: 5,
  onboarded: false,
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`[store] could not read ${key}`, err);
    return fallback;
  }
}

function emptyData() {
  const data = { version: 1, meta: { lastSyncAt: null, dirty: {} } };
  COLLECTIONS.forEach((c) => (data[c] = []));
  return data;
}

function normalize(input) {
  const data = emptyData();
  if (!input || typeof input !== 'object') return data;
  for (const c of COLLECTIONS) {
    data[c] = Array.isArray(input[c]) ? input[c].filter((r) => r && typeof r === 'object' && r.id) : [];
  }
  data.meta = { ...data.meta, ...(input.meta || {}) };
  if (!data.meta.dirty || typeof data.meta.dirty !== 'object') data.meta.dirty = {};
  return data;
}

function purgeTombstones(data) {
  const cutoff = Date.now() - TOMBSTONE_TTL_DAYS * 86400000;
  for (const c of COLLECTIONS) {
    const dirty = data.meta.dirty[c] || {};
    data[c] = data[c].filter((r) => !r.deletedAt || dirty[r.id] || new Date(r.deletedAt).getTime() > cutoff);
  }
}

let data = normalize(readJSON(DATA_KEY, null));
purgeTombstones(data);
let settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) };
let index = buildIndex();
let version = 0;

function buildIndex() {
  const idx = {};
  for (const c of COLLECTIONS) idx[c] = new Map(data[c].map((r) => [r.id, r]));
  return idx;
}

// ---- change notifications -------------------------------------------------

const listeners = new Set();
let pending = null;

function emit(change) {
  version++;
  if (!pending) {
    pending = [];
    queueMicrotask(() => {
      const changes = pending;
      pending = null;
      listeners.forEach((fn) => {
        try {
          fn(changes);
        } catch (err) {
          console.error('[store] listener failed', err);
        }
      });
    });
  }
  pending.push(change);
}

// ---- persistence ----------------------------------------------------------

let quotaWarned = false;
function save() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    quotaWarned = false;
  } catch (err) {
    console.error('[store] save failed', err);
    if (!quotaWarned) {
      quotaWarned = true;
      bus.emit('store:error', 'Could not save to browser storage. Export your data and free some space.');
    }
  }
}
const persist = debounce(save, 150);

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('[store] settings save failed', err);
  }
}

window.addEventListener('pagehide', () => persist.flush());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist.flush();
});

// Another tab changed the data: reload it.
window.addEventListener('storage', (e) => {
  if (e.key === DATA_KEY) {
    data = normalize(readJSON(DATA_KEY, null));
    index = buildIndex();
    emit({ col: '*', type: 'external' });
  } else if (e.key === SETTINGS_KEY) {
    settings = { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) };
    emit({ col: 'settings', type: 'external' });
  }
});

function markDirty(col, id) {
  (data.meta.dirty[col] ||= {})[id] = true;
}

function assertCollection(col) {
  if (!COLLECTIONS.includes(col)) throw new Error(`Unknown collection "${col}"`);
}

// ---- public API -----------------------------------------------------------

export const store = {
  get version() {
    return version;
  },

  /** All live (non-deleted) records of a collection. */
  all(col) {
    assertCollection(col);
    return data[col].filter((r) => !r.deletedAt);
  },

  get(col, id) {
    if (!id) return null;
    const rec = index[col]?.get(id);
    return rec && !rec.deletedAt ? rec : null;
  },

  insert(col, fields = {}) {
    assertCollection(col);
    const t = nowISO();
    const rec = { id: uid(), createdAt: t, ...fields, updatedAt: t, deletedAt: null };
    data[col].push(rec);
    index[col].set(rec.id, rec);
    markDirty(col, rec.id);
    persist();
    emit({ col, type: 'insert', id: rec.id });
    return rec;
  },

  update(col, id, patch) {
    assertCollection(col);
    const rec = index[col].get(id);
    if (!rec) return null;
    Object.assign(rec, patch, { updatedAt: nowISO() });
    markDirty(col, id);
    persist();
    emit({ col, type: 'update', id });
    return rec;
  },

  remove(col, id) {
    return this.update(col, id, { deletedAt: nowISO() });
  },

  restore(col, id) {
    return this.update(col, id, { deletedAt: null });
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // ---- settings (device-local) ----
  get settings() {
    return settings;
  },

  setSettings(patch) {
    settings = { ...settings, ...patch };
    saveSettings();
    emit({ col: 'settings', type: 'update' });
  },

  // ---- sync helpers ----
  get meta() {
    return data.meta;
  },

  setMeta(patch) {
    Object.assign(data.meta, patch);
    persist();
  },

  dirtyCount() {
    return COLLECTIONS.reduce((n, c) => n + Object.keys(data.meta.dirty[c] || {}).length, 0);
  },

  markAllDirty() {
    for (const c of COLLECTIONS) data[c].forEach((r) => markDirty(c, r.id));
    persist();
  },

  /** Records that must be pushed, plus the updatedAt of each at snapshot time. */
  dirtySnapshot() {
    const changes = {};
    const stamps = {};
    for (const c of COLLECTIONS) {
      const ids = Object.keys(data.meta.dirty[c] || {});
      changes[c] = [];
      stamps[c] = {};
      for (const id of ids) {
        const rec = index[c].get(id);
        if (!rec) {
          delete data.meta.dirty[c][id];
          continue;
        }
        changes[c].push({ ...rec });
        stamps[c][id] = rec.updatedAt;
      }
    }
    return { changes, stamps };
  },

  /** Clear dirty flags for records that were not modified since the snapshot. */
  clearDirty(stamps) {
    for (const c of COLLECTIONS) {
      for (const [id, updatedAt] of Object.entries(stamps[c] || {})) {
        if (index[c].get(id)?.updatedAt === updatedAt) delete data.meta.dirty[c]?.[id];
      }
    }
    persist();
  },

  /** Merge records coming from the server (last write wins by updatedAt). */
  applyRemote(changes) {
    let applied = 0;
    for (const c of COLLECTIONS) {
      for (const remote of changes?.[c] || []) {
        if (!remote?.id) continue;
        const local = index[c].get(remote.id);
        if (!local) {
          if (remote.deletedAt) continue;
          const rec = { ...remote };
          data[c].push(rec);
          index[c].set(rec.id, rec);
          applied++;
        } else if (String(remote.updatedAt || '') > String(local.updatedAt || '')) {
          for (const key of Object.keys(local)) delete local[key];
          Object.assign(local, remote);
          delete data.meta.dirty[c]?.[remote.id];
          applied++;
        }
      }
    }
    if (applied) {
      persist();
      emit({ col: '*', type: 'remote', count: applied });
    }
    return applied;
  },

  // ---- import / export ----
  exportData() {
    const out = { app: 'LifeOS', version: 1, exportedAt: nowISO() };
    for (const c of COLLECTIONS) out[c] = data[c].filter((r) => !r.deletedAt);
    return out;
  },

  /** Replace or merge data from an export file. Imported records are marked dirty so they sync. */
  importData(input, { mode = 'replace' } = {}) {
    const incoming = normalize(input);
    if (mode === 'replace') {
      const next = emptyData();
      next.meta.lastSyncAt = data.meta.lastSyncAt;
      // keep tombstones for current records so deletions propagate to the sheet
      for (const c of COLLECTIONS) {
        const keep = new Set(incoming[c].map((r) => r.id));
        next[c] = data[c]
          .filter((r) => !keep.has(r.id))
          .map((r) => ({ ...r, deletedAt: r.deletedAt || nowISO(), updatedAt: nowISO() }));
      }
      data = next;
    }
    index = buildIndex();
    for (const c of COLLECTIONS) {
      for (const rec of incoming[c]) {
        const existing = index[c].get(rec.id);
        const merged = { ...rec, updatedAt: nowISO() };
        if (existing) Object.assign(existing, merged);
        else data[c].push(merged);
      }
    }
    index = buildIndex();
    for (const c of COLLECTIONS) data[c].forEach((r) => markDirty(c, r.id));
    save();
    emit({ col: '*', type: 'import' });
  },

  /** Wipe local data (not the Google Sheet). */
  clearAll() {
    data = emptyData();
    index = buildIndex();
    save();
    emit({ col: '*', type: 'clear' });
  },
};
