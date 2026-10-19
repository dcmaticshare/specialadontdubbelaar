// Maakt een zelfstandig overdraagbaar pakket met uitsluitend synthetische invoer.
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { behoud, nieuw } from '../test/fixtures/browser-lijsten.mjs';
import { readJson, fileHash, localOutput } from './evidence.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
try {
  if (process.argv.length > 3) throw new Error('Gebruik: node tools/prepare-windows.mjs [dist/nieuwe-map]');
  const policy = readJson('docs/Releasecontract.json');
  const result = spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit', env: { ...process.env, SOURCE_DATE_EPOCH: policy.sourceDateEpoch } });
  if (result.status !== 0) throw new Error('Productiebuild mislukt.');
  mkdirSync('dist', { recursive: true });
  const out = localOutput(process.argv[2] || 'dist/windows-acceptatie');
  mkdirSync(path.dirname(out), { recursive: true }); mkdirSync(out);
  for (const [from, to] of [['dist/Lead-ontdubbelaar.html', 'Lead-ontdubbelaar.html'], ['docs/Windows-acceptatie.md', 'Windows-acceptatie.md'], ['tools/windows-acceptance.ps1', 'registreer-windows.ps1']]) copyFileSync(from, path.join(out, to));
  for (const file of [behoud(), nieuw()]) writeFileSync(path.join(out, file.name), file.buffer, { flag: 'wx' });
  const files = ['Lead-ontdubbelaar.html', 'Windows-acceptatie.md', 'registreer-windows.ps1', 'synthetisch.csv', 'nieuwe-lijst.csv'];
  writeFileSync(path.join(out, 'pakket.json'), JSON.stringify({ versie: 1, bestanden: Object.fromEntries(files.map((name) => [name, fileHash(path.join(out, name))])) }, null, 2));
  console.log(`Windows-pakket gereed: ${path.relative(process.cwd(), out)}. Acceptatie is nog niet uitgevoerd.`);
} catch (e) { console.error(`Windows-voorbereiding mislukt: ${e.message}`); process.exitCode = 1; }
