// Kobbe: a short, boxy 3-door off-roader (the Suzuki Jimny of 2018 is the archetype). Upright flat-sided body on a ladder
// frame, flat hood, black band across the nose with round lamps and five vertical slots, black arch flares and bumpers,
// side-hinged rear door with the spare wheel, tail lamps low in the rear bumper.
import { MeshData } from '../glb.mjs';
import { THREE, box, mat4, tube, extrude, rrect, cylAB, add, addMesh } from '../geo.mjs';
import { loft, wells, tab } from '../body.mjs';
import { stdSec, seat, bench, dash, plate, lamp, roundLamp, mirror, flare } from '../parts.mjs';
import { wheel } from '../wheels.mjs';

export function kobbe(spec) {
  // overF: front axle to the bumper; the painted nose is 5 cm behind it. The spare wheel's outer face is the car's rear end (dims.L).
  const cg = spec.cgH, overF = 0.59, a = spec.wb * (1 - spec.wd), b = spec.wb * spec.wd, zNose = a + overF - 0.05, sF = (overF - 0.05) * 1000, sR = sF + spec.wb * 1000;
  const zs = -b - (spec.dims.L - overF - spec.wb) + spec.wheel.wR / 2, len = Math.round((zNose - zs - spec.wheel.wR / 2 - 0.03) * 1000);
  const r = spec.wheel.rF * 1000, cowl = 1190, header = 1535;
  const yS = tab([[0, 975], [300, 990], [1150, 1050], [cowl, 1068], [2300, 1080], [len, 1085]]);
  const yR = tab([[0, 1003], [300, 1018], [1150, 1078], [cowl, 1098], [header, 1688], [len - 200, 1690], [len, 1684]]);
  const yT = tab([[0, 1016], [300, 1032], [1150, 1092], [cowl, 1112], [header, 1722], [len - 200, 1725], [len, 1718]]);
  const p = {
    w: tab([[0, 768], [90, 786], [300, 790], [len - 150, 790], [len, 782]]), yb: tab([[0, 430], [260, 340], [500, 320], [len - 300, 320], [len, 400]]),
    rb: 70, ym: 640, wS: tab([[0, 760], [200, 775], [len, 775]]), yS, ledge: 30, wR: tab([[0, 640], [400, 690], [cowl, 700], [len, 690]]), yR, rr: 45, yT,
  };
  const arches = [{ s: sF, R: 432, Rz: 452, yc: r, p: 2.5 }, { s: sR, R: 432, Rz: 452, yc: r, p: 2.5 }];
  const mat = (s, u) => {
    if (u < 1) return 'trim';
    if (u < 4) return (u > 1.3 && (Math.abs(s - 1212) < 4 || Math.abs(s - 2218) < 4)) ? 'trim:5' : 'paint';
    if (u < 5) return 'paint';
    if (u < 6) return s < cowl ? 'paint' : s < 1250 ? 'trim' : s < 2165 ? 'glass' : s < 2280 ? 'trim' : s < 2800 ? 'glass' : 'paint';
    if (u < 7) return s > cowl - 10 && s < header + 30 ? 'trim' : 'paint';
    return s > cowl + 12 && s < header - 12 ? 'glass' : s > cowl - 70 && s <= cowl + 12 ? 'trim' : 'paint';
  };
  const keys = [...new Set([...yS.keys, ...yR.keys, ...yT.keys, cowl, cowl + 12, header - 12, header + 30, 1250, 2165, 2280, 2800, 1208, 1216, 2214, 2222, cowl - 70])];
  const B = loft({ len, sec: stdSec(p), zNose, cgH: cg, nU: [1, 3, 2, 3, 2, 3, 3, 5], ds: 55, arches, round: [45, 40], keys, creaseS: [cowl], creaseU: [4],
    mat, lining: { s0: cowl, s1: len, u0: 1.5, off: 30 } });
  const md = B.md, Y = y => y / 1000 - cg, Z = B.zOf, zT = B.zOf(len);
  wells(md, B, arches, spec.trackF / 2 - spec.wheel.wF / 2 - 0.1);
  // under the car: floor plate, ladder frame, axles with their differentials, exhaust
  box(md, 'trim', 1.2, 0.02, 2.9, 0.005, mat4(0, Y(322), Z(1720)));
  for (const sx of [1, -1]) box(md, 'chassis', 0.07, 0.1, 3.3, 0.01, mat4(sx * 0.45, Y(265), Z(1720)));
  for (const s of [sF, sR]) {
    const xi = spec.trackF / 2 - spec.wheel.wF / 2 - 0.07;
    cylAB(md, 'chassis', [-xi, Y(r), Z(s)], [xi, Y(r), Z(s)], 0.045, 12);
    add(md, 'chassis', new THREE.SphereGeometry(0.125, 12, 8), mat4(0.12, Y(r) - 0.01, Z(s), 0, 0, 0, 1, 0.9, 1.1));
  }
  tube(md, 'chassis', [[-0.15, Y(300), Z(900)], [-0.3, Y(300), Z(2600)], [-0.48, Y(330), Z(len - 30)], [-0.48, Y(330), Z(len + 20)]], 0.025, 0.2);
  // nose: black band with round lamps and the five slots, bumper, plate, indicators
  const zf = zNose;
  const slots = Array.from({ length: 5 }, (_, i) => rrect(0.085, 0.17, 0.02, -0.26 + i * 0.13, 0.0));
  extrude(md, 'trim', rrect(1.5, 0.28, 0.05), 0.03, 0.006, mat4(0, Y(825), zf - 0.004), slots);
  box(md, 'chassis', 0.68, 0.2, 0.006, 0.002, mat4(0, Y(825), zf + 0.004));
  for (const sx of [1, -1]) roundLamp(md, [sx * 0.55, Y(828), zf + 0.02], [0, 0, 1], 0.088, { bezel: 'chrome' });
  box(md, 'trim', 1.62, 0.25, 0.3, 0.06, mat4(0, Y(500), zf - 0.1));
  box(md, 'trim', 1.2, 0.1, 0.32, 0.03, mat4(0, Y(370), zf - 0.14));
  box(md, 'chassis', 0.62, 0.05, 0.1, 0.02, mat4(0, Y(345), zf - 0.02));
  plate(md, [0, Y(515), zf + 0.052], [0, 0, 1]);
  for (const sx of [1, -1]) {
    lamp(md, 'light_ind_' + (sx > 0 ? 'L' : 'R'), rrect(0.11, 0.045, 0.015), [sx * 0.68, Y(560), zf + 0.05], [0, 0, 1], 0.012);
    lamp(md, 'light_drl', rrect(0.14, 0.02, 0.01), [sx * 0.62, Y(470), zf + 0.052], [0, 0, 1], 0.008);
  }
  // sides: arch flares, sills, door handles, mirrors, side indicators on the front flares, roof gutters
  const prof = [[-0.012, -0.006], [0.07, -0.006], [0.07, 0.006], [0.055, 0.026], [0.0, 0.036], [-0.014, 0.028], [-0.018, 0.008]];
  for (const sx of [1, -1]) {
    for (const A of arches) flare(md, B, A, sx, prof, A.s < 1000 ? 420 : 380);
    box(md, 'trim', 0.05, 0.11, 1.38, 0.02, mat4(sx * 0.79, Y(380), Z((sF + sR) / 2)));
    box(md, 'trim', 0.022, 0.03, 0.13, 0.01, mat4(sx * (B.xAt(2070, Y(985)) + 0.008), Y(985), Z(2070)));
    mirror(md, [sx * B.xAt(1280, Y(1110)), Y(1110), Z(1280)], sx, { mat: 'trim', w: 0.17, h: 0.15 });
    lamp(md, 'light_ind_' + (sx > 0 ? 'L' : 'R'), rrect(0.05, 0.022, 0.008), [sx * (B.xAt(sF + 470, Y(640)) + 0.035), Y(640), Z(sF + 470)], [sx, 0, 0], 0.008);
    tube(md, 'trim', [[sx * 0.695, Y(1698), Z(header - 10)], [sx * 0.697, Y(1700), Z(len - 40)]], 0.009, 0.05, 6);
  }
  // wipers and the washer nozzles
  for (const x of [0.28, -0.32]) box(md, 'trim', 0.55, 0.012, 0.02, 0.005, mat4(x, Y(1125), Z(cowl + 25), 0.6, 0, 0.12));
  // tail: rear window on the door, spare wheel, bumper with lamps, plate, third brake light
  const zr = zT;
  extrude(md, 'trim', rrect(1.08, 0.5, 0.07), 0.012, 0.004, mat4(0, Y(1385), zr - 0.006, 0, Math.PI));
  extrude(md, 'glass', rrect(1.04, 0.46, 0.06), 0.008, 0.002, mat4(0, Y(1385), zr - 0.012, 0, Math.PI));
  const sp = wheel({ r: spec.wheel.rR, w: spec.wheel.wR, rr: 0.1905, tread: 'at', style: 'spokes', n: 5, sw: 0.05, caliper: false, seg: 36 }, 1).wheel;
  const spare = new MeshData(); for (const [k, q] of sp.prims) if (k !== 'disc') spare.add(k, q.P, q.N, q.T, q.I);
  addMesh(md, spare, mat4(0, Y(905), zs, 0, Math.PI / 2));
  box(md, 'chassis', 0.12, 0.12, zr - zs + 0.04, 0.02, mat4(0, Y(905), (zr + zs) / 2));
  box(md, 'light_brake', 0.16, 0.025, 0.02, 0.006, mat4(0, Y(1305), zr - 0.03));
  box(md, 'trim', 1.62, 0.24, 0.24, 0.06, mat4(0, Y(450), zr + 0.07));
  plate(md, [0, Y(455), zr - 0.054], [0, 0, -1]);
  for (const sx of [1, -1]) {
    const x = sx * 0.66;
    lamp(md, 'light_tail', rrect(0.22, 0.085, 0.015), [x, Y(470), zr - 0.054], [0, 0, -1], 0.012);
    lamp(md, 'light_brake', rrect(0.1, 0.04, 0.01), [x - sx * 0.04, Y(485), zr - 0.066], [0, 0, -1], 0.006);
    lamp(md, 'light_ind_rear_' + (sx > 0 ? 'L' : 'R'), rrect(0.07, 0.035, 0.01), [x + sx * 0.06, Y(455), zr - 0.066], [0, 0, -1], 0.006);
    lamp(md, sx > 0 ? 'light_tail' : 'light_reverse', rrect(0.12, 0.035, 0.01), [sx * 0.34, Y(385), zr - 0.054], [0, 0, -1], 0.008);
  }
  // inside: dashboard, seats, rear bench, the back of the rear door
  dash(md, 0.7, Y(1110), Z(1650), 0.42, 0.36);
  for (const sx of [1, -1]) seat(md, sx * 0.36, Y(720), Z(1850), 0.5, 0.28);
  bench(md, 1.1, Y(740), Z(2700), 0.18);
  box(md, 'interior', 1.4, 0.75, 0.02, 0.01, mat4(0, Y(800), zr + 0.035));
  return {
    body: md, wheels: { F: { rr: 0.1905, tread: 'at', style: 'spokes', n: 5, sw: 0.05 }, R: { rr: 0.1905, tread: 'at', style: 'spokes', n: 5, sw: 0.05 } },
    steer: { p: [0.36, Y(1035), Z(1590)], tilt: 0.48, R: 0.185 }, eye: [0.36, Y(1330), Z(1950)], exhaust: [-0.48, Y(330), Z(len + 25)],
    mats: { rim: { pbrMetallicRoughness: { baseColorFactor: [0.55, 0.56, 0.58, 1] } } },
  };
}
