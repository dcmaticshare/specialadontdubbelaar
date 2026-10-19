// Groeperen en samenvoegen (stap 6): groepen vormen, BTW-conflicten bewaken, één record per bedrijf.
import { exclusionIndex } from './decisions.js';
import { SETTINGS } from '../settings.js';
import { formatPhone, formatBtw, normalizeWebsite } from './normalize.js';

export class UnionFind {
  constructor(n) { this.parent = Array.from({ length: n }, (_, i) => i); this.size = new Array(n).fill(1); }
  find(x) { while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; } return x; }
  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return ra;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra; this.size[ra] += this.size[rb];
    return ra;
  }
}

export const pairKey = (i, j) => (i < j ? `${i}|${j}` : `${j}|${i}`);

// Groepen uit de zekere dubbels en de menselijke beslissingen.
// decisions bevat oude paarbesluiten en compacte groepsbesluiten (zie decisions.js).
export function buildGroups(records, scored, decisions = new Map(), { compactGroups = [], score } = {}) {
  const n = records.length;
  const uf = new UnionFind(n);
  const btwOf = new Map(); // root -> btw-cijfers (geldig)
  records.forEach((r, i) => { if (r.norm.btw && r.norm.btwValid) btwOf.set(i, r.norm.btw); });
  const exclusions = exclusionIndex(n, decisions);
  const pairs = new Map(scored.map((p) => [pairKey(p.i, p.j), p]));
  for (const [key, d] of decisions) if (d === 'zelfde' && !pairs.has(key)) {
    const [i, j] = key.split('|').map(Number);
    pairs.set(key, { i, j, score: 0, reason: 'door gebruiker samengevoegd',
      matched: { telefoon: [], email: [], domein: [] } });
  }
  const edges = [];
  for (const [key, p] of pairs) {
    const d = decisions.get(key);
    if (d === 'verschillend') continue;
    if (d === 'zelfde') edges.push({ ...p, prio: 1 });
    else if (p.decision === 'zeker') edges.push({ ...p, prio: 0 });
  }
  // Een ster verbindt alle leden van beide gekozen groepen met lineair veel randen.
  for (const d of decisions.values()) if (d?.beslissing === 'zelfde') {
    const add = (i, j) => edges.push({ i, j, score: 0, prio: 1,
      reason: 'door gebruiker samengevoegd', matched: { telefoon: [], email: [], domein: [] } });
    for (const j of d.ledenB) add(d.ledenA[0], j);
    for (const i of d.ledenA.slice(1)) add(i, d.ledenB[0]);
  }
  // Een latere ontkoppeling vervangt directe samenvoegingen tussen die leden.
  // Indirect tegenstrijdige ketens blijven via join als conflict zichtbaar.
  const activeEdges = edges.filter((e) => !exclusions.conflicts(e.i, e.j));
  activeEdges.sort((a, b) => b.prio - a.prio || b.score - a.score || a.i - b.i || a.j - b.j);
  const blocked = [];
  const mergedEdges = [];
  const join = (e) => {
    const ra = uf.find(e.i), rb = uf.find(e.j);
    if (ra === rb) { mergedEdges.push(e); return true; }
    const ba = btwOf.get(ra), bb = btwOf.get(rb);
    let blockReason = ba && bb && ba !== bb ? 'verschillend BTW-nummer in de groepen' : '';
    if (!blockReason && exclusions.conflicts(ra, rb)) blockReason = 'eerder als verschillend beoordeeld';
    if (blockReason) { blocked.push({ ...e, blockReason }); return false; }
    const root = uf.union(ra, rb);
    const other = root === ra ? rb : ra;
    exclusions.merge(root, other);
    if (btwOf.get(other) && !btwOf.get(root)) btwOf.set(root, btwOf.get(other));
    mergedEdges.push(e);
    return true;
  };
  for (const e of activeEdges) join(e);
  for (const { members } of compactGroups) {
    // Vertegenwoordigers per huidig BTW-nummer: verschillende geldige nummers hoeven
    // nooit paarsgewijs te worden geprobeerd. Uitsluitingen kunnen extra groepen vereisen.
    const byBtw = new Map(), representatives = new Map();
    const updateCounts = (bucket, labels, delta) => {
      for (const [key, side] of labels) {
        const id = `${key}:${side}`, value = (bucket.counts.get(id) || 0) + delta;
        if (value) bucket.counts.set(id, value); else bucket.counts.delete(id);
      }
    };
    const remove = (root) => {
      if (!representatives.has(root)) return;
      const { vat, labels } = representatives.get(root), bucket = byBtw.get(vat);
      bucket.roots.delete(root); updateCounts(bucket, labels, -1); representatives.delete(root);
    };
    const add = (i) => {
      const root = uf.find(i), vat = btwOf.get(root) || '';
      const labels = new Map(exclusions.labels[root]);
      representatives.set(root, { i, vat, labels });
      if (!byBtw.has(vat)) byBtw.set(vat, { roots: new Set(), counts: new Map() });
      const bucket = byBtw.get(vat);
      bucket.roots.add(root); updateCounts(bucket, labels, 1);
    };
    for (const i of members) {
      const root = uf.find(i);
      if (representatives.has(root)) continue;
      const vat = btwOf.get(root) || '';
      const buckets = vat ? [byBtw.get(vat), byBtw.get('')].filter(Boolean) : [...byBtw.values()];
      // Een volledig ontkoppelde groep of afgewezen groepskant in één keer overslaan.
      // Zo wordt een grote ontkoppeling ook bij herberekenen geen kwadratisch zoekpad.
      const options = function* () {
        for (const bucket of buckets) {
          let excluded = false;
          for (const [key, side] of exclusions.labels[uf.find(i)]) {
            const opposite = side === 3 ? 3 : 3 - side;
            if (bucket.counts.get(`${key}:${opposite}`) === bucket.roots.size) { excluded = true; break; }
          }
          if (!excluded) yield* bucket.roots;
        }
      };
      let attached = false;
      for (const target of options()) {
        if (exclusions.conflicts(uf.find(i), target)) continue;
        const j = representatives.get(target).i;
        const evidence = score(i, j);
        if (evidence.decision !== 'zeker') continue;
        if (join({ i, j, ...evidence, prio: 0 })) {
          remove(target); add(i); attached = true; break;
        }
      }
      if (!attached) add(i);
    }
  }
  const byRoot = new Map();
  for (let i = 0; i < n; i++) { const r = uf.find(i); let g = byRoot.get(r); if (!g) { g = []; byRoot.set(r, g); } g.push(i); }
  const groups = [...byRoot.entries()].map(([root, members]) => ({ root, members })).sort((a, b) => a.members[0] - b.members[0]);
  return { uf, groups, blocked, mergedEdges, exclusions };
}

