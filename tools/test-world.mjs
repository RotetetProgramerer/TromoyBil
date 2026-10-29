// Kjører bilene på ekte veier på Tromøya med autopilot, uten nettleser.
//   node tools/test-world.mjs [bil] [antall veier]
// For hver vei: lengde, snittfart, om bilen kom fram, velt, hvor hardt den traff noe, og hvor raskt fysikken går.
import { World } from '../sim/world/world.js';
import { Vehicle } from '../sim/physics/vehicle.js';
import { CARS } from '../sim/data/cars.js';
import { WORLD } from '../sim/data/world.js';
const DT = 1 / 400, carId = process.argv[2] || 'ravn', count = +(process.argv[3] || 12);
const world = new World();
for (const d of WORLD.islands.filter(d => d.real)) await world.addIsland('world/', d);
const isl = world.islands[0];
// long paved roads first, then gravel and tracks, spread over the island
const roads = isl.roads.roads.map((r, i) => ({ r, i })).filter(o => o.r.len > 350 && o.r.c <= 6 && !o.r.b);
roads.sort((a, b) => b.r.len - a.r.len);
const pick = []; for (const o of roads) { const p = o.r.p; if (pick.every(q => Math.hypot(q.r.p[0] - p[0], q.r.p[1] - p[1]) > 600)) pick.push(o); if (pick.length >= count) break; }
const spec = CARS.find(c => c.id === carId);
let totalSteps = 0, totalMs = 0;
console.log('vei'.padEnd(26), 'klasse  lengde  snitt km/t  fram  velt  treff  steg/ms');
for (const { r } of pick) {
  const p = r.p, m = p.length / 3, car = new Vehicle(spec);
  const hd = Math.atan2(p[3] - p[0], p[4] - p[1]); car.place(world, p[0] + isl.ox, p[1] + isl.oz, hd);
  for (let i = 0; i < 400; i++) car.step(DT, world);
  const want = [90, 80, 70, 60, 50, 30, 25, 15][r.c] / 3.6;
  let seg = 0, t = 0, flips = 0, hit = 0, done = false, dist = 0, last = { x: car.pos.x, z: car.pos.z };
  const t0 = performance.now(); let steps = 0;
  while (t < r.len / 3 + 60) {
    // the point to steer for: further ahead the faster we go
    const la0 = Math.max(6, car.speed * 0.55);
    while (seg < m - 1 && Math.hypot(p[seg * 3] + isl.ox - car.pos.x, p[seg * 3 + 1] + isl.oz - car.pos.z) < la0) seg++;
    if (seg >= m - 1 && Math.hypot(p[(m - 1) * 3] + isl.ox - car.pos.x, p[(m - 1) * 3 + 1] + isl.oz - car.pos.z) < 6) { done = true; break; }
    const tx = p[seg * 3] + isl.ox, tz = p[seg * 3 + 1] + isl.oz, dx = tx - car.pos.x, dz = tz - car.pos.z, fx = car.fw.x, fz = car.fw.z;
    const side = fz * dx - fx * dz, ahead = fx * dx + fz * dz, la = Math.hypot(dx, dz) || 1, a = Math.atan2(side, ahead);
    car.input.steer = Math.max(-1, Math.min(1, Math.atan(2 * spec.wb * Math.sin(a) / la) / car.steerMax));
    // speed: the bends ahead (radius from three points 9 m apart) and the distance to brake for them
    const v = car.speed; let target = want, dd = 0;
    for (let i = Math.max(3, seg - 4); i < m - 3 && dd < v * v / 6 + 30; i++) {
      const x0 = p[(i - 3) * 3], z0 = p[(i - 3) * 3 + 1], x1 = p[i * 3], z1 = p[i * 3 + 1], x2 = p[(i + 3) * 3], z2 = p[(i + 3) * 3 + 1];
      const A = Math.hypot(x1 - x0, z1 - z0), B = Math.hypot(x2 - x1, z2 - z1), Cc = Math.hypot(x2 - x0, z2 - z0), cr = Math.abs((x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0));
      const R = cr > 1e-6 ? A * B * Cc / (2 * cr) : 1e9, vb = Math.sqrt(0.5 * 9.81 * R);
      target = Math.min(target, Math.sqrt(vb * vb + 2 * 4 * dd));
      if (i > seg) dd += B / 3;
    }
    target = Math.max(4, target);
    car.input.gas = v < target ? Math.min(1, (target - v) * 0.3 + 0.15) : 0; car.input.brake = v > target + 1 ? Math.min(1, (v - target) * 0.25) : 0;
    car.step(DT, world); steps++; t += DT;
    if (car.up.y < 0.3) { flips++; car.place(world, car.pos.x, car.pos.z, Math.atan2(car.fw.x, car.fw.z)); }
    if (car.lastHit && car.lastHit.t > t - DT * 1.5) hit = Math.max(hit, car.lastHit.j / car.m);
    dist += Math.hypot(car.pos.x - last.x, car.pos.z - last.z); last = { x: car.pos.x, z: car.pos.z };
  }
  const ms = performance.now() - t0; totalSteps += steps; totalMs += ms;
  console.log((r.n || '(uten navn)').slice(0, 25).padEnd(26), String(r.c).padStart(6), String(Math.round(r.len)).padStart(7), (dist / t * 3.6).toFixed(0).padStart(11), done ? '  ja ' : ('  NEI ' + Math.round(seg / m * 100) + '%'), String(flips).padStart(5), hit.toFixed(1).padStart(6), (steps / ms).toFixed(1).padStart(8));
}
console.log('fysikk:', (totalSteps / totalMs * 1000 / 400).toFixed(1), '× sanntid (400 steg i sekundet)');
