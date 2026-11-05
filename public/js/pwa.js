// Приложение: регистрация service worker (офлайн), кнопка «Установить», плашка «нет интернета»
import { t } from './i18n.js';

let deferred = null;
const listeners = new Set();

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });

export const canInstall = () => !!deferred;
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const onInstallChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
export async function install() {
  if (!deferred) return false;
  deferred.prompt();
  const r = await deferred.userChoice.catch(() => null);
  deferred = null;
  listeners.forEach((f) => f());
  return r && r.outcome === 'accepted';
}
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// плашка при потере связи: что работает без интернета
function offlineBar() {
  let bar = document.getElementById('offline-bar');
  if (navigator.onLine) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'offline-bar'; document.body.append(bar); }
  bar.innerHTML = `<b>${t('pwa.offline')}</b> ${t('pwa.offline.d')}`;
}
window.addEventListener('online', offlineBar);
window.addEventListener('offline', offlineBar);

export function initPwa() {
  offlineBar();
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* без офлайна сайт всё равно работает */ }); });
}
