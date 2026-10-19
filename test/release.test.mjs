import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { requiredChecks, windowsChecks, checkRelease, checkPrivateEvidence, checkWindowsEvidence, checkPerformanceEvidence } from '../tools/release-contract.mjs';
import { sha256, fileHash, sourceHash, checkDate } from '../tools/evidence.mjs';
import { SETTINGS } from '../src/settings.js';
import { createManifest, evaluateQuality } from '../tools/quality.mjs';
import { prepare, assemble } from '../src/engine/pipeline.js';
import { readFile } from '../src/io/read.js';
import { buildResultWorkbook } from '../src/io/write.js';
import { source, context, XLSX, importResult } from './helpers/fixtures.mjs';
import { behoud, nieuw } from './fixtures/browser-lijsten.mjs';
import { checkWindowsWorkbook } from '../tools/windows-workbook.mjs';
const now = Date.parse('2026-10-17T20:00:00Z'), date = new Date(now).toISOString();
const h = 'a'.repeat(64);
const release = () => ({ versie: 1, datum: date, bronSha256: h, htmlSha256: h, controles: Object.fromEntries(requiredChecks.map((key) => [key, { ok: true, exitcode: 0, bewijsSha256: h }])) });

test('release vereist iedere controle, ook als de rest groen is', () => {
  assert.deepEqual(checkRelease(release(), h, h, now), []);
  for (const key of requiredChecks) for (const variant of ['ontbreekt', 'faalt', 'exitcode', 'bewijs', 'overgeslagen']) {
    const r = release();
    if (variant === 'ontbreekt') delete r.controles[key];
    if (variant === 'faalt') r.controles[key].ok = false;
    if (variant === 'exitcode') r.controles[key].exitcode = 1;
    if (variant === 'bewijs') delete r.controles[key].bewijsSha256;
    if (variant === 'overgeslagen') r.controles[key].ok = 'overgeslagen';
    assert.ok(checkRelease(r, h, h, now).some((e) => e.includes(key)), `${key}/${variant}`);
  }
});
test('release weigert verouderde bron, HTML, ontbrekend rapport en verkeerde datums', () => {
  assert.ok(checkRelease(release(), 'b'.repeat(64), h, now).length);
  assert.ok(checkRelease(release(), h, 'b'.repeat(64), now).length);
  assert.ok(checkRelease(null, h, h, now).length);
  for (const value of ['', null, 'ongeldig', '2020-01-01T00:00:00Z', '2099-01-01T00:00:00Z', '2026-02-30T00:00:00Z', '2026-10-17T19:00:00']) {
    assert.throws(() => checkDate(value, now));
    const r = release(); r.datum = value; assert.ok(checkRelease(r, h, h, now).length);
  }
});

async function privateFixture() {
  const prep = await prepare({ sources: [source('verzonnen.csv', ['Naam', 'Telefoon'], [['Fabelwinkel', '020001001'], ['Fabelwinkel', '020001001']])] });
  const manifest = createManifest(prep, { pairs: [[0, 1]] });
  const judgments = manifest.pairs.map((p) => ({ pair: p.id, dataset: manifest.id, a: p.a, b: p.b, label: 'zelfde' }));
  const manifestHash = sha256(JSON.stringify(manifest));
  return { prep, judgments, manifest, manifestHash, workbookHash: h, now, policy: { manifestSha256: manifestHash, records: 2, paren: 1 }, quality: evaluateQuality({ prep, manifest, judgments }), declaration: { versie: 1, beoordelaar: 'Synthetische testbeoordelaar', datum: date, onafhankelijk: true, alleParenBeoordeeld: true, werkmapSha256: h, manifestSha256: manifestHash } };
}
test('private releasebewijs koppelt echte evaluator aan vaste set en onafhankelijke verklaring', async () => {
  const f = await privateFixture(); checkPrivateEvidence(f);
  for (const change of [
    (v) => { v.declaration = null; }, (v) => { v.declaration.onafhankelijk = false; },
    (v) => { v.declaration.beoordelaar = ''; }, (v) => { v.declaration.datum = '2020-01-01T00:00:00Z'; },
    (v) => { v.workbookHash = 'b'.repeat(64); }, (v) => { v.manifestHash = 'b'.repeat(64); },
    (v) => { v.policy.paren = 212; }, (v) => { v.quality.counts.gecontroleerd = 0; },
    (v) => { v.quality.metrics.fouteSamenvoegingen = 1; }, (v) => { v.manifest.limits.gemisteDubbels = 10; },
    (v) => { v.quality.ok = false; }, (v) => { v.quality.errors.push('fout'); },
  ]) { const { prep, ...data } = f; const v = structuredClone(data); change(v); assert.throws(() => checkPrivateEvidence(v)); }
  for (const label of ['', 'ja']) {
    const quality = evaluateQuality({ prep: f.prep, manifest: f.manifest, judgments: [{ ...f.judgments[0], label }] });
    assert.throws(() => checkPrivateEvidence({ ...f, quality }));
  }
});

function performanceFixture() {
  const c = SETTINGS.prestaties;
  const report = { versie: c.versie, datum: date, bronSha256: h, referentie: { ...c.referentie }, samples: [] };
  for (const modus of ['node', 'browser']) for (const soort of c.scenarios) for (const aantal of c.rijen) for (let run = 1; run <= c.herhalingen; run++) {
    const groepen = soort === 'uniek' ? Math.ceil(aantal * c.uniekAandeel) : Math.ceil(aantal / (soort === 'duplicaten' ? c.duplicaatGroep : c.gedeeldeGroep));
    report.samples.push({ modus, soort, aantal, run, seed: c.seed, meetversie: c.versie, totaalMs: c.totaalFasen.length,
      fasen: Object.fromEntries(c.fasen.map((k) => [k, 1])), kandidaten: 1, scores: 1, compacteGroepen: 0, overgeslagenSleutels: 0, exportBytes: 100, exportSha256: h, groepen,
      kwaliteitscontrole: { groepen, bronrijen: aantal, oorspronkelijkeCellen: aantal * c.kolommen.length, tekstcellen: true, gegevensbehoud: true },
      piekRssBytes: modus === 'node' ? 100 : null, geheugenMethode: modus === 'node' ? 'os-maxrss' : 'niet-beschikbaar',
      browserBlokkadeMs: modus === 'node' ? null : 50, timerVertragingMs: modus === 'node' ? null : 50,
      responsiviteitMethode: modus === 'node' ? 'niet-van-toepassing' : 'longtask+timer', browser: c.referentie.browser,
      ticks: 1, longtasks: [{ start: 0, duur: 50 }], faseBlokkades: Object.fromEntries(c.fasen.map((k) => [k, 50])) });
  }
  return report;
}
test('release-prestaties vereisen actuele broncode, recente volledige matrix, referentie en budgetten', () => {
  checkPerformanceEvidence(performanceFixture(), h, now);
  for (const change of [
    (r) => { r.bronSha256 = 'b'.repeat(64); }, (r) => { r.datum = '2020-01-01T00:00:00Z'; },
    (r) => { r.samples.pop(); }, (r) => { r.referentie.platform = 'linux'; },
    (r) => { r.samples[0].fasen.scoren = 1e10; }, (r) => { r.samples[0].kwaliteitscontrole.gegevensbehoud = false; },
  ]) { const r = performanceFixture(); change(r); assert.throws(() => checkPerformanceEvidence(r, h, now)); }
});

