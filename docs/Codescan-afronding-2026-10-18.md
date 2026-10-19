# Afronding codescan — 18 oktober 2026

Vervolg: het [prestatieherstel na deze controle](Prestatieherstel-codescan-2026-10-18.md) levert een
nieuwe volledige meetreeks binnen alle ongewijzigde budgetten. Dit verslag en zijn bewijsbestand blijven
de oorspronkelijke, afgekeurde prestatiereeks documenteren.

Item 34 van [de codescan](Codescan-2026-10-18.md) stemt de documentatie af op de fixes van items 1–33.
De voorafgaande taak voor item 33 was voltooid vóór deze documentatiewijzigingen en integratiecontroles.
Deze taak wijzigt geen toepassingsgedrag, testverwachtingen, grenzen, private labels of releasecontract.
Er is daarom geen nieuwe gedragsregressie nodig; de bestaande volledige controles worden uitgevoerd.

## Documentatie

- De [handleiding](Handleiding.md) noemt de acht ondersteunde bestandstypen, hervatten vanuit Kolommen,
  bevestiging vóór het wissen van beoordelingen en de limiet van 300 zichtbare rijen. De volledige export
  blijft beschikbaar. Ook uitstelrotatie, sneltoetsfocus, groepsgrenzen, dubbele kolomkeuzes, inleesgrenzen,
  compacte sessieopslag, nieuwere bronprofielen en herstel na een onverwachte fout zijn beschreven.
- De [README](../README.md) beschrijft de gewijzigde opslag, matching, contactnormalisatie, browsercontroles
  en op SHA vastgelegde CI-acties. Gemeentenaam, aantallen per private bronlijst en oude aantallen twijfelparen
  zijn verwijderd. De release-instructie vereist de volledige releasepoort en behoud van de gecontroleerde HTML.
- Oudere audit- en releaseverslagen blijven historisch bewijs. Hun testaantallen en hashes zijn niet achteraf
  vervangen door de resultaten van deze ronde.
- Voor manifestformaat 2 blijft het [migratieplan van item 15](Kwaliteitscontrole.md#manifestformaat-2-en-behoud-van-bestaande-beoordelingen-codescan-15)
  gelden. Het bestaande private manifest wordt via compatibiliteit gelezen; geen blinde regeneratie of
  invulling van de 212 menselijke oordelen.

## Afsluitende integratiecontroles

De controles lopen met Node 24.19.0, Playwright 1.62.1 en lokale Chrome op deze Mac. De prestatiematrix
wordt sequentieel uitgevoerd met `runPerformanceSample`: iedere werkmap wordt heropend en inhoudelijk
gecontroleerd vóór opruimen. Er worden geen budgetten verhoogd of metingen uit verschillende reeksen gemengd.

```bash
export PATH="/Users/dieter/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export LEAD_BROWSER_CHANNEL=chrome
export SOURCE_DATE_EPOCH=1792195200
node tools/check-perf.mjs --meet dist/prestaties/codescan-34
node tools/check-perf.mjs --controleer dist/prestaties/codescan-34/rapport.json
node tools/check-release.mjs --prestaties dist/prestaties/codescan-34/rapport.json --uit dist/release/codescan-34
```

`--meet` is op zichzelf geen budgetgoedkeuring. De meting eindigde met exitcode 0; de budgetcontrole
en volledige releasecontrole eindigden terecht met exitcode 1.

| Controle | Resultaat |
| --- | --- |
| Publieke regressies | 367 geslaagd, 0 mislukt, 0 overgeslagen. |
| Buildcontract | Productie-HTML herbouwd; reproduceerbaarheid, hashes, licenties en productie/dev-CSP gecontroleerd. |
| Synthetische kwaliteit | Geslaagd met de bestaande onafhankelijke labels. |
| Browser | Chrome 155.0.8059.84 op macOS, productie-HTML via `file://`: volledige controle geslaagd, nul onverwachte consolefouten en netwerkverzoeken; actieve CSP-proef geslaagd. |
| Private voorbeelden | Alle zes gekende gevallen geslaagd. |
| Private beoordelingen | De 212 vereiste oordelen zijn nog leeg; evaluator en releasepoort keuren dit af. Geen labels ingevuld of aangepast. |
| Prestatiematrix | Alle 54 metingen volledig, op de vastgelegde referentiemachine/runtime en actuele bronchecksum; iedere XLSX heropend, juiste groepen, tekstcellen en alle oorspronkelijke cellen bevestigd. |
| Prestatiebudgetten | Afgekeurd: 104 grensoverschrijdingen in 19 metingen (17 Node, 2 browser). Geen overige contractfouten. De grenzen zijn ongewijzigd. |
| Windows | Vereist bewijsbestand ontbreekt; geen Windows-acceptatie uitgevoerd of gesimuleerd. |
| Documentatie | 40 lokale links gecontroleerd; bestandstypen, schermlimiet en inleesgrenzen vergeleken met `src/settings.js`. De gemeentenaam en oude bronlijstaantallen staan niet meer in de README. |
| Behoud en opruiming | SHA-256 van 19 vastgelegde bestanden gelijk vóór/na: projectafspraken, private bronlijsten, beoordelingsmateriaal, releasecontract en bestaande Windows-pakketbestanden. `dist/.harness-tmp/` is leeg. |
| Releasepoort | Geblokkeerd op `privateBeoordelingen`, `prestaties` en `windows`; openbare controles, browser en private voorbeelden zijn groen. |

Een voorbeeld van een prestatieoverschrijding is `node/gedeeld/1000`, herhaling 1: 1.310 ms totaal
tegen een budget van 500 ms. Overschrijdingen betreffen gemeten tijden; deze ronde stelt geen oorzaak vast.
Er is geen gunstige tweede reeks geselecteerd en geen referentierapport herschreven om de poort groen te maken.

Het compacte bewijs staat in [Codescan-afronding-2026-10-18.json](Codescan-afronding-2026-10-18.json).
De lokale details staan in `dist/release/codescan-34/rapport.json`,
`dist/prestaties/codescan-34/rapport.json`, `dist/controle/codescan34-budgetten.log` en
`dist/controle/codescan34-behoud.json`. Private commandologs blijven onder `dist/` en worden niet gedeeld.
De oudere `Releasebewijs.json` en meetreeksen blijven intact als historisch bewijs.

## Openstaande acceptatie

De prestatieoverschrijdingen moeten worden onderzocht en een volledige meetreeks moet binnen de bestaande
budgetten vallen. De private beoordelingen en menselijke verklaring blijven vereist, evenals Windows-acceptatie
met Edge, Chrome en Excel zonder netwerk. Lokale Chrome-controles op macOS vervangen dit bewijs niet.
Een groen item in de codescan betekent dat de beschreven taak is afgehandeld; het verleent geen
releasegoedkeuring. Er wordt niets gecommit, gepusht of gepubliceerd.
