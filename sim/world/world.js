// The whole world: the islands (the real Tromøya and the others) in one sea, and a coarse backdrop for the coast round them.
// This is the object the car's physics drives in (see the interface at the top of sim/physics/vehicle.js).
import { V3 } from '../physics/math.js';
import { SURF } from '../physics/surfaces.js';
import { loadBytes, loadJSON, parseGrid } from './grid.js';
import { Island } from './island.js';

export class World {
  constructor() { this.islands = []; this.backdrop = null; this.wet = 0; this.sea = 0; this._cols = []; this._last = null; }

  // base: the folder with the island data (world/ in the repo). def: {id, name, dir, ox, oz, seed, ...}
  async addIsland(base, def) {
    const dir = base + (def.dir || def.id) + '/';
    const [g, c, f] = await Promise.all([loadBytes(dir + 'terrain.bin.gz'), loadBytes(dir + 'cover.bin.gz'), loadJSON(dir + 'features.json.gz')]);
    const isl = new Island(def, parseGrid(g), parseGrid(c), f);
    // keep the order of the definitions (files arrive in any order): the backdrop must stay last, it covers everything
    isl.order = def.order ?? (this.nextOrder = (this.nextOrder || 0) + 1);
    this.islands.push(isl); this.islands.sort((a, b) => a.order - b.order); this._last = null;
    return isl;
  }
  async setBackdrop(url) { this.backdrop = parseGrid(await loadBytes(url)); }

  // the island at a point: the last one found if it still contains it, else the first that does; the backdrop (it contains every
  // point) is never remembered, so a point out at sea does not hide the islands from the next query
  islandAt(x, z) {
    const l = this._last;
    if (l && l.inside(x, z, 10)) return l;
    let bd = null;
    for (const isl of this.islands) { if (!isl.inside(x, z, 10)) continue; if (isl.def.backdrop) { bd = bd || isl; continue; } this._last = isl; return isl; }
    return bd;
  }
  height(x, z, bare) {
    const isl = this.islandAt(x, z);
    if (isl) return isl.height(x, z, bare);
    return this.backdrop && this.backdrop.inside(x, z) ? this.backdrop.bilinear(x, z) : -30;
  }
  terrain(x, z) {
    const isl = this.islandAt(x, z);
    if (isl) return isl.terrain(x, z);
    return this.backdrop && this.backdrop.inside(x, z) ? this.backdrop.bilinear(x, z) : -30;
  }
  normal(x, z, out) {
    const e = 0.35, isl = this.islandAt(x, z), H = isl ? (a, b) => isl.height(a, b) : (a, b) => this.height(a, b);
    return out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize();
  }
  surface(x, z) { const isl = this.islandAt(x, z); return isl ? isl.surface(x, z) : SURF.SEABED; }
  water(x, z) { const isl = this.islandAt(x, z); return isl ? isl.water(x, z) : this.sea; }
  colliders(x, z, r) { this._cols.length = 0; const isl = this.islandAt(x, z); if (isl) isl.colliders(x, z, r, this._cols); return this._cols; }
  road(x, z) { const isl = this.islandAt(x, z); return isl ? isl.roads.query(x - isl.ox, z - isl.oz) : null; }
}
