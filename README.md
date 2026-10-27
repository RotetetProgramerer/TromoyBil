# Skare Offroad

Et 3D-spill i nettleseren der du kjører en RC-crawler i skala 1:24 gjennom porter, gjørme og vadesteder, tjener muttere og bygger bilen i garasjen. Ingen byggeverktøy: last opp mappa, og spillet kjører.

## Mappestruktur

```
index.html            Siden som laster alt. Her står rekkefølgen på skriptene.
css/style.css         Alt utseende (meny, HUD, garasje).
js/core.js            Motoren: terreng, baneverktøy, bilfysikk. Trenger du sjelden å røre.
js/props.js           Planter og dyr du setter ut ett og ett (c.plant, c.sow). Innholdet ligger i data/.
js/game.js            Spillet: grafikk, kamera, lyd, meny, garasje, poeng.
js/animals.js         Dyr (papegøyer, apekatter, sommerfugler, krabber) og den rullende steinen.
js/ambience.js        Jungellyd laget med WebAudio (ingen lydfiler).
js/skier.js           Fysikken for skiløperen i Gautefall (ingen DOM, testes uten nettleser).
js/ski.js             Skianlegget i spillet: stolheisen, skiløperen, turen opp og ned, kamera og lyd.
js/boatsim.js         Fysikken for motorbåtløpet: båtene, bøyene, piratene og vulkanen (ingen DOM, testes uten nettleser).
js/boat.js            Motorbåtløpet fra marinaen på Tromøya: havet, øyene, båtene, delt skjerm, HUD, lyd og løp mot andre i rommet.
js/planesim.js        Flyfysikken: avgang, flyging, landing, krasj og ringene (ingen DOM, testes uten nettleser).
js/plane.js           Flyturene fra flyplassen på Trinnvik: flyet, flyplassen ute på havet, HUD, lyd, og båtene og flyene til de andre i rommet.
js/net.js             Flerspiller: rom, romkode og de andre bilene.
data/cars.js          Bilene.                 ← legg til nye biler her
data/levels/NN-id.js  Én fil per bane.         ← legg til nye baner her
data/parts.js         Garasjedeler og lakkfarger.
data/vegetasjon.js    Trær og planter for jungel, subtropisk og arktisk.   ← legg til nye planter her
data/dyr.js           Dyr for de samme tre miljøene (står i ro).          ← legg til nye dyr her
data/boats.js         Havet og båtløpene fra marinaen.                    ← legg til nye båtløp her
data/flights.js       Flyplassen på havet og flyturene med ringer.        ← legg til nye flyturer her
tools/test-levels.js  Autopilot som tester alle baner uten nettleser.
tools/test-boats.js   Autopilot som kjører alle båtløpene uten nettleser.
tools/test-flights.js Autopilot som flyr alle flyturene og lander på rullebanen, uten nettleser.
manifest.json, sw.js  Gjør spillet til en PWA (installerbar, virker uten nett).
icons/                Appikoner.
```

Innhold (`data/`) og motor (`js/`) er adskilt. Du kan lage nye biler og baner uten å lese motorkoden.

## Kjøre lokalt

Åpne `index.html` i nettleseren. Det er alt. (Service worker og installering krever en vanlig nettadresse, men selve spillet kjører fint fra fil.)

Vil du ha en lokal server, for eksempel for å teste på mobilen i samme nettverk:

```
npx serve .
```

## Legge til en ny bil

Åpne `data/cars.js`, kopier en av blokkene og endre verdiene:

```js
{id:'ulv',name:'Ulv',kind:'Pickup',L:2.1,wb:1.42,mass:10.6,gh:.3,hood:.5,win:1,style:'box',snorkel:false,spare:'rear',stats:[4,3,4],
 desc:'Lang og lav pickup. God i sand, trenger plass i svinger.'},
```

| Felt | Betydning |
|---|---|
| `id` | Unik nøkkel. Brukes i lagring, så ikke endre den etterpå. |
| `name`, `kind`, `desc` | Tekst i menyen. |
| `L` | Total lengde. 1 enhet er omtrent 8,5 cm, så 2.0 er 17 cm. |
| `wb` | Akselavstand. Kort = snur lett, vipper lett. Lang = stødig, trenger plass. |
| `mass` | Vekt. Tyngre bil er roligere og tregere. 9–11 er normalt. |
| `gh`, `hood` | Kupéhøyde og panserlengde (bare utseende). |
| `win` | Antall sidevinduer (1–3). |
| `style` | `'box'` (kantete), `'glass'` (mye glass), `'step'` (trinntak). |
| `snorkel` | `true` tegner snorkel uansett garasjenivå. |
| `spare` | Reservehjul: `'rear'`, `'hood'` eller `'rack'`. |
| `stats` | `[klatring, sving, stabilitet]` fra 1 til 5. Bare visning. |
| `price` | Valgfritt. Bilen må kjøpes i garasjen for så mange muttere. |
| `wr`, `track`, `tireW` | Valgfritt. Hjulradius (standard 0.24), sporvidde (0.9) og dekkbredde (0.19). Store hjul gir høyere bakkeklaring. |
| `top` | Valgfritt. Toppfart i høy gir, 1 er som de andre. |
| `col` | Valgfritt. Fargen bilen har når lakken er standard (Sandgul). |
| `tireWr` | Valgfritt. Dekkbredde bak, hvis den er annerledes enn foran. |
| `ride` | Valgfritt. Hjulene sitter så mye høyere under karosseriet, så bilen blir lavere og får mindre bakkeklaring. |
| `susp` | Valgfritt. Fjæringsvei, 1 er som de andre. Mindre gir kortere og stivere fjæring (sportsbil). |
| `pow` | Valgfritt. Motorkraft, 1 er som de andre. Mer kraft gir raskere akselerasjon, helt til dekkene spinner. |

