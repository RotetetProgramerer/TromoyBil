// The skier (sim/physics/skier.js) without a browser.
//   node tools/test-ski.mjs [piste]          (TRACE=1 prints the autopilot every 2 s)
// 1) On a made-up even slope: the straight-line speed upright and tucked, the tightest carve at full edge, the hockey stop and the
//    plough, skating on the flat: the numbers a real alpine skier gets. 2) Gautefall: the pistes, their gates and the chairlift loop.
// 3) An autopilot skis every piste from the top through all the gates to the finish (same gate check as the game) and must not fall;
//    it prints the time, the stars, the top and average speed, the share of the turns carved, the airtime and the hardest landing.
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { addStructures } from '../sim/world/structures.js';
import { Skier, SkiArea, SkiRun, SKI, jumpPoints } from '../sim/physics/skier.js';

const DT = 1 / 240, only = process.argv[2];
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), kmh = v => (v * 3.6).toFixed(0);
let fails = 0; const bad = m => { fails++; console.log('   FEIL: ' + m); };

// ---------------------------------------------------------------- 1) an even slope
function slope(grade) {
  const world = { height: (x, z) => -grade * z, surface: () => 8, colliders: () => [], water: () => -1e9, islandAt: () => null };
  const area = new SkiArea(world, { feat: { special: {} }, ox: 0, oz: 0, inside: () => false });
  area.surface = () => ({ k: 'groomed', piste: null });
  return area;
}
function straight(grade, tuck, dist = 3000) {
  const s = new Skier(slope(grade), { assist: false }); s.place(0, 0, 0); let t = 0;
  while (s.pos.z < dist && t < 600) { s.step(DT, { steer: 0, gas: tuck ? 1 : 0, brake: 0 }); t += DT; }
  return s.speed;
}
console.log('Jevn bakke (preparert snø, μ = ' + SKI.mu.groomed + ', CdA ' + SKI.cdaUp + ' / ' + SKI.cdaTuck + ' m²)');
for (const g of [0.15, 0.25, 0.35]) {
  const up = straight(g, false), tk = straight(g, true);
  console.log(`  ${(g * 100).toFixed(0)} % fall: rett ned etter 3 km ${kmh(up)} km/t oppreist, ${kmh(tk)} km/t i hockeystilling`);
  if (g === 0.25 && (tk < 25 || tk > 36)) bad('urealistisk toppfart i hockeystilling: ' + kmh(tk) + ' km/t');
}
{ // the tightest carve: full edge at 60 km/h on a gentle slope, measure the radius of the track
  const s = new Skier(slope(0.12), { assist: false }); s.place(0, 0, 0.6); s.vel.set(Math.sin(0.6) * 16.7, -0.12 * Math.cos(0.6) * 16.7, Math.cos(0.6) * 16.7);
  for (let i = 0; i < 40; i++) s.step(DT, { steer: 0, gas: 0, brake: 0 });
  const P = [], V = []; let carve = 0, n = 0;
  for (let i = 0; i < 240; i++) { s.step(DT, { steer: 1, gas: 0, brake: 0 }); if (i > 120) { P.push([s.pos.x, s.pos.z]); V.push(s.speed); carve += s.carve; n++; } }
  // radius from the turn of the velocity: v / (dψ/dt)
  const a0 = Math.atan2(P[1][0] - P[0][0], P[1][1] - P[0][1]), a1 = Math.atan2(P[P.length - 1][0] - P[P.length - 2][0], P[P.length - 1][1] - P[P.length - 2][1]);
  const R = V.reduce((a, b) => a + b) / V.length / Math.abs(wrap(a1 - a0) / ((P.length - 1) * DT));
  console.log(`  full kant i ${kmh(V[0])} km/t: svingradius ${R.toFixed(1)} m, carving ${(carve / n * 100).toFixed(0)} % av tiden, helning ${(Math.abs(s.inc) * 180 / Math.PI).toFixed(0)}°, fart etter ${kmh(V[V.length - 1])} km/t`);
  if (R < 12 || R > 40) bad('svingradius ved full kant: ' + R.toFixed(1) + ' m');
}
{ // hockey stop and plough from 50 and 25 km/h on a 15 % slope
  for (const [v0, brake, steer, name] of [[13.9, 1, 1, 'hockeystopp'], [6.9, 1, 0, 'plog']]) {
    const s = new Skier(slope(0.15), { assist: false }); s.place(0, 0, 0); s.vel.set(0, -v0 * 0.15, v0); let t = 0; const z0 = s.pos.z;
    do { s.step(DT, { steer, gas: 0, brake }); t += DT; } while (s.speed > 0.5 && t < 30);
    console.log(`  ${name} fra ${kmh(v0)} km/t: stopp etter ${t.toFixed(1)} s og ${Math.hypot(s.pos.x, s.pos.z - z0).toFixed(1)} m${s.crashT ? ' (FALT: ' + s.why + ')' : ''}`);
    if (s.crashT || t > (name === 'plog' ? 9 : 4)) bad(name + ' bremser for dårlig');
  }
}
{ // skating and poling on the flat, and walking up a 20 % hill
  const s = new Skier(slope(0), { assist: false }); s.place(0, 0, 0); let t = 0, poles = 0;
  while (t < 30) { s.step(DT, { steer: 0, gas: 1, brake: 0 }); for (const e of s.ev) if (e.type === 'pole') poles++; s.ev.length = 0; t += DT; }
  const u = new Skier(slope(-0.2), { assist: false }); u.place(0, 0, 0); let tu = 0; while (tu < 30) { u.step(DT, { steer: 0, gas: 1, brake: 0 }); tu += DT; }
  console.log(`  staking på flaten: ${kmh(s.speed)} km/t etter 30 s (${poles} stavtak); 20 % opp: ${(u.pos.z / 30).toFixed(1)} m/s i fiskebein`);
  if (s.speed < 4 || s.speed > 9) bad('stakefart på flaten ' + kmh(s.speed) + ' km/t');
  if (u.pos.z < 10) bad('kommer ikke opp en bratt kneik');
}

