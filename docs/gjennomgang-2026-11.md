# Gjennomgang av TromøyBil, november 2026

Seks uavhengige granskere gikk gjennom spillet (commit 3720891, det som ligger på Pages) med Node-sveip over hele verdensdataene,
Playwright-kjøringer i nettleseren og skjermbilder: vegetasjon, hus/veier/terreng, ytelse, spillflyt/UI, kjøring/fysikk/kamera og
øyene/aktivitetene/dyrene. Del 1 er planen; del 2 er alle funnene slik granskerne leverte dem (tall, steder, bevis og forslag).

## Del 1: Planen

Rekkefølgen er valgt etter hva spilleren merker mest per time arbeid. Hver fase avsluttes med tester (Node-sveip og Playwright) og
skjermbilder før/etter, og publiseres på Pages for seg.

### Fase A: De store, raske gevinstene (trær i veien, spillstopperne, det verste lagget)
1. **Bakgrunnskysten strør trær over Tromøya** (VEG-1, blokkerende). Kystøya («backdrop», 40 m rutenett) legger ≈2,5 millioner
   ekstra trær oppå Tromøyas egne 1,86 millioner: ≈75 000 på veibanen, ≈55 000 inne i hus, 60 % svever eller er begravd, og de kan
   kjøres gjennom. Dette er trærne du ser midt i veien. Fiks: arbeidertråden hopper over bakgrunnstrær der en ekte øy dekker punktet.
   Gir også 2,3 × færre trær å tegne på Tromøya.
2. **Trær som forsvinner i hele 256 m-blokker** (VEG-2 + Y1-lett). Nær/fjern-byttet måles til flissenteret; på Lav er 36 % av
   posisjonene uten trær, og Lav har ingen fjerntrær. Fiks: mål til flisens nærmeste kant, Lav får plakattrær til 1200 m.
3. **Spillstopperne i flyten** (UI-01, UI-02, UI-03, UI-05, UI-07, UI-08): verkstedet åpnet fra tilbudet + «Tilbake» låser spillet;
   «Lukk» på kartet åpner innstillinger i evig løkke; «Avbryt løpet» blir stående; bilen triller førerløst 34 m mens resultatskjermen
   er oppe; ferjetilbudet åpner kartet uten pause; tilbudslinjen henger under overfarten.
4. **Usynlig vegg der en bru krysser en vei** (K1, blokkerende): Bendiksklev og Trommestadveien kaster bilen 14 m opp. Fiks:
   `height()` bruker den nedre veiens profil når punktet ligger i dens bane.
5. **Standard grafikk og automatisk nedtrapping** (Y7, Y2, Y3): skrivebord starter i dag på «Høy» (3 skyggekaskader 2048², 4× MSAA,
   opptil 2× pikseltetthet). Fiks: start på «Middels», mål bildetid de første sekundene og trapp opp/ned automatisk (med beskjed);
   pikseltetthet begrenses per nivå (1/1/1,25/1,5); PCF i stedet for PCFSoft unntatt Ultra; skygger bare fra trær innen 150 m og
   terreng ≤ 64 m; vannkopiene i halv oppløsning.
6. **Dyrenes hakking** (Y5): 11–63 ms-hakk når dyr settes ut. Fiks: budsjett på 1 ms per bilde, fylling fordelt over 20 bilder.

### Fase B: Husene og bruene
1. **Tak og kollidere fra selve fotavtrykket** (HVT-02 + K2): 1135 hus på Tromøya har kassetak og usynlige vegger opptil 8 m
   utenfor veggene, 139 bokser rekker ut i veien (220 inkl. Arendal, 90 helt over veien). Fiks: rettvinklede fotavtrykk deles i
   rektangler med eget saltak hver; kolliderne blir de samme rektanglene (også i kameraets `blocked()`).
2. **Hus på stolper i skråninger** (HVT-03): 829 hus med grunnmur over 3 m, opptil 9,6 m. Fiks: terrassert sokkel (grunnmur maks
   ≈1,5 m over laveste hjørne) og tomta planeres inne i fotavtrykket med 2 m overgang.
3. **Veiens skjæring/fylling under husene** (HVT-04): blokkene i Trinnvik svever 1,6–3 m. Fiks: ingen skjæring/fylling inne i
   fotavtrykk, utfasing over 3 m fra veggen.
4. **Bruene på Tromøya** (HVT-01): alle er terrengvoller uten pilarer og rekkverk; Tromøybrua er en 38 m steinmur. Fiks: bakken
   under alle bruer, og bjelker/pilarer/rekkverk tegnes på alle øyer.
5. **Småfeil i husene**: vinduer på garasjer/uthus/naust og dører mangler (HVT-05), kirker og store låver får flatt tak (HVT-12),
   garasje i tjern og hus i sjøkanten (HVT-14), hus i veien på Gautefall/Kaimanøya (HVT-13), lodgene tegnes svarte (I11).