`style:'monster'` tegner en monstertruck i stedet for en vanlig crawler (`buildMonster` i `js/carmodel.js`), se Knøtt.

`style:'sport'` tegner en sportsbil med glatt karosseri (`buildSport` i `js/carmodel.js`), se Porsche 911 Turbo. Formen kommer fra tabellen `SP911`: ekte mål i millimeter, én rad per tverrsnitt fra nesen og bakover (bunn, bredde, skjermer, vinduslinje, tak). Bilen skaleres så akselavstanden blir `wb`. `gh` bestemmer hvor taket er når bilen ligger opp ned, og kan være negativt for en lav bil.

Test en bil på alle banene: `CAR=knott node tools/test-levels.js` (eller `CAR=turbo`).

Bilen dukker opp i menyen med en gang.

## Legge til en ny bane

1. Kopier `data/levels/01-sand.js` til `data/levels/06-minbane.js`.
2. Legg til én linje i `index.html` under de andre banene. Rekkefølgen på disse linjene er rekkefølgen i menyen:
   ```html
   <script src="data/levels/06-minbane.js"></script>
   ```
   Legg også til `"./data/levels/06-minbane.js"` i `FILES` i `sw.js`, så banen virker uten nett.
3. Endre feltene. De viktigste:

| Felt | Betydning |
|---|---|
| `id` | Unik nøkkel. Brukes i lagring (valgt bane, rekorder og banebonus), så ikke endre den etterpå. |
| `name`, `desc`, `diff` | Navn, beskrivelse og vanskelighet 1–3 i menyen. |
| `seed` | Et heltall. Bytt tall, og steinene legger seg annerledes. |
| `gates` | Antall porter (10 er standard). |
| `path` | Listen med `[x, z]`-punkter som løypa går gjennom. Verden er 70 × 70 enheter, fra −35 til 35. Hold deg innenfor ±28. |
| `base(x,z,n)` | Funksjon som gir terrenghøyden. `n` er en støyfunksjon. Start med å kopiere en eksisterende. |
| `surf(x,z)` | Underlag per punkt: `S.SAND`, `S.GRAVEL`, `S.GRASS`, `S.DIRT`, `S.MUD`, `S.BOG`, `S.ROCK`, `S.WOOD`, `S.ASH` (svart vulkansand), `S.SNOW` (lite grep), `S.ICE` (nesten ikke grep). Styrer grep og farge. |
| `sky`, `fog`, `sun`, `hemi`, `sunDir` | Lys og himmel. |
| `water` | Globalt vannivå (valgfritt). Alt terreng under dette blir vann. |
| `waterCol`, `waterOpacity` | Vannfarge og hvor gjennomsiktig vannet er (0–1, standard 0.7). |
| `rain: true` | Regn. `clouds:false` fjerner skyer og sol. |
| `snow: true`, `precip(x,z)` | Snøvær. `precip` (valgfritt) gir 0–1 for hvor mye det snør der bilen er, f.eks. bare rundt toppen. |
| `wind: true` | Vindsus som øker med `zone` (brukes sammen med `ambience:'jungle'`). Se Tromøya. |
| `ash: true` | Glør og aske som svever i lufta (brukes på Hisøya). |
| `erupt:[min,maks]` | Vulkanen rumler med jevne mellomrom (sekunder mellom hver gang). Bare for show: ristende kamera og lavabomber, ingenting skader bilen. Krever `c.vent(...)`. |
| `gateT(c)` | Valgfritt. Funksjon som gir portene nøyaktige plasser i stedet for jevn fordeling: `c=>[[x,z],[x,z],...].map(p=>c.tOf(p[0],p[1]))`. Da styrer antall punkter antall porter. |
| `shortcut:[[x,z],...]`, `shortcutGates:[a,b]` | Bare for testen: punkter en snarvei følger, og hvilke porter (0-indeksert) den hopper over. Se Hisøya (`06-vulkan.js`). |
| `alt:{fog,fogNear,fogFar,sun,sunI,hemi}`, `zone(x,z)` | To lyssett i samme bane. `zone` gir 0–1 for hvor bilen er: 0 bruker `alt` (f.eks. jungel), 1 bruker banens vanlige lys (f.eks. vulkanen). Blandes mykt mens du kjører. |
| `dark(x,z)` | Valgfritt. 0–1 for hvor mørkt det er (tunnel, grotte). Demper himmellyset og tåken der bilen står. |
| `ambience:'jungle'` | Insekter, fugler, foss (etter avstand) og vulkanrumling (etter `zone`). Se `js/ambience.js`. |
| `animals:{parrots,circling,monkeys,butterflies,crabs,liana:[x,z],bridgeMonkeys:{A}}` | Dyr. Papegøyer og apekatter trenger trær (`c.tree`), sommerfugler trenger blomster (`c.flowers`), krabber trenger sand ved start. Se `js/animals.js`. |
| `boulder:{trigger:[x,z],from:[x,z],to:[x,z],speed,r}` | Rullende stein: når bilen passerer `trigger`, ruller en stein fra `from` til `to` (legg linja over veien). Én gang per runde. Dytter bilen litt, ingen straff. |
| `build(c)` | Her plasserer du hindringer. |

