import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SETTINGS } from '../../../src/settings.js';
import { checkMeasurements } from '../../../tools/performance-contract.mjs';
const path = 'dist/prestaties/terugval-rustige-eindmeting/rapport.json';
const raw = readFileSync(path);
const report = JSON.parse(raw);
assert.deepEqual(checkMeasurements(report), [], 'eerst aan alle bestaande grenzen voldoen');
const base = JSON.parse(readFileSync('docs/Prestatiebaseline.json'));
const fields = Object.keys(base.na.gevallen['node/uniek/1000']).filter((k) => k !== 'fasenMs');
const cases = {}, budgets = {};
const up = (n, step, min = step) => Math.max(min, Math.ceil(n / step) * step);
for (const sample of report.samples) {
  const key = `${sample.modus}/${sample.soort}/${sample.aantal}`;
  if (cases[key]) continue;
  const samples = report.samples.filter((s) => `${s.modus}/${s.soort}/${s.aantal}` === key).sort((a,b) => a.run-b.run);
  const max = (field) => Math.max(...samples.map((s) => s[field]));
  const old = SETTINGS.prestaties.budgetten[key];
  cases[key] = Object.fromEntries(fields.map((f) => [f, samples.map((s) => typeof s[f] === 'number' ? Math.round(s[f]*1000)/1000 : s[f])]));
  cases[key].fasenMs = Object.fromEntries(SETTINGS.prestaties.fasen.map((f) => [f, samples.map((s) => Math.round(s.fasen[f]*1000)/1000)]));
  budgets[key] = { totaalMs: Math.min(old.totaalMs, up(max('totaalMs')*1.5,100,500)),
    fasen: Object.fromEntries(SETTINGS.prestaties.fasen.map((f) => [f, Math.min(old.fasen[f], up(Math.max(...samples.map((s) => s.fasen[f]))*1.5,50))])),
    kandidaten: Math.min(old.kandidaten, max('kandidaten')), exportBytes: Math.min(old.exportBytes,up(max('exportBytes')*1.05,1024)) };
  if (sample.modus === 'node') budgets[key].piekRssBytes = Math.min(old.piekRssBytes, up(max('piekRssBytes')*1.25,64*1024**2));
  else for (const f of ['browserBlokkadeMs','timerVertragingMs']) budgets[key][f] = Math.min(old[f],up(max(f)*1.25,100,200));
}
assert.deepEqual(checkMeasurements(report,budgets), []);
writeFileSync('dist/controle/terugval-budgetten.json', JSON.stringify(budgets,null,2));
writeFileSync('docs/Prestatieherstel.json', JSON.stringify({ versie: 1,
 toelichting: 'Voor: eindmeting ronde 4. Na: volledig herhaalde eindmeting van compacte werkbladen en browserpauzes met achtergrondprioriteit. Drie herhalingen per geval; tijden in ms, geheugen en bestand in bytes. De eerdere baseline blijft ongewijzigd.',
 referentie: report.referentie, besturingssysteem: report.besturingssysteem,
 voor: base.na, na: { bronSha256: report.bronSha256, rapportSha256: createHash('sha256').update(raw).digest('hex'), datum: report.datum, gevallen: cases }, budgetten: budgets
},null,2)+'\n');
console.log('54 metingen voldoen aan oude én aangescherpte grenzen; meetoverzicht en budgetvoorstel opgeslagen.');
