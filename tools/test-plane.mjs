// Flies the planes on a test airfield without a browser and compares them with real figures.
//   node tools/test-plane.mjs            all planes
//   node tools/test-plane.mjs make       one plane
// The airfield: flat ground at 2 m, grass, with a 900 m × 30 m asphalt runway along z (north–south) centred at x = 0, z = 0;
// beyond 5 km the sea. The autopilot flies only with the normal controls: throttle, elevator, aileron, rudder, flaps and brakes.
//
// Real figures for the trainer (Cessna 172S POH, sea level, ~15 °C; at 1050 kg a little better than at the 1157 kg gross weight):
//   take-off: rotate at 55 KIAS, ground roll 293 m (960 ft) and 497 m (1630 ft) to 15 m at 1157 kg → ~240 m and ~410 m at 1050 kg
//   climb at Vy 74 KIAS: 3.7 m/s (730 fpm) at 1157 kg → ~4.2 m/s at 1050 kg
//   cruise: ~110 KTAS at 2400 rpm (about 65 % power) low down; ~122 kt at full throttle
//   stall: 48 KIAS clean, 40 KIAS with 30° flaps (power off)
//   30° bank: 360° in 2π V / (g tan 30°) ≈ 51 s at 90 kt, radius ≈ 380 m, 1.15 g
//   landing: touch down at ~45–50 KIAS below 1 m/s sink, ground roll 175 m (575 ft) with hard braking
// The aerobatic plane (like a Van's RV-7A, 200 hp): stall ~50 kt clean, ~44 kt with flaps, cruise ~165–175 kt, climb ~8 m/s.
import { Plane, KNOT } from '../sim/physics/plane.js';
import { PLANES } from '../sim/data/planes.js';
import { SURF } from '../sim/physics/surfaces.js';
import { flatWorld } from '../sim/world/flat.js';
const DT = 1 / (+process.env.HZ || 240), only = process.argv[2];
const fmt = (v, d = 1, w = 6) => (v == null || !isFinite(v) ? '–' : v.toFixed(d)).padStart(w);
const D2R = Math.PI / 180, cl = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const RWY = { x: 0, z0: 450, z1: -450, h: 2 };     // runway: from the south threshold (z = +450) to the north end, heading north
const airfield = () => flatWorld({
  height: (x, z) => Math.abs(x) < 5000 && Math.abs(z) < 5000 ? 2 : -10,
  surf: (x, z) => Math.abs(x) < 15 && Math.abs(z) < 450 ? SURF.ASPHALT : SURF.GRASS,
  water: 0,
});

