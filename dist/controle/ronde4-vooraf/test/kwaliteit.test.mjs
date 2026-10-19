import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { source } from './helpers/fixtures.mjs';

async function api() {
  assert.ok(existsSync(new URL('../tools/quality.mjs', import.meta.url)), 'één gedeelde evaluator voor CLI en tests ontbreekt');
  return import('../tools/quality.mjs');
}
const disjoint = () => source('bron.csv', ['Naam', 'Telefoon', 'Adres'], [['Fabelwinkel', '020001001', 'Teststraat 42'], ['Denkplaats', '030001002', 'Verzinselweg 17']]);
async function fixture(input = disjoint(), pairs = [[0, 1]], labels = ['zelfde']) {
  const q = await api();
  const prep = await prepare({ sources: [input] });
  const manifest = q.createManifest(prep, { pairs });
  const judgments = manifest.pairs.map((p, i) => ({ dataset: manifest.id, pair: p.id, a: p.a, b: p.b, label: labels[i] }));
  return { q, prep, manifest, judgments };
}

test('B05: bestaand paar buiten kandidaatselectie telt als gemist, niet als verdwenen rij', async () => {
  const f = await fixture();
  const r = f.q.evaluateQuality(f);
  assert.equal(r.ok, false);
  assert.equal(r.counts.recordsVerwacht, 2);
  assert.equal(r.counts.recordsGevonden, 2);
  assert.equal(r.counts.verwacht, 1);
  assert.equal(r.counts.gecontroleerd, 1);
  assert.equal(r.metrics.gemisteKandidaten, 1);
  assert.equal(r.metrics.gemisteDubbels, 1);
  assert.equal(r.pairs[0].candidate, false);
});

test('B05: fouten door transitieve groepen tellen ook als de eindpunten niet zeker dubbel scoren', async () => {
  const input = source('keten.csv', ['Naam', 'Telefoon'], [['Fabelwinkel', '020001001'], ['Fabelwinkel', '020001001;030001002'], ['Fabelwinkel', '030001002']]);
  const f = await fixture(input, [[0, 2]], ['verschillend']);
  const r = f.q.evaluateQuality(f);
  assert.equal(r.ok, false);
  assert.equal(r.metrics.fouteSamenvoegingen, 1);
  assert.equal(r.metrics.foutePaarscores, 0, 'de fout zit hier in de uiteindelijke groep');
});

for (const kind of ['leeg', 'ongeldig label', 'ontbrekend paar', 'dubbel paar', 'vreemde record-ID', 'verkeerde dataset', 'omgewisselde rij', 'extra paar']) {
  test(`B05: ${kind} wordt expliciet afgewezen`, async () => {
    const f = await fixture();
    if (kind === 'leeg') f.judgments[0].label = '';
    if (kind === 'ongeldig label') f.judgments[0].label = 'ja';
    if (kind === 'ontbrekend paar') f.judgments = [];
    if (kind === 'dubbel paar') f.judgments.push({ ...f.judgments[0] });
    if (kind === 'vreemde record-ID') f.judgments[0].a = 'ONBEKEND';
    if (kind === 'verkeerde dataset') f.judgments[0].dataset = 'andere-dataset';
    if (kind === 'omgewisselde rij') f.judgments[0].b = f.judgments[0].a;
    if (kind === 'extra paar') f.judgments.push({ ...f.judgments[0], pair: 'EXTRA' });
    const r = f.q.evaluateQuality(f);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0, 'ongeldige invoer wordt afzonderlijk gemeld');
  });
}

test('B05: verdwenen en veranderde bronrijen zijn datasetfouten', async () => {
  const f = await fixture();
  f.prep = await prepare({ sources: [source('bron.csv', disjoint().header, [disjoint().rows[0]])] });
  let r = f.q.evaluateQuality(f);
  assert.equal(r.ok, false);
  assert.equal(r.counts.recordsGevonden, 1);
  assert.match(r.errors.join(' '), /ontbreekt/);
  const changed = disjoint(); changed.rows[0][2] = 'Ander adres 1';
  f.prep = await prepare({ sources: [changed] });
  r = f.q.evaluateQuality(f);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /gewijzigd/);
});

test('B05: dubbele inhoud behoudt verschillende test-ID’s en bronvolgorde verandert geen identiteit', async () => {
  const q = await api();
  const a = source('a.csv', ['Naam', 'BTW'], [['Fabelwinkel', '0123456749'], ['Fabelwinkel', '0123456749']]);
  const b = source('b.csv', ['Naam', 'BTW'], [['Denkplaats', '0123456848']]);
  const prep = await prepare({ sources: [a, b] });
  const manifest = q.createManifest(prep, { pairs: [[0, 1], [0, 2]] });
  assert.equal(new Set(manifest.records.map((r) => r.id)).size, 3);
  const judgments = manifest.pairs.map((p, i) => ({ dataset: manifest.id, pair: p.id, a: p.a, b: p.b, label: i === 0 ? 'zelfde' : 'verschillend' }));
  assert.equal(q.evaluateQuality({ prep: await prepare({ sources: [b, a] }), manifest, judgments }).ok, true);
});

test('B05: lege of vervalste manifesten worden niet groen', async () => {
  const f = await fixture();
  for (const manifest of [{}, { ...f.manifest, pairs: [] }, { ...f.manifest, records: [] }, { ...f.manifest, limits: { gemisteDubbels: -1 } }]) {
    const r = f.q.evaluateQuality({ ...f, manifest });
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
  }
});

test('B05: tegenstrijdige grondwaarheid wordt afgewezen', async () => {
  const input = source('bron.csv', ['Naam', 'Telefoon'], [['A', '020001001'], ['B', '030001002'], ['C', '040001003']]);
  const f = await fixture(input, [[0, 1], [1, 2], [0, 2]], ['zelfde', 'zelfde', 'verschillend']);
  const r = f.q.evaluateQuality(f);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /tegenstrijdig/);
});

test('B05: kandidaatselectie, paarscores en eindgroepen worden afzonderlijk bewaakt', async () => {
  const input = source('bron.csv', ['Naam', 'Telefoon'], [['Fabelwinkel', '020001001'], ['Fabelwinkel', '020001001']]);
  const f = await fixture(input);
  assert.equal(f.q.evaluateQuality(f).ok, true);
  const missing = { ...f.prep, candidates: [], compactGroups: [], scored: [] };
  const r = f.q.evaluateQuality({ ...f, prep: missing });
  assert.equal(r.ok, false);
  assert.equal(r.metrics.gemisteKandidaten, 1);
  assert.equal(r.metrics.gemisteDubbels, 1);
  const split = assemble(f.prep, new Map([['0|1', 'verschillend']]));
  const groupError = f.q.evaluateQuality({ ...f, result: split });
  assert.equal(groupError.metrics.gemisteKandidaten, 0);
  assert.equal(groupError.metrics.gemisteDubbels, 1);
});

test('B05: ontbrekende directe verbinding binnen een compacte groep is geen gemiste kandidaat', async () => {
  const input = source('bron.csv', ['Naam', 'BTW'], Array.from({ length: 401 }, () => ['Fabelwinkel', '0123456749']));
  const f = await fixture(input, [[399, 400]]);
  const r = f.q.evaluateQuality(f);
  assert.equal(r.ok, true);
  assert.equal(r.pairs[0].candidate, true);
  assert.equal(r.pairs[0].candidateKind, 'compact');
});

test('B05: samen te beoordelen paar is geen gemiste dubbel, maar blijft zichtbaar als werk', async () => {
  const f = await fixture(source('bron.csv', ['Naam', 'Telefoon'], [['Fabelwinkel', '020001001'], ['Fabelwinkel', '030001002']]));
  const r = f.q.evaluateQuality(f);
  assert.equal(r.ok, true);
  assert.equal(r.metrics.controleZelfde, 1);
  assert.equal(r.metrics.gemisteDubbels, 0);
  assert.equal(r.metrics.nietSamengevoegd, 1);
});

test('B05: versiebeheerde synthetische kwaliteitsset heeft nul fouten', async () => {
  const { readFileSync } = await import('node:fs');
  const { processDir } = await import('../tools/lib.mjs');
  const q = await api();
  const dir = 'test/fixtures/kwaliteit';
  const { prep } = await processDir(dir);
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const judgments = JSON.parse(readFileSync(`${dir}/beoordelingen.json`, 'utf8'));
  const report = q.evaluateQuality({ prep, manifest, judgments });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.counts.gecontroleerd, 10);
  assert.equal(report.counts.zelfde, 2);
  assert.equal(report.counts.verschillend, 8);
});

test('B05: expliciete foutgrenzen worden toegepast en blijven in het manifest vastgelegd', async () => {
  const f = await fixture();
  const limits = { ...f.manifest.limits, gemisteDubbels: 1, gemisteKandidaten: 1 };
  const manifest = f.q.createManifest(f.prep, { pairs: [[0, 1]], limits });
  assert.notEqual(manifest.id, f.manifest.id, 'een andere grens krijgt een andere manifestcontrole');
  const judgments = [{ ...f.judgments[0], dataset: manifest.id }];
  const accepted = f.q.evaluateQuality({ ...f, manifest, judgments });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.metrics.gemisteDubbels, 1, 'een toegelaten gemis blijft zichtbaar');
  assert.equal(f.q.evaluateQuality(f).ok, false, 'de standaardgrens blijft nul');
});

test('B05: ook een foute zekere paarscore wordt afgekeurd wanneer groepen apart blijven', async () => {
  const f = await fixture(disjoint(), [[0, 1]], ['verschillend']);
  const evidence = { i: 0, j: 1, score: 100, nameSim: 1, btwEqual: false, btwConflict: false, decision: 'zeker', reason: 'bewuste scorefout', matched: { telefoon: [], email: [], domein: [] } };
  const prep = { ...f.prep, candidates: [[0, 1]], scored: [evidence] };
  const result = assemble(prep, new Map([['0|1', 'verschillend']]));
  const report = f.q.evaluateQuality({ ...f, prep, result });
  assert.equal(report.metrics.fouteSamenvoegingen, 0);
  assert.equal(report.metrics.foutePaarscores, 1);
  assert.equal(report.ok, false);
});

test('B05: de private rooktest kan een correcte paarscore in een verkeerde groep niet goedkeuren', async () => {
  const q = await api();
  const prep = await prepare({ sources: [source('keten.csv', ['Naam', 'Telefoon'], [['Fabelwinkel', '020001001'], ['Fabelwinkel', '020001001;030001002'], ['Fabelwinkel', '030001002']])] });
  assert.equal(q.checkKnownCase(prep, assemble(prep), [0], [2], 'controleren').ok, false);
});
