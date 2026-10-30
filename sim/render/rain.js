// Rain and snow round the camera: thin streaks (or flakes) in a box that moves with the camera, all moved in the vertex shader,
// so the whole shower is one draw call. set(amount, kind) with amount 0–1 and kind 'rain' or 'snow'.
import * as THREE from 'three';
import { U } from './gfx.js';

const VERT = `
attribute vec4 seed; uniform vec3 uCam; uniform float uTime; uniform float uBox; uniform float uFall; uniform vec2 uWind; uniform float uAmount;
uniform float uLen; uniform float uWidth; uniform float uSnow; varying float vA; varying vec2 vUv;
void main(){
  vUv = position.xy;
  if (seed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // a drop falls through the box; snowflakes also drift and sway
  float sp = uFall * (0.75 + 0.5 * seed.w);
  vec3 drift = vec3(uWind.x, -sp, uWind.y) * uTime;
  drift.xz += uSnow * vec2(sin(uTime * 0.9 + seed.x * 40.0), cos(uTime * 0.7 + seed.z * 40.0)) * 0.6;
  vec3 p = seed.xyz * uBox + drift - uCam;
  p = (fract(p / uBox) - 0.5) * uBox + uCam;
  vec3 v = normalize(vec3(uWind.x, -sp, uWind.y)), toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(v, toCam));
  float len = mix(uLen, uWidth * 2.0, uSnow);
  vec3 up = mix(v, normalize(cross(toCam, side)), uSnow);
  vec3 w = p + side * position.x * uWidth + up * position.y * len;
  float d = distance(p, cameraPosition);
  vA = smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const FRAG = `
uniform vec3 uCol; uniform float uSnow; uniform float uAlpha; varying float vA; varying vec2 vUv;
void main(){
  float a;
  if (uSnow > 0.5) { vec2 c = vUv * 2.0 - vec2(0.0, 1.0); a = 1.0 - smoothstep(0.4, 1.0, length(c)); }
  else a = (1.0 - abs(vUv.x) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  gl_FragColor = vec4(uCol, a * vA * uAlpha);
}`;

export class Rain {
  constructor(gfx, n = 9000) {
    this.gfx = gfx; this.amount = 0; this.kind = 'rain';
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const S = new Float32Array(n * 4); for (let i = 0; i < S.length; i++) S[i] = Math.random();
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(S, 4)); g.instanceCount = n;
    this.uni = { uCam: { value: new THREE.Vector3() }, uTime: U.uTime, uBox: { value: 34 }, uFall: { value: 9 }, uWind: { value: new THREE.Vector2(1.2, 0.6) },
      uAmount: { value: 0 }, uLen: { value: 0.55 }, uWidth: { value: 0.012 }, uSnow: { value: 0 }, uCol: { value: new THREE.Color() }, uAlpha: { value: 0.3 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; this.mesh.visible = false;
    gfx.overlay.add(this.mesh);
  }
  set(amount, kind = this.kind) {
    this.amount = amount; this.kind = kind; const u = this.uni, snow = kind === 'snow';
    u.uSnow.value = snow ? 1 : 0; u.uFall.value = snow ? 1.1 : 9; u.uWidth.value = snow ? 0.022 : 0.012; u.uBox.value = snow ? 26 : 34; u.uAlpha.value = snow ? 0.85 : 0.3;
    u.uAmount.value = amount; this.mesh.visible = amount > 0;
  }
  update(dt) {
    if (!this.mesh.visible) return;
    const c = this.gfx.camera.position, u = this.uni; u.uCam.value.copy(c);
    // lit by the sky: grey by day, faint at night (the snow brighter)
    u.uCol.value.copy(this.gfx.scene.fog.color).multiplyScalar(this.kind === 'snow' ? 1.6 : 1.35).addScalar(0.05 * (1 - U.uNight.value));
  }
}
