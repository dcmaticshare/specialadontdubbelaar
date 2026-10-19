# Vierde implementatieronde — 17 oktober 2026

Deze ronde behandelt B12 en de prestatielaag van het [controleplan](Controle-en-harnessplan.md).
De ronde is uitgevoerd in de bestaande lokale werkmap; eerdere wijzigingen en gebruikersinstructies zijn behouden.
Er is geen commit of publicatie gedaan.

Vervolg: het onderzoek en herstel van de hier gemeten tijd- en geheugenregressies staan in
[Prestatieherstel.md](Prestatieherstel.md). De historische metingen in dit document blijven ongewijzigd.

## Generator en onafhankelijke waarheid

De bestaande BTW-generator is eerst zonder gedragswijziging uit `bench.mjs` gehaald. Twee regressies faalden
op het bestaande nummer van elf cijfers: de onafhankelijke lengte-/modulo-97-controle en het geldige pad in
de normalisatie. De herstelde generator levert tien cijfers, een controlegetal en een vaste opmaak. Indices
buiten het synthetische bereik worden geweigerd. Alle domeinen eindigen op `.invalid`.

Voor elk scenario worden eerst bedrijfsidentiteiten toegewezen en met seed 12345 geschud. Pas daarna wordt
celinhoud gemaakt. De verwachte groepen worden nooit uit normalisatie, kandidaatselectie, scores of clusters
afgeleid. Iedere gemeten export wordt opnieuw geopend en volledig gecontroleerd: alle bronrijen precies één
keer, exacte verwachte groepen, alle oorspronkelijke cellen en de samengevoegde extra waarden, uitsluitend
tekstcellen zonder formules. De testset controleert ook bewust verdwenen cellen en verkeerde groepsindelingen.

| Scenario | Identiteiten en gedeelde gegevens |
| --- | --- |
| `uniek` | 95% verschillende bedrijven, 5% herhaalde rijen; eigen contactgegevens en adres. |
| `duplicaten` | 25 bronrijen per bedrijf; variatie in hoofdletters en rechtsvorm; eigen contactgegevens. |
| `gedeeld` | Twee rijen per bedrijf, telefoons gedeeld over 50 rijen, twee algemene domeinen over de hele lijst. Verschillende geldige BTW-nummers bewaken de bedrijfsgrenzen. |

In `uniek` en `duplicaten` heeft iedere vijfde identiteit geen BTW: ook zekere samenvoeging op andere
signalen blijft verplicht. Opmerkingen bevatten een voorloopteken `=`, een scheidingsteken, aanhalingstekens
en een regeleinde. Het behoud daarvan wordt in iedere werkmap gecontroleerd. Iedere grootte gebruikt dezelfde
zeven bronkolommen. Dit zijn doelgerichte regressiescenario's, geen representatieve kwaliteitssteekproef.

## Meetmethode

De volledige matrix bestaat uit 1.000, 10.000 en 50.000 rijen, drie scenario's, Node en Chrome, en drie
herhalingen: 54 metingen. Zij lopen sequentieel. Elke Node-meting krijgt een nieuw proces; elke browsermeting
een nieuwe headless Chrome en een leeg profiel. De browser gebruikt de werkelijke productie-HTML via `file://`
en bedient upload, koppelen, verwerken en downloaden. De XLSX-controle draait daarna in een afzonderlijk proces.
Fixtures maken, browserstart, Playwright-wachttijd en heropenen van de export vallen buiten de fasetijden.

De Performance API registreert inlezen, koppelen, normaliseren, kandidaatselectie, scoren, voorbereiden,
groeperen, werkmap opbouwen en XLSX serialiseren. Voorbereiden omvat de drie onderliggende enginefasen plus
afstaan van de uitvoering; de totaaltijd telt deze onderliggende fasen niet dubbel. Browserkoppelen omvat de
opbouw van het koppelscherm en de beleidscontrole; Node meet daar alleen de kolomvoorstellen. Daardoor zijn
hun afzonderlijke budgetten noodzakelijk. Er worden alleen tijden en aantallen in performance-items gezet,
geen bronwaarden; per fase blijft uitsluitend de laatste meting bewaard.

