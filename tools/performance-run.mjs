// Alleen het compacte meetrapport blijft bewaard, ook wanneer de werkmapcontrole faalt.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SETTINGS } from '../src/settings.js';
import { withHarnessWorkspace, projectRoot, safeDirectory } from './harness-temp.mjs';

function runCommand(args) {
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio: 'inherit', timeout: SETTINGS.prestaties.timeoutMs });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Meting of werkmapcontrole mislukt (${result.status ?? result.signal}).`);
}

export async function runPerformanceSample({ modus, soort, aantal, dest }, { root = projectRoot, run = runCommand } = {}) {
  if (!['node', 'browser'].includes(modus)) throw new Error('Onbekende meetmodus.');
  const output = path.resolve(dest);
  const dist = safeDirectory(root, 'dist');
  if (!output.startsWith(dist + path.sep)) throw new Error('Meetrapport moet onder dist/ blijven.');
  safeDirectory(root, path.relative(root, path.dirname(output)));
  return withHarnessWorkspace('prestatie', async (dir) => {
    const temporary = path.join(dir, 'meting');
    try {
      await run(['tools/performance-' + modus + '.mjs', soort, String(aantal), temporary]);
      await run(['tools/performance-verify.mjs', temporary]);
      return JSON.parse(readFileSync(temporary + '.json', 'utf8'));
    } finally {
      if (existsSync(temporary + '.json')) copyFileSync(temporary + '.json', output + '.json');
    }
  }, { root });
}
