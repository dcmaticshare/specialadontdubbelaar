// Sneltoetsen laten de eigen bediening van gefocuste interactieve elementen intact.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';
import { groepen } from '../test/fixtures/browser-lijsten.mjs';

export async function controleSneltoetsen({ open, upload, verwerken }) {
  for (const key of ['Space', 'Enter']) {
    const page = await open();
    try {
      await upload(page, groepen()); await verwerken(page);
      await page.getByRole('button', { name: /^Verschillend/ }).focus();
      await page.keyboard.press(key);
      await expect(page.getByText(/Alle twijfelparen zijn beoordeeld/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Alle leads (2)', exact: true })).toBeVisible();
    } finally { await page.close(); }
  }

  const page = await open();
  try {
    await upload(page, { name: 'sneltoetsen.csv', mimeType: 'text/csv', buffer: Buffer.from(
      'Naam;Telefoon;Adres\nFabelwinkel;020001001;Teststraat 42\nFabelwinkel;030001002;Verzinselweg 9\nFabelwinkel;040001003;Proeflaan 7\nFabelwinkel;050001004;Fantasieweg 1'
    ) });
    await verwerken(page);
    const tab = page.getByRole('button', { name: /^Twijfelparen/ });
    const before = await tab.textContent();
    const pair = () => page.locator('.pair').textContent();
    const firstPair = await pair();
    await tab.focus();
    for (const key of ['z', 'v', 'Space']) {
      await page.keyboard.press(key);
      await expect(tab).toHaveText(before);
      assert.equal(await pair(), firstPair, `toets ${key} op de tab verandert het paar niet`);
      await expect(page.getByText('uitgesteld', { exact: true })).toHaveCount(0);
    }

    // Ook inhoud binnen een link, ARIA-knop of tab is beschermd; invoervelden blijven beschermd.
    const results = await page.evaluate(() => {
      const host = document.createElement('div');
      document.querySelector('main').append(host);
      const results = [];
      for (const [tag, role] of [['button'], ['a'], ['div', 'button'], ['div', 'tab'], ['input'], ['select'], ['textarea'], ['div', 'bewerken']]) {
        const element = document.createElement(tag);
        element.tabIndex = 0;
        if (tag === 'a') element.href = '#';
        if (role === 'bewerken') element.contentEditable = 'true';
        else if (role) element.setAttribute('role', role);
        host.append(element);
        let target = element;
        if (!['input', 'select', 'textarea'].includes(tag)) {
          target = document.createElement('span'); element.append(target);
        }
        element.focus();
        for (const key of ['z', 'v', ' ']) {
          const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
          target.dispatchEvent(event);
          results.push({ element: role || tag, key, onderschept: event.defaultPrevented });
        }
        element.remove();
      }
      host.remove();
      return results;
    });
    assert.ok(results.every((result) => !result.onderschept), JSON.stringify(results));
    await expect(tab).toHaveText(before);
    assert.equal(await pair(), firstPair);
    await expect(page.getByText('uitgesteld', { exact: true })).toHaveCount(0);

    // Buiten bedieningselementen werken zowel uitstellen als beide beslissingen nog.
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('Space');
    assert.notEqual(await pair(), firstPair, 'spatie vanuit de pagina stelt het paar uit');
    for (const key of ['v', 'z']) {
      await page.locator('main').focus();
      const count = await tab.textContent();
      await page.keyboard.press(key);
      await expect(tab).not.toHaveText(count);
    }
    console.log('Sneltoetsen: native spatie/Enter, tabs, links, ARIA-knoppen, geneste inhoud, invoer en paginatoetsen OK.');
  } finally { await page.close(); }
}
