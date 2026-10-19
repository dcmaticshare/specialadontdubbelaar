import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestMapping, changeMapping, extractFields, profileSignature, makeProfile, detectNearConstant, normalizeHeader } from '../src/io/mapping.js';

const rows = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

test('codescan 26: iedere enkelvoudige handmatige keuze vervangt alle eerdere koppelingen', () => {
  for (const field of ['bedrijfsnaam', 'contactpersoon', 'voornaam', 'achternaam', 'website', 'btw',
    'adres', 'straat', 'huisnummer', 'bus', 'postcode', 'gemeente', 'hoofdsector', 'sector']) {
    for (const column of [0, 1, 2]) {
      const original = [field, field, field];
      const result = changeMapping(['A', 'B', 'C'], original, column, field);
      assert.deepEqual(result.mapping, original.map((_, c) => c === column ? field : 'negeren'));
      assert.deepEqual(original, [field, field, field], 'de invoer blijft ongewijzigd');
      assert.equal(result.mappingNotes.length, 2);
      assert.equal(result.fromProfile, false);
      const extracted = extractFields(result.mapping, ['A', 'B', 'C'], ['eerste', 'tweede', 'derde']);
      assert.equal(extracted.fields[field], ['eerste', 'tweede', 'derde'][column]);
      assert.equal(Object.keys(extracted.extras).length, 2, 'vervangen kolommen blijven behouden');
    }
  }
});

test('codescan 26: telefoon, e-mail en extra kolommen blijven meervoudig mogelijk', () => {
  for (const field of ['telefoon', 'email', 'negeren']) {
    const result = changeMapping(['A', 'B', 'C'], [field, 'sector', field], 1, field);
    assert.deepEqual(result.mapping, [field, field, field]);
    assert.deepEqual(result.mappingNotes, []);
  }
});

test('codescan 23: contactmetadata en een los Type blijven extra kolommen', () => {
  for (const kop of ['Contactdatum', 'Contactstatus', 'Contacttype', 'Contactmoment', 'Type']) {
    const header = ['Naam', kop];
    const row = ['Fabelwinkel', 'BEWAAR-MIJ'];
    const { mapping } = suggestMapping({ header, rows: [row] });
    assert.deepEqual(mapping, ['bedrijfsnaam', 'negeren'], kop);
    const { extras } = extractFields(mapping, header, row);
    assert.equal(extras[`Extra: ${kop}`], 'BEWAAR-MIJ');
  }
});

for (const formaat of ['dd/mm/jjjj', 'dd-mm-jjjj', 'dd.mm.jjjj', 'jjjj-mm-dd']) {
  for (const tijd of ['', ' 14:35', ' 14:35:42']) {
    test(`codescan 23: datumkolommen ${formaat}${tijd} worden geen telefoon`, () => {
      for (const kop of ['Contactdatum', 'Kolom X', 'Aangemaakt op']) {
        const header = ['Naam', kop];
        const data = rows(10, (i) => [`Fabelbedrijf ${i}`,
          formaat.replace('dd', String(18 + i)).replace('mm', '10').replace('jjjj', '2026') + tijd]);
        const { mapping } = suggestMapping({ header, rows: data });
        assert.deepEqual(mapping, ['bedrijfsnaam', 'negeren'], kop);
        assert.equal(extractFields(mapping, header, data[0]).extras[`Extra: ${kop}`], data[0][1]);
      }
    });
  }
}

test('codescan 23: datumkoppen hebben voorrang op contactwoorden en inhoudsherkenning', () => {
  for (const kop of ['Contactdatum', 'datum laatste contact', 'created date', 'Contact date', 'CONTACT_DATUM']) {
    for (const data of [[], rows(10, (i) => [`Fabelbedrijf ${i}`, `02 000 10 ${10 + i}`])]) {
      assert.deepEqual(suggestMapping({ header: ['Naam', kop], rows: data }).mapping,
        ['bedrijfsnaam', 'negeren'], kop);
    }
  }
});

test('codescan 23: een meerderheid datums onder gevulde waarden blokkeert inhoudsherkenning', () => {
  const data = rows(10, (i) => [i < 6 ? `${18 + i}/10/2026` : `02 000 10 ${10 + i}`]);
  data.push([''], ['-'], ['']);
  assert.deepEqual(suggestMapping({ header: ['Kolom X'], rows: data }).mapping, ['negeren']);
});

test('codescan 23: een minderheid datums telt niet mee als telefoonbewijs', () => {
  const data = rows(10, (i) => [i < 4 ? `${18 + i}/10/2026` : i < 9 ? `02 000 10 ${10 + i}` : 'onbekende tekst']);
  assert.deepEqual(suggestMapping({ header: ['Kolom X'], rows: data }).mapping, ['negeren']);
});

test('codescan 23: echte telefoonnummers blijven herkenbaar naast datumwaarden', () => {
  const data = rows(10, (i) => [i < 4 ? `${18 + i}/10/2026` : `02 000 10 ${10 + i}`, `0479 80 51 ${10 + i}`]);
  assert.deepEqual(suggestMapping({ header: ['Kolom X', 'Kolom Y'], rows: data }).mapping, ['telefoon', 'telefoon']);
});

