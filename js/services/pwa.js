// Service worker registration, update prompt and install prompt.

import { bus } from '../core/events.js';
import { toast } from '../ui/toast.js';

let deferredPrompt = null;

export const canInstall = () => Boolean(deferredPrompt);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  bus.emit('pwa:installable', false);
  return outcome === 'accepted';
}

export function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    bus.emit('pwa:installable', true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    bus.emit('pwa:installable', false);
    toast('LifeOS installed', { type: 'success' });
  });

  const params = new URLSearchParams(location.search);
  if (!('serviceWorker' in navigator) || params.has('nosw')) return;

  // Only reload on controller change when updating, not on the very first install.
  const hadController = Boolean(navigator.serviceWorker.controller);
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const offerUpdate = (worker) =>
        toast('A new version of LifeOS is available.', {
          duration: 0,
          actionLabel: 'Reload',
          onAction: () => worker.postMessage('SKIP_WAITING'),
        });
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !hadController) return;
        reloading = true;
        location.reload();
      });
    } catch (err) {
      console.warn('[pwa] service worker registration failed', err);
    }
  });
}
