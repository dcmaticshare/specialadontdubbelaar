# Derde implementatieronde — 17 oktober 2026

B07, B10 en B11 uit het [controleplan](Controle-en-harnessplan.md) zijn uitgevoerd in de bestaande werkmap.
De eerdere implementatierondes en alle bestaande wijzigingen zijn behouden. `CLAUDE.md`, `AGENTS.md`,
`dist/kwaliteit-ronde2/Testset_paren.xlsx` en `Testset_manifest.json` zijn met SHA-256 vóór en na deze ronde
bytegelijk bevonden. Er is geen commit of publicatie gedaan.

## B07: bijna constante kolommen

Scherm en engine gebruiken één beleid uit `comparisonPolicy`, op basis van de actuele koppeling en bronrijen.
Een kolom is bijna constant vanaf 20 niet-lege vergelijkingswaarden en 95% dezelfde genormaliseerde celwaarde.
Telefoon, e-mail, website en persoonsnaamvelden worden genormaliseerd vóór die telling. Meerdere contacten
in één cel vormen samen één vergelijkingswaarde. De grenzen en veldgroepen staan in `src/settings.js`.

Als de overheersende contactwaarde bij minstens twee verschillende genormaliseerde bedrijfsnamen hoort,
wordt de hele contactkolom uitgesloten, inclusief minderheidswaarden. Kandidaten, centraleherkenning, compacte
groepen en scores zien dan dezelfde gefilterde gegevens. Een uitgesloten e-mail levert ook geen domeinpunten.
Andere kolommen en bronnen blijven afzonderlijk bruikbaar. Gekoppelde persoonsnaamvelden vallen samen weg
zodra één ervan wordt uitgesloten, zodat geen kunstmatige gedeeltelijke contactnaam ontstaat.

Herhaalde contactwaarden bij één bedrijfsnaam blijven meetellen. Daardoor blijven echte herhalingen, ook
boven 400 rijen, bereikbaar. Een afwijkende rij met eigen of lege contactgegevens maakt die herhalingen niet
verdacht. De bijbehorende melding vraagt de bron te controleren. Een constante postcode blijft bruikbaar:
een gemeentelijst kan een juiste, gedeelde postcode hebben. Bij een ander adresgebied blijven de bestaande
lagere adrespunten gelden. Bedrijfsnaam, BTW en adres behouden hun bestaande vergelijkingsrol; gemeente en
sector leveren geen punten. Het volledige veldbeleid staat in de [README](../README.md).

De oorspronkelijke normalisatie blijft beschikbaar voor scherm en export. Uitsluiting geldt alleen voor de
vergelijking en verschijnt ook als rijwaarschuwing in het Logboek. Alle oorspronkelijke cellen blijven bewaard.
De regel is conservatief: kopieën kunnen niet met zekerheid van echte gezamenlijke contactgegevens worden
onderscheiden; daarom worden ook de minderheidswaarden van een uitgesloten kolom niet gebruikt.

## B10: bronprofielen herstellen

De opslag gebruikt nu een versieobject met een lijst profielen. De validator controleert vorm, handtekening,
kolomnamen, toegestane veldsleutels en de optionele bronnaam. Een geldig profiel wordt volledig toegepast;
een ongeldig profiel wordt volledig verwijderd. Geldige buren blijven behouden. Oude geldige profiellijsten
worden omgezet, onbekende opslagversies worden gereset. De gebruiker ziet een herstelmelding.

Ontbrekende, onleesbare of geweigerde opslag verhindert het koppelen en verwerken niet. Opslagfouten worden
opgevangen. De bovengrens blijft 50 geldige profielen. **Opnieuw voorstellen** heeft een expliciet pad zonder
opgeslagen profiel; **Verwerken** bewaart de actuele koppeling. De bescherming van eigen exportmetadata blijft gelden.

## B11: contacten splitsen vóór opschonen

Telefoons worden uit de oorspronkelijke cel gesplitst vóór witruimte wordt samengeknepen. Dubbele spaties,
slash en los streepje scheiden volledige herkenbare nummers; tabs en regeleinden zijn ook scheidingen.
`020000000  030000000` wordt twee nummers; `02  000 00 00` blijft één nummer. Wetenschappelijke notatie
wordt niet via de decimale komma in losse nummers gesplitst en blijft een waarschuwing geven.

De gekozen e-mailregel herstelt uitsluitend witruimte direct rond `@`:
`info @ voorbeeld.invalid` wordt `info@voorbeeld.invalid`. Spaties binnen het lokale deel of domein worden
niet geraden. Een onherkend deel geeft een waarschuwing; andere met harde scheidingstekens gescheiden geldige
adressen blijven bruikbaar. Een door spaties gescheiden reeks wordt alleen aanvaard als elk deel een volledig
adres is. Zo wordt `in fo@voorbeeld.invalid` niet stilzwijgend het andere adres `fo@voorbeeld.invalid`.

Verworpen telefoon- en e-mailinhoud verschijnt op het scherm en in het Logboek. Opvulwaarden blijven leeg.
Oorspronkelijke celtekst, inclusief omringende en dubbele spaties, blijft exact in Oorspronkelijke gegevens staan.
Export en herimport behouden de herkende contacten en de oorspronkelijke tekst; waarschuwingen worden voor de
actuele invoer opnieuw bepaald. Het oude Logboek wordt niet als actuele waarschuwing geïmporteerd.

