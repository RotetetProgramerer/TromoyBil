// A minimal glTF 2.0 binary (.glb) writer: a node tree with names and translation/rotation, one mesh per node with one
// primitive per material (POSITION, NORMAL, TEXCOORD_0, indices) and PBR metallic-roughness materials. No textures.
import { writeFileSync } from 'node:fs';

// triangles of one node, collected per material
export class MeshData {
  constructor() { this.prims = new Map(); }
  prim(mat) { let p = this.prims.get(mat); if (!p) this.prims.set(mat, p = { P: [], N: [], T: [], I: [] }); return p; }
  // P, N: flat xyz; T: flat uv or null (then projected from the position); I: indices into P. flip reverses the winding.
  add(mat, P, N, T, I, flip = false) {
    const p = this.prim(mat), o = p.P.length / 3, n = P.length / 3;
    for (let i = 0; i < P.length; i++) { p.P.push(P[i]); p.N.push(N[i]); }
    for (let i = 0; i < n; i++) {
      if (T) { p.T.push(T[i * 2], T[i * 2 + 1]); continue; }
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ax = Math.abs(N[i * 3]), ay = Math.abs(N[i * 3 + 1]), az = Math.abs(N[i * 3 + 2]);
      if (ay >= ax && ay >= az) p.T.push(x, z); else if (ax >= az) p.T.push(z, y); else p.T.push(x, y);
    }
    for (let i = 0; i < I.length; i += 3) {
      if (flip) p.I.push(I[i] + o, I[i + 2] + o, I[i + 1] + o); else p.I.push(I[i] + o, I[i + 1] + o, I[i + 2] + o);
    }
  }
  // a copy mirrored in x (x → −x)
  mirrored() {
    const o = new MeshData();
    for (const [m, p] of this.prims) {
      const P = p.P.slice(), N = p.N.slice();
      for (let i = 0; i < P.length; i += 3) { P[i] = -P[i]; N[i] = -N[i]; }
      o.add(m, P, N, p.T, p.I, true);
    }
    return o;
  }
  // add the mirror image of everything (the other half of a symmetric part)
  mirrorX() { return this.merge(this.mirrored()); }
  merge(o) { for (const [m, p] of [...o.prims]) this.add(m, p.P, p.N, p.T, p.I); return this; }
  get tris() { let n = 0; for (const p of this.prims.values()) n += p.I.length / 3; return n; }
}

// nodes: { name, t: [x,y,z], r: [x,y,z,w], mesh: MeshData, extras: {…}, children: [...] }; materials: { name: glTF material JSON }
export function writeGLB(file, root, materials) {
  const json = { asset: { version: '2.0', generator: 'TromøyBil tools/build-cars.mjs' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const bins = []; let len = 0;
  const view = (arr, target) => {
    const pad = (4 - len % 4) % 4; if (pad) { bins.push(Buffer.alloc(pad)); len += pad; }
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    json.bufferViews.push({ buffer: 0, byteOffset: len, byteLength: b.length, target }); bins.push(b); len += b.length;
    return json.bufferViews.length - 1;
  };
  const accessor = (arr, type, comp, target, mm) => {
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type], a = { bufferView: view(arr, target), componentType: comp, count: arr.length / n, type };
    if (mm) { const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9]; for (let i = 0; i < arr.length; i++) { const k = i % 3; min[k] = Math.min(min[k], arr[i]); max[k] = Math.max(max[k], arr[i]); } a.min = min; a.max = max; }
    json.accessors.push(a); return json.accessors.length - 1;
  };
  const matIdx = new Map();
  const material = name => {
    if (!matIdx.has(name)) { if (!materials[name]) throw new Error('unknown material ' + name); matIdx.set(name, json.materials.length); json.materials.push({ name, ...materials[name] }); }
    return matIdx.get(name);
  };
  const mesh = (md, name) => {
    const prims = [];
    for (const [m, p] of md.prims) {
      if (!p.I.length) continue;
      const N = new Float32Array(p.N);
      for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; if (l === 1 && !N[i] && !N[i + 1] && !N[i + 2]) N[i + 1] = 1; }
      const nv = p.P.length / 3, I = nv < 65535 ? new Uint16Array(p.I) : new Uint32Array(p.I);
      prims.push({ attributes: { POSITION: accessor(new Float32Array(p.P), 'VEC3', 5126, 34962, true), NORMAL: accessor(N, 'VEC3', 5126, 34962),
        TEXCOORD_0: accessor(new Float32Array(p.T), 'VEC2', 5126, 34962) }, indices: accessor(I, 'SCALAR', nv < 65535 ? 5123 : 5125, 34963), material: material(m), mode: 4 });
    }
    if (!prims.length) return undefined;
    json.meshes.push({ name, primitives: prims }); return json.meshes.length - 1;
  };
  const node = n => {
    const o = { name: n.name }, i = json.nodes.length; json.nodes.push(o);
    if (n.t) o.translation = n.t.map(v => +v.toFixed(5));
    if (n.r) o.rotation = n.r.map(v => +v.toFixed(6));
    if (n.mesh) { const m = mesh(n.mesh, n.name); if (m !== undefined) o.mesh = m; }
    if (n.extras) o.extras = n.extras;
    if (n.children && n.children.length) o.children = n.children.map(node);
    return i;
  };
  node(root);
  const pad4 = (b, fill) => { const p = (4 - b.length % 4) % 4; return p ? Buffer.concat([b, Buffer.alloc(p, fill)]) : b; };
  const bin = pad4(Buffer.concat(bins), 0);
  json.buffers.push({ byteLength: bin.length });
  const jb = pad4(Buffer.from(JSON.stringify(json)), 0x20);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bin.length, 8);
  const ch = (b, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.writeUInt32LE(t, 4); return Buffer.concat([h, b]); };
  const out = Buffer.concat([head, ch(jb, 0x4E4F534A), ch(bin, 0x004E4942)]);
  writeFileSync(file, out);
  return out.length;
}

// read a .glb back: { json, bin } (for tools/check-cars.mjs and tests)
export function readGLB(buf) {
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bl = buf.readUInt32LE(20 + jl), bin = buf.subarray(28 + jl, 28 + jl + bl);
  return { json, bin };
}
