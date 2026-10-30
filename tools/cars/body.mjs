// The body shell: one smooth surface lofted through cross sections along the car (both halves, mirrored in x).
//   s        mm back from the nose (0 … len)
//   sec(s)   → K control points [[x, y], …] of the half section (mm, y above the ground), from the floor centre round the flank
//            to the roof centre. The closed curve through them and their mirror images is a centripetal Catmull-Rom, sampled
//            uniformly per segment, so every integer u (0 … K−1) is a feature line along the car (floor corner, beltline …).
//   mat(s,u) → material name, 'name:inset' (inset in mm, pushed into the body: windows, panel gaps, intakes) or null (no surface)
// Wheel arches are cut out of the flank: columns over a wheel start at the arch line instead of the floor.
import { MeshData } from './glb.mjs';
import { THREE, add, shape } from './geo.mjs';

// a monotone cubic through [[s, v], …] (no overshoot), as a function of s; f.keys are the breakpoints
export function tab(pts) {
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const f = s => {
    if (s <= xs[0]) return ys[0]; if (s >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (s > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (s - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (3 * t2 - 2 * t3) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
  f.keys = xs; return f;
}

// centripetal Catmull-Rom on the closed, mirrored half section C at u (segment floor(u), fraction u − floor(u))
export function secPt(C, u) {
  const K = C.length, F = C.concat(C.slice(1, K - 1).reverse().map(p => [-p[0], p[1]])), n = F.length;
  const k = Math.min(K - 2, Math.max(0, Math.floor(u))), t = Math.min(1, Math.max(0, u - k));
  const p0 = F[(k - 1 + n) % n], p1 = F[k], p2 = F[k + 1], p3 = F[(k + 2) % n];
  const dt = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = dt(p0, p1), t2 = t1 + dt(p1, p2), t3 = t2 + dt(p2, p3), T = t1 + t * (t2 - t1);
  const L = (a, b, ta, tb) => [((tb - T) * a[0] + (T - ta) * b[0]) / (tb - ta), ((tb - T) * a[1] + (T - ta) * b[1]) / (tb - ta)];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

export function archTop(A, s) {
  const Rz = A.Rz ?? A.R, dz = Math.abs(s - A.s);
  if (dz >= Rz) return A.yc;
  return A.yc + A.R * Math.pow(1 - Math.pow(dz / Rz, A.p ?? 2), 1 / (A.p ?? 2));
}

export function loft(o) {
  const { len, sec, zNose, cgH } = o, K = sec(len / 2).length, nU = o.nU || new Array(K - 1).fill(4), uLow = o.uLow ?? 1, uTop = o.uTop ?? 4;
  const arches = o.arches || [], [rF, rR] = o.round || [0, 0], ds = o.ds || 40;
  const toM = (X, Y, s) => [X / 1000, Y / 1000 - cgH, zNose - s / 1000];
  // the section at s with the ends rounded off (pulled towards the middle of the section by up to the rounding radius)
  const inset = s => s < rF ? rF - Math.sqrt(Math.max(0, rF * rF - (rF - s) ** 2)) : s > len - rR ? rR - Math.sqrt(Math.max(0, rR * rR - (s - len + rR) ** 2)) : 0;
  const uAtC = (C, y) => { let a = uLow, b = uTop; for (let k = 0; k < 40; k++) { const m = (a + b) / 2; secPt(C, m)[1] < y ? a = m : b = m; } return (a + b) / 2; };
  const P2 = (C, u, s) => {
    const p = secPt(C, u), d = inset(s); if (!d) return p;
    const cy = (C[0][1] + C[K - 1][1]) / 2, dx = p[0], dy = p[1] - cy, l = Math.hypot(dx, dy) || 1;
    return [p[0] - dx / l * d, p[1] - dy / l * d];
  };
  // stations: even spacing, the breakpoints of the tables, extra feature lines, denser near rounded ends; arch edges twice
  const S = new Set(); for (let s = 0; s <= len; s += ds) S.add(Math.round(s));
  for (const s of o.keys || []) if (s > 0 && s < len) S.add(s);
  for (let i = 1; i < 6; i++) { if (rF) S.add(rF * (1 - Math.cos(i / 6 * Math.PI / 2))); if (rR) S.add(len - rR * (1 - Math.cos(i / 6 * Math.PI / 2))); }
  S.add(0); S.add(len);
  const cols = [];
  for (const s of [...S].sort((a, b) => a - b)) {
    if (arches.some(A => Math.abs(Math.abs(s - A.s) - (A.Rz ?? A.R)) < 1.5)) continue;
    cols.push({ s, A: arches.find(A => Math.abs(s - A.s) < (A.Rz ?? A.R)) });
  }
  for (const A of arches) for (const e of [-1, 1]) {
    const s = A.s + e * (A.Rz ?? A.R), i = cols.findIndex(c => c.s > s);
    cols.splice(i, 0, ...(e < 0 ? [{ s, dup: 1 }, { s, A, dup: 1 }] : [{ s, A, dup: 1 }, { s, dup: 1 }]));
  }
  const U = new Set(); for (let k = 0; k < K - 1; k++) for (let m = 0; m < nU[k]; m++) U.add(+(k + m / nU[k]).toFixed(5));
  U.add(K - 1); for (const u of o.uExtra || []) U.add(u);
  const us = [...U].sort((a, b) => a - b), ni = us.length, nj = cols.length;
  // the grid in metres
  const G = cols.map(c => {
    const C = sec(c.s); c.C = C;
    let map = u => u;
    if (c.A) { const u0 = Math.min(uTop - 0.02, uAtC(C, archTop(c.A, c.s))); map = u => u <= uLow ? u0 : u >= uTop ? u : u0 + (u - uLow) / (uTop - uLow) * (uTop - u0); }
    return us.map(u => { const p = P2(C, map(u), c.s); return toM(p[0], p[1], c.s); });
  });
  const creaseS = new Set(o.creaseS || []), creaseU = new Set(o.creaseU || []);
  const cS = cols.map((c, j) => j === 0 || j === nj - 1 || c.dup || creaseS.has(c.s)), cU = us.map((u, i) => i === 0 || i === ni - 1 || creaseU.has(u));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (j, i, J, I) => {
    const dS = (w = 1) => cS[j] ? (j === J ? sub(G[Math.min(nj - 1, j + w)][i], G[j][i]) : sub(G[j][i], G[Math.max(0, j - w)][i])) : sub(G[Math.min(nj - 1, j + w)][i], G[Math.max(0, j - w)][i]);
    const dU = (w = 1) => cU[i] ? (i === I ? sub(G[j][Math.min(ni - 1, i + w)], G[j][i]) : sub(G[j][i], G[j][Math.max(0, i - w)])) : sub(G[j][Math.min(ni - 1, i + w)], G[j][Math.max(0, i - w)]);
    let a = dS(), b = dU();
    if (Math.hypot(...a) < 1e-7) a = dS(3); if (Math.hypot(...b) < 1e-7) b = dU(3);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...n) || 1;
    if (Math.abs(G[j][i][0]) < 1e-5) { n[0] = 0; const l2 = Math.hypot(...n) || 1; return [0, n[1] / l2, n[2] / l2]; }
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  // materials per cell
  const parse = m => { if (!m) return null; const [name, e] = m.split(':'); return { name, e: e ? +e : name === 'glass' ? (o.glassInset ?? 12) : 0 }; };
  const cell = [];
  for (let j = 0; j < nj - 1; j++) {
    cell.push([]);
    for (let i = 0; i < ni - 1; i++) {
      const a = cols[j], b = cols[j + 1];
      let m = null;
      if (a.s !== b.s && !((a.A || b.A) && us[i] < uLow - 1e-6)) m = parse(o.mat((a.s + b.s) / 2, (us[i] + us[i + 1]) / 2));
      cell[j].push(m);
    }
  }
  const half = new MeshData(), lin = o.lining, bufs = new Map();
  const buf = n => { let b = bufs.get(n); if (!b) bufs.set(n, b = { P: [], N: [], I: [], map: new Map() }); return b; };
  const vert = (b, j, i, J, I, e, flipN) => {
    const sj = cS[j] ? (j === J ? 0 : 1) : 0, si = cU[i] ? (i === I ? 0 : 1) : 0, k = j + ',' + i + ',' + sj + ',' + si + ',' + e + (flipN ? 'f' : '');
    let v = b.map.get(k); if (v !== undefined) return v;
    const n = nrm(j, i, J, I), p = G[j][i]; v = b.P.length / 3; b.map.set(k, v);
    b.P.push(p[0] - n[0] * e / 1000, p[1] - n[1] * e / 1000, p[2] - n[2] * e / 1000); b.N.push(flipN ? -n[0] : n[0], flipN ? -n[1] : n[1], flipN ? -n[2] : n[2]);
    return v;
  };
  const steps = [];
  for (let J = 0; J < nj - 1; J++) for (let I = 0; I < ni - 1; I++) {
    const m = cell[J][I]; if (!m) continue;
    const b = buf(m.name), q = [[J, I], [J, I + 1], [J + 1, I], [J + 1, I + 1]].map(([j, i]) => vert(b, j, i, J, I, m.e));
    b.I.push(q[0], q[2], q[1], q[2], q[3], q[1]);
    if (lin && m.name !== 'glass' && cols[J].s >= lin.s0 && cols[J + 1].s <= lin.s1 && us[I] >= lin.u0) {   // the cabin's inside: a copy facing in
      const bl = buf(lin.mat || 'interior'), e = (lin.off ?? 30) + m.e, r = [[J, I], [J, I + 1], [J + 1, I], [J + 1, I + 1]].map(([j, i]) => vert(bl, j, i, J, I, e, true));
      bl.I.push(r[0], r[1], r[2], r[2], r[1], r[3]);
    }
    if (m.e > 0) for (const [dj, di, e0, e1] of [[0, -1, [J, I], [J + 1, I]], [0, 1, [J, I + 1], [J + 1, I + 1]], [-1, 0, [J, I], [J, I + 1]], [1, 0, [J + 1, I], [J + 1, I + 1]]]) {
      const nb = cell[J + dj]?.[I + di]; if (nb === undefined || nb === null || nb.e >= m.e) continue;   // a step down to the neighbour: the window reveal
      steps.push([e0, e1, nb.e, m.e, J, I]);
    }
  }
  // the reveals round inset cells (flat, facing into the recess)
  const sb = buf(o.stepMat || 'trim');
  for (const [e0, e1, ea, eb, J, I] of steps) {
    const pt = ([j, i], e) => { const n = nrm(j, i, J, I), p = G[j][i]; return [p[0] - n[0] * e / 1000, p[1] - n[1] * e / 1000, p[2] - n[2] * e / 1000]; };
    const a = pt(e0, ea), b2 = pt(e1, ea), c = pt(e0, eb), d = pt(e1, eb);
    const ctr = [0, 1, 2].map(k => (G[J][I][k] + G[J + 1][I + 1][k]) / 2), mid = [0, 1, 2].map(k => (a[k] + b2[k]) / 2);
    let n = (() => { const u = sub(b2, a), v = sub(c, a); return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; })();
    const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
    const into = sub(ctr, mid), flip = n[0] * into[0] + n[1] * into[1] + n[2] * into[2] < 0;
    const o0 = sb.P.length / 3; sb.P.push(...a, ...b2, ...c, ...d); for (let k = 0; k < 4; k++) sb.N.push(...(flip ? n.map(x => -x) : n));
    if (flip) sb.I.push(o0, o0 + 2, o0 + 1, o0 + 1, o0 + 2, o0 + 3); else sb.I.push(o0, o0 + 1, o0 + 2, o0 + 1, o0 + 3, o0 + 2);
  }
  // the end caps: a fan from the middle of the end section
  for (const [j, mat, front] of [[0, o.capMat?.[0] ?? 'paint', true], [nj - 1, o.capMat?.[1] ?? 'paint', false]]) {
    if (!mat) continue;
    const b = buf(mat), C = cols[j].C, cy = (C[0][1] + C[K - 1][1]) / 2, c0 = toM(0, cy, cols[j].s), o0 = b.P.length / 3, nz = front ? 1 : -1;
    b.P.push(...c0); b.N.push(0, 0, nz);
    for (let i = 0; i < ni; i++) { b.P.push(...G[j][i]); b.N.push(0, 0, nz); }
    for (let i = 0; i < ni - 1; i++) if (front) b.I.push(o0, o0 + 1 + i, o0 + 2 + i); else b.I.push(o0, o0 + 2 + i, o0 + 1 + i);
  }
  for (const [n, b] of bufs) half.add(n, b.P, b.N, null, b.I);
  const md = half.mirrorX();
  // the surface for placing parts: point and normal at (s, u) in metres
  const secAt = s => sec(s);
  const P = (s, u) => { const p = P2(secAt(s), u, s); return toM(p[0], p[1], s); };
  const N = (s, u) => {
    const a = P(s + 2, u), b = P(s - 2, u), c = P(s, u + 0.01), d = P(s, u - 0.01), x = sub(a, b), y = sub(c, d);
    const n = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]], l = Math.hypot(...n) || 1; return n.map(v => v / l);
  };
  const uAt = (s, y) => uAtC(secAt(s), (y + cgH) * 1000);           // u on the flank at height y (metres, car frame)
  const xAt = (s, y) => P(s, uAt(s, y))[0];
  const zOf = s => zNose - s / 1000, sOf = z => (zNose - z) * 1000;
  return { md, P, N, uAt, xAt, zOf, sOf, sec, toM, cols, tris: md.tris };
}

// wheel wells: the liner round the arch opening (from the floor up, over the wheel and down again) and the inner wall.
// xin: the inner wall's half width (m). Both sides.
export function wells(md, B, arches, xin, mat = 'trim') {
  for (const A of arches) {
    const Rz = A.Rz ?? A.R, s0 = A.s - Rz, s1 = A.s + Rz, path = [];
    const yb = s => (B.sec(s)[0][1] + 8);
    for (let k = 0; k <= 4; k++) path.push([s0, yb(s0) + (A.yc - yb(s0)) * k / 4]);
    for (let k = 1; k < 40; k++) { const s = s0 + (s1 - s0) * k / 40; path.push([s, archTop(A, s)]); }
    for (let k = 0; k <= 4; k++) path.push([s1, A.yc + (yb(s1) - A.yc) * k / 4]);
    for (const q of path) q[1] = Math.max(q[1], yb(q[0]));                     // an arch centred below the body's bottom edge
    const G = path.map(([s, y]) => { const ym = B.toM(0, y, s)[1]; return [[B.xAt(s, ym) - 0.004, ym, B.zOf(s)], [xin, ym, B.zOf(s)]]; });
    for (const sx of [1, -1]) {
      const P = [], N = [], I = [];
      for (let j = 0; j < G.length; j++) for (const p of G[j]) { P.push(p[0] * sx, p[1], p[2]); N.push(0, 0, 0); }
      for (let j = 0; j < G.length - 1; j++) { const a = j * 2, b = a + 1, c = a + 2, d = a + 3; I.push(a, b, c, b, d, c, a, c, b, b, c, d); }
      // flat-ish normals: towards the wheel centre
      const zc = B.zOf(A.s), yc = B.toM(0, A.yc, 0)[1];
      for (let v = 0; v < P.length / 3; v++) { const dy = yc - P[v * 3 + 1], dz = zc - P[v * 3 + 2], l = Math.hypot(dy, dz) || 1; N[v * 3 + 1] = dy / l; N[v * 3 + 2] = dz / l; }
      md.add(mat, P, N, null, I);
      // the inner wall: the opening's outline at x = ±xin, facing out to the wheel
      const pts = path.map(([s, y]) => [B.zOf(s), B.toM(0, y, s)[1]]);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx, 0, 0)).setPosition(sx * xin, 0, 0);
      add(md, mat, new THREE.ShapeGeometry(shape(pts.reverse()), 2), m, 10);
    }
  }
  return md;
}
