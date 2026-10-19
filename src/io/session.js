// Eén herstelpunt: broninhoud en voortgang worden samen vastgelegd, zonder sessiegeschiedenis.
import { SETTINGS } from '../settings.js';
import { FIELDS } from './mapping.js';

// Ook gaten in een opgeslagen array zijn beschadigde inhoud; Array.every slaat die over.
function allItems(value, valid) {
  if (!Array.isArray(value)) return false;
  for (const item of value) if (!valid(item)) return false;
  return true;
}

function originalRow(value) {
  // Herkomst uit een opnieuw ingelezen export bestaat uitsluitend uit tekstcellen.
  return value && typeof value.bron === 'string' && typeof value.blad === 'string' && typeof value.rij === 'string' &&
    allItems(value.cellen, (cell) => cell && typeof cell.kolom === 'string' && typeof cell.kop === 'string' && typeof cell.waarde === 'string');
}

// De overige tabbladen blijven alleen in het open venster; null bewaart hun index en sheetNames hun naam.
// originals op het gekozen blad bevat de benodigde herkomst, ook zonder het volledige herkomsttabblad.
export function sessionSources(files) {
  return files.filter((f) => f.read && !f.error && !f.busy).map((f) => ({
    id: f.id,
    read: { ...f.read, sheets: f.read.sheets.map((s, i) => i === f.sheetIndex ? s : null) },
  }));
}

export function sessionSnapshot(state) {
  return {
    versie: SETTINGS.sessie.versie,
    screen: state.screen,
    files: state.files.filter((f) => !f.busy).map((f) => ({
      id: f.id, name: f.name, sheetIndex: f.sheetIndex, map: f.map, error: f.error,
    })),
    decisions: [...state.decisions], decisionLog: state.decisionLog, deferred: [...state.deferred],
    strengheid: state.strengheid, tab: state.tab, search: state.search,
    datum: state.res?.datum || null,
  };
}

export function restoreSession(snapshot, sources) {
  const fail = () => { throw new Error('De bewaarde sessie is onvolledig of heeft een onbekende versie.'); };
  const strings = (v) => allItems(v, (s) => typeof s === 'string');
  // Versie 1 bevat uitsluitend paarbesluiten; die blijven zonder gegevensverlies leesbaar.
  if (!snapshot || ![1, SETTINGS.sessie.versie].includes(snapshot.versie) || !Array.isArray(snapshot.files) || !Array.isArray(sources)) fail();
  if (!['files', 'mapping', 'processing', 'review', 'export'].includes(snapshot.screen) ||
      !SETTINGS.strengheid.niveaus.some((n) => n.key === snapshot.strengheid) ||
      !['twijfel', 'samengevoegd', 'leads', 'waarschuwingen'].includes(snapshot.tab) || typeof snapshot.search !== 'string') fail();
  const ids = new Set(), fields = new Set(FIELDS.map((f) => f.key));
  const sourceMap = new Map(sources.map((s) => [s?.id, s?.read]));
  if (sourceMap.size !== sources.length) fail();
  const files = snapshot.files.map((f) => {
    if (!f || !Number.isSafeInteger(f.id) || f.id < 1 || ids.has(f.id) || typeof f.name !== 'string') fail();
    ids.add(f.id);
    if (f.error) {
      if (typeof f.error !== 'string') fail();
      return { ...f, busy: false };
    }
    const read = sourceMap.get(f.id);
    if (!read || !Array.isArray(read.sheets) || !Number.isInteger(f.sheetIndex) || !read.sheets[f.sheetIndex]) fail();
    if (!['csv', 'excel'].includes(read.kind) || !strings(read.sheetNames) || read.sheetNames.length !== read.sheets.length ||
        read.sheets.some((s, i) => s !== null && s?.name !== read.sheetNames[i]) ||
        !Number.isSafeInteger(read.defaultSheet) || read.defaultSheet < 0 || read.defaultSheet >= read.sheets.length) fail();
    // defaultSheet mag naar een niet bewaard blad wijzen; alleen het gekozen blad moet aanwezig zijn.
    if (read.kind === 'csv' ? !SETTINGS.inlezen.csvCoderingen.includes(read.encoding) || !SETTINGS.inlezen.csvScheidingstekens.includes(read.delimiter)
      : read.encoding !== null || read.delimiter !== null) fail();
    for (const s of read.sheets) {
      if (s === null) continue; // Een bewust niet bewaard blad is nooit het gekozen blad.
      if (!s || typeof s.name !== 'string' || !strings(s.header) || !Array.isArray(s.rows) || !s.rows.every(strings) ||
          !Array.isArray(s.rowNumbers) || s.rowNumbers.length !== s.rows.length ||
          !s.rowNumbers.every((r) => Number.isSafeInteger(r) && r > 0) || !strings(s.warnings) || !Number.isInteger(s.headerRowIndex) ||
          !Number.isSafeInteger(s.columnOffset) || s.columnOffset < 0) fail();
      if (s.originals !== undefined && (!allItems(s.originals, (origins) => allItems(origins, originalRow)) ||
          s.originals.length !== s.rows.length)) fail();
    }
    if (f.map && (f.map.sheetIndex !== f.sheetIndex || !Array.isArray(f.map.mapping) ||
        f.map.mapping.length !== read.sheets[f.sheetIndex].header.length || !f.map.mapping.every((v) => fields.has(v)) ||
        !strings(f.map.mappingNotes))) fail();
    return { ...f, read, busy: false };
  });
  const good = files.filter((f) => !f.error);
  const count = good.reduce((n, f) => n + f.read.sheets[f.sheetIndex].rows.length, 0);
  const index = (i) => Number.isSafeInteger(i) && i >= 0 && i < count;
  const key = (k) => {
    if (typeof k !== 'string' || !/^\d+\|\d+$/.test(k)) return false;
    const [i, j] = k.split('|').map(Number);
    return index(i) && index(j) && i < j;
  };
  const decision = (d) => d === 'zelfde' || d === 'verschillend';
  const members = (v) => Array.isArray(v) && v.length > 0 && v.length <= SETTINGS.groepsbesluiten.maxLeden &&
    v.every(index) && new Set(v).size === v.length;
  const entry = (item) => {
    if (!Array.isArray(item) || item.length !== 2) return false;
    const [id, d] = item;
    if (key(id)) return decision(d);
    if (snapshot.versie === 1 || typeof id !== 'string' || !/^groep:\d+$/.test(id) || !d || typeof d !== 'object') return false;
    if (d.beslissing === 'ontkoppelen') return members(d.leden) && d.leden.length >= 2;
    if (!decision(d.beslissing) || !members(d.ledenA) || !members(d.ledenB) ||
        d.ledenA.length + d.ledenB.length > SETTINGS.groepsbesluiten.maxLeden) return false;
    const a = new Set(d.ledenA);
    return d.ledenB.every((i) => !a.has(i));
  };
  if (!Array.isArray(snapshot.decisions) || !snapshot.decisions.every(entry) ||
      new Map(snapshot.decisions).size !== snapshot.decisions.length || !Array.isArray(snapshot.deferred) || !snapshot.deferred.every(key) ||
      !Array.isArray(snapshot.decisionLog) || !snapshot.decisionLog.every((d) => d && index(d.i) && index(d.j) && decision(d.beslissing) &&
        typeof d.datum === 'string' && ['ledenA', 'ledenB'].every((k) => d[k] === undefined || (Array.isArray(d[k]) && d[k].every(index))))) fail();
  if (snapshot.datum !== null && (typeof snapshot.datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.datum))) fail();
  if (snapshot.screen !== 'files' && !good.length) fail();
  if (['processing', 'review', 'export'].includes(snapshot.screen) && good.some((f) => !f.map?.mapping.includes('bedrijfsnaam'))) fail();
  return {
    files, screen: snapshot.screen, decisions: new Map(snapshot.decisions), decisionLog: snapshot.decisionLog,
    deferred: new Set(snapshot.deferred), strengheid: snapshot.strengheid, tab: snapshot.tab, search: snapshot.search,
  };
}

