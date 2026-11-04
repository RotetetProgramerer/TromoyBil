# TromøyBil

En bilsimulator i nettleseren, i ekte størrelse, på den ekte Tromøya utenfor Arendal. Terrenget, veiene, husene, skogen, vannene
og kysten er bygget fra åpne kartdata. Ut i skjærgården ligger øyene fra det gamle spillet, nå i full størrelse: by, ørken, savanne,
jungel, vulkan og fjell med skianlegg. Ferja går mellom øyene.

**Spill:** <https://rotetetprogramerer.github.io/TromoyBil/>

Det opprinnelige RC-spillet i skala 1:24 ligger fortsatt i [`klassisk.html`](klassisk.html) (se [docs/klassisk.md](docs/klassisk.md)).

## Hva du kan gjøre

- **Kjøre** sju biler, fra en liten terrengbil til monstertruck og sportsbil, med ekte fysikk: fjæring, dekk med glidning og grep på
  hvert underlag, motor med dreiemomentkurve og turbo, kløtsj, automat eller manuelt gir, lavserie, differensialer og sperrer,
  ABS, antispinn og antiskrens (i «Lett»; skru dem av med «Ekte»).
- **Løyper** langs de ekte veiene på Tromøya og på øyene, med tid, mellomtider, stjerner og muttere.
- **Verkstedet** på Tromøya: kjøp biler, motor, fjæring, girkasse, dekk og lakk.
- **Ferja** mellom kaiene, **båt** fra marinaen, **fly** fra flyplassen på Trinnvik og **ski** i Gautefall.
- **Kartet** (M): trykk på et sted på øya eller i skjærgården, så «Sett bilen der», og bilen står på nærmeste vei der.
- **Kjør sammen** med venner (opptil fire, rett mellom nettleserne).
- Dag, kveld og natt (gatelys og frontlys), sol, skyer, regn, tåke og snø.

## Kontroller

| | Tastatur | Håndkontroll / ratt |
|---|---|---|
| Gass, brems/revers, styring | Piltaster eller WASD | Høyre/venstre trigger (pedaler), venstre spak (ratt) |
| Håndbrekk | Mellomrom | A |
| Gir opp/ned (manuelt) | E / Q | RB / LB |
| Lavserie | G | D-pad opp |
| Kamera, lys, horn | C, L, H | Y, X |
| Kart, sett på veien, pause | M, R, Esc | Back, B, Start |
| Blinklys, nødblink | `,` `.` `-` | |

På mobil og nettbrett er det knapper på skjermen, eller du kan styre ved å vippe telefonen (Innstillinger).

## Kjøre lokalt

Spillet bruker ES-moduler og må serveres over http (ikke fra fil):

```
python3 -m http.server 8000      # så http://localhost:8000/
```

Nyttige adresser: `index.html?q=lav|middels|hoy|ultra` (grafikk), `&t=21` (klokka), `&play` (rett ut og kjør),
`&x=-3770&z=3921` (start et sted, meter fra midten av Tromøya), `&act=boat|plane|ski` (rett til en aktivitet).

## Grafikk

Fire nivåer (`QUALITY` i `sim/render/gfx.js`): **Lav** uten skygger og med 0,75 × oppløsning, **Middels** med to skyggekaskader
(1024², til 400 m), **Høy** med tre (1536², til 900 m) og 2 × kantutjevning, **Ultra** med fire (2048², myke skygger) og 4 ×.
Pikseltettheten begrenses per nivå (1 / 1 / 1,25 / 1,5), så en 2 ×-skjerm tegnes i 1 × på Lav og Middels. Spillet starter på
Middels (Lav på mobil og nettbrett) og måler bildetiden mens du kjører (`sim/render/autoq.js`): ligger den over 28 ms i fire
sekunder, settes grafikken ett nivå ned med en beskjed; ligger den under 9 ms i tolv sekunder, settes den ett nivå opp (aldri over
Høy, og aldri etter et nedtrinn, heller ikke ved neste besøk). Et jevnt bilde under 36 ms regnes som skjermens egen takt (30 Hz,
strømsparing) og ikke som hakking. Velger du et nivå selv i Innstillinger, blir det stående. Vannet leser en kopi av bildet i halv
oppløsning og en av dybden i full, og kopiene lages bare når noe vann kan sees (en okklusjonsspørring mot en flate like over sjøen
og vannene; nær vannflaten tegnes vannet alltid).

