// Regular grids of heights or land cover (world/<island>/*.bin.gz, made by tools/geo/*.py), and fast sampling.
// File: 'TRMG', uint32 header length, JSON header {nx,nz,x0,z0,cell,scale?,delta?}, then int16 (heights, each row as differences) or uint8.

export async function loadBytes(url) {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {   // Node (tests and tools)
    const fs = await import('fs'), zlib = await import('zlib'), path = await import('path');
    const p = url.startsWith('file:') ? new URL(url) : path.resolve(url);
    const raw = fs.readFileSync(p);
    return new Uint8Array(url.endsWith('.gz') ? zlib.gunzipSync(raw) : raw);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': ' + res.status);
  if (!url.endsWith('.gz')) return new Uint8Array(await res.arrayBuffer());
  const ds = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}
export async function loadJSON(url) {
  const b = await loadBytes(url);
  return JSON.parse(new TextDecoder().decode(b));
}

export function parseGrid(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'TRMG') throw new Error('not a TRMG grid');
  const hl = dv.getUint32(4, true), hdr = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hl))), off = 8 + hl;
  const n = hdr.nx * hdr.nz;
  let data;
  if (hdr.scale) {
    data = new Float32Array(n);
    const src = new Int16Array(bytes.buffer.slice(bytes.byteOffset + off, bytes.byteOffset + off + n * 2));
    for (let j = 0; j < hdr.nz; j++) {
      let acc = 0; const r = j * hdr.nx;
      for (let i = 0; i < hdr.nx; i++) { acc = hdr.delta ? acc + src[r + i] : src[r + i]; data[r + i] = acc * hdr.scale; }
    }
  } else data = bytes.slice(off, off + n);
  return new Grid(hdr, data);
}

export class Grid {
  constructor(h, data) {
    this.nx = h.nx; this.nz = h.nz; this.x0 = h.x0; this.z0 = h.z0; this.cell = h.cell; this.inv = 1 / h.cell; this.data = data;
    this.x1 = this.x0 + (this.nx - 1) * this.cell; this.z1 = this.z0 + (this.nz - 1) * this.cell;
  }
  inside(x, z, m = 0) { return x >= this.x0 + m && z >= this.z0 + m && x <= this.x1 - m && z <= this.z1 - m; }
  at(i, j) { i = i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i; j = j < 0 ? 0 : j >= this.nz ? this.nz - 1 : j; return this.data[j * this.nx + i]; }
  nearest(x, z) { return this.at(Math.round((x - this.x0) * this.inv), Math.round((z - this.z0) * this.inv)); }
  bilinear(x, z) {
    const fx = (x - this.x0) * this.inv, fz = (z - this.z0) * this.inv, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = this.at(i, j), b = this.at(i + 1, j), c = this.at(i, j + 1), d = this.at(i + 1, j + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  // Catmull-Rom: smooth between the points, so the 5 m grid does not show as facets under the wheels
  bicubic(x, z) {
    const fx = (x - this.x0) * this.inv, fz = (z - this.z0) * this.inv, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const row = jj => cr(this.at(i - 1, jj), this.at(i, jj), this.at(i + 1, jj), this.at(i + 2, jj), u);
    return cr(row(j - 1), row(j), row(j + 1), row(j + 2), v);
  }
}

// small, fast value noise (deterministic, for the ground detail and the scatter)
export function hash2(i, j, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, z, s = 0) {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, uu = u * u * (3 - 2 * u), vv = v * v * (3 - 2 * v);
  const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
  return (a + (b - a) * uu) * (1 - vv) + (c + (d - c) * uu) * vv;
}
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
