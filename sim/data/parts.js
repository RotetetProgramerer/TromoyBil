// Verkstedet: deler, dekk og lakk. Prisene er i muttere (⚙). Delene gjelder bilen du kjører (hver bil har sine egne).
// Effektene ligger i sim/physics/vehicle.js (tune): fjæring løfter terrengbiler og gir lengre vandring, motor gir mer dreiemoment,
// ballast senker tyngdepunktet, utstyr gir snorkel (dypere vann), vinsj og sperrer i lavserie.
export const PARTS = [
  { id: 'susp', name: 'Fjæring', lv: ['Fabrikk', 'Løftesett 3 cm', 'Løftesett 6 cm og lange dempere', 'Konkurranseoppsett 10 cm'], price: [0, 180, 380, 650],
    desc: 'Mer bakkeklaring og lengre fjæringsvei. Hjulene følger steinene, men bilen krenger mer på asfalt.' },
  { id: 'motor', name: 'Motor', lv: ['Fabrikk', 'Ny programvare (+8 %)', 'Turbo og eksos (+17 %)', 'Full ombygging (+28 %)'], price: [0, 200, 420, 750],
    desc: 'Mer dreiemoment over hele turtallsområdet.' },
  { id: 'weight', name: 'Ballast', lv: ['Ingen', 'Lavt monterte vekter', 'Tunge felger', 'Ballast i rammen'], price: [0, 90, 190, 320],
    desc: 'Lavere tyngdepunkt: bilen velter senere i bratte skråninger, men blir litt tyngre.' },
  { id: 'gear', name: 'Utstyr', lv: ['Ingen', 'Snorkel', 'Snorkel og sperrer i lavserie', 'Snorkel, sperrer, vinsj og LED-ramme'], price: [0, 150, 320, 520],
    desc: 'Snorkelen tåler dypere vann. Sperrene låser differensialene i lavserie. Vinsjen drar deg opp av grøfta, og LED-rammen lyser opp skogen.' },
];
export const TYRE_SHOP = [
  { id: 'sommer', price: 120, desc: 'Godt grep på tørr og våt asfalt. Glatt på snø og is.' },
  { id: 'vinter', price: 160, desc: 'Myke piggfrie vinterdekk: bra på snø, brukbare på is.' },
  { id: 'pigg', price: 200, desc: 'Piggdekk: best på is, støyete og litt dårligere på tørr asfalt.' },
  { id: 'at', price: 180, desc: 'Allterrengdekk: godt på grus, skogsvei og asfalt.' },
  { id: 'mt', price: 240, desc: 'Gjørmedekk med grove knaster: best i gjørme og sand, dårligere på asfalt.' },
  { id: 'sport', price: 300, desc: 'Myke sportsdekk: mest grep på asfalt, nesten ubrukelige utenfor veien.' },
];
export const PAINTS = [
  { n: 'Fabrikkfarge', c: null, p: 0 }, { n: 'Polarhvit', c: '#e9e8e4', p: 80 }, { n: 'Sølvmetallic', c: '#a9acb0', p: 120 }, { n: 'Grafittgrå', c: '#4a4d52', p: 120 },
  { n: 'Nattsvart', c: '#141416', p: 140 }, { n: 'Fjordblå', c: '#1f4f8a', p: 140 }, { n: 'Granskoggrønn', c: '#2f4a32', p: 140 }, { n: 'Ekspedisjonsrød', c: '#b5241c', p: 160 },
  { n: 'Sandgul', c: '#e3a62a', p: 160 }, { n: 'Oransje', c: '#e2621b', p: 180 }, { n: 'Turkis', c: '#1f8f8f', p: 180 }, { n: 'Gull', c: '#c8a244', p: 0, locked: true },
];
