// Service worker toi gian, chi de thoa dieu kien "installable" cua PWA.
// Khong cache API (/api/...) de tranh du lieu cu/sai phien dang nhap.
// Cac file tinh (html/css/js/icon) dung chien luoc network-first, cache lam du phong khi mat mang.
const CACHE_NAME = 'ct34-shell-v1';
const SHELL_FILES = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Khong bao gio can thiep vao API - luon lay truc tiep tu mang, khong cache
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