// ---------------------------------------------------------------- the autopilot (normal controls only)
class Pilot {
  constructor(p) { this.p = p; this.iE = 0; this.iT = 0.6; this.iR = 0; this.iA = 0; this.thr = 0; }
  get s() { return this.p.state; }
  rates() { const p = this.p; return { p: p.w.dot(p.fw), q: -p.w.dot(p.lf), r: -p.w.dot(p.up) }; }   // roll right, pitch up, yaw right
  // pitch attitude hold with the elevator (PI + rate damping); the integral is the pilot holding (or trimming) the stick
  pitch(theta, dt) {
    const e = theta - this.s.pitch * D2R; this.iE = cl(this.iE + e * dt * 1.2, -1, 1);
    this.p.input.elevator = cl(2.2 * e + this.iE - 0.6 * this.rates().q);
  }
  // bank hold with the ailerons, the rudder coordinates (sideslip to zero)
  bank(phi, dt) {
    const e = phi - this.s.bank * D2R; this.iA = cl(this.iA + e * dt * 0.3, -0.2, 0.2);
    this.p.input.aileron = cl(2.0 * e + this.iA - 0.35 * this.rates().p);
    this.iR = cl(this.iR + this.s.beta * D2R * dt * 2, -0.5, 0.5);
    this.p.input.rudder = cl(this.s.tas > 15 ? 3 * this.s.beta * D2R + this.iR : 0);
  }
  heading(psi, dt, maxBank = 30) { const e = wrap(psi - this.s.heading * D2R); this.bank(cl(1.6 * e, -maxBank * D2R, maxBank * D2R), dt); }
  // follow the line from a to b (x, z): heading towards a point on it 250 m ahead
  track(a, b, dt, maxBank = 30) {
    const p = this.p.pos, dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const along = (p.x - a.x) * ux + (p.z - a.z) * uz, ex = a.x + ux * (along + 250), ez = a.z + uz * (along + 250);
    this.heading(Math.atan2(ex - p.x, -(ez - p.z)), dt, maxBank);
    return { along, L, cross: (p.x - a.x) * uz - (p.z - a.z) * ux };
  }
  // the vertical speed with pitch (outer loop), the speed with the throttle
  vs(vsWant, dt) { const s = this.s; this.pitch(cl(s.aoa * D2R + Math.asin(cl(vsWant / Math.max(20, s.tas))) + 0.05 * (vsWant - s.vs), -0.25, 0.3), dt); }
  alt(h, dt) { this.vs(cl(0.12 * (h - this.s.alt), -4, 4), dt); }
  speedThrottle(kias, dt) { const e = kias - this.s.kias; this.iT = cl(this.iT + e * dt * 0.03, 0, 1); this.p.input.throttle = cl(this.iT + 0.06 * e, 0, 1); }
  // climb or descend at a speed with the pitch (full power: a climb at Vy)
  speedPitch(kias, dt) { const s = this.s; this.iS = cl((this.iS ?? s.pitch * D2R) + (s.kias - kias) * dt * 0.004, -0.2, 0.3); this.pitch(cl(this.iS + 0.012 * (s.kias - kias), -0.2, 0.3), dt); }
}

const plane = (spec, world) => { const p = new Plane(spec); p.place(world, RWY.x, RWY.z0 - 20, Math.PI); for (let i = 0; i < 2 / DT; i++) p.step(DT, world); return p; };
const gearH = p => -Math.min(...p.gear.map(g => g.at.y));          // centre of mass above the tyres
// put the plane in the air, trimmed roughly, wings level
function inAir(spec, world, alt, kias, heading = Math.PI) {
  const p = new Plane(spec); p.reset(0, alt, 0, heading); p.vel.copy(p.fw).multiplyScalar(kias * KNOT * 1.03); p.omega = 2300 / 9.549;
  const a = new Pilot(p); a.iT = 0.7;
  for (let i = 0; i < 40 / DT; i++) { a.alt(alt, DT); a.speedThrottle(kias, DT); a.bank(0, DT); p.step(DT, world); }
  return [p, a];
}

