# Herstel van de prestatieregressies — 17 oktober 2026

Vervolg op [ronde 4](Vierde-implementatieronde.md). De oorspronkelijke voor- en nametingen blijven bewaard
in [Prestatiebaseline.json](Prestatiebaseline.json). Deze wijziging richt zich op de gestegen verwerkingstijd
en geheugenpieken, met behoud van de kortere browserblokkades. Er is niet gecommit.

## Onderzoek en gerichte wijzigingen

De fasevergelijking van de twee eerdere reeksen lokaliseerde de extra tijd vooral in de Excel-export.
Bij 50.000 rijen steeg de mediane Node-serialisatie met ongeveer 0,77 s bij vooral unieke leads, 0,37 s
bij veel duplicaten en 1,34 s bij gedeelde contactgegevens. De normalisatiepauzes voegden in Chrome
ongeveer 0,29–0,32 s toe. Het hergebruik van groepen voor strengheidsstanden bleef juist tijd besparen.

Een afzonderlijk CPU-profiel van de bestaande versie bij 50.000 vooral unieke rijen liet ongeveer 2,62 s
garbage collection zien. De werkmap gebruikte ondanks de begrensde aanvoer nog steeds miljoenen losse
eigenschappen met celadressen. Dezelfde proef met compacte werkbladen gaf ongeveer 0,81 s garbage
collection. Deze profielen dienen als diagnose; de herhaalde eindmetingen gebruiken geen profiler of
geforceerde garbage collection.

Er zijn twee gerichte wijzigingen in de toepassing:

- `textSheet` maakt een compact SheetJS-werkblad (`dense: true`). De bibliotheek bewaart de cellen in
  rijarrays en gebruikt die ook tijdens serialisatie. De bestaande blokken van 1.000 rijen, iterator voor
  oorspronkelijke gegevens, tekstconversie, Excel-limieten, kolombreedtes en filters blijven behouden.
  De diagnostische exports vóór en na deze wijziging waren byte voor byte gelijk (SHA-256).
- De engine blijft na iedere 1.000 bronrijen en 3.000 kandidaatparen de uitvoering afstaan. In browsers
  met ondersteuning gebeurt dit via `scheduler.postTask` met achtergrondprioriteit. Hierdoor kunnen
  timers, invoer en schermupdates voorgaan zonder de minimumwachttijd van geneste timers. Node en
  browsers zonder deze scheduler blijven de bestaande timer gebruiken.

Een tussenproef met `scheduler.yield()` is afgewezen: de langste afzonderlijke taak was 2,35 s, maar de
timervertraging 5,46 s. Vervolgtaken kregen te veel voorrang. De achtergrondtaken gaven in dezelfde gerichte
browserproef 2,44 s voor de langste taak en 2,43 s voor de timervertraging. Beide maten blijven daarom
verplicht. De twee exportpauzes van 25 ms en de blokkering van dubbele downloads zijn ongewijzigd.

De eerste volledige proefreeks (`dist/prestaties/terugval-herstel/`) blijft als diagnose bewaard. Alle 54
kwaliteitscontroles slaagden, maar de bestaande prestatiepoort wees drie fasemetingen af: koppelen en
kandidaatselectie in één gedeeld-contactscenario, en groeperen in één duplicatenscenario. Tijdens deze
reeks werd gelijktijdige zware Swift-compilatie vastgesteld. De grenzen zijn daarvoor niet verruimd.
Een extra Node-pauzevariant is uit de uiteindelijke wijziging gelaten; Node behoudt zijn bestaande timer.
Ook tijdens de tweede reeks (`dist/prestaties/terugval-eindmeting/`) hervatte de Swift-compilatie.
Alle gegevenscontroles slaagden opnieuw, maar drie fasetijden overschreden hun grens (groeperen bij
10.000 gedeelde rijen: 250,8 > 250 ms; kandidaten bij 50.000 gedeelde rijen: 755,5 > 650 ms;
browserkoppelen bij 50.000 duplicaten: 1.016 > 1.000 ms). Beide reeksen blijven beschikbaar en worden
niet samengevoegd door alleen gunstige herhalingen te kiezen. De laatste reeks staat afzonderlijk in
`dist/prestaties/terugval-rustige-eindmeting/`.

De aanvullende schrijfinstelling `bookSST` is eveneens onderzocht, maar niet overgenomen: de bestanden
werden groter en de tijd- en geheugenwinst was niet consistent. De toepassing houdt haar bestaande
XLSX-schrijfopties; alleen de interne opslag van de werkbladen verandert.

## Kwaliteitswaarborgen

De matchinggrenzen, kandidaatselectie, paarscores, menselijke beslissingen, BTW-bewaking en groepslogica
zijn niet gewijzigd. De vergelijking met de bewaarde code vóór dit herstel geeft bij de private lijsten
exact dezelfde kandidaten, scores, normalisatie, groepen, twijfelparen, bronstatistieken en
strengheidsaantallen: 1.357 rijen, 1.128 leads, 214 automatische groepen en 98 twijfelparen.

