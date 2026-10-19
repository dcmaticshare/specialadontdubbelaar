// Gerichte browserregressies voor gegevensbehoud, groepen, bronprofielen en contacten via file://.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { XLSX, rowsOf } from '../test/helpers/fixtures.mjs';
import { behoud, nieuw, groepen, btwConflict, groteGroep } from '../test/fixtures/browser-lijsten.mjs';
import { controleRonde3 } from './browser-ronde3.mjs';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
assert.equal(process.versions.node, readFileSync('.node-version', 'utf8').trim());
const built = spawnSync(process.execPath, ['build.mjs'], { stdio: 'inherit' });
assert.equal(built.status, 0);
const out = path.resolve('dist/controle');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.LEAD_BROWSER_CHANNEL ? { channel: process.env.LEAD_BROWSER_CHANNEL } : {}) });
const failures = [], network = [], csp = [];
let probing = false;
const context = await browser.newContext({ acceptDownloads: true });
await context.exposeFunction('recordCsp', (directive) => csp.push(directive));
await context.addInitScript(() => {
  document.addEventListener('securitypolicyviolation', (event) => window.recordCsp(event.violatedDirective));
});
await context.route(/^https?:/, async (route) => { network.push(route.request().url()); await route.abort(); });
const open = async () => {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => failures.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error' && !probing) failures.push(msg.text()); });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(pathToFileURL(path.resolve('dist/Lead-ontdubbelaar.html')).href);
  return page;
};
const upload = async (page, files) => {
  await page.locator('input[type=file]').setInputFiles(files);
  await page.getByRole('button', { name: 'Volgende: kolommen koppelen' }).click();
};
const verwerken = async (page) => {
  await page.getByRole('button', { name: 'Verwerken', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Volgende: exporteren' })).toBeVisible();
  await expect(page.locator('[style]')).toHaveCount(0);
};
const download = async (page, name) => {
  await page.getByRole('button', { name: 'Volgende: exporteren' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download Leads_/ }).click();
  const d = await pending;
  const dest = path.join(out, name);
  await d.saveAs(dest);
  const wb = XLSX.read(readFileSync(dest), { type: 'buffer' });
  for (const name of wb.SheetNames) for (const [key, cell] of Object.entries(wb.Sheets[name])) if (!key.startsWith('!')) {
    assert.equal(cell.t, 's'); assert.equal(cell.f, undefined);
  }
  return { wb, dest };
};
try {
  const page = await open();
  await upload(page, behoud());
  await expect(page.locator('img')).toHaveCount(0);
  await verwerken(page);
  const first = await download(page, 'browser-behoud.xlsx');
  const leads = rowsOf(first.wb, 'Unieke leads');
  assert.equal(leads.length, 3);
  const lead = leads.find((r) => r[3] === 'Fabelwinkel BV');
  assert.equal(lead[7], 'Teststraat 42 bus 3');
  assert.equal(lead[leads[0].indexOf('Telefoon 5')], '+32 60 00 10 05');
  assert.equal(lead[leads[0].indexOf('E-mail 4')], 'd@fabel.invalid');
  assert.ok(lead[leads[0].indexOf('Extra: Opmerkingen')].includes('=BEWAAR-MIJ'));
  assert.ok(rowsOf(first.wb, 'Oorspronkelijke gegevens').some((r) => r[7] === 'Norian Fabelman'));
  const again = await open();
  await upload(again, [{ name: 'vorig-resultaat.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync(first.dest) }, nieuw()]);
  await expect(again.locator('tr').filter({ has: again.locator('strong').filter({ hasText: /^Nr$/ }) }).locator('select')).toHaveValue('negeren');
  await verwerken(again);
  const second = await download(again, 'browser-herimport.xlsx');
  const secondLeads = rowsOf(second.wb, 'Unieke leads');
  assert.equal(secondLeads.length, 3, 'nieuw bronrecord is aan de eerdere groep toegevoegd');
  assert.equal(secondLeads.find((r) => r[3] === 'Fabelwinkel BV')[7], 'Teststraat 42 bus 3');
  assert.ok(rowsOf(second.wb, 'Oorspronkelijke gegevens').some((r) => r[2] === 'synthetisch.csv' && r[7] === 'Norian Fabelman'));

  const groupPage = await open();
  await upload(groupPage, groepen()); await verwerken(groupPage);
  await groupPage.getByRole('button', { name: /^Verschillend/ }).click();
  await expect(groupPage.getByText(/Alle twijfelparen zijn beoordeeld/)).toBeVisible();
  const separate = await download(groupPage, 'browser-verschillend.xlsx');
  assert.equal(rowsOf(separate.wb, 'Unieke leads').length, 3);
  const decisions = rowsOf(separate.wb, 'Beslissingen');
  assert.match(decisions[1][3], /rij 2.*rij 3/);
  assert.match(decisions[1][5], /rij 4.*rij 5/);
  await groupPage.getByRole('button', { name: 'Terug naar controleren' }).click();
  await groupPage.getByRole('button', { name: /^Samengevoegd \(/ }).click();
  await groupPage.getByRole('button', { name: 'Ontkoppelen', exact: true }).first().click();
  const unlinked = await download(groupPage, 'browser-ontkoppeld.xlsx');
  assert.equal(rowsOf(unlinked.wb, 'Unieke leads').length, 4);

  const blocked = await open();
  await upload(blocked, btwConflict()); await verwerken(blocked);
  await blocked.getByRole('button', { name: /^Zelfde bedrijf/ }).click();
  await expect(blocked.getByText('Niet samengevoegd: de groepen bevatten verschillende geldige BTW-nummers. Kies Verschillend of Later.')).toBeVisible();
  await expect(blocked.getByRole('button', { name: /^Zelfde bedrijf/ })).toBeVisible();
  const conflict = await download(blocked, 'browser-btw-conflict.xlsx');
  assert.equal(rowsOf(conflict.wb, 'Beslissingen').length, 1, 'geweigerde keuze is niet als succes gelogd');
  assert.equal(rowsOf(conflict.wb, 'Te controleren').length, 2);
  assert.equal(rowsOf(conflict.wb, 'Unieke leads').length, 3);

  const large = await open();
  await upload(large, groteGroep()); await verwerken(large);
  await expect(large.getByRole('button', { name: 'Alle leads (1)', exact: true })).toBeVisible();
  const bigResult = await download(large, 'browser-401-rijen.xlsx');
  assert.equal(rowsOf(bigResult.wb, 'Unieke leads').length, 2);
  assert.equal(rowsOf(bigResult.wb, 'Logboek').length, 402, 'alle 401 oorspronkelijke rijen blijven bereikbaar');

  await controleRonde3({ open, upload, verwerken, download, out });
  assert.deepEqual(network, [], 'normale stroom doet geen netwerkverzoeken');
  assert.deepEqual(csp, [], 'normale stroom heeft geen CSP-schendingen');
  assert.deepEqual(failures, [], 'geen console- of schermfouten');
  probing = true;
  assert.equal(await page.evaluate(async () => { try { await fetch('https://voorbeeld.invalid/csp-proef'); return false; } catch { return true; } }), true);
  await expect.poll(() => csp).toContain('connect-src');
  assert.deepEqual(network, [], 'CSP blokkeert vóór de netwerkinterceptor');
  const report = { browser: browser.version(), uitkomst: 'OK', controles: ['gegevensbehoud', 'tekstcellen', 'tekstinjectie', 'herimport en nieuwe lijst', 'groepsbesluit', 'ontkoppelen', 'BTW-afwijzing', '401 gelijke rijen', 'constante contactkolommen en postcode', 'profielherstel en opnieuw voorstellen', 'onbeschikbare profielopslag', 'contactnormalisatie en herimport', 'offline CSP'], netwerkverzoeken: network.length, consolefouten: failures.length };
  writeFileSync(path.join(out, 'browser-resultaat.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
