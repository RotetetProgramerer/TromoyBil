// Bygger de ni oppdiktede øyene i ekte størrelse fra de gamle banene (data/levels/*.js i lekebil-spillet):
// world/<id>/terrain.bin.gz (høyder hver 5. meter), cover.bin.gz (arealtype) og features.json.gz (veier, hus, vann, løyper, steder),
// i samme format som tools/geo/build_tromoya.py. Den gamle banegeneratoren (js/core.js) kjøres i Node; grunnterrenget (TB) skaleres
// opp (ca. 34 m per gammel enhet bortover), glattes og får ny detalj i ekte størrelse. Elver, veier, hus og løyper lages på nytt.
//
// Bruk:  node tools/geo/build_islands.mjs [id,id,…] [--preview <mappe>]
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import { fileURLToPath } from 'url';
import { runOld, COVER, clamp, lerp, smooth, fbm, ridged, edt, blur, gauss1, lineDist, nearestOnLine, spline, chaikin, resample } from './islandkit.mjs';
import { IslandBuild, NONE, dirv, side, head, add } from './islandbuild.mjs';
import { parseGrid } from '../../sim/world/grid.js';
import { WORLD } from '../../sim/data/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const C = COVER, OS = { SAND: 0, ROCK: 1, DIRT: 2, GRASS: 3, WOOD: 4, MUD: 5, BARK: 7, GRAVEL: 10, BOG: 13, ASH: 14, LAVA: 15, SNOW: 16, ICE: 17, ASPHALT: 19 };
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ shared pieces
// the old rocks (TH above TB where the surface is rock) as real rock outcrops: clusters of knolls and slabs, broken up by noise.
// K.rockH keeps how much each cell was raised (the land cover is bare rock where it is high)
function outcrops(K, k = 0.5, cap = 7, keep = 0.5) {
  K.rockH = new Float32Array(K.H.length);
  K.each((kk, x, z) => {
    const d = K.D[kk]; if (d <= 0 || K.KEEP[kk]) return;
    const o = K.oldAt(x, z), e = o.th - o.tb; if (o.ts !== OS.ROCK || e < 0.08) return;
    const t = 0.5 + 0.5 * fbm(K.n3, x / 32, z / 32, 3), brk = smooth(1 - keep - 0.07, 1 - keep + 0.07, t), r = ridged(K.noise, x / 28 + 3, z / 28, 3);
    const add = Math.min(cap, Math.pow(e * K.V * k, 0.8)) * brk * (0.4 + 0.8 * r) * smooth(0, 60, d);
    K.H[kk] += add; K.rockH[kk] = add;
  });
}
// a sign at the start of every course
function courseSigns(K) {
  for (const c of K.courses) { const s = c.start, u = dirv(s.h), v = side(s.h); K.special.signs.push({ x: Math.round(s.x - u[0] * 6 + v[0] * 7), z: Math.round(s.z - u[1] * 6 + v[1] * 7), h: Math.round((s.h + Math.PI) * 100) / 100, text: c.name.toUpperCase(), sub: ['', 'lett', 'middels', 'vanskelig'][c.diff] + ' løype' }); }
}
const pathOf = c => { const L = []; for (let i = 0; i < c.p.length; i += 2) L.push([c.p[i], c.p[i + 1]]); return L; };
// a course on its own track (a road of class 6 the course follows). o.holes [[fraction, radius, 'mud'|'bog'|'water']]: the track stops
// there and the car drives through a mud hole or a puddle; o.bumps [[fraction, height, radius]]: humps and jumps on the track
function trackCourse(K, o) {
  const P = spline(o.pts, 3), n = P.length, holes = (o.holes || []).map(([f, r, kind]) => ({ i: Math.round(f * (n - 1)), r, kind })).sort((a, b) => a.i - b.i);
  const ro = { c: o.c ?? 6, w: o.w ?? 3.8, s: o.s ?? 3, n: o.road ?? o.name, g: o.g ?? 0.2, sigma: o.sigma ?? 2, ford: o.ford, pinR: o.pinR, raw: true, clear: o.clear };
  const segs = []; let a = 0;
  for (const hl of holes) { const m = Math.ceil(hl.r / 3) + 1; segs.push([a, hl.i - m]); hl.a = hl.i - m; hl.b = hl.i + m; a = hl.i + m; }
  segs.push([a, n - 1]);
  const roads = [];
  for (const [s, e] of segs) {
    if (e - s < 4) continue;
    const bumps = (o.bumps || []).map(([f, hb, rb]) => [f * (n - 1), hb, rb]).filter(b => b[0] >= s && b[0] <= e).map(([i, hb, rb]) => [(i - s) / (e - s), hb, rb]);
    roads.push(K.road(P.slice(s, e + 1), Object.assign({}, ro, { bumps })));
  }
  for (const hl of holes) {
    const ya = K.h(...P[Math.max(0, hl.a)]), yb = K.h(...P[Math.min(n - 1, hl.b)]), y = (ya + yb) / 2, [x, z] = P[hl.i];
    K.disc(x, z, hl.r + 12, (k, px, pz, d) => {
      if (K.ROAD[k] && d > hl.r * 0.5) return;
      const f = 1 - smooth(hl.r * 0.8, hl.r + 12, d), dip = (hl.kind === 'water' ? 0.5 : 0.28) * (1 - smooth(0, hl.r, d)) * (0.8 + 0.4 * Math.abs(K.noise(px / 6, pz / 6)));
      K.H[k] = lerp(K.H[k], y - 0.05 - dip, f); if (d < hl.r + 3) K.CV[k] = C.MUD;                  // mud the car can get through (a real bog would swallow it)
    });
    if (hl.kind === 'water') K.pond(x, z, hl.r * 0.75, { y: y - 0.12, depth: 0.22, margin: 6, r: 6, shallow: true });
  }
  return K.course(Object.assign({ path: P }, o));
}
// a knoll of bare rock beside a track (the narrow passage on Spornes), kept off the road bed
function knoll(K, x, z, r, h) {
  K.disc(x, z, r, (k, px, pz, d) => {
    if (K.ROAD[k]) return; const q = K.roadAt(px, pz, 6), e = q ? smooth(0, 6, q.d - q.hw - 1.2) : 1;
    K.H[k] += h * (1 - (d / r) ** 2) ** 1.2 * (0.75 + 0.5 * ridged(K.noise, px / 9, pz / 9, 2)) * e; if (d < r * 0.85) K.CV[k] = C.ROCK;
  });
}

