// De verwerking van begin tot einde, zonder schermcode: lijsten -> records -> paren -> groepen -> resultaat.
import { finishTiming } from './timing.js';
import { addGroupDecision, exclusionIndex } from './decisions.js';
import { SETTINGS } from '../settings.js';
import { makeRecord } from './records.js';
import { createFieldExtractor, comparisonPolicy } from '../io/mapping.js';
import { buildIndex, candidatePairs, scorePair, decidePair, grenzenVoor, strengheidNiveau, laagsteGrens } from './match.js';
import { buildGroups, reviewPairs, mergeGroup, pairKey } from './cluster.js';
import { todayIso } from './text.js';

// Dezelfde blokgrenzen, zonder de oplopende minimumwachttijd van geneste browsertimers.
// Achtergrondprioriteit laat ook timers en schermupdates voorgaan; scheduler.yield()
// geeft opeenvolgende vervolgtaken voorrang en kan die timers alsnog laten wachten.
// Oudere browsers blijven via een timer ruimte geven aan invoer en schermupdates.
const tick = () => {
  if (typeof globalThis.scheduler?.postTask === 'function') return globalThis.scheduler.postTask(() => {}, { priority: 'background' });
  return new Promise((resolve) => setTimeout(resolve, 0));
};

// Korte bronnaam zonder extensie en zonder "geupload"/"(1)".
export function sourceLabel(name) {
  return String(name).replace(/\.[^.]+$/, '').replace(/\(\d+\)/g, '').replace(/\bge[uü]pload\b/gi, '').replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ').trim() || String(name);
}

// sources: [{ name, header, rows, mapping, label?, rowNumbers?, sheetName?, columnOffset?, originals? }]
// Het vergelijkingsbeleid wordt per bron opnieuw berekend; aangeleverde nearConstant wordt niet gebruikt.
export async function prepare({ sources, settings = SETTINGS, onProgress = () => {}, chunk = settings.verwerking.scoreBlok }) {
  const started = performance.now();
  let phase = started;
  const records = [];
  const totalRows = sources.reduce((n, src) => n + src.rows.length, 0);
  for (const [s, src] of sources.entries()) {
    const policy = comparisonPolicy(src, settings);
    const compareMapping = src.mapping.map((field, c) => policy.excluded[c] ? 'negeren' : field);
    const extract = createFieldExtractor(src.mapping, src.header);
    const extractCompare = policy.excluded.some(Boolean) ? createFieldExtractor(compareMapping, src.header) : null;
    const label = src.label || sourceLabel(src.name);
    await tick();
    for (const [r, row] of src.rows.entries()) {
      const { fields, extras, raw, rawCells } = extract(row);
      const record = makeRecord({
        idx: records.length, source: s, sourceName: src.name, sourceLabel: label,
        row: src.rowNumbers ? src.rowNumbers[r] : r + 2, raw, extras,
        originals: [
          ...(src.originals?.[r] || []),
          { bron: src.name, blad: src.sheetName || '', rij: src.rowNumbers ? src.rowNumbers[r] : r + 2, cellen: rawCells.map((cell) => ({ ...cell, kolom: cell.kolom + (src.columnOffset || 0) })) },
        ],
      }, fields);
      if (extractCompare) {
        // De oorspronkelijke normalisatie blijft voor scherm en export; alle vergelijkingspaden
        // gebruiken dezelfde gefilterde velden, inclusief van e-mail afgeleide domeinen.
        record.compare = makeRecord({}, extractCompare(row).fields).norm;
        policy.excluded.forEach((excluded, c) => {
          if (excluded && String(row[c] ?? '').trim()) record.warnings.push(`contactkolom "${src.header[c]}" niet gebruikt om te vergelijken: bijna constante contactgegevens bij verschillende bedrijfsnamen; oorspronkelijke waarde bewaard`);
        });
      }
      records.push(record);
      if (records.length % settings.verwerking.normaliseerBlok === 0) {
        onProgress(0.05 * records.length / totalRows, `Rijen gelijkgetrokken: ${records.length} van ${totalRows}`);
        await tick();
      }
    }
  }
  finishTiming('normaliseren', phase);
  onProgress(0.05, `${records.length} rijen gelijkgetrokken`);
  await tick();
  phase = performance.now();
  const index = buildIndex(records, settings);
  const { pairs, skipped, compactGroups } = candidatePairs(records, index, settings);
  finishTiming('kandidaten', phase);
  onProgress(0.15, `${pairs.length} kandidaatparen gevonden`);
  await tick();
  phase = performance.now();
  const scored = [];
  const minScore = laagsteGrens(settings); // alles bewaren wat op het strengste niveau nog een twijfelpaar kan zijn
  for (let k = 0; k < pairs.length; k++) {
    const [i, j] = pairs[k];
    const s = scorePair(records[i], records[j], index, settings);
    if (s.decision !== 'uniek' || s.score >= minScore || s.matched.telefoon.length) scored.push({ i, j, ...s });
    if (k % chunk === chunk - 1) { onProgress(0.15 + 0.8 * (k / pairs.length), `Vergeleken: ${k + 1} van ${pairs.length} paren`); await tick(); }
  }
  finishTiming('scoren', phase);
  finishTiming('voorbereiden', started, { kandidaten: pairs.length, compacteGroepen: compactGroups.length, scores: scored.length, overgeslagenSleutels: skipped.length });
  onProgress(1, 'Klaar');
  return { records, index, scored, skipped, sources, settings, candidates: pairs, compactGroups };
}

