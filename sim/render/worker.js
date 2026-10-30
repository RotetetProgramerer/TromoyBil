// The mesh worker: loads its own copy of the world and builds terrain chunks, road ribbons, buildings and tree lists
// off the main thread, so driving never stutters while the land round the car is built.
import { World } from '../world/world.js';
import { terrainChunk, roadTile, buildingTile } from './meshgen.js';

let world = null;
const ready = new Promise(res => {
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
      else {
        // trees and rocks: [x, y, z, size, angle, kind] per instance, every cell of 32 m in the tile
        const L = [];
        const ci0 = Math.floor((m.x0 - isl.ox) / 32), cj0 = Math.floor((m.z0 - isl.oz) / 32), nC = Math.ceil(m.size / 32), keep = m.keep || 1;
        for (let cj = cj0; cj < cj0 + nC; cj++) for (let ci = ci0; ci < ci0 + nC; ci++) {
          const S = isl.scatter(ci, cj);
          for (let i = 0; i < S.length; i += keep) { const t = S[i]; L.push(t.x + isl.ox, t.y, t.z + isl.oz, t.s * (keep > 1 ? 1.1 : 1), t.a, t.k); }
        }
        const A = Float32Array.from(L); res.parts.push({ T: A }); tr.push(A.buffer);
      }
    }
    self.postMessage(res, tr);
  }
}
