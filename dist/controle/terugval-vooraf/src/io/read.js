// Inlezen (stap 2): CSV en Excel openen, de kopregel zoeken, alles als tekst inlezen.
// Excel gaat via SheetJS (globalThis.XLSX): in de browser ingebakken, in Node via require in de test.
import { finishTiming } from '../engine/timing.js';
import { SETTINGS } from '../settings.js';
import { isOwnExport } from './mapping.js';
import { isScientificNotation } from '../engine/normalize.js';

function getXLSX() {
  const X = globalThis.XLSX;
  if (!X) throw new Error('De Excel-bibliotheek (SheetJS) is niet geladen.');
  return X;
}

// Tekenset herkennen: UTF-8 (ook met BOM) of anders Windows-1252.
export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length >= 2 && ((u8[0] === 0xff && u8[1] === 0xfe) || (u8[0] === 0xfe && u8[1] === 0xff))) {
    const enc = u8[0] === 0xff ? 'utf-16le' : 'utf-16be';
    return { text: new TextDecoder(enc).decode(u8), encoding: enc, bom: true };
  }
  const bom = u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(u8), encoding: 'utf-8', bom };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(u8), encoding: 'windows-1252', bom: false };
  }
}

// Scheidingsteken herkennen: ; , tab of | — het teken dat het consequentst per regel voorkomt.
export function detectDelimiter(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 25);
  let best = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const mode = modeOf(counts.filter((c) => c > 0));
    const consistent = counts.filter((c) => c === mode).length;
    const score = consistent * 1000 + total;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function countOutsideQuotes(line, d) {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

function modeOf(arr) {
  const m = new Map();
  let best = 0;
  let bestN = 0;
  for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bestN) { bestN = n; best = v; } }
  return best;
}

// CSV volgens RFC 4180: aanhalingstekens, "" als escape, CRLF/LF/CR.
export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') {
      q = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// De kopregel: de eerste rij met minstens drie gevulde cellen.
export function findHeaderRow(rows, min = 3) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].filter((c) => String(c ?? '').trim() !== '').length >= min) return i;
  }
  return rows.length ? 0 : -1;
}

// Kopregel en gegevensrijen; lege rijen worden overgeslagen.
export function tableFromRows(rows, headerRowIndex) {
  if (headerRowIndex < 0 || !rows.length) return { header: [], rows: [], rowNumbers: [], headerRowIndex: -1 };
  const rawHeader = rows[headerRowIndex].map((c) => String(c ?? '').trim());
  let last = rawHeader.length - 1;
  while (last >= 0 && rawHeader[last] === '') last--;
  // Een ontbrekende kop mag geen gevulde gegevenskolom afsnijden.
  for (const row of rows.slice(headerRowIndex + 1)) {
    for (let c = row.length - 1; c > last; c--) if (String(row[c] ?? '').trim()) { last = c; break; }
  }
  const header = Array.from({ length: last + 1 }, (_, i) => rawHeader[i] || `Kolom ${i + 1}`);
  const data = [];
  const rowNumbers = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i].slice(0, header.length).map((c) => String(c ?? ''));
    while (r.length < header.length) r.push('');
    if (r.every((c) => c.trim() === '')) continue;
    data.push(r);
    rowNumbers.push(i + 1);
  }
  return { header, rows: data, rowNumbers, headerRowIndex };
}

function cellText(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  switch (cell.t) {
    case 's': return String(cell.v);
    case 'n': {
      const v = cell.v;
      if (Number.isInteger(v) && Math.abs(v) < 1e15) {
        if (cell.w && !isScientificNotation(cell.w) && !/[.,]/.test(cell.w)) {
          const wd = cell.w.replace(/\D/g, '');
          if (wd.replace(/^0+/, '') === String(Math.abs(v))) return cell.w;
        }
        return String(v);
      }
      return cell.w !== undefined ? String(cell.w) : String(v);
    }
    case 'd': {
      const d = cell.v instanceof Date ? cell.v : new Date(cell.v);
      if (Number.isNaN(d.getTime())) return cell.w || '';
      const p = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    case 'b': return cell.v ? 'WAAR' : 'ONWAAR';
    case 'e': return '';
    default: return cell.w !== undefined ? String(cell.w) : String(cell.v);
  }
}

export function sheetToTextRows(ws) {
  const XLSX = getXLSX();
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) row.push(cellText(ws[XLSX.utils.encode_cell({ r, c })]));
    rows.push(row);
  }
  return rows;
}

