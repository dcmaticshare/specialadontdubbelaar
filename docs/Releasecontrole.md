# CI, releasecontrole en acceptatie — 17 oktober 2026

Dit is het historische verslag van 17 oktober. De actuele controles na de codescan staan in
[Codescan-afronding-2026-10-18.md](Codescan-afronding-2026-10-18.md). De onderstaande eindmeting en
`Releasebewijs.json` gelden uitsluitend voor hun oorspronkelijke bron- en HTML-checksums.
De nieuwste prestatie- en releasecontrole staat bij het
[prestatieherstel na de codescan](Prestatieherstel-codescan-2026-10-18.md).

Dit vervolg op het controleplan bewaart de eerdere engine- en IO-fixes, de compacte werkbladen, de browserpauzes,
de offline CSP en alle bestaande kwaliteits- en prestatiegrenzen. Er zijn geen wijzigingen in de matchlogica.
In `src/settings.js` is uitsluitend het releasebeleid toegevoegd: 30 dagen bewijsduur en een controletimeout.

## Openbare CI

Er is bij inspectie geen Git-remote gevonden. De gekozen GitHub Actions-workflow is daarmee voorbereid voor een
latere GitHub-remote; er is geen gehoste run of branch protection geclaimd. De workflow gebruikt `push`,
`pull_request` en `workflow_dispatch`, alleen leesrecht op repository-inhoud en geen bewaarde Git-credentials.
Ubuntu 24.04 voert de tests, invarianten, bestandscontracten, tweevoudige reproduceerbare build, CSP-controle,
synthetische kwaliteit en Playwright Chromium via `file://` uit. Zij installeert de exacte projectversies en
gebruikt `pnpm install --frozen-lockfile`. Er zijn geen secrets nodig, private stappen of uploads.

