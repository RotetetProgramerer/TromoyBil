// Biler. Legg til en ny ved å kopiere en blokk og endre verdiene.
//  id       unik nøkkel (brukes i lagring)        name   navnet i menyen
//  kind     kort beskrivelse under navnet         L      total lengde (1 enhet ≈ 8,5 cm, 2.0 ≈ 17 cm)
//  wb       akselavstand                          mass   vekt (tyngre = roligere, tregere)
//  gh       høyde på kupeen                       hood   lengde på panseret
//  win      antall sidevinduer                    style  'box' | 'glass' | 'step'
//  snorkel  true/false                            spare  'rear' | 'hood' | 'rack' (plassering av reservehjul)
//  stats    [klatring, sving, stabilitet] 1–5 (bare visning i menyen)
//  valgfritt: wr hjulradius (standard .24)  track sporvidde (standard .9)  tireW dekkbredde (standard .19)
//             top toppfart i høy gir (1 = som de andre)  col fargen bilen har når lakken er standard (Sandgul)
//             style 'monster' tegner en monstertruck (js/carmodel.js buildMonster)
CARS.push(
{id:'kobbe',name:'Kobbe',kind:'Kort 2-dørs',L:1.62,wb:1.08,mass:9.2,gh:.31,hood:.42,win:1,style:'box',snorkel:true,spare:'rear',stats:[3,5,3],extras:['spade','axe','cans2'],
   desc:'Kort akselavstand. Snur nesten på stedet, men vipper lettere bakover i bratte bakker.'},
{id:'fjellrev',name:'Fjellrev',kind:'Lang 5-dørs',L:2.22,wb:1.52,mass:11,gh:.31,hood:.44,win:3,style:'box',snorkel:true,spare:'hood',stats:[4,2,5],extras:['cans2','box','sandLadders'],
   desc:'Lang og rolig. Ligger stødig i bratte bakker, men trenger plass når den svinger.'},
{id:'ravn',name:'Ravn',kind:'Lav stasjonsvogn',L:1.96,wb:1.3,mass:10,gh:.27,hood:.5,win:2,style:'glass',spare:'rack',stats:[3,4,4],extras:['lightbar','tent','crates','jack'],
   desc:'Lavt tak og godt utsyn. Et trygt valg for nye sjåfører.'},
{id:'jerv',name:'Jerv',kind:'Trinntak',L:2.02,wb:1.38,mass:10.4,gh:.29,hood:.46,win:2,style:'step',spare:'rear',stats:[4,3,4],extras:['ladder','cans3','toolbox','tarp'],
   desc:'Trinntak og høy last på taket. Allsidig i stein og skog.'},
{id:'vinsjen',name:'Vinsjen',kind:'Pickup med vinsj',L:2.3,wb:1.5,mass:11.4,gh:.3,hood:.52,win:1,style:'pickup',snorkel:true,spare:'rack',stats:[5,2,5],price:600,winch:true,extras:['lightbar'],
   desc:'Lang pickup med ekte vinsj i fronten: fest tauet i et tre eller en stein og dra deg opp. Tung og stødig, treig i svingene.'},
// monstertruck inspirert av en 1:18 elektrisk basher, skalert ned til 1:24: 20 cm lang, 15 cm bred, 6,3 cm høye dekk og 2,5 cm bakkeklaring
{id:'knott',name:'Knøtt',kind:'Monstertruck 4WD',L:2.35,wb:1.47,mass:9.6,gh:.1,hood:.5,win:1,style:'monster',spare:'none',stats:[3,4,3],price:500,
   wr:.37,track:1.41,tireW:.33,top:1.15,col:'#3f9a1e',
   desc:'Liten elektrisk monstertruck med store dekk og høy bakkeklaring. Rask i høy gir og bred mellom hjulene, men tyngdepunktet ligger høyt.'}
);
