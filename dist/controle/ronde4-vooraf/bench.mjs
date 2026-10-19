// Snelheidstest (stap 9): een kunstmatig vergrote set van 50.000 rijen over twee lijsten.
// Gebruik: node bench.mjs [aantal rijen]
import { createRequire } from 'node:module';
import { prepare, assemble } from './src/engine/pipeline.js';
import { buildResultWorkbook } from './src/io/write.js';
import { suggestMapping } from './src/io/mapping.js';

const require = createRequire(import.meta.url);
globalThis.XLSX = require('./vendor/xlsx.full.min.js');

const TOTAL = Number(process.argv[2]) || 50000;
let seed = 12345;
// mulberry32: kleine, deterministische toevalsgenerator
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const SOORT = ['Bakkerij', 'Apotheek', 'Garage', 'Slagerij', 'Kapsalon', 'Advocaat', 'Architect', 'Bouwwerken', 'Tuinen', 'Frituur', 'Brasserie', 'Dakwerken', 'Schilderwerken', 'Immo', 'Optiek', 'Fietsen', 'Boekhouding', 'Thuisverpleging', 'Tandarts', 'Kinesist'];
const NAAM = ['Vermeulen', 'Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Martin', 'Dupont', 'Verhaegen', 'Van Acker', 'De Bruyne', 'Vandenberghe', 'Lemmens', 'Casteels', 'Uvyn', 'Verdickt', 'Storme', 'Lachaert'];
const VOORN = ['Jan', 'Piet', 'An', 'Els', 'Tom', 'Sofie', 'Bart', 'Lies', 'Wim', 'Karen', 'Dirk', 'Ilse', 'Koen', 'Nele', 'Philippe', 'Hanna', 'Peter', 'Bram'];
const STRAAT = [];
for (const a of ['Kerk', 'Dorps', 'Hundelgemse', 'Stations', 'Molen', 'Sint-Elooi', 'Nieuw', 'Groen', 'School', 'Linde', 'Klooster', 'Markt', 'Heir', 'Bos', 'Veld', 'Hoog', 'Lang', 'Berg', 'Water', 'Zand'])
  for (const b of ['straat', 'laan', 'weg', 'dreef', 'steenweg', 'plein', 'lei', 'baan']) STRAAT.push(a + b);
const GEM = [['9820', 'Merelbeke'], ['9000', 'Gent'], ['9050', 'Gentbrugge'], ['9090', 'Melle'], ['9890', 'Gavere'], ['9830', 'Sint-Martens-Latem'], ['9070', 'Destelbergen']];
const SECT = ['horeca', 'retail', 'bouw', 'medisch', 'vrij beroep', 'diensten'];

