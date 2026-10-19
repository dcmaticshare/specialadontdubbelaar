// Eén verkennende meting. De volledige budgetpoort staat in tools/check-perf.mjs.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS } from './src/settings.js';
import { scenario } from './tools/performance-data.mjs';
import { runPerformanceSample } from './tools/performance-run.mjs';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
try {
  const aantal = process.argv[2] === undefined ? Math.max(...SETTINGS.prestaties.rijen) : Number(process.argv[2]);
  const soort = process.argv[3] || 'gedeeld';
  scenario({ aantal, soort }); // Ongeldige argumenten weigeren vóór er uitvoer wordt gemaakt.
  const out = path.resolve(`dist/prestaties/verkennend-${Date.now()}`);
  mkdirSync(out, { recursive: true });
  const dest = path.join(out, 'meting');
  await runPerformanceSample({ modus: 'node', soort, aantal, dest });
  console.log(`Verkennend resultaat: ${dest}.json. Dit is geen volledige prestatiepoort.`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
