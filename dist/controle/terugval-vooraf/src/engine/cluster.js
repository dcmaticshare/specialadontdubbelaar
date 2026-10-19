// Groeperen en samenvoegen (stap 6): groepen vormen, BTW-conflicten bewaken, één record per bedrijf.
import { SETTINGS } from '../settings.js';
import { formatPhone, formatBtw } from './normalize.js';

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
// scored: [{ i, j, score, decision, ... }], decisions: Map(pairKey -> 'zelfde' | 'verschillend').
export function buildGroups(records, scored, decisions = new Map(), { compactGroups = [], score } = {}) {
  const n = records.length;
  const uf = new UnionFind(n);
  const btwOf = new Map(); // root -> btw-cijfers (geldig)
  records.forEach((r, i) => { if (r.norm.btw && r.norm.btwValid) btwOf.set(i, r.norm.btw); });
  // Uitsluitingen zijn grenzen tussen alle groepsleden, ook als dat paar niet gescoord is.
  const membersOf = records.map((_, i) => new Set([i]));
  const excluded = records.map(() => new Set());
  for (const [key, d] of decisions) if (d === 'verschillend') {
    const [i, j] = key.split('|').map(Number);
    excluded[i].add(j); excluded[j].add(i);
  }
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
  edges.sort((a, b) => b.prio - a.prio || b.score - a.score || a.i - b.i || a.j - b.j);
  const blocked = [];
  const mergedEdges = [];
  const join = (e) => {
    const ra = uf.find(e.i), rb = uf.find(e.j);
    if (ra === rb) { mergedEdges.push(e); return true; }
    const ba = btwOf.get(ra), bb = btwOf.get(rb);
    let blockReason = ba && bb && ba !== bb ? 'verschillend BTW-nummer in de groepen' : '';
    // De kleine groep doorlopen beperkt het werk bij lange ketens.
    const [small, otherMembers] = membersOf[ra].size < membersOf[rb].size ? [membersOf[ra], membersOf[rb]] : [membersOf[rb], membersOf[ra]];
    for (const i of small) {
      const scan = excluded[i].size < otherMembers.size ? excluded[i] : otherMembers;
      for (const j of scan) if (excluded[i].has(j) && otherMembers.has(j)) { blockReason = 'eerder als verschillend beoordeeld'; break; }
      if (blockReason) break;
    }
    if (blockReason) { blocked.push({ ...e, blockReason }); return false; }
    const root = uf.union(ra, rb);
    const other = root === ra ? rb : ra;
    for (const i of membersOf[other]) membersOf[root].add(i);
    membersOf[other].clear();
    if (btwOf.get(other) && !btwOf.get(root)) btwOf.set(root, btwOf.get(other));
    mergedEdges.push(e);
    return true;
  };
  for (const e of edges) join(e);
  for (const { members } of compactGroups) {
    // Vertegenwoordigers per huidig BTW-nummer: verschillende geldige nummers hoeven
    // nooit paarsgewijs te worden geprobeerd. Uitsluitingen kunnen extra groepen vereisen.
    const byBtw = new Map(), representatives = new Map();
    const remove = (root) => {
      if (!representatives.has(root)) return;
      const { vat } = representatives.get(root);
      byBtw.get(vat).delete(root); representatives.delete(root);
    };
    const add = (i) => {
      const root = uf.find(i), vat = btwOf.get(root) || '';
      representatives.set(root, { i, vat });
      if (!byBtw.has(vat)) byBtw.set(vat, new Set());
      byBtw.get(vat).add(root);
    };
    for (const i of members) {
      const root = uf.find(i);
      if (representatives.has(root)) continue;
      const vat = btwOf.get(root) || '';
      const options = vat ? [...(byBtw.get(vat) || []), ...(byBtw.get('') || [])] : representatives.keys();
      let attached = false;
      for (const target of options) {
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
  return { uf, groups, blocked, mergedEdges };
}

// Twijfelparen: één paar per twee groepen, hoogste score eerst, zonder al besliste paren.
export function reviewPairs(scored, blocked, uf, decisions = new Map()) {
  const best = new Map();
  const rootKey = (i, j) => pairKey(uf.find(i), uf.find(j));
  const separated = new Set();
  for (const [key, d] of decisions) if (d === 'verschillend') {
    const [i, j] = key.split('|').map(Number);
    separated.add(rootKey(i, j));
  }
  const consider = (p, extra = {}, conflict = false) => {
    const ra = uf.find(p.i), rb = uf.find(p.j);
    if (ra === rb) return;
    const k = pairKey(ra, rb);
    if (!conflict && (separated.has(k) || decisions.has(pairKey(p.i, p.j)))) return;
    const cur = best.get(k);
    // Een geblokkeerd besluit moet zichtbaar blijven, ook naast een hoger gescoord bronpaar.
    if (!cur || (conflict && !cur.conflict) || (conflict === cur.conflict && p.score > cur.score)) {
      best.set(k, { ...p, ...extra, rootA: ra, rootB: rb, conflict });
    }
  };
  for (const p of scored) if (p.decision === 'controleren') consider(p);
  for (const p of blocked) consider(p, { geblokkeerd: p.blockReason }, decisions.get(pairKey(p.i, p.j)) === 'zelfde');
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
  const members = [...memberIdx].sort((a, b) => cmpPrecedence(precedence(records, a), precedence(records, b))).map((i) => records[i]);
  const f = (k) => bestValue(members, (m) => m.fields[k] || '');
  const phones = [];
  for (const m of members) for (const p of m.norm.phones) if (!phones.includes(p)) phones.push(p);
  const emails = [];
  for (const m of members) for (const e of m.norm.emails) if (!emails.includes(e)) emails.push(e);
  const withBtw = members.find((m) => m.norm.btw && m.norm.btwValid) || members.find((m) => m.norm.btw);
  const withAddr = members.find((m) => m.norm.adresKey) || members.find((m) => m.norm.straat);
  const website = members.map((m) => m.norm.domains.find((d) => d === m.norm.domains[0] && m.fields.website) ? m.fields.website : '').find(Boolean) || f('website');
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
    extras: Object.fromEntries([...new Set(members.flatMap((m) => Object.keys(m.extras)))].map((key) =>
      [key, [...new Set(members.map((m) => m.extras[key]).filter((v) => v !== undefined && v !== ''))].join('\n')])),
    bronnen,
    eersteBron: members[0].sourceName,
    bronLabel: members[0].sourceLabel || members[0].sourceName,
    mogelijkDubbel: [],
    settings,
  };
}
