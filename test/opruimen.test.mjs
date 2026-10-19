import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { withHarnessWorkspace } from '../tools/harness-temp.mjs';
import { cleanHarnessFiles } from '../tools/cleanup.mjs';
import { runPerformanceSample } from '../tools/performance-run.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'lead-opruimen-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, data = 'Bewaren') => { const p = path.join(root, file); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, data); return p; };
  return { root, put };
}

test('harness ruimt eigen bestanden op bij succes en fout, zonder een gelijktijdige run te raken', async (t) => {
  const { root, put } = fixture(t);
  const source = put('testdata/bron.csv');
  await withHarnessWorkspace('buitenste', async (outer) => {
    writeFileSync(path.join(outer, 'download.xlsx'), 'Tijdelijk');
    for (const fail of [false, true]) {
      let temporary;
      const run = withHarnessWorkspace('binnenste', async (dir) => {
        temporary = dir; writeFileSync(path.join(dir, 'download.xlsx'), 'Tijdelijk');
        if (fail) throw new Error('Bewuste fout');
        return 42;
      }, { root });
      if (fail) await assert.rejects(run, /Bewuste fout/); else assert.equal(await run, 42);
      assert.equal(existsSync(temporary), false);
      assert.equal(existsSync(path.join(outer, 'download.xlsx')), true);
    }
  }, { root });
  assert.deepEqual(readdirSync(path.join(root, 'dist/.harness-tmp')), []);
  assert.equal(readFileSync(source, 'utf8'), 'Bewaren');
});

test('opruimen bewaart productie, private gegevens, rapporten, onbekende bestanden en symlinks', (t) => {
  const { root, put } = fixture(t);
  const kept = ['dist/Lead-ontdubbelaar.html', 'testdata/bron.xlsx', 'dist/Leads_ontdubbeld.xlsx', 'dist/kwaliteit-ronde2/Testset_beoordeeld.xlsx', 'dist/windows-acceptatie/gedownload.xlsx', 'dist/release/controle/rapport.json', 'dist/prestaties/run/onbekend.xlsx', 'dist/controle/browser-mijn-lijst.xlsx'];
  kept.forEach((file) => put(file));
  const metadata = { modus: 'node', soort: 'uniek', aantal: 1000, seed: 12345, exportBytes: 8 };
  const json = put('dist/prestaties/run/meting.json', JSON.stringify(metadata));
  const generated = [put('dist/prestaties/run/meting.xlsx', '12345678'), put('dist/prestaties/run/meting.png'), put('dist/controle/browser-behoud.xlsx'), put('dist/Lead-ontdubbelaar.dev.html')];
  put('dist/controle/verkeerde-grootte.json', JSON.stringify(metadata));
  const wrongSize = put('dist/controle/verkeerde-grootte.xlsx', 'Andere inhoud');
  symlinkSync(path.join(root, 'testdata'), path.join(root, 'dist/controle/bronlink'), 'dir');
  symlinkSync(path.join(root, 'testdata/bron.xlsx'), path.join(root, 'dist/controle/browser-constant.xlsx'));
  const before = readFileSync(json);
  assert.equal(cleanHarnessFiles({ root, dryRun: true }).bestanden, 4);
  generated.forEach((file) => assert.ok(existsSync(file)));
  assert.equal(cleanHarnessFiles({ root }).bestanden, 4);
  generated.forEach((file) => assert.equal(existsSync(file), false));
  kept.forEach((file) => assert.ok(existsSync(path.join(root, file)), file));
  assert.ok(existsSync(wrongSize));
  assert.deepEqual(readFileSync(json), before);
  assert.equal(cleanHarnessFiles({ root }).bestanden, 0);
});

test('harness weigert een symlink als uitvoermap', async (t) => {
  const { root } = fixture(t);
  const elsewhere = realpathSync(mkdtempSync(path.join(tmpdir(), 'lead-buiten-')));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  symlinkSync(elsewhere, path.join(root, 'dist'), 'dir');
  await assert.rejects(withHarnessWorkspace('proef', async () => {}, { root }), /symbolische/);
  assert.throws(() => cleanHarnessFiles({ root }), /symbolische/);
  assert.deepEqual(readdirSync(elsewhere), []);
});

