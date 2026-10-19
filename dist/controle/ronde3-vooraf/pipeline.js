// De verwerking van begin tot einde, zonder schermcode: lijsten -> records -> paren -> groepen -> resultaat.
import { SETTINGS } from '../settings.js';
import { makeRecord } from './records.js';
import { extractFields } from '../io/mapping.js';
import { buildIndex, candidatePairs, scorePair, decidePair, grenzenVoor, strengheidNiveau, laagsteGrens } from './match.js';
import { buildGroups, reviewPairs, mergeGroup, pairKey } from './cluster.js';
import { todayIso } from './text.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

// Korte bronnaam zonder extensie en zonder "geupload"/"(1)".
export function sourceLabel(name) {
  return String(name).replace(/\.[^.]+$/, '').replace(/\(\d+\)/g, '').replace(/\bge[uü]pload\b/gi, '').replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ').trim() || String(name);
}

// sources: [{ name, label, header, rows, rowNumbers, mapping, nearConstant }]
export async function prepare({ sources, settings = SETTINGS, onProgress = () => {}, chunk = 3000 }) {
  const records = [];
  sources.forEach((src, s) => {
    const postcodeCol = src.mapping.indexOf('postcode');
    const postcodeUsable = postcodeCol >= 0 && !(src.nearConstant && src.nearConstant[postcodeCol]);
    src.rows.forEach((row, r) => {
      const { fields, extras, raw, rawCells } = extractFields(src.mapping, src.header, row);
      records.push(makeRecord({
        idx: records.length, source: s, sourceName: src.name, sourceLabel: src.label || sourceLabel(src.name),
        row: src.rowNumbers ? src.rowNumbers[r] : r + 2, raw, extras, postcodeUsable,
        originals: [
          ...(src.originals?.[r] || []),
          { bron: src.name, blad: src.sheetName || '', rij: src.rowNumbers ? src.rowNumbers[r] : r + 2, cellen: rawCells.map((cell) => ({ ...cell, kolom: cell.kolom + (src.columnOffset || 0) })) },
        ],
      }, fields));
    });
  });
  onProgress(0.05, `${records.length} rijen gelijkgetrokken`);
  await tick();
  const index = buildIndex(records, settings);
  const { pairs, skipped, compactGroups } = candidatePairs(records, index, settings);
  onProgress(0.15, `${pairs.length} kandidaatparen gevonden`);
  await tick();
  const scored = [];
  const minScore = laagsteGrens(settings); // alles bewaren wat op het strengste niveau nog een twijfelpaar kan zijn
  for (let k = 0; k < pairs.length; k++) {
    const [i, j] = pairs[k];
    const s = scorePair(records[i], records[j], index, settings);
    if (s.decision !== 'uniek' || s.score >= minScore || s.matched.telefoon.length) scored.push({ i, j, ...s });
    if (k % chunk === chunk - 1) { onProgress(0.15 + 0.8 * (k / pairs.length), `Vergeleken: ${k + 1} van ${pairs.length} paren`); await tick(); }
  }
  onProgress(1, 'Klaar');
  return { records, index, scored, skipped, sources, settings, candidates: pairs, compactGroups };
}

// Beslissing per paar opnieuw bij andere grenzen; alleen paren waarvan de beslissing verandert worden gekopieerd.
function herbeoordeel(scored, grenzen) {
  return scored.map((p) => { const d = decidePair(p, grenzen); return d === p.decision ? p : { ...p, decision: d }; });
}

