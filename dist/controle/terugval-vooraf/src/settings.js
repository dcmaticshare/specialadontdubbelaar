// Alle grenzen, gewichten en woordenlijsten van de Lead-ontdubbelaar staan hier op één plaats,
// zodat ze in stap 9 (afstellen op echte data) makkelijk bij te stellen zijn.
// De getallen volgen de tabel "Wanneer twee rijen hetzelfde bedrijf zijn" uit het hoofdplan.

export const SETTINGS = {
  // Punten per overeenkomend gegeven.
  punten: {
    telefoon: 45,            // zelfde telefoonnummer
    telefoonCentrale: 20,    // zelfde nummer, maar het hoort bij 3 of meer verschillende namen (centrale)
    email: 45,               // exact hetzelfde e-mailadres
    domein: 40,              // zelfde domein (website of e-mail), gratis providers tellen niet
    domeinCentrale: 20,      // zelfde domein dat bij 3 of meer verschillende namen hoort
    adres: 30,               // zelfde straat + huisnummer
    adresAnderePostcode: 15, // zelfde straat + huisnummer, maar andere postcode
    naamMax: 60,             // bedrijfsnaam, naar gelijkenis (0..1 x naamMax)
    contactpersoon: 20,      // contactpersoon lijkt op de bedrijfsnaam aan de andere kant
    zelfdeContactpersoon: 15,// dezelfde contactpersoon aan beide kanten (minstens 2 woorden)
    btwOngeldigGelijk: 30,   // zelfde BTW-cijfers maar het nummer is ongeldig: telt wel, beslist niet
  },

  // Grenzen voor de beslissing per paar (bij strengheid "gemiddeld").
  grenzen: {
    zekerDubbel: 90,     // vanaf dit aantal punten, mits de namen genoeg lijken: automatisch samenvoegen
    teControleren: 55,   // vanaf dit aantal punten: aan een mens voorleggen
    naamMinimum: 0.6,    // minimale naamgelijkenis (0..1) om automatisch samen te voegen
    naamTelt: 0.3,       // onder deze gelijkenis krijgt de naam geen punten
    contactMinimum: 0.6, // minimale gelijkenis contactpersoon <-> bedrijfsnaam
  },

  // Strengheid van de controle: de gebruiker kiest in stap 3 hoeveel paren hij wil nakijken.
  // Elk niveau overschrijft grenzen uit "grenzen"; alleen de ondergrens "teControleren" schuift mee.
  // De punten per paar en de automatische samenvoegingen (zekerDubbel) blijven bij elk niveau gelijk,
  // zodat een mildere stand nooit meer rijen automatisch samenvoegt: bij twijfel verwijdert de tool niets.
  // Richtpunten: telefoon of e-mail alleen = 45, domein alleen = 40, adres + licht gelijkende naam = 48..55,
  // twee sterke gegevens (bv. domein + adres) = 70 of meer.
  strengheid: {
    standaard: 'gemiddeld',
    niveaus: [
      { key: 'streng', label: 'Streng', grenzen: { teControleren: 40 },
        uitleg: 'Eén gedeeld gegeven volstaat: ook paren met alleen hetzelfde telefoonnummer, e-mailadres of domein, of hetzelfde adres met een naam die er wat op lijkt. Meeste werk, kleinste kans op een gemiste dubbel.' },
      { key: 'gemiddeld', label: 'Gemiddeld', grenzen: {},
        uitleg: 'Een gedeeld gegeven plus een naam die er wat op lijkt, of een bijna gelijke naam. De gewone stand.' },
      { key: 'mild', label: 'Mild', grenzen: { teControleren: 70 },
        uitleg: 'Alleen paren met minstens twee gedeelde gegevens, of hetzelfde adres met een duidelijk gelijkende naam. Minste werk; paren met één gedeeld gegeven blijven apart staan.' },
    ],
  },

  // Een telefoonnummer of domein dat bij zoveel verschillende namen hoort, is een centrale.
  centrale: { minAantalNamen: 3 },

  // Kandidaatparen zoeken (blokkering): alleen rijen vergelijken die een sleutel delen.
  blokkering: {
    zeldzaamWoordMaxDf: 8, // een naamwoord is zeldzaam als het in hoogstens zoveel rijen voorkomt
    maxBucket: 400,        // daarboven alleen compacte zekere overeenkomsten; geen volledige combinaties
    naamPrefixLengte: 4,   // eerste n letters van de naam als sleutel
  },

  // Per bronkolom, over niet-lege genormaliseerde waarden. Herhaalde bedrijfsnamen mogen
  // nog sterke contactsignalen gebruiken; bij verschillende namen is een kopie verdacht.
  bijnaConstant: {
    aandeel: 0.95, minRijen: 20, minVerschillendeNamen: 2,
    contactVelden: ['telefoon', 'email', 'website', 'contactpersoon', 'voornaam', 'achternaam'],
    persoonsVelden: ['contactpersoon', 'voornaam', 'achternaam'],
    beschrijvendeVelden: ['gemeente', 'hoofdsector', 'sector'],
  },

  bronprofielen: { sleutel: 'lead-ontdubbelaar.profielen', versie: 1, maxAantal: 50 },

  verwerking: { normaliseerBlok: 1000, scoreBlok: 3000, schermPauzeMs: 25 },

  // Ontwikkelcontrole: vaste synthetische werklast en meetmethode. Geen echte brongegevens.
  prestaties: {
    versie: 1, seed: 12345, rijen: [1000, 10000, 50000],
    scenarios: ['uniek', 'duplicaten', 'gedeeld'], herhalingen: 3,
    uniekAandeel: 0.95, duplicaatGroep: 25, gedeeldeGroep: 2, telefoonBucket: 50,
    domeinPools: 2, zonderBtwElke: 5, btwBasis: 4000000, btwStap: 7,
    timerIntervalMs: 20, timeoutMs: 240000, meetTolerantieMs: 0.01, minLongTaskMs: 50,
    kolommen: ['Naam', 'BTW', 'Telefoon', 'E-mail', 'Website', 'Adres', 'Opmerkingen'],
    referentie: { platform: 'darwin', arch: 'arm64', cpu: 'Apple M5 Pro', geheugenBytes: 25769803776,
      node: '24.19.0', browser: '155.0.8059.84', playwright: '1.62.1' },
    fasen: ['inlezen', 'koppelen', 'normaliseren', 'kandidaten', 'scoren', 'voorbereiden', 'groeperen', 'werkmap', 'serialiseren'],
    totaalFasen: ['inlezen', 'koppelen', 'voorbereiden', 'groeperen', 'werkmap', 'serialiseren'],
    // Regressiegrenzen na drie eindmetingen per geval; zie docs/Prestatiebaseline.json.
    // Tijd: maximum × 1,5; RSS: × 1,25; export: × 1,05; kandidaten: waargenomen maximum.
    budgetten: {
      "node/uniek/1000": {"totaalMs": 500, "fasen": {"inlezen": 50, "koppelen": 50, "normaliseren": 50, "kandidaten": 50, "scoren": 50, "voorbereiden": 50, "groeperen": 50, "werkmap": 50, "serialiseren": 150}, "kandidaten": 50, "exportBytes": 1110016, "piekRssBytes": 268435456},
      "node/duplicaten/1000": {"totaalMs": 500, "fasen": {"inlezen": 50, "koppelen": 50, "normaliseren": 50, "kandidaten": 50, "scoren": 50, "voorbereiden": 100, "groeperen": 50, "werkmap": 50, "serialiseren": 150}, "kandidaten": 12000, "exportBytes": 1097728, "piekRssBytes": 335544320},
      "node/gedeeld/1000": {"totaalMs": 500, "fasen": {"inlezen": 50, "koppelen": 50, "normaliseren": 50, "kandidaten": 50, "scoren": 200, "voorbereiden": 250, "groeperen": 50, "werkmap": 100, "serialiseren": 150}, "kandidaten": 24500, "exportBytes": 975872, "piekRssBytes": 402653184},
      "node/uniek/10000": {"totaalMs": 2700, "fasen": {"inlezen": 50, "koppelen": 150, "normaliseren": 400, "kandidaten": 100, "scoren": 50, "voorbereiden": 450, "groeperen": 100, "werkmap": 650, "serialiseren": 1350}, "kandidaten": 517, "exportBytes": 11504640, "piekRssBytes": 872415232},
      "node/duplicaten/10000": {"totaalMs": 2500, "fasen": {"inlezen": 50, "koppelen": 150, "normaliseren": 350, "kandidaten": 50, "scoren": 200, "voorbereiden": 550, "groeperen": 200, "werkmap": 450, "serialiseren": 1200}, "kandidaten": 120000, "exportBytes": 12146688, "piekRssBytes": 1073741824},
      "node/gedeeld/10000": {"totaalMs": 4300, "fasen": {"inlezen": 50, "koppelen": 150, "normaliseren": 300, "kandidaten": 150, "scoren": 1650, "voorbereiden": 2050, "groeperen": 250, "werkmap": 500, "serialiseren": 1400}, "kandidaten": 245008, "exportBytes": 10033152, "piekRssBytes": 1140850688},
      "node/uniek/50000": {"totaalMs": 16600, "fasen": {"inlezen": 250, "koppelen": 600, "normaliseren": 1650, "kandidaten": 350, "scoren": 50, "voorbereiden": 2000, "groeperen": 250, "werkmap": 3950, "serialiseren": 9700}, "kandidaten": 2667, "exportBytes": 58911744, "piekRssBytes": 4026531840},
      "node/duplicaten/50000": {"totaalMs": 17900, "fasen": {"inlezen": 250, "koppelen": 600, "normaliseren": 1600, "kandidaten": 250, "scoren": 900, "voorbereiden": 2650, "groeperen": 1350, "werkmap": 3150, "serialiseren": 10050}, "kandidaten": 600000, "exportBytes": 63158272, "piekRssBytes": 4026531840},
      "node/gedeeld/50000": {"totaalMs": 32200, "fasen": {"inlezen": 250, "koppelen": 550, "normaliseren": 1500, "kandidaten": 650, "scoren": 8600, "voorbereiden": 10700, "groeperen": 3150, "werkmap": 5150, "serialiseren": 12500}, "kandidaten": 1225284, "exportBytes": 51017728, "piekRssBytes": 5368709120},
      "browser/uniek/1000": {"totaalMs": 500, "fasen": {"inlezen": 50, "koppelen": 50, "normaliseren": 50, "kandidaten": 50, "scoren": 50, "voorbereiden": 50, "groeperen": 50, "werkmap": 50, "serialiseren": 150}, "kandidaten": 50, "exportBytes": 1110016, "browserBlokkadeMs": 200, "timerVertragingMs": 200},
      "browser/duplicaten/1000": {"totaalMs": 500, "fasen": {"inlezen": 50, "koppelen": 50, "normaliseren": 50, "kandidaten": 50, "scoren": 50, "voorbereiden": 100, "groeperen": 50, "werkmap": 50, "serialiseren": 150}, "kandidaten": 12000, "exportBytes": 1097728, "browserBlokkadeMs": 200, "timerVertragingMs": 200},
      "browser/gedeeld/1000": {"totaalMs": 500, "fasen": {"inlezen": 50, "koppelen": 50, "normaliseren": 50, "kandidaten": 50, "scoren": 150, "voorbereiden": 200, "groeperen": 50, "werkmap": 50, "serialiseren": 150}, "kandidaten": 24500, "exportBytes": 975872, "browserBlokkadeMs": 200, "timerVertragingMs": 200},
      "browser/uniek/10000": {"totaalMs": 2400, "fasen": {"inlezen": 50, "koppelen": 250, "normaliseren": 350, "kandidaten": 50, "scoren": 50, "voorbereiden": 400, "groeperen": 100, "werkmap": 450, "serialiseren": 1200}, "kandidaten": 517, "exportBytes": 11504640, "browserBlokkadeMs": 1200, "timerVertragingMs": 1200},
      "browser/duplicaten/10000": {"totaalMs": 2500, "fasen": {"inlezen": 50, "koppelen": 200, "normaliseren": 300, "kandidaten": 50, "scoren": 400, "voorbereiden": 700, "groeperen": 150, "werkmap": 350, "serialiseren": 1050}, "kandidaten": 120000, "exportBytes": 12146688, "browserBlokkadeMs": 1100, "timerVertragingMs": 1100},
      "browser/gedeeld/10000": {"totaalMs": 3800, "fasen": {"inlezen": 50, "koppelen": 250, "normaliseren": 300, "kandidaten": 100, "scoren": 1650, "voorbereiden": 2000, "groeperen": 200, "werkmap": 400, "serialiseren": 1050}, "kandidaten": 245008, "exportBytes": 10033152, "browserBlokkadeMs": 1100, "timerVertragingMs": 1100},
      "browser/uniek/50000": {"totaalMs": 12200, "fasen": {"inlezen": 200, "koppelen": 1250, "normaliseren": 1800, "kandidaten": 300, "scoren": 50, "voorbereiden": 2050, "groeperen": 200, "werkmap": 2600, "serialiseren": 5950}, "kandidaten": 2667, "exportBytes": 58911744, "browserBlokkadeMs": 6000, "timerVertragingMs": 6000},
      "browser/duplicaten/50000": {"totaalMs": 13500, "fasen": {"inlezen": 150, "koppelen": 1000, "normaliseren": 1650, "kandidaten": 200, "scoren": 1850, "voorbereiden": 3600, "groeperen": 850, "werkmap": 2250, "serialiseren": 5700}, "kandidaten": 600000, "exportBytes": 63158272, "browserBlokkadeMs": 5700, "timerVertragingMs": 5700},
      "browser/gedeeld/50000": {"totaalMs": 20700, "fasen": {"inlezen": 150, "koppelen": 1000, "normaliseren": 1600, "kandidaten": 550, "scoren": 8800, "voorbereiden": 10900, "groeperen": 1050, "werkmap": 2250, "serialiseren": 5550}, "kandidaten": 1225284, "exportBytes": 51017728, "browserBlokkadeMs": 5600, "timerVertragingMs": 5600},
    },
  },

  // Alleen witruimte direct rond @ herstellen; overige onherkende delen afwijzen en melden.
  contactnormalisatie: { emailSpatiesRondAt: true },

  // Tikfouten in naamwoorden: toegestane bewerkingsafstand per woordlengte.
  fuzzy: { minLengteAfstand1: 5, minLengteAfstand2: 9 },

  // Gratis e-mailproviders: het domein zegt niets over het bedrijf.
  gratisDomeinen: [
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.be', 'hotmail.fr', 'hotmail.nl', 'outlook.com', 'outlook.be',
    'live.be', 'live.com', 'live.nl', 'msn.com', 'telenet.be', 'skynet.be', 'proximus.be', 'scarlet.be', 'belgacom.net',
    'yahoo.com', 'yahoo.fr', 'yahoo.be', 'icloud.com', 'me.com', 'mac.com', 'pandora.be', 'base.be', 'voo.be', 'edpnet.be',
    'protonmail.com', 'proton.me', 'gmx.com', 'gmx.net', 'ziggo.nl', 'kpnmail.nl', 'planet.nl', 'home.nl', 'mail.com',
  ],

  // Platformen: een link daarnaartoe is geen eigen website.
  platformDomeinen: [
    'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
    'restaurantguru.com', 'tripadvisor.com', 'tripadvisor.be', 'yelp.com', 'google.com', 'google.be', 'goo.gl', 'g.page',
    'business.site', 'wix.com', 'wixsite.com', 'jimdosite.com', 'webnode.be', 'pinterest.com', 'booking.com',
    'takeaway.com', 'deliveroo.be', 'ubereats.com', 'trustpilot.com', 'openingsuren.vlaanderen', 'bizzy.org', 'kbo.be',
    'economie.fgov.be', 'companyweb.be', 'trendstop.be', 'goudengids.be', 'pagesdor.be', 'staatsbladmonitor.be',
    'northdata.com', 'whatsapp.com', 'wa.me', 'linktr.ee', 'immoweb.be', 'zimmo.be', 'bing.com', 'apple.com',
  ],

  // Rechtsvormen die uit de bedrijfsnaam verdwijnen (zonder punten, kleine letters).
  rechtsvormen: [
    'bv', 'bvba', 'ebvba', 'nv', 'sa', 'vzw', 'asbl', 'cv', 'cvba', 'cvoa', 'commv', 'gcv', 'vof', 'snc', 'srl', 'sprl',
    'scrl', 'scs', 'se', 'ltd', 'gmbh', 'bvb', 'nvsa', 'eenmanszaak', 'ez',
  ],

  // Afkortingen in straatnamen (kleine letters, zonder punt).
  straatAfkortingen: {
    stwg: 'steenweg', stw: 'steenweg', stwng: 'steenweg', str: 'straat', st: 'sint', rid: 'ridder', dr: 'dokter',
    kon: 'koning', bgm: 'burgemeester', burg: 'burgemeester', pr: 'prins', av: 'avenue', bd: 'boulevard', ch: 'chaussee',
    pl: 'plein', ln: 'laan', kard: 'kardinaal', gen: 'generaal', kol: 'kolonel', prof: 'professor',
  },

  // Opvulwaarden die als leeg gelden.
  opvulwaarden: ['-', '--', '---', '+', '/', '?', '??', 'n.v.t.', 'nvt', 'n/a', 'na', 'none', 'null', 'onbekend', 'geen',
    'niet gekend', 'x', '.', '0', 'nee', 'neen', 'no', 'leeg'],

  // Kwaliteitscontrole: alleen voor ontwikkeltools, nooit blijvende IDs in het product.
  kwaliteit: {
    formaat: 1,
    labels: ['zelfde', 'verschillend'],
    kolommen: ['Dataset', 'Paar', 'Record A', 'Record B', 'Oordeel (zelfde / verschillend)'],
    grenzen: { fouteSamenvoegingen: 0, foutePaarscores: 0, gemisteDubbels: 0, gemisteKandidaten: 0 },
    steekproef: { seed: 7, zeker: 40, bijna: 30, buitenKandidaten: 30, maxPogingenPerPaar: 100 },
  },

  // Eigen exportcontract: metadata telt nooit als contact- of adresgegeven.
  eigenExport: {
    versie: '1',
    herkenningsKolommen: ['Lead Source', 'Project', 'Leadowner', 'Company', 'Straat Huisnummer', 'Nr', 'Bronnen', 'Mogelijk dubbel met'],
    metadata: ['Nr', 'Bronnen', 'Mogelijk dubbel met'],
    extraPrefix: 'Extra: ',
    oorspronkelijkeKolommen: ['Nr', 'Bronrij', 'Bron', 'Tabblad', 'Rij', 'Kolom', 'Kolomnaam', 'Waarde'],
    vasteTelefoons: 3,
    vasteEmails: 2,
    maxCelTekens: 32767,
    maxRijen: 1048576,
    maxKolommen: 16384,
    breedteSteekproef: 499, minBreedte: 8, maxBreedte: 60, breedteMarge: 2, schrijfBlok: 1000,
  },

  // Kolomindeling van het tabblad "Unieke leads": het huidige uploadformaat (Lead Source ... Achternaam),
  // plus Nr, Bronnen en Mogelijk dubbel met, en daarna de extra gegevens die niet verloren mogen gaan.
  // "van" verwijst naar een veld van de samengevoegde lead; "raw:" neemt de originele kolom uit de bronlijst over.
  exportKolommen: [
    { kop: 'Lead Source', van: 'raw:Lead Source', anders: 'bronLabel' },
    { kop: 'Project', van: 'raw:Project', anders: 'postcodeGemeente' },
    { kop: 'Leadowner', van: 'raw:Leadowner', anders: 'tekst:-' },
    { kop: 'Company', van: 'bedrijfsnaam' },
    { kop: 'Hoofdsector', van: 'hoofdsector' },
    { kop: 'Sector', van: 'sector' },
    { kop: 'Mobile', van: 'telefoon' },
    { kop: 'Straat Huisnummer', van: 'adres' },
    { kop: 'Postcode', van: 'postcode' },
    { kop: 'Woonplaats', van: 'gemeente' },
    { kop: 'Voornaam', van: 'voornaam' },
    { kop: 'Achternaam', van: 'achternaam' },
    { kop: 'Nr', van: 'nr' },
    { kop: 'Bronnen', van: 'bronnen' },
    { kop: 'Mogelijk dubbel met', van: 'mogelijkDubbel' },
    { kop: 'Telefoon 2', van: 'telefoon2' },
    { kop: 'Telefoon 3', van: 'telefoon3' },
    { kop: 'E-mail', van: 'email' },
    { kop: 'E-mail 2', van: 'email2' },
    { kop: 'Website', van: 'website' },
    { kop: 'BTW', van: 'btw' },
    { kop: 'Contactpersoon', van: 'contactpersoon' },
    { kop: 'Bus', van: 'bus' },
  ],
};
