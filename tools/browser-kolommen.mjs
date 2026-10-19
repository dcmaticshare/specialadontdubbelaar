// Terugnavigeren mag beoordelingen, ontkoppelingen en uitstel niet stil wissen.
import assert from 'node:assert/strict';
import { expect } from 'playwright/test';
import { groepen, nieuw } from '../test/fixtures/browser-lijsten.mjs';
import { rowsOf } from '../test/helpers/fixtures.mjs';

export async function controleKolommen({ open, upload, verwerken, download }) {
  // Een nieuwe enkelvoudige keuze vervangt de eerdere; contactkolommen mogen meervoudig blijven.
  const mapping = await open();
  const fixture = { name: 'koppelkeuze.csv', mimeType: 'text/csv', buffer: Buffer.from(
    'Naam;Alternatieve naam;Telefoon;Extra telefoon;E-mail;Extra mail\nOude Fabelnaam;Nieuwe Fabelnaam;060001001;060001002;een@fabel.invalid;twee@fabel.invalid') };
  await upload(mapping, [fixture, { ...fixture, name: 'andere-koppelkeuze.csv' }]);
  const cards = mapping.locator('.card').filter({ has: mapping.locator('.mapping-table') });
  const choices = cards.first().locator('select');
  const reset = cards.first().getByRole('button', { name: 'Terug naar standaard', exact: true });
  await expect(mapping.getByRole('button', { name: 'Terug naar standaard', exact: true })).toHaveCount(0);
  await choices.nth(2).selectOption('negeren');
  await expect(reset).toBeVisible();
  await expect(cards.nth(1).getByRole('button', { name: 'Terug naar standaard', exact: true })).toHaveCount(0);
  await choices.nth(2).selectOption('telefoon');
  await expect(reset).toHaveCount(0);
  await choices.nth(2).selectOption('negeren');
  await reset.click();
  await expect(choices.nth(2)).toHaveValue('telefoon');
  await expect(reset).toHaveCount(0);
  await choices.nth(1).selectOption('bedrijfsnaam');
  await expect(choices.nth(0)).toHaveValue('negeren');
  await expect(choices.nth(1)).toHaveValue('bedrijfsnaam');
  await expect(cards.first().getByRole('status')).toContainText(/Naam.*Niet gebruiken.*Bedrijfsnaam.*Alternatieve naam/);
  await expect(cards.nth(1).locator('select').nth(0)).toHaveValue('bedrijfsnaam');
  await choices.nth(3).selectOption('telefoon');
  await choices.nth(5).selectOption('email');
  for (const i of [2, 3]) await expect(choices.nth(i)).toHaveValue('telefoon');
  for (const i of [4, 5]) await expect(choices.nth(i)).toHaveValue('email');
  await expect(mapping.locator('#session-status')).toHaveText(/lokaal bewaard/);
  await mapping.reload();
  await expect(choices.nth(0)).toHaveValue('negeren');
  await expect(choices.nth(1)).toHaveValue('bedrijfsnaam');
  await expect(reset).toBeVisible();
  await verwerken(mapping);
  const selected = rowsOf((await download(mapping, 'koppelkeuze.xlsx')).wb, 'Unieke leads');
  const chosen = selected.find((row) => row[selected[0].indexOf('Company')] === 'Nieuwe Fabelnaam');
  assert.ok(chosen, 'de laatst gekozen naamkolom wordt verwerkt');
  assert.equal(chosen[selected[0].indexOf('Extra: Naam')], 'Oude Fabelnaam');
  await mapping.close();

  const page = await open();
  const saved = () => expect(page.locator('#session-status')).toHaveText(/lokaal bewaard/);
  const back = () => page.getByRole('button', { name: 'Terug naar kolommen', exact: true }).click();
  const resume = () => page.getByRole('button', { name: /^(Verwerken|Verder zonder opnieuw te verwerken)$/ }).click();
  const phone = () => page.locator('tr').filter({ has: page.locator('strong').filter({ hasText: /^Telefoon$/ }) }).locator('select');
  const continuing = () => page.getByRole('button', { name: 'Verder zonder opnieuw te verwerken', exact: true });
  await upload(page, groepen()); await verwerken(page);
  await page.getByRole('button', { name: /^Verschillend/ }).click();
  await page.getByRole('button', { name: /^Samengevoegd \(/ }).click();
  await page.getByRole('button', { name: 'Ontkoppelen', exact: true }).first().click();
  const original = await download(page, 'kolommen-voor.xlsx');
  assert.equal(rowsOf(original.wb, 'Beslissingen').length, 3);
  await page.getByRole('button', { name: 'Terug naar controleren' }).click();
  await back(); await resume();
  const after = await download(page, 'kolommen-na.xlsx');
  for (const sheet of ['Unieke leads', 'Beslissingen', 'Te controleren']) {
    assert.deepEqual(rowsOf(after.wb, sheet), rowsOf(original.wb, sheet), `${sheet} blijft gelijk na terugnavigeren`);
  }

  // Zonder aangepaste koppelingen is er geen herstelknop; terugnavigeren bewaart de verwerking.
  await page.getByRole('button', { name: 'Terug naar controleren' }).click(); await back();
  page.removeAllListeners('dialog');
  await expect(page.getByRole('button', { name: 'Terug naar standaard', exact: true })).toHaveCount(0);
  await expect(continuing()).toBeVisible();
  await page.getByRole('button', { name: 'Terug', exact: true }).click();
  page.once('dialog', async (d) => { assert.match(d.message(), /2 beoordelingen/); await d.dismiss(); });
  await page.getByRole('button', { name: 'Verwijderen', exact: true }).click();
  await expect(page.locator('.filecard')).toHaveCount(1);
  page.once('dialog', async (d) => { assert.match(d.message(), /2 beoordelingen/); await d.dismiss(); });
  await page.locator('input[type=file]').setInputFiles(nieuw());
  await expect(page.locator('.filecard')).toHaveCount(1);
  await saved(); await page.reload();
  await expect(page.getByRole('heading', { name: 'Stap 1. Bestanden', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volgende: kolommen koppelen' }).click();

  // Annuleren behoudt ook de gekozen kolom en de melding van de bestaande download.
  page.once('dialog', async (d) => { assert.match(d.message(), /2 beoordelingen/); await d.dismiss(); });
  await phone().selectOption('negeren');
  await expect(phone()).toHaveValue('telefoon');
  page.once('dialog', async (d) => { assert.match(d.message(), /2 beoordelingen/); await d.dismiss(); });
  await phone().selectOption('bedrijfsnaam');
  await expect(phone()).toHaveValue('telefoon');
  await expect(page.locator('.mapping-table select').first()).toHaveValue('bedrijfsnaam');
  await continuing().click();
  await page.getByRole('button', { name: 'Volgende: exporteren' }).click();
  // Na een herstart begint de downloadstatus leeg; controleer behoud bij een nieuwe download.
  await page.getByRole('button', { name: 'Terug naar controleren' }).click();
  await download(page, 'kolommen-exportstatus.xlsx');
  await page.getByRole('button', { name: 'Terug naar controleren' }).click(); await back();
  page.once('dialog', async (d) => { assert.match(d.message(), /2 beoordelingen/); await d.dismiss(); });
  await phone().selectOption('negeren'); await continuing().click();
  await page.getByRole('button', { name: 'Volgende: exporteren' }).click();
  await expect(page.getByText(/is klaar\. Het tabblad/)).toBeVisible();
  await page.getByRole('button', { name: 'Terug naar controleren' }).click(); await back();
  await saved(); await page.reload();
  await expect(continuing()).toBeVisible(); await continuing().click();
  const restored = await download(page, 'kolommen-hersteld.xlsx');
  assert.deepEqual(rowsOf(restored.wb, 'Beslissingen'), rowsOf(original.wb, 'Beslissingen'));

  // Alleen een bevestigde wijziging maakt de eerdere verwerking ongeldig.
  await page.getByRole('button', { name: 'Terug naar controleren' }).click(); await back();
  page.once('dialog', async (d) => { assert.match(d.message(), /2 beoordelingen/); await d.accept(); });
  await phone().selectOption('negeren');
  await expect(continuing()).toHaveCount(0);
  await verwerken(page);
  const changed = await download(page, 'kolommen-gewijzigd.xlsx');
  assert.equal(rowsOf(changed.wb, 'Beslissingen').length, 1);
  await page.close();

  const deferred = await open();
  await upload(deferred, groepen()); await verwerken(deferred);
  await deferred.getByRole('button', { name: /^Later/ }).click();
  await deferred.getByRole('button', { name: 'Terug naar kolommen' }).click();
  await expect(deferred.locator('#session-status')).toHaveText(/lokaal bewaard/);
  await deferred.reload();
  await deferred.getByRole('button', { name: 'Verder zonder opnieuw te verwerken' }).click();
  await expect(deferred.getByText('uitgesteld', { exact: false })).toBeVisible();
  await deferred.getByRole('button', { name: 'Terug naar kolommen' }).click();
  deferred.removeAllListeners('dialog');
  deferred.once('dialog', async (d) => { assert.match(d.message(), /1 uitgesteld paar/); await d.dismiss(); });
  await deferred.locator('select').last().selectOption('negeren');
  await deferred.getByRole('button', { name: 'Verder zonder opnieuw te verwerken' }).click();
  await expect(deferred.getByText('uitgesteld', { exact: false })).toBeVisible();
  await deferred.close();
  console.log('Kolommen: unieke veldkeuze met melding, extra waarden, meervoudige contacten, beoordelingen, ontkoppelingen, uitstel, exportstatus, herstel en bevestigde wijzigingen OK.');
}
