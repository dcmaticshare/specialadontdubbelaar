# Eerste implementatieronde — 17 oktober 2026

Deze ronde voert de vaste testbasis en de oplossingen voor B01, B02, B03 en de bijbehorende B06 uit.
Het oorspronkelijke [auditplan](Controle-en-harnessplan.md), `AGENTS.md` en de bestaande wijziging aan
`CLAUDE.md` zijn behouden. Er is geen commit of publicatie gedaan.

## Wijzigingen

- Node 24.19.0 LTS, pnpm 11.25.0 en Playwright 1.62.1 staan vast; de ontwikkelafhankelijkheid heeft een lockfile.
  `node tools/check.mjs` voert de publieke tests en de controle van beide HTML-builds uit.
  `SOURCE_DATE_EPOCH` maakt de builddatum reproduceerbaar. De browsercontrole staat afzonderlijk.
- Echte contactwaarden in tests zijn vervangen door verzonnen voorbeelden met dezelfde relevante patronen.
  De bestaande 90 tests bleven daarbij slagen. Builders en vaste seeds zijn herbruikbaar.
  Private controles draaien niet meer stilzwijgend in de publieke tests en ontbrekende beoordelingen worden expliciet afgewezen.
- B01: iedere groepsvereniging bewaakt uitsluitingen tussen alle leden. Een besluit op twee getoonde groepen
  wordt vastgelegd voor alle betrokken bronparen, ook buiten de kandidaatselectie. Ontkoppelen scheidt alle leden.
  Tegenstrijdige handmatige ketens blijven als conflict zichtbaar.
- B06: de gedeelde beslisfunctie controleert vóór toepassing op BTW-conflicten en eerdere uitsluitingen.
  Een geweigerde keuze verandert de groepen en besluiten niet, krijgt geen succeslog en laat het paar zichtbaar.
