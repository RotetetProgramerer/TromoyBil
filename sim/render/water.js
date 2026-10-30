// The sea and the lakes. The water is drawn after the opaque scene and reads its depth and colour: shallow water is clear
// and turquoise over the sand, deep water dark; the bottom shows through, bent by the waves; the sky and the sun reflect off
// the surface; foam where the water meets the shore.
import * as THREE from 'three';
import { U } from './gfx.js';

const VERT = `
uniform float uTime; uniform float uWave; varying vec3 vW; varying vec4 vClip;
// a few Gerstner waves (direction, wavelength, height); amplitude fades with distance so the far sea stays flat
vec3 gerstner(vec2 p, vec2 d, float L, float A, float t){ float k = 6.2832 / L, c = sqrt(9.81 / k), f = k * (dot(d, p) - c * t);
  return vec3(d.x * A * cos(f), A * sin(f), d.y * A * cos(f)); }
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float fade = 1.0 - smoothstep(150.0, 900.0, distance(wp.xz, cameraPosition.xz));
  vec3 g = gerstner(wp.xz, normalize(vec2(1.0, 0.35)), 31.0, 0.22, uTime) + gerstner(wp.xz, normalize(vec2(0.6, 1.0)), 13.0, 0.09, uTime)
         + gerstner(wp.xz, normalize(vec2(-0.4, 1.0)), 7.0, 0.045, uTime);
  wp.xyz += g * uWave * fade;
  vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; vClip = gl_Position;
}`;
const FRAG = `
#include <packing>
uniform sampler2D tDepth; uniform sampler2D tColor; uniform float uNear; uniform float uFar; uniform vec2 uRes;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uHorCol; uniform vec3 uDeep; uniform vec3 uShallow;
uniform float uTime; uniform float uWave; uniform float uClear; uniform vec3 fogColor; uniform float fogDensity; uniform float uFogFall; uniform vec3 uFogSun; uniform float uNight;
varying vec3 vW; varying vec4 vClip;
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }
// the surface normal: the Gerstner slopes plus short wind waves in many directions. px is how many metres one pixel covers here:
// every wave shorter than a few pixels fades out, so the far sea does not shimmer (and the sun's glint widens instead)
float aa(float L, float px){ return 1.0 - smoothstep(0.06 * L, 0.3 * L, px); }
vec3 surfN(vec2 p, float px){
  float t = uTime; vec2 g = vec2(0.0);
  vec2 d1 = normalize(vec2(1.0, 0.35)), d2 = normalize(vec2(0.6, 1.0)), d3 = normalize(vec2(-0.4, 1.0));
  float k1 = 6.2832 / 31.0, k2 = 6.2832 / 13.0, k3 = 6.2832 / 7.0;
  g += d1 * 0.22 * k1 * cos(k1 * (dot(d1, p) - sqrt(9.81 / k1) * t)) * aa(31.0, px);
  g += d2 * 0.09 * k2 * cos(k2 * (dot(d2, p) - sqrt(9.81 / k2) * t)) * aa(13.0, px);
  g += d3 * 0.045 * k3 * cos(k3 * (dot(d3, p) - sqrt(9.81 / k3) * t)) * aa(7.0, px);
  g *= uWave;
  for (int i = 0; i < 7; i++) {
    float fi = float(i), a = fi * 2.399 + 0.4 + 0.3 * sin(fi * 5.1), L = 3.6 * pow(0.7, fi), k = 6.2832 / L; vec2 d = vec2(cos(a), sin(a));
    g += d * 0.035 * cos(k * dot(d, p) - sqrt(9.81 * k) * t + fi * 1.7) * aa(L, px) * (0.35 + uWave);
  }
  // and patches where the wind roughens the water more (cat's paws), slowly drifting
  float paw = wn(p * 0.035 + t * vec2(0.012, 0.008)) * 0.8 + 0.4;
  g += (vec2(wn(p * 0.9 + t * 0.35), wn(p * 0.9 - t * 0.31 + 9.0)) - 0.5) * 0.06 * aa(1.0, px) * paw;
  return normalize(vec3(-g.x, 1.0, -g.y));
}
void main(){
  vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
  float sceneZ = -perspectiveDepthToViewZ(texture2D(tDepth, suv).x, uNear, uFar);
  vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
  float waterZ = dist * dot(-V, normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) * -1.0);
  // view-space depth of this water fragment
  vec4 vp = viewMatrix * vec4(vW, 1.0); waterZ = -vp.z;
  if (sceneZ < waterZ - 0.02) discard;                      // (the depth test already hides water behind solid things)
  float thick = max(sceneZ - waterZ, 0.0);                   // how much water the eye looks through
  float px = length(fwidth(vW.xz));
  vec3 N = surfN(vW.xz, px);
  // through the water: the bottom, shifted by the waves, tinted and absorbed with depth
  vec2 off = N.xz * 0.04 * clamp(thick, 0.0, 3.0) / (1.0 + dist * 0.02);
  vec3 under = texture2D(tColor, suv + off).rgb;
  float sceneZ2 = -perspectiveDepthToViewZ(texture2D(tDepth, suv + off).x, uNear, uFar);
  if (sceneZ2 < waterZ) under = texture2D(tColor, suv).rgb;
  float depthAlong = thick * (0.35 + 0.65 * clamp(V.y, 0.0, 1.0));
  vec3 absorb = exp(-depthAlong * vec3(0.75, 0.3, 0.26) * uClear);
  vec3 body = mix(uDeep, uShallow, exp(-depthAlong * 0.25)) * (0.25 + 0.75 * (1.0 - uNight));
  vec3 refr = under * absorb + body * (1.0 - absorb);
  // off the surface: the sky (darker straight up, the horizon colour low down) and the sun
  vec3 R = reflect(-V, N); float up = clamp(R.y, 0.0, 1.0);
  vec3 sky = mix(uHorCol, uSkyCol, pow(up, 0.5));
  float rs = max(dot(R, uSunDir), 0.0), sp = mix(900.0, 90.0, clamp(px * 1.5, 0.0, 1.0));
  float sun = pow(rs, sp) * 60.0 * sqrt(sp / 900.0) + pow(rs, 60.0) * 0.6;
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = mix(refr, sky, fres) + uSunCol * sun * (1.0 - uNight);
  // foam: along the shore and on the crests out at sea
  float shore = 1.0 - smoothstep(0.0, 0.8 + 0.6 * wn(vW.xz * 0.2), thick);
  float foamN = wn(vW.xz * 1.3 + uTime * 0.25) * wn(vW.xz * 0.37 - uTime * 0.1);
  float foam = shore * smoothstep(0.25, 0.6, foamN + shore * 0.4) * (0.4 + uWave);
  col = mix(col, vec3(0.92, 0.95, 0.96) * (0.3 + 0.7 * (1.0 - uNight)), clamp(foam, 0.0, 0.85));
  // soft edge where the water is very shallow, so the shore does not have a hard line
  float edge = smoothstep(0.0, 0.12, thick);
  // fog (the same as every other material)
  vec3 fv = vW - cameraPosition; float fd = length(fv); vec3 frd = fv / max(fd, 1e-3);
  float fb = max(uFogFall, 1e-5), ft = fd * frd.y * fb, fk = abs(ft) < 1e-4 ? fd : (1.0 - exp(-ft)) / (frd.y * fb);
  float fogAmt = 1.0 - exp(-fogDensity * exp(-max(cameraPosition.y, 0.0) * fb) * fk);
  col = mix(col, mix(fogColor, uFogSun, pow(max(dot(frd, uSunDir), 0.0), 8.0) * 0.6), fogAmt);
  gl_FragColor = vec4(col, edge);
}`;

