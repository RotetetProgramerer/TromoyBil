// Another player's car on screen: their model and paint in a CarVisual, driven by a Vehicle-like proxy that is filled from
// their poses, drawn a little behind real time so it glides between updates (Hermite on position with their velocity, slerp
// on rotation), and a short guess ahead when updates stop coming. A name tag in their colour floats above it, and a beacon
// (or the activity's own remoteVisual) shows them while they sail, fly or ski. Not physical: nothing collides with it.
import * as THREE from 'three';
import { CarVisual } from '../render/carvis.js';
import { Vehicle } from '../physics/vehicle.js';
import { carById } from '../data/cars.js';
import { prep } from '../render/gfx.js';

const DELAY = 120, AHEAD = 500, KEEP = 40;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const fin = (a, n) => Array.isArray(a) && a.length === n && a.every(v => typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e6);
// a pose message is checked before use: numbers, array lengths, the activity block
export function poseOk(m) {
  if (typeof m.tm !== 'number' || !isFinite(m.tm) || !fin(m.p, 3) || !fin(m.q, 4) || !fin(m.v, 3) || !fin(m.wy, 4) || !fin(m.ws, 2) || !fin(m.wo, 4)) return false;
  if (m.a != null && (typeof m.a !== 'object' || typeof m.a.id !== 'string' || !fin(m.a.p, 3) || !fin(m.a.f, 3) || (m.a.q != null && !fin(m.a.q, 4)))) return false;
  return true;
}

// a name on a dark plate with a stripe in the player's colour, drawn on top of everything
export function nameTag(name, col) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.font = '700 72px "Barlow Condensed", sans-serif'; const w = Math.min(500, x.measureText(name).width + 80);
  x.fillStyle = 'rgba(20,18,14,.85)'; x.beginPath(); x.roundRect ? x.roundRect((512 - w) / 2, 12, w, 104, 16) : x.rect((512 - w) / 2, 12, w, 104); x.fill();
  x.fillStyle = col; x.fillRect((512 - w) / 2, 12, 18, 104);
  x.fillStyle = '#fff6e2'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 256 + 9, 67);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  s.material.color.setScalar(1.6);   // tone mapping dims what it draws; this keeps the plate readable
  s.renderOrder = 50; s.center.set(0.5, 0); s.frustumCulled = false; return s;
}

// the stand-in for a player in a boat, a plane or on skis when the activity has no remoteVisual: a pin and a pillar of light
function beacon(col) {
  const root = new THREE.Group(), c = new THREE.Color(col);
  const solid = prep(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.5 }));
  const pin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 16), solid); pin.rotation.x = Math.PI; pin.position.y = 3.2; root.add(pin);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), solid); ball.position.y = 4.9; root.add(ball);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 3), solid); arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.6, 1.4); root.add(arrow);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 80, 10, 1, true), prep(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, depthWrite: false })));
  beam.position.y = 46; root.add(beam);
  return {
    root, tagY: 6.6,
    update(pose) { root.position.copy(pose.pos); root.rotation.set(0, Math.atan2(pose.fw.x, pose.fw.z), 0); },
    dispose() { root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); },
  };
}