// ---------------------------------------------------------------- 2) Gautefall
const world = new World();
for (const d of WORLD.islands) if (d.id === 'gautefall') await world.addIsland('world/', d);
const isl = world.islands.find(i => i.id === 'gautefall'); addStructures(isl);
let t0 = Date.now(); const area = new SkiArea(world, isl);
console.log(`\nGautefall: ${area.pistes.length} nedfarter, ${area.kickers.length} hopp (${Date.now() - t0} ms)`);
for (const k of area.pistes) console.log(`  ${k.id.padEnd(7)} ${k.name.padEnd(14)} ${k.diff.padEnd(6)} ${String(Math.round(k.len)).padStart(5)} m  fall ${Math.round(k.L[0].y - k.L[k.L.length - 1].y)} m  ${k.gates.length - 1} porter + mål  ${k.links.length ? 'snarvei ' + Math.round(k.links[0].s0) + '→' + Math.round(k.links[0].s1) + ' m' : ''}`);
const Lf = area.lift; console.log(`  stolheisen: ${Math.round(Lf.upLen)} m opp, ${Lf.n} stoler, ${Lf.towersS.length} master, turen tar ${fmt(Lf.upLen / Lf.speed)}`);
if (area.pistes.length !== 4) bad('venter fire nedfarter');

