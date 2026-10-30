// Dyrene på øyene (sim/life) uten nettleser.
//   node tools/test-animals.mjs [øy,øy,…]
// 1) Fødsel: spawneren kjøres på mange punkter på hver øy. Hvert dyr må være av en art som hører til øyas biom, født på riktig
//    marktype (eller i vann for de som svømmer, i et tre for de som bor der), ikke i et hus, ikke på veien, og under budsjettet.
// 2) Livet: en bil kjører langs veiene i noen simulerte minutter; dyrene må holde seg på gyldig grunn (land på land, i vann i vann,
//    fugler over bakken), ingen NaN, og oppdateringen må koste lite per bilde.
// 3) Elgen: bilen kjører på en elg på veien i 70 km/t (et ekte sammenstøt med bilfysikken): elgen velter, bilen mister fart, men står
//    ikke bom stille. En sau: bilen merker den knapt.
// 4) Løven: en bil som står stille nær flokken blir angrepet (bilen kastes til siden, og det koster muttere).
// 5) Elg i veien: hendelsen som setter en elg ut i veien et stykke foran bilen finner et sted på en skogsvei.
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { COVER } from '../sim/world/island.js';
import { Vehicle } from '../sim/physics/vehicle.js';
import { CARS } from '../sim/data/cars.js';
import { Life } from '../sim/life/life.js';
import { SPECIES, BIOME, BY_ID } from '../sim/life/species.js';
import { mulberry32 } from '../sim/world/grid.js';

const only = process.argv[2] ? process.argv[2].split(',') : null;
const world = new World();
for (const d of WORLD.islands) await world.addIsland('world/', d);
const CN = Object.fromEntries(Object.entries(COVER).map(([k, v]) => [v, k]));
let fails = 0; const bad = m => { fails++; if (fails < 60) console.log('   FEIL: ' + m); };
const R = mulberry32(12345);
Math.random = mulberry32(777);         // the animals' own whims too: the same run every time

// is this animal where it may be? (the same rules for the newborn and the living, except the newborn's land cover)
function check(a, born, where) {
  const sp = a.sp, isl = a.isl, x = a.x, z = a.z;
  if (![x, a.y, z, a.h].every(Number.isFinite)) return bad(`${where}: ${sp.id} har NaN (${x}, ${a.y}, ${z})`);
  if (!isl.inside(x, z)) return bad(`${where}: ${sp.id} utenfor øya ${isl.id}`);
  const ter = isl.terrain(x, z), wl = isl.water(x, z), dep = wl - ter, c = isl.coverAt(x, z), lx = x - isl.ox, lz = z - isl.oz;
  const flying = ['fly', 'land', 'jump'].includes(a.st) || sp.type === 'soar' || sp.type === 'flutter', perched = !!a.perch && (a.st === 'perch' || a.st === 'sit');
  if (flying) { if (a.y < Math.max(ter, wl) - 0.5) bad(`${where}: ${sp.id} flyr under bakken (${(a.y - Math.max(ter, wl)).toFixed(1)} m)`); return; }
  if (perched) { if (!a.tree || a.y < ter + 0.5) bad(`${where}: ${sp.id} sitter i et tre som ikke er der`); return; }
  if (a.st === 'climb' || a.st === 'down' || a.st === 'up') return;
  const m = sp.medium || 'land';
  if (m === 'water') { if (dep < 0.1) bad(`${where}: ${sp.id} (svømmer) på land, dybde ${dep.toFixed(2)} m, ${CN[c]}`); }
  else if (m === 'shore' || sp.aquatic) { if (dep > (sp.wade ?? 0.05) + 0.3) bad(`${where}: ${sp.id} for dypt ute: ${dep.toFixed(2)} m`); }
  else if (m === 'coast') { }
  else if (sp.rig === 'bird') { if (dep > 0.3 && !(a.st === 'sit' && a.y >= wl - 0.05)) bad(`${where}: ${sp.id} står i vann ${dep.toFixed(2)} m`); }
  else if (dep > 0.05) bad(`${where}: ${sp.id} (landdyr) i vann ${dep.toFixed(2)} m dypt, ${CN[c]}`);
  if (dep < 0.3 && isl.inBuilding(lx, lz, 0)) bad(`${where}: ${sp.id} inne i et hus`);
  if (born) {
    if (!sp.cover.includes(c) && !perched) bad(`${where}: ${sp.id} født på ${CN[c]} (vil ha ${sp.cover.map(k => CN[k]).join('/')})`);
    const q = isl.roads.query(lx, lz); if (q && q.d < q.hw && sp.roads !== 'any') bad(`${where}: ${sp.id} født på veien`);
  }
  if (sp.rig !== 'bird' && sp.medium !== 'water' && !(sp.aquatic && dep > 0.2) && !a.dive) { const gy = isl.height(x, z); if (Math.abs(a.y - gy) > 0.6 && !(a.air > 0)) bad(`${where}: ${sp.id} svever ${(a.y - gy).toFixed(2)} m over/under bakken (${a.st})`); }
}

