// System notifications and sounds.

import { store } from '../core/store.js';

let audioCtx = null;

/** Must be called from a user gesture at least once so later chimes can play. */
export function unlockAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* audio not available */
  }
}

export function playChime() {
  if (!store.settings.soundEnabled) return;
  try {
    unlockAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    [659.25, 783.99, 1046.5].forEach((freq, i) => {
      const start = t + i * 0.18;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  } catch (err) {
    console.warn('[notify] chime failed', err);
  }
}

export const notificationsSupported = () => 'Notification' in window;

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Show a system notification when enabled and the app is not in the foreground. */
export async function notify(title, { body = '', tag, force = false } = {}) {
  if (!store.settings.notificationsEnabled || !notificationsSupported() || Notification.permission !== 'granted') return false;
  if (!force && document.visibilityState === 'visible' && document.hasFocus()) return false;
  const options = { body, tag, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch (err) {
    console.warn('[notify] notification failed', err);
    return false;
  }
}
