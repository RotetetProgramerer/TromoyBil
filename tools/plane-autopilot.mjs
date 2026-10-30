// An autopilot for the ring flights (sim/data/flights.js) that flies only with the normal controls, like a pilot: throttle,
// elevator, aileron, rudder, flaps and brakes. In the easy mode (assist) it moves the stick as a player would: the stick asks for a
// bank angle and a flight path. tools/test-plane-flights.mjs flies every flight with it in Node; the same module runs in the browser
// against the game's own ring and landing checks (it is plain ES, no Node imports).
//   const ap = new Autopilot(plane, airport, rings);   every step: ap.step(dt, gi)   (gi: the next ring; past the last: the landing)
import { runwayFrame, glideY, GLIDE } from '../sim/data/flights.js';

const D2R = Math.PI / 180, cl = (v, a = -1, b = 1) => v < a ? a : v > b ? b : v, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// the speeds (KIAS) each plane is flown at: rotation, best angle and rate of climb, cruise (and slower on short legs), approach
export const SPEEDS = { make: { vr: 55, vx: 62, vy: 74, cruise: 105, slow: 95, vapp: 64, bank: 35 }, falk: { vr: 60, vx: 75, vy: 100, cruise: 145, slow: 110, vapp: 70, bank: 45 } };

// attitude, speed and track holds from the stick, the pedals and the throttle
export class Pilot {
  constructor(p, A) { this.p = p; this.A = A; this.iE = 0; this.iT = 0.7; this.iR = 0; this.iA = 0; }
  get s() { return this.p.state; }
  get assist() { return this.p.assist; }
  rates() { const p = this.p; return { p: p.w.dot(p.fw), q: -p.w.dot(p.lf), r: -p.w.dot(p.up) }; }
  // the assist: the stick asks for a flight path (+15° / −12° at full stick)
  path(gam) { this.p.input.elevator = gam >= 0 ? cl(gam / (15 * D2R)) : cl(gam / (12 * D2R)); }
  pitch(theta, dt) { const e = theta - this.s.pitch * D2R; this.iE = cl(this.iE + e * dt * 1.2); this.p.input.elevator = cl(2.2 * e + this.iE - 0.6 * this.rates().q); }
  bank(phi, dt) {
    if (this.assist && !this.s.onGround) { this.p.input.aileron = cl(phi / (45 * D2R)); this.p.input.rudder = 0; return; }
    const e = phi - this.s.bank * D2R; this.iA = cl(this.iA + e * dt * 0.3, -0.2, 0.2);
    this.p.input.aileron = cl(2.0 * e + this.iA - 0.35 * this.rates().p);
    this.iR = cl(this.iR + this.s.beta * D2R * dt * 2, -0.5, 0.5);
    this.p.input.rudder = cl(this.s.tas > 15 ? 3 * this.s.beta * D2R + this.iR : 0);
  }
  // fly the course over the ground (the wind's drift taken out) towards psi (compass, rad)
  course(psi, dt, maxBank) {
    const v = this.p.vel, trk = Math.atan2(v.x, -v.z), hd = this.s.heading * D2R, drift = Math.hypot(v.x, v.z) > 10 ? wrap(trk - hd) : 0;
    this.bank(cl(1.6 * wrap(psi - drift - hd), -maxBank * D2R, maxBank * D2R), dt);
  }
  toward(x, z, dt, maxBank) { const p = this.p.pos; this.course(Math.atan2(x - p.x, -(z - p.z)), dt, maxBank); }
  vs(vsWant, dt) { const s = this.s; if (this.assist && !s.onGround) return this.path(Math.asin(cl(vsWant / Math.max(20, s.tas)))); this.pitch(cl(s.aoa * D2R + Math.asin(cl(vsWant / Math.max(20, s.tas))) + 0.05 * (vsWant - s.vs), -0.25, 0.3), dt); }
  speedThrottle(kias, dt) { const e = kias - this.s.kias; this.iT = cl(this.iT + e * dt * 0.03, 0, 1); this.p.input.throttle = cl(this.iT + 0.06 * e, 0, 1); }
  speedPitch(kias, dt) { const s = this.s; if (this.assist && !s.onGround) { this.gS = cl((this.gS ?? 0.1) + (s.kias - kias) * dt * 0.01, -0.1, 0.26); return this.path(this.gS); } this.iS = cl((this.iS ?? s.pitch * D2R) + (s.kias - kias) * dt * 0.004, -0.2, 0.3); this.pitch(cl(this.iS + 0.012 * (s.kias - kias), -0.2, 0.3), dt); }
  // straight down the runway with the rudder (and the nose wheel), wings level
  roll(dt) {
    const A = this.A, s = this.s, f = runwayFrame(A, this.p.pos.x, this.p.pos.z), he = wrap(s.heading * D2R - Math.atan2(A.rwy.ux, -A.rwy.uz));
    this.p.input.rudder = cl(-2.5 * he + 0.08 * f.t - 0.6 * this.rates().r + this.iR); this.iR = cl(this.iR + (0.02 * f.t - he) * dt * 0.5, -0.6, 0.6);
    this.p.input.aileron = cl(-0.05 * s.bank - 0.2 * this.rates().p);
  }
}

