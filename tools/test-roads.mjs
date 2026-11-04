// Veiene på øyene uten nettleser: høydeprofilen langs hver vei, og bruene der én vei går over en annen.
//   node tools/test-roads.mjs [øy,øy,…]
// 1) Langs midtlinjen av hver vei som ikke er bru, i steg på 1 m: ingen sprang over 0.3 m fra én meter til den neste (sprang =
//    hvor mye stigningen endrer seg mellom to nabometre, så en jevn bratt bakke teller ikke, men en kant, en vegg eller et hull
//    gjør det; de første og siste 5 m av veien og de ytterste 30 m av rutenettet unntatt). De verste sprangene skrives ut med
//    koordinater. Kjørbare veier (klasse 0–5) må være rene; stier og traktorveier (6–7, trapper i Arendal) telles bare opp. Foldene
//    i veikryss der to veiers høyder ikke stemmer overens i dataene (byggeverktøyets sak) telles, og på kjørbare veier må de ikke
//    bli flere enn i dag (FOLDS).
// 2) Hvert sted en bru går mer enn 1 m over en annen vei (funnet i veidataene, ikke skrevet inn her) der en av dem er kjørbar: den
//    som er oppe på dekket (ref i Island.height og Island.surface, og World sender den videre) får dekket over hele kjørebanen
//    rundt krysset, den som er nede på veien under får den veien, og uten ref (terrengnettet, dyrene, kameraet) går den nedre
//    veien gjennom. Undergangene i Arendal (Bendiksklev under Kastellveien, Trommestadveien under Vikaveien) i tillegg: jevn
//    profil gjennom undergangen, terrenget (bare) følger den nedre veien, dekket står igjen der den nedre veien ikke går.
// 3) Bilen (ravn) kjører i 40 km/t, begge veier, gjennom den vanlige verdenen (World) slik spillet gjør: under hver kjørbar bru
//    fra del 2 blir den på hjulene og kastes ikke opp (farten vinkelrett på bilen under 2 m/s innen 30 m fra krysset; loddrett
//    fart alene ville slått ut på en bakke på 17 %), og over hver kjørbar bru blir den oppe på dekket. Det siste krever at
//    sim/physics/vehicle.js gir world.height, world.surface og world.normal nivået bilen står på (ref), ellers faller bilen ned i
//    sporet til veien under.
import { World } from '../sim/world/world.js';
import { WORLD } from '../sim/data/world.js';
import { ROAD_SURF } from '../sim/world/roads.js';
import { SURF } from '../sim/physics/surfaces.js';
import { V3 } from '../sim/physics/math.js';
import { Vehicle } from '../sim/physics/vehicle.js';
import { CARS } from '../sim/data/cars.js';

const only = process.argv[2] ? process.argv[2].split(',') : null;
const DT = 1 / 400, STEP = 0.3, EDGE = 30, CLEAR = 1;
const FOLDS = { tromoya: 4 };              // junction folds over STEP on drivable roads today (Øvre Tyholmsvei, Hulveien): no more
// crossings in Arendal's interchange where the road pieces do not join up in the data (a 21 m bridge piece with a 3 m gap and
// 0.9–1.7 m steps where it meets the next ones, a narrow bridge starting at a right-angled junction): checked in part 2, not driven
const BROKEN = ['-5634,647', '-5625,654', '-5691,584'];
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
  const under = steps.filter(s => s.under).length, cross = steps.filter(s => s.cross).length, car = steps.filter(s => R[s.ri].c <= 5 && !s.cross), folds = steps.filter(s => R[s.ri].c <= 5 && s.cross);
  console.log(`   ${isl.id.padEnd(9)} ${String(R.length).padStart(4)} veier ${f0(km).padStart(4)} km ${String(n).padStart(7)} punkter  største sprang ${f2(worst)} m  ${steps.length} sprang > ${STEP} m (${under} under en bru, ${cross} i veikryss, av dem ${folds.length} på kjørbare veier, ${car.length} andre på kjørbare veier)`);
  for (const s of steps.slice(0, 8)) console.log(`      ${f2(s.d)} m ved (${f0(s.x)}, ${f0(s.z)}) ${name(R[s.ri])} c${R[s.ri].c}, ${f0(s.s)} m inn${s.under ? ', under en bru' : s.cross ? ', veikryss' : ''}`);
  for (const s of folds.slice(0, 8)) console.log(`      veikryss på kjørbar vei: ${f2(s.d)} m ved (${f0(s.x)}, ${f0(s.z)}) ${name(R[s.ri])} c${R[s.ri].c}`);
  if (car.length) bad(`${isl.id}: ${car.length} sprang over ${STEP} m på kjørbare veier (største ${f2(car[0].d)} m ved (${f0(car[0].x)}, ${f0(car[0].z)}) ${name(R[car[0].ri])})`);
  if (folds.length > (FOLDS[isl.id] || 0)) bad(`${isl.id}: ${folds.length} folder over ${STEP} m i veikryss på kjørbare veier, før ${FOLDS[isl.id] || 0}`);
}

