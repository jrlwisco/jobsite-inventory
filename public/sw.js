/* Service worker: lets the app open with no internet. Bump VERSION when files change. */
const VERSION = 'v2.0.0';
const SHELL = 'jobsite-inventory-' + VERSION;
const API_CACHE = 'jobsite-api'; // last-seen lists/photos for viewing offline (cleared on sign-out)
const FILES = [
  './', './index.html', './styles.css', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('jobsite-inventory-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
function markCached(res) {
  const h = new Headers(res.headers); h.set('X-From-Cache', '1');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
const offlineResponse = () => new Response(JSON.stringify({ error: 'offline' }), { status: 504, headers: { 'Content-Type': 'application/json', 'X-Offline': '1' } });

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);

  if (rel.startsWith('api/')) {
    // Only lists, item details, photos and sign-in status are kept for offline viewing. Never the backup.
    const cacheable = /^api\/(state|items|photos\/)/.test(rel);
    if (!cacheable) return;
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req), timeout(rel.startsWith('api/photos/') ? 20000 : 8000)]);
        if (res.ok) { const copy = res.clone(); caches.open(API_CACHE).then(c => c.put(req, copy)); }
        return res;
      } catch (err) {
        const hit = await caches.match(req, { cacheName: API_CACHE });
        return hit ? markCached(hit) : offlineResponse();
      }
    })());
    return;
  }

  // App files: show the saved copy right away, refresh it in the background.
  e.respondWith(caches.open(SHELL).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    const fresh = fetch(req).then(res => { if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; }).catch(() => undefined);
    if (cached) { e.waitUntil(fresh); return cached; }
    return (await fresh) || new Response('Offline', { status: 504 });
  }));
});
