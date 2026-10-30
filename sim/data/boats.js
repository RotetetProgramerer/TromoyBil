// The boats, in real size: metres, kilos, horsepower and rpm. The physics (sim/physics/boat.js) reads everything from here.
// Add a boat by copying a block, and check it with:  node tools/test-boat.mjs <id>
//
//  mass            loaded (hull, engines, fuel, people), kg              L, B     length and beam overall (collisions, air drag)
//  hull            L, B: length of the bottom and beam at the chines; deadrise at the transom and at the bow (deg);
//                  rise: how far the keel rises to the stem; depth: keel to gunwale; lcg: centre of mass from the transom
//                  (fraction of hull.L); vcg: centre of mass above the keel
//  engine          hp at rpm (rated), idle, limit (rev limiter), gear (reduction to the propeller), inertia (kg m² at the crank),
//                  count and spacing for twin engines
//  prop            D: diameter, P: pitch (m)
//  drive           depth: propeller axis below the keel; aft: behind the transom; pivot: trim pin above the keel; steer: max engine
//                  angle (deg); rate: how fast the steering turns it (°/s: a tiller is quick, hydraulic steering slow); torque: what
//                  the steering can hold against the water at speed (Nm per engine); fin: lateral area of gearcase and skeg (m²);
//                  cd: its frontal drag area (m²); trim: [in, out] (deg)
//  CdA             air drag area (m²)
export const BOATS = [
{ id: 'jolle', name: 'Jolle', kind: '4 m aluminiumsjekte med 20 hk', col: '#9aa4ab',
  desc: 'Liten og lett åpen båt med styrestang. Planer med to om bord, men slår i bølgene.',
  mass: 390, L: 4.0, B: 1.65,
  hull: { L: 3.75, B: 1.4, deadrise: 11, bowDeadrise: 30, rise: 0.35, depth: 0.62, lcg: 0.38, vcg: 0.36 },
  engine: { hp: 20, rpm: 5600, idle: 900, limit: 6100, gear: 2.08, inertia: 0.04 },
  prop: { D: 0.235, P: 0.305 },
  drive: { depth: 0.16, aft: 0.3, pivot: 0.5, steer: 35, rate: 90, torque: 70, fin: 0.022, cd: 0.0012, trim: [-4, 8] },
  CdA: 1.0 },

{ id: 'motorbat', name: 'Motorbåt', kind: '6,5 m daycruiser med 150 hk', col: '#f2f0ea',
  desc: 'Den vanlige skjærgårdsbåten: dyp V, 1,6 tonn med folk og bensin, 150 hk påhengsmotor. Rundt 40 knop på blankt vann.',
  mass: 1600, L: 6.5, B: 2.45,
  hull: { L: 6.0, B: 2.1, deadrise: 18, bowDeadrise: 42, rise: 0.55, depth: 1.15, lcg: 0.29, vcg: 0.62 },
  engine: { hp: 150, rpm: 5500, idle: 700, limit: 6000, gear: 1.92, inertia: 0.3 },
  prop: { D: 0.37, P: 0.48 },
  drive: { depth: 0.3, aft: 0.45, pivot: 0.85, steer: 30, rate: 25, torque: 450, fin: 0.07, cd: 0.002, trim: [-6, 10] },
  CdA: 1.6 },

{ id: 'racer', name: 'Racerbåt', kind: '9 m offshore-racer med 2 × 300 hk', col: '#d8402f',
  desc: 'Smal og dyp V med to store påhengsmotorer. Nesten 60 knop, men vil ha respekt i sjøen.',
  mass: 3300, L: 9.0, B: 2.55,
  hull: { L: 8.4, B: 2.25, deadrise: 22, bowDeadrise: 46, rise: 0.7, depth: 1.3, lcg: 0.28, vcg: 0.7 },
  engine: { hp: 300, rpm: 6000, idle: 650, limit: 6400, gear: 1.75, inertia: 0.45, count: 2, spacing: 0.86 },
  prop: { D: 0.31, P: 0.66 },
  drive: { depth: 0.28, aft: 0.55, pivot: 0.95, steer: 28, rate: 30, torque: 800, fin: 0.08, cd: 0.0022, trim: [-6, 10] },
  CdA: 2.2 },
];
export const boatById = id => BOATS.find(b => b.id === id) || BOATS[1];
