// Roads and buildings round the camera, in tiles of 256 m that the mesh worker builds (sim/render/meshgen.js).
// Near tiles get every detail; far tiles are simpler, and tiles beyond the view distance are freed.
import * as THREE from 'three';
import { prep, U } from './gfx.js';
import { LAYERS } from './terrain.js';

const TILE = 256;
const LA = Object.fromEntries(LAYERS.map((n, i) => [n, i]));

// ------------------------------------------------------------------ road material
// asphalt with a yellow dashed centre line and white edge lines (Norwegian markings), gravel with wheel tracks, tracks with grass
// in the middle; shoulders of gravel. kind = (surface 0 asphalt | 1 gravel | 2 cobbles | 3 dirt, class, bridge, half width × 20)
export function roadMaterial(gfx, arrays) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const uni = { tA: { value: arrays.A }, tN: { value: arrays.N } };
  const patch = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'attribute vec4 kind; varying vec4 vKind; varying vec2 vRUv; varying vec3 vRPos;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vKind = kind; vRUv = uv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vRPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = `uniform mediump sampler2DArray tA; uniform mediump sampler2DArray tN; uniform float uWet; uniform float uNight;
varying vec4 vKind; varying vec2 vRUv; varying vec3 vRPos;
float rh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
` + sh.fragmentShader.replace('#include <map_fragment>', `
  int surf = int(vKind.x + 0.5), cls = int(vKind.y + 0.5); float hw = vKind.w / 20.0; bool bridge = vKind.z > 0.5;
  float u = vRUv.x, along = vRUv.y, across = (u - 0.5) * 2.0 * hw;   // metres from the middle
  vec2 tuv = vec2(across, along) / 3.4;
  float layer = surf == 0 ? ${LA.asphalt}.0 : surf == 1 ? ${LA.gravel}.0 : surf == 2 ? ${LA.gravel}.0 : ${LA.dirt}.0;
  bool shoulder = u < 0.0 || u > 1.0;
  if (shoulder) layer = ${LA.gravel}.0;
  vec4 A = texture(tA, vec3(tuv, layer)), Nn = texture(tN, vec3(tuv, layer));
  // gravel roads: two worn wheel tracks; tracks: grass between them
  if (!shoulder && surf != 0) {
    float tr = 1.0 - smoothstep(0.05, 0.35, abs(abs(across) - min(0.85, hw * 0.45)));
    vec4 D = texture(tA, vec3(tuv * 1.3, ${LA.dirt}.0)); A = mix(A, D, tr * 0.5);
    if (cls >= 6) { vec4 G = texture(tA, vec3(tuv, ${LA.grass}.0)); A = mix(A, G, (1.0 - smoothstep(0.15, 0.45, abs(across))) * 0.85); }
  }
  // asphalt: patches, darker where the wheels run, markings
  vec3 col = A.rgb; float rough = Nn.b;
  if (surf == 0 && !shoulder) {
    float lane = (1.0 - smoothstep(0.0, 0.5, abs(abs(across) - hw * 0.5))) * 0.08; col *= 1.0 - lane;
    float lw = 0.1, edgeOff = hw - 0.25;
    if (cls <= 4 && hw > 2.2) {
      float edge = 1.0 - smoothstep(lw * 0.5, lw * 0.5 + 0.02, abs(abs(across) - edgeOff));
      col = mix(col, vec3(0.82, 0.82, 0.78), edge * 0.9); rough = mix(rough, 0.5, edge);
    }
    if (cls <= 4 && hw > 2.7) {
      float dash = step(fract(along / 12.0), 0.25) * (1.0 - smoothstep(0.05, 0.07, abs(across)));
      col = mix(col, vec3(0.78, 0.6, 0.12), dash * 0.9); rough = mix(rough, 0.5, dash);
    }
  }
  if (bridge && surf != 0) col = vec3(0.32, 0.24, 0.16) * (0.85 + 0.3 * rh(floor(vec2(along * 3.0, 0.0))));
  float wet = uWet; col *= 1.0 - 0.3 * wet; rough = mix(rough, 0.12, wet * 0.85);
  // fade the edge of the shoulder into the ground
  float fadeEdge = shoulder ? 1.0 - smoothstep(0.0, 1.0, (abs(across) - hw) / 0.7) : 1.0;
  diffuseColor = vec4(col, 1.0);
  float roadRough = rough; vec3 roadN = vec3(Nn.r * 2.0 - 1.0, 0.0, Nn.g * 2.0 - 1.0);
  if (fadeEdge < 0.5 && rh(gl_FragCoord.xy) > fadeEdge * 2.0) discard;
