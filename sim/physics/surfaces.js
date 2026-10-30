// Ground surfaces and tyres. mu is the peak friction for an ordinary road tyre on dry ground; the tyre type scales it per surface.
// rr: rolling resistance coefficient, drag: extra resistance in soft ground (fraction of the load per m/s), sink: how far the tyre sinks (m),
// slip: how much more slip the tyre needs to reach peak grip on this surface (loose ground lets the tyre dig before it grips).
export const SURF = {
  ASPHALT: 0, CONCRETE: 1, GRAVEL: 2, DIRT: 3, GRASS: 4, SAND: 5, MUD: 6, BOG: 7, SNOW: 8, ICE: 9, ROCK: 10, WOOD: 11,
  FOREST: 12, FIELD: 13, ASH: 14, LAVA: 15, SEABED: 16, COBBLE: 17,
};
export const SURF_NAME = ['asfalt', 'betong', 'grus', 'jord', 'gress', 'sand', 'gjørme', 'myr', 'snø', 'is', 'berg', 'treverk',
  'skogbunn', 'åker', 'aske', 'lava', 'sjøbunn', 'brostein'];
//                 mu    rr     drag  sink  slip  wetK  (wetK: how much of the grip is left when it is wet)
export const SURF_PROPS = [
  /* ASPHALT  */ [1.00, 0.012, 0.00, 0.00, 1.0, 0.72],
  /* CONCRETE */ [0.95, 0.012, 0.00, 0.00, 1.0, 0.75],
  /* GRAVEL   */ [0.66, 0.025, 0.004, 0.01, 1.7, 0.92],
  /* DIRT     */ [0.68, 0.030, 0.006, 0.02, 1.5, 0.65],
  /* GRASS    */ [0.55, 0.035, 0.006, 0.01, 1.4, 0.62],
  /* SAND     */ [0.55, 0.080, 0.030, 0.05, 2.0, 1.05],
  /* MUD      */ [0.40, 0.090, 0.050, 0.08, 2.2, 0.90],
  /* BOG      */ [0.30, 0.160, 0.090, 0.16, 2.5, 0.90],
  /* SNOW     */ [0.32, 0.040, 0.012, 0.04, 1.6, 0.95],
  /* ICE      */ [0.11, 0.010, 0.00, 0.00, 1.2, 0.70],
  /* ROCK     */ [0.85, 0.018, 0.00, 0.00, 1.1, 0.70],
  /* WOOD     */ [0.70, 0.015, 0.00, 0.00, 1.0, 0.55],
  /* FOREST   */ [0.60, 0.040, 0.008, 0.02, 1.5, 0.75],
  /* FIELD    */ [0.58, 0.045, 0.012, 0.03, 1.6, 0.62],
  /* ASH      */ [0.55, 0.060, 0.020, 0.04, 1.8, 0.95],
  /* LAVA     */ [0.60, 0.050, 0.010, 0.00, 1.3, 1.00],
  /* SEABED   */ [0.50, 0.060, 0.020, 0.03, 1.8, 1.00],
  /* COBBLE   */ [0.85, 0.016, 0.00, 0.00, 1.1, 0.70],
];
// tyre types: grip factor per surface (same order as SURF), slip at peak (kappa, alpha in rad) and the name in the garage
export const TYRES = {
  sommer: { name: 'Sommerdekk', kp: 0.10, ap: 0.12,
    k: [1.00, 1.00, 0.95, 0.92, 0.90, 0.80, 0.70, 0.65, 0.55, 0.60, 1.00, 1.00, 0.92, 0.90, 0.90, 1.0, 0.9, 1.0] },
  vinter: { name: 'Vinterdekk', kp: 0.11, ap: 0.13,
    k: [0.88, 0.88, 1.00, 0.98, 0.95, 0.90, 0.85, 0.80, 1.55, 1.70, 0.92, 0.95, 1.00, 0.95, 0.95, 1.0, 0.9, 0.9] },
  pigg: { name: 'Piggdekk', kp: 0.11, ap: 0.13,
    k: [0.86, 0.86, 1.02, 0.98, 0.95, 0.90, 0.85, 0.80, 1.65, 3.10, 0.90, 0.95, 1.00, 0.95, 0.95, 1.0, 0.9, 0.88] },
  at: { name: 'AT-dekk (allterreng)', kp: 0.12, ap: 0.14,
    k: [0.92, 0.92, 1.10, 1.08, 1.05, 1.10, 1.25, 1.20, 1.25, 1.10, 1.05, 0.95, 1.10, 1.05, 1.05, 1.0, 1.1, 0.95] },
  mt: { name: 'MT-dekk (gjørme)', kp: 0.14, ap: 0.16,
    k: [0.82, 0.82, 1.15, 1.18, 1.15, 1.25, 1.60, 1.55, 1.30, 1.00, 1.10, 0.92, 1.18, 1.15, 1.10, 1.0, 1.2, 0.90] },
  sport: { name: 'Sportsdekk', kp: 0.09, ap: 0.10,
    k: [1.18, 1.15, 0.85, 0.82, 0.80, 0.65, 0.55, 0.50, 0.40, 0.45, 1.05, 1.00, 0.80, 0.80, 0.80, 1.0, 0.8, 1.05] },
  monster: { name: 'Monsterdekk', kp: 0.16, ap: 0.18,
    k: [0.90, 0.90, 1.10, 1.15, 1.10, 1.30, 1.50, 1.45, 1.20, 0.90, 1.10, 0.90, 1.15, 1.10, 1.10, 1.0, 1.2, 0.90] },
};
export function surfGrip(s, tyre, wet) {
  const p = SURF_PROPS[s] || SURF_PROPS[0], t = TYRES[tyre] || TYRES.sommer;
  return p[0] * t.k[s] * (1 - (1 - p[5]) * (wet || 0));
}

// Normalised "magic formula": 0 at s=0, peak 1 at s=1, about 0.8 when sliding far past the peak.
const MF_C = 1.6, MF_B = Math.tan(Math.PI / (2 * MF_C));
export function magic(s) { return Math.sin(MF_C * Math.atan(MF_B * s)); }

// Combined slip: kappa (slip ratio) and tanA (tangent of the slip angle) share the friction ellipse, so a tyre that spins or
// locks loses side grip, and a tyre that slides sideways loses drive. Returns [Fx, Fy] in N.
export function tyreForce(kappa, tanA, Fz, mu, kp, ap, out) {
  const sx = kappa / kp, sy = tanA / ap, s = Math.hypot(sx, sy);
  if (s < 1e-9 || Fz <= 0) { out[0] = 0; out[1] = 0; return out; }
  const F = mu * Fz * magic(s);
  out[0] = F * sx / s; out[1] = F * sy / s;
  return out;
}
