// Measures the boats on a test sea without a browser and compares them with real figures.
//   node tools/test-boat.mjs            all boats
//   node tools/test-boat.mjs motorbat   one boat
// The sea: still water level 0, a flat seabed at −20 m, and to the east a slope up to a sand beach (it leaves the water at x = 300);
// the autopilots use only the wheel and the throttle.
//
// Real figures to compare with (boat tests in magazines, makers' data):
//   6.5 m deep-V, ~1600 kg loaded, 150 hp outboard: 36–42 kn top speed at 5000–6000 rpm, on the plane in 3–5 s (planes at ~14–18 kn),
//     bow up 5–8° at the hump, 2–4° running trim, 0–30 kn in 7–9 s. Hard turn at speed: 0.6–0.9 g, radius 25–50 m, banks in 10–20°.
//   4 m aluminium dinghy, ~390 kg with two aboard, 20 hp tiller: 20–25 kn.
//   9 m offshore boat, ~3300 kg, 2 × 300 hp: 55–65 kn.
import { Boat, KNOT } from '../sim/physics/boat.js';
import { BOATS } from '../sim/data/boats.js';
import { SURF } from '../sim/physics/surfaces.js';
import { flatWorld } from '../sim/world/flat.js';
const DT = 1 / (+process.env.HZ || 240), only = process.argv[2];
const fmt = (v, d = 1, w = 6) => (v == null || !isFinite(v) ? '–' : v.toFixed(d)).padStart(w);
const beach = x => x < 150 ? -20 : x < 250 ? -20 + (x - 150) * 0.17 : Math.min(3, -3 + (x - 250) * 0.06);
const sea = (o = {}) => flatWorld({ height: (x, z) => beach(x), water: 0, surf: (x, z) => x > 240 ? SURF.SAND : SURF.SEABED, ...o });
function mk(spec, o = {}) { const w = o.world || sea(), b = new Boat(spec, { waveScale: o.waves ?? 0 }); b.place(w, o.x ?? -2000, o.z ?? 0, o.h ?? 0); for (let i = 0; i < 3 / DT; i++) b.step(DT, w); return [b, w]; }
const run = (b, w, t, f) => { for (let i = 0; i < t / DT; i++) { f && f(i * DT); b.step(DT, w); } };
const yawRate = b => b.w.dot(b.up);
// steer towards heading h (+1 = left), damped by the yaw rate
const holdHeading = (b, h, k = 2) => { const fx = b.fw.x, fz = b.fw.z, e = Math.atan2(Math.sin(h) * fz - Math.cos(h) * fx, Math.sin(h) * fx + Math.cos(h) * fz); b.input.steer = Math.max(-1, Math.min(1, k * e - 0.5 * yawRate(b))); };

// full throttle from rest: time to plane, the hump in trim, 0–30 kn, top speed, rpm and running trim
function accel(spec) {
  const [b, w] = mk(spec), s = b.state;
  const rest = { trim: s.trim, draft: b.draft };
  b.input.throttle = 1;
  let t = 0, tPlane = null, kPlane = 0, hump = -9, humpKt = 0, t30 = null, top = 0, last = 0;
  while (t < 90) {
    b.step(DT, w); t += DT;
    if (s.trim > hump) { hump = s.trim; humpKt = s.knots; }
    if (tPlane == null && s.onPlane) { tPlane = t; kPlane = s.knots; }
    if (t30 == null && s.knots >= 30) t30 = t;
    if (s.knots > top + 0.02) { top = s.knots; last = t; }
    if (t - last > 6) break;
  }
  return { ...rest, tPlane, kPlane, hump, humpKt, t30, top, rpm: s.rpm, run: s.trim, slip: b.motors[0].slip, res: { ...s.res } };
}
// steady turn: full throttle straight, then the wheel at `steer`; the last 4 s give radius, speed, bank and sideslip
function turn(spec, thr, steer, settle = 12) {
  const [b, w] = mk(spec), s = b.state;
  b.input.throttle = thr; run(b, w, 30);
  b.input.steer = steer;
  // lateral acceleration: the change of the velocity across the track (smoothed over 0.1 s)
  let maxG = 0, vx = b.vel.x, vz = b.vel.z, k = 0;
  run(b, w, settle, () => { if (++k % Math.round(0.1 / DT)) return; const V = Math.hypot(b.vel.x, b.vel.z) || 1, a = ((b.vel.x - vx) * -b.vel.z + (b.vel.z - vz) * b.vel.x) / V / 0.1; maxG = Math.max(maxG, Math.abs(a) / 9.81); vx = b.vel.x; vz = b.vel.z; });
  let R = 0, kt = 0, roll = 0, slip = 0, n = 0;
  run(b, w, 4, () => { const V = Math.hypot(b.vel.x, b.vel.z); R += V / Math.max(1e-3, Math.abs(yawRate(b))); kt += s.knots; roll += s.roll; slip += Math.atan2(b.vel.dot(b.lf), b.vel.dot(b.fw)); n++; });
  return { R: R / n, kt: kt / n, roll: roll / n, slip: slip / n * 57.3, maxG, g: (kt / n * KNOT) ** 2 / (R / n) / 9.81 };
}
// full astern from rest
function reverse(spec) { const [b, w] = mk(spec); b.input.throttle = -1; run(b, w, 15); return { kt: b.speed / KNOT, rpm: b.state.rpm }; }

