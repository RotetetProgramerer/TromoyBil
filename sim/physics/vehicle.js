// The car: a rigid body on four wheels, in SI units (m, kg, s, N). No DOM and no three.js, so it runs in Node (tools/test-vehicle.mjs).
//
//   body       rigid body with real mass and inertia; +z forward, +y up, +x left in its own frame
//   suspension spring + damper per wheel (bump and rebound), anti-roll bars, bump stops
//   tyres      combined-slip magic formula with load sensitivity and relaxation lengths (stable at standstill)
//   drivetrain engine torque curve, turbo, automatic clutch, gearbox (auto or manual), low range, open/locked/limited-slip diffs
//   brakes     front/rear brake torque, handbrake, ABS; traction control and stability control (ESP) as driving aids
//   aero       drag and downforce; water: buoyancy, drag and a flooded engine; the body hits the ground and things in the world
//
// The world the car drives in is any object with
//   height(x,z) → y          normal(x,z,out) → unit normal          surface(x,z) → SURF id
//   water(x,z) → water level (or -Infinity)                       colliders(x,z,r) → [{x,z,r} | {x,z,hw,hd,ang}] with optional y0,y1
//   wet (0–1)                                                      (see sim/world/*.js)
import { V3, Quat, clamp, curve, smoothstep, RPM } from './math.js';
import { SURF_PROPS, TYRES, surfGrip, tyreForce } from './surfaces.js';

const G = 9.81, RHO = 1.225;
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _n = new V3(), _r = new V3(), _f = new V3(), _t = new V3(),
  _M = new V3(), _P = new V3(), _tl = new V3(), _ts = new V3(), _vp = new V3(), _wf = new V3(), _fx = [0, 0], _q = new Quat();

