import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestMapping, extractFields, profileSignature, makeProfile, detectNearConstant, normalizeHeader } from '../src/io/mapping.js';

const rows = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

test('Google API-lijst wordt juist gekoppeld', () => {
  const header = ['Lead Source', 'Project', 'Leadowner', 'Company', 'Hoofdsector', 'Sector', 'Mobile', 'Straat Huisnummer', 'Postcode', 'Woonplaats', 'Voornaam', 'Achternaam'];
  const r = suggestMapping({ header, rows: rows(30, (i) => ['GOOGLE API', '9820 Voorbeeldstad-Melle', '-', `Bedrijf ${i}`, 'vrij beroep', 'advocaat', '+32 400 00 10 06', `Groenstraat ${i}`, '9820', 'Voorbeeldstad-Melle', '-', '-']) });
  assert.deepEqual(r.mapping, ['negeren', 'negeren', 'negeren', 'bedrijfsnaam', 'hoofdsector', 'sector', 'telefoon', 'adres', 'postcode', 'gemeente', 'voornaam', 'achternaam']);
  assert.equal(r.nearConstant[8], true, 'postcode staat overal op 9820');
});
test('Bizzy-lijst: Naam is bedrijfsnaam, Personen contactpersoon, Stad bijna constant', () => {
  const header = ['Naam', 'E-mail', 'Telefoonnummer', 'Website', 'BTW-nummer', 'Activiteiten', 'Postcode', 'Beschrijving', 'Personen', 'Stad', 'Huisnummer', 'Straat', 'project old '];
  const r = suggestMapping({ header, rows: rows(30, (i) => [`Bedrijf ${i}`, `x${i}@a.invalid`, '+32 400 00 10 01', 'https://a.invalid', 'BE0123.456.749', 'Kapper', '9820', 'tekst', ', Mira Testmans', 'Testdorp', String(i), 'Kerkstraat', 'voorbeeldstad']) });
  assert.deepEqual(r.mapping, ['bedrijfsnaam', 'email', 'telefoon', 'website', 'btw', 'sector', 'postcode', 'negeren', 'contactpersoon', 'gemeente', 'huisnummer', 'straat', 'negeren']);
  assert.equal(r.nearConstant[9], true);
});
test('klantenlijst: bedrijf + naam -> naam is contactpersoon; adres naast huisnummer is straat', () => {
  const header = ['bedrijf', 'bedrag', 'naam', 'adres', 'huisnummer', 'postcode', 'gemeente', 'telefoonnr', 'btw', 'email', 'sector', 'hoofdsector', 'project old', 'leadbron'];
  const r = suggestMapping({ header, rows: rows(5, (i) => ['Zywan', '2,360 €', 'Nilo Zywan', 'Verzinselplein', '8', '9820', 'Voorbeeldstad', '02 000 10 03', 'be 0123 456 848', 'a@b.invalid', 'snackbar', 'horeca', 'voorbeeldstad', 'bestaande klanten']) });
  assert.deepEqual(r.mapping, ['bedrijfsnaam', 'negeren', 'contactpersoon', 'straat', 'huisnummer', 'postcode', 'gemeente', 'telefoon', 'btw', 'email', 'sector', 'hoofdsector', 'negeren', 'negeren']);
});
test('Braintoss-lijst: Onderneming, Adres in één veld, Bron is geen website', () => {
  const header = ['Onderneming', 'Telefoonnummer', 'Adres', 'Postcode', 'Gemeente', 'E-mail', 'Controle', 'Bron', 'Website', 'Opmerkingen', 'project old', 'lead bron', 'achternaam'];
  const r = suggestMapping({ header, rows: rows(5, (i) => ['ABC', '02 000 10 05', 'Verzonnen Heirweg 21', '9890', 'Gavere', 'info@voorbeeldhuur.invalid', 'Online', 'https://restaurantguru.com/x', 'www.voorbeeldhuur.invalid', '', 'Voorbeeldstad', 'braintoss1', '-']) });
  assert.deepEqual(r.mapping, ['bedrijfsnaam', 'telefoon', 'adres', 'postcode', 'gemeente', 'email', 'negeren', 'negeren', 'website', 'negeren', 'negeren', 'negeren', 'achternaam']);
});
test('Voornaam en Achternaam worden samen de contactpersoon (via extractFields + record)', () => {
  const header = ['Company', 'Voornaam', 'Achternaam'];
  const { fields } = extractFields(['bedrijfsnaam', 'voornaam', 'achternaam'], header, ['X', 'Nilo', 'Zywan']);
  assert.equal(fields.voornaam, 'Nilo');
  assert.equal(fields.achternaam, 'Zywan');
});
test('meerdere telefoonkolommen', () => {
  const header = ['Naam', 'Telefoon', 'GSM', 'Tel 2'];
  const r = suggestMapping({ header, rows: [['A', '1', '2', '3']] });
  assert.deepEqual(r.mapping, ['bedrijfsnaam', 'telefoon', 'telefoon', 'telefoon']);
  const { fields } = extractFields(r.mapping, header, ['A', '09 1', '0479 2', '']);
  assert.deepEqual(fields.telefoon, ['09 1', '0479 2', '']);
});
test('onbekende kolomnaam wordt aan de inhoud herkend', () => {
  const header = ['Naam', 'Kolom X', 'Kolom Y'];
  const r = suggestMapping({ header, rows: rows(10, (i) => [`B${i}`, `info${i}@firma.invalid`, `0479 80 51 ${10 + i}`]) });
  assert.deepEqual(r.mapping, ['bedrijfsnaam', 'email', 'telefoon']);
});
test('"nummer" is huisnummer naast een straat, anders telefoon', () => {
  assert.deepEqual(suggestMapping({ header: ['Naam', 'Straat', 'Nummer'], rows: [] }).mapping, ['bedrijfsnaam', 'straat', 'huisnummer']);
  assert.deepEqual(suggestMapping({ header: ['Naam', 'Nummer'], rows: [] }).mapping, ['bedrijfsnaam', 'telefoon']);
});
test('bronprofiel: zelfde kolomnamen -> zelfde handtekening, profiel wordt toegepast', () => {
  const header = ['Naam', 'E-mail', 'Telefoonnummer'];
  const sig = profileSignature(header);
  assert.equal(sig, profileSignature(['Telefoonnummer', 'Naam', 'E-mail']));
  const profile = makeProfile(header, ['contactpersoon', 'email', 'telefoon'], 'bizzy');
  const r = suggestMapping({ header, rows: [], profiles: [profile] });
  assert.equal(r.fromProfile, true);
  assert.deepEqual(r.mapping, ['contactpersoon', 'email', 'telefoon']);
});
test('bijna constante kolom', () => {
  assert.equal(detectNearConstant(rows(30, () => '9820')), true);
  assert.equal(detectNearConstant(rows(30, (i) => String(i))), false);
  assert.equal(detectNearConstant(rows(5, () => '9820')), false, 'te weinig rijen');
});
test('normalizeHeader', () => {
  assert.equal(normalizeHeader('E-Mail adres'), 'e mail adres');
  assert.equal(normalizeHeader('BTW-nummer'), 'btw nummer');
  assert.equal(normalizeHeader(' project old '), 'project old');
});
