// The alpine skier at real scale, in SI units (no three.js, no DOM: the game and tools/test-ski.mjs both run it). An 80 kg skier on
// two giant-slalom skis on the snow of game.world: gravity along the slope, snow friction and air drag (much less in a tuck), and the
// edges. The skis point where the legs steer them; a tipped ski bends round its sidecut (R = Rsc·cos θ, about 17 m at full edge) and
// carries the speed round the arc without loss as long as the turn is no tighter than that and the edges hold the pull. Steer harder
// and the skis pivot past the way you move: the snow scrapes sideways on the edges, which both turns and brakes (a skid). The plough
// and the hockey stop are such skids on purpose. In the air the skier flies and can spin; a landing across the way, or too hard,
// is a wobble or a crash. Trees, houses and lift towers are game.world's colliders.
// Also the ski area of an island (SkiArea: the pistes of features.special with their gates, the groomed snow, kickers on the jump
// piste, the chairlift's loop) and a timed run down a piste (SkiRun: gates, misses, the finish).
import { V3, clamp, smoothstep } from './math.js';
import { SURF } from './surfaces.js';

export const SKI = {
  g: 9.81, m: 80, rho: 1.3, cdaUp: 0.6, cdaTuck: 0.25,                          // cold air; frontal area × drag coefficient upright and tucked
  mu: { groomed: 0.04, packed: 0.05, ice: 0.03, deep: 0.08, rock: 0.3 },       // snow friction (deep snow also ploughs, see dec below)
  side: { groomed: 0.75, packed: 0.7, ice: 0.25, deep: 0.65, rock: 0.5 },       // how hard an edged ski scrapes sideways (part of g)
  hold: { groomed: 26, packed: 20, ice: 8, deep: 14, rock: 5 },                  // m/s²: the pull the edges carry round an arc before they let go
  Rsc: 36, edgeMax: 62 * Math.PI / 180,                                          // GS ski: sidecut radius, highest edge angle (R ≈ 17 m)
  aLat: 14, pivot: 2.4,                                                          // the sideways pull a good skier asks for (1.4 g); twisting the skis when slow (rad/s)
  P: 300, F: 130,                                                                // poling and skating: power (W) and largest push (N), on average over the strokes
  r: 0.3, hop: 2.0, pop: 1.2,                                                    // body radius against trees; a hop (m/s up), or a pop at a kicker's lip
};
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const LAYER = 0.14;                // the groomed snow lies this much over the island's ground (and over its small bumps)
const _n = new V3(), _a = new V3(), _g = { x: 0, z: 0 };
export const PISTE_COL = { green: '#2e9a3a', blue: '#2f6fd6', red: '#d9432f', black: '#1d1c1a' };
export const PISTE_DIFF = { green: 'Grønn', blue: 'Blå', red: 'Rød', black: 'Svart' };
const DESC = { fri: 'Lang og slak familiebakke ned mot dalen, fire porter.', slalom: 'Storslalåm: åtte porter, annenhver rød og blå. Bom gir 5 s straff.',
  utfor: 'Utfor med lange, raske svinger. Hockeystilling på slettene.', hopp: 'Bratt bakke med tre hopp. Snurr 360° i lufta og land rett for poeng.' };
// three stars at this average speed down the line (km/h), two at 80 % of it; the jump piste gives stars for points
const PACE = { fri: 34, slalom: 46, utfor: 62, hopp: 50 };

