import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { decodeBytes, detectDelimiter, parseCsv, findHeaderRow, tableFromRows, readFile, readWorkbookTables } from '../src/io/read.js';

const require = createRequire(import.meta.url);
globalThis.XLSX = require('../vendor/xlsx.full.min.js');

test('UTF-8 met BOM wordt herkend en de BOM verdwijnt', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Naam;Tel\nCafé;1')]);
  const r = decodeBytes(bytes);
  assert.equal(r.encoding, 'utf-8');
  assert.equal(r.bom, true);
  assert.ok(r.text.startsWith('Naam'));
  assert.ok(r.text.includes('Café'));
});
test('Windows-1252 wordt herkend', () => {
  const bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x3b, 0x31]); // "Café;1" in cp1252
  const r = decodeBytes(bytes);
  assert.equal(r.encoding, 'windows-1252');
  assert.equal(r.text, 'Café;1');
});
test('scheidingsteken: puntkomma, komma en tab', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3\n'), ';');
  assert.equal(detectDelimiter('a,b,c\n1,2,3\n'), ',');
  assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3\n'), '\t');
  assert.equal(detectDelimiter('"Fabelia, Hair";b;c\n1;2;3\n'), ';');
});
test('CSV met aanhalingstekens en regeleinden', () => {
  const rows = parseCsv('a;b\r\n"x;y";"zeg ""hallo"""\n1;2', ';');
  assert.deepEqual(rows, [['a', 'b'], ['x;y', 'zeg "hallo"'], ['1', '2']]);
});
test('kopregel is de eerste rij met minstens drie gevulde cellen', () => {
  const rows = [['Lijst Voorbeeldstad', '', ''], ['', '', ''], ['Naam', 'Tel', 'Mail'], ['A', '1', 'a@b.invalid']];
  assert.equal(findHeaderRow(rows), 2);
  const t = tableFromRows(rows, 2);
  assert.deepEqual(t.header, ['Naam', 'Tel', 'Mail']);
  assert.equal(t.rows.length, 1);
  assert.deepEqual(t.rowNumbers, [4]);
});
test('lege rijen worden overgeslagen, lege kopcellen krijgen een naam', () => {
  const t = tableFromRows([['Naam', '', 'Tel'], ['', '', ''], ['A', 'x', '1']], 0);
  assert.deepEqual(t.header, ['Naam', 'Kolom 2', 'Tel']);
  assert.equal(t.rows.length, 1);
});

const fileOf = (name, text) => ({ name, arrayBuffer: async () => new TextEncoder().encode(text).buffer });

test('readFile leest een CSV met voorloopnullen als tekst', async () => {
  const f = await readFile(fileOf('lijst.csv', 'Naam;Tel\nFabelia;0400 00 10 01\n'));
  assert.equal(f.kind, 'csv');
  assert.equal(f.delimiter, ';');
  assert.deepEqual(f.sheets[0].rows[0], ['Fabelia', '0400 00 10 01']);
});
test('readFile waarschuwt bij wetenschappelijke notatie', async () => {
  const f = await readFile(fileOf('lijst.csv', 'Naam;Tel;X\nFabelia;3,2479E+10;1\n'));
  assert.equal(f.sheets[0].warnings.length, 1);
  assert.ok(f.sheets[0].warnings[0].includes('Tel'));
});
test('Excel: getallen worden tekst zonder wetenschappelijke notatie, datums als JJJJ-MM-DD', () => {
  const ws = globalThis.XLSX.utils.aoa_to_sheet([['Naam', 'Tel', 'Datum'], ['A', 32400001001, new Date(2026, 9, 16)]], { cellDates: true });
  const wb = globalThis.XLSX.utils.book_new();
  globalThis.XLSX.utils.book_append_sheet(wb, ws, 'Blad1');
  const bytes = globalThis.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const tables = readWorkbookTables(new Uint8Array(bytes));
  assert.equal(tables[0].rows[1][1], '32400001001');
  assert.equal(tables[0].rows[1][2], '2026-10-16');
});
test('onbekende extensie geeft een duidelijke fout', async () => {
  await assert.rejects(readFile(fileOf('lijst.pdf', 'x')), /alleen \.xlsx, \.xls en \.csv/);
});
