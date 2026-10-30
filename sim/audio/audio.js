// Sound for the car simulator. Everything is synthesized with WebAudio: no sound files.
//
//   const snd = new Sound();             makes nothing audible yet ({context} to render into an OfflineAudioContext)
//   await snd.unlock();                  on the first user gesture: creates (or resumes) the AudioContext
//   snd.setCar(spec);                    the engine voice for a car from sim/data/cars.js
//   snd.update(dt, car, env);            every frame. car: the Vehicle (sim/physics/vehicle.js);
//                                        env: {inside (cockpit camera), sea, forest, rain, wind, night, town} 0–1 each
//   snd.setVolume({master, car, ambient});   snd.mute(bool)
//   snd.event(name, opts)                'horn' {on}, 'shift', 'door', 'splash' {size}, 'crash' {impulse N·s}, 'click', 'gravelHit'
//
// update() also finds gear changes, impacts (car.lastHit), bumps, splashes and stones by itself, so the events above are only
// needed for things the physics does not know about (or to force one).
//
// The mix: master → limiter → speakers. Under master: the car (engine outside/inside crossfaded by env.inside; wheels and
// wind through a cabin filter; crashes, horn and doors), the ambience and the UI.
import { clamp, rand, setp, gain, filt, chain, noise, grains, burstInto, buffer } from './synth.js';
import { EngineSound, voiceFor, workletURL } from './engine.js';
import { Road } from './road.js';
import { Ambient } from './ambient.js';
import { crash, door, clunk, thump, splash, stone, bov, click, Horn } from './fx.js';

// the shared buffers: noise colours and grains (gravel, snow, mud, rain drops, glass)
function buffers(ac) {
  const bubble = (d, i0, sr, a) => {
    const f0 = rand(90, 320), dur = rand(0.015, 0.05), n = Math.floor(dur * sr * 3), N = d.length; let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * f0 * (1 + 1.5 * t / dur) / sr; d[(i0 + i) % N] += a * Math.exp(-t / dur) * Math.sin(ph); }
  };
  return {
    white: noise(ac, 3), pink: noise(ac, 4, 'pink'), brown: noise(ac, 4, 'brown'),
    // gravel: dry clicks of stone on stone and on rubber, some with a ring
    gravel: grains(ac, 3, 700, (d, i, sr, a) => burstInto(d, i, sr, a, rand(0.0003, 0.0012), rand(1500, 6000), Math.random() < 0.3 ? 0.8 : 0, 0.9)),
    // snow: soft dense crunch, and now and then a squeak
    snow: grains(ac, 3, 1150, (d, i, sr, a) => Math.random() < 0.03 ? burstInto(d, i, sr, a * 0.6, 0.02, rand(900, 1800), 2, 0.03) : burstInto(d, i, sr, a, rand(0.001, 0.003), 0, 0, 0.35)),
    // mud: bubbles popping and wet slaps
    mud: grains(ac, 3, 140, (d, i, sr, a) => Math.random() < 0.6 ? bubble(d, i, sr, a) : burstInto(d, i, sr, a * 0.7, rand(0.02, 0.06), 0, 0, 0.06), 1.5),
    // rain drops
    drops: grains(ac, 3, 420, (d, i, sr, a) => burstInto(d, i, sr, a, rand(0.0005, 0.002), rand(2000, 6000), Math.random() < 0.2 ? 1 : 0.2, 0.6)),
    // breaking glass: many small bright pieces, most at the start
    glass: buffer(ac, 1.2, (d, sr) => {
      for (let k = 0; k < 260; k++) { const r = Math.random(), tk = 1.1 * r * r; burstInto(d, Math.floor(tk * sr), sr, (1 - tk / 1.2) * rand(0.2, 1), rand(0.004, 0.02), rand(2500, 9000), 1.2, 0.9); }
      let m = 0; for (const x of d) m = Math.max(m, Math.abs(x)); for (let i = 0; i < d.length; i++) d[i] /= m || 1;
    }),
  };
}

