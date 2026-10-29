// The terrain: a quadtree of square chunks (33 × 33 points each, 1 m apart near the camera, up to 64 m far away),
// built by the mesh worker, and a material that blends 14 texture layers per pixel from the island's land cover map.
import * as THREE from 'three';
import { terrainIndex } from './meshgen.js';
import { prep, U } from './gfx.js';
import { COVER } from '../world/island.js';

// texture layers (assets/tex/<name>_a.jpg and _n.jpg), in the order of the texture arrays
export const LAYERS = ['grass', 'forest', 'rock', 'dirt', 'gravel', 'sand', 'snow', 'field', 'mud', 'asphalt', 'ash', 'drygrass', 'redearth', 'blacksand'];
const L = Object.fromEntries(LAYERS.map((n, i) => [n, i]));
// per land cover class: [main layer, second layer, how much of the second shows (0–1), texture scale]
const C = COVER, MAP = [];
MAP[C.SEA] = ['sand', 'rock', 0.35]; MAP[C.BEACH] = ['sand', 'gravel', 0.15]; MAP[C.ROCK] = ['rock', 'grass', 0.18]; MAP[C.FOREST] = ['forest', 'grass', 0.3];
MAP[C.MIXED] = ['forest', 'grass', 0.3]; MAP[C.DECID] = ['forest', 'grass', 0.35]; MAP[C.HEATH] = ['drygrass', 'rock', 0.3]; MAP[C.GRASS] = ['grass', 'dirt', 0.12];
MAP[C.FARM] = ['grass', 'field', 0.18]; MAP[C.GARDEN] = ['grass', 'dirt', 0.06]; MAP[C.URBAN] = ['asphalt', 'gravel', 0.4]; MAP[C.BOG] = ['mud', 'grass', 0.45];
MAP[C.LAKE] = ['mud', 'sand', 0.4]; MAP[C.GRAVEL] = ['gravel', 'dirt', 0.3]; MAP[C.STREAM] = ['gravel', 'mud', 0.4]; MAP[C.SNOW] = ['snow', 'rock', 0.12];
MAP[C.ASH] = ['ash', 'blacksand', 0.4]; MAP[C.LAVA] = ['ash', 'ash', 0]; MAP[C.JUNGLE] = ['forest', 'mud', 0.35]; MAP[C.SAVANNA] = ['drygrass', 'redearth', 0.3];
MAP[C.MUD] = ['mud', 'dirt', 0.3]; MAP[C.DIRT] = ['dirt', 'gravel', 0.25];

