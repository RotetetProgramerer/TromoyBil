// The ring flights from Trinnvik (sim/data/flights.js) in the real world, without a browser.
//   node tools/test-plane-flights.mjs [flight] [plane]
// 1) Clearance: every leg between two rings is sampled every 10 m, and the ground, the trees, the houses and everything else in
//    world.colliders within 30 m of the line must be at least 60 m below it; the same under each ring's centre (within its radius).
//    The climb to the first ring and the approach after the last are checked too (gradient, and the glide path over the ground).
// 2) Autopilot: flies each flight with each plane in the real mode (no assist) and the wind, with the normal controls only
//    (throttle, elevator, aileron, rudder, flaps, brakes): takes off from the threshold, through every ring with the same ring check
//    as the game, then the approach on the glide path, the flare, the touchdown and the roll-out until the game counts it as
//    landed. Prints the time, the stars it would get, missed rings, the touchdown and the lowest height above the ground.
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { addStructures } from '../sim/world/structures.js';
import { Plane } from '../sim/physics/plane.js';
import { V3 } from '../sim/physics/math.js';
import { planeById } from '../sim/data/planes.js';
import { FLIGHTS, airportOf, prepFlight, ringFrame, ringCrossed, landed, windVel, glideY, planeWorld } from '../sim/data/flights.js';
import { Autopilot } from './plane-autopilot.mjs';
const DT = 1 / 240, only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : null, onlyPlane = process.argv[3];
const D2R = Math.PI / 180, cl = (v, a = -1, b = 1) => v < a ? a : v > b ? b : v, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const fmtT = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
const world = new World();
for (const d of WORLD.islands) await world.addIsland('world/', d);
for (const isl of world.islands) if (!isl.def.backdrop) addStructures(isl);
const A = airportOf(world), PW = planeWorld(world);
let fails = 0;

