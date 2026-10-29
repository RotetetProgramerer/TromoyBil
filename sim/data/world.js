// Verden: øyene i skjærgården, i meter. Tromøya er ekte (bygget av tools/geo/build_tromoya.py fra åpne kartdata);
// de andre øyene ligger ute i Skagerrak og er laget fra de gamle banene (tools/geo/build_islands.mjs).
//  ox, oz   der øyas eget origo ligger i verden (x mot øst, z mot sør, origo midt på Tromøya)
export const WORLD = {
  islands: [
    { id: 'tromoya', name: 'Tromøya', real: true, ox: 0, oz: 0, seed: 4242, sea: 0 },
    // the real coast round Tromøya (mainland, Hisøy, the skerries), 48 × 48 km, coarse; always last: it covers everything
    { id: 'backdrop', name: 'Kysten', real: true, backdrop: true, ox: 0, oz: 0, seed: 77, sea: 0 },
  ],
};
