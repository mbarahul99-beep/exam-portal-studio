// Service Worker for Apex Exam Portal PWA
const CACHE_NAME = 'apex-exam-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through fetch requests
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
