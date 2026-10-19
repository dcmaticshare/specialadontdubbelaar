import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mapping from '../src/io/mapping.js';

function bron() {
  const reads = [0, 0, 0, 0, 0];
  const values = Array.from({ length: 24 }, (_, i) => [`Fabel ${i}`, i % 2 ? 'info @ fabel.invalid' : 'INFO@FABEL.INVALID', '', 'Vaste extra', 'Fabel']);
  const rows = values.map((row) => new Proxy(row, { get(target, key) {
    if (/^\d+$/.test(String(key))) reads[Number(key)]++;
    return Reflect.get(target, key);
  } }));
  return { sheet: { header: ['Naam', 'E-mail', 'Leeg', 'Extra', 'Andere naam'], rows }, reads,
    fields: ['bedrijfsnaam', 'email', 'negeren', 'negeren', 'negeren'] };
}

test('codescan 9: ongewijzigd beleid leest geen broncellen opnieuw', () => {
  const cached = mapping.createComparisonPolicyCache();
  const { sheet, fields, reads } = bron();
  const first = cached({ ...sheet, mapping: fields });
  assert.equal(first.excluded[1], true);
  assert.equal(first.nearConstant[3], true, 'ook een extra kolom behoudt de badge');
  reads.fill(0);
  assert.strictEqual(cached({ ...sheet, mapping: [...fields] }), first);
  assert.deepEqual(reads, [0, 0, 0, 0, 0]);
});

test('codescan 9: een andere koppeling scant uitsluitend de gewijzigde kolom', () => {
  const cached = mapping.createComparisonPolicyCache();
  const { sheet, fields, reads } = bron();
  cached({ ...sheet, mapping: fields });
  fields[3] = 'sector'; reads.fill(0);
  const changed = cached({ ...sheet, mapping: fields });
  assert.ok(reads[3] > 0);
  assert.deepEqual([reads[0], reads[1], reads[2], reads[4]], [0, 0, 0, 0]);
  assert.deepEqual(changed, mapping.comparisonPolicy({ ...sheet, mapping: fields }));
  assert.match(changed.notes.join(' '), /levert geen vergelijkingspunten/);
});

test('codescan 9: contactbeleid ververst na een andere bedrijfsnaamkolom of broninhoud', () => {
  const cached = mapping.createComparisonPolicyCache();
  const { sheet, fields } = bron();
  assert.equal(cached({ ...sheet, mapping: fields }).excluded[1], true);
  fields[0] = 'negeren'; fields[4] = 'bedrijfsnaam';
  assert.equal(cached({ ...sheet, mapping: fields }).excluded[1], false);
  fields[1] = 'negeren';
  assert.equal(cached({ ...sheet, mapping: fields }).excluded[1], false);
  fields[1] = 'email';
  assert.equal(cached({ ...sheet, mapping: fields }).excluded[1], false);
  const replacement = { ...sheet, rows: sheet.rows.map((r, i) => [...r.slice(0, 4), `Ander ${i}`]) };
  assert.equal(cached({ ...replacement, mapping: fields }).excluded[1], true);
  assert.equal(cached({ ...sheet, mapping: fields }).excluded[1], false);
  const renamed = { ...sheet, header: sheet.header.map((h) => `Nieuw ${h}`) };
  assert.match(cached({ ...renamed, mapping: fields }).notes.join(' '), /Nieuw E-mail/);
});

test('codescan 9: persoonsvelden blijven gezamenlijk uitgesloten na herkoppelen', () => {
  const cached = mapping.createComparisonPolicyCache();
  const source = { header: ['Naam', 'Voornaam', 'Achternaam'],
    rows: Array.from({ length: 24 }, (_, i) => [`Fabel ${i}`, 'Mira', `Verzinsel ${i}`]),
    mapping: ['bedrijfsnaam', 'voornaam', 'achternaam'] };
  assert.deepEqual(cached(source).excluded, [false, true, true]);
  source.mapping[1] = 'negeren';
  assert.deepEqual(cached(source).excluded, [false, false, false]);
  assert.deepEqual(cached(source), mapping.comparisonPolicy(source));
});

test('codescan 9: voorbeelden, ook lege kolommen, worden per tabblad hergebruikt', async () => {
  const { createMappingViewCache } = await import('../src/ui/mapping.js');
  const view = createMappingViewCache();
  const { sheet, fields, reads } = bron();
  const first = view(sheet, fields);
  assert.deepEqual(first.examples, ['Fabel 0 · Fabel 1 · Fabel 2', 'INFO@FABEL.INVALID · info @ fabel.invalid', '', 'Vaste extra', 'Fabel']);
  reads.fill(0);
  assert.strictEqual(view(sheet, fields).examples, first.examples);
  assert.deepEqual(reads, [0, 0, 0, 0, 0]);
  fields[3] = 'sector';
  assert.strictEqual(view(sheet, fields).examples, first.examples);
  assert.equal(reads[2], 0, 'lege voorbeelden worden ook na een koppelwijziging niet opnieuw gezocht');
  const other = { ...sheet, rows: [['Nieuw', '', '', '', '']] };
  assert.equal(view(other, fields).examples[0], 'Nieuw');
  assert.strictEqual(view(sheet, fields).examples, first.examples, 'terug naar eerder tabblad');
  sheet.rows = other.rows;
  assert.equal(view(sheet, fields).examples[0], 'Nieuw', 'vervangen inhoud ververst de cache');
});
