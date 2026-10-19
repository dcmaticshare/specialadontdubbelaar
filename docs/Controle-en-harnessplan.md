# Controle en harnessplan voor de Lead-ontdubbelaar

De toepassing heeft een bruikbare basis: de vergelijkingslogica is los van het scherm opgebouwd, de bestaande tests slagen en de productiebuild werkt rechtstreeks via `file://`. Voor een betrouwbare volgende versie moeten vooral gegevensverlies, de betekenis van menselijke beslissingen en de kwaliteitscontrole van het matchen worden opgelost.

Met **harness** wordt hier bedoeld: vaste ontwikkelcommando's, synthetische testgegevens met verwachte uitkomsten, automatische controles van de volledige gebruikersstroom en duidelijke voorwaarden voor een release. Daarmee kunnen zowel een ontwikkelaar als een codeagent aantonen dat een wijziging correct is.

Audit op 17 oktober 2026, op basis van commit `1cb487c` en de aanwezige werkmap. De bestaande wijzigingen aan `CLAUDE.md` en `AGENTS.md` zijn behouden. Dit document bevat bevindingen en een uitvoeringsplan; de toepassingscode en bestaande tests zijn niet aangepast.

**Vervolgstatus:** bovenstaande beschrijft de oorspronkelijke audit. De oplossingen en controles staan in
[ronde 1](Eerste-implementatieronde.md), [ronde 2](Tweede-implementatieronde.md) en
[ronde 3](Derde-implementatieronde.md) en [ronde 4](Vierde-implementatieronde.md). B12 en de prestatielaag
zijn in ronde 4 uitgewerkt met onafhankelijke synthetische groepen en machinegebonden budgetten. B07, B10 en B11 zijn in ronde 3 opgelost met eerst falende regressies
en controle van de productie-HTML via `file://`. Het [prestatieherstel](Prestatieherstel.md) behandelt de
gestegen verwerkingstijd en geheugenpieken uit ronde 4. De [releasecontrole](Releasecontrole.md) voegt openbare CI,
verplichte actuele bewijzen en uitvoerbare beoordelings- en Windows-procedures toe. De onafhankelijke private
beoordeling en werkelijke Windows-acceptatie blijven releaseblokkades totdat zij zijn uitgevoerd.

De volgende codescan en de afsluitende integratiecontroles van 18 oktober staan in
[Codescan-2026-10-18.md](Codescan-2026-10-18.md) en
[Codescan-afronding-2026-10-18.md](Codescan-afronding-2026-10-18.md). De oorspronkelijke bevindingen
en aantallen hieronder zijn historisch; ze beschrijven niet opnieuw de huidige toestand.

## Uitgevoerde controles

| Controle | Resultaat en betekenis |
| --- | --- |
| Broncode | Alle eigen modules, buildscript, tests, hulpscripts en documentatie doorgenomen. De geminificeerde SheetJS-bibliotheek is niet volledig handmatig geaudit. |
| `node --test` | 91 tests: 90 geslaagd, 1 overgeslagen. De beoordeelde testset ontbreekt. |
| Testdekking | De geladen eigen modules hebben overwegend hoge regeldekking; bijvoorbeeld export heeft 93,88% regeldekking en 67,65% takdekking. Schermcode en build staan niet in dit dekkingsrapport. Het algemene percentage inclusief vendor is geen dekkingsmaat voor het volledige product. |
| Productiebuild en ontwikkelbuild | Beide slagen, 12 modules, circa 1056 kB. Alleen `connect-src` verschilt tussen beide bestanden. |
| Bibliotheek en CSP | SHA-256 van SheetJS komt overeen met `vendor/README.md`. Beide scripthashes en de stylesheet-hash kloppen met het gebouwde HTML-bestand. Dit is een integriteitscontrole, geen volledige kwetsbaarhedenanalyse van SheetJS. |
| Bestaande privélijsten | 1357 rijen, 1128 unieke leads, 214 automatisch samengevoegde groepen. 152/98/73 twijfelparen voor Streng/Gemiddeld/Mild. De zes gekende gevallen melden OK. Dit bewijst geen algemene matchkwaliteit. |
| Echte browser | Chrome 155 op deze Mac, nieuw tijdelijk profiel, productie-HTML via `file://`: laden, kolommen, verwerken, downloaden en ontkoppelen uitgevoerd. De gedownloade XLSX opnieuw geopend; zes verwachte tabbladen en uitsluitend tekstcellen zonder formules. |
| Tekst en netwerk | Synthetische HTML-invoer bleef zichtbare tekst, maakte geen afbeelding aan en voerde geen code uit. Een gerichte fetchpoging werd door `connect-src` geblokkeerd, voordat de netwerkinterceptor werd bereikt. De normale gebruikersstroom deed geen netwerkverzoeken. |
| Benchmark met 50.000 rijen | 21,6 seconden totaal: 0,2 s koppelen, 7,3 s vergelijken, 1,0 s groeperen, 13,2 s Excel schrijven. 2.672.443 kandidaatparen, 715.546 bewaarde scores, 129.719 twijfelparen en circa 66,2 MiB export. Eén lokale Node-meting; geen Windows- of browserprestatiegarantie. |

