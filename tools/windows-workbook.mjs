// Onafhankelijke, vaste verwachtingen voor de synthetische Windows-acceptatie.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const X = createRequire(import.meta.url)('../vendor/xlsx.full.min.js');
export function checkWindowsWorkbook(file, kind) {
  const wb = X.read(readFileSync(file), { type: 'buffer' });
  for (const name of ['Unieke leads', 'Te controleren', 'Per bron', 'Logboek', 'Beslissingen', 'Oorspronkelijke gegevens', 'Info']) assert.ok(wb.Sheets[name], `Werkblad ontbreekt: ${name}`);
  for (const name of wb.SheetNames) for (const [key, cell] of Object.entries(wb.Sheets[name])) if (!key.startsWith('!')) { assert.equal(cell.t, 's'); assert.equal(cell.f, undefined); }
  const rows = X.utils.sheet_to_json(wb.Sheets['Unieke leads'], { header: 1, defval: '' });
  assert.equal(rows.length, 3);
  const lead = rows.find((r) => r[3] === 'Fabelwinkel BV');
  assert.ok(lead); assert.equal(lead[7], 'Teststraat 42 bus 3');
  assert.equal(lead[rows[0].indexOf('Telefoon 5')], '+32 60 00 10 05');
  assert.equal(lead[rows[0].indexOf('E-mail 4')], 'd@fabel.invalid');
  for (const value of ['=BEWAAR-MIJ', 'TWEEDE-WAARDE']) assert.ok(lead[rows[0].indexOf('Extra: Opmerkingen')].includes(value));
  assert.ok(rows.some((r) => r[3] === '<img src=x onerror=alert(1)>'));
  const originals = X.utils.sheet_to_json(wb.Sheets['Oorspronkelijke gegevens'], { header: 1, defval: '' });
  assert.ok(originals.some((r) => r[2] === 'synthetisch.csv' && r[7] === 'Norian Fabelman'));
  if (kind === 'herimport') assert.ok(originals.some((r) => r.includes('nieuwe-lijst.csv')), 'nieuwe lijst ontbreekt in de herimport');
}
