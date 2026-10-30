// Måler bilene på en flat testbane uten nettleser, og sammenligner med ekte tall.
//   node tools/test-vehicle.mjs            alle bilene
//   node tools/test-vehicle.mjs turbo      én bil
// Tallene: 0–100 km/t (s), toppfart (km/t), bremselengde 100–0 (m), største sidekraft på en sirkel med radius 40 m (g),
// om bilen står stille i en bakke på 30 %, klatring i 45 % stigning på jord, og om den holder seg på veien i en dobbel filskifting.
import { Vehicle } from '../sim/physics/vehicle.js';
import { CARS } from '../sim/data/cars.js';
import { SURF } from '../sim/physics/surfaces.js';
import { flatWorld } from '../sim/world/flat.js';
const DT = 1 / (+process.env.HZ || 400), only = process.argv[2];
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '–' : v.toFixed(d)).padStart(6);

function mk(spec, o = {}) { const c = new Vehicle(spec, o); return c; }
function settle(car, world, t = 2) { for (let i = 0; i < t / DT; i++) car.step(DT, world); }

function accel(spec) {
  const w = flatWorld(), car = mk(spec); car.place(w, 0, 0, 0); settle(car, w);
  let t = 0, t100 = null, top = 0, last = 0, stall = 0, maxRpm = 0;
  car.input.gas = 1;
  while (t < 90) {
    car.step(DT, w); t += DT; const k = car.kmh; maxRpm = Math.max(maxRpm, car.rpm);
    if (t100 == null && k >= 100) t100 = t;
    if (k > top + 0.05) { top = k; last = t; }
    if (t - last > 6) break;
  }
  return { t100, top, maxRpm };
}
function brake(spec) {
  const w = flatWorld(), car = mk(spec); car.place(w, 0, 0, 0); settle(car, w);
  car.input.gas = 1; let t = 0; while (car.kmh < 102 && t < 40) { car.step(DT, w); t += DT; }
  car.input.gas = 0; car.input.brake = 1;
  while (car.kmh > 100) car.step(DT, w);
  const z0 = car.pos.z; let n = 0; while (car.speed > 0.05 && n < 400 * 20) { car.step(DT, w); n++; }
  return car.pos.z - z0;
}
// pure pursuit: steer towards a point la metres ahead on the line
function pursue(car, tx, tz, la) {
  const dx = tx - car.pos.x, dz = tz - car.pos.z, fx = car.fw.x, fz = car.fw.z;
  const side = fz * dx - fx * dz, ahead = fx * dx + fz * dz;           // side > 0: the point is to the left (+x when facing +z)
  const alpha = Math.atan2(side, ahead), d = Math.atan(2 * car.spec.wb * Math.sin(alpha) / la);
  car.input.steer = Math.max(-1, Math.min(1, d / car.steerMax));
}
// autopilot on a circle of radius R: hold the line, raise the speed slowly, measure the lateral acceleration it holds
function skidpad(spec, R = 40) {
  const w = flatWorld(), car = mk(spec); car.aids.esp = false; car.aids.steer = false; car.place(w, R, 0, 0); settle(car, w, 1);
  let target = 6, best = 0, t = 0, ok = 0;
  while (t < 200 && target < 70) {
    const p = car.pos, a = Math.atan2(p.z, p.x) + 9 / R;               // facing +z at (R,0): round the origin counter-clockwise in x/z
    pursue(car, R * Math.cos(a), R * Math.sin(a), 9);
    const v = car.speed, err = Math.hypot(p.x, p.z) - R;
    car.input.gas = Math.max(0, Math.min(1, (target - v) * 0.5 + 0.1)); car.input.brake = v > target + 1.5 ? 0.2 : 0;
    car.step(DT, w); t += DT;
    if (Math.abs(err) < 1.5 && Math.abs(v - target) < 0.6) { ok += DT; if (ok > 1.5) { best = Math.max(best, v * v / R / 9.81); target += 0.4; ok = 0; } }
    else if (Math.abs(err) > 4) break;
  }
  return best;
}
function hill(spec, slope, surf, low) {
  const w = flatWorld({ slope, surf }), car = mk(spec); car.state.low = !!low; car.place(w, 0, 0, 0); settle(car, w, 3);
  const z0 = car.pos.z; settle(car, w, 4); const creep = Math.abs(car.pos.z - z0);
  car.input.gas = 1; let t = 0; while (t < 20) { car.step(DT, w); t += DT; }
  return { creep, climbed: car.pos.z - z0, v: car.kmh };
}
function laneChange(spec) {
  const w = flatWorld(), car = mk(spec); car.place(w, 0, 0, 0); settle(car, w, 1);
  car.input.gas = 1; let t = 0; while (car.kmh < 80 && t < 40) { pursue(car, 0, car.pos.z + 15, 15); car.step(DT, w); t += DT; }
  // hold 80 km/h and swing 3.5 m over and back (an elk test)
  const z0 = car.pos.z; let spun = false, maxYaw = 0;
  const lane = s => s < 12 ? 0 : s < 26 ? 3.5 * (s - 12) / 14 : s < 38 ? 3.5 : s < 52 ? 3.5 * (1 - (s - 38) / 14) : 0;
  for (let i = 0; i < 400 * 6; i++) {
    const s = car.pos.z - z0 + 11; pursue(car, lane(s), z0 + s, 11);
    car.input.gas = car.kmh < 80 ? 0.5 : 0.25;
    car.step(DT, w);
    const yaw = Math.abs(Math.atan2(car.fw.x, car.fw.z)); maxYaw = Math.max(maxYaw, yaw);
    if (yaw > 1.0 || car.up.y < 0.6) spun = true;
  }
  return { spun, maxYaw: maxYaw * 57.3 };
}
function rest(spec) {
  const w = flatWorld(), car = mk(spec); car.place(w, 0, 0, 0); settle(car, w, 3);
  const loads = car.wheels.map(x => x.Fz), sum = loads.reduce((a, b) => a + b, 0);
  return { ride: car.pos.y, load: sum / (car.m * 9.81), front: (loads[0] + loads[1]) / sum, still: car.vel.length() };
}

console.log('bil'.padEnd(18), '0-100', '  topp', ' brems', ' sideg', ' krypt', ' klatr', ' lav%', ' fil', ' last ', ' foran');
for (const spec of CARS) {
  if (only && spec.id !== only) continue;
  const a = accel(spec), b = brake(spec), s = skidpad(spec), h = hill(spec, 0.30, SURF.ASPHALT), c = hill(spec, 0.45, SURF.DIRT, !!spec.drive.low), l = laneChange(spec), r = rest(spec);
  console.log(spec.id.padEnd(18), fmt(a.t100, 2), fmt(a.top, 0), fmt(b, 1), fmt(s, 2), fmt(h.creep * 100, 1), fmt(c.climbed, 0), fmt(c.v, 0), l.spun ? '  SPIN' : '    ok', fmt(r.load, 2), fmt(r.front, 2));
}
