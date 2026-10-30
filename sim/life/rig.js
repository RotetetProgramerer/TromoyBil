// The animals' bodies, built from code at their real size: ellipsoids, tapered tubes and thin plates merged into one geometry per
// species (and a coarser one for far away). Every vertex knows which part it belongs to and the joints it turns about, so the vertex
// shader in vis.js walks, grazes, swishes and flaps them without bones (see the part numbers below).
//   build(sp, lod) → {geo, meta}   meta: {graze (head angle that puts the mouth on the ground), drop (how far the body sinks when
//                                   it lies down), cy (height of the body's middle), defs (shader defines), patS (pattern scale)}
// Facing +z, standing on y = 0, its left side towards +x. Parts (aRig.x): 0 body, 1–4 legs (left front, right front, left hind,
// right hind; aRig.y 0 upper, 1 lower), 5 head and neck (aRig.y 1: the jaw), 6 tail (aRig.y: how far along), 7–8 wings (left,
// right; aRig.y 1: the outer half), 10 a body that winds like a snake (aRig.w: how much). aRig.z: 1 only on males, 2 only on females.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const lin = h => { const c = new THREE.Color(h); return [c.r * 0.8, c.g * 0.8, c.b * 0.8]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const PART = { BODY: 0, LF: 1, RF: 2, LH: 3, RH: 4, HEAD: 5, TAIL: 6, WL: 7, WR: 8, SPINE: 10 };
const P = PART;

// ------------------------------------------------------------------ the builder
class Geo {
  constructor(lod) { this.lod = lod; this.P = []; this.N = []; this.C = []; this.R = []; this.A = []; this.B = []; this.F = []; this.I = []; this.n = 0; }
  push(g, o) {
    const p = g.attributes.position, nn = g.attributes.normal, base = this.n, a = o.a || [0, 0, 0], b = o.b || a, fl = [o.tint ? 1 : 0, o.pat ? 1 : 0, o.eye ? 1 : 0];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.P.push(x, y, z); this.N.push(nn.getX(i), nn.getY(i), nn.getZ(i));
      const c = o.cf ? o.cf(x, y, z) : o.col; this.C.push(c[0], c[1], c[2]);
      this.R.push(o.part || 0, typeof o.seg === 'function' ? o.seg(x, y, z) : o.seg || 0, o.sex || 0, typeof o.w === 'function' ? o.w(x, y, z) : o.w || 0);
      this.A.push(a[0], a[1], a[2]); this.B.push(b[0], b[1], b[2]); this.F.push(fl[0], fl[1], fl[2]);
    }
    const idx = g.index; if (idx) for (let i = 0; i < idx.count; i++) this.I.push(base + idx.getX(i)); else for (let i = 0; i < p.count; i++) this.I.push(base + i);
    this.n += p.count; g.dispose();
  }
  // an ellipsoid at c with radii r (rotated by the Euler angles rot); o.bump roughens it (fleece)
  ell(c, r, o, rot) {
    if (this.lod && o.fine) return;
    const d = this.lod ? (o.big ? [8, 5] : [6, 4]) : (o.big ? [16, 11] : [11, 8]), g = new THREE.SphereGeometry(1, d[0], d[1]);
    _e.set(...(rot || [0, 0, 0])); _q.setFromEuler(_e); _m.compose(_v.set(...c), _q, _s.set(...r)); g.applyMatrix4(_m);
    if (o.bump) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + o.bump * (Math.sin(x * 37 + z * 11) * Math.sin(y * 41 + x * 7) * Math.sin(z * 29 + y * 5)); p.setXYZ(i, c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k, c[2] + (z - c[2]) * k); } g.computeVertexNormals(); }
    this.push(g, o);
  }
  // a tapered tube from a (radius r0) to b (r1)
  tube(a, b, r0, r1, o) {
    if (this.lod && o.fine) return;
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); if (L < 1e-5) return;
    const g = new THREE.CylinderGeometry(r1, r0, L, this.lod ? 5 : o.sides || 8, 1, false);
    _q.setFromUnitVectors(_up, _d.normalize()); _m.compose(_v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m);
    this.push(g, o);
  }
  // a smooth limb through several points (joints rounded off with small balls)
  chain(pts, rs, o) { for (let i = 0; i + 1 < pts.length; i++) { this.tube(pts[i], pts[i + 1], rs[i], rs[i + 1], o); if (i && !this.lod) this.ell(pts[i], [rs[i], rs[i], rs[i]], o); } }
  // a smooth body through rings: st = [[z, y, half width, up, down], …] from the back to the front, closed at both ends
  loft(st, o) {
    const n = this.lod ? 8 : 16, P = [], I = [], m = st.length;
    for (const s of st) for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, c = Math.cos(a), si = Math.sin(a); P.push(s[2] * c, s[1] + si * (si > 0 ? s[3] : s[4]), s[0]); }
    const b0 = m * n, b1 = b0 + 1; P.push(0, st[0][1], st[0][0] - 0.001, 0, st[m - 1][1], st[m - 1][0] + 0.001);
    for (let i = 0; i + 1 < m; i++) for (let k = 0; k < n; k++) { const a = i * n + k, b = i * n + (k + 1) % n, c = a + n, d = b + n; I.push(a, b, c, b, d, c); }
    for (let k = 0; k < n; k++) I.push(b0, (k + 1) % n, k, b1, (m - 1) * n + k, (m - 1) * n + (k + 1) % n);
    if (o.bump) for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2], k = o.bump * Math.sin(x * 37 + z * 11) * Math.sin(y * 41 + x * 7) * Math.sin(z * 29 + y * 5); P[i] += x * k * 2; P[i + 1] += k * 0.08; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    this.push(g, o);
  }
  // a thin plate through four corners (a wing, an ear, a fin), th thick
  slab(q, th, o) {
    if (this.lod && o.fine) return;
    const [a, b, c, d] = q, n = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...b))).normalize().multiplyScalar(th / 2);
    const v = [a, b, c, d].flatMap(p => [[p[0] + n.x, p[1] + n.y, p[2] + n.z], [p[0] - n.x, p[1] - n.y, p[2] - n.z]]);
    const F = [[0, 2, 4], [0, 4, 6], [1, 5, 3], [1, 7, 5], [0, 1, 3], [0, 3, 2], [2, 3, 5], [2, 5, 4], [4, 5, 7], [4, 7, 6], [6, 7, 1], [6, 1, 0]], pos = [];
    for (const f of F) for (const k of f) pos.push(...v[k]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    this.push(g, o);
  }
  done() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('aRig', new THREE.Float32BufferAttribute(this.R, 4));
    g.setAttribute('aPivA', new THREE.Float32BufferAttribute(this.A, 3)); g.setAttribute('aPivB', new THREE.Float32BufferAttribute(this.B, 3)); g.setAttribute('aFlag', new THREE.Float32BufferAttribute(this.F, 3));
    g.setIndex(this.I); g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ four legs
