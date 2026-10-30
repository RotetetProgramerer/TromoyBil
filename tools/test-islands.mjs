// Sjekker de ni oppdiktede øyene (tools/geo/build_islands.mjs) uten nettleser, og kjører alle løypene med bilfysikken.
//   node tools/test-islands.mjs [id,id,…] [bil]
// For hver øy: størrelse, høyder, landareal, veier, hus og løyper; at fergekaia ligger ved sjøen med dypt nok vann utenfor;
// at øyene ikke overlapper hverandre eller ekte land. Så kjører en autopilot (ren forfølgelse langs løypa, fart etter svingene
// foran) hver løype gjennom portene: kom den i mål, på hvor lang tid, og hvor mange ganger veltet den.
import fs from 'fs'; import zlib from 'zlib';
import { World } from '../sim/world/world.js';
import { parseGrid } from '../sim/world/grid.js';
import { addStructures } from '../sim/world/structures.js';
import { Vehicle } from '../sim/physics/vehicle.js';
import { CARS } from '../sim/data/cars.js';
import { WORLD } from '../sim/data/world.js';
import { surfGrip } from '../sim/physics/surfaces.js';

const DT = 1 / 400, only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null, spec = CARS.find(c => c.id === (process.argv[3] || 'fjellrev'));
const world = new World();
for (const d of WORLD.islands) if (!d.real || d.id === 'tromoya' || d.backdrop) await world.addIsland('world/', d);
const bd = parseGrid(new Uint8Array(zlib.gunzipSync(fs.readFileSync('world/backdrop/terrain.bin.gz'))));
const isls = world.islands.filter(i => !i.def.real && (!only || only.includes(i.id)));
let problems = 0;
const bad = msg => { problems++; console.log('   FEIL: ' + msg); };

// ---------------------------------------------------------------- the islands themselves
console.log('øy'.padEnd(11), 'navn'.padEnd(11), 'størrelse m'.padEnd(12), 'høyde m'.padEnd(13), 'land km²'.padStart(8), 'vei km'.padStart(7), 'hus'.padStart(5), 'løyper'.padStart(7), '  plass (ox, oz)');
for (const isl of isls) {
  addStructures(isl);
  const g = isl.grid; let lo = 1e9, hi = -1e9, land = 0;
  for (let k = 0; k < g.data.length; k++) { const h = g.data[k]; lo = Math.min(lo, h); hi = Math.max(hi, h); if (h > 0 && isl.cover.data[k] !== 0) land++; }
  let km = 0; for (const r of isl.roads.roads) km += r.len / 1000;
  const f = isl.feat;
  console.log(isl.id.padEnd(11), isl.name.padEnd(11), `${Math.round(g.x1 - g.x0)}×${Math.round(g.z1 - g.z0)}`.padEnd(12), `${lo.toFixed(0)}…${hi.toFixed(0)}`.padEnd(13), (land * g.cell * g.cell / 1e6).toFixed(2).padStart(8),
    km.toFixed(1).padStart(7), String(isl.buildings.length).padStart(5), String((f.courses || []).length).padStart(7), `  (${isl.ox}, ${isl.oz})`);
  // the ferry quay: its end over the sea, the root on land, at least 3 m of water within 30 m of the end
  const p = f.pois || {};
  if (!p.ferry || !p.spawn) bad(isl.id + ': mangler pois.ferry eller pois.spawn');
  else {
    const fx = p.ferry.x + isl.ox, fz = p.ferry.z + isl.oz, ux = Math.sin(p.ferry.h), uz = Math.cos(p.ferry.h);
    let deep = 0; for (let r = 0; r <= 30; r += 3) for (let a = 0; a < 6.28; a += 0.4) deep = Math.max(deep, -isl.terrain(fx + Math.cos(a) * r, fz + Math.sin(a) * r));
    const endH = isl.terrain(fx, fz), rootH = isl.terrain(fx - ux * 45, fz - uz * 45), dk = world.height(fx - ux * 2, fz - uz * 2);
    const ok = deep >= 3 && endH < -1 && rootH > 0.5 && Math.abs(dk - 2) < 0.6;
    console.log('   ferjekai', ok ? 'OK ' : 'FEIL', `dybde ${deep.toFixed(1)} m innen 30 m, sjøbunn under enden ${endH.toFixed(1)} m, land bak ${rootH.toFixed(1)} m, dekket ${dk.toFixed(1)} m`);
    if (!ok) problems++;
  }
  // no real land under or near the island (1,5 km), no other island's grid overlapping, inside ±23 km
  let near = 1e9;
  for (let z = isl.z0 - 1500; z <= isl.z1 + 1500; z += 40) for (let x = isl.x0 - 1500; x <= isl.x1 + 1500; x += 40) if (bd.inside(x, z) && bd.bilinear(x, z) > 0.6) {
    const dx = Math.max(isl.x0 - x, 0, x - isl.x1), dz = Math.max(isl.z0 - z, 0, z - isl.z1); near = Math.min(near, Math.hypot(dx, dz)); }
  if (near < 1500) bad(`${isl.id}: ekte land ${near.toFixed(0)} m fra øyas rutenett`);
  for (const o of world.islands) if (o !== isl && !o.def.backdrop && !(o.x1 < isl.x0 || o.x0 > isl.x1 || o.z1 < isl.z0 || o.z0 > isl.z1)) bad(`${isl.id} overlapper ${o.id}`);
  if (Math.max(Math.abs(isl.x0), Math.abs(isl.x1), Math.abs(isl.z0), Math.abs(isl.z1)) > 23000) bad(`${isl.id}: utenfor ±23 km`);
  // at least 600 m of sea round the land inside the grid
  let edgeLand = 0; for (let k = 0; k < g.data.length; k++) { const i = k % g.nx, j = (k / g.nx) | 0; if (g.data[k] > 0 && (i < 120 || j < 120 || i >= g.nx - 120 || j >= g.nz - 120)) edgeLand++; }
  if (edgeLand > 30) bad(`${isl.id}: land nærmere enn 600 m fra kanten av rutenettet (${edgeLand} ruter)`);
}

