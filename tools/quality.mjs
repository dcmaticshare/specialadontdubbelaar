// Gedeeld kwaliteitscontract voor tests en CLI. IDs bestaan uitsluitend in het beoordelingsmateriaal.
import { createHash } from 'node:crypto';
import { SETTINGS } from '../src/settings.js';
import { assemble } from '../src/engine/pipeline.js';
import { scorePair, decidePair } from '../src/engine/match.js';
import { pairKey } from '../src/engine/cluster.js';
import { readFile } from '../src/io/read.js';
import { textSheet } from '../src/io/write.js';

const config = SETTINGS.kwaliteit;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const locationId = (file, sheet, row) => 'R-' + digest([file, sheet, row]);
const assessmentId = (a, b) => 'P-' + digest([a, b].sort());
const seal = (manifest) => { const { id, ...body } = manifest; return digest(body); };

// Ruwe invoer en koppeling bewaken; vergelijkingssleutels mogen veranderen bij een verbetering van de engine.
function snapshot(prep) {
  const records = [], sources = [];
  for (const s of prep.sources) {
    const sheet = s.sheetName || '';
    sources.push({ file: s.name, sheet, header: s.header, mapping: s.mapping, rows: s.rows.length });
    s.rows.forEach((values, i) => {
      const row = s.rowNumbers ? s.rowNumbers[i] : i + 2;
      records.push({ id: locationId(s.name, sheet, row), file: s.name, sheet, row, hash: digest([s.header, values]) });
    });
  }
  sources.sort((a, b) => JSON.stringify([a.file, a.sheet]).localeCompare(JSON.stringify([b.file, b.sheet]), 'en'));
  records.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return { sources, records };
}
export function recordIds(prep) {
  return prep.records.map((r) => locationId(r.sourceName, prep.sources[r.source].sheetName || '', r.row));
}

// Directe en impliciete kandidaten blijven onderscheiden. Een compacte groep vertegenwoordigt
// alle onderlinge paren, ook als slechts een ster in het geheugen als scores is opgeslagen.
export function candidateLookup(prep) {
  const direct = new Set(prep.candidates.map(([i, j]) => pairKey(i, j)));
  const membership = prep.records.map(() => new Set());
  for (const [g, group] of (prep.compactGroups || []).entries()) for (const i of group.members) membership[i].add(g);
  return (i, j) => {
    if (direct.has(pairKey(i, j))) return 'direct';
    for (const g of membership[i]) if (membership[j].has(g)) return 'compact';
    return null;
  };
}

