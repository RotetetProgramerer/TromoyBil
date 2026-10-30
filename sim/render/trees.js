// Trees, bushes and boulders. Every kind is built here from code: a trunk and branches, and foliage as many small cards with a
// leaf or needle texture drawn on a canvas. Near the camera the full trees are drawn (instanced, swaying in the wind, casting
// shadows); further away each tree is a billboard (an "impostor") rendered from the full tree when the game starts.
import * as THREE from 'three';
import { prep, U } from './gfx.js';
import { KIND } from '../world/island.js';
import { mulberry32 } from '../world/grid.js';

const K = KIND;
// height (m) of each kind at size 1, the foliage cell in the atlas, the bark colour
const SPEC = {
  [K.PINE]: { h: 17, leaf: 1, bark: '#8a5a3a', top: '#b86a3e' },
  [K.SPRUCE]: { h: 20, leaf: 0, bark: '#4a3a2c' },
  [K.BIRCH]: { h: 13, leaf: 2, bark: '#e8e4da' },
  [K.OAK]: { h: 13, leaf: 3, bark: '#4e463c' },
  [K.ASPEN]: { h: 15, leaf: 4, bark: '#9a9a88' },
  [K.JUNIPER]: { h: 3.5, leaf: 6, bark: '#4a3a2c' },
  [K.BUSH]: { h: 2.2, leaf: 5, bark: '#4a3a2c' },
  [K.FRUIT]: { h: 6, leaf: 3, bark: '#5a4a3a' },
  [K.REED]: { h: 1.6, leaf: 7, bark: '#7a8a4a' },
  [K.ROCK]: { h: 1.6, rock: true },
  [K.SNOWSPRUCE]: { h: 16, leaf: 0, bark: '#4a3a2c', snow: true },
  [K.PALM]: { h: 11, leaf: 8, bark: '#8a7a5a' },
  [K.OLIVE]: { h: 6, leaf: 9, bark: '#6a5a4a' },
  [K.CYPRESS]: { h: 12, leaf: 10, bark: '#5a4a3a' },
  [K.ACACIA]: { h: 8, leaf: 11, bark: '#5a4636' },
  [K.BAOBAB]: { h: 14, leaf: 11, bark: '#8a7a6a' },
  [K.JUNGLE]: { h: 26, leaf: 12, bark: '#6a5a46' },
  [K.FERN]: { h: 1.6, leaf: 13, bark: '#4a6a2a' },
  [K.DEADTREE]: { h: 9, bark: '#6a6056' },
  [K.GRASSCLUMP]: { h: 1.1, leaf: 7, bark: '#8a8a4a' },
  [K.AGAVE]: { h: 1.5, leaf: 14, bark: '#5a7a5a' },
};
export const TREE_KINDS = Object.keys(SPEC).map(Number);

