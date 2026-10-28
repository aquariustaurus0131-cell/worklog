/* 每日工作日誌 service worker
   - 啟動時快取 App 外殼，之後離線也能開
   - 頁面與程式檔（html／js／json）「網路優先」：有網路就拿最新版，沒網路或太慢就用快取
   - 圖示、字型、Firebase 程式庫：先用快取，背景再更新
   改了功能想強制更新時，把 VERSION 換成新字串即可。 */
const VERSION = "worklog-v3";
const SHELL = ["./", "index.html", "manifest.json", "firebase-config.js", "sync.js", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];
const CACHE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"];
const SLOW_MS = 4000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req, key) {
  const fromCache = () => caches.match(key || req).then(r => r || (key ? caches.match("./") : null));
  return new Promise(resolve => {
    let settled = false;
    const done = r => { if (!settled && r) { settled = true; resolve(r); } };
    const timer = setTimeout(() => fromCache().then(done), SLOW_MS);
    fetch(req)
      .then(res => {
        clearTimeout(timer);
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key || req, copy)); }
        done(res);
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then(r => { if (!settled) { settled = true; resolve(r || Response.error()); } });
      });
  });
}

function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const net = fetch(req)
      .then(res => {
        if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => hit || Response.error());
    return hit || net;
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") { e.respondWith(networkFirst(req, "index.html")); return; }

  if (url.origin === location.origin) {
    if (/\.(js|json|html)$/.test(url.pathname)) e.respondWith(networkFirst(req));
    else e.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (CACHE_HOSTS.includes(url.hostname)) e.respondWith(staleWhileRevalidate(req));
});
