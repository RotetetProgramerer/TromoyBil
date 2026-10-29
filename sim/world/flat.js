// A simple analytic world for physics tests: flat ground (or a constant slope along +z) with one surface everywhere,
// optional water and colliders. Has the same interface as the real world (see sim/physics/vehicle.js).
import { SURF } from '../physics/surfaces.js';
export function flatWorld(o = {}) {
  const surf = o.surf ?? SURF.ASPHALT, slope = o.slope || 0, wl = o.water ?? -Infinity, cols = o.colliders || [];
  const h = o.height || ((x, z) => z * slope);
  return {
    wet: o.wet || 0,
    height: h,
    normal(x, z, out) { const e = 0.1; return out.set(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize(); },
    surface: typeof surf === 'function' ? surf : () => surf,
    water: () => wl,
    colliders: () => cols,
  };
}
