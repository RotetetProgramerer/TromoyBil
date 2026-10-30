// Menus, the garage, settings, the map, results and the HUD (speedometer with rev counter, minimap, course panel, toasts).
import { CARS } from './data/cars.js';
import { PARTS, TYRE_SHOP, PAINTS } from './data/parts.js';
import { TYRES } from './physics/surfaces.js';
import { QUALITY } from './render/gfx.js';
import { fmtTime } from './courses.js';
import { COVER } from './world/island.js';

const $ = id => document.getElementById(id);
const fmtN = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const DIFFCOL = ['#8bbb4a', '#8bbb4a', '#f2c230', '#d9432f'];
// map colours per land cover class
const MAPCOL = [];
const C = COVER;
Object.entries({ SEA: '#24496a', BEACH: '#d6c69a', ROCK: '#8c877d', FOREST: '#3c5e34', MIXED: '#4a6a3a', DECID: '#5a7a40', HEATH: '#7a7a4a', GRASS: '#86a35a', FARM: '#a8b66a',
  GARDEN: '#9aac7a', URBAN: '#9a958c', BOG: '#6a6a48', LAKE: '#3a6a8e', GRAVEL: '#b0a690', STREAM: '#3a6a8e', SNOW: '#eef2f4', ASH: '#3a3532', LAVA: '#c8461a', JUNGLE: '#2a5a2a', SAVANNA: '#b8a058', MUD: '#5a4630', DIRT: '#8a6a48' })
  .forEach(([k, v]) => MAPCOL[C[k]] = v);

