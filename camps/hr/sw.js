// Offline support for the survey form only (/hr/survey): keeps the page and the scripts / styles it needs so it opens with no signal.
// It never touches the API (the form data and drafts are kept by hr/survey.js in localStorage) and passes every other request through.
const CACHE = 'hr-survey-v1';
const kind = (req, url) => {
  if (req.method !== 'GET') return '';
  if (url.origin === self.location.origin) {
    if (/^\/hr\/survey(\.html)?\/?$/.test(url.pathname)) return 'page';
    if (/^\/(hr|assets|icons)\//.test(url.pathname) && /\.(js|css|png|svg|ico)$/.test(url.pathname) && !/\/sw\.js$/.test(url.pathname)) return 'asset';
    return '';
  }
  return url.hostname === 'cdn.auth0.com' ? 'asset' : '';
};
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch('/hr/survey', { cache: 'no-cache' }); if (!res.ok) throw new Error('page');
      await cache.put('/hr/survey', res.clone());
      // the page's own scripts and styles, so the very first visit is already enough to work offline later
      const refs = [...(await res.text()).matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((m) => m[1]);
      await Promise.all(refs.map((u) => /^https?:\/\/(?!cdn\.auth0\.com)/.test(u) || /fonts\.googleapis/.test(u) ? null : cache.add(new Request(u, /^https?:/.test(u) ? { mode: 'no-cors' } : {})).catch(() => {})));
    } catch (err) { /* offline install: a later visit fills the cache */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith('hr-survey-') && k !== CACHE) await caches.delete(k); await self.clients.claim(); })());
});
async function networkFirst(req, ms) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms))]);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: req.mode === 'navigate' })) || (req.mode === 'navigate' ? await cache.match('/hr/survey') : null);
    if (hit) return hit; throw err;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CACHE), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res;
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url), k = kind(e.request, url);
  if (!k) return;
  if (k === 'page') e.respondWith(networkFirst(e.request, 4000));
  else e.respondWith(url.search.includes('v=') || url.hostname === 'cdn.auth0.com' ? cacheFirst(e.request) : networkFirst(e.request, 4000));
});
