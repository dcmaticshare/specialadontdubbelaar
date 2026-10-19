// Werkelijke productie-HTML, zonder scriptvervanging, server of versoepelde CSP.
import assert from 'node:assert/strict';
import { writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { scenario, csvBytes } from './performance-data.mjs';
import { SETTINGS } from '../src/settings.js';
const [soort, aantal, dest] = process.argv.slice(2);
const data = scenario({ soort, aantal: Number(aantal) });
const browser = await chromium.launch({ headless: true, channel: process.env.LEAD_BROWSER_CHANNEL || 'chrome' });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const errors = [], network = [];
  await context.route(/^https?:/, async (route) => { network.push(route.request().url()); await route.abort(); });
  const page = await context.newPage();
  page.setDefaultTimeout(SETTINGS.prestaties.timeoutMs);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(pathToFileURL(path.resolve('dist/Lead-ontdubbelaar.html')).href);
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
  await page.evaluate((interval) => {
    if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) throw new Error('Long Tasks API ontbreekt; geen geldige responsiviteitsmeting.');
    performance.clearMeasures();
    const monitor = window.__prestatieControle = { longtasks: [], vertraging: 0, ticks: 0 };
    monitor.observer = new PerformanceObserver((list) => monitor.longtasks.push(...list.getEntries().map((e) => ({ start: e.startTime, duur: e.duration }))));
    monitor.observer.observe({ type: 'longtask' });
    let last = performance.now();
    monitor.timer = setInterval(() => {
      const now = performance.now(); monitor.vertraging = Math.max(monitor.vertraging, now - last - interval);
      monitor.ticks++; last = now;
    }, interval);
  }, SETTINGS.prestaties.timerIntervalMs);
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetisch.csv', mimeType: 'text/csv', buffer: csvBytes(data) });
  await page.getByRole('button', { name: 'Volgende: kolommen koppelen' }).click();
  await page.getByRole('button', { name: 'Verwerken', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Volgende: exporteren' })).toBeVisible({ timeout: SETTINGS.prestaties.timeoutMs });
  await page.getByRole('button', { name: 'Volgende: exporteren' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download Leads_/ }).click();
  const download = await pending;
  await download.saveAs(dest + '.xlsx');
  // Laat de observer en de timer ook de laatste synchrone exporttaak afleveren.
  const result = await page.evaluate(async (interval) => {
    await new Promise((r) => setTimeout(r, interval * 2));
    const m = window.__prestatieControle;
    m.longtasks.push(...m.observer.takeRecords().map((e) => ({ start: e.startTime, duur: e.duration })));
    m.observer.disconnect(); clearInterval(m.timer);
    const entries = performance.getEntriesByType('measure').filter((e) => e.name.startsWith('lead:'));
    return { ticks: m.ticks, longtasks: m.longtasks, timerVertragingMs: m.vertraging,
      fasen: Object.fromEntries(entries.map((e) => [e.name.slice(5), e.duration])),
      faseBlokkades: Object.fromEntries(entries.map((e) => [e.name.slice(5), Math.max(0, ...m.longtasks.filter((t) => t.start < e.startTime + e.duration && t.start + t.duur > e.startTime).map((t) => t.duur))])),
      aantallen: entries.find((e) => e.name === 'lead:voorbereiden')?.detail,
      groepen: entries.find((e) => e.name === 'lead:groeperen')?.detail?.groepen };
  }, SETTINGS.prestaties.timerIntervalMs);
  assert.ok(result.ticks > 0, 'de responsiviteitstimer heeft werkelijk gelopen');
  await expect(page.locator('[style]')).toHaveCount(0);
  assert.deepEqual(errors, [], 'geen browserfouten of CSP-schendingen');
  assert.deepEqual(network, [], 'geen netwerkverzoeken');
  const report = { modus: 'browser', soort, aantal: data.aantal, seed: data.seed, browser: browser.version(),
    meetversie: SETTINGS.prestaties.versie, ...result,
    totaalMs: SETTINGS.prestaties.totaalFasen.reduce((n, k) => n + result.fasen[k], 0),
    browserBlokkadeMs: Math.max(0, ...result.longtasks.map((t) => t.duur)),
    piekRssBytes: null, geheugenMethode: 'niet-beschikbaar', responsiviteitMethode: 'longtask+timer',
    geheugenBeperking: 'Geen betrouwbare piek voor alle Chrome-processen. JS-heapmomentopnamen en CDP-steekproeven missen synchrone pieken en ArrayBuffers; daarom geen schijnpiek.',
    ...result.aantallen, exportBytes: statSync(dest + '.xlsx').size, kwaliteitscontrole: null };
  writeFileSync(dest + '.json', JSON.stringify(report, null, 2));
  if (data.aantal === Math.max(...SETTINGS.prestaties.rijen)) await page.screenshot({ path: dest + '.png', fullPage: true });
  console.log(JSON.stringify({ soort, aantal: data.aantal, totaalMs: report.totaalMs, fasen: report.fasen, browserBlokkadeMs: report.browserBlokkadeMs, timerVertragingMs: report.timerVertragingMs, kandidaten: report.kandidaten, exportBytes: report.exportBytes }));
} finally { await browser.close(); }