// ---------------------------------------------------------------- the ski area
// isl: the island (features.special has pistes {id,name,kind,color,hw,p:[x,z,y …] from top to bottom, gates:[[x,z] …]} and the lift)
export class SkiArea {
  constructor(world, isl) {
    this.world = world; this.isl = isl; const sp = isl.feat.special || {}, ox = isl.ox, oz = isl.oz;
    this.cells = new Map(); this.kickers = [];
    this.pistes = (sp.pistes || []).map(p => this.prepPiste(p, ox, oz));
    this.ice = (sp.ice || []).map(e => { const p = []; for (let i = 0; i < e.p.length; i += 2) p.push(e.p[i] + ox, e.p[i + 1] + oz); return { y: e.y, p }; });
    this.lift = sp.lift ? liftLoop(sp.lift, ox, oz) : null;
    for (const k of this.pistes) this.shortcut(k);
    for (const k of this.pistes) k.segs.forEach((s, i) => this.index(k, i, s));
    this.addMasts();
  }
  // floodlight masts beside the pistes, a mast every 60 m on alternate sides (they are lit at night, and they are in the way)
  addMasts() {
    const M = this.masts = [], isl = this.isl;
    for (const k of this.pistes) for (const sg of [{ L: k.L, hw: k.hw }, ...k.links.map(l => ({ L: [l.a, l.b], hw: 12 }))]) {
      let next = 25, d = 0, side = 1;
      for (let i = 0; i + 1 < sg.L.length; i++) { const a = sg.L[i], b = sg.L[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
        for (; next <= d + l; next += 60) { const f = (next - d) / l, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, tx = (b.x - a.x) / l, tz = (b.z - a.z) / l, mx = x + tz * side * (sg.hw + 2.5), mz = z - tx * side * (sg.hw + 2.5), pi = this.piste(mx, mz);
          side = -side; if (pi && pi.m > -1) continue;
          M.push({ x: mx, z: mz, y: this.world.height(mx, mz), ang: Math.atan2(x - mx, z - mz) }); if (isl && isl.addCollider) isl.addCollider({ x: mx, z: mz, r: 0.16, kind: 'post' }); }
        d += l; }
    }
  }
  prepPiste(p, ox, oz) {
    const L = []; for (let i = 0; i < p.p.length; i += 3) L.push({ x: p.p[i] + ox, z: p.p[i + 1] + oz, y: p.p[i + 2], s: 0 });
    for (let i = 1; i < L.length; i++) L[i].s = L[i - 1].s + Math.hypot(L[i].x - L[i - 1].x, L[i].z - L[i - 1].z);
    const k = { id: p.id, name: p.name, kind: p.kind, color: p.color, col: PISTE_COL[p.color] || '#2f6fd6', diff: PISTE_DIFF[p.color] || '', hw: p.hw, L, len: L[L.length - 1].s, key: 'ski/' + p.id, desc: DESC[p.kind] || '', segs: [] };
    for (let i = 0; i + 1 < L.length; i++) k.segs.push({ a: L[i], b: L[i + 1], hw: p.hw });
    // the gates where sim/render/special.js draws their poles: across the line a little before the gate; the last one is the finish
    const raw = p.gates || [], LL = L.map(q => [q.x - ox, q.z - oz]);
    k.gates = raw.map((g, i) => {
      const fin = i === raw.length - 1, j = Math.min(LL.length - 2, LL.findIndex(q => Math.hypot(q[0] - g[0], q[1] - g[1]) < 25) + 1 || 1), a = LL[Math.max(0, j - 1)], b = LL[j];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l, w = fin ? p.hw : p.kind === 'slalom' ? 5 : Math.min(14, p.hw * 0.7);
      const x = g[0] + ox, z = g[1] + oz;
      return { i, x, z, w, nx, nz, tx: -nz, tz: nx, a: { x: x + nx * w, z: z + nz * w }, b: { x: x - nx * w, z: z - nz * w }, finish: fin, s: this.sOn(k, x, z).s,
        col: fin ? '#d9432f' : p.kind === 'slalom' ? (i % 2 ? '#2f6fd6' : '#d9432f') : k.col };
    });
    const t0 = this.T(k, 2); k.start = { x: L[0].x, z: L[0].z, h: Math.atan2(t0.x, t0.z) };
    if (k.kind === 'hopp') { k.par = [650, 300]; k.points = true; this.addKickers(k); }
    return k;
  }
  // three kickers down the jump piste: a curved ramp 1.1 m high over 10 m (the lip 12° steeper than the slope), then the snow falls away
  addKickers(k) {
    const at = [0.21, 0.52, 0.85].map(f => f * k.len).filter(s => k.gates.every(g => Math.abs(g.s - s) > 45));
    for (const s of at) { const P = this.P(k, s), T = this.T(k, s); this.kickers.push({ k, s, x: P.x, z: P.z, tx: T.x, tz: T.z, len: 10, H: 1.1, w: 4.5, back: 3 }); }
  }
  // the line through a loop: where the piste wanders off and comes back lower down close by (Familiebakken goes down into a valley
  // and climbs 40 m out of it), a straight groomed link from one leg to the other, as long as it does not skip a gate
  shortcut(k) {
    const L = k.L, W = this.world; k.links = []; let best = null;
    for (let i = 0; i < L.length; i += 3) for (let j = i + 6; j < L.length; j += 2) {
      const a = L[i], b = L[j], d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > 300 || b.s - a.s < 3 * d || b.y > a.y - 2 || k.gates.some(g => g.s > a.s + 1 && g.s < b.s - 1)) continue;
      if (best && b.s - a.s - d <= best.gain) continue;
      let ok = true; for (let t = 0; t <= 1 && ok; t += 3 / d) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (W.height(x, z) - (a.y + (b.y - a.y) * t) > 3.5) ok = false; else for (const c of W.colliders(x, z, 8)) if (c.r != null && Math.hypot(c.x - x, c.z - z) < c.r + 7) { ok = false; break; } }
      if (ok) best = { a, b, gain: b.s - a.s - d };
    }
    if (best) { k.links.push({ s0: best.a.s, s1: best.b.s, a: best.a, b: best.b }); k.segs.push({ a: best.a, b: best.b, hw: 12, link: true }); }
    // the stars: the pace down the line you can ski (through the link)
    k.runLen = k.len - (best ? best.gain : 0);
    if (!k.points) k.par = [Math.round(k.runLen / (PACE[k.kind] / 3.6)), Math.round(k.runLen / (PACE[k.kind] / 3.6 * 0.8))];
  }
  index(k, i, sg) {
    const r = sg.hw + 4, x0 = Math.min(sg.a.x, sg.b.x) - r, x1 = Math.max(sg.a.x, sg.b.x) + r, z0 = Math.min(sg.a.z, sg.b.z) - r, z1 = Math.max(sg.a.z, sg.b.z) + r;
    for (let cj = Math.floor(z0 / 32); cj <= Math.floor(z1 / 32); cj++) for (let ci = Math.floor(x0 / 32); ci <= Math.floor(x1 / 32); ci++) { const key = ci * 73856093 ^ cj * 19349663; let c = this.cells.get(key); if (!c) this.cells.set(key, c = []); c.push([k, sg]); }
  }
  // a point at s metres down a piste's line, and the line's direction there
  P(k, s) { const L = k.L; let i = 1; while (i < L.length - 1 && L[i].s < s) i++; const a = L[i - 1], b = L[i], u = clamp((s - a.s) / ((b.s - a.s) || 1), 0, 1); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: a.y + (b.y - a.y) * u }; }
  T(k, s) { const a = this.P(k, Math.max(0, s - 4)), b = this.P(k, Math.min(k.len, s + 4)), l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; }
  // the nearest point of a piste's line: {s, d (m from the line), lat (+ to the left going down)}
  sOn(k, x, z) {
    let best = { s: 0, d: 1e9, lat: 0 }; const L = k.L;
    for (let i = 0; i + 1 < L.length; i++) { const a = L[i], b = L[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1e-9, t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1), px = a.x + ex * t, pz = a.z + ez * t, d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { s: a.s + (b.s - a.s) * t, d, lat: (ez * (x - a.x) - ex * (z - a.z)) / Math.sqrt(l2) * -1 }; }
    return best;
  }
  // the groomed piste under a point (and how far inside it): {k, d, edge (0 at the edge … 1 two metres in)} or null
  piste(x, z) {
    const c = this.cells.get(Math.floor(x / 32) * 73856093 ^ Math.floor(z / 32) * 19349663); if (!c) return null; let best = null;
    for (const [k, s] of c) { const a = s.a, b = s.b, ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1e-9, t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1), d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t), m = s.hw - d;
      if (m > -2 && (!best || m > best.m)) best = { k, m, link: !!s.link }; }
    if (best) best.edge = clamp((best.m + 2) / 4, 0, 1);
    return best;
  }
  // kickers: the height they add (and its slope along the kicker in g, so the lip is sharp), and the one under a skier
  // (a: metres past the lip, negative on the ramp)
  kickH(x, z, g) {
    for (const q of this.kickers) { const rx = x - q.x, rz = z - q.z, a = rx * q.tx + rz * q.tz; if (a < -q.len || a > q.back) continue; const b = Math.abs(rx * q.tz - rz * q.tx); if (b > q.w + 0.8) continue;
      const side = Math.min(1, (b < q.w ? 1 : 1 - (b - q.w) / 0.8) * 1.6), u = (a + q.len) / q.len, w = 1 - a / q.back, h = a <= 0 ? q.H * u * u : q.H * w * w;
      if (g) { const s = (a <= 0 ? 2 * q.H * u / q.len : -2 * q.H * w / q.back) * side; g.x = s * q.tx; g.z = s * q.tz; }
      return h * side; }
    if (g) g.x = g.z = 0;
    return 0;
  }
  kickerAt(x, z) { for (const q of this.kickers) { const rx = x - q.x, rz = z - q.z, a = rx * q.tx + rz * q.tz; if (a > -q.len - 2 && a < 0.6 && Math.abs(rx * q.tz - rz * q.tx) < q.w + 0.3) return { q, a }; } return null; }
  // the snow the skis ride on. Groomed pistes are smooth (the island's height grid, no small bumps, a layer of packed snow on top);
  // off the piste the bumps are there, averaged over the length of a ski; the kickers on top. Near roads the road bed shapes the snow.
  ground(x, z) { return this.snow(x, z) + (this.kickers.length ? this.kickH(x, z) : 0); }
  snow(x, z) {
    const W = this.world, isl = this.isl;
    let h = W.height(x, z);
    if (isl && isl.inside(x, z)) {
      const pi = this.piste(x, z), e = 1.2, rough = 0.5 * h + 0.125 * (W.height(x + e, z) + W.height(x - e, z) + W.height(x, z + e) + W.height(x, z - e));
      let smooth = rough;
      if (pi) { const q = isl.roads.query(x - isl.ox, z - isl.oz), base = isl.grid.bicubic(x - isl.ox, z - isl.oz); smooth = q && q.d < q.hw + 18 ? rough + (base - rough) * clamp((q.d - q.hw - 10) / 8, 0, 1) : base; }
      h = pi ? rough + (smooth + LAYER - rough) * pi.edge : rough;
      const ic = this.iceAt(x, z); if (ic != null && ic > h) h = ic;
    }
    return h;
  }
  // the snow's normal, over the length of a ski; a kicker's slope added exactly, so its lip is sharp and throws the skier
  normal(x, z, out) {
    const e = 0.9, g = _g; let gx = (this.snow(x + e, z) - this.snow(x - e, z)) / (2 * e), gz = (this.snow(x, z + e) - this.snow(x, z - e)) / (2 * e);
    if (this.kickers.length) { this.kickH(x, z, g); gx += g.x; gz += g.z; }
    return out.set(-gx, 1, -gz).normalize();
  }
  iceAt(x, z) { for (const e of this.ice) if (inPoly(e.p, x, z)) return e.y + 0.04; return null; }
  // what the skis glide on: groomed piste, packed snow (roads and the parking under snow), deep snow, ice, rock
  surface(x, z) {
    const pi = this.piste(x, z); if (pi && pi.m > 0) return { k: 'groomed', piste: pi.k };
    if (this.iceAt(x, z) != null) return { k: 'ice', piste: null };
    const s = this.world.surface(x, z);
    return { k: s === SURF.ICE ? 'ice' : s === SURF.ROCK ? 'rock' : s === SURF.ASPHALT || s === SURF.GRAVEL || s === SURF.CONCRETE || s === SURF.WOOD || s === SURF.DIRT ? 'packed' : 'deep', piste: pi ? pi.k : null };
  }
}
function inPoly(p, x, z) { let ins = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins; } return ins; }