// a buoy race: 8 buoys on an ellipse 600 m × 360 m (about 1.5 km round), passed on the outside; an autopilot with the normal
// controls (wheel and throttle) steers for a point 15 m outside the next buoy. Lap time from a flying start.
function buoyRace(spec, waves = 0) {
  const A = 300, Bz = 180, N = 8, buoys = [];
  for (let k = 0; k < N; k++) { const th = 2 * Math.PI * k / N; buoys.push({ x: A * Math.cos(th), z: Bz * Math.sin(th), th }); }
  const out = k => { const p = buoys[k], nx = p.x / (A * A), nz = p.z / (Bz * Bz), l = Math.hypot(nx, nz); return { x: p.x + nx / l * 15, z: p.z + nz / l * 15 }; };
  const w = flatWorld({ height: () => -20, water: 0, surf: SURF.SEABED });
  const b = new Boat(spec, { waveScale: waves }), s = b.state;
  b.place(w, A + 15, -120, 0);           // heading south (+z) towards buoy 2 side… the first target is buoy 1
  let next = 1, laps = [], tLap = null, t = 0, prevTh = Math.atan2(b.pos.z / Bz, b.pos.x / A), unwrap = prevTh, passed = 0, kt = 0, n = 0, minUp = 1;
  b.input.throttle = 1;
  while (t < 400 && laps.length < 2) {
    const tg = out(next), dx = tg.x - b.pos.x, dz = tg.z - b.pos.z, fx = b.fw.x, fz = b.fw.z;
    const e = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);          // > 0: the target is to the left
    b.input.steer = Math.max(-1, Math.min(1, 1.6 * e - 0.35 * yawRate(b)));
    b.input.throttle = Math.abs(e) > 1.2 ? 0.75 : 1;
    b.step(DT, w); t += DT; minUp = Math.min(minUp, b.up.y);
    // passing a buoy: our angle round the middle of the course goes past the buoy's angle
    const th = Math.atan2(b.pos.z / Bz, b.pos.x / A); let d = th - prevTh; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; unwrap += d; prevTh = th;
    const want = buoys[next].th + 2 * Math.PI * Math.floor(passed / N) + (next === 0 ? 2 * Math.PI : 0);
    if (unwrap >= want) {
      passed++;
      if (next === 0) { if (tLap != null) laps.push(t - tLap); tLap = t; }
      next = (next + 1) % N;
    }
    if (tLap != null) { kt += s.knots; n++; }
  }
  return { lap: laps[laps.length - 1], avg: n ? kt / n : null, minUp };
}