// Q: sh shoulder (withers) height, hh hip height, bl body length, bd depth, bw width; legs [front upper r, lower r, hind upper, lower];
// knee: height of the knee (× sh); hock: how far back the hock sits (× hh); neck {len, ang (up from level), r0, r1}; head {len, h, w,
// ang (down from level), mz (muzzle size), snout (pointed)}; ear {len, w, ang (out), droop}; tail {len, r, ang (down from level),
// tuft, bush, curl}; c: colours; and the extras (antlers, horns, mane, trunk …)
function quad(G, Q) {
  const c = {}; for (const k in Q.c) c[k] = lin(Q.c[k]);
  const { sh, hh = sh, bl, bd, bw } = Q, L = Q.legs, fz = bl * 0.3, hz = -bl * 0.32;
  const yc = (sh + hh) / 2 - bd * 0.5, bellyY = yc - bd * 0.2;
  const body = (x, y, z) => { let k = c.body; if (c.belly) k = mix(k, c.belly, sm(bellyY + bd * 0.12, bellyY - bd * 0.12, y)); if (c.rump && z < -bl * 0.42 && y > yc - bd * 0.25) k = mix(k, c.rump, sm(-bl * 0.42, -bl * 0.5, z)); if (Q.stripe && Math.abs(y - (bellyY + bd * 0.05)) < bd * 0.07) k = lin(Q.stripe); return k; };
  const pat = !!Q.pat, tint = !!Q.tint;
  // the trunk of the body: one smooth shape from the rump to the breast (top line, belly line and width along it)
  const B = { col: c.body, cf: body, pat, tint, bump: Q.fleece }, hu = (Q.hump ? 0.12 : 0) * bd, sag = Q.sag ?? 0;
  const PR = [[0, -0.5, hh - bd * 0.32, hh - bd * 0.62, 0.3], [0.05, -0.475, hh - bd * 0.08, hh - bd * 0.82, 0.72], [0.17, -0.4, hh - 0.01 * sh, hh - bd * 0.93, 0.93], [0.35, -0.2, null, null, 0.99],
    [0.55, 0.03, null, null, 1], [0.74, 0.24, sh - 0.005 * sh + hu, sh - bd * 1.0, 0.94], [0.87, 0.36, sh - bd * 0.1 + hu * 0.6, sh - bd * 0.97, 0.8], [0.96, 0.45, sh - bd * 0.3, sh - bd * 0.8, 0.55], [1, 0.5, sh - bd * 0.48, sh - bd * 0.62, 0.2]];
  G.loft(PR.map(([t, z, top, bot, w]) => { if (top == null) { const u = (t - 0.17) / 0.57; top = hh + (sh - hh) * u - bd * 0.06; bot = top - bd * (1.02 + sag) + (t > 0.5 ? 0 : 0.02 * bd); } const y = (top + bot) / 2; return [z * bl, y, w * bw * 0.5, top - y, y - bot]; }), B);
  if (Q.udder) G.ell([0, bellyY - bd * 0.35, -bl * 0.22], [bw * 0.18, bd * 0.13, bl * 0.1], { col: lin(Q.udder) });
  // legs: upper (shoulder or thigh to the knee or hock), lower (to the hoof); the hind leg zigzags at the hock
  const legCol = (y) => c.sock ? mix(c.leg || c.body, c.sock, sm(sh * (Q.sockY || 0.45) + 0.05, sh * (Q.sockY || 0.45) - 0.05, y)) : c.leg || c.body;
  for (const [part, x, front] of [[P.LF, 1, true], [P.RF, -1, true], [P.LH, 1, false], [P.RH, -1, false]]) {
    const z0 = front ? fz : hz, top = front ? sh - bd * 0.55 : hh - bd * 0.45, X = x * bw * (front ? 0.27 : 0.26), ru = front ? L[0] : L[2], rl = front ? L[1] : L[3];
    const kneeY = front ? sh * (Q.knee || 0.3) : hh * (Q.hockY || 0.33), kz = front ? z0 + 0.01 * sh : z0 - hh * (Q.hock ?? 0.1), foot = [X, 0.03 * sh, front ? z0 + 0.02 * sh : z0 + hh * 0.02];
    const A = [X, top, z0], K = [X, kneeY, kz], o = { part, a: A, b: K, cf: (x, y) => legCol(y), pat, tint: tint && !c.sock };
    G.ell([X, top - (front ? 0 : bd * 0.08), z0 + (front ? 0.02 : -0.02) * bl], [Math.min(ru * 1.9, bw * 0.2), bd * (front ? 0.3 : 0.36), Math.min(bl * (front ? 0.11 : 0.15), ru * 3)], Object.assign({}, o, { seg: 0, cf: body }));   // shoulder or ham
    G.tube(A, K, ru, rl * 1.15, Object.assign({}, o, { seg: 0 }));
    G.ell(K, [Math.min(rl * 1.2, rl + 0.012), Math.min(rl * 1.3, rl + 0.02), Math.min(rl * 1.2, rl + 0.012)], Object.assign({}, o, { seg: 1 }));
    G.tube(K, foot, rl * 1.1, rl * 0.9, Object.assign({}, o, { seg: 1 }));
    G.tube([foot[0], foot[1] + 0.03 * sh, foot[2]], [foot[0], 0, foot[2] + rl * 0.3], rl * (Q.paw ? 1.3 : 1.05), rl * (Q.paw ? 1.4 : 1.2), { part, seg: 1, a: A, b: K, col: c.hoof || legCol(0) });
  }
  // neck and head (one part: it turns about the base of the neck)
  const N = Q.neck, H = Q.head, nb = [0, sh - bd * (Q.neckY ?? 0.38), bl * 0.4], na = N.ang, nt = [0, nb[1] + Math.sin(na) * N.len, nb[2] + Math.cos(na) * N.len];
  const hd = [0, -Math.sin(H.ang), Math.cos(H.ang)], hc = add(nt, hd, H.len * 0.3), mz = add(nt, hd, H.len * 0.72), tip = add(nt, hd, H.len * 0.98);
  const ho = { part: P.HEAD, a: nb, b: add(nt, hd, H.len * 0.35), pat, tint, seg: 2 }, hn = Object.assign({}, ho, { seg: 0 });
  const neckCol = c.neck || c.body;
  G.tube(nb, nt, N.r0, N.r1, Object.assign({ col: neckCol, cf: c.throat ? (x, y, z) => mix(neckCol, c.throat, sm(0.3, 0.9, -(y - (nb[1] + nt[1]) / 2) / N.r0 + 0.5)) : null }, hn));
  G.ell(nb, [N.r0 * 1.05, N.r0 * 1.1, N.r0 * 1.2], Object.assign({ col: neckCol, cf: body }, hn));
  G.ell(nt, [N.r1 * 1.1, N.r1 * 1.15, N.r1 * 1.1], Object.assign({ col: c.head || neckCol }, ho));
  G.ell(hc, [H.w * 0.5, H.h * 0.5, H.len * 0.36], Object.assign({ col: c.head || c.body, big: true }, ho), [H.ang, 0, 0]);
  G.ell(mz, [H.w * 0.5 * (H.mz || 0.75), H.h * 0.5 * (H.mz || 0.75) * (H.flat || 1), H.len * 0.3], Object.assign({ col: c.muzzle || c.head || c.body }, ho), [H.ang, 0, 0]);
  G.ell(add(tip, [0, H.h * 0.08, 0]), [H.w * 0.18 * (H.mz || 0.75) * 1.4, H.h * 0.12, H.len * 0.06], Object.assign({}, ho, { col: c.nose || [0.02, 0.02, 0.02], fine: true, pat: false, tint: false }), [H.ang, 0, 0]);
  if (Q.jaw) G.ell(add(mz, [0, -H.h * 0.28, -H.len * 0.05]), [H.w * 0.38, H.h * 0.2, H.len * 0.34], Object.assign({}, ho, { col: c.jaw || c.muzzle || c.head, seg: 1, b: add(hc, [0, -H.h * 0.2, 0]) }), [H.ang, 0, 0]);
  for (const sx of [1, -1]) {
    const eye = add(add(nt, hd, H.len * (Q.eyeAt || 0.32)), [sx * H.w * 0.42, H.h * (Q.eyeUp || 0.22), 0]);
    G.ell(eye, [H.h * 0.075, H.h * 0.075, H.h * 0.075], Object.assign({}, ho, { col: [0.01, 0.01, 0.01], eye: true, fine: true, pat: false, tint: false }));
    if (Q.ear) { const E = Q.ear, eb = add(add(nt, hd, H.len * 0.08), [sx * H.w * 0.32, H.h * 0.38, 0]), et = add(eb, [sx * Math.sin(E.ang) * E.len, Math.cos(E.ang) * E.len * (1 - (E.droop || 0)) - (E.droop || 0) * E.len, -E.len * 0.2]);
      G.ell(add(eb, [(et[0] - eb[0]) / 2, (et[1] - eb[1]) / 2, (et[2] - eb[2]) / 2]), [E.w * 0.5, E.len * 0.5, E.w * 0.22], Object.assign({}, ho, { col: c.ear || c.head || c.body, pat: false }), [0, 0, -sx * E.ang + (E.droop ? sx * 2 : 0)]);
      if (c.earTip) G.ell(add(et, [0, -E.len * 0.08, 0]), [E.w * 0.32, E.len * 0.14, E.w * 0.18], Object.assign({}, ho, { col: c.earTip, fine: true, pat: false }), [0, 0, -sx * E.ang]); }
  }
  // the tail
  if (Q.tail) {
    const T = Q.tail, tb = [0, hh - bd * 0.15, -bl * 0.52], dir = [0, -Math.sin(T.ang), -Math.cos(T.ang)], n = T.curl ? 4 : 2, to = { part: P.TAIL, a: tb, col: c.tail || c.body, pat: pat && !T.plain, tint };
    let p0 = tb;
    for (let i = 0; i < n; i++) {
      const u = (i + 1) / n, ang = T.ang - (T.curl || 0) * u, d = [0, -Math.sin(ang), -Math.cos(ang)], p1 = add(p0, d, T.len / n), r0 = T.r * (T.bush ? 0.6 + Math.sin(Math.PI * (i / n)) : 1 - i / n * 0.5), r1 = T.r * (T.bush ? 0.6 + Math.sin(Math.PI * u) : 1 - u * 0.5);
      G.tube(p0, p1, r0, r1, Object.assign({}, to, { seg: u }));
      if (T.bush) G.ell(add(p0, [(p1[0] - p0[0]) / 2, (p1[1] - p0[1]) / 2, (p1[2] - p0[2]) / 2]), [T.r * T.bush, T.r * T.bush, T.len / n * 0.6], Object.assign({}, to, { seg: u, col: c.tail || c.body }), [Math.PI / 2 - ang, 0, 0]);
      p0 = p1;
    }
    if (T.tuft) G.ell(add(p0, dir, -T.len * 0.03), [T.r * T.tuft, T.r * T.tuft * 2.2, T.r * T.tuft], Object.assign({}, to, { seg: 1, col: c.tuft || c.tail || c.body, pat: false }), [Math.PI / 2 - T.ang, 0, 0]);
    if (c.tailTip && T.bush) G.ell(p0, [T.r * 1.1, T.r * 1.1, T.r * 1.4], Object.assign({}, to, { seg: 1, col: c.tailTip }), [Math.PI / 2 - T.ang, 0, 0]);
  }
  for (const x of Q.extra || []) x(G, { nb, nt, hd, hc, mz, tip, ho, c, Q, yc, fz, hz, bellyY });
  return { graze: grazeAngle(nb, tip, nt, 0.3), drop: Math.max(0, bellyY - bd * 0.35 - 0.02 * sh), cy: yc, nod: [...nt, 0.3] };
}
// the head angle that brings the mouth down to the grass
// (the neck turns about its base A by a, the head about the top of the neck N by a·k)
function grazeAngle(A, T, N, k) {
  const rx = (p, o, a) => { const y = p[1] - o[1], z = p[2] - o[2], c = Math.cos(a), s = Math.sin(a); return [p[0], o[1] + c * y - s * z, o[2] + s * y + c * z]; };
  let best = 0, lo = 1e9; for (let a = 0; a < 2.6; a += 0.01) { const t = rx(rx(T, N, a * k), A, a); if (t[1] < lo) { lo = t[1]; best = a; } if (t[1] < 0.03 * A[1] + 0.03) break; }
  return best;       // as low as it reaches (a moose has to spread its legs to graze; it browses)
}

