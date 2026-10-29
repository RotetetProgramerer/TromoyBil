// Geometry helpers for the car builder: transforms, three.js geometries into MeshData (with smoothing by angle),
// rounded boxes, tubes, extrusions, lathes, flat shapes and smooth grid sheets. Units are metres.
import * as THREE from '../../vendor/three/three.module.min.js';
export { THREE };
const V = THREE.Vector3;

// a transform from position, rotation (Euler XYZ, radians) and scale
export const mat4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V(sx, sy, sz));
// a transform that turns local +z into direction d (and keeps local +y as close to up as possible), at position p
export function aim(p, d, up = [0, 1, 0]) {
  const z = new V(...d).normalize(), x = new V(...up).cross(z); if (x.lengthSq() < 1e-8) x.set(1, 0, 0); x.normalize();
  const y = new V().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p[0], p[1], p[2]);
}

// normals for a triangle soup: faces meeting at less than `deg` are smoothed, sharper edges stay hard.
// Returns indexed arrays with shared vertices where position and normal agree.
export function smoothSoup(P, deg = 35) {
  const nt = P.length / 9, FN = new Float32Array(nt * 3), cosT = Math.cos(deg * Math.PI / 180);
  for (let t = 0; t < nt; t++) {
    const o = t * 9, ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2], bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
    FN[t * 3] = ay * bz - az * by; FN[t * 3 + 1] = az * bx - ax * bz; FN[t * 3 + 2] = ax * by - ay * bx;   // area-weighted
  }
  const key = i => Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4);
  const groups = new Map();
  for (let i = 0; i < nt * 3; i++) { const k = key(i); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(i); }
  const unit = t => { const x = FN[t * 3], y = FN[t * 3 + 1], z = FN[t * 3 + 2], l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const OP = [], ON = [], OI = [], seen = new Map();
  for (let i = 0; i < nt * 3; i++) {
    const t = Math.floor(i / 3), u = unit(t); let nx = 0, ny = 0, nz = 0;
    for (const j of groups.get(key(i))) { const tj = Math.floor(j / 3), v = unit(tj); if (u[0] * v[0] + u[1] * v[1] + u[2] * v[2] >= cosT) { nx += FN[tj * 3]; ny += FN[tj * 3 + 1]; nz += FN[tj * 3 + 2]; } }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const k = key(i) + '|' + Math.round(nx * 100) + ',' + Math.round(ny * 100) + ',' + Math.round(nz * 100);
    let idx = seen.get(k);
    if (idx === undefined) { idx = OP.length / 3; seen.set(k, idx); OP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); ON.push(nx, ny, nz); }
    OI.push(idx);
  }
  return { P: OP, N: ON, I: OI };
}

// add a three.js BufferGeometry, transformed by m; smooth = angle in degrees to recompute normals (else the geometry's own)
export function add(md, mat, geo, m, smooth) {
  let g = geo;
  if (m) { g = g.clone(); g.applyMatrix4(m); }
  const flip = m ? m.determinant() < 0 : false;
  if (smooth != null || !g.attributes.normal) {
    const s = g.index ? g.toNonIndexed() : g, P = Array.from(s.attributes.position.array);
    if (flip) for (let i = 0; i < P.length; i += 9) for (let k = 0; k < 3; k++) { const a = P[i + 3 + k]; P[i + 3 + k] = P[i + 6 + k]; P[i + 6 + k] = a; }
    const r = smoothSoup(P, smooth ?? 35); md.add(mat, r.P, r.N, null, r.I); return md;
  }
  const P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index ? g.index.array : Array.from({ length: P.length / 3 }, (_, i) => i);
  md.add(mat, P, N, null, I, flip); return md;
}

// add a MeshData transformed by m (positions and normals)
export function addMesh(md, src, m) {
  const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3(), flip = m.determinant() < 0;
  for (const [k, q] of src.prims) {
    const P = q.P.slice(), N = q.N.slice();
    for (let i = 0; i < P.length; i += 3) { v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(m); P[i] = v.x; P[i + 1] = v.y; P[i + 2] = v.z; v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize(); N[i] = v.x; N[i + 1] = v.y; N[i + 2] = v.z; }
    md.add(k, P, N, q.T, q.I, flip);
  }
}