// Twijfelparen: één paar per twee groepen, hoogste score eerst, zonder al besliste paren.
export function reviewPairs(scored, blocked, uf, decisions = new Map(), exclusions = exclusionIndex(uf.parent.length, decisions, uf)) {
  const best = new Map();
  const consider = (p, extra = {}, conflict = false) => {
    const ra = uf.find(p.i), rb = uf.find(p.j);
    if (ra === rb) return;
    const k = pairKey(ra, rb);
    if (!conflict && (exclusions.conflicts(ra, rb) || decisions.has(pairKey(p.i, p.j)))) return;
    const cur = best.get(k);
    // Een geblokkeerd besluit moet zichtbaar blijven, ook naast een hoger gescoord bronpaar.
    if (!cur || (conflict && !cur.conflict) || (conflict === cur.conflict && p.score > cur.score)) {
      best.set(k, { ...p, ...extra, rootA: ra, rootB: rb, conflict });
    }
  };
  for (const p of scored) if (p.decision === 'controleren') consider(p);
  for (const p of blocked) consider(p, { geblokkeerd: p.blockReason }, p.prio === 1);
  return [...best.values()].sort((a, b) => b.score - a.score || a.i - b.i);
}

// Voorrang bij gelijkspel: uploadvolgorde, dan rijnummer.
function precedence(records, i) {
  const r = records[i];
  return [r.source, r.row, i];
}

