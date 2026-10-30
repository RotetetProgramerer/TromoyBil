// A marina (sim/data/marinas.js): the concrete quay by the road where the car parks, the red boathouse with the kiosk and the sign,
// the gangway down to the floating pontoon with its T-head, lamp posts, cleats and a life ring, the flag, and boats moored along
// the pontoon that ride the waves. The quay is a deck the car drives on; the pontoon and the boats are colliders for the boat.
import * as THREE from 'three';
import { prep, U } from './gfx.js';
import { SURF } from '../physics/surfaces.js';
import { Boat, waveHeight } from '../physics/boat.js';
import { boatById } from '../data/boats.js';
import { marinaPoint } from '../data/marinas.js';
import { BoatVisual } from './boatvis.js';

const std = (gfx, c, o = {}) => { const m = prep(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0 }, o))); gfx.shadowed(m); return m; };
function box(g, mat, w, h, d, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }
function sign(lines, w, h, bg, fg, accent) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h); if (accent) { x.fillStyle = accent; x.fillRect(0, h * 0.82, w, h * 0.18); }
  x.strokeStyle = fg; x.lineWidth = h * 0.04; x.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08);
  x.fillStyle = fg; x.textAlign = 'center'; x.font = `700 ${h * 0.42}px "Barlow Condensed", sans-serif`; x.fillText(lines[0], w / 2, h * (lines[1] ? 0.5 : 0.62));
  if (lines[1]) { x.font = `600 ${h * 0.17}px "Barlow Condensed", sans-serif`; x.fillText(lines[1], w / 2, h * 0.74); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// deck planks with dark seams (planks across the pontoon)
function plankTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  for (let i = 0; i < 16; i++) { const v = 0.85 + Math.random() * 0.25; x.fillStyle = `rgb(${138 * v | 0},${104 * v | 0},${70 * v | 0})`; x.fillRect(0, i * 16, 128, 16); x.fillStyle = 'rgba(30,20,12,.8)'; x.fillRect(0, i * 16 + 14, 128, 2);
    for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(60,40,25,${0.08 + Math.random() * 0.1})`; x.fillRect(Math.random() * 128, i * 16 + 2 + Math.random() * 10, 20 + Math.random() * 50, 1); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function flagTexture() {
  const c = document.createElement('canvas'); c.width = 220; c.height = 160; const x = c.getContext('2d');
  x.fillStyle = '#ba0c2f'; x.fillRect(0, 0, 220, 160); x.fillStyle = '#fff'; x.fillRect(60, 0, 40, 160); x.fillRect(0, 60, 220, 40);
  x.fillStyle = '#00205b'; x.fillRect(70, 0, 20, 160); x.fillRect(0, 70, 220, 20);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Marina {
  // m: the marina from sim/data/marinas.js; isl: the island it lies on
  constructor(gfx, world, isl, m) {
    this.gfx = gfx; this.world = world; this.isl = isl; this.m = m;
    const g = this.group = new THREE.Group(); g.position.set(m.at.x, 0, m.at.z); g.rotation.y = m.out; gfx.scene.add(g);
    // the marina frame: local x = −a (along the shore), local z = s (out from the road)
    const Y = m.at.y, cs = Math.cos(m.out), sn = Math.sin(m.out);
    const concrete = std(gfx, '#9a968c', { roughness: 0.9 }), stone = std(gfx, '#77746c', { roughness: 0.95 }), wood = std(gfx, '#8a6745', { roughness: 0.8 }), dark = std(gfx, '#2c2f32', { roughness: 0.6 });
    const red = std(gfx, '#93291f', { roughness: 0.7 }), white = std(gfx, '#f1eee6', { roughness: 0.6 }), roof = std(gfx, '#2e3134', { roughness: 0.7 }), steel = std(gfx, '#c9ccd0', { metalness: 1, roughness: 0.25 });
    const paint = std(gfx, '#f2f0ea', { roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }), float = std(gfx, '#3a3c3f', { roughness: 0.6 });
    const pt = plankTexture(); pt.repeat.set(1, 5); const planks = std(gfx, '#ffffff', { map: pt, roughness: 0.85 });
    const gt = plankTexture(); gt.repeat.set(1, 6); const gplanks = std(gfx, '#ffffff', { map: gt, roughness: 0.85 });
    this.lampMat = prep(new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd99a', emissiveIntensity: 0, roughness: 0.3 }));
    this.winMat = prep(new THREE.MeshStandardMaterial({ color: '#223038', emissive: '#ffc977', emissiveIntensity: 0, roughness: 0.15, metalness: 0.3 }));
    // the quay: a concrete block from the seabed up to the road, a timber fender along the edge, parking bays painted on it
    const q = m.quay, qw = q.a1 - q.a0, qd = q.s1 - q.s0, qx = -(q.a0 + q.a1) / 2, qz = (q.s0 + q.s1) / 2;
    box(g, stone, qw, Y + 2, qd, qx, Y / 2 - 1, qz); box(g, concrete, qw + 0.02, 0.12, qd + 0.02, qx, Y - 0.04, qz);
    box(g, wood, qw, 0.32, 0.25, qx, Y - 0.45, q.s1 + 0.12); for (let a = q.a0 + 1; a < q.a1; a += 3) box(g, wood, 0.25, Y + 1.6, 0.25, -a, Y / 2 - 0.9, q.s1 + 0.16);
    for (let k = 0; k < 4; k++) box(g, paint, 0.12, 0.01, 4.6, -(m.park.a - 4.5 + k * 3), Y + 0.025, m.park.s - 0.6);
    for (const a of [q.a0 + 0.8, q.a1 - 0.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.45, 10), dark); p.position.set(-a, Y + 0.22, q.s1 - 0.5); p.castShadow = true; g.add(p); }
    const [cx, cz] = marinaPoint(m, qz, (q.a0 + q.a1) / 2);
    isl.decks.push({ x: cx, z: cz, hw: qw / 2, hd: qd / 2, ang: m.out, y: Y, surf: SURF.CONCRETE });
    // the parking sign
    const pS = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), prep(new THREE.MeshStandardMaterial({ map: sign(['P'], 256, 256, '#1f5fa8', '#ffffff'), roughness: 0.5 })));
    const pp = new THREE.Group(); pp.position.set(-(m.park.a - 6), Y, q.s0 + 0.6); g.add(pp); box(pp, steel, 0.06, 2.4, 0.06, 0, 1.2, 0); pS.position.set(0, 2.2, -0.05); pS.rotation.y = Math.PI; pp.add(pS);
    // the boathouse and kiosk: red boards, white trim, a dark gabled roof with its gable to the sea, the sign on both gables
    const k = m.kiosk, kh = new THREE.Group(); kh.position.set(-k.a, Y, k.s); g.add(kh);
    const W = k.w, D = k.d, H = 2.9;
    box(kh, red, W, H, D, 0, H / 2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(kh, white, 0.14, H, 0.14, sx * W / 2, H / 2, sz * D / 2);
    const rl = Math.hypot(W / 2, 1.5) + 0.35, ra = Math.atan2(1.5, W / 2);
    for (const sx of [-1, 1]) { const r = box(kh, roof, rl, 0.12, D + 0.6, sx * W / 4, H + 0.75, 0); r.rotation.z = -sx * ra; }
    const gab = new THREE.Shape(); gab.moveTo(-W / 2, 0); gab.lineTo(W / 2, 0); gab.lineTo(0, 1.5); gab.closePath();
    for (const sz of [-1, 1]) { const gm = new THREE.Mesh(new THREE.ShapeGeometry(gab), red); gm.position.set(0, H, sz * D / 2 * 0.999); if (sz < 0) gm.rotation.y = Math.PI; gm.castShadow = true; kh.add(gm); }
    const tex = sign([m.sign, m.sub], 1024, 256, '#f2e8d0', '#14120e', '#1f5fa8'), sm = prep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    for (const sz of [-1, 1]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), sm); s.position.set(0, H + 0.1, sz * (D / 2 + 0.06)); if (sz < 0) s.rotation.y = Math.PI; kh.add(s); }
    // the kiosk hatch towards the parking, with an awning and a lit window; a door and a window to the sea
    box(kh, this.winMat, 2.2, 1.0, 0.06, W / 2 + 0.03, 1.45, -0.6, Math.PI / 2); box(kh, white, 2.4, 0.08, 0.5, W / 2 + 0.25, 0.92, -0.6, Math.PI / 2);
    const aw = box(kh, std(gfx, '#1f5fa8'), 2.6, 0.06, 1.0, W / 2 + 0.45, 2.25, -0.6, Math.PI / 2); aw.rotation.order = 'ZYX'; aw.rotation.z = -0.35;
    box(kh, dark, 1.0, 2.0, 0.06, 1.4, 1.0, D / 2 + 0.03); box(kh, this.winMat, 1.2, 0.8, 0.06, -1.5, 1.6, D / 2 + 0.03);
    box(kh, this.lampMat, 0.25, 0.15, 0.2, 0, H - 0.15, D / 2 + 0.15);
    const [kx, kz] = marinaPoint(m, k.s, k.a);
    isl.extraColliders.push({ x: kx, z: kz, hw: W / 2, hd: D / 2, ang: m.out, kind: 'house' });
    // the flag pole at the corner of the quay
    const fp = new THREE.Group(); fp.position.set(-(q.a1 - 0.8), Y, q.s1 - 0.8); g.add(fp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 9, 8), white); pole.position.y = 4.5; pole.castShadow = true; fp.add(pole);
    const fg = new THREE.PlaneGeometry(2.2, 1.6, 8, 2), fpos = fg.attributes.position; for (let i = 0; i < fpos.count; i++) { const x = fpos.getX(i) + 1.1; fpos.setZ(i, Math.sin(x * 2.2) * 0.12 * x / 2.2); }
    fg.computeVertexNormals(); const flag = new THREE.Mesh(fg, prep(new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.8, side: THREE.DoubleSide }))); flag.position.set(1.15, 8.1, 0); fp.add(flag); this.flag = flag;
    // the gangway: a timber walkway with rails from the quay down to the pontoon, on posts where it is over the shallows
    const gw = m.gangway, pd = m.pontoon, deckY = 0.45;
    const gl = gw.s1 - gw.s0, gy0 = Y - 0.08, gy1 = deckY + 0.08, gang = new THREE.Group(); gang.position.set(-gw.a, (gy0 + gy1) / 2, (gw.s0 + gw.s1) / 2);
    gang.rotation.x = Math.atan2(gy0 - gy1, gl); g.add(gang);
    const glen = Math.hypot(gl, gy0 - gy1);
    box(gang, gplanks, gw.w, 0.1, glen, 0, 0, 0); for (const sx of [-1, 1]) { box(gang, steel, 0.04, 0.04, glen, sx * gw.w / 2, 1.0, 0); for (let z = -glen / 2; z <= glen / 2 + 0.01; z += glen / 6) box(gang, steel, 0.04, 1.0, 0.04, sx * gw.w / 2, 0.5, z); }
    for (let s = gw.s0 + 2; s < gw.s1 - 2; s += 4.5) { const y = gy0 + (gy1 - gy0) * (s - gw.s0) / gl, h = y + 3; for (const sx of [-1, 1]) box(g, dark, 0.2, h, 0.2, -gw.a + sx * (gw.w / 2 - 0.1), y - h / 2 - 0.05, s); }
    // the floating pontoon and its T-head, in sections that ride the waves; cleats, lamp posts and a life ring
    this.sections = []; this.colliders = [];
    const section = (cxl, czl, len, along) => {
      // a pontoon section centred at (cxl, czl) in the local frame, long axis along local z (along = false: along local x)
      const s = new THREE.Group(); s.position.set(cxl, deckY, czl); if (along) s.rotation.y = Math.PI / 2; g.add(s);
      const w = pd.w; box(s, planks, w, 0.08, len, 0, 0, 0); box(s, float, w - 0.2, 0.5, len - 0.2, 0, -0.32, 0);
      for (const sx of [-1, 1]) box(s, dark, 0.08, 0.16, len, sx * (w / 2 + 0.04), -0.05, 0);
      for (let z = -len / 2 + 1.5; z < len / 2; z += 5) for (const sx of [-1, 1]) { const c = box(s, steel, 0.06, 0.06, 0.3, sx * (w / 2 - 0.15), 0.07, z); c.castShadow = false; }
      // world position and the collider (a box in the water plane, from under the floats to the deck)
      const wx = m.at.x + cxl * cs + czl * sn, wz = m.at.z - cxl * sn + czl * cs;
      const col = { x: wx, z: wz, hw: along ? len / 2 : w / 2, hd: along ? w / 2 : len / 2, ang: m.out, y0: -0.7, y1: 0.75, kind: 'pier', bounce: 0.1 };
      isl.extraColliders.push(col); this.colliders.push(col);
      this.sections.push({ g: s, wx, wz, ph: Math.random() * 6 }); return s;
    };
    // a lamp post on a section (x across it, z along it)
    const lamp = (p0, x, z) => { const p = new THREE.Group(); p.position.set(x, 0, z); p0.add(p); box(p, dark, 0.08, 1.4, 0.08, 0, 0.7, 0); const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.lampMat); h.position.y = 1.5; p.add(h); return p; };
    const nS = 3, segL = (pd.s1 - pd.s0) / nS;
    for (let i = 0; i < nS; i++) { const s = section(-pd.a, pd.s0 + segL * (i + 0.5), segL - 0.15, false); lamp(s, pd.w / 2 - 0.15, segL * 0.3);
      if (i === 0) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.09, 8, 18), std(gfx, '#e8521f', { roughness: 0.5 })); ring.position.set(-pd.w / 2 + 0.2, 1.0, 0); ring.rotation.y = Math.PI / 2; s.add(ring); box(s, dark, 0.07, 1.3, 0.07, -pd.w / 2 + 0.2, 0.65, 0.1); } }
    const hd = m.head, nH = 4, hL = (hd.a1 - hd.a0) / nH, hs = hd.s + hd.w / 2;
    for (let i = 0; i < nH; i++) { const s = section(-(hd.a0 + hL * (i + 0.5)), hs, hL - 0.15, true); if (i === 0 || i === nH - 1) lamp(s, -(hd.w / 2 - 0.15), (i ? 1 : -1) * (hL / 2 - 1.5)); }
    // the moored boats, motors tilted up
    this.moored = [];
    const rest = {};
    for (const [id, s, a, rel] of m.moored) {
      const spec = boatById(id), v = new BoatVisual(gfx, spec); v.tiltUp();
      if (rest[id] == null) rest[id] = new Boat(spec).restY;
      const [x, z] = marinaPoint(m, s, a), h = m.out + rel;
      const col = { x, z, hw: spec.B / 2, hd: spec.L / 2, ang: h, y0: -1, y1: 1.6, kind: 'boat', bounce: 0.15 };
      isl.extraColliders.push(col); this.colliders.push(col);
      this.moored.push({ v, x, z, h, y0: rest[id], L: spec.L, B: spec.B, ph: Math.random() * 6 });
    }
    // where your boat lies, and where you can step ashore
    const [bx, bz] = marinaPoint(m, m.berth.s, m.berth.a); this.berth = { x: bx, z: bz, h: m.out };
    const [px, pz] = marinaPoint(m, m.park.s, m.park.a); this.park = { x: px, z: pz, r: m.park.r, h: m.out + Math.PI / 2 };
    this.box = { cx: m.at.x, cz: m.at.z };
  }
  // the boat is alongside: within the T-head's reach, or close to the berth
  alongside(x, z) {
    const m = this.m, dx = x - m.at.x, dz = z - m.at.z, ux = Math.sin(m.out), uz = Math.cos(m.out), s = dx * ux + dz * uz, a = -dx * uz + dz * ux;
    return (s > m.pontoon.s0 && s < m.head.s + 14 && a > m.head.a0 - 6 && a < m.head.a1 + 6) || Math.hypot(x - this.berth.x, z - this.berth.z) < 16;
  }
  update(dt, t, ws, cam) {
    const night = U.uNight.value; this.lampMat.emissiveIntensity = night > 0.4 ? 3.5 : 0; this.winMat.emissiveIntensity = night > 0.4 ? 1.6 : 0;
    if (Math.hypot(cam.x - this.m.at.x, cam.z - this.m.at.z) > 1500) return;
    for (const s of this.sections) s.g.position.y = 0.45 + waveHeight(s.wx, s.wz, t, ws) * 0.7;
    for (const b of this.moored) {
      const fx = Math.sin(b.h), fz = Math.cos(b.h), l = b.L * 0.4, w = b.B * 0.4;
      const yb = waveHeight(b.x + fx * l, b.z + fz * l, t, ws), ys = waveHeight(b.x - fx * l, b.z - fz * l, t, ws), yl = waveHeight(b.x + fz * w, b.z - fx * w, t, ws), yr = waveHeight(b.x - fz * w, b.z + fx * w, t, ws);
      const r = b.v.root; r.position.set(b.x, (yb + ys + yl + yr) / 4 + b.y0, b.z);
      r.rotation.set(-Math.atan2(yb - ys, 2 * l) * 0.8, b.h, Math.atan2(yl - yr, 2 * w) * 0.8, 'YXZ');
    }
    this.flag.rotation.y = Math.sin(t * 0.7) * 0.25;
  }
}
