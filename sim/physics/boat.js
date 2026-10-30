// Boats: a planing motorboat with outboard engines, as a rigid body on the water. SI units (m, kg, s, N); no DOM and no
// three.js, so it runs in Node (tools/test-boat.mjs).
//
//   hull       a grid of points over the bottom: a V with deadrise that deepens towards the bow, the keel rising to the stem and
//              the chines narrowing to it. Each point is a column of hull up to the gunwale: buoyancy from how deep it lies under
//              the (wavy) surface, and heave/pitch/roll damping
//   planing    dynamic pressure on the wetted bottom. Each buttock line is wet from the transom to where it leaves the water, and
//              the pressure peaks just aft of that leading edge (thin-plate distribution), so the lift grows with the square root
//              of the wetted length as in Savitsky's planing equations. It gives lift, induced drag (lift × trim), slamming in
//              waves, and on the V the lateral grip that carves turns and banks the boat into them
//   resistance skin friction (ITTC 1957) on the wetted area; wave-making resistance with its hump below planing speed, and the
//              boat's own wave system that sinks the stern into its trough at hump speed (bow up before it climbs onto the plane);
//              cross-flow drag on the hull sides; air drag
//   outboard   engine torque curve → gear → propeller (KT/KQ curves against the advance ratio); the rpm comes from the torque
//              balance. Steering turns the thrust and the gearcase works as a rudder, trim tilts the thrust line, reverse, and the
//              propeller ventilates when it comes near the surface (thrust lost, the rpm flares)
//   ground     hull points against world.height: grounding friction and a stop on a beach or a skerry; a steep face (a quay, a
//              cliff) is a wall the hull bounces off; things in world.colliders (piers, posts, buoys) like the car
//
// Body frame like the car: +z forward, +y up, +x left, origin in the centre of mass; heading h points the bow along (sin h, 0, cos h).
// The world is the car's (see sim/physics/vehicle.js): height(x,z), normal(x,z,out), surface(x,z), water(x,z), colliders(x,z,r).
import { V3, Quat, clamp, curve, smoothstep, RPM } from './math.js';
import { SURF_PROPS } from './surfaces.js';

const G = 9.81, RHO = 1025, RHO_AIR = 1.225, NU = 1.19e-6, D2R = Math.PI / 180;
export const KNOT = 0.514444;                 // m/s per knot
// hydrodynamic coefficients (tuned against real boat tests, see tools/test-boat.mjs)
const CP = 0.35;        // planing pressure (with the leading-edge weighting below, Savitsky's lift for a 3–5° planing surface)
const C_LIN = 700;      // radiation damping of heave, pitch and roll (N s/m³ of wetted area)
const C_WET = 250;      // the unsteady wetting force at speed: damping (N s/m³ per m/s of speed); it keeps the boat from porpoising
const KA = 0.3;         // added mass: a layer of water this many half-beams thick under the wetted bottom
const K_WV = 0.6;       // how much of the wave surface's own motion the planing pressure sees (the wetted area averages short waves)
const C_X = 1.4;        // cross-flow pressure on the side of the V that meets a sideways flow, relative to CP (it banks the boat in)
const C_Y = 0.13;       // side force of the wetted bottom (keel, chines, strakes) per unit of sideslip
const C_CROSS = 0.7;    // cross-flow drag of the hull sides
const GC_CL = 0.35;     // the gearcase's maximum lift: it ventilates near the surface when loaded
// wave-making resistance (fraction of the weight the water carries by buoyancy) and the slope of the boat's own wave along the
// hull (rad), against the Froude number V/sqrt(g L)
const CW = [[0, 0], [0.2, 0.002], [0.3, 0.008], [0.4, 0.03], [0.5, 0.075], [0.6, 0.105], [0.7, 0.11], [0.85, 0.09], [1.0, 0.065], [1.3, 0.04], [2, 0.02], [3, 0.01]];
const TILT = [[0, 0], [0.25, 0.04], [0.4, 0.25], [0.55, 0.7], [0.7, 1], [0.85, 0.85], [1.0, 0.5], [1.25, 0.2], [1.6, 0.05], [2.2, 0]];
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _n = new V3(), _r = new V3(), _f = new V3(), _t = new V3(),
  _u = new V3(), _vp = new V3(), _P = new V3(), _tw = new V3(), _nw = new V3(), _spr = new V3();

// ---------------------------------------------------------------- the sea
// The same Gerstner waves the renderer draws (sim/render/water.js): direction, wavelength (m), amplitude (m), deep-water speed.
export const WAVES = [[1, 0.35, 31, 0.22], [0.6, 1, 13, 0.09], [-0.4, 1, 7, 0.045]].map(([dx, dz, L, A]) => {
  const l = Math.hypot(dx, dz), k = 2 * Math.PI / L; return { dx: dx / l, dz: dz / l, k, c: Math.sqrt(G / k), A };
});
// Height of the wavy surface above the still water level at (x,z) and time t. The Gerstner surface moves the water sideways as
// well, so first find the undisplaced point that ends up above (x,z) (a few fixed-point steps converge since the waves are gentle).
export function waveHeight(x, z, t, scale = 1) {
  if (!scale) return 0;
  let px = x, pz = z;
  for (let it = 0; it < 3; it++) {
    let ox = 0, oz = 0;
    for (const w of WAVES) { const a = w.A * scale * Math.cos(w.k * (w.dx * px + w.dz * pz - w.c * t)); ox += w.dx * a; oz += w.dz * a; }
    px = x - ox; pz = z - oz;
  }
  let y = 0;
  for (const w of WAVES) y += w.A * scale * Math.sin(w.k * (w.dx * px + w.dz * pz - w.c * t));
  return y;
}

