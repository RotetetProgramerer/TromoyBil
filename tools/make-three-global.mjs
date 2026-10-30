// Lager vendor/three/three.global.min.js: three.js som et vanlig <script> (window.THREE), for det klassiske RC-spillet
// som også skal kunne åpnes rett fra fil. Kjør etter at three.module.min.js er byttet:  node tools/make-three-global.mjs
import fs from 'fs';
const src=fs.readFileSync(new URL('../vendor/three/three.module.min.js',import.meta.url),'utf8');
const m=src.match(/export\s*\{([^}]*)\};?\s*$/);if(!m)throw new Error('fant ikke export-listen');
const pairs=m[1].split(',').map(s=>s.trim()).filter(Boolean).map(s=>{const p=s.split(/\s+as\s+/);return p.length===2?`${p[1]}:${p[0]}`:`${p[0]}:${p[0]}`});
const body=src.slice(0,m.index);
fs.writeFileSync(new URL('../vendor/three/three.global.min.js',import.meta.url),`/* three.js r170 (MIT) som vanlig skript, laget av tools/make-three-global.mjs */\n(function(){${body}\nwindow.THREE={${pairs.join(',')}};})();\n`);
console.log('THREE med',pairs.length,'navn');
