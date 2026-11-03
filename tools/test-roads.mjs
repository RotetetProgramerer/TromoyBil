// Veiene på øyene uten nettleser: høydeprofilen langs hver vei, og veiene som går under bruer.
//   node tools/test-roads.mjs [øy,øy,…]
// 1) Langs midtlinjen av hver vei som ikke er bru, i steg på 1 m: ingen sprang over 0.3 m fra én meter til den neste (sprang =
//    hvor mye stigningen endrer seg mellom to nabometre, så en jevn bratt bakke teller ikke, men en kant, en vegg eller et hull
//    gjør det; de første og siste 5 m av veien og de ytterste 30 m av rutenettet unntatt). De verste sprangene skrives ut med
//    koordinater. Kjørbare veier (klasse 0–5) må være rene; stier og traktorveier (6–7, trapper i Arendal) telles bare opp, og
//    det gjør også foldene i veikryss der to veiers høyder ikke stemmer overens i dataene (byggeverktøyets sak, ikke høydefeltets).
// 2) Undergangene i Arendal: Bendiksklev under Kastellveien og Trommestadveien under Vikaveien. Profilen gjennom undergangen er
//    jevn, terrenget (bare) følger den nedre veien, dekket står igjen der den nedre veien ikke går, og den som sier at den er
//    oppe på dekket (ref i Island.height) får dekket.
// 3) Bilen (ravn) kjører de to nedre veiene i 40 km/t, begge veier: den blir på hjulene og kastes ikke opp (farten vinkelrett
//    på bilen under 2 m/s; loddrett fart alene ville slått ut på en bakke på 17 %). Så kjører den over Kastellveiens bru og
//    blir på dekket. Høydefeltet har én høyde per punkt, så over undergangen får bilen dekket bare når den sier hvor høyt den
//    er: den kjøringen går gjennom en verden som gir Island.height bilens høyde (det sim/physics/vehicle.js skal gjøre selv).
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { ROAD_SURF } from '../sim/world/roads.js';
import { SURF } from '../sim/physics/surfaces.js';
import { Vehicle } from '../sim/physics/vehicle.js';
import { CARS } from '../sim/data/cars.js';

const only = process.argv[2] ? process.argv[2].split(',') : null;
const DT = 1 / 400, STEP = 0.3, EDGE = 30;
const world = new World();
for (const d of WORLD.islands) if (!d.backdrop && (!only || only.includes(d.id))) await world.addIsland('world/', d);
let fails = 0; const bad = m => { fails++; if (fails < 60) console.log('   FEIL: ' + m); };
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), f0 = v => v.toFixed(0), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const name = r => r.n || '(uten navn)';

// ---------------------------------------------------------------- 1) steps along every road
console.log(`1) Sprang langs midtlinjen av veiene (1 m steg, endring i stigning over ${STEP} m fra én meter til den neste)`);
for (const isl of world.islands) {
  const R = isl.roads.roads, steps = []; let n = 0, worst = 0, km = 0;
  R.forEach((r, ri) => {
    const p = r.p, m = p.length / 3, br = r.b ? new Set(r.b) : null, cum = [0];
    for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2]));
    const L = cum[m - 1]; km += L / 1000; let y1 = null, y2 = null, k1 = 0, k2 = 0;      // the last two samples and what set their height: 1 a bridge, 2 another road
    for (let i = 0; i < m - 1; i++) {
      if (br && (br.has(i) || br.has(i + 1))) { y1 = y2 = null; continue; }            // a bridge segment (as RoadNet flags them)
      const ax = p[i * 3], az = p[i * 3 + 1], ex = p[i * 3 + 3] - ax, ez = p[i * 3 + 4] - az, sl = cum[i + 1] - cum[i] || 1e-9;
      for (let s = Math.ceil(cum[i]); s < cum[i + 1]; s++) {
        const t = (s - cum[i]) / sl, x = ax + ex * t + isl.ox, z = az + ez * t + isl.oz;
        if (s < 5 || s > L - 5 || !isl.inside(x, z, EDGE)) { y1 = y2 = null; continue; }
        const y = isl.height(x, z), q = isl.roads.query(x - isl.ox, z - isl.oz), k = !q ? 0 : q.bridge ? 1 : q.road !== ri ? 2 : 0; n++;
        if (y1 != null && y2 != null) { const d = Math.abs(y - 2 * y1 + y2); worst = Math.max(worst, d); if (d > STEP) { const kk = Math.max(k, k1, k2); steps.push({ d, x, z, ri, s, under: kk === 1, cross: kk === 2 }); } }
        y2 = y1; y1 = y; k2 = k1; k1 = k;
      }
    }
  });
  steps.sort((a, b) => b.d - a.d);
  const under = steps.filter(s => s.under).length, cross = steps.filter(s => s.cross).length, car = steps.filter(s => R[s.ri].c <= 5 && !s.cross);
  console.log(`   ${isl.id.padEnd(9)} ${String(R.length).padStart(4)} veier ${f0(km).padStart(4)} km ${String(n).padStart(7)} punkter  største sprang ${f2(worst)} m  ${steps.length} sprang > ${STEP} m (${under} under en bru, ${cross} i veikryss, ${car.length} andre på kjørbare veier)`);
  for (const s of steps.slice(0, 8)) console.log(`      ${f2(s.d)} m ved (${f0(s.x)}, ${f0(s.z)}) ${name(R[s.ri])} c${R[s.ri].c}, ${f0(s.s)} m inn${s.under ? ', under en bru' : s.cross ? ', veikryss' : ''}`);
  if (car.length) bad(`${isl.id}: ${car.length} sprang over ${STEP} m på kjørbare veier (største ${f2(car[0].d)} m ved (${f0(car[0].x)}, ${f0(car[0].z)}) ${name(R[car[0].ri])})`);
}