// ---------------------------------------------------------------- propeller
// Open-water curves of a 3-blade outboard propeller at P/D 1.2 (zero thrust a little past the geometric pitch, best efficiency
// ~0.69 at 25–30 % slip, ~0.62 at the 10 % slip of top speed), scaled to other pitch ratios: x = J / r with r = (P/D) / 1.2.
// Past zero thrust (windmilling) and below zero (flow against the thrust) they continue as gentle straight lines.
const ktB = x => Math.max(-0.12, 0.42 * (1 - x / 1.27));
const kqB = x => x < 0 ? 0.055 - 0.0286 * x : x < 1.27 ? 0.055 - 0.0286 * x - 0.00537 * x * x : Math.max(-0.02, 0.01 - 0.042 * (x - 1.27));

export class Boat {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.pos = new V3(); this.vel = new V3(); this.q = new Quat(); this.w = new V3();
    this.fw = new V3(0, 0, 1); this.up = new V3(0, 1, 0); this.lf = new V3(1, 0, 0);
    // throttle −1…1 (below zero: reverse; a neutral detent round 0), steer −1…1 (+1 = turn left, like the car), trim −1 (in) … 1 (out)
    this.input = { throttle: 0, steer: 0, trim: 0 };
    this.autoTrim = opts.autoTrim ?? true;     // trims the engine by itself: in for the hole shot, out on the plane
    this.waveScale = opts.waveScale ?? 1;      // for the default sea
    this.water = opts.water || null;           // (x, z, t) → water level with waves; null: world.water(x,z) + waveHeight(…)·waveScale
    this.wind = new V3();                      // m/s, for air drag
    this.t = 0;                                // the wave clock (s): keep it equal to the renderer's water time
    this.build();
    this.reset(0, 0, 0, 0);
  }

  // the hull points, mass properties and engines from the spec
  build() {
    // hull points: nz stations from the transom to the stem, nx points across each half of the bottom
    const s = this.spec, h = s.hull, NZ = this.nz = h.nz ?? 14, NX = this.nx = h.nx ?? 4;
    const L = h.L, zt = -h.lcg * L, dz = L / NZ, k0 = -h.vcg, m = this.m = s.mass;
    const rise = u => h.rise * Math.max(0, (u - 0.45) / 0.55) ** 2, drise = u => 2 * h.rise * Math.max(0, (u - 0.45) / 0.55) / 0.55 / L;
    const half = u => h.B / 2 * (u < 0.55 ? 1 : Math.max(0.06, 1 - ((u - 0.55) / 0.45) ** 2) ** 0.6);
    const beta = u => (h.deadrise + (h.bowDeadrise - h.deadrise) * smoothstep(0.3, 1, u)) * D2R;
    this.L = L; this.B = h.B; this.zt = zt; this.dz = dz; this.keel = k0;
    // buttock lines: the points along the bottom at one distance from the keel, from the transom forward
    this.lines = [];
    for (const side of [1, -1]) for (let i = 0; i < NX; i++) {
      const line = [];
      for (let j = 0; j < NZ; j++) {
        const u = (j + 0.5) / NZ, hb = half(u), b = beta(u), tb = Math.tan(b), x = side * (i + 0.5) / NX * hb, y = k0 + rise(u) + Math.abs(x) * tb;
        line.push({ p: new V3(x, y, zt + u * L), n: new V3(side * tb, -1, drise(u)).normalize(), w: hb / NX, hb, cb: Math.cos(b), fb: 1 - Math.sin(b),
          top: k0 + h.depth + 0.3 * u * u, P: new V3(), d: 0, hw: 0, wv: 0, had: false });
      }
      this.lines.push(line);
    }
    // points the ground pushes on: the keel, the chines, the transom corners
    this.hullPts = [];
    for (let j = 0; j < NZ; j += 1) { const u = (j + 0.5) / NZ, hb = half(u), y = k0 + rise(u); this.hullPts.push(new V3(0, y, zt + u * L)); if (j % 2 === 0) for (const sd of [1, -1]) this.hullPts.push(new V3(sd * hb, y + hb * Math.tan(beta(u)), zt + u * L)); }
    this.hullPts.push(new V3(0, k0 + h.rise + 0.15, zt + L), new V3(h.B / 2, k0 + h.depth, zt), new V3(-h.B / 2, k0 + h.depth, zt));
    // mass properties: radii of gyration of a small boat (pitch and yaw ~ a quarter of the length, roll ~ 0.36 of the beam)
    const Lo = s.L ?? L * 1.08, Bo = s.B ?? h.B * 1.15;
    this.I = new V3(m * (0.25 * Lo) ** 2, m * (0.26 * Lo) ** 2, m * (0.36 * Bo) ** 2);
    this.box = { hl: Lo / 2, hw: Bo / 2, zc: zt - 0.1 + Lo / 2, y0: k0, y1: k0 + h.depth + 0.4 };
    // the outline in the water plane for collisions: [x (left), z (forward)], counter-clockwise seen from above, with the engine aft
    const hw = Bo / 2, zs = zt - 0.05, ze = -(s.drive.aft ?? 0.4) - 0.25;
    this.outline = [[0, zs + Lo], [-0.62 * hw, zs + 0.82 * Lo], [-hw, zs + 0.5 * Lo], [-hw, zs], [-0.3, zt + ze], [0.3, zt + ze], [hw, zs], [hw, zs + 0.5 * Lo], [0.62 * hw, zs + 0.82 * Lo]];
    // engines: power, torque curve and propeller
    const e = s.engine, n = e.count || 1, P = e.hp * 745.7, wr = e.rpm / RPM;
    this.eng = { idle: e.idle / RPM, rated: wr, lim: (e.limit ?? e.rpm * 1.08) / RPM, gear: e.gear, I: e.inertia ?? 0.25, Tpk: P / (wr * 0.94), eff: 0.95 };
    const pr = s.prop, dr = s.drive;
    this.prop = { D: pr.D, r: pr.P / pr.D / 1.2, wake: pr.wake ?? 0.04 };
    this.motors = [];
    for (let i = 0; i < n; i++) this.motors.push({ x: (i - (n - 1) / 2) * (e.spacing || 0.8), omega: this.eng.idle, T: 0, Q: 0, vent: 0, im: 1, P: new V3(), slip: 0, angle: 0 });
    this.drive = { depth: dr.depth, aft: dr.aft ?? 0.4, pivot: dr.pivot ?? h.depth * 0.8, steer: (dr.steer ?? 30) * D2R, fin: dr.fin ?? 0.06, cd: dr.cd ?? 0.004,
      trim: [(dr.trim?.[0] ?? -6) * D2R, (dr.trim?.[1] ?? 10) * D2R], torque: (dr.torque ?? e.hp * 3) * n, rate: (dr.rate ?? 28) * D2R };
    this.CdA = s.CdA ?? 2;
    // how high the centre of mass floats over still water (bisection on the buoyancy at zero trim)
    let lo = -2, hi = 2;
    for (let it = 0; it < 50; it++) {
      const e0 = (lo + hi) / 2; let Fb = 0;
      for (const line of this.lines) for (const pt of line) Fb += RHO * G * pt.w * dz * clamp(-(pt.p.y + e0), 0, pt.top - pt.p.y);
      if (Fb > m * G) lo = e0; else hi = e0;
    }
    this.restY = (lo + hi) / 2;
    this.draft = -k0 - this.restY;             // keel depth at the transom at rest (m)
  }

  reset(x, y, z, heading) {
    this.q.setFromAxisAngle(_a.set(0, 1, 0), heading);
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.w.set(0, 0, 0);
    for (const line of this.lines) for (const pt of line) pt.had = false;
    for (const M of this.motors) { M.omega = this.eng.idle; M.vent = 0; M.T = 0; M.Q = 0; }
    this.state = Object.assign(this.state || {}, { gear: 0, want: 0, shiftT: 0, thr: 0, steer: 0, trimA: 0, rpm: this.eng.idle * RPM, speed: 0, knots: 0,
      steerLoad: 0, trim: 0, roll: 0, heading: 0, onPlane: false, liftFrac: 0, buoyFrac: 1, spray: 0, propOut: false, grounded: false, propStrike: false, depth: 0,
      wetArea: 0, thrust: 0, time: 0, res: { pressure: 0, friction: 0, wave: 0, air: 0, gearcase: 0 } });
    this.sprayAt = new V3(x, y, z);
    this.freePos = new V3(x, y, z);            // the last place where the hull was clear of the ground (walls push back towards it)
    this.lastHit = null; this.blewUp = false;
    this.updateAxes();
  }

  // float the boat at (x,z) on the water, bow along heading
  place(world, x, z, heading) {
    const wl = this.level(world, x, z);
    this.reset(x, (isFinite(wl) ? wl : world.height(x, z)) + this.restY, z, heading);
  }

  updateAxes() { this.fw.set(0, 0, 1).applyQuaternion(this.q); this.up.set(0, 1, 0).applyQuaternion(this.q); this.lf.set(1, 0, 0).applyQuaternion(this.q); }
  level(world, x, z) { return this.water ? this.water(x, z, this.t) : world.water(x, z) + waveHeight(x, z, this.t, this.waveScale); }

  get speed() { return this.vel.dot(this.fw); }
  get knots() { return Math.abs(this.speed) / KNOT; }
  get rpm() { return this.motors[0].omega * RPM; }

  // the lever (throttle and gear), the wheel and the trim
  controls(dt) {
    const I = this.input, st = this.state, e = this.eng, t = clamp(I.throttle, -1, 1), det = 0.06;
    st.want = t > det ? 1 : t < -det ? -1 : 0;
    // a progressive throttle: the first half of the lever gives most of the torque, as the throttle body does
    let thr = st.want ? (1 - (1 - (Math.abs(t) - det) / (1 - det)) ** 1.5) * (st.want < 0 ? 0.5 : 1) : 0;   // reverse: half power at most
    // the dog clutch only goes in at idle: hold the throttle back until the engine has slowed, then shift
    if (st.want !== st.gear) {
      thr = 0;
      if (st.gear !== 0) { if (this.motors[0].omega < e.idle * 1.5) { st.gear = 0; st.shiftT = 0.25; } }
      else if ((st.shiftT -= dt) <= 0) st.gear = st.want;
    }
    st.thr = thr;
    // hydraulic steering: the engine turns at drive.rate (°/s), and only as far as the ram can hold it against the water pushing on
    // the gearcase (its centre of pressure ~0.1 m behind the steering axis), so at speed it never reaches full lock
    let target = clamp(I.steer, -1, 1) * this.drive.steer;
    const over = st.steerLoad / this.drive.torque - 1;
    if (over > 0 && Math.abs(target) > Math.abs(st.steer) - 0.01 && target * st.steer >= 0) target = st.steer - Math.sign(st.steer) * Math.min(over, 1) * 0.1;
    st.steer += clamp(target - st.steer, -dt * this.drive.rate, dt * this.drive.rate);
    // trim: by hand (input −1…1), or automatically from the speed
    const [t0, t1] = this.drive.trim, kn = this.knots;
    const want = this.autoTrim ? (st.gear < 0 ? 0 : kn < 14 ? t0 * 0.6 : Math.min(t1 * 0.55, t0 * 0.6 + (kn - 14) * 0.45 * D2R)) : (I.trim >= 0 ? I.trim * t1 : -I.trim * t0);
    st.trimA += clamp(want - st.trimA, -dt * 4 * D2R, dt * 4 * D2R);
  }

  step(dt, world) {
    const m = this.m, st = this.state, q = this.q, pos = this.pos;
    this.t += dt; st.time += dt;
    this.controls(dt);
    this.updateAxes();
    const fw = this.fw, up = this.up, lf = this.lf;
    const F = _f.set(0, -m * G, 0), T = _t.set(0, 0, 0);
    const addForce = (f, at) => { F.add(f); _r.subVectors(at, pos); _c.crossVectors(_r, f); T.add(_c); };
    const pointVel = (at, out) => { _r.subVectors(at, pos); return out.crossVectors(this.w, _r).add(this.vel); };
    const base = this.water ? 0 : world.water(pos.x, pos.z);
    const lvl = this.water ? (x, z) => this.water(x, z, this.t) : (x, z) => base + waveHeight(x, z, this.t, this.waveScale);
    // speed through the water and the Froude number on the bottom length
    const vf = this.vel.dot(fw), vh = Math.hypot(this.vel.x, this.vel.z), Fn = vh / Math.sqrt(G * this.L);
    // the boat's own wave: at hump speed the bow wave is under the bow and the stern sits in the trough behind it
    const tilt = (vf > 0 ? 0.065 * curve(TILT, Fn) : 0) * st.buoyFrac, zMid = this.zt + this.L / 2;
    const Re = Math.max(1e5, vh * this.L * 0.6 / NU), Cf = 0.075 / (Math.log10(Re) - 2) ** 2 + 0.00015;
    // 1) the hull: buoyancy, planing pressure, friction, cross-flow
    let buoy = 0, liftY = 0, wetA = 0, spray = 0, cbx = 0, cby = 0, cbz = 0, rP = 0, rF = 0, ma = 0, iax = 0, iaz = 0;
    const sqB = 2 * Math.sqrt(this.B), dz = this.dz;
    const spr = _spr.set(0, 0, 0);   // where the spray comes off (weighted by its strength)
    for (const line of this.lines) {
      for (const pt of line) {
        pt.P.copy(pt.p).applyQuaternion(q).add(pos);
        const hw = lvl(pt.P.x, pt.P.z) + tilt * (pt.p.z - zMid);
        pt.wv = pt.had && isFinite(hw) ? clamp((hw - pt.hw) / dt, -8, 8) : 0; pt.hw = hw; pt.had = isFinite(hw);
        pt.d = hw - pt.P.y;
      }
      let zle = 0, lead = -1;
      for (let j = this.nz - 1; j >= 0; j--) {
        const pt = line[j], d = pt.d;
        if (d <= 0) { lead = -1; continue; }
        const zj = pt.p.z;
        // the leading edge of this wet stretch: where the line leaves the water (between this point and the next one forward)
        if (lead < 0) { lead = j; const nx = line[j + 1]; zle = nx ? zj + dz * d / (d - nx.d) : zj + dz / 2; }
        const hi = j === lead ? zle : zj + dz / 2, pv = line[j - 1];
        const lo = j === 0 ? zj - dz / 2 : pv.d > 0 ? zj - dz / 2 : zj - dz * d / (d - pv.d);
        // buoyancy of the column (up to the gunwale)
        const dc = Math.min(d, Math.max(0, (pt.top - pt.p.y) * Math.max(0.2, up.y))), Fb = RHO * G * pt.w * dz * dc;
        _P.copy(pt.P).addScaledVector(up, dc * 0.5);
        _d.set(0, Fb, 0); addForce(_d, _P);
        buoy += Fb; cbx += _P.x * Fb; cby += _P.y * Fb; cbz += _P.z * Fb;
        // added mass: the water under the wetted bottom has to be pushed along when the hull heaves, pitches or rolls
        const a = RHO * KA * pt.hb * pt.w * dz * smoothstep(0, 0.05, d); ma += a; iax += a * pt.p.z * pt.p.z; iaz += a * pt.p.x * pt.p.x;
        // velocity of the hull through the water here (the surface rising under the point counts as the hull sinking into it)
        pointVel(pt.P, _vp); _u.copy(_vp); _u.y -= K_WV * pt.wv;
        _nw.copy(pt.n).applyQuaternion(q);
        const un = _u.dot(_nw), us = _u.length(), wl = Math.max(0, hi - lo), wf = smoothstep(0, 0.04, d);
        // planing pressure from the forward and vertical motion, peaking at the leading edge (weight = ∫ sqrt(B/s) ds over the wet
        // part of this point's strip), and from the sideways motion the cross-flow on the side of the V that meets it, even over
        // the wetted strip: it lifts the outer side in a turn, so the boat banks in and the tilted lift carves the turn
        const ul = _u.dot(lf), uc = ul * lf.dot(_nw), sh = Math.max(0, zle - lo), sl = Math.max(0, zle - hi), Aw = wl * pt.w / pt.cb;
        const pn = pt.fb * (un - uc) * sqB * (Math.sqrt(sh) - Math.sqrt(sl)) + C_X * Math.max(0, uc) * wl;
        let Fn_ = 0;
        if (pn > 0 && wl > 0) {
          Fn_ = CP * 0.5 * RHO * us * pn * pt.w;
          _d.copy(_nw).multiplyScalar(-Fn_); addForce(_d, pt.P);
          liftY += _d.y; rP -= _d.dot(fw); spray += Fn_ * us * (j === lead ? 1 : 0.25);
          spr.addScaledVector(pt.P, Fn_ * us * (j === lead ? 1 : 0.25));
        }
        // radiation damping of heave, pitch and roll, and at speed the force from the wetted area growing as the hull sinks
        // into the water (the unsteady part of d(m_a V_n)/dt in strip theory)
        const Fl = -(C_LIN * (_vp.y - pt.wv) + C_WET * us * _vp.y) * pt.w * dz * wf;
        _d.set(0, Fl, 0); addForce(_d, pt.P);
        // skin friction on the wetted strip
        _b.copy(_u).addScaledVector(_nw, -un); const ut = _b.length();
        if (ut > 1e-4 && Aw > 0) { _d.copy(_b).multiplyScalar(-0.5 * RHO * Cf * ut * Aw * 1.05); addForce(_d, pt.P); rF -= _d.dot(fw); }
        wetA += Aw;
        // sideways: the keel, the chines and the V grip like a low-aspect-ratio foil over the wetted bottom (aft of the centre of
        // mass when planing, so it keeps the boat straight and carves the turns), and the hull sides take cross-flow drag. The
        // resultant acts about level with the centre of mass (the chine and spray forces act higher than the bottom)
        const As = dc * dz / this.nx;
        _P.copy(pt.p); _P.y = 0; _P.applyQuaternion(q).add(pos);
        _d.copy(lf).multiplyScalar(-(C_Y * 0.5 * RHO * us * Aw + (0.5 * RHO * C_CROSS * Math.abs(ul) + 40) * As) * ul); addForce(_d, _P);
      }
      // the transom: a flat plate that the water meets head on when going astern (it is dry, the flow leaves it, going ahead)
      const p0 = line[0], dt0 = p0.d + (p0.d - line[1].d) * 0.5;
      if (dt0 > 0) {
        const ht = Math.min(dt0, p0.top - p0.p.y);
        _P.set(p0.p.x, p0.p.y + ht * 0.5, this.zt).applyQuaternion(q).add(pos);
        pointVel(_P, _vp); const ua = -_vp.dot(fw);
        if (ua > 0) { _d.copy(fw).multiplyScalar(0.5 * RHO * 1.1 * ua * ua * p0.w * ht); addForce(_d, _P); }
      }
    }
    st.buoyFrac = clamp(buoy / (m * G), 0, 2); st.liftFrac = liftY / (m * G); st.wetArea = wetA;
    st.spray = clamp(spray / (m * G * 18), 0, 1);
    if (spray > 1) this.sprayAt.copy(spr).multiplyScalar(1 / spray);
    // 2) wave-making resistance, against the horizontal motion at the centre of buoyancy
    const res = st.res; res.pressure = rP; res.friction = rF; res.wave = 0;
    if (buoy > 0 && vh > 0.05) {
      const Rw = res.wave = buoy * curve(CW, Fn);
      _P.set(cbx / buoy, cby / buoy, cbz / buoy);
      _d.set(-this.vel.x / vh * Rw, 0, -this.vel.z / vh * Rw); addForce(_d, _P);
    }
    // 3) engines, propellers and gearcases
    this.motorsStep(dt, world, lvl, addForce, pointVel);
    // 4) air drag (above the centre of mass)
    _u.copy(this.vel).sub(this.wind); const va = _u.length();
    res.air = 0;
    if (va > 0.1) { _P.copy(up).multiplyScalar(0.5).add(pos); _d.copy(_u).multiplyScalar(-0.5 * RHO_AIR * this.CdA * va); addForce(_d, _P); res.air = -_d.dot(fw); }
    // 5) the ground: shallows, rocks, the beach
    this.ground(dt, world, addForce, pointVel);
    // integrate (the added mass slows heave, pitch and roll)
    st.addedMass = ma;
    this.vel.x += F.x * dt / m; this.vel.y += F.y * dt / (m + ma); this.vel.z += F.z * dt / m;
    _a.copy(T).applyQuaternionInv(q); _a.set(_a.x / (this.I.x + iax), _a.y / this.I.y, _a.z / (this.I.z + iaz)).applyQuaternion(q);
    this.w.addScaledVector(_a, dt).multiplyScalar(1 - 0.02 * dt);
    pos.addScaledVector(this.vel, dt);
    q.integrate(this.w, dt);
    this.collide(world);
    // what the game shows
    this.updateAxes();
    st.speed = this.speed; st.knots = Math.abs(st.speed) / KNOT; st.rpm = this.rpm;
    st.trim = Math.asin(clamp(fw.y, -1, 1)) / D2R; st.roll = Math.asin(clamp(lf.y, -1, 1)) / D2R;
    st.heading = ((Math.atan2(fw.x, -fw.z) / D2R) + 360) % 360;
    st.onPlane = st.onPlane ? st.liftFrac > 0.3 && Fn > 0.85 : st.liftFrac > 0.4 && Fn > 0.95;
    st.propOut = this.motors.some(M => M.vent > 0.5 || M.im < 0.3);
    st.depth = base - world.height(pos.x, pos.z);
    if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(q.w) || !isFinite(this.w.x)) { this.reset(0, 0, 0, 0); this.blewUp = true; }
  }

  // the outboards: rpm, thrust and torque from the propeller curves; steering, trim and the gearcase as a rudder
  motorsStep(dt, world, lvl, addForce, pointVel) {
    const st = this.state, e = this.eng, dr = this.drive, pr = this.prop, D = pr.D, q = this.q, pos = this.pos;
    const sd = Math.sin(st.steer), cd = Math.cos(st.steer), sp = Math.sin(st.trimA), cp = Math.cos(st.trimA);
    // thrust direction (body): forward, turned by the steering (bow left → thrust to the right) and tilted down by trimming out
    _tw.set(-sd * cp, -sp, cd * cp).applyQuaternion(q);
    let thrust = 0, load = 0; st.res.gearcase = 0;
    for (const M of this.motors) {
      // the propeller: the leg hangs from the pivot on the transom, swings aft and up when trimmed out and sideways when steered
      const h = dr.pivot + dr.depth, a = dr.aft, ly = -h * cp + a * sp, lz = -h * sp - a * cp;
      _P.set(M.x - lz * sd, this.keel + dr.pivot + ly, this.zt + lz * cd).applyQuaternion(q).add(pos);
      M.P.copy(_P);
      const wl = lvl(_P.x, _P.z), depth = wl - _P.y;
      M.im = clamp(depth / D + 0.5, 0, 1);
      // ventilation: near the surface the blades suck air down and lose their grip on the water; it takes a while to clear
      const ventT = 1 - smoothstep(0.4, 0.9, M.im);
      M.vent += (ventT - M.vent) * (1 - Math.exp(-dt / (ventT > M.vent ? 0.03 : 0.5)));
      if (this.state.propStrike) M.vent = Math.max(M.vent, 0.6);
      pointVel(_P, _vp);
      const Va = _vp.dot(_tw) * (1 - pr.wake), sg = st.gear, n = M.omega / e.gear / (2 * Math.PI);
      let T = 0, Q = 0;
      if (sg !== 0) {
        // reverse runs the propeller backwards: the same curves for the reversed flow, with less thrust
        const Vr = sg > 0 ? Va : -Va, ne = Math.max(n, Math.abs(Vr) / (2.2 * D), 1e-3), J = Vr / (ne * D), x = J / pr.r;
        const k = (1 - 0.9 * M.vent) * Math.pow(M.im, 1.2), kq = (1 - 0.85 * M.vent) * Math.pow(M.im, 1.2);
        T = RHO * ne * ne * D ** 4 * pr.r * ktB(x) * k * (sg > 0 ? 1 : -0.7);
        Q = RHO * ne * ne * D ** 5 * pr.r * pr.r * kqB(x) * kq * (sg > 0 ? 1 : 0.8);
        M.slip = 1 - J / (pr.r * 1.2);
      }
      // the engine: throttle, idle governor and rev limiter against the propeller torque
      let th = st.thr;
      if (M.omega < e.idle) th = Math.max(th, clamp((e.idle - M.omega) / (e.idle * 0.15), 0, 0.4));
      if (M.omega > e.lim) th = 0;
      const x = M.omega / e.rated, Tm = e.Tpk * curve(ENGINE, x), fr = e.Tpk * (0.04 + 0.16 * x * x);   // friction and, throttle closed, pumping losses
      const Te = th * Tm - fr * (1 - th * 0.9);
      M.omega = Math.max(e.idle * 0.4, M.omega + (Te - Q / (e.gear * e.eff)) * dt / e.I);
      M.T = T; M.Q = Q; M.angle = (M.angle + Math.sign(sg) * M.omega / e.gear * dt) % (2 * Math.PI);   // for the renderer
      _d.copy(_tw).multiplyScalar(T); addForce(_d, _P);
      thrust += T;
      // the gearcase and skeg: a small vertical foil turned with the engine
      _P.addScaledVector(this.up, 0.1);
      const fin = dr.fin * clamp((wl - _P.y) / (D * 1.2) + 0.5, 0, 1);
      if (fin > 0) {
        pointVel(_P, _vp);
        _c.set(-sd, 0, cd).applyQuaternion(q); _n.set(cd, 0, sd).applyQuaternion(q);
        const uc = _vp.dot(_c), un = _vp.dot(_n), u2 = uc * uc + un * un, al = Math.atan2(un, Math.abs(uc) + 0.3);
        const CL = GC_CL * Math.tanh(2.5 * al / GC_CL);   // ventilates near the surface: low maximum lift
        _d.copy(_n).multiplyScalar(-0.5 * RHO * fin * u2 * CL); load += Math.abs(0.5 * RHO * fin * u2 * CL) * 0.1;
        _d.addScaledVector(_c, -0.5 * RHO * (dr.cd * fin / dr.fin + fin * CL * CL / (Math.PI * 1.5)) * Math.abs(uc) * uc);
        addForce(_d, _P); st.res.gearcase -= _d.dot(this.fw);
      }
    }
    st.thrust = thrust; st.steerLoad = load;
  }

  // shallows and the shore: the hull slides on the ground with friction and stops; something steep (a quay, a pier deck seen from
  // the side, a cliff) is a wall that takes the speed out of the hull at that point
  ground(dt, world, addForce, pointVel) {
    const st = this.state, q = this.q, pos = this.pos, m = this.m, N = this.hullPts.length + this.motors.length;
    const nPrev = st.contacts || 0;
    st.grounded = false; st.propStrike = false; st.contacts = 0;
    // cheap test first: deep water under the bow, the middle and the stern
    let near = false;
    for (const z of [this.zt, this.zt + this.L / 2, this.zt + this.L]) {
      _P.set(0, this.keel, z).applyQuaternion(q).add(pos);
      if (world.height(_P.x, _P.z) > _P.y - 8) { near = true; break; }
    }
    if (!near) { this.freePos.copy(pos); return; }
    if (world.height(pos.x, pos.z) < pos.y + this.keel - 0.3) this.freePos.copy(pos);
    // friction that can stop the sliding at each touching point within a step (the mass shared among the points that touched
    // last step), up to the Coulomb limit: the hull stops and stays put on a slope
    const k = m * 3000 / N, c = m * 60 / N, ct = 0.5 * m / Math.max(1, nPrev) / dt;
    const pts = this.hullPts;
    for (let i = 0; i < pts.length + this.motors.length; i++) {
      const skeg = i >= pts.length;
      if (skeg) _P.copy(this.motors[i - pts.length].P).addScaledVector(this.up, -this.prop.D * 0.45);
      else _P.copy(pts[i]).applyQuaternion(q).add(pos);
      const h = world.height(_P.x, _P.z), pen = h - _P.y;
      if (pen <= 0) continue;
      st.contacts++;
      st.grounded = true; if (skeg) st.propStrike = true;
      world.normal(_P.x, _P.z, _n); pointVel(_P, _vp);
      if (pen > 0.35) {
        // deep in at once: a wall (a quay, a cliff, a pier deck seen from the side). Back towards where the hull was last over
        // open water: push it out a little each step, and stop the point's motion into the wall with a bounce and friction, so
        // the bow cannot ride up the face
        _n.set(this.freePos.x - _P.x, 0, this.freePos.z - _P.z); let l = _n.length();
        if (l < 0.5) { _n.set(pos.x - _P.x, 0, pos.z - _P.z); l = _n.length(); }
        if (l < 0.05) continue; _n.multiplyScalar(1 / l);
        pos.x += _n.x * 0.01; pos.z += _n.z * 0.01;
        // (the blow acts about level with the centre of mass, as with the colliders: a hull meeting a quay stops or swings
        // round, it does not cartwheel off a point at the stem)
        _P.y = pos.y + this.keel * 0.3;
        const j = this.impulse(_P, _n, 0.15, 0.4);
        if (j > m * 0.3) this.lastHit = { j, x: _P.x, z: _P.z, nx: _n.x, nz: _n.z, push: 0, t: st.time, c: { kind: 'shore' } };
        continue;
      }
      const vn = _vp.dot(_n), Nf = Math.max(0, k * Math.min(pen, 0.4) - (vn < 0 ? c * vn : 0));
      _b.copy(_vp).addScaledVector(_n, -vn); const tl = _b.length();
      const mu = (SURF_PROPS[world.surface(_P.x, _P.z)] || SURF_PROPS[0])[0] * 0.55;
      const ft = Math.min(tl * ct, mu * Nf);
      _d.copy(_b).multiplyScalar(tl > 1e-6 ? -ft / tl : 0).addScaledVector(_n, Nf);
      addForce(_d, _P);
    }
  }

  // an impulse at point P along n (into the boat) that stops the motion into n there; e: bounce, mu: friction,
  // im: 1 / mass of the other body (0 when it is fixed)
  impulse(P, n, e, mu, im = 0) {
    _r.subVectors(P, this.pos); _vp.crossVectors(this.w, _r).add(this.vel);
    const vn = _vp.dot(n); if (vn >= 0) return 0;
    const q = this.q, rn = _c.crossVectors(_r, n), Iw = _a.copy(rn).applyQuaternionInv(q);
    Iw.set(Iw.x / this.I.x, Iw.y / this.I.y, Iw.z / this.I.z).applyQuaternion(q);
    const k = 1 / this.m + im + _b.crossVectors(Iw, _r).dot(n), j = -(1 + e) * vn / k;
    _d.copy(n).multiplyScalar(j);
    // friction: at most what stops the sliding at this point (with the effective mass along the slide, which is much less than
    // the boat's mass out at the bow), so it never flicks the hull round
    _t.copy(_vp).addScaledVector(n, -vn); const tl = _t.length();
    if (tl > 1e-4) {
      _t.multiplyScalar(1 / tl); _c.crossVectors(_r, _t); _a.copy(_c).applyQuaternionInv(q);
      _a.set(_a.x / this.I.x, _a.y / this.I.y, _a.z / this.I.z).applyQuaternion(q);
      const kt = 1 / this.m + im + _b.crossVectors(_a, _r).dot(_t);
      _d.addScaledVector(_t, -Math.min(mu * j, tl / kt));
    }
    this.vel.addScaledVector(_d, 1 / this.m);
    _c.crossVectors(_r, _d).applyQuaternionInv(q); _c.set(_c.x / this.I.x, _c.y / this.I.y, _c.z / this.I.z).applyQuaternion(q); this.w.add(_c);
    return j;
  }

  // piers, posts, buoys and other boats in world.colliders ({x,z,r} or {x,z,hw,hd,ang}, optional y0/y1, bounce, and mass for
  // something that floats free, like a buoy: then it takes its share of the push and the impulse, and lastHit says how far and
  // how hard to move it). The hull is its outline in the water plane (pointed bow, the engine at the stern), so a glancing blow
  // turns the boat away instead of stopping it.
  collide(world) {
    const B = this.box, pos = this.pos, list = world.colliders(pos.x, pos.z, B.hl + 3);
    if (!list || !list.length) return;
    const fw = this.fw, fl = Math.hypot(fw.x, fw.z) || 1, ux = fw.x / fl, uz = fw.z / fl, lx = uz, lz = -ux;
    const y0 = pos.y + B.y0, y1 = pos.y + B.y1, O = this.outline, n = O.length, X = this._ox || (this._ox = new Float64Array(n)), Z = this._oz || (this._oz = new Float64Array(n));
    for (let i = 0; i < n; i++) { X[i] = pos.x + O[i][0] * lx + O[i][1] * ux; Z[i] = pos.z + O[i][0] * lz + O[i][1] * uz; }
    for (const c of list) {
      if (c.y1 != null && c.y1 < y0) continue;
      if (c.y0 != null && c.y0 > y1) continue;
      let nx = 0, nz = 0, pen = 0, px = 0, pz = 0;
      if (c.r != null) {
        // circle against the outline: the nearest point on its edges (outward edge normals: the outline runs counter-clockwise
        // seen from above, so the outside of edge i is (dz, −dx))
        let best = 1e9, inside = true, ei = 0, bx = 0, bz = 0;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, ex = X[j] - X[i], ez = Z[j] - Z[i], L2 = ex * ex + ez * ez || 1;
          const t = clamp(((c.x - X[i]) * ex + (c.z - Z[i]) * ez) / L2, 0, 1), qx = X[i] + ex * t, qz = Z[i] + ez * t, d = Math.hypot(c.x - qx, c.z - qz);
          if ((c.x - X[i]) * ez - (c.z - Z[i]) * ex > 0) inside = false;
          if (d < best) { best = d; ei = i; bx = qx; bz = qz; }
        }
        if (!inside && best >= c.r) continue;
        if (inside) {
          const j = (ei + 1) % n, ex = X[j] - X[ei], ez = Z[j] - Z[ei], l = Math.hypot(ex, ez) || 1;
          nx = -ez / l; nz = ex / l; pen = best + c.r;              // push the boat back across its nearest edge
        } else { nx = (bx - c.x) / best; nz = (bz - c.z) / best; pen = c.r - best; }
        px = bx; pz = bz;
      } else {
        // box against the outline: separating axes (the outline's edge normals and the box's two axes)
        const cs = Math.cos(c.ang || 0), sn = Math.sin(c.ang || 0), a1x = cs, a1z = -sn, a2x = sn, a2z = cs;
        const CX = [], CZ = [];
        for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { CX.push(c.x + a1x * c.hw * sa + a2x * c.hd * sb); CZ.push(c.z + a1z * c.hw * sa + a2z * c.hd * sb); }
        let best = 1e9, fromBox = false, sep = false, mx = 0, mz = 0;
        for (let k = 0; k < n + 2 && !sep; k++) {
          let ax, az;
          if (k < n) { const j = (k + 1) % n, ex = X[j] - X[k], ez = Z[j] - Z[k], l = Math.hypot(ex, ez) || 1; ax = ez / l; az = -ex / l; }
          else if (k === n) { ax = a1x; az = a1z; } else { ax = a2x; az = a2z; }
          let p0 = 1e9, p1 = -1e9, q0 = 1e9, q1 = -1e9;
          for (let i = 0; i < n; i++) { const d = X[i] * ax + Z[i] * az; if (d < p0) p0 = d; if (d > p1) p1 = d; }
          for (let i = 0; i < 4; i++) { const d = CX[i] * ax + CZ[i] * az; if (d < q0) q0 = d; if (d > q1) q1 = d; }
          const o = Math.min(p1, q1) - Math.max(p0, q0);
          if (o <= 0) { sep = true; break; }
          if (o < best) { best = o; const sg = (p0 + p1) / 2 >= (q0 + q1) / 2 ? 1 : -1; mx = ax * sg; mz = az * sg; fromBox = k >= n; }
        }
        if (sep) continue;
        pen = best; nx = mx; nz = mz;
        // the contact: the middle of the outline's points inside the box and the box corners inside the outline (if none, two
        // edges cross: the outline's point deepest along the normal)
        let sx = 0, sz = 0, sc = 0;
        for (let i = 0; i < n; i++) { const dx = X[i] - c.x, dz = Z[i] - c.z; if (Math.abs(dx * a1x + dz * a1z) <= c.hw && Math.abs(dx * a2x + dz * a2z) <= c.hd) { sx += X[i]; sz += Z[i]; sc++; } }
        for (let k = 0; k < 4; k++) {
          let ins = true;
          for (let i = 0; i < n && ins; i++) { const j = (i + 1) % n; if ((CX[k] - X[i]) * (Z[j] - Z[i]) - (CZ[k] - Z[i]) * (X[j] - X[i]) > 0) ins = false; }
          if (ins) { sx += CX[k]; sz += CZ[k]; sc++; }
        }
        if (sc) { px = sx / sc; pz = sz / sc; }
        else { let md = 1e9; for (let i = 0; i < n; i++) { const d = X[i] * nx + Z[i] * nz; if (d < md) { md = d; px = X[i]; pz = Z[i]; } } }
      }
      const im = c.mass ? 1 / c.mass : 0, share = c.mass ? c.mass / (c.mass + this.m) : 1;
      pos.x += nx * pen * share; pos.z += nz * pen * share;
      for (let i = 0; i < n; i++) { X[i] += nx * pen * share; Z[i] += nz * pen * share; }
      _P.set(px, pos.y + this.keel * 0.3, pz); _n.set(nx, 0, nz);
      const j = this.impulse(_P, _n, c.bounce ?? 0.2, 0.3, im);
      if (j > 0 || share < 1) this.lastHit = { j, x: px, z: pz, nx, nz, push: pen * (1 - share), t: this.state.time, c };
    }
  }
}

// outboard torque against rpm (fraction of the rated rpm), as a fraction of the peak torque
const ENGINE = [[0, 0.4], [0.12, 0.5], [0.25, 0.64], [0.45, 0.83], [0.65, 0.97], [0.8, 1.0], [1.0, 0.94], [1.1, 0.8], [1.25, 0.5]];
