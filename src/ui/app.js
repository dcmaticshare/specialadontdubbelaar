// Het scherm: bestanden, kolommen koppelen, controleren, exporteren. De huidige sessie blijft lokaal bewaard.
import { finishTiming } from '../engine/timing.js';
import { SETTINGS } from '../settings.js';
import { h, clear, append, select, table, captureView, restoreView } from './dom.js';
import { orderedReviewPairs, deferPair, pruneDeferred } from './review.js';
import { createMappingViewCache } from './mapping.js';
import { readFile, FILE_ACCEPT } from '../io/read.js';
import { sessionSnapshot, sessionSources, restoreSession, openSessionStore } from '../io/session.js';
import { FIELDS, suggestMapping, changeMapping, makeProfile, readProfiles, saveProfiles } from '../io/mapping.js';
import { prepare, assemble, sourceLabel, pairKey, decideGroups, unlinkGroup } from '../engine/pipeline.js';
import { buildResultWorkbook, resultFileName } from '../io/write.js';
import { nowIso } from '../engine/text.js';
import { normalizeWebsite, emailDomain } from '../engine/normalize.js';

const BUILD = (typeof window !== 'undefined' && window.__LO_BUILD__) || { version: 'dev', date: '' };
const STEPS = [['files', 'Bestanden'], ['mapping', 'Kolommen'], ['review', 'Controleren'], ['export', 'Exporteren']];

function initialState() { return {
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
  downloads: {},
  exporting: false,
  profileNotice: '',
}; }
const state = initialState();
const mappingView = createMappingViewCache();
let nextFileId = 1;
const root = document.getElementById('app');
let sessionStore = null, sessionReady = false, sessionBlocked = false, sessionConflict = false, resetting = false;
let savedMeta = '', savedSources = [], pendingSave = null, saving = null;
let sessionMessage = 'Bewaarde sessie zoeken…', sessionWarning = '', allowLeave = false;
let unexpectedFailure = false, renderFailed = false;

// Een onverwachte fout kan een half uitgevoerde wijziging achterlaten. Tot herladen
// blijven bediening en nieuwe opslag geblokkeerd; foutdetails blijven in de browserconsole.
function unexpectedError(duringRender = false) {
  unexpectedFailure = true;
  renderFailed ||= duringRender;
  pendingSave = null;
  render();
}

function reloadSession() { allowLeave = true; location.reload(); }

function renderEmergency() {
  // Onafhankelijk van de normale schermhelpers en afgeleide gegevens, zonder HTML-invoer.
  const main = document.createElement('main');
  main.id = 'main';
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = state.error;
  const explanation = document.createElement('p');
  explanation.textContent = 'Automatisch bewaren is gestopt. Herlaad de laatst bewaarde sessie; de laatste handeling is mogelijk niet bewaard.';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Sessie herladen';
  reload.addEventListener('click', reloadSession);
  main.append(message, explanation, reload);
  root.replaceChildren(main);
  reload.focus();
}

// ------------------------------------------------------------------ sessieherstel

function currentSources() { return dataFiles().map((f) => ({ id: f.id, read: f.read, sheetIndex: f.sheetIndex })); }
function sameSources(a, b) { return a.length === b.length && a.every((s, i) => s.id === b[i].id && s.read === b[i].read && s.sheetIndex === b[i].sheetIndex); }
function updateSessionStatus() {
  const status = document.getElementById('session-status');
  if (status) status.textContent = sessionMessage;
  const notice = document.getElementById('session-warning');
  if (notice) { notice.textContent = sessionWarning; notice.classList.toggle('hidden', !sessionWarning); }
  const retry = document.getElementById('session-retry');
  if (retry) retry.classList.toggle('hidden', !sessionWarning || !sessionStore || sessionBlocked || sessionConflict || unexpectedFailure);
}

function storageFailure(error) {
  if (unexpectedFailure) return;
  sessionMessage = 'Wijzigingen niet bewaard';
  if (error?.message === 'SESSIE_CONFLICT') {
    sessionConflict = true;
    sessionWarning = 'Deze sessie is gewijzigd in een ander tabblad. Herlaad de sessie om daar verder te gaan; dit tabblad kan de nieuwere voortgang niet overschrijven.';
    render();
  } else {
    sessionWarning = 'De browser kan de sessie niet bewaren (opslag vol of niet beschikbaar). Laat dit venster open en download je resultaat voordat je sluit. De laatste geslaagde opslag blijft behouden.';
  }
  updateSessionStatus();
}

