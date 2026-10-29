// Wheels: a tyre with real tread (blocks or grooves) and bulging sidewalls, a rim (spoked alloy, steel or beadlock),
// the brake disc and a caliper. Built for the left side (outer face towards +x) and mirrored for the right.
// The axle is along x and everything is centred on the wheel centre.
import { MeshData } from './glb.mjs';
import { THREE, add, smoothSoup, latheGeo, circle, mat4, cylGeo, rbox } from './geo.mjs';

const TAU = Math.PI * 2;
// a lathe round x from a profile [[radius, x], …] (LatheGeometry turns round y)
const latheX = (md, mat, prof, n, smooth = 40) => add(md, mat, latheGeo(prof, n), mat4(0, 0, 0, 0, 0, -Math.PI / 2), smooth);   // x increasing: faces out

// tread patterns: depth (m), pitch (m) and the blocks of one pitch as polygons [[a, x], …] (a along the tread as a fraction of
// the pitch, x across as a fraction of the half width), plus grooves round the tyre for road tyres
const TREAD = {
  at: { depth: 0.013, pitch: 0.056, blocks: sg => [
    [[0.06, 0.50 * sg], [0.62, 0.53 * sg], [0.70, 1.0 * sg], [0.10, 1.0 * sg]],                       // shoulder lug
    [[0.52, 0.06 * sg], [1.00, 0.08 * sg], [1.04, 0.43 * sg], [0.56, 0.41 * sg]],                     // centre block
  ] },
  monster: { depth: 0.065, pitch: 0.29, blocks: sg => [[[0.0, 1.0 * sg], [0.34, 1.0 * sg], [0.62, -0.10 * sg], [0.30, -0.10 * sg]]] },
  road: { depth: 0.008, grooves: [-0.52, -0.17, 0.17, 0.52], gw: 0.012, sipes: 0.03 },
  sport: { depth: 0.007, grooves: [-0.40, 0.02, 0.40], gw: 0.010, sipes: 0.035 },
};

export function tyre(md, o) {
  const T = TREAD[o.tread] || TREAD.road, d = T.depth, r = o.r, hw = o.w / 2, rr = o.rr, rc = r - d, h = rc - rr, n = o.seg || (r > 0.6 ? 72 : 48);
  const block = !T.grooves, sq = block ? 0.96 : 0.90;                     // block tyres have squarer shoulders
  const side = sg => [[rr + 0.004, 0.80], [rr + 0.02, 0.87], [rr + 0.2 * h, 0.95], [rr + 0.45 * h, 1.0], [rr + 0.7 * h, 0.985], [rr + 0.88 * h, sq], [rc - 0.006, sq - 0.04]].map(([R, f]) => [R, sg * f * hw]);
  let top;
  if (block) top = [[rc, -0.84 * hw], [rc, 0.84 * hw]];
  else {                                                                   // ribs with grooves round the tyre, rounded shoulders
    top = [[r - 0.010, -0.90 * hw], [r - 0.002, -0.86 * hw]];
    for (const g of T.grooves) { const x = g * hw, e = T.gw / 2; top.push([r, x - e - 0.002], [r - d, x - e + 0.001], [r - d, x + e - 0.001], [r, x + e + 0.002]); }
    top.push([r - 0.002, 0.86 * hw], [r - 0.010, 0.90 * hw]);
  }
  latheX(md, 'rubber', [...side(-1), ...top, ...side(1).reverse()], n, 38);
  // blocks: polygons on the casing, from just inside it up to the tread radius (and down over the shoulder)
  const S = [], pt = (a, x, R) => { const t = a / r; return [x, R * Math.cos(t), R * Math.sin(t)]; };
  const tri = (A, B, C, out) => {
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (nn[0] * out[0] + nn[1] * out[1] + nn[2] * out[2] < 0) S.push(...A, ...C, ...B); else S.push(...A, ...B, ...C);
  };
  const rTop = x => { const f = Math.abs(x) / hw; return f < 0.84 ? r : r - (f - 0.84) / 0.16 * d * 1.1; };
  const rBot = x => { const f = Math.abs(x) / hw; return f < 0.84 ? rc - 0.003 : rc - 0.003 - (f - 0.84) / 0.16 * Math.min(h * 0.12, d * 2.5); };
  const emit = poly => {                                                   // poly: [[a, x], …] in metres, convex
    const ac = poly.reduce((s, p) => s + p[0], 0) / poly.length, top = poly.map(([a, x]) => pt(a, x, rTop(x))), bot = poly.map(([a, x]) => pt(a, x, rBot(x)));
    const radial = [0, Math.cos(ac / r), Math.sin(ac / r)];
    for (let i = 1; i < poly.length - 1; i++) tri(top[0], top[i], top[i + 1], radial);
    const cx = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length, mid = pt((poly[i][0] + poly[j][0]) / 2, (poly[i][1] + poly[j][1]) / 2, rTop(0)), c = pt(ac, cx, rTop(0));
      const out = [mid[0] - c[0], mid[1] - c[1], mid[2] - c[2]];
      tri(bot[i], bot[j], top[j], out); tri(bot[i], top[j], top[i], out);
    }
  };
  if (block) {
    const np = Math.round(TAU * r / T.pitch), P = TAU * r / np;
    for (let k = 0; k < np; k++) for (const sg of [1, -1]) for (const b of T.blocks(sg)) emit(b.map(([a, x]) => [(k + a + (sg < 0 ? 0.5 : 0)) * P, x * hw]));
  } else if (T.sipes) {                                                    // shallow lateral notches on the shoulders of road tyres
    const np = Math.round(TAU * r / T.sipes), P = TAU * r / np, g = T.grooves, x0 = g[g.length - 1] * hw + T.gw;
    for (let k = 0; k < np; k++) for (const sg of [1, -1]) {
      const a = k * P, xa = sg * x0, xb = sg * 0.97 * hw, w = 0.004;
      const q = [[a, xa], [a + w, xa], [a + w + 0.006, xb], [a + 0.006, xb]].map(([aa, x]) => pt(aa, x, Math.min(rTop(x) + 0.0006, r + 0.0006) - (Math.abs(x) > 0.86 * hw ? (Math.abs(x) / hw - 0.86) * 0.08 : 0)));
      tri(q[0], q[1], q[2], [0, Math.cos(a / r), Math.sin(a / r)]); tri(q[0], q[2], q[3], [0, Math.cos(a / r), Math.sin(a / r)]);   // dark slits
    }
  }
  if (S.length) { const g = smoothSoup(S, 30); md.add(block ? 'rubber' : 'trim', g.P, g.N, null, g.I); }
  return md;
}

