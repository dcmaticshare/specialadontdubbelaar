// Het scherm: bestanden, kolommen koppelen, controleren, exporteren. Alle gegevens blijven in het geheugen van de browser.
import { SETTINGS } from '../settings.js';
import { h, clear, append, select, table } from './dom.js';
import { readFile } from '../io/read.js';
import { FIELDS, suggestMapping, makeProfile, comparisonPolicy, readProfiles, saveProfiles } from '../io/mapping.js';
import { prepare, assemble, sourceLabel, pairKey, decideGroups, unlinkGroup } from '../engine/pipeline.js';
import { buildResultWorkbook, resultFileName } from '../io/write.js';
import { nowIso } from '../engine/text.js';
import { normalizeWebsite, emailDomain } from '../engine/normalize.js';

const BUILD = (typeof window !== 'undefined' && window.__LO_BUILD__) || { version: 'dev', date: '', license: '', sheetjs: '' };
const STEPS = [['files', 'Bestanden'], ['mapping', 'Kolommen'], ['review', 'Controleren'], ['export', 'Exporteren']];

const state = {
  screen: 'files',
  files: [],
  prep: null,
  res: null,
  decisions: new Map(),
  decisionLog: [],
  deferred: new Set(),
  strengheid: SETTINGS.strengheid.standaard, // 'streng' | 'gemiddeld' | 'mild', zie settings.js
  tab: 'twijfel',
  search: '',
  progress: { value: 0, label: '' },
  error: null,
  showAbout: false,
  downloads: {},
  profileNotice: '',
};
let nextFileId = 1;
const root = document.getElementById('app');

// ------------------------------------------------------------------ hulpfuncties

// Bronprofielen (kolomkoppelingen per kolomindeling) worden in de browser onthouden.
function storedProfiles() {
  try {
    const result = readProfiles(localStorage);
    if (result.notice) state.profileNotice = result.notice;
    return result.profiles;
  } catch {
    state.profileNotice = 'Bronprofielen zijn niet beschikbaar; de kolommen worden opnieuw voorgesteld.';
    return [];
  }
}
function rememberProfiles(profiles) {
  try {
    if (!saveProfiles(localStorage, profiles)) state.profileNotice = 'De browser kan de bronprofielen niet bewaren.';
  } catch { /* localStorage kan ontbreken; dat is geen probleem */ }
}
function dataFiles() { return state.files.filter((f) => f.read && !f.error); }
function sheetOf(f) { return f.read.sheets[f.sheetIndex]; }
function ensureMapping(f) {
  if (!f.map || f.map.sheetIndex !== f.sheetIndex) {
    const s = sheetOf(f);
    f.map = { ...suggestMapping({ header: s.header, rows: s.rows, profiles: storedProfiles() }), sheetIndex: f.sheetIndex };
  }
  return f.map;
}
function n(x) { return new Intl.NumberFormat('nl-BE').format(x); }
function plural(k, one, many) { return `${n(k)} ${k === 1 ? one : many}`; }

// ------------------------------------------------------------------ algemeen scherm

function render() {
  clear(root);
  root.append(renderTopbar(), h('main', {}, state.error ? h('div', { class: 'msg bad' }, state.error) : null, renderScreen()), renderFooter());
}

function renderTopbar() {
  const idx = STEPS.findIndex(([k]) => k === state.screen || (state.screen === 'processing' && k === 'review'));
  return h('header', { class: 'topbar' }, h('div', { class: 'inner' },
    h('div', { class: 'brand' }, h('h1', {}, 'Lead-ontdubbelaar'), h('span', { class: 'badge' }, `versie ${BUILD.version}`)),
    h('nav', { class: 'stepper' }, STEPS.map(([k, l], i) => h('span', { class: `step${i === idx ? ' active' : i < idx ? ' done' : ''}` }, `${i + 1}. ${l}`)))));
}