// ------------------------------------------------------------------ extras: antlers, horns, manes, trunks
const ho2 = (k, o) => Object.assign({}, k.ho, o, { pat: false, tint: false });
const ANTLER = {
  // moose: a broad palm on each side with a row of tines along its edge
  palm: (G, k) => { const col = lin('#cdb894'), top = add(k.nt, k.hd, k.Q.head.len * 0.12), H = k.Q.head; for (const s of [1, -1]) {
    const b = add(top, [s * H.w * 0.35, H.h * 0.42, 0]), p = add(b, [s * 0.42, 0.18, -0.06]);
    G.tube(b, add(b, [s * 0.14, 0.06, 0]), 0.045, 0.04, ho2(k, { col, sex: 1 }));
    G.ell(p, [0.36, 0.06, 0.24], ho2(k, { col, sex: 1 }), [0.2, s * 0.25, s * 0.42]);
    for (let i = 0; i < 6; i++) { const u = i / 5 - 0.5, q = add(p, [s * 0.32 * Math.cos(u * 1.4), 0.12 + 0.18 * Math.cos(u * 1.4), 0.22 * u * 1.6]); G.tube(q, add(q, [s * 0.1, 0.12, 0.02]), 0.03, 0.006, ho2(k, { col, sex: 1, fine: true })); } } },
  // roe deer buck: short, three tines
  roe: (G, k) => { const col = lin('#6a5440'), top = add(k.nt, k.hd, k.Q.head.len * 0.1); for (const s of [1, -1]) { const b = add(top, [s * 0.03, 0.05, 0]), t = add(b, [s * 0.03, 0.2, 0.02]); G.tube(b, t, 0.012, 0.005, ho2(k, { col, sex: 1 })); G.tube(add(b, [0, 0.11, 0]), add(b, [s * 0.01, 0.15, 0.06]), 0.008, 0.003, ho2(k, { col, sex: 1, fine: true })); G.tube(add(b, [0, 0.14, 0]), add(b, [s * 0.02, 0.17, -0.06]), 0.008, 0.003, ho2(k, { col, sex: 1, fine: true })); } },
  // reindeer: long beams sweeping back and up, a few tines, a shovel over the face; both sexes (the bulls' bigger)
  rein: (G, k) => { const col = lin('#b8a684'), top = add(k.nt, k.hd, k.Q.head.len * 0.1); for (const sex of [1, 2]) { const S = sex === 1 ? 1 : 0.6; for (const s of [1, -1]) {
    const b = add(top, [s * 0.05, 0.06, 0]), m1 = add(b, [s * 0.18 * S, 0.35 * S, -0.22 * S]), m2 = add(m1, [s * 0.08 * S, 0.35 * S, 0.12 * S]), t = add(m2, [-s * 0.05 * S, 0.18 * S, 0.18 * S]);
    G.chain([b, m1, m2, t], [0.025 * S, 0.02 * S, 0.016 * S, 0.006], ho2(k, { col, sex }));
    G.tube(add(m1, [0, 0.05, 0]), add(m1, [s * 0.05, 0.2 * S, 0.14 * S]), 0.012, 0.004, ho2(k, { col, sex, fine: true }));
    G.tube(add(m2, [0, 0.1, 0]), add(m2, [s * 0.12 * S, 0.16 * S, -0.04]), 0.01, 0.003, ho2(k, { col, sex, fine: true }));
    if (s > 0) G.ell(add(b, [0, 0.14 * S, 0.14 * S]), [0.025, 0.08 * S, 0.07 * S], ho2(k, { col, sex, fine: true })); } } },
};
const HORN = {
  gnu: (G, k) => { const col = lin('#2e2a24'), top = add(k.nt, k.hd, k.Q.head.len * 0.1); for (const s of [1, -1]) { const b = add(top, [s * 0.07, 0.1, 0]); G.chain([b, add(b, [s * 0.16, -0.02, 0]), add(b, [s * 0.24, 0.1, -0.02]), add(b, [s * 0.2, 0.2, -0.04])], [0.04, 0.03, 0.02, 0.005], ho2(k, { col })); } },
  lyre: (G, k) => { const col = lin('#1e1a16'), top = add(k.nt, k.hd, k.Q.head.len * 0.12); for (const [sex, S] of [[1, 1], [2, 0.55]]) for (const s of [1, -1]) { const b = add(top, [s * 0.025, 0.04, 0]); G.chain([b, add(b, [s * 0.04 * S, 0.12 * S, -0.06 * S]), add(b, [s * 0.05 * S, 0.24 * S, -0.06 * S]), add(b, [s * 0.04 * S, 0.3 * S, 0.0])], [0.014, 0.011, 0.008, 0.002], ho2(k, { col, sex })); } },
  ossicone: (G, k) => { const col = lin('#3a2a1a'), top = add(k.nt, k.hd, k.Q.head.len * 0.05); for (const s of [1, -1]) { const b = add(top, [s * 0.05, 0.1, 0]); G.tube(b, add(b, [s * 0.02, 0.15, -0.03]), 0.03, 0.028, ho2(k, { col: lin('#c49860') })); G.ell(add(b, [s * 0.02, 0.16, -0.03]), [0.035, 0.03, 0.035], ho2(k, { col })); } },
  cow: (G, k) => { const col = lin('#d8ccb0'), top = add(k.nt, k.hd, k.Q.head.len * 0.08); for (const s of [1, -1]) { const b = add(top, [s * 0.1, 0.1, 0]); G.chain([b, add(b, [s * 0.12, 0.03, 0.02]), add(b, [s * 0.16, 0.12, 0.05])], [0.03, 0.02, 0.006], ho2(k, { col, fine: true, sex: 1 })); } },
};
const MANE = {
  // a short upright mane along the top of the neck (zebra, gnu, giraffe)
  ridge: (col, h, wid) => (G, k) => { const a = add(k.nb, [0, k.Q.neck.r0 * 0.85, -k.Q.neck.r0 * 0.3]), b = add(k.nt, [0, k.Q.neck.r1 * 0.85, 0]); G.slab([add(a, [0, 0, 0]), add(a, [0, h, 0.03]), add(b, [0, h * 0.8, 0.03]), add(b, [0, 0, 0])], wid, ho2(k, { col: lin(col), seg: 0 })); },
  // the lion's: a big shaggy ruff round the head and down the chest (males only)
  lion: (G, k) => { const col = lin('#6a3c1c'), col2 = lin('#8a5426'), H = k.Q.head;
    G.ell(add(k.nt, k.hd, -H.len * 0.12), [H.w * 0.92, H.h * 1.1, H.len * 0.38], ho2(k, { col, sex: 1, bump: 0.1, big: true }));
    G.ell(add(k.nb, [0, 0.05, 0.05]), [k.Q.neck.r0 * 1.5, k.Q.neck.r0 * 1.5, k.Q.neck.len * 0.8], ho2(k, { col: col2, sex: 1, bump: 0.08, seg: 0 }));
    G.ell(add(k.nb, [0, -0.22, 0.1]), [0.16, 0.22, 0.14], ho2(k, { col: col2, sex: 1, bump: 0.1, seg: 0 })); },
  beard: (col, len) => (G, k) => G.ell(add(k.mz, [0, -k.Q.head.h * 0.45 - len * 0.4, -0.05]), [0.04, len * 0.5, 0.08], ho2(k, { col: lin(col) })),
  bell: (G, k) => G.ell(add(k.nt, [0, -0.3, -0.06]), [0.05, 0.2, 0.08], ho2(k, { col: lin('#2a1f17'), seg: 0 })),
  neckRuff: (col) => (G, k) => G.ell(add(k.nb, [0, -k.Q.neck.r0 * 0.6, k.Q.neck.len * 0.35]), [k.Q.neck.r0 * 0.9, k.Q.neck.r0 * 1.2, k.Q.neck.len * 0.5], ho2(k, { col: lin(col), bump: 0.12, seg: 0 }), [0.6, 0, 0]),
};
// the elephant: trunk, tusks and the big ears
function elephantHead(G, k) {
  const col = lin('#7e766c'), H = k.Q.head, root = add(k.mz, [0, -H.h * 0.05, H.len * 0.05]);
  const drop = root[1] - 0.3, pts = [root, add(root, [0, -drop * 0.3, 0.2]), add(root, [0, -drop * 0.62, 0.24]), add(root, [0, -drop * 0.88, 0.18]), add(root, [0, -drop, 0.3])];
  G.chain(pts, [0.24, 0.17, 0.12, 0.08, 0.07], ho2(k, { col }));
  for (const s of [1, -1]) {
    const tb = add(k.mz, [s * 0.2, -H.h * 0.3, 0]); G.chain([tb, add(tb, [s * 0.06, -0.45, 0.3]), add(tb, [s * 0.04, -0.55, 0.75])], [0.08, 0.06, 0.012], ho2(k, { col: lin('#efe6d0') }));
    const eb = add(k.hc, [s * (H.w * 0.5 + 0.12), H.h * 0.2, -H.len * 0.3]);       // the ears: big flaps standing out from the side of the head
    G.slab([add(eb, [0, 0.5, 0.1]), add(eb, [s * 0.45, 0.65, -0.45]), add(eb, [s * 0.5, -0.7, -0.6]), add(eb, [s * 0.05, -0.6, -0.05])], 0.06, ho2(k, { col: lin('#857c72') }));
  }
}
function hippoHead(G, k) {
  const H = k.Q.head, col = lin('#d8a8a0');
  for (const s of [1, -1]) G.tube(add(k.mz, [s * H.w * 0.3, -H.h * 0.25, H.len * 0.15]), add(k.mz, [s * H.w * 0.28, -H.h * 0.05, H.len * 0.2]), 0.03, 0.008, ho2(k, { col: lin('#f0e8d8'), seg: 1, b: add(k.hc, [0, -H.h * 0.2, 0]) }));
  G.ell(add(k.mz, [0, -H.h * 0.08, 0]), [H.w * 0.42, 0.02, H.len * 0.28], ho2(k, { col, seg: 1, b: add(k.hc, [0, -H.h * 0.2, 0]), fine: true }), [H.ang, 0, 0]);
}