// ------------------------------------------------------------------ the islands
const RECIPES = {
  // Bykkevika: a subtropical island of pale dunes, an oasis with palms, limestone knolls and long beaches
  sand: { S: 34, V: 10, build(K) {
    const o = K.old, vil = K.P(o.def.village.at), vh = K.dirOld(135);
    K.base({ fill: (x, z) => Math.hypot(x, z) < 36, protect: [[...vil, 420]], coastA: 210, coastL: 900,
      shore: (x, z) => { const r = smooth(0.25, 0.5, K.n3(x / 800, z / 800)); return { beach: 1 - r, rock: r }; } });
    // dunes: long ridges across the wind from the south-west, gentle on the windward side and steep in the lee
    const wd = [Math.cos(35 * DEG), Math.sin(35 * DEG)], dune = new Float32Array(K.H.length);
    K.detail((x, z, d) => {
      const u = (x * wd[0] + z * wd[1]) / 120 + 0.8 * fbm(K.noise, x / 400, z / 400, 2), f = u - Math.floor(u), prof = f < 0.72 ? f / 0.72 : (1 - f) / 0.28;
      const amp = 2.2 + 3.5 * smooth(-0.3, 0.5, fbm(K.n2, x / 650, z / 650, 2)), v = prof * prof * (3 - 2 * prof);
      dune[K.kxz(x, z)] = v * amp / 5.7;
      return amp * (v - 0.4) + 1.6 * fbm(K.n3, x / 70, z / 70, 3);
    }, 140);
    outcrops(K, 0.4, 5, 0.35);
    K.edgeBlend(); K.seaWater();
    // land cover: bare sand on the beaches and the dune crests, dune grass and scrub in the hollows, rock on the knolls
    K.each((k, x, z) => {
      if (K.sea[k]) return; const d = K.D[k], s = K.slope(x, z), n = fbm(K.n2, x / 160, z / 160, 3) + 0.5 * dune[k] - 0.2;
      const grove = fbm(K.n3, x / 260 + 7, z / 260, 3) - 0.25 * dune[k];        // palm groves and scrub in the sheltered hollows between the dunes
      K.CV[k] = d < 50 + 30 * n ? C.BEACH : K.rockH[k] > 1.8 || s > 0.55 ? C.ROCK : grove > 0.32 && d > 120 ? C.FOREST : n > 0.22 ? C.BEACH : n > -0.1 ? C.DUNE : n > -0.4 || grove > 0.15 ? C.HEATH : C.DUNE;
    });
    // the oasis: a small lake in a hollow among the dunes, a palm grove round it
    const oa = K.P([o.lv.pools[0].x, o.lv.pools[0].z]);
    K.flatten(oa[0], oa[1], 120, K.h(oa[0], oa[1]) - 1, 80, false);
    K.pond(oa[0], oa[1], 62, { name: 'Oasen', depth: 2.5 });
    K.paint(oa[0], oa[1], 150, C.FOREST, c => c !== C.LAKE);
    K.labels.push({ n: 'Oasen', x: Math.round(oa[0]), z: Math.round(oa[1]), t: 'lake' });
    // a shallow puddle the second course splashes through
    const pd = K.P([o.lv.pools[1].x, o.lv.pools[1].z]);
    K.pond(pd[0], pd[1], 20, { depth: 0.3, y: K.h(pd[0], pd[1]) - 0.15, shallow: true, r: 10 });
    // the village and the ferry quay in the north-east
    const V = K.village({ at: vil, h: vh, name: 'Bykkevika', houses: 9 });
    K.paint(V.square[0], V.square[1], 110, C.GARDEN, c => c === C.DUNE || c === C.HEATH || c === C.BEACH);
    // the island road from the village through the dunes to the south shore, and the two courses on the old race line
    const P = K.PL(o.def.path);
    const main = K.road([V.out, [520, -420], [240, -120], [60, 220], [260, 560], [720, 830]], { c: 4, s: 1, n: 'Klitteveien', g: 0.1 });
    K.road([[240, -120], [-200, -120], [-560, -60], [-760, 150]], { c: 5, s: 1, n: 'Vestveien', g: 0.12 });
    const a = trackCourse(K, { id: 'klitter', name: 'Klitteløypa', kind: 'strand', diff: 1, pts: [P[0], ...P.slice(1, 8)], road: 'Klittestien',
      desc: 'Over de lyse klittene fra sørstranda, forbi kalksteinsknausene og over sandhoppet. Fin løype for å lære å kjøre i sand.',
      bumps: [[0.4, 1.6, 9]] });
    trackCourse(K, { id: 'oase', name: 'Oaseløypa', kind: 'terreng', diff: 2, pts: P.slice(7), road: 'Oasestien', ford: true,
      desc: 'Forbi oasen med palmene, gjennom vannpytten og ned klittene mot vest. Hold farten oppe i den løse sanden.' });
    courseSigns(K);
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Bykkevika', x: 0, z: 0, t: 'island' }, { n: 'Klittene', x: 300, z: 500, t: 'locality' });
  } },

  // Spornes: a rugged island of bare, ice-scoured rock with heath, juniper and pine in the hollows, bogs and a tarn
  stein: { S: 34, V: 30, build(K) {
    const o = K.old, vil = K.P(o.def.village.at), vh = K.dirOld(-45);
    const cove = (x, z) => smooth(0.35, 0.6, K.n3(x / 500, z / 500));
    K.base({ fill: (x, z) => Math.hypot(x, z) < 38, land: (x, z, tb) => Math.hypot(x, z) < 40.6 || tb > o.water, protect: [[...vil, 420]], coastA: 190, coastL: 700,
      shore: (x, z) => ({ rock: 1 - cove(x, z), beach: cove(x, z) }), skerries: 2 });
    // the ice ground the rock into long ridges from north-east to south-west
    const ca = Math.cos(40 * DEG), sa = Math.sin(40 * DEG), ridge = new Float32Array(K.H.length);
    K.detail((x, z) => { const r = ridged(K.noise, (x * ca + z * sa) / 260, (-x * sa + z * ca) / 80, 3); ridge[K.kxz(x, z)] = r; return 7 * (r - 0.45) + 3 * fbm(K.n2, x / 90, z / 90, 3); }, 80);
    outcrops(K, 0.5, 6, 0.55);
    K.edgeBlend(); K.seaWater();
    nordicCover(K, { rock: k => ridge[k] > 0.78 || K.rockH[k] > 1, heath: 0.15, forest: -0.32, cove });
    tarns(K, 1, 'Steintjern');
    const V = K.village({ at: vil, h: vh, name: 'Spornes', houses: 8 });
    const P = K.PL(o.def.path);
    K.road([V.out, [-380, 560], [120, 470], [560, 700], [820, 840]], { c: 5, s: 1, n: 'Spornesveien', g: 0.12 });
    K.road([[-380, 560], [-560, 60], [-700, -520], [-790, -860]], { c: 5, s: 1, n: 'Nordveien', g: 0.12 });
    K.road([[120, 470], [300, 0], [390, -440]], { c: 6, s: 1, n: 'Lyngveien', g: 0.14 });
    trackCourse(K, { id: 'steintrapp', name: 'Steintrappa', kind: 'terreng', diff: 3, pts: P.slice(0, 8), road: 'Steinrøysa',
      desc: 'Over svaberg og steinrøyser fra sørstranda, opp steintrappa og gjennom regnpytten. Her trengs presisjon.',
      bumps: [0, 1, 2, 3, 4].map(i => [0.3 + i * 0.0022, 0.4, 1.8]), holes: [[0.88, 14, 'water']] });
    const c2 = trackCourse(K, { id: 'svaberg', name: 'Svaberget', kind: 'terreng', diff: 2, pts: P.slice(7), road: 'Svabergstien',
      desc: 'Gjennom det trange skaret mellom to steinknauser, over den store kulen og ned svabergene mot nord.', bumps: [[0.52, 2.2, 13]] });
    { const L = pathOf(c2), i = Math.round(L.length * 0.1), h = head(L[i - 1], L[i + 1]), v = side(h); for (const sd of [-1, 1]) knoll(K, L[i][0] + v[0] * sd * 15, L[i][1] + v[1] * sd * 15, 13, 7); }
    courseSigns(K);
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Spornes', x: 0, z: 0, t: 'island' });
  } },

  // Froland: a forest island; spruce and pine on the hills, birch by the bogs, a stream through the valley and gravel forest roads
  skog: { S: 34, V: 16, build(K) {
    const o = K.old, vil = K.P(o.def.village.at), vh = K.dirOld(-60), sz = X => -204 + 136 * Math.sin(0.12 * X / 34);
    K.base({ fill: (x, z) => Math.hypot(x, z) < 38, protect: [[...vil, 420], [1500, sz(1500), 260]], coastA: 200, coastL: 800,
      shore: (x, z) => { const b = smooth(0.2, 0.5, K.n3(x / 600, z / 600)); return { rock: 1 - b, beach: b }; } });
    K.detail((x, z) => 5 * fbm(K.noise, x / 220, z / 220, 4) + 2.5 * (ridged(K.n2, x / 120, z / 120, 2) - 0.5), 100);
    outcrops(K, 0.4, 5, 0.4);
    K.edgeBlend(); K.seaWater();
    nordicCover(K, { forest: 0.4, heath: 0.55, bogFill: true });
    const src = [-980, sz(-980)];
    K.pond(src[0], src[1], 55, { name: 'Kjeldetjern', bog: true, depth: 1.5 });
    const pts = []; for (let X = -930; X <= 1750; X += 60) pts.push([X, sz(X)]);
    K.stream({ pts, hw: 4, depth: 0.9, name: 'Frolandsbekken' });
    K.paintLine(pts, 30, C.DECID, c => c === C.FOREST || c === C.MIXED);
    tarns(K, 1, 'Myrtjern');
    const V = K.village({ at: vil, h: vh, name: 'Froland', houses: 8 });
    const P = K.PL(o.def.path);
    K.road([V.out, [-360, 700], [-80, 380], [120, 80], [80, -300]], { c: 5, s: 1, n: 'Skogsveien', g: 0.12 });
    K.road([[-80, 380], [400, 520], [760, 700], [890, 800]], { c: 5, s: 1, n: 'Sørveien', g: 0.12 });
    K.road([[80, -300], [140, -620], [150, -880]], { c: 6, s: 1, n: 'Nordre skogsbilvei', g: 0.14 });
    trackCourse(K, { id: 'tommer', name: 'Tømmerløypa', kind: 'terreng', diff: 2, pts: P.slice(0, 8), road: 'Tømmerveien', ford: true,
      desc: 'Gjennom granskogen, over tømmerstokkene og gjennom myrhullet. Regnet gjør det glatt.',
      bumps: [[0.34, 0.45, 2], [0.77, 0.5, 2]], holes: [[0.92, 16, 'bog']] });
    trackCourse(K, { id: 'bekk', name: 'Bekkeløypa', kind: 'terreng', diff: 2, pts: P.slice(7), road: 'Bekkestien', ford: true,
      desc: 'To ganger over bekken, gjennom gjørmehullet og opp lia mot nord. Vad rolig over.',
      bumps: [[0.25, 0.45, 2], [0.7, 0.5, 2]], holes: [[0.38, 16, 'bog']] });
    courseSigns(K);
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Froland', x: 0, z: 0, t: 'island' }, { n: 'Frolandsbekken', x: 300, z: Math.round(sz(300)), t: 'stream' });
  } },

  // Nidelva: a river island; the river winds from a lake in the west to its mouth in the east, with gravel bars at the fords
  elv: { S: 34, V: 20, build(K) {
    const o = K.old, vil = K.P(o.def.village.at), vh = K.dirOld(135), rz = X => -68 + 170 * Math.sin(0.1 * X / 34), st = x => 2 + 5 * Math.sin(x * 0.1);
    K.base({ fill: (x, z) => Math.hypot(x, z) < 39 && Math.abs(z - st(x)) < 4.5, protect: [[...vil, 420], [1480, rz(1480), 300]], coastA: 180, coastL: 800,
      shore: (x, z) => { const b = smooth(0.3, 0.55, K.n3(x / 600, z / 600)); return { rock: 1 - b, beach: b }; } });
    K.detail((x, z) => (4 * fbm(K.noise, x / 260, z / 260, 4) + 2 * (ridged(K.n2, x / 130, z / 130, 2) - 0.5)) * smooth(90, 260, Math.abs(z - rz(x))), 100);
    outcrops(K, 0.4, 5, 0.4);
    K.edgeBlend(); K.seaWater();
    nordicCover(K, { forest: 0.25, heath: 0.6, field: true });
    // the river: out of Vestvatnet, east to the sea; the meadows along it
    const lk = K.pond(-1080, rz(-1080), 140, { name: 'Vestvatnet', depth: 4 });
    const pts = []; for (let X = -960; X <= 1800; X += 50) pts.push([X, rz(X)]);
    const fords = [[544, 102, 70], [-68, -102, 70], [-510, -238, 70]];
    K.river({ pts, hw: t => 15 + 12 * t, depth: 2.6, top: lk - 0.3, fords, name: 'Nidelva', reaches: 4 });
    K.paintLine(pts, 70, C.GRASS, c => c === C.FOREST || c === C.MIXED || c === C.HEATH);
    for (const [x, z, r] of fords) K.paint(x, z, r * 0.6, C.GRAVEL, c => c !== C.LAKE);
    const V = K.village({ at: vil, h: vh, name: 'Nidelva', houses: 8 });
    const P = K.PL(o.def.path);
    K.road([V.out, [640, -520], [700, -100], [760, 300], [860, 700], [900, 790]], { c: 4, s: 1, n: 'Elveveien', g: 0.1 });
    K.road([[640, -520], [200, -560], [-300, -620], [-700, -720], [-860, -800]], { c: 5, s: 1, n: 'Nordveien', g: 0.12 });
    trackCourse(K, { id: 'nidelva', name: 'Nidelva', kind: 'terreng', diff: 3, pts: [...P.slice(1, 9), add(P[8], dirv(head(P[8], P[9])), 160)], road: 'Vadestien', ford: true,
      desc: 'Tre vadesteder over Nidelva, to gjørmehull og et hopp. Hold deg på grusørene, ellers drukner motoren.',
      bumps: [[0.62, 1.5, 8]], holes: [[0.35, 15, 'mud'], [0.68, 15, 'mud']] });
    courseSigns(K);
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Nidelva', x: 0, z: 0, t: 'island' }, { n: 'Vestvatnet', x: -1080, z: Math.round(rz(-1080)), t: 'lake' });
  } },

  // Løveøya: a savanna of golden grass and red earth, a waterhole, a crocodile river to the sea and a granite kopje where the lions lie
  savanne: { S: 34, V: 18, build(K) {
    const o = K.old, [vil, vh] = oldVillage(K);
    const RIV = [[13, 8], [8, 11], [2, 12.5], [-4, 15], [-10, 17], [-16, 17], [-22, 19], [-28, 22], [-34, 24], [-46, 27]], WH = [17, 5], KOP = [-14, -4], CAMP = [-3, -12], GROVE = [6, 28];
    K.base({ fill: (x, z) => Math.hypot(x, z) < 37 && (lineDist(RIV, x, z) < 3.8 || Math.hypot(x - WH[0], z - WH[1]) < 7), protect: [[...vil, 420], [...K.P([-38, 25]), 260]],
      coastA: 190, coastL: 800, shore: (x, z) => { const r = smooth(0.3, 0.6, K.n3(x / 700, z / 700)); return { beach: 1 - r, rock: r }; } });
    const kop = K.P(KOP);
    K.detail((x, z) => 1.8 * fbm(K.noise, x / 300, z / 300, 3) + 6 * (ridged(K.n2, x / 40, z / 40, 3) - 0.3) * (1 - smooth(150, 300, Math.hypot(x - kop[0], z - kop[1]))), 100);
    K.edgeBlend(); K.seaWater();
    K.each((k, x, z) => {
      if (K.sea[k]) return; const d = K.D[k], s = K.slope(x, z), n = fbm(K.n2, x / 180, z / 180, 3), ts = K.oldAt(x, z).ts, dk = Math.hypot(x - kop[0], z - kop[1]) * (1 + 0.45 * fbm(K.n3, x / 110 + 4, z / 110, 2));    // a ragged outline
      const m = fbm(K.n3, x / 70, z / 70, 3);
      K.CV[k] = d < 45 + 20 * n ? C.BEACH : dk < 230 && (s > 0.25 || ts === OS.ROCK) ? C.ROCK : dk < 275 && m > -0.05 ? C.GRAVEL : n > 0.38 || m > 0.42 ? C.DIRT : C.SAVANNA;
    });
    // the waterhole and the river from it to the sea; green grass and mud along the water
    const wh = K.P(WH), wl = K.pond(wh[0], wh[1], 95, { name: 'Vannhullet', depth: 2.5 });
    let rp = K.PL(RIV); rp[0] = add(wh, dirv(head(wh, rp[1])), 80); rp = bend(K, rp, 80, [0, 2, 6, rp.length - 1]);     // (the fords stay where they were)
    K.river({ pts: rp, hw: t => 10 + 6 * t, depth: 2.2, top: wl - 0.15, fords: [[...K.P([2, 12.5]), 55], [...K.P([-22, 19]), 55]], name: 'Krokodilleelva', reaches: 3 });
    // mud and green grass along the water, in ragged bands
    K.disc(wh[0], wh[1], 260, (k, x, z, d) => { const c = K.CV[k], f = 1 + 0.5 * fbm(K.n3, x / 60, z / 60, 2); d = Math.min(d, lineDist(rp, x, z) + 40);
      if (c !== C.LAKE && c !== C.SEA && c !== C.GRAVEL && d < 125 * f) K.CV[k] = C.MUD; else if ((c === C.SAVANNA || c === C.DIRT) && d < 175 * f) K.CV[k] = C.GRASS; });
    K.each((k, x, z) => { const c = K.CV[k]; if (c === C.LAKE || c === C.SEA || c === C.GRAVEL || c === C.MUD) return; const f = 1 + 0.6 * fbm(K.n3, x / 70, z / 70, 2), d = lineDist(rp, x, z);
      if (d < 34 * f) K.CV[k] = C.MUD; else if (d < 80 * f && (c === C.SAVANNA || c === C.DIRT)) K.CV[k] = C.GRASS; });
    const gr = K.P(GROVE); K.disc(gr[0], gr[1], 240, (k, x, z, d) => { if ((K.CV[k] === C.SAVANNA || K.CV[k] === C.DIRT) && d < 170 + 70 * fbm(K.n2, x / 90, z / 90, 2)) K.CV[k] = C.DECID; });
    // the village, the roads and the safari camp in the middle of the island
    const V = K.village({ at: vil, h: vh, name: 'Løveøya', houses: 7, s: 3 });
    const cp = K.P(CAMP); K.flatten(cp[0], cp[1], 45, K.h(cp[0], cp[1]), 30);
    camp(K, cp, head(cp, K.P([-2, -15.5])));
    const OR = o.def.roads.map(r => K.PL(r));
    K.road(bend(K, [V.out, ...OR[0].slice(1)], 110, [0, 1, OR[0].length - 1]), { c: 5, s: 3, n: 'Safariveien', g: 0.1 });
    K.road(bend(K, OR[1]), { c: 5, s: 3, g: 0.12 }); K.road(bend(K, OR[2]), { c: 5, s: 3, g: 0.12 }); K.road(bend(K, [OR[0][1], ...OR[3]]), { c: 5, s: 3, n: 'Klippeveien', g: 0.12 });
    K.road(bend(K, OR[4]), { c: 5, s: 3, n: 'Broveien', g: 0.12 }); K.road(bend(K, [OR[4][OR[4].length - 1], ...OR[5]]), { c: 5, s: 3, n: 'Baobabveien', g: 0.12 });
    const CH = o.def.challenges;
    trackCourse(K, { id: 'safari', name: CH[0].name, kind: 'terreng', diff: 1, pts: K.PL(CH[0].path).concat([K.P(CH[0].path[0])]), road: 'Safarirunden',
      desc: 'En runde over den åpne sletta i sørvest, mellom sebraer og gnuer. Se opp for gepardene: de er raskere enn bilen, men svinger dårlig.' });
    trackCourse(K, { id: 'elva', name: CH[1].name, kind: 'sump', diff: 2, pts: K.PL(CH[1].path), road: 'Elvestien', ford: true,
      desc: 'Over to vadesteder i Krokodilleelva og rundt baobablunden. Kjør rolig i vannet, men ikke bli stående: krokodillene ligger på lur.' });
    trackCourse(K, { id: 'klippe', name: CH[2].name, kind: 'bakke', diff: 3, pts: K.PL(CH[2].path), road: 'Klippestien', g: 0.26,
      desc: 'Opp granittblokkene og over toppen av Løveklippen, der løvene ligger i skyggen. Lavt gir og ingen stopp.' });
    courseSigns(K);
    K.special.signs.push({ x: Math.round(V.out[0]), z: Math.round(V.out[1]), h: R2(vh), text: 'LØVEØYA', sub: 'nasjonalpark · ikke gå ut av bilen' });
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Løveøya', x: 0, z: 0, t: 'island' }, { n: 'Løveklippen', x: Math.round(kop[0]), z: Math.round(kop[1]), t: 'peak' }, { n: 'Vannhullet', x: Math.round(wh[0]), z: Math.round(wh[1]), t: 'lake' },
      { n: 'Safarileiren', x: Math.round(cp[0]), z: Math.round(cp[1]), t: 'camp' }, { n: 'Baobablunden', x: Math.round(gr[0]), z: Math.round(gr[1]), t: 'wood' }, { n: 'Sletta', x: -700, z: 550, t: 'plain' });
  } },

  // Kaimanøya: dense rainforest, three rivers, a waterfall off Apeberget, mud flats, a mangrove delta and a temple ruin
  kaiman: { S: 32, V: 20, margin: 860, build(K) {
    const o = K.old, [vil, vh] = oldVillage(K), RV = o.lv.fx.filter(f => f.type === 'river');
    const HILL = [-3, 28], POOL = [-3, 11.8], TARN = [-3, 19.2], MUDF = [-23, -25], DELTA = [27, -24], TEMPLE = [23, 19], HUB = [6, -21];
    const rivD = (x, z) => Math.min(...RV.map(r => lineDist(r.pts, x, z) - r.hw));
    K.base({ fill: (x, z) => rivD(x, z) < 1.2 && Math.hypot(x - DELTA[0], z - DELTA[1]) > 12, land: (x, z, tb) => tb > o.water || Math.hypot(x - DELTA[0], z - DELTA[1]) < 11.5, protect: [[...vil, 420]], coastA: 170, coastL: 900, skerries: 0.6,
      shore: (x, z) => { const r = smooth(0.25, 0.55, K.n3(x / 700, z / 700)); return { beach: 1 - r, flat: 0.4 * r, rock: 0.6 * r }; } });
    const hill = K.P(HILL), mud = K.P(MUDF), del = K.P(DELTA), tp = K.P(TEMPLE), hub = K.P(HUB);
    K.detail((x, z) => (3.5 * fbm(K.noise, x / 200, z / 200, 4) + 3 * (ridged(K.n2, x / 110, z / 110, 3) - 0.5)) * (1 - smooth(250, 420, Math.min(Math.hypot(x - mud[0], z - mud[1]), Math.hypot(x - del[0], z - del[1])))), 90);
    K.edgeBlend(); K.seaWater();
    K.each((k, x, z) => {
      if (K.sea[k]) return; const d = K.D[k], s = K.slope(x, z), n = fbm(K.n2, x / 160, z / 160, 3), dm = Math.hypot(x - mud[0], z - mud[1]) * (1 + 0.2 * K.n3(x / 200, z / 200)), dd = Math.hypot(x - del[0], z - del[1]) * (1 + 0.2 * K.n3(x / 150, z / 150));
      K.CV[k] = d < 35 + 20 * n ? C.BEACH : dm < 390 ? (n > 0.2 ? C.BOG : C.MUD) : dd < 330 ? (n > 0.3 ? C.BEACH : C.MUD) : s > 0.6 ? C.ROCK : n > 0.45 ? C.GRASS : C.JUNGLE;
    });
    // the mangrove delta: low mud and sand banks cut by shallow tidal channels out to the sea
    for (const ch of [[[27, -24], [31, -28], [36, -33], [43, -39]], [[25, -21], [30, -19], [37, -17], [45, -15]], [[24, -27], [23, -33], [25, -40], [26, -48]], [[29, -22], [34, -24], [40, -26], [48, -27]]])
      K.channel(chaikin(bend(K, K.PL(ch), 80), 2), 9, 0.8);
    // Apeberget: the tarn on top, the cliff on the south side, the waterfall into the pool where Storelva begins
    const tarn = K.P(TARN), pool = K.P(POOL), tl = K.pond(tarn[0], tarn[1], 70, { name: 'Tjernet', depth: 3 }), pl = K.pond(pool[0], pool[1], 60, { name: 'Fossekulpen', depth: 4 });
    const lip = K.P([-3, 15.6]), foot = add(pool, [0, -1], 35);
    K.special.falls.push({ kind: 'fall', x0: R1(lip[0]), z0: R1(lip[1]), y0: R2(tl), x1: R1(foot[0]), z1: R1(foot[1]), y1: R2(pl), w: 26 });
    K.stream({ pts: [tarn, lip], hw: 6, depth: 0.6, name: null });
    const raw = RV.map(r => K.PL(r.pts)), rp = [bend(K, [pool, ...raw[0].slice(2)], 80), bend(K, raw[1], 80), bend(K, raw[2], 60)];     // the old rivers ran straight
    const stor = K.river({ pts: rp[0], hw: t => 13 + 8 * t, depth: 2.6, top: pl - 0.2, name: 'Storelva', fords: [[...K.P([-3.6, 4.6]), 50], [...K.P([-23.3, 1.3]), 50]] });
    K.river({ pts: rp[1], hw: t => 9 + 7 * t, depth: 2.2, name: 'Østelva', fords: [[...K.P([15.1, 9.4]), 45], [...K.P([21.4, -10.4]), 45]] });
    K.stream({ pts: rp[2], hw: 5, depth: 0.9, name: 'Sølebekken' });
    for (const r of rp) K.paintLine(r, 26, C.MUD, c => c === C.JUNGLE || c === C.GRASS);
    // the temple ruin: four stepped terraces of stone with a stairway up the south face, on a cleared platform
    temple(K, tp);
    // the camp where the roads meet, and the village with the quay in the south
    K.flatten(hub[0], hub[1], 40, K.h(hub[0], hub[1]), 25); camp(K, hub, head(hub, K.P([6, -18])), 'KAIMANØYA');
    const V = K.village({ at: vil, h: vh, name: 'Kaimanøya', houses: 7, s: 3 });
    const OR = o.def.roads.map(r => K.PL(r));
    K.road(bend(K, [V.out, ...OR[0]]), { c: 5, s: 3, n: 'Leirveien', g: 0.1 });
    for (let i = 1; i < 5; i++) K.road(bend(K, OR[i]), { c: 5, s: 3, g: 0.13, w: 3.6 });
    K.road([...OR[5], ...OR[6]], { c: 6, s: 3, w: 3.6, g: 0.13, n: 'Hengebroa', clear: 3.5 });      // over Storelva on the old suspension bridge
    const CH = o.def.challenges, kinds = ['sump', 'terreng', 'terreng', 'sump', 'bakke'];
    CH.forEach((ch, i) => trackCourse(K, { id: ch.id, name: ch.name, kind: kinds[i], diff: ch.diff, pts: i === 2 ? [...K.PL(ch.path), [tp[0], tp[1] + 66]] : K.PL(ch.path), road: ch.name, ford: true, g: i === 4 ? 0.24 : 0.2, desc: KAIMAN_DESC[i],
      holes: i === 0 ? [[0.12, 14, 'bog'], [0.3, 14, 'mud'], [0.48, 15, 'bog'], [0.66, 14, 'mud'], [0.84, 15, 'bog']] : i === 2 ? [[0.3, 10, 'mud']] : [] }));
    courseSigns(K);
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Kaimanøya', x: 0, z: 0, t: 'island' }, { n: 'Apeberget', x: Math.round(hill[0]), z: Math.round(hill[1]), t: 'peak' }, { n: 'Gjørmesletta', x: Math.round(mud[0]), z: Math.round(mud[1]), t: 'marsh' },
      { n: 'Mangroven', x: Math.round(del[0]), z: Math.round(del[1]), t: 'marsh' }, { n: 'Tempelet', x: Math.round(tp[0]), z: Math.round(tp[1]), t: 'ruin' }, { n: 'Leiren', x: Math.round(hub[0]), z: Math.round(hub[1]), t: 'camp' });
  } },
};
Object.assign(RECIPES, {
  // Gautefall: the winter island. A mountain with a flat top, a chairlift and four pistes, a frozen lake, snowy spruce forest
  gautefall: { S: 34, V: 22, build(K) {
    const o = K.old, [vil, vh] = oldVillage(K), Cm = K.P([0, 6]), LK = K.P([-25, -12]), PK = K.P([0, -21.5]), Ld = o.lv.liftDef;
    K.base({ fill: () => false, protect: [[...vil, 420]], coastA: 170, coastL: 800, shore: (x, z) => { const b = smooth(0.3, 0.6, K.n3(x / 600, z / 600)); return { rock: 1 - b, beach: b }; } });
    // spurs and gullies down the mountainside, rock steps; the plateau on top stays flat
    K.detail((x, z) => {
      const r = Math.hypot(x - Cm[0], z - Cm[1]), a = Math.atan2(z - Cm[1], x - Cm[0]), m = smooth(150, 320, r) * (1 - smooth(820, 1100, r));
      const spur = ridged(K.noise, Math.cos(a) * 2.6 + r / 420, Math.sin(a) * 2.6 - r / 520, 3);
      return m * (11 * (spur - 0.5) + 4 * fbm(K.n2, x / 120, z / 120, 3)) + 1.8 * fbm(K.n3, x / 60, z / 60, 2);
    }, 90);
    outcrops(K, 0.35, 4, 0.4);
    K.edgeBlend(); K.seaWater();
    K.each((k, x, z) => { if (K.sea[k]) return; const d = K.D[k], s = K.slope(x, z), n = fbm(K.n2, x / 90, z / 90, 2); K.CV[k] = d < 25 + 15 * n ? (n > 0 ? C.GRAVEL : C.ROCK) : s > 0.62 + 0.15 * n || K.rockH[k] > 1.8 ? C.ROCK : C.SNOW; });
    // spruce forest up to the tree line (150–210 m), with clearings and bogs (open snow); the pistes are cut through it below
    K.each((k, x, z) => { if (K.CV[k] !== C.SNOW || K.D[k] < 50) return; const n = fbm(K.n3, x / 260, z / 260, 3); if (K.H[k] < 150 + 60 * (n + 0.5) && n > -0.22) K.CV[k] = C.SNOWFOREST; });
    K.lake({ poly: wobble(LK, 245, 0.8, K), y: K.h(...LK) - 1.5, ice: true, name: 'Isvannet', margin: 50 });
    // the pistes: groomed snow (smoothed ground), kept free of trees by the winter scatter; the chairlift up to the top
    const Hs = blur(K.H, K.nx, K.nz, 3), PC = ['', 'green', 'green', 'blue', 'red', 'black'];
    for (const pk of o.lv.pistes) {
      const P = spline(K.PL(pk.def.path), 8), hw = Math.round(pk.hw * 13);
      K.each((k, x, z) => { const q = lineDist(P, x, z); if (q > hw + 20) return; const f = 1 - smooth(hw, hw + 20, q); K.H[k] = lerp(K.H[k], Hs[k], 0.8 * f); if (q < hw) K.CV[k] = C.SNOW; });
      K.special.pistes.push({ id: pk.id, name: pk.name, kind: pk.kind, color: PC[pk.def.color ?? pk.diff], hw, p: P.flatMap(([x, z]) => [R1(x), R1(z), R2(K.h(x, z))]), gates: (pk.def.gates || []).map(g => K.P(g).map(R1)) });
    }
    const LA = K.P([Ld.ax, Ld.az]), LB = K.P([Ld.bx, Ld.bz]);
    const V = K.village({ at: vil, h: vh, name: 'Gautefall', houses: 8, s: 0, road: 'Fjellveien' });
    K.flatten(PK[0], PK[1], 50, K.h(PK[0], PK[1]), 30); K.paint(PK[0], PK[1], 48, C.URBAN);
    const OR = o.def.roads.map(r => K.PL(r));
    K.road([V.out, ...OR[0]], { c: 4, s: 0, n: 'Fjellveien', g: 0.1 });
    K.road([OR[0][OR[0].length - 1], OR[1][0]], { c: 4, s: 0, n: 'Fjellveien', g: 0.08 });
    K.road(OR[1], { c: 5, s: 4, n: 'Isvannsveien', g: 0.12 }); K.road(OR[2], { c: 5, s: 4, n: 'Granskogveien', g: 0.12 }); K.road(OR[3], { c: 5, s: 4, n: 'Kystveien', g: 0.12 });
    // the ski centre: the lift's stations, the lodge and the ticket office at the car park, the café on top
    lift(K, LA, LB);
    const u = dirv(head(LA, LB)), v = side(head(LA, LB));
    K.building(...add(add(PK, v, 42), u, -10), 34, 16, head(LA, LB), 3, 2, { n: 'Skisenteret' });
    K.building(...add(add(PK, v, -36), u, 12), 12, 8, head(LA, LB), 9, 1, { n: 'Billettluka' });
    // the road up the mountain: found by the router, a hairpin climb; and the course on it
    const pl = K.special.pistes.map(p => ({ L: pathOf({ p: p.p.filter((_, i) => i % 3 !== 2) }), hw: p.hw }));
    const top = add(Cm, [-1, 0], 60), R = K.route(add(PK, v, 50), top, { g: 0.1, gmax: 0.16, maxTurn: 1.0, turn: 22, avoid: (x, z) => pl.some(q => lineDist(q.L, x, z) < q.hw + 8) });
    const tv = K.road(R, { c: 5, w: 6, s: 4, n: 'Toppveien', g: 0.12, sigma: 4 });
    K.flatten(top[0], top[1], 30, K.h(top[0], top[1]), 15);
    let cafe = null; for (const [a, r] of [[1.6, 70], [2.2, 70], [1.0, 75], [2.8, 65], [0.4, 80]]) { const p = add(Cm, [Math.cos(a), Math.sin(a)], r); if (K.building(p[0], p[1], 20, 12, a + Math.PI / 2, 3, 1, { n: 'Toppstua', check: true, m: 6 })) { cafe = p; break; } }
    const CH = o.def.challenges;
    K.course({ id: 'isvann', name: CH[0].name, kind: 'is', diff: 2, path: spline(K.PL(CH[0].path).map(p => add(LK, [p[0] - LK[0], p[1] - LK[1]], 0.82)), 4), desc: 'Rundt og over det islagte vannet. Nesten ikke grep: rolig på gassen og styr tidlig.' });
    trackCourse(K, { id: 'skog', name: CH[1].name, kind: 'grus', diff: 1, pts: K.PL(CH[1].path), road: 'Granskogløypa', s: 4, desc: 'Snødekt skogsvei mellom tunge grantrær på østsiden av øya.' });
    trackCourse(K, { id: 'nord', name: CH[2].name, kind: 'grus', diff: 2, pts: K.PL(CH[2].path).slice(1, 7), road: 'Nordkystløypa', s: 4, desc: 'Langs kysten på nordsiden av fjellet, der vinden har blåst isen blank.' });
    K.course({ id: 'fjell', name: 'Fjellveien', kind: 'bakke', diff: 3, path: K.line(tv).slice(Math.round(tv._P.length * 0.56)), desc: 'Fra parkeringen ved skiheisen og opp hårnålssvingene til Toppstua. Snø og is i svingene: brems før, ikke i.' });
    courseSigns(K);
    K.special.signs.push({ x: R1(PK[0] + v[0] * 20), z: R1(PK[1] + v[1] * 20), h: R2(head(LB, LA)), text: 'GAUTEFALL', sub: 'skisenter · parkering' }, { x: R1((cafe || Cm)[0]), z: R1((cafe || Cm)[1] + 14), h: Math.PI, text: 'TOPPSTUA', sub: 'kafé · 4 nedfarter' });
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Gautefall', x: 0, z: 0, t: 'island' }, { n: 'Toppen', x: Math.round(Cm[0]), z: Math.round(Cm[1]), t: 'peak' }, { n: 'Isvannet', x: Math.round(LK[0]), z: Math.round(LK[1]), t: 'lake' }, { n: 'Parkering', x: Math.round(PK[0]), z: Math.round(PK[1]), t: 'parking' });
  } },

  // Hisøya: a volcano with lava rivers from the crater, rainforest at its foot, a jungle river with a waterfall, and a road spiralling up
  vulkan: { S: 34, V: 16, build(K) {
    const o = K.old, [vil, vh] = oldVillage(K), rOf = (x, z) => Math.hypot(x - 8, z - 6), cr = K.P([8, 6]);
    const RIVER = [[-19.5, -15], [-21, -17], [-23, -19.5], [-25.2, -22.5], [-27, -25.5], [-29.5, -28.5]], seaD = (x, z) => Math.hypot(x + 36, z + 36);
    // the old level's cliff ran dead straight to the east coast; it goes, and a lower, wavy cliff ~650 m long stays round the waterfall
    const cliff = (x, z) => 2.4 * smooth(0, 0.9, z + 6.65) * smooth(0, 6, -6 - x) - 1.1 * smooth(0, 0.9, z + 6.65 + 0.3 * Math.sin((x + 18) * 0.8)) * smooth(0, 5, -5 - x) * smooth(0, 5, x + 30);
    // a concave cone (steeper towards the top, like a real stratovolcano) instead of the old rounded hill, and a lower cliff by the waterfall
    const cone = (x, z) => { const rr = rOf(x, z); if (rr >= 19 || rr <= 4.2) return 0; const u = Math.min(1, (19 - rr) / 15); return 5.6 * (Math.pow(u, 1.7) - u * u * (3 - 2 * u)); };
    K.base({ fill: (x, z) => seaD(x, z) > 15 && lineDist(RIVER, x, z) < 3.4, adjust: (x, z) => -cliff(x, z) + cone(x, z),
      vmap: (u, x, z) => lerp(u < 1.3 ? u * 16 : 20.8 + (u - 1.3) * 46, u * 16, smooth(17, 21, rOf(x, z))),
      protect: [[...vil, 420], [...K.P([-34, -34]), 520]], coastA: 170, coastL: 800, shore: (x, z) => { const r = smooth(0.2, 0.5, K.n3(x / 700, z / 700)); return { beach: 1 - r, rock: r }; } });
    // radial ridges and gullies on the cone, rough lava fields lower down
    K.detail((x, z) => {
      const r = Math.hypot(x - cr[0], z - cr[1]), a = Math.atan2(z - cr[1], x - cr[0]), cone = smooth(150, 260, r) * (1 - smooth(560, 700, r));
      return cone * (12 * (ridged(K.noise, Math.cos(a) * 4.5 + r / 260, Math.sin(a) * 4.5, 3) - 0.5) + 4 * fbm(K.n3, x / 70, z / 70, 3)) + (1 - cone) * 3 * fbm(K.n2, x / 160, z / 160, 3) + 1.2 * fbm(K.n3, x / 50, z / 50, 2);
    }, 90);
    K.edgeBlend(); K.seaWater();
    K.each((k, x, z) => {
      if (K.sea[k]) return; const [ox, oz] = K.toOld(x, z), rr = rOf(ox, oz), d = K.D[k], s = K.slope(x, z), n = fbm(K.n2, x / 120, z / 120, 3);
      K.CV[k] = d < 40 + 20 * n ? C.BEACH : rr < 15.5 + 1.2 * n ? (s > 1.1 + 0.3 * n ? C.ROCK : C.ASH) : rr < 18.5 + n ? (n > 0 ? C.ASH : C.DIRT) : s > 0.7 ? C.ROCK : n > 0.35 ? C.MUD : C.JUNGLE;
    });
    // the jungle river: from the pool under the waterfall to the bay; the waterfall off the cliff, over the ledge road and into the pool
    const pool = K.P([-18, -12.6]), pl = K.pond(pool[0], pool[1], 48, { name: 'Fossekulpen', depth: 4 });
    const rv = K.river({ pts: [pool, ...K.PL(RIVER), K.P([-33, -32])], hw: t => 8 + 5 * t, depth: 2, top: pl - 0.2, fords: [[...K.P([-23, -19.5]), 40]], name: 'Jungelelva' });
    for (const [x, z, r] of [[-18, -1.2, 36], [-24, 2.5, 24]]) K.pond(...K.P([x, z]), r, { depth: 1.5 });
    const lip = K.P([-18, -6.2]), ledge = K.P([-18, -7.9]);
    // lava: three rivers out of the crater, the lava lake in it, smoke and steam
    K.LAVA = new Uint8Array(K.H.length);
    for (const f of o.lv.fx.filter(f => f.type === 'lava')) lavaRiver(K, f.s.map(p => K.P([p.x, p.z])), { hw: t => 6 + 4 * t });
    const lp = o.lv.fx.find(f => f.type === 'lavadisc'), cy = K.h(...cr);
    K.disc(cr[0], cr[1], 95, (k, x, z, d) => { const f = 1 - smooth(60, 95, d), y = cy - 3; K.H[k] = lerp(K.H[k], y - 0.6, f); if (d < 66) { K.CV[k] = C.LAVA; K.W[k] = y; K.LAVA[k] = 1; } else if (d < 95) K.CV[k] = C.ASH; });
    K.special.lavaPools.push({ x: R1(cr[0]), z: R1(cr[1]), r: 66, y: R2(cy - 3) });
    K.special.vents.push({ x: R1(cr[0]), z: R1(cr[1]), y: R2(cy), kind: 'smoke', s: 90 });
    for (const [a, r] of [[200, 12], [320, 9.5], [60, 14], [130, 11]]) { const p = K.P([8 + r * Math.cos(a * DEG), 6 + r * Math.sin(a * DEG)]); K.special.vents.push({ x: R1(p[0]), z: R1(p[1]), y: R2(K.h(...p)), kind: 'steam', s: 14 }); }
    for (const v of o.lv.vents) { const p = K.P([v.x, v.z]); if (Math.hypot(p[0] - cr[0], p[1] - cr[1]) > 80) K.special.vents.push({ x: R1(p[0]), z: R1(p[1]), y: R2(K.h(...p)), kind: 'smoke', s: 25 }); }
    // the village, the road round the island and up the volcano, and the four courses
    const V = K.village({ at: vil, h: vh, name: 'Hisøya', houses: 8, s: 1 });
    const P = o.def.path.map(p => K.P(p)), beach = P.slice(0, 15), toFall = P.slice(14, 28);
    let rim = 0; for (let a = 0; a < 6.28; a += 0.2) rim = Math.max(rim, K.h(cr[0] + Math.cos(a) * 150, cr[1] + Math.sin(a) * 150));
    const s0 = K.P([8 + 19 * Math.cos(225 * DEG), 6 + 19 * Math.sin(225 * DEG)]), spiral = coneRoad(K, cr, s0, 0.085, rim - 12, 175);
    K.road([V.out, [700, -520], [520, -150], s0], { c: 4, s: 1, n: 'Vulkanveien', g: 0.1 });
    K.road([[520, -150], [800, 120], [880, 520], beach[0]], { c: 5, s: 1, n: 'Strandveien', g: 0.12 });
    const vv = K.road(spiral, { c: 4, w: 6, s: 1, n: 'Kraterveien', g: 0.11, clear: 5, sigma: 4 });
    trackCourse(K, { id: 'regnskog', name: 'Regnskogstien', kind: 'terreng', diff: 2, pts: beach, road: 'Regnskogstien',
      desc: 'Fra stranda og inn på gjørmestien i regnskogen, rundt den lille skogen og tilbake. Søledammer og røtter overalt.',
      holes: [[0.08, 10, 'mud'], [0.16, 9, 'mud'], [0.25, 11, 'mud'], [0.42, 9, 'mud']] });
    trackCourse(K, { id: 'foss', name: 'Fossestien', kind: 'terreng', diff: 2, pts: [...toFall, add(toFall[toFall.length - 1], [-1, 0], 130)], road: 'Fossestien', ford: true,
      desc: 'Over vadestedet i jungelelva, opp til hyllen under klippen og rett gjennom fossen. Vannet spruter over veien.' });
    K.course({ id: 'vulkan', name: 'Kraterveien', kind: 'bakke', diff: 3, path: K.line(vv), desc: 'Spiralveien opp vulkanen til kraterkanten, over lavaelvene på broer. Ikke stopp på broene.' });
    // the shortcut: from halfway up straight towards the rim, over a lava river on a narrow bridge
    // (two points of the spiral 85 m apart in height with a lava bridge between them; the shortcut climbs straight from one to the other)
    const L = K.line(vv), Y = vv._y, br = vv._br; let ia = 0, ib = 0;
    for (const needBridge of [true, false]) {
      for (let i = 0; i < L.length && !ib; i++) { if (Y[i] < rim * 0.3) continue; const j = Y.findIndex((y, k) => k > i && y > Y[i] + 85); if (j < 0) break; if (!needBridge || br.slice(i, j).some(Boolean)) { ia = i; ib = j; } }
      if (ib) break;
    }
    const A = L[ia], B = L[ib], scP = K.route(A, B, { g: 0.19, gmax: 0.27, water: 2, turn: 10, avoid: (x, z) => lineDist([A, B], x, z) > 160 });
    const sc = K.road(scP, { c: 6, w: 4.6, s: 1, n: 'Snarveien', g: 0.18, clear: 4, sigma: 3 });
    K.course({ id: 'snarvei', name: 'Snarveien', kind: 'bakke', diff: 3, path: [...L.slice(Math.max(0, ia - 70), ia), ...K.line(sc)], desc: 'Et stykke opp Kraterveien, så den modige snarveien: rett opp flanken og over lavaelva på en smal bro, i stedet for den lange runden rundt krateret.' });
    for (let k = 0; k < K.H.length; k++) if (K.LAVA[k]) K.W[k] = NONE;
    // the waterfall falls from the lip of the cliff straight onto the ledge road; the water runs on down into the pool
    K.special.falls.push({ kind: 'fall', x0: R1(lip[0]), z0: R1(lip[1]), y0: R2(K.h(...add(lip, [0, -1], 12)) + 0.3), x1: R1(ledge[0]), z1: R1(ledge[1] - 4), y1: R2(K.h(...ledge)), w: 22, spray: true });
    K.stream({ pts: [add(ledge, [0, 1], 10), pool], hw: 3, depth: 0.5 });
    courseSigns(K);
    { const sp = add(A, side(head(A, scP[1])), 8); K.special.signs.push({ x: R1(sp[0]), z: R1(sp[1]), h: R2(head(sp, scP[1]) + Math.PI), text: 'SNARVEI', sub: 'smal bro over lava' }); }
    K.spawnAt(add(V.square, dirv(vh), -40), vh + Math.PI);
    K.labels.push({ n: 'Hisøya', x: 0, z: 0, t: 'island' }, { n: 'Krateret', x: Math.round(cr[0]), z: Math.round(cr[1]), t: 'peak' }, { n: 'Fossen', x: Math.round(lip[0]), z: Math.round(lip[1]), t: 'waterfall' });
  } },
});
Object.assign(RECIPES, {
  // Trinnvik: a small town on two terraces (Nedre by and Øvre by) with Utsikten on top, a harbour, a stadium, a parking garage with a
  // spiral ramp to its roof, a skatepark, a park, and an airport on a landfill out in the sea to the east
  trinnvik: { S: 34, V: 14, build(K) {
    const o = K.old, [vil, vh] = oldVillage(K), cl = v => Math.max(0, Math.min(1, v));
    // the old stamps that do not belong at real scale: the garage cone, the skate bowl and the amphitheatre (built again below)
    const adjust = (x, z) => {
      let a = 0; const dp = Math.hypot(x - 22, z + 8); if (dp < 8.2) a -= 3 * cl((8.2 - dp) / 3.4);
      const da = Math.hypot(x + 23, z + 1); if (da < 4) a += da < 1.76 ? 0.68 : 0.17 * (Math.min(3, Math.floor((4 - da) / 0.56)) + 1);
      const db = Math.hypot(x + 19, z + 24); if (db < 3.4) a += 0.8 * (1 - (db / 3.4) ** 2); else if (db < 3.75) a -= 0.08;
      const dv = lineDist(AIRVEI, x, z); if (dv < 4 && Math.hypot(x, z) > 31) a -= 0.6 * smooth(0, 1, (2.8 - dv) / 1.2 + 0.5) * smooth(31, 36, Math.hypot(x, z));    // the old raised strip for the airport road
      return a;
    };
    const AIR = { x0: 1224, x1: 1938, z0: -544, z1: 1156 }, AY = 4.5, AIRVEI = [[-8, -30.5], [-14, -34.2], [-22, -35.2], [-30, -32.2], [-36, -27.2], [-40, -21.8], [-41.6, -16.8]];
    K.base({ fill: () => false, adjust, blur: 2, protect: [[...vil, 420], [1580, 300, 950], [140, 1180, 380]], coastA: 150, coastL: 800,
      shore: (x, z) => { const b = smooth(0.2, 0.55, K.n3(x / 600, z / 600)); return { beach: b, rock: 1 - b }; } });
    K.detail((x, z) => 2.5 * fbm(K.noise, x / 200, z / 200, 3) * smooth(1050, 1300, Math.hypot(x, z * 1.1)), 80);
    // the airport: a level landfill in the sea
    K.cells(AIR.x0 - 60, AIR.z0 - 60, AIR.x1 + 60, AIR.z1 + 60, (k, x, z) => { const e = Math.max(AIR.x0 - x, x - AIR.x1, AIR.z0 - z, z - AIR.z1, 0); if (e > 60) return; K.H[k] = lerp(K.H[k], AY, 1 - smooth(0, 60, e)); if (e <= 0) K.KEEP[k] = 1; });
    K.edgeBlend(); K.seaWater();
    const L0 = K.h(0, 170), L1 = K.h(0, -620);
    // the farmland round the town in parcels (150 × 95 m, rows staggered): fields, meadows, woodlots and heath; bigger woods where n is high
    const hh = (i, j) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const parcel = (x, z) => { const u = x * 0.94 + z * 0.34, v = -x * 0.34 + z * 0.94, j = Math.floor(v / 95), r = hh(Math.floor((u + 57 * j) / 150), j); return r < 0.45 ? C.FARM : r < 0.72 ? C.GRASS : r < 0.86 ? C.DECID : r < 0.93 ? C.MIXED : C.HEATH; };
    K.each((k, x, z) => {
      if (K.sea[k]) return; const d = K.D[k], s = K.slope(x, z), n = fbm(K.n2, x / 150, z / 150, 3);
      const lower = x > -470 && x < 440 && z > -160 && z < 540, upper = x > -380 && x < 380 && z > -1010 && z < -350;
      K.CV[k] = d < 30 + 15 * n ? C.BEACH : s > 0.3 ? C.ROCK : lower ? C.URBAN : upper ? (n > 0 ? C.GARDEN : C.URBAN) : x > AIR.x0 - 20 && z > AIR.z0 - 20 && z < AIR.z1 + 20 ? C.GRASS : n > 0.3 ? C.MIXED : n > 0.22 ? C.DECID : parcel(x, z);     // woods, fields and meadows round the town
    });
    const V = K.village({ at: vil, h: vh, name: 'Trinnvik', houses: 0, boathouses: 2, back: 70, sign: 'kjør om bord · Kaia' });
    // ---- the streets of Nedre by (a grid inside Ringveien) and Øvre by, and the two hills between them
    const st = (pts, n, o2 = {}) => K.road(pts, Object.assign({ c: 4, w: 7, s: 0, n, g: 0.1, raw: true, sigma: 2 }, o2));
    const ring = st([[374, 476], [-408, 476], [-408, -102], [374, -102], [374, 476]], 'Ringveien', { w: 9, c: 3 });
    for (const [x, n] of [[-230, 'Skippergata'], [-60, 'Storgata'], [110, 'Torggata'], [250, 'Kongens gate']]) st([[x, -102], [x, 476]], n);
    for (const [z, n] of [[60, 'Skolegata'], [230, 'Torvgata'], [360, 'Strandgata']]) st([[-408, z], [374, z]], n);
    st([[-408, -102], [-401, -160], [-400, -340], [-390, -394]], 'Bakken', { w: 8, g: 0.09, raw: false });
    st([[-390, -394], [340, -394]], 'Øvre gate', { w: 8 });
    st([[340, -394], [420, -330], [425, -160], [374, -102]], 'Østbakken', { w: 8, g: 0.09, raw: false });
    st([[-204, -394], [-204, -673]], 'Smauet', { w: 6 }); st([[120, -394], [120, -880]], 'Kirkegata'); st([[-330, -640], [330, -640]], 'Rådhusgata');
    st([[-380, -520], [330, -520]], 'Hagegata', { w: 6 }); st([[-330, -790], [120, -790]], 'Lia', { w: 6 }); st([[300, -394], [300, -640]], 'Kirkebakken', { w: 6 });
    const uts = K.P([-0.5, 30]); K.flatten(uts[0], uts[1], 70, K.h(...uts), 40);
    st([[120, -880], [100, -950], [60, -995], uts], 'Utsiktsveien', { w: 6, g: 0.11, raw: false });
    st([[-408, 476], [-560, 600], [-697, 697], V.out], 'Havnegata', { w: 8 });
    st([[-600, 628], [-748, 622], [-1054, 622]], 'Kaiveien', { w: 8 });
    st([[-408, -85], [-680, -85], [-952, -85], [-1037, -136], [-1047, -272], [-1047, -578]], 'Stadionveien', { w: 8, raw: false });
    const prom = st([[-408, 476], [-408, 748], [-204, 986], [68, 1088], [272, 1037]], 'Promenaden', { w: 7, raw: false });
    const fly = st([[272, 1037], [476, 1163], [748, 1197], [1020, 1095], [1224, 925], [1360, 741], [1414, 571], [1440, 470]], 'Flyplassveien', { w: 7, raw: false });
    st([[374, -50], [560, -150], [760, -250]], 'Parkveien', { w: 6, raw: false });
    st([[374, 476], [520, 640], [646, 740]], 'Strandveien', { w: 6, raw: false });
    // ---- the harbour: warehouses on Kaiveien, containers on the quay, the marina below Promenaden
    K.row([-600, 628], [-1040, 622], -6, { k: () => 8, f: () => 2, len: R => 30 + R() * 20, dep: R => 18 + R() * 6, gap: R => 6 + R() * 8, m: 3 });
    for (let i = 0; i < 18; i++) { const x = -900 - (i % 6) * 14, z = 650 + Math.floor(i / 6) * 4; K.special.props.push({ kind: 'container', x, z, y: R2(K.h(x, z)), a: 0, s: 1 + (i % 3 === 0 ? 1 : 0), c: i % 4 }); }
    marina(K, [140, 1060], 0, 'Gjestehavna');
    // ---- the stadium: a football pitch inside a running track, stands on all four sides with a gap for the tunnel
    const stc = [-765, -500];
    stadium(K, stc);
    st([[-1047, -500], [-985, -500], [-905, -500]], 'Stadionplassen', { w: 7 });
    // ---- the round parking garage with its spiral ramp up to the roof
    const ph = [-748, 272];
    st([[-408, 220], [-560, 220], [-708, 220]], 'P-husveien', { w: 7 });
    const ramp = garage(K, ph, L0);
    // ---- the park, the skatepark, the building site
    const park = [700, -330]; K.paint(park[0], park[1], 260, C.GRASS, c => c !== C.ROCK && c !== C.SEA);
    K.pond(...K.P([-16.5, 19]), 38, { name: 'Parkdammen', depth: 1.5 });
    const sk = [646, 800]; K.flatten(sk[0], sk[1], 45, K.h(...sk), 20); K.paint(sk[0], sk[1], 46, C.URBAN); K.special.props.push({ kind: 'skatepark', x: sk[0], z: sk[1], y: R2(K.h(...sk)), a: 0.5, s: 1 });
    const site = [-520, -860]; K.paint(site[0], site[1], 110, C.GRAVEL, c => c !== C.SEA); K.special.props.push({ kind: 'crane', x: site[0] + 30, z: site[1], y: R2(K.h(site[0] + 30, site[1])), a: 0.3, s: 1 });
    // ---- the airport: runway, taxiway, apron, terminal, tower, hangar
    const RW = [1727, -380, 1727, 980];
    K.road([[RW[0], RW[1]], [RW[2], RW[3]]], { c: 5, w: 30, s: 0, n: 'Rullebanen', raw: true, profile: () => AY + 0.1 });
    K.road([[1440, 110], [1440, 500]], { c: 5, w: 110, s: 0, n: 'Oppstillingsplassen', raw: true, profile: () => AY + 0.1 });
    K.road([[1495, 300], [1712, 300]], { c: 5, w: 18, s: 0, n: 'Taksebanen', raw: true, profile: () => AY + 0.1 });
    K.building(1340, 300, 80, 24, 0, 9, 2, { n: 'Terminalen', y: AY + 0.1 }); K.building(1480, 700, 9, 9, 0, 10, 6, { n: 'Tårnet', y: AY + 0.1 }); K.building(1450, -180, 55, 48, 0, 8, 2, { n: 'Hangaren', y: AY + 0.1 });
    K.pois.airport = { rwy: RW, w: 30, y: AY + 0.1 };
    K.special.runway = { x0: RW[0], z0: RW[1], x1: RW[2], z1: RW[3], w: 30, y: AY + 0.1, n: ['02', '20'] };
    K.special.airport = { tower: { x: 1480, z: 700, y: AY, h: 17 }, sock: { x: 1780, z: -300, y: AY }, terminal: { x: 1340, z: 300 }, n: 'Trinnvik lufthavn' };
    K.special.signs.push({ x: 1410, z: 470, h: Math.PI, text: 'TRINNVIK LUFTHAVN', sub: 'rundflyging over skjærgården', w: 5 });
    // ---- the course tracks in the park and by the skatepark (before the houses, so the houses keep clear of them)
    trackCourse(K, { id: 'park', name: 'Parkstien', kind: 'grus', diff: 1, pts: K.PL(o.def.challenges[1].path).slice(0, 22), road: 'Parkstien', c: 7, w: 3.6, s: 1, desc: 'Grusstier gjennom Byparken: rundt dammen, forbi lekeplassen og ned bakken mot sentrum.' });
    trackCourse(K, { id: 'skate', name: 'Skateparken', kind: 'by', diff: 2, pts: K.PL(o.def.challenges[2].path).slice(0, 27), road: 'Skatestien', c: 5, w: 5, s: 0, desc: 'Rundt skateparken og langs stranda, mellom rampene, rekkverkene og benkene. Trangt og raskt.' });
    // ---- Torget, the blocks of the town along the streets, Øvre by with the town hall and the church
    const torg = [25, 145]; K.special.squares.push({ x: 25, z: 145, w: 110, l: 120, kind: 'torg', n: 'Torget' });
    const blk = (a, b, off, k, f, o2 = {}) => K.row(a, b, off, Object.assign({ gap0: 11, k: () => k, f: () => f[0] + Math.floor(K.R() * (f[1] - f[0] + 1)), len: R => 18 + R() * 16, dep: R => 12 + R() * 4, gap: R => 1 + R() * 3, m: 3 }, o2));
    // a mix along each block front: shops and offices (flat roofs), blocks of flats, and painted wooden terrace houses with gables
    const mixK = () => { const r = K.R(); return r < 0.25 ? 9 : r < 0.6 ? 2 : 1; }, mixF = k => k === 1 ? [2, 3] : k === 9 ? [2, 4] : [3, 5];
    for (const z of [-102, 60, 230, 360, 476]) for (const [x0, x1] of [[-408, -230], [-230, -60], [-60, 110], [110, 250], [250, 374]]) {
      if (z === 230 && x0 === -60) continue;                                   // Torget
      if (z > -102) { const k = mixK(); blk([x0, z], [x1, z], -7.5, k, mixF(k)); }
      if (z < 476) { const k = mixK(); blk([x1, z], [x0, z], -7.5, k, mixF(k)); }
    }
    for (const x of [-408, -230, -60, 110, 250, 374]) for (const [z0, z1] of [[-102, 60], [60, 230], [230, 360], [360, 476]]) {
      if (x === -60 && z0 === 60) continue;
      if (x > -408) { const k = mixK(); blk([x, z1], [x, z0], -7.5, k, mixF(k)); } if (x < 374) { const k = mixK(); blk([x, z0], [x, z1], -7.5, k, mixF(k)); }
    }
    // pavement and squares along the streets, gardens and yards behind the houses
    K.each((k, x, z) => { if (K.CV[k] === C.URBAN && !(Math.abs(x - torg[0]) < 62 && Math.abs(z - torg[1]) < 55)) K.CV[k] = 255; });
    for (const r of K.roads) if (r.c <= 5) K.paintLine(r._P, r._hw + 11, C.URBAN, c => c === 255);
    K.each(k => { if (K.CV[k] === 255) K.CV[k] = C.GARDEN; });
    K.building(-160, -560, 56, 24, 0, 10, 3, { n: 'Rådhuset' }); K.building(120 + 40, -760, 32, 16, Math.PI / 2, 11, 2, { n: 'Kirken' });
    for (const [a, b] of [[[-390, -394], [340, -394]], [[-204, -394], [-204, -673]], [[120, -394], [120, -880]], [[-330, -640], [330, -640]], [[-380, -520], [330, -520]], [[-330, -790], [120, -790]], [[300, -394], [300, -640]]]) {
      K.row(a, b, -6.5, { k: R => R() < 0.5 ? 2 : 0, f: R => 2 + Math.floor(R() * 2), len: R => 12 + R() * 10, dep: R => 9 + R() * 4, gap: R => 4 + R() * 8, m: 3 });
      K.row(b, a, -6.5, { k: R => R() < 0.4 ? 2 : 0, f: R => 2 + Math.floor(R() * 2), len: R => 12 + R() * 10, dep: R => 9 + R() * 4, gap: R => 4 + R() * 8, m: 3 });
    }
    // villas and small farms along the roads out of town
    for (const r of K.roads.filter(r => ['Stadionveien', 'Promenaden', 'Parkveien', 'Strandveien', 'Utsiktsveien', 'Flyplassveien'].includes(r.n))) {
      const L = K.line(r); for (const [a, b] of [[L[0], L[L.length - 1]]]) for (const sd of [-1, 1]) {
        for (let i = 4; i < L.length - 4; i += 9) { if (K.R() < 0.45) continue; const h = head(L[i - 1], L[i + 1]), p = add(L[i], side(h), sd * (r.w / 2 + 10 + K.R() * 6)); K.building(p[0], p[1], 10 + K.R() * 4, 7 + K.R() * 2, h + (K.R() - 0.5) * 0.2, 0, 1 + (K.R() < 0.5 ? 1 : 0), { check: true, m: 3 }); }
      }
    }
    // ---- the courses (the street courses follow the streets as they were built)
    K.course({ id: 'torget', name: 'Torgrunden', kind: 'by', diff: 1, path: K.viaRoads([[0, 476], [-408, 476], [-408, -102], [374, -102], [374, 476], [10, 476]]), desc: 'Én runde på Ringveien rundt sentrum: kryss, gangfelt og fortauskanter. Hold fartsgrensen i svingene.' });
    { const lap = K.special.stadium.lap, i = lap.reduce((b, p, k) => Math.hypot(p[0] - stc[0] + 69, p[1] - stc[1]) < Math.hypot(lap[b][0] - stc[0] + 69, lap[b][1] - stc[1]) ? k : b, 0), l2 = [...lap.slice(i), ...lap.slice(1, i + 1)];
      K.course({ id: 'stadion', name: 'Stadionrunden', kind: 'by', diff: 2, gates: 10, path: [...K.viaRoads([[-1047, -560], [-1047, -500], [-905, -500]]), ...l2, ...l2.slice(1), [-905, -500], [-985, -500]],
        desc: 'Inn porten på vestsiden og to runder på løpebanen rundt fotballbanen. Publikum heier.' }); }
    K.course({ id: 'spiral', name: 'Spiraltoppen', kind: 'by', diff: 2, gates: 8, path: [...K.viaRoads([[-408, 440], [-408, 220], [-708, 220]]), ...K.line(ramp)], desc: 'Ned Ringveien, inn P-husveien og opp spiralrampen rundt parkeringshuset. Mål på taket.' });
    K.course({ id: 'trapp', name: 'Trappeløpet', kind: 'bakke', diff: 3, gates: 10, desc: 'Byens bakkeløp fra Ringveien: opp Bakken til Øvre by, gjennom Øvre gate og Kirkegata og opp Utsiktsveien til toppen.',
      path: K.viaRoads([[-408, -60], [-408, -102], [-390, -394], [120, -394], [120, -880], uts]) });
    K.course({ id: 'natt', name: 'Nattbyen', kind: 'natt', diff: 2, night: true, gates: 9, desc: 'Byen etter mørkets frembrudd: Ringveien, ut Havnegata og langs Kaiveien til containerkaia med lyskasterne.',
      path: [...K.viaRoads([[250, -102], [374, -102], [374, 476], [-408, 476], [-600, 628]]), ...K.viaRoads([[-600, 628], [-1050, 622]]).slice(1)] });
    courseSigns(K);
    K.spawnAt([-60, 300], Math.PI);
    K.labels.push({ n: 'Trinnvik', x: 0, z: 0, t: 'town' }, { n: 'Torget', x: 25, z: 145, t: 'square' }, { n: 'Øvre by', x: 0, z: -620, t: 'locality' }, { n: 'Utsikten', x: Math.round(uts[0]), z: Math.round(uts[1]), t: 'peak' },
      { n: 'Skateparken', x: sk[0], z: sk[1], t: 'park' }, { n: 'Byparken', x: park[0], z: park[1], t: 'park' }, { n: 'Stadion', x: stc[0], z: stc[1], t: 'stadium' }, { n: 'P-huset', x: ph[0], z: ph[1], t: 'parking' },
      { n: 'Byggetomta', x: site[0], z: site[1], t: 'site' }, { n: 'Havna', x: 140, z: 1150, t: 'harbour' }, { n: 'Promenaden', x: -200, z: 990, t: 'street' }, { n: 'Kaia', x: -900, z: 640, t: 'harbour' }, { n: 'Flyplassen', x: 1600, z: 300, t: 'airport' });
  } },
});
// a marina: a wooden pier from the shore out over a dredged basin, boats moored along it (drawn by Special)
function marina(K, at, h, name) {
  const u = dirv(h); let s0 = null; for (let s = -60; s < 600; s += 2) { const p = add(at, u, s); if (K.d(p[0], p[1]) <= 0) { s0 = p; break; } }
  if (!s0) return;
  const root = add(s0, u, -6), end = add(s0, u, 70);
  K.cells(Math.min(root[0], end[0]) - 60, Math.min(root[1], end[1]) - 60, Math.max(root[0], end[0]) + 60, Math.max(root[1], end[1]) + 60, (k, x, z) => {
    const along = (x - s0[0]) * u[0] + (z - s0[1]) * u[1], d = lineDist([s0, end], x, z); if (along < 3 || d > 50) return;
    const want = -lerp(3.5, 1.5, smooth(20, 50, d)) * smooth(3, 14, along); if (K.H[k] > want) { K.H[k] = want; K.W[k] = 0; K.CV[k] = C.SEA; K.sea[k] = 1; }
  });
  K.flattenRect(...add(s0, u, -10), 10, 8, h, 2.2, 6);
  K.special.quays.push({ kind: 'marina', x0: R1(root[0]), z0: R1(root[1]), x1: R1(end[0]), z1: R1(end[1]), w: 3, y: 1.6, n: name, boats: 6 });
  K.piers.push([R1(root[0]), R1(root[1]), R1(end[0]), R1(end[1])]);
  K.pois.marina = { x: R1(root[0]), z: R1(root[1]), h: R2(h) };
}
// the stadium: pitch, a running track round it (the course drives the track), four stands with a gap in the west one for the entrance
function stadium(K, c) {
  const y = K.h(...c), s = 50, r = 44, L = 2 * s + 2 * Math.PI * r; K.flattenRect(c[0], c[1], 110, 80, Math.PI / 2, y, 30);
  K.cells(c[0] - 110, c[1] - 80, c[0] + 110, c[1] + 80, (k, x, z) => { K.CV[k] = Math.abs(x - c[0]) < 56 && Math.abs(z - c[1]) < 38 ? C.GRASS : C.URBAN; });
  const track = [];
  for (let i = 0; i <= 64; i++) {
    let u = i / 64 * L, p;
    if (u < s) p = [c[0] - s / 2 + u, c[1] - r]; else if ((u -= s) < Math.PI * r) p = [c[0] + s / 2 + Math.sin(u / r) * r, c[1] - Math.cos(u / r) * r];
    else if ((u -= Math.PI * r) < s) p = [c[0] + s / 2 - u, c[1] + r]; else { u -= s; p = [c[0] - s / 2 - Math.sin(u / r) * r, c[1] + Math.cos(u / r) * r]; }
    track.push(p.map(R1));
  }
  K.road(track, { c: 6, w: 8, s: 3, n: 'Løpebanen', raw: true, profile: () => y + 0.05 });
  for (const [dx, dz, l, d] of [[0, -66, 130, 16], [0, 66, 130, 16], [-104, -32, 16, 36], [-104, 32, 16, 36], [104, 0, 16, 90]]) K.building(c[0] + dx, c[1] + dz, l, d, Math.PI / 2, 8, 2, { y, n: 'Tribunen' });
  K.special.stadium = { x: R1(c[0]), z: R1(c[1]), y: R2(y), pitch: [105, 68], lap: track };
}
// the round parking garage: four decks and an elevated ramp spiralling up round it to the roof deck (a bridge road); returns the ramp
function garage(K, c, y0) {
  const R = 24, top = y0 + 15.2, r0 = 52, r1 = 31, turns = 1.15, pts = [[c[0] + 30, c[1] - r0]];
  K.flatten(c[0], c[1], 62, y0, 25); K.paint(c[0], c[1], 64, C.URBAN);
  for (let i = 0; i <= 70; i++) { const t = i / 70, a = -Math.PI / 2 - t * turns * Math.PI * 2, r = lerp(r0, r1, t); pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  const last = pts[pts.length - 1]; pts.push(add(last, [(c[0] - last[0]) / r1, (c[1] - last[1]) / r1], r1 - R + 7));
  const P = resample(pts, 3); let L = 0; const T = P.map((p, i) => (i && (L += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1])), L));
  const up0 = 30, up1 = L - (r1 - R + 7);
  const ramp = K.road(P, { c: 5, w: 6.5, s: 0, n: 'P-husrampen', raw: true, profile: i => y0 + 0.05 + (top - y0) * clamp((T[i] - up0) / (up1 - up0), 0, 1), bridgeAll: [Math.ceil(up0 / 3) + 1, 0] });
  K.special.decks.push({ x: R1(c[0]), z: R1(c[1]), hw: 17, hd: 17, ang: 0, y: R2(top), kind: 'roof' });
  const gap = ((-Math.PI / 2 - turns * Math.PI * 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);      // where the ramp comes onto the roof
  K.special.garage = { x: R1(c[0]), z: R1(c[1]), r: R, y0: R2(y0), y1: R2(top), levels: 4, gap: R2(gap), n: 'P-huset' };
  K.special.signs.push({ x: R1(c[0] + 44), z: R1(c[1] - r0 + 12), h: Math.PI / 2, text: 'P-HUS', sub: 'spiral til taket' });
  return ramp;
}
// a road that climbs round a cone at a steady grade g: from the cone's mean height at each radius, each 8 m step goes round and inwards
// just enough to climb g (at least 45° round, so it never heads straight for the top on the flat foot)
function coneRoad(K, c, start, g, stopH, rMin) {
  const prof = []; for (let r = 0; r <= 1400; r += 10) { let sum = 0, n = 0; for (let a = 0; a < 6.283; a += 0.05) { sum += K.h(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r); n++; } prof.push(sum / n); }
  const Hr = r => { const f = Math.max(0, r) / 10, i = Math.min(prof.length - 2, Math.floor(f)); return lerp(prof[i], prof[i + 1], f - i); };
  let r = Math.hypot(start[0] - c[0], start[1] - c[1]), th = Math.atan2(start[1] - c[1], start[0] - c[0]); const pts = [start.slice()];
  for (let i = 0; i < 3000; i++) {
    const dH = (Hr(r - 5) - Hr(r + 5)) / 10, ds = 8, dr = dH > 1e-3 ? Math.min(ds * 0.7, g * ds / dH) : ds * 0.7;
    r -= dr; th += Math.sqrt(Math.max(0, ds * ds - dr * dr)) / r;
    if (i % 3 === 2) pts.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]);
    if (Hr(r) >= stopH || r < rMin) { pts.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]); break; }
  }
  return chaikin(pts, 2);
}
// a wobbly ring round a centre (lakes, ponds)
// the old maps' roads are straight lines between a few points: broad bends along the whole road, the kept points (ends, junctions) stay put
function bend(K, pts, amp = 110, keep = [0, pts.length - 1]) {
  const S = [0]; for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const P = resample(pts, 15), n = P.length, sd = (pts[0][0] * 0.0137 + pts[0][1] * 0.0071) % 50;
  return P.map((p, i) => {
    if (i === 0 || i === n - 1) return p;
    const s = S[S.length - 1] * i / (n - 1), f = Math.min(...keep.map(k => smooth(0, 180, Math.abs(s - S[k]))));
    return add(p, side(head(P[i - 1], P[i + 1])), amp * f * K.n3(s / 420 + sd, 3.3 + sd));
  });
}
function wobble(c, r, a, K) { const p = []; for (let i = 0; i < 32; i++) { const t = i / 32 * Math.PI * 2, f = 1 + 0.12 * a * K.noise(Math.cos(t) * 1.5 + c[0] / 80, Math.sin(t) * 1.5 + c[1] / 80); p.push([c[0] + Math.cos(t) * r * f, c[1] + Math.sin(t) * r * f]); } return p; }
// a lava river from the crater rim downhill: a channel just below the ground with levees on both sides, glowing (Special draws the lava).
// During the build its cells count as water, so roads bridge it.
function lavaRiver(K, pts, o) {
  const P = spline(pts, 6), n = P.length, hw = P.map((_, i) => o.hw(i / (n - 1)));
  let y = P.map(([x, z]) => K.h(x, z) - 1.6); for (let i = 1; i < n; i++) y[i] = Math.min(y[i], y[i - 1] - 0.08);
  y = gauss1(y, 2).map((v, i) => Math.min(v, y[i] + 0.3));
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  K.cells(x0 - 25, z0 - 25, x1 + 25, z1 + 25, (k, x, z) => {
    const q = nearestOnLine(P, x, z), i = Math.min(n - 1, q.i + (q.t > 0.5 ? 1 : 0)), w = hw[i], yy = y[i], d = q.d; if (d > w + 14) return;
    if (d < w) { K.H[k] = Math.min(K.H[k], yy - 0.6 * (1 - (d / w) ** 2) - 0.2); K.CV[k] = C.LAVA; K.W[k] = yy; K.LAVA[k] = 1; }
    else if (d < w + 4) { K.H[k] = Math.max(K.H[k], yy + 1.4 * Math.sin(Math.PI * (d - w) / 4) + 0.2); K.CV[k] = C.ASH; }
    else { const f = 1 - smooth(w + 4, w + 14, d); K.H[k] = lerp(K.H[k], Math.max(K.H[k], yy + 0.3), f * 0.5); if (K.CV[k] === C.JUNGLE) K.CV[k] = C.ASH; }
  });
  K.special.lava.push({ p: P.flatMap((p, i) => [R1(p[0]), R1(p[1]), R2(y[i]), R1(hw[i])]) });
}
// a chairlift from a (bottom) to b (top): towers every ~80 m tall enough that the cable clears the ground, a station building at each end
function lift(K, a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), h = head(a, b), u = dirv(h), nT = Math.max(2, Math.round(L / 80) - 1), ya = K.h(...a), yb = K.h(...b);
  const towers = [];
  for (let i = 1; i <= nT; i++) { const t = i / (nT + 1), p = add(a, u, L * t), g = K.h(...p); towers.push({ x: R1(p[0]), z: R1(p[1]), y: R2(g), h: 9 }); }
  // the cable runs straight between the tops of the towers and the stations (7 m up); raise towers where the cable comes too close to the snow
  const pts = [{ d: 0, y: ya + 7 }, ...towers.map((t, i) => ({ d: L * (i + 1) / (nT + 1), y: t.y + t.h })), { d: L, y: yb + 7 }];
  for (let it = 0; it < 20; it++) for (let i = 1; i < pts.length - 1; i++) {
    for (let s = 0.25; s < 1; s += 0.25) { const d = lerp(pts[i - 1].d, pts[i + 1].d, s), p = add(a, u, d), g = K.h(...p), cy = lerp(pts[i - 1].y, pts[i + 1].y, s); if (cy < g + 6) { pts[i].y += 0.5; towers[i - 1].h = R1(pts[i].y - towers[i - 1].y); } }
  }
  K.special.lift = { name: 'Gautefallheisen', bottom: { x: R1(a[0]), z: R1(a[1]), y: R2(ya) }, top: { x: R1(b[0]), z: R1(b[1]), y: R2(yb) }, towers, off: 2.6, station: 7 };
  K.pois.ski = { bottom: { x: R1(a[0]), z: R1(a[1]) }, top: { x: R1(b[0]), z: R1(b[1]) } };
  for (const [p, n] of [[a, 'Bunnstasjonen'], [b, 'Toppstasjonen']]) { K.flatten(p[0], p[1], 16, K.h(...p), 10); K.building(...add(p, u, p === a ? -9 : 9), 14, 12, h, 8, 1, { n }); }
}
const KAIMAN_DESC = ['Rundt den store gjørmesletta i sørøst. Gjørmehull, siv og hegrer. Hold farten oppe!',
  'Tre vadesteder over Storelva og Sølebekken. Kaimanene ligger på bredden og ser på deg.',
  'Gjennom tett regnskog, over Østelva og fram til den gamle tempelruinen. Tør du kjøre opp trappa?',
  'Grunne kanaler mellom mangrovetrærne i deltaet. Vått, glatt og fullt av liv.',
  'Opp den steinete flanken på Apeberget, rundt toppen og fram til stupkanten der fossen faller.'];
