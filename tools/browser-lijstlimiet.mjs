// De schermlimiet moet zichtbaar zijn; de download bevat ook de niet-getoonde rijen.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';
import { btw, rowsOf } from '../test/helpers/fixtures.mjs';

export async function controleLijstlimiet({ open, upload, verwerken, download }) {
  for (const aantal of [301, 300, 0]) {
    const page = await open();
    try {
      const rows = Array.from({ length: Math.max(1, aantal) }, (_, i) =>
        `Waarschuwingsproef ${String(i + 1).padStart(4, '0')};${btw(i + 1)};${aantal ? 'ongeldig' : ''}`);
      await upload(page, { name: 'lijstlimiet.csv', mimeType: 'text/csv', buffer: Buffer.from(['Naam;BTW;Telefoon', ...rows].join('\n')) });
      await verwerken(page);
      await page.getByRole('button', { name: `Waarschuwingen (${aantal})`, exact: true }).click();
      const table = page.locator('[data-scroll="waarschuwingen"]');
      await expect(table.locator('tbody tr')).toHaveCount(Math.min(300, aantal));
      if (aantal > 300) {
        await expect(page.getByText('Eerste 300 van 301 rijen met waarschuwingen.', { exact: false })).toBeVisible();
        await expect(page.getByText('Alle waarschuwingen staan in het tabblad Logboek van het resultaatbestand.', { exact: false })).toBeVisible();
        await expect(table).not.toContainText('Waarschuwingsproef 0301');
        await page.getByRole('button', { name: 'Alle leads (301)', exact: true }).click();
        await expect(page.locator('[data-scroll="leads"] tbody tr')).toHaveCount(300);
        await expect(page.getByText('… 1 leads niet getoond. Zoek om te verfijnen.', { exact: true })).toBeVisible();
        await page.locator('[data-focus="leads-zoeken"]').fill('Waarschuwingsproef 0301');
        await expect(page.locator('[data-scroll="leads"] tbody tr')).toHaveCount(1);
        const log = rowsOf((await download(page, 'lijstlimiet.xlsx')).wb, 'Logboek');
        assert.equal(log.length, 302, 'ook rij 301 staat in de werkelijke download');
        const warningColumn = log[0].indexOf('Waarschuwingen');
        assert.ok(log.slice(1).every((row) => row[warningColumn]), 'alle waarschuwingen blijven in het Logboek');
      } else {
        await expect(page.getByText(/Eerste .* van .* rijen met waarschuwingen/)).toHaveCount(0);
        if (!aantal) await expect(page.getByText('Geen waarschuwingen.', { exact: true })).toBeVisible();
      }
    } finally { await page.close(); }
  }
  console.log('Lijstlimiet: 0, 300 en 301 waarschuwingsrijen, zichtbare afkapping, zoeken en volledig Logboek OK.');
}
