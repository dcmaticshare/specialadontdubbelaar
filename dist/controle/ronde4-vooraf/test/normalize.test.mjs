import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanValue, isScientificNotation, splitPhones, normalizePhone, normalizePhones, formatPhone,
  normalizeBtw, formatBtw, normalizeEmails, emailDomain, normalizeWebsite, splitStreetAndNumber,
  parseHouseNumber, streetKey, normalizeAddress, normalizeName, normalizePostcode,
} from '../src/engine/normalize.js';

// ---- opvulwaarden
test('opvulwaarden worden leeg', () => {
  for (const v of ['-', '+', 'n.v.t.', 'NVT', ' / ', '', null, undefined, '?']) assert.equal(cleanValue(v), '');
});
test('gewone waarde blijft, met spaties samengevoegd', () => {
  assert.equal(cleanValue('  Fabelia   Hair '), 'Fabelia Hair');
});
test('typografische apostrof wordt gewone apostrof', () => {
  assert.equal(cleanValue('Kokk’s'), "Kokk's");
});
test('leidende komma uit Bizzy-kolom Personen verdwijnt', () => {
  assert.equal(cleanValue(', Mira Testmans'), 'Mira Testmans');
});

// ---- telefoon
test('0400 00 10 01 en +32 400 00 10 01 geven hetzelfde nummer', () => {
  assert.equal(normalizePhone('0400 00 10 01').e164, '+32400001001');
  assert.equal(normalizePhone('+32 400 00 10 01').e164, '+32400001001');
});
test('0032 en +32 (0) worden herkend', () => {
  assert.equal(normalizePhone('0032 400 00 10 01').e164, '+32400001001');
  assert.equal(normalizePhone('+32 (0)400 00 10 01').e164, '+32400001001');
  assert.equal(normalizePhone('+32 0400 00 10 01').e164, '+32400001001');
});
test('vast nummer 02 000 10 02', () => {
  const r = normalizePhone('02 000 10 02');
  assert.equal(r.e164, '+3220001002');
  assert.equal(r.kind, 'vast');
  assert.equal(normalizePhone('+32 2 000 10 02').e164, '+3220001002');
});
test('weggevallen voorloopnul bij 8 of 9 cijfers', () => {
  assert.equal(normalizePhone('400001001').e164, '+32400001001');
  assert.equal(normalizePhone('20001002').e164, '+3220001002');
});
test('plus weggevallen: 32400001001', () => {
  assert.equal(normalizePhone('32400001001').e164, '+32400001001');
});
test('punten en schuine strepen in een nummer', () => {
  assert.equal(normalizePhone('0400/00.10.01').e164, '+32400001001');
  assert.equal(normalizePhone('02/000.10.02').e164, '+3220001002');
});
test('buitenlands nummer blijft', () => {
  assert.equal(normalizePhone('+31 6 12345678').e164, '+31612345678');
  assert.equal(normalizePhone('+31 6 12345678').kind, 'buitenland');
});
test('te kort nummer wordt genegeerd', () => {
  assert.equal(normalizePhone('1234').e164, null);
  assert.equal(normalizePhone('09 36').e164, null);
});
test('wetenschappelijke notatie geeft waarschuwing', () => {
  assert.ok(isScientificNotation('3,2479E+10'));
  assert.ok(isScientificNotation('3.2479E+10'));
  assert.ok(!isScientificNotation('0400 00 10 01'));
  assert.equal(normalizePhone('3,2479E+10').warning, 'wetenschappelijke notatie');
});
test('meerdere nummers in één cel splitsen', () => {
  assert.deepEqual(splitPhones('0400 00 10 01 / 02 000 10 02'), ['0400 00 10 01', '02 000 10 02']);
  assert.deepEqual(splitPhones('0400 00 10 01, 02 000 10 02'), ['0400 00 10 01', '02 000 10 02']);
  assert.deepEqual(splitPhones('0400 00 10 01 of 02 000 10 02'), ['0400 00 10 01', '02 000 10 02']);
  assert.deepEqual(splitPhones('0400/00.10.01'), ['0400/00.10.01']);
});
test('normalizePhones over meerdere kolommen ontdubbelt', () => {
  const r = normalizePhones(['0400 00 10 01', '+32 400 00 10 01; 02 000 10 02']);
  assert.deepEqual(r.phones, ['+32400001001', '+3220001002']);
  assert.equal(r.kinds['+32400001001'], 'gsm');
});
test('formatPhone geeft leesbaar formaat', () => {
  assert.equal(formatPhone('+32400001001'), '+32 400 00 10 01');
  assert.equal(formatPhone('+3220001002'), '+32 2 000 10 02');
  assert.equal(formatPhone('+3256123456'), '+32 56 12 34 56');
});