// rounded box w × h × d (x, y, z) with edge radius r, centred on the origin (k: segments per rounded edge)
export function rbox(w, h, d, r, k = 2) {
  r = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, P = [], N = [], I = [], rows = [], cols = [];
  for (let b = 0; b < 2; b++) for (let i = 0; i <= k; i++) rows.push([(b + i / k) * Math.PI / 2, b ? -1 : 1]);
  for (let q = 0; q < 4; q++) for (let i = 0; i <= k; i++) cols.push([(q + i / k) * Math.PI / 2, [1, -1, -1, 1][q], [1, 1, -1, -1][q]]);
  for (const [th, sy] of rows) for (const [ph, sx, sz] of cols) {
    const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    P.push(n[0] * r + sx * hx, n[1] * r + sy * hy, n[2] * r + sz * hz); N.push(...n);
  }
  const nc = cols.length, at = (i, j) => i * nc + (j % nc);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < nc; j++) { const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), e = at(i + 1, j + 1); I.push(a, b, c, b, e, c); }
  // the flat top and bottom between the four corners
  const cap = (i, y, ny) => { const o = P.length / 3; for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) { P.push(sx * hx, y, sz * hz); N.push(0, ny, 0); } if (ny > 0) I.push(o, o + 2, o + 1, o, o + 3, o + 2); else I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  cap(0, h / 2, 1); cap(0, -h / 2, -1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
  return g;
}
export const box = (md, mat, w, h, d, r, m, k) => add(md, mat, rbox(w, h, d, r, k), m);

// cylinder along local y (radius r, length h), placed by m; open: no caps
export const cylGeo = (r, h, n = 16, open = false, r2 = r) => new THREE.CylinderGeometry(r2, r, h, n, 1, open);
// a cylinder from point a to point b
export function cylAB(md, mat, a, b, r, n = 12, open = false, r2 = r) {
  const d = new V(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = d.length(), q = new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), d.clone().normalize());
  const m = new THREE.Matrix4().compose(new V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new V(1, 1, 1));
  return add(md, mat, cylGeo(r, l, n, open, r2), m);
}

// a polyline with rounded corners (bend radius br), as a list of THREE.Vector3
export function bent(points, br = 0.06, seg = 5) {
  const p = points.map(a => new V(...a)), out = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1], la = b.distanceTo(a), lc = b.distanceTo(c), rr = Math.min(br, la / 2, lc / 2);
    const s = b.clone().addScaledVector(a.clone().sub(b).normalize(), rr), e = b.clone().addScaledVector(c.clone().sub(b).normalize(), rr);
    for (let k = 0; k <= seg; k++) { const t = k / seg, u = 1 - t; out.push(new V(u * u * s.x + 2 * u * t * b.x + t * t * e.x, u * u * s.y + 2 * u * t * b.y + t * t * e.y, u * u * s.z + 2 * u * t * b.z + t * t * e.z)); }
  }
  out.push(p[p.length - 1]);
  return out;
}
// a tube through points (with bends), radius r: rings only where the path bends (frames by parallel transport)
export function tube(md, mat, points, r, br = 0.06, n = 10) {
  const pts = bent(points, br).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-5);
  const T = pts.map((p, i) => pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
  const s = new V(0, 1, 0); if (Math.abs(s.dot(T[0])) > 0.9) s.set(1, 0, 0);
  const G = pts.map((p, i) => {
    s.addScaledVector(T[i], -s.dot(T[i])).normalize(); const b = new V().crossVectors(T[i], s);
    return Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2, c = Math.cos(a) * r, d = Math.sin(a) * r; return [p.x + s.x * c + b.x * d, p.y + s.y * c + b.y * d, p.z + s.z * c + b.z * d]; });
  });
  sheet(md, mat, G, -1, true, false);
  for (const [p, d] of [[pts[0], T[0].clone().negate()], [pts[pts.length - 1], T[T.length - 1]]]) add(md, mat, new THREE.CircleGeometry(r, n), aim([p.x, p.y, p.z], [d.x, d.y, d.z]));
  return md;
}

