// The animals of the islands, at real size: what they weigh, how big and fast they are, where they live and how shy they are.
// No three.js here (the Node test reads it); their shapes are in sim/life/rig.js, their behaviour in sim/life/life.js.
//
//   rig      the body plan (rig.js): quad (four legs), sprawl (lizards and crocodilians), bird, crab, frog, snake, fly (butterfly)
//   type     the behaviour (life.js): graze (eats, looks up, flees; herds stay together), pred (rests, charges the car), tree (lives in
//            trees), flock (birds on the ground or water that fly up together), soar (circles high), wade, swim, bask (lies on the bank,
//            slides into the water), dart (small things that run off in a burst), hop, flutter
//   ring     how far out it is spawned and drawn: 0 near (≈120 m), 1 mid (≈240 m), 2 far (≈420 m), 3 air (birds, ≈1100 m); vis: a shorter
//            draw distance for tiny things
//   mass kg, len (nose to rump) / sh (shoulder height) / wid m, speeds m/s (walk, trot, run, or fly), acc m/s², turn rad/s
//   alert/flee m: when it looks up at the car and when it runs (a car that drives fast or honks scares from further away)
//   dens     groups per km² of habitat; group [min, max] members, spread m; young: share of the members that are calves (smaller)
//   cover    the land cover it is born on (COVER in sim/world/island.js); medium: land, water (swims), shore (at the water's edge),
//            coast (land by the sea or on it); edge: only where forest meets open land; trees: lives in trees of these kinds
//   col      the car hits it (heavier than 20 kg); roads: 'cross' walks over roads now and then (moose, reindeer)
//   pred     {alert, charge, chargeT, leash, rest}: when a predator wakes, when it charges, how long it keeps on, how far from home
import { COVER as C, KIND as K } from '../world/island.js';

export const RINGS = [{ cell: 32, r: 120 }, { cell: 64, r: 240 }, { cell: 128, r: 420 }, { cell: 256, r: 1100 }];
const FOR = [C.FOREST, C.MIXED, C.DECID], OPEN = [C.FARM, C.GRASS, C.HEATH, C.GARDEN];
const NTREES = [K.PINE, K.SPRUCE, K.BIRCH, K.OAK, K.ASPEN, K.FRUIT, K.SNOWSPRUCE], JTREES = [K.JUNGLE, K.PALM, K.BAOBAB];

