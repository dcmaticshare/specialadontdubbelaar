// Bewaar het oorspronkelijke beoordelingsmateriaal; alleen een mens vult waarheidlabels in.
import { copyFileSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { processDir } from './lib.mjs';
import { readAssessment, evaluateQuality } from './quality.mjs';
import { readJson, fileHash, requireEqual } from './evidence.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const dir = 'dist/kwaliteit-ronde2';
const original = `${dir}/Testset_paren.xlsx`, workbook = `${dir}/Testset_beoordeeld.xlsx`, manifestFile = `${dir}/Testset_manifest.json`, declaration = `${dir}/Beoordelingsverklaring.json`;
try {
  const args = process.argv.slice(2), policy = readJson('docs/Releasecontract.json').privateSet;
  requireEqual(fileHash(original), policy.origineelSha256, 'De oorspronkelijke werkmap is gewijzigd.');
  requireEqual(fileHash(manifestFile), policy.manifestSha256, 'Het oorspronkelijke manifest is gewijzigd.');
  const manifest = readJson(manifestFile);
  if (!args.length) {
    if (!existsSync(workbook)) copyFileSync(original, workbook, constants.COPYFILE_EXCL);
    if (!existsSync(declaration)) writeFileSync(declaration, JSON.stringify({ versie: 1, beoordelaar: '', datum: '', onafhankelijk: false, alleParenBeoordeeld: false, werkmapSha256: '', manifestSha256: fileHash(manifestFile) }, null, 2) + '\n', { flag: 'wx' });
    console.log(`Beoordelingskopie klaar: ${workbook}. Bestaand werk is behouden. Lees docs/Private-beoordeling.md.`);
  } else if (args[0] === '--registreer' && args.length === 4 && args[1] === '--beoordelaar' && args[2].trim() && args[3] === '--onafhankelijk') {
    const judgments = await readAssessment(readFileSync(workbook));
    const { prep } = await processDir('testdata');
    const quality = evaluateQuality({ prep, manifest, judgments });
    // Ook een legitiem negatief kwaliteitsoordeel mag worden geregistreerd; schemafouten niet.
    if (quality.errors.length || quality.counts.gecontroleerd !== policy.paren) throw new Error('Beoordeling is onvolledig, tegenstrijdig of hoort niet bij deze bronset. Voer check:judged uit voor details.');
    const value = { versie: 1, beoordelaar: args[2].trim(), datum: new Date().toISOString(), onafhankelijk: true, alleParenBeoordeeld: true, werkmapSha256: fileHash(workbook), manifestSha256: fileHash(manifestFile) };
    mkdirSync(`${dir}/verklaringen`, { recursive: true });
    if (existsSync(declaration)) copyFileSync(declaration, `${dir}/verklaringen/verklaring-${Date.now()}.json`, constants.COPYFILE_EXCL);
    writeFileSync(declaration, JSON.stringify(value, null, 2) + '\n');
    console.log('Menselijke verklaring geregistreerd. De releasecontrole voert de kwaliteitsmeting opnieuw uit.');
  } else if (!(args.length === 1 && args[0] === '--status')) throw new Error('Gebruik zonder opties, --status, of --registreer --beoordelaar "naam" --onafhankelijk na eigen beoordeling.');
  const judgments = await readAssessment(readFileSync(workbook));
  const labels = judgments.map((j) => j.label.trim().toLowerCase());
  console.log(JSON.stringify({ verwacht: policy.paren, regels: labels.length, ingevuld: labels.filter((l) => ['zelfde', 'verschillend'].includes(l)).length, leeg: labels.filter((l) => !l).length, ongeldig: labels.filter((l) => l && !['zelfde', 'verschillend'].includes(l)).length, letOp: 'Voortgang, geen kwaliteitsgoedkeuring.' }));
} catch (e) { console.error(`Beoordelingsvoorbereiding mislukt: ${e.message}`); process.exitCode = 1; }
