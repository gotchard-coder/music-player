// 文件：sw.js
// 职责：Service Worker，让网页能添加到主屏幕

const CACHE_NAME = 'music-player-v2';

// 安装
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// 激活
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截：不缓存任何东西，让PWA正常工作
self.addEventListener('fetch', (e) => {
  // 所有请求都走网络，不缓存
  return;
});