Chrome gebruikt de Long Tasks API voor de langste hoofdthreadtaak en een timer met interval 20 ms voor de
grootste vertraging. De laatste exporttaak wordt afgewacht voordat beide worden uitgelezen. Een faseoverlap
kan dezelfde taak bij meerdere fasen tonen; de algemene langste blokkade telt de taak één keer. De timermaat
is een waarneming tijdens deze automatisering, geen universele reactietijdgarantie. Ontbrekende ondersteuning
van Long Tasks maakt een browsermeting ongeldig.

Node rapporteert `process.resourceUsage().maxRSS` als OS-piek van een vers proces, omgerekend van KiB naar
bytes. Dit omvat runtime, generator, engine en export, vóór heropenen. Het is geen geïsoleerde heapmeting per
fase. Voor de gezamenlijke Chrome-processen is geen betrouwbare piek beschikbaar: een JS-heapmomentopname
of CDP-steekproef kan synchrone pieken en ArrayBuffers missen. Browsergeheugen staat daarom expliciet op
`null` met de methode `niet-beschikbaar`; een ontbrekende Node-piek mag nooit op die manier worden overgeslagen.

## Validatie en beperkingen

De meetvalidator is eerst met een lege implementatie uitgevoerd: overschrijdingen, ontbrekende fasen,
ongeldige getallen, ontbrekende scenario's en falende kwaliteitscontrole werden toen ten onrechte aanvaard.
De regressies eisen dat die gevallen falen. De uitvoerbare poort controleert iedere afzonderlijke herhaling,
de volledige matrix, de seed, meetversie, runtime/machine en de kwaliteitscontrole. Een baseline-opdracht
schrijft metingen, maar doet uitdrukkelijk nog geen uitspraak over prestatiebudgetten.

Alle ruwe rapporten, downloads en private controles blijven onder `dist/`. Het duurzame meetoverzicht staat
in [Prestatiebaseline.json](Prestatiebaseline.json); de volledige uitvoerbare grenzen staan in
`SETTINGS.prestaties.budgetten` in [src/settings.js](../src/settings.js).

## Gerichte wijzigingen na de eerste meetreeks

De eerste 54 metingen bevestigden dat werkmapopbouw en XLSX-serialisatie samen de langste browsertaak
veroorzaakten. Ook groeperen herhaalde veel werk voor de andere strengheidsstanden.

- `textSheet` schrijft tekstcellen via SheetJS in begrensde blokken van 1.000 rijen. Het tabblad Oorspronkelijke
  gegevens levert zijn rijen als iterator; de volledige rijmatrix en een tweede tekstmatrix hoeven niet meer tegelijk te bestaan.
  Excel-grenzen, kolombreedtes, filters en exacte celtekst blijven gecontroleerd. De iteratorregressie faalde
  eerst op het ontbrekende filter. Minder tussenkopieën is op zichzelf geen bewijs voor een lagere OS-piek.
- `assemble` gebruikt dezelfde groepen en blokkeringen voor standen met exact dezelfde zekere verbindingen.
  Zodra een aangepaste stand ook de zekerheid verandert, wordt wel volledig hergroepeerd. De regressie voor
  zo'n aangepaste stand en de bestaande uitsluitings- en BTW-tests blijven van toepassing.
- Normaliseren staat de uitvoering na elke 1.000 rijen af; het bestaande scoren blijft per 3.000 paren werken.
  De browser krijgt ook tijd tussen werkmapopbouw en serialisatie. Downloaden toont tijdelijk **Bestand maken…**;
  opnieuw downloaden en terugnavigeren zijn gedurende de export uitgeschakeld. Dit maakt de afzonderlijke
  synchrone Excel-serialisatie niet onderbreekbaar.

Een tussenmeting met een pauze van nul milliseconden liet zien dat losse Long Tasks niet het hele verhaal
vertellen: bij 50.000 vooral unieke rijen was de langste taak 3,94 s, maar de timervertraging nog 5,77 s.
De meetreeks is daarom onderbroken en is geen geldige baseline. De exportpauze is vastgelegd op 25 ms;
de gerichte hercontrole gaf 3,84 s voor de langste taak en 3,82 s timervertraging. Daarna is de volledige
eindmatrix opnieuw uitgevoerd en gecontroleerd. De twee exportpauzes tellen niet mee in de som van de gemeten fasen; de
wachttijd tijdens normaliseren en scoren zit wel in die fasen. De gerapporteerde totaaltijd is dus een som
van verwerkingsfasen, geen kloktijd tussen de eerste upload en het bedienen van de downloadknop.

