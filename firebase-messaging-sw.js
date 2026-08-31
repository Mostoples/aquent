/* =====================================================
   AQUENT — Firebase Cloud Messaging Service Worker
   Menerima push notifikasi saat tab tidak aktif.
   ===================================================== */

importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

// Konfigurasi Firebase di-fetch dari /__/firebase/init.json
// (auto-disediakan oleh Firebase Hosting saat deploy).
// Saat dev lokal, fallback ke config statis yang harus diisi sendiri.
const FALLBACK_CFG = {
  apiKey:            "AIzaSyBmohnlvVj0ZbJRPe6nHyIEbzfEBJhb3w0",
  authDomain:        "aquent-id.firebaseapp.com",
  databaseURL:       "https://aquent-id-default-rtdb.firebaseio.com",
  projectId:         "aquent-id",
  storageBucket:     "aquent-id.firebasestorage.app",
  messagingSenderId: "455567103751",
  appId:             "1:455567103751:web:b4c037ca1d2d7a452417a2",
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

(async function init() {
  let cfg = FALLBACK_CFG;
  try {
    const r = await fetch('/__/firebase/init.json');
    if (r.ok) cfg = await r.json();
  } catch {}
  firebase.initializeApp(cfg);

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(payload => {
    const { title, body, icon } = payload.notification ?? {};
    self.registration.showNotification(title ?? 'AQUENT', {
      body:    body  ?? 'Ada notifikasi baru dari AQUENT.',
      icon:    icon  ?? '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      data:    payload.data || {},
    });
  });
})();

// Klik notifikasi → buka/fokuskan tab AQUENT
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.action_url || '/app.html';
  event.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      for (const c of list) { if (c.url.includes(url) && 'focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
