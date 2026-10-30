// Light aircraft on screen, in real size from the specs in sim/data/planes.js and in the physics' body frame (sim/physics/plane.js:
// +z forward, +y up, +x left, origin in the centre of mass): a fuselage lofted from cross-sections with the windows cut into it,
// wings with a real airfoil, taper and dihedral, the struts of the high-wing trainer, the tail, and the control surfaces on their
// hinges (ailerons, flaps, elevator with its trim tab, rudder) moving as the physics moves them; the propeller (a blurred disc when
// it turns fast) and the spinner; the gear legs with the wheels in their fairings, compressing and spinning, the nose wheel
// steering; the registration painted on; nav lights, beacon, strobes and the landing light; the cockpit with a live instrument
// panel, seats, yokes or stick and the pilot. Also Glows (lights as glowing points that stay visible far away) and Rings (the
// hoops of a flight).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, U } from './gfx.js';

const D2R = Math.PI / 180, cl = (v, a, b) => v < a ? a : v > b ? b : v, sm = (a, b, x) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _fw = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);

// how each plane looks. fus: cross-sections [z, half width, top, bottom] from the nose back; nTop/nBot: how square the upper and
// lower halves are (2 = round); chord: [x from the centre, chord] along the half span; airfoil: NACA [camber, its place, thickness]
export const LOOK = {
  make: { reg: 'LN-TMK', body: '#f4f2ec', trim: '#1d4f91', trim2: '#d8a530', seat: '#6a5a48', blades: '#26282a', tips: '#e9e6dd', shirt: '#3f6f9a',
    high: true, dihedral: 1.7, airfoil: [0.02, 0.4, 0.12], chord: [[0, 1.62], [2.6, 1.62], [5.5, 1.13]], hinge: 0.74, nose: 0.18, main: 0.2, spinner: [0.16, 0.34],
    fus: [[1.84, 0.29, 0.36, -0.16], [1.66, 0.42, 0.42, -0.35], [1.36, 0.5, 0.45, -0.52], [1.05, 0.55, 0.46, -0.62], [0.47, 0.57, 0.97, -0.7], [-0.4, 0.57, 0.97, -0.72],
      [-1.1, 0.53, 0.96, -0.66], [-1.6, 0.45, 0.79, -0.53], [-2.6, 0.31, 0.55, -0.33], [-3.6, 0.2, 0.43, -0.14], [-4.6, 0.11, 0.34, 0.02], [-5.36, 0.04, 0.27, 0.15]], nTop: 3, nBot: 4,
    htail: { c0: 1.15, c1: 0.85, hinge: -4.85 }, fin: { y0: 0.3, y1: 1.78, le0: -3.75, le1: -4.62, te: -5.34, hinge: -4.92, dorsal: -2.9 },
    eye: [0.27, 0.6, 0.06], panel: { z: 0.9, y0: 0.0, y1: 0.43, w: 1.04 }, reg2: [-1.75, -3.35, -0.2, 0.1] },
  falk: { reg: 'LN-FKA', body: '#f3f1ec', trim: '#c8352a', trim2: '#1f2226', seat: '#2a2c30', blades: '#2a2c2e', tips: '#e9e6dd', shirt: '#8a3a2a',
    high: false, dihedral: 3.5, airfoil: [0.02, 0.3, 0.135], chord: [[0, 1.43], [3.85, 1.43]], hinge: 0.75, nose: 0.17, main: 0.19, spinner: [0.15, 0.36],
    fus: [[1.62, 0.26, 0.22, -0.19], [1.42, 0.38, 0.3, -0.36], [1.06, 0.46, 0.34, -0.47], [0.55, 0.5, 0.36, -0.52], [-0.3, 0.52, 0.36, -0.54], [-1.15, 0.48, 0.4, -0.5],
      [-1.45, 0.46, 0.56, -0.47], [-2.4, 0.32, 0.44, -0.3], [-3.4, 0.18, 0.3, -0.08], [-4.1, 0.08, 0.21, 0.07], [-4.38, 0.03, 0.17, 0.12]], nTop: 2.4, nBot: 3,
    htail: { c0: 0.8, c1: 0.8, hinge: -4.06 }, fin: { y0: 0.18, y1: 1.38, le0: -3.2, le1: -3.86, te: -4.42, hinge: -4.06, dorsal: -2.6 },
    canopy: [[0.55, 0.36], [0.3, 0.63], [0.0, 0.8], [-0.35, 0.86], [-0.75, 0.83], [-1.15, 0.72], [-1.45, 0.56]],
    eye: [0.26, 0.56, -0.42], panel: { z: 0.47, y0: -0.06, y1: 0.33, w: 0.92 }, reg2: [-1.55, -2.85, -0.17, 0.03] },
};
// club planes parked at the apron: another registration and other colours on the same models
export const LIVERIES = [
  { id: 'make', reg: 'LN-NFT', trim: '#7a1f2b', trim2: '#c9c3b5' },
  { id: 'make', reg: 'LN-BEV', trim: '#2f6b3a', trim2: '#e2c25a' },
  { id: 'falk', reg: 'LN-RVS', body: '#e7d7a8', trim: '#20335c', trim2: '#b8312a' },
];

