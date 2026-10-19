import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS } from '../src/settings.js';
import { decidePair, grenzenVoor, strengheidNiveau, laagsteGrens } from '../src/engine/match.js';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { pairKey } from '../src/engine/cluster.js';

import { source } from './helpers/fixtures.mjs';

test('niveaus: gemiddeld is de standaard en gebruikt de algemene grenzen', () => {
  assert.equal(strengheidNiveau(SETTINGS).key, 'gemiddeld');
  assert.equal(strengheidNiveau(SETTINGS, 'bestaat niet').key, 'gemiddeld');
  assert.deepEqual(grenzenVoor(SETTINGS, 'gemiddeld'), SETTINGS.grenzen);
  const streng = grenzenVoor(SETTINGS, 'streng'), mild = grenzenVoor(SETTINGS, 'mild');
  assert.ok(streng.teControleren < SETTINGS.grenzen.teControleren && SETTINGS.grenzen.teControleren < mild.teControleren);
  assert.equal(streng.zekerDubbel, mild.zekerDubbel, 'automatisch samenvoegen verandert niet mee');
  assert.equal(laagsteGrens(SETTINGS), streng.teControleren);
});

test('beslissing per niveau: alleen de ondergrens schuift, BTW beslist altijd', () => {
  const paar = (score, nameSim = 0.2) => ({ score, nameSim, btwEqual: false, btwConflict: false });
  assert.equal(decidePair(paar(45), grenzenVoor(SETTINGS, 'streng')), 'controleren', 'telefoon alleen');
  assert.equal(decidePair(paar(45), grenzenVoor(SETTINGS, 'gemiddeld')), 'uniek');
  assert.equal(decidePair(paar(60), grenzenVoor(SETTINGS, 'gemiddeld')), 'controleren');
  assert.equal(decidePair(paar(60), grenzenVoor(SETTINGS, 'mild')), 'uniek');
  assert.equal(decidePair(paar(75), grenzenVoor(SETTINGS, 'mild')), 'controleren', 'twee sterke gegevens');
  for (const k of ['streng', 'gemiddeld', 'mild']) {
    const g = grenzenVoor(SETTINGS, k);
    assert.equal(decidePair(paar(95, 0.8), g), 'zeker');
    assert.equal(decidePair(paar(95, 0.4), g), 'controleren', 'veel punten, weinig gelijkende naam');
    assert.equal(decidePair({ score: 30, nameSim: 0, btwEqual: true, btwConflict: false }, g), 'zeker');
    assert.equal(decidePair({ score: 120, nameSim: 1, btwEqual: false, btwConflict: true }, g), 'uniek');
  }
});

const lijst = source('lijst.csv', ['Naam', 'Telefoon', 'Adres'], [
  ['Alfa Consult', '09 111 11 11', 'Dorp 1'],
  ['Zeta Bouw', '09 111 11 11', 'Markt 9'], // alleen hetzelfde nummer: 45 punten
  ['Bakkerij Vermeulen', '09 222 22 22', 'Kerkstraat 5'],
  ['Vermeulen Patisserie', '09 333 33 33', 'Kerkstraat 5'], // zelfde adres + naam lijkt deels: tussen 55 en 70
  ['Fabelia', '0400 00 10 01', 'Fabelgemsesteenweg 1004'],
  ['Fabelia BV', '+32 400 00 10 01', 'Fabelgemsesteenweg 1004'], // zeker dubbel
]);
const naam = (prep, p) => [prep.records[p.i].fields.bedrijfsnaam, prep.records[p.j].fields.bedrijfsnaam].sort().join('|');
const paarVan = (prep, a, b) => prep.scored.find((p) => naam(prep, p) === [a, b].sort().join('|'));

test('verwerking: streng toont meer twijfelparen, mild minder; samenvoegingen blijven gelijk', async () => {
  const prep = await prepare({ sources: [lijst] });
  assert.equal(paarVan(prep, 'Alfa Consult', 'Zeta Bouw').score, 45);
  const adres = paarVan(prep, 'Bakkerij Vermeulen', 'Vermeulen Patisserie');
  assert.ok(adres.score >= 55 && adres.score < 70, `score ${adres.score}`);
  const streng = assemble(prep, new Map(), { strengheid: 'streng' });
  const gemiddeld = assemble(prep, new Map());
  const mild = assemble(prep, new Map(), { strengheid: 'mild' });
  assert.equal(gemiddeld.strengheid.key, 'gemiddeld');
  assert.equal(mild.strengheid.grenzen.teControleren, 70);
  assert.equal(streng.summary.teControleren, 2);
  assert.equal(gemiddeld.summary.teControleren, 1);
  assert.equal(mild.summary.teControleren, 0);
  for (const r of [streng, gemiddeld, mild]) { assert.equal(r.summary.automatischSamengevoegd, 1); assert.equal(r.summary.uniekeLeads, 5); }
  assert.deepEqual(gemiddeld.perStrengheid.map((s) => [s.key, s.aantal]), [['streng', 2], ['gemiddeld', 1], ['mild', 0]]);
  assert.deepEqual(mild.perStrengheid.map((s) => s.aantal), [2, 1, 0], 'de telling per niveau hangt niet af van de gekozen stand');
  const alfa = mild.merged.find((m) => m.bedrijfsnaam === 'Alfa Consult');
  assert.equal(alfa.mogelijkDubbel.length, 0, 'bij mild geen "Mogelijk dubbel met" voor een paar met alleen een telefoon');
  assert.equal(alfa.deeltTelefoonMet.length, 1);
});

test('een beslissing blijft gelden na een andere strengheid', async () => {
  const prep = await prepare({ sources: [lijst] });
  const streng = assemble(prep, new Map(), { strengheid: 'streng' });
  const p = streng.review.find((x) => x.score === 45);
  const d = new Map([[pairKey(p.i, p.j), 'zelfde']]);
  const mild = assemble(prep, d, { strengheid: 'mild' });
  assert.equal(mild.summary.samengevoegdDoorMens, 1);
  assert.equal(mild.summary.uniekeLeads, 4);
  assert.deepEqual(mild.perStrengheid.map((s) => s.aantal), [1, 1, 0]);
});
