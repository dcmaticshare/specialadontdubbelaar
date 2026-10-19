import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRecord } from '../src/engine/records.js';
import { buildIndex, candidatePairs, scorePair, nameSimilarity } from '../src/engine/match.js';
import { buildGroups, reviewPairs, mergeGroup, pairKey } from '../src/engine/cluster.js';
import { normalizeName } from '../src/engine/normalize.js';

let counter = 0;
const rec = (fields, meta = {}) => makeRecord({ idx: counter, source: meta.source ?? 0, sourceName: meta.sourceName ?? 'test', row: counter++ + 2, raw: {}, postcodeUsable: meta.postcodeUsable }, fields);

function setup(list) {
  counter = 0;
  const records = list.map((x) => (Array.isArray(x) ? rec(x[0], x[1]) : rec(x)));
  const index = buildIndex(records);
  return { records, index };
}

// achtergrondrijen zodat woorden als "voorbeeldstad" en "advocaat" licht wegen
const filler = Array.from({ length: 12 }, (_, i) => ({ bedrijfsnaam: `Advocaat Voorbeeldstad ${i} Vermeulen${i}`, telefoon: [`0497 00 00 ${String(10 + i)}`] }));

test('Fabelia (Bizzy) en Fabelia Hair & Beauty Boutique (Braintoss): zeker dubbel', () => {
  const { records, index } = setup([
    ...filler,
    { bedrijfsnaam: 'Fabelia', email: ['contact@fabelia.invalid'], telefoon: ['+32 400 00 10 01'], website: 'https://fabelia.invalid', btw: 'BE0123.456.749', straat: 'Fabelgemsesteenweg', huisnummer: '1004', postcode: '9820' },
    { bedrijfsnaam: 'Fabelia Hair & Beauty Boutique', telefoon: ['0400 00 10 01'], website: 'www.fabelia.invalid', adres: 'Fabelgemsesteenweg 1004-1006', postcode: '9820' },
  ]);
  const s = scorePair(records[12], records[13], index);
  assert.equal(s.decision, 'zeker', s.reason);
  assert.ok(s.reasons.includes('zelfde gsm'));
  assert.ok(s.reasons.includes('zelfde domein'));
  assert.ok(s.reasons.includes('zelfde adres'));
  assert.ok(s.nameSim >= 0.6);
});
test("Kokk's en Traiteur Kokk's: zeker dubbel", () => {
  const { records, index } = setup([
    ...filler,
    { bedrijfsnaam: "Kokk's", telefoon: ['09 362 00 11'], adres: 'Kerkstraat 5' },
    { bedrijfsnaam: 'Traiteur Kokk’s', telefoon: ['+32 9 362 00 11'], adres: 'Kerkstraat 5' },
  ]);
  const s = scorePair(records[12], records[13], index);
  assert.equal(s.decision, 'zeker', s.reason);
});
test('Padel Zyvo en Tennisbesnaringen Zyvo: te controleren', () => {
  const { records, index } = setup([
    ...filler,
    { bedrijfsnaam: 'Padel Zyvo', telefoon: ['0475 11 22 33'] },
    { bedrijfsnaam: 'Tennisbesnaringen Zyvo', telefoon: ['0475 11 22 33'] },
  ]);
  const s = scorePair(records[12], records[13], index);
  assert.equal(s.decision, 'controleren', s.reason);
});
test('Vriesloods en Zonneloods: te controleren', () => {
  const { records, index } = setup([
    ...filler,
    { bedrijfsnaam: 'Vriesloods', telefoon: ['0475 11 22 44'], adres: 'Loodsstraat 1' },
    { bedrijfsnaam: 'Zonneloods', telefoon: ['0475 11 22 44'], adres: 'Loodsstraat 1' },
  ]);
  const s = scorePair(records[12], records[13], index);
  assert.equal(s.decision, 'controleren', s.reason);
  assert.ok(s.nameSim < 0.6, `naamgelijkenis ${s.nameSim}`);
});
test('Fictara en Denkora: zelfde nummer, ander BTW-nummer: uniek', () => {
  const { records, index } = setup([
    ...filler,
    { bedrijfsnaam: 'Fictara', telefoon: ['09 123 45 67'], btw: 'BE0123.456.749', adres: 'Dorp 1' },
    { bedrijfsnaam: 'Denkora', telefoon: ['09 123 45 67'], btw: 'BE0123.456.848', adres: 'Dorp 1' },
  ]);
  const s = scorePair(records[12], records[13], index);
  assert.equal(s.decision, 'uniek', s.reason);
  assert.ok(s.btwConflict);
  assert.ok(s.reasons[0].includes('verschillend BTW'));
});
test('Wolkora, De Testbouwers en Verzin Distillery delen een centraal nummer: niet samengevoegd', () => {
  const { records, index } = setup([
    ...filler,
    { bedrijfsnaam: 'Wolkora', telefoon: ['09 999 88 77'] },
    { bedrijfsnaam: 'De Testbouwers', telefoon: ['09 999 88 77'] },
    { bedrijfsnaam: 'Verzin Distillery', telefoon: ['09 999 88 77'] },
  ]);
  assert.ok(index.hubPhones.has('+3299998877'));
  const s = scorePair(records[12], records[13], index);
  assert.equal(s.decision, 'uniek', s.reason);
  assert.ok(s.reason.includes('centraal nummer'));
});
test('zelfde BTW-nummer beslist altijd', () => {
  const { records, index } = setup([
    { bedrijfsnaam: 'Alfa Consult', btw: 'BE0123.456.749' },
    { bedrijfsnaam: 'Beta Services', btw: '0123 456 749' },
  ]);
  const s = scorePair(records[0], records[1], index);
  assert.equal(s.decision, 'zeker');
  assert.equal(s.reasons[0], 'zelfde BTW-nummer');
});
test('ongeldig BTW-nummer is nooit beslissend', () => {
  const { records, index } = setup([
    { bedrijfsnaam: 'Alfa Consult', btw: 'BE0123.456.750' },
    { bedrijfsnaam: 'Beta Services', btw: 'BE0123.456.750' },
  ]);
  const s = scorePair(records[0], records[1], index);
  assert.notEqual(s.decision, 'zeker');
});
test('Fabelman, Norian = Norian Fabelman (naamgelijkenis 1)', () => {
  const { index } = setup(filler);
  assert.equal(nameSimilarity(normalizeName('Fabelman, Norian'), normalizeName('Norian Fabelman'), index.weight), 1);
});
test('contactpersoon lijkt op bedrijfsnaam: Nilo Zywan bij Zywan', () => {
  const { records, index } = setup([
    ...filler,
    { bedrijfsnaam: 'Zywan', contactpersoon: 'Nilo Zywan', telefoon: ['02 000 10 03'] },
    { bedrijfsnaam: 'Nilo Zywan', telefoon: ['02 000 10 03'] },
  ]);
  const s = scorePair(records[12], records[13], index);
  assert.ok(s.matched.contact, s.reason);
  assert.equal(s.decision, 'zeker', s.reason);
});
test('kleine tikfout in een naamwoord telt niet', () => {
  const { index } = setup(filler);
  const sim = nameSimilarity(normalizeName('Bakkerij Vandenberghe'), normalizeName('Bakkerij Vandenberge'), index.weight);
  assert.ok(sim >= 0.9, String(sim));
});
test('totaal verschillende namen krijgen geen naamgelijkenis uit de afgekapte bewerkingsafstand', () => {
  const { index } = setup(filler);
  for (const [a, b] of [['Garage Peeters', 'Slagerij Dhondt'], ['Alfa Consult', 'Zeta Bouw'], ['Restaurant De Gouden Leeuw', 'Fietsen Vandenabeele']]) {
    const sim = nameSimilarity(normalizeName(a), normalizeName(b), index.weight);
    assert.ok(sim < 0.3, `${a} / ${b}: ${sim}`);
  }
});
test('kandidaatparen: alleen rijen die een sleutel delen', () => {
  const { records, index } = setup([
    { bedrijfsnaam: 'Alfa', telefoon: ['09 111 11 11'] },
    { bedrijfsnaam: 'Beta', telefoon: ['09 111 11 11'] },
    { bedrijfsnaam: 'Gamma', telefoon: ['09 222 22 22'] },
    { bedrijfsnaam: 'Gamma Delta', email: ['x@gammadelta.invalid'] },
  ]);
  const { pairs } = candidatePairs(records, index);
  const keys = pairs.map(([i, j]) => `${i}-${j}`);
  assert.ok(keys.includes('0-1'));
  assert.ok(keys.includes('2-3'), 'zeldzaam woord gamma');
  assert.ok(!keys.includes('0-2'));
});
test('groepen: BTW-bewaking blokkeert een keten A-B-C met verschillend BTW', () => {
  const { records, index } = setup([
    { bedrijfsnaam: 'Alfa Consult', btw: 'BE0123.456.749', telefoon: ['09 111 11 11'] },
    { bedrijfsnaam: 'Alfa Consult', telefoon: ['09 111 11 11', '09 222 22 22'] },
    { bedrijfsnaam: 'Alfa Consult', btw: 'BE0123.456.848', telefoon: ['09 222 22 22'] },
  ]);
  const scored = candidatePairs(records, index).pairs.map(([i, j]) => ({ i, j, ...scorePair(records[i], records[j], index) }));
  const { uf, groups, blocked } = buildGroups(records, scored);
  assert.equal(groups.length, 2);
  assert.notEqual(uf.find(0), uf.find(2));
  assert.equal(blocked.length, 1);
  const review = reviewPairs(scored, blocked, uf);
  assert.equal(review.length, 1);
  assert.ok(review[0].geblokkeerd);
});
test('beslissingen: "zelfde" voegt samen, "verschillend" houdt apart', () => {
  const { records, index } = setup([
    { bedrijfsnaam: 'Padel Zyvo', telefoon: ['0475 11 22 33'] },
    { bedrijfsnaam: 'Tennisbesnaringen Zyvo', telefoon: ['0475 11 22 33'] },
    { bedrijfsnaam: 'Fabelia', telefoon: ['0400 00 10 01'], website: 'fabelia.invalid', adres: 'Fabelgemsesteenweg 1004' },
    { bedrijfsnaam: 'Fabelia Hair', telefoon: ['0400 00 10 01'], website: 'fabelia.invalid', adres: 'Fabelgemsesteenweg 1004' },
  ]);
  const scored = candidatePairs(records, index).pairs.map(([i, j]) => ({ i, j, ...scorePair(records[i], records[j], index) }));
  let g = buildGroups(records, scored);
  assert.equal(g.groups.length, 3);
  assert.equal(reviewPairs(scored, g.blocked, g.uf).length, 1);
  const d = new Map([[pairKey(0, 1), 'zelfde'], [pairKey(2, 3), 'verschillend']]);
  g = buildGroups(records, scored, d);
  assert.equal(g.uf.find(0), g.uf.find(1));
  assert.notEqual(g.uf.find(2), g.uf.find(3));
  assert.equal(reviewPairs(scored, g.blocked, g.uf, d).length, 0);
});
test('samenvoegen: meest volledige waarde, eerste lijst wint bij gelijkspel, extra nummers blijven', () => {
  const { records } = setup([
    [{ bedrijfsnaam: 'Fabelia', telefoon: ['0400 00 10 01'], email: ['info@fabelia.invalid'] }, { source: 1 }],
    [{ bedrijfsnaam: 'Fabelia Hair & Beauty Boutique', telefoon: ['02 000 10 04'], email: ['contact@fabelia.invalid'], btw: 'BE0123.456.749' }, { source: 2 }],
    [{ bedrijfsnaam: 'Fabelia BV', telefoon: ['0400 00 10 01'], straat: 'Fabelgemsesteenweg', huisnummer: '1004', postcode: '9820', gemeente: 'Voorbeeldstad' }, { source: 0 }],
  ]);
  const m = mergeGroup(records, [0, 1, 2]);
  assert.equal(m.bedrijfsnaam, 'Fabelia Hair & Beauty Boutique', 'meest volledige naam');
  assert.deepEqual(m.telefoons, ['+32400001001', '+3220001004'], 'nummer van de eerste lijst eerst');
  assert.deepEqual(m.emails, ['info@fabelia.invalid', 'contact@fabelia.invalid']);
  assert.equal(m.btw, '0123456749');
  assert.equal(m.huisnummer, '1004');
  assert.equal(m.bronnen.length, 3);
});
