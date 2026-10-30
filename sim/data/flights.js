// Flying from Trinnvik lufthavn: the airport (in Trinnvik's own coordinates; the runway itself comes from the island's features,
// pois.airport) and the ring flights over the archipelago. Rings are world metres: [x, z, y] (x east, z south, y above the sea) or
// [x, z, y, r] with their own radius. Every flight takes off from the north end of the runway towards the south (into the wind)
// and ends with a landing on the same runway from the north, so its last rings lie on the 3° glide path. Pure data and maths, no
// DOM: tools/test-plane-flights.mjs checks the clearance under every leg and flies them all with an autopilot.
export const WIND = { from: 200, speed: 3 };          // a light breeze from the south-south-west (degrees, m/s)
export const GLIDE = 3, AIM = 250;                     // the glide path (degrees) to a point AIM metres past the threshold
export const AIRPORT = {
  island: 'trinnvik', name: 'Trinnvik lufthavn',
  // where the car parks (it gets the offer here), the apron the planes stand on, the stands, the hangar and the second windsock
  park: { x: 1398, z: 470, r: 15, h: Math.PI / 2 },
  apron: { x0: 1386, x1: 1494, z0: 112, z1: 498 },
  stands: [{ x: 1470, z: 150 }, { x: 1470, z: 190 }, { x: 1470, z: 230 }, { x: 1470, z: 370 }, { x: 1470, z: 410 }],
  hangar: { x: 1450, z: -152.5, w: 40, h: 8 },
  sock: { x: 1772, z: 905 },
};
export const PRICE = { make: 0, falk: 1500 };
// pace: a good pilot's mean ground speed for three stars (knots) in each plane (two stars at 80 % of it)
export const FLIGHTS = [
  { id: 'oyrunden', name: 'Øyrunden', diff: 1, r: 34, pace: { make: 85, falk: 101 },
    desc: 'Ta av mot sør og fly en rolig runde rundt hele Trinnvik, høyt over sjøen. Inn på finalen fra nord, og land.',
    rings: [[10627, 10250, 120], [9500, 11000, 180], [7900, 10700, 200], [7000, 9000, 200], [7300, 7300, 200], [8700, 6000, 190], [10100, 5300, 160], [10627, 6000, 124], [10627, 7020, 70]] },
  { id: 'kysten', name: 'Langs kysten', diff: 3, r: 26, pace: { make: 85, falk: 102 },
    desc: 'Lavt og tett langs kysten av Trinnvik: forbi havna, ferjekaia og Utsikten, med skarpe svinger. Hold øye med høyden.',
    rings: [[10627, 10050, 85], [9500, 10350, 70], [8900, 10450, 70], [8250, 10300, 70], [7650, 9850, 70], [7250, 9200, 70], [7150, 8450, 75],
      [7350, 7750, 75], [7850, 7150, 75], [8550, 6850, 75], [9300, 6650, 75], [10050, 5950, 85], [10627, 6450, 100], [10627, 7200, 61]] },
  { id: 'oyhopp', name: 'Øyhopp østover', diff: 2, r: 34, pace: { make: 94, falk: 127 },
    desc: 'Sightseeing: over sjøen til Kaimanøya med tempelet og Apeberget, nordover til Froland, vestover til oasen på Bykkevika og rett inn på finalen hjem.',
    rings: [[10627, 10350, 135], [13000, 10600, 300], [16500, 10000, 300], [18264, 9300, 220], [19300, 8000, 230], [18800, 5700, 260], [17200, 4300, 220], [15600, 2700, 260],
      [12700, 1100, 300], [10750, 850, 200], [10650, 3600, 250], [10627, 6000, 124], [10627, 7020, 70]] },
  { id: 'tromoya', name: 'Til Tromøya og hjem', diff: 3, r: 34, pace: { make: 92, falk: 121 },
    desc: 'Den lange: vestover over havet til Tromøya, langs hele yttersiden av øya forbi Tromlingene, og hjem over Bykkevika.',
    rings: [[10627, 10350, 135], [8200, 11000, 300], [4000, 7000, 400], [400, 3300, 250], [-1400, 2800, 200], [1000, 1400, 200], [2700, -300, 200], [3700, -2500, 230],
      [7200, -1200, 400], [10700, 800, 300], [10650, 3600, 250], [10627, 6000, 124], [10627, 7020, 70]] },
  { id: 'natt', name: 'Nattflyging', diff: 2, r: 36, night: true, pace: { make: 89, falk: 115 },
    desc: 'Etter mørkets frembrudd: over lysene i havna og byen, nordover til Bykkevika, og hjem til rullebanelysene. Lys og blink på flyet hjelper deg.',
    rings: [[10627, 10350, 135], [9200, 10700, 200], [8300, 9400, 220], [8600, 7800, 220], [9800, 4500, 260], [11500, 1900, 260], [11700, 600, 250], [10900, -100, 240], [10000, 900, 240], [10650, 3600, 250], [10627, 6000, 124], [10627, 7020, 70]] },
];
export const flightById = id => FLIGHTS.find(f => f.id === id);

