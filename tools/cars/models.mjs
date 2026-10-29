// The car models by name (the `model` field in sim/data/cars.js). Each returns
//   { body: MeshData, wheels: { F, R } (rim and tread options), steer: { p, tilt, R }, eye, exhaust, nodes?, mats? }
import { kobbe } from './models/kobbe.mjs';
import { fjellrev } from './models/fjellrev.mjs';
import { jerv } from './models/jerv.mjs';
import { vinsjen } from './models/vinsjen.mjs';
import { ravn } from './models/ravn.mjs';
import { knott } from './models/knott.mjs';
import { turbo } from './models/turbo.mjs';

export const MODELS = { kobbe, fjellrev, ravn, jerv, vinsjen, knott, turbo };
