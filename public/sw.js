/* =====================================================================
   卡林巴社区工坊 · Service Worker（PWA，WBS 3.3）
   ---------------------------------------------------------------------
   策略：导航请求走 network-first（保证门户内容实时），
        静态资源走 cache-first（离线可打开已访问过的页面），
        更新提示由页面层通过 SW 的 updatefound 事件触发。
   说明：制谱本身在离线单文件版完成，PWA 主要服务「社区门户的便捷入口」，
        因此缓存粒度是页面壳 + 静态资源，不缓存 /api 动态数据。
   ===================================================================== */
const CACHE = 'kalimba-pwa-v1';
const PRECACHE = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 只处理 GET 且同源
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // 导航请求：network-first，失败回退缓存
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
    );
    return;
  }

  // 静态资源：cache-first
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetchAndCache = fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
      return hit || fetchAndCache;
    })
  );
});
