// Gelijktrekken (stap 4): telefoon, BTW, e-mail, domein, adres en naam in een standaardvorm.
// Geen schermcode; alles is zuiver tekst in, tekst uit, zodat het met Node getest kan worden.
import { SETTINGS } from '../settings.js';
import { stripAccents, cleanQuotes, squeeze } from './text.js';

const FILLERS = new Set(SETTINGS.opvulwaarden.map((v) => v.toLowerCase()));

// Celwaarde opschonen; opvulwaarden zoals "-", "+" en "n.v.t." worden leeg.
export function cleanValue(v) {
  if (v === null || v === undefined) return '';
  let s = squeeze(cleanQuotes(String(v)));
  s = s.replace(/^[,;:]+\s*|\s*[,;:]+$/g, '').trim();
  if (!s) return '';
  if (FILLERS.has(s.toLowerCase())) return '';
  return s;
}

export function isEmptyValue(v) {
  return cleanValue(v) === '';
}

// ---------------------------------------------------------------- Telefoon

export function isScientificNotation(s) {
  return /^[+-]?\d+([.,]\d+)?[eE][+-]?\d+$/.test(String(s ?? '').trim());
}

// Meerdere nummers in één cel splitsen: op komma, puntkomma, |, "of", "en",
// en op "/" of " - " of dubbele spaties wanneer beide kanten een volledig nummer zijn.
export function splitPhones(s) {
  if (!cleanValue(s)) return [];
  const t = String(s).trim();
  if (isScientificNotation(t)) return [t];
  const strong = t.split(/\s*(?:,|;|\||[\r\n\t]+|\bof\b|\ben\b|\bor\b|\bet\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const part of strong) {
    const sub = part.split(/\s*\/\s*|\s+-\s+|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    if (sub.length > 1 && sub.every((x) => normalizePhone(x).e164)) out.push(...sub);
    else out.push(part);
  }
  return out;
}

// Eén nummer naar het internationale formaat (+32...). Geeft { e164, kind, warning }.
export function normalizePhone(s) {
  const t = cleanValue(s);
  if (!t) return { e164: null };
  if (isScientificNotation(t)) return { e164: null, warning: 'wetenschappelijke notatie' };
  const v = t.replace(/\(0\)/g, '');
  let digits = v.replace(/\D/g, '');
  if (!digits) return { e164: null, warning: 'niet herkend als telefoonnummer' };
  let international = false;
  if (/^\s*\+/.test(v)) international = true;
  else if (digits.startsWith('00')) { international = true; digits = digits.slice(2); }

  let national;
  if (international) {
    if (!digits.startsWith('32')) {
      if (digits.length < 8 || digits.length > 15) return { e164: null, warning: 'te kort of te lang' };
      return { e164: '+' + digits, kind: 'buitenland' };
    }
    national = digits.slice(2);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else if ((digits.length === 10 || digits.length === 11) && digits.startsWith('32')) {
    national = digits.slice(2); // "+" weggevallen
  } else if (digits.length === 8 || digits.length === 9) {
    national = digits; // voorloopnul weggevallen (bv. door Excel)
  } else {
    return { e164: null, warning: 'onherkenbaar nummer' };
  }
  if (national.startsWith('0')) national = national.slice(1); // "+32 0479 ..."
  if (national.length === 9 && national.startsWith('4')) return { e164: '+32' + national, kind: 'gsm' };
  if (national.length === 8) return { e164: '+32' + national, kind: 'vast' };
  return { e164: null, warning: 'ongeldige lengte' };
}

// Alle nummers uit één of meer cellen: unieke e164-lijst plus waarschuwingen.
export function normalizePhones(values) {
  const list = Array.isArray(values) ? values : [values];
  const phones = [];
  const kinds = {};
  const warnings = [];
  for (const v of list) {
    for (const part of splitPhones(v)) {
      const r = normalizePhone(part);
      if (r.e164) {
        if (!phones.includes(r.e164)) { phones.push(r.e164); kinds[r.e164] = r.kind; }
      } else if (r.warning) {
        warnings.push({ waarde: part, reden: r.warning });
      }
    }
  }
  return { phones, kinds, warnings };
}

export function formatPhone(e164) {
  if (!e164) return '';
  if (e164.startsWith('+32')) {
    const n = e164.slice(3);
    if (n.length === 9) return `+32 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
    if (n.length === 8) {
      if ('2349'.includes(n[0])) return `+32 ${n[0]} ${n.slice(1, 4)} ${n.slice(4, 6)} ${n.slice(6)}`;
      return `+32 ${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6)}`;
    }
  }
  return e164;
}

export function phoneKind(e164) {
  if (!e164) return '';
  if (!e164.startsWith('+32')) return 'buitenland';
  return e164.length === 12 && e164[3] === '4' ? 'gsm' : 'vast';
}

// ---------------------------------------------------------------- BTW

// Alleen de cijfers, aangevuld tot 10, gecontroleerd met de modulo-97-regel.
export function normalizeBtw(s) {
  const t = cleanValue(s);
  if (!t) return { digits: null, valid: false };
  let d = t.replace(/\D/g, '');
  if (d.length === 9) d = '0' + d;
  if (d.length !== 10) return { digits: null, valid: false, warning: 'BTW-nummer heeft niet 9 of 10 cijfers' };
  const valid = 97 - (Number(d.slice(0, 8)) % 97) === Number(d.slice(8));
  return { digits: d, valid, warning: valid ? undefined : 'BTW-nummer klopt niet (controlegetal)' };
}

export function formatBtw(digits) {
  if (!digits) return '';
  return `BE ${digits.slice(0, 4)}.${digits.slice(4, 7)}.${digits.slice(7)}`;
}

// ---------------------------------------------------------------- E-mail en domein

const EMAIL_RE = /^[^\s@<>()[\],;:"']+@[^\s@<>()[\],;:"']+\.[a-z]{2,}$/i;

function hostMatches(host, list) {
  return list.some((p) => host === p || host.endsWith('.' + p));
}

export function isFreeDomain(host) {
  return hostMatches(String(host).toLowerCase(), SETTINGS.gratisDomeinen);
}

export function isPlatformDomain(host) {
  return hostMatches(String(host).toLowerCase(), SETTINGS.platformDomeinen);
}

export function normalizeEmails(s) {
  return inspectEmails(s).emails;
}

// Harde scheidingstekens begrenzen afzonderlijke delen. Spaties scheiden alleen een
// reeks volledige adressen; zo wordt "in fo@voorbeeld.invalid" niet stil "fo@…".
export function inspectEmails(s, settings = SETTINGS) {
  const t = cleanValue(s);
  const emails = [], warnings = [];
  if (!t) return { emails, warnings };
  for (const raw of String(s).split(/[;,\/|<>()]+/).filter((p) => cleanValue(p))) {
    let part = cleanValue(raw).toLowerCase().replace(/mailto:/g, '');
    if (settings.contactnormalisatie.emailSpatiesRondAt) part = part.replace(/\s*@\s*/g, '@');
    const tokens = part.split(/\s+/).map((p) => p.replace(/^[.:]+|[.:]+$/g, ''));
    if (tokens.every((p) => EMAIL_RE.test(p))) {
      for (const email of tokens) if (!emails.includes(email)) emails.push(email);
    } else {
      warnings.push({ waarde: raw.trim(), reden: 'niet herkend als e-mailadres; alleen spaties direct rond @ worden hersteld' });
    }
  }
  return { emails, warnings };
}

// Domein van een e-mailadres, of null bij een gratis provider.
export function emailDomain(email) {
  const host = String(email).split('@')[1];
  if (!host) return null;
  const h = host.toLowerCase().replace(/^www\./, '');
  return isFreeDomain(h) || isPlatformDomain(h) ? null : h;
}

// Website naar alleen het domein; platformen zoals Facebook geven null.
export function normalizeWebsite(s) {
  let t = cleanValue(s).toLowerCase();
  if (!t) return null;
  if (t.includes('@')) return null;
  t = t.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\/\//, '');
  t = t.split(/[/?#]/)[0];
  t = t.replace(/:\d+$/, '');
  t = t.replace(/^www\d*\./, '');
  t = t.replace(/\.+$/, '');
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(t)) return null;
  if (isPlatformDomain(t)) return null;
  return t;
}

// ---------------------------------------------------------------- Adres

// "Hundelgemsesteenweg 1004-1006" -> straat + eerste huisnummer; "Kerkstraat 135 C" -> bus c.
const HOUSE_RE = /^(.*?[^\d\s,])[,\s]+(\d{1,5})\s*([a-z])?(?:\s*[-/]\s*\d{1,5}\s*[a-z]?)?(?:\s*(?:,|\/|bus|b\.?|box|bte)\s*([a-z0-9]{1,5}))?\s*$/i;

export function splitStreetAndNumber(adres) {
  let t = cleanValue(adres);
  if (!t) return { straat: '', huisnummer: '', bus: '' };
  // ", 9820 Merelbeke" of " - 9820 Merelbeke" achteraan weg
  t = t.replace(/[,\s-]+\d{4}\s+[^\d]*$/, '').trim();
  const m = t.match(HOUSE_RE);
  if (!m) return { straat: t, huisnummer: '', bus: '' };
  return { straat: m[1].trim(), huisnummer: m[2], bus: (m[4] || m[3] || '').toLowerCase() };
}

// Huisnummerveld: eerste nummer en busletter.
export function parseHouseNumber(s) {
  const t = cleanValue(s);
  if (!t) return { huisnummer: '', bus: '' };
  const m = t.match(/(\d{1,5})\s*([a-z])?(?:\s*[-/]\s*\d{1,5}\s*[a-z]?)?(?:\s*(?:,|\/|bus|b\.?|box|bte)\s*([a-z0-9]{1,5}))?/i);
  if (!m) return { huisnummer: '', bus: t.toLowerCase() };
  return { huisnummer: m[1], bus: (m[3] || m[2] || '').toLowerCase() };
}

// Straatnaam als sleutel: kleine letters, zonder accenten, streepjes, spaties en punten, afkortingen voluit.
export function streetKey(straat) {
  const t = stripAccents(cleanValue(straat).toLowerCase());
  if (!t) return '';
  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  const out = tokens.map((tok) => {
    if (SETTINGS.straatAfkortingen[tok]) return SETTINGS.straatAfkortingen[tok];
    if (tok.length > 4) return tok.replace(/stwg$/, 'steenweg').replace(/stwng$/, 'steenweg').replace(/str$/, 'straat');
    return tok;
  });
  return out.join('');
}

export function normalizePostcode(s) {
  const t = cleanValue(s);
  if (!t) return '';
  const m = t.match(/\d{4,6}/);
  return m ? m[0] : t.toLowerCase();
}

// Adres uit de velden halen (straat/huisnummer apart, of samen in één veld).
export function normalizeAddress({ straat, huisnummer, adres }) {
  let st = cleanValue(straat);
  let nr = '';
  let bus = '';
  if (cleanValue(huisnummer)) {
    const h = parseHouseNumber(huisnummer);
    nr = h.huisnummer; bus = h.bus;
    if (!st && cleanValue(adres)) st = splitStreetAndNumber(adres).straat;
  }
  if (!st && cleanValue(adres)) {
    const sp = splitStreetAndNumber(adres);
    st = sp.straat; nr = nr || sp.huisnummer; bus = bus || sp.bus;
  }
  if (st && !nr) {
    const sp = splitStreetAndNumber(st);
    if (sp.huisnummer) { st = sp.straat; nr = sp.huisnummer; bus = bus || sp.bus; }
  }
  if (st && nr && cleanValue(huisnummer)) {
    // straatveld dat het huisnummer herhaalt: "Kerkstraat 12" + huisnummer 12
    const sp = splitStreetAndNumber(st);
    if (sp.huisnummer === nr) st = sp.straat;
  }
  const key = streetKey(st);
  return { straat: st, huisnummer: nr, bus, straatKey: key, adresKey: key && nr ? `${key}|${nr}` : '' };
}

// ---------------------------------------------------------------- Naam

const LEGAL = new Set(SETTINGS.rechtsvormen);

// Bedrijfsnaam: kleine letters, accenten weg, rechtsvormen weg, opgesplitst in woorden.
export function normalizeName(s) {
  let t = stripAccents(cleanQuotes(cleanValue(s)).toLowerCase());
  if (!t) return { clean: '', words: [], compact: '' };
  t = t.replace(/'/g, '').replace(/\./g, '').replace(/&/g, ' ');
  const tokens = t.split(/[^a-z0-9]+/).filter(Boolean);
  const words = tokens.filter((w) => !LEGAL.has(w)).filter((w) => w.length >= 2 || /\d/.test(w));
  return { clean: words.join(' '), words, compact: words.join('') };
}
