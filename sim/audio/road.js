// What the wheels and the air make: tyre squeal, rolling noise per ground surface, water, wind, ABS and tread hum.
// Every layer is a looping source (noise, grains or a pulse oscillator) through fixed filters into a gain the frame sets;
// a layer is only connected while it is heard. Sudden load on a wheel, wheels entering water and stones off the tyres
// come back as one-shots through emit().
import { SURF } from '../physics/surfaces.js';
import { clamp, smooth, setp, gain, filt, chain, loop, wobble, Gate } from './synth.js';

const S = SURF;
// the layers and how each ground surface uses them
//            hiss  roar  rumble crunch snow  mud  swish stones planks
const MIX = [];
MIX[S.ASPHALT] = [1.0, 1.0, 0, 0, 0, 0, 0, 0, 0];
MIX[S.CONCRETE] = [1.2, 1.1, 0, 0, 0, 0, 0, 0, 0];
MIX[S.GRAVEL] = [0, 0.3, 0.6, 1.0, 0, 0, 0, 0, 0];
MIX[S.DIRT] = [0, 0.2, 1.0, 0.25, 0, 0, 0, 0, 0];
MIX[S.GRASS] = [0, 0, 0.7, 0, 0, 0, 1.0, 0, 0];
MIX[S.SAND] = [0, 0, 0.6, 0.15, 0, 0, 0.5, 0, 0];
MIX[S.MUD] = [0, 0, 0.5, 0, 0, 1.0, 0, 0, 0];
MIX[S.BOG] = [0, 0, 0.3, 0, 0, 1.2, 0.3, 0, 0];
MIX[S.SNOW] = [0, 0, 0.3, 0, 1.0, 0, 0, 0, 0];
MIX[S.ICE] = [0.35, 0.4, 0, 0, 0.1, 0, 0, 0, 0];
MIX[S.ROCK] = [0.4, 0.9, 0, 0.2, 0, 0, 0, 0.5, 0];
MIX[S.WOOD] = [0.2, 0.4, 0, 0, 0, 0, 0, 0, 1.0];
MIX[S.FOREST] = [0, 0, 0.8, 0.2, 0, 0, 0.5, 0, 0];
MIX[S.FIELD] = [0, 0, 0.9, 0, 0, 0, 0.6, 0, 0];
MIX[S.ASH] = [0, 0, 0.6, 0.6, 0, 0, 0.3, 0, 0];
MIX[S.LAVA] = [0, 0.8, 0, 0.4, 0, 0, 0, 0.6, 0];
MIX[S.SEABED] = [0, 0, 0.7, 0, 0, 0.3, 0, 0, 0];
MIX[S.COBBLE] = [0.5, 0.8, 0, 0, 0, 0, 0, 1.0, 0];
// level of each layer against the rolling speed (m/s), its gain, and how much of it is heard outside / inside the cabin
const LEVEL = [
  a => Math.min(1.5, Math.pow(a / 30, 1.4)), a => Math.min(1.5, Math.pow(a / 30, 1.1)), a => Math.min(1.5, a / 15),
  a => smooth(0, 3, a) * Math.min(1.6, 0.3 + a / 15), a => smooth(0, 3, a) * Math.min(1.6, 0.3 + a / 15), a => smooth(0, 1.5, a) * Math.min(1.6, 0.4 + a / 10),
  a => Math.min(1.3, a / 15), a => Math.min(1.5, a / 12), a => smooth(0.3, 2, a) * Math.min(1.5, 0.5 + a / 15),
];
const LG = [0.17, 0.28, 0.3, 0.55, 0.25, 0.1, 0.06, 0.7, 0.6];
const EXT = [1, 0.45, 0.6, 1, 1, 1, 1, 0.8, 1], INT = [0.45, 1, 1, 0.6, 0.6, 0.8, 0.4, 1, 1];
const HARD = new Set([S.ASPHALT, S.CONCRETE, S.COBBLE]);           // where tyres squeal
const SQUEAL = { sport: 1.12, sommer: 1, vinter: 0.95, pigg: 0.95, at: 0.9, mt: 0.85, monster: 0.6 };
const LUGS = { at: [40, 0.5], mt: [28, 1], monster: [18, 1.6] };    // tread blocks round the tyre, hum level

