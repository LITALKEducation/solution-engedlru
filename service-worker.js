const CACHE_NAME = 'sorasukt-pwa-v2';
const ASSETS_TO_CACHE = [
    'https://solution.litalkeducation.com/engedlru/',
    'https://solution.litalkeducation.com/engedlru/index.html',
    'https://solution.litalkeducation.com/engedlru/404.html',
    'https://solution.litalkeducation.com/engedlru/budget.html',
    'https://solution.litalkeducation.com/engedlru/checkup.html',
    'https://solution.litalkeducation.com/engedlru/sys.html',
    'https://solution.litalkeducation.com/engedlru/CSS/index.css',
    'https://solution.litalkeducation.com/engedlru/CSS/system.css',
    'https://solution.litalkeducation.com/engedlru/CSS/maintenance.css',
    'https://solution.litalkeducation.com/engedlru/CSS/budget.css',
    'https://solution.litalkeducation.com/engedlru/CSS/checkup.css',
    'https://solution.litalkeducation.com/engedlru/CSS/sys.css',
    'https://solution.litalkeducation.com/engedlru/CSS/404.css',
    'https://solution.litalkeducation.com/engedlru/JavaScript/pwa.js',
    'https://solution.litalkeducation.com/engedlru/JavaScript/system.js',
    'https://solution.litalkeducation.com/engedlru/JavaScript/maintenance.js',
    'https://solution.litalkeducation.com/engedlru/JavaScript/budget.js',
    'https://solution.litalkeducation.com/engedlru/JavaScript/checkup.js',
    'https://solution.litalkeducation.com/engedlru/JavaScript/sys.js',
    'https://solution.litalkeducation.com/engedlru/vote/index.html',
    'https://solution.litalkeducation.com/engedlru/vote/CSS/index.css',
    'https://solution.litalkeducation.com/engedlru/vote/CSS/backend.css',
    'https://solution.litalkeducation.com/engedlru/vote/CSS/base44.css',
    'https://solution.litalkeducation.com/engedlru/vote/CSS/info.css',
    'https://solution.litalkeducation.com/engedlru/vote/CSS/ivote.css',
    'https://solution.litalkeducation.com/engedlru/vote/CSS/results.css',
    'https://solution.litalkeducation.com/engedlru/vote/JavaScript/index.js',
    'https://solution.litalkeducation.com/engedlru/vote/JavaScript/backend.js',
    'https://solution.litalkeducation.com/engedlru/vote/JavaScript/base44.js',
    'https://solution.litalkeducation.com/engedlru/vote/JavaScript/info.js',
    'https://solution.litalkeducation.com/engedlru/vote/JavaScript/ivote.js',
    'https://solution.litalkeducation.com/engedlru/vote/JavaScript/results.js',
    'https://solution.litalkeducation.com/engedlru/imghttps://solution.litalkeducation.com/engedlru-192.png',
    'https://solution.litalkeducation.com/engedlru/imghttps://solution.litalkeducation.com/engedlru-512.png',
    'https://solution.litalkeducation.com/engedlru/imghttps://solution.litalkeducation.com/engedlru.png',
    'https://solution.litalkeducation.com/engedlru/img/icon-192.png',
    'https://solution.litalkeducation.com/engedlru/img/icon-512.png',
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=Inter:wght@400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Cache hit - return response
            if (response) {
                return response;
            }
            return fetch(event.request);
        })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