// ---------------------------------------------------------------- the chairlift
// The loop the chairs ride, built from the lift data exactly as sim/render/special.js builds it: up on one cable from the bottom
// station over the towers to the top, across the bullwheel and down the other. chairAt(s) is where a chair s metres round the loop is.
export function liftLoop(L, ox, oz) {
  const a = [L.bottom.x + ox, L.bottom.y + L.station, L.bottom.z + oz], b = [L.top.x + ox, L.top.y + L.station, L.top.z + oz];
  const ang = Math.atan2(b[0] - a[0], b[2] - a[2]), vx = Math.cos(ang), vz = -Math.sin(ang), sup = [a, ...L.towers.map(t => [t.x + ox, t.y + t.h, t.z + oz]), b];
  const up = sup.map(p => [p[0] + vx * L.off, p[1], p[2] + vz * L.off]), dn = sup.map(p => [p[0] - vx * L.off, p[1], p[2] - vz * L.off]).reverse();
  const loop = [...up, ...dn], seg = []; let tot = 0, upLen = 0;
  for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length], l = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); seg.push([p, q, tot, l]); if (i < up.length - 1) upLen += l; tot += l; }
  const towersS = []; for (let i = 1; i < up.length - 1; i++) towersS.push(seg[i][2]);
  return { def: L, a, b, ang, vx, vz, up, dn, seg, tot, upLen, towersS, n: Math.floor(tot / 22), speed: 2.4,
    chairAt(s, out = {}) { s = ((s % tot) + tot) % tot; let k = 0; while (k < seg.length - 1 && s > seg[k][2] + seg[k][3]) k++; const [p, q, s0, l] = seg[k], u = Math.min(1, (s - s0) / (l || 1));
      out.x = p[0] + (q[0] - p[0]) * u; out.y = p[1] + (q[1] - p[1]) * u; out.z = p[2] + (q[2] - p[2]) * u; out.yaw = Math.atan2(q[0] - p[0], q[2] - p[2]); out.pitch = Math.atan2(q[1] - p[1], Math.hypot(q[0] - p[0], q[2] - p[2])); out.k = k; return out; } };
}

