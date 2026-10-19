// Herstel mag geen keuzes kwijtraken of met andere bronrijen verbinden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionSnapshot, sessionSources, restoreSession } from '../src/io/session.js';
import { readFile } from '../src/io/read.js';
import { suggestMapping } from '../src/io/mapping.js';
import { prepare, assemble, decideGroups, unlinkGroup } from '../src/engine/pipeline.js';
import { buildResultWorkbook } from '../src/io/write.js';
import { context, XLSX } from './helpers/fixtures.mjs';

async function example() {
  const bytes = Buffer.from('Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\nFabelwinkel;020001001;Teststraat 42\nFabelwinkel;030001002;Andereweg 9\nFabelwinkel;030001002;Andereweg 9');
  const read = await readFile({ name: 'verzonnen.csv', arrayBuffer: async () => bytes });
  const sheet = read.sheets[0], map = { ...suggestMapping({ header: sheet.header, rows: sheet.rows }), sheetIndex: 0 };
  const prep = await prepare({ sources: [{ name: 'verzonnen.csv', ...sheet, mapping: map.mapping }] });
  const state = { files: [{ id: 1, name: 'verzonnen.csv', read, sheetIndex: 0, map, error: null }], screen: 'review',
    prep, res: assemble(prep), decisions: new Map(), decisionLog: [], deferred: new Set(), strengheid: 'gemiddeld', tab: 'twijfel', search: '' };
  return state;
}
function roundtrip(state) {
  return restoreSession(structuredClone(sessionSnapshot(state)), structuredClone(sessionSources(state.files)));
}

for (const [field, invalid] of Object.entries({
  kind: [undefined, null, 'anders', 1],
  encoding: [undefined, null, '', 'onbekend', 1],
  delimiter: [undefined, null, '', ';;', 'x', 1],
  sheetNames: [undefined, null, [], ['Ander blad'], [1], new Array(1)],
  defaultSheet: [undefined, null, -1, 0.5, '0', 1, Number.MAX_SAFE_INTEGER + 1],
  columnOffset: [undefined, null, 'abc', -1, 0.5, Number.MAX_SAFE_INTEGER + 1],
})) test(`Codescan 16: beschadigd bronveld ${field} wordt bij herstel geweigerd`, async () => {
  const state = await example();
  for (const value of invalid) {
    const sources = structuredClone(sessionSources(state.files));
    const target = field === 'columnOffset' ? sources[0].read.sheets[0] : sources[0].read;
    target[field] = value;
    assert.throws(() => restoreSession(sessionSnapshot(state), sources), /onvolledig/, `${field}: ${String(value)}`);
  }
});

test('Codescan 16: beschadigde oorspronkelijke rijen en cellen worden bij herstel geweigerd', async () => {
  const state = await example();
  const origin = { bron: 'oud.csv', blad: 'CSV', rij: '6', cellen: [{ kolom: '3', kop: 'Naam', waarde: 'OUD-ORIGINEEL' }] };
  const invalidOrigins = [null, {}, [origin], [], new Array(4), [null, [], [], []], [[null], [], [], []]];
  for (const field of ['bron', 'blad', 'rij', 'cellen']) {
    invalidOrigins.push([[{ ...origin, [field]: undefined }], [], [], []]);
    invalidOrigins.push([[{ ...origin, [field]: 7 }], [], [], []]);
  }
  for (const cell of [null, {}, { kolom: '3', kop: 'Naam', waarde: 7 }, { kolom: {}, kop: 'Naam', waarde: '' }]) {
    invalidOrigins.push([[{ ...origin, cellen: [cell] }], [], [], []]);
  }
  invalidOrigins.push([[{ ...origin, cellen: new Array(1) }], [], [], []]);
  for (const originals of invalidOrigins) {
    const sources = structuredClone(sessionSources(state.files)); sources[0].read.sheets[0].originals = originals;
    assert.throws(() => restoreSession(sessionSnapshot(state), sources), /onvolledig/);
  }
});