function saveSession() {
  if (!sessionReady || sessionBlocked || sessionConflict || resetting || unexpectedFailure) return;
  if (!sessionStore) return;
  const meta = JSON.stringify(sessionSnapshot(state)), sources = currentSources();
  if (meta === savedMeta && sameSources(sources, savedSources) && !saving) return;
  pendingSave = { meta, sources };
  sessionMessage = 'Sessie bewaren…';
  updateSessionStatus();
  if (saving) return;
  // Geen uitgestelde timer: iedere afgeronde keuze begint meteen aan haar transactie.
  saving = (async () => {
    while (pendingSave) {
      const next = pendingSave; pendingSave = null;
      try {
        await sessionStore.write(JSON.parse(next.meta), sameSources(next.sources, savedSources) ? undefined : sessionSources(next.sources));
        savedMeta = next.meta; savedSources = next.sources;
        if (unexpectedFailure) return; // Een al gestarte geldige transactie mag de foutmelding niet wissen.
        sessionWarning = '';
      } catch (error) {
        pendingSave = null;
        storageFailure(error);
        return;
      }
    }
    sessionMessage = state.files.some((f) => f.busy) ? 'Bestanden worden nog ingelezen…' : 'Sessie lokaal bewaard';
    updateSessionStatus();
  })().finally(() => { saving = null; });
}

function invalidateResult() {
  // Alle bron- en koppelwijzigingen gaan vóór hun mutatie langs deze bewaking.
  // Daardoor bestaat prep alleen zolang de invoer van de vergelijking ongewijzigd is.
  const choices = state.decisionLog.length || state.decisions.size;
  if ((choices || state.deferred.size) && !window.confirm(
    `Deze wijziging wist ${plural(choices, 'beoordeling of ontkoppeling', 'beoordelingen of ontkoppelingen')} en ${plural(state.deferred.size, 'uitgesteld paar', 'uitgestelde paren')}. Je moet daarna opnieuw verwerken. Download eerst je resultaat als je het wilt bewaren. Doorgaan?`
  )) return false;
  state.prep = null; state.res = null; state.decisions = new Map(); state.decisionLog = []; state.deferred = new Set(); state.downloads = {};
  return true;
}

async function newSession() {
  if (!sessionReady || resetting || sessionConflict || unexpectedFailure || (!sessionBlocked && state.screen === 'processing') || state.exporting || state.files.some((f) => f.busy)) return;
  if (!confirm('Nieuwe sessie starten? Alle geladen lijsten, beoordelingen en uitgestelde paren van deze sessie worden gewist, ook uit de lokale opslag. Download eerst je resultaat als je het wilt bewaren. Je onthouden kolomkoppelingen blijven beschikbaar.')) return;
  resetting = true;
  render();
  if (unexpectedFailure) { resetting = false; return; }
  try {
    if (saving) await saving;
    if (sessionConflict) throw new Error('SESSIE_CONFLICT');
    if (!sessionStore) {
      sessionStore = await openSessionStore(window.indexedDB, location.href);
      await sessionStore.read();
    }
    if (unexpectedFailure) { resetting = false; return; }
    await sessionStore.write(null);
    Object.assign(state, initialState()); nextFileId = 1;
    savedMeta = JSON.stringify(sessionSnapshot(state)); savedSources = []; pendingSave = null;
    sessionBlocked = false; sessionWarning = ''; sessionMessage = 'Nieuwe sessie · voortgang wordt automatisch bewaard';
  } catch (error) {
    storageFailure(error);
    if (!sessionConflict) sessionWarning = 'De bewaarde sessie kon niet worden gewist. Je huidige gegevens blijven staan. Probeer Nieuwe sessie opnieuw zodra browseropslag beschikbaar is.';
  }
  resetting = false;
  render();
}