Deze wijzigingen veranderen geen matchinggrenzen. In de private vergelijking zijn alle kandidaten,
groepsleden, paarscores, twijfelparen, bronstatistieken en strengheidsaantallen gelijk aan de bewaarde code van
ronde 3. De uitkomst blijft 1.357 rijen, 1.128 leads, 214 automatische groepen en 98 twijfelparen; de zes gekende
gevallen blijven goed en Streng/Gemiddeld/Mild blijft 152/98/73. De 212 private oordelen zijn nog leeg en die
controle faalt terecht. De werkmap, het manifest, `CLAUDE.md` en `AGENTS.md` zijn met SHA-256 ongewijzigd bevonden.

## Herhaalde resultaten en referentie

Referentie: deze Mac met **Apple M5 Pro, 24 GiB RAM, arm64, Darwin 27.0.0**, **Node 24.19.0**,
**Chrome 155.0.8059.84** en **Playwright 1.62.1**. Beide volledige meetreeksen hebben 54 geldige metingen:
voor de gerichte wijzigingen en erna, steeds dezelfde scenario's en seed. De afgebroken tussenreeks wordt
niet als baseline gebruikt. De bronhash van elke meetreeks staat in het versiebeheerde meetoverzicht; de
budgetwaarden zijn pas na de eindmeting aan de instellingen toegevoegd.

De onderstaande tijden zijn medianen van drie metingen; blokkade, timer en RSS zijn maxima. Getallen zijn
alleen voor deze scenario's en referentiemachine bruikbaar. De afzonderlijke fasetijden en alle drie ruwe
waarden per maat staan in het JSON-overzicht. De kolommen met aantallen en bestandsgrootte tonen maxima.

| Rijen | Scenario | Node mediaan (s) | Chrome mediaan (s) | Chrome blokkade / timer max (s) | Node RSS max (GiB) | Kandidaten | XLSX (MiB) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 | uniek | 0,16 | 0,14 | 0,08 / 0,07 | 0,19 | 50 | 1,01 |
| 1.000 | duplicaten | 0,18 | 0,17 | 0,08 / 0,07 | 0,20 | 12.000 | 1,00 |
| 1.000 | gedeeld | 0,27 | 0,24 | 0,08 / 0,06 | 0,27 | 24.500 | 0,89 |
| 10.000 | uniek | 1,61 | 1,38 | 0,79 / 0,78 | 0,63 | 517 | 10,45 |
| 10.000 | duplicaten | 1,56 | 1,57 | 0,69 / 0,67 | 0,77 | 120.000 | 11,03 |
| 10.000 | gedeeld | 2,69 | 2,44 | 0,69 / 0,68 | 0,85 | 245.008 | 9,11 |
| 50.000 | uniek | 10,34 | 7,97 | 3,94 / 3,93 | 2,99 | 2.667 | 53,51 |
| 50.000 | duplicaten | 11,09 | 8,56 | 3,79 / 3,78 | 2,96 | 600.000 | 57,36 |
| 50.000 | gedeeld | 17,51 | 13,57 | 3,69 / 3,69 | 3,96 | 1.225.284 | 46,34 |

De gerichte wijzigingen leveren kortere browserblokkades op, maar **geen algemene versnelling**:

| Scenario, 50k | Node totaal voor → na (s) | Chrome totaal voor → na (s) | Chrome langste blokkade voor → na (s) | Node RSS max voor → na (GiB) |
| --- | ---: | ---: | ---: | ---: |
| uniek | 9,69 → 10,34 | 7,13 → 7,97 | 5,35 → 3,94 | 2,18 → 2,99 |
| duplicaten | 10,58 → 11,09 | 8,35 → 8,56 | 4,87 → 3,79 | 3,42 → 2,96 |
| gedeeld | 16,36 → 17,51 | 13,33 → 13,57 | 5,09 → 3,69 | 3,57 → 3,96 |