De inrichting volgt de officiële documentatie van [Playwright CI](https://playwright.dev/docs/ci),
[actions/checkout](https://github.com/actions/checkout) en [actions/setup-node](https://github.com/actions/setup-node).
De browserinstallatie gebruikt `playwright install --with-deps chromium`. Hosted CI krijgt geen machinegebonden
M5-budgetten. Ook Windows-hosted automatisering zou dubbelklik, fysiek uitgeschakeld netwerk en Excel-bediening
niet vanzelf bewijzen; deze acceptatie blijft apart vereist.

## Wat de releasepoort afdwingt

`pnpm check:release` / `node tools/check-release.mjs`:

| Onderdeel | Verplichte controle |
| --- | --- |
| Openbaar | Tests, invarianten, bestandscontracten en reproduceerbare productie/dev-builds worden nu uitgevoerd. |
| Synthetische kwaliteit | De vaste openbare grondwaarheid wordt nu gecontroleerd. |
| Browser | De actuele productie-HTML wordt echt geopend, met downloadcontrole en actieve CSP-proef. |
| Private voorbeelden | De zes bekende voorbeelden worden nu uitgevoerd; uitvoer blijft in een lokaal log. |
| Private beoordelingen | De vaste 1.357 rijen en alle 212 paren, vast manifest, strenge evaluator en onafhankelijke menselijke verklaring zijn verplicht. |
| Prestaties | Alle 54 metingen, kwaliteitswaarborgen, referentiemachine, runtime en ongewijzigde budgetten; de bronchecksum moet actueel zijn. |
| Windows | Edge én Chrome, dubbelklik, `file://`, netwerk uit, export, herimport en echte Excel; hashes en inhoud van de downloads worden opnieuw gecontroleerd. |

De nieuwe regressies testen ieder ontbrekend of mislukt verplicht onderdeel, ontbrekende bewijschecksums,
verkeerde bron/HTML, verlopen/toekomstige/ongeldige datums, lege en ongeldige labels, verkeerde private set,
veranderde oordelen, ontbrekende onafhankelijkheidsverklaring, een onvolledige of te trage prestatiematrix,
een afwijkende referentiemachine, Mac-bewijs voor Windows, ontbrekende browser/Excel/offline-stappen,
veranderde bijlagen en zelfs een inhoudelijk foutieve export met een opnieuw berekende checksum.
Een CLI-regressie laat alle publieke opdrachten slagen maar onthoudt de verplichte externe bewijzen: exitcode 1.

Bewijs wordt niet groen door een opgeslagen `ok: true`. Private kwaliteit wordt opnieuw berekend en aan de vaste
set gekoppeld. Prestaties worden opnieuw aan alle bestaande budgetten getoetst. Windows-bijlagen worden gehasht
en opnieuw geopend. De gehele bron- en testset wordt aan begin/einde van de releasecontrole vergeleken; ook
private invoer en externe bewijsbestanden mogen intussen niet veranderen. Een onderbroken run start en blijft rood.

Iedere poging schrijft uitsluitend in een nieuwe map onder `dist/release/`. De commandologs kunnen private
gegevens bevatten. De console noemt alleen onderdeel en status. Oude pogingen blijven staan; geen ervan wordt
als bewijs voor een nieuwe poging ingelezen. De opdracht weigert uitvoering met `CI=true`.

Bewijzen mogen maximaal 30 dagen oud zijn. De prestatiebronchecksum omvat `src/`, `tools/`, build, pakketversies,
lockfile, Node-pins en vendorbestanden. Een wijziging aan de tooling maakt bestaand prestatiebewijs conservatief
ongeldig, ook wanneer de matching gelijk blijft. De releasechecksum omvat daarnaast tests, CI, releasecontract
en Windows-procedure. Windows-acceptatie bindt aan HTML en procedure, zodat wijzigingen aan alleen tests geen
nieuwe menselijke Windows-proef vereisen. Een verklaring is een controleerbare menselijke bevestiging, geen
digitale handtekening. Deze lokale workflow beschermt tegen ontbrekend of oud bewijs, niet tegen een opzettelijk
vervalste menselijke verklaring of iemand die zelf de controlecode wijzigt.

## Uitvoering op deze Mac

Node staat niet op PATH. Voor browser- en releasecontroles op deze machine:

```bash
export PATH="/Users/dieter/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
export LEAD_BROWSER_CHANNEL=chrome
node tools/check.mjs
node tools/check-quality.mjs
node tools/check-browser.mjs
node tools/check-perf.mjs --meet dist/prestaties/release-eindmeting
node tools/check-perf.mjs --controleer dist/prestaties/release-eindmeting/rapport.json
node tools/check-release.mjs
```

`--meet` levert op zichzelf geen budgetgoedkeuring; zowel `--controleer` als `check:release` toetsen de volledige
matrix daarna aan alle vastgelegde grenzen. Meet sequentieel op de referentiemachine zonder zware parallelle taken.
Bewaar mislukte meetreeksen als diagnose; selecteer geen gunstige herhalingen uit verschillende reeksen.
De oorspronkelijke rustige eindmeting in `dist/prestaties/terugval-rustige-eindmeting/rapport.json` blijft bewaard.
Zij is historisch bewijs voor de eerdere bronversie en wordt niet achteraf van een nieuwe bronchecksum voorzien.

## Menselijke en platformafhankelijke afronding

De 212 labels worden uitsluitend door een mens ingevuld volgens [Private-beoordeling.md](Private-beoordeling.md).
De voorbereiding maakt een veilige kopie en een lege verklaring. Zij bewaart de oorspronkelijke XLSX en het
manifest byte voor byte. Er is geen label voorspeld of op basis van de engine-uitkomst ingevuld.

Een Windows-runtime of bruikbare Windows-VM is hier niet beschikbaar. Het overdraagbare pakket onder
`dist/windows-acceptatie/` bevat uitsluitend synthetische lijsten en de productie-HTML.
[Windows-acceptatie.md](Windows-acceptatie.md) beschrijft de precieze stappen en verwachte celwaarden.
Het PowerShell-script registreert door de tester bevestigde waarnemingen en de hashes van de vier exports en
twee screenshots. Het script is hier niet op Windows uitgevoerd. Zolang het bewijs ontbreekt, blijft de release rood.

Er wordt niet gecommit, gepusht of gepubliceerd en er worden geen berichten aan beoordelaars verzonden.

## Uitgevoerde eindcontrole

Het openbare samenvattingsbewijs staat in [Releasebewijs.json](Releasebewijs.json), zonder brongegevens of
private labels. De volledige lokale releasepoging staat in `dist/release/eindcontrole/rapport.json`.

| Uitgevoerde controle | Resultaat |
| --- | --- |
| Openbare tests | 249 geslaagd, nul overgeslagen; de oorspronkelijke 242 regressies blijven behouden. |
| Schone bronkopie | Tests, buildcontract en synthetische kwaliteit slagen zonder `testdata/`, private bewijzen of `node_modules/`. |
| Build | Tweemaal byte-identieke productiebuild; productie/dev-CSP, hashes en offline contract geldig. |
| Chrome 155.0.8059.84 op deze Mac | Volledige gerichte browsercontrole geslaagd; nul netwerkverzoeken en consolefouten. |
| Private voorbeelden | Alle zes bestaande gevallen geslaagd. |
| Private kwaliteitsset | 1.357 bronrijen en 212 paren teruggevonden; 0 geldige oordelen, 212 nog leeg. Terecht afgekeurd. |
| Prestaties | Nieuwe volledige reeks van 54 metingen in `dist/prestaties/release-eindmeting/rapport.json`; alle gegevenscontroles en alle ongewijzigde budgetten geslaagd. |
| Releasepoort | Exitcode 1; uitsluitend private beoordelingen/verklaring en Windows-bewijs blokkeren. |
| Behoud | SHA-256 van `AGENTS.md`, `CLAUDE.md`, de oorspronkelijke beoordelingswerkmap en het manifest ongewijzigd. Het eerdere rustige prestatie-eindrapport is eveneens intact. |
| CI-configuratie | YAML gecontroleerd en onderliggende opdrachten lokaal uitgevoerd. Zonder remote nog geen gehoste run. |
| Windows/Edge/Chrome/Excel | Niet uitgevoerd; het pakket en de registratieprocedure zijn gereed. Mac/Chrome is niet als Windows-bewijs geregistreerd. |

De nieuwe prestatiereeks is volledig opnieuw uitgevoerd voor de huidige bronchecksum. Er is niets gecombineerd
met de oorspronkelijke rustige eindmeting, geen enkele herhaling geschrapt en geen budget verhoogd.
