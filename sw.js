const CACHE_NAME = 'apple-todo-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './bg.png',
  './icon.svg',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName.startsWith('apple-todo-cache-') && cacheName !== CACHE_NAME;
        }).map(cacheName => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
