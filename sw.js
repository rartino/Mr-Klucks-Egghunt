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
    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).catch(function() {
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('./offline.html');
                }

                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});
