// The skier on screen: a low-poly but well-proportioned 1.8 m figure (helmet, goggles, jacket, ski pants, gloves, boots on two
// carving skis with bindings, two poles) that bends at the ankles, knees, hips, shoulders and elbows. The pose comes from the
// physics (sim/physics/skier.js): leaning into the turn with the hips angulated, knees soaking up bumps, the tuck, the plough with the
// tips together, the double-pole stroke and skating, arms out in the air and windmilling in a wobble, the herringbone uphill,
// seated in a chair. Joints are written in the skier's own frame (feet on the snow at the origin, +z forward, +x left, metres);
// knees and elbows are solved from the feet, hips, shoulders and hands. Also the snow spray off the edges and the tracks in the snow.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, U } from './gfx.js';

const V = () => new THREE.Vector3(), _a = V(), _b = V(), _c = V(), _x = V(), _y = V(), _z = V(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const sm = x => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const L = { shin: 0.43, thigh: 0.45, torso: 0.5, upper: 0.29, fore: 0.28, pole: 1.2 };

// ---------------------------------------------------------------- materials and shapes (shared by every figure)
const MATS = new Map();
function mat(gfx, key, o) {
  let m = MATS.get(key); if (!m) { m = prep(new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.7 }, o))); MATS.set(key, m); }
  if (!m.userData.sh && !o.transparent && gfx && gfx.shadowed) { gfx.shadowed(m); m.userData.sh = true; }      // (a baked figure made it first without the shadows)
  return m;
}
export function skierMats(gfx, o = {}) {
  const c = o.jacket || '#d9432f', p = o.pants || '#1f2a3a', h = o.helmet || '#f2f2ee', s = o.ski || '#f2c230', b = o.boot || '#e8e6e0';
  return {
    jacket: mat(gfx, 'j' + c, { color: c, roughness: 0.55 }), pants: mat(gfx, 'p' + p, { color: p, roughness: 0.75 }), helmet: mat(gfx, 'h' + h, { color: h, roughness: 0.3, metalness: 0.1 }),
    ski: mat(gfx, 's' + s, { color: s, roughness: 0.35 }), boot: mat(gfx, 'b' + b, { color: b, roughness: 0.4 }), dark: mat(gfx, 'dark', { color: '#1b1c1e', roughness: 0.6 }),
    base: mat(gfx, 'base', { color: '#26282b', roughness: 0.4 }), metal: mat(gfx, 'metal', { color: '#9aa0a6', roughness: 0.3, metalness: 0.8 }), skin: mat(gfx, 'skin', { color: '#d9a07a', roughness: 0.7 }),
    lens: mat(gfx, 'lens', { color: '#ff8a1e', roughness: 0.08, metalness: 0.85, emissive: '#5a2400', emissiveIntensity: 0.4 }), pole: mat(gfx, 'pole', { color: '#3a3d42', roughness: 0.35, metalness: 0.6 }),
    stripe: mat(gfx, 'stripe' + c, { color: '#f4f4f0', roughness: 0.5 }),
  };
}
const G = {};
// lo: the low-poly set for the figures baked by the hundred (the crowd at the finishes, the people in the chairs): 650–950 triangles
// against 3 500
function geos(lo) {
  if (G[!!lo]) return G[!!lo];
  const n = (hi, low) => lo ? low : hi, limb = (r0, r1, seg = n(10, 5)) => new THREE.CylinderGeometry(r1, r0, 1, seg, 1).translate(0, 0.5, 0);   // r0 at y = 0, r1 at y = 1
  // the jacket: narrower at the waist, wide at the shoulders, a little deeper at the chest; y from 0 (waist) to 1 (collar)
  const torso = new THREE.BoxGeometry(1, 1, 1, 1, 3, 1).translate(0, 0.5, 0), tp = torso.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i), w = 0.31 + 0.11 * sm(y * 1.4), d = 0.2 + 0.04 * Math.sin(Math.PI * Math.min(1, y * 1.2)); tp.setX(i, tp.getX(i) * (y > 0.97 ? w * 0.75 : w)); tp.setZ(i, tp.getZ(i) * d); }
  torso.computeVertexNormals();
  // a carving ski: 1.75 m, wide at tip and tail and narrow underfoot (the sidecut), the tip turned up; base at y = 0, binding at z = 0
  const ski = (() => { const P = [], I = [], n = lo ? 6 : 24; for (let i = 0; i <= n; i++) { const u = i / n, z = -0.875 + 1.75 * u, w = 0.034 + 0.008 * Math.pow(Math.abs(z) / 0.875, 2) + (z > 0.7 ? 0.004 : 0), y = z > 0.68 ? 0.07 * ((z - 0.68) / 0.195) ** 2 : z < -0.78 ? 0.025 * ((-0.78 - z) / 0.095) ** 2 : 0, t = 0.017 * (1 - 0.5 * Math.abs(z) / 0.875);
    P.push(-w, y, z, w, y, z, w, y + t, z, -w, y + t, z); }
    for (let i = 0; i < n; i++) { const a = i * 4, b = a + 4; for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0]]) I.push(a + p, a + q, b + p, a + q, b + q, b + p); }
    I.push(0, 2, 1, 0, 3, 2, n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); return g; })();
  const skiG = ski.toNonIndexed(); skiG.computeVertexNormals();
  // the helmet: the crown down to the brow, and the back down over the neck (the face open for the goggles)
  const helmet = mergeGeometries([new THREE.SphereGeometry(1, n(18, 8), n(8, 3), 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.SphereGeometry(1, n(12, 5), n(3, 1), Math.PI + 0.5, Math.PI - 1, Math.PI * 0.5, Math.PI * 0.2)]);
  return (G[!!lo] = {
    thigh: limb(0.095, 0.074), shin: limb(0.07, 0.06), upper: limb(0.062, 0.05), fore: limb(0.05, 0.043), pole: limb(0.0125, 0.009, n(6, 3)), grip: limb(0.018, 0.016, n(8, 4)).scale(1, 0.15, 1),
    neck: limb(0.05, 0.048), torso, pelvis: new THREE.SphereGeometry(1, n(12, 6), n(8, 4)).scale(0.165, 0.12, 0.125), sphere: new THREE.SphereGeometry(1, n(14, 6), n(10, 4)), helmet,
    lens: new THREE.CylinderGeometry(0.122, 0.118, 0.062, n(16, 5), 1, true, -1.0, 2.0), strap: new THREE.CylinderGeometry(0.126, 0.126, 0.032, n(18, 6), 1, true, 1.0, Math.PI * 2 - 2.0),
    basket: new THREE.CylinderGeometry(0.048, 0.048, 0.008, n(10, 5)), glove: new THREE.BoxGeometry(0.09, 0.11, 0.085), shell: new THREE.BoxGeometry(0.115, 0.11, 0.3), cuff: limb(0.065, 0.062, n(8, 5)).scale(1.05, 1, 1.15),
    ski: skiG, binding: new THREE.BoxGeometry(0.066, 0.035, 0.34), heel: new THREE.BoxGeometry(0.07, 0.05, 0.08), stripe: new THREE.BoxGeometry(0.02, 0.002, 1.2),
  });
}