Groeperen van 50k duplicaatrijke rijen daalde in mediaan van circa 1,27 naar 0,82 s in Node en van 0,86
naar 0,51 s in Chrome. Toch steeg de totale tijd licht: kleinere taken, extra pauzes en de gewijzigde
exportopbouw kosten tijd. De piek-RSS daalde bij duplicaten, maar steeg bij vooral unieke en gedeelde gegevens.
Minder tijdelijke celmatrices is dus nadrukkelijk geen aangetoonde algemene geheugenbesparing; de GC en de
levensduur van andere grote structuren bepalen mede de gemeten procespiek. Die ongunstige uitkomsten zijn
mee vastgelegd en worden niet als winst voorgesteld.

## Budgetten en uitvoerbare afkeuring

Er zijn achttien afzonderlijke budgetten: per runtime, scenario en grootte. Zij zijn afgeleid van het
**maximum** van de drie eindmetingen, niet van een gunstige individuele uitvoering:

- Fasetijden: maximum × 1,5, naar boven afgerond op 50 ms, minimaal 50 ms.
- Totale fasetijd: maximum × 1,5, naar boven op 100 ms, minimaal 500 ms.
- Langste browsertaak en timervertraging: maximum × 1,5, naar boven op 100 ms, minimaal 200 ms.
- Node piek-RSS: maximum × 1,25, naar boven op 64 MiB. Geen verzonnen geheugenbudget voor Chrome.
- Exportbytes: maximum × 1,05, naar boven op 1 KiB. Kandidaatverbindingen: exact het waargenomen maximum.

Dit zijn expliciete **regressiegrenzen**, geen uitspraak dat een blokkade van enkele seconden prettig is.
Bij 50k liggen de browsergrenzen voor blokkade/timer op 6,0 / 5,7 / 5,6 s voor uniek / duplicaten / gedeeld.
De Node-geheugengrenzen voor die gevallen zijn 3,75 / 3,75 / 5,00 GiB. De exacte fase- en totaalgrenzen staan
in de instellingen. Verander een grens alleen bewust na onderzoek; een meetopdracht past ze nooit zelf aan.
Verander bij een ander scenario-contract ook de meetversie en maak een nieuwe baseline.

`node tools/check-perf.mjs` voert eerst de publieke tests en kwaliteitsset uit, bouwt de productie-HTML en
meet de volledige matrix. Alle 54 metingen moeten geldig en binnen hun grenzen zijn. Veranderde broncode
tijdens een meetreeks wordt geweigerd. `--meet dist/map` verzamelt een nieuwe volledige, geldige baseline zonder
budgetoordeel; `--controleer rapport.json` toetst een opgeslagen rapport zonder opnieuw te meten. Een
onvolledige reeks, verkeerde machine/runtime, ontbrekende fase, ongeldige getallen of ontbrekend kwaliteitsbewijs
geeft exitcode 1. De browsermeting vereist ook werkelijk gelopen timertikken en geldige Long Tasks-gegevens.

De poort is uitgevoerd op de 54 eindmetingen en slaagt. Afzonderlijke CLI-proeven met een bewust overschreden
totaaltijd, een verwijderde inleesmeting en de afgebroken tussenreeks falen alle met exitcode 1 en een concrete
foutmelding. Publieke tests testen ook overschrijding van fase-, geheugen-, kandidaat-, export- en
responsiviteitsgrenzen, ongeldige budgetten, dubbele/ontbrekende metingen, verkeerde meetmethoden en mislukte
kwaliteitscontrole. Snelheid compenseert nooit onjuiste groepen of verloren gegevens.

## Eindvalidatie en lokaal bewijs

