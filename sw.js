/* =====================================================
   AQUENT — Service Worker (PWA) v2
   Strategy:
   - app shell: cache-first
   - data/ JSON: stale-while-revalidate
   - Firebase/Gemini API: network-only (no cache)
   - HTML navigation: network-first dengan fallback offline page
   ===================================================== */

const SW_VERSION = 'v2.8.0';
const SHELL_CACHE = `aquent-shell-${SW_VERSION}`;
const DATA_CACHE  = `aquent-data-${SW_VERSION}`;
const RUNTIME     = `aquent-runtime-${SW_VERSION}`;

const APP_SHELL = [
  '/app.html',
  '/style.css',
  '/app.js',
  '/auth.js',
  '/i18n.js',
  '/ui-dialog.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];

const DATA_FILES = [
  '/data/thresholds.json',
  '/data/dermal-guide.json',
  '/data/products.json',
  '/data/encyclopedia.json',
  '/data/badges.json',
  '/data/skin_type_profiles.json',
  '/data/notification_templates.json',
  '/data/filter_guide.json',
  '/data/shower_myths.json',
  '/data/references.json',
];

const OFFLINE_HTML = `<!doctype html>
<html lang="id" data-theme="light"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline — AQUENT</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;background:#eef4f9;color:#10293d;
min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;margin:0}
h1{font-size:1.5rem;margin:0 0 8px;letter-spacing:.06em}
p{color:#44627c;max-width:380px;line-height:1.6;font-size:.9rem}
.icon{font-size:3rem;margin-bottom:16px}
button{margin-top:20px;padding:10px 24px;border:1px solid rgba(0,180,216,.35);background:#fff;color:#06769a;box-shadow:3px 3px 8px rgba(13,60,94,.1),-3px -3px 8px rgba(255,255,255,.9);border-radius:10px;cursor:pointer;font-family:inherit;font-size:.88rem;font-weight:500}
button:hover{background:rgba(0,180,216,.08)}
</style></head><body>
<div class="icon">📡</div>
<h1>AQUENT</h1>
<p>Anda sedang offline. Beberapa fitur akan tetap berfungsi dengan data terakhir yang tersimpan.</p>
<button onclick="location.reload()">Coba Lagi</button>
</body></html>`;

/* ===== Install ===== */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const shellCache = await caches.open(SHELL_CACHE);
    await shellCache.addAll(APP_SHELL.map(u => new Request(u, { cache:'reload' })));
    const dataCache = await caches.open(DATA_CACHE);
    await Promise.allSettled(DATA_FILES.map(u => fetch(u).then(r => r.ok && dataCache.put(u, r))));
    await self.skipWaiting();
  })());
});

/* ===== Activate ===== */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => (k.startsWith('aquent-') || k.startsWith('aquaviv-')) && ![SHELL_CACHE, DATA_CACHE, RUNTIME].includes(k))
      .map(k => caches.delete(k)));
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

/* ===== Fetch strategies ===== */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firebase realtime, Firestore, Auth, Gemini, FCM — network only
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com') ||
      url.hostname.includes('fcm.googleapis.com') ||
      url.hostname.includes('generativelanguage.googleapis.com') ||
      url.pathname.startsWith('/__/')) {
    return; // biarkan default browser handler
  }

  // HTML navigation: network-first dengan offline fallback
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(handleNavigation(e));
    return;
  }

  // /data/*.json: stale-while-revalidate
  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
    e.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  // models/* (TFJS): cache-first lama
  if (url.pathname.startsWith('/models/')) {
    e.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // App shell (CSS/JS/icons): cache-first dengan network fallback
  if (APP_SHELL.some(s => req.url.endsWith(s) || s === url.pathname)) {
    e.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }

  // Image/font/static: stale-while-revalidate
  if (/\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf)$/i.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(req, RUNTIME));
    return;
  }

  // Default: network with cache fallback
  e.respondWith(networkFirst(req, RUNTIME));
});

async function handleNavigation(e) {
  try {
    const preload = await e.preloadResponse;
    if (preload) return preload;
    const fresh = await fetch(e.request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(e.request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    const fallback = await caches.match('/app.html');
    if (fallback) return fallback;
    return new Response(OFFLINE_HTML, { headers:{'Content-Type':'text/html;charset=utf-8'} });
  }
}

async function cacheFirst(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (e) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchP = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await fetchP) || Response.error();
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    return cached || Response.error();
  }
}

/* ===== Push notifications ===== */
self.addEventListener('push', e => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title:'AQUENT', body: e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'AQUENT', {
      body:    data.body  || 'Ada notifikasi dari AQUENT',
      icon:    data.icon  || '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      tag:     data.tag   || 'aquent',
      vibrate: data.vibrate || [200, 100, 200],
      data:    { url: data.url || data.action_url || '/app.html' },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/app.html';
  e.waitUntil((async () => {
    const list = await clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const c of list) {
      if (c.url.includes(targetUrl) && 'focus' in c) return c.focus();
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  })());
});

/* ===== Message channel (untuk cek versi dari client) ===== */
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'GET_VERSION')  e.ports[0]?.postMessage({ version: SW_VERSION });
});
