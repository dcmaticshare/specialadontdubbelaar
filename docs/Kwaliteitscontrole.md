# Betrouwbare kwaliteitscontrole

De kwaliteitscontrole vergelijkt onafhankelijke beoordelingen met de kandidaatselectie, paarscores en de
uiteindelijke groepen. `tools/testset.mjs --meet`, `check:judged`, de publieke kwaliteitsset en de regressietests
gebruiken dezelfde evaluator. Een groene controle bewijst alleen dat de vastgelegde, volledig beoordeelde set
binnen haar expliciete grenzen blijft. Zij bewijst niet dat alle toekomstige leads goed worden vergeleken.

## Publieke regressieset

```bash
node tools/check-quality.mjs   # of pnpm check:quality
node tools/check.mjs          # alle publieke regressies plus reproduceerbare HTML-builds en CSP
```

`test/fixtures/kwaliteit/` bevat vijf verzonnen bronrijen, een vast manifest en tien beoordelingen van alle
onderlinge paren. De grondwaarheid is vooraf bepaald: de eerste twee rijen vormen één bedrijf, de volgende twee
vormen een tweede bedrijf en de vijfde rij staat apart. De oordelen zijn niet uit de matchengine afgeleid.
De publieke test controleert ditzelfde versiebeheerde materiaal. De overige synthetische tests bewaken onder meer
ontbrekende kandidaten, foute paarscores, transitieve groepsfouten en ongeldige beoordelingsbestanden.

## Een private set maken

Gebruik een afzonderlijke map per datasetversie. De invoermap bevat de oorspronkelijke leadbestanden; geef de
beoordelingswerkmap en het manifest een plaats buiten die invoermap. De voorbeeldpaden hieronder staan in de door
Git genegeerde mappen. De werkmap bevat echte leads zodra de bronmap die bevat; houd die werkmap en het manifest lokaal.

```bash
node tools/testset.mjs --maak testdata --uit dist/kwaliteit-v1/Testset_paren.xlsx
```

Er ontstaan twee samenhorende bestanden:

- `Testset_paren.xlsx`: tabblad **Paren** met lege oordelen en tabblad **Records** met alle testrecord-IDs en leesbare brongegevens.
- `Testset_manifest.json`: bronbestanden, werkbladen, rijnummers, checksums van de ingelezen celwaarden en koppelingen,
  alle verplichte beoordelingsparen, de datasetcontrole en de foutgrenzen.

Bestaande bestanden worden niet overschreven. Voor een volgende selectie kies je een nieuwe uitvoermap.
De standaardselectie bevat twijfelparen, een vaste steekproef zekere en lage scores, plus een vaste steekproef
buiten de kandidaatselectie. De aantallen en seed staan in `SETTINGS.kwaliteit.steekproef`.
Deze selectie is een werklijst; er worden geen waarheidlabels voorspeld of ingevuld.

Voeg voor serieuze acceptatie ook bewust gekozen positieve voorbeelden toe die de kandidaatselectie mogelijk
mist, en houd een afzonderlijke validatieset achter. Met `--paren` maak je een exacte selectie via een JSON-lijst
van `[Record A, Record B]`, met IDs uit het tabblad Records. Deze selectie **vervangt** de standaardsteekproef.

```bash
node tools/testset.mjs --maak testdata --paren testdata/paren-v2.json --uit dist/kwaliteit-v2/Testset_paren.xlsx
```

De lange testrecord-IDs worden uitsluitend door de ontwikkeltools gemaakt uit bronbestand, werkblad en rijnummer.
Identieke rijen blijven verschillende testrecords. De uploadvolgorde van bestanden verandert hun identiteit niet.
Een wijziging, toevoeging, verwijdering of herschikking van bronrijen maakt het oude manifest ongeldig. Bij bewust
gewijzigde brondata maak je een nieuwe set en controleer je de oordelen opnieuw. Het product krijgt geen blijvende Lead-IDs.

## Beoordelen en meten

Vul **ieder** oordeel in met `zelfde` of `verschillend`. Hoofdletters en omringende spaties zijn toegestaan;
`ja`, `nee`, losse letters en andere woorden niet. Wijzig de Dataset-, Paar- en Record-kolommen niet.
Bewaar de werkmap bijvoorbeeld als `Testset_beoordeeld.xlsx` naast het bijbehorende manifest.

```bash
node tools/testset.mjs --meet dist/kwaliteit-v1/Testset_beoordeeld.xlsx testdata --rapport dist/kwaliteit-v1/resultaat.json
```

Het manifest wordt standaard gezocht als `Testset_manifest.json` naast de werkmap. Een andere plaats kan met
`--manifest <pad>`. `--rapport` schrijft het volledige resultaat, met de uitslag per beoordeeld paar. De terminal
toont de aantallen, fouten en overschreden grenzen, zonder broncelwaarden. Behandelen als private uitvoer blijft verstandig.

Voor de vaste private opdracht:

