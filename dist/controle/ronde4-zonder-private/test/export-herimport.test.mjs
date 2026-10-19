import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { buildResultWorkbook } from '../src/io/write.js';
import { suggestMapping, makeProfile } from '../src/io/mapping.js';
import { source, context, reopen, rowsOf, importResult } from './helpers/fixtures.mjs';
import { invariant } from './helpers/invariants.mjs';

const header = ['Naam', 'Telefoon', 'E-mail', 'Adres', 'Opmerkingen', 'Contactpersoon', 'Website'];
const rows = [
  ['Fabelwinkel', '020001001; 030001002; 040001003; 050001004', 'a@fabel.invalid; b@fabel.invalid; c@fabel.invalid', 'Teststraat 42 bus 3', '=BEWAAR-MIJ', 'Mira Testmans', 'https://fabel.invalid'],
  ['Fabelwinkel BV', '060001005', 'd@fabel.invalid', 'Andere straat 17', '<img src=x onerror=alert(1)>', 'Norian Fabelman', 'https://andere.invalid'],
];

test('B02: geschreven XLSX bewaart extra kolommen, alle contacten en elke oorspronkelijke cel met herkomst', async () => {
  const prep = await prepare({ sources: [source('synthetisch.csv', header, rows)] });
  const res = assemble(prep, new Map([['0|1', 'zelfde']]));
  invariant(prep, res);
  const wb = reopen(buildResultWorkbook(prep, res, context));
  const uniek = rowsOf(wb, 'Unieke leads');
  assert.deepEqual(uniek[0].slice(0, 12), ['Lead Source', 'Project', 'Leadowner', 'Company', 'Hoofdsector', 'Sector', 'Mobile', 'Straat Huisnummer', 'Postcode', 'Woonplaats', 'Voornaam', 'Achternaam']);
  assert.ok(uniek[0].includes('Extra: Opmerkingen'), 'de beloofde extra kolom ontbreekt');
  assert.equal(uniek[1][uniek[0].indexOf('Telefoon 4')], '+32 50 00 10 04');
  assert.equal(uniek[1][uniek[0].indexOf('Telefoon 5')], '+32 60 00 10 05');
  assert.equal(uniek[1][uniek[0].indexOf('E-mail 3')], 'c@fabel.invalid');
  assert.equal(uniek[1][uniek[0].indexOf('E-mail 4')], 'd@fabel.invalid');
  assert.ok(wb.SheetNames.includes('Oorspronkelijke gegevens'));
  const original = rowsOf(wb, 'Oorspronkelijke gegevens');
  assert.equal(original.length - 1, rows.length * header.length, 'iedere oorspronkelijke cel precies één keer');
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < header.length; c++) {
    assert.ok(original.slice(1).some((v) => v[2] === 'synthetisch.csv' && v[4] === String(r + 2) && v[5] === String(c + 1) && v[6] === header[c] && v[7] === rows[r][c]), `bronrij ${r + 2}, kolom ${c + 1}`);
  }
  for (const name of wb.SheetNames) for (const [key, cell] of Object.entries(wb.Sheets[name])) if (!key.startsWith('!')) {
    assert.equal(cell.t, 's', `${name}!${key}: tekst`);
    assert.equal(cell.f, undefined, `${name}!${key}: geen formule`);
  }
  for (const [name, file] of Object.entries(wb.files)) if (/xl\/worksheets\/.*\.xml$/.test(name)) {
    assert.doesNotMatch(Buffer.from(file.content).toString(), /<f[\s>]/, 'ook de opgeslagen XML bevat geen formule');
  }
});

test('B02: dubbele kolomkoppen overschrijven geen oorspronkelijke cel', async () => {
  const prep = await prepare({ sources: [source('dubbele-koppen.csv', ['Naam', 'Notitie', 'Notitie'], [['Fabelwinkel', 'EERSTE', 'TWEEDE']])] });
  const wb = reopen(buildResultWorkbook(prep, assemble(prep), context));
  const original = rowsOf(wb, 'Oorspronkelijke gegevens');
  assert.ok(original.some((r) => r[5] === '2' && r[7] === 'EERSTE'));
  assert.ok(original.some((r) => r[5] === '3' && r[7] === 'TWEEDE'));
});

