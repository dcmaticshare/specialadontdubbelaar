import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mapping from '../src/io/mapping.js';
import { normalizePhones, normalizeEmails } from '../src/engine/normalize.js';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { scorePair } from '../src/engine/match.js';
import { buildResultWorkbook } from '../src/io/write.js';
import { source, context, reopen, rowsOf, importResult, btw } from './helpers/fixtures.mjs';

const contactbron = (kop, waarde, tweede = waarde) => source('constant.csv', ['Naam', kop],
  Array.from({ length: 20 }, (_, i) => [i === 0 ? 'Fabelwinkel' : i === 1 ? 'Fabelwinkel Noord' : `Verzinsel ${i}`, i === 1 ? tweede : waarde]));

for (const [kop, waarde, tweede, signaal] of [
  ['E-mail', 'info@voorbeeld.invalid', 'INFO @ voorbeeld.invalid', 'email'],
  ['Telefoon', '020000000', '+32 2 000 00 00', 'telefoon'],
  ['Website', 'www.voorbeeld.invalid', 'https://voorbeeld.invalid/pad', 'domein'],
  ['Contactpersoon', 'Mira Testmans', 'Mira Testmans', 'contact'],
]) {
  test(`B07: constante ${kop} levert geen kandidaat of punten, ook bij andere schrijfwijze`, async () => {
    const src = contactbron(kop, waarde, tweede);
    const prep = await prepare({ sources: [src] });
    const pair = scorePair(prep.records[0], prep.records[1], prep.index);
    assert.ok(!pair.matched[signaal] || pair.matched[signaal].length === 0);
    assert.equal(assemble(prep).merged.length, 20);
    assert.ok(!prep.candidates.some(([i, j]) => i === 0 && j === 19), 'geen kandidaat door gekopieerd contactgegeven');
    assert.match(src.notes.join(' '), /contactkolom.*niet.*vergelijken/i);
    assert.ok(prep.records[0].warnings.some((w) => /contactkolom/.test(w)));
  });
}

test('B07: constante postcode blijft bruikbaar en verlaagt punten bij een andere postcode', async () => {
  const src = source('gemeente.csv', ['Naam', 'Adres', 'Postcode'], Array.from({ length: 20 }, (_, i) => [`Fabelwinkel ${i}`, `Teststraat ${i + 1}`, '1000']));
  const prep = await prepare({ sources: [src, source('andere.csv', src.header, [['Fabelwinkel 0', 'Teststraat 1', '2000']])] });
  assert.equal(prep.records[0].norm.postcodeUsable, true);
  assert.equal(scorePair(prep.records[0], prep.records[20], prep.index).score, 75);
  assert.match(src.notes.join(' '), /postcode.*blijft.*adres/i);
});

test('B07: geldige BTW, adres en identieke bedrijfsnamen behouden hun vergelijkingsrol', async () => {
  const src = source('herhaling.csv', ['Naam', 'BTW', 'Adres', 'E-mail'], Array.from({ length: 401 }, () => ['Fabelwinkel', btw(), 'Teststraat 1', 'info@voorbeeld.invalid']));
  const prep = await prepare({ sources: [src] });
  assert.equal(assemble(prep).merged.length, 1);
  assert.doesNotMatch(src.notes.join(' '), /wordt niet gebruikt om te vergelijken/);
});

for (const profiles of [{}, null, [null], [{ signature: 'naam', mapping: null }], [{ signature: 'naam', mapping: { naam: 'bestaat-niet' } }]]) {
  test(`B10: ongeldige profielvorm ${JSON.stringify(profiles)} valt terug op voorstel`, () => {
    const result = mapping.suggestMapping({ header: ['Naam'], rows: [], profiles });
    assert.deepEqual(result.mapping, ['bedrijfsnaam']);
    assert.equal(result.fromProfile, false);
  });
}

test('B10: expliciet nieuw voorstel negeert een geldig bewaard profiel', () => {
  const profiles = [mapping.makeProfile(['Naam'], ['contactpersoon'])];
  assert.deepEqual(mapping.suggestMapping({ header: ['Naam'], rows: [], profiles, useProfiles: false }).mapping, ['bedrijfsnaam']);
});

test('B10: ontbrekende, kapotte en oude opslag wordt veilig gelezen en hersteld', () => {
  for (const raw of [null, '{', '{}', 'null', '42', '[null]', JSON.stringify([mapping.makeProfile(['Naam'], ['contactpersoon'])])]) {
    let value = raw;
    const storage = { getItem: () => value, setItem: (_, v) => { value = v; } };
    const result = mapping.readProfiles(storage);
    assert.ok(Array.isArray(result.profiles));
    assert.equal(result.profiles.length, raw?.includes('signature') ? 1 : 0);
    if (raw !== null) assert.deepEqual(JSON.parse(value), { versie: 1, profielen: result.profiles });
  }
});

test('B11: dubbele spaties, tabs en regeleinden scheiden volledige telefoons vóór opschonen', async () => {
  for (const sep of ['  ', '\t', '\n']) {
    const value = `020000000${sep}030000000`;
    assert.deepEqual(normalizePhones(value).phones, ['+3220000000', '+3230000000']);
    const prep = await prepare({ sources: [source('contact.csv', ['Naam', 'Telefoon'], [['Fabelwinkel', value]])] });
    assert.deepEqual(prep.records[0].norm.phones, ['+3220000000', '+3230000000']);
  }
});

test('B11: alleen spaties direct rond @ worden hersteld; afgebroken lokale naam wordt niet geraden', async () => {
  assert.deepEqual(normalizeEmails('info @ voorbeeld.invalid'), ['info@voorbeeld.invalid']);
  assert.deepEqual(normalizeEmails('in fo@voorbeeld.invalid'), []);
  const prep = await prepare({ sources: [source('contact.csv', ['Naam', 'Telefoon', 'E-mail'], [['Fabelwinkel', 'geen nummer', 'info @ voorbeeld.invalid; fout@']])] });
  assert.deepEqual(prep.records[0].norm.emails, ['info@voorbeeld.invalid']);
  assert.match(prep.records[0].warnings.join(' '), /telefoon.*niet herkend/);
  assert.match(prep.records[0].warnings.join(' '), /e-mail.*fout@.*niet herkend/);
});

test('B11: export en herimport behouden gesplitste contacten, waarschuwingen en originele celtekst', async () => {
  const telefoon = ' 020000000  030000000 ';
  const email = ' info @ voorbeeld.invalid; fout@ ';
  const prep = await prepare({ sources: [source('contact.csv', ['Naam', 'Telefoon', 'E-mail'], [['Fabelwinkel', telefoon, email]])] });
  const wb = reopen(buildResultWorkbook(prep, assemble(prep), context));
  const leads = rowsOf(wb, 'Unieke leads');
  assert.equal(leads[1][leads[0].indexOf('Telefoon 2')], '+32 3 000 00 00');
  assert.equal(leads[1][leads[0].indexOf('E-mail')], 'info@voorbeeld.invalid');
  assert.match(rowsOf(wb, 'Logboek')[1][7], /fout@.*niet herkend/);
  for (const value of [telefoon, email]) assert.ok(rowsOf(wb, 'Oorspronkelijke gegevens').some((r) => r[7] === value));
  const again = await prepare({ sources: [await importResult(wb)] });
  assert.deepEqual(again.records[0].norm.phones, ['+3220000000', '+3230000000']);
  assert.deepEqual(again.records[0].norm.emails, ['info@voorbeeld.invalid']);
  const next = reopen(buildResultWorkbook(again, assemble(again), context));
  for (const value of [telefoon, email]) assert.ok(rowsOf(next, 'Oorspronkelijke gegevens').some((r) => r[7] === value));
});

for (const [aantal, afwijkend, uitgesloten] of [[19, 0, false], [20, 1, true], [20, 2, false]]) {
  test(`B07: grens ${aantal} gevulde rijen, ${afwijkend} afwijkend contactgegeven`, async () => {
    const src = source('grens.csv', ['Naam', 'E-mail'], Array.from({ length: aantal }, (_, i) => [`Fabel ${i}`, i < afwijkend ? `eigen${i}@uniek.invalid` : 'kopie@algemeen.invalid']));
    const prep = await prepare({ sources: [src] });
    assert.equal(!!prep.records[0].compare, uitgesloten);
    if (uitgesloten) assert.equal(prep.records[0].compare.emails.length, 0, 'de hele kolom, inclusief minderheidswaarden, telt niet mee');
  });
}

test('B07: uitsluiting geldt per bronkolom; tweede contactkolom en onafhankelijke bron blijven bruikbaar', async () => {
  const src = contactbron('E-mail', 'kopie@algemeen.invalid');
  src.header.push('E-mail 2'); src.mapping.push('email');
  src.rows.forEach((r, i) => r.push(i === 0 ? 'eigen@bedrijf.invalid' : ''));
  const other = source('nieuw.csv', ['Naam', 'E-mail'], [['Fabelwinkel', 'eigen@bedrijf.invalid'], ['Fabelwinkel', 'kopie@algemeen.invalid']]);
  const prep = await prepare({ sources: [src, other] });
  assert.deepEqual(prep.records[0].compare.emails, ['eigen@bedrijf.invalid']);
  assert.deepEqual(scorePair(prep.records[0], prep.records[20], prep.index).matched.email, ['eigen@bedrijf.invalid']);
  assert.deepEqual(scorePair(prep.records[0], prep.records[21], prep.index).matched.email, []);
  assert.deepEqual(scorePair(prep.records[0], prep.records[21], prep.index).matched.domein, []);
  assert.deepEqual(prep.records[21].norm.emails, ['kopie@algemeen.invalid']);
  const wb = reopen(buildResultWorkbook(prep, assemble(prep), context));
  assert.ok(rowsOf(wb, 'Unieke leads').some((r) => r.includes('kopie@algemeen.invalid')));
  const again = await prepare({ sources: [await importResult(wb)] });
  assert.equal(assemble(again).merged.length, assemble(prep).merged.length);
});

test('B07: gekoppelde persoonsnaamvelden vallen samen weg; een constant adres blijft bruikbaar', async () => {
  const src = source('persoon.csv', ['Naam', 'Voornaam', 'Achternaam', 'Adres'], Array.from({ length: 20 }, (_, i) => [`Fabel ${i}`, 'Mira', `Verzinsel ${i}`, 'Teststraat 1']));
  const prep = await prepare({ sources: [src] });
  assert.equal(prep.records[0].compare.contact.compact, '');
  const pair = scorePair(prep.records[0], prep.records[1], prep.index);
  assert.equal(pair.matched.contact, false);
  assert.equal(pair.matched.adres, true);
});

test('B07: actuele koppeling en bronrijen winnen van verouderde detectiegegevens', async () => {
  const src = contactbron('E-mail', 'kopie@algemeen.invalid');
  src.nearConstant = [false, false];
  let prep = await prepare({ sources: [src] });
  assert.deepEqual(prep.records[0].compare.emails, []);
  src.mapping[1] = 'negeren';
  prep = await prepare({ sources: [src] });
  assert.equal(prep.records[0].warnings.length, 0);
});

test('B10: profielvelden en opslagversie worden gesloten gevalideerd; geldige buren blijven behouden', () => {
  const valid = mapping.makeProfile(['Naam', 'Telefoon'], ['bedrijfsnaam', 'telefoon']);
  const invalid = [null, [], {}, { ...valid, bron: {} }, { ...valid, signature: 'ander' }, { ...valid, mapping: [] }, { ...valid, mapping: { naam: 'bedrijfsnaam' } }, { ...valid, mapping: { ...valid.mapping, onbekend: 'telefoon' } }, { ...valid, mapping: { ...valid.mapping, telefoon: '__proto__' } }];
  assert.deepEqual(mapping.validProfiles([...invalid, valid]), [valid]);
  let saved = JSON.stringify({ versie: 0, profielen: [valid] });
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  assert.deepEqual(mapping.readProfiles(storage).profiles, []);
  assert.deepEqual(JSON.parse(saved), { versie: 1, profielen: [] });
  assert.equal(mapping.saveProfiles(storage, [valid]), true);
  assert.equal(mapping.readProfiles(storage).notice, '');
  assert.deepEqual(mapping.readProfiles(storage).profiles, [valid]);
});

test('codescan 25: nieuwere profielopslag blijft bij lezen byte voor byte behouden', () => {
  for (const versie of [2, 99]) {
    const raw = JSON.stringify({ versie, profielen: [{ nieuwVeld: ['onbekende koppeling'] }], uitbreiding: true }, null, 2);
    let saved = raw, writes = 0;
    const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; writes++; } };
    const result = mapping.readProfiles(storage);
    assert.equal(saved, raw);
    assert.equal(writes, 0);
    assert.equal(result.readOnly, true);
    assert.deepEqual(result.profiles, []);
    assert.match(result.notice, /nieuwere versie/);
    assert.deepEqual(mapping.suggestMapping({ header: ['Naam'], rows: [], profiles: result.profiles }).mapping, ['bedrijfsnaam']);
  }
});

test('codescan 25: bewaren beschermt ook profielopslag die na het inlezen is vernieuwd', () => {
  const profile = mapping.makeProfile(['Naam'], ['bedrijfsnaam']);
  let saved = JSON.stringify({ versie: 1, profielen: [profile] }), writes = 0;
  const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; writes++; } };
  assert.deepEqual(mapping.readProfiles(storage).profiles, [profile]);
  const future = JSON.stringify({ versie: 2, profielen: [profile], uitbreiding: { bewaar: true } }, null, 2);
  saved = future; // Een nieuwere HTML heeft inmiddels dezelfde opslag bijgewerkt.
  assert.equal(mapping.saveProfiles(storage, [mapping.makeProfile(['Naam'], ['contactpersoon'])]), false);
  assert.equal(saved, future);
  assert.equal(writes, 0);
});

test('B10: onbeschikbare opslag blokkeert voorstel of verwerking niet', () => {
  const storage = { getItem() { throw new Error('niet beschikbaar'); }, setItem() { throw new Error('vol'); } };
  assert.deepEqual(mapping.readProfiles(storage).profiles, []);
  assert.match(mapping.readProfiles(storage).notice, /niet beschikbaar/);
  assert.equal(mapping.saveProfiles(storage, [mapping.makeProfile(['Naam'], ['bedrijfsnaam'])]), false);
  const full = { getItem: () => '{}', setItem: storage.setItem };
  assert.match(mapping.readProfiles(full).notice, /kan dit herstel niet bewaren/);
});

