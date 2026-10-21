// Minimal service worker: makes the site installable. Pages and data always come from the network
// (prices, stock and orders must be live); only icons and styles are cached for speed.
const CACHE = "store-v1";
const STATIC = ["/store.css", "/icon-192.png", "/icon-512.png", "/admin-icon-192.png", "/admin-icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (STATIC.includes(u.pathname)) e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
