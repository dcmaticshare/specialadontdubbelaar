import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, assemble, unlinkGroup, decideGroups } from '../src/engine/pipeline.js';
import { candidatePairs } from '../src/engine/match.js';
import { pairKey, buildGroups } from '../src/engine/cluster.js';
import { source, btw, XLSX, rowsOf } from './helpers/fixtures.mjs';
import { buildResultWorkbook } from '../src/io/write.js';
import { SETTINGS } from '../src/settings.js';
import { invariant } from './helpers/invariants.mjs';

const lijst = (n, nummer = btw(1)) => source('grote-groep.csv', ['Naam', 'BTW', 'Telefoon'],
  Array.from({ length: n }, () => ['Fabelwinkel', nummer, '020001001']));

test('Codescan 2: 1500 leden ontkoppelen bewaart één compact besluit en één logregel', async () => {
  const prep = await prepare({ sources: [lijst(1500)] });
  const res = assemble(prep), apart = unlinkGroup(prep, res, res.merged[0]);
  assert.equal(apart.decisions.size, 1);
  assert.equal(apart.log.length, 1);
  assert.ok(JSON.stringify({ decisions: [...apart.decisions], log: apart.log }).length < 30000);
  assert.equal(apart.res.merged.length, 1500);
  assert.equal(apart.res.blocked.length, 0, 'geen kwadratische lijst geblokkeerde paren');
  assert.equal(apart.res.review.length, 0);
  assert.equal(assemble(prep, apart.decisions).merged.length, 1500);
  assert.equal(decideGroups(prep, apart.res, { i: 0, j: 1499 }, 'zelfde').ok, false);
  buildGroups(prep.records, [], apart.decisions, { compactGroups: prep.compactGroups,
    score: () => assert.fail('ontkoppelde leden worden niet opnieuw paarsgewijs gescoord') });
});

test('Codescan 2: ontkoppeling exporteert alle leden zonder te lange besliscellen', async () => {
  const input = lijst(1500);
  input.name = 'synthetische-grote-groep-met-een-lange-bronnaam.csv';
  const prep = await prepare({ sources: [input] }), res = assemble(prep);
  const apart = unlinkGroup(prep, res, res.merged[0]);
  const wb = buildResultWorkbook(prep, apart.res, { decisionLog: apart.log, datum: res.datum });
  const reopened = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  const rows = rowsOf(reopened, 'Beslissingen').slice(1);
  assert.ok(rows.length < 10, 'lineair in de tekstlengte, geen paarregels');
  assert.equal(rows.flatMap((r) => r[3].split('; ')).length, 1500);
  assert.match(rows.at(-1)[3], /rij 1501/);
  assert.equal(rowsOf(reopened, 'Unieke leads').length, 1501);
});

test('Codescan 2: bovengrens weigert een groepskeuze atomair', async () => {
  const prep = await prepare({ sources: [lijst(4)], settings: { ...SETTINGS, groepsbesluiten: { ...SETTINGS.groepsbesluiten, maxLeden: 3 } } });
  const res = assemble(prep);
  const refused = unlinkGroup(prep, res, res.merged[0]);
  assert.equal(refused.ok, false);
  assert.equal(refused.res, res);
  assert.equal(refused.decisions, res.decisions);
  assert.deepEqual(refused.log, []);
  const split = assemble(prep, new Map([['0|2', 'verschillend']]));
  const choice = decideGroups(prep, split, { i: 0, j: 2 }, 'verschillend');
  assert.equal(choice.ok, false);
  assert.equal(choice.res, split);
  assert.match(choice.error, /Maximaal 3/);
});

test('Codescan 2: grote groepskeuzes blijven compact en gelden voor ieder lid', async () => {
  const a = source('a.csv', ['Naam', 'Telefoon'], Array.from({ length: 750 }, () => ['Fabelwinkel', '020001001']));
  const b = source('b.csv', ['Naam', 'Telefoon'], Array.from({ length: 750 }, () => ['Denkplaats', '030001002']));
  const prep = await prepare({ sources: [a, b] }), res = assemble(prep);
  for (const keuze of ['zelfde', 'verschillend']) {
    const result = decideGroups(prep, res, { i: 0, j: 750 }, keuze);
    assert.equal(result.ok, true);
    assert.equal(result.decisions.size, 1);
    assert.equal(result.log.length, 1);
    assert.ok(JSON.stringify([...result.decisions]).length < 15000);
    assert.equal(result.res.merged.length, keuze === 'zelfde' ? 1 : 2);
    if (keuze === 'zelfde') {
      const apart = unlinkGroup(prep, result.res, result.res.merged[0]);
      assert.equal(apart.res.merged.length, 1500);
      assert.equal(apart.res.review.length, 0, 'ontkoppelen vervangt eerdere samenvoegingen');
    } else {
      assert.equal(decideGroups(prep, result.res, { i: 749, j: 1499 }, 'zelfde').ok, false);
    }
  }
});
for (const n of [399, 400, 401, 2000]) {
  test(`B04: ${n} identieke rijen blijven één bedrijf`, async () => {
    const prep = await prepare({ sources: [lijst(n)] });
    const res = assemble(prep);
    assert.equal(res.merged.length, 1);
    invariant(prep, res);
    if (n > 400) assert.ok(candidatePairs(prep.records, prep.index).pairs.length <= n * 2, 'geen kwadratische parenlijst');
  });
}

