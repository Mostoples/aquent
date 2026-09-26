/* AQUENT service worker v4 (neumorphism app).
   Replaces the previous app's worker: every older cache is deleted on activate.
   Strategy: network-first for pages/app files (fresh after each deploy),
   cache-first for 3D assets and fonts, never cache Firebase/API traffic. */
const VERSION = "aq-v4-1";
const CORE = ["/", "/index.html", "/css/style.css", "/js/app.js", "/js/backend.js", "/manifest.json",
  "/assets/brand/logo_grad.png", "/assets/brand/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/__/") || /firebase|googleapis\.com\/(identitytoolkit|securetoken)|firebaseio/.test(url.href)) return;
  const isStatic = url.pathname.startsWith("/assets/") || url.host.includes("fonts.g");
  if (isStatic) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html"))));
});
