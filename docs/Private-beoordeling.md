# Onafhankelijke beoordeling van de 212 paren

Deze beoordeling is verplicht vóór een release. De zes bekende voorbeelden en de synthetische tests vervangen haar niet.
De bestaande set telt 1.357 bronrijen en 212 verplichte paren. Het manifest en de oorspronkelijke lege werkmap
in `dist/kwaliteit-ronde2/` blijven ongewijzigd. Het releasecontract legt hun checksums vast, zonder brongegevens.

## Voorbereiding en overdracht

```bash
node tools/prepare-judgments.mjs
node tools/prepare-judgments.mjs --status
```

De voorbereiding maakt uitsluitend een kopie `dist/kwaliteit-ronde2/Testset_beoordeeld.xlsx` en een lege
`Beoordelingsverklaring.json`. Bestaand beoordelingswerk wordt behouden. Deel deze bestanden en de oorspronkelijke
bronlijsten uitsluitend via de afgesproken private route met de beoordelaar; nooit via Git, CI of openbare uploads.
De tools versturen niets. De werkmap bevat geen engine-oordelen of scores om als antwoord over te nemen.

## Werkwijze voor de beoordelaar

1. Open **Testset_beoordeeld.xlsx** in Excel. Houd het oorspronkelijke bestand en manifest intact.
2. Beoordeel op het tabblad **Paren** alle 212 regels, in kolom E: uitsluitend `zelfde` of `verschillend`.
   A–D identificeren dataset, paar en bronrijen; wijzig die niet. Het tabblad **Records** helpt bij het terugvinden.
3. Baseer elk oordeel op de brongegevens en zelfstandig gecontroleerde bedrijfsidentiteit. Een gedeeld centraal
   telefoonnummer of vergelijkbare naam is op zichzelf geen bewijs. Neem geen score, groepsindeling of engine-antwoord
   als waarheidlabel over. De beoordelaar moet zijn oordeel zelfstandig kunnen toelichten.
4. Onvoldoende informatie: laat het oordeel voorlopig leeg en noteer de vraag in een extra kolom **Toelichting**.
   Vraag de gegevensbeheerder om opheldering. `onzeker`, gokken of een engine-label kopiëren maakt de set niet geldig.
5. Noteer bij moeilijke gevallen de onderbouwing en eventueel de geraadpleegde bron in **Toelichting**. Die extra kolom
   wordt niet door de evaluator gebruikt, maar blijft in de private werkmap beschikbaar voor bespreking.
6. Sla de werkmap op en sluit Excel. Controleer de voortgang met `--status`. Deze teller keurt de kwaliteit niet goed.

Na volledige, onafhankelijke beoordeling registreert de beoordelaar zelf, of de ontwikkelaar op diens expliciete
verklaring, de naam en bevestiging. Gebruik een herkenbare naam, geen voorbeeldnaam:

```bash
node tools/prepare-judgments.mjs --registreer --beoordelaar "Naam van de beoordelaar" --onafhankelijk
node tools/private/controle-beoordelingen.mjs --meet dist/kwaliteit-ronde2/Testset_beoordeeld.xlsx testdata --manifest dist/kwaliteit-ronde2/Testset_manifest.json --rapport dist/kwaliteit-ronde2/resultaat.json
```

Registratie controleert dataset, volledigheid, labels en onderlinge consistentie; zij voorspelt of verandert geen labels.
De verklaring bindt naam, tijdstip en onafhankelijkheid aan de exacte werkmap en het manifest. Eerdere verklaringen
worden lokaal bewaard. Na een inhoudelijke wijziging is opnieuw registreren nodig. Dit is een menselijke verklaring,
geen digitale handtekening of automatisch bewijs van onafhankelijkheid.

De releasecontrole evalueert alle paren opnieuw tegen de huidige engine en bewaakt nul foute samenvoegingen,
nul foute zekere paarscores, nul gemiste dubbels en nul onopgeloste gemiste kandidaten. Een fout leidt tot onderzoek
en een gerichte regressie; pas labels alleen aan als de menselijke onderbouwing fout was. Verhoog geen grenzen
om een fout weg te werken. De volledige meetbetekenis staat in [Kwaliteitscontrole.md](Kwaliteitscontrole.md).

De verklaring is maximaal 30 dagen geldig, vastgelegd in `SETTINGS.release`. Bij veroudering moet de beoordelaar
de set opnieuw bevestigen; een tool mag de datum niet zelfstandig vernieuwen. Nieuwe positieve voorbeelden buiten
de kandidaatselectie en een achtergehouden validatieset zijn nuttig vervolgwerk, maar vervangen deze vaste set niet.