function renderFooter() {
  return h('div', { class: 'footer' },
    `Lead-ontdubbelaar ${BUILD.version}${BUILD.date ? ` · gebouwd op ${BUILD.date}` : ''} · `,
    h('button', { class: 'linkbtn', onClick: () => { state.showAbout = !state.showAbout; render(); } }, 'Over deze tool'),
    state.showAbout ? h('div', { class: 'card' },
      h('p', {}, 'Deze tool verwerkt je lijsten volledig in de browser. Er wordt niets verstuurd: het bestand verbiedt elke netwerkverbinding (Content-Security-Policy connect-src \'none\').'),
      h('p', {}, `Excel-bibliotheek: SheetJS Community Edition ${BUILD.sheetjs || ''} (Apache 2.0).`),
      h('pre', { class: 'license' }, BUILD.license || '')) : null);
}

function renderScreen() {
  switch (state.screen) {
    case 'files': return renderFiles();
    case 'mapping': return renderMapping();
    case 'processing': return renderProcessing();
    case 'review': return renderReview();
    case 'export': return renderExport();
    default: return h('p', {}, 'Onbekend scherm');
  }
}

// ------------------------------------------------------------------ 1. bestanden

async function addFiles(list) {
  for (const file of list) {
    const entry = { id: nextFileId++, name: file.name, busy: true, map: null, error: null };
    state.files.push(entry);
    render();
    try {
      entry.read = await readFile(file);
      entry.sheetIndex = entry.read.defaultSheet;
    } catch (e) {
      entry.error = e.message || String(e);
    }
    entry.busy = false;
    render();
  }
}

