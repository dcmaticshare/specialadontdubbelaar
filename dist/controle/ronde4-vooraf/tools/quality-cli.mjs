// Beide opdrachten gebruiken precies dezelfde parser, datasetcontrole en evaluator.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { processDir } from './lib.mjs';
import { createManifest, recordIds, buildAssessmentWorkbook, readAssessment, evaluateQuality } from './quality.mjs';
import { todayIso } from '../src/engine/text.js';

function options(args) {
  const opt = { mode: null, dir: 'testdata' };
  let hasDir = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const value = () => { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Waarde ontbreekt na ${a}.`); return args[++i]; };
    if (a === '--maak' || a === '--meet') {
      if (opt.mode) throw new Error('Kies precies één opdracht: --maak of --meet.');
      opt.mode = a.slice(2); if (a === '--meet') opt.file = value();
    } else if (a === '--manifest') opt.manifest = value();
    else if (a === '--uit') opt.out = value();
    else if (a === '--paren') opt.pairs = value();
    else if (a === '--rapport') opt.report = value();
    else if (a.startsWith('--') || hasDir) throw new Error(`Onbekend argument: ${a}`);
    else { opt.dir = a; hasDir = true; }
  }
  if (!opt.mode) throw new Error('Gebruik --maak [map] of --meet <beoordeelde.xlsx> [map], met het bijbehorende --manifest.');
  if (opt.mode === 'meet' && (opt.out || opt.pairs)) throw new Error('--uit en --paren horen bij --maak.');
  return opt;
}

export async function qualityMain(args) {
  const opt = options(args);
  const manifestFile = opt.manifest || path.join(path.dirname(opt.file || opt.out || 'dist/testset.xlsx'), 'Testset_manifest.json');
  if (opt.mode === 'meet') {
    if (!existsSync(opt.file)) throw new Error('Het verplichte beoordelingsbestand ontbreekt: kwaliteitscontrole niet uitgevoerd.');
    if (!existsSync(manifestFile)) throw new Error('Het verplichte datasetmanifest ontbreekt: maak een testset met --maak en bewaar het JSON-manifest.');
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const judgments = await readAssessment(readFileSync(opt.file), path.basename(opt.file));
    const { prep } = await processDir(opt.dir, { ignoreFiles: [path.basename(opt.file)] });
    const result = evaluateQuality({ prep, manifest, judgments });
    if (opt.report) {
      mkdirSync(path.dirname(opt.report), { recursive: true });
      writeFileSync(opt.report, JSON.stringify(result, null, 2) + '\n');
    }
    const { pairs, ...summary } = result;
    console.log(JSON.stringify(summary, null, 2));
    return result.ok ? 0 : 1;
  }
  const { prep } = await processDir(opt.dir);
  if (prep.records.length < 2) throw new Error('Er zijn minstens twee bronrijen nodig voor een beoordeling.');
  const ids = recordIds(prep), byId = new Map(ids.map((id, i) => [id, i]));
  let pairs;
  if (opt.pairs) {
    const selected = JSON.parse(readFileSync(opt.pairs, 'utf8'));
    if (!Array.isArray(selected)) throw new Error('--paren vereist een JSON-lijst van [Record A, Record B].');
    pairs = selected.map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((id) => byId.has(id))) throw new Error('Onbekende testrecord-ID in --paren.');
      return pair.map((id) => byId.get(id));
    });
  }
  const manifest = createManifest(prep, { ...(pairs ? { pairs } : {}) });
  const out = opt.out || path.join('dist', `Testset_paren_${todayIso()}.xlsx`);
  if (existsSync(out) || existsSync(manifestFile)) throw new Error('Testset of manifest bestaat al. Kies een nieuwe uitvoermap om bestaand beoordelingswerk te behouden.');
  const bytes = globalThis.XLSX.write(buildAssessmentWorkbook(prep, manifest), { type: 'buffer', bookType: 'xlsx', compression: true });
  mkdirSync(path.dirname(out), { recursive: true }); mkdirSync(path.dirname(manifestFile), { recursive: true });
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(out, bytes, { flag: 'wx' });
  console.log(`Testset gemaakt: ${manifest.records.length} bronrijen, ${manifest.pairs.length} verplichte beoordelingen.\nWerkmap: ${out}\nManifest: ${manifestFile}`);
  return 0;
}