// ---------------------------------------------------------------- 3) the autopilot
// pure pursuit along the line (through the shortcut where a piste loops), never past the next gate until it is close; the speed
// held under a limit for the piste and for the bends ahead: tuck or pole when slower, plough when faster. It rides off the kickers,
// pops at the lip of the middle one and lands with the skis straight.
const VMAX = { fri: 13, slalom: 16, utfor: 24, hopp: 17 };
// the line to follow, every 2 m, and where each gate lies along it
function route(k) {
  const lk = k.links[0], P = k.L.filter(q => !lk || q.s <= lk.s0 || q.s >= lk.s1), R = [];
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 2)); for (let j = 0; j < n; j++) R.push({ x: a.x + (b.x - a.x) * j / n, z: a.z + (b.z - a.z) * j / n }); }
  R.push({ x: P[P.length - 1].x, z: P[P.length - 1].z }); R.forEach((q, i) => q.r = i ? R[i - 1].r + Math.hypot(q.x - R[i - 1].x, q.z - R[i - 1].z) : 0);
  R.gates = k.gates.map(g => { let best = 1e9, r = 0; for (const q of R) { const d = Math.hypot(q.x - g.x, q.z - g.z); if (d < best) { best = d; r = q.r; } } return r; });
  return R;
}
function at(R, r) { let j = Math.max(0, Math.min(R.length - 2, Math.floor(r / 2))); while (j > 0 && R[j].r > r) j--; while (j < R.length - 2 && R[j + 1].r < r) j++; const a = R[j], b = R[j + 1], u = Math.max(0, Math.min(1, (r - a.r) / ((b.r - a.r) || 1))); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }; }
function kappa(R, r) { const a = at(R, r - 6), b = at(R, r), c = at(R, r + 6); return Math.abs(wrap(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z))) / 6; }
function ski(k) {
  const s = new Skier(area, { assist: false }), run = new SkiRun(k), R = route(k), vmax = VMAX[k.kind] || 15;
  s.place(k.start.x - Math.sin(k.start.h) * 2, k.start.z - Math.cos(k.start.h) * 2, k.start.h);
  let t = 0, ri = 0, top = 0, sum = 0, n = 0, air = 0, hard = 0, turnT = 0, carveT = 0, takeoffs = 0, kicks = 0, lastKick = null;
  const crashes = [], jumps = [], misses = [], p1 = { x: 0, z: 0 };
  while (t < 900 && !run.done) {
    // progress: the nearest point of the line a little behind or ahead of the last one
    let best = 1e9; const i0 = ri; for (let i = Math.max(0, i0 - 3); i < Math.min(R.length, i0 + 30); i++) { const d = Math.hypot(R[i].x - s.pos.x, R[i].z - s.pos.z); if (d < best) { best = d; ri = i; } }
    const v = s.speed, r0 = R[ri].r, rg = R.gates[run.next] ?? 1e9;
    let la = 6 + v * 0.6; if (rg - r0 > 2.5) la = Math.min(la, rg - r0 + 1.5);
    let T = at(R, r0 + la); const G = k.gates[run.next];
    if (G && Math.hypot(G.x - s.pos.x, G.z - s.pos.z) < 9) T = { x: G.x + G.tx * 8, z: G.z + G.tz * 8 };       // right at a gate: straight through it
    let vt = vmax; for (let d = 0; d < 80; d += 4) vt = Math.min(vt, Math.sqrt(0.5 * SKI.aLat / Math.max(0.004, kappa(R, r0 + d)) + 2 * 1.5 * d));
    const want = Math.atan2(T.x - s.pos.x, T.z - s.pos.z), err = wrap(want - (v > 2 ? s.dir : s.head)), herr = wrap(want - s.head);
    const kk = area.kickerAt(s.pos.x, s.pos.z), onKick = !!kk && kk.a > -14;
    const steer = Math.max(-1, Math.min(1, 1.8 * err + 0.6 * herr));
    const inp = { steer: onKick ? steer * 0.25 : steer, gas: v < vt - 2 || v < 3 ? 1 : 0, brake: v > vt + 1 && !onKick && (Math.abs(steer) < 0.5 || v > vt + 5) ? 1 : 0, jump: false };
    if (s.air) { inp.steer = Math.max(-1, Math.min(1, 2 * wrap(s.dir - s.head))); inp.gas = 0; inp.brake = 0; }
    if (kk && kk.q !== lastKick && kk.a > -1.2 && kk.a < 0 && !s.air) { lastKick = kk.q; if (++kicks === 2) inp.jump = true; }
    p1.x = s.pos.x; p1.z = s.pos.z;
    s.step(DT, inp); t += DT;
    if (!run.started && run.crossStart(p1, s.pos)) { run.started = true; t = 0; }
    for (const e of run.cross(p1, s.pos)) { if (e.type === 'miss') misses.push(e.i); ri = Math.max(ri, Math.round(R.gates[e.i] / 2)); }
    for (const e of s.ev) {
      if (e.type === 'crash') crashes.push(`${e.why} ved ${Math.round(r0)} m i ${kmh(e.speed)} km/t`);
      if (e.type === 'takeoff') { takeoffs++; if (process.env.TRACE) console.log('    takeoff', t.toFixed(2), 'r', r0.toFixed(0), 'v', kmh(v), JSON.stringify(e)); }
      if (e.type === 'land' && process.env.TRACE) console.log('    land', t.toFixed(2), 'r', r0.toFixed(0), JSON.stringify(e));
      if (e.type === 'land') { hard = Math.max(hard, e.hard); if (e.air > 0.3) jumps.push(e); air = Math.max(air, e.air); }
    }
    s.ev.length = 0;
    if (s.crashT > 2.5) { const c = run.cp; s.place(c.x, c.z, c.h); }
    if (process.env.TRACE && Math.round(t * 240) % 480 === 0) console.log('   ', t.toFixed(0), 's  r', r0.toFixed(0), 'pos', (s.pos.x - isl.ox).toFixed(0), (s.pos.z - isl.oz).toFixed(0), 'v', kmh(v), 'vt', kmh(vt), s.surf, 'air', s.air, 'inp', inp.steer.toFixed(2), inp.gas, inp.brake, 'walk', s.walk, 'skid', s.skid.toFixed(1), 'carve', s.carve.toFixed(1));
    if (run.started) { top = Math.max(top, v); sum += v; n++; if (Math.abs(s.inc) > 0.15 && !s.air) { turnT += DT; if (s.carve > 0.6) carveT += DT; } }
  }
  const pts = jumps.reduce((a, j) => a + jumpPoints(j.air, j.spins, j.pop), 0);
  return { done: run.done, t: t + run.pen, gi: run.next, top, avg: sum / Math.max(1, n), crashes, misses, carve: turnT > 0 ? carveT / turnT : 0, air, hard, jumps: jumps.length, pts, takeoffs, at: [s.pos.x - isl.ox, s.pos.z - isl.oz] };
}
console.log('\nAutopilot gjennom alle portene til mål (Ekte-modus)');
console.log('  nedfart     tid    ★★★     ★★    ★  topp km/t  snitt km/t  carving  bom  fall  hopp  lengst i lufta  hardeste landing');
for (const k of area.pistes) {
  if (only && k.id !== only) continue;
  t0 = Date.now(); const r = ski(k);
  const st = !r.done ? 0 : k.points ? (r.pts >= k.par[0] ? 3 : r.pts >= k.par[1] ? 2 : 1) : (r.t <= k.par[0] ? 3 : r.t <= k.par[1] ? 2 : 1);
  console.log(' ', k.id.padEnd(7), r.done ? fmt(r.t).padStart(7) : ('IKKE I MÅL ' + r.gi + '/' + k.gates.length + ' ved ' + r.at.map(v => v.toFixed(0))).padStart(7), (k.points ? k.par[0] + ' p' : fmt(k.par[0])).padStart(7), (k.points ? k.par[1] + ' p' : fmt(k.par[1])).padStart(7),
    ('★'.repeat(st) || '–').padStart(4), kmh(r.top).padStart(9), kmh(r.avg).padStart(11), ((r.carve * 100).toFixed(0) + ' %').padStart(8), String(r.misses.length).padStart(4), String(r.crashes.length).padStart(5),
    String(r.jumps).padStart(5), (r.air.toFixed(2) + ' s').padStart(15), (r.hard.toFixed(1) + ' m/s').padStart(17), (k.points ? '  ' + r.pts + ' poeng' : ''), '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  if (!r.done) bad(k.id + ': kom ikke i mål');
  if (r.crashes.length) bad(k.id + ': falt: ' + r.crashes.slice(0, 3).join('; '));
  if (r.misses.length) bad(k.id + ': bommet på port ' + r.misses.map(i => i + 1).join(', '));
  if (r.top * 3.6 > 125) bad(k.id + ': for høy toppfart');
  if (k.kind !== 'fri' && r.top * 3.6 < 40) bad(k.id + ': for lav toppfart');
}
console.log(fails ? `\n${fails} FEIL` : '\nAlle nedfartene kan kjøres fra toppen til mål uten fall, i ekte farter.');
process.exit(fails ? 1 : 0);
