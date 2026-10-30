// Places the game adds to the islands: the workshop (the base) and the car ferry at each ferry quay.
// The ferry is a small island car ferry (34 m): an open car deck between two high sides, a ramp at the bow, the wheelhouse on a
// bridge across the deck. It is drivable (a deck in the island) when it lies at the quay, and it sails between the islands.
import * as THREE from 'three';
import { prep } from './gfx.js';
import { SURF } from '../physics/surfaces.js';

const std = (gfx, c, o = {}) => { const m = prep(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0 }, o))); gfx.shadowed(m); return m; };
function box(g, mat, w, h, d, x, y, z, ry = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }
function sign(text, sub, w = 1024, h = 256, bg = '#f2e8d0', fg = '#14120e') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.textAlign = 'center'; x.font = `700 ${h * 0.46}px "Barlow Condensed", sans-serif`; x.fillText(text, w / 2, h * 0.56);
  if (sub) { x.font = `600 ${h * 0.2}px "Barlow Condensed", sans-serif`; x.fillText(sub, w / 2, h * 0.86); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ------------------------------------------------------------------ the workshop
export function buildBase(gfx, world, isl, b) {
  const g = new THREE.Group(), y = b.y, ry = b.ry;
  // the ground is levelled for the yard (a pad in the island's height function)
  isl.pads.push({ x: b.x - isl.ox, z: b.z - isl.oz, r: 26, y, blend: 14 });
  const W = 22, D = 14, H = 6.5, cs = Math.cos(ry), sn = Math.sin(ry);
  const L = (a, c) => [b.x + a * cs + c * sn, b.z - a * sn + c * cs];          // a across the front, c towards the back
  const [hx, hz] = L(0, 14);
  const wall = std(gfx, '#b8b2a6'), roof = std(gfx, '#3a3a3c'), door = std(gfx, '#d9d4c8', { metalness: 0.3, roughness: 0.5 }), dark = std(gfx, '#24272a'), red = std(gfx, '#b5241c');
  const hall = new THREE.Group(); hall.position.set(hx, y, hz); hall.rotation.y = ry; g.add(hall);
  box(hall, wall, W, H, D, 0, H / 2, 0); box(hall, roof, W + 0.6, 0.4, D + 0.6, 0, H + 0.2, 0); box(hall, red, W + 0.1, 0.6, 0.12, 0, H - 0.6, -D / 2 - 0.06);
  for (const dx of [-6.5, 0, 6.5]) { box(hall, door, 4.6, 4.2, 0.12, dx, 2.1, -D / 2 - 0.05); for (let k = 0; k < 7; k++) box(hall, dark, 4.6, 0.03, 0.14, dx, 0.5 + k * 0.55, -D / 2 - 0.06); }
  const s = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), prep(new THREE.MeshStandardMaterial({ map: sign('TROMØY BILVERKSTED', 'deler · dekk · lakk · biler', 1024, 230), roughness: 0.6 })));
  s.position.set(0, H + 1.4, -D / 2 - 0.3); s.rotation.y = Math.PI; hall.add(s);
  box(hall, dark, 0.3, 2.6, 0.3, -5, H + 0.4, -D / 2 - 0.2); box(hall, dark, 0.3, 2.6, 0.3, 5, H + 0.4, -D / 2 - 0.2);
  // a fuel pump and a few things in the yard
  const [px, pz] = L(-8, 2); const pump = new THREE.Group(); pump.position.set(px, y, pz); pump.rotation.y = ry; g.add(pump);
  box(pump, red, 0.9, 1.9, 0.6, 0, 0.95, 0); box(pump, std(gfx, '#f2f2ee'), 0.8, 0.5, 0.62, 0, 1.55, 0); box(pump, dark, 3.4, 0.25, 3.4, 0, 4.2, 0); box(pump, wall, 0.2, 4.0, 0.2, 0, 2.1, 0);
  for (const [a, c] of [[9, 2], [9.8, 3.2], [8.6, 3.6]]) { const [tx, tz] = L(a, c); const t = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.13, 8, 16), dark); t.rotation.x = Math.PI / 2; t.position.set(tx, y + 0.15, tz); t.castShadow = true; g.add(t); }
  gfx.scene.add(g);
  isl.extraColliders.push({ x: hx, z: hz, hw: W / 2, hd: D / 2, ang: ry, kind: 'house' }, { x: px, z: pz, r: 0.6 });
  // where you stop to open the garage: in front of the middle door
  const [ax, az] = L(0, 4.5);
  return { group: g, ask: { x: ax, z: az, r: 5 } };
}