Verktøy du kan bruke i `build(c)`:

```js
c.P(t)                      // punkt på løypa, t fra 0 (start) til 1 (mål)
c.T(t), c.side(t)           // retning langs og på tvers av løypa
rock(x,z,radius,høyde,{ang,ax,sharp,nz})   // stein
log(x0,z0,x1,z1,radius,S.BARK)              // stokk (eller blyant, kabel)
c.pond(x,z,radius,dybde,{bog:true})         // pytt eller gjørmehull (bog = dyp gjørme)
c.ramp(t,høyde,lengde,bredde)               // hopp
c.pebbles(antall,[farger],min,max)          // småstein
c.tufts(antall,[farger])                    // gresstuster
c.dist(x,z)                  // avstand fra løypa (hold steiner unna løypa med dette)
c.nearGate(x,z,avstand)      // sant hvis en port er nær
c.finish()                   // kall denne når terrenget er ferdig, før pynt
c.tOf(x,z)                   // t (0–1) for det punktet på løypa som er nærmest (x,z)
```

### Lava, hengebroer, foss og vulkan

Disse verktøyene brukes i `data/levels/06-vulkan.js`. Kopier derfra.

```js
c.bench(t0,t1,hw,blend)      // jevner ut terrenget langs løypa (t0–t1) så bilen slipper å kjøre på skrå
c.benchLine(punkter,hw,blend)// det samme langs en egen linje, f.eks. en snarvei
c.lava(punkter,(x,z)=>halvBredde)   // lavaelv langs en linje, fra kilden og nedover. Lavaen følger terrenget.
c.lavaPool(x,z,r,nivå)       // lavasjø (krater)
c.bridge(ax,az,bx,bz,halvBredde,{sag:.2})  // hengebro fra A til B. Begge ender må ligge på fast grunn.
c.fall(x,z,vinkel,bredde,topp,bunn,{spray:true})  // foss. spray: vannet spruter ut over veien, og dråper renner på skjermen når du kjører gjennom
c.smoke(x,z,y)               // røyk og glød over et krater
c.vent(x,z)                  // et sted utbruddet skyter lava (kreves for `erupt`)
c.crate(x,z)                 // ekstra kasse på et bestemt sted (f.eks. midt på en smal bro)
c.bonus(x,z,r,muttere,tekst) // belønning (muttere) første gang bilen kommer innenfor r. Brukes til snarveien.
c.steam(x,z)                 // liten dampsøyle (sprekk i vulkanen)
c.tree(x,z,{h,r})            // regnskogstre med røtter, grener, krone, mose og lianer. Grener blir sitteplasser for dyr.
c.forest()                   // bygger alle trærne. Kall etter c.finish().
c.ruts(t0,t1,dybde)          // hjulspor i stien mellom t0 og t1
c.pond(x,z,r,dybde,{mud:true})  // søledam med brunt vann
c.lavaNear(x,z,m)            // sant hvis det er lava innenfor m. Bruk når du plasserer steiner og planter.
```

Kjører bilen i lava, får spilleren 10 straffepoeng og settes tilbake ved forrige port. Broer er kjørbare flater med en lav kant, og er høye nok over lavaen til at bilen ikke regnes som «i lava».

**Rekkefølge i `build(c)`:** først `c.bench`, så `c.lava`/`c.lavaPool`, så `c.bridge`, så steiner, så `c.tree` for trærne, deretter `c.finish()`, og til slutt `c.forest()` og pynt. Legg ikke steiner nær lava eller på snarveien (bruk `c.lavaNear`).

### Hisøya: snarveien

Etter port 13 kan du velge den lange runden sør om vulkanen, eller en smal bro rett over lavaelva (skilt vises ved avkjøringen). Snarveien har to kasser midt på broa og gir 40 muttere ekstra («Modig snarvei!»). Faller du i lava, mister du 10 poeng og går tilbake til port 13. Testen `node tools/test-levels.js vulkan` kjører også snarveien.

4. Kjør testen:

```
node tools/test-levels.js minbane
```

Testen kjører banene som står i `index.html`, i samme rekkefølge, og varsler om banefiler som mangler der. I en åpen verden kjøres hver løype for seg. Autopiloten kjører banen i begge gir. Du vil se `prog 0.99` (kom i mål), `drown 0` (ingen druknet motor på selve løypa), `lava 0` (ingen i lavaen) og helst under 5 velt. Har banen `shortcut`, kjører den også snarveien (`SNARVEI`) og viser hvor lang tid hovedruten tar mellom de samme portene. Står den fast («fast» høyt) eller drukner, er noe i veien plassert feil.

## Skjærgården: øyer, landsbyer og fergen

Alle banene er øyer i samme skjærgård. «Kjør!» i menyen starter fri kjøring på Tromøya (eller der du sist var); «Hurtigløp» kjører ett bestemt løp som før. På hver øy ligger en liten landsby med fergekai. Kjør om bord på fergen, velg øy, og fergen seiler (ca. 8 sekunder, hopp over med Enter). Overfarten koster 5 muttere. På øyene uten base finnes garasjen i pausemenyen; «Tau til kaia» på kartet setter deg tilbake i landsbyen.

