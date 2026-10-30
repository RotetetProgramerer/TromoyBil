// Rendering: the renderer and its passes, the sky and the sun, height fog, cascaded shadows and the shared materials.
// Pipeline per frame: opaque scene → rtScene (HDR + depth) → copy → water and see-through things (they read the scene's
// depth and colour) → bloom → tone mapping → anti-aliasing → screen.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

export const QUALITY = {
  lav: { name: 'Lav', pixel: 0.75, shadow: 0, shadowSize: 1024, far: 5000, lod: 1.1, msaa: 0, bloom: false, trees: 500, treesFar: 0, grass: false, tex: 512 },
  middels: { name: 'Middels', pixel: 1, shadow: 2, shadowSize: 1024, far: 9000, lod: 1.4, msaa: 0, bloom: true, trees: 1100, treesFar: 1600, grass: false, tex: 1024 },
  hoy: { name: 'Høy', pixel: 1, shadow: 3, shadowSize: 2048, far: 14000, lod: 1.8, msaa: 4, bloom: true, trees: 1800, treesFar: 3000, grass: true, tex: 1024 },
  ultra: { name: 'Ultra', pixel: 1.5, shadow: 4, shadowSize: 4096, far: 20000, lod: 2.4, msaa: 4, bloom: true, trees: 2600, treesFar: 4500, grass: true, tex: 1024 },
};

// uniforms shared by every material (fog, sun, wetness, time)
export const U = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.6, -0.5).normalize() },
  uFogSun: { value: new THREE.Color(1, 0.9, 0.7) },
  uFogFall: { value: 0.0016 },
  uTime: { value: 0 },
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uNight: { value: 0 },
};

// fog for every built-in material: exponential with height (thick by the sea, thin on the hills) and brighter towards the sun
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogPos;\n#endif';
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vec4 fogWP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWP = instanceMatrix * fogWP;
  #endif
  fogWP = modelMatrix * fogWP; vFogPos = fogWP.xyz;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; uniform float fogDensity; varying vec3 vFogPos;
  uniform vec3 uSunDir; uniform vec3 uFogSun; uniform float uFogFall;
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  vec3 fv = vFogPos - cameraPosition; float fd = length( fv ); vec3 frd = fv / max( fd, 1e-3 );
  float fb = max( uFogFall, 1e-5 ), ft = fd * frd.y * fb;
  float fk = abs( ft ) < 1e-4 ? fd : ( 1.0 - exp( -ft ) ) / ( frd.y * fb );
  float fogAmt = 1.0 - exp( -fogDensity * exp( -max( cameraPosition.y, 0.0 ) * fb ) * fk );
  float fsun = pow( max( dot( frd, uSunDir ), 0.0 ), 8.0 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uFogSun, fsun * 0.6 ), fogAmt );
#endif`;

// add the shared uniforms to a material (and keep any other onBeforeCompile it has)
export function prep(mat, patch) {
  const prev = mat.onBeforeCompile;
  mat.userData.obc = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    if (patch) patch(sh);
  };
  mat.onBeforeCompile = mat.userData.obc;
  mat.customProgramCacheKey = () => (patch ? patch.key || patch.toString().length : 0) + ':' + mat.type;
  return mat;
}