| Controle | Resultaat |
| --- | --- |
| Eerste B12-regressies | Twee tests rood op de oude generator; daarna groen. |
| Eerste meetvalidator | 24 afkeurtests rood, één geldig rapport groen; daarna alle controles groen. |
| Publieke suite | 239 geslaagd, nul mislukt of overgeslagen; 46 nieuwe tests in deze ronde. |
| Kopie zonder private data en `node_modules/` | Dezelfde 239 tests en volledige buildcontrole geslaagd. |
| Productie- en ontwikkelbuild | 13 modules, circa 1089 kB. Productie tweemaal byte-identiek; CSP-hashes, vendor en offline bestandscontract goed. |
| Publieke kwaliteitsset | Vijf synthetische bronrijen, tien onafhankelijke beoordelingen, alle foutmaten nul. |
| Herhaalde prestaties | 54 metingen vóór de gerichte wijzigingen en 54 eindmetingen. Eindmatrix volledig binnen de vastgelegde budgetten. |
| Negatieve CLI-proeven | Overschreden totaaltijd, ontbrekende fase en onderbroken meetreeks geven zichtbaar exitcode 1. |
| Definitieve Chrome-regressies via `file://` | Alle bestaande browsergevallen geslaagd; nul onverwachte consolefouten of netwerkverzoeken, geen inline stijlen; actieve fetchproef door CSP geblokkeerd. |
| Extra 50k-proef na het vastleggen van de budgetten | Sterk gedeelde sleutels: 14,17 s fasetijd, 3,806 s langste taak, 3,798 s timervertraging; alle fase- en overige budgetten goed. Werkelijke XLSX opnieuw volledig gecontroleerd. |
| Verkennende `bench.mjs`-opdracht | 1.000 unieke/duplicaatrijen verwerkt, werkmap heropend en gecontroleerd; expliciet geen volledige prestatiepoort. |
| Private lijsten en vergelijking met ronde 3 | Zes gekende gevallen goed; alle groepen, kandidaten en scores gelijk. Onbeoordeelde set faalt terecht met 212 lege oordelen. |
| Bewaarde gebruikersbestanden | SHA-256 van `CLAUDE.md`, `AGENTS.md`, private beoordelingswerkmap en manifest ongewijzigd. |

De definitieve 50k-schermafbeelding is bekeken: de samenvatting, downloadknop en melding zijn leesbaar en
volledig zichtbaar. De productie-CSP blijft `connect-src 'none'`; het distributiebestand blijft één offline
HTML zonder externe bronnen. Alle exportcellen blijven tekst.

Belangrijke lokale bewijsbestanden:

- `dist/controle/vierde-ronde-b12-rood.log`, `vierde-ronde-harness-rood.log` en `vierde-ronde-exportstroom-rood.log`.
- `dist/prestaties/ronde4-voor/rapport.json` en `dist/prestaties/ronde4-eindmeting/rapport.json` met controlesommen. De bijbehorende synthetische XLSX-bestanden en screenshots zijn op 17 oktober 2026 opgeruimd.
- `dist/prestaties/ronde4-na/rapport.json`: bewust onderbroken tussenmeting; geen geldige baseline.
- `dist/controle/vierde-ronde-prestatiepoort.log`, `vierde-ronde-overschrijding.log`, `vierde-ronde-ontbrekende-fase.log` en `vierde-ronde-onderbroken-reeks.log`.
- `dist/controle/vierde-ronde-controle.log`, `vierde-ronde-zonder-private.log`, `vierde-ronde-browser.log`, `browser-resultaat.json` en `vierde-ronde-definitief-50k.*`.
- `dist/controle/vierde-ronde-private*`, `vierde-ronde-onbeoordeeld.*`, `vierde-ronde-bewaard.json` en `ronde4-vooraf/`: lokale private vergelijking en behoudsbewijs.

## Grenzen die blijven gelden

De budgetten zijn lokaal reproduceerbare regressiegrenzen, geen prestatiebelofte voor Windows of voor andere
lijsten. Er is nog geen Windows/Edge-acceptatie zonder netwerk en geen CI-installatie uitgevoerd. De vaste
scenario's meten zevenkoloms-CSV-invoer en XLSX-uitvoer; brede Excel-invoer, veel meer kolommen, omvangrijke
historische herkomst en zeer grote afzonderlijke groepen kunnen andere kosten of Excel-limieten opleveren.
De duplicaatgroepen in deze prestatiematrix hebben 25 leden; de afzonderlijke regressies bewaken ook 401+
leden en het compacte pad. De 212 private waarheidlabels blijven een menselijke beoordelingstaak.

Voor interactie binnen bijvoorbeeld 100 ms is verdere architectuur nodig: vooral XLSX-serialisatie en
werkmapopbouw zijn nog synchrone taken. Deze ronde verplaatst die niet naar een worker en voegt geen
annulering toe. Ook indexopbouw, bronkolombeleid en groeperen kunnen nog langer dan een frame duren.
Het geheugenbudget is alleen voor de gemeten Node-procespiek; browserpiekgeheugen blijft expliciet onbekend.
Er wordt geen algemene matchkwaliteit, algemene geheugenbesparing of algemene snelheidswinst geclaimd.