// ------------------------------------------------------------------ the quadrupeds, at their real size
const Q = {
  elg: { sh: 1.9, hh: 1.72, bl: 1.85, bd: 0.92, bw: 0.7, legs: [0.085, 0.05, 0.1, 0.05], knee: 0.33, hock: 0.12, sockY: 0.62, hump: true, chestTilt: 0.12,
    neckY: 0.45, neck: { len: 0.7, ang: 0.3, r0: 0.3, r1: 0.2 }, head: { len: 0.78, h: 0.3, w: 0.26, ang: 0.62, mz: 0.95, flat: 1.15 }, ear: { len: 0.26, w: 0.12, ang: 0.9 }, tail: { len: 0.1, r: 0.04, ang: 1.2 },
    c: { body: '#3b2a1e', belly: '#261c14', leg: '#3b2a1e', sock: '#a8957a', hoof: '#26221e', head: '#47352a', muzzle: '#3a2b20', nose: '#1a1410', neck: '#2f241b' }, extra: [ANTLER.palm, MANE.bell] },
  radyr: { sh: 0.72, hh: 0.76, bl: 0.72, bd: 0.32, bw: 0.24, legs: [0.03, 0.016, 0.04, 0.017], knee: 0.32, hock: 0.12,
    neckY: 0.45, neck: { len: 0.38, ang: 0.95, r0: 0.075, r1: 0.05 }, head: { len: 0.22, h: 0.1, w: 0.095, ang: 0.4, mz: 0.7 }, ear: { len: 0.12, w: 0.065, ang: 0.75 },
    c: { body: '#9a5a32', belly: '#c49a70', rump: '#efe6d8', leg: '#8a5634', hoof: '#26221e', head: '#8a5a3a', muzzle: '#3a3530', nose: '#141210' }, extra: [ANTLER.roe] },
  hare: { sh: 0.3, hh: 0.36, bl: 0.4, bd: 0.2, bw: 0.15, legs: [0.016, 0.01, 0.035, 0.014], knee: 0.3, hockY: 0.25, hock: 0.25, paw: true,
    neck: { len: 0.1, ang: 0.8, r0: 0.06, r1: 0.05 }, head: { len: 0.13, h: 0.085, w: 0.08, ang: 0.25, mz: 0.7 }, ear: { len: 0.13, w: 0.035, ang: 0.25 }, tail: { len: 0.05, r: 0.025, ang: -0.3 },
    c: { body: '#867056', belly: '#d8d0c0', head: '#7a664e', ear: '#7a664e', earTip: '#1a1612', tail: '#f2f0ea', hoof: '#8a7a64' }, defs: { SPHINX: 1 } },
  rev: { sh: 0.38, hh: 0.38, bl: 0.48, bd: 0.19, bw: 0.14, legs: [0.022, 0.013, 0.028, 0.014], knee: 0.3, paw: true, sockY: 0.5,
    neck: { len: 0.17, ang: 0.6, r0: 0.07, r1: 0.055 }, head: { len: 0.19, h: 0.085, w: 0.1, ang: 0.15, mz: 0.5 }, ear: { len: 0.08, w: 0.05, ang: 0.3 }, tail: { len: 0.4, r: 0.04, ang: 0.6, bush: 1.4 },
    c: { body: '#c4602a', belly: '#f0ece4', throat: '#f0ece4', leg: '#c4602a', sock: '#2a2420', head: '#c86a32', muzzle: '#e8e0d4', ear: '#2a2420', tail: '#c4602a', tailTip: '#f4f2ee' }, defs: { SPHINX: 1 } },
  fjellrev: { sh: 0.3, hh: 0.3, bl: 0.4, bd: 0.18, bw: 0.14, legs: [0.02, 0.013, 0.026, 0.013], knee: 0.3, paw: true,
    neck: { len: 0.1, ang: 0.6, r0: 0.07, r1: 0.06 }, head: { len: 0.15, h: 0.08, w: 0.095, ang: 0.15, mz: 0.5 }, ear: { len: 0.045, w: 0.04, ang: 0.4 }, tail: { len: 0.3, r: 0.045, ang: 0.6, bush: 1.5 },
    c: { body: '#f2f0ec', belly: '#f6f4f0', head: '#f2f0ec', nose: '#1a1614' }, defs: { SPHINX: 1 }, fleece: 0.04 },
  ekorn: { sh: 0.1, hh: 0.12, bl: 0.15, bd: 0.075, bw: 0.065, legs: [0.008, 0.005, 0.014, 0.006], knee: 0.3, hockY: 0.25, hock: 0.25, paw: true,
    neck: { len: 0.03, ang: 0.8, r0: 0.03, r1: 0.025 }, head: { len: 0.05, h: 0.04, w: 0.04, ang: 0.1, mz: 0.6 }, ear: { len: 0.025, w: 0.012, ang: 0.15 }, tail: { len: 0.17, r: 0.022, ang: -1.0, bush: 1.6, curl: 1.4 },
    c: { body: '#a2461e', belly: '#f0e8d8', head: '#a2461e', ear: '#8a3a18', tail: '#9a3e1a' }, defs: { SPHINX: 1 } },
  sau: { sh: 0.75, hh: 0.76, bl: 0.92, bd: 0.5, bw: 0.52, legs: [0.03, 0.022, 0.035, 0.022], knee: 0.33, sockY: 0.62, fleece: 0.07, tint: true,
    neck: { len: 0.33, ang: 0.55, r0: 0.17, r1: 0.12 }, head: { len: 0.25, h: 0.13, w: 0.11, ang: 0.6, mz: 0.75 }, ear: { len: 0.1, w: 0.045, ang: 1.3 }, tail: { len: 0.14, r: 0.035, ang: 1.3 },
    c: { body: '#ece6da', leg: '#ece6da', sock: '#3a3430', head: '#e0d8cc', muzzle: '#d0c6b8', nose: '#3a302c', hoof: '#2a2420', neck: '#ece6da' } },
  ku: { sh: 1.4, hh: 1.42, bl: 1.75, bd: 0.76, bw: 0.66, legs: [0.07, 0.045, 0.085, 0.045], knee: 0.32, hock: 0.08, pat: 5, udder: '#d8a8a0',
    neckY: 0.45, neck: { len: 0.65, ang: 0.15, r0: 0.28, r1: 0.21 }, head: { len: 0.55, h: 0.27, w: 0.24, ang: 1.1, mz: 0.85 }, ear: { len: 0.17, w: 0.08, ang: 1.45 }, tail: { len: 0.85, r: 0.025, ang: 1.35, tuft: 2.2, plain: true },
    c: { body: '#f2eee6', head: '#f2eee6', muzzle: '#d4a89c', nose: '#c48a80', hoof: '#2a2420', tuft: '#3a2a20' }, extra: [HORN.cow] },
  katt: { sh: 0.25, hh: 0.26, bl: 0.34, bd: 0.14, bw: 0.11, legs: [0.017, 0.011, 0.022, 0.012], knee: 0.32, paw: true, tint: true,
    neck: { len: 0.06, ang: 0.8, r0: 0.045, r1: 0.04 }, head: { len: 0.085, h: 0.07, w: 0.08, ang: 0.15, mz: 0.6 }, ear: { len: 0.04, w: 0.035, ang: 0.35 }, tail: { len: 0.28, r: 0.014, ang: -0.6, curl: -0.6 },
    c: { body: '#e8e4dc', head: '#e8e4dc', muzzle: '#f0ece8', nose: '#c88080' }, defs: { SIT: 1 } },
  hund: { sh: 0.57, hh: 0.56, bl: 0.68, bd: 0.3, bw: 0.24, legs: [0.035, 0.025, 0.045, 0.025], knee: 0.3, paw: true, tint: true,
    neck: { len: 0.25, ang: 0.75, r0: 0.09, r1: 0.075 }, head: { len: 0.26, h: 0.13, w: 0.13, ang: 0.1, mz: 0.6 }, ear: { len: 0.11, w: 0.07, ang: 0.4, droop: 0.9 }, tail: { len: 0.36, r: 0.025, ang: -0.2 },
    c: { body: '#e8e4dc', head: '#e8e4dc', nose: '#141210' }, defs: { SIT: 1 } },
  rein: { sh: 1.1, hh: 1.06, bl: 1.2, bd: 0.55, bw: 0.42, legs: [0.05, 0.03, 0.06, 0.03], knee: 0.32, hock: 0.1,
    neck: { len: 0.52, ang: 0.5, r0: 0.17, r1: 0.11 }, head: { len: 0.4, h: 0.16, w: 0.15, ang: 0.55, mz: 0.8 }, ear: { len: 0.12, w: 0.055, ang: 1.1 }, tail: { len: 0.13, r: 0.04, ang: 0.9 },
    c: { body: '#6e6050', belly: '#d8d0c2', neck: '#e4ddd0', leg: '#4a3e32', hoof: '#26221e', head: '#5a4c3e', muzzle: '#3a3028', tail: '#f0ece4', rump: '#e4ddd0' }, extra: [ANTLER.rein, MANE.neckRuff('#ece6da')] },
  love: { sh: 1.1, hh: 1.0, bl: 1.45, bd: 0.55, bw: 0.42, legs: [0.075, 0.055, 0.085, 0.05], knee: 0.28, hock: 0.12, paw: true,
    neck: { len: 0.42, ang: 0.35, r0: 0.21, r1: 0.18 }, head: { len: 0.4, h: 0.3, w: 0.3, ang: 0.25, mz: 0.65 }, ear: { len: 0.08, w: 0.08, ang: 0.6 }, tail: { len: 0.85, r: 0.028, ang: 1.15, curl: -0.45, tuft: 2.6 },
    c: { body: '#c8954a', belly: '#e2c48e', head: '#c99a52', muzzle: '#ead2a0', nose: '#3a2414', tuft: '#2a1a10' }, extra: [MANE.lion], defs: { SPHINX: 1 } },
  gepard: { sh: 0.8, hh: 0.78, bl: 0.95, bd: 0.34, bw: 0.24, legs: [0.04, 0.024, 0.05, 0.024], knee: 0.28, hock: 0.12, paw: true, pat: 3, patS: 13,
    neck: { len: 0.22, ang: 0.4, r0: 0.11, r1: 0.09 }, head: { len: 0.19, h: 0.13, w: 0.13, ang: 0.15, mz: 0.6 }, ear: { len: 0.045, w: 0.05, ang: 0.6 }, tail: { len: 0.7, r: 0.028, ang: 1.0, curl: -0.6 },
    c: { body: '#d9a656', belly: '#f2e6cc', head: '#d9a656', muzzle: '#f0e2c8', nose: '#2a1e14' }, defs: { SPHINX: 1 } },
  jaguar: { sh: 0.72, hh: 0.7, bl: 1.15, bd: 0.42, bw: 0.36, legs: [0.06, 0.045, 0.07, 0.045], knee: 0.28, hock: 0.12, paw: true, pat: 4, patS: 10,
    neck: { len: 0.2, ang: 0.3, r0: 0.17, r1: 0.15 }, head: { len: 0.29, h: 0.22, w: 0.24, ang: 0.2, mz: 0.65 }, ear: { len: 0.06, w: 0.065, ang: 0.6 }, tail: { len: 0.65, r: 0.035, ang: 1.0, curl: -0.6 },
    c: { body: '#c4923a', belly: '#e6d4ac', head: '#c4923a', muzzle: '#e6d2aa', nose: '#3a2414' }, defs: { SPHINX: 1 } },
  sebra: { sh: 1.35, hh: 1.35, bl: 1.5, bd: 0.66, bw: 0.5, legs: [0.06, 0.035, 0.075, 0.035], knee: 0.32, hock: 0.1, pat: 1, patS: 1,
    neckY: 0.45, neck: { len: 0.75, ang: 0.8, r0: 0.21, r1: 0.12 }, head: { len: 0.56, h: 0.22, w: 0.2, ang: 1.05, mz: 0.75 }, ear: { len: 0.15, w: 0.07, ang: 0.35 }, tail: { len: 0.5, r: 0.03, ang: 1.3, tuft: 2.4, plain: true },
    c: { body: '#f2efe6', head: '#f2efe6', muzzle: '#1c1a18', nose: '#0c0a08', hoof: '#1c1a18', tuft: '#1c1a18', tail: '#f2efe6' }, extra: [MANE.ridge('#1c1a18', 0.11, 0.03)] },
  gnu: { sh: 1.35, hh: 1.12, bl: 1.45, bd: 0.72, bw: 0.48, legs: [0.05, 0.028, 0.06, 0.028], knee: 0.33, hock: 0.1, chestTilt: 0.15,
    neckY: 0.45, neck: { len: 0.6, ang: 0.45, r0: 0.25, r1: 0.15 }, head: { len: 0.56, h: 0.22, w: 0.2, ang: 1.05, mz: 0.95, flat: 1.1 }, ear: { len: 0.12, w: 0.05, ang: 1.2 }, tail: { len: 0.6, r: 0.03, ang: 1.3, tuft: 2.4 },
    c: { body: '#5c5852', belly: '#4a4642', head: '#2e2a26', muzzle: '#22201c', leg: '#3a3632', hoof: '#1c1a18', tail: '#1c1a18', tuft: '#141210' }, extra: [HORN.gnu, MANE.ridge('#1c1a18', 0.12, 0.04), MANE.beard('#2a2622', 0.22)] },
  gaselle: { sh: 0.65, hh: 0.67, bl: 0.72, bd: 0.3, bw: 0.21, legs: [0.025, 0.013, 0.033, 0.014], knee: 0.3, hock: 0.12, stripe: '#1e1a16',
    neckY: 0.45, neck: { len: 0.37, ang: 0.95, r0: 0.06, r1: 0.04 }, head: { len: 0.2, h: 0.085, w: 0.08, ang: 0.5, mz: 0.7 }, ear: { len: 0.11, w: 0.045, ang: 0.6 }, tail: { len: 0.18, r: 0.015, ang: 1.1 },
    c: { body: '#c48a4a', belly: '#f4ece0', rump: '#f4ece0', head: '#c48a4a', muzzle: '#d8a870', tail: '#1e1a16', hoof: '#1e1a16' }, extra: [HORN.lyre] },
  sjiraff: { sh: 3.25, hh: 2.65, bl: 2.0, bd: 1.0, bw: 0.72, legs: [0.085, 0.05, 0.1, 0.05], knee: 0.3, hock: 0.08, pat: 2, patS: 4.2, chestTilt: 0.3,
    neck: { len: 2.1, ang: 1.0, r0: 0.3, r1: 0.13 }, head: { len: 0.6, h: 0.22, w: 0.2, ang: 0.75, mz: 0.7 }, ear: { len: 0.17, w: 0.06, ang: 1.4 }, tail: { len: 0.95, r: 0.03, ang: 1.35, tuft: 2.6, plain: true },
    c: { body: '#f0dcb0', head: '#e8cc98', muzzle: '#f2e2c4', nose: '#3a2a1a', hoof: '#2a2420', tuft: '#1c1612', tail: '#c49860' }, extra: [HORN.ossicone, MANE.ridge('#8a4a20', 0.07, 0.03)], defs: { PACE: 1 } },
  elefant: { sh: 3.2, hh: 3.0, bl: 3.0, bd: 1.75, bw: 1.55, legs: [0.32, 0.27, 0.34, 0.27], knee: 0.35, hock: 0.02, hockY: 0.35, paw: true,
    neck: { len: 0.35, ang: 0.3, r0: 0.75, r1: 0.7 }, head: { len: 1.0, h: 1.05, w: 0.95, ang: 0.85, mz: 0.6 }, tail: { len: 1.0, r: 0.04, ang: 1.4, tuft: 1.8 },
    c: { body: '#7e766c', head: '#7e766c', muzzle: '#7e766c', hoof: '#5a544c', nose: '#7e766c' }, extra: [elephantHead], fleece: 0.012 },
  flodhest: { sh: 1.45, hh: 1.45, bl: 2.4, bd: 1.15, bw: 1.2, legs: [0.2, 0.17, 0.22, 0.17], knee: 0.25, hock: 0.03, paw: true, jaw: true,
    neck: { len: 0.3, ang: 0.15, r0: 0.5, r1: 0.42 }, head: { len: 0.95, h: 0.5, w: 0.62, ang: 0.02, mz: 1.15, flat: 0.85 }, ear: { len: 0.07, w: 0.05, ang: 0.4 }, eyeAt: 0.2, eyeUp: 0.45, tail: { len: 0.32, r: 0.06, ang: 1.2 },
    c: { body: '#6e625e', belly: '#b08a80', head: '#74665f', muzzle: '#9a7a72', jaw: '#c89a8e', nose: '#3a2a26' }, extra: [hippoHead] },
  kapybara: { sh: 0.52, hh: 0.58, bl: 0.92, bd: 0.42, bw: 0.4, legs: [0.045, 0.035, 0.06, 0.035], knee: 0.3, hockY: 0.2, hock: 0.12, paw: true,
    neck: { len: 0.1, ang: 0.4, r0: 0.17, r1: 0.15 }, head: { len: 0.32, h: 0.2, w: 0.17, ang: 0.3, mz: 0.95, flat: 1.05 }, ear: { len: 0.045, w: 0.045, ang: 0.6 },
    c: { body: '#8a6440', belly: '#a07a52', head: '#7a5636', muzzle: '#5a3e28', nose: '#2a1e14', hoof: '#3a2a1c' }, fleece: 0.03 },
  ape: { sh: 0.3, hh: 0.32, bl: 0.36, bd: 0.19, bw: 0.17, legs: [0.022, 0.017, 0.028, 0.018], knee: 0.42, paw: true,
    neck: { len: 0.05, ang: 0.9, r0: 0.06, r1: 0.055 }, head: { len: 0.12, h: 0.11, w: 0.11, ang: -0.1, mz: 0.6 }, ear: { len: 0.03, w: 0.03, ang: 1.2 }, tail: { len: 0.6, r: 0.014, ang: 0.4, curl: 2.2 },
    c: { body: '#3e3024', belly: '#5a4634', head: '#3e3024', muzzle: '#d8bc98', ear: '#d8bc98', nose: '#2a1e14' }, defs: { SIT: 1 } },
};