export class Road {
  constructor(ac, out, B) {
    this.ac = ac;
    const lay = (src, ...f) => { const g = gain(ac, 0); chain(src, ...f, g); return { g, gate: new Gate(g, out), src }; };
    // pulse train (thumps from stones or planks): narrow pulses as a periodic wave
    const pw = (() => { const H = 32, re = new Float32Array(H + 1), im = new Float32Array(H + 1); for (let k = 1; k <= H; k++) re[k] = 1 - k / (H + 2); return ac.createPeriodicWave(re, im); })();
    const pulse = () => { const o = ac.createOscillator(); o.setPeriodicWave(pw); o.frequency.value = 10; o.start(); return o; };
    this.hissF = filt(ac, 'bandpass', 900, 0.5); this.roarF = filt(ac, 'lowpass', 200, 0.7);
    this.st = pulse(); this.pl = pulse();
    const stJ = gain(ac, 0); chain(wobble(ac, B.white, 14), stJ); stJ.connect(this.st.frequency); this.stJ = stJ;
    const plJ = gain(ac, 0); chain(wobble(ac, B.white, 6), plJ); plJ.connect(this.pl.frequency); this.plJ = plJ;
    const planks = gain(ac, 1); chain(this.pl, filt(ac, 'bandpass', 170, 3), planks); chain(this.pl, filt(ac, 'bandpass', 620, 2), gain(ac, 0.4), planks);
    this.L = [
      lay(loop(ac, B.white), this.hissF),                                                     // hiss: tyres on smooth tarmac
      lay(loop(ac, B.brown), this.roarF),                                                      // roar: the road through the suspension
      lay(loop(ac, B.brown), filt(ac, 'lowpass', 150, 1), filt(ac, 'peaking', 60, 1, 4)),      // rumble: soft ground
      lay(loop(ac, B.gravel), filt(ac, 'bandpass', 2200, 0.5), filt(ac, 'lowshelf', 400, 0.7, 4)),   // crunch: gravel
      lay(loop(ac, B.snow), filt(ac, 'bandpass', 1500, 0.6)),                                  // snow: crunch and squeak
      lay(loop(ac, B.mud), filt(ac, 'lowpass', 1400, 0.7)),                                     // mud: squelch and slurp
      lay(loop(ac, B.white), filt(ac, 'bandpass', 3500, 0.7)),                                  // swish: grass on the tyres and underbody
      lay(this.st, filt(ac, 'bandpass', 110, 1.4), filt(ac, 'peaking', 320, 2, 6)),             // stones: cobbles and rock
      lay(planks),                                                                              // planks: a wooden bridge
    ];
    // water: splashing round the wheels (noise, chopped by a fast random wobble)
    this.wAm = gain(ac, 0.5); this.wF = filt(ac, 'bandpass', 900, 0.8);
    const wm = gain(ac, 0.6); chain(wobble(ac, B.white, 7), wm); wm.connect(this.wAm.gain);
    this.water = lay(loop(ac, B.white), this.wF, this.wAm);
    // tyre squeal, front and rear axle: a sawtooth with a quick random vibrato and a narrow band of noise
    this.sq = [0, 1].map(i => {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 1000;
      const fm = gain(ac, 30); chain(wobble(ac, B.white, 24 + i * 7), fm); fm.connect(o.frequency);
      const bp = filt(ac, 'bandpass', 1000, 14), l = lay(o, filt(ac, 'lowpass', 2600, 0.7));
      chain(loop(ac, B.white), bp, gain(ac, 0.8), l.g); o.start();
      return Object.assign(l, { o, fm, bp, f: 1000, w: 0 });
    });
    // wind past the body, and a whistle round the mirrors at speed (inside)
    this.windF = filt(ac, 'bandpass', 400, 0.5);
    this.wind = lay(loop(ac, B.pink), this.windF);
    this.whistle = lay(loop(ac, B.white), filt(ac, 'bandpass', 2300, 9));
    // ABS: the valve block chattering ~15 times a second
    const absAm = gain(ac, 0.5), sq = ac.createOscillator(); sq.type = 'square'; sq.frequency.value = 15; const d = gain(ac, 0.5); chain(sq, d); d.connect(absAm.gain); sq.start();
    this.abs = lay(loop(ac, B.brown), filt(ac, 'bandpass', 230, 1.3), absAm);
    // tread hum of chunky offroad tyres
    this.hum = ac.createOscillator(); this.hum.type = 'triangle'; this.hum.start();
    this.humL = lay(this.hum, filt(ac, 'bandpass', 400, 1.5));
    this.acc = new Float64Array(9); this.fz = []; this.air = []; this.wet = []; this.cool = []; this.splashT = -9; this.depth = -1;
  }
  update(t, dt, car, env, inside, emit) {
    const W = car.wheels || [], v = Math.abs(car.speed || 0), acc = this.acc.fill(0), st = car.state || {};
    const sq = [0, 0], sqV = [0, 0];
    let water = 0, hard = 0, om = 0, act = 0, nC = 0, crunch = 0, spin = 0;
    for (let i = 0; i < W.length; i++) {
      const w = W[i], Fz0 = w.Fz0 || 4000, ax = w.front === false || i >= 2 ? 1 : 0;
      // thumps: a sudden rise in the load on a wheel (a kerb, a pothole, a landing)
      const dF = (w.Fz - (this.fz[i] ?? w.Fz)) / Fz0; this.fz[i] = w.Fz;
      this.cool[i] = (this.cool[i] || 0) - dt;
      if (w.contact && dF / Math.max(dt, 1 / 120) > 35 && this.cool[i] <= 0) {       // (a hard stop's nose dive stays under ~25/s)
        const I = clamp((dF / Math.max(dt, 1 / 120) - 35) / 90, 0.05, 1) * (this.air[i] > 0.3 ? 1.5 : 1);
        emit('thump', { size: Math.min(1, I), inside }); this.cool[i] = 0.12;
      }
      this.air[i] = w.contact ? 0 : (this.air[i] || 0) + dt;
      // wheels going into water
      const wet = w.wd > 0.03;
      if (wet && !this.wet[i] && Math.abs(w.vLong ?? v) > 2 && t - this.splashT > 0.25) { this.splashT = t; emit('splash', { size: clamp(Math.abs(w.vLong ?? v) * Math.min(w.wd, 0.5) / 4, 0.1, 0.8) }); }
      this.wet[i] = wet;
      if (!w.contact) continue;
      nC++;
      const vr = Math.abs(w.vLong ?? car.speed ?? 0), sv = w.slipV || 0, a = vr + 0.8 * sv, m = MIX[w.surf] || MIX[0];
      act += a; om += Math.abs(w.omega || 0); spin += sv;
      for (let k = 0; k < 9; k++) if (m[k]) acc[k] += 0.25 * m[k] * LEVEL[k](a);
      crunch += 0.25 * m[3] * a;
      if (car.tyre === 'pigg' && HARD.has(w.surf)) acc[3] += 0.25 * 0.25 * LEVEL[3](a);   // studs ticking on tarmac
      if (HARD.has(w.surf)) {
        hard += 0.25;
        const s = smooth(0.75, 1.7, w.slip || 0) * smooth(0.8, 3.5, sv) * clamp(w.Fz / Fz0, 0.15, 1.8);
        sq[ax] += 0.5 * s; sqV[ax] = Math.max(sqV[ax], sv);
      }
      if (w.wd > 0) water += 0.25 * Math.min(1, w.wd / 0.4) * smooth(0.3, 6, a);
    }
    const va = nC ? act / nC : 0, k = i => LG[i] * (EXT[i] + (INT[i] - EXT[i]) * inside);
    for (let i = 0; i < 9; i++) { const g = acc[i] * k(i); this.L[i].gate.set(g > 1e-4, dt); setp(this.L[i].g.gain, g, t, 0.08); }
    const rate = clamp(0.6 + va / 14, 0.5, 1.8);
    for (const i of [3, 4, 5]) setp(this.L[i].src.playbackRate, rate, t, 0.1);
    setp(this.hissF.frequency, 700 + 18 * va, t, 0.2); setp(this.roarF.frequency, 120 + 6 * va, t, 0.2);
    const vs = W.length ? Math.min(va, 40) : 0;
    setp(this.st.frequency, Math.max(0.5, vs / 0.12), t, 0.05); setp(this.stJ.gain, vs / 0.12 * 0.25, t, 0.1);
    setp(this.pl.frequency, Math.max(0.5, vs / 0.15), t, 0.05); setp(this.plJ.gain, vs / 0.15 * 0.04, t, 0.1);
    // squeal: louder and a little higher with more slip; rain takes most of it away
    const wetK = 1 - 0.75 * clamp(env.rain || 0, 0, 1), base = 1000 * (SQUEAL[car.tyre] || 1);
    for (let a = 0; a < 2; a++) {
      const q = this.sq[a], s = sq[a];
      q.w += (Math.random() - 0.5) * dt * 2; q.w *= Math.exp(-dt * 0.8);
      const f = base * (a ? 0.93 : 1) * (0.9 + 0.2 * smooth(2, 12, sqV[a])) * (1 + 0.06 * q.w);
      setp(q.o.frequency, f, t, 0.05); setp(q.bp.frequency, f * 1.01, t, 0.05); setp(q.fm.gain, f * 0.025, t, 0.1);
      const g = 0.11 * Math.pow(s, 1.3) * wetK * (1 - 0.4 * inside);
      q.gate.set(g > 1e-4, dt); setp(q.g.gain, g, t, 0.04);
    }
    // water round the wheels
    const wg = 0.35 * water * (0.4 + Math.min(v, 15) / 10);
    this.water.gate.set(wg > 1e-4, dt); setp(this.water.g.gain, wg, t, 0.08); setp(this.wF.frequency, 700 + 30 * Math.min(v, 30), t, 0.2);
    // wind: rises with the square of the speed, mostly outside
    const wd = 0.2 * Math.min(1.6, (v / 35) ** 2) * (1 - 0.7 * inside);
    this.wind.gate.set(wd > 1e-4, dt); setp(this.wind.g.gain, wd, t, 0.1); setp(this.windF.frequency, 180 + 20 * Math.min(v, 70), t, 0.2);
    const wh = 0.025 * smooth(20, 45, v) * inside;
    this.whistle.gate.set(wh > 1e-4, dt); setp(this.whistle.g.gain, wh, t, 0.2);
    // ABS
    const ab = st.absOn ? 0.5 * (0.6 + 0.4 * inside) : 0;
    this.abs.gate.set(ab > 0, dt); setp(this.abs.g.gain, ab, t, ab ? 0.01 : 0.05);
    // tread hum: tread blocks × wheel turns per second, on hard ground
    const lug = LUGS[car.tyre], hz = nC ? om / nC / (2 * Math.PI) * (lug ? lug[0] : 0) : 0;
    const hg = lug ? 0.05 * lug[1] * hard * smooth(2, 20, v) : 0;
    this.humL.gate.set(hg > 1e-4, dt); setp(this.hum.frequency, clamp(hz, 20, 3000), t, 0.05); setp(this.humL.g.gain, hg, t, 0.1);
    // stones thrown up off loose ground
    if (crunch > 0 && Math.random() < Math.min(0.5, dt * crunch * (0.25 + Math.min(spin, 12) * 0.06))) emit('gravelHit', { size: Math.random() });
    // the body itself plunging into water
    const dep = st.depth ?? -1;
    if (dep > 0.25 && this.depth <= 0.25 && v > 3 && t - this.splashT > 0.3) { this.splashT = t; emit('splash', { size: clamp(v / 10, 0.4, 1.5) }); }
    this.depth = dep;
  }
}