function renderFiles() {
  const input = h('input', { type: 'file', multiple: true, accept: '.xlsx,.xls,.xlsm,.csv,.txt', class: 'hidden', onChange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
  const dz = h('div', {
    class: 'dropzone', tabindex: 0, role: 'button',
    onClick: () => input.click(),
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    onDragover: (e) => { e.preventDefault(); dz.classList.add('over'); },
    onDragleave: () => dz.classList.remove('over'),
    onDrop: (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); },
  },
  h('div', {}, h('strong', {}, 'Sleep hier de lijsten die je wilt ontdubbelen')),
  h('p', { class: 'muted' }, 'of klik om bestanden te kiezen (.xlsx, .xls, .csv). Meerdere tegelijk mag; één lijst kan ook.'), input);

  const ready = dataFiles().length > 0 && !state.files.some((f) => f.busy);
  return h('div', {},
    h('div', { class: 'card' },
      h('h2', {}, 'Stap 1. Bestanden'),
      h('p', { class: 'muted' }, 'Alle geladen lijsten worden onderling en binnen zichzelf vergeleken. Upload de originele exports, niet een versie die eerst in Excel bewaard is.'),
      dz),
    h('div', { class: 'filelist' }, state.files.map(renderFileCard)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary big', disabled: !ready, onClick: () => { state.screen = 'mapping'; state.error = null; render(); } }, 'Volgende: kolommen koppelen'),
      state.files.length ? h('button', { class: 'btn', onClick: () => { state.files = []; render(); } }, 'Alles verwijderen') : null));
}

function renderFileCard(f) {
  const remove = h('button', { class: 'btn', onClick: () => { state.files = state.files.filter((x) => x !== f); render(); } }, 'Verwijderen');
  if (f.busy) return h('div', { class: 'card compact filecard' }, h('div', { class: 'title' }, f.name), h('p', { class: 'muted' }, 'Bezig met inlezen…'));
  if (f.error) return h('div', { class: 'card compact filecard' }, h('div', { class: 'row between' }, h('div', { class: 'title' }, f.name), remove), h('div', { class: 'msg bad' }, f.error));
  const sheet = sheetOf(f);
  const info = [f.read.kind === 'csv' ? `CSV, ${f.read.encoding}, scheidingsteken ${f.read.delimiter === '\t' ? 'tab' : `"${f.read.delimiter}"`}` : 'Excel', `${plural(sheet.rows.length, 'rij', 'rijen')}`, `kopregel op rij ${sheet.headerRowIndex + 1}`];
  const sheetSel = f.read.sheets.length > 1 ? select(f.read.sheets.map((s, i) => [String(i), `${s.name} (${s.rows.length} rijen)`]), String(f.sheetIndex), (v) => { f.sheetIndex = Number(v); f.map = null; render(); }) : null;
  const maxCols = 14;
  return h('div', { class: 'card compact filecard' },
    h('div', { class: 'row between' },
      h('div', {}, h('div', { class: 'title' }, f.name), h('div', { class: 'muted small' }, info.join(' · '))),
      h('div', { class: 'row' }, sheetSel ? h('label', {}, 'Tabblad: ', sheetSel) : null, remove)),
    ...sheet.warnings.map((w) => h('div', { class: 'msg warn' }, w)),
    h('div', { class: 'scroll' }, table(sheet.header.slice(0, maxCols).concat(sheet.header.length > maxCols ? ['…'] : []),
      sheet.rows.slice(0, 5).map((r) => r.slice(0, maxCols).concat(sheet.header.length > maxCols ? ['…'] : [])), { className: 'grid preview' })));
}

// ------------------------------------------------------------------ 2. kolommen

function renderMapping() {
  const files = dataFiles();
  const cards = files.map((f) => {
    const sheet = sheetOf(f);
    const map = ensureMapping(f);
    const policy = comparisonPolicy({ header: sheet.header, rows: sheet.rows, mapping: map.mapping });
    const examples = (c) => { const vals = []; for (const r of sheet.rows) { const v = String(r[c] || '').trim(); if (v && !vals.includes(v)) vals.push(v); if (vals.length >= 3) break; } return vals.join(' · '); };
    const options = FIELDS.map((x) => [x.key, x.label]);
    const rows = sheet.header.map((hd, c) => [
      h('strong', {}, hd),
      h('span', { class: 'muted small' }, examples(c)),
      select(options, map.mapping[c], (v) => { map.mapping[c] = v; render(); }),
      policy.nearConstant[c] ? h('span', { class: 'badge warn' }, 'bijna overal dezelfde waarde') : '',
    ]);
    const missing = !map.mapping.includes('bedrijfsnaam') ? 'Koppel een kolom aan Bedrijfsnaam; zonder naam kan de tool niet vergelijken.' : null;
    return h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', {}, h('h3', {}, f.name), h('div', { class: 'muted small' }, plural(sheet.rows.length, 'rij', 'rijen'))),
        h('button', { class: 'btn', onClick: () => { f.map = { ...suggestMapping({ header: sheet.header, rows: sheet.rows, useProfiles: false }), sheetIndex: f.sheetIndex }; render(); } }, 'Opnieuw voorstellen')),
      map.fromProfile ? h('div', { class: 'msg info' }, 'Gekoppeld zoals bij een vorige verwerking met dezelfde kolomnamen.') : null,
      ...[...map.mappingNotes, ...policy.notes].filter((t) => !t.includes('bronprofiel')).map((t) => h('div', { class: 'msg info' }, t)),
      missing ? h('div', { class: 'msg bad' }, missing) : null,
      h('div', { class: 'scroll' }, table(['Kolom in het bestand', 'Voorbeelden', 'Gegeven', ''], rows, { className: 'grid mapping-table' })));
  });
  const ok = files.length && files.every((f) => ensureMapping(f).mapping.includes('bedrijfsnaam'));
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Stap 2. Kolommen koppelen'),
      h('p', { class: 'muted' }, 'Controleer per bestand welke kolom welk gegeven is. Meerdere telefoon- of e-mailkolommen mogen. Een kolom "Niet gebruiken" gaat wel mee als extra kolom in het resultaat. De koppeling wordt onthouden voor een volgende lijst met dezelfde kolomnamen.')),
    state.profileNotice ? h('div', { class: 'msg info' }, state.profileNotice) : null,
    ...cards,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onClick: () => { state.screen = 'files'; render(); } }, 'Terug'),
      h('button', { class: 'btn primary big', disabled: !ok, onClick: startProcessing }, 'Verwerken')));
}

// ------------------------------------------------------------------ 3. verwerken

