// Tools for building the made-up islands at real scale (tools/geo/build_islands.mjs): the old toy-scale level generator run in
// Node, grids (blur, distance transform, rasterising), noise, roads with graded height profiles that cut and fill the terrain,
// a router that finds roads up steep ground, buildings, and the writers for the world/<id>/ files (the format of build_tromoya.py).
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import vm from 'vm'; import { createRequire } from 'module';
import { COVER } from '../../sim/world/island.js';
import { mulberry32 } from '../../sim/world/grid.js';
export { COVER };
const C = COVER;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const R1 = v => Math.round(v * 10) / 10, R2 = v => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ the old game (js/core.js) in Node
let oldReady = false;
export function oldEngine(root) {
  if (!oldReady) {
    const require = createRequire(path.join(root, 'x.js'));
    require(path.join(root, 'tools/sim-shim.js'));
    const load = f => vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
    load('js/core.js'); load('js/props.js');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const m of html.matchAll(/<script src="(js\/props\/[^"]+\.js)"/g)) load(m[1]);
    for (const f of ['js/skier.js', 'data/parts.js', 'data/cars.js', 'data/vegetasjon.js', 'data/dyr.js', 'data/savanne.js']) load(f);
    for (const m of html.matchAll(/<script src="(data\/levels\/[^"]+\.js)"/g)) load(m[1]);
    oldReady = true;
  }
  return n => vm.runInThisContext(n);
}
// one old level: the base terrain TB (before rocks, logs and ramps), the stamped terrain TH, the surfaces TS and everything genLevel made
export function runOld(root, id) {
  const g = oldEngine(root), def = g('LEVELS').find(d => d.id === id), lv = g('genLevel')(def), G = g('G');
  const N = g('N'), HALF = g('HALF'), CELL = g('CELL');
  return { def, lv, G, N, HALF, CELL, TB: Float32Array.from(g('TB')), TH: Float32Array.from(g('TH')), TS: Uint8Array.from(g('TS')), S: g('S'), water: def.water ?? 0.3 };
}
// sampling an old N×N grid at old coordinates
export function oldSampler(o, A) {
  const { N, HALF, CELL } = o, at = (i, j) => A[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
  return {
    bilinear(x, z) { const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v; },
    nearest(x, z) { return at(Math.round((x + HALF) / CELL), Math.round((z + HALF) / CELL)); },
  };
}
// fill the masked cells of an old grid smoothly from their edges (old river beds, so the new rivers can be dug at real scale)
export function relaxFill(A, mask, N, iters = 400) {
  const out = Float32Array.from(A), idx = [];
  for (let k = 0; k < N * N; k++) if (mask[k]) idx.push(k);
  // start from the mean of the edge so the relaxation converges quickly
  for (const k of idx) { let s = 0, n = 0; for (let r = 1; r < 40 && !n; r++) for (const d of [-r, r, -r * N, r * N]) { const q = k + d; if (q >= 0 && q < N * N && !mask[q]) { s += A[q]; n++; } } out[k] = n ? s / n : A[k]; }
  for (let it = 0; it < iters; it++) for (const k of idx) { const i = k % N, j = (k / N) | 0; if (i < 1 || j < 1 || i > N - 2 || j > N - 2) continue; out[k] = (out[k - 1] + out[k + 1] + out[k - N] + out[k + N]) * 0.25; }
  return out;
}

// ------------------------------------------------------------------ noise (gradient noise, deterministic from a seed)
export function makeNoise(seed) {
  const R = mulberry32(seed >>> 0), p = new Uint8Array(512), gx = new Float32Array(256), gz = new Float32Array(256);
  for (let i = 0; i < 256; i++) { p[i] = i; const a = R() * Math.PI * 2; gx[i] = Math.cos(a); gz[i] = Math.sin(a); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)), t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  return (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, I = i & 255, J = j & 255;
    const g = (a, b, dx, dz) => { const h = p[p[a] + b]; return gx[h] * dx + gz[h] * dz; };
    const fu = u * u * u * (u * (u * 6 - 15) + 10), fv = v * v * v * (v * (v * 6 - 15) + 10);
    const n00 = g(I, J, u, v), n10 = g(I + 1, J, u - 1, v), n01 = g(I, J + 1, u, v - 1), n11 = g(I + 1, J + 1, u - 1, v - 1);
    return ((n00 + (n10 - n00) * fu) * (1 - fv) + (n01 + (n11 - n01) * fu) * fv) * 1.414;
  };
}
export function fbm(n, x, z, oct = 4, gain = 0.5) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += n(x * f + i * 31.7, z * f - i * 17.3) * a; t += a; a *= gain; f *= 2.03; } return s / t; }
// ridges: sharp crests where the noise crosses zero (rock ridges, lava ridges, mountain spurs)
export function ridged(n, x, z, oct = 4) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(n(x * f + i * 19.1, z * f + i * 7.7)); s += r * r * a; t += a; a *= 0.5; f *= 2.1; } return s / t; }

