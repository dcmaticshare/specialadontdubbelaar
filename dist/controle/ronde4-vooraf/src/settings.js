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
