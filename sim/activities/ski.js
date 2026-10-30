// Skiing in Gautefall: park the car at the ski centre, ride the chairlift to the top (Enter or space skips the ride), pick a piste
// (or ski free), push out of the start through the gates to the finish: time, splits against your best run, +5 s for a missed
// gate, stars and nuts; then the lift again or back to the car. The physics is sim/physics/skier.js at 240 Hz on the island's real
// snow (sim/world), the skier sim/render/skiervis.js, the resort round the pistes sim/render/skiresort.js (sim/render/special.js
// draws the lift, the gate poles and the start huts), the sound sim/audio/skisound.js.
// Controls: ← → steer, ↑ pole and skate when slow, tuck when fast, ↓ plough (with hard steering a hockey stop), space jump (and
// spin in the air), C camera, R back to the last gate, Esc pause. A gamepad: the stick steers, the triggers tuck and brake, A jumps.
import * as THREE from 'three';
import { Activity } from './activity.js';
import { Skier, SkiArea, SkiRun, jumpPoints } from '../physics/skier.js';
import { U } from '../render/gfx.js';
import { SkierVisual, SkierFigure, SnowSpray, SkiTracks } from '../render/skiervis.js';
import { SkiResort } from '../render/skiresort.js';
import { Arrow } from '../render/boatvis.js';
import { fmtTime } from '../courses.js';
import { SkiSound } from '../audio/skisound.js';

const DT = 1 / 240, MAXSTEP = 48, CAMS = ['Følgekamera', 'Hjelmkamera', 'Langt bak'], LIFTCAMS = ['Bak stolen', 'Fra stolen', 'Utsikt over dalen'];
const PARK = { x: 0, z: 731, r: 45 }, CAR = { x: 10, z: 744, h: Math.PI };           // the ski centre's parking (island coordinates)
const $ = id => document.getElementById(id), fmtN = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _c = {};

const CSS = `
#kHud{position:absolute;inset:0;pointer-events:none}
body:not([data-act=ski]) #kHud{display:none}
#kHud .kdash{position:absolute;right:14px;bottom:12px;display:flex;flex-direction:column;align-items:center}
#kInst{width:200px;height:200px}
#kMini{position:absolute;right:16px;top:14px;width:180px;height:180px;border-radius:50%;pointer-events:none}
#kHint{position:absolute;left:16px;bottom:10px;max-width:calc(100% - 290px);font-size:15px;line-height:1.3;color:var(--ink);text-shadow:0 1px 3px #000;transition:opacity 1.2s}
#kHint.off,body:has(#offer:not([hidden])) #kHint{opacity:0}
#kHud .split{min-height:0}
#kFade{position:fixed;inset:0;background:#0a0907;opacity:0;pointer-events:none;transition:opacity .4s;z-index:4}
#kFade.on{opacity:1}
#kTouch{display:none}
body.is-touch #kTouch{display:block}
body.is-touch #kHint{display:none}
body.is-touch #kHud .kdash{transform:scale(.8);transform-origin:bottom right}
#kTouch .tpad.r{right:196px;bottom:18px;align-items:flex-end}
#kTouch .tb.sm{width:62px;height:62px;font-size:15px}
@media (max-width:760px){#kMini{width:120px;height:120px}#kHint{font-size:13px;max-width:calc(100% - 250px)}}
#skiTop .item .diff,#skiResult .diff{vertical-align:1px}
`;
const HUD = `
<canvas id="kMini" width="220" height="220" aria-hidden="true"></canvas>
<div class="course" id="kRun" hidden><div class="cname" id="kName"></div><div class="crow"><span>Tid</span><b id="kTime">0:00,0</b></div>
  <div class="crow"><span id="kGateL">Port</span><b id="kGate">0/0</b></div><div class="crow"><span id="kBestL">Beste</span><b id="kBest">–</b></div><div class="split" id="kSplit"></div></div>
<div class="course" id="kLift" hidden><div class="cname">Gautefallheisen</div><div class="crow"><span>Til toppen</span><b id="kLiftT">–</b></div><div class="crow"><span>Høyde</span><b id="kLiftH">–</b></div></div>
<div class="kdash"><canvas id="kInst" width="220" height="220" aria-hidden="true"></canvas>
  <div class="lamps"><i id="kLKant">KANT</i><i id="kLSkli">SKLI</i><i id="kLPlog">PLOG</i><i id="kLLuft">LUFT</i></div></div>
<div id="kHint"></div>
<div id="kTouch">
  <div class="tpad l"><button class="tb" data-k="left" aria-label="Sving til venstre"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button class="tb" data-k="right" aria-label="Sving til høyre"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div>
  <div class="tpad r"><button class="tb sm" data-k="jump" aria-label="Hopp">HOPP</button><button class="tb" data-k="brake" aria-label="Plog og brems"><svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg></button><button class="tb big" data-k="gas" aria-label="Stavtak og hockeystilling"><svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7"/></svg></button></div>
</div>`;
const TOP = `
<header class="brand"><p class="eyebrow">Toppen av Gautefall · 279 moh.</p><h1>Velg ned&shy;fart</h1>
  <p class="lede">Kjør gjennom portene til mål. Bom på en port gir 5 sekunder straff. Faller du, reiser du deg der du falt, eller ved forrige port.</p></header>
<div class="panel">
  <div class="wallet"><span>⚙ <b id="ktNuts">0</b> muttere</span><span id="ktStars"></span></div>
  <h2>Nedfarter</h2><div class="list" id="ktList"></div>
  <button class="go" id="ktFree">Fri kjøring</button>
  <button class="ghost" id="ktCar">Ta heisen ned til bilen</button>
</div>`;
const RESULT = `
<header class="brand"><p class="eyebrow" id="krKind">I mål</p><h1 id="krName"></h1><p class="stars" id="krStars"></p></header>
<div class="panel"><ul class="rlist" id="krList"></ul><button class="go" id="krAgain">Prøv igjen</button><button class="ghost" id="krLift">Ta heisen opp igjen</button><button class="ghost" id="krCar">Tilbake til bilen</button></div>`;
const HINT_RUN = '← → sving: jevnt for carving · ↑ stavtak, i fart hockeystilling · ↓ plog, med sving hockeystopp · mellomrom hopp · C kamera · R forrige port';