function company(i) {
  const vn = pick(VOORN), an = pick(NAAM), soort = pick(SOORT);
  const form = rnd();
  const extra = rnd() < 0.5 ? ' ' + pick(['Centrum', 'Plus', 'Express', 'Zuid', 'Noord', 'Oost', 'West', 'Pro', 'Service', 'Partners', 'Groep', 'Studio', 'Atelier', 'Huis', 'Team']) + (rnd() < 0.5 ? ' ' + Math.floor(rnd() * 90 + 10) : '') : '';
  const naam = form < 0.4 ? `${soort} ${an}${extra}` : form < 0.7 ? `${soort} ${vn} ${an}` : form < 0.85 ? `${an} ${soort}${extra} bv` : `${vn} ${an}${extra}`;
  const g = pick(GEM);
  const mob = rnd() < 0.7;
  const phoneDigits = mob ? `4${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}` : `9${String(Math.floor(rnd() * 1e7)).padStart(7, '0')}`;
  const dom = `${an.toLowerCase().replace(/\s/g, '')}${soort.toLowerCase()}${i}.be`;
  return { naam, contact: `${vn} ${an}`, phone: phoneDigits, email: rnd() < 0.6 ? `info@${dom}` : '', web: rnd() < 0.5 ? `https://www.${dom}` : '', btw: rnd() < 0.4 ? btwFor(i) : '', straat: pick(STRAAT), nr: String(1 + Math.floor(rnd() * 400)), postcode: g[0], gemeente: g[1], sector: pick(SECT) };
}
function btwFor(i) { const base = 40000000 + i * 7; const check = 97 - (base % 97); return `BE0${String(base).padStart(8, '0')}${String(check).padStart(2, '0')}`.replace(/^BE(\d{4})(\d{3})(\d{3})$/, 'BE$1.$2.$3'); }
const fmtPhone = (d, style) => style === 0 ? `0${d}` : style === 1 ? `+32 ${d}` : style === 2 ? `0${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : `0${d.slice(0, 3)}/${d.slice(3, 5)}.${d.slice(5, 7)}.${d.slice(7)}`;
function variant(c) {
  const v = { ...c };
  const r = rnd();
  if (r < 0.3) v.naam = v.naam.replace(/ bv$/, '').toUpperCase();
  else if (r < 0.5) v.naam = v.naam.split(' ').reverse().join(' ');
  else if (r < 0.65) v.naam = v.naam.replace(/e/, 'é');
  if (rnd() < 0.3) v.email = '';
  if (rnd() < 0.3) v.web = '';
  if (rnd() < 0.5) v.btw = '';
  if (rnd() < 0.2) v.nr = `${v.nr}-${Number(v.nr) + 2}`;
  return v;
}

const nList = TOTAL;
const uniques = Array.from({ length: Math.round(TOTAL * 0.75) }, (_, i) => company(i));
const listA = [], listB = [];
for (let i = 0; i < nList; i++) {
  const dup = rnd() < 0.3;
  const c = dup ? variant(pick(uniques)) : uniques[i % uniques.length];
  const styleA = Math.floor(rnd() * 4);
  if (i % 2 === 0) listA.push(['GOOGLE API', `${c.postcode} ${c.gemeente}`, '-', c.naam, c.sector, c.sector, fmtPhone(c.phone, styleA), `${c.straat} ${c.nr}`, c.postcode, c.gemeente, '-', '-']);
  else listB.push([c.naam, c.email, fmtPhone(c.phone, styleA), c.web, c.btw, c.sector, c.postcode, '', c.contact, c.gemeente, c.nr, c.straat]);
}
const t0 = performance.now();
const hA = ['Lead Source', 'Project', 'Leadowner', 'Company', 'Hoofdsector', 'Sector', 'Mobile', 'Straat Huisnummer', 'Postcode', 'Woonplaats', 'Voornaam', 'Achternaam'];
const hB = ['Naam', 'E-mail', 'Telefoonnummer', 'Website', 'BTW-nummer', 'Activiteiten', 'Postcode', 'Beschrijving', 'Personen', 'Stad', 'Huisnummer', 'Straat'];
const src = (name, header, rows) => { const m = suggestMapping({ header, rows }); return { name, label: name, header, rows, rowNumbers: rows.map((_, i) => i + 2), mapping: m.mapping, nearConstant: m.nearConstant }; };
const sources = [src('google.csv', hA, listA), src('bizzy.xlsx', hB, listB)];
const t1 = performance.now();
let last = 0;
const prep = await prepare({ sources, onProgress: (v, l) => { if (v - last > 0.25) { last = v; console.log(`  ${Math.round(v * 100)}% ${l}`); } } });
const t2 = performance.now();
const res = assemble(prep);
const t3 = performance.now();
const ctx = { version: 'bench', buildDate: '', datum: res.datum, verwerktOp: '', decisionLog: [] };
const w1 = buildResultWorkbook(prep, res, ctx);
const b1 = globalThis.XLSX.write(w1, { type: 'array', bookType: 'xlsx', compression: true });
const t4 = performance.now();
console.log(`Rijen: ${TOTAL} (lijsten ${listA.length} + ${listB.length})`);
console.log(`Koppelen: ${((t1 - t0) / 1000).toFixed(1)} s`);
console.log(`Vergelijken (prepare): ${((t2 - t1) / 1000).toFixed(1)} s, ${prep.scored.length} gescoorde paren, ${prep.skipped.length} overgeslagen sleutels`);
console.log(`Groeperen (assemble): ${((t3 - t2) / 1000).toFixed(1)} s`);
console.log(`Excel schrijven: ${((t4 - t3) / 1000).toFixed(1)} s (${Math.round(b1.byteLength / 1024)} kB)`);
console.log(`Totaal: ${((t4 - t0) / 1000).toFixed(1)} s`);
console.log('Samenvatting:', res.summary);
