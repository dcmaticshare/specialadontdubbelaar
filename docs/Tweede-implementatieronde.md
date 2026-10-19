# Tweede implementatieronde — 17 oktober 2026

B04 en B05 uit het [controleplan](Controle-en-harnessplan.md) zijn uitgevoerd. De regressies zijn eerst tegen
de oude werking gedraaid, daarna zijn de oplossingen aangebracht en opnieuw gecontroleerd. De wijzigingen uit
de eerste ronde en de bestaande projectinstructies zijn behouden. Er is geen commit of publicatie gedaan.

## B04: sterke overeenkomsten boven 400 rijen

Gelijke geldige BTW-nummers krijgen bij grote sleutels een compacte groep met verbindingen via
vertegenwoordigers. Dat geldt ook voor exact gelijke namen met voldoende gedeelde telefoon-, e-mail-, domein-
of adrespunten, en voor identieke vergelijkingsvelden die zeker dubbel scoren. De grens van 400 is niet verhoogd.
Algemene sleutels zonder zulke sterke overeenkomsten blijven begrensd en worden als waarschuwing gemeld.

Alle verenigingen gebruiken dezelfde bewaking van geldige BTW-nummers en menselijke uitsluitingen. Als een
vertegenwoordiger is uitgesloten, kunnen de overige leden via een andere vertegenwoordiger bijeenkomen.
Verschillende geldige BTW-nummers worden bij het zoeken naar een vertegenwoordiger apart gehouden. De tests
bewaken zowel het resultaat als het aantal expliciet opgeslagen kandidaatverbindingen.

De regressies omvatten 399, 400, 401 en 2000 identieke rijen, gelijke BTW-nummers bij afwijkende namen,
exacte sterke signalen zonder BTW, uitgesloten vertegenwoordigers in twee rijvolgordes, ontkoppelen van een
grote groep, twee grote groepen met conflicterende BTW-nummers en 1000 verschillende geldige BTW-nummers
bij een gedeeld naam-/telefoonsignaal. Algemene domeinen en ongeldige BTW-nummers krijgen geen doorslaggevende rol.

## B05: één kwaliteitscontract

`tools/quality.mjs` bevat de gedeelde parser en evaluator. De gewone CLI, private beoordelingencontrole en
publieke kwaliteitsset gebruiken deze module. Een vast manifest bevat testrecord-IDs, checksums van de ruwe
bronrijen en koppelingen, verplichte beoordelingsparen en expliciete foutgrenzen. De IDs bestaan alleen in
de beoordelingshulpmiddelen; er zijn geen blijvende Lead-IDs aan het product toegevoegd.

Ongeldige schema's, lege of onvolledige beoordelingen, onbekende of dubbele paren, ongeldige labels,
tegenstrijdige oordelen en gewijzigde of verdwenen bronrijen laten de controle falen. De rapportage vermeldt
verwachte, gevonden en gecontroleerde aantallen. Een bestaand paar dat buiten de kandidaatselectie valt,
wordt onderscheiden van een verdwenen record. De evaluator meet ook de uiteindelijke groepen, zodat een
foute transitieve samenvoeging zichtbaar wordt. Een aanvullende diagnostische paarscore verandert de
kandidaatselectie en het groepsresultaat niet.

De standaardgrenzen zijn nul foute samenvoegingen, nul foute zekere paarscores, nul gemiste dubbels en nul
onopgeloste gemiste kandidaten. Positieve paren op de controlelijst blijven als werkvoorraad zichtbaar.
De afzonderlijke runner voor de zes gekende private voorbeelden controleert nu ook groepen en controlelijst.
De oude vingerafdrukbestanden worden expliciet geweigerd; de migratie staat in
[Kwaliteitscontrole](Kwaliteitscontrole.md).