// the airport in world coordinates: the runway (from the island's features), its two ends, where a flight starts, the touchdown
// aim point, the car park, the apron and the stands. world: the World (sim/world/world.js)
export function airportOf(world) {
  const isl = world.islands.find(i => i.id === AIRPORT.island); if (!isl) return null;
  const a = isl.feat.pois && isl.feat.pois.airport, r = a ? a.rwy : [1727, -380, 1727, 980], ox = isl.ox, oz = isl.oz;
  const x0 = r[0] + ox, z0 = r[1] + oz, x1 = r[2] + ox, z1 = r[3] + oz, L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L, h = Math.atan2(ux, uz);
  const P = (p) => Object.assign({}, p, { x: p.x + ox, z: p.z + oz });
  const ap = AIRPORT.apron;
  return { isl, name: AIRPORT.name, y: a ? a.y : 4.6, w: a ? a.w : 30,
    rwy: { x0, z0, x1, z1, L, ux, uz, h, w: a ? a.w : 30, y: a ? a.y : 4.6 },
    start: { x: x0 + ux * 28, z: z0 + uz * 28, h }, aim: { x: x0 + ux * AIM, z: z0 + uz * AIM },
    park: P(AIRPORT.park), apron: { x0: ap.x0 + ox, x1: ap.x1 + ox, z0: ap.z0 + oz, z1: ap.z1 + oz },
    stands: AIRPORT.stands.map(P), hangar: P(AIRPORT.hangar), sock: P(AIRPORT.sock), ox, oz };
}
// along the runway (m from the threshold, x0 end) and across it (m to the left of the centre line, looking along it)
export function runwayFrame(A, x, z) { const R = A.rwy, dx = x - R.x0, dz = z - R.z0; return { s: dx * R.ux + dz * R.uz, t: dx * R.uz - dz * R.ux }; }
export const onRunway = (A, x, z, m = 0) => { const f = runwayFrame(A, x, z); return f.s > -m && f.s < A.rwy.L + m && Math.abs(f.t) < A.rwy.w / 2 + m; };
export const onApron = (A, x, z) => x > A.apron.x0 && x < A.apron.x1 && z > A.apron.z0 && z < A.apron.z1;
// the world as the plane's physics sees it: colliders the car's world registers without a top (sign posts, lamp posts) would reach
// the sky for a plane; they get one 12 m over the ground
export function planeWorld(world) {
  const fix = new WeakMap(), out = [];
  return Object.assign(Object.create(world), { colliders(x, z, r) {
    out.length = 0;
    for (const c of world.colliders(x, z, r)) { if (c.y1 != null) { out.push(c); continue; } let f = fix.get(c); if (!f) fix.set(c, f = Object.assign({}, c, { y1: world.height(c.x, c.z) + 12 })); out.push(f); }
    return out;
  } });
}
// the wind as a world velocity (m/s, the air moving towards where it goes)
export function windVel(w = WIND) { const a = w.from * Math.PI / 180; return { x: -Math.sin(a) * w.speed, y: 0, z: Math.cos(a) * w.speed }; }
// the height of the glide path at (x, z) (above the sea), for the approach
export function glideY(A, x, z) { const f = runwayFrame(A, x, z); return A.rwy.y + Math.max(0, AIM - f.s) * Math.tan(GLIDE * Math.PI / 180); }

