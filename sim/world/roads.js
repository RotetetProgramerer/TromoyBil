// The road network of an island: every road is a polyline with a smoothed height profile (made by the build tool).
// A spatial hash finds the road under a point in one lookup: each segment is stored in every cell its influence reaches.
import { SURF } from '../physics/surfaces.js';

export const ROAD_SURF = [SURF.ASPHALT, SURF.GRAVEL, SURF.COBBLE, SURF.DIRT, SURF.SNOW];      // 4: packed snow (the winter island)
export const ROAD_CLASS = ['motorvei', 'riksvei', 'fylkesvei', 'fylkesvei', 'kommunal vei', 'privat vei', 'traktorvei', 'sti'];
const CELL = 24, REACH = 15;               // metres the embankment and the ditch reach beyond the road edge

export class RoadNet {
  constructor(roads) {
    this.roads = roads;
    let n = 0; for (const r of roads) n += r.p.length / 3 - 1;
    const F = new Float32Array(n * 6), I = new Int32Array(n * 2), H = new Float32Array(n * 2), M = new Uint8Array(n * 3);
    this.seg = { F, I, H, M, n };            // per segment: F ends (x,z,y ×2), I road and point index, H half width at each end, M surface, class, bridge
    this.cells = new Map(); this.bridged = new Set();      // bridged: the cells that hold a bridge segment
    let k = 0;
    roads.forEach((r, ri) => {
      const p = r.p, m = p.length / 3, br = r.b ? new Set(r.b) : null;
      r.len = 0;
      for (let i = 0; i < m - 1; i++, k++) {
        const ax = p[i * 3], az = p[i * 3 + 1], ay = p[i * 3 + 2], bx = p[i * 3 + 3], bz = p[i * 3 + 4], by = p[i * 3 + 5];
        F.set([ax, az, ay, bx, bz, by], k * 6); I[k * 2] = ri; I[k * 2 + 1] = i; H[k * 2] = (r.wv ? r.wv[i] : r.w) / 2; H[k * 2 + 1] = (r.wv ? r.wv[i + 1] : r.w) / 2;
        M[k * 3] = r.s; M[k * 3 + 1] = r.c; M[k * 3 + 2] = br && (br.has(i) || br.has(i + 1)) ? 1 : 0;
        r.len += Math.hypot(bx - ax, bz - az);
        const R = r.w / 2 + REACH;
        const i0 = Math.floor((Math.min(ax, bx) - R) / CELL), i1 = Math.floor((Math.max(ax, bx) + R) / CELL);
        const j0 = Math.floor((Math.min(az, bz) - R) / CELL), j1 = Math.floor((Math.max(az, bz) + R) / CELL);
        for (let cj = j0; cj <= j1; cj++) for (let ci = i0; ci <= i1; ci++) {
          const key = ci * 73856093 ^ cj * 19349663; let L = this.cells.get(key);
          if (!L) { L = []; this.cells.set(key, L); } L.push(k); if (M[k * 3 + 2]) this.bridged.add(key);
        }
      }
    });
    for (const [key, L] of this.cells) this.cells.set(key, Int32Array.from(L));
    this.q = blank(); this.q2 = blank();
  }
  // the road nearest to (x,z) within its reach (the smallest distance beyond the road's edge), or null. Returns a shared object
  // (copy what you need). Where a bridge crosses another road both are in reach, and the other one is given too (another
  // shared object): for a bridge, q.ground is the nearest road on the ground, the one it crosses; for a road on the ground,
  // q.deck is the nearest bridge, the one crossing it. Island.height picks the level that applies
  query(x, z) {
    const key = Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663, L = this.cells.get(key);
    if (!L) return null;
    const F = this.seg.F, H = this.seg.H, M = this.seg.M, I = this.seg.I, n = this.seg.n, two = this.bridged.has(key);   // two: keep the best on the ground and the best bridge too
    let best = 1e9, bk = -1, bt = 0, bd = 0, bestG = 1e9, gk = -1, gt = 0, gd = 0, bestB = 1e9, bbk = -1, bbt = 0, bbd = 0;
    for (let j = 0; j < L.length; j++) {
      const k = L[j], o = k * 6, ax = F[o], az = F[o + 1], ex = F[o + 3] - ax, ez = F[o + 4] - az, l2 = ex * ex + ez * ez || 1e-9;
      const u = ((x - ax) * ex + (z - az) * ez) / l2, t = u < 0 ? 0 : u > 1 ? 1 : u;
      const dx = x - ax - ex * t, dz = z - az - ez * t, d = Math.sqrt(dx * dx + dz * dz);
      let e = d - (H[k * 2] + (H[k * 2 + 1] - H[k * 2]) * t);
      if (e >= best && !two) continue;                     // the overshoot below only adds
      // past a vertex inside its road, a segment yields to the neighbour the point lies beside (a wider end would win on width
      // alone and hand out the vertex's height): the overshoot counts as distance. At a road's end the cap stays
      if (u !== t && (u < 0 ? k > 0 && I[k * 2 - 2] === I[k * 2] : k + 1 < n && I[k * 2 + 2] === I[k * 2])) e += (u < 0 ? -u : u - 1) * Math.sqrt(l2);
      if (e < best) { best = e; bk = k; bt = t; bd = d; }
      if (!two) continue;
      if (M[k * 3 + 2]) { if (e < bestB) { bestB = e; bbk = k; bbt = t; bbd = d; } }
      else if (e < bestG) { bestG = e; gk = k; gt = t; gd = d; }
    }
    if (bk < 0 || best > REACH) return null;
    const q = this.fill(this.q, bk, bt, bd);
    q.ground = q.bridge && gk >= 0 && bestG <= REACH ? this.fill(this.q2, gk, gt, gd) : null;
    q.deck = !q.bridge && bbk >= 0 && bestB <= REACH ? this.fill(this.q2, bbk, bbt, bbd) : null;
    return q;
  }
  // the result object for segment k at parameter t, d metres from the point
  fill(q, k, t, d) {
    const F = this.seg.F, H = this.seg.H, M = this.seg.M, o = k * 6;
    q.d = d; q.hw = H[k * 2] + (H[k * 2 + 1] - H[k * 2]) * t; q.y = F[o + 2] + (F[o + 5] - F[o + 2]) * t; q.s = M[k * 3]; q.c = M[k * 3 + 1]; q.bridge = M[k * 3 + 2];
    const ex = F[o + 3] - F[o], ez = F[o + 4] - F[o + 1], el = Math.sqrt(ex * ex + ez * ez) || 1; q.tx = ex / el; q.tz = ez / el;
    q.road = this.seg.I[k * 2]; q.seg = k; q.t = t;
    return q;
  }
}
const blank = () => ({ d: 0, hw: 0, y: 0, s: 0, c: 0, bridge: 0, tx: 0, tz: 0, road: -1, seg: -1, t: 0, ground: null, deck: null });
