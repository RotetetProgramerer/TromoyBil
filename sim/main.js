// The car simulator: loads the world, builds the renderer and runs the game loop (physics at 400 Hz, drawing at the screen's rate).
import * as THREE from 'three';
import { Gfx, textureArray } from './render/gfx.js';
import { Terrain, LAYERS } from './render/terrain.js';
import { Features, roadMaterial, buildingMaterial } from './render/features.js';
import { Forest } from './render/trees.js';
import { Water } from './render/water.js';
import { World } from './world/world.js';
import { WORLD } from './data/world.js';
import { CARS } from './data/cars.js';
import { Vehicle } from './physics/vehicle.js';
import { Game } from './game.js';

const $ = id => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('sim:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('sim:' + k, JSON.stringify(v)); } catch (e) { } } };

// a small wrapper round the mesh worker
class MeshWorker {
  constructor() {
    this.w = new Worker(new URL('./render/worker.js', import.meta.url), { type: 'module' });
    this.handlers = {}; this.w.onmessage = e => { const h = this.handlers[e.data.type]; if (h) h(e.data); };
  }
  on(t, f) { this.handlers[t] = f; }
  post(m, tr) { this.w.postMessage(m, tr || []); }
  init(base, islands) { return new Promise(res => { this.on('ready', res); this.post({ type: 'init', base, islands }); }); }
}

async function boot() {
  const status = t => { const el = $('loadText'); if (el) el.textContent = t; };
  const params = new URLSearchParams(location.search);
  const quality = params.get('q') || store.get('quality', matchMedia('(pointer:coarse)').matches ? 'lav' : 'hoy');
  status('Starter grafikken …');
  const gfx = new Gfx($('stage'), quality);
  status('Laster Tromøya …');
  const base = new URL('../world/', import.meta.url).href;
  const islands = WORLD.islands;
  const world = new World();
  const worker = new MeshWorker();
  const [, ...rest] = await Promise.all([
    worker.init(base, islands),
    ...islands.map((d, i) => world.addIsland(base, Object.assign({ order: i }, d))),
  ]);
  status('Laster teksturer …');
  const tex = u => new URL('../assets/tex/' + u, import.meta.url).href;
  const size = gfx.q.tex;
  const arrays = { A: await textureArray(LAYERS.map(n => tex(n + '_a.jpg')), size, true), N: await textureArray(LAYERS.map(n => tex(n + '_n.jpg')), size, false) };
  const terrain = new Terrain(gfx, world, worker, arrays);
  const BL = ['boards', 'plaster', 'stone', 'roof', 'gravel'];
  const bArr = { A: await textureArray(BL.map(n => tex(n + '_a.jpg')), 512, true), N: await textureArray(BL.map(n => tex(n + '_n.jpg')), 512, false) };
  const features = new Features(gfx, world, worker, { road: roadMaterial(gfx, arrays), building: buildingMaterial(gfx, bArr) });
  const forest = new Forest(gfx, world, worker);
  const water = new Water(gfx, world);
  let snd = null;
  try { const m = await import('./audio/audio.js'); snd = new m.Sound(); } catch (e) { const m = await import('./audio/stub.js'); snd = new m.Sound(); }
  // browsers only start sound inside a user gesture: every tap, click or key tries until it runs
  const unlock = () => { if (snd.ready && snd.ac && snd.ac.state === 'running') return; snd.unlock && snd.unlock(); };
  for (const e of ['pointerdown', 'keydown', 'touchend']) addEventListener(e, unlock, { capture: true });
  const game = new Game({ gfx, world, worker, terrain, features, forest, water, store, params, arrays, tex, snd });
  await game.init(status);
  $('loading').hidden = true;
  let last = performance.now();
  const frame = now => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    game.update(dt);
    terrain.update(gfx.camera.position);
    features.update(gfx.camera.position);
    forest.update(gfx.camera.position);
    water.update(dt);
    gfx.render(dt);
  };
  requestAnimationFrame(frame);
  window.SIM = { gfx, world, terrain, features, forest, water, game, THREE };
}
boot().catch(e => { console.error(e); const el = document.getElementById('loadText'); if (el) el.textContent = 'Noe gikk galt: ' + e.message; });
