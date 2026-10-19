import test from 'node:test';
import assert from 'node:assert/strict';
import { btwFor, scenario, csvBytes } from '../tools/performance-data.mjs';
import { normalizeBtw } from '../src/engine/normalize.js';
import { SETTINGS } from '../src/settings.js';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { readFile } from '../src/io/read.js';
import { source, XLSX, context, reopen, btw } from './helpers/fixtures.mjs';
import { invariant } from './helpers/invariants.mjs';
import { checkPartition, checkWorkbook } from '../tools/performance-quality.mjs';
import { buildResultWorkbook, textSheet } from '../src/io/write.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('B12: benchmark-BTW heeft tien cijfers en een onafhankelijke modulo-97-controle', () => {
  const seen = new Set();
  for (let i = 0; i < 50000; i++) {
    const value = btwFor(i), digits = value.replace(/\D/g, '');
    assert.match(value, /^BE\d{4}\.\d{3}\.\d{3}$/);
    assert.equal(digits.length, 10);
    assert.equal(Number(digits.slice(8)), 97 - Number(digits.slice(0, 8)) % 97);
    assert.ok(!seen.has(digits)); seen.add(digits);
  }
});

test('B12: benchmark-BTW bereikt het geldige pad van de normalisatie', () => {
  for (const i of [0, 1, 96, 97, 999, 9999, 49999]) assert.equal(normalizeBtw(btwFor(i)).valid, true);
});

test('B12: ongeldige BTW-indices worden geweigerd', () => {
  for (const i of [-1, 50000, 0.5, NaN, Infinity, '1']) assert.throws(() => btwFor(i));
});

