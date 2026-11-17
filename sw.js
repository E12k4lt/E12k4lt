// Caches the whole app (incl. OCR engine and language data) so it runs offline.
const VERSION = "cardqr-v1";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "js/cells.js",
  "vendor/qrcode.js", "vendor/tesseract.min.js", "vendor/worker.min.js",
  "vendor/core/tesseract-core-simd-lstm.wasm.js", "vendor/core/tesseract-core-lstm.wasm.js",
  "lang/eng.traineddata.gz", "icons/icon-192.png", "icons/icon-512.png",
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(hit => hit || fetch(e.request)));
});
