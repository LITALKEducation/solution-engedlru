// เพิ่มเลขเวอร์ชันทุกครั้งที่ต้องการบังคับล้าง cache เก่าของผู้ใช้
const CACHE_NAME = 'sorasukt-pwa-v4';

const ASSETS_TO_CACHE = [
    'https://solution.litalkeducation.com/',
    'https://solution.litalkeducation.com/index.html',
    'https://solution.litalkeducation.com/404.html',
    'https://solution.litalkeducation.com/budget.html',
    'https://solution.litalkeducation.com/checkup.html',
    'https://solution.litalkeducation.com/card.html',
    'https://solution.litalkeducation.com/sys.html',
    'https://solution.litalkeducation.com/CSS/index.css',
    'https://solution.litalkeducation.com/CSS/system.css',
    'https://solution.litalkeducation.com/CSS/maintenance.css',
    'https://solution.litalkeducation.com/CSS/budget.css',
    'https://solution.litalkeducation.com/CSS/checkup.css',
    'https://solution.litalkeducation.com/CSS/card.css',
    'https://solution.litalkeducation.com/CSS/sys.css',
    'https://solution.litalkeducation.com/CSS/404.css',
    'https://solution.litalkeducation.com/CSS/brandmenu.css',
    'https://solution.litalkeducation.com/CSS/theme.css',
    'https://solution.litalkeducation.com/JavaScript/pwa.js',
    'https://solution.litalkeducation.com/JavaScript/auth.js',
    'https://solution.litalkeducation.com/JavaScript/index.js',
    'https://solution.litalkeducation.com/JavaScript/system.js',
    'https://solution.litalkeducation.com/JavaScript/maintenance.js',
    'https://solution.litalkeducation.com/JavaScript/budget.js',
    'https://solution.litalkeducation.com/JavaScript/checkup.js',
    'https://solution.litalkeducation.com/JavaScript/card.js',
    'https://solution.litalkeducation.com/JavaScript/sys.js',
    'https://solution.litalkeducation.com/vote/index.html',
    'https://solution.litalkeducation.com/vote/CSS/index.css',
    'https://solution.litalkeducation.com/vote/CSS/backend.css',
    'https://solution.litalkeducation.com/vote/CSS/base44.css',
    'https://solution.litalkeducation.com/vote/CSS/info.css',
    'https://solution.litalkeducation.com/vote/CSS/ivote.css',
    'https://solution.litalkeducation.com/vote/CSS/results.css',
    'https://solution.litalkeducation.com/vote/JavaScript/index.js',
    'https://solution.litalkeducation.com/vote/JavaScript/backend.js',
    'https://solution.litalkeducation.com/vote/JavaScript/base44.js',
    'https://solution.litalkeducation.com/vote/JavaScript/info.js',
    'https://solution.litalkeducation.com/vote/JavaScript/ivote.js',
    'https://solution.litalkeducation.com/vote/JavaScript/results.js',
    'https://solution.litalkeducation.com/img/icon-192.png',
    'https://solution.litalkeducation.com/img/icon-512.png',
    'https://solution.litalkeducation.com/img/ENGEDLOGO.PNG'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            // cache ทีละไฟล์ (ไม่ใช้ addAll) เพื่อไม่ให้ไฟล์เดียวที่พังทำให้ install ล้มทั้งหมด
            .then((cache) => Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url))))
            // ใช้ SW เวอร์ชันใหม่ทันที ไม่ต้องรอปิดแท็บเก่า
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    // ไม่แตะ request ข้ามโดเมน (เช่น cdn.auth0.com, fonts) ให้เบราว์เซอร์จัดการเอง
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Network-first: ผู้ใช้ได้ไฟล์เวอร์ชันล่าสุดเสมอเมื่อออนไลน์
    // และ fallback เป็น cache เมื่อออฟไลน์ — แก้ปัญหาหน้าเว็บค้างเวอร์ชันเก่าตลอดไป
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request))
    );
});