Gebruikte Node-versie: `v24.19.0`, via de gebundelde runtime van de desktopapp. Node staat nog steeds niet algemeen op het systeem geïnstalleerd. De Windows-controle met Edge/Chrome, daadwerkelijk zonder netwerk, blijft onderdeel van de releaseacceptatie.

## Bugs die eerst moeten worden opgelost

P1 betekent: oplossen vóór de volgende betrouwbare oplevering. P2 betekent: opnemen in de daaropvolgende herstelronde. Alle voorbeelden hieronder zijn synthetisch.

### B01 Verschillend houdt rijen niet altijd apart

**P1 — [src/engine/cluster.js](../src/engine/cluster.js), regels 27–41.** De code slaat de afgekeurde verbinding over, maar bewaakt de afwijzing niet wanneer groepen via een derde rij samenkomen.

Reproductie: drie gelijke rijen A, B en C; leg A–B vast als `verschillend`. Het resultaat bevat toch één groep `[A, B, C]`, via A–C en B–C. De export kan dus het tegenovergestelde bevatten van de expliciete beslissing van de gebruiker.

Herstel: bewaar uitsluitingen tussen groepsleden en controleer die vóór elke vereniging. Leg ook vast dat een beslissing op twee getoonde groepen op die groepen slaat, niet uitsluitend op het toevallig geselecteerde paar bronrijen. Tegenstrijdige menselijke beslissingen moeten een zichtbaar conflict opleveren. Regressies: ketens en driehoeken, meerdere uploadvolgordes, ontkoppelen en daarna opnieuw beoordelen.

### B02 Extra gegevens verdwijnen uit de export

**P1 — [src/io/write.js](../src/io/write.js), regels 38–42 en 62–68; [src/engine/cluster.js](../src/engine/cluster.js), `mergeGroup`.** `extractFields` bewaart extra kolommen, maar de export schrijft alleen de vaste exportkolommen. Het scherm belooft bij “Niet gebruiken” dat de kolom als extra meegaat.

Reproductie: `Opmerkingen = BEWAAR-MIJ` komt nergens in de werkmap terug. Bij één unieke lead met vier geldige telefoons en drie e-mails verdwijnen bovendien telefoon vier en e-mail drie uit het resultaatbestand. Het logboek bewaart deze oorspronkelijke celwaarden evenmin.

Herstel: bepaal expliciet hoe onbekende kolommen, meerdere waarden en conflicterende bronwaarden behouden blijven. Houd het bestaande uploadformaat vooraan; voeg noodzakelijke extra kolommen of een tabblad met oorspronkelijke gegevens toe binnen hetzelfde resultaatbestand. Bewaar de herkomst per waarde. Regressie: iedere niet-lege oorspronkelijke waarde moet volgens een expliciete exportregel terugvindbaar zijn; controleer de daadwerkelijk geschreven en opnieuw geopende XLSX.

### B03 Een eigen resultaatbestand verandert adressen bij herimport

**P1 — [src/io/mapping.js](../src/io/mapping.js), synoniem `nr` en regels 164–166.** De geëxporteerde kolom `Nr` wordt als huisnummer herkend. Daardoor verandert `Straat Huisnummer` in een straatkolom.

