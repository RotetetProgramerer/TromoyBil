// One island in the world: the terrain grid, the land cover, the roads, the buildings and the lakes, and everything the
// physics and the renderer ask about a point: height (with road beds, ditches and ground detail), surface, water and colliders.
import { SURF } from '../physics/surfaces.js';
import { RoadNet, ROAD_SURF } from './roads.js';
import { vnoise, hash2, mulberry32 } from './grid.js';
import { BIOMES } from './biomes.js';

// land cover classes (same order as tools/geo/build_*.py writes them)
export const COVER = { SEA: 0, BEACH: 1, ROCK: 2, FOREST: 3, MIXED: 4, DECID: 5, HEATH: 6, GRASS: 7, FARM: 8, GARDEN: 9, URBAN: 10, BOG: 11, LAKE: 12, GRAVEL: 13, STREAM: 14,
  SNOW: 15, ASH: 16, LAVA: 17, JUNGLE: 18, SAVANNA: 19, MUD: 20, DIRT: 21, ICE: 22, DUNE: 23, SNOWFOREST: 24 };
const C = COVER;
export const COVER_SURF = [SURF.SEABED, SURF.SAND, SURF.ROCK, SURF.FOREST, SURF.FOREST, SURF.FOREST, SURF.FOREST, SURF.GRASS, SURF.FIELD, SURF.GRASS,
  SURF.GRAVEL, SURF.BOG, SURF.SEABED, SURF.GRAVEL, SURF.MUD, SURF.SNOW, SURF.ASH, SURF.LAVA, SURF.FOREST, SURF.DIRT, SURF.MUD, SURF.DIRT, SURF.ICE, SURF.SAND, SURF.SNOW];
// how bumpy the ground is (m) on each cover, on top of the 5 m terrain grid
const BUMP = [0.25, 0.07, 0.32, 0.2, 0.2, 0.18, 0.16, 0.06, 0.05, 0.03, 0.0, 0.1, 0.1, 0.08, 0.08, 0.12, 0.15, 0.1, 0.22, 0.1, 0.12, 0.12, 0.01, 0.07, 0.14];

export class Island {
  // def: {id,name,ox,oz (where the island's own origin lies in the world), seed, sea}
  // grid: heights (Grid), cover: land cover (Grid of uint8), feat: features (roads, buildings, lakes, labels, piers)
  constructor(def, grid, cover, feat) {
    this.def = def; this.id = def.id; this.name = def.name; this.ox = def.ox || 0; this.oz = def.oz || 0; this.seed = def.seed || 1;
    this.grid = grid; this.cover = cover; this.feat = feat;
    this.roads = new RoadNet(feat.roads || []);
    this.x0 = grid.x0 + this.ox; this.z0 = grid.z0 + this.oz; this.x1 = grid.x1 + this.ox; this.z1 = grid.z1 + this.oz;
    this.lakes = (feat.lakes || []).map(l => { const p = l.p; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
      return { y: l.y, p, x0, z0, x1, z1, n: l.n }; });
    this.buildBuildings(feat.buildings || []);
    this.scatterCache = new Map();
    this.extraColliders = [];        // things the game places (fences, pier posts …): {x,z,r} or {x,z,hw,hd,ang}
    this.propCells = new Map();      // many small fixed things (street-light poles …) hashed in 32 m cells: addCollider()
    this.decks = [];                 // flat drivable decks the game adds (piers, the ferry): {x,z,hw,hd,ang,y}
    this.pads = [];                  // levelled ground the game adds (the workshop yard): {x,z,r,y,blend} in island coordinates
  }
  inside(x, z, m = 0) { return x >= this.x0 + m && z >= this.z0 + m && x <= this.x1 - m && z <= this.z1 - m; }

