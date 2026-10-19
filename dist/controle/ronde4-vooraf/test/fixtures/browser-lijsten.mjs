// Kleine, volledig synthetische lijsten voor de gerichte controle van de gebouwde HTML.
const csv = (rows) => rows.map((row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(';')).join('\r\n');
const upload = (name, rows) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(csv(rows)) });
export function behoud() {
  return upload('synthetisch.csv', [
    ['Naam', 'Telefoon', 'E-mail', 'Adres', 'Opmerkingen', 'Contactpersoon'],
    ['Fabelwinkel', '020001001; 030001002; 040001003; 050001004', 'a@fabel.invalid; b@fabel.invalid; c@fabel.invalid', 'Teststraat 42 bus 3', '=BEWAAR-MIJ', 'Mira Testmans'],
    ['Fabelwinkel BV', '020001001; 060001005', 'd@fabel.invalid', 'Andere straat 17', 'TWEEDE-WAARDE', 'Norian Fabelman'],
    ['<img src=x onerror=alert(1)>', '', '', 'Verzinselweg 9', 'TEKST-BLIJFT-TEKST', ''],
  ]);
}
export function nieuw() {
  return upload('nieuwe-lijst.csv', [['Naam', 'Telefoon', 'Adres'], ['Fabelwinkel', '050001004', 'Teststraat 42 bus 3']]);
}
export function groepen() {
  return upload('groepen.csv', [['Naam', 'Telefoon', 'Adres'],
    ['Fabelwinkel', '020001001', 'Teststraat 42'], ['Fabelwinkel', '020001001', 'Teststraat 42'],
    ['Fabelwinkel', '030001002', 'Verzinselweg 9'], ['Fabelwinkel', '030001002', 'Verzinselweg 9'],
  ]);
}
export function btwConflict() {
  return upload('btw-keten.csv', [['Naam', 'Telefoon', 'BTW'],
    ['Fabelwinkel', '020001001', '0123456749'], ['Fabelwinkel', '020001001; 030001002', ''], ['Fabelwinkel', '030001002', '0123456848'],
  ]);
}

export function groteGroep() {
  return upload('groot.csv', [['Naam', 'Telefoon', 'BTW'], ...Array.from({ length: 401 }, () => ['Fabelwinkel', '020001001', '0123456749'])]);
}