De exporttests controleren de werkelijk geschreven en heropende XLSX. Controles die rechtstreeks
celadressen aanpasten zijn op de nieuwe opslag aangepast of openen eerst het bestand opnieuw; ze mogen
niet ongemerkt geen cellen meer controleren. Nieuwe regressies bewaken blokgrenzen, bredere rijen,
lege cellen, tekst met formuletekens en XML-tekens, filters en breedtes. De twee pauzepaden controleren
daadwerkelijk afgestane uitvoering, voortgang en ongewijzigde groepen. De bestaande test voor een bewust
verwijderde oorspronkelijke cel moet nog steeds falen.

De volledige prestatiematrix blijft 54 afzonderlijke metingen: drie herhalingen van drie groottes en drie
scenario's, zowel Node als Chrome. Iedere werkmap wordt buiten de gemeten fasen volledig gecontroleerd
op de onafhankelijke verwachte groepen, iedere oorspronkelijke cel, samengevoegde extra waarden en
uitsluitend tekstcellen zonder formules. Er worden geen controles overgeslagen of limieten verhoogd om
snellere resultaten te verkrijgen.

## Herhaalde eindresultaten

De laatste reeks heeft **54 volledige metingen die zowel aan de oude als de aangescherpte grenzen voldoen**.
Alle drie de herhalingen tellen mee. Het duurzame meetoverzicht, de bron- en rapportchecksums en de nieuwe
budgetten staan in [Prestatieherstel.json](Prestatieherstel.json). De JSON-rapporten met controlesommen staan
onder `dist/prestaties/terugval-rustige-eindmeting/`. De synthetische XLSX-bestanden en screenshots zijn bij
de opruiming van 17 oktober 2026 verwijderd; nieuwe runs ruimen deze tijdelijke uitvoer automatisch op.

Onderstaande vergelijking gebruikt telkens 50.000 rijen en vergelijkt met de vorige eindmeting van ronde 4.
Totaaltijden zijn medianen van drie runs; geheugen, blokkade en timervertraging zijn de slechtste waarneming.

| Scenario | Node totaal (s) | Chrome totaal (s) | Node piek (GiB) | Langste browsertaak (s) | Timervertraging (s) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vooral uniek | 10,34 → 5,49 | 7,97 → 4,78 | 2,99 → 1,78 | 3,94 → 2,72 | 3,93 → 2,72 |
| Veel duplicaten | 11,09 → 7,17 | 8,56 → 5,32 | 2,96 → 2,78 | 3,79 → 2,67 | 3,78 → 2,65 |
| Gedeelde contacten | 17,51 → 11,71 | 13,57 → 8,97 | 3,96 → 3,36 | 3,69 → 2,63 | 3,69 → 2,64 |

De mediane verwerkingstijd daalt bij deze grote lijsten met 33–47% in Node en 34–40% in Chrome.
De piek-RSS daalt met 6–40%; de langste browsertaak daalt met 29–31%. De uitkomsten liggen ook onder
alle overeenkomstige 50k-voor-metingen van ronde 4, dus vóór de eerdere verbetering van de responsiviteit.
De kleinere scenario's en alle afzonderlijke fases blijven eveneens bewaakt in het meetoverzicht.

Budgetten zijn uitsluitend verlaagd of behouden: tijden maximaal het nieuwe gemeten maximum × 1,5,
RSS × 1,25, exportbytes × 1,05 en kandidaatparen het waargenomen maximum. Voor browserblokkade en
vertraging geldt nu × 1,25. Afronding blijft naar boven (tijd 50/100 ms, RSS 64 MiB, export 1 KiB), met de
bestaande ondergrenzen; nooit wordt een oude grens verruimd. De 50k-blokkadegrenzen zijn nu
3,4 / 3,4 / 3,3 s. De eerdere regressierapportage wordt door deze nieuwe grenzen afgewezen.
De bronchecksum van de meetreeks hoort bij de gemeten code vóór het uitsluitend aanpassen van deze budgetten.
De productie-HTML is daarna opnieuw gebouwd en gecontroleerd.

De eindcontrole omvat 242 publieke tests, de onafhankelijke synthetische kwaliteitsset, reproduceerbare
productie- en ontwikkelbuilds, de volledige functionele Chrome-controle en alle 54 exportcontroles.
De zes gekende private gevallen slagen; de vergelijking met de bewaarde vorige versie is exact gelijk.
De controle van de 212 nog lege menselijke oordelen blijft terecht rood. De instructiebestanden en de
private beoordelingswerkmap met manifest zijn via SHA-256 ongewijzigd bevonden.

## Grenzen van de meting

De referentie blijft deze Apple M5 Pro met 24 GiB RAM, Node 24.19.0, Chrome 155.0.8059.84 en Playwright
1.62.1. Node-geheugen is de OS-piek van een vers proces, inclusief generator en export. Voor de gezamenlijke
browserprocessen is nog steeds geen betrouwbare piekmeting beschikbaar; daar wordt geen geheugenwinst
geclaimd. De totaaltijd is de som van de gemeten verwerkingsfasen, niet de duur inclusief bediening.
Serialisatie blijft synchroon. De onafhankelijke private beoordelingen en Windows-acceptatie blijven
afzonderlijke open punten; de zes gekende private gevallen vervangen die beoordelingen niet.