Slik blir en bane til en øy, uten at løypa endres:

| Felt | Betydning |
|---|---|
| `size:120, coast:42` | Verden blir 120 bred, og alt utenfor r = 42 synker under havet. Den siste ringen innenfor er strand. Løypene ligger innenfor ±28 og er uendret. Baner uten vann får hav på nivå 0,3. |
| `village:{at:[x,z], dir}` | Landsbyen: hus rundt et torg, lyktestolper, tønner, båter, FERGE-skilt, en plankebrygge på pæler ut over vannet, og fergedekket ytterst. `dir` (grader) peker mot havet, standard rett ut fra øyas midtpunkt. Bygges automatisk før `build(c)`. |

I fri kjøring blir banens egen løype en startstrek (`c.course` lages automatisk for øyer som er løp), så du kan starte løpet ute i terrenget som på Tromøya. Beste tid deles mellom Hurtigløp og fri kjøring.

**Låste løyper:** `needs:{courses:3}` på en løype krever tre fullførte løyper på øya; `needs:{courses:5,nuts:200}` kan i tillegg låses opp for muttere. Skiltet og kartet viser hengelås. **Biler til salgs:** `price:600` på en bil i `data/cars.js` gjør at den må kjøpes i verkstedet på basen; `winch:true` gir den ekte vinsj.

**Vinsj:** bilen Vinsjen, og alle biler med Utstyr nivå 3, har ekte vinsj. Hold **R** for å sikte (en linje vises til nærmeste festepunkt innen 7 enheter og ca. 70° foran bilen), slipp for å dra; R igjen løsner. Festepunkter er trær, hus, lykter, bropilarer og store steiner (`c.anchor(x,z)` i banefilen, eller `anchor:true` på en kollider). «Hent bilen» i pausemenyen er den gamle vinsjen med straff.

**Gullmuttere:** `c.secret(x,z,'Bak fossen')` gjemmer en gullmutter (25 ⚙, én gang). Fem per øy; finner du alle, får du 100 ⚙ og gull-lakken. Kartet viser bare de du har funnet.

Fergerutene og plasseringen på skjærgårdskartet ligger i `data/archipelago.js` (`ISLANDS`, `ROUTES`). Kartet (K) har to faner: øya du er på, og skjærgården. Hver øy er fortsatt sin egen fil og kan endres og testes for seg: `node tools/test-levels.js sand`.

## Åpen verden (Tromøya)

`data/levels/10-verden.js` er en **verden**, ikke et løp: fri kjøring med basen i midten og løyper spredt rundt. En verden er en vanlig banefil med noen ekstra felt:

| Felt | Betydning |
|---|---|
| `world:true` | Fri kjøring. Ingen porter på hovedlinjen; `path` trengs bare som en liten sløyfe ved basen. |
| `size:120` | Verdens bredde (standard 70). Rutene er like store, så 120 gir ca. 3× arealet. |
| `start:[x,z,retning]` | Der bilen står når du starter (ved basen). |
| `challenges:[...]` | Løypene. Hver har `id`, `name`, `desc`, `diff`, `gates`, `path`, og valgfritt `surf`/`skip` (underlag som males på stien), `hw`/`blend` (bredde på utjevningen), `night:true` (nattløp). I `build(c)` registreres de med `c.course(ch)`. |
| `roads:[...]` | Veiene fra basen ut til løypene (`c.road(poly,{hw,blend,surf,skip})`). Tegnes på kartet. |
| `basePos`, `garageAt` | Hvor basen er (kartet, HUD, «Tau hjem») og hvor du kjører inn i verkstedet. |
| `mapLabels:[[x,z,'Navn'],...]` | Stedsnavn på øykartet. |
| `biome(x,z)` | Gir `{jungle,snow,beach,swamp,desert}` 0–1 for lydsonene (insekter og fugler, vind, bølger, frosker). |
| `animals:{..., crabsAt:[x,z], eagle:[x,z], bear:[[x,z],[x,z]], gulls:{at:[x,z],n}}` | Krabber på en bestemt strand, ørn som sirkler over et punkt, bjørn som rusler mellom to punkter, måker som letter når bilen kommer. |

Nye verktøy i `build(c)`: `c.course(ch)` (lager løypa, portene og kassene, jevner ut stien og flater ut startstreken), `c.road(poly,o)`, `c.flat(x,z,r,høyde,blend)` (flatt felt, f.eks. basen og toppen), `c.box(x,y,z,b,h,d,farge,ry)` og `c.cyl(x,y,z,r,h,farge)` (bygninger, master, tønner, mekanikere) som tegnes med `c.props()`. `c.dist` holder steiner og trær unna alle veier og løyper som er registrert.

Nye underlag: `S.REDROCK` (rød canyonstein) og `S.ASPHALT` (flystripen).

