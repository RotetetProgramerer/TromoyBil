// Parts shared by the cars: the section generator for upright bodies, interior (seats, dashboard, steering wheel),
// number plates, mirrors, lamps, arch flares and sills. Units are metres unless a name says mm.
import { THREE, add, box, rbox, mat4, aim, extrude, flat, rrect, circle, sweep, tube, cylAB, latheGeo } from './geo.mjs';
import { archTop } from './body.mjs';

const F = (v, s) => typeof v === 'function' ? v(s) : v;
// the standard half section (mm), 9 control points: floor centre, floor corner, lower flank, widest, shoulder (beltline),
// glass base, roof edge (side window top), roof edge inner, roof centre. Over the hood the last four lie on the hood.
export const stdSec = p => s => {
  const g = k => F(p[k], s), w = g('w'), yb = g('yb'), rb = g('rb'), wS = g('wS'), yS = g('yS'), wR = g('wR'), yR = g('yR'), rr = g('rr');
  return [[0, yb], [w - rb, yb], [w, yb + rb], [w, g('ym')], [wS, yS], [wS - g('ledge'), yS + (F(p.lift, s) ?? 10)], [wR, yR - rr], [wR - rr * 0.9, yR], [0, g('yT')]];
};

// points along the body surface at u from s0 to s1 (mm), lifted off it by off (m); left side (mirror x for the right)
export const surfLine = (B, s0, s1, u, off = 0, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
  const s = s0 + (s1 - s0) * i / n, p = B.P(s, u), q = B.N(s, u); return [p[0] + q[0] * off, p[1] + q[1] * off, p[2] + q[2] * off];
});
export const mirX = P => P.map(p => [-p[0], p[1], p[2]]);

// ------------------------------------------------------------------ interior
// a seat: cushion, backrest (leaning back by rake) and headrest; (x, y, z) = middle of the cushion top front edge
export function seat(md, x, y, z, w = 0.5, rake = 0.3, mat = 'interior', base = 0.2) {
  box(md, mat, w, 0.12, 0.5, 0.05, mat4(x, y - 0.06, z - 0.25));
  box(md, mat, w * 0.96, 0.62, 0.13, 0.05, mat4(x, y + 0.27, z - 0.52 - Math.sin(rake) * 0.3, -rake));
  box(md, mat, w * 0.5, 0.17, 0.09, 0.04, mat4(x, y + 0.68, z - 0.6 - Math.sin(rake) * 0.62, -rake));
  box(md, 'trim', w * 0.7, base, 0.4, 0.02, mat4(x, y - 0.12 - base / 2, z - 0.27));
}
export function bench(md, w, y, z, rake = 0.25, mat = 'interior') {
  box(md, mat, w, 0.13, 0.48, 0.05, mat4(0, y - 0.065, z - 0.24));
  box(md, mat, w, 0.6, 0.12, 0.05, mat4(0, y + 0.26, z - 0.5 - Math.sin(rake) * 0.3, -rake));
  for (const sx of [0.32, -0.32]) box(md, mat, 0.22, 0.14, 0.08, 0.03, mat4(sx * w / 1.1, y + 0.64, z - 0.56 - Math.sin(rake) * 0.6, -rake));
}
// dashboard across the car (half width hw) at height y (top), its back edge at z; with an instrument hood on the driver's side
export function dash(md, hw, y, z, depth = 0.45, dx = 0.37) {
  box(md, 'interior', hw * 2, 0.3, depth, 0.06, mat4(0, y - 0.15, z + depth / 2));
  box(md, 'trim', 0.3, 0.05, 0.12, 0.02, mat4(dx, y + 0.005, z + 0.1));
  box(md, 'trim', 0.2, 0.3, 0.35, 0.03, mat4(0, y - 0.35, z + 0.05));     // centre stack
  box(md, 'trim', 0.18, 0.12, 0.7, 0.03, mat4(0, y - 0.48, z - 0.4));     // console
}
// the steering wheel: rim in the local xy plane, the column along local +z (into the dashboard)
export function steeringWheel(md, R = 0.19) {
  add(md, 'interior', new THREE.TorusGeometry(R, 0.017, 6, 32), null);
  add(md, 'trim', new THREE.CylinderGeometry(0.06, 0.07, 0.06, 12), mat4(0, 0, 0.02, Math.PI / 2));
  for (const a of [0, Math.PI, -Math.PI / 2]) { const c = Math.cos(a), s = Math.sin(a); box(md, 'trim', 0.03, 0.015, 0.02, 0.006, new THREE.Matrix4().makeRotationZ(a).setPosition(c * R * 0.55, s * R * 0.55, 0.01).multiply(new THREE.Matrix4().makeScale(R * 0.95 / 0.03, 1, 1))); }
  add(md, 'trim', new THREE.CylinderGeometry(0.03, 0.04, 0.3, 10), mat4(0, 0, 0.18, Math.PI / 2));
}

