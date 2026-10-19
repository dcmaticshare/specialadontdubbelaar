// Uitsluitend synthetische gegevens. Nummers zijn verzonnen; domeinen gebruiken .invalid.
import { createRequire } from 'node:module';
import { suggestMapping } from '../../src/io/mapping.js';
import { readFile } from '../../src/io/read.js';
export const XLSX = createRequire(import.meta.url)('../../vendor/xlsx.full.min.js');
globalThis.XLSX = XLSX;
export const context = { version: 'test', buildDate: '2026-10-17', datum: '2026-10-17', verwerktOp: '2026-10-17 12:00' };
export function source(name, header, rows, rest = {}) {
  return { name, header, rows, rowNumbers: rows.map((_, i) => i + 2), ...suggestMapping({ header, rows }), ...rest };
}
export function btw(n = 1) {
  const basis = 1234566 + n;
  return String(basis).padStart(8, '0') + String(97 - basis % 97).padStart(2, '0');
}
export function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map((tail) => [item, ...tail]));
}
export function reopen(wb) {
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', bookFiles: true });
}
export function rowsOf(wb, name) { return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }); }
export async function importResult(wb) {
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const file = await readFile({ name: 'vorig-resultaat.xlsx', arrayBuffer: async () => bytes });
  const sheet = file.sheets[file.defaultSheet];
  return source(file.name, sheet.header, sheet.rows, { ...sheet, name: file.name, sheetName: sheet.name });
}
// Vaste seed: elke mislukte invariant is met hetzelfde getal reproduceerbaar.
export function random(seed) {
  let state = seed >>> 0;
  return (max) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
}
