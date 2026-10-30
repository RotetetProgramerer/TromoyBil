// Flying from Trinnvik lufthavn: park the car at the flying club by the apron, take the trainer (free) or the aerobatic two-seater
// (1500 ⚙) and fly over the archipelago, freely or through the rings of a flight (sim/data/flights.js) that ends with a landing.
// The physics is sim/physics/plane.js at 240 Hz (Lett is its assist), the models sim/render/planevis.js, the airport's extras
// sim/render/airfield.js, the sound sim/audio/planesound.js.
// Keys: ↓/S stick back (nose up), ↑/W forward, ←/→ or A/D roll, Q/E (or Z/X) rudder, Shift/Ctrl, PgUp/PgDn or +/− throttle (a lever:
// it stays where it is set), F flaps down a notch, V up, B or space brakes, T/G trim (Ekte), L landing light, C camera, R back to
// the threshold (or the last ring), Enter stopped on the apron: the flying club. Gamepad: left stick pitch and roll, right stick
// rudder (x) and throttle (y), the triggers throttle up and down, A brakes, RB/LB flaps. Touch: a stick, a throttle lever, buttons.
import * as THREE from 'three';
import { Activity } from './activity.js';
import { Plane } from '../physics/plane.js';
import { V3 } from '../physics/math.js';
import { PLANES, planeById } from '../data/planes.js';
import { FLIGHTS, PRICE, airportOf, prepFlight, ringFrame, ringCrossed, landed, onApron, onRunway, windVel, crashText, planeWorld } from '../data/flights.js';
import { U } from '../render/gfx.js';
import { PlaneVisual, Rings, LOOK } from '../render/planevis.js';
import { Airfield } from '../render/airfield.js';
import { fmtTime } from '../courses.js';
import { PlaneSound } from '../audio/planesound.js';

const DT = 1 / 240, MAXSTEP = 36, D2R = Math.PI / 180, KT = 0.514444;
const CAMS = ['Følgekamera', 'Cockpit', 'Vingekamera', 'Tårnkamera'], DIFFCOL = ['#8bbb4a', '#8bbb4a', '#f2c230', '#d9432f'], DIFF = ['', 'Lett', 'Middels', 'Vanskelig'];
const CRUISE = { make: 50, falk: 68 };          // m/s when put back in the air at a ring
const $ = id => document.getElementById(id), fmtN = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), fmtD = (v, d = 1) => v.toFixed(d).replace('.', ',');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();

const CSS = `
#fHud{position:absolute;inset:0;pointer-events:none}
body:not([data-act=plane]) #fHud{display:none}
#fHud .fdash{position:absolute;right:12px;bottom:10px;display:flex;flex-direction:column;align-items:flex-end}
#fInst{width:336px;height:184px}
#fHud .lamps{margin:-2px 8px 0 0}
#fHint{position:absolute;left:16px;bottom:10px;max-width:calc(100% - 380px);font-size:15px;line-height:1.35;color:var(--ink);text-shadow:0 1px 3px #000;transition:opacity 1.2s}
#fHint.off,body:has(#offer:not([hidden])) #fHint{opacity:0}
#fMark{position:absolute;left:0;top:0;width:0;height:0;display:none}
#fMark i{position:absolute;left:-13px;top:-13px;width:26px;height:26px;border:3px solid #ffb21e;border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,.5)}
#fMark b{position:absolute;left:-40px;top:16px;width:80px;text-align:center;font-size:15px;color:#ffcf6a;text-shadow:0 1px 3px #000}
#fMark.edge i{border-radius:3px;border-width:0;width:0;height:0;left:-11px;top:-11px;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:20px solid #ffb21e;box-shadow:none}
#fMark.bad i{border-color:#e0402a}#fMark.edge.bad i{border-bottom-color:#e0402a;border-left-color:transparent;border-right-color:transparent}
#fCrash{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);font-family:'Saira Stencil One',sans-serif;font-size:52px;color:#ff6a4a;text-shadow:0 3px 16px rgba(0,0,0,.7);text-align:center;white-space:nowrap}
#fCrash small{display:block;font-family:'Barlow Condensed',sans-serif;font-size:22px;color:var(--ink)}
#fTouch{display:none}
body.is-touch #fTouch{display:block}
body.is-touch #fHint{display:none}
body.is-touch #fHud .fdash{transform:scale(.72);transform-origin:bottom right}
#fStick{position:absolute;left:22px;bottom:22px;width:150px;height:150px;border-radius:50%;border:2px solid rgba(242,232,208,.35);background:rgba(20,18,14,.45);pointer-events:auto;touch-action:none}
#fStick i{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px;border-radius:50%;background:rgba(229,169,43,.6);border:2px solid rgba(242,232,208,.6)}
#fThr{position:absolute;right:262px;bottom:22px;width:58px;height:160px;border-radius:12px;border:2px solid rgba(242,232,208,.35);background:rgba(20,18,14,.45);pointer-events:auto;touch-action:none}
#fThr i{position:absolute;left:4px;right:4px;height:30px;border-radius:8px;background:rgba(229,169,43,.75);bottom:0}
#fThr b{position:absolute;top:-22px;left:0;right:0;text-align:center;font-size:14px}
#fTBtns{position:absolute;right:332px;bottom:22px;display:flex;flex-direction:column;gap:8px;pointer-events:auto}
#fTBtns .tb{width:60px;height:60px;font-size:14px}
@media (max-height:440px){#fStick{width:120px;height:120px}#fThr{height:120px}}
@media (max-width:900px){#fHint{font-size:13px;max-width:calc(100% - 290px)}#fInst{width:262px;height:144px}}
@media (max-width:700px){#fInst{width:220px;height:120px}#fHint{max-width:calc(100% - 250px)}}
#planeMenu .item .diff{vertical-align:1px}
`;
const HUD = `
<div class="course" id="fRace" hidden><div class="cname" id="fRName"></div><div class="crow"><span>Tid</span><b id="fRTime">0:00,0</b></div>
  <div class="crow"><span>Ring</span><b id="fRRing">0/0</b></div><div class="crow"><span>Beste</span><b id="fRBest">–</b></div><div class="split" id="fRSplit"></div></div>
<div id="fMark"><i></i><b></b></div>
<div id="fCrash" hidden></div>
<div class="fdash"><canvas id="fInst" width="420" height="230" aria-hidden="true"></canvas>
  <div class="lamps"><i id="fLStall">STALL</i><i id="fLBrake">BREMS</i><i id="fLFlap">KLAFF</i><i id="fLLys">LYS</i><i id="fLAuto">LETT</i></div></div>
<div id="fHint">↓ / S trekk (nesa opp) · ↑ / W press · ← → / A D krengning · Q / E sideror · Shift / Ctrl (eller + / −) gass · F / V klaffer ned / opp · B brems · T / G trim (Ekte) · L landingslys · C kamera · R tilbake · Enter på oppstillingsplassen: flyklubben</div>
<div id="fTouch">
  <div id="fStick" aria-label="Styrespak"><i></i></div>
  <div id="fThr" aria-label="Gasshåndtak"><b>GASS</b><i></i></div>
  <div id="fTBtns"><button class="tb sm" data-fb="flapDn" aria-label="Klaffer ned">KL+</button><button class="tb sm" data-fb="flapUp" aria-label="Klaffer opp">KL−</button><button class="tb sm" data-fb="brake" aria-label="Brems">BR</button></div>
</div>`;
const MENU = `
<header class="brand"><p class="eyebrow" id="pmWhere">Trinnvik lufthavn</p><h1>Fly&shy;klubben</h1>
  <p class="lede">Fly fritt over skjærgården, eller fly en tur gjennom ringene og land på rullebanen. Skoleflyet er gratis å låne.</p></header>
<div class="panel">
  <div class="wallet"><span>⚙ <b id="pmNuts">0</b> muttere</span><span id="pmStars"></span></div>
  <h2>Fly</h2><div class="list" id="pmPlanes"></div>
  <h2>Flyginger</h2><div class="list" id="pmFlights"></div>
  <button class="go" id="pmGo">Fri flyging</button>
  <button class="ghost" id="pmBack">Tilbake til bilen</button>
</div>`;
const RESULT = `
<header class="brand"><p class="eyebrow">Flyging fullført</p><h1 id="prName"></h1><p class="stars" id="prStars"></p></header>
<div class="panel"><ul class="rlist" id="prList"></ul><button class="go" id="prAgain">Fly igjen</button><button class="ghost" id="prDone">Fly videre</button></div>`;

