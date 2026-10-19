// Later moet ook blijven doorbladeren wanneer alle resterende paren uitgesteld zijn.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';

export async function controleUitstel({ open, upload, verwerken }) {
  const page = await open();
  try {
    await upload(page, { name: 'uitstel.csv', mimeType: 'text/csv', buffer: Buffer.from(
      'Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\nFabelwinkel;030001002;Verzinselweg 9\nFabelwinkel;040001003;Proeflaan 7'
    ) });
    await verwerken(page);
    await expect(page.getByRole('button', { name: 'Twijfelparen (3)', exact: true })).toBeVisible();
    const pair = () => page.locator('.pair .head .badge').allTextContents();
    const later = () => page.getByRole('button', { name: /^Later/ }).click();
    const seen = [];
    for (let i = 0; i < 3; i++) { seen.push(await pair()); await later(); }
    assert.equal(new Set(seen.map(JSON.stringify)).size, 3, 'elk nieuw paar komt aan bod');
    assert.deepEqual(await pair(), seen[0]);
    await later();
    assert.deepEqual(await pair(), seen[1], 'Later roteert ook als alle paren uitgesteld zijn');
    await expect(page.locator('#session-status')).toHaveText(/lokaal bewaard/);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Later/ })).toBeVisible();
    assert.deepEqual(await pair(), seen[1], 'uitstelvolgorde blijft na herstel behouden');
    await later(); assert.deepEqual(await pair(), seen[2]);
    await later(); assert.deepEqual(await pair(), seen[0]);

    // Een andere strengheid verwijdert uitstel van paren die niet meer in de wachtrij staan.
    await page.getByRole('button', { name: /^Mild/ }).click();
    await expect(page.getByRole('button', { name: 'Twijfelparen (0)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Gemiddeld/ }).click();
    await expect(page.getByText('uitgesteld', { exact: true })).toHaveCount(0);
    for (let i = 0; i < 3; i++) await later();

    // Samenvoegen laat één groepspaar over; verdwenen uitstelkeys mogen niet blijven hangen.
    await page.getByRole('button', { name: /^Zelfde bedrijf/ }).click();
    await expect(page.getByRole('button', { name: 'Twijfelparen (1)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Terug naar kolommen' }).click();
    page.removeAllListeners('dialog');
    page.once('dialog', async (dialog) => {
      assert.match(dialog.message(), /1 uitgesteld paar/);
      await dialog.dismiss();
    });
    await page.locator('select').last().selectOption('negeren');
    await page.getByRole('button', { name: 'Verder zonder opnieuw te verwerken' }).click();
    const last = await pair();
    await later(); assert.deepEqual(await pair(), last, 'één resterend paar blijft beschikbaar');
    await page.getByRole('button', { name: /^Verschillend/ }).click();
    await expect(page.getByText(/Alle twijfelparen zijn beoordeeld/)).toBeVisible();
    console.log('Uitstel: volledige rotatie, herstel, opruimen na samenvoegen en laatste paar OK.');
  } finally { await page.close(); }
}