async function initialize() {
  render();
  let saved;
  try {
    sessionStore = await openSessionStore(window.indexedDB, location.href);
    saved = await sessionStore.read();
  } catch (error) {
    sessionStore?.close(); sessionStore = null;
    storageFailure(error);
  }
  if (saved?.snapshot) {
    try {
      const restored = restoreSession(saved.snapshot, saved.sources);
      Object.assign(state, restored);
      nextFileId = state.files.reduce((n, f) => Math.max(n, f.id + 1), 1);
      // Ook teruggekeerde bestands- en kolomschermen kunnen een geldige verwerking bevatten.
      if (['processing', 'review', 'export'].includes(state.screen) || saved.snapshot.datum) {
        const target = state.screen;
        state.screen = 'processing'; sessionMessage = 'Sessie herstellen…'; render();
        state.prep = await prepare({ sources: processingSources(), settings: SETTINGS, onProgress: processingProgress });
        state.res = assemble(state.prep, state.decisions, { strengheid: state.strengheid, ...(saved.snapshot.datum ? { datum: saved.snapshot.datum } : {}) });
        pruneDeferred(state.res.review, state.deferred);
        state.screen = target === 'processing' ? 'review' : target;
      }
      sessionMessage = 'Sessie hersteld · lokaal bewaard';
    } catch {
      sessionBlocked = true;
      sessionMessage = 'Sessie niet hersteld';
      sessionWarning = 'De bewaarde sessie is beschadigd of niet geschikt voor deze versie. Ze is niet overschreven. Open de vorige versie op dezelfde plaats, of kies Nieuwe sessie om ze bewust te wissen.';
    }
  } else if (sessionStore) sessionMessage = 'Voortgang wordt automatisch lokaal bewaard';
  // Een hervatte vergelijking kan nu klaar zijn; bewaar die nieuwe stap en datum ook.
  savedMeta = JSON.stringify(saved?.snapshot || sessionSnapshot(state)); savedSources = currentSources();
  // Ook oude herstelpunten met alle tabbladen worden na geslaagd herstel eenmaal compact opgeslagen.
  if (!sessionBlocked && savedSources.some((f) => f.read.sheets.some((s, i) => s !== null && i !== f.sheetIndex))) savedSources = [];
  sessionReady = true;
  render();
}

function renderSessionBar() {
  return h('div', { class: 'session-bar' },
    h('div', { class: 'row between' },
      h('span', { id: 'session-status', role: 'status', 'aria-live': 'polite' }, sessionMessage),
      h('div', { class: 'row' },
        h('button', { id: 'session-retry', class: `btn${!sessionWarning || !sessionStore || sessionBlocked || sessionConflict || unexpectedFailure ? ' hidden' : ''}`, onClick: saveSession }, 'Opnieuw bewaren'),
        sessionConflict || unexpectedFailure ? h('button', { class: 'btn', 'data-focus': 'sessie-herladen', onClick: reloadSession }, 'Sessie herladen') : null,
        h('button', { class: 'btn', 'data-focus': 'nieuwe-sessie', disabled: !sessionReady || resetting || sessionConflict || unexpectedFailure || (!sessionBlocked && state.screen === 'processing') || state.exporting || state.files.some((f) => f.busy), onClick: newSession }, 'Nieuwe sessie'))),
    h('p', { id: 'session-warning', class: `msg warn${sessionWarning ? '' : ' hidden'}`, role: 'alert' }, sessionWarning));
}

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
    if (!saveProfiles(localStorage, profiles)) state.profileNotice = readProfiles(localStorage).notice || 'De browser kan de bronprofielen niet bewaren.';
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
  if (unexpectedFailure) {
    // Lopende asynchrone taken mogen de fouttoestand niet terug als geslaagd tonen.
    state.error = 'Er trad een onverwachte fout op. Herlaad de sessie om verder te gaan.';
    sessionMessage = 'Automatisch bewaren gestopt';
    sessionWarning = 'De laatst bewaarde sessie blijft beschikbaar. De laatste handeling is mogelijk niet bewaard.';
  }
  if (renderFailed) { renderEmergency(); return; }
  try {
    const view = root.dataset.screen === state.screen ? captureView(root) : null;
    clear(root);
    root.append(renderTopbar(), h('main', { id: 'main', tabindex: -1 }, renderSessionBar(),
      state.error ? h('div', { class: 'msg bad', role: 'alert' }, state.error) : null,
      h('div', { inert: sessionConflict || resetting || unexpectedFailure }, renderSteps(),
        sessionBlocked || unexpectedFailure ? null : !sessionReady || resetting ? h('div', { class: 'card' }, sessionMessage) : renderScreen())), renderFooter());
    root.dataset.screen = state.screen;
    restoreView(root, view);
    if (unexpectedFailure) root.querySelector('[data-focus="sessie-herladen"]').focus();
    saveSession();
  } catch (error) {
    console.error('Onverwachte fout bij schermopbouw:', error);
    unexpectedError(true);
  }
}