for (const failure of [null, 'meting', 'verificatie']) test(`prestatieharness bewaart rapport en ruimt downloads op: ${failure || 'geslaagd'}`, async (t) => {
  const { root } = fixture(t);
  const dest = path.join(root, 'dist/prestaties/proef/meting');
  const calls = [];
  let temporary;
  const run = async (args) => {
    calls.push(args[0]); temporary = args.at(-1);
    writeFileSync(temporary + '.xlsx', 'Synthetische uitvoer');
    writeFileSync(temporary + '.png', 'Schermafbeelding');
    if (failure === 'meting') throw new Error('Meting afgebroken');
    writeFileSync(temporary + '.json', JSON.stringify({ gecontroleerd: calls.length === 2 && !failure }));
    if (failure === 'verificatie' && calls.length === 2) throw new Error('Werkmap afgewezen');
  };
  const pending = runPerformanceSample({ modus: 'node', soort: 'uniek', aantal: 1000, dest }, { root, run });
  if (failure) await assert.rejects(pending); else assert.deepEqual(await pending, { gecontroleerd: true });
  assert.equal(calls.length, failure === 'meting' ? 1 : 2);
  assert.equal(existsSync(temporary + '.xlsx'), false);
  assert.equal(existsSync(temporary + '.png'), false);
  assert.equal(existsSync(dest + '.json'), failure !== 'meting');
  if (failure === 'verificatie') assert.equal(JSON.parse(readFileSync(dest + '.json')).gecontroleerd, false);
  assert.deepEqual(readdirSync(path.join(root, 'dist/.harness-tmp')), []);
});

test('harness ruimt op bij expliciete foutuitgang', (t) => {
  const { root } = fixture(t);
  const module = new URL('../tools/harness-temp.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `import { withHarnessWorkspace } from ${JSON.stringify(module)}; await withHarnessWorkspace('exit', async () => process.exit(7), { root: ${JSON.stringify(root)} });`]);
  assert.equal(run.status, 7);
  assert.deepEqual(readdirSync(path.join(root, 'dist/.harness-tmp')), []);
});

for (const failure of ['test', 'buildcontrole']) test(`publieke CLI ruimt achtergelaten testbestanden op na een fout in ${failure}`, (t) => {
  const { root, put } = fixture(t);
  put('.node-version', process.versions.node);
  put('testdata/bewaren.csv');
  put('test/proef.test.mjs', `import { writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import path from 'node:path'; writeFileSync(path.join(tmpdir(), 'achtergelaten.xlsx'), 'Synthetisch'); ${failure === 'test' ? 'throw new Error("Bewuste testfout");' : ''}`);
  put('build.mjs', `import { writeFileSync } from 'node:fs'; writeFileSync(process.argv.includes('--dev') ? 'dist/Lead-ontdubbelaar.dev.html' : 'dist/Lead-ontdubbelaar.html', 'Synthetische build');`);
  put('tools/check-build.mjs', 'throw new Error("Bewuste buildfout");');
  for (const file of ['check.mjs', 'harness-temp.mjs']) copyFileSync(new URL('../tools/' + file, import.meta.url), path.join(root, 'tools', file));
  const result = spawnSync(process.execPath, [path.join(root, 'tools/check.mjs')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(readdirSync(path.join(root, 'dist/.harness-tmp')), []);
  assert.equal(existsSync(path.join(root, 'dist/Lead-ontdubbelaar.dev.html')), false);
  assert.equal(readFileSync(path.join(root, 'testdata/bewaren.csv'), 'utf8'), 'Bewaren');
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL']) test(`harness ruimt op na ${signal}, meteen of bij de volgende run`, async (t) => {
  const { root } = fixture(t);
  const module = new URL('../tools/harness-temp.mjs', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import { withHarnessWorkspace } from ${JSON.stringify(module)}; await withHarnessWorkspace('signaal', async () => { process.send('klaar'); await new Promise(() => setInterval(() => {}, 1000)); }, { root: ${JSON.stringify(root)} });`], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  await once(child, 'message');
  const ended = once(child, 'exit'); child.kill(signal); await ended;
  if (signal !== 'SIGKILL') assert.deepEqual(readdirSync(path.join(root, 'dist/.harness-tmp')), []);
  await withHarnessWorkspace('volgende', async () => {}, { root });
  assert.deepEqual(readdirSync(path.join(root, 'dist/.harness-tmp')), []);
});
