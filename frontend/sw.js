const CACHE_NAME = 'congoswap-v1';
const STATIC_ASSETS = [
  '/',
  '/buy.html',
  '/sell.html',
  '/exchange.html',
  '/payment.html',
  '/contact.html',
  '/historique.html',
  '/parrainage.html',
  '/legal.html',
  '/style.css',
  '/app.js',
  '/assets/favicon_192.png',
  '/assets/logo_icon_512.png',
];

// Installation — mise en cache des assets statiques
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activation — suppression des anciens caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — strategie Network First pour les API, Cache First pour les assets
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // API — toujours le reseau
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(JSON.stringify({ error: 'Pas de connexion' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Assets statiques — cache d'abord, reseau en fallback
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // Mettre en cache les nouvelles ressources
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Page hors ligne
        return caches.match('/');
      });
    })
  );
});
