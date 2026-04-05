importScripts('./version.js');

const APP_VERSION = self.APP_VERSION || 'dev';
const CACHE_NAME = `egghunt-cache-v${APP_VERSION}`;

const urlsToCache = [
    './',
    './index.html',
    './manifest.json',
    './version.js',
    './sw.js',
    './game.js',
    './data/story_flags.json',
    './data/quests.json',
    './data/npcs.json',
    './resources/phaser/phaser.min.js',
    './offline.html',
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('Opened cache with version:', APP_VERSION);
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;
    const isHtmlRequest = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html');
    const isCriticalUpdatePath = isSameOrigin && (
        url.pathname === '/' ||
        url.pathname.endsWith('/index.html') ||
        url.pathname.endsWith('/manifest.json') ||
        url.pathname.endsWith('/version.js') ||
        url.pathname.endsWith('/game.js') ||
        url.pathname.includes('/data/')
    );

    // For app shell/content files, always prefer network so reload/open picks up new versions.
    if (isCriticalUpdatePath || isHtmlRequest) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .then(function(networkResponse) {
                    if (networkResponse && networkResponse.ok && isSameOrigin) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then(function(cache) {
                            cache.put(event.request, copy);
                        });
                    }
                    return networkResponse;
                })
                .catch(function() {
                    return caches.match(event.request).then(function(cachedResponse) {
                        if (cachedResponse) return cachedResponse;
                        if (isHtmlRequest) return caches.match('./offline.html');
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
                })
        );
        return;
    }

    // For less critical assets, use cache-first for speed/offline support.
    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) return cachedResponse;
            return fetch(event.request).catch(function() {
                if (isHtmlRequest) return caches.match('./offline.html');
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});