// ---- BTW
test('BE0123.456.749 en 0123 456 749 geven dezelfde cijfers', () => {
  assert.equal(normalizeBtw('BE0123.456.749').digits, '0123456749');
  assert.equal(normalizeBtw('0123 456 749').digits, '0123456749');
});
test('9 cijfers worden aangevuld tot 10', () => {
  assert.equal(normalizeBtw('123456749').digits, '0123456749');
});
test('modulo-97-controle', () => {
  assert.equal(normalizeBtw('BE0123.456.749').valid, true);
  assert.equal(normalizeBtw('be 0123 456 848').valid, true);
  assert.equal(normalizeBtw('be 0123 456 947').valid, true);
  assert.equal(normalizeBtw('BE0123.456.750').valid, false);
});
test('ongeldige lengte geeft geen nummer', () => {
  assert.equal(normalizeBtw('BE 123').digits, null);
  assert.equal(normalizeBtw('').digits, null);
});
test('formatBtw', () => {
  assert.equal(formatBtw('0123456749'), 'BE 0123.456.749');
});

// ---- e-mail
test('e-mail kleine letters, spaties weg', () => {
  assert.deepEqual(normalizeEmails(' Info@Fabelia.INVALID '), ['info@fabelia.invalid']);
});
test('meerdere e-mailadressen splitsen', () => {
  assert.deepEqual(normalizeEmails('a@b.invalid; c@d.invalid, e@f.invalid / g@h.invalid'), ['a@b.invalid', 'c@d.invalid', 'e@f.invalid', 'g@h.invalid']);
});
test('ongeldig e-mailadres wordt genegeerd', () => {
  assert.deepEqual(normalizeEmails('geen adres'), []);
  assert.deepEqual(normalizeEmails('info@fabelia'), []);
});
test('domein uit e-mail, behalve gratis providers', () => {
  assert.equal(emailDomain('contact@fabelia.invalid'), 'fabelia.invalid');
  assert.equal(emailDomain('testpersoon17@gmail.com'), null);
  assert.equal(emailDomain('testpersoon18@skynet.be'), null);
  assert.equal(emailDomain('x@telenet.be'), null);
  assert.equal(emailDomain('x@proximus.be'), null);
  assert.equal(emailDomain('x@outlook.com'), null);
});

// ---- website
test('website naar domein', () => {
  assert.equal(normalizeWebsite('https://fabelia.invalid'), 'fabelia.invalid');
  assert.equal(normalizeWebsite('https://www.voorbeeldhuur.invalid/contact/'), 'voorbeeldhuur.invalid');
  assert.equal(normalizeWebsite('www.voorbeeldhuur.invalid'), 'voorbeeldhuur.invalid');
  assert.equal(normalizeWebsite('http://voorbeeld-hvac.invalid/'), 'voorbeeld-hvac.invalid');
});
test('platformen tellen niet als website', () => {
  assert.equal(normalizeWebsite('https://www.facebook.com/fabelia.invalid'), null);
  assert.equal(normalizeWebsite('https://restaurantguru.com/Cafe-Sint-Fabel'), null);
  assert.equal(normalizeWebsite('https://www.instagram.com/x'), null);
});
test('geen website bij onzin', () => {
  assert.equal(normalizeWebsite('n.v.t.'), null);
  assert.equal(normalizeWebsite('zie facebook'), null);
});

