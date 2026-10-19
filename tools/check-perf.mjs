// Meten schrijft uitsluitend synthetische bestanden onder dist/. Controleren faalt gesloten.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { SETTINGS } from '../src/settings.js';
import { checkMeasurements } from './performance-contract.mjs';
import { sourceHash } from './evidence.mjs';
import { runPerformanceSample } from './performance-run.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const config = SETTINGS.prestaties;
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', timeout: config.timeoutMs });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Controle mislukt (${result.status ?? result.signal}): ${args.join(' ')}`);
}
function check(report) {
  const errors = checkMeasurements(report);
  if (errors.length) throw new Error(`PRESTATIECONTROLE MISLUKT:\n${errors.join('\n')}`);
  console.log(`PRESTATIECONTROLE OK: ${report.samples.length} volledige metingen, kwaliteitswaarborgen en budgetten.`);
}
try {
  const args = process.argv.slice(2);
  if (args[0] === '--controleer' && args.length === 2) {
    check(JSON.parse(readFileSync(args[1], 'utf8')));
  } else {
    if (args.length && !(args[0] === '--meet' && args.length === 2)) throw new Error('Gebruik: node tools/check-perf.mjs [--meet dist/map | --controleer rapport.json]');
    if (process.versions.node !== readFileSync('.node-version', 'utf8').trim()) throw new Error('Verkeerde Node-versie.');
    const out = path.resolve(args[1] || `dist/prestaties/controle-${Date.now()}`);
    if (!out.startsWith(path.resolve('dist') + path.sep)) throw new Error('Meetuitvoer moet onder de genegeerde map dist/ staan.');
    mkdirSync(path.dirname(out), { recursive: true });
    mkdirSync(out); // Geen eerdere metingen of downloads overschrijven.
    const require = createRequire(import.meta.url);
    const report = { versie: config.versie, datum: new Date().toISOString(), bronSha256: sourceHash(),
      referentie: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, geheugenBytes: os.totalmem(), node: process.versions.node, browser: '', playwright: require('playwright/package.json').version },
      besturingssysteem: { release: os.release(), versie: os.version() },
      meetmethode: 'Sequentieel, vers proces/browserprofiel per scenario. Synthetische CSV-invoer, XLSX-uitvoer. Werkmapcontrole in afzonderlijk proces buiten de gemeten fasen.', samples: [] };
    // Correctheid blijft verplicht, ook bij een nieuwe baseline zonder vastgelegde tijdgrenzen.
    run(['tools/check.mjs', '--tests']);
    run(['tools/check-quality.mjs']);
    run(['build.mjs']);
    const save = () => writeFileSync(path.join(out, 'rapport.json'), JSON.stringify(report, null, 2));
    save();
    for (let repeat = 1; repeat <= config.herhalingen; repeat++) for (const modus of ['node', 'browser']) for (const aantal of config.rijen) for (const soort of config.scenarios) {
      const dest = path.join(out, `${modus}-${soort}-${aantal}-${repeat}`);
      console.log(`Meting ${report.samples.length + 1}: ${modus}, ${soort}, ${aantal} rijen, herhaling ${repeat}`);
      const sample = { ...await runPerformanceSample({ modus, soort, aantal, dest }), run: repeat };
      if (modus === 'browser') {
        if (report.referentie.browser && report.referentie.browser !== sample.browser) throw new Error('Browser veranderde tijdens de meetreeks.');
        report.referentie.browser = sample.browser;
      }
      report.samples.push(sample); save();
    }
    if (sourceHash() !== report.bronSha256) throw new Error('Broncode gewijzigd tijdens de meetreeks: niet vergelijkbaar.');
    if (args[0] === '--meet') {
      // Een baseline mag grenzen nog niet vastleggen, maar ongeldige metingen blijven fouten.
      const unlimited = Object.fromEntries(report.samples.map((s) => [`${s.modus}/${s.soort}/${s.aantal}`, {
        ...Object.fromEntries(['totaalMs', 'piekRssBytes', 'kandidaten', 'exportBytes', 'browserBlokkadeMs', 'timerVertragingMs'].map((k) => [k, Number.MAX_VALUE])),
        fasen: Object.fromEntries(config.fasen.map((k) => [k, Number.MAX_VALUE])),
      }]));
      const errors = checkMeasurements(report, unlimited, report.referentie);
      if (errors.length) throw new Error(`Ongeldige baseline:\n${errors.join('\n')}`);
      console.log(`MEETREEKS VOLTOOID, nog geen budgetoordeel: ${path.join(out, 'rapport.json')}`);
    }
    else check(report);
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }
