// Tromøya: steder og løyper på den ekte øya. Koordinater i meter (x mot øst, z mot sør) fra midten av øya, som i world/tromoya.
// Løypene går langs ekte veier: via er punkter de skal innom ([x, z], eller {road: 'veinavn', t: 0–1} for et punkt langs en navngitt vei).
// prefer gir lavere kostnad på veier av en viss type, så ruten følger asfalt, grus eller stier. Rutene og portene regnes ut når spillet starter.
export const TROMOYA = {
  base: { x: -940, z: 420, h: 2.6, name: 'Tromøy Bilverksted' },      // verkstedet: garasjen, delene og bilene
  ferry: { x: -3790, z: 3915, name: 'Revesand ferjekai' },             // ferjekaia på Revesand, ferjen går ut mot sør
  marina: { x: -29, z: -1749, name: 'Captain Theis\' marina' },        // båtutleie og båtløp i Tromøysundet
  spawn: { x: -900, z: 455 },
  courses: [
    { id: 'hove', name: 'Hove-sprinten', diff: 1, kind: 'asfalt', desc: 'Fra kirkeveien ned til Hove: smal asfalt mellom jorder og skog, og gjennom campingen til stranda.',
      via: [[-2207, 2318], [-1278, 2605], [-1119, 2932], [-1483, 3458], [-2041, 3855]], prefer: 'asfalt' },
    { id: 'ostre', name: 'Østre Tromøyvei', diff: 2, kind: 'asfalt', desc: 'Hovedveien østover fra brua: lange svinger, bakketopper og 60-sone gjennom boligfeltene.',
      via: [[-2243, 587], [-970, 444], [-214, -276], { road: 'Østre Tromøyvei', t: 0.55 }, { road: 'Østre Tromøyvei', t: 0.8 }], prefer: 'hovedvei', road: 'Østre Tromøyvei' },
    { id: 'revesand', name: 'Revesandveien', diff: 1, kind: 'asfalt', desc: 'Vestsiden fra nord til ferjekaia på Revesand, med utsikt over Merdø.',
      via: [[-4513, 1696], [-4579, 2647], [-4570, 3032], [-4519, 3528], [-4445, 3650], [-3790, 3915]], prefer: 'asfalt' },
    { id: 'gjerstad', name: 'Gjerstadvannet rundt', diff: 2, kind: 'terreng', desc: 'Turløypa langs Gjerstadvannet: smal sti mellom furu og svaberg. Lavt gir og rolig gass.',
      via: [[-1072, 2312], [-1061, 2069], { road: 'Turløype Gjerstadvannet', t: 0.5 }, [32, 726]], prefer: 'sti' },
    { id: 'lys', name: 'Lysløypa', diff: 3, kind: 'terreng', desc: 'Lysløypa på Østre Tromøy: grus og røtter i bratte bakker gjennom granskogen.',
      via: [[-4253, 2526], { road: 'Lysløype Østre Tromøy', t: 0.25 }, { road: 'Lysløype Østre Tromøy', t: 0.55 }, { road: 'Lysløype Østre Tromøy', t: 0.85 }], prefer: 'sti' },
    { id: 'skare', name: 'Skareveien', diff: 2, kind: 'grus', desc: 'Nordøst på øya: asfalt blir til grus, og grus blir til traktorvei ut mot Skarekilen.',
      via: [[2229, -1088], [2188, -1731], [2567, -2193], [2652, -2489], [2770, -2918], [3099, -2734]], prefer: 'grus' },
    { id: 'natt', name: 'Nattløpet i Skibvig', diff: 2, kind: 'natt', night: true, desc: 'Ringveien i Skibvig etter mørkets frembrudd. Gatelys, smale svinger og fortau. Lysene på!',
      via: [[-841, -1649], [-1151, -1822], [-1210, -2117], [-1291, -2203], [-1336, -2045]], prefer: 'asfalt' },
    { id: 'bymark', name: 'Over brua til Bymarka', diff: 3, kind: 'terreng', desc: 'Over Tromøybrua og inn i Arendal bymark: lang grusvei og turvei med bratte kneiker.',
      via: [[-2243, 587], [-2451, 100], [-3489, -215], [-3496, -1324], [-3246, -1319], [-2496, -1884]], prefer: 'grus' },
  ],
};
// road class and surface → cost per metre for each kind of course (lower = preferred)
export const PREFER = {
  asfalt: r => r.c >= 7 ? Infinity : (r.s === 0 ? 1 : 3) * (r.c <= 4 ? 1 : 2.5),
  hovedvei: r => r.c >= 6 ? Infinity : r.c <= 2 ? 1 : r.c <= 4 ? 2.5 : 6,
  grus: r => r.c >= 7 ? 4 : r.s === 0 ? 1.6 : 1,
  sti: r => r.c >= 6 ? 1 : r.s === 0 ? 3 : 1.6,
};
