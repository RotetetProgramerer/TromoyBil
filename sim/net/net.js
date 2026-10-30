// «Kjør sammen»: drive together on the islands. A room has a host and up to three guests (room.js), over WebRTC or, for testing
// on one machine, between tabs of the same browser (transport.js). Every player simulates their own car exactly as alone; only
// poses go over the net, 15 times a second, and the others are drawn a little behind real time so they glide (remote.js).
// Cars do not collide, and progress (nuts, courses, cars) stays personal.
// The pose message (JSON, numbers rounded):
//   {t:'s', tm: my clock in ms, i: island id, m: mode (d drive, f ferry, m menu, g garage, p pause, a activity),
//    p: [x,y,z] position, q: [x,y,z,w] rotation, v: [x,y,z] velocity (m/s), wy: [4] each wheel centre's height in the car's
//    own frame (FL FR RL RR), ws: [2] front wheel steer (rad), wo: [4] wheel spin rates (rad/s), st: steering (rad),
//    l: lights (1 brake, 2 reverse, 4 headlights), n: indicator (0 off, 1 left, 2 right, 3 hazard),
//    a: while an activity runs {id, p: [x,y,z], f: [x,y,z] forward, k: km/h, q?: [x,y,z,w], d?: the activity's netData()}}
// and {t:'info', info: {car, col}} when the car or its paint changes (also in the room's roster).
// An activity can draw other players its own way (see sim/activities/activity.js): remoteVisual(who) and netData().
import * as THREE from 'three';
import { Room, NET_MAX, cleanName } from './room.js';
import { peerTransport, localTransport } from './transport.js';
import { Remote, poseOk } from './remote.js';
import { CARS, carById } from '../data/cars.js';

const HZ = 15, COLS = ['#3fa9f5', '#8bd14a', '#d94fd0', '#f2c230'];   // by slot; your own car is the orange arrow on the maps
const MODES = { drive: 'd', race: 'd', result: 'd', ferry: 'f', menu: 'm', garage: 'g', pause: 'p', act: 'a' };
const DOING = { boat: 'i båt', plane: 'flyr', ski: 'på ski', ferry: 'på ferja' };
const $ = id => document.getElementById(id);
const r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100, r4 = v => Math.round(v * 1e4) / 1e4;
const dist = d => d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1).replace('.', ',') + ' km';
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

const CSS = `
#net input[type=text]{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(242,232,208,.06);color:var(--ink);font:inherit;font-size:20px;user-select:text;-webkit-user-select:text}
#net input[type=text]:focus{outline:none;border-color:var(--acc)}
.netjoin{display:flex;gap:8px}.netjoin input{flex:1;min-width:0;text-transform:uppercase;letter-spacing:1px}.netjoin .ghost{width:auto;margin:0;padding:8px 18px}
.netchk{display:flex;gap:8px;align-items:center;font-size:18px;margin:14px 0 0;cursor:pointer}.netchk input{width:18px;height:18px;margin:0;accent-color:var(--acc)}
.netcode{font-family:'Saira Stencil One',sans-serif;font-size:46px;line-height:1.1;color:var(--acc);letter-spacing:2px;text-align:center;user-select:text;-webkit-user-select:text}
.netstatus{min-height:1.3em;font-size:17px;color:var(--acc);margin:10px 0 0}.netstatus.bad{color:#ff7a5f}
.netdot{width:14px;height:14px;border-radius:50%;flex:none;box-shadow:0 0 0 2px rgba(20,18,14,.8)}
#netList .item{cursor:default}#netList .item>div{flex:1;min-width:0}#netList .ghost.sm{font-size:16px;padding:6px 10px;flex:none}
.netbox{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:3px 10px 5px;font-size:15px;width:max-content;min-width:130px;max-width:230px}
.netbox .nc{color:var(--acc);font-size:12px;letter-spacing:1.5px}
.netbox .nr{display:flex;align-items:center;gap:6px;white-space:nowrap;line-height:1.3}
.netbox .nr i{width:9px;height:9px;border-radius:50%;flex:none}.netbox .nr span{overflow:hidden;text-overflow:ellipsis}
.netbox .nr small{color:var(--dim);margin-left:auto;padding-left:10px;font-size:13px}
@media (max-width:760px){.netbox{font-size:13px;max-width:170px}}`;

