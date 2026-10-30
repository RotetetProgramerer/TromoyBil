// The planes, in real size: metres, kilos, degrees, horsepower and rpm. The physics (sim/physics/plane.js) reads everything here.
// Body frame: +z forward, +y up, +x left, from the centre of mass. Check a new plane with:  node tools/test-plane.mjs <id>
//
//  mass, inertia     kg; moments of inertia about the pitch (x), yaw (y) and roll (z) axes, kg m²
//  wing              S: area (m²), span (m); y, z: where its quarter-chord line is; incidence at the root and washout to the tip;
//                    dihedral (effective, a high wing gets extra); a0: zero-lift angle; clmax/clmin; cd0: profile drag; e: span
//                    efficiency; cm0: pitching moment; flapSpan / ailSpan: fractions of the half span; ailTau: aileron effectiveness
//                    flaps: deg per stage and per stage the change of zero-lift angle (da0), maximum lift (dcl), drag (dcd), moment (dcm)
//  htail, vtail      areas, span or height, where they are; incidence; slip: how much of the propeller slipstream reaches them;
//                    offset: the fin set against the propeller swirl (deg)
//  fuselage          CdA: drag area of fuselage, gear and struts (m²); side: side force area; cma: its destabilising pitch moment
//  controls          elevator [up, down], aileron, rudder, trim tab range (deg); tau: control surface effectiveness; rig: the
//                    ailerons rigged against the engine torque (deg) so it flies straight hands off
//  engine, prop      hp at rpm, idle; inertia of engine and propeller (kg m²); propeller diameter, where it is, and its curves:
//                    ct0/cp0: thrust and power coefficient at rest, J0: the advance ratio where the thrust runs out
//  gear.wheels       at: tyre bottom at full extension; travel; k: spring (N/m); load: share of the weight; steer (deg, nose wheel
//                    with the rudder); brake
//  belly, tailSkid   points that may not touch the ground (the tail skid may scrape gently)
//  limits            vne (kt), g [positive, negative] limit load, sink: what the gear takes at touchdown (m/s)
export const PLANES = [
{ id: 'make', name: 'Måke', kind: 'Firesetes skolefly med høy vinge, 180 hk', col: '#f2f0ea',
  desc: 'Snilt og stabilt skolefly. Steiler ved 48 knop, cruiser i 110, tar av på 300 meter og lander på enda mindre.',
  mass: 1050, inertia: [1825, 2667, 1285],
  wing: { S: 16.2, span: 11.0, y: 1.05, z: 0.07, incidence: 1.5, washout: 3, dihedral: 4, a0: -2.5, clmax: 1.62, clmin: -0.9, cd0: 0.0075, e: 0.75, cm0: -0.05,
    flapSpan: 0.5, ailSpan: [0.55, 0.98], ailTau: 0.25,
    flaps: { deg: [0, 10, 20, 30], da0: [0, -3.5, -6.5, -8.5], dcl: [0, 0.4, 0.7, 0.9], dcd: [0, 0.012, 0.035, 0.07], dcm: [0, -0.04, -0.08, -0.11] } },
  htail: { S: 3.45, span: 3.45, y: 0.15, z: -4.55, incidence: -2.5, slip: 0.3 },
  vtail: { S: 1.5, h: 1.45, y: 0.95, z: -4.45, slip: 0.35, offset: 0.7 },
  fuselage: { CdA: 0.33, side: 3.5, sideZ: 0.8, cma: 0.2, dragY: -0.2 },
  controls: { elevator: [28, 23], aileron: 18, rudder: 16, trim: 12, tau: 0.5, rig: 0.28 },
  engine: { hp: 180, rpm: 2700, idle: 650, inertia: 2.8 },
  prop: { D: 1.93, z: 1.85, y: 0.15, ct0: 0.103, cp0: 0.0587, J0: 0.98 },
  gear: { wheels: [
    { name: 'nose wheel', at: [0, -1.15, 1.35], travel: 0.18, k: 24000, load: 0.19, steer: 10 },
    { name: 'left main wheel', at: [1.27, -1.12, -0.32], travel: 0.15, k: 58000, load: 0.405, brake: true },
    { name: 'right main wheel', at: [-1.27, -1.12, -0.32], travel: 0.15, k: 58000, load: 0.405, brake: true }] },
  belly: [[0, -0.75, 1.0], [0, -0.65, -1.5], [0, -0.35, -3.2]], tailSkid: [0, -0.22, -4.3],
  limits: { vne: 163, g: [3.8, -1.52], sink: 3.5 } },

{ id: 'falk', name: 'Falk', kind: 'Sportsfly med lav vinge for akrobatikk, 200 hk', col: '#d8402f',
  desc: 'Lett og kvikt. Ruller fort, tåler 6 g og går 160 knop. Lander fort og vil ha en stø hånd.',
  mass: 800, inertia: [1000, 1600, 750],
  wing: { S: 11.0, span: 7.7, y: -0.35, z: 0.08, incidence: 1.0, washout: 1, dihedral: 2.5, a0: -1.5, clmax: 1.5, clmin: -1.1, cd0: 0.0075, e: 0.8, cm0: -0.03,
    flapSpan: 0.5, ailSpan: [0.5, 0.98], ailTau: 0.27,
    flaps: { deg: [0, 10, 20, 30], da0: [0, -3, -5.5, -7.5], dcl: [0, 0.3, 0.55, 0.7], dcd: [0, 0.01, 0.03, 0.06], dcm: [0, -0.03, -0.06, -0.09] } },
  htail: { S: 2.4, span: 3.0, y: 0.15, z: -3.9, incidence: -1.5, slip: 0.3 },
  vtail: { S: 1.15, h: 1.2, y: 0.7, z: -3.95, slip: 0.35, offset: 0.65 },
  fuselage: { CdA: 0.22, side: 2.5, sideZ: 0.7, cma: 0.15, dragY: -0.1 },
  controls: { elevator: [28, 20], aileron: 22, rudder: 22, trim: 10, tau: 0.5, rig: 0.44 },
  engine: { hp: 200, rpm: 2700, idle: 700, inertia: 2.2 },
  prop: { D: 1.83, z: 1.75, y: 0.1, ct0: 0.14, cp0: 0.085, J0: 1.35 },
  gear: { wheels: [
    { name: 'nose wheel', at: [0, -1.02, 1.25], travel: 0.15, k: 21000, load: 0.21, steer: 12 },
    { name: 'left main wheel', at: [1.15, -0.98, -0.35], travel: 0.12, k: 48000, load: 0.395, brake: true },
    { name: 'right main wheel', at: [-1.15, -0.98, -0.35], travel: 0.12, k: 48000, load: 0.395, brake: true }] },
  belly: [[0, -0.55, 0.9], [0, -0.5, -1.3], [0, -0.3, -2.8]], tailSkid: [0, -0.22, -3.8],
  limits: { vne: 230, g: [6, -3], sink: 3.5 } },
];
export const planeById = id => PLANES.find(p => p.id === id) || PLANES[0];
