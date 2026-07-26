// Service Worker for Apex Exam Portal PWA & OpenCV.js Caching
const CACHE_NAME = 'apex-exam-v2';
const OPENCV_CACHE_NAME = 'apex-opencv-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Cache-first strategy for OpenCV.js & heavy library scripts
  if (url.includes('opencv.js') || url.includes('katex')) {
    event.respondWith(
      caches.open(OPENCV_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        const networkResponse = await fetch(event.request);
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      })
    );
    return;
  }

  // Pass through fetch requests
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