const R1 = v => Math.round(v * 10) / 10, R2 = v => Math.round(v * 100) / 100;
// where the old level had its village, and the way out to sea from there
function oldVillage(K) { const f = K.old.lv.ferry; return [K.P([f.pad.x, f.pad.z]), K.dirOld(f.dir / DEG)]; }
// a safari or jungle camp: a cleared pad with tents round a fire, a lodge, a lookout tower and a sign
function camp(K, c, h, name = 'SAFARILEIREN') {
  const u = dirv(h), v = side(h), y = K.h(c[0], c[1]);
  const tents = [[-22, 10, 0.3], [-8, 18, 0.1], [8, 18, -0.1], [22, 10, -0.3], [-18, -14, 2.8], [18, -14, -2.8]].map(([a, b, r]) => { const p = add(add(c, v, a), u, b); return { x: R1(p[0]), z: R1(p[1]), h: R2(h + Math.PI + r), w: 4.5, l: 6, y: R2(K.h(p[0], p[1])) }; });
  K.special.tents.push(...tents);
  const lodge = add(c, u, -28); K.building(lodge[0], lodge[1], 18, 9, h + Math.PI / 2, 3, 1, { n: 'Lodgen' });
  const tw = add(add(c, v, 26), u, -6), fire = c;
  K.special.camp = K.special.camp || [];
  K.special.camp.push({ x: R1(c[0]), z: R1(c[1]), y: R2(y), tower: { x: R1(tw[0]), z: R1(tw[1]), y: R2(K.h(tw[0], tw[1])), h: 7 }, fire: { x: R1(fire[0]), z: R1(fire[1]) } });
  const sg = add(add(c, v, -30), u, 12); K.special.signs.push({ x: R1(sg[0]), z: R1(sg[1]), h: R2(h), text: name, sub: name === 'SAFARILEIREN' ? 'pass deg for løvene' : 'leiren · 5 løyper' });
}
// a stepped temple of stone: four terraces, a stairway up the south face, a small shrine on top (the shrine and walls are drawn by Special)
function temple(K, c) {
  const y0 = K.h(c[0], c[1]) + 0.5, tiers = [[32, 3], [26, 6], [20, 9], [14, 12]], ramp = 38;
  K.flatten(c[0], c[1] + 6, 46, y0, 25);
  K.cells(c[0] - 40, c[1] - 40, c[0] + 40, c[1] + 40 + ramp, (k, x, z) => {
    const ax = Math.abs(x - c[0]), az = Math.abs(z - c[1]), m = Math.max(ax, az); let top = -1;
    for (const [s, h] of tiers) if (m <= s) top = h;
    const along = z - (c[1] + tiers[3][0]);                       // the stairway climbs northwards up the south face
    if (ax < 4.5 && along > -tiers[3][0] && along < ramp) { const rt = tiers[3][1] * (1 - Math.max(0, along) / ramp); top = Math.max(top, rt); }
    if (top < 0) return; K.H[k] = y0 + top; K.CV[k] = C.ROCK; K.KEEP[k] = 1; K.ROAD[k] = 1;
  });
  K.special.temple = { x: R1(c[0]), z: R1(c[1]), y: R2(y0), tiers, stair: { w: 9, len: ramp } };
  const T = tiers[3], yt = y0 + T[1];
  for (const [a, b, l, ang] of [[-T[0] + 1, 0, T[0] * 2 - 2, 0], [T[0] - 1, 0, T[0] * 2 - 2, 0], [0, -T[0] + 1, T[0] * 2 - 2, Math.PI / 2]])
    K.special.walls.push({ x: R1(c[0] + a), z: R1(c[1] + b), l: R1(l), h: 2.2, w: 1.2, ang: R2(ang), y: R2(yt) });
}