// Beslissing per paar opnieuw bij andere grenzen; alleen paren waarvan de beslissing verandert worden gekopieerd.
function herbeoordeel(scored, grenzen) {
  return scored.map((p) => { const d = decidePair(p, grenzen); return d === p.decision ? p : { ...p, decision: d }; });
}

// Groepen, samengevoegde leads, twijfelparen en samenvatting; snel genoeg om na elke beslissing opnieuw te doen.
// decisions: Map met oude paarbesluiten en compacte groepsbesluiten van de gebruiker.
// strengheid: sleutel van het niveau uit settings.strengheid (bepaalt vanaf hoeveel punten een paar een twijfelpaar is).
export function assemble(prep, decisions = new Map(), { datum = todayIso(), strengheid } = {}) {
  const started = performance.now();
  const { records, settings } = prep;
  const niveau = strengheidNiveau(settings, strengheid);
  const grenzen = grenzenVoor(settings, niveau.key);
  const scored = herbeoordeel(prep.scored, grenzen);
  const compact = { compactGroups: prep.compactGroups || [], score: (i, j) => scorePair(records[i], records[j], prep.index, settings) };
  const { uf, groups, blocked, mergedEdges, exclusions } = buildGroups(records, scored, decisions, compact);
  const review = reviewPairs(scored, blocked, uf, decisions, exclusions);
  const merged = groups.map((g) => {
    const m = mergeGroup(records, g.members, settings);
    m.root = g.root; m.edges = []; m.deeltTelefoonMet = [];
    return m;
  });
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
    // Gewone strengheidsstanden veranderen alleen de controlegrens. Dezelfde zekere
    // verbindingen en besluiten geven dan exact dezelfde groepen en blokkeringen.
    // Een aangepaste stand die ook zekerheid wijzigt, blijft volledig hergroeperen.
    const sameCertain = sc.every((p, i) => (p.decision === 'zeker') === (scored[i].decision === 'zeker'));
    const b = sameCertain ? { blocked, uf, exclusions } : buildGroups(records, sc, decisions, compact);
    return { key: nv.key, label: nv.label, teControleren: g.teControleren, aantal: reviewPairs(sc, b.blocked, b.uf, decisions, b.exclusions).length };
  });
  finishTiming('groeperen', started, summary);
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
  if (a.length + b.length > prep.settings.groepsbesluiten.maxLeden) return refuse(`Deze groepskeuze omvat te veel rijen. Maximaal ${prep.settings.groepsbesluiten.maxLeden} rijen per keuze.`);
  if (beslissing === 'zelfde') {
    const nummers = new Set([...a, ...b].map((i) => prep.records[i]).filter((r) => r.norm.btwValid).map((r) => r.norm.btw));
    if (nummers.size > 1) return refuse('Niet samengevoegd: de groepen bevatten verschillende geldige BTW-nummers. Kies Verschillend of Later.');
    if (exclusionIndex(prep.records.length, res.decisions, res.uf).conflicts(res.uf.find(a[0]), res.uf.find(b[0]))) {
      return refuse('Niet samengevoegd: rijen in deze groepen zijn eerder als verschillend beoordeeld.');
    }
  }
  const decisions = addGroupDecision(res.decisions, { ledenA: [...a], ledenB: [...b], beslissing });
  const next = assemble(prep, decisions, { datum: res.datum, strengheid: res.strengheid.key });
  if (beslissing === 'zelfde' && [...a, ...b].some((i) => next.groupOf(i) !== next.groupOf(a[0]))) {
    return refuse('Niet samengevoegd: de keuze botst met een eerdere groepsbeslissing.');
  }
  return { ok: true, decisions, res: next, log: [{ ...pair, beslissing, ledenA: [...a], ledenB: [...b] }] };
}

// Ontkoppelen scheidt ieder lid van ieder ander lid, ook buiten de bewaarde verbindingen.
export function unlinkGroup(prep, res, group) {
  const leden = [...group.memberIdx];
  if (leden.length > prep.settings.groepsbesluiten.maxLeden) return {
    ok: false, error: `Deze groep bevat te veel rijen om te ontkoppelen. Maximaal ${prep.settings.groepsbesluiten.maxLeden} rijen per keuze.`,
    decisions: res.decisions, res, log: [],
  };
  if (leden.length < 2) return { ok: true, decisions: res.decisions, res, log: [] };
  const decisions = addGroupDecision(res.decisions, { leden, beslissing: 'ontkoppelen' });
  const log = [{ i: leden[0], j: leden[1], ledenA: leden, ledenB: [], beslissing: 'verschillend',
    bron: 'ontkoppelen', reason: 'alle leden van de groep onderling ontkoppeld' }];
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
