import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { XLSX, reopen } from './helpers/fixtures.mjs';
import { processDir } from '../tools/lib.mjs';

// De auditgevallen gebruiken bewust het oude bestand: het mag niet stilzwijgend groen worden.
for (const scenario of ['lege beoordeling', 'ongeldig label', 'bestaand paar buiten kandidaten', 'verkeerde kolommen']) {
  test(`B05 CLI: ${scenario} geeft geen succes`, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lead-kwaliteit-rood-'));
    try {
      writeFileSync(path.join(dir, 'bron.csv'), 'Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\nDenkplaats;030001002;Verzinselweg 17\n');
      const header = ['Oordeel (zelfde / verschillend)', 'Vingerafdruk A', 'Vingerafdruk B'];
      // Vaste synthetische vingerafdrukken houden het oude formaat onafhankelijk van de huidige engine.
      const rows = [[scenario === 'lege beoordeling' ? '' : scenario === 'ongeldig label' ? 'zeker-weten' : 'zelfde',
        'fabelwinkel|020001001|||teststraat42', 'denkplaats|030001002|||verzinselweg17']];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([scenario === 'verkeerde kolommen' ? ['X', 'Y', 'Z'] : header, ...rows]), 'Paren');
      const file = path.join(dir, 'Testset_beoordeeld.xlsx');
      writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
      const run = spawnSync(process.execPath, ['tools/testset.mjs', '--meet', file, dir], { encoding: 'utf8' });
      assert.notEqual(run.status, 0, 'ongeldige of gemiste beoordeling mag nooit groen worden');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('B05 private runner: ontbrekende gekende gevallen geven exitcode 1', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lead-kwaliteit-runner-'));
  try {
    writeFileSync(path.join(dir, 'bron.csv'), 'Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\n');
    const run = spawnSync(process.execPath, ['tools/run-testdata.mjs', dir], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.equal((run.stdout.match(/^  NOK/gm) || []).length, 6);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

async function assessedFile(dir, labels, rows) {
  const { createManifest, buildAssessmentWorkbook } = await import('../tools/quality.mjs');
  writeFileSync(path.join(dir, 'bron.csv'), rows);
  const { prep } = await processDir(dir);
  const manifest = createManifest(prep, { pairs: [[0, 1]] });
  writeFileSync(path.join(dir, 'Testset_manifest.json'), JSON.stringify(manifest));
  const wb = reopen(buildAssessmentWorkbook(prep, manifest));
  wb.Sheets.Paren.E2 = { t: 's', v: labels };
  const file = path.join(dir, 'beoordeling.xlsx');
  writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return { file, wb };
}
const sameRows = 'Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\nFabelwinkel BV;020001001;Teststraat 42\n';
const differentRows = 'Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\nDenkplaats;030001002;Verzinselweg 17\n';

for (const entry of ['tools/testset.mjs', 'tools/private/controle-beoordelingen.mjs']) {
  for (const [label, rows, expected] of [[' ZELFDE ', sameRows, 0], ['zelfde', differentRows, 1], ['ja', sameRows, 1]]) {
    test(`B05 gedeelde CLI ${entry}: ${label.trim()}, exit ${expected}`, async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'lead-kwaliteit-cli-'));
      try {
        const { file } = await assessedFile(dir, label, rows);
        const run = spawnSync(process.execPath, [entry, '--meet', file, dir], { encoding: 'utf8' });
        assert.equal(run.status, expected, run.stderr);
        const report = JSON.parse(run.stdout);
        assert.equal(report.counts.verwacht, 1);
        if (label === 'zelfde') { assert.equal(report.metrics.gemisteDubbels, 1); assert.equal(report.metrics.gemisteKandidaten, 1); assert.equal(report.counts.recordsGevonden, 2); }
        if (label === 'ja') assert.match(report.errors.join(' '), /Ongeldig oordeel/);
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  }
}

test('B05 CLI: verkeerd XLSX-schema mét geldig manifest wordt geweigerd', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lead-kwaliteit-schema-'));
  try {
    const { file, wb } = await assessedFile(dir, 'zelfde', sameRows);
    wb.Sheets.Paren.A1.v = 'Verkeerde kolom';
    writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const run = spawnSync(process.execPath, ['tools/testset.mjs', '--meet', file, dir], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Kolom "Dataset" ontbreekt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('B05 CLI: --maak neemt ook paren zonder kandidaat op en laat alle oordelen leeg', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lead-kwaliteit-maak-'));
  try {
    writeFileSync(path.join(dir, 'bron.csv'), differentRows);
    const out = path.join(dir, 'uit', 'Testset_paren.xlsx');
    const run = spawnSync(process.execPath, ['tools/testset.mjs', '--maak', dir, '--uit', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const wb = XLSX.read(readFileSync(out), { type: 'buffer' });
    assert.equal(wb.Sheets.Paren.E2.v, '');
    assert.ok(wb.Sheets.Records);
    const repeated = spawnSync(process.execPath, ['tools/testset.mjs', '--maak', dir, '--uit', out], { encoding: 'utf8' });
    assert.equal(repeated.status, 1, 'bestaand beoordelingswerk wordt niet overschreven');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
