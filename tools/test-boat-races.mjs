// The boat races at the marinas (sim/data/marinas.js) on the real sea, without a browser.
//   node tools/test-boat-races.mjs [race] [boat]
// 1) Depth: every leg (from the start place through all the gates) is sampled every metre, on the line and 5 and 10 m to each
//    side, and the buoys; all of it must be deeper than 1.5 m. 2) Autopilot: drives each race through all the gates (the same gate
//    check as the game) with the motorboat and with the boat the race is made for, and prints the time, the stars and the groundings.
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { Boat } from '../sim/physics/boat.js';
import { boatById } from '../sim/data/boats.js';
import { MARINAS, prepRace, gateCrossed } from '../sim/data/marinas.js';
const DT = 1 / 240, only = process.argv[2], onlyBoat = process.argv[3];
const world = new World();
for (const d of WORLD.islands) await world.addIsland('world/', d);
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
let fails = 0;

// ---------------------------------------------------------------- depth along the route
function depthCheck(r) {
  const L = [[r.start.x, r.start.z], ...r.G.map(g => [g.x, g.z])], bad = [];
  let worst = -1e9, len = 0;
  for (let i = 1; i < L.length; i++) {
    const [ax, az] = L[i - 1], [bx, bz] = L[i], d = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / d, uz = (bz - az) / d; len += d;
    for (let s = 0; s <= d; s += 1) for (const o of [-10, -5, 0, 5, 10]) {
      const h = world.terrain(ax + ux * s - uz * o, az + uz * s + ux * o); worst = Math.max(worst, h);
      if (h > -1.5) { bad.push(`etappe ${i} ${s.toFixed(0)} m inn, ${o} m til siden: ${h.toFixed(1)} m`); s = d + 1; break; }
    }
  }
  r.G.forEach((g, i) => { for (const sd of [1, -1]) { const x = g.x + Math.cos(g.h) * sd * g.w / 2, z = g.z - Math.sin(g.h) * sd * g.w / 2, h = world.terrain(x, z); if (h > -1.5) bad.push(`port ${i + 1} bøye ${sd > 0 ? 'babord' : 'styrbord'}: ${h.toFixed(1)} m`); } });
  return { bad, worst, len };
}

// ---------------------------------------------------------------- the autopilot
// steers for the gate centre, full throttle
// unless the turn is sharp; slows before a hard turn at the next gate
function drive(r, spec, limit = 1500) {
  const b = new Boat(spec, { waveScale: 0.8, autoTrim: true }); b.t = 0;
  b.place(world, r.start.x, r.start.z, r.start.h);
  for (let i = 0; i < 240; i++) b.step(DT, world);
  let gi = 0, t = 0, prev = null, ground = 0, wasG = false, missed = 0, maxKn = 0, sumKn = 0, n = 0, hits = 0, lastHit = null;
  const splits = [];
  while (t < limit && gi < r.G.length) {
    const G = r.G[gi], dx = b.pos.x - G.x, dz = b.pos.z - G.z, sh = Math.sin(G.h), ch = Math.cos(G.h), along = dx * sh + dz * ch, lat = dx * ch - dz * sh;
    const dist = Math.hypot(dx, dz);
    // aim: the gate centre; right at it, a point past it along the gate's heading (or back through it from the far side)
    let tx = G.x, tz = G.z;
    if (dist < 18) { const sd = along < 0 ? 1 : -1; tx = G.x + sh * 20 * sd; tz = G.z + ch * 20 * sd; }
    const fx = b.fw.x, fz = b.fw.z, ex = tx - b.pos.x, ez = tz - b.pos.z, err = Math.atan2(fz * ex - fx * ez, fx * ex + fz * ez);
    const yaw = b.w.dot(b.up);
    b.input.steer = Math.max(-1, Math.min(1, 2.2 * err - 0.45 * yaw));
    // the turn at this gate towards the next: slow down for a sharp one
    const N = r.G[gi + 1]; let turn = 0;
    if (N) { const a1 = Math.atan2(G.x - b.pos.x, G.z - b.pos.z), a2 = Math.atan2(N.x - G.x, N.z - G.z); turn = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))); }
    const v = Math.abs(b.speed), vTurn = turn > 1.2 ? 9 : turn > 0.7 ? 15 : 99;
    let thr = 1;
    if (Math.abs(err) > 1.0) thr = 0.45;
    if (dist < 10 + v * 3 && v > vTurn) thr = 0.25;
    b.input.throttle = thr;
    b.step(DT, world); t += DT;
    const c = gateCrossed(G, prev, along, lat);
    if (c === 'in') { gi++; splits.push(t); prev = null; continue; }
    if (c === 'out') missed++;
    prev = along;
    if (b.state.grounded && !wasG) ground++; wasG = b.state.grounded;
    if (b.lastHit && b.lastHit !== lastHit) { lastHit = b.lastHit; hits++; }
    maxKn = Math.max(maxKn, b.state.knots); sumKn += b.state.knots; n++;
    if (b.blewUp) return { done: false, why: 'NaN' };
  }
  return { done: gi >= r.G.length, t, gi, ground, missed, maxKn, avg: sumKn / n, hits, splits, at: [b.pos.x, b.pos.z] };
}

console.log('Dybde langs rutene (terreng under −1,5 m hele veien, 10 m til hver side)');
const races = [];
for (const m of MARINAS) for (const rd of m.races) {
  if (only && rd.id !== only) continue;
  const r = prepRace(m, rd), d = depthCheck(r); races.push(r);
  console.log(' ', r.id.padEnd(10), String(r.len).padStart(6), 'm', String(r.G.length).padStart(3), 'porter', ' grunnest', d.worst.toFixed(1), 'm', d.bad.length ? '  FEIL: ' + d.bad.slice(0, 4).join('; ') : '  ok');
  if (d.bad.length) fails++;
}
console.log('\nAutopilot gjennom alle portene (bølger 0,8, autotrim)');
console.log('  løp        båt         tid      ★★★     ★★   stjerner  snitt kn  maks kn  bom  grunn  treff');
for (const r of races) {
  const boats = [...new Set(['motorbat', r.boat])].filter(id => !onlyBoat || id === onlyBoat);
  for (const id of boats) {
    const t0 = Date.now(), res = drive(r, boatById(id));
    const st = !res.done ? 0 : res.t <= r.par[0] ? 3 : res.t <= r.par[1] ? 2 : 1;
    console.log(' ', r.id.padEnd(10), id.padEnd(9), res.done ? fmt(res.t).padStart(8) : ('IKKE FERDIG ' + res.gi + '/' + r.G.length + ' ved ' + res.at.map(v => v.toFixed(0)).join(',')).padStart(8),
      fmt(r.par[0]).padStart(8), fmt(r.par[1]).padStart(7), ('★'.repeat(st) || '–').padStart(9), (res.avg || 0).toFixed(1).padStart(9), (res.maxKn || 0).toFixed(1).padStart(8), String(res.missed).padStart(4), String(res.ground).padStart(6), String(res.hits).padStart(6), '  ', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    if (!res.done) fails++;
  }
}
console.log(fails ? `\n${fails} FEIL` : '\nAlle løpene er farbare og kan kjøres ferdig.');
process.exit(fails ? 1 : 0);