export class Sound {
  constructor(opts = {}) {
    this.ac = opts.context || null; this.worklet = opts.worklet !== false;
    this.vol = { master: 0.8, car: 1, ambient: 0.7 }; this.muted = false; this.ready = false;
    this.spec = null; this.engine = null; this.inside = 0; this._hit = null; this.crashT = -9; this.crashJ = 0; this.shiftT = -9;
    this.emit = (name, o) => this.event(name, o);
  }
  // call from a user gesture (click, touch, key). The resume and the silent sample must happen inside the gesture (iOS).
  unlock() {
    if (!this.ac) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return Promise.resolve(false);
      try { this.ac = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ac = new AC(); }
    }
    const ac = this.ac, live = typeof ac.startRendering !== 'function';
    if (live && ac.state !== 'running') {
      try { ac.resume().catch(() => { }); } catch (e) { }
      try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, ac.sampleRate); s.connect(ac.destination); s.start(0); } catch (e) { }
    }
    return this._init || (this._init = this.init(live));
  }
  async init(live) {
    const ac = this.ac;
    if (this.worklet && ac.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try { await ac.audioWorklet.addModule(workletURL()); } catch (e) { this.worklet = false; }
    } else this.worklet = false;
    this.build();
    this.ready = true;
    if (this.spec) { const s = this.spec; this.spec = null; this.setCar(s); }
    if (live && typeof document !== 'undefined') {
      // stop the audio thread while the page is hidden (the game loop stops too)
      document.addEventListener('visibilitychange', () => { if (document.hidden) ac.suspend().catch(() => { }); else ac.resume().catch(() => { }); });
    }
    return true;
  }
  build() {
    const ac = this.ac;
    this.B = buffers(ac);
    const L = this.limiter = ac.createDynamicsCompressor();
    L.threshold.value = -10; L.knee.value = 6; L.ratio.value = 12; L.attack.value = 0.003; L.release.value = 0.2;
    // and a soft clipper after it for what gets past the compressor's attack: straight up to 0.75, then rounding off below 1
    const clip = ac.createWaveShaper(), c = new Float32Array(2049);
    for (let i = 0; i < c.length; i++) { const x = i / 1024 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a < 0.75 ? a : 0.75 + 0.24 * Math.tanh((a - 0.75) / 0.24)); }
    clip.curve = c;
    this.master = gain(ac, this.muted ? 0 : this.vol.master); chain(this.master, L, clip, ac.destination);
    this.carBus = gain(ac, this.vol.car); this.carBus.connect(this.master);
    this.ext = gain(ac, 1); this.int = gain(ac, 0); this.ext.connect(this.carBus); this.int.connect(this.carBus);   // engine outside / inside
    this.body = gain(ac, 1); this.cabin = filt(ac, 'lowpass', 16000, 0.5); chain(this.body, this.cabin, this.carBus);   // wheels, wind, bumps
    this.fx = gain(ac, 1); this.fx.connect(this.carBus);                                                        // crashes, doors, horn
    this.ambBus = gain(ac, this.vol.ambient); this.ambBus.connect(this.master);
    this.ui = gain(ac, 0.6); this.ui.connect(this.master);
    this.road = new Road(ac, this.body, this.B);
    this.amb = new Ambient(ac, this.ambBus, this.B);
    this.horn = new Horn(ac, this.fx);
  }
  setCar(spec) {
    if (!spec || (this.spec && spec.id === this.spec.id && this.engine)) return;
    this.spec = spec;
    if (!this.ready) return;
    if (this.engine) this.engine.stop();
    this.engine = new EngineSound(this.ac, this.ext, this.int, spec, this.B, this.worklet);
    this.horn.voice(voiceFor(spec).horn, spec.id === 'knott');
  }
  update(dt, car, env = {}) {
    if (!this.ready) return;
    const t = this.ac.currentTime, inside = clamp(+env.inside || 0, 0, 1);
    dt = clamp(dt || 0, 0, 0.1); this.inside = inside;
    setp(this.ext.gain, 1 - inside, t, 0.05); setp(this.int.gain, 0.8 * inside, t, 0.05);
    setp(this.cabin.frequency, 16000 * Math.pow(1300 / 16000, inside), t, 0.05);
    if (car) {
      if (car.spec && (!this.spec || car.spec.id !== this.spec.id || !this.engine)) this.setCar(car.spec);
      if (this.engine) this.engine.update(t, dt, car, env, this.emit);
      this.road.update(t, dt, car, env, inside, this.emit);
      const h = car.lastHit;
      if (car !== this._car) { this._car = car; this._hit = h; }               // a hit from before we saw this car is old news
      if (h && h !== this._hit) { this._hit = h; this.event('crash', { impulse: h.j }); }
    }
    this.amb.update(t, dt, env, inside);
  }
  setVolume(v = {}) {
    for (const k of ['master', 'car', 'ambient']) if (typeof v[k] === 'number') this.vol[k] = clamp(v[k], 0, 1);
    if (!this.ready) return;
    const t = this.ac.currentTime;
    setp(this.master.gain, this.muted ? 0 : this.vol.master, t, 0.03); setp(this.carBus.gain, this.vol.car, t, 0.03); setp(this.ambBus.gain, this.vol.ambient, t, 0.03);
  }
  mute(m = true) { this.muted = !!m; this.setVolume(); }
  event(name, o = {}) {
    if (!this.ready) return;
    const ac = this.ac, t = ac.currentTime, B = this.B, ins = this.inside;
    switch (name) {
      case 'horn':
        if (o.on === undefined) { this.horn.set(true, ins); setTimeout(() => this.horn.set(false), 350); }
        else this.horn.set(!!o.on, ins);
        break;
      case 'shift': if (t - this.shiftT > 0.15) { this.shiftT = t; clunk(ac, this.fx, B, 0.4 + 0.6 * ins); } break;
      case 'door': door(ac, this.fx, B); break;
      case 'splash': splash(ac, this.fx, B, o.size ?? 0.5); break;
      case 'crash': {
        const j = o.impulse ?? 5000;
        if (t - this.crashT < 0.08 && j < this.crashJ * 1.5) break;     // scraping along a wall: not a new crash every frame
        this.crashT = t; this.crashJ = j; crash(ac, this.fx, B, j); break;
      }
      case 'click': click(ac, this.ui); break;
      case 'gravelHit': stone(ac, this.body, B, o.size); break;
      case 'thump': thump(ac, this.body, B, (o.size ?? 0.5) * (0.6 + 0.4 * ins)); break;
      case 'bov': bov(ac, this.fx, B, (o.size ?? 0.5) * (1 - 0.5 * ins), o.diesel); break;
    }
  }
}
