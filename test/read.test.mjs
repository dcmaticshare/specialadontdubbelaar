import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { decodeBytes, detectDelimiter, parseCsv, findHeaderRow, tableFromRows, readFile, readWorkbookTables, fileKind, FILE_ACCEPT } from '../src/io/read.js';

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

for (const [encoding, octets] of [
  ['utf-16le', [0xff, 0xfe, 0x43, 0, 0x61, 0, 0x66, 0, 0xe9, 0, 0x20, 0, 0x3e, 0xd8, 0x89, 0xdd]],
  ['utf-16be', [0xfe, 0xff, 0, 0x43, 0, 0x61, 0, 0x66, 0, 0xe9, 0, 0x20, 0xd8, 0x3e, 0xdd, 0x89]],
]) {
  test(`codescan 33: UTF-16 (${encoding}) herkent de BOM en bewaart accenten en surrogateparen`, () => {
    // Vaste bytes houden de verwachte tekst onafhankelijk van een testencoder.
    const bytes = new Uint8Array(octets);
    const padded = new Uint8Array([0x61, ...octets, 0x62]);
    for (const input of [bytes, bytes.buffer, padded.subarray(1, padded.length - 1)]) {
      assert.deepEqual(decodeBytes(input), { text: 'Café 🦉', encoding, bom: true });
    }
  });

  test(`codescan 33: UTF-16 (${encoding}) met uitsluitend een BOM levert lege tekst`, () => {
    assert.deepEqual(decodeBytes(new Uint8Array(octets.slice(0, 2))), { text: '', encoding, bom: true });
  });

  test(`codescan 33: UTF-16 (${encoding}) leest CSV zonder verlies van tekst of rijen`, async () => {
    const text = '\uFEFFNaam;Code;Notitie\r\n"Café 🦉";0012;"regel 1\r\nregel 2"\r\nFabelatelier;0003;"maat 12""; groot"\r\n';
    const encoded = Buffer.from(text, 'utf16le');
    if (encoding === 'utf-16be') encoded.swap16();
    const bytes = Uint8Array.from(encoded);
    const result = await readFile({ name: 'synthetisch-utf16.csv', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer });
    assert.equal(result.kind, 'csv');
    assert.equal(result.encoding, `${encoding} (met BOM)`);
    assert.equal(result.delimiter, ';');
    assert.deepEqual(result.sheets[0].header, ['Naam', 'Code', 'Notitie']);
    assert.deepEqual(result.sheets[0].rows, [
      ['Café 🦉', '0012', 'regel 1\r\nregel 2'],
      ['Fabelatelier', '0003', 'maat 12"; groot'],
    ]);
    assert.deepEqual(result.sheets[0].rowNumbers, [2, 3]);
    assert.deepEqual(result.sheets[0].warnings, []);
  });
}

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
test('CSV bewaart losse aanhalingstekens in velden en alle volgende rijen', () => {
  for (const delimiter of [';', ',', '\t', '|']) {
    for (const newline of ['\n', '\r\n', '\r']) {
      const expected = [['a', '12" scherm', 'b'], ['15"', 'zeg "hallo"', '3'], ['1', '2', '3']];
      const text = expected.map((row) => row.join(delimiter)).join(newline);
      assert.deepEqual(parseCsv(text, delimiter), expected);
    }
  }
});
test('CSV blijft geciteerde velden met scheidingstekens, escapes en regeleinden lezen', () => {
  assert.deepEqual(parseCsv('"";"12"" scherm; groot";"regel 1\r\nregel 2"\r\n1;2;3', ';'), [
    ['', '12" scherm; groot', 'regel 1\r\nregel 2'], ['1', '2', '3'],
  ]);
});
test('CSV herkent scheidingstekens na een los aanhalingsteken bij het inlezen', async () => {
  for (const delimiter of [';', ',', '\t', '|']) {
    const header = ['Schermmaat "inch', 'Code', 'Plaats'];
    const rows = [['12" scherm', '01', 'Voorbeeldstad'], ['15" scherm', '02', 'Teststad']];
    const text = [header, ...rows].map((row) => row.join(delimiter)).join('\n');
    assert.equal(detectDelimiter(text), delimiter);
    const result = await readFile(fileOf('schermen.csv', text));
    assert.equal(result.delimiter, delimiter);
    assert.deepEqual(result.sheets[0].header, header);
    assert.deepEqual(result.sheets[0].rows, rows);
    assert.deepEqual(result.sheets[0].rowNumbers, [2, 3]);
  }
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
  let gelezen = false;
  await assert.rejects(readFile({ name: 'lijst.pdf', arrayBuffer: async () => { gelezen = true; } }), (error) => {
    assert.match(error.message, /lijst\.pdf/);
    assert.deepEqual([...error.message.matchAll(/\.(csv|txt|tsv|xlsx|xlsm|xlsb|xls|ods)\b/g)].map((m) => m[0]).sort(), extensies);
    return true;
  });
  assert.equal(gelezen, false, 'een onbekend bestand wordt niet ingelezen');
});

const extensies = ['.csv', '.txt', '.tsv', '.xlsx', '.xlsm', '.xls', '.xlsb', '.ods'].sort();

test('alle acht bestandstypen lezen synthetische rijen, ook met hoofdletters in de extensie', async () => {
  assert.deepEqual(FILE_ACCEPT.split(',').sort(), extensies);
  const rows = [['Naam', 'Code', 'Plaats'], ['Fabelwinkel', '0012', 'Voorbeeldstad']];
  for (const extension of extensies) {
    const kind = ['.csv', '.txt', '.tsv'].includes(extension) ? 'csv' : 'excel';
    const name = `synthetisch${extension.toUpperCase()}`;
    assert.equal(fileKind(name), kind);
    let bytes;
    if (kind === 'csv') {
      bytes = new TextEncoder().encode(rows.map((row) => row.join(extension === '.tsv' ? '\t' : ';')).join('\n')).buffer;
    } else {
      const wb = globalThis.XLSX.utils.book_new();
      globalThis.XLSX.utils.book_append_sheet(wb, globalThis.XLSX.utils.aoa_to_sheet(rows), 'Leads');
      bytes = globalThis.XLSX.write(wb, { type: 'array', bookType: extension.slice(1) });
    }
    const result = await readFile({ name, size: bytes.byteLength, arrayBuffer: async () => bytes });
    assert.equal(result.kind, kind);
    assert.deepEqual(result.sheets[0].header, rows[0], name);
    assert.deepEqual(result.sheets[0].rows, rows.slice(1), name);
  }
});

test('handleiding noemt precies de ondersteunde bestandstypen bij het laden', () => {
  const manual = readFileSync(new URL('../docs/Handleiding.md', import.meta.url), 'utf8');
  const paragraph = manual.split('\n').find((line) => line.startsWith('Je laadt'));
  assert.deepEqual([...paragraph.matchAll(/\.[a-z0-9]+/g)].map((m) => m[0]).sort(), FILE_ACCEPT.split(',').sort());
});
