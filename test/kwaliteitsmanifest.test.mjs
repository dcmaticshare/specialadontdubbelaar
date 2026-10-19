import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepare } from '../src/engine/pipeline.js';
import { source, XLSX, reopen } from './helpers/fixtures.mjs';
import { processDir } from '../tools/lib.mjs';
import { createManifest, evaluateQuality, buildAssessmentWorkbook, readAssessment } from '../tools/quality.mjs';

const input = () => source('synthetisch.csv', ['Naam', 'E-mail'], [
  ['Fabelwinkel', 'info@fabelwinkel.invalid'], ['Denkplaats', 'info@denkplaats.invalid'],
]);
const judgmentsFor = (manifest) => manifest.pairs.map((p) => ({ dataset: manifest.id, pair: p.id, a: p.a, b: p.b, label: 'verschillend' }));
async function legacyFixture() {
  const dir = 'test/fixtures/kwaliteit';
  const { prep } = await processDir(dir);
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const judgments = JSON.parse(readFileSync(`${dir}/beoordelingen.json`, 'utf8'));
  assert.equal(manifest.format, 1, 'de bestaande fixture blijft het oorspronkelijke formaat bewaken');
  return { prep, manifest, judgments };
}

test('Codescan 15: nieuwe manifesten hebben formaat 2 zonder afgeleide detectievelden', async () => {
  const prep = await prepare({ sources: [input()] });
  const manifest = createManifest(prep, { pairs: [[0, 1]] });
  assert.equal(manifest.format, 2);
  assert.equal(Object.hasOwn(manifest.sources[0], 'nearConstant'), false);
  for (const nearConstant of [[true, true], [false, false], [], undefined]) {
    const changed = await prepare({ sources: [{ ...input(), nearConstant }] });
    assert.deepEqual(createManifest(changed, { pairs: [[0, 1]] }), manifest);
    assert.equal(evaluateQuality({ prep: changed, manifest, judgments: judgmentsFor(manifest) }).ok, true);
  }
});

test('Codescan 15: bestaand manifest en alle labels blijven geldig bij andere detectie', async () => {
  const f = await legacyFixture();
  const before = JSON.stringify({ manifest: f.manifest, judgments: f.judgments });
  f.prep.sources.forEach((s) => { s.nearConstant = s.header.map(() => true); });
  const report = evaluateQuality(f);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.deepEqual(report.pairs.map((p) => [p.pair, p.a, p.b, p.label]), f.judgments.map((p) => [p.pair, p.a, p.b, p.label]));
  assert.equal(report.counts.zelfde, 2);
  assert.equal(report.counts.verschillend, 8);
  assert.equal(JSON.stringify({ manifest: f.manifest, judgments: f.judgments }), before);
});

test('Codescan 15: bronwaarden, koppelingen en bronlocaties blijven strikt bewaakt in beide formaten', async () => {
  const f = await legacyFixture();
  const indices = f.prep.records.map((_, i) => i);
  // Alle paren van deze vijf synthetische records hebben onafhankelijke labels in de vaste fixture.
  const modern = createManifest(f.prep, { pairs: indices.flatMap((i) => indices.slice(i + 1).map((j) => [i, j])) });
  for (const manifest of [f.manifest, modern]) {
    const judgments = f.judgments.map((j) => ({ ...j, dataset: manifest.id }));
    for (const change of [
      (s) => { s.rows[0][0] += ' gewijzigd'; },
      (s) => { s.header[0] += ' gewijzigd'; },
      (s) => { s.mapping[0] = 'negeren'; },
      (s) => { s.name = 'andere-bron.csv'; },
      (s) => { s.sheetName = 'ander-blad'; },
      (s) => { s.rowNumbers[0] += 100; },
      (s) => { s.rows.reverse(); },
    ]) {
      const sources = structuredClone(f.prep.sources);
      change(sources[0]);
      const report = evaluateQuality({ prep: await prepare({ sources }), manifest, judgments });
      assert.equal(report.ok, false);
      assert.ok(report.errors.length, 'de wijziging moet een datasetfout geven');
    }
  }
});

test('Codescan 15: legacy-controlesommen en onbekende formaten blijven gecontroleerd', async () => {
  const f = await legacyFixture();
  for (const change of [
    (m) => { m.sources[0].nearConstant = ['vervalst']; },
    (m) => { m.dataset = 'vervalst'; },
    (m) => { m.format = 999; },
  ]) {
    const manifest = structuredClone(f.manifest); change(manifest);
    const report = evaluateQuality({ ...f, manifest });
    assert.equal(report.ok, false);
    assert.ok(report.errors.length);
  }
});

test('Codescan 15: bestaande XLSX-labels en toelichtingen hoeven niet herschreven te worden', async () => {
  const f = await legacyFixture();
  const wb = reopen(buildAssessmentWorkbook(f.prep, f.manifest));
  f.judgments.forEach((j, i) => { wb.Sheets.Paren[`E${i + 2}`] = { t: 's', v: j.label }; });
  XLSX.utils.sheet_add_aoa(wb.Sheets.Paren, [['Toelichting'], ['Zelfstandig nagekeken; behouden.']], { origin: 'T1' });
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const original = Buffer.from(bytes);
  const judgments = await readAssessment(bytes);
  f.prep.sources.forEach((s) => { delete s.nearConstant; });
  const report = evaluateQuality({ ...f, judgments });
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.deepEqual(judgments, f.judgments);
  assert.deepEqual(Buffer.from(bytes), original);
  assert.equal(XLSX.read(bytes, { type: 'buffer' }).Sheets.Paren.T2.v, 'Zelfstandig nagekeken; behouden.');
});
