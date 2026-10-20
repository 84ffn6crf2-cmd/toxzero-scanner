// Offline shell: app files + guide data are cached; Open Beauty Facts lookups always go to the network.
const VERSION = "tz-scanner-v18";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "engine.js", "manifest.webmanifest",
  "vendor/zxing-library-0.21.3.min.js",
  "data/picks.json", "data/barcodes.json", "data/owners.json", "data/wall.json", "data/images.json", "data/vetted.json", "data/config.json", "img/bg.jpg",
  "fonts/Spectral-Bold.ttf", "fonts/Spectral-Regular.ttf", "fonts/EBGaramond-Regular.ttf",
  "fonts/Quicksand-Regular.ttf", "fonts/Quicksand-Bold.ttf",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // network first so a redeploy shows up; cache when offline
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((res) => {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