- B02: de vaste uploadkolommen blijven vooraan; extra contactkolommen groeien mee. Niet gekoppelde kolommen
  staan achteraan als `Extra: …`. Het extra tabblad `Oorspronkelijke gegevens` bewaart alle ingelezen cellen met
  hun herkomst, inclusief alternatieve namen, adressen, websites, contactpersonen en niet herkende waarden.
  De exportregel staat volledig in [README](../README.md#export-en-herimport) en [Handleiding](Handleiding.md).
- B03: de eigen kolomindeling beschermt Nr en andere metadata tegen adreskoppeling en oude bronprofielen.
  Gewone bronnen behouden Nr als huisnummer. Busnummers en alle genummerde contactkolommen blijven bruikbaar
  na herimport. Het volledige resultaatbestand neemt ook eerdere herkomstgegevens mee.
- Voor betrouwbare bronverwijzingen is de aangrenzende B08 meegenomen: gevulde kolommen zonder kop worden
  niet afgesneden en verschoven Excel-tabellen bewaren de oorspronkelijke rij- en kolomnummers.
  Ingelezen celtekst behoudt ook omringende spaties; normalisatie blijft afzonderlijk.
- De voortgangsbalk gebruikt een native `progress`-element en maakt geen inline stijl meer.
  Een besluit, ontkoppeling of strengheidswijziging maakt de eerdere downloadmelding ongeldig.

## Bewijs en controles

De eerste 18 regressies voor B01–B03/B06 zijn vóór de oplossingen uitgevoerd: alle 18 faalden.
Na de oplossingen slagen ze. De uitgebreidere tests omvatten de zes uploadvolgordes van een driehoek,
ketens buiten de kandidaatparen, tegenstrijdige besluiten, groepskeuzes en ontkoppelen.
Er zijn ook invarianten over 40 vaste seeds op alle drie de strengheidsniveaus: iedere invoerrij eenmaal,
geen groep met verschillende geldige BTW-nummers en respect voor elke menselijke uitsluiting.

| Controle | Resultaat |
| --- | --- |
| `node tools/check.mjs` | 111 tests geslaagd; nul mislukt, nul overgeslagen. |
| Schone kopie zonder `testdata/` en zonder `node_modules/` | Dezelfde publieke controle geslaagd; geen privélijsten of pakketten nodig. |
| Productie- en ontwikkelbuild | Beide slagen; circa 1066 kB, 12 modules. Herhaalde builds met dezelfde datum zijn byte-identiek. |
| Gebouwde HTML | Vendorhash, SheetJS-versie, script- en stylesheet-CSP-hashes, placeholders en afwezigheid van externe bronnen gecontroleerd. Productie behoudt `connect-src 'none'`. |
| XLSX-contract | Geschreven en opnieuw geopende XLSX behoudt de eerste uploadkolommen, alle contacten, extra kolommen en oorspronkelijke cellen. Alle cellen zijn tekst; ook de opgeslagen worksheet-XML bevat geen formules. |
| Herimport | Drie rondes met een gewoon adres, numerieke bus en busletter; extra contacten blijven bruikbaar bij combineren met een nieuwe lijst. Oude profielen en echte Nr-kolommen zijn apart getest. |
| Gerichte browsercontrole | Chrome 155.0.8059.84 op deze Mac, productie-HTML via `file://`: upload, mapping, samenvoegen, groepsbesluit, ontkoppelen, BTW-afwijzing, download en herimport geslaagd. Werkelijke downloads opnieuw geopend. |
| Browser en offline gedrag | Nul onverwachte consolefouten en netwerkverzoeken. HTML-invoer blijft tekst. De actieve fetchproef wordt door CSP tegengehouden vóór de netwerkinterceptor. |
| Private lijsten | 1357 rijen, 1128 unieke leads, 214 automatisch samengevoegde groepen; zes gekende gevallen OK. |
| Ontbrekende beoordeelde testset | De afzonderlijke controle geeft expliciet exitcode 1; dit wordt niet als geslaagde kwaliteitsmeting gerapporteerd. |
| Lokale privacyvergelijking | Geen oorspronkelijke telefoon-, e-mail- of BTW-celwaarden uit de privélijsten letterlijk teruggevonden in de publieke tests. Alleen aantallen gerapporteerd. |

Synthetische controle-uitvoer en downloads staan lokaal onder `dist/controle/`. De private uitvoer staat daar
apart als `private-controle.log` en mag niet gedeeld worden. De map is genegeerd door Git.

## Resterende beperkingen

Dit is geen volledige releaseacceptatie. B04 (sterke sleutels boven 400 rijen), de volledige evaluator uit B05,
CI, brede browserdekking, prestatiebudgetten en de Windows-controle zonder netwerk blijven vervolgwerk.
De bestaande benchmark en `tools/testset.mjs --meet` zijn nog geen betrouwbare releasepoort.
De beoordeelde private kwaliteitsset ontbreekt; er wordt geen algemene matchkwaliteit geclaimd.
B07, het profielherstel van B10 en de normalisatiegevallen van B11 zijn hier niet opgelost.

De herkomstgegevens groeien bij elke export-/importronde, omdat ook de actuele invoercellen worden toegevoegd.
Excel heeft eindige cel-, rij- en kolomlimieten; overschrijding geeft een fout in plaats van stil afkappen.
Alleen het eerste tabblad kopiëren verliest de eerdere herkomst en alternatieve hoofdwaarden; daarvoor moet
het volledige resultaatbestand worden bewaard. Historische besluiten worden bij een nieuwe verwerking niet herhaald.

Een andere uploadvolgorde kan bij gelijkwaardige opties bepalen welke hoofdwaarde of toegestane groep wordt
gekozen. De uitsluitings- en BTW-invarianten blijven altijd gelden. Beslissingen op grote groepen worden als
bronparen vastgelegd; de kosten daarvan moeten in de latere prestatieronde worden gemeten.