function renderTopbar() {
  return h('header', { class: 'topbar' },
    h('div', { class: 'inner' },
      h('div', { class: 'brand' },
        h('span', { class: 'brand-logo', role: 'img', 'aria-label': 'Special ad — communicate with a smile' }),
        h('h1', {}, 'Lead-ontdubbelaar'))));
}

function renderSteps() {
  const idx = STEPS.findIndex(([k]) => k === state.screen || (state.screen === 'processing' && k === 'review'));
  return h('nav', { class: 'stepper', 'aria-label': 'Voortgang' },
    h('ol', {}, STEPS.map(([k, l], i) => h('li', {
      class: `step${i === idx ? ' active' : i < idx ? ' done' : ''}`, 'aria-current': i === idx ? 'step' : null,
    }, h('span', { class: 'step-number', 'aria-hidden': 'true' }, i < idx ? '✓' : String(i + 1)),
    h('span', {}, h('span', { class: 'sr-only' }, `Stap ${i + 1}. `), l)))));
}

// Kleine vaste pictogrammen, zonder externe iconenset of HTML uit ingelezen bestanden.
function icon(name) {
  const paths = {
    upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 15v5h16v-5'],
    arrow: ['M4 12h16', 'm14 6 6 6-6 6'],
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'icon' })) svg.setAttribute(key, value);
  for (const d of paths[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); svg.append(path);
  }
  return svg;
}

