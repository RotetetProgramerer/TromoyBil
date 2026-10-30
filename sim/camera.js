// Cameras: chase (a spring arm that swings out in bends and looks ahead), far chase, bonnet, cockpit (from the driver's eye in the
// model), TV (a camera by the roadside that the car passes), and a free orbit you get by dragging with the mouse or a finger.
import * as THREE from 'three';

export const CAM_NAMES = ['Følgekamera', 'Langt bak', 'Panser', 'Førerplass', 'TV-kamera'];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

export class CameraRig {
  constructor(gfx, world, el) {
    this.gfx = gfx; this.world = world; this.mode = 0; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.snap = true;
    this.yaw = 0; this.pitch = 0; this.dragT = 0; this.zoom = 1; this.shake = 0; this.tv = null;
    let drag = null, pinch = null; const ptrs = new Map();
    el.addEventListener('pointerdown', e => { if (e.target !== el && e.target.tagName !== 'CANVAS') return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 1) drag = [e.clientX, e.clientY]; else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = [Math.hypot(a[0] - b[0], a[1] - b[1]), this.zoom]; } });
    addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; this.zoom = Math.max(0.5, Math.min(2.5, pinch[1] * pinch[0] / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])))); return; }
      if (drag) { this.yaw -= (e.clientX - drag[0]) * 0.006; this.pitch = Math.max(-0.4, Math.min(1.2, this.pitch + (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY]; this.dragT = 2.5; }
    });
    const end = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.5, Math.min(2.5, this.zoom * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
  }
  // is this point inside a house (below its roof) or under the ground?
  blocked(x, y, z) {
    if (y < this.world.height(x, z) + 0.25) return true;
    const isl = this.world.islandAt(x, z); if (!isl || !isl.buildings || !isl.buildings.length) return false;
    const lx = x - isl.ox, lz = z - isl.oz;
    for (const k of isl.buildingsNear(lx, lz)) {
      const b = isl.buildings[k], r = b.obb, dx = lx - r.x, dz = lz - r.z, cs = Math.cos(r.ang), sn = Math.sin(r.ang);
      if (y < b.y1 + (b.f || 1) * 3 + 3.5 && Math.abs(dx * cs - dz * sn) <= r.hw + 0.4 && Math.abs(dx * sn + dz * cs) <= r.hd + 0.4) return true;
    }
    return false;
  }
  next() { this.mode = (this.mode + 1) % CAM_NAMES.length; this.snap = true; this.tv = null; return CAM_NAMES[this.mode]; }
  get inside() { return this.mode === 3; }

  update(dt, car, vis, look = {}) {
    const cam = this.gfx.camera, s = car.spec, c = car;
    const fw = _v.set(c.fw.x, 0, c.fw.z); if (fw.lengthSq() < 1e-6) fw.set(0, 0, 1); fw.normalize();
    // the stick or a drag looks round; it swings back when you let go
    if (look.lookX || look.lookY) { this.yaw = -look.lookX * 2.2; this.pitch = Math.max(-0.3, look.lookY * 0.8); this.dragT = 0.3; }
    this.dragT -= dt; if (this.dragT <= 0) { this.yaw *= Math.exp(-dt * 2.5); this.pitch *= Math.exp(-dt * 2.5); }
    const kmh = c.kmh;
    if (this.mode === 2 || this.mode === 3) {
      const root = vis.root; if (!root) return;
      let eye;
      if (this.mode === 3 && vis.eye) eye = vis.eye.getWorldPosition(new THREE.Vector3());
      else eye = new THREE.Vector3(0, s.dims.H - s.cgH + 0.05, s.dims.L * 0.18).applyQuaternion(root.quaternion).add(root.position);
      cam.position.copy(eye);
      _q.copy(root.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.pitch * 0.6 + (this.mode === 2 ? 0.06 : 0.04), this.yaw + Math.PI, 0, 'YXZ')));
      cam.quaternion.copy(_q);
      cam.fov = (this.mode === 3 ? 68 : 62) / Math.sqrt(this.zoom); cam.near = 0.05;
    } else if (this.mode === 4) {
      // a fixed camera by the road ahead; when the car has gone past and is far away, pick a new spot ahead
      if (!this.tv || this.tv.distanceTo(c.pos) > 90) {
        const ahead = 35 + kmh * 0.6, side = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 6);
        this.tv = new THREE.Vector3(c.pos.x + fw.x * ahead + fw.z * side, 0, c.pos.z + fw.z * ahead - fw.x * side);
        this.tv.y = this.world.height(this.tv.x, this.tv.z) + 1.6 + Math.random() * 2.5;
      }
      cam.position.copy(this.tv); cam.up.set(0, 1, 0); cam.lookAt(c.pos.x, c.pos.y + 0.4, c.pos.z);
      const d = this.tv.distanceTo(c.pos); cam.fov = Math.max(8, Math.min(50, 900 / Math.max(8, d))); cam.near = 0.2;
    } else {
      // chase: behind and above, swinging out with the car's sideways motion, a little further back at speed
      const far = this.mode === 1, dist = (far ? 13 : 5.5 + s.dims.L * 0.55 + Math.min(2.5, kmh * 0.012)) * this.zoom, h = (far ? 4.5 : 1.6 + s.dims.H * 0.55) * Math.sqrt(this.zoom);
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), bx = -(fw.x * cy + fw.z * sy), bz = -(-fw.x * sy + fw.z * cy);
      const vel = c.vel, vh = Math.hypot(vel.x, vel.z);
      // look where the car is going (velocity) more than where it points, so a slide is visible
      let dx = bx, dz = bz;
      if (vh > 3 && Math.abs(this.yaw) < 0.2) { const k = Math.min(1, (vh - 3) / 10) * 0.6; dx = dx * (1 - k) - vel.x / vh * k; dz = dz * (1 - k) - vel.z / vh * k; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
      const want = _w.set(c.pos.x + dx * dist, c.pos.y + h + this.pitch * dist * 0.5, c.pos.z + dz * dist);
      const gy = this.world.height(want.x, want.z) + 0.6; if (want.y < gy) want.y = gy;
      if (this.snap) { this.pos.copy(want); this.snap = false; }
      else { const k = 1 - Math.exp(-dt * (far ? 3 : 7)); this.pos.lerp(want, k); const ky = 1 - Math.exp(-dt * 4); this.pos.y += (want.y - this.pos.y) * (ky - k); }
      // keep out of houses and hills between the car and the camera: pull in along the arm at once, ease back out
      const ax = c.pos.x, ay = c.pos.y + h * 0.6, az = c.pos.z, P = this.pos;
      for (let k = 1; k <= 14; k++) {
        const u = k / 14, x = ax + (P.x - ax) * u, y = ay + (P.y - ay) * u, z = az + (P.z - az) * u;
        if (this.blocked(x, y, z)) { const f = Math.max(0.12, (k - 1.6) / 14); P.set(ax + (P.x - ax) * f, ay + (P.y - ay) * f, az + (P.z - az) * f); break; }
      }
      cam.position.copy(this.pos); cam.up.set(0, 1, 0);
      this.look.set(c.pos.x + fw.x * (2 + kmh * 0.03), c.pos.y + 0.6 + s.dims.H * 0.25, c.pos.z + fw.z * (2 + kmh * 0.03));
      cam.lookAt(this.look);
      cam.fov = 55 + Math.min(14, kmh * 0.07); cam.near = 0.1;
    }
    // shake: rough ground, impacts, high speed
    if (this.shake > 0.001) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-dt * 8); }
    cam.updateProjectionMatrix();
  }
}
