/**
 * Storm Scout Service Worker - SELF-UNREGISTERING STUB
 * v1.8.0 — Replaces the orphaned cache-first service worker from the beta era.
 * On install: activates immediately (skipWaiting).
 * On activate: deletes all SW caches and unregisters itself so the browser
 *              returns to normal network-first behaviour.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});