export const SPECIES = [
  // ------------------------------------------------------------ Tromøya and the Norwegian islands
  { id: 'elg', name: 'Elgen', rig: 'quad', type: 'graze', ring: 2, mass: 450, len: 2.8, sh: 1.9, wid: 0.75, walk: 1.5, trot: 6, run: 14, acc: 3, turn: 1.6, gaits: [2.4, 9],
    alert: 80, flee: 22, fleeT: 9, group: [1, 2], young: 0.6, spread: 6, dens: 5, cover: [...FOR, C.BOG, C.HEATH, C.SNOWFOREST], col: true, roads: 'cross', night: 1, call: 'moose', range: 260 },
  { id: 'radyr', name: 'Rådyret', rig: 'quad', type: 'graze', ring: 1, mass: 25, len: 1.15, sh: 0.72, wid: 0.3, walk: 1.2, trot: 4, run: 16, acc: 6, turn: 3, gaits: [2, 6],
    alert: 70, flee: 35, fleeT: 6, group: [1, 4], young: 0.3, spread: 5, dens: 20, cover: [...FOR, ...OPEN], edge: true, col: true, roads: 'cross', night: 1, range: 160 },
  { id: 'hare', name: 'Haren', rig: 'quad', type: 'graze', ring: 1, mass: 3.5, len: 0.55, sh: 0.32, wid: 0.18, walk: 0.8, trot: 3, run: 17, acc: 12, turn: 5, gaits: [0, 0], gait0: 3,
    alert: 30, flee: 16, fleeT: 3, group: [1, 1], spread: 0, dens: 30, cover: [C.FARM, C.GRASS, C.HEATH, C.GARDEN, C.BOG, C.MIXED, C.DECID], night: 1, range: 60 },
  { id: 'rev', name: 'Reven', rig: 'quad', type: 'graze', ring: 1, mass: 6, len: 0.7, sh: 0.38, wid: 0.18, walk: 1, trot: 3, run: 13, acc: 8, turn: 4, gaits: [1.6, 5],
    alert: 50, flee: 24, fleeT: 4, group: [1, 1], spread: 0, dens: 6, cover: [...FOR, C.FARM, C.GARDEN, C.HEATH], night: 1, roads: 'cross', call: 'fox', range: 200, hunts: true },
  { id: 'ekorn', name: 'Ekornet', rig: 'quad', type: 'tree', ring: 0, mass: 0.3, len: 0.22, sh: 0.11, wid: 0.07, walk: 0.8, trot: 2, run: 5, acc: 15, turn: 8, gaits: [0, 0], gait0: 3,
    alert: 15, flee: 8, group: [1, 1], spread: 0, dens: 100, cover: [...FOR, C.GARDEN], trees: NTREES, range: 40 },
  { id: 'sau', name: 'Sauen', rig: 'quad', type: 'graze', ring: 1, mass: 70, len: 1.3, sh: 0.75, wid: 0.55, walk: 1, trot: 2.5, run: 7, acc: 3, turn: 2.5, gaits: [1.4, 4],
    alert: 30, flee: 12, fleeT: 4, group: [4, 14], young: 0.3, spread: 9, dens: 10, cover: [C.FARM, C.GRASS, C.HEATH], col: true, call: 'sheep', range: 120, lies: 0.3 },
  { id: 'ku', name: 'Kua', rig: 'quad', type: 'graze', ring: 2, mass: 600, len: 2.4, sh: 1.4, wid: 0.8, walk: 1.1, trot: 3, run: 7, acc: 2, turn: 1.5, gaits: [1.6, 4.5],
    alert: 30, flee: 9, fleeT: 3, group: [3, 10], young: 0.25, spread: 12, dens: 8, cover: [C.FARM, C.GRASS], col: true, call: 'cow', range: 120, lies: 0.35 },
  { id: 'make', name: 'Måka', rig: 'bird', type: 'flock', ring: 3, mass: 1.1, len: 0.6, span: 1.4, sh: 0.28, walk: 0.8, fly: 11, flap: 2.8, glide: 0.6,
    alert: 40, flee: 20, group: [3, 10], spread: 14, dens: 1.2, medium: 'coast', cover: [C.BEACH, C.ROCK, C.SEA, C.DUNE, C.GRAVEL], call: 'gull', range: 260 },
  { id: 'krake', name: 'Kråka', rig: 'bird', type: 'flock', ring: 1, mass: 0.55, len: 0.47, span: 0.95, sh: 0.22, walk: 0.9, fly: 13, flap: 4, glide: 0.2,
    alert: 40, flee: 22, group: [2, 6], spread: 8, dens: 20, cover: [C.FARM, C.GARDEN, C.GRASS, C.URBAN, C.BEACH], perch: NTREES, call: 'crow', range: 200 },
  { id: 'havorn', name: 'Havørna', rig: 'bird', type: 'soar', ring: 3, mass: 5, len: 0.85, span: 2.25, sh: 0.4, fly: 14, flap: 2, glide: 0.9, alt: [70, 180],
    group: [1, 1], dens: 0.5, medium: 'coast', cover: [C.ROCK, C.FOREST, C.BEACH, C.SEA, C.MIXED], call: 'eagle', range: 400 },
  { id: 'and', name: 'Stokkanda', rig: 'bird', type: 'flock', ring: 1, mass: 1.1, len: 0.58, span: 0.88, sh: 0.25, walk: 0.5, fly: 18, flap: 7, glide: 0,
    alert: 45, flee: 22, group: [2, 8], spread: 6, dens: 100, medium: 'water', depth: [0.25, 30], cover: [C.LAKE, C.STREAM, C.BOG], call: 'duck', range: 150 },
  // ------------------------------------------------------------ Trinnvik (the town)
  { id: 'due', name: 'Duene', rig: 'bird', type: 'flock', ring: 0, mass: 0.35, len: 0.33, span: 0.65, sh: 0.17, walk: 0.7, fly: 17, flap: 6, glide: 0.1,
    alert: 15, flee: 7, group: [5, 18], spread: 4, dens: 120, cover: [C.URBAN, C.GARDEN, C.GRAVEL], roads: 'any', call: 'coo', range: 60 },
  { id: 'katt', name: 'Katta', rig: 'quad', type: 'graze', ring: 0, mass: 4.5, len: 0.46, sh: 0.25, wid: 0.13, walk: 0.7, trot: 2, run: 12, acc: 10, turn: 5, gaits: [1.2, 3.5],
    alert: 20, flee: 7, fleeT: 2.5, group: [1, 1], spread: 0, dens: 60, cover: [C.GARDEN, C.URBAN], sits: 0.5, night: 1, call: 'cat', range: 40 },
  { id: 'hund', name: 'Hunden', rig: 'quad', type: 'graze', ring: 1, mass: 30, len: 0.9, sh: 0.57, wid: 0.25, walk: 1.2, trot: 3, run: 11, acc: 8, turn: 4, gaits: [1.6, 5],
    alert: 30, flee: 6, fleeT: 2, group: [1, 1], spread: 0, dens: 25, cover: [C.GARDEN, C.GRASS, C.URBAN], sits: 0.4, col: true, call: 'dog', range: 60, curious: true },
  // ------------------------------------------------------------ Gautefall (winter)
  { id: 'rein', name: 'Reinen', rig: 'quad', type: 'graze', ring: 2, mass: 110, len: 1.8, sh: 1.1, wid: 0.5, walk: 1.3, trot: 4.5, run: 16, acc: 5, turn: 2.5, gaits: [2, 7],
    alert: 70, flee: 40, fleeT: 7, group: [6, 24], young: 0.25, spread: 14, dens: 4, cover: [C.SNOW, C.SNOWFOREST, C.ROCK, C.HEATH], col: true, roads: 'cross', call: 'reindeer', range: 300 },
  { id: 'rype', name: 'Rypa', rig: 'bird', type: 'flock', ring: 0, mass: 0.55, len: 0.37, span: 0.6, sh: 0.2, walk: 0.6, fly: 18, flap: 9, glide: 0.4, low: true,
    alert: 25, flee: 14, group: [3, 10], spread: 5, dens: 40, cover: [C.SNOW, C.SNOWFOREST, C.ROCK], call: 'grouse', range: 120 },
  { id: 'fjellrev', name: 'Fjellreven', rig: 'quad', type: 'graze', ring: 1, mass: 3.5, len: 0.55, sh: 0.3, wid: 0.16, walk: 0.9, trot: 2.8, run: 11, acc: 8, turn: 4, gaits: [1.5, 4.5],
    alert: 50, flee: 22, fleeT: 3, group: [1, 2], spread: 3, dens: 4, cover: [C.SNOW, C.ROCK, C.SNOWFOREST], night: 1, call: 'fox', range: 200, hunts: true },
  { id: 'ravn', name: 'Ravnen', rig: 'bird', type: 'soar', ring: 3, mass: 1.2, len: 0.64, span: 1.25, sh: 0.3, fly: 12, flap: 3.5, glide: 0.6, alt: [30, 90],
    group: [1, 2], dens: 1.5, cover: [C.SNOW, C.SNOWFOREST, C.ROCK, C.ASH, C.DIRT, C.JUNGLE], call: 'raven', range: 300 },
  // ------------------------------------------------------------ Bykkevika (subtropical)
  { id: 'krabbe', name: 'Krabbene', rig: 'crab', type: 'dart', ring: 0, mass: 0.3, len: 0.12, sh: 0.06, wid: 0.18, walk: 0.15, run: 1.6, acc: 10, turn: 6,
    alert: 9, flee: 5, group: [3, 10], spread: 3, dens: 400, medium: 'shore', cover: [C.BEACH, C.DUNE, C.ROCK], range: 15, vis: 45, side: true },
  { id: 'firfisle', name: 'Firfislene', rig: 'sprawl', type: 'dart', ring: 0, mass: 0.05, len: 0.25, sh: 0.04, wid: 0.05, walk: 0.3, run: 3, acc: 20, turn: 10,
    alert: 7, flee: 4, group: [1, 3], spread: 3, dens: 200, cover: [C.ROCK, C.HEATH, C.DUNE, C.ASH, C.DIRT], range: 10, vis: 35, basks: true },
  { id: 'pelikan', name: 'Pelikanene', rig: 'bird', type: 'flock', ring: 3, mass: 7, len: 1.5, span: 2.7, sh: 0.6, walk: 0.6, fly: 11, flap: 2, glide: 0.75, low: true,
    alert: 40, flee: 22, group: [3, 7], spread: 10, dens: 1.5, medium: 'coast', cover: [C.BEACH, C.DUNE, C.SEA], range: 300 },
  // ------------------------------------------------------------ Løveøya (savanna)
  { id: 'love', name: 'Løven', rig: 'quad', type: 'pred', ring: 2, mass: 170, len: 2.1, sh: 1.15, wid: 0.5, walk: 1.3, trot: 4, run: 16, acc: 9, turn: 3, gaits: [1.8, 6],
    group: [2, 5], spread: 5, dens: 3, cover: [C.SAVANNA, C.DECID, C.GRASS, C.DIRT], shade: true, col: true, call: 'lion', range: 150, lies: 0.8,
    pred: { alert: 55, charge: 30, chargeT: 5, leash: 130, rest: 16, warn: '⚠ Løvene har sett deg!' } },
  { id: 'gepard', name: 'Geparden', rig: 'quad', type: 'pred', ring: 2, mass: 50, len: 1.3, sh: 0.8, wid: 0.3, walk: 1.2, trot: 4, run: 29, acc: 14, turn: 1.8, gaits: [1.8, 6],
    group: [1, 3], spread: 4, dens: 2, cover: [C.SAVANNA, C.DIRT, C.GRASS], col: true, call: 'cheetah', range: 260,
    pred: { alert: 90, charge: 55, chargeT: 3.6, leash: 260, rest: 12, warn: '⚠ Gepard! Sving unna!' } },
  { id: 'krokodille', name: 'Krokodillen', rig: 'sprawl', type: 'pred', ring: 2, mass: 400, len: 4.2, sh: 0.45, wid: 0.6, walk: 0.6, trot: 2, run: 10, acc: 18, turn: 4, swim: 2,
    group: [1, 3], spread: 10, dens: 50, medium: 'shore', cover: [C.MUD, C.LAKE, C.STREAM, C.BOG, C.GRASS, C.SAVANNA, C.BEACH], col: true, call: 'croc', range: 40, aquatic: true, wade: 3,
    pred: { alert: 14, charge: 8, chargeT: 1.3, leash: 12, rest: 10, warn: '⚠ Krokodille i vannet!' } },
  { id: 'sebra', name: 'Sebraene', rig: 'quad', type: 'graze', ring: 2, mass: 320, len: 2.3, sh: 1.35, wid: 0.6, walk: 1.4, trot: 4.5, run: 17, acc: 5, turn: 2.2, gaits: [2, 7],
    alert: 80, flee: 42, fleeT: 7, group: [5, 14], young: 0.2, spread: 14, dens: 6, cover: [C.SAVANNA, C.GRASS, C.DIRT], col: true, call: 'zebra', range: 220 },
  { id: 'gnu', name: 'Gnuene', rig: 'quad', type: 'graze', ring: 2, mass: 220, len: 2.2, sh: 1.35, wid: 0.55, walk: 1.4, trot: 4.5, run: 18, acc: 5, turn: 2.2, gaits: [2, 7],
    alert: 70, flee: 38, fleeT: 7, group: [8, 24], young: 0.2, spread: 18, dens: 3, cover: [C.SAVANNA, C.GRASS, C.DIRT], col: true, call: 'gnu', range: 220 },
  { id: 'gaselle', name: 'Gasellene', rig: 'quad', type: 'graze', ring: 2, mass: 25, len: 1.0, sh: 0.65, wid: 0.25, walk: 1.2, trot: 4, run: 22, acc: 9, turn: 3.5, gaits: [1.8, 6],
    alert: 90, flee: 55, fleeT: 6, group: [6, 18], young: 0.2, spread: 12, dens: 4, cover: [C.SAVANNA, C.GRASS, C.DIRT], col: true, pronk: true, range: 220 },
  { id: 'sjiraff', name: 'Sjiraffen', rig: 'quad', type: 'graze', ring: 2, mass: 1100, len: 2.6, sh: 3.3, wid: 0.75, walk: 1.3, trot: 4, run: 15, acc: 2.5, turn: 1.4, gaits: [3, 3], gait0: 4,
    alert: 90, flee: 45, fleeT: 8, group: [2, 6], young: 0.25, spread: 16, dens: 3, cover: [C.SAVANNA, C.DECID, C.GRASS], col: true, browse: true, range: 220 },
  { id: 'elefant', name: 'Elefanten', rig: 'quad', type: 'graze', ring: 2, mass: 6000, len: 4.5, sh: 3.2, wid: 1.6, walk: 1.6, trot: 4, run: 7, acc: 1.5, turn: 0.9, gaits: [99, 99],
    alert: 70, flee: 25, fleeT: 6, group: [3, 9], young: 0.35, spread: 12, dens: 2.5, cover: [C.SAVANNA, C.DECID, C.GRASS, C.MUD], col: true, call: 'elephant', range: 250 },
  { id: 'flodhest', name: 'Flodhesten', rig: 'quad', type: 'swim', ring: 2, mass: 1500, len: 3.5, sh: 1.5, wid: 1.3, walk: 0.8, trot: 2, run: 8, acc: 2, turn: 1.2, gaits: [1.5, 5], swim: 1,
    alert: 30, flee: 14, group: [3, 9], young: 0.2, spread: 8, dens: 150, medium: 'water', depth: [1.2, 8], cover: [C.LAKE, C.MUD, C.STREAM], col: true, call: 'hippo', range: 60, sub: 0.62 },
  { id: 'gribb', name: 'Gribbene', rig: 'bird', type: 'soar', ring: 3, mass: 5.5, len: 0.9, span: 2.2, sh: 0.4, fly: 13, flap: 1.6, glide: 0.92, alt: [50, 140],
    group: [3, 6], dens: 0.8, cover: [C.SAVANNA, C.DIRT, C.GRASS], range: 200 },
  // ------------------------------------------------------------ Kaimanøya (jungle)
  { id: 'papegoye', name: 'Papegøyene', rig: 'bird', type: 'flock', ring: 1, mass: 1, len: 0.85, span: 1.0, sh: 0.3, walk: 0.3, fly: 15, flap: 5, glide: 0.25,
    alert: 25, flee: 14, group: [4, 12], spread: 10, dens: 6, cover: [C.JUNGLE], perch: JTREES, treeOnly: true, call: 'parrot', range: 300 },
  { id: 'tukan', name: 'Tukanene', rig: 'bird', type: 'flock', ring: 1, mass: 0.6, len: 0.6, span: 0.6, sh: 0.25, walk: 0.3, fly: 12, flap: 6, glide: 0.4,
    alert: 20, flee: 11, group: [2, 5], spread: 8, dens: 10, cover: [C.JUNGLE], perch: JTREES, treeOnly: true, call: 'toucan', range: 200 },
  { id: 'ape', name: 'Apene', rig: 'quad', type: 'tree', ring: 1, mass: 7, len: 0.55, sh: 0.3, wid: 0.18, walk: 0.8, trot: 2.5, run: 6, acc: 8, turn: 5, gaits: [1, 3], sits: 1,
    alert: 30, flee: 12, group: [3, 8], spread: 12, dens: 8, cover: [C.JUNGLE], trees: JTREES, call: 'monkey', range: 60 },
  { id: 'kaiman', name: 'Kaimanen', rig: 'sprawl', type: 'bask', ring: 1, mass: 45, len: 2.3, sh: 0.25, wid: 0.35, walk: 0.5, trot: 2, run: 3, acc: 8, turn: 3, swim: 1.2,
    alert: 14, flee: 9, group: [1, 3], spread: 8, dens: 80, medium: 'shore', cover: [C.MUD, C.LAKE, C.STREAM, C.BOG, C.JUNGLE, C.BEACH], col: true, call: 'hiss', range: 40, aquatic: true, wade: 2.5 },
  { id: 'kapybara', name: 'Kapybaraene', rig: 'quad', type: 'graze', ring: 1, mass: 50, len: 1.2, sh: 0.55, wid: 0.4, walk: 0.9, trot: 2.5, run: 9, acc: 5, turn: 3, gaits: [1.3, 4],
    alert: 30, flee: 14, fleeT: 3, group: [4, 12], young: 0.3, spread: 7, dens: 25, cover: [C.MUD, C.BOG, C.GRASS, C.JUNGLE], nearWater: true, col: true, range: 80, lies: 0.3 },
  { id: 'jaguar', name: 'Jaguaren', rig: 'quad', type: 'pred', ring: 1, mass: 95, len: 1.7, sh: 0.72, wid: 0.36, walk: 1.2, trot: 3.5, run: 18, acc: 10, turn: 3, gaits: [1.6, 5],
    group: [1, 1], spread: 0, dens: 1.5, cover: [C.JUNGLE, C.MUD], col: true, call: 'jaguar', range: 120, night: 1,
    pred: { alert: 35, charge: 16, chargeT: 3, leash: 90, rest: 14, warn: '⚠ Jaguaren lurer i krattet!' } },
  { id: 'frosk', name: 'Froskene', rig: 'frog', type: 'hop', ring: 0, mass: 0.01, len: 0.045, sh: 0.025, wid: 0.025, walk: 0.3, run: 1.2, acc: 20, turn: 10,
    alert: 4, flee: 2.5, group: [2, 6], spread: 2, dens: 300, medium: 'shore', cover: [C.MUD, C.JUNGLE, C.BOG], range: 6, vis: 18 },
  { id: 'hegre', name: 'Hegrene', rig: 'bird', type: 'wade', ring: 1, mass: 1, len: 0.95, span: 1.5, sh: 0.95, walk: 0.5, fly: 9, flap: 2.6, glide: 0.4, low: true,
    alert: 40, flee: 20, group: [1, 4], spread: 15, dens: 120, medium: 'shore', wade: 0.35, cover: [C.MUD, C.LAKE, C.STREAM, C.BOG, C.BEACH], range: 150 },
  { id: 'anakonda', name: 'Anakondaen', rig: 'snake', type: 'swim', ring: 1, mass: 50, len: 5, sh: 0.12, wid: 0.12, walk: 0.5, run: 1.5, acc: 2, turn: 1, swim: 0.5,
    alert: 10, flee: 6, group: [1, 1], spread: 0, dens: 60, medium: 'water', depth: [0.6, 6], cover: [C.LAKE, C.STREAM, C.MUD], range: 60, sub: 0.06 },
  { id: 'sommerfugl', name: 'Sommerfuglene', rig: 'fly', type: 'flutter', ring: 0, mass: 0.001, len: 0.05, span: 0.15, sh: 0.05, fly: 1.5, flap: 9,
    group: [2, 6], spread: 4, dens: 60, cover: [C.GRASS, C.MUD, C.BEACH, C.JUNGLE, C.GARDEN], day: true, range: 6, vis: 45 },
];
export const BY_ID = Object.fromEntries(SPECIES.map((s, i) => [s.id, Object.assign(s, { idx: i })]));
for (const s of SPECIES) { s.walk ??= 0.5; s.trot ??= s.walk * 2; s.run ??= s.trot * 2; s.acc ??= 5; s.turn ??= 5; s.wid ??= s.len * 0.3; }     // birds walk too

