const CACHE_NAME = 'microsense-v3';
const ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/js/app.js', '/js/alpha-eye.js', '/js/charts.js',
  '/js/avatar.js', '/js/ollama.js', '/js/therapy.js',
  '/js/camera.js', '/js/threat-engine.js',
  '/js/deception-engine.js', '/js/neuro-analyzer.js',
  '/js/voice-stress-engine.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