`).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roadRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(normalize(vec3(0.0, 1.0, 0.0) + roadN * 0.5), 0.0)).xyz);');
  };
  patch.key = 'road';
  prep(mat, patch); gfx.shadowed(mat);
  return mat;
}

// ------------------------------------------------------------------ building material
// mat: 0 painted wooden cladding, 1 rendered block, 2 stone plinth, 3 roof tiles, 4 flat roof. Windows come from uv (u along the
// wall, v up from the floor): a row per floor, frames in white, glass that reflects the sky and lights up at night.
export function buildingMaterial(gfx, bArr) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, vertexColors: true });
  const uni = { tB: { value: bArr.A }, tBN: { value: bArr.N } };
  const patch = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'attribute float bmat; varying float vMat; varying vec2 vBUv; varying vec3 vBPos;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMat = bmat; vBUv = uv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vBPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = `uniform mediump sampler2DArray tB; uniform mediump sampler2DArray tBN; uniform float uNight; uniform float uWet;
varying float vMat; varying vec2 vBUv; varying vec3 vBPos;
float bh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
` + sh.fragmentShader.replace('#include <map_fragment>', `
  int m = int(vMat + 0.5); vec2 buv = vBUv; float glass = 0.0, frame = 0.0, lit = 0.0;
  vec4 A, Nn;
  if (m <= 1) {
    A = texture(tB, vec3(buv / vec2(m == 0 ? 2.2 : 3.0, 2.2), float(m))); Nn = texture(tBN, vec3(buv / vec2(m == 0 ? 2.2 : 3.0, 2.2), float(m)));
    // windows: cells 2.6 m wide per floor of 2.8 m; a window 1.1 × 1.2 m in each cell (some cells left blank)
    float fl = floor(buv.y / 2.8), fy = buv.y - fl * 2.8, cell = floor(buv.x / 2.6), fx = buv.x - cell * 2.6;
    float pick = bh(vec2(cell, fl) + floor(vBPos.xz * 0.05));
    if (buv.y > 0.6 && pick > 0.28) {
      float wx = abs(fx - 1.3), wy = abs(fy - 1.45);
      float inW = step(wx, 0.55) * step(wy, 0.6), inF = step(wx, 0.65) * step(wy, 0.7);
      frame = inF - inW; glass = inW;
      lit = glass * step(0.55, bh(vec2(cell * 3.1, fl * 7.7) + floor(vBPos.xz))) ;
    }
  } else { A = texture(tB, vec3(buv / 2.5, float(m))); Nn = texture(tBN, vec3(buv / 2.5, float(m))); }
  vec3 col = A.rgb * (m <= 1 ? vColor : m == 3 || m == 4 ? vColor * 2.2 : vec3(1.0));
  col = mix(col, vec3(0.92, 0.92, 0.9), frame);
  col = mix(col, vec3(0.04, 0.05, 0.06), glass);
  diffuseColor = vec4(col, 1.0);
  float bRough = mix(mix(Nn.b, 0.5, frame), 0.06, glass);
  vec3 bEmis = vec3(1.0, 0.72, 0.42) * lit * uNight * 2.2;
