# Lead-ontdubbelaar: handleiding

De Lead-ontdubbelaar is één bestand, **Lead-ontdubbelaar.html**. Dubbelklik erop en het opent in Microsoft Edge of Google Chrome. Je hebt geen installatie, geen internet en geen account nodig. Je lijsten verlaten je computer niet: het bestand kan technisch geen gegevens versturen.

Je kunt ook **index.html** in de hoofdmap openen: dat bevat dezelfde volledige tool. Als de tool op
GitHub Pages staat, open je het webadres. Daarvoor is internet nodig, maar je lijsten worden ook dan
uitsluitend in je browser verwerkt. De lokale versie en de website hebben elk hun eigen bewaarde sessie;
open steeds hetzelfde adres in dezelfde browser om verder te gaan.

## Wat de tool doet

Je laadt één of meer lijsten: tekstbestanden (.csv, .txt, .tsv) of werkmappen (.xlsx, .xlsm, .xls, .xlsb, .ods). De tool vergelijkt alle rijen onderling, binnen elke lijst en tussen de lijsten, en voegt rijen samen die zeker hetzelfde bedrijf zijn. Twijfelgevallen legt hij aan jou voor. Je krijgt één Excelbestand terug met één rij per uniek bedrijf.

Upload altijd de **originele export**, niet een versie die eerst in Excel geopend en opnieuw bewaard is. Anders verliezen telefoonnummers hun voorloopnul of worden ze 3,2479E+10.

Per bestand geldt maximaal 100 MiB en 2.000.000 cellen, inclusief koppen en lege cellen binnen het
gebruikte bereik. Bij werkmappen tellen alle tabbladen samen. Ook een eerder resultaatbestand kan deze
grens overschrijden doordat het herkomsttabblad groeit. Een te groot bestand wordt met een melding
geweigerd; splits de bronlijst in kleinere bestanden. Er worden geen rijen stil afgekapt.

## In vier stappen

1. **Bestanden.** Sleep de lijsten in het grijze vak of klik om ze te kiezen. Bij een Excelbestand met meerdere tabbladen kies je het juiste tabblad. Je ziet per bestand het aantal rijen en de eerste vijf rijen.
2. **Kolommen.** De tool herkent welke kolom welk gegeven is (bedrijfsnaam, telefoon, e-mail, BTW, adres …). Controleer dat en corrigeer waar nodig met het keuzemenu. De keuze wordt in de browser onthouden, zodat een volgende lijst met dezelfde kolomnamen meteen juist staat. Kolommen met **Niet gebruiken** blijven als extra kolom in het resultaat staan. Klik op **Verwerken**.
3. **Controleren.** Bovenaan staat de samenvatting: rijen ingelezen, unieke leads, automatisch samengevoegd en te controleren.
   - **Strengheid:** onder de samenvatting kies je **Streng**, **Gemiddeld** of **Mild**. Dat bepaalt vanaf hoeveel punten een paar als twijfelpaar aan jou voorgelegd wordt (40, 55 of 70 punten); bij elke stand staat het aantal paren. Streng toont meer twijfelparen; Mild vraagt meer punten. Wat de tool automatisch samenvoegt, verandert niet mee, en beslissingen die je al nam blijven gelden als je van stand verandert.
   - **Twijfelparen:** de tool toont twee leads naast elkaar. Een groen vinkje betekent dat het gegeven meetelt in de punten; een grijs "=" betekent gelijk, maar telt niet mee. Kies **Zelfde bedrijf** (toets Z), **Verschillend** (toets V) of **Later** (spatie). Een keuze geldt voor alle bronrijen in de twee getoonde groepen. **Verschillend** houdt die rijen ook via andere overeenkomsten apart. Bij verschillende geldige BTW-nummers wordt **Zelfde bedrijf** geweigerd met een melding; het paar blijft zichtbaar. Bij twijfel kies je Later: beide leads blijven dan staan, met de opmerking "Mogelijk dubbel met …".
   - **Samengevoegd:** alle groepen die de tool automatisch samengevoegd heeft, met de reden. Klopt een samenvoeging niet, klik dan op **Ontkoppelen**. Alle rijen uit die groep blijven daarna onderling apart binnen deze verwerking.
   - **Alle leads:** zoeken op naam, telefoon, e-mail, gemeente of nummer.
4. **Exporteren.** Download **Leads_ontdubbeld_JJJJ-MM-DD.xlsx** met deze tabbladen:

| Tabblad | Inhoud |
| --- | --- |
| Unieke leads | één rij per uniek bedrijf, in het uploadformaat, plus Nr, Bronnen en Mogelijk dubbel met; alle herkende telefoonnummers en e-mailadressen in aparte kolommen, gevolgd door extra bronkolommen |
| Te controleren | de twijfelparen die je nog niet beoordeeld hebt, naast elkaar, met punten en reden |
| Beslissingen | wat je in het controlescherm beslist of ontkoppeld hebt |
| Logboek | welke originele rij (bron + rijnummer) in welk nummer zit, en waarom |
| Per bron | per lijst: rijen, unieke leads, dubbels binnen en tussen lijsten |
| Oorspronkelijke gegevens | alle ingelezen celwaarden met bronbestand, tabblad, rij en kolom; ook conflicterende of niet herkende waarden blijven hier staan |
| Info | versie van de tool, datum, bestanden en de samenvatting |

**Later** zet het paar achteraan bij de uitgestelde paren. Nieuwe paren komen eerst; als alles is
uitgesteld, kun je met Later blijven doorbladeren. Z, V en spatie werken wanneer je geen invoerveld,
knop, link of tabblad bedient. Op een knop gebruik je de gewone spatie- of Entertoets voor die knop.

**Alle leads**, **Samengevoegd** en **Waarschuwingen** tonen maximaal 300 rijen of groepen tegelijk.
Bij Alle leads en Samengevoegd kun je zoeken om de lijst te verfijnen. Boven een langere waarschuwingstabel
staat **Eerste 300 van N rijen met waarschuwingen**. Alle waarschuwingen staan in het tabblad **Logboek**
van de download; de schermlimiet kapt het resultaatbestand niet af.

Vanaf 100 betrokken bronrijen vraagt een groepskeuze of ontkoppeling extra bevestiging. Boven 5.000
betrokken rijen wordt die handeling geweigerd zonder de groepen te veranderen. Verwerk dan kleinere lijsten.
Als je een enkelvoudig veld, zoals Bedrijfsnaam, aan een tweede kolom koppelt, krijgt de laatste kolom die
koppeling. De eerdere kolom wordt **Niet gebruiken** en blijft als extra gegeven behouden. Meerdere telefoon-
en e-mailkolommen mogen wel tegelijk gekoppeld zijn.

Met **Terug naar kolommen** kun je de koppelingen opnieuw bekijken. Zolang je bestanden, tabblad en
koppelingen niet wijzigt, brengt **Verder zonder opnieuw te verwerken** je terug met behoud van beoordelingen,
ontkoppelingen en uitgestelde paren. Dit werkt ook na verversen of sluiten van de lokaal bewaarde sessie.
Bij een wijziging vraagt de tool eerst bevestiging en noemt hoeveel beoordelingen/ontkoppelingen en uitgestelde
paren verdwijnen. **Annuleren** behoudt ook de oorspronkelijke koppeling of bestanden. Na bevestigen moet je
opnieuw verwerken en beoordelen; een eerdere download geldt dan niet meer als het actuele resultaat.
**Terug naar standaard** verschijnt alleen bij koppelingen die afwijken van het automatische voorstel.
Ook eerder onthouden handmatige koppelingen kun je hiermee herstellen.

Elke verwerking staat op zich. De huidige sessie blijft bewaard totdat je **Nieuwe sessie** kiest; er is geen archief van vorige sessies. Wil je een nieuwe lijst tegen een eerdere ontdubbeling leggen, laad dan het volledige vorige resultaatbestand mee als een gewone lijst en kies **Unieke leads**.
Nr is alleen het volgnummer van die verwerking en wordt bij herimport niet als huisnummer gebruikt.
Busnummers en extra telefoons/e-mails blijven behouden. Eerdere bronwaarden en hun herkomst reizen mee via
**Oorspronkelijke gegevens**; bij iedere volgende ronde komen de actuele invoercellen erbij. Het bestand wordt daardoor groter.
Eerdere keuzes Zelfde/Verschillend worden niet opnieuw toegepast: je beoordeelt de nieuwe verwerking afzonderlijk.

