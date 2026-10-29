// The game: the player's car, input, cameras and the HUD. (The world, the renderer and the loop are set up in main.js.)
import * as THREE from 'three';
import { Vehicle } from './physics/vehicle.js';
import { CARS, carById } from './data/cars.js';
import { prep } from './render/gfx.js';

const DT = 1 / 400;
const $ = id => document.getElementById(id);

export class Game {
  constructor(ctx) { Object.assign(this, ctx); this.keys = new Set(); this.acc = 0; this.camMode = 0; this.orbit = { yaw: 0, pitch: 0.12, dist: 7.5 }; }
  async init(status) {
    const spec = carById(this.store.get('car', 'ravn'));
    this.car = new Vehicle(spec);
    this.buildCarVisual();
    const start = this.spawnPoint();
    this.car.place(this.world, start.x, start.z, start.h);
    for (let i = 0; i < 200; i++) this.car.step(DT, this.world);
    addEventListener('keydown', e => { this.keys.add(e.key.toLowerCase()); if (e.key.toLowerCase() === 'c') this.camMode = (this.camMode + 1) % 3; });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    this.gfx.setTime(this.params.has('t') ? +this.params.get('t') : 14);
    this.gfx.setFog(0.00011, 0.0018);
    this.camPos = new THREE.Vector3().copy(this.car.pos).add(new THREE.Vector3(0, 3, -8));
  }
  // where you start: on a road near the middle of Tromøya (later: the base)
  spawnPoint() {
    const isl = this.world.islands[0], want = { x: +(this.params.get('x') ?? -40), z: +(this.params.get('z') ?? 2400) };
    let best = null;
    for (const r of isl.roads.roads) { if (r.c > 4) continue; const p = r.p; for (let i = 0; i < p.length - 3; i += 3) { const d = Math.hypot(p[i] - want.x, p[i + 1] - want.z); if (!best || d < best.d) best = { d, x: p[i], z: p[i + 1], h: Math.atan2(p[i + 3] - p[i], p[i + 4] - p[i + 1]) }; } }
    return best ? { x: best.x + isl.ox, z: best.z + isl.oz, h: best.h } : { x: 0, z: 0, h: 0 };
  }
  buildCarVisual() {
    const s = this.car.spec, g = new THREE.Group();
    const paint = prep(new THREE.MeshPhysicalMaterial({ color: s.col || '#c43b2f', roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }));
    this.gfx.shadowed(paint);
    const body = new THREE.Mesh(new THREE.BoxGeometry(s.dims.W, s.dims.H * 0.55, s.dims.L), paint);
    body.position.y = this.car.box.y0 + s.dims.H * 0.3; body.castShadow = true; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(s.dims.W * 0.9, s.dims.H * 0.4, s.dims.L * 0.5), prep(new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.2 })));
    cab.position.y = body.position.y + s.dims.H * 0.45; cab.castShadow = true; g.add(cab);
    this.gfx.scene.add(g); this.carBody = g;
    const tyre = prep(new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
    this.gfx.shadowed(tyre);
    this.wheelVis = this.car.wheels.map(w => { const m = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, w.w, 24), tyre); m.rotation.z = Math.PI / 2; const p = new THREE.Group(); p.add(m); m.castShadow = true; this.gfx.scene.add(p); return p; });
  }
  input(dt) {
    const k = this.keys, I = this.car.input;
    const up = k.has('arrowup') || k.has('w'), dn = k.has('arrowdown') || k.has('s'), lf = k.has('arrowleft') || k.has('a'), rt = k.has('arrowright') || k.has('d');
    const ramp = (v, on, r) => on ? Math.min(1, v + dt * r) : Math.max(0, v - dt * r * 2);
    I.gas = ramp(I.gas, up, 3); I.brake = ramp(I.brake, dn, 4);
    const target = (lf ? 1 : 0) - (rt ? 1 : 0);
    I.steer += Math.max(-dt * 2.8, Math.min(dt * 2.8, target - I.steer));
    I.handbrake = k.has(' ') ? 1 : 0;
  }
  update(dt) {
    this.input(dt);
    this.acc += dt; let n = 0;
    while (this.acc >= DT && n < 60) { this.car.step(DT, this.world); this.acc -= DT; n++; }
    if (n >= 60) this.acc = 0;
    this.syncCar();
    this.updateCamera(dt);
    this.hud();
  }
  syncCar() {
    const c = this.car;
    this.carBody.position.copy(c.pos); this.carBody.quaternion.set(c.q.x, c.q.y, c.q.z, c.q.w);
    const q = new THREE.Quaternion(c.q.x, c.q.y, c.q.z, c.q.w);
    c.wheels.forEach((w, i) => { const v = this.wheelVis[i]; v.position.set(w.center.x, w.center.y, w.center.z); v.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.steer)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), w.spin)); });
  }
  updateCamera(dt) {
    const c = this.car, cam = this.gfx.camera, f = new THREE.Vector3(c.fw.x, 0, c.fw.z).normalize();
    if (this.camMode === 2) {
      const eye = new THREE.Vector3(0.38, c.spec.dims.H - c.cgH - 0.42, 0.1).applyQuaternion(this.carBody.quaternion).add(c.pos);
      cam.position.copy(eye); cam.up.set(c.up.x, c.up.y, c.up.z); cam.lookAt(eye.clone().add(new THREE.Vector3(c.fw.x, c.fw.y, c.fw.z).multiplyScalar(10))); cam.fov = 62; cam.updateProjectionMatrix(); return;
    }
    const dist = this.camMode === 0 ? this.orbit.dist : 15, h = this.camMode === 0 ? 2.2 : 5;
    const want = new THREE.Vector3().copy(c.pos).addScaledVector(f, -dist); want.y = c.pos.y + h;
    want.y = Math.max(want.y, this.world.height(want.x, want.z) + 1.2);
    const k = 1 - Math.exp(-dt * 6); this.camPos.lerp(want, k);
    cam.position.copy(this.camPos); cam.up.set(0, 1, 0);
    cam.lookAt(c.pos.x, c.pos.y + 1.0, c.pos.z);
    cam.fov = 58 + Math.min(10, c.kmh * 0.06); cam.updateProjectionMatrix();
  }
  hud() {
    const c = this.car, el = $('hudSpeed'); if (!el) return;
    el.textContent = Math.round(c.kmh); $('hudGear').textContent = c.gearName + (c.state.low ? ' L' : ''); $('hudRpm').style.width = Math.min(100, c.rpm / (c.eng.lim * 60 / (2 * Math.PI)) * 100) + '%';
    $('hudAids').textContent = (c.state.absOn ? 'ABS ' : '') + (c.state.tcsOn ? 'TCS ' : '') + (c.state.espOn ? 'ESP' : '');
    $('hudDbg').textContent = `${this.terrain.stats.drawn} biter · ${this.gfx.renderer.info.render.calls} kall · ${Math.round(this.gfx.renderer.info.render.triangles / 1000)}k tri`;
  }
}
