// Vergelijken en punten (stap 5): kandidaatparen zoeken, punten per paar, beslissing en reden in gewone taal.
import { SETTINGS } from '../settings.js';
import { damerauLevenshtein } from './text.js';
import { phoneKind } from './normalize.js';

function addTo(map, key, value) {
  let s = map.get(key);
  if (!s) { s = new Set(); map.set(key, s); }
  s.add(value);
}

// Index over alle geladen rijen: woordgewichten en centrales (nummers/domeinen bij 3+ namen).
export function buildIndex(records, settings = SETTINGS) {
  const N = records.length;
  const df = new Map();
  const phoneNames = new Map();
  const domainNames = new Map();
  for (const r of records) {
    for (const w of new Set((r.compare || r.norm).name.words)) df.set(w, (df.get(w) || 0) + 1);
    const nm = (r.compare || r.norm).name.compact || `#${r.idx}`;
    for (const p of (r.compare || r.norm).phones) addTo(phoneNames, p, nm);
    for (const d of (r.compare || r.norm).domains) addTo(domainNames, d, nm);
  }
  const min = settings.centrale.minAantalNamen;
  const hubPhones = new Set();
  for (const [k, s] of phoneNames) if (s.size >= min) hubPhones.add(k);
  const hubDomains = new Set();
  for (const [k, s] of domainNames) if (s.size >= min) hubDomains.add(k);
  const weight = (w) => 1 + Math.log((N + 1) / ((df.get(w) || 0) + 1));
  return { N, df, weight, hubPhones, hubDomains, phoneNames, domainNames };
}

// Kandidaatparen: alleen rijen die minstens één sleutel delen.
export function candidatePairs(records, index, settings = SETTINGS) {
  const buckets = new Map();
  const add = (key, i) => { let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); } b.push(i); };
  const maxDf = settings.blokkering.zeldzaamWoordMaxDf;
  const plen = settings.blokkering.naamPrefixLengte;
  records.forEach((r, i) => {
    const n = r.compare || r.norm;
    for (const p of n.phones) add('p:' + p, i);
    for (const e of n.emails) add('e:' + e, i);
    for (const d of n.domains) add('d:' + d, i);
    if (n.btw) add('b:' + n.btw, i);
    if (n.adresKey) add('a:' + n.adresKey, i);
    for (const w of n.name.words) if (w.length >= 3 && (index.df.get(w) || 0) <= maxDf) add('w:' + w, i);
    if (n.name.compact.length >= plen) add('n:' + n.name.compact.slice(0, plen), i);
    if (n.contact.compact.length >= plen) add('c:' + n.contact.compact, i);
  });
  // Kleine verzamelingen per eerste rij vermijden een enorme hash-tabel met
  // vermenigvuldigde paarcodes. De eerste vindvolgorde van paren blijft gelijk.
  const seen = new Array(records.length);
  const pairs = [];
  const skipped = [];
  const compactGroups = [];
  const compactSeen = new Set();
  const addPair = (i, j) => {
    if (i === j) return;
    const lo = Math.min(i, j), hi = Math.max(i, j);
    let row = seen[lo];
    if (!row) { row = new Set(); seen[lo] = row; }
    if (!row.has(hi)) { row.add(hi); pairs.push([lo, hi]); }
  };
  const compact = (members) => {
    if (members.length < 2) return;
    const signature = members.join('|');
    if (compactSeen.has(signature)) return;
    compactSeen.add(signature);
    compactGroups.push({ members });
    // Een ster voor de scores en redenen; bij hergroeperen kan de vertegenwoordiger wisselen.
    for (const i of members.slice(1)) addPair(members[0], i);
  };
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    if (list.length > settings.blokkering.maxBucket) {
      if (key.startsWith('b:') && (records[list[0]].compare || records[list[0]].norm).btwValid) { compact(list); continue; }
      // Alleen een exact gelijke naam plus voldoende zekere punten mag een grote algemene
      // sleutel compact afhandelen. Een centrale of ongeldig BTW-nummer beslist nooit zelf.
      const points = key.startsWith('p:') ? (index.hubPhones.has(key.slice(2)) ? settings.punten.telefoonCentrale : settings.punten.telefoon)
        : key.startsWith('e:') ? settings.punten.email
        : key.startsWith('d:') ? (index.hubDomains.has(key.slice(2)) ? settings.punten.domeinCentrale : settings.punten.domein)
        : key.startsWith('a:') ? settings.punten.adres : 0;
      const byName = new Map(), identical = new Map();
      for (const i of list) {
        const n = records[i].compare || records[i].norm;
        if (points && n.name.compact && settings.grenzen.naamMinimum <= 1 && settings.punten.naamMax + points >= settings.grenzen.zekerDubbel) {
          const nameKey = JSON.stringify([n.name.compact, key.startsWith('a:') ? [n.postcodeUsable, n.postcode] : null]);
          if (!byName.has(nameKey)) byName.set(nameKey, []);
          byName.get(nameKey).push(i);
        }
        // Identieke vergelijkingsvelden kunnen samen genoeg punten leveren, ook bij centrales.
        const signature = JSON.stringify(n);
        if (!identical.has(signature)) identical.set(signature, []);
        identical.get(signature).push(i);
      }
      for (const members of byName.values()) compact(members);
      for (const members of identical.values()) if (members.length > 1 && scorePair(records[members[0]], records[members[1]], index, settings).decision === 'zeker') compact(members);
      skipped.push({ key, n: list.length });
      continue;
    }
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) addPair(list[a], list[b]);
  }
  return { pairs, skipped, compactGroups, bucketCount: buckets.size };
}

