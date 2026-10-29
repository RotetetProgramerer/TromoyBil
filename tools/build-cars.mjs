// Builds the cars' 3D models from code: one glTF binary per car in assets/cars/<model>.glb.
//   node tools/build-cars.mjs            all cars
//   node tools/build-cars.mjs kobbe      one car
// The frame is the physics frame (sim/physics/vehicle.js): metres, +y up, +z forward, +x the car's left; the origin is the
// centre of mass at rest. Nodes: body, wheel_FL/FR/RL/RR (at the wheel centres, axle along x), caliper_FL…RR (steer, do not
// spin), steering (turns round its local z, the column), driver_eye, exhaust, and car-specific ones (winch, axle_F/axle_R).
// The bodies are lofted through cross sections (tools/cars/body.mjs); the rest is built from simple shapes (tools/cars/*.mjs).
import { mkdirSync, statSync } from 'node:fs';
import { CARS } from '../sim/data/cars.js';
import { MeshData, writeGLB } from './cars/glb.mjs';
import { wheel } from './cars/wheels.mjs';
import { steeringWheel } from './cars/parts.mjs';
import { MODELS } from './cars/models.mjs';

const pbr = (c, metal, rough, x = {}) => ({ pbrMetallicRoughness: { baseColorFactor: [c[0], c[1], c[2], c[3] ?? 1], metallicFactor: metal, roughnessFactor: rough }, ...x });
// lamps: base colour when off; emissiveFactor is the glow colour (the game sets emissiveIntensity, 0 = off)
const lamp = (c, e) => pbr(c, 0.1, 0.12, { emissiveFactor: e });
export const MATERIALS = {
  paint: pbr([0.8, 0.8, 0.8], 0.4, 0.35),
  glass: pbr([0.05, 0.07, 0.08, 0.55], 0, 0.05, { alphaMode: 'BLEND', doubleSided: true }),
  chrome: pbr([0.92, 0.92, 0.93], 1, 0.15),
  trim: pbr([0.035, 0.035, 0.038], 0, 0.6),
  rubber: pbr([0.028, 0.028, 0.03], 0, 0.9),
  rim: pbr([0.72, 0.73, 0.75], 0.85, 0.3, { doubleSided: true }),
  disc: pbr([0.36, 0.35, 0.34], 0.9, 0.45),
  caliper: pbr([0.09, 0.09, 0.1], 0.3, 0.45),
  interior: pbr([0.1, 0.1, 0.105], 0, 0.85),
  plate: pbr([0.93, 0.93, 0.92], 0, 0.45),
  chassis: pbr([0.12, 0.12, 0.13], 0.5, 0.5),
  silver: pbr([0.6, 0.61, 0.63], 0.8, 0.35),
  gloss: pbr([0.02, 0.02, 0.022], 0.4, 0.3),           // glossy black paint (contrast roofs)
  spring: pbr([0.9, 0.55, 0.05], 0.4, 0.4),
  light_head: lamp([0.85, 0.87, 0.9], [1, 0.96, 0.88]),
  light_drl: lamp([0.88, 0.9, 0.93], [0.88, 0.93, 1]),
  light_tail: lamp([0.42, 0.02, 0.02], [1, 0.04, 0.02]),
  light_brake: lamp([0.5, 0.03, 0.03], [1, 0.02, 0.01]),
  light_reverse: lamp([0.86, 0.86, 0.86], [1, 1, 1]),
  light_ind_L: lamp([0.9, 0.42, 0.04], [1, 0.45, 0]),
  light_ind_R: lamp([0.9, 0.42, 0.04], [1, 0.45, 0]),
  light_ind_rear_L: lamp([0.9, 0.42, 0.04], [1, 0.45, 0]),
  light_ind_rear_R: lamp([0.9, 0.42, 0.04], [1, 0.45, 0]),
};

export function buildCar(spec) {
  const m = MODELS[spec.model](spec), a = spec.wb * (1 - spec.wd), b = spec.wb * spec.wd, cg = spec.cgH, W = spec.wheel;
  const children = [{ name: 'body', mesh: m.body }];
  for (const [ax, z, r, w, tr] of [['F', a, W.rF, W.wF, spec.trackF], ['R', -b, W.rR, W.wR, spec.trackR]]) for (const [sx, side] of [[1, 'L'], [-1, 'R']]) {
    const wh = wheel({ ...m.wheels[ax], r, w }, sx), t = [sx * tr / 2, r - cg, z];
    children.push({ name: 'wheel_' + ax + side, t, mesh: wh.wheel });
    if (wh.caliper) children.push({ name: 'caliper_' + ax + side, t, mesh: wh.caliper });
  }
  const sw = new MeshData(); steeringWheel(sw, m.steer.R);
  children.push({ name: 'steering', t: m.steer.p, r: [Math.sin(m.steer.tilt / 2), 0, 0, Math.cos(m.steer.tilt / 2)], mesh: sw });
  children.push({ name: 'driver_eye', t: m.eye }, { name: 'exhaust', t: m.exhaust }, ...(m.nodes || []));
  const mats = structuredClone(MATERIALS);
  for (const [k, v] of Object.entries(m.mats || {})) mats[k] = { ...mats[k], ...v, pbrMetallicRoughness: { ...mats[k].pbrMetallicRoughness, ...v.pbrMetallicRoughness } };
  // the real overhangs (front axle → front-most part, rear axle → rear bumper) and anything standing out behind that (a spare)
  const box = bounds(children), extras = { overF: +(box.hi[2] - a).toFixed(3), overR: +(-b - box.lo[2] - (m.spareOut || 0)).toFixed(3) };
  if (m.spareOut) extras.spareOut = m.spareOut;
  return { root: { name: spec.model, children, extras }, mats };
}

function bounds(nodes) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const n of nodes) if (n.mesh) for (const p of n.mesh.prims.values()) for (let i = 0; i < p.P.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = p.P[i + k] + (n.t ? n.t[k] : 0); lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v);
  }
  return { lo, hi };
}

const only = process.argv.slice(2), dir = new URL('../assets/cars/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const spec of CARS) {
  if (!MODELS[spec.model] || (only.length && !only.includes(spec.model))) continue;
  const { root, mats } = buildCar(spec), file = new URL(spec.model + '.glb', dir);
  writeGLB(file, root, mats);
  const tris = root.children.reduce((s, c) => s + (c.mesh ? c.mesh.tris : 0), 0);
  console.log(`${spec.model.padEnd(9)} ${String(tris).padStart(6)} triangles  ${(statSync(file).size / 1048576).toFixed(2)} MB  ` +
    root.children.filter(c => c.mesh).map(c => `${c.name} ${c.mesh.tris}`).join(', '));
}
