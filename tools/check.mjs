// Publieke controle: alleen vaste synthetische tests; leest nooit testdata/.
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withHarnessWorkspace } from './harness-temp.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const pinned = readFileSync('.node-version', 'utf8').trim();
if (process.versions.node !== pinned) throw new Error(`Gebruik Node ${pinned}; gevonden ${process.versions.node}.`);
await withHarnessWorkspace('openbaar', async (temporary) => {
  // Ook tijdelijke bestanden van losse tests en hun subprocessen vallen onder de opruiming.
  const baseEnv = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
  const run = (args, env = baseEnv) => {
    const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      process.exitCode = r.status || 1;
      throw new Error(`Controle mislukt: ${args.join(' ')}`);
    }
  };
  const tests = readdirSync('test').filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `test/${f}`);
  run(['--test', ...tests]);
  if (!process.argv.includes('--tests')) {
    const env = { ...baseEnv, SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH || '1792195200' };
    run(['build.mjs'], env);
    const first = readFileSync('dist/Lead-ontdubbelaar.html');
    run(['build.mjs'], env);
    if (!first.equals(readFileSync('dist/Lead-ontdubbelaar.html'))) throw new Error('Build is niet reproduceerbaar.');
    const removeDev = () => rmSync('dist/Lead-ontdubbelaar.dev.html', { force: true });
    process.once('exit', removeDev);
    try {
      run(['build.mjs', '--dev'], env);
      run(['tools/check-build.mjs']);
    } finally { removeDev(); process.off('exit', removeDev); }
  }
});
