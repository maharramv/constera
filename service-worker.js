const CACHE_NAME = "constera-shell-v6";
const APP_SHELL = [
  "/",
  "/index.html",
  "/catalog.html",
  "/services.html",
  "/packages.html",
  "/rental.html",
  "/product-detail.html",
  "/offline.html",
  "/assets/css/styles.css",
  "/assets/js/script.js",
  "/assets/images/white.svg",
  "/assets/icons/site.webmanifest",
  "/assets/icons/web-app-manifest-192x192.png",
  "/assets/icons/web-app-manifest-512x512.png"
];
const PRIVATE_PAGES = new Set([
  "/admin.html",
  "/checkout.html",
  "/customer-cabinet.html",
  "/login.html",
  "/order-detail.html",
  "/proposal-detail.html",
  "/price-import.html",
  "/rfq-dashboard.html",
  "/supplier-portal.html"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.registration.navigationPreload?.enable())
      .then(() => self.clients.claim())
  );
});

const shouldBypass = (url) =>
  url.pathname.startsWith("/api/") ||
  PRIVATE_PAGES.has(url.pathname);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || shouldBypass(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      Promise.resolve(event.preloadResponse)
        .then((preloaded) => preloaded || fetch(request))
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("/offline.html"))
    );
    return;
  }

  const isCatalogData = url.pathname.endsWith("/assets/data/marketplace.data");
  if (!isCatalogData && !["style", "script", "image", "font", "manifest"].includes(request.destination)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || update;
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "ConstEra hesabında yeni məlumat var." };
  }
  event.waitUntil(self.registration.showNotification(payload.title || "ConstEra", {
    body: payload.body || "Hesabında yeni məlumat var.",
    icon: "/assets/icons/web-app-manifest-192x192.png",
    badge: "/assets/icons/web-app-manifest-192x192.png",
    tag: payload.tag || "constera-notification",
    data: { url: payload.url || "/customer-cabinet.html" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = "/customer-cabinet.html";
  try {
    const candidate = new URL(event.notification.data?.url || target, self.location.origin);
    if (candidate.origin === self.location.origin) target = `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    // Təhlükəsiz kabinet ünvanı saxlanılır.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).pathname === new URL(target, self.location.origin).pathname);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});