// land points on an island: on its roads (where the car drives), and anywhere on land
function points(isl, n) {
  const out = [], roads = isl.roads.roads.filter(r => r.c <= 6);
  for (let k = 0; k < n * 40 && out.length < n; k++) {
    let x, z;
    if (k % 2 && roads.length) { const r = roads[Math.floor(R() * roads.length)], i = Math.floor(R() * (r.p.length / 3)); x = r.p[i * 3] + isl.ox; z = r.p[i * 3 + 1] + isl.oz; }
    else { x = isl.x0 + R() * (isl.x1 - isl.x0); z = isl.z0 + R() * (isl.z1 - isl.z0); }
    if (isl.terrain(x, z) > 0.5) out.push({ x, z });
  }
  // and a few by the water's edge
  for (let k = 0, m = 0; k < 4000 && m < Math.ceil(n / 4); k++) {
    const x = isl.x0 + R() * (isl.x1 - isl.x0), z = isl.z0 + R() * (isl.z1 - isl.z0), t = isl.terrain(x, z), w = isl.water(x, z);
    if (t > w && t < w + 0.6) { out.push({ x, z }); m++; }
  }
  return out;
}
const view = (x, z, extra = {}) => Object.assign({ fx: x, fz: z, cx: x - 8, cy: 4, cz: z - 8, tx: x, tz: z, tvx: 0, tvz: 0, night: 0, lights: false, honk: false, pen: 'nuts', car: null }, extra);

