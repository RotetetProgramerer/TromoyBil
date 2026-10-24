# Sandglow Crawl

Et 3D-spill i nettleseren der du kjører en RC-crawler i skala 1:24 gjennom porter, gjørme og vadesteder, tjener muttere og bygger bilen i garasjen. Ingen byggeverktøy: last opp mappa, og spillet kjører.

## Mappestruktur

```
index.html            Siden som laster alt. Her står rekkefølgen på skriptene.
css/style.css         Alt utseende (meny, HUD, garasje).
js/core.js            Motoren: terreng, baneverktøy, bilfysikk. Trenger du sjelden å røre.
js/game.js            Spillet: grafikk, kamera, lyd, meny, garasje, poeng.
data/cars.js          Bilene.                 ← legg til nye biler her
data/levels/NN-id.js  Én fil per bane.         ← legg til nye baner her
data/parts.js         Garasjedeler og lakkfarger.
tools/test-levels.js  Autopilot som tester alle baner uten nettleser.
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

Bilen dukker opp i menyen med en gang.

## Legge til en ny bane

1. Kopier `data/levels/01-sand.js` til `data/levels/06-minbane.js` (tallet styrer rekkefølgen i menyen).
2. Legg til én linje i `index.html` under de andre banene:
   ```html
   <script src="data/levels/06-minbane.js"></script>
   ```
3. Endre feltene. De viktigste:

| Felt | Betydning |
|---|---|
| `id` | Unik nøkkel. Brukes for rekorder og «første gang i mål». |
| `name`, `desc`, `diff` | Navn, beskrivelse og vanskelighet 1–3 i menyen. |
| `seed` | Et heltall. Bytt tall, og steinene legger seg annerledes. |
| `gates` | Antall porter (10 er standard). |
| `path` | Listen med `[x, z]`-punkter som løypa går gjennom. Verden er 70 × 70 enheter, fra −35 til 35. Hold deg innenfor ±28. |
| `base(x,z,n)` | Funksjon som gir terrenghøyden. `n` er en støyfunksjon. Start med å kopiere en eksisterende. |
| `surf(x,z)` | Underlag per punkt: `S.SAND`, `S.GRAVEL`, `S.GRASS`, `S.DIRT`, `S.MUD`, `S.BOG`, `S.ROCK`, `S.WOOD`. Styrer grep og farge. |
| `sky`, `fog`, `sun`, `hemi`, `sunDir` | Lys og himmel. |
| `water` | Globalt vannivå (valgfritt). Alt terreng under dette blir vann. |
| `rain: true` | Regn. `clouds:false` fjerner skyer og sol. |
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
```

4. Kjør testen:

```
node tools/test-levels.js minbane
```

Autopiloten kjører banen i begge gir. Du vil se `prog 0.99` (kom i mål), `drown 0` (ingen druknet motor på selve løypa) og helst under 5 velt. Står den fast («fast» høyt) eller drukner, er noe i veien plassert feil.

## Justere garasjen

`data/parts.js` har navn, priser og beskrivelser. Selve effektene (hvor mye mer grep klatredekk gir, og så videre) ligger i funksjonen `tuneFrom` nederst i `js/core.js`, i små tabeller med fire verdier (nivå 0–3).

## Publisere på GitHub Pages

1. Lag et nytt repository på GitHub og last opp hele mappa.
2. Settings → Pages → Source: «Deploy from a branch», branch `main`, mappe `/ (root)`.
3. Etter et par minutter ligger spillet på `https://<brukernavn>.github.io/<repo>/`.

Hver gang du laster opp en oppdatering: **øk `VERSION` i `sw.js`** (for eksempel `v1` → `v2`). Ellers kan spillere som har besøkt siden før få den gamle versjonen fra hurtiglageret.

## Publisere på Google Play

Spillet er en PWA. Bruk [PWABuilder](https://www.pwabuilder.com): lim inn adressen fra GitHub Pages, velg Android, og last ned pakken. Legg `assetlinks.json` fra PWABuilder i mappa `.well-known/` i dette repositoriet. Se `PRIVACY.md` for personvernerklæringen Google Play krever.

## Lisens

Koden er MIT-lisensiert (se `LICENSE`). Skriftene Barlow Condensed og Saira Stencil One er under SIL Open Font License. three.js er MIT.
