// Gerichte opruiming van herkenbare synthetische uitvoer; geen algemene verwijdering van dist/.
import { lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { SETTINGS } from '../src/settings.js';
import { abandonedWorkspaces, projectRoot, safeDirectory } from './harness-temp.mjs';

function filesIn(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? filesIn(file) : entry.isFile() ? [file] : [];
  });
}

function measurement(file) {
  try {
    const json = file.replace(/\.(xlsx|png)$/, '.json');
    if (!lstatSync(json).isFile() || lstatSync(json).isSymbolicLink()) return false;
    const report = JSON.parse(readFileSync(json, 'utf8'));
    return ['node', 'browser'].includes(report.modus) && SETTINGS.prestaties.scenarios.includes(report.soort)
      && SETTINGS.prestaties.rijen.includes(report.aantal) && report.seed === SETTINGS.prestaties.seed
      && (file.endsWith('.png') || report.exportBytes === lstatSync(file).size);
  } catch { return false; }
}

export function cleanHarnessFiles({ root = projectRoot, dryRun = false } = {}) {
  const dist = safeDirectory(root, 'dist');
  const candidates = [];
  for (const folder of ['prestaties', 'controle', 'audit']) {
    const base = safeDirectory(root, 'dist/' + folder);
    for (const file of filesIn(base)) {
      const name = path.basename(file);
      const direct = path.dirname(file) === base;
      const browser = /^browser-(?:401-rijen|behoud|btw-conflict|constant|contacten(?:-herimport)?|herimport|ontkoppeld|postcode|verschillend|profiel-(?:\d+|huidig|null|object|onbekende-versie|onbeschikbaar|ongeldig-lid|ongeldig-veld|ongeldige-json|ontbreekt|oude-lijst))\.xlsx$/;
      const screenshot = /^(?:browser-(?:constante-kolommen|contactwaarschuwingen)|styling-(?:bestanden|kolommen|controleren|exporteren)-\d+)\.png$/;
      if ((/\.(xlsx|png)$/.test(name) && measurement(file))
        || (folder === 'controle' && direct && (browser.test(name) || screenshot.test(name)))
        || (folder === 'audit' && direct && ['browser-export.xlsx', 'browser-controle.png'].includes(name))) candidates.push(file);
    }
  }
  const dev = path.join(dist, 'Lead-ontdubbelaar.dev.html');
  try { if (lstatSync(dev).isFile()) candidates.push(dev); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const stale = abandonedWorkspaces(root);
  const files = [...candidates, ...stale.flatMap(filesIn)];
  const result = { bestanden: files.length, bytes: files.reduce((sum, file) => sum + lstatSync(file).size, 0), tijdelijkeMappen: stale.length, voorvertoning: dryRun };
  if (!dryRun) {
    for (const file of candidates) rmSync(file);
    for (const dir of stale) rmSync(dir, { recursive: true, force: true });
  }
  return result;
}