// ---- adres
test('straat en nummer uit één veld', () => {
  assert.deepEqual(splitStreetAndNumber('Fabelgemsesteenweg 1058'), { straat: 'Fabelgemsesteenweg', huisnummer: '1058', bus: '' });
  assert.deepEqual(splitStreetAndNumber('Rid. A. Fabel de Testlaan 15'), { straat: 'Rid. A. Fabel de Testlaan', huisnummer: '15', bus: '' });
});
test('reeks huisnummers: eerste nummer', () => {
  assert.equal(splitStreetAndNumber('Fabelgemsesteenweg 1004-1006').huisnummer, '1004');
});
test('busletter apart', () => {
  assert.deepEqual(splitStreetAndNumber('Kerkstraat 135 C'), { straat: 'Kerkstraat', huisnummer: '135', bus: 'c' });
  assert.deepEqual(splitStreetAndNumber('Kerkstraat 12A'), { straat: 'Kerkstraat', huisnummer: '12', bus: 'a' });
  assert.deepEqual(splitStreetAndNumber('Kerkstraat 12 bus 3'), { straat: 'Kerkstraat', huisnummer: '12', bus: '3' });
});
test('postcode en gemeente achteraan worden genegeerd', () => {
  assert.deepEqual(splitStreetAndNumber('Verzonnen Heirweg 21, 9890 Gavere'), { straat: 'Verzonnen Heirweg', huisnummer: '21', bus: '' });
});
test('adres zonder nummer blijft straat', () => {
  assert.deepEqual(splitStreetAndNumber('Groenstraat'), { straat: 'Groenstraat', huisnummer: '', bus: '' });
});
test('huisnummerveld', () => {
  assert.deepEqual(parseHouseNumber('1004-1006'), { huisnummer: '1004', bus: '' });
  assert.deepEqual(parseHouseNumber('135 C'), { huisnummer: '135', bus: 'c' });
  assert.deepEqual(parseHouseNumber('8'), { huisnummer: '8', bus: '' });
});
test('straatsleutel zonder accenten, streepjes, spaties en punten', () => {
  assert.equal(streetKey('Sint-Elooistraat'), 'sintelooistraat');
  assert.equal(streetKey('Sint Elooistraat'), 'sintelooistraat');
  assert.equal(streetKey('St.-Elooistraat'), 'sintelooistraat');
  assert.equal(streetKey('Fabelgemse stwg'), 'fabelgemsesteenweg');
  assert.equal(streetKey('Fabelgemsestwg'), 'fabelgemsesteenweg');
  assert.equal(streetKey('Kerkstr.'), 'kerkstraat');
  assert.equal(streetKey('Rid. A. Fabel de Testlaan'), 'ridderafabeldetestlaan');
});
test('normalizeAddress met aparte kolommen', () => {
  const a = normalizeAddress({ straat: 'Sint Elooistraat', huisnummer: '15' });
  assert.equal(a.adresKey, 'sintelooistraat|15');
});
test('normalizeAddress met één veld', () => {
  const a = normalizeAddress({ adres: 'Sint-Elooistraat 15' });
  assert.equal(a.straat, 'Sint-Elooistraat');
  assert.equal(a.adresKey, 'sintelooistraat|15');
});
test('normalizeAddress straatveld dat het nummer herhaalt', () => {
  const a = normalizeAddress({ straat: 'Kerkstraat 12', huisnummer: '12' });
  assert.equal(a.straat, 'Kerkstraat');
  assert.equal(a.adresKey, 'kerkstraat|12');
});
test('postcode', () => {
  assert.equal(normalizePostcode('9820'), '9820');
  assert.equal(normalizePostcode('B-9820'), '9820');
  assert.equal(normalizePostcode('-'), '');
});

// ---- naam
test('bedrijfsnaam: kleine letters, accenten weg, rechtsvorm weg', () => {
  const n = normalizeName('Van Fabel - De Wolke bv');
  assert.deepEqual(n.words, ['van', 'fabel', 'de', 'wolke']);
  assert.equal(normalizeName('Café St-Fabel BVBA').clean, 'cafe st fabel');
});
test('rechtsvormen met punten', () => {
  assert.deepEqual(normalizeName('Fabelia B.V.B.A.').words, ['fabelia']);
  assert.deepEqual(normalizeName('Fabelia comm.v').words, ['fabelia']);
  assert.deepEqual(normalizeName('Fabelia VZW').words, ['fabelia']);
});
test('apostrof en ampersand', () => {
  assert.equal(normalizeName("Kokk's").compact, 'kokks');
  assert.equal(normalizeName('Traiteur Kokk’s').compact, 'traiteurkokks');
  assert.deepEqual(normalizeName('Fabelia Hair & Beauty Boutique').words, ['fabelia', 'hair', 'beauty', 'boutique']);
});
test('naam met komma: zelfde woorden', () => {
  assert.deepEqual([...normalizeName('Fabelman, Norian').words].sort(), [...normalizeName('Norian Fabelman').words].sort());
});
test('lege naam', () => {
  assert.deepEqual(normalizeName('-'), { clean: '', words: [], compact: '' });
});
