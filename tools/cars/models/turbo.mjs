// Turbo: a low rear-engined sports coupé (the Porsche 911 Turbo of the 992 generation is the archetype; no badges or text).
// The shell is lofted through the real car's cross sections (SP911, from js/carmodel.js): round headlamps on the front wings,
// wide rear haunches with the Turbo's intakes, a full-width light bar, a raised rear wing over the louvred engine lid.
import { THREE, box, mat4, tube, extrude, rrect, cylAB, add, aim } from '../geo.mjs';
import { loft, wells } from '../body.mjs';
import { seat, dash, plate, lamp, mirror } from '../parts.mjs';

// the real car in millimetres, one row per station: [s back from the nose, floor, half width, height of the widest point, shoulder,
// crest x, crest y, edge x, edge y, top centre]. crest: the fender top at the front, the window line along the cabin, the haunch
// at the back. edge: the hood edge, the A-pillar, the roof edge, the rear window and the engine lid.
const SP911 = { axF: 1000, axR: 3450, arch: 408, len: 4535, rows: [
  [0, 400, 420, 460, 510, 300, 530, 160, 540, 540], [15, 300, 600, 450, 545, 430, 570, 230, 575, 572], [45, 230, 745, 445, 590, 545, 615, 285, 612, 602],
  [130, 180, 840, 450, 645, 640, 672, 320, 652, 642], [320, 155, 895, 470, 705, 690, 748, 350, 692, 682], [650, 145, 918, 490, 775, 700, 812, 370, 732, 722],
  [1000, 140, 922, 500, 805, 700, 845, 380, 765, 760], [1350, 135, 915, 510, 830, 735, 862, 430, 810, 805], [1650, 130, 905, 520, 850, 780, 880, 640, 885, 870],
  [1900, 125, 900, 520, 855, 785, 890, 610, 1030, 1045], [2150, 125, 900, 520, 860, 780, 900, 580, 1170, 1190], [2400, 125, 905, 530, 865, 775, 910, 565, 1245, 1268],
  [2650, 125, 915, 540, 870, 775, 920, 560, 1268, 1300], [2950, 130, 930, 560, 885, 780, 935, 560, 1252, 1288], [3200, 135, 945, 590, 905, 785, 955, 565, 1215, 1250],
  [3450, 150, 952, 620, 930, 775, 980, 560, 1150, 1185], [3700, 170, 948, 640, 955, 740, 1000, 545, 1085, 1112], [3950, 200, 932, 650, 965, 700, 1010, 540, 1040, 1060],
  [4200, 240, 905, 650, 960, 670, 1000, 540, 1012, 1030], [4400, 270, 865, 640, 940, 620, 975, 520, 985, 1002], [4500, 290, 820, 620, 905, 560, 940, 480, 950, 965],
  [4535, 320, 760, 600, 860, 500, 890, 420, 925, 938]] };
// one station between the rows: cubic Hermite through the rows (no kinks where they meet)
function spRow(s) {
  const R = SP911.rows, n = R.length; let i = 0; while (i < n - 2 && R[i + 1][0] < s) i++;
  const a = R[i], b = R[i + 1], h = b[0] - a[0], t = Math.min(1, Math.max(0, (s - a[0]) / h)), t2 = t * t, t3 = t2 * t, out = [];
  const m = (j, k) => { const p = R[Math.max(0, j - 1)], q = R[Math.min(n - 1, j + 1)]; return (q[k] - p[k]) / (q[0] - p[0]); };
  for (let k = 1; k < a.length; k++) out.push((2 * t3 - 3 * t2 + 1) * a[k] + (t3 - 2 * t2 + t) * h * m(i, k) + (3 * t2 - 2 * t3) * b[k] + (t3 - t2) * h * m(i + 1, k));
  return out;
}
// the half section: floor centre, floor corner, widest, shoulder, crest, edge, top centre (u = 0 … 6). The curve sags about 35 mm
// below the floor points between them, so they are lifted 25 mm (the lowest point is then the car's 115 mm ground clearance).
const sec = s => { const [yb, w, ym, ysh, x4, y4, x5, y5, y6] = spRow(s); return [[0, yb + 25], [w * 0.92, yb + 37], [w, ym], [w - 22, ysh], [x4, y4], [x5, y5], [0, y6]]; };