// who lives where: the island's biome (sim/data/world.js; Tromøya has none: nordic) → species and how common (× dens)
export const BIOME = {
  nordic: { elg: 1, radyr: 1, hare: 1, rev: 1, ekorn: 1, sau: 1, ku: 1, make: 1, krake: 1, havorn: 1, and: 1 },
  town: { make: 1.4, due: 1, katt: 1, hund: 1, krake: 1, sau: 0.4, ku: 0.4, ekorn: 0.5, and: 1 },
  winter: { rein: 1, rype: 1, fjellrev: 1, ravn: 1, elg: 0.3, make: 0.4 },
  subtropical: { krabbe: 1, firfisle: 1, make: 1, pelikan: 1, sommerfugl: 0.3 },
  savanna: { love: 1, gepard: 1, krokodille: 1, sebra: 1, gnu: 1, gaselle: 1, sjiraff: 1, elefant: 1, flodhest: 1, gribb: 1 },
  jungle: { papegoye: 1, tukan: 1, ape: 1, kaiman: 1, kapybara: 1, jaguar: 1, frosk: 1, hegre: 1, anakonda: 1, sommerfugl: 1, make: 0.5 },
  volcano: { firfisle: 1, ravn: 1, make: 0.7, papegoye: 0.25 },
};
// how tall each kind of tree is at size 1 (sim/render/trees.js), for the animals that sit in them
export const TREE_H = { [K.PINE]: 17, [K.SPRUCE]: 20, [K.BIRCH]: 13, [K.OAK]: 13, [K.ASPEN]: 15, [K.FRUIT]: 6, [K.SNOWSPRUCE]: 16, [K.PALM]: 11, [K.OLIVE]: 6,
  [K.CYPRESS]: 12, [K.ACACIA]: 8, [K.BAOBAB]: 14, [K.JUNGLE]: 26, [K.DEADTREE]: 9 };
