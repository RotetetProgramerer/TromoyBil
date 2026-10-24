// Service worker: gjør at spillet kan spilles uten nett etter første besøk.
// Øk VERSION hver gang du publiserer en oppdatering, ellers får spillerne den gamle versjonen.
const VERSION='v5';
const CACHE='sandglow-'+VERSION;
const FILES=["./", "./index.html", "./css/style.css", "./js/core.js", "./js/animals.js", "./js/ambience.js", "./js/map.js", "./js/game.js", "./data/parts.js", "./data/cars.js", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png", "./data/levels/01-sand.js", "./data/levels/02-stein.js", "./data/levels/03-skog.js", "./data/levels/05-elv.js", "./data/levels/06-vulkan.js", "./data/levels/07-oya.js", "./data/levels/10-verden.js"];
// three.js fra CDN. Lagres ved installering, men en feil her skal ikke stoppe installeringen (den lagres da ved første bruk).
const CDN=["https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES).then(()=>c.addAll(CDN).catch(()=>{}))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
    // three.js og skrifter fra CDN lagres også, så spillet virker uten nett
    const ok=res&&res.status===200&&(res.type==='basic'||res.type==='cors');
    if(ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
    return res}).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):Response.error())));
});