function wordsMatch(w1, w2, settings) {
  if (w1 === w2) return true;
  const L = Math.min(w1.length, w2.length);
  if (L < settings.fuzzy.minLengteAfstand1) return false;
  const maxD = L >= settings.fuzzy.minLengteAfstand2 ? 2 : 1;
  return damerauLevenshtein(w1, w2, maxD) <= maxD;
}

// Gewogen woordovereenkomst: ongevoelig voor volgorde en kleine tikfouten, plus naam zonder spaties.
export function nameSimilarity(a, b, weight, settings = SETTINGS) {
  if (!a.words.length || !b.words.length) return 0;
  if (a.compact === b.compact) return 1;
  let wA = 0, wB = 0, mA = 0, mB = 0;
  const usedB = new Set();
  for (const wa of a.words) {
    const w = weight(wa); wA += w;
    let hit = -1;
    for (let k = 0; k < b.words.length; k++) if (!usedB.has(k) && wordsMatch(wa, b.words[k], settings)) { hit = k; break; }
    if (hit >= 0) { usedB.add(hit); mA += w; }
  }
  for (let k = 0; k < b.words.length; k++) { const w = weight(b.words[k]); wB += w; if (usedB.has(k)) mB += w; }
  const containment = Math.max(wA ? mA / wA : 0, wB ? mB / wB : 0);
  const dice = (wA + wB) ? (mA + mB) / (wA + wB) : 0;
  let sim = 0.5 * containment + 0.5 * dice;
  // naam zonder spaties (tikfouten, samengestelde woorden)
  const ca = a.compact, cb = b.compact;
  if (ca.length >= 4 && cb.length >= 4) {
    const maxLen = Math.max(ca.length, cb.length);
    const maxD = Math.ceil(maxLen * 0.5);
    const d = damerauLevenshtein(ca, cb, maxD);
    // Boven de toegestane afstand geeft de functie maxD + 1 terug: dan lijken de namen niet op elkaar
    // en mag de afstand geen gelijkenis opleveren (anders kreeg elk willekeurig paar ~35 %).
    if (d <= maxD) sim = Math.max(sim, 0.85 * (1 - d / maxLen));
    const [short, long] = ca.length <= cb.length ? [a, b] : [b, a];
    const F = settings.fuzzy;
    // Eén algemeen woord mag via deze bonus zijn lage woordgewicht niet omzeilen.
    if (short.words.length >= F.deelstringMinWoorden && short.compact.length >= F.deelstringMinLengte && long.compact.includes(short.compact)) {
      sim = Math.max(sim, F.deelstringBasis + F.deelstringLengteGewicht * (short.compact.length / long.compact.length));
    }
  }
  return Math.min(1, sim);
}

// Contactpersoon tegenover bedrijfsnaam (eenmanszaken): zit de bedrijfsnaam in de contactpersoon
// ("Dler Shwan" bij bedrijf "Shwan") of de contactpersoon in de bedrijfsnaam ("Philippe Verneert" bij "Verneert, Philippe")?
function contactVsName(contact, name, weight, settings) {
  const cw = contact.words.filter((w) => w.length >= 3);
  const nw = name.words.filter((w) => w.length >= 3);
  if (!cw.length || !nw.length) return 0;
  const cover = (xs, ys) => {
    let total = 0, matched = 0;
    for (const w of xs) { const wt = weight(w); total += wt; if (ys.some((y) => wordsMatch(w, y, settings))) matched += wt; }
    return total ? matched / total : 0;
  };
  return Math.max(cover(cw, nw), cover(nw, cw));
}

const intersect = (xs, ys) => xs.filter((x) => ys.includes(x));