Reproductie: exporteer een lead op `Teststraat 42` met volgnummer `1` en laad de export opnieuw. Het nieuwe adres wordt `Teststraat 42 1`. Dit raakt precies de werkwijze die de handleiding aanraadt voor een volgende verwerking.

Herstel: herken de eigen exportindeling en behandel het volgnummer als metadata. Behoud herkenning van echte huisnummerkolommen in andere bronnen. Regressie: meerdere export/importrondes met adressen, busnummers, extra contactgegevens en een nieuw toegevoegde lijst mogen de oorspronkelijke gegevens niet vervormen.

### B04 Vanaf 401 identieke rijen worden zekere dubbels gemist

**P1 — [src/engine/match.js](../src/engine/match.js), regels 54–56.** De limiet van 400 geldt voor alle sleutels, ook geldige BTW-nummers en andere exacte signalen.

Reproductie: 400 identieke rijen met hetzelfde geldige BTW-nummer leveren één groep op; 401 identieke rijen leveren nul kandidaatparen en 401 afzonderlijke leads op. De waarschuwing over algemene sleutels maakt de beloofde regel “hetzelfde geldige BTW-nummer beslist altijd” niet waar.

Herstel: geef sterke identificatoren een eigen, begrensd verwerkingspad. Vorm bijvoorbeeld verbindingen via vertegenwoordigers in plaats van alle combinaties op te slaan, met behoud van B01 en de BTW-bewaking. Verhoog niet alleen de limiet. Regressies op 399/400/401 rijen en grote groepen met gelijke identificatoren én met gedeelde algemene signalen.

### B05 De kwaliteitscontrole kan onterecht groen worden

**P1 voor het harness — `test/testset.test.mjs` (historisch bestand), regels 15–25; [tools/testset.mjs](../tools/testset.mjs), regels 54–77; [tools/run-testdata.mjs](../tools/run-testdata.mjs), controle van gekende gevallen.**

De huidige regressies staan in [test/kwaliteit.test.mjs](../test/kwaliteit.test.mjs) en
[test/kwaliteit-cli.test.mjs](../test/kwaliteit-cli.test.mjs).

Drie fouten zijn afzonderlijk gereproduceerd:

- Een beoordelingsbestand met onjuiste kolomkoppen laat de test slagen met exitcode 0. Er is geen eis dat daadwerkelijk een geldige beoordeling is gecontroleerd.
- Een als “zelfde” beoordeeld paar dat niet in `prep.scored` voorkomt, wordt alleen “niet gevonden”. De meting rapporteert nul gemiste dubbels en exitcode 0. Een fout in de kandidaatselectie blijft daardoor buiten de kwaliteitsmaat.
- De runner meldt op een synthetische map vier NOK-gevallen en eindigt toch met exitcode 0.

Daarnaast beoordelen de scripts afzonderlijke paarscores, niet de uiteindelijke groepen. Een fout door transitieve samenvoeging kan daardoor ontbreken in de gemeten foutscore. De labels worden ook niet identiek geïnterpreteerd door CLI en test.

Herstel: één gedeelde evaluator met schemavalidatie, een gesloten lijst toegestane labels, minimaal één geldige beoordeling en expliciete aantallen verwacht/gevonden/gecontroleerd. Koppel beoordelingen aan stabiele testrecord-ID's en een vast datasetmanifest. Onderscheid een verdwenen bronrij van een bestaand paar dat de kandidaatselectie mist. Controleer zowel kandidaten, paarscores als uiteindelijke groepen. Laat releasecontroles falen bij ontbrekende vereiste beoordelingen, ongeldige labels, onbekende records en overschreden foutgrenzen. De test-ID's horen uitsluitend bij fixtures; ze introduceren geen blijvende Lead-ID's in het product.

## Overige bevestigde fouten