function mapTexture() {
  const d = new Uint8Array(32 * 4);
  for (let i = 0; i < 32; i++) { const m = MAP[i] || ['grass', 'dirt', 0.1]; d[i * 4] = L[m[0]]; d[i * 4 + 1] = L[m[1]]; d[i * 4 + 2] = Math.round(m[2] * 255); d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, 32, 1, THREE.RGBAFormat); t.needsUpdate = true; return t;
}
function coverTexture(isl) {
  const g = isl.cover, t = new THREE.DataTexture(g.data, g.nx, g.nz, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.unpackAlignment = 1; t.needsUpdate = true; t.generateMipmaps = false; return t;
}

const FRAG_PARS = `
uniform sampler2D tCov; uniform sampler2D tMap; uniform mediump sampler2DArray tA; uniform mediump sampler2DArray tN;
uniform vec4 uCov; uniform float uWet; uniform float uSnow; uniform float uTime; uniform int uDbg;
varying vec3 vWPos; varying vec3 vWNrm;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }
int covAt(ivec2 c){ c = clamp(c, ivec2(0), ivec2(int(uCov.w) - 1)); return int(texelFetch(tCov, c, 0).r * 255.0 + 0.5); }
// one texture layer at two scales (breaks up the repetition), with explicit gradients so it can be used inside branches
void lay(int l, vec2 uv, vec2 dx, vec2 dy, float far, inout vec3 a, inout vec3 n, inout float r, float w){
  if (w <= 0.0) return;
  vec4 A = textureGrad(tA, vec3(uv, float(l)), dx, dy), N = textureGrad(tN, vec3(uv, float(l)), dx, dy);
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.23;
  vec4 A2 = textureGrad(tA, vec3(uv2, float(l)), dx * 0.23, dy * 0.23), N2 = textureGrad(tN, vec3(uv2, float(l)), dx * 0.23, dy * 0.23);
  A = mix(A, A2, 0.35 + 0.5 * far); N = mix(N, N2, 0.35 + 0.5 * far);
  a += A.rgb * w; n += vec3(N.rg * 2.0 - 1.0, 0.0) * w; r += N.b * w;
}
`;
const FRAG_MAIN = `
  // the four nearest land cover cells, with borders shaken up by noise so they do not look like a grid
  vec2 cp = (vWPos.xz - uCov.xy) * uCov.z;
  float nz1 = vn(vWPos.xz * 0.21), nz2 = vn(vWPos.xz * 0.9 + 17.0), nzB = vn(vWPos.xz * 0.035 + 3.0);
  vec2 cq = cp + (vec2(nz1, nz2) - 0.5) * 0.9;
  ivec2 ci = ivec2(floor(cq)); vec2 cf = smoothstep(0.15, 0.85, fract(cq));
  int k0 = covAt(ci), k1 = covAt(ci + ivec2(1, 0)), k2 = covAt(ci + ivec2(0, 1)), k3 = covAt(ci + ivec2(1, 1));
  float w0 = (1.0 - cf.x) * (1.0 - cf.y), w1 = cf.x * (1.0 - cf.y), w2 = (1.0 - cf.x) * cf.y, w3 = cf.x * cf.y;
  vec2 uv = vWPos.xz / 3.6; vec2 dx = dFdx(uv), dy = dFdy(uv);
  float dist = length(vWPos - cameraPosition), far = smoothstep(25.0, 140.0, dist);
  vec3 ta = vec3(0.0), tn = vec3(0.0); float tr = 0.0;
  float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
  float rockW = smoothstep(0.32, 0.5, slope + (nzB - 0.5) * 0.15);
  float nb = vn(vWPos.xz * 0.12 + 40.0) * 0.6 + vn(vWPos.xz * 0.5) * 0.4;
  for (int q = 0; q < 4; q++) {
    int k = q == 0 ? k0 : q == 1 ? k1 : q == 2 ? k2 : k3; float wq = q == 0 ? w0 : q == 1 ? w1 : q == 2 ? w2 : w3;
    bool same = false;
    for (int p = 0; p < 4; p++) { if (p >= q) break; int kp = p == 0 ? k0 : p == 1 ? k1 : k2; if (kp == k) same = true; }
    if (same) continue;
    // sum the weight of every cell with this class, and draw the class once
    float W = (k0 == k ? w0 : 0.0) + (k1 == k ? w1 : 0.0) + (k2 == k ? w2 : 0.0) + (k3 == k ? w3 : 0.0);
    if (W < 0.003) continue;
    vec4 m = texelFetch(tMap, ivec2(k, 0), 0);
    int la = int(m.r * 255.0 + 0.5), lb = int(m.g * 255.0 + 0.5);
    float sb = smoothstep(1.0 - m.b - 0.12, 1.0 - m.b + 0.12, nb);
    W *= (1.0 - rockW);
    lay(la, uv, dx, dy, far, ta, tn, tr, W * (1.0 - sb));
    if (lb != la) lay(lb, uv * 1.13, dx * 1.13, dy * 1.13, far, ta, tn, tr, W * sb);
  }
  // steep ground: bare rock, mapped along the slope so it does not smear
  if (rockW > 0.0) {
    vec3 an = abs(vWNrm); vec2 ruv = (an.x > an.z ? vWPos.zy : vWPos.xy) / 5.0;
    lay(2, ruv, dFdx(ruv), dFdy(ruv), far, ta, tn, tr, rockW);
  }
  // snow on top of everything, in hollows first
  float sn = uSnow * (1.0 - smoothstep(0.25, 0.55, slope)) * (0.6 + 0.4 * nb);
  if (sn > 0.01) { vec3 sa = vec3(0.0), sN = vec3(0.0); float sr = 0.0; lay(6, uv, dx, dy, far, sa, sN, sr, 1.0); ta = mix(ta, sa, sn); tn = mix(tn, sN, sn); tr = mix(tr, sr, sn); }
  // big patches of lighter and darker ground, so the land does not look painted
  ta *= 0.86 + 0.28 * nzB;
  // wet: darker and shinier (rain, and the shore just above the water)
  float wet = clamp(uWet + (1.0 - smoothstep(0.1, 0.9, vWPos.y)) * 0.9, 0.0, 1.0);
  ta *= 1.0 - 0.32 * wet; tr = mix(tr, tr * 0.35, wet);
  diffuseColor.rgb = ta;
  vec3 dbgCol = uDbg == 1 ? vec3(float(k0) / 22.0) : uDbg == 2 ? ta : uDbg == 3 ? vec3(tr) : uDbg == 4 ? tn * 0.5 + 0.5 : uDbg == 5 ? vec3(w0, w1, w2) : vec3(rockW, far, wet);
  float terrRough = clamp(tr, 0.05, 1.0);
  vec3 terrN = normalize(vWNrm + vec3(tn.x, 0.0, tn.y) * (1.0 - far * 0.7) * 0.9);
`;

export function terrainMaterial(gfx, isl, arrays) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const uni = { tCov: { value: isl ? coverTexture(isl) : blankCover() }, tMap: { value: mapTexture() }, tA: { value: arrays.A }, tN: { value: arrays.N },
    uDbg: { value: 0 }, uCov: { value: isl ? new THREE.Vector4(isl.x0, isl.z0, 1 / isl.cover.cell, isl.cover.nx) : new THREE.Vector4(-1e6, -1e6, 1e-4, 1) } };
  const patch = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'varying vec3 vWPos; varying vec3 vWNrm;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader
      .replace('#include <map_fragment>', FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = terrRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(terrN, 0.0)).xyz);')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n if (uDbg > 0) gl_FragColor = vec4(dbgCol, 1.0);');
  };
  patch.key = 'terrain';
  prep(mat, patch);
  gfx.shadowed(mat);
  mat.userData.uni = uni;
  return mat;
}
function blankCover() { const t = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat); t.needsUpdate = true; return t; }