De eerste uploadkolommen blijven op hun plaats. Niet gekoppelde kolommen staan achteraan als **Extra: …**.
Bij meerdere waarden staan die op aparte regels in dezelfde cel. Bij conflicterende namen, adressen of contactpersonen
kiest de tool één hoofdwaarde; alle oorspronkelijke waarden blijven in **Oorspronkelijke gegevens** beschikbaar.
Ook onbruikbare telefoons en e-mails blijven daar als oorspronkelijke tekst staan. Kopieer dus niet alleen het eerste
tabblad als je alle informatie wilt bewaren. Een exportcel kan niet langer zijn dan Excel toelaat; bij overschrijding
krijg je een foutmelding en moet je kleinere lijsten verwerken of de broncel inkorten.

## Verdergaan na verversen of sluiten

De tool bewaart de huidige sessie automatisch op deze computer: het gekozen tabblad van iedere ingelezen lijst,
kolomkoppelingen, beoordelingen, ontkoppelingen, uitgestelde paren, strengheid en het geopende scherm met zoekterm.
Bovenaan staat **Sessie lokaal bewaard** zodra de wijzigingen zijn opgeslagen. Wacht daarop voordat je sluit.
Open hetzelfde HTML-bestand op dezelfde plaats, in dezelfde browser en hetzelfde browserprofiel om verder te gaan.
De vergelijking wordt bij herstel opnieuw opgebouwd; bij grote lijsten duurt dat even. Je keuzes blijven gelden.
Een onderbroken vergelijking begint opnieuw met de bewaarde invoer. Bestanden die nog bezig waren met inlezen
moet je eventueel opnieuw toevoegen. Een download start nooit automatisch opnieuw.

Andere tabbladen blijven beschikbaar zolang het venster open is, maar worden niet in de sessie bewaard.
Na herstel staan hun namen in de tabbladkeuze met **opnieuw laden**. Om zo'n tabblad te kiezen, verwijder je
het bestand en voeg je het opnieuw toe. Bij herimport van een eigen resultaatbestand blijven de oorspronkelijke
celwaarden en hun herkomst bij **Unieke leads** bewaard, ook zonder het volledige herkomsttabblad in de sessieopslag.

**Nieuwe sessie** staat bovenaan elke stap. Na bevestiging verdwijnen de huidige lijsten en alle beoordelingen,
ook uit de lokale sessieopslag. Gedownloade bestanden en onthouden kolomkoppelingen blijven bestaan.
Ook **Alles verwijderen** vraagt deze bevestiging. Een ander, ouder tabblad kan een gewiste of gewijzigde sessie
niet overschrijven; dat tabblad vraagt om de sessie te herladen.

Deze lokale opslag is geen reservekopie. Privévensters, het wissen van browsergegevens, een andere browser of
het verplaatsen/hernoemen van het HTML-bestand kunnen herstel verhinderen. Download je resultaat om het apart
te bewaren. Als bewaren mislukt, toont de tool een waarschuwing: laat het venster open en probeer **Opnieuw bewaren**,
of download eerst het resultaat. Ook na een download blijft de sessie beschikbaar tot je zelf opnieuw begint.
Gebruik je een gedeelde computer, wis dan na afloop de sessie met **Nieuwe sessie**.

## Hoe de tool beslist

Elk paar rijen krijgt punten per overeenkomend gegeven: telefoon 45 (20 bij een centraal nummer dat bij meerdere bedrijven hoort), e-mail 45, domein 40, adres 30, naam tot 60 naar gelijkenis, contactpersoon 20. Het BTW-nummer beslist altijd: gelijk is zeker dubbel, verschillend is nooit automatisch samenvoegen.

- **Zeker dubbel** (automatisch samengevoegd): zelfde geldig BTW-nummer, of 90 punten of meer én namen die minstens 60 % op elkaar lijken.
- **Te controleren** (aan jou voorgelegd): 55 tot 90 punten bij de stand Gemiddeld (vanaf 40 bij Streng, vanaf 70 bij Mild), of veel punten met weinig gelijkende namen.
- **Uniek**: minder punten dan de gekozen stand vraagt, of een verschillend BTW-nummer.

Ook bij meer dan 400 rijen blijft een gelijk geldig BTW-nummer bruikbaar om te ontdubbelen. Bij veel gedeelde algemene gegevens vergelijkt de tool zekere exacte overeenkomsten via vertegenwoordigers. Andere combinaties kunnen dan worden overgeslagen; dit staat bij Waarschuwingen. Eerdere keuzes Verschillend blijven daarbij gelden.

Bij twijfel verwijdert de tool niets. Elke samenvoeging vermeldt de reden en kan ontkoppeld worden.

## Herhaalde contactgegevens en onherkende inhoud

