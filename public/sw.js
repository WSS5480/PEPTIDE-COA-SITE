// Service worker: makes the site installable. Always tries the network first so pages,
// styles, prices and orders are never stale; the saved copy is only used when offline.
const CACHE = "store-v13";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && /\.(css|js|png|webmanifest)$/.test(u.pathname)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
// phone notifications (orders, PIN requests, low stock): shown even when the app is closed; tapping one opens that page
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "360 Peptides", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "360 Peptides", { body: d.body || "", icon: "/icon-192.png", data: { url: d.url || "/admin" }, tag: d.tag || "p360-" + Date.now() }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/admin";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const path = url.split("#")[0], w = list.find((c) => new URL(c.url).pathname === path) || list.find((c) => new URL(c.url).origin === location.origin);
    return w ? w.focus().then((c) => (c && c.navigate ? c.navigate(url) : c)) : self.clients.openWindow(url);
  }));
});
