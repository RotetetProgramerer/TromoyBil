// Trærne uten nettleser: bakgrunnskysten må ikke strø trær over de ekte øyene, og det skal alltid stå fulle trær rundt kameraet.
//   node tools/test-trees.mjs
// 1) Arbeidertrådens treutvalg (treeTile i sim/render/worker.js) kjøres for hver 256 m-flis som overlapper en øy: ikke ett av
//    bakgrunnsøyas trær får stå der world.islandAt() gir bakken til en ekte øy (der står øyas egne trær, utenom veier og hus, og
//    der henter bilen kolliderne sine). Teller også trærne i flisen ved Tromøya-spawnen, før og etter utvalget.
// 2) Kameraet sveipes over en 256 m-flis i 1 m-steg for hvert grafikknivå: hver flis kameraet står på eller rører ved må være
//    «nær» (fulle trær), så ingen posisjon er uten nærflis. Avstanden måles til flisens nærmeste punkt (tileDist i
//    sim/render/trees.js), ikke til senteret som før (da manglet 36 % av posisjonene nærflis på Lav).
import { register } from 'node:module';
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { treeTile } from '../sim/render/worker.js';
// the renderer's modules import 'three' by its bare name (the page's import map): point Node at the vendored copy
const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export function resolve(s, c, n) { return n(s === 'three' ? '${ROOT}vendor/three/three.module.min.js' : s.startsWith('three/addons/') ? '${ROOT}vendor/three/addons/' + s.slice(13) : s, c); }`), import.meta.url);
const { QUALITY } = await import('../sim/render/gfx.js');
const { tileDist, TILE } = await import('../sim/render/trees.js');

let fails = 0; const bad = m => { fails++; if (fails < 40) console.log('   FEIL: ' + m); };
const world = new World();
for (const d of WORLD.islands) await world.addIsland('world/', d);
const bd = world.islands.find(i => i.def.backdrop), real = world.islands.filter(i => !i.def.backdrop);

// ---------------------------------------------------------------- 1) the backdrop's trees over the real islands
console.log('1) Bakgrunnskystens trær der de ekte øyene ligger (' + real.map(i => i.id).join(', ') + ')');
const t0 = performance.now(), T = (i, j) => `flis ${i}:${j}`;
let tiles = 0, kept = 0, leaked = 0, empty = 0; const done = new Set();
for (const isl of real) {
  // every tile that touches the island's box, and the ring of tiles round it (the coast outside keeps its trees)
  for (let j = Math.floor(isl.z0 / TILE) - 1; j <= Math.floor(isl.z1 / TILE) + 1; j++) for (let i = Math.floor(isl.x0 / TILE) - 1; i <= Math.floor(isl.x1 / TILE) + 1; i++) {
    const key = i + ':' + j; if (done.has(key)) continue; done.add(key);
    const A = treeTile(world, bd, i * TILE, j * TILE, TILE); tiles++; kept += A.length / 6; if (!A.length) empty++;
    for (let k = 0; k < A.length; k += 6) {
      const at = world.islandAt(A[k], A[k + 2]);
      if (at && !at.def.backdrop) { leaked++; if (leaked <= 5) bad(`bakgrunnstre på ${at.id} ved (${A[k].toFixed(0)}, ${A[k + 2].toFixed(0)}), ${T(i, j)}`); }
    }
  }
}
console.log(`   ${tiles} fliser, ${kept} bakgrunnstrær beholdt (kysten utenfor øyene), ${empty} fliser uten, ${leaked} inne på en ekte øy (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
if (leaked) bad(`${leaked} bakgrunnstrær står der en ekte øy dekker bakken`);
if (!kept) bad('bakgrunnskysten har ikke ett tre igjen: utvalget hopper over for mye');
// the spawn tile on Tromøya: what the worker hands the renderer, against what the backdrop's own scatter holds there
{
  const tro = world.islands[0], i = Math.floor(-900 / TILE), j = Math.floor(455 / TILE);
  let raw = 0; for (let cj = j * 8; cj < j * 8 + 8; cj++) for (let ci = i * 8; ci < i * 8 + 8; ci++) raw += bd.scatter(ci - bd.ox / 32, cj - bd.oz / 32).length;
  const own = treeTile(world, tro, i * TILE, j * TILE, TILE).length / 6, back = treeTile(world, bd, i * TILE, j * TILE, TILE).length / 6;
  console.log(`   ${T(i, j)} ved spawnen: ${own} av Tromøyas egne trær, ${back} fra bakgrunnen (før utvalget ${raw}): ${own + back} i stedet for ${own + raw}`);
  if (back) bad('bakgrunnstrær i spawnflisen');
  if (!own) bad('ingen av Tromøyas egne trær i spawnflisen');
}

// ---------------------------------------------------------------- 2) a near tile wherever the camera stands
console.log('2) Nærfliser rundt kameraet: 1 m-sveip over en flis, hvert grafikknivå');
for (const [q, Q] of Object.entries(QUALITY)) {
  const near = Q.trees * 0.05 + 90;
  let N = 0, none = 0, ownFar = 0, sum = 0, noneCentre = 0;
  for (let x = 0; x <= TILE; x++) for (let z = 0; z <= TILE; z++) {
    N++; let n = 0, nc = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const d = tileDist(x, z, i, j);
      if (d < near) n++; else if (d === 0) ownFar++;                                   // d = 0: the camera stands on (or on the edge of) this tile
      if (Math.hypot((i + 0.5) * TILE - x, (j + 0.5) * TILE - z) < near) nc++;       // the old rule, to the centre
    }
    if (!n) none++; if (!nc) noneCentre++; sum += n;
  }
  console.log(`   ${Q.name.padEnd(8)} nær < ${near} m: ${(100 * none / N).toFixed(1)} % av posisjonene uten nærflis (til senteret: ${(100 * noneCentre / N).toFixed(1)} %), ${(sum / N).toFixed(2)} nærfliser i snitt` + (Q.treesFar ? `, plakater til ${Q.treesFar} m` : ', ingen plakater'));
  if (none) bad(`${q}: ${none} posisjoner uten nærflis`);
  if (ownFar) bad(`${q}: ${ownFar} ganger er flisen kameraet står på ikke nær`);
  if (!(near > 0)) bad(`${q}: nærgrensen er ${near}`);
}
// the distance itself: inside, beside and diagonally off a tile
if (tileDist(10, 10, 0, 0) !== 0 || tileDist(256, 100, 0, 0) !== 0 || tileDist(256, 100, 1, 0) !== 0) bad('tileDist er ikke 0 på flisen');
if (Math.abs(tileDist(300, 100, 0, 0) - 44) > 1e-9 || Math.abs(tileDist(-30, -40, 0, 0) - 50) > 1e-9) bad('tileDist måler feil utenfor flisen');

console.log(fails ? `\n${fails} feil` : '\nAlt i orden');
process.exit(fails ? 1 : 0);
