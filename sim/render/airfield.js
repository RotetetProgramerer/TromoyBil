// What Trinnvik lufthavn needs for flying, on top of what sim/render/special.js draws there (the runway markings and its small light
// fittings, the tower's cab, a windsock): the flying club's planes at their stands on the apron (with chocks, stand markings and
// the taxi line), the car park with its sign, lamp posts along the apron, the hangar doors and their sign, a fuel pump, a second
// windsock that swings in the wind, and the lights, glowing points that are seen from far away at night: the runway edge lights,
// the green threshold and red end lights, the approach lights with a running flash, the PAPI beside the touchdown point (two white
// over two red on the glide path), the taxiway's blue edge lights. A (sim/data/flights.js airportOf) gives the places in world coordinates.
import * as THREE from 'three';
import { prep, U } from './gfx.js';
import { PlaneVisual, LIVERIES, Glows } from './planevis.js';
import { Plane } from '../physics/plane.js';
import { planeById } from '../data/planes.js';
import { GLIDE, AIM, WIND } from '../data/flights.js';

const D2R = Math.PI / 180, _v = new THREE.Vector3();
const std = (gfx, c, o = {}) => { const m = prep(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75 }, o))); gfx.shadowed(m); return m; };
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function signTex(lines, bg, fg, w = 1024, h = 256) {
  return tex(w, h, (x) => { x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = h * 0.04; x.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${h * (lines[1] ? 0.4 : 0.55)}px "Barlow Condensed", sans-serif`; x.fillText(lines[0], w / 2, h * (lines[1] ? 0.4 : 0.52));
    if (lines[1]) { x.font = `600 ${h * 0.2}px "Barlow Condensed", sans-serif`; x.fillText(lines[1], w / 2, h * 0.74); } });
}
// the club's fleet at the stands: [model, livery (LIVERIES index, or null for the planes you can fly)]
const FLEET = [['make', null], ['falk', null], ['make', 0], ['make', 1], ['falk', 2]];
// the apron's lamp posts (Trinnvik's own coordinates, the arm's direction): on the grass east and west of it, clear of the taxiway
const AIRPORT_LAMPS = [[1503, 150, Math.PI], [1503, 225, Math.PI], [1503, 375, Math.PI], [1503, 450, Math.PI], [1384, 160, 0], [1384, 250, 0], [1384, 350, 0], [1384, 440, 0]];

export class Airfield {
  constructor(gfx, world, A, lamps) {
    this.gfx = gfx; this.world = world; this.A = A; this.t = 0;
    const g = this.group = new THREE.Group(); gfx.scene.add(g);
    const R = A.rwy, y = R.y, isl = A.isl;
    const paint = std(gfx, '#f2d23a', { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), white = std(gfx, '#f2f0ea', { roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    const steel = std(gfx, '#9da2a6', { metalness: 0.7, roughness: 0.4 }), dark = std(gfx, '#2a2c2e', { roughness: 0.7 }), orange = std(gfx, '#e8661c', { roughness: 0.6 });
    // a painted line from (x0, z0) to (x1, z1), w wide, lying on the ground
    const line = (m, x0, z0, x1, z1, w) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 1.5)), nx = -(z1 - z0) / L * w / 2, nz = (x1 - x0) / L * w / 2, P = [], I = [];
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; for (const s of [-1, 1]) P.push(x + nx * s, world.height(x + nx * s, z + nz * s) + 0.04, z + nz * s); if (i) { const k = (i - 1) * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I); geo.computeVertexNormals(); if (geo.attributes.normal.getY(0) < 0) { geo.setIndex(I.map((v, j) => I[j - j % 3 + (2 - j % 3)])); geo.computeVertexNormals(); }
      const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; g.add(mesh); return mesh; };
    const box = (m, w, h, d, x, y0, z, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y0 + h / 2, z); b.rotation.y = ry; b.castShadow = true; b.receiveShadow = true; g.add(b); return b; };
    // ---- the stands: a yellow lead-in line from the taxi line, a stop bar, the number; the planes parked nose to the west
    const taxiZ = A.oz + 300;
    line(paint, A.apron.x0 + 6, taxiZ, A.apron.x1, taxiZ, 0.25);                                                                     // the taxi line across the apron
    this.parked = []; this.cols = [];
    A.stands.forEach((s, i) => {
      line(paint, s.x - 3, s.z, s.x + 21, s.z, 0.22); line(paint, s.x - 2.2, s.z - 2, s.x - 2.2, s.z + 2, 0.3);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), prep(new THREE.MeshStandardMaterial({ map: tex(128, 128, (x) => { x.clearRect(0, 0, 128, 128); x.fillStyle = '#f2d23a'; x.font = '700 110px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 64, 70); }), transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })));
      num.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); num.position.set(s.x + 9, world.height(s.x + 9, s.z) + 0.05, s.z); g.add(num);
      const [id, liv] = FLEET[i] || FLEET[0], spec = planeById(id), L = liv != null ? LIVERIES[liv] : null;
      const p = new Plane(spec); p.place(world, s.x, s.z, -Math.PI / 2); p.input.brake = 1; for (let k = 0; k < 240; k++) p.step(1 / 240, world);
      const v = new PlaneVisual(gfx, spec, { lights: false, reg: L && L.reg, look: L || undefined });
      const pos = new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z), q = new THREE.Quaternion(p.q.x, p.q.y, p.q.z, p.q.w);
      v.pose(pos, q, { g: p.gear.map(w => ({ x: w.x })) }, 0); v.bake();
      // chocks at the main wheels
      for (const w of p.gear) if (!w.steer) { _v.set(w.at[0] ?? w.at.x, 0, w.at.z ?? w.at[2]).applyQuaternion(q).add(pos); for (const d of [-0.3, 0.3]) box(paint, 0.12, 0.12, 0.25, _v.x + d, world.height(_v.x, _v.z), _v.z); }
      // the plane is something to hit: the wing and the fuselage as boxes (low, so a plane can fly over them)
      const span = spec.wing.span, top = p.pos.y + spec.wing.y + 0.4, cols = [
        { x: pos.x, z: pos.z, hw: 0.9, hd: 3.2, ang: -Math.PI / 2, y0: y - 1, y1: top, kind: 'plane', bounce: 0.1 },
        { x: pos.x - 0.1, z: pos.z, hw: 0.9, hd: span / 2, ang: 0, y0: p.pos.y + spec.wing.y - 0.4, y1: top, kind: 'plane', bounce: 0.1 }];
      for (const c of cols) isl.extraColliders.push(c);
      this.parked.push({ v, id, reg: L ? L.reg : null, cols, stand: s });
    });
    // ---- lamp posts along both sides of the apron, their arms out over it (lit at night by sim/render/streetlights.js)
    if (lamps && lamps.add) for (const [x, z, ang] of AIRPORT_LAMPS) lamps.add(x + A.ox, z + A.oz, ang);
    // ---- the car park for the flying club: bays and a sign
    const P = A.park;
    for (let k = -2; k <= 2; k++) line(white, P.x - 8.5, P.z + k * 2.8 - 1.4, P.x - 3.5, P.z + k * 2.8 - 1.4, 0.14);
    { const sg = new THREE.Group(); sg.position.set(P.x - 9.5, world.height(P.x - 9.5, P.z), P.z); g.add(sg); const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), steel); post.position.y = 1.3; post.castShadow = true; sg.add(post);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), prep(new THREE.MeshStandardMaterial({ map: signTex(['P  FLYKLUBBEN', 'parker her og gå til flyene'], '#1f5fa8', '#ffffff', 512, 256), roughness: 0.5, side: THREE.DoubleSide })));
      s.position.set(0, 2.5, 0); s.rotation.y = Math.PI / 2; sg.add(s); isl.extraColliders.push({ x: sg.position.x, z: sg.position.z, r: 0.1, y1: sg.position.y + 3, kind: 'post' }); }
    // ---- the hangar: big sliding doors towards the apron and the club's name over them
    { const H = A.hangar, hy = world.height(H.x, H.z + 3) + 0.05, dz = H.z + 0.06, dt = tex(512, 128, (x, w, h) => { x.fillStyle = '#6f777d'; x.fillRect(0, 0, w, h); x.fillStyle = '#5b6268'; for (let i = 0; i < 8; i++) x.fillRect(i * w / 8, 0, 3, h); x.fillStyle = 'rgba(255,255,255,.08)'; for (let j = 0; j < h; j += 6) x.fillRect(0, j, w, 1); });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(H.w, H.h), std(gfx, '#ffffff', { map: dt, roughness: 0.55, metalness: 0.3 })); door.position.set(H.x, hy + H.h / 2, dz); door.receiveShadow = true; g.add(door);
      box(dark, H.w + 0.6, 0.35, 0.3, H.x, hy + H.h, dz);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), prep(new THREE.MeshStandardMaterial({ map: signTex(['TRINNVIK FLYKLUBB', 'hangar · skolefly · sportsfly'], '#f2e8d0', '#14120e'), roughness: 0.5 })));
      sign.position.set(H.x, hy + H.h + 1.6, dz + 0.02); g.add(sign); this.hangarSign = sign; }
    // ---- a fuel pump for the planes at the apron's north-east corner
    { const fx = A.apron.x1 - 6, fz = A.apron.z0 + 8, fy = world.height(fx, fz); const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 5, 16), std(gfx, '#d8dcdf', { metalness: 0.3, roughness: 0.4 })); tank.rotation.z = Math.PI / 2; tank.position.set(fx + 3, fy + 1.4, fz - 3); tank.castShadow = true; g.add(tank);
      box(dark, 0.6, 1.6, 0.4, fx, fy, fz); const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), prep(new THREE.MeshStandardMaterial({ map: signTex(['AVGAS 100LL'], '#1d4f91', '#ffffff', 512, 160), roughness: 0.5, side: THREE.DoubleSide }))); s.position.set(fx + 3, fy + 2.8, fz - 3); g.add(s);
      isl.extraColliders.push({ x: fx + 3, z: fz - 3, hw: 2.6, hd: 1.2, ang: Math.PI / 2, y1: fy + 3, kind: 'house' }); }
    // ---- the windsock at the south end: a striped sock on a pivot that turns with the wind
    { const S = A.sock, sy = world.height(S.x, S.z), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), std(gfx, '#e9e6dd')); pole.position.set(S.x, sy + 3, S.z); pole.castShadow = true; g.add(pole);
      const piv = new THREE.Group(); piv.position.set(S.x, sy + 5.8, S.z); g.add(piv); const hang = new THREE.Group(); piv.add(hang);
      const stripes = tex(256, 64, (x, w, h) => { for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#f4f2ec' : '#ea5a12'; x.fillRect(i * w / 5, 0, w / 5 + 1, h); } });
      const geo = new THREE.CylinderGeometry(0.22, 0.42, 3.6, 16, 6, true); geo.rotateZ(-Math.PI / 2); geo.translate(1.8, 0, 0);
      const uv = geo.attributes.uv, pp = geo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 3.6, uv.getX(i));
      const sock = new THREE.Mesh(geo, std(gfx, '#ffffff', { map: stripes, side: THREE.DoubleSide, roughness: 0.8 })); sock.castShadow = true; hang.add(sock);
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 6, 16), steel); ringM.rotation.y = Math.PI / 2; hang.add(ringM);
      this.sock = { piv, hang, sock, geo, base: geo.attributes.position.array.slice() }; }
    // ---- the PAPI: four lamp boxes on short legs to the left of the touchdown point, facing the approach
    this.papi = [];
    const RX = (s, t) => [R.x0 + R.ux * s + R.uz * t, R.z0 + R.uz * s - R.ux * t];        // runway frame → world (t: metres to the left looking along it)
    for (let k = 0; k < 4; k++) {
      const [px, pz] = RX(AIM - 20, R.w / 2 + 15 + k * 9), py = world.height(px, pz);
      const u = box(dark, 1.4, 0.6, 0.6, px, py + 0.35, pz, R.h); box(steel, 0.08, 0.35, 0.08, px - 0.5, py, pz); box(steel, 0.08, 0.35, 0.08, px + 0.5, py, pz);
      this.papi.push({ x: px, y: py + 0.65, z: pz, a: (3.5 - k / 3) * D2R, i: 0 });          // the unit nearest the runway shows white above 3.5°, the outer one above 2.5°
      void u;
    }
    // ---- the lights as glowing points: [x, y, z, r, g, b, size, kind]
    const L = this.lights = [], add = (x, z, c, size, kind = 'n', h = 0.35) => L.push({ x, y: world.height(x, z) + h, z, c, size, kind });
    for (let s = 0; s <= R.L + 0.1; s += 60) for (const t of [-1, 1]) { const [x, z] = RX(s, t * (R.w / 2 + 1)); add(x, z, s > R.L - 600 ? [1, 0.85, 0.45] : [1, 0.92, 0.75], 0.8); }
    for (let t = -R.w / 2; t <= R.w / 2 + 0.1; t += 3) { let [x, z] = RX(-1.5, t); add(x, z, [0.25, 1, 0.4], 0.55); [x, z] = RX(R.L + 1.5, t); add(x, z, [1, 0.12, 0.08], 0.55); }
    for (let d = 30; d <= 300; d += 30) { for (let t = -4; t <= 4; t += 2) { const [x, z] = RX(-d, t); L.push({ x, y: y + 0.65, z, c: [1, 0.93, 0.78], size: 0.55, kind: 'n' }); } const [x, z] = RX(-d, 0); L.push({ x, y: y + 1.2, z, c: [1, 1, 1], size: 1.1, kind: 'rabbit', d }); }
    for (const k of this.papi) { k.i = L.length; L.push({ x: k.x, y: k.y, z: k.z, c: [1, 1, 1], size: 0.9, kind: 'papi' }); }
    { const tz = A.oz + 300, x0 = A.apron.x1 + 2, x1 = R.x0 - R.w / 2 - 4; for (let x = x0; x <= x1; x += 25) for (const sd of [-1, 1]) add(x, tz + sd * 10, [0.2, 0.45, 1], 0.4, 'n', 0.3); }
    this.glow = new Glows(gfx, L.length, { min: 3.5, dim: 0.85 });
    L.forEach((l, i) => this.glow.set(i, l.x, l.y, l.z, l.c[0], l.c[1], l.c[2], l.size));
    this.glow.flush(true);
    this.taken = null;
  }
  // the plane the player has out is not at its stand (id and registration; null puts it back)
  take(id) {
    const want = id ? this.parked.find(p => p.id === id && !p.reg) : null;
    for (const p of this.parked) {
      const out = p === want; if (p.v.root.visible === !out) continue;
      p.v.root.visible = !out; const cols = this.A.isl.extraColliders;
      for (const c of p.cols) { const i = cols.indexOf(c); if (out && i >= 0) cols.splice(i, 1); else if (!out && i < 0) cols.push(c); }
    }
  }
  // cam: the camera's position; eye: where the PAPI is seen from (the pilot's eye while flying, else the camera)
  update(dt, cam, eye = cam) {
    this.t += dt; const t = this.t, A = this.A, night = U.uNight.value, far = Math.hypot(cam.x - A.aim.x, cam.z - A.aim.z);
    if (far > 16000) { this.glow.pts.visible = false; return; }
    this.glow.pts.visible = true;
    // the edge, threshold, approach and taxi lights are on at dusk and at night; the PAPI shines by day too
    const on = THREE.MathUtils.smoothstep(night, 0.15, 0.55);
    this.glow.mat.uniforms.uI.value = 1;
    const L = this.lights, R = A.rwy, ft = (t * 2) % 1;
    for (let i = 0; i < L.length; i++) {
      const l = L[i]; let I = on * 3.5, c = l.c, size = l.size;
      if (l.kind === 'rabbit') { const k = 1 - (l.d - 30) / 270, f = Math.abs(ft - k * 0.9) < 0.04 ? 1 : 0; I = on * f * 14; size = f ? 1.4 : 0; }
      else if (l.kind === 'papi') {
        const P = this.papi.find(p => p.i === i), dx = eye.x - P.x, dz = eye.z - P.z, ahead = -(dx * R.ux + dz * R.uz), el = Math.atan2(eye.y - P.y, Math.max(1, ahead));
        const w = THREE.MathUtils.smoothstep(el, P.a - 0.06 * D2R, P.a + 0.06 * D2R); c = [1, 0.15 + 0.85 * w, 0.1 + 0.85 * w];
        I = ahead > 30 ? 2.5 + 5 * night : 0; size = I ? 1.1 : 0;
      }
      this.glow.set(i, l.x, l.y, l.z, c[0] * I, c[1] * I, c[2] * I, I > 0 ? size : 0);
    }
    this.glow.flush(true);
    // the windsock: points downwind, droops less the harder it blows, and flutters
    const S = this.sock; if (S) {
      const wd = (WIND.from + 180) * D2R, gust = 1 + 0.25 * Math.sin(t * 0.7) + 0.12 * Math.sin(t * 2.3);
      S.piv.rotation.y = Math.atan2(Math.sin(wd), -Math.cos(wd)) - Math.PI / 2 + 0.08 * Math.sin(t * 1.1);
      S.hang.rotation.z = -(1 - Math.min(1, WIND.speed * gust / 7)) * 1.1;
      const p = S.geo.attributes.position, b = S.base; for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setY(i, b[i * 3 + 1] + Math.sin(x * 2.2 - t * 6) * 0.04 * x); p.setZ(i, b[i * 3 + 2] + Math.sin(x * 1.7 - t * 4.3) * 0.05 * x); } p.needsUpdate = true;
    }
  }
}
