import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SETTINGS } from '../src/settings.js';
import { readFile, readWorkbookTables, parseCsv, sheetToTextRows } from '../src/io/read.js';

const require = createRequire(import.meta.url);
globalThis.XLSX = require('../vendor/xlsx.full.min.js');
const X = globalThis.XLSX;

// Kleine grenzen oefenen dezelfde paden zonder grote proefbestanden te maken.
function grenzen(t, waarden = {}) {
  const origineel = SETTINGS.inlezen;
  SETTINGS.inlezen = { maxBestandBytes: 100 * 1024 * 1024, maxCellen: 2000000,
    maxUitgepaktBytes: 256 * 1024 * 1024, maxArchiefBestanden: 10000, ...origineel, ...waarden };
  t.after(() => { SETTINGS.inlezen = origineel; });
}

function werkmap(tabellen, opties = {}) {
  const wb = X.utils.book_new();
  tabellen.forEach((rijen, i) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rijen), `Blad${i + 1}`));
  return new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx', ...opties }));
}

test('inleesgrens: een te groot bestand wordt geweigerd vóór arrayBuffer', async (t) => {
  grenzen(t, { maxBestandBytes: 100 });
  for (const name of ['te-groot.csv', 'te-groot.xlsx', 'te-groot.xls']) {
    let gelezen = false;
    await assert.rejects(readFile({ name, size: 101, arrayBuffer: async () => {
      gelezen = true; return new ArrayBuffer(0);
    } }), /bestand.*te groot.*100 bytes/i);
    assert.equal(gelezen, false);
  }
});

test('inleesgrens: controleert ook echte bytes bij ontbrekende of onjuiste size', async (t) => {
  grenzen(t, { maxBestandBytes: 10 });
  for (const size of [undefined, 1]) {
    await assert.rejects(readFile({ name: 'lijst.csv', size,
      arrayBuffer: async () => new TextEncoder().encode('a;b;c\n1;2;3').buffer }), /bestand.*te groot/i);
  }
  assert.throws(() => readWorkbookTables(new Uint8Array(11)), /bestand.*te groot/i);
  const exact = new TextEncoder().encode('A;B\n1;2   ');
  const gelezen = await readFile({ name: 'lijst.csv', size: 10, arrayBuffer: async () => exact.buffer });
  assert.deepEqual(gelezen.sheets[0].rows, [['1', '2   ']]);
});

test('inleesgrens: CSV begrenst de rechthoek inclusief lege cellen en onregelmatige rijen', (t) => {
  grenzen(t, { maxCellen: 6 });
  assert.deepEqual(parseCsv('a;b;c\n1;2;3\n', ';'), [['a', 'b', 'c'], ['1', '2', '3']]);
  for (const text of ['a;b;c\n1;2;3\n4', 'a\nb\nc;d;e', 'a;b;c\n\n']) {
    // De tweede invoer bevat maar vijf expliciete cellen, maar zou naar negen cellen worden opgevuld.
    if (text === 'a;b;c\n\n') assert.equal(parseCsv(text, ';').length, 2);
    else assert.throws(() => parseCsv(text, ';'), /maximaal 6 cellen/i);
  }
  assert.throws(() => parseCsv(';;;;;;', ';'), /maximaal 6 cellen/i);
  assert.deepEqual(parseCsv('"a;b\nc";"d"\n1;2', ';'), [['a;b\nc', 'd'], ['1', '2']]);
});

test('inleesgrens: CSV wordt ook via readFile begrensd', async (t) => {
  grenzen(t, { maxCellen: 6 });
  await assert.rejects(readFile({ name: 'lijst.csv', arrayBuffer: async () =>
    new TextEncoder().encode('Naam;Tel;Plaats\nA;1;X\nB;2;Y').buffer }), /maximaal 6 cellen/i);
});