// ------------------------------------------------------------------ the foliage atlas (4 × 4 cells, drawn on a canvas)
function foliageAtlas() {
  const S = 2048, C = S / 4, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), R = mulberry32(5);
  g.clearRect(0, 0, S, S);
  // the top-left pixel area stays solid white: the trunks sample it (their colour comes from the vertex colours)
  g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 8);
  const cell = (i, f) => { const x = (i % 4) * C, y = Math.floor(i / 4) * C; g.save(); g.beginPath(); g.rect(x + 2, y + 2, C - 4, C - 4); g.clip(); g.translate(x, y); f(); g.restore(); };
  const col = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // 0 spruce sprig: a twig with short needles along it, side twigs
  cell(0, () => {
    const twig = (x0, y0, ang, len, w) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      for (let t = 0; t < 1; t += 0.012) {
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, nl = (1 - t * 0.6) * w;
        for (const s of [-1, 1]) { g.strokeStyle = col(120 + R() * 25, 35 + R() * 20, 14 + R() * 12); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); const a2 = ang + s * (1.0 + R() * 0.4); g.lineTo(x + Math.cos(a2) * nl, y + Math.sin(a2) * nl); g.stroke(); }
      }
      g.strokeStyle = '#3a2a1c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    };
    twig(C * 0.5, C * 0.98, -Math.PI / 2, C * 0.92, C * 0.07);
    for (let k = 0; k < 9; k++) { const t = 0.12 + k * 0.09, y = C * (0.98 - 0.92 * t); for (const s of [-1, 1]) twig(C * 0.5, y, -Math.PI / 2 + s * (0.7 + R() * 0.3), C * (0.36 - t * 0.28), C * 0.05); }
  });
  // 1 pine tuft: long needles radiating from short shoots
  cell(1, () => {
    for (let k = 0; k < 14; k++) {
      const cx = C * (0.2 + R() * 0.6), cy = C * (0.2 + R() * 0.6), n = 40;
      for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, L = C * (0.08 + R() * 0.12); g.strokeStyle = col(95 + R() * 30, 30 + R() * 20, 18 + R() * 14); g.lineWidth = 1.8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.8); g.stroke(); }
    }
  });
  // leaves: 2 birch (small, light), 3 oak (lobed, darker), 4 aspen (round), 5 bush, 9 olive (silvery), 11 acacia, 12 jungle (big)
  const leaves = (n, size, hue, sat, lit, shape) => {
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(R()) * C * 0.45, a = R() * Math.PI * 2, x = C / 2 + Math.cos(a) * r, y = C / 2 + Math.sin(a) * r * 0.9, s = size * (0.7 + R() * 0.6), rot = R() * 6.28;
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = col(hue + R() * 14 - 7, sat + R() * 15, lit + R() * 16 - 8);
      g.beginPath();
      if (shape === 'oak') { for (let q = 0; q < 7; q++) { const yy = -s + q * s * 2 / 6, w = s * 0.45 * Math.sin(Math.PI * q / 6) * (q % 2 ? 1.2 : 0.8); g.ellipse(0, yy, w + 1, s * 0.24, 0, 0, 6.28); } }
      else if (shape === 'big') { g.ellipse(0, 0, s * 0.5, s, 0, 0, 6.28); }
      else g.ellipse(0, 0, s * (shape === 'round' ? 0.75 : 0.5), s * (shape === 'thin' ? 1.1 : 0.8), 0, 0, 6.28);
      g.fill();
      g.strokeStyle = 'rgba(30,40,20,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -s * 0.8); g.lineTo(0, s * 0.8); g.stroke();
      g.restore();
    }
    // a few twigs through the cluster
    g.strokeStyle = 'rgba(60,45,30,.8)'; g.lineWidth = 2.5; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(C / 2, C * 0.95); g.quadraticCurveTo(C * (0.3 + R() * 0.4), C * 0.5, C * (0.1 + R() * 0.8), C * (0.1 + R() * 0.3)); g.stroke(); }
  };
  cell(2, () => leaves(230, C * 0.035, 85, 45, 38, 'thin'));
  cell(3, () => leaves(120, C * 0.07, 95, 40, 26, 'oak'));
  cell(4, () => leaves(170, C * 0.045, 75, 45, 36, 'round'));
  cell(5, () => leaves(260, C * 0.04, 100, 35, 26, 'thin'));
  cell(9, () => leaves(260, C * 0.035, 80, 15, 48, 'thin'));
  cell(11, () => leaves(320, C * 0.025, 78, 40, 34, 'round'));
  cell(12, () => leaves(40, C * 0.16, 110, 55, 28, 'big'));
  // 6 juniper: dense prickly blue-green
  cell(6, () => { for (let i = 0; i < 1400; i++) { const x = R() * C, y = R() * C, a = R() * 6.28, L = C * 0.03; g.strokeStyle = col(150 + R() * 20, 15 + R() * 15, 22 + R() * 15); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); } });
  // 7 grass and reeds: blades from the bottom edge
  cell(7, () => { for (let i = 0; i < 160; i++) { const x = C * (0.1 + R() * 0.8), h = C * (0.4 + R() * 0.55), b = (R() - 0.5) * C * 0.25; g.strokeStyle = col(70 + R() * 30, 35 + R() * 20, 28 + R() * 22); g.lineWidth = 2 + R() * 2; g.beginPath(); g.moveTo(x, C); g.quadraticCurveTo(x + b * 0.3, C - h * 0.6, x + b, C - h); g.stroke(); } });
  // 8 palm frond, 10 cypress, 13 fern, 14 agave
  cell(8, () => { g.strokeStyle = '#5a6a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(C * 0.05, C * 0.5); g.quadraticCurveTo(C * 0.5, C * 0.3, C * 0.97, C * 0.55); g.stroke(); for (let t = 0.05; t < 0.97; t += 0.025) { const x = C * t, y = C * (0.5 - 0.4 * t * (1 - t)); for (const s of [-1, 1]) { g.strokeStyle = col(85 + R() * 20, 45, 30 + R() * 10); g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + C * 0.05, y + s * C * 0.22 * (1 - Math.abs(t - 0.45))); g.stroke(); } } });
  cell(10, () => { for (let i = 0; i < 2500; i++) { const y = R() * C, w = C * 0.32 * Math.sin(Math.PI * y / C) ** 0.6, x = C / 2 + (R() - 0.5) * 2 * w; g.fillStyle = col(130 + R() * 20, 30, 16 + R() * 12); g.fillRect(x, y, 3, 5); } });
  cell(13, () => { for (let f = 0; f < 6; f++) { const a = -Math.PI / 2 + (f - 2.5) * 0.35; const x0 = C / 2, y0 = C; for (let t = 0; t < 1; t += 0.02) { const x = x0 + Math.cos(a) * C * 0.9 * t, y = y0 + Math.sin(a) * C * 0.9 * t + C * 0.25 * t * t; for (const s of [-1, 1]) { g.strokeStyle = col(100 + R() * 15, 50, 28 + R() * 10); g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a + s * 1.4) * C * 0.08 * (1 - t), y + Math.sin(a + s * 1.4) * C * 0.08 * (1 - t)); g.stroke(); } } } });
  cell(14, () => { for (let f = 0; f < 14; f++) { const a = -Math.PI / 2 + (f - 6.5) * 0.2; g.fillStyle = col(150, 20, 40 + R() * 10); g.beginPath(); g.moveTo(C / 2 - 8, C); g.lineTo(C / 2 + Math.cos(a) * C * 0.9, C + Math.sin(a) * C * 0.9); g.lineTo(C / 2 + 8, C); g.fill(); } });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ------------------------------------------------------------------ geometry builders
