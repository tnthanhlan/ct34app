// Service worker toi gian, chi de thoa dieu kien "installable" cua PWA.
// Khong cache API (/api/...) de tranh du lieu cu/sai phien dang nhap.
// CHI pre-cache nhung file it doi (icon/manifest) - KHONG pre-cache app.js/index.html/styles.css
// de tranh giu lai ban cu khi co cap nhat code (moi lan fetch van uu tien lay ban moi nhat tu mang).
const CACHE_NAME = 'ct34-shell-v2';
const SHELL_FILES = ['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

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
