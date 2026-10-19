# Registreert uitsluitend door een mens uitgevoerde Windows-acceptatie; voert geen oordelen in.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Deze registratie vereist Windows.' }
Set-Location $PSScriptRoot
if (Test-Path 'windows-bewijs.json') { throw 'Bewijs bestaat al. Bewaar de vorige map en maak een nieuw acceptatiepakket.' }
$pakket = Get-Content -Raw -Encoding UTF8 'pakket.json' | ConvertFrom-Json
foreach ($file in $pakket.bestanden.PSObject.Properties) {
  if ((Get-FileHash -Algorithm SHA256 $file.Name).Hash.ToLowerInvariant() -ne $file.Value) { throw 'Het acceptatiepakket is gewijzigd.' }
}
$beoordelaar = Read-Host 'Naam van de persoon die de acceptatie werkelijk heeft uitgevoerd'
if ([string]::IsNullOrWhiteSpace($beoordelaar)) { throw 'Een beoordelaar is verplicht.' }
$browsers = @()
foreach ($naam in @('edge', 'chrome')) {
  $controles = [ordered]@{}
  foreach ($stap in @('dubbelklik', 'fileProtocol', 'netwerkUit', 'geenInstallatie', 'ladenKoppelen', 'tweeLeads', 'tekstVeilig', 'export', 'herimport', 'excel', 'geenHerstelmelding')) {
    $antwoord = Read-Host "$naam - $stap werkelijk geslaagd volgens Windows-acceptatie.md? Typ ja of nee"
    $controles[$stap] = $antwoord -ceq 'ja'
  }
  $versie = Read-Host "$naam - volledige browserversie uit het venster Over (vier getallen)"
  if ($versie -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Ongeldige browserversie.' }
  $excel = Read-Host "$naam - Excel-versie en build uit Bestand > Account > Info over Excel"
  if ([string]::IsNullOrWhiteSpace($excel)) { throw 'Excel-versie ontbreekt.' }
  $bestanden = [ordered]@{}
  foreach ($soort in @('export', 'herimport', 'schermafbeelding')) {
    $ext = if ($soort -eq 'schermafbeelding') { 'png' } else { 'xlsx' }
    $file = "$naam-$soort.$ext"
    if (!(Test-Path -PathType Leaf $file) -or (Get-Item $file).Length -eq 0) { throw "Bijlage ontbreekt: $file" }
    $bestanden[$soort] = @{ pad = $file; sha256 = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLowerInvariant() }
  }
  $browsers += @{ naam = $naam; versie = $versie; excelVersie = $excel; controles = $controles; bestanden = $bestanden }
}
$os = Get-CimInstance Win32_OperatingSystem
$bewijs = [ordered]@{
  versie = 1; platform = 'win32'; windowsVersie = "$($os.Caption) $($os.Version) build $($os.BuildNumber)"
  beoordelaar = $beoordelaar; datum = [DateTime]::UtcNow.ToString('o')
  htmlSha256 = (Get-FileHash -Algorithm SHA256 'Lead-ontdubbelaar.html').Hash.ToLowerInvariant()
  procedureSha256 = (Get-FileHash -Algorithm SHA256 'Windows-acceptatie.md').Hash.ToLowerInvariant()
  browsers = $browsers
}
$bewijs | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 'windows-bewijs.json'
Write-Host 'Bewijs geregistreerd. Laat de volledige map lokaal door check:release controleren. Dit is nog geen releasegoedkeuring.'