// take-off from the south end with 10° flaps (the POH short-field way): rotate at Vr, climb at Vx to 15 m, then at Vy with the
// flaps up; rotation speed, the roll to lift-off, the distance to 15 m, and the climb rate at Vy (150–450 m)
function takeoff(spec, v, flaps = 1) {
  const w = airfield(), p = plane(spec, w), s = p.state, a = new Pilot(p), z0 = p.pos.z, h0 = gearH(p), vr = v.vr;
  p.input.flaps = flaps; p.input.throttle = 1;
  let t = 0, rot = null, lift = null, d15 = null, air = 0, h1 = null, t1 = 0, climb = null;
  while (t < 300 && !p.crashed) {
    const x = p.pos.x;
    if (s.onGround && lift == null) {
      // the centre line with the rudder (nose wheel and rudder), wings level with the aileron
      p.input.rudder = cl(-2.5 * wrap(s.heading * D2R) - 0.08 * x - 0.6 * a.rates().r + a.iR); a.iR = cl(a.iR - (0.02 * x + wrap(s.heading * D2R)) * DT * 0.5, -0.6, 0.6);
      p.input.aileron = cl(-0.05 * s.bank - 0.2 * a.rates().p);
      if (s.kias >= vr) { if (rot == null) rot = s.kias; a.pitch(Math.min(12, (t - (a.tr ??= t)) * 6 + 3) * D2R, DT); } else p.input.elevator = -0.05;
    } else {
      a.track({ x: 0, z: RWY.z0 }, { x: 0, z: -9000 }, DT, 15);
      a.speedPitch(s.agl - h0 < 15 ? v.vx : v.vy, DT);
      if (s.agl - h0 > 60) p.input.flaps = 0;
    }
    p.step(DT, w); t += DT;
    if (!s.onGround) air += DT; else air = 0;
    if (lift == null && air > 0.3) lift = { d: z0 - p.pos.z, kias: s.kias };
    if (d15 == null && s.agl - h0 >= 15) d15 = z0 - p.pos.z;
    if (h1 == null && s.agl > 150) { h1 = s.alt; t1 = t; }
    if (h1 != null && s.agl > 450) { climb = (s.alt - h1) / (t - t1); break; }
  }
  return { rot, lift, d15, climb, crash: p.crashReason };
}
// level flight at a fixed throttle: hold height with the elevator, wings level; the speed it settles at
function level(spec, throttle, alt = 600) {
  const w = airfield(), [p, a] = inAir(spec, w, alt, 100), s = p.state;
  let kt = 0, rpm = 0, n = 0;
  for (let i = 0; i < 150 / DT; i++) {
    p.input.throttle = throttle; a.alt(alt, DT); a.bank(0, DT); p.step(DT, w);
    if (i * DT > 120) { kt += s.kt; rpm += s.rpm; n++; }
  }
  return { ktas: kt / n, kias: s.kias, rpm: rpm / n, crash: p.crashReason, pitch: s.pitch };
}
// the throttle for a given rpm in level flight (cruise power)
function cruise(spec, rpmWant, alt = 600) {
  const w = airfield(), [p, a] = inAir(spec, w, alt, 100), s = p.state;
  let thr = 0.7, kt = 0, n = 0;
  for (let i = 0; i < 200 / DT; i++) {
    thr = cl(thr + (rpmWant - s.rpm) * DT * 0.0002, 0, 1); p.input.throttle = thr; a.alt(alt, DT); a.bank(0, DT); p.step(DT, w);
    if (i * DT > 170) { kt += s.kt; n++; }
  }
  return { ktas: kt / n, kias: s.kias, thr, rpm: s.rpm };
}
// stall: throttle idle, hold the height so the speed bleeds off at ~1 kt/s, until the wing lets go
function stall(spec, flaps) {
  const w = airfield(), [p, a] = inAir(spec, w, 900, 75), s = p.state;
  p.input.flaps = flaps; for (let i = 0; i < 15 / DT; i++) { a.alt(900, DT); a.speedThrottle(70, DT); a.bank(0, DT); p.step(DT, w); }
  p.input.throttle = 0;
  let minKias = 1e9, warn = null, t = 0, broke = null, theta = s.pitch * D2R;
  while (t < 80 && !p.crashed) {
    // raise the nose so the speed falls by 1 kt/s, wings level, ball in the middle
    const dec = (s.kias - (a.lastK ?? s.kias)) / DT; a.lastK = s.kias;
    theta = cl(theta + DT * 0.02 * (dec + 1), -0.3, 0.45); a.pitch(theta, DT); a.bank(0, DT);
    p.step(DT, w); t += DT;
    if (warn == null && s.stallWarn) warn = s.kias;
    if (s.kias < minKias) minKias = s.kias;
    // the break: the wing stalls (the lift falls away: the nose drops or a sink rate builds that the elevator cannot stop)
    if (s.stalled || s.vs < -5) { broke = s.kias; break; }
  }
  return { vs: Math.min(minKias, broke ?? 1e9), warn, crash: p.crashReason };
}
// a 360° turn at 30° bank holding height and speed
function turn360(spec, kias = 90) {
  const w = airfield(), [p, a] = inAir(spec, w, 600, kias), s = p.state;
  let t = 0, turned = 0, last = s.heading, maxBeta = 0, minAlt = 1e9, maxAlt = -1e9, g = 0, n = 0;
  while (turned < 360 && t < 200) {
    a.bank(30 * D2R, DT); a.alt(600, DT); a.speedThrottle(kias, DT);
    p.step(DT, w); t += DT;
    let d = s.heading - last; if (d > 180) d -= 360; if (d < -180) d += 360; turned += d; last = s.heading;
    if (t > 4) { maxBeta = Math.max(maxBeta, Math.abs(s.beta)); minAlt = Math.min(minAlt, s.alt); maxAlt = Math.max(maxAlt, s.alt); g += s.g; n++; }
  }
  const V = s.tas, omega = 2 * Math.PI / (t - 2);
  return { t, R: V / omega, dh: maxAlt - minAlt, beta: maxBeta, g: g / n, crash: p.crashReason };
}
// a left-hand circuit and a landing on the same runway (heading north): climb-out, crosswind, downwind at 300 m, base, final
// on a 3.5° glide path with full flaps at 65 kt, a flare, and the brakes
function circuit(spec, o = {}) {
  const w = airfield(), p = plane(spec, w), s = p.state, a = new Pilot(p), h0 = gearH(p), field = RWY.h;
  const vy = o.vy ?? 74, vapp = o.vapp ?? 62, vr = o.vr ?? 55, H = field + 300;
  const legs = [
    { name: 'climb-out', a: { x: 0, z: RWY.z0 }, b: { x: 0, z: -1200 } },
    { name: 'crosswind', a: { x: 0, z: -1200 }, b: { x: -1300, z: -1200 } },
    { name: 'downwind', a: { x: -1300, z: -1200 }, b: { x: -1300, z: 2600 } },
    { name: 'base', a: { x: -1300, z: 2600 }, b: { x: 0, z: 2600 } },
    { name: 'final', a: { x: 0, z: 2600 }, b: { x: 0, z: RWY.z1 } },
  ];
  const aim = RWY.z0 - 150, gs = 3.5 * D2R;
  let leg = 0, t = 0, phase = 'takeoff', td = null, stop = null, maxBank = 0, flare = false, air = 0, tdT = 0;
  p.input.throttle = 1; p.input.flaps = 1;
  while (t < 900 && !p.crashed) {
    const L = legs[leg], hw = s.agl - h0;
    if (phase === 'takeoff') {
      p.input.rudder = cl(-2.5 * wrap(s.heading * D2R) - 0.08 * p.pos.x - 0.6 * a.rates().r + a.iR); a.iR = cl(a.iR - (0.02 * p.pos.x + wrap(s.heading * D2R)) * DT * 0.5, -0.6, 0.6);
      p.input.aileron = cl(-0.05 * s.bank - 0.2 * a.rates().p);
      if (s.kias >= vr) a.pitch(Math.min(11, (t - (a.tr ??= t)) * 4 + 2) * D2R, DT); else p.input.elevator = -0.05;
      if (!s.onGround) air += DT; else air = 0;
      if (air > 1) { phase = 'air'; a.iR = 0; }
    } else if (phase === 'air') {
      const tr = a.track(L.a, L.b, DT, 25);
      if (L.name !== 'final' && tr.along > tr.L - 300) leg++;
      if (L.name === 'climb-out' || L.name === 'crosswind') {
        if (s.alt < H - 15) { p.input.throttle = 1; a.speedPitch(hw < 15 ? o.vx ?? 60 : vy, DT); if (hw > 60) p.input.flaps = 0; } else { a.alt(H, DT); a.speedThrottle(90, DT); }
      } else if (L.name === 'downwind') {
        // abeam the threshold: flaps 10 and start down
        const abeam = p.pos.z > RWY.z0;
        p.input.flaps = abeam ? 1 : 0;
        a.alt(abeam ? H - 120 : H, DT); a.speedThrottle(abeam ? 75 : 90, DT);
      } else if (L.name === 'base') {
        p.input.flaps = 2; a.alt(field + 140, DT); a.speedThrottle(70, DT);
      } else {
        // final: the glide path with the elevator (via the vertical speed), the speed with the throttle
        p.input.flaps = tr.cross ** 2 < 400 ? 3 : 2;
        const dist = p.pos.z - aim, hPath = field + h0 + Math.max(0, dist) * Math.tan(gs);
        if (!flare && hw < 6.5) flare = true;
        if (!flare) {
          const vsPath = -s.tas * Math.sin(gs) + 0.2 * (hPath - s.alt);
          a.vs(cl(vsPath, -5, 2), DT); a.speedThrottle(vapp, DT);
        } else {
          // the flare: power off, the sink rate brought down with the height, then held off just above the runway while the
          // speed bleeds away (the pilot keeps the nose coming up until it settles)
          p.input.throttle = 0;
          a.vs(hw > 1.2 ? -Math.max(0.5, 0.3 * hw) : -0.25, DT);
        }
        if (s.onGround) { phase = 'rollout'; td = { kias: s.kias, vs: a.lastVs ?? s.vs, z: p.pos.z, x: p.pos.x }; tdT = t; }
      }
      a.lastVs = s.vs;
      maxBank = Math.max(maxBank, Math.abs(s.bank));
    } else {
      // roll-out: the nose down, the centre line with the rudder, brakes once the nose wheel is on the ground
      p.input.throttle = 0; p.input.flaps = 3;
      a.pitch((s.kias > 40 ? 3 : -2) * D2R, DT);
      p.input.rudder = cl(-2.5 * wrap(s.heading * D2R) - 0.08 * p.pos.x - 0.6 * a.rates().r);
      p.input.aileron = cl(-0.05 * s.bank - 0.2 * a.rates().p);
      const noseDown = p.gear.find(g => g.steer)?.contact;
      p.input.brake = noseDown && t - tdT > 1 ? 0.8 : 0;
      if (s.tas < 0.3) { stop = { z: p.pos.z, x: p.pos.x }; break; }
    }
    p.step(DT, w); t += DT;
  }
  return { td, stop, roll: td && stop ? td.z - stop.z : null, tdPast: td ? RWY.z0 - td.z : null, maxBank, crash: p.crashReason, time: t, onRunway: stop ? Math.abs(stop.x) < 15 && stop.z > RWY.z1 : false };
}
// crash checks: water, a hard landing, a wing tip
function crashes(spec) {
  const out = {};
  { // into the sea at a gentle descent
    const w = airfield(), p = new Plane(spec); p.reset(5200, 8, 0, -Math.PI / 2); p.vel.copy(p.fw).multiplyScalar(30); p.omega = 1500 / 9.549;
    const a = new Pilot(p); for (let i = 0; i < 20 / DT && !p.crashed; i++) { a.vs(-1, DT); a.bank(0, DT); p.input.throttle = 0.3; p.step(DT, w); } out.water = p.crashReason; }
  { // dropped onto the runway at 5 m/s
    const w = airfield(), p = new Plane(spec); p.reset(0, 2 + gearH(p) + 1.5, 0, Math.PI); p.vel.copy(p.fw).multiplyScalar(28); p.vel.y = -5; p.omega = 1000 / 9.549;
    for (let i = 0; i < 3 / DT && !p.crashed; i++) p.step(DT, w); out.hard = p.crashReason; }
  { // banked 45° and sinking onto the runway
    const w = airfield(), [p, a] = inAir(spec, w, 2 + gearH(p0(spec)) + 4, 75); p.input.throttle = 0.3;
    for (let i = 0; i < 10 / DT && !p.crashed; i++) { a.bank(45 * D2R, DT); a.vs(-1.5, DT); p.step(DT, w); } out.tip = p.crashReason; }
  { // a tree 25 m tall straight ahead at 15 m
    const cols = [{ x: 0, z: -300, r: 3, y0: 2, y1: 27, kind: 'a tree' }];
    const w = flatWorld({ height: () => 2, surf: SURF.GRASS, water: -Infinity, colliders: cols }), [p, a] = inAir(spec, w, 17, 90);
    for (let i = 0; i < 20 / DT && !p.crashed; i++) { a.alt(17, DT); a.speedThrottle(90, DT); a.bank(0, DT); p.step(DT, w); } out.tree = p.crashReason; }
  { // a hard pull at high speed (no assist)
    const w = airfield(), [p, a] = inAir(spec, w, 900, spec.limits.vne * 0.85);
    let gMax = 0; for (let i = 0; i < 5 / DT && !p.crashed; i++) { p.input.elevator = 1; p.step(DT, w); gMax = Math.max(gMax, p.state.g); } out.g = p.crashReason || `no crash, ${gMax.toFixed(1)} g`; }
  return out;
}
const p0 = spec => new Plane(spec);
// hands off: level at cruise, the pilot moves the trim wheel until the stick is free, then lets go of everything for 60 s
function handsOff(spec, kias = 100) {
  const w = airfield(), [p, a] = inAir(spec, w, 600, kias), s = p.state, sc = spec.controls;
  for (let i = 0; i < 90 / DT; i++) {
    a.alt(600, DT); a.speedThrottle(kias, DT); a.bank(0, DT);
    const move = p.input.elevator * DT * 0.5;                        // trim away what the stick holds
    p.input.trim = cl(p.input.trim + move * sc.elevator[0] / sc.trim); a.iE -= move;
    p.step(DT, w);
  }
  const alt0 = s.alt, hdg0 = s.heading, pitch0 = s.pitch, stick = p.input.elevator; if (process.env.SHOWAIL) console.log(spec.id, "trimmed aileron", p.input.aileron.toFixed(4), "rudder", p.input.rudder.toFixed(4), "elevator", stick.toFixed(4));
  p.input.elevator = 0; p.input.aileron = 0; p.input.rudder = 0;
  let bank = 0, dp = 0;
  for (let i = 0; i < 60 / DT && !p.crashed; i++) { p.step(DT, w); bank = Math.max(bank, Math.abs(s.bank)); dp = Math.max(dp, Math.abs(s.pitch - pitch0)); }
  return { stick, trim: p.input.trim, dAlt: s.alt - alt0, dHdg: (s.heading - hdg0 + 540) % 360 - 180, bank, dp, kias: s.kias, crash: p.crashReason };
}
// the easy mode (assist): what a player does with the stick
function assist(spec, v) {
  const w = airfield(), p = new Plane(spec, { assist: true }), s = p.state, run = (t, f) => { for (let i = 0; i < t / DT && !p.crashed; i++) { f && f(); p.step(DT, w); } };
  p.place(w, 0, RWY.z0 - 20, Math.PI); run(2);
  p.input.throttle = 1;
  let off = null; run(90, () => { p.input.elevator = s.kias > v.vr && s.agl < 450 ? 0.5 : 0; if (off == null && !s.onGround) off = s.kias; });
  run(15); const levelVs = Math.abs(s.vs);
  p.input.aileron = 1; let bank = 0, slip = 0, dh = 0; const h0 = s.alt;
  run(15, () => { bank = Math.max(bank, s.bank); slip = Math.max(slip, Math.abs(s.beta)); dh = Math.max(dh, Math.abs(s.alt - h0)); });
  p.input.aileron = 0; run(6); const back = Math.abs(s.bank);
  p.input.elevator = -1; run(6); p.input.elevator = 0; run(12); const recover = { vs: s.vs, pitch: s.pitch };
  p.input.throttle = 0; p.input.elevator = 1; let minK = 1e9, stalled = false; run(40, () => { minK = Math.min(minK, s.kias); stalled ||= s.stalled; });
  return { off, levelVs, bank, slip, dh, back, recover, minK, stalled, crash: p.crashReason };
}