// clouds: one layer at 1800 m, drawn on a dome at the far plane like the sky. The view ray meets the layer; fbm noise there gives
// the clouds, lit from the sun's side and darker underneath, thicker and greyer as the cover grows (clear 0.25 … rain 0.95)
const CLOUD_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const CLOUD_FRAG = `
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uFogCol; uniform float uCover; uniform float uTime; uniform float uNight; uniform vec3 uCam;
varying vec3 vDir;
float ch(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(ch(i), ch(i+vec2(1,0)), f.x), mix(ch(i+vec2(0,1)), ch(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * cn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  if (d.y < 0.005) discard;
  float t = (1800.0 - uCam.y) / d.y; vec2 p = uCam.xz + d.xz * min(t, 60000.0);
  vec2 q = p * 0.00032 + vec2(0.006, 0.0025) * uTime;
  float n = fbm(q), lo = mix(0.74, 0.24, uCover);              // fbm is mostly 0.3–0.7: the cover moves the threshold through it
  float c = smoothstep(lo, lo + 0.16, n);
  float n2 = fbm(q + uSunDir.xz * 0.06);
  float lit = clamp(0.6 + (n - n2) * 3.0, 0.0, 1.0);
  float ov = smoothstep(0.55, 1.0, uCover);
  lit *= 0.75 + 0.25 * smoothstep(lo, lo + 0.4, n);              // thick parts are darker underneath
  vec3 dark = mix(vec3(0.46, 0.5, 0.57), vec3(0.3, 0.32, 0.36), ov), bright = mix(vec3(1.0), vec3(0.66, 0.68, 0.71), ov);
  vec3 col = mix(dark, bright, lit) * mix(uSunCol * 0.85 + 0.15, vec3(1.0), 0.35) * (0.05 + 0.95 * (1.0 - uNight));
  float sunGlow = pow(max(dot(d, uSunDir), 0.0), 12.0);
  col += uSunCol * sunGlow * (1.0 - c) * 0.8;
  float hz = smoothstep(0.0, 0.3, d.y);
  col = mix(uFogCol, col, 0.25 + 0.75 * hz);
  gl_FragColor = vec4(col, c * smoothstep(0.005, 0.07, d.y) * (0.75 + 0.25 * ov));
}`;