function cmpPrecedence(a, b) {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k];
  return 0;
}

function bestValue(members, getter) {
  let best = '';
  for (const m of members) {
    const v = getter(m);
    if (v && v.length > best.length) best = v;
  }
  return best;
}

// Eén record per groep: per veld de meest volledige waarde; gelijkspel: uploadvolgorde.
export function mergeGroup(records, memberIdx, settings = SETTINGS) {
  const single = memberIdx.length === 1 ? records[memberIdx[0]] : null;
  const members = single ? [single] : [...memberIdx].sort((a, b) => cmpPrecedence(precedence(records, a), precedence(records, b))).map((i) => records[i]);
  const f = single ? (k) => single.fields[k] || '' : (k) => bestValue(members, (m) => m.fields[k] || '');
  const phones = [];
  for (const m of members) for (const p of m.norm.phones) if (!phones.includes(p)) phones.push(p);
  const emails = [];
  for (const m of members) for (const e of m.norm.emails) if (!emails.includes(e)) emails.push(e);
  const withBtw = members.find((m) => m.norm.btw && m.norm.btwValid) || members.find((m) => m.norm.btw);
  const withAddr = members.find((m) => m.norm.adresKey) || members.find((m) => m.norm.straat);
  // Bij één bronrij bestaat er geen andere website om voorrang te geven.
  const website = single ? f('website') : members.find((m) => normalizeWebsite(m.fields.website))?.fields.website || f('website');
  const bronnen = members.map((m) => `${m.sourceName} (rij ${m.row})`);
  const raw = Object.create(null);
  for (const m of members) for (const [k, v] of Object.entries(m.raw)) if (v && !raw[k]) raw[k] = v;
  const contact = f('contactpersoon');
  let voornaam = f('voornaam'), achternaam = f('achternaam');
  const cm = members.find((m) => m.fields.contactpersoon === contact && contact);
  if (cm) { voornaam = cm.fields.voornaam; achternaam = cm.fields.achternaam; }
  return {
    members,
    memberIdx: members.map((m) => m.idx),
    bedrijfsnaam: f('bedrijfsnaam'),
    contactpersoon: contact,
    voornaam,
    achternaam,
    telefoons: phones,
    telefoonsDisplay: phones.map(formatPhone),
    emails,
    website,
    btw: withBtw ? withBtw.norm.btw : '',
    btwDisplay: withBtw ? formatBtw(withBtw.norm.btw) : '',
    straat: withAddr ? withAddr.norm.straat : f('straat'),
    huisnummer: withAddr ? withAddr.norm.huisnummer : f('huisnummer'),
    bus: withAddr ? withAddr.norm.bus : '',
    postcode: bestValue(members, (m) => m.norm.postcode),
    gemeente: f('gemeente'),
    hoofdsector: f('hoofdsector'),
    sector: f('sector'),
    raw,
    extras: single ? Object.fromEntries(Object.entries(single.extras).map(([key, value]) => [key, value == null ? '' : String(value)]))
      : Object.fromEntries([...new Set(members.flatMap((m) => Object.keys(m.extras)))].map((key) =>
      [key, [...new Set(members.map((m) => m.extras[key]).filter((v) => v !== undefined && v !== ''))].join('\n')])),
    bronnen,
    eersteBron: members[0].sourceName,
    bronLabel: members[0].sourceLabel || members[0].sourceName,
    mogelijkDubbel: [],
    settings,
  };
}