| ID | Prioriteit en plaats | Waarneming | Herstel en acceptatie |
| --- | --- | --- | --- |
| B06 | P2 — `cluster.js:40,56` | Bij een keten met twee verschillende geldige BTW-nummers kun je tweemaal “Zelfde bedrijf” kiezen. Er blijven twee groepen, maar de controlelijst wordt leeg. Het besluit is niet uitgevoerd en het conflict verdwijnt uit beeld. | Wijs de onuitvoerbare beslissing zichtbaar af of houd een expliciete conflictstatus bij. Een geblokkeerde beslissing mag niet als succesvol afgehandeld worden gelogd. |
| B07 | P2 — `mapping.js:177`, `pipeline.js:23` | De melding zegt dat bijna constante kolommen niet worden gebruikt. Alleen de bruikbaarheid van postcode wordt doorgegeven. Een constante e-mail telt nog steeds mee; in de synthetische set ontstond een automatische groep. | Leg per veld vast wat “bijna constant” betekent en laat melding en puntentelling overeenkomen. Een constante, juiste postcode in een gemeentelijst vereist een andere afweging dan een gekopieerd contactgegeven. |
| B08 | P2 — `read.js:99–106,145–150` | Een gevulde laatste kolom met een lege kop wordt afgesneden. Bij een Excel-tabel op C5:E6 krijgt de gegevensrij nummer 2 in plaats van 6. | Leid tabelbreedte ook uit de gegevens af; geef lege koppen namen. Bewaar Excel-offsets. Test lege/dubbele koppen, voorloopregels en verschoven werkbladen. |
| B09 | P2 — `app.js:223–225,425,465–466` | Downloaden, daarna ontkoppelen: het resultaat verandert, maar de oude download blijft als actueel gelden. Een gesimuleerd sluit-event wordt niet meer tegengehouden. | Gebruik een resultaatrevisie en een geëxporteerde revisie. Iedere inhoudelijke verandering maakt de export verouderd. Test ook strengheid wijzigen en opnieuw verwerken. |
| B10 | P2 — `app.js:36–51,167` | Een geldig JSON-object `{}` in de profielopslag veroorzaakt `profiles.find is not a function` en een leeg mappingscherm. “Opnieuw voorstellen” gebruikt opnieuw hetzelfde opgeslagen profiel. | Valideer profielvorm en velden; herstel ongeldige opslag. Geef de voorstelknop een expliciet pad zonder profiel. Test ontbrekende, ongeldige en oude opslag. |
| B11 | P2 — `normalize.js`, `splitPhones` en `normalizeEmails` | `020000000  030000000` levert geen telefoons op: dubbele spaties verdwijnen vóór het splitsen. `info @ voorbeeld.invalid` levert geen e-mail op. | Splits vóór het samenknijpen van betekenisvolle scheidingstekens. Maak de keuze rond spaties in e-mail expliciet en waarschuw bij verworpen inhoud. Bewaar altijd het origineel. |
| B12 | P2 — `bench.mjs:36` | De generator maakt BTW-nummers van elf cijfers. Daardoor oefent de benchmark het pad voor geldige BTW-nummers niet zoals bedoeld. | Genereer geldige nummers en test de generator. Bewaar de bedoelde bedrijfsidentiteit als onafhankelijke grondwaarheid. |
| B13 | P2 — bestaande testfixtures | Vijftien unieke telefoon-, e-mail- of BTW-celwaarden uit de privélijsten komen letterlijk in de tests voor. Dit strookt niet met de projectafspraak om echte gegevens buiten tests en repository te houden. | Vervang de fixtures door volledig synthetische voorbeelden met hetzelfde relevante patroon, vóór CI-rapporten of fixtures worden gedeeld. Deze audit herhaalt de waarden niet. |

## Verbeteringen voor onderhoud en gebruik

