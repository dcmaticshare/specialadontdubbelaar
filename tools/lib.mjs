// Gedeelde laadlogica voor de hulpscripts: alle lijsten in een map inlezen, koppelen en verwerken (zonder scherm).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFile } from '../src/io/read.js';
import { suggestMapping } from '../src/io/mapping.js';
import { prepare, assemble, sourceLabel } from '../src/engine/pipeline.js';

const require = createRequire(import.meta.url);
globalThis.XLSX = require('../vendor/xlsx.full.min.js');

export async function loadDir(dir, { log = () => {}, exclude = /^(Testset_|Leads_ontdubbeld_|~\$)/, ignoreFiles = [] } = {}) {
  const files = readdirSync(dir).filter((f) => /\.(xlsx|xls|csv)$/i.test(f) && !exclude.test(f) && !ignoreFiles.includes(f)).sort();
  const sources = [];
  for (const f of files) {
    const read = await readFile({ name: f, arrayBuffer: async () => readFileSync(path.join(dir, f)) });
    const sheet = read.sheets[read.defaultSheet];
    const sug = suggestMapping({ header: sheet.header, rows: sheet.rows });
    log(`${f}: ${sheet.rows.length} rijen`);
    sources.push({ name: f, label: sourceLabel(f), header: sheet.header, rows: sheet.rows, rowNumbers: sheet.rowNumbers, originals: sheet.originals, columnOffset: sheet.columnOffset, sheetName: sheet.name, mapping: sug.mapping, nearConstant: sug.nearConstant, read, sug, sheet });
  }
  return { sources };
}

export async function processDir(dir, opts = {}) {
  const { sources } = await loadDir(dir, opts);
  const prep = await prepare({ sources, onProgress: () => {} });
  const res = assemble(prep);
  return { sources, prep, res };
}