// ------------------------------------------------------------------ crocodilians and lizards: low, splayed legs, a long winding tail
const SPRAWL = {
  krokodille: { L: 4.2, body: 1.6, head: 0.68, w: 0.62, h: 0.32, leg: 0.24, c: { body: '#3a4426', belly: '#8a8a60', dark: '#222a14', eye: '#c9b040' } },
  kaiman: { L: 2.3, body: 0.85, head: 0.36, w: 0.34, h: 0.17, leg: 0.13, c: { body: '#3c3f24', belly: '#9a9060', dark: '#262a16', eye: '#d9b23a' } },
  firfisle: { L: 0.25, body: 0.085, head: 0.03, w: 0.035, h: 0.018, leg: 0.022, tint: true, c: { body: '#d8d0c0', belly: '#e8e0c8', dark: '#3a3a2a', eye: '#1a1a12' } },
};
function sprawl(G, S) {
  const c = {}; for (const k in S.c) c[k] = lin(S.c[k]);
  const { L, body: bL, head: hL, w, h } = S, tL = L - bL - hL, y = h * 0.55 + S.leg * 0.4, zb = tL / 2 - L / 2 + bL / 2 + 0.0;     // the body sits between the tail and the head
  const z0 = -L / 2 + tL, zh = z0 + bL;                     // where the tail meets the body, where the head begins
  const col = (x, yy) => mix(c.belly, c.body, sm(y - h * 0.2, y + h * 0.1, yy)), tint = !!S.tint;
  const wv = (x, yy, z) => sm(z0 + bL * 0.4, -L / 2, z) * 1.0 + 0.12;     // how much each point winds: the tail most
  const o = { part: P.SPINE, cf: col, w: wv, tint };
  G.ell([0, y, z0 + bL * 0.5], [w * 0.5, h * 0.5, bL * 0.58], Object.assign({ big: true }, o));
  // the tail: tapering to a point
  const n = 5; for (let i = 0; i < n; i++) { const za = z0 - tL * i / n, zb2 = z0 - tL * (i + 1) / n; G.tube([0, y - h * 0.05 * i / n, za], [0, y - h * 0.1 * (i + 1) / n, zb2], w * 0.38 * (1 - i / n * 0.85), w * 0.38 * (1 - (i + 1) / n * 0.85), Object.assign({}, o, { sides: 6 })); }
  if (!G.lod && S.L > 1) for (let i = 0; i < 14; i++) { const z = zh - bL * 0.1 - i * (bL + tL * 0.6) / 14; for (const s of [1, -1]) G.ell([s * w * 0.14 * Math.max(0.2, 1 - i / 18), y + h * (0.45 - i * 0.015), z], [w * 0.04, h * 0.12, bL * 0.03], Object.assign({}, o, { col: c.dark, cf: null })); }
  // the head: a long flat snout, eyes and nostrils on top, a jaw that opens
  const hp = [0, y + h * 0.05, zh], ho = { part: P.HEAD, a: hp, b: [0, y - h * 0.1, zh + hL * 0.15], tint, seg: 2 };
  G.ell([0, y + h * 0.05, zh + hL * 0.25], [w * 0.38, h * 0.38, hL * 0.32], Object.assign({ cf: col }, ho));
  G.ell([0, y + h * 0.02, zh + hL * 0.65], [w * 0.22, h * 0.2, hL * 0.42], Object.assign({ cf: col }, ho));
  G.ell([0, y - h * 0.18, zh + hL * 0.55], [w * 0.21, h * 0.12, hL * 0.48], Object.assign({ col: c.belly }, ho, { seg: 1 }));
  for (const s of [1, -1]) G.ell([s * w * 0.16, y + h * 0.3, zh + hL * 0.22], [h * 0.12, h * 0.12, h * 0.14], Object.assign({}, ho, { col: c.eye, eye: true, fine: S.L < 1, tint: false }));
  // legs: out to the side, then down
  for (const [part, s, front] of [[P.LF, 1, true], [P.RF, -1, true], [P.LH, 1, false], [P.RH, -1, false]]) {
    const z = front ? zh - bL * 0.15 : z0 + bL * 0.12, A = [s * w * 0.35, y - h * 0.1, z], K = [s * (w * 0.35 + S.leg * 0.7), y - h * 0.15, z + (front ? 0.02 : -0.02) * L], F = [s * (w * 0.35 + S.leg * 0.85), 0.005, z + (front ? 0.05 : -0.03) * L];
    const lo = { part, a: A, b: K, col: c.body, tint };
    G.tube(A, K, S.leg * 0.22, S.leg * 0.17, Object.assign({}, lo, { seg: 0 })); G.tube(K, F, S.leg * 0.16, S.leg * 0.12, Object.assign({}, lo, { seg: 1 }));
    G.ell(F, [S.leg * 0.22, S.leg * 0.05, S.leg * 0.25], Object.assign({}, lo, { seg: 1 }));
  }
  return { graze: 0, drop: 0, cy: y, waveK: 2 * Math.PI / (L * 0.9), nod: [...hp, 0] };
}