// rim window outlines between spokes at angles phis (radians), spoke width sw (m) at radii r1 … r2, corners rounded
function windows(phis, sw, r1, r2, ro) {
  const hwAt = rho => sw / 2 * (1 + 0.5 * (1 - rho / ro)), out = [];
  const sorted = [...phis].sort((a, b) => a - b);
  for (let k = 0; k < sorted.length; k++) {
    const a = sorted[k], b = k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + TAU, P = [];
    const d1 = hwAt(r1) / r1, d2 = hwAt(r2) / r2;
    if (b - a - 2 * d2 < 0.05) continue;
    const span1 = Math.max(0.0, b - a - 2 * d1);
    for (let i = 0; i <= 3; i++) { const rho = r1 + (r2 - r1) * i / 3; P.push([rho, a + hwAt(rho) / rho]); }
    const na = Math.max(2, Math.ceil((b - a) / 0.12));
    for (let i = 1; i < na; i++) P.push([r2, a + d2 + (b - a - 2 * d2) * i / na]);
    for (let i = 3; i >= 0; i--) { const rho = r1 + (r2 - r1) * i / 3; P.push([rho, b - hwAt(rho) / rho]); }
    if (span1 > 0.1) for (let i = 1; i < 3; i++) P.push([r1, b - d1 - span1 * i / 3]);
    let pts = P.map(([rho, t]) => [Math.cos(t) * rho, Math.sin(t) * rho]);
    for (let it = 0; it < 1; it++) { const q = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], n = pts[(i + 1) % pts.length]; q.push([p[0] * 0.75 + n[0] * 0.25, p[1] * 0.75 + n[1] * 0.25], [p[0] * 0.25 + n[0] * 0.75, p[1] * 0.25 + n[1] * 0.75]); } pts = q; }
    out.push(pts.reverse());
  }
  return out;
}