// ---------------------------------------------------------------- the skier
// inp = {steer −1…1 (+ left), gas 0…1 (pole and skate when slow or on the flat, tuck when fast), brake 0…1 (plough; with hard
// steering at speed a hockey stop), jump (true for one step)}. o.assist (Lett): softer landings and collisions.
export class Skier {
  constructor(area, o = {}) {
    this.area = area; this.world = area.world; this.assist = o.assist ?? true;
    this.pos = new V3(); this.vel = new V3(); this.n = new V3(0, 1, 0); this.d = new V3(0, 0, 1); this.l = new V3(1, 0, 0); this.fw = new V3(0, 0, 1);
    this.ev = []; this.place(0, 0, 0);
  }
  place(x, z, head) {
    const A = this.area; this.pos.set(x, A.ground(x, z), z); this.vel.set(0, 0, 0); A.normal(x, z, this.n);
    Object.assign(this, { head, dir: head, air: false, airT: 0, spin: 0, spinV: 0, crashT: 0, why: '', land: 0, tuck: 0, plow: 0, hock: 0, edge: 0, carve: 0, skid: 0, inc: 0, wob: 0, wobT: 0,
      pole: 0, poleK: 0, walk: 0, speed: 0, surf: 'groomed', piste: null, pop: false, unweight: 0 });
    this.fw.set(Math.sin(head), 0, Math.cos(head)); this.frame();
  }
  crash(why) { if (this.crashT > 0) return; this.crashT = 1e-4; this.why = why; this.air = false; this.ev.push({ type: 'crash', why, speed: this.speed }); }
  // the skis' direction d in the slope's plane and l to their left
  frame() { const n = this.n, dx = Math.sin(this.head), dz = Math.cos(this.head), dh = dx * n.x + dz * n.z; this.d.set(dx - dh * n.x, -dh * n.y, dz - dh * n.z).normalize(); this.l.crossVectors(n, this.d); }
  step(dt, inp) {
    if (this.crashT > 0) this.tumble(dt);
    else if (this.air) this.fly(dt, inp);
    else this.ski(dt, inp);
    if (this.crashT === 0) this.collide();
    const v = this.vel; this.speed = v.length(); this.fw.set(Math.sin(this.head), 0, Math.cos(this.head));
    if (Math.hypot(v.x, v.z) > 0.5) this.dir = Math.atan2(v.x, v.z);
  }
  ski(dt, inp) {
    const A = this.area, P = SKI, p = this.pos, v = this.vel, n = A.normal(p.x, p.z, this.n), su = A.surface(p.x, p.z), k = su.k, deep = k === 'deep', g = P.g, ny = n.y;
    this.surf = k; this.piste = su.piste;
    this.frame();
    let sp = v.length(); const d = this.d, l = this.l, va0 = v.dot(d), grade = -d.y / Math.max(0.2, Math.hypot(d.x, d.z));
    // the stance: ↑ poles and skates when slow or on the flat, tucks when fast; ↓ ploughs, and with hard steering at speed swings the skis across
    const want = inp.gas > 0.3, poling = want && va0 > -1 && (va0 < 4.5 || (va0 < 8 && grade < 0.06));
    this.tuck += ((want && !poling ? 1 : 0) - this.tuck) * Math.min(1, dt * 5);
    const hk = inp.brake > 0.3 && Math.abs(inp.steer) > 0.5 && sp > 3;
    this.plow += ((inp.brake > 0.3 && !hk ? 1 : 0) - this.plow) * Math.min(1, dt * 6);
    this.hock += ((hk ? Math.sign(inp.steer) : 0) - this.hock) * Math.min(1, dt * (hk ? 6 : 3));
    // steering: the turn the legs ask for is quick when slow and bounded by the sideways pull a skier can hold when fast
    const lat = P.aLat * (1 - 0.35 * this.tuck) * (deep ? 0.8 : 1) * (1 - 0.4 * this.wob);
    let w = inp.steer * Math.min(P.pivot * (1 - 0.35 * this.plow), lat / Math.max(sp, 0.6));
    if (hk) w = clamp(wrap(this.dir + Math.sign(inp.steer) * 1.45 - this.head) * 8, -6, 6);
    if (this.wob > 0) { this.wobT += dt; w += Math.sin(this.wobT * 15) * 1.5 * this.wob; this.wob = Math.max(0, this.wob - dt * 1.1); }
    // the edges tip with steady steering; the sidecut bends a tipped ski round R = Rsc·cos θ, and the velocity rides round that arc
    // with the skis (no loss) as far as the edges hold the pull
    this.edge += (Math.min(1, Math.abs(inp.steer) * 1.15) - this.edge) * Math.min(1, dt * 5);
    const R = P.Rsc * Math.cos(this.edge * P.edgeMax), hold = P.hold[k] * (0.35 + 0.65 * this.edge) * (1 - 0.35 * this.wob) * ny;
    let wc = 0;
    if (sp > 1 && !hk && this.plow < 0.5 && k !== 'rock') { wc = Math.min(Math.abs(w), sp / R, hold / sp) * Math.sign(w); const c = Math.cos(wc * dt), s = Math.sin(wc * dt); _a.crossVectors(n, v); v.multiplyScalar(c).addScaledVector(_a, s); }
    this.head += w * dt; this.frame();
    // gravity along the slope
    v.x += g * ny * n.x * dt; v.y += (g * ny * ny - g) * dt; v.z += g * ny * n.z * dt;
    // what moves sideways to the skis scrapes on the edges: that turns the velocity towards the skis and brakes it (a skid). On a
    // traverse the skier rolls the knees into the hill without thinking: the edges bite as much as the side slope needs
    const across = Math.abs(g * l.y), auto = Math.min(0.9, across / (g * ny * P.side[k] * 0.8 + 0.1));
    const vl = v.dot(l), scrape = g * ny * (0.12 + (P.side[k] - 0.12) * Math.max(this.edge, this.plow, Math.abs(this.hock), auto));
    const dvl = Math.sign(vl) * Math.min(Math.abs(vl), scrape * dt); v.addScaledVector(l, -dvl);
    this.skid += (Math.abs(vl) - this.skid) * Math.min(1, dt * 12);
    sp = v.length();
    const cv = sp > 4 && this.edge > 0.2 && Math.abs(wc) > 0.04 && Math.abs(vl) < 0.08 * sp + 0.05 ? 1 : 0; this.carve += (cv - this.carve) * Math.min(1, dt * 8);
    // poling and skating come in strokes (about one a second); up a steep hill the skier walks up in a herringbone
    const va = v.dot(d);
    this.poleK += ((poling ? 1 : 0) - this.poleK) * Math.min(1, dt * 8);
    if (poling) {
      const ph0 = this.pole; this.pole = (this.pole + dt * 0.95) % 1; if (ph0 < 0.3 && this.pole >= 0.3) this.ev.push({ type: 'pole' });
      if (grade < -0.08 && va < 1.6) { this.walk = 1; const tgt = Math.min(1, P.P / (P.m * g * -grade)), v0 = Math.max(0, va); v.addScaledVector(d, v0 + (tgt - v0) * Math.min(1, dt * 3) - va); }
      else { this.walk = 0; const ph = this.pole; if (ph > 0.3 && ph < 0.65) v.addScaledVector(d, Math.min(P.F, P.P / Math.max(1.5, va)) / P.m / 0.223 * Math.sin(Math.PI * (ph - 0.3) / 0.35) * 0.9 * dt); }
    } else this.walk = 0;
    // snow friction, air drag (much less in a tuck), deep snow, the plough: they brake along the way you move
    sp = v.length();
    const cda = P.cdaUp + (P.cdaTuck - P.cdaUp) * this.tuck + 0.12 * this.plow, kd = 0.5 * P.rho * cda / P.m;
    const dec = (this.walk ? 0 : P.mu[k] * g * ny) + kd * sp * sp + (deep ? 0.25 + 0.025 * sp : 0) + this.plow * (2.4 + 0.04 * sp) + (this.assist && sp > 30 ? (sp - 30) * 0.6 : 0);
    if (sp > 1e-6) v.multiplyScalar(Math.max(0, sp - dec * dt) / sp);
    sp = v.length();
    if (k === 'rock' && sp > 6) return this.crash('Over steinene');
    if (this.wob > 0.05 && sp > 4 && Math.abs(wrap(this.head - this.dir)) > 1.1 && !hk) return this.crash('Mistet balansen');
    // move along the snow; leave it where it falls away faster than gravity can pull the skier round (a lip, a knoll at speed)
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt, h1 = A.ground(nx, nz), run = Math.hypot(v.x, v.z) * dt;
    if (run > 1e-5 && (h1 - p.y) / run > 1.4) { if (sp > 4) return this.crash('Rett i en kant'); v.multiplyScalar(-0.2); return; }
    if (inp.jump && sp > 0.4 && this.walk === 0) {
      const kk = A.kickerAt(p.x, p.z), pop = !!kk && kk.a > -1.6 && kk.a < 0.4 && v.x * kk.q.tx + v.z * kk.q.tz > 0;
      v.addScaledVector(n, pop ? P.pop : P.hop); this.takeoff(pop, !!kk); p.set(nx, Math.max(h1, p.y) + v.y * dt, nz); return;
    }
    const n1 = A.normal(nx, nz, _n), vn = v.dot(n1), need = vn / dt, yb = p.y + v.y * dt - 0.5 * g * dt * dt;
    if (need > g * n1.y + 0.5 && sp > 3 && yb > h1 + 1e-5) { this.takeoff(false, !!A.kickerAt(p.x, p.z)); p.set(nx, yb, nz); return; }
    p.set(nx, h1, nz);
    // into the new tangent plane: over a smooth curve the snow takes no speed; a sharp compression is soaked up by the legs
    const before = v.length(); v.addScaledVector(n1, -vn);
    if (vn > -1.2) { const after = v.length(); if (after > 1e-6) v.multiplyScalar(before / after); } else { this.land = Math.min(1, this.land - vn * 0.15); this.ev.push({ type: 'bump', hard: -vn }); }
    this.land = Math.max(0, this.land - dt * 3); this.unweight = clamp(need / (g * n1.y), -2, 1.5);
    // the lean into the turn follows the sideways pull: v × how fast the way you move turns (+ to the left)
    const nd = Math.atan2(v.x, v.z), hs = Math.hypot(v.x, v.z);
    if (hs > 0.8) { const latA = hs * wrap(nd - this.dir) / dt, ti = Math.atan(clamp(latA / g, -2.5, 2.5)); this.inc += (ti - this.inc) * Math.min(1, dt * 7); } else this.inc *= 1 - Math.min(1, dt * 6);
  }
  takeoff(pop, kick) { this.air = true; this.airT = 0; this.spin = 0; this.spinV = 0; this.pop = pop; this.ev.push({ type: 'takeoff', pop, kick }); }
  fly(dt, inp) {
    const A = this.area, P = SKI, p = this.pos, v = this.vel, sp = v.length(), kd = 0.5 * P.rho * (P.cdaUp + (P.cdaTuck - P.cdaUp) * this.tuck) / P.m;
    this.airT += dt; v.y -= P.g * dt; v.multiplyScalar(1 - kd * sp * dt);
    this.inc *= 1 - Math.min(1, dt * 4); this.wob = Math.max(0, this.wob - dt * 2); this.hock *= 1 - Math.min(1, dt * 6); this.plow *= 1 - Math.min(1, dt * 6); this.carve = 0;
    this.tuck += ((inp.gas > 0.3 ? 1 : 0) - this.tuck) * Math.min(1, dt * 5);
    // spin with left and right (a 360 takes about a second)
    if (this.airT > 0.08) { this.spinV += (inp.steer * 7.5 - this.spinV) * Math.min(1, dt * 7); this.head += this.spinV * dt; this.spin += this.spinV * dt; }
    p.addScaledVector(v, dt);
    const h = A.ground(p.x, p.z); if (p.y > h) return;
    // landing: the snow takes the speed into the slope, the rest goes on along it
    const n = A.normal(p.x, p.z, this.n), vn = v.dot(n), hard = -vn, turns = Math.abs(this.spin) / (2 * Math.PI), spins = Math.round(turns), clean = Math.abs(turns - spins) * 360 < 50;
    p.y = h; this.air = false; v.addScaledVector(n, -vn); const hs = Math.hypot(v.x, v.z); if (hs > 0.5) this.dir = Math.atan2(v.x, v.z);
    const across = Math.abs(wrap(this.head - this.dir)), lim = this.assist ? 11 : 9, wl = this.assist ? 8 : 6.5;
    const air = this.airT; this.spin = 0; this.spinV = 0;
    if (hs > 4 && across > 1.05) return this.crash('Landet på tvers');
    if (hard > lim) return this.crash('For hard landing');
    this.land = Math.min(1, hard / 7); this.head = this.dir + wrap(this.head - this.dir) * 0.4;
    const wb = Math.max(hs > 3 ? (across - 0.45) / 0.6 : 0, (hard - wl) / (lim - wl)); if (wb > 0 && air > 0.15) { this.wob = Math.min(1, Math.max(this.wob, 0.45 + wb * 0.55)); this.wobT = 0; }
    if (air > 0.12) this.ev.push({ type: 'land', air, spins: clean && air > 0.35 ? spins : 0, hard, wob: wb > 0, pop: this.pop });
    this.frame();
  }
  // a fall: tumbling and sliding to a stop on the snow; the game puts the skier back on their feet
  tumble(dt) {
    const A = this.area, p = this.pos, v = this.vel; this.crashT += dt;
    const sp = Math.hypot(v.x, v.z), k = sp > 1e-3 ? Math.max(0, sp - 5 * dt) / sp : 0; v.x *= k; v.z *= k; v.y = 0;
    p.x += v.x * dt; p.z += v.z * dt; const h = A.ground(p.x, p.z); p.y = this.air ? Math.max(h, p.y - 9.81 * dt) : h; this.inc *= 1 - Math.min(1, dt * 6); this.tuck = 0; this.plow = 0; this.hock = 0;
  }
  // trees, houses, posts and lift towers: a bump when slow, a fall when fast
  collide() {
    const p = this.pos, v = this.vel, r = SKI.r, lim = this.assist ? 4.5 : 3.5;
    for (const c of this.world.colliders(p.x, p.z, 1)) {
      const dx = p.x - c.x, dz = p.z - c.z; if (Math.abs(dx) > 25 || Math.abs(dz) > 25) continue;
      if (this.air && c.y1 != null && p.y > c.y1) continue;
      let nx, nz, pen;
      if (c.hw != null) { const cs = Math.cos(c.ang), sn = Math.sin(c.ang), a = dx * cs - dz * sn, b = dx * sn + dz * cs, ca = clamp(a, -c.hw, c.hw), cb = clamp(b, -c.hd, c.hd), ea = a - ca, eb = b - cb, dd = Math.hypot(ea, eb);
        if (dd >= r) continue; if (dd < 1e-6) { pen = r; nx = Math.sign(a) * cs; nz = -Math.sign(a) * sn; } else { pen = r - dd; nx = (ea * cs + eb * sn) / dd; nz = (-ea * sn + eb * cs) / dd; } }
      else { const dd = Math.hypot(dx, dz); if (dd >= c.r + r || dd < 1e-6) continue; pen = c.r + r - dd; nx = dx / dd; nz = dz / dd; }
      const vn = v.x * nx + v.z * nz;
      if (vn < -lim) { this.ev.push({ type: 'hit', j: -vn * SKI.m, kind: c.kind }); return this.crash(c.kind === 'house' ? 'Rett i en vegg' : c.kind === 'post' ? (c.r >= 0.4 ? 'Rett i en heismast' : 'Rett i en stolpe') : c.kind === 'rail' ? 'Rett i gjerdet' : c.kind === 6 ? 'Rett i en stein' : 'Rett i et tre'); }
      p.x += nx * pen; p.z += nz * pen; if (vn < 0) { v.x -= nx * vn * 1.15; v.z -= nz * vn * 1.15; if (vn < -1) this.ev.push({ type: 'hit', j: -vn * SKI.m, kind: c.kind }); }
    }
    if (!this.air && this.crashT === 0) { const w = this.world.water(p.x, p.z); if (w > p.y + 0.05 && this.surf !== 'ice') this.crash(this.world.islandAt(p.x, p.z) && !this.world.islandAt(p.x, p.z).def.backdrop ? 'Rett i vannet' : 'Rett i sjøen'); }
  }
}

