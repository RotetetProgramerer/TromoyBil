// Courses: a start gantry at every course start, gates that light up one after the other during the run, timing with splits
// against your best run, stars and nuts. Tromøya's courses are routed along the real roads (sim/data/tromoya.js + sim/route.js);
// the other islands bring their gates in features.courses.
import * as THREE from 'three';
import { prep } from './render/gfx.js';
import { RoadGraph, buildCourse } from './route.js';
import { TROMOYA, PREFER } from './data/tromoya.js';

const DIFFCOL = ['#8bbb4a', '#8bbb4a', '#f2c230', '#d9432f'], KIND_NAME = { asfalt: 'Asfalt', grus: 'Grus', terreng: 'Terreng', natt: 'Nattløp', bakke: 'Bakkeløp', is: 'Is', strand: 'Strand', sump: 'Sump', by: 'By' };
// average speeds a good driver holds on each kind of course (km/h): three stars at this pace, two at 80 % of it
const PACE = { asfalt: 72, grus: 55, terreng: 26, natt: 48, bakke: 45, is: 40, strand: 45, sump: 22, by: 40 };
export const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ','); };

function signTexture(lines, col) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#f2e8d0'; g.fillRect(0, 0, 512, 160); g.fillStyle = col; g.fillRect(0, 0, 512, 28);
  g.strokeStyle = '#14120e'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 152);
  g.fillStyle = '#14120e'; g.textAlign = 'center'; g.font = '700 58px "Barlow Condensed", sans-serif'; g.fillText(lines[0], 256, 92);
  g.font = '600 32px "Barlow Condensed", sans-serif'; g.fillText(lines[1] || '', 256, 138);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class Courses {
  constructor(game) {
    this.game = game; this.gfx = game.gfx; this.world = game.world; this.list = []; this.active = null; this.group = new THREE.Group(); this.gfx.scene.add(this.group);
    const m = (c, e = 0) => { const mm = prep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: e })); this.gfx.shadowed(mm); return mm; };
    this.mat = { pole: m('#d8d4cc'), red: m('#c8241c'), white: m('#f2f0ea'), next: m('#e5a92b', 0.8), dim: m('#7a7468') };
    this.archGeo = new THREE.TorusGeometry(1, 0.09, 10, 28, Math.PI);
    this.graphs = new Map();
  }
  // all courses of an island (world coordinates): {id, key, name, desc, diff, kind, night, line, gates, start, len, par}
  forIsland(isl) {
    if (isl.courses) return isl.courses;
    let defs = [];
    if (isl.id === 'tromoya') {
      let g = this.graphs.get(isl); if (!g) { g = new RoadGraph(isl); this.graphs.set(isl, g); }
      for (const d of TROMOYA.courses) { const c = buildCourse(g, Object.assign({}, d, { weight: PREFER[d.prefer] })); if (c) defs.push(c); }
    } else for (const c of isl.feat.courses || []) {
      const line = c.line || [[c.start.x, c.start.z], ...c.gates]; let len = 0; for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      defs.push(Object.assign({ line, len: Math.round(len) }, c));
    }
    isl.courses = defs.map(c => {
      const sh = ([x, z]) => [x + isl.ox, z + isl.oz];
      const pace = PACE[c.kind] || 45, t3 = c.len / (pace / 3.6), par = [Math.round(t3), Math.round(t3 / 0.8)];
      return Object.assign({}, c, { key: isl.id + '/' + c.id, island: isl, line: c.line.map(sh), gates: c.gates.map(sh), start: { x: c.start.x + isl.ox, z: c.start.z + isl.oz, h: c.start.h }, par });
    });
    return isl.courses;
  }
  // start gantries for every course on the island the car is on
  build(isl) {
    this.group.clear(); this.portals = [];
    for (const c of this.forIsland(isl)) {
      const g = new THREE.Group(), { x, z, h } = c.start, y = this.world.height(x, z), sx = Math.cos(h), sz = -Math.sin(h);
      const q = this.world.road(x, z), w = q ? q.hw + 1.2 : 4;
      for (const sd of [-1, 1]) {
        const px = x + sx * sd * w, pz = z + sz * sd * w, py = this.world.height(px, pz);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.2, 10), this.mat.pole); pole.position.set(px, py + 2.6, pz); pole.castShadow = true; g.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), prep(new THREE.MeshStandardMaterial({ color: DIFFCOL[c.diff], side: THREE.DoubleSide, roughness: 0.7 })));
        flag.position.set(px + sx * sd * 0.5, py + 4.3, pz + sz * sd * 0.5); flag.rotation.y = h + Math.PI / 2; g.add(flag);
      }
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, w * 0.62), prep(new THREE.MeshStandardMaterial({ map: signTexture([c.name, (KIND_NAME[c.kind] || '') + ' · ' + ['', 'Lett', 'Middels', 'Vanskelig'][c.diff] + ' · ' + (c.len / 1000).toFixed(1).replace('.', ',') + ' km'], DIFFCOL[c.diff]), side: THREE.DoubleSide, roughness: 0.6 })));
      banner.position.set(x, y + 4.9, z); banner.rotation.y = h + Math.PI; g.add(banner);
      // the start line painted across the road
      const line = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, 0.5), prep(new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -4 })));
      line.rotation.x = -Math.PI / 2; line.rotation.z = h; line.position.set(x, y + 0.06, z); g.add(line);
      this.group.add(g); this.portals.push({ c, g });
    }
  }
  nearest(pos) { let b = null; for (const p of this.portals || []) { const d = Math.hypot(p.c.start.x - pos.x, p.c.start.z - pos.z); if (!b || d < b.d) b = { c: p.c, d }; } return b; }

  start(c) {
    const game = this.game, car = game.car;
    this.stop();
    this.active = { c, gi: 0, t: 0, splits: [], best: game.best[c.key], started: false, count: 3.5, pen: 0, nuts: 0, resets: 0 };
    car.place(this.world, c.start.x, c.start.z, c.start.h); for (let i = 0; i < 200; i++) car.step(1 / 400, this.world);
    game.cam.snap = true;
    // the gates: an arch across the road at each gate, facing along the route
    this.gates = c.gates.map((p, i) => {
      const next = c.line[Math.min(c.line.length - 1, nearestIdx(c.line, p) + 2)], prev = c.line[Math.max(0, nearestIdx(c.line, p) - 2)];
      const h = Math.atan2(next[0] - prev[0], next[1] - prev[1]), q = this.world.road(p[0], p[1]), w = (q ? q.hw : 3) + 1.2, y = this.world.height(p[0], p[1]);
      const arch = new THREE.Mesh(this.archGeo, i === c.gates.length - 1 ? this.mat.red : this.mat.dim); arch.scale.set(w, w * 1.05, w); arch.position.set(p[0], y, p[1]); arch.rotation.y = h + Math.PI / 2; arch.castShadow = true;
      this.group.add(arch); return { p, h, w, arch };
    });
    this.highlight();
    game.ui.course(c, this.active);
  }
  highlight() { const a = this.active; if (!a) return; this.gates.forEach((g, i) => { g.arch.visible = i >= a.gi && i < a.gi + 3; g.arch.material = i === a.gi ? this.mat.next : i === this.gates.length - 1 ? this.mat.red : this.mat.dim; }); }
  stop() { if (this.gates) for (const g of this.gates) this.group.remove(g.arch); this.gates = null; this.active = null; }

  update(dt) {
    const a = this.active, game = this.game, car = game.car; if (!a) return;
    if (a.count > 0) {
      a.count -= dt; car.input.gas = 0; car.input.brake = 1;
      game.ui.countdown(a.count > 0.5 ? Math.ceil(a.count - 0.5) : 'KJØR!');
      if (a.count <= 0) { a.started = true; game.ui.countdown(null); }
      return;
    }
    a.t += dt;
    const g = this.gates[a.gi], d = Math.hypot(g.p[0] - car.pos.x, g.p[1] - car.pos.z);
    // passed when the car is within the arch, or has crossed its line close by
    const along = (car.pos.x - g.p[0]) * Math.sin(g.h) + (car.pos.z - g.p[1]) * Math.cos(g.h);
    if (d < g.w + 2 || (d < g.w + 10 && along > 0 && a.lastAlong < 0)) {
      a.splits.push(a.t); a.gi++; a.nuts += 5;
      const prev = a.best && a.best.splits && a.best.splits[a.gi - 1];
      game.ui.split(prev != null ? a.t - prev : null);
      game.snd && game.snd.event && game.snd.event('click');
      if (a.gi >= this.gates.length) return this.finish();
      this.highlight(); a.lastAlong = 0; return;
    }
    a.lastAlong = along;
    // too far from the next gate: the run is called off
    if (d > 600) { game.ui.toast('For langt fra løypa: løpet er avbrutt', true); this.stop(); game.ui.course(null); }
  }
  finish() {
    const a = this.active, c = a.c, game = this.game, t = a.t + a.pen;
    const stars = t <= c.par[0] ? 3 : t <= c.par[1] ? 2 : 1, old = game.best[c.key], rec = !old || t < old.t, first = !old;
    const nuts = a.nuts + 40 + (first ? 60 : 0) + (rec && !first ? 25 : 0) + stars * 10;
    if (rec) game.best[c.key] = { t, s: Math.max(stars, old ? old.s : 0), splits: a.splits };
    else if (old && stars > old.s) old.s = stars;
    game.store.set('best', game.best);
    game.prof.nuts += nuts; game.saveProf();
    this.stop();
    game.ui.result({ c, t, stars, rec, first, nuts, par: c.par, old: old && old.t, pen: a.pen });
  }
}
function nearestIdx(L, p) { let b = 0, bd = 1e18; for (let i = 0; i < L.length; i++) { const d = (L[i][0] - p[0]) ** 2 + (L[i][1] - p[1]) ** 2; if (d < bd) { bd = d; b = i; } } return b; }
