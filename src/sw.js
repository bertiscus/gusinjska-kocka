// Offline copy of Gusinjska kocka for the installed app (GitHub Pages only).
// build.mjs writes this file to /sw.js with the version and the file list filled in.
// Network first: with a connection the newest version of the game is always used; the saved
// copy is used when there is no connection, or when the network takes more than a few seconds.
const CACHE = 'gusinjska-kocka-__VERSION__';
const FILES = __FILES__;
const SLOW_MS = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gusinjska-kocka-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Every address of the game page (?p=android, ?p=windows, ...) is the same page.
  const isPage = req.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'));
  const key = isPage ? new URL('index.html', self.registration.scope).href : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then((res) => {
      if (res.ok && res.status === 200) cache.put(key, res.clone());
      return res;
    });
    const saved = await cache.match(key);
    if (!saved) return net;
    return Promise.race([net.catch(() => saved), new Promise((r) => setTimeout(() => r(saved), SLOW_MS))]);
  })());
});