// ---------------------------------------------------------------- the pose
// P: c crouch 0…1, tk tuck 0…1, inc lean into the turn (rad, + left), ang angulation share, plow 0…1, walk 0…1 (herringbone),
// twist upper body yaw against the skis (rad, + left), pole 0…1 stroke phase with poleK 0…1, skate, air, spin, wob 0…1 (arms
// windmill), ext 0…1 (stretch at take-off), seated, t time, ground {L, R}: how far the snow under each ski is above (+) the feet's
// origin and its pitch (rad), so the skis lie on the snow and the knees take the difference
export function poseJoints(P, J = {}) {
  for (const k of ['aL', 'aR', 'kL', 'kR', 'hL', 'hR', 'pel', 'neck', 'head', 'sL', 'sR', 'eL', 'eR', 'wL', 'wR', 'tL', 'tR']) J[k] = J[k] || V();
  J.skiL = J.skiL || {}; J.skiR = J.skiR || {};
  const c = P.c || 0, tk = P.tk || 0, pl = P.plow || 0, inc = P.inc || 0, ext = P.ext || 0, wob = P.wob || 0, walk = P.walk || 0, t = P.t || 0, pk = P.poleK || 0, ph = P.pole || 0;
  if (P.seated) {
    J.hL.set(0.1, 0.1, 0.02); J.hR.set(-0.1, 0.1, 0.02); J.aL.set(0.12, -0.33, 0.5); J.aR.set(-0.12, -0.33, 0.5);
    J.pel.set(0, 0.1, 0.02); J.neck.set(0, 0.6, -0.07); J.head.set(0, 0.77, -0.04);
    J.sL.set(0.19, 0.55, -0.06); J.sR.set(-0.19, 0.55, -0.06); J.wL.set(0.17, 0.3, 0.36); J.wR.set(-0.2, 0.3, 0.33);
    J.tL.set(0.24, -0.85, 0.42); J.tR.set(0.22, -0.85, 0.44);
    for (const [s, a, sd] of [[J.skiL, J.aL, 1], [J.skiR, J.aR, -1]]) { s.x = a.x; s.y = a.y - 0.14; s.z = a.z + 0.03; s.yaw = sd * 0.04; s.roll = 0; s.pitch = -0.32; }
    J.phi = -0.12; J.phiH = -0.05; J.twist = 0; J.lean = 0;
    return J;
  }
  const cr = Math.max(0, Math.max(c, tk * 0.95) - ext * 0.5), sk = P.skate ? 1 : 0, side = ph < 0.5 ? 1 : -1, push = sk * pk * Math.sin(Math.PI * ((ph * 2) % 1));
  // the feet: a hip's width apart; wider for the plough, the pushing leg out to the side when skating, the inside ski a bit ahead
  const fw = 0.105 + 0.1 * pl + 0.07 * walk, gL = P.ground ? P.ground.L : 0, gR = P.ground ? P.ground.R : 0;
  J.aL.set(fw + (side > 0 ? 0.16 * push : 0), 0.14 + gL + (side > 0 ? 0.05 * push * push : 0), 0.07 * Math.max(0, inc) - 0.03);
  J.aR.set(-fw - (side < 0 ? 0.16 * push : 0), 0.14 + gR + (side < 0 ? 0.05 * push * push : 0), 0.07 * Math.max(0, -inc) - 0.03);
  const skiYaw = { L: -0.3 * pl + 0.55 * walk + (side > 0 ? 0.42 * push : 0), R: 0.3 * pl - 0.55 * walk - (side < 0 ? 0.42 * push : 0) };
  // hips sink and move back with the crouch and the tuck; the upper body bends forward (and crunches over the poles in a stroke)
  const hy = 0.94 - 0.31 * cr + 0.05 * ext + 0.5 * (gL + gR) * 0.3, hz = -0.04 - 0.17 * cr - 0.04 * pl, shift = -side * 0.05 * push;
  J.hL.set(0.095 + shift, hy, hz); J.hR.set(-0.095 + shift, hy, hz); J.pel.set(shift, hy, hz);
  const crunch = pk * (ph > 0.3 && ph < 0.65 ? Math.sin(Math.PI * (ph - 0.3) / 0.35) : 0), phi = 0.3 + 0.22 * c + 1.0 * tk + 0.45 * crunch - 0.15 * ext + 0.15 * walk;
  J.neck.set(shift, hy + L.torso * Math.cos(phi), hz + L.torso * Math.sin(phi)); J.phi = phi; J.phiH = phi * 0.45 - 0.05;
  const up = _a.set(0, Math.cos(phi), Math.sin(phi));
  J.head.copy(J.neck).addScaledVector(up, 0.06).add(_b.set(0, 0.12 * Math.cos(J.phiH), 0.12 * Math.sin(J.phiH)));
  J.sL.copy(J.neck).add(_b.set(0.19, 0, 0)).addScaledVector(up, -0.05); J.sR.copy(J.neck).add(_b.set(-0.19, 0, 0)).addScaledVector(up, -0.05);
  // hands: forward and a little out; in a tuck in front of the knees with the poles under the arms
  const hw = [0.29, hy + 0.12, hz + 0.42], ht = [0.13, hy - 0.02, hz + 0.68];
  for (const [w, sx] of [[J.wL, 1], [J.wR, -1]]) w.set(sx * (hw[0] + (ht[0] - hw[0]) * tk), hw[1] + (ht[1] - hw[1]) * tk, hw[2] + (ht[2] - hw[2]) * tk);
  for (const [tp, w, sx] of [[J.tL, J.wL, 1], [J.tR, J.wR, -1]]) tp.copy(w).add(_b.set(sx * 0.07, -0.8 + 1.05 * tk, -0.6 - 0.45 * tk).normalize().multiplyScalar(L.pole));
  // the double-pole stroke: reach forward, plant, pull down past the hips, swing back
  if (pk > 0.01 && !sk) {
    const z = ph < 0.3 ? -0.05 + 0.4 * sm(ph / 0.3) : ph < 0.65 ? 0.35 - 0.55 * sm((ph - 0.3) / 0.35) : -0.2 + 0.15 * sm((ph - 0.65) / 0.35);
    const y = ph < 0.3 ? 0.22 * sm(ph / 0.3) : ph < 0.65 ? 0.22 - 0.32 * sm((ph - 0.3) / 0.35) : -0.1 + 0.1 * sm((ph - 0.65) / 0.35), planted = ph > 0.3 && ph < 0.65;
    for (const [w, tp, sx] of [[J.wL, J.tL, 1], [J.wR, J.tR, -1]]) { w.lerp(_b.set(sx * 0.24, hy + 0.16 + y, hz + 0.25 + z), pk); tp.lerp(_c.set(sx * 0.32, 0.02, planted ? 0.25 - 0.85 * sm((ph - 0.3) / 0.35) : hz + z - 0.4), pk); }
  } else if (sk && pk > 0.01) { // skating: the arms swing with the legs
    const s = Math.sin(ph * Math.PI * 2); J.wL.z += 0.2 * s; J.wR.z -= 0.2 * s; J.tL.z += 0.2 * s; J.tR.z -= 0.2 * s;
  }
  // in the air: arms out for balance (in close while spinning); a wobble windmills them; at take-off they swing forward
  if (P.air) { const a = P.spin ? 0.16 : 0.42; J.wL.set(a, hy + 0.36, hz + 0.18); J.wR.set(-a, hy + 0.36, hz + 0.18); J.tL.copy(J.wL).add(_b.set(0.15, -0.75, -0.9).normalize().multiplyScalar(L.pole)); J.tR.copy(J.wR).add(_b.set(-0.15, -0.75, -0.9).normalize().multiplyScalar(L.pole)); }
  if (wob > 0.05) { const a = t * 13; J.wL.lerp(_b.set(0.45 + 0.12 * Math.cos(a), hy + 0.42 + 0.3 * Math.sin(a), hz + 0.15 + 0.2 * Math.cos(a)), wob); J.wR.lerp(_b.set(-0.45 - 0.12 * Math.cos(a + 2), hy + 0.42 + 0.3 * Math.sin(a + 2), hz + 0.15), wob);
    J.tL.copy(J.wL).add(_b.set(0.1, -0.6, -0.5).normalize().multiplyScalar(L.pole)); J.tR.copy(J.wR).add(_b.set(-0.1, -0.6, -0.5).normalize().multiplyScalar(L.pole)); }
  if (ext > 0.05) { J.wL.lerp(_b.set(0.25, hy + 0.5, hz + 0.65), ext); J.wR.lerp(_b.set(-0.25, hy + 0.5, hz + 0.65), ext); J.tL.copy(J.wL).add(_b.set(0.08, -0.6, -0.8).normalize().multiplyScalar(L.pole)); J.tR.copy(J.wR).add(_b.set(-0.08, -0.6, -0.8).normalize().multiplyScalar(L.pole)); }
  // the upper body faces where the skier goes (a hockey stop, a skid) a little more than the skis do
  const tw = P.twist || 0; if (Math.abs(tw) > 1e-3) { const cs = Math.cos(tw), sn = Math.sin(tw), cx = J.pel.x, cz = J.pel.z;
    for (const p of [J.neck, J.head, J.sL, J.sR, J.wL, J.wR, J.tL, J.tR]) { const x = p.x - cx, z = p.z - cz; p.x = cx + x * cs + z * sn; p.z = cz - x * sn + z * cs; } }
  J.twist = tw;
  // lean into the turn round the feet; the upper body leans back up round the hips (angulation)
  const lean = -inc, rz = (p, a, cx, cy) => { const cs = Math.cos(a), sn = Math.sin(a), x = p.x - cx, y = p.y - cy; p.x = cx + x * cs - y * sn; p.y = cy + x * sn + y * cs; };
  if (Math.abs(lean) > 1e-3) { for (const p of [J.aL, J.aR, J.hL, J.hR, J.pel, J.neck, J.head, J.sL, J.sR, J.wL, J.wR, J.tL, J.tR]) rz(p, lean, 0, 0);
    const back = -lean * (P.ang ?? 0.42); for (const p of [J.neck, J.head, J.sL, J.sR, J.wL, J.wR, J.tL, J.tR]) rz(p, back, J.pel.x, J.pel.y); }
  J.lean = lean;
  for (const [s, a, yaw, g] of [[J.skiL, J.aL, skiYaw.L, P.ground ? P.ground.pL : 0], [J.skiR, J.aR, skiYaw.R, P.ground ? P.ground.pR : 0]]) { s.x = a.x; s.y = a.y - 0.14; s.z = a.z + 0.03; s.yaw = yaw; s.roll = Math.max(-1.25, Math.min(1.25, lean * 1.12)); s.pitch = g || 0; }
  // pole tips stay above the snow
  for (const tp of [J.tL, J.tR]) if (tp.y < 0.01) { const w = tp === J.tL ? J.wL : J.wR; tp.sub(w).multiplyScalar((w.y - 0.01) / Math.max(0.05, w.y - tp.y)).add(w); }
  return J;
}
// a knee or an elbow between a and b (lengths l1, l2), bending towards hint
function ik(a, b, l1, l2, hint, out) {
  const d = _x.subVectors(b, a), dl = d.length(); if (dl < 1e-5) return out.copy(a);
  d.divideScalar(dl); const D = Math.min(dl, l1 + l2 - 1e-4), u = (l1 * l1 - l2 * l2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, l1 * l1 - u * u));
  const p = _y.copy(hint).addScaledVector(d, -hint.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, 0, 1); p.normalize();
  return out.copy(a).addScaledVector(d, u).addScaledVector(p, h);
}