test('B03: eigen exportmetadata overrulet een oud fout bronprofiel; gewone Nr blijft huisnummer', async () => {
  const prep = await prepare({ sources: [source('bron.csv', ['Naam', 'Adres', 'Opmerkingen'], [['Fabelwinkel', 'Teststraat 42', 'x']])] });
  const wb = buildResultWorkbook(prep, assemble(prep), context);
  const [header, ...rows] = rowsOf(wb, 'Unieke leads');
  const mapping = suggestMapping({ header, rows }).mapping;
  assert.equal(mapping[header.indexOf('Nr')], 'negeren');
  assert.equal(mapping[header.indexOf('Straat Huisnummer')], 'adres');
  const wrong = [...mapping]; wrong[header.indexOf('Nr')] = 'huisnummer'; wrong[header.indexOf('Straat Huisnummer')] = 'straat';
  const fixed = suggestMapping({ header, rows, profiles: [makeProfile(header, wrong)] });
  assert.equal(fixed.mapping[header.indexOf('Nr')], 'negeren');
  assert.equal(fixed.mapping[header.indexOf('Straat Huisnummer')], 'adres');
  assert.deepEqual(suggestMapping({ header: ['Naam', 'Straat', 'Nr'], rows: [] }).mapping, ['bedrijfsnaam', 'straat', 'huisnummer']);
});

for (const adres of ['Teststraat 42', 'Teststraat 42 bus 3', 'Teststraat 42 C']) {
  test(`B03: drie export/importrondes behouden adres en contacten: ${adres}`, async () => {
    let prep = await prepare({ sources: [source('bron.csv', header, [[...rows[0].slice(0, 3), adres, ...rows[0].slice(4)]])] });
    const expected = { straat: 'Teststraat', huisnummer: '42', bus: adres.endsWith('3') ? '3' : adres.endsWith('C') ? 'c' : '' };
    for (let round = 0; round < 3; round++) {
      const wb = reopen(buildResultWorkbook(prep, assemble(prep), context));
      prep = await prepare({ sources: [await importResult(wb)] });
      const res = assemble(prep);
      invariant(prep, res);
      const lead = res.merged[0];
      assert.deepEqual({ straat: lead.straat, huisnummer: lead.huisnummer, bus: lead.bus }, expected);
      assert.equal(lead.telefoons.length, 4);
      assert.equal(lead.emails.length, 3);
      const original = rowsOf(reopen(buildResultWorkbook(prep, res, context)), 'Oorspronkelijke gegevens');
      assert.ok(original.some((r) => r[2] === 'bron.csv' && r[7] === '=BEWAAR-MIJ'), 'oorspronkelijke herkomst blijft na herimport bewaard');
    }
    prep = await prepare({ sources: [...prep.sources, source('nieuw.csv', ['Naam', 'Telefoon', 'Adres'], [['Fabelwinkel', '050001004', adres]])] });
    const res = assemble(prep);
    assert.equal(res.merged.length, 1, 'vierde telefoon doet mee bij vergelijken met een nieuwe lijst');
    invariant(prep, res);
  });
}

test('B02: ingelezen lege laatste kolomkop en Excel-offset houden alle broncellen bereikbaar', async () => {
  const { XLSX } = await import('./helpers/fixtures.mjs');
  const { readFile } = await import('../src/io/read.js');
  const input = XLSX.utils.book_new();
  const sheet = {};
  XLSX.utils.sheet_add_aoa(sheet, [['Naam', 'Adres', 'Opmerking', ''], ['Fabelwinkel', 'Teststraat 42', 'TEKST', ' BEWAAR OOK SPATIES ']], { origin: 'C5' });
  sheet['!ref'] = 'C5:F6';
  XLSX.utils.book_append_sheet(input, sheet, 'Bronblad');
  const file = await readFile({ name: 'verschoven.xlsx', arrayBuffer: async () => XLSX.write(input, { type: 'buffer', bookType: 'xlsx' }) });
  const table = file.sheets[0];
  assert.equal(table.rows[0][3], ' BEWAAR OOK SPATIES ');
  assert.equal(table.rowNumbers[0], 6);
  assert.equal(table.headerRowIndex, 4);
  const prep = await prepare({ sources: [source(file.name, table.header, table.rows, { ...table, name: file.name, sheetName: table.name })] });
  const original = rowsOf(reopen(buildResultWorkbook(prep, assemble(prep), context)), 'Oorspronkelijke gegevens');
  assert.ok(original.some((r) => r[3] === 'Bronblad' && r[4] === '6' && r[5] === '6' && r[7] === ' BEWAAR OOK SPATIES '));
});

test('B03: apart busveld blijft bewaard; oude export zonder herkomsttabblad wordt herkend', async () => {
  const prep = await prepare({ sources: [source('bron.csv', ['Naam', 'Straat', 'Nr', 'Bus'], [['Fabelwinkel', 'Teststraat', '42', '3']])] });
  let wb = buildResultWorkbook(prep, assemble(prep), context);
  assert.equal(rowsOf(wb, 'Unieke leads')[1][7], 'Teststraat 42 bus 3');
  delete wb.Sheets['Oorspronkelijke gegevens'];
  wb.SheetNames = wb.SheetNames.filter((n) => n !== 'Oorspronkelijke gegevens');
  const again = await prepare({ sources: [await importResult(wb)] });
  assert.equal(assemble(again).merged[0].huisnummer, '42');
  assert.equal(assemble(again).merged[0].bus, '3');
});