async function startProcessing() {
  state.screen = 'processing';
  state.error = null;
  state.progress = { value: 0, label: 'Bestanden klaarzetten…' };
  state.decisions = new Map(); state.decisionLog = []; state.deferred = new Set(); state.downloads = {};
  render();
  try {
    const sources = dataFiles().map((f) => {
      const s = sheetOf(f); const map = ensureMapping(f);
      return { name: f.name, label: sourceLabel(f.name), header: s.header, rows: s.rows, rowNumbers: s.rowNumbers, originals: s.originals, columnOffset: s.columnOffset, sheetName: s.name, mapping: map.mapping, nearConstant: map.nearConstant };
    });
    rememberProfiles(dataFiles().map((f) => makeProfile(sheetOf(f).header, ensureMapping(f).mapping, sourceLabel(f.name))));
    state.prep = await prepare({
      sources, settings: SETTINGS,
      onProgress: (value, label) => { state.progress = { value, label }; const bar = document.getElementById('pbar'); const lbl = document.getElementById('plabel'); if (bar) bar.value = value; if (lbl) lbl.textContent = label; },
    });
    state.res = assemble(state.prep, state.decisions, { strengheid: state.strengheid });
    state.screen = 'review';
    state.tab = state.res.review.length ? 'twijfel' : 'samengevoegd';
  } catch (e) {
    console.error(e);
    state.error = `Er ging iets mis bij het verwerken: ${e.message || e}`;
    state.screen = 'mapping';
  }
  render();
}

function renderProcessing() {
  const bar = h('progress', { id: 'pbar', class: 'progress', max: 1, value: state.progress.value, 'aria-label': 'Voortgang vergelijken' });
  return h('div', { class: 'card' }, h('h2', {}, 'Bezig met vergelijken…'), bar, h('p', { id: 'plabel', class: 'muted' }, state.progress.label));
}

function reassemble() {
  state.res = assemble(state.prep, state.decisions, { strengheid: state.strengheid });
  state.downloads = {};
  state.error = null;
  render();
}

// ------------------------------------------------------------------ 3. controleren

function renderReview() {
  const s = state.res.summary;
  const stats = [
    ['rijen ingelezen', s.rijen, ''], ['unieke leads', s.uniekeLeads, 'accent'], ['automatisch samengevoegd', s.automatischSamengevoegd, ''],
    ['te controleren', reviewQueue().length, 'warn'],
  ];
  const tabs = [['twijfel', `Twijfelparen (${reviewQueue().length})`], ['samengevoegd', `Samengevoegd (${state.res.merged.filter((m) => m.members.length > 1).length})`], ['leads', `Alle leads (${state.res.merged.length})`], ['waarschuwingen', `Waarschuwingen (${warningCount()})`]];
  return h('div', {},
    h('div', { class: 'summary' }, stats.map(([l, v, cls]) => h('div', { class: `stat ${cls}` }, h('div', { class: 'n' }, n(v)), h('div', { class: 'l' }, l)))),
    renderStrictness(),
    h('div', { class: 'card' },
      h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: `tab${state.tab === k ? ' active' : ''}`, onClick: () => { state.tab = k; state.search = ''; render(); } }, l))),
      state.tab === 'twijfel' ? renderPairs() : state.tab === 'samengevoegd' ? renderGroups() : state.tab === 'leads' ? renderLeads() : renderWarnings()),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onClick: () => { state.screen = 'mapping'; render(); } }, 'Terug naar kolommen'),
      h('button', { class: 'btn primary big', onClick: () => { state.screen = 'export'; render(); } }, 'Volgende: exporteren')));
}