test('B04: een gelijk geldig BTW-nummer werkt ook bij totaal andere namen', async () => {
  const input = lijst(401);
  input.rows.forEach((r, i) => { r[0] = `Verzinsel${i}`; r[2] = ''; });
  const prep = await prepare({ sources: [input] });
  assert.equal(assemble(prep).merged.length, 1);
});

for (const field of ['Telefoon', 'E-mail', 'Website', 'Adres']) {
  test(`B04: 401 exacte namen met gedeeld ${field}, zonder BTW`, async () => {
    const value = { Telefoon: '020001001', 'E-mail': 'info@fabel.invalid', Website: 'fabel.invalid', Adres: 'Teststraat 42' }[field];
    const prep = await prepare({ sources: [source('exact.csv', ['Naam', field, 'Opmerking'], Array.from({ length: 401 }, (_, i) => ['Fabelwinkel', value, `Notitie ${i}`]))] });
    assert.equal(assemble(prep).merged.length, 1);
    invariant(prep, assemble(prep));
  });
}

for (const reverse of [false, true]) {
  test(`B04/B01: uitgesloten vertegenwoordiger laat de overige 400 dubbels samenkomen (${reverse})`, async () => {
    const input = lijst(401);
    input.header.push('Opmerking');
    input.rows.forEach((r, i) => r.push(i === 0 ? 'anker' : `rij-${i}`));
    if (reverse) input.rows.reverse();
    const anchor = input.rows.findIndex((r) => r[3] === 'anker');
    const prep = await prepare({ sources: [input] });
    const d = new Map(input.rows.map((_, i) => i).filter((i) => i !== anchor).map((i) => [pairKey(anchor, i), 'verschillend']));
    const res = assemble(prep, d);
    assert.deepEqual(res.groups.map((g) => g.members.length).sort((a, b) => a - b), [1, 400]);
    invariant(prep, res, d);
    assert.equal(res.review.length, 0);
  });
}

test('B04: sterk gedeelde algemene signalen koppelen geen verschillende BTW-nummers', async () => {
  const rows = Array.from({ length: 900 }, (_, i) => ['Fabelwinkel', i < 450 ? btw(1) : btw(2), '020001001']);
  const prep = await prepare({ sources: [source('twee.csv', ['Naam', 'BTW', 'Telefoon'], rows)] });
  const res = assemble(prep);
  assert.deepEqual(res.groups.map((g) => g.members.length), [450, 450]);
  invariant(prep, res);
});

test('B04: algemeen domein en ongeldig BTW-nummer worden geen sterke identificatoren', async () => {
  const prep = await prepare({ sources: [source('algemeen.csv', ['Naam', 'BTW', 'Website'], Array.from({ length: 401 }, (_, i) => [`Fictieve naam ${i}`, '0123456700', 'gedeeld.invalid']))] });
  assert.equal(assemble(prep).merged.length, 401);
  assert.ok(prep.skipped.length > 0);
});

test('B04/B01: een grote groep blijft na ontkoppelen apart', async () => {
  const prep = await prepare({ sources: [lijst(401)] });
  const res = assemble(prep);
  assert.equal(res.merged.length, 1);
  const apart = unlinkGroup(prep, res, res.merged[0]);
  assert.equal(apart.res.merged.length, 401);
  invariant(prep, apart.res, apart.decisions);
});

test('B04: veel verschillende geldige BTW-nummers bij één exact telefoon/naamsignaal blijven apart', async () => {
  const prep = await prepare({ sources: [source('gedeeld.csv', ['Naam', 'BTW', 'Telefoon'], Array.from({ length: 1000 }, (_, i) => ['Fabelwinkel', btw(i + 1), '020001001']))] });
  const res = assemble(prep);
  assert.equal(res.merged.length, 1000);
  assert.ok(prep.candidates.length <= 1000, 'ook BTW-conflicten veroorzaken geen volledige parenlijst');
  invariant(prep, res);
});
