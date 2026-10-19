import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { withHarnessWorkspace } from '../tools/harness-temp.mjs';

async function withBuildFixture(work) {
  await withHarnessWorkspace('build-regressie', async (dir) => {
    const put = (file, text) => {
      const target = path.join(dir, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    };
    copyFileSync(new URL('../build.mjs', import.meta.url), path.join(dir, 'build.mjs'));
    put('package.json', JSON.stringify({ type: 'module', version: '0.0.0-test' }));
    put('src/index.html', '<!doctype html><html><head><style>__STYLES__</style></head><body><script>__VENDOR__</script><script>__APP__</script></body></html>');
    put('src/styles.css', 'body { color: black; }');
    put('src/ui/app.js', 'window.resultaat = 42;');
    put('vendor/xlsx.full.min.js', '// Synthetische bibliotheek.');
    put('vendor/LICENSE-SheetJS.txt', 'Synthetische licentie SheetJS.');
    put('vendor/LICENSE-Inter.txt', 'Synthetische licentie Inter.');
    const run = (dev = false) => spawnSync(process.execPath, ['build.mjs', ...(dev ? ['--dev'] : [])], {
      cwd: dir, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, SOURCE_DATE_EPOCH: '1792195200' },
    });
    await work({ dir, put, run });
  });
}

function assertRejected({ dir, put, run }, expected) {
  // Beide buildvarianten moeten stoppen vóór schrijven, ook als er al een vorige build bestaat.
  for (const dev of [false, true]) {
    const output = `dist/Lead-ontdubbelaar${dev ? '.dev' : ''}.html`;
    for (const previous of [false, true]) {
      if (previous) put(output, 'Vorige geldige build bewaren.');
      const result = run(dev);
      assert.ifError(result.error);
      assert.equal(result.status, 1, 'De build moet de ongeldige invoer weigeren.');
      assert.match(result.stderr, expected);
      if (previous) assert.equal(readFileSync(path.join(dir, output), 'utf8'), 'Vorige geldige build bewaren.');
      else assert.equal(existsSync(path.join(dir, output)), false);
    }
  }
}

for (const name of ['SheetJS', 'Inter']) test(`build weigert een HTML-commentaarsluiting in de licentie van ${name}`, async () => {
  await withBuildFixture((fixture) => {
    fixture.put(`vendor/LICENSE-${name}.txt`, 'Synthetische licentie.\n-->\n<p>Onbedoelde opmaak</p>');
    assertRejected(fixture, new RegExp(`Onveilig licentiecommentaar.*LICENSE-${name}\\.txt`));
  });
});

for (const length of [1, 2, 3]) test(`build weigert een kringimport van ${length} module(s) met het importpad`, async () => {
  await withBuildFixture((fixture) => {
    const names = ['app', 'tweede', 'derde'].slice(0, length);
    names.forEach((name, i) => {
      const next = names[(i + 1) % names.length];
      const statement = i % 2 ? `import * as volgende from './${next}.js';` : `import { waarde as volgende } from './${next}.js';`;
      fixture.put(`src/ui/${name}.js`, `${statement}\nexport const waarde = volgende;`);
    });
    const chain = [...names, names[0]].map((name) => `src/ui/${name}\\.js`).join(' -> ');
    assertRejected(fixture, new RegExp(`Kringimport.*${chain}`));
  });
});

test('build bewaart geldige licentieteksten ongewijzigd in het HTML-commentaar', async () => {
  await withBuildFixture(({ dir, put, run }) => {
    const license = 'Synthetische licentie — © 2026.\nAlle rechten volgens deze tekst.\n';
    put('vendor/LICENSE-SheetJS.txt', license);
    const result = run();
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(path.join(dir, 'dist/Lead-ontdubbelaar.html'), 'utf8');
    assert.ok(html.includes(`<!-- Licentie SheetJS\n${license}\nLicentie Inter\nSynthetische licentie Inter.\n-->`));
  });
});

test('hoofdpagina bevat de productiebuild en blijft ongewijzigd bij een ontwikkelbuild', async () => {
  await withBuildFixture(({ dir, put, run }) => {
    assert.equal(run().status, 0);
    const production = readFileSync(path.join(dir, 'dist/Lead-ontdubbelaar.html'));
    assert.deepEqual(readFileSync(path.join(dir, 'index.html')), production);
    put('src/ui/app.js', 'window.resultaat = 99;');
    assert.equal(run(true).status, 0);
    assert.notDeepEqual(readFileSync(path.join(dir, 'dist/Lead-ontdubbelaar.dev.html')), production);
    assert.deepEqual(readFileSync(path.join(dir, 'index.html')), production);
    assert.equal(run().status, 0);
    assert.notDeepEqual(readFileSync(path.join(dir, 'index.html')), production);
    assert.deepEqual(readFileSync(path.join(dir, 'index.html')), readFileSync(path.join(dir, 'dist/Lead-ontdubbelaar.html')));
  });
});

test('build staat gedeelde afhankelijkheden toe en voert een module maar eenmaal uit', async () => {
  await withBuildFixture(({ dir, put, run }) => {
    put('src/ui/app.js', "import { links } from './links.js';\nimport * as rechts from './rechts.js';\nwindow.resultaat = links + rechts.waarde;");
    put('src/ui/links.js', "import { waarde } from './gedeeld.js';\nexport const links = waarde;");
    put('src/ui/rechts.js', "import * as gedeeld from './gedeeld.js';\nexport const waarde = gedeeld.waarde;");
    put('src/ui/gedeeld.js', 'window.aantal = (window.aantal || 0) + 1;\nexport const waarde = 21;');
    const result = run();
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(path.join(dir, 'dist/Lead-ontdubbelaar.html'), 'utf8');
    const context = vm.createContext({ window: {} });
    for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script, context);
    assert.equal(context.window.resultaat, 42);
    assert.equal(context.window.aantal, 1);
  });
});
