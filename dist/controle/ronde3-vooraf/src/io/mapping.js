// Kolommen koppelen (stap 3): standaardvelden, synoniemen, uitzonderingen en bronprofielen.
import { SETTINGS } from '../settings.js';
import { stripAccents } from '../engine/text.js';
import { cleanValue, normalizeBtw } from '../engine/normalize.js';

export const FIELDS = [
  { key: 'bedrijfsnaam', label: 'Bedrijfsnaam' },
  { key: 'contactpersoon', label: 'Contactpersoon' },
  { key: 'voornaam', label: 'Voornaam' },
  { key: 'achternaam', label: 'Achternaam' },
  { key: 'telefoon', label: 'Telefoon', multiple: true },
  { key: 'email', label: 'E-mail', multiple: true },
  { key: 'website', label: 'Website' },
  { key: 'btw', label: 'BTW-nummer' },
  { key: 'adres', label: 'Straat + huisnummer (één veld)' },
  { key: 'straat', label: 'Straat' },
  { key: 'huisnummer', label: 'Huisnummer' },
  { key: 'bus', label: 'Bus' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'gemeente', label: 'Gemeente' },
  { key: 'hoofdsector', label: 'Hoofdsector' },
  { key: 'sector', label: 'Sector' },
  { key: 'negeren', label: 'Niet gebruiken (meenemen als extra kolom)' },
];

export const FIELD_LABELS = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

const STRONG_COMPANY = ['bedrijfsnaam', 'bedrijf', 'bedrijven', 'company', 'company name', 'companyname', 'onderneming',
  'ondernemingsnaam', 'organisatie', 'organization', 'organisation', 'firma', 'zaak', 'handelsnaam', 'naam onderneming',
  'business name', 'naam bedrijf', 'bedrijf naam', 'klantnaam', 'vestiging'];

export const SYNONYMS = {
  bedrijfsnaam: [...STRONG_COMPANY, 'naam', 'name', 'business', 'klant', 'account', 'lead', 'winkel', 'merchant', 'titel', 'title'],
  contactpersoon: ['contactpersoon', 'contact', 'contact person', 'contactperson', 'persoon', 'personen', 'naam contact',
    'aanspreekpunt', 'zaakvoerder', 'contactnaam', 'contact naam', 'volledige naam', 'full name', 'fullname', 'eigenaar',
    'owner', 'beheerder', 'verantwoordelijke', 'naam contactpersoon'],
  voornaam: ['voornaam', 'first name', 'firstname', 'prenom'],
  achternaam: ['achternaam', 'familienaam', 'last name', 'lastname', 'surname', 'nom'],
  telefoon: ['telefoon', 'tel', 'telefoonnummer', 'telefoonnr', 'telefoon nr', 'phone', 'phone number', 'phonenumber',
    'mobile', 'mobiel', 'gsm', 'gsm nummer', 'gsmnummer', 'gsm nr', 'telephone', 'mobile phone', 'mobile number', 'vast',
    'vaste lijn', 'tel nr', 'telnr', 'telefoonnummers', 'cell', 'cellphone', 'telefoon 1', 'telefoon 2', 'telefoon 3',
    'phone 1', 'phone 2', 'telefoon1', 'telefoon2', 'tel 1', 'tel 2'],
  email: ['e mail', 'email', 'e mailadres', 'emailadres', 'mail', 'e mail adres', 'email address', 'e mail address',
    'mailadres', 'courriel', 'e mail 1', 'e mail 2', 'email 1', 'email 2', 'email1', 'email2'],
  website: ['website', 'web', 'url', 'site', 'webadres', 'homepage', 'www', 'domein', 'domain', 'web site', 'website url',
    'webpagina', 'webshop'],
  btw: ['btw', 'btw nummer', 'btwnummer', 'btw nr', 'btwnr', 'vat', 'vat number', 'vatnumber', 'ondernemingsnummer',
    'ondernemingsnr', 'kbo', 'kbo nummer', 'kbonummer', 'tva', 'numero tva', 'vat id', 'btw id', 'enterprise number',
    'ondernemings nummer'],
  adres: ['adres', 'address', 'straat huisnummer', 'straat en huisnummer', 'straat nr', 'straat en nr', 'adresregel',
    'adresregel 1', 'address line', 'address line 1', 'straat nummer', 'straatnaam huisnummer', 'straat huisnr',
    'adres 1', 'address 1', 'street address'],
  straat: ['straat', 'street', 'straatnaam', 'street name', 'rue'],
  huisnummer: ['huisnummer', 'huisnr', 'huis nr', 'nr', 'house number', 'housenumber', 'number', 'huisnummer bus', 'nr bus',
    'num'],
  bus: ['bus', 'busnummer', 'box', 'bte'],
  postcode: ['postcode', 'zip', 'zipcode', 'zip code', 'postal code', 'postalcode', 'pc', 'postnummer', 'code postal'],
  gemeente: ['gemeente', 'stad', 'city', 'woonplaats', 'plaats', 'town', 'locality', 'deelgemeente', 'localite',
    'municipality', 'plaatsnaam', 'gemeente stad'],
  hoofdsector: ['hoofdsector', 'main sector', 'hoofdcategorie', 'hoofdactiviteit'],
  sector: ['sector', 'categorie', 'category', 'activiteit', 'activiteiten', 'branche', 'type', 'soort', 'industry',
    'business type', 'rubriek', 'categorieen', 'categories'],
};

