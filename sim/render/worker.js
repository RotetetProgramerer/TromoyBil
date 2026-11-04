// The mesh worker: loads its own copy of the world and builds terrain chunks, road ribbons, buildings and tree lists
// off the main thread, so driving never stutters while the land round the car is built.
import { World } from '../world/world.js';
import { terrainChunk, roadTile, buildingTile } from './meshgen.js';

let world = null;
// the message loop runs in the worker only: Node (tools/test-trees.mjs) imports treeTile() below without one
const ready = typeof self === 'undefined' ? null : new Promise(res => {
  self.onmessage = async e => {
    const m = e.data;
    if (m.type === 'init') {
      world = new World();
      for (const d of m.islands) await world.addIsland(m.base, d);
      res(); self.postMessage({ type: 'ready' });
      return;
    }
    await ready;
    try { handle(m); } catch (err) { self.postMessage({ type: 'error', id: m.id, msg: String(err && err.stack || err) }); }
  };
});

function handle(m) {
  if (m.type === 'pads') { const isl = world.islands.find(i => i.id === m.id); if (isl) { isl.pads = m.pads; isl.scatterCache.clear(); } return; }
  if (m.type === 'terrain') {
    const c = terrainChunk(world, m.x0, m.z0, m.size, m.n);
    self.postMessage({ type: 'terrain', id: m.id, P: c.P, N: c.N, ymin: c.ymin, ymax: c.ymax }, [c.P.buffer, c.N.buffer]);
  } else if (m.type === 'roads' || m.type === 'buildings' || m.type === 'trees') {
    const res = { type: m.type, id: m.id, parts: [] }, tr = [];
    for (const isl of world.islands) {
      if (m.x0 + m.size < isl.x0 || m.x0 > isl.x1 || m.z0 + m.size < isl.z0 || m.z0 > isl.z1) continue;
      if (m.type === 'roads') { const r = roadTile(world, isl, m.x0, m.z0, m.size, m.detail || 1); if (r.I.length) { res.parts.push(r); tr.push(r.P.buffer, r.U.buffer, r.K.buffer, r.I.buffer); } }
      else if (m.type === 'buildings') { const b = buildingTile(isl, m.x0, m.z0, m.size, m.lod || 0); if (b.I.length) { res.parts.push(b); tr.push(b.P.buffer, b.N.buffer, b.U.buffer, b.C.buffer, b.M.buffer, b.I.buffer); } }
      else { const A = treeTile(world, isl, m.x0, m.z0, m.size, m.keep || 1); if (A.length) { res.parts.push({ T: A }); tr.push(A.buffer); } }
    }
    self.postMessage(res, tr);
  }
}

// The trees and rocks of one island in a tile: [x, y, z, size, angle, kind] per instance, from every cell of 32 m the tile
// overlaps; only the trees inside the tile are taken (an island's cells need not line up with the tile), so each tree is in
// exactly one tile and the renderer's cells of 64 m hold what they say. The backdrop (the coarse coast round the islands, 40 m
// cells, no roads or houses) grows none where a real island covers the ground: there the island's own trees stand, clear of
// its roads and houses and on its 5 m terrain. "Covers" is what world.islandAt() says (the same margin), so the trees the car
// hits are the trees it sees.
const MARGIN = 10;
export function treeTile(world, isl, x0, z0, size, keep = 1) {
  let over = null;    // the real islands a backdrop tile reaches into: none → no test per tree; one covering the whole tile → no trees
  if (isl.def.backdrop) {
    over = world.islands.filter(o => !o.def.backdrop && x0 + size > o.x0 + MARGIN && x0 < o.x1 - MARGIN && z0 + size > o.z0 + MARGIN && z0 < o.z1 - MARGIN);
    if (over.some(o => o.inside(x0, z0, MARGIN) && o.inside(x0 + size, z0 + size, MARGIN))) return new Float32Array(0);
    if (!over.length) over = null;
  }
  const L = [], ci0 = Math.floor((x0 - isl.ox) / 32), ci1 = Math.ceil((x0 + size - isl.ox) / 32) - 1, cj0 = Math.floor((z0 - isl.oz) / 32), cj1 = Math.ceil((z0 + size - isl.oz) / 32) - 1;
  for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
    const S = isl.scatter(ci, cj);
    for (let i = 0; i < S.length; i += keep) {
      const t = S[i], x = t.x + isl.ox, z = t.z + isl.oz;
      if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
      if (over && over.some(o => o.inside(x, z, MARGIN))) continue;
      L.push(x, t.y, z, t.s * (keep > 1 ? 1.1 : 1), t.a, t.k);
    }
  }
  return Float32Array.from(L);
}