// ------------------------------------------------------------------ the ferry
export class Ferry {
  constructor(gfx) {
    this.gfx = gfx; const g = this.group = new THREE.Group();
    const hull = std(gfx, '#f2f2ee', { roughness: 0.5 }), blue = std(gfx, '#1f4f8a'), dark = std(gfx, '#2a2c2e'), deck = std(gfx, '#3a3d40', { roughness: 0.9 }), glass = prep(new THREE.MeshStandardMaterial({ color: '#0c1820', roughness: 0.1, metalness: 0.6 })), red = std(gfx, '#b5241c');
    const L = 34, W = 9, dh = 1.25;   // length, beam, deck height above the water
    this.L = L; this.W = W; this.dh = dh;
    // hull: a box with a raked bow and stern, blue stripe at the waterline
    const shape = new THREE.Shape(); shape.moveTo(-L / 2, -W / 2 + 0.6); shape.lineTo(L / 2 - 3, -W / 2); shape.lineTo(L / 2, -W / 2 + 2); shape.lineTo(L / 2, W / 2 - 2); shape.lineTo(L / 2 - 3, W / 2); shape.lineTo(-L / 2, W / 2 - 0.6); shape.closePath();
    const hg = new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false }); hg.rotateX(-Math.PI / 2); hg.translate(0, -2.0, 0);
    // the extrusion runs along x; the ferry's length is along z (bow at +z)
    hg.rotateY(-Math.PI / 2);
    const h = new THREE.Mesh(hg, hull); h.castShadow = true; h.receiveShadow = true; g.add(h);
    box(g, blue, W + 0.05, 0.5, L - 1, 0, -0.1, -0.5);
    box(g, deck, W - 1.2, 0.1, L - 2, 0, dh - 0.05, 0);
    // high sides along the car deck, the bridge with the wheelhouse across the middle
    for (const s of [-1, 1]) { box(g, hull, 0.6, 2.4, L - 4, s * (W / 2 - 0.3), dh + 1.2, -1); box(g, blue, 0.62, 0.3, L - 4, s * (W / 2 - 0.3), dh + 2.2, -1); }
    box(g, hull, W, 0.5, 4, 0, dh + 5.0, -2); box(g, hull, 4.5, 2.6, 3.6, -1.5, dh + 6.5, -2); box(g, glass, 4.6, 1.0, 3.7, -1.5, dh + 7.0, -2);
    box(g, red, 0.6, 2.2, 0.6, -1.5, dh + 8.8, -2.5); box(g, dark, 0.7, 0.3, 0.7, -1.5, dh + 9.9, -2.5);
    for (const s of [-1, 1]) box(g, hull, 0.5, 4, 0.5, s * (W / 2 - 0.6), dh + 3, -2);
    // the bow ramp (it lies down on the quay when the ferry is in, so the car can drive on)
    this.ramp = new THREE.Group(); this.ramp.position.set(0, dh, L / 2 - 0.5); g.add(this.ramp);
    box(this.ramp, dark, W - 2, 0.2, 5, 0, 0, 2.5);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.3), prep(new THREE.MeshStandardMaterial({ map: sign('MF SKJÆRGÅRD', null, 1024, 160, '#f2f2ee', '#1f4f8a'), roughness: 0.6 })));
    nm.position.set(W / 2 + 0.33, dh + 1.6, -4); nm.rotation.y = Math.PI / 2; g.add(nm);
    const nm2 = nm.clone(); nm2.position.x = -W / 2 - 0.33; nm2.rotation.y = -Math.PI / 2; g.add(nm2);
    g.visible = false; gfx.scene.add(g);
  }
  // put the ferry alongside a quay: q = {x, z, dir (heading out to sea), sea}; registers the deck so the car can drive on
  dock(isl, q) {
    const g = this.group, out = q.dir, bowIn = out + Math.PI;
    // the ferry lies with its bow towards the quay, the ramp end just over the quay edge
    const cx = q.x + Math.sin(out) * (this.L / 2 + 4), cz = q.z + Math.cos(out) * (this.L / 2 + 4);
    g.position.set(cx, q.sea, cz); g.rotation.set(0, bowIn, 0); g.visible = true; this.ramp.rotation.x = 0.06;
    this.island = isl; this.quay = q;
    if (this.deck) { const i = this.deck.isl.decks.indexOf(this.deck.d); if (i >= 0) this.deck.isl.decks.splice(i, 1); for (const c of this.deck.cols) { const k = this.deck.isl.extraColliders.indexOf(c); if (k >= 0) this.deck.isl.extraColliders.splice(k, 1); } }
    // the deck and the ramp as one long drivable deck, and the high sides as walls
    const d = { x: cx + Math.sin(bowIn) * 2, z: cz + Math.cos(bowIn) * 2, hw: this.W / 2 - 0.7, hd: this.L / 2 + 2, ang: -bowIn + Math.PI / 2 * 0, y: q.sea + this.dh, surf: SURF.CONCRETE };
    d.ang = bowIn; // deck frame: a along x', b along z' (see Island.deck)
    isl.decks.push(d);
    const cols = [];
    for (const s of [-1, 1]) { const sx = cx + Math.cos(bowIn) * s * (this.W / 2 - 0.3), sz = cz - Math.sin(bowIn) * s * (this.W / 2 - 0.3); cols.push({ x: sx, z: sz, hw: 0.3, hd: this.L / 2 - 2, ang: bowIn, kind: 'ferry' }); }
    isl.extraColliders.push(...cols);
    this.deck = { isl, d, cols };
    this.deckY = d.y;
  }
  onDeck(p) { if (!this.deck) return false; const d = this.deck.d, dx = p.x - this.group.position.x, dz = p.z - this.group.position.z, c = Math.cos(d.ang), s = Math.sin(d.ang); return Math.abs(dx * c - dz * s) < d.hw && Math.abs(dx * s + dz * c) < this.L / 2 - 2; }
}
