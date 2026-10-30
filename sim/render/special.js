// The special things of the made-up islands (features.special, made by tools/geo/build_islands.mjs): glowing lava rivers and the lava
// lake, smoke and steam, waterfalls, rapids and small streams, the chairlift with moving chairs and the pistes, the runway and the
// airport, quays and the marina, bridges (railings and piers on every bridge), the parking garage, the stadium, the temple, tents
// and camps, signs with Norwegian text, frozen lakes and a few props. Opaque things are instanced in gfx.scene; see-through things are
// in gfx.overlay, which has no depth buffer, so their shaders test against the scene's depth themselves (like the water).
// The decks and colliders the car needs are registered by sim/world/structures.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, U } from './gfx.js';
import { addStructures } from '../world/structures.js';
import { mulberry32 } from '../world/grid.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

// ------------------------------------------------------------------ shaders for the see-through things
const OV_VERT = 'varying vec3 vW; varying float vVZ;\n';
const OV_POS = 'vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz; vec4 vp = viewMatrix * wp; vVZ = -vp.z; gl_Position = projectionMatrix * vp;';
const OV_FRAG = `#include <packing>
uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform vec2 uRes; uniform vec3 fogColor; uniform float fogDensity;
uniform float uFogFall; uniform float uTime; uniform float uNight; uniform vec3 uFogSun; uniform vec3 uSunDir;
varying vec3 vW; varying float vVZ;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }
// how far behind this fragment the solid scene is (negative: something solid is in front of it)
float behind(){ return -perspectiveDepthToViewZ(texture2D(tDepth, gl_FragCoord.xy / uRes).x, uNear, uFar) - vVZ; }
vec3 fogMix(vec3 col){ vec3 fv = vW - cameraPosition; float fd = length(fv); vec3 frd = fv / max(fd, 1e-3); float fb = max(uFogFall, 1e-5), ft = fd * frd.y * fb;
  float fk = abs(ft) < 1e-4 ? fd : (1.0 - exp(-ft)) / (frd.y * fb); float fa = 1.0 - exp(-fogDensity * exp(-max(cameraPosition.y, 0.0) * fb) * fk);
  return mix(col, mix(fogColor, uFogSun, pow(max(dot(frd, uSunDir), 0.0), 8.0) * 0.6), fa); }
`;
// smoke, steam and spray: particles that rise, drift with the wind, grow and fade (all on the GPU, from their seeds)
const SMOKE_VS = OV_VERT + `attribute vec4 aSeed; attribute vec4 aEm; uniform float uTime; uniform float uPx; varying float vA; varying float vK; varying float vAge;
void main(){ float life = aEm.z * (0.7 + 0.6 * aSeed.z), age = fract(uTime / life + aSeed.x);
  vec3 p = position + vec3(cos(aSeed.y), 0.0, sin(aSeed.y)) * aEm.y * (0.15 + 0.9 * age) * aSeed.w + vec3(0.8, 0.0, 0.35) * aEm.x * age * age * 0.6 + vec3(0.0, aEm.x * age, 0.0);
  ${OV_POS} float size = aEm.y * (0.45 + 1.6 * age) * aSeed.w; gl_PointSize = clamp(size * uPx / max(vVZ, 1.0), 1.0, 900.0);
  vA = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.5, 1.0, age)); vK = aEm.w; vAge = age; }`;
const SMOKE_FS = OV_FRAG + `varying float vA; varying float vK; varying float vAge;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; if (r > 1.0) discard; float b = behind(); if (b < 0.0) discard;
  float n = vn(gl_PointCoord * 3.0 + vAge * 2.0 + vK * 7.0);
  float a = vA * (1.0 - r * r) * (0.5 + 0.5 * n) * smoothstep(0.0, 4.0, b);
  vec3 col = vK < 0.5 ? mix(vec3(0.13, 0.12, 0.11), vec3(0.5, 0.48, 0.46), vAge) : vec3(0.9, 0.92, 0.94);
  vec3 glow = vK < 0.5 ? vec3(1.0, 0.32, 0.08) * (1.0 - smoothstep(0.0, 0.22, vAge)) * 1.5 : vec3(0.0);
  col = col * (0.3 + 0.7 * (1.0 - uNight)) + glow;
  gl_FragColor = vec4(fogMix(col), a * (vK < 0.5 ? 0.8 : vK < 1.5 ? 0.45 : 0.35)); }`;
// a falling sheet of water: streaks running down, white foam at the foot
const FALL_VS = OV_VERT + 'varying vec2 vUv;\nvoid main(){ vUv = uv; vec3 p = position; ' + OV_POS + ' }';
const FALL_FS = OV_FRAG + `varying vec2 vUv;
void main(){ float b = behind(); if (b < 0.0) discard;
  float s = vn(vec2(vUv.x * 22.0, vUv.y * 3.0 - uTime * 2.4)) * 0.6 + vn(vec2(vUv.x * 55.0, vUv.y * 8.0 - uTime * 3.6)) * 0.4;
  float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x), foam = smoothstep(0.7, 1.0, vUv.y);
  vec3 col = mix(vec3(0.5, 0.62, 0.64), vec3(0.97), s * 0.75 + foam * 0.5) * (0.3 + 0.7 * (1.0 - uNight));
  gl_FragColor = vec4(fogMix(col), clamp((0.4 + 0.5 * s + 0.25 * foam) * edge * smoothstep(0.0, 1.5, b), 0.0, 0.93)); }`;
// running water on a ribbon (streams, rapids): u = metres along, v = across
const FLOW_VS = OV_VERT + 'varying vec2 vUv;\nvoid main(){ vUv = uv; vec3 p = position; ' + OV_POS + ' }';
const FLOW_FS = OV_FRAG + `uniform float uSpeed; uniform float uFoam; varying vec2 vUv;
void main(){ float b = behind(); if (b < -0.05) discard;
  float flow = vn(vec2(vUv.x * 0.22 - uTime * uSpeed, vUv.y * 4.0)), rip = vn(vec2(vUv.x * 1.2 - uTime * uSpeed * 2.2, vUv.y * 11.0));
  float edge = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
  vec3 col = mix(vec3(0.04, 0.11, 0.11), vec3(0.3, 0.42, 0.42), flow * 0.5 + rip * 0.3);
  float foam = uFoam * smoothstep(0.5, 0.85, rip * 0.7 + flow * 0.5); col = mix(col, vec3(0.92), foam);
  vec3 V = normalize(cameraPosition - vW); float fres = 0.04 + 0.96 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  col = mix(col, vec3(0.6, 0.7, 0.8), fres * 0.55) * (0.3 + 0.7 * (1.0 - uNight));
  gl_FragColor = vec4(fogMix(col), (0.72 + 0.25 * foam) * edge); }`;

