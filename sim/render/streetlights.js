// Street lights along the asphalt roads where people live: a lamp every ~38 m on one side, on a pole with an arm over the road.
// The lamps near the camera are drawn (one instanced mesh); at dusk and at night their heads glow and the nearest few are real
// spotlights that light the road, the cars and the houses round them.
import * as THREE from 'three';
import { prep, U } from './gfx.js';

const GAP = 38, CELL = 64;
function lampGeometry() {
  // pole (tapered), arm out over the road, the head; group 0 is the metal, group 1 the lens under the head
  const parts = [], lens = [];
  const pole = new THREE.CylinderGeometry(0.06, 0.1, 8, 8); pole.translate(0, 4, 0); parts.push(pole);
  const arm = new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6); arm.rotateZ(Math.PI / 2 - 0.12); arm.translate(0.9, 8.05, 0); parts.push(arm);
  const head = new THREE.BoxGeometry(0.62, 0.14, 0.28); head.translate(1.85, 8.18, 0); parts.push(head);
  const l = new THREE.BoxGeometry(0.5, 0.03, 0.2); l.translate(1.85, 8.1, 0); lens.push(l);
  const merge = gs => { const out = new THREE.BufferGeometry(), P = [], N = [], I = []; let o = 0; for (const g of gs) { const gi = g.toNonIndexed(); P.push(...gi.attributes.position.array); N.push(...gi.attributes.normal.array); o += gi.attributes.position.count; } out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return out; };
  const a = merge(parts), b = merge(lens), g = new THREE.BufferGeometry(), na = a.attributes.position.count, nb = b.attributes.position.count;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a.attributes.position.array, ...b.attributes.position.array], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...a.attributes.normal.array, ...b.attributes.normal.array], 3));
  g.addGroup(0, na, 0); g.addGroup(na, nb, 1); g.computeBoundingSphere();
  return g;
}

export class StreetLights {
  constructor(gfx, world, real = 6) {
    this.gfx = gfx; this.world = world; this.lamps = []; this.grid = new Map(); this.at = new THREE.Vector3(1e9, 0, 0); this.t = 0;
    for (const isl of world.islands) if (!isl.def.backdrop) this.place(isl);
    const metal = prep(new THREE.MeshStandardMaterial({ color: 0x8a8e92, metalness: 0.7, roughness: 0.45 })); gfx.shadowed(metal);
    this.lens = prep(new THREE.MeshStandardMaterial({ color: 0xddd8c8, emissive: 0xffc98a, emissiveIntensity: 0, roughness: 0.3 }));
    this.mesh = new THREE.InstancedMesh(lampGeometry(), [metal, this.lens], 4000); this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    gfx.scene.add(this.mesh);
    // the few real lights: warm sodium-white spotlights under the nearest heads (a fixed number, so no shader recompiles)
    this.spots = [];
    for (let i = 0; i < real; i++) { const s = new THREE.SpotLight(0xffd9a8, 0, 34, 1.05, 0.65, 1.4); s.castShadow = false; gfx.scene.add(s, s.target); this.spots.push(s); }
  }
  // lamps along asphalt roads of class 0–4 that have houses near them (built-up areas), offset to one side, never on bridges
  place(isl) {
    for (const r of isl.roads.roads) {
      if (r.s !== 0 || r.c > 4) continue;
      const p = r.p, m = p.length / 3, br = r.b ? new Set(r.b) : null, side = r.c <= 2 || (m & 1) ? 1 : -1;
      let d = 0, next = GAP * 0.5;
      for (let i = 0; i < m - 1; i++) {
        const ax = p[i * 3], az = p[i * 3 + 1], bx = p[i * 3 + 3], bz = p[i * 3 + 4], L = Math.hypot(bx - ax, bz - az);
        for (; next <= d + L; next += GAP) {
          if (L < 1e-3 || br && (br.has(i) || br.has(i + 1))) continue;
          const f = (next - d) / L, x = ax + (bx - ax) * f, z = az + (bz - az) * f, tx = (bx - ax) / L, tz = (bz - az) / L;
          const hw = (r.wv ? r.wv[i] : r.w) / 2, nx = tz * side, nz = -tx * side, lx = x + nx * (hw + 1.3), lz = z + nz * (hw + 1.3);
          let near = 0; for (const k of isl.buildingsNear(lx, lz)) { const o = isl.buildings[k].obb; if (Math.hypot(o.x - lx, o.z - lz) < 60) near++; }
          if (near < 2 || isl.inBuilding(lx, lz, 0.8)) continue;
          const wx = lx + isl.ox, wz = lz + isl.oz, gy = isl.height(wx, wz); if (gy < 0.4) continue;
          const lamp = { x: wx, z: wz, y: gy, ang: Math.atan2(nz, -nx) };       // the arm (local +x) reaches out over the road
          this.lamps.push(lamp);
          const key = Math.floor(wx / CELL) + ',' + Math.floor(wz / CELL); let G = this.grid.get(key); if (!G) this.grid.set(key, G = []); G.push(lamp);
          if (isl.addCollider) isl.addCollider({ x: wx, z: wz, r: 0.12, kind: 'post', bounce: 0.1 });
        }
        d += L;
      }
    }
  }
  near(x, z, R) { const out = [], c = Math.ceil(R / CELL); const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL); for (let j = cj - c; j <= cj + c; j++) for (let i = ci - c; i <= ci + c; i++) { const L = this.grid.get(i + ',' + j); if (L) out.push(...L); } return out; }
  update(dt) {
    const cam = this.gfx.camera.position, on = THREE.MathUtils.smoothstep(U.uNight.value, 0.3, 0.6);
    this.lens.emissiveIntensity = on * 14;
    // the instances round the camera: rebuilt when the camera has moved 60 m
    if (this.at.distanceTo(cam) > 60) {
      this.at.copy(cam); const L = this.near(cam.x, cam.z, 1400), M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
      let n = 0; for (const l of L) { if (n >= 4000) break; M.compose(P.set(l.x, l.y, l.z), q.setFromAxisAngle(Y, l.ang), S); this.mesh.setMatrixAt(n++, M); }
      this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
    }
    // the real lights under the nearest lamp heads (re-picked a few times a second)
    if ((this.t -= dt) > 0) return; this.t = 0.3;
    const S = this.spots; if (!S.length) return;
    const L = on > 0 ? this.near(cam.x, cam.z, 160).map(l => [l, (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2]).sort((a, b) => a[1] - b[1]) : [];
    for (let i = 0; i < S.length; i++) {
      const s = S[i], e = L[i]; if (!e) { s.intensity = 0; continue; }
      const l = e[0], hx = l.x + Math.cos(l.ang) * 1.85, hz = l.z - Math.sin(l.ang) * 1.85;
      s.position.set(hx, l.y + 8.05, hz); s.target.position.set(hx, l.y, hz); s.target.updateMatrixWorld(); s.intensity = on * 520;
    }
  }
}