Bij minstens 20 ingevulde waarden controleert de tool of 95% of meer hetzelfde is. Staat zo'n telefoon,
e-mail, website of contactpersoon bij verschillende bedrijfsnamen, dan telt de hele contactkolom niet mee
bij het vergelijken. De melding in stap 2 legt dit uit; de waarden blijven in het resultaat bewaard.
Andere contactkolommen blijven bruikbaar. Gekoppelde voornaam, achternaam en contactpersoon vallen samen weg
als één ervan om deze reden wordt uitgesloten. Hoort de herhaalde contactwaarde bij één bedrijfsnaam,
dan blijft ze meetellen: de lijst kan echte dubbele rijen bevatten. Controleer de bron bij deze meldingen.
Een herhaalde postcode blijft wel bruikbaar voor de adresvergelijking: alle bedrijven in een gemeentelijst
kunnen dezelfde postcode hebben.

Twee volledige telefoonnummers met dubbele spaties ertussen worden afzonderlijk herkend. Bij e-mail mag
witruimte direct rond het apenstaartje staan: **info @ voorbeeld.invalid** wordt **info@voorbeeld.invalid**.
Spaties binnen de naam of het domein worden niet hersteld. Onherkende delen staan bij **Waarschuwingen** en
in het **Logboek**; geldige delen die met bijvoorbeeld een puntkomma gescheiden zijn blijven bruikbaar.
Alle originele celwaarden, inclusief de spaties en verworpen tekst, staan in **Oorspronkelijke gegevens**.

Een gemarkeerd toestelnummer, zoals **ext 12** of **#12**, wordt niet bij het telefoonnummer opgeteld;
de oorspronkelijke cel behoudt het toestelnummer. Een weergavenaam vóór een e-mailadres tussen punthaken
of een toelichting tussen haakjes geeft geen waarschuwing. Ongeldige e-maildelen met een apenstaartje wel.
Websitedomeinen met accenten worden herkend; een accent blijft betekenisvol bij het vergelijken.

**Terug naar standaard** herstelt het automatische kolomvoorstel zonder de opgeslagen koppeling te gebruiken.
De knop verschijnt alleen bij afwijkende koppelingen en verdwijnt zodra de standaard is hersteld. Klik daarna op
**Verwerken** om die keuze te onthouden. Ongeldige of oude bronprofielopslag wordt met een melding hersteld;
als de browser geen opslag toestaat, kun je de lijsten gewoon blijven verwerken.
Bronprofielen uit een nieuwere opslagversie blijven ongewijzigd. Een oudere tool stelt de kolommen opnieuw
voor en onthoudt geen nieuwe koppelingen. Je kunt gewoon verwerken; gebruik de nieuwere tool om koppelingen
opnieuw te bewaren.

## Als iets niet lukt

| Melding of probleem | Wat te doen |
| --- | --- |
| "… staan in wetenschappelijke notatie" | De CSV is in Excel bewaard. Upload de originele export. |
| Een kolom wordt niet herkend | Kies het juiste gegeven in stap 2. De keuze wordt onthouden. |
| Bronprofielen zijn hersteld of bijgewerkt | Controleer de voorgestelde kolommen. Bij afwijkende koppelingen kun je met Terug naar standaard het automatische voorstel herstellen. |
| Contactkolom wordt niet gebruikt om te vergelijken | Controleer of de bron gekopieerde contactgegevens bevat. De hele kolom blijft bewaard maar levert geen vergelijkingspunten. |
| Telefoon of e-mail niet herkend | Bekijk de melding in het Logboek en de volledige cel in Oorspronkelijke gegevens; corrigeer de bron als het contactgegeven nodig is. |
| Te veel twijfelparen | Zet de strengheid op Mild, en gebruik de sneltoetsen Z, V en spatie. De grenzen kunnen bijgesteld worden na een beoordeelde testset. |
| Een samenvoeging klopt niet | Tabblad "Samengevoegd", knop "Ontkoppelen". |
| Bestand te groot of te veel cellen | Splits de bronlijst. De limieten gelden per bestand en voor alle tabbladen samen, ook bij herimport. |
| Onverwachte fout; automatisch bewaren is gestopt | Kies **Sessie herladen** om de laatst bewaarde sessie te herstellen. De laatste handeling is mogelijk niet bewaard. |
| Een nieuwe versie van de tool | Vervang het bestand Lead-ontdubbelaar.html. Het versienummer staat bovenaan in de tool en in het tabblad Info van elk exportbestand. |
