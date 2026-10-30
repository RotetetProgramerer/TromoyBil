// The boat: park the car at the marina, rent a boat (the dinghy is free, the others cost nuts) and drive it on the real sea round
// Tromøya, or race between the buoys. The physics is sim/physics/boat.js at 240 Hz on the same waves the sea shader draws; the
// models, spray and wake are sim/render/boatvis.js, the marina sim/render/marina.js, the races sim/data/marinas.js.
// Controls: throttle = gas − brake (astern below zero), steer as the car, E/Q trim the engine in Ekte (Lett trims by itself),
// C camera, R back to the last gate (or the marina), Enter at the pontoon opens the marina (other boats, races, go ashore).
import * as THREE from 'three';
import { Activity } from './activity.js';
import { Boat, waveHeight } from '../physics/boat.js';
import { BOATS, boatById } from '../data/boats.js';
import { MARINAS, prepRace, gateCrossed } from '../data/marinas.js';
import { U } from '../render/gfx.js';
import { BoatVisual, Wake, Spray, BuoyPair, buoyLamps, Arrow } from '../render/boatvis.js';
import { Marina } from '../render/marina.js';
import { fmtTime } from '../courses.js';
import { BoatSound } from '../audio/boatsound.js';

const DT = 1 / 240, MAXSTEP = 36, PRICE = { jolle: 0, motorbat: 350, racer: 1200 }, DIAL = { jolle: 30, motorbat: 50, racer: 70 };
const CAMS = ['Følgekamera', 'Ved roret', 'Langt bak'], DIFFCOL = ['#8bbb4a', '#8bbb4a', '#f2c230', '#d9432f'], DIFF = ['', 'Lett', 'Middels', 'Vanskelig'];
const $ = id => document.getElementById(id), fmtN = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

const CSS = `
#bHud{position:absolute;inset:0;pointer-events:none}
body:not([data-act=boat]) #bHud{display:none}
#bHud .bdash{position:absolute;right:14px;bottom:12px;display:flex;flex-direction:column;align-items:center}
#bInst{width:200px;height:200px}
#bMini{position:absolute;right:16px;top:14px;width:180px;height:180px;border-radius:50%;pointer-events:none}
#bHint{position:absolute;left:16px;bottom:10px;max-width:calc(100% - 290px);font-size:15px;line-height:1.3;color:var(--ink);text-shadow:0 1px 3px #000;transition:opacity 1.2s}
#bHint.off,body:has(#offer:not([hidden])) #bHint{opacity:0}
@media (max-width:900px){#bHint{font-size:13px;max-width:calc(100% - 250px)}}
#bHud .split{min-height:0}
#bTouch{display:none}
body.is-touch #bTouch{display:block}
body.is-touch #bHint{display:none}
body.is-touch #bHud .bdash{transform:scale(.8);transform-origin:bottom right}
#bTouch .tpad.r{right:196px;bottom:18px;align-items:flex-end}
#bTouch .tpad.t{right:196px;bottom:128px;flex-direction:column;gap:8px}
#bTouch .tb.sm{width:54px;height:54px;font-size:15px}
@media (max-height:420px){#bTouch .tpad.t{right:392px;bottom:18px}}
#boatMenu .item .diff{vertical-align:1px}
@media (max-width:760px){#bMini{width:120px;height:120px}}
`;
const HUD = `
<canvas id="bMini" width="220" height="220" aria-hidden="true"></canvas>
<div class="course" id="bRace" hidden><div class="cname" id="bRName"></div><div class="crow"><span>Tid</span><b id="bRTime">0:00,0</b></div>
  <div class="crow"><span>Port</span><b id="bRGate">0/0</b></div><div class="crow"><span>Beste</span><b id="bRBest">–</b></div><div class="split" id="bRSplit"></div></div>
<div class="bdash"><canvas id="bInst" width="220" height="220" aria-hidden="true"></canvas>
  <div class="lamps"><i id="bLAuto">AUTO</i><i id="bLGrunt">GRUNT</i><i id="bLLuft">LUFT</i><i id="bLLys">LYS</i></div></div>
<div id="bHint">↑ ↓ gass og revers · ← → ror · E / Q trim (Ekte) · C kamera · R tilbake · Enter ved brygga: marinaen</div>
<div id="bTouch">
  <div class="tpad l"><button class="tb" data-b="left" aria-label="Ror til babord"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button class="tb" data-b="right" aria-label="Ror til styrbord"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div>
  <div class="tpad t" id="bTrimPad"><button class="tb sm" data-b="trimUp" aria-label="Trim ut">T+</button><button class="tb sm" data-b="trimDown" aria-label="Trim inn">T−</button></div>
  <div class="tpad r"><button class="tb" data-b="back" aria-label="Revers"><svg viewBox="0 0 24 24"><path d="M5 9l7 7 7-7"/></svg></button><button class="tb big" data-b="gas" aria-label="Gass"><svg viewBox="0 0 24 24"><path d="M5 15l7-7 7 7"/></svg></button></div>
</div>`;
const MENU = `
<header class="brand"><p class="eyebrow" id="bmWhere">Marina</p><h1>Båt&shy;utleie</h1>
  <p class="lede" id="bmLede">Lei en båt og kjør fritt i sundet og ut mot havet, eller kjør båtløp mellom bøyene. Jolla er gratis.</p></header>
<div class="panel">
  <div class="wallet"><span>⚙ <b id="bmNuts">0</b> muttere</span><span id="bmStars"></span></div>
  <h2>Båter</h2><div class="list" id="bmBoats"></div>
  <h2>Båtløp</h2><div class="list" id="bmRaces"></div>
  <button class="go" id="bmGo">Fri kjøring</button>
  <button class="ghost" id="bmBack">Tilbake til bilen</button>
</div>`;
const RESULT = `
<header class="brand"><p class="eyebrow">Båtløp fullført</p><h1 id="brName"></h1><p class="stars" id="brStars"></p></header>
<div class="panel"><ul class="rlist" id="brList"></ul><button class="go" id="brAgain">Kjør igjen</button><button class="ghost" id="brDone">Kjør videre</button></div>`;