class GB {
  constructor() { this.P = []; this.N = []; this.UV = []; this.C = []; this.W = []; this.I = []; }
  v(x, y, z, nx, ny, nz, u, v, c, w) { this.P.push(x, y, z); this.N.push(nx, ny, nz); this.UV.push(u, v); this.C.push(c[0], c[1], c[2]); this.W.push(w); return this.P.length / 3 - 1; }
  // a tapered cylinder from a to b (radius r0 → r1), bark colour; w = how much it sways
  cyl(a, b, r0, r1, c, seg = 7, w0 = 0, w1 = 0) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length(); d.normalize();
    const t = Math.abs(d.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), u = new THREE.Vector3().crossVectors(d, t).normalize(), v = new THREE.Vector3().crossVectors(d, u);
    const base = this.P.length / 3;
    for (let i = 0; i <= seg; i++) {
      const an = i / seg * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an), n = new THREE.Vector3().addScaledVector(u, cs).addScaledVector(v, sn);
      this.v(a.x + n.x * r0, a.y + n.y * r0, a.z + n.z * r0, n.x, n.y, n.z, 0.001, 0.001, c, w0);
      this.v(b.x + n.x * r1, b.y + n.y * r1, b.z + n.z * r1, n.x, n.y, n.z, 0.001, 0.001, c, w1);
    }
    for (let i = 0; i < seg; i++) { const q = base + i * 2; this.I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  }
  // a foliage card: centre p, facing n (normal used for lighting), size w×h, atlas cell, up direction
  card(p, right, up, w, h, cellI, nrm, c, sway, uvFlip = false) {
    const cx = (cellI % 4) / 4, cy = Math.floor(cellI / 4) / 4, e = 0.004;
    const u0 = cx + e, u1 = cx + 0.25 - e, v0 = 1 - (cy + 0.25 - e), v1 = 1 - (cy + e);
    const q = (sx, sy, uu, vv) => this.v(p.x + right.x * sx * w + up.x * sy * h, p.y + right.y * sx * w + up.y * sy * h, p.z + right.z * sx * w + up.z * sy * h, nrm.x, nrm.y, nrm.z, uu, vv, c, sway);
    const a = q(-0.5, -0.5, uvFlip ? u1 : u0, v0), b = q(0.5, -0.5, uvFlip ? u0 : u1, v0), d = q(0.5, 0.5, uvFlip ? u0 : u1, v1), f = q(-0.5, 0.5, uvFlip ? u1 : u0, v1);
    this.I.push(a, b, d, a, d, f);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.W, 1)); g.setIndex(this.I); g.computeBoundingSphere();
    return g;
  }
}
const lin = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };   // ColorManagement converts the hex to linear
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function buildKind(k) {
  const s = SPEC[k], b = new GB(), R = mulberry32(k * 977 + 13), H = s.h;
  const bark = lin(s.bark || '#5a4a3a');
  const leafCol = () => { const v = 0.75 + R() * 0.4; return [v, v, v]; };
  const outN = (p, c) => V(p.x - c.x, (p.y - c.y) * 0.7 + 0.35, p.z - c.z).normalize();
  const cardAround = (p, center, size, cell, sway) => {
    const n = outN(p, center), up = V((R() - 0.5) * 0.6, 1, (R() - 0.5) * 0.6).normalize(), right = new THREE.Vector3().crossVectors(up, n).normalize();
    if (right.lengthSq() < 0.1) right.set(1, 0, 0);
    const up2 = new THREE.Vector3().crossVectors(n, right).normalize();
    b.card(p, right, up2, size, size, cell, n, leafCol(), sway, R() < 0.5);
    // and one across it, so the cluster has volume from every side
    b.card(p, n.clone().cross(up2).normalize().lerp(right, 0.3).normalize(), up2, size * 0.9, size * 0.9, cell, n, leafCol(), sway, R() < 0.5);
  };
  if (s.rock) {
    const g = new THREE.IcosahedronGeometry(1, 2), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), n = 0.75 + 0.35 * Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7) + 0.12 * Math.sin(x * 9 + y * 7); pos.setXYZ(i, x * n * 1.2, Math.max(-0.35, y * n * 0.75), z * n); }
    g.computeVertexNormals();
    const n = pos.count, C = new Float32Array(n * 3).fill(1), Wt = new Float32Array(n), uv = new Float32Array(n * 2);
    const rc = lin('#8a847c');
    for (let i = 0; i < n; i++) { const f = 0.75 + 0.35 * R(); C[i * 3] = rc[0] * f; C[i * 3 + 1] = rc[1] * f; C[i * 3 + 2] = rc[2] * f; uv[i * 2] = 0.001; uv[i * 2 + 1] = 0.999; }
    g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('sway', new THREE.BufferAttribute(Wt, 1)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g.toNonIndexed ? g : g;
  }
  if (k === K.SPRUCE || k === K.SNOWSPRUCE) {
    // a Norway spruce: tiers of drooping branches like stacked skirts, narrowing to a pointed top
    b.cyl(V(0, -0.3, 0), V(0, H, 0), H * 0.014, H * 0.002, bark, 7, 0, 0.6);
    const levels = 20;
    for (let l = 0; l < levels; l++) {
      const t = 0.07 + 0.9 * l / levels, y = H * t, R0 = H * 0.25 * Math.pow(1 - t, 0.9) + 0.25, n = Math.max(5, Math.round(12 * (1 - t) + 4)), droop = R0 * (0.5 + 0.25 * t);
      for (let i = 0; i < n; i++) {
        const a = (i / n + l * 0.19 + R() * 0.12) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), Rr = R0 * (0.85 + R() * 0.3);
        const out = V(dx * Rr, -droop, dz * Rr), len = out.length(); out.normalize();
        const mid = V(dx * Rr * 0.5, y - droop * 0.5, dz * Rr * 0.5), side = V(-dz, 0, dx), nrm = new THREE.Vector3().crossVectors(side, out).normalize();
        if (nrm.y < 0) nrm.negate();
        nrm.lerp(V(dx, 0.4, dz).normalize(), 0.5).normalize();
        const w = Math.max(0.6, 2 * Math.PI * Rr / n * 1.35);
        const c = s.snow && R() < 0.55 ? [1.7, 1.7, 1.8] : leafCol().map(v => v * 0.8);
        b.card(mid, side, out, w, len * 1.08, 0, nrm, c, t);
        // the hanging side shoots under each branch, so the tree looks full from the side
        if (l % 2 === 0 && t < 0.85) b.card(V(dx * Rr * 0.62, y - droop * 0.85, dz * Rr * 0.62), side, V(dx * 0.25, -1, dz * 0.25).normalize(), w * 0.7, droop * 0.9 + 0.4, 0, V(dx, 0.3, dz).normalize(), c, t);
      }
    }
    for (const r of [0, 1.57]) b.card(V(0, H * 0.96, 0), V(Math.cos(r), 0, Math.sin(r)), V(0, 1, 0), H * 0.06, H * 0.1, 0, V(0, 1, 0), leafCol(), 1);
  } else if (k === K.PINE) {
    const top = lin(s.top);
    b.cyl(V(0, -0.3, 0), V(0, H * 0.55, 0), H * 0.018, H * 0.011, bark, 7, 0, 0.3);
    b.cyl(V(0, H * 0.55, 0), V(R() - 0.5, H * 0.93, R() - 0.5), H * 0.011, H * 0.003, top, 6, 0.3, 0.8);
    const c = V(0, H * 0.8, 0);
    for (let i = 0; i < 9; i++) {
      const a = R() * 6.28, y = H * (0.6 + R() * 0.3), L = H * (0.1 + R() * 0.12);
      const end = V(Math.cos(a) * L, y + L * 0.3, Math.sin(a) * L);
      b.cyl(V(0, y, 0), end, H * 0.005, H * 0.002, top, 5, 0.4, 0.8);
      for (let j = 0; j < 7; j++) cardAround(V(end.x * (0.45 + R() * 0.7), end.y + (R() - 0.3) * H * 0.06, end.z * (0.45 + R() * 0.7)), c, H * 0.075, 1, 0.8);
    }
    for (let j = 0; j < 22; j++) { const a = R() * 6.28, r = R() * H * 0.13; cardAround(V(Math.cos(a) * r, H * (0.82 + R() * 0.15), Math.sin(a) * r), c, H * 0.08, 1, 0.9); }
  } else if (k === K.JUNIPER || k === K.CYPRESS) {
    b.cyl(V(0, -0.1, 0), V(0, H * 0.3, 0), H * 0.03, H * 0.02, bark, 5);
    for (let j = 0; j < 46; j++) { const t = R(), a = R() * 6.28, r = H * 0.16 * Math.sin(Math.PI * (0.15 + t * 0.85)) ** 0.7; cardAround(V(Math.cos(a) * r, H * (0.1 + t * 0.85), Math.sin(a) * r), V(0, H * (0.1 + t * 0.85), 0), H * 0.2, s.leaf, t); }
  } else if (k === K.REED || k === K.GRASSCLUMP || k === K.FERN || k === K.AGAVE) {
    for (let j = 0; j < 5; j++) { const a = j / 5 * Math.PI; b.card(V(0, H * 0.5, 0), V(Math.cos(a), 0, Math.sin(a)), V(0, 1, 0), H * 1.1, H, s.leaf, V(0, 1, 0), leafCol(), 1); }
  } else if (k === K.PALM) {
    let p = V(0, -0.2, 0); const lean = V(R() - 0.5, 0, R() - 0.5).multiplyScalar(0.25);
    for (let i = 0; i < 6; i++) { const q = V(lean.x * H * (i + 1) / 6 * (i + 1) / 6, H * (i + 1) / 6, lean.z * H * (i + 1) / 6 * (i + 1) / 6); b.cyl(p, q, H * 0.03, H * 0.026, bark, 7, i / 6, (i + 1) / 6); p = q; }
    for (let f = 0; f < 11; f++) { const a = f / 11 * 6.28, d = V(Math.cos(a), -0.25, Math.sin(a)).normalize(), side = V(-Math.sin(a), 0, Math.cos(a)); b.card(p.clone().addScaledVector(d, H * 0.24), d, side, H * 0.48, H * 0.22, 8, V(0, 1, 0), leafCol(), 1); }
  } else if (k === K.DEADTREE) {
    // a dead tree (the ash slopes of the volcano): a bare, leaning trunk and a few broken, forked branches
    const lean = V((R() - 0.5) * 0.3, 1, (R() - 0.5) * 0.3).normalize(), top = lean.clone().multiplyScalar(H * 0.85);
    b.cyl(V(0, -0.3, 0), top, H * 0.03, H * 0.008, bark, 7, 0, 0.1);
    for (let i = 0; i < 6; i++) {
      const t = 0.35 + i * 0.1, a = R() * 6.28, base = lean.clone().multiplyScalar(H * 0.85 * t), L = H * (0.28 - t * 0.15);
      const end = base.clone().add(V(Math.cos(a) * L, L * (0.35 + R() * 0.4), Math.sin(a) * L));
      b.cyl(base, end, H * 0.012, H * 0.003, bark, 5, 0.05, 0.2);
      const fork = end.clone().add(V((R() - 0.5) * L * 0.6, L * 0.3, (R() - 0.5) * L * 0.6)); b.cyl(end.clone().lerp(base, 0.3), fork, H * 0.005, H * 0.002, bark, 4, 0.1, 0.25);
    }
  } else {
    // broadleaf trees and bushes: a trunk splitting into boughs, leaf clusters in a rounded crown
    // (rainforest trees: a tall bare trunk and a wide, flattish crown on top)
    const bush = k === K.BUSH, crownY = bush ? H * 0.55 : H * (k === K.BIRCH ? 0.64 : k === K.JUNGLE ? 0.74 : 0.6), crownR = bush ? H * 0.55 : H * (k === K.OAK || k === K.ACACIA ? 0.38 : k === K.BAOBAB ? 0.32 : k === K.JUNGLE ? 0.3 : 0.27);
    const c = V(0, crownY, 0);
    if (!bush) {
      const tr = k === K.BAOBAB ? 0.11 : k === K.OAK ? 0.035 : 0.022;
      b.cyl(V(0, -0.3, 0), V(0, crownY * 0.7, 0), H * tr, H * tr * 0.75, bark, 8, 0, 0.2);
      for (let i = 0; i < (k === K.ACACIA ? 6 : 5); i++) {
        const a = i / 5 * 6.28 + R(), up = k === K.ACACIA ? 0.35 : 0.8, end = V(Math.cos(a) * crownR * 0.7, crownY + crownR * up * (0.3 + R() * 0.5), Math.sin(a) * crownR * 0.7);
        b.cyl(V(0, crownY * 0.68, 0), end, H * tr * 0.55, H * 0.004, bark, 6, 0.2, 0.8);
      }
    }
    const nCl = bush ? 22 : k === K.JUNGLE ? 44 : 34, flat = k === K.ACACIA ? 0.35 : k === K.BIRCH ? 1.25 : k === K.JUNGLE ? 0.5 : 0.85;
    for (let j = 0; j < nCl; j++) {
      const u = R() * 2 - 1, a = R() * 6.28, rr = Math.pow(R(), 0.35);
      const p = V(Math.cos(a) * Math.sqrt(1 - u * u) * crownR * rr, crownY + u * crownR * flat * rr, Math.sin(a) * Math.sqrt(1 - u * u) * crownR * rr);
      cardAround(p, c, crownR * (bush ? 0.65 : 0.5), s.leaf, bush ? 0.6 : 0.9);
    }
  }
  return b.geometry();
}

