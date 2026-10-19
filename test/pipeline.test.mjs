import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { prepare, assemble, logRows } from '../src/engine/pipeline.js';
import { buildResultWorkbook, resultFileName } from '../src/io/write.js';
import { pairKey } from '../src/engine/cluster.js';

const require = createRequire(import.meta.url);
globalThis.XLSX = require('../vendor/xlsx.full.min.js');

import { source } from './helpers/fixtures.mjs';

const google = source('Voorbeeldstad api.csv',
  ['Lead Source', 'Project', 'Leadowner', 'Company', 'Hoofdsector', 'Sector', 'Mobile', 'Straat Huisnummer', 'Postcode', 'Woonplaats', 'Voornaam', 'Achternaam'],
  [
    ['GOOGLE API', '9820 Voorbeeldstad-Melle', '-', 'Fabelia', 'diensten', 'kapper', '+32 400 00 10 01', 'Fabelgemsesteenweg 1004', '9820', 'Voorbeeldstad-Melle', '-', '-'],
    ['GOOGLE API', '9820 Voorbeeldstad-Melle', '-', 'Padel Zyvo', 'sport', 'padel', '0475 11 22 33', 'Sportlaan 1', '9820', 'Voorbeeldstad-Melle', '-', '-'],
    ['GOOGLE API', '9820 Voorbeeldstad-Melle', '-', 'Snackbar Zywan', 'horeca', 'snackbar', '02 000 10 03', 'Verzinselplein 8', '9820', 'Voorbeeldstad-Melle', '-', '-'],
    ['GOOGLE API', '9820 Voorbeeldstad-Melle', '-', 'Bakkerij Vermeulen', 'retail', 'bakker', '09 111 22 33', 'Dorp 3', '9820', 'Voorbeeldstad-Melle', '-', '-'],
  ]);
const bizzy = source('bizzy lijst.xlsx',
  ['Naam', 'E-mail', 'Telefoonnummer', 'Website', 'BTW-nummer', 'Activiteiten', 'Postcode', 'Personen', 'Stad', 'Huisnummer', 'Straat'],
  [
    ['Fabelia Hair & Beauty Boutique', 'contact@fabelia.invalid', '+32 400 00 10 01', 'https://fabelia.invalid', 'BE0123.456.749', 'Schoonheidsverzorging', '9820', ', Mira Testmans', 'Testdorp', '1004', 'Fabelgemsesteenweg'],
    ['Tennisbesnaringen Zyvo', '', '0475 11 22 33', '', '', 'Sport', '9820', '', 'Testdorp', '2', 'Sportlaan'],
    ['Slagerij Peeters', 'info@voorbeeldslager.invalid', '09 444 55 66', '', '', 'Slager', '9820', '', 'Testdorp', '9', 'Dorp'],
  ]);
const derde = source('andere lijst.xlsx',
  ['bedrijf', 'naam', 'adres', 'huisnummer', 'postcode', 'gemeente', 'telefoonnr', 'btw', 'email'],
  [['Zywan', 'Nilo Zywan', 'Verzinselplein', '8', '9820', 'Voorbeeldstad', '02 000 10 03', 'be 0123 456 848', 'testpersoon42@hotmail.com']]);

const ctx = { version: '0.1.0-test', buildDate: '2026-10-16', datum: '2026-10-16', verwerktOp: '2026-10-16 10:00' };

test('codescan 22: Unicode-website en punycode-e-mail vinden dezelfde lead met behoud van bronwaarden', async () => {
  const lijst = source('synthetische-idn.csv', ['Naam', 'Website', 'E-mail'], [
    ['Fabelatelier', 'https://café.invalid/contact', ''],
    ['Fabelatelier', '', 'info@xn--caf-dma.invalid'],
  ]);
  const prep = await prepare({ sources: [lijst] });
  assert.deepEqual(prep.records.map((r) => r.norm.domains), [['xn--caf-dma.invalid'], ['xn--caf-dma.invalid']]);
  const res = assemble(prep, new Map());
  assert.equal(res.summary.uniekeLeads, 1);
  assert.equal(res.merged[0].website, 'https://café.invalid/contact');
  assert.equal(prep.records[1].fields.email[0], 'info@xn--caf-dma.invalid');
});

test('verwerking van begin tot einde: samenvoegen en twijfelpaar', async () => {
  const prep = await prepare({ sources: [google, bizzy, derde] });
  const res = assemble(prep, new Map(), { datum: '2026-10-16' });
  assert.equal(res.summary.rijen, 8);
  assert.equal(res.summary.automatischSamengevoegd, 2, 'Fabelia (google + bizzy) en Zywan (google + derde lijst)');
  assert.equal(res.summary.teControleren, 1, 'Zyvo');
  assert.equal(res.summary.uniekeLeads, 6, 'Fabelia, Padel Zyvo, Tennisbesnaringen Zyvo, Zywan, Bakkerij, Slagerij (twijfelparen blijven apart)');
  assert.deepEqual(res.merged.map((m) => m.nr).sort((a, b) => a - b), ['1', '2', '3', '4', '5', '6']);
});