// ------------------------------------------------------------------ birds
// B: bl body length, bw width, bh height, legs length; head r, neck {len, ang}; beak {len, r, col, hook}; tail {len, w}; span, chord
const BIRD = {
  make: { bl: 0.36, bw: 0.12, bh: 0.12, legs: 0.11, head: 0.052, neck: { len: 0.04, ang: 0.9 }, beak: { len: 0.055, r: 0.011, col: '#e5b52b' }, tail: { len: 0.14, w: 0.13 }, span: 1.4, chord: 0.2,
    c: { body: '#f4f4f0', back: '#9aa4ac', wing: '#a2acb4', tip: '#1e1e20', head: '#f4f4f0', legs: '#d8a090', tail: '#f4f4f0' } },
  krake: { bl: 0.28, bw: 0.1, bh: 0.1, legs: 0.08, head: 0.044, neck: { len: 0.03, ang: 0.6 }, beak: { len: 0.05, r: 0.012, col: '#141414' }, tail: { len: 0.17, w: 0.08 }, span: 0.95, chord: 0.18,
    c: { body: '#8c8c8a', back: '#8c8c8a', wing: '#1c1c1e', tip: '#141416', head: '#161618', legs: '#1a1a1a', tail: '#161618' } },
  ravn: { bl: 0.36, bw: 0.12, bh: 0.12, legs: 0.09, head: 0.055, neck: { len: 0.04, ang: 0.6 }, beak: { len: 0.075, r: 0.018, col: '#101012' }, tail: { len: 0.24, w: 0.12 }, span: 1.25, chord: 0.25,
    c: { body: '#141418', back: '#141418', wing: '#18181c', tip: '#101014', head: '#141418', legs: '#101012', tail: '#141418' } },
  havorn: { bl: 0.55, bw: 0.22, bh: 0.2, legs: 0.13, head: 0.08, neck: { len: 0.07, ang: 0.5 }, beak: { len: 0.1, r: 0.03, col: '#e8c040', hook: true }, tail: { len: 0.28, w: 0.24 }, span: 2.25, chord: 0.5, tipChord: 0.42, fingers: true,
    c: { body: '#5a4632', back: '#5e4a34', wing: '#4e3c2a', tip: '#2a2018', head: '#d8ccb0', legs: '#e8c040', tail: '#f2f0e8' } },
  gribb: { bl: 0.55, bw: 0.22, bh: 0.2, legs: 0.12, head: 0.055, neck: { len: 0.2, ang: 0.4 }, beak: { len: 0.07, r: 0.02, col: '#3a3430', hook: true }, tail: { len: 0.2, w: 0.22 }, span: 2.2, chord: 0.55, tipChord: 0.45, fingers: true, ruff: '#e8dccc',
    c: { body: '#6a5440', back: '#6a5440', wing: '#5a4634', tip: '#2a2018', head: '#c8a8a0', legs: '#5a5450', tail: '#3a2c20', neck: '#c8a8a0' } },
  and: { bl: 0.42, bw: 0.17, bh: 0.13, legs: 0.05, head: 0.05, neck: { len: 0.08, ang: 1.0 }, beak: { len: 0.055, r: 0.018, col: '#e0b030', flat: true }, tail: { len: 0.08, w: 0.1 }, span: 0.88, chord: 0.17,
    duck: true, tint: true, c: { body: '#b0aca4', back: '#8a8278', wing: '#8a8278', tip: '#5a544c', head: '#1e5a32', head2: '#8a6a4a', neck: '#7a6a58', legs: '#e8862a', tail: '#1a1a1a', breast: '#6a3a22', ring: '#f4f4f0' } },
  due: { bl: 0.24, bw: 0.11, bh: 0.11, legs: 0.05, head: 0.038, neck: { len: 0.04, ang: 0.8 }, beak: { len: 0.02, r: 0.006, col: '#2a2a2a' }, tail: { len: 0.12, w: 0.09 }, span: 0.65, chord: 0.13,
    tint: true, c: { body: '#9a9ea6', back: '#9a9ea6', wing: '#a4a8ae', tip: '#3a3c40', head: '#7e848c', legs: '#c87870', tail: '#5a5e64', neck: '#5e7a6e' } },
  rype: { bl: 0.28, bw: 0.15, bh: 0.15, legs: 0.04, head: 0.045, neck: { len: 0.03, ang: 0.8 }, beak: { len: 0.018, r: 0.008, col: '#1a1a1a' }, tail: { len: 0.1, w: 0.1 }, span: 0.6, chord: 0.14,
    c: { body: '#f4f4f2', back: '#f4f4f2', wing: '#f8f8f6', tip: '#f0f0ee', head: '#f4f4f2', legs: '#f4f4f2', tail: '#1a1a1a', comb: '#d8302a' } },
  pelikan: { bl: 0.7, bw: 0.25, bh: 0.25, legs: 0.15, head: 0.07, neck: { len: 0.35, ang: 1.2 }, beak: { len: 0.4, r: 0.03, col: '#e0a080', pouch: '#e8b040' }, tail: { len: 0.15, w: 0.18 }, span: 2.7, chord: 0.42,
    c: { body: '#f4ece8', back: '#f4ece8', wing: '#f4ece8', tip: '#1a1a1a', head: '#f4ece8', legs: '#e8862a', tail: '#f4ece8', neck: '#f4ece8' } },
  papegoye: { bl: 0.3, bw: 0.12, bh: 0.12, legs: 0.05, head: 0.06, neck: { len: 0.04, ang: 0.8 }, beak: { len: 0.06, r: 0.025, col: '#ece4d4', hook: true }, tail: { len: 0.5, w: 0.07 }, span: 1.0, chord: 0.2,
    c: { body: '#d8302a', back: '#d8302a', wing: '#f2c23a', tip: '#2a5ad0', head: '#d8302a', legs: '#5a5a5a', tail: '#d8302a', face: '#f4f0e6' } },
  tukan: { bl: 0.25, bw: 0.12, bh: 0.12, legs: 0.05, head: 0.056, neck: { len: 0.03, ang: 0.8 }, beak: { len: 0.19, r: 0.035, col: '#f08a1a', tipCol: '#141210' }, tail: { len: 0.18, w: 0.08 }, span: 0.6, chord: 0.15,
    c: { body: '#15130f', back: '#15130f', wing: '#1d1a15', tip: '#141210', head: '#15130f', legs: '#3a5aa0', tail: '#15130f', face: '#f6f0e0' } },
  hegre: { bl: 0.3, bw: 0.1, bh: 0.12, legs: 0.5, head: 0.032, neck: { len: 0.45, ang: 1.1 }, beak: { len: 0.12, r: 0.008, col: '#e5b52b' }, tail: { len: 0.08, w: 0.08 }, span: 1.5, chord: 0.26,
    c: { body: '#f6f6f0', back: '#f6f6f0', wing: '#f2f2ec', tip: '#eeeee8', head: '#f6f6f0', legs: '#1a1a18', tail: '#f6f6f0', neck: '#f6f6f0' } },
};
function bird(G, B) {
  const c = {}; for (const k in B.c) c[k] = lin(B.c[k]);
  const yb = B.legs + B.bh * 0.45, tint = !!B.tint;
  const bodyCol = (x, y, z) => { let k = mix(c.body, c.back, sm(yb - B.bh * 0.1, yb + B.bh * 0.3, y)); if (c.breast && z > B.bl * 0.1 && y < yb + B.bh * 0.2) k = mix(k, c.breast, sm(B.bl * 0.1, B.bl * 0.3, z)); return k; };
  G.ell([0, yb, 0], [B.bw * 0.5, B.bh * 0.5, B.bl * 0.5], { col: c.body, cf: bodyCol, tint, big: true });
  // neck, head, beak (one part: pecking, looking round)
  const nb = [0, yb + B.bh * 0.25, B.bl * 0.38], na = B.neck.ang, nt = [0, nb[1] + Math.sin(na) * B.neck.len, nb[2] + Math.cos(na) * B.neck.len], ho = { part: P.HEAD, a: nb, seg: 2 }, hn = { part: P.HEAD, a: nb, seg: 0 };
  if (B.neck.len > 0.1) G.chain([nb, add(nb, [0, B.neck.len * 0.5, -B.neck.len * 0.05]), nt], [B.bw * 0.22, B.head * 0.6, B.head * 0.7], Object.assign({ col: c.neck || c.head }, hn));
  else G.tube(nb, nt, B.bw * 0.32, B.head * 0.8, Object.assign({ col: c.neck || c.head }, hn));
  if (B.duck) { G.ell(nt, [B.head, B.head * 0.95, B.head * 1.15], Object.assign({ col: c.head, sex: 1 }, ho)); G.ell(nt, [B.head, B.head * 0.95, B.head * 1.15], Object.assign({ col: c.head2, sex: 2 }, ho)); G.ell(add(nb, [0, B.neck.len * 0.45, 0.01]), [B.bw * 0.3, B.head * 0.25, B.bw * 0.3], Object.assign({ col: c.ring, sex: 1, fine: true }, hn)); }
  else G.ell(nt, [B.head, B.head * 0.95, B.head * 1.12], Object.assign({ col: c.head }, ho));
  if (c.face) G.ell(add(nt, [0, 0, B.head * 0.45]), [B.head * 0.85, B.head * 0.7, B.head * 0.6], Object.assign({ col: c.face, fine: true }, ho));
  if (c.comb) G.ell(add(nt, [0, B.head * 0.6, 0.0]), [B.head * 0.5, B.head * 0.18, B.head * 0.4], Object.assign({ col: c.comb, fine: true, sex: 1 }, ho));
  if (B.ruff) G.ell(nb, [B.bw * 0.45, B.bw * 0.35, B.bw * 0.35], Object.assign({ col: lin(B.ruff), bump: 0.15 }, hn));
  const bk = B.beak, bs = add(nt, [0, -B.head * 0.15, B.head * 0.75]), be = add(bs, [0, bk.hook ? -bk.len * 0.25 : -bk.len * 0.08, bk.len]);
  G.tube(bs, be, bk.r * (bk.flat ? 1.3 : 1), bk.r * 0.2, Object.assign({ col: lin(bk.col) }, ho));
  if (bk.tipCol) G.tube(add(bs, [0, 0, bk.len * 0.8]), be, bk.r * 0.35, bk.r * 0.18, Object.assign({ col: lin(bk.tipCol), fine: true }, ho));
  if (bk.pouch) G.ell(add(bs, [0, -bk.r * 2.2, bk.len * 0.5]), [bk.r * 1.2, bk.r * 2, bk.len * 0.42], Object.assign({ col: lin(bk.pouch) }, ho));
  for (const s of [1, -1]) G.ell(add(nt, [s * B.head * 0.62, B.head * 0.25, B.head * 0.35]), [B.head * 0.2, B.head * 0.2, B.head * 0.2], Object.assign({}, ho, { col: [0.01, 0.01, 0.01], eye: true, fine: true }));
  // tail: a flat fan behind
  const tb = [0, yb + B.bh * 0.1, -B.bl * 0.42], tw = B.tail.w / 2, tl = B.tail.len;
  G.slab([add(tb, [tw * 0.4, 0, 0]), add(tb, [tw, -tl * 0.12, -tl]), add(tb, [-tw, -tl * 0.12, -tl]), add(tb, [-tw * 0.4, 0, 0])], 0.01 + B.bw * 0.05, { part: P.TAIL, a: tb, col: c.tail, seg: 1 });
  // wings: inner half (shoulder to wrist) and outer half (to the tip), each a tapering plate, swept back towards the tip
  const ch = B.chord, tc = B.tipChord || ch * 0.55, half = B.span / 2;
  for (const [part, s] of [[P.WL, 1], [P.WR, -1]]) {
    const sh = [s * B.bw * 0.38, yb + B.bh * 0.28, B.bl * 0.16], wr = [s * half * 0.45, sh[1] + 0.01, sh[2] - ch * 0.1], tp = [s * half, sh[1], sh[2] - ch * 0.35];
    const o = { part, a: sh, b: wr }, th = Math.max(0.006, ch * 0.06);
    G.slab([add(sh, [0, 0, ch * 0.25]), add(wr, [0, 0, ch * 0.3]), add(wr, [0, 0, -ch * 0.62]), add(sh, [0, 0, -ch * 0.75])], th, Object.assign({ col: c.wing, seg: 0 }, o));
    if (B.fingers && !G.lod) for (let i = 0; i < 5; i++) { const u = i / 4, r = add(wr, [0, 0, ch * (0.25 - u * 0.85)]), t = add(tp, [s * -0.04 * u, 0, tc * (0.3 - u * 0.8)]); G.slab([r, add(t, [0, 0, tc * 0.1]), add(t, [s * -0.03, 0, -tc * 0.1]), add(r, [0, 0, -ch * 0.18])], th, Object.assign({ col: mix(c.wing, c.tip, 0.4 + 0.6 * u), seg: 1 }, o)); }
    else { G.slab([add(wr, [0, 0, ch * 0.3]), add(tp, [0, 0, tc * 0.25]), add(tp, [0, 0, -tc * 0.55]), add(wr, [0, 0, -ch * 0.62])], th, Object.assign({ cf: (x) => mix(c.wing, c.tip, sm(half * 0.62, half * 0.85, Math.abs(x))), seg: 1 }, o)); }
  }
  // legs: down to the ground, tucked back in flight
  for (const [part, s] of [[P.LF, 1], [P.RF, -1]]) {
    const A = [s * B.bw * 0.18, yb - B.bh * 0.2, B.bl * 0.02], F = [s * B.bw * 0.2, 0.004, B.bl * 0.04], r = Math.max(0.003, B.legs * 0.04 + B.bw * 0.03);
    G.tube(A, F, r * 1.4, r, { part, a: A, b: A, col: c.legs, seg: 0 });
    G.slab([add(F, [s * 0.004, 0, -r * 2]), add(F, [s * r * 3, 0, r * 6]), add(F, [-s * r * 3, 0, r * 6]), add(F, [-s * 0.004, 0, -r * 2])], r * 0.8, { part, a: A, b: A, col: c.legs, seg: 0, fine: true });
  }
  const k = B.neck.len > 0.2 ? 0.8 : 0.5;
  return { graze: 1.1, drop: 0, cy: yb, peck: grazeAngle(nb, be, nt, k), nod: [...nt, k] };
}

