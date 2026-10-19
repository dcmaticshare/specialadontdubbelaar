// Vaste publieke kwaliteitsset; leest nooit de private testdata/.
import { readFileSync } from 'node:fs';
import { processDir } from './lib.mjs';
import { evaluateQuality } from './quality.mjs';
const dir = 'test/fixtures/kwaliteit';
const { prep } = await processDir(dir);
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
const judgments = JSON.parse(readFileSync(`${dir}/beoordelingen.json`, 'utf8'));
const { pairs, ...report } = evaluateQuality({ prep, manifest, judgments });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
