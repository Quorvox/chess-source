// Service worker собирается на сервере: в нём список файлов сайта и версия (от дат файлов).
// Благодаря этому после каждой выкладки у игроков обновляется кеш, а офлайн работают игра с ботом, тренировка и игра вдвоём.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKIP_DIRS = new Set(['three', 'avatars', 'download']);
function walk(dir, base, out) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    const rel = base + '/' + n;
    if (st.isDirectory()) { if (!SKIP_DIRS.has(n)) walk(p, rel, out); continue; }
    if (n.startsWith('_') || n.startsWith('google') || n.startsWith('yandex_') || n === 'sw.js' || /3d\.js$/.test(n)) continue;
    out.push({ url: rel, sig: rel + st.mtimeMs + st.size });
  }
}

let cache = { at: 0, text: '' };
function build(PUBLIC) {
  if (Date.now() - cache.at < 30000 && cache.text) return cache.text;
  const files = [];
  walk(PUBLIC, '', files);
  const version = crypto.createHash('sha1').update(files.map((f) => f.sig).join('|')).digest('hex').slice(0, 12);
  const urls = ['/', ...files.map((f) => f.url)];
  const text = `// QuorChess service worker, версия ${version}
const VERSION = '${version}';
const CACHE = 'qc-' + VERSION;
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(async (u) => { try { const r = await fetch(u, { cache: 'reload' }); if (r.ok) await c.put(u, r); } catch (_) { /* не критично, докачаем позже */ } }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const NETWORK_FIRST = /\\.(?:js|css|html|json|webmanifest)$/;

async function networkFirst(req, key) {
  const c = await caches.open(CACHE);
  try {
    const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    if (r && r.ok) c.put(key || req, r.clone());
    return r;
  } catch (e) {
    const hit = await c.match(key || req);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r && r.ok) c.put(req, r.clone());
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p === '/ws' || p.startsWith('/avatars/') || p === '/sw.js') return;
  if (req.mode === 'navigate') {
    // любая страница сайта открывается из одного index.html; без сети отдаём его из кеша
    e.respondWith(networkFirst(req, '/').catch(() => caches.match('/')));
    return;
  }
  if (NETWORK_FIRST.test(p)) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(cacheFirst(req).catch(() => Response.error()));
});
`;
  cache = { at: Date.now(), text };
  return text;
}

module.exports = { build };
