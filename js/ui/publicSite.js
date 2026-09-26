// Signed-out experience: homepage at #/, sign in / sign up / reset at
// #/login, #/signup and #/forgot. Any other app URL asks the visitor to sign in.

import { showLanding } from './landing.js';
import { showAuthPage, AUTH_ROUTES } from './authScreen.js';

const MODE_BY_PATH = Object.fromEntries(Object.entries(AUTH_ROUTES).map(([mode, path]) => [path, mode]));

function route() {
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  const landing = document.getElementById('landing-root');
  const auth = document.getElementById('auth-root');

  if (path === '/') {
    auth.hidden = true;
    landing.hidden = false;
    showLanding();
  } else {
    if (!MODE_BY_PATH[path]) history.replaceState(null, '', '#/login'); // e.g. #/tasks after signing out
    landing.hidden = true;
    auth.hidden = false;
    showAuthPage(MODE_BY_PATH[path] || 'signin');
  }
  window.scrollTo(0, 0);
}

export function startPublicSite() {
  document.getElementById('app').hidden = true;
  window.addEventListener('hashchange', route);
  route();
}
