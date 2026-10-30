// What the animals do: where they are born, how they graze, flee, fly, swim, charge and get hit. No three.js and no DOM, so the Node
// test (tools/test-animals.mjs) runs it as it is; sim/life/animals.js feeds it the car and the camera and draws the result (vis.js).
//
//   const life = new Life(world, {max});   world.movers.push(life.hook)       (the big animals become colliders for the car)
//   life.update(dt, V)    V = {fx,fz (focus), cx,cy,cz (camera), car (the Vehicle when driving, else null), tx,tz,tvx,tvz (what scares:
//                         the focus vehicle), honk, night (0–1), lights, pen ('nuts' | 'course' | null: what an attack costs)}
//   life.animals          every live animal: {sp, x,y,z, h (heading), pitch, roll, s (size), and the pose the renderer reads}
//   life.events           what happened this frame: {type: 'attack' | 'hit' | 'warn' | 'call' | 'event', a, …} (the caller empties it)
//
// Spawning: four rings round the focus and the camera, each a grid of cells (species.js RINGS). A cell's animals come from a hash of
// the cell and the island's seed, so the same herd grazes in the same place when you come back. They stay near home (a leash) and
// are dropped when their cell is far behind.
import { COVER as C } from '../world/island.js';
import { mulberry32, hash2 } from '../world/grid.js';
import { SPECIES, BIOME, RINGS, TREE_H } from './species.js';

const TAU = Math.PI * 2, rnd = Math.random, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => a - TAU * Math.floor((a + Math.PI) / TAU);
const FORESTS = new Set([C.FOREST, C.MIXED, C.DECID, C.SNOWFOREST, C.JUNGLE]), OPENS = new Set([C.FARM, C.GRASS, C.HEATH, C.GARDEN, C.BOG, C.SAVANNA]);
const BUDGET = [70, 90, 100, 50], CALM = new Set(['idle', 'graze', 'walk']);            // animals per ring at most
const DIRS = [...Array(8)].map((_, k) => [Math.sin(k * TAU / 8), Math.cos(k * TAU / 8)]);

export class Life {
  constructor(world, o = {}) {
    this.world = world; this.animals = []; this.groups = []; this.events = []; this.t = 0;
    this.cells = RINGS.map(() => new Map()); this.count = [0, 0, 0, 0]; this.scale = o.max ? o.max / 310 : 1;
    this.cols = []; this.car = null; this._hit = null; this.spawnT = 0; this.dropT = 0; this.evT = 40 + rnd() * 40; this.evN = 0; this.frame = 0;
    this.carM = 1500;
    this.hook = (x, z, r, out) => this.colliders(x, z, r, out);
  }