// a flight ready to fly: each ring with its centre, radius and facing (the unit normal halfway between the legs in and out; the
// first ring's leg in comes from the runway, the last ring's leg out goes to the touchdown point), the length and the star times
export function prepFlight(f, A) {
  const P = f.rings.map(p => ({ x: p[0], y: p[2], z: p[1], r: p[3] || f.r || 32 }));
  const from = { x: A.start.x + A.rwy.ux * 400, y: A.rwy.y + 10, z: A.start.z + A.rwy.uz * 400 }, to = { x: A.aim.x, y: A.rwy.y, z: A.aim.z };
  const G = P.map((p, i) => {
    const a = P[i - 1] || from, b = P[i + 1] || to; let nx = 0, ny = 0, nz = 0;
    for (const [u, v] of [[a, p], [p, b]]) { const l = Math.hypot(v.x - u.x, v.y - u.y, v.z - u.z) || 1; nx += (v.x - u.x) / l; ny += (v.y - u.y) / l; nz += (v.z - u.z) / l; }
    const l = Math.hypot(nx, ny, nz) || 1;
    return Object.assign(p, { nx: nx / l, ny: ny / l, nz: nz / l, h: Math.atan2(nx, nz), i });
  });
  let len = Math.hypot(G[0].x - A.start.x, G[0].z - A.start.z);
  for (let i = 1; i < G.length; i++) len += Math.hypot(G[i].x - G[i - 1].x, G[i].z - G[i - 1].z);
  len += Math.hypot(A.aim.x - G[G.length - 1].x, A.aim.z - G[G.length - 1].z) + 300;     // the landing roll
  const par = {}; for (const [k, v] of Object.entries(f.pace)) { const t3 = len / (v * 0.514444) + 25; par[k] = [Math.round(t3), Math.round(t3 / 0.8)]; }
  return Object.assign({}, f, { key: 'fly/' + f.id, G, len: Math.round(len), par });
}
// where the plane is relative to a ring: along its normal (m past the ring's plane) and off the centre within that plane
export function ringFrame(G, x, y, z) {
  const dx = x - G.x, dy = y - G.y, dz = z - G.z, along = dx * G.nx + dy * G.ny + dz * G.nz;
  return { along, off: Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along)) };
}
// through the ring: the plane went from along0 to along1 (either way: going back for a missed ring counts); 'in' inside it, 'out'
// past it outside (missed)
export function ringCrossed(G, along0, along1, off) {
  if (along0 == null || Math.sign(along1) === Math.sign(along0) || Math.abs(along1 - along0) > 40) return null;
  return off < G.r + 1.5 ? 'in' : off < G.r * 5 ? 'out' : null;
}
// landed: on the runway, every wheel on the ground, slow and upright
export function landed(A, p) {
  const st = p.state;
  return !p.crashed && st.onGround && p.gear.every(g => g.contact) && onRunway(A, p.pos.x, p.pos.z) && Math.hypot(p.vel.x, p.vel.z) < 8 && Math.abs(st.bank) < 8 && p.up.y > 0.95;
}
// the physics' crash reasons in Norwegian
export function crashText(reason) {
  const r = reason || '';
  if (/landed on the water/.test(r)) return 'Landet på vannet';
  if (/hit the water/.test(r)) return 'Krasjet i vannet';
  const m = r.match(/collapsed: touched down at ([\d.]+)/); if (m) return 'For hard landing (' + m[1].replace('.', ',') + ' m/s)';
  if (/collapsed/.test(r)) return 'Understellet brakk';
  if (/propeller/.test(r)) return 'Propellen slo i bakken';
  if (/wing tip/.test(r)) return 'Vingetuppen traff bakken';
  if (/belly/.test(r)) return 'Buklanding';
  if (/tail/.test(r)) return 'Halen slo i bakken';
  if (/cabin/.test(r)) return 'Flyet gikk rundt';
  if (/overspeed/.test(r)) return 'For høy fart: flyet brakk';
  if (/over-g/.test(r)) return 'For mange g: vingene brakk';
  if (/hit house/.test(r)) return 'Krasjet i et hus';
  if (/hit (post|rail)/.test(r)) return 'Krasjet i en stolpe';
  if (/hit (pier|boat|buoy)/.test(r)) return 'Krasjet i havna';
  if (/hit plane/.test(r)) return 'Krasjet i et annet fly';
  if (/hit tent/.test(r)) return 'Krasjet i et telt';
  if (/hit \d+/.test(r) || /tree/.test(r)) return 'Krasjet i et tre';
  if (/hit/.test(r)) return 'Krasjet i en hindring';
  return 'Krasjet';
}