test('twijfelparen blijven apart met "Mogelijk dubbel met"; beslissing "zelfde" voegt samen', async () => {
  const prep = await prepare({ sources: [google, bizzy, derde] });
  let res = assemble(prep, new Map());
  const zyvo = res.merged.find((m) => m.bedrijfsnaam === 'Padel Zyvo');
  assert.equal(zyvo.mogelijkDubbel.length, 1);
  assert.equal(zyvo.mogelijkDubbel[0].other.bedrijfsnaam, 'Tennisbesnaringen Zyvo');
  const p = res.review[0];
  res = assemble(prep, new Map([[pairKey(p.i, p.j), 'zelfde']]));
  assert.equal(res.summary.teControleren, 0);
  assert.equal(res.summary.uniekeLeads, 5);
  assert.equal(res.summary.samengevoegdDoorMens, 1);
});

test('elke rij staat precies één keer in het logboek', async () => {
  const prep = await prepare({ sources: [google, bizzy, derde] });
  const res = assemble(prep, new Map());
  const log = logRows(prep, res);
  assert.equal(log.length, 8);
  assert.equal(log.filter((l) => l.uitkomst === 'Samengevoegd').length, 4, 'twee groepen van twee rijen');
  assert.equal(log.filter((l) => l.uitkomst === 'Uniek').length, 4);
});

test('resultaatbestand: tabbladen, uploadformaat, beslissingen', async () => {
  const prep = await prepare({ sources: [google, bizzy, derde] });
  const p = assemble(prep, new Map()).review[0];
  const decisionLog = [{ i: p.i, j: p.j, beslissing: 'verschillend', datum: '2026-10-16 10:00', score: p.score, reason: p.reason }];
  const res = assemble(prep, new Map([[pairKey(p.i, p.j), 'verschillend']]), { datum: '2026-10-16' });
  const wb = buildResultWorkbook(prep, res, { ...ctx, decisionLog });
  assert.deepEqual(wb.SheetNames, ['Unieke leads', 'Te controleren', 'Beslissingen', 'Logboek', 'Per bron', 'Oorspronkelijke gegevens', 'Info']);
  const uniek = globalThis.XLSX.utils.sheet_to_json(wb.Sheets['Unieke leads'], { header: 1 });
  assert.equal(uniek[0][0], 'Lead Source');
  assert.equal(uniek[0][3], 'Company');
  assert.equal(uniek[0][12], 'Nr');
  assert.equal(uniek.length - 1, 6, 'zes unieke leads');
  const fabelia = uniek.find((r) => String(r[3]).startsWith('Fabelia'));
  assert.equal(fabelia[6], '+32 400 00 10 01');
  assert.ok(String(fabelia[13]).includes('bizzy'), 'bronnen vermeld');
  const besl = globalThis.XLSX.utils.sheet_to_json(wb.Sheets.Beslissingen, { header: 1 });
  assert.equal(besl.length - 1, 1);
  assert.equal(besl[1][1], 'Verschillend');
  const te = globalThis.XLSX.utils.sheet_to_json(wb.Sheets['Te controleren'], { header: 1 });
  assert.equal(te.length - 1, 0, 'het beoordeelde paar staat niet meer in Te controleren');
  assert.equal(resultFileName('2026-10-16'), 'Leads_ontdubbeld_2026-10-16.xlsx');
  // Controleer de werkelijk geschreven cellen, onafhankelijk van de opslag in het geheugen.
  const written = globalThis.XLSX.read(globalThis.XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  let checked = 0;
  for (const name of written.SheetNames) for (const [k, c] of Object.entries(written.Sheets[name])) if (k[0] !== '!') {
    assert.equal(c.t, 's', `${name}!${k}`); assert.equal(c.f, undefined); checked++;
  }
  assert.ok(checked > 0);
});

test('één lijst alleen: dubbels binnen de lijst', async () => {
  const dup = source('lijst.csv', ['Naam', 'Telefoon', 'Adres'], [['Fabelia', '0400 00 10 01', 'Fabelgemsesteenweg 1004'], ['Fabelia BV', '+32 400 00 10 01', 'Fabelgemsesteenweg 1004'], ['Andere Zaak', '09 000 00 00', 'Dorp 1']]);
  const prep = await prepare({ sources: [dup] });
  const res = assemble(prep, new Map());
  assert.equal(res.summary.uniekeLeads, 2);
  assert.equal(res.perBron[0].dubbelBinnenLijst, 2);
});

test('codescan 3: dezelfde naam en viercijferig huisnummer met letter voegen automatisch samen', async () => {
  const lijst = source('synthetische-adressen.csv', ['Naam', 'Adres', 'Postcode'], [
    ['Fabelatelier', 'Fabelgemsesteenweg 1004 B', '9820'],
    ['Fabelatelier', 'Fabelgemsesteenweg 1004 B', '9820'],
  ]);
  const prep = await prepare({ sources: [lijst] });
  const res = assemble(prep, new Map());
  assert.equal(res.summary.uniekeLeads, 1);
  assert.equal(res.summary.automatischSamengevoegd, 1);
  assert.equal(res.summary.teControleren, 0);
});

test('codescan 20: beide adresvolgordes vinden dezelfde lead zonder gedeeld contactgegeven', async () => {
  const lijst = source('synthetische-franse-adressen.csv', ['Naam', 'Adres', 'Postcode'], [
    ['Fabelatelier', '16 Rue de la Fable', '9820'],
    ['Fabelatelier', 'Rue de la Fable 16', '9820'],
  ]);
  const prep = await prepare({ sources: [lijst] });
  const res = assemble(prep, new Map());
  assert.equal(res.summary.uniekeLeads, 1);
  assert.equal(res.summary.automatischSamengevoegd, 1);
  assert.equal(res.summary.teControleren, 0);
});
