// Bilene i ekte størrelse. Alle mål i meter, kilo, newton og omdreininger per minutt.
// Legg til en ny bil ved å kopiere en blokk. Fysikken (sim/physics/vehicle.js) leser alt herfra, og modellen (glb) ligger i
// assets/cars/<model>.glb (lages av tools/build-cars.mjs). Sjekk den nye bilen med:  node tools/test-vehicle.mjs <id>
//
//  dims {L,W,H}       lengde, bredde og høyde              mass      vekt med fører (kg)
//  wb, trackF/trackR  akselavstand og sporvidde            wd        andel av vekten på forakselen
//  cgH                tyngdepunktets høyde over bakken     clear     bakkeklaring
//  wheel {rF,rR,wF,wR} hjulradius og dekkbredde            susp      freq: egenfrekvens foran/bak (Hz), zeta: demping (inn/ut),
//                                                                    travel: fjæringsvei, arb: krengningsstabilisator (N/m)
//  engine             idle/redline (rpm), torque: [[rpm, Nm], …], turbo (0–1: hvor mye av kraften kommer fra turboen)
//  gearbox            ratios (1., 2. …), reverse, final (sluttveksel), shift (sekunder per girskift)
//  drive              layout 'AWD'|'RWD'|'FWD', split (andel til forakselen), center/front/rear: 'open'|'lsd'|'locked'|'viscous',
//                     low: lavserie (utveksling, 0 = ingen), lockLow: sperrer alle differensialer i lavserie
//  brakes             bremsemoment per hjul foran/bak (Nm), hand: håndbrekk bak
//  aero               CdA (luftmotstand, m²), ClF/ClR (marktrykk foran/bak, m²)
//  tyre               dekk fra fabrikken: sommer, vinter, pigg, at, mt, sport, monster
//  wade               vadedybde (m), snorkelUp: hvor mye snorkelen gir      vmax: fartssperre (km/t)
//  price              muttere i garasjen (uten pris: du har den fra start). winch: ekte vinsj
export const CARS = [
{ id: 'kobbe', name: 'Kobbe', kind: 'Kort 3-dørs terrengbil', model: 'kobbe', col: '#e3a62a',
  desc: 'Kort og smal terrengbil på 1,2 tonn med stive aksler og lavserie. Snur nesten på stedet og klatrer godt, men er urolig i høy fart.',
  dims: { L: 3.65, W: 1.65, H: 1.73 }, mass: 1210, wb: 2.25, overF: 0.597, overR: 0.81, trackF: 1.395, trackR: 1.405, wd: 0.52, cgH: 0.68, clear: 0.21, lift: 1,
  wheel: { rF: 0.346, rR: 0.346, wF: 0.195, wR: 0.195, mF: 21, mR: 21 },
  susp: { freq: [1.15, 1.25], zeta: [0.28, 0.42], travel: [0.24, 0.26], arb: [9000, 4000] },
  engine: { idle: 800, redline: 6200, limiter: 6500, torque: [[800, 85], [1500, 104], [2500, 118], [4000, 130], [5000, 127], [6000, 119], [6500, 105]], inertia: 0.13, launch: 2400 },
  gearbox: { ratios: [4.425, 2.304, 1.674, 1.190, 1.000], reverse: 5.151, final: 4.30, shift: 0.32 },
  drive: { layout: 'AWD', split: 0.5, center: 'viscous', low: 2.002, lockLow: false },
  brakes: { front: 2300, rear: 1100 }, aero: { CdA: 1.25 }, tyre: 'at', steer: 0.62, wade: 0.30, snorkelUp: 0.35, stats: [4, 5, 2] },

{ id: 'fjellrev', name: 'Fjellrev', kind: 'Stor 5-dørs terrengbil', model: 'fjellrev', col: '#e3a62a',
  desc: 'Stor terrengbil på 2,6 tonn med V6-diesel, ti gir og sperre i midten. Rolig og stødig i bratt terreng, men tung å stoppe.',
  dims: { L: 4.98, W: 1.98, H: 1.94 }, mass: 2575, wb: 2.85, overF: 0.95, overR: 1.198, trackF: 1.665, trackR: 1.665, wd: 0.53, cgH: 0.80, clear: 0.23, lift: 1,
  wheel: { rF: 0.401, rR: 0.401, wF: 0.265, wR: 0.265, mF: 30, mR: 30 },
  susp: { freq: [1.20, 1.35], zeta: [0.30, 0.45], travel: [0.22, 0.25], arb: [22000, 9000] },
  engine: { idle: 700, redline: 4200, limiter: 4400, torque: [[700, 420], [1200, 580], [1600, 700], [2600, 700], [3200, 640], [3800, 560], [4300, 470]], inertia: 0.3, turbo: 0.35, launch: 1800 },
  gearbox: { ratios: [4.923, 3.193, 2.326, 1.864, 1.512, 1.286, 1.000, 0.791, 0.656, 0.600], reverse: 4.7, final: 3.31, shift: 0.22 },
  drive: { layout: 'AWD', split: 0.4, center: 'lsd', rear: 'open', low: 2.618, lockLow: true },
  brakes: { front: 4200, rear: 2400 }, aero: { CdA: 1.30 }, tyre: 'at', steer: 0.6, wade: 0.70, snorkelUp: 0.30, vmax: 180, stats: [5, 2, 5] },

{ id: 'ravn', name: 'Ravn', kind: 'Stasjonsvogn med firehjulstrekk', model: 'ravn', col: '#e3a62a',
  desc: 'Lav og rolig stasjonsvogn med turbomotor og firehjulstrekk. Trygg på asfalt og grus, men lav under og ingen lavserie.',
  dims: { L: 4.94, W: 1.88, H: 1.48 }, mass: 1925, wb: 2.94, overF: 0.914, overR: 1.1, trackF: 1.61, trackR: 1.62, wd: 0.58, cgH: 0.55, clear: 0.15, lift: 0.4,
  wheel: { rF: 0.351, rR: 0.351, wF: 0.245, wR: 0.245, mF: 24, mR: 24 },
  susp: { freq: [1.35, 1.50], zeta: [0.32, 0.45], travel: [0.16, 0.18], arb: [24000, 14000] },
  engine: { idle: 750, redline: 6300, limiter: 6500, torque: [[750, 220], [1500, 350], [4800, 350], [5500, 320], [6300, 285]], inertia: 0.16, turbo: 0.45, launch: 2200 },
  gearbox: { ratios: [5.250, 3.029, 1.950, 1.457, 1.221, 1.000, 0.809, 0.673], reverse: 4.015, final: 3.08, shift: 0.2 },
  drive: { layout: 'AWD', split: 0.65, center: 'viscous', low: 0 },
  brakes: { front: 3200, rear: 1700 }, aero: { CdA: 0.70 }, tyre: 'sommer', steer: 0.6, wade: 0.30, snorkelUp: 0.25, vmax: 180, stats: [2, 4, 4] },

{ id: 'jerv', name: 'Jerv', kind: 'Terrengbil med trinntak', model: 'jerv', col: '#e3a62a',
  desc: 'Moderne terrengbil med 400 hk, luftfjæring og sperre bak. Allsidig: rask på veien og sterk i stein og skog.',
  dims: { L: 4.76, W: 2.0, H: 1.97 }, mass: 2375, wb: 3.02, overF: 0.87, overR: 0.868, trackF: 1.70, trackR: 1.70, wd: 0.52, cgH: 0.78, clear: 0.27, lift: 1,
  wheel: { rF: 0.407, rR: 0.407, wF: 0.255, wR: 0.255, mF: 30, mR: 30 },
  susp: { freq: [1.30, 1.40], zeta: [0.33, 0.48], travel: [0.24, 0.26], arb: [26000, 14000] },
  engine: { idle: 700, redline: 6200, limiter: 6500, torque: [[700, 300], [2000, 550], [5000, 550], [5800, 500], [6300, 450]], inertia: 0.2, turbo: 0.4, launch: 2200 },
  gearbox: { ratios: [4.714, 3.143, 2.106, 1.667, 1.285, 1.000, 0.839, 0.667], reverse: 3.317, final: 3.31, shift: 0.2 },
  drive: { layout: 'AWD', split: 0.45, center: 'lsd', rear: 'lsd', low: 2.93, lockLow: true },
  brakes: { front: 4200, rear: 2400 }, aero: { CdA: 1.25 }, tyre: 'at', steer: 0.6, wade: 0.90, snorkelUp: 0.10, vmax: 191, stats: [4, 3, 4] },

{ id: 'vinsjen', name: 'Vinsjen', kind: 'Pickup med vinsj', model: 'vinsjen', col: '#e3a62a', price: 600, winch: true,
  desc: 'Lang pickup med dieselmotor, lavserie, sperre bak og ekte vinsj i fronten: fest tauet i et tre eller en stein og dra deg opp.',
  dims: { L: 5.33, W: 1.86, H: 1.82 }, mass: 2225, wb: 3.085, overF: 0.92, overR: 1.326, trackF: 1.535, trackR: 1.55, wd: 0.56, cgH: 0.78, clear: 0.29, lift: 1,
  wheel: { rF: 0.388, rR: 0.388, wF: 0.265, wR: 0.265, mF: 28, mR: 28 },
  susp: { freq: [1.25, 1.55], zeta: [0.30, 0.45], travel: [0.22, 0.26], arb: [18000, 0] },
  engine: { idle: 750, redline: 4000, limiter: 4300, torque: [[750, 300], [1600, 500], [2800, 500], [3400, 440], [4000, 360]], inertia: 0.26, turbo: 0.4, launch: 1800 },
  gearbox: { ratios: [3.600, 2.090, 1.488, 1.000, 0.687, 0.580], reverse: 3.732, final: 3.909, shift: 0.26 },
  drive: { layout: 'AWD', split: 0.45, center: 'viscous', rear: 'open', low: 2.566, lockLow: true },
  brakes: { front: 3800, rear: 1900 }, aero: { CdA: 1.26 }, tyre: 'at', steer: 0.6, wade: 0.70, snorkelUp: 0.25, vmax: 175, stats: [5, 2, 4] },

{ id: 'knott', name: 'Knøtt', kind: 'Monstertruck', model: 'knott', col: '#3f9a1e', price: 500,
  desc: 'Ekte monstertruck: 5,4 tonn, 1500 hk og hjul som er 1,7 meter høye. Kjører over nesten alt, men er bred, høy og lett å velte i svingene.',
  dims: { L: 5.4, W: 4.09, H: 3.4 }, mass: 5400, wb: 3.45, overF: 1, overR: 1, trackF: 3.0, trackR: 3.0, wd: 0.5, cgH: 1.55, clear: 1.0, lift: 0,
  wheel: { rF: 0.84, rR: 0.84, wF: 1.09, wR: 1.09, mF: 300, mR: 300 },
  susp: { freq: [0.85, 0.9], zeta: [0.35, 0.55], travel: [0.62, 0.62], arb: [0, 0] },
  engine: { idle: 1200, redline: 7500, limiter: 7800, torque: [[1200, 800], [3000, 1300], [5000, 1650], [6500, 1550], [7600, 1350]], inertia: 0.6, launch: 3500 },
  gearbox: { ratios: [1.76, 1.00], reverse: 1.76, final: 19.8, shift: 0.3 },
  drive: { layout: 'AWD', split: 0.5, center: 'locked', front: 'locked', rear: 'locked', low: 0 },
  brakes: { front: 16000, rear: 12000 }, aero: { CdA: 6.0 }, tyre: 'monster', steer: 0.62, wade: 1.6, snorkelUp: 0, stats: [5, 3, 1] },

{ id: 'turbo', name: 'Porsche 911 Turbo', kind: 'Sportsbil med firehjulstrekk', model: 'turbo', col: '#c8102e', price: 1500,
  desc: 'Sportsbil med 580 hk, to turboer og firehjulstrekk: 0–100 km/t på under 3 sekunder. Ligger som limt på asfalt, men har 12 cm bakkeklaring: hold deg på veien.',
  dims: { L: 4.535, W: 1.90, H: 1.30 }, mass: 1715, wb: 2.45, overF: 1.013, overR: 1.103, trackF: 1.588, trackR: 1.598, wd: 0.39, cgH: 0.45, clear: 0.115, lift: 0, grip: 1.06,
  wheel: { rF: 0.343, rR: 0.361, wF: 0.255, wR: 0.315, mF: 22, mR: 25 },
  susp: { freq: [1.85, 2.05], zeta: [0.35, 0.50], travel: [0.11, 0.12], arb: [36000, 26000] },
  engine: { idle: 800, redline: 6750, limiter: 7200, torque: [[800, 300], [2250, 750], [4500, 750], [5800, 680], [6750, 610], [7200, 560]], inertia: 0.17, turbo: 0.5, launch: 4200 },
  gearbox: { ratios: [4.89, 3.17, 2.15, 1.56, 1.18, 0.94, 0.79, 0.62], reverse: 4.0, final: 3.62, shift: 0.12 },
  drive: { layout: 'AWD', split: 0.3, center: 'viscous', rear: 'lsd', low: 0 },
  brakes: { front: 4600, rear: 2600 }, aero: { CdA: 0.68, ClF: 0.08, ClR: 0.14 }, tyre: 'sport', steer: 0.55, wade: 0.25, snorkelUp: 0.15, stats: [1, 5, 4] },
];
export const carById = id => CARS.find(c => c.id === id) || CARS[0];