export default class BoatActivity extends Activity {
  static id = 'boat';
  async init() {
    const g = this.game;
    g.prof.boats = g.prof.boats || ['jolle'];
    this.boatId = g.store.get('boat', 'jolle'); if (!this.owns(this.boatId)) this.boatId = 'jolle';
    this.marinas = [];
    for (const m of MARINAS) {
      const isl = g.world.islands.find(i => i.id === m.island); if (!isl) continue;
      const M = new Marina(g.gfx, g.world, isl, m); M.races = m.races.map(r => prepRace(m, r)); this.marinas.push(M);
    }
    this.dom();
    this.touch = {}; this.lever = 0; this.acc = 0; this.camMode = 0; this.camH = 0; this.camPos = new THREE.Vector3(); this.snap = true;
    this.pairs = []; this.race = null; this.lightsOn = null;
  }
  owns(id) { return !PRICE[id] || (this.game.prof.boats || []).includes(id); }
  // ---------------------------------------------------------------- DOM
  dom() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hud = document.createElement('div'); hud.id = 'bHud'; hud.innerHTML = HUD; $('hud').appendChild(hud);
    for (const [id, html] of [['boatMenu', MENU], ['boatResult', RESULT]]) { const s = document.createElement('section'); s.className = 'overlay'; s.id = id; s.hidden = true; s.innerHTML = html; document.body.insertBefore(s, $('loading')); }
    this.ictx = $('bInst').getContext('2d'); this.mctx = $('bMini').getContext('2d');
    hud.querySelectorAll('[data-b]').forEach(b => {
      const k = b.dataset.b;
      const on = e => { e.preventDefault(); this.touch[k] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { } };
      const off = () => { this.touch[k] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    });
    $('brAgain').onclick = () => { const r = this.lastRace; this.game.ui.hide(); this.game.mode = 'act'; if (r) this.startRace(r); };
    $('brDone').onclick = () => { this.game.ui.hide(); this.game.mode = 'act'; };
  }
  // ---------------------------------------------------------------- the marina menu
  offers(car) {
    for (const M of this.marinas) if (Math.hypot(car.pos.x - M.park.x, car.pos.z - M.park.z) < M.park.r) return { kind: 'Marina', name: 'Kjør båt', info: 'båter og båtløp', go: () => this.menu(M) };
    return null;
  }
  menu(M = this.marina || this.marinas[0]) {
    const g = this.game; if (!M) return;
    this.menuM = M; g.mode = 'pause'; g.ui.show('boatMenu'); this.fillMenu();
  }
  fillMenu() {
    const g = this.game, M = this.menuM, P = g.prof;
    $('bmWhere').textContent = M.m.name; $('bmNuts').textContent = fmtN(P.nuts);
    $('bmStars').textContent = '★ ' + M.races.reduce((s, r) => s + (g.best[r.key] ? g.best[r.key].s : 0), 0) + ' / ' + M.races.length * 3;
    $('bmBoats').innerHTML = BOATS.map(s => { const own = this.owns(s.id), on = s.id === this.boatId;
      return `<button class="item${on ? ' on' : ''}" data-boat="${s.id}"><div><b>${s.name}</b><small>${s.kind}</small></div><span class="price${own ? ' own' : ''}">${own ? (on ? 'Valgt' : PRICE[s.id] ? 'Din' : 'Gratis') : fmtN(PRICE[s.id]) + ' ⚙'}</span></button>`; }).join('');
    $('bmBoats').querySelectorAll('[data-boat]').forEach(b => b.onclick = () => this.pickBoat(b.dataset.boat));
    $('bmRaces').innerHTML = M.races.map((r, i) => { const b = g.best[r.key], rb = boatById(r.boat);
      return `<button class="item" data-race="${i}"><div><b><span class="diff" style="background:${DIFFCOL[r.diff]}"></span>${r.name}${r.night ? ' ☾' : ''}</b><small>${r.desc} ${DIFF[r.diff]} · ${(r.len / 1000).toFixed(1).replace('.', ',')} km · for ${rb.name.toLowerCase()}</small></div><span class="price">${b ? '★'.repeat(b.s) + ' ' + fmtTime(b.t) : r.G.length + ' porter'}</span></button>`; }).join('');
    $('bmRaces').querySelectorAll('[data-race]').forEach(b => b.onclick = () => this.begin({ race: M.races[+b.dataset.race] }));
    $('bmGo').textContent = this.active ? (this.race ? 'Avbryt løpet og kjør fritt' : 'Fortsett å kjøre') : 'Fri kjøring';
    $('bmGo').onclick = () => this.begin({});
    $('bmBack').textContent = this.active ? 'Gå i land (tilbake til bilen)' : 'Tilbake til bilen';
    $('bmBack').onclick = () => { g.ui.hide(); if (this.active) this.stop(); else g.mode = 'drive'; };
  }
  pickBoat(id) {
    const g = this.game, s = boatById(id);
    if (!this.owns(id)) {
      if (g.prof.nuts < PRICE[id]) { g.ui.toast('Du trenger ' + fmtN(PRICE[id]) + ' muttere', true); return; }
      g.prof.nuts -= PRICE[id]; g.prof.boats.push(id); g.saveProf(); g.ui.toast(s.name + ' er din!');
    }
    this.boatId = id; g.store.set('boat', id); this.fillMenu();
  }
  begin(o) { const g = this.game; g.ui.hide(); if (this.active) { g.mode = 'act'; if (this.boat.spec.id !== this.boatId) { this.setBoat(this.boatId); if (!o.race) this.toBerth(); } if (o.race) this.startRace(o.race); else { this.stopRace(); } } else this.start(Object.assign({ boat: this.boatId }, o)); }

