// Small WebAudio helpers shared by the sound modules: noise and grain buffers, filters, smooth parameter changes,
// on/off gates for layers and short one-shots (nodes that are made, played once and dropped).
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];

// move an AudioParam towards v; skips the call when the target has not changed (keeps the automation lists short)
export function setp(p, v, t, tau = 0.05) {
  if (p._v !== undefined && Math.abs(p._v - v) <= 1e-4 * Math.max(1, Math.abs(v))) return;
  p._v = v; p.setTargetAtTime(v, t, tau);
}
export function gain(ac, v = 0) { const g = ac.createGain(); g.gain.value = v; return g; }
export function filt(ac, type, f, Q = 0.7, dB = 0) {
  const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = dB; return b;
}
// connect a → b → c … (does not rely on connect() returning its target, which old Safari did not)
export function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
export function panner(ac, out, x) {
  if (!ac.createStereoPanner) return out;
  const p = ac.createStereoPanner(); p.pan.value = clamp(x, -1, 1); p.connect(out); return p;
}

// buffers ------------------------------------------------------------------------------------------------------------
export function buffer(ac, sec, fill) {
  const sr = ac.sampleRate, b = ac.createBuffer(1, Math.floor(sr * sec), sr);
  fill(b.getChannelData(0), sr); return b;
}
// white, pink (−3 dB/oct) or brown (−6 dB/oct) noise; the ends are matched so it loops without a click
export function noise(ac, sec, color = 'white') {
  return buffer(ac, sec, d => {
    let b0 = 0, b1 = 0, b2 = 0, br = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      else if (color === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
      else d[i] = w;
    }
    if (color !== 'white') fixSeam(d);
  });
}
function fixSeam(d) {   // remove the jump between the last and the first sample with a ramp over the whole buffer, then the DC
  const n = d.length, j = d[n - 1] - d[0];
  let m = 0;
  for (let i = 0; i < n; i++) { d[i] -= j * i / n; m += d[i]; }
  m /= n; for (let i = 0; i < n; i++) d[i] -= m;
}
// sparse grains (clicks, crunches, drops, bubbles): rate grains per second, each written by grain(d, i0, sr, amp)
export function grains(ac, sec, rate, grain, ampPow = 2) {
  return buffer(ac, sec, (d, sr) => {
    const n = Math.floor(sec * rate);
    for (let k = 0; k < n; k++) grain(d, Math.floor(Math.random() * d.length), sr, Math.pow(Math.random(), ampPow));
    let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
    if (m > 0) for (let i = 0; i < d.length; i++) d[i] /= m;
  });
}
// write a decaying noise burst (and optionally a decaying sine) into d at i0, wrapping round the end so the buffer loops
export function burstInto(d, i0, sr, amp, tau, f = 0, ring = 0, lp = 1) {
  const n = Math.min(d.length, Math.floor(tau * sr * 6)), N = d.length;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.exp(-i / (tau * sr)), w = Math.random() * 2 - 1;
    y += lp * (w - y);
    d[(i0 + i) % N] += amp * e * (y + (f ? ring * Math.sin(2 * Math.PI * f * i / sr) : 0));
  }
}
// a looping buffer source, started at a random point; rate = playback rate
export function loop(ac, buf, rate = 1) {
  const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
  s.start(0, Math.random() * buf.duration); return s;
}
// a band-limited random signal for slow wobble (white noise played very slowly, then smoothed)
export function wobble(ac, buf, hz) {
  const s = loop(ac, buf, Math.max(0.0005, hz * 4 / ac.sampleRate)), f = filt(ac, 'lowpass', hz, 0.5);
  s.connect(f); return f;
}

// a layer that only takes CPU while it is heard: its output is connected to the bus while active, and cut off a while
// after it falls silent (the gain has long since faded to zero by then)
export class Gate {
  constructor(node, dest) { this.n = node; this.d = dest; this.on = false; this.q = 0; }
  set(active, dt) {
    if (active) { this.q = 0; if (!this.on) { this.n.connect(this.d); this.on = true; } }
    else if (this.on && (this.q += dt) > 2) { this.n.disconnect(); this.on = false; }
  }
}

// one-shots ----------------------------------------------------------------------------------------------------------
// envelope: 0 → peak in a, then an exponential fall that is ~40 dB down after d
export function env(p, t, peak, a, d) {
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a); p.setTargetAtTime(0, t + a, d / 5);
}
// filtered noise burst. o: {t, f, f1 (sweep to), q, type, a, d, g, rate, off (start in the buffer; default random)}
export function burst(ac, out, buf, o) {
  const t = o.t ?? ac.currentTime, a = o.a ?? 0.003, d = o.d ?? 0.2, s = ac.createBufferSource();
  s.buffer = buf; s.playbackRate.value = o.rate ?? 1;
  const f = filt(ac, o.type || 'bandpass', o.f ?? 1000, o.q ?? 0.7), g = gain(ac, 0);
  if (o.f1) { f.frequency.setValueAtTime(o.f, t); f.frequency.exponentialRampToValueAtTime(o.f1, t + a + d); }
  env(g.gain, t, o.g ?? 1, a, d);
  chain(s, f, g, out);
  s.start(t, o.off ?? Math.random() * Math.max(0, buf.duration - a - d - 0.1)); s.stop(t + a + d * 1.3 + 0.05);
  return g;
}
// a short tone: o: {t, f, f1 (glide to), type, a, d, g}
export function tone(ac, out, o) {
  const t = o.t ?? ac.currentTime, a = o.a ?? 0.002, d = o.d ?? 0.1, s = ac.createOscillator(), g = gain(ac, 0);
  s.type = o.type || 'sine'; s.frequency.setValueAtTime(o.f, t);
  if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + a + d);
  env(g.gain, t, o.g ?? 1, a, d);
  chain(s, g, out); s.start(t); s.stop(t + a + d * 1.3 + 0.05);
  return s;
}
