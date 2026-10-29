// Verden: øyene i skjærgården, i meter. Tromøya er ekte (bygget av tools/geo/build_tromoya.py fra åpne kartdata);
// de andre øyene ligger ute i Skagerrak og er laget fra de gamle banene (tools/geo/build_islands.mjs).
//  ox, oz   der øyas eget origo ligger i verden (x mot øst, z mot sør, origo midt på Tromøya)
export const WORLD = {
  islands: [
    { id: 'tromoya', name: 'Tromøya', real: true, ox: 0, oz: 0, seed: 4242, sea: 0 },
  ],
};