// ---------------------------------------------------------------- 1) birth
console.log('1) Fødsel: spawneren på 14 punkter per øy');
const seen = {}, maxN = { n: 0 };
for (const isl of world.islands) {
  if (isl.def.backdrop || only && !only.includes(isl.id)) continue;
  const bio = isl.def.biome || 'nordic', allowed = BIOME[bio], per = {};
  let t = 0, cells = 0;
  for (const p of points(isl, 14)) {
    const life = new Life(world), V = view(p.x, p.z), t0 = performance.now();
    life.fill(V); t += performance.now() - t0; cells++;
    maxN.n = Math.max(maxN.n, life.animals.length);
    if (life.animals.length > 320) bad(`${isl.id}: ${life.animals.length} dyr (over budsjettet)`);
    for (const a of life.animals) {
      if (!allowed[a.sp.id]) bad(`${isl.id}: ${a.sp.id} hører ikke hjemme i biomet ${bio}`);
      if (a.isl !== isl && !(a.isl.def.biome === undefined && !isl.def.biome)) { if (!BIOME[a.isl.def.biome || 'nordic'][a.sp.id]) bad(`${a.sp.id} på feil øy`); }
      check(a, true, isl.id);
      per[a.sp.id] = (per[a.sp.id] || 0) + 1; seen[a.sp.id] = (seen[a.sp.id] || 0) + 1;
    }
  }
  console.log(`   ${isl.id.padEnd(10)} ${bio.padEnd(11)} ${(t / cells).toFixed(1).padStart(6)} ms per fylling  ` + Object.entries(per).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  const missing = Object.keys(allowed).filter(id => !per[id] && allowed[id] >= 0.5);
  if (missing.length) console.log(`      (ikke sett her: ${missing.join(', ')})`);
}
console.log(`   flest dyr på én gang: ${maxN.n}`);
const never = SPECIES.filter(s => !seen[s.id] && (!only || only.some(id => { const b = world.islands.find(i => i.id === id).def.biome || 'nordic'; return BIOME[b][s.id]; })));
if (never.length) bad('aldri født: ' + never.map(s => s.id).join(', '));

// ---------------------------------------------------------------- 2) a drive along the roads
console.log('2) Livet: en bil kjører langs veiene, 4 simulerte minutter per øy');
const DTF = 1 / 30;
for (const isl of world.islands) {
  if (isl.def.backdrop || only && !only.includes(isl.id)) continue;
  const roads = isl.roads.roads.filter(r => r.c <= 6 && r.len > 600); if (!roads.length) continue;
  const r = roads[Math.floor(R() * roads.length)], P = r.p, m = P.length / 3;
  const life = new Life(world); let s = 0, k = 0, ms = 0, worst = 0, frames = 0, states = {}, honked = 0, flew = 0;
  const v = 14;                     // 50 km/h
  let x = P[0] + isl.ox, z = P[1] + isl.oz;
  for (let t = 0; t < 240; t += DTF) {
    // follow the road there and back
    const tx = P[k * 3] + isl.ox, tz = P[k * 3 + 1] + isl.oz, dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
    let vx = 0, vz = 0; if (d < 2) { k += s ? -1 : 1; if (k >= m) { k = m - 1; s = 1; } if (k < 0) { k = 0; s = 0; } } else { vx = dx / d * v; vz = dz / d * v; }
    x += vx * DTF; z += vz * DTF;
    const V = view(x, z, { tvx: vx, tvz: vz, honk: (t % 30) < 0.5, cx: x - vx * 0.6, cz: z - vz * 0.6, night: t > 120 ? 1 : 0 });
    if (V.honk) honked++;
    const t0 = performance.now(); life.update(DTF, V); const dtm = performance.now() - t0; ms += dtm; worst = Math.max(worst, dtm); frames++;
    life.events.length = 0;
    if (frames % 10 === 0) for (const a of life.animals) { check(a, false, isl.id + ' ' + t.toFixed(0) + ' s'); states[a.sp.type + ':' + a.st] = 1; if (a.st === 'fly' && a.sp.type === 'flock') flew++; }
  }
  console.log(`   ${isl.id.padEnd(10)} ${life.animals.length.toString().padStart(4)} dyr  ${(ms / frames).toFixed(2)} ms per bilde (verst ${worst.toFixed(1)})  tilstander: ${Object.keys(states).sort().join(' ')}`);
  if (ms / frames > 3) bad(`${isl.id}: oppdateringen koster ${(ms / frames).toFixed(2)} ms per bilde`);
}

// ---------------------------------------------------------------- 3) the moose on the road
console.log('3) Sammenstøt med bilfysikken');
function straightRoad(isl, len, maxC = 5) {
  for (const r of isl.roads.roads) {
    if (r.c > maxC || r.b) continue; const P = r.p, m = P.length / 3;
    for (let i = 0; i + 1 < m; i++) {
      let j = i, L = 0, ok = true; const h0 = Math.atan2(P[i * 3 + 3] - P[i * 3], P[i * 3 + 4] - P[i * 3 + 1]);
      while (j + 1 < m && L < len) { const h = Math.atan2(P[j * 3 + 3] - P[j * 3], P[j * 3 + 4] - P[j * 3 + 1]); if (Math.abs(Math.atan2(Math.sin(h - h0), Math.cos(h - h0))) > 0.08 || Math.abs(P[j * 3 + 5] - P[j * 3 + 2]) > 1.5) { ok = false; break; } L += Math.hypot(P[j * 3 + 3] - P[j * 3], P[j * 3 + 4] - P[j * 3 + 1]); j++; }
      if (ok && L >= len) return { x: P[i * 3] + isl.ox, z: P[i * 3 + 1] + isl.oz, h: h0 };
    }
  }
  return null;
}
function ram(id, isl, kmh) {
  const S = straightRoad(isl, 140); if (!S) { bad('fant ingen rett vei på ' + isl.id); return; }
  const life = new Life(world); world.movers.length = 0; world.movers.push(life.hook);
  const car = new Vehicle(CARS.find(c => c.id === 'ravn')); car.place(world, S.x, S.z, S.h);
  for (let i = 0; i < 400; i++) car.step(1 / 400, world);
  const sp = BY_ID[id], ux = Math.sin(S.h), uz = Math.cos(S.h);
  const g = { sp, isl, m: [], hx: S.x + ux * 60, hz: S.z + uz * 60, gx: S.x + ux * 60, gz: S.z + uz * 60, t: 99, flee: 0, fx: 0, fz: 0, mode: 'ground', cell: { list: [] } };
  const D = Math.max(25, kmh / 3.6 * 2.5);
  g.hx = g.gx = S.x + ux * D; g.hz = g.gz = S.z + uz * D;
  const a = life.mk(sp, isl, { x: g.hx, z: g.hz }, mulberry32(3), g, false, 0); a.s = 1; a.st = 'stare'; a.t = 99; a.h = S.h + Math.PI / 2;
  g.m.push(a); life.animals.push(a); life.groups.push(g);
  // up to speed, then off the gas: a driver who did not see it
  const v0 = kmh / 3.6; car.vel.set(ux * v0, 0, uz * v0);
  let t = 0, hit = null, vBefore = 0, vAfter = 0, ev = [];
  const V = () => view(car.pos.x, car.pos.z, { car, tvx: car.vel.x, tvz: car.vel.z, pen: 'nuts' });
  while (t < 5) {
    for (let i = 0; i < 400 / 60; i++) { car.input.gas = 0.35; car.step(1 / 400, world); if (!hit && car.lastHit && car.lastHit.c && car.lastHit.c.animal) { hit = car.lastHit; vBefore = v0; } }
    life.update(1 / 60, V()); ev.push(...life.events); life.events.length = 0; t += 1 / 60;
    if (!hit) { a.st = 'stare'; a.t = 99; a.x = g.hx; a.z = g.hz; a.v = 0; }       // it stands its ground until it is hit
    if (hit && !vAfter && t > 0) vAfter = Math.hypot(car.vel.x, car.vel.z) * 3.6;
  }
  world.movers.length = 0;
  const kh = ev.find(e => e.type === 'hit');
  console.log(`   ${sp.name.padEnd(10)} ${kmh} km/t: ${hit ? `traff (støt ${Math.round(hit.j)} N·s), bilen ${kmh} → ${vAfter.toFixed(0)} km/t, dyret ${kh ? `kastet ${kh.dv.toFixed(1)} m/s, ${a.st === 'down' || a.st === 'up' || a.st === 'flee' ? 'veltet/løp' : a.st}` : 'merket ingenting'}` : 'TRAFF IKKE'}`);
  if (!hit || !kh) return bad(`${id}: bilen traff ikke dyret`);
  return { vAfter, v0: kmh, a };
}
const tro = world.islands.find(i => i.id === 'tromoya');
const m1 = ram('elg', tro, 70); if (m1 && !(m1.vAfter < 64 && m1.vAfter > 25)) bad(`elgen: bilen gikk fra 70 til ${m1.vAfter.toFixed(0)} km/t (venter et kraftig, men ikke totalt stopp)`);
const s1 = ram('sau', tro, 50); if (s1 && !(s1.vAfter > 40)) bad(`sauen: bilen gikk fra 50 til ${s1.vAfter.toFixed(0)} km/t (en sau stopper ikke en bil)`);
const e1 = ram('elefant', world.islands.find(i => i.id === 'savanne'), 30); if (e1 && !(e1.vAfter < 12)) bad(`elefanten: bilen gikk fra 30 til ${e1.vAfter.toFixed(0)} km/t (den er som en vegg)`);

// ---------------------------------------------------------------- 4) the lions
console.log('4) Løvene angriper en bil som står stille');
{
  const sav = world.islands.find(i => i.id === 'savanne');
  let L = null, life;
  for (const p of points(sav, 200)) { life = new Life(world); life.fill(view(p.x, p.z)); L = life.animals.find(a => a.sp.id === 'love'); if (L) break; }
  if (!L) bad('fant ingen løver på Løveøya');
  else {
    world.movers.length = 0; world.movers.push(life.hook);
    // a car 22 m from the lion, on the ground
    const car = new Vehicle(CARS.find(c => c.id === 'ravn')); let px = L.x + 22, pz = L.z;
    for (let k = 0; k < 16 && sav.water(px, pz) > sav.terrain(px, pz) - 0.2; k++) { px = L.x + Math.sin(k) * 22; pz = L.z + Math.cos(k) * 22; }
    car.place(world, px, pz, 0); for (let i = 0; i < 400; i++) car.step(1 / 400, world);
    let t = 0, att = null, warn = null; const vy0 = car.vel.y;
    while (t < 20 && !att) {
      for (let i = 0; i < 400 / 30; i++) car.step(1 / 400, world);
      life.update(1 / 30, view(car.pos.x, car.pos.z, { car, tvx: car.vel.x, tvz: car.vel.z, pen: 'nuts' }));
      for (const e of life.events) { if (e.type === 'attack' && !att) att = { e, t, v: Math.hypot(car.vel.x, car.vel.z), w: Math.abs(car.w.y) }; if (e.type === 'warn') warn = e; }
      life.events.length = 0; t += 1 / 30;
    }
    world.movers.length = 0;
    console.log(`   ${warn ? 'varsel «' + warn.text + '»' : 'ingen varsel'}; ${att ? `angrep etter ${att.t.toFixed(1)} s: bilen fikk ${att.e.dv.toFixed(1)} m/s og spinn ${att.w.toFixed(2)} rad/s (koster: ${att.e.pen})` : 'INTET ANGREP'}`);
    if (!att) bad('løvene angrep ikke');
  }
}

// ---------------------------------------------------------------- 5) a moose steps out on the road ahead
console.log('5) Elg i veien foran bilen');
{
  const life = new Life(world); let found = 0, tries = 0;
  for (const p of points(tro, 300)) {
    const q = tro.roads.query(p.x, p.z); if (!q || q.c > 5) continue;
    const car = { pos: { x: p.x, y: 0, z: p.z }, vel: { x: q.tx * 20, y: 0, z: q.tz * 20 }, fw: { x: q.tx, y: 0, z: q.tz }, w: { x: 0, y: 0, z: 0 }, m: 1500, box: { hl: 2.3, hw: 0.9 } };
    life.evT = 0; tries++;
    const n0 = life.animals.length; life.roadEvent(0.1, view(p.x, p.z, { car, tvx: car.vel.x, tvz: car.vel.z }));
    const ev = life.events.find(e => e.type === 'event'); life.events.length = 0;
    if (ev) { found++; const a = ev.a, d = Math.hypot(a.x - p.x, a.z - p.z); if (d < 120 || d > 260) bad(`elgen står ${d.toFixed(0)} m fra bilen`); for (const b of life.animals.slice(n0)) check(b, false, 'elg i veien'); }
    if (found >= 10) break;
  }
  console.log(`   ${found} av ${tries} forsøk på veier ga en elg ved veien 150–220 m foran bilen`);
  if (!found) bad('fant aldri et sted for elgen');
}

console.log(fails ? `\n${fails} feil` : '\nAlt i orden');
process.exit(fails ? 1 : 0);
