// Boats on screen, in real size from the specs in sim/data/boats.js: a deep-V planing hull with chines and spray rails built from the
// same numbers as the physics (sim/physics/boat.js: body frame +z forward, +y up, +x left, origin in the centre of mass), the deck,
// console, windscreen, seats, rails and cleats, the outboards on the transom that steer, trim and spin their propellers, and
// navigation lights that come on at night. Also the spray off the chines and the propeller, the foam wake that lies on the waves,
// the race buoys and the arrow that points to the next gate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, U } from './gfx.js';
import { waveHeight } from '../physics/boat.js';

const D2R = Math.PI / 180, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// how each boat looks: hull colours (bottom, boot stripe, topsides, sheer stripe), deck, cushions, engine cowl, and the layout:
// fore/aft = where the foredeck starts and the aft deck ends (share of the length from the transom), sole = cockpit floor above the keel
const STYLE = {
  jolle: { metal: true, bottom: '#7d868c', boot: '#2a5a8a', top: '#8f989e', sheer: '#2a5a8a', deck: '#848d93', cushion: '#3b4a5a', cowl: '#2c2f33', cowl2: '#c8ccce',
    fore: 0.86, aft: 0, sole: 0.1, cap: 0.035, camber: 0.02 },
  motorbat: { bottom: '#1d2c48', boot: '#1d2c48', top: '#f3f1ea', sheer: '#1d2c48', deck: '#d3cfc4', cushion: '#c8ae80', cowl: '#f0f0ee', cowl2: '#1d2c48',
    fore: 0.6, aft: 0.07, sole: 0.38, cap: 0.06, camber: 0.05, console: { t: 0.47, w: 0.78, d: 0.72, h: 1.02 }, rail: true },
  racer: { bottom: '#161618', boot: '#f3f1ea', top: '#a8201a', sheer: '#f3f1ea', deck: '#eceae4', cushion: '#26262a', cowl: '#141416', cowl2: '#a8201a',
    fore: 0.54, aft: 0.2, sole: 0.42, cap: 0.05, camber: 0.07, dash: { t: 0.49 }, stripes: true },
};
const MATS = new Map();
function mat(gfx, key, o, kind = 'std') {
  let m = MATS.get(key); if (m) return m;
  m = prep(kind === 'phys' ? new THREE.MeshPhysicalMaterial(o) : new THREE.MeshStandardMaterial(o));
  if (!o.transparent) gfx.shadowed(m);
  MATS.set(key, m); return m;
}
function materials(gfx, id, st) {
  const gel = (c, k) => st.metal ? mat(gfx, 'al' + c, { color: c, metalness: 0.55, roughness: 0.42, side: THREE.DoubleSide }) : mat(gfx, k + c, { color: c, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.12, side: THREE.DoubleSide }, 'phys');
  return {
    bottom: gel(st.bottom, 'gb'), boot: gel(st.boot, 'gb'), top: gel(st.top, 'gt'), sheer: gel(st.sheer, 'gs'),
    deck: st.metal ? gel(st.deck, 'gd') : mat(gfx, 'deck' + st.deck, { color: st.deck, roughness: 0.82, side: THREE.DoubleSide }),
    liner: st.metal ? gel(st.deck, 'gd') : mat(gfx, 'liner' + st.deck, { color: new THREE.Color(st.deck).multiplyScalar(0.92), roughness: 0.6, side: THREE.DoubleSide }),
    cushion: mat(gfx, 'cush' + st.cushion, { color: st.cushion, roughness: 0.55 }),
    steel: mat(gfx, 'steel', { color: '#d8dade', metalness: 1, roughness: 0.16 }),
    dark: mat(gfx, 'dark', { color: '#1a1c1e', roughness: 0.5, metalness: 0.2 }),
    wood: mat(gfx, 'teak', { color: '#9a6a3e', roughness: 0.75 }),
    cowl: mat(gfx, 'cowl' + st.cowl, { color: st.cowl, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 }, 'phys'),
    cowl2: mat(gfx, 'cowl2' + st.cowl2, { color: st.cowl2, roughness: 0.3 }),
    leg: mat(gfx, 'leg', { color: '#2a2c2f', roughness: 0.35, metalness: 0.5 }),
    prop: mat(gfx, 'prop', { color: '#c9ccd0', metalness: 1, roughness: 0.22 }),
    glass: mat(gfx, 'glass', { color: '#20303a', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
  };
}

// ------------------------------------------------------------------ geometry helpers
// collects pieces per material and merges them into one mesh per material
class Parts {
  constructor() { this.map = new Map(); }
  add(m, geo, pos, rot, scl) {
    if (geo.attributes.uv) geo.deleteAttribute('uv'); if (geo.attributes.uv1) geo.deleteAttribute('uv1');
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const g = geo.index ? geo.toNonIndexed() : geo;
    _m.compose(pos || _v.set(0, 0, 0), rot ? _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], rot[3] || 'YXZ')) : _q.identity(), scl || _s.set(1, 1, 1)); g.applyMatrix4(_m);
    let L = this.map.get(m); if (!L) this.map.set(m, L = []); L.push(g); return this;
  }
  box(m, w, h, d, x, y, z, rot) { return this.add(m, new THREE.BoxGeometry(w, h, d), new THREE.Vector3(x, y, z), rot); }
  cyl(m, r0, r1, h, x, y, z, rot, seg = 10) { return this.add(m, new THREE.CylinderGeometry(r0, r1, h, seg), new THREE.Vector3(x, y, z), rot); }
  build(group, cast = true) {
    for (const [m, L] of this.map) { const g = mergeGeometries(L, false); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast && !m.transparent; mesh.receiveShadow = true; if (m.transparent) mesh.renderOrder = 2; group.add(mesh); }
    this.map.clear(); return group;
  }
}
// a surface from rows of points (rows along the hull, columns across) into an indexed geometry with one group per band of columns
function surface(rows, bands, flip) {
  const n = rows[0].length, P = [], I = [];
  for (const r of rows) for (const p of r) P.push(p[0], p[1], p[2]);
  const g = new THREE.BufferGeometry(); let start = 0;
  for (const [j0, j1, mi] of bands) {
    for (let j = j0; j < j1; j++) for (let i = 0; i < rows.length - 1; i++) { const a = i * n + j, b = a + 1, c = a + n, d = c + 1; if (flip) I.push(a, b, c, b, d, c); else I.push(a, c, b, b, c, d); }
    g.addGroup(start, I.length - start, mi); start = I.length;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}

const strip = (rows, flip) => { const g = surface(rows, [[0, rows[0].length - 1, 0]], flip); g.clearGroups(); return g; };

// ------------------------------------------------------------------ the model
// one boat type: the hull shell and everything fixed to it, and per engine the steering and trim pivots with the propeller.
// Returns {root, body, motors: [{steer, tilt, prop}], lights, eye (helm eye, body frame), mats}
export function buildBoat(gfx, spec, opts = {}) {
  const st = STYLE[spec.id] || STYLE.motorbat, M = materials(gfx, spec.id, st), h = spec.hull;
  const L = h.L, zt = -h.lcg * L, k0 = -h.vcg, Lo = spec.L ?? L * 1.08, Bo = spec.B ?? h.B * 1.15, zb = zt - 0.05 + Lo;
  const rise = u => h.rise * Math.max(0, (u - 0.45) / 0.55) ** 2;
  const half = u => u > 1 ? 0 : h.B / 2 * (u < 0.55 ? 1 : Math.max(0.06, 1 - ((u - 0.55) / 0.45) ** 2) ** 0.6);
  const beta = u => (h.deadrise + (h.bowDeadrise - h.deadrise) * sm(0.3, 1, u)) * D2R;
  const sheerY = u => k0 + h.depth + 0.3 * Math.min(u, 1.08) ** 2;
  const ysBow = sheerY((zb - zt) / L);
  // a cross-section at t (0 transom … 1 bow tip): keel, chine and gunwale
  const sec = t => {
    const z = zt + t * (zb - zt), u = (z - zt) / L, ys = sheerY(u), b = beta(Math.min(u, 1)), tb = Math.tan(b), hc = half(u);
    let yk = k0 + rise(Math.min(u, 1));
    if (u > 1) yk += (ysBow - 0.05 - yk) * Math.pow((z - zt - L) / Math.max(0.05, zb - zt - L), 0.75);
    const hg = Bo / 2 * (0.965 + 0.035 * Math.min(1, t * 6)) * Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.42) / 0.58) ** 2.1));
    return { t, z, u, ys, tb, hc, yk, yc: yk + hc * tb, hg: Math.max(hg, hc + 0.002) };
  };
  const NS = 30, ts = []; for (let i = 0; i < NS; i++) { const x = i / (NS - 1); ts.push(1 - Math.pow(1 - x, 1.35)); }
  const S = ts.map(sec);
  // bottom ring (keel → spray rails → chine → chine flat) and topside ring (chine flat → boot stripe → sheer stripe → gunwale), port side
  const step = 0.022 * Bo, drop = 0.006 * Bo;
  const bottomRing = s => {
    const yb = x => s.yk + x * s.tb, r1 = 0.36 * s.hc, r2 = 0.7 * s.hc, cf = Math.min(s.hc + 0.035 * Bo * Math.min(1, s.hc * 8), s.hg - 0.004);
    return [[0, s.yk], [r1, yb(r1)], [r1 + step * Math.min(1, s.hc * 6), yb(r1) - drop], [r2, yb(r2) - drop], [r2 + step * Math.min(1, s.hc * 6), yb(r2) - 2 * drop], [s.hc, s.yc - 2 * drop], [cf, s.yc - 2 * drop - 0.004]];
  };
  const FS = [0, 0.1, 0.22, 0.48, 0.7, 0.84, 1];
  const topRing = s => { const c = bottomRing(s)[6], x6 = c[0], y6 = c[1]; return FS.map(f => [x6 + (s.hg - x6) * (1 - Math.pow(1 - f, 1.7)), y6 + (s.ys - y6) * f]); };
  const body = new THREE.Group(), root = new THREE.Group(); root.add(body);
  const P = new Parts();
  // the outer shell, both sides (materials: 0 bottom, 1 boot stripe, 2 topsides, 3 sheer stripe)
  const shellMats = [M.bottom, M.boot, M.top, M.sheer];
  for (const sd of [1, -1]) {
    const rowsB = S.map(s => bottomRing(s).map(([x, y]) => [sd * x, y, s.z])), rowsT = S.map(s => topRing(s).map(([x, y]) => [sd * x, y, s.z]));
    const gb = surface(rowsB, [[0, 6, 0]], sd < 0), gt = surface(rowsT, [[0, 1, 0], [1, 2, 1], [2, 4, 2], [4, 5, 3], [5, 6, 2]], sd < 0);
    for (const g of [gb, gt]) { const mesh = new THREE.Mesh(g, shellMats); mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh); }
  }
  // the racer's speed stripes: two thin bands following the topside a little above the boot stripe
  if (st.stripes) for (const sd of [1, -1]) {
    const rows = S.filter(s => s.t > 0.08 && s.t < 0.9).map(s => { const r = topRing(s), a = r[2], b = r[3], k = 1.006; return [[sd * (a[0] + (b[0] - a[0]) * 0.32) * k, a[1] + (b[1] - a[1]) * 0.32, s.z], [sd * (a[0] + (b[0] - a[0]) * 0.5) * k, a[1] + (b[1] - a[1]) * 0.5, s.z]]; });
    P.add(M.dark, strip(rows, sd < 0));
  }
  // the transom: a fan from the middle of the stern section
  {
    const s = S[0], ring = [...bottomRing(s), ...topRing(s).slice(1)], pts = [];
    for (let i = ring.length - 1; i >= 0; i--) pts.push([ring[i][0], ring[i][1]]); for (let i = 1; i < ring.length; i++) pts.push([-ring[i][0], ring[i][1]]);
    const cy = (s.yk + s.ys) / 2, V = [0, cy, s.z], Pp = [...V], I = [];
    pts.forEach(p => Pp.push(p[0], p[1], s.z));
    for (let i = 1; i < pts.length; i++) I.push(0, i, i + 1); I.push(0, pts.length, 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setIndex(I); g.computeVertexNormals(); P.add(M.top, g);
  }
  // inside: the gunwale cap, the cockpit liner and sole, the decks fore and aft
  const ySole = k0 + st.sole, cw = st.cap;
  const innerAt = (s, y) => {
    // the inner half width of the hull at height y
    const b = bottomRing(s), tr = topRing(s);
    if (y <= s.yk) return 0;
    if (y < b[5][1]) return Math.max(0, (y - s.yk) / Math.max(s.tb, 0.05) - 0.04);
    for (let i = 1; i < tr.length; i++) if (y <= tr[i][1]) { const a = tr[i - 1], c = tr[i], f = (y - a[1]) / Math.max(1e-4, c[1] - a[1]); return a[0] + (c[0] - a[0]) * f - 0.04; }
    return s.hg - cw;
  };
  const cockpit = S.filter(s => s.t >= st.aft - 1e-6 && s.t <= st.fore + 0.02 && s.yk < ySole - 0.03);
  for (const sd of [1, -1]) {
    // cap along the whole sheer
    P.add(M.deck, strip(S.map(s => [[sd * s.hg, s.ys, s.z], [sd * Math.max(0, s.hg - cw), s.ys + 0.01, s.z]]), sd < 0));
    // the liner inside the cockpit: from the cap down to the sole
    if (cockpit.length > 1) {
      const rows = cockpit.map(s => { const x0 = Math.max(0, s.hg - cw), xs = innerAt(s, ySole + 0.02); return [[sd * x0, s.ys + 0.01, s.z], [sd * (x0 * 0.55 + xs * 0.45 + 0.02), (s.ys + ySole) / 2, s.z], [sd * xs, ySole + 0.02, s.z]]; });
      P.add(M.liner, strip(rows, sd > 0));
    }
  }
  if (cockpit.length > 1) {
    const rows = cockpit.map(s => { const xs = innerAt(s, ySole + 0.02); return [[xs, ySole, s.z], [0, ySole, s.z], [-xs, ySole, s.z]]; });
    P.add(M.deck, strip(rows, true));
  }
  const deckRows = list => list.map(s => { const x0 = Math.max(0, s.hg - cw); return [-1, -0.5, 0, 0.5, 1].map(c => [c * x0, s.ys + 0.01 + st.camber * (1 - c * c) * Math.min(1, x0 * 3), s.z]); });
  const fore = S.filter(s => s.t >= st.fore - 0.001);
  if (fore.length > 1) P.add(M.deck, strip(deckRows([sec(st.fore), ...fore.filter(s => s.t > st.fore)]), true));
  if (st.aft > 0) P.add(M.deck, strip(deckRows([...S.filter(s => s.t < st.aft), sec(st.aft)]), true));
  // bulkheads where the cockpit meets the decks
  for (const t of [st.fore, st.aft]) {
    if (t <= 0) continue; const s = sec(t), x0 = Math.max(0, s.hg - cw), xs = innerAt(s, ySole + 0.02), Pp = [], I = [];
    const yb = Math.max(ySole, s.yk + 0.03), pts = [[-x0, s.ys + 0.01], [x0, s.ys + 0.01], [Math.max(xs, 0.02), yb], [-Math.max(xs, 0.02), yb]];
    pts.forEach(p => Pp.push(p[0], p[1], s.z)); I.push(0, 1, 2, 0, 2, 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setIndex(I); g.computeVertexNormals(); P.add(M.liner, g);
  }
  const at = t => sec(t);
  // fittings: cleats at the bow and the stern corners, fender rub strip
  for (const t of [0.04, 0.82]) { const s = at(t); for (const sd of [1, -1]) { const x = sd * (s.hg - cw * 1.6) * (t > 0.5 ? 0.7 : 1); P.box(M.steel, 0.04, 0.035, 0.16 * Math.min(1, Bo / 2), x, s.ys + 0.03, s.z).box(M.steel, 0.03, 0.03, 0.04, x, s.ys + 0.015, s.z); } }
  for (const sd of [1, -1]) P.add(M.dark, strip(S.filter(s => s.t < 0.97).map(s => [[sd * (s.hg + 0.012), s.ys - 0.05, s.z], [sd * (s.hg + 0.012), s.ys - 0.005, s.z]]), sd < 0));
  let eye, lights = {};
  const lightMat = (c) => prep(new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.35), emissive: c, emissiveIntensity: 0, roughness: 0.3 }));
  lights.red = lightMat('#ff2a1a'); lights.green = lightMat('#22ff55'); lights.white = lightMat('#fff6e6');
  const lp = new Parts();
  if (spec.id === 'jolle') {
    // thwarts (benches) of wood, and a bow light on the small foredeck
    for (const t of [0.3, 0.58]) { const s = at(t), w = innerAt(s, ySole + 0.33) * 2; P.box(M.wood, w, 0.035, 0.24, 0, ySole + 0.33, s.z); }
    const sa = at(0.08); P.box(M.wood, innerAt(sa, ySole + 0.3) * 2, 0.035, 0.42, 0, ySole + 0.3, sa.z);
    const sb = at(0.93); lp.box(lights.red, 0.035, 0.04, 0.05, 0.03, sb.ys + 0.06, sb.z).box(lights.green, 0.035, 0.04, 0.05, -0.03, sb.ys + 0.06, sb.z);
    const s0 = at(0.02); P.cyl(M.steel, 0.012, 0.012, 0.9, -Bo * 0.32, s0.ys + 0.45, s0.z + 0.08); lp.add(lights.white, new THREE.SphereGeometry(0.035, 8, 6), new THREE.Vector3(-Bo * 0.32, s0.ys + 0.92, s0.z + 0.08));
    eye = new THREE.Vector3(Bo * 0.12, ySole + 0.95, zt + 0.55);
  } else {
    // the console (or the racer's dashboard) with its windscreen and wheel
    if (st.console) {
      const c = st.console, s = at(c.t), y0 = ySole, top = y0 + c.h;
      P.add(M.liner, new THREE.BoxGeometry(c.w, c.h, c.d, 1, 1, 1), new THREE.Vector3(0, y0 + c.h / 2, s.z));
      P.box(M.dark, c.w + 0.02, 0.05, c.d * 0.55, 0, top + 0.02, s.z - c.d * 0.2).box(M.steel, c.w + 0.06, 0.03, 0.03, 0, top - 0.4, s.z - c.d / 2 - 0.02);
      P.add(M.dark, new THREE.BoxGeometry(c.w * 0.86, 0.3, 0.04), new THREE.Vector3(0, top - 0.16, s.z - c.d / 2 - 0.0), [-0.5, 0, 0]);
      P.add(M.steel, new THREE.TorusGeometry(0.17, 0.015, 6, 20), new THREE.Vector3(0.0, top - 0.25, s.z - c.d / 2 - 0.1), [-0.95, 0, 0]);
      P.cyl(M.dark, 0.02, 0.02, 0.14, 0, top - 0.22, s.z - c.d / 2 - 0.04, [-0.95 + Math.PI / 2, 0, 0], 6);
      // windscreen: a bent pane on a steel frame
      P.add(M.glass, new THREE.CylinderGeometry(c.w * 0.75, c.w * 0.62, 0.42, 16, 1, true, -1.1, 2.2), new THREE.Vector3(0, top + 0.21, s.z - 0.18), [-0.32, 0, 0]);
      // leaning post with a cushion, and the bench across the stern
      const sp = at(c.t - 0.12); P.box(M.liner, 0.62, 0.62, 0.42, 0, y0 + 0.31, sp.z).box(M.cushion, 0.66, 0.12, 0.46, 0, y0 + 0.68, sp.z).box(M.cushion, 0.62, 0.32, 0.1, 0, y0 + 0.92, sp.z - 0.2);
      const sbn = at(st.aft + 0.06), wb = innerAt(sbn, y0 + 0.4) * 2 - 0.05; P.box(M.liner, wb, 0.4, 0.5, 0, y0 + 0.2, sbn.z).box(M.cushion, wb, 0.1, 0.5, 0, y0 + 0.45, sbn.z).box(M.cushion, wb, 0.35, 0.09, 0, y0 + 0.68, sbn.z - 0.24);
      // the sunbed on the foredeck
      const sf = at(st.fore + 0.12), wf = (sf.hg - cw) * 1.4; P.box(M.cushion, wf, 0.08, 0.9, 0, sf.ys + st.camber + 0.05, sf.z);
      // stern light on a pole, sidelights on the bow
      const s0 = at(0.03); P.cyl(M.steel, 0.014, 0.014, 1.0, 0, s0.ys + 0.5, s0.z + 0.05); lp.add(lights.white, new THREE.SphereGeometry(0.04, 8, 6), new THREE.Vector3(0, s0.ys + 1.03, s0.z + 0.05));
      eye = new THREE.Vector3(0, y0 + 1.6, at(c.t - 0.1).z);
    }
    if (st.dash) {
      // the racer: a dashboard across the cockpit with a wraparound windscreen, two bucket seats side by side
      const s = at(st.dash.t), xi = innerAt(s, ySole + 0.4), top = s.ys + 0.12;
      P.box(M.dark, xi * 2, 0.24, 0.5, 0, s.ys - 0.16, s.z + 0.1);
      P.add(M.glass, new THREE.CylinderGeometry(xi * 1.05, xi * 0.95, 0.36, 20, 1, true, -1.35, 2.7), new THREE.Vector3(0, top + 0.12, s.z - 0.15), [-0.45, 0, 0], new THREE.Vector3(1, 1, 0.55));
      P.add(M.steel, new THREE.TorusGeometry(0.16, 0.014, 6, 20), new THREE.Vector3(-xi * 0.45, s.ys - 0.04, s.z - 0.18), [-1.1, 0, 0]);
      for (const sd of [1, -1]) {
        const ss = at(st.dash.t - 0.13), x = sd * xi * 0.45;
        P.box(M.cushion, 0.5, 0.14, 0.5, x, ySole + 0.5, ss.z).box(M.cushion, 0.5, 0.62, 0.12, x, ySole + 0.85, ss.z - 0.27, [0.18, 0, 0]).box(M.cushion, 0.08, 0.3, 0.45, x + 0.25, ySole + 0.65, ss.z).box(M.cushion, 0.08, 0.3, 0.45, x - 0.25, ySole + 0.65, ss.z);
        P.box(M.dark, 0.45, 0.42, 0.45, x, ySole + 0.22, ss.z);
      }
      // a roll bar over the cockpit carrying the stern light, and sidelights on the deck
      const sr = at(st.dash.t - 0.22); for (const sd of [1, -1]) P.cyl(M.steel, 0.03, 0.03, 0.75, sd * xi * 0.92, sr.ys + 0.34, sr.z);
      P.cyl(M.steel, 0.03, 0.03, xi * 1.84, 0, sr.ys + 0.72, sr.z, [0, 0, Math.PI / 2]);
      lp.add(lights.white, new THREE.SphereGeometry(0.045, 8, 6), new THREE.Vector3(0, sr.ys + 0.79, sr.z));
      eye = new THREE.Vector3(-xi * 0.45, ySole + 1.45, at(st.dash.t - 0.13).z + 0.12);
    }
    const sb = at(0.78); for (const sd of [1, -1]) lp.box(sd > 0 ? lights.red : lights.green, 0.03, 0.05, 0.09, sd * (sb.hg + 0.01), sb.ys - 0.02, sb.z);
    // the bow rail: tubes along the foredeck on stanchions
    if (st.rail) {
      const pts = []; for (const t of [0.62, 0.7, 0.78, 0.86, 0.92, 0.96]) { const s = at(t); pts.push(new THREE.Vector3(s.hg - cw - 0.04, s.ys + 0.52, s.z)); }
      const s1 = at(0.99); pts.push(new THREE.Vector3(0, s1.ys + 0.55, s1.z - 0.02));
      for (let i = pts.length - 2; i >= 0; i--) pts.push(new THREE.Vector3(-pts[i].x, pts[i].y, pts[i].z));
      P.add(M.steel, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.013, 6, false));
      for (const p of pts) if (Math.abs(p.x) > 0.01) P.cyl(M.steel, 0.011, 0.011, 0.5, p.x, p.y - 0.26, p.z, null, 6);
    }
  }
  P.build(body); lp.build(body, false);
  // the outboards: the bracket on the transom, the steering swivel, the trim pivot, the cowl, the leg, the gearcase and the propeller
  const e = spec.engine, dr = spec.drive, n = e.count || 1, k = Math.pow(e.hp / 150, 0.3), D = spec.prop.D, yp = -(dr.pivot + dr.depth), aft = dr.aft ?? 0.4;
  const motors = [];
  for (let i = 0; i < n; i++) {
    const mx = (i - (n - 1) / 2) * (e.spacing || 0.8), mr = new THREE.Group(); mr.position.set(mx, k0 + dr.pivot, zt - 0.02); body.add(mr);
    const steer = new THREE.Group(), tilt = new THREE.Group(), prop = new THREE.Group(); mr.add(steer); steer.add(tilt);
    const B = new Parts(); B.box(M.leg, 0.2 * k, 0.32 * k, 0.1, 0, -0.08 * k, -0.03); B.build(mr);
    const T = new Parts(), cz = -aft * 0.5 - 0.06 * k;
    T.add(M.cowl, new THREE.CapsuleGeometry(0.21 * k, 0.26 * k, 6, 12), new THREE.Vector3(0, 0.42 * k, cz), null, new THREE.Vector3(1, 1, 1.45));
    T.add(M.cowl2, new THREE.CylinderGeometry(0.214 * k, 0.214 * k, 0.05 * k, 16), new THREE.Vector3(0, 0.34 * k, cz), null, new THREE.Vector3(1, 1, 1.45));
    T.add(M.leg, new THREE.BoxGeometry(0.34 * k, 0.22 * k, 0.55 * k), new THREE.Vector3(0, 0.08 * k, cz + 0.02));
    const legTop = -0.02, legBot = yp + 0.14 * k, lz = -aft + 0.13 * k;
    T.add(M.leg, new THREE.CylinderGeometry(0.06 * k, 0.05 * k, legTop - legBot, 10), new THREE.Vector3(0, (legTop + legBot) / 2, lz), null, new THREE.Vector3(1, 1, 2.6));
    T.add(M.leg, new THREE.BoxGeometry(0.2 * k, 0.012, 0.42 * k), new THREE.Vector3(0, yp + 0.15 * k, -aft + 0.08 * k));
    T.add(M.leg, new THREE.CapsuleGeometry(0.055 * k, 0.3 * k, 4, 10), new THREE.Vector3(0, yp, -aft + 0.15 * k), [Math.PI / 2, 0, 0]);
    T.add(M.leg, new THREE.BoxGeometry(0.018, 0.2 * k, 0.16 * k), new THREE.Vector3(0, yp - 0.12 * k, -aft + 0.16 * k));
    if (spec.id === 'jolle') T.add(M.dark, new THREE.CylinderGeometry(0.025, 0.02, 0.75, 8), new THREE.Vector3(0, 0.14, 0.3), [Math.PI / 2 - 0.15, 0, 0]);
    T.build(tilt);
    prop.position.set(0, yp, -aft - 0.03); tilt.add(prop);
    const PP = new Parts(); PP.add(M.prop, new THREE.CylinderGeometry(0.045 * k, 0.035 * k, 0.14 * k, 10), new THREE.Vector3(0, 0, 0), [Math.PI / 2, 0, 0]);
    for (let b = 0; b < 3; b++) { const a = b / 3 * Math.PI * 2; PP.add(M.prop, new THREE.SphereGeometry(1, 10, 6), new THREE.Vector3(Math.sin(a) * D * 0.27, Math.cos(a) * D * 0.27, 0), [0, 0.55, -a, 'ZYX'], new THREE.Vector3(D * 0.12, D * 0.24, 0.01)); }
    PP.build(prop);
    motors.push({ root: mr, steer, tilt, prop });
  }
  root.userData = { spec };
  return { root, body, motors, lights, eye: eye || new THREE.Vector3(0, ySole + 1.4, zt + 1), zt, k0, Bo, Lo, ySole };
}

