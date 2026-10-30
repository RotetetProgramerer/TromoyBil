// Jerv: a modern boxy off-roader with rounded corners (the Land Rover Defender 110 of 2020 is the archetype). Short
// overhangs, a high flat beltline, square arches with black flares, rounded-square headlamps with round daytime rings, bonnet
// vents, a black stepped "alpine" roof with small windows in its edges, an expedition roof rack, vertical tail lamps high on
// the corners and the spare wheel on the side-hinged rear door. dims.L is the body without the spare (as for the real car):
// the spare stands 0.27 m behind it.
import { THREE, box, mat4, tube, extrude, rrect, cylAB, add, addMesh } from '../geo.mjs';
import { loft, wells, tab } from '../body.mjs';
import { stdSec, seat, bench, dash, plate, lamp, roundLamp, mirror, flare, surfLine, mirX } from '../parts.mjs';
import { wheel } from '../wheels.mjs';
import { MeshData } from '../glb.mjs';

export function jerv(spec) {
  const cg = spec.cgH, overF = 0.87, a = spec.wb * (1 - spec.wd), zNose = a + overF - 0.05, sF = (overF - 0.05) * 1000, sR = sF + spec.wb * 1000;
  const len = Math.round(spec.dims.L * 1000) - 80, E = len, r = spec.wheel.rF * 1000, cowl = 1330, header = 1720, step = 2560;
  const yS = tab([[0, 1085], [250, 1108], [1200, 1140], [cowl, 1150], [E - 200, 1165], [E, 1160]]);
  const yR = tab([[0, 1112], [250, 1132], [1200, 1168], [cowl, 1180], [header, 1862], [step - 40, 1866], [step + 40, 1898], [E - 120, 1898], [E, 1885]]);
  const yT = tab([[0, 1142], [250, 1170], [1200, 1205], [cowl, 1212], [header, 1888], [step - 40, 1892], [step + 40, 1918], [E - 120, 1918], [E, 1905]]);
  const p = {
    w: tab([[0, 945], [140, 970], [400, 978], [E - 300, 978], [E - 80, 972], [E, 950]]), yb: tab([[0, 500], [300, 470], [700, 460], [E - 700, 460], [E - 200, 490], [E, 530]]),
    rb: 90, ym: 780, wS: tab([[0, 930], [200, 958], [E, 960]]), yS, ledge: 45, wR: tab([[0, 800], [cowl, 830], [header, 822], [E - 200, 815], [E, 800]]), yR, rr: 70, yT,
  };
  const arches = [{ s: sF, R: 480, Rz: 500, yc: r, p: 3.2 }, { s: sR, R: 480, Rz: 500, yc: r, p: 3.2 }];
  const gaps = [cowl + 25, 2425, 2525, 3430];
  const mat = (s, u) => {
    if (u < 1) return 'trim';
    if (u < 4) return u > 1.3 && gaps.some(g => Math.abs(s - g) < 4) ? 'trim:5' : 'paint';
    if (u < 5) return 'paint';
    if (u < 6) return s < cowl ? 'paint' : s < cowl + 90 ? 'trim' : s < 2405 ? 'glass' : s < 2545 ? 'trim' : s < 3400 ? 'glass' : s < 3470 ? 'trim' : s < 4230 ? 'glass' : 'paint';
    if (u < 7) return s < cowl - 10 ? 'paint' : s > step + 80 && s < E - 150 && !(s > 3380 && s < 3460) ? 'glass' : 'gloss';   // pillars black, alpine lights in the roof edge
    return s > cowl + 14 && s < header - 14 ? 'glass' : s > cowl - 70 && s <= cowl + 14 ? 'trim' : s < cowl ? 'paint' : 'gloss';
  };
  const keys = [...new Set([...yS.keys, ...yR.keys, ...yT.keys, ...gaps.flatMap(g => [g - 4, g + 4]), cowl - 70, cowl - 10, cowl + 14, header - 14, cowl + 90, 2405, 2545, 3400, 3470, 4230, step + 80, E - 150, 3380, 3460])];
  const B = loft({ len, sec: stdSec(p), zNose, cgH: cg, nU: [1, 3, 2, 3, 2, 3, 3, 5], ds: 60, arches, round: [85, 70], keys, creaseS: [cowl], creaseU: [4], mat,
    lining: { s0: cowl, s1: E - 20, u0: 1.5, off: 35 } });
  const md = B.md, Y = y => y / 1000 - cg, Z = B.zOf, zf = zNose, zr = B.zOf(E);
  wells(md, B, arches, spec.trackF / 2 - spec.wheel.wF / 2 - 0.1);
  // under the car (monocoque, independent suspension)
  box(md, 'trim', 1.5, 0.02, 3.9, 0.005, mat4(0, Y(462), Z(2300)));
  box(md, 'silver', 0.9, 0.04, 0.8, 0.01, mat4(0, Y(290), Z(sF + 120)));
  for (const s of [sF, sR]) add(md, 'chassis', new THREE.SphereGeometry(0.14, 12, 8), mat4(0, Y(r), Z(s), 0, 0, 0, 1.2, 0.9, 1.1));
  tube(md, 'chassis', [[-0.2, Y(360), Z(1500)], [-0.4, Y(360), Z(3300)], [-0.66, Y(380), Z(E - 50)], [-0.66, Y(380), Z(E + 5)]], 0.03, 0.25);
  // the nose: black grille band, rounded-square lamps with round daytime rings, lower bumper, skid plate, bonnet vents
  extrude(md, 'trim', rrect(1.1, 0.15, 0.03), 0.03, 0.006, mat4(0, Y(1000), zf - 0.008));
  for (let i = 0; i < 4; i++) box(md, 'chassis', 1.04, 0.012, 0.01, 0.003, mat4(0, Y(950) + i * 0.033, zf + 0.022));
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'L' : 'R', c = [sx * 0.75, Y(1005), zf + 0.004];
    lamp(md, 'trim', rrect(0.3, 0.22, 0.075), c, [0, 0, 1], 0.03);
    lamp(md, 'chassis', rrect(0.27, 0.19, 0.065), [c[0], c[1], c[2] + 0.012], [0, 0, 1], 0.02);
    roundLamp(md, [c[0] + sx * 0.015, c[1], c[2] + 0.028], [0, 0, 1], 0.08, { bezel: 'trim', drlR: 0.92 });
    lamp(md, 'light_ind_' + L, rrect(0.035, 0.12, 0.012, sx * 0.08, 0), [c[0], c[1], c[2] + 0.03], [0, 0, 1], 0.006);
    box(md, 'trim', 0.32, 0.012, 0.3, 0.004, mat4(sx * 0.62, Y(1158), Z(420), -0.04));               // bonnet vents
    for (let i = 0; i < 4; i++) box(md, 'chassis', 0.3, 0.008, 0.012, 0.003, mat4(sx * 0.62, Y(1166), Z(300 + i * 80), -0.04));
    lamp(md, 'light_drl', rrect(0.16, 0.025, 0.012), [sx * 0.7, Y(690), zf + 0.045], [0, 0, 1], 0.008);
  }
  box(md, 'paint', 1.92, 0.2, 0.14, 0.05, mat4(0, Y(780), zf - 0.03));
  box(md, 'trim', 1.7, 0.2, 0.16, 0.05, mat4(0, Y(600), zf - 0.04));
  box(md, 'silver', 0.85, 0.06, 0.16, 0.02, mat4(0, Y(470), zf - 0.06));
  plate(md, [0, Y(625), zf + 0.042], [0, 0, 1]);
  // sides: square black flares, sills, mirrors, handles, the black side of the roof; the expedition roof rack
  const prof = [[-0.012, -0.006], [0.08, -0.006], [0.08, 0.006], [0.065, 0.02], [0.0, 0.03], [-0.015, 0.024], [-0.019, 0.008]];
  for (const sx of [1, -1]) {
    for (const A of arches) flare(md, B, A, sx, prof, A.s < 2000 ? 560 : 520);
    box(md, 'trim', 0.06, 0.12, (sR - sF - 1080) / 1000, 0.025, mat4(sx * 0.975, Y(510), Z((sF + sR) / 2)));
    mirror(md, [sx * B.xAt(cowl + 80, Y(1215)), Y(1215), Z(cowl + 80)], sx, { w: 0.24, h: 0.17, d: 0.1, mat: 'gloss' });
    for (const s of [2330, 3330]) box(md, 'trim', 0.02, 0.028, 0.15, 0.01, mat4(sx * (B.xAt(s, Y(1100)) + 0.006), Y(1100), Z(s)));
  }
  const yRack = Y(1975), rack = [[0.74, 1780], [0.74, E - 220]];
  for (const sx of [1, -1]) {
    tube(md, 'gloss', [[sx * 0.74, yRack, Z(1780)], [sx * 0.74, yRack, Z(E - 220)]], 0.014, 0.05, 6);
    for (const s of [1850, 2700, 3500, E - 300]) box(md, 'gloss', 0.05, Y(1975) - Y(1918) + 0.02, 0.06, 0.01, mat4(sx * 0.74, (yRack + Y(1918)) / 2, Z(s)));
  }
  for (let s = 1820; s < E - 240; s += 240) box(md, 'gloss', 1.5, 0.018, 0.05, 0.006, mat4(0, yRack + 0.004, Z(s)));
  box(md, 'gloss', 1.5, 0.02, 0.05, 0.006, mat4(0, yRack + 0.006, Z(1780))); box(md, 'gloss', 1.5, 0.02, 0.05, 0.006, mat4(0, yRack + 0.006, Z(E - 220)));
  for (const x of [0.32, -0.36]) box(md, 'trim', 0.62, 0.012, 0.02, 0.005, mat4(x, Y(1205), Z(cowl + 25), 0.7, 0, 0.1));
  // the tail: vertical lamps high on the corners, rear window, the spare on the side-hinged door, bumper, plate
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'L' : 'R', c = [sx * 0.86, Y(1180), zr - 0.004];
    lamp(md, 'trim', rrect(0.17, 0.36, 0.05), c, [0, 0, -1], 0.025);
    lamp(md, 'light_tail', rrect(0.13, 0.12, 0.04, 0, 0.1), [c[0], c[1], c[2] - 0.012], [0, 0, -1], 0.012);
    lamp(md, 'light_brake', rrect(0.13, 0.08, 0.03, 0, -0.01), [c[0], c[1], c[2] - 0.012], [0, 0, -1], 0.012);
    lamp(md, 'light_ind_rear_' + L, rrect(0.13, 0.06, 0.02, 0, -0.11), [c[0], c[1], c[2] - 0.012], [0, 0, -1], 0.012);
    lamp(md, sx > 0 ? 'light_tail' : 'light_reverse', rrect(0.12, 0.04, 0.012), [sx * 0.7, Y(640), zr - 0.06], [0, 0, -1], 0.01);
  }
  extrude(md, 'trim', rrect(1.12, 0.48, 0.07), 0.012, 0.004, mat4(0, Y(1600), zr - 0.006, 0, Math.PI));
  extrude(md, 'glass', rrect(1.08, 0.44, 0.06), 0.008, 0.002, mat4(0, Y(1600), zr - 0.012, 0, Math.PI));
  const sp = wheel({ r: spec.wheel.rR, w: spec.wheel.wR, rr: 0.254, tread: 'at', style: 'steel', n: 8, caliper: false, seg: 36, cap: 'chrome' }, 1).wheel;
  const spare = new MeshData(); for (const [k, q] of sp.prims) if (k !== 'disc') spare.add(k, q.P, q.N, q.T, q.I);
  const zs = zr - 0.03 - spec.wheel.wR / 2;
  addMesh(md, spare, mat4(0, Y(1050), zs, 0, Math.PI / 2));
  box(md, 'chassis', 0.14, 0.14, 0.07, 0.02, mat4(0, Y(1050), zr - 0.03));
  box(md, 'light_brake', 0.24, 0.025, 0.02, 0.006, mat4(0, Y(1890), zr - 0.01));
  box(md, 'paint', 1.95, 0.2, 0.12, 0.05, mat4(0, Y(700), zr + 0.03));
  box(md, 'trim', 1.7, 0.16, 0.12, 0.04, mat4(0, Y(560), zr + 0.03));
  plate(md, [0, Y(700), zr - 0.034], [0, 0, -1]);
  // inside
  dash(md, 0.86, Y(1215), Z(1780), 0.5, 0.4);
  for (const sx of [1, -1]) seat(md, sx * 0.4, Y(840), Z(2130), 0.54, 0.26);
  bench(md, 1.45, Y(860), Z(3150), 0.2);
  box(md, 'interior', 1.6, 0.04, 1.0, 0.01, mat4(0, Y(820), Z(4100)));
  box(md, 'interior', 1.7, 0.6, 0.02, 0.01, mat4(0, Y(900), zr + 0.05));
  return {
    body: md, wheels: { F: { rr: 0.254, tread: 'at', style: 'steel', n: 8, cap: 'chrome', dish: 0.04 }, R: { rr: 0.254, tread: 'at', style: 'steel', n: 8, cap: 'chrome', dish: 0.04 } },
    steer: { p: [0.4, Y(1160), Z(1850)], tilt: 0.42, R: 0.19 }, eye: [0.4, Y(1500), Z(2230)], exhaust: [-0.66, Y(380), Z(E + 5)],
    mats: { rim: { pbrMetallicRoughness: { baseColorFactor: [0.86, 0.86, 0.84, 1], metallicFactor: 0.25, roughnessFactor: 0.4 } } }, spareOut: +(spec.wheel.wR + 0.002).toFixed(3),
  };
}
