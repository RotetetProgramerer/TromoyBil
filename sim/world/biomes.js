// Trees, bushes and rocks for the made-up islands, one scatter per biome. Same output as scatterNordic in island.js: per 32 m cell,
// [{x,z,y,k (KIND),s (size),a (angle),col (trunk radius, 0 = drive through)}] in island coordinates, deterministic from the cell and
// the island's seed, so the renderer draws the trees the car hits. Kept clear of roads, buildings, water and the special places
// (pistes and the lift line, lava, quays, the temple, camps) that features.special describes.
import { KIND as K, COVER as C, scatterNordic } from './island.js';
import { mulberry32 } from './grid.js';

// per biome: tries per cell, and per land cover [density, [[kind, weight, smallest size, largest size], …]]
// (built on first use: island.js imports this file, so its constants are not ready while this one loads)
let T = null, SOFT, BIG;
function tables() {
  if (T) return T;
  const sub = {
    [C.BEACH]: [0.014, [[K.PALM, 6, 0.75, 1.2], [K.AGAVE, 3, 0.7, 1.2], [K.GRASSCLUMP, 2, 0.6, 1.1]]],
    [C.GRASS]: [0.1, [[K.GRASSCLUMP, 5, 0.6, 1.2], [K.AGAVE, 2, 0.7, 1.3], [K.BUSH, 2, 0.5, 1.0], [K.OLIVE, 1, 0.6, 1.0], [K.PALM, 1, 0.7, 1.1]]],
    [C.HEATH]: [0.3, [[K.BUSH, 4, 0.5, 1.1], [K.OLIVE, 3, 0.6, 1.1], [K.AGAVE, 2, 0.7, 1.3], [K.CYPRESS, 1, 0.5, 0.9], [K.GRASSCLUMP, 1, 0.6, 1.1]]],
    [C.FOREST]: [0.5, [[K.PALM, 7, 0.75, 1.25], [K.BUSH, 2, 0.6, 1.1], [K.FERN, 2, 0.6, 1.2]]],
    [C.GARDEN]: [0.08, [[K.PALM, 3, 0.7, 1.1], [K.CYPRESS, 3, 0.5, 0.9], [K.OLIVE, 3, 0.6, 1.0], [K.BUSH, 2, 0.5, 0.9]]],
    [C.ROCK]: [0.05, [[K.AGAVE, 5, 0.7, 1.3], [K.ROCK, 3, 0.5, 1.4], [K.BUSH, 2, 0.4, 0.8]]],
    [C.DUNE]: [0.07, [[K.GRASSCLUMP, 6, 0.7, 1.3], [K.AGAVE, 2, 0.6, 1.1], [K.BUSH, 1, 0.4, 0.8], [K.PALM, 0.6, 0.7, 1.1]]],
  };
  const jungle = {
    [C.JUNGLE]: [0.85, [[K.JUNGLE, 7, 0.45, 1.05], [K.FERN, 5, 0.7, 1.4], [K.BUSH, 4, 0.6, 1.2], [K.PALM, 2, 0.7, 1.2]]],
    [C.GRASS]: [0.14, [[K.FERN, 3, 0.6, 1.2], [K.BUSH, 3, 0.6, 1.1], [K.PALM, 2, 0.7, 1.2], [K.GRASSCLUMP, 2, 0.8, 1.4]]],
    [C.MUD]: [0.2, [[K.REED, 4, 0.8, 1.4], [K.BUSH, 3, 0.7, 1.3], [K.JUNGLE, 2, 0.22, 0.38], [K.PALM, 1, 0.7, 1.1]]],
    [C.BOG]: [0.14, [[K.REED, 6, 0.8, 1.5], [K.FERN, 2, 0.7, 1.2], [K.BUSH, 2, 0.6, 1.0]]],
    [C.BEACH]: [0.025, [[K.PALM, 8, 0.75, 1.25], [K.BUSH, 2, 0.5, 0.9]]],
    [C.ROCK]: [0.1, [[K.FERN, 3, 0.6, 1.2], [K.BUSH, 3, 0.6, 1.0], [K.ROCK, 4, 0.6, 1.6]]],
  };
  SOFT = new Set([K.BUSH, K.JUNIPER, K.REED, K.FERN, K.GRASSCLUMP, K.AGAVE]);
  BIG = new Set([K.SPRUCE, K.OAK, K.JUNGLE, K.BAOBAB, K.ACACIA, K.SNOWSPRUCE, K.PALM]);
  T = {
    subtropical: { n: 40, cover: sub },
    jungle: { n: 48, cover: jungle },
    savanna: { n: 30, cover: {
      [C.SAVANNA]: [0.055, [[K.ACACIA, 4, 0.7, 1.25], [K.GRASSCLUMP, 5, 0.8, 1.5], [K.BUSH, 1, 0.5, 0.9], [K.ROCK, 1, 0.45, 0.8], [K.BAOBAB, 0.4, 0.8, 1.2]]],
      [C.DIRT]: [0.035, [[K.ROCK, 4, 0.45, 0.85], [K.GRASSCLUMP, 3, 0.8, 1.4], [K.ACACIA, 2, 0.6, 1.1], [K.BUSH, 1, 0.5, 0.9]]],
      [C.DECID]: [0.22, [[K.BAOBAB, 4, 0.75, 1.25], [K.ACACIA, 4, 0.7, 1.25], [K.BUSH, 2, 0.6, 1.1], [K.GRASSCLUMP, 1, 0.8, 1.4]]],
      [C.GRASS]: [0.2, [[K.ACACIA, 2, 0.7, 1.2], [K.PALM, 2, 0.7, 1.1], [K.BUSH, 3, 0.6, 1.2], [K.GRASSCLUMP, 3, 0.9, 1.6], [K.REED, 1, 0.8, 1.3]]],
      [C.MUD]: [0.12, [[K.REED, 7, 0.8, 1.5], [K.BUSH, 2, 0.6, 1.0]]],
      [C.ROCK]: [0.12, [[K.ROCK, 7, 2.2, 6.0], [K.BUSH, 2, 0.5, 0.9], [K.ACACIA, 1, 0.6, 1.0]]],     // the granite boulders of the kopje
      [C.GRAVEL]: [0.05, [[K.ROCK, 6, 0.8, 2.6], [K.GRASSCLUMP, 4, 0.8, 1.3]]],
      [C.BEACH]: [0.008, [[K.PALM, 1, 0.8, 1.1]]],
    } },
    winter: { n: 40, cover: {
      [C.SNOWFOREST]: [0.6, [[K.SNOWSPRUCE, 10, 0.45, 1.05], [K.DEADTREE, 0.6, 0.4, 0.7], [K.ROCK, 1, 0.4, 1.2]]],     // bare birches among the spruce
      [C.SNOW]: [0.05, [[K.SNOWSPRUCE, 6, 0.35, 0.9], [K.DEADTREE, 1, 0.35, 0.6], [K.ROCK, 2, 0.4, 1.2]]],
      [C.ROCK]: [0.05, [[K.ROCK, 6, 0.5, 1.6], [K.SNOWSPRUCE, 3, 0.35, 0.7]]],
      [C.GRAVEL]: [0.02, [[K.ROCK, 1, 0.4, 1.2]]],
      [C.URBAN]: [0.01, [[K.SNOWSPRUCE, 1, 0.4, 0.7]]],
    } },
    volcano: { n: 46, cover: Object.assign({}, jungle, {
      [C.DIRT]: [0.16, [[K.DEADTREE, 4, 0.5, 1.1], [K.BUSH, 3, 0.5, 1.0], [K.FERN, 1, 0.6, 1.0], [K.ROCK, 3, 0.5, 1.4]]],
      [C.ASH]: [0.015, [[K.DEADTREE, 5, 0.5, 1.0], [K.ROCK, 5, 0.6, 1.8]]],
      [C.ROCK]: [0.06, [[K.ROCK, 7, 0.6, 2.0], [K.DEADTREE, 3, 0.5, 0.9]]],
    }) },
    town: { n: 36, cover: {
      [C.URBAN]: [0.004, [[K.OAK, 1, 0.5, 0.8], [K.BIRCH, 1, 0.5, 0.8]]],
      [C.GARDEN]: [0.08, [[K.FRUIT, 3, 0.6, 1.1], [K.BIRCH, 2, 0.5, 0.9], [K.BUSH, 3, 0.5, 1.0], [K.OAK, 1, 0.6, 1.0], [K.SPRUCE, 1, 0.4, 0.8]]],
      [C.GRASS]: [0.05, [[K.OAK, 3, 0.6, 1.1], [K.BIRCH, 2, 0.6, 1.0], [K.ASPEN, 1, 0.6, 1.0], [K.BUSH, 3, 0.5, 1.0]]],
      [C.DECID]: [0.55, [[K.OAK, 3, 0.6, 1.1], [K.BIRCH, 3, 0.6, 1.0], [K.ASPEN, 2, 0.6, 1.0], [K.BUSH, 2, 0.5, 1.0]]],
      [C.HEATH]: [0.3, [[K.PINE, 3, 0.45, 0.9], [K.JUNIPER, 3, 0.5, 1.0], [K.BUSH, 1, 0.5, 0.9]]],
      [C.ROCK]: [0.04, [[K.PINE, 2, 0.4, 0.8], [K.JUNIPER, 2, 0.5, 1.0], [K.ROCK, 2, 0.5, 1.2]]],
      [C.BEACH]: [0.004, [[K.BUSH, 1, 0.5, 0.9]]],
    } },
  };
  return T;
}