export function turbo(spec) {
  const cg = spec.cgH, T = SP911, a = spec.wb * (1 - spec.wd), zNose = a + T.axF / 1000, E = T.len, W = spec.wheel;
  const inS = (s, s0, s1) => s > s0 && s < s1, inU = (u, u0, u1) => u > u0 && u < u1;
  const mat = (s, u) => {
    if (inS(s, 12, 118) && u < 0.72) return 'trim:18';                              // front intakes
    if (inS(s, 18, 150) && inU(u, 1.12, 1.95)) return 'trim:14';
    if (s > 4385 && u < 1.05) return 'trim';                                          // diffuser
    if (u < 1) return 'trim';
    if (inS(s, 1430, 3020) && u < 1.4) return 'trim';                                 // side skirts
    if ((inS(s, 1596, 1604) || inS(s, 2876, 2884)) && inU(u, 1.15, 3.99)) return 'trim:4';   // door shut lines
    if (inS(s, 2560, 2690) && inU(u, 3.5, 3.68)) return 'trim:3';                     // door handle
    if (inS(s, 2925, 3085) && inU(u, 2.2, 2.95)) return 'trim:22';                    // the Turbo's intakes in the rear wings
    if (inS(s, 1660, 3640) && inU(u, 4, 5)) return inS(s, 1695, 3600) && inU(u, 4.1, 4.9) && !inS(s, 2915, 2945) ? 'glass' : 'trim';
    if (inS(s, 1650, 2415) && u > 5) return inS(s, 1672, 2392) && u > 5.07 ? 'glass' : 'trim';
    if (inS(s, 3140, 3760) && u > 5.06) return inS(s, 3170, 3730) && u > 5.16 ? 'glass' : 'trim';
    if (inS(s, 3777, 3791) && u > 5.45) return 'light_brake';
    if (inS(s, 3800, 4120) && u > 5.28) return 'trim:6';                              // engine lid grille
    return 'paint';
  };
  const keys = [12, 18, 118, 150, 4385, 1430, 3020, 1596, 1604, 2876, 2884, 2560, 2690, 2925, 3085, 1660, 3640, 1695, 3600, 2915, 2945, 1650, 2415, 1672, 2392, 3140, 3760, 3170, 3730, 3777, 3791, 3800, 4120, ...T.rows.map(r => r[0])];
  const arches = [{ s: T.axF, R: T.arch, yc: W.rF * 1000 }, { s: T.axR, R: T.arch, yc: W.rR * 1000 }];
  const B = loft({ len: E, sec, zNose, cgH: cg, nU: [2, 4, 4, 5, 10, 12], uLow: 1, uTop: 3, ds: 50, arches, keys, mat, glassInset: 8, capMat: ['paint', 'paint'],
    lining: { s0: 1650, s1: 3700, u0: 1.4, off: 25 } });
  const md = B.md, Y = y => y / 1000 - cg, Z = B.zOf, zT = Z(E);
  wells(md, B, arches, Math.min(spec.trackF / 2 - W.wF / 2, spec.trackR / 2 - W.wR / 2) - 0.07);
  box(md, 'trim', 1.4, 0.02, (T.axR - T.axF + 2 * T.arch) / 1000, 0.005, mat4(0, Y(150), Z((T.axF + T.axR) / 2)));
  // headlamps on the front wings: an oval black bezel, the lens, four daytime dots
  const n = new THREE.Vector3(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const sx of [1, -1]) {
    const p = B.P(300, 3.72), nn = B.N(300, 3.72); n.set(nn[0] * sx, nn[1], nn[2]); q.setFromUnitVectors(up, n);
    const M = (sxx, syy, szz, dy = 0) => new THREE.Matrix4().compose(new THREE.Vector3(sx * p[0], p[1], p[2]).addScaledVector(n, dy), q, new THREE.Vector3(sxx, syy, szz));
    add(md, 'trim', new THREE.SphereGeometry(1, 20, 10), M(0.128, 0.03, 0.178));
    add(md, 'light_head', new THREE.SphereGeometry(1, 20, 10), M(0.112, 0.036, 0.158, 0.002));
    for (const [dx, dz] of [[0.05, 0.06], [-0.05, 0.06], [0.05, -0.06], [-0.05, -0.06]])
      add(md, 'light_drl', new THREE.SphereGeometry(1, 8, 4), new THREE.Matrix4().compose(new THREE.Vector3(sx * p[0], p[1], p[2]).addScaledVector(n, 0.034).add(new THREE.Vector3(dx * 0.6, 0, dz * 0.75).applyQuaternion(q)), q, new THREE.Vector3(0.022, 0.006, 0.012)));
    // indicator and daytime strips over the side intakes, side markers
    const f = B.P(60, 1.95), fn = B.N(60, 1.95);
    lamp(md, 'light_ind_' + (sx > 0 ? 'L' : 'R'), rrect(0.16, 0.018, 0.008), [sx * f[0], f[1] + 0.012, f[2]], [sx * fn[0], fn[1], fn[2]], 0.008);
  }
  plate(md, [0, Y(468), zNose + 0.006], [0, -0.05, 1]);
  // the tail: the light bar across the car, brake and indicator sections, reverse lamps, plate, diffuser, tailpipes
  const yL = 830, xL = B.xAt(E, Y(yL)) - 0.018;
  box(md, 'trim', xL * 2 + 0.01, 0.062, 0.008, 0.002, mat4(0, Y(yL - 10), zT - 0.002));
  box(md, 'light_tail', xL * 2, 0.026, 0.012, 0.003, mat4(0, Y(yL), zT - 0.004));
  for (const sx of [1, -1]) {
    box(md, 'light_brake', 0.24, 0.032, 0.012, 0.003, mat4(sx * (xL - 0.16), Y(yL - 16), zT - 0.006));
    box(md, 'light_ind_rear_' + (sx > 0 ? 'L' : 'R'), 0.06, 0.03, 0.012, 0.003, mat4(sx * (xL - 0.02), Y(yL - 14), zT - 0.006));
    box(md, 'light_reverse', 0.08, 0.025, 0.012, 0.003, mat4(sx * 0.2, Y(yL - 22), zT - 0.006));
    const tp = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 16);
    add(md, 'chrome', tp, mat4(sx * 0.42, Y(380), zT + 0.025, Math.PI / 2, 0, 0, 1.5, 1, 0.75));
    add(md, 'trim', new THREE.CylinderGeometry(0.036, 0.036, 0.082, 14), mat4(sx * 0.42, Y(380), zT + 0.023, Math.PI / 2, 0, 0, 1.5, 1, 0.75));
  }
  plate(md, [0, Y(540), zT - 0.004], [0, 0, -1]);
  box(md, 'trim', 1.3, 0.105, 0.006, 0.002, mat4(0, Y(395), zT - 0.002));
  // the rear wing on two struts over the engine lid, and louvres in the lid grille
  { const s = 4330, deck = B.P(s, 6)[1], wy = Y(1080), wz = Z(s), hw = B.P(s, 5)[0] - 0.03;
    box(md, 'paint', hw * 2, 0.02, 0.26, 0.009, mat4(0, wy, wz, 0.06));
    box(md, 'paint', hw * 2, 0.014, 0.025, 0.005, mat4(0, wy + 0.01, wz - 0.12));
    for (const sx of [1, -1]) box(md, 'trim', 0.014, wy - deck, 0.05, 0.004, mat4(sx * 0.22, (wy + deck) / 2, wz + 0.01)); }
  for (let s = 3830; s < 4110; s += 40) { const p = B.P(s, 6); box(md, 'chassis', 0.5, 0.006, 0.012, 0.002, mat4(0, p[1] - 0.004, p[2])); }
  // door mirrors at the foot of the A-pillars
  for (const sx of [1, -1]) { const p = B.P(1730, 4); mirror(md, [sx * p[0], p[1] + 0.02, p[2]], sx, { w: 0.17, h: 0.09, d: 0.08, out: 0.05 }); }
  // inside: dash, two sport seats, the small rear seats
  dash(md, 0.78, Y(860), Z(2250), 0.5, 0.36);
  for (const sx of [1, -1]) seat(md, sx * 0.36, Y(330), Z(2680), 0.5, 0.38, 'interior', 0.06);
  box(md, 'interior', 1.2, 0.2, 0.4, 0.04, mat4(0, Y(380), Z(3350)));
  return {
    body: md, wheels: { F: { rr: 0.254, tread: 'sport', style: 'twin', n: 5, sw: 0.03, dish: 0.03, lock: true, calA: 1.2 }, R: { rr: 0.2667, tread: 'sport', style: 'twin', n: 5, sw: 0.03, dish: 0.035, lock: true, calA: 1.9 } },
    steer: { p: [0.36, Y(760), Z(2300)], tilt: 0.33, R: 0.18 }, eye: [0.36, Y(1060), Z(2700)], exhaust: [-0.42, Y(380), zT - 0.05],
    mats: { caliper: { pbrMetallicRoughness: { baseColorFactor: [0.72, 0.05, 0.04, 1], metallicFactor: 0.3, roughnessFactor: 0.35 } }, rim: { pbrMetallicRoughness: { baseColorFactor: [0.6, 0.61, 0.63, 1] } } },
  };
}
