// The boat's sound: the outboard(s) on the engine synthesizer (sim/audio/engine.js, voices ob20, ob150 and ob300; twins slightly
// apart so they beat), and the water: the rush along the hull that grows with speed, the hiss of the spray, the hull drumming and
// slapping into waves, the propeller churning when it ventilates or goes astern, and water lapping at the hull at rest.
//   const s = new BoatSound(snd, spec);   s.update(dt, boat, waveScale);   s.stop();
import { clamp, smooth, rand, setp, gain, filt, chain, loop, burst, Gate } from './synth.js';
import { EngineSound, VOICES } from './engine.js';

const VOICE = { jolle: 'ob20', motorbat: 'ob150', racer: 'ob300' };
for (const k of ['ob20', 'ob150', 'ob300']) VOICES[k + 'b'] = VOICES[k];      // the second engine of a twin: same voice, its own scatter

export class BoatSound {
  constructor(snd, spec) {
    const ac = this.ac = snd.ac, B = this.B = snd.B, t = ac.currentTime; this.snd = snd; this.spec = spec;
    this.out = gain(ac, 0); this.out.connect(snd.carBus); this.out.gain.setTargetAtTime(1, t, 0.3);
    this.ext = gain(ac, 1); this.int = gain(ac, 0); this.ext.connect(this.out); this.int.connect(this.out);
    const e = spec.engine, v = VOICE[spec.id] || 'ob150', n = e.count || 1;
    this.engines = [];
    for (let i = 0; i < n; i++) {
      const ps = { id: v + (i ? 'b' : ''), engine: { idle: e.idle, redline: e.rpm, limiter: e.limit ?? e.rpm * 1.08 }, gearbox: { final: 1.27 } };
      this.engines.push({ snd: new EngineSound(ac, this.ext, this.int, ps, B, snd.worklet), car: { spec: ps, state: { throttle: 0, thr: 0, load: 0, boost: 0, shift: 0, gear: 0 }, rpm: e.idle, wheels: [{ omega: 0 }], engineOff: false } });
    }
    // layers that are only connected while heard (the noise loops under them play on, so stop() stops them)
    const loops = this.loops = [], lay = (src, ...f) => { const g = gain(ac, 0); chain(src, ...f, g); loops.push(src); return { g, gate: new Gate(g, this.out) }; };
    this.rushF = filt(ac, 'bandpass', 500, 0.5); this.rush = lay(loop(ac, B.pink), this.rushF);
    this.hiss = lay(loop(ac, B.white), filt(ac, 'highpass', 2600, 0.6), filt(ac, 'lowpass', 9500, 0.5));
    this.drum = lay(loop(ac, B.brown), filt(ac, 'lowpass', 150, 0.8));
    this.churnF = filt(ac, 'bandpass', 450, 1.2); this.churn = lay(loop(ac, B.pink, 0.8), this.churnF);
    this.fx = gain(ac, 1); this.fx.connect(this.out);
    this.vy = 0; this.lapT = 0; this.slapT = 0;
  }
  update(dt, b, ws = 0.8, env = {}) {
    const ac = this.ac, t = ac.currentTime, st = b.state, kn = st.knots, emit = (n, o) => this.snd.event(n, o);
    b.motors.forEach((M, i) => {
      const E = this.engines[i]; if (!E) return; const c = E.car, s = c.state;
      s.throttle = Math.abs(b.input.throttle); s.thr = st.thr; s.gear = st.gear;
      s.load = st.gear ? clamp(st.thr * (1 - 0.75 * M.vent) * Math.pow(M.im, 0.5) + 0.08, 0, 1) : 0;
      c.rpm = M.omega * 60 / (2 * Math.PI) * (i ? 1.011 : 1); c.wheels[0].omega = M.omega;
      E.snd.update(t, dt, c, env, emit);
    });
    const L = (l, g, tau = 0.12) => { l.gate.set(g > 1e-4, dt); setp(l.g.gain, g, t, tau); };
    const sp = smooth(0, 1, kn / 45);
    L(this.rush, 0.16 * Math.pow(sp, 1.1) * (st.onPlane ? 1 : 0.75)); setp(this.rushF.frequency, 260 + 38 * kn, t, 0.1);
    L(this.hiss, 0.07 * st.spray + 0.03 * sp * sp);
    L(this.drum, 0.16 * smooth(4, 35, kn) * (0.6 + 0.4 * Math.min(1, Math.abs(b.w.x) * 2)));
    const vent = Math.max(...b.motors.map(M => M.vent)), astern = st.gear < 0 ? st.thr : 0;
    L(this.churn, 0.06 * Math.min(1, vent * 1.5 + astern * 0.8 + (kn < 6 ? st.thr * 0.5 : 0))); setp(this.churnF.frequency, 300 + 400 * vent + 10 * kn, t, 0.1);
    // a slam: the hull comes down hard on a wave
    const dv = b.vel.y - this.vy; this.vy = b.vel.y; this.slapT -= dt;
    if (dv > 9.81 * 0.9 * dt && kn > 8 && this.slapT <= 0) {
      const I = clamp(dv / dt / 9.81 / 3, 0.15, 1); this.slapT = 0.18;
      burst(ac, this.fx, this.B.brown, { type: 'lowpass', f: 220, q: 0.8, a: 0.004, d: 0.18 + 0.2 * I, g: 0.9 * I });
      burst(ac, this.fx, this.B.white, { f: 900, f1: 400, q: 0.7, a: 0.006, d: 0.25 + 0.2 * I, g: 0.25 * I });
    }
    // lapping at the hull when the boat lies still
    this.lapT -= dt;
    if (kn < 5 && this.lapT <= 0) {
      this.lapT = rand(0.25, 0.9) / (0.5 + ws); const g = 0.05 * (1 - kn / 5) * (0.4 + ws);
      burst(ac, this.fx, this.B.pink, { f: rand(350, 900), q: 1.4, a: 0.01, d: rand(0.08, 0.2), g });
    }
  }
  stop() {
    const t = this.ac.currentTime; this.out.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => { for (const E of this.engines) E.snd.stop(); for (const s of this.loops) try { s.stop(); s.disconnect(); } catch (e) { } this.out.disconnect(); }, 600);
  }
}
