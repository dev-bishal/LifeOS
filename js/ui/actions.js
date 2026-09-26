// Global event delegation. Markup declares intent, modules register handlers:
//   <button data-action="task:toggle" data-id="…">      click
//   <form data-submit="task:quick">                     submit (default prevented)
//   <select data-change="tasks:filter">                 change
//   <input data-input="tasks:search">                   input
// Handlers receive (element, event).

const handlers = new Map();

export function registerActions(map) {
  for (const [name, fn] of Object.entries(map)) handlers.set(name, fn);
}

function run(name, el, event) {
  const fn = handlers.get(name);
  if (!fn) {
    console.warn(`[actions] no handler for "${name}"`);
    return false;
  }
  try {
    fn(el, event);
  } catch (err) {
    console.error(`[actions] "${name}" failed`, err);
  }
  return true;
}

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  event.preventDefault();
  run(el.dataset.action, el, event);
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-submit]');
  if (!form) return;
  event.preventDefault();
  run(form.dataset.submit, form, event);
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-change]');
  if (el) run(el.dataset.change, el, event);
});

document.addEventListener('input', (event) => {
  const el = event.target.closest('[data-input]');
  if (el) run(el.dataset.input, el, event);
});