## Mappestruktur

```
index.html              Spillet (meny, HUD og alle skjermbilder)
klassisk.html           Det gamle RC-spillet (js/, css/, data/ hører til det)
sim/
  main.js               Starter alt: grafikk, verden, arbeidertråden, spillet og bildeløkka
  game.js               Spillet: bilen, modusene, verkstedet, ferja, lagring, innstillinger
  ui.js, style.css      Menyer, HUD, fartsmåler, minikart og kart
  input.js, camera.js   Tastatur/håndkontroll/ratt/berøring og kameraene
  courses.js, route.js  Løypene og rutingen langs veinettet
  physics/              Fysikken i SI-enheter: vehicle.js (bil), boat.js (båt), plane.js (fly), surfaces.js (underlag og dekk)
  data/                 Biler, deler, båter, fly, øyene i verden og Tromøyas steder og løyper
  world/                Verdensmotoren: rutenett, øyer, veinett, plantevekst og biomer
  render/               Grafikken: terreng (LOD), veier, hus, skog, vann, himmel og skyer, regn, gatelys, bilmodellen, steder
  activities/           Båt, fly og ski (aktivitetene som tar over fra bilen, se activity.js)
  life/                 Dyrene
  net/                  Flerspiller
  audio/                All lyd, laget med WebAudio (motorer, dekk, vind, natur)
world/<øy>/             Data per øy: terrain.bin.gz (høyder), cover.bin.gz (arealdekke), features.json.gz (veier, hus, vann …)
assets/tex/             Teksturer (laget av tools/textures/make_textures.py)
assets/cars/            Bilmodellene (glb, laget av tools/build-cars.mjs)
vendor/three/           three.js r170 og tilleggene som brukes
tools/                  Byggeverktøy og tester (under)
```

## Verktøy

| Kommando | Hva den gjør |
|---|---|
| `python3 tools/geo/build_tromoya.py <geo> world` | Bygger Tromøya fra høydedata og kartdata (se toppen av fila for hvordan dataene hentes) |
| `python3 tools/geo/build_backdrop.py` | Kysten rundt (48 × 48 km, grovere) |
| `node tools/geo/build_islands.mjs` | Bygger de oppdiktede øyene fra de gamle banene |
| `python3 tools/textures/make_textures.py 1024 [navn …]` | Lager teksturene |
| `node tools/build-cars.mjs` | Lager bilmodellene; `tools/preview-cars.html` viser dem |
| `node tools/test-vehicle.mjs [bil]` | Måler bilene: 0–100, toppfart, bremselengde, sidegrep, klatring |
| `node tools/test-courses.mjs`, `node tools/test-islands.mjs` | Autopilot som kjører løypene |
| `node tools/test-boat.mjs`, `node tools/test-plane.mjs` | Måler båtene og flyene mot ekte tall |
| `node tools/make-sw.mjs` | Lager `sw.js` på nytt (publiseringen gjør det selv med commit-hashen som versjon; kjør den bare når lista over filer har endret seg) |

## Publisering

`.github/workflows/pages.yml` publiserer repoet på GitHub Pages hver gang `main` oppdateres. Det må slås på én gang: Settings → Pages →
Build and deployment → Source: «GitHub Actions» (eller «Deploy from a branch», `main` og `/ (root)`; `.nojekyll` gjør at filene
serveres som de er).

## Kartdata og lisenser

- Høydedata: © Kartverket (CC BY 4.0), via AWS Terrain Tiles (Mapzen).
- Veier, bygninger, arealdekke, vann og stedsnavn: © OpenStreetMap-bidragsytere (ODbL), via Overture Maps Foundation.
- three.js: MIT (`vendor/three/LICENSE`).
- Spillet: se [LICENSE](LICENSE).
