// Focus en scroll blijven bij hetzelfde onderdeel, ook na het vervangen van de schermboom.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';

export async function controleFocus({ open, upload, verwerken }) {
  const page = await open();
  try {
    await page.setViewportSize({ width: 800, height: 700 });
    const headers = ['Naam', ...Array.from({ length: 32 }, (_, i) => `Extra_${i}_${'kolom'.repeat(15)}`)];
    const file = { name: 'focus.csv', mimeType: 'text/csv', buffer: Buffer.from(
      [headers.join(';'), ['Fabelwinkel', ...headers.slice(1).map(() => 'synthetisch')].join(';')].join('\n')
    ) };
    await upload(page, [file, file]);
    const choices = page.locator('.mapping-table select');
    const choice = choices.nth(headers.length * 2 - 2);
    await choice.focus();
    const before = await page.evaluate(() => {
      const positions = [...document.querySelectorAll('.scroll')].map((el) => {
        el.scrollTop = el.scrollHeight;
        el.scrollLeft = 60;
        return [el.scrollTop, el.scrollLeft];
      });
      return { positions, window: [window.scrollX, window.scrollY] };
    });
    assert.ok(before.positions.every(([top, left]) => top > 0 && left > 0), 'de proef oefent beide scrollrichtingen en beide bestanden');
    await choice.selectOption('sector');
    const after = await page.evaluate(() => ({
      positions: [...document.querySelectorAll('.scroll')].map((el) => [el.scrollTop, el.scrollLeft]),
      window: [window.scrollX, window.scrollY],
    }));
    assert.deepEqual(after, before, 'kolomkeuze behoudt alle tabelposities en de vensterpositie');
    await expect(choice).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(choices.last()).toBeFocused();
    const propose = page.getByRole('button', { name: 'Terug naar standaard', exact: true }).last();
    await propose.click();
    await expect(propose).toHaveCount(0);
    await expect(page.locator('main')).toBeFocused();
  } finally { await page.close(); }

  const review = await open();
  try {
    await upload(review, { name: 'focus-review.csv', mimeType: 'text/csv', buffer: Buffer.from(
      'Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\nFabelwinkel;030001002;Verzinselweg 9\nFabelwinkel;040001003;Proeflaan 7\nFabelwinkel;050001004;Fantasieweg 1'
    ) });
    await verwerken(review);
    await expect(review.locator('main')).toBeFocused();
    for (const key of ['v', 'z']) {
      const before = await review.getByRole('button', { name: /^Twijfelparen/ }).textContent();
      await review.keyboard.press(key);
      await expect(review.getByRole('button', { name: /^Twijfelparen/ })).not.toHaveText(before);
      await expect(review.locator('main')).toBeFocused();
    }
    const later = review.getByRole('button', { name: /^Later/ });
    await later.click(); await expect(later).toBeFocused();
    const different = review.getByRole('button', { name: /^Verschillend/ });
    while (await different.count()) {
      await different.click();
      await expect(await different.count() ? different : review.locator('main')).toBeFocused();
    }
    const leads = review.getByRole('button', { name: /^Alle leads/ });
    await leads.click(); await expect(leads).toBeFocused();
    const search = review.getByRole('searchbox');
    await search.fill('Fabel');
    await search.evaluate((el) => { el.focus(); el.setSelectionRange(1, 4, 'backward'); });
    // Een render vanuit een andere gebeurtenis mag een actieve zoekselectie niet verliezen.
    await review.getByRole('button', { name: /^Streng/ }).evaluate((el) => el.click());
    await expect(search).toBeFocused();
    assert.deepEqual(await search.evaluate((el) => [el.selectionStart, el.selectionEnd, el.selectionDirection]), [1, 4, 'backward']);
    await expect(review.locator('[style]')).toHaveCount(0);
    console.log('Focus: kolomkeuzes, beide scrollrichtingen, tabvolgorde, sneltoetsen, knoppen en zoekselectie OK.');
  } finally { await review.close(); }
}
