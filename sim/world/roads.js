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
    const F = new Float32Array(n * 6), I = new Int32Array(n * 2), H = new Float32Array(n), M = new Uint8Array(n * 3);
    this.seg = { F, I, H, M, n };
    this.cells = new Map();
    let k = 0;
    roads.forEach((r, ri) => {
      const p = r.p, m = p.length / 3, br = r.b ? new Set(r.b) : null;
      r.len = 0;
      for (let i = 0; i < m - 1; i++, k++) {
        const ax = p[i * 3], az = p[i * 3 + 1], ay = p[i * 3 + 2], bx = p[i * 3 + 3], bz = p[i * 3 + 4], by = p[i * 3 + 5];
        F.set([ax, az, ay, bx, bz, by], k * 6); I[k * 2] = ri; I[k * 2 + 1] = i; H[k] = (r.wv ? Math.min(r.wv[i], r.wv[i + 1]) : r.w) / 2;
        M[k * 3] = r.s; M[k * 3 + 1] = r.c; M[k * 3 + 2] = br && (br.has(i) || br.has(i + 1)) ? 1 : 0;
        r.len += Math.hypot(bx - ax, bz - az);
        const R = r.w / 2 + REACH;
        const i0 = Math.floor((Math.min(ax, bx) - R) / CELL), i1 = Math.floor((Math.max(ax, bx) + R) / CELL);
        const j0 = Math.floor((Math.min(az, bz) - R) / CELL), j1 = Math.floor((Math.max(az, bz) + R) / CELL);
        for (let cj = j0; cj <= j1; cj++) for (let ci = i0; ci <= i1; ci++) {
          const key = ci * 73856093 ^ cj * 19349663; let L = this.cells.get(key);
          if (!L) { L = []; this.cells.set(key, L); } L.push(k);
        }
      }
    });
    for (const [key, L] of this.cells) this.cells.set(key, Int32Array.from(L));
    this.q = { d: 0, hw: 0, y: 0, s: 0, c: 0, bridge: 0, tx: 0, tz: 0, road: -1, seg: -1, t: 0 };
  }
  // the road nearest to (x,z) within its reach, or null. Returns a shared object (copy what you need).
  query(x, z) {
    const L = this.cells.get(Math.floor(x / CELL) * 73856093 ^ Math.floor(z / CELL) * 19349663);
    if (!L) return null;
    const F = this.seg.F, H = this.seg.H;
    let best = 1e9, bk = -1, bt = 0, bd = 0;
    for (let n = 0; n < L.length; n++) {
      const k = L[n], o = k * 6, ax = F[o], az = F[o + 1], ex = F[o + 3] - ax, ez = F[o + 4] - az, l2 = ex * ex + ez * ez || 1e-9;
      let t = ((x - ax) * ex + (z - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - ax - ex * t, dz = z - az - ez * t, d = Math.sqrt(dx * dx + dz * dz), e = d - H[k];
      if (e < best) { best = e; bk = k; bt = t; bd = d; }
    }
    if (bk < 0 || best > REACH) return null;
    const q = this.q, o = bk * 6, M = this.seg.M;
    q.d = bd; q.hw = H[bk]; q.y = F[o + 2] + (F[o + 5] - F[o + 2]) * bt; q.s = M[bk * 3]; q.c = M[bk * 3 + 1]; q.bridge = M[bk * 3 + 2];
    const ex = F[o + 3] - F[o], ez = F[o + 4] - F[o + 1], el = Math.hypot(ex, ez) || 1; q.tx = ex / el; q.tz = ez / el;
    q.road = this.seg.I[bk * 2]; q.seg = bk; q.t = bt;
    return q;
  }
}