// a boat on screen that follows a physics Boat (or is posed by hand: the moored boats)
export class BoatVisual {
  constructor(gfx, spec, opts = {}) {
    this.gfx = gfx; this.spec = spec; Object.assign(this, buildBoat(gfx, spec, opts));
    (opts.parent || gfx.scene).add(this.root);
  }
  // copy the physics pose: position, attitude, engine steering and trim, propeller spin; lights at night (or when on)
  sync(b, lightsOn) {
    this.root.position.set(b.pos.x, b.pos.y, b.pos.z); this.root.quaternion.set(b.q.x, b.q.y, b.q.z, b.q.w);
    const st = b.state;
    this.motors.forEach((m, i) => { m.steer.rotation.y = -st.steer; m.tilt.rotation.x = st.trimA; m.prop.rotation.z = b.motors[i] ? b.motors[i].angle : 0; });
    const on = lightsOn ?? U.uNight.value > 0.45, I = on ? 4 : 0;
    this.lights.red.emissiveIntensity = I; this.lights.green.emissiveIntensity = I; this.lights.white.emissiveIntensity = on ? 5 : 0;
  }
  tiltUp(a = 1.15) { for (const m of this.motors) { m.tilt.rotation.x = a; m.steer.rotation.y = 0; } }
  dispose() { this.root.parent && this.root.parent.remove(this.root); }
}