export class UI {
  constructor(game) {
    this.g = game; this.toastT = 0; this.open = null; this.tab = 'cars'; this.mapTab = 'island'; this.mapCache = new Map();
    document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => this.back());
    $('mDrive').onclick = () => { this.g.snd.unlock(); this.g.play(); };
    $('mPrev').onclick = () => this.pickCar(-1); $('mNext').onclick = () => this.pickCar(1);
    $('mCourses').onclick = () => this.show('courses'); $('mGarage').onclick = () => this.show('garage'); $('mMap').onclick = () => this.show('map'); $('mSettings').onclick = () => this.show('settings');
    $('mNet').onclick = () => this.g.net ? this.g.net.dialog() : this.toast('Flerspiller kommer snart');
    $('gDrive').onclick = () => this.g.play();
    document.querySelectorAll('#garage [data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab; document.querySelectorAll('#garage [data-tab]').forEach(x => x.classList.toggle('on', x === b)); this.garage(); });
    document.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => { this.mapTab = b.dataset.mtab; document.querySelectorAll('[data-mtab]').forEach(x => x.classList.toggle('on', x === b)); this.drawMap(); });
    $('pResume').onclick = () => this.g.resume(); $('pReset').onclick = () => { this.g.resume(); if (this.g.act) this.g.act.reset(); else this.g.recover(); }; $('pAbort').onclick = () => { this.g.courses.stop(); this.course(null); this.g.resume(); };
    $('pMap').onclick = () => this.show('map', 'pause'); $('pGarage').onclick = () => this.show('garage', 'pause'); $('pSettings').onclick = () => this.show('settings', 'pause'); $('pMenu').onclick = () => this.g.toMenu();
    $('rAgain').onclick = () => { this.hide(); this.g.mode = 'drive'; this.g.courses.start(this.lastResult.c); };
    $('rDone').onclick = () => { this.hide(); this.g.mode = 'drive'; };
    $('mapHome').onclick = () => this.g.towHome();
    // a tap on the map picks a spot; «Sett bilen der» puts the car on the nearest road there
    $('mapCanvas').addEventListener('pointerdown', e => this.mapPick(e));
    $('mapGo').onclick = () => { const s = this.pick && this.g.landingSpot(this.pick.x, this.pick.z); this.pick = null; this.g.placeAt(s); };
    // the save: every sim:* key in localStorage, as a file to download and to read back
    $('sSave').onclick = () => {
      const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('sim:')) o[k] = localStorage.getItem(k); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ game: 'tromoybil', v: 1, saved: new Date().toISOString(), data: o })], { type: 'application/json' }));
      a.download = 'tromoybil-lagring.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    $('sLoad').onclick = () => {
      const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
      f.onchange = async () => { try { const j = JSON.parse(await f.files[0].text()); if (j.game !== 'tromoybil' || !j.data) throw 0; for (const [k, v] of Object.entries(j.data)) if (k.startsWith('sim:')) localStorage.setItem(k, v); location.reload(); } catch (e) { this.toast('Kunne ikke lese lagringen', true); } };
      f.click();
    };
    $('sWipe').onclick = () => { if (!confirm('Slette alle muttere, biler, deler og bestetider?')) return; for (const k of Object.keys(localStorage)) if (k.startsWith('sim:') && k !== 'sim:quality') localStorage.removeItem(k); location.reload(); };
    this.settings();
    this.speedo = $('speedo').getContext('2d'); this.mini = $('minimap').getContext('2d');
    if (matchMedia('(pointer:coarse)').matches) document.body.classList.add('is-touch');
    addEventListener('touchstart', () => document.body.classList.add('is-touch'), { once: true, passive: true });
  }
  // ---------------------------------------------------------------- overlays
  show(id, from) {
    for (const o of document.querySelectorAll('.overlay')) o.hidden = true;
    this.from = from || (this.open && this.open !== id ? this.open : this.from); this.open = id; $(id).hidden = false;
    if (id === 'pause') $('pGarage').hidden = !!this.g.act;
    if (id === 'map') this.pick = null;
    if (id === 'menu') this.menu(); if (id === 'garage') this.garage(); if (id === 'courses') this.courseList(); if (id === 'map') this.drawMap(); if (id === 'settings') this.settings();
    $('hud').hidden = id === 'menu' || id === 'garage';
  }
  hide() { for (const o of document.querySelectorAll('.overlay')) o.hidden = true; this.open = null; $('hud').hidden = false; }
  back() { const f = this.from; this.from = null; if (f) this.show(f); else if (this.g.mode === 'menu') this.show('menu'); else { this.hide(); this.g.resume(); } }
  toast(t, bad) { const el = $('toast'); el.textContent = t; el.classList.add('on'); el.classList.toggle('bad', !!bad); this.toastT = 2.6; }
  countdown(v) { const el = $('count'); el.hidden = v == null; if (v != null) el.textContent = v; }
  // ---------------------------------------------------------------- main menu
  menu() {
    const g = this.g, s = g.car.spec;
    $('mNuts').textContent = fmtN(g.prof.nuts); $('mStars').textContent = '★ ' + Object.values(g.best).reduce((a, b) => a + (b.s || 0), 0);
    $('mCar').textContent = s.name; $('mCarKind').textContent = s.kind + (g.owns(s) ? '' : ' · ' + fmtN(s.price) + ' ⚙'); $('mCarDesc').textContent = s.desc;
  }
  pickCar(d) {
    const g = this.g, i = CARS.findIndex(c => c.id === g.car.spec.id); let j = i;
    for (let k = 0; k < CARS.length; k++) { j = (j + d + CARS.length) % CARS.length; if (g.owns(CARS[j])) break; }
    g.setCar(CARS[j].id).then(() => this.menu());
  }
  // ---------------------------------------------------------------- courses list
  courseList() {
    const g = this.g, isl = g.island(), L = g.courses.forIsland(isl); $('crIsland').textContent = isl.name;
    $('crList').innerHTML = L.map((c, i) => { const b = g.best[c.key]; return `<button class="item" data-i="${i}"><div><b><span class="diff" style="background:${DIFFCOL[c.diff]}"></span>${c.name}</b><small>${c.desc}</small></div><span class="price">${b ? '★'.repeat(b.s) + ' ' + fmtTime(b.t) : (c.len / 1000).toFixed(1).replace('.', ',') + ' km'}</span></button>`; }).join('') || '<p class="note">Ingen løyper her ennå.</p>';
    $('crList').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { this.hide(); g.mode = 'drive'; g.courses.start(L[+b.dataset.i]); });
  }
  // ---------------------------------------------------------------- garage
  garage() {
    const g = this.g, s = g.car.spec, P = g.prof, own = g.owns(s);
    $('gNuts').textContent = fmtN(P.nuts); $('gCar').textContent = s.name; $('gCarDesc').textContent = s.desc;
    const kw = Math.round(Math.max(...s.engine.torque.map(([r, t]) => r * t / 9549)));
    $('gSpecs').innerHTML = [['Lengde', s.dims.L.toFixed(2).replace('.', ',') + ' m'], ['Vekt', fmtN(s.mass) + ' kg'], ['Effekt', kw + ' kW (' + Math.round(kw * 1.36) + ' hk)'], ['Dreiemoment', Math.max(...s.engine.torque.map(t => t[1])) + ' Nm'],
      ['Girkasse', s.gearbox.ratios.length + ' gir' + (s.drive.low ? ' + lavserie' : '')], ['Drift', s.drive.layout === 'AWD' ? 'Firehjulstrekk' : s.drive.layout === 'RWD' ? 'Bakhjulstrekk' : 'Forhjulstrekk'], ['Bakkeklaring', Math.round(s.clear * 100) + ' cm'], ['Vadedybde', Math.round(g.car.wade * 100) + ' cm']]
      .map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
    const L = $('gList'); let h = '';
    if (this.tab === 'cars') for (const c of CARS) { const o = g.owns(c); h += `<button class="item${c.id === s.id ? ' on' : ''}" data-car="${c.id}"><div><b>${c.name}</b><small>${c.kind}</small></div><span class="price${o ? ' own' : ''}">${o ? (c.id === s.id ? 'Kjører' : 'Din') : fmtN(c.price) + ' ⚙'}</span></button>`; }
    else if (this.tab === 'parts') for (const p of PARTS) {
      const lv = g.parts()[p.id] || 0, next = lv + 1;
      h += `<div class="item"><div><b>${p.name}: ${p.lv[lv]}</b><small>${p.desc}</small></div>${next < p.lv.length ? `<button class="ghost sm" data-part="${p.id}" style="font-size:16px">${p.lv[next]}<br>${fmtN(p.price[next])} ⚙</button>` : '<span class="price own">Fullt</span>'}</div>`;
    }
    else if (this.tab === 'tyres') for (const t of TYRE_SHOP) { const on = g.car.tyre === t.id, has = (P.tyresOwned[s.id] || []).includes(t.id) || t.id === s.tyre;
      h += `<button class="item${on ? ' on' : ''}" data-tyre="${t.id}"><div><b>${TYRES[t.id].name}</b><small>${t.desc}</small></div><span class="price${has ? ' own' : ''}">${on ? 'På bilen' : has ? 'Bytt' : fmtN(t.price) + ' ⚙'}</span></button>`; }
    else PAINTS.forEach((p, i) => { const has = !p.p || P.paints.includes(i), locked = p.locked && !P.gold, on = (P.paint[s.id] || 0) === i;
      h += `<button class="item${on ? ' on' : ''}" data-paint="${i}" ${locked ? 'disabled' : ''}><span class="sw" style="background:${p.c || s.col}"></span><div style="flex:1"><b>${p.n}</b></div><span class="price${has ? ' own' : ''}">${locked ? 'Låst' : on ? 'På bilen' : has ? 'Velg' : fmtN(p.p) + ' ⚙'}</span></button>`; });
    L.innerHTML = h;
    L.querySelectorAll('[data-car]').forEach(b => b.onclick = () => g.buyCar(b.dataset.car).then(() => this.garage()));
    L.querySelectorAll('[data-part]').forEach(b => b.onclick = () => { g.buyPart(b.dataset.part); this.garage(); });
    L.querySelectorAll('[data-tyre]').forEach(b => b.onclick = () => { g.buyTyre(b.dataset.tyre); this.garage(); });
    L.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { g.buyPaint(+b.dataset.paint); this.garage(); });
    $('gDrive').disabled = !own; $('gDrive').textContent = own ? 'Kjør!' : 'Kjøp bilen for å kjøre den';
  }
  // ---------------------------------------------------------------- settings
  settings() {
    const g = this.g, S = g.settings;
    const seg = (id, val, opts, set) => { const el = $(id); if (opts) el.innerHTML = opts.map(([v, n]) => `<button data-v="${v}">${n}</button>`).join(''); el.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === val); b.onclick = () => { set(b.dataset.v); this.settings(); }; }); };
    seg('sQuality', S.quality, Object.entries(QUALITY).map(([k, v]) => [k, v.name]), v => g.set('quality', v));
    seg('sMode', S.mode, null, v => g.set('mode', v)); seg('sGear', S.gear, null, v => g.set('gear', v)); seg('sTime', S.time, null, v => g.set('time', v)); seg('sWeather', S.weather, null, v => g.set('weather', v)); seg('sTilt', S.tilt, null, v => g.set('tilt', v));
    $('sModeNote').textContent = S.mode === 'lett' ? 'Lett: ABS, antispinn, stabilisering og styrehjelp er på, og bilen settes på hjulene igjen av seg selv.' : 'Ekte: ingen hjelp. Bremser du for hardt, låser hjulene, og gir du for mye gass, spinner bilen.';
    for (const [id, k] of [['vMaster', 'master'], ['vCar', 'car'], ['vAmb', 'ambient']]) { const el = $(id); el.value = S.vol[k] * 100; $(id + 'O').textContent = Math.round(S.vol[k] * 100) + ' %'; el.oninput = () => { S.vol[k] = el.value / 100; $(id + 'O').textContent = el.value + ' %'; g.set('vol', S.vol); }; }
  }
  // ---------------------------------------------------------------- course HUD and results
  course(c, a) { $('hCourse').hidden = !c; if (!c) return; $('cName').textContent = c.name; const b = this.g.best[c.key]; $('cBest').textContent = b ? fmtTime(b.t) : '–'; $('cSplit').textContent = ''; $('pAbort').hidden = false; }
  split(d) { const el = $('cSplit'); if (d == null) { el.textContent = ''; return; } el.textContent = (d < 0 ? '−' : '+') + fmtTime(Math.abs(d)).replace(/^0:/, ''); el.className = 'split ' + (d < 0 ? 'ahead' : 'behind'); }
  result(r) {
    this.lastResult = r; this.course(null); $('pAbort').hidden = true;
    $('rKind').textContent = 'Løype fullført'; $('rName').textContent = r.c.name; $('rStars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    $('rList').innerHTML = [['Tid', fmtTime(r.t)], r.old ? ['Beste før', fmtTime(r.old)] : null, ['Tre stjerner', fmtTime(r.par[0])], ['To stjerner', fmtTime(r.par[1])], ['Muttere', '+' + r.nuts + ' ⚙'], r.rec ? ['', r.first ? 'Første gang!' : 'Ny rekord!'] : null]
      .filter(Boolean).map(([a, b]) => `<li><span>${a}</span><b>${b}</b></li>`).join('');
    this.g.mode = 'result'; this.show('result');
  }
  ask(title, text, items, cb) {
    $('aTitle').textContent = title; $('aText').textContent = text; const L = $('aList');
    L.innerHTML = (items || []).map((it, i) => `<button class="item" data-i="${i}"><div><b>${it.name}</b><small>${it.sub || ''}</small></div><span class="price">${it.price || ''}</span></button>`).join('');
    L.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { this.hide(); cb(items[+b.dataset.i]); });
    $('aYes').hidden = !!(items && items.length); $('aYes').onclick = () => { this.hide(); cb(true); }; $('aNo').onclick = () => { this.hide(); cb(false); };
    this.show('ask');
  }
  // ---------------------------------------------------------------- the big map
  islandImage(isl) {
    if (this.mapCache.has(isl)) return this.mapCache.get(isl);
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'), img = x.createImageData(S, S);
    const w = isl.x1 - isl.x0, hgt = isl.z1 - isl.z0, sc = Math.max(w, hgt) / S;
    const rgb = MAPCOL.map(h => h ? [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] : [128, 128, 128]);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const wx = isl.x0 + i * sc, wz = isl.z0 + j * sc, lx = wx - isl.ox, lz = wz - isl.oz, c = isl.cover.nearest(lx, lz), col = rgb[c] || rgb[0];
      const h0 = isl.grid.bilinear(lx, lz), hx = isl.grid.bilinear(lx + sc, lz), hz = isl.grid.bilinear(lx, lz + sc);
      const sh = c === C.SEA || c === C.LAKE ? 1 + Math.max(-0.25, h0 * 0.006) : Math.max(0.65, Math.min(1.3, 1 + ((h0 - hx) * 0.8 + (h0 - hz) * 0.6) / sc * 1.4));
      const k = (j * S + i) * 4; img.data[k] = col[0] * sh; img.data[k + 1] = col[1] * sh; img.data[k + 2] = col[2] * sh; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // roads: wide and light for main roads, thin and dashed for tracks and paths
    const tx = v => (v + isl.ox - isl.x0) / sc, tz = v => (v + isl.oz - isl.z0) / sc;
    for (const pass of [0, 1]) for (const r of isl.roads.roads) {
      if (pass === 0 && r.c > 5) continue; if (pass === 1 && r.c <= 5) continue;
      x.strokeStyle = r.c <= 2 ? '#f2e2b0' : r.c <= 4 ? '#ece6d8' : r.c === 5 ? '#d8d0c0' : '#e8d8b0'; x.lineWidth = r.c <= 2 ? 2.6 : r.c <= 4 ? 1.7 : 1.1; x.setLineDash(r.c >= 6 ? [3, 3] : []);
      x.beginPath(); for (let i = 0; i < r.p.length; i += 9) { const X = tx(r.p[i]), Z = tz(r.p[i + 1]); i ? x.lineTo(X, Z) : x.moveTo(X, Z); } x.lineTo(tx(r.p[r.p.length - 3]), tz(r.p[r.p.length - 2])); x.stroke();
    }
    x.setLineDash([]); x.fillStyle = 'rgba(60,40,30,.85)';
    for (const b of isl.buildings) { const o = b.obb; x.save(); x.translate(tx(o.x), tz(o.z)); x.rotate(-o.ang); x.fillRect(-o.hw / sc, -o.hd / sc, Math.max(1, 2 * o.hw / sc), Math.max(1, 2 * o.hd / sc)); x.restore(); }
    x.font = '600 15px "Barlow Condensed", sans-serif'; x.textAlign = 'center';
    for (const l of isl.feat.labels || []) { if (!['island', 'beach', 'bay', 'peak', 'hill', 'water', 'town', 'ferry', 'recreation_ground', 'strait'].includes(l.t)) continue; const X = tx(l.x), Z = tz(l.z); if (X < 0 || Z < 0 || X > S || Z > S) continue;
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillText(l.n, X + 1, Z + 1); x.fillStyle = l.t === 'water' || l.t === 'bay' || l.t === 'strait' ? '#cfe6ff' : '#fff8e0'; x.fillText(l.n, X, Z); }
    const res = { cv, sc, x0: isl.x0, z0: isl.z0 }; this.mapCache.set(isl, res); return res;
  }
  // the map's projections: canvas ↔ world, for the island tab (the island the car is on) and the archipelago tab
  mapProj() {
    const cv = $('mapCanvas'), S = cv.width;
    if (this.mapTab === 'island') { const im = this.islandImage(this.g.island()), k = S / im.cv.width; return { P: (wx, wz) => [(wx - im.x0) / im.sc * k, (wz - im.z0) / im.sc * k], W: (X, Z) => [im.x0 + X / k * im.sc, im.z0 + Z / k * im.sc] }; }
    const R = 24000, k = S / (2 * R); return { P: (wx, wz) => [(wx + R) * k, (wz + R) * k], W: (X, Z) => [X / k - R, Z / k - R] };
  }
  mapPick(e) {
    const cv = $('mapCanvas'), r = cv.getBoundingClientRect(), X = (e.clientX - r.left) / r.width * cv.width, Z = (e.clientY - r.top) / r.height * cv.height;
    const [wx, wz] = this.mapProj().W(X, Z); this.pick = { x: wx, z: wz }; this.drawMap();
  }
  drawMap() {
    const g = this.g, cv = $('mapCanvas'), x = cv.getContext('2d'), S = cv.width; x.clearRect(0, 0, S, S);
    const F = g.focus(), car = F.pos;          // the car, or the boat / plane / skier while an activity runs
    if (this.mapTab === 'island') {
      const isl = g.island(), im = this.islandImage(isl); x.drawImage(im.cv, 0, 0, S, S);
      const { P } = this.mapProj();
      for (const c of g.courses.forIsland(isl)) { const [X, Z] = P(c.start.x, c.start.z); x.fillStyle = DIFFCOL[c.diff]; x.beginPath(); x.arc(X, Z, 7, 0, 7); x.fill(); x.strokeStyle = '#14120e'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#fff'; x.font = '700 14px "Barlow Condensed"'; x.fillText(c.name, X, Z - 11); }
      for (const p of g.pois(isl)) { const [X, Z] = P(p.x, p.z); x.fillStyle = '#e5a92b'; x.fillRect(X - 6, Z - 6, 12, 12); x.fillStyle = '#fff'; x.font = '700 15px "Barlow Condensed"'; x.fillText(p.name, X, Z + 22); }
      if (g.net) g.net.drawMap(x, P, 'island');
      const [X, Z] = P(car.x, car.z), h = Math.atan2(F.fw.x, F.fw.z);
      x.save(); x.translate(X, Z); x.rotate(-h + Math.PI); x.fillStyle = '#ff4a2a'; x.beginPath(); x.moveTo(0, -12); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.fill(); x.restore();
      $('mapNote').textContent = 'Kjør til ferjekaia, eller ta ferja herfra for 5 muttere.';
    } else {
      // the archipelago: every island at its place in the world
      const R = 24000, k = S / (2 * R), { P } = this.mapProj();
      x.fillStyle = '#1d3a52'; x.fillRect(0, 0, S, S);
      for (const isl of [...g.world.islands].reverse()) { const im = this.islandImage(isl), [X0, Z0] = P(im.x0, im.z0); x.drawImage(im.cv, X0, Z0, im.cv.width * im.sc * k, im.cv.height * im.sc * k); }
      x.font = '700 20px "Barlow Condensed"'; x.textAlign = 'center';
      for (const isl of g.world.islands) { if (isl.def.backdrop) continue; const [X, Z] = P((isl.x0 + isl.x1) / 2, (isl.z0 + isl.z1) / 2); x.fillStyle = 'rgba(0,0,0,.6)'; x.fillText(isl.name, X + 1, Z + 1); x.fillStyle = '#fff8e0'; x.fillText(isl.name, X, Z); }
      if (g.net) g.net.drawMap(x, P, 'arch');
      const [X, Z] = P(car.x, car.z); x.fillStyle = '#ff4a2a'; x.beginPath(); x.arc(X, Z, 6, 0, 7); x.fill();
    }
    // the picked spot: a ring where the tap was, a dot where the car would land (the nearest road), and the button
    const go = $('mapGo'), pk = this.pick, spot = pk && g.landingSpot(pk.x, pk.z);
    go.hidden = !pk;
    if (pk) {
      const { P } = this.mapProj(), [X, Z] = P(pk.x, pk.z);
      x.strokeStyle = spot ? '#fff8e0' : '#d9432f'; x.lineWidth = 3; x.beginPath(); x.arc(X, Z, 11, 0, 7); x.stroke();
      if (spot) { const [sx, sz] = P(spot.x, spot.z); x.strokeStyle = 'rgba(255,248,224,.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(X, Z); x.lineTo(sx, sz); x.stroke(); x.fillStyle = '#e5a92b'; x.beginPath(); x.arc(sx, sz, 6, 0, 7); x.fill(); }
      go.disabled = !spot; go.textContent = spot ? 'Sett bilen der · ' + g.placeNameAt(spot.x, spot.z) + (spot.road ? '' : ' (utenfor vei)') : 'Der er det bare sjø';
    }
    // the ferry list
    const dest = g.ferryDestinations();
    $('ferryList').innerHTML = dest.map((d, i) => `<button class="item" data-i="${i}"><div><b>${d.name}</b><small>${d.sub}</small></div><span class="price">5 ⚙</span></button>`).join('') || '<p class="note">Ingen andre øyer har ferjekai ennå.</p>';
    $('ferryList').querySelectorAll('[data-i]').forEach(b => b.onclick = () => g.takeFerry(dest[+b.dataset.i]));
  }
  // ---------------------------------------------------------------- HUD
  update(dt) {
    const g = this.g;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on'); }
    if (g.act) {
      // a boat, a plane or skis: they draw their own instruments; the place, the nuts and the minimap stay
      this.hudT = (this.hudT || 0) - dt; if (this.hudT > 0) return; this.hudT = 0.1;
      $('hNuts').textContent = fmtN(g.prof.nuts); $('hPlace').textContent = g.placeName(); $('hRoad').textContent = g.act.where || '';
      this.drawMini(g.focus()); return;
    }
    const car = g.car;
    this.drawSpeedo(car);
    const st = car.state;
    $('lAbs').className = st.absOn ? 'on' : ''; $('lTcs').className = st.tcsOn ? 'on' : ''; $('lEsp').className = st.espOn ? 'on' : ''; $('lLow').className = st.low ? 'on' : ''; $('lLight').className = g.vis.lights ? 'on' : '';
    this.hudT = (this.hudT || 0) - dt; if (this.hudT > 0) return; this.hudT = 0.1;
    $('hNuts').textContent = fmtN(g.prof.nuts);
    const isl = g.island(), q = g.world.road(car.pos.x, car.pos.z), r = q && isl ? isl.roads.roads[q.road] : null;
    $('hPlace').textContent = g.placeName(); $('hRoad').textContent = r && q.d < q.hw + 2 ? (r.n || ['Motorvei', 'Riksvei', 'Fylkesvei', 'Fylkesvei', 'Kommunal vei', 'Privat vei', 'Traktorvei', 'Sti'][r.c]) : 'Utenfor veien';
    const a = g.courses.active; if (a) { $('cTime').textContent = fmtTime(a.t); $('cGate').textContent = a.gi + '/' + a.c.gates.length; }
    this.drawMini(car);
  }
  drawSpeedo(car) {
    const x = this.speedo, S = 220, cx = S / 2, cy = S / 2, R = 96; x.clearRect(0, 0, S, S);
    const vmax = car.spec.vmax || 0, top = Math.min(340, vmax || 0) || [160, 200, 260, 340].find(v => v > car.spec.engine.redline / 60 * 2 * Math.PI * car.spec.wheel.rR / (car.gb.ratios[car.gb.ratios.length - 1] * car.gb.final) * 3.6 * 0.9) || 340;
    const vtop = Math.max(top, 140), a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, A = v => a0 + (a1 - a0) * Math.min(1, v / vtop);
    x.fillStyle = 'rgba(14,13,10,.78)'; x.beginPath(); x.arc(cx, cy, R + 10, 0, 7); x.fill();
    // rev counter: the inner arc, red above the redline
    const red = car.eng.red * 60 / (2 * Math.PI), lim = car.eng.lim * 60 / (2 * Math.PI), rmax = Math.ceil(lim / 1000) * 1000, ra = r => a0 + (a1 - a0) * Math.min(1, r / rmax);
    x.lineWidth = 8; x.strokeStyle = 'rgba(242,232,208,.12)'; x.beginPath(); x.arc(cx, cy, R - 22, a0, a1); x.stroke();
    x.strokeStyle = 'rgba(217,67,47,.55)'; x.beginPath(); x.arc(cx, cy, R - 22, ra(red), a1); x.stroke();
    const rpm = car.rpm; x.strokeStyle = rpm > red ? '#d9432f' : '#e5a92b'; x.beginPath(); x.arc(cx, cy, R - 22, a0, ra(rpm)); x.stroke();
    // speed ticks and numbers
    x.strokeStyle = 'rgba(242,232,208,.8)'; x.fillStyle = 'rgba(242,232,208,.85)'; x.font = '600 13px "Barlow Condensed"'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const step = vtop > 220 ? 40 : 20;
    for (let v = 0; v <= vtop + 0.1; v += step / 2) { const a = A(v), big = v % step === 0; x.lineWidth = big ? 2.2 : 1; x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - (big ? 9 : 5)), cy + Math.sin(a) * (R - (big ? 9 : 5))); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke(); if (big) x.fillText(v, cx + Math.cos(a) * (R - 36), cy + Math.sin(a) * (R - 36)); }
    const kmh = car.kmh, a = A(kmh);
    x.strokeStyle = '#ff5a2a'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); x.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); x.stroke();
    x.fillStyle = '#2a261e'; x.beginPath(); x.arc(cx, cy, 10, 0, 7); x.fill();
    x.fillStyle = '#f2e8d0'; x.font = '700 34px "Barlow Condensed"'; x.fillText(Math.round(kmh), cx, cy + 46); x.font = '500 13px "Barlow Condensed"'; x.fillStyle = 'rgba(242,232,208,.6)'; x.fillText('km/t', cx, cy + 66);
    x.font = '700 26px "Barlow Condensed"'; x.fillStyle = '#e5a92b'; x.fillText(car.gearName + (car.state.low ? 'L' : ''), cx, cy - 34);
  }
  drawMini(car) {
    const x = this.mini, S = 220, isl = this.g.island(); if (!isl) return;
    const R = 260 + Math.min(500, car.kmh * 4), k = S / 2 / R, h = Math.atan2(car.fw.x, car.fw.z), cs = Math.cos(h), sn = Math.sin(h);
    // to the minimap: rotate so the car points up
    const M = (wx, wz) => { const dx = wx - car.pos.x, dz = wz - car.pos.z; return [S / 2 - (dx * cs - dz * sn) * k, S / 2 - (dx * sn + dz * cs) * k]; };
    x.save(); x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, 7); x.clip();
    const N = 36, cell = 2 * R / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      // the screen cell back to the world: b to the left of the car, a ahead of it
      const b = (N / 2 - i - 0.5) * cell, a = (N / 2 - j - 0.5) * cell, lx = car.pos.x + a * sn + b * cs, lz = car.pos.z + a * cs - b * sn;
      const I = this.g.world.islandAt(lx, lz), c = I ? I.cover.nearest(lx - I.ox, lz - I.oz) : 0;
      x.fillStyle = MAPCOL[c] || '#24496a'; x.fillRect(i * S / N, j * S / N, S / N + 1, S / N + 1);
    }
    x.strokeStyle = '#efe6d2'; x.lineCap = 'round';
    const roads = isl.roads, cellSize = 24, lx0 = car.pos.x - isl.ox, lz0 = car.pos.z - isl.oz, n = Math.ceil(R / cellSize), seen = new Set();
    for (let cj = -n; cj <= n; cj += 2) for (let ci = -n; ci <= n; ci += 2) {
      const L = roads.cells.get(Math.floor(lx0 / cellSize + ci) * 73856093 ^ Math.floor(lz0 / cellSize + cj) * 19349663); if (!L) continue;
      for (const sIdx of L) { if (seen.has(sIdx)) continue; seen.add(sIdx); const F = roads.seg.F, o = sIdx * 6, c = roads.seg.M[sIdx * 3 + 1];
        x.lineWidth = c <= 2 ? 3.2 : c <= 4 ? 2.2 : 1.3; x.strokeStyle = c >= 6 ? 'rgba(239,230,210,.6)' : '#efe6d2';
        const [a1, b1] = M(F[o] + isl.ox, F[o + 1] + isl.oz), [a2, b2] = M(F[o + 3] + isl.ox, F[o + 4] + isl.oz); x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke(); }
    }
    // the course: route and the next gate
    const a = this.g.courses.active;
    if (a) { x.strokeStyle = 'rgba(229,169,43,.9)'; x.lineWidth = 3; x.beginPath(); a.c.line.forEach((p, i) => { const [X, Z] = M(p[0], p[1]); i ? x.lineTo(X, Z) : x.moveTo(X, Z); }); x.stroke();
      const gp = a.c.gates[Math.min(a.gi, a.c.gates.length - 1)], [X, Z] = M(gp[0], gp[1]); x.fillStyle = '#e5a92b'; x.beginPath(); x.arc(X, Z, 6, 0, 7); x.fill(); }
    else for (const c of this.g.courses.forIsland(isl)) { const [X, Z] = M(c.start.x, c.start.z); x.fillStyle = DIFFCOL[c.diff]; x.beginPath(); x.arc(X, Z, 5, 0, 7); x.fill(); }
    if (this.g.net) this.g.net.drawMini(x, M, S);   // the others in the room
    x.restore();
    x.fillStyle = '#ff5a2a'; x.beginPath(); x.moveTo(S / 2, S / 2 - 9); x.lineTo(S / 2 + 6, S / 2 + 7); x.lineTo(S / 2, S / 2 + 3); x.lineTo(S / 2 - 6, S / 2 + 7); x.closePath(); x.fill();
    // north arrow on the rim
    x.fillStyle = '#fff'; x.font = '700 14px "Barlow Condensed"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('N', S / 2 - sn * (S / 2 - 12), S / 2 + cs * (S / 2 - 12));
  }
}
