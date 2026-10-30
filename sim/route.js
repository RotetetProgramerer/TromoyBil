// Routes on an island's road network: a graph of the road points (3 m apart) with links where roads meet, and Dijkstra
// with a cost per road class and surface, so a gravel rally prefers gravel and a tarmac race the main roads.
export class RoadGraph {
  constructor(isl) {
    this.isl = isl; const roads = isl.roads.roads;
    const X = [], Z = [], RI = [], PI = []; this.adj = [];
    const add = (a, b, cost, ri) => { (this.adj[a] || (this.adj[a] = [])).push(b, cost, ri); (this.adj[b] || (this.adj[b] = [])).push(a, cost, ri); };
    roads.forEach((r, ri) => {
      const m = r.p.length / 3, base = X.length;
      for (let i = 0; i < m; i++) { X.push(r.p[i * 3]); Z.push(r.p[i * 3 + 1]); RI.push(ri); PI.push(i); }
      for (let i = 0; i < m - 1; i++) add(base + i, base + i + 1, Math.hypot(r.p[i * 3 + 3] - r.p[i * 3], r.p[i * 3 + 4] - r.p[i * 3 + 1]), ri);
    });
    this.X = Float64Array.from(X); this.Z = Float64Array.from(Z); this.RI = Int32Array.from(RI); this.PI = Int32Array.from(PI);
    // where roads meet: link points of different roads that lie within 2.2 m of each other
    const cell = new Map(), key = (x, z) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
    for (let i = 0; i < this.X.length; i++) { const k = key(this.X[i], this.Z[i]); (cell.get(k) || cell.set(k, []).get(k)).push(i); }
    for (let i = 0; i < this.X.length; i++) {
      const cx = Math.floor(this.X[i] / 4), cz = Math.floor(this.Z[i] / 4);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const j of cell.get((cx + dx) * 100003 + cz + dz) || []) {
        if (j <= i || this.RI[j] === this.RI[i]) continue;
        const d = Math.hypot(this.X[i] - this.X[j], this.Z[i] - this.Z[j]);
        if (d < 2.2) add(i, j, d + 0.5, -1);
      }
    }
    this.cell = cell;
  }
  nearest(x, z, filter) {
    let best = -1, bd = 1e18;
    for (let i = 0; i < this.X.length; i++) { const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2; if (d < bd && (!filter || filter(this.isl.roads.roads[this.RI[i]]))) { bd = d; best = i; } }
    return best;
  }
  // weight(road) → cost factor per metre (Infinity = never)
  path(a, b, weight) {
    const n = this.X.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), roads = this.isl.roads.roads;
    const heap = [[0, a]]; dist[a] = 0;
    const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    while (heap.length) {
      const [d, i] = pop(); if (d > dist[i]) continue; if (i === b) break;
      const A = this.adj[i]; if (!A) continue;
      for (let q = 0; q < A.length; q += 3) {
        const j = A[q], w = A[q + 2] < 0 ? 1 : weight(roads[A[q + 2]]); if (!isFinite(w)) continue;
        const nd = d + A[q + 1] * w; if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(nd, j); }
      }
    }
    if (!isFinite(dist[b])) return null;
    const out = []; for (let i = b; i >= 0; i = prev[i]) out.push(i); out.reverse();
    return out;
  }
}

// a course through waypoints: the route, gates every `spacing` metres and the start (position and heading)
export function buildCourse(graph, def) {
  const W0 = def.weight || (() => 1), W = def.road ? r => W0(r) * (r.n === def.road ? 0.45 : 1) : W0, pts = [];
  // a via point is [x, z], or {road, t}: the point a fraction t along all the parts of the road with that name
  const ok = def.filter || (r => isFinite(W(r)));       // snap to roads the course may use
  const at = v => {
    if (Array.isArray(v)) return graph.nearest(v[0], v[1], ok);
    const parts = graph.isl.roads.roads.filter(r => r.n === v.road); let tot = 0; for (const r of parts) tot += r.len;
    let s = tot * v.t; for (const r of parts) { if (s <= r.len) { const m = r.p.length / 3, i = Math.min(m - 1, Math.round(s / r.len * (m - 1))); return graph.nearest(r.p[i * 3], r.p[i * 3 + 1], ok); } s -= r.len; }
    return graph.nearest(parts[0].p[0], parts[0].p[1]);
  };
  let cur = at(def.via[0]);
  for (let k = 1; k < def.via.length; k++) {
    const nx = at(def.via[k]), p = graph.path(cur, nx, W);
    if (!p) return null;
    for (const i of (pts.length ? p.slice(1) : p)) pts.push(i);
    cur = nx;
  }
  const P = pts.map(i => [graph.X[i], graph.Z[i]]);
  // drop doubled-back stubs (a junction link back and forth)
  const line = [P[0]]; for (let i = 1; i < P.length; i++) { const a = line[line.length - 1]; if (Math.hypot(P[i][0] - a[0], P[i][1] - a[1]) > 0.5) line.push(P[i]); }
  let len = 0; const cum = [0]; for (let i = 1; i < line.length; i++) { len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); cum.push(len); }
  const sp = def.spacing || Math.max(180, Math.min(450, len / (def.gates || 10))), gates = [];
  for (let s = sp; s < len - sp * 0.4; s += sp) { const i = cum.findIndex(c => c >= s); gates.push(line[i]); }
  gates.push(line[line.length - 1]);
  const h = Math.atan2(line[Math.min(3, line.length - 1)][0] - line[0][0], line[Math.min(3, line.length - 1)][1] - line[0][1]);
  return { id: def.id, name: def.name, desc: def.desc, diff: def.diff, kind: def.kind, night: !!def.night, len: Math.round(len), line, gates, start: { x: line[0][0], z: line[0][1], h } };
}
