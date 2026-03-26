const CACHE_NAME = 'congoswap-v2';

// Seules les images sont cachées
const STATIC_ASSETS = [
  '/assets/favicon_192.png',
  '/assets/logo_icon_512.png',
  '/assets/favicon_32.png',
];

// Installation
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activation — vider tous les anciens caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — Network First pour tout
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Images uniquement en cache
  if (url.pathname.startsWith('/assets/') && event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(response) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
    return;
  }

  // Tout le reste — toujours le réseau
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