// o: { r, w, rr, style: 'spokes'|'twin'|'steel'|'beadlock'|'multi', n, sw, dish, lock (centre lock nut) }
export function rim(md, o) {
  const rr = o.rr, hw = o.w / 2, xo = hw * 0.82, xi = -hw * 0.82, ro = rr - 0.008, dish = o.dish ?? 0.03, t = o.t ?? 0.026;
  // barrel and flanges (the rim material is double sided)
  latheX(md, 'rim', [[rr + 0.016, xi], [rr + 0.019, xi + 0.007], [rr + 0.004, xi + 0.016], [rr - 0.008, xi + 0.03], [rr - 0.014, xi + 0.07], [rr - 0.014, xo - 0.07], [rr - 0.008, xo - 0.03], [rr + 0.004, xo - 0.016], [rr + 0.019, xo - 0.007], [rr + 0.016, xo]], 40, 45);
  const xf = xo - 0.012, rh = o.hub ?? rr * 0.3;
  // the face: a disc with windows, dished towards the hub
  let holes = [], phis = [];
  const n = o.n || 5;
  if (o.style === 'twin') for (let k = 0; k < n; k++) { const a = k / n * TAU; phis.push(a - 0.11, a + 0.11); }
  else for (let k = 0; k < n; k++) phis.push(k / n * TAU + (o.rot || 0));
  if (o.style === 'steel') holes = Array.from({ length: n }, (_, k) => circle(rr * 0.11, 14, Math.cos(k / n * TAU) * rr * 0.6, Math.sin(k / n * TAU) * rr * 0.6).reverse());
  else if (o.style === 'beadlock') holes = Array.from({ length: n }, (_, k) => circle(rr * 0.12, 16, Math.cos(k / n * TAU) * rr * 0.55, Math.sin(k / n * TAU) * rr * 0.55).reverse());
  else holes = windows(phis, o.sw ?? rr * 0.16, rh + 0.012, ro - (o.ring ?? 0.026), ro);
  const s = new THREE.Shape(circle(ro, 48).map(p => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.0035, bevelOffset: -0.0035, bevelSegments: 1, curveSegments: 4 });
  // shape (x, y) → wheel (−z, y); depth → +x, ending at the outer face xf
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(xf - t + 0.004, 0, 0));
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) { const rho = Math.hypot(pa.getY(i), pa.getZ(i)), f = Math.max(0, 1 - rho / ro); pa.setX(i, pa.getX(i) - dish * Math.min(1, f * 1.6)); }
  add(md, 'rim', g, null, 38);
  // hub, lug nuts or centre lock, the back of the face (dark) so the windows do not show the sky
  const xh = xf - dish * 1.0;
  add(md, 'rim', cylGeo(rh, 0.03, 24), mat4(xh - 0.01, 0, 0, 0, 0, Math.PI / 2), 40);
  if (o.lock) { add(md, 'chrome', cylGeo(rh * 0.42, 0.04, 6), mat4(xh + 0.01, 0, 0, 0, 0, Math.PI / 2), 20); }
  else for (let k = 0; k < (o.nuts || 5); k++) { const a = k / (o.nuts || 5) * TAU, rn = rh * 0.62; add(md, 'chrome', cylGeo(0.011, 0.018, 6), mat4(xh + 0.012, Math.cos(a) * rn, Math.sin(a) * rn, 0, 0, Math.PI / 2), 20); }
  if (o.cap) add(md, o.cap, latheGeo([[rh * 0.9, 0], [rh * 0.85, 0.008], [rh * 0.5, 0.017], [0.001, 0.02]], 24), mat4(xh + 0.005, 0, 0, 0, 0, -Math.PI / 2), 50);
  if (o.style === 'beadlock') {                                            // the beadlock ring with its bolts
    latheX(md, 'rim', [[rr - 0.02, xo + 0.004], [rr + 0.045, xo + 0.004], [rr + 0.05, xo - 0.004], [rr + 0.045, xo - 0.016]], 64, 40);
    for (let k = 0; k < 32; k++) { const a = k / 32 * TAU; add(md, 'chrome', cylGeo(0.009, 0.014, 6), mat4(xo + 0.01, Math.cos(a) * (rr + 0.017), Math.sin(a) * (rr + 0.017), 0, 0, Math.PI / 2), 20); }
  }
  return { xh, xf };
}

// the brake disc (with its hat) and a caliper round its edge; returns the caliper as a separate mesh (it does not spin)
export function brake(md, cal, o, xh) {
  const rd = Math.min(o.rr * 0.84, o.rr - 0.04), xd = xh - 0.055, td = o.disc ?? 0.028;
  latheX(md, 'disc', [[rd * 0.55, xd - td / 2], [rd, xd - td / 2], [rd, xd + td / 2], [rd * 0.55, xd + td / 2]], 40, 45);
  latheX(md, 'disc', [[rd * 0.56, xd + td / 2], [rd * 0.5, xh - 0.02], [0.02, xh - 0.02]], 24, 45);
  if (!cal) return;
  const a0 = o.calA ?? 1.15, span = o.calSpan ?? 0.75, ri = rd - 0.05, ro = rd + 0.016, P = [];
  for (let i = 0; i <= 8; i++) { const a = a0 - span / 2 + span * i / 8; P.push([Math.cos(a) * ro, Math.sin(a) * ro]); }
  for (let i = 8; i >= 0; i--) { const a = a0 - span / 2 + span * i / 8; P.push([Math.cos(a) * ri, Math.sin(a) * ri]); }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(P.map(p => new THREE.Vector2(p[0], p[1]))), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.007, bevelOffset: -0.007, bevelSegments: 2, curveSegments: 4 });
  // shape (x, y) → wheel (−z, y): angle a measured from the back (−z) up towards the top; depth → x across the disc
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(xd - 0.042, 0, 0));
  add(cal, 'caliper', g, null, 40);
}

// a whole wheel for one side (sx = +1 left, −1 right): { wheel, caliper }
export function wheel(o, sx) {
  const md = new MeshData(), cal = o.caliper === false ? null : new MeshData();
  tyre(md, o);
  const { xh } = rim(md, o);
  brake(md, cal, o, xh);
  return sx > 0 ? { wheel: md, caliper: cal } : { wheel: md.mirrored(), caliper: cal && cal.mirrored() };
}