Slik virker det i spillet: Kjør bort til en startstrek (flagg, dekk og festivallys), så dukker det opp et banner nederst med løypa og en START-knapp. Spillet stopper ikke: kjør videre hvis du ikke vil. Trykk **Enter** eller START, så settes bilen på startstreken med fronten langs løypa, portene våkner, piler viser veien og nedtellingen går. Resultat og muttere som i løpene; beste tid lagres per løype (`best['verden/jungel']`). Kjører du mer enn 30 enheter fra neste port, avbrytes løpet. **K** åpner øykartet (tåke over det du ikke har sett, lagres per verden), minikartet ligger i hjørnet. Kjør inn foran verkstedportene for å åpne garasjen, eller «Tau hjem» fra kartet for 20 muttere.

Testen kjører hver løype for seg: `node tools/test-levels.js verden`.

## En by (Trinnvik)

`data/levels/07-trinnvik.js` er en verden som er en by: to flate terrasser (Nedre by 1,2 og Øvre by 2,39) med utsiktstoppen øverst, gater med fortauskant, trapper, en skatepark, et stadion, et parkeringshus med spiral og en liten byggetomt. Terrassene, bollen, amfiet og P-huskjeglen ligger i `base()`; alt annet stemples oppå med verktøyene under. Trapper på løypene er 0,15–0,18 høye (det klarer alle biler i begge gir), de bratteste (0,24) ligger utenfor løypene.

Verktøy for byer i `build(c)`:

| Verktøy | Betydning |
|---|---|
| `c.stairs(x,z,retning,n,trinn,inntrinn,bredde,{level,land,wall})` | En trapp stemplet i absolutt høyde: `n` trinn à `trinn` opp fra `(x,z)` i retning `retning` (radianer, 0 = +z). Bakken inni fotavtrykket settes til trinnhøyden, så trappa aldri forsvinner under en terrasse. `level` er høyden ved foten (standard bakken der), `land` en flat avsats etter øverste trinn, `wall:true` gir murer med kollidere på sidene. |
| `c.street(poly,{hw,drop,cross})` | En bygate: kjørebanen senkes `drop` (0,12) innenfor `hw`, så fortauet får kantstein på begge sider. `cross:[[x,z],...]` er fotgjengerfelt der gata kommer opp igjen (opphøyd gangfelt). Gater som krysser hverandre senkes bare én gang. Ingen utjevning: bakken må være flat fra før. |
| `c.building(x,y,z,b,h,d,farge,ry,{fh,sign,roof})` | En bygning: boks med sokkel, flatt tak, vindusbånd per etasje (`fh` = etasjehøyde), dør og en firkantet kollider som følger fasaden. Fronten vender mot +z i boksens egen ramme. Tegnes på øykartet. |
| `c.lamp(x,z,{h,ang})` | Gatelykt med stolpe og arm. Lyser om natten (nattløp). Duer sitter på den. |
| `c.cone(x,z)`, `c.barrier(x,z,retning)` | Trafikkjegle og sperrebukk som velter når bilen treffer dem. |
| `shape(..., level)` og `disc(..., level)` | Stemplene kan nå få en absolutt høyde for h = 0, i stedet for å måle fra grunnterrenget. Bruk det på terrasser og gater (fartsdumper, ramper, opphøyde kryss). |
| `c.road(poly,{bench:false})` | En vei uten utjevning av terrenget rundt. |
| Kollidere `{x,z,w,d,ry}` | Firkantede kollidere (i tillegg til de runde `{x,z,r}`): bilen dyttes ut fra nærmeste punkt på rektangelet. |

Dyr i en by: `pigeons:14` (duer på lykter og hustak), `rats:[{at,r,n}]`, `cats:[{at,r,n}]`. Lydsoner: `biome(x,z)` kan gi `city` (trafikkdur, duer, fjern biltut, rådhusklokke ved `bellAt:[x,z]`), `stadium` (publikumsmumling) og `site` (generator og hammerslag). `ambience:'town'` slår lyden på. En `boulder` med `col:'#f4f4f0'` er en ball (fotballen på stadion).

Testen: `node tools/test-levels.js trinnvik` kjører landsbytesten og alle sju løypene i begge gir.

## Gautefall: vinterøya og skianlegget

`data/levels/08-gautefall.js` er en vinterøy med et fjell i midten og et flatt platå på toppen. Fjellveien går fra kaia opp til parkeringsplassen ved bunnstasjonen. Kjør inn på den blå ruta foran heisen, så kommer spørsmålet «Vil du stå på ski?». JA: bilen blir stående, og en skiløper (i samme farge som lakken på bilen) tar stolheisen til toppen (ca. 10 sekunder, hopp over med Enter). På toppen velger du nedfart:

| Løype | Farge | Type | Slik vinner du |
|---|---|---|---|
| Familiebakken | Grønn | Friløp i sikksakk | Tid. Brede kontrollporter. |
| Slalåmbakken | Blå | Slalåm | Tid. Røde og blå porter; bom gir +5 sekunder. |
| Utforløypa | Rød | Utfor | Tid. Bratt, rask, med isflekker i svingene. |
| Big Jumps | Svart | Hoppløype | Poeng: 120 per sekund i lufta, +150 for hver hele snurr (360°) med ren landing. |

Styring: **← →** svinger (og snurrer i lufta), **↓** bremser (plog), **↑** staker på flatene og går i hockestilling i fart, **mellomrom** hopper, **C** bytter kamera, **Esc** pause. På mobil er det en egen hoppknapp. I Lett-modus har skiløperen en fartsgrense og tåler hardere landinger. Treffer du et tre, lander på tvers eller for hardt, faller du og starter igjen fra forrige port. Resultatet gir stjerner, rekorder (`best['gautefall/ski/slalom']` osv.) og muttere.