export class Vehicle {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.tune(opts.parts || {}, opts.tyre);
    this.pos = new V3(); this.vel = new V3(); this.q = new Quat(); this.w = new V3();
    this.fw = new V3(0, 0, 1); this.up = new V3(0, 1, 0); this.lf = new V3(1, 0, 0);
    this.input = { gas: 0, brake: 0, steer: 0, handbrake: 0, shiftUp: 0, shiftDown: 0 };
    this.aids = { abs: true, tcs: true, esp: true, steer: true, auto: true };
    this.rope = null;            // winch: {x,y,z,F}
    this.reset(0, 0, 0, 0);
  }

  // apply garage parts and tyres; derive springs, inertia and the drivetrain from the spec
  tune(parts = {}, tyre) {
    const s = this.spec, p = this.parts = Object.assign({ tyres: 0, susp: 0, motor: 0, weight: 0, gear: 0 }, parts);
    this.tyre = tyre || s.tyre || 'sommer';
    const m = this.m = s.mass * (1 + [0, 0.004, 0.008, 0.012][p.weight || 0]);
    const lift = [0, 0.03, 0.06, 0.10][p.susp || 0] * (s.lift ?? 1);     // the garage lifts the car (offroad cars)
    this.cgH = s.cgH + lift * 0.8 - [0, 0.004, 0.008, 0.012][p.weight || 0];
    this.wd = s.wd ?? 0.55;
    const a = s.wb * (1 - this.wd), b = s.wb * this.wd;      // CoM → front axle, CoM → rear axle
    this.a = a; this.b = b;
    const L = s.dims.L, W = s.dims.W, H = s.dims.H;
    this.I = new V3(m / 12 * (H * H + L * L) * 0.75, m / 12 * (W * W + L * L) * 0.82, m / 12 * (W * W + H * H) * 0.8);
    this.wheels = [];
    const su = s.susp, tr = 1 + [0, 0.12, 0.25, 0.35][p.susp || 0] * (s.lift ?? 1) * 0.6;
    for (const front of [true, false]) for (const left of [true, false]) {
      const r = front ? s.wheel.rF : s.wheel.rR, track = front ? s.trackF : s.trackR, Fz0 = m * G * (front ? this.wd : 1 - this.wd) / 2;
      const f = su.freq[front ? 0 : 1] * [1, 0.95, 0.92, 1.0][p.susp || 0], mc = Fz0 / G * 0.9, k = mc * (2 * Math.PI * f) ** 2;
      const cc = 2 * Math.sqrt(k * mc), damp = [1, 1.05, 1.1, 1.2][p.susp || 0];
      const T = su.travel[front ? 0 : 1] * tr, xs = Math.min(Fz0 * 0.9 / k, T * 0.45), pre = Math.max(0, Fz0 * 0.9 - k * xs);   // springs are preloaded: the car sits at 45 % of its travel
      const mw = (front ? s.wheel.mF : s.wheel.mR) ?? 22;
      this.wheels.push({
        front, left, r, w: front ? s.wheel.wF : s.wheel.wR, Fz0, k, pre, cb: cc * su.zeta[0] * damp, cr: cc * su.zeta[1] * damp, T, xs,
        arb: su.arb[front ? 0 : 1] * (1 + 0.15 * (p.susp || 0)),
        mount: new V3((left ? 1 : -1) * track / 2, -(this.cgH - r - lift * 0.2) - xs, front ? a : -b),   // wheel centre at full droop (x = 0)
        I: s.wheel.I ?? 0.75 * mw * r * r + 0.25, m: mw,
        x: 0, xPrev: 0, had: false, contact: false, Fz: 0, omega: 0, spin: 0, kappa: 0, tanA: 0, steer: 0, slip: 0, slipV: 0,
        surf: 0, wd: -1, absK: 1, mu: 1, Tdrive: 0, Tbrake: 0, center: new V3(), P: new V3(), N: new V3(0, 1, 0), vLong: 0, vLat: 0, Fx: 0, Fy: 0,
      });
    }
    // drivetrain
    const e = s.engine, mo = [1, 1.08, 1.17, 1.28][p.motor || 0];
    this.eng = { idle: e.idle / RPM, red: e.redline / RPM, lim: (e.limiter ?? e.redline + 200) / RPM, curve: e.torque.map(([r, t]) => [r / RPM, t * mo]),
      I: e.inertia ?? 0.2, turbo: e.turbo || 0, launch: (e.launch ?? e.idle + 1200) / RPM, peak: Math.max(...e.torque.map(q => q[1])) * mo };
    const tp = this.eng.peak;
    this.eng.f1 = (0.16 - 0.05) * tp / (this.eng.red - this.eng.idle); this.eng.f0 = 0.05 * tp - this.eng.f1 * this.eng.idle;
    const gb = s.gearbox;
    this.gb = { ratios: gb.ratios, rev: gb.reverse, final: gb.final, shiftT: gb.shift ?? 0.25, eff: gb.eff ?? 0.92, low: s.drive.low || 0 };
    const d = s.drive;
    this.drive = { split: d.layout === 'RWD' ? 0 : d.layout === 'FWD' ? 1 : (d.split ?? 0.5), center: d.center || 'open', front: d.front || 'open', rear: d.rear || 'open',
      lsd: d.lsd ?? 0.25, lockLow: !!d.lockLow || (p.gear >= 2) };
    this.brakeT = [s.brakes.front, s.brakes.rear, s.brakes.hand ?? s.brakes.rear * 1.4];
    this.wade = (s.wade ?? 0.5) + ((p.gear >= 1 || s.snorkel) ? (s.snorkelUp ?? 0.35) : 0);
    // the hull: points the ground pushes on when the car bottoms out or rolls over (relative to the CoM)
    const cl = s.clear + lift - this.cgH, top = H - this.cgH, zc = (a - b) / 2 + ((s.overF ?? (L - s.wb) / 2) - (s.overR ?? (L - s.wb) / 2)) / 2;
    const hl = L / 2, hw = W / 2 * 0.95;
    this.hull = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      this.hull.push(new V3(sx * hw, cl + 0.12, zc + sz * hl), new V3(sx * hw * 0.92, top, zc + sz * hl * 0.8), new V3(sx * hw * 0.8, cl, zc + sz * hl * 0.55),
        new V3(sx * hw, top * 0.55, zc + sz * hl * 0.9), new V3(sx * hw, top * 0.9, zc));
    }
    this.hull.push(new V3(0, cl, 0), new V3(0, cl, a * 0.6), new V3(0, cl, -b * 0.6), new V3(0, top, zc));
    this.box = { hl, hw: W / 2, zc, y0: cl, y1: top };          // for collisions with things in the world
    this.drag = s.aero.CdA * (1 + 0.04 * (p.susp || 0) * (s.lift ?? 1)); this.down = [s.aero.ClF || 0, s.aero.ClR || 0];
    this.steerMax = s.steer ?? 0.6;
    if (this.state) this.state.gear = Math.min(this.state.gear, this.gb.ratios.length);
  }

  reset(x, y, z, heading) {
    this.q.setFromAxisAngle(_a.set(0, 1, 0), heading);
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.w.set(0, 0, 0);
    for (const wh of this.wheels) { wh.omega = 0; wh.kappa = 0; wh.tanA = 0; wh.had = false; wh.x = 0; wh.xPrev = 0; wh.absK = 1; }
    this.state = Object.assign(this.state || {}, { gear: 1, shift: 0, shiftTo: 0, lastShift: 0, rpm: this.eng.idle, omegaE: this.eng.idle, boost: 0,
      clutch: 0, low: this.state ? this.state.low : false, tcs: 1, tcsOn: false, absOn: false, espOn: false, revHold: 0, fwdHold: 0, time: 0,
      hold: true, throttle: 0, brake: 0, flooded: false, depth: -1, airT: 0, speed: 0, steer: 0 });
    this.updateAxes();
  }

  // put the car on the ground at (x,z), lined up with the slope; the springs settle within a few steps
  place(world, x, z, heading) {
    const n = world.normal(x, z, new V3()), c = Math.cos(heading), s = Math.sin(heading);
    let top = -1e9;
    for (const dx of [-1, 0, 1]) for (const dz of [-1.5, 0, 1.5]) top = Math.max(top, world.height(x + dx * c + dz * s, z - dx * s + dz * c));
    this.reset(x, top + this.cgH + 0.05, z, heading);
    // tilt from straight up to the ground normal
    const ax = new V3().crossVectors(new V3(0, 1, 0), n), l = ax.length();
    if (l > 1e-4) { const qt = new Quat().setFromAxisAngle(ax.multiplyScalar(1 / l), Math.asin(Math.min(1, l))); this.q.premultiply(qt).normalize(); }
    this.updateAxes();
  }

  updateAxes() { this.fw.set(0, 0, 1).applyQuaternion(this.q); this.up.set(0, 1, 0).applyQuaternion(this.q); this.lf.set(1, 0, 0).applyQuaternion(this.q); }

  get speed() { return this.vel.dot(this.fw); }
  get kmh() { return Math.abs(this.speed) * 3.6; }
  get rpm() { return this.state.omegaE * RPM; }
  get gearName() { const g = this.state.gear; return g < 0 ? 'R' : g === 0 ? 'N' : String(g); }
  totalRatio(g = this.state.gear) {
    const gb = this.gb, r = g < 0 ? -gb.rev : g === 0 ? 0 : gb.ratios[g - 1];
    return r * gb.final * (this.state.low && gb.low ? gb.low : 1);
  }

  // turn gas/brake/steer into throttle, brakes and gear (an automatic: hold brake at standstill for reverse)
  controls(dt) {
    const I = this.input, st = this.state, v = this.speed, auto = this.aids.auto;
    st.time += dt;
    let thr = 0, brk = 0;
    if (auto) {
      if (st.gear >= 0) {
        thr = I.gas; brk = I.brake;
        if (Math.abs(v) < 0.8 && I.brake > 0.1 && I.gas < 0.05) { st.revHold += dt; if (st.revHold > 0.35) { st.gear = -1; st.revHold = 0; } } else st.revHold = 0;
        if (st.gear === 0) st.gear = 1;
      } else {
        thr = I.brake; brk = I.gas;
        if (Math.abs(v) < 0.8 && I.gas > 0.1 && I.brake < 0.05) { st.fwdHold += dt; if (st.fwdHold > 0.2) { st.gear = 1; st.fwdHold = 0; } } else st.fwdHold = 0;
      }
      this.autoShift(dt, thr);
    } else {
      thr = I.gas; brk = I.brake;
      if (I.shiftUp && !this._su) this.shiftTo(st.gear + 1);
      if (I.shiftDown && !this._sd) this.shiftTo(st.gear - 1);
      this._su = I.shiftUp; this._sd = I.shiftDown;
    }
    // auto hold: once the car has stopped with no gas and no brake, the brakes hold it until you press the gas, so it never creeps on a slope
    if (thr > 0.05 || brk > 0.05) st.hold = false;
    else if (Math.abs(v) < 0.3 && this.wheels.some(w => w.contact)) st.hold = true;
    if (st.hold && !I.handbrake) brk = Math.max(brk, 0.8);
    st.throttle = thr; st.brake = brk;
  }

  shiftTo(g) {
    const st = this.state, n = this.gb.ratios.length; g = clamp(g, -1, n);
    if (g === st.gear || st.shift > 0) return;
    if (g < 0 && this.speed > 1.5) return;              // no reverse while rolling forward
    if (g > 0 && st.gear < 0 && this.speed < -1.5) return;
    st.shiftTo = g; st.shift = this.gb.shiftT; st.lastShift = st.time;
  }

  autoShift(dt, thr) {
    const st = this.state, n = this.gb.ratios.length, e = this.eng;
    if (st.gear <= 0 || st.shift > 0 || st.time - st.lastShift < 0.7) return;
    const drv = this.wheels.filter(w => w.contact).length >= 2;
    const inRpm = g => Math.abs(this.shaftOmega() * this.totalRatio(g));
    const up = e.idle + (e.red * 0.97 - e.idle) * clamp(0.35 + thr * 0.75, 0.35, 1), down = e.idle * 1.25 + (e.red * 0.5 - e.idle * 1.25) * thr;
    const now = inRpm(st.gear);
    if (st.gear < n && drv && (st.locked || st.launched) && now > up && inRpm(st.gear + 1) > e.idle * 1.15) this.shiftTo(st.gear + 1);
    else if (st.gear > 1 && now < down && inRpm(st.gear - 1) < e.red * 0.92) this.shiftTo(st.gear - 1);
  }

  // torque share of each wheel. Each axle has its own final drive so that both axles turn at the same road speed
  // even when the tyres differ in size (the Porsche): the share is the split times rWheel / rRear.
  shares() {
    const d = this.drive, W = this.wheels, rR = W[2].r;
    let sf = d.split;
    if (this.state.low && d.split === 0 && this.spec.drive.parttime) sf = 0.5;   // low range engages the front axle on a part-time 4x4
    const gF = W[0].r / rR;
    return [sf / 2 * gF, sf / 2 * gF, (1 - sf) / 2, (1 - sf) / 2];
  }
  shaftOmega() { const s = this.shares(); let o = 0; for (let i = 0; i < 4; i++) o += s[i] * this.wheels[i].omega; return o; }

  // the engine, the clutch and the gearbox. The clutch has two states: slipping (it passes at most its capacity) and locked
  // (engine and driven wheels turn together, so the engine's inertia is added to the wheels and the engine speed follows them).
  drivetrain(dt) {
    const st = this.state, e = this.eng, W = this.wheels, sh = this.shares(), d = this.drive, eff = this.gb.eff;
    // gear change in progress: clutch out, throttle cut, then the new gear
    if (st.shift > 0) { st.shift -= dt; st.locked = false; if (st.shift <= 0) { st.gear = st.shiftTo; st.shift = 0; } }
    const R = st.shift > 0 ? 0 : this.totalRatio(), wIn = R !== 0 ? this.shaftOmega() * R : 0;
    const stall = e.idle * 1.05 + (e.launch - e.idle) * Math.sqrt(st.throttle) * (st.low ? 0.45 : 1);
    // launch: the clutch slips and lets the engine rev towards the stall speed until the shaft catches up; after that it stays in
    // (also through gear changes) until the car is nearly stopped
    if (R === 0 || Math.abs(wIn) < e.idle * 1.1) st.launched = false;
    const engage = R === 0 ? 0 : st.launched || Math.abs(wIn) > Math.max(e.idle * 1.05, stall * 0.9) ? 1 : smoothstep(Math.max(e.idle * 0.98, stall * 0.72), stall, st.omegaE);
    st.clutch = engage;
    if (st.locked && (R === 0 || engage < 0.98 || wIn < e.idle * 0.9)) st.locked = false;
    if (!st.locked && R !== 0 && engage >= 0.999 && Math.abs(st.omegaE - wIn) < 2 + 0.02 * st.omegaE && wIn > e.idle * 0.95) st.locked = true;
    if (st.locked) { st.omegaE = wIn; st.launched = true; }
    const rpm = st.omegaE;
    // throttle: driver, traction control, gear change, idle governor, rev limiter
    let th = st.throttle * st.tcs;
    // traction control (feed-forward): the engine may not give more torque than the tyres can put down
    let tcLim = 1e9;
    if (this.aids.tcs && R !== 0 && st.throttle > 0.02) {
      // what each axle can take: both wheels' grip with a locked diff, twice the weaker wheel with an open one;
      // then the two axles, through the centre diff (locked: both together; open: the split decides)
      const Tw = i => (W[i].contact ? W[i].mu * W[i].Fz * W[i].r : 0) + 30, ll = st.low && d.lockLow;
      const ax = (i, kind) => (kind === 'open' && !ll) ? 2 * Math.min(Tw(i), Tw(i + 1)) : kind === 'locked' || ll ? Tw(i) + Tw(i + 1) : Math.min(Tw(i) + Tw(i + 1), 2.6 * Math.min(Tw(i), Tw(i + 1)));
      const sF = sh[0] + sh[1], sR = sh[2] + sh[3], aF = sF > 0 ? ax(0, d.front) : 0, aR = sR > 0 ? ax(2, d.rear) : 0;
      const cKind = st.low && this.gb.low ? 'locked' : d.center;
      let wheelLim;
      if (sF <= 0) wheelLim = aR / sR; else if (sR <= 0) wheelLim = aF / sF;
      else { const open = Math.min(aF / sF, aR / sR); wheelLim = cKind === 'locked' ? aF + aR : cKind === 'open' ? open : Math.max(open, (cKind === 'viscous' ? 0.95 : 0.85) * (aF + aR)); }
      const X = wheelLim * 0.96 / (Math.abs(R) * eff), fr = e.f0 + e.f1 * rpm;
      const Tm = curve(e.curve, rpm) * (e.turbo ? (1 - e.turbo) + e.turbo * st.boost : 1);
      // with the clutch locked the engine itself is held back; while it slips the clutch passes no more than the tyres can take
      if (st.locked) { if (Tm > 1) th = Math.min(th, Math.max(0.08, (X + fr) / (Tm + 0.85 * fr))); } else tcLim = Math.max(X, 20);
    }
    if (st.shift > 0) th *= this.gb.shiftT <= 0.15 ? 0.5 : 0.1;      // a dual-clutch box keeps the engine pulling through the shift
    if (rpm < e.idle) th = Math.max(th, clamp((e.idle - rpm) / (e.idle * 0.12), 0, 0.3));
    if (rpm > e.lim) th = 0;
    if (this.spec.vmax) th = Math.min(th, clamp((this.spec.vmax - this.kmh) / 4, 0, 1));   // electronic speed limiter
    st.thr = th;
    // turbo pressure builds with load and revs, and falls away when you lift
    if (e.turbo) { const want = (st.shift > 0 ? st.throttle : th) * smoothstep(e.idle * 1.1, e.idle * 2.6, rpm); st.boost += (want - st.boost) * (1 - Math.exp(-dt / (want > st.boost ? 0.4 : 0.18))); }
    const Tmax = curve(e.curve, rpm) * (e.turbo ? (1 - e.turbo) + e.turbo * st.boost : 1);
    const Teng = th * Tmax - (e.f0 + e.f1 * rpm) * (1 - th * 0.85);
    st.load = Tmax > 0 ? clamp(Teng / Tmax, -1, 1) : 0;
    const lockAll = (st.low && d.lockLow) || d.center === 'locked';
    let Tout = 0;
    if (st.locked) {
      Tout = Teng * R * eff;
      for (let i = 0; i < 4; i++) W[i].Ia = W[i].I + (sh[i] > 0 ? e.I * R * R * sh[i] * (lockAll ? 1 : Math.min(1, sh[i] * 2)) : 0);
    } else {
      let omegaE = st.omegaE + Teng * dt / e.I, Tc = 0;
      if (R !== 0) {
        let invIin = 0; for (let i = 0; i < 4; i++) invIin += sh[i] * sh[i] / W[i].I;
        invIin *= R * R;
        const cap = Math.min(engage * e.peak * 1.9, tcLim);
        Tc = clamp((omegaE - wIn) / (dt * (1 / e.I + invIin)), -cap, cap);
        omegaE -= Tc * dt / e.I;
      }
      st.omegaE = Math.max(omegaE, e.idle * 0.5);
      Tout = Tc * R * eff;
      for (const w of W) w.Ia = w.I;
    }
    for (let i = 0; i < 4; i++) W[i].Tdrive = Tout * sh[i];
    // differentials: open (no coupling), limited slip (coupling up to a share of the input torque) or locked
    const lowLock = st.low && d.lockLow;
    const couple = (i, j, kind, Tin) => {
      if (kind === 'open') return;
      const A = W[i], B = W[j], need = (A.omega - B.omega) / (dt * (1 / A.Ia + 1 / B.Ia));
      const cap = kind === 'locked' ? 1e9 : 150 + d.lsd * Math.abs(Tin) * 2;
      const T = clamp(need, -cap, cap); A.Tdrive -= T; B.Tdrive += T;
    };
    const frontKind = lowLock ? 'locked' : d.front, rearKind = lowLock ? 'locked' : d.rear;
    if (sh[0] > 0) couple(0, 1, frontKind, Tout * (sh[0] + sh[1]));
    if (sh[2] > 0) couple(2, 3, rearKind, Tout * (sh[2] + sh[3]));
    const centre = st.low && this.gb.low ? 'locked' : d.center;
    if (sh[0] > 0 && sh[2] > 0 && centre !== 'open') {
      // compare the road speed of the two axles (omega × r), and push torque from the faster to the slower one
      const gF = W[0].r / W[2].r, oF = (W[0].omega + W[1].omega) / 2 * gF, oR = (W[2].omega + W[3].omega) / 2, IF = W[0].Ia + W[1].Ia, IR = W[2].Ia + W[3].Ia;
      const need = (oF - oR) / (dt * (gF * gF / IF + 1 / IR)), cap = centre === 'locked' ? 1e9 : 200 + Math.abs(Tout) * (centre === 'viscous' ? 1.0 : 0.7);
      const T = clamp(need, -cap, cap); W[0].Tdrive -= T * gF / 2; W[1].Tdrive -= T * gF / 2; W[2].Tdrive += T / 2; W[3].Tdrive += T / 2;
    }
  }

  step(dt, world) {
    const m = this.m, st = this.state, W = this.wheels, q = this.q, I = this.input;
    this.controls(dt);
    this.updateAxes();
    const up = this.up, fw = this.fw, lf = this.lf, pos = this.pos;
    const F = _f.set(0, -m * G, 0), T = _t.set(0, 0, 0);
    const addForce = (f, at) => { F.add(f); _r.subVectors(at, pos); _c.crossVectors(_r, f); T.add(_c); };
    // steering: Ackermann geometry; at speed the aid keeps the front tyres near their grip limit
    const v = this.speed, vabs = Math.abs(v);
    let dmax = this.steerMax;
    if (this.aids.steer && vabs > 3) {
      const mu = 1.0 * surfGrip(W[0].surf, this.tyre, world.wet);
      dmax = Math.min(dmax, Math.atan(this.spec.wb * mu * G * 1.15 / (vabs * vabs)) + 0.035);
    }
    const target = clamp(I.steer, -1, 1) * dmax;
    st.steer += clamp(target - st.steer, -dt * 1.6, dt * 1.6);
    const dl = st.steer, wb = this.spec.wb;
    if (Math.abs(dl) > 1e-4) {
      const Rt = wb / Math.tan(Math.abs(dl)), tf = this.spec.trackF / 2, inner = Math.atan(wb / Math.max(0.5, Rt - tf)), outer = Math.atan(wb / (Rt + tf));
      W[0].steer = Math.sign(dl) * (dl > 0 ? inner : outer); W[1].steer = Math.sign(dl) * (dl > 0 ? outer : inner);
    } else { W[0].steer = 0; W[1].steer = 0; }
    W[2].steer = 0; W[3].steer = 0;

    // 1) suspension: where is the ground under each wheel, and how much is the spring compressed
    const dy = Math.max(0.25, up.y);
    for (const wh of W) {
      _M.copy(wh.mount).applyQuaternion(q).add(pos);
      const cs = Math.cos(wh.steer), sn = Math.sin(wh.steer);
      _wf.copy(fw).multiplyScalar(cs).addScaledVector(lf, sn);
      _a.set(_wf.x, 0, _wf.z); if (_a.lengthSq() < 1e-6) _a.set(up.x, 0, up.z); _a.normalize();
      _b.set(_a.z, 0, -_a.x);                                // ground plane, across the wheel
      const r = wh.r, cx = _M.x + up.x * wh.x, cz = _M.z + up.z * wh.x;
      let best = -1e9, bx = cx, bz = cz;
      for (let si = 0; si < 7; si++) {
        const u = (si - 3) / 3 * 0.75 * r, lat = si === 3 ? 0 : 0, px = cx + _a.x * u + _b.x * lat, pz = cz + _a.z * u + _b.z * lat;
        const need = world.height(px, pz) + Math.sqrt(r * r - u * u);
        if (need > best) { best = need; bx = px; bz = pz; }
      }
      for (const lat of [-0.35, 0.35]) { const px = cx + _b.x * lat * wh.w, pz = cz + _b.z * lat * wh.w, need = world.height(px, pz) + r; if (need > best) { best = need; bx = px; bz = pz; } }
      const surf = world.surface(bx, bz), sp = SURF_PROPS[surf] || SURF_PROPS[0];
      wh.surf = surf;
      // soft ground: the tyre sinks in slowly under load (a smoothed state, so it never feeds back into the spring within a step)
      wh.sink = (wh.sink || 0) + (sp[3] * smoothstep(0, wh.Fz0, wh.Fz) - (wh.sink || 0)) * Math.min(1, dt * 4);
      const sink = wh.sink;
      const x = (best - sink - _M.y) / dy;
      wh.wd = world.water(bx, bz) - (best - r);
      if (x > 0) {
        wh.contact = true; wh.x = x;
        wh.P.set(bx, best - r - sink, bz); world.normal(bx, bz, wh.N);
      } else { wh.contact = false; wh.x = 0; wh.had = false; }
      wh.center.copy(_M).addScaledVector(up, Math.min(Math.max(wh.x, 0), wh.T + 0.03));
    }
    // 2) spring and damper forces, anti-roll bars
    for (let i = 0; i < 4; i++) {
      const wh = W[i], o = W[i ^ 1];
      if (!wh.contact) { wh.Fz = 0; continue; }
      let vx = wh.had ? (wh.x - wh.xPrev) / dt : 0; vx = clamp(vx, -6, 6); wh.xPrev = wh.x; wh.had = true;
      const xc = Math.min(wh.x, wh.T);
      // the tyre is a stiff spring in series with the preloaded suspension spring: the force starts from zero when the tyre touches
      const kt = Math.max(150000, 45 * wh.Fz0), soft = smoothstep(0, 0.03, wh.x);
      let Fs = Math.min(kt * wh.x, wh.pre + wh.k * xc) + soft * ((vx > 0 ? wh.cb : wh.cr) * vx + wh.arb * (xc - (o.contact ? Math.min(o.x, o.T) : 0)));
      if (wh.x > wh.T) Fs += wh.k * 12 * (wh.x - wh.T) + wh.cb * 2 * Math.max(0, vx);   // bump stop
      Fs = Math.max(0, Fs);
      wh.Fz = Math.min(Fs * Math.max(0.3, wh.N.dot(up)), m * G * 2.5);
      _d.copy(up).multiplyScalar(Fs); addForce(_d, wh.center);
    }
    // 3) drivetrain and brakes
    this.drivetrain(dt);
    const handbrake = I.handbrake ? 1 : 0;
    let anyLock = false;
    for (const wh of W) {
      const Tb = (wh.front ? this.brakeT[0] : this.brakeT[1]) * st.brake + (wh.front ? 0 : this.brakeT[2] * handbrake);
      wh.Tbrake = Tb;
    }
    this.esp(dt, world);
    // traction control on each wheel: brake a wheel that spins much faster than the ground (it works like a diff lock)
    if (this.aids.tcs) for (const wh of W) {
      if (!(wh.Tdrive > 0 && wh.contact)) continue;
      const ex = wh.omega * wh.r - Math.abs(wh.vLong) - 0.4 - 0.08 * Math.abs(wh.vLong);
      if (ex > 0) wh.Tbrake += Math.min(ex * 900 * wh.r / 0.35, (wh.front ? this.brakeT[0] : this.brakeT[1]) * 0.6);
    }
    // 4) tyres
    let maxSlipDriven = 0;
    for (const wh of W) {
      const Iw = wh.Ia || wh.I, w0 = wh.omega, wg = w0 + wh.Tdrive * dt / Iw;   // wg: the wheel speed with only the drive torque
      wh.Fx = 0; wh.Fy = 0;
      if (wh.contact && wh.Fz > 0) {
        const n = wh.N, cs = Math.cos(wh.steer), sn = Math.sin(wh.steer);
        _wf.copy(fw).multiplyScalar(cs).addScaledVector(lf, sn);
        _tl.copy(_wf).addScaledVector(n, -_wf.dot(n)).normalize();
        _ts.crossVectors(n, _tl);                               // left in the ground plane
        _r.subVectors(wh.P, pos); _vp.crossVectors(this.w, _r).add(this.vel);
        const vl = _vp.dot(_tl), vs = _vp.dot(_ts), av = Math.abs(vl), r = wh.r;
        wh.vLong = vl; wh.vLat = vs;
        const tt = TYRES[this.tyre] || TYRES.sommer, sp = SURF_PROPS[wh.surf] || SURF_PROPS[0];
        const loose = sp[4], kp = tt.kp * loose, ap = tt.ap * Math.sqrt(loose);
        let mu = surfGrip(wh.surf, this.tyre, world.wet) * (1 - 0.07 * (wh.Fz / wh.Fz0 - 1));
        if (wh.wd > 0) mu *= wh.wd > r ? 0.6 : 0.85;
        mu = Math.max(0.05, mu) * (this.spec.grip ?? 1); wh.mu = mu;
        const Lx = 0.25 * r / 0.33, Ly = 0.6 * r / 0.33;
        // relaxation: the slip builds up over a short rolling distance (a floor on the speed keeps it bounded at standstill).
        // kappa is linear in the new wheel speed: kappa = A + B * omega
        const ar = Math.max(av, 0.3), den = 1 + dt * ar / Lx, B = dt * r / Lx / den, A = (wh.kappa - dt * vl / Lx) / den;
        wh.tanA = clamp((wh.tanA - dt * vs / Ly) / (1 + dt * ar / Ly), -3, 3);
        // at walking pace the contact patch needs damping, or the car would rock on its tyres like on springs
        // (no stiffer than the light wheel and a quarter of the car can take in one step)
        const lo = 1 - smoothstep(1.0, 4.0, av), mq = m / 4, mx = 1 / (1 / mq + r * r / Iw);
        const cdx = lo > 0 ? lo * Math.min(2 * Math.sqrt(mu * wh.Fz * 2.4 / (kp * Lx) * mx) * 0.7, 0.45 * mx / dt) : 0;
        const cdy = lo > 0 ? lo * Math.min(2 * Math.sqrt(mu * wh.Fz * 2.4 / (ap * Ly) * mq) * 0.7, 0.45 * mq / dt) : 0;
        // solve the wheel speed implicitly against the tyre force (linearised round wg), so it does not saw back and forth each step
        const k0 = clamp(A + B * wg, -3, 3);
        tyreForce(k0, wh.tanA, wh.Fz, mu, kp, ap, _fx); const F0 = _fx[0];
        tyreForce(k0 + 1e-4, wh.tanA, wh.Fz, mu, kp, ap, _fx); const D = Math.max(0, (_fx[0] - F0) / 1e-4);
        const fd0 = cdx * ((wg * r - vl) - av * k0), Dw = D * B + Math.max(0, cdx * (r - av * B));
        const solve = T => (w0 + dt / Iw * (T - r * (F0 + fd0) + r * Dw * wg)) / (1 + dt / Iw * r * Dw);
        // brakes: friction against the way the wheel turns; they can stop it, never turn it backwards
        const Tb = wh.Tbrake, sg = w0 > 1e-6 ? 1 : w0 < -1e-6 ? -1 : 0;
        let wn;
        if (Tb <= 0) wn = solve(wh.Tdrive);
        else if (sg !== 0) { wn = solve(wh.Tdrive - sg * Tb); if (Math.sign(wn) !== sg) wn = 0; }
        else { const wf = solve(wh.Tdrive); wn = Math.abs(wf - w0) * Iw / dt <= Tb ? 0 : solve(wh.Tdrive - Math.sign(wf) * Tb); }
        // ABS: the wheel may not turn slower than the slip where the tyre grips best (it opens the brake for that wheel)
        if (this.aids.abs && Tb > 0 && av > 1.5 && !(handbrake && !wh.front)) {
          const kt = -kp * 0.95 * Math.sign(vl), wt = (kt - A) / B;
          if (vl > 0 ? wn < wt : wn > wt) { wn = Math.min(Math.abs(wt), Math.abs(solve(wh.Tdrive))) * Math.sign(vl); anyLock = true; }
        }
        wh.kappa = clamp(A + B * wn, -3, 3);
        tyreForce(wh.kappa, wh.tanA, wh.Fz, mu, kp, ap, _fx);
        let fx = _fx[0] + cdx * ((wn * r - vl) - av * wh.kappa), fy = _fx[1] + cdy * (-vs - av * wh.tanA);
        if (lo > 0) { const fm = Math.hypot(fx, fy), lim = mu * wh.Fz * 1.02; if (fm > lim) { fx *= lim / fm; fy *= lim / fm; } }
        // rolling resistance and soft ground (mud, sand, snow) push against the direction the wheel rolls
        const rr = (sp[1] + sp[2] * Math.min(av, 15) + (wh.wd > 0 ? Math.min(wh.wd, 0.8) * 0.12 : 0)) * wh.Fz * Math.tanh(vl / 0.4);
        _d.copy(_tl).multiplyScalar(fx - rr).addScaledVector(_ts, fy);
        addForce(_d, wh.P);
        wh.Fx = fx; wh.Fy = fy;
        wh.omega = wn;
        wh.slipV = Math.hypot(wh.omega * r - vl, vs);
        wh.slip = Math.hypot(wh.kappa / kp, wh.tanA / ap);
        if (wh.Tdrive > 0) maxSlipDriven = Math.max(maxSlipDriven, wh.kappa / kp);
      } else {
        const dw = wh.Tbrake * dt / Iw; wh.omega = Math.abs(wg) <= dw ? 0 : wg - Math.sign(wg) * dw;
        wh.slipV = 0; wh.slip = 0; wh.kappa *= 0.9; wh.tanA *= 0.9;
      }
      wh.spin += wh.omega * dt;
    }
    st.absOn = anyLock;
    if (st.locked) st.omegaE = Math.max(this.shaftOmega() * this.totalRatio(), this.eng.idle * 0.5);
    // traction control: take throttle away while the driven tyres spin more than the slip where they grip best
    // and a feedback on top for what the estimate misses (bumps, a wheel in the air): the driven wheels may not slip faster
    // over the ground than about the slip where the tyre grips best
    if (this.aids.tcs) {
      let e = -1;
      for (const wh of W) if (wh.Tdrive > 0 && wh.contact) {
        const kp = (TYRES[this.tyre] || TYRES.sommer).kp * (SURF_PROPS[wh.surf] || SURF_PROPS[0])[4], svt = Math.max(0.3, kp * 1.3 * Math.abs(wh.vLong));
        e = Math.max(e, (wh.omega * wh.r - wh.vLong) / svt - 1);
      }
      st.tcs = clamp(st.tcs + dt * (e > 0 ? -3 * Math.min(e, 3) : 1.5), 0.25, 1); st.tcsOn = st.tcs < 0.95;
    } else st.tcs = 1;
    // 5) air: drag and downforce
    const sp2 = this.vel.lengthSq();
    if (sp2 > 0.01) {
      const vv = Math.sqrt(sp2); _d.copy(this.vel).multiplyScalar(-0.5 * RHO * this.drag * vv); F.add(_d);
      const fwd = Math.max(0, v);
      if (this.down[0] || this.down[1]) {
        const k = 0.5 * RHO * fwd * fwd;
        _a.copy(fw).multiplyScalar(this.a).add(pos); _d.copy(up).multiplyScalar(-k * this.down[0]); addForce(_d, _a);
        _a.copy(fw).multiplyScalar(-this.b).add(pos); _d.copy(up).multiplyScalar(-k * this.down[1]); addForce(_d, _a);
      }
    }
    // 6) the body touching the ground (bottoming out on a rock, lying on its roof)
    for (const hp of this.hull) {
      _P.copy(hp).applyQuaternion(q).add(pos);
      const pen = world.height(_P.x, _P.z) - _P.y; if (pen <= 0) continue;
      world.normal(_P.x, _P.z, _n); _r.subVectors(_P, pos); _vp.crossVectors(this.w, _r).add(this.vel);
      const vn = _vp.dot(_n), Nf = Math.max(0, 260 * m * Math.min(pen, 0.25) - (vn < 0 ? 22 * m * vn : 0));
      _d.copy(_vp).addScaledVector(_n, -vn); const tl = _d.length();
      const ft = Math.min(tl * m * 2, 0.45 * Nf);
      _d.multiplyScalar(tl > 1e-6 ? -ft / tl : 0).addScaledVector(_n, Nf);
      addForce(_d, _P);
    }
    // 7) water: the body floats a little and is braked; the engine floods if the air intake goes under
    const wl = world.water(pos.x, pos.z);
    st.depth = wl - (pos.y - this.cgH + (this.spec.clear ?? 0.2) * 0);
    const intake = pos.y - this.cgH + this.wade;
    if (wl > intake && st.omegaE > 0) st.flooded = true;
    const sub = clamp((wl - (pos.y - this.cgH * 0.7)) / (this.spec.dims.H * 0.8), 0, 1);
    if (sub > 0) {
      F.y += sub * m * G * 0.75;
      const k = Math.exp(-1.2 * sub * dt); this.vel.x *= k; this.vel.z *= k; this.vel.y *= Math.exp(-3 * sub * dt); this.w.multiplyScalar(Math.exp(-2 * sub * dt));
    }
    // 8) winch rope: a steady pull on the front hook
    if (this.rope) {
      _P.set(0, 0.1, this.box.zc + this.box.hl).applyQuaternion(q).add(pos);
      _d.set(this.rope.x - _P.x, this.rope.y - _P.y, this.rope.z - _P.z); const L = _d.length();
      if (L > 0.3) { _d.multiplyScalar(this.rope.F / L); addForce(_d, _P); }
    }
    // integrate
    this.vel.addScaledVector(F, dt / m);
    _a.copy(T).applyQuaternionInv(q); _a.set(_a.x / this.I.x, _a.y / this.I.y, _a.z / this.I.z).applyQuaternion(q);
    this.w.addScaledVector(_a, dt);
    this.w.multiplyScalar(1 - 0.05 * dt);
    pos.addScaledVector(this.vel, dt);
    q.integrate(this.w, dt);
    this.collide(world, dt);
    st.speed = this.speed;
    st.airT = W.every(w => !w.contact) ? st.airT + dt : 0;
    if (!isFinite(pos.x) || !isFinite(q.w) || !isFinite(this.w.x)) { this.reset(0, 50, 0, 0); this.blewUp = true; }
  }

  // stability control: compare the yaw rate with what the steering asks for, and brake one side to correct it
  esp(dt, world) {
    const st = this.state; st.espOn = false;
    if (!this.aids.esp) return;
    const v = this.speed; if (v < 6) return;
    const W = this.wheels, mu = surfGrip(W[0].surf, this.tyre, world.wet);
    const dAvg = (W[0].steer + W[1].steer) / 2, wb = this.spec.wb;
    let rDes = v * Math.tan(dAvg) / (wb * (1 + 0.0025 * v * v));
    const rMax = mu * G * 0.95 / v; rDes = clamp(rDes, -rMax, rMax);
    const r = this.w.dot(this.up), e = r - rDes;
    if (Math.abs(e) < 0.08) return;
    st.espOn = true;
    const M = -e;                                         // the yaw we want to add (+ = left)
    const k = clamp((Math.abs(e) - 0.08) * 2500, 0, this.brakeT[0] * 0.6);
    const side = M > 0 ? 0 : 1;                           // brake the left wheels for a left yaw, the right ones for a right yaw
    W[side].Tbrake += k; W[side + 2].Tbrake += k * 0.5;
    st.tcs = Math.min(st.tcs, 0.6);
  }

  // things in the world: trees, posts, walls and houses. The car is a box; the contact pushes it out and turns it.
  collide(world, dt) {
    const B = this.box, pos = this.pos, q = this.q, list = world.colliders(pos.x, pos.z, B.hl + 2);
    if (!list || !list.length) return;
    const fw = this.fw, lf = this.lf;
    const fx = fw.x, fz = fw.z, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl, lx = uz, lz = -ux;   // ground-plane forward and left
    const cx = pos.x + ux * B.zc, cz = pos.z + uz * B.zc, y0 = pos.y + B.y0, y1 = pos.y + B.y1;
    for (const c of list) {
      if (c.y1 != null && c.y1 < y0) continue;
      if (c.y0 != null && c.y0 > y1) continue;
      let nx = 0, nz = 0, pen = 0, px = 0, pz = 0;
      if (c.r != null) {
        // circle against the car's rectangle
        const dx = c.x - cx, dz = c.z - cz, a = dx * ux + dz * uz, b = dx * lx + dz * lz;
        const ca = clamp(a, -B.hl, B.hl), cb = clamp(b, -B.hw, B.hw);
        let ex = a - ca, eb = b - cb, d = Math.hypot(ex, eb);
        if (d >= c.r) continue;
        if (d < 1e-6) {   // the centre is inside the car: push out along the shortest way
          const pa = B.hl - Math.abs(a), pb = B.hw - Math.abs(b);
          if (pa < pb) { ex = Math.sign(a) || 1; eb = 0; pen = pa + c.r; } else { ex = 0; eb = Math.sign(b) || 1; pen = pb + c.r; }
          d = 1;
        } else pen = c.r - d;
        ex /= d; eb /= d;
        nx = -(ex * ux + eb * lx); nz = -(ex * uz + eb * lz);      // from the collider into the car
        px = cx + ca * ux + cb * lx; pz = cz + ca * uz + cb * lz;
      } else {
        // rectangle against rectangle (separating axes in the ground plane)
        const cs = Math.cos(c.ang || 0), sn = Math.sin(c.ang || 0), bx1 = cs, bz1 = -sn, bx2 = sn, bz2 = cs;   // the box's own axes
        const axes = [[ux, uz], [lx, lz], [bx1, bz1], [bx2, bz2]], dx = cx - c.x, dz = cz - c.z;
        let best = 1e9, bnx = 0, bnz = 0;
        for (const [ax, az] of axes) {
          const ra = B.hl * Math.abs(ux * ax + uz * az) + B.hw * Math.abs(lx * ax + lz * az);
          const rb = c.hw * Math.abs(bx1 * ax + bz1 * az) + c.hd * Math.abs(bx2 * ax + bz2 * az);
          const dd = dx * ax + dz * az, o = ra + rb - Math.abs(dd);
          if (o <= 0) { best = -1; break; }
          if (o < best) { best = o; bnx = dd < 0 ? -ax : ax; bnz = dd < 0 ? -az : az; }
        }
        if (best <= 0) continue;
        pen = best; nx = bnx; nz = bnz;
        // contact point: the car's corner that reaches deepest into the box
        let md = 1e9;
        for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
          const qx = cx + ux * B.hl * sa + lx * B.hw * sb, qz = cz + uz * B.hl * sa + lz * B.hw * sb, dd = (qx - c.x) * nx + (qz - c.z) * nz;
          if (dd < md) { md = dd; px = qx; pz = qz; }
        }
      }
      // push out, then an impulse at the contact point (a little bounce, some friction)
      pos.x += nx * pen; pos.z += nz * pen;
      _P.set(px, pos.y, pz); _r.subVectors(_P, pos); _vp.crossVectors(this.w, _r).add(this.vel);
      _n.set(nx, 0, nz);
      const vn = _vp.dot(_n); if (vn >= 0) continue;
      const rn = _c.crossVectors(_r, _n), Iw = _a.copy(rn).applyQuaternionInv(q); Iw.set(Iw.x / this.I.x, Iw.y / this.I.y, Iw.z / this.I.z).applyQuaternion(q);
      const k = 1 / this.m + _b.crossVectors(Iw, _r).dot(_n);
      const e = c.bounce ?? 0.15, j = -(1 + e) * vn / k;
      _d.copy(_n).multiplyScalar(j);
      _t.copy(_vp).addScaledVector(_n, -vn); const tl = _t.length();
      if (tl > 1e-4) _d.addScaledVector(_t, -Math.min(0.5 * j, tl * this.m * 0.5) / tl);
      this.vel.addScaledVector(_d, 1 / this.m);
      _c.crossVectors(_r, _d).applyQuaternionInv(q); _c.set(_c.x / this.I.x, _c.y / this.I.y, _c.z / this.I.z).applyQuaternion(q); this.w.add(_c);
      this.lastHit = { j, x: px, z: pz, t: this.state.time, c };
    }
  }
}