// ---------------------------------------------------------------- 2) the crossings
// every place a bridge segment crosses a segment of another road on the ground, more than CLEAR m above it, where one of the two
// is drivable: {isl, x, z (world), br, gr (the roads), yd, yg (their heights there)}, a few metres apart at least
function crossings(isl) {
  const R = isl.roads.roads, out = [];
  R.forEach((r, ri) => {
    if (!r.b) return; const bs = new Set(r.b), p = r.p, m = p.length / 3;
    for (let i = 0; i < m - 1; i++) {
      if (!bs.has(i) && !bs.has(i + 1)) continue;
      const ax = p[i * 3], az = p[i * 3 + 1], ex = p[i * 3 + 3] - ax, ez = p[i * 3 + 4] - az;
      R.forEach((g, gi) => {
        if (gi === ri || (r.c > 5 && g.c > 5)) return; const gs = g.b ? new Set(g.b) : null, q = g.p, n = q.length / 3;
        for (let j = 0; j < n - 1; j++) {
          if (gs && (gs.has(j) || gs.has(j + 1))) continue;
          const cx = q[j * 3], cz = q[j * 3 + 1], fx = q[j * 3 + 3] - cx, fz = q[j * 3 + 4] - cz, den = ex * fz - ez * fx; if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * fz - (cz - az) * fx) / den, u = ((cx - ax) * ez - (cz - az) * ex) / den; if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const yd = p[i * 3 + 2] + (p[i * 3 + 5] - p[i * 3 + 2]) * t, yg = q[j * 3 + 2] + (q[j * 3 + 5] - q[j * 3 + 2]) * u, x = ax + ex * t + isl.ox, z = az + ez * t + isl.oz;
          if (yd - yg > CLEAR && !out.some(o => Math.hypot(o.x - x, o.z - z) < 3)) out.push({ isl, x, z, br: ri, gr: gi, yd, yg });
        }
      });
    }
  });
  return out;
}
const X = world.islands.flatMap(crossings), N = new V3();
// the drivable crossings on Tromøya the data has today (the two underpasses in Arendal, the riksvei pair, Kystveien, Hisøy): they
// must still be found
const MUST = ['-5632,2269', '-5635,1017', '-5634,647', '-5625,654', '-183,-3786', '449,-3905'];
// the bridge (the deck) and the road on the ground that query() gives at (x,z), and which of them is the nearest (on: the bridge)
const levels = (isl, x, z) => { const q = isl.roads.query(x - isl.ox, z - isl.oz); return !q ? {} : q.bridge ? { b: q, g: q.ground, on: true } : { b: q.deck, g: q, on: false }; };
console.log(`2) ${X.length} kryss der en bru går mer enn ${CLEAR} m over en annen vei og en av dem er kjørbar`);
if (world.islands.some(i => i.id === 'tromoya')) for (const k of MUST) { const [x, z] = k.split(',').map(Number); if (!X.some(c => Math.hypot(c.x - x, c.z - z) < 5)) bad(`fant ikke krysset ved (${x}, ${z}) i veidataene`); }
// World passes the asker's height on to the island
if (X.length) {
  const c = X[0], h = world.height(c.x, c.z, false, c.yd), s = world.surface(c.x, c.z, c.yd), n = world.normal(c.x, c.z, N, c.yd).y;
  if (Math.abs(h - c.isl.height(c.x, c.z, false, c.yd)) > 1e-9 || s !== c.isl.surface(c.x, c.z, c.yd) || Math.abs(h - c.yd) > 0.3 || n < 0.9)
    bad(`World sender ikke spørrerens høyde videre: world.height(x, z, false, ref) gir ${f1(h)} m ved (${f0(c.x)}, ${f0(c.z)}), dekket er ${f1(c.yd)} m (sim/world/world.js: height, surface og normal må ta ref og gi den til Island)`);
}
for (const c of X) {
  const { isl, x, z } = c, R = isl.roads.roads, up = R[c.br], lo = R[c.gr], { b, g } = levels(isl, x, z);
  const what = `${name(up)} c${up.c} over ${name(lo)} c${lo.c} ved (${f0(x)}, ${f0(z)})`;
  if (!b || !g || b.road !== c.br || g.road !== c.gr) { bad(`${what}: query finner ikke brua og veien under`); continue; }
  const tx = b.tx, tz = b.tz, deckS = b.s;
  // with ref = the deck (a car standing up there) nothing opens below the deck over its whole lane, 10 m each way along the bridge
  // (where the nearest road is the bridge or the road under it: towards its ends the bridge's approach takes over, as anywhere)
  let off = 0, worst = 0, at = '';
  for (let s = -10; s <= 10; s += 0.5) for (let l = -1; l <= 1; l += 0.25) {
    const L = levels(isl, x + tx * s, z + tz * s); if (!L.b || L.b.road !== c.br) continue;
    const px = x + tx * s - tz * l * (L.b.hw - 0.3), pz = z + tz * s + tx * l * (L.b.hw - 0.3), P = levels(isl, px, pz); if (!P.b || P.b.road !== c.br || P.b.d > P.b.hw || !(P.on || P.g.road === c.gr)) continue;
    const yd = P.b.y, y = isl.height(px, pz, false, yd); if (y < yd - 0.05) { off++; if (yd - y > worst) { worst = yd - y; at = `(${f1(px)}, ${f1(pz)})`; } }
  }
  const hl = isl.height(x, z, false, c.yg), h0 = isl.height(x, z), sd = isl.surface(x, z, c.yd), sl = isl.surface(x, z, c.yg);
  console.log(`   ${what}: dekket ${f1(c.yd)} m, veien under ${f1(c.yg)} m; oppe ${f1(isl.height(x, z, false, c.yd))}, nede ${f1(hl)}, uten ref ${f1(h0)} m${off ? `, ${off} hull i dekket (det dypeste ${f2(worst)} m ved ${at})` : ''}`);
  if (off) bad(`${what}: ${off} punkter på dekket ligger under dekket med ref oppe på dekket (det dypeste ${f2(worst)} m ved ${at})`);
  if (Math.abs(hl - c.yg) > 0.3) bad(`${what}: den som er nede på veien under får ${f1(hl)} m, ikke veien (${f1(c.yg)} m)`);
  if (Math.abs(h0 - c.yg) > 0.3) bad(`${what}: uten ref gir krysset ${f1(h0)} m, ikke veien under (${f1(c.yg)} m)`);
  if (sd !== (deckS === 0 ? ROAD_SURF[0] : SURF.WOOD)) bad(`${what}: underlaget oppe på dekket er ${sd}`);
  if (sl !== (ROAD_SURF[lo.s] ?? SURF.ASPHALT)) bad(`${what}: underlaget nede på veien under er ${sl}, ikke veiens eget`);
}
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
  const R = isl.roads.roads, { b, g } = levels(isl, x, z);
  if (!b || R[b.road].n !== upper) return bad(`${lower}: ingen bru (${upper}) over (${x}, ${z})`);
  if (!g || R[g.road].n !== lower) return bad(`${lower}: query finner ikke den nedre veien under ${upper} ved (${x}, ${z})`);
  const deck = b.y, tx = b.tx, tz = b.tz, gr = g.road, gy = g.y, s0 = stationOf(isl, gr, x, z), line = []; let prev = null, prevB = null, worst = 0, worstB = 0, off = 0;
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
  // the deck still carries where the lower road does not pass: 6 m along the bridge from the crossing
  for (const sgn of [-1, 1]) {
    const sx = x + tx * 6 * sgn, sz = z + tz * 6 * sgn, qs = isl.roads.query(sx - isl.ox, sz - isl.oz);
    if (qs && qs.bridge && qs.d < qs.hw) { const ys = isl.height(sx, sz); if (Math.abs(ys - qs.y) > 0.05) bad(`${upper}: dekket ${6 * sgn} m fra krysset gir ${f1(ys)} m, ikke ${f1(qs.y)} m`); }
  }
}
const tro = world.islands.find(i => i.id === 'tromoya');
if (tro) {
  console.log('   Undergangene i Arendal');
  underpass(tro, 'Bendiksklev', 'Kastellveien', -5635, 1017);
  underpass(tro, 'Trommestadveien', 'Vikaveien', -5632, 2269);
}