// ---------------------------------------------------------------- clearance
// the highest thing within 30 m of (x, z): the ground (or the sea) and the tops of the colliders there
function top(x, z) {
  let h = Math.max(world.height(x, z), 0);
  for (const c of world.colliders(x, z, 30)) { if (Math.hypot(c.x - x, c.z - z) > 30 + (c.r || Math.hypot(c.hw || 0, c.hd || 0))) continue; if (c.y1 != null) h = Math.max(h, c.y1); }
  return h;
}
function clearance(f) {
  const G = f.G, bad = []; let worst = 1e9, at = '';
  for (let i = 1; i < G.length; i++) {
    const a = G[i - 1], b = G[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    for (let s = 0; s <= d; s += 10) { const u = s / d, x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, y = a.y + (b.y - a.y) * u, c = y - top(x, z); if (c < worst) { worst = c; at = `etappe ${i}→${i + 1}`; } if (c < 60) { bad.push(`etappe ${i}→${i + 1} ${s} m inn: ${c.toFixed(0)} m klaring`); break; } }
  }
  G.forEach((g, i) => { let h = 0; for (let r = 0; r <= g.r; r += g.r / 2) for (let k = 0; k < 8; k++) { const q = k / 8 * Math.PI * 2; h = Math.max(h, top(g.x + Math.cos(q) * r, g.z + Math.sin(q) * r)); } const c = g.y - h; if (c < worst) { worst = c; at = `ring ${i + 1}`; } if (c < 60) bad.push(`ring ${i + 1}: ${c.toFixed(0)} m over bakken og trærne`); });
  // the climb to the first ring from a lift-off 350 m down the runway, and the glide path from the last ring to the threshold
  const g0 = G[0], lift = { x: A.start.x + A.rwy.ux * 350, z: A.start.z + A.rwy.uz * 350 }, grad = (g0.y - A.rwy.y) / Math.hypot(g0.x - lift.x, g0.z - lift.z);
  if (grad > 0.075) bad.push(`for bratt stigning til første ring: ${(grad * 100).toFixed(1)} %`);
  const gl = G[G.length - 1], dg = gl.y - glideY(A, gl.x, gl.z); if (Math.abs(dg) > 6) bad.push(`siste ring ${dg.toFixed(0)} m fra glidebanen`);
  let appr = 1e9; for (let s = 0; s < 1; s += 0.01) { const x = gl.x + (A.rwy.x0 - gl.x) * s, z = gl.z + (A.rwy.z0 - gl.z) * s; appr = Math.min(appr, glideY(A, x, z) - top(x, z)); }
  if (appr < 12) bad.push(`glidebanen bare ${appr.toFixed(0)} m over hindringene`);
  return { bad, worst, at, grad, appr };
}

// ---------------------------------------------------------------- flying it (tools/plane-autopilot.mjs) with the game's ring check
function fly(f, spec, assist = false, limit = 1800) {
  const p = new Plane(spec, { assist }), s = p.state, w = windVel(), G = f.G, gearH = -Math.min(...p.gear.map(g => g.at.y));
  p.wind = new V3(w.x, w.y, w.z); p.place(PW, A.start.x, A.start.z, A.start.h); p.input.brake = 1;
  for (let i = 0; i < 240; i++) p.step(DT, PW);
  const ap = new Autopilot(p, A, G);
  let t = 0, gi = 0, prev = null, missed = 0, minAgl = 1e9, minAt = '', maxBank = 0;
  const splits = [];
  while (t < limit && !p.crashed) {
    ap.step(DT, gi);
    p.step(DT, PW); t += DT;
    if (ap.phase === 'rings') {
      const g = G[gi], r = ringFrame(g, p.pos.x, p.pos.y, p.pos.z), c = ringCrossed(g, prev, r.along, r.off);
      if (process.env.TRACE && Math.floor(t * 2) !== Math.floor((t - DT) * 2)) console.log(`t ${t.toFixed(1)} ring ${gi + 1} pos ${p.pos.x.toFixed(0)},${p.pos.z.toFixed(0)} alt ${s.alt.toFixed(0)}→${(ap.hT || 0).toFixed(0)} along ${r.along.toFixed(0)} off ${r.off.toFixed(0)} hdg ${s.heading.toFixed(0)} bank ${s.bank.toFixed(0)} kias ${s.kias.toFixed(0)} thr ${p.input.throttle.toFixed(2)} vs ${s.vs.toFixed(1)}`);
      if (c === 'in') { splits.push(t); gi++; prev = null; }
      else { if (c === 'out') { missed++; if (process.env.TRACE) console.log('MISSED ring', gi + 1, 'off', r.off.toFixed(0), 'alt', s.alt.toFixed(0), 'ring y', g.y); } prev = r.along; }
      maxBank = Math.max(maxBank, Math.abs(s.bank));
      if (gi > 0 && !s.onGround) { const h = s.alt - top(p.pos.x, p.pos.z) - gearH; if (h < minAgl) { minAgl = h; minAt = gi + 1; } }
    }
    if (ap.phase === 'rollout' && landed(A, p)) break;
  }
  return { done: landed(A, p), t, gi, missed, crash: p.crashReason, td: ap.td, minAgl, minAt, maxBank, splits, at: [p.pos.x, p.pos.z], phase: ap.phase };
}

const list = FLIGHTS.filter(f => !only || f.id === only).map(f => prepFlight(f, A));
console.log('Klaring under rutene (minst 60 m over bakken, trærne og husene under hver etappe og hver ring)');
for (const f of list) {
  const c = clearance(f);
  console.log(' ', f.id.padEnd(9), String(f.len).padStart(6), 'm', String(f.G.length).padStart(3), 'ringer', '  laveste klaring', c.worst.toFixed(0).padStart(4), 'm (' + c.at + ')', '  stigning', (c.grad * 100).toFixed(1) + ' %', '  glidebane', c.appr.toFixed(0) + ' m over', c.bad.length ? '\n    FEIL: ' + c.bad.slice(0, 5).join('\n    FEIL: ') : '  ok');
  if (c.bad.length) fails++;
  if (process.env.GEOM) { const P = [{ x: A.start.x, z: A.start.z, y: 5 }, ...f.G, { x: A.aim.x, z: A.aim.z, y: 5 }]; console.log('    ' + f.G.map((g, i) => { const a = P[i], b = P[i + 2], h1 = Math.atan2(g.x - a.x, g.z - a.z), h2 = Math.atan2(b.x - g.x, b.z - g.z); return `${i + 1}: ${Math.round(Math.abs(wrap(h2 - h1)) / D2R)}° ${Math.round(Math.hypot(b.x - g.x, b.z - g.z))} m`; }).join(' | ')); }
}
for (const assist of [false, true]) {
  console.log(`\nAutopilot (${assist ? 'Lett: bare stikke og gass, som en spiller' : 'Ekte'}, vind ${JSON.stringify(windVel())} m/s) gjennom alle ringene til landing og stopp på rullebanen`);
  console.log('  flyging    fly    tid       ★★★      ★★   stjerner  bom  laveste over bakken  maks krengning  landing: knop  synk m/s  fra terskel m');
  for (const f of list) for (const spec of ['make', 'falk'].filter(id => !onlyPlane || id === onlyPlane).map(planeById)) {
    const t0 = Date.now(), r = fly(f, spec, assist), par = f.par[spec.id];
    const st = !r.done ? 0 : r.t <= par[0] ? 3 : r.t <= par[1] ? 2 : 1;
    console.log(' ', f.id.padEnd(9), spec.id.padEnd(5), (r.done ? fmtT(r.t) : 'IKKE FERDIG').padStart(8), fmtT(par[0]).padStart(8), fmtT(par[1]).padStart(8), ('★'.repeat(st) || '–').padStart(9), String(r.missed).padStart(4),
      (r.minAgl.toFixed(0) + ' m (ring ' + r.minAt + ')').padStart(20), (r.maxBank.toFixed(0) + '°').padStart(15), r.td ? r.td.kias.toFixed(0).padStart(14) + r.td.vs.toFixed(2).padStart(10) + r.td.s.toFixed(0).padStart(15) : '', '  ', ((Date.now() - t0) / 1000).toFixed(0) + ' s',
      r.done ? '' : `\n    ${r.crash ? 'KRASJ: ' + r.crash : 'stoppet i fasen ' + r.phase} ved ring ${r.gi + 1}/${f.G.length}, ${r.at.map(v => v.toFixed(0)).join(',')}`);
    if (!r.done || r.missed) fails++;
  }
}
console.log(fails ? `\n${fails} FEIL` : '\nAlle flygingene er trygge og kan flys ferdig med landing.');
process.exit(fails ? 1 : 0);
