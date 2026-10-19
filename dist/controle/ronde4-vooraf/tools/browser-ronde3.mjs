// Gerichte productiecontroles voor de derde ronde; uitsluitend verzonnen brongegevens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'playwright/test';
import { makeProfile } from '../src/io/mapping.js';
import { rowsOf } from '../test/helpers/fixtures.mjs';

const uploadbestand = (naam, rows) => ({ name: naam, mimeType: 'text/csv', buffer: Buffer.from(rows.map((row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(';')).join('\r\n')) });
const profielSleutel = 'lead-ontdubbelaar.profielen';
const kolom = (page, naam) => page.locator('tr').filter({ has: page.locator('strong').filter({ hasText: new RegExp(`^${naam}$`) }) }).locator('select');

export async function controleRonde3({ open, upload, verwerken, download, out }) {
  const fouten = [];
  const controle = async (naam, fn) => {
    try { await fn(); console.log(`${naam}: OK`); }
    catch (error) { fouten.push(`${naam}: ${error.message}`); }
  };
  await controle('B07 constante contactkolommen en postcode', async () => {
    const page = await open();
    await upload(page, uploadbestand('constant.csv', [['Naam', 'E-mail', 'Postcode'], ...Array.from({ length: 20 }, (_, i) => [i === 0 ? 'Fabelwinkel' : i === 1 ? 'Fabelwinkel Noord' : `Verzinsel ${i}`, 'info@voorbeeld.invalid', '1000'])]));
    await expect(page.getByText(/contactkolom.*niet.*vergelijken/i)).toBeVisible();
    await expect(page.getByText(/postcode.*blijft.*adres/i)).toBeVisible();
    // De melding moet de handmatig gewijzigde koppeling volgen.
    await kolom(page, 'E-mail').selectOption('negeren');
    await expect(page.getByText(/contactkolom.*niet.*vergelijken/i)).toHaveCount(0);
    await kolom(page, 'E-mail').selectOption('email');
    await expect(page.getByText(/contactkolom.*niet.*vergelijken/i)).toBeVisible();
    await page.screenshot({ path: path.join(out, 'browser-constante-kolommen.png'), fullPage: true });
    await verwerken(page);
    await expect(page.getByRole('button', { name: 'Alle leads (20)', exact: true })).toBeVisible();
    const result = await download(page, 'browser-constant.xlsx');
    const rows = rowsOf(result.wb, 'Unieke leads');
    assert.equal(rows.length, 21);
    assert.equal(rows[1][rows[0].indexOf('E-mail')], 'info@voorbeeld.invalid');
    assert.match(rowsOf(result.wb, 'Logboek')[1][7], /contactkolom/);
  });
  await controle('B07 verschillende postcodes bij een gemeentelijst', async () => {
    const page = await open();
    await upload(page, [
      uploadbestand('gemeente.csv', [['Naam', 'Adres', 'Postcode'], ...Array.from({ length: 20 }, (_, i) => [i === 0 ? 'Fabelwinkel' : `Verzinsel ${i}`, `Teststraat ${i + 1}`, '1000'])]),
      uploadbestand('elders.csv', [['Naam', 'Adres', 'Postcode'], ['Fabelwinkel', 'Teststraat 1', '2000']]),
    ]);
    await verwerken(page);
    await expect(page.getByRole('button', { name: 'Alle leads (21)', exact: true })).toBeVisible();
    const result = await download(page, 'browser-postcode.xlsx');
    assert.equal(rowsOf(result.wb, 'Unieke leads').length, 22);
    assert.ok(rowsOf(result.wb, 'Te controleren').some((r) => r[0] === '75' && r[1].includes('andere postcode') && r.includes('Fabelwinkel')));
  });
  const profile = makeProfile(['Naam', 'Telefoon'], ['bedrijfsnaam', 'email']);
  const cases = [
    { id: 'ontbreekt', raw: null }, { id: 'ongeldige-json', raw: '{' }, { id: 'object', raw: '{}' },
    { id: 'null', raw: 'null' }, { id: 'ongeldig-lid', raw: '[null]' },
    { id: 'ongeldig-veld', raw: JSON.stringify([{ ...profile, mapping: { naam: 'bedrijfsnaam', telefoon: 'bestaat-niet' } }]) },
    { id: 'oude-lijst', raw: JSON.stringify([profile]), bewaard: true },
    { id: 'huidig', raw: JSON.stringify({ versie: 1, profielen: [profile] }), bewaard: true },
    { id: 'onbekende-versie', raw: JSON.stringify({ versie: 99, profielen: [profile] }) },
  ];
  for (const { id, raw, bewaard } of cases) {
    await controle(`B10 opslag ${id}`, async () => {
      const page = await open();
      await page.evaluate(({ raw, key }) => { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); }, { raw, key: profielSleutel });
      await upload(page, uploadbestand('profiel.csv', [['Naam', 'Telefoon'], ['Fabelwinkel', '020000000']]));
      await expect(kolom(page, 'Telefoon')).toHaveValue(bewaard ? 'email' : 'telefoon');
      if (raw !== null && id !== 'huidig') {
        await expect(page.getByText(/bronprofielen.*hersteld|bronprofielen.*bijgewerkt/i)).toBeVisible();
        const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), profielSleutel);
        assert.equal(saved.versie, 1);
        assert.ok(Array.isArray(saved.profielen));
      }
      await page.getByRole('button', { name: 'Opnieuw voorstellen' }).click();
      await expect(kolom(page, 'Telefoon')).toHaveValue('telefoon');
      await verwerken(page);
      const result = await download(page, `browser-profiel-${id}.xlsx`);
      assert.equal(rowsOf(result.wb, 'Unieke leads')[1][6], '+32 2 000 00 00');
      await page.reload();
      await upload(page, uploadbestand('profiel.csv', [['Naam', 'Telefoon'], ['Fabelwinkel', '020000000']]));
      await expect(page.getByText('Gekoppeld zoals bij een vorige verwerking met dezelfde kolomnamen.')).toBeVisible();
      await expect(kolom(page, 'Telefoon')).toHaveValue('telefoon');
    });
  }
  await controle('B10 onbeschikbare opslag', async () => {
    const page = await open();
    await page.evaluate(() => {
      Storage.prototype.getItem = () => { throw new Error('Opslag geweigerd voor deze proef'); };
      Storage.prototype.setItem = () => { throw new Error('Opslag geweigerd voor deze proef'); };
    });
    await upload(page, uploadbestand('opslag-geweigerd.csv', [['Naam', 'Telefoon'], ['Fabelwinkel', '020000000']]));
    await expect(page.getByText(/Bronprofielen zijn niet beschikbaar/)).toBeVisible();
    await expect(kolom(page, 'Telefoon')).toHaveValue('telefoon');
    await verwerken(page);
    const result = await download(page, 'browser-profiel-onbeschikbaar.xlsx');
    assert.equal(rowsOf(result.wb, 'Unieke leads')[1][6], '+32 2 000 00 00');
  });
  await controle('B11 contactspaties, waarschuwingen, download en herimport', async () => {
    const page = await open();
    const telefoon = ' 020000000  030000000 ';
    const email = ' info @ voorbeeld.invalid; fout@ ';
    await upload(page, uploadbestand('contact.csv', [['Naam', 'Telefoon', 'E-mail'], ['Fabelwinkel', telefoon, email], ['Zonnerader', 'geen nummer', 'in fo@voorbeeld.invalid']]));
    await verwerken(page);
    await page.getByRole('button', { name: /^Waarschuwingen/ }).click();
    await expect(page.getByRole('cell', { name: /e-mail.*fout@.*niet herkend/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /telefoon.*niet herkend/ })).toBeVisible();
    await page.screenshot({ path: path.join(out, 'browser-contactwaarschuwingen.png'), fullPage: true });
    const result = await download(page, 'browser-contacten.xlsx');
    const leads = rowsOf(result.wb, 'Unieke leads');
    assert.equal(leads[1][leads[0].indexOf('Telefoon 2')], '+32 3 000 00 00');
    assert.equal(leads[1][leads[0].indexOf('E-mail')], 'info@voorbeeld.invalid');
    for (const value of [telefoon, email]) assert.ok(rowsOf(result.wb, 'Oorspronkelijke gegevens').some((r) => r[7] === value));
    assert.match(rowsOf(result.wb, 'Logboek')[1][7], /fout@.*niet herkend/);
    const again = await open();
    await upload(again, [{ name: 'contactresultaat.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync(result.dest) }, uploadbestand('aanvulling.csv', [['Naam', 'Telefoon'], ['Fabelwinkel', '030000000']])]);
    await verwerken(again);
    const next = await download(again, 'browser-contacten-herimport.xlsx');
    assert.equal(rowsOf(next.wb, 'Unieke leads').length, 3);
    for (const value of [telefoon, email]) assert.ok(rowsOf(next.wb, 'Oorspronkelijke gegevens').some((r) => r[7] === value));
  });
  assert.deepEqual(fouten, [], 'alle browserregressies van de derde ronde');
}