// ------------------------------------------------------------------ materials
function treeMaterial(gfx, atlas, impostor) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const patch = sh => {
    sh.vertexShader = 'attribute float sway; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iw = instanceMatrix[3].xyz; float ph = uTime * 1.3 + iw.x * 0.21 + iw.z * 0.17;
        float amp = sway * (0.05 + 0.04 * sin(uTime * 0.37 + iw.x * 0.01));
        transformed.x += sin(ph) * amp * 1.0 + sin(ph * 3.1 + position.y) * amp * 0.25;
        transformed.z += cos(ph * 0.8) * amp * 0.8;
      #endif`);
    // foliage is see-through for light: lit from behind it glows a little, and it is never pitch black
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.08;');
  };
  patch.key = 'tree';
  prep(mat, patch); gfx.shadowed(mat);
  return mat;
}
// impostors: one card per tree that turns to face the camera (round its upright axis); its picture comes from the atlas of
// pre-rendered trees. Per instance: position, size, kind (the atlas cell).
function impostorMaterial(gfx, tex) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const patch = sh => {
    sh.vertexShader = 'attribute vec4 iData; attribute float iSize; varying vec2 vImpUv;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vImpUv = vec2((mod(iData.w, 8.0) + uv.x) / 8.0, 1.0 - (floor(iData.w / 8.0) + 1.0 - uv.y) / 4.0);')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `vec2 tc = normalize(cameraPosition.xz - iData.xz + 1e-4);
        vec3 transformed = iData.xyz + vec3(tc.y, 0.0, -tc.x) * position.x * iSize + vec3(0.0, position.y * iSize, 0.0);`)
      .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(transformed, 1.0);')
      .replace('#include <fog_vertex>', '#ifdef USE_FOG\n vFogPos = transformed;\n#endif');
    sh.fragmentShader = 'varying vec2 vImpUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D(map, vImpUv); diffuseColor *= sampledDiffuseColor;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.1;');
  };
  patch.key = 'impostor';
  prep(mat, patch);
  return mat;
}