// ---------------------------------------------------------------- the figure
export class SkierFigure {
  // o: {jacket, pants, helmet, ski, boot} colours; o.shadow: cast shadows; o.lo: the low-poly shapes
  constructor(gfx, o = {}) {
    const g = geos(o.lo), M = this.mats = skierMats(gfx, o), mk = (geo, m, p = this.body) => { const x = new THREE.Mesh(geo, m); x.castShadow = o.shadow !== false; x.receiveShadow = true; p.add(x); return x; };
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body); this.J = {};
    this.thighL = mk(g.thigh, M.pants); this.thighR = mk(g.thigh, M.pants); this.shinL = mk(g.shin, M.pants); this.shinR = mk(g.shin, M.pants);
    this.kneeL = mk(g.sphere, M.pants); this.kneeR = mk(g.sphere, M.pants); this.pelvis = mk(g.pelvis, M.pants);
    this.torso = mk(g.torso, M.jacket); this.neckM = mk(g.neck, M.dark); this.shL = mk(g.sphere, M.jacket); this.shR = mk(g.sphere, M.jacket);
    this.upL = mk(g.upper, M.jacket); this.upR = mk(g.upper, M.jacket); this.foL = mk(g.fore, M.jacket); this.foR = mk(g.fore, M.jacket); this.elL = mk(g.sphere, M.jacket); this.elR = mk(g.sphere, M.jacket);
    this.glL = mk(g.glove, M.dark); this.glR = mk(g.glove, M.dark);
    this.headG = new THREE.Group(); this.body.add(this.headG);
    this.face = mk(g.sphere, M.skin, this.headG); this.face.scale.set(0.09, 0.108, 0.1); this.face.position.set(0, -0.035, 0.0);
    this.helmet = mk(g.helmet, M.helmet, this.headG); this.helmet.scale.setScalar(0.128); this.helmet.position.set(0, 0.03, -0.012);
    this.lens = mk(g.lens, M.lens, this.headG); this.lens.position.set(0, -0.004, 0.0); this.strap = mk(g.strap, M.dark, this.headG); this.strap.position.set(0, -0.004, -0.008);
    this.poleL = mk(g.pole, M.pole); this.poleR = mk(g.pole, M.pole); this.gripL = mk(g.grip, M.dark); this.gripR = mk(g.grip, M.dark); this.bkL = mk(g.basket, M.dark); this.bkR = mk(g.basket, M.dark);
    this.skis = [0, 1].map(() => { const s = new THREE.Group(); s.rotation.order = 'YZX'; this.body.add(s); mk(g.ski, M.ski, s); const st = mk(g.stripe, M.stripe, s); st.position.set(0, 0.018, 0.05); mk(g.binding, M.metal, s).position.set(0, 0.034, 0.0); mk(g.heel, M.dark, s).position.set(0, 0.05, -0.15); return s; });
    this.boots = [0, 1].map(() => ({ shell: mk(g.shell, M.boot), cuff: mk(g.cuff, M.boot) }));
    this.pose({ c: 0.15 });
  }
  setColor(c) { this.torso.material = this.shL.material = this.shR.material = this.upL.material = this.upR.material = this.foL.material = this.foR.material = this.elL.material = this.elR.material = skierMats(null, { jacket: c }).jacket; }
  // a mesh between two joints
  bone(m, a, b) { const d = _a.subVectors(b, a), l = d.length() || 1e-4; m.position.copy(a); m.quaternion.setFromUnitVectors(_b.set(0, 1, 0), d.divideScalar(l)); m.scale.set(1, l, 1); }
  pose(P) {
    const J = poseJoints(P, this.J);
    // knees bend forward, elbows out and back
    const kh = _c.set(0, 0, 1); this.kL = ik(J.aL, J.hL, L.shin, L.thigh, kh, this.kL || V()); this.kR = ik(J.aR, J.hR, L.shin, L.thigh, kh, this.kR || V());
    this.eL = ik(J.sL, J.wL, L.upper, L.fore, _c.set(0.6, -0.4, -0.5), this.eL || V()); this.eR = ik(J.sR, J.wR, L.upper, L.fore, _c.set(-0.6, -0.4, -0.5), this.eR || V());
    this.bone(this.shinL, this.kL, J.aL); this.bone(this.shinR, this.kR, J.aR); this.bone(this.thighL, J.hL, this.kL); this.bone(this.thighR, J.hR, this.kR);
    this.kneeL.position.copy(this.kL); this.kneeR.position.copy(this.kR); this.kneeL.scale.setScalar(0.073); this.kneeR.scale.setScalar(0.073);
    // pelvis and jacket: a full frame from the hips (left) and the spine (up)
    const yv = _y.subVectors(J.neck, J.pel).normalize(), xv = _x.subVectors(J.sL, J.sR); xv.addScaledVector(yv, -xv.dot(yv)).normalize(); const zv = _z.crossVectors(xv, yv);
    _m.makeBasis(xv, yv, zv); this.torso.quaternion.setFromRotationMatrix(_m); this.torso.position.copy(J.pel).addScaledVector(yv, 0.06); this.torso.scale.set(1, J.neck.distanceTo(J.pel) + 0.02, 1);
    const hx = _a.subVectors(J.hL, J.hR).normalize(), hz = _b.crossVectors(hx, _c.set(0, 1, 0)).normalize(), hy = _c.crossVectors(hz, hx); _m.makeBasis(hx, hy, hz);
    this.pelvis.quaternion.setFromRotationMatrix(_m); this.pelvis.position.copy(J.pel).add(_a.set(0, 0.02, 0));
    this.bone(this.neckM, J.neck, _a.copy(J.neck).addScaledVector(yv, 0.08));
    this.headG.position.copy(J.head); _e.set(-(J.phiH ?? 0) * 0.6, J.twist || 0, -(J.lean || 0) * 0.5, 'YXZ'); this.headG.quaternion.setFromEuler(_e);
    // arms
    for (const [sh, el, up, fo, gl, s, e, w] of [[this.shL, this.elL, this.upL, this.foL, this.glL, J.sL, this.eL, J.wL], [this.shR, this.elR, this.upR, this.foR, this.glR, J.sR, this.eR, J.wR]]) {
      sh.position.copy(s); sh.scale.setScalar(0.07); el.position.copy(e); el.scale.setScalar(0.05); this.bone(up, s, e); this.bone(fo, e, w); gl.position.copy(w); gl.quaternion.copy(fo.quaternion); }
    // poles: from the glove to the tip, the grip in the hand, the basket near the tip
    for (const [pm, gr, bk, w, t] of [[this.poleL, this.gripL, this.bkL, J.wL, J.tL], [this.poleR, this.gripR, this.bkR, J.wR, J.tR]]) {
      this.bone(pm, _a.copy(w).add(_b.set(0, 0.06, 0)), t); const dir = _c.subVectors(t, w).normalize();
      gr.position.copy(w).addScaledVector(dir, -0.09); gr.quaternion.copy(pm.quaternion); bk.position.copy(t).lerp(w, 0.09); bk.quaternion.copy(pm.quaternion); }
    // skis (yaw for the plough and skating, roll onto the edge, pitch with the snow) and the boots on them
    [J.skiL, J.skiR].forEach((s, i) => {
      const g = this.skis[i]; g.position.set(s.x, s.y, s.z); g.rotation.set(-s.pitch, s.yaw, s.roll);
      const b = this.boots[i], a = i ? J.aR : J.aL, k = i ? this.kR : this.kL;
      b.shell.position.set(0, 0.105, 0.0).applyEuler(g.rotation).add(g.position); b.shell.rotation.copy(g.rotation);
      this.bone(b.cuff, _a.copy(a).add(_b.set(0, -0.06, 0)), _c.copy(a).lerp(k, 0.55)); });
    this.P = P;
  }
  dispose() { this.root.parent && this.root.parent.remove(this.root); }
}
// a figure frozen in one pose as a single mesh with vertex colours (other skiers, people in the chairs, spectators): one draw call each
// (o.lo: from the low-poly shapes)
export function figureGeometry(P, o = {}) {
  const f = new SkierFigure(null, Object.assign({ shadow: false }, o)); f.pose(P);
  if (o.noSki) for (const m of [...f.skis, f.poleL, f.poleR, f.gripL, f.gripR, f.bkL, f.bkR]) m.visible = false;      // on foot: no skis, no poles
  f.root.updateMatrixWorld(true); const parts = [], cc = new THREE.Color();
  f.root.traverse(m => { if (!m.isMesh || !m.visible || m.parent && !m.parent.visible) return; const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(m.matrixWorld); cc.copy(m.material.color); const n = g.attributes.position.count, C = new Float32Array(n * 3); for (let i = 0; i < n; i++) { C[i * 3] = cc.r; C[i * 3 + 1] = cc.g; C[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(C, 3)); parts.push(g); });
  const g = mergeGeometries(parts); g.computeBoundingSphere(); return g;
}

// ---------------------------------------------------------------- the player's skier
// follows a physics Skier: on the snow (each ski on the snow under it, the knees taking the bumps the body does not feel), turned
// with the skis, pitched with the slope; the pose from the physics; a tumble when it falls; the skis and poles fly off in a hard fall
export class SkierVisual {
  constructor(gfx, world, o = {}) {
    this.gfx = gfx; this.world = world; this.fig = new SkierFigure(gfx, o); this.root = this.fig.root; gfx.scene.add(this.root); this.root.rotation.order = 'YXZ';
    this.ext = 0; this.pre = 0; this.crashFast = false; this.t = 0; this.ground = { L: 0, R: 0, pL: 0, pR: 0 }; this.lean = 0;
  }
  // s: the Skier; o: {going (skiing, not standing at the top), kick (the kicker ahead)}
  sync(s, dt, o = {}) {
    const f = this.fig, W = this.world, p = s.pos, h = s.head, dx = Math.sin(h), dz = Math.cos(h); this.t += dt;
    this.root.visible = true;
    if (this.root.parent !== this.gfx.scene) this.gfx.scene.add(this.root);
    const A = o.area, gh = (x, z) => A ? A.ground(x, z) : W.height(x, z);
    const slope = s.air ? Math.atan2(s.vel.y, Math.max(1, Math.hypot(s.vel.x, s.vel.z))) * 0.5 : Math.atan2(gh(p.x + dx * 0.8, p.z + dz * 0.8) - gh(p.x - dx * 0.8, p.z - dz * 0.8), 1.6);
    this.root.position.set(p.x, p.y, p.z); this.root.rotation.set(-slope, h, 0);
    // each ski on the snow under it: its height and pitch against the body's slope (the knees take the difference)
    const G = this.ground; if (!s.air && s.crashT === 0) for (const [sd, k] of [[1, 'L'], [-1, 'R']]) { const vh = (x, z) => A ? Math.max(W.height(x, z), A.ground(x, z)) : W.height(x, z), x = p.x + dz * sd * 0.11, z = p.z - dx * sd * 0.11, y0 = vh(x, z), yt = vh(x + dx * 0.8, z + dz * 0.8), yb = vh(x - dx * 0.8, z - dz * 0.8);
      G[k] += (Math.max(-0.12, Math.min(0.12, y0 - p.y)) * Math.cos(slope) - G[k]) * Math.min(1, dt * 20); G['p' + k] += (Math.max(-0.2, Math.min(0.2, Math.atan2(yt - yb, 1.6) - slope)) - G['p' + k]) * Math.min(1, dt * 15); }
    else { G.L *= 0.9; G.R *= 0.9; G.pL *= 0.9; G.pR *= 0.9; }
    this.ext = Math.max(0, this.ext - dt * 4); this.pre += ((o.kick ? 1 : 0) - this.pre) * Math.min(1, dt * 8);
    if (s.crashT > 0) {
      // tumble (a full roll when it was fast), lie still, get up
      const ct = s.crashT, k2 = Math.min(1, ct * 3), roll = this.crashFast ? sm(ct / 0.9) * Math.PI * 2 : 0, upk = sm((ct - 1.6) / 0.8);
      f.body.rotation.set((-k2 * 1.25 - roll) * (1 - upk), 0, k2 * 1.2 * (1 - upk)); f.body.position.set(0, 0.25 * k2 * (1 - upk), 0);
      f.pose({ c: 1 - 0.7 * upk, t: this.t });
    } else {
      f.body.rotation.set(0, 0, 0); f.body.position.set(0, 0, 0);
      const going = o.going !== false, twist = going && Math.hypot(s.vel.x, s.vel.z) > 1.5 ? Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(s.dir - h), Math.cos(s.dir - h)) * 0.75)) : 0;
      this.lean += ((going ? s.inc : 0) - this.lean) * Math.min(1, dt * 10);
      f.pose({ c: Math.min(1, s.plow * 0.3 + s.land * 0.8 + this.pre * 0.7 + (s.air ? 0.35 : going && s.speed > 2 ? 0.42 + 0.25 * Math.min(1, Math.abs(this.lean)) : 0.18) + 0.25 * Math.max(0, s.unweight < 0 ? -s.unweight * 0.3 : 0)), tk: s.tuck, inc: this.lean, plow: s.plow, walk: s.walk, twist, pole: s.pole, poleK: going ? s.poleK : 0,
        skate: s.poleK > 0.5 && s.speed > 2.5 && !s.walk, air: s.air && s.airT > 0.1, spin: Math.abs(s.spinV) > 2, wob: s.wob, ext: this.ext, t: this.t, ground: G, ang: 0.45 });
    }
  }
  takeoff() { this.ext = 1; }
  seat(chair, side = 0.32) {
    // in a chair: the figure in the chair's frame (the seat 2.41 m under the cable)
    const f = this.fig; f.body.rotation.set(0, 0, 0); f.body.position.set(0, 0, 0); f.pose({ seated: true });
    this.root.position.set(chair.x, chair.y, chair.z); this.root.rotation.set(0, chair.yaw, 0); this.root.translateX(side); this.root.translateY(-2.41); this.root.translateZ(-0.06);
  }
  dispose() { this.fig.dispose(); }
}