Verktøy i `build(c)` for vinter og ski:

| Verktøy | Betydning |
|---|---|
| `c.spruce(x,z,{h,snow})`, `c.spruces()` | Grantre med snø på greinene (kollider og festepunkt for vinsjen). `c.spruces()` bygger alle etter `c.finish()`. |
| `c.piste({id,name,desc,diff,color,kind,path,gates,hw,blend,gw,ice,par})` | En nedfart: egen linje fra toppen (t=0) til målet (t=1), jevnet ut på tvers, preparert (kordfløyelsstriper, glir bedre, merket i `TG`) og holdt fri for trær. `kind` er `'fri'`, `'slalom'`, `'utfor'` eller `'hopp'`. `gates` er portene som `[x,z]`, den siste er målet. `color` 1–4 er grønn, blå, rød og svart. `ice:[[t0,t1]]` legger is på løypa. `par:[3 stjerner, 2 stjerner]` er tid i sekunder, eller poeng for hoppløypa. |
| `c.kicker(k,t,{h,len,land,drop,w})` | Et hopp i løype `k` ved `t`: rampe opp til en blå kant, og et gravd ut, bratt landingsområde etterpå. Kall etter `c.piste`. |
| `c.dressPistes()` | Løypestikker langs kantene og en startbu ved hver start (kalles automatisk hvis banen ikke gjør det). |
| `c.lift([x,z],[x,z],{off,span,hang,clear})` | Stolheis fra bunnstasjon til toppstasjon. Mastene blir høye nok til at stolene går klar av bakken. Kall når terrenget er ferdig. Kabelen og stolene tegnes og flyttes av `js/ski.js`. |
| `skiAt:[x,z]` | Der bilen må stå for å få spørsmålet om å stå på ski. |
| `beachSurf:S.GRAVEL` | Underlaget på stranda rundt en øy (standard sand). |
| `village:{…,snow:true}` | Snø på takene i landsbyen. |

Testen kjører også nedfartene med en autopilot på ski: `node tools/test-levels.js gautefall`. Hver løype skal vise `MÅL`, helst `kræsj 0` og `fast 0`. For hoppløypa vises lufttiden for hvert hopp og den hardeste landingen (over 8,2 er et fall).

## Marinaen og båtløpet

Nordøst på Tromøya ligger Captain Theis' marina: et naust med skilt, en brygge på pæler, bensinpumpe, livbøyer og båter ved brygga. En av dem er lakkert i samme farge som bilen. Veien dit går fra østveien ved basen, langs kanten av jungelen. Kjør inn på den blå ruta, så kommer spørsmålet «Vil du kjøre båt?». JA: bilen blir stående, og du kommer ut på sjøen med båtmenyen.

I båtmenyen velger du løp og om dere er én eller to spillere. To spillere deler skjermen (side om side, eller over hverandre på en høy skjerm) og tastaturet. Båten til spiller 1 har samme farge som bilen.

| Løp | Vanskelighet | Bøyer | Mål |
|---|---|---|---|
| Rundt Tromøya | Lett | 7 i en stor runde rundt øya | Marinaen |
| Skilsø-løpet | Middels | 4 på kryss og tvers | Brygga på Skilsø |
| Vulkanløpet | Vanskelig (låses opp når du har fullført et annet båtløp) | 6 rundt Hisøya, mens vulkanen kaster lavabomber | Marinaen |

Rund bøyene i rekkefølge (lyssøylen og kompasset viser neste) og fortøy ved brygga. Du må sakke farten der, ellers får du ikke lagt til. Turbotønnene gir fart. Piratskutene skyter på alt som beveger seg, og blir du truffet, spinner båten rundt. I Lett-modus er det færre pirater, og de sikter dårligere. Et sted ute i skjærgården ligger en skattekiste (50 ⚙, én gang).

| Taster | En spiller | To spillere |
|---|---|---|
| Gass, brems/revers, sving | WASD eller piltastene | Spiller 1: WASD. Spiller 2: piltastene |
| Pause | Esc eller P | Esc eller P |

På mobil og nettbrett har hver spiller sine egne knapper: sving nede til venstre, gass og brems nede til høyre i sin del av skjermen. En håndkontroll per spiller virker også.

Muttere: 5 per bøye, 3 per turbotønne, 20 for å fortøye, 15 hvis du aldri ble truffet, 60 første gang i mål i et løp og 20 for ny rekord (25 for å vinne mot andre). Beste tid og stjerner lagres per løp i `best['verden/baat/…']`. `par` i `data/boats.js` sier hvor fort du må være for tre og to stjerner.

**Banefelt:** `marina:{at:[x,z],dir,out}` bygger marinaen (`c.marina` i `js/core.js`) før `build(c)`, på samme måte som `village`. `dir` (grader) peker ut mot sjøen, og standard er rett ut fra øyas midtpunkt. `out` er veien inn på øya. Banens egen vei fra resten av øya må ende der marinaveien begynner. Testen kjører den veien inn på den blå ruta.

