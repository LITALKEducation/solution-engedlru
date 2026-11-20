// The student pages moved from /hr/ to /student/. Browsers that installed the old offline worker for /hr/ run this file instead:
// it deletes the old offline cache, removes itself and reloads the open pages (which /hr/* then forwards to /student/).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('hr-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) { try { await c.navigate(c.url); } catch (err) { /* the tab is gone or not controllable */ } }
})()));