// Keuzeschakelaar voor de strengheid van de controle: vanaf hoeveel punten een paar aan de gebruiker voorgelegd wordt.
// De punten per paar en de automatische samenvoegingen veranderen niet mee; per stand staat het aantal te beoordelen paren.
function renderStrictness() {
  const cur = state.res.strengheid;
  const choose = (key) => { if (state.strengheid === key) return; state.strengheid = key; reassemble(); };
  return h('div', { class: 'card compact strictness' },
    h('div', { class: 'title' }, 'Strengheid van de controle'),
    h('div', { class: 'segmented', role: 'group', 'aria-label': 'Strengheid van de controle' },
      state.res.perStrengheid.map((nv) => h('button', {
        type: 'button', class: nv.key === cur.key ? 'active' : null, 'aria-pressed': nv.key === cur.key ? 'true' : 'false',
        title: `twijfelpaar vanaf ${nv.teControleren} punten`, onClick: () => choose(nv.key),
      }, nv.label, h('span', { class: 'count' }, n(nv.aantal))))),
    h('div', { class: 'explain' }, `${cur.uitleg} Twijfelpaar vanaf ${cur.grenzen.teControleren} punten; automatisch samenvoegen blijft vanaf ${cur.grenzen.zekerDubbel} punten of een gelijk BTW-nummer.`));
}

function reviewQueue() {
  const r = state.res.review;
  const key = (p) => pairKey(p.i, p.j);
  return [...r.filter((p) => !state.deferred.has(key(p))), ...r.filter((p) => state.deferred.has(key(p)))];
}

function applyDecision(result) {
  if (!result.ok) { state.error = result.error; render(); return; }
  state.decisions = result.decisions;
  state.res = result.res;
  state.decisionLog.push(...result.log.map((entry) => ({ ...entry, datum: nowIso() })));
  state.downloads = {};
  state.error = null;
  render();
}

function decide(p, beslissing) {
  const result = decideGroups(state.prep, state.res, p, beslissing);
  if (result.ok) state.deferred.delete(pairKey(p.i, p.j));
  applyDecision(result);
}

function defer(p) {
  const k = pairKey(p.i, p.j);
  if (state.deferred.has(k) && state.deferred.size >= reviewQueue().length) return render();
  state.deferred.add(k);
  render();
}

function renderPairs() {
  const queue = reviewQueue();
  const done = state.decisionLog.filter((d) => d.bron !== 'ontkoppelen').length;
  if (!queue.length) {
    const strenger = state.res.perStrengheid.filter((nv) => nv.aantal > 0).pop(); // de dichtstbijzijnde strengere stand met paren
    return h('div', {},
      h('div', { class: 'msg ok' }, done ? `Alle twijfelparen zijn beoordeeld (${done}). Ga verder naar exporteren.` : `Er zijn geen twijfelparen op de stand "${state.res.strengheid.label}". Ga verder naar exporteren.`),
      strenger ? h('p', { class: 'muted small' }, `Op de stand "${strenger.label}" ${strenger.aantal === 1 ? 'is er nog 1 paar' : `zijn er nog ${n(strenger.aantal)} paren`} om na te kijken.`) : null);
  }
  const p = queue[0];
  const A = state.res.groupOf(p.i), B = state.res.groupOf(p.j);
  const isDeferred = state.deferred.has(pairKey(p.i, p.j));
  const rows = pairRows(A, B, p);
  return h('div', {},
    h('div', { class: 'row between' },
      h('div', {}, h('strong', {}, `Paar ${done + 1} van ${done + queue.length}`), isDeferred ? h('span', { class: 'badge warn' }, ' uitgesteld') : null, h('span', { class: 'muted' }, ` · nog ${plural(queue.length, 'paar', 'paren')} te beoordelen`)),
      h('span', { class: 'kbdhelp' }, 'Sneltoetsen: Z = zelfde bedrijf, V = verschillend, spatie = later')),
    h('div', { class: 'reason' }, h('span', { class: 'score' }, `${p.score} punten`), p.reason, p.geblokkeerd ? h('span', { class: 'badge bad' }, ` niet automatisch samengevoegd: ${p.geblokkeerd}`) : null),
    h('div', { class: 'pair' },
      h('div', { class: 'lbl head' }, ''), h('div', { class: 'head' }, sideTitle(A)), h('div', { class: 'head' }, sideTitle(B)),
      ...rows.flatMap(([label, va, vb, hit, note]) => {
        const cls = hit === 'punten' ? 'val hit' : hit === 'gelijk' ? 'val same' : 'val';
        const title = hit === 'punten' ? 'telt mee in de punten' : hit === 'gelijk' ? 'gelijk, telt niet mee in de punten' : null;
        return [h('div', { class: 'lbl' }, label, note ? h('div', { class: 'note' }, note) : null), h('div', { class: cls, title }, va), h('div', { class: cls, title }, vb)];
      })),
    h('p', { class: 'muted small legend' }, h('span', { class: 'mark hit' }, '✓'), ' telt mee in de punten   ', h('span', { class: 'mark same' }, '='), ' gelijk, maar telt niet mee'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn ok big', onClick: () => decide(p, 'zelfde') }, 'Zelfde bedrijf', h('kbd', {}, 'Z')),
      h('button', { class: 'btn bad big', onClick: () => decide(p, 'verschillend') }, 'Verschillend', h('kbd', {}, 'V')),
      h('button', { class: 'btn big plain', onClick: () => defer(p) }, 'Later', h('kbd', {}, 'spatie'))),
    h('p', { class: 'muted small' }, 'Bij twijfel: kies "Later". Beide leads blijven dan staan, met de opmerking "Mogelijk dubbel met …" in het resultaat.'));
}

