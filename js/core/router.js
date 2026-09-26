// Hash router with a tiny view lifecycle.
// A view is { title, render(params) => html, mount?(root, params) => cleanup }.
// refresh() re-renders the current view while preserving scroll and focus.

const routes = [];
let current = null; // { view, params, path, cleanup }
let refreshQueued = false;
let forceQueued = false;
const navListeners = new Set();

export function defineRoute(pattern, view) {
  // "/goals/:id" -> /^\/goals\/([^/]+)$/
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/\/:([a-zA-Z]+)/g, (_, key) => {
        keys.push(key);
        return '/([^/]+)';
      }) +
      '/?$'
  );
  routes.push({ pattern, regex, keys, view });
}

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(query) };
}

function resolve(path) {
  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.keys.forEach((k, i) => (params[k] = match[i + 1]));
      return { route, params };
    }
  }
  return null;
}

function main() {
  return document.getElementById('main');
}

function render({ preserve = false } = {}) {
  const { path, query } = parseHash();
  const resolved = resolve(path) || resolve('/');
  if (!resolved) return;
  const { route, params } = resolved;
  params.query = query;
  const root = main();

  // Snapshot focus + scroll so a refresh does not disturb the user.
  const active = document.activeElement;
  const focusId = preserve && active && root.contains(active) ? active.id : null;
  const selection =
    focusId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  // Keep whatever the user is typing in the focused field.
  const typedValue =
    focusId && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|url|email|number|password|tel)$/.test(active.type)))
      ? active.value
      : null;
  const scrollY = window.scrollY;

  if (current?.cleanup) {
    try {
      current.cleanup();
    } catch (err) {
      console.error(err);
    }
  }

  let html;
  try {
    html = route.view.render(params);
  } catch (err) {
    console.error('[router] render failed', err);
    html = `<div class="card p-6 text-sm text-rose-600">Something went wrong while rendering this page. ${err.message}</div>`;
  }
  root.innerHTML = html;

  let cleanup = null;
  try {
    cleanup = route.view.mount?.(root, params) || null;
  } catch (err) {
    console.error('[router] mount failed', err);
  }

  const pathChanged = current?.path !== path;
  current = { view: route.view, params, path, cleanup };

  const title = typeof route.view.title === 'function' ? route.view.title(params) : route.view.title;
  document.title = title ? `${title} · LifeOS` : 'LifeOS';

  if (preserve) {
    window.scrollTo(0, scrollY);
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        if (typedValue !== null && 'value' in el) el.value = typedValue;
        el.focus({ preventScroll: true });
        if (selection && typeof el.setSelectionRange === 'function') {
          try {
            el.setSelectionRange(...selection);
          } catch {
            /* not all inputs support selection */
          }
        }
      }
    }
  } else if (pathChanged) {
    window.scrollTo(0, 0);
  }

  if (!preserve) navListeners.forEach((fn) => fn({ path, params, title }));
}

export const router = {
  start() {
    window.addEventListener('hashchange', () => render());
    render();
  },
  navigate(path) {
    const target = path.startsWith('#') ? path : `#${path}`;
    if (location.hash === target) render();
    else location.hash = target;
  },
  /** Re-render the current view on the next frame (batched). */
  refresh({ force = false } = {}) {
    if (force) forceQueued = true;
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      const forced = forceQueued;
      forceQueued = false;
      if (current?.view.autoRefresh === false && !forced) return;
      render({ preserve: true });
    });
  },
  get path() {
    return parseHash().path;
  },
  onNavigate(fn) {
    navListeners.add(fn);
    return () => navListeners.delete(fn);
  },
};