const MATS = new Map();
function mat(gfx, key, o, kind = 'std') {
  let m = MATS.get(key); if (m) return m;
  m = prep(kind === 'phys' ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o)); m.name = key;
  if (!o.transparent) gfx.shadowed(m);
  MATS.set(key, m); return m;
}
function materials(gfx, L) {
  const paint = c => mat(gfx, 'pp' + c, { color: c, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 }, 'phys');
  return {
    body: paint(L.body), trim: paint(L.trim), trim2: paint(L.trim2), tips: paint(L.tips),
    hole: mat(gfx, 'phole', { visible: false, transparent: true }),
    glass: mat(gfx, 'pglass', { color: '#3a4f5c', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
    dark: mat(gfx, 'pdark', { color: '#1c1e20', roughness: 0.6, metalness: 0.1 }), black: mat(gfx, 'pblack', { color: '#0c0d0e', roughness: 0.8 }),
    steel: mat(gfx, 'psteel', { color: '#c8ccd0', metalness: 1, roughness: 0.25 }), tyre: mat(gfx, 'ptyre', { color: '#141414', roughness: 0.9 }),
    hub: mat(gfx, 'phub', { color: '#b9bcbf', metalness: 0.6, roughness: 0.35 }),
    inner: mat(gfx, 'pinner', { color: '#8a857c', roughness: 0.9, side: THREE.BackSide }), floor: mat(gfx, 'pfloor', { color: '#3a3833', roughness: 0.95 }),
    seat: mat(gfx, 'pseat' + L.seat, { color: L.seat, roughness: 0.85 }), skin: mat(gfx, 'pskin', { color: '#d8a888', roughness: 0.7 }),
    shirt: mat(gfx, 'pshirt' + L.shirt, { color: L.shirt, roughness: 0.85 }),
    blade: prep(new THREE.MeshStandardMaterial({ color: L.blades, roughness: 0.45, metalness: 0.4, transparent: true, opacity: 1, side: THREE.DoubleSide })),
    bladeTip: prep(new THREE.MeshStandardMaterial({ color: '#e8c33a', roughness: 0.5, transparent: true, opacity: 1, side: THREE.DoubleSide })),
    spinner: paint(L.spinCol || L.trim),
  };
}

// ------------------------------------------------------------------ geometry helpers
// collects pieces per material and merges them into one mesh per material
class Parts {
  constructor() { this.map = new Map(); }
  add(m, geo, pos, rot, scl) {
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (pos || rot || scl) { _m.compose(pos || _v.set(0, 0, 0), rot ? _q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], rot[3] || 'XYZ')) : _q.identity(), scl || _w.set(1, 1, 1)); g = g.clone(); g.applyMatrix4(_m); }
    let L = this.map.get(m); if (!L) this.map.set(m, L = []); L.push(g); return this;
  }
  box(m, w, h, d, x, y, z, rot) { return this.add(m, new THREE.BoxGeometry(w, h, d), new THREE.Vector3(x, y, z), rot); }
  cyl(m, r0, r1, h, x, y, z, rot, seg = 12) { return this.add(m, new THREE.CylinderGeometry(r0, r1, h, seg), new THREE.Vector3(x, y, z), rot); }
  // a rod from a to b ([x,y,z]) with an elliptical section: rx across, rz along the flight direction
  rod(m, a, b, rx, rz, seg = 10) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(), g = new THREE.CylinderGeometry(1, 1, L, seg);
    g.scale(rx, 1, rz); g.applyQuaternion(_q.setFromUnitVectors(_up, d.normalize())); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return this.add(m, g);
  }
  build(group, cast = true) {
    for (const [m, L] of this.map) { const g = mergeGeometries(L, false); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast && !m.transparent; mesh.receiveShadow = !m.transparent; if (m.transparent) mesh.renderOrder = 3; group.add(mesh); }
    this.map.clear(); return group;
  }
}
// a grid of points (rows × columns, each [x,y,z]) into an indexed geometry; group(i, j) gives the material index of each quad
function grid(rows, close, group, flip) {
  const nr = rows.length, nc = rows[0].length, P = [], UV = [], byMat = new Map();
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { P.push(...rows[i][j]); UV.push(j / (nc - 1), i / (nr - 1)); }
  const cols = close ? nc : nc - 1;
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < cols; j++) {
    const j1 = (j + 1) % nc, a = i * nc + j, b = i * nc + j1, c = (i + 1) * nc + j, d = (i + 1) * nc + j1, k = group ? group(i, j) : 0;
    let L = byMat.get(k); if (!L) byMat.set(k, L = []);
    if (flip) L.push(a, c, b, b, c, d); else L.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(), I = []; let start = 0;
  for (const [k, L] of [...byMat].sort((x, y) => x[0] - y[0])) { I.push(...L); g.addGroup(start, L.length, k); start += L.length; }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
// a cap over a closed ring of points (a fan from its middle)
function cap(ring, flip) {
  const c = [0, 0, 0]; for (const p of ring) { c[0] += p[0] / ring.length; c[1] += p[1] / ring.length; c[2] += p[2] / ring.length; }
  const P = [...c], I = []; ring.forEach(p => P.push(...p));
  for (let i = 0; i < ring.length; i++) { const a = 1 + i, b = 1 + (i + 1) % ring.length; if (flip) I.push(0, b, a); else I.push(0, a, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// monotone cubic interpolation through (xs, ys) (xs increasing)
function pchip(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) { if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; } const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
// NACA 4-digit airfoil from x0 to x1 (shares of the chord): [x, y] round the outline, upper side from x1 to the nose, lower back to x1
function airfoil([mc, pc, tc], x0 = 0, x1 = 1, n = 12) {
  const yt = x => 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = x => mc ? (x < pc ? mc / (pc * pc) * (2 * pc * x - x * x) : mc / ((1 - pc) ** 2) * (1 - 2 * pc + 2 * pc * x - x * x)) : 0;
  const xs = []; for (let i = 0; i <= n; i++) { const u = i / n; xs.push(x0 + (x1 - x0) * (x0 === 0 ? (1 - Math.cos(u * Math.PI / 2)) : u)); }
  const up = xs.map(x => [x, yc(x) + yt(x)]), lo = xs.map(x => [x, yc(x) - yt(x)]);
  const out = []; for (let i = up.length - 1; i >= 0; i--) out.push(up[i]); for (let i = (x0 === 0 ? 1 : 0); i < lo.length; i++) out.push(lo[i]);
  return out;
}
// a frame for a hinged part: origin p0, X along the hinge from p0 to p1, Y up-ish; returns the matrix and its inverse
function hingeFrame(p0, p1, upHint = _up) {
  const X = new THREE.Vector3().subVectors(p1, p0).normalize(), Y = upHint.clone().addScaledVector(X, -upHint.dot(X)).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
  const M = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p0);
  return { M, inv: M.clone().invert() };
}
// a group placed by the frame M, with a child that turns (the deflection) and holds the geometry made in body coordinates
function hinged(parent, frame, pieces) {
  const pivot = new THREE.Group(); frame.M.decompose(pivot.position, pivot.quaternion, pivot.scale); parent.add(pivot);
  const turn = new THREE.Group(); pivot.add(turn);
  for (const [m, g] of pieces) { g.applyMatrix4(frame.inv); const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; turn.add(mesh); }
  return turn;
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ------------------------------------------------------------------ the model
export function buildPlane(gfx, spec, opts = {}) {
  const L = Object.assign({}, LOOK[spec.id] || LOOK.make, opts.look || {}), M = materials(gfx, L), wg = spec.wing, half = wg.span / 2;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const P = new Parts(), out = { root, body, surf: {}, lights: [], gear: [] };
  // ---- the fuselage: a loft through the cross-sections
  const st = L.fus.slice().reverse(), zs = st.map(s => s[0]), HW = pchip(zs, st.map(s => s[1])), YT = pchip(zs, st.map(s => s[2])), YB = pchip(zs, st.map(s => s[3]));
  const zF = L.fus[0][0], zT = L.fus[L.fus.length - 1][0], NC = 48;
  const ring = z => { const hw = HW(z), yt = YT(z), yb = YB(z), yc = (yt + yb) / 2, hh = (yt - yb) / 2, R = [];
    for (let j = 0; j < NC; j++) { const th = j / NC * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), n = c >= 0 ? L.nTop : L.nBot;
      R.push([hw * Math.sign(s) * Math.abs(s) ** (2 / n), yc + hh * Math.sign(c) * Math.abs(c) ** (2 / n), z]); }
    return R; };
  // the side of the fuselage at height y (for decals): x on the outline
  const sideX = (z, y) => { const hw = HW(z), yt = YT(z), yb = YB(z), yc = (yt + yb) / 2, hh = (yt - yb) / 2, n = y >= yc ? L.nTop : L.nBot, u = Math.min(1, Math.abs(y - yc) / hh); return hw * Math.pow(1 - u ** n, 1 / n); };
  const rowsZ = []; for (let z = zF; z > zT; z -= z > 0.2 ? 0.07 : z > -1.8 ? 0.1 : 0.16) rowsZ.push(z); rowsZ.push(zT);
  const rows = rowsZ.map(ring);
  // paint: 0 body, 1 trim, 2 trim2, 3 glass, 4 dark
  const stripe = L.high ? z => 0.12 + cl(-z - 0.3, 0, 4) * 0.035 : z => -0.05 + cl(-z + 0.2, 0, 4) * 0.06;
  // the windows follow the loft's own lines (th: the angle round the section from the top), so their edges are clean
  const paint = (x, y, z, th) => {
    const hw = HW(z), yt = YT(z), ax = Math.abs(x), a = Math.min(th, Math.PI * 2 - th) / D2R;
    if (L.high) {
      if (z < 1.05 && z > 0.47 && a < 79) return 3;                                                                                // windscreen
      if (z < 0.47 && z > -1.12 && a > 26 && a < 79 && !(z < -0.2 && z > -0.3) && !(z < 0.47 && z > 0.4)) return 3;               // side windows
      if (z < -1.18 && z > -1.72 && a < 50) return 3;                                                                              // rear window
      if (z > 1.78) return 4;
    } else {
      if (z > 1.58) return 4;
      if (z > 0.95) return y > yt - 0.03 && ax < 0.16 ? 4 : 1;                                                                     // red cowl, dark stripe on top
      if (z > 0.5 && y > yt - 0.03) return 4;
      if (z < 0.5 && z > -1.42 && y > yt - 0.05) return ax < hw * 0.9 ? 5 : 4;                                                       // the cockpit opening under the canopy, a dark coaming
    }
    return 0;
  };
  const quadPaint = R => (i, j) => { const a = R[i][j], b = R[i + 1][(j + 1) % NC]; return paint((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, (j + 0.5) / NC * Math.PI * 2); };
  const fg = grid(rows, true, quadPaint(rows), false);
  const fm = new THREE.Mesh(fg, [M.body, M.trim, M.trim2, M.glass, M.dark, M.hole]); fm.castShadow = true; fm.receiveShadow = true; body.add(fm);
  // the cowling's front round the spinner, with the two air inlets; the tail's end
  P.add(M.body, cap(rows[0], true)).add(M.body, cap(rows[rows.length - 1], false));
  for (const sd of [1, -1]) { const inl = new THREE.CircleGeometry(L.high ? 0.085 : 0.065, 16); inl.scale(1, L.high ? 0.62 : 1, 1); inl.translate(sd * (L.high ? 0.17 : 0.15), (spec.prop.y ?? 0) + (L.high ? 0.12 : 0.02), zF + 0.004); P.add(M.black, inl); }
  // the cheat lines: thin strips laid on the skin along both sides
  const band = (m, z0, z1, lo, hi) => { for (const sd of [1, -1]) { const R = []; for (let z = z0; z >= z1; z -= 0.08) R.push([hi(z), (lo(z) + hi(z)) / 2, lo(z)].map(y => [sd * (sideX(z, y) + 0.003), y, z])); P.add(m, grid(R, false, null, sd < 0)); } };
  if (L.high) { band(M.trim, 1.62, -4.7, z => stripe(z) - 0.05, z => stripe(z) + 0.05); band(M.trim2, 1.6, -4.6, z => stripe(z) - 0.085, z => stripe(z) - 0.06); }
  else { band(M.trim, 0.94, -3.9, z => stripe(z) - 0.05, z => stripe(z) + 0.05); band(M.trim2, 0.92, -3.8, z => stripe(z) - 0.08, z => stripe(z) - 0.06); }
  // the cabin's inside: the same loft a little smaller, seen from within
  { const zc0 = L.high ? 1.0 : 0.5, zc1 = L.high ? -1.7 : -1.4, sel = rows.filter((r, i) => rowsZ[i] < zc0 && rowsZ[i] > zc1), inner = sel.map(r => r.map(([x, y, z]) => [x * 0.95, y * 0.97 + 0.01, z]));
    const ig = grid(inner, true, (i, j) => { const k = quadPaint(sel)(i, j); return k === 3 || k === 5 ? 1 : 0; }, false), im = new THREE.Mesh(ig, [M.inner, M.hole]); im.receiveShadow = true; body.add(im); }
  // ---- the canopy (the low-wing plane): a bubble on the cockpit sills
  if (L.canopy) {
    const cz = L.canopy.map(c => c[0]).reverse(), CT = pchip(cz, L.canopy.map(c => c[1]).reverse()), z0 = L.canopy[0][0], z1 = L.canopy[L.canopy.length - 1][0], cr = [];
    for (let z = z0; z >= z1 - 1e-6; z -= 0.06) { const base = Math.max(YT(z) - 0.01, 0.35), top = Math.max(CT(z), base), w = HW(z) * 0.94, r = [];
      for (let k = 0; k <= 16; k++) { const ph = -Math.PI / 2 + k / 16 * Math.PI; r.push([w * Math.sin(ph), base + (top - base) * Math.cos(ph) ** 0.8, z]); } cr.push(r); }
    P.add(M.glass, grid(cr, false, null, false));
    // the frame: a bow behind the windscreen and the rails along the sills
    const bz = 0.28, bb = Math.max(YT(bz), 0.35), bt = CT(bz), bw = HW(bz) * 0.95, pts = []; for (let k = 0; k <= 12; k++) { const ph = -Math.PI / 2 + k / 12 * Math.PI; pts.push(new THREE.Vector3(bw * Math.sin(ph), bb + (bt - bb) * Math.cos(ph) ** 0.8, bz)); }
    P.add(M.dark, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.018, 5, false));
  }
  // ---- wings: a loft of the airfoil along the half span with the taper and dihedral; flaps and ailerons on their hinges
  const CH = pchip(L.chord.map(c => c[0]), L.chord.map(c => c[1])), tg = Math.tan(L.dihedral * D2R), af = L.airfoil, xh = L.hinge;
  const wingPt = (sd, x, u, v) => { const c = CH(x); return [sd * x, wg.y + v * c + x * tg, wg.z + 0.25 * c - u * c]; };     // u along the chord from the nose, v up
  const section = (sd, x, x0, x1, n) => airfoil(af, x0, x1, n).map(([u, v]) => wingPt(sd, x, u, v));
  const fl = (wg.flapSpan ?? 0.5) * half, a0 = (wg.ailSpan?.[0] ?? 0.55) * half, a1 = (wg.ailSpan?.[1] ?? 0.98) * half, xr = L.high ? 0 : 0.42, xf = L.high ? 0.58 : HW(wg.z) + 0.02;
  const spanRows = (x0, x1, n) => { const r = []; for (let i = 0; i <= n; i++) r.push(x0 + (x1 - x0) * i / n); return r; };
  const tipColor = L.high ? M.body : M.trim;
  for (const sd of [1, -1]) {
    // the main box: full chord where nothing moves, up to the hinge where a flap or an aileron sits behind it
    const segs = [[xr, xf, 1], [xf, fl, xh], [fl, a0, 1], [a0, a1, xh], [a1, half - 0.08, 1]];
    for (const [s0, s1, x1] of segs) { if (s1 <= s0) continue; const r = spanRows(s0, s1, Math.max(1, Math.round((s1 - s0) / 0.5))).map(x => section(sd, x, 0, x1, 14)); P.add(s0 >= a1 ? tipColor : M.body, grid(r, true, null, sd < 0)); }
    // the tip: a rounded end
    { const xs = [half - 0.08, half - 0.03, half], sc = [1, 0.7, 0.15], r = xs.map((x, k) => section(sd, x, 0, 1, 14).map(([px, py, pz]) => { const c = wingPt(sd, x, 0.35, 0); return [px, c[1] + (py - c[1]) * sc[k], c[2] + (pz - c[2]) * (0.6 + 0.4 * sc[k])]; }));
      P.add(tipColor, grid(r, true, null, sd < 0)).add(tipColor, cap(r[2], sd < 0)); }
    // close the wing behind the hinge where a flap or an aileron ends (seen when they move)
    for (const [x, f] of [[fl, sd > 0], [a0, sd < 0], [a1, sd > 0], [xf, sd < 0]]) P.add(M.body, cap(section(sd, x, xh, 1, 8), f));
    // the moving surfaces: built in body coordinates, then hung on their hinge lines
    const surface = (s0, s1, key) => {
      const r = spanRows(s0, s1, 3).map(x => section(sd, x, xh, 1, 8)), g = grid(r, true, null, sd < 0), caps = [cap(r[0], sd > 0), cap(r[r.length - 1], sd < 0)];
      const h0 = new THREE.Vector3(...wingPt(sd, s0, xh, 0)), h1 = new THREE.Vector3(...wingPt(sd, s1, xh, 0)), up = new THREE.Vector3(-sd * tg, 1, 0).normalize();
      const fr = sd > 0 ? hingeFrame(h0, h1, up) : hingeFrame(h1, h0, up);
      out.surf[key] = hinged(body, fr, [[M.body, mergeGeometries([g.toNonIndexed(), ...caps.map(c => c.toNonIndexed())].map(x => { x.deleteAttribute('uv'); return x; }))]]);
    };
    surface(xf + 0.01, fl - 0.01, sd > 0 ? 'flapL' : 'flapR');
    surface(a0 + 0.01, a1 - 0.01, sd > 0 ? 'ailL' : 'ailR');
    // the struts of the high wing, with a jury strut; the low wing's root fairing
    if (L.high) {
      const xs = half * 0.52, top = wingPt(sd, xs, 0.3, -0.03), foot = [sd * (HW(-0.05) - 0.04), -0.4, -0.05];
      P.rod(M.body, foot, [top[0], top[1] - 0.02, top[2] - 0.02], 0.022, 0.06);
      const mid = [foot[0] + (top[0] - foot[0]) * 0.55, foot[1] + (top[1] - foot[1]) * 0.55, -0.04], wj = wingPt(sd, xs * 0.6, 0.3, -0.03);
      P.rod(M.body, mid, [wj[0], wj[1] - 0.01, wj[2]], 0.01, 0.025, 6);
    }
    // nav light at the tip (red to the left, green to the right) with a strobe beside it
    const tip = wingPt(sd, half - 0.01, 0.12, 0);
    out.lights.push({ kind: sd > 0 ? 'red' : 'green', at: new THREE.Vector3(tip[0] + sd * 0.02, tip[1], tip[2] + 0.02) });
    out.lights.push({ kind: 'strobe', at: new THREE.Vector3(tip[0] + sd * 0.02, tip[1] + 0.02, tip[2] - 0.2) });
    const nl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), lightMat(sd > 0 ? '#ff3020' : '#30ff60')); nl.position.copy(out.lights[out.lights.length - 2].at); body.add(nl); out[sd > 0 ? 'navL' : 'navR'] = nl;
  }
  // the landing light in the left wing's leading edge
  { const p = wingPt(1, L.high ? 1.6 : 1.2, 0.0, 0); out.lights.push({ kind: 'landing', at: new THREE.Vector3(p[0], p[1], p[2] + 0.03) }); const lm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.02), lightMat('#fff6e0')); lm.position.copy(out.lights[out.lights.length - 1].at); body.add(lm); out.landMesh = lm; }
  // ---- the tail: stabiliser and elevator (with the trim tab), fin and rudder
  { const ht = spec.htail, T = L.htail, hs = ht.span / 2, sym = [0, 0, 0.1], hc = x => T.c0 + (T.c1 - T.c0) * x / hs, hp = (x, u, v) => { const c = hc(x); return [x, ht.y + v * c, ht.z + 0.25 * c - u * c]; };
    const tailSec = (sd, x, part) => { const c = hc(x), zle = ht.z + 0.25 * c; return airfoil(sym, 0, 1, 10).map(([u, v]) => { const z = zle - u * c; return [sd * x, ht.y + v * c, part === 'fix' ? Math.max(z, T.hinge) : Math.min(z, T.hinge)]; }); };
    for (const sd of [1, -1]) {
      const xs = spanRows(0, hs, 4), fix = xs.map(x => tailSec(sd, x, 'fix')), mov = xs.map(x => tailSec(sd, x, 'mov'));
      P.add(M[L.high ? 'body' : 'trim'], grid(fix, true, null, sd < 0)).add(M[L.high ? 'body' : 'trim'], cap(fix[fix.length - 1], sd < 0));
      const h0 = new THREE.Vector3(0, ht.y, T.hinge), h1 = new THREE.Vector3(sd * hs, ht.y, T.hinge), fr = sd > 0 ? hingeFrame(h0, h1) : hingeFrame(h1, h0);
      const pieces = [[M[L.high ? 'body' : 'trim'], (() => { const g = grid(mov, true, null, sd < 0).toNonIndexed(), c = cap(mov[mov.length - 1], sd < 0).toNonIndexed(); g.deleteAttribute('uv'); c.deleteAttribute('uv'); return mergeGeometries([g, c]); })()]];
      out.surf[sd > 0 ? 'elevL' : 'elevR'] = hinged(body, fr, pieces);
    }
    // the trim tab in the right elevator's trailing edge (in the elevator's own frame)
    const T0 = hingeFrame(new THREE.Vector3(-hs, ht.y, T.hinge), new THREE.Vector3(0, ht.y, T.hinge)), tp = new THREE.Group();
    tp.position.set(-0.75, ht.y, ht.z - 0.75 * hc(0.75) + 0.12).applyMatrix4(T0.inv); out.surf.elevR.add(tp); out.surf.tab = tp;
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.014, 0.12), M[L.high ? 'body' : 'trim']); tab.position.z = -0.06; tp.add(tab);
  }
  { const F = L.fin, vt = spec.vtail, finSec = (y, part) => { const k = (y - F.y0) / (F.y1 - F.y0), le = F.le0 + (F.le1 - F.le0) * k, te = F.te + (y > F.y1 - 0.25 ? (y - (F.y1 - 0.25)) * 0.4 : 0), c = le - te;
      return airfoil([0, 0, 0.1], 0, 1, 10).map(([u, v]) => [v * c * 0.9, y, le - u * c]).map(p => [p[0], p[1], part === 'fix' ? Math.max(p[2], F.hinge) : Math.min(p[2], F.hinge)]); };
    const ys = spanRows(F.y0 - 0.12, F.y1, 5), fix = ys.map(y => finSec(y, 'fix')), mov = ys.map(y => finSec(y, 'mov'));
    const fc = L.high ? M.body : M.trim;
    P.add(fc, grid(fix, true, null, true)).add(fc, cap(fix[fix.length - 1], true));
    // the dorsal fin: a thin fillet from the tail cone up to the fin's leading edge
    { const pts = [[0, YT(F.dorsal) - 0.02, F.dorsal], [0, F.y0 + 0.18, F.le0 + 0.05], [0, YT(F.le0 + 0.3) - 0.02, F.le0 + 0.3]], s = new THREE.Shape(); s.moveTo(pts[0][2], pts[0][1]); s.lineTo(pts[1][2], pts[1][1]); s.lineTo(F.le0 - 0.3, F.y0 + 0.05); s.lineTo(pts[2][2], pts[2][1]);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(0.015, 0, 0); P.add(fc, g); }
    if (L.high) { const sg = ys.slice(3).map(y => finSec(y, 'fix').map(([x, yy, z]) => [x * 1.01, yy, z])); P.add(M.trim, grid(sg.slice(0, 2), true, null, true)); }
    const h0 = new THREE.Vector3(0, F.y0 - 0.12, F.hinge), h1 = new THREE.Vector3(0, F.y1, F.hinge), X = new THREE.Vector3(1, 0, 0);
    // the rudder's frame: Y up the hinge, Z forward
    const Y = new THREE.Vector3().subVectors(h1, h0).normalize(), Z = new THREE.Vector3().crossVectors(X, Y), Mx = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(h0);
    const rg = grid(mov, true, null, true).toNonIndexed(), rc = cap(mov[mov.length - 1], true).toNonIndexed(); rg.deleteAttribute('uv'); rc.deleteAttribute('uv');
    out.surf.rudder = hinged(body, { M: Mx, inv: Mx.clone().invert() }, [[fc, mergeGeometries([rg, rc])]]);
    // the tail light at the rudder's foot, the beacon on top of the fin (under the belly on the low-wing plane)
    out.lights.push({ kind: 'white', at: new THREE.Vector3(0, F.y0 + 0.02, F.te - 0.03) });
    out.lights.push({ kind: 'beacon', at: L.high ? new THREE.Vector3(0, F.y1 + 0.07, F.le1 - 0.25) : new THREE.Vector3(0, YB(-1.2) - 0.05, -1.2) });
    const bm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lightMat('#ff2a1a')); bm.position.copy(out.lights[out.lights.length - 1].at); body.add(bm); out.beaconMesh = bm;
    const tm = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), lightMat('#fff6e6')); tm.position.copy(out.lights[out.lights.length - 2].at); body.add(tm); out.tailMesh = tm;
  }
  // ---- the propeller, the spinner and the disc it becomes at speed
  { const pr = spec.prop, R = pr.D / 2, [sr, sl] = L.spinner, g = new THREE.Group(); g.position.set(0, pr.y ?? 0, pr.z); body.add(g); out.prop = g;
    const prof = []; for (let i = 0; i <= 10; i++) { const u = i / 10; prof.push(new THREE.Vector2(sr * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.15 * u), u * sl)); }
    const spin = new THREE.LatheGeometry(prof, 18); spin.rotateX(Math.PI / 2); spin.translate(0, 0, -0.02);
    const sp = new THREE.Mesh(spin, M.spinner); sp.castShadow = true; g.add(sp);
    const blades = new Parts(), tips = new Parts();
    for (const sd of [1, -1]) {
      const rs = [], N = 12; for (let i = 0; i <= N; i++) rs.push(0.12 + (R - 0.12) * i / N);
      const sec = r => { const k = r / R, c = 0.07 + 0.1 * Math.sin(Math.PI * Math.min(1, k * 1.05)) ** 0.7, beta = Math.atan(1.55 / (2 * Math.PI * Math.max(r, 0.15))), t = c * 0.12, pts = [];
        for (let j = 0; j < 10; j++) { const a = j / 10 * Math.PI * 2, u = Math.cos(a) * c / 2, v = Math.sin(a) * t / 2; pts.push([u * Math.cos(beta) - v * Math.sin(beta), u * Math.sin(beta) + v * Math.cos(beta)]); }
        return pts.map(([u, v]) => [-sd * u, sd * r, v]); };
      const all = rs.map(sec), cut = all.length - 2;
      blades.add(M.blade, grid(all.slice(0, cut), true, null, sd < 0)); tips.add(M.bladeTip, grid(all.slice(cut - 1), true, null, sd < 0)).add(M.bladeTip, cap(all[all.length - 1], sd > 0));
    }
    const bg = new THREE.Group(); g.add(bg); blades.build(bg); tips.build(bg); out.blades = bg;
    // the disc: a soft, see-through ring of blur, darker towards the tips
    const tex = canvasTex(256, 256, (x, w) => { const gr = x.createRadialGradient(w / 2, w / 2, w * 0.06, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(30,30,30,0)'); gr.addColorStop(0.18, 'rgba(30,30,30,0.5)'); gr.addColorStop(0.8, 'rgba(40,40,40,0.55)'); gr.addColorStop(0.9, 'rgba(200,180,90,0.22)'); gr.addColorStop(1, 'rgba(40,40,40,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, 7); x.fill(); });
    const dm = prep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 40), dm); disc.renderOrder = 4; disc.position.z = 0.01; g.add(disc); out.disc = disc;
  }
  // ---- the landing gear: legs from the airframe to the axles, wheels in their fairings; the nose wheel turns with the rudder
  spec.gear.wheels.forEach((w, i) => {
    const nose = !!w.steer, r = nose ? L.nose : L.main, at = new THREE.Vector3(...w.at), axle0 = at.clone(); axle0.y += r;
    const top = nose ? new THREE.Vector3(0, YB(at.z - 0.12) + 0.08, at.z - 0.12) : new THREE.Vector3(Math.sign(at.x) * (L.high ? HW(at.z) - 0.1 : 0.72), L.high ? YB(at.z) + 0.06 : wg.y - 0.08, at.z);
    const unit = nose ? new THREE.CylinderGeometry(0.035, 0.035, 1, 8) : L.high ? new THREE.BoxGeometry(0.08, 1, 0.03) : new THREE.CylinderGeometry(0.03, 0.035, 1, 8);
    const leg = new THREE.Mesh(unit, nose ? M.steel : L.high ? M.body : M.dark); leg.castShadow = true; body.add(leg);
    const steer = new THREE.Group(), wheel = new THREE.Group(); body.add(steer); steer.add(wheel);
    const prof = []; for (let k = 12; k >= 0; k--) { const a = k / 12 * Math.PI; prof.push(new THREE.Vector2(r - 0.055 + Math.sin(a) * 0.055, Math.cos(a) * 0.065)); }
    const tyre = new THREE.LatheGeometry(prof, 20); tyre.rotateZ(Math.PI / 2); const tm = new THREE.Mesh(tyre, M.tyre); tm.castShadow = true; wheel.add(tm);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.05, r - 0.05, 0.1, 14), M.hub); hub.rotation.z = Math.PI / 2; wheel.add(hub);
    // the fairing over the wheel, open below, and the fork or the axle stub
    const pant = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), nose ? M.body : M[L.high ? 'body' : 'trim']); pant.scale.set(0.11, r * 1.05, r * 2.3); pant.position.set(0, -0.0, -r * 0.25); pant.castShadow = true; steer.add(pant);
    if (nose) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, r * 1.4, 0.05), M.steel); f.position.set(0.075, r * 0.6, 0); steer.add(f); const f2 = f.clone(); f2.position.x = -0.075; steer.add(f2); }
    out.gear.push({ i, nose, r, top, axle0, leg, steer, wheel, steerMax: (w.steer || 0) * D2R, len0: top.distanceTo(axle0) });
  });
  // ---- the cockpit: panel with live instruments, glareshield, seats, controls, the pilot
  { const pn = L.panel, eye = new THREE.Vector3(...L.eye); out.eye = eye;
    const cw = pn.w, ch = pn.y1 - pn.y0, canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * ch / cw);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const pm = prep(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.6 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), pm); face.position.set(0, (pn.y0 + pn.y1) / 2, pn.z); face.rotation.y = Math.PI; body.add(face);
    out.panel = { canvas, ctx: canvas.getContext('2d'), tex, mat: pm, face, w: canvas.width, h: canvas.height, t: 0 };
    drawPanel(out.panel, null, spec);
    P.box(M.dark, cw, ch + 0.02, 0.08, 0, (pn.y0 + pn.y1) / 2, pn.z + 0.045).box(M.dark, cw * 0.98, 0.04, 0.22, 0, pn.y1 + 0.01, pn.z - 0.06);
    P.box(M.floor, HW(0) * 1.8, 0.03, 2.0, 0, L.high ? -0.55 : -0.24, pn.z - 1.0).add(M.dark, cap(ring(pn.z + 0.05).map(([x, y, z]) => [x * 0.97, y * 0.97, z]), false));     // floor, firewall
    const seat = (x, z, w) => { P.box(M.seat, w, 0.12, 0.48, x, (L.high ? -0.42 : -0.17), z).box(M.seat, w, 0.62, 0.1, x, (L.high ? -0.08 : 0.1), z - 0.27, [L.high ? 0.12 : 0.32, 0, 0]); };
    seat(0.27, eye.z - 0.32, 0.44); seat(-0.27, eye.z - 0.32, 0.44); if (L.high) seat(0, eye.z - 1.15, 0.95);
    // the yokes (or the sticks), moved by the controls
    out.yokes = [];
    for (const sd of [1, -1]) {
      const yk = new THREE.Group(), x = sd * 0.27; body.add(yk);
      if (L.high) { yk.position.set(x, pn.y0 + 0.1, pn.z - 0.02); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), M.steel); sh.rotation.x = Math.PI / 2; sh.position.z = -0.1; yk.add(sh);
        const wh = new THREE.Group(); wh.position.z = -0.2; yk.add(wh); const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.03), M.black); wh.add(bar);
        for (const s of [1, -1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.035), M.black); h.position.set(s * 0.13, 0.04, 0); wh.add(h); } yk.userData.wheel = wh; }
      else { yk.position.set(x * 0.95, -0.23, pn.z - 0.42); const st2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 8), M.black); st2.position.y = 0.21; yk.add(st2); const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8), M.black); gr.position.y = 0.45; yk.add(gr); }
      out.yokes.push(yk);
    }
    // the pilot in the left seat (hidden in the cockpit view) with a headset
    const pilot = new THREE.Group(); pilot.position.set(0.27, 0, eye.z - 0.02); body.add(pilot);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.32, 4, 10), M.shirt); torso.position.set(0, eye.y - 0.5, -0.08); torso.scale.set(1, 1, 0.7); pilot.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), M.skin); head.position.set(0, eye.y + 0.03, 0); pilot.add(head);
    const hs = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 6, 16, Math.PI), M.dark); hs.position.set(0, eye.y + 0.05, 0); hs.rotation.y = Math.PI / 2; pilot.add(hs);
    for (const s of [1, -1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), M.dark); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.1, eye.y + 0.01, 0); pilot.add(cup); }
    out.pilot = pilot; out.head = [head, hs];
  }
  // ---- the registration on both sides of the rear fuselage (and the cheat line along it)
  { const [za, zb, y0, y1] = L.reg2, text = opts.reg || L.reg, col = L.high ? '#1a1c20' : L.trim2;
    const tex = canvasTex(512, 96, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = col; x.font = '700 92px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 4); });
    const dm = prep(new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    for (const sd of [1, -1]) {
      const R = []; for (let i = 0; i <= 8; i++) { const z = za + (zb - za) * i / 8, r = []; for (let k = 0; k <= 3; k++) { const y = y1 - (y1 - y0) * k / 3; r.push([sd * (sideX(z, y) + 0.004), y, z]); } R.push(r); }
      const g = grid(R, false, null, sd < 0), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getY(i), v = uv.getX(i); uv.setXY(i, sd > 0 ? u : 1 - u, 1 - v); }
      const m = new THREE.Mesh(g, dm); body.add(m);
    }
    out.regMat = dm;
  }
  P.build(body);
  body.traverse(o => { if (o.isMesh && o.material && o.material.transparent) o.castShadow = false; });
  out.mats = M; out.look = L;
  return out;
}
function lightMat(c) { return prep(new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.35), emissive: c, emissiveIntensity: 0, roughness: 0.3 })); }

