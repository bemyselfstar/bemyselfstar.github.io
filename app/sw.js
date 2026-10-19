// 離線快取（加到主畫面後打開更快、沒網路也開得起來）。
// 只在 https 正式網址註冊（localhost、家裡 Wi-Fi 的 http 不註冊，開發時才不會看到舊檔案）。
// 做法：程式先拿網路上的新檔（沒網路才用快取）、圖片快取優先。改了 mobile/ 的檔案跑 python -X utf8 mobile/tools/bump.py（版本號一起加 1）。
const VERSION = 'deskcat-app-v36';
const SHELL = ['./', 'index.html', 'app.css', 'lines.js', 'server.js', 'app.js', 'pocket.js', 'trip.js', 'scenes.js', 'mail.js', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'fake/sprites.js', 'fake/fake_data.js', 'fake/fake_mail.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // 伺服器（Supabase）的資料不快取
  // 程式、畫面（html／js／css／manifest）：先拿網路上的新檔，沒網路才用快取（2026-10-15：快取優先會讓一部分檔案是舊的，畫面錯亂）
  // 圖片：快取優先（大、很少改），背景再更新
  const code = req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });   // app.js?v=15 也找得到預先存的 app.js
    const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (code) return fresh.catch(() => hit);
    return hit || fresh.catch(() => hit);
  }));
});
