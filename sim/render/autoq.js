// Automatic graphics quality: the game starts on Middels (Lav on touch screens) and watches the frame time. When the frames
// stay slow the preset is stepped down one level (with a toast), when they stay fast it is stepped up once, never above Høy, and
// never again upwards after a step down (remembered in the store as 'qualityDown', so a machine that is slow one level up does not
// go up and down on every visit). A preset the player picks in Innstillinger wins for good (store 'qualityAuto' = false).
// The frames in the menu, the pause and the garage do not count (the toast cannot be seen there), and a steady interval under
// 36 ms is the screen's own pace (a 30 Hz screen, a browser's 30 fps power saving), not slow frames.
// tick(ms) drives everything from the frame time it is given, so a test can feed slow frames and watch the step down.
// (No imports: the preset table comes in as opts.presets, so the Node test runs without three.js.)
const ORDER = ['lav', 'middels', 'hoy', 'ultra'], TOP = 'hoy';
const SLOW = 28, FAST = 9;            // ms of frame time (EMA): step down above SLOW for 4 s, up below FAST for 12 s
const CAP = 36, STEADY = 3;           // …but not while the interval stays under CAP and varies by less than STEADY ms (EMA)
const IDLE = { menu: 1, pause: 1, garage: 1 };
const GUARD = { load: 6000, change: 4000, jump: 3000 };

export class AutoQ {
  constructor(gfx, game, store, opts = {}) {
    this.gfx = gfx; this.game = game; this.store = store; this.presets = opts.presets || {};
    this.auto = opts.auto !== false; this.ema = this.jit = 0; this.slowT = 0; this.fastT = 0; this.down = !!opts.down; this.busy = false;
    this.quiet = GUARD.load; this.isl = game.island && game.island();
    // the settings path (game.set('quality') from Innstillinger) marks the choice as the player's own; our own steps go through
    // game.set too (so the settings, the store and the buttons agree) with busy set
    const set = gfx.setQuality.bind(gfx);
    gfx.setQuality = q => { if (!this.busy) this.manual(); set(q); this.quiet = Math.max(this.quiet, GUARD.change); this.reset(); };
  }
  get q() { return this.gfx.qName; }
  manual() { this.auto = false; this.store.set('qualityAuto', false); }
  reset() { this.ema = this.jit = this.slowT = this.fastT = 0; }
  // one frame of ms wall time (the raw rAF delta)
  tick(ms) {
    const g = this.game;
    // a teleport, a ferry trip or a new place to look from: the world streams in, so the frames are slow for a while
    let jump = g.cam && g.cam.snap;
    if (g.island) { const isl = g.island(); if (isl !== this.isl) { this.isl = isl; jump = true; } }
    if (jump) { this.quiet = Math.max(this.quiet, GUARD.jump); this.reset(); }
    if (IDLE[g.mode]) { this.reset(); return; }
    if (!this.auto || !(ms > 0) || ms > 250) return;            // (a hidden tab or a long stall is not a slow frame)
    if (this.quiet > 0) { this.quiet -= ms; return; }
    const k = Math.min(1, ms / 500);                            // time constant ≈ 0.5 s
    if (this.ema) { this.jit += (Math.abs(ms - this.ema) - this.jit) * k; this.ema += (ms - this.ema) * k; } else this.ema = ms;
    this.slowT = this.ema > SLOW && (this.ema > CAP || this.jit > STEADY) ? this.slowT + ms : 0;
    this.fastT = this.ema < FAST ? this.fastT + ms : 0;
    const i = ORDER.indexOf(this.q);
    if (this.slowT >= 4000 && i > 0) this.step(ORDER[i - 1], true);
    else if (this.fastT >= 12000 && !this.down && i >= 0 && i < ORDER.indexOf(TOP)) this.step(ORDER[i + 1], false);
  }
  step(q, down) {
    if (down) { this.down = true; this.store.set('qualityDown', true); }
    this.busy = true;
    try { this.game.set('quality', q); } finally { this.busy = false; }
    this.store.set('qualityAuto', true);
    const name = (this.presets[q] || {}).name || q;
    if (this.game.ui) this.game.ui.toast(down ? `Grafikken er satt ned til ${name} for jevnere bilde` : `Grafikken er satt opp til ${name} – bildet er jevnt`);
  }
}
