// Alleen deze opdracht geeft een releasestatus; alle uitvoer en private details blijven lokaal.
import { mkdirSync, writeFileSync, openSync, closeSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SETTINGS } from '../src/settings.js';
import { readJson, fileHash, sourceHash, localOutput, requireEqual, sha256 } from './evidence.mjs';
import { checkRelease, checkPrivateEvidence, checkPerformanceEvidence, checkWindowsEvidence } from './release-contract.mjs';
import { checkWindowsWorkbook } from './windows-workbook.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

try {
  // CI mag nooit private lijsten openen of private rapporten als artefact meenemen.
  if (process.env.CI && process.env.CI !== 'false') throw new Error('check:release is een lokale private controle; hosted CI gebruikt uitsluitend openbare controles.');
  const opt = { bronmap: 'testdata', manifest: 'dist/kwaliteit-ronde2/Testset_manifest.json', beoordelingen: 'dist/kwaliteit-ronde2/Testset_beoordeeld.xlsx', verklaring: 'dist/kwaliteit-ronde2/Beoordelingsverklaring.json', prestaties: 'dist/prestaties/release-eindmeting/rapport.json', windows: 'dist/windows-acceptatie/windows-bewijs.json', uit: `dist/release/controle-${Date.now()}` };
  const args = process.argv.slice(2), seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2), value = args[i + 1];
    if (!args[i].startsWith('--') || !(key in opt) || seen.has(key) || !value || value.startsWith('--')) throw new Error('Gebruik uitsluitend --bronmap, --manifest, --beoordelingen, --verklaring, --prestaties, --windows of --uit, elk met één pad. Controles overslaan is niet toegestaan.');
    seen.add(key); opt[key] = value;
  }
  requireEqual(process.versions.node, readJson('package.json').engines.node, 'Verkeerde Node-versie.');
  const policy = readJson('docs/Releasecontract.json');
  mkdirSync('dist', { recursive: true });
  const out = localOutput(opt.uit);
  mkdirSync(path.dirname(out), { recursive: true }); mkdirSync(out);
  const report = { versie: 1, datum: new Date().toISOString(), bronSha256: sourceHash(process.cwd(), true), htmlSha256: null, ok: false, controles: {} };
  function inputHash() {
    const hashOrMissing = (file) => { try { return fileHash(file); } catch { return 'ontbreekt'; } };
    const paths = ['manifest', 'beoordelingen', 'verklaring', 'prestaties', 'windows'].map((key) => [key, hashOrMissing(opt[key])]);
    try {
      for (const file of readdirSync(opt.bronmap).filter((f) => /\.(xlsx|xls|csv)$/i.test(f) && !/^(Testset_|Leads_ontdubbeld_|~\$)/.test(f)).sort()) paths.push([file, hashOrMissing(path.join(opt.bronmap, file))]);
    } catch { paths.push(['bronmap', 'ontbreekt']); }
    return sha256(JSON.stringify(paths));
  }
  report.invoerSha256 = inputHash();
  const save = () => writeFileSync(path.join(out, 'rapport.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  const env = { ...process.env, SOURCE_DATE_EPOCH: policy.sourceDateEpoch };
  function command(key, args) {
    const log = path.join(out, `${key}.log`), fd = openSync(log, 'wx');
    let run;
    try { run = spawnSync(process.execPath, args, { env, stdio: ['ignore', fd, fd], timeout: SETTINGS.release.controleTimeoutMs }); }
    finally { closeSync(fd); }
    report.controles[key] = { ok: run.status === 0 && !run.error, exitcode: run.status ?? 1, bewijsSha256: fileHash(log), log: path.basename(log) };
    save(); console.log(`${key}: ${report.controles[key].ok ? 'OK' : 'GEBLOKKEERD (zie lokaal log)'}`);
  }
  function evidence(key, verify) {
    const log = path.join(out, `${key}-bewijs.json`);
    try {
      const details = verify();
      writeFileSync(log, JSON.stringify({ ok: true, ...details }, null, 2));
      report.controles[key] = { ok: true, exitcode: 0, bewijsSha256: fileHash(log) };
    } catch (e) {
      writeFileSync(log, JSON.stringify({ ok: false, fout: e.message }, null, 2));
      report.controles[key] = { ok: false, exitcode: 1, bewijsSha256: fileHash(log) };
    }
    save(); console.log(`${key}: ${report.controles[key].ok ? 'OK' : 'GEBLOKKEERD (bewijs ontbreekt, faalt of is verouderd)'}`);
  }
  command('openbaar', ['tools/check.mjs']);
  command('synthetischeKwaliteit', ['tools/check-quality.mjs']);
  command('browser', ['tools/check-browser.mjs']);
  try { report.htmlSha256 = fileHash('dist/Lead-ontdubbelaar.html'); } catch { /* Ontbrekende HTML blijft een releasefout. */ }
  command('privateVoorbeelden', ['tools/run-testdata.mjs', opt.bronmap]);
  const qualityReport = path.join(out, 'private-kwaliteit.json');
  command('privateBeoordelingen', ['tools/private/controle-beoordelingen.mjs', '--meet', opt.beoordelingen, opt.bronmap, '--manifest', opt.manifest, '--rapport', qualityReport]);
  const judged = report.controles.privateBeoordelingen;
  evidence('privateBeoordelingen', () => {
    requireEqual(judged.ok, true, 'Private evaluatie is niet geslaagd; zie privateBeoordelingen.log.');
    checkPrivateEvidence({ manifest: readJson(opt.manifest), manifestHash: fileHash(opt.manifest), workbookHash: fileHash(opt.beoordelingen), declaration: readJson(opt.verklaring), quality: readJson(qualityReport), policy: policy.privateSet });
    return { werkmapSha256: fileHash(opt.beoordelingen), manifestSha256: fileHash(opt.manifest), verklaringSha256: fileHash(opt.verklaring), rapportSha256: fileHash(qualityReport) };
  });
  evidence('prestaties', () => {
    checkPerformanceEvidence(readJson(opt.prestaties), sourceHash());
    return { rapportSha256: fileHash(opt.prestaties) };
  });
  evidence('windows', () => {
    checkWindowsEvidence(readJson(opt.windows), { htmlHash: report.htmlSha256, procedureHash: fileHash('docs/Windows-acceptatie.md'), dir: path.dirname(opt.windows), checkWorkbook: checkWindowsWorkbook });
    return { rapportSha256: fileHash(opt.windows) };
  });
  report.fouten = checkRelease(report, sourceHash(process.cwd(), true), fileHash('dist/Lead-ontdubbelaar.html'));
  if (report.invoerSha256 !== inputHash()) report.fouten.push('Private invoer of vereist bewijs is gewijzigd tijdens de releasecontrole.');
  report.ok = report.fouten.length === 0; save();
  console.log(`RELEASE ${report.ok ? 'OK' : 'GEBLOKKEERD'}. Lokaal rapport: ${path.relative(process.cwd(), out)}/rapport.json`);
  process.exitCode = report.ok ? 0 : 1;
} catch (e) { console.error(`Releasecontrole mislukt: ${e.message}`); process.exitCode = 1; }