  // ---------------------------------------------------------------- the frame
  update(dt, V) {
    dt = Math.min(dt, 0.1); this.t += dt; this.frame++;
    this.V = V; this.car = V.car || null; if (this.car) this.carM = this.car.m;
    V.tsp = Math.hypot(V.tvx || 0, V.tvz || 0); V.honkT = V.honk ? 1.2 : Math.max(0, (V.honkT || 0) - dt);
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 0.25; this.spawn(V, 3); }
    if ((this.dropT -= dt) <= 0) { this.dropT = 0.5; this.drop(V); }
    this.roadEvent(dt, V);
    for (const g of this.groups) this.group(g, dt, V);
    for (const a of this.animals) {
      const d = Math.min(Math.hypot(a.x - V.fx, a.z - V.fz), Math.hypot(a.x - V.cx, a.z - V.cz));
      a.dc = d;
      // far away they only need to be roughly right: every fourth frame
      if (d > 160 && a.st !== 'flee' && a.st !== 'charge' && a.sp.type !== 'soar') { a.acc = (a.acc || 0) + dt; if ((this.frame + a.n) % 4) continue; this.step(a, a.acc, V); a.acc = 0; }
      else this.step(a, dt, V);
    }
    this.dodge(V); this.refreshCols(V);
  }
  step(a, dt, V) {
    const dx = a.x - (V.tx ?? V.fx), dz = a.z - (V.tz ?? V.fz);
    a.td = Math.hypot(dx, dz); a.tdx = dx; a.tdz = dz;
    a.fear = this.fear(a, V);
    if (a.noCol > 0) a.noCol -= dt;
    if (a.st === 'down' || a.st === 'up') return this.knocked(a, dt);
    switch (a.sp.type) {
      case 'graze': this.graze(a, dt, V); break;
      case 'pred': this.pred(a, dt, V); break;
      case 'tree': this.tree(a, dt, V); break;
      case 'flock': this.flock(a, dt, V); break;
      case 'soar': this.soar(a, dt, V); break;
      case 'swim': this.swim(a, dt, V); break;
      case 'wade': this.wade(a, dt, V); break;
      case 'bask': this.bask(a, dt, V); break;
      case 'dart': this.dart(a, dt, V); break;
      case 'hop': this.hop(a, dt, V); break;
      case 'flutter': this.flutter(a, dt, V); break;
    }
  }
  // how much further than its flee distance the threat scares it: a fast car or the horn more, a parked car less
  fear(a, V) {
    if (V.tx == null) return 0;
    const sp = V.tsp || 0, appr = sp > 1 ? -((V.tvx || 0) * a.tdx + (V.tvz || 0) * a.tdz) / (sp * (a.td || 1)) : 0;
    let k = sp < 0.5 ? 0.45 : 0.75 + Math.min(1.2, sp / 18) + (appr > 0.7 ? 0.3 : 0);
    if (V.honkT > 0 && a.td < 150) k = Math.max(k, 2.6);
    return k;
  }

  // ---------------------------------------------------------------- spawning
  centres(V) { const c = [[V.fx, V.fz]]; if (V.cx != null && Math.hypot(V.cx - V.fx, V.cz - V.fz) > 30) c.push([V.cx, V.cz]); return c; }
  spawn(V, max) {
    const cand = [], cs = this.centres(V);
    RINGS.forEach((ring, ri) => {
      if (this.count[ri] >= BUDGET[ri] * this.scale) return;
      const S = ring.cell, R = ring.r + S * 0.5, map = this.cells[ri];
      for (const [x, z] of cs) for (let j = Math.floor((z - R) / S); j <= Math.floor((z + R) / S); j++) for (let i = Math.floor((x - R) / S); i <= Math.floor((x + R) / S); i++) {
        const key = i + ',' + j; if (map.has(key)) continue;
        const d = Math.hypot((i + 0.5) * S - x, (j + 0.5) * S - z); if (d > R) continue;
        cand.push({ ri, i, j, key, d: d / ring.r });
      }
    });
    cand.sort((a, b) => a.d - b.d);
    let n = 0; const t0 = performance.now();
    for (const c of cand) { if (this.cells[c.ri].has(c.key)) continue; if (this.count[c.ri] >= BUDGET[c.ri] * this.scale) continue; this.makeCell(c.ri, c.i, c.j, c.key); if (++n >= max || performance.now() - t0 > 2.5) break; }
    return n;
  }
  // everything round the point at once (the test, and after a jump such as the ferry)
  fill(V) { let n; do { n = this.spawn(V, 50); } while (n > 0); }
  drop(V) {
    const cs = this.centres(V);
    this.cells.forEach((map, ri) => {
      const ring = RINGS[ri], far = ring.r + ring.cell;
      for (const [key, cell] of map) {
        let d = 1e9; for (const [x, z] of cs) d = Math.min(d, Math.hypot(cell.x - x, cell.z - z));
        if (d < far) continue;
        if (cell.list.some(a => { for (const [x, z] of cs) if (Math.hypot(a.x - x, a.z - z) < ring.r) return true; return false; })) continue;
        for (const a of cell.list) a.dead = true;
        this.count[ri] -= cell.list.length; map.delete(key);
      }
    });
    if (this.animals.some(a => a.dead)) { this.animals = this.animals.filter(a => !a.dead); this.groups = this.groups.filter(g => !g.m[0].dead); }
  }
  makeCell(ri, i, j, key) {
    const ring = RINGS[ri], S = ring.cell, x0 = i * S, z0 = j * S, cell = { ri, x: x0 + S / 2, z: z0 + S / 2, list: [] };
    this.cells[ri].set(key, cell);
    const isl = this.world.islandAt(cell.x, cell.z);
    if (!isl || isl.def.backdrop || !isl.inside(cell.x, cell.z, 40)) return cell;
    const bio = BIOME[isl.def.biome || 'nordic'], R = mulberry32(Math.floor(hash2(i, j, isl.seed + ri * 7919) * 4294967296));
    // the land cover in the cell (5 × 5 samples): how much of it each species likes
    const samp = []; for (let v = 0; v < 5; v++) for (let u = 0; u < 5; u++) samp.push(isl.coverAt(x0 + (u + 0.5) * S / 5, z0 + (v + 0.5) * S / 5));
    for (const id in bio) {
      const sp = SPECIES.find(s => s.id === id); if (!sp || sp.ring !== ri) continue;
      let f = 0; for (const c of samp) if (sp.cover.includes(c)) f++;
      const roll = R(); if (!f) continue;
      const exp = sp.dens * bio[id] * (f / 25) * S * S / 1e6, n = Math.floor(exp) + (roll < exp % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const p = this.findSpot(sp, isl, x0, z0, S, R); if (!p) continue;
        const g = this.makeGroup(sp, isl, p, R, cell); if (g) { this.groups.push(g); this.count[ri] += g.m.length; }
      }
    }
    return cell;
  }
  makeGroup(sp, isl, p, R, cell) {
    const n = sp.group[0] + Math.floor(R() * (sp.group[1] - sp.group[0] + 1)), g = { sp, isl, m: [], hx: p.x, hz: p.z, gx: p.x, gz: p.z, t: 5 + R() * 20, flee: 0, fx: 0, fz: 0, mode: 'ground', cell };
    for (let k = 0; k < n; k++) {
      let q = p;
      if (k) for (let tries = 0; tries < 6; tries++) { const a = R() * TAU, r = sp.spread * Math.sqrt(R()); const c = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, tree: p.tree }; if (this.okSpot(sp, isl, c.x, c.z, false)) { q = c; break; } }
      if (sp.trees || sp.treeOnly) { const t = this.treesNear(isl, q.x, q.z, 18, sp.trees || sp.perch, R); if (t) q = this.perchOn(t, sp, R); else continue; }
      const young = k > 0 && sp.young && R() < sp.young;
      const a = this.mk(sp, isl, q, R, g, young, k);
      g.m.push(a); cell.list.push(a); this.animals.push(a);
    }
    return g.m.length ? g : null;
  }
  mk(sp, isl, p, R, g, young, k) {
    const a = { sp, isl, grp: g, n: this.animals.length + Math.floor(R() * 1000), x: p.x, z: p.z, y: 0, h: R() * TAU, v: 0, st: 'idle', t: R() * 4, tx: p.x, tz: p.z, hx: p.x, hz: p.z,
      s: young ? 0.55 + R() * 0.15 : 0.9 + R() * 0.2, young, male: sp.type === 'pred' && sp.id === 'love' ? k === 0 : R() < 0.5, seed: R(),
      ph: R() * TAU, amp: 0, gait: sp.gait0 || 0, lie: 0, hp: 0, hy: 0, tail: 0, jaw: 0, fph: R() * TAU, famp: 0, fold: 1, tuck: 0,
      pitch: 0, roll: 0, bob: 0, vx: 0, vy: 0, vz: 0, chk: 0, free: true, cool: 0, noCol: 0, td: 1e9, tdx: 0, tdz: 0, fear: 0, dc: 0, perch: p.perch || null, tree: p.tree || null };
    if (sp.rig === 'bird' || sp.rig === 'fly') { a.fold = 1; a.st = 'sit'; }
    if (sp.type === 'soar') { a.st = 'fly'; a.fold = 0; a.orbit = { x: p.x, z: p.z, r: 60 + R() * 90, w: (R() < 0.5 ? 1 : -1), alt: sp.alt[0] + R() * (sp.alt[1] - sp.alt[0]) }; a.ang = R() * TAU; }
    if (sp.type === 'flutter') { a.st = 'fly'; a.fold = 0; a.ang = R() * TAU; }
    if (sp.type === 'tree') a.st = 'perch';
    if (sp.type === 'pred') a.st = sp.lies ? 'rest' : 'idle';
    if (sp.type === 'bask' || sp.aquatic) { a.st = 'bask'; a.wet = this.waterNear(isl, p.x, p.z, 14); }
    if (sp.lies && R() < sp.lies && sp.type !== 'pred') a.st = 'lie';
    if (a.st === 'lie' || a.st === 'rest') a.lie = 1;
    this.ground(a, true);
    if (a.perch) { a.y = a.perch.y; a.h = a.perch.h; }
    if (sp.type === 'soar') a.y = this.terrainAt(a, a.x, a.z) + a.orbit.alt;
    if (sp.type === 'flutter') a.y += 0.5 + R() * 1.2;
    return a;
  }
  // is this a good place for this species to be born (strict) or to walk (loose)?
  okSpot(sp, isl, x, z, loose) {
    if (!isl.inside(x, z, 30)) return false;
    const lx = x - isl.ox, lz = z - isl.oz, c = isl.cover.nearest(lx, lz), ter = isl.terrain(x, z), wl = isl.water(x, z), dep = wl - ter;
    if (!loose && !sp.cover.includes(c)) return false;
    if (c === C.LAVA) return false;
    const m = sp.medium || 'land';
    if (m === 'water') { if (dep < sp.depth[0] || dep > sp.depth[1]) return false; }
    else if (m === 'shore') { if (dep > (loose || sp.type === 'wade' ? sp.wade ?? 0.05 : 0.05)) return false; if (!loose && !this.waterNear(isl, x, z, 9, 0.08)) return false; }
    else if (m === 'coast') { if (!loose && (dep > 0.3 ? !this.landNear(isl, x, z, 70) || wl !== (isl.def.sea ?? 0) : !this.seaNear(isl, x, z, 30))) return false; }
    else if (dep > -0.15) return false;
    if (dep < 0.3 && isl.inBuilding(lx, lz, sp.len * 0.5 + 0.5)) return false;
    const q = isl.roads.query(lx, lz);
    if (q && (q.bridge ? q.d < q.hw + 3 : sp.roads !== 'any' && q.d < q.hw + 2)) return false;
    if (!loose && dep < 0) {
      const sl = Math.hypot(isl.terrain(x + 2, z) - ter, isl.terrain(x, z + 2) - ter) / 2;
      if (sl > (sp.mass > 20 ? 0.6 : 1.1)) return false;
      if (sp.edge) { let fo = 0, op = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = isl.coverAt(x + dx * 28, z + dz * 28); if (FORESTS.has(k)) fo++; else if (OPENS.has(k)) op++; } if (!fo || !op) return false; }
      if (sp.nearWater && !this.waterNear(isl, x, z, 30)) return false;
    }
    return true;
  }
  findSpot(sp, isl, x0, z0, S, R) {
    for (let k = 0, n = sp.medium === 'shore' ? 30 : 10; k < n; k++) {
      const x = x0 + R() * S, z = z0 + R() * S;
      if (!this.okSpot(sp, isl, x, z, false)) continue;
      const p = { x, z };
      if (sp.shade) { const t = this.treesNear(isl, x, z, 25, null, R, true); if (t) { const a = R() * TAU; p.x = t.x + Math.sin(a) * 2.5; p.z = t.z + Math.cos(a) * 2.5; p.tree = t; if (!this.okSpot(sp, isl, p.x, p.z, true)) { p.x = x; p.z = z; } } }
      return p;
    }
    return null;
  }
  waterNear(isl, x, z, r, dep = 0.3) { for (const f of [0.4, 1]) for (const [dx, dz] of DIRS) { const px = x + dx * r * f, pz = z + dz * r * f; if (isl.water(px, pz) - isl.terrain(px, pz) > dep) return { x: px, z: pz }; } return null; }
  seaNear(isl, x, z, r) { const s = isl.def.sea ?? 0; for (const f of [0.5, 1]) for (const [dx, dz] of DIRS) { const px = x + dx * r * f, pz = z + dz * r * f; if (isl.terrain(px, pz) < s - 0.5 && isl.coverAt(px, pz) === C.SEA) return true; } return false; }
  landNear(isl, x, z, r) { for (const f of [0.5, 1]) for (const [dx, dz] of DIRS) { const px = x + dx * r * f, pz = z + dz * r * f; if (isl.terrain(px, pz) > isl.water(px, pz) + 0.2) return true; } return false; }
  // a tree near (x,z) of one of these kinds (big ones when shade), in world coordinates with its height
  treesNear(isl, x, z, r, kinds, R, shade) {
    const lx = x - isl.ox, lz = z - isl.oz, L = [];
    for (let cj = Math.floor((lz - r) / 32); cj <= Math.floor((lz + r) / 32); cj++) for (let ci = Math.floor((lx - r) / 32); ci <= Math.floor((lx + r) / 32); ci++) for (const t of isl.scatter(ci, cj)) {
      if (kinds ? !kinds.includes(t.k) : !(TREE_H[t.k] && t.s * TREE_H[t.k] > 6)) continue;
      if ((t.x - lx) ** 2 + (t.z - lz) ** 2 > r * r || !TREE_H[t.k]) continue;
      L.push(t);
    }
    if (!L.length) return null;
    const t = L[Math.floor((R ? R() : rnd()) * L.length)];
    return { x: t.x + isl.ox, z: t.z + isl.oz, y: t.y, k: t.k, H: TREE_H[t.k] * t.s };
  }
  perchOn(t, sp, R) {
    const r = R ? R : rnd, a = r() * TAU, f = sp.rig === 'quad' && sp.type === 'tree' && sp.mass < 1 ? 0.25 + r() * 0.4 : 0.55 + r() * 0.3;
    const off = sp.mass < 1 && sp.rig === 'quad' ? 0.22 : t.H * (0.08 + r() * 0.1);
    return { x: t.x + Math.sin(a) * off, z: t.z + Math.cos(a) * off, tree: t, perch: { x: t.x + Math.sin(a) * off, z: t.z + Math.cos(a) * off, y: t.y + t.H * f, h: sp.mass < 1 && sp.rig === 'quad' ? a + Math.PI : a } };
  }

  // ---------------------------------------------------------------- moving about on the ground
  terrainAt(a, x, z) { const isl = a.isl; return isl.inside(x, z) ? Math.max(isl.terrain(x, z), isl.water(x, z)) : 0; }
  ground(a, now) {
    const isl = a.isl;
    if (!isl.inside(a.x, a.z)) return;
    const sp = a.sp;
    if (sp.rig === 'bird' || sp.rig === 'fly') { const h = isl.height(a.x, a.z), w = isl.water(a.x, a.z); a.y = sp.type === 'wade' ? h : Math.max(h, w); a.wading = Math.max(0, w - h); return; }
    if (sp.medium === 'water' || ((sp.aquatic || sp.type === 'bask') && a.st === 'swim')) {
      const t = isl.terrain(a.x, a.z), w = isl.water(a.x, a.z);
      a.y = sp.rig === 'bird' ? w : Math.max(t + 0.05, w - (sp.sub ?? 0.12) * sp.sh * a.s - (a.dive || 0));
      return;
    }
    a.y = isl.height(a.x, a.z);
    if ((sp.medium === 'shore' || sp.aquatic) && sp.type !== 'wade') { const w = isl.water(a.x, a.z); if (w > a.y) a.y = Math.max(a.y, w - sp.sh * a.s * 0.7); }
    if (now || sp.len > 0.8) {
      const L = sp.len * a.s * 0.4, sx = Math.sin(a.h) * L, sz = Math.cos(a.h) * L;
      const f = isl.height(a.x + sx, a.z + sz), b = isl.height(a.x - sx, a.z - sz);
      a.slope = clamp(Math.atan2(b - f, 2 * L), -0.5, 0.5);
    }
  }
  // turn towards heading hw and run at speed vw; stops (and says so) when the way ahead is blocked
  go(a, dt, hw, vw, roads, charge) {
    const sp = a.sp, dh = wrap(hw - a.h), tr = sp.turn * (a.v > sp.trot ? 0.7 : 1) * dt;
    a.h = wrap(a.h + clamp(dh, -tr, tr));
    const acc = (vw > a.v ? sp.acc : sp.acc * 1.6) * dt;
    a.v += clamp(vw - a.v, -acc, acc);
    if (Math.abs(dh) > 1.4 && a.v > sp.walk) a.v = Math.max(sp.walk, a.v - sp.acc * 2 * dt);     // too sharp: slow down to turn
    if (a.v < 0.01) { a.v = 0; return true; }
    // look a little ahead now and then (most of the cost is here)
    a.chk -= dt;
    if (a.chk <= 0) {
      a.chk = 0.25; const la = Math.max(1, a.v * 0.6 + sp.len * 0.5);
      a.free = this.okSpot(sp, a.isl, a.x + Math.sin(a.h) * la, a.z + Math.cos(a.h) * la, true) && (roads || !this.onRoad(a, a.x + Math.sin(a.h) * la, a.z + Math.cos(a.h) * la));
      if (!a.free && roads) a.free = this.okWalk(a, a.x + Math.sin(a.h) * la, a.z + Math.cos(a.h) * la);
    }
    if (!a.free) { a.v = 0; return false; }
    const nx = a.x + Math.sin(a.h) * a.v * dt, nz = a.z + Math.cos(a.h) * a.v * dt;
    // never into the car: wait or step round it
    if (!charge && this.inCar(nx, nz, sp.len * a.s * 0.5 + 0.6)) { a.v = 0; return false; }
    a.x = nx; a.z = nz;
    this.ground(a);
    return true;
  }
  okWalk(a, x, z) {     // the loose check without the road rule (crossing)
    const isl = a.isl; if (!isl.inside(x, z, 30)) return false;
    const lx = x - isl.ox, lz = z - isl.oz, dep = isl.water(x, z) - isl.terrain(x, z);
    if (dep > -0.1 && a.sp.medium !== 'shore' && !a.sp.aquatic) return false;
    if (isl.inBuilding(lx, lz, 0.5)) return false;
    const q = isl.roads.query(lx, lz); return !(q && q.bridge && q.d < q.hw + 3);
  }
  onRoad(a, x, z) { const q = a.isl.roads.query(x - a.isl.ox, z - a.isl.oz); return q && q.d < q.hw + 1; }
  inCar(x, z, r) {
    const c = this.car; if (!c) return false;
    const dx = x - c.pos.x, dz = z - c.pos.z; if (dx * dx + dz * dz > 100) return false;
    const fl = Math.hypot(c.fw.x, c.fw.z) || 1, ux = c.fw.x / fl, uz = c.fw.z / fl, u = dx * ux + dz * uz, v = dx * uz - dz * ux, B = c.box || { hl: 2.3, hw: 0.9 };
    return Math.abs(u) < B.hl + r && Math.abs(v) < B.hw + r;
  }
  // a heading away from (dx,dz) that is free, trying wider and wider turns
  escape(a, dx, dz, spread = 0.4) {
    const base = Math.atan2(dx, dz) + (rnd() - 0.5) * spread;
    for (const o of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2, Math.PI]) {
      const h = base + o, L = Math.max(4, a.sp.len * 2);
      if (this.okSpot(a.sp, a.isl, a.x + Math.sin(h) * L, a.z + Math.cos(h) * L, true)) return h;
    }
    return base;
  }
  wanderTarget(a, cx, cz, r) {
    for (let k = 0; k < 6; k++) {
      const ang = rnd() * TAU, d = r * Math.sqrt(rnd()), x = cx + Math.sin(ang) * d, z = cz + Math.cos(ang) * d;
      if (this.okSpot(a.sp, a.isl, x, z, true) && !this.onRoad(a, x, z)) { a.tx = x; a.tz = z; return true; }
    }
    return false;
  }
  toward(a) { return Math.atan2(a.tx - a.x, a.tz - a.z); }
  // gait from speed: 0 walk, 1 trot, 2 gallop (3 bound, 4 pace from the species); the phase runs with the distance covered
  stride(a, dt) {
    const sp = a.sp, v = a.v, g0 = sp.gait0 ?? 0;
    let gw = g0; if (sp.gaits && (g0 === 0 || g0 === 4)) gw = v > sp.gaits[1] ? 2 : v > sp.gaits[0] ? 1 : g0;
    if (a.st === 'pronk') gw = 5;
    a.gait += clamp(gw - a.gait, -dt * 3, dt * 3);
    const len = sp.sh * a.s * [1.0, 1.5, 2.6, 2.2, 1.1, 1.6][Math.round(a.gait)], amp = v < 0.05 ? 0 : [0.32, 0.45, 0.72, 0.85, 0.34, 0.3][Math.round(a.gait)] * Math.min(1, 0.4 + v / Math.max(0.3, sp.walk));
    a.ph = (a.ph + TAU * v / len * dt) % (TAU * 64);
    a.amp += (amp - a.amp) * Math.min(1, dt * 6);
    // the body: bobs with each step, rocks in the gallop, bounces in the pronk
    const g = Math.round(a.gait), k = a.amp;
    a.bob = g === 5 ? 0.55 * Math.max(0, Math.sin(a.ph)) * (k > 0.1 ? 1 : 0) : g === 3 ? sp.sh * a.s * 0.3 * Math.max(0, Math.sin(a.ph)) * k : sp.sh * a.s * (g === 2 ? 0.05 : g === 1 ? 0.03 : 0.012) * Math.cos(2 * a.ph) * k;
    a.rock = g === 2 || g === 3 ? 0.1 * Math.sin(a.ph + 0.6) * k : 0;
  }
  // the head and the tail: looking at something, grazing, swishing at flies
  pose(a, dt, look, down) {
    const sp = a.sp;
    let hy = 0, hp = down ? 1 : a.v > sp.walk * 1.5 ? -0.1 : 0;
    if (look) { hy = clamp(wrap(Math.atan2(-a.tdx, -a.tdz) - a.h), -1.2, 1.2); hp = -0.15; }
    else if (!down && a.v < 0.05) hy = Math.sin(this.t * 0.3 + a.seed * 9) * 0.5;
    a.hp += (hp - a.hp) * Math.min(1, dt * 4); a.hy += (hy - a.hy) * Math.min(1, dt * 4);
    a.tail = Math.sin(this.t * (look ? 4 : 1.6) + a.seed * 20) * (0.35 + (sp.id === 'ku' || sp.id === 'sebra' || sp.id === 'gnu' ? 0.35 : 0));
  }

  // ---------------------------------------------------------------- herds and loners on the ground
  group(g, dt, V) {
    const m = g.m; if (!m.length) return;
    let x = 0, z = 0; for (const a of m) { x += a.x; z += a.z; } g.cx = x / m.length; g.cz = z / m.length;
    if (g.flee > 0) g.flee -= dt;
    g.t -= dt;
    if (g.t <= 0 && g.sp.type === 'graze') {           // the herd drifts on: a new place to graze near home
      g.t = 25 + rnd() * 50;
      for (let k = 0; k < 6; k++) { const a = rnd() * TAU, r = g.sp.range * Math.sqrt(rnd()), px = g.hx + Math.sin(a) * r, pz = g.hz + Math.cos(a) * r; if (this.okSpot(g.sp, g.isl, px, pz, false)) { g.gx = px; g.gz = pz; break; } }
    }
  }
  startle(a, V) {
    const g = a.grp, sp = a.sp;
    if (g.flee > 0 && a.st === 'flee') return;
    g.flee = sp.fleeT || 4; g.fx = a.tdx; g.fz = a.tdz;
    for (const b of g.m) if (b.st !== 'down' && b.st !== 'up') {
      b.st = sp.pronk && rnd() < 0.6 ? 'pronk' : 'flee'; b.t = (sp.fleeT || 4) * (0.8 + rnd() * 0.5) + (b === a ? 0 : rnd() * 0.4); b.fh = null; b.lie = Math.min(b.lie, 0.6);
    }
    if (sp.call && rnd() < 0.5) this.events.push({ type: 'call', a, kind: sp.call, alarm: true });
  }
  graze(a, dt, V) {
    const sp = a.sp, g = a.grp; a.t -= dt;
    const night = V.night > 0.5, fr = sp.flee * a.fear * (night && !sp.night ? 0.7 : 1);
    if (a.st !== 'flee' && a.st !== 'pronk' && a.st !== 'stare' && a.td < fr) { if (!(sp.curious && a.td > 3)) this.startle(a, V); }
    else if (a.td < sp.alert * Math.min(1.4, a.fear) && CALM.has(a.st)) { a.st = 'alert'; a.t = 3 + rnd() * 3; }
    let vw = 0, hw = a.h, roads = false, look = false, down = false;
    switch (a.st) {
      case 'idle':
        if (a.t <= 0) {
          const r = rnd(), far = Math.hypot(a.x - g.gx, a.z - g.gz) > sp.spread + 6;
          if (sp.roads === 'cross' && r < 0.12 && this.planCross(a)) break;
          if (far && this.wanderTarget(a, g.gx, g.gz, sp.spread + 2)) { a.st = 'walk'; a.t = 30; }
          else if (r < 0.55) { a.st = 'graze'; a.t = 4 + rnd() * 10; }
          else if ((sp.lies || sp.sits) && r < 0.55 + (sp.lies || sp.sits) * 0.25) { a.st = 'lie'; a.t = 20 + rnd() * 40; }     // cats and dogs sit
          else if (this.wanderTarget(a, g.gx, g.gz, sp.spread + 3)) { a.st = 'walk'; a.t = 20; }
          else a.t = 2 + rnd() * 3;
        }
        break;
      case 'graze':
        down = !sp.browse; if (rnd() < dt * 0.25) a.lookT = 1.5 + rnd() * 1.5;
        if (a.lookT > 0) { a.lookT -= dt; down = false; }
        if (rnd() < dt * 0.15) { a.nib = 0.8 + rnd() * 1.2; }
        if (a.nib > 0) { a.nib -= dt; vw = sp.walk * 0.3; }
        if (a.t <= 0) { a.st = 'idle'; a.t = 1 + rnd() * 4; }
        break;
      case 'walk': {
        hw = this.toward(a); vw = sp.walk * (sp.id === 'katt' ? 1 : 0.9);
        if (Math.hypot(a.tx - a.x, a.tz - a.z) < 1.2 || a.t <= 0 || !a.free && a.v === 0 && a.t < 18) { a.st = rnd() < 0.7 ? 'graze' : 'idle'; a.t = 3 + rnd() * 8; a.free = true; }
        break;
      }
      case 'alert':
        look = true; a.lie = Math.max(0, a.lie - dt * 2);
        if (a.td > sp.alert * 1.3 && a.t <= 0) { a.st = 'idle'; a.t = 1 + rnd() * 2; }
        if (sp.curious && a.td < 25 && a.td > 4) { hw = Math.atan2(-a.tdx, -a.tdz); vw = sp.walk; }
        break;
      case 'pronk': case 'flee': {
        if (a.fh == null || rnd() < dt * 0.6) a.fh = this.escape(a, a.tdx * 0.7 + g.fx * 0.3, a.tdz * 0.7 + g.fz * 0.3, 0.6);
        hw = a.fh; roads = true;
        vw = a.st === 'pronk' ? sp.trot : sp.id === 'elg' || sp.id === 'ku' ? (a.td < 12 ? sp.run * 0.8 : sp.trot) : sp.run * (a.young ? 0.85 : 1);
        if (a.st === 'pronk' && a.t < (sp.fleeT || 4) * 0.6) a.st = 'flee';
        // herd: keep together, keep apart
        if (g.m.length > 1) { const cx = g.cx - a.x, cz = g.cz - a.z, d = Math.hypot(cx, cz); if (d > sp.spread * 1.5) hw = wrap(hw + clamp(wrap(Math.atan2(cx, cz) - hw), -0.5, 0.5)); }
        if (a.t <= 0 && a.td > sp.flee * 1.3) { a.st = 'alert'; a.t = 4 + rnd() * 4; }
        else if (a.t <= 0) a.t = 1.5;
        break;
      }
      case 'cross': {
        hw = this.toward(a); vw = a.crossV || sp.walk; roads = true;
        const onRoad = this.onRoad(a, a.x, a.z);
        if (onRoad && !a.stared && V.car && a.td < 110 && a.td > 14 && V.tsp > 3 && -(V.tvx * a.tdx + V.tvz * a.tdz) / (V.tsp * a.td) > 0.8) {
          a.stared = true; if (rnd() < (V.lights && V.night > 0.4 ? 0.7 : 0.35)) { a.st = 'stare'; a.t = 3 + rnd() * 4; }
        }
        if (Math.hypot(a.tx - a.x, a.tz - a.z) < 1.5 || a.t <= 0) { a.st = 'graze'; a.t = 5 + rnd() * 6; a.crossV = 0; }
        break;
      }
      case 'stare':        // in the headlights: turns to the car and stands there
        look = true; hw = Math.atan2(-a.tdx, -a.tdz); vw = 0;
        if (a.td < 11 || V.honkT > 0 || a.t <= 0) { a.st = 'cross'; a.crossV = a.td < 25 || V.honkT > 0 ? sp.trot : sp.walk; a.t = 20; }
        break;
      case 'lie':
        if (a.t <= 0 || a.td < sp.alert * 0.6 * a.fear) { a.st = 'idle'; a.t = 1 + rnd() * 2; }
        break;
    }
    // leashed to home: a herd that ran far walks back
    if (a.st === 'idle' && Math.hypot(a.x - a.hx, a.z - a.hz) > sp.range * 1.3) { g.gx = a.hx; g.gz = a.hz; }
    a.lie += ((a.st === 'lie' ? 1 : 0) - a.lie) * Math.min(1, dt * 1.5);
    if (a.lie > 0.05 && a.st !== 'lie') vw = 0;
    if (a.st !== 'stare' || a.v > 0.05 || Math.abs(wrap(hw - a.h)) > 0.05) this.go(a, dt, hw, vw, roads || a.st === 'cross');
    this.stride(a, dt); this.pose(a, dt, look || a.st === 'stare', down && a.v < sp.walk);
    a.roll *= Math.max(0, 1 - dt * 3);
    if (sp.call && rnd() < dt / 90 && a.dc < 200) this.events.push({ type: 'call', a, kind: sp.call });
  }
  // a road within reach: walk over it to the far side
  planCross(a) {
    const isl = a.isl, F = isl.roads.seg.F;
    for (const r of [12, 30]) for (const [dx, dz] of DIRS) {
      const q = isl.roads.query(a.x + dx * r - isl.ox, a.z + dz * r - isl.oz); if (!q || q.bridge) continue;
      const o = q.seg * 6, px = F[o] + (F[o + 3] - F[o]) * q.t + isl.ox, pz = F[o + 1] + (F[o + 4] - F[o + 1]) * q.t + isl.oz;
      let nx = -q.tz, nz = q.tx; if (nx * (a.x - px) + nz * (a.z - pz) > 0) { nx = -nx; nz = -nz; }
      const D = q.hw + 6 + rnd() * 10, tx = px + nx * D, tz = pz + nz * D;
      if (!this.okSpot(a.sp, isl, tx, tz, true) || this.onRoad(a, tx, tz)) continue;
      a.st = 'cross'; a.tx = tx; a.tz = tz; a.t = 60; a.stared = false; a.crossV = a.sp.walk; return true;
    }
    return false;
  }
  // now and then, on a forest road, a moose (or reindeer) steps out a couple of hundred metres ahead of the car
  roadEvent(dt, V) {
    const car = V.car, tsp = Math.hypot(V.tvx || 0, V.tvz || 0); if (!car || tsp < 9) return;
    if ((this.evT -= dt) > 0) return;
    this.evT = 70 + rnd() * 80;
    const isl = this.world.islandAt(car.pos.x, car.pos.z); if (!isl || isl.def.backdrop) return;
    const bio = isl.def.biome || 'nordic', sp = SPECIES.find(s => s.id === (bio === 'nordic' ? 'elg' : bio === 'winter' ? 'rein' : bio === 'savanna' ? 'sebra' : ''));
    if (!sp) return;
    const P = this.roadAhead(isl, car, 150 + rnd() * 70); if (!P || Math.hypot(P.x - car.pos.x, P.z - car.pos.z) < P.d * 0.6) return;     // not a road that turns back on itself
    const side = rnd() < 0.5 ? 1 : -1, nx = -P.tz * side, nz = P.tx * side, cv = sp.id === 'elg' ? sp.walk * 1.6 : sp.trot, D = clamp(P.hw + cv * (P.d / tsp - 2), P.hw + 3, P.hw + 16);
    const s = { x: P.x + nx * D, z: P.z + nz * D }, t = { x: P.x - nx * (P.hw + 12), z: P.z - nz * (P.hw + 12) };
    if (!FORESTS.has(isl.coverAt(s.x, s.z)) && bio !== 'savanna' && bio !== 'winter') return;
    if (!this.okSpot(sp, isl, s.x, s.z, true) || !this.okSpot(sp, isl, t.x, t.z, true)) return;
    const key = 'e' + (this.evN++), cell = { ri: 2, x: s.x, z: s.z, list: [], ev: true }, R = mulberry32(this.evN * 977);
    this.cells[2].set(key, cell);
    const g = { sp, isl, m: [], hx: t.x, hz: t.z, gx: t.x, gz: t.z, t: 60, flee: 0, fx: 0, fz: 0, mode: 'ground', cell };
    const n = sp.id === 'elg' ? 1 + (rnd() < 0.3 ? 1 : 0) : 3 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) {
      const a = this.mk(sp, isl, { x: s.x + nx * k * 3 + (rnd() - 0.5) * 3, z: s.z + nz * k * 3 + (rnd() - 0.5) * 3 }, R, g, k > 0 && sp.id === 'elg', k);
      a.st = 'cross'; a.tx = t.x + (rnd() - 0.5) * 6; a.tz = t.z + (rnd() - 0.5) * 6; a.crossV = cv; a.t = 60; a.h = Math.atan2(-nx, -nz); a.ev = true;
      g.m.push(a); cell.list.push(a); this.animals.push(a);
    }
    this.groups.push(g); this.count[2] += n;
    this.events.push({ type: 'event', a: g.m[0], x: P.x, z: P.z });
  }
  // the point d metres ahead along the road the car is on: {x,z,tx,tz (along), hw, d}
  roadAhead(isl, car, d) {
    const lx = car.pos.x - isl.ox, lz = car.pos.z - isl.oz, N = isl.roads, q = N.query(lx, lz); if (!q || q.d > q.hw + 2) return null;
    let ri = q.road, i0 = N.seg.I[q.seg * 2 + 1], dir = q.tx * car.fw.x + q.tz * car.fw.z >= 0 ? 1 : -1, px = lx, pz = lz, acc = 0, hw = q.hw;
    for (let hop = 0; hop < 12; hop++) {
      const r = N.roads[ri], p = r.p, m = p.length / 3; let i = dir > 0 ? i0 + 1 : i0, ex = 0, ez = 0;
      while (i >= 0 && i < m) {
        const x = p[i * 3], z = p[i * 3 + 1], L = Math.hypot(x - px, z - pz);
        if (r.b && r.b.includes(i)) return null;
        if (acc + L >= d) { const u = (d - acc) / (L || 1), tl = L || 1; return { x: px + (x - px) * u + isl.ox, z: pz + (z - pz) * u + isl.oz, tx: (x - px) / tl, tz: (z - pz) / tl, hw, d }; }
        if (L > 0.01) { ex = (x - px) / L; ez = (z - pz) / L; }
        acc += L; px = x; pz = z; i += dir;
      }
      // the end of this road: carry on along whichever road leaves from here the same way
      const n = N.query(px + ex * 3, pz + ez * 3); if (!n || n.road === ri || n.bridge) return null;
      ri = n.road; i0 = N.seg.I[n.seg * 2 + 1]; dir = n.tx * ex + n.tz * ez >= 0 ? 1 : -1; hw = n.hw;
      const P2 = N.roads[ri].p, k = dir > 0 ? i0 : i0 + 1; px = px + ex * 3; pz = pz + ez * 3; acc += 3;
      if (k < 0 || k >= P2.length / 3) return null;
    }
    return null;
  }
  // hit by the car: falls over and slides, lies a moment, gets up and runs off
  knocked(a, dt) {
    a.t -= dt;
    if (a.st === 'down') {
      const sp = Math.hypot(a.vx, a.vz), k = Math.max(0, 1 - 7 * dt / Math.max(sp, 0.01));
      a.vx *= k; a.vz *= k; a.vy -= 9.81 * dt;
      const nx = a.x + a.vx * dt, nz = a.z + a.vz * dt; if (this.okWalk(a, nx, nz)) { a.x = nx; a.z = nz; }
      const gy = a.isl.height(a.x, a.z); a.air = Math.max(0, (a.air || 0) + a.vy * dt); if (a.air <= 0) a.vy = 0; a.y = gy + a.air;
      a.roll += (a.rollT - a.roll) * Math.min(1, dt * 6); a.amp *= 0.9;
      if (a.t <= 0) { a.st = 'up'; a.t = 0.9; }
    } else {
      a.roll *= Math.max(0, 1 - dt * 4); a.y = a.isl.height(a.x, a.z);
      if (a.t <= 0) { a.roll = 0; const ty = a.sp.type; a.st = ty === 'graze' ? 'flee' : ty === 'pred' ? 'back' : ty === 'bask' ? 'return' : 'idle'; a.t = 5; a.fh = null; a.cool = 12; a.grp.flee = 5; a.grp.fx = a.tdx; a.grp.fz = a.tdz; }
    }
  }
  knock(a, h) {
    const sp = a.sp, j = Math.abs(h.j || 0), dv = Math.min(25, j / sp.mass);
    let dx = a.x - h.x, dz = a.z - h.z; const car = this.car;
    if (car) { const s = Math.hypot(car.vel.x, car.vel.z); if (s > 1) { dx = dx * 0.4 + car.vel.x / s; dz = dz * 0.4 + car.vel.z / s; } }
    const l = Math.hypot(dx, dz) || 1;
    a.noCol = 2.5; a.vx = dx / l * dv * 0.9; a.vz = dz / l * dv * 0.9; a.vy = Math.min(4, dv * 0.25); a.air = 0.01;
    if (dv > 2.2 || sp.mass < 150) { a.st = 'down'; a.t = 1.5 + Math.min(3, dv * 0.25); a.rollT = (rnd() < 0.5 ? 1 : -1) * Math.PI / 2; a.lie = 0; }
    else { a.st = 'flee'; a.t = 5; a.fh = Math.atan2(dx, dz); }
    // a moose over the bonnet: the car's nose is thrown up and it lurches
    if (car && sp.mass >= 300) { const k = Math.min(1.5, j / 9000); car.vel.y += 1.4 * k; car.w.x += (rnd() - 0.5) * 1.2 * k; car.w.y += (rnd() - 0.5) * 1.6 * k; }
    this.events.push({ type: 'hit', a, j, dv });
  }

  // ---------------------------------------------------------------- predators: rest, look, charge the car, give up
  pred(a, dt, V) {
    const sp = a.sp, P = sp.pred; a.t -= dt; a.cool -= dt;
    const car = V.car, d = car ? this.bodyDist(a, car) : 1e9, home = Math.hypot(a.x - a.hx, a.z - a.hz);
    const nearWater = !sp.aquatic || (car && (car.pos.y < a.isl.water(car.pos.x, car.pos.z) + 0.8 || d < P.charge));
    const see = car && V.pen && a.cool <= 0 && nearWater;
    let vw = 0, hw = a.h, look = false;
    if (sp.aquatic) { const w = a.isl.water(a.x, a.z), t = a.isl.terrain(a.x, a.z); a.inWater = w - t > 0.25; }
    switch (a.st) {
      case 'rest': case 'idle': case 'walk': case 'bask': case 'swim':
        if (see && d < P.charge) { a.st = 'charge'; a.t = P.chargeT; this.warn(a); this.events.push({ type: 'call', a, kind: sp.call, roar: true }); break; }
        if (see && d < P.alert && !sp.aquatic) { a.st = 'alert'; a.t = 2; this.warn(a); break; }
        if (a.st === 'rest') { if (a.t <= 0 && !sp.lies) { a.st = 'idle'; a.t = 5 + rnd() * 10; } else if (a.t <= 0) a.t = 20 + rnd() * 30; break; }
        if (a.st === 'idle' && a.t <= 0) {
          if (sp.lies && rnd() < 0.6) { a.st = 'rest'; a.t = 30 + rnd() * 60; }
          else if (!sp.aquatic && this.wanderTarget(a, a.hx, a.hz, Math.min(60, P.leash * 0.4))) { a.st = 'walk'; a.t = 30; }
          else a.t = 5 + rnd() * 10;
        }
        if (a.st === 'walk') { hw = this.toward(a); vw = sp.walk; if (Math.hypot(a.tx - a.x, a.tz - a.z) < 1.5 || a.t <= 0) { a.st = 'idle'; a.t = 5 + rnd() * 15; } }
        if (sp.aquatic && a.st === 'bask') { a.jaw = Math.max(0, Math.sin(this.t * 0.2 + a.seed * 30)) * 0.5; }
        break;
      case 'alert':
        look = true; hw = Math.atan2(-a.tdx, -a.tdz); a.lie = Math.max(0, a.lie - dt * 2);
        if (see && d < P.charge) { a.st = 'charge'; a.t = P.chargeT; this.events.push({ type: 'call', a, kind: sp.call, roar: true }); }
        else if (!see || d > P.alert * 1.3) { if (a.t <= 0) { a.st = sp.lies ? 'rest' : 'idle'; a.t = 10 + rnd() * 10; } }
        else a.t = 2;
        break;
      case 'charge': {
        // lead the car a little; the turn rate is the species' (a cheetah runs wide, so swerve)
        const lead = clamp(d / sp.run, 0, 1.2), px = car ? car.pos.x + car.vel.x * lead : a.x, pz = car ? car.pos.z + car.vel.z * lead : a.z;
        hw = Math.atan2(px - a.x, pz - a.z); vw = sp.run; look = true; a.jaw = 0.5;
        if (car && d < 0.45 + sp.wid * 0.3) { this.attack(a, car, V); a.st = 'back'; a.cool = P.rest; a.t = 25; }
        else if (!car || a.t <= 0 || home > P.leash || !V.pen) { a.st = 'back'; a.cool = P.rest * 0.5; a.t = 25; }
        break;
      }
      case 'back':
        hw = Math.atan2(a.hx - a.x, a.hz - a.z); vw = sp.aquatic ? sp.swim : sp.walk * 1.3; a.jaw *= 0.9;
        if (home < 2 || a.t <= 0) { a.st = sp.aquatic ? 'bask' : sp.lies ? 'rest' : 'idle'; a.t = 20 + rnd() * 20; }
        break;
    }
    a.lie += (((a.st === 'rest') ? 1 : 0) - a.lie) * Math.min(1, dt * 1.2);
    if (a.lie > 0.1 && a.st !== 'rest') vw = 0;
    this.go(a, dt, hw, vw, true, a.st === 'charge');
    if (sp.aquatic) this.ground(a);
    this.stride(a, dt); this.pose(a, dt, look, a.st === 'idle' && rnd() < 0.002);
    if (a.st !== 'charge' && a.st !== 'bask') a.jaw *= 0.95;
    if (sp.call && rnd() < dt / 120 && a.dc < 300 && a.st !== 'charge') this.events.push({ type: 'call', a, kind: sp.call });
  }
  warn(a) { if (a.grp.warned > this.t - 8) return; a.grp.warned = this.t; this.events.push({ type: 'warn', a, text: a.sp.pred.warn }); }
  // distance from the animal's nose to the car's body (a box), in the ground plane
  bodyDist(a, car) {
    const nx = a.x + Math.sin(a.h) * a.sp.len * a.s * 0.5, nz = a.z + Math.cos(a.h) * a.sp.len * a.s * 0.5, dx = nx - car.pos.x, dz = nz - car.pos.z;
    const fl = Math.hypot(car.fw.x, car.fw.z) || 1, ux = car.fw.x / fl, uz = car.fw.z / fl, B = car.box || { hl: 2.3, hw: 0.9 };
    const u = Math.abs(dx * ux + dz * uz) - B.hl, v = Math.abs(dx * uz - dz * ux) - B.hw;
    return Math.hypot(Math.max(u, 0), Math.max(v, 0));
  }
  // the hit: the animal's momentum goes into the car (it is thrown about), and what it costs
  attack(a, car, V) {
    const sp = a.sp, p = sp.mass * Math.max(a.v, sp.run * 0.6), dv = Math.min(4, p / (car.m || 1500)), k = clamp(p / 3000, 0.3, 1.5);
    const ux = Math.sin(a.h), uz = Math.cos(a.h);
    car.vel.x += ux * dv; car.vel.z += uz * dv; car.vel.y += 0.7 * k;
    car.w.y += (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 0.6) * k; car.w.x += (rnd() - 0.5) * 0.9 * k; car.w.z += (rnd() - 0.5) * 0.9 * k;
    this.events.push({ type: 'attack', a, dv, pen: V.pen });
  }

  // ---------------------------------------------------------------- tree dwellers: squirrels, monkeys
  tree(a, dt, V) {
    const sp = a.sp; a.t -= dt;
    const scared = a.td < sp.flee * a.fear;
    switch (a.st) {
      case 'perch': {
        a.v = 0; a.amp *= 0.9;
        const look = a.td < sp.alert * 1.5; this.pose(a, dt, look, false);
        if (sp.mass < 1) { a.pitch = -1.3; a.lie = 0; } else { a.lie = sp.sits ? 1 : 0; a.pitch = 0; }
        if (a.t <= 0 || (scared && sp.mass > 1)) {
          a.t = 4 + rnd() * 10;
          const t = this.treesNear(a.isl, a.x, a.z, sp.mass < 1 ? 14 : 16, sp.trees);
          if (sp.mass < 1 && !scared && rnd() < 0.5 && V.night < 0.5) { a.st = 'climb'; a.dir = -1; a.lie = 0; }
          else if (t && (t.x !== a.tree?.x || t.z !== a.tree?.z)) { const p = this.perchOn(t, sp); a.st = 'jump'; a.from = { x: a.x, y: a.y, z: a.z }; a.to = p; a.u = 0; a.tree = t; a.T = Math.max(0.6, Math.hypot(p.x - a.x, p.z - a.z) / 6); a.h = Math.atan2(p.x - a.x, p.z - a.z); if (sp.call && rnd() < 0.3) this.events.push({ type: 'call', a, kind: sp.call }); }
        }
        break;
      }
      case 'jump': {
        a.u += dt / a.T; const u = Math.min(1, a.u), P = a.to.perch;
        a.x = a.from.x + (P.x - a.from.x) * u; a.z = a.from.z + (P.z - a.from.z) * u; a.y = a.from.y + (P.y - a.from.y) * u + Math.sin(Math.PI * u) * (1 + a.T);
        a.v = Math.hypot(P.x - a.from.x, P.z - a.from.z) / a.T; a.gait = 3; a.amp = 0.6; a.ph += dt * 12; a.lie = 0; a.pitch = 0;
        if (u >= 1) { a.st = 'perch'; a.perch = P; a.h = P.h; a.t = 3 + rnd() * 8; }
        break;
      }
      case 'climb': {       // squirrels: down the trunk, about on the ground, back up
        const tr = a.tree; if (!tr) { a.st = 'perch'; break; }
        a.pitch = a.dir < 0 ? 1.3 : -1.3; a.v = 1.2; a.y += a.dir * 1.2 * dt; a.amp = 0.6; a.gait = 3; a.ph += dt * 14;
        const gy = a.isl.height(a.x, a.z);
        if (a.dir < 0 && a.y <= gy + 0.05) { a.y = gy; a.st = 'forage'; a.t = 4 + rnd() * 8; a.pitch = 0; }
        if (a.dir > 0 && a.y >= (a.perch ? a.perch.y : gy + 4)) { a.st = 'perch'; a.t = 5 + rnd() * 10; }
        break;
      }
      case 'forage': {
        const tr = a.tree, home = tr ? Math.hypot(a.x - tr.x, a.z - tr.z) : 0;
        let hw = a.h, vw = 0;
        if (scared || a.t <= 0) { hw = Math.atan2(tr.x - a.x, tr.z - a.z); vw = scared ? sp.run : sp.trot; if (home < 0.5) { a.st = 'climb'; a.dir = 1; a.perch = a.perch || { y: tr.y + 4, h: a.h }; } }
        else if (rnd() < dt * 0.5) { a.fh = rnd() * TAU; a.hopT = 0.5; }
        if (a.hopT > 0 && !scared && a.t > 0) { a.hopT -= dt; hw = a.fh; vw = sp.trot * 0.6; if (home > 6) hw = Math.atan2(tr.x - a.x, tr.z - a.z); }
        this.go(a, dt, hw, vw, false); this.stride(a, dt); this.pose(a, dt, false, vw === 0);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- birds that sit, walk and fly up together
  flock(a, dt, V) {
    const sp = a.sp, g = a.grp; a.t -= dt;
    if (a.st === 'sit') {
      // a flock flies up together when one of them is scared (or now and then, by day)
      const scared = a.td < sp.flee * a.fear;
      if (scared || (g.mode === 'air' && g.lift > 0) || (V.night < 0.5 && g.mode === 'ground' && a === g.m[0] && rnd() < dt / (sp.treeOnly ? 40 : 120))) { this.takeoff(g, a, V); return; }
      a.fold = Math.min(1, a.fold + dt * 3); a.famp = 0; a.tuck = 0;
      if (sp.medium === 'water' || (a.y <= a.isl.water(a.x, a.z) + 0.02 && !a.perch)) {    // paddling
        if (rnd() < dt * 0.2) a.fh = a.h + (rnd() - 0.5) * 2;
        const vw = a.fh != null ? sp.walk * 0.5 : 0; a.h += clamp(wrap((a.fh ?? a.h) - a.h), -dt, dt);
        const nx = a.x + Math.sin(a.h) * vw * dt, nz = a.z + Math.cos(a.h) * vw * dt;
        if (this.okSpot(sp, a.isl, nx, nz, true) || (sp.medium !== 'water' && a.isl.water(nx, nz) - a.isl.terrain(nx, nz) > 0.3)) { a.x = nx; a.z = nz; }
        a.y = a.isl.water(a.x, a.z); a.v = 0; a.amp = 0;
      } else if (!a.perch) {     // walking and pecking on the ground
        let vw = 0;
        if (a.walkT > 0) { a.walkT -= dt; vw = sp.walk; } else if (rnd() < dt * 0.3) { a.walkT = 0.5 + rnd() * 2; a.fh = a.h + (rnd() - 0.5) * 2.5; if (Math.hypot(a.x - g.gx, a.z - g.gz) > sp.spread) a.fh = Math.atan2(g.gx - a.x, g.gz - a.z); }
        this.go(a, dt, a.fh ?? a.h, vw, sp.roads === 'any'); this.stride(a, dt);
      }
      // pecking, looking round
      if (rnd() < dt * 0.6) a.peck = 0.35;
      if (a.peck > 0) a.peck -= dt;
      a.hp += ((a.peck > 0 ? 1.1 : a.td < sp.alert ? -0.2 : 0) - a.hp) * Math.min(1, dt * 10);
      a.hy = a.td < sp.alert ? clamp(wrap(Math.atan2(-a.tdx, -a.tdz) - a.h), -1.4, 1.4) : Math.sin(this.t * 0.7 + a.seed * 9) * 0.6;
      if (sp.call && rnd() < dt / 40 && a.dc < 150 && V.night < 0.6) this.events.push({ type: 'call', a, kind: sp.call });
      return;
    }
    if (a.st === 'fly' || a.st === 'land') return this.fly(a, dt, V);
  }
  takeoff(g, a0, V) {
    const sp = g.sp;
    if (g.mode !== 'air') {
      g.mode = 'air'; g.lift = 0.6; g.t = (sp.treeOnly ? 10 : 15) + rnd() * 25; g.landing = false;
      const away = a0.td < 200 ? Math.atan2(a0.tdx, a0.tdz) : rnd() * TAU, r = 40 + rnd() * 60;
      g.ox = a0.x + Math.sin(away) * r; g.oz = a0.z + Math.cos(away) * r; g.or = sp.low ? 25 + rnd() * 30 : 25 + rnd() * 40; g.ow = rnd() < 0.5 ? 1 : -1;
      g.oy = (sp.low ? 4 + rnd() * 6 : 14 + rnd() * 26) + (sp.treeOnly ? 30 : 0);
      if (sp.call) this.events.push({ type: 'call', a: a0, kind: sp.call, alarm: true });
    }
    for (const b of g.m) if (b.st === 'sit') { b.st = 'fly'; b.t = rnd() * 0.4; b.oa = rnd() * TAU; b.oo = (rnd() - 0.5) * 12; b.perch = null; const v = sp.fly * 0.5; b.vx = Math.sin(b.h) * v * 0.3; b.vz = Math.cos(b.h) * v * 0.3; b.vy = 2.5; }
  }
  fly(a, dt, V) {
    const sp = a.sp, g = a.grp, isl = a.isl;
    if (g.lift > 0) g.lift -= dt / g.m.length;
    if (a === g.m[0] && g.mode === 'air') {
      g.t -= dt;
      // the flock's circle drifts; when the time is up (and nothing scares them) they come down somewhere near home
      g.ox += Math.sin(this.t * 0.05 + a.seed * 7) * dt * 2; g.oz += Math.cos(this.t * 0.04 + a.seed * 5) * dt * 2;
      if (Math.hypot(g.ox - g.hx, g.oz - g.hz) > sp.range) { g.ox += (g.hx - g.ox) * dt * 0.05; g.oz += (g.hz - g.oz) * dt * 0.05; }
      if (g.t <= 0 && !g.landing && a.td > sp.flee * 2) this.planLanding(g);
    }
    let tx, ty, tz, landing = a.st === 'land';
    if (landing) { tx = a.tx; tz = a.tz; ty = a.ty; }
    else {
      a.oa = (a.oa || 0) + g.ow * sp.fly / Math.max(10, g.or + a.oo) * dt;
      tx = g.ox + Math.sin(a.oa) * (g.or + a.oo); tz = g.oz + Math.cos(a.oa) * (g.or + a.oo);
      ty = this.terrainAt(a, tx, tz) + g.oy + a.oo * 0.3;
      if (g.landing && a.lt) { a.st = 'land'; a.tx = a.lt.x; a.tz = a.lt.z; a.ty = a.lt.y; a.perch = a.lt.perch || null; a.tree = a.lt.tree || null; a.h0 = a.lt.h; a.lt = null; }
    }
    const dx = tx - a.x, dy = ty - a.y, dz = tz - a.z, dist = Math.hypot(dx, dy, dz) || 1, hd = Math.hypot(dx, dz);
    let spd = sp.fly * (landing ? clamp(dist / 12, 0.25, 1) : 1);
    const k = Math.min(1, dt * (landing && dist < 6 ? 4 : 1.6)), wvx = dx / dist * spd, wvy = clamp(dy / dist * spd, -4, 4), wvz = dz / dist * spd;
    const h0 = Math.atan2(a.vx, a.vz);
    a.vx += (wvx - a.vx) * k; a.vy += (wvy - a.vy) * k * 1.5; a.vz += (wvz - a.vz) * k;
    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    // never into the ground (or the trees) unless landing
    const gy = this.terrainAt(a, a.x, a.z), floor = gy + (landing && hd < 15 ? 0.05 : sp.low ? 2 : 6);
    if (!landing) { const ah = this.terrainAt(a, a.x + a.vx * 1.5, a.z + a.vz * 1.5) + (sp.low ? 2 : 6); if (ah > a.y) a.vy = Math.max(a.vy, (ah - a.y) * 1.5); }
    if (a.y < floor) { a.y += (floor - a.y) * Math.min(1, dt * 5); a.vy = Math.max(a.vy, 0); }
    if (a.y < gy + 0.05) a.y = gy + 0.05;
    const hs = Math.hypot(a.vx, a.vz);
    if (hs > 0.3) { const h = Math.atan2(a.vx, a.vz), turn = wrap(h - h0) / Math.max(dt, 1e-3); a.h = h; a.roll += (clamp(-Math.atan(turn * hs / 9.81), -0.9, 0.9) - a.roll) * Math.min(1, dt * 3); }
    a.pitch += (clamp(-Math.atan2(a.vy, hs), -0.7, 0.7) - a.pitch) * Math.min(1, dt * 3);
    // wings: beat when climbing, slow or taking off; glide otherwise (each species its own share of gliding)
    const climb = a.vy > 0.6 || hs < sp.fly * 0.6 || landing;
    a.glideT = (a.glideT ?? 0) - dt; if (a.glideT <= 0) { a.gliding = !climb && rnd() < (sp.glide || 0); a.glideT = 0.8 + rnd() * 2.5; }
    const fa = climb || !a.gliding ? 0.75 + (climb ? 0.2 : 0) : 0.04;
    a.famp += (fa - a.famp) * Math.min(1, dt * 6); a.fph = (a.fph + TAU * sp.flap * (climb ? 1.15 : 1) * dt) % TAU;
    a.fold += (0 - a.fold) * Math.min(1, dt * 6); a.tuck += (1 - a.tuck) * Math.min(1, dt * 4); a.v = hs; a.hp *= 0.9; a.hy *= 0.9;
    if (landing) {
      if (dist < 1.2) a.tuck = Math.max(0, a.tuck - dt * 6);
      if (dist < 0.25) { a.st = 'sit'; a.x = tx; a.z = tz; a.y = ty; a.vx = a.vy = a.vz = 0; a.roll = 0; a.pitch = 0; a.famp = 0; a.t = 5 + rnd() * 10; if (a.h0 != null) a.h = a.h0; if (g.m.every(b => b.st === 'sit')) { g.mode = 'ground'; g.landing = false; g.gx = tx; g.gz = tz; } }
    }
  }
  planLanding(g) {
    const sp = g.sp, isl = g.isl;
    for (let k = 0; k < 12; k++) {
      const ang = rnd() * TAU, r = 20 + rnd() * 60, x = g.ox + Math.sin(ang) * r, z = g.oz + Math.cos(ang) * r;
      if (Math.hypot(x - g.hx, z - g.hz) > sp.range) continue;
      if (sp.treeOnly || (sp.perch && rnd() < 0.5)) {
        const ok = g.m.map(() => { const t = this.treesNear(isl, x, z, 25, sp.perch); return t && this.perchOn(t, sp); });
        if (ok.every(Boolean)) { g.m.forEach((b, i) => { const p = ok[i]; b.lt = { x: p.perch.x, z: p.perch.z, y: p.perch.y, h: p.perch.h, perch: p.perch, tree: p.tree }; }); g.landing = true; return; }
        if (sp.treeOnly) continue;
      }
      if (!this.okSpot(sp, isl, x, z, false)) continue;
      for (const b of g.m) {
        let p = { x, z };
        for (let t = 0; t < 5; t++) { const aa = rnd() * TAU, rr = sp.spread * Math.sqrt(rnd()), c = { x: x + Math.sin(aa) * rr, z: z + Math.cos(aa) * rr }; if (this.okSpot(sp, isl, c.x, c.z, true)) { p = c; break; } }
        const wet = isl.water(p.x, p.z) > isl.terrain(p.x, p.z);
        b.lt = { x: p.x, z: p.z, y: wet ? isl.water(p.x, p.z) : isl.height(p.x, p.z), h: rnd() * TAU };
      }
      g.landing = true; return;
    }
    g.t = 5;      // nowhere good: another round
  }

  // ---------------------------------------------------------------- eagles, vultures, ravens: circling high
  soar(a, dt, V) {
    const sp = a.sp, o = a.orbit;
    a.ang += o.w * sp.fly / o.r * dt;
    o.x += Math.sin(this.t * 0.013 + a.seed * 11) * dt * 1.5; o.z += Math.cos(this.t * 0.011 + a.seed * 13) * dt * 1.5;
    if (Math.hypot(o.x - a.hx, o.z - a.hz) > sp.range) { o.x += (a.hx - o.x) * dt * 0.02; o.z += (a.hz - o.z) * dt * 0.02; }
    const tx = o.x + Math.sin(a.ang) * o.r, tz = o.z + Math.cos(a.ang) * o.r, ty = Math.max(this.terrainAt(a, tx, tz), 0) + o.alt + Math.sin(this.t * 0.07 + a.seed * 20) * 8;
    const px = a.x, pz = a.z; a.x += (tx - a.x) * Math.min(1, dt * 0.8); a.z += (tz - a.z) * Math.min(1, dt * 0.8); a.y += (ty - a.y) * Math.min(1, dt * 0.3);
    const vx = (a.x - px) / Math.max(dt, 1e-3), vz = (a.z - pz) / Math.max(dt, 1e-3);
    if (Math.hypot(vx, vz) > 0.5) a.h = Math.atan2(vx, vz);
    a.roll = -o.w * clamp(Math.atan(sp.fly * sp.fly / o.r / 9.81), 0, 0.6); a.pitch = 0; a.v = sp.fly;
    a.glideT = (a.glideT ?? 0) - dt; if (a.glideT <= 0) { a.gliding = rnd() < sp.glide; a.glideT = 2 + rnd() * 5; }
    a.famp += ((a.gliding ? 0.03 : 0.6) - a.famp) * Math.min(1, dt * 4); a.fph = (a.fph + TAU * sp.flap * dt) % TAU; a.fold = 0; a.tuck = 1;
    if (sp.call && rnd() < dt / 50 && a.dc < 600) this.events.push({ type: 'call', a, kind: sp.call });
  }

  // ---------------------------------------------------------------- in the water: hippos, anacondas
  swim(a, dt, V) {
    const sp = a.sp; a.t -= dt;
    if (a.td < sp.flee * a.fear && !(a.dive > 0.3)) { a.diveT = 6 + rnd() * 6; if (sp.call && rnd() < 0.5) this.events.push({ type: 'call', a, kind: sp.call, alarm: true }); }
    a.diveT = (a.diveT || 0) - dt;
    a.dive = (a.dive || 0) + ((a.diveT > 0 ? sp.sh * 0.5 : 0) - (a.dive || 0)) * Math.min(1, dt * 1.5);
    if (a.t <= 0) { a.t = 6 + rnd() * 14; if (!this.wanderTarget(a, a.hx, a.hz, sp.id === 'anakonda' ? 25 : 18)) { a.tx = a.x; a.tz = a.z; } }
    const d = Math.hypot(a.tx - a.x, a.tz - a.z), vw = d > 1.5 ? (a.diveT > 0 ? sp.swim * 1.5 : sp.swim) : 0;
    this.go(a, dt, this.toward(a), vw, true); this.ground(a);
    if (sp.rig === 'snake') { a.ph = (a.ph + dt * (1 + a.v * 3)) % (TAU * 64); a.amp = 0.6; }
    else { this.stride(a, dt); a.amp *= 0.4; this.pose(a, dt, a.td < sp.alert, false); if (rnd() < dt / 25) a.yawn = 2.5; }
    if (a.yawn > 0) { a.yawn -= dt; a.jaw = Math.sin(Math.min(1, a.yawn / 2.5) * Math.PI) * 1.1; a.hp = -0.5 * a.jaw; } else a.jaw *= 0.9;
    if (sp.call && rnd() < dt / 60 && a.dc < 200) this.events.push({ type: 'call', a, kind: sp.call });
  }
  // ---------------------------------------------------------------- caimans: on the bank, into the water when the car comes
  bask(a, dt, V) {
    const sp = a.sp; a.t -= dt;
    const scared = a.td < sp.flee * a.fear;
    let vw = 0, hw = a.h;
    if (scared && (a.st === 'bask' || a.st === 'return') && a.wet) { a.st = 'slide'; if (sp.call) this.events.push({ type: 'call', a, kind: sp.call }); }
    switch (a.st) {
      case 'bask': a.jaw = Math.max(0, Math.sin(this.t * 0.15 + a.seed * 30)) * 0.55; break;
      case 'slide': hw = Math.atan2(a.wet.x - a.x, a.wet.z - a.z); vw = sp.trot; a.jaw *= 0.8;
        if (Math.hypot(a.wet.x - a.x, a.wet.z - a.z) < 1) { a.st = 'swim'; a.t = 12 + rnd() * 10; this.events.push({ type: 'splash', a }); }
        break;
      case 'swim': if (a.t <= 0 && a.td > sp.flee * 2) { a.st = 'return'; a.t = 30; } else if (rnd() < dt * 0.2) a.fh = a.h + (rnd() - 0.5); hw = a.fh ?? a.h; vw = 0.15; break;
      case 'return': hw = Math.atan2(a.hx - a.x, a.hz - a.z); vw = sp.walk; if (Math.hypot(a.hx - a.x, a.hz - a.z) < 0.8 || a.t <= 0) { a.st = 'bask'; a.t = 20; } break;
    }
    this.go(a, dt, hw, vw, true);
    if (a.st === 'swim' || a.st === 'slide' || a.st === 'return') { const w = a.isl.water(a.x, a.z), t = a.isl.terrain(a.x, a.z); if (w - t > 0.25) a.y = Math.max(t, w - sp.sh * a.s * 0.75); }
    this.stride(a, dt); a.gait = 1;
  }
  // ---------------------------------------------------------------- egrets: wade and fish, fly a little way off
  wade(a, dt, V) {
    const sp = a.sp, g = a.grp; a.t -= dt;
    if (a.st === 'fly' || a.st === 'land') {
      if (a.st === 'fly' && !a.lt) { a.t -= dt; if (a.t < -4) { const p = this.wadeSpot(a); if (p) { a.st = 'land'; a.tx = p.x; a.tz = p.z; a.ty = a.isl.height(p.x, p.z); } } }
      if (!g.ox) { g.ox = a.x; g.oz = a.z; g.or = 20; g.ow = 1; g.oy = 6; }
      return this.fly(a, dt, V);
    }
    if (a.td < sp.flee * a.fear) {
      a.st = 'fly'; a.t = 0; g.mode = 'air'; const away = Math.atan2(a.tdx, a.tdz); g.ox = a.x + Math.sin(away) * 40; g.oz = a.z + Math.cos(away) * 40; g.or = 15; g.ow = 1; g.oy = 6; a.oo = 0; a.vy = 2;
      return;
    }
    a.fold = 1; a.famp = 0; a.tuck = 0;
    // stands still, then strikes: the neck shoots down; now and then a few slow steps
    if (a.t <= 0) { a.t = 2 + rnd() * 5; if (rnd() < 0.4) { a.strike = 0.4; } else { a.fh = a.h + (rnd() - 0.5) * 1.5; a.walkT = 1 + rnd() * 2; } }
    if (a.strike > 0) a.strike -= dt;
    let vw = 0; if (a.walkT > 0) { a.walkT -= dt; vw = sp.walk; }
    this.go(a, dt, a.fh ?? a.h, vw, false); this.stride(a, dt);
    a.hp += ((a.strike > 0 ? 1.3 : 0.15) - a.hp) * Math.min(1, dt * (a.strike > 0 ? 14 : 3)); a.hy *= 0.95;
  }
  wadeSpot(a) {
    for (let k = 0; k < 10; k++) { const ang = rnd() * TAU, r = 15 + rnd() * 60, x = a.hx + Math.sin(ang) * r, z = a.hz + Math.cos(ang) * r; if (this.okSpot(a.sp, a.isl, x, z, false) && a.td > 25) return { x, z }; }
    return null;
  }
  // ---------------------------------------------------------------- crabs, lizards: still, then a dash
  dart(a, dt, V) {
    const sp = a.sp; a.t -= dt;
    if (a.st !== 'run' && a.td < sp.flee * a.fear) { a.st = 'run'; a.t = 0.5 + rnd() * 0.8; a.fh = this.escape(a, a.tdx, a.tdz, 1.2); }
    let vw = 0, hw = a.h;
    if (a.st === 'run') { vw = sp.run; hw = sp.side ? a.fh + Math.PI / 2 : a.fh; if (a.t <= 0) { a.st = 'idle'; a.t = 2 + rnd() * 6; } }
    else if (a.t <= 0) { a.t = 3 + rnd() * 8; if (rnd() < 0.4) { a.fh = a.h + (rnd() - 0.5) * 3; a.walkT = 0.6 + rnd(); } }
    if (a.walkT > 0 && a.st !== 'run') { a.walkT -= dt; vw = sp.walk; hw = a.fh; }
    if (sp.side) {        // a crab: its body keeps facing one way while it runs sideways
      const mh = a.st === 'run' ? a.fh : hw;
      a.v += clamp(vw - a.v, -sp.acc * dt, sp.acc * dt); a.h = wrap(a.h + clamp(wrap(hw - a.h), -sp.turn * dt, sp.turn * dt));
      const nx = a.x + Math.sin(mh) * a.v * dt, nz = a.z + Math.cos(mh) * a.v * dt;
      if (a.v > 0 && this.okSpot(sp, a.isl, nx, nz, true)) { a.x = nx; a.z = nz; this.ground(a); } else a.v = 0;
      a.ph = (a.ph + a.v * 40 * dt) % TAU; a.amp = a.v > 0.05 ? 0.5 : 0; a.gait = 1; a.jaw = Math.max(0, Math.sin(this.t * 1.3 + a.seed * 9)) * 0.6;
    } else { this.go(a, dt, hw, vw, true); this.stride(a, dt); a.gait = 1; a.amp = a.v > 0.05 ? 0.7 : 0; a.ph += a.v * 25 * dt; a.hp = a.v > 0 ? 0 : -0.3; }
  }
  hop(a, dt, V) {
    const sp = a.sp; a.t -= dt;
    if (a.u > 0) {
      a.u -= dt / 0.35; const u = 1 - Math.max(0, a.u);
      a.x = a.fx + (a.tx - a.fx) * u; a.z = a.fz + (a.tz - a.fz) * u; a.y = Math.max(a.isl.height(a.x, a.z), a.isl.water(a.x, a.z)) + Math.sin(Math.PI * u) * 0.25; a.lie = 0;
      if (a.u <= 0) { a.u = 0; this.ground(a); }
      return;
    }
    a.lie = 1;
    if (a.td < sp.flee * a.fear) a.hops = 2 + Math.floor(rnd() * 2);
    if (a.hops > 0 || (a.t <= 0 && rnd() < 0.3)) {
      a.hops = Math.max(0, (a.hops || 1) - 1); a.t = 3 + rnd() * 6;
      const h = this.escape(a, a.td < 10 ? a.tdx : rnd() - 0.5, a.td < 10 ? a.tdz : rnd() - 0.5, 1.2), L = 0.3 + rnd() * 0.4;
      a.fx = a.x; a.fz = a.z; a.tx = a.x + Math.sin(h) * L; a.tz = a.z + Math.cos(h) * L; a.h = h; a.u = 1;
    } else if (a.t <= 0) a.t = 2 + rnd() * 4;
  }
  flutter(a, dt, V) {
    const sp = a.sp;
    a.hide = V.night > 0.45;
    a.ang += dt * (0.8 + a.seed); const r = 1.5 + Math.sin(this.t * 0.3 + a.seed * 9) * 1;
    const tx = a.hx + Math.sin(a.ang) * r + Math.sin(this.t * 1.7 + a.seed * 5) * 0.4, tz = a.hz + Math.cos(a.ang * 1.3) * r;
    const gy = a.isl.height(tx, tz), ty = gy + 0.6 + Math.sin(this.t * 0.9 + a.seed * 3) * 0.4 + Math.abs(Math.sin(this.t * 7 + a.seed)) * 0.15;
    const px = a.x, pz = a.z; a.x += (tx - a.x) * Math.min(1, dt * 2); a.z += (tz - a.z) * Math.min(1, dt * 2); a.y += (ty - a.y) * Math.min(1, dt * 3);
    const vx = a.x - px, vz = a.z - pz; if (Math.hypot(vx, vz) > 1e-4) a.h = Math.atan2(vx, vz);
    a.fph = (a.fph + TAU * sp.flap * dt) % TAU; a.famp = 1.1; a.fold = 0;
    if (a.td < 4 && a.dc < 20) { a.hx += (a.tdx > 0 ? 1 : -1) * dt * 2; }
  }

  // ---------------------------------------------------------------- the car hits the big ones
  refreshCols(V) {
    const L = this.cols; L.length = 0; const car = this.car; if (!car) return;
    for (const a of this.animals) {
      const sp = a.sp; if (!sp.col || a.noCol > 0 || a.st === 'down' || a.st === 'up' || a.st === 'jump') continue;
      const dx = a.x - car.pos.x, dz = a.z - car.pos.z; if (dx * dx + dz * dz > 40 * 40) continue;
      const c = a.colObj || (a.colObj = { x: 0, z: 0, hw: 0, hd: 0, ang: 0, y0: 0, y1: 0, kind: 'animal', animal: a, bounce: 0 });
      // the bounce stands in for the animal's own mass: the car only loses what a body this heavy can take from it
      const m = sp.mass * a.s ** 3, mc = this.carM;
      c.bounce = Math.max(-0.97, 1.1 * 1.3 * m / (1.3 * m + mc) - 1);
      c.x = a.x; c.z = a.z; c.ang = a.h; c.hw = sp.wid * a.s * 0.5; c.hd = sp.len * a.s * 0.42;
      c.y0 = a.y - 0.4; c.y1 = a.y + sp.sh * a.s * (1 - a.lie * 0.6);
      L.push(c);
    }
  }
  colliders(x, z, r, out) {
    const car = this.car;
    if (car) { const h = car.lastHit; if (h && h !== this._hit) { this._hit = h; if (h.c && h.c.animal && !h.c.animal.dead && h.c.animal.noCol <= 0) this.knock(h.c.animal, h); } }
    for (const c of this.cols) { if (c.animal.noCol > 0) continue; const dx = c.x - x, dz = c.z - z, R = r + c.hd + 1; if (dx * dx + dz * dz < R * R) out.push(c); }
  }
  // the small ones always get out of the way: a hare under the wheels jumps clear
  dodge(V) {
    const car = this.car; if (!car) return;
    for (const a of this.animals) {
      if (a.sp.col || a.dc > 30 || a.sp.rig === 'bird' || a.sp.type === 'flutter' || a.st === 'perch' || a.st === 'jump') continue;
      if (!this.inCar(a.x, a.z, 0.3)) continue;
      const h = this.escape(a, a.tdx || 1, a.tdz || 0, 0.5); a.x += Math.sin(h) * 1.2; a.z += Math.cos(h) * 1.2; a.h = h; this.ground(a);
      if (a.sp.type === 'graze') this.startle(a, V);
    }
  }
  stats() { const n = {}; for (const a of this.animals) n[a.sp.id] = (n[a.sp.id] || 0) + 1; return n; }
}