// land cover for the Norwegian islands: bare rock where it is steep or high and windswept, heath and grass in the open, forest in shelter,
// bogs in the flat hollows. o.rock(k) more rock, o.heath/o.forest thresholds, o.cove(x,z) beaches, o.bogFill: the old river beds are bogs
function nordicCover(K, o = {}) {
  K.each((k, x, z) => {
    if (K.sea[k] || K.CV[k] === C.LAKE || K.CV[k] === C.STREAM) return;
    const d = K.D[k], s = K.slope(x, z), n = fbm(K.n2, x / 150, z / 150, 3), m = fbm(K.n3, x / 60, z / 60, 2);
    let c = n > (o.heath ?? 0.15) ? C.HEATH : n > -0.1 ? C.MIXED : n > (o.forest ?? -0.3) ? C.FOREST : C.FOREST;
    if (o.forest > 0 && n < o.forest) c = m > 0.25 ? C.MIXED : C.FOREST;
    if (o.field && n > 0.35 && s < 0.08) c = m > 0 ? C.FARM : C.GRASS;
    if (K.FILL[k] && (o.bogFill || s < 0.05)) c = m > 0.05 ? C.BOG : C.GRASS;
    if (s < 0.03 && m > 0.45) c = C.BOG;
    if (s > 0.42 || (o.rock && o.rock(k)) || (K.rockH && K.rockH[k] > 1.8) || d < 14 + 12 * m) c = C.ROCK;
    if (o.cove && o.cove(x, z) > 0.5 && d < 40) c = C.BEACH;
    K.CV[k] = c;
  });
}
// small tarns in the deepest hollows of the old low ground
function tarns(K, n, name) {
  const F = K.FILL.map((v, k) => v && !K.sea[k] && K.CV[k] !== C.LAKE ? 0 : 1), D = edt(F, K.nx, K.nz);
  for (let t = 0; t < n; t++) {
    let best = -1, bk = 0; for (let k = 0; k < D.length; k++) if (D[k] > best) { best = D[k]; bk = k; }
    if (best < 10) break;
    const x = K.x0 + (bk % K.nx) * K.cell, z = K.z0 + Math.floor(bk / K.nx) * K.cell, r = Math.min(110, best * K.cell * 0.55);
    K.pond(x, z, r, { name: t ? null : name, bog: true, depth: 2 });
    K.labels.push({ n: name, x: Math.round(x), z: Math.round(z), t: 'lake' });
    K.disc(x, z, r * 3, (k) => { D[k] = 0; });
  }
}