for (const soort of SETTINGS.prestaties.scenarios) {
  test(`generator ${soort}: herhaalbare 1k/10k/50k-invoer met onafhankelijke identiteit`, () => {
    for (const aantal of SETTINGS.prestaties.rijen) {
      const a = scenario({ soort, aantal }), b = scenario({ soort, aantal });
      assert.deepEqual(a, b); assert.equal(a.rows.length, aantal);
      const groups = new Set(a.identity).size;
      assert.equal(groups, soort === 'uniek' ? aantal * 0.95 : soort === 'duplicaten' ? aantal / 25 : aantal / 2);
      const vatByIdentity = new Map();
      for (let i = 0; i < aantal; i++) {
        assert.equal(a.rows[i].length, a.header.length);
        const vat = a.rows[i][1];
        if (vat) assert.ok(normalizeBtw(vat).valid);
        if (vatByIdentity.has(a.identity[i])) assert.equal(vat, vatByIdentity.get(a.identity[i]));
        vatByIdentity.set(a.identity[i], vat);
        assert.match(a.rows[i][3], /\.invalid$/);
      }
      assert.notDeepEqual(a.identity, scenario({ soort, aantal, seed: 42 }).identity);
    }
  });
  test(`generator ${soort}: echte CSV-inleesketen, verwachte groepen en exportbehoud`, async () => {
    const data = scenario({ soort, aantal: 1000 });
    const file = await readFile({ name: 'synthetisch.csv', arrayBuffer: async () => csvBytes(data) });
    const sheet = file.sheets[file.defaultSheet];
    assert.deepEqual(sheet.rows, data.rows);
    const prep = await prepare({ sources: [source('synthetisch.csv', sheet.header, sheet.rows, { sheetName: 'CSV' })] });
    const res = assemble(prep);
    invariant(prep, res);
    checkPartition(data.identity, res.groups.map((g) => g.members));
    const out = mkdtempSync(path.join(tmpdir(), 'lead-prestaties-'));
    try {
      const wb = buildResultWorkbook(prep, res, context), dest = path.join(out, 'resultaat.xlsx');
      writeFileSync(dest, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
      assert.equal(checkWorkbook(data, dest).gegevensbehoud, true);
      const duplicate = res.groups.find((g) => g.members.length > 1).members;
      const decisions = new Map([[`${Math.min(duplicate[0], duplicate[1])}|${Math.max(duplicate[0], duplicate[1])}`, 'verschillend']]);
      invariant(prep, assemble(prep, decisions), decisions);
      for (const niveau of SETTINGS.strengheid.niveaus) assert.deepEqual(assemble(prep, new Map(), { strengheid: niveau.key }).groups, res.groups);
      // Het verificatiepad moet een echte ontbrekende broncel vinden, niet alleen totalen vergelijken.
      delete wb.Sheets['Oorspronkelijke gegevens']['!data'][1][7];
      writeFileSync(dest, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
      assert.throws(() => checkWorkbook(data, dest));
    } finally { rmSync(out, { recursive: true, force: true }); }
  });
}

test('onafhankelijke groepscontrole vindt verlies, dubbel tellen, foute samenvoeging en splitsing', () => {
  const truth = [0, 0, 1, 1];
  assert.equal(checkPartition(truth, [[0, 1], [2, 3]]), 2);
  for (const groups of [[[0, 1], [2]], [[0, 1], [2, 3, 3]], [[0, 2], [1, 3]], [[0], [1], [2, 3]], [[0, 1], [2, 9]]]) assert.throws(() => checkPartition(truth, groups));
});

test('export verwerkt een rijstroom met exacte tekstwaarden zonder tussentabel', () => {
  function* rows() { yield ['=TEKST', '  bewaar  ']; yield [null, 42]; }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, textSheet(['A', 'B'], rows()), 'Tekst');
  const sheet = reopen(wb).Sheets.Tekst;
  assert.equal(sheet.A2.v, '=TEKST'); assert.equal(sheet.A2.t, 's'); assert.equal(sheet.A2.f, undefined);
  assert.equal(sheet.B2.v, '  bewaar  '); assert.equal(sheet.A3.v, ''); assert.equal(sheet.B3.v, '42');
  assert.equal(sheet['!ref'], 'A1:B3'); assert.equal(sheet['!autofilter'].ref, 'A1:B3');
});

test('compacte werkbladen bewaren blokgrenzen, brede rijen, lege cellen en Excel-opmaak', () => {
  const count = SETTINGS.eigenExport.schrijfBlok + 2;
  const rows = Array.from({ length: count }, (_, i) => [String(i), '', '=BEWAAR\n<&>"', '  spaties  ']);
  const sheet = textSheet(['Volgorde', 'Leeg', 'Tekst'], rows);
  assert.ok(Array.isArray(sheet['!data']), 'compacte opslag blijft in gebruik');
  assert.equal(sheet['!ref'], `A1:D${count + 1}`);
  assert.equal(sheet['!autofilter'].ref, `A1:C${count + 1}`);
  assert.deepEqual(sheet['!cols'], [{ wch: 10 }, { wch: 8 }, { wch: 14 }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Tekst');
  const read = reopen(wb).Sheets.Tekst;
  assert.deepEqual(XLSX.utils.sheet_to_json(read, { header: 1 }), [['Volgorde', 'Leeg', 'Tekst'], ...rows]);
  let checked = 0;
  for (const [key, cell] of Object.entries(read)) if (!key.startsWith('!')) {
    assert.equal(cell.t, 's'); assert.equal(cell.f, undefined); checked++;
  }
  assert.equal(checked, 3 + count * 4, 'ook lege cellen en de laatste rij zijn gecontroleerd');
});

test('rijstroom behoudt de Excel-limieten en kapt nooit celtekst af', () => {
  function* rows() { yield ['x'.repeat(SETTINGS.eigenExport.maxCelTekens + 1)]; }
  assert.throws(() => textSheet(['A'], rows()), /langer dan Excel/);
});

for (const methode of ['scheduler', 'timer']) {
  test(`verwerken via ${methode} laat andere taken toe en behoudt voortgang en groepen`, async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'scheduler');
    const settings = structuredClone(SETTINGS);
    settings.verwerking.normaliseerBlok = 2;
    let awakened = false, yields = 0;
    const timer = setTimeout(() => { awakened = true; }, 0);
    const progress = [];
    try {
      Object.defineProperty(globalThis, 'scheduler', { configurable: true, value: methode === 'scheduler' ? {
        postTask: (callback, options) => {
          assert.equal(options.priority, 'background'); yields++;
          return new Promise((resolve) => setTimeout(() => { callback(); resolve(); }, 0));
        },
      } : undefined });
      const prep = await prepare({ settings, chunk: 5, onProgress: (p, label) => progress.push(label),
        sources: [source('synthetisch.csv', ['Naam', 'BTW'], Array.from({ length: 20 }, () => ['Fabelwinkel', btw()]))] });
      assert.equal(awakened, true, 'de uitvoering wordt werkelijk afgestaan');
      if (methode === 'scheduler') assert.ok(yields > 0);
      assert.equal(progress.filter((label) => label.startsWith('Rijen gelijkgetrokken:')).length, 10);
      assert.ok(progress.some((label) => label.startsWith('Vergeleken:')));
      const res = assemble(prep);
      assert.deepEqual(res.groups.map((g) => g.members), [Array.from({ length: 20 }, (_, i) => i)]);
      invariant(prep, res);
    } finally {
      clearTimeout(timer);
      if (saved) Object.defineProperty(globalThis, 'scheduler', saved); else delete globalThis.scheduler;
    }
  });
}

test('strengheidsaantallen blijven juist wanneer een aangepaste stand ook de zekere grens wijzigt', async () => {
  const settings = structuredClone(SETTINGS);
  settings.strengheid.niveaus[0].grenzen.zekerDubbel = 120;
  const prep = await prepare({ settings, sources: [source('synthetisch.csv', ['Naam', 'Telefoon'], [['Fabelwinkel', '020001001'], ['Fabelwinkel', '020001001']])] });
  const res = assemble(prep);
  assert.equal(res.groups.length, 1);
  for (const level of res.perStrengheid) assert.equal(level.aantal, assemble(prep, new Map(), { strengheid: level.key }).review.length);
  assert.equal(res.perStrengheid[0].aantal, 1);
});