  // ---------------------------------------------------------------- start and stop
  start(opts = {}) {
    const g = this.game, M = this.marina = opts.marina || this.marinas[0]; if (!M) return;
    // ?act=boat&boat=racer&race=skagerrak (for testing) on the first start
    const P = this.urlDone ? new URLSearchParams() : g.params; this.urlDone = true;
    if (!opts.boat && P.get('boat') && boatById(P.get('boat')).id === P.get('boat')) opts.boat = P.get('boat');
    if (!opts.race && P.get('race')) opts.race = M.races.find(r => r.id === P.get('race'));
    const id = opts.boat && (this.owns(opts.boat) || P.get('boat') === opts.boat) ? opts.boat : this.boatId;
    g.startActivity(this);
    // the car waits on the quay
    const car = g.car;
    if (Math.hypot(car.pos.x - M.park.x, car.pos.z - M.park.z) > 60) { const I = car.input; I.brake = 0; car.place(g.world, M.park.x, M.park.z, M.park.h); for (let i = 0; i < 300; i++) car.step(1 / 400, g.world); car.vel.set(0, 0, 0); I.brake = 1; }
    car.engineOff = true;
    this.camSave = g.cam.mode; g.cam.mode = 0;
    this.pauseSave = { reset: $('pReset').textContent, abort: $('pAbort').onclick };
    this.setBoat(id);
    if (opts.race) this.startRace(opts.race); else this.toBerth();
    this.hintT = 14; $('bHint').classList.remove('off');
    g.ui.toast(opts.race ? opts.race.name : this.boat.spec.name + ': kjør ut fra brygga!');
  }
  stop() {
    const g = this.game; if (!this.active) return;
    this.stopRace(); g.ui.countdown(null);
    if (this.sound) { this.sound.stop(); this.sound = null; }
    if (this.vis) { this.vis.dispose(); this.vis = null; }
    this.wake && this.wake.clear(); this.spray && this.spray.clear();
    g.car.engineOff = false; g.cam.mode = this.camSave || 0;
    if (this.pauseSave) { $('pReset').textContent = this.pauseSave.reset; $('pAbort').onclick = this.pauseSave.abort; $('pAbort').hidden = true; }
    $('offer').hidden = true; this.pose = null;
    g.endActivity();
  }
  setBoat(id) {
    const g = this.game, spec = boatById(id);
    this.boatId = spec.id;
    const b = this.boat = new Boat(spec, { waveScale: g.water.uni.uWave.value, autoTrim: g.settings.mode !== 'ekte' });
    if (this.vis) this.vis.dispose();
    this.vis = new BoatVisual(g.gfx, spec);
    if (!this.wake) { this.wake = new Wake(g.gfx, g.water); this.spray = new Spray(g.gfx, g.water); this.arrow = new Arrow(g.gfx); }
    if (this.sound) { this.sound.stop(); this.sound = null; }
    this.pose = { pos: b.pos, fw: b.fw, kmh: 0 }; this.where = spec.name;
    this.lever = 0; this.acc = 0;
  }
  place(x, z, h) {
    const g = this.game, b = this.boat; b.t = U.uTime.value; b.waveScale = g.water.uni.uWave.value;
    b.place(g.world, x, z, h); b.input.throttle = 0; b.input.steer = 0; this.lever = 0;
    for (let i = 0; i < 120; i++) b.step(DT, g.world);
    b.vel.set(0, 0, 0); b.w.set(0, 0, 0); b.t = U.uTime.value;
    this.wake.clear(); this.spray.clear(); this.snap = true; this.flipT = 0; this.stuckT = 0;
  }
  toBerth() { const B = this.marina.berth; this.place(B.x, B.z, B.h); this.leftPier = false; }
  reset() {
    const a = this.race;
    if (a && a.count <= 0) {
      const G = a.r.G, last = a.gi > 0 ? G[a.gi - 1] : null, nx = G[a.gi], from = last || a.r.start;
      this.place(from.x, from.z, Math.atan2(nx.x - from.x, nx.z - from.z));
      a.pen += 5; a.prevAlong = null; this.game.ui.toast('Satt tilbake ved forrige port · +5 s', true);
    } else if (!a) { this.toBerth(); this.game.ui.toast('Tilbake ved brygga'); }
  }
  // ---------------------------------------------------------------- races
  startRace(r) {
    const g = this.game, isl = this.marina.isl;
    this.stopRace();
    if (this.boat.spec.id !== this.boatId) this.setBoat(this.boatId);
    const a = this.race = { r, gi: 0, t: 0, splits: [], best: g.best[r.key], count: 3.5, pen: 0, nuts: 0, prevAlong: null, missT: 0, bad: false };
    // the buoys: one pair per place (a round's finish is its start gate)
    const map = new Map(); this.pairs = []; a.pairOf = r.G.map((G, i) => {
      const key = Math.round(G.x) + ',' + Math.round(G.z); let p = map.get(key);
      if (!p) { p = new BuoyPair(g.gfx, G.x, G.z, G.h, G.w, i === 0 || i === r.G.length - 1 ? 'start' : 'mark'); map.set(key, p); this.pairs.push(p); for (const b of p.buoys) isl.extraColliders.push(b.col); }
      return p;
    });
    this.place(r.start.x, r.start.z, r.start.h);
    this.highlight();
    if (r.night) g.gfx.setTime(22.6, 58.47, 300);
    $('bRace').hidden = false; $('bRName').textContent = r.name; $('bRBest').textContent = a.best ? fmtTime(a.best.t) : '–'; $('bRSplit').textContent = '';
    $('pAbort').hidden = false; $('pAbort').onclick = () => { this.stopRace(); g.ui.toast('Løpet er avbrutt'); g.resume(); };
  }
  stopRace() {
    const g = this.game, a = this.race; if (!this.pairs) return;
    const isl = this.marina && this.marina.isl;
    for (const p of this.pairs) { for (const b of p.buoys) { const i = isl ? isl.extraColliders.indexOf(b.col) : -1; if (i >= 0) isl.extraColliders.splice(i, 1); } p.dispose(); }
    this.pairs = [];
    if (a) { if (a.r.night) g.setClock(); this.race = null; }
    g.ui.countdown(null); $('bRace').hidden = true; $('pAbort').hidden = true; this.arrow && this.arrow.hide();
  }
  highlight() {
    const a = this.race; if (!a) return; const cur = a.pairOf[a.gi];
    for (const p of this.pairs) p.set(p === cur ? 'next' : a.pairOf.some((q, j) => j >= a.gi && q === p) ? 'wait' : 'done');
  }
  updateRace(dt) {
    const g = this.game, a = this.race, b = this.boat, r = a.r;
    if (a.count > 0) {
      a.count -= dt; b.input.throttle = 0;
      g.ui.countdown(a.count > 0.5 ? Math.ceil(a.count - 0.5) : 'KJØR!');
      if (a.count <= 0) g.ui.countdown(null);
      return;
    }
    a.t += dt; a.missT -= dt;
    const G = r.G[a.gi], dx = b.pos.x - G.x, dz = b.pos.z - G.z, along = dx * Math.sin(G.h) + dz * Math.cos(G.h), lat = dx * Math.cos(G.h) - dz * Math.sin(G.h);
    // through the gate: the boat crosses the line between the buoys (either way: going back for a missed gate counts)
    const cross = gateCrossed(G, a.prevAlong, along, lat);
    if (cross) {
      if (cross === 'in') {
        a.splits.push(a.t + a.pen); a.gi++; a.nuts += 5; a.bad = false;
        const prev = a.best && a.best.splits && a.best.splits[a.gi - 1];
        this.split(prev != null ? a.t + a.pen - prev : null);
        g.snd.event && g.snd.event('click');
        if (a.gi >= r.G.length) return this.finish();
        this.highlight(); a.prevAlong = null; return;
      } else if (Math.abs(lat) < 400 && a.missT <= 0) { a.bad = true; a.missT = 3; g.ui.toast('Du bommet på porten! Snu og ta den', true); }
    }
    a.prevAlong = along;
    // through a later gate first: tell the driver
    const nx = r.G[a.gi + 1];
    if (nx && a.missT <= 0 && a.pairOf[a.gi + 1] !== a.pairOf[0]) { const d = Math.hypot(b.pos.x - nx.x, b.pos.z - nx.z); if (d < nx.w / 2) { a.bad = true; a.missT = 4; g.ui.toast('Du hoppet over port ' + (a.gi + 1) + ': snu og ta den først', true); } }
    if (Math.hypot(dx, dz) > 3000) { g.ui.toast('For langt fra løypa: løpet er avbrutt', true); this.stopRace(); }
  }
  split(d) { const el = $('bRSplit'); if (d == null) { el.textContent = ''; return; } el.textContent = (d < 0 ? '−' : '+') + fmtTime(Math.abs(d)).replace(/^0:/, ''); el.className = 'split ' + (d < 0 ? 'ahead' : 'behind'); }
  finish() {
    const g = this.game, a = this.race, r = a.r, t = a.t + a.pen;
    const stars = t <= r.par[0] ? 3 : t <= r.par[1] ? 2 : 1, old = g.best[r.key], rec = !old || t < old.t, first = !old;
    const nuts = a.nuts + 40 + (first ? 60 : 0) + (rec && !first ? 25 : 0) + stars * 10;
    if (rec) g.best[r.key] = { t, s: Math.max(stars, old ? old.s : 0), splits: a.splits.map(x => x) };
    else if (old && stars > old.s) old.s = stars;
    g.store.set('best', g.best); g.prof.nuts += nuts; g.saveProf();
    this.lastRace = r; this.stopRace();
    $('brName').textContent = r.name; $('brStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('brList').innerHTML = [['Tid', fmtTime(t)], a.pen ? ['Straff', '+' + a.pen + ' s'] : null, old ? ['Beste før', fmtTime(old.t)] : null, ['Tre stjerner', fmtTime(r.par[0])], ['To stjerner', fmtTime(r.par[1])],
      ['Båt', this.boat.spec.name], ['Muttere', '+' + nuts + ' ⚙'], rec ? ['', first ? 'Første gang!' : 'Ny rekord!'] : null].filter(Boolean).map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
    g.mode = 'pause'; g.ui.show('boatResult');
  }
  // ---------------------------------------------------------------- every frame
  press(k) {
    const g = this.game;
    switch (k) {
      case 'cam': this.camMode = (this.camMode + 1) % CAMS.length; this.snap = true; g.ui.toast(CAMS[this.camMode]); return true;
      case 'reset': this.reset(); return true;
      case 'enter': if (this.atPontoon()) { this.menu(this.marina); } else if (!this.race) g.ui.toast('Legg til ved brygga for å gå i land'); return true;
      case 'lights': this.lightsOn = !(this.lightsOn ?? U.uNight.value > 0.45); return true;
      case 'horn': g.snd.event && g.snd.event('horn', { on: true }); return true;
      case 'map': g.mode = 'pause'; g.ui.show('map'); return true;
      case 'up': case 'down': if (g.settings.mode !== 'ekte') g.ui.toast('Trimmen går av seg selv i Lett-modus'); return true;
      case 'pause': $('pReset').textContent = this.race ? 'Tilbake til forrige port (+5 s)' : 'Tilbake til brygga'; $('pAbort').hidden = !this.race; return false;
    }
    return false;
  }
  atPontoon() { const b = this.boat; return this.marina.alongside(b.pos.x, b.pos.z) && b.state.knots < 4; }
  update(dt, inp) {
    const g = this.game, b = this.boat, st = b.state, T = this.touch, real = g.settings.mode === 'ekte';
    // the lever follows the keys at a hand's pace (a trigger or a pedal moves it directly)
    const want = clamp((inp.gas || T.gas || 0) - (inp.brake || T.back || 0), -1, 1);
    if (inp.analog) this.lever = want; else this.lever += clamp(want - this.lever, -dt * 2.4, dt * 2.4);
    b.input.throttle = this.lever;
    const ts = (T.left ? 1 : 0) - (T.right ? 1 : 0);
    b.input.steer = ts ? clamp((this.tSteer = (this.tSteer || 0) + clamp(ts - (this.tSteer || 0), -dt * 3, dt * 3)), -1, 1) : inp.steer;
    if (!ts) this.tSteer = 0;
    b.autoTrim = !real; if (real !== this.realShown) { this.realShown = real; $('bTrimPad').hidden = !real; }
    if (real) { const d = (inp.down.has('e') || T.trimUp ? 1 : 0) - (inp.down.has('q') || T.trimDown ? 1 : 0); b.input.trim = clamp(b.input.trim + d * dt * 0.7, -1, 1); }
    if (this.race) this.updateRace(dt);
    // physics at 240 Hz on the waves the sea shader draws
    b.waveScale = g.water.uni.uWave.value; b.t = U.uTime.value - this.acc;
    this.acc += dt; let n = 0;
    while (this.acc >= DT && n < MAXSTEP) { b.step(DT, g.world); this.acc -= DT; n++; }
    if (n >= MAXSTEP) this.acc = 0;
    if (b.blewUp) { b.blewUp = false; this.toBerth(); g.ui.toast('Båten ble satt tilbake ved brygga', true); }
    if (b.up.y < 0.2) { this.flipT += dt; if (this.flipT > (real ? 5 : 2)) this.reset(); } else this.flipT = 0;
    if (st.grounded && st.knots < 0.8 && Math.abs(this.lever) > 0.3) { this.stuckT += dt; if (this.stuckT > 4) { this.stuckT = -20; g.ui.toast('Du står på grunn! R setter deg tilbake', true); } } else if (this.stuckT > 0) this.stuckT = 0;
    // things the hull hit: buoys float off, hard knocks shake the camera
    const h = b.lastHit;
    if (h && h !== this.hit) {
      this.hit = h;
      if (h.c.kind === 'buoy') { h.c.x -= h.nx * h.push; h.c.z -= h.nz * h.push; if (h.j > 200) g.snd.event && g.snd.event('splash', { size: 0.25 }); }
      else if (h.j > b.m * 0.6) { g.snd.event && g.snd.event('crash', { impulse: h.j * 2 }); this.shake = Math.min(0.3, h.j / b.m * 0.05); }
    }
    // on screen
    const t = U.uTime.value + dt, ws = b.waveScale;
    this.vis.sync(b, this.lightsOn ?? undefined);
    this.wake.update(dt, b); this.spray.update(dt, b, t, ws);
    this.camera(dt, inp);
    this.pose.kmh = st.knots * 1.852;
    this.where = b.spec.name + (st.depth < b.draft + 1.2 ? ' · grunt vann!' : st.onPlane ? ' · planer' : st.knots > 2 ? ' · ' + Math.round(st.knots) + ' knop' : '');
    this.hud(dt);
    // the pontoon: step ashore, or take another boat or a race
    if (!this.marina.alongside(b.pos.x, b.pos.z)) this.leftPier = true;
    const off = $('offer'), near = !this.race && this.leftPier && this.atPontoon();
    if (near !== this.nearShown) { this.nearShown = near; off.hidden = !near; if (near) { $('oKind').textContent = 'Marina'; $('oName').textContent = this.marina.m.name; $('oInfo').textContent = 'båter, båtløp og gå i land'; } }
    // sound
    const snd = g.snd;
    if (this.sound && this.sound.spec !== b.spec) { this.sound.stop(); this.sound = null; }
    if (snd.ready && snd.ac && !this.sound) try { this.sound = new BoatSound(snd, b.spec); } catch (e) { console.warn('båtlyd', e); this.sound = { spec: b.spec, update() { }, stop() { } }; }
    if (this.sound) this.sound.update(dt, b, ws, g.env || {});
    if (g.env) { const E = g.env; E.t = 1; this.envT = (this.envT || 0) - dt; if (this.envT <= 0) { this.envT = 0.5; this.soundEnv(E); } }
  }
  // what the ambience hears round the boat (the game would listen at the parked car): mostly sea
  soundEnv(E) {
    const p = this.boat.pos, w = this.game.world; let sea = 0, n = 0, fo = 0;
    for (let k = 0; k < 8; k++) for (const r of [40, 120]) { const a = k / 8 * Math.PI * 2, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r, isl = w.islandAt(x, z); n++; if (w.terrain(x, z) < 0) sea++; else if (isl) { const c = isl.coverAt(x, z); if (c >= 3 && c <= 5) fo++; } }
    E.sea = sea / n; E.forest = fo / n * 0.6; E.town = 0; E.inside = 0;
  }
  frame(dt) {
    const g = this.game, cam = g.gfx.camera, t = U.uTime.value, ws = g.water.uni.uWave.value;
    for (const M of this.marinas) M.update(dt, t, ws, cam.position);
    if (this.pairs.length) { for (const p of this.pairs) p.update(dt, t, ws); buoyLamps(this.pairs, t); }
    if (this.active && this.race && this.race.count <= 0 && this.boat) {
      const a = this.race, G = a.r.G[a.gi], b = this.boat, d = Math.hypot(G.x - b.pos.x, G.z - b.pos.z), L = b.spec.L;
      if (d > 25 || a.bad) this.arrow.set(b.pos.x + b.fw.x * L * 0.35, b.pos.y + 2.6 + L * 0.15, b.pos.z + b.fw.z * L * 0.35, G.x, G.z, a.bad, t); else this.arrow.hide();
    } else if (this.arrow) this.arrow.hide();
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('bHint').classList.add('off'); }
  }
  // ---------------------------------------------------------------- camera
  camera(dt, inp) {
    const g = this.game, cam = g.gfx.camera, C = g.cam, b = this.boat, L = b.spec.L, kn = b.state.knots, t = U.uTime.value, ws = b.waveScale;
    if (inp.lookX || inp.lookY) { C.yaw = -inp.lookX * 2.2; C.pitch = Math.max(-0.3, inp.lookY * 0.8); C.dragT = 0.3; }
    C.dragT -= dt; if (C.dragT <= 0) { C.yaw *= Math.exp(-dt * 2.5); C.pitch *= Math.exp(-dt * 2.5); }
    const fh = Math.atan2(b.fw.x, b.fw.z);
    if (this.snap) this.camH = fh; else this.camH += wrap(fh - this.camH) * (1 - Math.exp(-dt * (this.camMode === 2 ? 1.4 : 3.2)));
    if (this.camMode === 1) {
      // at the helm: the eye in the model, moving with the boat
      const r = this.vis.root; _v.copy(this.vis.eye).applyQuaternion(r.quaternion).add(r.position);
      cam.position.copy(_v); cam.quaternion.copy(r.quaternion).multiply(_q.setFromEuler(_e.set(-C.pitch * 0.6 - 0.07, C.yaw + Math.PI, 0, 'YXZ')));
      cam.fov = 66 / Math.sqrt(C.zoom); cam.near = 0.05;
    } else {
      // behind and above, swinging round after the boat; the far view hangs back and higher
      const far = this.camMode === 2, dist = (far ? 24 + L * 1.2 : 3.2 + L * 1.05 + Math.min(4, kn * 0.07)) * C.zoom, hh = (far ? 8 + L * 0.3 : 1.5 + L * 0.2 + Math.min(1.2, kn * 0.025)) * Math.sqrt(C.zoom);
      const ang = this.camH + C.yaw, want = _v.set(b.pos.x - Math.sin(ang) * dist, b.pos.y + hh + C.pitch * dist * 0.5, b.pos.z - Math.cos(ang) * dist);
      const floor = Math.max(waveHeight(want.x, want.z, t, ws) + 0.8, g.world.height(want.x, want.z) + 1.2); if (want.y < floor) want.y = floor;
      if (this.snap) this.camPos.copy(want);
      else { const k = 1 - Math.exp(-dt * (far ? 2.2 : 6)), ky = 1 - Math.exp(-dt * (far ? 1.5 : 2.6)); const y = this.camPos.y + (want.y - this.camPos.y) * ky; this.camPos.lerp(want, k); this.camPos.y = Math.max(y, floor); }
      cam.position.copy(this.camPos); cam.up.set(0, 1, 0);
      const la = far ? 4 : 2 + Math.min(10, kn * 0.1);
      cam.lookAt(b.pos.x + Math.sin(fh) * la, b.pos.y + 0.7 + L * 0.06, b.pos.z + Math.cos(fh) * la);
      cam.fov = (far ? 50 : 55 + Math.min(12, kn * 0.18)); cam.near = 0.1;
    }
    if (this.shake > 0.002) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-dt * 8); }
    cam.updateProjectionMatrix(); this.snap = false;
  }
  // ---------------------------------------------------------------- HUD
  hud(dt) {
    const g = this.game, b = this.boat, st = b.state, a = this.race;
    this.drawInst();
    this.hudT = (this.hudT || 0) - dt; if (this.hudT > 0) return; this.hudT = 0.1;
    if (a) { $('bRTime').textContent = fmtTime(a.t + a.pen); $('bRGate').textContent = Math.min(a.gi + 1, a.r.G.length) + '/' + a.r.G.length; }
    const on = (id, v, cls = 'on') => { $(id).className = v ? cls : ''; };
    on('bLAuto', b.autoTrim); on('bLGrunt', st.depth < b.draft + 1.2, 'warn'); on('bLLuft', st.propOut, 'warn'); on('bLLys', this.lightsOn ?? U.uNight.value > 0.45);
    this.drawMini();
  }
  drawInst() {
    const x = this.ictx, S = 220, cx = S / 2, cy = S / 2, R = 96, b = this.boat, st = b.state, s = b.spec, e = s.engine;
    x.clearRect(0, 0, S, S);
    const top = DIAL[s.id] || 60, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, A = v => a0 + (a1 - a0) * Math.min(1, v / top);
    x.fillStyle = 'rgba(14,13,10,.78)'; x.beginPath(); x.arc(cx, cy, R + 10, 0, 7); x.fill();
    // rev counter: the inner arc, red above the rated rpm
    const lim = e.limit || e.rpm * 1.1, rmax = Math.ceil(lim / 1000) * 1000, ra = r => a0 + (a1 - a0) * Math.min(1, r / rmax);
    x.lineWidth = 8; x.strokeStyle = 'rgba(242,232,208,.12)'; x.beginPath(); x.arc(cx, cy, R - 22, a0, a1); x.stroke();
    x.strokeStyle = 'rgba(217,67,47,.55)'; x.beginPath(); x.arc(cx, cy, R - 22, ra(e.rpm), a1); x.stroke();
    x.strokeStyle = st.rpm > e.rpm * 1.02 ? '#d9432f' : '#e5a92b'; x.beginPath(); x.arc(cx, cy, R - 22, a0, ra(st.rpm)); x.stroke();
    // the knots scale
    x.strokeStyle = 'rgba(242,232,208,.8)'; x.fillStyle = 'rgba(242,232,208,.85)'; x.font = '600 13px "Barlow Condensed"'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const step = top > 40 ? 10 : 5;
    for (let v = 0; v <= top + 0.1; v += step / 2) { const a = A(v), big = v % step === 0; x.lineWidth = big ? 2.2 : 1; x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - (big ? 9 : 5)), cy + Math.sin(a) * (R - (big ? 9 : 5))); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke(); if (big) x.fillText(v, cx + Math.cos(a) * (R - 36), cy + Math.sin(a) * (R - 36)); }
    const kn = st.knots, a = A(kn);
    x.strokeStyle = '#ff5a2a'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); x.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); x.stroke();
    x.fillStyle = '#2a261e'; x.beginPath(); x.arc(cx, cy, 10, 0, 7); x.fill();
    x.fillStyle = '#f2e8d0'; x.font = '700 34px "Barlow Condensed"'; x.fillText(Math.round(kn), cx, cy + 42); x.font = '500 13px "Barlow Condensed"'; x.fillStyle = 'rgba(242,232,208,.6)'; x.fillText('knop · ' + Math.round(st.rpm / 100) * 100 + ' o/min', cx, cy + 62);
    x.font = '700 24px "Barlow Condensed"'; x.fillStyle = st.gear < 0 ? '#d9432f' : '#e5a92b'; x.fillText(st.gear > 0 ? 'F' : st.gear < 0 ? 'R' : 'N', cx, cy - 36);
    // trim: a bar from fully in to fully out
    const [t0, t1] = [(s.drive.trim || [-6, 10])[0], (s.drive.trim || [-6, 10])[1]], tv = st.trimA * 180 / Math.PI, u = (tv - t0) / (t1 - t0), bw = 70, bx = cx - bw / 2, by = cy + 78;
    x.fillStyle = 'rgba(242,232,208,.14)'; x.fillRect(bx, by, bw, 5); x.fillStyle = '#e5a92b'; x.fillRect(bx + bw * clamp(u, 0, 1) - 3, by - 3, 6, 11);
    x.fillStyle = 'rgba(242,232,208,.55)'; x.font = '600 11px "Barlow Condensed"'; x.fillText('TRIM ' + (tv >= 0 ? '+' : '') + tv.toFixed(0) + '°', cx, by + 16);
  }
  // the race on the minimap (drawn over the game's map, with the same scale and rotation)
  drawMini() {
    const x = this.mctx, S = 220; x.clearRect(0, 0, S, S);
    const b = this.boat, a = this.race, kmh = this.pose.kmh, R = 260 + Math.min(500, kmh * 4), k = S / 2 / R, h = Math.atan2(b.fw.x, b.fw.z), cs = Math.cos(h), sn = Math.sin(h);
    const M = (wx, wz) => { const dx = wx - b.pos.x, dz = wz - b.pos.z; return [S / 2 - (dx * cs - dz * sn) * k, S / 2 - (dx * sn + dz * cs) * k]; };
    x.save(); x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, 7); x.clip();
    if (a) {
      const G = a.r.G; x.strokeStyle = 'rgba(229,169,43,.85)'; x.lineWidth = 2.5; x.setLineDash([6, 4]); x.beginPath();
      const [sx, sz] = M(b.pos.x, b.pos.z); x.moveTo(sx, sz); for (let i = a.gi; i < G.length; i++) { const [X, Z] = M(G[i].x, G[i].z); x.lineTo(X, Z); } x.stroke(); x.setLineDash([]);
      for (let i = G.length - 1; i >= a.gi; i--) { const [X, Z] = M(G[i].x, G[i].z); x.fillStyle = i === a.gi ? '#ffcf4a' : 'rgba(242,232,208,.7)'; x.beginPath(); x.arc(X, Z, i === a.gi ? 6 : 3.5, 0, 7); x.fill(); }
    }
    const B = this.marina.berth, [X, Z] = M(B.x, B.z); x.fillStyle = '#4aa3df'; x.fillRect(X - 5, Z - 5, 10, 10); x.fillStyle = '#fff'; x.font = '700 12px "Barlow Condensed"'; x.textAlign = 'center'; x.fillText('M', X, Z + 1);
    x.restore();
  }
}
