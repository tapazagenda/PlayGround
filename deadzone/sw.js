/* DEADZONE — service worker: jogo 100% offline após a primeira visita. */
const CACHE = 'deadzone-v1';
const CORE = [
  './',
  './index.html',
  './css/style.css',
  './js/game.js',
  './js/world.js',
  './js/player.js',
  './js/weapons.js',
  './js/zombies.js',
  './js/models.js',
  './js/textures.js',
  './js/props.js',
  './js/pickups.js',
  './js/projectiles.js',
  './js/quest.js',
  './js/hud.js',
  './js/render.js',
  './js/fx.js',
  './js/audio.js',
  './js/controls.js',
  './js/util.js',
  './assets/vendor/three.module.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll falha inteiro se um arquivo faltar: adiciona um por um.
    await Promise.all(CORE.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navegação: rede primeiro (para pegar updates), cache como reserva offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Estáticos: cache primeiro, revalidando em segundo plano.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
      fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      return Response.error();
    }
  })());
});