function renderFooter() {
  return h('footer', { class: 'footer' },
    h('div', { class: 'row between' },
      h('span', { class: 'footer-brand' }, 'special ad', h('span', {}, ' · Samen vooruit.')),
      h('span', {}, `Lead-ontdubbelaar ${BUILD.version}${BUILD.date ? ` · ${BUILD.date}` : ''}`)));
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
  if (!list.length || !invalidateResult()) return;
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
  const input = h('input', { type: 'file', multiple: true, accept: FILE_ACCEPT, class: 'hidden', onChange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
  const dz = h('div', {
    class: 'dropzone', 'data-focus': 'bestanden-kiezen', tabindex: 0, role: 'button', 'aria-label': 'Bestanden kiezen of hierheen slepen',
    onClick: () => input.click(),
    onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
    onDragover: (e) => { e.preventDefault(); dz.classList.add('over'); },
    onDragleave: () => dz.classList.remove('over'),
    onDrop: (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); },
  },
  h('span', { class: 'upload-icon' }, icon('upload')),
  h('strong', {}, 'Sleep hier de lijsten die je wilt ontdubbelen'),
  h('p', { class: 'muted' }, 'Eén lijst of meerdere tegelijk. Excel en CSV zijn welkom.'),
  h('span', { class: 'choose-files' }, 'Bestanden kiezen', icon('arrow')), input);

  const ready = dataFiles().length > 0 && !state.files.some((f) => f.busy);
  return h('div', {},
    h('div', { class: 'card upload-card' },
      h('div', { class: 'row between upload-heading' },
        h('div', {}, h('h2', {}, 'Stap 1. Bestanden'), h('p', { class: 'muted' }, 'Voeg de lijsten toe die je wilt samenbrengen.')),
        h('span', { class: 'badge' }, 'Excel & CSV')),
      dz),
    h('div', { class: 'filelist' }, state.files.map(renderFileCard)),
    h('div', { class: 'actions file-actions' },
      h('p', { class: 'muted small' }, state.files.length ? 'Alle lijsten worden onderling én binnen zichzelf vergeleken.' : 'Voeg een lijst toe om naar de volgende stap te gaan.'),
      h('button', { class: 'btn primary big', disabled: !ready, onClick: () => { state.screen = 'mapping'; state.error = null; render(); } }, 'Volgende: kolommen koppelen'),
      state.files.length ? h('button', { class: 'btn', disabled: state.files.some((f) => f.busy), onClick: newSession }, 'Alles verwijderen') : null));
}

function renderFileCard(f) {
  const remove = h('button', { class: 'btn', 'data-focus': `verwijderen-${f.id}`, onClick: () => { if (!invalidateResult()) return; state.files = state.files.filter((x) => x !== f); render(); } }, 'Verwijderen');
  if (f.busy) return h('div', { class: 'card compact filecard' }, h('div', { class: 'title' }, f.name), h('p', { class: 'muted' }, 'Bezig met inlezen…'));
  if (f.error) return h('div', { class: 'card compact filecard' }, h('div', { class: 'row between' }, h('div', { class: 'title' }, f.name), remove), h('div', { class: 'msg bad' }, f.error));
  const sheet = sheetOf(f);
  const info = [f.read.kind === 'csv' ? `CSV, ${f.read.encoding}, scheidingsteken ${f.read.delimiter === '\t' ? 'tab' : `"${f.read.delimiter}"`}` : 'Excel', `${plural(sheet.rows.length, 'rij', 'rijen')}`, `kopregel op rij ${sheet.headerRowIndex + 1}`];
  const sheetSel = f.read.sheets.length > 1 ? select(f.read.sheets.map((s, i) => [String(i), s ? `${s.name} (${s.rows.length} rijen)` : `${f.read.sheetNames[i]} (opnieuw laden)`]), String(f.sheetIndex), (v) => {
    if (f.read.sheets[Number(v)] && f.sheetIndex !== Number(v) && invalidateResult()) { f.sheetIndex = Number(v); f.map = null; }
    render();
  }, { 'data-focus': `tabblad-${f.id}` }) : null;
  if (sheetSel) for (const option of sheetSel.options) option.disabled = !f.read.sheets[Number(option.value)];
  const maxCols = 14;
  return h('div', { class: 'card compact filecard' },
    h('div', { class: 'row between' },
      h('div', {}, h('div', { class: 'title' }, f.name), h('div', { class: 'muted small' }, info.join(' · '))),
      h('div', { class: 'row' }, sheetSel ? h('label', {}, 'Tabblad: ', sheetSel) : null, remove)),
    f.read.sheets.includes(null) ? h('p', { class: 'msg info' }, 'Alleen het gekozen tabblad is in de sessie bewaard. Om een ander tabblad te kiezen: verwijder dit bestand en voeg het opnieuw toe.') : null,
    ...sheet.warnings.map((w) => h('div', { class: 'msg warn' }, w)),
    h('div', { class: 'scroll', 'data-scroll': `bestand-${f.id}-${f.sheetIndex}` }, table(sheet.header.slice(0, maxCols).concat(sheet.header.length > maxCols ? ['…'] : []),
      sheet.rows.slice(0, 5).map((r) => r.slice(0, maxCols).concat(sheet.header.length > maxCols ? ['…'] : [])), { className: 'grid preview' })));
}

// ------------------------------------------------------------------ 2. kolommen

function renderMapping() {
  const started = performance.now();
  const files = dataFiles();
  const cards = files.map((f) => {
    const sheet = sheetOf(f);
    const map = ensureMapping(f);
    const { policy, examples, standard } = mappingView(sheet, map.mapping);
    const customized = map.mapping.some((value, c) => value !== standard.mapping[c]);
    const options = FIELDS.map((x) => [x.key, x.label]);
    const rows = sheet.header.map((hd, c) => [
      h('strong', {}, hd),
      h('span', { class: 'muted small' }, examples[c]),
      select(options, map.mapping[c], (v) => {
        if (map.mapping[c] !== v && invalidateResult()) Object.assign(map, changeMapping(sheet.header, map.mapping, c, v));
        render();
      }, { 'data-focus': `mapping-${f.id}-${f.sheetIndex}-${c}`, 'aria-label': `Gegeven voor kolom ${c + 1}: ${hd}` }),
      policy.nearConstant[c] ? h('span', { class: 'badge warn' }, 'bijna overal dezelfde waarde') : '',
    ]);
    const missing = !map.mapping.includes('bedrijfsnaam') ? 'Koppel een kolom aan Bedrijfsnaam; zonder naam kan de tool niet vergelijken.' : null;
    return h('div', { class: 'card' },
      h('div', { class: 'row between' },
        h('div', {}, h('h3', {}, f.name), h('div', { class: 'muted small' }, plural(sheet.rows.length, 'rij', 'rijen'))),
        customized ? h('button', { class: 'btn', 'data-focus': `voorstellen-${f.id}-${f.sheetIndex}`, onClick: () => {
          if (invalidateResult()) f.map = { ...standard, mapping: [...standard.mapping], sheetIndex: f.sheetIndex };
          render();
        } }, 'Terug naar standaard') : null),
      map.fromProfile ? h('div', { class: 'msg info' }, 'Gekoppeld zoals bij een vorige verwerking met dezelfde kolomnamen.') : null,
      ...map.mappingNotes.filter((t) => !t.includes('bronprofiel')).map((t) => h('div', { class: 'msg info', role: 'status' }, t)),
      ...policy.notes.map((t) => h('div', { class: 'msg info' }, t)),
      missing ? h('div', { class: 'msg bad' }, missing) : null,
      h('div', { class: 'scroll', 'data-scroll': `mapping-${f.id}-${f.sheetIndex}` }, table(['Kolom in het bestand', 'Voorbeelden', 'Gegeven', ''], rows, { className: 'grid mapping-table' })));
  });
  const ok = files.length && files.every((f) => ensureMapping(f).mapping.includes('bedrijfsnaam'));
  finishTiming('koppelen', started);
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Stap 2. Kolommen koppelen'),
      h('p', { class: 'muted' }, 'Controleer per bestand welke kolom welk gegeven is. Meerdere telefoon- of e-mailkolommen mogen. Een kolom "Niet gebruiken" gaat wel mee als extra kolom in het resultaat. De koppeling wordt onthouden voor een volgende lijst met dezelfde kolomnamen.')),
    state.profileNotice ? h('div', { class: 'msg info' }, state.profileNotice) : null,
    ...cards,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onClick: () => { state.screen = 'files'; render(); } }, 'Terug'),
      h('button', { class: 'btn primary big', disabled: !ok, onClick: startProcessing }, state.prep && state.res ? 'Verder zonder opnieuw te verwerken' : 'Verwerken')));
}