### Fase C: Ytelse i dybden
1. **Treenes detaljnivå per tre, ikke per flis** (Y1, Y12): fulle trær til 60/90/130/180 m, 2-korts stedfortreder til 200–400 m,
   plakater bortenfor; lettere grangeometri; 128 m delfliser; forhåndsbygde nærgrupper så flisbyttet ikke hakker.
2. **Strømming uavhengig av bildefrekvens** (Y4): arbeidertråden fylles på fra svarene, ikke bare per tegnet bilde; ferdige
   barnebiter tegnes selv om søsken mangler. Fjerner den beige verdenen etter ferje/teleport.
3. **Fysikk som ikke spiraler** (Y6): adaptiv takt (200 Hz når bildetiden er over 1/30 s), maks 20 steg, dt-tak 0,05 s, gjenbruk av
   kollider-objekter (0 søppel per steg).
4. **Mindre jobb per bilde**: plakattynning bortenfor 1–2 km (Y9), tak på bygnings-/veifliser og sammenslåing av fjerne fliser (Y11),
   minikart og speedometer tegnes bare ved endring (Y13), skyggeskift uten full omkompilering (Y10), raskere innlasting av teksturer
   (Y14).

### Fase D: Øyene, kjøringen og kameraene
1. **Veinettet på øyene henger sammen** (I1): 7 % av Kaimanøya og 29 % av Løveøya nås fra ferja i dag; leirenes veier stopper
   48–96 m før leiren. Fiks i byggeverktøyet; test som krever én komponent per øy.
2. **Skilt ut av veibanen** (I2), stedsnavn og kart på øyene (I3, I4: flyplass og skisenter på kartet, marina uten båter vekk),
   trær på Trinnviks blandingsskog (I5), fosser og bekker uten trær i (I6), skisenterets lodge og vei (I7), isløypa kjører på is (I8),
   dyr på Hisøya (I9), lavaelva ved brua (I10).
3. **Kjøring**: verdens kant med stup og «Tilbake på veien» som ikke virker (K3), rett frontkollisjon som spinner bilen (K4),
   «Tilbake på veien» som velger stier 2 km unna (K9), hus-kollider i nabocellen (K8), bil på siden (K12), revers/kløtsj (K13).
4. **Kameraer**: TV-kameraet i hus/trær/under vann (K5), menykameraet under bakken (K6), panserkameraet uten panser (K7), trær i
   `blocked()` (K11).

### Fase E: Finpuss som løfter utseendet
1. **Skogen** (VEG-7, VEG-8, VEG-9, VEG-10): Sørlandsblanding (furu på knausene, eik/bjørk i liene, ikke 43 % gran), tettere
   furukrone (ikke «palmer»), tre varianter per art, jungelblader i riktig skala.
2. **Trær i hus og på fotballbaner** (VEG-3, VEG-4): kroneavhengig avstand til vegger (25 % av husene har trær i dag), ingen
   trær på baner/løpebaner; steiner som ligger an mot bakken (VEG-5), siv bare ved vann (VEG-6), minst 1,5 m over havet (VEG-12).
3. **Terreng og veier** (HVT-06 … HVT-11): veier som klemmes til 2,4 m av hus, kryss uten dobbel ribbe, terreng som stikker opp i
   veien på 70–560 m, fjern kyst som beige flate, Trinnviks asfaltbakke, rullebanens strukne tekstur.
4. **Tekster og småting** (UI-04, UI-06, UI-09 … UI-12, K10): berøringsknapper over minikartet, marinamarkøren i sjøen, tusenskille,
   lastelinjen, døde taster, navn.

### Verifisering og publisering
- Nye tester som fanger dette for godt: `tools/test-world.mjs` (trær i hus/vei/vann og bakgrunnslekkasje, hus-kollidere over vei,
  bru over vei, veinett per øy, skilt i vei, stedsnavn), `tools/test-ui.mjs` (Playwright: verksted-fra-tilbud, kart-løkke, avbryt,
  resultat-trilling), og et ytelsesbudsjett (tegnekall/trekanter per nivå ved start, med terskler).
- Faste skjermbildepunkter før/etter hver fase (Revesand, Skareveien, Bendiksklev, Trinnvik sentrum, Gautefall, Kaimanøya).
- Hver fase går som egen PR til `main`; publiseringen lager `sw.js` selv, så spillerne får den nye versjonen.

## Del 2: Funnene

Slik granskerne leverte dem (fire av seks skrev på engelsk). Alvorlighet: blocker > major > minor > cosmetic; innsats S/M/L.
«Etterprøvd» betyr at en uavhengig gransker har gjentatt målingen.