// the places features.special says must stay clear, in a coarse grid of 64 m cells: lines [x,z,…] with a half width, and circles
function keepOut(isl) {
  if (isl._keep) return isl._keep;
  const sp = isl.feat.special || {}, shapes = [], grid = new Map();
  const line = (p, step, w) => { const L = []; for (let i = 0; i + 1 < p.length; i += step) L.push(p[i], p[i + 1]); shapes.push({ L, w }); };
  for (const p of sp.pistes || []) line(p.p, 3, p.hw + 5);
  for (const l of sp.lava || []) { let w = 0; for (let i = 3; i < l.p.length; i += 4) w = Math.max(w, l.p[i]); line(l.p, 4, w + 8); }
  for (const q of sp.quays || []) shapes.push({ L: [q.x0, q.z0, q.x1, q.z1], w: q.w / 2 + 8 });
  if (sp.lift) shapes.push({ L: [sp.lift.bottom.x, sp.lift.bottom.z, sp.lift.top.x, sp.lift.top.z], w: 14 });
  for (const c of sp.lavaPools || []) shapes.push({ x: c.x, z: c.z, r: c.r + 20 });
  for (const c of sp.camp || []) shapes.push({ x: c.x, z: c.z, r: 48 });
  for (const t of sp.tents || []) shapes.push({ x: t.x, z: t.z, r: 6 });
  if (sp.temple) shapes.push({ x: sp.temple.x, z: sp.temple.z + 12, r: 62 });
  for (const s of sp.squares || []) shapes.push({ x: s.x, z: s.z, r: (s.r || Math.max(s.w, s.l) / 2) + 4 });
  if (sp.garage) shapes.push({ x: sp.garage.x, z: sp.garage.z, r: 62 });
  if (sp.stadium) shapes.push({ x: sp.stadium.x, z: sp.stadium.z, r: 120 });
  for (const v of sp.vents || []) shapes.push({ x: v.x, z: v.z, r: Math.max(12, v.s * 0.6) });
  if (sp.runway) { const r = sp.runway, dx = r.x1 - r.x0, dz = r.z1 - r.z0, e = 200 / Math.hypot(dx, dz); shapes.push({ L: [r.x0 - dx * e, r.z0 - dz * e, r.x1 + dx * e, r.z1 + dz * e], w: r.w / 2 + 150 }); }   // the cleared strip
  if (sp.airport) for (const c of [sp.airport.terminal, sp.airport.tower]) if (c) shapes.push({ x: c.x, z: c.z, r: c === sp.airport.tower ? 30 : 130 });
  const put = (s, x0, z0, x1, z1) => { for (let j = Math.floor(z0 / 64); j <= Math.floor(z1 / 64); j++) for (let i = Math.floor(x0 / 64); i <= Math.floor(x1 / 64); i++) { const key = i * 73856093 ^ j * 19349663; let L = grid.get(key); if (!L) grid.set(key, L = []); L.push(s); } };
  for (const s of shapes) {
    if (s.L) for (let i = 0; i + 3 < s.L.length; i += 2) { const seg = { a: [s.L[i], s.L[i + 1]], b: [s.L[i + 2], s.L[i + 3]], w: s.w }; put(seg, Math.min(seg.a[0], seg.b[0]) - s.w, Math.min(seg.a[1], seg.b[1]) - s.w, Math.max(seg.a[0], seg.b[0]) + s.w, Math.max(seg.a[1], seg.b[1]) + s.w); }
    else put(s, s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r);
  }
  return (isl._keep = (x, z) => {
    const L = grid.get(Math.floor(x / 64) * 73856093 ^ Math.floor(z / 64) * 19349663); if (!L) return false;
    for (const s of L) {
      if (s.r != null) { if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) return true; continue; }
      const ex = s.b[0] - s.a[0], ez = s.b[1] - s.a[1], l2 = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((x - s.a[0]) * ex + (z - s.a[1]) * ez) / l2));
      if (Math.hypot(x - s.a[0] - ex * t, z - s.a[1] - ez * t) < s.w) return true;
    }
    return false;
  });
}

