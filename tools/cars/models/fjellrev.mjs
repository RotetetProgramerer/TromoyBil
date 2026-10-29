// Fjellrev: a big, upright 5-door off-roader (the Toyota Land Cruiser 300 is the archetype). Long flat hood with a bulge,
// a huge grille with chrome slats between slim wide headlamps, flat sides with body-coloured over-fenders, running boards,
// black pillars, roof rails, a near-vertical tailgate with wide tail lamps joined by a chrome bar, and a roof spoiler.
import { THREE, box, mat4, tube, extrude, rrect, cylAB, add } from '../geo.mjs';
import { loft, wells, tab } from '../body.mjs';
import { stdSec, seat, bench, dash, plate, lamp, mirror, flare, surfLine, mirX, grow } from '../parts.mjs';

export function fjellrev(spec) {
  // overF: front axle to the front-most part (the grille and skid plate stand 4 cm proud of the nose, the rear bumper 5 cm)
  const cg = spec.cgH, overF = 0.95, len = Math.round(spec.dims.L * 1000) - 90, a = spec.wb * (1 - spec.wd), zNose = a + overF - 0.04, sF = (overF - 0.04) * 1000, sR = sF + spec.wb * 1000;
  const r = spec.wheel.rF * 1000, cowl = 1560, header = 2290, E = len;
  const yS = tab([[0, 1105], [200, 1122], [1400, 1148], [cowl, 1158], [2600, 1160], [3600, 1185], [E - 150, 1200], [E, 1195]]);
  const yR = tab([[0, 1138], [200, 1152], [1400, 1176], [cowl, 1188], [header, 1838], [3900, 1842], [E - 260, 1832], [E - 110, 1800], [E - 12, 1232], [E, 1218]]);
  const yT = tab([[0, 1168], [200, 1190], [1400, 1218], [cowl, 1220], [header, 1882], [3900, 1888], [E - 260, 1878], [E - 110, 1846], [E - 12, 1252], [E, 1228]]);
  const p = {
    w: tab([[0, 958], [120, 975], [400, 982], [E - 300, 985], [E - 60, 975], [E, 955]]), yb: tab([[0, 470], [300, 425], [700, 410], [E - 900, 410], [E - 300, 470], [E, 520]]),
    rb: 90, ym: 720, wS: tab([[0, 935], [250, 950], [E, 955]]), yS, ledge: 40, wR: tab([[0, 820], [cowl, 840], [header, 792], [E - 200, 782], [E, 770]]), yR, rr: 55, yT,
  };
  const arches = [{ s: sF, R: 470, Rz: 492, yc: r, p: 2.3 }, { s: sR, R: 470, Rz: 492, yc: r, p: 2.3 }];
  const gaps = [cowl + 22, 2575, 2672, 3560];
  const mat = (s, u) => {
    if (u < 1) return 'trim';
    if (u < 4) return u > 1.3 && gaps.some(g => Math.abs(s - g) < 4) ? 'trim:5' : 'paint';
    if (u < 5) return 'paint';
    if (s > E - 112) return u >= 7 && s > E - 104 && s < E - 18 ? 'glass' : 'paint';
    if (u < 6) return s < cowl ? 'paint' : s < cowl + 110 ? 'trim' : s < 2565 ? 'glass' : s < 2682 ? 'trim' : s < 3545 ? 'glass' : s < 3650 ? 'trim' : s < 4560 ? 'glass' : 'paint';
    if (u < 7) return 'paint';
    return s > cowl + 14 && s < header - 14 ? 'glass' : s > cowl - 80 && s <= cowl + 14 ? 'trim' : 'paint';
  };
  const keys = [...new Set([...yS.keys, ...yR.keys, ...yT.keys, ...gaps.flatMap(g => [g - 4, g + 4]), cowl + 14, header - 14, cowl - 80, cowl + 110, 2565, 2682, 3545, 3650, 4560, E - 112, E - 104, E - 18])];
  const B = loft({ len, sec: stdSec(p), zNose, cgH: cg, nU: [1, 3, 2, 3, 2, 3, 3, 5], ds: 60, arches, round: [60, 50], keys, creaseS: [cowl, E - 110], creaseU: [4], mat,
    lining: { s0: cowl, s1: E - 20, u0: 1.5, off: 35 } });
  const md = B.md, Y = y => y / 1000 - cg, Z = B.zOf, zf = zNose, zr = B.zOf(E);
  wells(md, B, arches, spec.trackF / 2 - spec.wheel.wF / 2 - 0.1);
  // under the car
  box(md, 'trim', 1.45, 0.02, 4.0, 0.005, mat4(0, Y(412), Z(2450)));
  for (const sx of [1, -1]) box(md, 'chassis', 0.08, 0.13, 4.3, 0.01, mat4(sx * 0.5, Y(300), Z(2500)));
  box(md, 'silver', 0.8, 0.04, 0.7, 0.01, mat4(0, Y(245), Z(sF + 50)));                       // front skid plate (independent front suspension)
  cylAB(md, 'chassis', [-0.62, Y(r), Z(sR)], [0.62, Y(r), Z(sR)], 0.05, 12);                    // rear axle
  add(md, 'chassis', new THREE.SphereGeometry(0.14, 12, 8), mat4(0, Y(r) - 0.01, Z(sR), 0, 0, 0, 1, 0.9, 1.1));
  tube(md, 'chassis', [[-0.2, Y(330), Z(1500)], [-0.35, Y(330), Z(3300)], [-0.62, Y(345), Z(E - 60)], [-0.62, Y(345), Z(E + 5)]], 0.03, 0.25);
  // the nose: big grille with a chrome frame and slats, slim headlamps, lower intake with fog lamps, skid plate, plate
  const G = [[-0.6, 0.25], [0.6, 0.25], [0.53, -0.25], [-0.53, -0.25]];
  const Gr = rnd(G, 0.06);
  extrude(md, 'chrome', grow(Gr, 0.035), 0.04, 0.01, mat4(0, Y(860), zf - 0.01), [Gr.slice().reverse()]);
  box(md, 'trim', 1.12, 0.48, 0.01, 0.002, mat4(0, Y(860), zf + 0.004));
  for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5, hw = 0.53 + 0.07 * t; box(md, 'chrome', hw * 2 - 0.05, 0.04, 0.025, 0.012, mat4(0, Y(860) - 0.25 + 0.5 * t, zf + 0.018)); }
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'L' : 'R', hl = [[0.0, 0.065], [0.33, 0.065], [0.34, -0.01], [0.26, -0.075], [0.0, -0.07]].map(([x, y]) => [sx * (0.63 + x), y]);
    const pts = hl;
    lamp(md, 'trim', grow(pts, 0.016), [0, Y(1040), zf + 0.0], [0, 0, 1], 0.014);
    lamp(md, 'chassis', pts, [0, Y(1040), zf + 0.008], [0, 0, 1], 0.016);
    for (const x of [0.06, 0.15, 0.24]) lamp(md, 'light_head', rrect(0.075, 0.075, 0.02, sx * (0.63 + x), 0.012), [0, Y(1040), zf + 0.018], [0, 0, 1], 0.008);
    lamp(md, 'light_drl', rrect(0.27, 0.014, 0.006, sx * (0.63 + 0.14), -0.055), [0, Y(1040), zf + 0.018], [0, 0, 1], 0.006);
    lamp(md, 'light_ind_' + L, rrect(0.05, 0.05, 0.01, sx * 0.92, 0.0), [0, Y(1040), zf + 0.018], [0, 0, 1], 0.006);
    lamp(md, 'light_head', rrect(0.12, 0.05, 0.02), [sx * 0.74, Y(500), zf + 0.025], [0, 0, 1], 0.012, [0, 1, 0], { w: 0.012 });
  }
  box(md, 'trim', 1.2, 0.17, 0.05, 0.02, mat4(0, Y(470), zf + 0.004));
  box(md, 'silver', 0.9, 0.06, 0.12, 0.02, mat4(0, Y(355), zf - 0.02));
  plate(md, [0, Y(475), zf + 0.034], [0, 0, 1]);
  // sides: over-fenders, running boards, mirrors, door handles, roof rails
  const prof = [[-0.01, -0.006], [0.06, -0.006], [0.06, 0.004], [0.04, 0.02], [0.0, 0.026], [-0.012, 0.02], [-0.016, 0.006]];
  for (const sx of [1, -1]) {
    for (const A of arches) flare(md, B, A, sx, prof, A.s < 2000 ? 480 : 480, 'paint');
    box(md, 'trim', 0.12, 0.05, (sR - sF - 1050) / 1000, 0.02, mat4(sx * 0.95, Y(395), Z((sF + sR) / 2)));
    box(md, 'silver', 0.1, 0.012, (sR - sF - 1080) / 1000, 0.004, mat4(sx * 0.955, Y(422), Z((sF + sR) / 2)));
    mirror(md, [sx * B.xAt(cowl + 70, Y(1205)), Y(1205), Z(cowl + 70)], sx, { w: 0.24, h: 0.17, d: 0.1 });
    const belt = surfLine(B, cowl + 105, 4565, 5.02, 0.003, 30); tube(md, 'chrome', sx > 0 ? belt : mirX(belt), 0.007, 0.02, 6);
    for (const s of [2420, 3420]) box(md, 'chrome', 0.022, 0.03, 0.16, 0.012, mat4(sx * (B.xAt(s, Y(1095)) + 0.008), Y(1095), Z(s)));
    for (const s of [2380, 3300, 4400]) box(md, 'trim', 0.05, 0.05, 0.1, 0.015, mat4(sx * 0.72, Y(1902), Z(s)));
    tube(md, 'silver', [[sx * 0.72, Y(1905), Z(2330)], [sx * 0.72, Y(1935), Z(2450)], [sx * 0.72, Y(1935), Z(4380)], [sx * 0.72, Y(1905), Z(4500)]], 0.016, 0.08, 8);
  }
  for (const x of [0.32, -0.36]) box(md, 'trim', 0.62, 0.012, 0.02, 0.005, mat4(x, Y(1205), Z(cowl + 25), 0.75, 0, 0.1));
  // the tail: wide lamps joined by a chrome bar, plate, bumper, spoiler, reverse and fog lamps, third brake light
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'L' : 'R', tl = [[0.0, 0.07], [0.48, 0.08], [0.5, -0.04], [0.42, -0.08], [0.0, -0.06]].map(([x, y]) => [sx * (0.45 + x), y]);
    lamp(md, 'light_tail', tl, [0, Y(1110), zr - 0.004], [0, 0, -1], 0.02, [0, 1, 0], { w: 0.01 });
    lamp(md, 'light_brake', rrect(0.2, 0.03, 0.01, -sx * 0.72, 0.02), [0, Y(1110), zr - 0.016], [0, 0, -1], 0.006);
    lamp(md, 'light_ind_rear_' + L, rrect(0.1, 0.025, 0.008, -sx * 0.86, -0.025), [0, Y(1110), zr - 0.016], [0, 0, -1], 0.006);
    lamp(md, 'light_reverse', rrect(0.12, 0.04, 0.012), [sx * 0.62, Y(560), zr - 0.062], [0, 0, -1], 0.01);
  }
  box(md, 'chrome', 0.86, 0.05, 0.02, 0.008, mat4(0, Y(1110), zr - 0.008));
  plate(md, [0, Y(960), zr - 0.008], [0, 0, -1]);
  box(md, 'paint', 1.9, 0.22, 0.12, 0.05, mat4(0, Y(620), zr + 0.01));
  box(md, 'trim', 1.6, 0.16, 0.1, 0.04, mat4(0, Y(470), zr + 0.01));
  box(md, 'paint', 1.5, 0.05, 0.16, 0.02, mat4(0, Y(1848), Z(E - 95), -0.1));
  box(md, 'light_brake', 0.4, 0.02, 0.02, 0.006, mat4(0, Y(1838), Z(E - 20)));
  // inside
  dash(md, 0.85, Y(1210), Z(2020), 0.5, 0.4);
  for (const sx of [1, -1]) seat(md, sx * 0.4, Y(820), Z(2370), 0.54, 0.28);
  bench(md, 1.4, Y(840), Z(3380), 0.2);
  box(md, 'interior', 1.6, 0.04, 1.0, 0.01, mat4(0, Y(800), Z(4350)));
  box(md, 'interior', 1.7, 0.6, 0.02, 0.01, mat4(0, Y(880), zr + 0.04));
  return {
    body: md, wheels: { F: { rr: 0.2286, tread: 'at', style: 'spokes', n: 6, sw: 0.05, dish: 0.035 }, R: { rr: 0.2286, tread: 'at', style: 'spokes', n: 6, sw: 0.05, dish: 0.035 } },
    steer: { p: [0.4, Y(1140), Z(2080)], tilt: 0.45, R: 0.19 }, eye: [0.4, Y(1460), Z(2440)], exhaust: [-0.62, Y(345), Z(E + 5)],
  };
}
// corners of a polygon rounded off (radius r, a few points per corner)
export function rnd(P, r, n = 4) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[(i - 1 + P.length) % P.length], b = P[i], c = P[(i + 1) % P.length];
    const da = Math.hypot(a[0] - b[0], a[1] - b[1]), dc = Math.hypot(c[0] - b[0], c[1] - b[1]), e = Math.min(r, da / 2, dc / 2);
    const s = [b[0] + (a[0] - b[0]) / da * e, b[1] + (a[1] - b[1]) / da * e], t = [b[0] + (c[0] - b[0]) / dc * e, b[1] + (c[1] - b[1]) / dc * e];
    for (let k = 0; k <= n; k++) { const u = k / n, v = 1 - u; out.push([v * v * s[0] + 2 * u * v * b[0] + u * u * t[0], v * v * s[1] + 2 * u * v * b[1] + u * u * t[1]]); }
  }
  return out;
}
