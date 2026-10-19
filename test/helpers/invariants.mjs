import assert from 'node:assert/strict';
import { logRows } from '../../src/engine/pipeline.js';
export function invariant(prep, res, decisions = new Map()) {
  const expected = prep.sources.flatMap((s) => s.rows.map((_, i) => [s.name, s.rowNumbers ? s.rowNumbers[i] : i + 2]));
  assert.equal(prep.records.length, expected.length, 'alle invoerrijen zijn opgenomen');
  assert.deepEqual(res.groups.flatMap((g) => g.members).sort((a, b) => a - b), Array.from({ length: expected.length }, (_, i) => i), 'iedere bronrij precies één keer');
  assert.deepEqual(logRows(prep, res).map((r) => [r.bron, r.rij]), expected, 'iedere invoerrij precies eenmaal in het logboek');
  for (const g of res.merged) {
    const nummers = new Set(g.members.filter((r) => r.norm.btwValid).map((r) => r.norm.btw));
    assert.ok(nummers.size <= 1, 'geen verschillende geldige BTW-nummers in een groep');
  }
  for (const [key, value] of decisions) if (value === 'verschillend') {
    const [a, b] = key.split('|').map(Number);
    assert.notEqual(res.groupOf(a), res.groupOf(b), `uitsluiting ${key} blijft geldig`);
  } else if (value?.beslissing === 'verschillend') {
    const a = new Set(value.ledenA.map((i) => res.groupOf(i)));
    for (const i of value.ledenB) assert.ok(!a.has(res.groupOf(i)), `groepsuitsluiting ${key} blijft geldig`);
  } else if (value?.beslissing === 'ontkoppelen') {
    assert.equal(new Set(value.leden.map((i) => res.groupOf(i))).size, value.leden.length, `ontkoppeling ${key} blijft geldig`);
  }
}
