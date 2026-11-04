// Trærne uten nettleser: bakgrunnskysten må ikke strø trær over de ekte øyene, hver flis skal ha nøyaktig sine egne trær, og
// det skal alltid stå fulle trær rundt kameraet uten at hele 256 m-fliser tegnes fullt.
//   node tools/test-trees.mjs
// 1) Arbeidertrådens treutvalg (treeTile i sim/render/worker.js) kjøres for hver 256 m-flis som overlapper en øy: ikke ett av
//    bakgrunnsøyas trær får stå der world.islandAt() gir bakken til en ekte øy (der står øyas egne trær, utenom veier og hus, og
//    der henter bilen kolliderne sine). Teller også trærne i flisen ved Tromøya-spawnen, før og etter utvalget. På en øy der
//    32 m-cellene ikke faller sammen med flisene (Stein) må hvert tre ligge i flisen sin, og flisene til sammen ha øyas trær.
// 2) Fulle trær velges per 64 m-celle (nearMask i sim/render/trees.js): kameraet sveipes over en flis i 1 m-steg for hvert
//    grafikknivå, og cellen kameraet står i må alltid være nær. Sammenligner med hele fliser målt til nærmeste kant (3-7 fliser
//    fulle) og til senteret som før (37 % av posisjonene uten trær på Lav).
// 3) De ekte trærne rundt spawnen: sortTile deler flisen i celler, hvert tre innen nærgrensen skal være fullt, og antallet fulle
//    trær med celler telles mot hele fliser.
import { register } from 'node:module';
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { treeTile } from '../sim/render/worker.js';
// the renderer's modules import 'three' by its bare name (the page's import map): point Node at the vendored copy
const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export function resolve(s, c, n) { return n(s === 'three' ? '${ROOT}vendor/three/three.module.min.js' : s.startsWith('three/addons/') ? '${ROOT}vendor/three/addons/' + s.slice(13) : s, c); }`), import.meta.url);
const { QUALITY } = await import('../sim/render/gfx.js');
const { TILE, SUB, tileDist, cellDist, nearMask, sortTile } = await import('../sim/render/trees.js');

let fails = 0; const bad = m => { fails++; if (fails < 40) console.log('   FEIL: ' + m); };
const world = new World();
for (const d of WORLD.islands) await world.addIsland('world/', d);
const bd = world.islands.find(i => i.def.backdrop), real = world.islands.filter(i => !i.def.backdrop);
const NC = TILE / SUB, CELLS = NC * NC, T = (i, j) => `flis ${i}:${j}`, bits = m => { let n = 0; for (let c = 0; c < CELLS; c++) n += m >> c & 1; return n; };
const cellOf = (x, z, i, j) => Math.floor((x - i * TILE) / SUB) + Math.floor((z - j * TILE) / SUB) * NC;
// a tile as the renderer gets it: every island's trees in the tile (the worker's loop), sorted by cell and kind
const tileData = (i, j) => { const L = []; for (const isl of world.islands) if (!(i * TILE + TILE < isl.x0 || i * TILE > isl.x1 || j * TILE + TILE < isl.z0 || j * TILE > isl.z1)) L.push(treeTile(world, isl, i * TILE, j * TILE, TILE)); let n = 0; for (const A of L) n += A.length; const A = new Float32Array(n); let o = 0; for (const P of L) { A.set(P, o); o += P.length; } return sortTile(A, i, j); };

// ---------------------------------------------------------------- 1) the worker's tiles
console.log('1) Bakgrunnskystens trær der de ekte øyene ligger (' + real.map(i => i.id).join(', ') + ')');
const t0 = performance.now();
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
const tro = world.islands[0], si = Math.floor(-900 / TILE), sj = Math.floor(455 / TILE);
{
  let raw = 0; for (let cj = sj * 8; cj < sj * 8 + 8; cj++) for (let ci = si * 8; ci < si * 8 + 8; ci++) raw += bd.scatter(ci - bd.ox / 32, cj - bd.oz / 32).length;
  const own = treeTile(world, tro, si * TILE, sj * TILE, TILE).length / 6, back = treeTile(world, bd, si * TILE, sj * TILE, TILE).length / 6;
  console.log(`   ${T(si, sj)} ved spawnen: ${own} av Tromøyas egne trær, ${back} fra bakgrunnen (før utvalget ${raw}): ${own + back} i stedet for ${own + raw}`);
  if (back) bad('bakgrunnstrær i spawnflisen');
  if (!own) bad('ingen av Tromøyas egne trær i spawnflisen');
}
// an island whose cells are offset from the tiles: 3 × 3 tiles round the spawn hold exactly the island's trees in that square
{
  const isl = world.islands.find(i => i.id === 'stein'), i0 = Math.floor(892 / TILE) - 1, j0 = Math.floor(11508 / TILE) - 1, X0 = i0 * TILE, Z0 = j0 * TILE, X1 = X0 + 3 * TILE, Z1 = Z0 + 3 * TILE;
  let sum = 0, out = 0;
  for (let j = j0; j < j0 + 3; j++) for (let i = i0; i < i0 + 3; i++) {
    const A = treeTile(world, isl, i * TILE, j * TILE, TILE); sum += A.length / 6;
    for (let k = 0; k < A.length; k += 6) if (A[k] < i * TILE || A[k] >= i * TILE + TILE || A[k + 2] < j * TILE || A[k + 2] >= j * TILE + TILE) out++;
  }
  let all = 0;     // the island's own scatter over the square, cell by cell
  for (let cj = Math.floor((Z0 - isl.oz) / 32); cj * 32 + isl.oz < Z1; cj++) for (let ci = Math.floor((X0 - isl.ox) / 32); ci * 32 + isl.ox < X1; ci++) for (const t of isl.scatter(ci, cj)) if (t.x + isl.ox >= X0 && t.x + isl.ox < X1 && t.z + isl.oz >= Z0 && t.z + isl.oz < Z1) all++;
  console.log(`   Stein (celler forskjøvet ${isl.ox % 32} m, ${isl.oz % 32} m): ${sum} trær i 9 fliser, ${all} i øyas celler over samme rute, ${out} utenfor flisen sin`);
  if (out) bad(`${out} trær ligger utenfor flisen de ble levert i`);
  if (sum !== all) bad(`flisene har ${sum} trær, øya ${all} på samme rute: trær mistet eller doblet i fliskantene`);
  if (!sum) bad('ingen trær på Stein rundt spawnen');
}

// ---------------------------------------------------------------- 2) near cells wherever the camera stands
console.log('2) Fulle trær per 64 m-celle: 1 m-sveip over en flis, hvert grafikknivå (fliser à 256 m som enhet)');
for (const [q, Q] of Object.entries(QUALITY)) {
  const near = Q.trees * 0.05 + 90;
  let N = 0, none = 0, ownFar = 0, cells = 0, whole = 0, centre = 0, noneCentre = 0;
  for (let x = 0; x <= TILE; x++) for (let z = 0; z <= TILE; z++) {
    N++; let n = 0, nc = 0;
    const ti = Math.min(1, Math.floor(x / TILE)), tj = Math.min(1, Math.floor(z / TILE));     // the tile and cell under the camera
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const m = nearMask(x, z, i, j, near); n += bits(m);
      if (i === ti && j === tj && !(m >> cellOf(x, z, i, j) & 1)) ownFar++;
      if (tileDist(x, z, i, j) < near) whole++;
      if (Math.hypot((i + 0.5) * TILE - x, (j + 0.5) * TILE - z) < near) nc++;       // the old rule, to the centre
    }
    if (!n) none++; if (!nc) noneCentre++; cells += n; centre += nc;
  }
  console.log(`   ${Q.name.padEnd(8)} nær < ${near} m: ${(cells / CELLS / N).toFixed(2)} fliser fulle i snitt (hele fliser til nærmeste kant ${(whole / N).toFixed(2)}, til senteret ${(centre / N).toFixed(2)} og ${(100 * noneCentre / N).toFixed(1)} % av posisjonene uten trær), ${(100 * none / N).toFixed(1)} % uten nærcelle` + (Q.treesFar ? `, plakater til ${Q.treesFar} m` : ', ingen plakater'));
  if (none) bad(`${q}: ${none} posisjoner uten en eneste nærcelle`);
  if (ownFar) bad(`${q}: ${ownFar} ganger er cellen kameraet står i ikke nær`);
  if (cells / CELLS > whole) bad(`${q}: cellene gir flere fulle trær enn hele fliser`);
  if (!(near > 0)) bad(`${q}: nærgrensen er ${near}`);
}
// the distances: inside, beside and diagonally off a tile and a cell; a near cell is kept to 40 m past the radius
if (tileDist(10, 10, 0, 0) !== 0 || tileDist(256, 100, 0, 0) !== 0 || tileDist(256, 100, 1, 0) !== 0) bad('tileDist er ikke 0 på flisen');
if (Math.abs(tileDist(300, 100, 0, 0) - 44) > 1e-9 || Math.abs(tileDist(-30, -40, 0, 0) - 50) > 1e-9) bad('tileDist måler feil utenfor flisen');
if (cellDist(70, 10, 0, 0, 1) !== 0 || Math.abs(cellDist(70, 10, 0, 0, 0) - 6) > 1e-9 || Math.abs(cellDist(0, 200, 0, 0, 5) - Math.hypot(64, 72)) > 1e-9) bad('cellDist måler feil');
if (nearMask(-100, 32, 0, 0, 110) !== 0b10001 || nearMask(-100, 32, 0, 0, 110, 1 << 8) !== 0b100010001 || nearMask(-100, 32, 0, 0, 110, 1 << 1) !== 0b10001) bad('nearMask: feil celler, eller hysteresen holder ikke en celle innen 40 m (og bare den)');

// ---------------------------------------------------------------- 3) the real trees round the spawn
console.log('3) Trærne rundt Tromøya-spawnen: 3 × 3 fliser, kameraet i 8 m-steg over spawnflisen');
const area = []; for (let j = sj - 1; j <= sj + 1; j++) for (let i = si - 1; i <= si + 1; i++) area.push(Object.assign({ i, j }, tileData(i, j)));
for (const t of area) {
  const A = t.data, nk = t.kinds.length, n = A.length / 6; let wrong = 0;
  if (t.off[CELLS * nk] !== n || t.off.length !== CELLS * nk + 1) bad(`${T(t.i, t.j)}: off dekker ikke alle ${n} trær`);
  for (let c = 0; c < CELLS; c++) for (let k = 0; k < nk; k++) for (let p = t.off[c * nk + k]; p < t.off[c * nk + k + 1]; p++) if (A[p * 6 + 5] !== t.kinds[k] || cellOf(A[p * 6], A[p * 6 + 2], t.i, t.j) !== c) wrong++;
  if (wrong) bad(`${T(t.i, t.j)}: ${wrong} trær i feil celle eller art etter sortTile`);
  if (new Set(t.kinds).size !== nk) bad(`${T(t.i, t.j)}: en art to ganger i kinds`);
}
for (const Q of Object.values(QUALITY)) {
  const near = Q.trees * 0.05 + 90;
  let N = 0, full = 0, whole = 0, centre = 0, maxFull = 0, missed = 0;
  for (let x = si * TILE; x <= si * TILE + TILE; x += 8) for (let z = sj * TILE; z <= sj * TILE + TILE; z += 8) {
    N++; let f = 0;
    for (const t of area) {
      const A = t.data, nk = t.kinds.length, m = nearMask(x, z, t.i, t.j, near), n = A.length / 6;
      for (let c = 0; c < CELLS; c++) if (m >> c & 1) f += t.off[(c + 1) * nk] - t.off[c * nk];
      if (tileDist(x, z, t.i, t.j) < near) whole += n;
      if (Math.hypot((t.i + 0.5) * TILE - x, (t.j + 0.5) * TILE - z) < near) centre += n;
      if (m !== 0xffff) for (let p = 0; p < n; p++) if (Math.hypot(A[p * 6] - x, A[p * 6 + 2] - z) < near && !(m >> cellOf(A[p * 6], A[p * 6 + 2], t.i, t.j) & 1)) missed++;
    }
    full += f; maxFull = Math.max(maxFull, f);
  }
  console.log(`   ${Q.name.padEnd(8)} nær < ${near} m: ${Math.round(full / N)} fulle trær i snitt, høyst ${maxFull} (hele fliser til nærmeste kant ${Math.round(whole / N)}, til senteret ${Math.round(centre / N)})`);
  if (missed) bad(`${Q.name}: ${missed} trær innen ${near} m av kameraet er ikke fulle`);
  if (full > whole) bad(`${Q.name}: cellene gir flere fulle trær enn hele fliser`);
}

console.log(fails ? `\n${fails} feil` : '\nAlt i orden');
process.exit(fails ? 1 : 0);
