const CACHE = "trainsync-v6";
const ASSETS = [
  "/", "/index.html", "/styles.css", "/workout-log.css", "/app.js",
  "/program", "/program.html", "/program.css", "/program.js",
  "/history", "/history.html", "/history.js",
  "/progress", "/progress.html", "/progress.js",
  "/profile", "/profile.html", "/profile.css", "/profile.js",
  "/integrations", "/integrations.html", "/integrations.css", "/integrations.js",
  "/insights.css", "/lib/progress.mjs", "/lib/programming-engine.mjs", "/lib/program-client.js", "/lib/supabase-client.js",
  "/icon.svg", "/manifest.webmanifest"
];
self.addEventListener("install", (event) => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))); });
self.addEventListener("activate", (event) => { event.waitUntil(Promise.all([caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))), self.clients.claim()])); });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