// waves (waveScale 1.5): full throttle into, along and across the main wave, then drifting; is it ever upside down?
function waves(spec, ws = 1.5) {
  const into = Math.atan2(-1, -0.35), r = {};
  for (const [name, h, thr] of [['into', into, 1], ['follow', into + Math.PI, 1], ['beam', into + Math.PI / 2, 1], ['drift', into + Math.PI / 2, 0]]) {
    const [b, w] = mk(spec, { waves: ws, h }), s = b.state;
    b.input.throttle = thr;
    let roll = 0, pitch = 0, minUp = 1, g = 0, kt = 0, n = 0;
    for (let i = 0; i < 60 / DT; i++) {
      holdHeading(b, h); const vy = b.vel.y; b.step(DT, w);
      if (i * DT > 15) { roll = Math.max(roll, Math.abs(s.roll)); pitch = Math.max(pitch, Math.abs(s.trim)); minUp = Math.min(minUp, b.up.y); g = Math.max(g, Math.abs(b.vel.y - vy) / DT / 9.81); kt += s.knots; n++; }
    }
    r[name] = { roll, pitch, minUp, g, kt: kt / n, nan: b.blewUp };
  }
  return r;
}
// run aground on the sand beach at full speed; then throttle off. It must stop, stay put and stay finite
function ground(spec) {
  const [b, w] = mk(spec, { x: 0, h: Math.PI / 2 }), s = b.state;
  b.input.throttle = 1;
  let t = 0, tg = null, xg = 0, kg = 0, maxDec = 0, maxY = -9, nan = false, propOut = false;
  while (t < 70) {
    const vx = b.vel.x; b.step(DT, w); t += DT;
    if (!isFinite(b.pos.x) || b.blewUp) nan = true;
    if (s.grounded && tg == null) { tg = t; xg = b.pos.x; kg = s.knots; }
    if (tg != null) { maxDec = Math.max(maxDec, (vx - b.vel.x) / DT / 9.81); maxY = Math.max(maxY, b.pos.y); propOut ||= s.propOut; if (t - tg > 4) b.input.throttle = 0; if (t - tg > 25) break; }
  }
  const x1 = b.pos.x; run(b, w, 10);
  return { kt: kg, slid: x1 - xg, creep: Math.abs(b.pos.x - x1), dec: maxDec, height: maxY, ground: beach(b.pos.x), nan, propOut, rest: b.vel.length() };
}
// a moored buoy just off the track (a glancing blow), then a pier across it (head on)
function collide(spec) {
  const cols = [{ x: 1.3, z: 80, r: 0.6, kind: 'buoy' }, { x: 0, z: 170, hw: 8, hd: 1.5, ang: 0, kind: 'pier' }];
  const w = flatWorld({ height: () => -20, water: 0, surf: SURF.SEABED, colliders: cols });
  const b = new Boat(spec, { waveScale: 0 }); b.place(w, 0, 0, 0);
  b.input.throttle = 0.35;
  const hits = {}; let nan = false;
  for (let i = 0; i < 60 / DT; i++) {
    const h0 = b.lastHit, v0 = b.speed; holdHeading(b, 0); b.step(DT, w);
    if (b.lastHit && b.lastHit !== h0 && !hits[b.lastHit.c.kind]) hits[b.lastHit.c.kind] = { kt: v0 / KNOT, after: b.speed / KNOT, j: b.lastHit.j };
    if (!isFinite(b.pos.x) || b.blewUp) nan = true;
  }
  return { hits, nan, z: b.pos.z };
}
// full throttle into a quay (the ground jumps from −20 m to 2 m over the water): it must stop there, upright and finite
function quay(spec) {
  const w = flatWorld({ height: (x, z) => z < 600 ? -20 : 2, water: 0, surf: SURF.ROCK });
  const b = new Boat(spec, { waveScale: 0 }); b.place(w, 0, 0, 0); b.input.throttle = 1;
  let t = 0, kt = null, tHit = 0, minUp = 1, nan = false;
  while (t < 90) {
    const v = b.speed; b.step(DT, w); t += DT;
    if (!isFinite(b.pos.x) || b.blewUp) nan = true;
    if (kt == null && b.state.grounded) { kt = v / KNOT; tHit = t; }
    if (kt != null) { minUp = Math.min(minUp, b.up.y); if (t - tHit > 4) b.input.throttle = 0; if (t - tHit > 10) break; }
  }
  return { kt, after: b.speed / KNOT, minUp, nan };
}