// ---------------------------------------------------------------- snow spray
// soft white puffs thrown off the edges when the skis skid, plough or stop, a cloud in deep snow, a burst at a landing or a fall
const SPRAY_VS = `uniform float uScale; attribute vec2 aS; varying float vA;
#include <fog_pars_vertex>
void main(){ vec3 transformed = position; vec4 mv = viewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aS.x * uScale / max(0.3, -mv.z), 1.0, 140.0); vA = aS.y;
#include <fog_vertex>
}`;
const SPRAY_FS = `uniform float uNight; varying float vA;
#include <fog_pars_fragment>
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard; float a = vA * (1.0 - r * r);
  gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * (0.12 + 0.88 * (1.0 - uNight)), a);
#include <fog_fragment>
}`;
export class SnowSpray {
  constructor(gfx, n = 700) {
    this.gfx = gfx; this.n = n; this.live = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.age = new Float32Array(n); this.life = new Float32Array(n); this.size = new Float32Array(n);
    const g = this.geo = new THREE.BufferGeometry(); this.aP = new Float32Array(n * 3); this.aS = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.aP, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aS', new THREE.BufferAttribute(this.aS, 2).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), { uSunDir: U.uSunDir, uFogSun: U.uFogSun, uFogFall: U.uFogFall, uNight: U.uNight, uScale: { value: 400 } }),
      vertexShader: SPRAY_VS, fragmentShader: SPRAY_FS, transparent: true, depthWrite: false, fog: true });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 7; gfx.overlay.add(this.pts); this.acc = 0;
  }
  emit(x, y, z, vx, vy, vz, life, size) { if (this.live >= this.n) return; const i = this.live++; this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.age[i] = 0; this.life[i] = life; this.size[i] = size; }
  // a burst: n puffs round (x, y, z) thrown out at up to sp m/s
  burst(x, y, z, n, sp, vx = 0, vz = 0) { const R = Math.random; for (let i = 0; i < n; i++) { const a = R() * 6.283, s = sp * (0.3 + 0.7 * R()); this.emit(x + (R() - 0.5) * 0.4, y + 0.1, z + (R() - 0.5) * 0.4, vx * 0.4 + Math.cos(a) * s, 0.8 + R() * sp * 0.6, vz * 0.4 + Math.sin(a) * s, 0.7 + R() * 0.8, 0.2 + R() * 0.25); } }
  clear() { this.live = 0; }
  // s: the Skier. Spray off the downhill edges in proportion to the skid, the plough and the hockey stop; a cloud in deep snow
  update(dt, s) {
    const R = Math.random;
    if (s && !s.air && s.crashT === 0 && s.speed > 1) {
      const deep = s.surf === 'deep', ah = Math.abs(s.hock), amt = Math.min(1.5, Math.max(0, s.skid - 0.4) * 0.35) + (s.plow > 0.5 ? 0.4 * Math.min(1, s.speed / 6) : 0) + ah * 1.4 + (deep ? 0.6 * Math.min(1, s.speed / 8) : 0) + (s.carve > 0.6 && Math.abs(s.inc) > 0.6 ? 0.25 : 0);
      this.acc += dt * amt * 220;
      const dx = Math.sin(s.head), dz = Math.cos(s.head), sv = s.vel, sd = Math.sign(s.vel.x * dz - s.vel.z * dx) || 1;    // the side the skis slide towards
      while (this.acc >= 1) {
        this.acc -= 1; const along = (R() - 0.5) * 1.4, off = 0.12 + R() * 0.1, x = s.pos.x + dx * along + dz * sd * off, z = s.pos.z + dz * along - dx * sd * off, out = 1 + s.speed * (0.12 + 0.15 * R());
        this.emit(x, s.pos.y + 0.03, z, sv.x * (0.35 + 0.3 * R()) + dz * sd * out, 0.6 + R() * (0.8 + s.speed * 0.08), sv.z * (0.35 + 0.3 * R()) - dx * sd * out, 0.5 + R() * 0.6, deep ? 0.3 + R() * 0.3 : 0.12 + R() * 0.16);
      }
    } else this.acc = 0;
    const drag = Math.exp(-dt * 2.2);
    for (let i = 0; i < this.live; i++) {
      this.age[i] += dt;
      if (this.age[i] > this.life[i]) { const j = --this.live; this.p.copyWithin(i * 3, j * 3, j * 3 + 3); this.v.copyWithin(i * 3, j * 3, j * 3 + 3); this.age[i] = this.age[j]; this.life[i] = this.life[j]; this.size[i] = this.size[j]; i--; continue; }
      this.v[i * 3] *= drag; this.v[i * 3 + 2] *= drag; this.v[i * 3 + 1] = this.v[i * 3 + 1] * drag - 6 * dt;
      for (let k = 0; k < 3; k++) this.p[i * 3 + k] += this.v[i * 3 + k] * dt;
      const u = this.age[i] / this.life[i]; this.aP.set([this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]], i * 3); this.aS[i * 2] = this.size[i] * (1 + u * 3); this.aS[i * 2 + 1] = 0.7 * Math.min(1, u * 8) * (1 - u) * (1 - u);
    }
    const c = this.gfx.camera; this.mat.uniforms.uScale.value = (this.gfx.size ? this.gfx.size.H : 600) / (2 * Math.tan(c.fov * Math.PI / 360));
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aS.needsUpdate = true; this.geo.setDrawRange(0, this.live);
  }
  dispose() { this.gfx.overlay.remove(this.pts); this.geo.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------- tracks in the snow
// one ribbon per ski laid on the snow every 25 cm: two thin lines when carving, a wide smear when skidding, a furrow in deep snow;
// they fade over a minute (the oldest are reused)
export class SkiTracks {
  // h(x, z): the height of the snow the tracks lie on
  constructor(gfx, world, n = 1400, h = (x, z) => world.height(x, z)) {
    this.gfx = gfx; this.world = world; this.h = h; this.n = n; this.k = 0; this.last = [null, null]; this.T = 0;
    const g = this.geo = new THREE.BufferGeometry(); this.P = new Float32Array(n * 4 * 3); this.C = new Float32Array(n * 4 * 4); this.B = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.C, 4).setUsage(THREE.DynamicDrawUsage));
    const I = []; for (let i = 0; i < n; i++) { const a = i * 4; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } g.setIndex(I); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 12).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    this.mat = prep(new THREE.MeshLambertMaterial({ color: '#6c849c', vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; gfx.scene.add(this.mesh);
  }
  clear() { this.C.fill(0); this.geo.attributes.color.needsUpdate = true; this.last = [null, null]; }
  // lay a piece of ski i's track up to (x, z) with half width w and strength a (0…1)
  lay(i, x, z, w, a) {
    const l = this.last[i]; if (l && Math.hypot(x - l.x, z - l.z) < 0.25) return;
    if (!l || Math.hypot(x - l.x, z - l.z) > 2) { this.last[i] = { x, z, y: this.h(x, z) + 0.02, w, a }; return; }
    const y = this.h(x, z) + 0.02, dx = x - l.x, dz = z - l.z, L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L, k = this.k, P = this.P, C = this.C;
    P.set([l.x + nx * l.w, l.y, l.z + nz * l.w, l.x - nx * l.w, l.y, l.z - nz * l.w, x + nx * w, y, z + nz * w, x - nx * w, y, z - nz * w], k * 12);
    for (let j = 0; j < 4; j++) C.set([1, 1, 1, (j < 2 ? l.a : a) * 0.7], k * 16 + j * 4);
    this.B[k] = this.T; this.k = (k + 1) % this.n; this.last[i] = { x, z, y, w, a };
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
  update(dt, s) {
    this.T += dt;
    if (s && !s.air && s.crashT === 0 && s.speed > 0.6) {
      const dx = Math.sin(s.head), dz = Math.cos(s.head), deep = s.surf === 'deep', w = deep ? 0.12 : Math.abs(s.hock) > 0.3 ? 0.3 : s.skid > 1 ? Math.min(0.25, 0.05 + s.skid * 0.06) : 0.045, a = deep ? 0.9 : s.skid > 1 ? 0.55 : 0.8, off = 0.11 + 0.1 * s.plow;
      for (let i = 0; i < 2; i++) { const sd = i ? -1 : 1; this.lay(i, s.pos.x + dz * sd * off, s.pos.z - dx * sd * off, w, a); }
    } else this.last = [null, null];
    // fade over about a minute
    this.fadeT = (this.fadeT || 0) - dt; if (this.fadeT > 0) return; this.fadeT = 0.5;
    const C = this.C; let any = false;
    for (let k = 0; k < this.n; k++) { const age = this.T - this.B[k]; if (age > 40 && C[k * 16 + 3] > 0) { for (let j = 0; j < 4; j++) C[k * 16 + j * 4 + 3] *= 0.9; if (C[k * 16 + 3] < 0.01) for (let j = 0; j < 4; j++) C[k * 16 + j * 4 + 3] = 0; any = true; } }
    if (any) this.geo.attributes.color.needsUpdate = true;
  }
  dispose() { this.gfx.scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
