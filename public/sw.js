// Eden Hall service worker – app-shell caching + offline fallback.
const VERSION = 'edenhall-v1';
const SHELL = [
  './', './index.html', './admin.html', './kitchen.html', './offline.html', './manifest.webmanifest',
  './css/base.css', './css/customer.css', './css/admin.css', './css/kitchen.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './vendor/qrcode.js',
  './js/config/firebase-config.js',
  './js/core/api.js', './js/core/ui.js', './js/core/art.js', './js/core/pricing.js', './js/core/seed.js',
  './js/core/server-logic.js', './js/core/local-backend.js', './js/core/firebase-backend.js', './js/core/charts.js',
  './js/customer/app.js', './js/customer/state.js', './js/customer/menu.js', './js/customer/orders.js', './js/customer/account.js',
  './js/admin/app.js', './js/admin/views.js', './js/admin/views2.js', './js/kitchen/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache Firebase / API traffic – it must always be live.
  if (url.origin !== location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;

  if (req.mode === 'navigate') {
    // network-first for pages so staff always get the latest build
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./offline.html'))));
    return;
  }
  // stale-while-revalidate for static assets
  e.respondWith(caches.match(req).then((cached) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => cached);
    return cached || net;
  }));
});