// Alle tabbladen van een Excel-bestand als tekstrijen.
export function readWorkbookTables(bytes) {
  const XLSX = getXLSX();
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const wb = XLSX.read(u8, { type: 'array', cellDates: true, cellText: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const start = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s : { r: 0, c: 0 };
    return { name, rows: sheetToTextRows(ws), rowOffset: start.r, columnOffset: start.c };
  });
}

// Waarschuwingen per tabel: cellen in wetenschappelijke notatie (door Excel verminkte nummers).
export function tableWarnings(table) {
  const perCol = new Map();
  for (const r of table.rows) {
    r.forEach((v, c) => { if (v && isScientificNotation(v)) perCol.set(c, (perCol.get(c) || 0) + 1); });
  }
  const out = [];
  for (const [c, n] of perCol) {
    out.push(`${n} cel${n > 1 ? 'len' : ''} in kolom "${table.header[c]}" staan in wetenschappelijke notatie (bv. 3,2479E+10). ` +
      'Die nummers zijn al door Excel verminkt; upload de originele export.');
  }
  return out;
}

export function fileKind(name) {
  const ext = String(name).toLowerCase().split('.').pop();
  if (['csv', 'txt', 'tsv'].includes(ext)) return 'csv';
  if (['xlsx', 'xlsm', 'xls', 'xlsb', 'ods'].includes(ext)) return 'excel';
  return 'onbekend';
}

// Eén bestand (object met name en arrayBuffer()) inlezen tot tabellen per tabblad.
export async function readFile(file) {
  const started = performance.now();
  const kind = fileKind(file.name);
  if (kind === 'onbekend') throw new Error(`"${file.name}": alleen .xlsx, .xls en .csv worden ondersteund.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = { name: file.name, kind, sheets: [], encoding: null, delimiter: null, sheetNames: [] };
  let tables;
  if (kind === 'csv') {
    const dec = decodeBytes(bytes);
    result.encoding = dec.encoding + (dec.bom ? ' (met BOM)' : '');
    result.delimiter = detectDelimiter(dec.text);
    tables = [{ name: 'CSV', rows: parseCsv(dec.text, result.delimiter) }];
  } else {
    tables = readWorkbookTables(bytes);
  }
  result.sheetNames = tables.map((t) => t.name);
  for (const t of tables) {
    const headerRowIndex = findHeaderRow(t.rows);
    const table = tableFromRows(t.rows, headerRowIndex);
    result.sheets.push({
      name: t.name,
      header: table.header,
      rows: table.rows,
      rowNumbers: table.rowNumbers.map((r) => r + (t.rowOffset || 0)),
      headerRowIndex: headerRowIndex + (t.rowOffset || 0),
      columnOffset: t.columnOffset || 0,
      isEmpty: table.rows.length === 0,
      warnings: tableWarnings(table),
    });
  }
  // De herkomst reist mee als het volledige eigen resultaatbestand opnieuw geladen wordt.
  const info = result.sheets.find((s) => s.name === 'Info');
  const original = result.sheets.find((s) => s.name === 'Oorspronkelijke gegevens');
  const unique = result.sheets.find((s) => s.name === 'Unieke leads' && isOwnExport(s.header));
  if (unique && original && info?.rows.some((r) => r[0] === 'Tool' && r[1] === 'Lead-ontdubbelaar') &&
      JSON.stringify(original.header) === JSON.stringify(SETTINGS.eigenExport.oorspronkelijkeKolommen)) {
    const byLead = new Map();
    for (const [nr, id, bron, blad, rij, kolom, kop, waarde] of original.rows) {
      if (!byLead.has(nr)) byLead.set(nr, new Map());
      const origins = byLead.get(nr);
      if (!origins.has(id)) origins.set(id, { bron, blad, rij, cellen: [] });
      origins.get(id).cellen.push({ kolom, kop, waarde });
    }
    const nrCol = unique.header.indexOf('Nr');
    unique.originals = unique.rows.map((r) => [...(byLead.get(r[nrCol])?.values() || [])]);
  }
  result.defaultSheet = Math.max(0, result.sheets.findIndex((s) => !s.isEmpty));
  finishTiming('inlezen', started);
  return result;
}
