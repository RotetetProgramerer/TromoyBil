// One-shot car sounds: crash, door, gear clunk, suspension thump, splash, stones, blow-off valve, UI click, and the horn.
// Each call makes a few nodes that play once and are dropped (sources stop themselves).
import { clamp, rand, gain, filt, chain, burst, tone } from './synth.js';

// an impact from the physics (impulse j in N·s): a low thud, crumpling metal, panels ringing and, for a big one, glass
export function crash(ac, out, B, j) {
  if (!(j > 150)) return;
  const I = clamp(Math.log(j / 400) / Math.log(150), 0, 1), t = ac.currentTime, g = 0.08 + 0.92 * I ** 1.5;   // 400 N·s (a nudge) … 60 000 (a tree at speed)
  burst(ac, out, B.brown, { t, type: 'lowpass', f: 160, q: 0.8, a: 0.002, d: 0.15 + 0.4 * I, g: 1.4 * g });
  tone(ac, out, { t, f: 70 + 30 * Math.random(), f1: 42, d: 0.12 + 0.25 * I, g: 0.6 * g });
  burst(ac, out, B.gravel, { t, f: 1500, q: 0.5, a: 0.004, d: 0.1 + 0.5 * I, g: 1.0 * g, rate: rand(0.4, 0.7) });
  burst(ac, out, B.white, { t, f: 2800, q: 0.6, a: 0.002, d: 0.05 + 0.2 * I, g: 0.3 * g });
  for (let k = 0; k < 2 + Math.round(3 * I); k++) tone(ac, out, { t: t + Math.random() * 0.03, f: rand(300, 3200), d: rand(0.2, 0.9) * (0.3 + I), g: 0.04 * g, type: 'triangle' });
  if (I > 0.55 && Math.random() < I) burst(ac, out, B.glass, { t: t + rand(0.02, 0.07), type: 'highpass', f: 2500, q: 0.5, a: 0.001, d: 0.7, g: 0.5 * I, off: 0 });
}
export function door(ac, out, B) {
  const t = ac.currentTime;
  burst(ac, out, B.brown, { t, type: 'lowpass', f: 140, q: 1, a: 0.003, d: 0.2, g: 1.2 });          // the slam
  tone(ac, out, { t, f: 85, f1: 58, d: 0.16, g: 0.5 });
  burst(ac, out, B.white, { t: t + 0.012, f: 3200, q: 1.5, a: 0.001, d: 0.03, g: 0.25 });            // the latch
  burst(ac, out, B.white, { t: t + 0.008, f: 650, q: 2, a: 0.002, d: 0.07, g: 0.2 });                // panel rattle
}
export function clunk(ac, out, B, g = 1) {                                                         // a gear going in
  const t = ac.currentTime;
  burst(ac, out, B.brown, { t, type: 'lowpass', f: 260, q: 1.2, a: 0.002, d: 0.05, g: 0.3 * g });
  tone(ac, out, { t, f: 120, f1: 90, d: 0.05, g: 0.08 * g });
  burst(ac, out, B.white, { t: t + 0.004, f: 1800, q: 3, a: 0.001, d: 0.015, g: 0.04 * g });
}
export function thump(ac, out, B, I) {                                                             // the suspension taking a bump
  const t = ac.currentTime;
  tone(ac, out, { t, f: 55 + 25 * Math.random(), f1: 40, d: 0.08 + 0.12 * I, g: 0.45 * I });
  burst(ac, out, B.brown, { t, type: 'lowpass', f: 220, q: 0.9, a: 0.002, d: 0.06 + 0.1 * I, g: 0.7 * I });
  if (I > 0.6) burst(ac, out, B.white, { t: t + 0.005, f: 800, q: 3, a: 0.001, d: 0.05, g: 0.12 * I });   // the bump stop
}
export function splash(ac, out, B, size) {
  const t = ac.currentTime, s = clamp(size, 0.05, 2), k = Math.min(1, s);
  burst(ac, out, B.white, { t, f: 1300, f1: 500, q: 0.6, a: 0.01, d: 0.25 + 0.5 * s, g: 0.45 * k });            // spray
  burst(ac, out, B.brown, { t, type: 'lowpass', f: 300, q: 0.7, a: 0.008, d: 0.2 + 0.4 * s, g: 0.6 * Math.min(1.2, s) });   // the hit
  burst(ac, out, B.drops, { t: t + 0.1, type: 'highpass', f: 1200, q: 0.5, a: 0.05, d: 0.4 + 0.8 * s, g: 0.4 * k });   // falling back
  for (let i = 0; i < 3 + 4 * s; i++) tone(ac, out, { t: t + rand(0.02, 0.45), f: rand(300, 900), f1: rand(900, 1800), d: rand(0.02, 0.05), g: 0.04 });
}
export function stone(ac, out, B, size = Math.random()) {                                          // a stone off the tyre hits the wheel arch
  const t = ac.currentTime, g = 0.03 + 0.08 * size;
  tone(ac, out, { t, f: rand(2200, 5200), d: rand(0.03, 0.08), g, type: 'triangle' });
  burst(ac, out, B.white, { t, f: 4000, q: 1, a: 0.0005, d: 0.01, g: g * 1.5 });
}
export function bov(ac, out, B, size, diesel) {                                                    // blow-off valve "pssh" (a diesel just sighs)
  const t = ac.currentTime;
  if (diesel) { burst(ac, out, B.white, { t, f: 2400, f1: 900, q: 1.5, a: 0.04, d: 0.5, g: 0.06 * size }); return; }
  burst(ac, out, B.white, { t, f: 3600, f1: 1400, q: 0.9, a: 0.008, d: 0.25 + 0.3 * size, g: 0.45 * size });
  burst(ac, out, B.white, { t, type: 'highpass', f: 5000, q: 0.7, a: 0.005, d: 0.15, g: 0.15 * size });
}
export function click(ac, out) { tone(ac, out, { f: 1900, f1: 1200, a: 0.001, d: 0.025, g: 0.2 }); }

// the horn: two (or three, an air horn) square or saw tones, soft-clipped and brightened, held while on
export class Horn {
  constructor(ac, out) {
    this.ac = ac; this.out = out; this.f = [415, 510]; this.air = false; this.cur = null;
    const c = new Float32Array(512); for (let i = 0; i < 512; i++) c[i] = Math.tanh((i / 255.5 - 1) * 2.5); this.curve = c;
  }
  voice(f, air) { this.f = f; this.air = air; }
  set(on, inside = 0) {
    const ac = this.ac, t = ac.currentTime;
    if (on && !this.cur) {
      const pre = gain(ac, 0.35), sh = ac.createWaveShaper(), g = gain(ac, 0);
      sh.curve = this.curve; chain(pre, sh, filt(ac, 'peaking', 2400, 1, 6), filt(ac, 'lowpass', this.air ? 3200 : 4800, 0.7), g, this.out);
      const os = this.f.map(f => {
        const o = ac.createOscillator(); o.type = this.air ? 'sawtooth' : 'square'; o.detune.value = rand(-8, 8);
        o.frequency.setValueAtTime(f * (this.air ? 0.94 : 1), t); if (this.air) o.frequency.linearRampToValueAtTime(f, t + 0.12);
        o.connect(pre); o.start(t); return o;
      });
      g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(0.16 * (1 - 0.45 * inside), t, this.air ? 0.04 : 0.008);
      this.cur = { os, g };
    } else if (!on && this.cur) {
      const { os, g } = this.cur; this.cur = null;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(0, t, this.air ? 0.06 : 0.015);
      for (const o of os) o.stop(t + 0.4);
    }
  }
}
