/* 鉴豆 Service Worker — 离线缓存 */
const VERSION = 'jiandou-v1.13.3';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/util.js',
  './js/datepick.js',
  './js/db.js',
  './js/ui.js',
  './js/charts.js',
  './js/ocr.js',
  './js/backup.js',
  './js/sync.js',
  './js/card.js',
  './js/views/home.js',
  './js/views/equip.js',
  './js/views/add.js',
  './js/views/detail.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './vendor/fonts/playfair-600.woff2',
  './vendor/fonts/playfair-700.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 只管同源（OCR 云端 API 等外部请求不拦截）

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // 缓存运行期拿到的资源（如 vendor 下的 tesseract 与语言包）
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(VERSION).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