// ------------------------------------------------------------------ grid operations
// squared-distance transform (Felzenszwalb): distance in cells from every cell to the nearest cell where mask is set
export function edt(mask, nx, nz) {
  const INF = 1e20, D = new Float64Array(nx * nz), n = Math.max(nx, nz), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= zz[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
    }
    k = 0; for (let q = 0; q < len; q++) { while (zz[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let i = 0; i < nx; i++) { for (let j = 0; j < nz; j++) f[j] = mask[j * nx + i] ? 0 : INF; pass(nz); for (let j = 0; j < nz; j++) D[j * nx + i] = d[j]; }
  for (let j = 0; j < nz; j++) { for (let i = 0; i < nx; i++) f[i] = D[j * nx + i]; pass(nx); for (let i = 0; i < nx; i++) D[j * nx + i] = d[i]; }
  const out = new Float32Array(nx * nz); for (let k = 0; k < out.length; k++) out[k] = Math.sqrt(D[k]); return out;
}
// gaussian blur (separable), sigma in cells
export function blur(A, nx, nz, sigma) {
  if (sigma <= 0) return Float32Array.from(A);
  const r = Math.ceil(sigma * 3), w = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { w[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += w[i + r]; } for (let i = 0; i < w.length; i++) w[i] /= s;
  const T = new Float32Array(nx * nz), O = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) { const o = j * nx; for (let i = 0; i < nx; i++) { let a = 0; for (let k = -r; k <= r; k++) a += A[o + clamp(i + k, 0, nx - 1)] * w[k + r]; T[o + i] = a; } }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let a = 0; for (let k = -r; k <= r; k++) a += T[clamp(j + k, 0, nz - 1) * nx + i] * w[k + r]; O[j * nx + i] = a; }
  return O;
}
export function inPoly(p, x, z) {
  let ins = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; }
  return ins;
}
// distance from a point to a polyline [[x,z],…]: {d, i (segment), t, x, z}
export function nearestOnLine(L, x, z) {
  let best = { d: 1e9, i: 0, t: 0, x: 0, z: 0 };
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i], b = L[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1e-9;
    let t = ((x - a[0]) * ex + (z - a[1]) * ez) / l2; t = clamp(t, 0, 1);
    const px = a[0] + ex * t, pz = a[1] + ez * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, i, t, x: px, z: pz };
  }
  return best;
}
export const lineDist = (L, x, z) => nearestOnLine(L, x, z).d;
export function lineLength(L) { let s = 0; for (let i = 1; i < L.length; i++) s += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); return s; }
// a polyline at even spacing along a centripetal Catmull-Rom spline through the control points (so roads bend smoothly)
export function spline(P, step = 3, closed = false) {
  if (P.length < 2) return P.slice();
  const pts = closed ? [P[P.length - 1], ...P, P[0], P[1]] : [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]]];
  const dense = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const t01 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.5) || 1e-4, t12 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), 0.5) || 1e-4, t23 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), 0.5) || 1e-4;
    const m1 = [0, 1].map(k => (p2[k] - p1[k] + t12 * ((p1[k] - p0[k]) / t01 - (p2[k] - p0[k]) / (t01 + t12)))), m2 = [0, 1].map(k => (p2[k] - p1[k] + t12 * ((p3[k] - p2[k]) / t23 - (p3[k] - p1[k]) / (t12 + t23))));
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), n = Math.max(2, Math.ceil(L / 0.5));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      dense.push([h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0], h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1]]);
    }
  }
  dense.push(closed ? dense[0].slice() : P[P.length - 1].slice());
  return resample(dense, step);
}
export function resample(L, step) {
  const out = [L[0].slice()]; let acc = 0;
  for (let i = 1; i < L.length; i++) {
    let ax = L[i - 1][0], az = L[i - 1][1]; const bx = L[i][0], bz = L[i][1]; let seg = Math.hypot(bx - ax, bz - az);
    while (acc + seg >= step) { const t = (step - acc) / seg; ax += (bx - ax) * t; az += (bz - az) * t; out.push([ax, az]); seg = Math.hypot(bx - ax, bz - az); acc = 0; }
    acc += seg;
  }
  const e = L[L.length - 1]; if (Math.hypot(e[0] - out[out.length - 1][0], e[1] - out[out.length - 1][1]) > step * 0.3) out.push(e.slice()); else out[out.length - 1] = e.slice();
  return out;
}
export function chaikin(L, n = 2) { for (let k = 0; k < n; k++) { const o = [L[0]]; for (let i = 0; i < L.length - 1; i++) { const a = L[i], b = L[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } o.push(L[L.length - 1]); L = o; } return L; }
export function gauss1(A, sigma) {
  if (sigma <= 0 || A.length < 3) return A.slice();
  const r = Math.ceil(sigma * 3), out = new Array(A.length);
  for (let i = 0; i < A.length; i++) { let s = 0, w = 0; for (let k = -r; k <= r; k++) { const j = clamp(i + k, 0, A.length - 1), q = Math.exp(-k * k / (2 * sigma * sigma)); s += A[j] * q; w += q; } out[i] = s / w; }
  return out;
}
// a height profile that never climbs or falls more than g per metre and stays as close to the ground as it can:
// the mean of the lowest g-steep curve above the ground and the highest one below it, then smoothed (vertical curves)
export function gradeProfile(t, ds, g, sigma = 2) {
  const n = t.length, Lo = t.slice(), Up = t.slice(), dg = g * ds;
  for (let i = 1; i < n; i++) { Lo[i] = Math.max(Lo[i], Lo[i - 1] - dg); Up[i] = Math.min(Up[i], Up[i - 1] + dg); }
  for (let i = n - 2; i >= 0; i--) { Lo[i] = Math.max(Lo[i], Lo[i + 1] - dg); Up[i] = Math.min(Up[i], Up[i + 1] + dg); }
  return gauss1(Lo.map((v, i) => (v + Up[i]) / 2), sigma);
}

// ------------------------------------------------------------------ writing the files
export function writeGrid(file, A, nx, nz, x0, z0, cell, kind) {
  let hdr, body;
  if (kind === 'h') {
    hdr = { nx, nz, x0, z0, cell, scale: 0.05, delta: true };
    const d = new Int16Array(nx * nz);
    for (let j = 0; j < nz; j++) { let prev = 0; for (let i = 0; i < nx; i++) { const q = Math.round(A[j * nx + i] / 0.05); d[j * nx + i] = q - prev; prev = q; } }
    body = Buffer.from(d.buffer);
  } else { hdr = { nx, nz, x0, z0, cell }; body = Buffer.from(A.buffer, A.byteOffset, A.byteLength); }
  const hj = Buffer.from(JSON.stringify(hdr)), len = Buffer.alloc(4); len.writeUInt32LE(hj.length);
  return writeAtomic(file, zlib.gzipSync(Buffer.concat([Buffer.from('TRMG'), len, hj, body]), { level: 9 }));
}
export function writeJSON(file, obj) { return writeAtomic(file, zlib.gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 })); }
// write to a temporary file and rename it, so nothing ever reads a half-written file (the game may be loading while the tool runs)
function writeAtomic(file, buf) { fs.writeFileSync(file + '.tmp', buf); fs.renameSync(file + '.tmp', file); return buf.length; }
// a PNG (RGB) for looking at the result
export function writePNG(file, w, h, rgb) {
  const crcT = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
  const crc = b => { let c = -1; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy ? rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3) : raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
