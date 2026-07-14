// 文件：sw.js
// 职责：Service Worker，让网页能离线使用、添加到主屏幕

const CACHE_NAME = 'music-player-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/player.js',
  '/js/app.js',
  '/js/playlist.js',
  '/js/upload.js',
  '/js/lyrics.js',
  '/js/lyrics-extract.js',
  '/js/trim.js',
  '/icon-192.png',
  '/icon-512.png'
];

// 安装：缓存所有资源
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截：优先用缓存，没有再请求网络
self.addEventListener('fetch', (e) => {
  // API 请求和音频流不缓存
  if (e.request.url.includes('/api/') || e.request.url.includes('/stream/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
