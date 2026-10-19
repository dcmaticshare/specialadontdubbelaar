// Buiten de gemeten verwerking en buiten het proces waarvan maxRSS wordt gerapporteerd.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { scenario } from './performance-data.mjs';
import { checkWorkbook } from './performance-quality.mjs';
const [dest] = process.argv.slice(2);
const report = JSON.parse(readFileSync(dest + '.json', 'utf8'));
report.kwaliteitscontrole = checkWorkbook(scenario(report), dest + '.xlsx');
report.exportSha256 = createHash('sha256').update(readFileSync(dest + '.xlsx')).digest('hex');
writeFileSync(dest + '.json', JSON.stringify(report, null, 2));
console.log('Werkmap gecontroleerd: groepen, alle broncellen, tekstcellen en extra waarden.');
