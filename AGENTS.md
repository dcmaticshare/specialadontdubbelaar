# Lead-ontdubbelaar

Eén offline HTML-bestand (`dist/Lead-ontdubbelaar.html`) dat leadlijsten (CSV/Excel) ontdubbelt in de browser:
lijsten laden, kolommen koppelen, vergelijken, twijfelparen beoordelen, één resultaatbestand downloaden.
Taal van code-commentaar, scherm, documentatie en commits: Nederlands.

## Werken aan dit project

- Node.js LTS is nodig voor bouwen en testen (niet voor de gebruiker). Op deze Mac staat Node niet geïnstalleerd;
  gebruik een losse Node-tarball of vraag om Node te installeren.
- `node --test` voor de tests, `node build.mjs` voor de build, `node tools/run-testdata.mjs` om de echte lijsten in
  `testdata/` te verwerken en de gekende testgevallen te controleren. Zie `README.md` voor alle commando's.
- `src/engine` en `src/io` bevatten geen schermcode en draaien ook in Node. `build.mjs` bundelt de ES-modules zelf
  (alleen `import { a } from './x.js'`, `import * as ns`, en `export function|const|class`; geen default exports).
- Houd alle grenzen, gewichten en woordenlijsten in `src/settings.js`.
- Alle exportcellen zijn tekst (nooit formules of getallen); ingelezen celinhoud wordt nooit als HTML gezet.
- De CSP in het gebouwde bestand verbiedt elke netwerkverbinding; voeg geen inline `style`-attributen of externe
  bronnen toe. `node build.mjs --dev` maakt een testversie met `connect-src 'self'` om de tool via een lokale server
  automatisch te testen.
- Gebruik `withHarnessWorkspace` uit `tools/harness-temp.mjs` voor tijdelijke test-, benchmark- en
  proefbestanden. Alleen compacte rapporten bewaren; downloads, screenshots, traces en werkkopieën na
  controle opruimen, ook bij fouten. Gebruik `runPerformanceSample` voor meting én werkmapcontrole.
  `node tools/clean.mjs` ruimt herkenbare oudere uitvoer op. Verwijder nooit private lijsten, beoordelingen,
  Windows-bewijs, gebruikersuitvoer of de productie-HTML als onderdeel van testopruiming.

## Bewuste keuzes

- Geen rollen per bestand, geen klantenlijst, geen masterbestand: elke verwerking staat op zich en elk geladen bestand
  is een gewone lijst. Leads krijgen alleen een volgnummer binnen de verwerking.
- Kolomkoppelingen (bronprofielen) worden in de browser onthouden (localStorage), nergens anders.
- `testdata/` bevat echte leads en staat in `.gitignore`; zet nooit echte gegevens in de repository of in tests.
- Het oorspronkelijke plan (Claude Docs-artifact "Implementatieplan lokale versie") beschrijft ook een masterbestand,
  Lead-ID's en statussen; die zijn op vraag van de opdrachtgever weggelaten.