// ---------------------------------------------------------------- 2) the underpasses
const tro = world.islands.find(i => i.id === 'tromoya');
// the point s metres along road ri (world coordinates and the road's own height)
function along(isl, ri, s) {
  const p = isl.roads.roads[ri].p, m = p.length / 3; let i = 0, c = 0;
  while (i < m - 2 && c + Math.hypot(p[i * 3 + 3] - p[i * 3], p[i * 3 + 4] - p[i * 3 + 1]) < s) { c += Math.hypot(p[i * 3 + 3] - p[i * 3], p[i * 3 + 4] - p[i * 3 + 1]); i++; }
  const t = clamp((s - c) / (Math.hypot(p[i * 3 + 3] - p[i * 3], p[i * 3 + 4] - p[i * 3 + 1]) || 1e-9), 0, 1);
  return { x: p[i * 3] + (p[i * 3 + 3] - p[i * 3]) * t + isl.ox, z: p[i * 3 + 1] + (p[i * 3 + 4] - p[i * 3 + 1]) * t + isl.oz, y: p[i * 3 + 2] + (p[i * 3 + 5] - p[i * 3 + 2]) * t };
}
// how far along road ri the point (x,z) lies
function stationOf(isl, ri, x, z) {
  const p = isl.roads.roads[ri].p, m = p.length / 3; let best = 1e9, bs = 0, c = 0;
  for (let i = 0; i < m - 1; i++) {
    const ax = p[i * 3] + isl.ox, az = p[i * 3 + 1] + isl.oz, ex = p[i * 3 + 3] - p[i * 3], ez = p[i * 3 + 4] - p[i * 3 + 1], l = Math.hypot(ex, ez) || 1e-9;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / (l * l), 0, 1), d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < best) { best = d; bs = c + t * l; } c += l;
  }
  return bs;
}
function underpass(isl, lower, upper, x, z) {
  const R = isl.roads.roads, q = isl.roads.query(x - isl.ox, z - isl.oz);
  if (!q || !q.bridge || R[q.road].n !== upper) return bad(`${lower}: ingen bru (${upper}) over (${x}, ${z})`);
  const deck = q.y, tx = q.tx, tz = q.tz, us = q.s, g = q.ground;           // copied: query() returns shared objects
  if (!g || R[g.road].n !== lower) return bad(`${lower}: query finner ikke den nedre veien under ${upper} ved (${x}, ${z})`);
  const gr = g.road, gy = g.y, gs = g.s, s0 = stationOf(isl, gr, x, z), line = []; let prev = null, prevB = null, worst = 0, worstB = 0, off = 0;
  for (let s = -20; s <= 20; s++) {
    const P = along(isl, gr, s0 + s), y = isl.height(P.x, P.z), yb = isl.height(P.x, P.z, true);
    if (prev != null) { worst = Math.max(worst, Math.abs(y - prev)); worstB = Math.max(worstB, Math.abs(yb - prevB)); }
    if (Math.abs(y - P.y) > 0.3) off++;
    if (s % 5 === 0) line.push(`${s}:${f1(y)}`);
    prev = y; prevB = yb;
  }
  console.log(`   ${lower} under ${upper} ved (${x}, ${z}): dekket ${f1(deck)} m, veien ${f1(gy)} m; profil (m inn: høyde) ${line.join(' ')}; største sprang ${f2(worst)} m, terrenget ${f2(worstB)} m`);
  if (worst > STEP) bad(`${lower}: sprang på ${f2(worst)} m i profilen under ${upper}`);
  if (worstB > STEP) bad(`${lower}: terrenget (bare) har et sprang på ${f2(worstB)} m under ${upper}`);
  if (off) bad(`${lower}: ${off} punkter mer enn 0.3 m fra veiens egen høyde gjennom undergangen`);
  const yb0 = isl.height(x, z, true); if (yb0 > deck - 1) bad(`${lower}: terrenget under brua ligger oppe på dekket (${f1(yb0)} m, dekket ${f1(deck)} m)`);
  const yd = isl.height(x, z, false, deck + 0.3); if (Math.abs(yd - deck) > 0.05) bad(`${upper}: en bil oppe på dekket (ref ${f1(deck + 0.3)} m) får ${f1(yd)} m, ikke dekket ${f1(deck)} m`);
  const yl = isl.height(x, z, false, gy + 0.5); if (Math.abs(yl - gy) > 0.3) bad(`${lower}: en bil nede på veien (ref ${f1(gy + 0.5)} m) får ${f1(yl)} m, ikke veien ${f1(gy)} m`);
  const sf = isl.surface(x, z); if (sf !== ROAD_SURF[gs]) bad(`${lower}: dekket under brua er ${sf}, ikke veiens eget (${ROAD_SURF[gs]})`);
  const sd = isl.surface(x, z, deck + 0.3); if (sd !== (us === 0 ? ROAD_SURF[0] : SURF.WOOD)) bad(`${upper}: dekket oppe på brua er ${sd}`);
  // the deck still carries where the lower road does not pass: 6 m along the bridge from the crossing
  for (const sgn of [-1, 1]) {
    const sx = x + tx * 6 * sgn, sz = z + tz * 6 * sgn, qs = isl.roads.query(sx - isl.ox, sz - isl.oz);
    if (qs && qs.bridge && qs.d < qs.hw) { const ys = isl.height(sx, sz); if (Math.abs(ys - qs.y) > 0.05) bad(`${upper}: dekket ${6 * sgn} m fra krysset gir ${f1(ys)} m, ikke ${f1(qs.y)} m`); }
  }
}
if (tro) {
  console.log('2) Undergangene i Arendal');
  underpass(tro, 'Bendiksklev', 'Kastellveien', -5635, 1017);
  underpass(tro, 'Trommestadveien', 'Vikaveien', -5632, 2269);
}