**Havet og løpene (`data/boats.js`):** Øyene ligger der de ligger på skjærgårdskartet (`pos` i `data/archipelago.js` ganger `SEA.span`), og Skilsø ligger i `SEA.extra`. Et løp har `buoys:[[x,z],…]` (nord er −z), `finish:'marina'` eller `'skilso'`, `pirates`, `par:[tre stjerner, to stjerner]`, eventuelt `needs:{races:1}` og `lava:true`. Kjør `node tools/test-boats.js` etter endringer: den sjekker at bøyene og etappene holder avstand til øyene og lar en autopilot kjøre hvert løp, uten pirater og med pirater fem ganger.

## Flyplassen og flyturene

Øst på Trinnvik ligger Trinnvik lufthavn, på en fylling ut i sjøen. Der er det rullebane nord–sør med kantlys, terminal, tårn, hangar og vindpose, og et småfly i samme farge som bilen. Flyplassveien går fra enden av Promenaden langs stranda. Kjør inn på den blå ruta ved flyet, så kommer spørsmålet «Vil du fly?». JA: bilen blir stående, og flyet står klart på rullebanen ute i skjærgården. Det er det samme havet, de samme øyene og den samme skalaen som i båtløpet.

| Tur | Vanskelighet | Ringer |
|---|---|---|
| Fly fritt | – | Ingen. Fly dit du vil og land når du er ferdig. |
| Rundt Trinnvik | Lett | 7 i en runde rundt byøya |
| Over Tromøya | Middels | 9, nordover rundt snøfjellet og hjem |
| Vulkanflyget | Vanskelig (låses opp når du har fullført en annen tur) | 10, helt nord til Hisøya og hjem forbi Skilsø |

| Taster | På bakken | I lufta |
|---|---|---|
| W eller ↑ | Gass (hold, så letter flyet) | Stig |
| S eller ↓ | Brems | Synk |
| A/D eller ←/→ | Styr | Sving (flyet krenger) |
| Mellomrom | – | Full fart |
| Pause | Esc eller P | Esc eller P |

På mobil og nettbrett er det sving nede til venstre og stig, synk og full fart (⚡) nede til høyre. Lander du rolig med vingene vannrett, ruller flyet videre, og du kan ta av igjen. Treffer du sjøen eller en øy, starter du på nytt ved siste ring (eller på rullebanen). Bakken under flyet finnes ved å sende en stråle rett ned gjennom øyene, så husene og fjellene er like harde som de ser ut.

Muttere: 5 per ring, 20 for å komme i mål, 15 uten krasj, 60 første gang og 20 for ny rekord. Beste tid lagres i `best['trinnvik/fly/…']`.

**Banefelt:** Flyplassen bygges i `build(c)` i `data/levels/07-trinnvik.js`, som setter `c.airportDef` (den blå ruta, flyet, vindposen og veien dit). `landExtra(x,z)` på banen (0–1) sier hvor det er fylt ut land utenfor kysten, så sjøen ikke tar det. Testen kjører flyplassveien inn på den blå ruta.

**Havet og turene (`data/flights.js`):** `AIRPORT` er flyplassen sett fra sjøen, målt fra midten av Trinnvik. En tur har `rings:[[x,høyde,z],…]` (nord er −z), `par:[tre stjerner, to stjerner]` og eventuelt `needs:{flights:1}`. Kjør `node tools/test-flights.js` etter endringer. Den sjekker at ringene og etappene holder høyde over øyene, lar en autopilot fly hver tur, og lander på rullebanen.

## Planter og dyr (`data/vegetasjon.js`, `data/dyr.js`)

Hver plante og hvert dyr er en oppføring `PROPS.navn={navn,info,params,place,build}`. Prefikset i navnet forteller miljøet: `jungel_*`, `subtrop_*` og `arktis_*`.

| Navn | Hva |
|---|---|
| `jungel_kapok`, `jungel_banan`, `jungel_bregnetre` | Kapoktre med lianer, bananplante, bregnetre |
| `jungel_jaguar`, `jungel_tukan`, `jungel_giftfrosk`, `jungel_dovendyr` | Jaguar, tukan på stubbe, pilgiftfrosk på blad, dovendyr på stativ |
| `subtrop_palme`, `subtrop_oliven`, `subtrop_sypress`, `subtrop_agave` | Kokospalme, oliventre, sypress, agave |
| `subtrop_flamingo`, `subtrop_skilpadde`, `subtrop_perleogle` | Flamingo, landskilpadde, perleøgle på stein |
| `arktis_dvergbjork`, `arktis_gran`, `arktis_myrull` | Dvergbjørk, snøgran, myrull (dvergbjørk og myrull har ingen kollider) |
| `arktis_isbjorn`, `arktis_snougle`, `arktis_fjellrev` | Isbjørn med unge, snøugle på snøhaug, fjellrev |

Verktøy i `build(c)`:

| Verktøy | Betydning |
|---|---|
| `c.plant(navn,x,z,{s,retning,…})` | Én plante eller ett dyr. Parametrene står i `params` i oppføringen; det du ikke gir, får standardverdien. Dyr uten `retning` ser en tilfeldig vei. |
| `c.sow(navn,n,[x,z],radius,{r,gap,ok,p})` | Opptil `n` på tilfeldige ledige steder innenfor `radius`. `r` er fotavtrykket, `gap` avstanden mellom dem, `ok(x,z)` en ekstra test, `p` parametrene (et objekt, eller en funksjon av tilfeldighetsgeneratoren, f.eks. `R=>({s:.8+R()*.4})`). |
| `c.plantOK(x,z,r)` | Sant hvis stedet er ledig: på land, ikke i vann, minst 3 fra løyper og veier, ikke ved porter, start, blokkerte områder eller andre kollidere. |