function sideTitle(g) {
  return append(h('span', {}), [h('span', { class: 'badge' }, `Nr ${g.nr}`), g.members.length > 1 ? h('span', { class: 'muted small' }, ` · groep van ${g.members.length} rijen`) : null]);
}

function adres(g) { return `${g.straat || ''} ${g.huisnummer || ''}${g.bus ? ' ' + g.bus : ''}`.trim(); }

// Per rij: 'punten' (telt mee in de score, groen vinkje), 'gelijk' (gelijk maar telt niet mee, grijs =) of niets.
function pairRows(A, B, p) {
  const m = p.matched;
  const eq = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const hasPhone = (g) => g.telefoons.some((x) => m.telefoon.includes(x));
  const hasMail = (g) => g.emails.some((x) => m.email.includes(x));
  const mailDomains = (g) => g.emails.map(emailDomain).filter(Boolean);
  const sharedMailDomain = m.domein.length > 0 && mailDomains(A).some((d) => m.domein.includes(d)) && mailDomains(B).some((d) => m.domein.includes(d));
  const webA = normalizeWebsite(A.website), webB = normalizeWebsite(B.website);
  const sameWeb = !!webA && webA === webB && m.domein.includes(webA);
  const srcs = (g) => g.members.map((r) => `${r.sourceLabel || r.sourceName} rij ${r.row}`).join('; ');
  const level = (punten, gelijk) => (punten ? 'punten' : gelijk ? 'gelijk' : false);
  return [
    ['Bedrijfsnaam', A.bedrijfsnaam, B.bedrijfsnaam, level(m.naam, eq(A.bedrijfsnaam, B.bedrijfsnaam))],
    ['Contactpersoon', A.contactpersoon, B.contactpersoon, level(m.contact, eq(A.contactpersoon, B.contactpersoon))],
    ['Telefoon', A.telefoonsDisplay.join(' / '), B.telefoonsDisplay.join(' / '), level(hasPhone(A) && hasPhone(B), false)],
    ['E-mail', A.emails.join(' / '), B.emails.join(' / '), level((hasMail(A) && hasMail(B)) || sharedMailDomain, false), !hasMail(A) && sharedMailDomain ? 'zelfde domein' : null],
    ['Website', A.website, B.website, level(sameWeb, !sameWeb && !!webA && webA === webB)],
    ['BTW', A.btwDisplay, B.btwDisplay, level(m.btw, eq(A.btwDisplay, B.btwDisplay))],
    ['Adres', adres(A), adres(B), level(m.adres, eq(adres(A), adres(B)))],
    ['Postcode', A.postcode, B.postcode, level(false, eq(A.postcode, B.postcode))],
    ['Gemeente', A.gemeente, B.gemeente, level(false, eq(A.gemeente, B.gemeente))],
    ['Sector', A.sector, B.sector, level(false, eq(A.sector, B.sector))],
    ['Bron', srcs(A), srcs(B), false],
  ];
}