  // ---------------------------------------------------------------- heights
  coverAt(x, z) { return this.cover.nearest(x - this.ox, z - this.oz); }
  bumpAmp(lx, lz) {
    const g = this.cover, fx = (lx - g.x0) * g.inv, fz = (lz - g.z0) * g.inv, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = BUMP[g.at(i, j)] || 0, b = BUMP[g.at(i + 1, j)] || 0, c = BUMP[g.at(i, j + 1)] || 0, d = BUMP[g.at(i + 1, j + 1)] || 0;
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  terrain(x, z) {
    const lx = x - this.ox, lz = z - this.oz;
    let h = this.grid.bicubic(lx, lz);
    const amp = this.bumpAmp(lx, lz);
    if (amp > 0) h += amp * ((vnoise(lx / 7.3, lz / 7.3, 11) - 0.5) * 1.4 + (vnoise(lx / 2.4, lz / 2.4, 12) - 0.5) * 0.6);
    return h;
  }
  // the ground height including road beds: the road is smooth, the shoulder is level, a ditch where the road is cut into the slope,
  // and a fill sloping down where it runs on an embankment. bare: the ground only, without decks and (where sim/render/special.js draws the piers) bridges, for the terrain mesh
  height(x, z, bare = false) {
    let h = this.terrain(x, z);
    const q = this.roads.query(x - this.ox, z - this.oz);
    if (q) {
      if (q.bridge) { if (bare && this.feat.special) return h; if (q.d <= q.hw + 0.35) return Math.max(q.y, h); return this.deck(x, z, h); }     // the deck is a little wider than the lanes
      const core = q.hw + 0.5, crown = (q.s === 0 ? 0.02 : 0.035) * Math.min(q.d, q.hw);
      if (q.d <= core) h = q.y - crown * Math.min(1, q.d / q.hw) - (q.d > q.hw ? 0.03 : 0);
      else {
        const E = Math.min(14, Math.max(1.6, Math.abs(h - q.y) * 1.6)), t = (q.d - core) / E;
        if (t < 1) {
          const w = t * t * (3 - 2 * t), cut = h > q.y - 0.1 && q.c <= 5;
          h = q.y - crown + (h - q.y + crown) * w - (cut ? 0.35 * Math.sin(Math.PI * Math.min(1, t / 0.4)) * (1 - w) : 0);
        }
      }
    }
    for (const p of this.pads) {
      const d = Math.hypot(x - this.ox - p.x, z - this.oz - p.z);
      if (d < p.r + p.blend) { const t = d <= p.r ? 0 : (d - p.r) / p.blend, w = 1 - t * t * (3 - 2 * t); h += (p.y - h) * w; }
    }
    return bare ? h : this.deck(x, z, h);
  }
  deck(x, z, h) {
    for (const d of this.decks) {
      const dx = x - d.x, dz = z - d.z, c = Math.cos(d.ang), s = Math.sin(d.ang), a = dx * c - dz * s, b = dx * s + dz * c;
      if (Math.abs(a) <= d.hw && Math.abs(b) <= d.hd && d.y > h) h = d.y;
    }
    return h;
  }
  surface(x, z) {
    const lx = x - this.ox, lz = z - this.oz, q = this.roads.query(lx, lz);
    if (q && q.d <= q.hw) return q.bridge && q.s !== 0 ? SURF.WOOD : ROAD_SURF[q.s] ?? SURF.ASPHALT;
    if (q && q.d <= q.hw + 0.9 && !q.bridge && q.c <= 5) return SURF.GRAVEL;
    for (const d of this.decks) { const dx = x - d.x, dz = z - d.z, c = Math.cos(d.ang), s = Math.sin(d.ang); if (Math.abs(dx * c - dz * s) <= d.hw && Math.abs(dx * s + dz * c) <= d.hd) return d.surf ?? SURF.WOOD; }
    return COVER_SURF[this.cover.nearest(lx, lz)] ?? SURF.GRASS;
  }
  water(x, z) {
    const lx = x - this.ox, lz = z - this.oz, c = this.cover.nearest(lx, lz);
    // lakes and river reaches (the gravel of a ford lies under the river's water too)
    if (c === C.LAKE || c === C.STREAM || c === C.GRAVEL) for (const l of this.lakes) if (lx >= l.x0 && lx <= l.x1 && lz >= l.z0 && lz <= l.z1 && inPoly(l.p, lx, lz)) return l.y;
    // a small stream follows its bed (a track fording it lies on the bed, below the smoothed grid)
    if (c === C.STREAM) return Math.min(this.terrain(x, z), this.height(x, z)) + 0.25;
    return this.def.sea ?? 0;
  }

  // ---------------------------------------------------------------- buildings
  buildBuildings(list) {
    this.buildings = list.map(b => {
      const p = b.p, pts = []; for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
      const r = minRect(pts);
      return Object.assign(b, { obb: r, cx: r.x, cz: r.z });
    });
    this.bcells = new Map();
    this.buildings.forEach((b, k) => {
      const r = b.obb, R = Math.hypot(r.hw, r.hd);
      for (let cj = Math.floor((r.z - R) / 32); cj <= Math.floor((r.z + R) / 32); cj++) for (let ci = Math.floor((r.x - R) / 32); ci <= Math.floor((r.x + R) / 32); ci++) {
        const key = ci * 73856093 ^ cj * 19349663; let L = this.bcells.get(key); if (!L) { L = []; this.bcells.set(key, L); } L.push(k);
      }
    });
  }
  buildingsNear(lx, lz) { return this.bcells.get(Math.floor(lx / 32) * 73856093 ^ Math.floor(lz / 32) * 19349663) || EMPTY; }
  inBuilding(lx, lz, m = 0) {
    for (const k of this.buildingsNear(lx, lz)) {
      const r = this.buildings[k].obb, dx = lx - r.x, dz = lz - r.z, c = Math.cos(r.ang), s = Math.sin(r.ang);
      if (Math.abs(dx * c - dz * s) <= r.hw + m && Math.abs(dx * s + dz * c) <= r.hd + m) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- trees, bushes and boulders
  // Deterministic per 32 m cell, so the renderer draws the same trees the car hits. Kinds: KIND below; the made-up islands have their
  // own biome (def.biome, see biomes.js).
  scatter(ci, cj) {
    const key = ci * 100003 + cj;
    let L = this.scatterCache.get(key);
    if (L) return L;
    const B = this.def.biome && BIOMES[this.def.biome];
    L = this.def.scatter ? this.def.scatter(this, ci, cj) : B ? B(this, ci, cj) : scatterNordic(this, ci, cj);
    if (this.pads.length) L = L.filter(t => this.pads.every(p => Math.hypot(t.x - p.x, t.z - p.z) > p.r + p.blend * 0.6));
    if (this.scatterCache.size > 4000) this.scatterCache.delete(this.scatterCache.keys().next().value);
    this.scatterCache.set(key, L);
    return L;
  }
  // a small fixed collider in world coordinates ({x,z,r} or a box), found by colliders() through its cell
  addCollider(c) { const k = Math.floor((c.x - this.ox) / 32) * 73856093 ^ Math.floor((c.z - this.oz) / 32) * 19349663; let L = this.propCells.get(k); if (!L) this.propCells.set(k, L = []); L.push(c); }
  colliders(x, z, r, out) {
    const lx = x - this.ox, lz = z - this.oz;
    for (const k of this.buildingsNear(lx, lz)) { const o = this.buildings[k].obb; out.push({ x: o.x + this.ox, z: o.z + this.oz, hw: o.hw, hd: o.hd, ang: o.ang, y1: this.buildings[k].y1 + 30, kind: 'house' }); }
    const ci = Math.floor(lx / 32), cj = Math.floor(lz / 32);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      for (const t of this.scatter(ci + di, cj + dj)) {
        if (!t.col) continue;
        const dx = t.x - lx, dz = t.z - lz;
        if (dx * dx + dz * dz < (r + 2) * (r + 2)) out.push({ x: t.x + this.ox, z: t.z + this.oz, r: t.col, y0: t.y - 1, y1: t.y + t.s * 20, kind: t.k, bounce: 0.05 });
      }
    }
    for (const c of this.extraColliders) { const dx = c.x - x, dz = c.z - z; if (dx * dx + dz * dz < (r + 20) * (r + 20)) out.push(c); }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const L = this.propCells.get((ci + di) * 73856093 ^ (cj + dj) * 19349663); if (L) for (const c of L) { const dx = c.x - x, dz = c.z - z; if (dx * dx + dz * dz < (r + 2) * (r + 2)) out.push(c); } }
    return out;
  }
}
const EMPTY = [];

// Norwegian coast: pine on the rocky hills, spruce in the valleys, birch and oak by the fields, juniper on the heath.
// Returns [{x,z,y,k (kind),s (size),a (angle),col (trunk radius, 0 = drive through)}] in island coordinates.
export const KIND = { PINE: 0, SPRUCE: 1, BIRCH: 2, OAK: 3, JUNIPER: 4, BUSH: 5, ROCK: 6, ASPEN: 7, FRUIT: 8, REED: 9,
  PALM: 10, OLIVE: 11, CYPRESS: 12, ACACIA: 13, BAOBAB: 14, JUNGLE: 15, FERN: 16, SNOWSPRUCE: 17, DEADTREE: 18, GRASSCLUMP: 19, AGAVE: 20 };
const K = KIND;
export function scatterNordic(isl, ci, cj) {
  const out = [], R = mulberry32(((ci * 92837111) ^ (cj * 689287499) ^ isl.seed) >>> 0), x0 = ci * 32, z0 = cj * 32;
  for (let n = 0; n < 46; n++) {
    const x = x0 + R() * 32, z = z0 + R() * 32, c = isl.cover.nearest(x, z), roll = R();
    let dens = 0;
    switch (c) {
      case C.FOREST: case C.MIXED: case C.DECID: dens = 0.8; break;
      case C.HEATH: dens = 0.35; break;
      case C.GARDEN: dens = 0.09; break;
      case C.ROCK: dens = 0.06; break;
      case C.BOG: dens = 0.12; break;
      case C.GRASS: dens = 0.03; break;
      case C.FARM: dens = 0.004; break;
      case C.BEACH: dens = 0.01; break;
      default: dens = 0;
    }
    if (roll > dens) continue;
    const y = isl.grid.bicubic(x, z);
    if (y < 0.6) continue;
    const q = isl.roads.query(x, z);
    if (q && q.d < q.hw + (q.c <= 4 ? 4.5 : q.c <= 5 ? 3.0 : q.c === 6 ? 2.4 : 1.9)) continue;     // the verge is kept clear along the roads
    if (isl.inBuilding(x, z, 3)) continue;
    const h1 = isl.grid.bilinear(x + 2, z), h2 = isl.grid.bilinear(x, z + 2), slope = Math.hypot(h1 - y, h2 - y) / 2;
    const v = vnoise(x / 60, z / 60, isl.seed), w = vnoise(x / 17, z / 17, isl.seed + 5), r2 = R();
    let k, s;
    if (c === C.GARDEN) { k = r2 < 0.3 ? K.FRUIT : r2 < 0.55 ? K.BIRCH : r2 < 0.75 ? K.BUSH : r2 < 0.88 ? K.SPRUCE : K.OAK; s = 0.6 + R() * 0.6; }
    else if (c === C.BOG) { k = r2 < 0.6 ? K.BIRCH : r2 < 0.85 ? K.PINE : K.REED; s = 0.4 + R() * 0.4; }
    else if (c === C.HEATH || c === C.ROCK) { k = r2 < 0.55 ? K.PINE : r2 < 0.85 ? K.JUNIPER : K.ROCK; s = 0.45 + R() * 0.55; }
    else if (c === C.BEACH || c === C.GRASS || c === C.FARM) { k = r2 < 0.4 ? K.OAK : r2 < 0.7 ? K.BIRCH : K.BUSH; s = 0.6 + R() * 0.6; }
    else {
      // forest: pine on the dry, rocky heights; spruce in the damp valleys; broadleaf in patches
      const dry = (y > 45 ? 0.3 : 0) + slope * 1.5 + (v - 0.5) * 0.8;
      if (r2 < 0.07) { k = K.ROCK; s = 0.4 + R() * 0.9; }
      else if (r2 < 0.16) { k = w > 0.5 ? K.JUNIPER : K.BUSH; s = 0.5 + R() * 0.6; }
      else if (w > 0.72 && c !== C.FOREST) { k = r2 < 0.55 ? K.OAK : K.ASPEN; s = 0.7 + R() * 0.5; }
      else if (w > 0.78) { k = K.BIRCH; s = 0.6 + R() * 0.5; }
      else { k = dry > 0.45 ? K.PINE : K.SPRUCE; s = 0.55 + R() * 0.6; }
    }
    if (slope > 0.9 && k !== K.ROCK) continue;
    // big trees need more room from the road: their crowns reach out
    if (q && (k === K.SPRUCE || k === K.OAK) && q.d < q.hw + 1.6 + s * (k === K.SPRUCE ? 5 : 4.5)) continue;
    const col = k === K.ROCK ? s * 0.9 : k === K.BUSH || k === K.JUNIPER || k === K.REED || k === K.FERN || k === K.GRASSCLUMP ? 0 : 0.1 + s * 0.2;
    out.push({ x, z, y, k, s, a: R() * 6.283, col });
  }
  return out;
}

export function inPoly(p, x, z) {
  let ins = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
// smallest rotated rectangle round a polygon (rotating calipers over the convex hull): {x,z,hw,hd,ang}
export function minRect(pts) {
  const h = hull(pts); let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of h) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) { const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; best = { area, x: um * c - vm * s, z: um * s + vm * c, hw: (u1 - u0) / 2, hd: (v1 - v0) / 2, ang: -ang }; }
  }
  return best || { x: pts[0][0], z: pts[0][1], hw: 1, hd: 1, ang: 0 };
}
function hull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
