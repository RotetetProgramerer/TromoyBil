// The skier's sound, synthesized like the rest (sim/audio/synth.js): the wind rising with the speed, the glide of the skis on the
// snow, the hiss of the edges in a carve and the scrape of a skid or a plough (harsher on ice), deep snow, pole plants, the thump of
// a landing and a fall; on the chairlift the hum of the haul rope and the clank as the chair runs over the sheaves on each tower.
//   const s = new SkiSound(snd);   s.update(dt, {mode: 'ski'|'lift'|'off', s: Skier});   s.pole(); s.land(hard); s.fall(speed); s.clank(); s.beep(f, d); s.stop();
import { clamp, smooth, rand, setp, gain, filt, chain, loop, burst, tone, Gate } from './synth.js';
import { thump } from './fx.js';

export class SkiSound {
  constructor(snd) {
    const ac = this.ac = snd.ac, B = this.B = snd.B, t = ac.currentTime; this.snd = snd;
    this.out = gain(ac, 0); this.out.connect(snd.carBus); this.out.gain.setTargetAtTime(1, t, 0.3);
    const lay = (src, ...f) => { const g = gain(ac, 0); chain(src, ...f, g); return { g, gate: new Gate(g, this.out) }; };
    this.windF = filt(ac, 'bandpass', 400, 0.6); this.wind = lay(loop(ac, B.pink), this.windF, filt(ac, 'lowpass', 2500, 0.5));
    this.glideS = loop(ac, B.snow, 1); this.glideF = filt(ac, 'lowpass', 1800, 0.6); this.glide = lay(this.glideS, filt(ac, 'highpass', 180, 0.7), this.glideF);
    this.hissF = filt(ac, 'bandpass', 3200, 1.4); this.hiss = lay(loop(ac, B.white), this.hissF);
    this.scrapeS = loop(ac, B.snow, 1.3); this.scrapeF = filt(ac, 'bandpass', 1500, 0.8); this.scrape = lay(this.scrapeS, this.scrapeF, filt(ac, 'highshelf', 3000, 0.7, 6));
    this.ice = lay(loop(ac, B.gravel, 1.6), filt(ac, 'highpass', 2200, 0.7), filt(ac, 'lowpass', 7000, 0.5));
    this.powder = lay(loop(ac, B.brown), filt(ac, 'lowpass', 380, 0.7));
    // the lift: a low hum from the haul rope and the bullwheel, and the rope singing faintly
    this.humO = ac.createOscillator(); this.humO.type = 'sawtooth'; this.humO.frequency.value = 46; this.humO.start();
    this.hum = lay(this.humO, filt(ac, 'lowpass', 160, 0.9)); this.rope = lay(loop(ac, B.pink, 0.6), filt(ac, 'bandpass', 230, 4));
    this.fx = gain(ac, 1); this.fx.connect(this.out); this.ui = gain(ac, 1); this.ui.connect(snd.ui || this.out);
  }
  update(dt, o = {}) {
    const ac = this.ac, t = ac.currentTime, s = o.s, ski = o.mode === 'ski' && s, lift = o.mode === 'lift';
    const L = (l, g, tau = 0.1) => { l.gate.set(g > 1e-4, dt); setp(l.g.gain, g, t, tau); };
    const v = ski ? s.speed : lift ? 2.4 : 0, gnd = ski && !s.air && s.crashT === 0, k = ski ? s.surf : '', deep = k === 'deep', ice = k === 'ice', hard = k === 'groomed' || k === 'packed';
    // the wind in the helmet: about the square of the speed, more in the air
    L(this.wind, ski ? Math.min(0.28, 0.0003 * v * v + 0.01) * (s.air ? 1.4 : 1) * (s.tuck > 0.5 ? 0.8 : 1) : lift ? 0.02 : 0); setp(this.windF.frequency, 280 + v * 22, t, 0.2);
    // the skis gliding on the snow; the edges hissing in a carve; scraping when they skid, plough or stop
    const g1 = gnd && !deep ? 0.07 * smooth(0.5, 12, v) : 0; L(this.glide, g1); setp(this.glideS.playbackRate, 0.6 + v * 0.04, t, 0.1); setp(this.glideF.frequency, 900 + v * 60, t, 0.1);
    L(this.hiss, gnd && hard ? 0.05 * s.carve * smooth(0.1, 0.8, Math.abs(s.inc)) * smooth(4, 20, v) : 0); setp(this.hissF.frequency, 2600 + v * 50, t, 0.1);
    const sk = gnd ? clamp(Math.max(0, s.skid - 0.3) * 0.08 + s.plow * 0.08 * smooth(0.5, 5, v) + Math.abs(s.hock) * 0.22 * smooth(1, 6, v), 0, 0.3) : 0;
    L(this.scrape, sk * (ice ? 1.3 : deep ? 0.3 : 1)); setp(this.scrapeS.playbackRate, 1 + v * 0.03, t, 0.1); setp(this.scrapeF.frequency, ice ? 3200 : 1400 + v * 40, t, 0.1);
    L(this.ice, gnd && ice ? 0.06 * smooth(1, 10, v) : 0);
    L(this.powder, gnd && deep ? 0.18 * smooth(1, 12, v) : 0);
    L(this.hum, lift ? 0.05 : 0); L(this.rope, lift ? 0.025 : 0);
  }
  // one-shots: a pole planted in the snow, a landing, a fall, the chair over a tower's sheaves, a beep (countdown, gates)
  pole() { const ac = this.ac, t = ac.currentTime; tone(ac, this.fx, { t, f: 1900, f1: 1300, type: 'square', d: 0.03, g: 0.025 }); burst(ac, this.fx, this.B.snow, { t, f: 2500, q: 0.8, a: 0.002, d: 0.05, g: 0.12 }); }
  land(hard) { const ac = this.ac, I = clamp(hard / 8, 0.1, 1); thump(ac, this.fx, this.B, I); burst(ac, this.fx, this.B.snow, { f: 1200, q: 0.6, a: 0.004, d: 0.12 + 0.15 * I, g: 0.5 * I }); }
  fall(speed) {
    const ac = this.ac, t = ac.currentTime, I = clamp(speed / 15, 0.2, 1);
    for (let i = 0; i < 2 + Math.round(3 * I); i++) { const ti = t + i * rand(0.12, 0.22); burst(ac, this.fx, this.B.brown, { t: ti, type: 'lowpass', f: 220, q: 0.8, a: 0.004, d: 0.15, g: 0.9 * I }); burst(ac, this.fx, this.B.snow, { t: ti, f: 1600, q: 0.5, a: 0.004, d: 0.25, g: 0.6 * I }); }
    tone(ac, this.fx, { t: t + 0.02, f: 260, f1: 140, type: 'triangle', d: 0.12, g: 0.06 });     // a grunt
  }
  clank() { const ac = this.ac, t = ac.currentTime; for (const [d, f] of [[0, 340], [0.11, 300], [0.24, 360]]) { tone(ac, this.fx, { t: t + d, f, type: 'triangle', d: 0.25, g: 0.05 }); tone(ac, this.fx, { t: t + d, f: f * 2.71, type: 'sine', d: 0.18, g: 0.02 }); burst(ac, this.fx, this.B.white, { t: t + d, f: 2400, q: 2, a: 0.001, d: 0.03, g: 0.08 }); }
    burst(ac, this.fx, this.B.brown, { t, type: 'lowpass', f: 140, q: 0.9, a: 0.003, d: 0.2, g: 0.35 }); }
  beep(f = 880, d = 0.15) { tone(this.ac, this.ui, { f, type: 'triangle', a: 0.005, d, g: 0.09 }); }
  stop() { const t = this.ac.currentTime; this.out.gain.setTargetAtTime(0, t, 0.08); setTimeout(() => { try { this.humO.stop(); } catch (e) { } this.out.disconnect(); }, 600); }
}