```bash
node tools/private/controle-beoordelingen.mjs
# vereist testdata/Testset_beoordeeld.xlsx en testdata/Testset_manifest.json
```

Die opdracht accepteert dezelfde `--meet`, bronmap, `--manifest` en `--rapport` als de gewone CLI.
Een ontbrekende werkmap, een ontbrekend manifest of geen enkele geldige beoordeling geeft **exitcode 1**.
Er wordt niets overgeslagen of als groen gerapporteerd. De afzonderlijke `check:private` blijft een snelle controle
van de zes gekende voorbeelden; zij vervangt de onafhankelijk beoordeelde kwaliteitsset niet.

## Wat er wordt gemeten

| Veld | Betekenis |
| --- | --- |
| recordsVerwacht / recordsGevonden | Alle bronrijen uit het manifest tegenover de daadwerkelijk ingelezen bronrijen. Wijzigingen worden apart als datasetfout gemeld. |
| verwacht / gevonden / gecontroleerd | Verplichte paren, unieke teruggevonden paren en geldige ingevulde oordelen. Een onvolledige set kan niet slagen. |
| zelfde / verschillend | Aantallen geldige labels, zodat de inhoud van de gemeten set zichtbaar blijft. |
| kandidaatverbindingen / compacteGroepen | Expliciet bewaarde verbindingen en compacte groepen die hun onderlinge paren impliciet vertegenwoordigen. |
| zonderDirectKandidaat | Positief beoordeelde paren zonder expliciete of compacte kandidaatrelatie; een indirect correct samengevoegd paar blijft hier zichtbaar. |
| gemisteKandidaten | Positieve paren zonder kandidaatrelatie die ook niet via de uiteindelijke groepen of controlelijst bereikt zijn. |
| foutePaarscores | Negatief beoordeelde kandidaatparen die op basis van hun score zeker dubbel zijn. |
| gemistePaarscores | Positief beoordeelde kandidaatparen waarvan de score uniek zegt. Diagnostisch: een indirecte samenvoeging kan ze alsnog goed afhandelen. |
| fouteSamenvoegingen | Negatief beoordeelde paren die toch in dezelfde uiteindelijke groep zitten, ook via een derde rij. |
| gemisteDubbels | Positieve paren die apart blijven en niet als groepspaar op de controlelijst staan. |
| nietSamengevoegd | Alle positieve paren die apart blijven, inclusief de nog te beoordelen gevallen. |
| controlelijst / controleZelfde / controleVerschillend | Totale werkvoorraad aan groepsparen, en het aantal beoordeelde positieve/negatieve paren dat daarin terechtkomt. |

Bij een ontbrekende kandidaat wordt ook een diagnostische paarscore berekend. Die score voegt geen kandidaat
toe en verandert geen enkele groep; zij kan een gemiste kandidaat dus niet verbergen. Een niet opgeslagen
verbinding binnen een compacte groep is juist wel een vertegenwoordigde kandidaat.

De standaardgrenzen zijn nul foute samenvoegingen, nul foute zekere paarscores, nul gemiste dubbels en nul
onopgeloste gemiste kandidaten. Die grenzen worden in elk manifest vastgelegd. Pas ze alleen bewust aan bij het
maken van een nieuwe set; een gewijzigd manifest komt niet overeen met bestaande beoordelingsregels. Meer
werk op de controlelijst is een afzonderlijke maat, geen automatisch afkeurcriterium in deze ronde.

Alle schema- en datasetfouten geven een mislukte controle, los van matchfouten: ontbrekende/dubbele kolommen,
lege of ongeldige oordelen, onbekende/dubbele/ontbrekende paren, verkeerde dataset-ID, onbekende record-ID,
gewijzigde bronwaarden of koppelingen en tegenstrijdige labels (`A=B`, `B=C`, `A≠C`).

## Migratie en grenzen

### Manifestformaat 2 en behoud van bestaande beoordelingen (codescan 15)

Nieuwe sets krijgen manifestformaat 2. Hun datasetcontrole bevat bronbestanden, werkbladen, koppen,
kolomkoppelingen, aantallen rijen en de checksums en locaties van alle bronrijen. Het afgeleide veld
`nearConstant` hoort daar niet bij: de engine berekent het vergelijkingsbeleid opnieuw. Een andere detectie
mag de matchuitkomsten veranderen en wordt met dezelfde onafhankelijke labels gemeten; zij verandert
de identiteit van de bronset niet.

Bestaande manifesten van formaat 1 blijven leesbaar. De evaluator controleert eerst hun oorspronkelijke
manifest- en datasetcontrolesom, inclusief het destijds opgeslagen `nearConstant`. Alleen bij de vergelijking
met de actuele broninvoer laat hij dat ene afgeleide veld weg. Manifest-ID, record-IDs, verplichte paren,
grenzen en de koppeling van ieder oordeel aan het manifest blijven exact behouden. Ook een wijziging aan
`nearConstant` in het opgeslagen oude manifest zelf blijft een controlesomfout.