test('B10: meerdere profielen, herhaalde handtekening en bovengrens blijven geldig', () => {
  const profiles = Array.from({ length: 55 }, (_, i) => mapping.makeProfile([`Naam ${i}`], ['bedrijfsnaam']));
  const limited = mapping.validProfiles(profiles);
  assert.equal(limited.length, 50);
  assert.equal(limited[0].signature, 'naam 5');
  const updated = { ...limited[0], mapping: { 'naam 5': 'contactpersoon' } };
  assert.equal(mapping.validProfiles([...limited, updated]).find((p) => p.signature === updated.signature).mapping['naam 5'], 'contactpersoon');
});

for (const value of ['02  000 00 00', '02/000.00.00', '020000000 / 030000000', '020000000 - 030000000', '020000000 of 030000000', '3,2479E+10']) {
  test(`B11: telefoonopmaak blijft veilig: ${value}`, () => {
    const result = normalizePhones(value);
    if (value.includes('E+')) {
      assert.deepEqual(result.phones, []);
      assert.match(result.warnings[0].reden, /wetenschappelijke notatie/);
    } else assert.deepEqual(result.phones, value.includes('030000000') ? ['+3220000000', '+3230000000'] : ['+3220000000']);
  });
}

test('B11: e-mailspaties en gedeeltelijk verworpen cellen geven voorspelbare contacten', async () => {
  for (const value of ['info @voorbeeld.invalid', 'info@ voorbeeld.invalid', ' INFO\t@\tVOORBEELD.INVALID ', 'mailto:info @ voorbeeld.invalid']) assert.deepEqual(normalizeEmails(value), ['info@voorbeeld.invalid']);
  for (const value of ['in fo@voorbeeld.invalid', 'info@voor beeld.invalid', 'info@voorbeeld .invalid']) assert.deepEqual(normalizeEmails(value), []);
  assert.deepEqual(normalizeEmails('a@een.invalid b@twee.invalid'), ['a@een.invalid', 'b@twee.invalid']);
  const prep = await prepare({ sources: [source('email.csv', ['Naam', 'E-mail', 'Website'], [['Fabelwinkel', 'a@een.invalid; niet geldig; b@twee.invalid', 'info @ voorbeeld.invalid'], ['Zonnerader', 'n.v.t.', '-']])] });
  assert.deepEqual(prep.records[0].norm.emails, ['a@een.invalid', 'b@twee.invalid', 'info@voorbeeld.invalid']);
  assert.equal(prep.records[0].warnings.length, 0, 'losse toelichting zonder @ geeft geen e-mailwaarschuwing');
  assert.equal(prep.records[1].warnings.length, 0);
});

test('codescan 14: alleen ongeldige e-mailadressen tellen als waarschuwing; export bewaart toelichtingen', async () => {
  const waarden = ['Mira Testmans <mira@voorbeeld.invalid>', 'info@voorbeeld.invalid (algemeen)', 'Contact <fout@> (verouderd)'];
  const prep = await prepare({ sources: [source('email.csv', ['Naam', 'E-mail'], waarden.map((waarde, i) => [`Fabelbedrijf ${i}`, waarde]))] });
  const result = assemble(prep);
  assert.deepEqual(prep.records.map((record) => record.warnings.length), [0, 0, 1]);
  assert.equal(result.perBron[0].waarschuwingen, 1);
  const wb = reopen(buildResultWorkbook(prep, result, context));
  const log = rowsOf(wb, 'Logboek');
  assert.equal(log[1][7], '');
  assert.equal(log[2][7], '');
  assert.match(log[3][7], /fout@.*niet herkend/);
  assert.doesNotMatch(log[3][7], /Contact|verouderd/);
  assert.equal(rowsOf(wb, 'Per bron')[1][6], '1');
  for (const waarde of waarden) assert.ok(rowsOf(wb, 'Oorspronkelijke gegevens').some((row) => row[7] === waarde));
});

test('B07/B04: een afwijkende rij met eigen of leeg contact maakt echte herhaalde bedrijfsrijen niet verdacht', async () => {
  for (const extra of ['', 'ander@ander.invalid']) {
    const src = source('herhaald.csv', ['Naam', 'E-mail'], [...Array.from({ length: 401 }, () => ['Fabelwinkel', 'info@fabel.invalid']), ['Zonnerader', extra]]);
    const prep = await prepare({ sources: [src] });
    assert.equal(assemble(prep).merged.length, 2);
    assert.equal(prep.records[0].compare, undefined);
  }
});
