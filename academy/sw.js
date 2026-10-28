/*
 * NOSHASHI Academy service worker (website only, scope /academy/app/).
 * Keeps a copy of the Academy's own files so the course works offline after
 * the first visit: answers from the network when it can, and from the copy
 * when it cannot. The lab workstation (/academy/app/workstation/) is kept the
 * same way once a lab has been opened. Nothing else is cached and nothing is sent anywhere.
 */
const CACHE = "noshashi-academy-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("noshashi-academy-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith("/academy/app/") || req.headers.has("range")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match(url.pathname.startsWith("/academy/app/workstation/") ? "/academy/app/workstation/index.html" : "/academy/app/") : undefined)).then((hit) => hit || Response.error()))
  );
});
