// What the special structures of an island (features.special, made by tools/geo/build_islands.mjs) mean for the car: the quays, piers
// and roof decks it can drive on (isl.decks) and the railings, posts, walls and tents it hits (isl.extraColliders), all in world
// coordinates. No three.js here: sim/render/special.js calls it when it draws them, and the tests call it directly.
import { SURF } from '../physics/surfaces.js';

// a box collider along a line from a to b (half thickness t), from height y0 to y1
function rail(out, ax, az, bx, bz, t, y0, y1) {
  const L = Math.hypot(bx - ax, bz - az); if (L < 0.2) return;
  out.push({ x: (ax + bx) / 2, z: (az + bz) / 2, hw: t, hd: L / 2, ang: Math.atan2(bx - ax, bz - az), y0, y1, kind: 'rail', bounce: 0.1 });
}
export function addStructures(isl) {
  if (isl._structures) return; isl._structures = true;
  const sp = isl.feat.special || {}, ox = isl.ox, oz = isl.oz, cols = isl.extraColliders, decks = isl.decks;
  // quays and piers: a flat deck from the root on land to the end over the water, a low kerb along the sides
  for (const q of sp.quays || []) {
    const ang = Math.atan2(q.x1 - q.x0, q.z1 - q.z0), len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0), ux = Math.sin(ang), uz = Math.cos(ang), vx = uz, vz = -ux;
    decks.push({ x: (q.x0 + q.x1) / 2 + ox, z: (q.z0 + q.z1) / 2 + oz, hw: q.w / 2, hd: len / 2, ang, y: q.y, surf: q.kind === 'ferry' ? SURF.CONCRETE : SURF.WOOD, quay: q.kind });
    const kerb = q.kind === 'ferry' ? 0.35 : 1.0;
    for (const s of [-1, 1]) { const ex = vx * s * (q.w / 2 + 0.2), ez = vz * s * (q.w / 2 + 0.2); rail(cols, q.x0 + ux * 6 + ex + ox, q.z0 + uz * 6 + ez + oz, q.x1 + ex + ox, q.z1 + ez + oz, 0.2, q.y - 0.5, q.y + kerb); }
    if (q.kind !== 'ferry') rail(cols, q.x1 + vx * q.w / 2 + ox, q.z1 + vz * q.w / 2 + oz, q.x1 - vx * q.w / 2 + ox, q.z1 - vz * q.w / 2 + oz, 0.2, q.y - 0.5, q.y + kerb);
  }
  // other flat decks (the roof of the parking garage)
  for (const d of sp.decks || []) decks.push({ x: d.x + ox, z: d.z + oz, hw: d.hw, hd: d.hd, ang: d.ang || 0, y: d.y, surf: SURF.CONCRETE });
  // the parking garage: its walls up to just under the roof (the car on the roof passes over them), a parapet round the roof,
  // open where the ramp arrives
  if (sp.garage) { const g = sp.garage; cols.push({ x: g.x + ox, z: g.z + oz, r: g.r, y0: g.y0 - 2, y1: g.y1 - 0.4, kind: 'house' });
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = (i + 1) / 24 * Math.PI * 2, m = (a + b) / 2 - (g.gap || 0), dm = Math.abs(Math.atan2(Math.sin(m), Math.cos(m))); if (dm < 0.4) continue; rail(cols, g.x + Math.cos(a) * g.r + ox, g.z + Math.sin(a) * g.r + oz, g.x + Math.cos(b) * g.r + ox, g.z + Math.sin(b) * g.r + oz, 0.25, g.y1 - 0.3, g.y1 + 1.1); } }
  // railings on every bridge (the roads with bridge points), so the car does not fall off into the river or the lava
  isl.roads.roads.forEach(r => {
    if (!r.b) return; const p = r.p, set = new Set(r.b);
    for (let i = 0; i + 1 < p.length / 3; i++) {
      if (!set.has(i) || !set.has(i + 1)) continue;
      const ax = p[i * 3], az = p[i * 3 + 1], bx = p[i * 3 + 3], bz = p[i * 3 + 4], y = Math.min(p[i * 3 + 2], p[i * 3 + 5]), L = Math.hypot(bx - ax, bz - az) || 1, w = (r.wv ? r.wv[i] : r.w) / 2 + 0.25;
      const nx = (bz - az) / L * w, nz = -(bx - ax) / L * w;
      for (const s of [-1, 1]) rail(cols, ax + nx * s + ox, az + nz * s + oz, bx + nx * s + ox, bz + nz * s + oz, 0.12, y - 0.3, y + 1.1);
    }
  });
  // walls (the temple), tents, the camp's lookout tower, posts of signs, containers and the lift towers
  for (const w of sp.walls || []) { const ux = Math.sin(w.ang), uz = Math.cos(w.ang); rail(cols, w.x - ux * w.l / 2 + ox, w.z - uz * w.l / 2 + oz, w.x + ux * w.l / 2 + ox, w.z + uz * w.l / 2 + oz, w.w / 2, w.y - 1, w.y + w.h); }
  for (const t of sp.tents || []) cols.push({ x: t.x + ox, z: t.z + oz, r: Math.min(t.w, t.l) / 2, y0: t.y - 1, y1: t.y + 2.8, kind: 'tent', bounce: 0.05 });
  for (const c of sp.camp || []) cols.push({ x: c.tower.x + ox, z: c.tower.z + oz, r: 1.6, y0: c.tower.y - 1, y1: c.tower.y + c.tower.h + 2, kind: 'post' });
  for (const s of sp.signs || []) for (const sd of [-1, 1]) { const w = (s.w || 2.6) / 2 - 0.15; cols.push({ x: s.x + Math.cos(s.h) * w * sd + ox, z: s.z - Math.sin(s.h) * w * sd + oz, r: 0.08, kind: 'post' }); }
  for (const p of sp.props || []) if (p.kind === 'container') cols.push({ x: p.x + ox, z: p.z + oz, hw: 1.25, hd: 3.05, ang: (p.a || 0) + Math.PI / 2, y0: p.y - 1, y1: p.y + 2.6 * (p.s || 1), kind: 'house' });
  if (sp.lift) for (const t of sp.lift.towers) cols.push({ x: t.x + ox, z: t.z + oz, r: 0.45, y0: t.y - 1, y1: t.y + t.h, kind: 'post' });
}