const list = PLANES.filter(s => !only || s.id === only);
const V = { make: { vr: 55, vx: 60, vy: 74, vapp: 62 }, falk: { vr: 60, vx: 72, vy: 95, vapp: 68 } };
console.log('\nTake-off, climb and speed');
console.log('plane'.padEnd(7), '  Vr kt', ' lift kt', ' roll m', '  15 m', ' climb m/s', '  fpm', '| level kt (TAS) at throttle 0.75 / 1.0 ', ' rpm  ', '| cruise 2450 rpm: kt  thr');
for (const spec of list) {
  const v = V[spec.id] || V.make, to = takeoff(spec, v), l75 = level(spec, 0.75), l100 = level(spec, 1), cr = cruise(spec, 2450);
  console.log(spec.id.padEnd(7), fmt(to.rot, 1, 7), fmt(to.lift?.kias, 1, 8), fmt(to.lift?.d, 0, 7), fmt(to.d15, 0, 6), fmt(to.climb, 2, 10), fmt(to.climb * 196.85, 0, 6), '|', fmt(l75.ktas, 1, 18), fmt(l100.ktas, 1, 8), fmt(l100.rpm, 0, 13), '|', fmt(cr.ktas, 1, 18), fmt(cr.thr, 2, 5), to.crash ? ' CRASH ' + to.crash : '');
}
console.log('\nStall (KIAS, power off), 360° turn at 30° bank (90 KIAS, holding height)');
console.log('plane'.padEnd(7), '| clean: stall  warn | flaps 30: stall  warn | 360°: time s   radius m   height ±m   g    max slip°');
for (const spec of list) {
  const c = stall(spec, 0), f = stall(spec, 3), tu = turn360(spec);
  console.log(spec.id.padEnd(7), '|', fmt(c.vs, 1, 12), fmt(c.warn, 1, 6), '|', fmt(f.vs, 1, 15), fmt(f.warn, 1, 6), '|', fmt(tu.t, 1, 12), fmt(tu.R, 0, 10), fmt(tu.dh / 2, 1, 11), fmt(tu.g, 2, 6), fmt(tu.beta, 1, 8), c.crash || f.crash || tu.crash || '');
}
console.log('\nHands off at 100 KIAS (trimmed with the trim wheel, then all controls let go for 60 s), and the easy mode (assist)');
console.log('plane'.padEnd(7), '| trim   alt ±m  heading°  max bank  pitch ± | assist: lift-off kt  level vs | full stick: bank  slip  height ± | let go: bank | dive, let go: vs | idle + full back: min kt stalled');
for (const spec of list) {
  const h = handsOff(spec), v = V[spec.id] || V.make, as = assist(spec, v);
  console.log(spec.id.padEnd(7), '|', fmt(h.trim, 2, 4), fmt(h.dAlt, 0, 8), fmt(h.dHdg, 0, 9), fmt(h.bank, 1, 9), fmt(h.dp, 1, 8), '|', fmt(as.off, 1, 19), fmt(as.levelVs, 2, 9), '|', fmt(as.bank, 1, 17), fmt(as.slip, 1, 5), fmt(as.dh, 0, 9), '|', fmt(as.back, 1, 12), '|', fmt(as.recover.vs, 1, 16), '|', fmt(as.minK, 1, 24), as.stalled ? '     yes' : '      no', h.crash || as.crash || '');
}
console.log('\nCircuit and landing (left-hand circuit at 300 m, 3.5° final at full flaps), and crash checks');
console.log('plane'.padEnd(7), '| touchdown: KIAS  sink m/s  past threshold m | stop: roll m  on runway | circuit s | water / hard landing / wing tip / tree / full pull at 0.85 Vne');
for (const spec of list) {
  const v = V[spec.id] || V.make, c = circuit(spec, v), k = crashes(spec);
  console.log(spec.id.padEnd(7), '|', fmt(c.td?.kias, 1, 15), fmt(c.td?.vs, 2, 9), fmt(c.tdPast, 0, 18), '|', fmt(c.roll, 0, 13), c.onRunway ? '       yes' : '        no', '|', fmt(c.time, 0, 9), '|', [k.water, k.hard, k.tip, k.tree, k.g].map(r => r || 'NO CRASH').join(' / '), c.crash ? ' CRASH ' + c.crash : '');
}