function scatterBiome(isl, ci, cj, B, salt) {
  const out = [], R = mulberry32(((ci * 92837111) ^ (cj * 689287499) ^ (isl.seed * 7 + salt)) >>> 0), x0 = ci * 32, z0 = cj * 32, keep = keepOut(isl);
  for (let n = 0; n < B.n; n++) {
    const x = x0 + R() * 32, z = z0 + R() * 32, roll = R(), pick = R(), sz = R(), ang = R() * 6.283;
    const c = isl.cover.nearest(x, z), t = B.cover[c]; if (!t || roll > t[0]) continue;
    const y = isl.grid.bicubic(x, z); if (y < 0.6) continue;
    const q = isl.roads.query(x, z);
    if (q && q.d < q.hw + (q.c <= 4 ? 4.5 : 3.0)) continue;                         // the verge is kept clear along the roads and tracks
    if (isl.inBuilding(x, z, 3) || keep(x, z)) continue;
    // the kind, by weight; its size
    let tot = 0; for (const e of t[1]) tot += e[1];
    let w = pick * tot, e = t[1][0]; for (const f of t[1]) { if ((w -= f[1]) <= 0) { e = f; break; } }
    let k = e[0], s = e[2] + sz * (e[3] - e[2]);
    // the winter forest thins out up the mountain: no trees above the tree line, only rocks
    if (B === T.winter && k !== K.ROCK) { const f = 1 - Math.min(1, Math.max(0, (y - 150) / 70)); if (sz > f) continue; s *= 0.7 + 0.3 * f; }
    const h1 = isl.grid.bilinear(x + 2, z), h2 = isl.grid.bilinear(x, z + 2), slope = Math.hypot(h1 - y, h2 - y) / 2;
    if (slope > 0.9 && k !== K.ROCK) continue;
    if (q && BIG.has(k) && q.d < q.hw + 1.6 + s * 5) continue;                    // big crowns reach out over the road
    if (q && k === K.ROCK && q.d < q.hw + 1.5 + s) continue;                       // and so do big boulders
    const col = k === K.ROCK ? s * 0.9 : SOFT.has(k) ? 0 : k === K.BAOBAB ? 0.6 + s * 0.8 : k === K.PALM ? 0.12 + s * 0.12 : 0.1 + s * 0.2;
    out.push({ x, z, y, k, s, a: ang, col });
  }
  return out;
}

export const BIOMES = {
  nordic: (isl, ci, cj) => scatterNordic(isl, ci, cj),
  subtropical: (isl, ci, cj) => scatterBiome(isl, ci, cj, tables().subtropical, 11),
  jungle: (isl, ci, cj) => scatterBiome(isl, ci, cj, tables().jungle, 23),
  savanna: (isl, ci, cj) => scatterBiome(isl, ci, cj, tables().savanna, 37),
  winter: (isl, ci, cj) => scatterBiome(isl, ci, cj, tables().winter, 41),
  volcano: (isl, ci, cj) => scatterBiome(isl, ci, cj, tables().volcano, 53),
  town: (isl, ci, cj) => scatterBiome(isl, ci, cj, tables().town, 67),
};
