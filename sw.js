/**
 * RadarMarket Service Worker (PWA Offline Engine)
 * Provides instant app launching, asset caching, and offline support.
 */

const CACHE_NAME = 'radarmarket-cache-v3.8.4';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css?v=3.8.4',
  '/js/campuses.js?v=3.8.4',
  '/js/app.js?v=3.8.4',
  '/js/algorithm.js?v=3.8.4',
  '/js/api.js?v=3.8.4',
  '/js/data.js?v=3.8.4',
  '/js/radar.js?v=3.8.4',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/icon.svg'
];

// Install: Precache shell assets and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[PWA Service Worker] Precaching shell assets v3.8.0');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[PWA Service Worker] Precache warning:', err);
      });
    })
  );
});

// Activate: Delete all old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA Service Worker] Purging stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy based on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and chrome-extension / non-http requests
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. NEVER INTERCEPT OR CACHE DYNAMIC API REQUESTS (/api/*)
  // All multi-device sync, item listings, offers, and chat MUST go directly to the network!
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. HTML & Core Scripts: Network-First so updates appear instantly
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 3. Static Media & Icons: Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