export class Remote {
  constructor(net, p) {
    this.net = net; this.g = net.g; this.p = p; this.buf = []; this.off = null; this.gap = 67; this.vis = null; this.av = null; this.spin = [0, 0, 0, 0];
    this.pos = null; this.fw = new THREE.Vector3(0, 0, 1); this.where = null; this.shown = false; this.fade = 1;
    // what CarVisual.sync reads from a Vehicle
    this.proxy = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), speed: 0, state: { brake: 0, gear: 1, steer: 0 },
      wheels: [0, 1, 2, 3].map(() => ({ center: new THREE.Vector3(), steer: 0, spin: 0 })) };
    this.tag = nameTag(p.name, net.color(p.slot)); this.tag.visible = false; this.g.gfx.overlay.add(this.tag);
    this.build();
  }
  // their car: rebuilt when they change car, repainted when they change paint
  async build() {
    const info = this.p.info, spec = carById(info.car), col = info.col || spec.col, key = spec.id;
    if (this.vis && this.carKey === key) { this.vis.setColor(col); this.col = col; return; }
    const token = this.token = {}, vis = new CarVisual(this.g.gfx); vis.group.visible = false;
    try { await vis.build(spec, col); } catch (e) { console.warn('flerspiller: bilen lot seg ikke bygge', e); }
    if (this.token !== token || this.gone) { this.dropVis(vis); return; }
    // no headlight spotlights: every light added to the scene makes every material rebuild its shader
    for (const s of vis.spots || []) { s.parent && s.parent.remove(s); s.target.parent && s.target.parent.remove(s.target); }
    vis.spots = [];
    // fading near the camera dithers solid parts away (alpha hash): only the opacity changes, so no shader has to be rebuilt then
    for (const m of new Set(Object.values(vis.mats))) if (!m.transparent) m.alphaHash = true;
    this.dropVis(this.vis); this.vis = vis; this.carKey = key; this.col = col; this.fadeMats = null; this.roof = spec.dims.H - spec.cgH + 0.35;
    // where the wheels sit across and along the car (the height comes with each pose)
    this.mounts = new Vehicle(spec).wheels.map(w => ({ x: w.mount.x, z: w.mount.z }));
  }
  dropVis(vis) {
    if (!vis) return; const gfx = this.g.gfx; gfx.scene.remove(vis.group);
    const mats = new Set(Object.values(vis.mats || {})); for (const m of mats) m.dispose();
    if (gfx.csmMats) for (let i = gfx.csmMats.length - 1; i >= 0; i--) if (mats.has(gfx.csmMats[i])) gfx.csmMats.splice(i, 1);
  }
  rename() { const old = this.tag; this.tag = nameTag(this.p.name, this.net.color(this.p.slot)); this.tag.visible = false; this.g.gfx.overlay.add(this.tag); this.dropTag(old); this.dropAct(); }
  dropTag(t) { this.g.gfx.overlay.remove(t); t.material.map.dispose(); t.material.dispose(); }
  dispose() { this.gone = true; this.dropVis(this.vis); this.vis = null; this.dropAct(); this.dropTag(this.tag); }

  // a pose arrives (already checked): keep it, newest last, with the sender's clock lined up with ours
  push(m, now) {
    const b = this.buf; let last = b[b.length - 1];
    if (last && m.tm <= last.tm) { if (m.tm < last.tm - 5000) { b.length = 0; this.off = null; last = null; } else return; }   // late or repeated (or their clock started over)
    const o = now - m.tm; this.off = this.off == null || o < this.off ? o : this.off + (o - this.off) * 0.02;   // the smallest delay seen, drifting slowly
    if (last) this.gap += (Math.min(1000, m.tm - last.tm) - this.gap) * 0.1;
    const ql = Math.hypot(m.q[0], m.q[1], m.q[2], m.q[3]) || 1, a = m.a;
    b.push({ tm: m.tm, p: new THREE.Vector3(...m.p), v: new THREE.Vector3(...m.v), q: new THREE.Quaternion(m.q[0] / ql, m.q[1] / ql, m.q[2] / ql, m.q[3] / ql),
      wy: m.wy, ws: m.ws, wo: m.wo, st: +m.st || 0, l: m.l | 0, n: m.n | 0, md: typeof m.m === 'string' ? m.m : 'd', isl: typeof m.i === 'string' ? m.i : '',
      a: a ? { id: a.id, p: new THREE.Vector3(...a.p), f: new THREE.Vector3(...a.f).normalize(), q: a.q ? new THREE.Quaternion(...a.q).normalize() : null, k: +a.k || 0, d: a.d } : null });
    if (b.length > KEEP) b.shift();
  }

  // every frame: where they were DELAY ms ago (more when their updates come slowly), between the two poses round that moment
  update(now, dt, cam) {
    // silent for 8 s: gone from view (unless it was us that stalled, then their news is still on its way)
    const b = this.buf, P = this.proxy, fresh = b.length && (now - this.p.seen < 8000 || now - (this.lastNow || now) > 1000); this.lastNow = now;
    if (!fresh || !this.vis) { this.hide(); return; }
    const delay = Math.max(DELAY, Math.min(400, this.gap * 1.3 + 30)), rt = now - this.off - delay, last = b[b.length - 1];
    while (b.length > 2 && b[1].tm < rt - 1000) b.shift();
    let a = last, c = last, k = 0;
    if (rt < last.tm) for (let i = 1; i < b.length; i++) if (b[i].tm >= rt) { a = b[i - 1]; c = b[i]; k = rt <= a.tm ? 0 : (rt - a.tm) / Math.max(1, c.tm - a.tm); break; }
    const T = (c.tm - a.tm) / 1000;
    if (a === c) {
      // nothing newer yet: carry on with their last velocity for a moment, then wait where they are
      const ahead = Math.min(AHEAD, Math.max(0, rt - last.tm)) / 1000; P.pos.copy(last.p).addScaledVector(last.v, ahead); P.q.copy(last.q);
    } else if (a.p.distanceToSquared(c.p) > (20 + (a.v.length() + c.v.length()) * T * 2) ** 2) {
      P.pos.copy(c.p); P.q.copy(c.q); a = c; k = 0;   // a jump (towed home, set back on the road): not glided across
    } else {
      const k2 = k * k, k3 = k2 * k;
      P.pos.copy(a.p).multiplyScalar(2 * k3 - 3 * k2 + 1).addScaledVector(a.v, (k3 - 2 * k2 + k) * T).addScaledVector(c.p, -2 * k3 + 3 * k2).addScaledVector(c.v, (k3 - k2) * T);
      P.q.slerpQuaternions(a.q, c.q, k);
    }
    const L = (x, y) => x + (y - x) * k;
    P.speed = _v.copy(a.v).lerp(c.v, k).dot(_w.set(0, 0, 1).applyQuaternion(P.q));
    P.state.steer = L(a.st, c.st); P.state.brake = c.l & 1 ? 1 : 0; P.state.gear = c.l & 2 ? -1 : 1; if (c.l & 2) P.speed = Math.min(P.speed, 0);
    const M = this.mounts;
    for (let i = 0; i < 4; i++) {
      const w = P.wheels[i]; w.center.set(M[i].x, L(a.wy[i], c.wy[i]), M[i].z).applyQuaternion(P.q).add(P.pos);
      w.steer = i < 2 ? L(a.ws[i], c.ws[i]) : 0; this.spin[i] = (this.spin[i] + L(a.wo[i], c.wo[i]) * dt) % (Math.PI * 2); w.spin = this.spin[i];
    }
    this.mode = c.md; this.where = c.isl;
    // on the ferry their car rides a ferry we do not have: the beacon stands in for both
    const act = c.a ? c.a.id : c.md === 'f' ? 'ferry' : null, V = this.vis;
    V.lights = !!(c.l & 4);
    const d = cam.position.distanceTo(P.pos), f = Math.max(0, Math.min(1, (d - 1.8) / 4));
    V.group.visible = act !== 'ferry' && d < 3000 && f > 0.03;
    if (V.group.visible) { this.setFade(f); V.sync(P, dt, { indicator: c.n }); }
    // the activity (the car waits parked meanwhile): its pose between the same two moments
    let tagPos = P.pos, tagY = this.roof;
    this.act = act;
    if (act) {
      const av = this.actVis(act), pose = this.apose || (this.apose = { pos: new THREE.Vector3(), fw: new THREE.Vector3(), q: new THREE.Quaternion(), kmh: 0, data: null });
      const A0 = a.a && c.a && a.a.id === c.a.id ? a.a : c.a, A1 = c.a;
      if (A1) { pose.pos.copy(A0.p).lerp(A1.p, k); pose.fw.copy(A0.f).lerp(A1.f, k).normalize(); pose.kmh = L(A0.k, A1.k); pose.data = A1.d; }
      else { pose.pos.copy(P.pos); pose.fw.set(0, 0, 1).applyQuaternion(P.q); pose.kmh = Math.abs(P.speed) * 3.6; pose.data = null; }
      if (A1 && A1.q) pose.q.slerpQuaternions(A0.q || A1.q, A1.q, k);
      else pose.q.setFromEuler(_e.set(-Math.asin(Math.max(-1, Math.min(1, pose.fw.y))), Math.atan2(pose.fw.x, pose.fw.z), 0, 'YXZ'));
      try { if (av.update) av.update(pose, dt); else { av.root.position.copy(pose.pos); av.root.quaternion.copy(pose.q); } } catch (e) { }
      tagPos = pose.pos; tagY = av.tagY ?? 4; this.fw.copy(pose.fw); this.kmh = pose.kmh;
    } else { this.dropAct(); this.fw.set(0, 0, 1).applyQuaternion(P.q); this.kmh = Math.abs(P.speed) * 3.6; }
    (this.pos || (this.pos = new THREE.Vector3())).copy(tagPos);
    // the name keeps its size on screen (24–44 px tall) and shows through hills, so you can find each other
    const dn = cam.position.distanceTo(tagPos), vh = this.g.gfx.renderer.domElement.clientHeight || innerHeight, px = Math.max(24, Math.min(44, vh * 0.05));
    const h = Math.max(0.5, px / vh * 2 * Math.tan(cam.fov * Math.PI / 360) * dn);
    this.tag.visible = dn < 6000 && dn > 2; this.tag.position.copy(tagPos).y += tagY; this.tag.scale.set(h * 4, h, 1);
    this.shown = true;
  }
  hide() { if (this.vis) this.vis.group.visible = false; if (this.av) this.av.root.visible = false; this.tag.visible = false; this.shown = false; }
  // see-through near the camera (we may drive right through each other): every material of their car follows one opacity
  setFade(f) {
    f = f > 0.98 ? 1 : f; if (f === this.fade && this.fadeMats) return; this.fade = f;
    if (!this.fadeMats) this.fadeMats = [...new Set(Object.values(this.vis.mats))].map(m => ({ m, o: m.opacity }));
    for (const e of this.fadeMats) e.m.opacity = e.o * f;
  }
  actVis(id) {
    if (this.av && this.av.id === id) { this.av.root.visible = true; return this.av; }
    this.dropAct();
    const A = (this.g.acts || []).find(x => x.constructor.id === id), who = { name: this.p.name, color: this.net.color(this.p.slot), slot: this.p.slot };
    let v = null; try { v = A && A.remoteVisual ? A.remoteVisual(who) : null; } catch (e) { console.warn('flerspiller: remoteVisual', e); }
    if (!v || !v.root) v = beacon(who.color);
    v.id = id; this.g.gfx.scene.add(v.root); this.av = v; return v;
  }
  dropAct() { const v = this.av; if (!v) return; this.av = null; this.g.gfx.scene.remove(v.root); try { v.dispose && v.dispose(); } catch (e) { } }
}