// ---------------------------------------------------------------- 3) driving under and over
// a polyline (world, [[x, z], …]) along road ri through the point (x,z), from up to `before` m before it to up to `after` m after
// it (backwards when rev), on through the pieces that join it end to end (the same name first, then the straightest, never a turn
// over 60°), and ending before the next bridge: one that is not road `own` (the bridge the line is to cross, or none)
function through(isl, ri, x, z, before, after, rev, own = -1) {
  const R = isl.roads.roads, used = new Set([ri]), pts = [], P = (ci, i) => { const r = R[ci]; return [r.p[i * 3] + isl.ox, r.p[i * 3 + 1] + isl.oz, ci !== own && !!r.b && r.b.includes(i)]; };
  for (let i = 0; i < R[ri].p.length / 3; i++) pts.push(P(ri, i));
  for (const end of [true, false]) for (let L = 0; L < 400;) {
    const e = end ? pts[pts.length - 1] : pts[0], f = end ? pts[pts.length - 2] : pts[1], hx = e[0] - f[0], hz = e[1] - f[1]; let best = null, score = 0.5;
    R.forEach((c, ci) => {
      if (used.has(ci)) return; const n = c.p.length / 3;
      for (const [i0, i1] of [[0, 1], [n - 1, n - 2]]) {
        const a = P(ci, i0), b = P(ci, i1); if (Math.hypot(a[0] - e[0], a[1] - e[1]) > 0.5) continue;
        const cos = (hx * (b[0] - a[0]) + hz * (b[1] - a[1])) / (Math.hypot(hx, hz) * Math.hypot(b[0] - a[0], b[1] - a[1]) || 1), sc = cos + (c.n && c.n === R[ri].n ? 2 : 0);
        if (cos >= 0.5 && sc > score) { score = sc; best = [ci, i0 === 0]; }
      }
    });
    if (!best) break;
    const [ci, fwd] = best, n = R[ci].p.length / 3, add = []; used.add(ci); L += R[ci].len;
    for (let k = 1; k < n; k++) add.push(P(ci, fwd ? k : n - 1 - k));
    if (end) pts.push(...add); else pts.unshift(...add.reverse());
  }
  // the point's station along the chain, then out from it each way as far as asked or up to the next bridge
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let i0 = 0, s0 = 0, bd = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], ex = pts[i + 1][0] - ax, ez = pts[i + 1][1] - az, l = Math.hypot(ex, ez) || 1e-9, t = clamp(((x - ax) * ex + (z - az) * ez) / (l * l), 0, 1), d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < bd) { bd = d; i0 = i; s0 = cum[i] + t * l; }
  }
  const [ahead, back] = rev ? [before, after] : [after, before]; let a = i0 + 1, b = i0;
  while (a < pts.length && !pts[a][2] && cum[a] <= s0 + ahead) a++;
  while (b >= 0 && !pts[b][2] && cum[b] >= s0 - back) b--;
  const line = pts.slice(b + 1, a).map(p => [p[0], p[1]]); line.s0 = rev ? cum[a - 1] - s0 : s0 - cum[b + 1];      // s0: metres to the point
  return rev ? line.reverse() : line;
}
const lineLen = line => { let L = 0; for (let i = 1; i < line.length; i++) L += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]); return L; };
// the world the drives see: the game's own, but the houses along these streets have box colliders reaching into the road (K2 in
// the review), and they are not what this test is about, so they are left out
const noHouses = (x, z, r) => world.colliders(x, z, r).filter(c => c.kind !== 'house');
const W = { get wet() { return world.wet; }, height: (x, z, bare, ref) => world.height(x, z, bare, ref), surface: (x, z, ref) => world.surface(x, z, ref), water: (x, z) => world.water(x, z),
  normal: (x, z, out, ref) => world.normal(x, z, out, ref), colliders: noHouses };
