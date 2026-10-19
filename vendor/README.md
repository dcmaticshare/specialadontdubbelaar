# vendor

## SheetJS Community Edition 0.20.3

- Bron: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- Gedownload op: 2026-10-16
- SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`
- Licentie: Apache 2.0, zie `LICENSE-SheetJS.txt` (gaat mee in het gebouwde bestand)

0.20.3 was op 2026-10-16 de nieuwste versie op cdn.sheetjs.com. De versie 0.18.5 op npm
is verouderd en heeft bekende lekken bij het openen van gemanipuleerde bestanden; gebruik die niet.

Controleer de controlesom na een update:

```bash
shasum -a 256 vendor/xlsx.full.min.js
```

## Inter (variabel lettertype, Latijnse tekens)

- Bron: https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2
- Gedownload op: 2026-10-17; dezelfde Inter-versie als op specialad.be.
- Bestand: `inter-latin.woff2`, normale stijl met variabele gewichten.
- SHA-256: `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62`
- Licentie: SIL Open Font License 1.1, zie `LICENSE-Inter.txt` (gaat mee als commentaar in de HTML).
- Licentiebron: https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt

De build neemt het lettertype als data-URL op. Er wordt geen online lettertype geladen.

## Specialad-logo

- Bron: https://specialad.be/wp-content/uploads/2022/04/logo-specialad-white.png
- Gedownload op: 2026-10-17, voor de gevraagde Specialad-huisstijl.
- Bestand: `src/assets/specialad-logo-wit.png`.
- SHA-256: `198df4c8317202229f75ff791d5f50ac87d40aa8e520d2756c44dbdaff13f6ab`

Het logo blijft eigendom van Specialad en wordt bij de build als data-URL ingebakken.
