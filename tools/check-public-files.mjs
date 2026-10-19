// Geen bestandsnamen of inhoud van een eventueel aangetroffen privébestand afdrukken.
import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (files.some((file) => /^(dist|testdata)\//i.test(file) || /(^|\/)(Testset_(?:paren|beoordeeld)\.xlsx|Testset_manifest\.json|Beoordelingsverklaring\.json|windows-bewijs\.json)$/i.test(file))) {
  console.error('Private gegevens of bewijzen staan in de Git-index. Verwijder ze uit versiebeheer vóór CI.');
  process.exitCode = 1;
} else console.log('Git-index bevat geen private gegevensmappen of beoordelingsbestanden.');
