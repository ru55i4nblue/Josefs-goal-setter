/* Goal Setter service worker — offline app shell.
   Caches the static UI so the PWA opens offline; lets all cross-origin
   requests (e.g. Supabase API/realtime) pass straight through to the network. */
const CACHE = 'goal-setter-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './renderer.js',
  './model.js',
  './pages.js',
  './store.js',
  './supabase-config.js',
  './supabase-backend.js',
  './vendor/supabase.js',
  './manifest.webmanifest',
  './build/icon-180.png',
  './build/icon-192.png',
  './build/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle our own origin (the app shell). Supabase etc. -> network.
  if (url.origin !== self.location.origin) return;
  // Network-first: always prefer fresh code/config when online; fall back to
  // the cache only when offline. Keeps the cache updated for offline use.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