export default class PlaneActivity extends Activity {
  static id = 'plane';
  async init() {
    const g = this.game;
    g.prof.planes = g.prof.planes || ['make'];
    this.planeId = g.store.get('plane', 'make'); if (!this.owns(this.planeId)) this.planeId = 'make';
    this.A = airportOf(g.world); if (!this.A) return;
    this.PW = planeWorld(g.world);
    this.field = new Airfield(g.gfx, g.world, this.A);
    this.flights = FLIGHTS.map(f => prepFlight(f, this.A));
    this.dom();
    this.touch = { x: 0, y: 0, thr: null }; this.tb = {}; this.lever = 0; this.flaps = 0; this.acc = 0; this.camMode = 0; this.camPos = new THREE.Vector3(); this.camUp = new THREE.Vector3(0, 1, 0); this.snap = true;
    this.stk = { e: 0, a: 0, r: 0 }; this.pad = {}; this.flight = null; this.landing = null; this.gust = { x: 0, z: 0, t: 0 };
    const sp = g.world.islands.find(i => i.id === this.A.isl.id).feat.special, tw = sp && sp.airport && sp.airport.tower;
    // the tower camera: on the balcony outside the cab, on the runway's side
    this.tower = tw ? new THREE.Vector3(tw.x + this.A.ox + Math.sign(this.A.rwy.x0 - tw.x - this.A.ox) * 6, tw.y + tw.h + 1.2, tw.z + this.A.oz) : new THREE.Vector3(this.A.aim.x - 250, 24, this.A.aim.z);
  }
  owns(id) { return !PRICE[id] || (this.game.prof.planes || []).includes(id); }
  // ---------------------------------------------------------------- DOM
  dom() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hud = document.createElement('div'); hud.id = 'fHud'; hud.innerHTML = HUD; $('hud').appendChild(hud);
    for (const [id, html] of [['planeMenu', MENU], ['planeResult', RESULT]]) { const s = document.createElement('section'); s.className = 'overlay'; s.id = id; s.hidden = true; s.innerHTML = html; document.body.insertBefore(s, $('loading')); }
    this.ictx = $('fInst').getContext('2d');
    hud.querySelectorAll('[data-fb]').forEach(b => {
      const k = b.dataset.fb;
      const on = e => { e.preventDefault(); this.tb[k] = 1; b.classList.add('on'); if (k === 'flapDn') this.setFlaps(this.flaps + 1); if (k === 'flapUp') this.setFlaps(this.flaps - 1); try { b.setPointerCapture(e.pointerId); } catch (_) { } };
      const off = () => { this.tb[k] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    });
    // the touch stick: the knob follows the finger inside the ring and springs back to the middle
    const stick = $('fStick'), knob = stick.querySelector('i'), sk = e => { const r = stick.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1, l = Math.max(1, Math.hypot(x, y));
      this.touch.x = x / l; this.touch.y = y / l; knob.style.transform = `translate(${this.touch.x * r.width * 0.36}px,${this.touch.y * r.height * 0.36}px)`; };
    stick.addEventListener('pointerdown', e => { e.preventDefault(); try { stick.setPointerCapture(e.pointerId); } catch (_) { } this.touch.on = true; sk(e); });
    stick.addEventListener('pointermove', e => { if (this.touch.on) sk(e); });
    const sOff = () => { this.touch.on = false; this.touch.x = 0; this.touch.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', sOff); stick.addEventListener('pointercancel', sOff); stick.addEventListener('lostpointercapture', sOff);
    // the throttle lever: where the finger is, it stays when let go
    const thr = $('fThr'), tk = e => { const r = thr.getBoundingClientRect(); this.lever = clamp(1 - (e.clientY - r.top - 15) / (r.height - 30), 0, 1); };
    thr.addEventListener('pointerdown', e => { e.preventDefault(); try { thr.setPointerCapture(e.pointerId); } catch (_) { } this.touch.thrOn = true; tk(e); });
    thr.addEventListener('pointermove', e => { if (this.touch.thrOn) tk(e); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) thr.addEventListener(ev, () => { this.touch.thrOn = false; });
    $('prAgain').onclick = () => { const f = this.lastFlight; this.game.ui.hide(); this.game.mode = 'act'; if (f) this.startFlight(f); };
    $('prDone').onclick = () => { this.game.ui.hide(); this.game.mode = 'act'; };
  }
  // ---------------------------------------------------------------- the flying club's menu
  offers(car) {
    const P = this.A && this.A.park;
    if (P && Math.hypot(car.pos.x - P.x, car.pos.z - P.z) < P.r) return { kind: 'Flyplass', name: 'Fly', info: 'skolefly og sportsfly', go: () => this.menu() };
    return null;
  }
  menu() { const g = this.game; g.mode = 'pause'; g.ui.show('planeMenu'); this.fillMenu(); }
  fillMenu() {
    const g = this.game, P = g.prof;
    $('pmNuts').textContent = fmtN(P.nuts);
    $('pmStars').textContent = '★ ' + this.flights.reduce((s, f) => s + (g.best[f.key] ? g.best[f.key].s : 0), 0) + ' / ' + this.flights.length * 3;
    $('pmPlanes').innerHTML = PLANES.map(s => { const own = this.owns(s.id), on = s.id === this.planeId;
      return `<button class="item${on ? ' on' : ''}" data-plane="${s.id}"><div><b>${s.name} · ${LOOK[s.id] ? LOOK[s.id].reg : ''}</b><small>${s.kind}. ${s.desc}</small></div><span class="price${own ? ' own' : ''}">${own ? (on ? 'Valgt' : PRICE[s.id] ? 'Ditt' : 'Gratis') : fmtN(PRICE[s.id]) + ' ⚙'}</span></button>`; }).join('');
    $('pmPlanes').querySelectorAll('[data-plane]').forEach(b => b.onclick = () => this.pickPlane(b.dataset.plane));
    $('pmFlights').innerHTML = this.flights.map((f, i) => { const b = g.best[f.key];
      return `<button class="item" data-flight="${i}"><div><b><span class="diff" style="background:${DIFFCOL[f.diff]}"></span>${f.name}${f.night ? ' ☾' : ''}</b><small>${f.desc} ${DIFF[f.diff]} · ${fmtD(f.len / 1000)} km · ${f.G.length} ringer</small></div><span class="price">${b ? '★'.repeat(b.s) + ' ' + fmtTime(b.t) : ''}</span></button>`; }).join('');
    $('pmFlights').querySelectorAll('[data-flight]').forEach(b => b.onclick = () => this.begin({ flight: this.flights[+b.dataset.flight] }));
    $('pmGo').textContent = this.active ? (this.flight ? 'Avbryt flygingen og fly fritt' : 'Fortsett å fly') : 'Fri flyging';
    $('pmGo').onclick = () => this.begin({});
    $('pmBack').textContent = this.active ? 'Gå ut av flyet (tilbake til bilen)' : 'Tilbake til bilen';
    $('pmBack').onclick = () => { g.ui.hide(); if (this.active) this.stop(); else g.mode = 'drive'; };
  }
  pickPlane(id) {
    const g = this.game, s = planeById(id);
    if (!this.owns(id)) {
      if (g.prof.nuts < PRICE[id]) { g.ui.toast('Du trenger ' + fmtN(PRICE[id]) + ' muttere', true); return; }
      g.prof.nuts -= PRICE[id]; g.prof.planes.push(id); g.saveProf(); g.ui.toast(s.name + ' er ditt!');
    }
    this.planeId = id; g.store.set('plane', id); this.fillMenu();
  }
  begin(o) {
    const g = this.game; g.ui.hide();
    if (!this.active) return this.start(Object.assign({ plane: this.planeId }, o));
    g.mode = 'act';
    if (this.plane.spec.id !== this.planeId) this.setPlane(this.planeId);
    if (o.flight) this.startFlight(o.flight); else { if (this.flight) this.stopFlight(); this.toThreshold(); }
  }
  // ---------------------------------------------------------------- start and stop
  start(opts = {}) {
    const g = this.game, A = this.A; if (!A) return;
    // ?act=plane&plane=falk&flight=natt (for testing) on the first start
    const P = this.urlDone ? new URLSearchParams() : g.params; this.urlDone = true;
    if (!opts.plane && P.get('plane') && planeById(P.get('plane')).id === P.get('plane')) opts.plane = P.get('plane');
    if (!opts.flight && P.get('flight')) opts.flight = this.flights.find(f => f.id === P.get('flight'));
    const id = opts.plane && (this.owns(opts.plane) || P.get('plane') === opts.plane) ? opts.plane : this.planeId;
    g.startActivity(this);
    // the car waits in the car park
    const car = g.car, K = A.park;
    if (Math.hypot(car.pos.x - K.x, car.pos.z - K.z) > 60) { const I = car.input; I.brake = 0; car.place(g.world, K.x, K.z, K.h); for (let i = 0; i < 300; i++) car.step(1 / 400, g.world); car.vel.set(0, 0, 0); I.brake = 1; }
    car.engineOff = true;
    this.camSave = g.cam.mode; g.cam.mode = 0;
    this.pauseSave = { reset: $('pReset').textContent, abort: $('pAbort').onclick };
    this.setPlane(id);
    if (opts.flight) this.startFlight(opts.flight); else this.toThreshold();
    this.hintT = 16; $('fHint').classList.remove('off');
    g.ui.toast(opts.flight ? opts.flight.name : this.plane.spec.name + ': klar for avgang!');
  }
  stop() {
    const g = this.game; if (!this.active) return;
    this.stopFlight(); g.ui.countdown(null);
    if (this.sound) { this.sound.stop(); this.sound = null; }
    if (this.vis) { this.vis.dispose(); this.vis = null; }
    this.field.take(null);
    g.car.engineOff = false; g.cam.mode = this.camSave || 0;
    if (this.pauseSave) { $('pReset').textContent = this.pauseSave.reset; $('pAbort').onclick = this.pauseSave.abort; $('pAbort').hidden = true; }
    $('offer').hidden = true; $('fCrash').hidden = true; this.nearShown = false; this.pose = null;
    g.endActivity();
  }
  setPlane(id) {
    const g = this.game, spec = planeById(id);
    this.planeId = spec.id;
    const p = this.plane = new Plane(spec, { assist: g.settings.mode !== 'ekte' }), w = windVel();
    this.wind0 = new V3(w.x, w.y, w.z); p.wind = new V3(w.x, w.y, w.z);
    if (this.vis) this.vis.dispose();
    this.vis = new PlaneVisual(g.gfx, spec);
    if (this.sound) { this.sound.stop(); this.sound = null; }
    this.field.take(spec.id);
    this.pose = { pos: p.pos, fw: p.fw, kmh: 0, q: p.q }; this.where = spec.name;
  }
  // stand on the runway at the threshold, engine idling, facing down the runway
  toThreshold() {
    const A = this.A, p = this.plane;
    p.place(this.PW, A.start.x, A.start.z, A.start.h); p.omega = (p.spec.engine.idle || 650) / 9.549;
    Object.assign(p.input, { throttle: 0, elevator: 0, aileron: 0, rudder: 0, flaps: 0, trim: 0, brake: 1 });
    for (let i = 0; i < 120; i++) p.step(DT, this.PW);
    p.omega = (p.spec.engine.idle || 650) / 9.549;
    this.lever = 0; this.flaps = 0; this.acc = 0; this.snap = true; this.crashT = 0; $('fCrash').hidden = true; this.stk.e = this.stk.a = this.stk.r = 0;
  }
  // in the air at a ring, flying towards the next one
  atRing(i) {
    const a = this.flight, G = a.f.G, g = G[i], n = G[i + 1] || { x: this.A.aim.x, y: this.A.rwy.y, z: this.A.aim.z }, p = this.plane, h = Math.atan2(n.x - g.x, n.z - g.z);
    p.input.flaps = 0; this.flaps = 0; p.launch(g.x, g.y, g.z, h, CRUISE[p.spec.id] || 50, 2350);
    this.lever = 0.75; p.input.throttle = 0.75; this.acc = 0; this.snap = true; this.crashT = 0; $('fCrash').hidden = true;
  }
  reset() {
    const a = this.flight, g = this.game;
    if (a && a.count <= 0 && a.gi > 0) { this.atRing(a.gi - 1); a.pen += 10; a.prevAlong = null; g.ui.toast('Satt tilbake ved forrige ring · +10 s', true); }
    else if (a) this.startFlight(a.f);
    else { this.toThreshold(); g.ui.toast('Tilbake på rullebanen'); }
  }
  setFlaps(n) { this.flaps = clamp(n, 0, this.plane ? this.plane.spec.wing.flaps.deg.length - 1 : 3); if (this.plane) this.game.ui.toast('Klaffer ' + this.plane.spec.wing.flaps.deg[this.flaps] + '°'); }
  // ---------------------------------------------------------------- flights
  startFlight(f) {
    const g = this.game;
    this.stopFlight();
    if (this.plane.spec.id !== this.planeId) this.setPlane(this.planeId);
    const a = this.flight = { f, gi: 0, t: 0, splits: [], best: g.best[f.key], count: 3.5, pen: 0, nuts: 0, prevAlong: null, missT: 0, bad: false };
    this.rings = new Rings(g.gfx, f.G);
    this.toThreshold();
    if (f.night) g.gfx.setTime(22.6, 58.47, 300);
    $('fRace').hidden = false; $('fRName').textContent = f.name; $('fRBest').textContent = a.best ? fmtTime(a.best.t) : '–'; $('fRSplit').textContent = '';
    $('pAbort').hidden = false; $('pAbort').onclick = () => { this.stopFlight(); g.ui.toast('Flygingen er avbrutt'); g.resume(); };
  }
  stopFlight() {
    const g = this.game, a = this.flight;
    if (this.rings) { this.rings.dispose(); this.rings = null; }
    if (a) { if (a.f.night) g.setClock(); this.flight = null; }
    g.ui.countdown(null); $('fRace').hidden = true; $('pAbort').hidden = true; $('fMark').style.display = 'none';
  }
  updateFlight(dt) {
    const g = this.game, a = this.flight, p = this.plane, G = a.f.G;
    if (a.count > 0) {
      a.count -= dt; p.input.brake = 1;
      g.ui.countdown(a.count > 0.5 ? Math.ceil(a.count - 0.5) : 'FLY!');
      if (a.count <= 0) g.ui.countdown(null);
      return;
    }
    a.t += dt; a.missT -= dt;
    if (a.gi < G.length) {
      const R = G[a.gi], r = ringFrame(R, p.pos.x, p.pos.y, p.pos.z), c = p.crashed ? null : ringCrossed(R, a.prevAlong, r.along, r.off);
      if (c === 'in') {
        a.splits.push(a.t + a.pen); a.gi++; a.nuts += 5; a.bad = false; a.prevAlong = null;
        const prev = a.best && a.best.splits && a.best.splits[a.gi - 1]; this.split(prev != null ? a.t + a.pen - prev : null);
        g.snd.event && g.snd.event('click'); this.rings.set(a.gi);
        if (a.gi >= G.length) g.ui.toast('Alle ringene! Land på rullebanen og stopp');
        return;
      }
      if (c === 'out' && a.missT <= 0) { a.bad = true; a.missT = 3; g.ui.toast('Du bommet på ringen! Snu og fly gjennom den', true); }
      a.prevAlong = r.along;
      // through a later ring first: tell the pilot
      const N = G[a.gi + 1]; if (N && a.missT <= 0) { const q = ringFrame(N, p.pos.x, p.pos.y, p.pos.z); if (Math.abs(q.along) < 8 && q.off < N.r) { a.bad = true; a.missT = 4; g.ui.toast('Du hoppet over ring ' + (a.gi + 1) + ': snu og ta den først', true); } }
      if (Math.hypot(p.pos.x - R.x, p.pos.z - R.z) > 14000) { g.ui.toast('For langt fra ruta: flygingen er avbrutt', true); this.stopFlight(); }
    } else if (landed(this.A, p)) this.finish();
    else if (p.state.onGround && Math.hypot(p.vel.x, p.vel.z) < 3 && !onRunway(this.A, p.pos.x, p.pos.z) && a.missT <= 0) { a.missT = 5; g.ui.toast('Landingen teller bare på rullebanen', true); }
  }
  split(d) { const el = $('fRSplit'); if (d == null) { el.textContent = ''; return; } el.textContent = (d < 0 ? '−' : '+') + fmtTime(Math.abs(d)).replace(/^0:/, ''); el.className = 'split ' + (d < 0 ? 'ahead' : 'behind'); }
  finish() {
    const g = this.game, a = this.flight, f = a.f, t = a.t + a.pen, par = f.par[this.plane.spec.id] || f.par.make;
    const stars = t <= par[0] ? 3 : t <= par[1] ? 2 : 1, old = g.best[f.key], rec = !old || t < old.t, first = !old;
    const nuts = a.nuts + 60 + (first ? 80 : 0) + (rec && !first ? 30 : 0) + stars * 15;
    if (rec) g.best[f.key] = { t, s: Math.max(stars, old ? old.s : 0), splits: a.splits.map(x => x) };
    else if (old && stars > old.s) old.s = stars;
    g.store.set('best', g.best); g.prof.nuts += nuts; g.saveProf();
    this.lastFlight = f; this.stopFlight();
    $('prName').textContent = f.name; $('prStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('prList').innerHTML = [['Tid', fmtTime(t)], a.pen ? ['Straff', '+' + a.pen + ' s'] : null, old ? ['Beste før', fmtTime(old.t)] : null, ['Tre stjerner', fmtTime(par[0])], ['To stjerner', fmtTime(par[1])],
      ['Fly', this.plane.spec.name], ['Muttere', '+' + nuts + ' ⚙'], rec ? ['', first ? 'Første gang!' : 'Ny rekord!'] : null].filter(Boolean).map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
    g.mode = 'pause'; g.ui.show('planeResult');
  }
  // ---------------------------------------------------------------- input
  press(k) {
    const g = this.game, p = this.plane;
    switch (k) {
      case 'cam': this.camMode = (this.camMode + 1) % CAMS.length; this.snap = true; this.tv = null; g.ui.toast(CAMS[this.camMode]); return true;
      case 'reset': this.reset(); return true;
      case 'enter': if (this.atApron()) this.menu(); else if (!this.flight) g.ui.toast(p.state.onGround ? 'Takse til oppstillingsplassen og stopp for å gå ut' : 'Land og takse til oppstillingsplassen for å gå ut'); return true;
      case 'lights': this.landing = !(this.landing ?? U.uNight.value > 0.4); g.ui.toast(this.landing ? 'Landingslys på' : 'Landingslys av'); return true;
      case 'map': g.mode = 'pause'; g.ui.show('map'); return true;
      case 'f': this.setFlaps(this.flaps + 1); return true;
      case 'look': this.setFlaps(this.flaps - 1); return true;        // V
      case 'pause': $('pReset').textContent = this.flight && this.flight.gi > 0 ? 'Tilbake til forrige ring (+10 s)' : this.flight ? 'Start flygingen på nytt' : 'Tilbake til rullebanen'; $('pAbort').hidden = !this.flight; return false;
      case 'up': case 'down': case 'low': case 'hazard': case 'horn': case 'indL': case 'indR': case 'handbrake': return true;   // keys the plane uses otherwise (E, Q, G, −, …)
    }
    return false;
  }
  atApron() { const p = this.plane; return p && !p.crashed && p.state.onGround && onApron(this.A, p.pos.x, p.pos.z) && Math.hypot(p.vel.x, p.vel.z) < 1.5; }
  // the stick, the rudder, the throttle lever, the flaps and the brakes from the keys, a gamepad and the touch controls
  controls(dt, inp) {
    const d = inp.down, has = (...k) => k.some(x => d.has(x)), T = this.touch, I = this.plane.input, S = this.stk, real = this.game.settings.mode === 'ekte';
    const ease = (v, want, up, down) => v + clamp(want - v, -dt * (Math.abs(want) < Math.abs(v) ? down : up), dt * (Math.abs(want) < Math.abs(v) ? down : up));
    S.e = ease(S.e, (has('arrowdown', 's') ? 1 : 0) - (has('arrowup', 'w') ? 1 : 0), real ? 1.6 : 2.5, 4);
    S.a = ease(S.a, (has('arrowright', 'd') ? 1 : 0) - (has('arrowleft', 'a') ? 1 : 0), real ? 2.2 : 3, 5);
    S.r = ease(S.r, (has('e', 'x') ? 1 : 0) - (has('q', 'z') ? 1 : 0), 3, 5);
    let ele = S.e, ail = S.a, rud = S.r, thrRate = (has('shift', 'pageup', '+') ? 1 : 0) - (has('control', 'pagedown', '-') ? 1 : 0), brake = has('b', ' ') || this.tb.brake ? 1 : 0;
    // gamepad
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(q => q && q.connected) : null, P = this.pad;
    if (gp && !this.game.input.wheel) {
      const ax = i => { const v = gp.axes[i] || 0, a = Math.abs(v); return a < 0.1 ? 0 : Math.sign(v) * Math.pow((a - 0.1) / 0.9, 1.5); }, btn = i => gp.buttons[i] && gp.buttons[i].pressed, val = i => gp.buttons[i] ? gp.buttons[i].value : 0;
      ele = clamp(ele + ax(1), -1, 1); ail = clamp(ail + ax(0), -1, 1); rud = clamp(rud + ax(2), -1, 1);
      thrRate += val(7) - val(6) - ax(3); if (btn(0)) brake = 1;
      if (btn(5) && !P[5]) this.setFlaps(this.flaps + 1); if (btn(4) && !P[4]) this.setFlaps(this.flaps - 1);
      P[5] = btn(5); P[4] = btn(4);
    }
    // touch: the stick (down = back = nose up) and the lever
    if (T.on) { ele = clamp(ele + T.y, -1, 1); ail = clamp(ail + T.x, -1, 1); }
    this.lever = clamp(this.lever + thrRate * dt * 0.6, 0, 1);
    I.elevator = ele; I.aileron = ail; I.rudder = rud; I.throttle = this.lever; I.flaps = this.flaps;
    // Lett on the ground: the plane keeps the heading it has when the pilot does not steer (the take-off and landing roll)
    const p = this.plane, gs = Math.hypot(p.vel.x, p.vel.z);
    if (!real && p.state.onGround && gs > 2 && !p.crashed) {
      const psi = Math.atan2(p.fw.x, -p.fw.z), r = -(p.w.x * p.up.x + p.w.y * p.up.y + p.w.z * p.up.z);
      if (Math.abs(rud) < 0.05 && Math.abs(ail) < 0.05) { if (this.hold == null) this.hold = psi; I.rudder = clamp(rud - 3 * wrap(psi - this.hold) - 0.8 * r, -1, 1); } else this.hold = null;
    } else this.hold = null;
    // brakes: both, or the one on the side the rudder pushes to help a tight turn while taxiing
    I.brake = brake; I.brakeL = I.brakeR = null;
    if (!brake && p.state.onGround && gs < 7 && Math.abs(rud) > 0.6) { I.brakeL = rud < 0 ? 0.35 * Math.abs(rud) : 0; I.brakeR = rud > 0 ? 0.35 * Math.abs(rud) : 0; }
    if (real) I.trim = clamp(I.trim + ((has('t') ? 1 : 0) - (has('g') ? 1 : 0)) * dt * 0.35, -1, 1);
    // touch thumb on the lever: show where it is
    const th = $('fThr').querySelector('i'); th.style.bottom = (this.lever * (($('fThr').clientHeight || 160) - 34)) + 'px';
  }
  // ---------------------------------------------------------------- every frame
  update(dt, inp) {
    const g = this.game, p = this.plane, st = p.state, real = g.settings.mode === 'ekte';
    p.assist = !real;
    if (!p.crashed) this.controls(dt, inp);
    if (this.flight) this.updateFlight(dt);
    if (!this.plane) return;
    // gusts: a slow wander round the steady breeze, stronger in bad weather
    const W = g.weather || {}, gu = this.gust, amp = 0.4 + (W.turb || 3) * 0.12; gu.t += dt;
    p.wind.set(this.wind0.x + amp * (Math.sin(gu.t * 0.31) + 0.5 * Math.sin(gu.t * 0.83 + 1)), amp * 0.3 * Math.sin(gu.t * 0.57), this.wind0.z + amp * (Math.sin(gu.t * 0.27 + 2) + 0.5 * Math.sin(gu.t * 0.71)));
    // physics at 240 Hz
    this.acc += dt; let n = 0;
    while (this.acc >= DT && n < MAXSTEP) { p.step(DT, this.PW); this.acc -= DT; n++; }
    if (n >= MAXSTEP) this.acc = 0;
    if (!isFinite(p.pos.x) || !isFinite(p.q.w)) { this.reset(); return; }
    // a crash: say why, then back to the threshold (or the last ring) after a moment
    if (p.crashed) {
      if (!this.crashT) { this.crashT = 3; const el = $('fCrash'), off = st.agl < 3 && /over-g|collapsed$/.test(p.crashReason || '') && !onRunway(this.A, p.pos.x, p.pos.z); el.innerHTML = (off ? 'Kjørte av rullebanen' : crashText(p.crashReason)) + `<small>${this.flight && this.flight.gi > 0 ? 'Tilbake ved forrige ring om litt (+10 s)' : 'Tilbake på rullebanen om litt'}</small>`; el.hidden = false; this.shake = 0.6; }
      this.crashT -= dt;
      if (this.crashT <= 0) { this.crashT = 0; $('fCrash').hidden = true; this.reset(); }
    }
    // on screen
    const night = U.uNight.value, running = st.rpm > 300 && !p.crashed;
    this.vis.sync(p, { nav: running && (night > 0.25 || this.flight && this.flight.f.night) || running && !st.onGround, beacon: running, strobe: running && (!st.onGround || this.lever > 0.6), landing: running && (this.landing ?? (night > 0.4 && st.agl < 500)), cockpit: this.camMode === 1 }, dt);
    if (this.camMode === 1) { this.panelT = (this.panelT || 0) - dt; if (this.panelT <= 0) { this.panelT = 0.1; this.vis.panelDraw(st); } }
    this.camera(dt, inp);
    this.pose.kmh = st.tas * 3.6;
    this.where = p.spec.name + (p.crashed ? ' · krasjet' : st.onGround ? (Math.hypot(p.vel.x, p.vel.z) > 2 ? ' · ' + Math.round(st.kias) + ' knop på bakken' : ' · på bakken') : ' · ' + Math.round(st.alt) + ' m · ' + Math.round(st.kias) + ' knop');
    this.hud(dt);
    // stopped on the apron: the flying club
    const off = $('offer'), near = !this.flight && this.atApron();
    if (near !== this.nearShown) { this.nearShown = near; off.hidden = !near; if (near) { $('oKind').textContent = 'Flyplass'; $('oName').textContent = this.A.name; $('oInfo').textContent = 'andre fly, flyginger og gå ut'; } }
    // sound
    const snd = g.snd;
    if (this.sound && this.sound.spec !== p.spec) { this.sound.stop(); this.sound = null; }
    if (snd.ready && snd.ac && !this.sound) try { this.sound = new PlaneSound(snd, p.spec); } catch (e) { console.warn('flylyd', e); this.sound = { spec: p.spec, update() { }, stop() { } }; }
    if (this.sound) this.sound.update(dt, p, this.camMode === 1 ? 1 : 0);
    g.cam.mode = this.camMode === 1 ? 3 : 0;           // the ambience hears the cabin when the camera is in the cockpit
    if (g.env) { const E = g.env; E.t = 1; this.envT = (this.envT || 0) - dt; if (this.envT <= 0) { this.envT = 0.5; this.soundEnv(E); } }
  }
  // what the ambience hears round the plane: the sea, the forest and the town below, fading out with the height
  soundEnv(E) {
    const p = this.plane.pos, w = this.game.world, k = 1 - THREE.MathUtils.smoothstep(this.plane.state.agl, 15, 160); let sea = 0, n = 0, fo = 0, to = 0;
    for (let i = 0; i < 8; i++) for (const r of [40, 120]) { const a = i / 8 * Math.PI * 2, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r, isl = w.islandAt(x, z); n++; if (w.terrain(x, z) < 0) sea++; else if (isl && !isl.def.backdrop) { const c = isl.coverAt(x, z); if (c >= 3 && c <= 5) fo++; else if (c === 9 || c === 10) to++; } }
    E.sea = sea / n * k; E.forest = fo / n * 0.6 * k; E.town = to / n * k;
  }
  frame(dt) {
    if (!this.field) return;
    const cam = this.game.gfx.camera;
    this.field.update(dt, cam.position);
    if (this.rings) this.rings.update(dt);
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('fHint').classList.add('off'); }
  }
  // ---------------------------------------------------------------- cameras
  camera(dt, inp) {
    const g = this.game, cam = g.gfx.camera, C = g.cam, p = this.plane, spec = p.spec, vis = this.vis, st = p.state, root = vis.root, gp = navigator.getGamepads && [...navigator.getGamepads()].some(q => q && q.connected);
    if (!gp && (inp.lookX || inp.lookY)) { C.yaw = -inp.lookX * 2.2; C.pitch = Math.max(-0.3, inp.lookY * 0.8); C.dragT = 0.3; }
    C.dragT -= dt; if (C.dragT <= 0) { C.yaw *= Math.exp(-dt * 2.5); C.pitch *= Math.exp(-dt * 2.5); }
    root.updateMatrixWorld(true);
    const fw = _v.set(p.fw.x, p.fw.y, p.fw.z), up = _w.set(p.up.x, p.up.y, p.up.z);
    if (this.camMode === 1) {
      // in the cockpit: the pilot's eye, looking where the plane points (drag to look round)
      cam.position.copy(vis.eye).applyMatrix4(root.matrixWorld);
      cam.quaternion.copy(root.quaternion).multiply(_q.setFromEuler(_e.set(-C.pitch * 0.8 - 0.05, C.yaw + Math.PI, 0, 'YXZ')));
      cam.fov = 70 / Math.sqrt(C.zoom); cam.near = 0.05;
    } else if (this.camMode === 2) {
      // on the left wing, looking along the fuselage to the nose: it rolls with the plane
      const half = spec.wing.span / 2, at = _u.set(half * 0.72, spec.wing.y + (spec.wing.y > 0 ? 0.55 : 0.75), spec.wing.z - 2.4).applyMatrix4(root.matrixWorld);
      cam.position.copy(at); const look = new THREE.Vector3(-half * 0.1, 0.2, 2.5).applyMatrix4(root.matrixWorld);
      cam.up.copy(up); cam.lookAt(look); if (C.yaw || C.pitch) cam.quaternion.multiply(_q.setFromEuler(_e.set(-C.pitch * 0.6, C.yaw, 0, 'YXZ')));
      cam.fov = 62 / Math.sqrt(C.zoom); cam.near = 0.1;
    } else if (this.camMode === 3) {
      // the tower near the airport; elsewhere a camera beside the route that the plane flies past
      const nearField = Math.hypot(p.pos.x - this.tower.x, p.pos.z - this.tower.z) < 3500;
      if (nearField) { this.tv = this.tower; this.tvTower = true; }
      else if (!this.tv || this.tvTower || this.tv.distanceTo(_u.set(p.pos.x, p.pos.y, p.pos.z)) > 700) {
        this.tvTower = false;
        const v = p.vel, sp = Math.max(20, Math.hypot(v.x, v.z)), ux = v.x / sp, uz = v.z / sp, side = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 40), ahead = 250 + sp * 4;
        const x = p.pos.x + ux * ahead - uz * side, z = p.pos.z + uz * ahead + ux * side;
        this.tv = new THREE.Vector3(x, Math.max(g.world.height(x, z) + 3, p.pos.y + v.y * ahead / sp + (Math.random() - 0.3) * 20), z);
      }
      cam.position.copy(this.tv); cam.up.set(0, 1, 0); cam.lookAt(p.pos.x, p.pos.y, p.pos.z);
      const dd = this.tv.distanceTo(_u.set(p.pos.x, p.pos.y, p.pos.z)); cam.fov = clamp(2 * Math.atan(spec.wing.span * 2.4 / Math.max(1, dd)) / D2R, 3, 60); cam.near = 0.5;
    } else {
      // chase: behind and a little above, where the plane points and goes, the horizon tilting part of the way with the bank
      const v = p.vel, vs = Math.hypot(v.x, v.y, v.z), dir = _u.copy(fw); if (vs > 15) dir.multiplyScalar(0.6).add(new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(0.4 / vs)).normalize();
      if (st.onGround) { dir.y = 0; dir.normalize(); }
      const dist = (spec.wing.span * 1.05 + 4) * C.zoom, hh = (st.onGround ? 2.6 : 2.9) * Math.sqrt(C.zoom), yaw = C.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const bx = -(dir.x * cy + dir.z * sy), bz = -(-dir.x * sy + dir.z * cy), want = new THREE.Vector3(p.pos.x + bx * dist, p.pos.y - dir.y * dist + hh + C.pitch * dist * 0.6, p.pos.z + bz * dist);
      const floor = Math.max(g.world.height(want.x, want.z), 0) + 1.2; if (want.y < floor) want.y = floor;
      if (this.snap) { this.camPos.copy(want); this.camUp.set(0, 1, 0); }
      else { const k = 1 - Math.exp(-dt * 6); this.camPos.lerp(want, k); if (this.camPos.y < floor) this.camPos.y = floor; }
      this.camUp.lerp(_u.set(0, 1, 0).lerp(up, st.onGround ? 0 : 0.35).normalize(), 1 - Math.exp(-dt * 4)).normalize();
      cam.position.copy(this.camPos); cam.up.copy(this.camUp); cam.lookAt(p.pos.x + fw.x * 6, p.pos.y + fw.y * 6 + 0.8, p.pos.z + fw.z * 6);
      cam.fov = 58 + Math.min(10, st.tas * 0.12); cam.near = 0.1;
    }
    if (this.shake > 0.002) { cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; this.shake *= Math.exp(-dt * 6); }
    // a little shake on the runway and in rough air
    if (st.onGround && !p.crashed && this.camMode !== 3) { const sh = Math.min(0.03, Math.hypot(p.vel.x, p.vel.z) * 0.0008); cam.position.y += (Math.random() - 0.5) * sh; }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(); this.snap = false;
  }
  // ---------------------------------------------------------------- HUD
  hud(dt) {
    const p = this.plane, st = p.state, a = this.flight;
    this.drawInst();
    this.mark();
    this.hudT = (this.hudT || 0) - dt; if (this.hudT > 0) return; this.hudT = 0.1;
    if (a) { $('fRTime').textContent = fmtTime(a.t + a.pen); $('fRRing').textContent = Math.min(a.gi + 1, a.f.G.length) + '/' + a.f.G.length + (a.gi >= a.f.G.length ? ' · land' : ''); }
    const on = (id, v, cls = 'on') => { $(id).className = v ? cls : ''; };
    on('fLStall', st.stallWarn || st.overspeed || st.overG, 'warn'); on('fLBrake', p.input.brake > 0.1 || p.input.brakeL || p.input.brakeR); on('fLFlap', st.flaps > 1);
    on('fLLys', this.landing ?? (U.uNight.value > 0.4 && st.agl < 500)); on('fLAuto', p.assist);
  }
  // the marker on the next ring (or an arrow at the edge of the screen pointing to it), with its distance
  mark() {
    const a = this.flight, el = $('fMark');
    if (!a || a.count > 0 || a.gi >= a.f.G.length) { el.style.display = 'none'; return; }
    const R = a.f.G[a.gi], cam = this.game.gfx.camera, W = innerWidth, H = innerHeight, v = _v.set(R.x, R.y, R.z).applyMatrix4(cam.matrixWorldInverse), behind = v.z > 0;
    v.applyMatrix4(cam.projectionMatrix);
    let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H; if (behind) { x = W - x; y = H - y; }
    const m = 46, inside = !behind && x > m && x < W - m && y > m && y < H - m;
    if (!inside) { const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, k = Math.min((W / 2 - m) / Math.max(1, Math.abs(dx)), (H / 2 - m) / Math.max(1, Math.abs(dy))); x = cx + dx * k; y = cy + dy * k; el.querySelector('i').style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`; }
    else el.querySelector('i').style.transform = '';
    const d = Math.hypot(R.x - this.plane.pos.x, R.y - this.plane.pos.y, R.z - this.plane.pos.z);
    el.style.display = 'block'; el.className = (inside ? '' : 'edge') + (a.bad ? ' bad' : ''); el.style.transform = `translate(${x}px,${y}px)`;
    el.querySelector('b').textContent = (d > 950 ? fmtD(d / 1000) + ' km' : Math.round(d / 10) * 10 + ' m') + (Math.abs(R.y - this.plane.pos.y) > 40 ? (R.y > this.plane.pos.y ? ' ↑' : ' ↓') : '');
  }
  // the instruments on the screen: airspeed tape, attitude with the heading under it, altitude tape and climb; throttle, flaps, rpm, g
  drawInst() {
    const x = this.ictx, Wd = 420, Ht = 230, p = this.plane, st = p.state, spec = p.spec;
    x.clearRect(0, 0, Wd, Ht);
    x.fillStyle = 'rgba(14,13,10,.78)'; x.beginPath(); x.roundRect ? x.roundRect(2, 2, Wd - 4, Ht - 4, 16) : x.rect(2, 2, Wd - 4, Ht - 4); x.fill();
    x.font = '600 14px "Barlow Condensed"'; x.textAlign = 'center'; x.textBaseline = 'middle';
    // attitude: the horizon turning and moving behind the fixed little plane, the bank scale on top
    const cx = 210, cy = 96, R = 74;
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip(); x.translate(cx, cy); x.rotate(-st.bank * D2R);
    const pp = clamp(st.pitch, -60, 60) * R / 35;
    x.fillStyle = '#3d7fc0'; x.fillRect(-R * 2, -R * 3 + pp, R * 4, R * 3); x.fillStyle = '#7a5530'; x.fillRect(-R * 2, pp, R * 4, R * 3);
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(-R * 2, pp); x.lineTo(R * 2, pp); x.stroke();
    x.lineWidth = 1.2; x.fillStyle = '#fff'; x.font = '600 11px "Barlow Condensed"';
    for (let k = -30; k <= 30; k += 10) { if (!k) continue; const yy = pp - k * R / 35, w = k % 20 ? 14 : 24; x.beginPath(); x.moveTo(-w, yy); x.lineTo(w, yy); x.stroke(); x.fillText(Math.abs(k), w + 10, yy); }
    x.restore();
    x.strokeStyle = 'rgba(242,232,208,.5)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const a = (b - 90) * D2R, r0 = b % 30 ? R + 2 : R - 2; x.strokeStyle = '#f2e8d0'; x.lineWidth = b % 30 ? 1.2 : 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8)); x.stroke(); }
    { const a = (-st.bank - 90) * D2R; x.fillStyle = '#f2c230'; x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3)); x.lineTo(cx + Math.cos(a + 0.07) * (R - 13), cy + Math.sin(a + 0.07) * (R - 13)); x.lineTo(cx + Math.cos(a - 0.07) * (R - 13), cy + Math.sin(a - 0.07) * (R - 13)); x.fill(); }
    x.strokeStyle = '#f2c230'; x.lineWidth = 4; x.beginPath(); x.moveTo(cx - 44, cy); x.lineTo(cx - 14, cy); x.lineTo(cx, cy + 9); x.lineTo(cx + 14, cy); x.lineTo(cx + 44, cy); x.stroke();
    x.fillStyle = '#f2c230'; x.beginPath(); x.arc(cx, cy, 3, 0, 7); x.fill();
    if (st.stallWarn && (performance.now() % 500) < 300) { x.fillStyle = 'rgba(217,67,47,.9)'; x.fillRect(cx - 40, cy - 46, 80, 22); x.fillStyle = '#fff'; x.font = '700 17px "Barlow Condensed"'; x.fillText('STALL', cx, cy - 35); }
    // heading strip
    { const hy = 196, hw = 120, hd = st.heading; x.save(); x.beginPath(); x.rect(cx - hw / 2, hy - 13, hw, 26); x.clip(); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(cx - hw / 2, hy - 13, hw, 26);
      x.strokeStyle = '#f2e8d0'; x.fillStyle = '#f2e8d0'; x.font = '600 12px "Barlow Condensed"'; x.lineWidth = 1;
      for (let k = Math.floor((hd - 40) / 10) * 10; k <= hd + 40; k += 10) { const xx = cx + (k - hd) * 2.4, kk = (k + 360) % 360; x.beginPath(); x.moveTo(xx, hy + 13); x.lineTo(xx, hy + (kk % 30 ? 8 : 4)); x.stroke(); if (kk % 30 === 0) x.fillText({ 0: 'N', 90: 'Ø', 180: 'S', 270: 'V' }[kk] || String(kk / 10).padStart(2, '0'), xx, hy - 4); }
      x.restore(); x.fillStyle = '#f2c230'; x.beginPath(); x.moveTo(cx, hy + 9); x.lineTo(cx - 5, hy + 15); x.lineTo(cx + 5, hy + 15); x.fill();
      x.fillStyle = '#f2e8d0'; x.font = '700 13px "Barlow Condensed"'; x.fillText(String(Math.round(hd) % 360).padStart(3, '0') + '°', cx + hw / 2 + 22, hy); }
    // a tape: value v, scale s px per unit, step between ticks, bands [[lo, hi, colour]]
    const tape = (tx, w, v, s, step, label, bands, sub) => {
      const top = 22, bot = 172, mid = (top + bot) / 2; x.save(); x.beginPath(); x.rect(tx, top, w, bot - top); x.clip(); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(tx, top, w, bot - top);
      for (const [lo, hi, c] of bands || []) { x.fillStyle = c; x.fillRect(tx + w - 6, mid - (hi - v) * s, 5, (hi - lo) * s); }
      x.strokeStyle = '#f2e8d0'; x.fillStyle = '#f2e8d0'; x.lineWidth = 1; x.font = '600 12px "Barlow Condensed"';
      for (let k = Math.floor((v - 80 / s) / step) * step; k <= v + 80 / s; k += step) { const yy = mid - (k - v) * s; x.beginPath(); x.moveTo(tx + w - 12, yy); x.lineTo(tx + w - 6, yy); x.stroke(); if (k % (step * 2) === 0) x.fillText(k, tx + (w - 14) / 2, yy); }
      x.restore(); x.fillStyle = '#14120e'; x.strokeStyle = '#f2c230'; x.lineWidth = 2; x.fillRect(tx - 2, mid - 15, w + 4, 30); x.strokeRect(tx - 2, mid - 15, w + 4, 30);
      x.fillStyle = '#f2e8d0'; x.font = '700 20px "Barlow Condensed"'; x.fillText(label, tx + w / 2, mid + 1);
      x.fillStyle = 'rgba(242,232,208,.65)'; x.font = '600 12px "Barlow Condensed"'; x.fillText(sub, tx + w / 2, 12);
    };
    const vne = spec.limits.vne, kias = Math.max(0, st.kias);
    tape(16, 70, kias, 1.6, 10, Math.round(kias), [[spec.id === 'make' ? 40 : 44, 85, 'rgba(242,242,242,.9)'], [spec.id === 'make' ? 48 : 50, vne * 0.79, '#3bb34a'], [vne * 0.79, vne, '#e8c33a'], [vne, vne + 40, '#d9432f']], 'KNOP');
    tape(334, 70, st.alt, 0.75, 20, Math.round(st.alt), [], 'METER');
    x.fillStyle = 'rgba(242,232,208,.75)'; x.font = '600 12px "Barlow Condensed"'; x.fillText(fmtN(st.alt * 3.2808) + ' ft', 369, 182);
    // climb: a bar beside the altitude, ±10 m/s
    { const vy = clamp(st.vs, -10, 10), bx = 408, mid = 97; x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(bx, 22, 6, 150); x.fillStyle = vy >= 0 ? '#3bb34a' : '#e8a32b'; x.fillRect(bx, vy >= 0 ? mid - vy * 7.5 : mid, 6, Math.abs(vy) * 7.5);
      x.fillStyle = '#f2e8d0'; x.font = '700 13px "Barlow Condensed"'; x.fillText((st.vs >= 0 ? '+' : '−') + fmtD(Math.abs(st.vs)), 369, 200); x.font = '600 11px "Barlow Condensed"'; x.fillStyle = 'rgba(242,232,208,.65)'; x.fillText('m/s', 369, 213); }
    // throttle and flaps under the airspeed, rpm and g
    { const tx = 16, ty = 186; x.fillStyle = 'rgba(242,232,208,.14)'; x.fillRect(tx, ty, 70, 8); x.fillStyle = '#e5a92b'; x.fillRect(tx, ty, 70 * this.lever, 8);
      x.fillStyle = 'rgba(242,232,208,.75)'; x.font = '600 12px "Barlow Condensed"'; x.textAlign = 'left'; x.fillText('GASS ' + Math.round(this.lever * 100) + ' %', tx, ty + 18);
      const fd = spec.wing.flaps.deg; x.fillText('KLAFF ' + Math.round(st.flaps) + '°', tx, ty + 32);
      for (let k = 0; k < fd.length; k++) { x.fillStyle = k <= this.flaps ? '#e5a92b' : 'rgba(242,232,208,.2)'; x.fillRect(tx + 52 + k * 5, ty + 27, 3, 10); }
      x.textAlign = 'center'; x.fillStyle = '#f2e8d0'; x.font = '700 13px "Barlow Condensed"'; x.fillText(Math.round(st.rpm / 10) * 10 + ' o/min', 120, 186); x.fillStyle = st.overG ? '#ff6a4a' : '#f2e8d0'; x.fillText(fmtD(st.g) + ' g', 120, 202);
      if (p.input.trim && this.game.settings.mode === 'ekte') { x.fillStyle = 'rgba(242,232,208,.65)'; x.font = '600 11px "Barlow Condensed"'; x.fillText('TRIM ' + (p.input.trim > 0 ? '+' : '') + Math.round(p.input.trim * 100), 120, 216); } }
  }
  // ---------------------------------------------------------------- multiplayer
  // another player flying: their plane, with flaps, propeller and lights from what they send
  remoteVisual(who) {
    const g = this.game, root = new THREE.Group(); let v = null, id = null;
    return { root, tagY: 3.5,
      update: (pose, dt) => {
        const d = pose.data || {}, m = PLANES.some(s => s.id === d.m) ? d.m : 'make';
        if (!v || id !== m) { if (v) v.dispose(); v = new PlaneVisual(g.gfx, planeById(m), { parent: root, reg: typeof d.g === 'string' ? d.g.slice(0, 8) : undefined }); id = m; }
        v.pose(pose.pos, pose.q, { f: +d.f || 0, r: +d.r || 0, l: d.l ?? 7 }, dt);
      },
      dispose: () => { if (v) v.dispose(); v = null; } };
  }
  netData() {
    const p = this.plane; if (!p) return null; const night = U.uNight.value, run = p.state.rpm > 300;
    return { m: p.spec.id, f: Math.round(p.ctl.flap), r: Math.round(p.state.rpm / 50) * 50, l: (run ? 3 : 0) | (run && !p.state.onGround ? 4 : 0) | (this.landing ?? night > 0.4 ? 8 : 0), g: LOOK[p.spec.id] && LOOK[p.spec.id].reg };
  }
}
