// The animals' voices, made with WebAudio like the rest of the game's sound (sim/audio/synth.js): a gull's laughing cry, a crow's
// caw, the moose's grunt, a cow's moo, the lion's roar … Each is a few oscillators and filtered noise, quiet, panned to where the
// animal is and fainter with distance; through the glass when the camera sits in the car.
//   const c = new Calls(snd);   c.play(kind, pan, dist, {alarm, roar, inside})   (pan: −1 left … 1 right of where the camera looks)
import { gain, filt, chain, burst, rand, clamp, panner } from '../audio/synth.js';

const FAR = { lion: 700, elephant: 600, monkey: 500, hippo: 400, moose: 300, cow: 300, gull: 260, eagle: 400, croc: 60, hiss: 40 };

export class Calls {
  constructor(snd) { this.snd = snd; this.last = 0; }
  ready() {
    const s = this.snd; if (!s || !s.ready || !s.ac || !s.ambBus) return false;
    if (!this.out) { const ac = s.ac; this.lp = filt(ac, 'lowpass', 16000, 0.5); this.out = gain(ac, 0.9); chain(this.lp, this.out, s.ambBus); }
    return true;
  }
  play(kind, pan, d, o = {}) {
    if (!this.ready()) return;
    const ac = this.snd.ac, t = ac.currentTime, far = FAR[kind] || 160;
    if (d > far || t - this.last < 0.25) return; this.last = t;
    this.lp.frequency.setTargetAtTime(o.inside ? 1500 : 16000, t, 0.05);
    const vol = clamp(0.5 / (1 + d / 18), 0, 0.5) * (o.alarm ? 1.3 : 1), g = gain(ac, vol), p = panner(ac, this.lp, clamp(pan * 0.85, -1, 1));
    g.connect(p);
    const f = VOICE[kind]; if (f) f(ac, g, t, this.snd.B, o);
    setTimeout(() => { try { g.disconnect(); p.disconnect && p !== this.lp && p.disconnect(); } catch (e) { } }, 4500);
  }
}
// a tone through a formant (vowel) filter
function voiced(ac, out, t, o) {
  const s = ac.createOscillator(), f1 = filt(ac, 'bandpass', o.form || 900, o.q || 2), g = gain(ac, 0);
  s.type = o.type || 'sawtooth'; s.frequency.setValueAtTime(o.f, t);
  if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + o.d * 0.4);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t + o.d);
  if (o.vib) { const v = ac.createOscillator(), vg = gain(ac, o.f * o.vib); v.frequency.value = o.vr || 6; chain(v, vg); vg.connect(s.frequency); v.start(t); v.stop(t + o.d + 0.1); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.g ?? 1, t + (o.a || 0.02)); g.gain.setValueAtTime(o.g ?? 1, t + o.d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
  chain(s, f1, g, out); s.start(t); s.stop(t + o.d + 0.05);
}
const VOICE = {
  // herring gull: the long call, a run of falling «kyow» notes
  gull: (ac, out, t, B, o) => { const n = o.alarm ? 3 : 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) { const t0 = t + i * rand(0.16, 0.22), f = rand(1150, 1400) * (1 - i * 0.03); voiced(ac, out, t0, { f, f1: f * 1.35, f2: f * 0.8, d: 0.17, form: 2200, q: 1.5, g: 0.6 }); } },
  crow: (ac, out, t) => { for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { const t0 = t + i * 0.42; voiced(ac, out, t0, { f: 520, f1: 600, f2: 430, d: 0.3, form: 1300, q: 1.2, vib: 0.08, vr: 45, g: 0.7 }); } },
  raven: (ac, out, t) => { for (let i = 0; i < 2; i++) voiced(ac, out, t + i * 0.5, { f: 300, f1: 340, f2: 260, d: 0.28, form: 800, q: 1.5, vib: 0.1, vr: 35, g: 0.8 }); },
  eagle: (ac, out, t) => { for (let i = 0; i < 6; i++) voiced(ac, out, t + i * 0.13, { f: 1900 - i * 60, f1: 2300 - i * 60, f2: 1700, d: 0.1, form: 2600, q: 2, type: 'triangle', g: 0.5 }); },
  duck: (ac, out, t) => { for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) voiced(ac, out, t + i * 0.22, { f: 260, f1: 240, f2: 200, d: 0.14, form: 1100, q: 3, g: 0.8 }); },
  coo: (ac, out, t) => { voiced(ac, out, t, { f: 380, f1: 420, f2: 360, d: 0.35, type: 'sine', form: 450, q: 1, g: 0.8 }); voiced(ac, out, t + 0.45, { f: 420, f1: 400, f2: 340, d: 0.5, type: 'sine', form: 450, q: 1, g: 0.9 }); },
  grouse: (ac, out, t, B) => { for (let i = 0; i < 9; i++) burst(ac, out, B.white, { t: t + i * 0.045 + (i > 5 ? 0.2 : 0), f: 900, q: 3, a: 0.002, d: 0.03, g: 0.8 }); },
  parrot: (ac, out, t) => { voiced(ac, out, t, { f: 1100, f1: 1500, f2: 900, d: 0.3, form: 2000, q: 1.2, vib: 0.15, vr: 60, g: 0.8 }); },
  toucan: (ac, out, t) => { for (let i = 0; i < 3; i++) voiced(ac, out, t + i * 0.2, { f: 480, f1: 520, f2: 400, d: 0.12, form: 1000, q: 2, vib: 0.2, vr: 50, g: 0.7 }); },
  monkey: (ac, out, t, B) => { voiced(ac, out, t, { f: 140, f1: 170, f2: 120, d: 2.2, form: 500, q: 1.5, vib: 0.05, vr: 3, a: 0.3, g: 0.8 }); burst(ac, out, B.pink, { t, f: 420, q: 1.5, a: 0.4, d: 1.8, g: 0.5 }); },
  moose: (ac, out, t) => { voiced(ac, out, t, { f: 95, f1: 110, f2: 70, d: 0.5, form: 350, q: 1.2, a: 0.04, g: 1 }); },
  reindeer: (ac, out, t, B) => { burst(ac, out, B.pink, { t, f: 300, q: 1.5, a: 0.01, d: 0.25, g: 0.9 }); voiced(ac, out, t, { f: 110, f2: 80, d: 0.25, form: 400, q: 1, g: 0.6 }); },
  cow: (ac, out, t) => { voiced(ac, out, t, { f: 150, f1: 165, f2: 105, d: 1.3, form: 500, q: 1.3, a: 0.15, g: 1 }); },
  sheep: (ac, out, t) => { voiced(ac, out, t, { f: 330, f1: 360, f2: 290, d: 0.65, form: 1300, q: 1.5, vib: 0.06, vr: 7, a: 0.05, g: 0.9 }); },
  dog: (ac, out, t, B) => { for (let i = 0; i < 2; i++) { voiced(ac, out, t + i * 0.28, { f: 420, f1: 520, f2: 300, d: 0.12, form: 900, q: 1.2, a: 0.005, g: 1 }); burst(ac, out, B.white, { t: t + i * 0.28, f: 1200, q: 1, a: 0.003, d: 0.08, g: 0.4 }); } },
  cat: (ac, out, t) => { voiced(ac, out, t, { f: 600, f1: 850, f2: 520, d: 0.7, form: 1400, q: 2, a: 0.08, g: 0.7 }); },
  fox: (ac, out, t) => { for (let i = 0; i < 3; i++) voiced(ac, out, t + i * 0.35, { f: 800, f1: 1000, f2: 600, d: 0.15, form: 1500, q: 1.5, g: 0.7 }); },
  lion: (ac, out, t, B, o) => { const d = o.roar ? 1.6 : 1.1; voiced(ac, out, t, { f: 120, f1: 150, f2: 55, d, form: 450, q: 0.8, a: 0.12, g: 1 }); burst(ac, out, B.pink, { t, f: 300, q: 1, a: 0.1, d: d * 0.8, g: 0.6 }); },
  cheetah: (ac, out, t, B, o) => { if (o.roar) { voiced(ac, out, t, { f: 180, f1: 220, f2: 90, d: 0.6, form: 600, q: 1, a: 0.04, g: 1 }); return; } for (let i = 0; i < 3; i++) voiced(ac, out, t + i * 0.3, { f: 1500, f1: 1800, f2: 1300, d: 0.12, type: 'triangle', form: 1800, q: 1, g: 0.6 }); },
  jaguar: (ac, out, t) => { for (let i = 0; i < 5; i++) voiced(ac, out, t + i * 0.32, { f: 90, f1: 110, f2: 70, d: 0.2, form: 380, q: 1, a: 0.02, g: 1 }); },
  croc: (ac, out, t, B) => { burst(ac, out, B.white, { t, f: 3000, type: 'highpass', a: 0.05, d: 0.6, g: 0.6 }); burst(ac, out, B.white, { t: t + 0.55, f: 1400, q: 2, a: 0.001, d: 0.06, g: 1 }); },
  hiss: (ac, out, t, B) => { burst(ac, out, B.white, { t, f: 3500, type: 'highpass', a: 0.08, d: 0.7, g: 0.5 }); },
  elephant: (ac, out, t, B) => { voiced(ac, out, t, { f: 430, f1: 620, f2: 520, d: 1.1, form: 1200, q: 1, vib: 0.03, vr: 9, a: 0.06, g: 1 }); burst(ac, out, B.white, { t, f: 2000, q: 1, a: 0.06, d: 0.9, g: 0.3 }); },
  hippo: (ac, out, t) => { for (let i = 0; i < 5; i++) voiced(ac, out, t + i * 0.24, { f: 220 - i * 18, f2: 160 - i * 15, d: 0.2, form: 500, q: 1.2, a: 0.02, g: 1 }); },
  zebra: (ac, out, t) => { for (let i = 0; i < 4; i++) voiced(ac, out, t + i * 0.22, { f: 520, f1: 700, f2: 420, d: 0.16, form: 1200, q: 1.3, g: 0.8 }); },
  gnu: (ac, out, t) => { for (let i = 0; i < 2; i++) voiced(ac, out, t + i * 0.4, { f: 140, f1: 160, f2: 110, d: 0.3, form: 450, q: 1.5, g: 0.9 }); },
};