De versiebeheerde publieke kwaliteitsset bevat vijf synthetische rijen en alle tien onderlinge beoordelingen,
met vooraf bepaalde bedrijfsidentiteiten. Tests brengen bewust kandidaat-, score- en groepsfouten aan om te
controleren dat de evaluator ze vindt. Beide CLI-ingangen zijn ook met echte geschreven XLSX-bestanden getest.

## Bewijs en validatie

De eerste uitvoering bevatte 19 regressies: 14 faalden en 5 bestaande waarborgen bleven groen. Daaronder waren
de reproductie `401 !== 1` en de drie onterechte CLI-successen bij lege oordelen, ongeldige labels en een gemiste
kandidaat. Vervolgens zijn 17 contracttests voor de gedeelde evaluator eerst rood uitgevoerd: de evaluator
ontbrak nog. De tests zijn daarna uitgebreid met onder meer vaste fixtures, foutgrenzen en de private groepscontrole.

| Controle | Resultaat |
| --- | --- |
| `node tools/check.mjs` | 160 tests geslaagd; nul mislukt of overgeslagen. |
| Kopie zonder `testdata/` en `node_modules/` | Dezelfde 160 tests en volledige buildcontrole geslaagd. |
| `node tools/check-quality.mjs` | 5/5 bronrijen, 10/10/10 verwachte/gevonden/gecontroleerde oordelen; alle foutmaten nul. |
| Productie- en ontwikkelbuild | Circa 1070 kB, 12 modules. Productie tweemaal byte-identiek gebouwd; CSP-hashes, bibliotheek en offline bronnen gecontroleerd. |
| Productie-HTML in Chrome 155.0.8059.84 via `file://` | Bestaande browsercontroles plus 401 gelijke rijen geslaagd. Gedownloade XLSX bevat één lead en 401 bronrijen in het logboek. |
| Browser en offline gedrag | Nul onverwachte consolefouten en netwerkverzoeken; actieve netwerkproef wordt door CSP geblokkeerd. |
| Echte lokale lijsten | 1357 rijen, 1128 unieke leads, 214 automatisch samengevoegde groepen, 98 twijfelparen; zes gekende gevallen OK. |
| Nieuwe, nog lege private beoordelingsset | 1357/1357 bronrijen, 212/212 gevonden paren, nul geldige oordelen; terecht exitcode 1 met 212 lege oordelen. |

De rode uitvoer staat lokaal in `dist/controle/tweede-ronde-rood.log` en
`dist/controle/b05-evaluator-rood.log`. De groene uitvoering staat in `tweede-ronde-controle.log`,
`tweede-ronde-schone-kopie.log`, `tweede-ronde-publieke-kwaliteit.json` en `browser-resultaat.json` in dezelfde
map. `tweede-ronde-private.log` bevat echte gegevens en blijft lokaal. Alles onder `dist/` wordt door Git genegeerd.

## Private beoordeling en resterend werk

`dist/kwaliteit-ronde2/Testset_paren.xlsx` en het bijbehorende `Testset_manifest.json` staan klaar met 212
verplichte, lege oordelen. De selectie bevat ook paren buiten de kandidaatselectie. Laat deze onafhankelijk
beoordelen en bewaar de ingevulde werkmap bijvoorbeeld als `Testset_beoordeeld.xlsx`. Meet vervolgens met:

```bash
node tools/testset.mjs --meet dist/kwaliteit-ronde2/Testset_beoordeeld.xlsx testdata --rapport dist/kwaliteit-ronde2/resultaat.json
```

Er wordt geen algemene matchkwaliteit geclaimd zolang die onafhankelijke beoordeling ontbreekt. De
synthetische set en zes gekende private voorbeelden zijn regressiebewijs. Representatieve acceptatiedata,
een afzonderlijke validatieset, CI, de benchmarkreparatie, prestatiebudgetten en de offline Windows-acceptatie
blijven vervolgwerk. Grote algemene sleutels hebben nog steeds geen volledige paarsgewijze vergelijking;
de huidige grotegroepstests stellen geen prestatiegarantie voor alle invoer vast.