export class Gfx {
  constructor(container, quality = 'hoy') {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.overlay = new THREE.Scene();          // water and other see-through things (drawn after the opaque scene)
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20000);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4030, 0.6);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0xa9bfd0, 0.00012);
    this.overlay.fog = this.scene.fog;
    this.pmrem = new THREE.PMREMGenerator(r);
    // sky: the physical sky (Preetham) as a dome, and the same sky in a scene of its own for the reflections
    this.sky = new Sky(); this.sky.scale.setScalar(40000); this.sky.material.depthWrite = false; this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    const su = this.sky.material.uniforms; su.turbidity.value = 4.5; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
    this.scene.add(this.sky);
    this.cover = 0.3;
    this.cloudU = { uSunDir: U.uSunDir, uSunCol: { value: new THREE.Color(1, 1, 1) }, uFogCol: { value: this.scene.fog.color }, uCover: { value: this.cover }, uTime: U.uTime, uNight: U.uNight, uCam: { value: new THREE.Vector3() } };
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false }));
    this.clouds.frustumCulled = false; this.clouds.renderOrder = -9; this.scene.add(this.clouds);
    this.envScene = new THREE.Scene(); this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envSky.material = this.sky.material; this.envScene.add(this.envSky);
    this.envT = null; this.envSun = new THREE.Vector3(9, 9, 9);
    this.clock = 12; this.sunDir = new THREE.Vector3();
    this.setQuality(quality);
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.qName = q; const Q = this.q = QUALITY[q] || QUALITY.hoy;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * Q.pixel);
    this.camera.far = Q.far * 1.6;
    if (this.csm) { this.csm.remove(); this.csm.dispose(); this.csm = null; }
    if (Q.shadow) {
      this.csm = new CSM({ maxFar: [0, 160, 400, 900, 1600][Q.shadow], cascades: Q.shadow, mode: 'practical', parent: this.scene, shadowMapSize: Q.shadowSize,
        lightDirection: this.sunDir.clone().negate(), camera: this.camera, lightIntensity: 3.2, shadowBias: -0.00025, lightMargin: 300 });
      this.csm.fade = true;
      for (const l of this.csm.lights) { l.shadow.normalBias = 0.04; }
      for (const m of this.csmMats || []) this.csmSetup(m);
      this.sun = null;
      if (this.sunLight) { this.scene.remove(this.sunLight); this.sunLight = null; }
    } else {
      for (const m of this.csmMats || []) this.csmSetup(m);
    }
    if (!Q.shadow && !this.sunLight) {
      this.sunLight = new THREE.DirectionalLight(0xffffff, 3.2); this.scene.add(this.sunLight, this.sunLight.target);
    }
    this.resize();
  }
  // every material that should get shadows from the sun goes through this
  shadowed(mat) { (this.csmMats || (this.csmMats = [])).push(mat); this.csmSetup(mat); return mat; }
  // the shadow cascades replace onBeforeCompile; run ours after theirs
  csmSetup(mat) {
    const mine = mat.userData.obc || (() => {});
    if (this.csm) { this.csm.setupMaterial(mat); const theirs = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { theirs.call(mat, sh, r); mine.call(mat, sh, r); }; }
    else { mat.onBeforeCompile = mine; if (mat.defines) { delete mat.defines.USE_CSM; delete mat.defines.CSM_CASCADES; delete mat.defines.CSM_FADE; } }
    mat.needsUpdate = true;
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight, r = this.renderer;
    r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = r.getPixelRatio(), W = Math.floor(w * pr), H = Math.floor(h * pr);
    const mk = (opts) => new THREE.WebGLRenderTarget(W, H, Object.assign({ type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace }, opts));
    for (const t of [this.rtScene, this.rtColor, this.rtDepth, this.rtLdr]) if (t) t.dispose();
    const dt = new THREE.DepthTexture(W, H); dt.type = THREE.FloatType;
    this.rtScene = mk({ depthTexture: dt, samples: this.q.msaa });
    // copies of the opaque scene's colour and depth: the water reads them while it is drawn into rtScene with a real depth test
    this.rtColor = mk({ depthBuffer: false });
    this.rtDepth = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtLdr = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
    if (!this.copy) {
      this.copy = new ShaderPass(CopyShader);
      this.depthCopy = new ShaderPass({ uniforms: { tDepth: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDepth; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tDepth, vUv).x, 0.0, 0.0, 1.0); }' });
      this.output = new OutputPass();
      this.fxaa = new ShaderPass(FXAAShader);
    }
    this.fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H);
    if (this.bloom) this.bloom.dispose();
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.35, 0.6, 0.92);
    if (this.csm) this.csm.updateFrustums();
    this.size = { W, H };
  }

  // time of day in hours (0–24). Sets the sun, the sky, the light colours and the fog.
  setTime(hours, latDeg = 58.5, dayOfYear = 172) {
    this.clock = hours; this.lat = latDeg; this.doy = dayOfYear;
    const decl = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81)) * Math.PI / 180, lat = latDeg * Math.PI / 180, ha = (hours - 12) * 15 * Math.PI / 180;
    const alt = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha));
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));   // 0 = south, + towards west
    // world: x east, z south, y up
    // az > 0 in the afternoon puts the sun in the west (−x); at noon it is due south (+z)
    const d = this.sunDir.set(-Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt)).normalize();
    U.uSunDir.value.copy(d);
    this.sky.material.uniforms.sunPosition.value.copy(d).multiplyScalar(1000);
    const e = d.y, day = THREE.MathUtils.smoothstep(e, -0.08, 0.12), low = 1 - THREE.MathUtils.smoothstep(e, 0.0, 0.35);
    U.uNight.value = 1 - day;
    const sunCol = new THREE.Color().setRGB(1, 0.96 - low * 0.28, 0.9 - low * 0.55);
    // under clouds the sun weakens and the sky's diffuse light takes over
    const ov = THREE.MathUtils.smoothstep(this.cover, 0.45, 1.0), I = 3.4 * day * (1 - 0.82 * ov);
    if (this.csm) { for (const l of this.csm.lights) { l.color.copy(sunCol); l.intensity = I; } this.csm.lightDirection.copy(d).negate(); }
    if (this.sunLight) { this.sunLight.color.copy(sunCol); this.sunLight.intensity = I; }
    this.hemi.color.setRGB(0.55 + 0.2 * day, 0.68 + 0.18 * day, 0.95).multiplyScalar(0.15 + 0.75 * day);
    this.hemi.groundColor.setRGB(0.32, 0.28, 0.22).multiplyScalar(0.15 + 0.7 * day);
    this.hemi.intensity = 0.42 + 0.4 * ov;
    // fog colour near the horizon: blue-grey by day, warm at sunset, dark blue at night
    const fog = new THREE.Color().setRGB(0.58, 0.68, 0.8).lerp(new THREE.Color(0.85, 0.62, 0.48), low * day * 0.6).multiplyScalar(0.08 + 0.92 * day);
    fog.lerp(new THREE.Color(0.6, 0.63, 0.66).multiplyScalar(0.08 + 0.85 * day), ov * 0.75);
    this.scene.fog.color.copy(fog); this.cloudU.uSunCol.value.copy(sunCol).multiplyScalar(day); this.cloudU.uCover.value = this.cover;
    U.uFogSun.value.copy(sunCol).multiplyScalar(day);
    this.sky.material.uniforms.rayleigh.value = 1.2 + low * 1.5;
    this.renderer.toneMappingExposure = 0.85 + 0.6 * (1 - day);
    // reflections from the sky: rebuild when the sun has moved
    if (!this.envT || this.envSun.distanceTo(d) > 0.01) {
      this.envSun.copy(d);
      const t = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
      if (this.envT) this.envT.dispose();
      this.envT = t; this.scene.environment = t.texture;
    }
    this.scene.environmentIntensity = (0.12 + 0.34 * day) * (1 - 0.3 * ov);
  }
  setCover(c) { this.cover = c; this.setTime(this.clock, this.lat, this.doy); }
  setFog(density, falloff = 0.0016) { this.scene.fog.density = density; U.uFogFall.value = falloff; }

  render(dt) {
    const r = this.renderer, cam = this.camera;
    U.uTime.value += dt;
    this.sky.position.copy(cam.position); this.clouds.position.copy(cam.position); this.cloudU.uCam.value.copy(cam.position);
    if (this.csm) this.csm.update();
    if (this.sunLight) { this.sunLight.position.copy(cam.position).addScaledVector(U.uSunDir.value, 500); this.sunLight.target.position.copy(cam.position); }
    r.setRenderTarget(this.rtScene); r.clear(); r.render(this.scene, cam);
    // the water and other see-through things: drawn into the same target (so the depth test hides them behind solid things),
    // reading copies of the opaque colour (refraction) and depth (how deep the water is)
    if (this.overlay.children.length) {
      this.copy.render(r, this.rtColor, this.rtScene);
      this.depthCopy.uniforms.tDepth.value = this.rtScene.depthTexture; this.depthCopy.render(r, this.rtDepth, null);
      r.setRenderTarget(this.rtScene); r.autoClear = false; r.render(this.overlay, cam); r.autoClear = true;
    }
    let src = this.rtScene;
    if (this.q.bloom && U.uNight.value > 0.05 || this.q.bloom && this.bloomDay) this.bloom.render(r, null, src, dt, false);
    this.output.renderToScreen = this.q.msaa > 0;
    if (this.q.msaa > 0) { this.output.render(r, null, src); }
    else { this.output.render(r, this.rtLdr, src); this.fxaa.renderToScreen = true; this.fxaa.render(r, null, this.rtLdr); }
  }
}

// ------------------------------------------------------------------ textures
// a texture array from a list of JPEGs (all the same size), with mipmaps
export async function textureArray(urls, size, srgb) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(size * size * 4 * urls.length);
  await Promise.all(urls.map(async (u, i) => {
    const img = await loadImage(u);
    return { img, i };
  })).then(list => {
    for (const { img, i } of list) { ctx.clearRect(0, 0, size, size); ctx.drawImage(img, 0, 0, size, size); data.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4); }
  });
  const t = new THREE.DataArrayTexture(data, size, size, urls.length);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}
export function loadImage(u) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(u)); i.src = u; }); }
export async function texture(u, srgb = true, repeat = true) {
  const t = await new THREE.TextureLoader().loadAsync(u);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
