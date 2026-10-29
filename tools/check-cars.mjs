// Checks the car models in assets/cars against sim/data/cars.js: node names, wheel positions, bounding boxes, triangles.
//   node tools/check-cars.mjs [model …]        add -v for the bounding box of every primitive
import { existsSync, readFileSync, statSync } from 'node:fs';
import { CARS } from '../sim/data/cars.js';
import { readGLB } from './cars/glb.mjs';

const args = process.argv.slice(2), verbose = args.includes('-v'), only = args.filter(a => a !== '-v');
const f3 = v => v.map(x => x.toFixed(3).padStart(7)).join(' ');
const REQUIRED = ['body', 'wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'steering', 'driver_eye', 'exhaust'];
const MATS = ['paint', 'glass', 'chrome', 'trim', 'rubber', 'rim', 'disc', 'interior', 'plate', 'light_head', 'light_drl', 'light_tail', 'light_brake', 'light_reverse',
  'light_ind_L', 'light_ind_R', 'light_ind_rear_L', 'light_ind_rear_R'];
let fails = 0;
const bad = msg => { fails++; console.log('  !! ' + msg); };
for (const spec of CARS) {
  if (only.length && !only.includes(spec.model)) continue;
  const file = new URL(`../assets/cars/${spec.model}.glb`, import.meta.url);
  if (!existsSync(file)) { console.log(`\n${spec.model}:`); bad('no assets/cars/' + spec.model + '.glb'); continue; }
  const buf = readFileSync(file), { json } = readGLB(buf);
  console.log(`\n${spec.model}: ${(statSync(file).size / 1048576).toFixed(2)} MB`);
  const root = json.nodes[json.scenes[0].nodes[0]], names = new Map();
  if (root.name !== spec.model) bad(`root node is "${root.name}"`);
  for (const i of root.children || []) names.set(json.nodes[i].name, json.nodes[i]);
  for (const n of REQUIRED) if (!names.has(n)) bad('missing node ' + n);
  if (spec.winch && !names.has('winch')) bad('missing node winch');
  const matNames = json.materials.map(m => m.name);
  for (const m of MATS) if (!matNames.includes(m)) bad('missing material ' + m);
  const paint = json.materials.find(m => m.name === 'paint');
  if (paint && paint.pbrMetallicRoughness.baseColorFactor[0] !== 0.8) bad('paint is not white (0.8)');
  // bounding boxes in the car frame (children of the root only have a translation)
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; let tris = 0;
  const box = (n, acc = true) => {
    const count = acc;
    const t = n.translation || [0, 0, 0], b = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] };
    if (n.mesh === undefined) return null;
    for (const p of json.meshes[n.mesh].primitives) {
      const a = json.accessors[p.attributes.POSITION]; if (count) tris += json.accessors[p.indices].count / 3;
      for (let k = 0; k < 3; k++) { b.lo[k] = Math.min(b.lo[k], a.min[k] + t[k]); b.hi[k] = Math.max(b.hi[k], a.max[k] + t[k]); }
      if (verbose && count) console.log(`      ${n.name.padEnd(11)} ${json.materials[p.material].name.padEnd(16)} ${f3(a.min.map((v, k) => v + t[k]))}  …  ${f3(a.max.map((v, k) => v + t[k]))}`);
    }
    if (acc) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.lo[k]); hi[k] = Math.max(hi[k], b.hi[k]); }
    return b;
  };
  for (const [name, n] of names) {
    const b = box(n);
    console.log(`  ${name.padEnd(12)} at ${f3(n.translation || [0, 0, 0])}` + (b ? `   box ${f3(b.lo)}  …  ${f3(b.hi)}` : ''));
  }
  // wheels: where the physics puts them
  const a = spec.wb * (1 - spec.wd), b = spec.wb * spec.wd, W = spec.wheel;
  for (const [tag, x, y, z, r, w] of [['FL', spec.trackF / 2, W.rF - spec.cgH, a, W.rF, W.wF], ['FR', -spec.trackF / 2, W.rF - spec.cgH, a, W.rF, W.wF],
    ['RL', spec.trackR / 2, W.rR - spec.cgH, -b, W.rR, W.wR], ['RR', -spec.trackR / 2, W.rR - spec.cgH, -b, W.rR, W.wR]]) {
    const n = names.get('wheel_' + tag); if (!n) continue;
    const t = n.translation, bb = box(n, false), dr = (bb.hi[1] - bb.lo[1]) / 2 - r, dw = bb.hi[0] - bb.lo[0] - w;
    if (Math.hypot(t[0] - x, t[1] - y, t[2] - z) > 1e-3) bad(`wheel_${tag} at ${f3(t)}, physics ${f3([x, y, z])}`);
    if (Math.abs(dr) > 0.004) bad(`wheel_${tag} radius ${((bb.hi[1] - bb.lo[1]) / 2).toFixed(3)}, spec ${r}`);
    if (Math.abs(dw) > 0.02) bad(`wheel_${tag} width ${(bb.hi[0] - bb.lo[0]).toFixed(3)}, spec ${w}`);
    if (Math.abs(bb.lo[1] + spec.cgH) > 0.004) bad(`wheel_${tag} bottom at ${bb.lo[1].toFixed(3)}, ground ${-spec.cgH}`);
  }
  const body = box(names.get('body'), false), d = spec.dims;
  console.log(`  overall  ${f3(lo)}  …  ${f3(hi)}   size ${f3(hi.map((v, k) => v - lo[k]))}   spec L ${d.L} W ${d.W} H ${d.H}`);
  console.log(`  body     lowest ${body.lo[1].toFixed(3)} (clear − cgH = ${(spec.clear - spec.cgH).toFixed(3)}), top ${body.hi[1].toFixed(3)} (H − cgH = ${(d.H - spec.cgH).toFixed(3)}),` +
    ` front ${body.hi[2].toFixed(3)}, rear ${body.lo[2].toFixed(3)} → overhangs ${(body.hi[2] - a).toFixed(3)} / ${(-b - body.lo[2]).toFixed(3)} (even: ${((d.L - spec.wb) / 2).toFixed(3)})`);
  console.log(`  ${tris} triangles, ${json.materials.length} materials, ${json.nodes.length} nodes`);
  if (Math.abs(hi[1] - lo[1] - d.H) > 0.06) bad(`height ${(hi[1] - lo[1]).toFixed(3)} vs ${d.H}`);
  const ex = root.extras || {}, spare = ex.spareOut || 0;
  console.log(`  extras   ${JSON.stringify(ex)}`);
  if (Math.abs(hi[2] - lo[2] - spare - d.L) > 0.06) bad(`length ${(hi[2] - lo[2]).toFixed(3)} vs ${d.L}` + (spare ? ` + spare ${spare}` : ''));
  if (tris < 15000 || tris > 80000) bad(`${tris} triangles (want 15k–80k)`);
  if (statSync(file).size > 2.5 * 1048576) bad('file over 2.5 MB');
}
console.log(fails ? `\n${fails} problem(s)` : '\nall good');
process.exitCode = fails ? 1 : 0;