async function windowsFiles(dir) {
  const file = behoud();
  const read = await readFile({ name: file.name, arrayBuffer: async () => file.buffer });
  const s = read.sheets[read.defaultSheet];
  const prep = await prepare({ sources: [source(file.name, s.header, s.rows, { ...s, name: file.name, sheetName: s.name })] });
  const wb = buildResultWorkbook(prep, assemble(prep), context);
  const n = nieuw(), nr = await readFile({ name: n.name, arrayBuffer: async () => n.buffer }), ns = nr.sheets[nr.defaultSheet];
  const next = await prepare({ sources: [await importResult(wb), source(n.name, ns.header, ns.rows, { ...ns, name: n.name, sheetName: ns.name })] });
  const again = buildResultWorkbook(next, assemble(next), context);
  const r = { versie: 1, platform: 'win32', windowsVersie: 'Synthetische Windows-testfixture', beoordelaar: 'Synthetische testbeoordelaar', datum: date, htmlSha256: h, procedureSha256: h, browsers: [] };
  for (const naam of ['edge', 'chrome']) {
    const bestanden = {};
    for (const kind of ['export', 'herimport', 'schermafbeelding']) {
      const pad = `${naam}-${kind}.${kind === 'schermafbeelding' ? 'png' : 'xlsx'}`;
      const bytes = kind === 'schermafbeelding' ? Buffer.from('89504e470d0a1a0a', 'hex') : XLSX.write(kind === 'export' ? wb : again, { type: 'buffer', bookType: 'xlsx' });
      writeFileSync(path.join(dir, pad), bytes); bestanden[kind] = { pad, sha256: sha256(bytes) };
    }
    r.browsers.push({ naam, versie: '1.2.3.4', excelVersie: 'Synthetische Excel-versie', controles: Object.fromEntries(windowsChecks.map((k) => [k, true])), bestanden });
  }
  return r;
}
test('Windows-bewijs: beide browsers, offline bediening, Excel en werkelijke ongewijzigde downloads zijn verplicht', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lead-windows-bewijs-'));
  try {
    const report = await windowsFiles(dir), opts = { htmlHash: h, procedureHash: h, dir, now, checkWorkbook: checkWindowsWorkbook };
    checkWindowsEvidence(report, opts);
    for (const change of [
      (r) => { r.platform = 'darwin'; }, (r) => { r.windowsVersie = ''; }, (r) => { r.browsers.pop(); },
      (r) => { r.browsers[1].naam = 'edge'; }, (r) => { r.datum = '2020-01-01T00:00:00Z'; },
      (r) => { r.htmlSha256 = 'b'.repeat(64); }, (r) => { r.procedureSha256 = 'b'.repeat(64); },
      (r) => { r.browsers[0].excelVersie = ''; }, (r) => { r.browsers[0].bestanden.export.sha256 = h; },
      (r) => { r.browsers[0].bestanden.export.pad = '../buiten.xlsx'; },
      ...windowsChecks.map((k) => (r) => { r.browsers[1].controles[k] = false; }),
    ]) { const r = structuredClone(report); change(r); assert.throws(() => checkWindowsEvidence(r, opts)); }
    const file = path.join(dir, 'edge-export.xlsx');
    const wb = XLSX.read(readFileSync(file), { type: 'buffer' }); wb.Sheets['Unieke leads'].H2.v = 'VERKEERD';
    writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    report.browsers[0].bestanden.export.sha256 = fileHash(file);
    assert.throws(() => checkWindowsEvidence(report, opts), 'een nieuwe checksum maskeert verkeerde celinhoud niet');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('release-CLI weigert overslaan en CI vóór private gegevens worden geopend', () => {
  for (const [args, env] of [[['--skip-private'], { ...process.env, CI: '' }], [[], { ...process.env, CI: 'true' }]]) {
    const r = spawnSync(process.execPath, ['tools/check-release.mjs', ...args], { encoding: 'utf8', env });
    assert.equal(r.status, 1); assert.doesNotMatch(r.stdout, /privateVoorbeelden:/);
  }
});

test('release-CLI wordt niet groen met geslaagde publieke opdrachten en ontbrekende verplichte bewijzen', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lead-release-cli-'));
  try {
    for (const folder of ['tools/private', 'src', 'vendor', 'docs', '.github', 'test', 'dist']) mkdirSync(path.join(dir, folder), { recursive: true });
    for (const file of ['tools/check-release.mjs', 'tools/release-contract.mjs', 'tools/evidence.mjs', 'tools/performance-contract.mjs', 'tools/windows-workbook.mjs', 'src/settings.js', 'vendor/xlsx.full.min.js', 'vendor/package.json', 'vendor/LICENSE-SheetJS.txt', 'package.json', '.node-version', '.nvmrc', 'pnpm-lock.yaml', 'docs/Releasecontract.json', 'docs/Windows-acceptatie.md']) copyFileSync(file, path.join(dir, file));
    writeFileSync(path.join(dir, 'build.mjs'), '// Synthetische CLI-test.');
    for (const file of ['check.mjs', 'check-quality.mjs', 'check-browser.mjs', 'run-testdata.mjs', 'private/controle-beoordelingen.mjs']) writeFileSync(path.join(dir, 'tools', file), 'console.log("Synthetische opdracht voltooid");');
    writeFileSync(path.join(dir, 'dist/Lead-ontdubbelaar.html'), 'Synthetisch HTML-bewijs');
    const r = spawnSync(process.execPath, [path.join(dir, 'tools/check-release.mjs'), '--uit', 'dist/uitslag'], { encoding: 'utf8', env: { ...process.env, CI: '' } });
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(readFileSync(path.join(dir, 'dist/uitslag/rapport.json')));
    assert.equal(report.ok, false); assert.equal(report.controles.openbaar.ok, true);
    for (const key of ['privateBeoordelingen', 'prestaties', 'windows']) assert.equal(report.controles[key].ok, false, key);
    const before = sourceHash(dir, true); writeFileSync(path.join(dir, 'test/extra.mjs'), '// Nieuw testcontract.');
    assert.notEqual(sourceHash(dir, true), before, 'ook niet-gecommitte testwijzigingen maken releasebewijs oud');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
