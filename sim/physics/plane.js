// Light aircraft: a single-engine propeller plane as a rigid body, in SI units (m, kg, s, N). No DOM and no three.js, so it runs
// in Node (tools/test-plane.mjs).
//
//   wing       strips along the span, each with its own angle of attack from the local airflow (so rolling damps itself, a
//              down-going aileron drags: adverse yaw, washout keeps the tips flying when the roots stall): lift curve with stall
//              and post-stall, profile and induced drag, pitching moment, flaps and ailerons, ground effect
//   tail       horizontal tail in the wing's downwash, with elevator and trim tab; vertical tail with rudder; both get the
//              propeller slipstream
//   engine     piston engine (torque from throttle and air density) on a fixed-pitch propeller (thrust and power coefficients
//              against the advance ratio): the rpm comes from the torque balance and the propeller windmills in a glide;
//              torque reaction, slipstream swirl, P-factor and gyroscopic precession
//   gear       tricycle: three spring-damper struts on world.height, tyre side grip, rolling resistance, brakes, nosewheel steering
//              with the rudder
//   crash      too hard on the gear, a wing tip, the propeller, the belly or the nose on the ground, water, something in
//              world.colliders, or overspeed and over-g: crashed is set with a reason and the plane stops
//   assist     the easy mode: the stick asks for a bank angle (at most 45°) and a flight path (level flight when let go; the
//              trim follows by itself), pitch limits, the rudder coordinates the turns, and near the stall the elevator loses
//              its authority and the nose comes down
//
// Body frame like the car: +z forward, +y up, +x left, origin in the centre of mass. Heading h points the nose along (sin h, 0, cos h).
// Controls (this.input): throttle 0…1, elevator −1…1 (+ = stick back, nose up), aileron −1…1 (+ = roll right), rudder −1…1
// (+ = yaw right), flaps 0…3 (stages), trim −1…1 (+ = nose up), brake 0…1 (brakeL/brakeR for differential braking).
import { V3, Quat, clamp, smoothstep, RPM } from './math.js';
import { SURF_PROPS } from './surfaces.js';

const G = 9.81, RHO0 = 1.225, D2R = Math.PI / 180, KT = 0.514444;
export const KNOT = KT;
export const airDensity = h => RHO0 * Math.pow(Math.max(0.2, 1 - 2.2558e-5 * h), 4.2559);   // ISA
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _n = new V3(), _r = new V3(), _P = new V3(), _v = new V3(),
  _F = new V3(), _Fw = new V3(), _M = new V3(), _vb = new V3(), _wb = new V3(), _s = new V3(), _u = new V3(), _q = new Quat();

// Lift coefficient against the angle of attack x measured from zero lift (rad): straight with slope a, rounded over the last few
// degrees to clmax, then dropping into the flat-plate curve after the stall. Returns [cl, separation 0…1].
const ROUND = 3 * D2R, DROP = 9 * D2R;
function liftCurve(a, x, clmax, clmin, out) {
  const ax = Math.abs(x), cm = x >= 0 ? clmax : -clmin, x1 = cm / a - ROUND, xp = x1 + 2 * ROUND;
  let cl, sep = 0;
  if (ax <= x1) cl = a * ax;
  else if (ax <= xp) cl = a * ax - a * (ax - x1) ** 2 / (4 * ROUND);
  else {
    sep = smoothstep(xp, xp + DROP, ax);
    const plate = 1.15 * Math.sin(2 * Math.min(ax, Math.PI / 2)) * (ax > Math.PI / 2 ? -1 : 1);
    cl = cm + (plate - cm) * sep;
    if (ax > xp + DROP) sep = 1;
  }
  out[0] = x >= 0 ? cl : -cl; out[1] = sep;
  return out;
}
const _lc = [0, 0];