// Groepen, samengevoegde leads, twijfelparen en samenvatting; snel genoeg om na elke beslissing opnieuw te doen.
// decisions: Map(pairKey -> 'zelfde' | 'verschillend') met de menselijke beslissingen.
// strengheid: sleutel van het niveau uit settings.strengheid (bepaalt vanaf hoeveel punten een paar een twijfelpaar is).
export function assemble(prep, decisions = new Map(), { datum = todayIso(), strengheid } = {}) {
  const { records, settings } = prep;
  const niveau = strengheidNiveau(settings, strengheid);
  const grenzen = grenzenVoor(settings, niveau.key);
  const scored = herbeoordeel(prep.scored, grenzen);
  const compact = { compactGroups: prep.compactGroups || [], score: (i, j) => scorePair(records[i], records[j], prep.index, settings) };
  const { uf, groups, blocked, mergedEdges } = buildGroups(records, scored, decisions, compact);
  const review = reviewPairs(scored, blocked, uf, decisions);
  const merged = groups.map((g) => ({ ...mergeGroup(records, g.members, settings), root: g.root, edges: [], deeltTelefoonMet: [] }));
  const byRoot = new Map(merged.map((m) => [m.root, m]));
  const groupOf = (i) => byRoot.get(uf.find(i));
  for (const e of mergedEdges) groupOf(e.i).edges.push(e);
  for (const p of review) {
    const a = groupOf(p.i), b = groupOf(p.j);
    a.mogelijkDubbel.push({ other: b, score: p.score, reason: p.reason });
    b.mogelijkDubbel.push({ other: a, score: p.score, reason: p.reason });
  }
  for (const p of scored) {
    if (p.decision !== 'uniek' || !p.matched.telefoon.length) continue;
    const a = groupOf(p.i), b = groupOf(p.j);
    if (a === b || a.mogelijkDubbel.some((x) => x.other === b)) continue;
    if (!a.deeltTelefoonMet.includes(b)) a.deeltTelefoonMet.push(b);
    if (!b.deeltTelefoonMet.includes(a)) b.deeltTelefoonMet.push(a);
  }
  // volgnummer per unieke lead, in de volgorde van de lijsten
  [...merged].sort((a, b) => a.memberIdx[0] - b.memberIdx[0]).forEach((m, k) => { m.nr = String(k + 1); });
  for (const m of merged) {
    m.reden = [...new Set(m.edges.map((e) => e.reason))].join('; ');
    m.automatisch = m.edges.some((e) => e.prio === 0);
  }
  const summary = {
    rijen: records.length,
    uniekeLeads: merged.length,
    automatischSamengevoegd: merged.filter((m) => m.members.length > 1 && m.automatisch).length,
    samengevoegdDoorMens: merged.filter((m) => m.members.length > 1 && !m.automatisch).length,
    teControleren: review.length,
    groepen: merged.length,
  };
  // Aantal twijfelparen per strengheidsniveau, zodat de gebruiker ziet wat elke stand hem aan werk geeft.
  const perStrengheid = settings.strengheid.niveaus.map((nv) => {
    if (nv.key === niveau.key) return { key: nv.key, label: nv.label, teControleren: grenzen.teControleren, aantal: review.length };
    const g = grenzenVoor(settings, nv.key);
    const sc = herbeoordeel(prep.scored, g);
    const b = buildGroups(records, sc, decisions, compact);
    return { key: nv.key, label: nv.label, teControleren: g.teControleren, aantal: reviewPairs(sc, b.blocked, b.uf, decisions).length };
  });
  return {
    uf, groups, merged, review, blocked, summary, perBron: perSourceStats(prep, merged, groupOf), groupOf, decisions, datum,
    strengheid: { key: niveau.key, label: niveau.label, uitleg: niveau.uitleg, grenzen }, perStrengheid,
  };
}

