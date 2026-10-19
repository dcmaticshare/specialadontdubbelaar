import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js');

// De verwachte identiteit komt uitsluitend uit de generator, nooit uit een matchscore.
export function checkPartition(identity, groups) {
  const seen = new Set(), owner = new Map();
  for (const members of groups) {
    assert.ok(members.length, 'geen lege groepen');
    const id = identity[members[0]];
    assert.ok(!owner.has(id), 'verwacht bedrijf ten onrechte gesplitst');
    owner.set(id, members);
    for (const i of members) {
      assert.ok(Number.isInteger(i) && i >= 0 && i < identity.length && !seen.has(i), 'rij ontbreekt, is onbekend of staat dubbel');
      assert.equal(identity[i], id, 'verschillende verwachte bedrijven samengevoegd'); seen.add(i);
    }
  }
  assert.equal(seen.size, identity.length, 'alle bronrijen precies eenmaal');
  return owner.size;
}

export function checkWorkbook(data, filename) {
  const wb = XLSX.read(readFileSync(filename), { type: 'buffer' });
  const cell = (sheet, r, c) => wb.Sheets[sheet]?.[XLSX.utils.encode_cell({ r, c })]?.v;
  const count = (sheet) => XLSX.utils.decode_range(wb.Sheets[sheet]['!ref']).e.r;
  for (const name of wb.SheetNames) for (const key in wb.Sheets[name]) if (!key.startsWith('!')) {
    const c = wb.Sheets[name][key];
    assert.equal(c.t, 's', 'alle exportcellen zijn tekst'); assert.equal(c.f, undefined, 'geen formulecellen');
  }
  assert.equal(count('Logboek'), data.aantal);
  assert.equal(count('Oorspronkelijke gegevens'), data.aantal * data.header.length);
  const groups = new Map(), nrByRow = new Map();
  for (let r = 1; r <= data.aantal; r++) {
    const original = Number(cell('Logboek', r, 1)) - 2, nr = cell('Logboek', r, 3);
    assert.ok(!nrByRow.has(original), 'geen dubbele bronrij in logboek');
    nrByRow.set(original, nr);
    if (!groups.has(nr)) groups.set(nr, []);
    groups.get(nr).push(original);
  }
  const n = checkPartition(data.identity, [...groups.values()]);
  assert.equal(count('Unieke leads'), n);
  assert.equal(count('Te controleren'), 0, 'de vaste identiteiten vragen geen handmatige beoordeling');
  const originalSeen = new Set();
  for (let r = 1; r <= count('Oorspronkelijke gegevens'); r++) {
    const row = Number(cell('Oorspronkelijke gegevens', r, 4)) - 2;
    const col = Number(cell('Oorspronkelijke gegevens', r, 5)) - 1;
    assert.ok(data.rows[row] && col >= 0 && col < data.header.length);
    const key = row * data.header.length + col;
    assert.ok(!originalSeen.has(key)); originalSeen.add(key);
    assert.equal(cell('Oorspronkelijke gegevens', r, 0), nrByRow.get(row));
    assert.equal(cell('Oorspronkelijke gegevens', r, 6), data.header[col]);
    assert.equal(cell('Oorspronkelijke gegevens', r, 7), data.rows[row][col], 'iedere cel blijft exact bewaard');
  }
  // De samengevoegde extra kolom moet óók iedere oorspronkelijke opmerking bevatten.
  const leadByNr = new Map();
  for (let r = 1; r <= n; r++) leadByNr.set(cell('Unieke leads', r, 12), r);
  const extraCol = XLSX.utils.decode_range(wb.Sheets['Unieke leads']['!ref']).e.c;
  assert.equal(cell('Unieke leads', 0, extraCol), 'Extra: Opmerkingen');
  for (let i = 0; i < data.aantal; i++) assert.ok(cell('Unieke leads', leadByNr.get(nrByRow.get(i)), extraCol).includes(data.rows[i][6]));
  return { groepen: n, bronrijen: data.aantal, oorspronkelijkeCellen: originalSeen.size, tekstcellen: true, gegevensbehoud: true };
}