test('inleesgrens: Excel controleert alle tabbladbereiken samen vóór celconversie', (t) => {
  grenzen(t, { maxCellen: 6 });
  const bytes = werkmap([[['a', 'b', 'c'], ['1', '2', '3']]]);
  assert.deepEqual(readWorkbookTables(bytes)[0].rows, [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.throws(() => readWorkbookTables(werkmap([[['a', 'b'], ['1', '2']], [['c', 'd'], ['3', '4']]])),
    /maximaal 6 cellen/i);
  const ws = { '!ref': 'C5:E7', get C5() { assert.fail('Mag nog geen celinhoud lezen'); } };
  assert.throws(() => sheetToTextRows(ws), /maximaal 6 cellen/i);
  assert.throws(() => sheetToTextRows({ '!ref': 'A1:XFD1048576' }), /maximaal 6 cellen/i);
  assert.throws(() => sheetToTextRows({ '!ref': 'A1', '!fullref': 'A1:C3' }), /maximaal 6 cellen/i);
  assert.throws(() => sheetToTextRows({ '!fullref': 'A1:C3' }), /maximaal 6 cellen/i);
  assert.throws(() => sheetToTextRows({ '!ref': 'C3:A1' }), /ongeldig celbereik/i);
  assert.deepEqual(sheetToTextRows({ '!ref': 'C5:E6', C5: { t: 's', v: 'kop' } }),
    [['kop', '', ''], ['', '', '']]);
  t.mock.method(X, 'read', () => ({ SheetNames: ['klein', 'groot'], Sheets: {
    klein: { '!ref': 'A1', get A1() { assert.fail('Eerst alle bereiken controleren'); } }, groot: ws,
  } }));
  assert.throws(() => readWorkbookTables(new Uint8Array()), /maximaal 6 cellen/i);
});

test('inleesgrens: ZIP-uitpakgrootte wordt vóór SheetJS gecontroleerd', (t) => {
  grenzen(t, { maxUitgepaktBytes: 1024 });
  const bytes = werkmap([[['Naam'], ['Voorbeeld']]], { compression: true });
  const lezer = t.mock.method(X, 'read', () => ({ SheetNames: [], Sheets: {} }));
  assert.throws(() => readWorkbookTables(bytes), /uitgepakt.*maximaal 1024 bytes/i);
  assert.equal(lezer.mock.callCount(), 0);
});

test('inleesgrens: ook een overdreven ZIP-opgave wordt zonder uitpakken geweigerd', (t) => {
  grenzen(t);
  const bytes = werkmap([[['Naam'], ['Voorbeeld']]], { compression: true });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i <= bytes.length - 46; i++) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, SETTINGS.inlezen.maxUitgepaktBytes + 1, true);
      break;
    }
  }
  const lezer = t.mock.method(X, 'read', () => ({ SheetNames: [], Sheets: {} }));
  assert.throws(() => readWorkbookTables(bytes), /uitgepakt.*maximaal/i);
  assert.equal(lezer.mock.callCount(), 0);
});

test('inleesgrens: gewone XLSX, XLS, XLSB en ODS blijven leesbaar', (t) => {
  grenzen(t);
  for (const bookType of ['xlsx', 'xls', 'xlsb', 'ods']) {
    const bytes = werkmap([[['Naam', 'Code'], ['Voorbeeld', '001']]], { bookType, compression: true });
    assert.deepEqual(readWorkbookTables(bytes)[0].rows, [['Naam', 'Code'], ['Voorbeeld', '001']]);
  }
});

test('inleesgrens: beschadigde en te uitgebreide ZIP-index bereikt SheetJS niet', (t) => {
  grenzen(t);
  const bytes = werkmap([[['Naam'], ['Voorbeeld']]], { compression: true });
  const lezer = t.mock.method(X, 'read', () => ({ SheetNames: [], Sheets: {} }));
  assert.throws(() => readWorkbookTables(bytes.subarray(0, bytes.length - 1)), /archief.*beschadigd/i);
  const afwijkend = bytes.slice();
  const view = new DataView(afwijkend.buffer);
  view.setUint32(22, view.getUint32(22, true) + 1, true);
  assert.throws(() => readWorkbookTables(afwijkend), /archief.*beschadigd/i);
  SETTINGS.inlezen.maxArchiefBestanden = 1;
  assert.throws(() => readWorkbookTables(bytes), /te veel onderdelen/i);
  assert.equal(lezer.mock.callCount(), 0);
});

test('inleesgrens: totale ZIP-uitpakgrootte mag precies op de grens liggen', (t) => {
  grenzen(t);
  const bytes = werkmap([[['Naam'], ['Voorbeeld']]], { compression: true });
  const view = new DataView(bytes.buffer);
  const end = bytes.length - 22;
  let offset = view.getUint32(end + 16, true);
  let total = 0;
  while (offset < end) {
    total += view.getUint32(offset + 24, true);
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  SETTINGS.inlezen.maxUitgepaktBytes = total;
  assert.deepEqual(readWorkbookTables(bytes)[0].rows, [['Naam'], ['Voorbeeld']]);
  SETTINGS.inlezen.maxUitgepaktBytes = total - 1;
  assert.throws(() => readWorkbookTables(bytes), /uitgepakt.*te groot/i);
});
