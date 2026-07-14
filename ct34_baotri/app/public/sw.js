const CACHE = 'baotri-ct34-v2';
const ASSETS = ['/', '/css/style.css', '/js/app.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Xóa sạch mọi cache cũ mỗi khi có bản service worker mới, tránh giữ code cũ vĩnh viễn
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Ưu tiên lấy bản MỚI NHẤT từ mạng trước; chỉ dùng cache khi mất mạng (offline).
// Khác với cách cũ (cache trước), cách này đảm bảo mỗi lần mở app đều thấy đúng bản mới nhất.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
