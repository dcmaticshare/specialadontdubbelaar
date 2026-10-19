# Prestatieherstel na de codescan — 18 oktober 2026

Vervolg op de [afsluitende codescancontrole](Codescan-afronding-2026-10-18.md). Die volledige meetreeks
vond 104 budgetoverschrijdingen in 19 van de 54 metingen. De gebruiker vroeg deze te onderzoeken en te
verhelpen zonder de budgetten te verhogen, en daarna de volledige prestatie- en releasecontrole te herhalen.
De eerdere rapporten blijven ongewijzigd bewaard.

## Onderzoek en wijziging

De overschrijdingen zaten vooral in de eerste en derde Node-herhaling, verspreid over meerdere fasen.
De tweede herhaling had geen overschrijdingen. Daarnaast overschreed het groeperen in Chrome bij 50.000
grotendeels unieke rijen tweemaal de grens van 200 ms. Die spreiding vraagt om herhaalde metingen;
de oude meetreeks bewijst op zichzelf niet welke belasting of codewijziging elke vertraging veroorzaakte.

Een gerichte CPU-profielmeting van de actuele code met 50.000 synthetische rijen liet circa 924 ms
geheugenopruiming en 201 ms eigen CPU-tijd in `cleanQuotes` zien. De broncode bevestigde vermijdbaar werk:

- `extractFields` herkende de volledige exportkop en bepaalde namen voor extra kolommen opnieuw voor
  iedere rij. `createFieldExtractor` legt die metadata nu eenmaal per bron en koppeling vast. Iedere rij
  houdt eigen velden, prototype-veilige bron-/extramappen en oorspronkelijke cellen. Het plan is lokaal
  voor één verwerking; er is geen blijvende cache met leadinhoud. Ook de bronnaam en de aanwezigheid van
  uitgesloten kolommen worden eenmaal per bron bepaald.
- Een groep met één rij zocht voor ieder veld een beste waarde, beoordeelde opnieuw de website en bouwde
  sets voor extra waarden. Dat pad leest nu rechtstreeks de enige bronrij en maakt onafhankelijke
  uitvoermappen. Groepen met meerdere rijen houden de bestaande voorrangsregels. `assemble` voegt de
  groepsadministratie toe aan het zojuist gemaakte object, zonder een tweede volledige objectkopie.
- `cleanQuotes` doorliep iedere tekst viermaal voor aanhalingstekens, streepjes en NBSP. Eén vervangingsronde
  voert nu exact dezelfde omzettingen uit. De test controleert ieder ondersteund teken en combinaties.
- De kandidaatselectie bewaarde alle paarcodes in één grote verzameling. Kleine verzamelingen van tweede
  rijindices per eerste rij vermijden de vermenigvuldigde codes en de grote globale hash-tabel. Tests
  bewaken herhaalde sleutels, eerste vindvolgorde en hoge rijindices; kandidaten worden niet overgeslagen.
- De export zette rijen eerst naar tekstarrays om en liet SheetJS daar nog eens celarrays van maken.
  Dezelfde compacte werkbladen worden nu direct met expliciete tekstcellen gevuld, in dezelfde begrensde
  blokken. Excel-limieten, kolombreedtes, filters, lege cellen en de volledige herkomst blijven behouden.

SheetJS, compressie, meetfasen, seeds, scenario's, aantallen herhalingen, runtime, referentiemachine,
matchingregels en prestatiebudgetten zijn niet aangepast. CPU-profielen dienen alleen als diagnose;
de volledige meetreeks gebruikt geen profiler, opwarming of geforceerde geheugenopruiming.

## Correctheid en gegevensbehoud

Twee nieuwe tests voor het kolomplan faalden vóór de implementatie. Zij bewaken hergebruik van kopmetadata,
onafhankelijke rijen, gewijzigde koppelingen, dubbele kolomnamen, eigen-exportmetadata, extra waarden en
prototype-veilige opslag. Aanvullende tests bewaken typografische tekens en onafhankelijke uitvoer bij
groepen met één lid en kandidaatontdubbeling. Alle 373 publieke tests slagen, inclusief de bestaande uitsluitings-, BTW-,
export/herimport-, sessie- en kwaliteitsregressies. Productie-/ontwikkelbuild en offline/CSP-contract slagen.

Vóór wijziging zijn voor drie onafhankelijke synthetische scenario's van ieder 1.000 rijen controlesommen
vastgelegd van records, scores, groepen, samengevoegde leads, logboeken, bronstatistieken en de geschreven
XLSX. Na alle wijzigingen zijn deze exact gelijk, inclusief de XLSX-bytes. Het compacte lokale bewijs staat
in `dist/prestaties/codescan-herstel-diagnose/gelijkwaardigheid.json`; daar staat ook de controlesom van de
ongewijzigde prestatie-instellingen.

Alle metingen gebruiken `runPerformanceSample` en `withHarnessWorkspace`. Iedere export wordt heropend
en aan onafhankelijk gegenereerde bedrijfsidentiteiten en oorspronkelijke cellen getoetst. Profielen,
downloads en screenshots verdwijnen na controle; uitsluitend compacte rapporten blijven bewaard.

