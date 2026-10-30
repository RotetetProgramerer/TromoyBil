// Vinsjen: a double-cab pickup (the Toyota Hilux of 2021 is the archetype). Four doors, an open bed with a sports bar behind
// the cab, wide black arch flares, a big trapezoid grille between slim swept headlamps, a black steel front bumper with a
// winch (node `winch`: the fairlead, where the rope leaves), vertical tail lamps on the bed corners and a step bumper.
import { MeshData } from '../glb.mjs';
import { THREE, box, mat4, tube, extrude, rrect, circle, cylAB, add } from '../geo.mjs';
import { loft, wells, tab } from '../body.mjs';
import { stdSec, seat, bench, dash, plate, lamp, mirror, flare, grow } from '../parts.mjs';

export function vinsjen(spec) {
  const cg = spec.cgH, overF = 0.92, a = spec.wb * (1 - spec.wd), zNose = a + overF - 0.14, sF = (overF - 0.14) * 1000, sR = sF + spec.wb * 1000;
  const len = Math.round(spec.dims.L * 1000) - 140 - 125, E = len, r = spec.wheel.rF * 1000, cowl = 1560, header = 2260, cab = 3290, bed = 3335;
  const rail = 1195, yS = tab([[0, 1085], [250, 1105], [1400, 1150], [cowl, 1165], [cab, 1185], [bed, rail], [E, rail]]);
  const yR = tab([[0, 1112], [250, 1130], [1400, 1176], [cowl, 1192], [header, 1745], [cab - 60, 1750], [cab, 1735], [bed, rail + 10], [E, rail + 10]]);
  const yT = tab([[0, 1140], [250, 1165], [1400, 1215], [cowl, 1222], [header, 1785], [cab - 60, 1790], [cab, 1772], [bed, rail + 11], [E, rail + 11]]);
  const p = {
    w: tab([[0, 845], [140, 880], [400, 895], [E - 200, 898], [E, 890]]), yb: tab([[0, 560], [300, 500], [700, 480], [cab, 480], [bed + 60, 640], [E, 650]]),
    rb: 70, ym: tab([[0, 760], [cab, 760], [bed + 60, 850], [E, 850]]), wS: tab([[0, 840], [250, 875], [E, 880]]), yS, ledge: 45,
    wR: tab([[0, 760], [cowl, 780], [header, 728], [cab, 725], [bed, 835], [E, 835]]), yR, rr: tab([[0, 50], [cab, 50], [bed, 10], [E, 10]]), yT,
  };
  const arches = [{ s: sF, R: 455, Rz: 478, yc: r, p: 2.6 }, { s: sR, R: 455, Rz: 478, yc: r, p: 2.6 }];
  const gaps = [cowl + 22, 2560, 3255, (cab + bed) / 2 + 10];
  const mat = (s, u) => {
    if (u < 1) return 'trim';
    if (u < 4) return u > 1.3 && gaps.some(g => Math.abs(s - g) < 4) ? 'trim:6' : 'paint';
    if (u < 5) return 'paint';
    if (s > bed + 2) return null;                                                       // the open bed
    if (u < 6) return s < cowl ? 'paint' : s < cowl + 100 ? 'trim' : s < 2540 ? 'glass' : s < 2625 ? 'trim' : s < 3215 ? 'glass' : 'paint';
    if (u < 7) return 'paint';
    return s > cowl + 14 && s < header - 14 ? 'glass' : s > cowl - 70 && s <= cowl + 14 ? 'trim' : 'paint';
  };
  const keys = [...new Set([...yS.keys, ...yR.keys, ...yT.keys, ...gaps.flatMap(g => [g - 4, g + 4]), cowl - 70, cowl + 14, header - 14, cowl + 100, 2540, 2625, 3215, bed + 2, bed + 60])];
  const B = loft({ len, sec: stdSec(p), zNose, cgH: cg, nU: [1, 3, 2, 3, 2, 3, 3, 5], ds: 60, arches, round: [70, 40], keys, creaseS: [cowl, cab, bed], creaseU: [4], mat,
    lining: { s0: cowl, s1: cab, u0: 1.5, off: 35 } });
  const md = B.md, Y = y => y / 1000 - cg, Z = B.zOf, zf = zNose, zr = B.zOf(E), xin = 0.835;
  wells(md, B, arches, spec.trackF / 2 - spec.wheel.wF / 2 - 0.1);
  // under the car: ladder frame, rear axle on leaf springs, skid plate, exhaust
  box(md, 'trim', 1.4, 0.02, 2.4, 0.005, mat4(0, Y(482), Z(2300)));
  for (const sx of [1, -1]) {
    box(md, 'chassis', 0.07, 0.15, 4.5, 0.01, mat4(sx * 0.46, Y(400), Z(2700)));
    tube(md, 'chassis', [[sx * 0.5, Y(420), Z(sR - 650)], [sx * 0.5, Y(330), Z(sR)], [sx * 0.5, Y(430), Z(sR + 650)]], 0.03, 0.5, 6);   // leaf spring
  }
  cylAB(md, 'chassis', [-0.62, Y(r), Z(sR)], [0.62, Y(r), Z(sR)], 0.05, 12);
  add(md, 'chassis', new THREE.SphereGeometry(0.135, 12, 8), mat4(0, Y(r) + 0.02, Z(sR), 0, 0, 0, 1, 0.9, 1.1));
  box(md, 'silver', 0.8, 0.04, 0.8, 0.01, mat4(0, Y(330), Z(sF + 80)));
  tube(md, 'chassis', [[-0.2, Y(400), Z(1500)], [-0.35, Y(400), Z(3500)], [-0.62, Y(440), Z(E - 220)], [-0.68, Y(440), Z(E - 160)]], 0.03, 0.2);
  // the bed: floor, inner walls, wheel tubs, the inside of the tailgate
  const bl = (E - bed - 20) / 1000, bz = Z((bed + E) / 2);
  box(md, 'trim', xin * 2, 0.02, bl, 0.005, mat4(0, Y(850), bz));
  for (const sx of [1, -1]) {
    box(md, 'trim', 0.012, (rail - 850) / 1000, bl, 0.004, mat4(sx * (xin - 0.006), Y((rail + 850) / 2), bz));
    box(md, 'trim', 0.22, 0.24, 0.98, 0.06, mat4(sx * (xin - 0.11), Y(960), Z(sR)));
  }
  box(md, 'trim', xin * 2, (rail - 850) / 1000, 0.012, 0.004, mat4(0, Y((rail + 850) / 2), Z(bed) - 0.008));
  box(md, 'trim', xin * 2, (rail - 850) / 1000, 0.012, 0.004, mat4(0, Y((rail + 850) / 2), zr + 0.035));
  box(md, 'trim', 0.24, 0.035, 0.02, 0.008, mat4(0, Y(1130), zr - 0.01));            // tailgate handle
  // the sports bar over the bed
  const yb0 = Y(rail + 5), yb1 = Y(1560), s0 = Z(bed + 110), s1 = Z(bed + 520);
  tube(md, 'chrome', [[0.74, yb0, s0], [0.74, yb1, s0], [-0.74, yb1, s0], [-0.74, yb0, s0]], 0.032, 0.12, 12);
  for (const sx of [1, -1]) tube(md, 'chrome', [[sx * 0.74, yb1 - 0.05, s0], [sx * 0.74, yb0, s1]], 0.026, 0.05, 10);
  tube(md, 'chrome', [[0.74, Y(1350), s0], [-0.74, Y(1350), s0]], 0.022, 0.05, 10);
  // the nose: trapezoid grille, slim swept headlamps
  const G = [[-0.56, 0.17], [0.56, 0.17], [0.44, -0.17], [-0.44, -0.17]];
  extrude(md, 'chassis', grow(G, 0.04), 0.03, 0.008, mat4(0, Y(890), zf - 0.008), [G.slice().reverse()]);
  box(md, 'trim', 1.1, 0.33, 0.01, 0.002, mat4(0, Y(890), zf + 0.004));
  for (let i = 0; i < 7; i++) box(md, 'chassis', 1.0 - i * 0.035, 0.01, 0.012, 0.003, mat4(0, Y(890) - 0.15 + i * 0.05, zf + 0.012));
  for (let i = 0; i < 11; i++) box(md, 'chassis', 0.01, 0.3, 0.012, 0.003, mat4(-0.45 + i * 0.09, Y(890), zf + 0.012));
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'L' : 'R', hl = [[0.0, 0.035], [0.3, 0.06], [0.33, 0.02], [0.08, -0.05], [0.0, -0.04]].map(([x, y]) => [sx * (0.57 + x), y]);
    lamp(md, 'chassis', hl, [0, Y(1030), zf + 0.002], [0, 0, 1], 0.018, [0, 1, 0], { w: 0.012 });
    lamp(md, 'light_head', rrect(0.1, 0.05, 0.02, sx * 0.66, 0.0), [0, Y(1030), zf + 0.014], [0, 0, 1], 0.01);
    lamp(md, 'light_drl', [[0.12, -0.012], [0.3, 0.035], [0.3, 0.045], [0.12, 0.0]].map(([x, y]) => [sx * (0.57 + x), y]), [0, Y(1030), zf + 0.016], [0, 0, 1], 0.006);
    lamp(md, 'light_ind_' + L, rrect(0.05, 0.025, 0.008, sx * 0.86, 0.025), [0, Y(1030), zf + 0.016], [0, 0, 1], 0.006);
  }
  // the steel bumper with the winch in a recess, a hoop over the grille, fog lamps, plate on the hoop
  const zb = zf + 0.01;                                                                // bumper centre (its face 0.12 in front of the nose)
  for (const sx of [1, -1]) {
    box(md, 'chassis', 0.62, 0.3, 0.22, 0.03, mat4(sx * 0.6, Y(560), zb));
    box(md, 'chassis', 0.12, 0.2, 0.2, 0.03, mat4(sx * 0.86, Y(590), zb - 0.05, 0, sx * 0.4));
    lamp(md, 'light_head', circle(0.05, 16), [sx * 0.62, Y(560), zb + 0.112], [0, 0, 1], 0.015, [0, 1, 0], { w: 0.012, mat: 'chrome' });
    lamp(md, 'light_ind_' + (sx > 0 ? 'L' : 'R'), rrect(0.08, 0.03, 0.01), [sx * 0.78, Y(640), zb + 0.112], [0, 0, 1], 0.008);
    tube(md, 'chassis', [[sx * 0.42, Y(700), zb + 0.02], [sx * 0.42, Y(960), zb + 0.04], [sx * 0.2, Y(1010), zb + 0.04]], 0.03, 0.08, 10);
  }
  tube(md, 'chassis', [[0.2, Y(1010), zb + 0.04], [-0.2, Y(1010), zb + 0.04]], 0.03, 0.05, 10);
  box(md, 'chassis', 0.6, 0.08, 0.22, 0.02, mat4(0, Y(450), zb));
  box(md, 'chassis', 0.6, 0.05, 0.2, 0.015, mat4(0, Y(690), zb));
  plate(md, [0, Y(440), zb + 0.115], [0, 0, 1]);
  box(md, 'trim', 1.3, 0.1, 0.12, 0.03, mat4(0, Y(720), zf - 0.03));
  const winch = new MeshData(), wz = -0.09, wy = 0;                                    // in the winch node's frame (at the fairlead)
  cylAB(winch, 'chassis', [-0.16, wy, wz], [0.16, wy, wz], 0.055, 16);
  cylAB(winch, 'spring', [-0.12, wy, wz], [0.12, wy, wz], 0.062, 16);                  // the rope wound on the drum
  cylAB(winch, 'chassis', [0.16, wy, wz], [0.27, wy, wz], 0.075, 14);                   // motor
  box(winch, 'chassis', 0.07, 0.15, 0.15, 0.02, mat4(-0.2, wy, wz));                     // gearbox
  box(winch, 'chrome', 0.22, 0.1, 0.03, 0.012, mat4(0, wy, -0.012));                     // fairlead
  box(winch, 'trim', 0.12, 0.04, 0.035, 0.015, mat4(0, wy, -0.01));
  // sides: wide flares, steps, mirrors, handles
  const prof = [[-0.012, -0.006], [0.085, -0.006], [0.085, 0.006], [0.07, 0.026], [0.0, 0.042], [-0.016, 0.034], [-0.02, 0.01]];
  for (const sx of [1, -1]) {
    for (const A of arches) flare(md, B, A, sx, prof, A.s < 2000 ? 600 : 650);
    box(md, 'trim', 0.16, 0.035, (sR - sF - 1060) / 1000, 0.01, mat4(sx * 0.86, Y(430), Z((sF + sR) / 2)));
    for (const sz of [-0.5, 0.5]) box(md, 'chassis', 0.04, 0.06, 0.04, 0.005, mat4(sx * 0.82, Y(460), Z((sF + sR) / 2) + sz));
    mirror(md, [sx * B.xAt(cowl + 80, Y(1200)), Y(1200), Z(cowl + 80)], sx, { w: 0.22, h: 0.16, d: 0.1, mat: 'chrome' });
    for (const s of [2420, 3150]) box(md, 'chrome', 0.022, 0.03, 0.15, 0.012, mat4(sx * (B.xAt(s, Y(1095)) + 0.008), Y(1095), Z(s)));
  }
  for (const x of [0.32, -0.36]) box(md, 'trim', 0.6, 0.012, 0.02, 0.005, mat4(x, Y(1210), Z(cowl + 25), 0.7, 0, 0.1));
  // the back of the cab: rear window and third brake light
  extrude(md, 'trim', rrect(1.06, 0.3, 0.05), 0.01, 0.003, mat4(0, Y(1530), Z(cab + 8) - 0.002, 0, Math.PI));
  extrude(md, 'glass', rrect(1.0, 0.26, 0.04), 0.008, 0.002, mat4(0, Y(1530), Z(cab + 8) - 0.008, 0, Math.PI));
  box(md, 'light_brake', 0.3, 0.025, 0.02, 0.006, mat4(0, Y(1740), Z(cab + 30)));
  // the tail: vertical lamps on the bed corners, step bumper, plate
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'L' : 'R', c = [sx * 0.82, Y(1030), zr - 0.004];
    lamp(md, 'trim', rrect(0.13, 0.32, 0.03), c, [0, 0, -1], 0.022);
    lamp(md, 'light_tail', rrect(0.1, 0.12, 0.02, 0, 0.09), [c[0], c[1], c[2] - 0.01], [0, 0, -1], 0.012);
    lamp(md, 'light_brake', rrect(0.1, 0.06, 0.015, 0, -0.01), [c[0], c[1], c[2] - 0.01], [0, 0, -1], 0.012);
    lamp(md, 'light_ind_rear_' + L, rrect(0.1, 0.045, 0.012, 0, -0.075), [c[0], c[1], c[2] - 0.01], [0, 0, -1], 0.012);
    lamp(md, 'light_reverse', rrect(0.1, 0.03, 0.01, 0, -0.125), [c[0], c[1], c[2] - 0.01], [0, 0, -1], 0.01);
  }
  box(md, 'chrome', 1.78, 0.16, 0.16, 0.04, mat4(0, Y(560), zr - 0.04));
  box(md, 'trim', 0.6, 0.03, 0.12, 0.01, mat4(0, Y(645), zr - 0.06));
  plate(md, [0, Y(555), zr - 0.122], [0, 0, -1]);
  // inside
  dash(md, 0.78, Y(1205), Z(1800), 0.5, 0.38);
  for (const sx of [1, -1]) seat(md, sx * 0.38, Y(810), Z(2180), 0.52, 0.26);
  bench(md, 1.35, Y(830), Z(3000), 0.12);
  return {
    body: md, wheels: { F: { rr: 0.2286, tread: 'at', style: 'spokes', n: 6, sw: 0.055, dish: 0.03 }, R: { rr: 0.2286, tread: 'at', style: 'spokes', n: 6, sw: 0.055, dish: 0.03 } },
    steer: { p: [0.38, Y(1150), Z(1870)], tilt: 0.45, R: 0.19 }, eye: [0.38, Y(1440), Z(2240)], exhaust: [-0.68, Y(440), Z(E - 160)],
    nodes: [{ name: 'winch', t: [0, Y(560), zb + 0.11 + 0.012], mesh: winch }],
    mats: { rim: { pbrMetallicRoughness: { baseColorFactor: [0.3, 0.31, 0.33, 1] } } },
  };
}
