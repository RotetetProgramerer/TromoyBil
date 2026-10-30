// Gautefall as a ski resort, on top of what sim/render/special.js already draws there (the chairlift with its moving chairs, the
// pistes' marker poles and gate poles, the start huts and the signs): the kickers on the jump piste, panels on the slalom gates, a
// start gate with a wand and a banner at the top of every piste and flags by the huts, the finish with a timing board and cheering
// spectators, markers along the groomed link where Familiebakken loops, light beams over the next gate, people riding the chairs
// and other skiers on the family piste. The geometry comes from the SkiArea (sim/physics/skier.js) so it matches the physics.
import * as THREE from 'three';
import { prep, U } from './gfx.js';
import { figureGeometry } from './skiervis.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const JACKETS = ['#2f6fd6', '#f2c230', '#3fae3a', '#e86a1e', '#7a3fae', '#20a4a4', '#e83e8c', '#d9432f', '#f4f4f0', '#1d1c1a'];
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fmtT = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ','); };

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export class SkiResort {
  // area: the SkiArea; special: the game's Special (its clock and chairs move the riders the same way)
  constructor(gfx, world, area, special) {
    this.gfx = gfx; this.world = world; this.area = area; this.special = special; this.t = 0;
    this.group = new THREE.Group(); gfx.scene.add(this.group); this.over = new THREE.Group(); gfx.overlay.add(this.over);
    const M = this.M = {}, m = (k, o) => { const x = prep(new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.7 }, o))); if (!o.transparent) gfx.shadowed(x); return (M[k] = x); };
    m('snow', { color: '#e4ebf3', roughness: 0.75 }); m('blue', { color: '#2f6fd6', roughness: 0.6 }); m('post', { color: '#3a3f44', roughness: 0.5, metalness: 0.3 }); m('wand', { color: '#f2c230', roughness: 0.4 });
    m('white', { color: '#f2f2ee', roughness: 0.6 }); m('fence', { color: '#e2361c', roughness: 0.8, side: THREE.DoubleSide }); m('people', { vertexColors: true, roughness: 0.7 });
    this.box = new THREE.BoxGeometry(1, 1, 1); this.cyl = new THREE.CylinderGeometry(1, 1, 1, 8); this.cyl.translate(0, 0.5, 0);
    this.corduroy();
    for (const q of area.kickers) this.kicker(q);
    for (const k of area.pistes) { this.start(k); this.finish(k); if (k.kind === 'slalom') this.panels(k); for (const l of k.links) this.link(k, l); }
    this.beams(); this.riders(); this.skiers(); this.floods();
  }
  // floodlights along the pistes for skiing at night (Gautefall's slopes are lit): a mast every 60 m on alternate sides, the heads
  // glow after dark, and the few masts nearest the skier are real spotlights (a fixed number, made before the first frame)
  floods() {
    const L = this.lamps = this.area.masts;
    const pole = new THREE.CylinderGeometry(0.09, 0.15, 11, 8); pole.translate(0, 5.5, 0); const head = new THREE.BoxGeometry(1.1, 0.45, 0.35); head.translate(0, 11.2, 0.35); head.rotateX(0);
    const metal = prep(new THREE.MeshStandardMaterial({ color: '#8a8e92', metalness: 0.6, roughness: 0.45 })); this.gfx.shadowed(metal);
    this.floodLens = prep(new THREE.MeshStandardMaterial({ color: '#dddad0', emissive: '#fff1d0', emissiveIntensity: 0, roughness: 0.3 }));
    const mk = (g, m) => { const im = new THREE.InstancedMesh(g, m, L.length); im.castShadow = true; im.frustumCulled = false; L.forEach((o, i) => { _q.setFromAxisAngle(_s.set(0, 1, 0), o.ang); _m.compose(_p.set(o.x, o.y - 0.2, o.z), _q, _s.set(1, 1, 1)); im.setMatrixAt(i, _m); }); this.group.add(im); return im; };
    mk(pole, metal); mk(head, this.floodLens);
    this.spots = Array.from({ length: { lav: 0, middels: 2 }[this.gfx.qName] ?? 3 }, () => { const s = new THREE.SpotLight(0xfff0d8, 0, 85, 0.8, 0.55, 1.15); s.castShadow = false; this.gfx.scene.add(s, s.target); return s; });
  }
  updFloods(dt, cam, player) {
    const on = THREE.MathUtils.smoothstep(U.uNight.value, 0.3, 0.6); this.floodLens.emissiveIntensity = on * 12;
    if ((this.floodT = (this.floodT || 0) - dt) > 0) return; this.floodT = 0.3;
    const p = player || cam, near = on > 0 ? this.lamps.map(o => [o, (o.x - p.x) ** 2 + (o.z - p.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, this.spots.length) : [];
    this.spots.forEach((s, i) => { const e = near[i]; if (!e || e[1] > 250 * 250) { s.intensity = 0; return; } const o = e[0];
      s.position.set(o.x + Math.sin(o.ang) * 0.5, o.y + 11, o.z + Math.cos(o.ang) * 0.5); s.target.position.set(o.x + Math.sin(o.ang) * 22, o.y - 2, o.z + Math.cos(o.ang) * 22); s.target.updateMatrixWorld(); s.intensity = on * 110; });
  }
  // the groomed snow: a 2 m grid over every piste at the height the skis ride on (the island's ground smoothed, plus the packed
  // layer), with the groomer's corduroy in passes down the hill and the seams between them; it fades out at the edges
  corduroy() {
    const A = this.area, step = 2, verts = new Map(), quads = new Set(), P = [], UV = [], C = [], I = [];
    for (const k of A.pistes) {
      const near = new Map();
      for (const sg of k.segs) {
        const a = sg.a, b = sg.b, ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1e-9, l = Math.sqrt(l2), R = sg.hw + 1;
        for (let j = Math.floor((Math.min(a.z, b.z) - R) / step); j <= Math.ceil((Math.max(a.z, b.z) + R) / step); j++) for (let i = Math.floor((Math.min(a.x, b.x) - R) / step); i <= Math.ceil((Math.max(a.x, b.x) + R) / step); i++) {
          const x = i * step, z = j * step, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)), d = Math.hypot(x - a.x - ex * t, z - a.z - ez * t), m = sg.hw - d;
          if (m < -1) continue; const key = i * 100003 + j, o = near.get(key);
          if (!o || m > o.m) near.set(key, { i, j, x, z, m, lat: ((x - a.x) * ez - (z - a.z) * ex) / l, s: (sg.link ? sg.a.s : a.s) + t * l });
        }
      }
      for (const [key, o] of near) { const al = Math.max(0, Math.min(1, (o.m + 1) / 2.6)), v = verts.get(key); if (v != null) { C[v * 4 + 3] = Math.max(C[v * 4 + 3], al); continue; }
        verts.set(key, P.length / 3); P.push(o.x, A.snow(o.x, o.z) - 0.01, o.z); UV.push(o.lat / 4.2, o.s / 6); C.push(1, 1, 1, al); }
      for (const [key] of near) { if (quads.has(key) || !near.has(key + 100003) || !near.has(key + 1) || !near.has(key + 100004)) continue; quads.add(key); const a = verts.get(key), b = verts.get(key + 100003), c = verts.get(key + 1), d = verts.get(key + 100004); I.push(a, c, b, b, c, d); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4)); g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere();
    const W = 512, NR = 110, map = canvasTex(W, W, (x) => { const img = x.createImageData(W, W), d = img.data;
      for (let j = 0; j < W; j++) { const jit = hash(j) - 0.5; for (let i = 0; i < W; i++) { const u = i / W, ridge = 0.5 + 0.5 * Math.cos(u * NR * 2 * Math.PI), seam = Math.max(0, 1 - Math.min(u, 1 - u) * W / 9), k = (j * W + i) * 4, b = 214 + ridge * 14 + jit * 5 - seam * 18 + (hash(i * 7 + j * 131) - 0.5) * 6;
        d[k] = Math.min(255, b - 10); d[k + 1] = Math.min(255, b - 2); d[k + 2] = Math.min(255, b + 12); d[k + 3] = 255; } }
      x.putImageData(img, 0, 0); });
    const nrm = canvasTex(W, 16, (x) => { const img = x.createImageData(W, 16), d = img.data; for (let j = 0; j < 16; j++) for (let i = 0; i < W; i++) { const s = -Math.sin(i / W * NR * 2 * Math.PI) * 0.45, l = Math.hypot(s, 1), k = (j * W + i) * 4; d[k] = (s / l * 0.5 + 0.5) * 255; d[k + 1] = 128; d[k + 2] = (1 / l * 0.5 + 0.5) * 255; d[k + 3] = 255; } x.putImageData(img, 0, 0); });
    nrm.colorSpace = THREE.NoColorSpace; for (const t of [map, nrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    const mat = prep(new THREE.MeshStandardMaterial({ map, normalMap: nrm, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 0.8, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.gfx.shadowed(mat); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; this.group.add(m); this.piste = m;
  }
  mesh(geo, mat, p, s, r = 0, parent = this.group) { const x = new THREE.Mesh(geo, mat); x.position.set(p[0], p[1], p[2]); x.scale.set(s[0], s[1], s[2]); if (typeof r === 'number') x.rotation.y = r; else x.rotation.set(r[0], r[1], r[2], r[3] || 'XYZ'); x.castShadow = true; x.receiveShadow = true; parent.add(x); return x; }
  post(x, z, h, r, mat, y = this.world.height(x, z)) { return this.mesh(this.cyl, mat, [x, y - 0.1, z], [r, h + 0.1, r]); }
  // a kicker: packed snow over the ramp and the drop behind its lip, a blue line along the lip
  kicker(q) {
    const A = this.area, na = 30, nb = 12, a0 = -q.len - 0.4, a1 = q.back + 0.3, bw = q.w + 0.9, nx = q.tz, nz = -q.tx, P = [], I = [];
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) { const a = a0 + (a1 - a0) * i / na, b = -bw + 2 * bw * j / nb, x = q.x + q.tx * a + nx * b, z = q.z + q.tz * a + nz * b; P.push(x, A.ground(x, z) + 0.04, z); }
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) { const k = i * (nb + 1) + j; I.push(k, k + 1, k + nb + 1, k + 1, k + nb + 2, k + nb + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const mm = new THREE.Mesh(g, this.M.snow); mm.receiveShadow = true; mm.castShadow = true; this.group.add(mm);
    // blue dye along the sides of the ramp
    for (const sd of [-1, 1]) for (let a = -q.len; a < 0; a += 1) { const P = t => [q.x + q.tx * t + nx * sd * (q.w - 0.1), q.z + q.tz * t + nz * sd * (q.w - 0.1)], [x0, z0] = P(a), [x1, z1] = P(a + 1), y0 = A.ground(x0, z0), y1 = A.ground(x1, z1);
      this.mesh(this.box, this.M.blue, [(x0 + x1) / 2, (y0 + y1) / 2 + 0.05, (z0 + z1) / 2], [0.12, 0.02, 1.02], [-Math.atan2(y1 - y0, 1), Math.atan2(q.tx, q.tz), 0, 'YXZ']).castShadow = false; }
    const lx = q.x - q.tx * 0.12, lz = q.z - q.tz * 0.12; this.mesh(this.box, this.M.blue, [lx, A.ground(lx, lz) + 0.05, lz], [q.w * 2, 0.03, 0.18], Math.atan2(q.tx, q.tz));
    for (const sd of [-1, 1]) { const x = q.x - q.tx * q.len * 0.5 + nx * sd * (q.w + 1.6), z = q.z - q.tz * q.len * 0.5 + nz * sd * (q.w + 1.6); this.post(x, z, 1.4, 0.03, this.M.blue); }
  }
  // giant-slalom panels: on each pole of a gate a cloth panel out to a second pole, in the gate's colour
  panels(k) {
    const mats = {}; const pm = col => mats[col] || (mats[col] = prep(new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (x, w, h) => { x.fillStyle = col; x.fillRect(0, 0, w, h); x.fillStyle = '#f4f4f0'; x.fillRect(0, h * 0.38, w, h * 0.2); }), roughness: 0.8, side: THREE.DoubleSide })));
    const pg = new THREE.PlaneGeometry(0.75, 0.7); pg.translate(0.375, 0, 0);
    for (const g of k.gates) {
      if (g.finish) continue; const poleMat = prep(new THREE.MeshStandardMaterial({ color: g.col, roughness: 0.5 })); this.gfx.shadowed(poleMat);
      for (const [e, sd] of [[g.a, 1], [g.b, -1]]) { const ox = g.nx * sd, oz = g.nz * sd, x2 = e.x + ox * 0.75, z2 = e.z + oz * 0.75, y = Math.max(this.world.height(e.x, e.z), this.world.height(x2, z2));
        this.post(x2, z2, 1.9, 0.025, poleMat); const p = this.mesh(pg, pm(g.col), [e.x, y + 1.35, e.z], [1, 1, 1], Math.atan2(ox, oz) - Math.PI / 2); p.castShadow = true; }
    }
  }
  // the start: a gate with a wand to push through, a banner over the line, flags by the hut
  start(k) {
    const s = k.start, nx = Math.cos(s.h), nz = -Math.sin(s.h), W = this.world, y = W.height(s.x, s.z), col = k.col;
    for (const sd of [-1, 1]) this.post(s.x + nx * sd * 0.5, s.z + nz * sd * 0.5, 0.95, 0.035, this.M.post);
    const hinge = new THREE.Group(); hinge.position.set(s.x + nx * 0.5, y + 0.55, s.z + nz * 0.5); hinge.rotation.y = s.h; this.group.add(hinge);
    this.mesh(this.box, this.M.wand, [-0.5, 0, 0], [1, 0.035, 0.035], 0, hinge); (this.wands || (this.wands = [])).push({ k, hinge, t: -1 });
    const bw = 4.5, tex = canvasTex(1024, 128, (x, w, h) => { x.fillStyle = col; x.fillRect(0, 0, w, h); x.fillStyle = '#f2e8d0'; x.fillRect(8, 8, w - 16, h - 16); x.fillStyle = '#14120e'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 78px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillText('START · ' + k.name.toUpperCase(), w / 2, h / 2 + 4); });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(bw * 2, bw * 2 / 8), prep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }))); ban.position.set(s.x + Math.sin(s.h) * 1.2, y + 2.9, s.z + Math.cos(s.h) * 1.2); ban.rotation.y = s.h + Math.PI; ban.castShadow = true; this.group.add(ban);
    for (const sd of [-1, 1]) this.post(s.x + Math.sin(s.h) * 1.2 + nx * sd * bw, s.z + Math.cos(s.h) * 1.2 + nz * sd * bw, 3.5, 0.05, this.M.post);
    // flags on poles by the start hut (special.js puts the hut 6 m east of the start)
    for (let i = 0; i < 3; i++) { const fx = s.x + 6 + (i - 1) * 2.4, fz = s.z - 3.2, fy = W.height(fx, fz); this.post(fx, fz, 6, 0.04, this.M.white); this.flag(fx, fy + 5.2, fz, ['no', k.color, 'no'][i]); }
  }
  flag(x, y, z, kind) {
    if (!this.flagMats) this.flagMats = {};
    // the cloth waves in the wind (more towards the free end)
    const wave = Object.assign(sh => { sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float wv = uv.x; transformed.z += sin(uTime * 4.0 - position.x * 3.0) * 0.14 * wv; transformed.y -= 0.08 * wv * wv;'); }, { key: 'flagwave' });
    const mk = kind => this.flagMats[kind] || (this.flagMats[kind] = prep(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8, map: canvasTex(132, 96, (x, w, h) => {
      if (kind === 'no') { x.fillStyle = '#ba0c2f'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(36, 0, 24, h); x.fillRect(0, 36, w, 24); x.fillStyle = '#00205b'; x.fillRect(42, 0, 12, h); x.fillRect(0, 42, w, 12); }
      else { x.fillStyle = { green: '#2e9a3a', blue: '#2f6fd6', red: '#d9432f', black: '#1d1c1a' }[kind] || '#2f6fd6'; x.fillRect(0, 0, w, h); x.fillStyle = '#f2e8d0'; x.font = '700 30px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.fillText('GAUTEFALL', w / 2, h / 2 + 10); } }) }), wave));
    const m = mk(kind);
    const g = new THREE.PlaneGeometry(1.5, 1.0, 8, 1); g.translate(0.75, 0, 0); const f = new THREE.Mesh(g, m); f.position.set(x, y, z); f.rotation.y = 0.4; f.castShadow = true; this.group.add(f);
  }
  // the finish: a timing board beside the line and spectators behind fences below it
  finish(k) {
    const g = k.gates[k.gates.length - 1], W = this.world, h = Math.atan2(g.tx, g.tz);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    // the board beside the run-out, turned up the hill towards the skiers coming in
    const bx = g.x + g.nx * (g.w + 3) + g.tx * 4, bz = g.z + g.nz * (g.w + 3) + g.tz * 4, by = W.height(bx, bz), bh = h + 0.45, bw = 3.6;
    this.mesh(this.box, this.M.post, [bx, by + 3.0, bz], [bw + 0.2, bw / 2 + 0.2, 0.15], bh); for (const sd of [-1, 1]) this.post(bx + Math.cos(bh) * sd * bw * 0.4, bz - Math.sin(bh) * sd * bw * 0.4, 2.2, 0.08, this.M.post, by);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(bx - Math.sin(bh) * 0.08, by + 3.0, bz - Math.cos(bh) * 0.08); scr.rotation.y = bh + Math.PI; this.group.add(scr);
    const b = { k, ctx: c.getContext('2d'), tex, live: false, t: 0 }; (this.boards || (this.boards = [])).push(b); this.board(b, null);
    // spectators behind red nets on both sides of the run-out
    const crowd = []; for (const sd of [-1, 1]) for (let i = 0; i < 12; i++) {
      const along = 2 + (i % 8) * 1.5 + hash(i + sd * 13) * 0.6, out = g.w + 2.2 + (i >= 8 ? 1.3 : 0) + hash(i * 3 + sd) * 0.6, x = g.x + g.tx * along + g.nx * sd * out, z = g.z + g.tz * along + g.nz * sd * out;
      crowd.push({ x, y: W.height(x, z), z, face: Math.atan2(-g.nx * sd, -g.nz * sd) + (hash(i * 7) - 0.5) * 0.8, ph: hash(i * 11 + sd) * 6.3, col: JACKETS[Math.floor(hash(i * 5 + sd * 3) * JACKETS.length)], k });
    }
    for (const sd of [-1, 1]) { const pts = []; for (let a = 0; a <= 16; a += 2) { const x = g.x + g.tx * a + g.nx * sd * (g.w + 1.4), z = g.z + g.tz * a + g.nz * sd * (g.w + 1.4); pts.push([x, W.height(x, z), z]); }
      for (let i = 1; i < pts.length; i++) { const [ax, ay, az] = pts[i - 1], [cx, cy, cz] = pts[i], l = Math.hypot(cx - ax, cz - az); this.mesh(this.box, this.M.fence, [(ax + cx) / 2, (ay + cy) / 2 + 0.5, (az + cz) / 2], [0.03, 0.9, l], Math.atan2(cx - ax, cz - az)); this.post(ax, az, 1.05, 0.025, this.M.post, ay); } }
    (this.crowdList || (this.crowdList = [])).push(...crowd);
  }
  board(b, o) {
    const x = b.ctx, W = 512, H = 256; x.fillStyle = '#14120e'; x.fillRect(0, 0, W, H); x.fillStyle = b.k.col; x.fillRect(0, 0, W, 50);
    x.fillStyle = b.k.color === 'black' ? '#f2e8d0' : '#14120e'; x.font = '700 36px "Barlow Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(b.k.name.toUpperCase(), W / 2, 27);
    const best = this.best && this.best[b.k.key];
    const big = o ? o.big : best ? (b.k.points ? best.pts + ' p' : fmtT(best.t)) : '–:––,–', small = o ? o.small : best ? (b.k.points ? 'BESTE POENG' : 'BESTE TID') : 'INGEN TID ENNÅ';
    x.fillStyle = '#ffd27a'; x.font = '700 120px "Barlow Condensed", sans-serif'; x.fillText(big, W / 2, 140); x.fillStyle = o && o.col || '#f2e8d0'; x.font = '600 38px "Barlow Condensed", sans-serif'; x.fillText(small, W / 2, 222);
    b.tex.needsUpdate = true;
  }
  // the groomed link through Familiebakken's loop: marker poles along both edges every 20 m
  link(k, l) {
    const a = l.a, b = l.b, L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, mat = prep(new THREE.MeshStandardMaterial({ color: k.col, roughness: 0.5 })); this.gfx.shadowed(mat);
    for (let s = 10; s < L - 5; s += 20) for (const sd of [-1, 1]) { const x = a.x + ux * s + uz * sd * 13, z = a.z + uz * s - ux * sd * 13; this.post(x, z, 1.6, 0.03, mat); this.mesh(this.box, this.M.wand, [x, this.world.height(x, z) + 1.45, z], [0.1, 0.3, 0.1]); }
  }
  // two light beams over the next gate's poles
  beams() {
    const g = new THREE.CylinderGeometry(0.35, 0.6, 22, 12, 4, true); g.translate(0, 11, 0); const c = [], p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 22; c.push(1, 0.82, 0.42, 0.55 * (1 - y) * (1 - y)); } g.setAttribute('color', new THREE.Float32BufferAttribute(c, 4));
    const mat = prep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam = [0, 1].map(() => { const m = new THREE.Mesh(g, mat); m.visible = false; m.renderOrder = 8; this.over.add(m); return m; });
  }
  showGate(g) { for (const [m, e] of [[this.beam[0], g && g.a], [this.beam[1], g && g.b]]) { m.visible = !!e; if (e) m.position.set(e.x, this.world.height(e.x, e.z), e.z); } }
  // people riding the chairs up: a figure baked per colour, instanced; who sits where is fixed per chair
  riders() {
    const L = this.area.lift; if (!L) return; this.seats = [];
    for (let i = 0; i < L.n; i++) { if (hash(i * 3.1) > 0.5) continue; const two = hash(i * 7.7) < 0.35; for (const side of two ? [0.32, -0.3] : [hash(i) < 0.5 ? 0.32 : -0.3]) this.seats.push({ i, side, v: Math.floor(hash(i * 5.3 + side) * 4) }); }
    const geos = [0, 1, 2, 3].map(v => figureGeometry({ seated: true }, { jacket: JACKETS[v * 2], helmet: ['#f2f2ee', '#1d1c1a', '#d9432f', '#2f6fd6'][v], ski: ['#d9432f', '#2f6fd6', '#f2f2ee', '#f2c230'][v] }));
    this.riderMesh = geos.map((g, v) => { const n = this.seats.filter(s => s.v === v).length, im = new THREE.InstancedMesh(g, this.M.people, Math.max(1, n)); im.castShadow = true; im.frustumCulled = false; im.count = n; this.group.add(im); return im; });
  }
  // a chair's place on the loop at the special's clock (the same chairs special.js moves)
  // (special.update runs after the game's frame, so its clock is a frame behind here: dt is added)
  chairS(i, dt = 0) { const C = this.chairLoop(); return ((i / C.n * C.tot + ((this.special ? this.special.t : this.t) + dt) * C.speed) % C.tot + C.tot) % C.tot; }
  chairLoop() {
    if (this.cl) return this.cl; const L = this.area.lift, sc = this.special && this.special.chairs ? this.special.chairs.find(c => c.seg && c.seg[0] && Math.hypot(c.seg[0][0][0] - L.seg[0][0][0], c.seg[0][0][2] - L.seg[0][0][2]) < 1) : null;
    return (this.cl = { n: sc ? sc.n : L.n, tot: sc ? sc.tot : L.tot, speed: sc ? sc.speed : L.speed });
  }
  // other skiers making turns down the family piste (and through its link), round and round
  skiers() {
    const k = this.area.pistes.find(p => p.kind === 'fri') || this.area.pistes[0]; if (!k) return; const lk = k.links[0], P = k.L.filter(q => !lk || q.s <= lk.s0 || q.s >= lk.s1), R = [];
    let r = 0; P.forEach((q, i) => { if (i) r += Math.hypot(q.x - P[i - 1].x, q.z - P[i - 1].z); R.push({ x: q.x, z: q.z, r }); }); this.npcRoute = R;
    this.npcs = [0, 1, 2, 3, 4].map(i => { const g = figureGeometry({ c: 0.25, inc: 0.0 }, { jacket: JACKETS[(i * 3 + 1) % JACKETS.length], helmet: ['#f2f2ee', '#1d1c1a', '#d9432f'][i % 3], ski: ['#d9432f', '#2f6fd6', '#f2f2ee'][i % 3] }), m = new THREE.Mesh(g, this.M.people);
      m.castShadow = true; m.rotation.order = 'YXZ'; this.group.add(m); return { m, r: hash(i * 9) * r * 0.9, sp: 7 + hash(i) * 4, A: 4 + hash(i * 2) * 8, lam: 26 + hash(i * 4) * 14, ph: hash(i * 6) * 6.3, x: 0, y: 0, z: 0, head: 0, inc: 0, vx: 0, vz: 0, down: 0 }; });
  }
  at(r) { const R = this.npcRoute; let i = 1; while (i < R.length - 1 && R[i].r < r) i++; const a = R[i - 1], b = R[i], u = Math.max(0, Math.min(1, (r - a.r) / ((b.r - a.r) || 1))), l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l }; }
  // the player's skier against the others: a brush pushes you apart, a real collision takes you both down (returns true)
  hit(s) {
    if (!this.npcs || s.air) return false;
    for (const o of this.npcs) { if (o.down > 0) continue; const dx = s.pos.x - o.x, dz = s.pos.z - o.z, d = Math.hypot(dx, dz); if (d > 0.7 || Math.abs(s.pos.y - o.y) > 1 || d < 1e-4) continue;
      if (Math.hypot(s.vel.x - o.vx, s.vel.z - o.vz) > 3) { o.down = 3; return true; } s.pos.x += dx / d * (0.7 - d); s.pos.z += dz / d * (0.7 - d); }
    return false;
  }
  // the ghost of the best run: a pale see-through skier, upright and tucked
  ghost() {
    const mat = prep(new THREE.MeshStandardMaterial({ vertexColors: true, color: '#cfeeff', emissive: '#3a6a8a', emissiveIntensity: 0.6, transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.5 }));
    const mk = P => { const m = new THREE.Mesh(figureGeometry(P, { jacket: '#9fd2ff', pants: '#9fd2ff', helmet: '#ffffff', ski: '#ffffff', boot: '#ffffff' }), mat); m.rotation.order = 'YXZ'; m.visible = false; m.renderOrder = 3; this.gfx.scene.add(m); return m; };
    return { up: mk({ c: 0.4 }), tuck: mk({ c: 0.4, tk: 1 }) };
  }
  // the run starts (wand swings open), a run is live on the board, a result comes in
  wand(k) { const w = (this.wands || []).find(o => o.k === k); if (w) w.t = 0; }
  live(k, run) { for (const b of this.boards || []) { b.live = b.k === k ? run : null; if (!b.live) this.board(b, null); } }
  result(k, o) { const b = (this.boards || []).find(q => q.k === k); if (b) { b.live = null; this.board(b, o); } this.cheer = 4; this.cheerK = k; }
  update(dt, cam, player) {
    this.t += dt; const near = this.area.isl && Math.max(this.area.isl.x0 - cam.x, 0, cam.x - this.area.isl.x1) + Math.max(this.area.isl.z0 - cam.z, 0, cam.z - this.area.isl.z1) < 3000;
    this.group.visible = near; this.over.visible = near; if (!near) return;
    // the wands swing open when the skier pushes through and spring back
    for (const w of this.wands || []) { if (w.t < 0) continue; w.t += dt; const u = w.t, a = u < 0.12 ? 1.35 * u / 0.12 : Math.max(0, 1.35 * Math.exp(-(u - 0.12) * 3.5) * Math.cos((u - 0.12) * 7)); w.hinge.rotation.y = w.k.start.h + a; if (u > 2) { w.t = -1; w.hinge.rotation.y = w.k.start.h; } }
    // the live board
    for (const b of this.boards || []) if (b.live) { b.t -= dt; if (b.t <= 0) { b.t = 0.15; const r = b.live; this.board(b, { big: b.k.points ? (r.points || 0) + ' p' : fmtT(r.time + r.pen), small: r.started ? (b.k.points ? 'POENG' : 'PÅ VEI NED') : 'KLAR' }); } }
    this.cheer = Math.max(0, (this.cheer || 0) - dt);
    this.crowd(dt, cam, player); this.updFloods(dt, cam, player);
    this.moveRiders(cam, dt); this.moveSkiers(dt, cam);
  }
  // spectators: bob and sway, wave when the skier comes down towards their finish and when they cross the line
  crowd(dt, cam, player) {
    const L = this.crowdList; if (!L || !L.length) return;
    if (!this.crowdMesh) {
      const geos = JACKETS.map(c => figureGeometry({ c: 0 }, { jacket: c, helmet: c === '#f4f4f0' ? '#d9432f' : '#f4f4f0', noSki: true }));
      this.crowdMesh = geos.map((g, i) => { const n = L.filter(o => o.col === JACKETS[i]).length, im = new THREE.InstancedMesh(g, this.M.people, Math.max(1, n)); im.count = n; im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(im); return im; });
    }
    const cnt = this.crowdMesh.map(() => 0);
    for (const o of L) {
      let want = 0.1; if (player && player.k === o.k) { const f = o.k.gates[o.k.gates.length - 1], d = Math.hypot(f.x - player.x, f.z - player.z); want = Math.max(want, 1 - Math.min(1, Math.max(0, (d - 10) / 80))); }
      if (this.cheerK === o.k && this.cheer > 0) want = 1;
      o.hype = (o.hype || 0) + (want - (o.hype || 0)) * Math.min(1, dt * 3); const e = o.hype, bob = e * 0.12 * Math.abs(Math.sin(this.t * 7 + o.ph));
      const i = JACKETS.indexOf(o.col); _e.set(0, o.face + 0.15 * Math.sin(this.t * 0.7 + o.ph), 0.04 * Math.sin(this.t * 1.1 + o.ph)); _q.setFromEuler(_e); _p.set(o.x, o.y + bob, o.z); _s.setScalar(1); _m.compose(_p, _q, _s);
      this.crowdMesh[i].setMatrixAt(cnt[i]++, _m);
    }
    for (const im of this.crowdMesh) im.instanceMatrix.needsUpdate = true;
  }
  moveRiders(cam, dt) {
    const L = this.area.lift; if (!L || !this.riderMesh) return; const c = {}, cnt = [0, 0, 0, 0], C = this.chairLoop();
    if (Math.abs(cam.x - L.a[0]) + Math.abs(cam.z - L.a[2]) > 2500 && Math.abs(cam.x - L.b[0]) + Math.abs(cam.z - L.b[2]) > 2500) return;
    for (const s of this.seats) {
      const S = this.chairS(s.i, dt), im = this.riderMesh[s.v];
      if (S > L.upLen - 3 || S < 2 || s.i === this.skip) { _m.makeScale(0, 0, 0); im.setMatrixAt(cnt[s.v]++, _m); continue; }
      L.chairAt(S, c); _q.setFromAxisAngle(_s.set(0, 1, 0), c.yaw); _p.set(s.side, -2.41, -0.06).applyQuaternion(_q).add(_s.set(c.x, c.y, c.z)); _m.compose(_p, _q, _s.set(1, 1, 1)); im.setMatrixAt(cnt[s.v]++, _m);
    }
    for (const im of this.riderMesh) im.instanceMatrix.needsUpdate = true;
  }
  moveSkiers(dt, cam) {
    if (!this.npcs) return; const R = this.npcRoute, end = R[R.length - 1].r, A = this.area;
    for (const o of this.npcs) {
      if (o.down > 0) { o.down -= dt; o.m.rotation.z = (o.down > 0.4 ? 1.3 : 1.3 * o.down / 0.4) * (o.inc > 0 ? -1 : 1); continue; }
      o.r += o.sp * dt; if (o.r > end - 3) { o.r = 0; o.ph = Math.random() * 6.3; }
      const P = this.at(o.r), fade = Math.min(1, o.r / 40, (end - o.r) / 40), off = o.A * fade * Math.sin(o.r / o.lam * 2 * Math.PI + o.ph), x = P.x + P.tz * off, z = P.z - P.tx * off;
      const dx = x - o.x, dz = z - o.z, l = Math.hypot(dx, dz);
      if (l > 1e-4 && l < 2) { const h = Math.atan2(dx, dz); let dh = Math.atan2(Math.sin(h - o.head), Math.cos(h - o.head)); o.inc += (Math.max(-0.7, Math.min(0.7, dh / dt * o.sp / 9.81)) - o.inc) * Math.min(1, dt * 4); o.head = h; o.vx = dx / dt; o.vz = dz / dt; }
      else { o.head = Math.atan2(P.tx, P.tz); o.vx = o.vz = 0; }
      o.x = x; o.z = z; o.y = A.ground(x, z);
      const near = Math.abs(x - cam.x) + Math.abs(z - cam.z) < 600; o.m.visible = near; if (!near) continue;
      const fx = Math.sin(o.head), fz = Math.cos(o.head), slope = Math.atan2(A.ground(x + fx * 0.8, z + fz * 0.8) - A.ground(x - fx * 0.8, z - fz * 0.8), 1.6);
      o.m.position.set(x, o.y, z); o.m.rotation.set(-slope, o.head, -o.inc);
    }
  }
  dispose() { this.gfx.scene.remove(this.group); this.gfx.overlay.remove(this.over); }
}