function renderGroups() {
  const groups = state.res.merged.filter((g) => g.members.length > 1);
  const container = h('div', {});
  const build = () => {
    clear(container);
    const q = state.search.trim().toLowerCase();
    const list = groups.filter((g) => !q || g.members.some((r) => r.fields.bedrijfsnaam.toLowerCase().includes(q)) || g.nr === q);
    if (!list.length) container.append(h('p', { class: 'muted' }, groups.length ? 'Geen groepen gevonden voor deze zoekterm.' : 'Er zijn geen samengevoegde groepen.'));
    for (const g of list.slice(0, 300)) {
      container.append(h('div', { class: 'group' },
        h('div', { class: 'body' },
          h('div', {}, h('strong', {}, g.bedrijfsnaam), ' ', h('span', { class: 'badge' }, `Nr ${g.nr}`), g.automatisch ? '' : h('span', { class: 'badge ok' }, ' door jou samengevoegd')),
          h('ul', {}, g.members.map((r) => h('li', {}, `${r.sourceLabel || r.sourceName}, rij ${r.row}: `, h('strong', {}, r.fields.bedrijfsnaam), r.norm.phones.length ? h('span', { class: 'muted' }, ` · ${r.norm.phones.length} tel.`) : null))),
          h('div', { class: 'muted small' }, g.reden)),
        h('button', { class: 'btn', onClick: () => unlink(g) }, 'Ontkoppelen')));
    }
    if (list.length > 300) container.append(h('p', { class: 'muted' }, `… en nog ${n(list.length - 300)} groepen. Zoek om te verfijnen.`));
  };
  build();
  return h('div', {},
    h('div', { class: 'row' }, h('input', { type: 'search', placeholder: 'Zoeken op bedrijfsnaam of nummer', value: state.search, onInput: (e) => { state.search = e.target.value; build(); } })),
    container);
}

function unlink(g) {
  applyDecision(unlinkGroup(state.prep, state.res, g));
}

function renderLeads() {
  const container = h('div', { class: 'scroll' });
  const build = () => {
    clear(container);
    const q = state.search.trim().toLowerCase();
    const list = state.res.merged.filter((g) => !q || [g.bedrijfsnaam, g.contactpersoon, g.nr, ...g.emails, ...g.telefoonsDisplay, g.gemeente, ...g.members.map((r) => r.fields.bedrijfsnaam)].some((x) => String(x || '').toLowerCase().includes(q)));
    const rows = list.slice(0, 300).map((g) => [g.nr, g.bedrijfsnaam, g.telefoonsDisplay[0] || '', g.emails[0] || '', g.gemeente, String(g.members.length), g.members.map((r) => r.sourceLabel || r.sourceName).join('; '), g.mogelijkDubbel.map((x) => `${x.other.nr} ${x.other.bedrijfsnaam}`).join('; ')]);
    container.append(table(['Nr', 'Bedrijfsnaam', 'Telefoon', 'E-mail', 'Gemeente', 'Rijen', 'Bronnen', 'Mogelijk dubbel met'], rows));
    if (list.length > 300) container.append(h('p', { class: 'muted' }, `… ${n(list.length - 300)} leads niet getoond. Zoek om te verfijnen.`));
  };
  build();
  return h('div', {},
    h('div', { class: 'row' }, h('input', { type: 'search', placeholder: 'Zoeken op naam, telefoon, e-mail, gemeente of nummer', value: state.search, onInput: (e) => { state.search = e.target.value; build(); } })),
    container);
}

function warningCount() {
  return dataFiles().reduce((k, f) => k + sheetOf(f).warnings.length, 0) + state.prep.records.filter((r) => r.warnings.length).length + state.prep.skipped.length;
}

