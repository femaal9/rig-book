// Rig Book service worker: l'app funziona anche offline.
// Cambia VERSION a ogni rilascio: l'app mostra "Nuova versione disponibile".
const VERSION = "rigbook-v15";
const SHELL = [
  "./", "index.html", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
  "fonts/rubik-var.woff2",
];
const NET_TIMEOUT = 3500; // con rete lenta si usa la copia salvata

self.addEventListener("install", e => {
  // cache:"reload" scavalca la cache HTTP, così non si salvano file vecchi sotto la nuova versione
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: "reload"})))));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("rigbook-") && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if(e.data === "SKIP_WAITING") self.skipWaiting(); });

// pagina, script e manifest: prima la rete (così si vede subito l'ultima versione), poi la cache.
// font e icone: prima la cache.
self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;
  const nav = req.mode === "navigate";
  const scope = new URL(self.registration.scope);
  if(!url.pathname.startsWith(scope.pathname)) return;

  if(nav || /\.(js|webmanifest|html)$/.test(url.pathname)){
    const key = nav ? new URL("./", scope).href : url.origin + url.pathname;
    // l'aggiornamento della cache continua anche se si risponde prima con la copia salvata
    let finish; e.waitUntil(new Promise(r => { finish = r; }));
    const net = fetch(req, {cache: "no-cache"}).then(res => {
      if(res.ok && res.type === "basic"){ const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)).catch(() => {}).finally(finish); }
      else finish();
      return res;
    }, err => { finish(); throw err; });
    net.catch(() => {});
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const fallback = async () => (await cache.match(key)) || (nav ? await cache.match(new URL("./", scope).href) : undefined);
      try{
        const res = await Promise.race([net, new Promise(r => setTimeout(r, NET_TIMEOUT)).then(fallback)]);
        return res || await net;
      }catch{
        return (await fallback()) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = url.origin + url.pathname;
    const hit = await cache.match(key);
    if(hit) return hit;
    try{
      const res = await fetch(req);
      if(res.ok && res.type === "basic") await cache.put(key, res.clone()).catch(() => {});
      return res;
    }catch{ return Response.error(); }
  })());
});
