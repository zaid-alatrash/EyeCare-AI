"use strict";
// Bump VERSION whenever any published frontend file changes.
const VERSION = "v2";
const ROOT = new URL("./", self.location.href);
const PREFIX = "eyecare-pwa:" + ROOT.pathname + ":";
const CACHE = PREFIX + VERSION;
const PAGES = [
  "index.html",
  "pages/astigmatism-test.html",
  "pages/chatbot.html",
  "pages/color-vision-test.html",
  "pages/contrast-sensitivity-test.html",
  "pages/disease-details.html",
  "pages/disease-guide.html",
  "pages/eye-tracking-test.html",
  "pages/fundus-examination.html",
  "pages/letter-vision-test.html",
  "pages/oct-examination.html",
  "pages/peripheral-vision-test.html",
  "pages/reaction-time-test.html",
  "pages/vision-test.html"
];
const ASSETS = [
  "css/astigmatism.css",
  "css/color-vision-test.css",
  "css/contrast-sensitivity.css",
  "css/exam-tools.css",
  "css/eye-tracking-test.css",
  "css/history.css",
  "css/interactive-test.css",
  "css/letter-vision-test.css",
  "css/peripheral-vision.css",
  "css/portal.css",
  "css/reaction-time.css",
  "css/report.css",
  "css/styles.css",
  "css/vision-realtime.css",
  "css/vision-test.css",
  "js/astigmatism-test.js",
  "js/chatbot.js",
  "js/color-vision-test.js",
  "js/contrast-sensitivity.js",
  "js/disease-details.js",
  "js/disease-guide.js",
  "js/diseases-ar.js",
  "js/diseases-data.js",
  "js/exam-tools.js",
  "js/examination.js",
  "js/eye-tracking-engine.js",
  "js/eye-tracking-test.js",
  "js/history-page.js",
  "js/history-storage.js",
  "js/letter-test-engine.js",
  "js/letter-vision-test.js",
  "js/main.js",
  "js/mediapipe-face.js",
  "js/peripheral-vision-test.js",
  "js/portal.js",
  "js/pwa.js",
  "js/reaction-time-test.js",
  "js/report.js",
  "js/speech-recognition.js",
  "js/theme.js",
  "js/vision-engine.js",
  "js/vision-realtime.js",
  "js/vision-test.js",
  "assets/images/hero-eye-placeholder.svg",
  "assets/images/oct1.jpeg",
  "assets/images/Ocular_Fundus1.jpg",
  "assets/images/service-illustrations.svg",
  "assets/vendor/jspdf/jspdf.umd.min.js",
  "assets/fonts/NotoSansArabic-Regular.ttf",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/apple-touch-icon.png",
  "manifest.webmanifest"
];
const absolute = (path) => new URL(path, ROOT).href;
const allowed = new Set([...PAGES, ...ASSETS, "offline.html"].map(absolute));
allowed.add(ROOT.href);
const SHELL = ["index.html", "offline.html", "css/styles.css", "js/main.js", "js/theme.js", "js/pwa.js",
  "manifest.webmanifest", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png", "assets/icons/apple-touch-icon.png", "assets/images/hero-eye-placeholder.svg"];

function cacheable(response) {
  return response.ok && response.type === "basic" && !response.redirected
    && !/no-store|private/i.test(response.headers.get("Cache-Control") || "")
    && !response.headers.has("Set-Cookie");
}
self.addEventListener("install", (event) => {
  // No skipWaiting: an update must not reload or interrupt an active examination.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (path) => {
      const url = absolute(path);
      const response = await fetch(url, { cache: "reload", credentials: "omit" });
      if (!cacheable(response)) throw new Error("Cannot cache PWA shell: " + path);
      await cache.put(url, response);
    }));
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)
      || request.headers.has("Authorization") || request.headers.has("Range")) return;
  const navigation = request.mode === "navigate";
  // Exact published-file allowlist, without query strings. Never cache API responses,
  // blobs, uploads, history records, generated reports, or portal/account pages.
  const safe = !url.search && allowed.has(url.href);
  if (!safe && !navigation) return;
  const network = fetch(request);
  const result = network.then(async (response) => {
    if (safe && cacheable(response)) {
      try { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); }
      catch { /* Cache quota/privacy restrictions must not break a working page. */ }
    }
    return response;
  });
  event.waitUntil(result.then(() => {}, () => {}));
  event.respondWith(result.catch(async () => {
    const cache = await caches.open(CACHE);
    if (safe) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    if (navigation) {
      return await cache.match(absolute("offline.html"))
        || new Response("EyeCare AI: reconnect to open this page.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return Response.error();
  }));
});
