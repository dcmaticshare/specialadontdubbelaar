# Lead-ontdubbelaar

Ontdubbelt leadlijsten (CSV en Excel) volledig lokaal in de browser. Het eindproduct is één bestand,
`dist/Lead-ontdubbelaar.html`, dat op elke Windows-pc in Edge of Chrome opent zonder installatie,
internet of beheerdersrechten. De Excel-bibliotheek SheetJS zit erin ingebakken.

De gebruikershandleiding staat in [docs/Handleiding.md](docs/Handleiding.md).

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
Voor een lokaal geïnstalleerde Chrome kan `LEAD_BROWSER_CHANNEL=chrome node tools/check-browser.mjs`
worden gebruikt. De gebruikte browserversie staat in `dist/controle/browser-resultaat.json`.

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
node bench.mjs 50000                            # bestaande benchmark, nog geen prestatiebudget
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

## Opbouw

| Onderdeel | Bestand | Wat het doet |
| --- | --- | --- |
| Instellingen | `src/settings.js` | alle grenzen, gewichten, woordenlijsten en de exportkolommen op één plaats |
| Inlezen | `src/io/read.js` | CSV (scheidingsteken en tekenset herkennen) en Excel openen, kopregel zoeken, alles als tekst |
| Kolommen koppelen | `src/io/mapping.js` | kolommen herkennen via synoniemen en inhoud, uitzonderingen, bronprofielen |
| Gelijktrekken | `src/engine/normalize.js` | telefoon, BTW, e-mail, domein, adres en naam in een standaardvorm |
| Records | `src/engine/records.js` | gekoppelde velden naar een record met genormaliseerde sleutels |
| Vergelijken | `src/engine/match.js` | kandidaatparen (blokkering), punten en beslissing per paar, reden in gewone taal |
| Samenvoegen | `src/engine/cluster.js` | groepen vormen met BTW-bewaking, één record per bedrijf, twijfelparen |
| Verwerking | `src/engine/pipeline.js` | de keten van lijsten tot resultaat, met voortgang in blokken |
| Export | `src/io/write.js` | het resultaatbestand schrijven, alleen tekstcellen |
| Scherm | `src/ui/app.js`, `src/ui/dom.js`, `src/styles.css`, `src/index.html` | uploaden, koppelen, controleren, exporteren |
| Excel-bibliotheek | `vendor/xlsx.full.min.js` | SheetJS CE 0.20.3, controlesom in `vendor/README.md` |
| Build | `build.mjs` | bundelt alles tot één HTML-bestand met Content-Security-Policy en versienummer |

De code onder `src/engine` en `src/io` bevat geen schermcode en draait ook in Node (tests, runner, benchmark).
`build.mjs` zet de ES-modules om naar één gewoon script zonder import/export, zodat het bestand ook via
`file://` werkt. De CSP in het bestand staat op `default-src 'none'; connect-src 'none'`, met een
sha256-hash per script: de tool kan geen gegevens versturen, zelfs niet bij een fout.

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
alle paren tot de laagste grens. Op de vier Merelbeke-lijsten geeft dat 152, 98 en 73 twijfelparen.

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

Bij e-mail worden uitsluitend spaties direct rond `@` hersteld: `info @ voorbeeld.invalid` wordt
`info@voorbeeld.invalid`. Spaties binnen het lokale deel of domein worden niet geraden: `in fo@voorbeeld.invalid`
wordt volledig verworpen. Komma, puntkomma, slash en verticale streep scheiden afzonderlijke delen;
een reeks volledige adressen mag ook door spaties gescheiden zijn. Bevat zo'n door spaties gescheiden deel
onherkende tekst, dan wordt het hele deel verworpen. Andere geldig gescheiden delen blijven behouden.
Elk verworpen niet-leeg telefoon- of e-maildeel krijgt een begrijpelijke rijwaarschuwing, ook in het Logboek.
Opvulwaarden zoals `n.v.t.` gelden als leeg. Originele celtekst, inclusief spaties en verworpen delen, blijft bewaard.

### Bronprofielen

De browseropslag is een versieobject met een lijst profielen. Zowel opslagvorm als handtekening, kolomnamen,
toegestane veldsleutels en optionele bronnaam worden gecontroleerd. Oude geldige profiellijsten worden omgezet;
ongeldige profielen en onbekende opslagversies worden verwijderd, met een melding. Geldige profielen blijven behouden.
Ontbrekende of geweigerde opslag verhindert verwerken niet. Maximaal 50 geldige profielen worden bewaard.
**Opnieuw voorstellen** gebruikt expliciet de kolomherkenning zonder opgeslagen profiel. Pas bij **Verwerken**
wordt de actuele koppeling opnieuw onthouden. Eigen resultaatbestanden behouden hun beschermde metadataherkenning.

## Export en herimport

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
2. `node tools/check.mjs`, `pnpm check:browser` en de toepasselijke private controles draaien. De beoordeelde kwaliteitsset en Windows-acceptatie blijven vereist voor een volledige release.
3. `node build.mjs` en `dist/Lead-ontdubbelaar.html` op de gedeelde schijf of in OneDrive zetten.
   Een nieuwe versie vervangt het bestand; het versienummer staat in de tool en in elk exportbestand.

## Stand van zaken tegenover het implementatieplan

Stap 1 tot 7 zijn gebouwd en getest op de vier Merelbeke-lijsten (491, 785, 31 en 50 rijen); de gekende
testgevallen uit het plan komen juist uit. Op vraag van de opdrachtgever zijn de rol "Bestaande klanten", het
tabblad "Al klant" en het masterbestand (stap 8, Lead-ID's en statussen) weggelaten: de tool vergelijkt de
geladen lijsten en levert één resultaatbestand per verwerking. Van stap 9 zijn de snelheidstest (`bench.mjs`)
en de testset-tooling (`tools/testset.mjs`) klaar; het afstellen van de grenzen vraagt de beoordeelde testset
van het team. Stap 10 (oplevering, demo) is het werk met het team. De controle met een dubbelklik in Edge op
een Windows-pc zonder netwerk moet daar nog gebeuren.

De resultaten en beperkingen van de eerste herstelronde staan in [docs/Eerste-implementatieronde.md](docs/Eerste-implementatieronde.md).

De tweede ronde (B04 en B05) staat in [docs/Tweede-implementatieronde.md](docs/Tweede-implementatieronde.md).

De derde ronde (B07, B10 en B11) staat in [docs/Derde-implementatieronde.md](docs/Derde-implementatieronde.md).