// ------------------------------------------------------------------ 3. verwerken

function processingSources() {
  return dataFiles().map((f) => {
    const s = sheetOf(f); const map = ensureMapping(f);
    return { name: f.name, label: sourceLabel(f.name), header: s.header, rows: s.rows, rowNumbers: s.rowNumbers, originals: s.originals, columnOffset: s.columnOffset, sheetName: s.name, mapping: map.mapping, nearConstant: map.nearConstant };
  });
}

function processingProgress(value, label) {
  state.progress = { value, label };
  const bar = document.getElementById('pbar'), lbl = document.getElementById('plabel');
  if (bar) bar.value = value;
  if (lbl) lbl.textContent = label;
}

async function startProcessing() {
  if (state.prep && state.res) { state.screen = 'review'; state.error = null; render(); return; }
  if (!invalidateResult()) return;
  state.screen = 'processing';
  state.error = null;
  state.progress = { value: 0, label: 'Bestanden klaarzetten…' };
  render();
  try {
    const sources = processingSources();
    rememberProfiles(dataFiles().map((f) => makeProfile(sheetOf(f).header, ensureMapping(f).mapping, sourceLabel(f.name))));
    state.prep = await prepare({
      sources, settings: SETTINGS,
      onProgress: processingProgress,
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
  state.res = assemble(state.prep, state.decisions, { strengheid: state.strengheid, datum: state.res.datum });
  pruneDeferred(state.res.review, state.deferred);
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
      h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { 'data-focus': `tab-${k}`, class: `tab${state.tab === k ? ' active' : ''}`, onClick: () => { state.tab = k; state.search = ''; render(); } }, l))),
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
        type: 'button', 'data-focus': `strengheid-${nv.key}`, class: nv.key === cur.key ? 'active' : null, 'aria-pressed': nv.key === cur.key ? 'true' : 'false',
        title: `twijfelpaar vanaf ${nv.teControleren} punten`, onClick: () => choose(nv.key),
      }, nv.label, h('span', { class: 'count' }, n(nv.aantal))))),
    h('div', { class: 'explain' }, `${cur.uitleg} Twijfelpaar vanaf ${cur.grenzen.teControleren} punten; automatisch samenvoegen blijft vanaf ${cur.grenzen.zekerDubbel} punten of een gelijk BTW-nummer.`));
}

function reviewQueue() {
  return orderedReviewPairs(state.res.review, state.deferred);
}

function applyDecision(result) {
  if (!result.ok) { state.error = result.error; render(); return; }
  state.decisions = result.decisions;
  state.res = result.res;
  pruneDeferred(state.res.review, state.deferred);
  state.decisionLog.push(...result.log.map((entry) => ({ ...entry, datum: nowIso() })));
  state.downloads = {};
  state.error = null;
  render();
}

function decide(p, beslissing) {
  const count = state.res.groupOf(p.i).memberIdx.length + state.res.groupOf(p.j).memberIdx.length;
  if (!confirmGroupAction(count, `Deze keuze geldt voor alle ${n(count)} rijen in de twee groepen. Doorgaan?`)) return;
  const result = decideGroups(state.prep, state.res, p, beslissing);
  applyDecision(result);
}