test('codescan 23: onmogelijke dag of maand onderdrukt geen telefoonachtige waarden', () => {
  for (const scheiding of ['.', '-', '/']) {
    for (const begin of [`16${scheiding}98`, `32${scheiding}12`, `00${scheiding}12`, `16${scheiding}00`]) {
      const data = rows(10, (i) => [`${begin}${scheiding}${1234 + i}`]);
      assert.deepEqual(suggestMapping({ header: ['Kolom Y'], rows: data }).mapping, ['telefoon'], begin);
    }
  }
  for (const einde of ['13-18', '12-32', '00-18', '12-00']) {
    const data = rows(10, (i) => [`${2020 + i}-${einde}`]);
    assert.deepEqual(suggestMapping({ header: ['Kolom X'], rows: data }).mapping, ['telefoon'], einde);
  }
});
test('codescan 23: dag- en maandgrenzen blijven datums, ook met tijd', () => {
  for (const waarde of ['1/1/2026', '01/01/2026', '31-12-2026', '31.12.2026', '2026-1-1', '2026-12-31']) {
    for (const tijd of ['', ' 00:00', ' 23:59:59']) {
      assert.deepEqual(suggestMapping({ header: ['Kolom X'], rows: rows(3, () => [waarde + tijd]) }).mapping,
        ['negeren'], waarde + tijd);
    }
  }
});

test('codescan 23: een los Type wordt niet als sector voorgesteld', () => {
  assert.deepEqual(suggestMapping({ header: ['Naam', 'Type'], rows: [] }).mapping,
    ['bedrijfsnaam', 'negeren']);
});

test('codescan 23: duidelijke contactkoppen en bedrijfstypes blijven herkenbaar', () => {
  for (const kop of ['Contact', 'Contactpersoon', 'Contactnaam', 'Contactperson', 'Contact person',
    'Primair contact', 'Contactpersoon primair', 'Contactnaam primair', 'Contactperson primair']) {
    assert.deepEqual(suggestMapping({ header: ['Naam', kop], rows: [] }).mapping,
      ['bedrijfsnaam', 'contactpersoon'], kop);
  }
  for (const kop of ['Type bedrijf', 'Bedrijfstype', 'Business type', 'TYPE-BEDRIJF', 'Sector', 'Activiteiten']) {
    assert.deepEqual(suggestMapping({ header: ['Naam', kop], rows: [] }).mapping,
      ['bedrijfsnaam', 'sector'], kop);
  }
  assert.deepEqual(suggestMapping({ header: ['Naam', 'Contact e-mail', 'Contact telefoon'], rows: [] }).mapping,
    ['bedrijfsnaam', 'email', 'telefoon']);
});

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
test('codescan 7: Nr wordt alleen naast een straatkolom als huisnummer voorgesteld', () => {
  for (const kop of ['Nr', 'NR.']) {
    assert.deepEqual(suggestMapping({ header: ['Naam', kop], rows: [['Fabelwinkel', '1']] }).mapping,
      ['bedrijfsnaam', 'negeren']);
    assert.deepEqual(suggestMapping({ header: ['Naam', 'Straat', kop], rows: [] }).mapping,
      ['bedrijfsnaam', 'straat', 'huisnummer']);
    assert.deepEqual(suggestMapping({ header: [kop, 'Naam', 'Straat'], rows: [] }).mapping,
      ['huisnummer', 'bedrijfsnaam', 'straat']);
    assert.deepEqual(suggestMapping({ header: ['Naam', 'Straat Huisnummer', kop], rows: [] }).mapping,
      ['bedrijfsnaam', 'adres', 'negeren']);
  }
  assert.deepEqual(suggestMapping({ header: ['Naam', 'Huisnummer'], rows: [] }).mapping,
    ['bedrijfsnaam', 'huisnummer'], 'een expliciete huisnummerkop blijft herkenbaar');
});
test('codescan 7: Nr zonder straat krijgt ook bij telefoonachtige inhoud geen telefoonkoppeling', () => {
  const r = suggestMapping({ header: ['Naam', 'Nr'],
    rows: rows(3, (i) => [`Fabelwinkel ${i}`, `02000100${i}`]) });
  assert.deepEqual(r.mapping, ['bedrijfsnaam', 'negeren']);
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

for (const metadata of [
  ['nr', 'bronnen', 'mogelijk dubbel met'],
  ['NR', 'BRONNEN', 'MOGELIJK DUBBEL MET'],
  [' Nr. ', ' Brónnen ', 'Mogelijk_dubbel-met'],
]) {
  test(`codescan 17: eigen exportmetadata blijft metadata bij kopvarianten ${metadata.join(', ')}`, () => {
    const header = ['Lead Source', 'Project', 'Leadowner', 'Company', 'Straat Huisnummer', ...metadata, 'Notitie'];
    const row = ['', '', '', 'Fabelwinkel', 'Teststraat 42', '1', 'bron.csv', '2', 'BEWAAR-MIJ'];
    const { mapping } = suggestMapping({ header, rows: [row] });
    assert.deepEqual(mapping.slice(5, 8), ['negeren', 'negeren', 'negeren']);
    const { fields, extras, rawCells } = extractFields(mapping, header, row);
    assert.deepEqual({ ...extras }, { 'Extra: Notitie': 'BEWAAR-MIJ' });
    assert.equal(fields.adres, 'Teststraat 42');
    for (let c = 5; c < 8; c++) assert.deepEqual(rawCells[c], { kolom: c + 1, kop: header[c], waarde: row[c] });
  });
}

test('codescan 17: metadatakoppen in een gewone bron blijven extra gegevens', () => {
  const header = ['Naam', 'nr', 'BRONNEN', 'Mogelijk_dubbel-met'];
  const row = ['Fabelwinkel', '17', 'Eigen bron', 'Eigen verwijzing'];
  const { mapping } = suggestMapping({ header, rows: [row] });
  const { extras } = extractFields(mapping, header, row);
  assert.deepEqual({ ...extras }, { 'Extra: nr': '17', 'Extra: BRONNEN': 'Eigen bron', 'Extra: Mogelijk_dubbel-met': 'Eigen verwijzing' });
});