// ------------------------------------------------------------------ the quadtree
const N = 32, LEAF = 32;
export class Terrain {
  constructor(gfx, world, worker, arrays) {
    this.gfx = gfx; this.world = world; this.worker = worker;
    this.group = new THREE.Group(); gfx.scene.add(this.group);
    this.index = new THREE.BufferAttribute(terrainIndex(N), 1);
    this.mats = new Map(); for (const isl of world.islands) this.mats.set(isl, terrainMaterial(gfx, isl, arrays));
    this.seaMat = terrainMaterial(gfx, null, arrays);
    this.nodes = new Map(); this.pending = new Map(); this.inflight = 0; this.frame = 0;
    this.root = this.node(-32768, -32768, 65536, 0);
    worker.on('terrain', m => this.arrive(m));
    this.stats = { drawn: 0, ready: 0 };
  }
  node(x0, z0, size, level) {
    const key = level + ':' + x0 + ':' + z0; let n = this.nodes.get(key);
    if (!n) { n = { key, x0, z0, size, level, kids: null, mesh: null, state: 0, used: 0, ymin: -40, ymax: 200 }; this.nodes.set(key, n); }
    return n;
  }
  kids(n) {
    if (!n.kids) { const h = n.size / 2; n.kids = [this.node(n.x0, n.z0, h, n.level + 1), this.node(n.x0 + h, n.z0, h, n.level + 1), this.node(n.x0, n.z0 + h, h, n.level + 1), this.node(n.x0 + h, n.z0 + h, h, n.level + 1)]; }
    return n.kids;
  }
  // a node is worth drawing if it touches an island (open sea is just the water surface)
  useful(n) {
    for (const isl of this.world.islands) if (n.x0 < isl.x1 + 400 && n.x0 + n.size > isl.x0 - 400 && n.z0 < isl.z1 + 400 && n.z0 + n.size > isl.z0 - 400) return true;
    return false;
  }
  dist(n, c) {
    const dx = Math.max(n.x0 - c.x, 0, c.x - (n.x0 + n.size)), dz = Math.max(n.z0 - c.z, 0, c.z - (n.z0 + n.size));
    const dy = Math.max(n.ymin - c.y, 0, c.y - n.ymax);
    return Math.hypot(dx, dz, dy * 0.5);
  }
  update(cam) {
    this.frame++;
    this.want = [];
    for (const m of this.group.children) m.visible = false;
    let drawn = 0;
    const lodK = this.gfx.q.lod;
    const draw = n => { if (n.mesh) { n.mesh.visible = true; n.used = this.frame; drawn++; } };
    const drawable = n => n.state === 2 || (n.kids && n.kids.every(drawable));
    const visit = n => {
      if (!this.useful(n)) return;
      const split = n.size > LEAF && this.dist(n, cam) < n.size * lodK;
      if (split) {
        const K = this.kids(n);
        if (K.every(drawable)) { for (const k of K) visit(k); return; }
        for (const k of K) this.request(k, cam);
        if (n.state === 2) { draw(n); return; }
        this.request(n, cam);
        for (const k of K) visit(k);
      } else {
        if (n.state === 2) { draw(n); return; }
        this.request(n, cam);
        if (n.kids && n.kids.every(drawable)) for (const k of n.kids) visitAll(k);
      }
    };
    const visitAll = n => { if (n.state === 2) draw(n); else if (n.kids) n.kids.forEach(visitAll); };
    visit(this.root);
    this.stats.drawn = drawn;
    this.flush(cam);
    // free chunks nobody has drawn for a while
    if (this.frame % 120 === 0) for (const n of this.nodes.values()) if (n.mesh && this.frame - n.used > 600) { this.group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh = null; n.state = 0; }
  }
  request(n, cam) { if (n.state === 0 && !this.pending.has(n.key)) { this.pending.set(n.key, n); } }
  flush(cam) {
    if (this.inflight >= 6 || !this.pending.size) return;
    const list = [...this.pending.values()].sort((a, b) => (this.dist(a, cam) / a.size) - (this.dist(b, cam) / b.size) || a.size - b.size);
    for (const n of list) {
      if (this.inflight >= 6) break;
      this.pending.delete(n.key); n.state = 1; this.inflight++;
      this.worker.post({ type: 'terrain', id: n.key, x0: n.x0, z0: n.z0, size: n.size, n: N });
    }
  }
  arrive(m) {
    this.inflight--;
    const n = this.nodes.get(m.id); if (!n) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.N, 4, true));
    g.setIndex(this.index);
    n.ymin = m.ymin; n.ymax = m.ymax;
    g.boundingBox = new THREE.Box3(new THREE.Vector3(n.x0, m.ymin - 2, n.z0), new THREE.Vector3(n.x0 + n.size, m.ymax, n.z0 + n.size));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const cx = n.x0 + n.size / 2, cz = n.z0 + n.size / 2, isl = this.world.islands.find(i => cx >= i.x0 && cx <= i.x1 && cz >= i.z0 && cz <= i.z1);
    const mesh = new THREE.Mesh(g, isl ? this.mats.get(isl) : this.seaMat);
    mesh.receiveShadow = true; mesh.castShadow = n.size <= 128; mesh.matrixAutoUpdate = false; mesh.visible = false;
    n.mesh = mesh; n.state = 2; this.group.add(mesh);
  }
}
