// Verden: øyene i skjærgården, i meter. Tromøya er ekte (bygget av tools/geo/build_tromoya.py fra åpne kartdata);
// de andre øyene ligger ute i Skagerrak og er laget fra de gamle banene (tools/geo/build_islands.mjs).
//  ox, oz   der øyas eget origo ligger i verden (x mot øst, z mot sør, origo midt på Tromøya)
//  biome    hvilke trær og planter som vokser der (sim/world/biomes.js)
export const WORLD = {
  islands: [
    { id: 'tromoya', name: 'Tromøya', real: true, ox: 0, oz: 0, seed: 4242, sea: 0 },
    // the made-up islands, in open water south-east of the real coast: the old archipelago bent out into the Skagerrak
    { id: 'sand', name: 'Bykkevika', ox: 10400, oz: 1200, seed: 11, sea: 0, biome: 'subtropical' },
    { id: 'trinnvik', name: 'Trinnvik', ox: 8900, oz: 8400, seed: 7171, sea: 0, biome: 'town' },
    { id: 'stein', name: 'Spornes', ox: 1800, oz: 10600, seed: 27, sea: 0, biome: 'nordic' },
    { id: 'gautefall', name: 'Gautefall', ox: -3200, oz: 15400, seed: 2602, sea: 0, biome: 'winter' },
    { id: 'savanne', name: 'Løveøya', ox: 15600, oz: -3600, seed: 7311, sea: 0, biome: 'savanna' },
    { id: 'skog', name: 'Froland', ox: 17600, oz: 3800, seed: 53, sea: 0, biome: 'nordic' },
    { id: 'kaiman', name: 'Kaimanøya', ox: 19000, oz: 9600, seed: 7319, sea: 0, biome: 'jungle' },
    { id: 'elv', name: 'Nidelva', ox: 4200, oz: 16400, seed: 97, sea: 0, biome: 'nordic' },
    { id: 'vulkan', name: 'Hisøya', ox: 14200, oz: 17400, seed: 211, sea: 0, biome: 'volcano' },
    // the real coast round Tromøya (mainland, Hisøy, the skerries), 48 × 48 km, coarse; always last: it covers everything
    { id: 'backdrop', name: 'Kysten', real: true, backdrop: true, ox: 0, oz: 0, seed: 77, sea: 0 },
  ],
};
