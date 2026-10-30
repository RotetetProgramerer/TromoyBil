// Geometry generators for the world: terrain chunks, road ribbons and buildings. Pure functions on a World (no three.js),
// run in the mesh worker (sim/render/worker.js) and testable in Node.

// ------------------------------------------------------------------ terrain
// A square chunk with (n+1)² vertices and a skirt round the edge (hides the cracks between levels of detail).
// Normals come from the heights one step outside the chunk too, so neighbouring chunks shade alike.
export function terrainChunk(world, x0, z0, size, n) {
  const st = size / n, m = n + 1, P = new Float32Array((m * m + 4 * m) * 3), N = new Int8Array((m * m + 4 * m) * 4);
  const h = new Float32Array((m + 2) * (m + 2));
  let ymin = 1e9, ymax = -1e9;
  for (let j = -1; j <= m; j++) for (let i = -1; i <= m; i++) {
    let y = world.height(x0 + i * st, z0 + j * st, true);     // the ground under bridges, not the decks
    // a coarse chunk (far away) would draw a straight triangle across a road cut and hide the road: pull the vertices beside a road
    // down towards it, so the road ribbon always shows (the dip is narrower than a pixel at that distance)
    if (st > 2.5) { const q = world.road(x0 + i * st, z0 + j * st); if (q && !q.bridge && q.y < y) { const k = Math.min(1, Math.max(0, (q.d - q.hw) / (st * 1.5))); y = q.y - 0.15 + (y - q.y + 0.15) * k; } }
    h[(j + 1) * (m + 2) + (i + 1)] = y;
  }
  const H = (i, j) => h[(j + 1) * (m + 2) + (i + 1)];
  let k = 0;
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++, k++) {
    const y = H(i, j); P[k * 3] = x0 + i * st; P[k * 3 + 1] = y; P[k * 3 + 2] = z0 + j * st;
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    const nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2 * st, l = Math.hypot(nx, ny, nz);
    N[k * 4] = nx / l * 127; N[k * 4 + 1] = ny / l * 127; N[k * 4 + 2] = nz / l * 127;
  }
  // skirts: a copy of each edge, pulled down
  const drop = Math.max(1.5, st * 0.8), edge = [];
  for (let i = 0; i < m; i++) edge.push(i);                       // north edge (j = 0)
  for (let j = 0; j < m; j++) edge.push(j * m + n);               // east edge
  for (let i = n; i >= 0; i--) edge.push(n * m + i);               // south edge
  for (let j = n; j >= 0; j--) edge.push(j * m);                   // west edge
  for (let e = 0; e < edge.length; e++, k++) {
    const s = edge[e]; P[k * 3] = P[s * 3]; P[k * 3 + 1] = P[s * 3 + 1] - drop; P[k * 3 + 2] = P[s * 3 + 2];
    N[k * 4] = N[s * 4]; N[k * 4 + 1] = N[s * 4 + 1]; N[k * 4 + 2] = N[s * 4 + 2];
  }
  return { P, N, ymin, ymax };
}
// the index buffer is the same for every chunk of the same resolution
export function terrainIndex(n) {
  const m = n + 1, I = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
    // alternate the diagonal so slopes look the same in every direction
    if ((i + j) & 1) I.push(a, c, b, b, c, d); else I.push(a, c, d, a, d, b);
  }
  const base = m * m, L = 4 * m;
  // the four edges in order, each followed by its skirt copy
  const edges = [[...Array(m).keys()], [...Array(m).keys()].map(j => j * m + n), [...Array(m).keys()].map(i => n * m + (n - i)), [...Array(m).keys()].map(j => (n - j) * m)];
  let off = 0;
  for (let e = 0; e < 4; e++) {
    const E = edges[e];
    for (let q = 0; q < m - 1; q++) {
      const a = E[q], b = E[q + 1], sa = base + off + q, sb = base + off + q + 1;
      I.push(a, sa, b, b, sa, sb);
    }
    off += m;
  }
  return Uint32Array.from(I);
}