// ------------------------------------------------------------------ the rest: crab, frog, snake, butterfly
function crab(G) {
  const col = lin('#d8532a'), dk = lin('#a63d1e'), y = 0.045;
  G.ell([0, y, 0], [0.09, 0.03, 0.065], { col, cf: (x, yy) => mix(dk, col, sm(y - 0.02, y + 0.02, yy)), tint: true });
  for (const s of [1, -1]) {
    for (let i = 0; i < 4; i++) { const part = [P.LF, P.LH, P.RF, P.RH][(s > 0 ? 0 : 2) + (i % 2)], z = 0.035 - i * 0.025, A = [s * 0.08, y, z], K = [s * 0.13, y + 0.025, z - 0.005], F = [s * 0.16, 0.002, z - 0.01];
      G.tube(A, K, 0.007, 0.006, { part, a: A, b: K, col, seg: 0, tint: true }); G.tube(K, F, 0.006, 0.002, { part, a: A, b: K, col, seg: 1, tint: true }); }
    const ca = [s * 0.06, y, 0.06], cb = [s * 0.08, y + 0.02, 0.1];
    G.tube(ca, cb, 0.008, 0.01, { part: P.HEAD, seg: 1, a: ca, b: ca, col, tint: true });
    G.ell(add(cb, [0, 0, 0.02]), [0.018, 0.012, 0.028], { part: P.HEAD, seg: 1, a: ca, b: ca, col, tint: true });
    G.tube([s * 0.02, y + 0.02, 0.055], [s * 0.025, y + 0.04, 0.06], 0.003, 0.003, { col: lin('#2a1a10'), fine: true });
    G.ell([s * 0.025, y + 0.043, 0.06], [0.006, 0.006, 0.006], { col: lin('#101010'), eye: true, fine: true });
  }
  return { graze: 0, drop: 0, cy: y };
}
function frog(G) {
  const y = 0.012;
  G.ell([0, y + 0.006, 0], [0.012, 0.009, 0.018], { col: lin('#f0f0f0'), tint: true, pat: true });
  G.ell([0, y + 0.01, 0.016], [0.011, 0.008, 0.01], { part: P.HEAD, a: [0, y, 0.01], col: lin('#f0f0f0'), tint: true, pat: true });
  for (const s of [1, -1]) {
    G.ell([s * 0.007, y + 0.016, 0.02], [0.004, 0.004, 0.004], { part: P.HEAD, a: [0, y, 0.01], col: lin('#101010'), eye: true });
    const A = [s * 0.01, y, -0.01]; G.ell(add(A, [s * 0.006, -0.004, -0.004]), [0.006, 0.005, 0.012], { part: s > 0 ? P.LH : P.RH, a: A, col: lin('#f0f0f0'), tint: true, pat: true });
    G.tube([s * 0.009, y, 0.012], [s * 0.014, 0.001, 0.02], 0.0025, 0.002, { part: s > 0 ? P.LF : P.RF, a: [s * 0.009, y, 0.012], col: lin('#f0f0f0'), tint: true });
  }
  return { graze: 0, drop: 0, cy: y };
}
function snake(G, L) {
  const n = G.lod ? 14 : 30, r = 0.12, col = lin('#3a4418'), bel = lin('#8a7e3a');
  const cf = (x, y) => mix(bel, col, sm(r * 0.2, r * 1.2, y));
  for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n, rad = u => r * (u < 0.15 ? 0.45 + u / 0.15 * 0.55 : u > 0.9 ? 1 - (u - 0.9) * 6 : 1) * (1 - u * 0.25); G.tube([0, r, L / 2 - u0 * L], [0, r, L / 2 - u1 * L], rad(u1 > 0.15 ? u0 : u0) * 0.999 + 1e-4, rad(u1), { part: P.SPINE, w: 1, cf, pat: true, sides: 7 }); }
  G.ell([0, r * 1.05, L / 2 + 0.08], [r * 0.8, r * 0.55, r * 1.4], { part: P.SPINE, w: 1, cf, pat: true });
  for (const s of [1, -1]) G.ell([s * r * 0.45, r * 1.4, L / 2 + 0.1], [0.012, 0.012, 0.012], { part: P.SPINE, w: 1, col: lin('#c9a23a'), eye: true, fine: true });
  return { graze: 0, drop: 0, cy: r, waveK: 2 * Math.PI / (L * 0.45) };
}
function butterfly(G) {
  G.tube([0, 0, 0.02], [0, 0, -0.02], 0.004, 0.003, { col: lin('#1a1a1a') });
  for (const [part, s] of [[P.WL, 1], [P.WR, -1]]) {
    const a = [s * 0.003, 0, 0];
    G.slab([add(a, [0, 0, 0.012]), [s * 0.07, 0, 0.035], [s * 0.065, 0, -0.005], add(a, [0, 0, -0.004])], 0.001, { part, a, b: a, col: lin('#ffffff'), tint: true, cf: (x) => mix([1, 1, 1], [0.05, 0.05, 0.08], sm(0.055, 0.07, Math.abs(x))) });
    G.slab([add(a, [0, 0, -0.004]), [s * 0.055, 0, -0.012], [s * 0.035, 0, -0.04], add(a, [0, 0, -0.016])], 0.001, { part, a, b: a, col: lin('#ffffff'), tint: true });
  }
  return { graze: 0, drop: 0, cy: 0 };
}

