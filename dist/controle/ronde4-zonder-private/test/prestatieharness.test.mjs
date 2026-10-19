import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS } from '../src/settings.js';
import { checkMeasurements } from '../tools/performance-contract.mjs';
const config = SETTINGS.prestaties;
function fixture() {
  const budgetten = {}, samples = [];
  for (const modus of ['node', 'browser']) for (const aantal of config.rijen) for (const soort of config.scenarios) {
    const key = `${modus}/${soort}/${aantal}`;
    budgetten[key] = { totaalMs: 1000, fasen: Object.fromEntries(config.fasen.map((k) => [k, 200])), piekRssBytes: 1e9, browserBlokkadeMs: 500, timerVertragingMs: 500, kandidaten: 1e8, exportBytes: 1e9 };
    for (let run = 1; run <= config.herhalingen; run++) {
      const groepen = soort === 'uniek' ? Math.ceil(aantal * config.uniekAandeel) : Math.ceil(aantal / (soort === 'duplicaten' ? config.duplicaatGroep : config.gedeeldeGroep));
      samples.push({ modus, soort, aantal, seed: config.seed, run, meetversie: config.versie,
        fasen: Object.fromEntries(config.fasen.map((k) => [k, 50])), totaalMs: 300,
        piekRssBytes: modus === 'node' ? 1e8 : null,
        geheugenMethode: modus === 'node' ? 'os-maxrss' : 'niet-beschikbaar',
        browserBlokkadeMs: modus === 'browser' ? 100 : null, timerVertragingMs: modus === 'browser' ? 100 : null,
        responsiviteitMethode: modus === 'browser' ? 'longtask+timer' : 'niet-van-toepassing',
        kandidaten: 100, scores: 100, compacteGroepen: 0, overgeslagenSleutels: 0, exportBytes: 1e6, groepen,
        kwaliteitscontrole: { groepen, bronrijen: aantal, oorspronkelijkeCellen: aantal * 7, tekstcellen: true, gegevensbehoud: true },
        browser: config.referentie.browser, ticks: 10, longtasks: [{ start: 100, duur: 100 }], faseBlokkades: Object.fromEntries(config.fasen.map((k) => [k, 100])), exportSha256: 'a'.repeat(64) });
    }
  }
  return { report: { versie: config.versie, referentie: { ...config.referentie }, bronSha256: 'b'.repeat(64), samples }, budgetten };
}
test('prestatieharness aanvaardt een volledig geldig rapport', () => {
  const { report, budgetten } = fixture(); assert.deepEqual(checkMeasurements(report, budgetten), []);
});
for (const field of ['totaalMs', 'piekRssBytes', 'kandidaten', 'exportBytes', 'browserBlokkadeMs', 'timerVertragingMs']) {
  test(`prestatieharness faalt bij bewust overschreden ${field}`, () => {
    const { report, budgetten } = fixture();
    const s = report.samples.find((s) => s.modus === (field.startsWith('browser') || field.startsWith('timer') ? 'browser' : 'node'));
    s[field] = 1e15;
    assert.ok(checkMeasurements(report, budgetten).some((e) => e.includes(field)));
  });
}
for (const change of [
  (r) => r.samples.pop(), (r) => r.samples.push(r.samples[0]),
  (r) => { r.samples[0].fasen.scoren = null; }, (r) => { delete r.samples[0].fasen.inlezen; },
  (r) => { r.samples[0].fasen.groeperen = -1; }, (r) => { r.samples[0].fasen.kandidaten = NaN; },
  (r) => { r.samples[0].fasen.serialiseren = Infinity; }, (r) => { r.samples[0].fasen.normaliseren = 10000; },
  (r) => { r.samples[0].kwaliteitscontrole.gegevensbehoud = false; },
  (r) => { r.samples[0].kwaliteitscontrole.groepen--; }, (r) => { r.samples[0].seed++; },
  (r) => { r.samples[0].piekRssBytes = null; }, (r) => { r.referentie.node = 'verkeerd'; },
  (r) => { delete r.referentie.browser; }, (r) => { delete r.samples[27].browserBlokkadeMs; },
  (r) => { r.samples[27].geheugenMethode = 'verzonnen'; }, (r) => { delete r.bronSha256; },
  (r) => { r.samples[0].aantal = '1000'; }, (r) => { r.samples[0].run = '1'; },
  (r) => { r.samples[27].ticks = 0; }, (r) => { delete r.samples[27].longtasks; },
  (r) => { r.samples[27].longtasks[0].duur = -1; }, (r) => { delete r.samples[27].faseBlokkades; },
  (r) => { r.samples[27].browser = 'verkeerd'; }, (r) => { r.referentie.cpu = 'andere machine'; },
]) test(`prestatieharness weigert ontbrekende, ongeldige of onbetrouwbare meting: ${change}`, () => {
  const { report, budgetten } = fixture(); change(report); assert.ok(checkMeasurements(report, budgetten).length);
});
test('prestatieharness weigert ontbrekende en ongeldige budgetten', () => {
  const { report, budgetten } = fixture();
  assert.ok(checkMeasurements(report, {}).length);
  budgetten['node/uniek/1000'].totaalMs = null;
  assert.ok(checkMeasurements(report, budgetten).length);
});
