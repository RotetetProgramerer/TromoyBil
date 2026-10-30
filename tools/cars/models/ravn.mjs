// Ravn: a long, low estate car (the Volvo V90 of 2016 is the archetype). Long hood, raked windshield, a long flat roof with
// flush rails, chrome window line, a sloping tailgate, slim headlamps with a sideways-T daytime light, a grille of vertical
// chrome slats, tall tail lamps wrapping round the rear corners and twin exhaust trims in the rear bumper.
import { THREE, box, mat4, tube, extrude, rrect, circle, add } from '../geo.mjs';
import { loft, wells, tab } from '../body.mjs';
import { stdSec, seat, bench, dash, plate, lamp, mirror, surfLine, mirX } from '../parts.mjs';

export function ravn(spec) {
  const cg = spec.cgH, overF = 0.9, a = spec.wb * (1 - spec.wd), zNose = a + overF - 0.012, sF = (overF - 0.012) * 1000, sR = sF + spec.wb * 1000;
  const len = Math.round(spec.dims.L * 1000) - 12 - 15, E = len, r = spec.wheel.rF * 1000, cowl = 1560, header = 2330, roofEnd = 4400, rw = 4745;
  const yS = tab([[0, 770], [140, 800], [800, 870], [1500, 948], [cowl, 955], [2600, 962], [3600, 982], [4300, 1000], [rw, 1005], [E, 990]]);
  const yR = tab([[0, 795], [140, 826], [800, 898], [1500, 975], [cowl, 984], [header, 1402], [3000, 1418], [roofEnd - 120, 1405], [roofEnd, 1388], [rw, 1030], [E, 1012]]);
  const yT = tab([[0, 806], [140, 840], [800, 912], [1500, 996], [cowl, 1004], [header, 1450], [3000, 1466], [roofEnd - 120, 1450], [roofEnd, 1430], [rw, 1045], [E, 1022]]);
  const p = {
    w: tab([[0, 880], [40, 905], [130, 922], [400, 932], [1200, 934], [3700, 940], [E - 250, 926], [E - 80, 900], [E, 862]]),
    yb: tab([[0, 320], [260, 290], [800, 300], [E - 500, 300], [E - 150, 330], [E, 380]]), rb: 150,
    ym: tab([[0, 720], [400, 800], [E - 400, 830], [E, 800]]), wS: tab([[0, 850], [130, 902], [400, 912], [3700, 918], [E - 200, 902], [E, 852]]), yS, ledge: 15,
    wR: tab([[0, 720], [700, 760], [cowl, 795], [header, 752], [roofEnd, 745], [rw, 720], [E, 700]]), yR, rr: tab([[0, 18], [cowl - 60, 22], [cowl + 150, 60], [E, 60]]), yT,
  };
  const arches = [{ s: sF, R: 405, Rz: 415, yc: r }, { s: sR, R: 405, Rz: 415, yc: r }];
  const gaps = [cowl + 30, 2615, 2700, 3575];
  const mat = (s, u) => {
    if (u < 1) return 'trim';
    if (s < 200 && u > 3.6 && u < 4.55) return 'light_head:6';                                             // headlamps round the front corners
    if (s > E - 330 && u > 3.0 && u < 4.55) return u < 3.4 ? 'light_ind_rear_L:5' : 'light_tail:5';          // tail lamps round the rear corners
    if (u < 4) return u > 1.25 && gaps.some(g => Math.abs(s - g) < 4) ? 'trim:5' : 'paint';
    if (u < 5) return 'paint';
    if (u < 6) return s < cowl + 40 ? 'paint' : s < 2600 ? 'glass' : s < 2715 ? 'trim' : s < 3560 ? 'glass' : s < 3625 ? 'trim' : s < 4385 ? 'glass' : 'paint';
    if (u < 7) return s > roofEnd + 20 && s < rw ? 'gloss' : 'paint';
    return s > cowl + 14 && s < header - 14 ? 'glass' : s > cowl - 70 && s <= cowl + 14 ? 'trim' : s > roofEnd + 30 && s < rw - 15 ? 'glass' : 'paint';
  };
  const keys = [...new Set([...yS.keys, ...yR.keys, ...yT.keys, ...gaps.flatMap(g => [g - 4, g + 4]), 200, E - 330, cowl + 40, cowl - 70, cowl + 14, header - 14, 2600, 2715, 3560, 3625, 4385, roofEnd + 20, roofEnd + 30, rw - 15])];
  const B = loft({ len, sec: stdSec(p), zNose, cgH: cg, nU: [1, 3, 2, 3, 2, 3, 3, 4], ds: 70, arches, round: [60, 60], keys, creaseS: [cowl], mat,
    lining: { s0: cowl, s1: roofEnd + 200, u0: 2.5, off: 30 } });
  // the right-hand rear indicator: the mirrored half used the left name, rename it
  const ind = B.md.prims.get('light_ind_rear_L');
  if (ind) { const P = ind.P, N = ind.N, T = ind.T, I = ind.I, L = { P: [], N: [], T: [], I: [] }, R = { P: [], N: [], T: [], I: [] };
    for (let t = 0; t < I.length; t += 3) { const o = P[I[t] * 3] > 0 ? L : R, base = o.P.length / 3; for (let k = 0; k < 3; k++) { const v = I[t + k]; o.P.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); o.N.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); o.T.push(T[v * 2], T[v * 2 + 1]); o.I.push(base + k); } }
    B.md.prims.delete('light_ind_rear_L'); B.md.add('light_ind_rear_L', L.P, L.N, L.T, L.I); B.md.add('light_ind_rear_R', R.P, R.N, R.T, R.I); }
  const md = B.md, Y = y => y / 1000 - cg, Z = B.zOf, zf = zNose, zr = B.zOf(E);
  wells(md, B, arches, spec.trackF / 2 - spec.wheel.wF / 2 - 0.12);
  box(md, 'trim', 1.5, 0.02, 4.2, 0.005, mat4(0, Y(298), Z(2450)));
  box(md, 'trim', 1.4, 0.03, 0.5, 0.005, mat4(0, Y(160), Z(sF + 400)));                                  // the lowest point: engine undertray
  tube(md, 'chassis', [[-0.15, Y(200), Z(1300)], [-0.25, Y(220), Z(3400)], [-0.45, Y(260), Z(E - 120)]], 0.03, 0.2);
  // the nose: grille of vertical chrome slats in a chrome frame, the lower intake, splitter, plate
  const gw = 0.64, gh = 0.2, gy = Y(665);
  extrude(md, 'chrome', rrect(gw + 0.05, gh + 0.05, 0.035), 0.025, 0.006, mat4(0, gy, zf - 0.01), [rrect(gw, gh, 0.02).reverse()]);
  box(md, 'trim', gw, gh, 0.01, 0.002, mat4(0, gy, zf - 0.006));
  for (let i = 0; i < 20; i++) box(md, 'chrome', 0.008, gh - 0.01, 0.02, 0.003, mat4(-gw / 2 + 0.02 + i * (gw - 0.04) / 19, gy, zf + 0.002));
  extrude(md, 'trim', rrect(1.3, 0.12, 0.04), 0.03, 0.006, mat4(0, Y(410), zf - 0.02));
  box(md, 'chrome', 1.2, 0.012, 0.012, 0.004, mat4(0, Y(478), zf + 0.004));
  for (const sx of [1, -1]) {
    lamp(md, 'chassis', [[0.35, 0.065], [0.76, 0.07], [0.77, -0.01], [0.7, -0.06], [0.35, -0.055]].map(([x, y]) => [sx * x, y]), [0, Y(700), zf + 0.002], [0, 0, 1], 0.016, [0, 1, 0], { w: 0.01, mat: 'chrome' });
    for (const x of [0.5, 0.64]) lamp(md, 'light_head', circle(0.04, 16, sx * x, 0.012), [0, Y(700), zf + 0.012], [0, 0, 1], 0.01, [0, 1, 0], { w: 0.008, mat: 'chrome' });
    lamp(md, 'light_drl', rrect(0.36, 0.02, 0.008, sx * 0.565, -0.028), [0, Y(700), zf + 0.022], [0, 0, 1], 0.006);    // the sideways T: a bar across the lamp …
    lamp(md, 'light_drl', rrect(0.02, 0.1, 0.008, sx * 0.385, 0.0), [0, Y(700), zf + 0.022], [0, 0, 1], 0.006);       // … and its head at the grille end
    lamp(md, 'light_ind_' + (sx > 0 ? 'L' : 'R'), rrect(0.05, 0.02, 0.006, sx * 0.69, 0.035), [0, Y(700), zf + 0.02], [0, 0, 1], 0.006);
  }
  plate(md, [0, Y(410), zf + 0.016], [0, 0, 1]);
  // sides: chrome window line, sill strips, mirrors, handles, flush roof rails
  for (const sx of [1, -1]) {
    const f = P => sx > 0 ? P : mirX(P);
    tube(md, 'chrome', f(surfLine(B, cowl + 45, 4380, 5.02, 0.003, 36)), 0.006, 0.02, 6);
    tube(md, 'chrome', f(surfLine(B, cowl + 60, 4380, 5.96, 0.003, 40)), 0.005, 0.02, 6);
    tube(md, 'chrome', f(surfLine(B, sF + 440, sR - 440, 1.55, 0.004, 12)), 0.006, 0.02, 6);
    mirror(md, [sx * B.xAt(cowl + 120, Y(990)), Y(990), Z(cowl + 120)], sx, { w: 0.2, h: 0.12, d: 0.09 });
    for (const s of [2380, 3320]) box(md, 'chrome', 0.02, 0.022, 0.14, 0.01, mat4(sx * (B.xAt(s, Y(925)) + 0.006), Y(925), Z(s)));
    tube(md, 'silver', f(surfLine(B, header + 120, roofEnd - 60, 6.55, 0.012, 16)), 0.012, 0.02, 6);
  }
  for (const x of [0.32, -0.36]) box(md, 'trim', 0.6, 0.01, 0.018, 0.004, mat4(x, Y(1005), Z(cowl + 40), 1.0, 0, 0.1));
  // the tail: the tail lamps' inner arms on the tailgate, the lit bar under the rear window, bumper, exhaust trims, plate
  for (const sx of [1, -1]) {
    lamp(md, 'light_tail', rrect(0.2, 0.05, 0.015), [sx * 0.6, Y(990), zr - 0.004], [0, 0, -1], 0.012);
    lamp(md, 'light_brake', rrect(0.18, 0.03, 0.01), [sx * 0.6, Y(910), zr - 0.004], [0, 0, -1], 0.01);
    lamp(md, 'light_reverse', rrect(0.08, 0.03, 0.01), [sx * 0.42, Y(910), zr - 0.004], [0, 0, -1], 0.008);
    extrude(md, 'chrome', [[-0.11, -0.03], [0.11, -0.03], [0.09, 0.03], [-0.09, 0.03]], 0.02, 0.005, mat4(sx * 0.55, Y(330), zr + 0.005, 0, Math.PI));
    box(md, 'trim', 0.2, 0.045, 0.01, 0.003, mat4(sx * 0.55, Y(330), zr - 0.008));
  }
  box(md, 'light_brake', 0.5, 0.02, 0.02, 0.005, mat4(0, Y(1405), Z(roofEnd + 25)));
  box(md, 'trim', 1.3, 0.08, 0.03, 0.02, mat4(0, Y(300), zr + 0.01));
  plate(md, [0, Y(780), zr - 0.004], [0, 0, -1]);
  // inside
  dash(md, 0.82, Y(940), Z(1950), 0.55, 0.38);
  for (const sx of [1, -1]) seat(md, sx * 0.38, Y(520), Z(2480), 0.52, 0.32);
  bench(md, 1.35, Y(540), Z(3420), 0.25);
  box(md, 'interior', 1.5, 0.03, 1.0, 0.01, mat4(0, Y(560), Z(4300)));
  return {
    body: md, wheels: { F: { rr: 0.2413, tread: 'road', seg: 44, style: 'spokes', n: 10, sw: 0.024, dish: 0.025 }, R: { rr: 0.2413, tread: 'road', seg: 44, style: 'spokes', n: 10, sw: 0.024, dish: 0.025 } },
    steer: { p: [0.38, Y(880), Z(2130)], tilt: 0.38, R: 0.185 }, eye: [0.38, Y(1170), Z(2560)], exhaust: [-0.55, Y(330), zr],
  };
}
