// De vereiste private kwaliteitsset mag nooit worden overgeslagen.
import { qualityMain } from '../quality-cli.mjs';
const args = process.argv.length > 2 ? process.argv.slice(2) : ['--meet', 'testdata/Testset_beoordeeld.xlsx', 'testdata'];
try { process.exitCode = await qualityMain(args); }
catch (error) { console.error(`Kwaliteitscontrole mislukt: ${error.message}`); process.exitCode = 1; }