1. **Maak schermtoestand apart testbaar.** Haal beslissen, uitstellen, ontkoppelen, opnieuw beginnen en exportrevisies uit de DOM-code naar een kleine module. Behoud de bestaande scheiding met engine en IO. Voeg bij “Terug naar kolommen” een duidelijke behandeling toe van reeds genomen beslissingen: opnieuw verwerken wist die momenteel direct.
2. **Begrens invoer en rekenwerk.** Excel-inlezen, normaliseren, kandidaatparen opbouwen, groeperen en Excel schrijven bevatten lange synchrone stukken. Er zijn geen expliciete grenzen voor bestandsgrootte, werkbladbereik of aantallen paren. Meet browserresponsiviteit, voeg begrijpelijke foutmeldingen en annulering toe en verplaats pas daarna aantoonbaar zware stappen naar een worker of kleinere werkeenheden. Een eventuele worker moet binnen het offline distributie- en CSP-model passen.
3. **Maak de controlelijst praktisch.** De benchmark produceert meer dan 129.000 twijfelparen. Meet hoeveel beoordelingen een gebruiker moet doen, naast snelheid en matchkwaliteit. Voeg waar nodig filters, hervatbare navigatie binnen de huidige verwerking en een expliciete mogelijkheid tot het terugnemen van een beslissing toe. Bewaar leads niet stilzwijgend in localStorage.
4. **Verbeter invoerherstel en toegankelijkheid.** Laat zo nodig kopregel en scheidingsteken corrigeren; label de kolomkeuzes voor hulptechnologie, bewaak focus na renderen en test sneltoetsen inclusief ingedrukt houden. Maak een verkeerde handeling herstelbaar.
5. **Handhaaf projectafspraken automatisch.** Drempels en woordenlijsten staan nog deels in mapping, matching en tooling. Centraliseer de inhoudelijke instellingen. De voortgangsbalk schrijft via `style.width` alsnog een style-attribuut; een native `progress`-element past beter bij de afspraak zonder inline stijlen. Er trad tijdens de onderzochte normale browserstroom geen CSP-fout op door de huidige implementatie.
6. **Maak de build controleerbaar.** Controleer tijdens de build de vendorhash, daadwerkelijke bibliotheekversie, licentie, achtergebleven placeholders en toegestane imports. Maak de builddatum instelbaar voor reproduceerbare artefacten. Houd de kleine bundler zolang concrete beperkingen geen onderhoudsprobleem vormen.

## Voorgesteld harness

Behoud `node:test` voor de pure logica en voeg Playwright toe als ontwikkelafhankelijkheid voor het gebouwde HTML-bestand. De gebruiker blijft uitsluitend één offline HTML-bestand nodig hebben. Gebruik een vastgelegde Node-LTS-versie, een vastgelegde Playwright-versie en een lockfile.

