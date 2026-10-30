// The world around the car, from env = {sea, forest, rain, wind, night, town, inside} (0–1 each).
// Beds (sea swell and foam, wind and leaves, town hum, crickets, rain) are fixed layers that are only connected while heard;
// birds, gulls, owls and passing cars are one-shot calls at random times. Inside the car the world comes through the glass
// (a lowpass), except the rain, which drums on the roof.
import { clamp, smooth, rand, pick, setp, gain, filt, chain, loop, Gate, panner } from './synth.js';

const ri = n => Math.floor(Math.random() * (n + 1));

export class Ambient {
  constructor(ac, out, B) {
    this.ac = ac; this.B = B;
    this.mufF = filt(ac, 'lowpass', 18000, 0.5); this.muf = gain(ac, 1); chain(this.mufF, this.muf, out);
    const bus = this.mufF, lay = (dest, src, ...f) => { const g = gain(ac, 0); chain(src, ...f, g); return { g, gate: new Gate(g, dest) }; };
    // sea: a surf bed that swells with each wave, and foam hissing as it breaks and draws back
    this.seaF = filt(ac, 'lowpass', 400, 0.7); this.sea = lay(bus, loop(ac, B.pink), this.seaF);
    this.foamF = filt(ac, 'bandpass', 3000, 0.4); this.foam = lay(bus, loop(ac, B.white), filt(ac, 'highpass', 1200, 0.5), this.foamF);
    // wind: a low roar in gusts, and leaves rustling in the trees
    this.windF = filt(ac, 'bandpass', 350, 0.5); this.wind = lay(bus, loop(ac, B.pink), this.windF);
    this.leafF = filt(ac, 'bandpass', 3000, 0.4); this.leaf = lay(bus, loop(ac, B.white), this.leafF, filt(ac, 'highshelf', 6000, 0.7, -6));
    // town: the far-off hum of traffic
    this.town = lay(bus, loop(ac, B.brown), filt(ac, 'lowpass', 170, 0.8));
    this.townH = lay(bus, loop(ac, B.pink), filt(ac, 'bandpass', 600, 0.5));
    // crickets: a 4–5 kHz tone pulsed ~30 times a second, in chirps two or three times a second
    this.crk = [[4300, 29, 2.3], [4750, 33, 2.9]].map(([f, p, c]) => {
      const o = ac.createOscillator(); o.frequency.value = f;
      const am1 = gain(ac, 0.5), am2 = gain(ac, 0.5), l = lay(bus, o, am1, am2);
      for (const [hz, g] of [[p, am1], [c, am2]]) { const m = ac.createOscillator(); m.type = 'square'; m.frequency.value = hz; const d = gain(ac, 0.5); chain(m, d); d.connect(g.gain); m.start(); }
      o.start(); return l;
    });
    // rain: outside a hiss and drops on the ground, inside the drumming on the roof
    this.rHiss = lay(out, loop(ac, B.white), filt(ac, 'highpass', 2500, 0.5), filt(ac, 'lowpass', 9000, 0.5));
    this.rDrop = lay(out, loop(ac, B.drops), filt(ac, 'highpass', 1000, 0.6));
    this.roof = lay(out, loop(ac, B.drops, 0.8), filt(ac, 'lowpass', 1800, 0.7), filt(ac, 'peaking', 350, 1.2, 8));
    this.T = { bird: 1, bird2: rand(2, 6), cuckoo: rand(10, 40), wood: rand(10, 30), owl: rand(4, 12), gull: rand(3, 10), oyster: rand(10, 30), car: rand(3, 10) };
    this.wave = { t: 0, len: 8, amp: 1 }; this.gust = 0; this.time = 0;
  }
  update(t, dt, env, inside) {
    const e = k => clamp(+env[k] || 0, 0, 1), sea = e('sea'), forest = e('forest'), rain = e('rain'), wind = e('wind'), night = e('night'), town = e('town');
    const day = 1 - smooth(0.3, 0.8, night), dusk = smooth(0.15, 0.4, night) * (1 - smooth(0.6, 0.9, night));
    this.time += dt;
    setp(this.mufF.frequency, 18000 * Math.pow(1400 / 18000, inside), t, 0.06); setp(this.muf.gain, 1 - 0.5 * inside, t, 0.06);
    const L = (l, g, tau = 0.15) => { l.gate.set(g > 1e-4, dt); setp(l.g.gain, g, t, tau); };
    // sea: each wave swells for about half its length, breaks, and the foam draws back
    const w = this.wave; w.t += dt;
    if (w.t > w.len) { w.t = 0; w.len = rand(6, 11); w.amp = rand(0.6, 1.2); }
    const p = w.t / w.len, swell = p < 0.55 ? (p / 0.55) ** 2 : Math.exp(-(p - 0.55) * 6), br = p >= 0.5 ? Math.exp(-(p - 0.5) * 5) * smooth(0.5, 0.56, p) : 0;
    L(this.sea, sea * 0.22 * (0.3 + 0.7 * swell * w.amp)); setp(this.seaF.frequency, 250 + 700 * swell, t, 0.2);
    L(this.foam, sea * 0.06 * br * w.amp); setp(this.foamF.frequency, 2000 + 2500 * br, t, 0.2);
    // wind: gusts as a slow random walk
    this.gust += (-this.gust * 0.35 + (Math.random() - 0.5) * 4) * dt;
    const gs = 0.5 + 0.5 * Math.tanh(this.gust);
    L(this.wind, wind * 0.12 * (0.35 + 0.65 * gs), 0.3); setp(this.windF.frequency, 250 + 300 * gs, t, 0.3);
    L(this.leaf, wind * forest * 0.05 * (0.2 + 0.8 * gs) + forest * 0.004, 0.3); setp(this.leafF.frequency, 2200 + 1500 * gs, t, 0.3);
    L(this.town, town * 0.1 * (0.85 + 0.15 * Math.sin(this.time * 0.23))); L(this.townH, town * 0.025 * (0.7 + 0.3 * Math.sin(this.time * 0.37)));
    for (let i = 0; i < 2; i++) L(this.crk[i], 0.016 * smooth(0.4, 0.8, night) * (1 - rain) * (1 - 0.6 * town) * (1 - 0.5 * sea) * (1 - wind * 0.6) * (i ? 0.7 : 1), 0.5);
    L(this.rHiss, 0.05 * rain ** 1.2 * (1 - inside)); L(this.rDrop, 0.1 * rain ** 0.7 * (1 - inside)); L(this.roof, 0.45 * rain ** 0.8 * inside);
    // calls
    const T = this.T, tick = (k, rate, lo, hi, f) => { if (rate <= 0) return; T[k] -= dt * rate; if (T[k] <= 0) { T[k] = rand(lo, hi); f(); } };
    const birds = forest * day * (1 - 0.7 * rain) * (1 - 0.5 * wind);
    tick('bird', birds, 1.2, 4.5, () => this.sing(...pick([this.chaffinch, this.chaffinch, this.greatTit, this.greatTit, this.warbler, this.blackbird, this.raven]).call(this)));
    tick('cuckoo', birds, 25, 70, () => this.sing(...this.cuckoo()));
    tick('wood', birds, 15, 45, () => this.drum());
    tick('bird2', forest * dusk * 2, 2, 6, () => this.sing(...this.blackbird()));    // blackbirds sing on into the dusk
    tick('owl', forest * smooth(0.5, 0.9, night) * (1 - 0.6 * rain), 12, 30, () => this.sing(...(Math.random() < 0.6 ? this.tawny() : this.pygmy())));
    tick('gull', sea * (0.3 + 0.7 * day), 5, 18, () => this.sing(...this.gull()));
    tick('oyster', sea * day, 18, 45, () => this.sing(...this.oyster()));
    tick('car', town, 6, 20, () => this.pass());
  }
  // a call: one oscillator whose pitch and level follow the notes [start, length, f0, f1, level, f2 (glide back)];
  // far-off birds are quieter and duller; placed at random left/right
  sing(notes, o = {}) {
    const ac = this.ac, t0 = ac.currentTime + 0.02, d = o.dist ?? rand(0.15, 1);
    const g0 = gain(ac, (o.vol ?? 0.05) * 2.5 * (1 - 0.75 * d)), lp = filt(ac, 'lowpass', 12000 - 7000 * d, 0.5);
    chain(g0, lp, panner(ac, this.mufF, rand(-0.9, 0.9)));
    let out = g0; if (o.bp) { const b = filt(ac, 'bandpass', o.bp[0], o.bp[1]); b.connect(g0); out = b; }
    const s = ac.createOscillator(), g = gain(ac, 0); s.type = o.type || 'sine'; chain(s, g, out);
    let end = t0;
    for (const [dt, dur, f0, f1, a = 1, f2] of notes) {
      const t = t0 + dt, F = s.frequency, G = g.gain;
      F.setValueAtTime(f0, t);
      if (f2) { F.linearRampToValueAtTime(f1, t + dur * 0.5); F.linearRampToValueAtTime(f2, t + dur); } else F.linearRampToValueAtTime(f1, t + dur);
      G.setValueAtTime(0, t); G.linearRampToValueAtTime(a, t + Math.min(0.012, dur * 0.25)); G.linearRampToValueAtTime(a * 0.8, t + dur * 0.7); G.linearRampToValueAtTime(0, t + dur);
      end = Math.max(end, t + dur);
    }
    if (o.vib) { const l = ac.createOscillator(), lg = gain(ac, o.vib[1]); l.frequency.value = o.vib[0]; chain(l, lg); lg.connect(s.frequency); l.start(t0); l.stop(end + 0.1); }
    s.start(t0); s.stop(end + 0.1);
  }
  // chaffinch (bokfink): a run of notes falling and speeding up, ending in a flourish
  chaffinch() {
    const n = [], s = rand(0.92, 1.08); let t = 0;
    for (let i = 0, k = 3 + ri(2); i < k; i++) { n.push([t, 0.07, 5200 * s, 4300 * s, 0.7]); t += 0.12; }
    for (let i = 0; i < 4; i++) { n.push([t, 0.05, 4400 * s, 3600 * s, 0.85]); t += 0.085; }
    for (let i = 0; i < 4; i++) { n.push([t, 0.04, 3600 * s, 3000 * s, 1]); t += 0.065; }
    n.push([t + 0.03, 0.32, 2900 * s, 4800 * s, 1, 2300 * s]);
    return [n, { vol: 0.05 }];
  }
  // great tit (kjøttmeis): "ti-tü ti-tü ti-tü"
  greatTit() {
    const n = [], s = rand(0.94, 1.06); let t = 0;
    for (let i = 0, k = 3 + ri(3); i < k; i++) { n.push([t, 0.08, 6000 * s, 5600 * s, 0.8]); n.push([t + 0.12, 0.13, 4100 * s, 3900 * s, 1]); t += 0.36; }
    return [n, { vol: 0.045 }];
  }
  // willow warbler (løvsanger): a soft cascade of sweet notes, falling
  warbler() {
    const n = [], s = rand(0.95, 1.05), k = 12 + ri(4); let t = 0;
    for (let i = 0; i < k; i++) { const f = (4300 - 1500 * i / k) * s; n.push([t, 0.085, f * 1.08, f * 0.94, 0.5 + 0.5 * Math.sin(Math.PI * i / k)]); t += 0.14 - 0.03 * i / k; }
    return [n, { vol: 0.035 }];
  }
  // blackbird (svarttrost): mellow fluted phrases, a quiet high twitter at the end
  blackbird() {
    const n = [], s = rand(0.9, 1.1); let t = 0;
    for (let i = 0, k = 4 + ri(3); i < k; i++) { const f = rand(1500, 2700) * s, d = rand(0.12, 0.28); n.push([t, d, f, f * rand(0.85, 1.2), rand(0.6, 1), f * rand(0.9, 1.1)]); t += d + rand(0.03, 0.08); }
    for (let i = 0; i < 3; i++) { n.push([t, 0.04, 6500 * s, 7200 * s, 0.25]); t += 0.06; }
    return [n, { vol: 0.05, type: 'triangle' }];
  }
  // raven (ravn): two or three hoarse "kronk"s
  raven() {
    const n = [], s = rand(0.9, 1.1);
    for (let i = 0, k = 2 + ri(1); i < k; i++) n.push([i * 0.45, 0.22, 420 * s, 340 * s, 1]);
    return [n, { vol: 0.06, type: 'sawtooth', bp: [900, 1.2], vib: [70, 40], dist: rand(0.4, 1) }];
  }
  // cuckoo (gjøk): "ku-kuu", a falling minor third, a few times
  cuckoo() {
    const n = [], s = rand(0.97, 1.03);
    for (let i = 0, k = 3 + ri(4); i < k; i++) { const t = i * 0.95; n.push([t, 0.14, 690 * s, 670 * s, 1]); n.push([t + 0.26, 0.3, 565 * s, 545 * s, 0.85]); }
    return [n, { vol: 0.07, dist: rand(0.5, 1) }];
  }
  // tawny owl (kattugle): a long hoot, a pause, then a quavering "hu, hu-huuuu"
  tawny() {
    const s = rand(0.95, 1.05);
    return [[[0, 0.75, 470 * s, 455 * s, 1], [3.2, 0.12, 470 * s, 470 * s, 0.6], [3.55, 0.12, 460 * s, 460 * s, 0.7], [3.8, 1.1, 480 * s, 450 * s, 1]], { vol: 0.06, vib: [9, 8], dist: rand(0.4, 1) }];
  }
  // pygmy owl (spurveugle): a steady row of soft whistles
  pygmy() {
    const n = [], s = rand(0.95, 1.05);
    for (let i = 0, k = 6 + ri(6); i < k; i++) n.push([i * 0.5, 0.11, 1350 * s, 1300 * s, 1]);
    return [n, { vol: 0.035, dist: rand(0.4, 1) }];
  }
  // herring gull (gråmåke): a long "kyaaw" and a laughing row
  gull() {
    const n = [[0, 0.32, 1350, 1800, 1, 1100]], s = rand(0.9, 1.1);
    for (let i = 0, k = 3 + ri(4); i < k; i++) n.push([0.45 + i * 0.2, 0.13, 1500 * s, 1700 * s, 0.8, 1200 * s]);
    return [n, { vol: 0.07, type: 'sawtooth', bp: [1800, 1.2], vib: [35, 25] }];
  }
  // oystercatcher (tjeld): shrill piping "kli-kli-kli"
  oyster() {
    const n = [], s = rand(0.95, 1.05);
    for (let i = 0, k = 6 + ri(6); i < k; i++) n.push([i * 0.11, 0.06, 3300 * s, 3000 * s, 1]);
    return [n, { vol: 0.04 }];
  }
  // great spotted woodpecker drumming: a fast roll of knocks that fades
  drum() {
    const ac = this.ac, t0 = ac.currentTime + 0.02, d = rand(0.3, 1), s = ac.createBufferSource(), g = gain(ac, 0), k = 12 + ri(8);
    s.buffer = this.B.white;
    chain(s, filt(ac, 'bandpass', rand(900, 1300), 5), g, gain(ac, 1.2 * (1 - 0.7 * d)), panner(ac, this.mufF, rand(-0.9, 0.9)));
    for (let i = 0; i < k; i++) { const t = t0 + i * (0.045 + 0.001 * i), a = 1 - 0.6 * i / k; g.gain.setValueAtTime(a, t); g.gain.setTargetAtTime(0, t + 0.002, 0.006); }
    s.start(t0, Math.random()); s.stop(t0 + k * 0.06 + 0.1);
  }
  // a car going by somewhere in town: a swelling and falling rush that crosses from one side to the other
  pass() {
    const ac = this.ac, t = ac.currentTime + 0.02, len = rand(4, 7), s = ac.createBufferSource(), f = filt(ac, 'bandpass', 400, 0.7), g = gain(ac, 0);
    s.buffer = this.B.pink; s.loop = true;
    const dir = Math.random() < 0.5 ? -1 : 1, p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    chain(s, f, g); if (p) { chain(g, p, this.mufF); p.pan.setValueAtTime(-0.8 * dir, t); p.pan.linearRampToValueAtTime(0.8 * dir, t + len); } else g.connect(this.mufF);
    f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(900, t + len * 0.5); f.frequency.linearRampToValueAtTime(300, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rand(0.02, 0.05), t + len * 0.5); g.gain.linearRampToValueAtTime(0, t + len);
    s.start(t, Math.random()); s.stop(t + len + 0.1);
  }
}
