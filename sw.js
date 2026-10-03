/* Service worker: makes the app open with no internet. Bump VERSION when files change. */
const VERSION = 'v1.0.0';
const CACHE = 'jobsite-inventory-' + VERSION;
const FILES = [
  './', './index.html', './styles.css', './app.js', './db.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('jobsite-inventory-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Show the saved copy right away (fast on weak job-site signal), and quietly
// download a fresh copy in the background so updates appear next time.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true }) ||
      (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    const fresh = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => undefined);
    if (cached) { e.waitUntil(fresh); return cached; }
    const res = await fresh;
    return res || new Response('Offline', { status: 504, statusText: 'Offline' });
  }));
});