De [Node-testrunner](https://nodejs.org/api/test.html) biedt de bestaande testbasis. Gebruik bij browsercontroles [Playwright-asserties die op de verwachte schermtoestand wachten](https://playwright.dev/docs/test-assertions), zodat vaste slaapintervallen niet nodig zijn. Leg de browserinstallatie en uitvoering ook vast voor [CI](https://playwright.dev/docs/ci). Dit zijn voorgestelde ontwikkelkeuzes; ze zijn nog niet geïnstalleerd in het project.

| Laag | Te bewaken gedrag | Voorwaarde om te slagen |
| --- | --- | --- |
| Unit en regressie | Normalisatie, mapping, scoregrenzen, groepsbeperkingen, schermtoestand; alle B01–B12-reproducties. | Elke concrete bug krijgt eerst een falende test van de gewenste uitkomst, daarna de oplossing. |
| Invarianten | Iedere bronrij precies één keer; verschillende geldige BTW-nummers niet in één groep; menselijke uitsluitingen gerespecteerd; wijzigen van strengheid verandert automatische samenvoegingen niet. | Geen schending bij gerichte voorbeelden en herhaalbare gegenereerde gevallen. |
| Varianten | Formaatvarianten van telefoon/naam/adres, kolomvolgorde en herhaalde export/import. | Verwachte identiteit en gegevensbehoud blijven gelijk. Uploadvolgorde mag volgens de bestaande afspraak wel de gekozen bronwaarde bij gelijkspel bepalen. |
| Bestandscontract | CSV-tekensets en quoting, `.xls` en `.xlsx`, meerdere tabbladen, lege/onjuiste bestanden, lege/dubbele koppen, grote celwaarden, alle extra velden. | Opnieuw geopende export voldoet aan het schema; aanvullende XML-controle vindt geen formulecellen. Verworpen inhoud geeft een bruikbare melding. |
| Browser | Upload → mapping → verwerking → review → export, Z/V/Later, ontkoppelen, strengheid, terugnavigeren, profielen en exportrevisies. | Verwachte uitkomst in de gedownloade XLSX; geen onverwachte consolefouten, page errors of CSP-schendingen. |
| Offline distributie | Werkelijke productiebuild via `file://`; hashes, licentie, nul externe bronnen; actieve CSP-proef; tekst blijft tekst. | Normale stroom probeert geen netwerkverkeer. De bewuste netwerkproef wordt aantoonbaar door CSP tegengehouden. Alleen verkeer met een testinterceptor afbreken is onvoldoende bewijs. |
| Matchkwaliteit | Kandidaatselectie, paarscores én uiteindelijke groepen tegenover onafhankelijke labels. | Nul foute automatische samenvoegingen in de vastgelegde regressieset; gemiste dubbels en werklast blijven binnen afgesproken grenzen. |
| Prestaties | 1k/10k/50k rijen; veel unieke rijen, veel duplicaten en sterk gedeelde sleutels. | Tijd, piekgeheugen, langste browserblokkade, aantallen kandidaten en exportgrootte binnen een versiebeheerd budget op dezelfde referentiemachine. |

Begin voor gegenereerde tests met kleine deterministische generators en een vaste seed. Een generiek property-testingpakket is pas nodig als dat de tests aantoonbaar eenvoudiger maakt. Verwachte uitkomsten mogen niet uit dezelfde score- of clusterfunctie worden afgeleid die wordt getest.

Voor de kwaliteitsset zijn drie metingen nodig: hoeveel gelabelde dubbels de kandidaatselectie bereikt, hoeveel automatisch samengevoegde paren/groepen echt kloppen, en hoeveel handmatige beoordelingen overblijven. Neem ook positieve voorbeelden buiten de huidige kandidaatselectie op; uitsluitend bestaande twijfelparen beoordelen veroorzaakt een blinde vlek. Houd een aparte validatieset achter om instellingen op af te toetsen na afstelling. “Nul fouten in deze set” is een acceptatiecriterium, geen claim over alle toekomstige lijsten.

## Uitvoering in zes stappen

| Stap | Concrete wijziging | Gereed wanneer |
| --- | --- | --- |
| 1. Reproduceerbare basis | Leg Node en ontwikkelafhankelijkheden vast; vervang echte fixturewaarden; voeg synthetische builders en een centraal controlecommando toe. Splits publieke tests en private kwaliteitsmeting. | Een verse checkout kan de synthetische tests en build draaien zonder `testdata/`. De private releasecontrole meldt expliciet dat verplichte gegevens ontbreken. |
| 2. Gegevens en beslissingen | Leg B01, B02, B03, B04 en B06 vast als regressies en herstel ze in kleine wijzigingen. Spreek de exportregels voor extra/conflicterende waarden af in documentatie. | Geen genegeerde uitsluitingen, geen stille dataverliezen, correcte herimport, sterke identificatoren blijven werken boven 400 rijen. |
| 3. Betrouwbare evaluator | Herstel B05; maak datasetmanifest, gedeelde labelparser, validatie en metingen van kandidaat-, paar- en groepsresultaten. Repareer de benchmarkgenerator. | Een ongeldige, lege of onvolledige vereiste kwaliteitsset wordt nooit groen. Een bewust ingebouwde fout in kandidaten of groepen wordt gevonden. |
| 4. Browserregressies | Voeg Playwright-controles van productie-HTML via `file://` toe en herstel B07–B11. Test de gedownloade werkmap. | De volledige stroom slaagt, inclusief negatieve gevallen, profielen, wijzigingen na export en herstelbare fouten. |
| 5. CI en prestatiebudget | Draai synthetische unit-, contract-, build- en browsercontroles op elke wijziging. Meet grote sets apart bij releases of wijzigingen aan IO/engine. Leg baseline en budget vast na herhaalde metingen. | CI kan een release blokkeren, fouten zijn met seed/fixture herhaalbaar en rapporten bevatten geen echte leads. |
| 6. Acceptatie op de doelcomputer | Laat het team de private testset beoordelen; voer de productie-HTML met dubbelklik uit in Edge en Chrome op Windows zonder netwerk. Controleer de export in Excel. | Matchkwaliteit, werklast en prestaties zijn aanvaard; alle P1-bevindingen zijn opgelost en vereiste controles slagen. |

De logische eerste implementatieronde is **stap 1 plus de regressies voor B01–B03**. Dat geeft direct bescherming tegen de grootste gevolgen: onbedoeld samenvoegen, ontbrekende gegevens en adresvervorming. Daarna kunnen de overige wijzigingen in hetzelfde controleproces worden opgenomen.

## Voorgestelde commando's en mappen

Deze interface is een voorstel; de commando's bestaan nog niet allemaal:

```text
npm run check             synthetische logica, invarianten, bestandscontract en productiebuild
npm run check:browser     productie-HTML via file:// en controle van de download
npm run check:quality     verplichte beoordeelde privédataset, lokaal, met strikte validatie
npm run check:perf        vaste seeds en datasets, vergelijking met prestatiebudget
npm run check:release     volledige vereiste controle; ontbrekende onderdelen geven een fout
```

Plaats synthetische fixtures en builders onder `test/fixtures/` en `test/helpers/`, browsercontroles onder `test/browser/`, en invoer/evaluatie van de kwaliteitsset in een gedeelde toolmodule. Laat testcommando's hun tests expliciet selecteren, zodat `node --test` niet onbedoeld Playwright-bestanden uitvoert. Rapporten, screenshots, traces en downloads komen in een genegeerde map. Private rapporten blijven lokaal en horen niet bij CI-artefacten.

Het centrale commando moet ook de offline projectafspraken bewaken: geen externe bronnen, geen ingelezen HTML-injectie, tekstcellen bij export en geen echte leads in fixtures. Gebruik dekking om gaten te vinden; een hoog percentage vervangt de functionele acceptatiecriteria niet. Test het harness zelf gericht door bijvoorbeeld de BTW-blokkering, een vereiste exportwaarde of de CSP tijdelijk fout te maken en te bevestigen dat de bijbehorende controle faalt.

### Opruimcontract (ingevoerd op 17 oktober 2026)

- Alle tijdelijke uitvoer en proefkopieën gaan via `withHarnessWorkspace` naar `dist/.harness-tmp/`.
- Publieke tests erven deze map via `TMPDIR`, `TMP` en `TEMP`. Browserdownloads en prestatie-XLSX worden
  heropend en gecontroleerd vóór de tijdelijke map wordt verwijderd.
- Succes, fout, time-out en onderbreking moeten opruimen. Na SIGKILL of een herstart ruimt de volgende run
  verlaten werkmappen op. Werkmappen van actieve processen blijven onaangeroerd.
- JSON-rapporten, controlesommen, foutlogs, productie-HTML, private invoer, beoordelingen en Windows-bewijs
  blijven bewaard. Opruiming mag een mislukte of onvolledige controle nooit groen maken.
- `node tools/clean.mjs --dry-run` toont het volume; `node tools/clean.mjs` verwijdert uitsluitend herkenbare
  oudere synthetische uitvoer. Symbolische koppelingen worden niet gevolgd.
- `test/opruimen.test.mjs` controleert behoud van gegevens, gelijktijdige runs, foutpaden en onderbrekingen.

## Lokaal auditbewijs

De synthetische auditresultaten staan onder `dist/audit/`, dat al door Git wordt genegeerd:

- `gevallen-resultaat.json`: waargenomen uitkomsten van de gerichte reproducties.
- `browser-resultaat.json`: volledige basisstroom, export en wijziging na downloaden.
- `browser-extra-resultaat.json`: tekstinjectie, actieve CSP-proef, profielherstel en hashes.
- `browser-export.xlsx` en `browser-controle.png`: voormalige tijdelijke download en schermafbeelding,
  verwijderd bij de opruiming van 17 oktober 2026; de resultaatrapporten blijven bewaard.

Deze bestanden zijn lokale audituitvoer. De duurzame borging ontstaat door de gewenste uitkomsten in de voorgestelde regressietests op te nemen. De bestaande privélijsten zijn alleen lokaal verwerkt; in dit document zijn daarvan uitsluitend aantallen opgenomen.
