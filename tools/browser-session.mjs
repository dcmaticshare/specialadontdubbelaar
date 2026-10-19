// De echte productie-HTML, met een tijdelijk browserprofiel dat ook een volledige herstart overleeft.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { groepen, nieuw } from '../test/fixtures/browser-lijsten.mjs';
import { XLSX, rowsOf } from '../test/helpers/fixtures.mjs';
import { SETTINGS } from '../src/settings.js';

export async function controleSession({ out }) {
  const url = pathToFileURL(path.resolve('dist/Lead-ontdubbelaar.html')).href;
  const dbName = `${SETTINGS.sessie.sleutel}:${url}`;
  const errors = [], requests = [];
  let context;
  const launch = async () => {
    context = await chromium.launchPersistentContext(path.join(out, 'sessie-browserprofiel'), {
      headless: true, acceptDownloads: true, ...(process.env.LEAD_BROWSER_CHANNEL ? { channel: process.env.LEAD_BROWSER_CHANNEL } : {}),
    });
    await context.route(/^https?:/, async (route) => { requests.push(route.request().url()); await route.abort(); });
  };
  const open = async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await expect(page.getByRole('button', { name: 'Nieuwe sessie', exact: true })).toBeEnabled();
    return page;
  };
  const saved = (page) => expect(page.locator('#session-status')).toHaveText(/lokaal bewaard/);
  const reset = async (page, accept = true) => {
    page.once('dialog', (d) => accept ? d.accept() : d.dismiss());
    await page.getByRole('button', { name: 'Nieuwe sessie', exact: true }).click();
    if (accept) await expect(page.getByRole('heading', { name: 'Stap 1. Bestanden', exact: true })).toBeVisible();
  };
  const upload = async (page, files) => {
    await page.locator('input[type=file]').setInputFiles(files);
    await page.getByRole('button', { name: 'Volgende: kolommen koppelen' }).click();
  };
  const verwerken = async (page) => {
    await page.getByRole('button', { name: 'Verwerken', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Volgende: exporteren' })).toBeVisible();
    await saved(page);
  };
  const phone = (page) => page.locator('tr').filter({ has: page.locator('strong').filter({ hasText: /^Telefoon$/ }) }).locator('select');
  const readStored = (page) => page.evaluate((name) => new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('sessie', 'readonly'), store = tx.objectStore('sessie');
      const current = store.get('huidig'), sources = store.get('bronnen');
      tx.oncomplete = () => { db.close(); resolve({ current: current.result, sources: sources.result }); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), dbName);
  const exportFile = async (page, name) => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Download Leads_/ }).click();
    const downloaded = await pending, dest = path.join(out, name);
    await downloaded.saveAs(dest);
    return XLSX.read(readFileSync(dest), { type: 'buffer' });
  };
  await launch();
  try {
    let page = await open();
    await upload(page, groepen());
    await phone(page).selectOption('negeren'); await saved(page);
    await page.reload();
    await expect(phone(page)).toHaveValue('negeren');
    await phone(page).selectOption('telefoon'); await verwerken(page);
    await page.getByRole('button', { name: /^Later/ }).click(); await saved(page);
    await page.reload();
    await expect(page.getByText('uitgesteld', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: /^Streng/ }).click();
    await page.getByRole('button', { name: /^Verschillend/ }).click();
    await page.getByRole('button', { name: /^Samengevoegd \(/ }).click();
    await page.getByRole('button', { name: 'Ontkoppelen', exact: true }).first().click();
    await page.getByRole('button', { name: /^Alle leads \(/ }).click();
    await page.getByPlaceholder('Zoeken op naam, telefoon, e-mail, gemeente of nummer').fill('Fabel');
    await saved(page);
    const before = await readStored(page);
    assert.equal(before.current.snapshot.decisionLog.length, 2);
    assert.equal(before.current.snapshot.strengheid, 'streng');
    await context.close();
    await launch();
    page = await open();
    await expect(page.getByPlaceholder('Zoeken op naam, telefoon, e-mail, gemeente of nummer')).toHaveValue('Fabel');
    await expect(page.getByRole('button', { name: /^Streng/ })).toHaveAttribute('aria-pressed', 'true');
    assert.deepEqual((await readStored(page)).current.snapshot.decisions, before.current.snapshot.decisions);
    await page.getByRole('button', { name: 'Volgende: exporteren' }).click(); await saved(page);
    const wb = await exportFile(page, 'sessie-na-browserherstart.xlsx');
    assert.equal(rowsOf(wb, 'Unieke leads').length, 4);
    assert.equal(rowsOf(wb, 'Beslissingen').length, 3);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Stap 4. Exporteren' })).toBeVisible();
    const again = await exportFile(page, 'sessie-na-refresh.xlsx');
    for (const sheet of ['Unieke leads', 'Beslissingen', 'Oorspronkelijke gegevens']) assert.deepEqual(rowsOf(again, sheet), rowsOf(wb, sheet));
    await reset(page, false);
    await expect(page.getByRole('heading', { name: 'Stap 4. Exporteren' })).toBeVisible();
    await reset(page);
    const empty = await readStored(page);
    assert.equal(empty.current.snapshot, null);
    assert.equal(empty.sources, undefined);
    assert.ok(await page.evaluate(() => localStorage.getItem('lead-ontdubbelaar.profielen')));
    await page.reload();
    await expect(page.locator('.filecard')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Volgende: kolommen koppelen' })).toBeDisabled();

    // Codescan 8: alleen het gekozen blad gaat naar IndexedDB; wisselen bewaart de nieuwe keuze atomair.
    const multi = XLSX.utils.book_new();
    for (const [name, rows] of [
      ['Eerste lijst', [['Naam'], ['Eerste verzinsel']]],
      ['Tweede lijst', [['Naam'], ['Tweede verzinsel']]],
      ['Groot bijblad', [['Notitie'], ...Array.from({ length: 2000 }, () => ['NIET-PERSISTENT'])]],
    ]) XLSX.utils.book_append_sheet(multi, XLSX.utils.aoa_to_sheet(rows), name);
    await page.locator('input[type=file]').setInputFiles({ name: 'meerbladen.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(XLSX.write(multi, { type: 'buffer', bookType: 'xlsx' })) });
    await saved(page);
    let stored = (await readStored(page)).sources[0].read;
    assert.ok(stored.sheets[2] === null, 'het grote ongekozen bijblad wordt niet bewaard');
    assert.deepEqual(stored.sheetNames, multi.SheetNames);
    await page.getByLabel('Tabblad:', { exact: false }).selectOption('1'); await saved(page);
    stored = (await readStored(page)).sources[0].read;
    assert.equal(stored.sheets[0], null);
    assert.equal(stored.sheets[1].rows[0][0], 'Tweede verzinsel');
    await page.reload();
    await expect(page.getByLabel('Tabblad:', { exact: false })).toHaveValue('1');
    await expect(page.locator('option[value="0"]')).toHaveJSProperty('disabled', true);
    await expect(page.getByText(/Om een ander tabblad te kiezen/)).toBeVisible();
    await page.locator('input[type=file]').setInputFiles(nieuw()); await saved(page);
    assert.equal((await readStored(page)).sources[0].read.sheets[2], null, 'ook bij een extra bron blijft opslag compact');
    await reset(page);

    // Herkomst van eigen exports hoort bij het gekozen blad en overleeft compact bewaren en herstel.
    await upload(page, { name: 'eigen-resultaat.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })) });
    await saved(page);
    stored = (await readStored(page)).sources[0].read;
    assert.equal(stored.sheets[stored.sheetNames.indexOf('Oorspronkelijke gegevens')], null);
    assert.ok(stored.sheets[stored.sheetNames.indexOf('Unieke leads')].originals.flat().length > 0);
    await page.reload(); await verwerken(page);
    await page.getByRole('button', { name: 'Volgende: exporteren' }).click();
    const compactExport = await exportFile(page, 'compact-herimport.xlsx');
    // De nieuwe import voegt haar eigen broncellen toe; de eerdere herkomst moet daarnaast exact behouden blijven.
    const origins = (book) => rowsOf(book, 'Oorspronkelijke gegevens').slice(1)
      .filter((r) => r[2] !== 'eigen-resultaat.xlsx').map((r) => JSON.stringify(r.slice(2))).sort();
    assert.deepEqual(origins(compactExport), origins(wb));
    await reset(page);

    // Een opgeslagen vergelijking die nog liep, wordt opnieuw gestart met dezelfde invoer.
    await upload(page, groepen()); await verwerken(page);
    await page.evaluate((name) => new Promise((resolve) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction('sessie', 'readwrite'), store = tx.objectStore('sessie'), get = store.get('huidig');
        get.onsuccess = () => { get.result.snapshot.screen = 'processing'; store.put(get.result, 'huidig'); };
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }), dbName);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Verschillend/ })).toBeVisible();

    // Een mislukte transactie laat het vorige herstelpunt intact; opnieuw bewaren herstelt de nieuwe keuze.
    await page.evaluate(() => {
      window.originalSessionPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'sessie') throw new DOMException('Synthetische volle opslag', 'QuotaExceededError');
        return window.originalSessionPut.apply(this, args);
      };
    });
    await page.getByRole('button', { name: /^Later/ }).click();
    await expect(page.locator('#session-warning')).toContainText('niet bewaren');
    assert.deepEqual((await readStored(page)).current.snapshot.deferred, []);
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalSessionPut; });
    await page.getByRole('button', { name: 'Opnieuw bewaren' }).click(); await saved(page);
    await page.reload();
    await expect(page.getByText('uitgesteld', { exact: false })).toBeVisible();

    // Een ouder tabblad mag ook een gewiste sessie niet terugzetten.
    const stale = await open();
    await reset(page);
    await stale.getByRole('button', { name: /^Verschillend/ }).click();
    await expect(stale.locator('#session-warning')).toContainText('ander tabblad');
    assert.equal((await readStored(page)).current.snapshot, null);
    assert.equal((await readStored(page)).sources, undefined);
    await stale.getByRole('button', { name: 'Sessie herladen' }).click();
    await expect(stale.getByRole('button', { name: 'Volgende: kolommen koppelen' })).toBeDisabled();
    await stale.close();

    // Groter dan een gebruikelijke localStorage-ruimte; alleen de bronopslag wordt groot.
    await upload(page, { name: 'ruime-sessie.csv', mimeType: 'text/csv', buffer: Buffer.from(
      'Naam;Telefoon;Opmerkingen\n' + Array.from({ length: 2000 }, (_, i) => `Verzinsel ${i};020001001;${'x'.repeat(4000)}`).join('\n')) });
    await saved(page); await page.reload();
    await expect(page.getByRole('heading', { name: 'Stap 2. Kolommen koppelen' })).toBeVisible();
    assert.equal((await readStored(page)).sources[0].read.sheets[0].rows.length, 2000);
    await reset(page);

    // Onbekende opslag wordt niet stil weggegooid; alleen een bevestigde nieuwe sessie wist haar.
    await upload(page, nieuw()); await saved(page);
    await page.evaluate((name) => new Promise((resolve) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => {
        const db = req.result, tx = db.transaction('sessie', 'readwrite'), store = tx.objectStore('sessie'), get = store.get('huidig');
        get.onsuccess = () => { get.result.snapshot.versie = 99; store.put(get.result, 'huidig'); };
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }), dbName);
    await page.reload();
    await expect(page.locator('#session-warning')).toContainText('niet overschreven');
    assert.equal((await readStored(page)).current.snapshot.versie, 99);
    await reset(page);
    assert.equal((await readStored(page)).sources, undefined);
    await page.screenshot({ path: path.join(out, 'sessie-nieuw.png'), fullPage: true });

    const denied = await context.newPage();
    await denied.addInitScript(() => { IDBFactory.prototype.open = () => { throw new DOMException('Synthetisch geweigerd', 'SecurityError'); }; });
    await denied.goto(url);
    await expect(denied.locator('#session-warning')).toContainText('niet bewaren');
    await upload(denied, nieuw());
    await denied.getByRole('button', { name: 'Verwerken', exact: true }).click();
    await expect(denied.getByRole('button', { name: 'Volgende: exporteren' })).toBeVisible();
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    console.log('Sessie: refresh, browserherstart, beoordelingen, export, wissen, opslagfouten en tabbladconflict OK.');
  } finally { await context?.close(); }
}
