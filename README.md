# Lead-ontdubbelaar

Ontdubbelt leadlijsten (CSV en Excel) volledig lokaal in de browser. Het eindproduct is één bestand,
`dist/Lead-ontdubbelaar.html`, dat op elke Windows-pc in Edge of Chrome opent zonder installatie,
internet of beheerdersrechten. De Excel-bibliotheek SheetJS zit erin ingebakken.

Open **[index.html](index.html)** in de hoofdmap om de tool meteen te gebruiken. Dit is een zelfstandige,
byte-identieke kopie van de productie-HTML; `dist/` en de bronbestanden zijn daarvoor niet nodig.
Elke productiebuild werkt beide bestanden bij. Bewerk de bestanden onder `src/` en bouw opnieuw;
bewerk de gegenereerde `index.html` niet rechtstreeks. De ontwikkelbuild laat `index.html` ongewijzigd.

## GitHub Pages

De tool werkt ook via GitHub Pages, zonder backend of installatie. Zet de gebouwde `index.html` en
`.nojekyll` in de hoofdmap van de te publiceren branch. Kies op GitHub bij **Settings → Pages →
Deploy from a branch** die branch en **/ (root)**. `.nojekyll` laat GitHub de HTML rechtstreeks publiceren.
Bij updates bouw je opnieuw en neem je de bijgewerkte `index.html` mee in je commit en push.
Zie de [GitHub Pages-instructies](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Alleen het openen van de website heeft internet nodig. Bestanden inlezen, vergelijken en downloaden gebeurt
in de browser; de productie-CSP blijft netwerkverbindingen vanuit de tool verbieden. Voor gegarandeerd
offline openen bewaar je `index.html` of `dist/Lead-ontdubbelaar.html` als lokaal bestand.
De sessie blijft in dezelfde browser en op hetzelfde adres bewaard; gebruik telkens dezelfde URL.
Een lokale sessie verhuist niet automatisch naar de website en wordt niet met andere gebruikers gedeeld.
Publiceer alleen de toepassing, nooit `testdata/`, private beoordelingen of resultaatbestanden.

De gebruikershandleiding staat in [docs/Handleiding.md](docs/Handleiding.md).

De afronding van de codescan van 18 oktober, met actuele integratiecontroles en releaseblokkades,
staat in [docs/Codescan-afronding-2026-10-18.md](docs/Codescan-afronding-2026-10-18.md).
Het aansluitende [prestatieherstel](docs/Prestatieherstel-codescan-2026-10-18.md) brengt alle 54 metingen
binnen de ongewijzigde budgetten. De private beoordelingen en Windows-acceptatie blijven vereist.

De huidige werksessie wordt automatisch lokaal bewaard. Verversen of hetzelfde bestand heropenen in dezelfde
browser herstelt lijsten, kolomkoppelingen, beoordelingen, uitgestelde paren en schermkeuzes. **Nieuwe sessie**
wist na bevestiging deze voortgang; bronprofielen blijven behouden. Er is geen server of sessiearchief.

## Voor de ontwikkelaar

Gebruik **Node.js 24.19.0 LTS**, vastgelegd in `.node-version`, `.nvmrc` en `package.json`.
De centrale controle weigert een andere versie. De gebruiker van het HTML-bestand heeft Node niet nodig.
Voor de gerichte browsercontrole gebruiken we **pnpm 11.25.0** en **Playwright 1.62.1**;
`pnpm-lock.yaml` legt ook de indirecte afhankelijkheden vast. Er zijn geen productieafhankelijkheden om te installeren.

```bash
node tools/check.mjs            # centrale publieke controle: synthetische tests, reproduceerbare builds, offline bestandscontract
node tools/check.mjs --tests    # alleen de synthetische tests (expliciet test/*.test.mjs)
node build.mjs                  # productie-HTML; builddatum van vandaag
node build.mjs --dev            # aparte testbuild met connect-src 'self'
node tools/clean.mjs --dry-run  # toon hoeveel herkenbare testuitvoer kan worden opgeruimd
node tools/clean.mjs            # ruim die testuitvoer en verlaten harnesswerkmappen op
```

Met pnpm zijn dezelfde opdrachten beschikbaar als `pnpm check`, `pnpm test` en `pnpm build`.
Een verse checkout kan de centrale controle zonder installatie van pakketten en zonder `testdata/` uitvoeren.
Alle fixtures zijn synthetisch. De gedeelde bronbuilder, BTW-generator, vaste random-seeds en
invarianten staan onder `test/helpers/`; browserlijsten onder `test/fixtures/`.

Eenmalig voor de browsercontrole (installeer pnpm 11.25.0, bijvoorbeeld met `npm install -g pnpm@11.25.0`):

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check:browser
```

De browsercontrole bouwt zelf de productie-HTML en opent die via `file://`. Zij controleert de fixes voor
gegevensbehoud, herimport, groepsbeslissingen, BTW-conflicten, 401 gelijke rijen, constante contactkolommen,
postcodevergelijking, profielherstel en contactnormalisatie, de werkelijk gedownloade XLSX,
tekstinjectie en een actieve CSP-netwerkproef. Dit is een gerichte controle, nog geen brede browsersuite.
De codescancontroles bewaken ook hervatten vanuit Kolommen, uitstelrotatie, focus en scrollpositie,
sneltoetsen, globale foutafhandeling, inleesgrenzen, bestandstypen en de schermlimiet van 300 rijen.
De sessiecontrole gebruikt daarnaast een tijdelijk blijvend browserprofiel: zij sluit de browser volledig,
heropent de sessie en controleert de gedownloade beoordelingen en bronwaarden. Ook verversen, annuleren/wissen,
grote bronopslag, opslagweigering, mislukte transacties, onbekende opslagversies en verouderde tabbladen worden getest.
Voor een lokaal geïnstalleerde Chrome kan `LEAD_BROWSER_CHANNEL=chrome node tools/check-browser.mjs`
worden gebruikt. De gebruikte browserversie staat in `dist/controle/browser-resultaat.json`.

### Automatisch opruimen

Tests, browsercontroles, prestatiemetingen en `bench` gebruiken tijdelijke werkmappen onder
`dist/.harness-tmp/`, beheerd door `tools/harness-temp.mjs`. Downloads, screenshots, traces en andere
proefbestanden verdwijnen na de controle, ook bij fouten, time-outs, Ctrl+C en SIGTERM. Na SIGKILL
of een herstart worden verlaten werkmappen bij de volgende harnessrun of `pnpm clean` opgeruimd.
Een werkmap van een nog lopend proces blijft staan. Nieuwe proefscripts moeten dezelfde helper gebruiken.

De publieke controle stuurt ook de tijdelijke bestanden van tests en subprocessen naar deze werkmap.
Haar ontwikkel-HTML wordt na de buildcontrole verwijderd; `node build.mjs --dev` blijft een expliciete,
afzonderlijke opdracht om die testversie te maken. De productie-HTML blijft beschikbaar.

Prestatie-XLSX-bestanden worden eerst volledig heropend, gecontroleerd en gehasht. Daarna blijven alleen
de JSON-meetrapporten met controlesommen en kwaliteitsuitkomsten bewaard; de ruwe bestanden worden verwijderd.
Bij een mislukte meting blijft een eventueel gedeeltelijk JSON-rapport beschikbaar zonder de run goed te keuren.
De browsercontrole bewaart een compact resultaatrapport, ook bij een fout.

`pnpm clean` is het vangnet voor oudere uitvoer: uitsluitend herkenbare synthetische werkmappen en
schermafbeeldingen, de ontwikkelbuild en verlaten tijdelijke werkmappen. De productie-HTML, onbekende
bestanden, broncode, `testdata/`, gebruikersuitvoer, private beoordelingen, Windows-bewijs, logs en JSON-rapporten
blijven bewaard. Symbolische koppelingen worden niet gevolgd. De opruimregels hebben eigen regressietests.

Op deze Mac staat Node niet op PATH. De huidige gebundelde runtime kan rechtstreeks worden gebruikt:

```bash
/Users/dieter/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tools/check.mjs
```

Voor byte-identieke builds geef je dezelfde `SOURCE_DATE_EPOCH` (Unix-seconden) mee.
De centrale controle gebruikt standaard `1792195200` (17 oktober 2026 UTC), bouwt tweemaal en vergelijkt de bytes.
Zonder deze variabele blijft `node build.mjs` de huidige datum gebruiken.

### Private controles, afzonderlijk uitvoeren

```bash
node tools/run-testdata.mjs                     # pnpm check:private: lokale lijsten en zes gekende gevallen
node tools/run-testdata.mjs --schrijf           # schrijft ook een resultaat naar dist/
node tools/check-quality.mjs                  # pnpm check:quality: vaste synthetische kwaliteitsset
node tools/private/controle-beoordelingen.mjs   # pnpm check:judged: vereist beoordeelde XLSX én datasetmanifest
node tools/testset.mjs --maak testdata --uit dist/kwaliteit/Testset_paren.xlsx  # lege oordelen + vast manifest
```

`testdata/` en `dist/` zijn genegeerd door Git. Private uitvoer kan echte contactgegevens bevatten en hoort
niet in gedeelde rapporten. Ontbrekende privélijsten, ontbrekende gekende bedrijven of een NOK-geval laten
`check:private` falen. CLI en private beoordelingencontrole gebruiken dezelfde evaluator uit `tools/quality.mjs`. Ze vereisen een
vast manifest met testrecord-IDs, checksums van alle bronrijen, verplichte beoordelingsparen en foutgrenzen.
Ontbrekende of gewijzigde brondata, ontbrekende oordelen, ongeldige labels en onbekende paren geven exitcode 1.
Een positief beoordeeld paar zonder kandidaatrelatie dat ook niet via een groep of de controlelijst bereikt wordt,
telt als gemiste kandidaat; de evaluator controleert daarnaast paarscores én uiteindelijke groepen.
De publieke kwaliteitsset heeft 5 synthetische rijen en 10 onafhankelijke
beoordelingen. Dit is regressiebewijs, geen algemene kwaliteitsschatting voor toekomstige leads.

Zie [docs/Kwaliteitscontrole.md](docs/Kwaliteitscontrole.md) voor het maken, beoordelen en uitvoeren van een
private set, de betekenis van alle metingen en de migratie vanaf de oude vingerafdrukbestanden.

## CI en verplichte releasecontrole

De GitHub Actions-workflow `.github/workflows/openbare-controles.yml` voert bij push, pull request en handmatige
start de synthetische tests, invarianten, bestandscontracten, reproduceerbare build, synthetische kwaliteitsset
en productie-browsercontrole uit op Ubuntu met Playwright Chromium. Zij gebruikt de vastgelegde Node-, pnpm-
en Playwright-versies en installeert via de lockfile. Private gegevens, beoordelingen en rapporten worden niet
geopend of geüpload; er zijn geen artefactuploads. De Git-index wordt vooraf op private bestandspaden gecontroleerd.
Deze checkout heeft momenteel geen remote: de workflow is voorbereid, nog niet op een CI-host uitgevoerd.
De GitHub-acties zijn op volledige commit-SHA vastgelegd; Dependabot bewaakt updates voor `github-actions`.

```bash
node tools/prepare-judgments.mjs       # veilige werkkopie van de bestaande 212 paren, geen ingevulde oordelen
node tools/prepare-windows.mjs         # zelfstandig Windows-pakket met synthetische lijsten
node tools/check-release.mjs           # of pnpm check:release; ontbrekend/ongeldig/verouderd is exitcode 1
```

`check:release` voert de openbare controle, synthetische kwaliteit, browsercontrole, zes private voorbeelden en
de strenge private evaluator opnieuw uit. Vervolgens controleert zij een actuele volledige prestatiematrix en
de werkelijke Windows-acceptatie in Edge én Chrome, inclusief opnieuw geopende XLSX-downloads. Er bestaat geen
optie om verplichte onderdelen over te slaan. Een groene CI-run is geen groene release. De releaseopdracht
weigert een CI-omgeving, zodat private gegevens niet per ongeluk in CI worden verwerkt.

Standaard gebruikt de opdracht de beoordeelde kopie, het oorspronkelijke manifest en de menselijke verklaring
onder `dist/kwaliteit-ronde2/`, `testdata/` als bronmap, `dist/prestaties/release-eindmeting/rapport.json` en
`dist/windows-acceptatie/windows-bewijs.json`. Andere locaties kunnen met `--beoordelingen`, `--manifest`,
`--verklaring`, `--bronmap`, `--prestaties` en `--windows`. De vereiste dataset blijft dezelfde: het versiebeheerde
`docs/Releasecontract.json` bindt de oorspronkelijke checksums en aantallen. De kleine publieke set wordt geweigerd.

Iedere uitvoering maakt een nieuwe map `dist/release/controle-…/` met rapport en lokale logs; `--uit` kiest een
andere nieuwe map onder `dist/`. De terminal toont alleen controlestatussen. Private details blijven in de lokale
logs. Bewaar deze mappen buiten Git en uploads. Broncode, bewijsbestanden en private invoer mogen tijdens een
releasecontrole niet veranderen. De release-status geldt uitsluitend voor de genoemde bron- en HTML-checksums;
de opdracht maakt geen commit en publiceert niets.

Prestatiemetingen horen bij de broncode en de vaste referentiemachine. Windows-bewijs hoort bij de exacte
productie-HTML en acceptatieprocedure. Menselijke verklaringen horen bij de exacte beoordeelde werkmap en het
manifest. Bewijs ouder dan 30 dagen vervalt (`SETTINGS.release.bewijsMaxDagen`). De releasebuild gebruikt steeds
dezelfde `SOURCE_DATE_EPOCH` uit het releasecontract, zodat het Windows-bewijs niet alleen door een nieuwe
kalenderdag ongeldig wordt. Na wijzigingen moet het relevante bewijs opnieuw worden verkregen.

Zie [Private-beoordeling](docs/Private-beoordeling.md), [Windows-acceptatie](docs/Windows-acceptatie.md) en
[Releasecontrole](docs/Releasecontrole.md) voor de concrete uitvoering en resterende blokkades.

## Prestatiecontrole

```bash
node tools/check-perf.mjs                                   # volledige poort: 54 metingen + kwaliteitscontrole + budgetten
node tools/check-perf.mjs --meet dist/prestaties/nieuwe-reeks # dezelfde matrix; legt metingen vast zonder budgetoordeel
node tools/check-perf.mjs --controleer dist/prestaties/nieuwe-reeks/rapport.json
node bench.mjs 50000 gedeeld                                # één verkennende Node-meting; geen volledige poort
```

De vaste matrix gebruikt drie herhalingen van 1k/10k/50k rijen met veel unieke bedrijven, veel duplicaten en
sterk gedeelde sleutels. Node en Chrome worden sequentieel in verse processen gestart. Chrome opent de
productie-HTML via `file://`; de gewone productie-CSP blijft actief. Standaard gebruikt de prestatiecontrole
de geïnstalleerde Chrome; een ander kanaal kan met `LEAD_BROWSER_CHANNEL`, maar telt pas na een nieuwe
referentiemeting als dezelfde prestatiepoort. Node, Playwright en de referentiemachine moeten overeenkomen
met `SETTINGS.prestaties.referentie`.

Alle fases, piek-RSS van Node, browserblokkades, timervertraging, kandidaatverbindingen en exportbytes worden
vastgelegd. Browsergeheugen is expliciet niet beschikbaar: deze omgeving levert geen betrouwbare piek over
alle Chrome-processen. De langste hoofdthreadtaak en timervertraging worden wel verplicht gemeten.
Iedere gedownloade werkmap wordt opnieuw geopend en volledig vergeleken met onafhankelijk gegenereerde
bedrijfsidentiteiten en oorspronkelijke cellen. De publieke regressies voor BTW, uitsluitingen en gegevensbehoud
moeten vooraf slagen. Een snellere uitvoering met verkeerde groepen of verloren gegevens faalt daardoor.

Budgetten en scenario-instellingen staan in `src/settings.js`; meetmethode, referentie, herhaalde baseline en
beperkingen staan in [docs/Vierde-implementatieronde.md](docs/Vierde-implementatieronde.md). Het gerichte vervolg
op de tijd- en geheugenregressies staat in [docs/Prestatieherstel.md](docs/Prestatieherstel.md). Iedere afzonderlijke
herhaling moet binnen haar grenzen vallen. Ontbrekende fasen, ongeldige getallen, ontbrekende scenario's,
verkeerde runtime/machine en overschrijdingen geven exitcode 1. Een controle met `--controleer` toetst het opgeslagen rapport en voert de huidige broncode niet opnieuw uit.
Gebruik de opdracht zonder opties voor een nieuwe volledige meting. Een nieuwe baseline legt geen nieuwe budgetten
automatisch vast. Beoordeel die expliciet en wijzig ze bewust in de broncode. Een onvolledige meetreeks is nooit groen.
De volledige controle kost enkele minuten en hoort bij wijzigingen aan IO/engine of releasevoorbereiding;
zij draait afzonderlijk van de snelle publieke controle. JSON-rapporten blijven onder `dist/`; tijdelijke
XLSX-bestanden en screenshots worden per meting opgeruimd nadat de werkmapcontrole is uitgevoerd.

## Opbouw

| Onderdeel | Bestand | Wat het doet |
| --- | --- | --- |
| Instellingen | `src/settings.js` | alle grenzen, gewichten, woordenlijsten en de exportkolommen op één plaats |
| Inlezen | `src/io/read.js`, `src/io/read-limits.js` | tekstbestanden en werkmappen openen, grootte en bereiken begrenzen, kopregel zoeken, alles als tekst |
| Kolommen koppelen | `src/io/mapping.js` | kolommen herkennen via synoniemen en inhoud, uitzonderingen, bronprofielen |
| Gelijktrekken | `src/engine/normalize.js` | telefoon, BTW, e-mail, domein, adres en naam in een standaardvorm |
| Records | `src/engine/records.js` | gekoppelde velden naar een record met genormaliseerde sleutels |
| Vergelijken | `src/engine/match.js` | kandidaatparen (blokkering), punten en beslissing per paar, reden in gewone taal |
| Samenvoegen | `src/engine/cluster.js` | groepen vormen met BTW-bewaking, één record per bedrijf, twijfelparen |
| Verwerking | `src/engine/pipeline.js` | de keten van lijsten tot resultaat, met voortgang in blokken |
| Export | `src/io/write.js` | het resultaatbestand schrijven, alleen tekstcellen |
| Sessie | `src/io/session.js` | één lokaal herstelpunt, validatie en atomair bewaren via IndexedDB |
| Schermlogica | `src/ui/review.js`, `src/ui/mapping.js` | uitstelvolgorde en kolomvoorbeelden/vergelijkingsbeleid zonder DOM testen |
| Scherm | `src/ui/app.js`, `src/ui/dom.js`, `src/styles.css`, `src/index.html` | uploaden, koppelen, controleren, exporteren |
| Excel-bibliotheek | `vendor/xlsx.full.min.js` | SheetJS CE 0.20.3, controlesom in `vendor/README.md` |
| Build | `build.mjs` | bundelt alles tot één HTML-bestand met Content-Security-Policy en versienummer |

De code onder `src/engine` en `src/io` bevat geen schermcode en draait ook in Node (tests, runner, benchmark).
Sessieopslag krijgt de browser-API expliciet mee; de snapshot- en herstelvalidatie draaien ook in Node.
`build.mjs` zet de ES-modules om naar één gewoon script zonder import/export, zodat het bestand ook via
`file://` werkt. De CSP in het bestand staat op `default-src 'none'; connect-src 'none'`, met een
sha256-hash per script: de tool kan geen gegevens versturen, zelfs niet bij een fout.

### Eén lokale werksessie

IndexedDB bevat per HTML-locatie één herstelpunt met twee vaste sleutels: `bronnen` voor de ingelezen inhoud
en `huidig` voor kolomkoppelingen, keuzes, logboek, uitstelvolgorde, strengheid, scherm, zoekterm en verwerkingsdatum.
Dit is browseropslag zonder databasebeheer, recordregister of geschiedenis. Alleen wijzigingen aan de ingelezen
lijsten schrijven de grote broninhoud opnieuw; iedere beoordeling start meteen een transactie voor de voortgang.
De opslagstatus meldt pas bewaard na een voltooide transactie. Afgeleide indices, paren en groepen worden bij
herstel opnieuw berekend. Downloadstatus en bestandsrechten worden niet hersteld.

Per bestand wordt alleen het gekozen tabblad met bestandsmetadata en tabbladnamen bewaard. Andere tabbladen
blijven in het open venster beschikbaar; na herstel moet het bestand opnieuw worden toegevoegd om ze te kiezen.
Bij eigen exports blijven de benodigde oorspronkelijke cellen bij het gekozen blad behouden. Sessieformaat 2
bewaart groepskeuzes als ledenlijsten en leest bestaande versie-1-paarbesluiten nog steeds. Een tabbladwissel
schrijft broninhoud en keuze samen. Herstel valideert ook bronmetadata, offsets en de oorspronkelijke cellen.

Terug naar Kolommen behoudt de verwerking. Zolang de invoer gelijk blijft, keert **Verder zonder opnieuw te
verwerken** terug met beoordelingen en uitstel. Een bron- of koppelwijziging vraagt vóór het wissen van die
keuzes bevestiging. **Later** roteert uitgestelde paren; verdwenen paren worden uit de uitstelvolgorde verwijderd.

Broninhoud en voortgang veranderen atomair. Een revisieteller weigert schrijven vanuit een achterhaald tabblad,
ook na wissen. Nieuwe sessie verwijdert alle sessie-inhoud en houdt alleen deze teller over. Onbekende of beschadigde
sessies worden niet stil overschreven. Bij onbeschikbare opslag blijft verwerken mogelijk met een zichtbare waarschuwing;
bij niet-bewaarde voortgang vraagt de browser bevestiging vóór sluiten. Privévensters en gewiste browsergegevens
bieden geen blijvend herstel. Verplaatsen of hernoemen van de HTML gebruikt een andere opslagsleutel.

## Hoe de vergelijking werkt

Kandidaatparen delen minstens één sleutel (telefoon, e-mail, domein, BTW, straat + nummer, een zeldzaam
naamwoord of de eerste vier letters van de naam) en krijgen punten volgens `SETTINGS.punten`:
telefoon 45 (20 bij een centraal nummer), e-mail 45, domein 40, adres 30 (15 bij een andere postcode),
naam tot 60 naar gelijkenis, contactpersoon 20. Het BTW-nummer beslist altijd: gelijk is zeker dubbel,
verschillend is nooit automatisch samenvoegen.

- **Zeker dubbel**: zelfde geldig BTW-nummer, of 90+ punten én naamgelijkenis van minstens 60 %.
- **Te controleren**: 55 tot 90 punten, of veel punten met weinig gelijkende namen.
- **Uniek**: minder dan 55 punten of een verschillend BTW-nummer.

In stap 3 kiest de gebruiker de **strengheid** van de controle (`SETTINGS.strengheid`): Streng, Gemiddeld of Mild.
Alleen de ondergrens "te controleren" schuift mee (40, 55 of 70 punten); de punten per paar en de grens voor automatisch
samenvoegen blijven gelijk, zodat een mildere stand nooit meer rijen samenvoegt. De beslissing per paar wordt bij het
groeperen (`assemble`) opnieuw genomen, zodat omschakelen geen nieuwe vergelijking vraagt; `prepare` bewaart daarom
alle paren tot de laagste grens. De aantallen hangen af van de geladen lijsten en genomen beslissingen.

De deelstringbonus voor namen geldt pas vanaf twee genormaliseerde woorden in de kortste naam
(`SETTINGS.fuzzy`). Eén generiek naamwoord krijgt die bonus niet; de gewogen woordvergelijking blijft gelden.

Bij sleutels met meer dan 400 rijen wordt geen volledige parenlijst gemaakt. Een gelijk geldig BTW-nummer
blijft altijd bereikbaar via een compacte groep. Ook exact gelijke namen met voldoende gedeelde contact- of
adrespunten, en identieke vergelijkingsvelden met een zekere score, krijgen zo'n compact pad. Het groepeert via
vertegenwoordigers; na een menselijke uitsluiting kan een andere rij vertegenwoordiger worden. Alle verenigingen
houden dezelfde BTW- en uitsluitingsbewaking. Overige combinaties bij grote algemene sleutels worden nog steeds
overgeslagen en gemeld. De grens van 400 is niet verhoogd.

Groepen worden nooit over een BTW-conflict of menselijke uitsluiting heen aan elkaar geketend.
Een keuze betreft alle leden van de twee getoonde groepen. "Verschillend" blijft dus ook via een derde rij
geldig. Een onuitvoerbare keuze "Zelfde bedrijf" wordt zichtbaar geweigerd en komt niet als succes in het logboek.
Ontkoppelen scheidt alle groepsleden onderling; eerdere afwijzingen blijven gelden binnen de verwerking.
Elke samenvoeging vermeldt de reden.

Groepskeuzes bewaren ledenlijsten, zonder alle kruisparen uit te schrijven. Vanaf 100 betrokken rijen
wordt bevestiging gevraagd; boven 5.000 weigeren scherm en engine de keuze (`SETTINGS.groepsbesluiten`).
Waarschuwingen, zoekresultaten en samengevoegde groepen tonen maximaal 300 rijen of groepen; de export
blijft volledig (`SETTINGS.scherm.maxLijstRijen`).

### Bijna constante kolommen en contactnormalisatie

Het beleid voor bijna constante kolommen wordt per bron en actuele kolomkoppeling bepaald. Bij minstens
20 niet-lege waarden geldt een aandeel van 95% voor de overheersende waarde. Contactwaarden worden eerst
genormaliseerd: andere schrijfwijzen van hetzelfde nummer, adres of domein tellen samen; niet herkende
contactwaarden tellen niet als gevulde vergelijkingswaarde. Meerdere contacten in één cel vormen samen
één celwaarde. De grenzen en veldindeling staan in `SETTINGS.bijnaConstant`.

| Veld | Vergelijkingsbeleid bij bijna constante waarden |
| --- | --- |
| Telefoon, e-mail, website | Hoort de overheersende waarde bij minstens twee verschillende genormaliseerde bedrijfsnamen, dan telt de hele bronkolom niet mee, ook de minderheidswaarden. Zij levert geen kandidaten, punten of afgeleide e-maildomeinen. Andere contactkolommen en bronnen blijven afzonderlijk bruikbaar. |
| Contactpersoon, voornaam, achternaam | Dezelfde regel; zodra één persoonsnaamkolom wordt uitgesloten, vallen alle gekoppelde persoonsnaamvelden samen weg om geen kunstmatige gedeeltelijke naam te vergelijken. |
| Herhaalde contactwaarde bij één bedrijfsnaam | Blijft meetellen, zodat echte herhaalde bedrijfsrijen ook boven 400 rijen bereikbaar blijven. Een afwijkende rij met een eigen of leeg contactgegeven verandert dat niet. De melding vraagt de bron te controleren. |
| Bedrijfsnaam en BTW | Behouden hun bestaande identiteitsrol. De geldigheidscontrole van BTW blijft gelden. |
| Adres, straat, huisnummer, bus, postcode | Behouden hun bestaande adresrol. Een constante postcode kan juist zijn in een gemeentelijst; een andere postcode verlaagt de adrespunten van 30 naar 15. Postcode alleen maakt geen kandidaat. |
| Gemeente, hoofdsector, sector | Worden bewaard en leveren geen vergelijkingspunten. |
| Niet gebruiken | Blijft extra informatie, zonder vergelijkingsrol. |

De kolommelding, kandidaatselectie, centraleherkenning, compacte groepen en puntentelling gebruiken hetzelfde
beleid. Uitsluiting staat ook bij de rijwaarschuwingen en in het Logboek. Genormaliseerde contactwaarden blijven
in de export staan; alle oorspronkelijke cellen blijven ongewijzigd in Oorspronkelijke gegevens.
Dit is een conservatieve regel voor mogelijke kopieën, geen vaststelling dat een contactgegeven onjuist is.

Telefoons worden gesplitst vóór spaties worden samengeknepen. Dubbele spaties, een slash of een los streepje
scheiden nummers als beide delen volledige herkenbare nummers zijn; tabs en regeleinden zijn ook scheidingen.
De opmaak `02  000 00 00` blijft één nummer, `020000000  030000000` wordt twee nummers.
Wetenschappelijke notatie blijft onbruikbaar en krijgt een waarschuwing.
Gemarkeerde numerieke toestelsuffixen zoals `ext 12` en `#12` worden vóór de vergelijking verwijderd;
de oorspronkelijke cel blijft volledig bewaard. Website- en e-maildomeinen met Unicode worden lokaal naar
dezelfde punycodesleutel omgezet; accenten worden niet weggehaald. Bij samenvoegen krijgt een bruikbare eigen
website voorrang op een platform-URL, ook als die laatste rij een e-mailadres met een eigen domein heeft.

Bij e-mail worden uitsluitend spaties direct rond `@` hersteld: `info @ voorbeeld.invalid` wordt
`info@voorbeeld.invalid`. Spaties binnen het lokale deel of domein worden niet geraden: `in fo@voorbeeld.invalid`
wordt volledig verworpen. Komma, puntkomma, slash en verticale streep scheiden afzonderlijke delen;
een reeks volledige adressen mag ook door spaties gescheiden zijn. Bevat zo'n door spaties gescheiden deel
onherkende tekst, dan wordt het hele deel verworpen. Andere geldig gescheiden delen blijven behouden.
Elk verworpen niet-leeg telefoondeel en elk verworpen e-maildeel met `@` krijgt een begrijpelijke
rijwaarschuwing, ook in het Logboek. Afzonderlijke e-maildelen zonder `@`, zoals de weergavenaam in
`Mira Testmans <mira@voorbeeld.invalid>` of `(algemeen)` na een adres, geven geen waarschuwing.
Opvulwaarden zoals `n.v.t.` gelden als leeg. Originele celtekst, inclusief spaties en verworpen delen, blijft bewaard.

### Bronprofielen

De browseropslag is een versieobject met een lijst profielen. Zowel opslagvorm als handtekening, kolomnamen,
toegestane veldsleutels en optionele bronnaam worden gecontroleerd. Oude geldige profiellijsten worden omgezet;
ongeldige profielen en niet-ondersteunde oudere opslagversies worden verwijderd, met een melding. Geldige profielen blijven behouden.
Opslag met een hoger versienummer blijft volledig ongewijzigd. De oudere tool stelt kolommen opnieuw voor en
bewaart geen nieuwe koppelingen; een melding verwijst naar de nieuwere tool. Verwerken blijft mogelijk.
Ontbrekende of geweigerde opslag verhindert verwerken niet. Maximaal 50 geldige profielen worden bewaard.
**Opnieuw voorstellen** gebruikt expliciet de kolomherkenning zonder opgeslagen profiel. Pas bij **Verwerken**
wordt de actuele koppeling opnieuw onthouden. Eigen resultaatbestanden behouden hun beschermde metadataherkenning.

## Export en herimport

De toegestane invoertypen staan in `SETTINGS.bestandstypen`: csv/txt/tsv en xlsx/xlsm/xls/xlsb/ods.
`SETTINGS.inlezen` begrenst ieder bestand op 100 MiB en 2.000.000 cellen over alle tabbladen samen,
inclusief koppen en lege cellen in het gebruikte bereik. Ook eigen exports vallen hieronder. ZIP-metadata
wordt vóór SheetJS gecontroleerd op maximaal 256 MiB uitgepakte inhoud en 10.000 onderdelen; ZIP64 wordt
geweigerd. SheetJS blijft synchroon en celbereiken zijn pas na het parsen beschikbaar: dit is geen volledige
isolatie tegen vervalste compressiegegevens. Overschrijdingen geven een fout, geen afgekapte invoer.

Het blijft één XLSX-bestand. De bestaande 23 kolommen van **Unieke leads** blijven vooraan op dezelfde plaats;
het uploadformaat loopt van Lead Source tot Achternaam. Daarachter komen zo nodig Telefoon 4, Telefoon 5, …
en E-mail 3, E-mail 4, …, gevolgd door **Extra: oorspronkelijke kolomnaam** voor niet gekoppelde kolommen.
Verschillende niet-lege extra waarden komen met regeleinden in dezelfde cel. Lead Source, Project en Leadowner
hebben al een vaste kolom; alternatieve waarden blijven beschikbaar in de oorspronkelijke gegevens.

**Oorspronkelijke gegevens** bewaart iedere ingelezen cel als tekst met resultaatnummer, bronrijverwijzing,
bestand, tabblad, oorspronkelijk rij- en kolomnummer, kolomkop en waarde. Zo blijven ook conflicterende namen,
adressen, websites en contactpersonen, niet herkende contactgegevens, opvulwaarden en dubbele kolomkoppen
terugvindbaar. De geselecteerde hoofdwaarde verandert deze oorspronkelijke waarden niet. `Logboek` bevat elke
huidige invoerrij precies één keer. Bronrijverwijzingen en resultaatnummers gelden alleen binnen de werkmap.

Bij herimport wordt het tabblad **Unieke leads** gebruikt. De eigen kolomindeling wordt herkend, ook bij oudere
exports: Nr, Bronnen en Mogelijk dubbel met zijn metadata; Nr wordt geen huisnummer. Oude bronprofielen kunnen
die herkenning niet overschrijven. Een gewone bron met Straat + Nr houdt wel zijn huisnummerkoppeling.
Busnummers worden apart herkend en als `bus …` in het samengestelde adres geschreven. Alle genummerde contactkolommen
tellen opnieuw mee bij vergelijken met een nieuwe lijst.

Bewaar en laad het volledige resultaatbestand: dan reist het tabblad Oorspronkelijke gegevens mee en worden ook
de huidige invoercellen eraan toegevoegd. Hierdoor groeit het herkomsttabblad bij elke ronde. Alleen het eerste
tabblad kopiëren bewaart geen eerdere alternatieve hoofdwaarden of hun herkomst. Eerdere menselijke beslissingen
zijn historische informatie; een nieuwe verwerking begint met nieuwe beslissingen.

Alle exportcellen zijn tekst, ook waarden die met `=` beginnen. De tests schrijven en heropenen XLSX-bestanden en
controleren bovendien de XML op formules. Bij overschrijding van Excel-limieten (celtekst, rijen, kolommen) mislukt
de export met een melding; er wordt niets stil afgekapt.

## Versie uitbrengen

1. Versienummer verhogen in `package.json`.
2. De volledige prestatiematrix opnieuw uitvoeren en de private beoordelingen en Windows-acceptatie voor deze versie afronden. Volg [Releasecontrole](docs/Releasecontrole.md) en voer `node tools/check-release.mjs` uit; ontbrekend, mislukt of verouderd bewijs blokkeert de release.
3. Alleen na een geslaagde releasecontrole de gecontroleerde `dist/Lead-ontdubbelaar.html` op de gedeelde schijf of in OneDrive zetten. Bouw het bestand daarna niet opnieuw met een andere datum: de gecontroleerde HTML-checksum moet gelijk blijven.
   Een nieuwe versie vervangt het bestand; het versienummer staat in de tool en in elk exportbestand.

## Stand van zaken tegenover het implementatieplan

Stap 1 tot 7 zijn gebouwd en getest met de lokale private bronlijsten; de gekende
testgevallen uit het plan komen juist uit. Op vraag van de opdrachtgever zijn de rol "Bestaande klanten", het
tabblad "Al klant" en het masterbestand (stap 8, Lead-ID's en statussen) weggelaten: de tool vergelijkt de
geladen lijsten en levert één resultaatbestand per verwerking. Van stap 9 zijn de snelheidstest (`bench.mjs`)
en de testset-tooling (`tools/testset.mjs`) klaar; het afstellen van de grenzen vraagt de beoordeelde testset
van het team. Stap 10 (oplevering, demo) is het werk met het team. De controle met een dubbelklik in Edge op
een Windows-pc zonder netwerk moet daar nog gebeuren.

De resultaten en beperkingen van de eerste herstelronde staan in [docs/Eerste-implementatieronde.md](docs/Eerste-implementatieronde.md).

De tweede ronde (B04 en B05) staat in [docs/Tweede-implementatieronde.md](docs/Tweede-implementatieronde.md).

De derde ronde (B07, B10 en B11) staat in [docs/Derde-implementatieronde.md](docs/Derde-implementatieronde.md).
