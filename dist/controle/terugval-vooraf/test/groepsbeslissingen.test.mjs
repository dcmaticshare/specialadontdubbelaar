import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { pairKey } from '../src/engine/cluster.js';
import * as pipeline from '../src/engine/pipeline.js';
import { source, btw, permutations } from './helpers/fixtures.mjs';
import { invariant } from './helpers/invariants.mjs';

for (const order of permutations(['A', 'B', 'C'])) {
  test(`B01: driehoek respecteert A–B verschillend, uploadvolgorde ${order}`, async () => {
    const prep = await prepare({ sources: order.map((id) => source(`${id}.csv`, ['Naam', 'Telefoon', 'Adres'], [['Fabelwinkel', '020001001', 'Teststraat 42']])) });
    const a = order.indexOf('A'), b = order.indexOf('B');
    const decisions = new Map([[pairKey(a, b), 'verschillend']]);
    const res = assemble(prep, decisions);
    invariant(prep, res, decisions);
    assert.equal(res.merged.length, 2);
    assert.equal(res.review.length, 0, 'een beoordeelde scheiding komt niet via een ander bronpaar terug');
  });
}

test('B01: uitsluiting buiten de kandidaatparen blokkeert ook een keten', async () => {
  const prep = await prepare({ sources: [source('keten.csv', ['Naam', 'Telefoon'], [
    ['Fabelwinkel', '020001001'], ['Fabelwinkel', '020001001; 030001002'], ['Fabelwinkel', '030001002'],
  ])] });
  prep.scored = prep.scored.filter((p) => pairKey(p.i, p.j) !== '0|2');
  const decisions = new Map([['0|2', 'verschillend']]);
  const res = assemble(prep, decisions);
  invariant(prep, res, decisions);
  assert.equal(res.merged.length, 2);
});

test('B06: onuitvoerbare handmatige samenvoeging blijft als conflict in controlelijst', async () => {
  const prep = await prepare({ sources: [source('keten.csv', ['Naam', 'Telefoon', 'BTW'], [
    ['Fabelwinkel', '020001001', btw(1)], ['Fabelwinkel', '020001001; 030001002', ''], ['Fabelwinkel', '030001002', btw(2)],
  ])] });
  const decisions = new Map([['0|1', 'zelfde'], ['1|2', 'zelfde']]);
  const res = assemble(prep, decisions);
  invariant(prep, res, decisions);
  assert.equal(res.merged.length, 2);
  assert.equal(res.review.length, 1);
  assert.match(res.review[0].geblokkeerd, /BTW/);
});

test('B01: tegenstrijdige handmatige keten verbergt geen conflict', async () => {
  const prep = await prepare({ sources: [source('driehoek.csv', ['Naam', 'Telefoon'], Array.from({ length: 3 }, () => ['Fabelwinkel', '020001001']))] });
  const decisions = new Map([['0|1', 'verschillend'], ['0|2', 'zelfde'], ['1|2', 'zelfde']]);
  const res = assemble(prep, decisions);
  invariant(prep, res, decisions);
  assert.equal(res.review.length, 1);
  assert.match(res.review[0].geblokkeerd, /verschillend/);
});

test('B01: besluit geldt voor alle leden van de twee getoonde groepen, ook zonder paarscore', async () => {
  assert.equal(typeof pipeline.decideGroups, 'function', 'groepsbeslissing moet buiten de DOM testbaar zijn');
  const prep = await prepare({ sources: [source('groepen.csv', ['Naam', 'Telefoon'], [
    ['Fabelwinkel', '020001001'], ['Fabelwinkel', '020001001'], ['Denkplaats', '030001002'], ['Denkplaats', '030001002'],
  ])] });
  const res = assemble(prep);
  const result = pipeline.decideGroups(prep, res, { i: 0, j: 2 }, 'zelfde');
  assert.equal(result.ok, true);
  assert.equal(result.res.merged.length, 1);
  assert.deepEqual([...result.decisions.keys()].sort(), ['0|2', '0|3', '1|2', '1|3']);
  const apart = pipeline.decideGroups(prep, res, { i: 0, j: 2 }, 'verschillend');
  assert.equal(apart.decisions.size, 4);
  invariant(prep, apart.res, apart.decisions);
});

test('B06: schermbesluit wordt atomair geweigerd bij BTW-conflict, zonder succeslog', async () => {
  assert.equal(typeof pipeline.decideGroups, 'function');
  const prep = await prepare({ sources: [source('groepen.csv', ['Naam', 'Telefoon', 'BTW'], [
    ['Fabelwinkel', '020001001', btw(1)], ['Fabelwinkel', '020001001; 030001002', ''], ['Fabelwinkel', '030001002', btw(2)],
  ])] });
  const res = assemble(prep);
  const result = pipeline.decideGroups(prep, res, res.review[0], 'zelfde');
  assert.equal(result.ok, false);
  assert.match(result.error, /BTW/);
  assert.equal(result.res, res);
  assert.equal(result.decisions.size, 0);
  assert.deepEqual(result.log, []);
  assert.equal(result.res.review.length, 1);
});

test('B01: ontkoppelen houdt alle groepsleden apart, ook na opnieuw beoordelen via een derde', async () => {
  assert.equal(typeof pipeline.unlinkGroup, 'function');
  const prep = await prepare({ sources: [source('driehoek.csv', ['Naam', 'Telefoon'], Array.from({ length: 3 }, () => ['Fabelwinkel', '020001001']))] });
  const res = assemble(prep);
  const apart = pipeline.unlinkGroup(prep, res, res.merged[0]);
  assert.equal(apart.res.merged.length, 3);
  assert.equal(apart.decisions.size, 3);
  invariant(prep, apart.res, apart.decisions);
  const retry = pipeline.decideGroups(prep, apart.res, { i: 0, j: 2 }, 'zelfde');
  assert.equal(retry.ok, false);
  assert.match(retry.error, /verschillend/);
});

test('invarianten: 40 vaste seeds met ketens, BTW-conflicten en menselijke uitsluitingen', async () => {
  const { random } = await import('./helpers/fixtures.mjs');
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed);
    const rows = Array.from({ length: 12 }, () => ['Fabelwinkel', `02000100${1 + next(4)}`, next(3) === 0 ? btw(1 + next(2)) : '']);
    const prep = await prepare({ sources: [source(`seed-${seed}.csv`, ['Naam', 'Telefoon', 'BTW'], rows)] });
    const decisions = new Map();
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (next(7) === 0) decisions.set(pairKey(i, j), 'verschillend');
    for (const strengheid of ['streng', 'gemiddeld', 'mild']) invariant(prep, assemble(prep, decisions, { strengheid }), decisions);
  }
});