// Punten, beslissing en reden voor één paar.
export function scorePair(a, b, index, settings = SETTINGS) {
  const P = settings.punten;
  const G = settings.grenzen;
  const na = a.compare || a.norm, nb = b.compare || b.norm;
  const reasons = [];
  const matched = { btw: false, telefoon: [], email: [], domein: [], adres: false, naam: false, contact: false };
  let score = 0;
  let btwEqual = false;
  let btwConflict = false;

  if (na.btw && nb.btw) {
    if (na.btw === nb.btw) {
      matched.btw = true;
      if (na.btwValid && nb.btwValid) { btwEqual = true; reasons.push('zelfde BTW-nummer'); }
      else { score += P.btwOngeldigGelijk; reasons.push('zelfde BTW-cijfers (nummer ongeldig)'); }
    } else if (na.btwValid && nb.btwValid) {
      btwConflict = true;
    }
  }

  const phones = intersect(na.phones, nb.phones);
  if (phones.length) {
    matched.telefoon = phones;
    const allHub = phones.every((p) => index.hubPhones.has(p));
    if (allHub) { score += P.telefoonCentrale; reasons.push('zelfde telefoon (centraal nummer, telt minder)'); }
    else {
      score += P.telefoon;
      const kinds = new Set(phones.filter((p) => !index.hubPhones.has(p)).map(phoneKind));
      reasons.push(kinds.size === 1 && kinds.has('gsm') ? 'zelfde gsm' : 'zelfde telefoon');
    }
  }

  const emails = intersect(na.emails, nb.emails);
  if (emails.length) { matched.email = emails; score += P.email; reasons.push('zelfde e-mail'); }

  const domains = intersect(na.domains, nb.domains);
  if (domains.length) {
    matched.domein = domains;
    const allHub = domains.every((d) => index.hubDomains.has(d));
    if (allHub) { score += P.domeinCentrale; reasons.push('zelfde domein (gedeeld door meerdere bedrijven, telt minder)'); }
    else { score += P.domein; reasons.push('zelfde domein'); }
  }

  if (na.adresKey && na.adresKey === nb.adresKey) {
    matched.adres = true;
    if (na.postcodeUsable && nb.postcodeUsable && na.postcode !== nb.postcode) { score += P.adresAnderePostcode; reasons.push('zelfde adres, andere postcode'); }
    else { score += P.adres; reasons.push('zelfde adres'); }
  }

  const nameSim = nameSimilarity(na.name, nb.name, index.weight, settings);
  if (nameSim >= G.naamTelt) {
    score += Math.round(P.naamMax * nameSim);
    const pct = Math.round(nameSim * 100);
    if (nameSim >= G.naamMinimum) { matched.naam = true; reasons.push(nameSim >= 0.999 ? 'zelfde naam' : `gelijkaardige naam (${pct}%)`); }
    else reasons.push(`naam lijkt deels (${pct}%)`);
  }

  const c1 = contactVsName(na.contact, nb.name, index.weight, settings);
  const c2 = contactVsName(nb.contact, na.name, index.weight, settings);
  if (Math.max(c1, c2) >= G.contactMinimum) { matched.contact = true; score += P.contactpersoon; reasons.push('contactpersoon lijkt op bedrijfsnaam'); }
  else if (na.contact.words.length >= 2 && na.contact.compact === nb.contact.compact) {
    matched.contact = true; score += P.zelfdeContactpersoon; reasons.push('zelfde contactpersoon');
  }

  if (btwEqual) score = Math.max(score, 100);
  else if (btwConflict) reasons.unshift('verschillend BTW-nummer');

  const result = { score, nameSim, decision: 'uniek', reasons, reason: reasons.join(' + '), matched, btwConflict, btwEqual };
  result.decision = decidePair(result, G);
  return result;
}

// Beslissing voor een gescoord paar bij de gegeven grenzen. Het BTW-nummer beslist altijd; daarna tellen de punten.
// Wordt opnieuw toegepast wanneer de gebruiker de strengheid verandert: de punten blijven dan gelijk, alleen de grens schuift.
export function decidePair({ score, nameSim, btwEqual, btwConflict }, grenzen = SETTINGS.grenzen) {
  if (btwEqual) return 'zeker';
  if (btwConflict) return 'uniek';
  if (score >= grenzen.zekerDubbel && nameSim >= grenzen.naamMinimum) return 'zeker';
  if (score >= grenzen.teControleren) return 'controleren';
  return 'uniek';
}

// Het strengheidsniveau bij een sleutel ('streng', 'gemiddeld', 'mild'); onbekend of leeg geeft het standaardniveau.
export function strengheidNiveau(settings = SETTINGS, key) {
  const niveaus = settings.strengheid.niveaus;
  return niveaus.find((n) => n.key === key) || niveaus.find((n) => n.key === settings.strengheid.standaard) || niveaus[0];
}

// De grenzen bij een strengheidsniveau: de algemene grenzen, overschreven door die van het niveau.
export function grenzenVoor(settings = SETTINGS, key) {
  return { ...settings.grenzen, ...strengheidNiveau(settings, key).grenzen };
}

// De laagste ondergrens over alle niveaus: paren met minder punten kunnen nooit een twijfelpaar worden.
export function laagsteGrens(settings = SETTINGS) {
  return Math.min(settings.grenzen.teControleren, ...settings.strengheid.niveaus.map((n) => grenzenVoor(settings, n.key).teControleren));
}

export const DECISION_LABELS = { zeker: 'Zeker dubbel', controleren: 'Te controleren', uniek: 'Uniek' };
