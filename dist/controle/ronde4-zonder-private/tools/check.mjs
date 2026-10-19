// Publieke controle: alleen vaste synthetische tests; leest nooit testdata/.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const pinned = readFileSync('.node-version', 'utf8').trim();
if (process.versions.node !== pinned) throw new Error(`Gebruik Node ${pinned}; gevonden ${process.versions.node}.`);
const run = (args, env = process.env) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
};
const tests = readdirSync('test').filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `test/${f}`);
run(['--test', ...tests]);
if (!process.argv.includes('--tests')) {
  const env = { ...process.env, SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH || '1792195200' };
  run(['build.mjs'], env);
  const first = readFileSync('dist/Lead-ontdubbelaar.html');
  run(['build.mjs'], env);
  if (!first.equals(readFileSync('dist/Lead-ontdubbelaar.html'))) throw new Error('Build is niet reproduceerbaar.');
  run(['build.mjs', '--dev'], env);
  run(['tools/check-build.mjs']);
}