// ------------------------------------------------------------------ one species → geometry and what the renderer needs to know
export function build(sp, lod) {
  const G = new Geo(lod); let meta, defs = {}, patS = 1, pat = 0;
  if (sp.rig === 'quad') { const S = Q[sp.id]; meta = quad(G, S); defs = Object.assign({}, S.defs); pat = S.pat || 0; patS = S.patS || 1; }
  else if (sp.rig === 'sprawl') { meta = sprawl(G, SPRAWL[sp.id]); defs = { SPRAWL: 1 }; }
  else if (sp.rig === 'bird') { meta = bird(G, BIRD[sp.id]); defs = { BIRD: 1 }; }
  else if (sp.rig === 'crab') { meta = crab(G); defs = { SPRAWL: 1 }; }
  else if (sp.rig === 'frog') { meta = frog(G); defs = { FROG: 1 }; pat = 3; patS = 160; }
  else if (sp.rig === 'snake') { meta = snake(G, sp.len); pat = 3; patS = 9; }
  else { meta = butterfly(G); defs = { BIRD: 1 }; }
  if (pat) defs.PAT = pat;
  if (sp.id === 'elefant') meta.graze = 0.25;           // it grazes with its trunk
  return { geo: G.done(), meta: Object.assign(meta, { defs, patS, patCol: PATCOL[sp.id] || '#1a1612' }) };
}
const PATCOL = { sebra: '#161412', sjiraff: '#8a4a1e', gepard: '#1e1610', jaguar: '#2a1c10', anakonda: '#1c1e0c', frosk: '#0c0c0c' };
// colours per animal (the tinted parts are multiplied by them; cows: the colour of the patches)
export const TINTS = {
  sau: ['#ffffff', '#ffffff', '#ffffff', '#f4ece0', '#ffffff', '#8a8680', '#4a4440', '#7a5a3e'],
  ku: ['#8a3a22', '#8a3a22', '#7a2e1c', '#1e1c1a', '#6a4a2a', '#9a4a28'],
  katt: ['#2a2622', '#d8843e', '#8a8580', '#f4f0e8', '#5a4a3a', '#3a3632'],
  hund: ['#d8a860', '#1e1c1a', '#5a3a22', '#e8dcc0', '#8a6a4a'],
  firfisle: ['#7a9a4a', '#8a7a4a', '#6a7a3a', '#9a8a5a'],
  krabbe: ['#ffffff', '#ffd0b0', '#f0e0c0'],
  frosk: ['#2a6ad8', '#d9302a', '#f2c21a', '#3fbf4a'],
  sommerfugl: ['#3a7ce0', '#f2c23a', '#f08a3a', '#ffffff', '#e0405a', '#8a4ad0'],
  and: ['#ffffff'], due: ['#ffffff', '#ffffff', '#d8d8dc', '#b0b4bc', '#f0ece8'],
};