// ------------------------------------------------------------------ roads
// Ribbons along every road segment in the box, draped on the same height function the car drives on.
// Attributes: position, uv (u: across 0..1, v: metres along), and a per-vertex "kind" (surface, class, marking flags).
export function roadTile(world, isl, x0, z0, size, detail = 1) {
  const R = isl.roads, out = { P: [], U: [], K: [], I: [] }, ox = isl.ox, oz = isl.oz;
  const lx0 = x0 - ox, lz0 = z0 - oz, lx1 = lx0 + size, lz1 = lz0 + size;
  const seen = new Set();
  for (let ri = 0; ri < R.roads.length; ri++) {
    const r = R.roads[ri], p = r.p, m = p.length / 3;
    // only the part of the road inside the tile (by the midpoint of each segment)
    let started = false, vbase = 0, along = 0;
    const step = detail;               // use every point (3 m) near, every 2nd/3rd further away
    for (let i = 0; i < m; i += 1) {
      const x = p[i * 3], z = p[i * 3 + 1];
      const nx = i < m - 1 ? p[i * 3 + 3] : x, nz = i < m - 1 ? p[i * 3 + 4] : z;
      const mx = (x + nx) / 2, mz = (z + nz) / 2, inside = mx >= lx0 && mx < lx1 && mz >= lz0 && mz < lz1;
      if (i > 0) along += Math.hypot(x - p[i * 3 - 3], z - p[i * 3 - 2]);
      if (!inside && !(started && i === m - 1)) { if (started) { started = false; } continue; }
      if (i % step && i !== m - 1 && started) continue;
      // direction from the neighbours
      const pi = Math.max(0, i - 1), ni = Math.min(m - 1, i + 1);
      let tx = p[ni * 3] - p[pi * 3], tz = p[ni * 3 + 1] - p[pi * 3 + 1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const w = (r.wv ? r.wv[i] : r.w) / 2, sx = -tz, sz = tx;            // left of the direction of travel
      const bridge = r.b && r.b.includes(i);
      // across the road: shoulder (gravel), the road surface in four strips (it follows the crown), shoulder
      const sh = r.c <= 5 && !bridge ? 0.7 / w : 0, cross = r.c <= 5 && !bridge ? [-1 - sh, -1, -0.5, 0, 0.5, 1, 1 + sh] : [-1, 0, 1];
      const vi = out.P.length / 3;
      for (const c of cross) {
        const px = x + sx * w * c + ox, pz = z + sz * w * c + oz;
        const y = bridge ? p[i * 3 + 2] : world.height(px, pz);
        out.P.push(px, y + 0.035 + (7 - r.c) * 0.005 - (Math.abs(c) > 1 ? 0.02 : 0), pz);
        out.U.push((c + 1) / 2, along);
        out.K.push(r.s, r.c, bridge ? 1 : 0, Math.round(w * 20));
      }
      if (started) {
        const nc = cross.length, a = vbase, b = vi;
        for (let q = 0; q < nc - 1; q++) out.I.push(a + q, a + q + 1, b + q, b + q, a + q + 1, b + q + 1);
      }
      vbase = vi; started = true;
    }
  }
  return { P: Float32Array.from(out.P), U: Float32Array.from(out.U), K: Uint8Array.from(out.K), I: Uint32Array.from(out.I) };
}

// ------------------------------------------------------------------ buildings
// Norwegian houses from the map's footprints: painted wooden walls (cladding), a stone plinth down to the ground, gabled roofs
// on houses, cabins, garages and barns, flat roofs on blocks and sheds; window and door rows are drawn by the facade shader from uv.
const WALL_COLS = { house: ['#f2efe6', '#e9e4d6', '#c43b2f', '#b5432f', '#e5c46a', '#7a8b8f', '#5a6e7a', '#f2efe6', '#d8d2c2', '#4a4a48'],
  barn: ['#a8332a', '#9a2e26', '#b5432f', '#e9e4d6'], boat: ['#a8332a', '#f2efe6', '#b5432f', '#e5c46a'], block: ['#d8d2c8', '#c8c0b4', '#e9e4d6', '#a9a39a'] };
const ROOF_COLS = ['#2a2a2a', '#3a3634', '#4a2f26', '#2f3a40', '#5a3a2a'];
export function buildingTile(isl, x0, z0, size, lod = 0) {
  const out = { P: [], N: [], U: [], C: [], M: [], I: [] }, ox = isl.ox, oz = isl.oz;
  const lx0 = x0 - ox, lz0 = z0 - oz;
  const push = (x, y, z, nx, ny, nz, u, v, col, mat) => { out.P.push(x + ox, y, z + oz); out.N.push(nx, ny, nz); out.U.push(u, v); out.C.push(col[0], col[1], col[2]); out.M.push(mat); return out.P.length / 3 - 1; };
  const quad = (a, b, c, d) => out.I.push(a, b, c, a, c, d);
  for (let bi = 0; bi < isl.buildings.length; bi++) {
    const b = isl.buildings[bi], o = b.obb;
    if (o.x < lx0 || o.x >= lx0 + size || o.z < lz0 || o.z >= lz0 + size) continue;
    const kind = b.k, seed = Math.abs(Math.sin(o.x * 12.9898 + o.z * 78.233) * 43758.5453) % 1;
    const fam = kind === 7 ? 'barn' : kind === 6 ? 'boat' : kind === 2 || kind === 8 || kind === 9 || kind === 10 ? 'block' : 'house';
    const wall = hex(WALL_COLS[fam][Math.floor(seed * WALL_COLS[fam].length)]), roofc = hex(ROOF_COLS[Math.floor(seed * 97) % ROOF_COLS.length]);
    const floorH = kind === 4 || kind === 5 ? 2.6 : kind === 7 ? 4.2 : kind === 8 ? 5 : 2.8;
    const floors = Math.max(1, b.f || 1), wallH = Math.min(30, floors * floorH + (kind === 7 ? 1.5 : 0.3));
    const pts = []; for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]]);
    if (signedArea(pts) < 0) pts.reverse();
    const base = b.y1 + 0.15, footY = b.y0 - 0.4, top = base + wallH;
    const flat = kind === 2 || kind === 8 || kind === 9 || kind === 10 || (b.rs === 'flat') || o.hw * o.hd * 4 > 600;
    // walls (and the plinth below them)
    let u = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length], ex = c[0] - a[0], ez = c[1] - a[1], L = Math.hypot(ex, ez); if (L < 0.05) continue;
      const nx = ez / L, nz = -ex / L;             // outward for a counter-clockwise ring (x east, z south)
      const g0 = push(a[0], footY, a[1], nx, 0, nz, u, -1, [0.42, 0.41, 0.39], 2), g1 = push(c[0], footY, c[1], nx, 0, nz, u + L, -1, [0.42, 0.41, 0.39], 2);
      const g2 = push(c[0], base, c[1], nx, 0, nz, u + L, 0, [0.42, 0.41, 0.39], 2), g3 = push(a[0], base, a[1], nx, 0, nz, u, 0, [0.42, 0.41, 0.39], 2);
      quad(g0, g1, g2, g3);
      const w0 = push(a[0], base, a[1], nx, 0, nz, u, 0, wall, kind === 2 || kind === 8 || kind === 9 ? 1 : 0), w1 = push(c[0], base, c[1], nx, 0, nz, u + L, 0, wall, kind === 2 || kind === 8 || kind === 9 ? 1 : 0);
      const w2 = push(c[0], top, c[1], nx, 0, nz, u + L, wallH, wall, kind === 2 || kind === 8 || kind === 9 ? 1 : 0), w3 = push(a[0], top, a[1], nx, 0, nz, u, wallH, wall, kind === 2 || kind === 8 || kind === 9 ? 1 : 0);
      quad(w0, w1, w2, w3);
      u += L;
    }
    // roof
    const ca = Math.cos(o.ang), sa = Math.sin(o.ang);
    const L = (a, b2) => [o.x + a * ca + b2 * sa, o.z - a * sa + b2 * ca];       // box frame → island (a along hw, b along hd)
    if (flat) {
      // a flat roof over the footprint, with a small parapet
      const c0 = pts.map(p => p), cy = top + 0.25;
      const cxm = c0.reduce((s, p) => s + p[0], 0) / c0.length, czm = c0.reduce((s, p) => s + p[1], 0) / c0.length;
      const cen = push(cxm, cy, czm, 0, 1, 0, cxm, czm, roofc, 4);
      const ring = c0.map(p => push(p[0], cy, p[1], 0, 1, 0, p[0], p[1], roofc, 4));
      for (let i = 0; i < ring.length; i++) out.I.push(cen, ring[(i + 1) % ring.length], ring[i]);
    } else {
      // gabled: the ridge along the long side of the box, eaves out over the walls
      const long = o.hw >= o.hd, A = (long ? o.hw : o.hd) + 0.35, Bw = (long ? o.hd : o.hw) + 0.45;
      const pitch = kind === 7 ? 0.75 : kind === 4 || kind === 5 ? 0.45 : 0.62, rh = Bw * pitch, ry = top + rh;
      const P = (s, t, y) => long ? L(s, t).concat(y) : L(t, s).concat(y);
      const e00 = P(-A, -Bw, top - 0.1), e10 = P(A, -Bw, top - 0.1), r0 = P(-A, 0, ry), r1 = P(A, 0, ry), e01 = P(-A, Bw, top - 0.1), e11 = P(A, Bw, top - 0.1);
      for (const [p0, p1, q0, q1, sgn] of [[e00, e10, r0, r1, -1], [e11, e01, r1, r0, 1]]) {
        const ux = p1[0] - p0[0], uz = p1[1] - p0[1], vx = q0[0] - p0[0], vy = q0[2] - p0[2], vz = q0[1] - p0[1];
        let nx = uz * vy - 0 * vz, ny = 0 * vx - ux * vy * 0 + (ux * vz - uz * vx) * 0, nz = 0;
        // normal of the slope: perpendicular to the ridge and tilted up
        const rx = long ? sa : ca, rz = long ? ca : -sa;            // the across-ridge direction in island space
        const nlen = Math.hypot(1, pitch);
        nx = rx * sgn * pitch / nlen; nz = rz * sgn * pitch / nlen; ny = 1 / nlen;
        const len = Math.hypot(ux, uz), sl = Bw * Math.hypot(1, pitch);
        const a0 = push(p0[0], p0[2], p0[1], nx, ny, nz, 0, 0, roofc, 3), a1 = push(p1[0], p1[2], p1[1], nx, ny, nz, len, 0, roofc, 3);
        const a2 = push(q1[0], q1[2], q1[1], nx, ny, nz, len, sl, roofc, 3), a3 = push(q0[0], q0[2], q0[1], nx, ny, nz, 0, sl, roofc, 3);
        quad(a0, a1, a2, a3);
      }
      // gable ends (triangles in the wall colour) from the wall tops up to the ridge
      for (const s of [-1, 1]) {
        const g0 = P(s * (A - 0.35), -Bw + 0.45, top), g1 = P(s * (A - 0.35), Bw - 0.45, top), g2 = P(s * (A - 0.35), 0, ry - 0.05);
        const nx = long ? ca * s : -sa * s, nz = long ? -sa * s : -ca * s;
        const t0 = push(g0[0], g0[2], g0[1], nx, 0, nz, 0, wallH, wall, 0), t1 = push(g1[0], g1[2], g1[1], nx, 0, nz, 2 * Bw, wallH, wall, 0), t2 = push(g2[0], g2[2], g2[1], nx, 0, nz, Bw, wallH + rh, wall, 0);
        if (s > 0) out.I.push(t0, t1, t2); else out.I.push(t1, t0, t2);
      }
      // a chimney on houses and cabins
      if ((kind === 0 || kind === 1 || kind === 3) && lod === 0) {
        const cx = (seed - 0.5) * A, cz = Bw * 0.3, c = long ? L(cx, cz) : L(cz, cx), cyb = top + (Bw - Math.abs(cz)) * pitch - 0.3, cyt = ry + 0.7;
        boxAt(push, quad, c[0], cyb, c[1], 0.35, cyt - cyb, 0.35, o.ang, [0.32, 0.3, 0.28], 2);
      }
    }
  }
  return { P: Float32Array.from(out.P), N: Float32Array.from(out.N), U: Float32Array.from(out.U), C: Float32Array.from(out.C), M: Uint8Array.from(out.M), I: Uint32Array.from(out.I) };
}
function boxAt(push, quad, x, y, z, hw, h, hd, ang, col, mat) {
  const c = Math.cos(ang), s = Math.sin(ang), P = (a, b) => [x + a * c + b * s, z - a * s + b * c];
  const corners = [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1, nx = ez / L, nz = -ex / L;
    quad(push(a[0], y, a[1], nx, 0, nz, 0, 0, col, mat), push(b[0], y, b[1], nx, 0, nz, L, 0, col, mat), push(b[0], y + h, b[1], nx, 0, nz, L, h, col, mat), push(a[0], y + h, a[1], nx, 0, nz, 0, h, col, mat));
  }
  quad(...corners.map(p => push(p[0], y + h, p[1], 0, 1, 0, p[0], p[1], col, mat)).reverse());
}
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
function hex(h) { const s = h.replace('#', ''); const c = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255); return c.map(v => Math.pow(v, 2.2)); }
