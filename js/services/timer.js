// Pomodoro engine. State is persisted with absolute timestamps (endsAt) so a
// running timer survives reloads and keeps counting while the tab is closed.
//
// Events on the bus:
//   timer:tick      once per second while running (snapshot)
//   timer:change    whenever the state changes (snapshot)
//   timer:complete  { mode, next, away } when a phase finishes

import { store } from '../core/store.js';
import { bus } from '../core/events.js';
import { nowISO } from '../core/utils.js';
import { formatClock } from '../core/dates.js';
import { logSession } from '../data/actions.js';
import { storageSuffix } from '../core/session.js';
import { notify, playChime, unlockAudio } from './notify.js';

export const TIMER_KEY = 'lifeos:timer:v1';
const KEY = TIMER_KEY + storageSuffix();

export const MODES = {
  focus: { label: 'Focus', setting: 'focusMinutes' },
  short: { label: 'Short break', setting: 'shortBreakMinutes' },
  long: { label: 'Long break', setting: 'longBreakMinutes' },
};

const minutesFor = (mode) => Math.max(1, Number(store.settings[MODES[mode].setting]) || 25);

const initialState = () => ({
  mode: 'focus',
  status: 'idle', // idle | running | paused
  duration: minutesFor('focus') * 60000,
  remaining: null,
  endsAt: null,
  startedAt: null,
  taskId: null,
  cycle: 0,
});

let state = load();
let interval = null;
let lastSecond = null;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && MODES[saved.mode]) return { ...initialState(), ...saved };
  } catch {
    /* ignore */
  }
  return initialState();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function remainingMs() {
  if (state.status === 'running') return Math.max(0, state.endsAt - Date.now());
  if (state.status === 'paused') return state.remaining;
  return state.duration;
}

function snapshot() {
  const remaining = remainingMs();
  return {
    ...state,
    remainingMs: remaining,
    clock: formatClock(remaining),
    progress: state.duration ? Math.min(1, 1 - remaining / state.duration) : 0,
    label: MODES[state.mode].label,
  };
}

function ensureInterval() {
  if (state.status === 'running' && !interval) interval = setInterval(tick, 250);
  else if (state.status !== 'running' && interval) {
    clearInterval(interval);
    interval = null;
  }
}

function tick() {
  if (state.status === 'running' && remainingMs() <= 0) {
    complete();
    return;
  }
  const second = Math.ceil(remainingMs() / 1000);
  if (second !== lastSecond) {
    lastSecond = second;
    bus.emit('timer:tick', snapshot());
  }
}

function changed() {
  save();
  ensureInterval();
  lastSecond = null;
  bus.emit('timer:change', snapshot());
  tick();
}

function setIdle(mode) {
  state = { ...state, mode, status: 'idle', duration: minutesFor(mode) * 60000, remaining: null, endsAt: null, startedAt: null };
}

/** Log an interrupted focus phase if it lasted at least one minute. */
function logPartial() {
  if (state.mode !== 'focus' || state.status === 'idle') return;
  const minutes = (state.duration - remainingMs()) / 60000;
  if (minutes >= 1) logSession({ taskId: state.taskId, startedAt: state.startedAt, minutes, completed: false });
}

function complete({ away = false } = {}) {
  const finished = state.mode;
  if (finished === 'focus') {
    const endedAt = state.endsAt ? new Date(state.endsAt).toISOString() : nowISO();
    logSession({ taskId: state.taskId, startedAt: state.startedAt, endedAt, minutes: state.duration / 60000, completed: true });
    state.cycle += 1;
  }
  const every = Math.max(1, Number(store.settings.longBreakEvery) || 4);
  const next = finished === 'focus' ? (state.cycle % every === 0 ? 'long' : 'short') : 'focus';
  setIdle(next);

  if (!away) {
    playChime();
    const title = finished === 'focus' ? 'Focus session complete' : 'Break is over';
    const body = finished === 'focus' ? `Time for a ${MODES[next].label.toLowerCase()}.` : 'Ready for the next focus session?';
    notify(title, { body, tag: 'lifeos-timer' });
  }
  bus.emit('timer:complete', { mode: finished, next, away });

  const autoStart = next === 'focus' ? store.settings.autoStartFocus : store.settings.autoStartBreaks;
  if (autoStart && !away) {
    state.startedAt = nowISO();
    state.endsAt = Date.now() + state.duration;
    state.status = 'running';
  }
  changed();
}

export const timer = {
  init() {
    if (state.status === 'running' && state.endsAt <= Date.now()) complete({ away: true });
    else if (state.status === 'idle') state.duration = minutesFor(state.mode) * 60000;
    ensureInterval();

    // Durations changed in settings: apply to an idle timer immediately.
    store.subscribe((changes) => {
      if (state.status === 'idle' && changes.some((c) => c.col === 'settings')) {
        const duration = minutesFor(state.mode) * 60000;
        if (duration !== state.duration) {
          state.duration = duration;
          changed();
        }
      }
    });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
  },

  get state() {
    return snapshot();
  },

  start() {
    unlockAudio();
    if (state.status === 'running') return;
    if (state.status === 'paused') {
      state.endsAt = Date.now() + state.remaining;
      state.remaining = null;
    } else {
      state.startedAt = nowISO();
      state.endsAt = Date.now() + state.duration;
    }
    state.status = 'running';
    changed();
  },

  pause() {
    if (state.status !== 'running') return;
    state.remaining = remainingMs();
    state.endsAt = null;
    state.status = 'paused';
    changed();
  },

  toggle() {
    if (state.status === 'running') this.pause();
    else this.start();
  },

  /** Stop and reset the current phase (partial focus time is still logged). */
  reset() {
    logPartial();
    setIdle(state.mode);
    changed();
  },

  skip() {
    logPartial();
    setIdle(state.mode === 'focus' ? 'short' : 'focus');
    changed();
  },

  setMode(mode) {
    if (!MODES[mode]) return;
    logPartial();
    setIdle(mode);
    changed();
  },

  setTask(taskId) {
    state.taskId = taskId || null;
    changed();
  },

  /** Select a task and begin a focus phase for it. */
  startForTask(taskId) {
    if (state.mode === 'focus' && state.status === 'running') {
      // Already focusing: just attribute the running session to this task.
      this.setTask(taskId);
      return;
    }
    if (state.mode !== 'focus' || state.status === 'running') {
      logPartial();
      setIdle('focus');
    }
    state.taskId = taskId || null;
    this.start();
  },
};