## Volledige eindcontrole

De eerste herstelreeks, `dist/prestaties/codescan-herstel-1/rapport.json`, omvat alle 54 metingen met
geslaagde exportcontroles. Zij had nog drie overschrijdingen: Chrome-kandidaten bij 50.000 gedeelde rijen
(475,7 > 450 ms), Node-kandidaten bij 10.000 grotendeels unieke rijen (51,8 > 50 ms) en Node-werkmapopbouw
bij 10.000 gedeelde rijen (101,8 > 100 ms). Daarom zijn daarna de kandidaatverzameling en celopbouw
verbeterd. Deze eerste reeks blijft intact; resultaten worden niet met een volgende reeks vermengd.

De tweede volledige reeks, `dist/prestaties/codescan-herstel-2/rapport.json`, voldoet aan **alle budgetten
in alle 54 metingen**. Zowel `check-perf --controleer` als de prestatiepoort binnen `check-release` zijn groen.
De controlesom van het volledige prestatiebeleid is gelijk aan vóór het herstel: geen grens, scenario,
herhaling of meetmethode is aangepast. Iedere werkmap slaagt voor de onafhankelijke gegevenscontrole.

Resultaten bij 50.000 rijen; tijden zijn medianen van drie herhalingen, geheugen en blokkades de slechtste
waarneming. Dit zijn resultaten op de bestaande Mac-referentiemachine, geen Windows-prestatiebewijs.

| Scenario | Node totaal (s) | Chrome totaal (s) | Node piek (GiB) | Langste browsertaak (s) | Timervertraging (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vooral uniek | 4,93 | 4,56 | 1,82 | 2,64 | 2,62 |
| Veel duplicaten | 6,82 | 5,05 | 3,05 | 2,66 | 2,65 |
| Gedeelde contacten | 11,86 | 8,54 | 3,50 | 2,36 | 2,36 |

Het groeperen van 50.000 grotendeels unieke rijen in Chrome duurt maximaal 104,5 ms tegenover het budget
van 200 ms. De kandidaatselectie bij 50.000 gedeelde rijen duurt maximaal 257,6 ms tegenover 450 ms.
De oude en eerste herstelreeks blijven volledig bewaard. De einduitkomst gebruikt uitsluitend de tweede,
volledige reeks na de laatste codewijzigingen; er zijn geen gunstige herhalingen uit andere reeksen overgenomen.

Uitgevoerde eindopdrachten met Node 24.19.0, Chrome 155.0.8059.84 en Playwright 1.62.1:

```bash
export PATH="/Users/dieter/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export LEAD_BROWSER_CHANNEL=chrome
export SOURCE_DATE_EPOCH=1792195200
node tools/check-perf.mjs --meet dist/prestaties/codescan-herstel-2
node tools/check-perf.mjs --controleer dist/prestaties/codescan-herstel-2/rapport.json
node tools/check-release.mjs --prestaties dist/prestaties/codescan-herstel-2/rapport.json --uit dist/release/codescan-prestatieherstel
```

Bij opnieuw uitvoeren moeten de uitvoermappen nieuw zijn; bestaande bewijzen worden niet overschreven.
Het compacte, deelbare bewijs staat in [Prestatieherstel-codescan-2026-10-18.json](Prestatieherstel-codescan-2026-10-18.json).
De volledige releasecontrole staat lokaal in `dist/release/codescan-prestatieherstel/rapport.json`.

| Releaseonderdeel | Uitkomst |
| --- | --- |
| Openbare tests en buildcontract | 373 tests geslaagd, nul mislukt of overgeslagen; reproduceerbare productiebuild, hashes, licenties en offline/CSP-controles geslaagd. |
| Synthetische kwaliteit | Geslaagd. |
| Volledige browsercontrole via `file://` | Geslaagd, nul onverwachte consolefouten of netwerkverzoeken; daadwerkelijke downloads en actieve CSP-proef gecontroleerd. |
| Private voorbeelden | Alle zes gekende gevallen geslaagd. |
| Prestaties | Alle 54 metingen geslaagd; bronchecksum actueel. |
| Private beoordelingen en Windows | Nog geblokkeerd: de menselijke oordelen/verklaring en Windows-acceptatie ontbreken. Geen labels ingevuld en geen platformbewijs gesimuleerd. |

De volledige releaseopdracht eindigt daarom terecht met exitcode 1, uitsluitend vanwege
`privateBeoordelingen` en `windows`. De prestatieblokkade is opgeheven. De SHA-256-controle bevestigt behoud
van de 19 eerder vastgelegde bestanden met projectafspraken, private bronnen, beoordelingen, releasecontract
en bestaand Windows-pakket. `dist/.harness-tmp/` is leeg; de gecontroleerde productie-HTML blijft staan.
Er is niets gecommit, gepusht of gepubliceerd.
