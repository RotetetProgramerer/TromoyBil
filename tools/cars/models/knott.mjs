// Knøtt: a monster truck. A fibreglass pickup shell high up on a tube-frame chassis, 1.7 m tyres on beadlock rims, two
// long-travel shocks per wheel, a supercharged engine behind the driver with its exhaust pipes up through the bed.
// The driver sits in the middle (as in real monster trucks). The axles are separate nodes (axle_F, axle_R) at the axle centres:
// the axle tubes, differentials and the shock shafts. They are drawn at rest; the game may move them with the wheels
// (the shock shafts slide inside the shock bodies, which belong to the body).
import { MeshData } from '../glb.mjs';
import { THREE, box, mat4, tube, extrude, rrect, cylAB, add } from '../geo.mjs';
import { loft, wells, tab } from '../body.mjs';
import { stdSec, seat, plate, lamp, roundLamp } from '../parts.mjs';

export function knott(spec) {
  const cg = spec.cgH, a = spec.wb * (1 - spec.wd), b = spec.wb * spec.wd, over = 0.825, zNose = a + over, sF = over * 1000, sR = sF + spec.wb * 1000;
  const len = Math.round((over * 2 + spec.wb) * 1000), E = len, r = spec.wheel.rF * 1000, cowl = 1700, header = 2200, cab = 3060, bed = 3110;
  const yS = tab([[0, 2420], [250, 2480], [cowl - 100, 2560], [cowl, 2570], [cab, 2600], [bed, 2620], [E, 2620]]);
  const yR = tab([[0, 2450], [250, 2510], [cowl - 100, 2590], [cowl, 2600], [header, 3320], [cab - 60, 3330], [cab, 3310], [bed, 2640], [E, 2640]]);
  const yT = tab([[0, 2480], [250, 2560], [cowl - 100, 2640], [cowl, 2645], [header, 3380], [cab - 60, 3390], [cab, 3360], [bed, 2660], [E, 2660]]);
  const p = {
    w: tab([[0, 1230], [150, 1285], [400, 1300], [E - 150, 1300], [E, 1260]]), yb: tab([[0, 1560], [400, 1470], [E - 400, 1470], [E, 1560]]), rb: 60, ym: 1900,
    wS: tab([[0, 1220], [250, 1280], [E, 1285]]), yS, ledge: 50, wR: tab([[0, 1100], [cowl, 1120], [header, 1000], [cab, 1000], [bed, 1180], [E, 1180]]), yR,
    rr: tab([[0, 25], [cowl - 50, 25], [cowl + 100, 60], [cab, 60], [bed, 15], [E, 15]]), yT,
  };
  const arches = [{ s: sF, R: 1100, Rz: 800, yc: r }, { s: sR, R: 1100, Rz: 800, yc: r }];
  const mat = (s, u) => {
    if (u < 1) return null;                                                         // the shell is open underneath
    if (u < 5) return 'paint';
    if (s > bed) return u >= 7 ? 'trim' : 'paint';                                  // a black cover over the bed
    if (u < 6) return s < cowl ? 'paint' : s < cowl + 120 ? 'trim' : s < 2620 ? 'glass' : s < 2720 ? 'trim' : s < 2960 ? 'glass' : 'paint';
    if (u < 7) return 'paint';
    return s > cowl + 18 && s < header - 18 ? 'glass' : s > cowl - 80 && s <= cowl + 18 ? 'trim' : 'paint';
  };
  const keys = [...new Set([...yS.keys, ...yR.keys, ...yT.keys, cowl + 120, cowl + 18, header - 18, cowl - 80, 2620, 2720, 2960])];
  const B = loft({ len, sec: stdSec(p), zNose, cgH: cg, nU: [1, 2, 2, 3, 2, 3, 3, 5], ds: 80, arches, round: [70, 70], keys, creaseS: [cowl, cab, bed], creaseU: [4], mat,
    lining: { s0: 0, s1: E, u0: 1, off: 8, mat: 'trim' } });
  const md = B.md, Y = y => y / 1000 - cg, Z = B.zOf, zf = zNose, zr = Z(E);
  wells(md, B, arches, 0.9);
  // the tube chassis: two rails low and high, the cage round the driver, shock towers over the axles, bumpers
  const T = (pts, rad = 0.045) => { tube(md, 'chassis', pts, rad, 0.12, 8); tube(md, 'chassis', pts.map(q => [-q[0], q[1], q[2]]), rad, 0.12, 8); };
  const yl = Y(1050), yh = Y(1750), xr = 0.55;
  T([[xr, yl, 2.35], [xr, yl, -2.35]]); T([[0.6, yh, 2.1], [0.6, yh, -2.1]]);
  for (const z of [2.1, 1.2, 0.5, -0.5, -1.2, -2.1]) T([[xr, yl, z], [0.6, yh, z + (z > 0 ? -0.2 : 0.2)]], 0.035);
  for (const z of [2.1, 0.5, -0.5, -2.1]) tube(md, 'chassis', [[-0.6, yh, z], [0.6, yh, z]], 0.035, 0.05, 8);
  for (const z of [2.35, -2.35, 0.9, -0.9]) tube(md, 'chassis', [[-xr, yl, z], [xr, yl, z]], 0.035, 0.05, 8);
  for (const z of [0.6, -0.35]) tube(md, 'chassis', [[0.6, yh, z], [0.5, Y(2450), z], [-0.5, Y(2450), z], [-0.6, yh, z]], 0.042, 0.15, 8);   // the cage
  T([[0.5, Y(2450), 0.6], [0.5, Y(2450), -0.35]], 0.042);
  for (const zA of [a, -b]) {                                                        // shock towers
    tube(md, 'chassis', [[-1.08, Y(1880), zA], [1.08, Y(1880), zA]], 0.05, 0.05, 8);
    T([[1.05, Y(1880), zA], [0.6, yh, zA + 0.35]], 0.04); T([[1.05, Y(1880), zA], [0.6, yh, zA - 0.35]], 0.04);
  }
  for (const [z0, z1] of [[2.35, 2.68], [-2.35, -2.68]]) {                            // tube bumpers
    tube(md, 'chassis', [[0.55, yl, z0], [0.9, Y(1150), z1], [-0.9, Y(1150), z1], [-0.55, yl, z0]], 0.05, 0.2, 8);
    tube(md, 'chassis', [[0.6, yh, z0 - Math.sign(z0) * 0.25], [0.9, Y(1150), z1]], 0.04, 0.05, 8); tube(md, 'chassis', [[-0.6, yh, z0 - Math.sign(z0) * 0.25], [-0.9, Y(1150), z1]], 0.04, 0.05, 8);
  }
  // the shocks: bodies (with coil springs on the outer ones) hang from the towers; the shafts are on the axles
  const shocks = [];
  for (const zA of [a, -b]) for (const sx of [1, -1]) for (const [x, dz, coil] of [[0.78, 0.13, false], [1.0, -0.13, true]]) {
    const top = Y(1860), bot = Y(1250), X = sx * x, z = zA + dz;
    cylAB(md, 'chrome', [X, top, z], [X, bot, z], 0.055, 12);
    cylAB(md, 'spring', [X, top + 0.04, z], [X, top - 0.03, z], 0.075, 12);
    if (coil) { const P = []; for (let i = 0; i <= 48; i++) { const t = i / 8 * Math.PI * 2; P.push([X + Math.cos(t) * 0.085, top - 0.05 - i / 48 * 0.5, z + Math.sin(t) * 0.085]); } tube(md, 'spring', P, 0.014, 0.0, 5); }
    shocks.push([X, z, zA]);
  }
  // the engine behind the driver: block, supercharger, exhaust pipes up through the bed cover
  box(md, 'chassis', 0.7, 0.55, 0.9, 0.06, mat4(0, Y(1550), -1.05));
  box(md, 'silver', 0.36, 0.25, 0.55, 0.04, mat4(0, Y(1950), -1.05));
  box(md, 'chrome', 0.3, 0.16, 0.22, 0.03, mat4(0, Y(2150), -1.05));
  for (const sx of [1, -1]) for (let i = 0; i < 4; i++) {
    const z = -0.78 - i * 0.18; tube(md, 'chrome', [[sx * 0.36, Y(1500), z], [sx * 0.5, Y(1600), z], [sx * 0.55, Y(2850), z - 0.05]], 0.035, 0.12, 8);
  }
  // the shell's lamps, grille and plates
  for (const sx of [1, -1]) {
    roundLamp(md, [sx * 0.85, Y(2250), zf + 0.004], [0, 0, 1], 0.13, { bezel: 'chrome' });
    lamp(md, 'light_ind_' + (sx > 0 ? 'L' : 'R'), rrect(0.16, 0.07, 0.02), [sx * 1.08, Y(2080), zf - 0.02], [0, 0, 1], 0.012);
    lamp(md, 'light_tail', rrect(0.16, 0.3, 0.03), [sx * 1.1, Y(2350), zr - 0.004], [0, 0, -1], 0.015);
    lamp(md, 'light_brake', rrect(0.12, 0.1, 0.02), [sx * 1.1, Y(2280), zr - 0.016], [0, 0, -1], 0.008);
    lamp(md, 'light_ind_rear_' + (sx > 0 ? 'L' : 'R'), rrect(0.12, 0.06, 0.02), [sx * 1.1, Y(2440), zr - 0.016], [0, 0, -1], 0.008);
    lamp(md, 'light_reverse', rrect(0.12, 0.05, 0.02), [sx * 1.1, Y(2150), zr - 0.016], [0, 0, -1], 0.008);
    lamp(md, 'light_drl', rrect(0.3, 0.03, 0.012), [sx * 0.85, Y(2060), zf - 0.01], [0, 0, 1], 0.008);
  }
  extrude(md, 'chrome', rrect(1.2, 0.42, 0.05), 0.03, 0.008, mat4(0, Y(2200), zf - 0.01), [rrect(1.12, 0.34, 0.04).reverse()]);
  box(md, 'trim', 1.12, 0.34, 0.01, 0.003, mat4(0, Y(2200), zf + 0.002));
  for (let i = 0; i < 4; i++) box(md, 'chrome', 1.08, 0.025, 0.02, 0.006, mat4(0, Y(2080) + i * 0.08, zf + 0.008));
  plate(md, [0, Y(1250), 2.69], [0, 0, 1]); plate(md, [0, Y(1250), -2.69], [0, 0, -1]);
  box(md, 'light_brake', 0.5, 0.03, 0.03, 0.008, mat4(0, Y(3335), Z(cab - 10)));
  // inside: the driver's seat in the middle of the cage, a small dash
  seat(md, 0, Y(2000), 0.25, 0.5, 0.25);
  box(md, 'trim', 2.3, 0.5, 0.8, 0.04, mat4(0, Y(2380), Z(cowl) - 0.05));                  // dashboard: closes the cab off from the engine bay
  box(md, 'trim', 0.3, 0.06, 0.14, 0.02, mat4(0, Y(2650), Z(cowl) - 0.38));
  // the axles: tube, differential, the shock shafts and the links to the frame (in each axle's own frame)
  const axles = [['axle_F', a], ['axle_R', -b]].map(([name, zA]) => {
    const m = new MeshData();
    cylAB(m, 'chassis', [-1.42, 0, 0], [1.42, 0, 0], 0.085, 14);
    add(m, 'chassis', new THREE.SphereGeometry(0.26, 14, 10), mat4(0.08, 0, 0, 0, 0, 0, 1, 0.9, 1.05));
    cylAB(m, 'chassis', [0.08, 0, 0], [0.08, 0, zA > 0 ? -0.35 : 0.35], 0.09, 12);
    for (const [X, z] of shocks.filter(q => q[2] === zA).map(q => [q[0], q[1] - zA])) {
      cylAB(m, 'chrome', [X, 0.09, z], [X, Y(1450) - Y(r), z], 0.026, 10);
      cylAB(m, 'chassis', [X, 0.05, z - 0.04], [X, 0.05, z + 0.04], 0.04, 10);
    }
    for (const sx of [1, -1]) cylAB(m, 'chassis', [sx * 0.5, -0.05, 0], [sx * 0.52, Y(1060) - Y(r), zA > 0 ? -0.9 : 0.9], 0.035, 8);
    return { name, t: [0, Y(r), zA], mesh: m };
  });
  return {
    body: md, wheels: { F: { rr: 0.3175, tread: 'monster', style: 'beadlock', n: 10, dish: 0.12, hub: 0.12, nuts: 8, caliper: false },
      R: { rr: 0.3175, tread: 'monster', style: 'beadlock', n: 10, dish: 0.12, hub: 0.12, nuts: 8, caliper: false } },
    steer: { p: [0, Y(2450), Z(cowl) - 0.6], tilt: 0.7, R: 0.17 }, eye: [0, Y(2880), Z(cowl) - 0.95], exhaust: [0.55, Y(2850), -0.83], nodes: axles,
    mats: { rim: { pbrMetallicRoughness: { baseColorFactor: [0.82, 0.83, 0.85, 1], metallicFactor: 0.6, roughnessFactor: 0.28 } } },
  };
}
