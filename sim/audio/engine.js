// The engine sound. Each firing of a cylinder sends a pressure pulse down the exhaust: the pulses come at
//   f_fire = rpm / 60 × cylinders / 2   (four-stroke)
// and their shape, strength and scatter make the voice. An AudioWorklet (inlined from a Blob URL, so no extra file) builds the
// pulse train sample by sample: per-cylinder strength and timing scatter every cycle, banks with their own pipes (a V8's uneven
// bank rhythm, a flat-6's alternating banks), a sharp front and flow noise on each pulse, a pipe resonance, distortion that grows
// with load, diesel knock, valve ticks and the intake. Without AudioWorklet (old browsers, plain http) a smaller node graph
// stands in. The node graph round it gives the outside (exhaust) and inside (muffled, more intake and whine) mixes, the turbo,
// the supercharger and the gear whine.
import { clamp, smooth, setp, gain, filt, chain, loop, wobble } from './synth.js';

// cylinder layouts: bank of each cylinder in firing order (the firing itself is even round the 720° cycle)
const LAYOUT = {
  I4: [0, 0, 0, 0],
  I6: [0, 1, 0, 1, 0, 1],               // split manifold: front three and rear three
  V6: [0, 1, 0, 1, 0, 1],
  F6: [0, 1, 0, 1, 0, 1],               // boxer: left and right bank take turns
  V8: [0, 1, 1, 0, 1, 0, 0, 1],         // cross-plane crank, 1-8-4-3-6-5-7-2: each bank fires unevenly (the burble)
};
//  width      decay of each exhaust pulse (crank degrees)   sharp  its rise time as a share of the decay (small = sharp, buzzy)
//  edge       an extra crack at the very front (bite, rasp)    rough  flow noise riding on the pulses
//  jitT/jitA  scatter of timing (share of a firing interval) and strength, per cylinder and cycle;  idleRough  more of it at idle
//  cg/lope/misfire  big-cam idle: per-cylinder strength, hunting revs, weak firings
//  pipe       pipe round trip per bank (ms), fb: reflection at the open end, damp: loss in the pipe
//  bankGain   level per bank (uneven banks give half orders)   drive  distortion [idle, extra at full load]
//  turboSoft  how much boost smooths the pulses (the turbine sits in the way)   intake [resonance Hz, Q, amount]
//  tick/knock valve train ticks, diesel combustion knock (knockF: lowest block resonance)   pops  overrun crackle
//  ext/int    outside EQ (low shelf, peaks [f, Q, dB], lowpass) and inside (body lowpass, boom)
//  mix        [exhaust outside, exhaust inside, intake+engine bay outside, inside]
//  turbo      {amt, f0, f1 (whistle Hz from spool to full boost), bov}   blower {ratio, amt}   whine: gearbox/axle whine
const BASE = {
  layout: 'I4', width: 60, sharp: 0.1, edge: 0.2, rough: 0.25, jitT: 0.012, jitA: 0.07, idleRough: 1.5, cg: null, lope: 0, misfire: 0,
  pipe: [4.0, 4.4], fb: -0.4, damp: 0.4, bankGain: [1, 1], drive: [0.7, 1.3], rpmGain: 0.6, turboSoft: 0,
  intake: [420, 3, 0.6], tick: 0.03, knock: 0, knockF: 1300, pops: 0,
  ext: { shelf: [120, 2], peaks: [[90, 1.4, 2], [700, 1.2, 2]], lp: 5000 }, int: { lp: 600, boom: [75, 5] },
  mix: [1, 0.55, 0.35, 0.45], turbo: null, blower: null, whine: 0.05, horn: [415, 510], gain: 1,
};
export const VOICES = {
  // small petrol inline-4 (1.3 l): thin, buzzy and busy, sharp pulses and a nasal middle
  kobbe: { layout: 'I4', width: 50, sharp: 0.06, edge: 0.3, rough: 0.3, jitT: 0.012, jitA: 0.09, pipe: [2.8], fb: -0.38, drive: [0.9, 2.2],
    intake: [480, 3.5, 0.8], tick: 0.05, ext: { shelf: [150, 0], peaks: [[110, 1.4, 1], [650, 1.4, 4], [1700, 2, 3]], lp: 6500 },
    int: { lp: 700, boom: [90, 4] }, whine: 0.1, horn: [440, 545] },
  // 3.0 V6 turbo-diesel: low growl, combustion clatter and a whistling turbo
  fjellrev: { layout: 'V6', width: 70, sharp: 0.12, edge: 0.15, rough: 0.28, jitT: 0.018, jitA: 0.09, knock: 0.55, knockF: 1150, pipe: [5.6, 6.1], fb: -0.45,
    bankGain: [1, 0.92], drive: [0.7, 1.1], turboSoft: 0.6, intake: [300, 2, 0.5],
    ext: { shelf: [110, 3], peaks: [[75, 1.2, 3], [420, 1.4, 2]], lp: 3500 }, int: { lp: 520, boom: [65, 6] },
    turbo: { amt: 0.7, f0: 1900, f1: 6200, bov: 0 }, horn: [390, 480] },
  // 2.0 turbo inline-4 (estate car): smooth and muted, a soft whistle and a polite blow-off valve
  ravn: { layout: 'I4', width: 65, sharp: 0.14, edge: 0.08, rough: 0.12, jitT: 0.006, jitA: 0.04, idleRough: 1, pipe: [4.6], fb: -0.34, drive: [0.5, 0.8],
    turboSoft: 0.8, intake: [400, 2.5, 0.45], ext: { shelf: [120, 2], peaks: [[95, 1.3, 2], [520, 1.3, 1]], lp: 3800 },
    int: { lp: 600, boom: [80, 5] }, turbo: { amt: 0.35, f0: 2600, f1: 7800, bov: 0.5 }, horn: [420, 520] },
  // 3.0 straight-6 with a turbo (and an electric supercharger): smooth, deep and strong
  jerv: { layout: 'I6', width: 58, sharp: 0.1, edge: 0.15, rough: 0.18, jitT: 0.006, jitA: 0.04, idleRough: 1, pipe: [4.2, 4.28], fb: -0.42, bankGain: [1, 0.98],
    drive: [0.6, 1.4], turboSoft: 0.55, intake: [350, 3, 0.6], ext: { shelf: [110, 3], peaks: [[85, 1.2, 3], [900, 1.4, 3]], lp: 5000 },
    int: { lp: 600, boom: [70, 6] }, turbo: { amt: 0.3, f0: 2400, f1: 7200, bov: 0.4 }, horn: [400, 495] },
  // 2.8 four-cylinder turbo-diesel (pickup): clattery, rough and mechanical
  vinsjen: { layout: 'I4', width: 75, sharp: 0.1, edge: 0.2, rough: 0.32, jitT: 0.022, jitA: 0.14, knock: 0.9, knockF: 1350, pipe: [5.0], fb: -0.42,
    drive: [0.8, 1.2], turboSoft: 0.5, intake: [320, 2, 0.45], tick: 0.06, ext: { shelf: [110, 3], peaks: [[68, 1.2, 2], [450, 1.5, 2]], lp: 3200 },
    int: { lp: 560, boom: [70, 5] }, turbo: { amt: 0.6, f0: 1800, f1: 5800, bov: 0 }, whine: 0.12, horn: [370, 455] },
  // supercharged big-block V8 on methanol (monster truck): huge and open, a lumpy idle, blower whine
  knott: { layout: 'V8', width: 48, sharp: 0.05, edge: 0.35, rough: 0.4, jitT: 0.02, jitA: 0.16, idleRough: 2.5,
    cg: [1, 0.6, 0.95, 0.7, 1.05, 0.62, 0.9, 0.78], lope: 0.035, misfire: 0.07, pipe: [1.7, 2.0], fb: -0.3, bankGain: [1, 0.86],
    drive: [1.2, 2.6], rpmGain: 0.65, intake: [260, 2, 0.9], tick: 0.05, pops: 0.35,
    ext: { shelf: [90, 3], peaks: [[70, 1, 3], [1200, 1.2, 3]], lp: 10000 }, int: { lp: 750, boom: [60, 6] },
    mix: [1.2, 0.7, 0.5, 0.5], blower: { ratio: 1.15, amt: 0.5 }, whine: 0.3, horn: [262, 330, 392], gain: 1.3 },
  // twin-turbo 3.7 flat-6: the banks take turns, so the half orders (odd harmonics of the bank rhythm) give the howl
  turbo: { layout: 'F6', width: 52, sharp: 0.07, edge: 0.25, rough: 0.25, jitT: 0.008, jitA: 0.05, pipe: [3.4, 4.1], fb: -0.42, bankGain: [1, 0.78],
    drive: [0.8, 1.8], turboSoft: 0.5, pops: 1, intake: [520, 3, 0.8],
    ext: { shelf: [120, 1], peaks: [[100, 1.2, 2], [1300, 1.6, 5], [2600, 2, 2]], lp: 7500 }, int: { lp: 700, boom: [85, 5] },
    turbo: { amt: 0.45, f0: 2800, f1: 8500, bov: 0.8 }, horn: [460, 580] },
};
// the voice for a car: its own entry, or a guess from the engine data (low redline → diesel)
export function voiceFor(spec) {
  const e = spec.engine, own = VOICES[spec.id] || (e.redline < 4800 ? VOICES.vinsjen : e.turbo ? VOICES.ravn : VOICES.kobbe);
  const v = Object.assign({}, BASE, own, { id: spec.id, idle: e.idle, red: e.redline, lim: e.limiter ?? e.redline + 200 });
  v.bank = LAYOUT[v.layout]; v.cyl = v.bank.length;
  v.cg = v.cg || v.bank.map(() => 1);
  v.out = [0.08 * v.gain, 0.22 * v.gain];             // full load ≈ −18 dBFS outside, leaving room for the wheels, wind and crashes
  v.seed = [...spec.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
  return v;
}
export const firingHz = (spec, rpm) => rpm / 60 * voiceFor(spec).cyl / 2;

// the AudioWorklet processor. This function is never called here: its source is put in a Blob and loaded into the audio thread.
function engineProcessor() {
  const SR = sampleRate, TAU = 2 * Math.PI, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // two-pole resonator (band-pass), unity gain at the peak
  class Reso {
    constructor(f, q) { this.y1 = 0; this.y2 = 0; const w = TAU * Math.min(f, SR * 0.45) / SR, r = Math.exp(-w / (2 * q));
      this.a1 = 2 * r * Math.cos(w); this.a2 = -r * r; this.g = (1 - r) * Math.hypot(1 - r * Math.cos(2 * w), r * Math.sin(2 * w)); }
    tick(x) { const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
  }
  const PARAMS = ['rpm', 'load', 'thr', 'boost', 'ov', 'cut', 'pops', 'on'];
  class Engine extends AudioWorkletProcessor {
    static get parameterDescriptors() { return PARAMS.map(name => ({ name, defaultValue: name === 'rpm' ? 800 : name === 'on' ? 1 : 0, automationRate: 'k-rate' })); }
    constructor(o) {
      super();
      const v = this.v = o.processorOptions, N = this.N = v.bank.length;
      this.nb = Math.max(...v.bank) + 1;
      this.off = Float64Array.from({ length: N }, (_, j) => (j + 0.5) / N);
      this.dj = new Float64Array(N); this.da = new Float64Array(N).fill(1);
      this.s1 = [0, 0]; this.s2 = [0, 0]; this.e = [0, 0]; this.imp = [0, 0]; this.eimp = [0, 0]; this.dcx = [0, 0]; this.dcy = [0, 0];
      this.wg = [0, 1].map(b => ({ buf: new Float32Array(2048), w: 0, D: clamp(Math.round((v.pipe[b] ?? v.pipe[0]) * SR / 1000), 8, 2000), lp: 0 }));
      this.ph = 0; this.j = 0; this.rpm = v.idle; this.t = 0; this.seed = v.seed >>> 0 || 1;
      this.lph = 0; this.cutting = false; this.limOff = 0; this.pop = 0; this.popK = 0.99; this.kEnv = 0; this.kImp = 0; this.tImp = 0;
      this.kr = [new Reso(v.knockF, 9), new Reso(v.knockF * 1.83, 12), new Reso(v.knockF * 2.71, 14)];
      this.ri = new Reso(v.intake[0], v.intake[1]); this.rh = new Reso(v.intake[0] * 2.3, 1.2); this.rt = new Reso(6200, 4);
      this.alive = true; this.port.onmessage = e => { if (e.data === 'stop') this.alive = false; };
      this.draw(0);
    }
    rnd() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
    gauss() { return (this.rnd() + this.rnd() + this.rnd() - 1.5) * 2; }
    // a new cycle: fresh timing and strength scatter for every cylinder (more of it near idle)
    draw(idleW) {
      const v = this.v, N = this.N, k = 1 + v.idleRough * idleW;
      for (let j = 0; j < N; j++) {
        this.dj[j] = clamp(v.jitT * k * this.gauss(), -0.35, 0.35) / N;
        let a = 1 + v.jitA * k * this.gauss();
        if (v.misfire && this.rnd() < v.misfire * idleW) a *= 0.15;
        this.da[j] = Math.max(0.05, a);
      }
    }
    process(_, outs, P) {
      if (!this.alive) return false;
      const o0 = outs[0] && outs[0][0], o1 = outs[1] && outs[1][0];
      if (!o0 || !o1) return true;
      const v = this.v, n = o0.length, N = this.N, nb = this.nb, bank = v.bank, cg = v.cg;
      const rpmT = Math.max(60, P.rpm[0]), load = P.load[0], thr = P.thr[0], boost = P.boost[0], ov = P.ov[0], cut = P.cut[0], pops = P.pops[0], on = P.on[0];
      const idle = v.idle, lp = Math.max(0, load), rpm0 = this.rpm, rN = clamp((rpm0 - idle) / (v.red - idle), 0, 1);
      const idleW = clamp(1 - (rpm0 - idle) / (idle * 0.6), 0, 1) * (1 - lp);
      // strength of each pulse: mostly the load (a closed throttle leaves weak pulses), a little more with the revs
      const A = on * (0.38 + 0.62 * lp) * (1 - 0.35 * ov) * (1 + 0.6 * idleW) * Math.pow(rpm0 / idle, v.rpmGain);
      // pulse shape: the pressure rises fast as the valve opens (attack) and dies away over `width` crank degrees (decay);
      // more load makes it sharper, the turbine at boost smooths it. On top, a short crack of the very front.
      const soft = 1 + v.turboSoft * boost, tD = v.width / (6 * rpm0) / 2, tA = Math.max(0.00004, v.sharp * (1.25 - 0.5 * lp) * soft * tD);
      const aA = 1 - Math.exp(-1 / (tA * SR)), aM = 1 - Math.exp(-1 / (tD * SR)), kM = (1 + tA / tD) / aM;
      const aE = Math.exp(-1 / (Math.max(0.0001, tD * 0.12) * SR));
      const edge = v.edge * (0.45 + 0.55 * lp) / soft, rough = v.rough * (0.2 + 0.8 * lp + 0.4 * idleW);
      // distortion: the shaper sees the pulse train scaled to its own strength, so `drive` sets the shape and A the level
      const drive = v.drive[0] + v.drive[1] * lp * Math.max(thr, 0.3), dn = A / Math.sqrt(drive), iA = 1 / Math.max(A, 0.02);
      const kn = on * v.knock * (0.45 + 0.6 * idleW + 0.2 * lp) * (1 - 0.5 * rN) * 14, tick = on * v.tick * (0.4 + 0.6 * rN) * 30;
      const inA = on * v.intake[2] * (0.15 + 0.85 * thr) * (0.4 + 0.6 * rN) * 4;
      const aK = Math.exp(-1 / (0.00035 * SR)), kR = 1 - Math.exp(-1 / (0.004 * SR)), dcR = 1 - TAU * 18 / SR, lim = 14 / SR;
      const fb = v.fb, dmp = v.damp, bg = v.bankGain, out0 = v.out[0], out1 = v.out[1];
      for (let i = 0; i < n; i++) {
        this.rpm += (rpmT - this.rpm) * kR;
        // rev limiter: the ignition is cut about 14 times a second; the revs fall 3 % and come back
        if (cut > 0.5) {
          this.lph += lim; if (this.lph >= 1) this.lph -= 1;
          this.cutting = this.lph < 0.45;
          this.limOff = Math.min(0, this.limOff + (this.cutting ? -0.03 * lim / 0.45 : 0.03 * lim / 0.55));
        } else { this.cutting = false; this.limOff *= 0.9995; }
        this.t += 1 / SR;
        const lope = v.lope ? v.lope * idleW * Math.sin(TAU * 1.05 * this.t + 0.7 * Math.sin(TAU * 0.29 * this.t)) : 0;
        this.ph += this.rpm * (1 + this.limOff + lope) / 120 / SR;
        while (this.ph >= this.off[this.j] + this.dj[this.j]) {          // a cylinder fires
          const j = this.j, b = bank[j];
          let a = A * this.da[j] * (1 + (cg[j] - 1) * idleW);
          if (this.cutting && this.rnd() < 0.85) a *= 0.04;
          this.imp[b] += a; this.eimp[b] += a * edge;
          this.kImp += kn * (0.7 + 0.6 * this.rnd()) * (this.cutting ? 0.3 : 1);
          this.tImp += tick * (0.5 + this.rnd());
          if (pops > 0 && this.rnd() < pops) { this.pop += 0.5 + this.rnd(); this.popK = Math.exp(-1 / ((0.002 + 0.008 * this.rnd()) * SR)); }
          if (++this.j === N) { this.j = 0; this.ph -= 1; this.draw(idleW); }
        }
        // exhaust: pulse per bank → DC blocker → pipe (a delay line with a damped, inverting reflection at the open end)
        let ex = 0, flow = 0;
        for (let b = 0; b < nb; b++) {
          const x = this.imp[b] * kM; this.imp[b] = 0;
          this.s1[b] += aA * (x - this.s1[b]); this.s2[b] += aM * (this.s1[b] - this.s2[b]);
          this.e[b] = this.e[b] * aE + this.eimp[b]; this.eimp[b] = 0;
          const p = this.s2[b];
          let y = p + this.e[b] + (this.rnd() * 2 - 1) * (p + 0.6 * this.e[b]) * rough;
          const d = y - this.dcx[b] + dcR * this.dcy[b]; this.dcx[b] = y; this.dcy[b] = d;
          const g = this.wg[b], m = g.buf.length - 1;
          g.lp += dmp * (g.buf[(g.w - g.D) & m] - g.lp);
          const z = d + fb * g.lp; g.buf[g.w] = z; g.w = (g.w + 1) & m;
          ex += z * bg[b]; flow += p;
        }
        // diesel knock: a short noise burst rings three block resonances; valve ticks ring one bright one
        this.kEnv = this.kEnv * aK + this.kImp; this.kImp = 0;
        const kx = this.kEnv * (this.rnd() * 2 - 1);
        const knock = this.kr[0].tick(kx) + 0.7 * this.kr[1].tick(kx) + 0.5 * this.kr[2].tick(kx);
        const tk = this.rt.tick(this.tImp); this.tImp = 0;
        // intake: the pulses ring the intake resonance (the induction growl) and drive a hiss of air
        const intake = this.ri.tick(flow * inA) + this.rh.tick((this.rnd() * 2 - 1) * flow * inA * 0.8);
        // overrun pops: unburnt fuel going off in the hot pipe; loud bangs that bypass the shaper
        let pop = 0;
        if (this.pop > 1e-4) { pop = Math.tanh(this.pop * ((this.rnd() * 2 - 1) * 1.4 + 0.5)) * 1.3; this.pop *= this.popK; }
        o0[i] = (Math.tanh(drive * ex * iA) * dn + knock * 0.3 + pop) * out0;
        o1[i] = (intake + knock + tk) * out1;
      }
      if (Math.abs(this.s2[0]) < 1e-12) { this.s1.fill(0); this.s2.fill(0); }   // no denormals when the engine is off
      return true;
    }
  }
  registerProcessor('tromoy-engine', Engine);
}
let _url = null;
export function workletURL() {
  return _url || (_url = URL.createObjectURL(new Blob(['(' + engineProcessor.toString() + ')()'], { type: 'application/javascript' })));
}

// the worklet engine: two outputs, exhaust and intake/engine bay. Should the processor fail in the audio thread, the
// node-graph stand-in takes over on the same outputs.
class WorkletCore {
  constructor(ac, v, B) {
    this.node = new AudioWorkletNode(ac, 'tromoy-engine', { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [1, 1], processorOptions: v });
    this.ex = gain(ac, 1); this.mech = gain(ac, 1);
    this.node.connect(this.ex, 0); this.node.connect(this.mech, 1);
    this.p = {}; for (const k of ['rpm', 'load', 'thr', 'boost', 'ov', 'cut', 'pops', 'on']) this.p[k] = this.node.parameters.get(k);
    this.node.onprocessorerror = () => { this.node.disconnect(); this.fb = new FallbackCore(ac, v, B); this.fb.ex.connect(this.ex); this.fb.mech.connect(this.mech); };
  }
  set(t, s) {
    if (this.fb) return this.fb.set(t, s);
    const p = this.p;
    setp(p.rpm, s.rpm, t, 0.015); setp(p.load, s.load, t, 0.03); setp(p.thr, s.thr, t, 0.03); setp(p.boost, s.boost, t, 0.05);
    setp(p.ov, s.ov, t, 0.06); setp(p.cut, s.cut, t, 0.005); setp(p.pops, s.pops, t, 0.02); setp(p.on, s.on, t, 0.25);
  }
  stop() { this.node.port.postMessage('stop'); this.node.disconnect(); if (this.fb) this.fb.stop(); }
}

// the stand-in without AudioWorklet: one 4-stroke cycle of the same pulse train as a periodic wave (so the half orders of
// uneven banks are there too), a tanh waveshaper, pulsed flow noise, a random pitch wobble, knock and intake
class FallbackCore {
  constructor(ac, v, B) {
    this.v = v; this.ac = ac;
    // decay and attack as shares of the cycle (the same crank angles as the worklet's pulse)
    const N = v.bank.length, H = 64, M = 2048, x = new Float64Array(M), k = new Float64Array(M), tD = v.width / 1440, tA = v.sharp * tD;
    for (let j = 0; j < N; j++) {
      const ph = (j + 0.5) / N, g = v.bankGain[v.bank[j]] ?? 1;
      k[Math.floor(ph * M)] += 1;
      for (let i = 0; i < M; i++) { let u = i / M - ph; u -= Math.floor(u); x[i] += g * (Math.exp(-u / tD) - Math.exp(-u / tA) + v.edge * Math.exp(-u / (0.12 * tD))); }
    }
    const wave = (s, roll) => {
      const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
      for (let h = 1; h <= H; h++) { let c = 0, q = 0; for (let i = 0; i < M; i++) { if (!s[i]) continue; const a = 2 * Math.PI * h * i / M; c += s[i] * Math.cos(a); q += s[i] * Math.sin(a); } re[h] = c * roll(h); im[h] = q * roll(h); }
      return ac.createPeriodicWave(re, im);
    };
    const osc = w => { const o = ac.createOscillator(); o.setPeriodicWave(w); o.frequency.value = v.idle / 120; o.start(); return o; };
    this.osc = osc(wave(x, () => 1)); this.kosc = osc(wave(k, h => 1 / (1 + h / 40)));
    this.pre = gain(ac, 0.3); this.post = gain(ac, 1); this.ex = gain(ac, 1); this.mech = gain(ac, 1);
    const sh = ac.createWaveShaper(), c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) c[i] = Math.tanh((i / 511.5 - 1) * 3);
    sh.curve = c; sh.oversample = '2x';
    chain(this.osc, this.pre, sh, this.post, this.ex);
    this.am = gain(ac, 0); chain(loop(ac, B.white), filt(ac, 'bandpass', 1800, 0.6), this.am, this.ex);
    this.amD = gain(ac, 0); chain(this.osc, this.amD); this.amD.connect(this.am.gain);
    this.jit = gain(ac, 0); chain(wobble(ac, B.white, 9), this.jit); this.jit.connect(this.osc.detune); this.jit.connect(this.kosc.detune);
    this.kg = gain(ac, 0); chain(this.kosc, filt(ac, 'bandpass', v.knockF, 2.5), this.kg, this.mech);
    this.ia = gain(ac, 0); chain(loop(ac, B.white), filt(ac, 'bandpass', v.intake[0], v.intake[1]), this.ia, this.mech);
    this.iaD = gain(ac, 0); chain(this.osc, this.iaD); this.iaD.connect(this.ia.gain);
  }
  set(t, s) {
    const v = this.v, lp = Math.max(0, s.load), rN = clamp((s.rpm - v.idle) / (v.red - v.idle), 0, 1);
    const idleW = clamp(1 - (s.rpm - v.idle) / (v.idle * 0.6), 0, 1) * (1 - lp);
    const cutK = s.cut ? (Math.floor(t * 28) % 2 ? 0.08 : 1) : 1, rpm = s.rpm * (s.cut && cutK < 1 ? 0.975 : 1);
    const A = s.on * (0.38 + 0.62 * lp) * (1 - 0.35 * s.ov) * (1 + 0.6 * idleW) * Math.pow(s.rpm / v.idle, v.rpmGain) * cutK;
    const drive = v.drive[0] + v.drive[1] * lp * Math.max(s.thr, 0.3);
    setp(this.osc.frequency, rpm / 120, t, 0.015); setp(this.kosc.frequency, rpm / 120, t, 0.015);
    setp(this.pre.gain, drive * 0.3, t, 0.02); setp(this.post.gain, v.out[0] * Math.pow(A, 1.5) / Math.sqrt(drive), t, 0.03);
    setp(this.amD.gain, v.rough * A * 0.25 * v.out[0], t, 0.03);
    setp(this.jit.gain, v.jitT * 900 * (1 + v.idleRough * idleW), t, 0.1);
    setp(this.kg.gain, s.on * v.knock * (0.45 + 0.6 * idleW + 0.2 * lp) * (1 - 0.5 * rN) * 0.5 * v.out[1], t, 0.05);
    setp(this.iaD.gain, s.on * v.intake[2] * (0.15 + 0.85 * s.thr) * (0.4 + 0.6 * rN) * 0.3 * v.out[1], t, 0.05);
  }
  stop() { for (const o of [this.osc, this.kosc]) { try { o.stop(); } catch (e) { } } this.ex.disconnect(); this.mech.disconnect(); }
}

// the engine with everything round it. ext/int: the outside and inside buses (crossfaded by the camera)
export class EngineSound {
  constructor(ac, ext, int, spec, B, worklet) {
    const v = this.v = voiceFor(spec), m = v.mix;
    this.ac = ac; this.spec = spec;
    this.core = worklet ? new WorkletCore(ac, v, B) : new FallbackCore(ac, v, B);
    this.nodes = [];
    const keep = n => (this.nodes.push(n), n);
    // outside: the exhaust through the silencer (shelf, peaks, lowpass); the engine bay and intake brighter on top
    let n = this.core.ex;
    for (const f of [filt(ac, 'lowshelf', v.ext.shelf[0], 0.7, v.ext.shelf[1]), ...v.ext.peaks.map(([f, q, dB]) => filt(ac, 'peaking', f, q, dB)), filt(ac, 'lowpass', v.ext.lp, 0.6)]) { n.connect(f); n = f; }
    chain(n, keep(gain(ac, m[0])), ext);
    // inside: the body lets the low boom through, the intake and the engine bay come through the bulkhead
    chain(this.core.ex, filt(ac, 'lowpass', v.int.lp, 0.8), filt(ac, 'lowshelf', v.int.boom[0], 0.7, v.int.boom[1]), keep(gain(ac, m[1])), int);
    chain(this.core.mech, filt(ac, 'highpass', 90, 0.7), filt(ac, 'lowpass', 7000, 0.7), keep(gain(ac, m[2])), ext);
    chain(this.core.mech, filt(ac, 'lowpass', 1200, 0.7), keep(gain(ac, m[3])), int);
    // turbo: the compressor whistle (two partials) and a rush of air
    if (v.turbo) {
      this.tw = ac.createOscillator(); this.tw2 = ac.createOscillator(); this.tw.frequency.value = v.turbo.f0; this.tw2.frequency.value = v.turbo.f0 * 2.02;
      this.tg = gain(ac, 0); const t2 = gain(ac, 0.25);
      chain(this.tw, this.tg); chain(this.tw2, t2, this.tg);
      this.ta = gain(ac, 0); this.taF = filt(ac, 'bandpass', 1500, 0.8); chain(loop(ac, B.white), this.taF, this.ta);
      for (const g of [this.tg, this.ta]) { g.connect(ext); g.connect(int); keep(g); }
      this.tw.start(); this.tw2.start();
    }
    // Roots blower: lobe whine at blower speed × 6, rising with the revs
    if (v.blower) {
      this.bw = ac.createOscillator();
      this.bw.setPeriodicWave(ac.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0, 0]), new Float32Array([0, 0.6, 1, 0.45, 0.3, 0.35, 0.12])));
      this.bg = gain(ac, 0); chain(this.bw, filt(ac, 'highpass', 300, 0.7), this.bg); this.bg.connect(ext); this.bg.connect(int); keep(this.bg);
      this.bw.start();
    }
    // gear whine: the axle (pinion) under load, or the straight-cut reverse gear
    this.gw = ac.createOscillator(); this.gw.frequency.value = 300; this.gg = gain(ac, 0); chain(this.gw, this.gg, int);
    this.gge = gain(ac, 0.3); chain(this.gg, this.gge, ext); this.gw.start();
    this.load = 0; this.lift = 9; this.liftRpm = 0; this.bMax = 0; this.tMax = 0; this.shiftPrev = 0; this.bovT = -9;
  }
  update(t, dt, car, env, emit) {
    const st = car.state, v = this.v, e = this.spec.engine;
    const rpm = car.rpm, thrD = st.throttle || 0, boost = st.boost || 0, shifting = st.shift > 0;
    const idle = e.idle, red = e.redline, lim = v.lim, rN = clamp((rpm - idle) / (red - idle), 0, 1);
    const on = st.flooded || car.engineOff ? 0 : 1;
    // rev limiter: the driver holds the throttle open against it (the worklet does the cutting, so keep the load up)
    const cut = on && thrD > 0.3 && rpm > lim * 0.985 && !shifting ? 1 : 0;
    let thr = st.thr ?? thrD, load = st.load || 0;
    if (cut) { thr = thrD; load = Math.max(load, 0.85); }
    this.load += (load - this.load) * (1 - Math.exp(-dt / 0.035));
    // overrun: throttle shut above idle. Pops: plenty right after lifting from high revs, dying away
    const ov = thr < 0.06 ? smooth(idle * 1.15, idle * 2, rpm) : 0;
    if (thrD > 0.25) { this.lift = 0; this.liftRpm = rpm; } else this.lift += dt;
    const pops = v.pops * ov * smooth(0.35, 0.7, (this.liftRpm - idle) / (red - idle)) * Math.exp(-this.lift / 1.4) * 0.18;
    this.core.set(t, { rpm, load: this.load, thr, boost, ov, cut, pops, on });
    // turbo whistle: pitch with boost and revs, level with boost; it sighs down as the boost falls away after a lift
    if (v.turbo) {
      const T = v.turbo, f = T.f0 + (T.f1 - T.f0) * boost * (0.35 + 0.65 * rN);
      setp(this.tw.frequency, f, t, 0.08); setp(this.tw2.frequency, f * 2.02, t, 0.08); setp(this.taF.frequency, 900 + f * 0.25, t, 0.1);
      setp(this.tg.gain, on * T.amt * 0.035 * Math.pow(boost, 1.6) * (0.45 + 0.55 * thrD), t, 0.06);
      setp(this.ta.gain, on * T.amt * 0.05 * boost * (0.3 + 0.7 * thrD), t, 0.08);
      // blow-off valve: the throttle shuts (within a few tenths of a second, the pedal is ramped) while there is boost
      this.bMax = Math.max(boost, this.bMax * Math.exp(-dt / 0.3)); this.tMax = Math.max(thrD, this.tMax * Math.exp(-dt / 0.3));
      if (thrD < 0.15 && this.tMax > 0.5 && this.bMax > 0.4 && t - this.bovT > 0.6) {
        this.bovT = t; this.tMax = 0; emit('bov', { size: this.bMax * (T.bov || 0.25), diesel: !T.bov });
      }
    }
    if (v.blower) {
      setp(this.bw.frequency, rpm / 60 * v.blower.ratio * 6, t, 0.02);
      setp(this.bg.gain, on * v.blower.amt * 0.02 * (0.2 + 0.8 * Math.max(0, this.load)) * (0.15 + Math.pow(rN, 1.3)), t, 0.05);
    }
    // gear whine: pinion teeth × shaft speed (from the wheels), or the reverse idler × engine speed
    const W = car.wheels; let om = 0; for (const w of W) om += Math.abs(w.omega || 0); om /= W.length || 1;
    const rev = st.gear < 0, fw = rev ? rpm / 60 * 17 : om / (2 * Math.PI) * (this.spec.gearbox.final || 3.5) * 11;
    setp(this.gw.frequency, clamp(fw, 20, 4000), t, 0.03);
    setp(this.gg.gain, on * v.whine * (rev ? 0.05 : 0.012) * (0.3 + Math.abs(this.load)) * smooth(30, 200, fw), t, 0.08);
    if (shifting && !this.shiftPrev) emit('shift', { gear: st.shiftTo });
    this.shiftPrev = shifting;
  }
  stop() {
    this.core.stop();
    for (const o of [this.tw, this.tw2, this.bw, this.gw]) if (o) try { o.stop(); } catch (e) { }
    for (const g of this.nodes) g.disconnect();
    this.gg.disconnect(); this.gge.disconnect();
  }
}