// ---------------------------------------------------------------- 3) driving through and over
// a polyline (world) along road ri from its first vertex (or backwards from its last, when rev), on through the pieces of the
// same name (any name, when any) that join it end to end (the one that continues straightest), up to len metres: [[x, z, y, road], …]
function follow(isl, ri, rev, len, any) {
  const R = isl.roads.roads, used = new Set(), line = []; let r = R[ri], flip = rev, L = 0;
  while (r && !used.has(r) && L < len) {
    used.add(r); const p = r.p, m = p.length / 3;
    for (let k = 0; k < m; k++) {
      const i = flip ? m - 1 - k : k, x = p[i * 3] + isl.ox, z = p[i * 3 + 1] + isl.oz, last = line[line.length - 1];
      if (last) { const d = Math.hypot(x - last[0], z - last[1]); if (d < 0.01) continue; L += d; }
      line.push([x, z, p[i * 3 + 2], r]);
    }
    const [ex, ez] = line[line.length - 1], [px, pz] = line[line.length - 2], hx = ex - px, hz = ez - pz; let best = -2; r = null;
    for (const c of R) {
      if (used.has(c) || (!any && c.n !== line[line.length - 1][3].n)) continue; const q = c.p, n = q.length / 3;
      for (const [i0, i1, f] of [[0, 1, false], [n - 1, n - 2, true]]) {
        if (Math.hypot(q[i0 * 3] + isl.ox - ex, q[i0 * 3 + 1] + isl.oz - ez) > 0.5) continue;
        const dx = q[i1 * 3] - q[i0 * 3], dz = q[i1 * 3 + 1] - q[i0 * 3 + 1], cos = (hx * dx + hz * dz) / (Math.hypot(hx, hz) * Math.hypot(dx, dz) || 1);
        if (cos > best) { best = cos; r = c; flip = f; }
      }
    }
  }
  return line;
}
// a polyline (world) through the given road pieces in that order, each turned so it joins the one before
function chain(isl, ...ris) {
  const R = isl.roads.roads, line = [];
  for (const ri of ris) {
    const r = R[ri], p = r.p, m = p.length / 3, last = line[line.length - 1];
    const flip = !!last && Math.hypot(p[0] + isl.ox - last[0], p[1] + isl.oz - last[1]) > Math.hypot(p[(m - 1) * 3] + isl.ox - last[0], p[(m - 1) * 3 + 1] + isl.oz - last[1]);
    for (let k = 0; k < m; k++) { const i = flip ? m - 1 - k : k, x = p[i * 3] + isl.ox, z = p[i * 3 + 1] + isl.oz; if (line.length && Math.hypot(x - line[line.length - 1][0], z - line[line.length - 1][1]) < 0.01) continue; line.push([x, z, p[i * 3 + 2], r]); }
  }
  return line;
}
// drop the first `skip` metres of a line
function cut(line, skip) { let L = 0, i = 1; while (i < line.length && L + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]) < skip) { L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); i++; } return line.slice(i - 1); }
const lineLen = line => { let L = 0; for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); return L; };
// the world the drives see. The houses along these streets have box colliders reaching into the road (K2 in the review) and
// are not what this test is about, so they are left out
const noHouses = (x, z, r) => world.colliders(x, z, r).filter(c => c.kind !== 'house');
function plain() { return { get wet() { return world.wet; }, height: (x, z) => world.height(x, z), surface: (x, z) => world.surface(x, z), water: (x, z) => world.water(x, z), normal: (x, z, out) => world.normal(x, z, out), colliders: noHouses }; }
// … and as a car that says how high it is sees it: over an underpass it gets the deck when it is up there
function layered(isl, car) {
  const H = (x, z) => isl.height(x, z, false, car.pos.y), e = 0.35;
  return { get wet() { return world.wet; }, height: H, surface: (x, z) => isl.surface(x, z, car.pos.y), water: (x, z) => world.water(x, z), colliders: noHouses,
    normal: (x, z, out) => out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize() };
}
// pure pursuit along the line at kmh (as tools/test-courses.mjs drives). Measures the speed normal to the car's body (0 on a
// smooth road at any grade, large when the car is launched), the lowest up.y, the highest ride over the ground, and on the
// bridge the lowest ground under the car relative to the deck
function drive(w, line, kmh, maxT = 40) {
  const spec = CARS.find(c => c.id === 'ravn'), car = new Vehicle(spec), W = w(car) || w;
  const [x0, z0] = line[0], [x1, z1] = line[1];
  car.place(W, x0, z0, Math.atan2(x1 - x0, z1 - z0)); for (let i = 0; i < 400; i++) car.step(DT, W);
  const want = kmh / 3.6, m = line.length, r = { t: 0, maxVn: 0, maxVy: 0, minUp: 1, maxRide: 0, underDeck: 1e9, onDeck: 0, hits: 0, done: false, top: 0 };
  let seg = 0, lastHit = null;
  while (r.t < maxT) {
    const la = Math.max(6, car.speed * 0.55);
    while (seg < m - 1 && Math.hypot(line[seg][0] - car.pos.x, line[seg][1] - car.pos.z) < la) seg++;
    if (seg >= m - 1 && Math.hypot(line[m - 1][0] - car.pos.x, line[m - 1][1] - car.pos.z) < la) { r.done = true; break; }
    const dx = line[seg][0] - car.pos.x, dz = line[seg][1] - car.pos.z, fx = car.fw.x, fz = car.fw.z, a = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);
    car.input.steer = clamp(Math.atan(2 * spec.wb * Math.sin(a) / Math.max(la, Math.hypot(dx, dz))) / car.steerMax, -1, 1);
    const v = car.speed; car.input.gas = v < want ? Math.min(1, (want - v) * 0.3 + 0.15) : 0; car.input.brake = v > want + 1 ? Math.min(1, (v - want) * 0.25) : 0;
    car.step(DT, W); r.t += DT;
    r.maxVn = Math.max(r.maxVn, Math.abs(car.vel.dot(car.up))); r.maxVy = Math.max(r.maxVy, Math.abs(car.vel.y)); r.minUp = Math.min(r.minUp, car.up.y); r.top = Math.max(r.top, car.kmh);
    const ground = W.height(car.pos.x, car.pos.z); r.maxRide = Math.max(r.maxRide, car.pos.y - ground);
    const q = world.road(car.pos.x, car.pos.z); if (q && q.bridge && q.d < q.hw) { r.onDeck++; r.underDeck = Math.min(r.underDeck, ground - q.y); }
    if (car.lastHit && car.lastHit !== lastHit) { lastHit = car.lastHit; r.hits++; }
  }
  r.x = car.pos.x; r.z = car.pos.z; r.cgH = car.cgH;
  return r;
}
function report(what, r, bridge) {
  const s = `${what.padEnd(44)} ${r.done ? 'fram' : 'STOPPET ved ' + f0(r.x) + ',' + f0(r.z)} ${f0(r.t)} s, topp ${f0(r.top)} km/t, fart normalt ${f2(r.maxVn)} m/s (loddrett ${f2(r.maxVy)}), min up.y ${f2(r.minUp)}, høyde over bakken ${f2(r.maxRide)} m, treff ${r.hits}`;
  console.log('   ' + s + (bridge ? `, på dekket ${f0(r.onDeck * DT * 1000)} ms, bakken under bilen minst ${r.onDeck ? f2(r.underDeck) : '–'} m fra dekket` : ''));
}
if (tro) {
  console.log('3) Kjøring i 40 km/t');
  const R = tro.roads.roads;
  const bend = R.findIndex(r => r.n === 'Bendiksklev' && !r.b && r.p[0] === -5684.2), trom = R.findIndex(r => r.n === 'Trommestadveien' && !r.b && r.p[0] === -5640);
  const first = R.findIndex(r => r.n === 'Bendiksklev' && !r.b && r.p[(r.p.length / 3 - 1) * 3] === -5684.2);
  const runs = [['Bendiksklev oppover under Kastellveien', follow(tro, first >= 0 ? first : bend, false, 300)], ['Bendiksklev nedover under Kastellveien', follow(tro, bend, true, 300)],
    ['Trommestadveien nordover under Vikaveien', follow(tro, trom, false, 300)], ['Trommestadveien sørover under Vikaveien', follow(tro, R.findIndex(r => r.n === 'Trommestadveien' && r.p[0] === -5634.2), false, 300)]];
  for (const [what, line] of runs) {
    if (line.length < 3) { bad(`${what}: fant ikke veien`); continue; }
    const r = drive(plain, line, 40); report(what + ` (${f0(lineLen(line))} m)`, r);
    if (!r.done) bad(`${what}: kom ikke fram (${f0(r.x)}, ${f0(r.z)})`);
    if (r.minUp < 0.9) bad(`${what}: bilen veltet (up.y ${f2(r.minUp)})`);
    if (r.maxVn >= 2) bad(`${what}: bilen ble kastet opp (${f2(r.maxVn)} m/s normalt på bilen)`);
    if (r.maxRide > r.cgH + 0.6) bad(`${what}: bilen lettet ${f2(r.maxRide - r.cgH)} m fra bakken`);
  }
  // over the bridge: Kastellveien from 60 m before the deck and across it (the run ends at the far end of the deck: there the
  // road meets Hylleveien in a 40° bend, which is not what this test is about)
  const app = R.findIndex(r => r.n === 'Kastellveien' && !r.b && r.p[(r.p.length / 3 - 1) * 3] === -5626.9), deck = R.findIndex(r => r.n === 'Kastellveien' && r.b);
  let line = chain(tro, app, deck); line = cut(line, Math.max(0, lineLen(line.slice(0, line.findIndex(p => p[3].b) + 1)) - 60));
  const pieces = [...new Set(line.map(p => p[3]))].map(r => `${name(r)}${r.b ? ' (bru)' : ''}`).join(' → ');
  const r = drive(car => layered(tro, car), line, 40); report(`Kastellveien over brua (${f0(lineLen(line))} m: ${pieces})`, r, true);
  if (!r.done) bad(`Kastellveien: kom ikke fram over brua (${f0(r.x)}, ${f0(r.z)})`);
  if (!r.onDeck) bad('Kastellveien: bilen var aldri på dekket');
  if (r.underDeck < -0.1) bad(`Kastellveien: bakken under bilen på brua lå ${f2(-r.underDeck)} m under dekket`);
  if (r.minUp < 0.9) bad(`Kastellveien: bilen veltet på brua (up.y ${f2(r.minUp)})`);
  if (r.maxVn >= 2) bad(`Kastellveien: bilen ble kastet på brua (${f2(r.maxVn)} m/s)`);
  if (r.maxRide > r.cgH + 0.6) bad(`Kastellveien: bilen lettet ${f2(r.maxRide - r.cgH)} m fra dekket`);
  const r2 = drive(plain, line, 40); report('   samme uten bilens høyde (vehicle.js i dag)', r2, true);
}

console.log(fails ? `\n${fails} FEIL` : '\nalt i orden');
process.exit(fails ? 1 : 0);