// Eén keuze betreft de volledige groepen zoals ze op het scherm stonden. Eerst valideren,
// daarna pas besluiten en logboek teruggeven: een geweigerde keuze verandert niets.
export function decideGroups(prep, res, pair, beslissing) {
  const a = res.groupOf(pair.i).memberIdx, b = res.groupOf(pair.j).memberIdx;
  const refuse = (error) => ({ ok: false, error, decisions: res.decisions, res, log: [] });
  if (!['zelfde', 'verschillend'].includes(beslissing)) return refuse('Onbekende beslissing.');
  if (res.groupOf(pair.i) === res.groupOf(pair.j)) return refuse('Deze rijen zitten al in dezelfde groep.');
  if (beslissing === 'zelfde') {
    const nummers = new Set([...a, ...b].map((i) => prep.records[i]).filter((r) => r.norm.btwValid).map((r) => r.norm.btw));
    if (nummers.size > 1) return refuse('Niet samengevoegd: de groepen bevatten verschillende geldige BTW-nummers. Kies Verschillend of Later.');
    if (a.some((i) => b.some((j) => res.decisions.get(pairKey(i, j)) === 'verschillend'))) {
      return refuse('Niet samengevoegd: rijen in deze groepen zijn eerder als verschillend beoordeeld.');
    }
  }
  const decisions = new Map(res.decisions);
  for (const i of a) for (const j of b) decisions.set(pairKey(i, j), beslissing);
  const next = assemble(prep, decisions, { datum: res.datum, strengheid: res.strengheid.key });
  if (beslissing === 'zelfde' && [...a, ...b].some((i) => next.groupOf(i) !== next.groupOf(a[0]))) {
    return refuse('Niet samengevoegd: de keuze botst met een eerdere groepsbeslissing.');
  }
  return { ok: true, decisions, res: next, log: [{ ...pair, beslissing, ledenA: [...a], ledenB: [...b] }] };
}

// Ontkoppelen scheidt ieder lid van ieder ander lid, ook buiten de bewaarde verbindingen.
export function unlinkGroup(prep, res, group) {
  const decisions = new Map(res.decisions), log = [];
  for (let a = 0; a < group.memberIdx.length; a++) for (let b = a + 1; b < group.memberIdx.length; b++) {
    const i = group.memberIdx[a], j = group.memberIdx[b];
    decisions.set(pairKey(i, j), 'verschillend');
    log.push({ i, j, beslissing: 'verschillend', bron: 'ontkoppelen', reason: 'groep ontkoppeld' });
  }
  return { ok: true, decisions, log, res: assemble(prep, decisions, { datum: res.datum, strengheid: res.strengheid.key }) };
}

function perSourceStats(prep, merged, groupOf) {
  return prep.sources.map((src, s) => {
    const rows = prep.records.filter((r) => r.source === s);
    const st = { bron: src.name, label: src.label || sourceLabel(src.name), rijen: rows.length, uniekeLeads: 0, alleenHier: 0, dubbelAndereLijst: 0, dubbelBinnenLijst: 0, waarschuwingen: rows.reduce((n, r) => n + r.warnings.length, 0) };
    const seenGroups = new Set();
    for (const r of rows) {
      const g = groupOf(r.idx);
      const others = g.members.filter((m) => m.idx !== r.idx);
      if (others.some((m) => m.source === s)) st.dubbelBinnenLijst++;
      if (others.some((m) => m.source !== s)) st.dubbelAndereLijst++;
      if (!seenGroups.has(g)) { seenGroups.add(g); st.uniekeLeads++; if (g.members.every((m) => m.source === s)) st.alleenHier++; }
    }
    return st;
  });
}

// Logboek: elke originele rij precies één keer.
export function logRows(prep, res) {
  const out = [];
  for (const r of prep.records) {
    const g = res.groupOf(r.idx);
    const others = g.members.filter((m) => m.idx !== r.idx);
    const reasons = g.edges.filter((e) => e.i === r.idx || e.j === r.idx).map((e) => e.reason);
    out.push({
      bron: r.sourceName, rij: r.row, bedrijfsnaam: r.fields.bedrijfsnaam, nr: g.nr, uitkomst: others.length ? 'Samengevoegd' : 'Uniek',
      samengevoegdMet: others.map((m) => `${m.sourceLabel || m.sourceName} rij ${m.row}: ${m.fields.bedrijfsnaam}`).join('; '),
      reden: [...new Set(reasons)].join('; ') || (g.mogelijkDubbel.length ? 'mogelijk dubbel, nog te controleren' : ''),
      waarschuwingen: r.warnings.join('; '),
    });
  }
  return out;
}

export { pairKey };