const list = BOATS.filter(s => !only || s.id === only);
console.log('\nAcceleration from rest, full throttle (calm water)');
console.log('boat'.padEnd(10), ' draft', ' restT', ' plane', '   @kn', '  hump', '   @kn', ' 0-30kn', '   top', '   rpm', '  trim', '  slip', ' | resistance at top speed (N): friction pressure wave air gearcase');
const acc = {};
for (const spec of list) {
  const a = acc[spec.id] = accel(spec), r = a.res;
  console.log(spec.id.padEnd(10), fmt(a.draft, 2), fmt(a.trim), fmt(a.tPlane), fmt(a.kPlane), fmt(a.hump), fmt(a.humpKt), fmt(a.t30, 1, 7), fmt(a.top), fmt(a.rpm, 0), fmt(a.run), fmt(a.slip * 100, 0),
    ' |', [r.friction, r.pressure, r.wave, r.air, r.gearcase].map(v => fmt(v, 0)).join(''));
}
console.log('\nTurning (radius m, speed kn, bank ° (− = into a left turn), sideslip °, lateral g; peak g in the first seconds), astern');
console.log('boat'.padEnd(10), '| half wheel at full throttle         | full lock at full throttle               | full lock, slow       | astern');
console.log(''.padEnd(10), '|     R    kn  bank  slip     g |     R    kn  bank  slip     g  peak |     R  (len)    kn |    kn   rpm');
for (const spec of list) {
  const h = turn(spec, 1, 0.5), f = turn(spec, 1, 1), sl = turn(spec, 0.12, 1, 20), rv = reverse(spec);
  console.log(spec.id.padEnd(10), '|', fmt(h.R, 0), fmt(h.kt), fmt(h.roll), fmt(h.slip), fmt(h.g, 2), '|', fmt(f.R, 0), fmt(f.kt), fmt(f.roll), fmt(f.slip), fmt(f.g, 2), fmt(f.maxG, 2), '|',
    fmt(sl.R, 0), fmt(sl.R / (spec.L || spec.hull.L), 1), fmt(sl.kt), '|', fmt(rv.kt), fmt(rv.rpm, 0));
}
console.log('\nBuoy race (8 buoys, ~1.6 km lap, autopilot), waves at waveScale 1.5 (worst roll/pitch °, worst vertical g, mean kn), grounding, collisions');
console.log('boat'.padEnd(10), '|   lap s   mean kn | into: kn roll pitch    g | follow: kn roll   g | beam: kn roll | drift roll pitch | flip | aground: kn  slid  creep  dec g  NaN | buoy kn→kn  pier kn→kn | quay kn→kn upright');
for (const spec of list) {
  const br = buoyRace(spec), wv = waves(spec), gr = ground(spec), co = collide(spec), qu = quay(spec);
  const flip = Object.values(wv).some(r => r.minUp < 0 || r.nan) || br.minUp < 0;
  const hb = co.hits.buoy, hp = co.hits.pier;
  console.log(spec.id.padEnd(10), '|', fmt(br.lap, 1, 7), fmt(br.avg, 1, 9), '|', fmt(wv.into.kt, 1, 8), fmt(wv.into.roll, 0, 5), fmt(wv.into.pitch, 0, 6), fmt(wv.into.g, 1, 5), '|', fmt(wv.follow.kt, 1, 10), fmt(wv.follow.roll, 0, 5), fmt(wv.follow.g, 1, 4), '|',
    fmt(wv.beam.kt, 1, 8), fmt(wv.beam.roll, 0, 5), '|', fmt(wv.drift.roll, 0, 10), fmt(wv.drift.pitch, 0, 6), '|', flip ? '  YES' : '   no', '|',
    fmt(gr.kt, 1, 11), fmt(gr.slid, 0, 6), fmt(gr.creep, 2, 7), fmt(gr.dec, 2, 7), gr.nan || co.nan ? '  NaN' : '   ok', '|',
    hb ? `${fmt(hb.kt, 1, 7)}→${fmt(hb.after, 1, 4)}` : '    no hit', hp ? `${fmt(hp.kt, 1, 6)}→${fmt(hp.after, 1, 4)}` : '   no hit', '|',
    `${fmt(qu.kt, 1, 7)}→${fmt(qu.after, 1, 4)}`, qu.minUp > 0.5 && !qu.nan ? '     yes' : '      NO');
}
