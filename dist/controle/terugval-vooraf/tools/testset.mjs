// Maak of controleer een vaste kwaliteitsset; alle validatie is gedeeld met de private controle.
import { qualityMain } from './quality-cli.mjs';
try { process.exitCode = await qualityMain(process.argv.slice(2)); }
catch (error) { console.error(`Kwaliteitscontrole mislukt: ${error.message}`); process.exitCode = 1; }