`).replace('#include <color_fragment>', '')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += bEmis;');
  };
  patch.key = 'building';
  prep(mat, patch); gfx.shadowed(mat);
  return mat;
}

export class Features {
  constructor(gfx, world, worker, mats) {
    this.gfx = gfx; this.world = world; this.worker = worker; this.mats = mats;
    this.group = new THREE.Group(); gfx.scene.add(this.group);
    this.tiles = new Map(); this.inflight = 0; this.frame = 0;
    worker.on('roads', m => this.arrive(m)); worker.on('buildings', m => this.arrive(m));
  }
  key(kind, i, j, lod) { return kind + ':' + i + ':' + j + ':' + lod; }
  update(cam) {
    this.frame++;
    if (this.frame % 10) { this.flush(cam); return; }
    const Q = this.gfx.q, R = { roads: Q.far * 0.22, buildings: Q.far * 0.28 };
    const want = new Map();
    for (const kind of ['roads', 'buildings']) {
      const r = R[kind], i0 = Math.floor((cam.x - r) / TILE), i1 = Math.floor((cam.x + r) / TILE), j0 = Math.floor((cam.z - r) / TILE), j1 = Math.floor((cam.z + r) / TILE);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cx = (i + 0.5) * TILE, cz = (j + 0.5) * TILE, d = Math.hypot(cx - cam.x, cz - cam.z);
        if (d > r + TILE * 0.7) continue;
        if (!this.world.islands.some(isl => cx > isl.x0 - TILE && cx < isl.x1 + TILE && cz > isl.z0 - TILE && cz < isl.z1 + TILE)) continue;
        const lod = kind === 'roads' ? (d < 500 ? 1 : d < 1400 ? 2 : 4) : (d < 700 ? 0 : 1);
        want.set(this.key(kind, i, j, lod), { kind, i, j, lod, d });
      }
    }
    // keep what is wanted; a tile whose level of detail changed stays until its replacement has arrived
    for (const [k, t] of this.tiles) {
      if (want.has(k)) { t.used = this.frame; continue; }
      const alt = [...want.values()].find(w => w.kind === t.kind && w.i === t.i && w.j === t.j);
      if (alt) { const nk = this.key(alt.kind, alt.i, alt.j, alt.lod); const n = this.tiles.get(nk); if (n && n.state === 2) this.drop(k, t); }
      else this.drop(k, t);
    }
    for (const [k, w] of want) if (!this.tiles.has(k)) this.tiles.set(k, Object.assign(w, { state: 0, mesh: null, used: this.frame }));
    this.flush(cam);
  }
  drop(k, t) { if (t.mesh) { this.group.remove(t.mesh); t.mesh.traverse(o => o.geometry && o.geometry.dispose()); } this.tiles.delete(k); }
  flush(cam) {
    if (this.inflight >= 4) return;
    const list = [...this.tiles.values()].filter(t => t.state === 0).sort((a, b) => a.d - b.d);
    for (const t of list) {
      if (this.inflight >= 4) break;
      t.state = 1; this.inflight++;
      this.worker.post({ type: t.kind, id: this.key(t.kind, t.i, t.j, t.lod), x0: t.i * TILE, z0: t.j * TILE, size: TILE, detail: t.lod, lod: t.lod });
    }
  }
  arrive(m) {
    this.inflight--;
    const t = this.tiles.get(m.id); if (!t) return;
    const grp = new THREE.Group();
    for (const p of m.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.P, 3));
      if (m.type === 'roads') {
        g.setAttribute('uv', new THREE.BufferAttribute(p.U, 2));
        g.setAttribute('kind', new THREE.BufferAttribute(p.K, 4));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(p.P.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
        g.setIndex(new THREE.BufferAttribute(p.I, 1));
        const mesh = new THREE.Mesh(g, this.mats.road); mesh.receiveShadow = true; mesh.renderOrder = 1; grp.add(mesh);
      } else {
        g.setAttribute('normal', new THREE.BufferAttribute(p.N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(p.U, 2));
        g.setAttribute('color', new THREE.BufferAttribute(p.C, 3)); g.setAttribute('bmat', new THREE.BufferAttribute(p.M, 1));
        g.setIndex(new THREE.BufferAttribute(p.I, 1));
        const mesh = new THREE.Mesh(g, this.mats.building); mesh.castShadow = t.lod === 0; mesh.receiveShadow = true; grp.add(mesh);
      }
      g.computeBoundingSphere();
    }
    t.mesh = grp; t.state = 2; this.group.add(grp);
    // the old level of detail of the same tile can go now
    for (const [k, o] of this.tiles) if (o !== t && o.kind === t.kind && o.i === t.i && o.j === t.j && o.state === 2) this.drop(k, o);
  }
}