function renderWarnings() {
  const items = [];
  for (const f of dataFiles()) for (const w of sheetOf(f).warnings) items.push(h('div', { class: 'msg warn' }, `${f.name}: ${w}`));
  for (const s of state.prep.skipped) items.push(h('div', { class: 'msg info' }, `Sleutel "${s.key}" komt in ${s.n} rijen voor en wordt alleen via zekere exacte overeenkomsten vergeleken; overige combinaties zijn te algemeen.`));
  const recs = state.prep.records.filter((r) => r.warnings.length);
  if (recs.length) {
    items.push(h('h3', {}, `${plural(recs.length, 'rij', 'rijen')} met een onbruikbare waarde`));
    items.push(h('div', { class: 'scroll' }, table(['Bron', 'Rij', 'Bedrijfsnaam', 'Waarschuwing'], recs.slice(0, 300).map((r) => [r.sourceLabel || r.sourceName, String(r.row), r.fields.bedrijfsnaam, r.warnings.join('; ')]))));
  }
  return h('div', {}, items.length ? items : h('p', { class: 'muted' }, 'Geen waarschuwingen.'));
}

// ------------------------------------------------------------------ 4. exporteren

function download() {
  try {
    const ctx = { version: BUILD.version, buildDate: BUILD.date, datum: state.res.datum, verwerktOp: nowIso(), settings: SETTINGS, decisionLog: state.decisionLog };
    const wb = buildResultWorkbook(state.prep, state.res, ctx);
    const name = resultFileName(state.res.datum);
    window.XLSX.writeFile(wb, name, { bookType: 'xlsx', compression: true });
    state.downloads.result = name;
    state.error = null;
  } catch (e) {
    console.error(e);
    state.error = `Het bestand kon niet gemaakt worden: ${e.message || e}`;
  }
  render();
}

function renderExport() {
  const s = state.res.summary;
  const open = reviewQueue().length;
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Stap 4. Exporteren'),
      h('p', {}, `${plural(s.uniekeLeads, 'unieke lead', 'unieke leads')} uit ${plural(s.rijen, 'rij', 'rijen')}; ${plural(s.automatischSamengevoegd + s.samengevoegdDoorMens, 'groep', 'groepen')} samengevoegd.`),
      open ? h('div', { class: 'msg warn' }, `${plural(open, 'twijfelpaar is', 'twijfelparen zijn')} niet beoordeeld. Beide leads blijven staan, met "Mogelijk dubbel met …" erbij, en het paar staat in het tabblad "Te controleren".`) : h('div', { class: 'msg ok' }, 'Alle twijfelparen zijn beoordeeld.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary big', onClick: download }, `Download ${resultFileName(state.res.datum)}`)),
      state.downloads.result ? h('div', { class: 'msg ok' }, `${state.downloads.result} is klaar. Het tabblad "Unieke leads" bevat één rij per uniek bedrijf; daarnaast staan "Te controleren", "Beslissingen", "Logboek", "Per bron" en "Oorspronkelijke gegevens".`) : null,
      h('p', { class: 'muted small' }, 'Het bestand bevat alleen tekstwaarden, nooit formules. Het versienummer van de tool staat in het tabblad Info.')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onClick: () => { state.screen = 'review'; render(); } }, 'Terug naar controleren'),
      h('button', { class: 'btn', onClick: () => { if (confirm('Opnieuw beginnen? De huidige verwerking en beslissingen gaan verloren als je ze niet gedownload hebt.')) { state.files = []; state.prep = null; state.res = null; state.screen = 'files'; state.error = null; render(); } } }, 'Opnieuw beginnen')));
}

// ------------------------------------------------------------------ sneltoetsen en start

document.addEventListener('keydown', (e) => {
  if (state.screen !== 'review' || state.tab !== 'twijfel' || !state.res) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const queue = reviewQueue();
  if (!queue.length) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); decide(queue[0], 'zelfde'); }
  else if (k === 'v') { e.preventDefault(); decide(queue[0], 'verschillend'); }
  else if (k === ' ') { e.preventDefault(); defer(queue[0]); }
});

window.addEventListener('beforeunload', (e) => {
  if (state.res && !state.downloads.result) { e.preventDefault(); e.returnValue = ''; }
});

render();