**De vaste private set wordt in deze fix niet gemigreerd.** Het originele manifest, beide XLSX-bestanden,
de beoordelingsverklaring en `Releasecontract.json` blijven byte voor byte intact. Evaluatie van de bestaande
set vereist geen nieuwe dataset-ID of herregistratie vanwege deze formaatwijziging. Ontbrekende labels,
een ontbrekende onafhankelijke verklaring of verlopen bewijs blijven wel releaseblokkades.

Een eventuele overstap van die vaste set naar formaat 2 is een afzonderlijke releasewijziging met dit plan:

1. Leg vóór conversie de SHA-256 van manifest, oorspronkelijke werkmap, beoordeelde werkmap, verklaring en
   releasecontract vast. Werk uitsluitend in een nieuwe private datasetmap; behoud de bestaande bestanden.
2. Controleer de oude set tegen dezelfde broninvoer met de gedeelde evaluator. Los bron- of koppelingverschillen
   eerst op; een formaatmigratie mag die verschillen niet verbergen. Houd ontbrekende of ongeldige labels zichtbaar.
3. Neem **precies de bestaande recordparen en foutgrenzen** over. Gebruik geen nieuwe standaardsteekproef met
   `--maak`: die hangt van de actuele engine af. Controleer gelijke record-IDs, bronrijchecksums, paren en grenzen
   één voor één voordat een nieuw manifest wordt aanvaard.
4. Kopieer alle tabbladen en cellen van de beoordelingswerkmap. Wijzig alleen de verwijzing naar het nieuwe
   manifest in de kolom Dataset en de manifestvermelding op Uitleg. Behoud labels, lege oordelen, toelichtingen,
   rijvolgorde en extra kolommen letterlijk; bouw de beoordelingswerkmap niet opnieuw uit engine-uitkomsten.
5. Heropen de geschreven XLSX. Vergelijk per Paar en Record A/B alle labels en toelichtingen, inclusief lege
   waarden, met het origineel; iedere ontbrekende, extra of veranderde beoordeling blokkeert de migratie.
   Bewaar alleen een compact rapport met aantallen en checksums buiten Git, zonder broncelwaarden.
6. Evalueer opnieuw met het nieuwe manifest. Laat de beoordelaar de gewijzigde bestandbinding opnieuw
   bevestigen; kopieer of vernieuw een verklaring nooit automatisch. Pas daarna het releasecontract bewust
   aan de gecontroleerde nieuwe manifest- en oorspronkelijke werkmapchecksum aan. Voer de releasepoort opnieuw uit.

Dit is migratieplanning, geen reeds uitgevoerde private conversie. De synthetische regressies in
`test/kwaliteitsmanifest.test.mjs` bewaken beide formaten, alle tien bestaande labels (twee `zelfde`, acht
`verschillend`) en het lezen van een beoordeelde XLSX met toelichting zonder de bytes te veranderen.

### Oudere vingerafdrukbestanden

Oude bestanden met Vingerafdruk A/B worden expliciet geweigerd. Hun inhoud kan identieke rijen niet eenduidig
identificeren en is niet aan een vaste dataset gebonden. Maak een nieuwe set en neem oude oordelen alleen na
controle van de bijbehorende bronrijen over. Er is geen stille, mogelijk foutieve conversie.

Een gedeeltelijk beoordeelde steekproef wordt niet als volledige meting geaccepteerd. De selectie zelf kan wel
slechts een deel van alle mogelijke paren bevatten. Meer representatieve data, een onafhankelijke validatieset en
acceptatie op de Windows-doelcomputer blijven afzonderlijke voorwaarden. De openbare CI en de verplichte
releasecontrole zijn uitgewerkt in [Releasecontrole.md](Releasecontrole.md). Voor de bestaande 212 private paren
staan de werkkopie, onafhankelijke beoordeling en registratie in [Private-beoordeling.md](Private-beoordeling.md).
De machinegebonden prestatiecontrole is uitgewerkt in ronde 4.

## Kwaliteit tijdens prestatiemetingen

`node tools/check-perf.mjs` voert eerst de publieke regressies en de vaste kwaliteitsset uit. Daarna bewaakt
iedere 1k/10k/50k-meting de vooraf toegewezen synthetische bedrijfsidentiteiten, alle oorspronkelijke cellen en
uitsluitend tekst in de werkelijk geschreven of gedownloade XLSX. De scenario-generator importeert geen
matchengine. De verwachte groepen zijn dus geen herhaling van dezelfde berekening. Een verkeerd resultaat
kan nooit als snellere uitvoering door de prestatiepoort komen. Dit vervangt de 212 onafhankelijke private
beoordelingen niet; die werkmap en haar manifest blijven ongewijzigd.

Zie [ronde 4](Vierde-implementatieronde.md) voor de meetmethode en de grenzen van deze synthetische scenario's.
Het [prestatieherstel](Prestatieherstel.md) behoudt deze controles bij de compactere opslag van werkbladen.