test('Codescan 16: CSV-metadata en herimporteerde Excel-herkomst blijven volledig herstelbaar', async () => {
  const state = await example(), file = state.files[0];
  for (const encoding of ['utf-8', 'utf-8 (met BOM)', 'utf-16le (met BOM)', 'utf-16be (met BOM)', 'windows-1252']) {
    for (const delimiter of [';', ',', '\t', '|']) {
      file.read.encoding = encoding; file.read.delimiter = delimiter;
      assert.deepEqual(roundtrip(state).files[0].read, file.read);
    }
  }
  const bytes = XLSX.write(buildResultWorkbook(state.prep, state.res, context), { type: 'buffer', bookType: 'xlsx' });
  file.name = 'herimport.xlsx';
  file.read = await readFile({ name: file.name, arrayBuffer: async () => bytes });
  file.sheetIndex = file.read.defaultSheet;
  const sheet = file.read.sheets[file.sheetIndex];
  file.map = { ...suggestMapping(sheet), sheetIndex: file.sheetIndex };
  assert.ok(sheet.originals.some((origins) => origins.length > 0));
  for (const sources of [sessionSources(state.files), [{ id: file.id, read: file.read }]]) {
    const restored = restoreSession(sessionSnapshot(state), structuredClone(sources)).files[0];
    assert.deepEqual(restored.read.sheets[file.sheetIndex], sheet);
    const prep = await prepare({ sources: [{ ...sheet, name: file.name, sheetName: sheet.name, mapping: restored.map.mapping }] });
    assert.deepEqual(prep.records[0].originals.slice(0, -1), sheet.originals[0]);
  }
  for (const field of ['encoding', 'delimiter']) {
    const sources = structuredClone(sessionSources(state.files)); sources[0].read[field] = 'csv';
    assert.throws(() => restoreSession(sessionSnapshot(state), sources), /onvolledig/);
  }
});

test('Codescan 8: alleen het gekozen blad blijft bewaard, inclusief offsets en oorspronkelijke cellen', async () => {
  const state = await example(), file = state.files[0], selected = file.read.sheets[0];
  selected.columnOffset = 2;
  selected.originals = [[{ bron: 'oud.csv', blad: 'CSV', rij: '6', cellen: [{ kolom: '3', kop: 'Naam', waarde: 'OUD-ORIGINEEL' }] }], [], [], []];
  const other = { ...selected, name: 'Groot bijblad', rows: Array.from({ length: 10000 }, () => ['NIET-PERSISTENT']) };
  file.read.sheets = [other, selected]; file.read.sheetNames = ['Groot bijblad', selected.name];
  file.sheetIndex = 1; file.map.sheetIndex = 1;
  const compact = sessionSources(state.files);
  assert.equal(compact[0].read.sheets[0], null);
  assert.equal(compact[0].read.sheets[1], selected, 'geen diepe kopie voor de opslagtransactie');
  assert.ok(JSON.stringify(compact).length < JSON.stringify(file.read).length / 10);
  const restored = roundtrip(state).files[0];
  assert.equal(restored.sheetIndex, 1);
  assert.deepEqual(restored.read.sheets[1], selected);
  assert.deepEqual(restored.read.sheetNames, file.read.sheetNames);
  assert.equal(file.read.sheets[0], other, 'andere tabbladen blijven in het open venster beschikbaar');
  assert.deepEqual(sessionSources([{ ...file, busy: true }, { ...file, error: 'mislukt' }]), []);
});

test('Codescan 8: ontbrekend gekozen blad en beschadigde bladnamen worden geweigerd', async () => {
  const state = await example(), file = state.files[0];
  file.read.sheets.push({ ...file.read.sheets[0], name: 'Bijblad' });
  file.read.sheetNames.push('Bijblad');
  const snapshot = sessionSnapshot(state);
  for (const damage of [
    (read) => { read.sheets[0] = null; },
    (read) => { read.sheetNames = ['CSV']; },
    (read) => { read.sheetNames[1] = 99; },
    (read) => { read.sheetNames[0] = 'Verkeerd'; },
    (read) => { read.sheets[1] = {}; },
  ]) {
    const sources = structuredClone(sessionSources(state.files)); damage(sources[0].read);
    assert.throws(() => restoreSession(snapshot, sources), /onvolledig/);
  }
  // Bestaande volledige herstelpunten worden nog gelezen, met dezelfde keuzes en gegevens.
  state.decisions.set('0|2', 'verschillend');
  const legacy = restoreSession(sessionSnapshot(state), [{ id: file.id, read: file.read }]);
  assert.deepEqual(legacy.decisions, state.decisions);
  assert.deepEqual(sessionSources(legacy.files), sessionSources(state.files));
});