// ------------------------------------------------------------------ see-through things on the water (drawn after the sea)
const GERSTNER = `
uniform float uTime; uniform float uWave;
vec3 gerstner(vec2 p, vec2 d, float L, float A, float t){ float k = 6.2832 / L, c = sqrt(9.81 / k), f = k * (dot(d, p) - c * t);
  return vec3(d.x * A * cos(f), A * sin(f), d.y * A * cos(f)); }
vec3 sea(vec2 p){ float fade = 1.0 - smoothstep(150.0, 900.0, distance(p, cameraPosition.xz));
  return (gerstner(p, normalize(vec2(1.0, 0.35)), 31.0, 0.22, uTime) + gerstner(p, normalize(vec2(0.6, 1.0)), 13.0, 0.09, uTime) + gerstner(p, normalize(vec2(-0.4, 1.0)), 7.0, 0.045, uTime)) * uWave * fade; }
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }
`;
function seaUniforms(water, extra) {
  return Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), { uTime: U.uTime, uSunDir: U.uSunDir, uFogSun: U.uFogSun, uFogFall: U.uFogFall, uNight: U.uNight, uWave: water ? water.uni.uWave : { value: 0.8 } }, extra || {});
}

// the foam wake: a ribbon laid on the waves behind the transom, widening as it ages. The middle is the churned propeller wash, the
// edges the diverging waves; both fade, the wash first
export class Wake {
  constructor(gfx, water, n = 200) {
    this.gfx = gfx; this.n = n; this.pts = []; this.dist = 0;
    const g = this.geo = new THREE.BufferGeometry(), N = n * 2;
    this.P = new Float32Array(N * 3); this.A = new Float32Array(N * 4); this.C = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aW', new THREE.BufferAttribute(this.A, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aC', new THREE.BufferAttribute(this.C, 1).setUsage(THREE.DynamicDrawUsage));
    const I = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(I);
    this.mat = new THREE.ShaderMaterial({ uniforms: seaUniforms(water, { uO: { value: new THREE.Vector2() } }), transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      vertexShader: GERSTNER + `attribute vec4 aW; attribute float aC; varying vec4 vW; varying float vC; varying vec3 vP;
        #include <fog_pars_vertex>
        void main(){ vec3 transformed = position + sea(position.xz); transformed.y += 0.04; vW = aW; vC = aC; vP = transformed;
          gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0);
          #include <fog_vertex>
        }`,
      fragmentShader: GERSTNER + `uniform float uNight; uniform vec2 uO; varying vec4 vW; varying float vC; varying vec3 vP;
        #include <fog_pars_fragment>
        void main(){
          // vW: x across (−1…1), y half width (m), z: wash strength, w: wave-edge strength; vC: half width of the churned middle
          float d = abs(vW.x) * vW.y, core = vC; vec2 q = vP.xz - uO;
          float f = vn(q * 0.8 + uTime * 0.35) * 0.5 + vn(q * 2.6 - uTime * 0.5) * 0.32 + vn(q * 7.5) * 0.18;
          float wash = vW.z * (1.0 - smoothstep(core * 0.45, core * 1.05, d)) * smoothstep(0.42, 0.7, f);
          float lace = vW.z * 0.55 * (1.0 - smoothstep(core, core * 2.1, d)) * smoothstep(0.66, 0.86, vn(q * 4.5) * 0.6 + vn(q * 1.2 + uTime * 0.2) * 0.4);
          float edge = vW.w * exp(-pow((vW.y - d) / 1.1, 2.0)) * smoothstep(0.42, 0.78, vn(q * 1.1 + uTime * 0.25) * 0.65 + vn(q * 3.7) * 0.35) * 0.75;
          float a = clamp(wash + lace + edge, 0.0, 0.85);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.93, 0.96, 0.97) * (0.12 + 0.88 * (1.0 - uNight)), a);
          #include <fog_fragment>
        }` });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; gfx.overlay.add(this.mesh);
  }
  clear() { this.pts.length = 0; this.mesh.visible = false; }
  // b: the physics Boat; dt: frame time
  update(dt, b) {
    const sp = Math.hypot(b.vel.x, b.vel.z), fw = b.fw, fl = Math.hypot(fw.x, fw.z) || 1, ux = fw.x / fl, uz = fw.z / fl, L = b.L, B = b.B;
    // the transom, on the water
    const tx = b.pos.x + ux * (b.zt - 0.3), tz = b.pos.z + uz * (b.zt - 0.3);
    const st = b.state, thr = Math.abs(st.thr || 0), wash = Math.min(1, sm(0.5, 6, sp) * 0.75 + thr * 0.35) * (st.propOut ? 0.6 : 1), edge = sm(2, 9, sp) * 0.75;
    const P = this.pts, last = P[P.length - 1];
    if (!last || Math.hypot(last.x - tx, last.z - tz) > Math.max(1.2, sp * 0.1)) { P.push({ x: tx, z: tz, nx: -uz, nz: ux, age: 0, w0: B * 0.42, sp, wash, edge }); if (P.length > this.n) P.shift(); }
    else Object.assign(last, { x: tx, z: tz, nx: -uz, nz: ux, wash: Math.max(last.wash, wash), edge: Math.max(last.edge, edge) });
    for (const p of P) p.age += dt;
    while (P.length && P[0].age > 32) P.shift();
    const n = P.length; this.mesh.visible = n > 1; if (n < 2) return;
    for (let i = 0; i < this.n; i++) {
      const p = P[Math.min(i, n - 1)], hw = p.w0 + p.age * (0.25 + 0.32 * p.sp) * Math.min(1, p.age * 2 + 0.2), cap = Math.min(hw, 6 + p.sp * 3.5);
      const ws = p.wash * Math.exp(-p.age / 5.5) * Math.min(1, p.age * 3 + 0.4), es = p.edge * Math.exp(-p.age / 11);
      for (const s of [-1, 1]) {
        const k = i * 2 + (s > 0 ? 1 : 0);
        this.P[k * 3] = p.x + p.nx * s * cap; this.P[k * 3 + 1] = 0; this.P[k * 3 + 2] = p.z + p.nz * s * cap;
        this.A[k * 4] = s; this.A[k * 4 + 1] = cap; this.A[k * 4 + 2] = i >= n ? 0 : ws; this.A[k * 4 + 3] = i >= n ? 0 : es; this.C[k] = Math.min(cap, p.w0 * 0.85 + p.age * 0.4);
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aW.needsUpdate = true; this.geo.attributes.aC.needsUpdate = true;
    this.mat.uniforms.uO.value.set(Math.round(tx / 512) * 512, Math.round(tz / 512) * 512);
    this.geo.setDrawRange(0, (n - 1) * 6);
  }
  dispose() { this.gfx.overlay.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}

// spray: soft white droplets thrown off the chines (where the physics says the spray root is), the propeller's rooster tail at speed,
// and bursts when the bow slams into a wave
export class Spray {
  constructor(gfx, water, n = 900) {
    this.gfx = gfx; this.n = n; this.live = 0; this.acc = 0; this.acc2 = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.age = new Float32Array(n); this.life = new Float32Array(n); this.size0 = new Float32Array(n);
    const g = this.geo = new THREE.BufferGeometry();
    this.aP = new Float32Array(n * 3); this.aS = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.aP, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aS', new THREE.BufferAttribute(this.aS, 2).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: seaUniforms(water, { uScale: { value: 400 } }), transparent: true, depthWrite: false, fog: true,
      vertexShader: `uniform float uScale; attribute vec2 aS; varying float vA;
        #include <fog_pars_vertex>
        void main(){ vec3 transformed = position; vec4 mv = viewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aS.x * uScale / max(0.5, -mv.z), 1.0, 160.0); vA = aS.y;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uNight; varying float vA;
        #include <fog_pars_fragment>
        void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard;
          float a = vA * (1.0 - r * r) * (0.75 + 0.25 * sin(gl_PointCoord.x * 17.0 + gl_PointCoord.y * 11.0));
          gl_FragColor = vec4(vec3(0.94, 0.97, 1.0) * (0.14 + 0.86 * (1.0 - uNight)), a);
          #include <fog_fragment>
        }` });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 7; gfx.overlay.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, life, size) {
    if (this.live >= this.n) return; const i = this.live++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.size0[i] = size;
  }
  clear() { this.live = 0; }
  update(dt, b, t, ws) {
    const st = b.state, sp = Math.hypot(b.vel.x, b.vel.z), R = Math.random, fw = b.fw, lf = b.lf, up = b.up;
    // chine spray: from both sides of the spray root, outward, up and aft
    if (b && st.spray > 0.02 && sp > 2) {
      this.acc += dt * Math.min(520, st.spray * 650 + sp * 6);
      const s = b.sprayAt;
      while (this.acc >= 1) {
        this.acc -= 1; const sd = R() < 0.5 ? -1 : 1, off = b.B * (0.42 + R() * 0.12), along = (R() - 0.6) * 1.2;
        const x = s.x + lf.x * sd * off + fw.x * along, z = s.z + lf.z * sd * off + fw.z * along, y = Math.max(s.y, waveHeight(x, z, t, ws)) + 0.05;
        const out = 1.2 + sp * (0.12 + 0.12 * R()), upv = 0.8 + sp * (0.07 + 0.08 * R()) * Math.min(1, st.spray * 2.5), keep = 0.55 + 0.25 * R();
        this.emit(x, y, z, b.vel.x * keep + lf.x * sd * out, upv, b.vel.z * keep + lf.z * sd * out, 0.6 + R() * 0.7, 0.22 + R() * 0.3);
      }
    }
    // the propeller: a rooster tail on the plane, foam churned up at low speed and in reverse
    for (const M of b.motors) {
      const thr = Math.abs(st.thr || 0), rate = st.onPlane ? 40 + sp * 3 : thr * 60 + (M.vent > 0.3 ? 80 : 0);
      this.acc2 += dt * rate;
      while (this.acc2 >= 1) {
        this.acc2 -= 1; const x = M.P.x + (R() - 0.5) * 0.3, z = M.P.z + (R() - 0.5) * 0.3, y = waveHeight(x, z, t, ws) + 0.05;
        if (st.onPlane) this.emit(x, y, z, b.vel.x * 0.45 + (R() - 0.5) * 1.2, 2.2 + sp * 0.12 * R(), b.vel.z * 0.45 + (R() - 0.5) * 1.2, 0.8 + R() * 0.6, 0.18 + R() * 0.3);
        else this.emit(x, y, z, (R() - 0.5) * 1.5 - fw.x * thr * 2 * Math.sign(st.gear || 1), 0.6 + R() * 0.8 * thr, (R() - 0.5) * 1.5 - fw.z * thr * 2 * Math.sign(st.gear || 1), 0.5 + R() * 0.4, 0.15 + R() * 0.2);
      }
    }
    // a slam: the bow comes down hard on a wave
    const dvy = b.vel.y - (this.vy ?? b.vel.y); this.vy = b.vel.y;
    if (dvy > 9.81 * 1.2 * dt && sp > 6) {
      const n = Math.min(60, 10 + dvy / dt * 1.5), bx = b.pos.x + fw.x * b.L * 0.25, bz = b.pos.z + fw.z * b.L * 0.25;
      for (let i = 0; i < n; i++) { const sd = R() < 0.5 ? -1 : 1, x = bx + lf.x * sd * b.B * 0.5, z = bz + lf.z * sd * b.B * 0.5; this.emit(x, waveHeight(x, z, t, ws) + 0.1, z, b.vel.x * 0.5 + lf.x * sd * (2 + R() * 4), 2 + R() * 4, b.vel.z * 0.5 + lf.z * sd * (2 + R() * 4), 0.9 + R() * 0.6, 0.25 + R() * 0.35); }
    }
    this.step(dt);
  }
  step(dt) {
    const drag = Math.exp(-dt * 1.4);
    for (let i = 0; i < this.live; i++) {
      this.age[i] += dt;
      if (this.age[i] > this.life[i]) { const j = --this.live; this.p.copyWithin(i * 3, j * 3, j * 3 + 3); this.v.copyWithin(i * 3, j * 3, j * 3 + 3); this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size0[i] = this.size0[j]; i--; continue; }
      this.v[i * 3] *= drag; this.v[i * 3 + 2] *= drag; this.v[i * 3 + 1] = this.v[i * 3 + 1] * drag - 9.81 * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    }
    for (let i = 0; i < this.live; i++) {
      const u = this.age[i] / this.life[i];
      this.aP[i * 3] = this.p[i * 3]; this.aP[i * 3 + 1] = this.p[i * 3 + 1]; this.aP[i * 3 + 2] = this.p[i * 3 + 2];
      this.aS[i * 2] = this.size0[i] * (1 + u * 3.5); this.aS[i * 2 + 1] = 0.62 * Math.min(1, u * 8) * (1 - u) * (1 - u);
    }
    const c = this.gfx.camera; this.mat.uniforms.uScale.value = (this.gfx.size ? this.gfx.size.H : 600) / (2 * Math.tan(c.fov * D2R / 2));
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aS.needsUpdate = true; this.geo.setDrawRange(0, this.live);
  }
  dispose() { this.gfx.overlay.remove(this.pts); this.geo.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ race buoys
// a pair of inflatable race marks: orange to port, green to starboard (yellow for the start and the finish), a reflective band,
// a flashing light on top; the next gate glows and has a beam of light over each buoy
export class BuoyPair {
  constructor(gfx, x, z, dir, w, kind) {
    this.gfx = gfx; this.x = x; this.z = z; this.w = w; this.kind = kind;
    const nx = Math.cos(dir), nz = -Math.sin(dir);         // the gate's left (port) direction
    this.buoys = [1, -1].map(sd => {
      const col = kind === 'start' ? '#f2c230' : sd > 0 ? '#ec5a1c' : '#2f9e44', g = new THREE.Group(), m = buoyMats(gfx, col);
      const body = new THREE.Mesh(BUOY.body, m.body), band = new THREE.Mesh(BUOY.band, m.band), cap = new THREE.Mesh(BUOY.cap, m.body), lamp = new THREE.Mesh(BUOY.lamp, m.lamp);
      body.position.y = 0.8; band.position.y = 1.35; cap.position.y = 1.98; lamp.position.y = 2.46;
      for (const o of [body, band, cap]) { o.castShadow = true; o.receiveShadow = true; }
      g.add(body, band, cap, lamp);
      if (kind === 'start') { const f = new THREE.Mesh(BUOY.flag, m.flag); f.position.set(0.45, 3.25, 0); g.add(f); const p = new THREE.Mesh(BUOY.pole, m.band); p.position.y = 2.9; g.add(p); }
      const ax = x + nx * sd * w / 2, az = z + nz * sd * w / 2; g.position.set(ax, 0, az); gfx.scene.add(g);
      const beam = new THREE.Mesh(BUOY.beam, m.beam); beam.position.set(ax, 0, az); beam.renderOrder = 8; beam.visible = false; gfx.overlay.add(beam);
      return { g, beam, body, cap, mats: m, lampMat: m.lamp, bodyMat: m.body, ax, az, x: ax, z: az, col: { x: ax, z: az, r: 0.8, mass: 120, y0: -1.2, y1: 2.2, kind: 'buoy', bounce: 0.3 }, ph: Math.random() * 6 };
    });
    this.state = 'wait';
  }
  // wait (later), next (the one to take), done
  set(state) { this.state = state; const on = state === 'next'; for (const b of this.buoys) { b.g.visible = state !== 'done'; b.beam.visible = on; b.body.material = b.cap.material = on ? b.mats.on : b.mats.body; } }
  update(dt, t, ws) {
    for (const b of this.buoys) {
      // pushed by a boat: drift back to the mooring
      b.col.x += (b.ax - b.col.x) * Math.min(1, dt * 0.4); b.col.z += (b.az - b.col.z) * Math.min(1, dt * 0.4);
      const x = b.col.x, z = b.col.z, y = waveHeight(x, z, t, ws), e = 0.8, sx = (waveHeight(x + e, z, t, ws) - waveHeight(x - e, z, t, ws)) / (2 * e), sz = (waveHeight(x, z + e, t, ws) - waveHeight(x, z - e, t, ws)) / (2 * e);
      b.g.position.set(x, y - 0.45, z); b.g.rotation.set(sz * 0.9, 0, -sx * 0.9); b.beam.position.set(x, y, z);
    }
  }
  dispose() { for (const b of this.buoys) { this.gfx.scene.remove(b.g); this.gfx.overlay.remove(b.beam); } }
}
let BUOY = null; const BMATS = new Map();
function buoyMats(gfx, col) {
  if (!BUOY) {
    const beam = new THREE.CylinderGeometry(0.45, 0.75, 26, 12, 6, true); beam.translate(0, 13, 0);
    const c = [], p = beam.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 26; c.push(1, 0.78, 0.4, 0.5 * (1 - y) * (1 - y)); } beam.translate(0, 2.7, 0); beam.setAttribute('color', new THREE.Float32BufferAttribute(c, 4));
    const flag = new THREE.PlaneGeometry(0.85, 0.58);
    BUOY = { body: new THREE.CylinderGeometry(0.8, 0.72, 1.6, 20), band: new THREE.CylinderGeometry(0.78, 0.78, 0.26, 20), cap: new THREE.ConeGeometry(0.78, 0.76, 20), lamp: new THREE.SphereGeometry(0.12, 10, 8), beam, flag, pole: new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6) };
  }
  let m = BMATS.get(col); if (m) return m;
  m = { body: mat(gfx, 'buoy' + col, { color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.05 }, 'phys'), on: mat(gfx, 'buoyOn' + col, { color: col, roughness: 0.3, emissive: col, emissiveIntensity: 0.45 }, 'phys'),
    band: mat(gfx, 'buoyband', { color: '#f4f4f0', roughness: 0.3 }),
    lamp: prep(new THREE.MeshStandardMaterial({ color: '#ffe9b0', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.3 })),
    flag: mat(gfx, 'buoyflag', { color: '#14120e', roughness: 0.7, side: THREE.DoubleSide }),
    beam: prep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })) };
  BMATS.set(col, m); return m;
}
// the lamps on the buoys: the next gate flashes bright, the others glow at night
export function buoyLamps(pairs, t) {
  const night = U.uNight.value;
  for (const P of pairs) for (const b of P.buoys) {
    const on = P.state === 'next' ? ((t * 1.6 + b.ph * 0.05) % 1 < 0.45 ? 7 : 0.6) : night * 2.5 * ((t * 0.5 + b.ph) % 1 < 0.2 ? 1 : 0.15);
    b.lampMat.emissiveIntensity = on;
  }
  for (const m of BMATS.values()) m.body.emissiveIntensity = 0.05 + night * 0.25;
}