// ------------------------------------------------------------------ the instrument panel (a canvas on the panel in the model)
// the airspeed arcs (kt) of a plane: white with flaps, green normal, yellow in smooth air only, up to Vne
export const speedArcs = spec => { const vne = spec.limits.vne, m = spec.id === 'make'; return { white: [m ? 40 : 44, 85], green: [m ? 48 : 50, vne * 0.79], yellow: [vne * 0.79, vne], vne }; };
// the six classic instruments (airspeed, attitude, altimeter / turn coordinator, heading, vertical speed), the rev counter and the flaps
export function drawPanel(pn, st, spec) {
  const x = pn.ctx, W = pn.w, H = pn.h, s = st || { kias: 0, pitch: 0, bank: 0, alt: 0, heading: 0, fpm: 0, rpm: 0, flaps: 0, beta: 0, stallWarn: false };
  x.fillStyle = '#2a2b2d'; x.fillRect(0, 0, W, H);
  const r = Math.min(H * 0.23, W * 0.075), g = r * 2.3, x0 = W * 0.1, y0 = H * 0.3, y1 = y0 + g * 0.95;
  const dial = (cx, cy) => { x.fillStyle = '#0d0d0e'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.strokeStyle = '#555'; x.lineWidth = 2; x.stroke(); };
  const needle = (cx, cy, a, l, w = 2.5, c = '#f2f0e8') => { x.strokeStyle = c; x.lineWidth = w; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(a) * l, cy - Math.cos(a) * l); x.stroke(); };
  const ticks = (cx, cy, n, a0, a1) => { x.strokeStyle = '#ddd'; x.lineWidth = 1.2; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; x.beginPath(); x.moveTo(cx + Math.sin(a) * r * 0.78, cy - Math.cos(a) * r * 0.78); x.lineTo(cx + Math.sin(a) * r * 0.92, cy - Math.cos(a) * r * 0.92); x.stroke(); } };
  // airspeed: 0 to about 1.1 Vne round the dial (a tick every 10 kt), the plane's white, green and yellow arcs and the red line at Vne
  { const cx = x0, cy = y0, S = speedArcs(spec), top = Math.ceil(S.vne * 1.1 / 20) * 20, A = v => (v / top) * Math.PI * 1.8; dial(cx, cy);
    for (const [[a, b], c] of [[S.white, '#e8e8e8'], [S.green, '#3bb34a'], [S.yellow, '#e8c33a'], [[S.vne, S.vne + 3], '#d9432f']]) { x.strokeStyle = c; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, r * 0.86, A(a) - Math.PI / 2, A(b) - Math.PI / 2); x.stroke(); }
    ticks(cx, cy, top / 10, 0, Math.PI * 1.8); needle(cx, cy, A(cl(s.kias, 0, top)), r * 0.8); }
  // attitude: sky and ground behind a fixed little aeroplane
  { const cx = x0 + g, cy = y0; x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip(); x.translate(cx, cy); x.rotate(-s.bank * D2R); const p = cl(s.pitch, -30, 30) * r / 30;
    x.fillStyle = '#3b7fc4'; x.fillRect(-r * 2, -r * 2 + p, r * 4, r * 2); x.fillStyle = '#8a5a2b'; x.fillRect(-r * 2, p, r * 4, r * 2); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(-r * 2, p); x.lineTo(r * 2, p); x.stroke();
    x.lineWidth = 1; for (const k of [-20, -10, 10, 20]) { const yy = p - k * r / 30; x.beginPath(); x.moveTo(-r * 0.25, yy); x.lineTo(r * 0.25, yy); x.stroke(); } x.restore();
    x.strokeStyle = '#f2c230'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - r * 0.55, cy); x.lineTo(cx - r * 0.15, cy); x.lineTo(cx, cy + r * 0.1); x.lineTo(cx + r * 0.15, cy); x.lineTo(cx + r * 0.55, cy); x.stroke(); x.strokeStyle = '#555'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); }
  // altimeter (feet: the long hand hundreds, the short thousands)
  { const cx = x0 + g * 2, cy = y0, ft = s.alt * 3.2808; dial(cx, cy); ticks(cx, cy, 9, 0, Math.PI * 1.8); needle(cx, cy, (ft % 1000) / 1000 * Math.PI * 2, r * 0.82); needle(cx, cy, (ft % 10000) / 10000 * Math.PI * 2, r * 0.5, 4); }
  // turn coordinator: the little aeroplane banks with the turn rate, the ball with the slip
  { const cx = x0, cy = y1; dial(cx, cy); x.save(); x.translate(cx, cy); x.rotate(cl(-s.bank * 0.6, -35, 35) * D2R); x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(-r * 0.6, 0); x.lineTo(r * 0.6, 0); x.moveTo(0, 0); x.lineTo(0, -r * 0.18); x.stroke(); x.restore();
    x.fillStyle = '#ddd'; x.beginPath(); x.arc(cx + cl(-s.beta, -12, 12) / 12 * r * 0.4, cy + r * 0.5, r * 0.1, 0, 7); x.fill(); }
  // heading: a compass card that turns
  { const cx = x0 + g, cy = y1; dial(cx, cy); x.save(); x.translate(cx, cy); x.rotate(-s.heading * D2R); x.fillStyle = '#fff'; x.font = `700 ${r * 0.32}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
    ['N', 'Ø', 'S', 'V'].forEach((l, i) => { x.save(); x.rotate(i * Math.PI / 2); x.fillText(l, 0, -r * 0.62); x.restore(); }); x.restore(); needle(cx, cy, 0, r * 0.45, 3, '#f2c230'); }
  // vertical speed: ±2000 ft/min, 0 at nine o'clock (a tick every 500)
  { const cx = x0 + g * 2, cy = y1; dial(cx, cy); ticks(cx, cy, 8, -Math.PI / 2 - Math.PI * 0.85, -Math.PI / 2 + Math.PI * 0.85); needle(cx, cy, -Math.PI / 2 + cl(s.fpm, -2000, 2000) / 2000 * Math.PI * 0.85, r * 0.8); }
  // rev counter and flaps, a radio stack and the stall lamp on the right
  { const cx = x0 + g * 3.15, cy = y0, red = spec ? spec.engine.rpm : 2700, A = v => -Math.PI * 0.75 + v / 3500 * Math.PI * 1.5; dial(cx, cy);
    x.strokeStyle = '#3bb34a'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, r * 0.86, A(2100) - Math.PI / 2, A(red) - Math.PI / 2); x.stroke(); x.strokeStyle = '#d9432f'; x.beginPath(); x.arc(cx, cy, r * 0.86, A(red) - Math.PI / 2, A(red + 60) - Math.PI / 2); x.stroke();
    needle(cx, cy, A(cl(s.rpm, 0, 3500)), r * 0.8); }
  { const cx = x0 + g * 3.15, cy = y1; x.fillStyle = '#111'; x.fillRect(cx - r * 0.3, cy - r, r * 0.6, r * 2); x.fillStyle = '#f2f0e8'; x.fillRect(cx - r * 0.3, cy - r + (s.flaps / 30) * r * 1.7, r * 0.6, r * 0.3); }
  const rx = x0 + g * 3.75, rw = W - rx - W * 0.03; x.fillStyle = '#151617'; x.fillRect(rx, H * 0.12, rw, H * 0.6);
  x.fillStyle = '#3cff8a'; x.font = `600 ${H * 0.07}px monospace`; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillText('COM 118.300', rx + 8, H * 0.22); x.fillText('NAV 112.500', rx + 8, H * 0.34); x.fillText('XPDR 7000', rx + 8, H * 0.46);
  x.fillStyle = s.stallWarn ? '#ff3b2a' : '#4a1c18'; x.beginPath(); x.arc(rx + rw - 18, H * 0.62, 9, 0, 7); x.fill();
  pn.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ a plane on screen
export class PlaneVisual {
  constructor(gfx, spec, opts = {}) {
    this.gfx = gfx; this.spec = spec; Object.assign(this, buildPlane(gfx, spec, opts));
    (opts.parent || gfx.scene).add(this.root);
    this.glow = opts.lights === false ? null : new Glows(gfx, 8);
    this.spin = 0; this.t = Math.random() * 5;
  }
  // the controls: surface deflections (deg), the propeller, the gear (compression m, spin rad, steering share), lights
  apply(c, prop, gear, L, dt) {
    const S = this.surf, d = D2R;
    S.ailL.rotation.x = -c.da * d; S.ailR.rotation.x = c.da * d; S.flapL.rotation.x = -c.flap * d; S.flapR.rotation.x = -c.flap * d;
    S.elevL.rotation.x = c.de * d; S.elevR.rotation.x = c.de * d; S.rudder.rotation.y = c.dr * d; S.tab.rotation.x = -(c.trimDeg || 0) * d * 1.5;
    this.prop.rotation.z = prop.angle;
    const blur = sm(900, 1700, prop.rpm); this.disc.material.opacity = blur * 0.75; this.mats.blade.opacity = this.mats.bladeTip.opacity = 1 - 0.88 * blur; this.blades.visible = blur < 0.9;
    this.mats.blade.depthWrite = this.mats.bladeTip.depthWrite = blur < 0.5; this.disc.rotation.z = -prop.angle * 0.02; this.disc.material.color.setScalar(1 - 0.85 * U.uNight.value);
    for (const g of this.gear) {
      const G = gear[g.i] || { x: 0, spin: 0, steer: 0 }, ax = _v.copy(g.axle0); ax.y += Math.max(0, G.x || 0);
      g.steer.position.copy(ax); g.steer.rotation.y = g.nose ? -(G.steer || 0) * g.steerMax : 0; g.wheel.rotation.x = G.spin || 0;
      const top = g.top, dir = _w.subVectors(ax, top), l = dir.length(); g.leg.position.copy(top).addScaledVector(dir, 0.5); g.leg.quaternion.setFromUnitVectors(_up, dir.normalize()); g.leg.scale.set(1, l, 1);
    }
    // the yokes: in and out with the elevator, turned with the ailerons (the sticks tilt)
    for (const y of this.yokes) { if (y.userData.wheel) { y.userData.wheel.position.z = -0.2 + cl(c.de / 25, -1, 1) * 0.06; y.userData.wheel.rotation.z = cl(-c.da / 18, -1, 1) * 0.9; } else { y.rotation.x = cl(c.de / 25, -1, 1) * 0.3; y.rotation.z = cl(-c.da / 20, -1, 1) * 0.3; } }
    // lights: nav lights and the tail light steady, the beacon and the strobes flash, the landing light
    this.t += dt; const t = this.t, on = L.nav, beacon = L.beacon && (t * 1.1 % 1) < 0.12, strobe = L.strobe && ((t % 1.3) < 0.05 || ((t - 0.15) % 1.3 + 1.3) % 1.3 < 0.05);
    this.navL.material.emissiveIntensity = on ? 4 : 0; this.navR.material.emissiveIntensity = on ? 4 : 0; this.tailMesh.material.emissiveIntensity = on ? 4 : 0;
    this.beaconMesh.material.emissiveIntensity = beacon ? 8 : 0.2; this.landMesh.material.emissiveIntensity = L.landing ? 6 : 0;
    if (this.glow) {
      this.root.updateMatrixWorld(true); const night = 0.35 + 0.65 * U.uNight.value;
      this.lights.forEach((l, i) => {
        _v.copy(l.at).applyMatrix4(this.root.matrixWorld);
        const k = l.kind, c = k === 'red' ? [1, 0.1, 0.06] : k === 'green' ? [0.1, 1, 0.25] : k === 'beacon' ? [1, 0.12, 0.05] : [1, 0.95, 0.85];
        let I = k === 'strobe' ? (strobe ? 9 : 0) : k === 'beacon' ? (beacon ? 6 : 0) : k === 'landing' ? (L.landing ? 7 : 0) : on ? 1.8 * night : 0, sz = k === 'landing' ? 0.9 : k === 'strobe' ? 0.8 : 0.34;
        if (k === 'landing' && I) { _w.subVectors(this.gfx.camera.position, _v).normalize(); _fw.set(0, 0, 1).applyQuaternion(this.root.quaternion); I *= 0.08 + Math.max(0, _w.dot(_fw)) ** 3; }
        this.glow.set(i, _v.x, _v.y, _v.z, c[0] * I, c[1] * I, c[2] * I, I > 0 ? sz : 0);
      });
      this.glow.flush();
    }
  }
  // follow the physics plane
  sync(p, o = {}, dt = 0) {
    this.root.position.set(p.pos.x, p.pos.y, p.pos.z); this.root.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    const rud = p.spec.controls.rudder;
    this.apply(p.ctl, { angle: p.propAngle, rpm: p.state.rpm }, p.gear.map(g => ({ x: g.x, spin: g.spin, steer: cl(p.ctl.dr / rud, -1, 1) })), o, dt);
    for (const h of this.head) h.visible = !o.cockpit;
  }
  // posed by hand (parked, or another player's plane): pos, q, d: {f flaps deg, r rpm, l lights bitmask}
  pose(pos, q, d = {}, dt = 0) {
    this.root.position.copy(pos); this.root.quaternion.copy(q);
    this.spin = (this.spin + (d.r || 0) / 60 * Math.PI * 2 * dt) % (Math.PI * 2);
    const l = d.l || 0;
    this.apply({ da: 0, de: d.e || 0, dr: 0, flap: d.f || 0, trimDeg: 0 }, { angle: this.spin, rpm: d.r || 0 }, d.g || [], { nav: !!(l & 1), beacon: !!(l & 2), strobe: !!(l & 4), landing: !!(l & 8) }, dt);
  }
  panelDraw(st) { drawPanel(this.panel, st, this.spec); }
  // parked for good (sim/render/airfield.js, after pose): without the cockpit's insides, the pilot and the propeller disc, and the
  // rest merged into one mesh per material, as nothing moves any more (some 60 draw calls become about 20); the decals stay apart
  bake() {
    const root = this.root, by = new Map(), list = [];
    for (const o of [this.pilot, this.panel.face, this.disc, ...this.yokes]) { o.removeFromParent(); o.traverse(c => c.isMesh && c.geometry.dispose()); }
    root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
    root.traverse(o => { if (o.isMesh && ![].concat(o.material).some(m => m.map)) list.push(o); });
    for (const o of list) {
      const g = o.geometry.clone().applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)), f = g.index ? g.toNonIndexed() : g, mats = [].concat(o.material);
      for (const { start, count, materialIndex } of f.groups.length ? f.groups : [{ start: 0, count: Infinity, materialIndex: 0 }]) {
        const m = mats[materialIndex]; if (!m || !m.visible) continue;
        const q = new THREE.BufferGeometry(); for (const k of ['position', 'normal']) { const a = f.attributes[k]; q.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * 3, Math.min(a.count, start + count) * 3), 3)); }
        let e = by.get(m); if (!e) by.set(m, e = { L: [], cast: false }); e.L.push(q); e.cast ||= o.castShadow;
      }
      o.removeFromParent(); o.geometry.dispose(); g.dispose(); f.dispose();
    }
    for (const [m, e] of by) { const mesh = new THREE.Mesh(mergeGeometries(e.L), m); mesh.castShadow = e.cast; mesh.receiveShadow = !m.transparent; if (m.transparent) mesh.renderOrder = 3; root.add(mesh); for (const q of e.L) q.dispose(); }
  }
  dispose() {
    this.root.parent && this.root.parent.remove(this.root); if (this.glow) this.glow.dispose();
    this.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
    this.panel.tex.dispose(); this.panel.mat.dispose(); this.disc.material.map.dispose(); this.disc.material.dispose(); this.regMat.map.dispose(); this.regMat.dispose();
    this.mats.blade.dispose(); this.mats.bladeTip.dispose();
    for (const m of [this.navL, this.navR, this.tailMesh, this.beaconMesh, this.landMesh]) m.material.dispose();
  }
}

// ------------------------------------------------------------------ glowing points
// lights as soft points (additive, in the see-through pass, behind solid things): size in metres, never smaller than a few pixels,
// so a runway light or a strobe is seen from kilometres away; colour in HDR (above 1 blooms)
export class Glows {
  constructor(gfx, n, opts = {}) {
    this.gfx = gfx; this.n = n;
    const g = this.geo = new THREE.BufferGeometry();
    this.P = new Float32Array(n * 3); this.C = new Float32Array(n * 3); this.S = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aCol', new THREE.BufferAttribute(this.C, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSize', new THREE.BufferAttribute(this.S, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 }, uMin: { value: opts.min ?? 2.5 }, uDim: { value: opts.dim ?? 0.35 }, uI: { value: 1 }, uFog: { value: 0.0001 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uScale; uniform float uMin; uniform float uDim; uniform float uI; uniform float uFog; attribute vec3 aCol; attribute float aSize; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(0.1, -mv.z), px = aSize * uScale / d;
          float k = px < uMin ? px / uMin : 1.0; gl_PointSize = aSize > 0.0 ? clamp(max(px, uMin), 1.0, 96.0) : 0.0;
          vC = aCol * uI * mix(uDim, 1.0, k) * exp(-uFog * d * 0.5); }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard; float a = exp(-r * r * 5.0) + 0.6 * exp(-r * r * 40.0); gl_FragColor = vec4(vC * a, 1.0); }` });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 9; (opts.scene || gfx.overlay).add(this.pts);
  }
  set(i, x, y, z, r, g, b, size) { this.P[i * 3] = x; this.P[i * 3 + 1] = y; this.P[i * 3 + 2] = z; this.C[i * 3] = r; this.C[i * 3 + 1] = g; this.C[i * 3 + 2] = b; this.S[i] = size; }
  flush(all = true) {
    const c = this.gfx.camera; this.mat.uniforms.uScale.value = (this.gfx.size ? this.gfx.size.H : 600) / (2 * Math.tan(c.fov * D2R / 2)); this.mat.uniforms.uFog.value = this.gfx.scene.fog ? this.gfx.scene.fog.density : 0;
    if (all) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aCol.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true; }
  }
  dispose() { this.pts.parent && this.pts.parent.remove(this.pts); this.geo.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ the rings of a flight
// glowing hoops facing along the course: the next one bright amber and pulsing with lamps running round it, the later ones pale,
// the last one (before the landing) green; passed rings are gone. A glowing point marks each ring's centre from afar.
export class Rings {
  constructor(gfx, G) {
    this.gfx = gfx; this.G = G; this.group = new THREE.Group(); gfx.scene.add(this.group);
    const mk = (c, e) => prep(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: e, roughness: 0.4, metalness: 0.1 }));
    this.mats = { next: mk('#ffb21e', 1.6), wait: mk('#cfe4ff', 0.35), last: mk('#4ee07a', 0.6) };
    this.meshes = G.map((g, i) => {
      const geo = new THREE.TorusGeometry(g.r, Math.max(0.9, g.r * 0.04), 10, 72), m = new THREE.Mesh(geo, i === G.length - 1 ? this.mats.last : this.mats.wait);
      m.position.set(g.x, g.y, g.z); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(g.nx, g.ny, g.nz)); m.castShadow = false; this.group.add(m); return m;
    });
    // a faint veil inside the next ring
    const tex = canvasTex(128, 128, (x, w) => { const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,190,60,0)'); gr.addColorStop(0.75, 'rgba(255,190,60,0.05)'); gr.addColorStop(0.97, 'rgba(255,200,80,0.4)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, w); });
    this.veil = new THREE.Mesh(new THREE.CircleGeometry(1, 48), prep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    this.veil.renderOrder = 8; gfx.overlay.add(this.veil);
    this.glow = new Glows(gfx, G.length + 16, { min: 3 });
    this.gi = 0; this.t = 0; this.set(0);
  }
  set(gi) {
    this.gi = gi;
    this.meshes.forEach((m, i) => { m.visible = i >= gi; m.material = i === gi ? this.mats.next : i === this.G.length - 1 ? this.mats.last : this.mats.wait; });
    const g = this.G[gi]; this.veil.visible = !!g; if (g) { this.veil.position.set(g.x, g.y, g.z); this.veil.quaternion.copy(this.meshes[gi].quaternion); this.veil.scale.setScalar(g.r); }
  }
  update(dt) {
    this.t += dt; const t = this.t, night = U.uNight.value, G = this.G, gi = this.gi;
    this.mats.next.emissiveIntensity = 1.4 + 0.8 * Math.sin(t * 5) + night * 1.5; this.mats.wait.emissiveIntensity = 0.3 + night * 0.9; this.mats.last.emissiveIntensity = 0.5 + night * 1.2;
    // the centre of every ring still to fly, and lamps chasing round the next one
    G.forEach((g, i) => { const on = i >= gi, I = i === gi ? 3 + 2 * night : 0.6 + night; this.glow.set(i, g.x, g.y, g.z, on ? 1 * I : 0, on ? (i === G.length - 1 ? 1 : 0.72) * I : 0, on ? (i === G.length - 1 ? 0.5 : 0.25) * I : 0, on ? (i === gi ? 2.2 : 1.4) : 0); });
    const g = G[gi], m = this.meshes[gi];
    for (let k = 0; k < 16; k++) {
      if (!g) { this.glow.set(G.length + k, 0, 0, 0, 0, 0, 0, 0); continue; }
      const a = k / 16 * Math.PI * 2, on = ((k - t * 9) % 16 + 16) % 16 < 3;
      _v.set(Math.cos(a) * g.r, Math.sin(a) * g.r, 0).applyQuaternion(m.quaternion).add(m.position);
      const I = on ? 5 + 3 * night : 1.2 + night; this.glow.set(G.length + k, _v.x, _v.y, _v.z, I, I * 0.75, I * 0.3, on ? 2.4 : 1.4);
    }
    this.glow.flush();
  }
  dispose() { this.gfx.scene.remove(this.group); this.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); this.gfx.overlay.remove(this.veil); this.veil.geometry.dispose(); this.veil.material.map.dispose(); this.veil.material.dispose(); this.glow.dispose(); for (const m of Object.values(this.mats)) m.dispose(); }
}