// ------------------------------------------------------------------ main
const args = process.argv.slice(2), pv = args.indexOf('--preview'), pdir = pv >= 0 ? args[pv + 1] : null;
const ids = (args[0] && !args[0].startsWith('--') ? args[0].split(',') : Object.keys(RECIPES));
const bd = parseGrid(new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'world/backdrop/terrain.bin.gz')))));
for (const id of ids) {
  const t0 = Date.now(), def = WORLD.islands.find(d => d.id === id), R = RECIPES[id];
  const old = runOld(ROOT, id);
  // the grid: the old island's land, scaled, with 800 m of sea round it (the coast moves a little, and 600 m of sea must remain)
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (let j = 0; j < old.N; j++) for (let i = 0; i < old.N; i++) if (old.TB[j * old.N + i] > old.water) { const x = -(-old.HALF + i * old.CELL) * R.S, z = -(-old.HALF + j * old.CELL) * R.S; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const M = R.margin ?? 900, rnd = v => Math.round(v / 50) * 50;
  const K = new IslandBuild({ id, name: def.name, seed: def.seed, S: R.S, V: R.V, x0: rnd(x0 - M), z0: rnd(z0 - M), x1: rnd(x1 + M), z1: rnd(z1 + M), ox: def.ox, oz: def.oz, old, backdrop: bd });
  R.build(K);
  const dir = path.join(ROOT, 'world', id); fs.mkdirSync(dir, { recursive: true });
  const sz = K.write(dir), st = K.stats();
  console.log(`${id.padEnd(10)} ${def.name.padEnd(10)} ${st.size.join('×')} m, høyde ${st.h.join('…')} m, land ${st.landKm2} km², veier ${st.roadKm} km (${st.roads}), hus ${st.buildings}, løyper ${st.courses}, ` +
    `${sz.map(s => Math.round(s / 1024)).join('+')} kB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (pdir) { fs.mkdirSync(pdir, { recursive: true }); K.preview(path.join(pdir, id + '.png'), 1); }
}
