// Bygger løypene på Tromøya langs ekte veier og kjører dem med autopilot (uten nettleser).
//   node tools/test-courses.mjs [bil] [løype]
import { World } from '../sim/world/world.js';
import { Vehicle } from '../sim/physics/vehicle.js';
import { CARS } from '../sim/data/cars.js';
import { TROMOYA, PREFER } from '../sim/data/tromoya.js';
import { RoadGraph, buildCourse } from '../sim/route.js';
const DT = 1 / 400, carId = process.argv[2] || 'jerv', only = process.argv[3];
const world = new World(); await world.addIsland('world/', { id: 'tromoya', ox: 0, oz: 0, seed: 4242 }); const isl = world.islands[0];
const t0 = Date.now(), g = new RoadGraph(isl); console.log('veigraf', g.X.length, 'punkter', Date.now() - t0, 'ms');
const spec = CARS.find(c => c.id === carId);
console.log('løype'.padEnd(26), 'lengde  porter   tid   snitt  fram  velt');
for (const def of TROMOYA.courses) {
  if (only && def.id !== only) continue;
  const c = buildCourse(g, Object.assign({}, def, { weight: PREFER[def.prefer] }));
  if (!c) { console.log(def.name.padEnd(26), 'INGEN RUTE'); continue; }
  const car = new Vehicle(spec); car.place(world, c.start.x, c.start.z, c.start.h); for (let i = 0; i < 400; i++) car.step(DT, world);
  const L = c.line, m = L.length; let seg = 0, t = 0, gi = 0, flips = 0;
  const want = { asfalt: 80, grus: 60, terreng: 30, natt: 50 }[def.kind] / 3.6;
  let stuck = 0;
  while (t < 900 && gi < c.gates.length && stuck < 20) {
    stuck = Math.abs(car.speed) < 0.5 ? stuck + DT : 0;
    const la = Math.max(6, car.speed * 0.55);
    while (seg < m - 1 && Math.hypot(L[seg][0] - car.pos.x, L[seg][1] - car.pos.z) < la) seg++;
    const dx = L[seg][0] - car.pos.x, dz = L[seg][1] - car.pos.z, fx = car.fw.x, fz = car.fw.z, a = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);
    car.input.steer = Math.max(-1, Math.min(1, Math.atan(2 * spec.wb * Math.sin(a) / Math.max(la, Math.hypot(dx, dz))) / car.steerMax));
    let target = want, dd = 0;
    for (let i = Math.max(3, seg - 4); i < m - 3 && dd < car.speed * car.speed / 6 + 30; i++) {
      const [x0, z0] = L[i - 3], [x1, z1] = L[i], [x2, z2] = L[i + 3], A = Math.hypot(x1 - x0, z1 - z0), B = Math.hypot(x2 - x1, z2 - z1), C = Math.hypot(x2 - x0, z2 - z0), cr = Math.abs((x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0));
      const R = cr > 1e-6 ? A * B * C / (2 * cr) : 1e9; target = Math.min(target, Math.sqrt(0.45 * 9.81 * R + 2 * 3.5 * dd)); if (i > seg) dd += B / 3;
    }
    const v = car.speed; car.input.gas = v < target ? Math.min(1, (target - v) * 0.3 + 0.15) : 0; car.input.brake = v > target + 1 ? Math.min(1, (v - target) * 0.25) : 0;
    car.step(DT, world); t += DT;
    if (Math.hypot(c.gates[gi][0] - car.pos.x, c.gates[gi][1] - car.pos.z) < 12) gi++;
    if (car.up.y < 0.3) { flips++; car.place(world, car.pos.x, car.pos.z, Math.atan2(car.fw.x, car.fw.z)); }
  }
  const why = gi >= c.gates.length ? '' : ` stoppet ved ${car.pos.x.toFixed(0)},${car.pos.z.toFixed(0)} (punkt ${seg}/${m})` + (car.lastHit ? ' traff ' + car.lastHit.c.kind : '') + (world.road(car.pos.x, car.pos.z) ? '' : ' utenfor veien');
  console.log(def.name.padEnd(26), String(c.len).padStart(6), String(c.gates.length).padStart(7), (t.toFixed(0) + 's').padStart(6), (c.len / t * 3.6).toFixed(0).padStart(7), gi >= c.gates.length ? '  ja ' : '  NEI ' + gi + '/' + c.gates.length, String(flips).padStart(5), why);
}