## Rood en groen bewijs

De eerste 16 regressies zijn vóór de oplossingen uitgevoerd: alle 16 faalden. Ook de nieuwe browsergevallen
zijn eerst op de oude productiebuild via `file://` gedraaid: de kolommelding, profielvormen/voorstelknop en
contactwaarschuwingen faalden. Chrome moest buiten de sandbox starten; de gewone start faalde op de sandbox.
Tijdens aanscherping van B07 is nog een afzonderlijke regressie eerst rood uitgevoerd: 401 echte herhalingen
plus één afwijkende rij leverden 402 in plaats van 2 leads op. Deze test slaagt na de beperking tot de namen
die de overheersende contactwaarde daadwerkelijk delen.

De derde ronde voegt 33 publieke tests toe, inclusief grensgevallen rond 20 rijen en 95%, schrijfwijzen,
meerdere contactkolommen en bronnen, persoonsnaamvelden, oude/ongeldige/onbeschikbare profielopslag,
profielgrenzen en contactopmaak. De volledige bestaande set uit de eerdere rondes blijft groen.

| Controle | Uitkomst |
| --- | --- |
| `node tools/check.mjs` | 193 tests geslaagd; nul mislukt of overgeslagen. |
| Kopie zonder `testdata/` en `node_modules/` | Dezelfde 193 tests en buildcontrole geslaagd. |
| Productie- en ontwikkelbuild | Circa 1079 kB, 12 modules; herhaalde productiebuild byte-identiek. CSP-hashes, bibliotheek en offline bronnen gecontroleerd. Productie behoudt `connect-src 'none'`. |
| `node tools/check-quality.mjs` | 5/5 synthetische bronrijen, 10/10/10 verwachte/gevonden/gecontroleerde onafhankelijke oordelen; alle foutmaten nul. |
| Chrome 155.0.8059.84, productie-HTML via `file://` | Bestaande browsergevallen plus constante contacten, postcodeverschil, negen opslagvarianten, geweigerde opslag, opnieuw voorstellen, bewaren/herladen, contactwaarschuwingen en herimport geslaagd. |
| Werkelijk gedownloade XLSX | Verwachte leads, lagere postcodepunten, contacten, waarschuwingen en oorspronkelijke celtekst gecontroleerd. Alle cellen tekst, geen formulecellen. Herimport met een nieuwe lijst behoudt de contacten en herkomst. |
| Browser/CSP | Nul onverwachte consolefouten, schermfouten of netwerkverzoeken. Geen inline stijlen. Actieve fetchproef wordt door CSP vóór de netwerkinterceptor tegengehouden. |
| Schermcontrole | Schermafbeeldingen van de kolommeldingen en contactwaarschuwingen bekeken; tekst leesbaar, geen afgekapt bericht. |
| Private lijsten | 1357 rijen, 1128 unieke leads, 214 automatische groepen, 98 twijfelparen; zes gekende gevallen OK. Streng/Gemiddeld/Mild blijft 152/98/73. |
| Onbeoordeelde private set | 1357/1357 bronrijen, 212/212 gevonden paren, 0 geldige oordelen: terecht exitcode 1. Werkmap en manifest ongewijzigd; geen labels ingevuld. |

De vergelijking met een bewaarde kopie van de broncode vóór deze ronde controleert meer dan totalen:
alle groepsleden en kandidaten zijn identiek, net als de twijfelparen en hun scores. Alleen twee zekere
paarscores veranderen door het herstel van postcodegebruik: 135 → 120 en 190 → 175. Beide blijven zeker
dubbel in dezelfde groep. Bij 1276 records is de postcode weer bruikbaar. Andere normalisatievelden en het
aantal bestaande rijwaarschuwingen blijven gelijk. Er is geen afstelling op private waarheidlabels gedaan.

## Lokale bewijsbestanden en resterende acceptatie

Alles hieronder staat in de genegeerde map `dist/controle/`:

- `derde-ronde-rood.log`, `derde-ronde-browser-rood.log`, `derde-ronde-b07-extra-rood.log`: falende regressies.
- `derde-ronde-gericht.log`, `derde-ronde-controle.log`, `derde-ronde-zonder-private-data.log`: groene publieke controles.
- `derde-ronde-browser.log`, `browser-resultaat.json`, `browser-*.xlsx` en twee schermafbeeldingen: browserbewijs.
- `derde-ronde-publieke-kwaliteit.json`: de vaste synthetische kwaliteitsset.
- `derde-ronde-private.log`, `derde-ronde-private-verschil.json`, `derde-ronde-onbeoordeeld.json`: private controles; lokaal houden.
- `derde-ronde-bewaard.sha256` en `ronde3-vooraf/`: controle van de behouden bestanden en de eerdere broncode.

De 212 private oordelen blijven een onafhankelijke menselijke taak. De vijf synthetische rijen en zes gekende
private gevallen bewijzen regressiegedrag, geen algemene matchkwaliteit. Representatieve beoordelingen,
een afzonderlijke validatieset, CI, prestatiebudgetten en acceptatie in Edge/Chrome op Windows zonder netwerk
blijven vervolgwerk. Deze ronde wijzigt die releasevoorwaarden niet.
