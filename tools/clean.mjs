// Handmatig vangnet voor oude proefruns en afgebroken tijdelijke werkmappen.
import { cleanHarnessFiles } from './cleanup.mjs';
try {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === '--dry-run')) throw new Error('Gebruik: node tools/clean.mjs [--dry-run]');
  const result = cleanHarnessFiles({ dryRun: args.includes('--dry-run') });
  console.log(JSON.stringify(result));
} catch (error) { console.error(`Opruimen mislukt: ${error.message}`); process.exitCode = 1; }
