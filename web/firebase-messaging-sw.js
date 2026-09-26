/* The previous AQUENT app registered this worker for push messages.
   The new app does not use it: unregister cleanly so old clients stop running it. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => { e.waitUntil(self.registration.unregister()); });