export class Water {
  constructor(gfx, world) {
    this.gfx = gfx; this.world = world;
    const uni = this.uni = {
      tDepth: { value: null }, tColor: { value: null }, uNear: { value: 0.1 }, uFar: { value: 20000 }, uRes: { value: new THREE.Vector2() },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.85) }, uSkyCol: { value: new THREE.Color(0.25, 0.42, 0.68) }, uHorCol: { value: new THREE.Color(0.62, 0.72, 0.82) },
      uDeep: { value: new THREE.Color(0.01, 0.05, 0.07) }, uShallow: { value: new THREE.Color(0.045, 0.21, 0.2) }, uWave: { value: 0.8 }, uClear: { value: 1.0 },
      fogColor: { value: gfx.scene.fog.color }, fogDensity: { value: 0 },
      uTime: U.uTime, uSunDir: U.uSunDir, uFogFall: U.uFogFall, uFogSun: U.uFogSun, uNight: U.uNight,
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: true, depthWrite: false });
    // the sea: a square grid round the camera, dense near the middle (it moves with the camera in whole steps)
    const g = new THREE.PlaneGeometry(1, 1, 256, 256), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) * 2, y = p.getY(i) * 2, r = Math.max(Math.abs(x), Math.abs(y)), k = r < 1e-6 ? 0 : (Math.pow(r, 3) * 24000 + r * 600) / r; p.setXY(i, x * k, y * k); }
    g.rotateX(-Math.PI / 2); g.computeBoundingSphere();
    this.sea = new THREE.Mesh(g, this.mat); this.sea.frustumCulled = false; this.sea.renderOrder = 5;
    gfx.overlay.add(this.sea);
    // lakes: flat polygons at their own level, calmer
    this.lakeMat = this.mat.clone(); this.lakeMat.uniforms = Object.assign({}, uni, { uWave: { value: 0.12 }, uClear: { value: 2.5 }, uShallow: { value: new THREE.Color(0.05, 0.12, 0.08) }, uDeep: { value: new THREE.Color(0.01, 0.03, 0.025) } });
    for (const isl of world.islands) for (const l of isl.lakes) {
      const sh = new THREE.Shape(); for (let i = 0; i < l.p.length; i += 2) { const x = l.p[i] + isl.ox, z = l.p[i + 1] + isl.oz; if (i) sh.lineTo(x, -z); else sh.moveTo(x, -z); }
      const lg = new THREE.ShapeGeometry(sh); lg.rotateX(-Math.PI / 2); lg.translate(0, l.y, 0);
      const m = new THREE.Mesh(lg, this.lakeMat); m.renderOrder = 4; gfx.overlay.add(m);
    }
  }
  update(dt) {
    const g = this.gfx, cam = g.camera, u = this.uni;
    const step = 50; this.sea.position.set(Math.round(cam.position.x / step) * step, this.world.sea || 0, Math.round(cam.position.z / step) * step);
    u.tDepth.value = g.rtDepth.texture; u.tColor.value = g.rtColor.texture; u.uNear.value = cam.near; u.uFar.value = cam.far;
    u.fogDensity.value = g.scene.fog.density;
    const day = 1 - U.uNight.value;
    u.uHorCol.value.copy(g.scene.fog.color).multiplyScalar(1.05);
    u.uSkyCol.value.setRGB(0.18, 0.36, 0.62).multiplyScalar(0.1 + 0.9 * day);
    u.uSunCol.value.copy(U.uFogSun.value);
    for (const k of ['tDepth', 'tColor', 'uNear', 'uFar', 'fogDensity']) this.lakeMat.uniforms[k] = u[k];
  }
}
