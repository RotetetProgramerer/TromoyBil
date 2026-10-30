// The game: the player's car, the modes (menu, driving, courses, garage, map, ferry, pause), saving, the garage shop and the
// settings. The world, the renderer and the frame loop are set up in main.js.
import * as THREE from 'three';
import { Vehicle } from './physics/vehicle.js';
import { CARS, carById } from './data/cars.js';
import { PARTS, TYRE_SHOP, PAINTS } from './data/parts.js';
import { TROMOYA } from './data/tromoya.js';
import { CarVisual } from './render/carvis.js';
import { buildBase, Ferry } from './render/places.js';
import { Input } from './input.js';
import { CameraRig } from './camera.js';
import { Courses } from './courses.js';
import { UI } from './ui.js';
import { U } from './render/gfx.js';

const DT = 1 / 400;
// what you can do instead of driving (sim/activities/<name>.js, see activity.js) and what lives alongside the game (sim/<path>.js:
// default export a class made with the game, with optional async init() and frame(dt))
const ACTS = ['boat', 'plane', 'ski'], EXTRAS = ['life/animals', 'net/net'];
const TIMES = { morgen: [7.5, 172], dag: [13, 172], kveld: [20.5, 172], natt: [22.5, 300] };
const WEATHER = { klart: { fog: 0.00007, fall: 0.0018, wet: 0, turb: 3.5, cover: 0.3 }, skyet: { fog: 0.00016, fall: 0.0014, wet: 0, turb: 9, cover: 0.62 }, regn: { fog: 0.00045, fall: 0.0010, wet: 1, turb: 12, rain: 1, cover: 0.95 }, taake: { fog: 0.0025, fall: 0.0022, wet: 0.4, turb: 6, cover: 0.8 } };

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.mode = 'menu'; this.acc = 0;
    this.prof = Object.assign({ nuts: 300, cars: [], parts: {}, tyres: {}, tyresOwned: {}, paint: {}, paints: [0], gold: false }, this.store.get('prof', {}));
    this.best = this.store.get('best', {});
    this.settings = Object.assign({ quality: this.gfx.qName, mode: 'lett', gear: 'auto', time: 'dag', weather: 'klart', tilt: 'knapper', vol: { master: 0.8, car: 0.8, ambient: 0.7 } }, this.store.get('settings', {}));
    this.settings.quality = this.gfx.qName;
  }
  saveProf() { this.store.set('prof', this.prof); }
  owns(spec) { return !spec.price || this.prof.cars.includes(spec.id); }
  parts(id = this.car.spec.id) { return this.prof.parts[id] || (this.prof.parts[id] = {}); }
  island() { const p = this.focus().pos; return this.world.islandAt(p.x, p.z) || this.world.islands[0]; }
  // what the camera follows: the car, or the boat, plane or skier of the running activity
  focus() { return this.act && this.act.pose || this.car; }

  async init(status) {
    this.input = new Input(document.getElementById('stage'));
    this.cam = new CameraRig(this.gfx, this.world, document.getElementById('stage'));
    this.vis = new CarVisual(this.gfx);
    this.courses = new Courses(this);
    this.ui = new UI(this);
    this.snd = this.snd || new (await import('./audio/stub.js')).Sound();
    // the base on Tromøya, the ferry
    const tro = this.world.islands.find(i => i.id === 'tromoya');
    const by = tro.terrain(TROMOYA.base.x, TROMOYA.base.z);
    this.base = buildBase(this.gfx, this.world, tro, { x: TROMOYA.base.x, z: TROMOYA.base.z, y: by + 0.1, ry: TROMOYA.base.h });
    this.worker.post({ type: 'pads', id: tro.id, pads: tro.pads });     // the mesh worker levels the yard too
    this.ferry = new Ferry(this.gfx);
    this.quays = this.findQuays();
    status && status('Gjør klar bilen …');
    await this.setCar(this.store.get('car', 'ravn'));
    const last = this.store.get('pos', null);
    if (last && this.params.get('x') == null) this.car.place(this.world, last.x, last.z, last.h);
    else { const s = this.spawnPoint(); this.car.place(this.world, s.x, s.z, s.h); }
    for (let i = 0; i < 300; i++) this.car.step(DT, this.world);
    this.applySettings();
    this.courses.build(this.island());
    this.dockFerry(this.island());
    this.cam.snap = true;
    status && status('Gjør klar båter, fly og dyr …');
    this.acts = []; this.extras = [];
    const load = async (path, list) => { try { const m = await import(path); const x = new m.default(this); await (x.init && x.init()); list.push(x); return x; } catch (e) { console.warn('kunne ikke laste', path, e); } };
    for (const n of ACTS) await load(`./activities/${n}.js`, this.acts);
    for (const n of EXTRAS) await load(`./${n}.js`, this.extras);
    this.ui.show('menu');
    if (this.params.has('play')) this.play();
    const act = this.params.get('act'); if (act) { const a = this.acts.find(x => x.constructor.id === act); if (a) { this.ui.hide(); this.mode = 'drive'; a.start({}); } }
  }
  // ferry quays: Tromøya's from the data file, the other islands' from their features (pois.ferry)
  findQuays() {
    const out = [];
    for (const isl of this.world.islands) {
      if (isl.def.backdrop) continue;
      const p = isl.id === 'tromoya' ? TROMOYA.ferry : isl.feat.pois && isl.feat.pois.ferry;
      if (!p) continue;
      const x = p.x + (isl.id === 'tromoya' ? 0 : isl.ox), z = p.z + (isl.id === 'tromoya' ? 0 : isl.oz);
      // out to sea: the direction where the water gets deep fastest, unless the island says
      let dir = p.h, best = -1e9;
      if (dir == null) for (let a = 0; a < Math.PI * 2; a += Math.PI / 36) { let d = 0; for (const r of [20, 40, 60]) d -= this.world.terrain(x + Math.sin(a) * r, z + Math.cos(a) * r); if (d > best) { best = d; dir = a; } }
      out.push({ isl, x, z, dir, sea: isl.def.sea || 0, name: p.name || isl.name });
    }
    return out;
  }
  dockFerry(isl) { const q = this.quays.find(q => q.isl === isl); if (q) this.ferry.dock(isl, q); else this.ferry.group.visible = false; }
  pois(isl) {
    const out = [];
    if (isl.id === 'tromoya') out.push({ x: TROMOYA.base.x, z: TROMOYA.base.z, name: 'Verkstedet' }, { x: TROMOYA.ferry.x, z: TROMOYA.ferry.z, name: 'Ferje' }, { x: TROMOYA.marina.x, z: TROMOYA.marina.z, name: 'Marina' });
    else if (isl.feat.pois) for (const [k, p] of Object.entries(isl.feat.pois)) if (p && p.x != null && k !== 'spawn') out.push({ x: p.x + isl.ox, z: p.z + isl.oz, name: { ferry: 'Ferje', base: 'Verksted', marina: 'Marina', airport: 'Flyplass' }[k] || k });
    return out;
  }
  placeName() {
    const isl = this.island(), p = this.focus().pos; let best = null;
    for (const l of isl.feat.labels || []) { if (!['island', 'beach', 'bay', 'peak', 'hill', 'recreation_ground', 'grave_yard', 'water', 'town', 'park', 'pitch', 'strait'].includes(l.t)) continue; const d = Math.hypot(l.x + (isl.id === 'tromoya' ? 0 : isl.ox) - p.x, l.z + (isl.id === 'tromoya' ? 0 : isl.oz) - p.z); if (d < 900 && (!best || d < best.d) && l.t !== 'island') best = { d, n: l.n }; }
    return best ? best.n + ', ' + isl.name : isl.name;
  }
  spawnPoint() {
    const want = { x: +(this.params.get('x') ?? TROMOYA.spawn.x), z: +(this.params.get('z') ?? TROMOYA.spawn.z) };
    const here = this.world.islands.find(i => !i.def.backdrop && i.inside(want.x, want.z)), isl = here || this.world.islands[0];
    // the bigger roads first, any road if the island has none of those near; never a road that is mostly bridge
    let best = null;
    for (const maxC of [5, 6, 7]) {
      for (const r of isl.roads.roads) { if (r.c > maxC || r.b && r.b.length > r.p.length / 6) continue; const p = r.p; for (let i = 0; i < p.length - 3; i += 3) { const d = Math.hypot(p[i] + isl.ox - want.x, p[i + 1] + isl.oz - want.z); if (!best || d < best.d) best = { d, x: p[i] + isl.ox, z: p[i + 1] + isl.oz, h: Math.atan2(p[i + 3] - p[i], p[i + 4] - p[i + 1]) }; } }
      if (best && best.d < 400) break;
    }
    return best || { x: want.x, z: want.z, h: 0 };
  }
  // ---------------------------------------------------------------- the car
  async setCar(id) {
    const spec = carById(id); if (!this.owns(spec)) return;
    const old = this.car;
    this.car = new Vehicle(spec, { parts: this.parts(spec.id), tyre: this.prof.tyres[spec.id] });
    if (old) { this.car.pos.copy(old.pos); this.car.q.copy(old.q); this.car.place(this.world, old.pos.x, old.pos.z, Math.atan2(old.fw.x, old.fw.z)); }
    this.applyAids();
    await this.vis.build(spec, this.paintColor());
    this.snd.setCar && this.snd.setCar(spec);
    this.store.set('car', id);
  }
  paintColor() { const s = this.car.spec, i = this.prof.paint[s.id] || 0, p = PAINTS[i]; return p && p.c || s.col; }
  applyAids() {
    const real = this.settings.mode === 'ekte', a = this.car.aids;
    a.abs = !real; a.tcs = !real; a.esp = !real; a.steer = !real || !this.input.wheel; a.auto = this.settings.gear === 'auto';
  }
  async buyCar(id) {
    const s = carById(id);
    if (!this.owns(s)) { if (this.prof.nuts < s.price) { this.ui.toast('Du trenger ' + s.price + ' muttere', true); return; } this.prof.nuts -= s.price; this.prof.cars.push(id); this.saveProf(); this.ui.toast(s.name + ' er din!'); }
    await this.setCar(id);
  }
  buyPart(pid) {
    const p = PARTS.find(x => x.id === pid), P = this.parts(), lv = (P[pid] || 0) + 1; if (lv >= p.lv.length) return;
    if (this.prof.nuts < p.price[lv]) { this.ui.toast('Du trenger ' + p.price[lv] + ' muttere', true); return; }
    this.prof.nuts -= p.price[lv]; P[pid] = lv; this.saveProf(); this.retune(); this.ui.toast(p.name + ': ' + p.lv[lv]);
  }
  buyTyre(tid) {
    const s = this.car.spec, own = this.prof.tyresOwned[s.id] || (this.prof.tyresOwned[s.id] = []), t = TYRE_SHOP.find(x => x.id === tid);
    if (!own.includes(tid) && tid !== s.tyre) { if (this.prof.nuts < t.price) { this.ui.toast('Du trenger ' + t.price + ' muttere', true); return; } this.prof.nuts -= t.price; own.push(tid); }
    this.prof.tyres[s.id] = tid; this.saveProf(); this.retune();
  }
  buyPaint(i) {
    const p = PAINTS[i]; if (p.locked && !this.prof.gold) return;
    if (p.p && !this.prof.paints.includes(i)) { if (this.prof.nuts < p.p) { this.ui.toast('Du trenger ' + p.p + ' muttere', true); return; } this.prof.nuts -= p.p; this.prof.paints.push(i); }
    this.prof.paint[this.car.spec.id] = i; this.saveProf(); this.vis.setColor(this.paintColor()); this.vis.clean();
  }
  retune() { this.car.tune(this.parts(), this.prof.tyres[this.car.spec.id] || this.car.spec.tyre); this.applyAids(); }
  // ---------------------------------------------------------------- settings
  set(k, v) { this.settings[k] = v; this.store.set('settings', this.settings); this.applySettings(k); }
  applySettings(k) {
    const S = this.settings;
    if (k === 'quality') { this.gfx.setQuality(S.quality); this.store.set('quality', S.quality); }
    this.applyAids();
    this.input.enableTilt(S.tilt === 'tilt'); document.body.classList.toggle('tilt', S.tilt === 'tilt');
    const W = WEATHER[S.weather] || WEATHER.klart; this.gfx.cover = W.cover;
    this.setClock(); this.gfx.setFog(W.fog, W.fall); U.uWet.value = W.wet; this.gfx.sky.material.uniforms.turbidity.value = W.turb; this.weather = W;
    if (this.rain) this.rain.set(W.rain || 0, this.island().def.biome === 'winter' ? 'snow' : 'rain');
    this.snd.setVolume && this.snd.setVolume(S.vol);
  }
  setClock() {
    const S = this.settings, night = this.courses.active && this.courses.active.c.night;
    let h, d;
    if (night) [h, d] = TIMES.natt;
    else if (S.time === 'ekte') { const n = new Date(); h = n.getHours() + n.getMinutes() / 60; d = Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5); }
    else [h, d] = TIMES[S.time] || TIMES.dag;
    if (this.params.has('t')) h = +this.params.get('t');
    this.gfx.setTime(h, 58.47, d);
  }
  // ---------------------------------------------------------------- modes
  play() { this.ui.hide(); this.mode = 'drive'; this.snd.unlock && this.snd.unlock(); this.cam.snap = true; }
  toMenu() { if (this.act) this.act.stop(); this.courses.stop(); this.ui.course(null); this.mode = 'menu'; this.ui.show('menu'); }
  pause(on = true) { if (on && (this.mode === 'drive' || this.mode === 'race')) { this.prevMode = this.mode; this.mode = 'pause'; this.ui.show('pause'); } }
  resume() { this.ui.hide(); if (this.mode === 'pause' || this.mode === 'menu' || this.mode === 'result') this.mode = this.act ? 'act' : 'drive'; }
  // an activity takes over the frame; the car waits where it is parked
  startActivity(a) {
    if (this.act && this.act !== a) this.act.stop();
    this.courses.stop(); this.ui.course(null); this.ui.hide();
    this.act = a; a.active = true; this.mode = 'act'; this.offer = null; document.getElementById('offer').hidden = true;
    const I = this.car.input; I.gas = 0; I.brake = 1; I.steer = 0; I.handbrake = 1; this.car.vel.set(0, 0, 0); this.car.w.set(0, 0, 0);
    document.body.classList.add('act'); document.body.dataset.act = a.constructor.id || '';
  }
  endActivity() {
    const a = this.act; if (!a) return;
    a.active = false; this.act = null; this.mode = 'drive'; this.cam.snap = true;
    document.body.classList.remove('act'); delete document.body.dataset.act;
    const I = this.car.input; I.brake = 0; I.handbrake = 0;
  }
  // back on the road: the nearest road point, pointing along the road
  recover() {
    const p = this.car.pos, isl = this.island(); let best = null;
    for (const r of isl.roads.roads) { const P = r.p; for (let i = 0; i < P.length - 3; i += 3) { const x = P[i] + isl.ox, z = P[i + 1] + isl.oz, d = (x - p.x) ** 2 + (z - p.z) ** 2; if (!best || d < best.d) best = { d, x, z, h: Math.atan2(P[i + 3] - P[i], P[i + 4] - P[i + 1]) }; } }
    if (best) { const fw = this.car.fw, h = (Math.cos(best.h) * fw.z + Math.sin(best.h) * fw.x) < 0 ? best.h + Math.PI : best.h; this.car.place(this.world, best.x, best.z, h); }
    if (this.courses.active) { this.courses.active.pen += 5; this.ui.toast('Satt tilbake på veien · +5 s', true); } else this.ui.toast('Satt tilbake på veien');
    this.cam.snap = true;
  }
  towHome() {
    if (this.prof.nuts < 20) { this.ui.toast('Du trenger 20 muttere', true); return; }
    this.prof.nuts -= 20; this.saveProf(); this.courses.stop(); this.ui.course(null);
    const a = this.base.ask; this.car.place(this.world, a.x, a.z, TROMOYA.base.h + Math.PI);
    this.afterIslandChange(); this.ui.hide(); this.mode = 'drive'; this.ui.toast('Tauet til verkstedet · −20 ⚙');
  }
  ferryDestinations() { const here = this.island(); return this.quays.filter(q => q.isl !== here).map(q => ({ q, name: q.isl.name, sub: q.name })); }
  takeFerry(d) {
    if (this.prof.nuts < 5) { this.ui.toast('Du trenger 5 muttere til ferja', true); return; }
    if (this.act) this.act.stop();      // from the map while sailing or flying: back in the car first
    this.prof.nuts -= 5; this.saveProf(); this.courses.stop(); this.ui.course(null); this.ui.hide();
    this.mode = 'ferry'; this.trip = { to: d.q, t: 0, T: 14 };
    const here = this.quays.find(q => q.isl === this.island()); this.trip.from = here || { x: this.car.pos.x, z: this.car.pos.z, dir: 0, sea: 0 };
    // the car on the deck, the ferry pulling away
    this.dockFerry(this.trip.from.isl || this.island()); this.placeOnFerry();
  }
  placeOnFerry() { const f = this.ferry.group; this.car.place(this.world, f.position.x, f.position.z, f.rotation.y + Math.PI); this.car.pos.y = this.ferry.deckY + this.car.cgH + 0.1; }
  updateFerry(dt) {
    const T = this.trip; T.t += dt; const u = Math.min(1, T.t / T.T), f = this.ferry.group;
    const a = T.from, b = T.to, sa = { x: a.x + Math.sin(a.dir) * 40, z: a.z + Math.cos(a.dir) * 40 }, sb = { x: b.x + Math.sin(b.dir) * 40, z: b.z + Math.cos(b.dir) * 40 };
    // pull out, cross (time runs fast), come in
    let x, z, h;
    if (u < 0.2) { const k = u / 0.2; x = sa.x + (a.x - sa.x) * (1 - k) * 0.3 + Math.sin(a.dir) * 60 * k; z = sa.z + Math.cos(a.dir) * 60 * k; h = a.dir; }
    else if (u < 0.8) { const k = (u - 0.2) / 0.6, s = k * k * (3 - 2 * k); x = sa.x + Math.sin(a.dir) * 60 + (sb.x + Math.sin(b.dir) * 60 - sa.x - Math.sin(a.dir) * 60) * s; z = sa.z + Math.cos(a.dir) * 60 + (sb.z + Math.cos(b.dir) * 60 - sa.z - Math.cos(a.dir) * 60) * s; h = Math.atan2(sb.x - sa.x, sb.z - sa.z); }
    else { const k = (u - 0.8) / 0.2; x = sb.x + Math.sin(b.dir) * 60 * (1 - k); z = sb.z + Math.cos(b.dir) * 60 * (1 - k); h = b.dir + Math.PI; }
    f.position.set(x, 0, z); f.rotation.y = h + (u < 0.8 ? Math.PI : 0) * 0;
    // the car rides along (no physics while sailing)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.rotation.y);
    this.car.pos.set(x, this.ferry.dh + this.car.cgH + 0.02, z); this.car.q.set(q.x, q.y, q.z, q.w); this.car.vel.set(0, 0, 0); this.car.w.set(0, 0, 0);
    const cam = this.gfx.camera, ang = T.t * 0.12 + 0.6; cam.position.set(x + Math.sin(ang) * 60, 28, z + Math.cos(ang) * 60); cam.lookAt(x, 3, z);
    if (u >= 1) {
      this.dockFerry(b.isl); this.placeOnFerry(); this.afterIslandChange(); this.mode = 'drive'; this.cam.snap = true;
      this.ui.toast('Velkommen til ' + b.isl.name + '!');
    }
  }
  afterIslandChange() { this.courses.build(this.island()); this.applySettings(); }

  // ---------------------------------------------------------------- the frame
  update(dt) {
    const inp = this.input.read(dt, Math.abs(this.car.speed));
    if (this.mode === 'act' || this.act && this.mode === 'pause') return this.updateAct(dt, inp);
    for (const a of inp.presses) this.press(a);
    if (inp.releases.includes('horn')) this.snd.event && this.snd.event('horn', { on: false });
    if (this.mode === 'ferry') { this.updateFerry(dt); this.vis.sync(this.car, dt); for (const x of this.acts) x.frame && x.frame(dt); for (const x of this.extras) x.frame && x.frame(dt); this.ui.update(dt); return; }
    const driving = this.mode === 'drive' || this.mode === 'race';
    const I = this.car.input;
    if (driving && !(this.courses.active && this.courses.active.count > 0)) { I.gas = inp.gas; I.brake = inp.brake; I.steer = inp.steer; I.handbrake = inp.handbrake; I.shiftUp = inp.shiftUp; I.shiftDown = inp.shiftDown; }
    else if (!driving) { I.gas = 0; I.brake = 0; I.handbrake = 0; }
    if (this.mode !== 'pause') {
      this.acc += dt; let n = 0;
      while (this.acc >= DT && n < 60) { this.car.step(DT, this.world); this.acc -= DT; n++; }
      if (n >= 60) this.acc = 0;
    }
    if (this.car.blewUp) { this.car.blewUp = false; this.recover(); }
    if (driving) this.driving(dt);
    this.vis.sync(this.car, dt, { indicator: this.indicator || 0 }); this.vis.weather(dt, this.car, U.uWet.value, false);
    if (this.mode === 'menu' || this.mode === 'garage') this.menuCamera(dt); else this.cam.update(dt, this.car, this.vis, inp);
    if (this.car.lastHit && this.car.lastHit.t !== this._hitT) { this._hitT = this.car.lastHit.t; const j = this.car.lastHit.j / this.car.m; if (j > 1.5) this.cam.shake = Math.min(0.25, j * 0.03); }
    this.snd.update && this.snd.update(dt, this.car, this.soundEnv(dt));
    for (const x of this.acts) x.frame && x.frame(dt);
    for (const x of this.extras) x.frame && x.frame(dt);
    this.ui.update(dt);
    this.saveT = (this.saveT || 0) - dt; if (this.saveT <= 0 && driving) { this.saveT = 5; this.store.set('pos', { x: this.car.pos.x, z: this.car.pos.z, h: Math.atan2(this.car.fw.x, this.car.fw.z) }); }
  }
  // what the ambience hears round the car: sea, forest and town within 60 m (sampled a few times a second)
  soundEnv(dt) {
    const E = this.env || (this.env = { inside: 0, sea: 0, forest: 0.5, rain: 0, wind: 0.3, night: 0, town: 0, t: 0 });
    E.inside = this.cam.inside ? 1 : 0; E.rain = this.weather && this.weather.rain || 0; E.night = U.uNight.value; E.wind = 0.25 + E.rain * 0.4;
    if ((E.t -= dt) > 0) return E; E.t = 0.4;
    const p = this.focus().pos, isl = this.world.islandAt(p.x, p.z); let sea = 0, fo = 0, to = 0, n = 0;
    for (let k = 0; k < 12; k++) for (const r of [25, 60]) {
      const a = k / 12 * Math.PI * 2, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; n++;
      if (!isl || this.world.terrain(x, z) < (isl.def.sea || 0)) { sea++; continue; }
      const c = isl.coverAt(x, z); if (c >= 3 && c <= 5 || c === 18) fo++; else if (c === 9 || c === 10) to++;
    }
    E.sea = sea / n; E.forest = fo / n; E.town = to / n;
    return E;
  }
  updateAct(dt, inp) {
    const a = this.act;
    for (const k of inp.presses) {
      if (this.mode === 'pause') { if (k === 'pause') this.resume(); continue; }
      if (!a.press(k) && k === 'pause') { this.mode = 'pause'; this.ui.show('pause'); }
    }
    if (this.mode === 'act') a.update(dt, inp);
    if (inp.releases.includes('horn')) this.snd.event && this.snd.event('horn', { on: false });
    this.vis.sync(this.car, dt);
    for (const x of this.acts) x.frame && x.frame(dt);
    for (const x of this.extras) x.frame && x.frame(dt);
    this.snd.update && this.snd.update(dt, this.car, this.soundEnv(dt));
    this.ui.update(dt);
  }
  menuCamera(dt) {
    const c = this.car, cam = this.gfx.camera, t = performance.now() * 0.00012 + 0.8, r = c.spec.dims.L * 1.6 + 3;
    cam.position.set(c.pos.x + Math.sin(t) * r, c.pos.y + c.spec.dims.H * 0.5 + 0.6, c.pos.z + Math.cos(t) * r); cam.up.set(0, 1, 0); cam.lookAt(c.pos.x, c.pos.y + 0.2, c.pos.z); cam.fov = 40; cam.updateProjectionMatrix();
  }
  driving(dt) {
    const c = this.car;
    this.mode = this.courses.active ? 'race' : 'drive';
    this.courses.update(dt);
    // flooded engine or rolled over: in Lett the car is put back by itself after a moment
    if (c.state.flooded) { c.state.flooded = false; this.ui.toast('Motoren fikk vann i seg!', true); this.recover(); }
    if (c.up.y < 0.25 && Math.abs(c.speed) < 1) { this.flipT = (this.flipT || 0) + dt; if (this.flipT > (this.settings.mode === 'lett' ? 2 : 6)) { this.flipT = 0; this.recover(); } } else this.flipT = 0;
    // offers: a course start, the garage, the ferry
    this.offerT = (this.offerT || 0) - dt; if (this.offerT > 0) return; this.offerT = 0.2;
    const off = document.getElementById('offer'); let o = null;
    if (!this.courses.active && Math.abs(c.speed) < 6) {
      const n = this.courses.nearest(c.pos);
      if (n && n.d < 14) o = { kind: 'Løype', name: n.c.name, info: (this.best[n.c.key] ? '★'.repeat(this.best[n.c.key].s) + ' ' : '') + (n.c.len / 1000).toFixed(1).replace('.', ',') + ' km', go: () => this.courses.start(n.c) };
      const a = this.base.ask; if (!o && Math.hypot(a.x - c.pos.x, a.z - c.pos.z) < a.r) o = { kind: 'Verkstedet', name: TROMOYA.base.name, info: 'deler, dekk, lakk og biler', go: () => { this.mode = 'garage'; this.ui.show('garage'); this.vis.clean(); } };
      for (const a of this.acts) if (!o) o = a.offers(c);
      if (!o && this.ferry.group.visible && this.ferry.onDeck(c.pos)) o = { kind: 'Ferja', name: 'Hvor vil du reise?', info: '5 ⚙', go: () => this.ui.show('map') };
    }
    this.offer = o; off.hidden = !o;
    if (o) { document.getElementById('oKind').textContent = o.kind; document.getElementById('oName').textContent = o.name; document.getElementById('oInfo').textContent = o.info; }
  }
  press(a) {
    if (a === 'pause') { if (this.mode === 'drive' || this.mode === 'race') this.pause(); else if (this.mode === 'pause') this.resume(); else if (this.ui.open && this.ui.open !== 'menu') this.ui.back(); return; }
    if (this.mode !== 'drive' && this.mode !== 'race') return;
    switch (a) {
      case 'cam': this.ui.toast(this.cam.next()); break;
      case 'lights': this.vis.lights = !this.vis.lights; break;
      case 'map': this.mode = 'pause'; this.ui.show('map'); break;
      case 'reset': this.recover(); break;
      case 'low': if (this.car.gb.low) { if (Math.abs(this.car.speed) > 3) this.ui.toast('Stopp for å bytte til lavserie', true); else { this.car.state.low = !this.car.state.low; this.ui.toast(this.car.state.low ? 'Lavserie: krabbegir' : 'Høyserie'); } } else this.ui.toast('Denne bilen har ikke lavserie'); break;
      case 'enter': if (this.offer) { const o = this.offer; this.offer = null; document.getElementById('offer').hidden = true; o.go(); } break;
      case 'horn': this.snd.event && this.snd.event('horn', { on: true }); break;
      case 'indL': this.indicator = this.indicator === 1 ? 0 : 1; break;
      case 'indR': this.indicator = this.indicator === 2 ? 0 : 2; break;
      case 'hazard': this.indicator = this.indicator === 3 ? 0 : 3; break;
      case 'up': if (!this.car.aids.auto) this.car.shiftTo(this.car.state.gear + 1); break;
      case 'down': if (!this.car.aids.auto) this.car.shiftTo(this.car.state.gear - 1); break;
    }
  }
}
