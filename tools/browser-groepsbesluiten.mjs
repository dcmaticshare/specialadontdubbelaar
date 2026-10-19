// Grote groepskeuzes in de productie-HTML: bevestigen, weigeren en hervatten.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';
import { SETTINGS } from '../src/settings.js';

export async function controleGroepsbesluiten({ open, upload, verwerken }) {
  const input = (count, two = false) => ({ name: 'synthetische-groepen.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Naam;Telefoon;Contactpersoon\n' + Array.from({ length: count }, (_, i) =>
      `Fabelwinkel;${two && i >= count / 2 ? '030001002' : '020001001'};${two && (i === 0 || i === count / 2) ? 'Mira Testmans' : ''}`).join('\n')) });
  const saved = (page) => expect(page.locator('#session-status')).toHaveText(/lokaal bewaard/);
  const page = await open();
  await upload(page, input(1500, true)); await verwerken(page);
  page.removeAllListeners('dialog');
  let confirmations = 0;
  page.once('dialog', async (d) => { confirmations++; assert.match(d.message(), /1[.\s]?500/); await d.dismiss(); });
  await page.getByRole('button', { name: /^Zelfde bedrijf/ }).click();
  await expect(page.getByRole('button', { name: 'Alle leads (2)', exact: true })).toBeVisible();
  page.once('dialog', async (d) => { confirmations++; await d.accept(); });
  await page.getByRole('button', { name: /^Zelfde bedrijf/ }).click();
  await expect(page.getByRole('button', { name: 'Alle leads (1)', exact: true })).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Alle leads (1)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Samengevoegd \(/ }).click();
  page.once('dialog', async (d) => { confirmations++; await d.dismiss(); });
  await page.getByRole('button', { name: 'Ontkoppelen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Alle leads (1)', exact: true })).toBeVisible();
  page.once('dialog', async (d) => { confirmations++; await d.accept(); });
  await page.getByRole('button', { name: 'Ontkoppelen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Alle leads (1500)', exact: true })).toBeVisible();
  await saved(page); await page.reload();
  await expect(page.getByRole('button', { name: 'Alle leads (1500)', exact: true })).toBeVisible();
  const snapshot = await page.evaluate((key) => new Promise((resolve, reject) => {
    const req = indexedDB.open(`${key}:${location.href}`);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('sessie', 'readonly'), get = tx.objectStore('sessie').get('huidig');
      tx.oncomplete = () => { db.close(); resolve(get.result.snapshot); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), SETTINGS.sessie.sleutel);
  assert.equal(confirmations, 4);
  assert.equal(snapshot.decisions.length, 2);
  assert.equal(snapshot.decisionLog.length, 2);
  assert.ok(JSON.stringify(snapshot).length < 40000);
  assert.equal(snapshot.versie, SETTINGS.sessie.versie);

  const limit = await open();
  await upload(limit, input(SETTINGS.groepsbesluiten.maxLeden + 1)); await verwerken(limit);
  await limit.getByRole('button', { name: /^Samengevoegd \(/ }).click();
  await limit.getByRole('button', { name: 'Ontkoppelen', exact: true }).click();
  await expect(limit.getByText(/Maximaal 5.000 rijen per keuze/)).toBeVisible();
  await expect(limit.getByRole('button', { name: 'Alle leads (1)', exact: true })).toBeVisible();
  await saved(limit);
  console.log('Grote groepsbesluiten: bevestigen, annuleren, 1500 leden, compacte sessie na refresh en bovengrens OK.');
}
