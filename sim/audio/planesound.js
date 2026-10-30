// The plane's sound: the engine on the engine synthesizer (sim/audio/engine.js, voices lyc360 and lyc390: air-cooled flat-fours on
// short stacks), the propeller (the blades' buzz at the blade-pass frequency, louder with the thrust and the tip speed), the wind
// round the airframe growing with the airspeed and whistling in the struts, the stall horn, the tyres chirping at touchdown and
// rolling on the runway or the grass, and the crash. In the cockpit it all comes through the cabin and the headset (a low-pass).
//   const s = new PlaneSound(snd, spec);   s.update(dt, plane, inside);   s.stop();
import { clamp, smooth, rand, setp, gain, filt, chain, loop, burst, tone, Gate } from './synth.js';
import { EngineSound } from './engine.js';
import { SURF } from '../physics/surfaces.js';

const VOICE = { make: 'lyc360', falk: 'lyc390' };

export class PlaneSound {
  constructor(snd, spec) {
    const ac = this.ac = snd.ac, B = this.B = snd.B, t = ac.currentTime; this.snd = snd; this.spec = spec;
    this.out = gain(ac, 0); this.out.connect(snd.carBus); this.out.gain.setTargetAtTime(1, t, 0.4);
    // outside straight to the bus; inside through the cabin (a low-pass) so it sounds like the headset
    this.ext = gain(ac, 1); this.int = gain(ac, 0); this.cabF = filt(ac, 'lowpass', 2200, 0.6);
    this.ext.connect(this.out); chain(this.int, this.cabF, this.out);
    const e = spec.engine, ps = { id: VOICE[spec.id] || 'lyc360', engine: { idle: e.idle ?? 650, redline: e.redline ?? e.rpm, limiter: 99999 }, gearbox: { final: 1 } };
    this.engine = new EngineSound(ac, this.ext, this.int, ps, B, snd.worklet);
    this.car = { spec: ps, state: { throttle: 0, thr: 0, load: 0, boost: 0, shift: 0, gear: 1 }, rpm: e.idle ?? 650, wheels: [{ omega: 0 }], engineOff: false };
    // the propeller: a buzz at the blade-pass frequency (two blades) and its harmonics, falling off towards the top
    const re = new Float32Array(17), im = new Float32Array(17); for (let h = 1; h <= 16; h++) im[h] = (h % 2 ? 1 : 0.6) / Math.pow(h, 1.25);
    this.prop = ac.createOscillator(); this.prop.setPeriodicWave(ac.createPeriodicWave(re, im)); this.prop.frequency.value = 20;
    this.propF = filt(ac, 'lowpass', 900, 0.8); this.propG = gain(ac, 0); chain(this.prop, this.propF, this.propG);
    this.propGate = new Gate(this.propG, this.ext); this.propIn = gain(ac, 0); chain(this.propG, this.propIn, this.int); this.prop.start();
    // layers that are only connected while heard
    const lay = (dest, src, ...f) => { const g = gain(ac, 0); chain(src, ...f, g); return { g, gate: new Gate(g, dest) }; };
    this.windF = filt(ac, 'bandpass', 600, 0.5); this.wind = lay(this.out, loop(ac, B.pink), this.windF);
    this.hissF = filt(ac, 'highpass', 3000, 0.6); this.hiss = lay(this.out, loop(ac, B.white), this.hissF, filt(ac, 'lowpass', 9000, 0.5));
    this.whistleF = filt(ac, 'bandpass', 1800, 9); this.whistle = lay(this.out, loop(ac, B.white), this.whistleF);
    this.rollF = filt(ac, 'lowpass', 300, 0.8); this.roll = lay(this.out, loop(ac, B.brown), this.rollF);
    this.grassF = filt(ac, 'bandpass', 900, 0.6); this.grass = lay(this.out, loop(ac, B.gravel, 0.6), this.grassF);
    // the stall horn: a reed's buzzy tone
    const hw = ac.createOscillator(); hw.type = 'sawtooth'; hw.frequency.value = 1620; const hm = ac.createOscillator(); hm.type = 'square'; hm.frequency.value = 28;
    const am = gain(ac, 0.35), amd = gain(ac, 0.25); chain(hm, amd); amd.connect(am.gain); hm.start(); hw.start();
    this.horn = lay(this.out, hw, filt(ac, 'bandpass', 1750, 3), am); this.hornOsc = [hw, hm];
    this.fx = gain(ac, 1); this.fx.connect(this.out);
    this.contact = []; this.crashed = false; this.lastT = 0;
  }
  // p: the physics Plane; inside: 0 outside … 1 in the cockpit
  update(dt, p, inside = 0) {
    const ac = this.ac, t = ac.currentTime, st = p.state, I = p.input, c = this.car, s = c.state;
    setp(this.ext.gain, 1 - 0.82 * inside, t, 0.08); setp(this.int.gain, 0.75 * inside, t, 0.08);
    // the engine: the load follows the throttle and how hard the propeller pulls
    const rated = p.spec.engine.rpm, rpm = st.rpm, thr = clamp(I.throttle, 0, 1);
    s.throttle = thr; s.thr = thr; s.load = clamp(0.15 + 0.85 * thr * Math.min(1, rpm / (rated * 0.8)), 0, 1);
    c.rpm = Math.max(1, rpm); c.engineOff = p.crashed || rpm < 120; c.wheels[0].omega = 0;
    this.engine.update(t, dt, c, {}, (n, o) => this.snd.event(n, o));
    // the propeller's buzz: the blade-pass frequency, louder with thrust and the tips' speed
    const bpf = rpm / 60 * 2, tip = Math.PI * p.spec.prop.D * rpm / 60, pg = p.crashed ? 0 : 0.11 * smooth(80, 300, tip) * (0.35 + 0.65 * clamp(st.thrust / (p.m * 4), 0, 1));
    setp(this.prop.frequency, Math.max(10, bpf), t, 0.03); setp(this.propF.frequency, 300 + bpf * 9, t, 0.05); setp(this.propG.gain, pg, t, 0.06); setp(this.propIn.gain, 0.6, t, 0.1); this.propGate.set(pg > 1e-4, dt);
    // the air: a rush that grows with the airspeed, a hiss on top, a whistle in the struts and the gear
    const v = p.crashed ? 0 : st.tas, k = smooth(8, 75, v), L = (l, g, tau = 0.1) => { l.gate.set(g > 1e-4, dt); setp(l.g.gain, g, t, tau); };
    L(this.wind, (0.2 * k * k) * (1 - 0.6 * inside)); setp(this.windF.frequency, 300 + v * 9, t, 0.1);
    L(this.hiss, 0.05 * k * k * k * (1 - 0.7 * inside)); L(this.whistle, (p.spec.id === 'make' ? 0.03 : 0.012) * smooth(25, 70, v) * (1 - 0.5 * inside)); setp(this.whistleF.frequency, 1200 + v * 14, t, 0.2);
    // the stall horn
    L(this.horn, st.stallWarn && !p.crashed ? 0.07 : 0, 0.02);
    // the wheels: a rumble on the runway, a rustle on the grass, a chirp when a tyre touches down
    let gs = 0, grass = 0; for (const g of p.gear) if (g.contact) { gs = Math.hypot(p.vel.x, p.vel.z); if (g.surf === SURF.GRASS || g.surf === SURF.FIELD || g.surf === SURF.FOREST) grass = 1; }
    L(this.roll, 0.18 * smooth(1, 30, gs) * (grass ? 0.6 : 1)); setp(this.rollF.frequency, 120 + gs * 8, t, 0.1);
    L(this.grass, grass * 0.12 * smooth(1, 20, gs));
    p.gear.forEach((g, i) => {
      if (g.contact && !this.contact[i]) {
        const vh = Math.hypot(p.vel.x, p.vel.z), sink = g.vsink || 0;
        if (vh > 8 && t - this.lastT > 0.08) { this.lastT = t; const I2 = clamp(vh / 35, 0.2, 1);
          if (!grass) { burst(ac, this.fx, this.B.white, { f: 2400, f1: 1500, q: 2.5, a: 0.004, d: 0.12 + 0.1 * I2, g: 0.25 * I2 }); tone(ac, this.fx, { f: 1500, f1: 900, d: 0.1, g: 0.05 * I2, type: 'triangle' }); }
          burst(ac, this.fx, this.B.brown, { type: 'lowpass', f: 200, q: 0.8, a: 0.003, d: 0.12 + sink * 0.08, g: 0.3 + sink * 0.25 }); }
      }
      this.contact[i] = g.contact;
    });
    // a crash: the impact, and the splash in the water
    if (p.crashed && !this.crashed) {
      const sp = p.crash ? p.crash.speed : 20; this.snd.event('crash', { impulse: p.m * Math.max(8, sp) * 2 });
      if (/water/.test(p.crashReason || '')) this.snd.event('splash', { size: 1.5 });
    }
    this.crashed = p.crashed;
  }
  stop() {
    const t = this.ac.currentTime; this.out.gain.setTargetAtTime(0, t, 0.1);
    setTimeout(() => { this.engine.stop(); for (const o of [this.prop, ...this.hornOsc]) try { o.stop(); } catch (e) { } this.out.disconnect(); }, 700);
  }
}
