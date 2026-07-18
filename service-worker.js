const CACHE_NAME = "constera-shell-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/catalog.html",
  "/services.html",
  "/packages.html",
  "/rental.html",
  "/checkout.html",
  "/assets/css/styles.css",
  "/assets/js/catalog-data.js",
  "/assets/js/taxonomy-expansion.js",
  "/assets/js/azerbaijan-real-products.js",
  "/assets/js/script.js",
  "/assets/js/marketplace.js",
  "/assets/images/white.svg",
  "/assets/icons/site.webmanifest",
  "/assets/icons/web-app-manifest-192x192.png",
  "/assets/icons/web-app-manifest-512x512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const shouldBypass = (url) =>
  url.pathname.startsWith("/api/") ||
  url.pathname.endsWith("admin.html") ||
  url.pathname.endsWith("login.html") ||
  url.pathname.endsWith("supplier-portal.html") ||
  url.pathname.endsWith("customer-cabinet.html");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || shouldBypass(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match("/index.html"))
    );
    return;
  }

  if (!["style", "script", "image", "font", "manifest"].includes(request.destination)) return;
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
