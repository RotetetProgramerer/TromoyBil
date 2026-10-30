// The marinas: harbours where the car can be swapped for a boat, and the boat races that start there. World metres (x east, z south).
// A marina has its own frame: s metres out from the road (towards the sea along out, a heading in radians: direction (sin, cos)) and
// a metres along the shore (+ to the right looking out). The quay, kiosk, gangway and pontoon lie in that frame; race buoys in the world.
// Races: gates in order, [x, z] or [x, z, width]; the first is the start, the last the finish (the same place as the start makes a
// round). pace: the mean speed (knots) for three stars. The routes are checked against the depth: node tools/test-boat-races.mjs
export const MARINAS = [
  { id: 'tromoy', island: 'tromoya', name: 'Tromøy marina', sign: 'TROMØY MARINA', sub: 'båtutleie · båtløp · kiosk', where: 'Tromøysundet',
    at: { x: 16, z: -1760, y: 2.25 }, out: -2.55,
    quay: { s0: 3, s1: 17, a0: -5, a1: 14 }, kiosk: { s: 12.5, a: 9, w: 7, d: 5.6 }, park: { s: 8, a: 1, r: 13 },
    gangway: { s0: 17, s1: 36, a: -1.5, w: 1.8 }, pontoon: { s0: 36, s1: 80, a: -1.5, w: 2.4 }, head: { s: 80, a0: -32, a1: 30, w: 2.4 },
    berth: { s: 88, a: -1.5 },
    // boats at the pontoon: [boat, s, a, heading relative to out]
    moored: [['motorbat', 84.5, -24, 1.571], ['jolle', 52, 2.6, 0], ['jolle', 60, -5.6, 0], ['racer', 85.5, 18, -1.571], ['motorbat', 68, 3.4, 0]],
    races: [
      { id: 'skibviga', name: 'Skibviga rundt', diff: 1, boat: 'jolle', pace: 19, w: 34,
        desc: 'En kort runde i Skibviga rett utenfor marinaen. Rolig vann og god plass: fin for jolla.',
        gates: [[-57, -1868], [180, -2080], [-60, -2130], [-240, -1960], [-330, -1720], [-180, -1720], [-57, -1868]] },
      { id: 'sundet', name: 'Tromøysundet', diff: 2, boat: 'motorbat', pace: 32, w: 34,
        desc: 'Sørvestover i sundet med slalåm mellom bøyene i det store bassenget, og tilbake på den andre siden.',
        gates: [[-150, -1830], [-420, -1660], [-660, -1497], [-900, -1250], [-1150, -1260], [-1250, -1050], [-1450, -950], [-1500, -700], [-1750, -470], [-1600, -560], [-1350, -720], [-1150, -950], [-950, -1150], [-780, -1340], [-600, -1560], [-380, -1690], [-150, -1830]] },
      { id: 'kongshavn', name: 'Kongshavn-slalåm', diff: 2, boat: 'motorbat', pace: 31, w: 30,
        desc: 'Nordøstover i det smale sundet forbi Kongshavn: tett slalåm mellom bøyene, så snu og full fart hjem.',
        gates: [[-51, -1995], [119, -2103], [332, -2158], [464, -2313], [658, -2391], [774, -2565], [946, -2672], [1105, -2792], [1310, -2858], [1414, -3046], [1603, -3131], [1908, -3492], [1581, -3158], [1288, -2885], [924, -2699], [486, -2286], [119, -2103], [-51, -1995]] },
      { id: 'skagerrak', name: 'Ut til Skagerrak', diff: 3, boat: 'racer', pace: 46, w: 40,
        desc: 'Det lange løpet: gjennom sundet nordøstover, ut på åpent hav og rundt merket utenfor nordspissen av Tromøya, så tilbake samme vei. For racerbåten.',
        gates: [[-51, -1995], [310, -2185], [796, -2538], [1288, -2885], [1757, -3359], [2207, -3763], [2638, -4029], [3168, -4060], [3435, -4217], [3802, -4355], [4150, -4700], [4800, -4930], [5450, -4950], [5450, -4790], [4750, -4800], [4100, -4640], [3538, -4274], [3268, -4070], [2858, -4050], [2331, -3935], [1908, -3492], [1436, -3019], [924, -2699], [486, -2286], [-51, -1995]] },
      { id: 'natt', name: 'Nattseilasen', diff: 2, boat: 'motorbat', pace: 25, w: 34, night: true,
        desc: 'Skibviga etter mørkets frembrudd: finn bøyene i lyset fra blinkene, og hold øye med land.',
        gates: [[-57, -1868], [-250, -1980], [-330, -1720], [-150, -1760], [150, -2060], [-50, -2120], [-57, -1868]] },
    ] },
];
// a point in the marina's frame (s out from the road, a along the shore) → world [x, z]
export function marinaPoint(m, s, a) { const ux = Math.sin(m.out), uz = Math.cos(m.out); return [m.at.x + ux * s - uz * a, m.at.z + uz * s + ux * a]; }
// where a race puts the boat (behind the start gate, pointing through it) and the line it follows: [[x, z], …]
export function raceStart(r) { const [a, b] = r.gates, h = Math.atan2(b[0] - a[0], b[1] - a[1]); return { x: a[0] - Math.sin(h) * 35, z: a[1] - Math.cos(h) * 35, h }; }
export function raceLine(m, r) { const s = raceStart(r); return [[s.x, s.z], ...r.gates.map(g => [g[0], g[1]])]; }
// a race ready to run: the gates with their heading (along the route; a round's finish shares the start gate's buoys) and width,
// the length, and the times for three and two stars (from pace)
export function prepRace(m, r) {
  const P = r.gates, G = P.map((p, i) => {
    let dx = 0, dz = 0;
    for (const [a, b] of [[P[i - 1], p], [p, P[i + 1]]]) { if (!a || !b) continue; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; dx += (b[0] - a[0]) / l; dz += (b[1] - a[1]) / l; }
    return { x: p[0], z: p[1], w: p[2] || r.w || 30, h: Math.atan2(dx, dz) };
  });
  const n = G.length, loop = n > 2 && Math.hypot(G[0].x - G[n - 1].x, G[0].z - G[n - 1].z) < 1;
  if (loop) G[n - 1].h = G[0].h;
  const start = raceStart(r); let len = Math.hypot(G[0].x - start.x, G[0].z - start.z);
  for (let i = 1; i < n; i++) len += Math.hypot(G[i].x - G[i - 1].x, G[i].z - G[i - 1].z);
  const t3 = len / (r.pace * 0.514444);
  return Object.assign({}, r, { key: 'baat/' + r.id, G, loop, start, len: Math.round(len), par: [Math.round(t3), Math.round(t3 / 0.8)], marina: m });
}
// through a gate: the boat went from along0 to along1 (metres past the gate line along its heading) at lat (metres across)
export function gateCrossed(G, along0, along1, lat) { return along0 != null && Math.sign(along1) !== Math.sign(along0) && Math.abs(along1 - along0) < 60 ? (Math.abs(lat) < G.w / 2 + 0.6 ? 'in' : 'out') : null; }
