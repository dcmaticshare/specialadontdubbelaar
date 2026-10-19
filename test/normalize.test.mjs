import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanValue, isScientificNotation, splitPhones, normalizePhone, normalizePhones, formatPhone,
  normalizeBtw, formatBtw, normalizeEmails, inspectEmails, emailDomain, normalizeWebsite, splitStreetAndNumber,
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
test('codescan 21: toestelnummer telt niet mee in het basisnummer', () => {
  for (const suffix of [' ext 12', ' EXT. 12', ' tst: 12', ' toestel 12', ' extension 12', '#12', ' # 12']) {
    for (const [nummer, e164, kind] of [
      ['02-000.10.02', '+3220001002', 'vast'],
      ['+32 (0)400 00 10 01', '+32400001001', 'gsm'],
      ['+31 6 12345678', '+31612345678', 'buitenland'],
    ]) assert.deepEqual(normalizePhone(nummer + suffix), { e164, kind }, nummer + suffix);
  }
});
test('codescan 21: toestelnummers blijven per telefoon begrensd bij meerdere nummers', () => {
  for (const scheiding of ['; ', ', ', ' / ', ' - ', '  ', ' of ', '\n']) {
    const result = normalizePhones(`02-000.10.02 ext 12${scheiding}0400 00 10 01#34`);
    assert.deepEqual(result.phones, ['+3220001002', '+32400001001'], scheiding);
    assert.deepEqual(result.warnings, [], scheiding);
  }
  assert.deepEqual(normalizePhones(['02-000.10.02 ext 12', '02-000.10.02 toestel 34']).phones, ['+3220001002']);
});
test('codescan 21: een toestelnummer herstelt geen ongeldig basisnummer', () => {
  for (const waarde of ['1234 ext 12', 'ext 020001002', '#020001002', '0200010020 ext 12', '020001002 text 12']) {
    assert.equal(normalizePhone(waarde).e164, null, waarde);
    assert.ok(normalizePhone(waarde).warning, waarde);
  }
});
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
test('codescan 14: weergavenamen en toelichtingen zonder @ geven geen e-mailwaarschuwing', () => {
  for (const [waarde, emails] of [
    ['Mira Testmans <mira@voorbeeld.invalid>', ['mira@voorbeeld.invalid']],
    ['info@voorbeeld.invalid (algemeen)', ['info@voorbeeld.invalid']],
    ['"Mira Testmans" <MIRA @ voorbeeld.invalid>; info@voorbeeld.invalid (algemeen)', ['mira@voorbeeld.invalid', 'info@voorbeeld.invalid']],
    ['algemeen; geen adres', []],
  ]) assert.deepEqual(inspectEmails(waarde), { emails, warnings: [] }, waarde);
});
test('codescan 14: ongeldige delen met @ blijven waarschuwen zonder gedeeltelijk adresherstel', () => {
  for (const waarde of ['fout@', 'info@voorbeeld', 'in fo@voorbeeld.invalid', 'info@voor beeld.invalid']) {
    const result = inspectEmails(`Mira Testmans <${waarde}>; info@voorbeeld.invalid (algemeen)`);
    assert.deepEqual(result.emails, ['info@voorbeeld.invalid']);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].waarde, waarde);
    assert.match(result.warnings[0].reden, /niet herkend/);
  }
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
test('codescan 22: IDN-websites krijgen dezelfde punycodesleutel als hun ASCII-vorm', () => {
  for (const website of ['café.invalid', 'cafe\u0301.invalid', 'https://WWW2.CAFÉ.invalid:443/contact?q=1#kaart', '//xn--caf-dma.invalid/']) {
    assert.equal(normalizeWebsite(website), 'xn--caf-dma.invalid', website);
  }
  assert.notEqual(normalizeWebsite('café.invalid'), normalizeWebsite('cafe.invalid'), 'een accent onderscheidt twee domeinen');
  assert.equal(normalizeWebsite('fabelvoorbeeld.рф'), 'fabelvoorbeeld.xn--p1ai');
  assert.equal(normalizeWebsite('fabelvoorbeeld.xn--p1ai'), 'fabelvoorbeeld.xn--p1ai');
});
test('codescan 22: IDN-domeinen uit e-mail en website gebruiken dezelfde sleutel', () => {
  for (const email of ['info@café.invalid', 'info@cafe\u0301.invalid', 'info@xn--caf-dma.invalid']) {
    assert.equal(emailDomain(email), 'xn--caf-dma.invalid', email);
  }
});
test('codescan 22: IDN-ondersteuning blijft ongeldige hosts en platformen uitsluiten', () => {
  for (const website of ['café invalid', 'café', 'https://info@café.invalid', '%63afé.invalid', 'café\\.invalid', 'xn--.invalid', 'https://café.facebook.com']) {
    assert.equal(normalizeWebsite(website), null, website);
  }
});
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
test('codescan 20: huisnummer vóór de straat levert dezelfde adresvelden en sleutel op', () => {
  for (const [nummer, bus] of [['16', ''], ['16A', 'a'], ['16 B', 'b'], ['1004 B', 'b']]) {
    for (const scheiding of [' ', ', ', ',']) {
      for (const achtervoegsel of ['', ', 9820 Fabelgem']) {
        const invoer = `${nummer}${scheiding}Rue de la Fable${achtervoegsel}`;
        const huisnummer = nummer.startsWith('1004') ? '1004' : '16';
        assert.deepEqual(splitStreetAndNumber(invoer), { straat: 'Rue de la Fable', huisnummer, bus }, invoer);
        for (const veld of ['adres', 'straat']) {
          const adres = normalizeAddress({ [veld]: invoer });
          assert.equal(adres.adresKey, `ruedelafable|${huisnummer}`, invoer);
          assert.equal(adres.bus, bus, invoer);
          assert.deepEqual(adres, normalizeAddress({ adres: `Rue de la Fable ${nummer}` }), invoer);
        }
      }
    }
  }
});
test('codescan 20: nummer achteraan houdt voorrang en een nummer zonder straat blijft ongesplitst', () => {
  assert.deepEqual(splitStreetAndNumber('4 Septembre 16'), { straat: '4 Septembre', huisnummer: '16', bus: '' });
  for (const straat of ['Rue du 8 Mai', '16', '123456 Rue de la Fable']) {
    assert.deepEqual(splitStreetAndNumber(straat), { straat, huisnummer: '', bus: '' });
  }
});
test('codescan 20: losse postcode en gemeente leveren geen huisnummer of adresKey op', () => {
  for (const straat of ['9000 Gent', '1000 Sint-Joost-ten-Node']) {
    assert.deepEqual(splitStreetAndNumber(straat), { straat, huisnummer: '', bus: '' });
    for (const veld of ['adres', 'straat']) assert.equal(normalizeAddress({ [veld]: straat }).adresKey, '');
  }
});
test('codescan 20: ordinalen vooraan blijven deel van de straatnaam', () => {
  for (const straat of ['1e Kerkstraat', '2de Kerkstraat', '3ste Kerkstraat', '1E Kerkstraat']) {
    assert.deepEqual(splitStreetAndNumber(straat), { straat, huisnummer: '', bus: '' });
    for (const veld of ['adres', 'straat']) assert.equal(normalizeAddress({ [veld]: straat }).adresKey, '');
  }
});
test('codescan 20: Franse adressen, postcode achteraan en buswaarden blijven herkenbaar', () => {
  for (const [invoer, straat, huisnummer, bus] of [
    ['16 Rue de la Loi', 'Rue de la Loi', '16', ''],
    ['16A, Rue de la Loi', 'Rue de la Loi', '16', 'a'],
    ['Kerkstraat 12, 9000 Gent', 'Kerkstraat', '12', ''],
    ['Hundelgemsesteenweg 1004 B', 'Hundelgemsesteenweg', '1004', 'b'],
    ['Kerkstraat 12 bus 3', 'Kerkstraat', '12', '3'],
    ['1e Kerkstraat 12', '1e Kerkstraat', '12', ''],
  ]) assert.deepEqual(splitStreetAndNumber(invoer), { straat, huisnummer, bus }, invoer);
});
test('codescan 20: expliciete komma onderscheidt huisnummerletter E van een ordinaal', () => {
  for (const nummer of ['16E', '16e', '16 E']) {
    for (const scheiding of [', ', ',', ' , ']) {
      for (const achtervoegsel of ['', ', 1000 Bruxelles']) {
        const invoer = `${nummer}${scheiding}Rue de la Loi${achtervoegsel}`;
        assert.deepEqual(splitStreetAndNumber(invoer), { straat: 'Rue de la Loi', huisnummer: '16', bus: 'e' }, invoer);
        for (const veld of ['adres', 'straat']) {
          assert.deepEqual(normalizeAddress({ [veld]: invoer }), normalizeAddress({ adres: 'Rue de la Loi 16E' }), invoer);
        }
      }
    }
  }
});
test('codescan 20: viercijferige Franse huisnummers behouden hun adresKey bij duidelijke straatnamen', () => {
  for (const straat of ['Rue de la Loi', 'rue de la Loi', 'Avenue de la Fable', 'Boulevard de la Fable', 'Chaussée de la Fable']) {
    for (const achtervoegsel of ['', ', 1000 Bruxelles']) {
      const invoer = `1004 ${straat}${achtervoegsel}`;
      assert.deepEqual(splitStreetAndNumber(invoer), { straat, huisnummer: '1004', bus: '' }, invoer);
      for (const veld of ['adres', 'straat']) {
        assert.deepEqual(normalizeAddress({ [veld]: invoer }), normalizeAddress({ adres: `${straat} 1004` }), invoer);
      }
    }
  }
  for (const straat of ['9000 Gent', '1000 Ruiselede', '1000 Rue']) {
    assert.deepEqual(splitStreetAndNumber(straat), { straat, huisnummer: '', bus: '' }, straat);
  }
});
test('reeks huisnummers: eerste nummer', () => {
  assert.equal(splitStreetAndNumber('Fabelgemsesteenweg 1004-1006').huisnummer, '1004');
});
test('busletter apart', () => {
  assert.deepEqual(splitStreetAndNumber('Kerkstraat 135 C'), { straat: 'Kerkstraat', huisnummer: '135', bus: 'c' });
  assert.deepEqual(splitStreetAndNumber('Kerkstraat 12A'), { straat: 'Kerkstraat', huisnummer: '12', bus: 'a' });
  assert.deepEqual(splitStreetAndNumber('Kerkstraat 12 bus 3'), { straat: 'Kerkstraat', huisnummer: '12', bus: '3' });
});
for (const label of ['bus', 'bte', 'box']) {
  test(`codescan 19: leeg buslabel ${label} verzint geen buswaarde`, () => {
    for (const nummer of [`12 ${label}`, `12 ${label.toUpperCase()}  `]) {
      assert.deepEqual(splitStreetAndNumber(`Kerkstraat ${nummer}`), {
        straat: 'Kerkstraat', huisnummer: '12', bus: '',
      }, nummer);
      assert.deepEqual(parseHouseNumber(nummer), { huisnummer: '12', bus: '' }, nummer);
      for (const velden of [{ adres: `Kerkstraat ${nummer}` }, { straat: 'Kerkstraat', huisnummer: nummer }]) {
        const adres = normalizeAddress(velden);
        assert.equal(adres.adresKey, 'kerkstraat|12');
        assert.equal(adres.bus, '');
      }
    }
  });
}
test('codescan 19: buslabels met waarde en losse huisnummerletters blijven herkenbaar', () => {
  for (const [nummer, bus] of [
    ['12 bus 3', '3'], ['12 bte 3', '3'], ['12 box A', 'a'], ['12 BUS 3A', '3a'],
    ['12 b 3', '3'], ['12 b. 3', '3'], ['12 b3', '3'], ['12 b.3', '3'],
    ['12bus3', '3'], ['12bte3', '3'], ['12box3', '3'],
    ['12 B', 'b'], ['12B', 'b'], ['12A bus 3', '3'], ['12A b. 3', '3'], ['12-14 bus 3', '3'],
  ]) {
    assert.deepEqual(splitStreetAndNumber(`Kerkstraat ${nummer}`), {
      straat: 'Kerkstraat', huisnummer: '12', bus,
    }, nummer);
    assert.deepEqual(parseHouseNumber(nummer), { huisnummer: '12', bus }, nummer);
  }
});
test('postcode en gemeente achteraan worden genegeerd', () => {
  assert.deepEqual(splitStreetAndNumber('Verzonnen Heirweg 21, 9890 Gavere'), { straat: 'Verzonnen Heirweg', huisnummer: '21', bus: '' });
});
test('codescan 3: viercijferig huisnummer met letter of bus blijft behouden', () => {
  for (const [nummer, bus] of [['1004 B', 'b'], ['1004B', 'b'], ['1004 bus 2', '2']]) {
    for (const achtervoegsel of ['', ', 9820 Fabelgem', ' - 9820 Fabelgem', ' 9820 Fabelgem']) {
      const adres = `Fabelgemsesteenweg ${nummer}${achtervoegsel}`;
      assert.deepEqual(splitStreetAndNumber(adres), {
        straat: 'Fabelgemsesteenweg', huisnummer: '1004', bus,
      }, adres);
      for (const veld of ['adres', 'straat']) {
        const norm = normalizeAddress({ [veld]: adres });
        assert.equal(norm.adresKey, 'fabelgemsesteenweg|1004', `${veld}: ${adres}`);
        assert.equal(norm.bus, bus, `${veld}: ${adres}`);
      }
    }
  }
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
