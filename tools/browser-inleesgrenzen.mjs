// Invoer weigeren moet zichtbaar en herstelbaar blijven in de echte productie-HTML.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';
import { SETTINGS } from '../src/settings.js';

export async function controleInleesgrenzen({ open, upload, verwerken }) {
  const page = await open();
  try {
    // Een kleine File met nagebootste grote size oefent de vroege controle zonder 100 MiB te alloceren.
    await page.evaluate((max) => {
      const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get;
      const buffer = Blob.prototype.arrayBuffer;
      window.grootBestandGelezen = false;
      Object.defineProperty(File.prototype, 'size', { configurable: true, get() {
        return this.name === 'te-groot.csv' ? max + 1 : size.call(this);
      } });
      File.prototype.arrayBuffer = function () {
        if (this.name === 'te-groot.csv') window.grootBestandGelezen = true;
        return buffer.call(this);
      };
    }, SETTINGS.inlezen.maxBestandBytes);
    await page.locator('input[type=file]').setInputFiles({ name: 'te-groot.csv', mimeType: 'text/csv', buffer: Buffer.from('Naam\nVoorbeeld') });
    await expect(page.getByText(/Bestand is te groot:/)).toBeVisible();
    assert.equal(await page.evaluate(() => window.grootBestandGelezen), false);
    // Veel lege cellen kosten weinig fixturebytes, maar mogen geen te grote rechthoek opleveren.
    const columns = 1000;
    const rows = Math.floor(SETTINGS.inlezen.maxCellen / columns) + 1;
    const csv = Array(rows).fill(';'.repeat(columns - 1)).join('\n');
    await page.locator('input[type=file]').setInputFiles({ name: 'te-veel-cellen.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByText(/Bestand bevat een te grote tabel:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volgende: kolommen koppelen' })).toBeDisabled();
    await upload(page, { name: 'gewone-lijst.csv', mimeType: 'text/csv', buffer: Buffer.from('Naam;Adres;Plaats\nVoorbeeld;Teststraat 1;Teststad') });
    await verwerken(page);
    await expect(page.getByText(/Er trad een onverwachte fout op/)).toHaveCount(0);
    console.log('Inleesgrenzen: vroege bestandsgrootte, zichtbare celgrens en gewone verwerking na weigering OK.');
  } finally { await page.close(); }
}