// Beoordelingsselectie met ook paren buiten de kandidaatselectie. Deze selectie kent geen waarheidlabels.
export function selectAssessmentPairs(prep) {
  const cfg = config.steekproef;
  let seed = cfg.seed;
  const rnd = (n) => { seed = (seed * 48271) % 2147483647; return seed % n; };
  const pick = (arr, count) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) { const j = rnd(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy.slice(0, count);
  };
  const chosen = new Map();
  const add = (i, j) => { if (i !== j) chosen.set(pairKey(i, j), [Math.min(i, j), Math.max(i, j)]); };
  for (const p of prep.scored.filter((p) => p.decision === 'controleren')) add(p.i, p.j);
  for (const p of pick(prep.scored.filter((p) => p.decision === 'zeker'), cfg.zeker)) add(p.i, p.j);
  for (const p of pick(prep.scored.filter((p) => p.decision === 'uniek'), cfg.bijna)) add(p.i, p.j);
  const candidate = candidateLookup(prep);
  let outside = 0;
  for (let attempt = 0; attempt < cfg.buitenKandidaten * cfg.maxPogingenPerPaar && outside < cfg.buitenKandidaten && prep.records.length > 1; attempt++) {
    const i = rnd(prep.records.length), j = rnd(prep.records.length);
    if (i !== j && !candidate(i, j) && !chosen.has(pairKey(i, j))) { add(i, j); outside++; }
  }
  return [...chosen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function createManifest(prep, { pairs = selectAssessmentPairs(prep), limits = config.grenzen } = {}) {
  const data = snapshot(prep), ids = recordIds(prep);
  if (new Set(ids).size !== ids.length || ids.length !== data.records.length) throw new Error('Bronrijen zijn niet uniek of niet volledig ingelezen.');
  if (!pairs.length) throw new Error('Geen beoordelingsparen geselecteerd: minimaal één paar is vereist.');
  for (const [i, j] of pairs) if (!Number.isInteger(i) || !Number.isInteger(j) || !ids[i] || !ids[j] || i === j) throw new Error('Ongeldig bronpaar voor het manifest.');
  const manifest = {
    format: config.formaat, dataset: digest(data), ...data,
    pairs: pairs.map(([i, j]) => ({ id: assessmentId(ids[i], ids[j]), a: ids[i], b: ids[j] })),
    limits: { ...limits },
  };
  if (new Set(manifest.pairs.map((p) => p.id)).size !== pairs.length) throw new Error('Een beoordelingspaar komt dubbel voor.');
  manifest.id = seal(manifest);
  return manifest;
}

export function parseLabel(value) {
  const label = String(value ?? '').trim().toLowerCase();
  if (!config.labels.includes(label)) throw new Error(label ? `Ongeldig oordeel: gebruik uitsluitend ${config.labels.join(' of ')}.` : 'Een verplicht oordeel is leeg.');
  return label;
}

export function parseJudgments(table) {
  if (!table || !Array.isArray(table.header) || !Array.isArray(table.rows)) throw new Error('Tabblad Paren ontbreekt.');
  const columns = config.kolommen.map((h) => {
    if (table.header.filter((v) => v === h).length !== 1) throw new Error(`Kolom "${h}" ontbreekt of komt dubbel voor. Maak een testset met het nieuwe manifestformaat.`);
    return table.header.indexOf(h);
  });
  return table.rows.map((row) => {
    const [dataset, pair, a, b, label] = columns.map((i) => String(row[i] ?? '').trim());
    return { dataset, pair, a, b, label };
  });
}

export async function readAssessment(bytes, name = 'Testset_beoordeeld.xlsx') {
  const file = await readFile({ name, arrayBuffer: async () => bytes });
  return parseJudgments(file.sheets.find((s) => s.name === 'Paren'));
}

export function buildAssessmentWorkbook(prep, manifest) {
  const X = globalThis.XLSX;
  const wb = X.utils.book_new();
  const ids = recordIds(prep), byId = new Map(ids.map((id, i) => [id, i]));
  const side = (id) => { const r = prep.records[byId.get(id)]; return [r.sourceName, String(r.row), r.fields.bedrijfsnaam, r.fields.telefoon.join('; '), r.fields.email.join('; '), r.fields.btw, r.fields.adres || `${r.fields.straat} ${r.fields.huisnummer}`.trim()]; };
  const headings = ['Bron', 'Rij', 'Bedrijf', 'Telefoon', 'E-mail', 'BTW', 'Adres'];
  const rows = manifest.pairs.map((p) => [manifest.id, p.id, p.a, p.b, '', ...side(p.a), ...side(p.b)]);
  X.utils.book_append_sheet(wb, textSheet([...config.kolommen, ...headings.map((h) => h + ' A'), ...headings.map((h) => h + ' B')], rows), 'Paren');
  X.utils.book_append_sheet(wb, textSheet(['Record', ...headings], ids.map((id) => [id, ...side(id)])), 'Records');
  X.utils.book_append_sheet(wb, textSheet(['Uitleg'], [
    ['Vul ELK oordeel in met zelfde of verschillend. De tool vult geen waarheidlabels in.'],
    ['Bewaar het bijbehorende JSON-manifest ongewijzigd. Ook ontbrekende of gewijzigde bronrijen maken de controle ongeldig.'],
    ['Record-IDs horen alleen bij deze testdataset; het product krijgt geen blijvende Lead-IDs.'],
    ['Ook paren buiten de kandidaatselectie moeten beoordeeld worden. Alleen deze beoordeelde selectie wordt gemeten.'],
    [`Manifest: ${manifest.id}`],
  ]), 'Uitleg');
  return wb;
}

function manifestErrors(manifest) {
  const errors = [];
  if (!manifest || ![1, config.formaat].includes(manifest.format) || !Array.isArray(manifest.records) || !Array.isArray(manifest.sources) || !Array.isArray(manifest.pairs)) return ['Ongeldig of ontbrekend datasetmanifest.'];
  if (!manifest.records.length || !manifest.pairs.length) errors.push('Het manifest moet bronrijen en minimaal één verplicht beoordelingspaar bevatten.');
  if (manifest.id !== seal(manifest)) errors.push('Het manifest is gewijzigd of de controlesom is ongeldig.');
  if (manifest.dataset !== digest({ sources: manifest.sources, records: manifest.records })) errors.push('De datasetcontrole van het manifest is ongeldig.');
  const ids = new Set();
  for (const r of manifest.records) {
    if (!r || typeof r.id !== 'string' || typeof r.hash !== 'string' || ids.has(r.id) || r.id !== locationId(r.file, r.sheet, r.row)) errors.push('Ongeldige of dubbele record-ID in het manifest.');
    ids.add(r?.id);
  }
  const pairIds = new Set();
  for (const p of manifest.pairs) {
    if (!p || !ids.has(p.a) || !ids.has(p.b) || p.a === p.b || p.id !== assessmentId(p.a, p.b) || pairIds.has(p.id)) errors.push('Ongeldig of dubbel paar in het manifest.');
    pairIds.add(p?.id);
  }
  if (!manifest.limits || Object.keys(manifest.limits).length !== Object.keys(config.grenzen).length ||
      Object.keys(config.grenzen).some((k) => !Number.isSafeInteger(manifest.limits[k]) || manifest.limits[k] < 0)) errors.push('Het manifest bevat ongeldige kwaliteitsgrenzen.');
  return errors;
}

// Formaat 1 bewaart nearConstant in zijn verzegelde inhoud. Controleer hierboven altijd
// die oorspronkelijke controlesommen; vergelijk alleen de broninvoer zonder dit afgeleide
// veld. Manifest-ID, paren en bestaande labelkoppelingen worden nooit herschreven.
function inputDataset(manifest) {
  if (manifest.format !== 1) return manifest.dataset;
  const sources = manifest.sources.map(({ nearConstant, ...source }) => source);
  return digest({ sources, records: manifest.records });
}

// Schema- en datasetfouten zijn afzonderlijk van matchfouten. Geen enkele fout mag als succes eindigen.
export function evaluateQuality({ prep, manifest, judgments, result }) {
  const report = {
    ok: false, errors: manifestErrors(manifest), violations: [],
    counts: { recordsVerwacht: manifest?.records?.length || 0, recordsGevonden: 0, verwacht: manifest?.pairs?.length || 0, gevonden: 0, gecontroleerd: 0 },
    metrics: { fouteSamenvoegingen: 0, foutePaarscores: 0, gemistePaarscores: 0, gemisteDubbels: 0, gemisteKandidaten: 0, zonderDirectKandidaat: 0, nietSamengevoegd: 0, controleZelfde: 0, controleVerschillend: 0 },
    pairs: [],
  };
  if (report.errors.length) return report;
  const data = snapshot(prep), current = new Map(data.records.map((r) => [r.id, r]));
  const ids = recordIds(prep), byId = new Map(ids.map((id, i) => [id, i]));
  if (ids.length !== byId.size) report.errors.push('Een bronrij is meerdere keren ingelezen.');
  for (const record of manifest.records) {
    if (!byId.has(record.id) || !current.has(record.id)) report.errors.push(`Bronrij ${record.id} ontbreekt.`);
    else {
      report.counts.recordsGevonden++;
      if (current.get(record.id).hash !== record.hash) report.errors.push(`Bronrij ${record.id} is gewijzigd.`);
    }
  }
  if (data.records.length !== manifest.records.length || ids.length !== manifest.records.length || digest(data) !== inputDataset(manifest)) report.errors.push('De bronbestanden, rijen of kolomkoppelingen wijken af van het vaste datasetmanifest.');
  if (!Array.isArray(judgments)) { report.errors.push('Beoordelingen ontbreken.'); return report; }
  const required = new Map(manifest.pairs.map((p) => [p.id, p])), seen = new Set(), valid = [];
  for (const j of judgments) {
    const p = required.get(j.pair);
    if (!p) { report.errors.push('Een onbekend beoordelingspaar staat in het bestand.'); continue; }
    if (seen.has(j.pair)) { report.errors.push(`Paar ${j.pair} is dubbel beoordeeld.`); continue; }
    seen.add(j.pair); report.counts.gevonden++;
    if (j.dataset !== manifest.id) { report.errors.push('Een beoordeling hoort bij een ander datasetmanifest.'); continue; }
    if (!byId.has(j.a) || !byId.has(j.b) || j.a === j.b || assessmentId(j.a, j.b) !== p.id) { report.errors.push('Een beoordeling verwijst naar een onbekende of verkeerde record-ID.'); continue; }
    try { valid.push({ ...j, label: parseLabel(j.label), i: byId.get(j.a), j: byId.get(j.b) }); }
    catch (error) { report.errors.push(error.message); }
  }
  for (const id of required.keys()) if (!seen.has(id)) report.errors.push(`Verplicht paar ${id} ontbreekt.`);
  report.counts.gecontroleerd = valid.length;
  if (!valid.length) report.errors.push('Geen geldige beoordelingen gecontroleerd.');
  // Onafhankelijke controle van de grondwaarheid: zelfde is transitief; verschillend mag die keten niet kruisen.
  const neighbors = new Map();
  for (const p of valid) if (p.label === 'zelfde') {
    if (!neighbors.has(p.a)) neighbors.set(p.a, new Set());
    if (!neighbors.has(p.b)) neighbors.set(p.b, new Set());
    neighbors.get(p.a).add(p.b); neighbors.get(p.b).add(p.a);
  }
  const component = new Map();
  for (const id of neighbors.keys()) if (!component.has(id)) {
    const todo = [id]; component.set(id, id);
    while (todo.length) for (const next of neighbors.get(todo.pop()) || []) if (!component.has(next)) { component.set(next, id); todo.push(next); }
  }
  for (const p of valid) if (p.label === 'verschillend' && component.has(p.a) && component.get(p.a) === component.get(p.b)) report.errors.push('De beoordelingen zijn tegenstrijdig: verschillend binnen een keten van zelfde.');
  if (report.errors.length) return report;
  if (!Array.isArray(prep.candidates)) { report.errors.push('Kandidaatgegevens ontbreken in de verwerking.'); return report; }
  const res = result || assemble(prep), candidate = candidateLookup(prep);
  Object.assign(report.counts, { zelfde: valid.filter((p) => p.label === 'zelfde').length, verschillend: valid.filter((p) => p.label === 'verschillend').length,
    kandidaatverbindingen: prep.candidates.length, compacteGroepen: (prep.compactGroups || []).length, gescoordeParen: prep.scored.length, controlelijst: res.review.length });
  const scored = new Map(prep.scored.map((p) => [pairKey(p.i, p.j), p]));
  const reviews = new Set(res.review.map((p) => pairKey(res.uf.find(p.i), res.uf.find(p.j))));
  for (const p of valid) {
    const kind = candidate(p.i, p.j), same = res.uf.find(p.i) === res.uf.find(p.j);
    const review = !same && reviews.has(pairKey(res.uf.find(p.i), res.uf.find(p.j)));
    // Ook een bestaand paar zonder kandidaat krijgt een diagnostische paarscore. Die score
    // verandert de werkelijke kandidaatselectie of groepering niet en kan een gemis niet maskeren.
    const evidence = scored.get(pairKey(p.i, p.j)) || scorePair(prep.records[p.i], prep.records[p.j], prep.index, prep.settings);
    const decision = decidePair(evidence, res.strengheid.grenzen);
    const sameLabel = p.label === 'zelfde';
    if (sameLabel && !kind) report.metrics.zonderDirectKandidaat++;
    if (sameLabel && !kind && !same && !review) report.metrics.gemisteKandidaten++;
    if (sameLabel && !same) report.metrics.nietSamengevoegd++;
    if (sameLabel && !same && !review) report.metrics.gemisteDubbels++;
    if (!sameLabel && same) report.metrics.fouteSamenvoegingen++;
    if (!sameLabel && kind && decision === 'zeker') report.metrics.foutePaarscores++;
    if (sameLabel && kind && decision === 'uniek') report.metrics.gemistePaarscores++;
    if (review) report.metrics[sameLabel ? 'controleZelfde' : 'controleVerschillend']++;
    report.pairs.push({ pair: p.pair, a: p.a, b: p.b, label: p.label, candidate: !!kind, candidateKind: kind, score: evidence.score, decision, sameGroup: same, review });
  }
  for (const [metric, limit] of Object.entries(manifest.limits)) if (report.metrics[metric] > limit) report.violations.push(`${metric}: ${report.metrics[metric]} > ${limit}`);
  report.ok = report.errors.length === 0 && report.violations.length === 0;
  return report;
}

// Kleine bestaande privécases zijn rooktests, geen vervanging voor onafhankelijke beoordelingen.
// Controleer behalve de hoogste paarscore ook de daadwerkelijke groepen en controlelijst.
export function checkKnownCase(prep, res, left, right, expected) {
  const pairs = [];
  for (const i of left) for (const j of right) if (i !== j) pairs.push([i, j]);
  if (!pairs.length || !['zeker', 'controleren', 'uniek'].includes(expected)) return { ok: false, pair: null };
  const keys = new Set(pairs.map(([i, j]) => pairKey(i, j)));
  const pair = prep.scored.filter((p) => keys.has(pairKey(p.i, p.j))).sort((a, b) => b.score - a.score)[0] || null;
  const same = ([i, j]) => res.uf.find(i) === res.uf.find(j);
  const review = new Set(res.review.map((p) => pairKey(res.uf.find(p.i), res.uf.find(p.j))));
  const scoreOK = pair ? pair.decision === expected : expected === 'uniek';
  const groupsOK = expected === 'zeker' ? pairs.every(same) : expected === 'uniek' ? pairs.every((p) => !same(p))
    : pairs.some(([i, j]) => !same([i, j]) && review.has(pairKey(res.uf.find(i), res.uf.find(j))));
  return { ok: scoreOK && groupsOK, pair };
}
