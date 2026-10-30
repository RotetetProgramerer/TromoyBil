// The player's car on screen: the glb model (assets/cars/<model>.glb, made by tools/build-cars.mjs) with car paint, glass and
// lights, wheels that turn and steer and sit where the physics puts them, a steering wheel, working lights (headlights with real
// spotlights at night, brake, reverse and indicator lights), and dirt, dust and snow that build up on the paint.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prep, U } from './gfx.js';

const loader = new GLTFLoader();
const cache = new Map();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

export async function loadCarModel(url) {
  if (cache.has(url)) return cache.get(url);
  const p = loader.loadAsync(url).then(g => g.scene).catch(() => null);
  cache.set(url, p); return p;
}

// paint that gets dirty: mud low on the body, dust everywhere, snow on top, and water that makes it glossy
function paintPatch(dirt) {
  const p = sh => {
    sh.uniforms.uDirt = dirt;
    sh.vertexShader = 'varying vec3 vObjPos; varying vec3 vObjN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjPos = position; vObjN = normal;');
    sh.fragmentShader = 'uniform vec4 uDirt; varying vec3 vObjPos; varying vec3 vObjN;\nfloat dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\nfloat dn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(dh(i), dh(i+vec3(1,0,0)), f.x), mix(dh(i+vec3(0,1,0)), dh(i+vec3(1,1,0)), f.x), f.y), mix(mix(dh(i+vec3(0,0,1)), dh(i+vec3(1,0,1)), f.x), mix(dh(i+vec3(0,1,1)), dh(i+vec3(1,1,1)), f.x), f.y), f.z); }\n'
      + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float nz = dn(vObjPos * 6.0) * 0.6 + dn(vObjPos * 21.0) * 0.4;
      float low = 1.0 - smoothstep(-0.45, 0.35, vObjPos.y + nz * 0.25);
      float mud = clamp(uDirt.x * (low * 1.4 + 0.15) - (1.0 - nz) * 0.5, 0.0, 1.0);
      float dust = clamp(uDirt.z * (0.4 + nz * 0.8), 0.0, 1.0) * 0.7;
      float snow = clamp(uDirt.y * smoothstep(0.35, 0.85, vObjN.y) * (0.5 + nz), 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.15, 0.1), mud * 0.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.47, 0.4), dust * (1.0 - mud));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), snow);
      roughnessFactor = mix(roughnessFactor, 0.95, max(mud, dust));
      roughnessFactor = mix(roughnessFactor, 0.08, uDirt.w * (1.0 - mud));`)
      .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>')
  };
  p.key = 'paint';
  return p;
}

export class CarVisual {
  constructor(gfx, base) { this.gfx = gfx; this.base = base; this.group = new THREE.Group(); gfx.scene.add(this.group); this.dirt = { value: new THREE.Vector4(0, 0, 0, 0) }; this.lights = false; this.t = 0; }

  async build(spec, color) {
    this.dispose();
    this.spec = spec;
    const src = await loadCarModel(new URL(`../../assets/cars/${spec.model}.glb`, import.meta.url).href);
    const root = src ? src.clone(true) : this.fallback(spec);
    this.root = root; this.group.add(root);
    this.mats = {}; this.wheels = []; this.calipers = [];
    const seen = new Map();
    root.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const name = o.material && o.material.name || '';
        if (!seen.has(o.material)) seen.set(o.material, this.material(name, o.material));
        o.material = seen.get(o.material);
        if (name === 'glass') { o.castShadow = false; o.renderOrder = 2; }
      }
    });
    for (const id of ['FL', 'FR', 'RL', 'RR']) this.wheels.push(root.getObjectByName('wheel_' + id) || new THREE.Group());
    for (const id of ['FL', 'FR', 'RL', 'RR']) this.calipers.push(root.getObjectByName('caliper_' + id));
    this.steering = root.getObjectByName('steering');
    this.eye = root.getObjectByName('driver_eye');
    this.steerQ0 = this.steering ? this.steering.quaternion.clone() : null;
    // wheels and calipers move every frame: take them out of the body so their transforms are world transforms
    this.wheelHolders = this.wheels.map(w => { const h = new THREE.Group(); this.group.add(h); h.add(w); w.position.set(0, 0, 0); w.quaternion.identity(); return h; });
    this.caliperHolders = this.calipers.map((c, i) => { if (!c) return null; const h = this.wheelHolders[i]; const g = new THREE.Group(); this.group.add(g); g.add(c); c.position.set(0, 0, 0); c.quaternion.identity(); return g; });
    this.setColor(color);
    // headlights: two spotlights with shadows off, aimed down the road; the lens glows when they are on
    this.spots = [];
    const hl = spec.dims.L / 2 - 0.2;
    for (const sx of [1, -1]) {
      const s = new THREE.SpotLight(0xfff2dd, 0, 90, 0.42, 0.55, 1.6); s.position.set(sx * spec.dims.W * 0.33, -spec.cgH + spec.clear + 0.45, hl);
      s.target.position.set(sx * spec.dims.W * 0.3, -spec.cgH - 1.5, hl + 25); this.root.add(s, s.target); this.spots.push(s);
    }
    return this;
  }
  material(name, m) {
    const std = (o) => { const mm = new THREE.MeshPhysicalMaterial(o); mm.name = name; return mm; };
    let mat;
    switch (name) {
      case 'paint': mat = std({ color: 0xcc2222, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }); prep(mat, paintPatch(this.dirt)); break;
      case 'glass': mat = std({ color: 0x0c1418, metalness: 0.2, roughness: 0.03, transparent: true, opacity: 0.55, envMapIntensity: 1.5 }); prep(mat); break;
      case 'chrome': mat = std({ color: 0xdddddd, metalness: 1, roughness: 0.12 }); prep(mat); break;
      case 'rim': mat = std({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.28 }); prep(mat, paintPatch(this.dirt)); break;
      case 'disc': mat = std({ color: 0x6a6a6a, metalness: 0.9, roughness: 0.4 }); prep(mat); break;
      case 'caliper': mat = std({ color: 0xc8a010, metalness: 0.3, roughness: 0.4 }); prep(mat); break;
      case 'rubber': mat = std({ color: 0x151515, metalness: 0, roughness: 0.92 }); prep(mat, paintPatch(this.dirt)); break;
      case 'trim': mat = std({ color: 0x141414, metalness: 0, roughness: 0.6 }); prep(mat, paintPatch(this.dirt)); break;
      case 'interior': mat = std({ color: 0x2a2a2a, roughness: 0.85 }); prep(mat); break;
      case 'plate': mat = std({ color: 0xf0f0ea, roughness: 0.5 }); prep(mat); break;
      default:
        if (name.startsWith('light_')) {
          const rear = /tail|brake|ind_rear/.test(name), amber = /ind/.test(name), rev = /reverse/.test(name);
          const c = rev ? 0xffffff : amber ? 0xff9a20 : rear ? 0xcc1010 : 0xfff6e8;
          mat = std({ color: rear || amber ? new THREE.Color(c).multiplyScalar(0.5) : 0xeeeeee, metalness: 0.1, roughness: 0.1, emissive: c, emissiveIntensity: 0, transparent: !rear, opacity: rear ? 1 : 0.9 });
          prep(mat);
        } else { mat = (m && m.isMaterial ? m.clone() : new THREE.MeshStandardMaterial({ color: 0x777777 })); prep(mat); }
    }
    if (!name.startsWith('light_') && name !== 'glass') this.gfx.shadowed(mat);
    this.mats[name] = mat;
    return mat;
  }
  setColor(c) { const m = this.mats.paint; if (m) m.color.set(c); }

  // a simple stand-in until the car's glb exists: boxes for the body and cylinders for the wheels
  fallback(s) {
    const root = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; root.add(body);
    const mk = (n, c) => { const m = new THREE.MeshStandardMaterial({ color: c }); m.name = n; return m; };
    const paint = mk('paint', 0xcc2222), glass = mk('glass', 0x111111), trim = mk('trim', 0x111111), rub = mk('rubber', 0x111111), rim = mk('rim', 0xaaaaaa);
    const y0 = s.clear - s.cgH, h = s.dims.H, L = s.dims.L, W = s.dims.W;
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(W, h * 0.45, L), paint); b1.position.y = y0 + h * 0.3; body.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, h * 0.38, L * 0.52), glass); b2.position.set(0, y0 + h * 0.7, -L * 0.05); body.add(b2);
    for (const n of ['light_head', 'light_tail', 'light_brake', 'light_reverse']) { const m = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.08, 0.05), mk(n, 0xffffff)); m.position.set(0, y0 + h * 0.4, n === 'light_head' ? L / 2 : -L / 2); body.add(m); }
    const ax = [['FL', s.wb * (1 - (s.wd ?? 0.55)), s.trackF / 2, s.wheel.rF, s.wheel.wF], ['FR', s.wb * (1 - (s.wd ?? 0.55)), -s.trackF / 2, s.wheel.rF, s.wheel.wF], ['RL', -s.wb * (s.wd ?? 0.55), s.trackR / 2, s.wheel.rR, s.wheel.wR], ['RR', -s.wb * (s.wd ?? 0.55), -s.trackR / 2, s.wheel.rR, s.wheel.wR]];
    for (const [id, z, x, r, w] of ax) {
      const n = new THREE.Group(); n.name = 'wheel_' + id; n.position.set(x, r - s.cgH, z); root.add(n);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), rub); t.rotation.z = Math.PI / 2; n.add(t);
      const rm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w * 1.02, 16), rim); rm.rotation.z = Math.PI / 2; n.add(rm);
    }
    return root;
  }
  dispose() { if (this.root) { this.group.clear(); this.root = null; } }

  // copy the physics state onto the model; car = the Vehicle
  sync(car, dt, opts = {}) {
    if (!this.root) return;
    this.t += dt;
    const q = car.q;
    this.root.position.set(car.pos.x, car.pos.y, car.pos.z); this.root.quaternion.set(q.x, q.y, q.z, q.w);
    _q.set(q.x, q.y, q.z, q.w);
    car.wheels.forEach((w, i) => {
      const h = this.wheelHolders[i]; if (!h) return;
      h.position.set(w.center.x, w.center.y, w.center.z);
      h.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(Y, w.steer)).multiply(new THREE.Quaternion().setFromAxisAngle(X, w.spin));
      const c = this.caliperHolders[i]; if (c) { c.position.copy(h.position); c.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(Y, w.steer)); }
    });
    if (this.steering && this.steerQ0) this.steering.quaternion.copy(this.steerQ0).multiply(_q2.setFromAxisAngle(Z, -car.state.steer * 7));
    // lights
    const st = car.state, night = U.uNight.value, on = this.lights || night > 0.6;
    const set = (n, v) => { const m = this.mats[n]; if (m) m.emissiveIntensity = v; };
    set('light_head', on ? 6 : 0); set('light_drl', 3);
    set('light_tail', on ? 2.5 : 0); set('light_brake', st.brake > 0.05 ? 7 : on ? 2.5 : 0);
    set('light_reverse', st.gear < 0 && car.speed < 0.5 ? 5 : 0);
    const blink = (this.t * 1.5) % 1 < 0.5 ? 6 : 0, ind = opts.indicator || 0;
    set('light_ind_L', ind === 1 || ind === 3 ? blink : 0); set('light_ind_R', ind === 2 || ind === 3 ? blink : 0);
    set('light_ind_rear_L', ind === 1 || ind === 3 ? blink : 0); set('light_ind_rear_R', ind === 2 || ind === 3 ? blink : 0);
    for (const s of this.spots) s.intensity = on ? 900 : 0;
  }
  // mud, snow, dust and water on the paint (0–1 each), driven by what the wheels drive through
  weather(dt, car, wet, snowing) {
    const d = this.dirt.value; let mud = 0, dust = 0, water = 0;
    for (const w of car.wheels) if (w.contact) {
      const v = Math.abs(w.vLong);
      if (w.surf === 6 || w.surf === 7) mud += v * 0.004; else if (w.surf === 2 || w.surf === 3 || w.surf === 5 || w.surf === 14) dust += v * 0.0009;
      if (w.wd > 0) water += 0.3;
    }
    d.x = Math.min(1, d.x + mud * dt * 4 - (water + wet * 0.3) * d.x * dt * 0.02);
    d.z = Math.min(1, d.z + dust * dt * 4 - (water + wet) * d.z * dt * 0.05);
    d.y = Math.max(0, Math.min(1, d.y + (snowing ? dt * 0.01 : -dt * 0.01)));
    d.w += ((wet > 0.3 || water > 0 ? 1 : 0) - d.w) * dt * 0.2;
  }
  clean() { this.dirt.value.set(0, 0, 0, 0); }
}
