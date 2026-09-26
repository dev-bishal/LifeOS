// Minimal pub/sub used for non-data events (timer ticks, sync status, install prompt).

export function createEmitter() {
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event, payload) {
      listeners.get(event)?.forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[bus] ${event} listener failed`, err);
        }
      });
    },
  };
}

export const bus = createEmitter();
