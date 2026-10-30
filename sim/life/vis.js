// Drawing the animals: one InstancedMesh per species and level of detail (the near one casts shadows), so a few hundred animals
// are a handful of draw calls. The bodies come from rig.js; the vertex shader below moves their parts from four numbers per
// animal and part (legs in the gait's phase, head, tail, wings), the fragment shader paints stripes, patches and spots and lets
// the eyes shine in the dark. Each animal's place and pose come from life.js.
import * as THREE from 'three';
import { prep } from '../render/gfx.js';
import { build, TINTS } from './rig.js';
import { RINGS } from './species.js';

const VDECL = `attribute vec4 aRig; attribute vec3 aPivA; attribute vec3 aPivB; attribute vec3 aFlag;
attribute vec4 aAnim; attribute vec4 aPose; attribute vec4 aWing; attribute vec4 aTint;
uniform vec2 uWave; uniform vec4 uNod; varying vec3 vLoc; varying vec3 vFlag; varying vec4 vTint;
vec3 rX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 rZ(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
// when each leg (left front, right front, left hind, right hind) swings, as a share of the stride: walk, trot, gallop, bound, pace, pronk
vec4 gaitRow(float i){ return i < 0.5 ? vec4(0.25, 0.75, 0.0, 0.5) : i < 1.5 ? vec4(0.0, 0.5, 0.5, 0.0) : i < 2.5 ? vec4(0.5, 0.6, 0.0, 0.1) : i < 3.5 ? vec4(0.55, 0.6, 0.0, 0.05) : i < 4.5 ? vec4(0.0, 0.5, 0.05, 0.55) : vec4(0.0); }
void animalPose(inout vec3 p, inout vec3 n){
  float part = aRig.x, seg = aRig.y, sex = aRig.z; bool male = aTint.w >= 1.0;
  if ((sex > 0.5 && sex < 1.5 && !male) || (sex > 1.5 && male)) { p = aPivA; return; }          // antlers and manes on the males only
  if (part > 0.5 && part < 4.5) {
    float g = clamp(aAnim.z, 0.0, 5.0), gi = floor(g); vec4 o = mix(gaitRow(gi), gaitRow(min(gi + 1.0, 5.0)), g - gi);
    float off = part < 1.5 ? o.x : part < 2.5 ? o.y : part < 3.5 ? o.z : o.w, ph = aAnim.x + off * 6.2832, lie = aAnim.w;
    bool front = part < 2.5; float side = (part < 1.5 || (part > 2.5 && part < 3.5)) ? 1.0 : -1.0;
    float hip = aAnim.y * sin(ph), knee = aAnim.y * 1.25 * max(0.0, -cos(ph)) * (front ? 1.0 : -0.8);
    #if defined(BIRD)
      hip = mix(hip, 1.45, lie); knee = 0.0;
    #elif defined(FROG)
      hip = front ? 0.0 : -0.9 * (1.0 - lie); knee = 0.0;
    #elif defined(SIT)
      hip = mix(hip, front ? 0.55 : -1.35, lie); knee = mix(knee, front ? 0.0 : 2.6, lie);
    #elif defined(SPHINX)
      hip = mix(hip, front ? -1.35 : -1.2, lie); knee = mix(knee, front ? 0.1 : 2.6, lie);
    #else
      hip = mix(hip, front ? 0.3 : -0.95, lie); knee = mix(knee, front ? 2.6 : 2.4, lie);
    #endif
    #ifdef SPRAWL
      if (seg > 0.5) { float k = side * knee * 0.4; p = aPivB + rZ(p - aPivB, k); n = rZ(n, k); }
      p = aPivA + rY(p - aPivA, side * hip); n = rY(n, side * hip);
    #else
      if (seg > 0.5) { p = aPivB + rX(p - aPivB, knee); n = rX(n, knee); }
      p = aPivA + rX(p - aPivA, hip); n = rX(n, hip);
    #endif
  } else if (part > 4.5 && part < 5.5) {          // the neck (seg 0) bends at its base, the head (2) nods at its top, the jaw (1) opens
    if (seg > 0.5 && seg < 1.5) { p = aPivB + rX(p - aPivB, aPose.w); n = rX(n, aPose.w); }
    if (seg > 0.5) { float nd = aPose.x * uNod.w; p = uNod.xyz + rX(p - uNod.xyz, nd); n = rX(n, nd); }
    p = aPivA + rX(p - aPivA, aPose.x); n = rX(n, aPose.x);
    p = aPivA + rY(p - aPivA, aPose.y); n = rY(n, aPose.y);
  } else if (part > 5.5 && part < 6.5) {          // the tail swishes, most at the tip
    float a = aPose.z * (0.35 + 0.65 * seg); p = aPivA + rY(p - aPivA, a); n = rY(n, a);
  } else if (part > 6.5 && part < 8.5) {          // wings: beat (the hand half lags behind), or folded back along the body
    float sd = part < 7.5 ? 1.0 : -1.0, fold = aWing.z, k = 1.0 - 0.5 * fold;
    vec3 q = p - aPivA; q.x *= k; p = aPivA + q; vec3 b = aPivA + (aPivB - aPivA) * vec3(k, 1.0, 1.0);
    if (seg > 0.5) { float a2 = sd * (aWing.y * sin(aWing.x - 0.9) * 0.55 * (1.0 - fold) - 0.15 * fold); p = b + rZ(p - b, a2); n = rZ(n, a2); }
    float a1 = sd * ((aWing.y * sin(aWing.x) + 0.06) * (1.0 - fold) - 0.45 * fold); p = aPivA + rZ(p - aPivA, a1); n = rZ(n, a1);
    float a3 = sd * 1.42 * fold; p = aPivA + rY(p - aPivA, a3); n = rY(n, a3);
  } else if (part > 9.5) {                        // a winding body: a wave runs back along it
    p.x += uWave.y * aAnim.y * aRig.w * sin(p.z * uWave.x + aAnim.x);
  }
}
`;
const FDECL = `uniform float uNight; uniform vec3 uPatCol; uniform float uPatS; uniform vec4 uDim; varying vec3 vLoc; varying vec3 vFlag; varying vec4 vTint;
vec3 h33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = h33(i).x, b = h33(i + vec3(1, 0, 0)).x, c = h33(i + vec3(0, 1, 0)).x, d = h33(i + vec3(1, 1, 0)).x, e = h33(i + vec3(0, 0, 1)).x, g = h33(i + vec3(1, 0, 1)).x, h = h33(i + vec3(0, 1, 1)).x, k = h33(i + vec3(1, 1, 1)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z); }
vec2 worley(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec3 g = vec3(float(x), float(y), float(z)), o = h33(i + g) * 0.8 + 0.1; float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return vec2(d1, d2); }
float animalPattern(){
  vec3 q = vLoc * uPatS;
  #if PAT == 1
    // zebra: rings round the legs, upright bands on the body, across the neck
    float up = smoothstep(0.45, 0.62, vLoc.y / uDim.x), neck = smoothstep(uDim.z * 0.36, uDim.z * 0.5, vLoc.z) * up;
    float u = mix(vLoc.y * 42.0, vLoc.z * 22.0 + vLoc.y * 6.0, up); u = mix(u, vLoc.y * 24.0 - vLoc.z * 11.0, neck);
    u += sin(vLoc.y * 7.0 + vLoc.z * 3.0) * 1.2 + vn3(vLoc * 3.0) * 1.8;
    float fw = fwidth(u), s = sin(u), m = smoothstep(-0.2 - fw, 0.2 + fw, s);
    return mix(m, 0.5, smoothstep(0.8, 2.5, fw));
  #elif PAT == 2
    vec2 w = worley(q + vn3(q * 0.7) * 0.4); return smoothstep(0.05, 0.12, w.y - w.x);
  #elif PAT == 3
    vec2 w = worley(q); return 1.0 - smoothstep(0.2, 0.28, w.x);
  #elif PAT == 4
    vec2 w = worley(q); float ring = smoothstep(0.2, 0.26, w.x) * (1.0 - smoothstep(0.34, 0.42, w.x)); return max(ring, 1.0 - smoothstep(0.06, 0.1, w.x));
  #elif PAT == 5
    float n = vn3(vLoc * 2.4 + vTint.w * 17.0) * 0.65 + vn3(vLoc * 6.0 + vTint.w * 5.0) * 0.35; return smoothstep(0.46, 0.52, n);
  #else
    return 0.0;
  #endif
}
`;
// the material's shader with the animation (and, unless it is the shadow's depth pass, the colours)
function patcher(meta, depth) {
  const f = sh => {
    sh.uniforms.uWave = { value: new THREE.Vector2(meta.waveK || 0, (meta.L || 1) * 0.07) }; const nd = meta.nod || [0, 0, 0, 0]; sh.uniforms.uNod = { value: new THREE.Vector4(nd[0], nd[1], nd[2], nd[3]) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VDECL);
    if (depth) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ); vec3 animN = vec3( 0.0, 1.0, 0.0 ); animalPose( transformed, animN );');
    else {
      sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal ); vec3 animP = vec3( position ); animalPose( animP, objectNormal );\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
        .replace('#include <begin_vertex>', 'vec3 transformed = animP; vLoc = position; vFlag = aFlag; vTint = aTint;');
      sh.uniforms.uPatCol = { value: new THREE.Color(meta.patCol) }; sh.uniforms.uPatS = { value: meta.patS }; sh.uniforms.uDim = { value: new THREE.Vector4(meta.sh || 1, meta.cy || 0.5, meta.bl || 1, 0) };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FDECL)
        .replace('#include <color_fragment>', `#include <color_fragment>
  { vec3 cc = diffuseColor.rgb;
  #if PAT == 5
    cc = mix(cc, vTint.rgb, animalPattern() * vFlag.y);
  #else
    cc *= mix(vec3(1.0), vTint.rgb, vFlag.x);
    #if PAT > 0
      cc = mix(cc, uPatCol, animalPattern() * vFlag.y);
    #endif
  #endif
  diffuseColor.rgb = cc; }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(0.75, 0.9, 0.55) * vFlag.z * uNight * 2.5;');
    }
  };
  f.key = 'animal:' + JSON.stringify(meta.defs) + (depth ? ':d' : '') + ':' + (meta.waveK ? 1 : 0);
  return f;
}

const CAP = 128, _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(),
  _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sp = new THREE.Sphere(), _f = new THREE.Frustum(), _pm = new THREE.Matrix4(), _Y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

export class AnimalVis {
  constructor(gfx) { this.gfx = gfx; this.root = new THREE.Group(); this.root.name = 'dyr'; gfx.scene.add(this.root); this.kinds = new Map(); this.drawn = 0; }
  // the meshes of a species, made the first time one is seen
  kind(sp) {
    let K = this.kinds.get(sp.id); if (K) return K;
    const lods = [0, 1].map(l => build(sp, l)), meta = lods[0].meta;
    meta.sh = sp.sh; meta.bl = sp.len; meta.L = sp.len;
    const mat = this.gfx.shadowed(prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: sp.rig === 'frog' ? 0.45 : sp.rig === 'sprawl' ? 0.75 : 0.9, metalness: 0, envMapIntensity: 0.4 }), patcher(meta, false)));
    mat.defines = Object.assign({ PAT: 0 }, meta.defs);
    const dmat = prep(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), patcher(meta, true)); dmat.defines = Object.assign({ PAT: 0 }, meta.defs);
    const big = sp.mass > 150 || sp.rig === 'bird' && sp.span > 1.5;
    K = { sp, meta, lodD: Math.max(14, Math.min(80, Math.max(sp.len, sp.span || 0, sp.sh) * 22)), far: sp.vis || RINGS[sp.ring].r + 40, meshes: lods.map((L, i) => {
      const g = L.geo; for (const n of ['aAnim', 'aPose', 'aWing', 'aTint']) { const at = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, at); }
      const m = new THREE.InstancedMesh(g, mat, CAP); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
      m.castShadow = i === 0 || big; m.receiveShadow = true; m.customDepthMaterial = dmat; m.name = sp.id + (i ? ':fjern' : ''); this.root.add(m); return m; }) };
    this.kinds.set(sp.id, K);
    return K;
  }
  update(animals) {
    const cam = this.gfx.camera, cp = cam.position;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _f.setFromProjectionMatrix(_pm);
    for (const K of this.kinds.values()) for (const m of K.meshes) m.n = 0;
    let drawn = 0;
    for (const a of animals) {
      if (a.hide || a.dead) continue;
      const sp = a.sp, K = this.kind(sp), d = Math.hypot(a.x - cp.x, a.y - cp.y, a.z - cp.z);
      if (d > K.far) continue;
      _sp.center.set(a.x, a.y + sp.sh * 0.5, a.z); _sp.radius = Math.max(sp.len, sp.span || 0, sp.sh) * a.s; if (!_f.intersectsSphere(_sp)) continue;
      const m = K.meshes[d < K.lodD ? 0 : 1]; if (m.n >= CAP) continue;
      this.write(a, K, m, m.n++); drawn++;
    }
    for (const K of this.kinds.values()) for (const m of K.meshes) {
      m.count = m.n; if (!m.n) continue;
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, m.n * 16); m.instanceMatrix.needsUpdate = true;
      for (const n of ['aAnim', 'aPose', 'aWing', 'aTint']) { const at = m.geometry.attributes[n]; at.clearUpdateRanges(); at.addUpdateRange(0, m.n * 4); at.needsUpdate = true; }
    }
    this.drawn = drawn;
  }
  write(a, K, m, i) {
    const sp = a.sp, M = K.meta, D = M.defs, g = m.geometry.attributes; let s = a.s;
    let pitch = (a.pitch || 0) + (a.slope || 0) + (a.rock || 0), y = a.y + (a.bob || 0), roll = a.roll || 0;
    if (D.SIT) pitch -= 0.6 * a.lie;
    else if (sp.rig === 'quad' && a.lie > 0) y -= M.drop * a.lie * s;
    if (sp.id === 'love' && a.male) s *= 1.08;
    _e.set(pitch, a.h, roll, 'YXZ'); _q.setFromEuler(_e); _p.set(a.x, y, a.z); _s.set(s, s, s);
    // turn about the right point: the body's middle when it falls over, the hind feet when it sits up
    if (roll || (D.SIT && a.lie > 0.01)) {
      const pv = roll ? _a.set(0, M.cy * s, 0) : _a.set(0, 0, -sp.len * 0.3 * s);
      _qy.setFromAxisAngle(_Y, a.h); _b.copy(pv).applyQuaternion(_qy); pv.applyQuaternion(_q); _p.add(_b).sub(pv);
      if (roll) _p.y += (sp.wid * 0.5 - M.cy) * s * Math.abs(Math.sin(roll));
    }
    _m.compose(_p, _q, _s); m.setMatrixAt(i, _m);
    const bird = sp.rig === 'bird' || sp.rig === 'fly', o = i * 4;
    const hp = bird ? a.hp * (M.peck || 1) : a.hp > 0 ? a.hp * M.graze : a.hp;
    g.aAnim.array.set([a.ph, a.amp, a.gait, bird ? a.tuck : a.lie], o);
    g.aPose.array.set([hp, a.hy || 0, a.tail || 0, sp.rig === 'crab' ? -a.jaw : a.jaw || 0], o);
    g.aWing.array.set([a.fph || 0, a.famp || 0, a.fold || 0, 0], o);
    if (!a.tint) { const T = TINTS[sp.id]; _c.set(sp.id === 'and' && !a.male ? '#b08458' : T ? T[Math.floor(a.seed * T.length)] : '#ffffff'); a.tint = [_c.r, _c.g, _c.b, (a.male ? 1 : 0) + a.seed * 0.99]; }
    g.aTint.array.set(a.tint, o);
  }
  dispose() { for (const K of this.kinds.values()) for (const m of K.meshes) { m.geometry.dispose(); this.root.remove(m); } this.gfx.scene.remove(this.root); }
}
