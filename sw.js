// Service Worker del Punto de Venta: la app abre siempre desde caché, con o sin internet.
const CACHE = 'pos-v8';
const SHELL = ['./', './index.html'];
const OFFLINE_HTML = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px;text-align:center"><h2>Sin conexión</h2><p>Abre la app una vez con internet para guardarla en este dispositivo.</p></body>';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Una respuesta con redirección no puede servirse a una navegación: se limpia antes de guardarla.
const clean = async r => r.redirected ? new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers }) : r;

async function shell(req) {
  const c = await caches.open(CACHE);
  const hit = (await c.match(req, { ignoreSearch: true })) || (await c.match('./')) || (await c.match('./index.html'));
  const net = fetch(req).then(async r => { if (r && r.ok) { const ok = await clean(r); await c.put(req, ok.clone()); await c.put('./', ok.clone()); return ok; } return r; }).catch(() => null);
  if (hit) return hit;                       // instantáneo desde caché; se actualiza en segundo plano
  return (await net) || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function swr(req) {
  const c = await caches.open(CACHE), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname.endsWith('firebaseio.com') || u.hostname.endsWith('googleapis.com')) return; // la base de datos no se intercepta
  if (r.mode === 'navigate') return e.respondWith(shell(r));
  if (u.origin === location.origin || u.hostname === 'www.gstatic.com') e.respondWith(swr(r));
});
