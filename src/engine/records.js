// Van gekoppelde velden naar een record met genormaliseerde sleutels.
import {
  cleanValue, normalizePhones, normalizeBtw, inspectEmails, emailDomain, normalizeWebsite,
  normalizeAddress, normalizeName, normalizePostcode,
} from './normalize.js';

// meta: { idx, source, sourceName, sourceLabel, row, raw, extras, originals, postcodeUsable }
// fields: { bedrijfsnaam, contactpersoon, voornaam, achternaam, telefoon: [], email: [], website, btw,
//           straat, huisnummer, adres, bus, postcode, gemeente, hoofdsector, sector }
export function makeRecord(meta, fields) {
  const f = {};
  for (const k of ['bedrijfsnaam', 'contactpersoon', 'voornaam', 'achternaam', 'website', 'btw', 'straat', 'huisnummer',
    'adres', 'bus', 'postcode', 'gemeente', 'hoofdsector', 'sector']) f[k] = cleanValue(fields[k]);
  f.telefoon = (fields.telefoon || []).map(cleanValue).filter(Boolean);
  f.email = (fields.email || []).map(cleanValue).filter(Boolean);
  if (!f.contactpersoon && (f.voornaam || f.achternaam)) f.contactpersoon = cleanValue(`${f.voornaam} ${f.achternaam}`);
  if (f.contactpersoon && !f.voornaam && !f.achternaam) {
    const split = splitPersonName(f.contactpersoon);
    f.voornaam = split.voornaam; f.achternaam = split.achternaam;
  }

  const warnings = [];
  // Splits de oorspronkelijke cel vóór cleanValue betekenisvolle witruimte samenknijpt.
  const ph = normalizePhones(fields.telefoon || []);
  for (const w of ph.warnings) warnings.push(`telefoon "${w.waarde}": ${w.reden}`);

  const emails = [];
  const emailCells = [...(fields.email || []), ...(f.website.includes('@') ? [fields.website] : [])];
  for (const value of emailCells) {
    const result = inspectEmails(value);
    for (const e of result.emails) if (!emails.includes(e)) emails.push(e);
    for (const w of result.warnings) warnings.push(`e-mail "${w.waarde}": ${w.reden}`);
  }

  const domains = [];
  const web = normalizeWebsite(f.website);
  if (web) domains.push(web);
  for (const e of emails) { const d = emailDomain(e); if (d && !domains.includes(d)) domains.push(d); }

  const btw = normalizeBtw(f.btw);
  if (btw.warning && f.btw) warnings.push(`BTW "${f.btw}": ${btw.warning}`);

  const adres = normalizeAddress({ straat: f.straat, huisnummer: f.huisnummer, adres: f.adres });
  if (f.bus) adres.bus = f.bus.toLowerCase();
  const postcode = normalizePostcode(f.postcode);
  const name = normalizeName(f.bedrijfsnaam);
  const contact = normalizeName(f.contactpersoon);

  return {
    idx: meta.idx,
    source: meta.source,
    sourceName: meta.sourceName,
    sourceLabel: meta.sourceLabel || meta.sourceName,
    row: meta.row,
    raw: meta.raw || {},
    originals: meta.originals || [],
    extras: meta.extras || {},
    fields: f,
    norm: {
      phones: ph.phones,
      phoneKinds: ph.kinds,
      emails,
      domains,
      btw: btw.digits,
      btwValid: btw.valid,
      straat: adres.straat,
      huisnummer: adres.huisnummer,
      bus: adres.bus,
      straatKey: adres.straatKey,
      adresKey: adres.adresKey,
      postcode,
      postcodeUsable: meta.postcodeUsable !== false && !!postcode,
      name,
      contact,
    },
    warnings,
  };
}

// "Verneert, Philippe" -> Philippe Verneert; "Dler Shwan" -> Dler / Shwan.
export function splitPersonName(s) {
  const t = cleanValue(s);
  if (!t) return { voornaam: '', achternaam: '' };
  if (t.includes(',')) {
    const [last, first] = t.split(',').map((x) => x.trim());
    return { voornaam: first || '', achternaam: last || '' };
  }
  const parts = t.split(' ');
  if (parts.length === 1) return { voornaam: '', achternaam: parts[0] };
  return { voornaam: parts[0], achternaam: parts.slice(1).join(' ') };
}