// ---------------------------------------------------------------- the courses
const KIND_V = { by: 55, grus: 70, terreng: 50, bakke: 50, is: 30, strand: 45, sump: 32, natt: 55 };
function drive(isl, c) {
  const P = []; for (let i = 0; i < c.p.length; i += 2) P.push([c.p[i] + isl.ox, c.p[i + 1] + isl.oz]);
  const m = P.length, cum = [0]; for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const G = c.gates.map(g => [g[0] + isl.ox, g[1] + isl.oz]);
  const car = new Vehicle(spec); car.place(world, c.start.x + isl.ox, c.start.z + isl.oz, c.start.h);
  for (let i = 0; i < 400; i++) car.step(DT, world);
  const want = (KIND_V[c.kind] || 50) / 3.6;
  let seg = 0, t = 0, flips = 0, stuck = 0, gate = 0, lastProg = 0, lastT = 0, flood = 0, maxV = 0; const ev = [], at = () => `${Math.round(car.pos.x - isl.ox)},${Math.round(car.pos.z - isl.oz)}`;
  const limit = cum[m - 1] / 3 + 150;
  while (t < limit && gate < G.length) {
    // nearest point on the path ahead (never backwards), the point to steer for further ahead the faster we go
    while (seg < m - 1 && Math.hypot(P[seg + 1][0] - car.pos.x, P[seg + 1][1] - car.pos.z) <= Math.hypot(P[seg][0] - car.pos.x, P[seg][1] - car.pos.z)) seg++;
    const v = car.speed, la = Math.max(4.5, Math.abs(v) * 0.6); let j = seg; while (j < m - 1 && cum[j] - cum[seg] < la) j++;
    const tx = P[j][0], tz = P[j][1], dx = tx - car.pos.x, dz = tz - car.pos.z, fx = car.fw.x, fz = car.fw.z;
    const a = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz), L = Math.hypot(dx, dz) || 1;
    car.input.steer = Math.max(-1, Math.min(1, Math.atan(2 * spec.wb * Math.sin(a) / L) / car.steerMax));
    // speed: the bends ahead (radius from three points ±9 m), the grip here, and room to brake for them
    const mu = Math.max(0.12, surfGrip(world.surface(car.pos.x, car.pos.z), car.tyre, 0));
    let target = want, dd = 0;
    for (let i = Math.max(1, seg); i < m - 1 && dd < v * v / (2 * 3 * mu) + 40; i++) {
      let i0 = i, i2 = i; while (i0 > 0 && cum[i] - cum[i0] < 9) i0--; while (i2 < m - 1 && cum[i2] - cum[i] < 9) i2++;
      const x0 = P[i0][0], z0 = P[i0][1], x1 = P[i][0], z1 = P[i][1], x2 = P[i2][0], z2 = P[i2][1];
      const A = Math.hypot(x1 - x0, z1 - z0), B = Math.hypot(x2 - x1, z2 - z1), Cc = Math.hypot(x2 - x0, z2 - z0), cr = Math.abs((x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0));
      const R = cr > 1e-6 ? A * B * Cc / (2 * cr) : 1e9, vb = Math.sqrt(0.45 * mu * 9.81 * R);
      target = Math.min(target, Math.sqrt(vb * vb + 2 * 3 * mu * dd)); dd = cum[i + 1] - cum[seg];
    }
    // slow down for water on the way (fords)
    const wd = world.water(car.pos.x + fx * 8, car.pos.z + fz * 8) - world.height(car.pos.x + fx * 8, car.pos.z + fz * 8); if (wd > 0.05) target = Math.min(target, 3.5);
    // a careful driver: slower on narrow tracks and on snow and ice
    const q = world.road(car.pos.x, car.pos.z), su = world.surface(car.pos.x, car.pos.z);
    if (q && q.d < q.hw + 2) target = Math.min(target, q.c >= 7 ? 38 / 3.6 : q.c === 6 ? 55 / 3.6 : target);
    if (su === 8) target = Math.min(target, 38 / 3.6); else if (su === 9) target = Math.min(target, 30 / 3.6);
    target = Math.max(3, target);
    car.input.gas = v < target ? Math.min(1, (target - v) * 0.35 + 0.2) : 0; car.input.brake = v > target + 1 ? Math.min(1, (v - target) * 0.3) : 0;
    car.step(DT, world); t += DT; maxV = Math.max(maxV, v);
    const gd = Math.hypot(G[gate][0] - car.pos.x, G[gate][1] - car.pos.z); if (gd < 16) gate++;
    if (car.up.y < 0.3) { flips++; ev.push('velt@' + at()); car.place(world, P[Math.min(m - 1, seg + 2)][0], P[Math.min(m - 1, seg + 2)][1], Math.atan2(P[Math.min(m - 1, seg + 3)][0] - P[seg][0], P[Math.min(m - 1, seg + 3)][1] - P[seg][1])); }
    if (car.state.flooded) { flood++; ev.push('druknet@' + at()); car.state.flooded = false; car.place(world, P[Math.min(m - 1, seg + 4)][0], P[Math.min(m - 1, seg + 4)][1], Math.atan2(P[Math.min(m - 1, seg + 5)][0] - P[seg][0], P[Math.min(m - 1, seg + 5)][1] - P[seg][1])); }
    if (t - lastT > 15) { if (cum[seg] - lastProg < 5) { stuck++; ev.push('fast@' + at()); const k = Math.min(m - 1, seg + 3); car.place(world, P[k][0], P[k][1], Math.atan2(P[Math.min(m - 1, k + 1)][0] - P[k][0], P[Math.min(m - 1, k + 1)][1] - P[k][1])); } lastProg = cum[seg]; lastT = t; }
  }
  return { done: gate >= G.length, t, flips, stuck, flood, gate, n: G.length, len: cum[m - 1], vmax: maxV * 3.6, ev };
}
console.log('\nløype'.padEnd(30), 'type'.padEnd(8), 'lengde'.padStart(7), 'porter'.padStart(7), '  mål', '   tid', 'velt', 'fast', 'druknet', 'toppfart');
let finished = 0, total = 0; const t0 = performance.now();
for (const isl of isls) for (const c of isl.feat.courses || []) {
  const r = drive(isl, c); total++; if (r.done) finished++;
  if (c.gates.length < 8 || c.gates.length > 16) bad(`${isl.id}/${c.id}: ${c.gates.length} porter`);
  console.log((isl.id + '/' + c.id).padEnd(29), c.kind.padEnd(8), `${Math.round(r.len)} m`.padStart(7), `${r.gate}/${r.n}`.padStart(7), r.done ? '   ja' : '  NEI',
    `${Math.floor(r.t / 60)}:${String(Math.floor(r.t % 60)).padStart(2, "0")}`.padStart(6), String(r.flips).padStart(4), String(r.stuck).padStart(4), String(r.flood).padStart(7), `${Math.round(r.vmax)} km/t`.padStart(9));
  if (process.argv.includes('v') && r.ev.length) console.log('   hendelser:', r.ev.slice(0, 12).join(' '));
}
console.log(`\n${finished} av ${total} løyper kom i mål. ${problems ? problems + ' feil' : 'Ingen feil'} (fysikken brukte ${((performance.now() - t0) / 1000).toFixed(0)} s).`);