// Kolommen die nooit een gegeven zijn (gaan mee als extra kolom).
const IGNORE = ['bron', 'lead source', 'leadsource', 'leadbron', 'lead bron', 'source', 'project', 'project old', 'leadowner',
  'lead owner', 'opmerkingen', 'opmerking', 'notes', 'note', 'beschrijving', 'description', 'controle', 'bedrag', 'id',
  'lead id', 'status', 'datum', 'date', 'nummer bron', 'source url', 'bron url', 'link'];

const SINGLE = ['bedrijfsnaam', 'contactpersoon', 'voornaam', 'achternaam', 'website', 'btw', 'adres', 'straat', 'huisnummer',
  'bus', 'postcode', 'gemeente', 'hoofdsector', 'sector'];

export function normalizeHeader(h) {
  return stripAccents(String(h ?? '').toLowerCase())
    .replace(/[_\-./+()]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function synonymField(nh) {
  if (!nh) return 'negeren';
  if (IGNORE.includes(nh)) return 'negeren';
  for (const [field, list] of Object.entries(SYNONYMS)) if (list.includes(nh)) return field;
  // gedeeltelijke overeenkomst voor de duidelijke gevallen
  if (/^(e ?mail|mail)\b/.test(nh) || /\be ?mail\b/.test(nh)) return 'email';
  if (/\b(telefoon|tel|gsm|phone|mobile|mobiel)\b/.test(nh)) return 'telefoon';
  if (/\b(btw|vat|kbo|ondernemingsnummer)\b/.test(nh)) return 'btw';
  if (/\b(website|url|webadres)\b/.test(nh)) return 'website';
  if (/\b(postcode|zip)\b/.test(nh)) return 'postcode';
  if (/\bhuisnummer\b/.test(nh)) return 'huisnummer';
  if (/\bstraat\b/.test(nh)) return nh.includes('nummer') || nh.includes('nr') ? 'adres' : 'straat';
  if (/\b(gemeente|woonplaats|stad|city)\b/.test(nh)) return 'gemeente';
  if (/\bcontact/.test(nh)) return 'contactpersoon';
  if (/\b(bedrijf|company|onderneming)/.test(nh)) return 'bedrijfsnaam';
  if (/\bvoornaam\b/.test(nh)) return 'voornaam';
  if (/\b(achternaam|familienaam)\b/.test(nh)) return 'achternaam';
  if (/\b(sector|categorie|activiteit)\b/.test(nh)) return 'sector';
  return 'negeren';
}

// Inhoud bekijken voor kolommen die op naam niet herkend zijn.
function contentField(values) {
  const vals = values.map(cleanValue).filter(Boolean).slice(0, 80);
  if (vals.length < 3) return null;
  const share = (fn) => vals.filter(fn).length / vals.length;
  if (share((v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v)) >= 0.6) return 'email';
  if (share((v) => /^(https?:\/\/|www\.)[^\s]+$/i.test(v) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(v)) >= 0.6) return 'website';
  if (share((v) => { const b = normalizeBtw(v); return b.digits && b.valid; }) >= 0.6) return 'btw';
  if (share((v) => { const d = v.replace(/\D/g, ''); return d.length >= 8 && d.length <= 13 && /^[+0-9(]/.test(v) && !/[a-z]/i.test(v); }) >= 0.6) return 'telefoon';
  return null;
}

export function detectNearConstant(values, settings = SETTINGS) {
  const vals = values.map(cleanValue).filter(Boolean);
  if (vals.length < settings.bijnaConstant.minRijen) return false;
  const counts = new Map();
  let top = 0;
  for (const v of vals) { const k = v.toLowerCase(); const n = (counts.get(k) || 0) + 1; counts.set(k, n); if (n > top) top = n; }
  return top / vals.length >= settings.bijnaConstant.aandeel;
}

export function profileSignature(header) {
  return header.map(normalizeHeader).filter(Boolean).sort().join('|');
}

// Ook oudere exports zonder formaatversie herkennen, maar een gewone bron met Nr ongemoeid laten.
export function isOwnExport(header, settings = SETTINGS) {
  const names = new Set(header.map(normalizeHeader));
  return settings.eigenExport.herkenningsKolommen.every((h) => names.has(normalizeHeader(h)));
}

// Voorstel per kolom: veldsleutel, met notities en bijna-constante kolommen.
export function suggestMapping({ header, rows, profiles = [] }, settings = SETTINGS) {
  const nh = header.map(normalizeHeader);
  const signature = profileSignature(header);
  const notes = [];
  const column = (c) => rows.map((r) => r[c]);
  const nearConstant = header.map((_, c) => detectNearConstant(column(c), settings));

  const own = isOwnExport(header, settings);
  const profile = !own && profiles.find((p) => p.signature === signature);
  let mapping;
  if (profile) {
    mapping = nh.map((h) => profile.mapping[h] || 'negeren');
    notes.push('Kolommen gekoppeld volgens een bewaard bronprofiel.');
  } else {
    mapping = nh.map((h, c) => own && (settings.eigenExport.metadata.some((m) => normalizeHeader(m) === h) || header[c].startsWith(settings.eigenExport.extraPrefix)) ? 'negeren' : synonymField(h));
    if (own) notes.push('Eigen resultaat herkend: Nr en Bronnen zijn metadata; eerdere bronprofielen worden hiervoor niet toegepast.');
    // "nummer" is een huisnummer als er een straatkolom is, anders een telefoonnummer
    nh.forEach((h, c) => {
      if (h === 'nummer') mapping[c] = mapping.includes('straat') ? 'huisnummer' : 'telefoon';
    });
    // inhoud bekijken voor onbekende kolommen
    nh.forEach((h, c) => {
      if (!own && mapping[c] === 'negeren' && !IGNORE.includes(h)) {
        const guess = contentField(column(c));
        if (guess) { mapping[c] = guess; notes.push(`Kolom "${header[c]}" herkend aan de inhoud als ${FIELD_LABELS[guess]}.`); }
      }
    });
    // staan zowel "bedrijf" als "naam" in een lijst, dan is "naam" de contactpersoon
    const companyCols = mapping.map((m, c) => (m === 'bedrijfsnaam' ? c : -1)).filter((c) => c >= 0);
    if (companyCols.length > 1) {
      const strong = companyCols.filter((c) => STRONG_COMPANY.includes(nh[c]));
      const keep = strong.length ? strong[0] : companyCols[0];
      for (const c of companyCols) {
        if (c === keep) continue;
        if (['naam', 'name'].includes(nh[c]) && !mapping.includes('contactpersoon')) {
          mapping[c] = 'contactpersoon';
          notes.push(`"${header[c]}" is de contactpersoon, want "${header[keep]}" is al de bedrijfsnaam.`);
        } else mapping[c] = 'negeren';
      }
    }
    // "adres" naast een huisnummerkolom is de straat
    if (mapping.includes('huisnummer')) {
      mapping.forEach((m, c) => { if (m === 'adres') { mapping[c] = 'straat'; notes.push(`"${header[c]}" is de straat, want er is een aparte huisnummerkolom.`); } });
    }
  }
  // enkelvoudige velden: eerste wint
  const seen = new Set();
  mapping.forEach((m, c) => {
    if (SINGLE.includes(m)) {
      if (seen.has(m)) { mapping[c] = 'negeren'; notes.push(`"${header[c]}" wordt niet gebruikt: ${FIELD_LABELS[m]} is al gekoppeld.`); }
      else seen.add(m);
    }
  });
  nearConstant.forEach((nc, c) => {
    if (nc && mapping[c] !== 'negeren') notes.push(`Kolom "${header[c]}" heeft bijna overal dezelfde waarde en wordt niet gebruikt om te vergelijken.`);
  });
  return { mapping, notes, nearConstant, signature, fromProfile: !!profile };
}

// Een profiel maken uit een koppeling (wordt in de browser onthouden).
export function makeProfile(header, mapping, sourceName = '') {
  const m = {};
  header.forEach((h, c) => { const k = normalizeHeader(h); if (k) m[k] = mapping[c]; });
  return { signature: profileSignature(header), mapping: m, bron: sourceName };
}

// Velden uit één rij halen volgens de koppeling.
export function extractFields(mapping, header, row) {
  const fields = { telefoon: [], email: [] };
  const extras = Object.create(null);
  const raw = Object.create(null);
  const rawCells = [];
  const own = isOwnExport(header);
  const counts = new Map();
  header.forEach((h, c) => {
    const v = row[c] ?? '';
    raw[h] = v;
    rawCells.push({ kolom: c + 1, kop: h, waarde: String(v) });
    const m = mapping[c];
    if (m === 'telefoon') fields.telefoon.push(v);
    else if (m === 'email') fields.email.push(v);
    else if (!m || m === 'negeren') {
      const metadata = own && SETTINGS.eigenExport.metadata.includes(h);
      const alreadyWritten = SETTINGS.exportKolommen.some((s) => s.van === `raw:${h}`);
      if (!metadata && !alreadyWritten) {
        const count = (counts.get(h) || 0) + 1; counts.set(h, count);
        let name = h.startsWith(SETTINGS.eigenExport.extraPrefix) ? h : SETTINGS.eigenExport.extraPrefix + h;
        if (count > 1) name += ` [kolom ${c + 1}]`;
        extras[name] = String(v);
      }
    }
    else if (!fields[m]) fields[m] = v;
  });
  return { fields, extras, raw, rawCells };
}