// pure pursuit along the line at kmh (as tools/test-courses.mjs drives). Measures the lowest up.y, and within 30 m of the crossing
// (at: {x, z}) the speed normal to the car's body (0 on a smooth road at any grade, large when the car is launched) and the highest
// ride over the ground (at the level the car stands at, as vehicle.js asks); over the bridge with road index br, how low the car's
// centre of mass came above the deck
function drive(line, kmh, at, br, maxT = 40) {
  const spec = CARS.find(c => c.id === 'ravn'), car = new Vehicle(spec);
  const [x0, z0] = line[0], [x1, z1] = line[1];
  car.place(W, x0, z0, Math.atan2(x1 - x0, z1 - z0)); for (let i = 0; i < 400; i++) car.step(DT, W);
  const want = kmh / 3.6, m = line.length, r = { t: 0, maxVn: 0, maxVy: 0, minUp: 1, maxRide: 0, overDeck: 1e9, onDeck: 0, hits: 0, done: false, top: 0 };
  let seg = 0, lastHit = null;
  while (r.t < maxT) {
    const la = Math.max(6, car.speed * 0.55);
    while (seg < m - 1 && Math.hypot(line[seg][0] - car.pos.x, line[seg][1] - car.pos.z) < la) seg++;
    if (seg >= m - 1 && Math.hypot(line[m - 1][0] - car.pos.x, line[m - 1][1] - car.pos.z) < la) { r.done = true; break; }
    const dx = line[seg][0] - car.pos.x, dz = line[seg][1] - car.pos.z, fx = car.fw.x, fz = car.fw.z, a = Math.atan2(fz * dx - fx * dz, fx * dx + fz * dz);
    car.input.steer = clamp(Math.atan(2 * spec.wb * Math.sin(a) / Math.max(la, Math.hypot(dx, dz))) / car.steerMax, -1, 1);
    const v = car.speed; car.input.gas = v < want ? Math.min(1, (want - v) * 0.3 + 0.15) : 0; car.input.brake = v > want + 1 ? Math.min(1, (v - want) * 0.25) : 0;
    car.step(DT, W); r.t += DT;
    r.minUp = Math.min(r.minUp, car.up.y); r.top = Math.max(r.top, car.kmh);
    if (Math.hypot(car.pos.x - at.x, car.pos.z - at.z) < 30) {
      r.maxVn = Math.max(r.maxVn, Math.abs(car.vel.dot(car.up))); r.maxVy = Math.max(r.maxVy, Math.abs(car.vel.y));
      r.maxRide = Math.max(r.maxRide, car.pos.y - W.height(car.pos.x, car.pos.z, false, car.pos.y - car.cgH));
    }
    if (br != null) { const isl = world.islandAt(car.pos.x, car.pos.z), { b } = levels(isl, car.pos.x, car.pos.z); if (b && b.road === br && b.d < b.hw) { r.onDeck++; r.overDeck = Math.min(r.overDeck, car.pos.y - b.y); } }
    if (car.lastHit && car.lastHit !== lastHit) { lastHit = car.lastHit; r.hits++; }
  }
  r.x = car.pos.x; r.z = car.pos.z; r.cgH = car.cgH;
  return r;
}
function report(what, r, br) {
  const s = `${what.padEnd(58)} ${r.done ? 'fram' : 'STOPPET ved ' + f0(r.x) + ',' + f0(r.z)} ${f0(r.t)} s, topp ${f0(r.top)} km/t, fart normalt ${f2(r.maxVn)} m/s (loddrett ${f2(r.maxVy)}), min up.y ${f2(r.minUp)}, høyde over bakken ${f2(r.maxRide)} m, treff ${r.hits}`;
  console.log('   ' + s + (br != null ? `, på dekket ${f0(r.onDeck * DT * 1000)} ms, tyngdepunktet minst ${r.onDeck ? f2(r.overDeck) : '–'} m over dekket` : ''));
}
console.log('3) Kjøring i 40 km/t under og over bruene fra del 2');
for (const c of X) {
  const R = c.isl.roads.roads, up = R[c.br], lo = R[c.gr], at = `(${f0(c.x)}, ${f0(c.z)})`;
  const runs = [];
  if (lo.c <= 5) for (const rev of [false, true]) runs.push([`${name(lo)} under ${name(up)} ${at}${rev ? ' tilbake' : ''}`, through(c.isl, c.gr, c.x, c.z, 120, 30, rev), null]);
  if (up.c <= 5) for (const rev of [false, true]) runs.push([`${name(up)} over ${name(lo)} ${at}${rev ? ' tilbake' : ''}`, through(c.isl, c.br, c.x, c.z, 60, 25, rev, c.br), c.br]);
  for (const [what, line, br] of runs) {
    const L = lineLen(line), key = `${f0(c.x)},${f0(c.z)}`;
    if (line.length < 3 || line.s0 < 20 || L - line.s0 < 10) {
      const why = `veien går bare ${f0(line.s0 || 0)} m fram til krysset og ${f0(L - (line.s0 || 0))} m videre før den slutter, svinger brått eller kommer til en annen bru`;
      if (BROKEN.includes(key)) console.log(`   ${what}: ikke kjørt, ${why} (kjent feil i veidataene)`); else bad(`${what}: kan ikke kjøres, ${why}`);
      continue;
    }
    const r = drive(line, 40, c, br); report(`${what} (${f0(lineLen(line))} m)`, r, br);
    if (!r.done) bad(`${what}: kom ikke fram (${f0(r.x)}, ${f0(r.z)})`);
    if (r.minUp < 0.9) bad(`${what}: bilen veltet (up.y ${f2(r.minUp)})`);
    if (r.maxVn >= 2) bad(`${what}: bilen ble kastet (${f2(r.maxVn)} m/s normalt på bilen)`);
    if (r.maxRide > r.cgH + 0.6) bad(`${what}: bilen lettet ${f2(r.maxRide - r.cgH)} m fra bakken`);
    if (br != null && !r.onDeck) bad(`${what}: bilen var aldri på dekket`);
    if (br != null && r.overDeck < r.cgH - 0.25) bad(`${what}: bilen falt ned i sporet til veien under (tyngdepunktet ${f2(r.overDeck)} m over dekket; sim/physics/vehicle.js må gi world.height nivået bilen står på)`);
  }
}

console.log(fails ? `\n${fails} FEIL` : '\nalt i orden');
process.exit(fails ? 1 : 0);