// a 2D outline [[x,y], …] as a THREE.Shape (holes: list of outlines)
export function shape(pts, holes = []) {
  const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  return s;
}
// a rounded rectangle outline w × h centred on (cx, cy), corner radius r
export function rrect(w, h, r, cx = 0, cy = 0, seg = 4) {
  r = Math.min(r, w / 2, h / 2); const out = [];
  for (const [qx, qy, a0] of [[1, 1, 0], [-1, 1, 0.5], [-1, -1, 1], [1, -1, 1.5]])
    for (let i = 0; i <= seg; i++) { const a = (a0 + i / seg * 0.5) * Math.PI; out.push([cx + qx * (w / 2 - r) + Math.cos(a) * r, cy + qy * (h / 2 - r) + Math.sin(a) * r]); }
  return out;
}
export const circle = (r, n = 24, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * 2 * Math.PI) * r, cy + Math.sin(i / n * 2 * Math.PI) * r]);
// an extrusion of an outline along local z from 0 to depth, with an optional rounded bevel; placed by m
export function extrude(md, mat, pts, depth, bevel = 0, m, holes = [], smooth = 40, bseg = 2) {
  const g = new THREE.ExtrudeGeometry(shape(pts, holes), { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelOffset: -bevel * 0.9, bevelSegments: bseg, curveSegments: 6 });
  if (bevel > 0) g.translate(0, 0, bevel);
  return add(md, mat, g, m, smooth);
}
// a flat outline (facing +z), placed by m
export const flat = (md, mat, pts, m, holes = []) => add(md, mat, new THREE.ShapeGeometry(shape(pts, holes), 6), m, 10);
// a lathe round local y from a profile [[r, y], …] (n segments)
export const latheGeo = (prof, n = 32) => new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), n);

// a smooth sheet through a grid of points G[j][i] ([x,y,z]); normals by central differences.
// closeI/closeJ: the grid wraps in that direction. Faces point along (dG/dj × dG/di) times sign.
export function sheet(md, mat, G, sign = 1, closeI = false, closeJ = false) {
  const nj = G.length, ni = G[0].length, P = [], N = [], I = [], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const at = (j, i) => G[closeJ ? (j + nj) % nj : Math.max(0, Math.min(nj - 1, j))][closeI ? (i + ni) % ni : Math.max(0, Math.min(ni - 1, i))];
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    let du = sub(at(j, i + 1), at(j, i - 1)), dv = sub(at(j + 1, i), at(j - 1, i));
    if (Math.hypot(...du) < 1e-9) du = sub(at(j, i + 2), at(j, i - 2));
    if (Math.hypot(...dv) < 1e-9) dv = sub(at(j + 2, i), at(j - 2, i));
    const n = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]], l = Math.hypot(...n) || 1;
    P.push(...G[j][i]); N.push(n[0] / l * sign, n[1] / l * sign, n[2] / l * sign);
  }
  const id = (j, i) => (j % nj) * ni + (i % ni);
  for (let j = 0; j < (closeJ ? nj : nj - 1); j++) for (let i = 0; i < (closeI ? ni : ni - 1); i++) {
    const a = id(j, i), b = id(j, i + 1), c = id(j + 1, i), d = id(j + 1, i + 1);
    if (sign > 0) I.push(a, d, b, a, c, d); else I.push(a, b, d, a, d, c);
  }
  md.add(mat, P, N, null, I);
  return md;
}
// sweep a closed 2D profile [[a,b], …] along a path of points; a is along `side` (a direction per point or fixed), b along tangent × side
export function sweep(md, mat, path, prof, side = [1, 0, 0], closePath = false) {
  const G = path.map((p, j) => {
    const q = path[Math.min(path.length - 1, j + 1)], o = path[Math.max(0, j - 1)], t = new V(q[0] - o[0], q[1] - o[1], q[2] - o[2]).normalize();
    const s = new V(...(typeof side === 'function' ? side(j, p) : side)); s.addScaledVector(t, -s.dot(t)).normalize(); const b = new V().crossVectors(t, s);
    return prof.map(([a, c]) => [p[0] + s.x * a + b.x * c, p[1] + s.y * a + b.y * c, p[2] + s.z * a + b.z * c]);
  });
  let area = 0; for (let i = 0; i < prof.length; i++) { const p = prof[i], q = prof[(i + 1) % prof.length]; area += p[0] * q[1] - q[0] * p[1]; }
  return sheet(md, mat, G, area > 0 ? -1 : 1, true, closePath);   // counter-clockwise profiles face outwards
}
