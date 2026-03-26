// LLMBoard Service Worker — enables PWA installability (no offline caching needed)
// The dashboard requires a live server, so we never cache responses.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Pass all requests through to the network — no caching
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});