const HTML = `<header class="brand"><p class="eyebrow">Flerspiller</p><h1>Kjør<br>sammen</h1>
  <p class="lede">Kjør sammen med opptil tre andre. Alle kjører sin egen bil og ser hverandre, men bilene kolliderer ikke. Muttere, løyper og biler er dine egne.</p></header>
<div class="panel">
  <div id="netOut">
    <h2>Navnet ditt</h2><input id="netName" type="text" maxlength="14" autocomplete="nickname" spellcheck="false" placeholder="Sjåfør">
    <button class="go" id="netCreate">Lag et rom</button>
    <h2>Eller bli med i et rom</h2>
    <div class="netjoin"><input id="netCode" type="text" maxlength="12" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="KRABBE-42" aria-label="Romkode"><button class="ghost" id="netJoin">Bli med</button></div>
    <label class="netchk"><input type="checkbox" id="netLocal"> Lokal test (samme nettleser)</label>
    <p class="note">Lokal test kobler sammen faner i denne nettleseren, uten nett. Fint for å prøve på én maskin.</p>
  </div>
  <div id="netIn" hidden>
    <h2>Romkode</h2><div class="netcode" id="netRoom"></div><p class="note" id="netMode"></p>
    <button class="ghost" id="netCopy">Kopier koden</button>
    <h2>I rommet</h2><div class="list" id="netList"></div>
    <button class="go" id="netGo">Kjør!</button><button class="ghost" id="netLeave">Forlat rommet</button>
  </div>
  <p class="netstatus" id="netStatus" role="status" aria-live="polite"></p>
  <button class="ghost" id="netBack">Tilbake</button>
</div>`;