export function openSessionStore(factory, href) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('Browseropslag is niet beschikbaar.')); return; }
    const url = new URL(href); url.hash = ''; url.search = '';
    const request = factory.open(`${SETTINGS.sessie.sleutel}:${url.href}`, 1);
    let expired = false;
    const fail = (error) => { expired = true; clearTimeout(timer); reject(error); };
    const timer = setTimeout(() => fail(new Error('Browseropslag reageert niet.')), SETTINGS.sessie.openenTimeoutMs);
    request.onupgradeneeded = () => request.result.createObjectStore('sessie');
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('Sluit andere vensters van deze tool en probeer opnieuw.'));
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      if (expired) { db.close(); return; }
      db.onversionchange = () => db.close();
      let revision = 0;
      resolve({
        read: () => new Promise((done, failed) => {
          const tx = db.transaction('sessie', 'readonly'), store = tx.objectStore('sessie');
          const current = store.get('huidig'), sources = store.get('bronnen');
          tx.onabort = () => failed(tx.error || new Error('Sessie lezen is mislukt.'));
          tx.oncomplete = () => {
            revision = current.result?.revision || 0;
            done({ snapshot: current.result?.snapshot || null, sources: sources.result || [] });
          };
        }),
        // Beide delen worden atomair vervangen. Bronlijsten veranderen niet bij iedere beoordeling.
        write: (snapshot, sources) => new Promise((done, failed) => {
          const tx = db.transaction('sessie', 'readwrite', { durability: 'strict' }), store = tx.objectStore('sessie');
          let conflict = false, writeError;
          const current = store.get('huidig');
          current.onsuccess = () => {
            if ((current.result?.revision || 0) !== revision) { conflict = true; tx.abort(); return; }
            try {
              store.put({ revision: revision + 1, snapshot }, 'huidig');
              if (snapshot === null) store.delete('bronnen');
              else if (sources !== undefined) store.put(sources, 'bronnen');
            } catch (error) { writeError = error; tx.abort(); }
          };
          tx.onabort = () => failed(conflict ? new Error('SESSIE_CONFLICT') : writeError || tx.error || new Error('Sessie bewaren is mislukt.'));
          tx.oncomplete = () => { revision++; done(); };
        }),
        close: () => db.close(),
      });
    };
  });
}