// ---------------------------------------------------------------- a timed run down a piste
// The clock starts at the start line. A gate is passed by crossing the line between its poles; skipping a gate (crossing a later
// one first) or, in the slalom, passing just outside a pole, is a miss: +5 s. The last gate is the finish.
const segX = (p1, p2, a, b) => { const d = (p2.x - p1.x) * (b.z - a.z) - (p2.z - p1.z) * (b.x - a.x); if (Math.abs(d) < 1e-9) return false;
  const u = ((a.x - p1.x) * (b.z - a.z) - (a.z - p1.z) * (b.x - a.x)) / d, w = ((a.x - p1.x) * (p2.z - p1.z) - (a.z - p1.z) * (p2.x - p1.x)) / d; return u >= 0 && u <= 1 && w >= 0 && w <= 1; };
export class SkiRun {
  constructor(k) { this.k = k; this.next = 0; this.passed = 0; this.missed = 0; this.pen = 0; this.time = 0; this.started = false; this.done = false; this.splits = []; this.top = 0; this.jumps = []; this.points = 0; this.crashes = 0; this.turnT = 0; this.carveT = 0; this.pops = 0;
    this.cp = { x: k.start.x, z: k.start.z, h: k.start.h }; }
  // has the line from p1 to p2 crossed the start line? (2 m wide either side of the line's start)
  crossStart(p1, p2) { const s = this.k.start, nx = Math.cos(s.h), nz = -Math.sin(s.h), w = this.k.hw; return segX(p1, p2, { x: s.x + nx * w, z: s.z + nz * w }, { x: s.x - nx * w, z: s.z - nz * w }); }
  // the gates crossed going from p1 to p2: [{type: 'gate'|'miss'|'finish', i}]
  cross(p1, p2) {
    const out = [], G = this.k.gates;
    for (let i = this.next; i < G.length && !this.done; i++) {
      const g = G[i], E = g.finish ? 3 : this.k.kind === 'slalom' ? 3 : 0, hit = segX(p1, p2, g.a, g.b);
      const wide = !hit && E > 0 && i === this.next && segX(p1, p2, { x: g.a.x + g.nx * E, z: g.a.z + g.nz * E }, { x: g.b.x - g.nx * E, z: g.b.z - g.nz * E });
      if (!hit && !wide) continue;
      for (let j = this.next; j < i; j++) { this.missed++; this.pen += 5; out.push({ type: 'miss', i: j }); }
      this.next = i + 1;
      if (g.finish) { if (!hit) { this.missed++; this.pen += 5; } this.done = true; out.push({ type: 'finish', i }); break; }
      if (hit) { this.passed++; this.cp = { x: g.x, z: g.z, h: Math.atan2(g.tx, g.tz) }; out.push({ type: 'gate', i }); }
      else { this.missed++; this.pen += 5; out.push({ type: 'miss', i }); }
      break;
    }
    return out;
  }
}
// points for a jump: airtime, full spins landed clean, a pop right at the lip
export const jumpPoints = (air, spins, pop) => Math.round(air * 120) + spins * 150 + (pop ? 50 : 0);
