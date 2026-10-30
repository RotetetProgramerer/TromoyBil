// One island being built at real scale (used by tools/geo/build_islands.mjs). Island coordinates in metres: x east, z south, origin in
// the middle. The old levels have +x west and +z north, so an old point (x, z) lies at (-x·S, -z·S) here.
// Fields on the 5 m grid: H (terrain height), W (water level, NONE where there is none), CV (land cover, COVER in sim/world/island.js).
import { COVER, clamp, lerp, smooth, R1, R2, makeNoise, fbm, edt, blur, relaxFill, oldSampler, inPoly, nearestOnLine, lineDist, lineLength,
  spline, resample, gauss1, gradeProfile, writeGrid, writeJSON, writePNG } from './islandkit.mjs';
import { mulberry32 } from '../../sim/world/grid.js';
const C = COVER;
export const NONE = -1e9;
export const WIDTH = [8.5, 7.5, 6.5, 6.0, 4.8, 3.4, 2.8, 2.0];       // the same road widths as tools/geo/build_tromoya.py
const STEP = 3;                                                     // metres between the points of a road
export const dirv = h => [Math.sin(h), Math.cos(h)];                // heading (0 = +z, π/2 = +x) → unit vector
export const head = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
export const add = (p, d, s = 1) => [p[0] + d[0] * s, p[1] + d[1] * s];
export const side = h => [Math.cos(h), -Math.sin(h)];               // to the right of the heading h (x east, z south)