function defer(p) {
  deferPair(state.deferred, p);
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
      h('button', { class: 'btn ok big', 'data-focus': 'zelfde', onClick: () => decide(p, 'zelfde') }, 'Zelfde bedrijf', h('kbd', {}, 'Z')),
      h('button', { class: 'btn bad big', 'data-focus': 'verschillend', onClick: () => decide(p, 'verschillend') }, 'Verschillend', h('kbd', {}, 'V')),
      h('button', { class: 'btn big plain', 'data-focus': 'later', onClick: () => defer(p) }, 'Later', h('kbd', {}, 'spatie'))),
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
    for (const g of list.slice(0, SETTINGS.scherm.maxLijstRijen)) {
      container.append(h('div', { class: 'group' },
        h('div', { class: 'body' },
          h('div', {}, h('strong', {}, g.bedrijfsnaam), ' ', h('span', { class: 'badge' }, `Nr ${g.nr}`), g.automatisch ? '' : h('span', { class: 'badge ok' }, ' door jou samengevoegd')),
          h('ul', {}, g.members.map((r) => h('li', {}, `${r.sourceLabel || r.sourceName}, rij ${r.row}: `, h('strong', {}, r.fields.bedrijfsnaam), r.norm.phones.length ? h('span', { class: 'muted' }, ` · ${r.norm.phones.length} tel.`) : null))),
          h('div', { class: 'muted small' }, g.reden)),
        h('button', { class: 'btn', onClick: () => unlink(g) }, 'Ontkoppelen')));
    }
    if (list.length > SETTINGS.scherm.maxLijstRijen) container.append(h('p', { class: 'muted' }, `… en nog ${n(list.length - SETTINGS.scherm.maxLijstRijen)} groepen. Zoek om te verfijnen.`));
  };
  build();
  return h('div', {},
    h('div', { class: 'row' }, h('input', { type: 'search', 'data-focus': 'groepen-zoeken', placeholder: 'Zoeken op bedrijfsnaam of nummer', value: state.search, onInput: (e) => { state.search = e.target.value; build(); saveSession(); } })),
    container);
}

function unlink(g) {
  if (!confirmGroupAction(g.memberIdx.length, `Alle ${n(g.memberIdx.length)} rijen in deze groep worden onderling gescheiden. Ontkoppelen?`)) return;
  applyDecision(unlinkGroup(state.prep, state.res, g));
}

function confirmGroupAction(count, message) {
  if (count > SETTINGS.groepsbesluiten.maxLeden) {
    state.error = `Deze groep of groepskeuze bevat te veel rijen. Maximaal ${n(SETTINGS.groepsbesluiten.maxLeden)} rijen per keuze.`;
    render(); return false;
  }
  return count < SETTINGS.groepsbesluiten.bevestigVanaf || window.confirm(message);
}

function renderLeads() {
  const container = h('div', { class: 'scroll', 'data-scroll': 'leads' });
  const build = () => {
    clear(container);
    const q = state.search.trim().toLowerCase();
    const list = state.res.merged.filter((g) => !q || [g.bedrijfsnaam, g.contactpersoon, g.nr, ...g.emails, ...g.telefoonsDisplay, g.gemeente, ...g.members.map((r) => r.fields.bedrijfsnaam)].some((x) => String(x || '').toLowerCase().includes(q)));
    const rows = list.slice(0, SETTINGS.scherm.maxLijstRijen).map((g) => [g.nr, g.bedrijfsnaam, g.telefoonsDisplay[0] || '', g.emails[0] || '', g.gemeente, String(g.members.length), g.members.map((r) => r.sourceLabel || r.sourceName).join('; '), g.mogelijkDubbel.map((x) => `${x.other.nr} ${x.other.bedrijfsnaam}`).join('; ')]);
    container.append(table(['Nr', 'Bedrijfsnaam', 'Telefoon', 'E-mail', 'Gemeente', 'Rijen', 'Bronnen', 'Mogelijk dubbel met'], rows));
    if (list.length > SETTINGS.scherm.maxLijstRijen) container.append(h('p', { class: 'muted' }, `… ${n(list.length - SETTINGS.scherm.maxLijstRijen)} leads niet getoond. Zoek om te verfijnen.`));
  };
  build();
  return h('div', {},
    h('div', { class: 'row' }, h('input', { type: 'search', 'data-focus': 'leads-zoeken', placeholder: 'Zoeken op naam, telefoon, e-mail, gemeente of nummer', value: state.search, onInput: (e) => { state.search = e.target.value; build(); saveSession(); } })),
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
    items.push(h('h3', {}, `${plural(recs.length, 'rij', 'rijen')} met waarschuwingen`));
    if (recs.length > SETTINGS.scherm.maxLijstRijen) items.push(h('p', { class: 'muted' }, `Eerste ${n(SETTINGS.scherm.maxLijstRijen)} van ${n(recs.length)} rijen met waarschuwingen. Alle waarschuwingen staan in het tabblad Logboek van het resultaatbestand.`));
    items.push(h('div', { class: 'scroll', 'data-scroll': 'waarschuwingen' }, table(['Bron', 'Rij', 'Bedrijfsnaam', 'Waarschuwing'], recs.slice(0, SETTINGS.scherm.maxLijstRijen).map((r) => [r.sourceLabel || r.sourceName, String(r.row), r.fields.bedrijfsnaam, r.warnings.join('; ')]))));
  }
  return h('div', {}, items.length ? items : h('p', { class: 'muted' }, 'Geen waarschuwingen.'));
}