// ------------------------------------------------------------------ outside parts
// a number plate (Norwegian size 520 × 110 mm): white with a thin black border; p = centre, d = direction it faces
export function plate(md, p, d, w = 0.52, h = 0.11) {
  const m = aim(p, d);
  box(md, 'trim', w + 0.012, h + 0.012, 0.008, 0.002, m.clone().multiply(mat4(0, 0, -0.003)));
  box(md, 'plate', w, h, 0.006, 0.002, m.clone().multiply(mat4(0, 0, 0.001)));
}
// a lamp lens: an outline (local xy, metres) extruded a little out of a surface; p = centre, d = facing; ring: a bezel round it
export function lamp(md, mat, pts, p, d, depth = 0.02, up = [0, 1, 0], bezel = null) {
  const m = aim(p, d, up);
  if (bezel) extrude(md, bezel.mat || 'trim', grow(pts, bezel.w || 0.01), depth * 0.6, 0.003, m.clone().multiply(mat4(0, 0, -depth * 0.5)));
  extrude(md, mat, pts, depth, Math.min(0.006, depth / 3), m.clone().multiply(mat4(0, 0, -depth * 0.4)), [], 40, 1);
  return m;
}
// an outline grown outwards by e (about its centroid; fine for convex outlines)
export function grow(pts, e) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * e, y + dy / l * e]; });
}
// a round headlamp: bezel ring, reflector, lens dome and a ring of daytime light; p = centre, d = facing
export function roundLamp(md, p, d, r, o = {}) {
  const m = aim(p, d, o.up);
  add(md, o.bezel || 'chrome', new THREE.TorusGeometry(r, r * 0.09, 6, 28), m);
  add(md, 'light_head', latheGeo([[r * 0.97, 0], [r * 0.8, r * 0.07], [r * 0.4, r * 0.12], [0.001, r * 0.13]], 24), m.clone().multiply(mat4(0, 0, -0.004, Math.PI / 2)), 50);   // the lens dome
  if (o.drl !== false) add(md, 'light_drl', new THREE.TorusGeometry(r * (o.drlR ?? 0.72), r * 0.045, 4, 28), m.clone().multiply(mat4(0, 0, r * 0.085)));
  return m;
}
// a door mirror on its stalk: the root at p (on the body), sx = side (+1 left)
export function mirror(md, p, sx, o = {}) {
  const w = o.w ?? 0.2, h = o.h ?? 0.13, d = o.d ?? 0.09, out = o.out ?? 0.06;
  box(md, 'trim', 0.03, 0.04, 0.08, 0.01, mat4(p[0] + sx * out * 0.35, p[1], p[2]));
  const c = [p[0] + sx * (out + w / 2 - 0.03), p[1] + 0.03, p[2] - 0.02];
  box(md, o.mat || 'paint', w, h, d, 0.035, mat4(...c, 0, sx * 0.08));
  box(md, 'chrome', w - 0.03, h - 0.03, 0.006, 0.01, mat4(c[0], c[1], c[2] - d / 2 - 0.001, 0, sx * 0.08));
  box(md, 'light_ind_' + (sx > 0 ? 'L' : 'R'), w * 0.4, 0.015, 0.03, 0.005, mat4(c[0] + sx * w * 0.25, c[1] - h * 0.25, c[2] + d * 0.4));
}
// a black arch flare on the body round arch A (mm values in A); B the body from loft(); sx = side; prof: [[radial, out], …] (m)
export function flare(md, B, A, sx, prof, yBot, mat = 'trim') {
  const Rz = A.Rz ?? A.R, s0 = A.s - Rz, s1 = A.s + Rz, pts = [];
  for (let k = 0; k <= 3; k++) pts.push([s0, yBot + (A.yc - yBot) * k / 3]);
  for (let k = 1; k < 30; k++) { const s = s0 + (s1 - s0) * k / 30; pts.push([s, archTop(A, s)]); }
  for (let k = 3; k >= 0; k--) pts.push([s1, yBot + (A.yc - yBot) * k / 3]);
  const yc = B.toM(0, A.yc, 0)[1], zc = B.zOf(A.s);
  const path = pts.map(([s, y]) => { const ym = B.toM(0, y, s)[1]; return [B.xAt(s, ym), ym, B.zOf(s)]; });
  const radial = (j, p) => { const dy = p[1] - yc, dz = p[2] - zc, l = Math.hypot(dy, dz) || 1; return j < 3 ? [0, 0, Math.sign(dz)] : j >= path.length - 3 ? [0, 0, Math.sign(dz)] : [0, dy / l, dz / l]; };
  const m = new (md.constructor)(); sweep(m, mat, path, prof, radial);
  md.merge(sx > 0 ? m : m.mirrored());
}
