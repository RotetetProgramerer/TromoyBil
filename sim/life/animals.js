// The animals on the islands, loaded by game.js (EXTRAS): what lives where and what it does is in life.js, the bodies in rig.js and
// vis.js, the voices in calls.js. This file joins them to the game: it tells the animals where the car, the camera and the horn
// are, makes the big ones something the car can hit (world.movers), and turns what happens into toasts, muttere, penalty seconds,
// camera shakes and sounds. It runs every frame, also during the activities and on the ferry.
import { U } from '../render/gfx.js';
import { Life } from './life.js';
import { AnimalVis } from './vis.js';
import { Calls } from './calls.js';
import { SPECIES } from './species.js';

const ONE = { elg: 'en elg', radyr: 'et rådyr', sau: 'en sau', ku: 'ei ku', hund: 'en hund', rein: 'en rein', love: 'en løve', gepard: 'en gepard', krokodille: 'en krokodille', sebra: 'en sebra',
  gnu: 'en gnu', gaselle: 'en gaselle', sjiraff: 'en sjiraff', elefant: 'en elefant', flodhest: 'en flodhest', kaiman: 'en kaiman', kapybara: 'en kapybara', jaguar: 'en jaguar' };

export default class Animals {
  constructor(game) { this.game = game; this.prev = null; this.toastT = 0; }
  async init() {
    const g = this.game;
    this.life = new Life(g.world, { max: +(g.params.get('dyr') ?? 310) });
    g.world.movers.push(this.life.hook);
    this.vis = new AnimalVis(g.gfx);
    this.calls = new Calls(g.snd);
    this.on = g.params.get('dyr') !== '0';
    // every body built now, and every shader (the shadow's too) compiled in the first frame behind the menu, so a new island does
    // not stutter when its animals appear (renderer.compile would miss the shadow's and build for the wrong render target)
    if (this.on) { for (const sp of SPECIES) this.vis.kind(sp); this.vis.warm = true; }
  }
  // what the animals need to know this frame
  view(dt) {
    const g = this.game, f = g.focus(), p = f.pos, cam = g.gfx.camera.position, driving = (g.mode === 'drive' || g.mode === 'race') && !g.act;
    // how fast the focus moves (the car knows; a boat or a skier we work out)
    let vx = 0, vz = 0;
    if (driving || f === g.car) { vx = g.car.vel.x; vz = g.car.vel.z; }
    else if (this.prev && dt > 0) { vx = (p.x - this.prev.x) / dt; vz = (p.z - this.prev.z) / dt; if (Math.hypot(vx, vz) > 120) vx = vz = 0; }
    this.prev = { x: p.x, z: p.z };
    const c = g.courses && g.courses.active, I = g.input;
    return { fx: p.x, fz: p.z, cx: cam.x, cy: cam.y, cz: cam.z, tx: p.x, tz: p.z, tvx: vx, tvz: vz, car: driving ? g.car : null,
      honk: driving && !!I && (I.has('horn') || !!I.touch.horn), night: U.uNight.value, lights: !!(g.vis && g.vis.lights),
      pen: driving && g.mode !== 'ferry' ? (c ? (c.count > 0 ? null : 'course') : 'nuts') : null };
  }
  frame(dt) {
    if (!this.on || !this.life) return;
    const g = this.game, V = this.view(dt);
    // after a jump (the start, off the ferry, towed home) everything round the new place at once, not a few cells at a time
    if (this.jx == null || Math.hypot(V.fx - this.jx, V.fz - this.jz) > 150 || this.jm === 'ferry' && g.mode !== 'ferry') { this.life.drop(V); this.life.fill(V); }
    this.jx = V.fx; this.jz = V.fz; this.jm = g.mode;
    if (g.mode !== 'pause') this.life.update(dt, V);          // the pause menu stops them too
    this.vis.update(this.life.animals, V.car && (V.lights || V.night > 0.6) ? 1 : 0);          // the eyes shine when the headlights are on
    for (const e of this.life.events) this.handle(e, V);
    this.life.events.length = 0;
    this.toastT -= dt;
  }
  handle(e, V) {
    const g = this.game, a = e.a, sp = a.sp, cam = g.gfx.camera.position;
    switch (e.type) {
      case 'attack': {
        // a predator got the car: it costs 3 muttere while roaming, 5 seconds in a race
        const c = g.courses.active;
        if (e.pen === 'course' && c) { c.pen += 5; g.ui.toast(`${sp.name} angrep! +5 s`, true); }
        else { const n = Math.min(g.prof.nuts, 3); g.prof.nuts -= n; g.saveProf(); g.ui.toast(`${sp.name} angrep!${n ? ' −' + n + ' ⚙' : ''}`, true); }
        g.cam.shake = Math.max(g.cam.shake || 0, 0.35);
        g.snd.event && g.snd.event('thump', { size: 1 });
        this.call(sp.call || 'lion', a, { roar: true });
        break;
      }
      case 'warn': if (this.toastT <= 0) { g.ui.toast(e.text, true); this.toastT = 6; } break;
      case 'hit':
        if (sp.mass >= 300) g.cam.shake = Math.max(g.cam.shake || 0, 0.3);
        if (this.toastT <= 0 && ONE[sp.id]) { g.ui.toast(`Du kjørte på ${ONE[sp.id]}!` + (a.st === 'down' ? ' Den gikk over ende, men kommer seg på beina igjen.' : ' Den løp sin vei.'), true); this.toastT = 4; }
        if (sp.call && sp.mass > 20) this.call(sp.call, a, { alarm: true });
        break;
      case 'call': this.call(e.kind, a, e); break;
      case 'splash': { const d = Math.hypot(a.x - cam.x, a.z - cam.z); if (d < 40) g.snd.event && g.snd.event('splash', { size: Math.min(1, sp.mass / 300) * (1 - d / 40) }); break; }
    }
  }
  call(kind, a, o = {}) {
    if (!kind) return;
    const cam = this.game.gfx.camera, dx = a.x - cam.position.x, dz = a.z - cam.position.z, d = Math.hypot(dx, dz, a.y - cam.position.y);
    // left or right of where the camera looks
    const fx = -cam.matrixWorld.elements[8], fz = -cam.matrixWorld.elements[10], pan = (fx * dz - fz * dx) / Math.max(1, Math.hypot(fx, fz) * Math.hypot(dx, dz));
    this.calls.play(kind, pan, d, { alarm: o.alarm, roar: o.roar, inside: this.game.cam && this.game.cam.inside });
  }
}
