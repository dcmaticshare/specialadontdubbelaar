// Verwerkt de testlijsten in testdata/ zonder scherm en drukt de samenvatting en de gekende testgevallen af.
// Gebruik: node tools/run-testdata.mjs [map] [--schrijf]   (schrijft dan het Excelbestand naar dist/)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadDir } from './lib.mjs';
import { checkKnownCase } from './quality.mjs';
import { FIELD_LABELS } from '../src/io/mapping.js';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { buildResultWorkbook, resultFileName } from '../src/io/write.js';
import { todayIso } from '../src/engine/text.js';

const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'testdata';
const schrijf = process.argv.includes('--schrijf');
const t0 = performance.now();
const { sources } = await loadDir(dir);
if (!sources.length) throw new Error('Geen privélijsten gevonden: deze controle vereist de lokale testdata.');
for (const src of sources) {
  console.log(`\n${src.name} ${src.read.kind}${src.read.encoding ? ' ' + src.read.encoding : ''}${src.read.delimiter ? ' sep=' + JSON.stringify(src.read.delimiter) : ''} tab=${src.sheet.name} rijen=${src.rows.length}`);
  src.header.forEach((h, c) => console.log(`   ${h.padEnd(28)} -> ${FIELD_LABELS[src.mapping[c]] || src.mapping[c]}${src.nearConstant[c] ? '  (bijna constant)' : ''}`));
  for (const n of src.sug.notes) console.log('   nota:', n);
  for (const w of src.sheet.warnings) console.log('   waarschuwing:', w);
}
const t1 = performance.now();
const prep = await prepare({ sources, onProgress: () => {} });
const t2 = performance.now();
const res = assemble(prep);
const t3 = performance.now();
console.log(`\nInlezen ${(t1 - t0).toFixed(0)} ms, vergelijken ${(t2 - t1).toFixed(0)} ms (${prep.scored.length} gescoorde paren), groeperen ${(t3 - t2).toFixed(0)} ms`);
console.log('Samenvatting:', res.summary);
console.log('Twijfelparen per strengheid:', res.perStrengheid.map((s) => `${s.label} (vanaf ${s.teControleren} p): ${s.aantal}`).join(', '));
console.log('Overgeslagen sleutels:', prep.skipped.slice(0, 10));
console.log('\nPer bron:');
for (const s of res.perBron) console.log(`  ${s.label}: rijen ${s.rijen}, unieke leads ${s.uniekeLeads}, alleen hier ${s.alleenHier}, dubbel andere lijst ${s.dubbelAndereLijst}, dubbel binnen ${s.dubbelBinnenLijst}, waarschuwingen ${s.waarschuwingen}`);

const find = (naam) => prep.records.filter((r) => r.fields.bedrijfsnaam.toLowerCase().includes(naam.toLowerCase()));
console.log('\nTestgevallen uit het plan:');
for (const [a, b, verwacht] of [
  ['Jolini', 'Jolini Hair', 'zeker'], ["Cheff's", "Traiteur Cheff's", 'zeker'], ['Padel Uvyn', 'Tennisbesnaringen Uvyn', 'controleren'],
  ['Winterloods', 'Zomerloods', 'controleren'], ['Almitee', 'Revale', 'uniek'], ['Myforce', 'Zeepboeren', 'uniek'],
]) {
  const { pair: p, ok } = checkKnownCase(prep, res, find(a).map((r) => r.idx), find(b).map((r) => r.idx), verwacht);
  if (!ok) process.exitCode = 1;
  console.log(`  ${ok ? 'OK ' : 'NOK'} ${a} / ${b}: ${p ? `${p.decision} (${p.score} p) ${p.reason}` : 'geen kandidaatpaar'} [verwacht ${verwacht}]`);
}
console.log('\nCentrales (telefoon):', [...prep.index.hubPhones].slice(0, 10).map((p) => `${p} -> ${[...prep.index.phoneNames.get(p)].join(' | ')}`));
console.log('\nEerste 12 twijfelparen:');
for (const p of res.review.slice(0, 12)) {
  const a = prep.records[p.i], b = prep.records[p.j];
  console.log(`  ${String(p.score).padStart(3)} ${a.fields.bedrijfsnaam} (${a.sourceLabel}) <-> ${b.fields.bedrijfsnaam} (${b.sourceLabel}): ${p.reason}`);
}
console.log('\nAutomatisch samengevoegd (eerste 15 groepen):');
for (const m of res.merged.filter((g) => g.members.length > 1).slice(0, 15)) console.log(`  nr ${m.nr} ${m.members.map((r) => `"${r.fields.bedrijfsnaam}" (${r.sourceLabel})`).join(' + ')}: ${m.reden}`);
const warn = prep.records.filter((r) => r.warnings.length);
console.log(`\nRijen met waarschuwingen: ${warn.length}`, warn.slice(0, 5).map((r) => `${r.sourceLabel} rij ${r.row}: ${r.warnings.join('; ')}`));
if (schrijf) {
  mkdirSync('dist', { recursive: true });
  const ctx = { version: 'dev', buildDate: todayIso(), datum: res.datum, verwerktOp: todayIso(), decisionLog: [] };
  writeFileSync(path.join('dist', resultFileName(res.datum)), globalThis.XLSX.write(buildResultWorkbook(prep, res, ctx), { type: 'buffer', bookType: 'xlsx' }));
  console.log(`\nGeschreven: dist/${resultFileName(res.datum)}`);
}