export default class Net {
  constructor(game) {
    this.g = game; game.net = this; this.remotes = new Map(); this.sendT = 0; this.infoT = 0; this.infoSig = ''; this.hudT = 0; this.listT = 0; this.t0 = performance.now(); this.lastFrame = 0;
    this.room = new Room({
      transport: local => local ? localTransport() : peerTransport(),
      name: () => game.store.get('mpName', ''), info: () => this.myInfo(), clean: i => this.cleanInfo(i), on: (t, ...a) => this.on(t, ...a),
    });
  }
  async init() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const sec = document.createElement('section'); sec.className = 'overlay'; sec.id = 'net'; sec.hidden = true; sec.innerHTML = HTML; document.body.appendChild(sec);
    const box = document.createElement('div'); box.className = 'netbox'; box.id = 'hNet'; box.hidden = true; const tl = document.querySelector('#hud .hud-tl'); if (tl) tl.appendChild(box);
    // «Kjør sammen» in the pause menu too
    const pm = $('pMenu'); if (pm) { const b = document.createElement('button'); b.className = 'ghost'; b.id = 'pNet'; b.textContent = 'Kjør sammen'; b.onclick = () => this.dialog(); pm.before(b); }
    const g = this.g, save = () => { const n = cleanName($('netName').value); $('netName').value = n; g.store.set('mpName', n); g.store.set('mpLocal', $('netLocal').checked); };
    $('netCreate').onclick = () => { save(); this.room.create($('netLocal').checked); this.refresh(); };
    $('netJoin').onclick = () => { save(); this.room.join($('netCode').value, $('netLocal').checked); this.refresh(); };
    $('netLeave').onclick = () => { this.room.leave('Du forlot rommet'); this.refresh(); };
    $('netGo').onclick = () => { if (g.mode === 'menu') g.play(); else g.resume(); };
    $('netBack').onclick = () => g.ui.back();
    $('netCopy').onclick = () => { const c = this.room.code; (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => g.ui.toast('Koden ' + c + ' er kopiert'), () => g.ui.toast('Koden er ' + c)); };
    // typing a name or a code must not drive the car
    for (const id of ['netName', 'netCode']) for (const e of ['keydown', 'keyup']) $(id).addEventListener(e, ev => {
      ev.stopPropagation(); if (e !== 'keydown') return;
      if (ev.key === 'Enter') { ev.preventDefault(); (id === 'netCode' || $('netCode').value ? $('netJoin') : $('netCreate')).click(); }
      if (ev.key === 'Escape') { ev.preventDefault(); g.ui.back(); }
    });
    if (g.params.has('local')) g.store.set('mpLocal', true);
    addEventListener('pagehide', () => this.room.bye());
    // no frames on the ferry or in a hidden tab: keep telling the others where we are, slowly
    setInterval(() => { const R = this.room; if (R.inRoom && performance.now() - this.lastFrame > 400) { R.send(this.pose()); R.tick(); } }, 250);
  }
  color(slot) { return COLS[slot] || COLS[0]; }
  myInfo() { return { car: this.g.car.spec.id, col: this.g.paintColor() }; }
  // what others say about their car is checked before use
  cleanInfo(i) { i = i && typeof i === 'object' ? i : {}; return { car: CARS.some(c => c.id === i.car) ? i.car : CARS[0].id, col: typeof i.col === 'string' && /^#[0-9a-f]{6}$/i.test(i.col) ? i.col : null }; }

  // the room's events
  on(type, a, b) {
    const g = this.g;
    if (type === 'status') { const el = $('netStatus'); if (el) { el.textContent = a; el.classList.toggle('bad', !!b); } }
    else if (type === 'toast') g.ui.toast(a, b);
    else if (type === 'join') { const r = new Remote(this, a); r.tagKey = a.name + '|' + a.slot; this.remotes.set(a.id, r); }
    else if (type === 'update') { const r = this.remotes.get(a.id); if (!r) return; r.build(); const k = a.name + '|' + a.slot; if (k !== r.tagKey) { r.tagKey = k; r.rename(); } }
    else if (type === 'leave') { const r = this.remotes.get(a.id); if (r) { r.dispose(); this.remotes.delete(a.id); } }
    else if (type === 'msg') { if (a && b.t === 's' && poseOk(b)) { const r = this.remotes.get(a.id); if (r) r.push(b, performance.now()); } }
    else if (type === 'open') { this.infoSig = JSON.stringify(this.myInfo()); this.sendT = 0; }
    if (type === 'change' || type === 'open' || type === 'closed') { this.refresh(); this.hud(); }
  }

  // ---------------------------------------------------------------- every frame: send my pose, draw the others
  frame(dt) {
    const R = this.room; if (!R.inRoom) return; const now = performance.now(); this.lastFrame = now;
    this.sendT -= dt; if (this.sendT <= 0) { this.sendT = Math.max(0, this.sendT + 1 / HZ); R.send(this.pose()); }
    if (now >= this.infoT) { this.infoT = now + 1000; const i = this.myInfo(), sig = JSON.stringify(i); if (sig !== this.infoSig) { this.infoSig = sig; R.setInfo(i); } }
    R.tick();
    const cam = this.g.gfx.camera; for (const r of this.remotes.values()) r.update(now, dt, cam);
    if (now >= this.hudT) { this.hudT = now + 500; this.hud(); }
    if (this.g.ui.open === 'net' && now >= this.listT) { this.listT = now + 1000; this.refresh(); }
  }
  pose() {
    const g = this.g, c = g.car, q = c.q, W = c.wheels; _q.set(q.x, q.y, q.z, q.w).invert();
    const m = { t: 's', tm: Math.round(performance.now() - this.t0), i: g.island().id, m: MODES[g.mode] || 'd',
      p: [r3(c.pos.x), r3(c.pos.y), r3(c.pos.z)], q: [r4(q.x), r4(q.y), r4(q.z), r4(q.w)], v: [r2(c.vel.x), r2(c.vel.y), r2(c.vel.z)],
      wy: W.map(w => r3(Math.max(-3, Math.min(1, _v.set(w.center.x - c.pos.x, w.center.y - c.pos.y, w.center.z - c.pos.z).applyQuaternion(_q).y)))),
      ws: [r3(W[0].steer), r3(W[1].steer)], wo: W.map(w => Math.round(w.omega * 10) / 10), st: r3(c.state.steer),
      l: (c.state.brake > 0.05 ? 1 : 0) | (c.state.gear < 0 ? 2 : 0) | (g.vis.lights ? 4 : 0), n: g.indicator || 0 };
    const A = g.act, P = A && A.pose;
    if (P && P.pos && P.fw) {
      m.a = { id: String(A.constructor.id || 'act'), p: [r3(P.pos.x), r3(P.pos.y), r3(P.pos.z)], f: [r3(P.fw.x), r3(P.fw.y), r3(P.fw.z)], k: Math.round(P.kmh || 0) };
      if (P.q) m.a.q = [r4(P.q.x), r4(P.q.y), r4(P.q.z), r4(P.q.w)];
      if (A.netData) try { const d = A.netData(); if (d != null) m.a.d = d; } catch (e) { }
    }
    return m;
  }

  // ---------------------------------------------------------------- the dialog
  dialog() {
    const g = this.g; if (g.mode === 'drive' || g.mode === 'race') g.pause(); else if (g.mode === 'act') g.mode = 'pause';
    $('netName').value = g.store.get('mpName', ''); $('netLocal').checked = !!g.store.get('mpLocal', false);
    if (!this.room.joining) this.room.status('');
    g.ui.show('net'); if (g.mode === 'menu' || g.mode === 'garage') $('hud').hidden = true;
    this.listSig = null; this.refresh();
    (this.room.inRoom ? $('netGo') : $('netName').value ? $('netCreate') : $('netName')).focus();
  }
  refresh() {
    const R = this.room, sec = $('net'); if (!sec || sec.hidden) return;
    $('netOut').hidden = R.inRoom; $('netIn').hidden = !R.inRoom;
    for (const id of ['netCreate', 'netJoin']) $(id).disabled = R.joining;
    if (!R.inRoom) return;
    $('netRoom').textContent = R.code;
    $('netMode').textContent = R.local ? 'Lokal test: bare faner i denne nettleseren kan bli med.' : 'Gi koden til dem du vil kjøre med. Det er plass til ' + ['', 'én', 'to', 'tre', 'fire'][NET_MAX] + '.';
    const list = [{ id: R.me, name: R.name, slot: R.slot, info: this.myInfo() }, ...R.players.values()].sort((a, b) => a.slot - b.slot);
    const sig = list.map(e => e.id + e.name + e.slot).join(), L = $('netList');
    if (sig !== this.listSig) {
      this.listSig = sig; L.innerHTML = '';
      for (const e of list) {
        const it = document.createElement('div'), dot = document.createElement('span'), tx = document.createElement('div'), nm = document.createElement('b'), sub = document.createElement('small');
        it.className = 'item'; it.dataset.id = e.id; dot.className = 'netdot'; dot.style.background = e.id === R.me ? '#ff5a2a' : this.color(e.slot);
        nm.textContent = e.name + (e.id === R.me ? ' (deg)' : '') + (e.slot === 0 ? ' · vert' : ''); tx.append(nm, sub); it.append(dot, tx);
        if (e.id !== R.me) { const b = document.createElement('button'); b.className = 'ghost sm'; b.textContent = 'Kjør dit'; b.onclick = () => this.goTo(e.id); it.append(b); }
        L.appendChild(it);
      }
    }
    for (const it of L.children) {
      if (!it.dataset.id) continue; const id = it.dataset.id, me = id === R.me, p = me ? null : R.players.get(id), r = this.remotes.get(id), info = me ? this.myInfo() : p && p.info;
      let s = carById(info && info.car).name;
      if (me) s += ' · ' + this.g.island().name;
      else if (r && r.shown) s += ' · ' + (DOING[r.act] || dist(r.pos.distanceTo(_v.copy(this.g.focus().pos)))) + (r.mode === 'm' || r.mode === 'g' ? ' · i menyen' : '');
      else s += ' · venter på posisjon …';
      it.querySelector('small').textContent = s;
    }
    if (!R.players.size && !L.querySelector('.note')) { const n = document.createElement('p'); n.className = 'note'; n.textContent = 'Ingen andre her ennå. Gi dem koden ' + R.code + '.'; L.appendChild(n); this.listSig = null; }
  }
  // put my car on the road right behind someone (another island costs a ferry ticket)
  goTo(id) {
    const g = this.g, r = this.remotes.get(id), p = this.room.players.get(id); if (!p) return;
    if (!r || !r.shown) { g.ui.toast('Vet ikke hvor ' + p.name + ' er ennå', true); return; }
    if (g.act) { g.ui.toast('Gå tilbake til bilen først', true); return; }
    const here = g.island(), at = g.world.islandAt(r.pos.x, r.pos.z), isl = at && !at.def.backdrop && at.roads ? at : here;
    if (isl !== here && g.prof.nuts < 5) { g.ui.toast('Du trenger 5 muttere til ferja', true); return; }
    const tx = r.pos.x - r.fw.x * 14, tz = r.pos.z - r.fw.z * 14; let best = null;
    for (const rd of isl.roads.roads) { if (rd.c > 5) continue; const P = rd.p; for (let i = 0; i < P.length - 3; i += 3) { const x = P[i] + isl.ox, z = P[i + 1] + isl.oz, d = (x - tx) ** 2 + (z - tz) ** 2; if (!best || d < best.d) best = { d, x, z, h: Math.atan2(P[i + 3] - P[i], P[i + 4] - P[i + 1]) }; } }
    if (!best) { g.ui.toast('Fant ingen vei i nærheten av ' + p.name, true); return; }
    const h = Math.cos(best.h) * r.fw.z + Math.sin(best.h) * r.fw.x < 0 ? best.h + Math.PI : best.h;
    g.courses.stop(); g.ui.course(null); g.car.place(g.world, best.x, best.z, h);
    if (isl !== here) { g.prof.nuts -= 5; g.saveProf(); g.dockFerry(isl); g.afterIslandChange(); }
    g.cam.snap = true; g.ui.toast('Du er hos ' + p.name + (isl !== here ? ' · −5 ⚙' : ''));
    if (g.mode === 'menu') g.play(); else g.resume();
  }

  // ---------------------------------------------------------------- the HUD, the minimap and the map
  hud() {
    const el = $('hNet'), R = this.room, hc = $('hCourse'); if (!el) return;
    el.hidden = !R.inRoom; if (hc) hc.style.top = '';
    if (!R.inRoom) return;
    const me = this.g.focus().pos, rows = [...R.players.values()].sort((a, b) => a.slot - b.slot).map(p => {
      const r = this.remotes.get(p.id), w = r && r.shown ? DOING[r.act] || dist(Math.hypot(r.pos.x - me.x, r.pos.z - me.z)) : '…';
      return `<div class="nr"><i style="background:${this.color(p.slot)}"></i><span>${p.name}</span><small>${w}</small></div>`;
    });
    el.innerHTML = `<div class="nc">ROM ${R.code}</div>` + (rows.join('') || '<div class="nr"><small style="margin:0;padding:0">Venter på andre …</small></div>');
    // a course panel sits where the list grows: move it down
    if (hc && !hc.hidden) hc.style.top = Math.max(110, el.getBoundingClientRect().bottom + 8) + 'px';
  }
  // ui.drawMini calls this inside the round minimap: M(x, z) → pixels; players outside it sit on the rim
  drawMini(x, M, S) {
    if (!this.room.inRoom) return; const c = S / 2, rim = S / 2 - 8;
    for (const [id, r] of this.remotes) {
      const p = this.room.players.get(id); if (!p || !r.shown) continue;
      const [X0, Z0] = M(r.pos.x, r.pos.z), [X1, Z1] = M(r.pos.x + r.fw.x * 20, r.pos.z + r.fw.z * 20), dx = X0 - c, dz = Z0 - c, d = Math.hypot(dx, dz);
      x.save(); x.fillStyle = this.color(p.slot); x.strokeStyle = '#14120e'; x.lineWidth = 2;
      if (d > rim) { x.translate(c + dx / d * rim, c + dz / d * rim); x.beginPath(); x.arc(0, 0, 5, 0, 7); x.fill(); x.stroke(); }
      else { x.translate(X0, Z0); x.rotate(Math.atan2(Z1 - Z0, X1 - X0) + Math.PI / 2); x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 6); x.lineTo(0, 3); x.lineTo(-6, 6); x.closePath(); x.stroke(); x.fill(); }
      x.restore();
    }
  }
  // ui.drawMap calls this on the big map: P(x, z) → pixels; tab 'island' or 'arch'
  drawMap(x, P, tab) {
    if (!this.room.inRoom) return; const s = tab === 'arch' ? 6 : 9;
    x.save(); x.textAlign = 'center'; x.textBaseline = 'bottom'; x.font = '700 ' + (tab === 'arch' ? 15 : 18) + 'px "Barlow Condensed", sans-serif';
    for (const [id, r] of this.remotes) {
      const p = this.room.players.get(id); if (!p || !r.pos) continue; const [X, Z] = P(r.pos.x, r.pos.z);
      x.fillStyle = this.color(p.slot); x.strokeStyle = '#14120e'; x.lineWidth = 2; x.beginPath(); x.arc(X, Z, s, 0, 7); x.fill(); x.stroke();
      x.lineWidth = 4; x.strokeStyle = 'rgba(20,18,14,.85)'; x.strokeText(p.name, X, Z - s - 3); x.fillStyle = '#fff8e0'; x.fillText(p.name, X, Z - s - 3);
    }
    x.restore();
  }
}