test('beoordelingen, ontkoppelen en oorspronkelijke cellen blijven bij herberekenen gelijk', async () => {
  const state = await example();
  const result = decideGroups(state.prep, state.res, state.res.review[0], 'verschillend');
  const unlinked = unlinkGroup(state.prep, result.res, result.res.groupOf(0));
  state.decisions = unlinked.decisions; state.res = unlinked.res;
  state.decisionLog = [...result.log, ...unlinked.log].map((d) => ({ ...d, datum: '2026-10-17T10:00:00Z' }));
  state.strengheid = 'streng'; state.tab = 'leads'; state.search = 'Fabel';
  const restored = roundtrip(state);
  assert.deepEqual(restored.decisions, state.decisions);
  assert.deepEqual(restored.decisionLog, state.decisionLog);
  assert.deepEqual(restored.files, state.files.map((f) => ({ ...f, busy: false })));
  const f = restored.files[0], s = f.read.sheets[f.sheetIndex];
  const prep = await prepare({ sources: [{ name: f.name, ...s, mapping: f.map.mapping }] });
  const res = assemble(prep, restored.decisions, { datum: state.res.datum, strengheid: restored.strengheid });
  assert.deepEqual(res.merged.map((g) => g.memberIdx), state.res.merged.map((g) => g.memberIdx));
  assert.equal(restored.search, 'Fabel');
  assert.equal(restored.tab, 'leads');
  assert.equal(res.datum, state.res.datum);
});

test('uitgesteld paar, kolomkoppeling en onderbroken verwerking zijn herstelbaar', async () => {
  const state = await example();
  state.deferred.add('0|2');
  assert.deepEqual(roundtrip(state).deferred, state.deferred);
  state.screen = 'processing';
  assert.equal(roundtrip(state).screen, 'processing');
  state.screen = 'mapping'; state.files[0].map.mapping[1] = 'negeren';
  assert.equal(roundtrip(state).files[0].map.mapping[1], 'negeren');
});

test('onbekende versie, ontbrekende bronnen en ongeldige keuzes worden niet stil hersteld', async () => {
  const state = await example(), snapshot = sessionSnapshot(state), sources = [{ id: 1, read: state.files[0].read }];
  for (const update of [
    { versie: 99 }, { decisions: [['0|999', 'zelfde']] }, { decisions: [['0|1', 'anders']] },
    { deferred: ['1|0'] }, { decisionLog: [{ i: 0, j: 999, beslissing: 'zelfde', datum: 'nu' }] },
    { screen: 'onbekend' }, { strengheid: 'onbekend' }, { files: [...snapshot.files, snapshot.files[0]] },
  ]) assert.throws(() => restoreSession({ ...snapshot, ...update }, sources), /onvolledig|versie/);
  assert.throws(() => restoreSession(snapshot, []), /onvolledig/);
  const broken = structuredClone(sources); broken[0].read.sheets[0].rows[0][0] = 12;
  assert.throws(() => restoreSession(snapshot, broken), /onvolledig/);
});

test('nog niet ingelezen bestanden en afgeleide resultaten komen niet in het herstelpunt', async () => {
  const state = await example();
  state.files.push({ id: 2, name: 'nog-bezig.csv', busy: true });
  const snapshot = sessionSnapshot(state);
  assert.equal(snapshot.files.length, 1);
  assert.equal(snapshot.prep, undefined);
  assert.equal(snapshot.res, undefined);
  assert.equal(snapshot.files[0].read, undefined);
});

test('Codescan 2: compacte besluiten herstellen en versie 1 behoudt bestaande paarbesluiten', async () => {
  const state = await example();
  const sources = [{ id: 1, read: state.files[0].read }];
  const snapshot = sessionSnapshot(state);
  const legacy = { ...snapshot, versie: 1, decisions: [['0|2', 'verschillend']] };
  assert.deepEqual([...restoreSession(legacy, sources).decisions], legacy.decisions);
  for (const d of [
    { ledenA: [0, 1], ledenB: [2, 3], beslissing: 'zelfde' },
    { ledenA: [0, 1], ledenB: [2, 3], beslissing: 'verschillend' },
    { leden: [0, 1, 2, 3], beslissing: 'ontkoppelen' },
  ]) {
    state.decisions = new Map([['groep:0', d]]);
    assert.deepEqual(roundtrip(state).decisions, state.decisions);
  }
  for (const d of [
    { ledenA: [], ledenB: [2], beslissing: 'zelfde' },
    { ledenA: [0, 0], ledenB: [2], beslissing: 'zelfde' },
    { ledenA: [0, 1], ledenB: [1, 2], beslissing: 'verschillend' },
    { ledenA: [0], ledenB: [999], beslissing: 'verschillend' },
    { leden: [0], beslissing: 'ontkoppelen' },
    { leden: [0, 1, 1], beslissing: 'ontkoppelen' },
    { leden: [0, 999], beslissing: 'ontkoppelen' },
    { leden: [0, 1], beslissing: 'anders' },
  ]) assert.throws(() => restoreSession({ ...snapshot, decisions: [['groep:0', d]] }, sources), /onvolledig/);
});