export default class SkiActivity extends Activity {
  static id = 'ski';
  async init() {
    const g = this.game; this.isl = g.world.islands.find(i => i.id === 'gautefall');
    if (!this.isl || !this.isl.feat.special || !(this.isl.feat.special.pistes || []).length) return;
    this.area = new SkiArea(g.world, this.isl);
    this.resort = new SkiResort(g.gfx, g.world, this.area, g.special); this.resort.best = g.best;
    // the headlamp for skiing in the dark (always in the scene, so turning it on recompiles nothing)
    this.lamp = new THREE.SpotLight(0xfff4e0, 0, 45, 0.5, 0.6, 1.3); this.lamp.castShadow = false; g.gfx.scene.add(this.lamp, this.lamp.target);
    this.dom();
    this.touch = {}; this.acc = 0; this.camMode = 0; this.liftCam = 0; this.camPos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.snap = true; this.phase = ''; this.camH = 0;
    this.pose = null; this.fadeQ = null; this.lastJump = false;
  }
  // ---------------------------------------------------------------- DOM
  dom() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hud = document.createElement('div'); hud.id = 'kHud'; hud.innerHTML = HUD; $('hud').appendChild(hud);
    for (const [id, html] of [['skiTop', TOP], ['skiResult', RESULT]]) { const s = document.createElement('section'); s.className = 'overlay'; s.id = id; s.hidden = true; s.innerHTML = html; document.body.insertBefore(s, $('loading')); }
    const f = document.createElement('div'); f.id = 'kFade'; document.body.appendChild(f);
    this.ictx = $('kInst').getContext('2d'); this.mctx = $('kMini').getContext('2d');
    hud.querySelectorAll('[data-k]').forEach(b => {
      const k = b.dataset.k;
      const on = e => { e.preventDefault(); this.touch[k] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { } };
      const off = () => { this.touch[k] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    });
    $('ktFree').onclick = () => this.free();
    $('ktCar').onclick = () => { this.game.ui.hide(); this.game.mode = 'act'; this.toCar(); };
    $('krAgain').onclick = () => { this.game.ui.hide(); this.game.mode = 'act'; this.pick(this.k); };
    $('krLift').onclick = () => { this.game.ui.hide(); this.game.mode = 'act'; this.ride(); };
    $('krCar').onclick = () => { this.game.ui.hide(); this.game.mode = 'act'; this.toCar(); };
  }
  hint(text, sec = 10) { const el = $('kHint'); el.textContent = text; el.classList.remove('off'); this.hintT = sec; }
  // ---------------------------------------------------------------- the ski centre
  offers(car) {
    if (!this.area) return null; const isl = this.isl;
    if (Math.hypot(car.pos.x - isl.ox - PARK.x, car.pos.z - isl.oz - PARK.z) < PARK.r) return { kind: 'Skisenter', name: 'Stå på ski', info: 'stolheis og fire nedfarter', go: () => this.start({}) };
    return null;
  }
  start(opts = {}) {
    const g = this.game; if (!this.area) return;
    g.startActivity(this);
    // the car waits at the parking (moved there if the game started on skis somewhere else)
    const car = g.car, isl = this.isl, px = isl.ox + CAR.x, pz = isl.oz + CAR.z, from = g.island();
    if (Math.hypot(car.pos.x - px, car.pos.z - pz) > 80) {
      const I = car.input; I.brake = 0; car.place(g.world, px, pz, CAR.h); for (let i = 0; i < 300; i++) car.step(1 / 400, g.world); car.vel.set(0, 0, 0); I.brake = 1;
      if (from !== isl) { g.dockFerry(isl); g.afterIslandChange(); }
    }
    car.engineOff = true;
    this.camSave = g.cam.mode; this.pauseSave = { reset: $('pReset').textContent, abort: $('pAbort').textContent, abortClick: $('pAbort').onclick };
    const paint = g.paintColor ? g.paintColor() : '#d9432f';
    this.skier = new Skier(this.area, { assist: g.settings.mode !== 'ekte' });
    if (!this.vis) { this.vis = new SkierVisual(g.gfx, g.world, { jacket: typeof paint === 'string' ? paint : '#d9432f' }); this.spray = new SnowSpray(g.gfx); this.tracks = new SkiTracks(g.gfx, g.world, 1400, (x, z) => this.area.ground(x, z)); this.arrow = new Arrow(g.gfx); this.arrow.mesh.scale.setScalar(0.5); }
    else { this.vis.root.visible = true; this.vis.fig.setColor(typeof paint === 'string' ? paint : '#d9432f'); }
    this.pose = { pos: new THREE.Vector3(), fw: new THREE.Vector3(0, 0, 1), kmh: 0 }; this.where = 'Gautefall skisenter';
    // ?act=ski&piste=slalom (straight to that start), &ski=top or &ski=free (for testing) on the first start
    const P = this.urlDone ? new URLSearchParams() : g.params; this.urlDone = true;
    const k = this.area.pistes.find(p => p.id === (opts.piste || P.get('piste')));
    if (k) this.pick(k, true); else if (P.get('ski') === 'top') { this.toTop(true); } else if (P.get('ski') === 'free') { this.free(true); } else this.ride(true);
  }
  stop() {
    const g = this.game; if (!this.active) return;
    this.phase = ''; this.run = null; this.fadeQ = null; $('kFade').classList.remove('on'); g.ui.countdown(null);
    if (this.sound) { this.sound.stop(); this.sound = null; }
    if (this.vis) this.vis.root.visible = false; this.spray && this.spray.clear(); this.ghost = null; this.showGhost(); this.arrow && this.arrow.hide(); this.resort.showGate(null); this.resort.skip = -1; this.resort.live(null); this.lamp.intensity = 0;
    g.car.engineOff = false; g.cam.mode = this.camSave || 0;
    if (this.pauseSave) { $('pReset').textContent = this.pauseSave.reset; $('pAbort').textContent = this.pauseSave.abort; $('pAbort').onclick = this.pauseSave.abortClick; $('pAbort').hidden = true; }
    $('offer').hidden = true; this.nearShown = ''; this.pose = null; $('kRun').hidden = true; $('kLift').hidden = true;
    g.endActivity();
  }
  // a short fade to black: cb runs while it is dark
  fade(cb) { $('kFade').classList.add('on'); this.fadeQ = { t: 0, cb, done: false }; }
  toCar() { this.fade(() => { this.stop(); this.game.ui.toast('Tilbake ved bilen'); }); }
  // ---------------------------------------------------------------- the chairlift
  ride(now) {
    const go = () => {
      const L = this.area.lift, C = this.resort.chairLoop(); let best = 1e9;
      // the chair just leaving the bottom station
      for (let i = 0; i < C.n; i++) { const s = this.resort.chairS(i); if (s < best) { best = s; this.chair = i; } }
      this.phase = 'lift'; this.run = null; this.k = null; this.ghost = null; this.showGhost(); this.resort.skip = this.chair; this.resort.live(null); this.resort.showGate(null); this.lastTower = -1; this.snap = true; this.tracks.clear();
      $('kRun').hidden = true; $('kLift').hidden = false; this.hint('Stolheisen tar deg til toppen · Enter eller mellomrom hopper over turen · C kamera', 8);
    };
    if (now) go(); else this.fade(go);
  }
  // off at the top: beside the top station, looking down the hill; the menu of pistes
  toTop(now) {
    const go = () => {
      const L = this.area.lift, s = this.skier, x = L.b[0] - L.vx * 9 - Math.sin(L.ang) * 6, z = L.b[2] - L.vz * 9 - Math.cos(L.ang) * 6;
      s.place(x, z, L.ang + Math.PI); this.vis.fig.headG.visible = true; this.phase = 'top'; this.run = null; this.k = null; this.resort.skip = -1; this.snap = true; $('kLift').hidden = true; $('kRun').hidden = true;
      this.menu();
    };
    if (now) go(); else this.fade(go);
  }
  menu() {
    const g = this.game; g.mode = 'pause'; g.ui.show('skiTop');
    $('ktNuts').textContent = fmtN(g.prof.nuts); const A = this.area.pistes;
    $('ktStars').textContent = '★ ' + A.reduce((s, k) => s + (g.best[k.key] ? g.best[k.key].s : 0), 0) + ' / ' + A.length * 3;
    $('ktList').innerHTML = A.map((k, i) => { const b = g.best[k.key], st = b ? '★'.repeat(b.s) + '☆'.repeat(3 - b.s) : '☆☆☆';
      return `<button class="item" data-p="${i}"><div><b><span class="diff" style="background:${k.col}"></span>${k.name} <small style="display:inline">${k.diff}</small></b><small>${k.desc} ${(k.runLen / 1000).toFixed(1).replace('.', ',')} km · ${Math.round(k.L[0].y - k.L[k.L.length - 1].y)} m fall</small></div><span class="price">${st}${b ? '<br>' + (k.points ? b.pts + ' p' : fmtTime(b.t)) : ''}</span></button>`; }).join('');
    $('ktList').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { g.ui.hide(); g.mode = 'act'; this.pick(A[+b.dataset.p]); });
  }
  free(now) {
    this.game.ui.hide(); this.game.mode = 'act';
    const go = () => { const s = this.skier, k = this.area.pistes.find(p => p.kind === 'slalom') || this.area.pistes[0], P = this.area.P(k, 16), T = this.area.T(k, 16); s.place(P.x, P.z, Math.atan2(T.x, T.z)); this.phase = 'free'; this.run = null; this.k = null; this.snap = true; this.tracks.clear(); $('kRun').hidden = true; $('kLift').hidden = true;
      this.hint('Fri kjøring: hele fjellet er ditt. Kjør ned til stolheisen og trykk Enter for å ta den opp igjen. ' + HINT_RUN, 12); };
    if (now) go(); else this.fade(go);
  }
  // ---------------------------------------------------------------- a run
  pick(k, now) {
    const go = () => {
      const s = this.skier, st = k.start; s.place(st.x - Math.sin(st.h) * 2.2, st.z - Math.cos(st.h) * 2.2, st.h);
      this.k = k; this.phase = 'count'; this.count = 3.5; this.beat = 4; this.run = new SkiRun(k); this.run.best = this.game.best[k.key]; this.snap = true; this.tracks.clear(); this.spray.clear();
      this.rec = []; this.recT = 0; const gd = this.game.store.get('ski-ghost:' + k.id, null); this.ghost = gd && gd.d && gd.d.length >= 14 && this.run.best ? { d: gd.d, n: gd.d.length / 7, i: 0 } : null;
      this.resort.live(k, this.run); this.resort.skip = -1; this.highlight();
      $('kLift').hidden = true; $('kRun').hidden = false; $('kName').textContent = k.name; $('kGate').textContent = '0/' + k.gates.length; $('kTime').textContent = '0:00,0'; $('kSplit').textContent = '';
      $('kGateL').textContent = 'Port'; $('kBestL').textContent = k.points ? 'Poeng' : 'Beste'; $('kBest').textContent = k.points ? '0' : this.run.best ? fmtTime(this.run.best.t) : '–';
      this.hint((k.points ? 'Big Jumps: hopp på kanten (mellomrom) for ekstra høyde, snurr med ← → i lufta, land med skiene rett fram. ' : '') + HINT_RUN, 9);
    };
    if (now) go(); else this.fade(go);
  }
  highlight() { const r = this.run; this.resort.showGate(r && !r.done ? this.k.gates[r.next] : null); }
  reset() {
    const s = this.skier, r = this.run;
    if (this.phase === 'run' && r) { const c = r.cp; s.place(c.x, c.z, c.h); this.snap = true; this.game.ui.toast('Tilbake ved forrige port'); }
    else if (this.phase === 'count' && this.k) this.pick(this.k, true);
    else if (this.phase === 'free' || this.phase === 'done') this.toTop();
  }
  gateEvent(e) {
    const g = this.game, r = this.run, k = this.k;
    if ((e.type === 'gate' || e.type === 'miss' || e.type === 'finish') && !k.points) { r.splits[e.i] = +(r.time + r.pen).toFixed(2); const b = r.best; if (b && b.splits && b.splits[e.i] != null) this.split(r.splits[e.i] - b.splits[e.i]); }
    if (e.type === 'gate') { this.sound && this.sound.beep(1180, 0.08); if (k.kind !== 'slalom') g.ui.toast('Port ' + (e.i + 1) + ' ✓'); }
    if (e.type === 'miss') { this.sound && this.sound.beep(200, 0.3); g.ui.toast('Bom på port ' + (e.i + 1) + ' · +5 s', true); }
    if (e.type === 'finish') this.finish();
    this.highlight();
  }
  split(d) { const el = $('kSplit'); el.textContent = (d < 0 ? '−' : '+') + fmtTime(Math.abs(d)).replace(/^0:/, ''); el.className = 'split ' + (d < 0 ? 'ahead' : 'behind'); this.splitT = 3; }
  finish() {
    const g = this.game, r = this.run, k = this.k, t = r.time + r.pen, old = g.best[k.key];
    const stars = k.points ? (r.points >= k.par[0] ? 3 : r.points >= k.par[1] ? 2 : 1) : (t <= k.par[0] && !r.missed ? 3 : t <= k.par[1] ? 2 : 1);
    const rec = k.points ? !old || r.points > (old.pts || 0) : !old || t < old.t, first = !old;
    let nuts = r.passed * 5 + stars * 10; const why = [r.passed + ' porter +' + r.passed * 5, stars + ' stjerner +' + stars * 10];
    if (!r.missed) { nuts += 25; why.push('ingen bom +25'); }
    if (k.points && r.points) { const n = Math.round(r.points / 10); nuts += n; why.push(r.points + ' poeng +' + n); }
    if (first) { nuts += 60; why.push('første tur +60'); } else if (rec) { nuts += 20; why.push('ny rekord +20'); }
    if (rec) { g.best[k.key] = { t, s: Math.max(stars, old ? old.s : 0), pts: r.points, splits: r.splits.slice() }; if (this.rec && this.rec.length >= 14) g.store.set('ski-ghost:' + k.id, { d: this.rec }); } else if (old && stars > old.s) old.s = stars;
    g.store.set('best', g.best); g.prof.nuts += nuts; g.saveProf();
    this.resort.result(k, { big: k.points ? r.points + ' p' : fmtTime(t), small: rec ? (first ? 'FØRSTE TUR' : 'NY REKORD!') : old ? (k.points ? (r.points - old.pts >= 0 ? '+' : '') + (r.points - old.pts) + ' POENG' : (t - old.t <= 0 ? '−' : '+') + Math.abs(t - old.t).toFixed(2).replace('.', ',') + ' MOT BESTE') : '', col: rec ? '#8bbb4a' : '#f2e8d0' });
    this.phase = 'done'; this.doneT = 0; this.resultShown = false; this.highlight(); this.sound && (this.sound.beep(1180, 0.2), setTimeout(() => this.sound && this.sound.beep(1480, 0.35), 180));
    g.ui.toast('Mål! ' + fmtTime(t));
    const carve = r.turnT > 1 ? Math.round(100 * r.carveT / r.turnT) : null;
    $('krKind').textContent = 'I mål · ' + k.diff.toLowerCase() + ' nedfart'; $('krName').textContent = k.name; $('krStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('krList').innerHTML = [['Tid', fmtTime(t)], r.pen ? ['Straff', '+' + r.pen + ' s (' + r.missed + ' bom)'] : null, k.points ? ['Hoppoeng', r.points + ' (' + r.jumps.length + ' hopp)'] : null, old ? ['Beste før', k.points ? (old.pts || 0) + ' poeng' : fmtTime(old.t)] : null,
      ['Tre stjerner', k.points ? k.par[0] + ' poeng' : fmtTime(k.par[0]) + ' uten bom'], ['Toppfart', Math.round(r.top * 3.6) + ' km/t'], carve != null ? ['Carving', carve + ' % av svingene'] : null, r.crashes ? ['Fall', r.crashes] : null,
      ['Muttere', '+' + nuts + ' ⚙'], rec ? ['', first ? 'Første tur!' : 'Ny rekord!'] : null].filter(Boolean).map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
    this.resultWhy = why;
  }
  // ---------------------------------------------------------------- keys
  press(k) {
    const g = this.game;
    switch (k) {
      case 'cam': if (this.phase === 'lift') { this.liftCam = (this.liftCam + 1) % LIFTCAMS.length; g.ui.toast(LIFTCAMS[this.liftCam]); } else { this.camMode = (this.camMode + 1) % CAMS.length; g.ui.toast(CAMS[this.camMode]); } this.snap = true; return true;
      case 'reset': this.reset(); return true;
      case 'enter': case 'handbrake':
        if (this.fadeQ) return true;
        if (this.phase === 'lift') { this.toTop(); return true; }
        if (k === 'enter' && (this.phase === 'free' || this.phase === 'done') && this.atLift()) { this.ride(); return true; }
        if (k === 'enter' && this.phase === 'done' && this.doneT > 1) { this.showResult(); return true; }
        if (k === 'enter' && this.phase === 'top') { this.menu(); return true; }
        return k === 'handbrake';
      case 'lights': this.lampOn = !(this.lampOn ?? U.uNight.value > 0.4); g.ui.toast(this.lampOn ? 'Hodelykt på' : 'Hodelykt av'); return true;
      case 'map': g.mode = 'pause'; g.ui.show('map'); return true;
      case 'pause':
        $('pReset').textContent = this.phase === 'run' || this.phase === 'count' ? 'Tilbake til forrige port' : 'Til toppen';
        $('pAbort').hidden = false; $('pAbort').textContent = this.phase === 'run' || this.phase === 'count' ? 'Avbryt nedfarten' : 'Tilbake til bilen';
        $('pAbort').onclick = () => { g.ui.hide(); g.mode = 'act'; if (this.phase === 'run' || this.phase === 'count') { g.ui.countdown(null); this.toTop(); } else this.toCar(); };
        if (this.phase === 'lift' || this.phase === 'top') $('pReset').textContent = 'Til toppen';
        return false;
    }
    return false;
  }
  atLift() { const L = this.area.lift, s = this.skier; return Math.hypot(s.pos.x - L.a[0], s.pos.z - L.a[2]) < 40 && s.speed < 3; }
  showResult() { const g = this.game; if (g.ui.open === 'skiResult' || this.fadeQ || this.phase !== 'done') return; g.mode = 'pause'; g.ui.show('skiResult'); }
  // ---------------------------------------------------------------- every frame
  update(dt, inp) {
    const g = this.game, s = this.skier, T = this.touch;
    if (this.phase === 'lift') return this.updateLift(dt);
    // the controls: keyboard (steering eased in by Input), gamepad stick and triggers, the touch pads
    const ts = (T.left ? 1 : 0) - (T.right ? 1 : 0); if (ts) this.tSteer = clamp((this.tSteer || 0) + clamp(ts - (this.tSteer || 0), -dt * 3, dt * 3), -1, 1); else this.tSteer = 0;
    const jumpNow = !!(inp.handbrake || T.jump), jump = jumpNow && !this.lastJump; this.lastJump = jumpNow;
    const auto = this.phase === 'done', waiting = this.phase === 'count' || this.phase === 'top';
    const I = { steer: auto ? (this.doneT < 2 && s.speed > 2 ? 1 : 0) : waiting ? 0 : (ts ? this.tSteer : inp.steer), gas: auto || waiting ? 0 : Math.max(inp.gas, T.gas || 0), brake: auto ? 1 : waiting ? 0 : Math.max(inp.brake, T.brake || 0), jump: !auto && !waiting && jump };
    // the countdown; at «KJØR!» the skier pushes out of the start
    if (this.phase === 'count') {
      this.count -= dt; const n = Math.ceil(this.count - 0.5);
      if (n < this.beat && n >= 1) { this.beat = n; this.sound && this.sound.beep(660, 0.12); }
      if (this.count <= 0.5 && this.beat > 0) { this.beat = 0; this.sound && this.sound.beep(990, 0.35); }
      g.ui.countdown(this.count > 0.5 ? n : 'KJØR!');
      if (this.count <= 0) { this.phase = 'run'; const st = this.k.start; s.vel.set(Math.sin(st.h) * 2.2, 0, Math.cos(st.h) * 2.2); }
    } else if (this.phase === 'run' && this.count > -0.8) { this.count -= dt; if (this.count <= -0.8) g.ui.countdown(null); }
    // physics at 240 Hz; the gates are crossed between the steps
    if (this.phase !== 'count' && this.phase !== 'top') {
      this.acc += dt; let n = 0; const r = this.run, p1 = { x: 0, z: 0 };
      while (this.acc >= DT && n < MAXSTEP) {
        p1.x = s.pos.x; p1.z = s.pos.z; s.step(DT, I); I.jump = false; this.acc -= DT; n++;
        for (const e of s.ev) this.event(e); s.ev.length = 0;
        if (r && this.phase === 'run') {
          if (!r.started && r.crossStart(p1, s.pos)) { r.started = true; this.resort.wand(this.k); this.sound && this.sound.pole(); }
          for (const e of r.cross(p1, s.pos)) this.gateEvent(e);
          if (this.phase !== 'run') break;
        }
      }
      if (n >= MAXSTEP) this.acc = 0;
      if (r && this.phase === 'run' && r.started) { r.time += dt; r.top = Math.max(r.top, s.speed); if (Math.abs(s.inc) > 0.15 && !s.air && s.crashT === 0) { r.turnT += dt; if (s.carve > 0.6) r.carveT += dt; }
        // the run for the ghost, ten times a second [time, x, y, z, heading, lean, tuck]
        if ((this.recT = (this.recT || 0) - dt) <= 0 && this.rec.length < 7 * 10 * 600) { this.recT = 0.1; this.rec.push(+r.time.toFixed(2), +(s.pos.x - this.isl.ox).toFixed(2), +s.pos.y.toFixed(2), +(s.pos.z - this.isl.oz).toFixed(2), +s.head.toFixed(2), +s.inc.toFixed(2), s.tuck > 0.5 ? 1 : 0); } }
      // other skiers: a real collision takes you both down
      if (s.crashT === 0 && this.resort.hit(s)) s.crash('Krasjet med en skiløper');
      // a fall: tumble, lie still, get up (where you fell if that is on the piste and clear, otherwise at the last gate or the top)
      if (s.crashT > 2.6) this.getUp();
    }
    if (this.phase === 'done' && !this.fadeQ) { this.doneT += dt; if (this.doneT > 1.8 && s.speed < 2 && !this.resultShown) { this.resultShown = true; this.showResult(); } }
    // on screen
    this.vis.sync(s, dt, { area: this.area, going: this.phase !== 'top' && this.phase !== 'count', kick: (() => { const kk = !s.air && this.area.kickerAt(s.pos.x, s.pos.z); return kk && kk.a > -1.6 && kk.a < 0; })() });
    this.spray.update(dt, s); this.tracks.update(dt, s); this.showGhost();
    this.camera(dt, inp);
    this.pose.pos.set(s.pos.x, s.pos.y, s.pos.z); this.pose.fw.set(Math.sin(s.head), 0, Math.cos(s.head)); this.pose.kmh = s.speed * 3.6;
    this.where = this.k ? this.k.name + (this.phase === 'done' ? ' · i mål' : '') : this.phase === 'free' ? 'Fri kjøring' + (s.surf === 'deep' ? ' · løssnø' : s.surf === 'groomed' ? ' · preparert løype' : '') : 'Toppen';
    this.hud(dt);
    // at the bottom in free skiing (or after a run): the lift
    const off = $('offer'), near = this.fadeQ ? '' : (this.phase === 'free' || this.phase === 'done') && this.atLift() ? 'lift' : this.phase === 'top' ? 'top' : this.phase === 'done' && this.resultShown ? 'done' : '';
    if (near !== this.nearShown) { this.nearShown = near; off.hidden = !near; const O = { lift: ['Stolheisen', 'Ta heisen opp', 'til toppen'], top: ['Toppen', 'Velg nedfart', 'eller fri kjøring'], done: ['I mål', 'Se resultatet', 'og kjør igjen'] }[near]; if (O) { $('oKind').textContent = O[0]; $('oName').textContent = O[1]; $('oInfo').textContent = O[2]; } }
    this.sounds(dt);
  }
  event(e) {
    const g = this.game, s = this.skier, r = this.run;
    if (e.type === 'crash') { if (r) r.crashes++; this.vis.crashFast = s.speed > 5; g.ui.toast(e.why + '!', true); this.sound && this.sound.fall(e.speed); this.spray.burst(s.pos.x, s.pos.y, s.pos.z, 30, 3, s.vel.x, s.vel.z); this.shake = 0.25; }
    if (e.type === 'takeoff') { this.vis.takeoff(); if (e.pop) { if (r) r.pops++; g.ui.toast('Perfekt sats!'); } }
    if (e.type === 'pole') this.sound && this.sound.pole();
    if (e.type === 'bump' && e.hard > 2.5) this.shake = Math.min(0.12, e.hard * 0.02);
    if (e.type === 'land') {
      this.sound && this.sound.land(e.hard); if (e.hard > 3) this.spray.burst(s.pos.x, s.pos.y, s.pos.z, Math.min(30, e.hard * 3 | 0), 1.5 + e.hard * 0.3, s.vel.x, s.vel.z); if (e.hard > 5) this.shake = Math.min(0.2, e.hard * 0.02);
      if (e.air > 0.35 && r && this.phase === 'run') { r.jumps.push(e); if (this.k.points) { const p = jumpPoints(e.air, e.spins, e.pop); r.points += p; $('kBest').textContent = r.points; g.ui.toast((e.spins ? e.spins * 360 + '°! ' : e.pop ? 'Perfekt sats! ' : 'Hopp! ') + e.air.toFixed(1).replace('.', ',') + ' s · +' + p + ' poeng'); } else if (e.air > 0.6) g.ui.toast('Hopp! ' + e.air.toFixed(1).replace('.', ',') + ' s'); }
      else if (e.air > 0.6 && e.spins) g.ui.toast(e.spins * 360 + '°!');
      if (e.wob) g.ui.toast('Hold balansen!', true);
    }
    if (e.type === 'hit' && e.j > 200) this.shake = 0.15;
  }
  // the ghost of your best run in this piste: waits at the start until you push off, then skis with your clock
  showGhost() {
    const G = this.ghost, r = this.run, on = G && r && (this.phase === 'count' || this.phase === 'run');
    if (!this.ghostVis) { if (!on) return; this.ghostVis = this.resort.ghost(); }
    const V = this.ghostVis; V.up.visible = V.tuck.visible = false; if (!on) return;
    const d = G.d, n = G.n, t = r.started ? r.time : 0; if (t > d[(n - 1) * 7] + 0.5) return;
    let i = Math.min(G.i, n - 2); while (i > 0 && d[i * 7] > t) i--; while (i < n - 2 && d[(i + 1) * 7] <= t) i++; G.i = i;
    const a = i * 7, b = a + 7, u = clamp((t - d[a]) / Math.max(1e-3, d[b] - d[a]), 0, 1), L = j => d[a + j] + (d[b + j] - d[a + j]) * u, h = d[a + 4] + wrap(d[b + 4] - d[a + 4]) * u;
    const m = d[a + 6] ? V.tuck : V.up, x = L(1) + this.isl.ox, z = L(3) + this.isl.oz; m.visible = true; m.position.set(x, L(2), z);
    const fx = Math.sin(h), fz = Math.cos(h), slope = Math.atan2(this.area.ground(x + fx * 0.8, z + fz * 0.8) - this.area.ground(x - fx * 0.8, z - fz * 0.8), 1.6); m.rotation.set(-slope, h, -L(5) * 0.85, 'YXZ');
  }
  getUp() {
    const s = this.skier, r = this.run, x = s.pos.x, z = s.pos.z, pi = this.area.piste(x, z);
    const clear = !this.game.world.colliders(x, z, 1).some(c => (c.r != null ? Math.hypot(c.x - x, c.z - z) < c.r + 1 : Math.hypot(c.x - x, c.z - z) < Math.max(c.hw, c.hd) + 1));
    if (pi && pi.m > 1 && clear && this.game.world.water(x, z) < s.pos.y) { const k = pi.k, sOn = this.area.sOn(k, x, z), T = this.area.T(k, Math.min(k.len, sOn.s + 3)); s.place(x, z, Math.atan2(T.x, T.z)); }
    else if (r && this.phase === 'run') { const c = r.cp; s.place(c.x, c.z, c.h); }
    else if (clear && this.game.world.water(x, z) < s.pos.y - 0.05 && this.isl.inside(x, z, 50) && (!pi || pi.m > 0)) s.place(x, z, s.head);
    else { // back up on the nearest piste
      let best = null; for (const k of this.area.pistes) { const o = this.area.sOn(k, x, z); if (!best || o.d < best.d) best = Object.assign(o, { k }); }
      const P = this.area.P(best.k, best.s), T = this.area.T(best.k, best.s); s.place(P.x, P.z, Math.atan2(T.x, T.z)); }
    this.snap = true;
  }
  updateLift(dt) {
    const L = this.area.lift, S = this.resort.chairS(this.chair, dt), c = L.chairAt(S, _c);
    this.vis.seat(c, 0.32); this.vis.root.visible = true;
    for (let i = 0; i < L.towersS.length; i++) if (S >= L.towersS[i] && S < L.towersS[i] + 4 && this.lastTower !== i) { this.lastTower = i; this.sound && this.sound.clank(); }
    if (S >= L.upLen - 1.5 && S < L.upLen + 20 && !this.fadeQ) this.toTop();
    this.pose.pos.set(c.x, c.y - 2.3, c.z); this.pose.fw.set(Math.sin(c.yaw), 0, Math.cos(c.yaw)); this.pose.kmh = L.speed * 3.6; this.where = 'Gautefallheisen';
    this.liftCamera(dt, c);
    this.hudT = (this.hudT || 0) - dt; if (this.hudT <= 0) { this.hudT = 0.2; $('kLiftT').textContent = fmtTime(Math.max(0, (L.upLen - S) / L.speed)).replace(/,\d$/, ''); $('kLiftH').textContent = Math.round(c.y - 2.4) + ' moh.'; this.drawInst(L.speed); this.drawMini(); }
    this.sounds(dt);
  }
  sounds(dt) {
    const snd = this.game.snd;
    if (snd.ready && snd.ac && !this.sound) try { this.sound = new SkiSound(snd); } catch (e) { console.warn('skilyd', e); this.sound = { update() { }, stop() { }, pole() { }, land() { }, fall() { }, clank() { }, beep() { } }; }
    if (this.sound) this.sound.update(dt, { mode: this.phase === 'lift' ? 'lift' : this.phase === 'top' || this.fadeQ ? 'off' : 'ski', s: this.skier });
  }
  frame(dt) {
    if (!this.area) return;
    const g = this.game, cam = g.gfx.camera;
    // the fade to black and back
    const F = this.fadeQ; if (F) { F.t += dt; if (F.t > 0.42 && !F.done) { F.done = true; F.cb(); } if (F.t > 0.6) $('kFade').classList.remove('on'); if (F.t > 1) this.fadeQ = null; }
    const s = this.active && this.skier, ph = this.phase;
    this.resort.update(dt, cam.position, s && this.k && (ph === 'run' || ph === 'done') ? { k: this.k, x: s.pos.x, z: s.pos.z } : null);
    if (this.active && s) {
      // the arrow to the next gate when it is far or was missed
      const r = this.run, G = r && !r.done && ph === 'run' ? this.k.gates[r.next] : null;
      if (G && !s.air) { const d = Math.hypot(G.x - s.pos.x, G.z - s.pos.z), ahead = (G.x - s.pos.x) * Math.sin(s.dir) + (G.z - s.pos.z) * Math.cos(s.dir); if (d > 160 || ahead < -15) this.arrow.set(s.pos.x, s.pos.y + 2.3, s.pos.z, G.x, G.z, ahead < -15, U.uTime.value); else this.arrow.hide(); } else this.arrow.hide();
      // the headlamp in the dark
      const on = this.lampOn ?? U.uNight.value > 0.4; const hp = this.vis.fig.headG.getWorldPosition(_v);
      this.lamp.intensity = on && ph !== 'lift' ? 8 : 0; this.lamp.position.copy(hp); this.lamp.target.position.set(hp.x + Math.sin(s.dir) * 16, hp.y - 2.2, hp.z + Math.cos(s.dir) * 16); this.lamp.target.updateMatrixWorld();
      // at the top, while the menu is open: the camera circles the skier
      if (ph === 'top' && g.mode === 'pause') { const a = performance.now() * 0.00012, p = s.pos; cam.position.set(p.x + Math.sin(a) * 5, p.y + 2.2, p.z + Math.cos(a) * 5); cam.up.set(0, 1, 0); cam.lookAt(p.x, p.y + 0.9, p.z); cam.fov = 50; cam.updateProjectionMatrix();
        this.vis.sync(s, dt, { area: this.area, going: false }); }
    }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('kHint').classList.add('off'); }
    if (this.splitT > 0) { this.splitT -= dt; if (this.splitT <= 0) $('kSplit').textContent = ''; }
  }
  // ---------------------------------------------------------------- cameras
  camera(dt, inp) {
    const g = this.game, cam = g.gfx.camera, C = g.cam, s = this.skier, W = g.world, p = s.pos, v = s.vel, hs = Math.hypot(v.x, v.z);
    if (inp.lookX || inp.lookY) { C.yaw = -inp.lookX * 2.2; C.pitch = Math.max(-0.3, inp.lookY * 0.8); C.dragT = 0.3; }
    C.dragT -= dt; if (C.dragT <= 0) { C.yaw *= Math.exp(-dt * 2.5); C.pitch *= Math.exp(-dt * 2.5); }
    // the way the skier goes (more than where the skis point, so a skid shows); held still in the air and in a fall
    let dirH = hs > 1.2 ? Math.atan2(v.x, v.z) : s.head; if (hs > 1.2) dirH = s.head + wrap(dirH - s.head) * 0.7;
    if (s.air || s.crashT > 0) dirH = this.camH;
    if (this.snap) this.camH = dirH; else this.camH += wrap(dirH - this.camH) * (1 - Math.exp(-dt * (this.camMode === 2 ? 1.5 : 3.5)));
    if (this.camMode === 1 && s.crashT === 0) {
      // the helmet camera: from the goggles, along the way the skier goes, leaning with the turn
      const f = this.vis.fig; f.root.updateMatrixWorld(true); f.headG.getWorldPosition(_v); const h = this.camH + C.yaw;
      cam.position.set(_v.x + Math.sin(h) * 0.12, _v.y + 0.02, _v.z + Math.cos(h) * 0.12);
      _e.set(-0.22 - C.pitch * 0.6, h + Math.PI, -s.inc * 0.55, 'YXZ'); cam.quaternion.setFromEuler(_e); cam.fov = 74 + Math.min(10, s.speed * 0.3); cam.near = 0.05;
      f.headG.visible = false;
    } else {
      this.vis.fig.headG.visible = true;
      // low behind (it swings out in the turns as it lags), or far behind and higher
      const far = this.camMode === 2, dist = (far ? 11 : 3.6 + Math.min(1.5, s.speed * 0.05)) * C.zoom, hh = (far ? 4.5 : 1.75) * Math.sqrt(C.zoom), ang = this.camH + C.yaw;
      const want = _v.set(p.x - Math.sin(ang) * dist, p.y + hh + C.pitch * dist * 0.5, p.z - Math.cos(ang) * dist);
      // pull in when a tree, a hut or a mast stands between
      let k = 1; for (const c of W.colliders(p.x, p.z, dist + 2)) { const ex = c.x - p.x, ez = c.z - p.z, bx = want.x - p.x, bz = want.z - p.z, L2 = bx * bx + bz * bz || 1, u = (ex * bx + ez * bz) / L2; if (u <= 0 || u >= 1) continue;
        const r = (c.r ?? Math.max(c.hw, c.hd)) + 0.3, qx = bx * u - ex, qz = bz * u - ez; if (qx * qx + qz * qz < r * r) k = Math.min(k, Math.max(0.3, u - 0.15)); }
      if (k < 1) want.set(p.x + (want.x - p.x) * k, p.y + (want.y - p.y) * k, p.z + (want.z - p.z) * k);
      const floor = W.height(want.x, want.z) + 0.5; if (want.y < floor) want.y = floor;
      if (this.snap) this.camPos.copy(want); else { const kk = 1 - Math.exp(-dt * (far ? 3 : 8)); this.camPos.lerp(want, kk); this.camPos.y = Math.max(this.camPos.y, floor); }
      cam.position.copy(this.camPos); cam.up.set(0, 1, 0);
      const la = far ? 3 : 3 + Math.min(5, s.speed * 0.2); _w.set(p.x + Math.sin(this.camH) * la, p.y + (far ? 0.6 : 0.45), p.z + Math.cos(this.camH) * la);
      if (this.snap) this.look.copy(_w); else this.look.lerp(_w, 1 - Math.exp(-dt * 10)); cam.lookAt(this.look);
      cam.fov = (far ? 50 : 58) + Math.min(14, s.speed * 0.35); cam.near = 0.1;
    }
    // the camera shakes with speed, on ice, over bumps and in a hockey stop
    const gnd = !s.air && s.crashT === 0, amp = gnd ? Math.min(0.03, s.speed * 0.0006 + (s.surf === 'ice' ? 0.006 : 0) + Math.abs(s.hock) * 0.006 + (s.surf === 'deep' ? 0.004 : 0)) * (this.camMode === 1 ? 0.5 : 1) : 0;
    this.shake = Math.max(0, (this.shake || 0) * Math.exp(-dt * 6)); const a = amp + this.shake * 0.1;
    if (a > 0.0005) { cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a; }
    cam.updateProjectionMatrix(); this.snap = false;
  }
  liftCamera(dt, c) {
    const g = this.game, cam = g.gfx.camera, C = g.cam, W = g.world, sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), ox = Math.cos(c.yaw), oz = -Math.sin(c.yaw);
    C.dragT -= dt; if (C.dragT <= 0) { C.yaw *= Math.exp(-dt * 2.5); C.pitch *= Math.exp(-dt * 2.5); }
    let pos, look;
    this.vis.fig.headG.visible = this.liftCam !== 1;
    if (this.liftCam === 1) { // from the seat: the skis dangling, the line of towers going up ahead
      pos = _v.set(c.x + ox * 0.32 + sy * 0.1, c.y - 1.68, c.z + oz * 0.32 + cy * 0.1); const h = c.yaw + C.yaw; look = _w.set(pos.x + Math.sin(h) * 10, pos.y - 3.2 + C.pitch * 6, pos.z + Math.cos(h) * 10); cam.fov = 72;
    } else if (this.liftCam === 2) { // out to the side and ahead, looking back at the chair and down over the valley
      pos = _v.set(c.x + ox * 7 + sy * 9, c.y + 0.5, c.z + oz * 7 + cy * 9); look = _w.set(c.x - sy * 4, c.y - 6, c.z - cy * 4); cam.fov = 58;
    } else { // behind the chair, out on the side away from the other cable and a little above: the rider, the chairs coming down, the line ahead
      const h = c.yaw + C.yaw; pos = _v.set(c.x - Math.sin(h) * 3.6 + ox * 2.4, c.y - 0.6 + C.pitch * 3, c.z - Math.cos(h) * 3.6 + oz * 2.4); look = _w.set(c.x + sy * 7 + ox * 0.3, c.y - 3.4, c.z + cy * 7 + oz * 0.3); cam.fov = 60;
    }
    const floor = W.height(pos.x, pos.z) + 0.5; if (pos.y < floor) pos.y = floor;
    if (this.snap) this.camPos.copy(pos); else this.camPos.lerp(pos, 1 - Math.exp(-dt * 6));
    cam.position.copy(this.camPos); cam.up.set(0, 1, 0); cam.lookAt(look); cam.near = 0.05; cam.updateProjectionMatrix(); this.snap = false;
  }
  // ---------------------------------------------------------------- HUD
  hud(dt) {
    const s = this.skier, r = this.run;
    this.drawInst(s.speed);
    this.hudT = (this.hudT || 0) - dt; if (this.hudT > 0) return; this.hudT = 0.1;
    if (r && this.k) { $('kTime').textContent = fmtTime(r.time + r.pen); $('kGate').textContent = Math.min(r.next + (r.done ? 0 : 1), this.k.gates.length) + '/' + this.k.gates.length; }
    const on = (id, v) => { $(id).className = v ? 'on' : ''; };
    const up = s.crashT === 0; on('kLKant', up && s.carve > 0.6 && !s.air); on('kLSkli', up && s.skid > 1.2 && !s.air); on('kLPlog', up && (s.plow > 0.5 || Math.abs(s.hock) > 0.5)); on('kLLuft', up && s.air && s.airT > 0.15);
    this.drawMini();
  }
  drawInst(v) {
    const x = this.ictx, S = 220, cx = S / 2, cy = S / 2, R = 96, top = 120, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, A = u => a0 + (a1 - a0) * Math.min(1, u / top), kmh = v * 3.6;
    x.clearRect(0, 0, S, S); x.fillStyle = 'rgba(14,13,10,.78)'; x.beginPath(); x.arc(cx, cy, R + 10, 0, 7); x.fill();
    // the inner arc: the lean into the turn (how hard the edges work), left or right of the middle
    const s = this.skier, inc = this.phase === 'lift' ? 0 : clamp(s.inc / 1.2, -1, 1), mid = (a0 + a1) / 2;
    x.lineWidth = 8; x.strokeStyle = 'rgba(242,232,208,.12)'; x.beginPath(); x.arc(cx, cy, R - 22, a0, a1); x.stroke();
    x.strokeStyle = s.carve > 0.6 ? '#8bbb4a' : '#e5a92b'; x.beginPath(); if (inc < 0) x.arc(cx, cy, R - 22, mid, mid - inc * (a1 - mid)); else x.arc(cx, cy, R - 22, mid - inc * (mid - a0), mid); x.stroke();
    x.strokeStyle = 'rgba(242,232,208,.8)'; x.fillStyle = 'rgba(242,232,208,.85)'; x.font = '600 13px "Barlow Condensed"'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let u = 0; u <= top + 0.1; u += 10) { const a = A(u), big = u % 20 === 0; x.lineWidth = big ? 2.2 : 1; x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - (big ? 9 : 5)), cy + Math.sin(a) * (R - (big ? 9 : 5))); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke(); if (big) x.fillText(u, cx + Math.cos(a) * (R - 36), cy + Math.sin(a) * (R - 36)); }
    const a = A(kmh); x.strokeStyle = '#ff5a2a'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); x.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); x.stroke();
    x.fillStyle = '#2a261e'; x.beginPath(); x.arc(cx, cy, 10, 0, 7); x.fill();
    x.fillStyle = '#f2e8d0'; x.font = '700 34px "Barlow Condensed"'; x.fillText(Math.round(kmh), cx, cy + 44); x.font = '500 13px "Barlow Condensed"'; x.fillStyle = 'rgba(242,232,208,.6)'; x.fillText('km/t', cx, cy + 64);
    x.font = '700 15px "Barlow Condensed"'; x.fillStyle = '#e5a92b'; x.fillText(this.phase === 'lift' ? 'STOLHEIS' : s.crashT > 0 ? 'FALL' : s.air ? 'I LUFTA' : s.walk ? 'FISKEBEIN' : s.tuck > 0.5 ? 'HOCKEYSTILLING' : s.poleK > 0.5 ? 'STAVTAK' : s.carve > 0.6 ? 'CARVING' : s.skid > 1.5 ? 'SKRENS' : '', cx, cy - 34);
  }
  // the pistes on the minimap (over the game's map, same scale and rotation): their lines, the lift, the next gate
  drawMini() {
    const x = this.mctx, S = 220; x.clearRect(0, 0, S, S); const f = this.pose; if (!f) return;
    const R = 260 + Math.min(500, f.kmh * 4), k = S / 2 / R, h = Math.atan2(f.fw.x, f.fw.z), cs = Math.cos(h), sn = Math.sin(h), M = (wx, wz) => { const dx = wx - f.pos.x, dz = wz - f.pos.z; return [S / 2 - (dx * cs - dz * sn) * k, S / 2 - (dx * sn + dz * cs) * k]; };
    x.save(); x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, 7); x.clip(); x.lineCap = 'round'; x.lineJoin = 'round';
    for (const p of this.area.pistes) { x.strokeStyle = p.col; x.globalAlpha = this.k && this.k !== p ? 0.4 : 0.9; x.lineWidth = Math.max(2, p.hw * 2 * k); x.beginPath(); p.L.forEach((q, i) => { const [X, Z] = M(q.x, q.z); i ? x.lineTo(X, Z) : x.moveTo(X, Z); }); x.stroke();
      for (const l of p.links) { const [X0, Z0] = M(l.a.x, l.a.z), [X1, Z1] = M(l.b.x, l.b.z); x.lineWidth = Math.max(2, 24 * k); x.beginPath(); x.moveTo(X0, Z0); x.lineTo(X1, Z1); x.stroke(); } }
    x.globalAlpha = 1; const L = this.area.lift, [A0, B0] = M(L.a[0], L.a[2]), [A1, B1] = M(L.b[0], L.b[2]); x.strokeStyle = '#14120e'; x.lineWidth = 2; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(A0, B0); x.lineTo(A1, B1); x.stroke(); x.setLineDash([]);
    const r = this.run; if (r && !r.done && this.k) { const G = this.k.gates[r.next], [X, Z] = M(G.x, G.z); x.fillStyle = '#ffcf4a'; x.beginPath(); x.arc(X, Z, 6, 0, 7); x.fill(); }
    x.restore();
  }
  // ---------------------------------------------------------------- «Kjør sammen»
  netData() { const s = this.skier; if (!s) return null; if (this.phase === 'lift') return { m: 1 }; return { i: +s.inc.toFixed(2), t: s.tuck > 0.5 ? 1 : 0, p: +s.plow.toFixed(1), a: s.air ? 1 : 0, c: s.crashT > 0 ? 1 : 0, w: s.walk, k: +s.poleK.toFixed(1), ph: +s.pole.toFixed(2), s: Math.abs(s.spinV) > 2 ? 1 : 0, sk: +s.skid.toFixed(1) }; }
  remoteVisual(who) {
    const g = this.game, f = new SkierFigure(g.gfx, { jacket: who.color || '#2f6fd6', helmet: '#1d1c1a' }), root = new THREE.Group(); root.add(f.root); f.root.rotation.order = 'YXZ'; let t = 0;
    return { root, tagY: 2.3, dispose() { },
      update(pose, dt) {
        t += dt; const d = pose.data || {}, h = Math.atan2(pose.fw.x, pose.fw.z);
        if (d.m) { root.position.copy(pose.pos); root.position.y -= 0.1; f.root.rotation.set(0, h, 0); f.pose({ seated: true }); return; }
        root.position.copy(pose.pos); f.root.rotation.set(0, h, 0);
        f.body.rotation.set(d.c ? -1.2 : 0, 0, d.c ? 1.1 : 0);
        f.pose({ c: d.a ? 0.35 : 0.15, tk: d.t || 0, inc: d.i || 0, plow: d.p || 0, walk: d.w || 0, pole: d.ph || 0, poleK: d.k || 0, air: !!d.a, spin: !!d.s, t, ang: 0.45 });
      } };
  }
}