// ------------------------------------------------------------------ geometry helpers
const G = {};
function geos() {
  if (G.box) return G;
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  G.cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
  G.cone = new THREE.ConeGeometry(1, 1, 8);
  G.sphere = new THREE.SphereGeometry(1, 10, 7);
  // a ridge tent: two sloping sides and the gables, 1 × 1 × 1 (ridge along z)
  const t = new THREE.BufferGeometry(), P = [-0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, 0.5];
  t.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); t.setIndex([0, 3, 4, 0, 4, 1, 2, 1, 4, 2, 4, 5, 0, 1, 2, 3, 5, 4]); t.computeVertexNormals(); G.tent = t;
  // a small boat hull: pointed at +z, open at the top
  const h = new THREE.BufferGeometry(), HP = [-0.5, 0.35, -0.5, 0.5, 0.35, -0.5, 0.5, 0.35, 0.25, 0, 0.45, 0.5, -0.5, 0.35, 0.25, -0.32, 0, -0.45, 0.32, 0, -0.45, 0.3, 0, 0.2, 0, 0.1, 0.48, -0.3, 0, 0.2];
  h.setAttribute('position', new THREE.Float32BufferAttribute(HP, 3));
  h.setIndex([0, 5, 6, 0, 6, 1, 1, 6, 7, 1, 7, 2, 2, 7, 8, 2, 8, 3, 3, 8, 9, 3, 9, 4, 4, 9, 5, 4, 5, 0, 5, 9, 7, 5, 7, 6, 9, 8, 7]); h.computeVertexNormals(); G.hull = h;
  // a chair of the chairlift: hanger, seat, backrest and the safety bar, hanging from y = 0
  const parts = [[0, -1.25, 0, 0.06, 2.5, 0.06], [0, -2.45, 0.05, 1.9, 0.08, 0.55], [0, -2.1, -0.2, 1.9, 0.6, 0.06], [0, -1.9, 0.35, 1.9, 0.05, 0.05]].map(([x, y, z, sx, sy, sz]) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
  G.chair = mergeGeometries(parts);
  return G;
}
// a strip along a line of [x, y, z, half width]: uv u = metres along, v = 0 (left) … 1 (right)
function ribbon(pts, lift = 0) {
  const n = pts.length, P = new Float32Array(n * 6), UV = new Float32Array(n * 4), N = new Float32Array(n * 6), I = []; let along = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], tz = b[2] - a[2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    const [x, y, z, w] = pts[i];
    P.set([x - tz * w, y + lift, z + tx * w, x + tz * w, y + lift, z - tx * w], i * 6); UV.set([along, 0, along, 1], i * 4); N.set([0, 1, 0, 0, 1, 0], i * 6);
    if (i) { const q = (i - 1) * 2; I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setIndex(I); g.computeBoundingSphere();
  return g;
}
// a canvas texture with the text of a sign
function signTexture(text, sub, w) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 / w * 1.1); const g = cv.getContext('2d');
  g.fillStyle = '#1f4f8a'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#f2f2ec'; g.lineWidth = 10; g.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  g.fillStyle = '#f7f7f2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = Math.min(cv.height * 0.42, 900 / Math.max(4, text.length)); g.font = `700 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  while (g.measureText(text).width > cv.width - 50 && fs > 10) { fs -= 2; g.font = `700 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`; }
  g.fillText(text, cv.width / 2, sub ? cv.height * 0.4 : cv.height / 2);
  if (sub) { let f2 = cv.height * 0.2; g.font = `500 ${f2}px "Barlow Condensed", "Arial Narrow", sans-serif`; while (g.measureText(sub).width > cv.width - 50 && f2 > 8) { f2 -= 1; g.font = `500 ${f2}px "Barlow Condensed", "Arial Narrow", sans-serif`; } g.fillText(sub, cv.width / 2, cv.height * 0.74); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class Special {
  constructor(gfx, world) {
    this.gfx = gfx; this.world = world; this.groups = []; this.chairs = []; this.lavaPts = []; this.t = 0;
    geos();
    this.mats = {};
    // the uniforms every see-through material shares (updated each frame)
    this.ou = { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 1e4 }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 500 },
      fogColor: { value: gfx.scene.fog.color }, fogDensity: { value: 0 }, uTime: U.uTime, uNight: U.uNight, uFogFall: U.uFogFall, uFogSun: U.uFogSun, uSunDir: U.uSunDir };
    this.smokeMat = this.overlayMat(SMOKE_VS, SMOKE_FS, {}, { blending: THREE.NormalBlending });
    this.fallMat = this.overlayMat(FALL_VS, FALL_FS);
    this.streamMat = this.overlayMat(FLOW_VS, FLOW_FS, { uSpeed: { value: 0.35 }, uFoam: { value: 0.25 } });
    this.rapidMat = this.overlayMat(FLOW_VS, FLOW_FS, { uSpeed: { value: 0.9 }, uFoam: { value: 1.0 } });
    this.lavaMat = this.lavaMaterial();
    this.light = new THREE.PointLight(0xff6a2a, 0, 0, 2); this.light.visible = false; gfx.scene.add(this.light);
    for (const isl of world.islands) {
      if (!isl.feat || !isl.feat.special || isl.def.backdrop) continue;
      addStructures(isl);
      const grp = { isl, scene: new THREE.Group(), over: new THREE.Group(), buckets: new Map() };
      this.cur = grp;
      this.build(isl);
      for (const [, b] of grp.buckets) if (b.items.length) grp.scene.add(this.instanced(b.geo, b.mat, b.items, b.shadow));
      gfx.scene.add(grp.scene); gfx.overlay.add(grp.over); this.groups.push(grp);
    }
    this.cur = null;
  }
  // ---------------------------------------------------------------- materials
  mat(key, o = {}) {
    let m = this.mats[key]; if (m) return m;
    m = this.mats[key] = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0 }, o));
    prep(m); if (!o.transparent) this.gfx.shadowed(m);
    return m;
  }
  overlayMat(vs, fs, extra = {}, o = {}) {
    const m = new THREE.ShaderMaterial(Object.assign({ uniforms: Object.assign({}, this.ou, extra), vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }, o));
    return prep(m);
  }
  lavaMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: 0x140a06, roughness: 0.92, metalness: 0, emissive: 0xff5418, emissiveIntensity: 1 });
    const patch = sh => {
      sh.vertexShader = 'varying vec2 vLv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vLv = uv;');
      sh.fragmentShader = `uniform float uTime; uniform float uNight; varying vec2 vLv;
float lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(lh(i), lh(i+vec2(1,0)), f.x), mix(lh(i+vec2(0,1)), lh(i+vec2(1,1)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float flow = vLv.x * 0.06 - uTime * 0.18;
  float h1 = ln(vec2(flow, vLv.y * 3.0)), h2 = ln(vec2(flow * 4.0, vLv.y * 10.0 + 5.0)), h3 = ln(vec2(flow * 13.0, vLv.y * 30.0));
  float plates = h1 * 0.55 + h2 * 0.3 + h3 * 0.15, crack = 1.0 - smoothstep(0.08, 0.2, abs(plates - 0.5));
  float edge = smoothstep(0.0, 0.3, vLv.y) * smoothstep(1.0, 0.7, vLv.y), hot = clamp(crack * 0.85 + (1.0 - edge) * 0.0 + smoothstep(0.62, 0.9, h2) * 0.5, 0.0, 1.0);
  diffuseColor.rgb = mix(vec3(0.05, 0.035, 0.03), vec3(0.5, 0.12, 0.03), hot);
  totalEmissiveRadiance = vec3(1.0, 0.33, 0.07) * (0.08 + 2.6 * hot * (0.5 + 0.5 * edge)) * (0.7 + 1.3 * uNight);`);
    };
    patch.key = 'lava'; prep(m, patch); this.gfx.shadowed(m);
    return m;
  }
  // ---------------------------------------------------------------- instancing
  // add one instance of geometry g with material m: p position, r rotation (Euler XYZ, or a number = yaw), s scale, c colour
  add(gk, mk, p, s, r = 0, c, shadow = true) {
    const key = gk + '|' + (typeof mk === 'string' ? mk : mk.uuid); let b = this.cur.buckets.get(key);
    if (!b) { b = { geo: G[gk], mat: typeof mk === 'string' ? this.mat(mk, MATS[mk]) : mk, items: [], shadow }; this.cur.buckets.set(key, b); }
    b.items.push({ p, s, r, c });
  }
  instanced(geo, mat, items, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((o, i) => {
      _p.set(o.p[0], o.p[1], o.p[2]); if (typeof o.r === 'number') _e.set(0, o.r, 0); else _e.set(o.r[0], o.r[1], o.r[2], o.r[3] || 'XYZ'); _q.setFromEuler(_e);
      _s.set(o.s[0], o.s[1], o.s[2]); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m);
      if (o.c != null) { _c.set(o.c); im.setColorAt(i, _c); }
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); return im;
  }
  // a box from a to b (world points [x,y,z]), t thick and h high (a beam, a rail, a cable, a wall)
  beam(gk, mk, a, b, t, h, c) { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); if (L < 0.01) return; this.add(gk, mk, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [t, h, L], [-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ'], c); }
  post(mk, x, y, z, r, h, c) { this.add('cyl', mk, [x, y + h / 2, z], [r, h, r], 0, c); }

  // ---------------------------------------------------------------- one island
  build(isl) {
    const sp = isl.feat.special, ox = isl.ox, oz = isl.oz, T = (x, z) => isl.terrain(x + ox, z + oz), H = (x, z) => this.world.height(x + ox, z + oz);
    const W = (x, y, z) => [x + ox, y, z + oz], R = mulberry32(isl.seed * 3 + 1);
    this.isl = isl;
    // lava rivers and the lava lake; the light follows the camera along them
    for (const l of sp.lava || []) { const pts = []; for (let i = 0; i < l.p.length; i += 4) pts.push([l.p[i] + ox, l.p[i + 2] + 0.15, l.p[i + 1] + oz, l.p[i + 3] + 1]); const m = new THREE.Mesh(ribbon(pts), this.lavaMat); m.receiveShadow = true; this.cur.scene.add(m); for (const p of pts) this.lavaPts.push(p); }
    for (const c of sp.lavaPools || []) { const g = new THREE.CircleGeometry(c.r + 2, 48); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * c.r * 2, uv.getY(i)); const m = new THREE.Mesh(g, this.lavaMat); m.position.set(c.x + ox, c.y + 0.1, c.z + oz); this.cur.scene.add(m); this.lavaPts.push([c.x + ox, c.y, c.z + oz, c.r]); }
    // smoke and steam from the vents, spray at the foot of the waterfalls, smoke over the camp fires
    const em = []; for (const v of sp.vents || []) em.push([v.x, v.y, v.z, v.kind === 'steam' ? 1 : 0, v.s]);
    for (const f of sp.falls || []) if (f.kind === 'fall') em.push([f.x1, f.y1, f.z1, 2, Math.max(8, f.w * 0.6)]);
    for (const c of sp.camp || []) em.push([c.fire.x, H(c.fire.x, c.fire.z), c.fire.z, 0, 3]);
    if (em.length) this.particles(em, ox, oz, R);
    // waterfalls (a curved sheet from the lip to the foot) and rapids (a strip of white water where a river steps down)
    for (const f of sp.falls || []) {
      if (f.kind === 'rapid') { const L = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) || 1, ux = (f.x1 - f.x0) / L, uz = (f.z1 - f.z0) / L, pts = [];
        for (let s = -6; s <= 8; s += 2) pts.push([f.x0 + ux * (s + 3) + ox, Math.max(f.y1, Math.min(f.y0, f.y0 - (f.y0 - f.y1) * (s + 6) / 14)) + 0.06, f.z0 + uz * (s + 3) + oz, f.w / 2 + 1]);
        this.cur.over.add(Object.assign(new THREE.Mesh(ribbon(pts), this.rapidMat), { renderOrder: 7 })); continue; }
      this.cur.over.add(Object.assign(new THREE.Mesh(this.fallSheet(f, ox, oz), this.fallMat), { renderOrder: 7, frustumCulled: true }));
    }
    for (const s of sp.streams || []) { const pts = []; for (let i = 0; i < s.p.length; i += 3) pts.push([s.p[i] + ox, s.p[i + 2] + 0.02, s.p[i + 1] + oz, s.w / 2 + 0.6]); if (pts.length > 1) this.cur.over.add(Object.assign(new THREE.Mesh(ribbon(pts), this.streamMat), { renderOrder: 6 })); }
    // frozen lakes: a sheet of ice to drive on
    for (const e of sp.ice || []) { const sh = new THREE.Shape(); for (let i = 0; i < e.p.length; i += 2) { const x = e.p[i] + ox, z = e.p[i + 1] + oz; if (i) sh.lineTo(x, -z); else sh.moveTo(x, -z); } const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, this.mat('ice', MATS.ice)); m.position.y = e.y + 0.04; m.receiveShadow = true; this.cur.scene.add(m); }
    this.bridges(isl, ox, oz, T);
    for (const q of sp.quays || []) this.quay(q, ox, oz, T, R);
    for (const s of sp.signs || []) this.sign(s, W(s.x, H(s.x, s.z), s.z));
    for (const s of sp.squares || []) this.square(s, ox, oz, H, R);
    if (sp.lift) this.lift(sp.lift, ox, oz, H);
    for (const p of sp.pistes || []) this.piste(p, ox, oz, H);
    if (sp.runway) this.runway(sp.runway, ox, oz);
    if (sp.airport) this.airport(sp.airport, ox, oz, H);
    if (sp.garage) this.garage(sp.garage, ox, oz);
    if (sp.stadium) this.stadium(sp.stadium, ox, oz);
    if (sp.temple) this.temple(sp.temple, sp.walls || [], ox, oz, H, R);
    for (const t of sp.tents || []) { this.add('tent', 'canvas', W(t.x, t.y - 0.05, t.z), [t.w, 2.6, t.l], t.h, ['#c9b48a', '#b9a477', '#d4c39a', '#8a8a5a'][Math.floor(R() * 4)]); }
    for (const c of sp.camp || []) this.camp(c, ox, oz, H);
    for (const p of sp.props || []) this.prop(p, ox, oz, H, R);
  }
  particles(em, ox, oz, R) {
    let n = 0; const cnt = e => Math.round(e[3] === 0 ? Math.min(160, 14 + e[4] * 1.4) : e[3] === 1 ? 26 : 40); for (const e of em) n += cnt(e);
    const P = new Float32Array(n * 3), S = new Float32Array(n * 4), E = new Float32Array(n * 4); let k = 0;
    for (const e of em) for (let i = 0, c = cnt(e); i < c; i++, k++) {
      const r = e[4] * (e[3] === 2 ? 0.5 : 0.12) * Math.sqrt(R()), a = R() * 6.283;
      P.set([e[0] + ox + Math.cos(a) * r, e[1] + 0.5, e[2] + oz + Math.sin(a) * r], k * 3); S.set([R(), R() * 6.283, R(), 0.6 + R() * 0.8], k * 4);
      E.set(e[3] === 0 ? [e[4] * 4.5, e[4] * 0.35, 9 + e[4] * 0.12, 0] : e[3] === 1 ? [e[4] * 2.2, e[4] * 0.5, 5, 1] : [e[4] * 0.9, e[4] * 0.45, 3.5, 2], k * 4);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(S, 4)); g.setAttribute('aEm', new THREE.BufferAttribute(E, 4));
    g.computeBoundingSphere(); g.boundingSphere.radius += 600;
    const pts = new THREE.Points(g, this.smokeMat); pts.renderOrder = 8; this.cur.over.add(pts);
  }
  fallSheet(f, ox, oz) {
    const n = 16, L = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) || 1, ux = (f.x1 - f.x0) / L, uz = (f.z1 - f.z0) / L, w = f.w / 2, P = [], UV = [], I = [];
    for (let i = 0; i <= n; i++) { const t = i / n, x = f.x0 + (f.x1 - f.x0) * Math.sqrt(t), z = f.z0 + (f.z1 - f.z0) * Math.sqrt(t), y = f.y0 - (f.y0 - f.y1) * t, ww = w * (1 + 0.25 * t);
      P.push(x - uz * ww + ox, y, z + ux * ww + oz, x + uz * ww + ox, y, z - ux * ww + oz); UV.push(0, t, 1, t); if (i) { const q = (i - 1) * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I); g.computeBoundingSphere(); return g;
  }
  // railings and piers under every bridge of the island's roads
  bridges(isl, ox, oz, T) {
    for (const r of isl.roads.roads) {
      if (!r.b) continue; const p = r.p, set = new Set(r.b), concrete = r.s === 0;
      for (let i = 0; i + 1 < p.length / 3; i++) {
        if (!set.has(i) || !set.has(i + 1)) continue;
        const ax = p[i * 3] + ox, az = p[i * 3 + 1] + oz, ay = p[i * 3 + 2], bx = p[i * 3 + 3] + ox, bz = p[i * 3 + 4] + oz, by = p[i * 3 + 5], L = Math.hypot(bx - ax, bz - az) || 1, w = r.w / 2 + 0.2;
        const nx = (bz - az) / L * w, nz = -(bx - ax) / L * w;
        for (const s of [-1, 1]) {
          this.beam('box', concrete ? 'steel' : 'woodDark', [ax + nx * s, ay + 1.0, az + nz * s], [bx + nx * s, by + 1.0, bz + nz * s], 0.12, 0.12);
          this.add('box', concrete ? 'steel' : 'woodDark', [ax + nx * s, ay + 0.5, az + nz * s], [0.1, 1.05, 0.1]);
        }
        this.beam('box', concrete ? 'concrete' : 'woodDark', [ax, ay - 0.45, az], [bx, by - 0.45, bz], r.w + 0.3, 0.6);
        if (i % 5 === 0) { const g = T(ax - ox, az - oz) - 2, h = ay - 0.6 - g; if (h > 0.5) for (const s of [-0.6, 0.6]) this.post(concrete ? 'concrete' : 'woodDark', ax + nx * s, g, az + nz * s, concrete ? 0.45 : 0.22, h); }
      }
    }
  }
  quay(q, ox, oz, T, R) {
    const ang = Math.atan2(q.x1 - q.x0, q.z1 - q.z0), len = Math.hypot(q.x1 - q.x0, q.z1 - q.z0), ux = Math.sin(ang), uz = Math.cos(ang), vx = uz, vz = -ux, ferry = q.kind === 'ferry';
    const mx = (q.x0 + q.x1) / 2 + ox, mz = (q.z0 + q.z1) / 2 + oz;
    this.add('box', ferry ? 'concrete' : 'wood', [mx, q.y - (ferry ? 0.6 : 0.15), mz], [q.w, ferry ? 1.2 : 0.3, len], ang);
    for (let s = 2; s < len; s += ferry ? 6 : 3) for (const sd of [-1, 1]) { const x = q.x0 + ux * s + vx * sd * (q.w / 2 - 0.4), z = q.z0 + uz * s + vz * sd * (q.w / 2 - 0.4), g = Math.min(T(x, z), 0) - 1; this.post(ferry ? 'concrete' : 'woodDark', x + ox, g, z + oz, ferry ? 0.5 : 0.16, q.y - g - 0.2); }
    for (let s = 6; s < len; s += 8) for (const sd of [-1, 1]) { const x = q.x0 + ux * s + vx * sd * (q.w / 2 + 0.05), z = q.z0 + uz * s + vz * sd * (q.w / 2 + 0.05); this.post(ferry ? 'black' : 'woodDark', x + ox, q.y, z + oz, ferry ? 0.25 : 0.1, ferry ? 0.35 : 1.0); }
    if (ferry) { // the kerbs and the steel ramp at the end where the ferry lies, a lamp post
      for (const sd of [-1, 1]) this.beam('box', 'yellow', [q.x0 + ux * 6 + vx * sd * (q.w / 2) + ox, q.y + 0.15, q.z0 + uz * 6 + vz * sd * (q.w / 2) + oz], [q.x1 + vx * sd * (q.w / 2) + ox, q.y + 0.15, q.z1 + vz * sd * (q.w / 2) + oz], 0.35, 0.3);
      this.add('box', 'steel', [q.x1 - ux * 4 + ox, q.y + 0.05, q.z1 - uz * 4 + oz], [q.w - 0.6, 0.12, 8], ang);
      this.lamp(q.x0 + ux * 10 + vx * (q.w / 2 + 0.4) + ox, q.y, q.z0 + uz * 10 + vz * (q.w / 2 + 0.4) + oz, 8);
    } else { // the marina: boats moored along the pier
      for (let i = 0; i < (q.boats || 4); i++) { const s = 12 + i * (len - 18) / Math.max(1, (q.boats || 4) - 1), sd = i % 2 ? 1 : -1, x = q.x0 + ux * s + vx * sd * (q.w / 2 + 2.2), z = q.z0 + uz * s + vz * sd * (q.w / 2 + 2.2), L = 6 + R() * 4;
        this.add('hull', 'boat', [x + ox, -0.25, z + oz], [2.2 + L * 0.08, 1.4, L], ang + (R() - 0.5) * 0.08, ['#f2f2ee', '#c8463a', '#2f5f8a', '#e9dcb9', '#3a3a3a'][Math.floor(R() * 5)]);
        this.add('box', 'white', [x + ox, 0.9, z - uz * L * 0.1 + oz], [1.6, 0.9, L * 0.35], ang); }
    }
  }
  sign(s, at) {
    const w = s.w || 2.6, m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2.2), prep(new THREE.MeshStandardMaterial({ map: signTexture(s.text, s.sub, 2.2), roughness: 0.6, side: THREE.DoubleSide })));
    this.gfx.shadowed(m.material); m.castShadow = true;
    m.position.set(at[0], at[1] + 1.4 + w / 4.4, at[2]); m.rotation.y = s.h; this.cur.scene.add(m);
    const cx = Math.cos(s.h), cz = -Math.sin(s.h);
    for (const sd of [-1, 1]) this.post('steel', at[0] + cx * (w / 2 - 0.15) * sd, at[1] - 0.3, at[2] + cz * (w / 2 - 0.15) * sd, 0.05, 1.7 + w / 2.2);
  }
  lamp(x, y, z, h) { this.post('steel', x, y, z, 0.08, h); this.add('box', 'lampHead', [x, y + h, z], [0.5, 0.18, 0.3]); }
  square(s, ox, oz, H, R) {
    const r = s.r || Math.min(s.w, s.l) / 2;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3, x = s.x + Math.cos(a) * r * 0.92, z = s.z + Math.sin(a) * r * 0.92; this.lamp(x + ox, H(x, z), z + oz, 4.5); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.7, x = s.x + Math.cos(a) * r * 0.6, z = s.z + Math.sin(a) * r * 0.6, y = H(x, z); this.add('box', 'wood', [x + ox, y + 0.45, z + oz], [1.8, 0.08, 0.5], a); for (const sd of [-0.75, 0.75]) this.add('box', 'black', [x + Math.cos(a) * sd + ox, y + 0.22, z - Math.sin(a) * sd + oz], [0.08, 0.45, 0.45], a); }
    if (s.kind === 'torg') { const y = H(s.x, s.z); this.post('stone', s.x + ox, y, s.z + oz, 3.5, 0.6); this.post('stone', s.x + ox, y, s.z + oz, 0.4, 2.4); this.post('stone', s.x + ox, y + 2.4, s.z + oz, 1.4, 0.2); }
    else { const y = H(s.x, s.z); this.post('white', s.x + ox, y, s.z + oz, 0.08, 9); this.add('box', 'flag', [s.x + 0.9 + ox, y + 8.3, s.z + oz], [1.6, 1.0, 0.03]); }
  }
  // the chairlift: towers with cross arms, the two cables, the stations with the bullwheel under a roof, and the chairs (moved in update)
  lift(L, ox, oz, H) {
    const a = [L.bottom.x + ox, L.bottom.y + L.station, L.bottom.z + oz], b = [L.top.x + ox, L.top.y + L.station, L.top.z + oz];
    const ang = Math.atan2(b[0] - a[0], b[2] - a[2]), vx = Math.cos(ang), vz = -Math.sin(ang), sup = [a, ...L.towers.map(t => [t.x + ox, t.y + t.h, t.z + oz]), b];
    for (const t of L.towers) {
      const x = t.x + ox, z = t.z + oz; this.post('liftSteel', x, t.y - 0.5, z, 0.35, t.h + 0.5);
      this.add('box', 'liftSteel', [x, t.y + t.h + 0.2, z], [L.off * 2 + 1.2, 0.35, 0.45], ang);
      for (const s of [-1, 1]) this.add('box', 'black', [x + vx * L.off * s, t.y + t.h - 0.05, z + vz * L.off * s], [0.25, 0.3, 2.2], ang);
    }
    for (const st of [a, b]) { const y = st[1]; this.add('cyl', 'red', [st[0], y, st[2]], [L.off + 0.4, 0.4, L.off + 0.4]); this.add('box', 'roofDark', [st[0], y + 2.2, st[2]], [L.off * 2 + 4, 0.35, 9], ang);
      for (const s of [-1, 1]) for (const f of [-1, 1]) this.post('liftSteel', st[0] + vx * (L.off + 1.6) * s + Math.sin(ang) * 3.5 * f, y - L.station, st[2] + vz * (L.off + 1.6) * s + Math.cos(ang) * 3.5 * f, 0.25, L.station + 2.2); }
    // the loop the chairs ride: up on one side, round the top bullwheel, down on the other
    const up = sup.map(p => [p[0] + vx * L.off, p[1], p[2] + vz * L.off]), dn = sup.map(p => [p[0] - vx * L.off, p[1], p[2] - vz * L.off]).reverse();
    for (const line of [up, dn]) for (let i = 0; i + 1 < line.length; i++) this.beam('box', 'black', line[i], line[i + 1], 0.05, 0.05);
    const loop = [...up, ...dn], seg = []; let tot = 0; for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length], l = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); seg.push([p, q, tot, l]); tot += l; }
    const n = Math.floor(tot / 22), im = new THREE.InstancedMesh(G.chair, this.mat('chair', MATS.chair), n); im.castShadow = true; im.frustumCulled = false;
    this.cur.scene.add(im); this.chairs.push({ im, seg, tot, n, speed: 2.4 });
  }
  piste(p, ox, oz, H) {
    const col = { green: '#2e9a3a', blue: '#2f6fd6', red: '#d9432f', black: '#1d1c1a' }[p.color] || '#2f6fd6', L = [];
    for (let i = 0; i < p.p.length; i += 3) L.push([p.p[i], p.p[i + 1]]);
    let acc = 0;
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); acc += l; if (acc < 30) continue; acc = 0;
      const nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;
      for (const s of [-1, 1]) { const x = b[0] + nx * s * (p.hw + 1), z = b[1] + nz * s * (p.hw + 1), y = H(x, z); this.post('pole', x + ox, y - 0.1, z + oz, 0.03, 1.6, col); this.add('box', 'paint', [x + ox, y + 1.45, z + oz], [0.1, 0.3, 0.1], 0, '#f2c230'); }
    }
    (p.gates || []).forEach((g, i, A) => {
      const fin = i === A.length - 1, j = Math.min(L.length - 2, L.findIndex(q => Math.hypot(q[0] - g[0], q[1] - g[1]) < 25) + 1 || 1), a = L[Math.max(0, j - 1)], b = L[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l;
      const w = fin ? p.hw : p.kind === 'slalom' ? 5 : Math.min(14, p.hw * 0.7), gc = p.kind === 'slalom' ? (i % 2 ? '#2f6fd6' : '#d9432f') : col;
      for (const s of [-1, 1]) { const x = g[0] + nx * s * w, z = g[1] + nz * s * w, y = H(x, z); this.post('pole', x + ox, y - 0.1, z + oz, 0.05, fin ? 4 : 2.0, gc); }
      if (fin || p.kind !== 'slalom') { const y = H(g[0], g[1]); this.beam('box', 'paint', [g[0] - nx * w + ox, y + (fin ? 3.8 : 1.9), g[1] - nz * w + oz], [g[0] + nx * w + ox, y + (fin ? 3.8 : 1.9), g[1] + nz * w + oz], 0.05, fin ? 0.9 : 0.4, fin ? '#d9432f' : gc); }
    });
    const s0 = L[0], y0 = H(s0[0], s0[1]); this.add('box', 'red', [s0[0] + 6 + ox, y0 + 1.3, s0[1] + oz], [3, 2.6, 2.4]); this.add('box', 'white', [s0[0] + 6 + ox, y0 + 2.75, s0[1] + oz], [3.4, 0.3, 2.8]);
  }
  runway(r, ox, oz) {
    const ang = Math.atan2(r.x1 - r.x0, r.z1 - r.z0), L = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ux = Math.sin(ang), uz = Math.cos(ang), vx = uz, vz = -ux, y = r.y + 0.09, P = (s, t) => [r.x0 + ux * s + vx * t + ox, y, r.z0 + uz * s + vz * t + oz];
    for (let s = 80; s < L - 80; s += 50) this.add('box', 'marking', P(s + 15, 0), [0.9, 0.02, 30], ang, null, false);
    for (const [s0, dir] of [[8, 1], [L - 8, -1]]) { for (let k = -7; k <= 7; k++) if (k) this.add('box', 'marking', P(s0 + dir * 22, k * 1.8), [1.0, 0.02, 30], ang, null, false);
      for (const t of [-1, 1]) for (let d = 160; d < 400; d += 75) this.add('box', 'marking', P(s0 + dir * d, t * 6), [3, 0.02, 22], ang, null, false); }
    for (let s = 0; s <= L; s += 60) for (const t of [-1, 1]) this.add('box', s < 1 || s > L - 1 ? 'lightGreen' : 'lightWhite', P(s, t * (r.w / 2 + 1)), [0.25, 0.3, 0.25], 0, null, false);
    for (let d = 30; d <= 300; d += 30) this.add('box', 'lightWhite', [r.x0 - ux * d + ox, r.y + 0.5, r.z0 - uz * d + oz], [8, 0.3, 0.4], ang, null, false);
    // the runway numbers, painted at both ends
    (r.n || []).forEach((num, i) => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.font = '700 200px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 64, 128);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 18), prep(new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, roughness: 0.7 })));
      const s = i ? L - 75 : 75, p = P(s, 0); m.position.set(p[0], y + 0.01, p[2]); m.rotation.set(-Math.PI / 2, i ? ang : ang + Math.PI, 0, 'YXZ'); this.cur.scene.add(m); });
  }
  airport(a, ox, oz, H) {
    const t = a.tower, x = t.x + ox, z = t.z + oz; this.add('box', 'glass', [x, t.y + t.h + 1.6, z], [7, 3.2, 7], Math.PI / 4); this.add('box', 'roofDark', [x, t.y + t.h + 3.4, z], [8.2, 0.4, 8.2], Math.PI / 4); this.post('steel', x, t.y + t.h + 3.6, z, 0.06, 4);
    const s = a.sock; this.post('white', s.x + ox, s.y, s.z + oz, 0.07, 6); this.add('cone', 'sock', [s.x + ox + 1.8, s.y + 5.8, s.z + oz], [0.5, 3.6, 0.5], [0, 0, Math.PI / 2]);
  }
  garage(g, ox, oz) {
    const x = g.x + ox, z = g.z + oz, lh = (g.y1 - g.y0) / g.levels;
    for (let i = 1; i <= g.levels; i++) { const y = g.y0 + lh * i; this.add('cyl', 'concrete', [x, y - 0.25, z], [g.r, 0.5, g.r]); this.add('cyl', 'concreteLight', [x, y - 0.9 + (i === g.levels ? 1.4 : 0), z], [g.r + 0.15, 1.0, g.r + 0.15]); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; this.post('concrete', x + Math.cos(a) * (g.r - 1), g.y0 - 0.5, z + Math.sin(a) * (g.r - 1), 0.4, g.y1 - g.y0 + 0.5); }
    this.add('cyl', 'concrete', [x, (g.y0 + g.y1) / 2, z], [5, g.y1 - g.y0, 5]);
    for (let i = -3; i <= 3; i++) this.add('box', 'marking', [x + i * 3, g.y1 + 0.02, z - 6], [0.12, 0.02, 5], 0, null, false), this.add('box', 'marking', [x + i * 3, g.y1 + 0.02, z + 6], [0.12, 0.02, 5], 0, null, false);
  }
  stadium(s, ox, oz) {
    const x = s.x + ox, z = s.z + oz, y = s.y + 0.06, [L, B] = s.pitch, line = (a, b) => this.beam('box', 'marking', [a[0] + x, y, a[1] + z], [b[0] + x, y, b[1] + z], 0.12, 0.02);
    line([-L / 2, -B / 2], [L / 2, -B / 2]); line([-L / 2, B / 2], [L / 2, B / 2]); line([-L / 2, -B / 2], [-L / 2, B / 2]); line([L / 2, -B / 2], [L / 2, B / 2]); line([0, -B / 2], [0, B / 2]);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = (i + 1) / 24 * Math.PI * 2; line([Math.cos(a) * 9.15, Math.sin(a) * 9.15], [Math.cos(b) * 9.15, Math.sin(b) * 9.15]); }
    for (const sd of [-1, 1]) { const gx = x + sd * L / 2; for (const t of [-3.66, 3.66]) this.post('white', gx, s.y, z + t, 0.06, 2.44); this.add('box', 'white', [gx, s.y + 2.44, z], [0.1, 0.1, 7.4]); }
    for (const [dx, dz] of [[-80, -58], [80, -58], [-80, 58], [80, 58]]) { this.post('steel', x + dx, s.y, z + dz, 0.4, 32); this.add('box', 'lampHead', [x + dx * 0.98, s.y + 32, z + dz * 0.98], [5, 2.5, 0.6], Math.atan2(dx, dz)); }
  }
  temple(t, walls, ox, oz, H, R) {
    const top = t.tiers[t.tiers.length - 1], y = t.y + top[1], x = t.x + ox, z = t.z + oz;
    for (const w of walls) { const ux = Math.sin(w.ang), uz = Math.cos(w.ang); this.beam('box', 'temple', [w.x - ux * w.l / 2 + ox, w.y + w.h / 2, w.z - uz * w.l / 2 + oz], [w.x + ux * w.l / 2 + ox, w.y + w.h / 2, w.z + uz * w.l / 2 + oz], w.w, w.h); }
    this.add('box', 'temple', [x, y + 2.6, z - 4], [11, 5.2, 8]); this.add('box', 'templeDark', [x, y + 1.3, z], [2.4, 2.6, 0.3]);
    for (let i = 0; i < 3; i++) this.add('box', 'temple', [x, y + 5.4 + i * 0.6, z - 4], [10 - i * 2.4, 0.6, 7 - i * 1.6]);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const px = t.x + a * (t.tiers[0][0] + 6), pz = t.z + b * (t.tiers[0][0] + 6), py = H(px, pz); this.post('temple', px + ox, py - 0.2, pz + oz, 0.9, 3 + R() * 3); }
    for (let i = 0; i < 4; i++) { const a = R() * 6.28, d = t.tiers[0][0] + 10 + R() * 12, px = t.x + Math.cos(a) * d, pz = t.z + Math.sin(a) * d, py = H(px, pz); this.add('cyl', 'temple', [px + ox, py + 0.7, pz + oz], [0.8, 5, 0.8], [0, R() * 3, Math.PI / 2]); }
  }
  camp(c, ox, oz, H) {
    const t = c.tower, x = t.x + ox, z = t.z + oz;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.post('woodDark', x + a * 1.3, t.y - 0.2, z + b * 1.3, 0.12, t.h + 0.2);
    this.add('box', 'wood', [x, t.y + t.h, z], [3.4, 0.2, 3.4]); this.add('box', 'canvas', [x, t.y + t.h + 2.3, z], [3.8, 0.2, 3.8], 0, '#b9a477');
    for (const s of [-1, 1]) { this.add('box', 'wood', [x + s * 1.65, t.y + t.h + 0.55, z], [0.1, 0.9, 3.4]); this.add('box', 'wood', [x, t.y + t.h + 0.55, z + s * 1.65], [3.4, 0.9, 0.1]); }
    const f = c.fire, y = H(f.x, f.z); this.add('cyl', 'stone', [f.x + ox, y + 0.1, f.z + oz], [1.0, 0.25, 1.0]); this.add('cone', 'fire', [f.x + ox, y + 0.5, f.z + oz], [0.5, 0.8, 0.5]);
  }
  prop(p, ox, oz, H, R) {
    const x = p.x + ox, z = p.z + oz;
    if (p.kind === 'container') for (let k = 0; k < (p.s || 1); k++) this.add('box', 'paint', [x, p.y + 1.3 + k * 2.6, z], [6.1, 2.6, 2.44], (p.a || 0) + Math.PI / 2, ['#b5432f', '#2f5f8a', '#3f7a3a', '#c98a2a'][(p.c + k) % 4]);
    else if (p.kind === 'crane') { this.add('box', 'yellow', [x, p.y + 20, z], [1.6, 40, 1.6]); this.add('box', 'yellow', [x + 14, p.y + 40.5, z], [42, 1.2, 1.2], p.a || 0); this.add('box', 'concrete', [x - 8, p.y + 40, z], [4, 2.5, 2.5], p.a || 0); this.add('box', 'glass', [x + 1, p.y + 38, z], [2, 2, 2]); }
    else if (p.kind === 'skatepark') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + (p.a || 0), r = 22; this.add('box', 'concreteLight', [x + Math.cos(a) * r, p.y + 0.6, z + Math.sin(a) * r], [8, 1.6, 4], [0.35, -a + Math.PI / 2, 0, 'YXZ']); } this.add('box', 'concreteLight', [x, p.y + 0.4, z], [10, 0.8, 6], 0.5); }
  }

  // ---------------------------------------------------------------- every frame
  update(dt, cam) {
    const g = this.gfx, c = g.camera;
    this.ou.tDepth.value = g.rtScene.depthTexture; this.ou.uNear.value = c.near; this.ou.uFar.value = c.far; this.ou.fogDensity.value = g.scene.fog.density;
    this.ou.uRes.value.set(g.size.W, g.size.H); this.ou.uPx.value = g.size.H / (2 * Math.tan(c.fov * Math.PI / 360));
    // islands far away are hidden
    for (const gr of this.groups) { const i = gr.isl, dx = Math.max(i.x0 - cam.x, 0, cam.x - i.x1), dz = Math.max(i.z0 - cam.z, 0, cam.z - i.z1), vis = Math.hypot(dx, dz) < 9000; gr.scene.visible = vis; gr.over.visible = vis; }
    // the chairs ride round their loop
    this.t += dt;
    for (const L of this.chairs) {
      if (!L.im.parent.visible) continue;
      for (let i = 0; i < L.n; i++) {
        let s = (i / L.n * L.tot + this.t * L.speed) % L.tot, k = 0; while (k < L.seg.length - 1 && s > L.seg[k][2] + L.seg[k][3]) k++;
        const [a, b, s0, l] = L.seg[k], u = Math.min(1, (s - s0) / (l || 1));
        _p.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u); _e.set(0, Math.atan2(b[0] - a[0], b[2] - a[2]), 0); _q.setFromEuler(_e); _s.set(1, 1, 1);
        _m.compose(_p, _q, _s); L.im.setMatrixAt(i, _m);
      }
      L.im.instanceMatrix.needsUpdate = true;
    }
    // the glow of the lava lights up the ground near the camera
    let best = null, bd = 700 * 700;
    for (let i = 0; i < this.lavaPts.length; i += 3) { const p = this.lavaPts[i], d = (p[0] - cam.x) ** 2 + (p[2] - cam.z) ** 2; if (d < bd) { bd = d; best = p; } }
    if (best) { this.light.visible = true; this.light.position.set(best[0], best[1] + 6, best[2]); this.light.intensity = 2500 * (0.4 + 0.6 * U.uNight.value); } else this.light.visible = false;
  }
}
// the colours and surfaces of the things above
const MATS = {
  concrete: { color: 0x8f8c86, roughness: 0.9 }, concreteLight: { color: 0xb5b1a8, roughness: 0.85 }, wood: { color: 0x8a6a46, roughness: 0.85 }, woodDark: { color: 0x4a3a2a, roughness: 0.9 },
  steel: { color: 0x7a8088, roughness: 0.45, metalness: 0.6 }, liftSteel: { color: 0x9aa0a6, roughness: 0.4, metalness: 0.7 }, black: { color: 0x1d1c1a, roughness: 0.6 },
  yellow: { color: 0xe5b52b, roughness: 0.6 }, red: { color: 0xb5432f, roughness: 0.7 }, white: { color: 0xf2f2ee, roughness: 0.6 }, roofDark: { color: 0x2f3236, roughness: 0.7 },
  stone: { color: 0x9a968c, roughness: 0.95 }, temple: { color: 0x8d8a77, roughness: 0.95 }, templeDark: { color: 0x14120e, roughness: 1 }, canvas: { color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide },
  paint: { color: 0xffffff, roughness: 0.6 }, pole: { color: 0xffffff, roughness: 0.5 }, boat: { color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide }, flag: { color: 0xc8243a, roughness: 0.8, side: THREE.DoubleSide },
  glass: { color: 0x1a262d, roughness: 0.08, metalness: 0.3 }, marking: { color: 0xf2f2ee, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 },
  lampHead: { color: 0x222222, emissive: 0xffe2a8, emissiveIntensity: 0.6 }, lightWhite: { color: 0xffffff, emissive: 0xfff1c8, emissiveIntensity: 2 }, lightGreen: { color: 0x2a8a3a, emissive: 0x30ff60, emissiveIntensity: 2 },
  sock: { color: 0xf26b1d, roughness: 0.7, side: THREE.DoubleSide }, fire: { color: 0x401808, emissive: 0xff7a2a, emissiveIntensity: 3 }, chair: { color: 0x3a3f44, roughness: 0.5, metalness: 0.4 },
  ice: { color: 0xd8e8f0, roughness: 0.12, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 },
};
