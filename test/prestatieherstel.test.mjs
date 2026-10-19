import test from 'node:test';
import assert from 'node:assert/strict';
import * as mapping from '../src/io/mapping.js';
import { mergeGroup } from '../src/engine/cluster.js';
import { makeRecord } from '../src/engine/records.js';
import { SETTINGS } from '../src/settings.js';
import { cleanQuotes } from '../src/engine/text.js';
import { buildIndex, candidatePairs } from '../src/engine/match.js';

test('kandidaatontdubbeling bewaart eerste vindvolgorde en omgekeerde/herhaalde sleutels', () => {
  const records = Array.from({ length: 4 }, (_, idx) => makeRecord({ idx, source: 0, row: idx + 2 },
    { bedrijfsnaam: `Fabel ${idx}`, telefoon: ['020001001'], email: ['info@fabel.invalid'], website: 'fabel.invalid' }));
  const result = candidatePairs(records, buildIndex(records));
  assert.deepEqual(result.pairs, [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]);
  assert.deepEqual(result.compactGroups, []);
});

test('kandidaatontdubbeling bewaart hoge rijindices zonder globale paarcodes', () => {
  const empty = makeRecord({ idx: 0 }, {}).norm;
  const records = Array.from({ length: 50000 }, (_, idx) => ({ idx, norm: empty }));
  for (const idx of [0, 42949, 49998, 49999]) records[idx] = makeRecord({ idx },
    { telefoon: ['020001001'], email: ['info@fabel.invalid'] });
  assert.deepEqual(candidatePairs(records, buildIndex(records)).pairs,
    [[0, 42949], [0, 49998], [0, 49999], [42949, 49998], [42949, 49999], [49998, 49999]]);
});

test('één tekstdoorgang behoudt alle typografische vervangingen en gewone tekst', () => {
  assert.equal(cleanQuotes('‘’‚‛′´`“”„″–—−\u00a0'), "'''''''\"\"\"\"--- ");
  assert.equal(cleanQuotes('Fabel’s “zaak” — 1004\u00a0B'), 'Fabel\'s "zaak" - 1004 B');
  assert.equal(cleanQuotes('info@fabel.invalid  020001001'), 'info@fabel.invalid  020001001');
  assert.equal(cleanQuotes(123), '123');
  assert.equal(cleanQuotes(null), 'null');
});

test('kolomplan leest koppen eenmaal en bewaart iedere rij onafhankelijk', () => {
  let gelezen = 0;
  const header = ['Naam', 'Telefoon', 'Notitie', 'Notitie', '__proto__', 'Lead Source'];
  // De echte koppen zijn tekst; een Proxy meet alleen het opnieuw lezen van de koparray.
  const watched = new Proxy(header, { get(target, key) {
    if (/^\d+$/.test(String(key))) gelezen++;
    return Reflect.get(target, key);
  } });
  assert.equal(typeof mapping.createFieldExtractor, 'function');
  const fields = ['bedrijfsnaam', 'telefoon', 'negeren', 'negeren', 'negeren', 'negeren'];
  const extract = mapping.createFieldExtractor(fields, watched);
  const before = gelezen;
  const a = extract(['Fabelwinkel', '020001001', '=A', '', 'veilig', 'bron']);
  const b = extract(['Tweede', '030001001', '', 'B']);
  assert.equal(gelezen, before, 'koppen worden niet voor iedere rij opnieuw verwerkt');
  assert.deepEqual(a.fields, { telefoon: ['020001001'], email: [], bedrijfsnaam: 'Fabelwinkel' });
  assert.equal(a.extras['Extra: Notitie'], '=A');
  assert.equal(a.extras['Extra: Notitie [kolom 4]'], '');
  assert.equal(b.extras['Extra: Notitie [kolom 4]'], 'B');
  assert.equal(a.extras['Extra: __proto__'], 'veilig');
  assert.equal(Object.getPrototypeOf(a.raw), null);
  assert.equal(Object.getPrototypeOf(a.extras), null);
  assert.equal(a.raw['Lead Source'], 'bron');
  assert.equal(a.extras['Extra: Lead Source'], undefined);
  assert.deepEqual(b.rawCells[3], { kolom: 4, kop: 'Notitie', waarde: 'B' });
  assert.notEqual(a.raw, b.raw); assert.notEqual(a.fields.telefoon, b.fields.telefoon);
  fields[0] = 'negeren'; header[0] = 'Gewijzigd';
  assert.equal(extract(['Derde']).fields.bedrijfsnaam, 'Derde', 'het plan hoort bij de oorspronkelijke koppeling');
  assert.equal(mapping.createFieldExtractor(fields, header)(['Derde']).extras['Extra: Gewijzigd'], 'Derde');
});

test('kolomplan bewaart eigen-exportmetadata en dubbele kolomnamen zonder extra metadatavelden', () => {
  assert.equal(typeof mapping.createFieldExtractor, 'function');
  const header = SETTINGS.exportKolommen.map((s) => s.kop);
  const row = header.map((_, i) => String(i));
  const nr = header.indexOf('Nr'); assert.ok(nr >= 0);
  header[nr] = '  NŔ.  ';
  const plan = mapping.createFieldExtractor(header.map(() => 'negeren'), header);
  const result = plan(row);
  assert.equal(result.extras['Extra:   NŔ.  '], undefined);
  assert.equal(result.rawCells[nr].waarde, String(nr));
});

test('een enkele bronrij houdt dezelfde samengevoegde waarden zonder gedeelde uitvoerarrays', () => {
  const raw = Object.assign(Object.create(null), { 'Naam': 'Fabelwinkel', 'Leeg': '' });
  const r = makeRecord({ idx: 0, source: 0, sourceName: 'fabel.csv', row: 2, raw,
    extras: { 'Extra: Opmerking': '=BEWAAR', 'Extra: Leeg': '', 'Extra: Nul': 0 } },
  { bedrijfsnaam: 'Fabelwinkel', telefoon: ['020001001'], email: ['info@fabel.invalid'],
    website: 'https://facebook.com/fabel', adres: 'Fabelstraat 1004 B', postcode: '1000' });
  const m = mergeGroup([r], [0]);
  assert.equal(m.website, 'https://facebook.com/fabel');
  assert.deepEqual([m.straat, m.huisnummer, m.bus], ['Fabelstraat', '1004', 'b']);
  assert.deepEqual(m.extras, { 'Extra: Opmerking': '=BEWAAR', 'Extra: Leeg': '', 'Extra: Nul': '0' });
  assert.deepEqual(m.bronnen, ['fabel.csv (rij 2)']);
  assert.equal(m.raw.Leeg, undefined);
  m.telefoons.push('ander'); m.emails.push('ander'); m.raw.Naam = 'anders'; m.extras['Extra: Opmerking'] = 'anders';
  assert.equal(r.norm.phones.length, 1); assert.equal(r.norm.emails.length, 1);
  assert.equal(r.raw.Naam, 'Fabelwinkel'); assert.equal(r.extras['Extra: Opmerking'], '=BEWAAR');
});