// the arrow over the boat that points to the gate you have to take next (red when you missed it)
export class Arrow {
  constructor(gfx) {
    const s = new THREE.Shape(); s.moveTo(0, 1.1); s.lineTo(0.75, 0); s.lineTo(0.28, 0); s.lineTo(0.28, -0.9); s.lineTo(-0.28, -0.9); s.lineTo(-0.28, 0); s.lineTo(-0.75, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0);
    this.mat = prep(new THREE.MeshStandardMaterial({ color: '#e5a92b', emissive: '#e5a92b', emissiveIntensity: 0.5, roughness: 0.4 }));
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.castShadow = false; this.mesh.visible = false; gfx.scene.add(this.mesh); this.gfx = gfx;
  }
  // at (x, y, z) pointing to (tx, tz)
  set(x, y, z, tx, tz, bad, t) {
    const m = this.mesh; m.visible = true; m.position.set(x, y + Math.sin(t * 3) * 0.08, z);
    // the shape points along −z after the rotation; heading h points along (sin h, cos h)
    m.rotation.set(-0.55, Math.atan2(tx - x, tz - z) + Math.PI, 0, 'YXZ');
    this.mat.color.set(bad ? '#e0402a' : '#e5a92b'); this.mat.emissive.set(bad ? '#e0402a' : '#e5a92b'); this.mat.emissiveIntensity = bad ? 0.9 + 0.5 * Math.sin(t * 8) : 0.5;
  }
  hide() { this.mesh.visible = false; }
}
