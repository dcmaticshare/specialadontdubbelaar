// Afgeleide schermgegevens blijven uitsluitend in het geheugen, buiten de sessieopslag.
import { SETTINGS } from '../settings.js';
import { createComparisonPolicyCache, suggestMapping } from '../io/mapping.js';

export function createMappingViewCache(settings = SETTINGS) {
  const sheets = new WeakMap();
  const policyFor = createComparisonPolicyCache(settings);
  return (sheet, mapping) => {
    let cached = sheets.get(sheet);
    if (!cached || cached.rows !== sheet.rows || cached.header !== sheet.header) {
      const examples = sheet.header.map((_, c) => {
        const values = [];
        for (const row of sheet.rows) {
          const value = String(row[c] || '').trim();
          if (value && !values.includes(value)) values.push(value);
          if (values.length >= settings.kolomkoppeling.maxVoorbeelden) break;
        }
        return values.join(' · ');
      });
      const standard = suggestMapping({ header: sheet.header, rows: sheet.rows, useProfiles: false }, settings);
      cached = { rows: sheet.rows, header: sheet.header, examples, standard };
      sheets.set(sheet, cached);
    }
    return { examples: cached.examples, standard: cached.standard, policy: policyFor({ header: sheet.header, rows: sheet.rows, mapping }) };
  };
}