export class IslandBuild {
  constructor(o) {
    Object.assign(this, { cell: 5 }, o);              // id, name, seed, S, V, x0, z0, x1, z1, ox, oz, old, backdrop
    this.nx = Math.round((this.x1 - this.x0) / this.cell) + 1; this.nz = Math.round((this.z1 - this.z0) / this.cell) + 1;
    this.x1 = this.x0 + (this.nx - 1) * this.cell; this.z1 = this.z0 + (this.nz - 1) * this.cell;
    const n = this.nx * this.nz;
    this.H = new Float32Array(n); this.W = new Float32Array(n).fill(NONE); this.CV = new Uint8Array(n); this.KEEP = new Uint8Array(n); this.ROAD = new Uint8Array(n);
    this.sea = new Uint8Array(n);
    this.noise = makeNoise(this.seed); this.n2 = makeNoise(this.seed * 7 + 1); this.n3 = makeNoise(this.seed * 13 + 5);
    this.R = mulberry32(this.seed * 31 + 7);
    this.roads = []; this.rhash = new Map(); this.buildings = []; this.lakes = []; this.labels = []; this.piers = []; this.courses = []; this.pois = {};
    this.special = { lava: [], lavaPools: [], vents: [], falls: [], streams: [], quays: [], decks: [], signs: [], squares: [], tents: [], walls: [],
      ice: [], pistes: [], lift: null, runway: null, airport: null, temple: null, camp: null, ramps: [], props: [] };
  }
  // ---------------------------------------------------------------- grid helpers
  k(i, j) { return clamp(j, 0, this.nz - 1) * this.nx + clamp(i, 0, this.nx - 1); }
  kxz(x, z) { return this.k(Math.round((x - this.x0) / this.cell), Math.round((z - this.z0) / this.cell)); }
  toOld(x, z) { return [-x / this.S, -z / this.S]; }
  // the old level at a point here: base terrain, stamped terrain (rocks, ramps, ponds) and surface (S in js/core.js)
  oldAt(x, z) {
    if (!this._os) { this._os = [oldSampler(this.old, this.old.TB), oldSampler(this.old, this.old.TH), oldSampler(this.old, this.old.TS)]; }
    const [ox, oz] = this.toOld(x, z); return { tb: this._os[0].bilinear(ox, oz), th: this._os[1].bilinear(ox, oz), ts: this._os[2].nearest(ox, oz) };
  }
  P(p) { return [-p[0] * this.S, -p[1] * this.S]; }                // an old [x,z] in island metres
  PL(L) { return L.map(p => this.P(p)); }
  dirOld(deg) { const a = deg * Math.PI / 180; return Math.atan2(-Math.cos(a), -Math.sin(a)); }   // an old direction (degrees) as a heading here
  sample(A, x, z) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (A[this.k(i, j)] * (1 - u) + A[this.k(i + 1, j)] * u) * (1 - v) + (A[this.k(i, j + 1)] * (1 - u) + A[this.k(i + 1, j + 1)] * u) * v;
  }
  h(x, z) { return this.sample(this.H, x, z); }
  w(x, z) { return this.W[this.kxz(x, z)]; }
  cover(x, z) { return this.CV[this.kxz(x, z)]; }
  wet(x, z) { return this.w(x, z) > this.h(x, z) + 0.05; }
  d(x, z) { return this.sample(this.D, x, z); }                      // distance to the coast (+ on land)
  slope(x, z) { const e = this.cell; return Math.hypot(this.h(x + e, z) - this.h(x - e, z), this.h(x, z + e) - this.h(x, z - e)) / (2 * e); }
  cells(x0, z0, x1, z1, fn) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.cell)), i1 = Math.min(this.nx - 1, Math.ceil((x1 - this.x0) / this.cell));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.cell)), j1 = Math.min(this.nz - 1, Math.ceil((z1 - this.z0) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * this.nx + i, this.x0 + i * this.cell, this.z0 + j * this.cell);
  }
  disc(x, z, r, fn) { this.cells(x - r, z - r, x + r, z + r, (k, px, pz) => { const d = Math.hypot(px - x, pz - z); if (d <= r) fn(k, px, pz, d); }); }
  each(fn) { for (let j = 0, k = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++, k++) fn(k, this.x0 + i * this.cell, this.z0 + j * this.cell); }
  // pull the ground towards height y inside r (fully) and r+blend (eased); keep marks it so later detail leaves it alone
  flatten(x, z, r, y, blend = 20, keep = true) {
    this.disc(x, z, r + blend, (k, px, pz, d) => { if (this.ROAD[k]) return; const f = d <= r ? 1 : 1 - smooth(0, 1, (d - r) / blend); this.H[k] += (y - this.H[k]) * f; if (keep && d <= r) this.KEEP[k] = 1; });
  }
  // the same for a rectangle (half length hl along the heading ang, half width hd)
  flattenRect(cx, cz, hl, hd, ang, y, blend = 10, keep = true) {
    const c = Math.cos(ang), s = Math.sin(ang), R = Math.hypot(hl, hd) + blend;
    this.cells(cx - R, cz - R, cx + R, cz + R, (k, px, pz) => {
      if (this.ROAD[k]) return;
      const dx = px - cx, dz = pz - cz, a = Math.abs(dx * s + dz * c), b = Math.abs(dx * c - dz * s), e = Math.max(a - hl, b - hd, 0);
      if (e > blend) return; const f = 1 - smooth(0, 1, e / blend); this.H[k] += (y - this.H[k]) * f; if (keep && e <= 0) this.KEEP[k] = 1;
    });
  }
  paint(x, z, r, cls, only) { this.disc(x, z, r, k => { if (this.sea[k] || (only && !only(this.CV[k]))) return; this.CV[k] = cls; }); }
  paintLine(L, hw, cls, only) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of L) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    this.cells(x0 - hw, z0 - hw, x1 + hw, z1 + hw, (k, x, z) => { if (this.sea[k] || (only && !only(this.CV[k]))) return; if (lineDist(L, x, z) <= hw) this.CV[k] = cls; }); }
  paintPoly(poly, cls) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]); }
    this.cells(x0, z0, x1, z1, (k, x, z) => { if (!this.sea[k] && inPoly(poly, x, z)) this.CV[k] = cls; }); }

  // ---------------------------------------------------------------- the base terrain from the old level
  // o.fill(x,z) (old coords): true where old water inside the island is filled (old river beds; the new rivers are dug at real scale)
  // o.protect [[x,z,r]]: the coastline stays where it was (the quay, the airport); o.shore(x,z) → weights of beach|rock|cliff|flat
  base(o) {
    const old = this.old, N = old.N, HALF = old.HALF, CELL = old.CELL, w0 = old.water, V = this.V;
    const fill = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -HALF + i * CELL, z = -HALF + j * CELL, k = j * N + i; if (old.TB[k] < w0 + 0.05 && o.fill(x, z)) fill[k] = 1; }
    const f2 = fill.slice(); for (let k = 0; k < N * N; k++) if (fill[k]) for (const d of [-1, 1, -N, N, -2, 2, -2 * N, 2 * N]) if (k + d >= 0 && k + d < N * N) f2[k + d] = 1;
    const TBf = relaxFill(old.TB, f2, N, 600), sTB = oldSampler(old, TBf), sF = oldSampler(old, f2);
    this.oldTBf = TBf;
    const H0 = new Float32Array(this.nx * this.nz), land0 = new Uint8Array(this.nx * this.nz); this.FILL = new Uint8Array(this.nx * this.nz);
    // heights: (old height above the old water) × V, or through o.vmap(u) when the hills and the mountain need different scales
    this.each((k, x, z) => { const [ox, oz] = this.toOld(x, z), tb = sTB.bilinear(ox, oz) + (o.adjust ? o.adjust(ox, oz) : 0), u = tb - w0; H0[k] = o.vmap ? o.vmap(u, ox, oz) : u * V; land0[k] = (o.land ? o.land(ox, oz, tb) : tb > w0) ? 1 : 0; this.FILL[k] = sF.bilinear(ox, oz) > 0.5 ? 1 : 0; });
    const Hb = blur(H0, this.nx, this.nz, o.blur ?? 2.5);
    // the coastline: the old one moved in and out by noise (bays and headlands), except where something must stay on the shore
    const din = edt(land0.map(v => 1 - v), this.nx, this.nz), dout = edt(land0, this.nx, this.nz);
    const prot = (x, z) => { let f = 1; for (const [px, pz, r] of o.protect || []) f = Math.min(f, smooth(r * 0.7, r * 1.3, Math.hypot(x - px, z - pz))); return f; };
    const A = o.coastA ?? 110, L = o.coastL ?? 520, land = new Uint8Array(this.nx * this.nz);
    this.each((k, x, z) => {
      const d0 = (land0[k] ? din[k] : -dout[k]) * this.cell;
      const edge = Math.min(x - this.x0, this.x1 - x, z - this.z0, this.z1 - z);
      land[k] = edge > 660 && d0 + (A * fbm(this.n2, x / L, z / L, 3) + A * 0.6 * this.n2(x / (L * 2.2) + 9, z / (L * 2.2)) + A * 0.3 * this.n3(x / (L * 0.3), z / (L * 0.3))) * prot(x, z) > 0 ? 1 : 0;
    });
    const Din = edt(land.map(v => 1 - v), this.nx, this.nz), Dout = edt(land, this.nx, this.nz);
    this.D = new Float32Array(this.nx * this.nz);
    this.each(k => { this.D[k] = land[k] ? Din[k] * this.cell : -Dout[k] * this.cell; });
    // shore profiles: how the land rises from the water line, and how the sea floor falls away from it
    const PR = {
      beach: { up: d => 1.3 * (1 - Math.exp(-d / 35)) + 0.012 * Math.min(d, 160), wb: 240, dn: d => d < 45 ? 0.035 * d : 1.6 + (d - 45) * 0.085 },
      rock: { up: d => 2.6 * (1 - Math.exp(-d / 8)) + 0.12 * Math.min(d, 60), wb: 110, dn: d => d < 25 ? 0.26 * d : 6.5 + (d - 25) * 0.1 },
      cliff: { up: d => 9 * (1 - Math.exp(-d / 7)) + 0.1 * Math.min(d, 80), wb: 70, dn: d => d < 18 ? 0.5 * d : 9 + (d - 18) * 0.12 },
      flat: { up: d => 0.3 + 0.006 * Math.min(d, 200), wb: 320, dn: d => d < 120 ? 0.012 * d : 1.4 + (d - 120) * 0.07 },
    };
    const floor = o.floor ?? -38;
    this.each((k, x, z) => {
      const d = this.D[k], wts = o.shore(x, z);
      let up = 0, wb = 0, dn = 0, ws = 0;
      for (const t in wts) { const q = wts[t]; if (!q) continue; ws += q; if (d > 0) { up += PR[t].up(d) * q; wb += PR[t].wb * q; } else dn += PR[t].dn(-d) * q; }
      // the land behind the shore rises over a distance that grows with the height it has to reach (no 50 m cliffs all round)
      if (d > 0) { up /= ws; wb /= ws; const hin = Math.max(Hb[k], up); wb = Math.max(wb, Math.min(o.coastMax ?? 320, (hin - up) * (o.coastRise ?? 6))); this.H[k] = lerp(up, hin, smooth(0, wb, d)); }
      else {
        dn /= ws; let h = Math.max(floor, -dn) + 1.2 * fbm(this.noise, x / 90, z / 90, 3) * smooth(20, 200, -d);
        // skerries: bare rocks and small holms off the coast (never in front of the quay)
        if ((o.skerries ?? 1) > 0 && -d > 70 && -d < 520 && prot(x, z) > 0.99 && Math.min(x - this.x0, this.x1 - x, z - this.z0, this.z1 - z) > 680) {
          const grp = smooth(0.25, 0.55, this.n2(x / 1100 + 5, z / 1100 - 3)), v = (fbm(this.n3, x / 150 + 40, z / 150 - 17, 3) - (0.4 - 0.08 * (o.skerries ?? 1))) * grp;
          if (v > 0) h = Math.max(h, Math.min(v * 45, 3.5 + 2 * fbm(this.noise, x / 40, z / 40, 2)) - 2.0 + 1.2 * this.noise(x / 18, z / 18));      // low, rounded rocks
        }
        this.H[k] = h;
      }
    });
    this.H0 = H0;
  }
  // extra height on land (detail): fn(x, z, d) in metres; faded out at the shore and wherever the ground is kept flat
  detail(fn, fade = 120) { this.each((k, x, z) => { const d = this.D[k]; if (d <= 0 || this.KEEP[k]) return; this.H[k] += fn(x, z, d) * smooth(0, fade, d); }); }
  // blend the sea floor at the edge of the grid into the coast backdrop, so there is no step where the island's grid ends
  edgeBlend(width = 320) {
    const bd = this.backdrop; if (!bd) return;
    this.each((k, x, z) => {
      const e = Math.min(x - this.x0, this.x1 - x, z - this.z0, this.z1 - z); if (e > width || this.H[k] >= 0) return;
      const wx = x + this.ox, wz = z + this.oz, b = bd.inside(wx, wz) ? bd.bilinear(wx, wz) : -60;
      this.H[k] = lerp(Math.min(b, -3), this.H[k], smooth(0, width, e));
    });
  }
  // the sea: every cell below 0 the open sea reaches; dry pits below sea level inland are lifted out of it
  seaWater() {
    const n = this.nx * this.nz, sea = this.sea.fill(0), st = [];
    for (let i = 0; i < this.nx; i++) st.push(i, (this.nz - 1) * this.nx + i);
    for (let j = 0; j < this.nz; j++) st.push(j * this.nx, j * this.nx + this.nx - 1);
    while (st.length) { const k = st.pop(); if (sea[k] || this.H[k] >= 0) continue; sea[k] = 1; const i = k % this.nx, j = (k / this.nx) | 0;
      if (i > 0) st.push(k - 1); if (i < this.nx - 1) st.push(k + 1); if (j > 0) st.push(k - this.nx); if (j < this.nz - 1) st.push(k + this.nx); }
    for (let k = 0; k < n; k++) {
      if (sea[k]) { if (this.W[k] === NONE) this.W[k] = 0; this.CV[k] = C.SEA; }
      else if (this.H[k] < 0.25 && this.W[k] === NONE) { this.H[k] = 0.25; if (this.CV[k] === C.SEA) this.CV[k] = C.BEACH; }
    }
  }

  // ---------------------------------------------------------------- water
  // a river as flat reaches (lake polygons) stepping down to the sea. o: {pts (source → mouth), hw (m or fn(t 0–1)), depth, top, mouth,
  // reaches, fords [[x,z,r]] (shallow gravel crossings), name}
  river(o) {
    const P = spline(o.pts, 4), n = P.length, hwf = typeof o.hw === 'function' ? o.hw : () => o.hw;
    let s = 0; const T = P.map((p, i) => (i && (s += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1])), s)), tot = s || 1;
    const nrm = i => { const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
    const fordAt = (x, z) => { let f = 0; for (const [fx, fz, fr] of o.fords || []) f = Math.max(f, 1 - smooth(fr * 0.5, fr, Math.hypot(x - fx, z - fz))); return f; };
    const HW = i => hwf(T[i] / tot) * (1 + 0.4 * fordAt(P[i][0], P[i][1]));
    // the water level: under the lowest bank nearby, never rising downstream, in flat reaches with steps between them
    const bank = P.map(([x, z], i) => { const [nx, nz] = nrm(i); let m = 1e9; for (const sd of [-1, 1]) for (const f of [1.3, 2.2]) { const px = x + nx * sd * HW(i) * f, pz = z + nz * sd * HW(i) * f; if (!this.sea[this.kxz(px, pz)]) m = Math.min(m, this.h(px, pz)); } return m === 1e9 ? 0.5 : m; });
    const nR = o.reaches ?? Math.max(2, Math.round(tot / 420)), lv = new Array(n), mouth = o.mouth ?? 0.15, ends = [];
    const top = Math.min(o.top ?? 1e9, Math.min(...bank.slice(0, Math.max(2, Math.floor(n / nR)))) - 0.8);
    let prev = top;
    for (let r = 0; r < nR; r++) {
      const a = Math.floor(r * (n - 1) / nR), b = Math.floor((r + 1) * (n - 1) / nR); let m = 1e9;
      for (let i = a; i <= b; i++) m = Math.min(m, bank[i] - 0.8);
      const y = Math.max(mouth, Math.min(prev, m, lerp(top, mouth, nR > 1 ? r / (nR - 1) : 1)));
      for (let i = a; i <= b; i++) lv[i] = y; ends.push([a, b, y]); prev = y;
    }
    // dig the bed: a parabola under the level, banks rising out of the water, shallow and gravelly at the fords
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const R = Math.max(...P.map((_, i) => HW(i))) + 30, depth = o.depth ?? 2.2;
    this.cells(x0 - R, z0 - R, x1 + R, z1 + R, (k, x, z) => {
      const q = nearestOnLine(P, x, z); if (q.d > R) return;
      const i = Math.min(n - 1, q.i + (q.t > 0.5 ? 1 : 0)), f = fordAt(x, z), hw = HW(i), y = lv[i], d = q.d;
      if (d < hw) {
        const dep = lerp(depth, o.fordDepth ?? 0.35, f), bed = y - dep * (1 - (d / hw) ** 2) - 0.1 - 0.3 * (1 - f) * Math.abs(this.noise(x / 13, z / 13));
        if (bed < this.H[k]) this.H[k] = bed;
        if (!this.sea[k] && this.H[k] < y) { this.W[k] = Math.max(this.W[k], y); this.CV[k] = f > 0.35 ? C.GRAVEL : C.LAKE; }
      } else if (this.W[k] === NONE && d < hw + 30) {
        const want = y + 0.35 + (d - hw) * (o.bank ?? 0.2);
        if (this.H[k] > want && d < hw + 8) this.H[k] = lerp(want, this.H[k], smooth(hw, hw + 8, d));
        else if (this.H[k] < y + 0.25) this.H[k] = y + 0.25 + (d - hw) * 0.03;       // no dry ground below the river beside it
      }
    });
    // the reaches as lake polygons, a little wider than the water so the shore never shows a gap; rapids where they step down
    for (const [a, b, y] of ends) {
      const L = [], Rr = [];
      for (let i = a; i <= Math.min(n - 1, b + 1); i++) { const [nx, nz] = nrm(i), w = HW(i) + 3; L.push([P[i][0] + nx * w, P[i][1] + nz * w]); Rr.push([P[i][0] - nx * w, P[i][1] - nz * w]); }
      this.lakes.push({ n: o.name || null, y: R2(y), p: [...L, ...Rr.reverse()].flatMap(p => [R1(p[0]), R1(p[1])]), river: 1 });
    }
    for (let r = 1; r < ends.length; r++) {
      const i = ends[r][0], drop = ends[r - 1][2] - ends[r][2]; if (drop < 0.05) continue;
      const j = Math.min(n - 1, i + 1), dx = P[j][0] - P[i][0], dz = P[j][1] - P[i][1], l = Math.hypot(dx, dz) || 1;
      this.special.falls.push({ kind: 'rapid', x0: R1(P[i][0] - dx / l * 3), z0: R1(P[i][1] - dz / l * 3), x1: R1(P[i][0] + dx / l * 3), z1: R1(P[i][1] + dz / l * 3), y0: R2(ends[r - 1][2]), y1: R2(ends[r][2]), w: R1(HW(i) * 2) });
    }
    Object.assign(o, { P, levels: lv, T, ends });
    return o;
  }
  // a small stream: a narrow bed falling steadily downhill; its water follows the bed (STREAM cover, see Island.water)
  stream(o) {
    const P = spline(o.pts, 4), n = P.length, hw = o.hw ?? 3, dep = o.depth ?? 0.8;
    const bed = P.map(([x, z]) => this.h(x, z) - dep);
    for (let i = 1; i < n; i++) bed[i] = Math.min(bed[i], bed[i - 1] - 0.006);
    const sb = gauss1(bed, 3).map((v, i) => Math.min(v, bed[i] + 0.15));
    for (let i = 1; i < n; i++) sb[i] = Math.min(sb[i], sb[i - 1] - 0.002);
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const M = hw + 16;
    this.cells(x0 - M, z0 - M, x1 + M, z1 + M, (k, x, z) => {
      if (this.W[k] !== NONE) return;
      const q = nearestOnLine(P, x, z); if (q.d > M) return;
      const i = Math.min(n - 1, q.i + (q.t > 0.5 ? 1 : 0)), y = sb[i];
      if (q.d < hw) { this.H[k] = Math.min(this.H[k], y - 0.3 * (1 - (q.d / hw) ** 2)); this.CV[k] = C.STREAM; this.W[k] = this.H[k] + 0.25; }
      else { const want = y + 0.35 + (q.d - hw) * 0.3; if (this.H[k] > want) this.H[k] = lerp(want, this.H[k], smooth(hw, M, q.d)); }
    });
    this.special.streams.push({ n: o.name || null, w: R1(hw * 2), p: P.flatMap((p, i) => [R1(p[0]), R1(p[1]), R2(sb[i] + 0.25)]) });
    Object.assign(o, { P, bed: sb });
    return o;
  }
  // a shallow tidal channel through low ground: sea water you can wade through (sea = 2: not the open sea, roads ford it)
  channel(pts, hw, depth = 0.7) {
    const P = spline(pts, 4); let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    this.cells(x0 - hw - 8, z0 - hw - 8, x1 + hw + 8, z1 + hw + 8, (k, x, z) => {
      const d = lineDist(P, x, z), w = hw * (0.8 + 0.4 * this.n3(x / 60, z / 60));
      if (d < w) { const bed = -0.12 - depth * (1 - (d / w) ** 2) * (0.8 + 0.3 * Math.abs(this.noise(x / 9, z / 9))); if (this.H[k] > bed) this.H[k] = bed; this.W[k] = 0; this.CV[k] = C.SEA; if (!this.sea[k]) this.sea[k] = 2; }
      else if (d < w + 8 && !this.sea[k]) this.H[k] = Math.min(this.H[k], lerp(0.15, this.H[k], smooth(w, w + 8, d)));
    });
  }
  // a lake: a polygon [[x,z],…], its level (default: under the lowest shore), the bottom dug below it, the shore lifted just above it.
  // o.ice: frozen (flat ice to drive on, no water); o.bog: a boggy rim
  lake(o) {
    const p = o.poly; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const flat = p.flatMap(q => q), ring = [...p, p[0]];
    let lvl = o.y; if (lvl == null) { let m = 1e9; for (const q of resample(ring, 10)) m = Math.min(m, this.h(q[0], q[1])); lvl = m - 0.5; }
    const dep = o.depth ?? 3, M = o.margin ?? 40;
    this.cells(x0 - M, z0 - M, x1 + M, z1 + M, (k, x, z) => {
      if (this.sea[k]) return;
      const ins = inPoly(flat, x, z), d = lineDist(ring, x, z);
      if (ins) {
        if (o.ice) { this.H[k] = lvl; this.CV[k] = C.ICE; this.KEEP[k] = 1; return; }
        const b = o.shallow ? lvl - 0.08 - dep * smooth(0, o.r ?? 8, d) : lvl - 0.35 - dep * smooth(0, o.r ?? 50, d) - 0.4 * Math.abs(this.noise(x / 17, z / 17)); if (b < this.H[k]) this.H[k] = b;
        this.W[k] = Math.max(this.W[k], lvl); this.CV[k] = C.LAKE;
      } else if (d < M) { const want = lvl + 0.3 + d * (o.bank ?? 0.06); if (this.H[k] < want) this.H[k] = lerp(want, this.H[k], smooth(0, M, d)); if (o.bog && d < 12) this.CV[k] = C.BOG; }
    });
    const e = { n: o.name || null, y: R2(lvl), p: p.flatMap(q => [R1(q[0]), R1(q[1])]) };
    (o.ice ? this.special.ice : this.lakes).push(e);
    return lvl;
  }
  // a pond as a wobbly circle
  pond(x, z, r, o = {}) {
    const poly = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, f = 1 + 0.2 * this.noise(Math.cos(a) * 1.3 + x / 50, Math.sin(a) * 1.3 + z / 50) + 0.1 * this.n2(Math.cos(a) * 3.1 + x / 40, Math.sin(a) * 3.1 + z / 40); poly.push([x + Math.cos(a) * r * f, z + Math.sin(a) * r * f]); }
    return this.lake(Object.assign({ poly, depth: Math.min(3, r / 8) }, o));
  }

  // ---------------------------------------------------------------- roads
  // the road nearest to (x,z) within m metres beyond its edge: {road, i, d, y, hw, bridge}
  roadAt(x, z, m = 0) {
    const L = this.rhash.get(Math.floor(x / 24) * 73856093 ^ Math.floor(z / 24) * 19349663); if (!L) return null;
    let best = null;
    for (const [r, i] of L) {
      const P = r._P, a = P[i], b = P[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1e-9;
      const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0, 1), d = Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
      if (d - r._hw <= m && (!best || d - r._hw < best.d - best.hw)) best = { road: r, i, d, hw: r._hw, y: lerp(r._y[i], r._y[i + 1], t), bridge: r._br[i] && r._br[i + 1] };
    }
    return best;
  }
  // a road through control points (island metres), on a smooth spline. o: {c class, w width, s surface 0 asphalt|1 gravel|2 cobbles|3 dirt, n name,
  // g max grade, sigma smoothing (points), ford: drive through rivers instead of bridging, clear: height of a bridge over the water, raw: no spline}
  road(ctrl, o = {}) {
    const c = o.c ?? 5, w = o.w ?? WIDTH[c], hw = w / 2;
    const P = o.raw ? resample(ctrl, STEP) : spline(ctrl, STEP), n = P.length;
    const t = P.map(([x, z]) => this.h(x, z)), wl = P.map(([x, z]) => this.w(x, z));
    const bridge = new Uint8Array(n), fixed = new Uint8Array(n), deck = new Float32Array(n).fill(-1e9);
    // water on the way (or lava, which the build marks as water): fords (through), short bits of sea (an embankment) or a bridge
    for (let i = 0; i < n && !o.profile;) {
      if (!(wl[i] > t[i] + 0.05)) { i++; continue; }
      let j = i; for (;;) { let k = j + 1; while (k < n && k <= j + 4 && !(wl[k] > t[k] + 0.05)) k++; if (k < n && k <= j + 4 && wl[k] > t[k] + 0.05) j = k; else break; }   // short dry gaps belong to the same crossing
      const sea = P.slice(i, j + 1).some(([x, z]) => this.sea[this.kxz(x, z)] === 1);
      if (o.ford && !sea) { let top = -1e9; for (let k = i; k <= j; k++) top = Math.max(top, wl[k]);       // (a dry bank between two arms is cut down to the water)
        for (let k = i; k <= j; k++) { t[k] = (wl[k] > t[k] ? wl[k] : Math.min(t[k] + (o.fordDepth ?? 0.3), top)) - (o.fordDepth ?? 0.3); fixed[k] = 1; } }
      else if (sea && (j - i) * STEP < (o.causeway ?? 90)) for (let k = i; k <= j; k++) t[k] = Math.max(t[k], 1.4);
      else {
        let top = -1e9; for (let k = i; k <= j; k++) top = Math.max(top, wl[k]);
        const dy = top + (o.clear ?? (sea ? 4 : 2.6)), a = Math.max(0, i - 2), b = Math.min(n - 1, j + 2);
        for (let k = a; k <= b; k++) { bridge[k] = 1; t[k] = Math.max(dy, t[k]); deck[k] = dy; fixed[k] = 1; }
      }
      i = j + 1;
    }
    let y;
    if (o.profile) { y = P.map((p, i) => o.profile(i, n)); if (o.bridgeAll) for (let k = o.bridgeAll[0]; k < n - o.bridgeAll[1]; k++) bridge[k] = 1; }
    else {
      const ts = gauss1(t, 1.5).map((v, k) => fixed[k] ? t[k] : v);
      y = gradeProfile(ts, STEP, o.g ?? 0.12, o.sigma ?? 3);
      // meet the roads already built at the same height (the ends, and crossings on the ground)
      const pins = [];
      for (const i of [0, n - 1]) { const q = this.roadAt(P[i][0], P[i][1], 4); if (q && !q.bridge) pins.push([i, q.y]); }
      for (let i = 4; i < n - 4; i++) { const q = this.roadAt(P[i][0], P[i][1], -0.2); if (q && !q.bridge && !bridge[i] && !pins.some(p => Math.abs(p[0] - i) < 12)) pins.push([i, q.y]); }
      if (o.pins) pins.push(...o.pins.map(([i, py]) => [i < 0 ? n + i : i, py]));
      for (const [i, py] of pins) { const dlt = py - y[i]; for (let m = 0; m < n; m++) y[m] += dlt * Math.exp(-((((m - i) * STEP) / (o.pinR ?? 30)) ** 2)); }
      // humps on purpose (a jump on a course): [fraction along the road, height, radius]
      for (const [f, hb, rb] of o.bumps || []) { const i = Math.round(f * (n - 1)); for (let m = 0; m < n; m++) y[m] += hb * Math.exp(-((((m - i) * STEP) / rb) ** 2)); }
      // the fords (under the water) and bridge decks (over it) are fixed: clamp the profile into the band every road through them must
      // keep to at this grade, so it ramps down to a ford and up to a bridge instead of stepping
      const g = o.g ?? 0.12, dg = g * STEP, Lf = new Float64Array(n).fill(-1e9), Uf = new Float64Array(n).fill(1e9);
      for (let k = 0; k < n; k++) if (fixed[k]) { if (bridge[k]) Lf[k] = deck[k]; else Lf[k] = Uf[k] = t[k]; }      // a deck only has to clear the water
      for (let k = 1; k < n; k++) { Lf[k] = Math.max(Lf[k], Lf[k - 1] - dg); Uf[k] = Math.min(Uf[k], Uf[k - 1] + dg); }
      for (let k = n - 2; k >= 0; k--) { Lf[k] = Math.max(Lf[k], Lf[k + 1] - dg); Uf[k] = Math.min(Uf[k], Uf[k + 1] + dg); }
      for (let k = 0; k < n; k++) y[k] = fixed[k] && !bridge[k] ? t[k] : Math.min(Math.max(y[k], Lf[k]), Math.max(Lf[k], Uf[k]));
    }
    this.carveRoad(P, y, hw, bridge, o);
    const bi = []; for (let k = 0; k < n; k++) if (bridge[k]) bi.push(k);
    const r = { c, w, s: o.s ?? 1, n: o.n ?? null, b: bi.length ? bi : null, wv: null, p: P.flatMap((p, i) => [R1(p[0]), R1(p[1]), R2(y[i])]) };
    Object.defineProperties(r, { _P: { value: P }, _y: { value: y }, _hw: { value: hw }, _br: { value: bridge }, _o: { value: o } });
    this.roads.push(r);
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], b = P[i + 1], R = hw + 2;
      for (let cj = Math.floor((Math.min(a[1], b[1]) - R) / 24); cj <= Math.floor((Math.max(a[1], b[1]) + R) / 24); cj++)
        for (let ci = Math.floor((Math.min(a[0], b[0]) - R) / 24); ci <= Math.floor((Math.max(a[0], b[0]) + R) / 24); ci++) {
          const key = ci * 73856093 ^ cj * 19349663; let L = this.rhash.get(key); if (!L) this.rhash.set(key, L = []); L.push([r, i]);
        }
    }
    return r;
  }
  // write the road bed into the terrain: level across the road and its shoulders, an embankment or a cutting out to the ground
  carveRoad(P, y, hw, bridge, o = {}) {
    const n = P.length, R = hw + 22, N = this.nx * this.nz;
    if (!this._D) { this._D = new Float32Array(N).fill(Infinity); this._Y = new Float32Array(N); this._B = new Uint8Array(N); }
    const D = this._D, Y = this._Y, B = this._B, touched = [];
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], b = P[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1e-9;
      this.cells(Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, (k, x, z) => {
        const tt = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / l2, 0, 1), d = Math.hypot(x - a[0] - ex * tt, z - a[1] - ez * tt);
        if (d >= D[k] || d > R) return;
        if (D[k] === Infinity) touched.push(k);
        D[k] = d; Y[k] = lerp(y[i], y[i + 1], tt); B[k] = bridge[i] || bridge[i + 1] ? 1 : 0;       // as in sim/world/roads.js: a segment touching a bridge point is bridge
      });
    }
    const core = hw + (o.shoulder ?? 1.2);
    for (const k of touched) {
      const d = D[k], yy = Y[k] - 0.04; D[k] = Infinity;
      if (B[k]) { if (d <= core + 1 && this.H[k] > yy - 1.0) this.H[k] = yy - 1.0; continue; }       // the ground (and its bumps) never pokes up through a bridge deck
      if (d <= core) { this.H[k] = yy; this.ROAD[k] = 1; this.KEEP[k] = 1; if (this.W[k] !== NONE && this.W[k] < yy && !this.sea[k]) { this.W[k] = NONE; if (this.CV[k] === C.LAKE) this.CV[k] = C.GRAVEL; } continue; }
      if (this.ROAD[k]) continue;                       // the embankment never buries the bed of a road built before
      const h = this.H[k], E = clamp(Math.abs(h - yy) * 1.6, 2.5, 20), u = (d - core) / E;
      if (u < 1) this.H[k] = yy + (h - yy) * smooth(0, 1, u);
    }
  }
  // the cheapest way from a to b over the ground for a road that may climb at most about g: A* on a 10 m grid, then pulled straight
  // where the ground allows. o: {g, gmax, avoid(x,z) → true where the road must not go, water: cost of a bridge per metre}
  // The search knows which way it arrived at each node, and pays for turning, so the road climbs a steep slope in long hairpin legs
  // instead of a staircase; it runs on smoothed heights, so small bumps do not steer it.
  route(a, b, o = {}) {
    const cs = o.cell ?? 16, nx = Math.ceil((this.x1 - this.x0) / cs) + 1, nz = Math.ceil((this.z1 - this.z0) / cs) + 1, N = nx * nz;
    const g = o.g ?? 0.1, gmax = o.gmax ?? 0.2, turn = o.turn ?? 14;
    const Hs = blur(this.H, this.nx, this.nz, 3), hh = new Float32Array(N), bad = new Float32Array(N);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = this.x0 + i * cs, z = this.z0 + j * cs, k = j * nx + i; hh[k] = this.sample(Hs, x, z);
      bad[k] = this.sea[this.kxz(x, z)] === 1 ? 1e3 : this.wet(x, z) ? (o.water ?? 25) : 0;
      if (o.avoid && o.avoid(x, z)) bad[k] = Math.max(bad[k], 300);
    }
    const M = [[1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [-1, 2], [-1, 1], [-2, 1], [-1, 0], [-2, -1], [-1, -1], [-1, -2], [0, -1], [1, -2], [1, -1], [2, -1]], ND = 16;
    const MA = M.map(([di, dj]) => Math.atan2(dj, di));
    const id = p => clamp(Math.round((p[1] - this.z0) / cs), 0, nz - 1) * nx + clamp(Math.round((p[0] - this.x0) / cs), 0, nx - 1);
    const s0 = id(a), s1 = id(b), S = N * (ND + 1), G = new Float32Array(S).fill(Infinity), from = new Int32Array(S).fill(-1), done = new Uint8Array(S);
    // a binary heap of states in typed arrays
    let hk = new Float64Array(1 << 16), hv = new Int32Array(1 << 16), hn = 0;
    const push = (v, f) => { if (hn >= hk.length) { const k2 = new Float64Array(hk.length * 2), v2 = new Int32Array(hk.length * 2); k2.set(hk); v2.set(hv); hk = k2; hv = v2; }
      let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= f) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = f; hv[i] = v; };
    const pop = () => { const v = hv[0], lf = hk[--hn], lv = hv[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = -1, mf = lf; if (l < hn && hk[l] < mf) { m = l; mf = hk[l]; } if (r < hn && hk[r] < mf) m = r; if (m < 0) break; hk[i] = hk[m]; hv[i] = hv[m]; i = m; } hk[i] = lf; hv[i] = lv; return v; };
    const bi = s1 % nx, bj = (s1 / nx) | 0, hfun = k => Math.hypot((k % nx - bi), ((k / nx | 0) - bj)) * cs;
    G[s0 * (ND + 1) + ND] = 0; push(s0 * (ND + 1) + ND, hfun(s0));
    let end = -1;
    while (hn) {
      const st = pop(); if (done[st]) continue; done[st] = 1;
      const k = (st / (ND + 1)) | 0, d0 = st % (ND + 1); if (k === s1) { end = st; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (let e = 0; e < ND; e++) {
        let tc = 0;
        if (d0 < ND) { let da = Math.abs(MA[e] - MA[d0]); if (da > Math.PI) da = 2 * Math.PI - da; if (da > (o.maxTurn ?? 1.75)) continue; tc = turn * da; }
        const ii = i + M[e][0], jj = j + M[e][1]; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii, qs = q * (ND + 1) + e; if (done[qs]) continue;
        const L = Math.hypot(M[e][0], M[e][1]) * cs, s = Math.abs(hh[q] - hh[k]) / L;
        let c = L * (1 + (s > g ? ((s - g) / 0.02) ** 2 : 0) + bad[q]) + tc;
        if (s > gmax) c *= 30;
        const nG = G[st] + c; if (nG < G[qs]) { G[qs] = nG; from[qs] = st; push(qs, nG + hfun(q)); }
      }
    }
    const path = []; for (let st = end; st >= 0; st = from[st]) { const k = (st / (ND + 1)) | 0; path.push([this.x0 + (k % nx) * cs, this.z0 + ((k / nx) | 0) * cs]); }
    path.reverse(); path[0] = a.slice(); path[path.length - 1] = b.slice();
    // pull it straight wherever a straight line keeps the climb and the cuttings small
    const H = (x, z) => this.sample(Hs, x, z);
    const ok = (p, q) => {
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(2, Math.ceil(L / 10)), h0 = H(...p), h1 = H(...q);
      if (Math.abs(h1 - h0) / Math.max(L, 1) > g * 1.08) return false;
      for (let s = 1; s < n; s++) { const u = s / n, x = lerp(p[0], q[0], u), z = lerp(p[1], q[1], u); if (Math.abs(H(x, z) - lerp(h0, h1, u)) > (o.cut ?? 5) || this.sea[this.kxz(x, z)] || (o.avoid && o.avoid(x, z))) return false; }
      return true;
    };
    const out = [path[0]];
    for (let i = 0; i < path.length - 1;) { let j = Math.min(path.length - 1, i + 30); while (j > i + 1 && !ok(path[i], path[j])) j--; out.push(path[j]); i = j; }
    return out;
  }

  // ---------------------------------------------------------------- buildings
  // a rectangle L long (along the heading ang) and D deep, as a flat footprint [x,z,…]
  rect(cx, cz, L, D, ang) {
    const u = dirv(ang), v = side(ang), p = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) p.push(R1(cx + u[0] * a * L / 2 + v[0] * b * D / 2), R1(cz + u[1] * a * L / 2 + v[1] * b * D / 2));
    return p;
  }
  // is a footprint clear of roads, other buildings and water?
  freeFor(cx, cz, L, D, ang, m = 2.5) {
    const R = Math.hypot(L, D) / 2;
    for (const b of this.buildings) { const dx = b._c[0] - cx, dz = b._c[1] - cz; if (Math.hypot(dx, dz) < R + b._r + m * 0.5 && obbOverlap([cx, cz, L / 2 + m * 0.5, D / 2 + m * 0.5, ang], [b._c[0], b._c[1], b._L / 2, b._D / 2, b._a])) return false; }
    const u = dirv(ang), v = side(ang);
    for (let a = -1; a <= 1; a += 0.5) for (let b = -1; b <= 1; b += 0.5) {
      const x = cx + u[0] * a * L / 2 + v[0] * b * D / 2, z = cz + u[1] * a * L / 2 + v[1] * b * D / 2;
      if (this.roadAt(x, z, m)) return false; if (this.wet(x, z) || this.sea[this.kxz(x, z)]) return false;
    }
    return true;
  }
  // k: building kind (BCLS in build_tromoya.py: 0 house, 2 apartments, 3 cabin, 4 garage, 5 shed, 6 boathouse, 7 barn, 8 warehouse/hall,
  // 9 commercial, 10 school/civic, 11 church), f floors. o.pad: level the ground under it (default), o.y: at this height
  building(cx, cz, L, D, ang, k = 0, f = 1, o = {}) {
    if (o.check && !this.freeFor(cx, cz, L, D, ang, o.m ?? 2.5)) return null;
    if (o.pad !== false) { let y = o.y; if (y == null) { y = 0; for (const [a, b] of [[0, 0], [-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { const u = dirv(ang), v = side(ang); y += this.h(cx + u[0] * a * L + v[0] * b * D, cz + u[1] * a * L + v[1] * b * D); } y /= 5; }
      this.flattenRect(cx, cz, L / 2 + 1.5, D / 2 + 1.5, ang, y, o.blend ?? 6); }
    const b = { k, f, y0: 0, y1: 0, p: this.rect(cx, cz, L, D, ang), rs: o.rs ?? (k === 2 || k >= 8 && k !== 11 ? 'flat' : null) };
    if (o.n) b.n = o.n;
    Object.defineProperties(b, { _c: { value: [cx, cz] }, _L: { value: L }, _D: { value: D }, _a: { value: ang }, _r: { value: Math.hypot(L, D) / 2 } });
    this.buildings.push(b);
    return b;
  }
  // a row of buildings along a line (a street front): from a to b, set back `off` to the right (negative: left), facing the line
  row(a, b, off, o = {}) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), h = head(a, b), sd = side(h), out = [];
    let s = o.gap0 ?? 4;
    while (s < L - 6) {
      const len = o.len ? o.len(this.R) : 10 + this.R() * 6; if (s + len > L - (o.gap0 ?? 4)) break;
      const dep = o.dep ? o.dep(this.R) : 8 + this.R() * 3, c = add(add(a, dirv(h), s + len / 2), sd, off + Math.sign(off || 1) * dep / 2);
      const bb = this.building(c[0], c[1], len, dep, h, o.k ? o.k(this.R) : 0, o.f ? o.f(this.R) : 1, { check: true, m: o.m ?? 2, y: o.y });
      if (bb) out.push(bb);
      s += len + (o.gap ? o.gap(this.R) : 3 + this.R() * 6);
    }
    return out;
  }

  // ---------------------------------------------------------------- the village with the ferry quay (every island has one)
  // o: {at: [x,z] near the shore, h: heading out to sea, name, houses, snow}. Returns {shore, square, out (where the road inland ends)}
  village(o) {
    const h = o.h, u = dirv(h), v = side(h);
    // the shore along the heading
    let s0 = null; for (let s = -400; s < 500; s += 2) { const p = add(o.at, u, s); if (this.d(p[0], p[1]) <= 0) { s0 = p; break; } }
    if (!s0) throw new Error(this.id + ': no shore for the village');
    const yq = o.y ?? 2.0, qlen = o.qlen ?? 34, root = add(s0, u, -8), end = add(s0, u, qlen), sq = add(s0, u, -(o.back ?? 58));
    this.flatten(sq[0], sq[1], o.r ?? 34, yq + 0.2, 26);
    this.flattenRect(...add(s0, u, -18), 16, 13, h, yq, 10);
    // dredge a berth for the ferry: deep water along the quay and off its end
    const qa = add(s0, u, 2);
    this.cells(Math.min(qa[0], end[0]) - 70, Math.min(qa[1], end[1]) - 70, Math.max(qa[0], end[0]) + 70, Math.max(qa[1], end[1]) + 70, (k, x, z) => {
      const along = (x - s0[0]) * u[0] + (z - s0[1]) * u[1], d = lineDist([qa, add(end, u, 30)], x, z);
      if (along < 4 || d > 60) return;
      const want = -lerp(7.5, 2, smooth(14, 60, d)) * smooth(4, 16, along); if (this.H[k] > want) { this.H[k] = want; this.W[k] = 0; this.CV[k] = C.SEA; this.sea[k] = 1; }
    });
    this.special.quays.push({ kind: 'ferry', x0: R1(root[0]), z0: R1(root[1]), x1: R1(end[0]), z1: R1(end[1]), w: 9, y: yq, n: o.name });
    this.piers.push([R1(root[0]), R1(root[1]), R1(end[0]), R1(end[1])]);
    this.pois.ferry = { x: R1(end[0]), z: R1(end[1]), h: R2(h) };
    // the ferry office by the quay, boathouses on the shore, houses round the square
    const fo = add(add(s0, u, -20), v, 17);
    this.building(fo[0], fo[1], 14, 9, h + Math.PI / 2, 9, 2, { y: yq + 0.1, n: 'Ferjekontoret' });
    for (const sd of [-1, 1]) for (let i = 0; i < (o.boathouses ?? 2); i++) {
      const p = add(add(s0, v, sd * (30 + i * 11)), u, -3), yb = Math.max(0.9, this.h(p[0], p[1]) + 0.2);
      if (this.d(p[0], p[1]) < -6) continue;
      this.building(p[0], p[1], 10, 6.5, h, 6, 1, { y: yb, blend: 4 });
    }
    const n = o.houses ?? 8, sq2 = add(s0, u, -(o.back ?? 58));
    let placed = 0;
    for (let i = 0; i < 60 && placed < n; i++) {
      const a = h + Math.PI * (0.35 + 1.3 * this.R()), rr = (o.r ?? 34) + 6 + this.R() * 22, c = add(sq2, dirv(a), rr);
      const toSq = head(c, sq2), L = 8 + this.R() * 4, D = 6 + this.R() * 2;
      if (Math.abs(Math.atan2(Math.sin(a - h - Math.PI), Math.cos(a - h - Math.PI))) < 0.32) continue;     // the road out of the village
      if (this.building(c[0], c[1], L, D, toSq + Math.PI / 2, 0, this.R() < 0.4 ? 2 : 1, { check: true, m: 3 })) placed++;
    }
    this.special.squares.push({ x: R1(sq2[0]), z: R1(sq2[1]), r: 24, kind: 'gravel', n: o.name });
    this.paint(sq2[0], sq2[1], 26, C.GRAVEL);
    const sg = add(add(s0, u, -14), v, -9);
    this.special.signs.push({ x: R1(sg[0]), z: R1(sg[1]), h: R2(h + Math.PI), text: 'FERJE', sub: o.sign ?? 'kjør om bord' });
    this.labels.push({ n: o.name, x: Math.round(sq2[0]), z: Math.round(sq2[1]), t: 'village' });
    // the road: from the quay through the square and inland
    const out = add(sq2, u, -(o.out ?? 110));
    this.road([root, add(s0, u, -30), sq2, add(sq2, u, -60), out], { c: 4, s: o.s ?? 1, n: o.road ?? null, g: 0.1, pins: [[0, yq]] });
    this.village_ = { shore: s0, square: sq2, root, end, out, h };
    return this.village_;
  }
  spawnAt(p, h) { this.pois.spawn = { x: R1(p[0]), z: R1(p[1]), h: R2(h) }; }

  // ---------------------------------------------------------------- courses
  // a course along a line: gates spaced along it (the last is the finish). o: {id,name,desc,diff,kind, path [[x,z],…] (the line the car drives),
  // gates (count or explicit points)}
  course(o) {
    const P = resample(o.path, 6), L = lineLength(P), ng = typeof o.gates === 'number' ? o.gates : o.gates ? o.gates.length : clamp(Math.round(L / 260), 8, 16);
    const gates = Array.isArray(o.gates) ? o.gates.map(p => [R1(p[0]), R1(p[1])]) : [];
    if (!gates.length) for (let g = 1; g <= ng; g++) { const t = g / ng, i = Math.min(P.length - 1, Math.round(t * (P.length - 1))); gates.push([R1(P[i][0]), R1(P[i][1])]); }
    const h = head(P[0], P[Math.min(P.length - 1, 3)]);
    const c = { id: o.id, name: o.name, desc: o.desc, diff: o.diff, kind: o.kind, gates, start: { x: R1(P[0][0]), z: R1(P[0][1]), h: R2(h) }, len: Math.round(L), p: P.flatMap(p => [R1(p[0]), R1(p[1])]) };
    if (o.night) c.night = true;
    this.courses.push(c);
    return c;
  }
  // a line along the roads already built, through the given points (junctions): each leg follows the road both its ends lie on
  viaRoads(pts) {
    const out = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1]; let best = null;
      for (const r of this.roads) {
        const qa = nearestOnLine(r._P, a[0], a[1]), qb = nearestOnLine(r._P, b[0], b[1]);
        if (qa.d < r._hw + 4 && qb.d < r._hw + 4 && (!best || qa.d + qb.d < best.s)) best = { r, ia: qa.i + (qa.t > 0.5 ? 1 : 0), ib: qb.i + (qb.t > 0.5 ? 1 : 0), s: qa.d + qb.d };
      }
      let leg = [a, b];
      if (best) {
        const P = best.r._P, n = P.length, { ia, ib } = best, closed = Math.hypot(P[0][0] - P[n - 1][0], P[0][1] - P[n - 1][1]) < 1;
        if (closed && Math.abs(ib - ia) > (n - 1) / 2) leg = ia < ib ? [...P.slice(0, ia + 1).reverse(), ...P.slice(ib, n - 1).reverse()] : [...P.slice(ia, n), ...P.slice(1, ib + 1)];
        else leg = ia <= ib ? P.slice(ia, ib + 1) : P.slice(ib, ia + 1).reverse();
      }
      out.push(...(out.length ? leg.slice(1) : leg));
    }
    return out;
  }
  // the points of a road (or a stretch of it) as a line [[x,z],…]
  line(r, a = 0, b) { const P = r._P; return P.slice(a, b == null ? P.length : b); }

  // ---------------------------------------------------------------- finishing
  finish() {
    for (const b of this.buildings) {
      let lo = 1e9, hi = -1e9; const p = b.p;
      for (let i = 0; i < p.length; i += 2) { const y = this.h(p[i], p[i + 1]); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      const y = this.h(b._c[0], b._c[1]); lo = Math.min(lo, y); hi = Math.max(hi, y);
      b.y0 = R2(lo); b.y1 = R2(hi);
    }
    // land cover in the sea stays sea; skerries and holms out there are bare rock
    for (let k = 0; k < this.H.length; k++) if (this.sea[k]) this.CV[k] = this.H[k] > 0.3 ? C.ROCK : C.SEA; else if (this.CV[k] === C.SEA) this.CV[k] = C.ROCK;
    // (and so is every bit of land smaller than 0.5 ha, not just its sea cells: no sand cones out in the sea)
    const seen = new Uint8Array(this.H.length), nx = this.nx, nz = this.nz;
    for (let s0 = 0; s0 < this.H.length; s0++) {
      if (seen[s0] || !(this.H[s0] > 0)) continue;
      const comp = [s0]; seen[s0] = 1;
      for (let q = 0; q < comp.length && comp.length <= 200; q++) { const k = comp[q], i = k % nx, j = (k - i) / nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj, kk = jj * nx + ii; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && !seen[kk] && this.H[kk] > 0) { seen[kk] = 1; comp.push(kk); } } }
      if (comp.length <= 200) for (const k of comp) if (this.CV[k] !== C.LAKE) this.CV[k] = C.ROCK;
    }
  }
  stats() {
    let lo = 1e9, hi = -1e9, land = 0; for (let k = 0; k < this.H.length; k++) { lo = Math.min(lo, this.H[k]); hi = Math.max(hi, this.H[k]); if (this.H[k] > 0 && !this.sea[k]) land++; }
    let km = 0; for (const r of this.roads) km += lineLength(r._P) / 1000;
    return { size: [Math.round(this.x1 - this.x0), Math.round(this.z1 - this.z0)], h: [R1(lo), R1(hi)], landKm2: R2(land * this.cell * this.cell / 1e6), roadKm: R1(km), roads: this.roads.length, buildings: this.buildings.length, courses: this.courses.length };
  }
  write(dir) {
    this.finish();
    const sz = [writeGrid(dir + '/terrain.bin.gz', this.H, this.nx, this.nz, this.x0, this.z0, this.cell, 'h'), writeGrid(dir + '/cover.bin.gz', this.CV, this.nx, this.nz, this.x0, this.z0, this.cell, 'c')];
    const sp = {}; for (const [k, v] of Object.entries(this.special)) if (v && (!Array.isArray(v) || v.length)) sp[k] = v;
    const feat = { credits: 'Laget fra de gamle banene i Skare Offroad (data/levels), i ekte størrelse.', cover: Object.keys(C), roads: this.roads, buildings: this.buildings,
      lakes: this.lakes, labels: this.labels, piers: this.piers, pois: this.pois, courses: this.courses, special: sp };
    sz.push(writeJSON(dir + '/features.json.gz', feat));
    return sz;
  }
  // a picture of the island: land cover in colour, shaded by the slopes, water, roads, buildings and the courses
  preview(file, scale = 1) {
    const pal = [[38, 78, 120], [214, 196, 150], [140, 134, 124], [46, 82, 44], [64, 98, 52], [92, 122, 62], [120, 112, 70], [120, 160, 80], [170, 160, 90], [130, 150, 100],
      [150, 150, 150], [90, 86, 60], [60, 110, 160], [170, 160, 140], [70, 120, 170], [240, 244, 248], [70, 66, 62], [230, 70, 20], [30, 90, 40], [190, 160, 90], [90, 70, 50], [130, 100, 70], [180, 215, 235], [205, 190, 130], [150, 175, 160]];
    const w = Math.floor(this.nx / scale), hgt = Math.floor(this.nz / scale), img = Buffer.alloc(w * hgt * 3);
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
      const i = x * scale, j = y * scale, k = j * this.nx + i, c = pal[this.CV[k]] || [255, 0, 255];
      const gx = (this.H[this.k(i + 1, j)] - this.H[this.k(i - 1, j)]) / (2 * this.cell), gz = (this.H[this.k(i, j + 1)] - this.H[this.k(i, j - 1)]) / (2 * this.cell);
      let s = clamp(1 + (-gx - gz) * 1.4, 0.45, 1.5); if (this.W[k] > this.H[k]) s = 0.75 + 0.25 * clamp(1 + (this.H[k] - this.W[k]) / 8, 0, 1);
      const o = (y * w + x) * 3; img[o] = clamp(c[0] * s, 0, 255); img[o + 1] = clamp(c[1] * s, 0, 255); img[o + 2] = clamp(c[2] * s, 0, 255);
    }
    const put = (x, z, col) => { const i = Math.round((x - this.x0) / this.cell / scale), j = Math.round((z - this.z0) / this.cell / scale); if (i < 0 || j < 0 || i >= w || j >= hgt) return; const o = (j * w + i) * 3; img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; };
    const line = (L, col, r = 0) => { for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2); for (let s = 0; s <= n; s++) { const x = lerp(a[0], b[0], s / n), z = lerp(a[1], b[1], s / n); put(x, z, col); if (r) { put(x + this.cell * scale, z, col); put(x, z + this.cell * scale, col); } } } };
    for (const r of this.roads) line(r._P, r.b ? [200, 120, 40] : r.s === 0 ? [40, 40, 40] : [235, 225, 200], r.c <= 4 ? 1 : 0);
    for (const b of this.buildings) { const p = b.p; for (let i = 0; i < p.length; i += 2) line([[p[i], p[i + 1]], [p[(i + 2) % p.length], p[(i + 3) % p.length]]], [200, 40, 40]); line([[p[0], p[1]], [p[4], p[5]]], [200, 40, 40]); }
    const cols = [[255, 60, 200], [255, 200, 0], [0, 230, 255], [140, 255, 60], [255, 120, 0], [180, 120, 255], [255, 255, 255], [0, 120, 255]];
    this.courses.forEach((c, i) => { const L = []; for (let q = 0; q < c.p.length; q += 2) L.push([c.p[q], c.p[q + 1]]); line(L, cols[i % cols.length]); for (const g of c.gates) for (let a = 0; a < 6.28; a += 0.4) put(g[0] + Math.cos(a) * 12, g[1] + Math.sin(a) * 12, cols[i % cols.length]); });
    for (const q of this.special.quays) line([[q.x0, q.z0], [q.x1, q.z1]], [120, 70, 30], 1);
    for (const l of this.special.lava) { const L = []; for (let q = 0; q < l.p.length; q += 4) L.push([l.p[q], l.p[q + 1]]); line(L, [255, 120, 0], 1); }
    if (this.pois.ferry) for (let a = 0; a < 6.28; a += 0.3) put(this.pois.ferry.x + Math.cos(a) * 8, this.pois.ferry.z + Math.sin(a) * 8, [255, 0, 0]);
    writePNG(file, w, hgt, img);
  }
}
// do two rotated rectangles [cx, cz, half length (along the heading), half width, heading] overlap?
export function obbOverlap(A, B) {
  const ax = [dirv(A[4]), side(A[4])], bx = [dirv(B[4]), side(B[4])], dx = B[0] - A[0], dz = B[1] - A[1];
  for (const n of [...ax, ...bx]) {
    const ra = A[2] * Math.abs(ax[0][0] * n[0] + ax[0][1] * n[1]) + A[3] * Math.abs(ax[1][0] * n[0] + ax[1][1] * n[1]);
    const rb = B[2] * Math.abs(bx[0][0] * n[0] + bx[0][1] * n[1]) + B[3] * Math.abs(bx[1][0] * n[0] + bx[1][1] * n[1]);
    if (Math.abs(dx * n[0] + dz * n[1]) > ra + rb) return false;
  }
  return true;
}