export class Plane {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.pos = new V3(); this.vel = new V3(); this.q = new Quat(); this.w = new V3();
    this.fw = new V3(0, 0, 1); this.up = new V3(0, 1, 0); this.lf = new V3(1, 0, 0);
    this.input = { throttle: 0, elevator: 0, aileron: 0, rudder: 0, flaps: 0, trim: 0, brake: 0, brakeL: null, brakeR: null };
    this.assist = !!opts.assist;          // the easy mode (Lett); off: the real thing (Ekte)
    this.wind = new V3();                 // the air's velocity over the ground (m/s)
    this.build();
    this.reset(0, 0, 0, 0);
  }

  build() {
    const s = this.spec, wg = s.wing, m = this.m = s.mass;
    this.I = new V3(...s.inertia);        // about body x (pitch), y (yaw), z (roll)
    // wing strips: n per side from the root out, each knows its flap and aileron
    const n = wg.strips ?? 6, half = wg.span / 2, chord = wg.S / wg.span, AR = wg.span * wg.span / wg.S, G0 = (wg.dihedral ?? 2) * D2R;
    this.AR = AR; this.chord = chord;
    this.aW = 2 * Math.PI * AR / (AR + 2) * 0.97;      // 3D lift slope (per rad)
    this.strips = [];
    for (const side of [1, -1]) for (let i = 0; i < n; i++) {
      const eta = (i + 0.5) / n, y = eta * half, inc = ((wg.incidence ?? 1) - (wg.washout ?? 0) * eta) * D2R;
      const sp = new V3(side * Math.cos(G0), Math.sin(G0), 0), c = new V3(0, Math.sin(inc), Math.cos(inc));
      const nrm = side > 0 ? new V3().crossVectors(c, sp) : new V3().crossVectors(sp, c);
      this.strips.push({ side, eta, A: wg.S / 2 / n, c: chord, pos: new V3(side * y * Math.cos(G0), wg.y + y * Math.sin(G0), wg.z), sp, ch: c, nrm,
        flap: eta < (wg.flapSpan ?? 0.5), ail: eta > (wg.ailSpan?.[0] ?? 0.6) && eta < (wg.ailSpan?.[1] ?? 0.98), inSlip: y < s.prop.D * 0.5, cl: 0, alpha: 0, sep: 0 });
    }
    // tail surfaces
    const ht = s.htail, vt = s.vtail;
    const ARh = ht.span * ht.span / ht.S, ARv = 2 * vt.h * vt.h / vt.S;     // the fin sits on the fuselage: it acts as if twice as tall
    this.aH = 2 * Math.PI * ARh / (ARh + 2) * 0.9; this.aV = 2 * Math.PI * ARv / (ARv + 2) * 0.85;
    this.tails = [];
    for (const side of [1, -1]) {
      const y = ht.span / 4, inc = (ht.incidence ?? 0) * D2R;
      this.tails.push({ kind: 'h', A: ht.S / 2, c: ht.S / ht.span, pos: new V3(side * y, ht.y, ht.z), sp: new V3(side, 0, 0), ch: new V3(0, Math.sin(inc), Math.cos(inc)),
        nrm: side > 0 ? new V3().crossVectors(new V3(0, Math.sin(inc), Math.cos(inc)), new V3(1, 0, 0)) : new V3().crossVectors(new V3(-1, 0, 0), new V3(0, Math.sin(inc), Math.cos(inc))) });
    }
    this.tails.push({ kind: 'v', A: vt.S, c: vt.S / vt.h, pos: new V3(0, vt.y, vt.z), sp: new V3(0, 1, 0), ch: new V3(0, 0, 1), nrm: new V3(1, 0, 0) });
    // engine and propeller
    const e = s.engine, wr = e.rpm / RPM;
    this.eng = { rated: wr, idle: (e.idle ?? 650) / RPM, Q: e.hp * 745.7 / wr, I: e.inertia ?? 2.5, Ip: e.propInertia ?? (e.inertia ?? 2.5) * 0.8, red: (e.redline ?? e.rpm) / RPM };
    this.prop = { D: s.prop.D, A: Math.PI * s.prop.D ** 2 / 4, ct0: s.prop.ct0, cp0: s.prop.cp0, J0: s.prop.J0, pos: new V3(0, s.prop.y ?? 0, s.prop.z) };
    // landing gear: contact point at full extension, strut travel, spring, damper; the nose (or tail) wheel steers
    this.gear = s.gear.wheels.map(g => {
      const k = g.k, mc = g.load * m, c = g.c ?? 2 * 0.55 * Math.sqrt(k * mc);
      return { name: g.name, at: new V3(...g.at), travel: g.travel, k, c, r: g.r ?? 0.2, steer: (g.steer ?? 0) * D2R, brake: !!g.brake, mc,
        x: 0, xPrev: 0, had: false, contact: false, Fz: 0, P: new V3(), N: new V3(0, 1, 0), surf: 0, vsink: 0, spin: 0 };
    });
    // points that must never touch: the propeller tips, the wing tips, the belly, the tail (a tail skid: a gentle touch is allowed)
    const pr = this.prop.pos, R = s.prop.D / 2;
    this.hard = [
      { name: 'propeller', at: new V3(0, pr.y - R, pr.z) },
      { name: 'wing tip', at: new V3(half * Math.cos(G0), wg.y + half * Math.sin(G0), wg.z) }, { name: 'wing tip', at: new V3(-half * Math.cos(G0), wg.y + half * Math.sin(G0), wg.z) },
      ...(s.belly || []).map(p => ({ name: 'belly', at: new V3(...p) })),
      { name: 'tail', at: new V3(...(s.tailSkid || [0, -0.4, -4])), skid: true },
      { name: 'cabin', at: new V3(0, wg.y + 0.3, 0.5) },
    ];
    this.span = wg.span; this.flapDeg = wg.flaps.deg;
  }

  reset(x, y, z, heading) {
    this.q.setFromAxisAngle(_a.set(0, 1, 0), heading);
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.w.set(0, 0, 0);
    for (const g of this.gear) { g.x = 0; g.xPrev = 0; g.had = false; g.contact = false; }
    this.ctl = { de: 0, da: 0, dr: 0, flap: 0, trim: 0, trimDeg: 0, piInt: 0, rInt: 0, bInt: 0 };
    this.omega = this.eng.idle; this.propAngle = 0;
    this.crashed = false; this.crashReason = null; this.crash = null;
    this.epsF = 0;                         // the downwash at the tail, lagging the wing
    this.state = Object.assign(this.state || {}, { tas: 0, ias: 0, kt: 0, kias: 0, alt: y, agl: 0, vs: 0, fpm: 0, heading: 0, pitch: 0, bank: 0, aoa: 0, beta: 0,
      stallWarn: false, stalled: false, stallMargin: -10, onGround: false, g: 1, rpm: this.omega * RPM, overRev: false, overG: false, overspeed: false, thrust: 0, flaps: 0, tailStrike: false,
      time: 0, crashed: false, crashReason: null });
    this.updateAxes();
  }

  // stand the plane on its wheels at (x,z), nose along heading
  place(world, x, z, heading) {
    const g0 = this.gear.reduce((lo, g) => Math.min(lo, g.at.y), 0);
    this.reset(x, world.height(x, z) - g0 + 0.02, z, heading);
    // the static pitch: the line through the nose wheel and the mains
    const nose = this.gear.find(g => g.steer), mains = this.gear.filter(g => g !== nose);
    if (nose && mains.length) {
      const zm = mains.reduce((a, g) => a + g.at.z, 0) / mains.length, ym = mains.reduce((a, g) => a + g.at.y, 0) / mains.length;
      const th = Math.atan2(nose.at.y - ym, nose.at.z - zm);
      this.q.multiply(_q.setFromAxisAngle(_a.set(1, 0, 0), th)).normalize();   // positive about x = nose down
    }
    this.updateAxes();
  }

  // start in the air: level at height y, flying along heading at speed (m/s), the engine turning (for a respawn or a course
  // that starts airborne). In the real mode set the trim and throttle too; the assist trims itself.
  launch(x, y, z, heading, speed, rpm = 2300) {
    this.reset(x, y, z, heading);
    this.vel.copy(this.fw).multiplyScalar(speed); this.omega = rpm / RPM;
    this.ctl.flap = this.spec.wing.flaps.deg[clamp(Math.round(this.input.flaps || 0), 0, this.flapDeg.length - 1)];
  }

  updateAxes() { this.fw.set(0, 0, 1).applyQuaternion(this.q); this.up.set(0, 1, 0).applyQuaternion(this.q); this.lf.set(1, 0, 0).applyQuaternion(this.q); }

  // the pilot's inputs (or the assist) → surface deflections (deg), flaps, trim
  controls(dt) {
    const I = this.input, s = this.spec, c = this.ctl, st = this.state;
    let ail = clamp(I.aileron, -1, 1), ele = clamp(I.elevator, -1, 1), rud = clamp(I.rudder, -1, 1);
    // flaps run electrically, a few degrees a second
    const fTarget = s.wing.flaps.deg[clamp(Math.round(I.flaps || 0), 0, s.wing.flaps.deg.length - 1)];
    c.flap += clamp(fTarget - c.flap, -dt * 4, dt * 4);
    c.trim += clamp(clamp(I.trim || 0, -1, 1) - c.trim, -dt * 0.4, dt * 0.4);
    if (this.assist && !st.onGround) {
      const bank = st.bank * D2R, p = this.w.dot(this.fw), qr = -this.w.dot(this.lf), r = -this.w.dot(this.up), V = Math.max(15, st.tas);
      // roll: the stick sets the bank angle (45° at full stick), wings level when let go (gains follow the dynamic pressure)
      // (an integral holds the bank against the overbanking tendency of a steep turn)
      const kl = clamp((45 / V) ** 2, 0.35, 1.5), eb = ail * 45 * D2R - bank;
      c.bInt = Math.abs(ail) < 0.05 ? c.bInt * Math.exp(-dt * 1.5) : Math.abs(eb) < 8 * D2R ? clamp(c.bInt + eb * dt * 1.5 * kl, -0.2, 0.2) : c.bInt;
      ail = clamp(kl * (3 * eb - 1.0 * p) + c.bInt, -1, 1);
      // pitch: the stick sets the flight path (a 15° climb at full back stick, a 12° dive at full forward, level flight when let
      // go). An inner loop flies it on the load factor (1/cos(bank) in a turn, so turns hold their height) and its integral is
      // the trim. Protections: pitch within +25°/−20°, and near the stall the load factor is taken away so the nose drops.
      const gam = Math.asin(clamp(st.vs / V, -1, 1)), pitch = st.pitch * D2R, mg = (st.stallMargin ?? -10) * D2R;
      let gWant = ele >= 0 ? ele * 15 * D2R : ele * 12 * D2R;
      gWant = clamp(gWant, gam + (-20 * D2R - pitch), gam + (25 * D2R - pitch));
      let nWant = Math.cos(gam) / Math.max(0.5, Math.cos(bank)) + V * clamp(0.5 * (gWant - gam), -0.12, 0.12) / G;
      if (mg > -5 * D2R) nWant -= 0.25 * (mg + 5 * D2R) / D2R;
      const lim = s.limits.g || [3.8, -1.5];
      nWant = clamp(nWant, lim[1] * 0.8, lim[0] * 0.8);
      const k = (50 / V) ** 2, err = nWant - st.g;            // k: the gains follow the dynamic pressure
      c.piInt = clamp(c.piInt + err * dt * 1.2 * k, -1, 1);
      ele = clamp(0.25 * k * err + c.piInt - 0.4 * qr * Math.min(1, k), -1, 1);
      // stall protection: less nose-up elevator near the stall
      if (ele > 0) ele *= 1 - 0.85 * smoothstep(-3 * D2R, -0.5 * D2R, mg);
      // coordination: the rudder drives the sideslip to zero (its integral takes out the propeller's swirl) and damps the yaw
      const beta = st.beta * D2R;
      c.rInt = clamp(c.rInt + beta * dt * 2 * kl, -0.6, 0.6);
      rud = clamp(rud + kl * (3 * beta + 0.4 * (r - G * Math.tan(bank) / V)) + c.rInt, -1, 1);
    } else if (this.assist) {
      // on the ground: the stick also steers, the elevator is direct (and hands over smoothly at lift-off)
      rud = clamp(rud + ail, -1, 1); c.piInt = ele; c.rInt = 0; c.bInt = 0;
      ail = clamp(-0.05 * st.bank - 0.3 * this.w.dot(this.fw), -1, 1);   // the ailerons keep the wings level
    }
    const sc = s.controls;
    c.de = ele >= 0 ? ele * sc.elevator[0] : ele * sc.elevator[1];   // + = trailing edge up (nose up)
    c.da = ail * sc.aileron + (sc.rig ?? 0);                         // + = right aileron up (roll right); rig: set against the engine torque
    c.dr = rud * sc.rudder;                                          // + = trailing edge right (yaw right)
    c.trimDeg = this.assist ? 0 : c.trim * sc.trim;
  }

  step(dt, world) {
    if (this.crashed) return;
    const s = this.spec, m = this.m, st = this.state, q = this.q, pos = this.pos, c = this.ctl;
    st.time += dt;
    this.updateAxes();
    this.controls(dt);
    const rho = airDensity(pos.y);
    // in the body frame: the air's velocity past the plane and the rotation
    _vb.copy(this.vel).sub(this.wind).applyQuaternionInv(q);
    _wb.copy(this.w).applyQuaternionInv(q);
    const V = _vb.length(), qd = 0.5 * rho * V * V;
    const F = _F.set(0, 0, 0), M = _M.set(0, 0, 0);
    const addB = (f, at) => { F.add(f); _r.copy(at); _c.crossVectors(_r, f); M.add(_c); };
    const ground = this.groundLevel(world, pos.x, pos.z);
    // engine and propeller (first: the slipstream acts on the wing and tail)
    const pr = this.prop, e = this.eng, n = Math.max(this.omega, 1) / (2 * Math.PI), Va = Math.max(0, _vb.z);
    const J = Va / (n * pr.D), x = J / pr.J0;
    let ct = x <= 1 ? pr.ct0 * (1 - x * x) : -0.12 * (x - 1), cp = x <= 1 ? pr.cp0 * (1 - 0.25 * x * x - 0.6 * x ** 6) : pr.cp0 * 0.15 - 0.09 * (x - 1);
    ct = Math.max(ct, -0.1); cp = Math.max(cp, -0.06);
    const T = ct * rho * n * n * pr.D ** 4, Qp = cp * rho * n * n * pr.D ** 5 / (2 * Math.PI);
    const thr = clamp(this.input.throttle, 0, 1), sigma = clamp((rho / RHO0 - 0.12) / 0.88, 0, 1);
    const Qe = e.Q * (0.1 + 0.9 * thr) * sigma - (8 + 0.03 * this.omega) - (1 - thr) * 0.06 * e.Q * (this.omega / e.rated) ** 2;
    this.omega = Math.max(0, this.omega + (Qe - Qp) * dt / e.I);
    if (this.omega < 1) this.omega = 0;
    this.propAngle = (this.propAngle + this.omega * dt) % (2 * Math.PI);    // for the renderer
    _d.set(0, 0, T); addB(_d, pr.pos);
    _d.set(0, 0, -Math.max(0, Qe)); M.add(_d);                             // the engine's torque turns the plane the other way
    // the slipstream: the air the propeller pushes back (momentum theory), fully grown at the tail
    const wi = T > 0 ? 0.5 * (-Va + Math.sqrt(Va * Va + 2 * T / (rho * pr.A))) : 0, qs = 0.5 * rho * (Va + 2 * wi) ** 2;
    // P-factor: at a high angle of attack the down-going blade bites more: yaw to the left
    const aoaB = Math.atan2(-_vb.y, Math.max(1, _vb.z));
    _d.set(0, T * 0.18 * Math.sin(clamp(aoaB, -0.5, 0.5)), 0); M.add(_d);
    // the wing, strip by strip
    const flapI = this.flapIndex(c.flap), fl = s.wing.flaps, wg = s.wing;
    let Lw = 0, sepMax = 0, margin = -1;
    const dg = this.drag || (this.drag = {}), vh = V > 1 ? _s.copy(_vb).multiplyScalar(1 / V) : _s.set(0, 0, 1);
    dg.wing = 0; dg.htail = 0; dg.vtail = 0; dg.body = 0;
    for (const t of this.strips) {
      _v.crossVectors(_wb, t.pos).add(_vb);
      if (t.inSlip && T > 0) _v.z += wi * 0.6;
      _u.copy(_v).addScaledVector(t.sp, -_v.dot(t.sp));                    // the airflow in the strip's plane
      const vp = _u.length(); if (vp < 0.5) continue;
      const alpha = Math.atan2(-_u.dot(t.nrm), _u.dot(t.ch));
      // flaps and ailerons move the zero-lift angle and the maximum lift
      let da0 = 0, dcl = 0, dcd = 0, dcm = 0;
      if (t.flap) { da0 += this.lerpStage(fl.da0, flapI) * D2R; dcl += this.lerpStage(fl.dcl, flapI); dcd += this.lerpStage(fl.dcd, flapI); dcm += this.lerpStage(fl.dcm, flapI); }
      if (t.ail) { const d = t.side * c.da * D2R; da0 -= (wg.ailTau ?? 0.45) * d; dcl += 0.35 * (wg.ailTau ?? 0.45) * this.aW * d; dcd += 0.01 * Math.abs(d); }   // d: trailing edge down
      const a0 = (wg.a0 ?? -2.5) * D2R + da0, xr = alpha - a0;
      // ground effect: less induced drag and a little more lift close to the ground
      const h = Math.max(0.1, pos.y + t.pos.y * this.up.y - ground), hb = 16 * h / this.span, phi = hb * hb / (1 + hb * hb);
      const aE = this.aW * (1 + 0.08 * (1 - phi)), cmx = (wg.clmax ?? 1.5) + dcl;
      liftCurve(aE, xr, cmx, (wg.clmin ?? -1.0) + dcl * 0.3, _lc);
      if (t.eta < 0.75) margin = Math.max(margin, xr - (cmx / aE + ROUND));     // how far this strip is from its stall (rad)
      const cl = _lc[0], sep = _lc[1];
      const cdi = (1 - sep) * cl * cl / (Math.PI * (wg.e ?? 0.75) * this.AR) * phi, cdp = (wg.cd0 ?? 0.008) + 0.006 * cl * cl + dcd + sep * 1.2 * Math.sin(xr) ** 2;
      const cm = ((wg.cm0 ?? -0.05) + dcm) * (1 - sep) - 0.22 * sep * Math.abs(Math.sin(xr)) * Math.sign(xr);
      const qq = 0.5 * rho * vp * vp * t.A;
      _u.multiplyScalar(1 / vp);
      _n.crossVectors(_u, t.sp); if (_n.dot(t.nrm) < 0) _n.multiplyScalar(-1); _n.normalize();
      _d.copy(_n).multiplyScalar(qq * cl).addScaledVector(_u, -qq * (cdi + cdp));
      addB(_d, t.pos); dg.wing -= _d.dot(vh);
      _d.set(-qq * t.c * cm, 0, 0); M.add(_d);                             // nose-up moment is about −x
      Lw += cl * qq; t.cl = cl; t.alpha = alpha; t.sep = sep;
      sepMax = Math.max(sepMax, sep);
    }
    // downwash at the tail: 2 CL / (π AR) of the wing, a moment late, less in ground effect
    const CLw = qd > 1 ? Lw / (qd * wg.S) : 0, ht = s.htail;
    const hT = Math.max(0.1, pos.y - ground + wg.y), hbT = 16 * hT / this.span, phiT = hbT * hbT / (1 + hbT * hbT);
    const epsW = 2 * CLw / (Math.PI * this.AR) * (ht.downwash ?? 1) * phiT;
    this.epsF += (epsW - this.epsF) * (1 - Math.exp(-dt * Math.max(V, 5) / Math.abs(ht.z - wg.z)));
    // the tail surfaces
    for (const t of this.tails) {
      _v.crossVectors(_wb, t.pos).add(_vb);
      _u.copy(_v).addScaledVector(t.sp, -_v.dot(t.sp));
      const vp = _u.length(); if (vp < 0.5) continue;
      let alpha = Math.atan2(-_u.dot(t.nrm), _u.dot(t.ch)), qq = 0.5 * rho * vp * vp, a, clmax;
      if (t.kind === 'h') {
        alpha += -this.epsF - (s.controls.tau ?? 0.5) * (c.de + c.trimDeg) * D2R;
        qq += (s.htail.slip ?? 0.3) * Math.max(0, qs - qq); a = this.aH; clmax = 1.1;
      } else {
        // rudder; the slipstream's swirl hits the fin from the left (a clockwise propeller seen from behind): yaw to the left
        const swirl = T > 0 ? 0.25 * wi / (Va + wi + 1) : 0;
        alpha += (s.controls.tau ?? 0.5) * c.dr * D2R - swirl * (s.vtail.swirl ?? 1) + (s.vtail.offset ?? 0) * D2R;   // offset: the fin is set to cancel the swirl in cruise
        qq += (s.vtail.slip ?? 0.35) * Math.max(0, qs - qq); a = this.aV; clmax = 1.2;
      }
      liftCurve(a, alpha, clmax, -clmax, _lc);
      const cl = _lc[0], AR = t.kind === 'h' ? this.spec.htail.span ** 2 / this.spec.htail.S : 2 * this.spec.vtail.h ** 2 / this.spec.vtail.S;
      const cd = 0.01 + cl * cl / (Math.PI * 0.8 * AR) + _lc[1] * 1.1 * Math.sin(alpha) ** 2;
      _u.multiplyScalar(1 / vp);
      _n.crossVectors(_u, t.sp); if (_n.dot(t.nrm) < 0) _n.multiplyScalar(-1); _n.normalize();
      _d.copy(_n).multiplyScalar(qq * t.A * cl).addScaledVector(_u, -qq * t.A * cd);
      addB(_d, t.pos); dg[t.kind === 'h' ? 'htail' : 'vtail'] -= _d.dot(vh);
    }
    // the fuselage, gear legs and struts: drag, side force, and its unstable moments (Munk)
    if (V > 0.5) {
      const fu = s.fuselage;
      _d.copy(_vb).multiplyScalar(-0.5 * rho * V * fu.CdA); addB(_d, _a.set(0, fu.dragY ?? 0, 0)); dg.body -= _d.dot(vh);
      const beta = Math.atan2(_vb.x, Math.max(1, Math.hypot(_vb.y, _vb.z)));
      _d.set(-qd * fu.side * Math.sin(beta), 0, 0); addB(_d, _a.set(0, 0, fu.sideZ ?? 0.6));
      _d.set(-qd * wg.S * this.chord * (fu.cma ?? 0.1) * clamp(aoaB, -0.6, 0.6), 0, 0); M.add(_d);
    }
    // gyroscopic precession of the propeller and the rotating plane: I ω̇ = M − ω × (I ω + H)
    const H = _s.set(0, 0, e.Ip * this.omega);
    _a.set(this.I.x * _wb.x, this.I.y * _wb.y, this.I.z * _wb.z).add(H);
    _c.crossVectors(_wb, _a); M.sub(_c);
    // to the world, with gravity
    const Fw = _Fw.copy(F).applyQuaternion(q); Fw.y -= m * G;
    // landing gear and everything else that touches the ground
    this.gearStep(dt, world, Fw, M);
    if (this.crashed) return;
    // integrate
    this.vel.addScaledVector(Fw, dt / m);
    _a.set(M.x / this.I.x, M.y / this.I.y, M.z / this.I.z);
    _wb.addScaledVector(_a, dt);
    this.w.copy(_wb).applyQuaternion(q);
    pos.addScaledVector(this.vel, dt);
    q.integrate(this.w, dt);
    this.updateAxes();
    // what the pilot sees
    st.tas = V; st.kt = V / KT; st.ias = V * Math.sqrt(rho / RHO0); st.kias = st.ias / KT;
    st.alt = pos.y; st.agl = pos.y - ground; st.vs = this.vel.y; st.fpm = this.vel.y * 196.85;
    st.heading = ((Math.atan2(this.fw.x, -this.fw.z) / D2R) + 360) % 360;
    st.pitch = Math.asin(clamp(this.fw.y, -1, 1)) / D2R; st.bank = Math.asin(clamp(this.lf.y, -1, 1)) / D2R;
    if (this.up.y < 0) st.bank = (st.bank >= 0 ? 180 : -180) - st.bank;
    st.aoa = aoaB / D2R; st.beta = V > 1 ? Math.asin(clamp(-_vb.x / V, -1, 1)) / D2R : 0;
    // the stall warning sounds some 5–10 kt above the stall (the inner wing within ~4° of its stall angle)
    st.stallMargin = margin / D2R; st.stalled = sepMax > 0.3; st.stallWarn = V > 8 && !st.onGround && (margin > -4 * D2R || st.stalled);
    st.g = (F.y + this.gearFy) / (m * G);                          // load factor along the plane's own up axis (1 in level flight)
    st.rpm = this.omega * RPM; st.overRev = this.omega > e.red * 1.02; st.thrust = T; st.flaps = c.flap; st.cl = CLw;
    // structural limits: past the limit load or Vne a warning; past the ultimate load (1.5 ×) or 1.25 Vne it breaks
    const gl = s.limits.g || [3.8, -1.5], vne = s.limits.vne ?? 160;
    st.overG = st.g > gl[0] || st.g < gl[1]; st.overspeed = st.kias > vne;
    if (st.kias > vne * 1.25) this.doCrash('overspeed: the structure failed', 0);
    if (st.g > gl[0] * 1.5 || st.g < gl[1] * 1.5) this.doCrash('over-g: the structure failed', 0);
    this.collide(world);
    if (!isFinite(pos.x) || !isFinite(q.w) || !isFinite(this.w.x)) this.doCrash('numerical failure', 0);
  }

  flapIndex(deg) { const d = this.flapDeg; for (let i = 1; i < d.length; i++) if (deg <= d[i]) return i - 1 + (deg - d[i - 1]) / (d[i] - d[i - 1]); return d.length - 1; }
  lerpStage(tab, f) { const i = Math.min(Math.floor(f), tab.length - 2), u = f - i; return tab[i] + (tab[i + 1] - tab[i]) * u; }
  groundLevel(world, x, z) { const h = world.height(x, z), wl = world.water(x, z); return Math.max(h, isFinite(wl) ? wl : -1e9); }

  doCrash(reason, speed) {
    if (this.crashed) return;
    this.crashed = true; this.crashReason = reason;
    this.crash = { reason, speed, x: this.pos.x, y: this.pos.y, z: this.pos.z, vs: this.vel.y, time: this.state.time };
    this.state.crashed = true; this.state.crashReason = reason;
    this.vel.set(0, 0, 0); this.w.set(0, 0, 0);
  }

  // the wheels on the ground, and the check that nothing else touches it. Fw (world) and M (body) get the forces.
  gearStep(dt, world, Fw, M) {
    const st = this.state, q = this.q, pos = this.pos, up = this.up, I = this.input, c = this.ctl;
    let any = false; this.gearFy = 0;
    const steerA = clamp(c.dr / this.spec.controls.rudder, -1, 1);
    for (const g of this.gear) {
      _P.copy(g.at).applyQuaternion(q).add(pos);                         // the wheel's bottom at full extension
      const wl = world.water(_P.x, _P.z), hgt = world.height(_P.x, _P.z);
      if (isFinite(wl) && wl > hgt && _P.y < wl) { this.doCrash('landed on the water', this.vel.length()); return; }
      const x = (hgt - _P.y) / Math.max(0.3, up.y);
      if (x <= 0) { g.contact = false; g.had = false; g.x = 0; g.Fz = 0; continue; }
      any = true;
      const vx = g.had ? (x - g.xPrev) / dt : 0; g.xPrev = x;
      if (!g.had) { g.vsink = Math.max(0, -this.vel.y); g.had = true;
        if (g.vsink > (this.spec.limits.sink ?? 3.5)) { this.doCrash(`${g.name} collapsed: touched down at ${g.vsink.toFixed(1)} m/s`, g.vsink); return; } }
      g.contact = true; g.x = x;
      let Fs = g.k * Math.min(x, g.travel) + g.c * clamp(vx, -5, 5);
      if (x > g.travel) {
        Fs += g.k * 20 * (x - g.travel) + g.c * 3 * Math.max(0, vx);
        if (x > g.travel + 0.12) { this.doCrash(`${g.name} collapsed`, this.vel.length()); return; }
      }
      Fs = Math.max(0, Fs);
      world.normal(_P.x, _P.z, g.N);
      _d.copy(up).multiplyScalar(Fs);
      // tyre: the wheel's rolling direction in the ground plane (the nose wheel steers with the rudder)
      const sa = g.steer * steerA;
      _a.copy(this.fw).multiplyScalar(Math.cos(sa)).addScaledVector(this.lf, -Math.sin(sa));
      _a.addScaledVector(g.N, -_a.dot(g.N)).normalize();
      _b.crossVectors(g.N, _a);                                           // left in the ground plane
      _r.subVectors(_P, pos); _v.crossVectors(this.w, _r).add(this.vel);
      const vl = _v.dot(_a), vs = _v.dot(_b), Nf = Fs * Math.max(0.2, g.N.dot(up));
      const surf = world.surface(_P.x, _P.z), sp = SURF_PROPS[surf] || SURF_PROPS[0], mu = sp[0] * 0.8 * (1 - 0.3 * (world.wet || 0));
      const mShare = Math.max(g.mc * 0.3, Nf / G);
      // side grip: slip angle × cornering stiffness, but never more than stops the sideways slide within the step
      const Fy = -Math.sign(vs) * Math.min(6 * Nf * Math.abs(vs) / Math.max(Math.abs(vl), 1.5), mShare * Math.abs(vs) / dt * 0.5, mu * Nf);
      // rolling resistance and brakes (the brakes on the mains, differential if asked)
      const br = g.brake ? clamp(g.at.x > 0 ? (I.brakeL ?? I.brake) : g.at.x < 0 ? (I.brakeR ?? I.brake) : I.brake, 0, 1) : 0;
      const rr = (sp[1] * 1.6 + sp[2] * 2) * Nf, fb = br * mu * 0.85 * Nf;
      const Fx = -Math.sign(vl) * Math.min(rr + fb, mShare * Math.abs(vl) / dt * 0.5);
      _d.addScaledVector(_a, Fx).addScaledVector(_b, Fy);
      Fw.add(_d); _c.crossVectors(_r, _d).applyQuaternionInv(q); M.add(_c);
      this.gearFy += _d.dot(up);
      g.Fz = Nf; g.P.copy(_P); g.surf = surf; g.spin += vl / g.r * dt;
    }
    st.onGround = any;
    // nothing else may touch the ground (or the water)
    st.tailStrike = false;
    for (const h of this.hard) {
      _P.copy(h.at).applyQuaternion(q).add(pos);
      const gl = this.groundLevel(world, _P.x, _P.z);
      if (_P.y > gl) continue;
      const wl = world.water(_P.x, _P.z);
      if (isFinite(wl) && wl >= world.height(_P.x, _P.z)) { this.doCrash('hit the water', this.vel.length()); return; }
      if (h.skid && -this.vel.y < 1.5 && this.vel.length() < 40) {
        // a tail skid scraping: push it up, no crash
        st.tailStrike = true;
        _r.subVectors(_P, pos); _v.crossVectors(this.w, _r).add(this.vel);
        const pen = gl - _P.y, Fn = Math.max(0, this.m * 80 * pen - this.m * 8 * Math.min(0, _v.y));
        const vt = Math.hypot(_v.x, _v.z), ft = vt > 1e-3 ? Math.min(0.4 * Fn, this.m * 0.3 * vt / dt) / vt : 0;   // it scrapes: Coulomb friction
        _d.set(-_v.x * ft, Fn, -_v.z * ft); Fw.add(_d); _c.crossVectors(_r, _d).applyQuaternionInv(q); M.add(_c);
        continue;
      }
      this.doCrash(`${h.name} hit the ground`, this.vel.length()); return;
    }
  }

  // trees, houses, masts in world.colliders: any contact is a crash
  collide(world) {
    const pos = this.pos, list = world.colliders(pos.x, pos.z, this.span / 2 + 2);
    if (!list || !list.length) return;
    const pts = [[0, 0, 0], [this.span / 2, this.spec.wing.y, this.spec.wing.z], [-this.span / 2, this.spec.wing.y, this.spec.wing.z], [0, 0, this.prop.pos.z], [0, this.spec.vtail.y, this.spec.vtail.z]];
    for (const p of pts) {
      _P.set(p[0], p[1], p[2]).applyQuaternion(this.q).add(pos);
      for (const c of list) {
        if (c.y1 != null && _P.y > c.y1) continue;
        if (c.y0 != null && _P.y < c.y0) continue;
        let hit = false;
        if (c.r != null) hit = Math.hypot(_P.x - c.x, _P.z - c.z) < c.r + 0.3;
        else { const dx = _P.x - c.x, dz = _P.z - c.z, cs = Math.cos(c.ang || 0), sn = Math.sin(c.ang || 0); hit = Math.abs(dx * cs - dz * sn) < c.hw && Math.abs(dx * sn + dz * cs) < c.hd; }
        if (hit) { this.doCrash(`hit ${c.kind || 'an obstacle'}`, this.vel.length()); return; }
      }
    }
  }
}