export class Autopilot {
  constructor(p, A, G) {
    this.p = p; this.A = A; this.G = G; this.a = new Pilot(p, A); this.v = SPEEDS[p.spec.id] || SPEEDS.make; this.phase = 'roll'; this.t = 0; this.air = 0; this.flare = false;
    this.gearH = -Math.min(...p.gear.map(g => g.at.y)); this.lastVs = null; this.td = null;
    this.slow = G.some((g, i) => i && Math.hypot(g.x - G[i - 1].x, g.z - G[i - 1].z) < 1000);     // short legs: slower all the way
    p.input.throttle = 1; p.input.flaps = 1; p.input.brake = 0;
  }
  step(dt, gi) {
    const p = this.p, s = p.state, a = this.a, v = this.v, A = this.A, G = this.G, hw = s.agl - this.gearH;
    this.t += dt;
    if (this.phase === 'roll') {
      a.roll(dt); p.input.throttle = 1; p.input.brake = 0;
      if (s.kias >= v.vr) a.pitch(Math.min(10, (this.t - (this.tr ??= this.t)) * 4 + 2) * D2R, dt); else p.input.elevator = -0.05;
      if (!s.onGround) this.air += dt; else this.air = 0;
      if (this.air > 1) { this.phase = 'rings'; a.iR = 0; }
      return;
    }
    if (this.phase === 'rings' && gi >= G.length) this.phase = 'final';
    if (this.phase === 'rings') {
      if (gi !== this.gi) { this.gi = gi; this.back = null; }
      const g = G[gi], from = gi ? G[gi - 1] : { x: A.start.x + A.rwy.ux * 400, z: A.start.z + A.rwy.uz * 400, y: A.rwy.y + 10 };
      // follow the line from the last ring to this one (a point ahead on it, further the faster)
      const lx = g.x - from.x, lz = g.z - from.z, L = Math.hypot(lx, lz) || 1, ux = lx / L, uz = lz / L, along = (p.pos.x - from.x) * ux + (p.pos.z - from.z) * uz;
      const la = Math.max(180, s.tas * 3.2), q = Math.min(along + la, L + 30);
      if (along > L + 60 && !this.back) this.back = { x: g.x - ux * 2200, z: g.z - uz * 2200 };        // missed: go round and come again
      if (this.back && Math.hypot(this.back.x - p.pos.x, this.back.z - p.pos.z) < 400) this.back = null;
      // the turns: slower into a sharp one, and half of it before the ring (close to it, follow the line through it along its facing)
      const nx = G[gi + 1] || A.aim, turn = Math.abs(wrap(Math.atan2(nx.x - g.x, nx.z - g.z) - Math.atan2(lx, lz))), pv = gi ? G[gi - 2] || A.start : null, before = pv ? Math.abs(wrap(Math.atan2(lx, lz) - Math.atan2(from.x - pv.x, from.z - pv.z))) : 0;
      const Rt = s.tas * s.tas / (9.81 * Math.tan(v.bank * 0.75 * D2R)), nh = Math.hypot(g.nx, g.nz) || 1, vx = g.nx / nh, vz = g.nz / nh;
      const near = L - along < Rt * Math.tan(turn / 2) + 120 && along < L + 10, dn = (g.x - p.pos.x) * vx + (g.z - p.pos.z) * vz, qn = Math.max(-30, dn - la);
      if (this.back) a.toward(this.back.x, this.back.z, dt, v.bank); else if (near) a.toward(g.x - vx * qn, g.z - vz * qn, dt, v.bank); else a.toward(from.x + ux * q, from.z + uz * q, dt, v.bank);
      const sharp = turn > 55 * D2R && L - along < 2500 || before > 40 * D2R && L < 2000;
      // the height: from the last ring's to this one's along the leg, a little ahead; climbs at Vy with full power when far below
      const u = cl((along + 120) / L, 0, 1), hT = from.y + (g.y - from.y) * u, climb = hT - s.alt > (a.climbing ? 8 : 25) + 3 * Math.max(0, s.vs);
      a.climbing = climb;
      if (climb) { p.input.throttle = 1; a.speedPitch(v.vy, dt); a.iT = 1; }
      else { a.vs(cl(0.2 * (hT - s.alt) + (g.y - from.y) / L * s.tas, -7, 7), dt); a.speedThrottle(this.slow || sharp ? v.slow : v.cruise, dt); }
      if (hw > 60) p.input.flaps = 0;
      this.hT = hT;
    } else if (this.phase === 'final') {
      // the extended centre line, the glide path by the vertical speed and the speed by the throttle; flaps out; the flare
      const R = A.rwy, f = runwayFrame(A, p.pos.x, p.pos.z), ahead = Math.max(f.s + 300, 0);
      a.toward(R.x0 + R.ux * (ahead + 300), R.z0 + R.uz * (ahead + 300), dt, 20);
      p.input.flaps = 250 - f.s < 2200 ? 3 : 2;
      if (!this.flare && hw < 6) this.flare = true;
      if (!this.flare) { const hP = glideY(A, p.pos.x, p.pos.z) + this.gearH; a.vs(cl(-s.tas * Math.sin(GLIDE * D2R) + 0.25 * (hP - s.alt), -5, 2), dt); a.speedThrottle(v.vapp, dt); }
      else { p.input.throttle = 0; a.vs(hw > 1.2 ? -Math.max(0.5, 0.3 * hw) : -0.25, dt); }
      if (s.onGround) { this.phase = 'rollout'; this.td = { kias: s.kias, vs: this.lastVs ?? s.vs, s: f.s, t: f.t }; this.tdT = this.t; }
      this.lastVs = s.vs;
    } else {
      // the roll-out: nose down, straight with the rudder, brakes once the nose wheel is down
      p.input.throttle = 0; a.pitch((s.kias > 40 ? 3 : -2) * D2R, dt); a.roll(dt);
      p.input.brake = p.gear.find(g => g.steer).contact && this.t - this.tdT > 1 ? 0.8 : 0;
    }
  }
}