// ------------------------------------------------------------------ the forest manager
const TILE = 256;
export class Forest {
  constructor(gfx, world, worker) {
    this.gfx = gfx; this.world = world; this.worker = worker;
    this.group = new THREE.Group(); gfx.scene.add(this.group);
    this.atlas = foliageAtlas();
    this.mat = treeMaterial(gfx, this.atlas);
    this.rockMat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); gfx.shadowed(this.rockMat);
    this.geo = {}; for (const k of TREE_KINDS) this.geo[k] = buildKind(k);
    this.heights = {}; for (const k of TREE_KINDS) this.heights[k] = SPEC[k].h;
    this.impTex = this.renderImpostors();
    this.impMat = impostorMaterial(gfx, this.impTex);
    const q = new THREE.PlaneGeometry(1, 1); q.translate(0, 0.5, 0); this.impGeo = q;
    this.tiles = new Map(); this.inflight = 0; this.frame = 0; this.blocks = new Map();
    worker.on('trees', m => this.arrive(m));
  }
  // render every kind from the side into an 8 × 4 atlas (256 × 256 per tree)
  renderImpostors() {
    const r = this.gfx.renderer, W = 256 * 8, H = 256 * 4, rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace });
    const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-0.5, 0.5, 1, 0, 0.1, 100);
    sc.add(new THREE.HemisphereLight(0xdfeaff, 0x4a4030, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(0.5, 1, 0.8); sc.add(dl);
    const mat = new THREE.MeshStandardMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
    const rockM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const old = r.getRenderTarget(), oc = r.getClearColor(new THREE.Color()), oa = r.getClearAlpha(), tm = r.toneMapping;
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.toneMapping = THREE.NoToneMapping;
    TREE_KINDS.forEach((k, i) => {
      const m = new THREE.Mesh(this.geo[k], SPEC[k].rock ? rockM : mat), h = SPEC[k].h * (SPEC[k].rock ? 1.4 : 1.05);
      sc.add(m);
      cam.left = -h * 0.5; cam.right = h * 0.5; cam.top = h; cam.bottom = 0; cam.position.set(0, h * 0.5, 50); cam.lookAt(0, h * 0.5, 0); cam.updateProjectionMatrix();
      const col = i % 8, row = Math.floor(i / 8);
      rt.viewport.set(col * 256, H - (row + 1) * 256, 256, 256); rt.scissor.copy(rt.viewport); rt.scissorTest = true;
      r.setRenderTarget(rt); r.render(sc, cam); sc.remove(m);
    });
    rt.viewport.set(0, 0, W, H); rt.scissor.set(0, 0, W, H); rt.scissorTest = false;
    r.setRenderTarget(old); r.setClearColor(oc, oa); r.toneMapping = tm;
    this.impIndex = Object.fromEntries(TREE_KINDS.map((k, i) => [k, i]));
    this.impScale = Object.fromEntries(TREE_KINDS.map(k => [k, SPEC[k].h * (SPEC[k].rock ? 1.4 : 1.05)]));
    rt.texture.generateMipmaps = true;
    return rt.texture;
  }
  update(cam) {
    this.frame++;
    if (this.frame % 8) return this.flush(cam);
    const Q = this.gfx.q, R = Math.max(Q.trees, Q.treesFar), near = Q.trees * 0.05 + 90;
    const i0 = Math.floor((cam.x - R) / TILE), i1 = Math.floor((cam.x + R) / TILE), j0 = Math.floor((cam.z - R) / TILE), j1 = Math.floor((cam.z + R) / TILE);
    const keep = new Set();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * TILE, cz = (j + 0.5) * TILE, d = Math.hypot(cx - cam.x, cz - cam.z);
      if (d > R + TILE) continue;
      if (!this.world.islands.some(isl => cx > isl.x0 && cx < isl.x1 && cz > isl.z0 && cz < isl.z1)) continue;
      const k = i + ':' + j; keep.add(k);
      let t = this.tiles.get(k);
      if (!t) { t = { i, j, state: 0, data: null, near: null, d }; this.tiles.set(k, t); }
      t.d = d;
      const wantNear = d < near + (t.near ? 40 : 0);
      if (t.state === 2) {
        if (wantNear && !t.near) this.makeNear(t);
        if (!wantNear && t.near) { this.group.remove(t.near); t.near = null; t.dirtyFar = true; }
        t.far = d < Q.treesFar && !wantNear;
      }
    }
    for (const [k, t] of this.tiles) if (!keep.has(k)) { if (t.near) this.group.remove(t.near); this.tiles.delete(k); }
    this.rebuildBlocks(cam);
    this.flush(cam);
  }
  flush(cam) {
    if (this.inflight >= 3) return;
    const list = [...this.tiles.values()].filter(t => t.state === 0).sort((a, b) => a.d - b.d);
    for (const t of list) {
      if (this.inflight >= 3) break;
      t.state = 1; this.inflight++;
      this.worker.post({ type: 'trees', id: t.i + ':' + t.j, x0: t.i * TILE, z0: t.j * TILE, size: TILE });
    }
  }
  arrive(m) {
    this.inflight--;
    const t = this.tiles.get(m.id); if (!t) return;
    const parts = m.parts.filter(p => p.T.length);
    let n = 0; for (const p of parts) n += p.T.length; const A = new Float32Array(n); let o = 0; for (const p of parts) { A.set(p.T, o); o += p.T.length; }
    t.data = A; t.state = 2; t.dirtyFar = true;
  }
  // the full trees of a near tile: one instanced mesh per kind
  makeNear(t) {
    const g = new THREE.Group(), A = t.data, by = {};
    for (let i = 0; i < A.length; i += 6) (by[A[i + 5]] || (by[A[i + 5]] = [])).push(i);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (const k in by) {
      const L = by[k], rock = SPEC[k] && SPEC[k].rock, mesh = new THREE.InstancedMesh(this.geo[k] || this.geo[K.BUSH], rock ? this.rockMat : this.mat, L.length);
      L.forEach((i, n) => { p.set(A[i], A[i + 1], A[i + 2]); q.setFromAxisAngle(Y, A[i + 4]); const sc = A[i + 3]; s.set(sc, sc * (rock ? 0.8 : 1), sc); m4.compose(p, q, s); mesh.setMatrixAt(n, m4); });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); g.add(mesh);
    }
    t.near = g; this.group.add(g);
  }
  // far trees: impostors in blocks of 4 × 4 tiles, rebuilt when a tile of the block changes
  rebuildBlocks(cam) {
    const blocks = new Map();
    for (const t of this.tiles.values()) { if (t.state !== 2) continue; const bk = Math.floor(t.i / 4) + ':' + Math.floor(t.j / 4); (blocks.get(bk) || blocks.set(bk, []).get(bk)).push(t); }
    for (const [bk, b] of this.blocks) if (!blocks.has(bk)) { this.group.remove(b.mesh); if (b.mesh.geometry) b.mesh.geometry.dispose(); this.blocks.delete(bk); }
    for (const [bk, ts] of blocks) {
      const sig = ts.filter(t => t.far).map(t => t.i + ',' + t.j).sort().join(';');
      const old = this.blocks.get(bk);
      if (old && old.sig === sig) continue;
      if (old) { this.group.remove(old.mesh); if (old.mesh.geometry) old.mesh.geometry.dispose(); this.blocks.delete(bk); }
      let n = 0; for (const t of ts) if (t.far) n += t.data.length / 6;
      if (!n) { this.blocks.set(bk, { sig, mesh: new THREE.Group() }); continue; }
      // per instance: iData = (x, y, z, atlas cell), iSize = the height of the picture
      const iP = new Float32Array(n * 4), iS = new Float32Array(n); let o = 0;
      for (const t of ts) if (t.far) { const A = t.data; for (let i = 0; i < A.length; i += 6) { const k = A[i + 5]; iP[o * 4] = A[i]; iP[o * 4 + 1] = A[i + 1] - 0.3; iP[o * 4 + 2] = A[i + 2]; iP[o * 4 + 3] = this.impIndex[k]; iS[o] = this.impScale[k] * A[i + 3]; o++; } }
      const g = new THREE.InstancedBufferGeometry(); g.index = this.impGeo.index; g.setAttribute('position', this.impGeo.attributes.position); g.setAttribute('uv', this.impGeo.attributes.uv); g.setAttribute('normal', this.impGeo.attributes.normal);
      g.setAttribute('iData', new THREE.InstancedBufferAttribute(iP, 4)); g.setAttribute('iSize', new THREE.InstancedBufferAttribute(iS, 1));
      g.instanceCount = n;
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const t of ts) { x0 = Math.min(x0, t.i * TILE); z0 = Math.min(z0, t.j * TILE); x1 = Math.max(x1, t.i * TILE + TILE); z1 = Math.max(z1, t.j * TILE + TILE); }
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, 30, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0) / 2 + 40);
      const mesh = new THREE.Mesh(g, this.impMat); mesh.frustumCulled = true;
      this.group.add(mesh); this.blocks.set(bk, { sig, mesh });
    }
  }
}
