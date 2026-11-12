// Migration: the finance app's service worker now lives at /budget/sw.js (scope /budget/).
// Browsers that still have the old root-scope worker fetch this file, which removes itself and clears old caches,
// so the camps home page and /hr/ are plain web pages (not part of the web app).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
  })());
});
