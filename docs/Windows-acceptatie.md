# Windows-acceptatie via dubbelklik, zonder netwerk

Voer deze procedure werkelijk uit op een Windows-pc met geïnstalleerde Microsoft Edge, Google Chrome en Microsoft
Excel. Een Mac, Chromium-automatisering, browseremulatie of alleen een groene CI-run voldoet niet. Node is op de
Windows-pc niet nodig. Registreer uitsluitend eigen waarnemingen; ontbrekend of mislukt blijft een releaseblokkade.

## Pakket voorbereiden

De ontwikkelaar voert `node tools/prepare-windows.mjs` uit. De nieuwe map `dist/windows-acceptatie/` bevat de exacte
productie-HTML, twee synthetische CSV-bestanden, deze procedure, een PowerShell-registratiescript en checksums.
Bestaande pakketten worden niet overschreven. Voor een volgende poging kan een nieuwe map worden meegegeven.
Kopieer de volledige map naar de Windows-pc. Het pakket bevat geen echte leads en geen ontwikkelbuild.

## Tweemaal uitvoeren: eerst Edge, dan Chrome

1. Noteer Windows-versie, volledige browserversie en Excel-versie/build. Stel de te testen browser als
   standaardapp voor `.html` in. Sluit eerdere testvensters. Gebruik een schoon browserprofiel zonder opgeslagen
   bronprofielen. Er is geen installatie van de toepassing en geen beheerdersrecht nodig.
2. Schakel wifi uit en trek de netwerkkabel uit. Controleer in Windows dat er geen actieve netwerkverbinding is.
   Houd de verbinding uit tijdens openen, laden, verwerken, downloaden, herimport en Excel-controle.
3. Dubbelklik in Verkenner op **Lead-ontdubbelaar.html**. Controleer in de adresbalk dat het lokale bestand met
   `file:///` is geopend in de juiste browser. Er mag geen lokale webserver worden gebruikt.
4. Laad uitsluitend **synthetisch.csv**. Ga naar kolommen koppelen, controleer de voorgestelde velden en verwerk
   op **Gemiddeld**. Verwacht 3 bronrijen en **2 unieke leads**. `Fabelwinkel` en `Fabelwinkel BV` horen samen.
   De derde naam `<img src=x onerror=alert(1)>` blijft zichtbare tekst: geen afbeelding of alert.
5. Download het resultaat en bewaar als **edge-export.xlsx** respectievelijk **chrome-export.xlsx** in het pakket.
6. Start een nieuwe verwerking. Laad die export én **nieuwe-lijst.csv**, ga naar kolommen en verwerk.
   Verwacht opnieuw **2 unieke leads**. De kolom `Nr` telt niet als huisnummer. Download en bewaar als
   **edge-herimport.xlsx** respectievelijk **chrome-herimport.xlsx**.
7. Open beide XLSX-bestanden in de echte Microsoft Excel-desktopapp. Beschermde weergave mag verschijnen;
   een melding om het bestand te herstellen of onleesbare inhoud betekent afkeuring. Sla de bewijsexports
   niet opnieuw op vanuit Excel; hun oorspronkelijke downloadbytes moeten behouden blijven.
8. Controleer in beide bestanden de zeven tabbladen: **Unieke leads**, **Te controleren**, **Per bron**,
   **Logboek**, **Beslissingen**, **Oorspronkelijke gegevens**, **Info**. Bij Fabelwinkel BV blijven
   `Teststraat 42 bus 3`, vijf telefoons (de vijfde `+32 60 00 10 05`), vier e-mails (de vierde `d@fabel.invalid`),
   en beide opmerkingen `=BEWAAR-MIJ` en `TWEEDE-WAARDE` aanwezig. De opmerking met `=` is tekst, geen formulefout.
   In oorspronkelijke gegevens staat `Norian Fabelman`; bij de herimport blijft ook de nieuwe lijst aantoonbaar.
9. Bewaar per browser één PNG **edge-schermafbeelding.png** respectievelijk **chrome-schermafbeelding.png**,
   waarop de lokale browseradresbalk, het resultaat en de uitgeschakelde netwerkstatus zichtbaar zijn.
   Noteer afwijkingen apart; bevestig de betreffende stap als `nee` bij registratie.

De registratiesleutels volgen bovenstaande stappen: `dubbelklik` en `fileProtocol` stap 3, `netwerkUit` stap 2
gedurende de hele proef, `geenInstallatie` stap 1/3, `ladenKoppelen` en `tweeLeads` stap 4,
`tekstVeilig` stap 4/8, `export` stap 5, `herimport` stap 6, `excel` en `geenHerstelmelding` stap 7/8.

## Bewijs registreren en terugbrengen

Open PowerShell in de pakketmap en voer `powershell -NoProfile -File .\registreer-windows.ps1` uit.
Het script weigert een ander platform, gewijzigde pakketbestanden en ontbrekende bijlagen. Het vraagt per browser
expliciet om iedere waarneming. Geen antwoord of een ander antwoord dan `ja` blijft afgekeurd. Het script wijzigt
geen uitvoeringsbeleid; als het lokale beleid scripts blokkeert, laat de beheerder de registratie via de toegestane
werkwijze uitvoeren. Het product zelf vereist geen PowerShell.

Breng de volledige map terug naar `dist/windows-acceptatie/` of geef het bewijsbestand expliciet mee:

```bash
node tools/check-release.mjs --windows dist/windows-acceptatie/windows-bewijs.json
```

De releasecontrole vereist beide browsers, alle bevestigingen, Windows- en Excel-versies, beoordelaar, datum,
dezelfde HTML en procedure, de vier ongewijzigde XLSX-downloads en beide screenshots. Zij opent de werkmappen
opnieuw en controleert tekstcellen, tabbladen en vaste inhoud. De handmatige verklaring bewijst de bediening en
het openen in Windows/Excel; een JSON-bestand is geen digitale handtekening. Bewaar de originele bijlagen.
Bewijs ouder dan 30 dagen (de grens in `SETTINGS.release`) vereist een nieuwe acceptatie.
