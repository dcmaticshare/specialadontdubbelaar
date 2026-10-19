// Iedere meting draait in een nieuw proces; maxRSS is de OS-piek van dit proces.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { scenario, csvBytes } from '../../../tools/performance-data.mjs';
import { checkPartition } from '../../../tools/performance-quality.mjs';
import { readFile } from '../../../src/io/read.js';
import { suggestMapping } from '../../../src/io/mapping.js';
import { prepare, assemble } from '../../../src/engine/pipeline.js';
import { buildResultWorkbook } from '../../../src/io/write.js';
import { finishTiming } from '../../../src/engine/timing.js';
import { SETTINGS } from '../../../src/settings.js';
globalThis.XLSX = createRequire(import.meta.url)('../../../vendor/xlsx.full.min.js');
const [soort, aantal, dest] = process.argv.slice(2);
const data = scenario({ soort, aantal: Number(aantal) });
const bytes = csvBytes(data);
performance.clearMeasures();
const file = await readFile({ name: 'synthetisch.csv', arrayBuffer: async () => bytes });
const sheet = file.sheets[file.defaultSheet];
const start = performance.now();
const mapping = suggestMapping(sheet);
finishTiming('koppelen', start);
globalThis.setImmediate = undefined;
const prep = await prepare({ sources: [{ ...sheet, ...mapping, name: 'synthetisch.csv', sheetName: 'CSV' }] });
const res = assemble(prep);
checkPartition(data.identity, res.groups.map((g) => g.members));
const wb = buildResultWorkbook(prep, res, { version: 'prestatiecontrole', datum: '2026-10-17', decisionLog: [] });
const writing = performance.now();
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
finishTiming('serialiseren', writing);
writeFileSync(dest + '.xlsx', buffer);
const entries = performance.getEntriesByType('measure').filter((m) => m.name.startsWith('lead:'));
const fasen = Object.fromEntries(entries.map((m) => [m.name.slice(5), m.duration]));
const report = { modus: 'node', soort, aantal: data.aantal, seed: data.seed, fasen,
  totaalMs: SETTINGS.prestaties.totaalFasen.reduce((n, k) => n + fasen[k], 0),
  piekRssBytes: process.resourceUsage().maxRSS * 1024,
  geheugenMethode: 'os-maxrss', geheugenToelichting: 'OS maxRSS, vers Node-proces, inclusief generator en werkmap, vóór heropenen',
  browserBlokkadeMs: null, timerVertragingMs: null, responsiviteitMethode: 'niet-van-toepassing',
  kandidaten: prep.candidates.length, compacteGroepen: prep.compactGroups.length, scores: prep.scored.length,
  overgeslagenSleutels: prep.skipped.length, exportBytes: buffer.length, groepen: res.groups.length,
  kwaliteitscontrole: { groepen: true }, meetversie: SETTINGS.prestaties.versie };
writeFileSync(dest + '.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ soort, aantal: data.aantal, totaalMs: report.totaalMs, fasen, piekRssBytes: report.piekRssBytes, kandidaten: report.kandidaten, exportBytes: report.exportBytes }));
