// Writes sw.js: the service worker that lets the game run without a network after the first visit.
//   node tools/make-sw.mjs          (bumps VERSION; run it before every publish)
// The pages, scripts, styles and three.js are stored at install. The big files (world data, textures, car models) are stored the
// first time the game fetches them, so the first load is not held up by islands you have not visited yet.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d, ok) => readdirSync(join(root, d)).flatMap(n => { const p = join(d, n); return statSync(join(root, p)).isDirectory() ? walk(p, ok) : ok(p) ? [p] : []; });
const js = p => /\.(js|css|html|json)$/.test(p);
const files = ['index.html', 'klassisk.html', 'props.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png',
  ...walk('sim', js), ...walk('vendor/three', p => /\.js$/.test(p)), ...walk('css', js), ...walk('js', js), ...walk('data', js)]
  .filter(p => existsSync(join(root, p))).map(p => './' + relative('.', p).replace(/\\/g, '/'));
const old = readFileSync(join(root, 'sw.js'), 'utf8').match(/VERSION\s*=\s*'v(\d+)'/);
const VERSION = 'v' + ((old ? +old[1] : 0) + 1);
writeFileSync(join(root, 'sw.js'), `// Service worker: gjør at spillet kan spilles uten nett etter første besøk. Laget av tools/make-sw.mjs (kjør den før hver publisering).
const VERSION='${VERSION}';
const CACHE='tromoybil-'+VERSION;
const FILES=${JSON.stringify(['./', ...files])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{
    // verdensdata, teksturer, bilmodeller og skrifter lagres første gang de hentes
    const ok=res&&res.status===200&&(res.type==='basic'||res.type==='cors');
    if(ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
    return res}).catch(()=>e.request.mode==='navigate'?caches.match('./index.html'):Response.error())));
});
`);
console.log('sw.js', VERSION, files.length + 1, 'filer');