// ------------------------------------------------------------------ 4. exporteren

async function download() {
  if (state.exporting) return;
  state.exporting = true;
  render();
  try {
    await new Promise((resolve) => setTimeout(resolve, SETTINGS.verwerking.schermPauzeMs));
    const ctx = { version: BUILD.version, buildDate: BUILD.date, datum: state.res.datum, verwerktOp: nowIso(), settings: SETTINGS, decisionLog: state.decisionLog };
    const wb = buildResultWorkbook(state.prep, state.res, ctx);
    const name = resultFileName(state.res.datum);
    // Werkmap maken en comprimeren zijn afzonderlijke taken; het scherm krijgt ertussen tijd.
    await new Promise((resolve) => setTimeout(resolve, SETTINGS.verwerking.schermPauzeMs));
    const started = performance.now();
    window.XLSX.writeFile(wb, name, { bookType: 'xlsx', compression: true });
    finishTiming('serialiseren', started);
    state.downloads.result = name;
    state.error = null;
  } catch (e) {
    console.error(e);
    state.error = `Het bestand kon niet gemaakt worden: ${e.message || e}`;
  }
  state.exporting = false;
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
        h('button', { class: 'btn primary big', disabled: state.exporting, onClick: download }, state.exporting ? 'Bestand maken…' : `Download ${resultFileName(state.res.datum)}`)),
      state.downloads.result ? h('div', { class: 'msg ok' }, `${state.downloads.result} is klaar. Het tabblad "Unieke leads" bevat één rij per uniek bedrijf; daarnaast staan "Te controleren", "Beslissingen", "Logboek", "Per bron" en "Oorspronkelijke gegevens".`) : null,
      h('p', { class: 'muted small' }, 'Het bestand bevat alleen tekstwaarden, nooit formules. Het versienummer van de tool staat in het tabblad Info.')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', disabled: state.exporting, onClick: () => { state.screen = 'review'; render(); } }, 'Terug naar controleren')));
}

// ------------------------------------------------------------------ sneltoetsen en start

document.addEventListener('keydown', (e) => {
  if (!sessionReady || sessionBlocked || sessionConflict || resetting || unexpectedFailure) return;
  if (state.screen !== 'review' || state.tab !== 'twijfel' || !state.res) return;
  const t = e.target;
  // Ook geneste inhoud hoort bij de eigen toetsenbordbediening van het interactieve element.
  if (t && (t.isContentEditable || t.closest?.('input, select, textarea, button, a, [role="button"], [role="tab"]'))) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const queue = reviewQueue();
  if (!queue.length) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); decide(queue[0], 'zelfde'); }
  else if (k === 'v') { e.preventDefault(); decide(queue[0], 'verschillend'); }
  else if (k === ' ') { e.preventDefault(); defer(queue[0]); }
});

window.addEventListener('beforeunload', (e) => {
  if (!allowLeave && (saving || state.files.some((f) => f.busy) || (state.files.length && sessionWarning && !state.downloads.result))) { e.preventDefault(); e.returnValue = ''; }
});

// Registreer vóór initialize(), zodat ook onverwachte opstartfouten zichtbaar worden.
window.addEventListener('error', () => unexpectedError());
window.addEventListener('unhandledrejection', () => unexpectedError());

initialize();
