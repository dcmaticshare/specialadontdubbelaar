// Onverwachte schermfouten mogen een geldig herstelpunt niet overschrijven.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from 'playwright/test';
import { groepen } from '../test/fixtures/browser-lijsten.mjs';
import { SETTINGS } from '../src/settings.js';

export async function controleFouten({ browser, upload, verwerken }) {
  const url = pathToFileURL(path.resolve('dist/Lead-ontdubbelaar.html')).href;
  // Eigen context: de bewust opgewekte browserfouten blijven apart van normale stroomfouten.
  const context = await browser.newContext();
  const network = [], csp = [];
  await context.route(/^https?:/, async (route) => { network.push(route.request().url()); await route.abort(); });
  await context.exposeFunction('registreerFoutCsp', (directive) => csp.push(directive));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => window.registreerFoutCsp(event.violatedDirective)));
  const stored = (page) => page.evaluate((name) => new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('sessie', 'readonly'), store = tx.objectStore('sessie');
      const current = store.get('huidig'), sources = store.get('bronnen');
      tx.oncomplete = () => { db.close(); resolve({ current: current.result, sources: sources.result }); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), `${SETTINGS.sessie.sleutel}:${url}`);
  try {
    for (const scenario of ['klik', 'toets', 'promise', 'render', 'wissen', 'opstart']) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('dialog', (dialog) => dialog.accept());
      try {
        await page.goto(url);
        await page.getByRole('button', { name: 'Nieuwe sessie', exact: true }).click();
        await upload(page, groepen()); await verwerken(page);
        await page.getByRole('button', { name: /^Verschillend/ }).click();
        await expect(page.locator('#session-status')).toHaveText(/lokaal bewaard/);
        const before = await stored(page);
        assert.equal(before.current.snapshot.decisionLog.length, 1);
        if (scenario === 'opstart') {
          await page.addInitScript(() => {
            const create = document.createElement.bind(document);
            document.createElement = (tag, ...args) => {
              if (tag === 'nav') throw new Error('Synthetische opstartfout');
              return create(tag, ...args);
            };
          });
          await page.reload();
        } else if (scenario === 'render' || scenario === 'wissen') {
          await page.evaluate(() => {
            const create = document.createElement.bind(document);
            document.createElement = (tag, ...args) => {
              if (tag === 'nav') throw new Error('Synthetische renderfout');
              return create(tag, ...args);
            };
          });
          // De tab wijzigt vóór render faalt: die gedeeltelijke mutatie mag niet worden bewaard.
          if (scenario === 'wissen') await page.getByRole('button', { name: 'Nieuwe sessie', exact: true }).click();
          else await page.getByRole('button', { name: /^Alle leads/ }).click();
        } else if (scenario === 'promise') {
          await page.evaluate(() => { setTimeout(() => { Promise.reject(null); }, 0); });
        } else {
          await page.evaluate((type) => {
            const button = document.createElement('button');
            button.textContent = 'Synthetische fout';
            button.addEventListener(type === 'klik' ? 'click' : 'keydown', () => {
              throw new Error('<img src=x onerror=alert(1)>');
            }, { once: true });
            document.querySelector('main').append(button);
          }, scenario);
          const trigger = page.getByRole('button', { name: 'Synthetische fout', exact: true });
          if (scenario === 'klik') await trigger.click();
          else { await trigger.focus(); await page.keyboard.press('z'); }
        }
        await expect(page.getByRole('alert').filter({ hasText: 'Er trad een onverwachte fout op' })).toBeVisible();
        const reload = page.getByRole('button', { name: 'Sessie herladen', exact: true });
        await expect(reload).toBeVisible();
        if (['render', 'wissen', 'opstart'].includes(scenario)) await expect(reload).toBeFocused();
        await expect(page.locator('img, [style]')).toHaveCount(0);
        await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })));
        assert.deepEqual(await stored(page), before, `${scenario}: herstelpunt en revisie blijven ongewijzigd`);
        if (!['render', 'wissen', 'opstart'].includes(scenario)) assert.equal(errors.length, 1, 'de oorspronkelijke browserdiagnose blijft beschikbaar');
        // Opstartinjectie blijft aan deze pagina gebonden; een nieuw venster heeft de normale code.
        if (scenario === 'opstart') {
          const recovery = await context.newPage();
          try {
            await recovery.goto(url);
            await expect(recovery.getByText(/Alle twijfelparen zijn beoordeeld/)).toBeVisible();
            await expect(recovery.locator('#session-status')).toHaveText(/lokaal bewaard/);
            assert.deepEqual(await stored(recovery), before, 'ook een fout bij opstarten behoudt het bestaande herstelpunt');
          } finally { await recovery.close(); }
          continue;
        }
        await reload.click();
        await expect(page.getByText(/Alle twijfelparen zijn beoordeeld/)).toBeVisible();
        await expect(page.locator('#session-status')).toHaveText(/lokaal bewaard/);
        assert.deepEqual(await stored(page), before, 'herladen behoudt bronnen, beoordelingen en schermkeuze');
      } finally { await page.close(); }
    }
    assert.deepEqual(network, []);
    assert.deepEqual(csp, []);
    console.log('Globale fouten: klik, toets, Promise zonder foutobject, render- en opstartfallback en ongewijzigd sessieherstel OK.');
  } finally { await context.close(); }
}