Plantene og dyrene plasseres (kollidere) med en gang, men tegnes etter `build(c)`, når terrenget er ferdig. De bruker sin egen tilfeldighetsgenerator, så resten av banen blir lik selv om du legger til flere. Bykkevika har de subtropiske, jungelen på Tromøya de tropiske og Gautefall de arktiske.

Ny plante eller nytt dyr: kopier en oppføring. `place(x,z,o,env)` leser parametrene med `propParams` og legger til kollidere i `env.colliders`; `build(t,env,out)` tegner med `out.add(geometri,materiale,{x,y,z,sx,sy,sz,c})`. Geometrier: `PG.blob` (kule, sx/sy/sz er halvakser), `PG.trunk` og `DG.branch`. Hjelpere: `stemBetween(a,b,r,{c})` (gren fra a til b; med `PG.blob` blir det en avlang kule mellom punktene), `footY`, `shade`, `dirVec`, og `DYR.*` i `data/dyr.js` for kropper, øyne og buer. Sitteplasser for fugler legges i `env.perches`.

## Kjør sammen (flerspiller)

`js/net.js` lar opptil fire spillere kjøre sammen i skjærgården. Én lager et rom og får en kode som `KRABBE-42`, de andre skriver inn koden. Hver spiller kjører sin egen bil med den vanlige fysikken. Bare bilens posisjon, rotasjon, hjul, styring og lys sendes, 15 ganger i sekundet, og de andre bilene tegnes 0,12 sekunder bak slik at de glir jevnt. Bilene kolliderer ikke, og muttere, løyper og gullmuttere er personlige.

- **Kobling:** [PeerJS](https://peerjs.com) lastes fra jsDelivr først når noen trykker «Lag rom» eller «Bli med». Verten registrerer romkoden hos den gratis PeerJS-tjenesten, og gjestene kobler seg direkte til verten med WebRTC. Verten sender meldingene videre til de andre. Ingen egen server trengs, så det virker fra GitHub Pages.
- **Lokal test:** Kryss av for «Lokal test» i dialogen, eller åpne siden med `?local`. Da kobles faner i samme nettleser med `BroadcastChannel`, uten nett, men med nøyaktig samme romlogikk. Åpne to faner, lag rom i den ene og bli med i den andre.
- **Mellom øyene:** Du ser bare biler på samme øy. Øykartet og minikartet viser vennene som prikker i deres farge, og skjærgårdskartet viser hvilken øy de er på. I pausemenyen kan du ta fergen rett til øya der en venn er (5 muttere). Når en venn reiser fra eller kommer til øya di, seiler fergen med dem.
- **Båtløp:** Den som står i båtmenyen ved marinaen, kan invitere rommet. De andre får spørsmålet der de kjører, og blir med i lobbyen. Lederen velger løp og starter for alle. Alle styrer sin egen båt og ser de andres, og resultatlista fylles ut etter hvert som båtene fortøyer. Piratene skyter bare på båten på sin egen skjerm.
- **Båter og fly:** Alle som er ute på sjøen, sender hvor de er (meldingen `Bv`, 10 ganger i sekundet). Den som flyr, ser båtene til de andre, og den som kjører båt, ser flyene, med navneskilt over. Begge vises også på minikartet.
- **Brudd:** En gjest som mister verten prøver å koble seg til igjen fem ganger. Forlater verten rommet, får gjestene beskjed og kjører videre alene. Det er ingen ny vert når verten går.

Strenge nettverk, som enkelte skole- og jobbnett, kan blokkere direkte kobling mellom nettlesere. Da får man en melding om at koblingen ikke fikk kontakt.

## Justere garasjen

`data/parts.js` har navn, priser og beskrivelser. Selve effektene (hvor mye mer grep klatredekk gir, og så videre) ligger i funksjonen `tuneFrom` nederst i `js/core.js`, i små tabeller med fire verdier (nivå 0–3).

## Publisere på GitHub Pages

1. Lag et nytt repository på GitHub og last opp hele mappa.
2. Settings → Pages → Build and deployment → Source: «GitHub Actions». Oppskriften `.github/workflows/pages.yml` publiserer spillet hver gang `main` oppdateres. (Alternativt «Deploy from a branch», branch `main`, mappe `/ (root)`.)
3. Etter et par minutter ligger spillet på `https://<brukernavn>.github.io/<repo>/`. Fanen Actions viser om publiseringen gikk bra.

Hver gang du laster opp en oppdatering: **øk `VERSION` i `sw.js`** (for eksempel `v1` → `v2`). Ellers kan spillere som har besøkt siden før få den gamle versjonen fra hurtiglageret.

## Publisere på Google Play

Spillet er en PWA. Bruk [PWABuilder](https://www.pwabuilder.com): lim inn adressen fra GitHub Pages, velg Android, og last ned pakken. Legg `assetlinks.json` fra PWABuilder i mappa `.well-known/` i dette repositoriet. Se `PRIVACY.md` for personvernerklæringen Google Play krever.

## Lisens

Koden er MIT-lisensiert (se `LICENSE`). Skriftene Barlow Condensed og Saira Stencil One er under SIL Open Font License. three.js er MIT.
